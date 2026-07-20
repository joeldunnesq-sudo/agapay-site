import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { trialBalance } from "../reports/service.js";

export const ACCOUNTING_SCANNER_VERSION = "1.0.0";
const SCAN_TYPES = new Set(["incremental", "full", "post_migration", "post_restore", "pre_close", "post_close", "manual", "canary"]);
const SEVERITY_RANK = Object.freeze({ informational: 0, warning: 1, error: 2, critical: 3 });
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
async function first(db, sql, ...parameters) { return db.prepare(sql).bind(...parameters).first(); }
async function all(db, sql, ...parameters) { return (await db.prepare(sql).bind(...parameters).all()).results || []; }
async function run(db, sql, ...parameters) { return db.prepare(sql).bind(...parameters).run(); }
function capability(actor, name) {
  if (!actor?.id || !actor.capabilities?.includes(name)) throw new AccountingDatabaseError("Accounting integrity capability is required.", { details: { capability: name } });
}
function tier(value) { if (!["mission", "parish"].includes(value)) throw new AccountingDatabaseError("Mission or Parish Accounting is required."); }
async function digest(value) { const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function finding(code, scope, module, severity, count, summary, action, references = []) {
  return { code, scope, module, severity, count: Number(count || 0), status: severity === "critical" ? "blocked" : severity === "error" ? "degraded" : severity === "warning" ? "warning" : "healthy", summary, action, references: references.slice(0, 25) };
}
async function countCheck(db, sql, ...parameters) { const row = await first(db, sql, ...parameters); return { count: Number(row?.count || 0), rows: [] }; }
async function sampleCheck(db, sql, ...parameters) { const rows = await all(db, `${sql} LIMIT 25`, ...parameters); return { count: rows.length, rows }; }

async function ledgerChecks(db, actor) {
  const checks = [];
  const definitions = [
    ["journal.no_lines", "critical", "Posted journals without lines", "Restore or forward-fix references; never synthesize posted lines.", `SELECT e.id FROM accounting_journal_entries e WHERE e.status IN('posted','reversed') AND NOT EXISTS(SELECT 1 FROM accounting_journal_lines l WHERE l.journal_entry_id=e.id)`],
    ["journal.single_line", "critical", "Posted journals with fewer than two lines", "Place posting in protective state and investigate source processing.", `SELECT e.id FROM accounting_journal_entries e JOIN accounting_journal_lines l ON l.journal_entry_id=e.id WHERE e.status IN('posted','reversed') GROUP BY e.id HAVING COUNT(*)<2`],
    ["journal.unbalanced", "critical", "Posted journal debit and credit totals differ", "Block posting and reconcile the immutable journal from evidence.", `SELECT e.id FROM accounting_journal_entries e JOIN accounting_journal_lines l ON l.journal_entry_id=e.id WHERE e.status IN('posted','reversed') GROUP BY e.id HAVING SUM(l.debit_amount)<>SUM(l.credit_amount)`],
    ["journal.invalid_line", "critical", "Journal lines contain invalid debit or credit values", "Quarantine the database and perform controlled recovery.", `SELECT id FROM accounting_journal_lines WHERE debit_amount<0 OR credit_amount<0 OR (debit_amount=0 AND credit_amount=0) OR (debit_amount>0 AND credit_amount>0)`],
    ["journal.posting_metadata", "error", "Posted journals are missing posting evidence", "Review posting history and source evidence.", `SELECT id FROM accounting_journal_entries WHERE status='posted' AND (posted_at IS NULL OR posted_by_actor_id IS NULL OR posting_date IS NULL)`],
    ["journal.duplicate_entry_number", "critical", "Final entry numbers are duplicated", "Block posting and investigate numbering concurrency.", `SELECT entry_number FROM accounting_journal_entries WHERE entry_number IS NOT NULL GROUP BY entry_number HAVING COUNT(*)>1`],
    ["journal.idempotency_conflict", "critical", "Posting source identities have conflicting hashes", "Stop retries and investigate duplicate delivery payloads.", `SELECT source_type,source_id,operation_type FROM accounting_posting_idempotency GROUP BY source_type,source_id,operation_type HAVING COUNT(DISTINCT request_hash)>1`],
    ["reference.orphan_line", "critical", "Journal lines have missing journal, account, or fund references", "Restore referential integrity from a verified backup.", `SELECT l.id FROM accounting_journal_lines l LEFT JOIN accounting_journal_entries e ON e.id=l.journal_entry_id LEFT JOIN accounting_accounts a ON a.id=l.account_id LEFT JOIN accounting_funds f ON f.id=l.fund_id WHERE e.id IS NULL OR a.id IS NULL OR f.id IS NULL`],
    ["account.invalid_posting", "error", "Posted lines reference inactive, archived, or nonposting accounts", "Review account lifecycle timing and prevent future use.", `SELECT DISTINCT a.id FROM accounting_accounts a JOIN accounting_journal_lines l ON l.account_id=a.id JOIN accounting_journal_entries e ON e.id=l.journal_entry_id WHERE e.status='posted' AND (a.is_posting_account=0 OR a.is_active=0 OR a.archived_at IS NOT NULL) AND e.entry_date>=COALESCE(a.archived_at,e.entry_date)`],
  ];
  for (const [code, severity, summary, action, sql] of definitions) { const result = await sampleCheck(db, sql); if (result.count) checks.push(finding(code, "ledger", "ledger", severity, result.count, summary, action, result.rows)); }
  const earliest = await first(db, "SELECT MIN(entry_date) start_date,MAX(entry_date) end_date FROM accounting_journal_entries WHERE status IN('posted','reversed')");
  if (earliest?.start_date) {
    const tb = await trialBalance(db, { actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), "accounting.view"])] }, startDate: earliest.start_date, endDate: earliest.end_date, includeZero: true });
    if (tb.totals.difference !== 0) checks.push(finding("trial_balance.out_of_balance", "ledger", "reports", "critical", 1, "The authoritative Trial Balance is out of balance.", "Activate posting block and begin the Trial Balance integrity runbook.", [{ difference: tb.totals.difference }]));
  }
  return checks;
}

