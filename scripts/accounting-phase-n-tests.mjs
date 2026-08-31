#!/usr/bin/env node
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  fundActivity,
  initializeLedger,
  netAssetRollforward,
  reportCsv,
  statementOfCashFlows,
  statementOfFinancialPosition,
  statementOfFunctionalExpenses,
  trialBalance,
} from "../src/accounting/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("accounting-migrations/0021_phase_n_cash_flow_classification.sql");
const reports = read("src/accounting/reports/service.js");
const handler = read("src/handlers/accounting-setup-reports.js");
const app = readParishDashboardSource();
const has = (source, needles, label) => needles.forEach((needle) => assert.ok(source.includes(needle), `${label} must include ${needle}`));

has(migration, ["UPDATE accounting_accounts", "cash_flow_classification='operating'", "is_posting_account=1", "cash_flow_classification IS NULL"], "cash-flow backfill");
has(handler, [
  "cashFlowClassification",
  '["operating","investing","financing"]',
  "/reports/statement-of-cash-flows",
  "/reports/statement-of-functional-expenses",
  "/reports/net-asset-rollforward",
  'request.method === "GET" ? "accounting.view"'
], "Phase N account governance and report routes");
has(reports, [
  "export async function statementOfCashFlows",
  "export async function statementOfFunctionalExpenses",
  "export async function netAssetRollforward",
  'code: "cash_flows"',
  'code: "functional_expenses"',
  'code: "net_asset_rollforward"',
  "report.current && report.comparative"
], "Phase N report service and CSV dispatcher");
has(app, [
  "Statement of Cash Flows",
  "Statement of Functional Expenses",
  "Net Asset Rollforward",
  "function loadAccountingDepthReport",
  "managementAndGeneral",
  "Cash-flow classification"
], "Phase N report selector and functional-expense matrix UI");

const sqlite = new DatabaseSync(":memory:");
for (const file of ["0001_accounting_database_foundation.sql", "0002_core_ledger.sql", "0003_phase2a_setup_configuration.sql", "0005_phase2c_reporting_indexes.sql"]) sqlite.exec(read(`accounting-migrations/${file}`));
const prepare = (sql) => ({
  params: [],
  bind(...params) { this.params = params; return this; },
  async first() { return sqlite.prepare(sql).get(...this.params) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
  async run() { const result = sqlite.prepare(sql).run(...this.params); return { meta: { changes: result.changes } }; }
});
const db = { prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const output = []; for (const statement of statements) output.push(await statement.run()); sqlite.exec("COMMIT"); return output; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
const actor = { id: "phase-n-treasurer", type: "platform_user", capabilities: ["accounting.configure", "accounting.view"] };
await initializeLedger(db, { actor, date: new Date("2026-07-20T00:00:00Z") });
sqlite.exec(read("accounting-migrations/0016_expense_account_groups.sql"));
sqlite.prepare("UPDATE accounting_accounts SET cash_flow_classification=NULL WHERE is_posting_account=1").run();
sqlite.exec(migration);
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_accounts WHERE is_posting_account=1 AND cash_flow_classification IS NULL").get().count, 0, "every seeded posting account must be classified");

const insertEntry = (id, date, description, lines) => {
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0), credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  sqlite.prepare(`INSERT INTO accounting_journal_entries(id,entry_number,entry_date,posting_date,description,status,source_type,created_by_actor_type,created_by_actor_id,total_debits,total_credits)
    VALUES(?,?,?,?,?,'draft','manual','platform_user','phase-n-treasurer',?,?)`).run(id, id, date, date, description, debit, credit);
  lines.forEach((line, index) => sqlite.prepare(`INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount)
    VALUES(?,?,?,?,?,?,?)`).run(`${id}_${index + 1}`, id, index + 1, line.accountId, "fund_general", Number(line.debit || 0), Number(line.credit || 0)));
  sqlite.prepare("UPDATE accounting_journal_entries SET status='posted' WHERE id=?").run(id);
};
insertEntry("phase_n_revenue", "2026-02-01", "Cash contribution", [{ accountId: "acct_1010", debit: 10000 }, { accountId: "acct_4010", credit: 10000 }]);
insertEntry("phase_n_expense", "2026-03-01", "Software invoice", [{ accountId: "acct_5830", debit: 3000 }, { accountId: "acct_2000", credit: 3000 }]);
insertEntry("phase_n_payment", "2026-03-15", "Pay software invoice", [{ accountId: "acct_2000", debit: 3000 }, { accountId: "acct_1010", credit: 3000 }]);

const cashFlow = await statementOfCashFlows(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31" });
assert.equal(cashFlow.totals.netCashChange, 7000);
assert.equal(cashFlow.totals.actualCashChange, 7000);
assert.equal(cashFlow.validation.status, "validated", "worked cash-flow example must reconcile");
const functional = await statementOfFunctionalExpenses(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31" });
assert.equal(functional.totals.program, 3000);
assert.equal(functional.totals.managementAndGeneral, 0);
assert.equal(functional.totals.fundraising, 0);
const rollforward = await netAssetRollforward(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31" });
assert.deepEqual(rollforward.rows.find((row) => row.restrictionType === "unrestricted"), { restrictionType: "unrestricted", beginningBalance: 0, additions: 10000, reductions: 3000, endingBalance: 7000 });

const comparativeCash = await statementOfCashFlows(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31", priorStartDate: "2025-01-01", priorEndDate: "2025-12-31" });
assert.ok(comparativeCash.current && comparativeCash.comparative);
assert.ok((await trialBalance(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31", priorStartDate: "2025-01-01", priorEndDate: "2025-12-31" })).comparative);
assert.ok((await fundActivity(db, { actor, startDate: "2026-01-01", endDate: "2026-12-31", priorStartDate: "2025-01-01", priorEndDate: "2025-12-31" })).comparative);
assert.ok((await statementOfFinancialPosition(db, { actor, asOfDate: "2026-12-31", priorAsOfDate: "2025-12-31" })).comparative);
for (const report of [cashFlow, functional, rollforward]) assert.match(reportCsv(report), new RegExp(report.code));
assert.match(reportCsv(comparativeCash), /current_amount,comparative_amount/);

console.log("Accounting Phase N reporting-depth checks passed; worked cash-flow reconciliation: $70.00 computed = $70.00 actual.");
