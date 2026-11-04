import assert from 'node:assert/strict';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import { accountingOnboardingJourney } from '../src/accounting/onboarding/service.js';
import { saveOnboardingReview } from '../src/accounting/onboarding/evidence.js';
import {
  createBankAccount,
  createReconciliation,
  completeReconciliation,
} from '../src/accounting/reconciliation/service.js';
const { db, sqlite, actor, reviewer } = await accountingNativeFixture();
let journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
assert.equal(journey.total, 8);
assert.equal(
  journey.tasks.find((t) => t.id === 'accounts').status,
  'action_needed',
  'Seeded categories are not an operator review'
);
assert.equal(journey.firstReconciliationComplete, false);
const before = sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
const review = async (id, choice = 'reviewed', note = 'Reviewed synthetic parish setup records') => {
  journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
  const task = journey.tasks.find((t) => t.id === id);
  return saveOnboardingReview(db, actor, id, {
    choice,
    note,
    expectedVersion: task.review?.version || 0,
    evidenceHash: task.evidenceHash,
  });
};
for (const id of ['fiscal', 'accounts', 'funds']) await review(id);
await review('records', 'importing');
journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
assert.equal(journey.tasks.find((t) => t.id === 'records').status, 'action_needed');
await review('records', 'new_books');
await review('assets', 'deferred');
journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
assert.equal(
  journey.tasks.find((t) => t.id === 'assets').status,
  'action_needed',
  'Deferred work is never a completed milestone'
);
await review('assets', 'none');
journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
const stale = journey.tasks.find((t) => t.id === 'funds');
sqlite
  .prepare("UPDATE accounting_funds SET name='Changed synthetic fund',version=version+1 WHERE id='fund_general'")
  .run();
await assert.rejects(
  () =>
    saveOnboardingReview(db, actor, 'funds', {
      choice: 'reviewed',
      note: 'Attempt using old records',
      expectedVersion: stale.review.version,
      evidenceHash: stale.evidenceHash,
    }),
  /underlying records changed/
);
assert.equal(
  (await accountingOnboardingJourney(db, actor, 'advanced_operations')).tasks.find((t) => t.id === 'funds').status,
  'action_needed'
);
await review('funds');
await assert.rejects(() =>
  saveOnboardingReview(db, { id: 'viewer', capabilities: ['accounting.view'] }, 'funds', {
    choice: 'reviewed',
    note: 'Not authorized',
    expectedVersion: 2,
    evidenceHash: '',
  })
);
sqlite.exec(
  "CREATE TRIGGER onboarding_fault BEFORE INSERT ON accounting_onboarding_audit BEGIN SELECT RAISE(ABORT,'injected review failure'); END"
);
const old = sqlite.prepare("SELECT * FROM accounting_onboarding_reviews WHERE task_id='accounts'").get();
await assert.rejects(() => review('accounts'), /injected/);
assert.deepEqual(sqlite.prepare("SELECT * FROM accounting_onboarding_reviews WHERE task_id='accounts'").get(), old);
sqlite.exec('DROP TRIGGER onboarding_fault');
const bank = await createBankAccount(db, {
  actor,
  entitlementTier: 'parish',
  input: { name: 'Synthetic operating bank', ledgerAccountId: 'acct_1010', accountType: 'checking' },
});
const recon = await createReconciliation(db, {
  actor,
  entitlementTier: 'parish',
  input: {
    bankAccountId: bank.id,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    beginningBalance: 0,
    endingBalance: 0,
  },
});
journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
assert.equal(journey.readyForFirstReconciliation, true);
assert.equal(journey.firstReconciliationComplete, false, 'Draft reconciliation cannot complete the milestone');
await completeReconciliation(db, {
  actor: reviewer,
  entitlementTier: 'parish',
  reconciliationId: recon.id,
  expectedVersion: recon.version,
});
journey = await accountingOnboardingJourney(db, actor, 'advanced_operations');
assert.equal(journey.completed, 8);
assert.equal(journey.firstReconciliationComplete, true);
assert.equal(
  sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n,
  before,
  'Setup reviews and a zero-activity synthetic reconciliation do not create journal entries'
);
assert.throws(() => sqlite.prepare('DELETE FROM accounting_onboarding_audit').run(), /immutable/);
assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
console.log(
  'PASS guided setup requires explicit current reviews, deferrals stay pending, stale data and unauthorized changes fail, audit failures roll back, and only a completed reconciliation finishes the journey'
);

const { captureDatabase } = await import('../src/recovery/storage.js');
const { planDatabase, applyDatabase } = await import('../src/recovery/database.js');
const snapshot = await captureDatabase(db, 'books', 'synthetic-readiness');
await review('fiscal', 'reviewed', 'Later synthetic review to be restored');
const plan = await planDatabase(db, 'books', 'synthetic-readiness', snapshot);
await applyDatabase(db, 'books', { parish_id: 'synthetic-readiness' }, snapshot, plan);
assert.deepEqual(await captureDatabase(db, 'books', 'synthetic-readiness'), snapshot);
assert.throws(() => sqlite.prepare('DELETE FROM accounting_onboarding_audit').run(), /immutable/);
console.log('PASS onboarding decisions and immutable audit survive real recovery capture/plan/apply');

const importing = await accountingNativeFixture();
let progress = await accountingOnboardingJourney(importing.db, importing.actor, 'advanced_operations');
const records = progress.tasks.find((t) => t.id === 'records');
await saveOnboardingReview(importing.db, importing.actor, 'records', {
  choice: 'importing',
  note: 'Synthetic multi-stage opening import still in progress',
  expectedVersion: 0,
  evidenceHash: records.evidenceHash,
});
const { postOpeningBalanceBatch } = await import('../src/accounting/ledger/service.js');
await postOpeningBalanceBatch(importing.db, {
  actor: importing.actor,
  effectiveDate: '2026-01-01',
  description: 'Synthetic partial opening import',
  lines: [
    { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: 100, creditAmount: 0 },
    { accountId: 'acct_3990', fundId: 'fund_general', debitAmount: 0, creditAmount: 100 },
  ],
  idempotencyKey: 'synthetic-opening',
  requestHash: 'synthetic-opening',
});
progress = await accountingOnboardingJourney(importing.db, importing.actor, 'advanced_operations');
assert.equal(
  progress.tasks.find((t) => t.id === 'records').status,
  'action_needed',
  'A partial posted opening cannot silently finish an explicitly ongoing import'
);
importing.sqlite.close();
console.log('PASS partially posted imports remain pending until the operator records completion');
