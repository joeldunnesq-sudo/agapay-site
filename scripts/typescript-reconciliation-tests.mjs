import { d1First, d1All, d1Run, d1Batch } from '../src/lib/core.js';
import assert from 'node:assert/strict';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';
import { issueAdminSession, ADMIN_SESSION_STORE_KEY, resolveAdminSession } from '../src/lib/core.js';
import { handleMfaStepUp } from '../src/handlers/mfa.js';
import { invitationIdentifier } from '../src/handlers/identity-invitation-contracts.js';
const values = new Map();
const env = {
  AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  AGAPAY_REGISTRATIONS: {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => values.set(key, value),
  },
};
const issued = await issueAdminSession(env, 'Reconciliation fixture');
const store = JSON.parse(values.get(ADMIN_SESSION_STORE_KEY));
store.sessions[0].id = 42;
values.set(ADMIN_SESSION_STORE_KEY, JSON.stringify(store));
const before = values.get(ADMIN_SESSION_STORE_KEY);
assert.equal((await resolveAdminSession(env, issued.token)).id, 42, 'stored metadata remains opaque and lossless');
const response = await handleMfaStepUp(
  new Request('https://fixture.test/api/mfa/step-up', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + issued.token, 'content-type': 'application/json' },
    body: JSON.stringify({ principalType: 'platform_admin', principalId: 'platform' }),
  }),
  env
);
assert.equal(
  response.status,
  401,
  'an unvalidated non-string session identifier cannot start a sensitive MFA transaction'
);
assert.equal(values.get(ADMIN_SESSION_STORE_KEY), before, 'denial must not rewrite the session record');
for (const value of [null, [], {}, 42, { id: 42 }, { id: null }])
  assert.throws(() => invitationIdentifier(value), TypeError);
assert.equal(invitationIdentifier({ id: 'pending-invitation', future: true }), 'pending-invitation');
// Protected environments may expose bindings through a proxy; one operation must use one binding.
for (const operation of [
  (env) => d1First(env, 'SELECT 1'),
  (env) => d1All(env, 'SELECT 1'),
  (env) => d1Run(env, 'UPDATE fixture'),
  (env) => d1Batch(env, [{ sql: 'UPDATE fixture' }, { sql: 'UPDATE fixture' }]),
]) {
  let reads = 0;
  const database = {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    }),
    batch: async () => [],
  };
  const binding = {
    get AGAPAY_DB() {
      reads++;
      return database;
    },
  };
  await operation(binding);
  assert.equal(reads, 1, 'query/batch must not resolve a second potentially different binding');
}
console.log(
  'PASS - reconciled opaque session metadata stays lossless and malformed MFA/invitation identifiers fail before sensitive writes'
);