async function integrationChecks(db) {
  const checks = [];
  const unlinked = await sampleCheck(db, `SELECT id,source_system,source_event_id FROM accounting_integration_source_events WHERE status='posted' AND journal_entry_id IS NULL`);
  if (unlinked.count) checks.push(finding("integration.posted_without_journal", "integration", "give_stripe", "critical", unlinked.count, "Posted source events lack a journal reference.", "Pause affected integration posting and reconcile source identity.", unlinked.rows));
  const missingSource = await sampleCheck(db, `SELECT e.id,e.source_type,e.source_id FROM accounting_journal_entries e WHERE e.status='posted' AND (e.source_type LIKE 'give.%' OR e.source_type LIKE 'stripe.%' OR e.source_type LIKE 'commerce.%') AND NOT EXISTS(SELECT 1 FROM accounting_integration_source_events s WHERE s.id=e.source_id)`);
  if (missingSource.count) checks.push(finding("integration.journal_without_source", "integration", "give_stripe", "error", missingSource.count, "Integration journals lack their expected source record.", "Review source retention and journal links.", missingSource.rows));
  const refunds = await sampleCheck(db, `SELECT source_object_id,SUM(refund_amount) refunds,MAX(gross_amount) gross FROM accounting_integration_source_events WHERE source_type LIKE '%refund%' GROUP BY source_object_id HAVING refunds>gross AND gross>0`);
  if (refunds.count) checks.push(finding("integration.refund_exceeds_source", "integration", "give_stripe", "critical", refunds.count, "Refund facts exceed their source charge.", "Stop automated refund posting and compare provider facts.", refunds.rows));
  return checks;
}

