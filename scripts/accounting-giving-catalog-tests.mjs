import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(read("accounting-migrations/0001_accounting_database_foundation.sql"));
db.exec(read("accounting-migrations/0002_core_ledger.sql"));
db.exec(read("accounting-migrations/0018_giving_fund_catalog.sql"));

const fundColumns = db.prepare("PRAGMA table_info(accounting_funds)").all().map((row) => row.name);
for (const column of ["giving_source_type", "giving_source_id", "giving_enabled", "giving_slug", "giving_goal_cents", "giving_metadata_json"]) {
  assert.ok(fundColumns.includes(column), `missing giving catalog column ${column}`);
}
const accountColumns = db.prepare("PRAGMA table_info(accounting_accounts)").all().map((row) => row.name);
assert.ok(accountColumns.includes("account_number"), "every ledger account must retain an account number");

const wiring = read("src/accounting/source-wiring.js");
const parish = read("src/handlers/parish.js");
const accountingRoutes = read("src/handlers/accounting-setup-reports.js");
const app = read("public/parish/app.js");

assert.match(wiring, /giving_source_type/);
assert.match(wiring, /restrictionType/);
assert.match(wiring, /giving_goal_cents/);
assert.match(wiring, /loadGivingCatalogFromAccounting/);
assert.match(parish, /accounting_catalog_unavailable/);
assert.ok(parish.indexOf("synchronizeGivingCatalogWithAccounting") < parish.indexOf("saveRegistrationRecord(env, found.key, updated, current)"), "accounting catalog must save before the central registration");
assert.match(accountingRoutes, /const accountNumber = clean\(body\.accountNumber/);
assert.doesNotMatch(accountingRoutes, /current\.category !== "expense"/);
assert.match(app, /function showAccountingAccountForm\b/);
assert.match(app, /id="fundAccountNumber"/);
assert.match(app, /id="campaignAccountNumber"/);
assert.match(app, /id="fundRestriction"/);
assert.match(app, /if\(f\) editableFunds=/, "saving another dashboard tab must not erase Funds & Alms");

console.log("PASS - Funds & Alms accounting catalog, restrictions, metadata, failure safety, and account numbers");
