#!/usr/bin/env node
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountingFinancialSnapshot,
  handleStewardshipAccountingBridge,
  STEWARDSHIP_ACCOUNTING_READER,
} from "../src/handlers/stewardship-accounting-bridge.js";
import { upsertStewardshipFinancialSnapshot } from "../src/stewardship/financial-snapshots.js";
import { budgetPledgeComparison } from "../src/handlers/accounting-payables-budgets.js";
import { readWorkerCompositionSource } from "./lib/worker-composition-source.mjs";
import { readStewardshipHandlerSource } from './lib/stewardship-handler-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const worker = readWorkerCompositionSource(root);
const stewardship = readStewardshipHandlerSource();
const givingSummary = read("src/lib/stewardship-summary.js");
const bridge = read("src/handlers/stewardship-accounting-bridge.js");
const budgets = read("src/handlers/accounting-payables-budgets.js");
const setup = read("src/accounting/setup/service.js");
const app = readParishDashboardSource();
const platformMigration = read("migrations/0041_stewardship_accounting_import.sql");
const accountingMigration = read("accounting-migrations/0022_pledge_comparison_account.sql");

for (const route of [
  "/stewardship/financials/accounting-summary",
  "/stewardship/financials/import-from-accounting",
]) {
  assert.ok(worker.includes(route), `worker must wire ${route}`);
}
assert.ok(worker.includes("handleStewardshipAccountingBridge"));
assert.match(platformMigration, /imported_from_accounting_at TEXT/);
assert.match(accountingMigration, /pledge_comparison_account_id TEXT REFERENCES accounting_accounts\(id\)/);
assert.doesNotMatch(accountingMigration, /DEFAULT/i, "pledge comparison must default to unconfigured null");
assert.deepEqual(STEWARDSHIP_ACCOUNTING_READER.capabilities, ["accounting.reports.view"]);

const reportDependencies = {
  hasProductionStore: () => true,
  findRegistrationByParishId: async (_env, parishId) => ({ registration: { parishId, subscriptionTier: parishId } }),
  verifyParishDashboardBearer: async () => true,
  stewardshipToolAccess: () => true,
  accountingEnabledFor: (registration) => registration.subscriptionTier !== "stewardship",
  resolveAccountingDatabaseForParish: async (_env, parishId) => parishId === "not-ready"
    ? { entity: { entityStatus: "provisioning" }, registry: { provisioningStatus: "provisioning", healthStatus: "unknown" }, db: null }
    : { entity: { entityStatus: "ready" }, registry: { provisioningStatus: "ready", healthStatus: "healthy" }, db: {} },
  statementOfActivities: async () => ({ totals: { revenue: 10000, expenses: 3500, changeInNetAssets: 6500 } }),
  fundActivity: async () => ({ rows: [
    { name: "General", restrictionType: "unrestricted", beginningBalance: 100, revenue: 20, expenses: 10, otherActivity: 0, endingBalance: 110 },
    { name: "Building", restrictionType: "donor_restricted_temporary", beginningBalance: 2000, revenue: 500, expenses: 100, otherActivity: -75, endingBalance: 2325 },
  ] }),
};
const requestFor = (parishId, suffix = "accounting-summary", init = {}) => new Request(
  `https://agapay.test/api/parish/dashboard/${parishId}/stewardship/financials/${suffix}?startDate=2026-01-01&endDate=2026-12-31`,
  { headers: { Authorization: "Bearer test" }, ...init },
);

