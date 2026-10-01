import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { numericCents } from '../src/lib/numeric-cents.js';
import { numericCents as legacyCents } from '../src/lib/stripe-connect.js';
import { offeringFeeBreakdown } from '../src/lib/offering-fee-breakdown.js';
import { offeringFeeBreakdown as legacyBreakdown } from '../src/lib/stripe-fees.js';
import { loadFundGiftActivity } from '../src/lib/fund-reporting.js';

assert.equal(numericCents, legacyCents);
assert.equal(offeringFeeBreakdown, legacyBreakdown);
for (const [input, expected] of [
  [null, 0],
  [undefined, 0],
  ['', 0],
  ['101.6', 102],
  [-2.6, -3],
  [Infinity, 0],
  ['bad', 0],
  [true, 1],
])
  assert.equal(numericCents(input), expected);
assert.throws(() => numericCents(Symbol('amount')), TypeError);
assert.deepEqual(offeringFeeBreakdown(), {
  giftAmountCents: 0,
  chargeCents: 0,
  stripeFeeCents: 0,
  agapayFeeCents: 0,
  totalFeeCents: 0,
  donorCoveredFeeCents: 0,
  parishNetCents: 0,
  coverFees: false,
});
assert.deepEqual(
  offeringFeeBreakdown({
    amountCents: '1000',
    amountChargedCents: 1100,
    estimatedStripeFeeCents: 75,
    agapayFeeCents: 25,
    coverFees: true,
  }),
  {
    giftAmountCents: 1000,
    chargeCents: 1100,
    stripeFeeCents: 75,
    agapayFeeCents: 25,
    totalFeeCents: 100,
    donorCoveredFeeCents: 100,
    parishNetCents: 1000,
    coverFees: true,
  }
);
const zero = offeringFeeBreakdown({
  giftAmountCents: 0,
  amountCents: 1000,
  chargeCents: 0,
  stripeFeeCents: 0,
  estimatedStripeFeeCents: 99,
  totalFeeCents: 0,
  donorCoveredFeeCents: 0,
  coverFees: 'false',
  parishNetCents: 0,
  netCents: 900,
});
assert.equal(zero.giftAmountCents, 0);
assert.equal(zero.stripeFeeCents, 0);
assert.equal(zero.coverFees, true, 'legacy truthiness is retained');
assert.equal(zero.parishNetCents, 0);
assert.equal(offeringFeeBreakdown({ amountCents: 10, stripeFeeCents: 20 }).parishNetCents, 0);
assert.equal(offeringFeeBreakdown({ amountCents: 100, parishNetCents: -5 }).parishNetCents, 0);
assert.equal(offeringFeeBreakdown({ amountCents: 100, donorCoveredFeeCents: 50 }).donorCoveredFeeCents, 0);

const period = { startIso: '2026-07-01T00:00:00.000Z', endIso: '2026-08-01T00:00:00.000Z', label: 'July' };
const unavailable = await loadFundGiftActivity({}, 'a', period);
assert.deepEqual(unavailable, { available: false, complete: false, reason: 'Giving database unavailable.' });
const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE donor_offerings (id TEXT PRIMARY KEY, parish_id TEXT, data TEXT, created_at TEXT, payment_status TEXT, status TEXT)'
);
const insert = db.prepare('INSERT INTO donor_offerings VALUES (?, ?, ?, ?, ?, ?)');
const gift = { parishId: 'a', amountCents: 1000, stripeFeeCents: 100, fundId: 'general', currency: 'USD' };
for (let i = 0; i < 501; i++)
  insert.run(
    String(i).padStart(4, '0'),
    'a',
    JSON.stringify({
      ...gift,
      paidAt: i === 0 ? period.startIso : '',
      stripeFeeSource: i === 0 ? 'balance_transaction' : 'estimate',
    }),
    '2026-07-02T00:00:00Z',
    i % 2 ? 'paid' : 'pending',
    'completed'
  );
