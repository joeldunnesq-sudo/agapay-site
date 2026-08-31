import assert from 'node:assert/strict';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';
import { outsideGiftRow, outsideGiftsForGiving, subtractLinkedOutsideGifts } from '../src/lib/outside-gifts.js';
import { linkOutsideGift, unlinkOutsideGift } from '../src/handlers/outside-gift-accounting.js';
import {
  outsidePledgeGiving,
  addOutsideDonorPledgeSummary,
  parishPledgeReceivedCents,
} from '../src/lib/outside-pledges.js';
import { exportMonthlyGiving } from '../src/lib/monthly-giving-export.js';
import { computeParishDonorYearGiving } from '../src/handlers/giving-statements.js';

const f = await createOutsideGiftsFixture();
const year = new Date().getFullYear();
const body = {
  requestKey: crypto.randomUUID(),
  entryDate: `${year}-01-03`,
  amountCents: 10000,
  source: 'check',
  fundId: 'general',
  giverReferenceId: 'sample_0_0',
  reference: 'Check 1001',
  notes: 'Sunday collection',
  confirmedNotDuplicate: true,
  givingKind: 'other',
};
const save = (overrides = {}) => f.outside('', { ...body, requestKey: crypto.randomUUID(), ...overrides });
async function expect(response, status) {
  const res = await response;
  const data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  return data;
}
try {
  assert.equal((await f.outside('', undefined, 'invalid')).status, 401);
  for (const tier of ['starter', 'giving', 'parish']) {
    f.registration.subscriptionTier = tier;
    f.updateRegistration();
    await expect(f.outside(), 200);
  }
  f.registration.subscriptionTier = 'starter';
  f.registration.subscriptionStatus = 'canceled';
  f.updateRegistration();
  await expect(f.outside(), 403);
  f.registration.subscriptionStatus = 'active';
  f.updateRegistration();
  assert.equal((await expect(f.outside('/givers?q=Anna'), 200)).givers[0].name, 'Anna Martin');
  for (const invalid of [
    { amountCents: 1.5 },
    { amountCents: -1 },
    { entryDate: `${year}-02-30` },
    { fundId: 'invented' },
    { confirmedNotDuplicate: false },
    { giverReferenceId: 'other-parish-giver' },
    { givingKind: '' },
    { givingKind: 'pledge', pledgeYear: year - 2 },
    { givingKind: 'pledge', pledgeYear: year, giverReferenceId: '' },
  ])
    await expect(save(invalid), 422);
  const first = await expect(f.outside('', body), 201);
  const id = first.gift.id;
  assert.equal((await expect(f.outside('', body), 200)).gift.id, id, 'same save must be idempotent');
  await expect(f.outside('', { ...body, amountCents: 20 }), 409);
  await expect(save(), 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM manual_income_entries').get().n, 1);
  const dupe = await expect(save({ duplicateReason: 'Second check for the same amount' }), 201);
  await expect(f.outside('/' + dupe.gift.id + '/void', { revision: 1, reason: 'Entered twice accidentally' }), 200);
  const beforePledge = await parishPledgeReceivedCents(f.env, f.registration.parishId, year);
  const pledge = await expect(save({ reference: 'Check pledge', givingKind: 'pledge', pledgeYear: year }), 201);
  assert.equal((await outsidePledgeGiving(f.env, f.registration.parishId, year))[0].given_cents, 10000);
  assert.equal(await parishPledgeReceivedCents(f.env, f.registration.parishId, year), beforePledge + 10000);
  const baseSummary = { year, stewardshipYtdCents: 100, stewardshipMonthCents: 50 };
  assert.equal(
    (
      await addOutsideDonorPledgeSummary(
        f.env,
        { email: 'giver0@example.test', defaultParishId: f.registration.parishId },
        baseSummary,
        new Date(`${year}-01-10`)
      )
    ).stewardshipYtdCents,
    10100
  );
  assert.equal(
    (
      await addOutsideDonorPledgeSummary(
        f.env,
        { email: 'giver1@example.test', defaultParishId: f.registration.parishId },
        baseSummary
      )
    ).stewardshipYtdCents,
    100,
    'other giver never receives pledge credit'
  );
  const changed = await expect(
    f.outside('/' + pledge.gift.id + '/correct', {
      ...body,
      reference: 'Check pledge',
      givingKind: 'other',
      revision: 1,
      reason: 'This was a special collection',
    }),
    200
  );
  assert.equal(changed.gift.revision, 2);
  assert.equal(
    await parishPledgeReceivedCents(f.env, f.registration.parishId, year),
    beforePledge,
    'other giving never counts as pledge fulfillment'
  );
  assert.deepEqual(
    await outsidePledgeGiving(f.env, f.registration.parishId, year),
    [],
    'correction removes pledge credit'
  );
  await expect(
    f.outside('/' + pledge.gift.id + '/correct', { ...body, revision: 1, reason: 'Stale update attempt' }),
    409
  );
  await expect(
    f.outside('/' + pledge.gift.id + '/void', { revision: 2, reason: 'Gift entered for wrong parish' }),
    200
  );
  assert.deepEqual(await outsidePledgeGiving(f.env, f.registration.parishId, year), []);
  assert.throws(
    () => f.db.prepare('DELETE FROM manual_income_entries WHERE id=?').run(id),
    /constraint/i,
    'audit records cannot be hard-deleted'
  );
  const audit = await expect(f.outside('/' + pledge.gift.id), 200);
  assert.deepEqual(
    audit.audit.map((a) => a.action),
    ['voided', 'corrected', 'created']
  );
  assert.equal(JSON.parse(audit.audit[2].snapshot_json).giving_kind, 'pledge');
  f.registration.funds[0].name = 'Renamed Parish Fund';
  f.updateRegistration();
  assert.equal(
    (await expect(f.outside('/' + id), 200)).gift.fund,
    'Renamed Parish Fund',
    'Funds & Alms name is authoritative'
  );
  const csv = await exportMonthlyGiving(
    new Request(`https://parish.test?month=${year}-01&groupBy=giver`),
    f.env,
    f.registration.parishId,
    f.registration
  );
  assert.equal(csv.status, 200);
  const csvText = await csv.text();
  assert.match(csvText, /Check 1001/);
  assert.match(csvText, /Outside contribution; fees and bank net not verified/);
  assert.doesNotMatch(csvText, /Check pledge/);
  assert.match(csvText, /Giving purpose/);
  assert.equal(
    (await computeParishDonorYearGiving(f.env, f.registration.parishId, year))
      .find((d) => d.email === 'giver0@example.test')
      .gifts.filter((g) => g.label.includes('(Check)')).length,
    1
  );
  await expect(f.outside('/' + id + '/accounting'), 403, 'Give cannot access Accounting');
  f.db
    .exec(`CREATE TABLE accounting_journal_entries(id TEXT PRIMARY KEY,entry_date TEXT,description TEXT,status TEXT,source_type TEXT);
    CREATE TABLE accounting_journal_lines(id TEXT PRIMARY KEY,journal_entry_id TEXT,credit_amount INTEGER,debit_amount INTEGER,account_id TEXT,fund_id TEXT);
    CREATE TABLE accounting_accounts(id TEXT PRIMARY KEY,name TEXT,account_type_id TEXT);
    CREATE TABLE accounting_account_types(id TEXT PRIMARY KEY,category TEXT);
    CREATE TABLE accounting_funds(id TEXT PRIMARY KEY,giving_source_id TEXT,giving_source_type TEXT);
    INSERT INTO accounting_journal_entries VALUES('entry','2026-01-04','Sunday contributions','posted','manual');
    INSERT INTO accounting_journal_lines VALUES('line','entry',15000,0,'income','fund');
    INSERT INTO accounting_accounts VALUES('income','Contributions','revenue');
    INSERT INTO accounting_account_types VALUES('revenue','revenue');
    INSERT INTO accounting_funds VALUES('fund','general','fund');`);
  const ledger = f.env.AGAPAY_DB;
  const original = await outsideGiftRow(f.env.AGAPAY_DB, f.registration.parishId, id);
  const linked = await linkOutsideGift(
    f.env.AGAPAY_DB,
    ledger,
    f.registration.parishId,
    'entity',
    'staff:test',
    original,
    { lineId: 'line', revision: 1, confirmedDeposit: true }
  );
  assert.equal(linked.accounting_line_id, 'line');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 1, 'link never posts income');
  f.db.exec("UPDATE accounting_journal_entries SET status='reversed'");
  await assert.rejects(
    () =>
      linkOutsideGift(f.env.AGAPAY_DB, ledger, f.registration.parishId, 'entity', 'staff:test', linked, {
        lineId: 'line',
        revision: 2,
        confirmedDeposit: true,
      }),
    /posted manual contribution/
  );
  f.db.exec("UPDATE accounting_journal_entries SET status='posted'");
  await expect(f.outside('/' + id + '/void', { revision: 2, reason: 'Cannot void a linked gift' }), 409);
  const another = await expect(save({ reference: 'Another valid gift' }), 201);
  await assert.rejects(
    () =>
      linkOutsideGift(
        f.env.AGAPAY_DB,
        ledger,
        f.registration.parishId,
        'entity',
        'staff:test',
        outsideRow(another.gift),
        { lineId: 'line', revision: 1, confirmedDeposit: true }
      ),
    /insufficient/
  );
  const gifts = await outsideGiftsForGiving(f.env, f.registration.parishId, f.registration);
  assert.equal(
    subtractLinkedOutsideGifts([{ id: 'accounting:entry:line', amountCents: 15000 }], gifts)[0].amountCents,
    5000
  );
  await unlinkOutsideGift(f.env.AGAPAY_DB, f.registration.parishId, 'staff:test', linked, {
    revision: 2,
    reason: 'Correcting the bank match',
    confirmedLedgerUnchanged: true,
  });
  assert.equal((await outsideGiftRow(f.env.AGAPAY_DB, f.registration.parishId, id)).accounting_line_id, null);
  console.log(
    'PASS outside gifts: authorization, exact cents, fund/giver identity, duplicate saves, audit/void, pledge classification, CSV/statements and Accounting allocation capacity'
  );
} finally {
  f.dispose();
}
function outsideRow(gift) {
  return {
    id: gift.id,
    parish_id: f.registration.parishId,
    fund_id: gift.fundId,
    amount_cents: gift.amountCents,
    revision: gift.revision,
    record_state: 'active',
  };
}
