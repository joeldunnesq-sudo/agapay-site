import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portabilityFixture, memoryBucket } from './portability-tests/fixtures.mjs';
import { startRecovery, advanceRecovery, recoveryStatus } from '../src/recovery/service.js';
import { handleParishPortability } from '../src/handlers/parish-portability.js';
import { runRecoveryJobs } from '../src/recovery/maintenance.js';
import { issueParishDashboardSession } from '../src/lib/core.js';

const f = await portabilityFixture();
f.db.exec(readFileSync(new URL('../migrations/0128_parish_recovery.sql', import.meta.url), 'utf8'));
Object.assign(f.env, { PARISH_RECOVERY_ENABLED: 'true', DIRECTORY_MEDIA: memoryBucket() });
const begin = (body) =>
  startRecovery(f.env, 'parish-a', 'actor-a', { scope: 'parish', requestKey: crypto.randomUUID(), ...body });
const finish = async (op) => {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await advanceRecovery(f.env, 'parish-a', op.id);
  assert.equal(op.status, 'completed');
  return op;
};
const saveFile = async (key, body) => {
  const result = await f.env.DIRECTORY_MEDIA.put(key, body, { customMetadata: { agapayParishId: 'parish-a' } });
  f.db
    .prepare(
      "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES('DIRECTORY_MEDIA',?,'parish-a','delete','stored',?,1) ON CONFLICT(binding,object_key) DO UPDATE SET etag=excluded.etag,state='stored'"
    )
    .run(key, result.etag);
};
try {
  await saveFile('parish-a/photo.txt', 'original photo');
  f.db
    .prepare(
      'UPDATE registrations SET data=json_set(data,\'$.campaigns\',json(\'[{"id":"roof","name":"Original campaign"}]\')) WHERE parish_id=\'parish-a\''
    )
    .run();
  await finish(await begin({ kind: 'backup' }));
  const target = (await recoveryStatus(f.env, 'parish-a', 'parish')).snapshots[0].id;
  await saveFile('parish-a/photo.txt', 'new photo');
  await saveFile('parish-a/new.txt', 'added after snapshot');
  f.db
    .prepare(
      "UPDATE registrations SET data=json_set(data,'$.campaigns',json('[{\"id\":\"roof\",\"name\":\"Mistaken campaign\"}]'),'$.password','new-password') WHERE parish_id='parish-a'"
    )
    .run();
  f.db.prepare("UPDATE directory_people SET preferred_name='Newer data' WHERE id='a'").run();
  let restore = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE PARISH',
    acknowledged: true,
  });
  for (let i = 0; restore.phase !== 'restore_files' && i < 10; i++)
    restore = await advanceRecovery(f.env, 'parish-a', restore.id);
  f.env.DIRECTORY_MEDIA.failDelete = true;
  await assert.rejects(advanceRecovery(f.env, 'parish-a', restore.id), /synthetic storage failure/);
  assert.equal(
    f.db.prepare('SELECT status FROM parish_recovery_operations WHERE id=?').get(restore.id).status,
    'paused'
  );
  assert.throws(
    () => f.db.prepare("UPDATE directory_people SET notes='must be blocked' WHERE id='a'").run(),
    /RECOVERY_WRITE_BLOCKED/
  );
  await assert.rejects(advanceRecovery(f.env, 'parish-a', restore.id, 'cancel'), /Replacement has started/);
  f.env.DIRECTORY_MEDIA.failDelete = false;
  restore = await advanceRecovery(f.env, 'parish-a', restore.id, 'rollback');
  await finish(restore);
  assert.equal(await (await f.env.DIRECTORY_MEDIA.get('parish-a/photo.txt')).text(), 'new photo');
  assert.equal(await (await f.env.DIRECTORY_MEDIA.get('parish-a/new.txt')).text(), 'added after snapshot');
  assert.equal(
    f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").get().preferred_name,
    'Newer data'
  );
  await finish(
    await begin({ kind: 'restore', snapshotId: target, confirmation: 'RESTORE PARISH', acknowledged: true })
  );
  const data = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data);
  assert.equal(data.campaigns[0].name, 'Original campaign');
  assert.equal(data.password, 'new-password', 'restore keeps current credentials');
  assert.equal(await (await f.env.DIRECTORY_MEDIA.get('parish-a/photo.txt')).text(), 'original photo');
  assert.equal(await f.env.DIRECTORY_MEDIA.get('parish-a/new.txt'), null);
  const call = (token, suffix, body) =>
    handleParishPortability(
      new Request('https://agapay.test/api', {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      f.env,
      'parish-a',
      suffix
    );
  assert.equal((await call(f['parish-b'], '/recovery')).status, 401);
  const status = await call(f['parish-a'], '/recovery');
  assert.equal(status.status, 200);
  assert.match(status.headers.get('Cache-Control'), /no-store/);
  const object = f.env.PARISH_EXPORTS.objects.get('parish-recovery/' + target + '/central.json');
  const original = object.bytes;
  object.bytes = new TextEncoder().encode('{}');
  await assert.rejects(
    begin({ kind: 'restore', snapshotId: target, confirmation: 'RESTORE PARISH', acknowledged: true }),
    /checksum|missing|damaged/
  );
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM parish_recovery_locks').get().n, 0);
  object.bytes = original;
  // A fresh schema change blocks an old point before any replacement, and can be cancelled.
  f.db.exec('CREATE INDEX test_schema_drift ON directory_people(preferred_name)');
  const drift = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE PARISH',
    acknowledged: true,
  });
  await assert.rejects(finish(drift), /structure changed/);
  await advanceRecovery(f.env, 'parish-a', drift.id, 'cancel');
  // Background continuation uses persisted authorization and never needs an open tab.
  const background = await begin({ kind: 'backup' });
  for (let i = 0; i < 8; i++) await runRecoveryJobs(f.env);
  assert.equal(
    f.db.prepare('SELECT status FROM parish_recovery_operations WHERE id=?').get(background.id).status,
    'completed'
  );
  // MFA expiry cannot strand the original session mid-operation, but cannot
  // authorize a new operation, download, or continuation by a different session.
  const registration = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data);
  const staleMfa = new Date(Date.now() - 16 * 60000).toISOString();
  for (const session of registration.parishDashboardSessions) session.mfaVerifiedAt = staleMfa;
  const second = await issueParishDashboardSession(registration, { mfaVerifiedAt: staleMfa });
  f.db.prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'").run(JSON.stringify(second.registration));
  const owned = await startRecovery(f.env, 'parish-a', f.actor, {
    kind: 'backup',
    scope: 'parish',
    requestKey: crypto.randomUUID(),
  });
  assert.equal((await call(f['parish-a'], '/recovery')).status, 200);
  assert.equal((await call(f['parish-a'], '/recovery', { kind: 'backup', scope: 'parish' })).status, 428);
  assert.equal((await call(f['parish-a'], `/recovery/${target}/download`)).status, 428);
  assert.equal((await call(second.token, `/recovery/${owned.id}/advance`, {})).status, 428);
  assert.equal((await call(f['parish-a'], `/recovery/${owned.id}/advance`, {})).status, 200);
  assert.equal((await call(f['parish-a'], `/recovery/${owned.id}/cancel`, {})).status, 200);
  assert.equal((await call(f['parish-a'], `/recovery/${owned.id}/advance`, {})).status, 428);
  console.log(
    'PASS - file failure pauses, write barrier persists, safety rollback, configuration restore without credentials rollback, ownership/auth, corruption, schema drift, and background continuation'
  );
} finally {
  f.db.close();
}
