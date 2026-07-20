import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditReadiness,
  auditTrailCsv,
  closePacketHtml,
  completeCloseSession,
  createAdjustment,
  createAdjustmentTemplate,
  createCloseSession,
  createLegalHold,
  executeYearEndClose,
  generateAccountantExport,
  getRetentionSettings,
  initializeLedger,
  postAdjustment,
  previewYearEndClose,
  releaseLegalHold,
  reopenCloseSession,
  updateRetentionSettings,
  validateCloseSession,
  waiveCloseCheck,
} from "../src/accounting/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function database() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (query) => ({
    parameters: [],
    bind(...parameters) { this.parameters = parameters; return this; },
    async first() { return sqlite.prepare(query).get(...this.parameters) || null; },
    async all() { return { results: sqlite.prepare(query).all(...this.parameters) }; },
    async run() { const result = sqlite.prepare(query).run(...this.parameters); return { meta: { changes: result.changes } }; },
  });
  return { sqlite, db: { prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } } };
}
const actor = { id: "treasurer_3d", type: "platform_user", capabilities: [
  "accounting.configure", "accounting.view", "accounting.close.view", "accounting.close.create",
  "accounting.close.validate", "accounting.close.adjust", "accounting.close.review",
  "accounting.close.approve", "accounting.close.complete", "accounting.close.reopen",
  "accounting.year_end.view", "accounting.year_end.execute", "accounting.accountant_exports.generate",
  "accounting.audit_exports.generate",
  "accounting.retention.manage", "accounting.legal_hold.manage",
] };
async function ready(date = "2026-07-20T00:00:00Z") {
  const harness = database();
  for (const file of ["0001_accounting_database_foundation.sql", "0002_core_ledger.sql", "0003_phase2a_setup_configuration.sql", "0005_phase2c_reporting_indexes.sql"])
    harness.sqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
  await initializeLedger(harness.db, { actor, date: new Date(date) });
  for (const file of ["0006_phase2d_give_stripe_integration.sql", "0007_phase2e_bank_reconciliation.sql", "0008_phase3a_accounts_payable.sql", "0009_phase3b_budgeting.sql", "0010_phase3c_commerce_accounting.sql", "0011_phase3d_closing_and_audit.sql"])
    harness.sqlite.exec(readFileSync(path.join(root, "accounting-migrations", file), "utf8"));
  return harness;
}

{
  const { sqlite, db } = await ready();
  const session = await createCloseSession(db, { actor, entitlementTier: "mission", closeType: "month_end", fiscalYearId: "fy_2026", accountingPeriodId: "period_2026_7" });
  assert.equal(session.status, "draft");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_close_checks WHERE close_session_id=?").get(session.id).count, 6);
  const adjustment = await createAdjustment(db, { actor, entitlementTier: "mission", input: { closeSessionId: session.id, adjustmentType: "accrual", effectiveDate: "2026-07-31", reason: "Accrue July utility", supportingMemo: "Invoice expected in August", lines: [{ accountId: "acct_5300", fundId: "fund_general", debitAmount: 5000 }, { accountId: "acct_2000", fundId: "fund_general", creditAmount: 5000 }] } });
  assert.equal((await postAdjustment(db, { actor, entitlementTier: "mission", adjustmentId: adjustment.id, expectedVersion: 1 })).status, "posted");
  assert.equal((await createAdjustmentTemplate(db, { actor, entitlementTier: "mission", input: { name: "Monthly insurance", frequency: "monthly", lines: [{ accountId: "acct_5500", fundId: "fund_general", debitAmount: 100 }, { accountId: "acct_1100", fundId: "fund_general", creditAmount: 100 }] } })).autoPosts, false);
  const validated = await validateCloseSession(db, { actor, entitlementTier: "mission", closeSessionId: session.id, expectedVersion: 1 });
  assert.equal(validated.status, "ready_for_review");
  assert.equal(validated.checks.some(check => check.category === "Commerce"), false);
  const warning = validated.checks.find(check => check.status === "warning");
  if (warning) assert.equal((await waiveCloseCheck(db, { actor, entitlementTier: "mission", closeSessionId: session.id, checkId: warning.id, expectedVersion: warning.version, reason: "Reviewed for close" })).status, "waived");
  const completed = await completeCloseSession(db, { actor, entitlementTier: "mission", closeSessionId: session.id, expectedVersion: validated.version });
  assert.equal(completed.status, "completed");
  assert.equal(sqlite.prepare("SELECT status FROM accounting_periods WHERE id='period_2026_7'").get().status, "locked");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_close_snapshots WHERE close_session_id=?").get(session.id).count, 1);
  assert.match(await closePacketHtml(db, { actor, entitlementTier: "mission", closeSessionId: session.id }), /Print close packet/);
  await assert.rejects(() => createAdjustment(db, { actor, entitlementTier: "mission", input: { adjustmentType: "other", effectiveDate: "2026-07-31", reason: "Late", supportingMemo: "Late", lines: [{ accountId: "acct_5300", fundId: "fund_general", debitAmount: 1 }, { accountId: "acct_2000", fundId: "fund_general", creditAmount: 1 }] } }), /period/i);
  const reopened = await reopenCloseSession(db, { actor, entitlementTier: "mission", closeSessionId: session.id, expectedVersion: completed.version, reason: "Accountant requested correction" });
  assert.equal(reopened.status, "reopened");
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM accounting_close_snapshots WHERE close_session_id=?").get(session.id).count, 1);
}

