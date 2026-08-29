// Guarded one-time rewrite of historical public R2 URLs to Worker media URLs.
// The default is a no-network plan. Inventory persists only ignored, hashed
// operator evidence. Apply requires that exact fresh hash and verifies every
// changed D1/KV record after the write. Raw values and URLs are never printed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';
import { classifyLegacyRecord } from '../src/portability/legacy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'artifacts/portability-staging');
const proposalPath = path.join(dir, 'production-storage-registry-proposal.json');
const evidencePath = path.join(dir, 'production-public-media-rewrite.json');
const proxyConfigPath = path.join(dir, 'production-public-media-rewrite-wrangler.json');
const database = 'agapay-production';
const accountId = '9198ae5ea8adc59e5dedd1b09c9478b9';
const kvBinding = 'AGAPAY_REGISTRATIONS';
const kvId = 'c0c630d2699a4d42a72db927c6341707';
const policyVersion = '2026-08-28-active-storage-v2';
const media = Object.freeze({
  CAMPAIGN_ASSETS: { oldBase: 'https://pub-a8aecb95751f49ac9b078c3e3ed378b8.r2.dev', newBase: 'https://agapay.app/api/public/parish-assets/campaign' },
  ANNOUNCEMENT_ASSETS: { oldBase: 'https://pub-b0974d02d1bf41288b3082849e87f676.r2.dev', newBase: 'https://agapay.app/api/public/parish-assets/announcement' },
  TEACHING_ASSETS: { oldBase: 'https://pub-b6fa9c48d8be43bebaacef7f7ba448e4.r2.dev', newBase: 'https://agapay.app/api/public/parish-assets/teaching' }
});
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    inventory: 'node scripts/portability-public-media-rewrite.mjs --inventory',
    apply: 'node scripts/portability-public-media-rewrite.mjs --apply <evidence-sha256>',
    safeguards: ['fresh ownership proposal', 'exact hashed D1/KV record set', 'object ownership agreement', 'conditional D1 updates', 'KV pending/stored registry protocol', 'complete post-write hash and URL readback', 'r2.dev remains enabled'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--inventory' || args[0] === '--apply', 'Use --inventory or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1, 'Apply requires exactly one evidence SHA-256');
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/, 'A full lowercase evidence SHA-256 is required');
mkdirSync(dir, { recursive: true });

const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').split(/^\[env\.staging\]/m)[0];
assert.match(config, new RegExp(`^PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED = "${policyVersion}"$`, 'm'));
assert.doesNotMatch(config, /^PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED\s*=/m);
for (const [binding, item] of Object.entries(media)) assert.match(config, new RegExp(`^${binding}_URL = "${item.newBase.replaceAll('.', '\\.')}"$`, 'm'));
for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED']) {
  assert.match(config, new RegExp(`^${flag} = "false"$`, 'm'));
}

function wrangler(commandArgs) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
    });
    const detail = String(result.stderr || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (result.status === 0) break;
    if (!detail.includes('UV_HANDLE_CLOSING') || attempt === 2) throw new Error('Public media rewrite provider command failed');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return String(result.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function d1(sql, write = false) {
  const batches = JSON.parse(wrangler(['d1', 'execute', database, '--remote', '--command', sql, '--json']));
  assert.ok(Array.isArray(batches) && batches.length, 'D1 returned no result batches');
  assert.ok(batches.every(batch => batch.success === true), 'D1 command did not succeed');
  if (!write) assert.ok(batches.every(batch => batch.meta?.changes === 0 && batch.meta?.rows_written === 0 && batch.meta?.changed_db === false), 'A read-only D1 query reported writes');
  return batches;
}

const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const oldPredicates = column => Object.values(media).map(item => `instr(${column},${q(item.oldBase + '/')})>0`).join(' OR ');

function reference(value, kind = 'old') {
  if (typeof value !== 'string') return null;
  for (const [binding, item] of Object.entries(media)) {
    const base = kind === 'old' ? item.oldBase : item.newBase;
    if (value.startsWith(base + '/')) {
      const suffix = value.slice(base.length + 1);
      try { return { binding, objectKey: decodeURIComponent(suffix), suffix }; } catch { return null; }
    }
  }
  return null;
}

function visitStrings(value, fn) {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) for (const child of value) visitStrings(child, fn);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) visitStrings(child, fn);
}

