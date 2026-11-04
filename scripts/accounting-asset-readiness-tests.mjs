import assert from 'node:assert/strict';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import { setupAssetAccounts } from '../src/accounting/assets/setup.js';
import { registerAsset, assetRegister, assetDetail, getAsset } from '../src/accounting/assets/service.js';
import { previewAssetOperation, postAssetOperation } from '../src/accounting/assets/posting.js';
import {
  previewAssetCorrection,
  correctAssetPosting,
  cancelAssetRegistration,
} from '../src/accounting/assets/corrections.js';
import { depreciationSchedule } from '../src/accounting/assets/schedule.js';
import { statementOfCashFlows, reverseJournalEntry } from '../src/accounting/index.js';
const { db, sqlite, actor, journal } = await accountingNativeFixture();
const accounts = await setupAssetAccounts(db, actor, {
  operationKey: 'history-accounts',
  fundId: 'fund_general',
  costNumber: '1500',
  costName: 'Equipment',
  accumulatedNumber: '1590',
  accumulatedName: 'Accumulated depreciation',
  expenseNumber: '5900',
  expenseName: 'Depreciation',
});
const source = await journal(
  '2026-01-01',
  [
    { accountId: accounts.costAccountId, debitAmount: 1000000, creditAmount: 0 },
    { accountId: accounts.accumulatedAccountId, debitAmount: 0, creditAmount: 600000 },
    { accountId: 'acct_3990', debitAmount: 0, creditAmount: 400000 },
  ],
  { sourceType: 'opening_balance' }
);
const debit = sqlite
  .prepare('SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id=?')
  .get(source.id, accounts.costAccountId).id;
const credit = sqlite
  .prepare('SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id=?')
  .get(source.id, accounts.accumulatedAccountId).id;
