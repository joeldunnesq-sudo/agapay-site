import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  initializeLedger,
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
  statementOfCashFlows,
} from '../src/accounting/index.js';
import { registerAsset, assetRegister, assetDetail, updateAssetMetadata } from '../src/accounting/assets/service.js';
import { previewAssetOperation, postAssetOperation } from '../src/accounting/assets/posting.js';
import { depreciationSchedule } from '../src/accounting/assets/schedule.js';
import { setupAssetAccounts } from '../src/accounting/assets/setup.js';
import { captureDatabase } from '../src/recovery/storage.js';
import { planDatabase, applyDatabase, validateLedger } from '../src/recovery/database.js';
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('accounting-migrations/0001_accounting_database_foundation.sql'));
  sqlite.exec(read('accounting-migrations/0002_core_ledger.sql'));
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
      const result = sqlite.prepare(sql).run(...this.params);
      return { success: true, meta: { changes: result.changes } };
    },
  });
  return {
    sqlite,
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
}

const db = database();
const actor = {
  id: 'asset_treasurer',
  capabilities: [
    'accounting.configure',
    'accounting.view',
    'accounting.journals.create',
    'accounting.journals.post',
    'accounting.journals.reverse',
  ],
};
await initializeLedger(db, { actor, date: new Date('2026-01-01T12:00:00Z') });
for (const name of [
  '0003_phase2a_setup_configuration.sql',
  '0004_phase2b_manual_ledger.sql',
  '0016_expense_account_groups.sql',
  '0027_fixed_assets.sql',
  '0028_asset_opening_corrections.sql',
])
  db.sqlite.exec(read('accounting-migrations/' + name));
for (const [id, number, name, type, balance, classification] of [
  ['equipment', '1500', 'Equipment', 'type_asset', 'debit', 'investing'],
  ['accum', '1590', 'Accumulated depreciation', 'type_asset', 'credit', 'operating'],
  ['depreciation', '5900', 'Depreciation expense', 'type_expense', 'debit', 'operating'],
])
  db.sqlite
    .prepare(
      `INSERT INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance,is_posting_account,requires_fund,cash_flow_classification) VALUES(?,?,?,?,?,1,1,?)`
    )
    .run(id, number, name, type, balance, classification);
db.sqlite.exec(
  "UPDATE accounting_accounts SET cash_flow_classification='operating' WHERE cash_flow_classification IS NULL"
);
async function journal(date, lines) {
  const draft = await createJournalDraft(db, { actor, entryDate: date, description: 'Equipment acquisition', lines });
  return postJournalEntry(db, {
    actor,
    journalEntryId: draft.id,
    idempotencyKey: crypto.randomUUID(),
    requestHash: 'fixture',
    expectedVersion: draft.version,
  });
}
const acquisition = await journal('2026-01-10', [
  { accountId: 'equipment', fundId: 'fund_general', debitAmount: 10001, creditAmount: 0 },
  { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: 0, creditAmount: 10001 },
]);
const source = db.sqlite
  .prepare("SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id='equipment'")
  .get(acquisition.id).id;