async function reconciliationChecks(db) {
  const checks = [];
  const differences = await sampleCheck(db, `SELECT id,difference FROM accounting_reconciliation_sessions WHERE status='completed' AND difference<>0`);
  if (differences.count) checks.push(finding("reconciliation.completed_difference", "reconciliation", "banking", "critical", differences.count, "Completed reconciliations contain a nonzero difference.", "Block close and follow the reconciliation inconsistency runbook.", differences.rows));
  const snapshots = await sampleCheck(db, `SELECT r.id FROM accounting_reconciliation_sessions r WHERE r.status='completed' AND NOT EXISTS(SELECT 1 FROM accounting_reconciliation_snapshots s WHERE s.reconciliation_session_id=r.id)`);
  if (snapshots.count) checks.push(finding("reconciliation.snapshot_missing", "reconciliation", "banking", "error", snapshots.count, "Completed reconciliations lack an immutable snapshot.", "Verify historical completion evidence before further close activity.", snapshots.rows));
  const overmatched = await sampleCheck(db, `SELECT t.id,SUM(i.matched_amount) matched,t.amount FROM accounting_bank_transactions t JOIN accounting_reconciliation_items i ON i.bank_transaction_id=t.id AND i.status='confirmed' GROUP BY t.id HAVING matched>t.amount`);
  if (overmatched.count) checks.push(finding("reconciliation.overmatched", "reconciliation", "banking", "critical", overmatched.count, "Bank transactions are matched beyond their amount.", "Block reconciliation mutation and review match groups.", overmatched.rows));
  return checks;
}

async function parishModuleChecks(db) {
  const checks = [];
  const bills = await sampleCheck(db, `SELECT b.id,b.total_amount,COALESCE(SUM(l.line_amount+l.tax_amount),0) lines FROM accounting_bills b LEFT JOIN accounting_bill_lines l ON l.bill_id=b.id GROUP BY b.id HAVING lines<>b.total_amount`);
  if (bills.count) checks.push(finding("ap.bill_lines_mismatch", "module", "payables", "error", bills.count, "Bill lines do not agree with bill totals.", "Pause affected payment approval and review bill evidence.", bills.rows));
  const applications = await sampleCheck(db, `SELECT p.id,p.total_amount,COALESCE(SUM(a.amount_applied),0) applied FROM accounting_payments p LEFT JOIN accounting_payment_applications a ON a.payment_id=p.id GROUP BY p.id HAVING applied>p.total_amount`);
  if (applications.count) checks.push(finding("ap.payment_overapplied", "module", "payables", "critical", applications.count, "Payment applications exceed payment totals.", "Block AP payment mutation and investigate concurrency.", applications.rows));
  const budgets = await sampleCheck(db, `SELECT id,annual_amount,(january_amount+february_amount+march_amount+april_amount+may_amount+june_amount+july_amount+august_amount+september_amount+october_amount+november_amount+december_amount) allocated FROM accounting_budget_lines WHERE annual_amount<>(january_amount+february_amount+march_amount+april_amount+may_amount+june_amount+july_amount+august_amount+september_amount+october_amount+november_amount+december_amount)`);
  if (budgets.count) checks.push(finding("budget.allocation_mismatch", "module", "budgets", "warning", budgets.count, "Budget monthly allocations do not equal annual amounts.", "Review budget allocation; ledger posting remains available.", budgets.rows));
  const tax = await sampleCheck(db, `SELECT source_object_id,SUM(CASE WHEN source_type='commerce_sale_completed' THEN sales_tax_amount ELSE 0 END) collected,SUM(CASE WHEN source_type LIKE 'commerce_sale_%refunded' THEN sales_tax_amount ELSE 0 END) refunded FROM accounting_integration_source_events WHERE source_system='agapay_commerce' GROUP BY source_object_id HAVING refunded>collected`);
  if (tax.count) checks.push(finding("commerce.tax_refund_exceeds_collected", "module", "commerce", "critical", tax.count, "Commerce tax refunds exceed collected tax.", "Pause affected commerce posting and compare canonical order facts.", tax.rows));
  const inventory = await sampleCheck(db, `SELECT item_id,source_type,source_id,movement_type FROM accounting_inventory_movements GROUP BY item_id,source_type,source_id,movement_type HAVING COUNT(*)>1`);
  if (inventory.count) checks.push(finding("commerce.duplicate_inventory_movement", "module", "inventory", "error", inventory.count, "Duplicate inventory movements were detected.", "Stop inventory retries and investigate source idempotency.", inventory.rows));
  const missingCost = await countCheck(db, `SELECT COUNT(*) count FROM accounting_inventory_movements WHERE status='pending_cost'`);
  if (missingCost.count) checks.push(finding("commerce.inventory_cost_pending", "module", "inventory", "warning", missingCost.count, "Inventory movements still require cost support.", "Enter verified cost evidence; do not invent cost.", []));
  return checks;
}

