import { AccountingDatabaseError, ValidationError } from "../errors.js";
import {
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
  validateLedgerFoundation,
} from "../ledger/service.js";
import {
  fundActivity,
  reportCsv,
  statementOfActivities,
  statementOfFinancialPosition,
  trialBalance,
} from "../reports/service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADJUSTMENT_TYPES = new Set([
  "accrual", "deferral", "prepaid_expense", "accrued_expense", "accrued_revenue",
  "reclassification", "correction", "fund_reclassification", "bank_adjustment",
  "inventory_adjustment", "accounts_payable_adjustment", "other",
]);
const CORE_CHECKS = Object.freeze([
  ["ledger.trial_balance", "Ledger", "Trial Balance balances", "critical", 1],
  ["ledger.integrity", "Ledger", "Ledger integrity is healthy", "critical", 1],
  ["journals.open_drafts", "Journals", "Open journal drafts reviewed", "warning", 0],
  ["bank.required_reconciliations", "Bank", "Required bank accounts reconciled", "error", 1],
  ["integrations.exceptions", "Integrations", "Integration exceptions reviewed", "warning", 0],
  ["reports.validation", "Reports", "Core financial reports validate", "critical", 1],
]);
const ADVANCED_CHECKS = Object.freeze([
  ["payables.review", "Payables", "Open and overdue payables reviewed", "warning", 0],
  ["budgets.review", "Budgets", "Budget-to-actual reviewed", "warning", 0],
  ["commerce.review", "Commerce", "Commerce, tax, and inventory exceptions reviewed", "warning", 0],
]);

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function text(value) { return String(value ?? "").trim(); }
async function first(db, sql, ...params) { return db.prepare(sql).bind(...params).first(); }
async function all(db, sql, ...params) { return (await db.prepare(sql).bind(...params).all()).results || []; }
async function run(db, sql, ...params) { return db.prepare(sql).bind(...params).run(); }
function capability(actor, name) {
  if (!actor?.id || !actor.capabilities?.includes(name))
    throw new AccountingDatabaseError("Accounting close capability is required.", { details: { capability: name } });
}
function entitled(tier) {
  if (!["mission", "parish"].includes(tier))
    throw new AccountingDatabaseError("Mission or Parish Accounting is required.");
}
function elevated(actor) {
  return { ...actor, capabilities: [...new Set([...(actor.capabilities || []), "accounting.journals.create", "accounting.journals.post", "accounting.journals.reverse", "accounting.view"])] };
}
async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((item) => item.toString(16).padStart(2, "0")).join("");
}
function closeDto(row) {
  return Object.freeze({
    id: row.id, closeType: row.close_type, fiscalYearId: row.fiscal_year_id,
    accountingPeriodId: row.accounting_period_id || "", status: row.status,
    initiatedBy: row.initiated_by_actor_id, reviewedBy: row.reviewed_by_actor_id || "",
    approvedBy: row.approved_by_actor_id || "", startedAt: row.started_at,
    lastValidatedAt: row.last_validated_at || "", completedAt: row.completed_at || "",
    reopenedAt: row.reopened_at || "", version: Number(row.version), correlationId: row.correlation_id || "",
  });
}
function checkDto(row) {
  return Object.freeze({
    id: row.id, code: row.check_code, category: row.category, label: row.label,
    description: row.description || "", origin: row.check_origin, status: row.status,
    severity: row.severity, blocking: Boolean(row.blocking), details: row.details_json ? JSON.parse(row.details_json) : {},
    resolutionNote: row.resolution_note || "", version: Number(row.version),
  });
}

