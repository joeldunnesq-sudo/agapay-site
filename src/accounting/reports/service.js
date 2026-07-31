import { AccountingDatabaseError, ValidationError } from "../errors.js";
function access(actor) {
  if (
    !actor?.id ||
    !actor.capabilities?.some((c) =>
      [
        "accounting.view",
        "accounting.reports",
        "accounting.reports.view",
      ].includes(c),
    )
  )
    throw new AccountingDatabaseError("Accounting report access is required.");
}
async function all(db, sql, ...params) {
  return (
    (
      await db
        .prepare(sql)
        .bind(...params)
        .all()
    ).results || []
  );
}
function dates(startDate, endDate) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") ||
    startDate > endDate
  )
    throw new ValidationError("A valid report date range is required.");
  return { startDate, endDate };
}
function normal(row, raw) {
  return row.normal_balance === "debit" ? raw : -raw;
}
const money = (n) => Number(n || 0);
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const comparativeReport = (current, comparative) => Object.freeze({ code: current.code, basis: current.basis, current, comparative });
export async function trialBalance(
  db,
  {
    actor,
    startDate,
    endDate,
    fundId = "",
    accountId = "",
    includeZero = false,
    priorStartDate = "",
    priorEndDate = "",
  } = {},
) {
  access(actor);
  dates(startDate, endDate);
  if (priorStartDate || priorEndDate) {
    dates(priorStartDate, priorEndDate);
    const current = await trialBalance(db, { actor, startDate, endDate, fundId, accountId, includeZero });
    const comparative = await trialBalance(db, { actor, startDate: priorStartDate, endDate: priorEndDate, fundId, accountId, includeZero });
    return comparativeReport(current, comparative);
  }
  const clauses = [
      "e.status IN ('posted','reversed')",
      "COALESCE(e.posting_date,e.entry_date)<=?",
    ],
    filters = [endDate];
  if (fundId) {
    clauses.push("l.fund_id=?");
    filters.push(fundId);
  }
  if (accountId) {
    clauses.push("l.account_id=?");
    filters.push(accountId);
  }
  const params = [
    startDate,
    startDate,
    startDate,
    endDate,
    startDate,
    endDate,
    ...filters,
  ];
  const rows = await all(
    db,
    `SELECT a.id,a.account_number,a.name,a.normal_balance,t.category,t.name account_type,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date)<? THEN l.debit_amount ELSE 0 END) beginning_debits,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date)<? THEN l.credit_amount ELSE 0 END) beginning_credits,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? THEN l.debit_amount ELSE 0 END) period_debits,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? THEN l.credit_amount ELSE 0 END) period_credits FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id LEFT JOIN accounting_journal_lines l ON l.account_id=a.id LEFT JOIN accounting_journal_entries e ON e.id=l.journal_entry_id AND ${clauses.join(" AND ")} GROUP BY a.id ORDER BY t.sort_order,a.account_number`,
    ...params,
  );
  const output = rows
    .map((r) => {
      const bd = money(r.beginning_debits),
        bc = money(r.beginning_credits),
        pd = money(r.period_debits),
        pc = money(r.period_credits),
        ending = bd + pd - bc - pc;
      return Object.freeze({
        accountId: r.id,
        accountNumber: r.account_number,
        accountName: r.name,
        accountType: r.account_type,
        category: r.category,
        beginningDebit: Math.max(ending - (pd - pc), 0),
        beginningCredit: Math.max(-(ending - (pd - pc)), 0),
        periodDebits: pd,
        periodCredits: pc,
        endingDebit: Math.max(ending, 0),
        endingCredit: Math.max(-ending, 0),
      });
    })
    .filter(
      (r) =>
        includeZero ||
        r.beginningDebit +
          r.beginningCredit +
          r.periodDebits +
          r.periodCredits >
          0,
    );
  const totals = output.reduce(
    (t, r) => ({
      beginningDebits: t.beginningDebits + r.beginningDebit,
      beginningCredits: t.beginningCredits + r.beginningCredit,
      periodDebits: t.periodDebits + r.periodDebits,
      periodCredits: t.periodCredits + r.periodCredits,
      endingDebits: t.endingDebits + r.endingDebit,
      endingCredits: t.endingCredits + r.endingCredit,
    }),
    {
      beginningDebits: 0,
      beginningCredits: 0,
      periodDebits: 0,
      periodCredits: 0,
      endingDebits: 0,
      endingCredits: 0,
    },
  );
  return Object.freeze({
    code: "trial_balance",
    basis: "posting_date",
    startDate,
    endDate,
    rows: Object.freeze(output),
    totals: Object.freeze({
      ...totals,
      difference: totals.endingDebits - totals.endingCredits,
    }),
    validation: Object.freeze({
      status:
        totals.endingDebits === totals.endingCredits ? "validated" : "failed",
      reasonCodes:
        totals.endingDebits === totals.endingCredits
          ? []
          : ["trial_balance_out_of_balance"],
    }),
  });
}
async function activityRows(db, { startDate, endDate, fundId = "" }) {
  const params = [startDate, endDate],
    fund = fundId ? " AND l.fund_id=?" : "";
  if (fundId) params.push(fundId);
  return all(
    db,
    `SELECT a.id,a.account_number,a.name,a.normal_balance,a.cash_flow_classification,t.category,t.name account_type,f.restriction_type,SUM(l.debit_amount-l.credit_amount) raw_balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.status IN ('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ?${fund} GROUP BY a.id,f.restriction_type ORDER BY t.sort_order,a.account_number`,
    ...params,
  );
}
async function financialPositionRows(db, { asOfDate, fundId = "" }) {
  const params = ["0001-01-01", asOfDate],
    fund = fundId ? " AND l.fund_id=?" : "";
  if (fundId) params.push(fundId);
  return all(
    db,
    `SELECT a.id,a.account_number,a.name,a.normal_balance,a.cash_flow_classification,t.category,t.name account_type,SUM(l.debit_amount-l.credit_amount) raw_balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id WHERE e.status IN ('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ?${fund} GROUP BY a.id ORDER BY t.sort_order,a.account_number`,
    ...params,
  );
}
export async function statementOfActivities(
  db,
  { actor, startDate, endDate, fundId = "" } = {},
) {
  access(actor);
  dates(startDate, endDate);
  const rows = await activityRows(db, { startDate, endDate, fundId }),
    mapped = rows
      .filter((r) => ["revenue", "expense"].includes(r.category))
      .map((r) =>
        Object.freeze({
          accountId: r.id,
          accountNumber: r.account_number,
          accountName: r.name,
          category: r.category,
          restrictionType: r.restriction_type,
          amount: normal(r, money(r.raw_balance)),
        }),
      );
  const revenue = mapped
      .filter((r) => r.category === "revenue")
      .reduce((s, r) => s + r.amount, 0),
    expenses = mapped
      .filter((r) => r.category === "expense")
      .reduce((s, r) => s + r.amount, 0);
  return Object.freeze({
    code: "statement_of_activities",
    basis: "posting_date",
    startDate,
    endDate,
    rows: Object.freeze(mapped),
    totals: Object.freeze({
      revenue,
      expenses,
      changeInNetAssets: revenue - expenses,
    }),
    validation: Object.freeze({ status: "validated", reasonCodes: [] }),
  });
}
export async function statementOfFinancialPosition(
  db,
  { actor, asOfDate, fundId = "", priorAsOfDate = "" } = {},
) {
  access(actor);
  dates("0001-01-01", asOfDate);
  if (priorAsOfDate) {
    dates("0001-01-01", priorAsOfDate);
    const current = await statementOfFinancialPosition(db, { actor, asOfDate, fundId });
    const comparative = await statementOfFinancialPosition(db, { actor, asOfDate: priorAsOfDate, fundId });
    return comparativeReport(current, comparative);
  }
  const rows = await financialPositionRows(db, { asOfDate, fundId }),
    mapped = rows
      .filter((r) => ["asset", "liability", "net_asset"].includes(r.category))
      .map((r) =>
        Object.freeze({
          accountId: r.id,
          accountNumber: r.account_number,
          accountName: r.name,
          category: r.category,
          amount: normal(r, money(r.raw_balance)),
        }),
      );
  const sum = (c) =>
      mapped.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0),
    assets = sum("asset"),
    liabilities = sum("liability"),
    netAssets = sum("net_asset") + rows.filter((r) => r.category === "revenue").reduce((s, r) => s + normal(r, money(r.raw_balance)), 0) - rows.filter((r) => r.category === "expense").reduce((s, r) => s + normal(r, money(r.raw_balance)), 0),
    difference = assets - liabilities - netAssets;
  return Object.freeze({
    code: "financial_position",
    basis: "posting_date",
    asOfDate,
    rows: Object.freeze(mapped),
    totals: Object.freeze({ assets, liabilities, netAssets, difference }),
    validation: Object.freeze({
      status: difference === 0 ? "validated" : "warning",
      reasonCodes:
        difference === 0 ? [] : ["financial_position_equation_difference"],
    }),
  });
}
export async function fundActivity(db, { actor, startDate, endDate, fundId = "", priorStartDate = "", priorEndDate = "" } = {}) {
  access(actor);
  dates(startDate, endDate);
  if (priorStartDate || priorEndDate) {
    dates(priorStartDate, priorEndDate);
    const current = await fundActivity(db, { actor, startDate, endDate, fundId });
    const comparative = await fundActivity(db, { actor, startDate: priorStartDate, endDate: priorEndDate, fundId });
    return comparativeReport(current, comparative);
  }
  const fundClause = fundId ? " WHERE f.id=?" : "";
  const params = [startDate, startDate, endDate];
  if (fundId) params.push(fundId);
  const rows = await all(
    db,
    `SELECT f.id,f.code,f.name,f.restriction_type,t.category,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date)<? THEN l.debit_amount-l.credit_amount ELSE 0 END) beginning_raw,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? THEN l.debit_amount-l.credit_amount ELSE 0 END) period_raw FROM accounting_funds f LEFT JOIN accounting_journal_lines l ON l.fund_id=f.id LEFT JOIN accounting_journal_entries e ON e.id=l.journal_entry_id AND e.status IN ('posted','reversed') LEFT JOIN accounting_accounts a ON a.id=l.account_id LEFT JOIN accounting_account_types t ON t.id=a.account_type_id${fundClause} GROUP BY f.id,t.category ORDER BY f.code`,
    ...params,
  );
  const funds = new Map();
  for (const r of rows) {
    const item = funds.get(r.id) || {
      fundId: r.id,
      code: r.code,
      name: r.name,
      restrictionType: r.restriction_type,
      beginningBalance: 0,
      revenue: 0,
      expenses: 0,
      otherActivity: 0,
      netChange: 0,
      endingBalance: 0,
    };
    const beginning = money(r.beginning_raw);
    const period = money(r.period_raw);
    if (r.category === "revenue") item.revenue += -period;
    else if (r.category === "expense") item.expenses += period;
    else if (r.category === "net_asset") item.otherActivity += -period;
    if (["revenue", "expense", "net_asset"].includes(r.category))
      item.beginningBalance += -beginning;
    item.netChange = item.revenue - item.expenses + item.otherActivity;
    item.endingBalance = item.beginningBalance + item.netChange;
    funds.set(r.id, item);
  }
  return Object.freeze({
    code: "fund_activity",
    basis: "posting_date",
    startDate,
    endDate,
    rows: Object.freeze([...funds.values()].map(Object.freeze)),
    validation: Object.freeze({ status: "validated", reasonCodes: [] }),
  });
}

