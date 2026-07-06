// Phase 6 -- Audit log foundation (docs/SOFT_LAUNCH_READINESS.md).
//
// Durable, append-only record of privileged/security-sensitive actions.
// This is intentionally a thin wrapper around a single INSERT -- no
// update/delete path exists here on purpose, and none should be added.
//
// This is NOT the same thing as src/lib/logging.js (logEvent) -- that's
// ephemeral console output for Cloudflare's log stream, gone once the
// log window rolls off. This table is the durable record an admin can
// query weeks later to answer "who did what, when."
//
// recordAuditEvent() never throws. An audit-logging failure must never
// block the privileged action it's describing -- if the D1 write fails,
// we fall back to logEvent() so the failure itself is at least visible
// in Cloudflare logs, and move on.

import { d1, d1Run, d1All, clampListLimit, clientIp, sha256Hex, generateSecret } from "./core.js";
import { logEvent } from "./logging.js";

const MAX_SUMMARY_JSON_LENGTH = 4000;

// Defensive truncation -- before/after summaries are meant to be small,
// non-sensitive summaries (e.g. { status: "verified" }), never a full
// record dump. This just guards against someone accidentally passing a
// whole object in without thinking, so a mistake there can't grow this
// table's rows unboundedly or leak more than intended.
function safeJsonSummary(value) {
  if (value === undefined || value === null) return null;
  try {
    const str = JSON.stringify(value);
    return str.length > MAX_SUMMARY_JSON_LENGTH ? str.slice(0, MAX_SUMMARY_JSON_LENGTH) + "…(truncated)" : str;
  } catch {
    return null;
  }
}

/**
 * Record one audit event. Safe to call from any handler -- never throws,
 * never blocks the caller's actual work.
 *
 * @param {object} env
 * @param {Request|null} request - used for request_id/ip_hash if provided; pass null if not in a request context
 * @param {object} fields
 * @param {string} fields.action - required, e.g. "registration.status_changed"
 * @param {string} [fields.actorUserId] - admin actor display name (or future user id)
 * @param {string} [fields.actorType] - "admin" | "parish" | "donor" | "system" (default "admin")
 * @param {string} [fields.actorRole]
 * @param {string} [fields.targetType] - e.g. "registration", "settlement_profile"
 * @param {string} [fields.targetId]
 * @param {string} [fields.organizationId]
 * @param {string} [fields.householdId]
 * @param {string} [fields.reason]
 * @param {*} [fields.before] - small summary object, will be JSON-stringified and truncated defensively
 * @param {*} [fields.after]
 * @param {object} [fields.metadata]
 * @param {string} [fields.requestId] - overrides request-derived id if provided
 */
export async function recordAuditEvent(env, request, fields = {}) {
  if (!fields.action) return null;
  try {
    if (!d1(env)) {
      await logEvent(env, {
        eventType: "audit_log.skipped_no_d1",
        severity: "warn",
        metadata: { action: fields.action }
      });
      return null;
    }
    const id = generateSecret("audit");
    const requestId = fields.requestId || (request ? request.headers.get("X-Request-Id") : null) || null;
    const ipHash = request ? await sha256Hex(clientIp(request)) : null;

    await d1Run(
      env,
      `INSERT INTO audit_log (
         id, actor_user_id, actor_type, actor_role, action, target_type, target_id,
         organization_id, household_id, request_id, ip_hash, reason,
         before_summary_json, after_summary_json, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      id,
      fields.actorUserId || null,
      fields.actorType || "admin",
      fields.actorRole || null,
      fields.action,
      fields.targetType || null,
      fields.targetId || null,
      fields.organizationId || null,
      fields.householdId || null,
      requestId,
      ipHash,
      fields.reason || null,
      safeJsonSummary(fields.before),
      safeJsonSummary(fields.after),
      safeJsonSummary(fields.metadata)
    );
    return id;
  } catch (err) {
    // Never let audit logging break the caller's actual privileged action.
    await logEvent(env, {
      eventType: "audit_log.write_failed",
      severity: "error",
      error: err,
      metadata: { action: fields.action }
    }).catch(() => {});
    return null;
  }
}

/**
 * List audit events with filters, newest first. Admin-viewer read path --
 * callers are responsible for their own admin-auth check before calling
 * this (this module has no opinion on authentication).
 */
export async function listAuditEvents(env, {
  limit = 50,
  cursor = "",
  action = "",
  actorUserId = "",
  targetType = "",
  targetId = "",
  organizationId = "",
  since = "",
  until = ""
} = {}) {
  if (!d1(env)) return { events: [], cursor: "" };
  const clampedLimit = clampListLimit(limit, 50, 200);

  const clauses = [];
  const params = [];
  if (action) { clauses.push("action = ?"); params.push(action); }
  if (actorUserId) { clauses.push("actor_user_id = ?"); params.push(actorUserId); }
  if (targetType) { clauses.push("target_type = ?"); params.push(targetType); }
  if (targetId) { clauses.push("target_id = ?"); params.push(targetId); }
  if (organizationId) { clauses.push("organization_id = ?"); params.push(organizationId); }
  if (since) { clauses.push("created_at >= ?"); params.push(since); }
  if (until) { clauses.push("created_at <= ?"); params.push(until); }
  if (cursor) { clauses.push("created_at < ?"); params.push(cursor); }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await d1All(
    env,
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    clampedLimit + 1
  );

  const hasMore = rows.length > clampedLimit;
  const page = hasMore ? rows.slice(0, clampedLimit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].created_at : "";

  return {
    events: page.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorType: row.actor_type,
      actorRole: row.actor_role,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      organizationId: row.organization_id,
      householdId: row.household_id,
      requestId: row.request_id,
      reason: row.reason,
      before: safeJsonParse(row.before_summary_json),
      after: safeJsonParse(row.after_summary_json),
      metadata: safeJsonParse(row.metadata_json),
      createdAt: row.created_at
    })),
    cursor: nextCursor,
    hasMore
  };
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
