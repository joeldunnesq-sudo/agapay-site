import assert from "node:assert/strict";
import { createD1DatabaseFacade } from "../src/accounting/index.js";
import { handleAccountingLedger } from "../src/handlers/accounting-ledger.js";
const calls=[];const adapter={async execute(_id,sql,params){calls.push({sql,params});return[{results:sql.startsWith("SELECT")?[{id:"entry_1"}]:[],meta:{changes:1}}]},async batch(_id,statements){calls.push({statements});return statements.map(()=>({meta:{changes:1}}));}};
const db=createD1DatabaseFacade(adapter,"provider-secret");assert.deepEqual(await db.prepare("SELECT id FROM entries WHERE id=?").bind("entry_1").first(),{id:"entry_1"});await db.batch([db.prepare("UPDATE entries SET id=?").bind("entry_2")]);assert.equal(calls.some(call=>call.statements?.[0]?.params?.[0]==="entry_2"),true);
const unauthorized=await handleAccountingLedger(new Request("https://agapay.app/api/parish/dashboard/parish-a/accounting/journals"),{},"parish-a");assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get("Cache-Control"),"private, no-store");assert.equal(JSON.stringify(await unauthorized.json()).includes("provider"),false);
console.log("PASS - Phase 2B.2 D1 facade, authentication denial, private caching, and provider secrecy");
