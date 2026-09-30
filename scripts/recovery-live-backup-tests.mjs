import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { verifyLiveBackups } from './recovery-live-backup.mjs';

const root = '/api/parish/dashboard/test-lubbock',
  endpoint = root + '/portability/recovery';
const env = {
  TEST_LUBBOCK_PARISH_PASSWORD: 'synthetic-private-password',
  TEST_LUBBOCK_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
};
async function scenario(mode) {
  const calls = [],
    snapshots = [];
  let operation;
  const result = await verifyLiveBackups({
    env,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://agapay.app');
      const path = new URL(url).pathname,
        body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, body });
      let value;
      if (path === root + '/session')
        value = { mfaRequired: true, methods: ['totp'], pendingToken: 'synthetic-private-challenge' };
      else if (path === '/api/mfa/verify') {
        assert.equal(body.method, 'totp');
        value = { token: 'synthetic-private-session' };
      } else {
        assert.equal(options.headers.authorization, 'Bearer synthetic-private-session');
        if (path === endpoint && !body)
          value = {
            enabled: true,
            snapshots,
            operation: mode === 'busy' ? { id: crypto.randomUUID(), kind: 'restore' } : null,
          };
        else if (path === endpoint) {
          assert.equal(body.kind, 'backup');
          assert.equal(body.snapshotId, undefined);
          operation = {
            id: crypto.randomUUID(),
            safetyId: crypto.randomUUID(),
            kind: 'backup',
            scope: body.scope,
            status: 'running',
          };
          value = { operation };
        } else if (path === endpoint + '/' + operation?.id + '/advance') {
          operation.status = mode === 'paused' ? 'paused' : 'completed';
          if (mode === 'paused') operation.errorCode = 'recovery_test_failure';
          else
            snapshots.push({ id: operation.safetyId, scope: operation.scope, status: 'ready', verifiedAt: Date.now() });
          value = { operation };
        } else if (path === endpoint + '/' + operation?.id + '/cancel') {
          operation.status = 'cancelled';
          value = { operation };
        } else throw new Error('Unexpected route');
      }
      return Response.json(value);
    },
  });
  const evidence = JSON.stringify(result);
  for (const privateValue of [...Object.values(env), 'synthetic-private-challenge', 'synthetic-private-session'])
    assert.ok(!evidence.includes(privateValue));
  assert.ok(calls.every((c) => !c.path.includes('/rollback') && c.body?.kind !== 'restore'));
  return { result, calls };
}
const success = await scenario('success');
assert.equal(success.result.passed, true);
assert.deepEqual(
  success.result.scopes.map((s) => s.scope),
  ['accounting', 'parish']
);
const busy = await scenario('busy');
assert.equal(busy.result.passed, false);
assert.equal(busy.calls.filter((c) => c.path === endpoint && c.body).length, 0, 'Never mutate an existing recovery');
const paused = await scenario('paused');
assert.equal(paused.result.passed, false);
assert.equal(paused.result.cancelledOwnBackup, true);
assert.equal(paused.result.errorCode, 'recovery_test_failure');
const plan = spawnSync(process.execPath, ['scripts/recovery-live-backup.mjs'], { encoding: 'utf8' });
assert.equal(plan.status, 0);
assert.match(plan.stdout, /No default network or writes/);
console.log(
  'PASS - fixed test-parish backup-only operator, fresh MFA, scoped points, own-backup cancellation, sanitized evidence and no default writes'
);
