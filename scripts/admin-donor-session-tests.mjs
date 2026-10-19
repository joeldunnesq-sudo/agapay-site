import assert from 'node:assert/strict';
import * as admin from '../src/lib/admin-sessions.js';
import * as donorSessions from '../src/lib/donor-sessions.js';
import * as repository from '../src/lib/donor-repository.js';
import * as policy from '../src/lib/storage-policy.js';
import * as core from '../src/lib/core.js';
import { ADMIN_SESSION_STORE_KEY, donorKey } from '../src/lib/storage-keys.js';
import { hashSessionToken } from '../src/lib/session-crypto.js';
import { issueDonorSession as legacyIssue } from '../src/handlers/donor.js';
import { requireDonor as legacyRequire } from '../src/handlers/parish.js';

for (const module of [admin, repository, policy]) {
  for (const [name, implementation] of Object.entries(module)) assert.equal(core[name], implementation);
}
assert.equal(legacyIssue, donorSessions.issueDonorSession);
assert.equal(legacyRequire, donorSessions.requireDonor);
function fixture(withDb = false) {
  const settings = new Map(),
    donors = new Map(),
    kv = new Map(),
    calls = [];
  const env = {
    AGAPAY_REGISTRATIONS: {
      get: async (key) => {
        calls.push(['get', key]);
        return kv.get(key) ?? null;
      },
      put: async (key, value) => {
        calls.push(['put', key]);
        kv.set(key, value);
      },
      delete: async (key) => {
        calls.push(['delete', key]);
        kv.delete(key);
      },
    },
  };
  if (withDb)
    env.AGAPAY_DB = {
      prepare: (sql) => ({
        bind: (...params) => ({
          first: async () => {
            calls.push(['first', sql, params]);
            if (sql.includes('app_settings'))
              return settings.has(params[0]) ? { value: settings.get(params[0]) } : null;
            return donors.has(params[0]) ? { data: donors.get(params[0]) } : null;
          },
          run: async () => {
            calls.push(['run', sql, params]);
            if (sql.includes('INSERT INTO app_settings')) settings.set(params[0], params[1]);
            else if (sql.includes('INSERT INTO donors')) donors.set(params[0], params[5]);
            else if (sql.includes('DELETE FROM donors')) donors.delete(params[0]);
            return { success: true };
          },
        }),
      }),
    };
  return { env, settings, donors, kv, calls };
}
for (const input of [null, false, '', '{', 'null', '[]', { sessions: 'invalid' }]) {
  assert.deepEqual(admin.parseAdminSessionStore(input), { version: 1, sessions: [] });
}
assert.deepEqual(admin.parseAdminSessionStore({ version: 99, sessions: [null, 42] }), {
  version: 1,
  sessions: [null, 42],
});
assert.equal(admin.normalizeAdminActor('  '), 'Admin');
assert.equal(admin.normalizeAdminActor('a'.repeat(100)).length, 80);
assert.equal(policy.hasProductionStore({}), false);
assert.equal(policy.missingProductionStoreResponse().status, 500);
const now = Date.parse('2030-01-01T00:00:00Z'),
  oldNow = Date.now;
