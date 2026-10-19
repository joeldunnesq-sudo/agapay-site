import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findRegistrationByParishId,
  loadIndexedRegistration,
  verifyParishDashboardBearer,
} from '../src/handlers/parish.js';
import {
  getBearerToken,
  issueParishDashboardSession,
  json,
  parishIdIndexKey,
  SECURITY_HEADERS,
  unauthorized,
} from '../src/lib/core.js';
import * as responses from '../src/lib/api-responses.js';
import { ROUTE_ACTIONS } from '../src/routes/worker-actions.js';
import { routeOrganizationRequest, ORGANIZATION_ACTIONS } from '../src/routes/organization-entry.js';

function kvFixture(entries = []) {
  const records = new Map(entries);
  const reads = [];
  const writes = [];
  const store = {
    get: async (key) => {
      reads.push(key);
      return records.get(key) ?? null;
    },
    put: async (key, value) => {
      writes.push([key, value]);
      records.set(key, value);
    },
    list: async () => ({ keys: [...records.keys()].map((name) => ({ name })), list_complete: true }),
  };
  return { env: { AGAPAY_REGISTRATIONS: store }, records, reads, writes };
}
function d1Fixture(row, closure = null) {
  const calls = [];
  return {
    env: {
      AGAPAY_DB: {
        prepare: (sql) => ({
          bind: (...args) => ({
            first: async () => {
              calls.push({ sql, args });
              return sql.includes('parish_data_closures') ? closure : row;
            },
          }),
        }),
      },
    },
    calls,
  };
}

const registration = { parishId: 'demo', parishName: 'Demo', communityType: 'Parish', privateNote: null };
const database = d1Fixture({ reference: 'REG-DB', data: JSON.stringify(registration) });
const databaseResult = await findRegistrationByParishId(database.env, 'demo');
assert.deepEqual(databaseResult, { key: 'REG-DB', registration });
assert.deepEqual(database.calls[0].args, ['demo']);
assert.match(database.calls[0].sql, /ORDER BY COALESCE/);
const closed = d1Fixture(null, { state: 'closed', job_id: 'job' });
closed.env.PARISH_PORTABILITY_ENABLED = 'true';
assert.equal(await findRegistrationByParishId(closed.env, 'demo'), null);
assert.equal(closed.calls.length, 1, 'Closed tenants must not query registrations');
const malformedDb = d1Fixture({ reference: 'BROKEN', data: '{' });
await assert.rejects(findRegistrationByParishId(malformedDb.env, 'demo'), SyntaxError);
assert.equal(await findRegistrationByParishId({}, 'demo'), null);

const indexed = kvFixture([
  [parishIdIndexKey('demo'), 'REG-KV'],
  ['REG-KV', JSON.stringify(registration)],
]);
assert.deepEqual(await findRegistrationByParishId(indexed.env, 'demo'), { key: 'REG-KV', registration });
assert.equal(indexed.writes.length, 0, 'An indexed hit must not rebuild the index');
assert.deepEqual(await loadIndexedRegistration(indexed.env, parishIdIndexKey('demo')), { key: 'REG-KV', registration });
const scan = kvFixture([
  [parishIdIndexKey('st-fiacre-munster'), 'MISSING'],
  ['__agapay_donor__private', JSON.stringify({ parishId: 'st-fiacre-munster' })],
  ['MALFORMED', '{'],
  ['NULL', 'null'],
  ['REG-SCAN', JSON.stringify({ parishName: 'St. Fiacre Orthodox Church', city: 'Munster' })],
]);
assert.equal((await findRegistrationByParishId(scan.env, 'st-fiacre-munster')).key, 'REG-SCAN');
assert.deepEqual(scan.writes, [[parishIdIndexKey('st-fiacre-munster'), 'REG-SCAN']]);
assert.ok(!scan.reads.includes('__agapay_donor__private'));
const brokenIndex = kvFixture([
  [parishIdIndexKey('demo'), 'BROKEN'],
  ['BROKEN', '{'],
  ['REG', JSON.stringify(registration)],
]);
assert.equal(await loadIndexedRegistration(brokenIndex.env, parishIdIndexKey('demo')), null);
assert.equal((await findRegistrationByParishId(brokenIndex.env, 'demo')).key, 'REG');
const primitiveScan = kvFixture([['PRIMITIVE', JSON.stringify('legacy-value')]]);
assert.equal(
  (await findRegistrationByParishId(primitiveScan.env, 'parish')).registration,
  'legacy-value',
  'The storage extraction must not silently validate or discard legacy primitive JSON'
);
const alias = kvFixture([['REG', JSON.stringify(registration)]]);
alias.env.DB = {
  prepare() {
    throw new Error('Legacy DB alias must retain the existing core lookup behavior');
  },
};
assert.equal((await findRegistrationByParishId(alias.env, 'demo')).key, 'REG');
const readFailure = new Error('storage unavailable');
await assert.rejects(
  findRegistrationByParishId(
    {
      AGAPAY_REGISTRATIONS: {
        get: async () => {
          throw readFailure;
        },
      },
    },
    'demo'
  ),
  (error) => error === readFailure
);
const writeFailure = kvFixture([['REG', JSON.stringify(registration)]]);
writeFailure.env.AGAPAY_REGISTRATIONS.put = async () => {
  throw new Error('index unavailable');
};
assert.equal(
  await findRegistrationByParishId(writeFailure.env, 'demo'),
  null,
  'Legacy scan catches index-write errors'
);

