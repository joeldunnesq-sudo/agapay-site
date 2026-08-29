// Guarded qualification of the newest private production D1 backup in a new,
// unbound scratch D1 database. Default is a no-network plan. Apply requires a
// fresh metadata evidence hash, verifies the stored checksum, validates only the
// scratch copy, deletes that copy after success, and always removes local backup
// bytes. It never writes to production or to the source R2 bucket.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'artifacts/portability-staging');
const evidencePath = path.join(dir, 'production-quarantined-d1-restore.json');
const proxyConfigPath = path.join(dir, 'production-quarantined-d1-restore-wrangler.json');
const targetConfigPath = path.join(dir, 'production-quarantined-d1-restore-target-wrangler.json');
const barrierPath = path.join(root, 'docs/data-portability/install-write-barriers.sql');
const bucket = 'agapay-accounting-backups';
const prefix = 'platform-d1/';
const target = 'agapay-portability-restore-qualification-20260829';
const accountId = '9198ae5ea8adc59e5dedd1b09c9478b9';
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    inventory: 'node scripts/portability-quarantined-d1-restore.mjs --inventory',
    apply: 'node scripts/portability-quarantined-d1-restore.mjs --apply <evidence-sha256>',
    scope: 'newest paired private production central-D1 SQL/checksum artifact',
    safeguards: ['metadata-only inventory', 'fresh exact evidence hash', 'stored SHA-256 verification', 'migration history required before target creation', 'fixed unbound nonproduction target', 'production IDs refused', 'read-only restored-copy validator', 'success-only scratch deletion readback', 'local backup bytes always removed'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--inventory' || args[0] === '--apply', 'Use --inventory or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1);
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/);
mkdirSync(dir, { recursive: true });

const productionConfig = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').split(/^\[env\.staging\]/m)[0];
const protectedIds = new Set([...productionConfig.matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]{32,})"/g)].map(match => match[1]));
const protectedNames = new Set([...productionConfig.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map(match => match[1]));
assert.ok(target.includes('portability') && target.includes('restore') && !target.includes('production'));
assert.ok(!protectedNames.has(target));

function run(commandArgs, { allowFailure = false, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
    cwd: root, encoding: 'utf8', maxBuffer, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (!allowFailure && result.status !== 0) throw new Error('Quarantined restore provider command failed');
  return result;
}

function databases() {
  const result = run(['d1', 'list', '--json']);
  return JSON.parse(result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim());
}

function writeProxyConfig() {
  writeFileSync(proxyConfigPath, JSON.stringify({
    name: 'agapay-portability-quarantined-d1-restore', account_id: accountId,
    compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
    r2_buckets: [{ binding: 'ACCOUNTING_BACKUPS', bucket_name: bucket, remote: true }],
    triggers: { crons: [] }
  }, null, 2) + '\n');
}

async function inventory() {
  writeProxyConfig();
  const proxy = await getPlatformProxy({ configPath: proxyConfigPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    const store = proxy.env.ACCOUNTING_BACKUPS;
    assert.ok(store?.list, 'Private backup bucket binding is unavailable');
    const objects = []; let cursor;
    do {
      const page = await store.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const object of page.objects || []) objects.push({ key: object.key, size: Number(object.size), etag: object.etag, uploaded: new Date(object.uploaded).toISOString() });
      if (!page.truncated) break;
      assert.ok(page.cursor && page.cursor !== cursor); cursor = page.cursor;
    } while (cursor);
    const sqlObjects = objects.filter(object => object.key.endsWith('.sql')).sort((a, b) => Date.parse(b.uploaded) - Date.parse(a.uploaded));
    assert.ok(sqlObjects.length > 0, 'No private production D1 SQL backups were found');
    const sql = sqlObjects[0], checksum = objects.find(object => object.key === sql.key + '.sha256');
    assert.ok(checksum, 'Newest SQL backup has no matching checksum object');
    assert.ok(sql.size > 0 && checksum.size > 64 && checksum.size < 1024);
    assert.ok(Date.now() - Date.parse(sql.uploaded) <= 48 * 60 * 60 * 1000, 'Newest production D1 backup is older than 48 hours');
    const migrations = [];
    for (const name of readdirSync(path.join(root, 'migrations')).filter(name => name.endsWith('.sql')).sort()) {
      migrations.push({ name, sha256: await sha256(readFileSync(path.join(root, 'migrations', name))) });
    }
    return { bucket, prefix, sql, checksum, candidateCount: sqlObjects.length, migrationSetSha256: await sha256(JSON.stringify(migrations)), barrierSha256: await sha256(readFileSync(barrierPath)) };
  } finally { await proxy.dispose(); }
}

const savedCore = value => ({
  bucket: value.bucket, prefix: value.prefix, candidateCount: value.candidateCount,
  sql: value.sql, checksum: value.checksum, target,
  migrationSetSha256: value.migrationSetSha256, barrierSha256: value.barrierSha256
});

if (args[0] === '--inventory') {
  const current = await inventory(), core = savedCore(current), evidenceSha256 = await sha256(JSON.stringify(core));
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: 'verified_ready', core, evidenceSha256, objectBodiesRead: false, providerWrites: false };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256, candidateBackups: current.candidateCount, newestUploadedAt: current.sql.uploaded, sqlBytes: current.sql.size, checksumBytes: current.checksum.size, objectBodiesRead: false, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.status, 'verified_ready');
assert.equal(saved.evidenceSha256, args[1]);
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'Saved restore evidence was changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Restore evidence is older than 30 minutes; inventory again');
const current = await inventory(), freshCore = savedCore(current);
assert.equal(await sha256(JSON.stringify(freshCore)), saved.evidenceSha256, 'Private backup inventory changed after review');
assert.equal(databases().filter(database => database.name === target).length, 0, 'Fixed restore target already exists; investigate rather than reuse it');

