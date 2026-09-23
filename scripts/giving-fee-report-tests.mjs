import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { givingContribution } from '../src/lib/giving-contributions.js';
import { summarizeGivingFees, readGivingFeeReport } from '../src/lib/giving-fee-report.js';
import { recognizeGivingFeeCoverage, givingFeeCoverageBackfill } from '../src/accounting/integrations/fee-coverage.js';
import { recognizeGivingStripeFee } from '../src/accounting/integrations/processor-fees.js';
import {
  initializeLedger,
  ingestAccountingSourceEvent,
  processAccountingSourceEvent,
  updateIntegrationSettings,
  statementOfActivities,
} from '../src/accounting/index.js';
import { computeParishDonorYearGiving } from '../src/handlers/giving-statements.js';
import { buildGivingStatementPdf } from '../src/lib/giving-statement-pdf.js';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';

const gift = {
  id: 'covered',
  giftAmountCents: 10000,
  chargeCents: 10330,
  coverFees: true,
  stripeFeeCents: 330,
  stripeFeeSource: 'balance_transaction',
  stripeBalanceTransactionId: 'txn_test',
  paymentStatus: 'paid',
  currency: 'USD',
  completedAt: '2026-07-20T12:00:00Z',
};
assert.equal(givingContribution(gift).contributionCents, 10330);
assert.equal(givingContribution({ ...gift, refundedCents: 500 }).contributionCents, 9830);
assert.equal(givingContribution({ amountCents: 10000 }).contributionCents, 10000);
assert.equal(
  givingContribution({ amountCents: 10000, coverFees: true }).contributionCents,
  10000,
  'Never invent historical coverage from a checkbox'
);
assert.equal(
  givingContribution({ amountCents: 10000, coverFees: true, donorCoveredFeeCents: 330 }).contributionCents,
  10330
);
const rows = [
  gift,
  { ...gift, chargeCents: 10000, coverFees: false, stripeFeeCents: 320 },
  { ...gift, stripeFeeCents: 0 },
  { ...gift, stripeFeeSource: 'estimated', completedAt: '2026-10-01' },
  { ...gift, currency: 'EUR' },
  { ...gift, paymentStatus: 'failed' },
  { ...gift, completedAt: '2025-07-20' },
];
const report = summarizeGivingFees(rows, 2026);
assert.equal(report.annual.actualStripeFeeCents, 650);
assert.equal(report.annual.donorFundedStripeFeeCents, 330);
assert.equal(report.annual.parishFundedStripeFeeCents, 320);
assert.equal(report.annual.confirmedCount, 3, 'Confirmed zero is distinct from an estimate');
assert.equal(report.annual.pendingCount, 1);
assert.equal(report.annual.excessCoverageCents, 330);
assert.equal(report.quarterly[2].actualStripeFeeCents, 650);
assert.equal(report.quarterly[3].estimatedStripeFeeCents, 330);
assert.equal(report.monthly[6].actualStripeFeeCents, 650);
assert.equal(report.excludedCurrencyCount, 1);
assert.equal(
  summarizeGivingFees([{ ...gift, stripeFeeCents: -1 }], 2026).annual.pendingCount,
  1,
  'Invalid fee data must not appear as confirmed zero'
);
assert.equal(
  summarizeGivingFees([{ ...gift, refundedCents: 10330, paymentStatus: 'refunded' }], 2026).annual
    .parishFundedStripeFeeCents,
  330
);

