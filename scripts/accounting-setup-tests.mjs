import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAccountingSetupOverview, getAccountingSettings, initializeAccountingSetup, updateAccountingSettings } from "../src/accounting/index.js";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"..");
function database(){const sqlite=new DatabaseSync(":memory:");for(const file of ["0001_accounting_database_foundation.sql","0002_core_ledger.sql","0003_phase2a_setup_configuration.sql"])sqlite.exec(readFileSync(path.join(root,"accounting-migrations",file),"utf8"));const prepare=(sql)=>({_params:[],bind(...params){this._params=params;return this;},async first(){return sqlite.prepare(sql).get(...this._params)||null;},async all(){return {results:sqlite.prepare(sql).all(...this._params)};},async run(){const info=sqlite.prepare(sql).run(...this._params);return {success:true,meta:{changes:info.changes}};}});return{sqlite,prepare,async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};}
const viewer={id:"rector",capabilities:["accounting.view"]};
const admin={id:"rector",type:"platform_user",capabilities:["accounting.view","accounting.configure"]};

const db=database();
const initialized=await initializeAccountingSetup(db,{actor:admin,date:new Date("2026-07-20T12:00:00Z")});
assert.equal(initialized.initialization.operational,true);
assert.equal(initialized.settings.baseCurrency,"USD");
const missionOverview=await getAccountingSetupOverview(db,{actor:viewer,entitlementTier:"core"});
assert.equal(missionOverview.entitlement.coreAccountingIncluded,true);
assert.equal(missionOverview.entitlement.advancedOperationsIncluded,false);
assert.equal("databaseIdentifier" in missionOverview,false);
assert.equal(missionOverview.activeAccountCount>0,true);
assert.equal(missionOverview.activeFundCount,1);
const parishOverview=await getAccountingSetupOverview(db,{actor:viewer,entitlementTier:"advanced_operations"});
assert.equal(parishOverview.entitlement.coreAccountingIncluded,true);
assert.equal(parishOverview.entitlement.advancedOperationsIncluded,true);
const before=await getAccountingSettings(db,{actor:viewer});
const after=await updateAccountingSettings(db,{actor:admin,expectedVersion:before.version,patch:{fiscalYearStartMonth:7,openingBalancesDisposition:"deferred"}});
assert.equal(after.fiscalYearStartMonth,7);
assert.equal(after.openingBalancesDisposition,"deferred");
await assert.rejects(()=>updateAccountingSettings(db,{actor:admin,expectedVersion:before.version,patch:{baseCurrency:"USD"}}),/Reload/);
await assert.rejects(()=>getAccountingSettings(db,{actor:{id:"member",capabilities:[]}}),/capability/);
console.log("PASS - Phase 2A shared-tier entitlement, setup overview, settings, safety, and concurrency");
