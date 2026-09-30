import assert from 'node:assert/strict';
import { stagingParishSession } from './lib/staging-parish-session.mjs';

const input = {
  baseUrl: 'https://agapay-site-staging.joeldunnesq.workers.dev',
  parishId: 'parish-a',
  email: 'staff@example.test',
  password: 'synthetic-password',
  totpSecret: 'JBSWY3DPEHPK3PXP',
};
const originalFetch = globalThis.fetch;
let replies;
let requests;
function scenario(values) {
  replies = [...values];
  requests = [];
}
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options, body: JSON.parse(options.body) });
  assert.ok(replies.length, 'No unexpected authentication requests');
  return Response.json(replies.shift());
};
try {
  scenario([]);
  await assert.rejects(stagingParishSession({ ...input, baseUrl: 'https://agapay.app' }), /dedicated staging origin/);
  assert.equal(requests.length, 0, 'Never send staging credentials to production');

  scenario([
    { mfaRequired: true, pendingToken: 'synthetic-challenge', methods: ['totp'] },
    { token: 'identity-token', parishToken: 'parish-token' },
  ]);
  assert.equal(await stagingParishSession(input), 'parish-token');
  assert.equal(requests[0].url, `${input.baseUrl}/api/identity/login`);
  assert.deepEqual(requests[0].body, { parishId: input.parishId, email: input.email, password: input.password });
  assert.equal(requests[1].url, `${input.baseUrl}/api/mfa/verify`);
  assert.equal(requests[1].body.pendingToken, 'synthetic-challenge');
  assert.match(requests[1].body.code, /^\d{6}$/);
  assert.ok(requests.every((request) => request.redirect === 'error'));

  scenario([{ mfaRequired: true, enrollmentRequired: true }]);
  await assert.rejects(stagingParishSession(input), /requires MFA enrollment/);
  assert.equal(requests.length, 1, 'Never replace or enroll a factor implicitly');

  scenario([{ mfaRequired: true, pendingToken: 'synthetic-challenge', methods: ['totp'] }]);
  await assert.rejects(stagingParishSession({ ...input, totpSecret: '' }), /protected GitHub environment/);
  assert.equal(requests.length, 1, 'No password-only fallback after an MFA challenge');

  scenario([{ token: 'identity-only-token' }]);
  await assert.rejects(stagingParishSession(input), /did not return a session token/);

  scenario([{ token: 'legacy-parish-token' }]);
  assert.equal(await stagingParishSession({ ...input, email: undefined }), 'legacy-parish-token');
  assert.equal(requests[0].url, `${input.baseUrl}/api/parish/dashboard/parish-a/session`);
  console.log(
    'PASS - staging-only credentials, named staff MFA, parish-session scope, enrollment and missing-factor refusal'
  );
} finally {
  globalThis.fetch = originalFetch;
}
