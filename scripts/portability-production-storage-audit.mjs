// Fixed-scope, read-only reconciliation of every production parish file.
// Default prints a no-network plan. --read-only lists R2 metadata (never
// object bodies), reads fixed D1/KV ownership references, and writes ignored
// evidence plus a proposed registry manifest. It performs no provider writes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';
import { classifyLegacyRecord } from '../src/portability/legacy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = path.join(root, 'artifacts/portability-staging');
const evidencePath = path.join(artifactDir, 'production-storage-ownership.json');
const manifestPath = path.join(artifactDir, 'production-storage-registry-proposal.json');
const proxyConfigPath = path.join(artifactDir, 'production-storage-inventory-wrangler.json');
const accountId = '9198ae5ea8adc59e5dedd1b09c9478b9';
const centralDatabase = 'agapay-production';
const accountingDatabase = 'agapay-acct-production-4ab22bac06dca8b80e70';
const accountingParishId = 'st-fiacre';
const kvBinding = 'AGAPAY_REGISTRATIONS';
const kvId = 'c0c630d2699a4d42a72db927c6341707';
const publicBases = Object.freeze({
  CAMPAIGN_ASSETS: 'https://pub-a8aecb95751f49ac9b078c3e3ed378b8.r2.dev',
  ANNOUNCEMENT_ASSETS: 'https://pub-b0974d02d1bf41288b3082849e87f676.r2.dev',
  TEACHING_ASSETS: 'https://pub-b6fa9c48d8be43bebaacef7f7ba448e4.r2.dev'
});
const workerPublicBases = Object.freeze({
  CAMPAIGN_ASSETS: 'https://agapay.app/api/public/parish-assets/campaign',
  ANNOUNCEMENT_ASSETS: 'https://agapay.app/api/public/parish-assets/announcement',
  TEACHING_ASSETS: 'https://agapay.app/api/public/parish-assets/teaching'
});
const referenceBases = Object.freeze(Object.fromEntries(Object.keys(publicBases).map(binding => [binding, [publicBases[binding], workerPublicBases[binding]]])));
const allReferenceBases = Object.values(referenceBases).flat();
const publicMediaPolicyVersion = '2026-08-28-active-storage-v2';
const buckets = Object.freeze({
  CAMPAIGN_ASSETS: 'agapay-campaign-assets',
  ANNOUNCEMENT_ASSETS: 'agapay-announcement-assets',
  TEACHING_ASSETS: 'agapay-teaching-assets',
  GROUP_MESSAGE_ASSETS: 'agapay-group-message-assets',
  DIRECTORY_MEDIA: 'agapay-directory-media',
  TAX_EXEMPTION_DOCS: 'agapay-tax-exemption-docs',
  NONPROFIT_PRICING_DOCS: 'agapay-nonprofit-pricing-docs',
  GIVING_STATEMENTS: 'agapay-giving-statements',
  ACCOUNTING_ATTACHMENTS: 'agapay-accounting-attachments'
});
const financial = new Set(['TAX_EXEMPTION_DOCS', 'NONPROFIT_PRICING_DOCS', 'GIVING_STATEMENTS', 'ACCOUNTING_ATTACHMENTS']);
const args = process.argv.slice(2);
mkdirSync(artifactDir, { recursive: true });

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    command: 'node scripts/portability-production-storage-audit.mjs --read-only',
    scope: { physicalBuckets: Object.keys(buckets).length, centralDatabase, accountingDatabase, legacyKv: kvBinding },
    safeguards: ['metadata-only R2 listing', 'fixed read-only D1 statements', 'KV values parsed in memory only', 'no object bodies', 'no raw keys or parish IDs printed', 'no provider writes'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.deepEqual(args, ['--read-only'], 'Only --read-only is supported');

const wranglerToml = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const productionConfig = wranglerToml.split(/^\[env\.staging\]/m)[0];
assert.match(productionConfig, new RegExp(`CLOUDFLARE_ACCOUNT_ID = "${accountId}"`));
assert.match(productionConfig, new RegExp(`binding = "${kvBinding}"\\s+id = "${kvId}"`));
for (const [binding, bucketName] of Object.entries(buckets)) {
  assert.match(productionConfig, new RegExp(`binding = "${binding}"\\s+bucket_name = "${bucketName}"`));
}
assert.match(productionConfig, /binding = "PARISH_LIBRARY_ASSETS"\s+bucket_name = "agapay-group-message-assets"/);
for (const [binding, base] of Object.entries(workerPublicBases)) {
  assert.match(productionConfig, new RegExp(`^${binding}_URL = "${base.replaceAll('.', '\\.')}"$`, 'm'));
}
assert.match(productionConfig, new RegExp(`^PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED = "${publicMediaPolicyVersion}"$`, 'm'));
assert.match(productionConfig, new RegExp(`^PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED = "${publicMediaPolicyVersion}"$`, 'm'));
for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED']) {
  assert.match(productionConfig, new RegExp(`^${flag} = "false"$`, 'm'));
}

