import assert from 'node:assert/strict';
import { cloudBackupStatus } from '../src/portability/cloud-backup.js';
import { handleParishPortability } from '../src/handlers/parish-portability.js';
import { memoryBucket, portabilityFixture } from './portability-tests/fixtures.mjs';

const now = Date.now();
const bucket = memoryBucket();
const env = { ACCOUNTING_BACKUPS: bucket };
const manifest = {
  createdAt: new Date(now - 3600000).toISOString(),
  validation: { localRestore: 'passed', quickCheck: 'ok' },
  artifact: { backupKey: 'platform-d1/test.sql', bytes: 3, sha256: 'a'.repeat(64) },
};
const publish = () => bucket.put('platform-d1/verified.json', JSON.stringify(manifest));
assert.equal((await cloudBackupStatus({}, now)).status, 'unavailable');
await bucket.put('platform-d1/latest.json', JSON.stringify(manifest));
assert.equal((await cloudBackupStatus(env, now)).status, 'unavailable', 'unverified latest is not evidence');
await publish();
assert.equal((await cloudBackupStatus(env, now)).status, 'unavailable', 'missing artifact');
await bucket.put(manifest.artifact.backupKey, 'sql');
let status = await cloudBackupStatus(env, now);
assert.equal(status.status, 'verified');
assert.equal(status.backedUpAt, manifest.createdAt);
assert.equal(JSON.stringify(status).includes('test.sql'), false, 'no storage keys disclosed');
assert.equal((await cloudBackupStatus(env, now + 49 * 3600000)).status, 'overdue');
manifest.createdAt = new Date(now + 1000).toISOString();
await publish();
assert.equal((await cloudBackupStatus(env, now)).status, 'unavailable', 'future dates rejected');
await bucket.put('platform-d1/verified.json', '{');
assert.equal((await cloudBackupStatus(env, now)).status, 'unavailable', 'invalid JSON handled');
assert.equal(
  (
    await cloudBackupStatus(
      {
        ACCOUNTING_BACKUPS: {
          get() {
            throw new Error('private provider error');
          },
        },
      },
      now
    )
  ).status,
  'unavailable'
);

const fixture = await portabilityFixture();
try {
  const call = (token) =>
    handleParishPortability(
      new Request('https://agapay.test/api', { headers: token ? { Authorization: 'Bearer ' + token } : {} }),
      fixture.env,
      'parish-a',
      '/backup-status'
    );
  assert.equal((await call()).status, 401);
  assert.equal((await call(fixture['parish-b'])).status, 401, 'another parish cannot read status');
  const response = await call(fixture['parish-a']);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal((await response.json()).cloud.status, 'unavailable');
  // Reading status must not create a job or modify data.
  assert.equal(fixture.db.prepare('SELECT count(*) n FROM parish_portability_jobs').get().n, 0);
} finally {
  fixture.db.close();
}
console.log('PASS - cloud backup evidence, freshness, failure handling, authorization, and private caching');