export async function createCloseSession(db, { actor, entitlementTier, closeType = "month_end", fiscalYearId, accountingPeriodId = null, correlationId = "" }) {
  entitled(entitlementTier); capability(actor, "accounting.close.create");
  if (!["month_end", "quarter_end", "year_end", "special"].includes(closeType)) throw new ValidationError("Close type is invalid.");
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", fiscalYearId);
  if (!year) throw new ValidationError("Fiscal year was not found.");
  let period = null;
  if (closeType !== "year_end" || accountingPeriodId) {
    period = await first(db, "SELECT * FROM accounting_periods WHERE id=? AND fiscal_year_id=?", accountingPeriodId, fiscalYearId);
    if (!period) throw new ValidationError("Accounting period was not found in the fiscal year.");
  }
  const existing = period && await first(db, "SELECT * FROM accounting_close_sessions WHERE accounting_period_id=? AND close_type=? AND status NOT IN ('completed','voided','reopened')", period.id, closeType);
  if (existing) return closeDto(existing);
  const sessionId = id("close");
  await run(db, `INSERT INTO accounting_close_sessions(id,close_type,fiscal_year_id,accounting_period_id,initiated_by_actor_type,initiated_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?)`,
    sessionId, closeType, fiscalYearId, period?.id || null, actor.type || "platform_user", actor.id, correlationId || null);
  const definitions = entitlementTier === "parish" ? [...CORE_CHECKS, ...ADVANCED_CHECKS] : CORE_CHECKS;
  for (const [code, category, label, severity, blocking] of definitions)
    await run(db, `INSERT INTO accounting_close_checks(id,close_session_id,check_code,category,label,status,severity,blocking) VALUES(?,?,?,?,?,'pending',?,?)`, id("check"), sessionId, code, category, label, severity, blocking);
  return closeDto(await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", sessionId));
}

async function evaluateChecks(db, session, tier, actor) {
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", session.fiscal_year_id);
  const period = session.accounting_period_id ? await first(db, "SELECT * FROM accounting_periods WHERE id=?", session.accounting_period_id) : null;
  const startDate = period?.start_date || year.start_date, endDate = period?.end_date || year.end_date;
  const tb = await trialBalance(db, { actor: elevated(actor), startDate, endDate, includeZero: true });
  const ledger = await validateLedgerFoundation(db);
  const drafts = await first(db, "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('draft','pending') AND entry_date BETWEEN ? AND ?", startDate, endDate);
  const exceptions = await first(db, "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE status='exception' AND date(occurred_at) BETWEEN ? AND ?", startDate, endDate);
  const requiredRecon = await first(db, `SELECT COUNT(*) count FROM accounting_bank_accounts b WHERE b.is_active=1 AND NOT EXISTS(SELECT 1 FROM accounting_reconciliation_sessions r WHERE r.bank_account_id=b.id AND r.status='completed' AND r.statement_end_date>=?)`, endDate);
  const position = await statementOfFinancialPosition(db, { actor: elevated(actor), asOfDate: endDate });
  const activities = await statementOfActivities(db, { actor: elevated(actor), startDate, endDate });
  const results = new Map([
    ["ledger.trial_balance", tb.validation.status === "validated" ? ["passed", {}] : ["failed", { difference: tb.totals.difference }]],
    ["ledger.integrity", ledger.ok ? ["passed", {}] : ["failed", { reasonCodes: ledger.issues }]],
    ["journals.open_drafts", Number(drafts.count) ? ["warning", { count: Number(drafts.count) }] : ["passed", { count: 0 }]],
    ["bank.required_reconciliations", Number(requiredRecon.count) ? ["failed", { count: Number(requiredRecon.count) }] : ["passed", { count: 0 }]],
    ["integrations.exceptions", Number(exceptions.count) ? ["warning", { count: Number(exceptions.count) }] : ["passed", { count: 0 }]],
    ["reports.validation", position.validation.status === "validated" && activities.validation.status === "validated" ? ["passed", {}] : ["failed", { position: position.validation.status, activities: activities.validation.status }]],
  ]);
  if (tier === "parish") {
    const ap = await first(db, "SELECT COUNT(*) count FROM accounting_bills WHERE status IN ('draft','submitted','approved','posted','partially_paid') AND bill_date<=?", endDate);
    const budgets = await first(db, "SELECT COUNT(*) count FROM accounting_budgets WHERE fiscal_year_id=? AND status IN ('approved','locked')", session.fiscal_year_id);
    const commerce = await first(db, "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND (status NOT IN ('posted','ignored') OR exception_code IS NOT NULL) AND date(occurred_at)<=?", endDate);
    results.set("payables.review", Number(ap.count) ? ["warning", { openItems: Number(ap.count) }] : ["passed", { openItems: 0 }]);
    results.set("budgets.review", Number(budgets.count) ? ["passed", { officialBudgets: Number(budgets.count) }] : ["warning", { officialBudgets: 0 }]);
    results.set("commerce.review", Number(commerce.count) ? ["warning", { exceptions: Number(commerce.count) }] : ["passed", { exceptions: 0 }]);
  }
  return { startDate, endDate, tb, position, activities, results };
}

export async function validateCloseSession(db, { actor, entitlementTier, closeSessionId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.close.validate");
  const session = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", closeSessionId);
  if (!session || Number(session.version) !== Number(expectedVersion) || ["completed", "voided"].includes(session.status))
    throw new AccountingDatabaseError("Close session changed or cannot be validated.", { details: { conflict: true } });
  await run(db, "UPDATE accounting_close_sessions SET status='validating',version=version+1 WHERE id=? AND version=?", session.id, Number(expectedVersion));
  const evaluation = await evaluateChecks(db, session, entitlementTier, actor);
  for (const [code, [status, details]] of evaluation.results)
    await run(db, "UPDATE accounting_close_checks SET status=?,details_json=?,updated_at=datetime('now'),version=version+1 WHERE close_session_id=? AND check_code=?", status, JSON.stringify(details), session.id, code);
  const blockers = await first(db, "SELECT COUNT(*) count FROM accounting_close_checks WHERE close_session_id=? AND blocking=1 AND status='failed'", session.id);
  const status = Number(blockers.count) ? "blocked" : "ready_for_review";
  await run(db, "UPDATE accounting_close_sessions SET status=?,last_validated_at=?,version=version+1,updated_at=datetime('now') WHERE id=?", status, now(), session.id);
  return closeSessionDetail(db, { actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), "accounting.close.view"])] }, entitlementTier, closeSessionId });
}

export async function closeSessionDetail(db, { actor, entitlementTier, closeSessionId }) {
  entitled(entitlementTier); capability(actor, "accounting.close.view");
  const session = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", closeSessionId);
  if (!session) throw new ValidationError("Close session was not found.");
  const checks = (await all(db, "SELECT * FROM accounting_close_checks WHERE close_session_id=? ORDER BY category,check_code", closeSessionId)).map(checkDto);
  return Object.freeze({ ...closeDto(session), checks: Object.freeze(checks), summary: Object.freeze({ passed: checks.filter(x => x.status === "passed").length, warnings: checks.filter(x => ["warning", "waived"].includes(x.status)).length, failures: checks.filter(x => x.status === "failed").length, blockers: checks.filter(x => x.blocking && x.status === "failed").length }) });
}

