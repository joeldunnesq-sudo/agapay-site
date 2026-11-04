import assert from 'node:assert/strict';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import { saveDimension, classifyJournalLine, dimensionTransactions } from '../src/accounting/dimensions/service.js';
import { dimensionReport, dimensionBudget, allocateDimensionBudget } from '../src/accounting/dimensions/reporting.js';
import { createBudget, submitBudget, approveBudget, copyBudget } from '../src/accounting/budgets/service.js';
import { reverseJournalEntry } from '../src/accounting/ledger/service.js';
import { statementOfActivities } from '../src/accounting/reports/service.js';
import {
  saveReportPackage,
  generateReportPackage,
  getReportPackageRun,
} from '../src/accounting/report-packages/service.js';
const { db, sqlite, actor, reviewer, journal } = await accountingNativeFixture();
const dept = await saveDimension(db, actor, { kind: 'department', code: 'SCHOOL', name: 'Church School' });
const project = await saveDimension(db, actor, { kind: 'project', code: 'ROOF', name: 'Roof repair' });
const income = sqlite
  .prepare(
    "SELECT a.id FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE t.category='revenue' AND a.is_posting_account=1 LIMIT 1"
  )
  .get().id;
const expense = sqlite
  .prepare(
    "SELECT a.id FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE t.category='expense' AND a.is_posting_account=1 LIMIT 1"
  )
  .get().id;
const year = sqlite.prepare('SELECT id FROM accounting_fiscal_years LIMIT 1').get().id;
const gift = await journal('2026-01-10', [
  { accountId: 'acct_1010', debitAmount: 99999, creditAmount: 0 },
  { accountId: income, debitAmount: 0, creditAmount: 99999 },
]);
await journal('2026-01-11', [
  { accountId: expense, debitAmount: 12345, creditAmount: 0 },
  { accountId: 'acct_1010', debitAmount: 0, creditAmount: 12345 },
]);
const line = sqlite
  .prepare('SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id=?')
  .get(gift.id, income).id;