async function closeChecks(db) {
  const checks = [];
  const noSnapshot = await sampleCheck(db, `SELECT c.id FROM accounting_close_sessions c WHERE c.status='completed' AND NOT EXISTS(SELECT 1 FROM accounting_close_snapshots s WHERE s.close_session_id=c.id)`);
  if (noSnapshot.count) checks.push(finding("close.snapshot_missing", "close", "close", "critical", noSnapshot.count, "Completed close sessions lack snapshots.", "Preserve the period lock and investigate completion evidence.", noSnapshot.rows));
  const unlocked = await sampleCheck(db, `SELECT c.id,c.accounting_period_id FROM accounting_close_sessions c JOIN accounting_periods p ON p.id=c.accounting_period_id WHERE c.status='completed' AND p.status<>'locked'`);
  if (unlocked.count) checks.push(finding("close.period_not_locked", "close", "close", "critical", unlocked.count, "Completed close sessions have unlocked periods.", "Activate posting protection and review close history.", unlocked.rows));
  const snapshots = await all(db, "SELECT id,snapshot_json,snapshot_hash FROM accounting_close_snapshots");
  const bad = [];
  for (const snapshot of snapshots) if (await digest(JSON.parse(snapshot.snapshot_json)) !== snapshot.snapshot_hash) bad.push({ id: snapshot.id });
  if (bad.length) checks.push(finding("close.snapshot_hash_invalid", "close", "close", "critical", bad.length, "Close snapshot verification hashes do not match.", "Preserve evidence and begin recovery verification.", bad));
  const duplicates = await sampleCheck(db, `SELECT fiscal_year_id FROM accounting_fiscal_year_closes WHERE status='completed' GROUP BY fiscal_year_id HAVING COUNT(*)>1`);
  if (duplicates.count) checks.push(finding("close.duplicate_year_end", "close", "close", "critical", duplicates.count, "A fiscal year has multiple completed closing records.", "Block year-end mutation and review closing idempotency.", duplicates.rows));
  return checks;
}

async function schemaChecks(db) {
  const expectations = await all(db, "SELECT * FROM accounting_schema_expectations WHERE is_critical=1"), findings = [];
  for (const expected of expectations) {
    const object = await first(db, "SELECT name,sql FROM sqlite_master WHERE type=? AND name=?", expected.object_type, expected.object_name);
    if (!object || (expected.required_definition_fragment && !String(object.sql || "").includes(expected.required_definition_fragment))) findings.push(finding(`schema.${expected.object_type}_missing`, "migration", "schema", "critical", 1, `Required ${expected.object_type} ${expected.object_name} is missing or incompatible.`, "Block posting and run post-migration schema verification.", [{ objectType: expected.object_type, objectName: expected.object_name, introducedVersion: expected.introduced_version }]));
  }
  return findings;
}