const input = {
  operationKey: 'asset-register-one',
  tag: 'EQ-001',
  name: 'Parish equipment',
  acquisitionLineId: source,
  inServiceDate: '2026-01-10',
  cost: 10001,
  salvage: 1001,
  lifeMonths: 12,
  method: 'straight_line',
  accumulatedAccountId: 'accum',
  expenseAccountId: 'depreciation',
  location: 'Parish hall',
  insuranceValue: 12000,
};
const asset = await registerAsset(db, actor, input);
assert.equal((await registerAsset(db, actor, input)).id, asset.id);
await assert.rejects(() => registerAsset(db, actor, { ...input, cost: 9999 }), /different/);
await assert.rejects(
  () => registerAsset(db, actor, { ...input, operationKey: 'overallocated', tag: 'EQ-002', cost: 1, salvage: 0 }),
  /available/
);
await assert.rejects(() => registerAsset(db, { id: 'viewer', capabilities: ['accounting.view'] }, input));
const schedule = depreciationSchedule(asset);
assert.equal(schedule.length, 12);
assert.equal(
  schedule.reduce((s, r) => s + r.amount, 0),
  9000
);
assert.equal(schedule.at(-1).netBookValue, 1001);
const uneven = depreciationSchedule({ ...asset, cost: 100, salvage: 1, life_months: 7 });
assert.equal(
  uneven.reduce((sum, row) => sum + row.amount, 0),
  99
);
assert.equal(uneven.at(-1).netBookValue, 1);
assert.equal(depreciationSchedule({ ...asset, method: 'none' }).length, 0);
assert.equal((await assetRegister(db, actor, '2026-01-09')).rows.length, 0);
const jan = { expectedVersion: 1, throughDate: '2026-01-31', operationKey: 'jan-dep' };
const before = db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
assert.equal((await previewAssetOperation(db, actor, asset.id, 'depreciation', jan)).depreciation, 750);
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, before);
const dep = await postAssetOperation(db, actor, asset.id, 'depreciation', jan);
assert.equal((await postAssetOperation(db, actor, asset.id, 'depreciation', jan)).journalId, dep.journalId);
assert.equal((await assetRegister(db, actor, '2026-01-31')).totals.netBookValue, 9251);
assert.equal((await assetRegister(db, actor, '2026-01-31')).reconciliation.balanced, true);
await assert.rejects(
  () =>
    postAssetOperation(db, actor, asset.id, 'depreciation', {
      ...jan,
      operationKey: 'stale',
      throughDate: '2026-02-28',
    }),
  /changed/
);
let cash = await statementOfCashFlows(db, { actor, startDate: '2026-01-01', endDate: '2026-01-31' });
assert.equal(cash.totals.difference, 0);
assert.equal(cash.totals.investingCashFlow, -10001);
assert.equal(cash.totals.operatingAdjustments, 750);
db.sqlite.exec("UPDATE accounting_periods SET status='open' WHERE start_date='2026-02-01'");
const disposal = {
  expectedVersion: 2,
  throughDate: '2026-02-15',
  operationKey: 'disposal-one',
  proceeds: 9000,
  cashAccountId: 'acct_1010',
  gainAccountId: 'acct_4000',
  lossAccountId: 'depreciation',
};
const preview = await previewAssetOperation(db, actor, asset.id, 'disposal', disposal);
assert.equal(preview.depreciation, 750);
assert.equal(preview.gainLoss, 499);
assert.equal(
  preview.lines.reduce((s, l) => s + l.debitAmount - l.creditAmount, 0),
  0
);
const disposed = await postAssetOperation(db, actor, asset.id, 'disposal', disposal);
assert.equal((await postAssetOperation(db, actor, asset.id, 'disposal', disposal)).journalId, disposed.journalId);
assert.equal((await assetRegister(db, actor, '2026-01-31')).rows[0].status, 'active');
assert.equal((await assetRegister(db, actor, '2026-02-15')).totals.netBookValue, 0);
assert.equal((await assetRegister(db, actor, '2026-02-15')).reconciliation.balanced, true);
cash = await statementOfCashFlows(db, { actor, startDate: '2026-02-01', endDate: '2026-02-28' });
assert.equal(cash.totals.difference, 0);
assert.equal(cash.totals.investingCashFlow, 9000);
assert.equal(cash.totals.changeInNetAssets + cash.totals.operatingAdjustments, 0);
await assert.rejects(
  () =>
    reverseJournalEntry(db, {
      actor,
      journalEntryId: disposed.journalId,
      entryDate: '2026-02-20',
      reason: 'Cannot bypass assets',
      idempotencyKey: 'bad-reversal',
      requestHash: 'bad',
    }),
  /asset/
);
assert.equal(
  db.sqlite.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(disposed.journalId).status,
  'posted'
);
assert.throws(() => db.sqlite.prepare('UPDATE accounting_asset_movements SET proceeds=1').run(), /append-only/);
assert.throws(() => db.sqlite.prepare('UPDATE accounting_fixed_assets SET cost=5').run(), /immutable/);
const detail = await assetDetail(db, actor, asset.id);
assert.equal(detail.source.journal_entry_id, acquisition.id);
assert.equal(detail.audit.length, 3);
await updateAssetMetadata(db, actor, asset.id, {
  expectedVersion: 3,
  location: 'Storage',
  serialNumber: 'SN-1',
  insuranceValue: 12000,
  notes: 'Insurance schedule',
});
await assert.rejects(
  () =>
    updateAssetMetadata(db, actor, asset.id, {
      expectedVersion: 3,
      location: 'stale',
      serialNumber: '',
      insuranceValue: 0,
      notes: '',
    }),
  /changed/
);
console.log(
  'PASS asset registration, allocations, permissions, exact-cent schedule, preview, replay, stale protection, disposal gain and cash-flow classification, immutable audit, documents and as-of reports'
);

