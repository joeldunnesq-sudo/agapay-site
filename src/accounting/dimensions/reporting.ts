import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
import { dimensionAccess, dimensionDates, dimensionRefs } from './service.js';
import { ValidationError } from '../errors.js';
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
interface Split {
  departmentId?: string | null;
  projectId?: string | null;
  basisPoints: number;
}
interface BudgetRow {
  id: string;
  version: number;
  status: string;
  start_date: string;
  end_date: string;
}
function budgetAccess(actor: LedgerServiceActor, tier: string, manage = false) {
  dimensionAccess(actor, manage ? 'budgets.manage' : 'budgets.view');
  if (!['parish', 'advanced_operations'].includes(tier)) throw new ValidationError('Parish+ accounting is required.');
}
export async function dimensionBudget(db: PortabilityDatabase, actor: LedgerServiceActor, tier: string, id: string) {
  budgetAccess(actor, tier);
  const budget = await db
    .prepare(
      'SELECT b.*,f.start_date,f.end_date FROM accounting_budgets b JOIN accounting_fiscal_years f ON f.id=b.fiscal_year_id WHERE b.id=?'
    )
    .bind(id)
    .first<BudgetRow>();
  if (!budget) throw new ValidationError('Budget was not found.');
  const lines =
    (
      await db
        .prepare(
          `SELECT l.*,a.name accountName,a.account_number accountNumber,t.category,f.name fundName FROM accounting_budget_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id WHERE budget_id=? ORDER BY a.account_number`
        )
        .bind(id)
        .all<Record<string, string | number>>()
    ).results || [];
  const allocations =
    (
      await db
        .prepare(
          'SELECT x.* FROM accounting_budget_dimension_allocations x JOIN accounting_budget_lines l ON l.id=x.budget_line_id WHERE l.budget_id=? ORDER BY x.sort_order,x.id'
        )
        .bind(id)
        .all<{
          budget_line_id: string;
          department_id: string | null;
          project_id: string | null;
          basis_points: number;
        }>()
    ).results || [];
  return { budget, lines, allocations };
}
export async function allocateDimensionBudget(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  tier: string,
  budgetId: string,
  lineId: string,
  input: { expectedVersion: number; allocations: Split[] }
) {
  budgetAccess(actor, tier, true);
  const current = await dimensionBudget(db, actor, tier, budgetId);
  if (
    current.budget.status !== 'draft' ||
    current.budget.version !== input.expectedVersion ||
    !current.lines.some((l) => l.id === lineId)
  )
    throw new ValidationError('Choose a line in the current draft budget.');
  if (!Array.isArray(input.allocations) || input.allocations.length > 100)
    throw new ValidationError('Use at most 100 allocations per line.');
  let total = 0;
  const values = [];
  const seen = new Set();
  for (const value of input.allocations) {
    const refs = await dimensionRefs(db, value.departmentId, value.projectId);
    if (!refs.departmentId && !refs.projectId) throw new ValidationError('Choose a department or project.');
    if (!Number.isInteger(value.basisPoints) || value.basisPoints < 1)
      throw new ValidationError('Enter a positive percentage with at most two decimal places.');
    total += value.basisPoints;
    const key = JSON.stringify(refs);
    if (seen.has(key)) throw new ValidationError('Combine duplicate allocations.');
    seen.add(key);
    values.push({ ...refs, basisPoints: value.basisPoints });
  }
  if (total > 10000) throw new ValidationError('Allocations cannot exceed 100%. The remainder stays Unassigned.');
  await db.batch([
    db
      .prepare(
        "UPDATE accounting_budgets SET version=CASE WHEN version=? AND status='draft' THEN version+1 ELSE NULL END WHERE id=?"
      )
      .bind(input.expectedVersion, budgetId),
    db.prepare('DELETE FROM accounting_budget_dimension_allocations WHERE budget_line_id=?').bind(lineId),
    ...values.map((v, i) =>
      db
        .prepare(
          'INSERT INTO accounting_budget_dimension_allocations(id,budget_line_id,department_id,project_id,basis_points,sort_order) VALUES(?,?,?,?,?,?)'
        )
        .bind(crypto.randomUUID(), lineId, v.departmentId, v.projectId, v.basisPoints, i)
    ),
    db
      .prepare(
        'INSERT INTO accounting_dimension_audit(id,entity_type,entity_id,action,actor_id,detail) VALUES(?,?,?,?,?,?)'
      )
      .bind(crypto.randomUUID(), 'budget_line', lineId, 'allocated', actor.id, JSON.stringify(values)),
  ]);
  return dimensionBudget(db, actor, tier, budgetId);
}
export async function dimensionReport(
  db: PortabilityDatabase,
  actor: LedgerServiceActor,
  tier: string,
  input: { from: string; to: string; budgetId?: string; fundId?: string; groupBy?: string }
) {
  dimensionAccess(actor);
  dimensionDates(input.from, input.to);
  const groupBy = input.groupBy || 'department';
  if (!['department', 'project', 'both'].includes(groupBy))
    throw new ValidationError('Choose department, project or both.');
  const labels =
      (await db.prepare('SELECT id,name FROM accounting_dimensions').all<{ id: string; name: string }>()).results || [],
    names = new Map(labels.map((v) => [v.id, v.name]));
  interface Row {
    accountId: string;
    account: string;
    fundId: string;
    fund: string;
    category: string;
    departmentId: string | null;
    projectId: string | null;
    department: string;
    project: string;
    budget: number;
    actual: number;
    variance: number;
    favorable: boolean;
  }
  const groups = new Map<string, Row>();
  function row(
    accountId: string,
    account: string,
    fundId: string,
    fund: string,
    category: string,
    departmentId: string | null,
    projectId: string | null
  ) {
    const dept = groupBy === 'project' ? null : departmentId,
      project = groupBy === 'department' ? null : projectId,
      key = JSON.stringify([accountId, fundId, dept, project]);
    if (!groups.has(key))
      groups.set(key, {
        accountId,
        account,
        fundId,
        fund,
        category,
        departmentId: dept,
        projectId: project,
        department: dept ? names.get(dept) || 'Archived department' : 'Unassigned',
        project: project ? names.get(project) || 'Archived project' : 'Unassigned',
        budget: 0,
        actual: 0,
        variance: 0,
        favorable: true,
      });
    return groups.get(key)!;
  }
  const actual =
    (
      await db
        .prepare(
          `SELECT a.id accountId,a.account_number||' · '||a.name account,l.fund_id fundId,f.name fund,t.category,CASE WHEN d.line_id IS NOT NULL THEN d.department_id ELSE rd.department_id END departmentId,CASE WHEN d.line_id IS NOT NULL THEN d.project_id ELSE rd.project_id END projectId,SUM(CASE WHEN t.category='revenue' THEN l.credit_amount-l.debit_amount ELSE l.debit_amount-l.credit_amount END) actual FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id LEFT JOIN accounting_journal_line_dimensions d ON d.line_id=l.id LEFT JOIN accounting_journal_lines original_line ON e.source_type='reversal' AND original_line.journal_entry_id=e.source_id AND original_line.line_number=l.line_number LEFT JOIN accounting_journal_line_dimensions rd ON rd.line_id=original_line.id WHERE e.status IN ('posted','reversed') AND e.posting_date BETWEEN ? AND ? AND t.category IN ('revenue','expense') AND (?='' OR l.fund_id=?) GROUP BY a.id,l.fund_id,departmentId,projectId`
        )
        .bind(input.from, input.to, input.fundId || '', input.fundId || '')
        .all<Row>()
    ).results || [];
  for (const a of actual)
    row(a.accountId, a.account, a.fundId, a.fund, a.category, a.departmentId, a.projectId).actual += Number(a.actual);
  if (input.budgetId) {
    const plan = await dimensionBudget(db, actor, tier, input.budgetId);
    const start = new Date(plan.budget.start_date + 'T00:00:00Z'),
      end = new Date(input.to + 'T00:00:00Z'),
      count = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    if (
      input.from !== plan.budget.start_date ||
      input.to > plan.budget.end_date ||
      count < 1 ||
      count > 12 ||
      new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) !== input.to
    )
      throw new ValidationError('Budget comparisons use fiscal year start through a month-end in that fiscal year.');
    for (const l of plan.lines) {
      if (input.fundId && l.fund_id !== input.fundId) continue;
      const amount = months.slice(0, count).reduce((sum, m) => sum + Number(l[m + '_amount']), 0);
      const splits = plan.allocations.filter((v) => v.budget_line_id === l.id);
      let cumulative = 0,
        previous = 0;
      for (const split of [
        ...splits,
        { department_id: null, project_id: null, basis_points: 10000 - splits.reduce((s, v) => s + v.basis_points, 0) },
      ]) {
        cumulative += split.basis_points;
        const target = Number((BigInt(amount) * BigInt(cumulative)) / 10000n),
          share = target - previous;
        previous = target;
        if (share)
          row(
            String(l.account_id),
            String(l.accountNumber) + ' · ' + String(l.accountName),
            String(l.fund_id),
            String(l.fundName),
            String(l.category),
            split.department_id,
            split.project_id
          ).budget += share;
      }
    }
  }
  const rows = [...groups.values()]
    .map((r) => ({
      ...r,
      variance: r.actual - r.budget,
      favorable: r.category === 'revenue' ? r.actual >= r.budget : r.actual <= r.budget,
    }))
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) ||
        a.project.localeCompare(b.project) ||
        a.account.localeCompare(b.account)
    );
  const totals = {
    incomeBudget: 0,
    incomeActual: 0,
    expenseBudget: 0,
    expenseActual: 0,
    surplusBudget: 0,
    surplusActual: 0,
  };
  for (const r of rows) {
    if (r.category === 'revenue') {
      totals.incomeBudget += r.budget;
      totals.incomeActual += r.actual;
    } else {
      totals.expenseBudget += r.budget;
      totals.expenseActual += r.actual;
    }
  }
  totals.surplusBudget = totals.incomeBudget - totals.expenseBudget;
  totals.surplusActual = totals.incomeActual - totals.expenseActual;
  for (const r of rows)
    if (![r.actual, r.budget, r.variance].every(Number.isSafeInteger))
      throw new ValidationError('Report amount exceeds the supported exact-cent range.');
  return {
    from: input.from,
    to: input.to,
    groupBy,
    budgetId: input.budgetId || null,
    rows,
    totals,
    notes: [
      'Unassigned activity and unallocated budget shares remain visible.',
      'Department/project classifications are reporting labels; corrections are audited and do not change posted ledger amounts.',
    ],
  };
}