export async function waiveCloseCheck(db, { actor, entitlementTier, closeSessionId, checkId, expectedVersion, reason }) {
  entitled(entitlementTier); capability(actor, "accounting.close.review");
  if (!text(reason)) throw new ValidationError("A waiver reason is required.");
  const check = await first(db, "SELECT * FROM accounting_close_checks WHERE id=? AND close_session_id=?", checkId, closeSessionId);
  if (!check || Number(check.version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Close check changed.", { details: { conflict: true } });
  if (check.blocking || !["warning", "pending"].includes(check.status)) throw new ValidationError("Critical or blocking checks cannot be waived.");
  const policy = await first(db, "SELECT * FROM accounting_close_policies WHERE id='primary'");
  if (!policy.allow_warning_waivers) throw new ValidationError("Warning waivers are disabled by close policy.");
  await run(db, `UPDATE accounting_close_checks SET status='waived',resolved_by_actor_type=?,resolved_by_actor_id=?,resolved_at=?,resolution_note=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`, actor.type || "platform_user", actor.id, now(), text(reason), check.id, Number(expectedVersion));
  return checkDto(await first(db, "SELECT * FROM accounting_close_checks WHERE id=?", check.id));
}

export async function reviewCloseSession(db, { actor, entitlementTier, closeSessionId, expectedVersion, action }) {
  entitled(entitlementTier); capability(actor, action === "approve" ? "accounting.close.approve" : "accounting.close.review");
  const current = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", closeSessionId);
  const allowed = action === "review" ? ["ready_for_review"] : ["reviewed", "ready_for_review"];
  if (!current || Number(current.version) !== Number(expectedVersion) || !allowed.includes(current.status)) throw new AccountingDatabaseError("Close session changed or is not reviewable.", { details: { conflict: true } });
  const policy = await first(db, "SELECT * FROM accounting_close_policies WHERE id='primary'");
  if (policy.require_separate_reviewer && current.initiated_by_actor_id === actor.id) throw new ValidationError("Close policy requires a separate reviewer.");
  const target = action === "approve" ? "approved" : "reviewed", prefix = action === "approve" ? "approved" : "reviewed";
  await run(db, `UPDATE accounting_close_sessions SET status=?,${prefix}_by_actor_type=?,${prefix}_by_actor_id=?,${prefix}_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`, target, actor.type || "platform_user", actor.id, now(), current.id, Number(expectedVersion));
  return closeDto(await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", current.id));
}

export async function createAdjustment(db, { actor, entitlementTier, input }) {
  entitled(entitlementTier); capability(actor, "accounting.close.adjust");
  if (!ADJUSTMENT_TYPES.has(input?.adjustmentType) || !DATE.test(input?.effectiveDate || "") || !text(input?.reason) || !text(input?.supportingMemo))
    throw new ValidationError("Adjustment type, effective date, reason, and supporting memo are required.");
  if (!Array.isArray(input.lines) || input.lines.length < 2) throw new ValidationError("At least two adjustment lines are required.");
  const effectivePeriod = await first(db, "SELECT id,status FROM accounting_periods WHERE ? BETWEEN start_date AND end_date", input.effectiveDate);
  if (!effectivePeriod || effectivePeriod.status !== "open") throw new ValidationError("Adjustment effective date must be in an open period.");
  const debit = input.lines.reduce((sum, line) => sum + Number(line.debitAmount || 0), 0), credit = input.lines.reduce((sum, line) => sum + Number(line.creditAmount || 0), 0);
  if (!debit || debit !== credit) throw new ValidationError("Adjustment must balance.");
  if (input.closeSessionId && !(await first(db, "SELECT id FROM accounting_close_sessions WHERE id=? AND status NOT IN ('completed','voided')", input.closeSessionId))) throw new ValidationError("Close session is not available for adjustments.");
  let reversalPeriod = null;
  if (input.autoReverse) {
    if (!DATE.test(input.reversalDate || "") || input.reversalDate <= input.effectiveDate) throw new ValidationError("Auto-reversal requires a future date.");
    reversalPeriod = await first(db, "SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status='open'", input.reversalDate);
    if (!reversalPeriod) throw new ValidationError("Auto-reversal requires a future open period.");
  }
  const adjustmentId = id("adjustment"), journal = await createJournalDraft(db, { actor: elevated(actor), entryDate: input.effectiveDate, description: input.description || `Adjustment · ${input.adjustmentType}`, sourceType: "close_adjustment", sourceId: adjustmentId, lines: input.lines, correlationId: input.correlationId || "" });
  await run(db, `INSERT INTO accounting_adjustments(id,close_session_id,journal_entry_id,adjustment_type,effective_date,reason,supporting_memo,auto_reverse,reversal_date,reversal_period_id,reversal_status,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, adjustmentId, input.closeSessionId || null, journal.id, input.adjustmentType, input.effectiveDate, text(input.reason), text(input.supportingMemo), Number(Boolean(input.autoReverse)), input.reversalDate || null, reversalPeriod?.id || null, input.autoReverse ? "scheduled" : null, actor.type || "platform_user", actor.id, input.correlationId || null);
  return adjustmentDto(await first(db, "SELECT * FROM accounting_adjustments WHERE id=?", adjustmentId));
}
function adjustmentDto(row) { return Object.freeze({ id: row.id, closeSessionId: row.close_session_id || "", journalEntryId: row.journal_entry_id, type: row.adjustment_type, effectiveDate: row.effective_date, reason: row.reason, supportingMemo: row.supporting_memo, status: row.status, autoReverse: Boolean(row.auto_reverse), reversalDate: row.reversal_date || "", reversalStatus: row.reversal_status || "", reversalJournalEntryId: row.reversal_journal_entry_id || "", version: Number(row.version) }); }

export async function postAdjustment(db, { actor, entitlementTier, adjustmentId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.close.adjust");
  const adjustment = await first(db, "SELECT * FROM accounting_adjustments WHERE id=?", adjustmentId);
  if (!adjustment || Number(adjustment.version) !== Number(expectedVersion) || adjustment.status !== "draft") {
    if (adjustment?.status === "posted") return adjustmentDto(adjustment);
    throw new AccountingDatabaseError("Adjustment changed or cannot be posted.", { details: { conflict: true } });
  }
  const posted = await postJournalEntry(db, { actor: elevated(actor), journalEntryId: adjustment.journal_entry_id, idempotencyKey: `adjustment:${adjustment.id}:post`, requestHash: await digest({ adjustmentId: adjustment.id, journalEntryId: adjustment.journal_entry_id }), expectedVersion: 1, correlationId: adjustment.correlation_id || "" });
  await run(db, "UPDATE accounting_adjustments SET status='posted',posted_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?", now(), adjustment.id, Number(expectedVersion));
  await run(db, "INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)", id("link"), posted.id, "close_adjustment", adjustment.id, "adjustment");
  return adjustmentDto(await first(db, "SELECT * FROM accounting_adjustments WHERE id=?", adjustment.id));
}

export async function runAutoReversal(db, { actor, entitlementTier, adjustmentId }) {
  entitled(entitlementTier); capability(actor, "accounting.close.adjust");
  const adjustment = await first(db, "SELECT * FROM accounting_adjustments WHERE id=?", adjustmentId);
  if (!adjustment || adjustment.status !== "posted" || !adjustment.auto_reverse) throw new ValidationError("Posted auto-reversing adjustment was not found.");
  if (adjustment.reversal_status === "completed") return adjustmentDto(adjustment);
  try {
    const reversal = await reverseJournalEntry(db, { actor: elevated(actor), journalEntryId: adjustment.journal_entry_id, entryDate: adjustment.reversal_date, reason: `Scheduled reversal of ${adjustment.id}`, idempotencyKey: `adjustment:${adjustment.id}:auto-reverse`, requestHash: await digest({ adjustmentId: adjustment.id, reversalDate: adjustment.reversal_date }), correlationId: adjustment.correlation_id || "" });
    await run(db, "UPDATE accounting_adjustments SET status='reversed',reversal_status='completed',reversal_journal_entry_id=?,reversed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?", reversal.id, now(), adjustment.id);
  } catch (error) {
    await run(db, "UPDATE accounting_adjustments SET reversal_status='exception',version=version+1,updated_at=datetime('now') WHERE id=?", adjustment.id);
    throw error;
  }
  return adjustmentDto(await first(db, "SELECT * FROM accounting_adjustments WHERE id=?", adjustment.id));
}

export async function createAdjustmentTemplate(db, { actor, entitlementTier, input }) {
  entitled(entitlementTier); capability(actor, "accounting.close.adjust");
  if (!text(input?.name) || !["monthly", "quarterly", "annually", "custom"].includes(input?.frequency) || !Array.isArray(input?.lines) || input.lines.length < 2) throw new ValidationError("A valid recurring adjustment template is required.");
  const templateId = id("adjustmenttemplate");
  await run(db, `INSERT INTO accounting_adjustment_templates(id,name,frequency,default_description,default_lines_json,next_run_date,end_date,auto_create_draft,auto_reverse,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`, templateId, text(input.name), input.frequency, text(input.description || input.name), JSON.stringify(input.lines), input.nextRunDate || null, input.endDate || null, 1, Number(Boolean(input.autoReverse)), actor.id);
  return Object.freeze({ id: templateId, name: text(input.name), frequency: input.frequency, autoPosts: false, version: 1 });
}

export async function completeCloseSession(db, { actor, entitlementTier, closeSessionId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.close.complete");
  const session = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", closeSessionId);
  if (session?.status === "completed") return closeDto(session);
  if (!session || Number(session.version) !== Number(expectedVersion) || !["ready_for_review", "reviewed", "approved"].includes(session.status)) throw new AccountingDatabaseError("Close session changed or is not completable.", { details: { conflict: true } });
  const blocking = await first(db, "SELECT COUNT(*) count FROM accounting_close_checks WHERE close_session_id=? AND blocking=1 AND status<>'passed'", session.id);
  if (Number(blocking.count)) throw new ValidationError("Critical close checks must pass before completion.");
  const period = await first(db, "SELECT * FROM accounting_periods WHERE id=?", session.accounting_period_id);
  const evaluation = await evaluateChecks(db, session, entitlementTier, actor);
  const checks = (await all(db, "SELECT check_code,status,severity,blocking,resolution_note FROM accounting_close_checks WHERE close_session_id=? ORDER BY check_code", session.id));
  const snapshotBody = { closeSessionId: session.id, closeType: session.close_type, period: period ? { id: period.id, startDate: period.start_date, endDate: period.end_date } : null, trialBalance: evaluation.tb, financialPosition: evaluation.position, activities: evaluation.activities, checks, completedBy: actor.id };
  const snapshotHash = await digest(snapshotBody), sequence = Number((await first(db, "SELECT COALESCE(MAX(sequence_number),0)+1 next FROM accounting_close_snapshots WHERE close_session_id=?", session.id)).next);
  await run(db, `INSERT INTO accounting_close_snapshots(id,close_session_id,sequence_number,snapshot_type,snapshot_json,snapshot_hash,created_by_actor_type,created_by_actor_id) VALUES(?,?,?,?,?,?,?,?)`, id("closesnapshot"), session.id, sequence, session.close_type, JSON.stringify(snapshotBody), snapshotHash, actor.type || "platform_user", actor.id);
  if (period) {
    await run(db, "UPDATE accounting_periods SET status='locked',closed_at=COALESCE(closed_at,?),locked_at=?,version=version+1,updated_at=datetime('now') WHERE id=?", now(), now(), period.id);
    await run(db, `INSERT INTO accounting_period_locks(id,accounting_period_id,lock_type,locked_by_actor_type,locked_by_actor_id,reason) VALUES(?,?,'hard_close',?,?,?)`, id("periodlock"), period.id, actor.type || "platform_user", actor.id, `Completed close ${session.id}`);
  }
  await run(db, "UPDATE accounting_close_sessions SET status='completed',completed_at=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?", now(), session.id, Number(expectedVersion));
  await run(db, "INSERT INTO accounting_ledger_events(id,event_type,actor_type,actor_id,correlation_id,metadata_json) VALUES(?,?,?,?,?,?)", id("event"), "close.period_completed", actor.type || "platform_user", actor.id, session.correlation_id || null, JSON.stringify({ closeSessionId: session.id, snapshotHash }));
  return closeDto(await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", session.id));
}

export async function reopenCloseSession(db, { actor, entitlementTier, closeSessionId, expectedVersion, reason }) {
  entitled(entitlementTier); capability(actor, "accounting.close.reopen");
  if (!text(reason)) throw new ValidationError("A reopening reason is required.");
  const session = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", closeSessionId);
  if (!session || Number(session.version) !== Number(expectedVersion) || session.status !== "completed") throw new AccountingDatabaseError("Completed close changed or cannot be reopened.", { details: { conflict: true } });
  if (session.close_type === "year_end") throw new ValidationError("Use the controlled fiscal-year reopening workflow for year-end closes.");
  await run(db, "UPDATE accounting_period_locks SET unlocked_at=? WHERE accounting_period_id=? AND unlocked_at IS NULL", now(), session.accounting_period_id);
  await run(db, "UPDATE accounting_periods SET status='open',locked_at=NULL,version=version+1,updated_at=datetime('now') WHERE id=?", session.accounting_period_id);
  await run(db, "UPDATE accounting_close_sessions SET status='reopened',reopened_at=?,reopen_reason=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?", now(), text(reason), session.id, Number(expectedVersion));
  return closeDto(await first(db, "SELECT * FROM accounting_close_sessions WHERE id=?", session.id));
}

export async function previewYearEndClose(db, { actor, entitlementTier, fiscalYearId }) {
  entitled(entitlementTier); capability(actor, "accounting.year_end.view");
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", fiscalYearId);
  if (!year) throw new ValidationError("Fiscal year was not found.");
  const mapping = await first(db, "SELECT * FROM accounting_net_asset_mappings WHERE id='primary'");
  const activity = await all(db, `SELECT a.id account_id,a.account_number,a.name,t.category,f.id fund_id,f.restriction_type,SUM(l.debit_amount-l.credit_amount) raw_balance FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_account_types t ON t.id=a.account_type_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.status IN ('posted','reversed') AND COALESCE(e.posting_date,e.entry_date) BETWEEN ? AND ? AND t.category IN ('revenue','expense') GROUP BY a.id,f.id HAVING raw_balance<>0 ORDER BY f.code,t.sort_order,a.account_number`, year.start_date, year.end_date);
  const lines = [], changes = new Map(); let revenueTotal = 0, expenseTotal = 0;
  for (const row of activity) {
    const raw = Number(row.raw_balance);
    if (row.category === "revenue") { revenueTotal += -raw; lines.push({ accountId: row.account_id, fundId: row.fund_id, debitAmount: Math.max(-raw, 0), creditAmount: Math.max(raw, 0), description: `Close ${row.name}` }); }
    else { expenseTotal += raw; lines.push({ accountId: row.account_id, fundId: row.fund_id, debitAmount: Math.max(-raw, 0), creditAmount: Math.max(raw, 0), description: `Close ${row.name}` }); }
    changes.set(row.fund_id, (changes.get(row.fund_id) || { restrictionType: row.restriction_type, amount: 0 }));
    changes.get(row.fund_id).amount += row.category === "revenue" ? -raw : -raw;
  }
  let restrictedChange = 0, unrestrictedChange = 0;
  for (const [fundId, item] of [...changes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!item.amount) continue;
    const restricted = item.restrictionType.startsWith("donor_restricted"), accountId = restricted ? mapping?.restricted_net_assets_account_id : (item.restrictionType === "board_designated" && mapping?.board_designated_net_assets_account_id) || mapping?.unrestricted_net_assets_account_id;
    if (!accountId) throw new ValidationError("Required net-asset mapping is incomplete.");
    lines.push({ accountId, fundId, debitAmount: Math.max(-item.amount, 0), creditAmount: Math.max(item.amount, 0), description: restricted ? "Close to net assets with donor restrictions" : "Close to net assets without donor restrictions" });
    if (restricted) restrictedChange += item.amount; else unrestrictedChange += item.amount;
  }
  const debits = lines.reduce((sum, line) => sum + line.debitAmount, 0), credits = lines.reduce((sum, line) => sum + line.creditAmount, 0);
  const openPeriods = await first(db, "SELECT COUNT(*) count FROM accounting_periods WHERE fiscal_year_id=? AND status NOT IN ('closed','locked') AND end_date<>?", fiscalYearId, year.end_date);
  const closingPeriod = await first(db, "SELECT status FROM accounting_periods WHERE fiscal_year_id=? AND end_date=?", fiscalYearId, year.end_date);
  const prior = await first(db, "SELECT id FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'", fiscalYearId);
  const blockers = [];
  if (Number(openPeriods.count)) blockers.push("periods_not_closed");
  if (!closingPeriod || closingPeriod.status !== "open") blockers.push("closing_period_not_open");
  if (!mapping?.unrestricted_net_assets_account_id || !mapping?.restricted_net_assets_account_id) blockers.push("net_asset_mapping_missing");
  if (prior) blockers.push("prior_closing_entry_exists");
  if (debits !== credits) blockers.push("closing_entry_out_of_balance");
  return Object.freeze({ fiscalYearId, closingDate: year.end_date, method: mapping?.closing_method || "direct", revenueTotal, expenseTotal, changeInNetAssets: revenueTotal - expenseTotal, restrictedChange, unrestrictedChange, lines: Object.freeze(lines.map(Object.freeze)), blockers: Object.freeze(blockers), ready: blockers.length === 0 });
}

export async function executeYearEndClose(db, { actor, entitlementTier, closeSessionId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.year_end.execute");
  const session = await first(db, "SELECT * FROM accounting_close_sessions WHERE id=? AND close_type='year_end'", closeSessionId);
  if (!session || Number(session.version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Year-end close changed.", { details: { conflict: true } });
  const existing = await first(db, "SELECT * FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'", session.fiscal_year_id);
  if (existing) return yearCloseDto(existing);
  const preview = await previewYearEndClose(db, { actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), "accounting.year_end.view"])] }, entitlementTier, fiscalYearId: session.fiscal_year_id });
  if (!preview.ready) throw new ValidationError(`Year-end close is blocked: ${preview.blockers.join(", ")}`);
  const pre = await trialBalance(db, { actor: elevated(actor), startDate: "0001-01-01", endDate: preview.closingDate, includeZero: true });
  let posted = null;
  if (preview.lines.length) {
    const journal = await createJournalDraft(db, { actor: elevated(actor), entryDate: preview.closingDate, description: `Fiscal year close · ${session.fiscal_year_id}`, sourceType: "year_end_close", sourceId: session.fiscal_year_id, lines: preview.lines, correlationId: session.correlation_id || "" });
    posted = await postJournalEntry(db, { actor: elevated(actor), journalEntryId: journal.id, idempotencyKey: `year-end:${session.fiscal_year_id}:closing-entry`, requestHash: await digest(preview), expectedVersion: 1, correlationId: session.correlation_id || "" });
  }
  const post = await trialBalance(db, { actor: elevated(actor), startDate: "0001-01-01", endDate: preview.closingDate, includeZero: true });
  const temporaryNonzero = post.rows.filter(row => ["revenue", "expense"].includes(row.category) && (row.endingDebit || row.endingCredit));
  const status = post.totals.difference === 0 && temporaryNonzero.length === 0 ? "completed" : "failed";
  const closeId = id("yearclose");
  await run(db, `INSERT INTO accounting_fiscal_year_closes(id,fiscal_year_id,close_session_id,closing_date,closing_entry_id,status,pre_close_trial_balance_hash,post_close_trial_balance_hash,revenue_total,expense_total,change_in_net_assets,restricted_change,unrestricted_change,completed_by_actor_type,completed_by_actor_id,completed_at,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, closeId, session.fiscal_year_id, session.id, preview.closingDate, posted?.id || null, status, await digest(pre), await digest(post), preview.revenueTotal, preview.expenseTotal, preview.changeInNetAssets, preview.restrictedChange, preview.unrestrictedChange, actor.type || "platform_user", actor.id, status === "completed" ? now() : null, session.correlation_id || null);
  if (status !== "completed") throw new ValidationError("Post-close validation failed; the closing entry was preserved for controlled correction.");
  await run(db, "UPDATE accounting_fiscal_years SET status='closed',closed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?", now(), session.fiscal_year_id);
  await run(db, "UPDATE accounting_periods SET status='locked',closed_at=COALESCE(closed_at,?),locked_at=?,version=version+1,updated_at=datetime('now') WHERE fiscal_year_id=?", now(), now(), session.fiscal_year_id);
  await run(db, "UPDATE accounting_close_sessions SET status='completed',completed_at=?,version=version+1,updated_at=datetime('now') WHERE id=?", now(), session.id);
  return yearCloseDto(await first(db, "SELECT * FROM accounting_fiscal_year_closes WHERE id=?", closeId));
}
function yearCloseDto(row) { return Object.freeze({ id: row.id, fiscalYearId: row.fiscal_year_id, closeSessionId: row.close_session_id, closingDate: row.closing_date, closingEntryId: row.closing_entry_id || "", status: row.status, revenueTotal: Number(row.revenue_total), expenseTotal: Number(row.expense_total), changeInNetAssets: Number(row.change_in_net_assets), restrictedChange: Number(row.restricted_change), unrestrictedChange: Number(row.unrestricted_change), completedAt: row.completed_at || "", version: Number(row.version) }); }

export async function reopenYearEndClose(db, { actor, entitlementTier, fiscalYearId, expectedVersion, reason }) {
  entitled(entitlementTier); capability(actor, "accounting.close.reopen");
  if (!text(reason)) throw new ValidationError("A year-end reopening reason is required.");
  const close = await first(db, "SELECT * FROM accounting_fiscal_year_closes WHERE fiscal_year_id=? AND status='completed'", fiscalYearId);
  if (!close || Number(close.version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Fiscal-year close changed or cannot be reopened.", { details: { conflict: true } });
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", fiscalYearId);
  const later = await first(db, "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('posted','reversed') AND COALESCE(posting_date,entry_date)>?", year.end_date);
  if (Number(later.count)) throw new ValidationError("Later-period activity must be reviewed before reopening this fiscal year.");
  await run(db, "UPDATE accounting_period_locks SET unlocked_at=? WHERE accounting_period_id IN (SELECT id FROM accounting_periods WHERE fiscal_year_id=?) AND unlocked_at IS NULL", now(), fiscalYearId);
  await run(db, "UPDATE accounting_periods SET status=CASE WHEN end_date=? THEN 'open' ELSE 'closed' END,locked_at=NULL,version=version+1,updated_at=datetime('now') WHERE fiscal_year_id=?", year.end_date, fiscalYearId);
  await run(db, "UPDATE accounting_fiscal_years SET status='open',closed_at=NULL,version=version+1,updated_at=datetime('now') WHERE id=?", fiscalYearId);
  let reversal = null;
  if (close.closing_entry_id) reversal = await reverseJournalEntry(db, { actor: elevated(actor), journalEntryId: close.closing_entry_id, entryDate: year.end_date, reason: text(reason), idempotencyKey: `year-end:${fiscalYearId}:reopen`, requestHash: await digest({ fiscalYearId, closingEntryId: close.closing_entry_id, reason: text(reason) }), correlationId: close.correlation_id || "" });
  await run(db, "UPDATE accounting_fiscal_year_closes SET status='reopened',reopened_at=?,version=version+1 WHERE id=? AND version=?", now(), close.id, Number(expectedVersion));
  await run(db, "UPDATE accounting_close_sessions SET status='reopened',reopened_at=?,reopen_reason=?,version=version+1,updated_at=datetime('now') WHERE id=?", now(), text(reason), close.close_session_id);
  return Object.freeze({ ...yearCloseDto(await first(db, "SELECT * FROM accounting_fiscal_year_closes WHERE id=?", close.id)), reversalJournalEntryId: reversal?.id || "" });
}

export async function auditReadiness(db, { actor, entitlementTier, fiscalYearId }) {
  entitled(entitlementTier); capability(actor, "accounting.close.view");
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", fiscalYearId);
  if (!year) throw new ValidationError("Fiscal year was not found.");
  const ledger = await validateLedgerFoundation(db), periods = await all(db, "SELECT status,COUNT(*) count FROM accounting_periods WHERE fiscal_year_id=? GROUP BY status", fiscalYearId), drafts = await first(db, "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('draft','pending') AND entry_date BETWEEN ? AND ?", year.start_date, year.end_date), exceptions = await first(db, "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE status='exception' AND date(occurred_at) BETWEEN ? AND ?", year.start_date, year.end_date), adjustments = await first(db, "SELECT COUNT(*) count FROM accounting_adjustments WHERE effective_date BETWEEN ? AND ? AND supporting_memo=''", year.start_date, year.end_date);
  const advanced = entitlementTier === "parish" ? { payables: Number((await first(db, "SELECT COUNT(*) count FROM accounting_bills WHERE status IN ('draft','submitted','approved','posted','partially_paid')")).count), budget: Number((await first(db, "SELECT COUNT(*) count FROM accounting_budgets WHERE fiscal_year_id=? AND status IN ('approved','locked')", fiscalYearId)).count), commerceExceptions: Number((await first(db, "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND exception_code IS NOT NULL")).count) } : null;
  return Object.freeze({ label: "Audit readiness checks completed", disclaimer: "These bookkeeping checks do not constitute an audit opinion or professional accounting, tax, or legal advice.", ledgerIntegrity: Object.freeze({ healthy: ledger.ok, reasonCodes: Object.freeze(ledger.issues || []) }), periodStatus: Object.freeze(periods.map(row => ({ status: row.status, count: Number(row.count) }))), itemsRequiringReview: Object.freeze({ journalDrafts: Number(drafts.count), integrationExceptions: Number(exceptions.count), adjustmentsMissingSupport: Number(adjustments.count) }), advancedModules: advanced && Object.freeze(advanced) });
}

export async function generateAccountantExport(db, { actor, entitlementTier, fiscalYearId, closeSessionId = null }) {
  entitled(entitlementTier); capability(actor, "accounting.accountant_exports.generate");
  const year = await first(db, "SELECT * FROM accounting_fiscal_years WHERE id=?", fiscalYearId);
  if (!year) throw new ValidationError("Fiscal year was not found.");
  const requestHash = await digest({ fiscalYearId, closeSessionId, entitlementTier });
  const prior = await first(db, "SELECT * FROM accounting_accountant_exports WHERE fiscal_year_id=? AND request_hash=?", fiscalYearId, requestHash);
  if (prior) return exportDto(prior);
  const reports = {
    "trial-balance.csv": reportCsv(await trialBalance(db, { actor: elevated(actor), startDate: year.start_date, endDate: year.end_date, includeZero: true })),
    "statement-of-financial-position.csv": reportCsv(await statementOfFinancialPosition(db, { actor: elevated(actor), asOfDate: year.end_date })),
    "statement-of-activities.csv": reportCsv(await statementOfActivities(db, { actor: elevated(actor), startDate: year.start_date, endDate: year.end_date })),
    "fund-activity.csv": reportCsv(await fundActivity(db, { actor: elevated(actor), startDate: year.start_date, endDate: year.end_date })),
  };
  const accounts = await all(db, "SELECT account_number,name,normal_balance,is_active FROM accounting_accounts ORDER BY account_number"), funds = await all(db, "SELECT code,name,restriction_type,is_active FROM accounting_funds ORDER BY code");
  reports["chart-of-accounts.csv"] = rowsCsv(accounts); reports["funds.csv"] = rowsCsv(funds);
  const journals = await all(db, "SELECT entry_number,entry_date,posting_date,description,status,source_type,external_reference,total_debits,total_credits,created_at,posted_at,correlation_id FROM accounting_journal_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date,entry_number", year.start_date, year.end_date);
  const lines = await all(db, `SELECT e.entry_number,e.entry_date,a.account_number,f.code fund_code,l.line_number,l.description,l.debit_amount,l.credit_amount,l.source_detail_type,l.source_detail_id FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.entry_date BETWEEN ? AND ? ORDER BY e.entry_date,e.entry_number,l.line_number`, year.start_date, year.end_date);
  reports["journal-entries.csv"] = rowsCsv(journals); reports["journal-lines.csv"] = rowsCsv(lines); reports["general-ledger.csv"] = rowsCsv(lines);
  reports["bank-reconciliations.csv"] = rowsCsv(await all(db, `SELECT b.name bank_name,b.masked_last4,r.statement_start_date,r.statement_end_date,r.statement_beginning_balance,r.statement_ending_balance,r.difference,r.status,r.completed_at FROM accounting_reconciliation_sessions r JOIN accounting_bank_accounts b ON b.id=r.bank_account_id WHERE r.statement_end_date BETWEEN ? AND ? ORDER BY b.name,r.statement_end_date`, year.start_date, year.end_date));
  reports["audit-trail.csv"] = rowsCsv(await all(db, "SELECT created_at,event_type,actor_type,actor_id,reason_code,correlation_id FROM accounting_ledger_events WHERE created_at BETWEEN ? AND datetime(?,'+1 day') ORDER BY created_at,id", year.start_date, year.end_date));
  if (entitlementTier === "parish") {
    reports["accounts-payable-aging.csv"] = rowsCsv(await all(db, "SELECT v.vendor_number,v.display_name,b.bill_number,b.bill_date,b.due_date,b.total_amount,b.amount_due,b.status FROM accounting_bills b JOIN accounting_vendors v ON v.id=b.vendor_id WHERE b.bill_date<=? ORDER BY v.display_name,b.due_date", year.end_date));
    reports["vendors.csv"] = rowsCsv(await all(db, "SELECT vendor_number,display_name,vendor_type,status,requires_1099_review FROM accounting_vendors ORDER BY vendor_number"));
    reports["budget-vs-actual.csv"] = rowsCsv(await all(db, "SELECT b.budget_name,b.status,a.account_number,f.code fund_code,l.annual_amount FROM accounting_budget_lines l JOIN accounting_budgets b ON b.id=l.budget_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_funds f ON f.id=l.fund_id WHERE b.fiscal_year_id=? ORDER BY b.version_number,a.account_number,f.code", fiscalYearId));
    reports["commerce-sales-summary.csv"] = rowsCsv(await all(db, "SELECT source_type,date(occurred_at) occurred_date,commerce_channel,tender_type,gross_merchandise_amount,discount_amount,sales_tax_amount,fee_amount,refund_amount,status,exception_code FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND date(occurred_at) BETWEEN ? AND ? ORDER BY occurred_at", year.start_date, year.end_date));
    reports["inventory-summary.csv"] = rowsCsv(await all(db, "SELECT sku,barcode,name,quantity_on_hand,current_unit_cost,costing_method,is_inventory_tracked FROM accounting_commerce_items ORDER BY name"));
  }
  const hashes = {}; for (const [name, body] of Object.entries(reports)) hashes[name] = await digest(body);
  const manifest = { fiscalYear: year.name, dateRange: { start: year.start_date, end: year.end_date }, generatedAt: now(), accountingBasis: "posting_date", currency: "USD", includedReports: Object.keys(reports), includedModules: entitlementTier === "parish" ? ["core", "payables", "budgets", "commerce"] : ["core"], recordCounts: { accounts: accounts.length, funds: funds.length }, fileHashes: hashes, closeStatus: year.status, warnings: ["CSV package excludes credentials, provider payloads, full bank numbers, tax identifiers, and physical database identity."] };
  const exportId = id("accountantexport");
  await run(db, `INSERT INTO accounting_accountant_exports(id,fiscal_year_id,close_session_id,status,request_hash,manifest_json,package_json,expires_at,generated_by_actor_type,generated_by_actor_id,completed_at) VALUES(?,?,?,'completed',?,?,?,?,?,?,?)`, exportId, fiscalYearId, closeSessionId, requestHash, JSON.stringify(manifest), JSON.stringify(reports), new Date(Date.now() + 7 * 86400000).toISOString(), actor.type || "platform_user", actor.id, now());
  return exportDto(await first(db, "SELECT * FROM accounting_accountant_exports WHERE id=?", exportId));
}
function exportDto(row) { const manifest = row.manifest_json ? JSON.parse(row.manifest_json) : null; return Object.freeze({ id: row.id, fiscalYearId: row.fiscal_year_id, closeSessionId: row.close_session_id || "", status: row.status, format: row.format, manifest, requestedAt: row.requested_at, completedAt: row.completed_at || "", expiresAt: row.expires_at || "", version: Number(row.version) }); }
function rowsCsv(rows) { const keys = Object.keys(rows[0] || {}), safe = value => { let result = String(value ?? ""); if (/^[=+\-@]/.test(result)) result = `'${result}`; return `"${result.replaceAll('"', '""')}"`; }; return [keys, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(safe).join(",")).join("\r\n"); }

export async function closePacketHtml(db, { actor, entitlementTier, closeSessionId }) {
  entitled(entitlementTier); capability(actor, "accounting.close.view");
  const detail = await closeSessionDetail(db, { actor, entitlementTier, closeSessionId });
  const snapshot = await first(db, "SELECT * FROM accounting_close_snapshots WHERE close_session_id=? ORDER BY sequence_number DESC LIMIT 1", closeSessionId);
  if (!snapshot) throw new ValidationError("A completed close snapshot is required before generating a close packet.");
  const data = JSON.parse(snapshot.snapshot_json), escape = value => String(value ?? "").replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
  const checks = detail.checks.map(check => `<tr><th scope="row">${escape(check.label)}</th><td>${escape(check.status)}</td><td>${escape(check.resolutionNote)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AGAPAY close packet</title><style>body{font:16px system-ui;color:#102544;max-width:960px;margin:auto;padding:2rem}h1{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:.65rem;text-align:left}@media print{button{display:none}}</style></head><body><button onclick="print()">Print close packet</button><h1>${escape(detail.closeType.replaceAll("_", " "))} close packet</h1><p>Status: ${escape(detail.status)} · Completed ${escape(detail.completedAt)}</p><p>Snapshot verification: ${escape(snapshot.snapshot_hash)}</p><h2>Checklist</h2><table><thead><tr><th>Check</th><th>Status</th><th>Resolution</th></tr></thead><tbody>${checks}</tbody></table><h2>Trial Balance</h2><p>Ending debits: ${escape(data.trialBalance?.totals?.endingDebits)} · Ending credits: ${escape(data.trialBalance?.totals?.endingCredits)}</p><p><small>Generated from an immutable server-side close snapshot. This packet supports bookkeeping review and is not an audit opinion.</small></p></body></html>`;
}

export async function auditTrailCsv(db, { actor, entitlementTier, startDate, endDate, eventType = "", actorId = "" }) {
  entitled(entitlementTier); capability(actor, "accounting.audit_exports.generate");
  if (!DATE.test(startDate || "") || !DATE.test(endDate || "") || startDate > endDate) throw new ValidationError("A valid audit export date range is required.");
  const clauses = ["date(created_at) BETWEEN ? AND ?"], parameters = [startDate, endDate];
  if (eventType) { clauses.push("event_type=?"); parameters.push(eventType); }
  if (actorId) { clauses.push("actor_id=?"); parameters.push(actorId); }
  const rows = await all(db, `SELECT created_at timestamp,event_type,actor_type,actor_id actor_label,'ledger_event' entity_type,COALESCE(journal_entry_id,related_entry_id,'') entity_identifier,reason_code reason,correlation_id,CASE WHEN event_type LIKE '%.failed' THEN 'failure' ELSE 'success' END outcome FROM accounting_ledger_events WHERE ${clauses.join(" AND ")} ORDER BY created_at,id`, ...parameters);
  return rowsCsv(rows);
}

export async function archiveFiscalYear(db, { actor, entitlementTier, fiscalYearId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.retention.manage");
  const hold = await first(db, "SELECT id FROM accounting_legal_holds WHERE entity_type='fiscal_year' AND entity_id=? AND status='active'", fiscalYearId);
  if (hold) throw new ValidationError("An active legal hold prevents archival.");
  const result = await run(db, "UPDATE accounting_fiscal_years SET status='archived',is_current=0,version=version+1,updated_at=datetime('now') WHERE id=? AND status='closed' AND version=?", fiscalYearId, Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Closed fiscal year changed or cannot be archived.", { details: { conflict: true } });
  return Object.freeze({ fiscalYearId, status: "archived", ledgerHistoryPreserved: true });
}

export async function updateRetentionSettings(db, { actor, entitlementTier, expectedVersion, patch }) {
  entitled(entitlementTier); capability(actor, "accounting.retention.manage");
  const current = await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'");
  if (Number(current.retention_policy_version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Retention policy changed.", { details: { conflict: true } });
  const fields = ["accountingRecordsRetentionYears", "bankStatementRetentionYears", "invoiceRetentionYears", "auditLogRetentionYears", "attachmentRetentionYears", "closePacketRetentionYears"];
  const values = fields.map((key, index) => { const columns = ["accounting_records_retention_years", "bank_statement_retention_years", "invoice_retention_years", "audit_log_retention_years", "attachment_retention_years", "close_packet_retention_years"]; const value = Number(patch?.[key] ?? current[columns[index]]); if (!Number.isInteger(value) || value < 1 || value > 100) throw new ValidationError("Retention classifications must be whole years between 1 and 100."); return value; });
  await run(db, "UPDATE accounting_retention_settings SET accounting_records_retention_years=?,bank_statement_retention_years=?,invoice_retention_years=?,audit_log_retention_years=?,attachment_retention_years=?,close_packet_retention_years=?,allow_legal_hold=?,retention_policy_version=retention_policy_version+1,updated_by=?,updated_at=datetime('now') WHERE id='primary' AND retention_policy_version=?", ...values, Number(patch?.allowLegalHold ?? Boolean(current.allow_legal_hold)), actor.id, Number(expectedVersion));
  return retentionDto(await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'"));
}
export async function getRetentionSettings(db, { actor, entitlementTier }) { entitled(entitlementTier); capability(actor, "accounting.close.view"); return retentionDto(await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'")); }
function retentionDto(row) { return Object.freeze({ accountingRecordsRetentionYears: Number(row.accounting_records_retention_years), bankStatementRetentionYears: Number(row.bank_statement_retention_years), invoiceRetentionYears: Number(row.invoice_retention_years), auditLogRetentionYears: Number(row.audit_log_retention_years), attachmentRetentionYears: Number(row.attachment_retention_years), closePacketRetentionYears: Number(row.close_packet_retention_years), allowLegalHold: Boolean(row.allow_legal_hold), version: Number(row.retention_policy_version), disclaimer: "Retention classifications require jurisdiction-specific professional review; Phase 3D does not automatically purge ledger records." }); }

export async function createLegalHold(db, { actor, entitlementTier, entityType, entityId, reason }) {
  entitled(entitlementTier); capability(actor, "accounting.legal_hold.manage");
  if (!text(entityType) || !text(entityId) || !text(reason)) throw new ValidationError("Legal hold entity and reason are required.");
  const holdId = id("legalhold"); await run(db, "INSERT INTO accounting_legal_holds(id,entity_type,entity_id,hold_reason,placed_by) VALUES(?,?,?,?,?)", holdId, text(entityType), text(entityId), text(reason), actor.id);
  return Object.freeze({ id: holdId, entityType: text(entityType), entityId: text(entityId), reason: text(reason), status: "active", version: 1 });
}
export async function releaseLegalHold(db, { actor, entitlementTier, legalHoldId, expectedVersion }) {
  entitled(entitlementTier); capability(actor, "accounting.legal_hold.manage");
  const result = await run(db, "UPDATE accounting_legal_holds SET status='released',released_by=?,released_at=?,version=version+1 WHERE id=? AND status='active' AND version=?", actor.id, now(), legalHoldId, Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Legal hold changed or is already released.", { details: { conflict: true } });
  const row = await first(db, "SELECT * FROM accounting_legal_holds WHERE id=?", legalHoldId); return Object.freeze({ id: row.id, entityType: row.entity_type, entityId: row.entity_id, reason: row.hold_reason, status: row.status, version: Number(row.version) });
}