function rewriteValue(value, counts) {
  if (typeof value === 'string') {
    const found = reference(value, 'old');
    if (!found) return value;
    counts[found.binding] = (counts[found.binding] || 0) + 1;
    return media[found.binding].newBase + '/' + found.suffix;
  }
  if (Array.isArray(value)) return value.map(child => rewriteValue(child, counts));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteValue(child, counts)]));
  return value;
}

function rewriteJson(raw) {
  const parsed = JSON.parse(raw), counts = {};
  const rewritten = rewriteValue(parsed, counts);
  const replacements = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!replacements) return { next: raw, counts, replacements };
  let direct = raw;
  for (const item of Object.values(media)) direct = direct.replaceAll(item.oldBase + '/', item.newBase + '/');
  try {
    if (JSON.stringify(JSON.parse(direct)) === JSON.stringify(rewritten)) return { next: direct, counts, replacements };
  } catch {}
  return { next: JSON.stringify(rewritten), counts, replacements };
}

function assertOwnedReferences(value, parishId, proposalObjects) {
  let found = 0;
  visitStrings(value, item => {
    const ref = reference(item, 'old');
    if (!ref) return;
    found++;
    assert.ok(proposalObjects.some(object => object.binding === ref.binding && object.objectKey === ref.objectKey && object.parishId === parishId), 'A historical media reference does not match the reviewed object owner');
  });
  return found;
}

async function descriptor(source, id, parishId, before, after, counts) {
  return {
    source, id, parishId,
    beforeSha256: await sha256(before), afterSha256: await sha256(after),
    replacements: Object.values(counts).reduce((sum, value) => sum + value, 0),
    bindingCounts: Object.fromEntries(Object.keys(media).map(binding => [binding, counts[binding] || 0]))
  };
}

async function parseProposal() {
  const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
  assert.equal(proposal.status, 'verified_ready_for_registry_review');
  assert.deepEqual(proposal.issues, []);
  assert.deepEqual(proposal.unclassifiedLegacyKeys, []);
  assert.equal(await sha256(JSON.stringify(proposal.objects)), proposal.registrySha256, 'The R2 ownership proposal hash is invalid');
  assert.equal(await sha256(JSON.stringify(proposal.legacyKeys)), proposal.legacyRegistrySha256, 'The KV ownership proposal hash is invalid');
  assert.ok(Date.now() - Date.parse(proposal.checkedAt) <= 30 * 60 * 1000, 'Ownership proposal is older than 30 minutes; inventory again');
  return proposal;
}

function writeProxyConfig() {
  writeFileSync(proxyConfigPath, JSON.stringify({
    name: 'agapay-portability-public-media-rewrite', account_id: accountId,
    compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
    kv_namespaces: [{ binding: kvBinding, id: kvId, remote: true }], triggers: { crons: [] }
  }, null, 2) + '\n');
}

