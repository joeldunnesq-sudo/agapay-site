import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { givingContribution, GIVING_GROSS_CENTS_SQL } from '../src/lib/giving-contributions.js';
import { manualIncomeTotalCents } from '../src/lib/stewardship-income.js';
import { readStewardshipGivingMix } from '../src/lib/stewardship-giving.js';

assert.deepEqual(givingContribution(), {
  intendedGiftCents: 0,
  grossContributionCents: 0,
  feeCoverageCents: 0,
  refundedCents: 0,
  contributionCents: 0,
});
assert.deepEqual(
  givingContribution({
    giftAmountCents: '1000',
    amountCents: 9999,
    coverFees: true,
    donorCoveredFeeCents: '30',
    refundedCents: 10,
    stripeRefundedCents: '20',
  }),
  {
    intendedGiftCents: 1000,
    grossContributionCents: 1030,
    feeCoverageCents: 30,
    refundedCents: 20,
    contributionCents: 1010,
  }
);
for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 'invalid', undefined]) {
  assert.equal(givingContribution({ amountCents: value }).contributionCents, 0);
}
for (const coverFees of [false, 'true', 1, null]) {
  assert.equal(givingContribution({ amountCents: 100, coverFees, donorCoveredFeeCents: 10 }).contributionCents, 100);
}
assert.equal(givingContribution({ amountCents: true }).contributionCents, 1);
assert.equal(givingContribution({ amountCents: [12] }).contributionCents, 12);
assert.equal(givingContribution({ giftAmountCents: 0, amountCents: 100 }).contributionCents, 0);
assert.equal(givingContribution({ amountCents: 100, chargeCents: 0, amountChargedCents: 200 }).contributionCents, 0);
assert.equal(
  givingContribution({ amountCents: 100, chargeCents: 'bad', amountChargedCents: 200 }).contributionCents,
  0
);
assert.equal(
  givingContribution({ amountCents: 100, chargeCents: null, amountChargedCents: '120' }).contributionCents,
  120
);
assert.deepEqual(givingContribution({ amountCents: 100, chargeCents: 90, refundedCents: 500 }), {
  intendedGiftCents: 100,
  grossContributionCents: 90,
  feeCoverageCents: 0,
  refundedCents: 90,
  contributionCents: 0,
});
assert.throws(() => givingContribution(null), TypeError);
assert.throws(() => givingContribution({ amountCents: Symbol('invalid') }), TypeError);

const db = new DatabaseSync(':memory:');
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...args) {
          return { first: async () => statement.get(...args) ?? null };
        },
      };
    },
  },
};
try {
  // Preserve the narrowly scoped legacy missing-table fallback.
  assert.equal(await manualIncomeTotalCents(env, 'a', '2026-01-01', '2026-12-31'), 0);
  db.exec(`CREATE TABLE manual_income_entries (
    parish_id TEXT, contribution_eligible INTEGER, entry_date TEXT, amount_cents INTEGER
  ); CREATE TABLE donor_offerings (
    parish_id TEXT, payment_status TEXT, created_at TEXT, stripe_subscription_id TEXT, data TEXT
  );`);
  const income = db.prepare('INSERT INTO manual_income_entries VALUES (?, ?, ?, ?)');
  for (const row of [
    ['a', 1, '2026-01-01', 100],
    ['a', 1, '2026-12-31', 200],
    ['a', 1, '2025-12-31', 9000],
    ['a', 1, '2027-01-01', 9000],
    ['a', 0, '2026-06-01', 9000],
    ['b', 1, '2026-06-01', 9000],
    ['a', 1, '2026-06-01', -50],
  ])
    income.run(...row);
  assert.equal(await manualIncomeTotalCents(env, 'a', '2026-01-01', '2026-12-31'), 250);
  assert.equal(await manualIncomeTotalCents(env, 'empty', '2026-01-01', '2026-12-31'), 0);
  assert.equal(await manualIncomeTotalCents(env, "a' OR 1=1 --", '2026-01-01', '2026-12-31'), 0);
  const gift = db.prepare('INSERT INTO donor_offerings VALUES (?, ?, ?, ?, ?)');
  for (const row of [
    ['a', 'paid', '2026-01-01', 'sub_1', { giftAmountCents: 100, amountCents: 999, chargeCents: 105 }],
    ['a', 'paid', '2026-12-31T23:59:59Z', '', { amountCents: 200 }],
    ['a', 'paid', '2026-06-01', null, { amountCents: 50 }],
    ['a', 'paid', '2025-12-31', 'sub_1', { amountCents: 9000 }],
    ['a', 'paid', '2027-01-01', 'sub_1', { amountCents: 9000 }],
    ['a', 'pending', '2026-06-01', 'sub_1', { amountCents: 9000 }],
    ['b', 'paid', '2026-06-01', 'sub_1', { amountCents: 9000 }],
  ])
    gift.run(...row.slice(0, 4), JSON.stringify(row[4]));
  assert.deepEqual(
    { ...(await readStewardshipGivingMix(env, 'a', 2026)) },
    { total_cents: 350, recurring_received_cents: 100 }
  );
  assert.deepEqual(
    { ...(await readStewardshipGivingMix(env, 'empty', 2026)) },
    { total_cents: 0, recurring_received_cents: 0 }
  );
  assert.deepEqual(
    { ...(await readStewardshipGivingMix(env, "a' OR 1=1 --", 2026)) },
    { total_cents: 0, recurring_received_cents: 0 }
  );
  const gross = db.prepare(`SELECT ${GIVING_GROSS_CENTS_SQL} AS gross FROM (SELECT ? AS data)`);
  for (const [data, expected] of [
    [{ giftAmountCents: 100, chargeCents: 105 }, 105],
    [{ amountCents: 100, amountChargedCents: 110 }, 110],
    [{ amountCents: 100, coverFees: true, donorCoveredFeeCents: 5 }, 105],
    [{ amountCents: 100, coverFees: false, donorCoveredFeeCents: 5 }, 100],
    [{ amountCents: 100, chargeCents: 0 }, 0],
    [{}, 0],
  ])
    assert.equal(gross.get(JSON.stringify(data)).gross, expected);
} finally {
  db.close();
}
const failure = new Error('database unavailable');
const broken = {
  AGAPAY_DB: {
    prepare() {
      throw failure;
    },
  },
};
await assert.rejects(
  () => manualIncomeTotalCents(broken, 'a', '2026-01-01', '2026-12-31'),
  (error) => error === failure
);
await assert.rejects(
  () => readStewardshipGivingMix(broken, 'a', 2026),
  (error) => error === failure
);
const resultEnv = (value) => ({
  AGAPAY_DB: {
    prepare() {
      return {
        bind() {
          return { first: async () => value };
        },
      };
    },
  },
});
assert.equal(await manualIncomeTotalCents(resultEnv({ total_cents: '42' }), 'a', 'start', 'end'), 42);
assert.equal(await manualIncomeTotalCents(resultEnv(null), 'a', 'start', 'end'), 0);
assert.equal(await readStewardshipGivingMix(resultEnv(null), 'a', 2026), null);
console.log(
  'PASS - typed contribution arithmetic, gross SQL, parish/date isolation, reporting reads and failure behavior'
);
