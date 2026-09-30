import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portabilityFixture } from './portability-tests/fixtures.mjs';
import { startRecovery, advanceRecovery, recoveryStatus } from '../src/recovery/service.js';

const f = await portabilityFixture();
f.db.exec(readFileSync(new URL('../migrations/0128_parish_recovery.sql', import.meta.url), 'utf8'));
f.env.PARISH_RECOVERY_ENABLED = 'true';
const begin = (body) =>
  startRecovery(f.env, 'parish-a', 'actor-a', { scope: 'parish', requestKey: crypto.randomUUID(), ...body });
const finish = async (op) => {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await advanceRecovery(f.env, 'parish-a', op.id);
  assert.equal(op.status, 'completed');
  return op;
};
try {
  const backup = await begin({ kind: 'backup' });
  await advanceRecovery(f.env, 'parish-a', backup.id);
  assert.throws(
    () => f.db.prepare("UPDATE directory_people SET preferred_name='blocked' WHERE id='a'").run(),
    /RECOVERY_WRITE_BLOCKED/
  );
  f.db.prepare("UPDATE directory_people SET preferred_name='Unrelated parish stays writable' WHERE id='b'").run();
  await finish(backup);
  const status = await recoveryStatus(f.env, 'parish-a', 'parish');
  assert.equal(status.snapshots.length, 1);
  const target = status.snapshots[0].id;
  f.db.prepare("UPDATE directory_people SET preferred_name='Mistake' WHERE id='a'").run();
  f.db.prepare("UPDATE directory_people SET preferred_name='Independent shared identity' WHERE id='shared'").run();
  await assert.rejects(begin({ kind: 'restore', snapshotId: target }), /confirmation/);
  await assert.rejects(
    startRecovery(f.env, 'parish-b', 'actor-b', {
      scope: 'parish',
      kind: 'restore',
      requestKey: crypto.randomUUID(),
      snapshotId: target,
      confirmation: 'RESTORE PARISH',
      acknowledged: true,
    }),
    /unavailable/
  );
  const restore = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE PARISH',
    acknowledged: true,
  });
  await finish(restore);
  assert.equal(f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").get().preferred_name, 'Alpha');
  assert.equal(
    f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='shared'").get().preferred_name,
    'Independent shared identity'
  );
  assert.equal(
    f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='b'").get().preferred_name,
    'Unrelated parish stays writable'
  );
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM parish_recovery_locks').get().n, 0);
  const safety = (await recoveryStatus(f.env, 'parish-a', 'parish')).snapshots.find((s) => s.kind === 'safety');
  await finish(
    await begin({ kind: 'restore', snapshotId: safety.id, confirmation: 'RESTORE PARISH', acknowledged: true })
  );
  assert.equal(
    f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").get().preferred_name,
    'Mistake',
    'safety snapshot can undo a completed restore'
  );
  const cancelled = await begin({ kind: 'backup' });
  await advanceRecovery(f.env, 'parish-a', cancelled.id);
  await advanceRecovery(f.env, 'parish-a', cancelled.id, 'cancel');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM parish_recovery_locks').get().n, 0);
  console.log(
    'PASS - frozen snapshot, parish isolation, explicit confirmation, restore, safety undo, shared identity preservation, cancellation'
  );
} finally {
  f.db.close();
}