let response = await handleStewardshipAccountingBridge(requestFor("stewardship"), {}, "stewardship", reportDependencies);
assert.deepEqual(await response.json(), { available: false, reason: "not_entitled" });
response = await handleStewardshipAccountingBridge(requestFor("not-ready"), {}, "not-ready", reportDependencies);
assert.deepEqual(await response.json(), { available: false, reason: "not_provisioned" });
response = await handleStewardshipAccountingBridge(requestFor("parish"), {}, "parish", reportDependencies);
const ready = await response.json();
assert.equal(ready.available, true);
assert.equal(ready.totalIncomeCents, 10000);
assert.equal(ready.restrictedFunds[0].totalReceivedCents, 500);
assert.equal(ready.restrictedFunds[0].totalDisbursedCents, 175, "negative other activity must be treated as disbursed");
const positiveTransfer = accountingFinancialSnapshot(
  { totals: { revenue: 0, expenses: 0, changeInNetAssets: 0 } },
  { rows: [{ name: "Endowment", restrictionType: "donor_restricted_permanent", beginningBalance: 0, revenue: 100, expenses: 20, otherActivity: 40, endingBalance: 120 }] },
  { startDate: "2026-01-01", endDate: "2026-12-31" },
);
assert.equal(positiveTransfer.restrictedFunds[0].totalReceivedCents, 140);

let importedInput = null;
response = await handleStewardshipAccountingBridge(
  requestFor("parish", "import-from-accounting", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ annualMeetingId: "meeting-1", startDate: "2026-01-01", endDate: "2026-12-31" }),
  }),
  {},
  "parish",
  {
    ...reportDependencies,
    upsertStewardshipFinancialSnapshot: async (_env, input) => {
      importedInput = input;
      return { annualMeetingId: input.annualMeetingId, importedFromAccountingAt: input.importedFromAccountingAt };
    },
  },
);
assert.equal(response.status, 200);
assert.equal(importedInput.annualMeetingId, "meeting-1");
assert.equal(importedInput.replaceRestrictedFunds, true);
assert.ok(importedInput.importedFromAccountingAt);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(read("migrations/0005_stewardship_annual_meetings.sql"));
sqlite.exec(platformMigration);
const platformDb = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return statement.get(...params) || null; },
      async all() { return { results: statement.all(...params) }; },
      async run() { const result = statement.run(...params); return { meta: { changes: result.changes } }; },
    };
  },
};
const fixture = {
  parishId: "st-test",
  fiscalYear: 2026,
  title: "2026 Annual Meeting",
  totalIncomeCents: 10000,
  totalExpenseCents: 3500,
  netCents: 6500,
  restrictedFunds: [{ fundName: "Building", beginningBalanceCents: 2000, totalReceivedCents: 500, totalDisbursedCents: 175, endingBalanceCents: 2325 }],
  now: "2026-07-29T12:00:00.000Z",
};
let idCounter = 0;
await upsertStewardshipFinancialSnapshot({ AGAPAY_DB: platformDb }, { ...fixture, idFactory: () => `manual-${++idCounter}` });
idCounter = 0;
await upsertStewardshipFinancialSnapshot({ AGAPAY_DB: platformDb }, { ...fixture, title: "2026 Imported", importedFromAccountingAt: fixture.now, replaceRestrictedFunds: true, idFactory: () => `import-${++idCounter}` });
const summaries = sqlite.prepare("SELECT total_income_cents,total_expense_cents,net_cents FROM stewardship_financial_summaries ORDER BY annual_meeting_id").all();
assert.deepEqual(summaries[0], summaries[1], "manual and imported paths must persist identical financial values");
const fundRows = sqlite.prepare("SELECT beginning_balance_cents,total_received_cents,total_disbursed_cents,ending_balance_cents FROM stewardship_restricted_fund_snapshots ORDER BY annual_meeting_id").all();
assert.deepEqual(fundRows[0], fundRows[1], "manual and imported paths must persist identical restricted-fund values");

