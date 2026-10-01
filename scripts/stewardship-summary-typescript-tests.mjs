import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { stewardshipGivingSummary } from '../src/lib/stewardship-summary.js';
import { manualIncomeTotalCents } from '../src/lib/stewardship-income.js';

const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ['2026-07-01T12:00:00Z']));
  }
  static now() {
    return new RealDate('2026-07-01T12:00:00Z').getTime();
  }
}
const db = new DatabaseSync(':memory:');
const queries = [];
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...params) {
          queries.push({ sql, params });
          return {
            first: async () => statement.get(...params) ?? null,
            all: async () => ({ results: statement.all(...params) }),
          };
        },
      };
    },
  },
};
globalThis.Date = FixedDate;
try {
  db.exec(`CREATE TABLE household_pledges(parish_id TEXT, donor_email TEXT, fiscal_year INTEGER, target_amount_cents INTEGER);
    CREATE TABLE donor_offerings(id TEXT, parish_id TEXT, donor_email TEXT, payment_status TEXT, created_at TEXT, data TEXT);
    CREATE TABLE manual_income_entries(id TEXT, parish_id TEXT, entry_date TEXT, contribution_eligible INTEGER, amount_cents INTEGER);
    CREATE TABLE outside_gift_details(gift_id TEXT, parish_id TEXT, giver_reference_id TEXT, giver_email TEXT, record_state TEXT, giving_kind TEXT, pledge_year INTEGER);`);
  db.prepare('INSERT INTO household_pledges VALUES(?,?,?,?)').run('a', 'person@example.test', 2026, 400);
  db.prepare('INSERT INTO household_pledges VALUES(?,?,?,?)').run('b', 'person@example.test', 2026, 99999);
  const gift = db.prepare('INSERT INTO donor_offerings VALUES(?,?,?,?,?,?)');
  for (const [id, parish, email, status, date, amount, kind] of [
    ['start', 'a', 'person@example.test', 'paid', '2026-01-01T00:00:00Z', 100, 'general'],
    ['end', 'a', 'person@example.test', 'succeeded', '2026-12-31T23:59:59Z', 200, 'stewardship'],
    ['special', 'a', 'person@example.test', 'paid', '2026-06-01T00:00:00Z', 50, 'building'],
    ['unpledged', 'a', 'other@example.test', 'paid', '2026-06-01T00:00:00Z', 70, 'general'],
    ['prior', 'a', 'person@example.test', 'paid', '2025-12-31T23:59:59Z', 1000, 'general'],
    ['next', 'a', 'person@example.test', 'paid', '2027-01-01T00:00:00Z', 9000, 'general'],
    ['failed', 'a', 'person@example.test', 'failed', '2026-06-01T00:00:00Z', 9000, 'general'],
    ['foreign', 'b', 'person@example.test', 'paid', '2026-06-01T00:00:00Z', 9000, 'general'],
  ])
    gift.run(
      id,
      parish,
      email,
      status,
      date,
      JSON.stringify({ giftAmountCents: amount, amountCents: 99999, giftType: kind })
    );
  const income = db.prepare('INSERT INTO manual_income_entries VALUES(?,?,?,?,?)');
  for (const row of [
    ['pledged', 'a', '2026-07-01', 1, 200],
    ['other', 'a', '2026-12-31', 1, 300],
    ['prior', 'a', '2025-12-31', 1, 100],
    ['ineligible', 'a', '2026-06-01', 0, 9000],
    ['foreign', 'b', '2026-06-01', 1, 9000],
  ])
    income.run(...row);
  db.prepare('INSERT INTO outside_gift_details VALUES(?,?,?,?,?,?,?)').run(
    'pledged',
    'a',
    null,
    'person@example.test',
    'active',
    'pledge',
    2026
  );
  const calls = [];
  const readManual = async (...args) => {
    calls.push(args);
    return manualIncomeTotalCents(...args);
  };
  const result = await stewardshipGivingSummary(env, 'a', 2026, readManual);
  assert.deepEqual(result, {
    fiscal_year: 2026,
    pledging_donors: 1,
    active_donors: 2,
    total_pledged_cents: 400,
    pledge_actual_cents: 500,
    total_actual_cents: 920,
    manual_income_cents: 500,
    prior_year_actual_cents: 1100,
    run_rate_cents: Math.round((920 / 182) * 365),
    fulfillment_rate_pct: 125,
    avg_per_donor_cents: 460,
    day_of_year: 182,
    days_in_year: 365,
  });
  assert.deepEqual(
    calls.map((args) => args.slice(1)),
    [
      ['a', '2026-01-01', '2026-12-31'],
      ['a', '2025-01-01', '2025-12-31'],
    ]
  );
  assert.ok(calls.every((args) => args[0] === env));
  const empty = await stewardshipGivingSummary(env, 'empty', 2026, manualIncomeTotalCents);
  assert.equal(empty.fulfillment_rate_pct, null);
  for (const field of [
    'pledging_donors',
    'active_donors',
    'total_actual_cents',
    'pledge_actual_cents',
    'run_rate_cents',
    'avg_per_donor_cents',
  ])
    assert.equal(empty[field], 0, field);
  assert.equal(
    (await stewardshipGivingSummary(env, "a' OR 1=1 --", 2026, manualIncomeTotalCents)).total_actual_cents,
    0
  );
  const future = await stewardshipGivingSummary(env, 'empty', 2100, manualIncomeTotalCents);
  assert.equal(future.day_of_year, 1, 'Future report years retain the one-day minimum');
  assert.equal(future.days_in_year, 366, 'Preserve the existing divisible-by-four leap-year calculation');
  const historical = await stewardshipGivingSummary(env, 'empty', 2024, manualIncomeTotalCents);
  assert.ok(historical.day_of_year > 366, 'Historical report elapsed days are not capped');
  const incomeOnly = await stewardshipGivingSummary(env, 'empty', 2026, async () => 25);
  assert.equal(incomeOnly.total_actual_cents, 25);
  assert.equal(incomeOnly.avg_per_donor_cents, 0);
  const failure = new Error('manual income unavailable');
  await assert.rejects(
    () =>
      stewardshipGivingSummary(env, 'a', 2026, async () => {
        throw failure;
      }),
    (error) => error === failure
  );
  const dbFailure = new Error('query unavailable');
  await assert.rejects(
    () =>
      stewardshipGivingSummary(
        {
          AGAPAY_DB: {
            prepare() {
              throw dbFailure;
            },
          },
        },
        'a',
        2026,
        manualIncomeTotalCents
      ),
    (error) => error === dbFailure
  );
  assert.ok(queries.length > 0);
} finally {
  globalThis.Date = RealDate;
  db.close();
}
console.log(
  'PASS - typed stewardship summary, actual/pledge distinction, period queries, isolation, projection math and failures'
);
