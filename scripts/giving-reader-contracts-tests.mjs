import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as core from '../src/lib/core.js';
import { listKvKeys, DONOR_OFFERING_KEY_PREFIX } from '../src/lib/kv-reads.js';
import { parseJsonRow, safeParseJsonRow } from '../src/lib/json-rows.js';
import { visibleDonationRecords } from '../src/payments/donation-visibility.js';
import * as events from '../src/payments/donation-events.js';
import {
  loadParishPaidOfferings as paid,
  loadParishRecurringOfferings as recurring,
} from '../src/handlers/parish-giving-read-models.js';
assert.equal(core.listKvKeys, listKvKeys);
assert.equal(core.DONOR_OFFERING_KEY_PREFIX, DONOR_OFFERING_KEY_PREFIX);
assert.equal(core.parseJsonRow, parseJsonRow);
assert.equal(core.safeParseJsonRow, safeParseJsonRow);
assert.equal(events.visibleDonationRecords, visibleDonationRecords);
for (const row of [undefined, null, {}, { data: '' }]) assert.equal(parseJsonRow(row), null);
for (const value of [false, 0, 'text', [], { id: 'a' }])
  assert.deepEqual(parseJsonRow({ data: JSON.stringify(value) }), value);
assert.throws(() => parseJsonRow({ data: '{' }), SyntaxError);
assert.equal(safeParseJsonRow({ data: '{' }), null);
assert.deepEqual(await listKvKeys({}), []);
const calls = [];
const pager = {
  AGAPAY_REGISTRATIONS: {
    async list(options) {
      calls.push(options);
      return calls.length === 1
        ? { keys: [{ name: 'a' }], list_complete: false, cursor: 'next' }
        : { keys: [{ name: 'a' }, { name: 'b' }], list_complete: true };
    },
  },
};
assert.deepEqual(await listKvKeys(pager, { prefix: 'gift', limit: 3, pageSize: 2 }), [
  { name: 'a' },
  { name: 'a' },
  { name: 'b' },
]);
assert.deepEqual(calls, [
  { prefix: 'gift', limit: 2, cursor: undefined },
  { prefix: 'gift', limit: 2, cursor: 'next' },
]);
let requested;
const oddPager = {
  AGAPAY_REGISTRATIONS: {
    async list(options) {
      requested = options;
      return { keys: [{ name: 'a' }, { name: 'b' }], list_complete: false };
    },
  },
};
assert.equal((await listKvKeys(oddPager, { limit: 0 })).length, 2);
assert.equal(requested.limit, 1);
await listKvKeys(oddPager, { pageSize: 0 });
assert.equal(requested.limit, 0);
const setup = { recordType: 'subscription_setup', stripeSubscriptionId: 'sub', extra: 1 };
const invoice = { stripeInvoiceId: 'inv', stripeSubscriptionId: 'sub' };
const other = { recordType: 'subscription_setup', stripeSubscriptionId: 'other' };
const records = [setup, invoice, other];
assert.deepEqual(visibleDonationRecords(records), [invoice, other]);
assert.equal(visibleDonationRecords(records)[0], invoice);
assert.equal(records.length, 3);
assert.deepEqual(visibleDonationRecords(), []);
assert.deepEqual(
  visibleDonationRecords([
    { ...setup, stripeSubscriptionId: '' },
    { stripeInvoiceId: 'inv', stripeSubscriptionId: '' },
  ]).length,
  2
);
const data = new Map([
  ['a', JSON.stringify({ id: 'a', parishId: 'p', status: 'paid', frequency: 'monthly', createdAt: '2026-01-01' })],
  [
    'b',
    JSON.stringify({
      id: 'b',
      parish_id: 'p',
      paymentStatus: 'succeeded',
      stripeSubscriptionId: 'sub',
      stripeInvoiceId: 'inv',
      createdAt: '2026-01-03',
    }),
  ],
  ['setup', JSON.stringify({ ...setup, id: 'setup', parishId: 'p', status: 'paid', createdAt: '2026-01-02' })],
  ['foreign', JSON.stringify({ id: 'foreign', parishId: 'q', status: 'paid', frequency: 'monthly' })],
  ['alias', JSON.stringify({ id: 'alias', parishId: 'p', stripe_subscription_id: 'alias', status: 'pending' })],
  ['bad', '{'],
  ['missing', null],
]);
const kv = {
  async list() {
    return { keys: [...data.keys()].map((name) => ({ name })), list_complete: true };
  },
  async get(key) {
    return data.get(key);
  },
};
assert.deepEqual(
  (await paid({ AGAPAY_REGISTRATIONS: kv }, 'p')).map((x) => x.id),
  ['b', 'a']
);
assert.deepEqual(
  (await recurring({ AGAPAY_REGISTRATIONS: kv }, 'p')).map((x) => x.id),
  ['b', 'a']
);
assert.deepEqual(
  (await paid({ AGAPAY_REGISTRATIONS: kv }, 'p', 1)).map((x) => x.id),
  ['b']
);
assert.deepEqual(await paid({}, ''), []);
assert.deepEqual(await recurring({}, 'p'), []);
for (const reader of [paid, recurring]) {
  await assert.rejects(
    reader(
      {
        AGAPAY_REGISTRATIONS: {
          ...kv,
          async get() {
            throw new Error('get failed');
          },
        },
      },
      'p'
    ),
    /get failed/
  );
  await assert.rejects(
    reader(
      {
        AGAPAY_REGISTRATIONS: {
          async list() {
            throw new Error('list failed');
          },
        },
      },
      'p'
    ),
    /list failed/
  );
  await assert.rejects(
    reader(
      {
        AGAPAY_DB: {
          prepare() {
            throw new Error('database failed');
          },
        },
        AGAPAY_REGISTRATIONS: kv,
      },
      'p'
    ),
    /database failed/
  );
}
const db = new DatabaseSync(':memory:');
try {
  db.exec(
    'CREATE TABLE donor_offerings(id TEXT, parish_id TEXT, data TEXT, status TEXT, payment_status TEXT, stripe_subscription_id TEXT, created_at TEXT, updated_at TEXT)'
  );
  const add = (id, parish, value, status, sub, date) =>
    db
      .prepare('INSERT INTO donor_offerings VALUES(?,?,?,?,?,?,?,?)')
      .run(id, parish, value === null ? null : JSON.stringify(value), status, '', sub, date, 'updated');
  add('old', 'p', { frequency: 'monthly' }, 'paid', '', '2026-01-01');
  add('setup', 'p', setup, 'paid', 'sub', '2026-01-02');
  add('invoice', 'p', invoice, 'complete', 'sub', '2026-01-03');
  add('foreign', 'q', { frequency: 'monthly' }, 'paid', '', '2026-01-04');
  add('null', 'p', null, 'paid', '', '2026-01-05');
  add('pending', 'p', { frequency: 'monthly' }, 'pending', '', '2026-01-06');
  const env = {
    AGAPAY_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async all() {
                return { results: db.prepare(sql).all(Object.fromEntries(values.map((v, i) => ['?' + (i + 1), v]))) };
              },
            };
          },
        };
      },
    },
  };
  assert.deepEqual(
    (await paid(env, 'p')).map((x) => x.id),
    ['invoice', 'old']
  );
  assert.equal((await paid(env, 'p'))[1].createdAt, '2026-01-01');
  assert.deepEqual(
    (await recurring(env, 'p')).map((x) => x.id),
    ['pending', 'invoice', 'old']
  );
  assert.deepEqual(
    (await recurring(env, 'p', 1)).map((x) => x.id),
    ['pending']
  );
  assert.deepEqual(await paid(env, "p' OR 1=1 --"), []);
  assert.deepEqual(await recurring(env, 'q'), [
    {
      frequency: 'monthly',
      id: 'foreign',
      status: 'paid',
      paymentStatus: '',
      stripeSubscriptionId: '',
      createdAt: '2026-01-04',
      updatedAt: 'updated',
    },
  ]);
  db.prepare('UPDATE donor_offerings SET data=? WHERE id=?').run('{', 'old');
  await assert.rejects(paid(env, 'p'), SyntaxError);
  await assert.rejects(recurring(env, 'p'), /malformed JSON/);
} finally {
  db.close();
}
console.log('Giving reader contracts: compatibility, JSON, pagination, KV failures and real SQLite isolation passed.');
