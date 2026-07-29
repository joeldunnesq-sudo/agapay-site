import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mergeStewardshipFundsIntoRegistration, STEWARDSHIP_FUND_DEFAULTS } from "../src/lib/stewardship-funds.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(read("accounting-migrations/0001_accounting_database_foundation.sql"));
db.exec(read("accounting-migrations/0002_core_ledger.sql"));
db.exec(read("accounting-migrations/0018_giving_fund_catalog.sql"));
db.exec("CREATE TABLE registrations(reference TEXT PRIMARY KEY,parish_id TEXT,updated_at TEXT,data TEXT NOT NULL)");
db.exec("CREATE TABLE giving_funds(id TEXT PRIMARY KEY,parish_id TEXT,name TEXT,code TEXT,UNIQUE(parish_id,code))");
db.prepare("INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)").run(
  "demo-st-fiacre",
  "st-fiacre",
  "2026-01-01T00:00:00Z",
  JSON.stringify({ funds: [
    { id: "general", name: "General Fund", restrictionType: "unrestricted" },
    { id: "benevolence-fund", name: "Benevolence Fund", accountNumber: "GIV-507346B3", accountingFundId: "fund_operational_507346b39f44e02ecd15", restrictionType: "unrestricted" }
  ] })
);
db.exec(read("migrations/0043_st_fiacre_benevolence_restriction.sql"));
db.exec(read("migrations/0044_st_fiacre_stewardship_fund_catalog.sql"));
db.exec(read("migrations/0045_st_fiacre_stewardship_accounting_links.sql"));
db.exec(read("migrations/0046_st_fiacre_preserve_posted_fund_ids.sql"));
db.exec(read("migrations/0047_st_fiacre_merge_alms_into_benevolence.sql"));
const correctedRegistration = JSON.parse(db.prepare("SELECT data FROM registrations WHERE parish_id='st-fiacre'").get().data);
assert.equal(correctedRegistration.funds[1].restrictionType, "donor_restricted_temporary", "St. Fiacre Benevolence must be restricted");
for (const expected of STEWARDSHIP_FUND_DEFAULTS) {
  const correctedFund = correctedRegistration.funds.find((fund) => fund.id === expected.id);
  assert.ok(correctedFund, `St. Fiacre is missing ${expected.name}`);
  assert.ok(correctedFund.accountNumber, `${expected.name} needs an accounting number`);
  assert.match(correctedFund.accountingFundId, /^fund_(?:giving|operational)_/, `${expected.name} must preserve its accounting link`);
}
assert.ok(!correctedRegistration.funds.some((fund) => fund.id === "alms"), "Poor Box / Alms must not remain a separate fund");
assert.equal(correctedRegistration.funds.filter((fund) => fund.id === "benevolence-fund").length, 1, "Benevolence must be the single alms fund");
const firstMerge = mergeStewardshipFundsIntoRegistration({ funds: [{ id: "general", name: "General Operating Fund" }] });
assert.equal(firstMerge.added.length, STEWARDSHIP_FUND_DEFAULTS.length, "activation must add every reporting fund to Funds & Alms");
const secondMerge = mergeStewardshipFundsIntoRegistration(firstMerge.registration);
assert.equal(secondMerge.added.length, 0, "Stewardship fund reconciliation must be idempotent");
assert.equal(secondMerge.registration.funds.length, firstMerge.registration.funds.length, "reconciliation must not duplicate funds");
const legacyMerge = mergeStewardshipFundsIntoRegistration({ funds: [
  { id: "benevolence-fund", name: "Benevolence Fund" },
  { id: "alms", name: "Poor Box / Alms" }
] });
assert.equal(legacyMerge.removed.length, 1, "legacy Poor Box / Alms must be removed");
assert.equal(legacyMerge.registration.funds.filter((fund) => fund.id === "benevolence-fund").length, 1, "legacy alms must merge into Benevolence");
assert.ok(!legacyMerge.registration.funds.some((fund) => fund.id === "alms"), "legacy alms ID must not survive reconciliation");

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
assert.match(wiring, /const id = text\(accountingFundId\)/, "catalog publishing must preserve an existing ledger fund ID");
assert.match(wiring, /restrictionType/);
assert.match(wiring, /giving_goal_cents/);
assert.match(wiring, /loadGivingCatalogFromAccounting/);
assert.match(wiring, /WHERE is_system=0 AND is_default=0/, "Funds & Alms must retire parallel accounting-only funds");
assert.match(parish, /accounting_catalog_unavailable/);
const worker = read("src/worker.js");
const stewardship = read("src/handlers/stewardship.js");
assert.match(worker, /mergeStewardshipFundsIntoRegistration/, "manual activation must update Funds & Alms");
assert.match(stewardship, /mergeStewardshipFundsIntoRegistration/, "Stripe activation must update Funds & Alms");
assert.match(worker, /f\.reportCode \|\| f\.id/, "reporting aliases must not create duplicate accounting funds");
assert.doesNotMatch(read("src/lib/stewardship-funds.js"), /name: "Poor Box \/ Alms"/, "Poor Box / Alms must not be a default fund");
assert.doesNotMatch(worker, /const defaults = \[\s*\{ name: "General Stewardship"/, "worker must not maintain a parallel default-fund list");
assert.doesNotMatch(stewardship, /const defaults = \[\s*\{ name: "General Stewardship"/, "webhook must not maintain a parallel default-fund list");
assert.ok(parish.indexOf("synchronizeGivingCatalogWithAccounting") < parish.indexOf("saveRegistrationRecord(env, found.key, updated, current)"), "accounting catalog must save before the central registration");
assert.match(accountingRoutes, /fund_catalog_managed_in_parish_dashboard/);
assert.doesNotMatch(accountingRoutes, /INSERT INTO accounting_funds[\s\S]*VALUES\(\?,\?,\?,\?,\?,\?,0,1,0\)/);
assert.doesNotMatch(accountingRoutes, /current\.category !== "expense"/);
assert.match(app, /function showAccountingAccountForm\b/);
assert.match(app, /id="fundAccountNumber"/);
assert.match(app, /id="campaignAccountNumber"/);
assert.match(app, /id="fundRestriction"/);
assert.match(app, /Custom fund — name it yourself/);
assert.match(app, /function updateGivingOption\b/, "existing funds must support editing after creation");
assert.match(app, /name="accountNumber"/, "the fund editor must allow account-number changes");
assert.match(app, /name="restrictionType"/, "the fund editor must allow restriction changes");
assert.match(app, /options-summary-builder/, "the Active giving options card must retain the add-fund workflow");
assert.match(app, /onclick="editGivingOption\('fund',\$\{row\.index\}\)"/, "fund rows in Active giving options must expose inline editing");
assert.doesNotMatch(app, /<h3 class="option-group-title">Designated funds<\/h3>/, "Funds & Alms must not render a duplicate Designated funds card");
assert.match(app, /Benevolence Fund'[^}\n]+restrictionType:'donor_restricted_temporary'/, "new Benevolence funds must default to donor restricted");
assert.match(app, /Funds &amp; Alms is the source of truth/);
assert.match(app, /if\(f\) editableFunds=/, "saving another dashboard tab must not erase Funds & Alms");

console.log("PASS - Funds & Alms accounting catalog, restrictions, metadata, failure safety, and account numbers");