async function collect(proposal) {
  const current = [], publicObjects = proposal.objects.filter(object => media[object.binding]);
  assert.equal(publicObjects.length, 3, 'Expected exactly three reviewed public objects');
  const specifications = [
    { source: 'registration', idColumn: 'reference', valueColumn: 'data', json: true, sql: `SELECT reference id,parish_id,data value FROM registrations WHERE ${oldPredicates('data')} LIMIT 10001` },
    { source: 'commerce_product', idColumn: 'id', valueColumn: 'image_url', sql: `SELECT id,parish_id,image_url value FROM commerce_products WHERE image_url IS NOT NULL AND (${oldPredicates('image_url')}) LIMIT 10001` },
    { source: 'announcement', idColumn: 'id', valueColumn: 'hero_image_url', sql: `SELECT id,parish_id,hero_image_url value FROM parish_announcements WHERE hero_image_url IS NOT NULL AND (${oldPredicates('hero_image_url')}) LIMIT 10001` },
    { source: 'teaching_post', idColumn: 'id', valueColumn: 'audio_url', sql: `SELECT id,parish_id,audio_url value FROM parish_teaching_posts WHERE audio_url IS NOT NULL AND (${oldPredicates('audio_url')}) LIMIT 10001` }
  ];
  for (const spec of specifications) {
    const rows = d1(spec.sql)[0].results;
    assert.ok(rows.length <= 10000, `${spec.source} rewrite exceeds the reviewed bound`);
    for (const row of rows) {
      let next, counts, replacements, parsed;
      if (spec.json) {
        ({ next, counts, replacements } = rewriteJson(row.value));
        parsed = JSON.parse(row.value);
      } else {
        counts = {}; next = rewriteValue(row.value, counts); replacements = Object.values(counts).reduce((sum, value) => sum + value, 0); parsed = row.value;
      }
      assert.ok(replacements > 0 && assertOwnedReferences(parsed, row.parish_id, publicObjects) === replacements, 'D1 historical reference inventory is inconsistent');
      current.push({ ...(await descriptor(spec.source, row.id, row.parish_id, row.value, next, counts)), store: 'd1', idColumn: spec.idColumn, valueColumn: spec.valueColumn, before: row.value, after: next });
    }
  }

  writeProxyConfig();
  const proxy = await getPlatformProxy({ configPath: proxyConfigPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    const kv = proxy.env[kvBinding];
    assert.ok(kv?.list && kv?.get && kv?.put, 'Production legacy KV binding is unavailable');
    const rawByKey = new Map(); let cursor, scanned = 0;
    do {
      const page = await kv.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const { name } of page.keys || []) {
        assert.ok(++scanned <= 10000, 'Production KV inventory exceeds the reviewed bound');
        const raw = await kv.get(name); assert.notEqual(raw, null, 'Production KV changed during rewrite inventory'); rawByKey.set(name, raw);
      }
      if (page.list_complete) break;
      assert.ok(page.cursor && page.cursor !== cursor, 'Production KV cursor is invalid'); cursor = page.cursor;
    } while (cursor);
    for (const [key, raw] of rawByKey) {
      let rewritten;
      try { rewritten = rewriteJson(raw); } catch { continue; }
      if (!rewritten.replacements) continue;
      const beforeRecord = await classifyLegacyRecord(key, raw, target => Promise.resolve(rawByKey.get(target) ?? null));
      const afterRecord = await classifyLegacyRecord(key, rewritten.next, target => Promise.resolve(rawByKey.get(target) ?? null));
      assert.ok(beforeRecord && afterRecord && beforeRecord.parishId === afterRecord.parishId, 'Legacy KV ownership changed during rewrite planning');
      assert.equal(assertOwnedReferences(JSON.parse(raw), beforeRecord.parishId, publicObjects), rewritten.replacements, 'Legacy KV historical reference inventory is inconsistent');
      current.push({ ...(await descriptor('legacy_kv', key, beforeRecord.parishId, raw, rewritten.next, rewritten.counts)), store: 'kv', before: raw, after: rewritten.next });
    }
  } finally { await proxy.dispose(); }
  return current.sort((a, b) => (a.source + '\0' + a.id).localeCompare(b.source + '\0' + b.id));
}

const savedRecord = record => ({
  source: record.source, id: record.id, parishId: record.parishId,
  beforeSha256: record.beforeSha256, afterSha256: record.afterSha256,
  replacements: record.replacements, bindingCounts: record.bindingCounts,
  store: record.store, ...(record.store === 'd1' ? { idColumn: record.idColumn, valueColumn: record.valueColumn } : {})
});

async function evidenceCore(proposal, records) {
  return {
    proposalCheckedAt: proposal.checkedAt,
    registrySha256: proposal.registrySha256,
    legacyRegistrySha256: proposal.legacyRegistrySha256,
    records: records.map(savedRecord)
  };
}

function summary(records) {
  const sources = {};
  for (const record of records) sources[record.source] = (sources[record.source] || 0) + 1;
  return { records: records.length, replacements: records.reduce((sum, record) => sum + record.replacements, 0), sources };
}

const proposal = await parseProposal();
if (args[0] === '--inventory') {
  const records = await collect(proposal);
  const core = await evidenceCore(proposal, records), evidenceSha256 = await sha256(JSON.stringify(core));
  assert.deepEqual(summary(records), { records: 3, replacements: 3, sources: { legacy_kv: 1, registration: 1, teaching_post: 1 } }, 'Historical public media reference set differs from the reviewed scope');
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: 'verified_ready', core, evidenceSha256, rawValuesPersisted: false, providerWrites: false };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256, ...summary(records), rawValuesPersisted: false, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.status, 'verified_ready');
assert.equal(saved.evidenceSha256, args[1], 'The supplied evidence hash does not match the saved rewrite inventory');
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'The saved rewrite evidence was changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Rewrite evidence is older than 30 minutes; inventory again');
assert.equal(saved.core.proposalCheckedAt, proposal.checkedAt, 'Ownership proposal changed after rewrite inventory');
const records = await collect(proposal), freshCore = await evidenceCore(proposal, records);
assert.equal(await sha256(JSON.stringify(freshCore)), saved.evidenceSha256, 'Production media references changed after rewrite inventory');