const snapshot = await captureDatabase(db, 'books', 'synthetic-assets');
assert.ok(snapshot.tables.some((t) => t.name === 'accounting_fixed_assets'));
assert.ok(snapshot.tables.some((t) => t.name === 'accounting_asset_movements'));
assert.ok(snapshot.tables.some((t) => t.name === 'accounting_asset_audit'));
validateLedger(snapshot);
const original = await assetDetail(db, actor, asset.id);
await updateAssetMetadata(db, actor, asset.id, {
  expectedVersion: 4,
  location: 'Changed after backup',
  serialNumber: 'SN-2',
  insuranceValue: 555,
  notes: 'Restore drill',
});
const plan = await planDatabase(db, 'books', 'synthetic-assets', snapshot);
await applyDatabase(db, 'books', { parish_id: 'synthetic-assets' }, snapshot, plan);
const restored = await assetDetail(db, actor, asset.id);
assert.deepEqual(restored, original);
assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.sqlite.prepare('PRAGMA quick_check').get().quick_check, 'ok');
assert.throws(() => db.sqlite.prepare('DELETE FROM accounting_asset_movements').run(), /append-only/);
assert.throws(() => db.sqlite.prepare('UPDATE accounting_fixed_assets SET cost=3').run(), /immutable/);
console.log(
  'PASS actual recovery capture, plan and atomic apply round trip restores assets, movements, audit and original protective triggers'
);

// Fault injection after ledger preparation must roll back both posted status and asset state.
const nextAcquisition = await journal('2026-01-11', [
  { accountId: 'equipment', fundId: 'fund_general', debitAmount: 12000, creditAmount: 0 },
  { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: 0, creditAmount: 12000 },
]);
const nextLine = db.sqlite
  .prepare("SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id='equipment'")
  .get(nextAcquisition.id).id;
const second = await registerAsset(db, actor, {
  ...input,
  operationKey: 'second',
  tag: 'EQ-002',
  cost: 12000,
  salvage: 0,
  acquisitionLineId: nextLine,
  inServiceDate: '2026-01-11',
});
db.sqlite.exec(
  "CREATE TRIGGER asset_fault BEFORE INSERT ON accounting_asset_movements BEGIN SELECT RAISE(ABORT,'injected asset failure'); END"
);
await assert.rejects(
  () =>
    postAssetOperation(db, actor, second.id, 'depreciation', {
      expectedVersion: 1,
      throughDate: '2026-01-31',
      operationKey: 'fault',
    }),
  /injected/
);
assert.equal(db.sqlite.prepare('SELECT version FROM accounting_fixed_assets WHERE id=?').get(second.id).version, 1);
assert.equal(
  db.sqlite
    .prepare("SELECT COUNT(*) n FROM accounting_journal_entries WHERE source_id LIKE ? AND status='posted'")
    .get(second.id + ':%').n,
  0
);
assert.equal(
  db.sqlite.prepare("SELECT COUNT(*) n FROM accounting_posting_idempotency WHERE idempotency_key='asset:fault'").get()
    .n,
  0
);
db.sqlite.exec('DROP TRIGGER asset_fault');
await postAssetOperation(db, actor, second.id, 'depreciation', {
  expectedVersion: 1,
  throughDate: '2026-01-31',
  operationKey: 'fault',
});
await postAssetOperation(db, actor, second.id, 'depreciation', {
  expectedVersion: 2,
  throughDate: '2026-02-28',
  operationKey: 'feb-second',
});
assert.equal((await assetDetail(db, actor, second.id)).movements.length, 2);

db.sqlite.exec("UPDATE accounting_periods SET status='closed' WHERE start_date='2026-03-01'");
await assert.rejects(
  () =>
    postAssetOperation(db, actor, second.id, 'depreciation', {
      expectedVersion: 3,
      throughDate: '2026-03-31',
      operationKey: 'closed-period',
    }),
  (error) => /period|closed/i.test(error.message) || error.details?.reasonCodes?.includes('period_not_open')
);
console.log(
  'PASS injected finalization failure rolls back ledger, version and replay key; closed periods reject asset posting'
);