const issued = await issueParishDashboardSession(registration, { mfaVerifiedAt: new Date().toISOString() });
assert.equal(await verifyParishDashboardBearer(issued.registration, issued.token), true);
assert.equal(await verifyParishDashboardBearer(issued.registration, 'incorrect'), false);
assert.equal(await verifyParishDashboardBearer(issued.registration, ''), false);
assert.equal(await verifyParishDashboardBearer(null, issued.token), false);
const expired = {
  ...issued.registration,
  parishDashboardSessions: issued.registration.parishDashboardSessions.map((session) => ({
    ...session,
    expiresAt: '2000-01-01T00:00:00Z',
  })),
};
assert.equal(await verifyParishDashboardBearer(expired, issued.token), false);
assert.equal(json, responses.json);
assert.equal(unauthorized, responses.unauthorized);
assert.equal(getBearerToken, responses.getBearerToken);
assert.equal(SECURITY_HEADERS, responses.SECURITY_HEADERS);
const defaultResponse = json({ ok: true });
assert.equal(defaultResponse.headers.get('Cache-Control'), 'no-store');
for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(defaultResponse.headers.get(name), value);
const custom = json(
  { ok: true },
  { status: 202, headers: { 'Cache-Control': 'private, no-store', 'X-Custom': 'preserved' } }
);
assert.equal(custom.status, 202);
assert.equal(custom.headers.get('Cache-Control'), 'private, no-store');
assert.equal(custom.headers.get('X-Custom'), 'preserved');
assert.equal(unauthorized().status, 401);
assert.deepEqual(await unauthorized().json(), { error: 'Unauthorized' });
for (const [header, expected] of [
  ['Bearer   token  ', 'token'],
  ['bearer token', ''],
  ['', ''],
]) {
  assert.equal(getBearerToken(new Request('https://agapay.test', { headers: { Authorization: header } })), expected);
}

assert.equal(ROUTE_ACTIONS.findRegistrationByParishId, findRegistrationByParishId);
assert.equal(ROUTE_ACTIONS.verifyParishDashboardBearer, verifyParishDashboardBearer);
assert.equal(ORGANIZATION_ACTIONS.verifyParishDashboardBearer, verifyParishDashboardBearer);
assert.equal(ORGANIZATION_ACTIONS.json, json);
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.match(
  workerSource,
  /import \{ routeOrganizationRequest \} from ["']\.\/routes\/organization-entry\.js["']/,
  'The production Worker must use the checked action projection'
);
const live = d1Fixture({ reference: 'REG-LIVE', data: JSON.stringify(issued.registration) });
const request = new Request('https://agapay.test/api/v1/organizations/demo', {
  headers: { Authorization: `Bearer ${issued.token}` },
});
const context = { request, env: live.env, url: new URL(request.url), actions: ROUTE_ACTIONS };
const allowed = await routeOrganizationRequest(context);
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get('Cache-Control'), 'private, no-store');
assert.ok(!JSON.stringify(await allowed.json()).includes('parishDashboardSessions'));
const denied = await routeOrganizationRequest({ ...context, request: new Request(request.url) });
assert.equal(denied.status, 401);
const mismatched = kvFixture([
  [parishIdIndexKey('demo'), 'OTHER'],
  ['OTHER', JSON.stringify({ ...registration, parishId: 'other' })],
]);
assert.equal((await routeOrganizationRequest({ ...context, env: mismatched.env })).status, 404);
for (const malformed of [null, 'text', 42, true, []]) {
  const invalid = d1Fixture({ reference: 'INVALID', data: JSON.stringify(malformed) });
  assert.equal((await routeOrganizationRequest({ ...context, env: invalid.env })).status, 404);
}
console.log(
  'PASS - actual organization action providers preserve storage precedence, closure, sessions, response headers, and authenticated API behavior'
);
