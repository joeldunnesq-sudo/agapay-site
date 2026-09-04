#!/usr/bin/env node
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import { readAdminAppSource } from './lib/admin-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CAPABILITY_CATALOG, ROLE_TEMPLATES } from "../src/lib/authorization.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const worker=`${read("src/worker.js")}\n${read("src/routes/accounting.js")}`,governance=read("src/handlers/accounting-governance.js"),admin=read("src/handlers/admin.js");
const parishApp=readParishDashboardSource(),parishHtml=read("public/parish/dashboard.html"),adminApp=readAdminAppSource(),adminHtml=read("public/admin.html");
const governanceBackfill=read("migrations/0062_accounting_governance_capability_backfill.sql");
const has=(source,needles,label)=>needles.forEach(needle=>assert.ok(source.includes(needle),`${label} must include ${needle}`));
const capabilities=["accounting.integrity.view","accounting.integrity.scan","accounting.integrity.protect","accounting.recovery.verify"];
for(const capability of capabilities)assert.ok(CAPABILITY_CATALOG.includes(capability),`${capability} must be registered`);
assert.ok(ROLE_TEMPLATES.treasurer.includes("accounting.integrity.view"),"treasurer must receive integrity view");
assert.ok(ROLE_TEMPLATES.bookkeeper.includes("accounting.integrity.view"),"bookkeeper must receive integrity view");
assert.deepEqual(Object.entries(ROLE_TEMPLATES).filter(([,grants])=>grants.includes("accounting.integrity.view")).map(([role])=>role).sort(),["bookkeeper","treasurer"],"integrity view must be limited to treasurer and bookkeeper");
for(const [role,grants] of Object.entries(ROLE_TEMPLATES))for(const capability of capabilities.slice(1))assert.ok(!grants.includes(capability),`${role} must not receive operator capability ${capability}`);
assert.deepEqual(ROLE_TEMPLATES.platform_admin,[],"platform_admin must remain empty");
has(worker,["import { handleAccountingGovernance }","actions.handleAccountingGovernance"],"worker");
assert.ok(worker.indexOf("actions.handleAccountingGovernance")<worker.indexOf("actions.handleAccountingLedger"),"governance must dispatch before the ledger fallback");
has(governance,["/governance/retention","accounting.retention.manage","/governance/legal-holds","accounting.legal_hold.manage","/governance/health","accounting.integrity.view","updateRetentionSettings","releaseLegalHold","accounting_legal_holds"],"governance handler");
has(admin,["/api/admin/accounting/targets","/api/admin/accounting/health","/api/admin/accounting/integrity-scan","/api/admin/accounting/protective-state","/api/admin/accounting/protective-state/release","/api/admin/accounting/recovery-verification","/api/admin/accounting/integrity-scans","/api/admin/accounting/recovery-verifications","requireAdminContext","ADMIN_ACCOUNTING_ACTOR","PROTECTIVE_STATES.has(body.state)","status:422","recordAuditEvent","internalCanary","accounting_entities","resolved.entity.subscriptionTier"],"admin accounting handler");
has(parishHtml,["data-accounting-view=\"governance\"","setAccountingView('governance')"],"parish Governance rail");
has(parishApp,["renderAccountingGovernance","saveAccountingRetention","createAccountingLegalHold","releaseAccountingLegalHold","acct-governance-disclaimer"],"parish governance UI");
has(adminHtml,["nav-accountingops","tab-accountingops","accountingOpsParish","Scan now","Type parish ID to confirm","Recovery evidence verification"],"admin accounting operations console");
has(adminApp,["adminAccountingTargets","loadAdminAccountingTargets","Internal monitoring fixtures","selectedAdminAccountingTarget","synthetic operational data","loadAdminAccountingOperations","runAdminIntegrityScan","changeAdminProtectiveState","confirmation!==parishId","verifyAdminRecoveryEvidence"],"admin accounting operations UI");

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(read("migrations/0020_platform_identity.sql"));
sqlite.exec(read("migrations/0037_accounting_staff_profiles.sql"));
for(const role of ["treasurer","bookkeeper","rector"]){
  sqlite.prepare("INSERT INTO platform_users(id,email) VALUES(?1,?2)").run(`user-${role}`,`${role}@example.test`);
  sqlite.prepare("INSERT INTO parish_memberships(id,user_id,parish_id,role_template,status) VALUES(?1,?2,'parish-a',?3,'active')").run(`membership-${role}`,`user-${role}`,role);
  sqlite.prepare("INSERT INTO accounting_staff_profiles(id,parish_id,display_name,role_template,capabilities_json,pin_record,created_by_actor_type) VALUES(?1,'parish-a',?2,?3,'[\"accounting.view\"]','{}','test')").run(`staff-${role}`,role,role);
}
sqlite.exec(governanceBackfill);
sqlite.exec(governanceBackfill);
for(const role of ["treasurer","bookkeeper"]){
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM membership_capabilities WHERE membership_id=?1 AND capability='accounting.integrity.view'").get(`membership-${role}`).count,1,`${role} membership must receive one integrity-view grant`);
  const grants=JSON.parse(sqlite.prepare("SELECT capabilities_json FROM accounting_staff_profiles WHERE id=?1").get(`staff-${role}`).capabilities_json);
  assert.equal(grants.filter(grant=>grant==="accounting.integrity.view").length,1,`${role} staff profile must receive one integrity-view grant`);
}
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM membership_capabilities WHERE membership_id='membership-rector' AND capability='accounting.integrity.view'").get().count,0,"rector membership must not receive integrity-view");
assert.deepEqual(JSON.parse(sqlite.prepare("SELECT capabilities_json FROM accounting_staff_profiles WHERE id='staff-rector'").get().capabilities_json),["accounting.view"],"rector staff profile must remain unchanged");
console.log("Accounting Phase J governance and operations checks passed.");
