import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountingHealthOverview,
  classifyIntegritySeverity,
  createAccountingJobEnvelope,
  initializeLedger,
  releaseProtectiveState,
  runIntegrityScan,
  validateJournalEntryForPosting,
  verifyRecoveryEvidence,
} from "../src/accounting/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function harness() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = query => ({ parameters: [], bind(...parameters) { this.parameters = parameters; return this; }, async first() { return sqlite.prepare(query).get(...this.parameters) || null; }, async all() { return { results: sqlite.prepare(query).all(...this.parameters) }; }, async run() { const result = sqlite.prepare(query).run(...this.parameters); return { meta: { changes: result.changes } }; } });
  return { sqlite, db: { prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } } };
}
const actor = { id: "integrity_admin", type: "platform_user", capabilities: ["accounting.configure", "accounting.view", "accounting.integrity.scan", "accounting.integrity.view", "accounting.integrity.protect", "accounting.recovery.verify"] };
async function ready() {
  const state = harness();
  for (const file of ["0001_accounting_database_foundation.sql", "0002_core_ledger.sql", "0003_phase2a_setup_configuration.sql", "0005_phase2c_reporting_indexes.sql"])
    state.sqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
  await initializeLedger(state.db, { actor, date: new Date("2026-07-20T00:00:00Z") });
  for (const file of ["0006_phase2d_give_stripe_integration.sql", "0007_phase2e_bank_reconciliation.sql", "0008_phase3a_accounts_payable.sql", "0009_phase3b_budgeting.sql", "0010_phase3c_commerce_accounting.sql", "0011_phase3d_closing_and_audit.sql", "0012_phase3e_production_hardening.sql"])
    state.sqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
  return state;
}

{
  const { db } = await ready();
  const scan = await runIntegrityScan(db, { actor, entitlementTier: "mission", scanType: "canary", scope: "full", correlationId: "phase3e-clean" });
  assert.equal(scan.status, "completed");
  const health = await accountingHealthOverview(db, { actor, entitlementTier: "mission" });
  assert.equal(health.status, "healthy"); assert.equal(health.protectiveState.state, "normal");
  assert.equal(health.findings.length, 0); assert.match(health.disclaimer, /not an audit/);
  const artifact = JSON.stringify({ parish: "fixture", schema: "3E", rows: 0 });
  const checksum = await (async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, "0")).join(""))(artifact);
  const recovery = await verifyRecoveryEvidence(db, { actor, entitlementTier: "mission", verificationType: "post_restore", artifactReference: "test-only/restore.json", artifactBody: artifact, manifest: { artifactChecksum: checksum }, correlationId: "phase3e-restore" });
  assert.equal(recovery.status, "verified"); assert.equal(recovery.productionMutated, false);
}

{
  const { sqlite, db } = await ready();
  sqlite.prepare("INSERT INTO accounting_journal_entries(id,entry_number,entry_date,posting_date,description,status,source_type,total_debits,total_credits,created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,posted_at,version) VALUES('corrupt_entry','JE-CORRUPT','2026-07-20','2026-07-20','Injected integrity fixture','draft','manual',100,50,'test','test','test','test',datetime('now'),1)").run();
  sqlite.prepare("INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount) VALUES('corrupt_line_1','corrupt_entry',1,'acct_1100','fund_general',100,0)").run();
  sqlite.prepare("INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount) VALUES('corrupt_line_2','corrupt_entry',2,'acct_4000','fund_general',0,50)").run();
  sqlite.prepare("UPDATE accounting_journal_entries SET status='posted' WHERE id='corrupt_entry'").run();
  const scan = await runIntegrityScan(db, { actor, entitlementTier: "parish", scanType: "manual", scope: "full", correlationId: "phase3e-corrupt" });
  assert.equal(scan.criticalFailures > 0, true);
  const health = await accountingHealthOverview(db, { actor, entitlementTier: "parish" });
  assert.equal(health.protectiveState.state, "posting_blocked");
  assert.equal(health.findings.some(item => item.code === "journal.unbalanced"), true);
  const draft = sqlite.prepare("SELECT id,version FROM accounting_journal_entries WHERE status='draft' LIMIT 1").get();
  if (draft) assert.equal((await validateJournalEntryForPosting(db, { journalEntryId: draft.id, expectedVersion: draft.version })).issues.includes("integrity_posting_blocked"), true);
  const released = await releaseProtectiveState(db, { actor, expectedVersion: health.protectiveState.version, reason: "Test fixture isolated; production evidence unchanged" });
  assert.equal(released.state, "normal");
}

