// Operator-only observation of natural lifecycle expiry in the isolated test bucket.
// --plant writes one synthetic object. --check only reads it; neither runs a sweep.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';

const action = process.argv[2];
if (!['--plant', '--check'].includes(action) || process.argv.length !== 3) {
  console.log('Usage: node scripts/portability-staging-expiry.mjs --plant|--check');
  process.exit(action ? 1 : 0);
}
const dir = path.resolve('artifacts/portability-staging');
const configPath = path.join(dir, 'wrangler.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const resources = JSON.parse(readFileSync(path.join(dir, 'resources.json'), 'utf8'));
const drill = JSON.parse(readFileSync(path.join(dir, 'hosted-drill-state.json'), 'utf8'));
const prefix = 'agapay-portability-staging-20260828';
assert.equal(config.name, prefix);
assert.equal(resources.prefix, prefix);
assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);
assert.ok(!config.main && !config.routes && !config.services && !config.assets && !config.browser);
assert.deepEqual(config.triggers.crons, []);
const bucketConfig = config.r2_buckets.find(r => r.binding === 'ACCOUNTING_BACKUPS');
assert.equal(bucketConfig.bucket_name, prefix + '-backups');
assert.equal(bucketConfig.bucket_name, resources.r2.ACCOUNTING_BACKUPS.name);
assert.equal(bucketConfig.remote, true);
assert.equal(drill.hostedInvocationCertified, true);
assert.equal(drill.status, 'passed', 'Complete the remote drill before starting the natural expiry observation');
assert.equal(resources.safeguards['expiry-ACCOUNTING_BACKUPS'], true);
assert.match(resources.safeguards.ACCOUNTING_BACKUPS.publicAccess, /Public access via the r2\.dev URL is disabled/);
assert.match(resources.safeguards.ACCOUNTING_BACKUPS.domains, /There are no custom domains/);
const statePath = path.join(dir, 'natural-expiry-state.json');
const key = 'trial/natural-expiry-probe.json';
const body = JSON.stringify({ purpose: 'synthetic lifecycle observation', evidenceSha256: drill.evidenceSha256 });
const hash = await sha256(body);
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
if (state) {
  assert.equal(state.key, key);
  assert.equal(state.bucket, bucketConfig.bucket_name);
  assert.equal(state.sha256, hash);
}
if (action === '--check') assert.ok(state, 'Plant and record the observation object first');
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: true, persist: false });
try {
  const bucket = proxy.env.ACCOUNTING_BACKUPS;
  if (action === '--plant') {
    if (!state) {
      // Persist intent before writing, so a lost response cannot restart object age.
      state = { key, bucket: bucketConfig.bucket_name, sha256: hash, evidenceSha256: drill.evidenceSha256, status: 'planting', observations: [] };
      save();
      assert.equal(await bucket.head(key), null, 'Unexpected existing probe requires operator review');
      await bucket.put(key, body, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: hash }, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
    }
    const object = await bucket.head(key);
    assert.ok(object, 'Probe is missing; do not recreate it or reset its age');
    assert.equal(object.customMetadata.sha256, hash);
    assert.equal(object.size, new TextEncoder().encode(body).length);
    const uploadedAt = new Date(object.uploaded).toISOString();
    if (state.uploadedAt) assert.equal(uploadedAt, state.uploadedAt);
    state.uploadedAt = uploadedAt;
    state.expiresAfter = new Date(Date.parse(uploadedAt) + 86400000).toISOString();
    state.status = 'awaiting_natural_expiry';
    save();
    console.log(`Probe recorded. One-day lifecycle threshold: ${state.expiresAfter}. Actual deletion can occur later. Do not run the application sweep, delete, or rewrite this object during observation.`);
  } else {
    assert.ok(state.uploadedAt && state.expiresAfter, 'Probe planting needs review');
    const object = await bucket.head(key);
    const checkedAt = new Date().toISOString();
    state.observations.push({ checkedAt, present: Boolean(object) });
    if (object) {
      assert.equal(new Date(object.uploaded).toISOString(), state.uploadedAt, 'Object age changed');
      assert.equal(object.customMetadata.sha256, hash);
      state.status = 'awaiting_natural_expiry';
    } else if (Date.now() < Date.parse(state.expiresAfter)) {
      state.status = 'unexpected_early_absence';
      save();
      throw new Error('Object disappeared before the lifecycle threshold; investigate, do not count this as expiry evidence');
    } else {
      state.status = 'absence_observed_after_threshold';
      state.absenceObservedAt = checkedAt;
    }
    save();
    console.log(JSON.stringify({ status: state.status, checkedAt, expiresAfter: state.expiresAfter, note: 'Read-only HEAD observation. Confirm no manual deletion/sweep occurred. This does not verify production backup retention or D1 Time Travel.' }, null, 2));
  }
} finally {
  await proxy.dispose();
}
