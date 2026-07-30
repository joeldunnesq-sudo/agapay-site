#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CAPABILITY_CATALOG, ROLE_TEMPLATES } from "../src/lib/authorization.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const worker=read("src/worker.js"),governance=read("src/handlers/accounting-governance.js"),admin=read("src/handlers/admin.js");
const parishApp=read("public/parish/app.js"),parishHtml=read("public/parish/dashboard.html"),adminApp=read("public/admin/app.js"),adminHtml=read("public/admin.html");
const has=(source,needles,label)=>needles.forEach(needle=>assert.ok(source.includes(needle),`${label} must include ${needle}`));
const capabilities=["accounting.integrity.view","accounting.integrity.scan","accounting.integrity.protect","accounting.recovery.verify"];
for(const capability of capabilities)assert.ok(CAPABILITY_CATALOG.includes(capability),`${capability} must be registered`);
assert.ok(ROLE_TEMPLATES.treasurer.includes("accounting.integrity.view"),"treasurer must receive integrity view");
assert.ok(ROLE_TEMPLATES.bookkeeper.includes("accounting.integrity.view"),"bookkeeper must receive integrity view");
assert.deepEqual(Object.entries(ROLE_TEMPLATES).filter(([,grants])=>grants.includes("accounting.integrity.view")).map(([role])=>role).sort(),["bookkeeper","treasurer"],"integrity view must be limited to treasurer and bookkeeper");
for(const [role,grants] of Object.entries(ROLE_TEMPLATES))for(const capability of capabilities.slice(1))assert.ok(!grants.includes(capability),`${role} must not receive operator capability ${capability}`);
assert.deepEqual(ROLE_TEMPLATES.platform_admin,[],"platform_admin must remain empty");
has(worker,["import { handleAccountingGovernance }","handleAccountingGovernance(request, env, accountingParishId)"],"worker");
assert.ok(worker.indexOf("handleAccountingGovernance(request, env, accountingParishId)")<worker.indexOf("handleAccountingLedger(request, env, accountingParishId)"),"governance must dispatch before the ledger fallback");
has(governance,["/governance/retention","accounting.retention.manage","/governance/legal-holds","accounting.legal_hold.manage","/governance/health","accounting.integrity.view","updateRetentionSettings","releaseLegalHold","accounting_legal_holds"],"governance handler");
has(admin,["/api/admin/accounting/health","/api/admin/accounting/integrity-scan","/api/admin/accounting/protective-state","/api/admin/accounting/protective-state/release","/api/admin/accounting/recovery-verification","/api/admin/accounting/integrity-scans","/api/admin/accounting/recovery-verifications","requireAdminContext","ADMIN_ACCOUNTING_ACTOR","PROTECTIVE_STATES.has(body.state)","status:422","recordAuditEvent"],"admin accounting handler");
has(parishHtml,["data-accounting-view=\"governance\"","setAccountingView('governance')"],"parish Governance rail");
has(parishApp,["renderAccountingGovernance","saveAccountingRetention","createAccountingLegalHold","releaseAccountingLegalHold","acct-governance-disclaimer"],"parish governance UI");
has(adminHtml,["nav-accountingops","tab-accountingops","accountingOpsParish","Scan now","Type parish ID to confirm","Recovery evidence verification"],"admin accounting operations console");
has(adminApp,["loadAdminAccountingOperations","runAdminIntegrityScan","changeAdminProtectiveState","confirmation!==parishId","verifyAdminRecoveryEvidence"],"admin accounting operations UI");
console.log("Accounting Phase J governance and operations checks passed.");
