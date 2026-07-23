import { d1All, d1Run, generateSecret } from "../../lib/core.js";
import { agapayEmailHtml, sendEmail } from "../../lib/email.js";
import { htmlEscape } from "../../lib/format.js";
import { createBoundD1ProvisioningAdapter, createD1DatabaseFacade } from "../provisioning/adapters.js";
import { activatePreparedParishAccounting } from "../provisioning/orchestrator.js";
import { releaseProtectiveState, runIntegrityScan } from "./service.js";

const SYSTEM_ACTOR = Object.freeze({
  id: "accounting-integrity-scheduler",
  type: "system",
  capabilities: Object.freeze(["accounting.integrity.scan", "accounting.integrity.protect"])
});

function configuredBindings(env) {
  try { return JSON.parse(String(env.ACCOUNTING_DATABASE_BINDINGS || "{}")); } catch { return {}; }
}

function maskEmail(value) {
  const [name = "", domain = ""] = String(value || "").split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "configured-recipient";
}

async function ensureCanaryRegistered(env, adapter, correlationId) {
  const parishId = String(env.ACCOUNTING_CANARY_PARISH_ID || "").trim();
  if (!parishId) return null;
  const databaseIdentifier = "agapay-acct-production-e4601e1d985ec8dcb9fe";
  return activatePreparedParishAccounting(env, { adapter, parishId, databaseIdentifier, subscriptionTier: "parish", correlationId });
}

async function recordDelivery(env, { parishId, scanId, severity, result, recipient, correlationId }) {
  let providerMessageId = "";
  try { providerMessageId = JSON.parse(result.body || "{}").id || ""; } catch { providerMessageId = ""; }
  await d1Run(env, `INSERT INTO accounting_integrity_alert_deliveries
    (id,parish_id,scan_id,severity,delivery_status,recipient_masked,provider_message_id,correlation_id)
    VALUES(?,?,?,?,?,?,?,?)`, generateSecret("acct_alert_delivery"), parishId, scanId, severity, result.status, maskEmail(recipient), providerMessageId || null, correlationId);
  return providerMessageId;
}

async function alertForFindings(env, db, { parishId, scan, findings, correlationId }) {
  const actionable = findings.filter((item) => item.severity === "critical" || item.severity === "error");
  if (!actionable.length) return { status: "not_needed", count: 0, providerMessageId: "" };
  const severity = actionable.some((item) => item.severity === "critical") ? "critical" : "error";
  for (const finding of actionable) {
    await db.prepare(`INSERT INTO accounting_operational_alerts
      (id,alert_code,severity,status,safe_summary,recommended_action,source_type,source_id,correlation_id)
      VALUES(?,?,?,'open',?,?, 'integrity_scan',?,?)`)
      .bind(generateSecret("acct_alert"), finding.health_code, finding.severity, finding.safe_summary, finding.recommended_action, scan.id, correlationId).run();
  }
  const recipient = String(env.ACCOUNTING_ALERT_EMAIL || env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || "").trim();
  const summaries = actionable.slice(0, 10).map((item) => `<li><strong>${htmlEscape(item.health_code)}</strong>: ${htmlEscape(item.safe_summary)}</li>`).join("");
  const result = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL,
    to: recipient,
    reply_to: env.AGAPAY_REPLY_TO_EMAIL,
    subject: `[${severity.toUpperCase()}] AGAPAY accounting integrity alert — ${parishId}`,
    html: agapayEmailHtml(env.AGAPAY_APP_URL, "Accounting integrity alert", `<p>The scheduled production integrity scan found ${actionable.length} item(s) requiring attention for <strong>${htmlEscape(parishId)}</strong>.</p><ul>${summaries}</ul><p>New posting has been protectively blocked when a critical finding is present. Scan: <code>${htmlEscape(scan.id)}</code>.</p>`)
  });
  const providerMessageId = await recordDelivery(env, { parishId, scanId: scan.id, severity, result, recipient, correlationId });
  return { status: result.status, count: actionable.length, providerMessageId };
}

async function processReleaseRequests(env, db, { parishId, scan, findings }) {
  const requests = await d1All(env, "SELECT * FROM accounting_integrity_release_requests WHERE parish_id=? AND status='pending' ORDER BY requested_at", parishId);
  const results = [];
  for (const request of requests) {
    if (findings.some((item) => item.severity === "critical" || item.severity === "error")) {
      await d1Run(env, "UPDATE accounting_integrity_release_requests SET status='rejected',completed_at=datetime('now'),result_json=? WHERE id=?", JSON.stringify({ reason: "latest_scan_not_clean", scanId: scan.id }), request.id);
      results.push({ id: request.id, status: "rejected" });
      continue;
    }
    try {
      const released = await releaseProtectiveState(db, { actor: SYSTEM_ACTOR, expectedVersion: request.expected_version, reason: request.reason });
      await d1Run(env, "UPDATE accounting_integrity_release_requests SET status='completed',completed_at=datetime('now'),result_json=? WHERE id=?", JSON.stringify({ ...released, scanId: scan.id }), request.id);
      results.push({ id: request.id, status: "completed", version: released.version });
    } catch (error) {
      await d1Run(env, "UPDATE accounting_integrity_release_requests SET status='failed',completed_at=datetime('now'),result_json=? WHERE id=?", JSON.stringify({ error: error?.message || String(error), scanId: scan.id }), request.id);
      results.push({ id: request.id, status: "failed" });
    }
  }
  return results;
}

export async function runScheduledAccountingIntegrity(env, scheduledTime = Date.now()) {
  const adapter = createBoundD1ProvisioningAdapter(env);
  const correlationId = `scheduled-accounting-integrity-${new Date(scheduledTime).toISOString()}`;
  await ensureCanaryRegistered(env, adapter, correlationId);
  const configured = configuredBindings(env);
  const rows = await d1All(env, `SELECT e.parish_id,e.subscription_tier,d.database_identifier
    FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id
    WHERE e.entity_status='ready' AND e.activation_status='active'
      AND d.environment='production' AND d.provisioning_status='ready'`);
  const results = [];
  for (const row of rows) {
    const bindingName = configured[row.database_identifier];
    if (!bindingName || !env[bindingName]) continue;
    const db = createD1DatabaseFacade(adapter, bindingName);
    const scan = await runIntegrityScan(db, { actor: SYSTEM_ACTOR, entitlementTier: row.subscription_tier, scanType: "full", scope: "full", correlationId });
    const findings = (await db.prepare("SELECT health_code,severity,safe_summary,recommended_action FROM accounting_integrity_findings WHERE scan_id=? ORDER BY severity DESC").bind(scan.id).all()).results;
    const alert = await alertForFindings(env, db, { parishId: row.parish_id, scan, findings, correlationId });
    const releases = await processReleaseRequests(env, db, { parishId: row.parish_id, scan, findings });
    results.push({ parishId: row.parish_id, scanId: scan.id, status: scan.status, criticalFailures: scan.criticalFailures, findings: findings.length, alert, releases });
  }
  return Object.freeze({ correlationId, scanned: results.length, results: Object.freeze(results) });
}
