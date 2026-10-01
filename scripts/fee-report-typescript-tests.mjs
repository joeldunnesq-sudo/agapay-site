import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as core from '../src/lib/core.js';
import { d1, d1First, d1All } from '../src/lib/database-reads.js';
import { summarizeGivingFees, readGivingFeeReport } from '../src/lib/giving-fee-report.js';

assert.equal(core.d1, d1);
assert.equal(core.d1First, d1First);
assert.equal(core.d1All, d1All);
assert.equal(d1({}), null);
assert.equal(await d1First({}, 'SELECT 1'), null);
assert.deepEqual(await d1All({ AGAPAY_DB: null }, 'SELECT 1'), []);
const values = {
  AGAPAY_DB: {
    prepare() {
      return {
        bind() {
          return { all: async () => ({}), first: async () => null };
        },
      };
    },
  },
};
assert.deepEqual(await d1All(values, 'SELECT 1'), []);
assert.equal(await d1First(values, 'SELECT 1'), null);
const failed = new Error('read failed');
const broken = {
  AGAPAY_DB: {
    prepare() {
      throw failed;
    },
  },
};
await assert.rejects(
  () => d1First(broken, 'SELECT 1'),
  (error) => error === failed
);
await assert.rejects(
  () => d1All(broken, 'SELECT 1'),
  (error) => error === failed
);

const gift = {
  amountCents: 1000,
  chargeCents: 1100,
  stripeFeeCents: 60,
  stripeFeeSource: 'balance_transaction',
  stripeBalanceTransactionId: 'txn',
  paymentStatus: 'paid',
  completedAt: '2026-01-01',
};
const report = summarizeGivingFees(
  [
    gift,
    { ...gift, completedAt: '2026-04-01', refundedCents: 70 },
    { ...gift, completedAt: '2026-07-01', stripeFeeCents: 0 },
    {
      ...gift,
      completedAt: '2026-10-01',
      stripeFeeSource: 'estimate',
      stripeFeeCents: null,
      estimatedStripeFeeCents: '80',
    },
    { ...gift, currency: 'eur' },
    { ...gift, completedAt: '2025-12-31' },
    { ...gift, completedAt: '2026-13-01' },
    { ...gift, paymentStatus: 'failed' },
    { data: '{broken' },
    { data: 'null' },
    { data: '42' },
    { data: '[]' },
    {
      data: JSON.stringify({ ...gift, completedAt: undefined, createdAt: '2026-08-01' }),
      created_at: '2026-12-31',
      payment_status: 'paid',
    },
  ],
  2026
);
assert.equal(report.annual.giftCount, 5);
assert.equal(report.annual.confirmedCount, 4);
assert.equal(report.annual.pendingCount, 1);
assert.equal(report.annual.grossContributionCents, 5500);
assert.equal(report.annual.actualStripeFeeCents, 180);
assert.equal(report.annual.donorFundedStripeFeeCents, 150);
assert.equal(report.annual.parishFundedStripeFeeCents, 30);
assert.equal(report.annual.excessCoverageCents, 180);
assert.equal(report.annual.estimatedStripeFeeCents, 80);
assert.equal(report.annual.refundedCents, 70);
assert.equal(report.excludedCurrencyCount, 1);
assert.equal(report.monthly[11].giftCount, 1, 'Row creation date precedes embedded createdAt');
assert.equal(report.quarterly[1].parishFundedStripeFeeCents, 30);
for (const key of Object.keys(report.annual).filter((key) => key !== 'label')) {
  assert.equal(
    report.annual[key],
    report.monthly.reduce((sum, bucket) => sum + bucket[key], 0),
    key
  );
  assert.equal(
    report.annual[key],
    report.quarterly.reduce((sum, bucket) => sum + bucket[key], 0),
    key
  );
}
assert.equal(summarizeGivingFees([{ data: JSON.stringify(gift), payment_status: 'failed' }], 2026).annual.giftCount, 0);
for (const stripeFeeCents of [-1, 1.5, 'invalid']) {
  const result = summarizeGivingFees([{ ...gift, stripeFeeCents }], 2026).annual;
  assert.equal(result.pendingCount, 1);
  assert.equal(result.estimatedStripeFeeCents, 0);
}
assert.equal((await readGivingFeeReport({}, 'a', 2026)).annual.giftCount, 0);
for (const year of [1999, 2201, 2026.5, '2026', NaN]) {
  await assert.rejects(() => readGivingFeeReport(broken, 'a', year), /Choose a valid reporting year/);
}
await assert.rejects(
  () => readGivingFeeReport(broken, 'a', 2026),
  (error) => error === failed
);

const db = new DatabaseSync(':memory:');
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...params) {
          return {
            first: async () => statement.get(...params) ?? null,
            all: async () => ({ results: statement.all(...params) }),
          };
        },
      };
    },
  },
};
try {
  assert.equal(d1(env), env.AGAPAY_DB);
  assert.equal((await d1First(env, 'SELECT ? AS value', "a' OR 1=1 --")).value, "a' OR 1=1 --");
  assert.deepEqual(
    (await d1All(env, 'SELECT ? AS a, ? AS b', 7, null)).map((row) => ({ ...row })),
    [{ a: 7, b: null }]
  );
  db.exec('CREATE TABLE donor_offerings (parish_id TEXT, created_at TEXT, payment_status TEXT, data TEXT)');
  const insert = db.prepare('INSERT INTO donor_offerings VALUES (?, ?, ?, ?)');
  for (const [parish, createdAt, status, completedAt] of [
    ['a', '2025-12-01', 'paid', '2026-01-01'],
    ['a', '2026-12-31', 'refunded', ''],
    ['a', '2026-06-01', 'paid', '2027-01-01'],
    ['a', '2026-06-01', 'failed', '2026-06-01'],
    ['b', '2026-06-01', 'paid', '2026-06-01'],
  ])
    insert.run(parish, createdAt, status, JSON.stringify({ ...gift, completedAt }));
  const scoped = await readGivingFeeReport(env, 'a', 2026);
  assert.equal(scoped.annual.giftCount, 2);
  assert.equal(scoped.monthly[0].giftCount, 1);
  assert.equal(scoped.monthly[11].giftCount, 1);
  assert.equal((await readGivingFeeReport(env, "a' OR 1=1 --", 2026)).annual.giftCount, 0);
} finally {
  db.close();
}
console.log(
  'PASS - typed D1 read compatibility, parameter binding, report aggregation, year/parish isolation and failures'
);