const sqlPath = path.join(dir, 'quarantined-restore-source.sql');
const checksumPath = path.join(dir, 'quarantined-restore-source.sql.sha256');
assert.ok(!existsSync(sqlPath) && !existsSync(checksumPath), 'Local restore files already exist; investigate before continuing');
let created = null, validation = null;
try {
  run(['r2', 'object', 'get', `${bucket}/${current.sql.key}`, '--remote', '--file', sqlPath]);
  run(['r2', 'object', 'get', `${bucket}/${current.checksum.key}`, '--remote', '--file', checksumPath]);
  const expected = readFileSync(checksumPath, 'utf8').trim().match(/^([a-f0-9]{64})\s+/i)?.[1]?.toLowerCase();
  assert.match(expected || '', /^[a-f0-9]{64}$/, 'Stored checksum format is invalid');
  const bytes = readFileSync(sqlPath);
  const actual = await sha256(bytes);
  assert.equal(actual, expected, 'Private backup checksum mismatch');
  const sqlText = bytes.toString('utf8');
  assert.match(sqlText, /(?:CREATE TABLE|INSERT INTO)\s+["`]?d1_migrations["`]?/i, 'Backup lacks D1 migration history; no restore target was created');
  assert.ok(sqlText.includes('PRAGMA foreign_keys=OFF;'), 'Backup lacks the reviewed restore-session foreign-key preamble');

  run(['d1', 'create', target]);
  const matches = databases().filter(database => database.name === target);
  assert.equal(matches.length, 1, 'Scratch restore target creation readback is ambiguous');
  created = matches[0];
  assert.ok(created.uuid && !protectedIds.has(created.uuid), 'Scratch restore target conflicts with a configured database');
  run(['d1', 'execute', target, '--remote', '--file', sqlPath], { maxBuffer: 128 * 1024 * 1024 });

  writeFileSync(targetConfigPath, JSON.stringify({
    name: 'agapay-portability-quarantined-d1-restore-target', account_id: accountId,
    compatibility_date: '2026-05-25', workers_dev: false, preview_urls: false,
    d1_databases: [{ binding: 'RESTORE_TARGET', database_name: target, database_id: created.uuid, migrations_dir: path.join(root, 'migrations').replaceAll('\\', '/'), remote: true }],
    triggers: { crons: [] }
  }, null, 2) + '\n');
  run(['d1', 'migrations', 'apply', 'RESTORE_TARGET', '--remote', '--config', targetConfigPath], { maxBuffer: 128 * 1024 * 1024 });
  run(['d1', 'execute', 'RESTORE_TARGET', '--remote', '--file', barrierPath, '--config', targetConfigPath], { maxBuffer: 128 * 1024 * 1024 });

  validation = spawnSync(process.execPath, [path.join(root, 'scripts/validate-restore.mjs'), target], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(validation.status, 0, 'Read-only validation failed; scratch database was left isolated for investigation');
  const validationSha256 = await sha256(String(validation.stdout || ''));
  run(['d1', 'delete', target, '--skip-confirmation']);
  assert.equal(databases().filter(database => database.name === target).length, 0, 'Scratch restore target deletion readback failed');
  const completedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_validated_and_removed', completedAt, sourceSha256: actual, targetUuidSha256: await sha256(created.uuid), validationSha256, currentMigrationsApplied: true, barriersRegenerated: true, scratchDeleted: true, localCopiesDeleted: true, providerWrites: true }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'applied_validated_and_removed', completedAt, evidenceSha256: saved.evidenceSha256, newestUploadedAt: current.sql.uploaded, sourceChecksumVerified: true, migrationHistoryPresent: true, currentMigrationsApplied: true, barriersRegenerated: true, validatorPassed: true, scratchDeleted: true, localCopiesDeleted: true, productionWrites: false }, null, 2));
} finally {
  if (existsSync(sqlPath)) unlinkSync(sqlPath);
  if (existsSync(checksumPath)) unlinkSync(checksumPath);
}
