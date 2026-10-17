import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
interface BudgetSqlRow {
  [column: string]: string | number | null;
  id: string;
  budget_name: string;
  fiscal_year_id: string;
  version_number: number;
  status: string;
  description: string;
  revision_notes: string;
  created_by: string;
  approved_by: string;
  locked_by: string;
  created_at: string;
  submitted_at: string;
  approved_at: string;
  locked_at: string;
  version: number;
  account_id: string;
  fund_id: string;
  annual_amount: number;
  allocation_strategy: string;
  notes: string;
  start_date: string;
  end_date: string;
  account_number: string;
  account_name: string;
  category: string;
  title: string;
  maximum: number;
  debits: number;
  credits: number;
}
export interface BudgetLineInput {
  accountId?: string;
  fundId?: string;
  annualAmount?: unknown;
  allocationStrategy?: string;
  monthlyAmounts?: unknown;
  notes?: string | null;
}
export interface BudgetInput {
  fiscalYearId?: string;
  name?: string;
  description?: string;
  revisionNotes?: string;
  lines?: BudgetLineInput[];
  assumptions?: { title?: string; description?: string }[];
}
interface BudgetActorOptions {
  actor: LedgerServiceActor;
  entitlementTier: string;
}
export interface BudgetVarianceOptions extends BudgetActorOptions {
  budgetId: string;
  throughMonth?: number;
  fundId?: string | null;
}
interface BudgetVersionOptions extends BudgetActorOptions {
  budgetId: string;
  expectedVersion: number;
}
import { AccountingDatabaseError, ValidationError } from '../errors.js';
const MONTH_COLUMNS = [
  'january_amount',
  'february_amount',
  'march_amount',
  'april_amount',
  'may_amount',
  'june_amount',
  'july_amount',
  'august_amount',
  'september_amount',
  'october_amount',
  'november_amount',
  'december_amount',
];
function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
function now() {
  return new Date().toISOString();
}
function requireAccess(actor: LedgerServiceActor, capability: string, tier: string) {
  if (tier !== 'parish')
    throw new AccountingDatabaseError('Budgeting and financial planning are available with Parish Accounting.');
  if (!actor?.id || !actor.capabilities?.includes(capability))
    throw new AccountingDatabaseError('Budget capability is required.', {
      details: { capability },
    });
}
async function first(db: PortabilityDatabase, sql: string, ...params: unknown[]) {
  return db
    .prepare(sql)
    .bind(...params)
    .first<BudgetSqlRow>();
}
async function all(db: PortabilityDatabase, sql: string, ...params: unknown[]) {
  return (
    (
      await db
        .prepare(sql)
        .bind(...params)
        .all<BudgetSqlRow>()
    ).results || []
  );
}
async function run(db: PortabilityDatabase, sql: string, ...params: unknown[]) {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}
function budgetDto(row: BudgetSqlRow | null) {
  return (
    row &&
    Object.freeze({
      id: row.id,
      name: row.budget_name,
      fiscalYearId: row.fiscal_year_id,
      versionNumber: Number(row.version_number),
      status: row.status,
      description: row.description || '',
      revisionNotes: row.revision_notes || '',
      createdBy: row.created_by,
      approvedBy: row.approved_by || '',
      lockedBy: row.locked_by || '',
      createdAt: row.created_at,
      submittedAt: row.submitted_at || '',
      approvedAt: row.approved_at || '',
      lockedAt: row.locked_at || '',
      version: Number(row.version),
    })
  );
}
function allocate(annual: number, strategy: string = 'even_monthly', monthly: unknown) {
  if (!Number.isSafeInteger(annual) || annual < 0)
    throw new ValidationError('Annual budget amount must use non-negative integer minor units.');
  if (monthly) {
    if (
      !Array.isArray(monthly) ||
      monthly.length !== 12 ||
      monthly.some((v: unknown) => !Number.isSafeInteger(Number(v)) || Number(v) < 0) ||
      monthly.reduce((s: number, v: unknown) => s + Number(v), 0) !== annual
    )
      throw new ValidationError('Monthly allocations must equal the annual amount.');
    return monthly.map(Number);
  }
  if (strategy !== 'even_monthly')
    throw new ValidationError(
      'Manual, seasonal, percentage, and prior-actual allocations require twelve monthly amounts.'
    );
  const base = Math.floor(annual / 12),
    remainder = annual - base * 12;
  return Array.from({ length: 12 }, (_, index) => base + (index < remainder ? 1 : 0));
}
async function validateDimension(db: PortabilityDatabase, accountId: string | undefined, fundId: string | undefined) {
  const account = await first(
      db,
      'SELECT a.id,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND a.is_posting_account=1',
      accountId
    ),
    fund = await first(
      db,
      'SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL',
      fundId
    );
  if (!account || !fund) throw new ValidationError('Budget lines require an active posting account and active fund.');
  return account;
}
async function event(
  db: PortabilityDatabase,
  budgetId: string,
  type: string,
  actor: LedgerServiceActor,
  reason: string = '',
  metadata: unknown = null
) {
  await run(
    db,
    'INSERT INTO accounting_budget_events(id,budget_id,event_type,actor_id,reason,metadata_json) VALUES(?,?,?,?,?,?)',
    id('budgetevent'),
    budgetId,
    type,
    actor.id,
    reason || null,
    metadata ? JSON.stringify(metadata) : null
  );
}
export async function createBudget(
  db: PortabilityDatabase,
  { actor, entitlementTier, input }: BudgetActorOptions & { input: BudgetInput }
) {
  requireAccess(actor, 'budgets.manage', entitlementTier);
  const year = await first(db, 'SELECT id FROM accounting_fiscal_years WHERE id=?', input?.fiscalYearId);
  if (!year || !String(input.name || '').trim()) throw new ValidationError('Fiscal year and budget name are required.');
  const max = await first(
      db,
      'SELECT COALESCE(MAX(version_number),0) maximum FROM accounting_budgets WHERE fiscal_year_id=?',
      year.id
    ),
    budgetId = id('budget');
  await run(
    db,
    'INSERT INTO accounting_budgets(id,budget_name,fiscal_year_id,version_number,description,revision_notes,created_by) VALUES(?,?,?,?,?,?,?)',
    budgetId,
    String(input.name).trim(),
    year.id,
    Number(max!.maximum) + 1,
    input.description || null,
    input.revisionNotes || null,
    actor.id
  );
  for (const line of input.lines || [])
    await addBudgetLine(db, {
      actor,
      entitlementTier,
      budgetId,
      input: line,
      recordEvent: false,
    });
  for (let i = 0; i < (input.assumptions || []).length; i++) {
    const a = input.assumptions![i];
    await run(
      db,
      'INSERT INTO accounting_budget_assumptions(id,budget_id,sort_order,title,description) VALUES(?,?,?,?,?)',
      id('assumption'),
      budgetId,
      i + 1,
      String(a.title || 'Assumption'),
      String(a.description || '')
    );
  }
  await event(db, budgetId, 'budget_created', actor);
  return budgetDto(await first(db, 'SELECT * FROM accounting_budgets WHERE id=?', budgetId));
}
export async function addBudgetLine(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    budgetId,
    input,
    recordEvent = true,
  }: BudgetActorOptions & { budgetId: string; input: BudgetLineInput; recordEvent?: boolean }
) {
  requireAccess(actor, 'budgets.manage', entitlementTier);
  const budget = await first(db, 'SELECT * FROM accounting_budgets WHERE id=?', budgetId);
  if (!budget || budget.status !== 'draft') throw new ValidationError('Only draft budgets may be edited.');
  await validateDimension(db, input.accountId, input.fundId);
  const annual = Number(input.annualAmount),
    strategy = input.allocationStrategy || 'even_monthly',
    months = allocate(annual, strategy, input.monthlyAmounts);
  await run(
    db,
    `INSERT INTO accounting_budget_lines(id,budget_id,account_id,fund_id,annual_amount,${MONTH_COLUMNS.join(',')},allocation_strategy,notes) VALUES(?,?,?,?,?,${MONTH_COLUMNS.map(() => '?').join(',')},?,?)`,
    id('budgetline'),
    budget.id,
    input.accountId,
    input.fundId,
    annual,
    ...months,
    strategy,
    input.notes || null
  );
  if (recordEvent) await event(db, budget.id, 'budget_updated', actor, 'line_added');
  return Object.freeze({
    budgetId: budget.id,
    accountId: input.accountId,
    fundId: input.fundId,
    annualAmount: annual,
    monthlyAmounts: Object.freeze(months),
    allocationStrategy: strategy,
  });
}
export async function updateBudgetLine(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    budgetId,
    lineId,
    expectedVersion,
    input,
  }: BudgetVersionOptions & { lineId: string; input: BudgetLineInput }
) {
  requireAccess(actor, 'budgets.manage', entitlementTier);
  const line = await first(
    db,
    'SELECT l.*,b.status FROM accounting_budget_lines l JOIN accounting_budgets b ON b.id=l.budget_id WHERE l.id=? AND l.budget_id=?',
    lineId,
    budgetId
  );
  if (!line || line.status !== 'draft' || Number(line.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Budget line changed or is locked.', {
      details: { conflict: true },
    });
  await validateDimension(db, input.accountId || line.account_id, input.fundId || line.fund_id);
  const annual = Number(input.annualAmount ?? line.annual_amount),
    strategy = input.allocationStrategy || line.allocation_strategy,
    months = allocate(annual, strategy, input.monthlyAmounts);
  const result = await run(
    db,
    `UPDATE accounting_budget_lines SET account_id=?,fund_id=?,annual_amount=?,${MONTH_COLUMNS.map((c) => `${c}=?`).join(',')},allocation_strategy=?,notes=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`,
    input.accountId || line.account_id,
    input.fundId || line.fund_id,
    annual,
    ...months,
    strategy,
    input.notes ?? line.notes,
    line.id,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Budget line changed.', {
      details: { conflict: true },
    });
  await event(db, budgetId, 'budget_updated', actor, 'line_updated');
  return Object.freeze({
    id: line.id,
    annualAmount: annual,
    monthlyAmounts: Object.freeze(months),
    version: Number(expectedVersion) + 1,
  });
}
async function transition(
  db: PortabilityDatabase,
  {
    actor,
    tier,
    budgetId,
    expectedVersion,
    capability,
    from,
    to,
    column,
  }: {
    actor: LedgerServiceActor;
    tier: string;
    budgetId: string;
    expectedVersion: number;
    capability: string;
    from: string;
    to: string;
    column: string;
  }
) {
  requireAccess(actor, capability, tier);
  const budget = await first(db, 'SELECT * FROM accounting_budgets WHERE id=?', budgetId);
  if (!budget || budget.status !== from || Number(budget.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Budget changed or cannot make this transition.', {
      details: { conflict: true },
    });
  if (to === 'approved' && budget.created_by === actor.id)
    throw new ValidationError('Budget creator cannot be the sole approver.');
  const timestamp = now(),
    actorColumn = to === 'approved' ? 'approved_by' : to === 'locked' ? 'locked_by' : '',
    actorSet = actorColumn ? `,${actorColumn}=?` : '',
    params = actorColumn
      ? [to, timestamp, actor.id, timestamp, budget.id, from, Number(expectedVersion)]
      : [to, timestamp, timestamp, budget.id, from, Number(expectedVersion)],
    result = await run(
      db,
      `UPDATE accounting_budgets SET status=?,${column}=?${actorSet},version=version+1,updated_at=? WHERE id=? AND status=? AND version=?`,
      ...params
    );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Budget changed.', {
      details: { conflict: true },
    });
  await event(db, budget.id, `budget_${to}`, actor);
  return budgetDto(await first(db, 'SELECT * FROM accounting_budgets WHERE id=?', budget.id));
}
export const submitBudget = (
  db: PortabilityDatabase,
  { actor, entitlementTier, budgetId, expectedVersion }: BudgetVersionOptions
) =>
  transition(db, {
    actor,
    tier: entitlementTier,
    budgetId,
    expectedVersion,
    capability: 'budgets.manage',
    from: 'draft',
    to: 'submitted',
    column: 'submitted_at',
  });