await classifyJournalLine(db, actor, line, {
  expectedVersion: 0,
  departmentId: dept.id,
  projectId: project.id,
  reason: 'Synthetic department and project allocation',
});
await assert.rejects(
  () => classifyJournalLine(db, actor, line, { expectedVersion: 0, departmentId: dept.id, reason: 'Stale edit' }),
  /changed/
);
await assert.rejects(
  () => classifyJournalLine(db, actor, line, { expectedVersion: 1, departmentId: project.id, reason: 'Wrong type' }),
  /active department/
);
const budget = await createBudget(db, {
  actor,
  entitlementTier: 'parish',
  input: {
    fiscalYearId: year,
    name: 'Synthetic readiness budget',
    lines: [
      { accountId: income, fundId: 'fund_general', annualAmount: 120001 },
      { accountId: expense, fundId: 'fund_general', annualAmount: 24001 },
    ],
  },
});
let plan = await dimensionBudget(db, actor, 'parish', budget.id);
for (const l of plan.lines) {
  plan = await allocateDimensionBudget(db, actor, 'parish', budget.id, l.id, {
    expectedVersion: plan.budget.version,
    allocations: [{ departmentId: dept.id, projectId: project.id, basisPoints: 3333 }],
  });
}
await assert.rejects(
  () =>
    allocateDimensionBudget(db, actor, 'parish', budget.id, plan.lines[0].id, {
      expectedVersion: plan.budget.version,
      allocations: [{ departmentId: dept.id, basisPoints: 10001 }],
    }),
  /100%/
);
const activity = await statementOfActivities(db, { actor, startDate: '2026-01-01', endDate: '2026-01-31' });
for (const groupBy of ['department', 'project', 'both']) {
  const report = await dimensionReport(db, actor, 'parish', {
    from: '2026-01-01',
    to: '2026-01-31',
    budgetId: budget.id,
    groupBy,
  });
  assert.equal(report.totals.incomeActual, activity.totals.revenue);
  assert.equal(report.totals.expenseActual, activity.totals.expenses);
  assert.equal(report.totals.incomeBudget, 10001);
  assert.equal(report.totals.expenseBudget, 2001);
  assert(report.rows.some((r) => r.department === 'Unassigned' && r.project === 'Unassigned'));
}
await assert.rejects(
  () => dimensionReport(db, actor, 'parish', { from: '2026-01-15', to: '2026-01-31', budgetId: budget.id }),
  /fiscal year start/
);
await assert.rejects(
  () => dimensionReport(db, actor, 'basic', { from: '2026-01-01', to: '2026-01-31', budgetId: budget.id }),
  /Parish/
);
await submitBudget(db, { actor, entitlementTier: 'parish', budgetId: budget.id, expectedVersion: plan.budget.version });
plan = await dimensionBudget(db, actor, 'parish', budget.id);
await approveBudget(db, {
  actor: reviewer,
  entitlementTier: 'parish',
  budgetId: budget.id,
  expectedVersion: plan.budget.version,
});
await assert.rejects(
  () =>
    allocateDimensionBudget(db, actor, 'parish', budget.id, plan.lines[0].id, {
      expectedVersion: plan.budget.version,
      allocations: [],
    }),
  /draft/
);
assert.throws(
  () =>
    sqlite.prepare('DELETE FROM accounting_budget_dimension_allocations WHERE budget_line_id=?').run(plan.lines[0].id),
  /immutable/
);
const preset = await saveReportPackage(db, actor, {
  name: 'Synthetic council package',
  reportIds: ['activities', 'position', 'cashFlows', 'fundActivity', 'assets', 'departments', 'projects'],
});
const input = { from: '2026-01-01', to: '2026-01-31', budgetId: budget.id, operationKey: 'synthetic-packet-jan' };
const packet = await generateReportPackage(db, actor, 'parish', preset.id, input);
assert.equal(packet.snapshot.sections.length, 7);
assert.equal(packet.snapshot.sections[0].data.totals.revenue, 99999);
assert.equal((await generateReportPackage(db, actor, 'parish', preset.id, input)).replayed, true);
await assert.rejects(
  () => generateReportPackage(db, actor, 'parish', preset.id, { ...input, to: '2026-02-28' }),
  /different dates/
);
await journal('2026-01-12', [
  { accountId: 'acct_1010', debitAmount: 100, creditAmount: 0 },
  { accountId: income, debitAmount: 0, creditAmount: 100 },
]);
assert.equal(
  (await getReportPackageRun(db, actor, packet.id)).snapshot.sections[0].data.totals.revenue,
  99999,
  'Saved council copy stays unchanged'
);
assert.throws(
  () => sqlite.prepare("UPDATE accounting_report_package_runs SET snapshot_json='{}' WHERE id=?").run(packet.id),
  /immutable/
);
await assert.rejects(
  () => getReportPackageRun(db, { id: 'viewer', capabilities: ['accounting.view'] }, packet.id),
  /capability/
);
// Mutate a real report input between calculation and the atomic snapshot insert.
const originalBatch = db.batch.bind(db);
db.batch = async (statements) => {
  if (statements.some((s) => s.params?.includes('race-packet')))
    sqlite.exec("UPDATE accounting_accounts SET version=version+1 WHERE id='acct_1010'");
  return originalBatch(statements);
};
await assert.rejects(
  () => generateReportPackage(db, actor, 'parish', preset.id, { ...input, operationKey: 'race-packet' }),
  /NOT NULL/
);
assert.equal(
  sqlite.prepare("SELECT COUNT(*) n FROM accounting_report_package_runs WHERE operation_key='race-packet'").get().n,
  0
);
assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
console.log(
  'PASS independent department/project totals, exact-cent budget shares, unassigned activity, frozen approved allocations, immutable council snapshots, permissions, idempotency and concurrent-write guard'
);

db.batch = originalBatch;
const underlying = await dimensionTransactions(db, actor, '2026-01-01', '2026-01-31', '', {
  departmentId: dept.id,
  accountId: income,
});
assert.equal(underlying.rows.length, 1);
assert.equal(underlying.rows[0].credit, 99999);
await reverseJournalEntry(db, {
  actor,
  journalEntryId: gift.id,
  entryDate: '2026-02-01',
  reason: 'Synthetic correction',
  idempotencyKey: 'dim-reversal',
  requestHash: 'dim-reversal',
});
const corrected = await dimensionReport(db, actor, 'parish', { from: '2026-01-01', to: '2026-02-28', groupBy: 'both' });
assert.equal(
  corrected.rows.find((r) => r.departmentId === dept.id && r.projectId === project.id).actual,
  0,
  'An unclassified reversal inherits the original reporting labels'
);
console.log('PASS amount drilldown filters and reversal classification inheritance');

const copied = await copyBudget(db, {
  actor,
  entitlementTier: 'parish',
  sourceBudgetId: budget.id,
  name: 'Copied dimensional budget',
});
const copiedPlan = await dimensionBudget(db, actor, 'parish', copied.id);
assert.equal(copiedPlan.allocations.length, plan.allocations.length);
assert.deepEqual(
  copiedPlan.allocations.map((x) => x.basis_points),
  plan.allocations.map((x) => x.basis_points)
);
console.log('PASS budget copies preserve independent reporting allocations');