function accountBalances(rows) {
  const balances = new Map();
  for (const row of rows) {
    const current = balances.get(row.id) || {
      accountId: row.id,
      accountNumber: row.account_number,
      accountName: row.name,
      category: row.category,
      classification: row.cash_flow_classification || "operating",
      amount: 0,
    };
    current.amount += normal(row, money(row.raw_balance));
    balances.set(row.id, current);
  }
  return balances;
}

async function cashFlowPeriod(db, { actor, startDate, endDate, fundId }) {
  const activities = await statementOfActivities(db, { actor, startDate, endDate, fundId });
  const beginning = accountBalances(await activityRows(db, { startDate: "0001-01-01", endDate: dayBefore(startDate), fundId }));
  const ending = accountBalances(await activityRows(db, { startDate: "0001-01-01", endDate, fundId }));
  const ids = new Set([...beginning.keys(), ...ending.keys()]);
  const changes = [...ids].map((accountId) => {
    const account = ending.get(accountId) || beginning.get(accountId);
    return { ...account, change: money(ending.get(accountId)?.amount) - money(beginning.get(accountId)?.amount) };
  });
  const isCash = (row) => row.category === "asset" && Number(row.accountNumber) >= 1000 && Number(row.accountNumber) < 1100;
  const cashEffect = (row) => row.category === "asset" ? -row.change : row.change;
  const operating = changes.filter((row) => row.classification === "operating" && ["asset", "liability"].includes(row.category) && !isCash(row));
  const investing = changes.filter((row) => row.classification === "investing" && ["asset", "liability", "net_asset"].includes(row.category) && !isCash(row));
  const financing = changes.filter((row) => row.classification === "financing" && ["asset", "liability", "net_asset"].includes(row.category) && !isCash(row));
  const operatingAdjustments = operating.reduce((sum, row) => sum + cashEffect(row), 0);
  const investingCashFlow = investing.reduce((sum, row) => sum + cashEffect(row), 0);
  const financingCashFlow = financing.reduce((sum, row) => sum + cashEffect(row), 0);
  const netCashChange = activities.totals.changeInNetAssets + operatingAdjustments + investingCashFlow + financingCashFlow;
  const actualCashChange = changes.filter(isCash).reduce((sum, row) => sum + row.change, 0);
  const difference = netCashChange - actualCashChange;
  const rows = [
    { section: "operating", label: "Change in net assets", amount: activities.totals.changeInNetAssets },
    ...operating.map((row) => ({ section: "operating", label: `Change in ${row.accountName}`, accountId: row.accountId, amount: cashEffect(row) })),
    ...investing.map((row) => ({ section: "investing", label: `Change in ${row.accountName}`, accountId: row.accountId, amount: cashEffect(row) })),
    ...financing.map((row) => ({ section: "financing", label: `Change in ${row.accountName}`, accountId: row.accountId, amount: cashEffect(row) })),
    { section: "reconciliation", label: "Net change in cash", amount: netCashChange },
    { section: "reconciliation", label: "Actual change in cash accounts", amount: actualCashChange },
  ];
  return Object.freeze({
    code: "cash_flows",
    basis: "posting_date",
    method: "indirect",
    startDate,
    endDate,
    rows: Object.freeze(rows.map(Object.freeze)),
    totals: Object.freeze({ changeInNetAssets: activities.totals.changeInNetAssets, operatingAdjustments, investingCashFlow, financingCashFlow, netCashChange, actualCashChange, difference }),
    validation: Object.freeze({ status: difference === 0 ? "validated" : "warning", reasonCodes: difference === 0 ? [] : ["cash_flow_reconciliation_difference"] }),
  });
}