{
  const { sqlite, db } = await ready();
  const capabilities = [...actor.capabilities, "accounting.journals.create", "accounting.journals.post"];
  const { createJournalDraft, postJournalEntry } = await import("../src/accounting/index.js");
  const draft = await createJournalDraft(db, { actor: { ...actor, capabilities }, entryDate: "2026-07-20", description: "Annual activity", lines: [{ accountId: "acct_1100", fundId: "fund_general", debitAmount: 10000 }, { accountId: "acct_4000", fundId: "fund_general", creditAmount: 10000 }] });
  await postJournalEntry(db, { actor: { ...actor, capabilities }, journalEntryId: draft.id, idempotencyKey: "phase3d:annual-activity", requestHash: "annual-activity", expectedVersion: 1 });
  sqlite.prepare("UPDATE accounting_periods SET status='locked' WHERE fiscal_year_id='fy_2026' AND period_number<>12").run();
  sqlite.prepare("UPDATE accounting_periods SET status='open' WHERE fiscal_year_id='fy_2026' AND period_number=12").run();
  const session = await createCloseSession(db, { actor, entitlementTier: "parish", closeType: "year_end", fiscalYearId: "fy_2026" });
  const preview = await previewYearEndClose(db, { actor, entitlementTier: "parish", fiscalYearId: "fy_2026" });
  assert.equal(preview.ready, true); assert.equal(preview.changeInNetAssets, 10000); assert.equal(preview.lines.length, 2);
  const validated = await validateCloseSession(db, { actor, entitlementTier: "parish", closeSessionId: session.id, expectedVersion: 1 });
  assert.equal(validated.checks.some(check => check.category === "Commerce"), true);
  const closed = await executeYearEndClose(db, { actor, entitlementTier: "parish", closeSessionId: session.id, expectedVersion: validated.version });
  assert.equal(closed.status, "completed"); assert.equal(closed.unrestrictedChange, 10000);
  assert.equal(sqlite.prepare("SELECT SUM(l.credit_amount-l.debit_amount) balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id WHERE l.account_id='acct_4000' AND e.status='posted'").get().balance, 0);
  const handoff = await generateAccountantExport(db, { actor, entitlementTier: "parish", fiscalYearId: "fy_2026", closeSessionId: session.id });
  assert.equal(handoff.status, "completed"); assert.equal(handoff.manifest.includedModules.includes("commerce"), true); assert.ok(Object.keys(handoff.manifest.fileHashes).length >= 14);
  assert.deepEqual((await generateAccountantExport(db, { actor, entitlementTier: "parish", fiscalYearId: "fy_2026", closeSessionId: session.id })).id, handoff.id);
  const readiness = await auditReadiness(db, { actor, entitlementTier: "parish", fiscalYearId: "fy_2026" });
  assert.match(readiness.disclaimer, /do not constitute an audit opinion/); assert.ok(readiness.advancedModules);
  assert.match(await auditTrailCsv(db, { actor, entitlementTier: "mission", startDate: "2026-01-01", endDate: "2026-12-31" }), /event_type/);
  const retention = await getRetentionSettings(db, { actor, entitlementTier: "mission" });
  assert.equal((await updateRetentionSettings(db, { actor, entitlementTier: "mission", expectedVersion: retention.version, patch: { accountingRecordsRetentionYears: 10 } })).accountingRecordsRetentionYears, 10);
  const hold = await createLegalHold(db, { actor, entitlementTier: "mission", entityType: "fiscal_year", entityId: "fy_2026", reason: "External review" });
  assert.equal((await releaseLegalHold(db, { actor, entitlementTier: "mission", legalHoldId: hold.id, expectedVersion: 1 })).status, "released");
  await assert.rejects(() => createCloseSession(db, { actor, entitlementTier: "none", closeType: "month_end", fiscalYearId: "fy_2026", accountingPeriodId: "period_2026_12" }), /Mission or Parish/);
}

console.log("PASS - Phase 3D close workflows, adjustments, year-end net-asset close, immutable snapshots, accountant exports, audit readiness, retention, legal holds, and tier behavior");
