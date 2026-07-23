import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecurringTransaction, initializeLedger, listRecurringTransactions, processDueRecurringTransactions, updateRecurringTransaction } from "../src/accounting/index.js";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),".."),sqlite=new DatabaseSync(":memory:");
for(const file of["0001_accounting_database_foundation.sql","0002_core_ledger.sql","0017_recurring_transactions.sql"])sqlite.exec(readFileSync(path.join(root,"accounting-migrations",file),"utf8"));
const prepare=(sql)=>({_params:[],bind(...params){this._params=params;return this;},async first(){return sqlite.prepare(sql).get(...this._params)||null;},async all(){return{results:sqlite.prepare(sql).all(...this._params)};},async run(){const info=sqlite.prepare(sql).run(...this._params);return{meta:{changes:info.changes}};}});
const db={prepare,async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};
const actor={id:"bookkeeper",type:"platform_user",capabilities:["accounting.configure","accounting.view","accounting.journals.create","accounting.journals.post"]};
await initializeLedger(db,{actor,date:new Date("2026-07-20T00:00:00Z")});

const schedule=await createRecurringTransaction(db,{actor,input:{name:"Monthly internet",payee:"Parish ISP",description:"Internet service",registerAccountId:"acct_1010",expenseAccountId:"acct_5830",fundId:"fund_general",amount:12900,frequency:"monthly",nextPostingDate:"2026-07-20"}});
assert.equal(schedule.status,"active");
assert.equal((await listRecurringTransactions(db,{actor})).length,1);
const runs=await processDueRecurringTransactions(db,{asOfDate:"2026-07-20",actor});
assert.equal(runs.length,1);
assert.equal(runs[0].status,"posted");
assert.equal(sqlite.prepare("SELECT status,total_debits,total_credits,source_type FROM accounting_journal_entries").get().source_type,"recurring_expense");
assert.equal(sqlite.prepare("SELECT next_posting_date,last_posted_date FROM accounting_recurring_transactions").get().next_posting_date,"2026-08-20");
assert.equal((await processDueRecurringTransactions(db,{asOfDate:"2026-07-20",actor})).length,0);
const current=(await listRecurringTransactions(db,{actor}))[0];
await updateRecurringTransaction(db,{actor,recurringId:current.id,expectedVersion:current.version,patch:{status:"paused"}});
assert.equal((await processDueRecurringTransactions(db,{asOfDate:"2026-08-20",actor})).length,0);
console.log("PASS - recurring expenses create, post idempotently, advance, and pause");
