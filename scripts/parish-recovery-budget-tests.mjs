import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portabilityFixture, memoryBucket } from './portability-tests/fixtures.mjs';
import { startRecovery, advanceRecovery, recoveryStatus } from '../src/recovery/service.js';

const f = await portabilityFixture();
f.db.exec(readFileSync(new URL('../migrations/0128_parish_recovery.sql', import.meta.url), 'utf8'));
Object.assign(f.env, { PARISH_RECOVERY_ENABLED: 'true', DIRECTORY_MEDIA: memoryBucket() });
const start = (body) =>
  startRecovery(f.env, 'parish-a', 'actor', { scope: 'parish', requestKey: crypto.randomUUID(), ...body });
async function finish(op) {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await advanceRecovery(f.env, 'parish-a', op.id);
  assert.equal(op.status, 'completed');
}
async function point() {
  await finish(await start({ kind: 'backup' }));
  return (await recoveryStatus(f.env, 'parish-a', 'parish')).snapshots[0].id;
}
async function file(key, body) {
  const value = await f.env.DIRECTORY_MEDIA.put(key, body);
  f.db
    .prepare(
      "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES('DIRECTORY_MEDIA',?,'parish-a','delete','stored',?,1) ON CONFLICT(binding,object_key) DO UPDATE SET etag=excluded.etag,state='stored'"
    )
    .run(key, value.etag);
}
async function rejected(id, code) {
  const op = await start({ kind: 'restore', snapshotId: id, confirmation: 'RESTORE PARISH', acknowledged: true });
  await assert.rejects(finish(op), (error) => error.code === code);
  const saved = f.db.prepare('SELECT phase,status,lease_until FROM parish_recovery_operations WHERE id=?').get(op.id);
  assert.equal(saved.phase, 'validate');
  assert.equal(saved.status, 'paused');
  assert.equal(saved.lease_until, 0);
  await advanceRecovery(f.env, 'parish-a', op.id, 'cancel');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM parish_recovery_locks').get().n, 0);
}
try {
  for (let i = 0; i < 400; i++)
    f.db
      .prepare(
        'INSERT INTO directory_people(id,created_by_parish_id,preferred_name,legal_name,notes,created_at,updated_at) VALUES(?,?,?,?,?,1,1)'
      )
      .run('budget-' + i, 'parish-a', 'Before', 'Before', '');
  await file('parish-a/photo', 'original');
  const before = await point();
  f.db.prepare("UPDATE directory_people SET preferred_name='After' WHERE id LIKE 'budget-%'").run();
  await file('parish-a/photo', 'keep-new-file');
  await rejected(before, 'recovery_transaction_too_large');
  assert.equal(await (await f.env.DIRECTORY_MEDIA.get('parish-a/photo')).text(), 'keep-new-file');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM directory_people WHERE preferred_name='After'").get().n, 400);
  for (let i = 0; i < 120; i++) await file('parish-a/old-' + i, 'old');
  const filesBefore = await point();
  for (let i = 0; i < 120; i++) {
    await f.env.DIRECTORY_MEDIA.delete('parish-a/old-' + i);
    f.db
      .prepare("UPDATE parish_portability_objects SET state='deleted' WHERE binding='DIRECTORY_MEDIA' AND object_key=?")
      .run('parish-a/old-' + i);
    await file('parish-a/new-' + i, 'new');
  }
  await rejected(filesBefore, 'recovery_files_too_large');
  assert.equal(await f.env.DIRECTORY_MEDIA.get('parish-a/old-0'), null);
  assert.equal(await (await f.env.DIRECTORY_MEDIA.get('parish-a/new-0')).text(), 'new');
  console.log(
    'PASS - oversized database and file-union restores stop before replacement, release leases, and can cancel without changing current data'
  );
} finally {
  f.db.close();
}
