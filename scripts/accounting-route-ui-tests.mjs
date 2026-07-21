import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleAccountingSetupReports } from "../src/handlers/accounting-setup-reports.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const worker = read("src/worker.js");
const routes = read("src/handlers/accounting-setup-reports.js");
const dashboard = read("public/parish/dashboard.html");
const app = read("public/parish/app.js");

assert.match(worker, /handleAccountingSetupReports/);
for (const route of ["/setup", "/setup/initialize", "/settings", "/reports/trial-balance", "/reports/statement-of-activities", "/reports/statement-of-financial-position", "/reports/fund-activity"]) assert.ok(routes.includes(route), `missing Accounting route ${route}`);
assert.match(routes, /accounting\.view/);
assert.match(routes, /accounting\.configure/);
assert.match(routes, /reportCsv/);
assert.match(dashboard, /id="nav-accounting"/);
assert.match(dashboard, /id="tab-accounting"/);
for (const view of ["setup", "reports", "journals", "ledger"]) assert.ok(dashboard.includes(`data-accounting-view="${view}"`), `missing Accounting UI view ${view}`);
assert.match(app, /initializeAccounting/);
assert.match(app, /saveAccountingSettings/);
assert.match(app, /printAccountingReport/);
assert.match(app, /downloadAccountingReport/);
const unauthorized = await handleAccountingSetupReports(new Request("https://agapay.app/api/parish/dashboard/parish-a/accounting/setup"), {}, "parish-a");
assert.equal(unauthorized.status, 401);
assert.equal(unauthorized.headers.get("Cache-Control"), "private, no-store");

console.log("Accounting route and parish UI checks passed.");