const sqlite = new DatabaseSync(':memory:');
const prepare = (sql) => ({
  params: [],
  bind(...params) {
    this.params = params;
    return this;
  },
  async first() {
    return sqlite.prepare(sql).get(...this.params) || null;
  },
  async all() {
    return { results: sqlite.prepare(sql).all(...this.params) };
  },
  async run() {
    return { meta: { changes: sqlite.prepare(sql).run(...this.params).changes } };
  },
});
const db = {
  prepare,
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
for (const name of [
  '0001_accounting_database_foundation.sql',
  '0002_core_ledger.sql',
  '0003_phase2a_setup_configuration.sql',
  '0005_phase2c_reporting_indexes.sql',
])
  sqlite.exec(readFileSync(new URL('../accounting-migrations/' + name, import.meta.url), 'utf8'));
const actor = {
  id: 'treasurer',
  type: 'platform_user',
  capabilities: [
    'accounting.configure',
    'accounting.view',
    'accounting.integrations.post',
    'accounting.integrations.configure',
    'accounting.integrations.backfill',
  ],
};
await initializeLedger(db, { actor, date: new Date('2026-07-20T00:00:00Z') });
sqlite.exec(
  readFileSync(new URL('../accounting-migrations/0006_phase2d_give_stripe_integration.sql', import.meta.url), 'utf8')
);
await updateIntegrationSettings(db, {
  actor,
  entitlementTier: 'parish',
  expectedVersion: 1,
  patch: {
    givePostingEnabled: true,
    stripePostingEnabled: true,
    postingMode: 'automatic',
    integrationStartDate: '2026-01-01',
  },
});
const original = await ingestAccountingSourceEvent(db, {
  actor,
  entitlementTier: 'parish',
  event: {
    sourceSystem: 'agapay_give',
    sourceType: 'donation_succeeded',
    sourceEventId: 'give:covered:succeeded',
    sourceObjectId: 'covered',
    donationId: 'covered',
    occurredAt: gift.completedAt,
    grossAmount: 10000,
    designatedFundId: 'fund_general',
  },
});
await processAccountingSourceEvent(db, { actor, entitlementTier: 'parish', sourceEventId: original.id });
const args = { actor, entitlementTier: 'parish', offering: gift, originalEventId: original.id };
assert.equal((await recognizeGivingFeeCoverage(db, args)).status, 'posted');
const duplicate = await recognizeGivingFeeCoverage(db, args);
assert.equal(duplicate.grossAmount, 330);
assert.equal(
  sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n,
  2,
  'Replay must not duplicate contribution revenue'
);
const fee = await ingestAccountingSourceEvent(db, {
  actor,
  entitlementTier: 'parish',
  event: {
    sourceSystem: 'stripe',
    sourceType: 'stripe_fee_assessed',
    sourceEventId: 'fee:covered',
    sourceObjectId: 'covered',
    occurredAt: gift.completedAt,
    feeAmount: 330,
    balanceTransactionId: 'txn_test',
  },
});
await processAccountingSourceEvent(db, { actor, entitlementTier: 'parish', sourceEventId: fee.id });
const activity = await statementOfActivities(db, { actor, startDate: '2026-01-01', endDate: '2026-12-31' });
assert.equal(activity.totals.revenue, 10330);
assert.equal(activity.totals.expenses, 330);
assert.equal(activity.totals.revenue - activity.totals.expenses, 10000);
assert.equal(
  sqlite.prepare('SELECT gross_amount FROM accounting_integration_source_events WHERE id=?').get(original.id)
    .gross_amount,
  10000,
  'Original imported journal remains immutable'
);
await assert.rejects(
  () => givingFeeCoverageBackfill({}, db, { actor: { capabilities: [] }, parishId: 'test', year: 2026 }),
  /permission/
);
sqlite.exec('CREATE TABLE donor_offerings(id TEXT, parish_id TEXT, payment_status TEXT, created_at TEXT, data TEXT)');
const legacy = { ...gift, id: 'legacy' };
sqlite
  .prepare('INSERT INTO donor_offerings VALUES(?,?,?,?,?)')
  .run('legacy', 'test-parish', 'paid', gift.completedAt, JSON.stringify(legacy));
const legacySource = await ingestAccountingSourceEvent(db, {
  actor,
  entitlementTier: 'parish',
  event: {
    sourceSystem: 'agapay_give',
    sourceType: 'donation_succeeded',
    sourceEventId: 'give:legacy:succeeded',
    sourceObjectId: 'legacy',
    donationId: 'legacy',
    occurredAt: gift.completedAt,
    grossAmount: 10000,
    designatedFundId: 'fund_general',
  },
});
await processAccountingSourceEvent(db, { actor, entitlementTier: 'parish', sourceEventId: legacySource.id });
const backfillArgs = { actor, entitlementTier: 'parish', parishId: 'test-parish', year: 2026 };
const preview = await givingFeeCoverageBackfill({ AGAPAY_DB: db }, db, backfillArgs);
assert.equal(preview.totalCents, 330);
const countBefore = sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
assert.equal(
  (await givingFeeCoverageBackfill({ AGAPAY_DB: db }, db, { ...backfillArgs, apply: true })).additions.length,
  0,
  'Application requires reviewed additions'
);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, countBefore);
await assert.rejects(
  () =>
    givingFeeCoverageBackfill({ AGAPAY_DB: db }, db, {
      ...backfillArgs,
      apply: true,
      expectedAdditions: [{ offeringId: 'legacy', amountCents: 999 }],
    }),
  /changed after preview/
);
const applied = await givingFeeCoverageBackfill({ AGAPAY_DB: db }, db, {
  ...backfillArgs,
  apply: true,
  expectedAdditions: preview.additions,
});
assert.equal(applied.additions[0].status, 'posted');
assert.equal((await givingFeeCoverageBackfill({ AGAPAY_DB: db }, db, backfillArgs)).additions.length, 0);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, countBefore + 1);
const pending = await ingestAccountingSourceEvent(db, {
  actor,
  entitlementTier: 'parish',
  event: {
    sourceSystem: 'stripe',
    sourceType: 'stripe_fee_assessed',
    sourceEventId: 'give:late:stripe_fee',
    sourceObjectId: 'late',
    donationId: 'late',
    occurredAt: gift.completedAt,
    feeAmount: 999,
    designatedFundId: 'fund_general',
  },
});
assert.equal(
  (await processAccountingSourceEvent(db, { actor, entitlementTier: 'parish', sourceEventId: pending.id })).status,
  'waiting_for_source'
);
const feeArgs = {
  actor,
  entitlementTier: 'parish',
  offering: gift,
  donationId: 'late',
  fundId: 'fund_general',
  occurredAt: gift.completedAt,
};
assert.equal((await recognizeGivingStripeFee(db, feeArgs)).status, 'posted');
assert.equal(
  sqlite.prepare('SELECT status FROM accounting_integration_source_events WHERE id=?').get(pending.id).status,
  'ignored'
);
const afterActual = sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
await recognizeGivingStripeFee(db, feeArgs);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, afterActual);
assert.equal(
  await recognizeGivingStripeFee(db, {
    ...feeArgs,
    donationId: 'estimate-only',
    offering: { ...gift, stripeFeeSource: 'estimated' },
  }),
  null
);
assert.equal(
  await recognizeGivingStripeFee(db, {
    ...feeArgs,
    donationId: 'confirmed-zero',
    offering: { ...gift, stripeFeeCents: 0 },
  }),
  null
);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, afterActual);
sqlite.close();