Date.now = () => now;
try {
  for (const withDb of [false, true]) {
    const f = fixture(withDb);
    const initial = Array.from({ length: 34 }, (_, index) => ({
      id: `old-${index}`,
      createdAt: new Date(now - 40000 + index * 1000).toISOString(),
      expiresAt: new Date(now + 1000).toISOString(),
    })).reverse();
    await admin.saveAdminSessionStore(f.env, {
      sessions: [...initial, { id: 'expired', expiresAt: new Date(now).toISOString() }],
    });
    const issued = await admin.issueAdminSession(f.env, '  Operator  ');
    assert.match(issued.token, /^agp_admin_[a-f0-9]{48}$/);
    assert.equal(Date.parse(issued.expiresAt) - now, 12 * 60 * 60 * 1000);
    const store = await admin.loadAdminSessionStore(f.env);
    assert.equal(store.sessions.length, 32);
    assert.deepEqual(
      store.sessions.slice(0, -1).map((entry) => entry.id),
      Array.from({ length: 31 }, (_, index) => `old-${index + 3}`)
    );
    assert.ok(!JSON.stringify(store).includes(issued.token));
    const resolved = await admin.resolveAdminSession(f.env, issued.token);
    assert.equal(resolved.actor, 'Operator');
    assert.equal(resolved.mfaVerifiedAt, '');
    const stamp = new Date(now).toISOString();
    assert.equal(await admin.markAdminSessionMfaVerified(f.env, resolved.id, stamp), true);
    const marked = await admin.resolveAdminSession(f.env, issued.token);
    assert.equal(marked.mfaVerifiedAt, stamp);
    assert.equal(marked.expiresAt, resolved.expiresAt);
    const callCount = f.calls.length;
    assert.equal(await admin.resolveAdminSession(f.env, ''), null);
    assert.equal(f.calls.length, callCount, 'Empty tokens must not read or mutate session storage');
    const writes = f.calls.filter(([method]) => ['run', 'put'].includes(method)).length;
    assert.equal(await admin.markAdminSessionMfaVerified(f.env, 'missing', stamp), false);
    assert.equal(f.calls.filter(([method]) => ['run', 'put'].includes(method)).length, writes);
    await admin.saveAdminSessionStore(f.env, { sessions: [{ expiresAt: new Date(now).toISOString() }] });
    assert.equal(await admin.resolveAdminSession(f.env, 'incorrect'), null);
    assert.deepEqual((await admin.loadAdminSessionStore(f.env)).sessions, []);
    if (withDb) assert.equal(f.kv.has(ADMIN_SESSION_STORE_KEY), false, 'D1 sessions must not fall through to KV');

    const record = { email: 'Person@Example.INVALID', emailVerifiedAt: stamp, privateNote: null };
    assert.equal(await repository.saveDonor(f.env, record), record);
    const loaded = await repository.loadDonor(f.env, ' PERSON@example.invalid ');
    assert.equal(loaded.email, 'person@example.invalid');
    assert.equal(loaded.privateNote, null);
    const donor = await donorSessions.issueDonorSession(f.env, loaded);
    assert.equal(Date.parse(donor.donor.sessionExpiresAt) - now, 14 * 24 * 60 * 60 * 1000);
    assert.match(donor.token, /^agp_donor_[a-f0-9]{48}$/);
    assert.ok(!JSON.stringify(await repository.loadDonor(f.env, record.email)).includes(donor.token));
    assert.equal(await donorSessions.resolveDonorSession(donor.donor, donor.token), donor.donor);
    const exact = { ...donor.donor, sessionExpiresAt: new Date(now).toISOString() };
    assert.equal(
      await donorSessions.resolveDonorSession(exact, donor.token),
      exact,
      'Donor retains its existing strict-less-than expiry cutoff'
    );
    assert.equal(
      await donorSessions.resolveDonorSession(
        { ...exact, sessionExpiresAt: new Date(now - 1).toISOString() },
        donor.token
      ),
      null
    );
    const legacyDate = { ...exact, sessionExpiresAt: 'legacy-invalid-date' };
    assert.equal(await donorSessions.resolveDonorSession(legacyDate, donor.token), legacyDate);
    assert.equal(await donorSessions.resolveDonorSession({ ...exact, sessionExpiresAt: true }, donor.token), null);
    assert.equal(await donorSessions.resolveDonorSession({ ...exact, emailVerifiedAt: '' }, donor.token), null);
    assert.equal(await donorSessions.resolveDonorSession(donor.donor, 'wrong'), null);
    assert.equal(await donorSessions.resolveDonorSession(donor.donor, ''), null);
    const request = new Request('https://agapay.test/api/donor/dashboard', {
      headers: {
        'X-AGAPAY-Donor-Email': record.email,
        Authorization: `Bearer ${donor.token}`,
      },
    });
    assert.equal((await legacyRequire(request, f.env)).email, loaded.email);
    assert.equal(await legacyRequire(new Request(request.url), f.env), null);
    await repository.deleteDonor(f.env, record.email);
    assert.equal(await repository.loadDonor(f.env, record.email), null);
  }
} finally {
  Date.now = oldNow;
}
const precedence = fixture(true);
precedence.kv.set(ADMIN_SESSION_STORE_KEY, JSON.stringify({ sessions: [{ id: 'stale' }] }));
assert.deepEqual((await admin.loadAdminSessionStore(precedence.env)).sessions, []);
precedence.kv.set(
  donorKey('fallback@example.invalid'),
  JSON.stringify({ email: 'fallback@example.invalid', privateNote: null })
);
assert.equal((await repository.loadDonor(precedence.env, 'fallback@example.invalid')).privateNote, null);
assert.ok(precedence.donors.has('fallback@example.invalid'), 'Legacy KV fallback still reconciles into D1');
const malformed = fixture(false);
malformed.kv.set(donorKey('raw@example.invalid'), '42');
assert.equal(await repository.loadDonor(malformed.env, 'raw@example.invalid'), 42);
assert.equal(await donorSessions.resolveDonorSession(42, 'token'), null);
await assert.rejects(repository.saveDonor({}, null), TypeError);
const failure = new Error('storage unavailable');
const failing = {
  AGAPAY_REGISTRATIONS: {
    get: async () => {
      throw failure;
    },
    put: async () => {
      throw failure;
    },
  },
};
await assert.rejects(admin.loadAdminSessionStore(failing), (error) => error === failure);
await assert.rejects(admin.issueAdminSession(failing), (error) => error === failure);
await assert.rejects(
  donorSessions.issueDonorSession(failing, { email: 'failure@example.invalid' }),
  (error) => error === failure
);
assert.equal(await hashSessionToken('token', 'salt'), await core.hashSessionToken('token', 'salt'));
console.log(
  'PASS - typed Admin/Donor sessions, settings policy, D1/KV precedence, legacy expiry, MFA persistence, and failure propagation'
);
