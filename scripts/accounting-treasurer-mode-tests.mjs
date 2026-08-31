import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeLedger, recordInKindGift, recordSimpleDeposit, recordSplitDeposit, statementOfActivities } from "../src/accounting/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("accounting-migrations/0001_accounting_database_foundation.sql"));
  sqlite.exec(read("accounting-migrations/0002_core_ledger.sql"));
  const prepare = (sql) => ({
    params: [],
    bind(...params) { this.params = params; return this; },
    async first() { return sqlite.prepare(sql).get(...this.params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
    async run() { const result = sqlite.prepare(sql).run(...this.params); return { success:true, meta:{ changes:result.changes } }; }
  });
  return {
    sqlite,
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

const db = database();
const actor = {
  id:"treasurer_test",
  type:"platform_user",
  capabilities:["accounting.configure","accounting.view","accounting.journals.create","accounting.journals.post"]
};
const today = new Date().toISOString().slice(0, 10);
await initializeLedger(db, { actor, date:new Date() });
assert.deepEqual({ ...db.sqlite.prepare("SELECT account_number,name,account_type_id,normal_balance,is_posting_account,requires_fund FROM accounting_accounts WHERE id='acct_4200'").get() }, {
  account_number:"4200",
  name:"In-Kind Contributions",
  account_type_id:"type_revenue",
  normal_balance:"credit",
  is_posting_account:1,
  requires_fund:1
});
const inKindMigration = read("accounting-migrations/0025_in_kind_contributions_account.sql");
db.sqlite.prepare("DELETE FROM accounting_accounts WHERE id='acct_4200'").run();
db.sqlite.exec(inKindMigration);
assert.equal(db.sqlite.prepare("SELECT name FROM accounting_accounts WHERE id='acct_4200'").get().name, "In-Kind Contributions");
console.log("PASS - acct_4200 is present through both fresh-ledger seeding and migration backfill");

const posted = await recordSimpleDeposit(db, {
  actor,
  entryDate:today,
  description:"Sunday offering",
  depositAccountId:"acct_1010",
  revenueAccountId:"acct_4000",
  fundId:"fund_general",
  amount:20000,
  correlationId:"treasurer-mode-test"
});
assert.equal(posted.status, "posted");
assert.equal(posted.totalDebits, 20000);
assert.equal(posted.totalCredits, 20000);
const lines = db.sqlite.prepare("SELECT account_id,fund_id,debit_amount,credit_amount FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number").all(posted.id).map((line) => ({ ...line }));
assert.deepEqual(lines, [
  { account_id:"acct_1010", fund_id:"fund_general", debit_amount:20000, credit_amount:0 },
  { account_id:"acct_4000", fund_id:"fund_general", debit_amount:0, credit_amount:20000 }
]);
console.log("PASS - recordSimpleDeposit creates and posts one balanced two-line entry");

db.sqlite.prepare("INSERT INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system) VALUES(?,?,?,?,0,1,0)").run("fund_building","BUILDING","Building Fund","board_designated");
db.sqlite.prepare("INSERT INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system) VALUES(?,?,?,?,0,1,0)").run("fund_candles","CANDLES","Candle Fund","unrestricted");
const splitPosted = await recordSplitDeposit(db, {
  actor,
  entryDate:today,
  description:"Sunday collection",
  depositAccountId:"acct_1010",
  amount:27000,
  splits:[
    { revenueAccountId:"acct_4000", fundId:"fund_general", amount:20000, description:"General envelopes" },
    { revenueAccountId:"acct_4010", fundId:"fund_building", amount:5000, description:"Building envelopes" },
    { revenueAccountId:"acct_4030", fundId:"fund_candles", amount:2000, description:"Candle box" }
  ],
  correlationId:"treasurer-split-test"
});
assert.equal(splitPosted.status, "posted");
assert.equal(splitPosted.totalDebits, 27000);
assert.equal(splitPosted.totalCredits, 27000);
const splitLines = db.sqlite.prepare("SELECT account_id,fund_id,description,debit_amount,credit_amount FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number").all(splitPosted.id).map((line) => ({ ...line }));
assert.deepEqual(splitLines, [
  { account_id:"acct_1010", fund_id:"fund_general", description:null, debit_amount:27000, credit_amount:0 },
  { account_id:"acct_4000", fund_id:"fund_general", description:"General envelopes", debit_amount:0, credit_amount:20000 },
  { account_id:"acct_4010", fund_id:"fund_building", description:"Building envelopes", debit_amount:0, credit_amount:5000 },
  { account_id:"acct_4030", fund_id:"fund_candles", description:"Candle box", debit_amount:0, credit_amount:2000 }
]);
console.log("PASS - recordSplitDeposit posts one cash debit and three fund-specific revenue credits");

const entriesBeforeRejectedSplit = db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_journal_entries").get().count;
await assert.rejects(() => recordSplitDeposit(db, {
  actor,
  entryDate:today,
  description:"Mismatched collection",
  depositAccountId:"acct_1010",
  amount:10000,
  splits:[
    { revenueAccountId:"acct_4000", fundId:"fund_general", amount:6000 },
    { revenueAccountId:"acct_4010", fundId:"fund_building", amount:3000 }
  ]
}), /must equal the total deposit amount/);
assert.equal(db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_journal_entries").get().count, entriesBeforeRejectedSplit);
console.log("PASS - a mismatched split is rejected before a journal draft is created");

db.sqlite.prepare("INSERT INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund,cash_flow_classification) VALUES('acct_1500','1500','Equipment','type_asset','debit',1,0,1,'investing')").run();
const expenseGift = await recordInKindGift(db, {
  actor,
  entryDate:today,
  itemDescription:"Liturgical vestments",
  donorName:"Anonymous parishioner",
  valuationBasis:"Comparable retail listing",
  debitAccountId:"acct_5100",
  fundId:"fund_general",
  amount:75000,
  correlationId:"in-kind-expense-test"
});
assert.equal(expenseGift.status, "posted");
assert.equal(expenseGift.totalDebits, 75000);
assert.equal(expenseGift.totalCredits, 75000);
assert.deepEqual(db.sqlite.prepare("SELECT account_id,fund_id,description,debit_amount,credit_amount FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number").all(expenseGift.id).map((line) => ({ ...line })), [
  { account_id:"acct_5100", fund_id:"fund_general", description:"Liturgical vestments", debit_amount:75000, credit_amount:0 },
  { account_id:"acct_4200", fund_id:"fund_general", description:"Comparable retail listing", debit_amount:0, credit_amount:75000 }
]);
const assetGift = await recordInKindGift(db, {
  actor,
  entryDate:today,
  itemDescription:"Donated organ",
  donorName:"",
  valuationBasis:"Independent appraisal",
  debitAccountId:"acct_1500",
  fundId:"fund_general",
  amount:200000,
  correlationId:"in-kind-asset-test"
});
assert.equal(db.sqlite.prepare("SELECT debit_amount FROM accounting_journal_lines WHERE journal_entry_id=? AND account_id='acct_1500'").get(assetGift.id).debit_amount, 200000);
const inKindActivities = await statementOfActivities(db, { actor, startDate:today, endDate:today });
assert.equal(inKindActivities.rows.find((row) => row.accountId === "acct_4200").amount, 275000);
assert.equal(inKindActivities.rows.find((row) => row.accountId === "acct_5100").amount, 75000);
assert.equal(inKindActivities.totals.changeInNetAssets, 247000);
console.log("PASS - expense and asset in-kind gifts post balanced entries and report separately on the Statement of Activities");

const entriesBeforeInvalidGift = db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_journal_entries").get().count;
await assert.rejects(() => recordInKindGift(db, { actor, entryDate:today, itemDescription:"", valuationBasis:"Appraisal", debitAccountId:"acct_5100", fundId:"fund_general", amount:1000 }), /description of what was received/);
await assert.rejects(() => recordInKindGift(db, { actor, entryDate:today, itemDescription:"Materials", valuationBasis:"", debitAccountId:"acct_5100", fundId:"fund_general", amount:1000 }), /value was determined/);
await assert.rejects(() => recordInKindGift(db, { actor, entryDate:today, itemDescription:"Cash-like gift", valuationBasis:"Face value", debitAccountId:"acct_1010", fundId:"fund_general", amount:1000 }), /cannot be posted to a cash or bank account/);
assert.equal(db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_journal_entries").get().count, entriesBeforeInvalidGift);
console.log("PASS - required compliance fields and the non-cash account boundary are enforced before draft creation");

const handler = read("src/handlers/accounting-ledger.js");
assert.match(handler, /path\s*===\s*['"]\/simple\/deposits['"]/);
assert.match(handler, /path\s*===\s*['"]\/simple\/split-deposits['"]/);
assert.match(handler, /path\s*===\s*['"]\/simple\/in-kind-gifts['"]/);
assert.match(handler, /let capability\s*=\s*request\.method\s*===\s*['"]GET['"]\s*\?\s*['"]accounting\.view['"]\s*:\s*['"]accounting\.journals\.create['"]/);
assert.match(handler, /recordSimpleDeposit\(ctx\.db,\s*\{\s*actor:\s*ctx\.actor,\s*\.\.\.data\s*\}\)/);
assert.match(handler, /recordSplitDeposit\(ctx\.db,\s*\{\s*actor:\s*ctx\.actor,\s*\.\.\.data\s*\}\)/);
assert.match(handler, /recordInKindGift\(ctx\.db,\s*\{\s*actor:\s*ctx\.actor,\s*\.\.\.data\s*\}\)/);
assert.doesNotMatch(handler, /accounting\.simple/);
console.log("PASS - the simple and split-deposit routes reuse accounting.journals.create");

const app = readParishDashboardSource();
const dashboard = read("public/parish/dashboard.html");
assert.match(app, /let accountingExperienceMode = 'treasurer'/);
assert.match(app, /sessionStorage\.setItem\('agapay\.accountingExperienceMode'/);
assert.match(dashboard, />Treasurer view<\/button>/);
assert.match(dashboard, />Accountant view<\/button>/);
assert.match(app, /function renderAccountingJournalEditor/);
assert.match(app, /accountingExperienceMode === 'treasurer' && accountingView === 'ledger'/);
assert.match(app, /newAccountingJournal\(\)/);
assert.match(app, /function accountingOverviewHero\(\)/);
assert.match(app, /if \(accountingExperienceMode === 'treasurer'\)\s+return `<section class="acct-command-hero">/);
assert.match(app, /pane\.innerHTML = `\$\{accountingOverviewHero\(\)\}<div class="acct-suite-stats">/);
assert.doesNotMatch(app, /renderAccountingTreasurerHome/);
const overviewHero = app.slice(app.indexOf("function accountingOverviewHero"), app.indexOf("function renderAccountingOverview"));
const treasurerHero = overviewHero.slice(0, overviewHero.lastIndexOf('return `<section class="acct-command-hero">'));
assert.match(treasurerHero, /Record Income/);
assert.match(treasurerHero, /Pay a Bill/);
assert.doesNotMatch(treasurerHero, /New journal|Manage funds|Reconcile|Run reports/);
assert.match(dashboard, /data-accounting-advanced-toggle/);
assert.equal((dashboard.match(/data-accounting-advanced(?:\s|>)/g) || []).length, 5);
assert.match(app, /button\.hidden = isTreasurer && !accountingAdvancedNavExpanded/);
assert.match(app, /advancedToggle\.hidden = !isTreasurer/);
assert.match(app, /function toggleAccountingAdvancedNav\(\)/);
assert.doesNotMatch(app, /accountingExperienceMode === 'treasurer' && \[[^\]]+\]\.includes\(accountingView\)/);
console.log("PASS - Treasurer view defaults to six routine modules plus Advanced, while Accountant view keeps all modules reachable");

const expectedLabels = {
  acct_4000:"Stewardship & Tithes",
  acct_4010:"General Donations",
  acct_4030:"Candle Offerings",
  acct_4040:"Commemorations",
  acct_4300:"Bookstore Sales"
};
for (const [accountId, label] of Object.entries(expectedLabels)) {
  assert.match(app, new RegExp(`${accountId}:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
}
assert.match(app, /ACCOUNTING_SIMPLE_REVENUE_LABELS\[account\.id\] \|\| account\.name/);
console.log("PASS - seeded and custom revenue accounts have the required plain-language labels");

assert.match(app, />Split this deposit across funds<\/button>/);
assert.match(app, /accountingApi\(endpoint\)/);
assert.match(app, /'\/simple\/split-deposits'/);
assert.match(app, /function updateAccountingSplitDepositBalance/);
assert.match(app, /form\.querySelector\('\[data-income-submit\]'\)\.disabled = !balanced/);
assert.doesNotMatch(app, /Switch to Accountant view and enter a custom journal entry/);
console.log("PASS - Treasurer income entry supports balanced multi-fund allocations without changing the single-deposit endpoint");

assert.match(app, />Record a Non-Cash Gift</);
assert.match(app, /function accountingInKindGiftForm/);
assert.match(app, /name="itemDescription"[^>]*required/);
assert.match(app, /name="valuationBasis"[^>]*required/);
assert.match(app, /Processional cross, vehicle, building materials, or donated services/);
assert.doesNotMatch(app, /placeholder="Organ,/);
assert.match(app, /accountingApi\('\/simple\/in-kind-gifts'\)/);
assert.match(app, /\['asset',\s*'expense'\]\.includes\(account\.category\)/);
assert.doesNotMatch(app.slice(app.indexOf("function accountingInKindGiftForm"), app.indexOf("function accountingOverviewHero")), /depositAccountId|bankAccounts/);
console.log("PASS - Treasurer view exposes a separate non-cash gift form with required description and valuation fields");

const simpleFlow = app.slice(app.indexOf("function accountingSimpleIncomeForm"), app.indexOf("function accountingSimpleActivityFeed"));
const billFlow = app.slice(app.indexOf("function showAccountingBillForm"), app.indexOf("async function createAccountingBill"));
assert.doesNotMatch(simpleFlow, /\bdebit\b|\bcredit\b/i);
assert.doesNotMatch(billFlow, /\bdebit\b|\bcredit\b/i);
assert.match(simpleFlow, /Where did the money go\?/);
assert.match(simpleFlow, /What kind of income was this\?/);
assert.match(simpleFlow, /Which fund\?/);
console.log("PASS - the Record Income and Pay a Bill forms expose no debit or credit vocabulary");

console.log("accounting-treasurer-mode-tests.mjs OK");