const f = await createOutsideGiftsFixture();
try {
  f.db.exec('DELETE FROM donor_offerings');
  const year = 2026;
  const parishId = f.registration.parishId;
  const insert = f.db.prepare(
    'INSERT INTO donor_offerings(id,parish_id,donor_email,payment_status,created_at,data) VALUES(?,?,?,?,?,?)'
  );
  insert.run(
    'covered',
    parishId,
    'donor@example.test',
    'paid',
    gift.completedAt,
    JSON.stringify({ ...gift, donorName: 'Example Donor' })
  );
  insert.run(
    'partial',
    parishId,
    'donor@example.test',
    'partially_refunded',
    gift.completedAt,
    JSON.stringify({ ...gift, refundedCents: 500, refundedAt: '2026-08-01' })
  );
  insert.run('other', 'another-parish', 'donor@example.test', 'paid', gift.completedAt, JSON.stringify(gift));
  const donors = await computeParishDonorYearGiving(f.env, parishId, year);
  const donor = donors.find((item) => item.email === 'donor@example.test');
  assert.equal(donor.totalCents, 20160);
  assert.equal(donor.gifts[0].feeCoverageCents, 330);
  const scoped = await readGivingFeeReport(f.env, parishId, year);
  assert.equal(scoped.annual.giftCount, 2);
  assert.equal(scoped.annual.actualStripeFeeCents, 660);
  await assert.rejects(() => readGivingFeeReport(f.env, parishId, NaN), /valid reporting year/);
  if (process.env.GIVING_FEE_PDF) {
    mkdirSync('tmp/pdfs', { recursive: true });
    const pdf = await buildGivingStatementPdf({
      parish: { parishName: 'Example Orthodox Parish', ein: '00-0000000' },
      donor: { donorName: 'Example Donor', email: donor.email },
      fiscalYear: year,
      gifts: donor.gifts,
      totalCents: donor.totalCents,
    });
    writeFileSync('tmp/pdfs/fee-coverage-statement.pdf', pdf);
  }
} finally {
  f.db.close();
}
console.log(
  'PASS - donor gross contributions, refunds, fee periods, actual versus estimated fees, annual statements, balanced accounting and idempotent historical coverage'
);