const d1Records = records.filter(record => record.store === 'd1');
if (d1Records.length) {
  const table = { registration: 'registrations', commerce_product: 'commerce_products', announcement: 'parish_announcements', teaching_post: 'parish_teaching_posts' };
  const sql = d1Records.map(record => `UPDATE ${table[record.source]} SET ${record.valueColumn}=${q(record.after)} WHERE ${record.idColumn}=${q(record.id)} AND parish_id=${q(record.parishId)} AND ${record.valueColumn}=${q(record.before)};`).join('\n');
  const batches = d1(sql, true);
  assert.equal(batches.length, d1Records.length, 'D1 rewrite batch count mismatch');
  assert.ok(batches.every(batch => batch.meta?.changes === 1), 'A conditional D1 media rewrite did not change exactly one row');
}

writeProxyConfig();
const proxy = await getPlatformProxy({ configPath: proxyConfigPath, envFiles: [], remoteBindings: true, persist: false });
try {
  const kv = proxy.env[kvBinding];
  for (const record of records.filter(item => item.store === 'kv')) {
    const pending = d1(`UPDATE parish_portability_legacy_keys SET source_hash=${q(record.afterSha256)},state='pending',updated_at=${Date.now()} WHERE object_key=${q(record.id)} AND parish_id=${q(record.parishId)} AND source_hash=${q(record.beforeSha256)} AND state='stored';`, true);
    assert.equal(pending[0].meta?.changes, 1, 'Legacy KV registry did not enter the guarded pending state');
    await kv.put(record.id, record.after);
    let readback = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      readback = await kv.get(record.id);
      if (readback !== null && await sha256(readback) === record.afterSha256) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
    assert.notEqual(readback, null, 'Legacy KV rewrite readback is missing');
    assert.equal(await sha256(readback), record.afterSha256, 'Legacy KV rewrite readback hash mismatch');
    const stored = d1(`UPDATE parish_portability_legacy_keys SET state='stored',updated_at=${Date.now()} WHERE object_key=${q(record.id)} AND parish_id=${q(record.parishId)} AND source_hash=${q(record.afterSha256)} AND state='pending';`, true);
    assert.equal(stored[0].meta?.changes, 1, 'Legacy KV registry did not return to stored state');
  }
} finally { await proxy.dispose(); }

const remaining = await collect(proposal);
assert.equal(remaining.length, 0, 'Historical public media references remain after rewrite');
for (const record of records) {
  let value;
  if (record.store === 'd1') {
    const table = { registration: 'registrations', commerce_product: 'commerce_products', announcement: 'parish_announcements', teaching_post: 'parish_teaching_posts' };
    const rows = d1(`SELECT ${record.valueColumn} value FROM ${table[record.source]} WHERE ${record.idColumn}=${q(record.id)} AND parish_id=${q(record.parishId)} LIMIT 2;`)[0].results;
    assert.equal(rows.length, 1, 'A rewritten D1 record is missing or ambiguous'); value = rows[0].value;
  } else {
    writeProxyConfig();
    const verifyProxy = await getPlatformProxy({ configPath: proxyConfigPath, envFiles: [], remoteBindings: true, persist: false });
    try { value = await verifyProxy.env[kvBinding].get(record.id); } finally { await verifyProxy.dispose(); }
  }
  assert.equal(await sha256(value), record.afterSha256, 'A rewritten record failed final hash verification');
  let newReferences = 0; const parsed = record.source === 'registration' || record.source === 'legacy_kv' ? JSON.parse(value) : value;
  visitStrings(parsed, item => { if (reference(item, 'new')) newReferences++; });
  assert.equal(newReferences, record.replacements, 'A rewritten record failed final Worker URL verification');
}
const appliedAt = new Date().toISOString();
writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_and_verified', appliedAt, providerWrites: true }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'applied_and_verified', appliedAt, evidenceSha256: saved.evidenceSha256, ...summary(records), historicalReferencesRemaining: 0, r2DevDisabled: false }, null, 2));
