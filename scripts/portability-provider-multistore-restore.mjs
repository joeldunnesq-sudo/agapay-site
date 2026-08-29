// Guarded qualification of a real provider snapshot across central D1,
// accounting D1, parish R2 files, and legacy KV. Production is read-only.
// Default is a plan; --apply requires a fresh --inventory evidence hash.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = path.join(root, 'artifacts/portability-staging');
const evidencePath = path.join(artifactDir, 'production-provider-multistore-restore.json');
const sourceConfigPath = path.join(artifactDir, 'production-provider-multistore-source-wrangler.json');
const copyConfigPath = path.join(artifactDir, 'production-provider-multistore-copy-wrangler.json');
const targetConfigPath = path.join(artifactDir, 'production-provider-multistore-target-wrangler.json');
const centralSqlPath = path.join(artifactDir, 'provider-multistore-central.sql');
const accountingSqlPath = path.join(artifactDir, 'provider-multistore-accounting.sql');
const accountId = '9198ae5ea8adc59e5dedd1b09c9478b9';
const prefix = 'agapay-portability-multistore-restore-20260829';
const sources = Object.freeze({
  central: { name: 'agapay-production', id: '24f514a6-6904-425b-a4c8-b3584b23c0be' },
  accounting: { name: 'agapay-acct-production-4ab22bac06dca8b80e70', id: '7d3a6a59-f622-4303-9e84-e1074879d11d' },
  kv: { name: 'AGAPAY_REGISTRATIONS', id: 'c0c630d2699a4d42a72db927c6341707' }
});
const sourceBuckets = Object.freeze({
  CAMPAIGN_ASSETS: 'agapay-campaign-assets', ANNOUNCEMENT_ASSETS: 'agapay-announcement-assets',
  TEACHING_ASSETS: 'agapay-teaching-assets', GROUP_MESSAGE_ASSETS: 'agapay-group-message-assets',
  DIRECTORY_MEDIA: 'agapay-directory-media', TAX_EXEMPTION_DOCS: 'agapay-tax-exemption-docs',
  NONPROFIT_PRICING_DOCS: 'agapay-nonprofit-pricing-docs', GIVING_STATEMENTS: 'agapay-giving-statements',
  ACCOUNTING_ATTACHMENTS: 'agapay-accounting-attachments'
});
const targetNames = Object.freeze({
  central: prefix + '-central', accounting: prefix + '-accounting', kv: prefix + '-kv'
});
const bucketSuffix = Object.freeze({
  CAMPAIGN_ASSETS: 'campaign', ANNOUNCEMENT_ASSETS: 'announcement', TEACHING_ASSETS: 'teaching',
  GROUP_MESSAGE_ASSETS: 'group', DIRECTORY_MEDIA: 'directory', TAX_EXEMPTION_DOCS: 'tax',
  NONPROFIT_PRICING_DOCS: 'nonprofit', GIVING_STATEMENTS: 'statements', ACCOUNTING_ATTACHMENTS: 'attachments'
});
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    inventory: 'node scripts/portability-provider-multistore-restore.mjs --inventory',
    apply: 'node scripts/portability-provider-multistore-restore.mjs --apply <evidence-sha256>',
    sourceScope: ['central D1', 'St. Fiacre accounting D1', '9 parish file buckets', 'legacy KV'],
    safeguards: ['production bindings read-only', 'fresh exact evidence hash', 'fixed unbound private scratch resources', 'source stability readback', 'body hashes compared after restore', 'current migrations and barriers applied', 'scratch and local SQL removal verified'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--inventory' || args[0] === '--apply', 'Use --inventory or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1);
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/);
mkdirSync(artifactDir, { recursive: true });

