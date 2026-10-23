import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  initializeLedger,
  createJournalDraft,
  postJournalEntry,
  updateJournalDraft,
  deleteJournalDraft,
  createBankAccount,
  createVendor,
  createBillDraft,
  postBill,
  createPayment,
  postPayment,
  voidPayment,
  createD1DatabaseFacade,
} from '../src/accounting/index.js';

const actor = {
  id: 'treasurer',
  capabilities: [
    'accounting.configure',
    'accounting.view',
    'accounting.journals.create',
    'accounting.journals.post',
    'accounting.bank_accounts.manage',
    'ap.enter',
    'ap.approve',
    'ap.pay',
    'ap.view',
    'ap.void',
  ],
};
let sequentialWrites = 0;
const unsafeFacade = createD1DatabaseFacade(
  {
    async execute() {
      sequentialWrites++;
      return [];
    },
  },
  'test-provider'
);
await assert.rejects(
  () => unsafeFacade.batch([unsafeFacade.prepare('UPDATE test SET value=1')]),
  /atomic database batch/
);
assert.equal(sequentialWrites, 0);
const s = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });

for (const migration of [
  '0001_accounting_database_foundation.sql',
  '0002_core_ledger.sql',
  '0003_phase2a_setup_configuration.sql',
  '0004_phase2b_manual_ledger.sql',
])
  s.exec(readFileSync(new URL(`../accounting-migrations/${migration}`, import.meta.url), 'utf8'));
let failSql = '',
  beforeBatch;
const db = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return s.prepare(sql).get(...this.params) || null;
      },
      async all() {
        return { results: s.prepare(sql).all(...this.params) };
      },
      async run() {
        if (failSql && sql.includes(failSql)) {
          failSql = '';
          throw new Error('Injected write failure');
        }
        return { meta: { changes: s.prepare(sql).run(...this.params).changes } };
      },
    };
  },
  async batch(statements) {
    const hook = beforeBatch;
    beforeBatch = undefined;
    hook?.();
    s.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      s.exec('COMMIT');
      return results;
    } catch (error) {
      s.exec('ROLLBACK');
      throw error;
    }
  },
};
const count = (table) => s.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const lines = (amount) => [
  { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: amount },
  { accountId: 'acct_4010', fundId: 'fund_general', creditAmount: amount },
];
const input = { actor, entryDate: '2026-07-20', description: 'Receipt', lines: lines(100) };
await initializeLedger(db, { actor, date: new Date('2026-07-20T00:00:00Z') });
for (const migration of [
  '0006_phase2d_give_stripe_integration.sql',
  '0007_phase2e_bank_reconciliation.sql',
  '0008_phase3a_accounts_payable.sql',
])
  s.exec(readFileSync(new URL(`../accounting-migrations/${migration}`, import.meta.url), 'utf8'));
s.exec('PRAGMA foreign_keys=ON');
assert.deepEqual(s.prepare('PRAGMA foreign_key_check').all(), []);

for (const overrides of [
  { entryDate: '2026-02-30' },
  { entryDate: '2025-02-29' },
  { description: '   ' },
  { lines: [lines(100)[0], { ...lines(100)[1], creditAmount: 0.5 }] },
  { lines: [...lines(Number.MAX_SAFE_INTEGER), ...lines(1)] },
])
  await assert.rejects(() => createJournalDraft(db, { ...input, ...overrides }));
assert.equal(count('accounting_journal_entries'), 0);
failSql = 'INSERT INTO accounting_journal_lines';
await assert.rejects(() => createJournalDraft(db, input), /Injected/);
assert.equal(count('accounting_journal_entries'), 0);
assert.equal(count('accounting_journal_lines'), 0);
console.log('PASS - invalid dates, amounts, aggregate overflow and interrupted creation leave no partial journal');