const accountingSqlite = new DatabaseSync(":memory:");
accountingSqlite.exec(`
  CREATE TABLE accounting_fiscal_years(id TEXT PRIMARY KEY,start_date TEXT);
  CREATE TABLE accounting_budgets(id TEXT PRIMARY KEY,fiscal_year_id TEXT);
  CREATE TABLE accounting_accounts(id TEXT PRIMARY KEY,account_number TEXT,name TEXT);
  CREATE TABLE accounting_settings(id TEXT PRIMARY KEY,pledge_comparison_account_id TEXT);
  CREATE TABLE accounting_budget_lines(id TEXT PRIMARY KEY,budget_id TEXT,account_id TEXT,annual_amount INTEGER);
  INSERT INTO accounting_fiscal_years VALUES('fy_2026','2026-01-01');
  INSERT INTO accounting_budgets VALUES('budget_2026','fy_2026');
  INSERT INTO accounting_accounts VALUES('acct_offerings','4010','Stewardship offerings');
  INSERT INTO accounting_settings VALUES('primary','acct_offerings');
  INSERT INTO accounting_budget_lines VALUES('line_1','budget_2026','acct_offerings',120000);
`);
sqlite.exec(`
  CREATE TABLE household_pledges(donor_email TEXT,parish_id TEXT,fiscal_year INTEGER,target_amount_cents INTEGER);
  INSERT INTO household_pledges VALUES('one@example.test','st-test',2026,50000);
  INSERT INTO household_pledges VALUES('two@example.test','st-test',2026,45000);
`);
const accountingDb = {
  prepare(sql) {
    const statement = accountingSqlite.prepare(sql);
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return statement.get(...params) || null; },
      async all() { return { results: statement.all(...params) }; },
      async run() { const result = statement.run(...params); return { meta: { changes: result.changes } }; },
    };
  },
};
const comparison = await budgetPledgeComparison({ AGAPAY_DB: platformDb }, accountingDb, "st-test", "budget_2026");
assert.deepEqual(comparison, {
  fiscalYear: 2026,
  pledgedTotalCents: 95000,
  pledgingHouseholds: 2,
  budgetedLineAmountCents: 120000,
  accountId: "acct_offerings",
  accountNumber: "4010",
  accountName: "Stewardship offerings",
  varianceCents: 25000,
});
accountingSqlite.prepare("UPDATE accounting_settings SET pledge_comparison_account_id=NULL").run();
assert.equal((await budgetPledgeComparison({ AGAPAY_DB: platformDb }, accountingDb, "st-test", "budget_2026")).budgetedLineAmountCents, null);

assert.ok(stewardship.includes("upsertStewardshipFinancialSnapshot(env"), "manual POST must use shared persistence");
assert.ok(bridge.includes("upsertStewardshipFinancialSnapshot(env"), "accounting import must use shared persistence");
const manualPost = stewardship.slice(stewardship.indexOf("// ── POST: save a standalone financial snapshot"), stewardship.indexOf("// POST /api/parish/dashboard/:parishId/stewardship/nudge"));
assert.doesNotMatch(manualPost, /INSERT INTO stewardship_financial_summaries|DELETE FROM stewardship_restricted_fund_snapshots/, "manual POST should only be refactored through shared persistence");

const pledgeAggregation = `SELECT COUNT(*) AS pledging_donors, SUM(target_amount_cents) AS total_pledged_cents
      FROM household_pledges WHERE parish_id = ? AND fiscal_year = ?`;
assert.ok(worker.includes("stewardshipGivingSummary(env"), "Giving Metrics must use its extracted summary module");
assert.ok(givingSummary.replaceAll("\r\n", "\n").includes(pledgeAggregation), "Giving Metrics pledged-total aggregation must remain unchanged");
assert.ok(budgets.replaceAll("\r\n", "\n").includes(pledgeAggregation), "budget comparison must use the identical pledge aggregation");
assert.ok(budgets.includes("/pledge-comparison"));
assert.ok(budgets.includes('if (method === "GET") return path.startsWith("/payables") ? "ap.view" : "budgets.view"'));
const comparisonSource = budgets.slice(budgets.indexOf("async function budgetPledgeComparison"), budgets.indexOf("function requiredCapability"));
assert.doesNotMatch(comparisonSource, /INSERT INTO accounting_budget_lines|UPDATE accounting_budget_lines|DELETE FROM accounting_budget_lines/, "pledge comparison must be read-only");
assert.ok(setup.includes("pledgeComparisonAccountId"));
assert.ok(app.includes("Not configured") && app.includes("Choose a stewardship revenue account"), "unconfigured-account prompt must be reachable");
assert.ok(app.includes("Import into meeting packet") && app.includes("Imported from accounting on"));
assert.ok(app.includes("This panel never changes a budget line."));

console.log("Stewardship accounting bridge checks passed.");