const input = {
  operationKey: 'historical-asset',
  tag: 'HIST-001',
  name: 'Legacy equipment',
  acquisitionLineId: debit,
  inServiceDate: '2018-01-01',
  cost: 1000000,
  salvage: 100000,
  lifeMonths: 24,
  method: 'straight_line',
  accumulatedAccountId: accounts.accumulatedAccountId,
  expenseAccountId: accounts.expenseAccountId,
  opening: { originalAcquisitionDate: '2017-12-01', throughDate: '2025-12-31', amount: 600000, creditLineId: credit },
};
const before = sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
const asset = await registerAsset(db, actor, input);
assert.equal(
  sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n,
  before,
  'Historical registration never books opening cost or depreciation twice'
);
assert.equal((await assetRegister(db, actor, '2025-12-31')).rows.length, 0);
assert.equal((await assetRegister(db, actor, '2026-01-01')).totals.netBookValue, 400000);
assert.equal((await assetRegister(db, actor, '2026-01-01')).reconciliation.balanced, true);
const schedule = depreciationSchedule(asset);
assert.equal(schedule[0].throughDate, '2026-01-31');
assert.equal(schedule[0].amount, 12500);
assert.equal(schedule.at(-1).netBookValue, 100000);
assert.equal(
  schedule.reduce((s, r) => s + r.amount, 0),
  300000
);
await assert.rejects(
  () =>
    registerAsset(db, actor, {
      ...input,
      operationKey: 'bad-fund',
      tag: 'BAD',
      opening: { ...input.opening, creditLineId: debit },
    }),
  /posted credit/
);
const dep = { expectedVersion: 1, throughDate: '2026-01-31', operationKey: 'jan-historical' };
assert.equal((await previewAssetOperation(db, actor, asset.id, 'depreciation', dep)).depreciation, 12500);
await postAssetOperation(db, actor, asset.id, 'depreciation', dep);
assert.equal((await assetRegister(db, actor, '2026-01-31')).totals.accumulated, 612500);
assert.equal((await assetRegister(db, actor, '2026-01-31')).reconciliation.balanced, true);
await assert.rejects(
  () =>
    cancelAssetRegistration(db, actor, asset.id, {
      expectedVersion: 2,
      entryDate: '2026-02-01',
      reason: 'Wrong estimate',
      operationKey: 'no-cancel',
    }),
  /Reverse/
);
const movement = (await assetDetail(db, actor, asset.id)).movements[0];
const correction = {
  expectedVersion: 2,
  movementId: movement.id,
  entryDate: '2026-02-01',
  reason: 'Correct an imported remaining-life estimate',
  operationKey: 'reverse-jan',
};
const preview = await previewAssetCorrection(db, actor, asset.id, correction);
assert.equal(preview.depreciationReversed, 12500);
await assert.rejects(() =>
  correctAssetPosting(db, { id: 'viewer', capabilities: ['accounting.view'] }, asset.id, correction)
);
sqlite.exec(
  "CREATE TRIGGER correction_fault BEFORE INSERT ON accounting_asset_reversals BEGIN SELECT RAISE(ABORT,'injected correction failure'); END"
);
await assert.rejects(() => correctAssetPosting(db, actor, asset.id, correction), /injected/);
assert.equal(
  sqlite.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(movement.journal_id).status,
  'posted'
);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_asset_correction_guards').get().n, 0);
sqlite.exec('DROP TRIGGER correction_fault');
const corrected = await correctAssetPosting(db, actor, asset.id, correction);
assert.equal((await correctAssetPosting(db, actor, asset.id, correction)).journalId, corrected.journalId);
assert.equal(
  (await assetRegister(db, actor, '2026-01-31')).totals.accumulated,
  612500,
  'Historical statement preserves original posting before correction date'
);
assert.equal((await assetRegister(db, actor, '2026-02-01')).totals.accumulated, 600000);
assert.equal((await assetRegister(db, actor, '2026-02-01')).reconciliation.balanced, true);
assert.equal(
  (await statementOfCashFlows(db, { actor, startDate: '2026-02-01', endDate: '2026-02-28' })).totals.difference,
  0
);
await assert.rejects(
  () =>
    reverseJournalEntry(db, {
      actor,
      journalEntryId: corrected.journalId,
      entryDate: '2026-02-02',
      reason: 'Cannot bypass asset controls',
      idempotencyKey: 'no-bypass',
      requestHash: 'no-bypass',
    }),
  /asset/
);
const cancellation = {
  expectedVersion: 3,
  entryDate: '2026-02-01',
  reason: 'Replace the mistaken registration',
  operationKey: 'cancel-history',
};
await cancelAssetRegistration(db, actor, asset.id, cancellation);
await cancelAssetRegistration(db, actor, asset.id, cancellation);
assert.equal((await getAsset(db, actor, asset.id)).status, 'cancelled');
assert.equal((await assetRegister(db, actor, '2026-01-31')).rows.length, 1);
assert.equal((await assetRegister(db, actor, '2026-02-01')).rows.length, 0);
const replacement = await registerAsset(db, actor, {
  ...input,
  operationKey: 'replacement',
  tag: 'HIST-002',
  lifeMonths: 36,
  opening: { ...input.opening, throughDate: '2026-01-31' },
});
assert.equal(replacement.ledger_start_date, '2026-02-01');
assert.equal(
  (await assetRegister(db, actor, '2026-01-31')).rows.length,
  1,
  'Replacement does not double count earlier periods'
);
assert.equal((await assetRegister(db, actor, '2026-02-01')).rows.length, 1);
assert.equal((await assetRegister(db, actor, '2026-02-01')).reconciliation.balanced, true);
const dispose = {
  expectedVersion: 1,
  throughDate: '2026-02-28',
  operationKey: 'historical-sale',
  proceeds: 500000,
  cashAccountId: 'acct_1010',
  gainAccountId: 'acct_4000',
  lossAccountId: accounts.expenseAccountId,
};
await postAssetOperation(db, actor, replacement.id, 'disposal', dispose);
let cash = await statementOfCashFlows(db, { actor, startDate: '2026-02-01', endDate: '2026-02-28' });
assert.equal(cash.totals.difference, 0);
assert.equal(cash.totals.investingCashFlow, 500000);
const sale = (await assetDetail(db, actor, replacement.id)).movements[0];
await correctAssetPosting(db, actor, replacement.id, {
  expectedVersion: 2,
  movementId: sale.id,
  entryDate: '2026-03-01',
  reason: 'Correct sale proceeds',
  operationKey: 'reverse-sale',
});
assert.equal((await assetRegister(db, actor, '2026-02-28')).rows[0].status, 'disposed');
assert.equal((await assetRegister(db, actor, '2026-03-01')).rows[0].status, 'active');
cash = await statementOfCashFlows(db, { actor, startDate: '2026-02-01', endDate: '2026-02-28' });
assert.equal(cash.totals.investingCashFlow, 500000);
assert.equal(cash.totals.difference, 0);
cash = await statementOfCashFlows(db, { actor, startDate: '2026-03-01', endDate: '2026-03-31' });
assert.equal(cash.totals.investingCashFlow, -500000);
assert.equal(cash.totals.difference, 0);
await postAssetOperation(db, actor, replacement.id, 'disposal', {
  ...dispose,
  expectedVersion: 3,
  throughDate: '2026-03-01',
  operationKey: 'corrected-sale',
  proceeds: 450000,
});
assert.equal((await assetRegister(db, actor, '2026-03-01')).reconciliation.balanced, true);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM accounting_asset_correction_guards').get().n, 0);
assert.throws(() => sqlite.prepare('UPDATE accounting_asset_reversals SET reason=?').run('edited'), /append-only/);
assert.throws(() => sqlite.prepare('DELETE FROM accounting_asset_cancellations').run(), /append-only/);
console.log(
  'PASS historical opening allocations, remaining-life schedules, atomic corrections, cancellation/replacement dates, source protection, disposal corrections and historical cash-flow reconciliation'
);
sqlite.close();