export const approveBudget = (
  db: PortabilityDatabase,
  { actor, entitlementTier, budgetId, expectedVersion }: BudgetVersionOptions
) =>
  transition(db, {
    actor,
    tier: entitlementTier,
    budgetId,
    expectedVersion,
    capability: 'budgets.approve',
    from: 'submitted',
    to: 'approved',
    column: 'approved_at',
  });
export async function lockBudget(
  db: PortabilityDatabase,
  { actor, entitlementTier, budgetId, expectedVersion }: BudgetVersionOptions
) {
  requireAccess(actor, 'budgets.lock', entitlementTier);
  const existing = await first(
    db,
    "SELECT id FROM accounting_budgets WHERE fiscal_year_id=(SELECT fiscal_year_id FROM accounting_budgets WHERE id=?) AND status='locked'",
    budgetId
  );
  if (existing)
    throw new ValidationError(
      'This fiscal year already has an official locked budget. Create a new version only after archiving through the elevated historical workflow.'
    );
  return transition(db, {
    actor,
    tier: entitlementTier,
    budgetId,
    expectedVersion,
    capability: 'budgets.lock',
    from: 'approved',
    to: 'locked',
    column: 'locked_at',
  });
}
export async function copyBudget(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    sourceBudgetId,
    name,
    includeNotes = true,
  }: BudgetActorOptions & { sourceBudgetId: string; name?: string; includeNotes?: boolean }
) {
  requireAccess(actor, 'budgets.manage', entitlementTier);
  const source = await first(db, 'SELECT * FROM accounting_budgets WHERE id=?', sourceBudgetId);
  if (!source) throw new ValidationError('Source budget was not found.');
  const lines = await all(db, 'SELECT * FROM accounting_budget_lines WHERE budget_id=?', source.id),
    assumptions = includeNotes
      ? await all(
          db,
          'SELECT title,description FROM accounting_budget_assumptions WHERE budget_id=? ORDER BY sort_order',
          source.id
        )
      : [];
  const created = await createBudget(db, {
    actor,
    entitlementTier,
    input: {
      name: name || `${source.budget_name} Copy`,
      fiscalYearId: source.fiscal_year_id,
      description: source.description,
      revisionNotes: `Copied from version ${source.version_number}`,
      lines: lines.map((l) => ({
        accountId: l.account_id,
        fundId: l.fund_id,
        annualAmount: Number(l.annual_amount),
        monthlyAmounts: MONTH_COLUMNS.map((c) => Number(l[c])),
        allocationStrategy: l.allocation_strategy,
        notes: includeNotes ? l.notes : null,
      })),
      assumptions,
    },
  });
  await event(db, created!.id, 'budget_copied', actor, '', { sourceBudgetId });
  return created;
}
export async function listBudgets(
  db: PortabilityDatabase,
  { actor, entitlementTier, fiscalYearId = null }: BudgetActorOptions & { fiscalYearId?: string | null }
) {
  requireAccess(actor, 'budgets.view', entitlementTier);
  const rows = fiscalYearId
    ? await all(
        db,
        'SELECT * FROM accounting_budgets WHERE fiscal_year_id=? ORDER BY version_number DESC',
        fiscalYearId
      )
    : await all(db, 'SELECT * FROM accounting_budgets ORDER BY created_at DESC');
  return Object.freeze(rows.map(budgetDto));
}
function actualSign(category: string, debit: number, credit: number) {
  return category === 'revenue' ? credit - debit : debit - credit;
}
export async function budgetVsActual(
  db: PortabilityDatabase,
  { actor, entitlementTier, budgetId, throughMonth = 12, fundId = null }: BudgetVarianceOptions
) {
  requireAccess(actor, 'budgets.view', entitlementTier);
  if (!Number.isInteger(throughMonth) || throughMonth < 1 || throughMonth > 12)
    throw new ValidationError('throughMonth must be from 1 through 12.');
  const budget = await first(
    db,
    'SELECT b.*,f.start_date,f.end_date FROM accounting_budgets b JOIN accounting_fiscal_years f ON f.id=b.fiscal_year_id WHERE b.id=?',
    budgetId
  );
  if (!budget) throw new ValidationError('Budget was not found.');
  const end = new Date(`${budget.start_date}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + throughMonth);
  end.setUTCDate(0);
  const endDate = end.toISOString().slice(0, 10),
    params = [budget.id];
  let fundSql = '';
  if (fundId) {
    fundSql = ' AND l.fund_id=?';
    params.push(fundId);
  }
  const lines = await all(
      db,
      `SELECT l.*,a.account_number,a.name account_name,t.category FROM accounting_budget_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id WHERE l.budget_id=?${fundSql} ORDER BY a.account_number`,
      ...params
    ),
    rows = [];
  for (const line of lines) {
    const actual = await first(
        db,
        `SELECT COALESCE(SUM(j.debit_amount),0) debits,COALESCE(SUM(j.credit_amount),0) credits FROM accounting_journal_lines j JOIN accounting_journal_entries e ON e.id=j.journal_entry_id WHERE j.account_id=? AND j.fund_id=? AND e.status IN('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ?`,
        line.account_id,
        line.fund_id,
        budget.start_date,
        endDate
      ),
      periodBudget = MONTH_COLUMNS.slice(0, throughMonth).reduce((s, c) => s + Number(line[c]), 0),
      actualAmount = actualSign(line.category, Number(actual!.debits), Number(actual!.credits)),
      variance = actualAmount - periodBudget,
      favorable = line.category === 'revenue' ? variance >= 0 : variance <= 0,
      annual = Number(line.annual_amount),
      forecast = throughMonth === 12 ? actualAmount : Math.round((actualAmount / throughMonth) * 12);
    rows.push({
      accountId: line.account_id,
      accountNumber: line.account_number,
      account: line.account_name,
      fundId: line.fund_id,
      category: line.category,
      budget: periodBudget,
      annualBudget: annual,
      actual: actualAmount,
      variance,
      variancePercent: periodBudget ? Math.round((variance * 10000) / periodBudget) / 100 : null,
      remaining: annual - actualAmount,
      forecast,
      favorable,
      varianceLabel: favorable ? 'favorable' : 'unfavorable',
    });
  }
  const totals = rows.reduce(
    (t, r) => {
      t.budget += r.budget;
      t.actual += r.actual;
      t.variance += r.variance;
      t.forecast += r.forecast;
      return t;
    },
    { budget: 0, actual: 0, variance: 0, forecast: 0 }
  );
  await event(db, budget.id, 'variance_report_viewed', actor, '', {
    throughMonth,
    fundId,
  });
  return Object.freeze({
    budget: budgetDto(budget),
    throughMonth,
    throughDate: endDate,
    rows: Object.freeze(rows),
    totals: Object.freeze(totals),
  });
}
export async function forecastBudget(db: PortabilityDatabase, args: BudgetVarianceOptions) {
  const report = await budgetVsActual(db, args);
  await event(db, args.budgetId, 'forecast_generated', args.actor, '', {
    throughMonth: args.throughMonth || 12,
  });
  return Object.freeze({
    ...report,
    method: 'year_to_date_projection',
    forecastDoesNotModifyBudget: true,
  });
}
function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function budgetReportCsv(report: Awaited<ReturnType<typeof budgetVsActual>>) {
  const rows = [
    ['Account', 'Fund', 'Budget', 'Actual', 'Variance', 'Variance %', 'Remaining', 'Forecast', 'Assessment'],
    ...report.rows.map((r) => [
      `${r.accountNumber} ${r.account}`,
      r.fundId,
      r.budget,
      r.actual,
      r.variance,
      r.variancePercent ?? '',
      r.remaining,
      r.forecast,
      r.varianceLabel,
    ]),
  ];
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
export async function councilBudgetPacket(
  db: PortabilityDatabase,
  { actor, entitlementTier, budgetId, throughMonth = 12 }: BudgetVarianceOptions
) {
  const report = await budgetVsActual(db, {
      actor,
      entitlementTier,
      budgetId,
      throughMonth,
    }),
    assumptions = await all(
      db,
      'SELECT title,description FROM accounting_budget_assumptions WHERE budget_id=? ORDER BY sort_order',
      budgetId
    ),
    revenue = report.rows.filter((r) => r.category === 'revenue'),
    expenses = report.rows.filter((r) => r.category === 'expense'),
    majorVariances = [...report.rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 10);
  return Object.freeze({
    title: `Parish Council Budget Packet · ${report.budget!.name}`,
    generatedAt: now(),
    budget: report.budget,
    executiveSummary: report.totals,
    revenue: Object.freeze(revenue),
    expenses: Object.freeze(expenses),
    majorVariances: Object.freeze(majorVariances),
    assumptions: Object.freeze(assumptions),
    printReady: true,
  });
}