const draft = await createJournalDraft(db, input);
await assert.rejects(() =>
  updateJournalDraft(db, { ...input, journalEntryId: draft.id, expectedVersion: 1, entryDate: '2026-13-01' })
);
beforeBatch = () => s.prepare('UPDATE accounting_journal_entries SET version=2 WHERE id=?').run(draft.id);
await assert.rejects(() =>
  updateJournalDraft(db, { ...input, journalEntryId: draft.id, expectedVersion: 1, lines: lines(200) })
);
assert.equal(
  s
    .prepare('SELECT debit_amount FROM accounting_journal_lines WHERE journal_entry_id=? AND line_number=1')
    .get(draft.id).debit_amount,
  100
);
assert.equal(count('accounting_draft_revisions'), 0);
beforeBatch = () => s.prepare('UPDATE accounting_journal_entries SET version=3 WHERE id=?').run(draft.id);
await assert.rejects(() => deleteJournalDraft(db, { actor, journalEntryId: draft.id, expectedVersion: 2 }));
assert.equal(count('accounting_journal_lines'), 2);
const posting = {
  actor,
  journalEntryId: draft.id,
  expectedVersion: 3,
  idempotencyKey: 'post-receipt',
  requestHash: 'receipt-hash',
};
beforeBatch = () => s.prepare('UPDATE accounting_journal_entries SET version=4 WHERE id=?').run(draft.id);
await assert.rejects(() => postJournalEntry(db, posting));
assert.equal(count('accounting_posting_idempotency'), 0);
assert.equal(s.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(draft.id).status, 'draft');
await postJournalEntry(db, { ...posting, expectedVersion: 4 });
const other = await createJournalDraft(db, input);
await assert.rejects(
  () => postJournalEntry(db, { ...posting, journalEntryId: other.id, expectedVersion: 1 }),
  /different input/
);
console.log('PASS - concurrent edits, deletes and posting preserve winning data; idempotency is bound to the journal');
beforeBatch = () => s.prepare("UPDATE accounting_periods SET status='locked' WHERE id='period_2026_7'").run();
await assert.rejects(() =>
  postJournalEntry(db, {
    ...posting,
    journalEntryId: other.id,
    expectedVersion: 1,
    idempotencyKey: 'closed-during-post',
  })
);
assert.equal(s.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(other.id).status, 'draft');
assert.equal(
  s.prepare("SELECT count(*) n FROM accounting_posting_idempotency WHERE idempotency_key='closed-during-post'").get().n,
  0
);
s.prepare("UPDATE accounting_periods SET status='open' WHERE id='period_2026_7'").run();
console.log('PASS - a period closed after validation aborts posting and leaves no completion receipt');

const bank = await createBankAccount(db, {
  actor,
  entitlementTier: 'parish',
  input: {
    name: 'Checking',
    ledgerAccountId: 'acct_1010',
    accountType: 'checking',
    maskedLast4: '1234',
  },
});
const vendor = await createVendor(db, { actor, entitlementTier: 'parish', input: { displayName: 'Utility' } });
const billInput = {
  vendorId: vendor.id,
  billDate: '2026-07-20',
  lines: [{ description: 'Service', accountId: 'acct_5830', fundId: 'fund_general', unitAmount: 100 }],
};
for (const overrides of [
  { billDate: '2026-02-30' },
  { dueDate: '2026-02-30' },
  { lines: [{ ...billInput.lines[0], quantity: 0 }] },
  { lines: [{ ...billInput.lines[0], unitAmount: Number.MAX_SAFE_INTEGER, quantity: 2 }] },
])
  await assert.rejects(() =>
    createBillDraft(db, { actor, entitlementTier: 'parish', input: { ...billInput, ...overrides } })
  );
