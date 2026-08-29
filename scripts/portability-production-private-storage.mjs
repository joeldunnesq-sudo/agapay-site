// Provision and verify the three private production portability buckets.
// The default is a no-network plan. --apply requires the exact policy version.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');
const artifactDir = path.join(root, 'artifacts', 'portability-staging');
const evidencePath = path.join(artifactDir, 'production-private-storage.json');
const authorityReadbackPath = path.join(artifactDir, '.production-authority-readback.json');
const authorityUploadPath = path.join(artifactDir, '.production-authority-upload.json');
const policyVersion = '2026-08-28-active-storage-v2';
const authorityId = '25a7aefe-a931-456b-ac59-62d538428e9a';
const buckets = {
  PARISH_EXPORTS: 'agapay-parish-exports',
  PARISH_RETAINED_DATA: 'agapay-parish-retained-data',
  PARISH_CLOSURE_LEDGER: 'agapay-parish-closure-ledger'
};
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    apply: `node scripts/portability-production-private-storage.mjs --apply ${policyVersion}`,
    buckets,
    safeguards: [
      'r2.dev disabled and no custom domains',
      'seven-day parish-exports/ lifecycle',
      'indefinite authority/closure/completion locks',
      'authority object readback',
      'all production feature flags remain false'
    ],
    deploysWorker: false,
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}

assert.deepEqual(args, ['--apply', policyVersion], 'Apply requires the exact reviewed policy version');
const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED', 'ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED']) {
  assert.match(config, new RegExp(`${flag} = "false"`), `${flag} must remain false`);
}
assert.match(config, new RegExp(`PARISH_SUPPRESSION_AUTHORITY = "${authorityId}"`));
for (const [binding, bucket] of Object.entries(buckets)) {
  assert.match(config, new RegExp(`binding = "${binding}"[\\s\\S]{0,120}bucket_name = "${bucket}"`));
}

function clean(value) {
  return String(value || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function wrangler(commandArgs, { allowMissingObject = false } = {}) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  const output = clean(`${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.status !== 0) {
    if (allowMissingObject && /(?:NoSuchKey|not found|does not exist)/i.test(output)) return null;
    throw new Error(`Wrangler command failed: ${commandArgs.slice(0, 5).join(' ')}`);
  }
  return output;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

mkdirSync(artifactDir, { recursive: true });
const listing = wrangler(['r2', 'bucket', 'list']);
const created = [];
for (const bucket of Object.values(buckets)) {
  if (!new RegExp(`name:\\s+${bucket.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s|$)`).test(listing)) {
    wrangler(['r2', 'bucket', 'create', bucket]);
    created.push(bucket);
  }
  wrangler(['r2', 'bucket', 'dev-url', 'disable', bucket]);
}

const exportLifecycleBefore = wrangler(['r2', 'bucket', 'lifecycle', 'list', buckets.PARISH_EXPORTS]);
if (!(exportLifecycleBefore.includes('name:     AGAPAY seven-day temporary export expiry') && /prefix:\s+parish-exports\//.test(exportLifecycleBefore) && /Expire objects after 7 days/.test(exportLifecycleBefore))) {
  wrangler(['r2', 'bucket', 'lifecycle', 'add', buckets.PARISH_EXPORTS, 'AGAPAY seven-day temporary export expiry', 'parish-exports/', '--expire-days', '7', '--force']);
}

const lockRules = [
  ['AGAPAY immutable portability authority', 'authority.json'],
  ['AGAPAY immutable closure authorizations', 'closures/'],
  ['AGAPAY immutable closure completions', 'completions/']
];
const locksBefore = wrangler(['r2', 'bucket', 'lock', 'list', buckets.PARISH_CLOSURE_LEDGER]);
for (const [name, prefix] of lockRules) {
  if (!(locksBefore.includes(`name:       ${name}`) && locksBefore.includes(`prefix:     ${prefix}`))) {
    wrangler(['r2', 'bucket', 'lock', 'add', buckets.PARISH_CLOSURE_LEDGER, name, prefix, '--retention-indefinite', '--force']);
  }
}

rmSync(authorityReadbackPath, { force: true });
let authority = null;
const authorityGet = wrangler(['r2', 'object', 'get', `${buckets.PARISH_CLOSURE_LEDGER}/authority.json`, '--file', authorityReadbackPath, '--remote'], { allowMissingObject: true });
if (authorityGet !== null && existsSync(authorityReadbackPath)) authority = JSON.parse(readFileSync(authorityReadbackPath, 'utf8'));
if (!authority) {
  writeFileSync(authorityUploadPath, JSON.stringify({ id: authorityId, policyVersion }, null, 2) + '\n');
  wrangler(['r2', 'object', 'put', `${buckets.PARISH_CLOSURE_LEDGER}/authority.json`, '--file', authorityUploadPath, '--remote', '--content-type', 'application/json', '--cache-control', 'private, no-store', '--force']);
  rmSync(authorityReadbackPath, { force: true });
  wrangler(['r2', 'object', 'get', `${buckets.PARISH_CLOSURE_LEDGER}/authority.json`, '--file', authorityReadbackPath, '--remote']);
  authority = JSON.parse(readFileSync(authorityReadbackPath, 'utf8'));
}
rmSync(authorityUploadPath, { force: true });
rmSync(authorityReadbackPath, { force: true });
assert.deepEqual(authority, { id: authorityId, policyVersion }, 'Closure authority readback differs');

const privateReadbacks = {};
for (const [binding, bucket] of Object.entries(buckets)) {
  const devUrl = wrangler(['r2', 'bucket', 'dev-url', 'get', bucket]);
  const domains = wrangler(['r2', 'bucket', 'domain', 'list', bucket]);
  assert.match(devUrl, /r2\.dev URL is disabled/i, `${binding} r2.dev must be disabled`);
  assert.match(domains, /no custom domains/i, `${binding} must not have a custom domain`);
  privateReadbacks[binding] = { devUrlSha256: sha256(devUrl), domainsSha256: sha256(domains) };
}
const lifecycle = wrangler(['r2', 'bucket', 'lifecycle', 'list', buckets.PARISH_EXPORTS]);
assert.ok(lifecycle.includes('name:     AGAPAY seven-day temporary export expiry'));
assert.match(lifecycle, /prefix:\s+parish-exports\//);
assert.match(lifecycle, /Expire objects after 7 days/);
const locks = wrangler(['r2', 'bucket', 'lock', 'list', buckets.PARISH_CLOSURE_LEDGER]);
for (const [name, prefix] of lockRules) {
  assert.ok(locks.includes(`name:       ${name}`));
  assert.ok(locks.includes(`prefix:     ${prefix}`));
}
assert.equal((locks.match(/condition:\s+indefinitely/g) || []).length >= 3, true);

const report = {
  checkedAt: new Date().toISOString(),
  status: 'applied_and_verified',
  policyVersion,
  buckets,
  created,
  privateReadbacks,
  exportLifecycleSha256: sha256(lifecycle),
  closureLocksSha256: sha256(locks),
  authoritySha256: sha256(JSON.stringify(authority)),
  workerDeployed: false,
  featureFlagsEnabled: false
};
writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, created: created.length, bucketsVerified: 3, exportLifecycleDays: 7, indefiniteLockRules: 3, authorityVerified: true, workerDeployed: false, featureFlagsEnabled: false }, null, 2));