const productionConfig = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').split(/^\[env\.staging\]/m)[0];
for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED', 'ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED']) {
  assert.match(productionConfig, new RegExp(`^${flag} = "false"$`, 'm'), `${flag} must remain false`);
}
for (const source of [sources.central, sources.accounting]) {
  assert.match(productionConfig, new RegExp(`database_name = "${source.name}"[\\s\\S]{0,180}database_id = "${source.id}"`));
}
assert.match(productionConfig, new RegExp(`binding = "${sources.kv.name}"\\s+id = "${sources.kv.id}"`));
for (const [binding, bucket] of Object.entries(sourceBuckets)) assert.match(productionConfig, new RegExp(`binding = "${binding}"\\s+bucket_name = "${bucket}"`));
const protectedNames = new Set([sources.central.name, sources.accounting.name, sources.kv.name, ...Object.values(sourceBuckets)]);
const protectedIds = new Set([sources.central.id, sources.accounting.id, sources.kv.id]);
for (const name of Object.values(targetNames)) {
  assert.ok(name.startsWith(prefix) && !name.includes('production') && !protectedNames.has(name));
}

function run(commandArgs, { allowFailure = false, maxBuffer = 128 * 1024 * 1024 } = {}) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
    cwd: root, encoding: 'utf8', maxBuffer, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Provider command failed during ${commandArgs.slice(0, 3).join(' ')}`);
  }
  return result;
}
const clean = value => String(value || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
function jsonCommand(commandArgs) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = run(commandArgs, { allowFailure: true });
    if (result.status === 0) return JSON.parse(clean(result.stdout));
    if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
  }
  throw new Error(`Provider read failed during ${commandArgs.slice(0, 3).join(' ')}`);
}
function d1List() { return jsonCommand(['d1', 'list', '--json']); }
function kvList() { return jsonCommand(['kv', 'namespace', 'list']); }
function r2Exists(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = run(['r2', 'bucket', 'info', name], { allowFailure: true });
    if (result.status === 0) return true;
    const detail = clean(result.stderr || result.stdout);
    if (/does not exist|not found|10006/i.test(detail)) return false;
    if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
  }
  throw new Error('Provider could not verify scratch R2 bucket absence');
}
function d1Read(database, statement) {
  const value = jsonCommand(['d1', 'execute', database, '--remote', '--command', statement + ';', '--json']);
  assert.equal(value.length, 1); assert.equal(value[0].success, true);
  assert.equal(value[0].meta?.changes, 0); assert.equal(value[0].meta?.rows_written, 0);
  return value[0].results;
}
function writeSourceConfig() {
  writeFileSync(sourceConfigPath, JSON.stringify({
    name: prefix + '-source-reader', account_id: accountId, compatibility_date: '2026-05-25',
    workers_dev: false, preview_urls: false,
    kv_namespaces: [{ binding: 'SOURCE_KV', id: sources.kv.id, remote: true }],
    r2_buckets: Object.entries(sourceBuckets).map(([binding, bucket_name]) => ({ binding: 'SOURCE_' + binding, bucket_name, remote: true })),
    triggers: { crons: [] }
  }, null, 2) + '\n');
}
async function listR2(bucket) {
  const objects = []; let cursor;
  do {
    const page = await bucket.list({ limit: 1000, include: ['httpMetadata', 'customMetadata'], ...(cursor ? { cursor } : {}) });
    for (const object of page.objects || []) objects.push(object);
    if (!page.truncated) break;
    assert.ok(page.cursor && page.cursor !== cursor); cursor = page.cursor;
  } while (cursor);
  return objects;
}
async function listKv(kv) {
  const keys = []; let cursor;
  do {
    const page = await kv.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    keys.push(...(page.keys || []));
    if (page.list_complete) break;
    assert.ok(page.cursor && page.cursor !== cursor); cursor = page.cursor;
  } while (cursor);
  return keys;
}
async function migrationSetHash(directory) {
  const records = [];
  for (const name of readdirSync(path.join(root, directory)).filter(name => name.endsWith('.sql')).sort()) {
    records.push({ name, sha256: await sha256(readFileSync(path.join(root, directory, name))) });
  }
  return sha256(JSON.stringify(records));
}
async function normalizeRestoreSession(file) {
  const source = readFileSync(file), sourceSha256 = await sha256(source);
  let sql = source.toString('utf8');
  assert.match(sql, /^PRAGMA defer_foreign_keys=TRUE;/, 'Provider export has an unexpected restore preamble');
  sql = `PRAGMA foreign_keys=OFF;\n${sql}`;
  writeFileSync(file, sql);
  return { sourceSha256, restoreSha256: await sha256(readFileSync(file)) };
}
async function inventory({ allowScratch = false } = {}) {
  writeSourceConfig();
  const dbs = d1List();
  for (const source of [sources.central, sources.accounting]) assert.equal(dbs.filter(db => db.name === source.name && db.uuid === source.id).length, 1);
  if (!allowScratch) assert.equal(dbs.filter(db => db.name === targetNames.central || db.name === targetNames.accounting).length, 0, 'Scratch D1 target already exists');
  const namespaces = kvList();
  assert.equal(namespaces.filter(item => item.id === sources.kv.id).length, 1);
  if (!allowScratch) assert.equal(namespaces.filter(item => item.title === targetNames.kv || item.name === targetNames.kv).length, 0, 'Scratch KV target already exists');
  const proxy = await getPlatformProxy({ configPath: sourceConfigPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    const bucketCore = {}, details = {};
    for (const [binding] of Object.entries(sourceBuckets)) {
      const objects = await listR2(proxy.env['SOURCE_' + binding]);
      const identity = objects.map(object => `${object.key}\u0000${object.etag}\u0000${object.size}`).sort();
      const target = prefix + '-' + bucketSuffix[binding];
      assert.ok(target.length <= 63 && !protectedNames.has(target));
      if (objects.length && !allowScratch) assert.equal(r2Exists(target), false, `Scratch R2 target already exists: ${target}`);
      bucketCore[binding] = { objects: objects.length, bytes: objects.reduce((sum, item) => sum + Number(item.size), 0), keySetSha256: await sha256(JSON.stringify(identity)), target: objects.length ? target : null };
      details[binding] = objects;
    }
    const keys = await listKv(proxy.env.SOURCE_KV);
    const kvCore = { keys: keys.length, keySetSha256: await sha256(JSON.stringify(keys.map(item => item.name).sort())) };
    const core = {
      sources, targets: targetNames, buckets: bucketCore, kv: kvCore,
      centralMigrationSetSha256: await migrationSetHash('migrations'),
      accountingMigrationSetSha256: await migrationSetHash('accounting-migrations'),
      barrierSha256: await sha256(readFileSync(path.join(root, 'docs/data-portability/install-write-barriers.sql')))
    };
    return { core, details: { buckets: details, kvKeys: keys } };
  } finally { await proxy.dispose(); }
}

const accountingFingerprintSql = `SELECT
 (SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') tables,
 (SELECT count(*) FROM accounting_migrations) migrations,
 (SELECT count(*) FROM accounting_journal_entries) journal_entries,
 (SELECT count(*) FROM accounting_journal_lines) journal_lines,
 (SELECT coalesce(sum(debit_amount),0) FROM accounting_journal_lines) debits,
 (SELECT coalesce(sum(credit_amount),0) FROM accounting_journal_lines) credits,
 (SELECT count(*) FROM accounting_attachments) attachments,
 (SELECT count(*) FROM accounting_database_metadata WHERE key='parish_id' AND value IS NOT NULL AND value<>'') parish_identity`;
const accountingSchemaSql = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name";

if (args[0] === '--inventory') {
  const current = await inventory();
  const evidenceSha256 = await sha256(JSON.stringify(current.core));
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: 'verified_ready', core: current.core, evidenceSha256, objectBodiesRead: false, providerWrites: false };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256, centralDatabase: true, accountingDatabase: true, r2Objects: Object.values(current.core.buckets).reduce((sum, item) => sum + item.objects, 0), r2Bytes: Object.values(current.core.buckets).reduce((sum, item) => sum + item.bytes, 0), kvKeys: current.core.kv.keys, objectBodiesRead: false, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.status, 'verified_ready'); assert.equal(saved.evidenceSha256, args[1]);
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'Saved evidence changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Evidence is older than 30 minutes; inventory again');
const fresh = await inventory();
assert.equal(await sha256(JSON.stringify(fresh.core)), saved.evidenceSha256, 'Provider inventory changed after review');
assert.ok(!existsSync(centralSqlPath) && !existsSync(accountingSqlPath), 'Temporary SQL files already exist');

const created = { d1: [], kv: null, r2: [] };
let copyProxy = null, completed = false, cleanupVerified = false;
const operation = { r2Objects: 0, r2Bytes: 0, kvKeys: 0 };
try {
  const accountingBefore = d1Read(sources.accounting.name, accountingFingerprintSql);
  assert.equal(accountingBefore.length, 1); assert.equal(Number(accountingBefore[0].parish_identity), 1);
  run(['d1', 'export', sources.central.name, '--remote', '--skip-confirmation', '--output', centralSqlPath]);
  run(['d1', 'export', sources.accounting.name, '--remote', '--skip-confirmation', '--output', accountingSqlPath]);
  const centralExport = await normalizeRestoreSession(centralSqlPath);
  const accountingExport = await normalizeRestoreSession(accountingSqlPath);
  assert.match(readFileSync(centralSqlPath, 'utf8'), /(?:CREATE TABLE|INSERT INTO)\s+["`]?d1_migrations["`]?/i);
  assert.match(readFileSync(accountingSqlPath, 'utf8'), /accounting_migrations/i);

  for (const [kind, name] of [['central', targetNames.central], ['accounting', targetNames.accounting]]) {
    run(['d1', 'create', name, '--update-config=false']);
    const match = d1List().filter(db => db.name === name);
    assert.equal(match.length, 1); assert.ok(match[0].uuid && !protectedIds.has(match[0].uuid));
    created.d1.push({ kind, name, id: match[0].uuid });
  }
  run(['kv', 'namespace', 'create', targetNames.kv, '--update-config=false']);
  const kvMatch = kvList().filter(item => (item.title || item.name) === targetNames.kv);
  assert.equal(kvMatch.length, 1); assert.ok(kvMatch[0].id && !protectedIds.has(kvMatch[0].id));
  created.kv = { name: targetNames.kv, id: kvMatch[0].id };
  for (const [binding, info] of Object.entries(fresh.core.buckets)) if (info.objects) {
    run(['r2', 'bucket', 'create', info.target]);
    run(['r2', 'bucket', 'dev-url', 'disable', info.target]);
    assert.match(clean(run(['r2', 'bucket', 'dev-url', 'get', info.target]).stdout), /Public access via the r2\.dev URL is disabled/);
    assert.match(clean(run(['r2', 'bucket', 'domain', 'list', info.target]).stdout), /There are no custom domains/);
    created.r2.push({ binding, name: info.target });
  }

  writeFileSync(targetConfigPath, JSON.stringify({
    name: prefix + '-targets', account_id: accountId, compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
    d1_databases: created.d1.map(item => ({ binding: item.kind === 'central' ? 'RESTORE_CENTRAL' : 'RESTORE_ACCOUNTING', database_name: item.name, database_id: item.id, migrations_dir: path.join(root, item.kind === 'central' ? 'migrations' : 'accounting-migrations').replaceAll('\\', '/'), remote: true })),
    triggers: { crons: [] }
  }, null, 2) + '\n');
  run(['d1', 'execute', targetNames.central, '--remote', '--file', centralSqlPath]);
  run(['d1', 'execute', targetNames.accounting, '--remote', '--file', accountingSqlPath]);
  run(['d1', 'migrations', 'apply', 'RESTORE_CENTRAL', '--remote', '--config', targetConfigPath]);
  run(['d1', 'execute', 'RESTORE_CENTRAL', '--remote', '--file', path.join(root, 'docs/data-portability/install-write-barriers.sql'), '--config', targetConfigPath]);
  const centralValidation = spawnSync(process.execPath, [path.join(root, 'scripts/validate-restore.mjs'), targetNames.central], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(centralValidation.status, 0, 'Central restored-copy validation failed');
  const accountingAfter = d1Read(sources.accounting.name, accountingFingerprintSql);
  const accountingRestored = d1Read(targetNames.accounting, accountingFingerprintSql);
  assert.deepEqual(accountingAfter, accountingBefore, 'Production accounting changed during export');
  assert.deepEqual(accountingRestored, accountingBefore, 'Restored accounting fingerprint differs from source');
  const accountingSourceSchema = d1Read(sources.accounting.name, accountingSchemaSql);
  const accountingRestoredSchema = d1Read(targetNames.accounting, accountingSchemaSql);
  assert.deepEqual(accountingRestoredSchema, accountingSourceSchema, 'Restored accounting schema differs from source');
  assert.equal(Number(accountingRestored[0].debits), Number(accountingRestored[0].credits), 'Restored accounting ledger is unbalanced');

  writeFileSync(copyConfigPath, JSON.stringify({
    name: prefix + '-copy', account_id: accountId, compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
    kv_namespaces: [{ binding: 'SOURCE_KV', id: sources.kv.id, remote: true }, { binding: 'TARGET_KV', id: created.kv.id, remote: true }],
    r2_buckets: created.r2.flatMap(item => [
      { binding: 'SOURCE_' + item.binding, bucket_name: sourceBuckets[item.binding], remote: true },
      { binding: 'TARGET_' + item.binding, bucket_name: item.name, remote: true }
    ]), triggers: { crons: [] }
  }, null, 2) + '\n');
  copyProxy = await getPlatformProxy({ configPath: copyConfigPath, envFiles: [], remoteBindings: true, persist: false });
  const bodyIdentities = [];
  for (const item of created.r2) {
    const sourceBucket = copyProxy.env['SOURCE_' + item.binding], targetBucket = copyProxy.env['TARGET_' + item.binding];
    const sourceObjects = await listR2(sourceBucket);
    for (const object of sourceObjects) {
      const sourceObject = await sourceBucket.get(object.key); assert.ok(sourceObject);
      const bytes = new Uint8Array(await sourceObject.arrayBuffer()), sourceHash = await sha256(bytes);
      await targetBucket.put(object.key, bytes, { httpMetadata: sourceObject.httpMetadata, customMetadata: sourceObject.customMetadata });
      const restoredObject = await targetBucket.get(object.key); assert.ok(restoredObject);
      assert.equal(await sha256(new Uint8Array(await restoredObject.arrayBuffer())), sourceHash);
      const sourceAgain = await sourceBucket.get(object.key); assert.ok(sourceAgain);
      assert.equal(await sha256(new Uint8Array(await sourceAgain.arrayBuffer())), sourceHash, 'Production R2 object changed during copy');
      bodyIdentities.push(item.binding + '\u0000' + object.key + '\u0000' + sourceHash);
      operation.r2Objects++; operation.r2Bytes += bytes.byteLength;
    }
    assert.equal((await listR2(targetBucket)).length, sourceObjects.length);
  }
  const kvIdentities = [];
  const sourceKeys = await listKv(copyProxy.env.SOURCE_KV);
  for (const key of sourceKeys) {
    const value = await copyProxy.env.SOURCE_KV.get(key.name); assert.notEqual(value, null);
    const sourceHash = await sha256(value);
    const options = { ...(key.metadata !== undefined ? { metadata: key.metadata } : {}), ...(Number(key.expiration) > Math.floor(Date.now() / 1000) + 60 ? { expiration: Number(key.expiration) } : {}) };
    await copyProxy.env.TARGET_KV.put(key.name, value, options);
    const restoredValue = await copyProxy.env.TARGET_KV.get(key.name), sourceAgain = await copyProxy.env.SOURCE_KV.get(key.name);
    assert.notEqual(restoredValue, null); assert.notEqual(sourceAgain, null);
    assert.equal(await sha256(restoredValue), sourceHash);
    assert.equal(await sha256(sourceAgain), sourceHash, 'Production KV value changed during copy');
    kvIdentities.push(key.name + '\u0000' + sourceHash); operation.kvKeys++;
  }
  assert.equal((await listKv(copyProxy.env.TARGET_KV)).length, sourceKeys.length);
  const afterCopy = await inventory({ allowScratch: true });
  assert.equal(await sha256(JSON.stringify(afterCopy.core)), saved.evidenceSha256, 'Provider inventory changed during qualification');
  const restoredBodiesSha256 = await sha256(JSON.stringify(bodyIdentities.sort()));
  const restoredKvSha256 = await sha256(JSON.stringify(kvIdentities.sort()));
  completed = true;

  for (const item of created.r2) {
    const bucket = copyProxy.env['TARGET_' + item.binding];
    for (const object of await listR2(bucket)) await bucket.delete(object.key);
    assert.equal((await listR2(bucket)).length, 0);
  }
  await copyProxy.dispose(); copyProxy = null;
  for (const item of created.r2) run(['r2', 'bucket', 'delete', item.name]);
  run(['kv', 'namespace', 'delete', '--namespace-id', created.kv.id, '--skip-confirmation']);
  for (const item of created.d1) run(['d1', 'delete', item.name, '--skip-confirmation']);
  assert.ok(!created.r2.some(item => r2Exists(item.name)));
  assert.ok(!kvList().some(item => item.id === created.kv.id));
  assert.ok(!d1List().some(db => created.d1.some(item => item.id === db.uuid)));
  cleanupVerified = true;
  const completedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_validated_and_removed', completedAt, sourceExportSha256: { central: centralExport.sourceSha256, accounting: accountingExport.sourceSha256 }, restoreSessionSha256: { central: centralExport.restoreSha256, accounting: accountingExport.restoreSha256 }, centralValidationSha256: await sha256(String(centralValidation.stdout || '')), accountingFingerprintSha256: await sha256(JSON.stringify(accountingRestored)), accountingSchemaSha256: await sha256(JSON.stringify(accountingRestoredSchema)), restoredBodiesSha256, restoredKvSha256, operation, scratchDeleted: true, localCopiesDeleted: true, productionWrites: false }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'applied_validated_and_removed', completedAt, evidenceSha256: saved.evidenceSha256, centralRestoreValidated: true, accountingRestoreValidated: true, r2ObjectsRestored: operation.r2Objects, r2BytesRestored: operation.r2Bytes, kvKeysRestored: operation.kvKeys, sourceStabilityVerified: true, scratchDeleted: true, localCopiesDeleted: true, productionWrites: false }, null, 2));
} finally {
  if (!cleanupVerified && (created.d1.length || created.kv || created.r2.length)) {
    try {
      if (!copyProxy && created.r2.length && existsSync(copyConfigPath)) copyProxy = await getPlatformProxy({ configPath: copyConfigPath, envFiles: [], remoteBindings: true, persist: false });
      if (copyProxy) {
        for (const item of created.r2) {
          const bucket = copyProxy.env['TARGET_' + item.binding];
          if (bucket) for (const object of await listR2(bucket)) await bucket.delete(object.key);
        }
        await copyProxy.dispose(); copyProxy = null;
      }
      for (const item of created.r2) if (r2Exists(item.name)) run(['r2', 'bucket', 'delete', item.name]);
      if (created.kv && kvList().some(item => item.id === created.kv.id)) run(['kv', 'namespace', 'delete', '--namespace-id', created.kv.id, '--skip-confirmation']);
      for (const item of created.d1) if (d1List().some(db => db.uuid === item.id)) run(['d1', 'delete', item.name, '--skip-confirmation']);
      cleanupVerified = !created.r2.some(item => r2Exists(item.name))
        && !(created.kv && kvList().some(item => item.id === created.kv.id))
        && !d1List().some(db => created.d1.some(item => item.id === db.uuid));
    } catch (cleanupError) {
      console.error(`Scratch cleanup failed: ${cleanupError.message}`);
    }
  }
  if (copyProxy) await copyProxy.dispose();
  if (existsSync(centralSqlPath)) unlinkSync(centralSqlPath);
  if (existsSync(accountingSqlPath)) unlinkSync(accountingSqlPath);
  if (!cleanupVerified && (created.d1.length || created.kv || created.r2.length)) throw new Error('Scratch cleanup was not verified; investigate fixed scratch resources immediately.');
}