export async function statementOfCashFlows(db, { actor, startDate, endDate, fundId = "", priorStartDate = "", priorEndDate = "" } = {}) {
  access(actor); dates(startDate, endDate);
  const current = await cashFlowPeriod(db, { actor, startDate, endDate, fundId });
  if (!priorStartDate && !priorEndDate) return current;
  dates(priorStartDate, priorEndDate);
  return comparativeReport(current, await cashFlowPeriod(db, { actor, startDate: priorStartDate, endDate: priorEndDate, fundId }));
}

async function functionalExpensePeriod(db, { startDate, endDate, fundId }) {
  const rows = await activityRows(db, { startDate, endDate, fundId });
  const presentations = new Map((await all(db, "SELECT account_id,expense_group FROM accounting_account_presentations")).map((row) => [row.account_id, row.expense_group]));
  const grouped = new Map();
  for (const row of rows.filter((item) => item.category === "expense")) {
    const key = row.id;
    const current = grouped.get(key) || { naturalCategory: row.name, accountId: row.id, accountNumber: row.account_number, program: 0, managementAndGeneral: 0, fundraising: 0, total: 0 };
    const amount = normal(row, money(row.raw_balance));
    if (presentations.get(row.id) === "administrative") current.managementAndGeneral += amount;
    else current.program += amount;
    current.total += amount;
    grouped.set(key, current);
  }
  const output = [...grouped.values()].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  const totals = output.reduce((sum, row) => ({ program: sum.program + row.program, managementAndGeneral: sum.managementAndGeneral + row.managementAndGeneral, fundraising: sum.fundraising + row.fundraising, total: sum.total + row.total }), { program: 0, managementAndGeneral: 0, fundraising: 0, total: 0 });
  return Object.freeze({ code: "functional_expenses", basis: "posting_date", startDate, endDate, rows: Object.freeze(output.map(Object.freeze)), totals: Object.freeze(totals), simplification: "Administrative expenses are management-and-general; all other expenses are program. Fundraising is not separately tracked and is shown as zero.", validation: Object.freeze({ status: "validated", reasonCodes: [] }) });
}

