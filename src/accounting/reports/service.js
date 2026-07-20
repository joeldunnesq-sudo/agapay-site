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
export async function trialBalance(
  db,
  {
    actor,
    startDate,
    endDate,
    fundId = "",
    accountId = "",
    includeZero = false,
  } = {},
) {
  access(actor);
  dates(startDate, endDate);
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
    `SELECT a.id,a.account_number,a.name,a.normal_balance,t.category,f.restriction_type,SUM(l.debit_amount-l.credit_amount) raw_balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.status IN ('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ?${fund} GROUP BY a.id,f.restriction_type ORDER BY t.sort_order,a.account_number`,
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
  { actor, asOfDate, fundId = "" } = {},
) {
  access(actor);
  dates("0001-01-01", asOfDate);
  const rows = await activityRows(db, {
      startDate: "0001-01-01",
      endDate: asOfDate,
      fundId,
    }),
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
export async function fundActivity(db, { actor, startDate, endDate } = {}) {
  access(actor);
  dates(startDate, endDate);
  const rows = await all(
    db,
    `SELECT f.id,f.code,f.name,f.restriction_type,t.category,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date)<? THEN l.debit_amount-l.credit_amount ELSE 0 END) beginning_raw,SUM(CASE WHEN COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? THEN l.debit_amount-l.credit_amount ELSE 0 END) period_raw FROM accounting_funds f LEFT JOIN accounting_journal_lines l ON l.fund_id=f.id LEFT JOIN accounting_journal_entries e ON e.id=l.journal_entry_id AND e.status IN ('posted','reversed') LEFT JOIN accounting_accounts a ON a.id=l.account_id LEFT JOIN accounting_account_types t ON t.id=a.account_type_id GROUP BY f.id,t.category ORDER BY f.code`,
    startDate,
    startDate,
    endDate,
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
    const period = money(r.period_raw);
    if (r.category === "revenue") item.revenue += -period;
    else if (r.category === "expense") item.expenses += period;
    else item.otherActivity += period;
    item.beginningBalance += money(r.beginning_raw);
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
function safeCsv(v) {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export function reportCsv(report) {
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
