import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as legacy from '../src/lib/outside-pledges.js';
import {
  outsidePledgeGiving,
  parishPledgeReceivedCents,
  addOutsideDonorPledgeSummary,
} from '../src/lib/pledge-report-reads.js';
for (const [name, fn] of Object.entries({
  outsidePledgeGiving,
  parishPledgeReceivedCents,
  addOutsideDonorPledgeSummary,
}))
  assert.equal(legacy[name], fn);
const summary = { year: 2026, stewardshipYtdCents: 100, stewardshipMonthCents: 20, extra: { retained: true } };
const donor = { defaultParishId: 'a', email: ' PERSON@EXAMPLE.TEST ' };
const now = new Date('2026-07-15T00:00:00Z');
assert.deepEqual(await outsidePledgeGiving({}, 'a', 2026), []);
assert.equal(await addOutsideDonorPledgeSummary({}, donor, summary, now), summary);
assert.equal(await addOutsideDonorPledgeSummary({ AGAPAY_DB: {} }, {}, summary, now), summary);
const failure = new Error('database unavailable');
const broken = {
  AGAPAY_DB: {
    prepare() {
      throw failure;
    },
  },
};
for (const operation of [
  () => outsidePledgeGiving(broken, 'a', 2026),
  () => parishPledgeReceivedCents(broken, 'a', 2026),
  () => addOutsideDonorPledgeSummary(broken, donor, summary, now),
])
  await assert.rejects(operation, (error) => error === failure);