export async function statementOfFunctionalExpenses(db, { actor, startDate, endDate, fundId = "", priorStartDate = "", priorEndDate = "" } = {}) {
  access(actor); dates(startDate, endDate);
  const current = await functionalExpensePeriod(db, { startDate, endDate, fundId });
  if (!priorStartDate && !priorEndDate) return current;
  dates(priorStartDate, priorEndDate);
  return comparativeReport(current, await functionalExpensePeriod(db, { startDate: priorStartDate, endDate: priorEndDate, fundId }));
}

const RESTRICTION_CLASSES = Object.freeze(["unrestricted", "board_designated", "donor_restricted_temporary", "donor_restricted_permanent"]);
function restrictionPositions(rows) {
  const positions = new Map(RESTRICTION_CLASSES.map((type) => [type, 0]));
  for (const row of rows) {
    if (row.category === "asset") positions.set(row.restriction_type, positions.get(row.restriction_type) + normal(row, money(row.raw_balance)));
    if (row.category === "liability") positions.set(row.restriction_type, positions.get(row.restriction_type) - normal(row, money(row.raw_balance)));
  }
  return positions;
}

export async function netAssetRollforward(db, { actor, startDate, endDate, fundId = "" } = {}) {
  access(actor); dates(startDate, endDate);
  const beginning = restrictionPositions(await activityRows(db, { startDate: "0001-01-01", endDate: dayBefore(startDate), fundId }));
  const ending = restrictionPositions(await activityRows(db, { startDate: "0001-01-01", endDate, fundId }));
  const period = await activityRows(db, { startDate, endDate, fundId });
  const rows = RESTRICTION_CLASSES.map((restrictionType) => {
    const classRows = period.filter((row) => row.restriction_type === restrictionType);
    const additions = classRows.filter((row) => row.category === "revenue").reduce((sum, row) => sum + normal(row, money(row.raw_balance)), 0);
    const reductions = classRows.filter((row) => row.category === "expense").reduce((sum, row) => sum + normal(row, money(row.raw_balance)), 0);
    return Object.freeze({ restrictionType, beginningBalance: beginning.get(restrictionType), additions, reductions, endingBalance: ending.get(restrictionType) });
  });
  return Object.freeze({ code: "net_asset_rollforward", basis: "posting_date", startDate, endDate, rows: Object.freeze(rows), validation: Object.freeze({ status: "validated", reasonCodes: [] }) });
}

