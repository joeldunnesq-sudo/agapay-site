import { inspectStorage, exportRow, csvForRows, quoted, PortabilityError, POLICY_VERSION, MAX_EXPORT_BYTES, MAX_TABLE_ROWS } from './catalog.js';
import { createZip, sha256, utf8 } from './archive.js';
import { collectLegacyRecords } from './legacy.js';
import { collectAccountingRecords } from './accounting.js';
import { rawStorageEnv, inventoryParishObjects, canonicalBinding, FINANCIAL_BINDINGS, fileBucket, objectOwnership } from './storage.js';
import { storageGuardsEnabled } from './suppression.js';

const FILE_COLUMNS = {
  directory_media_assets: ['DIRECTORY_MEDIA', 'original_object_key'],
  directory_media_variants: ['DIRECTORY_MEDIA', 'r2_object_key'],
  directory_ministries: ['GROUP_MESSAGE_ASSETS', 'image_storage_key'],
  parish_library_resources: ['PARISH_LIBRARY_ASSETS', 'object_key'],
  sacrament_preparation_documents: ['SACRAMENT_DOCUMENTS', 'storage_key'],
  koinonia_exchange_photos: ['GROUP_MESSAGE_ASSETS', 'storage_key'],
  tax_exemption_documents: ['TAX_EXEMPTION_DOCS', 'storage_key'],
  nonprofit_pricing_documents: ['NONPROFIT_PRICING_DOCS', 'storage_key'],
  giving_statements: ['GIVING_STATEMENTS', 'storage_key'],
};
function assetUrl(value, base) {
  if (!value || !base) return null;
  try {
    const url = new URL(value), root = new URL(base);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname.replace(/\/$/, '') + '/')) return null;
    const key = decodeURIComponent(url.pathname.slice(root.pathname.replace(/\/$/, '').length + 1));
    return key && !key.split('/').some(p => p === '..' || p === '.') ? key : null;
  } catch { return null; }
}