for (const name of ['manual_income_entries', 'outside_gift_details']) {
  const missing = {
    AGAPAY_DB: {
      prepare() {
        throw new Error(`no such table: ${name}`);
      },
    },
  };
  assert.deepEqual(await outsidePledgeGiving(missing, 'a', 2026), []);
  assert.equal(await addOutsideDonorPledgeSummary(missing, donor, summary, now), summary);
}
const missingOther = {
  AGAPAY_DB: {
    prepare() {
      throw new Error('no such table: donor_offerings');
    },
  },
};
await assert.rejects(() => outsidePledgeGiving(missingOther, 'a', 2026), /donor_offerings/);
await assert.rejects(() => addOutsideDonorPledgeSummary(missingOther, donor, summary, now), /donor_offerings/);
const nullRow = {
  AGAPAY_DB: {
    prepare() {
      return {
        bind() {
          return { first: async () => null };
        },
      };
    },
  },
};
await assert.rejects(() => parishPledgeReceivedCents(nullRow, 'a', 2026), TypeError);
await assert.rejects(() => addOutsideDonorPledgeSummary(nullRow, donor, summary, now), TypeError);

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
  db.exec(`CREATE TABLE donor_offerings(id TEXT, parish_id TEXT, data TEXT, donor_email TEXT, payment_status TEXT, created_at TEXT);
    CREATE TABLE household_pledges(parish_id TEXT, donor_email TEXT, fiscal_year INTEGER, target_amount_cents INTEGER);
    CREATE TABLE manual_income_entries(id TEXT, parish_id TEXT, amount_cents INTEGER, entry_date TEXT, contribution_eligible INTEGER);
    CREATE TABLE outside_gift_details(gift_id TEXT, parish_id TEXT, giver_reference_id TEXT, giver_email TEXT, record_state TEXT, giving_kind TEXT, pledge_year INTEGER);`);
  const pledge = db.prepare('INSERT INTO household_pledges VALUES(?,?,?,?)');
  pledge.run('a', 'PERSON@example.test', 2026, 10000);
  pledge.run('a', 'zero@example.test', 2026, 0);
  const online = db.prepare('INSERT INTO donor_offerings VALUES(?,?,?,?,?,?)');
  for (const [id, parish, email, status, date, kind] of [
    ['one', 'a', 'person@example.test', 'paid', '2026-01-01', 'general'],
    ['two', 'a', 'person@example.test', 'succeeded', '2026-12-31T23:59:59Z', 'STEWARDSHIP'],
    ['prior', 'a', 'person@example.test', 'paid', '2025-12-31', 'general'],
    ['next', 'a', 'person@example.test', 'paid', '2027-01-01', 'general'],
    ['other', 'b', 'person@example.test', 'paid', '2026-07-01', 'general'],
    ['failed', 'a', 'person@example.test', 'failed', '2026-07-01', 'general'],
    ['special', 'a', 'person@example.test', 'paid', '2026-07-01', 'building'],
    ['zero', 'a', 'zero@example.test', 'paid', '2026-07-01', 'general'],
    ['unpledged', 'a', 'unpledged@example.test', 'paid', '2026-07-01', 'general'],
  ])
    online.run(id, parish, JSON.stringify({ amountCents: 50, giftType: kind }), email, status, date);
  // Linked giver email takes precedence over the saved fallback, with parish-scoped joins.
  online.run(
    'linked',
    'a',
    JSON.stringify({ email: ' Person@Example.Test ', donorEmail: 'wrong@example.test' }),
    '',
    'pending',
    '2026-07-01'
  );
  online.run('linked', 'b', JSON.stringify({ email: 'foreign@example.test' }), '', 'pending', '2026-07-01');
  const income = db.prepare('INSERT INTO manual_income_entries VALUES(?,?,?,?,?)');
  const detail = db.prepare('INSERT INTO outside_gift_details VALUES(?,?,?,?,?,?,?)');
  for (const [id, parish, amount, date, eligible, state, kind, year, reference] of [
    ['july', 'a', 200, '2026-07-01', 1, 'active', 'pledge', 2026, 'linked'],
    ['prior-received', 'a', 300, '2025-12-31', 1, 'active', 'pledge', 2026, null],
    ['foreign', 'b', 9000, '2026-07-01', 1, 'active', 'pledge', 2026, null],
    ['void', 'a', 9000, '2026-07-01', 1, 'void', 'pledge', 2026, null],
    ['ineligible', 'a', 9000, '2026-07-01', 0, 'active', 'pledge', 2026, null],
    ['other-kind', 'a', 9000, '2026-07-01', 1, 'active', 'other', 2026, null],
    ['other-year', 'a', 9000, '2026-07-01', 1, 'active', 'pledge', 2025, null],
  ]) {
    income.run(id, parish, amount, date, eligible);
    detail.run(id, parish, reference, reference ? 'wrong@example.test' : ' person@example.test ', state, kind, year);
  }
  const grouped = await outsidePledgeGiving(env, 'a', 2026);
  // Existing SQL groups by the source donor_email when that name collides with
  // the normalized output alias; both rows remain part of the parish total.
  assert.deepEqual(
    grouped.map((row) => row.donor_email),
    ['person@example.test', 'person@example.test']
  );
  assert.deepEqual(
    grouped.map((row) => row.given_cents).sort((a, b) => a - b),
    [200, 300]
  );
  assert.equal(await parishPledgeReceivedCents(env, 'a', 2026), 600);
  const updated = await addOutsideDonorPledgeSummary(env, donor, summary, now);
  assert.deepEqual(updated, {
    ...summary,
    stewardshipYtdCents: 600,
    stewardshipMonthCents: 220,
    outsidePledgeYtdCents: 500,
    outsidePledgeMonthCents: 200,
  });
  assert.equal(updated.extra, summary.extra);
  assert.equal(summary.stewardshipYtdCents, 100, 'Success must not mutate the caller summary');
  assert.deepEqual(await outsidePledgeGiving(env, "a' OR 1=1 --", 2026), []);
  assert.equal(await parishPledgeReceivedCents(env, 'empty', 2026), 0);
  const empty = await addOutsideDonorPledgeSummary(env, { ...donor, email: 'nobody@example.test' }, summary, now);
  assert.equal(empty.outsidePledgeYtdCents, 0);
  assert.equal(empty.stewardshipYtdCents, 100);
} finally {
  db.close();
}
console.log(
  'PASS - pledge reporting compatibility, year/designation rules, donor joins, parish isolation, summary identity and failures'
);