function wrangler(commandArgs) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
    });
    const detail = String(result.stderr || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (result.status === 0) break;
    if (!detail.includes('UV_HANDLE_CLOSING') || attempt === 2) {
      const stdout = String(result.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
      throw new Error(`Read-only production storage audit command failed${detail || stdout ? `: ${(detail || stdout).slice(0, 2000)}` : ''}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function d1Read(database, statements) {
  const result = [];
  for (const statement of statements) {
    const values = JSON.parse(wrangler(['d1', 'execute', database, '--remote', '--command', statement + ';', '--json']));
    assert.equal(values.length, 1, `Unexpected ${database} statement result count`);
    result.push(values[0]);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  for (const item of result) {
    assert.equal(item.success, true);
    assert.equal(item.meta?.changes, 0, 'Read-only storage query changed data');
    assert.equal(item.meta?.rows_written, 0, 'Read-only storage query wrote rows');
    assert.equal(item.meta?.changed_db, false, 'Read-only storage query changed the database');
    assert.ok(Array.isArray(item.results));
    assert.ok(item.results.length <= 10000, 'A storage reference query exceeds the reviewed bound');
  }
  return result.map(item => item.results);
}

function cleanKeyFromUrl(value, base) {
  if (typeof value !== 'string' || !value.startsWith(base + '/')) return null;
  try {
    const url = new URL(value), baseUrl = new URL(base);
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    if (url.origin !== baseUrl.origin || url.search || url.hash || !url.pathname.startsWith(basePath + '/')) return null;
    return decodeURIComponent(url.pathname.slice(basePath.length + 1));
  } catch { return null; }
}

function safeSegment(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || fallback;
}

function strings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) for (const child of value) strings(child, found);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) strings(child, found);
  return found;
}

const centralStatements = [
  "SELECT parish_id FROM registrations WHERE parish_id IS NOT NULL AND parish_id<>'' LIMIT 10000",
  `SELECT r.parish_id,j.value url FROM registrations r,json_tree(r.data) j WHERE json_valid(r.data) AND r.parish_id IS NOT NULL AND j.type='text' AND (${allReferenceBases.map(base => `substr(j.value,1,${base.length + 1})='${base}/'`).join(' OR ')}) LIMIT 10000`,
  `SELECT parish_id,image_url url FROM commerce_products WHERE image_url IS NOT NULL AND (${allReferenceBases.map(base => `substr(image_url,1,${base.length + 1})='${base}/'`).join(' OR ')}) LIMIT 10000`,
  `SELECT parish_id,hero_image_url url FROM parish_announcements WHERE ${referenceBases.ANNOUNCEMENT_ASSETS.map(base => `substr(hero_image_url,1,${base.length + 1})='${base}/'`).join(' OR ')} LIMIT 10000`,
  `SELECT parish_id,audio_url url FROM parish_teaching_posts WHERE ${referenceBases.TEACHING_ASSETS.map(base => `substr(audio_url,1,${base.length + 1})='${base}/'`).join(' OR ')} LIMIT 10000`,
  "SELECT parish_id,image_storage_key object_key FROM directory_ministries WHERE image_storage_key IS NOT NULL AND image_storage_key<>'' LIMIT 10000",
  "SELECT parish_id,ministry_id,id FROM parish_group_messages WHERE attachment_url IS NOT NULL AND attachment_url<>'' LIMIT 10000",
  "SELECT l.parish_id,p.storage_key object_key FROM koinonia_exchange_photos p JOIN koinonia_exchange_listings l ON l.id=p.listing_id WHERE p.storage_key IS NOT NULL AND p.storage_key<>'' LIMIT 10000",
  "SELECT parish_id,object_key FROM parish_library_resources WHERE object_key IS NOT NULL AND object_key<>'' LIMIT 10000",
  "SELECT parish_id,original_object_key object_key FROM directory_media_assets WHERE original_object_key IS NOT NULL AND original_object_key<>'' LIMIT 10000",
  "SELECT a.parish_id,v.r2_object_key object_key FROM directory_media_variants v JOIN directory_media_assets a ON a.id=v.media_asset_id WHERE v.r2_object_key IS NOT NULL AND v.r2_object_key<>'' LIMIT 10000",
  "SELECT d.storage_key object_key,t.parish_id direct_parish_id,r.parish_id registration_parish_id FROM tax_exemption_documents d JOIN tax_exemptions t ON t.id=d.tax_exemption_id LEFT JOIN registrations r ON r.reference=d.registration_reference WHERE d.storage_key IS NOT NULL AND d.storage_key<>'' LIMIT 10000",
  "SELECT a.parish_id,d.storage_key object_key FROM nonprofit_pricing_documents d JOIN nonprofit_pricing_applications a ON a.id=d.application_id WHERE d.storage_key IS NOT NULL AND d.storage_key<>'' LIMIT 10000",
  "SELECT parish_id,storage_key object_key FROM giving_statements WHERE storage_key IS NOT NULL AND storage_key<>'' LIMIT 10000",
  "SELECT m.value parish_id,d.database_identifier FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id JOIN (SELECT 'st-fiacre' value) m WHERE d.database_identifier='agapay-acct-production-4ab22bac06dca8b80e70' AND d.environment='production' AND e.parish_id=m.value LIMIT 2",
  "SELECT count(*) n FROM stewardship_generated_packets WHERE storage_key IS NOT NULL AND storage_key<>''"
];
const central = d1Read(centralDatabase, centralStatements);
const knownParishes = new Set(central[0].map(row => row.parish_id));
assert.ok(knownParishes.has(accountingParishId), 'Accounting parish is absent from the production parish registry');
assert.equal(central[14].length, 1, 'Production accounting attachment owner mapping is ambiguous');

const accounting = d1Read(accountingDatabase, [
  "SELECT value FROM accounting_database_metadata WHERE key='parish_id'",
  "SELECT storage_key object_key FROM accounting_attachments WHERE storage_key IS NOT NULL AND storage_key<>'' LIMIT 10000"
]);
assert.deepEqual(accounting[0], [{ value: accountingParishId }], 'Accounting database identity readback failed');

const references = new Map();
const referenceConflicts = [];
function addReference(binding, key, parishId, source) {
  if (binding === 'PARISH_LIBRARY_ASSETS') binding = 'GROUP_MESSAGE_ASSETS';
  if (typeof key !== 'string' || !key || typeof parishId !== 'string' || !parishId) return;
  const id = binding + '\u0000' + key;
  const current = references.get(id);
  if (current && current.parishId !== parishId) referenceConflicts.push({ binding, key, left: current.parishId, right: parishId });
  if (!current) references.set(id, { binding, key, parishId, sources: new Set() });
  references.get(id)?.sources.add(source);
}
for (const row of central[1]) for (const [binding, bases] of Object.entries(referenceBases)) for (const base of bases) {
  const key = cleanKeyFromUrl(row.url, base); if (key) addReference(binding, key, row.parish_id, 'central_registration_json');
}
for (const row of central[2]) for (const [binding, bases] of Object.entries(referenceBases)) for (const base of bases) {
  const key = cleanKeyFromUrl(row.url, base); if (key) addReference(binding, key, row.parish_id, 'commerce_product');
}
for (const row of central[3]) for (const base of referenceBases.ANNOUNCEMENT_ASSETS) addReference('ANNOUNCEMENT_ASSETS', cleanKeyFromUrl(row.url, base), row.parish_id, 'announcement');
for (const row of central[4]) for (const base of referenceBases.TEACHING_ASSETS) addReference('TEACHING_ASSETS', cleanKeyFromUrl(row.url, base), row.parish_id, 'teaching_post');
for (const row of central[5]) addReference('GROUP_MESSAGE_ASSETS', row.object_key, row.parish_id, 'ministry_image');
for (const row of central[6]) addReference('GROUP_MESSAGE_ASSETS', ['group-messages', safeSegment(row.parish_id, 'parish'), safeSegment(row.ministry_id, 'ministry'), safeSegment(row.id, 'message')].join('/'), row.parish_id, 'group_message');
for (const row of central[7]) addReference('GROUP_MESSAGE_ASSETS', row.object_key, row.parish_id, 'exchange_photo');
for (const row of central[8]) addReference('GROUP_MESSAGE_ASSETS', row.object_key, row.parish_id, 'parish_library');
for (const row of central[9]) addReference('DIRECTORY_MEDIA', row.object_key, row.parish_id, 'directory_original');
for (const row of central[10]) addReference('DIRECTORY_MEDIA', row.object_key, row.parish_id, 'directory_variant');
for (const row of central[11]) {
  if (row.direct_parish_id && row.registration_parish_id && row.direct_parish_id !== row.registration_parish_id) referenceConflicts.push({ binding: 'TAX_EXEMPTION_DOCS', key: row.object_key, left: row.direct_parish_id, right: row.registration_parish_id });
  addReference('TAX_EXEMPTION_DOCS', row.object_key, row.direct_parish_id || row.registration_parish_id, 'tax_exemption');
}
for (const row of central[12]) addReference('NONPROFIT_PRICING_DOCS', row.object_key, row.parish_id, 'nonprofit_pricing');
for (const row of central[13]) addReference('GIVING_STATEMENTS', row.object_key, row.parish_id, 'giving_statement');
for (const row of accounting[1]) addReference('ACCOUNTING_ATTACHMENTS', row.object_key, accountingParishId, 'accounting_attachment');

writeFileSync(proxyConfigPath, JSON.stringify({
  name: 'agapay-portability-production-storage-inventory', account_id: accountId,
  compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
  kv_namespaces: [{ binding: kvBinding, id: kvId, remote: true }],
  r2_buckets: Object.entries(buckets).map(([binding, bucket_name]) => ({ binding, bucket_name, remote: true })),
  triggers: { crons: [] }
}, null, 2) + '\n');

const proxy = await getPlatformProxy({ configPath: proxyConfigPath, envFiles: [], remoteBindings: true, persist: false });
const physical = [];
let kvKeysScanned = 0, kvClassifiedKeys = 0;
const kvUnclassified = [];
const legacyRegistry = [];
try {
  const kv = proxy.env[kvBinding];
  assert.ok(kv?.list && kv?.get, 'Production legacy KV binding is unavailable');
  const kvRaw = new Map();
  let cursor;
  do {
    const page = await kv.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    assert.ok(Array.isArray(page.keys));
    for (const { name } of page.keys) {
      assert.ok(++kvKeysScanned <= 10000, 'Production KV inventory exceeds the reviewed bound');
      const raw = await kv.get(name);
      assert.notEqual(raw, null, 'Production KV changed during inventory');
      kvRaw.set(name, raw);
    }
    if (page.list_complete) break;
    assert.ok(page.cursor && page.cursor !== cursor, 'Production KV cursor is invalid');
    cursor = page.cursor;
  } while (cursor);
  for (const [key, raw] of kvRaw) {
    let record;
    try { record = await classifyLegacyRecord(key, raw, target => Promise.resolve(kvRaw.get(target) ?? null)); }
    catch (error) {
      kvUnclassified.push({ key, sourceHash: await sha256(raw), errorCode: String(error?.code || error?.name || 'error'), errorMessage: String(error?.message || error) });
      continue;
    }
    if (!record) continue;
    kvClassifiedKeys++;
    legacyRegistry.push({ objectKey: key, parishId: record.parishId, sourceHash: await sha256(raw), state: 'stored' });
    knownParishes.add(record.parishId);
    for (const value of strings(record.data)) for (const [binding, bases] of Object.entries(referenceBases)) for (const base of bases) {
      const objectKey = cleanKeyFromUrl(value, base);
      if (objectKey) addReference(binding, objectKey, record.parishId, 'legacy_kv');
    }
  }

  for (const binding of Object.keys(buckets)) {
    const bucket = proxy.env[binding];
    assert.ok(bucket?.list, `${binding} production bucket is unavailable`);
    let bucketCursor, count = 0;
    do {
      const page = await bucket.list({ limit: 1000, include: ['httpMetadata', 'customMetadata'], ...(bucketCursor ? { cursor: bucketCursor } : {}) });
      assert.ok(Array.isArray(page.objects));
      for (const object of page.objects) {
        assert.ok(++count <= 10000, `${binding} inventory exceeds the reviewed bound`);
        physical.push({
          binding, bucket: buckets[binding], key: object.key, etag: object.etag,
          size: Number(object.size), uploaded: new Date(object.uploaded).toISOString(),
          metadataOwner: String(object.customMetadata?.agapayParishId || ''),
          cacheControl: String(object.httpMetadata?.cacheControl || '')
        });
      }
      if (!page.truncated) break;
      assert.ok(page.cursor && page.cursor !== bucketCursor, `${binding} R2 cursor is invalid`);
      bucketCursor = page.cursor;
    } while (bucketCursor);
  }
} finally {
  await proxy.dispose();
}

const physicalIds = new Set(physical.map(object => object.binding + '\u0000' + object.key));
const missingPhysicalReferences = [...references.entries()].filter(([id]) => !physicalIds.has(id));
const proposed = [], issues = [];
for (const object of physical) {
  const ref = references.get(object.binding + '\u0000' + object.key);
  const evidenceOwners = new Set([object.metadataOwner, ref?.parishId].filter(Boolean));
  if (evidenceOwners.size > 1) issues.push({ type: 'owner_conflict', binding: object.binding, key: object.key });
  const parishId = [...evidenceOwners][0] || '';
  if (!parishId) issues.push({ type: 'owner_unknown', binding: object.binding, key: object.key });
  else if (!knownParishes.has(parishId)) issues.push({ type: 'owner_not_in_registry', binding: object.binding, key: object.key });
  if (!object.etag) issues.push({ type: 'etag_missing', binding: object.binding, key: object.key });
  proposed.push({
    binding: object.binding, objectKey: object.key, parishId,
    disposition: financial.has(object.binding) ? 'financial' : 'delete', state: 'stored', etag: object.etag,
    evidence: [...new Set([...(object.metadataOwner ? ['r2_custom_metadata'] : []), ...(ref ? [...ref.sources] : [])])].sort()
  });
}
for (const conflict of referenceConflicts) issues.push({ type: 'reference_conflict', binding: conflict.binding, key: conflict.key });
for (const [, ref] of missingPhysicalReferences) issues.push({ type: 'referenced_object_missing', binding: ref.binding, key: ref.key });

const countsByBinding = {};
const publicCacheByBinding = {};
for (const binding of Object.keys(buckets)) {
  const objects = physical.filter(object => object.binding === binding);
  countsByBinding[binding] = {
    physical: objects.length,
    referenced: [...references.values()].filter(ref => ref.binding === binding).length,
    metadataOwned: objects.filter(object => object.metadataOwner).length,
    reconciled: proposed.filter(item => item.binding === binding && item.parishId).length
  };
  if (publicBases[binding]) publicCacheByBinding[binding] = {
    objects: objects.length,
    immutablePublic: objects.filter(object => /public.*max-age=31536000.*immutable/i.test(object.cacheControl)).length,
    noStore: objects.filter(object => /no-store/i.test(object.cacheControl)).length,
    absent: objects.filter(object => !object.cacheControl).length
  };
}
const issueCounts = issues.reduce((all, issue) => ({ ...all, [issue.type]: (all[issue.type] || 0) + 1 }), {});
const registryCore = proposed.slice().sort((a, b) => (a.binding + '\u0000' + a.objectKey).localeCompare(b.binding + '\u0000' + b.objectKey));
const registrySha256 = await sha256(JSON.stringify(registryCore));
const legacyRegistryCore = legacyRegistry.slice().sort((a, b) => a.objectKey.localeCompare(b.objectKey));
const legacyRegistrySha256 = await sha256(JSON.stringify(legacyRegistryCore));
const issueKeySetSha256 = await sha256(JSON.stringify(issues.map(issue => issue.type + ':' + issue.binding + ':' + issue.key).sort()));
const physicalKeySetSha256 = await sha256(JSON.stringify(physical.map(object => object.binding + ':' + object.key + ':' + object.etag).sort()));
const status = issues.length ? 'blocked_reconciliation_issues' : kvUnclassified.length ? 'blocked_unclassified_legacy_kv' : Number(central[15][0]?.n || 0) ? 'blocked_unmapped_stewardship_packets' : 'verified_ready_for_registry_review';
const checkedAt = new Date().toISOString();
const report = {
  checkedAt, readOnly: true, status, providerWrites: false, objectBodiesRead: false,
  physicalObjects: physical.length, references: references.size, countsByBinding,
  knownParishCount: knownParishes.size,
  kv: { keysScanned: kvKeysScanned, classifiedParishKeys: kvClassifiedKeys, unclassifiedKeys: kvUnclassified.length, unclassifiedKeySetSha256: await sha256(JSON.stringify(kvUnclassified.map(item => item.key).sort())), rawValuesPersisted: false },
  unmappedStewardshipPacketReferences: Number(central[15][0]?.n || 0),
  publicCacheByBinding, issues: issueCounts, issueCount: issues.length,
  physicalKeySetSha256, issueKeySetSha256, registrySha256, legacyRegistrySha256
};
writeFileSync(manifestPath, JSON.stringify({ checkedAt, readOnlyEvidence: true, status, registrySha256, legacyRegistrySha256, objects: registryCore, legacyKeys: legacyRegistryCore, issues, unclassifiedLegacyKeys: kvUnclassified }, null, 2) + '\n');
writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status, checkedAt, physicalObjects: report.physicalObjects, references: report.references, issueCount: report.issueCount, issues: report.issues, kv: report.kv, unmappedStewardshipPacketReferences: report.unmappedStewardshipPacketReferences, registrySha256, legacyRegistrySha256, writes: false }, null, 2));
if (status !== 'verified_ready_for_registry_review') process.exitCode = 2;