async function persistFinding(db, scanId, correlationId, item) {
  await run(db, `INSERT INTO accounting_integrity_findings(id,scan_id,health_scope,health_code,status,severity,affected_module,safe_summary,recommended_action,details_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id("finding"), scanId, item.scope, item.code, item.status, item.severity, item.module, item.summary, item.action, JSON.stringify({ count: item.count, samples: item.references }), correlationId || null);
}
function scanDto(row) { return Object.freeze({ id: row.id, scanType: row.scan_type, scope: row.scope, status: row.status, startedAt: row.started_at || "", completedAt: row.completed_at || "", lastCheckpoint: row.last_checkpoint || "", checksTotal: Number(row.checks_total), checksPassed: Number(row.checks_passed), checksWarned: Number(row.checks_warned), checksFailed: Number(row.checks_failed), criticalFailures: Number(row.critical_failures), scannerVersion: row.scanner_version, schemaVersion: row.schema_version || "", correlationId: row.correlation_id || "" }); }

export async function runIntegrityScan(db, { actor, entitlementTier, scanType = "manual", scope = "full", correlationId = "", resumeScanId = "" }) {
  tier(entitlementTier); capability(actor, "accounting.integrity.scan");
  if (!SCAN_TYPES.has(scanType) || !["full", "ledger", "integration", "reconciliation", "modules", "close", "schema"].includes(scope)) throw new ValidationError("Integrity scan type or scope is invalid.");
  let scan;
  if (resumeScanId) {
    scan = await first(db, "SELECT * FROM accounting_integrity_scans WHERE id=? AND status='paused'", resumeScanId);
    if (!scan) throw new ValidationError("Paused integrity scan was not found.");
    await run(db, "UPDATE accounting_integrity_scans SET status='running',updated_at=datetime('now') WHERE id=?", scan.id);
  } else {
    const scanId = id("integrityscan");
    await run(db, `INSERT INTO accounting_integrity_scans(id,scan_type,scope,status,started_at,scanner_version,schema_version,correlation_id) VALUES(?,?,?,'running',?,?,?,?)`, scanId, scanType, scope, now(), ACCOUNTING_SCANNER_VERSION, "3E", correlationId || null);
    scan = await first(db, "SELECT * FROM accounting_integrity_scans WHERE id=?", scanId);
  }
  try {
    const groups = [];
    if (["full", "ledger"].includes(scope)) groups.push(...await ledgerChecks(db, actor));
    await run(db, "UPDATE accounting_integrity_scans SET last_checkpoint='ledger',updated_at=datetime('now') WHERE id=?", scan.id);
    if (["full", "integration"].includes(scope)) groups.push(...await integrationChecks(db));
    if (["full", "reconciliation"].includes(scope)) groups.push(...await reconciliationChecks(db));
    if (entitlementTier === "parish" && ["full", "modules"].includes(scope)) groups.push(...await parishModuleChecks(db));
    if (["full", "close"].includes(scope)) groups.push(...await closeChecks(db));
    if (["full", "schema"].includes(scope)) groups.push(...await schemaChecks(db));
    for (const item of groups) await persistFinding(db, scan.id, correlationId, item);
    const critical = groups.filter(item => item.severity === "critical").length, warnings = groups.filter(item => item.severity === "warning").length, errors = groups.filter(item => item.severity === "error").length, total = 6 + (entitlementTier === "parish" ? 3 : 0), status = critical || errors || warnings ? "completed_with_warnings" : "completed";
    await run(db, "UPDATE accounting_integrity_scans SET status=?,completed_at=?,last_checkpoint='complete',checks_total=?,checks_passed=?,checks_warned=?,checks_failed=?,critical_failures=?,updated_at=datetime('now') WHERE id=?", status, now(), total, Math.max(0, total - groups.length), warnings, errors + critical, critical, scan.id);
    if (critical) await activateProtectiveState(db, { actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), "accounting.integrity.protect"])] }, state: "posting_blocked", reasonCode: groups.find(item => item.severity === "critical").code, safeSummary: "Critical accounting integrity review is required before new posting.", sourceScanId: scan.id });
  } catch (error) {
    await run(db, "UPDATE accounting_integrity_scans SET status='failed',completed_at=?,updated_at=datetime('now') WHERE id=?", now(), scan.id); throw error;
  }
  return scanDto(await first(db, "SELECT * FROM accounting_integrity_scans WHERE id=?", scan.id));
}

export async function accountingHealthOverview(db, { actor, entitlementTier }) {
  tier(entitlementTier); capability(actor, "accounting.integrity.view");
  const protective = await first(db, "SELECT * FROM accounting_protective_state WHERE id='primary'"), latest = await first(db, "SELECT * FROM accounting_integrity_scans ORDER BY created_at DESC LIMIT 1"), findings = await all(db, "SELECT health_code,status,severity,affected_module,safe_summary,recommended_action,detected_at,correlation_id FROM accounting_integrity_findings WHERE resolved_at IS NULL ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'error' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC,detected_at DESC LIMIT 100"), jobs = await first(db, "SELECT COUNT(*) count FROM accounting_integrity_scans WHERE status IN ('queued','running','paused')");
  return Object.freeze({ status: protective.state === "normal" ? (findings.length ? "warning" : "healthy") : protective.state, protectiveState: Object.freeze({ state: protective.state, reasonCode: protective.reason_code || "", safeSummary: protective.safe_summary || "", version: Number(protective.version) }), latestScan: latest ? scanDto(latest) : null, activeWork: Number(jobs.count), findings: Object.freeze(findings.map(row => Object.freeze({ code: row.health_code, status: row.status, severity: row.severity, module: row.affected_module, summary: row.safe_summary, recommendedAction: row.recommended_action, detectedAt: row.detected_at, correlationId: row.correlation_id || "" }))), disclaimer: "This health view reports operational bookkeeping checks; it is not an audit or regulatory certification." });
}

export async function activateProtectiveState(db, { actor, state, reasonCode, safeSummary, sourceScanId = null, expectedVersion }) {
  capability(actor, "accounting.integrity.protect");
  if (!["degraded_read_only", "posting_blocked", "recovering"].includes(state) || !String(reasonCode || "").trim() || !String(safeSummary || "").trim()) throw new ValidationError("A protective state, reason, and safe summary are required.");
  const current = await first(db, "SELECT * FROM accounting_protective_state WHERE id='primary'");
  if (expectedVersion !== undefined && Number(current.version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Protective state changed.", { details: { conflict: true } });
  await run(db, "UPDATE accounting_protective_state SET state=?,reason_code=?,safe_summary=?,activated_by=?,activated_at=?,released_by=NULL,released_at=NULL,source_scan_id=?,version=version+1,updated_at=datetime('now') WHERE id='primary'", state, reasonCode, safeSummary, actor.id, now(), sourceScanId);
  return Object.freeze({ state, reasonCode, safeSummary, version: Number(current.version) + 1 });
}

export async function releaseProtectiveState(db, { actor, expectedVersion, reason }) {
  capability(actor, "accounting.integrity.protect"); if (!String(reason || "").trim()) throw new ValidationError("A verified release reason is required.");
  const result = await run(db, "UPDATE accounting_protective_state SET state='normal',reason_code=NULL,safe_summary=NULL,released_by=?,released_at=?,source_scan_id=NULL,version=version+1,updated_at=datetime('now') WHERE id='primary' AND version=? AND state<>'normal'", actor.id, now(), Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Protective state changed or is already normal.", { details: { conflict: true } });
  return Object.freeze({ state: "normal", version: Number(expectedVersion) + 1 });
}

export async function verifyRecoveryEvidence(db, { actor, entitlementTier, verificationType, artifactReference, artifactBody, manifest, correlationId = "" }) {
  tier(entitlementTier); capability(actor, "accounting.recovery.verify");
  if (!["backup", "restore", "migration_preflight", "post_restore"].includes(verificationType) || !String(artifactReference || "").trim() || artifactBody === undefined || !manifest) throw new ValidationError("Recovery verification requires an artifact and manifest.");
  const artifactChecksum = await digest(artifactBody), manifestChecksum = await digest(manifest), expected = String(manifest.artifactChecksum || ""), checksumValid = expected === artifactChecksum;
  const schema = (await schemaChecks(db)).length === 0, ledger = await ledgerChecks(db, actor), trialBalanceValid = !ledger.some(item => item.code === "trial_balance.out_of_balance"), sourceLinksValid = !(await integrationChecks(db)).some(item => item.severity === "critical"), reconciliationsValid = !(await reconciliationChecks(db)).some(item => item.severity === "critical"), snapshotsValid = !(await closeChecks(db)).some(item => item.severity === "critical"), verified = checksumValid && schema && trialBalanceValid && sourceLinksValid && reconciliationsValid && snapshotsValid;
  const verificationId = id("recoveryverification");
  await run(db, `INSERT INTO accounting_recovery_verifications(id,verification_type,status,artifact_reference,artifact_checksum,manifest_checksum,schema_valid,trial_balance_hash,source_links_valid,reconciliations_valid,close_snapshots_valid,verified_by,correlation_id,details_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, verificationId, verificationType, verified ? "verified" : "failed", artifactReference, artifactChecksum, manifestChecksum, Number(schema), await digest({ trialBalanceValid }), Number(sourceLinksValid), Number(reconciliationsValid), Number(snapshotsValid), actor.id, correlationId || null, JSON.stringify({ checksumValid, trialBalanceValid }));
  return Object.freeze({ id: verificationId, verificationType, status: verified ? "verified" : "failed", artifactChecksum, manifestChecksum, schemaValid: schema, trialBalanceValid, sourceLinksValid, reconciliationsValid, closeSnapshotsValid: snapshotsValid, productionMutated: false });
}

export function classifyIntegritySeverity(findings = []) { return findings.reduce((highest, item) => SEVERITY_RANK[item.severity] > SEVERITY_RANK[highest] ? item.severity : highest, "informational"); }