db.sqlite.exec("UPDATE accounting_periods SET status='open' WHERE start_date='2026-03-01'");
const retirement = {
  expectedVersion: 3,
  throughDate: '2026-03-31',
  operationKey: 'retire-second',
  proceeds: 0,
  lossAccountId: 'depreciation',
};
const retirementPreview = await previewAssetOperation(db, actor, second.id, 'disposal', retirement);
assert.equal(retirementPreview.gainLoss, -9000);
await postAssetOperation(db, actor, second.id, 'disposal', retirement);
const retirementCash = await statementOfCashFlows(db, { actor, startDate: '2026-03-01', endDate: '2026-03-31' });
assert.equal(retirementCash.totals.difference, 0);
assert.equal(retirementCash.totals.investingCashFlow, 0);
assert.equal(retirementCash.totals.actualCashChange, 0);
console.log(
  'PASS uneven-cent schedules finish at salvage; nondepreciable schedules stay empty; zero-proceeds retirement posts a loss with no fictional cash flow'
);
const financialRestorePlan = await planDatabase(db, 'books', 'synthetic-assets', snapshot);
await applyDatabase(db, 'books', { parish_id: 'synthetic-assets' }, snapshot, financialRestorePlan);
const financialRestored = await captureDatabase(db, 'books', 'synthetic-assets');
assert.deepEqual(financialRestored, snapshot);
assert.equal((await assetRegister(db, actor, '2026-02-28')).reconciliation.balanced, true);
assert.equal(
  (await statementOfCashFlows(db, { actor, startDate: '2026-01-01', endDate: '2026-02-28' })).totals.difference,
  0
);
assert.throws(() => db.sqlite.prepare('DELETE FROM accounting_asset_movements').run(), /append-only/);
console.log(
  'PASS full financial restore removes post-snapshot acquisitions and depreciation, restores exact snapshot, reconciles cash flow and reinstates asset protections'
);

const setup = {
  operationKey: 'chart-one',
  fundId: 'fund_general',
  costNumber: '1600',
  costName: 'Parish property',
  accumulatedNumber: '1690',
  accumulatedName: 'Property depreciation',
  expenseNumber: '5910',
  expenseName: 'Depreciation charge',
};
const countAccounts = () => db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_accounts').get().n;
const accountsBefore = countAccounts(),
  journalsBefore = db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n;
await assert.rejects(() => setupAssetAccounts(db, { id: 'viewer', capabilities: ['accounting.view'] }, setup));
const configured = await setupAssetAccounts(db, actor, setup);
assert.equal(countAccounts(), accountsBefore + 3);
assert.deepEqual(await setupAssetAccounts(db, actor, setup), configured);
assert.equal(countAccounts(), accountsBefore + 3);
assert.deepEqual(
  {
    ...db.sqlite
      .prepare('SELECT normal_balance,cash_flow_classification FROM accounting_accounts WHERE id=?')
      .get(configured.accumulatedAccountId),
  },
  { normal_balance: 'credit', cash_flow_classification: 'operating' }
);
await assert.rejects(() => setupAssetAccounts(db, actor, { ...setup, costName: 'Different setup' }), /different/);
await assert.rejects(
  () =>
    setupAssetAccounts(db, actor, {
      ...setup,
      operationKey: 'collision',
      costNumber: '1610',
      accumulatedNumber: '1691',
    }),
  /already in use/
);
assert.equal(countAccounts(), accountsBefore + 3);
assert.equal(
  (
    await setupAssetAccounts(db, actor, {
      ...setup,
      operationKey: 'reuse',
      costExistingId: configured.costAccountId,
      accumulatedExistingId: configured.accumulatedAccountId,
      expenseExistingId: configured.expenseAccountId,
    })
  ).costAccountId,
  configured.costAccountId
);
db.sqlite.exec(
  "CREATE TRIGGER setup_fault BEFORE INSERT ON accounting_account_presentations WHEN NEW.account_id LIKE 'assetsetup_%' BEGIN SELECT RAISE(ABORT,'injected setup failure'); END"
);
await assert.rejects(
  () =>
    setupAssetAccounts(db, actor, {
      ...setup,
      operationKey: 'setup-fault',
      costNumber: '1620',
      accumulatedNumber: '1692',
      expenseNumber: '5912',
    }),
  /injected/
);
assert.equal(countAccounts(), accountsBefore + 3);
db.sqlite.exec('DROP TRIGGER setup_fault');
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, journalsBefore);
console.log(
  'PASS treasurer asset-account setup creates correct balances/classifications, reuses existing accounts, rejects collisions, rolls back atomically and never creates journals'
);
