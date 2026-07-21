import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createAccountingStaffProfile, listAccountingStaffProfiles, requireAccountingStaffProfile, revokeAccountingStaffSession, updateAccountingStaffPin, verifyAccountingStaffPin } from "../src/lib/accounting-staff.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0037_accounting_staff_profiles.sql", import.meta.url), "utf8"));
const db = { prepare(sql) { return { params:[], bind(...params){ this.params=params; return this; }, async first(){ return sqlite.prepare(sql).get(...this.params) || null; }, async all(){ return { results:sqlite.prepare(sql).all(...this.params) }; }, async run(){ const result=sqlite.prepare(sql).run(...this.params); return { success:true, meta:{ changes:result.changes } }; } }; } };
const env = { AGAPAY_DB:db };
const grants = ["accounting.view","accounting.configure","accounting.journals.create"];

assert.equal(await createAccountingStaffProfile(env,{parishId:"parish-a",displayName:"",roleTemplate:"treasurer",capabilities:grants,pin:"123456",actorType:"test"}),null);
assert.equal(await createAccountingStaffProfile(env,{parishId:"parish-a",displayName:"Photini",roleTemplate:"treasurer",capabilities:grants,pin:"12345",actorType:"test"}),null);
const profile = await createAccountingStaffProfile(env,{parishId:"parish-a",displayName:"Photini Argyris",roleTemplate:"treasurer",capabilities:grants,pin:"123456",actorType:"legacy_parish_bootstrap"});
assert.equal(profile.displayName,"Photini Argyris");
assert.equal((await listAccountingStaffProfiles(env,"parish-a")).length,1);
assert.equal(await verifyAccountingStaffPin(env,{parishId:"parish-a",profileId:profile.id,pin:"999999"}),null);
const session = await verifyAccountingStaffPin(env,{parishId:"parish-a",profileId:profile.id,pin:"123456"});
assert.ok(session.token.startsWith("agp_acct"));
const request = new Request("https://agapay.app/api/test",{headers:{"X-AGAPAY-Accounting-Profile":profile.id,"X-AGAPAY-Accounting-Token":session.token}});
const actor = await requireAccountingStaffProfile(request,env,"parish-a","accounting.view");
assert.equal(actor.user.id,profile.id);
assert.equal(actor.actorType,"accounting_staff_profile");
assert.equal(await requireAccountingStaffProfile(request,env,"parish-a","ap.approve"),null);
assert.equal(await updateAccountingStaffPin(env,{parishId:"parish-a",profileId:profile.id,pin:"654321"}),true);
assert.ok(await verifyAccountingStaffPin(env,{parishId:"parish-a",profileId:profile.id,pin:"654321"}));
await revokeAccountingStaffSession(env,{parishId:"parish-a",profileId:profile.id});
assert.equal(await requireAccountingStaffProfile(request,env,"parish-a","accounting.view"),null);
console.log("PASS - named Accounting staff PIN sessions, capability checks, and revocation");