{
  const { sqlite, db } = await ready();
  sqlite.prepare("INSERT INTO accounting_vendors(id,vendor_number,display_name,status,created_at,updated_at) VALUES('integrity_vendor','INTEGRITY','Integrity fixture','active',datetime('now'),datetime('now'))").run();
  const bill = sqlite.prepare("INSERT INTO accounting_bills(id,bill_number,vendor_id,bill_date,due_date,description,status,approval_status,payment_status,subtotal_amount,total_amount,amount_due,created_by_actor_type,created_by_actor_id) VALUES(?,?,?,?,?,'Integrity count fixture','draft','pending','unpaid',100,100,100,'test','test')");
  for (let index = 0; index < 30; index += 1) bill.run(`integrity_bill_${index}`, `INT-${index}`, "integrity_vendor", "2026-07-20", "2026-08-20");
  const failingScan = await runIntegrityScan(db, { actor, entitlementTier: "parish", scanType: "manual", scope: "modules", correlationId: "phase3e-count" });
  assert.equal(failingScan.status, "completed_with_warnings");
  const details = JSON.parse(sqlite.prepare("SELECT details_json FROM accounting_integrity_findings WHERE scan_id=? AND health_code='ap.bill_lines_mismatch'").get(failingScan.id).details_json);
  assert.equal(details.count, 30); assert.equal(details.samples.length, 25);
  const line = sqlite.prepare("INSERT INTO accounting_bill_lines(id,bill_id,line_number,description,account_id,fund_id,quantity,unit_amount,line_amount,tax_amount) VALUES(?,?,1,'Integrity count fixture','acct_5000','fund_general',1,100,100,0)");
  for (let index = 0; index < 30; index += 1) line.run(`integrity_bill_line_${index}`, `integrity_bill_${index}`);
  const cleanScan = await runIntegrityScan(db, { actor, entitlementTier: "parish", scanType: "manual", scope: "modules", correlationId: "phase3e-resolved" });
  assert.equal(cleanScan.status, "completed");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_integrity_findings WHERE resolved_at IS NULL").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_integrity_findings WHERE scan_id=? AND resolved_at IS NOT NULL").get(failingScan.id).count, 1);
}

{
  const phaseGSeed = readFileSync(path.join(root, "scripts", "accounting-phase-g-volume-seed.sql"), "utf8");
  assert.match(phaseGSeed, /INSERT OR IGNORE INTO accounting_bill_lines/);
  assert.doesNotMatch(phaseGSeed, /CASE WHEN n<30 THEN 'completed'/);
  assert.match(phaseGSeed, /AND NOT EXISTS\(SELECT 1 FROM accounting_reconciliation_snapshots/);
}

const job = createAccountingJobEnvelope({ type: "accounting.integrity.scan", parishId: "parish_fixture", payload: { scanType: "incremental", scope: "ledger" }, correlationId: "phase3e-job" });
assert.equal(job.primitive, "workflow"); assert.equal(job.maxAttempts, 3);
assert.equal(classifyIntegritySeverity([{ severity: "warning" }, { severity: "critical" }]), "critical");
const unauthorizedHarness = await ready();
await assert.rejects(() => runIntegrityScan(unauthorizedHarness.db, { actor, entitlementTier: "none", scanType: "manual", scope: "full" }), /Mission or Parish/);

console.log("PASS - Phase 3E integrity scanning, schema verification, protective posting, health visibility, recovery evidence, job resilience, and tier-safe hardening");
