import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createIdentityAccessHandlers } from '../src/handlers/identity-access-handlers.js';
import {
  invitationAccepted,
  invitationCreated,
  identityRegistrationLookup,
} from '../src/handlers/identity-invitation-contracts.js';
import * as facade from '../src/handlers/identity.js';
import * as providers from '../src/handlers/identity-access-providers.js';
import { ensurePlatformUser, setPlatformUserPassword } from '../src/lib/identity.js';
import { sanitizeGrantableCapabilities } from '../src/lib/authorization.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';
import { createInvitation, acceptInvitation } from '../src/lib/memberships.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0020_platform_identity.sql', import.meta.url), 'utf8'));
db.exec('ALTER TABLE platform_users ADD COLUMN session_mfa_verified_at TEXT');
db.exec(readFileSync(new URL('../migrations/0014_audit_log.sql', import.meta.url), 'utf8'));
const env = {
  AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  AGAPAY_DB: {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...params) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...params) };
        },
        async run() {
          return { meta: { changes: db.prepare(sql).run(...params).changes } };
        },
      };
    },
  },
};
const calls = [];
const registration = {
  parishId: 'parish-a',
  untouched: 'keep',
  onboardingAccess: {
    priest: { email: ' person@example.test ', status: 'invited' },
    treasurer: { email: 'other@example.test', status: 'invited' },
  },
};
let acceptance = {
  ok: true,
  userId: '',
  email: 'person@example.test',
  parishId: 'parish-a',
  membershipId: 'member-a',
  acceptedAt: new Date().toISOString(),
};
let creation = { ok: true, id: 'invitation-a', token: 'invitation-token', expiresAt: '2099-01-01' };
let limited = null;
let authorize = null;
let memberships = [{ id: 'member-a', parishId: 'parish-a', status: 'active' }];
const dependencies = {
  rateLimit: async (...args) => {
    calls.push(['limit', args[2], args[3]]);
    return limited;
  },
  beginMfaAuthentication: async (_env, _request, options) => {
    calls.push(['mfa', options]);
    return { mfaRequired: true, pendingToken: 'pending' };
  },
  listMembershipsForUser: async () => memberships,
  listMembershipsForParish: async () => memberships,
  listInvitationsForParish: async () => [
    { id: 'old', status: 'pending', email: ' PERSON@EXAMPLE.TEST ' },
    { id: 'different', status: 'pending', email: 'different@example.test' },
    { id: 'used', status: 'accepted', email: 'person@example.test' },
  ],
  acceptInvitation: async (_env, options) => {
    calls.push(['accept', options]);
    return acceptance;
  },
  createInvitation: async (_env, options) => {
    calls.push(['create', options]);
    return creation;
  },
  revokeInvitation: async (_env, options) => {
    calls.push(['revoke', options]);
    return true;
  },
  findRegistrationByParishId: async () => ({ key: 'registration-key', registration }),
  saveRegistrationRecord: async (...args) => {
    calls.push(['save', args[2], args[3]]);
  },
  verifyParishDashboardBearer: async (_registration, token) => token === 'legacy-valid',
  requireCapability: async () => authorize,
  recommendedOnboardingState: () => 'accepted-state',
  sendParishStaffAccessInvitation: async (...args) => {
    calls.push(['email', args[2], args[3]]);
    return { status: 'failed' };
  },
  sanitizeGrantableCapabilities,
  CAPABILITY_CATALOG: [],
  ROLE_TEMPLATES: {},
};
const handlers = createIdentityAccessHandlers(dependencies);
function request(body = {}, method = 'POST', token = '') {
  return new Request('https://agapay.test/api/identity/login', {
    method,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  for (const name of Object.keys(providers)) assert.equal(facade[name], providers[name]);
  for (const body of [null, [], 42, 'text']) {
    assert.equal((await providers.handleIdentityLogin(request(body), env)).status, 400);
    assert.equal((await providers.handleIdentityInvitationAccept(request(body), env, 'invalid')).status, 400);
  }
  const invalidJson = new Request('https://agapay.test', { method: 'POST', body: '{' });
  assert.equal((await handlers.handleIdentityLogin(invalidJson, env)).status, 400);
  assert.equal((await handlers.handleIdentityLogin(request({}, 'GET'), env)).status, 405);
  assert.equal((await handlers.handleIdentityLogin(request(), {})).status, 500);
  limited = new Response('limited', { status: 429 });
  assert.equal(await handlers.handleIdentityLogin(request(), env), limited);
  limited = null;
  const user = await ensurePlatformUser(env, { email: 'person@example.test' });
  acceptance = { ...acceptance, userId: user.id };
  await setPlatformUserPassword(env, user.id, 'password-123');
  assert.equal(
    (await handlers.handleIdentityLogin(request({ email: user.email, password: 'wrong' }), env)).status,
    401
  );
  const strict = { ...env, PRIVILEGED_MFA_REQUIRED: 'true' };
  const challenge = await handlers.handleIdentityLogin(
    request({ email: user.email, password: 'password-123', parishId: 'parish-a' }),
    strict
  );
  assert.equal((await challenge.json()).mfaRequired, true);
  assert.equal(
    db.prepare('SELECT session_token_hash FROM platform_users WHERE id = ?').get(user.id).session_token_hash,
    null
  );
  memberships = [];
  assert.equal(
    (
      await handlers.handleIdentityLogin(
        request({ email: user.email, password: 'password-123', parishId: 'parish-a' }),
        env
      )
    ).status,
    403
  );
  memberships = [{ id: 'member-a', parishId: 'parish-a', status: 'active' }];
  const login = await handlers.handleIdentityLogin(
    request({ email: user.email, password: 'password-123', parishId: 'parish-a' }),
    env
  );
  const loginBody = await login.json();
  assert.equal(login.status, 200);
  assert.ok(loginBody.token);
  assert.ok(loginBody.parishToken);
  assert.equal('password_record' in loginBody.user, false);
  const beforeSaves = calls.filter((c) => c[0] === 'save').length;
  const acceptedChallenge = await handlers.handleIdentityInvitationAccept(
    request({ password: 'password-123' }),
    strict,
    'invite-token'
  );
  assert.equal((await acceptedChallenge.json()).mfaRequired, true);
  assert.equal(calls.filter((c) => c[0] === 'save').length, beforeSaves);
  const accepted = await handlers.handleIdentityInvitationAccept(
    request({ password: 'password-123', displayName: ' Person ' }),
    env,
    'invite-token'
  );
  assert.equal(accepted.status, 200);
  assert.ok((await accepted.json()).parishToken);
  const saved = calls.filter((c) => c[0] === 'save').at(-1);
  assert.equal(saved[1].onboardingAccess.priest.status, 'accepted');
  assert.equal(saved[1].onboardingAccess.treasurer.status, 'invited');
  assert.equal(saved[1].untouched, 'keep');
  assert.equal(saved[1].onboardingState, 'accepted-state');
  assert.equal(registration.onboardingAccess.priest.status, 'invited');
  acceptance = { ok: false, error: 'used' };
  assert.equal(
    (await handlers.handleIdentityInvitationAccept(request({ password: 'password-123' }), env, 'used')).status,
    400
  );
  assert.equal(
    (await handlers.handleIdentityInvitationAccept(request({ password: 'short' }), env, 'token')).status,
    400
  );
  assert.equal(
    (await handlers.handleMembershipInvitationCreate(request({ email: user.email }), env, 'parish-a')).status,
    401
  );
  const created = await handlers.handleMembershipInvitationCreate(
    request({ email: user.email, capabilities: ['parish.view', 'platform.admin', 'unknown'] }, 'POST', 'legacy-valid'),
    env,
    'parish-a'
  );
  assert.equal(created.status, 200);
  assert.equal((await created.json()).emailStatus, 'failed');
  assert.equal(calls.filter((c) => c[0] === 'revoke').at(-1)[1].invitationId, 'old');
  const creationInput = calls.filter((c) => c[0] === 'create').at(-1)[1];
  assert.deepEqual(creationInput.capabilities, ['parish.view']);
  assert.equal(creationInput.invitedByLegacyBearer, true);
  assert.equal(creationInput.invitedByUserId, null);
  authorize = { user: { id: user.id } };
  creation = { ok: false, code: 'capability_escalation', error: 'denied' };
  assert.equal(
    (await handlers.handleMembershipInvitationCreate(request({ email: user.email }), env, 'parish-a')).status,
    403
  );
  const revoke = await handlers.handleMembershipInvitationRevoke(
    request({}, 'DELETE', 'legacy-valid'),
    env,
    'parish-a',
    'specific'
  );
  assert.equal(revoke.status, 200);
  assert.equal(calls.filter((c) => c[0] === 'revoke').at(-1)[1].invitationId, 'specific');
  assert.equal((await handlers.handleMembershipList(request({}, 'GET', 'legacy-valid'), env, 'parish-a')).status, 200);
  assert.throws(() => invitationAccepted({ ok: true, userId: 42 }), TypeError);
  assert.throws(() => invitationCreated({ ok: true, id: 'x' }), TypeError);
  assert.equal(await identityRegistrationLookup(async () => ({ key: 'x', registration: 42 }))({}, 'parish'), null);
  const failure = new Error('service unavailable');
  const failing = createIdentityAccessHandlers({
    ...dependencies,
    acceptInvitation: async () => {
      throw failure;
    },
  });
  await assert.rejects(
    failing.handleIdentityInvitationAccept(request({ password: 'password-123' }), env, 'token'),
    (error) => error === failure
  );
  const realInvitation = await createInvitation(env, {
    parishId: 'parish-a',
    email: 'invited@example.test',
    capabilities: ['parish.view'],
    invitedByLegacyBearer: true,
  });
  const realHandlers = createIdentityAccessHandlers({ ...dependencies, acceptInvitation });
  const realResponse = await realHandlers.handleIdentityInvitationAccept(
    request({ password: 'new-password-123', displayName: 'Invited' }),
    env,
    realInvitation.token
  );
  const realBody = await realResponse.json();
  assert.equal(realResponse.status, 200);
  assert.ok(realBody.token);
  assert.equal(realBody.identityEmail, 'invited@example.test');
  assert.equal(
    db.prepare('SELECT status FROM membership_invitations WHERE id = ?').get(realInvitation.id).status,
    'accepted'
  );
  assert.equal(
    (
      await realHandlers.handleIdentityInvitationAccept(
        request({ password: 'new-password-123' }),
        env,
        realInvitation.token
      )
    ).status,
    400
  );
} finally {
  db.close();
}
console.log(
  'PASS - typed login/invitation callers, request roots, MFA ordering, staff sessions, onboarding updates, capability filtering, pending replacement, delivery failure and provider errors'
);
