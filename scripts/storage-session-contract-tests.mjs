import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as core from '../src/lib/core.js';
import * as storage from '../src/lib/storage.js';
import * as sessions from '../src/lib/parish-sessions.js';
import * as hashes from '../src/lib/session-crypto.js';
import * as keys from '../src/lib/storage-keys.js';

for (const source of [storage, sessions, hashes, keys]) {
  for (const name of Object.keys(source)) {
    if (name === 'toHex') continue; // Remains private in the core compatibility facade.
    assert.equal(core[name], source[name], `Core must preserve the ${name} binding`);
  }
}
assert.equal('toHex' in core, false);
assert.equal(await hashes.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const expectedHash = createHash('sha256').update('session:persisted-salt:persisted-token').digest('hex');
assert.equal(await hashes.hashSessionToken('persisted-token', 'persisted-salt'), expectedHash);
assert.notEqual(await hashes.hashSessionToken('persisted-token', 'other-salt'), expectedHash);
assert.notEqual(await hashes.hashSessionToken('Persisted-token', 'persisted-salt'), expectedHash);
assert.equal(hashes.secureCompare('same', 'same'), true);
assert.equal(hashes.secureCompare('same', 'sAme'), false);
assert.equal(hashes.secureCompare('same', 'longer'), false);
assert.equal(hashes.secureCompare(0, false), true, 'Legacy falsy coercion stays compatible');
assert.match(hashes.generateSecret(), /^agp_[a-f0-9]{48}$/);
assert.match(hashes.randomHex(), /^[a-f0-9]{32}$/);
assert.equal(hashes.randomHex(0), '');

const now = Date.parse('2030-01-01T00:00:00Z');
const before = { id: 'before', expiresAt: new Date(now - 1).toISOString() };
const exact = { id: 'exact', expiresAt: new Date(now).toISOString() };
const after = { id: 'after', expiresAt: new Date(now + 1).toISOString() };
const mixed = [null, false, 'text', {}, { expiresAt: 'invalid' }, before, exact, after];
assert.deepEqual(sessions.pruneParishDashboardSessions(mixed, now), [after]);
assert.equal(sessions.pruneParishDashboardSessions(mixed, now)[0], after);
assert.equal(mixed.length, 8, 'Pruning must not mutate stored arrays');
assert.deepEqual(sessions.pruneParishDashboardSessions({ sessions: mixed }, now), []);
const originalNow = Date.now;
Date.now = () => now;
try {
  const persisted = {
    id: 'persisted',
    sessionSalt: 'persisted-salt',
    tokenHash: expectedHash,
    expiresAt: new Date(now + 1000).toISOString(),
    mfaVerifiedAt: '',
    accessType: 'staff',
  };
  const registration = { parishId: 'demo', parishDashboardSessions: [persisted] };
  assert.deepEqual(await sessions.resolveParishDashboardSession(registration, 'persisted-token'), {
    id: 'persisted',
    expiresAt: persisted.expiresAt,
    mfaVerifiedAt: '',
    accessType: 'staff',
  });
  assert.equal(await sessions.resolveParishDashboardSession(registration, 'incorrect'), null);
  assert.equal(await sessions.resolveParishDashboardSession(null, 'persisted-token'), null);
  assert.equal(await sessions.resolveParishDashboardSession(registration, ''), null);
  persisted.expiresAt = new Date(now).toISOString();
  assert.equal(await sessions.resolveParishDashboardSession(registration, 'persisted-token'), null);
  persisted.expiresAt = new Date(now + 1000).toISOString();
  const opaqueMetadata = { legacy: true };
  persisted.mfaVerifiedAt = opaqueMetadata;
  assert.equal(
    (await sessions.resolveParishDashboardSession(registration, 'persisted-token')).mfaVerifiedAt,
    opaqueMetadata
  );
  const stamp = new Date(now).toISOString();
  const marked = sessions.markParishDashboardSessionMfaVerified(registration, 'persisted', stamp);
  assert.equal(marked.changed, true);
  assert.equal(marked.registration.parishDashboardSessions[0].mfaVerifiedAt, stamp);
  assert.equal(marked.registration.parishDashboardSessions[0].expiresAt, persisted.expiresAt);
  assert.equal(persisted.mfaVerifiedAt, opaqueMetadata, 'MFA updates must not mutate the original session');
  assert.equal(
    sessions.markParishDashboardSessionMfaVerified(registration, 'missing', stamp).registration,
    registration
  );
  assert.equal(sessions.markParishDashboardSessionMfaVerified(null, 'missing', stamp).changed, false);

  const old = Array.from({ length: 18 }, (_, index) => ({
    id: `old-${index}`,
    createdAt: new Date(now - 20000 + index * 1000).toISOString(),
    expiresAt: new Date(now + 1000).toISOString(),
  })).reverse();
  const issued = await sessions.issueParishDashboardSession(
    { parishId: 'demo', note: null, parishDashboardSessions: [...old, before] },
    { accessType: 'staff', mfaVerifiedAt: stamp }
  );
  assert.match(issued.token, /^agp_parish_[a-f0-9]{48}$/);
  assert.equal(Date.parse(issued.expiresAt) - now, 12 * 60 * 60 * 1000);
  assert.equal(issued.registration.parishDashboardSessions.length, 16);
  assert.deepEqual(
    issued.registration.parishDashboardSessions.slice(0, -1).map((entry) => entry.id),
    Array.from({ length: 15 }, (_, index) => `old-${index + 3}`)
  );
  const newest = issued.registration.parishDashboardSessions.at(-1);
  assert.match(newest.sessionSalt, /^parish_salt_[a-f0-9]{48}$/);
  assert.match(newest.tokenHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(newest).includes(issued.token), 'Only the hash is stored in the session entry');
  assert.equal((await sessions.resolveParishDashboardSession(issued.registration, issued.token)).accessType, 'staff');
  assert.equal((await sessions.resolveParishDashboardSession(issued.registration, issued.token)).mfaVerifiedAt, stamp);
  assert.equal(issued.registration.note, null);
  assert.equal(old.length, 18);
  assert.equal(
    (await sessions.issueParishDashboardSession({}, { accessType: 'unexpected' })).accessType,
    'primary_parish'
  );
} finally {
  Date.now = originalNow;
}

assert.equal(storage.parseJsonRow({ data: '{"id":1}' }).id, 1);
assert.equal(storage.parseJsonRow({ data: 'null' }), null);
assert.equal(storage.parseJsonRow({ data: 42 }), 42);
assert.equal(storage.parseJsonRow({ data: false }), null);
assert.equal(storage.parseJsonRow(null), null);
assert.throws(() => storage.parseJsonRow({ data: '{' }), SyntaxError);
assert.throws(() => storage.parseJsonRow({ data: Symbol('invalid') }), TypeError);
assert.equal(storage.safeParseJsonRow({ data: '{' }), null);
assert.equal(storage.safeParseJsonRow({ data: Symbol('invalid') }), null);
assert.equal(storage.d1({ DB: {} }), null, 'The legacy DB alias must not become a new D1 binding');
assert.equal(await storage.d1First({}, 'SELECT 1'), null);
assert.deepEqual(await storage.d1All({}, 'SELECT 1'), []);
assert.equal(await storage.d1Run({}, 'UPDATE test SET value=1'), null);
assert.equal(await storage.d1Batch({}, [{ sql: 'UPDATE test SET value=1' }]), null);

const calls = [];
const row = { reference: 'REG', data: '{}' };
const rows = [row];
const runResult = { success: true, meta: { changes: 1 } };
const env = {
  AGAPAY_DB: {
    prepare: (sql) => ({
      bind: (...params) => {
        const statement = { sql, params };
        return {
          ...statement,
          first: async () => {
            calls.push(statement);
            return row;
          },
          all: async () => {
            calls.push(statement);
            return { results: rows };
          },
          run: async () => {
            calls.push(statement);
            return runResult;
          },
        };
      },
    }),
    batch: async (prepared) => {
      calls.push(prepared.map(({ sql, params }) => ({ sql, params })));
      return [runResult];
    },
  },
};
const boundValue = "demo'; DROP TABLE registrations; --";
assert.equal(await storage.d1First(env, 'SELECT data WHERE id=?1', boundValue), row);
assert.deepEqual(calls[0], { sql: 'SELECT data WHERE id=?1', params: [boundValue] });
assert.equal(await storage.d1All(env, 'SELECT data'), rows);
assert.equal(await storage.d1Run(env, 'UPDATE data SET value=?1', null), runResult);
assert.deepEqual(
  await storage.d1Batch(env, [{ sql: 'UPDATE a SET value=?', params: [1] }, { sql: 'UPDATE b SET value=2' }]),
  [runResult]
);
assert.deepEqual(calls.at(-1), [
  { sql: 'UPDATE a SET value=?', params: [1] },
  { sql: 'UPDATE b SET value=2', params: [] },
]);
assert.equal(await storage.d1Batch(env, []), null);
assert.equal(await storage.d1Batch(env, null), null);
const failure = new Error('database unavailable');
const failing = {
  AGAPAY_DB: {
    prepare() {
      throw failure;
    },
  },
};
await assert.rejects(storage.d1First(failing, 'SELECT 1'), (error) => error === failure);
await assert.rejects(storage.d1Run(failing, 'UPDATE test SET value=1'), (error) => error === failure);

const pageCalls = [];
const listedKey = { name: 'REG', metadata: { private: true } };
const kv = {
  AGAPAY_REGISTRATIONS: {
    list: async (options) => {
      pageCalls.push(options);
      return options.cursor
        ? { keys: [listedKey], list_complete: true }
        : { keys: [], cursor: 'next', list_complete: false };
    },
  },
};
assert.deepEqual(await storage.listKvKeys({}), []);
assert.equal((await storage.listKvKeys(kv, { prefix: 'REG', limit: 3, pageSize: 2 }))[0], listedKey);
assert.deepEqual(pageCalls, [
  { prefix: 'REG', limit: 2, cursor: undefined },
  { prefix: 'REG', limit: 2, cursor: 'next' },
]);
const requests = [];
const capped = {
  AGAPAY_REGISTRATIONS: {
    list: async (options) => {
      requests.push(options);
      return {
        keys: Array.from({ length: options.limit }, (_, index) => ({ name: `${requests.length}-${index}` })),
        cursor: 'more',
        list_complete: false,
      };
    },
  },
};
assert.equal((await storage.listKvKeys(capped, { limit: 3, pageSize: 2 })).length, 3);
assert.deepEqual(
  requests.map((request) => request.limit),
  [2, 1]
);
assert.equal((await storage.listKvKeys(capped, { limit: 0 })).length, 1, 'Preserve the existing minimum request size');
await assert.rejects(
  storage.listKvKeys({
    AGAPAY_REGISTRATIONS: {
      list: async () => {
        throw failure;
      },
    },
  }),
  (error) => error === failure
);
assert.equal(keys.isSystemKvKey(keys.ADMIN_SESSION_STORE_KEY), true);
assert.equal(keys.isSystemKvKey(keys.parishIdIndexKey('demo')), true);
assert.equal(keys.isSystemKvKey('REG-REAL'), false);
assert.equal(keys.isSystemKvKey(null), false);
console.log(
  'PASS - storage binding/query contracts, KV pagination, persisted hashes, exact expiry, session limits, and MFA updates'
);
