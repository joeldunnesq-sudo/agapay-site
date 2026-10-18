import assert from 'node:assert/strict';
import {
  recordParishFeatureRequest,
  loadPendingParishFeatureRequests,
  dismissParishFeatureRequest,
} from '../src/lib/parish-feature-requests.js';
import {
  portabilityBudget,
  portabilityBudgetUsage,
  recoveryBudget,
  PORTABILITY_OPERATION_LIMIT,
} from '../src/portability/budget.js';

const key = 'parish-feature-requests:boundary-parish';
const input = { parishId: 'boundary-parish', featureId: 'pledges', donorEmail: 'synthetic@example.invalid' };
let writes = 0;
const values = new Map();
const env = {
  AGAPAY_REGISTRATIONS: {
    get: async (name) => values.get(name) ?? null,
    put: async (name, value) => {
      writes++;
      values.set(name, value);
    },
  },
};
const valid = { count: '2', firstRequestedAt: null, requestors: ['legacy-hash'], extra: 'retained' };
const malformed = [
  null,
  [],
  42,
  'bad',
  { count: {} },
  { count: 'NaN' },
  { count: 'Infinity' },
  { count: true },
  { firstRequestedAt: 4 },
  { lastRequestedAt: [] },
  { dismissedAt: {} },
  { requestors: {} },
  { requestors: [42] },
];
for (const bad of malformed) {
  const raw = JSON.stringify({ version: 1, metadata: 'retain', features: { pledges: valid, damaged: bad } });
  values.set(key, raw);
  const before = writes;
  const pending = await loadPendingParishFeatureRequests(env, input.parishId);
  assert.deepEqual(pending, [{ featureId: 'pledges', count: 2, firstRequestedAt: '', lastRequestedAt: '' }]);
  await assert.rejects(recordParishFeatureRequest(env, input), /requires review/);
  await assert.rejects(dismissParishFeatureRequest(env, input.parishId, 'pledges'), /requires review/);
  assert.equal(writes, before);
  assert.equal(values.get(key), raw, 'invalid siblings must not be silently removed by an unrelated update');
}
for (const raw of [
  '',
  '{',
  'null',
  '[]',
  'true',
  '3',
  '{"features":null}',
  '{"features":[]}',
  '{"features":"invalid"}',
]) {
  values.set(key, raw);
  const before = writes;
  assert.deepEqual(await loadPendingParishFeatureRequests(env, input.parishId), []);
  await assert.rejects(recordParishFeatureRequest(env, input), /requires review/);
  assert.equal(writes, before);
  assert.equal(values.get(key), raw);
}
values.set(key, JSON.stringify({ version: 1, metadata: { future: true }, features: { pledges: valid } }));
assert.equal((await recordParishFeatureRequest(env, input)).request.count, 3);
const stored = JSON.parse(values.get(key));
assert.deepEqual(stored.metadata, { future: true });
assert.equal(stored.features.pledges.extra, 'retained');
assert.equal((await recordParishFeatureRequest(env, input)).duplicate, true);
assert.equal(await dismissParishFeatureRequest(env, input.parishId, 'pledges'), true);
assert.deepEqual(await loadPendingParishFeatureRequests(env, input.parishId), []);
values.delete(key);
for (const featureId of ['__proto__', 'constructor', 'toString']) {
  assert.equal((await recordParishFeatureRequest(env, { ...input, featureId })).request.count, 1);
  assert.equal((await recordParishFeatureRequest(env, { ...input, featureId })).duplicate, true);
}
assert.equal(Object.prototype.count, undefined);
assert.equal((await loadPendingParishFeatureRequests(env, input.parishId)).length, 3);