function safeCsv(v) {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export function reportCsv(report) {
  if (report.current && report.comparative) {
    const currentRows = report.current.rows || [], comparativeRows = report.comparative.rows || [];
    const identity = (row, index) => row.accountId || row.fundId || row.restrictionType || row.naturalCategory || row.label || String(index);
    const currentMap = new Map(currentRows.map((row, index) => [identity(row, index), row]));
    const comparativeMap = new Map(comparativeRows.map((row, index) => [identity(row, index), row]));
    const ids = [...new Set([...currentMap.keys(), ...comparativeMap.keys()])];
    const descriptive = [...new Set([...currentRows, ...comparativeRows].flatMap((row) => Object.keys(row).filter((key) => typeof row[key] !== "number")))];
    const numeric = [...new Set([...currentRows, ...comparativeRows].flatMap((row) => Object.keys(row).filter((key) => typeof row[key] === "number")))];
    const table = [
      [...descriptive, ...numeric.map((key) => `current_${key}`), ...numeric.map((key) => `comparative_${key}`)],
      ...ids.map((id) => {
        const current = currentMap.get(id) || {}, comparative = comparativeMap.get(id) || {}, source = currentMap.get(id) || comparative;
        return [...descriptive.map((key) => source[key] ?? ""), ...numeric.map((key) => current[key] ?? 0), ...numeric.map((key) => comparative[key] ?? 0)];
      }),
    ];
    return [
      ["Report", report.code],
      ["Current", `${report.current.startDate || ""} through ${report.current.endDate || report.current.asOfDate || ""}`],
      ["Comparative", `${report.comparative.startDate || ""} through ${report.comparative.endDate || report.comparative.asOfDate || ""}`],
      [],
      ...table,
    ].map((row) => row.map(safeCsv).join(",")).join("\r\n");
  }
  const rows = report.rows || [],
    keys = rows.length ? Object.keys(rows[0]) : [];
  return [
    ["Report", report.code],
    ["Basis", report.basis],
    ["Start", report.startDate || ""],
    ["End", report.endDate || report.asOfDate || ""],
    [],
    keys,
    ...rows.map((r) => keys.map((k) => r[k])),
  ]
    .map((row) => row.map(safeCsv).join(","))
    .join("\r\n");
}
