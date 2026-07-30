import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeLedger, recordSimpleDeposit } from "../src/accounting/index.js";

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

const handler = read("src/handlers/accounting-ledger.js");
assert.match(handler, /path==="\/simple\/deposits"/);
assert.match(handler, /let capability=request\.method==="GET"\?"accounting\.view":"accounting\.journals\.create"/);
assert.match(handler, /recordSimpleDeposit\(ctx\.db,\{actor:ctx\.actor,\.\.\.data\}\)/);
assert.doesNotMatch(handler, /accounting\.simple/);
console.log("PASS - the simple-deposit route reuses accounting.journals.create");

const app = read("public/parish/app.js");
const dashboard = read("public/parish/dashboard.html");
assert.match(app, /let accountingExperienceMode = 'treasurer'/);
assert.match(app, /sessionStorage\.setItem\('agapay\.accountingExperienceMode'/);
assert.match(dashboard, />Treasurer view<\/button>/);
assert.match(dashboard, />Accountant view<\/button>/);
assert.match(app, /function renderAccountingJournalEditor/);
assert.match(app, /accountingExperienceMode === 'treasurer' && accountingView === 'ledger'/);
assert.match(app, /newAccountingJournal\(\)/);
console.log("PASS - Treasurer view is the session default and Accountant view keeps the journal editor reachable");

const expectedLabels = {
  acct_4000:"Stewardship & Tithes",
  acct_4010:"General Donations",
  acct_4030:"Candle Offerings",
  acct_4040:"Commemorations",
  acct_4300:"Bookstore Sales"
};
for (const [accountId, label] of Object.entries(expectedLabels)) {
  assert.match(app, new RegExp(`${accountId}:'${label.replace(/[&]/g, "\\&")}'`));
}
assert.match(app, /ACCOUNTING_SIMPLE_REVENUE_LABELS\[account\.id\] \|\| account\.name/);
console.log("PASS - seeded and custom revenue accounts have the required plain-language labels");

const simpleFlow = app.slice(app.indexOf("function accountingSimpleIncomeForm"), app.indexOf("function accountingSimpleActivityFeed"));
const billFlow = app.slice(app.indexOf("function showAccountingBillForm"), app.indexOf("async function createAccountingBill"));
assert.doesNotMatch(simpleFlow, /\bdebit\b|\bcredit\b/i);
assert.doesNotMatch(billFlow, /\bdebit\b|\bcredit\b/i);
assert.match(simpleFlow, /Where did the money go\?/);
assert.match(simpleFlow, /What kind of income was this\?/);
assert.match(simpleFlow, /Which fund\?/);
console.log("PASS - the Record Income and Pay a Bill forms expose no debit or credit vocabulary");

console.log("accounting-treasurer-mode-tests.mjs OK");