insert.run(
  'zz-unallocated',
  'a',
  JSON.stringify({ amountCents: 500, giftType: 'candle' }),
  '2026-07-03T00:00:00Z',
  'disputed',
  'pending'
);
insert.run('foreign', 'b', JSON.stringify(gift), '2026-07-02T00:00:00Z', 'paid', 'paid');
insert.run('end', 'a', JSON.stringify(gift), period.endIso, 'paid', 'paid');
insert.run('before', 'a', JSON.stringify(gift), '2026-06-30T23:59:59Z', 'paid', 'paid');
insert.run('unpaid', 'a', JSON.stringify(gift), '2026-07-02T00:00:00Z', 'pending', 'pending');
const calls = [];
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...params) {
          calls.push(params);
          return { all: async () => ({ results: statement.all(...params) }) };
        },
      };
    },
  },
};
try {
  const report = await loadFundGiftActivity(env, 'a', period, { funds: [{ id: 'general', name: 'Operating' }] });
  assert.equal(report.available, true);
  assert.equal(report.complete, true);
  assert.equal(report.period, period);
  assert.equal(report.giftCount, 502);
  assert.equal(report.grossGiftCents, 501500);
  assert.equal(report.feeCents, 50100);
  assert.equal(report.parishNetCents, 451400);
  assert.equal(report.estimatedFeeCount, 501);
  assert.equal(report.unallocatedCount, 1);
  assert.deepEqual(
    report.allocations.map((row) => [row.key, row.netCents, row.transactionCount]),
    [
      ['general', 450900, 501],
      ['unallocated', 500, 1],
    ]
  );
  assert.deepEqual(calls, [
    ['a', '', period.startIso, period.endIso],
    ['a', '0499', period.startIso, period.endIso],
  ]);
  assert.equal((await loadFundGiftActivity(env, "a' OR 1=1 --", period)).giftCount, 0);
} finally {
  db.close();
}

function fake(readPage) {
  let page = 0;
  return {
    AGAPAY_DB: {
      prepare() {
        return {
          bind() {
            return { all: async () => readPage(page++) };
          },
        };
      },
    },
  };
}
const one = (value) => fake(() => ({ results: [{ id: 'a', data: JSON.stringify(value) }] }));
assert.equal(
  (
    await loadFundGiftActivity(
      fake(() => ({})),
      'a',
      period
    )
  ).giftCount,
  0
);
for (const bad of [
  { amountCents: -1 },
  { amountCents: 1.5 },
  { amountCents: 'invalid' },
  {},
  { amountCents: 1, stripeFeeCents: -1 },
  { amountCents: Number.MAX_SAFE_INTEGER + 1 },
]) {
  const result = await loadFundGiftActivity(one(bad), 'a', period);
  assert.equal(result.available, false);
  assert.equal(result.complete, false);
  assert.match(result.reason, /invalid amount/);
  assert.ok(!('giftCount' in result));
}
assert.match(
  (await loadFundGiftActivity(one({ amountCents: 100, currency: 'eur' }), 'a', period)).reason,
  /another currency/
);
await assert.rejects(loadFundGiftActivity(one({ ...gift, parishId: 'foreign' }), 'a', period), /Invalid giving record/);
await assert.rejects(loadFundGiftActivity(one(null), 'a', period), /Invalid giving record/);
await assert.rejects(loadFundGiftActivity(one({ amountCents: 1, currency: 123 }), 'a', period), TypeError);
await assert.rejects(
  loadFundGiftActivity(
    fake(() => ({ results: [{ id: 'a', data: '{invalid' }] })),
    'a',
    period
  ),
  SyntaxError
);
const error = new Error('database unavailable');
await assert.rejects(
  loadFundGiftActivity(
    fake(() => {
      throw error;
    }),
    'a',
    period
  ),
  (e) => e === error
);
let pages = 0;
const capped = await loadFundGiftActivity(
  fake((index) => {
    pages++;
    return {
      results: Array.from({ length: index < 50 ? 500 : 1 }, (_, offset) => ({
        id: String(index * 500 + offset),
        data: JSON.stringify(gift),
      })),
    };
  }),
  'a',
  period
);
assert.equal(pages, 51);
assert.equal(capped.complete, false);
assert.match(capped.reason, /interactive reporting limit/);
assert.ok(!('grossGiftCents' in capped));
console.log(
  'PASS - typed fee coercion, compatibility, real SQL paging/isolation, completeness limits, and failure behavior'
);