export async function collectParishExport(env, parishId) {
  env = rawStorageEnv(env);
  const startedAt = new Date().toISOString();
  const inventory = await inspectStorage(env.AGAPAY_DB);
  if (!inventory.some(item => item.name === 'registrations')) throw new PortabilityError('incomplete_schema', 'The parish registration store is missing.', 503);
  const files = [], tables = [], excluded = [], assets = new Map(), externalLinks = [];
  const rawRows = new Map();
  let totalBytes = 0, sourceBytes = 0;
  async function addFile(name, bytes, extra = {}) {
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_EXPORT_BYTES - 1024 * 1024) throw new PortabilityError('export_too_large', 'The parish exceeds the 24 MB self-service archive limit. Contact support for a full export.', 413);
    files.push({ name, bytes, sha256: await sha256(bytes), ...extra });
  }
  function addAsset(binding, key, source) {
    if (typeof key !== 'string' || !key) return;
    if (key.length > 1024 || key.includes('\0')) throw new PortabilityError('invalid_asset', 'An uploaded file has an invalid storage reference.');
    binding = canonicalBinding(binding);
    const id = binding + ':' + key;
    if (!assets.has(id)) assets.set(id, { binding, key, sources: [] });
    assets.get(id).sources.push(source);
  }
  function registerAssets(value, source) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/storageKey$/i.test(key) && typeof child === 'string') addAsset('CAMPAIGN_ASSETS', child, source);
      else if (typeof child === 'object') registerAssets(child, source);
    }
  }
  for (const item of inventory) {
    if (item.classification !== 'parish') { excluded.push({ table: item.name, reason: item.classification }); continue; }
    const size = await env.AGAPAY_DB.prepare(`SELECT count(*) n, COALESCE(SUM(${item.columns.map(c => `COALESCE(length(CAST(t.${quoted(c)} AS BLOB)),0)`).join('+')}),0) bytes FROM ${quoted(item.name)} t WHERE ${item.scope}`).bind(parishId).first();
    sourceBytes += Number(size.bytes);
    if (Number(size.n) > MAX_TABLE_ROWS || sourceBytes > MAX_EXPORT_BYTES / 2) throw new PortabilityError('export_too_large', 'The parish exceeds the self-service record limit. Contact support for a full export.', 413);
    const shared = item.name === 'directory_people' ? ", (EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=t.id AND a.parish_id<>?1) OR EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=t.id) OR EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=t.id AND h.parish_id<>?1)) AS portability_shared" : '';
    const result = await env.AGAPAY_DB.prepare(`SELECT t.*${shared} FROM ${quoted(item.name)} t WHERE ${item.scope} ORDER BY ${item.columns.map(c => `t.${quoted(c)}`).join(',')} LIMIT ${MAX_TABLE_ROWS + 1}`).bind(parishId).all();
    if (!Array.isArray(result?.results)) throw new PortabilityError('read_failed', 'A parish dataset could not be read.', 503);
    if (result.results.length > MAX_TABLE_ROWS) throw new PortabilityError('export_too_large', `The ${item.name} dataset exceeds the self-service row limit. No partial export will be marked complete.`, 413);
    const raw = result.results;
    // Historical installations had a packet file reference without a reviewed
    // physical bucket mapping. Do not silently omit a stored packet from a ZIP.
    if (item.name === 'stewardship_generated_packets' && raw.some(row => row.storage_key)) throw new PortabilityError('legacy_packet_storage_unverified', 'A historical stewardship packet needs storage reconciliation before a complete export can be prepared.');
    rawRows.set(item.name, raw);
    const rows = raw.map(row => exportRow(item.name, row)).filter(Boolean);
    const payload = utf8(JSON.stringify(rows));
    await addFile(`data/${item.name}.json`, payload);
    if (rows.length) await addFile(`csv/${item.name}.csv`, utf8(csvForRows(rows)));
    tables.push({ table: item.name, rowCount: rows.length, sha256: await sha256(payload) });
    const fileColumn = FILE_COLUMNS[item.name];
    if (fileColumn) for (const row of raw) addAsset(fileColumn[0], row[fileColumn[1]], item.name + ':' + (row.id || 'record'));
    if (item.name === 'registrations') for (const row of rows) registerAssets(row.data, 'registration');
    if (item.name === 'parish_announcements' || item.name === 'parish_teaching_posts') {
      const announcement = item.name === 'parish_announcements';
      for (const row of raw) {
        const url = row[announcement ? 'hero_image_url' : 'audio_url'];
        const key = assetUrl(url, env[announcement ? 'ANNOUNCEMENT_ASSETS_URL' : 'TEACHING_ASSETS_URL']);
        if (key) addAsset(announcement ? 'ANNOUNCEMENT_ASSETS' : 'TEACHING_ASSETS', key, item.name + ':' + row.id);
        else if (url) externalLinks.push({ source: item.name + ':' + row.id, url, reason: 'externally_hosted' });
      }
    }
    if (item.name === 'parish_video_posts' && raw.some(row => row.stream_video_id)) throw new PortabilityError('video_export_required', 'This parish has uploaded video. A complete media export requires operator assistance; automatic closure is blocked.');
    if (item.name === 'parish_group_messages') {
      const segment = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,120) || fallback;
      for (const row of raw) if (row.attachment_url) addAsset('GROUP_MESSAGE_ASSETS', ['group-messages', segment(parishId, 'parish'), segment(row.ministry_id, 'ministry'), segment(row.id, 'message')].join('/'), item.name + ':' + row.id);
    }
  }
  if (!rawRows.get('registrations')?.length) throw new PortabilityError('parish_not_found', 'Parish registration not found.', 404);
  const accounting = await collectAccountingRecords(env, parishId, rawRows.get('accounting_entities') || []);
  for (const table of accounting.tables) {
    await addFile(`accounting/${table.name}.json`, utf8(JSON.stringify(table.rows)));
    if (table.rows.length) await addFile(`accounting/csv/${table.name}.csv`, utf8(csvForRows(table.rows)));
    tables.push({ table: 'accounting/' + table.name, rowCount: table.rows.length, sha256: await sha256(JSON.stringify(table.rows)) });
  }
  for (const attachment of accounting.attachments) addAsset('ACCOUNTING_ATTACHMENTS', attachment.storage_key, 'accounting_attachments:' + attachment.id);
  const legacy = await collectLegacyRecords(env, parishId);
  if (legacy.length) await addFile('legacy/records.json', utf8(JSON.stringify(legacy)));
  const fileInventoryVerified = storageGuardsEnabled(env);
  if (fileInventoryVerified) for (const asset of await inventoryParishObjects(env, parishId)) addAsset(asset.binding, asset.key, 'storage_inventory');
  for (const asset of assets.values()) {
    if (fileInventoryVerified) {
      const owner = await objectOwnership(env,asset.binding,asset.key);
      if (!owner || owner.parish_id !== parishId) throw new PortabilityError('file_owner_conflict', 'A referenced file does not have verified ownership by this parish.');
    }
    const bucket = fileBucket(env, asset.binding);
    if (!bucket?.get || !bucket?.head) throw new PortabilityError('asset_store_unavailable', `Required file storage ${asset.binding} is unavailable.`, 503);
    const head = await bucket.head(asset.key);
    if (!head) throw new PortabilityError('missing_asset', 'A referenced parish file is missing. Export and closure have stopped.');
    if (!Number.isSafeInteger(head.size) || head.size < 0 || totalBytes + head.size > MAX_EXPORT_BYTES - 1024 * 1024) throw new PortabilityError('export_too_large', 'An attachment exceeds the self-service archive limit.', 413);
    const object = await bucket.get(asset.key, { onlyIf: { etagMatches: head.etag } });
    if (!object?.body) throw new PortabilityError('asset_changed', 'A parish file changed during export. Please retry.');
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== head.size) throw new PortabilityError('asset_changed', 'A parish file changed during export. Please retry.');
    const extension = asset.key.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || 'bin';
    asset.archivePath = `files/${String(files.length).padStart(5, '0')}.${extension}`;
    asset.etag = head.etag;
    asset.disposition = FINANCIAL_BINDINGS.has(asset.binding) ? 'financial' : 'delete';
    await addFile(asset.archivePath, bytes, { contentType: object.httpMetadata?.contentType || 'application/octet-stream' });
  }
  const manifest = {
    format: 'agapay-parish-export', version: 1, parishId, policyVersion: POLICY_VERSION,
    startedAt, completedAt: new Date().toISOString(), consistency: 'Export window; closure requires a fresh comparison under a write barrier.',
    tables, excluded, externalLinks, activeLegalHolds: accounting.holds,
    legacyRecords: legacy.map(({ key, kind, sourceHash, disposition }) => ({ key, kind, sourceHash, disposition })),
    fileInventoryVerified,
    accountingRetentionYears: Math.max(7, ...accounting.tables.filter(t => t.name === 'accounting_retention_settings').flatMap(t => t.rows.flatMap(row => Object.entries(row).filter(([key]) => key.endsWith('_retention_years')).map(([,value]) => Number(value))))),
    files: files.map(({ name, bytes, sha256: hash, contentType }) => ({ path: name, bytes: bytes.length, sha256: hash, ...(contentType ? { contentType } : {}) })),
    assets: [...assets.values()],
    notes: ['Authentication secrets are excluded.', 'Independent donor accounts and parent-owned Learn records are excluded.', 'Shared person records contain identity labels only; parish-owned contact and privacy data are in their scoped tables.'],
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  await addFile('manifest.json', utf8(manifestText));
  await addFile('README.txt', utf8('AGAPAY parish data export\n\nOpen manifest.json for the file inventory, row counts, checksums, omissions, and export window. JSON preserves structured values; CSV files are for spreadsheet use. Formula-like CSV values have a protective leading apostrophe. Amounts ending in _cents are integer minor currency units; consult record currency fields. Dates retain their source format. Data files retain stable IDs for relationships. Files are mapped to their source records in the manifest. Authentication credentials and independent personal accounts are excluded. This download alone does not authorize deletion.\n'));
  const archive = createZip(files);
  return { archive, manifest, manifestHash: await sha256(manifestText), archiveHash: await sha256(archive), rawRows, inventory };
}