// Exercise the actual proxies, including receiver-sensitive methods and symbol properties.
const symbol = Symbol('metadata');
let providerCalls = 0;
const statement = {
  marker: 'statement',
  bind(...args) {
    assert.equal(this, statement);
    assert.deepEqual(args, [1]);
    return this;
  },
  all(...args) {
    assert.equal(this, statement);
    return ['all', ...args];
  },
  first() {
    assert.equal(this, statement);
    return 'first';
  },
  run() {
    assert.equal(this, statement);
    return 'run';
  },
  raw() {
    assert.equal(this, statement);
    return 'raw';
  },
  inspect() {
    assert.equal(this, statement);
    return this.marker;
  },
};
const db = {
  marker: 'database',
  [symbol]: 'db-symbol',
  prepare(sql) {
    assert.equal(this, db);
    assert.equal(sql, 'SELECT 1');
    return statement;
  },
  batch(items) {
    assert.equal(this, db);
    assert.deepEqual(items, [statement, statement]);
    return 'batch';
  },
  inspect() {
    assert.equal(this, db);
    return this.marker;
  },
};
const bucket = { marker: 'bucket', [symbol]: 'bucket-symbol' };
for (const method of ['get', 'head', 'put', 'delete', 'list'])
  bucket[method] = function (...args) {
    assert.equal(this, bucket);
    return [method, ...args];
  };
bucket.inspect = function () {
  assert.equal(this, bucket);
  return this.marker;
};
const provider = {
  marker: 'provider',
  [symbol]: 'provider-symbol',
  resolve(name) {
    assert.equal(this, provider);
    providerCalls++;
    return name;
  },
  query(name, items) {
    assert.equal(this, provider);
    providerCalls++;
    return [name, items];
  },
  inspect() {
    assert.equal(this, provider);
    return this.marker;
  },
};
const wrapped = portabilityBudget({
  AGAPAY_DB: db,
  DB: db,
  BOOKS: db,
  ACCOUNTING_DATABASE_BINDINGS: '{"book":"BOOKS"}',
  AGAPAY_REGISTRATIONS: bucket,
  ACCOUNTING_PROVISIONER: provider,
});
assert.equal(portabilityBudget(wrapped), wrapped);
assert.equal(wrapped.AGAPAY_DB, wrapped.DB);
assert.equal(wrapped.BOOKS, wrapped.DB);
assert.equal(wrapped.AGAPAY_DB[symbol], 'db-symbol');
assert.equal(wrapped.AGAPAY_REGISTRATIONS[symbol], 'bucket-symbol');
assert.equal(wrapped.ACCOUNTING_PROVISIONER[symbol], 'provider-symbol');
for (const object of [wrapped.AGAPAY_DB, wrapped.AGAPAY_REGISTRATIONS, wrapped.ACCOUNTING_PROVISIONER])
  assert.equal(object.inspect(), object.marker);
const prepared = wrapped.AGAPAY_DB.prepare('SELECT 1').bind(1);
assert.equal(prepared.inspect(), 'statement');
assert.deepEqual(prepared.all('argument'), ['all', 'argument']);
assert.equal(prepared.first(), 'first');
assert.equal(prepared.run(), 'run');
assert.equal(prepared.raw(), 'raw');
assert.equal(wrapped.AGAPAY_DB.batch([prepared, prepared]), 'batch');
assert.throws(
  () => wrapped.AGAPAY_DB.exec('DELETE FROM anything'),
  (error) => error.code === 'unbounded_sql'
);
for (const method of ['get', 'head', 'put', 'delete', 'list'])
  assert.deepEqual(wrapped.AGAPAY_REGISTRATIONS[method]('key'), [method, 'key']);
assert.equal(wrapped.ACCOUNTING_PROVISIONER.resolve('book'), 'book');
assert.deepEqual(wrapped.ACCOUNTING_PROVISIONER.query('book', [{ sql: 'one' }, { sql: 'two' }]), [
  'book',
  [{ sql: 'one' }, { sql: 'two' }],
]);
assert.equal(providerCalls, 2);
assert.equal(portabilityBudgetUsage(wrapped).operations, 14);
for (let i = 14; i < PORTABILITY_OPERATION_LIMIT; i++) prepared.first();
assert.throws(
  () => prepared.first(),
  (error) => error.code === 'portability_operation_limit'
);
assert.equal(portabilityBudgetUsage(wrapped).operations, 800);
const restore = recoveryBudget(wrapped);
prepared.first();
restore();
assert.throws(
  () => prepared.first(),
  (error) => error.code === 'portability_operation_limit'
);
assert.equal(portabilityBudgetUsage(wrapped).operations, 801);
console.log('PASS - feature-request JSON preserves malformed records and proxy budgets preserve receivers and limits');
