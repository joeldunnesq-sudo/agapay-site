import assert from 'node:assert/strict';
import { completeGateMfa, gateMfaSecretName, gateTotp } from './lib/release-gate-mfa.mjs';
const env = {
  ACCOUNTING_GATE_USER_A_EMAIL: 'gate-a@example.test',
  ACCOUNTING_GATE_USER_A_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
};
assert.equal(gateMfaSecretName('USER', 'GATE-A@example.test', env), 'ACCOUNTING_GATE_USER_A_TOTP_SECRET');
assert.throws(() => gateMfaSecretName('USER', 'outsider@example.test', env), /outside/);
assert.equal(gateTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
const baseUrl = 'https://agapay-site-staging.joeldunnesq.workers.dev';
const payload = { mfaRequired: true, pendingToken: 'challenge', methods: ['totp'] };
let calls = 0;
const fetchImpl = async (url, options) => {
  calls++;
  assert.equal(url, baseUrl + '/api/mfa/verify');
  assert.equal(options.redirect, 'error');
  const body = JSON.parse(options.body);
  assert.equal(body.pendingToken, 'challenge');
  assert.match(body.code, /^\d{6}$/);
  assert.equal(body.method, 'totp');
  return new Response(JSON.stringify({ token: 'fixture-session', recoveryCodes: ['do-not-return'] }), { status: 200 });
};
const options = { baseUrl, payload, env, fetchImpl, secretName: 'ACCOUNTING_GATE_USER_A_TOTP_SECRET' };
await assert.rejects(() => completeGateMfa({ ...options, baseUrl: 'https://agapay.app' }), /restricted/);
await assert.rejects(() => completeGateMfa({ ...options, env: {} }), /protected secret/);
await assert.rejects(
  () => completeGateMfa({ ...options, payload: { ...payload, enrollmentRequired: true } }),
  /reconcile/
);
assert.equal(calls, 0);
const completed = await completeGateMfa(options);
assert.equal(completed.token, 'fixture-session');
assert.equal(completed.recoveryCodes, undefined);
assert.equal(calls, 1);
console.log(
  'PASS - protected gate MFA uses enrolled factors, refuses other origins and identities, and omits recovery credentials'
);

const { runCrossTenantMatrix } = await import('./lib/accounting-release-gates.mjs');
const routes = [{ handler: 'fixture', method: 'GET', path: '/reports/test' }];
let transportCalls = 0;
const principal = {
  name: 'fixture',
  authPath: 'fixture',
  parishId: 'a',
  oppositeParishId: 'b',
  headers: {},
  context: {
    request: {
      async fetch() {
        transportCalls++;
        if (transportCalls === 1) throw new Error('fixture transport failure');
        return {
          status: () => 403,
          headers: () => ({ 'content-type': 'application/json' }),
          text: async () => '{"error":"Forbidden"}',
        };
      },
    },
  },
};
const matrix = await runCrossTenantMatrix({
  baseUrl: 'https://example.test',
  routes,
  principals: [principal],
  artifactPath: 'artifacts/fixture-transport-matrix.json',
});
assert.equal(matrix.matrix[0].transportAttempts, 2);
assert.equal(matrix.passed, true);
transportCalls = 0;
principal.context.request.fetch = async () => {
  transportCalls++;
  return { status: () => 200, headers: () => ({}), text: async () => '{"unexpected":"access"}' };
};
await assert.rejects(
  () =>
    runCrossTenantMatrix({
      baseUrl: 'https://example.test',
      routes,
      principals: [principal],
      artifactPath: 'artifacts/fixture-rejected-matrix.json',
    }),
  /isolation failed/
);
assert.equal(transportCalls, 1, 'Unexpected HTTP access must fail immediately, never be retried into a false pass.');
console.log('PASS - transport errors have bounded retries, while an unexpected HTTP success remains a gate failure');