failSql = 'INSERT INTO accounting_bill_lines';
await assert.rejects(() => createBillDraft(db, { actor, entitlementTier: 'parish', input: billInput }), /Injected/);
assert.equal(count('accounting_bills'), 0);
const bill = await createBillDraft(db, { actor, entitlementTier: 'parish', input: billInput });
s.prepare("UPDATE accounting_bills SET status='approved' WHERE id=?").run(bill.id);
const billPost = { actor, entitlementTier: 'parish', billId: bill.id, expectedVersion: 1, idempotencyKey: 'bill-post' };
failSql = "UPDATE accounting_bills SET status='posted'";
await assert.rejects(() => postBill(db, billPost), /Injected/);
assert.equal(s.prepare('SELECT status FROM accounting_bills WHERE id=?').get(bill.id).status, 'approved');
assert.equal(
  s
    .prepare("SELECT status FROM accounting_journal_entries WHERE source_type='accounts_payable_bill' AND source_id=?")
    .get(bill.id).status,
  'draft'
);
await postBill(db, billPost);
const paymentInput = {
  vendorId: vendor.id,
  bankAccountId: bank.id,
  paymentDate: '2026-07-20',
  paymentMethod: 'ach',
  referenceNumber: 'ACH-1',
  applications: [{ billId: bill.id, amountApplied: 100 }],
};
await assert.rejects(
  () =>
    createPayment(db, {
      actor,
      entitlementTier: 'parish',
      input: { ...paymentInput, applications: [...paymentInput.applications, ...paymentInput.applications] },
    }),
  /only once/
);
failSql = 'INSERT INTO accounting_payment_applications';
await assert.rejects(() => createPayment(db, { actor, entitlementTier: 'parish', input: paymentInput }), /Injected/);
assert.equal(count('accounting_payments'), 0);
const payment = await createPayment(db, { actor, entitlementTier: 'parish', input: paymentInput });
const paymentPost = {
  actor,
  entitlementTier: 'parish',
  paymentId: payment.id,
  expectedVersion: 1,
  idempotencyKey: 'payment-post',
};
failSql = "UPDATE accounting_payments SET status='posted'";
await assert.rejects(() => postPayment(db, paymentPost), /Injected/);
assert.equal(s.prepare('SELECT amount_due FROM accounting_bills WHERE id=?').get(bill.id).amount_due, 100);
assert.equal(s.prepare('SELECT status FROM accounting_payments WHERE id=?').get(payment.id).status, 'approved');
assert.equal(
  s
    .prepare(
      "SELECT status FROM accounting_journal_entries WHERE source_type='accounts_payable_payment' AND source_id=?"
    )
    .get(payment.id).status,
  'draft'
);
await postPayment(db, paymentPost);
assert.equal(s.prepare('SELECT amount_due FROM accounting_bills WHERE id=?').get(bill.id).amount_due, 0);
assert.equal(s.prepare('SELECT status FROM accounting_payments WHERE id=?').get(payment.id).status, 'posted');
console.log('PASS - bill/payment creation and posting roll back together on failure and reuse drafts on retry');
s.prepare("UPDATE accounting_periods SET status='open'").run();
const voidInput = {
  actor,
  entitlementTier: 'parish',
  paymentId: payment.id,
  expectedVersion: 2,
  reason: 'Duplicate payment',
};
failSql = "status='voided',voided_at";
await assert.rejects(() => voidPayment(db, voidInput), /Injected/);
assert.equal(s.prepare('SELECT amount_due FROM accounting_bills WHERE id=?').get(bill.id).amount_due, 0);
assert.equal(s.prepare('SELECT status FROM accounting_payments WHERE id=?').get(payment.id).status, 'posted');
const originalPaymentJournal = s
  .prepare('SELECT posted_journal_entry_id id FROM accounting_payments WHERE id=?')
  .get(payment.id).id;
assert.equal(
  s.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(originalPaymentJournal).status,
  'posted'
);
assert.equal(
  s
    .prepare("SELECT count(*) n FROM accounting_entry_links WHERE source_id=? AND relationship_type='reversal'")
    .get(originalPaymentJournal).n,
  0
);
await voidPayment(db, voidInput);
assert.equal(s.prepare('SELECT amount_due FROM accounting_bills WHERE id=?').get(bill.id).amount_due, 100);
assert.equal(s.prepare('SELECT status FROM accounting_payments WHERE id=?').get(payment.id).status, 'voided');
assert.equal(
  s.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(originalPaymentJournal).status,
  'reversed'
);
assert.equal(
  s
    .prepare("SELECT count(*) n FROM accounting_journal_entries WHERE source_type='reversal' AND source_id=?")
    .get(originalPaymentJournal).n,
  1
);
console.log(
  'PASS - interrupted payment void rolls back the reversal, bill balance and payment status; retry completes once'
);
s.close();
