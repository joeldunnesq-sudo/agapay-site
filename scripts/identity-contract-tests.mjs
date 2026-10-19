import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import * as identity from '../src/lib/identity.js';
import * as authorization from '../src/lib/authorization.js';
import * as handlers from '../src/handlers/identity.js';
import * as providers from '../src/handlers/identity-session-providers.js';
import * as authorizationProviders from '../src/lib/identity-authorization-providers.js';
import * as passwords from '../src/lib/password-records.js';
import * as core from '../src/lib/core.js';
import { issueDonorSession } from '../src/lib/donor-sessions.js';

function fixture(mfaColumn = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0020_platform_identity.sql', import.meta.url), 'utf8'));
  if (mfaColumn) db.exec('ALTER TABLE platform_users ADD COLUMN session_mfa_verified_at TEXT');
  const kv = new Map();
  const env = {
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
    AGAPAY_REGISTRATIONS: { get: async (key) => kv.get(key) || null, put: async (key, value) => kv.set(key, value) },
  };
  // Donor fallback's existing D1 repository uses this normalized table.
  db.exec(
    'CREATE TABLE donors (email TEXT PRIMARY KEY, default_parish_id TEXT, email_verified_at TEXT, created_at TEXT, updated_at TEXT, data TEXT)'
  );
  return { db, env };
}
function request(token = '', { method = 'GET', platform = '', donor = '' } = {}) {
  return new Request('https://agapay.test/api/identity/session', {
    method,
    headers: { Authorization: `Bearer ${token}`, 'X-AGAPAY-User-Email': platform, 'X-AGAPAY-Donor-Email': donor },
  });
}
assert.equal(handlers.handleIdentitySession, providers.handleIdentitySession);
assert.equal(handlers.handleIdentityLogout, providers.handleIdentityLogout);
assert.equal(authorization.requireCapability, authorizationProviders.requireCapability);
assert.equal(authorization.requireActiveMembership, authorizationProviders.requireActiveMembership);
assert.equal(authorization.currentUser, identity.requirePlatformUser);
for (const name of ['pbkdf2Hex', 'createPasswordRecord', 'parsePasswordRecord', 'verifyPasswordRecord'])
  assert.equal(core[name], passwords[name]);
assert.equal(passwords.parsePasswordRecord('bad'), null);
assert.deepEqual(passwords.parsePasswordRecord('[]'), []);
assert.equal(await passwords.verifyPasswordRecord('password', { version: 'wrong', salt: 'salt', hash: 'hash' }), false);
const record = await passwords.createPasswordRecord('contract-password');
assert.equal(await passwords.verifyPasswordRecord('contract-password', JSON.stringify(record)), true);
assert.equal(await passwords.verifyPasswordRecord('wrong', record), false);

const { db, env } = fixture();
try {
  const user = await identity.ensurePlatformUser(env, { email: ' PERSON@EXAMPLE.TEST ', displayName: ' Person ' });
  const session = await identity.issuePlatformUserSession(env, user.id);
  const auth = request(session.token, { platform: user.email });
  const projected = await identity.requirePlatformUser(auth, env);
  assert.equal(projected.id, user.id);
  assert.equal(projected.displayName, 'Person');
  for (const field of ['password_record', 'session_token_hash', 'session_salt', 'session_expires_at'])
    assert.equal(field in projected, false);
  assert.equal((await handlers.handleIdentitySession(auth, env)).status, 200);
  assert.equal((await handlers.handleIdentitySession(request('', { method: 'POST' }), env)).status, 405);
  assert.equal((await handlers.handleIdentitySession(request(), env)).status, 401);
  assert.equal((await handlers.handleIdentitySession(request(), {})).status, 500);
  assert.equal((await handlers.handleIdentityLogout(request(), env)).status, 405);
  assert.equal(await authorization.requireCapability(auth, env, 'missing-parish', 'accounting.view'), null);
  assert.equal(await authorization.requireActiveMembership(auth, env, 'missing-parish'), null);
  const now = Date.now;
  Date.now = () => Date.parse('2026-10-18T12:00:00Z');
  try {
    for (const [expiry, accepted] of [
      [null, true],
      ['2026-10-18T12:00:00Z', true],
      ['2026-10-18T11:59:59.999Z', false],
      ['bad', false],
    ]) {
      db.prepare('UPDATE platform_users SET session_expires_at = ? WHERE id = ?').run(expiry, user.id);
      assert.equal(Boolean(await identity.requirePlatformUser(auth, env)), accepted);
    }
  } finally {
    Date.now = now;
  }
  db.prepare('UPDATE platform_users SET session_expires_at = NULL WHERE id = ?').run(user.id);
  const strict = { ...env, PRIVILEGED_MFA_REQUIRED: 'true' };
  assert.equal(await identity.requirePlatformUser(auth, strict), null);
  assert.equal(await identity.markPlatformUserSessionMfaVerified(strict, user.id), true);
  assert.ok(await identity.requirePlatformUser(auth, strict));
  const donor = await issueDonorSession(env, {
    email: 'donor@example.test',
    donorName: 'Donor',
    emailVerifiedAt: new Date().toISOString(),
  });
  const both = request(session.token, { platform: user.email, donor: donor.donor.email });
  assert.equal((await identity.requirePlatformUser(both, strict)).id, user.id, 'Platform identity takes precedence');
  const fallback = request(donor.token, { platform: user.email, donor: donor.donor.email });
  const donorUser = await identity.requirePlatformUser(fallback, strict);
  assert.equal(donorUser.email, donor.donor.email, 'A verified Donor session retains its legacy fallback');
  assert.equal('mfaVerifiedAt' in donorUser, false);
  db.prepare("UPDATE platform_users SET status = 'disabled' WHERE id = ?").run(user.id);
  assert.equal(await identity.requirePlatformUser(auth, env), null);
  db.prepare("UPDATE platform_users SET status = 'active' WHERE id = ?").run(user.id);
  const logout = await handlers.handleIdentityLogout(
    request(session.token, { platform: user.email, method: 'POST' }),
    env
  );
  assert.equal(logout.status, 200);
  assert.equal(await identity.requirePlatformUser(auth, env), null);
  assert.equal(await identity.markPlatformUserSessionMfaVerified(env, user.id), false);
} finally {
  db.close();
}
const legacy = fixture(false);
try {
  const user = await identity.ensurePlatformUser(legacy.env, { email: 'legacy@example.test' });
  assert.ok(await identity.issuePlatformUserSession(legacy.env, user.id));
  await assert.rejects(
    identity.issuePlatformUserSession({ ...legacy.env, PRIVILEGED_MFA_REQUIRED: 'true' }, user.id),
    /session_mfa_verified_at/
  );
  await identity.revokePlatformUserSession(legacy.env, user.id);
} finally {
  legacy.db.close();
}
const failure = new Error('database unavailable');
await assert.rejects(
  identity.findPlatformUserByEmail(
    {
      AGAPAY_DB: {
        prepare() {
          throw failure;
        },
      },
    },
    'person@example.test'
  ),
  (error) => error === failure
);
console.log(
  'PASS - identity privacy, exact expiry, MFA policy, Donor fallback precedence, real request callers, logout, legacy schema fallback, and storage errors'
);
