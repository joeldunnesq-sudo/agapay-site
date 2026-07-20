// Phase 0.75H: safe observability primitives for future accounting work.

import { createAccountingConfiguration } from "./environment.js";

export const ACCOUNTING_EVENT_TYPES = Object.freeze([
  "accounting.gateway.request",
  "accounting.gateway.denied",
  "accounting.job.started",
  "accounting.job.failed",
  "accounting.job.completed",
  "accounting.database.resolved",
  "accounting.migration.blocked",
  "accounting.support.action",
  "accounting.backup.requested",
  "accounting.restore.validated",
  "accounting.source_event.received",
  "accounting.integrity.scan.started",
  "accounting.integrity.scan.completed",
  "accounting.integrity.critical",
  "accounting.protective_state.activated",
  "accounting.protective_state.released",
  "accounting.recovery.verification.completed"
]);

const REDACTED = "[redacted]";
const SECRET_KEY_PARTS = ["password", "secret", "token", "authorization", "cookie", "api_key", "apikey", "private"];

export function maskEmail(value = "") {
  const [name, domain] = String(value).split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
}

export function maskStripeId(value = "") {
  const id = String(value || "");
  if (!id) return "";
  const [prefix] = id.split("_");
  return `${prefix || "stripe"}_***${id.slice(-4)}`;
}

export function maskObjectKey(value = "") {
  const key = String(value || "");
  if (key.length <= 8) return key ? "***" : "";
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

export function maskIpAddress(value = "") {
  const parts = String(value || "").split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return value ? "[masked-ip]" : "";
}

export function redactSensitiveValue(value, key = "") {
  const normalizedKey = String(key).toLowerCase();
  if (SECRET_KEY_PARTS.some((part) => normalizedKey.includes(part))) return REDACTED;
  if (normalizedKey.includes("email")) return maskEmail(value);
  if (normalizedKey.includes("stripe") && String(value).includes("_")) return maskStripeId(value);
  if (normalizedKey.includes("objectkey") || normalizedKey.includes("r2key")) return maskObjectKey(value);
  if (normalizedKey.includes("ip")) return maskIpAddress(value);
  return value;
}

export function redactObject(value) {
  if (Array.isArray(value)) return value.map((item) => redactObject(item));
  if (!value || typeof value !== "object") return redactSensitiveValue(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      child && typeof child === "object" ? redactObject(child) : redactSensitiveValue(child, key)
    ])
  );
}

export function createAccountingLogEvent({
  type,
  env = {},
  parishId = "",
  actorId = "",
  correlationId = "",
  subjectType = "",
  subjectId = "",
  severity = "info",
  metadata = {}
} = {}) {
  const eventType = ACCOUNTING_EVENT_TYPES.includes(type) ? type : "accounting.gateway.request";
  const config = createAccountingConfiguration(env);
  return {
    type: eventType,
    severity,
    environment: config.environment,
    parishId,
    actorId,
    correlationId,
    subjectType,
    subjectId,
    metadata: redactObject(metadata),
    occurredAt: new Date().toISOString()
  };
}

export function createSafeErrorResponse(error = {}, correlationId = "") {
  const status = Number(error.status || error.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  return {
    status: safeStatus,
    body: {
      error: safeStatus >= 500 ? "Accounting request could not be completed." : String(error.message || "Accounting request was rejected."),
      code: String(error.code || error.name || "accounting_error"),
      correlationId
    }
  };
}

export function createSupportAuditRequirement({
  action,
  parishId,
  actorId,
  targetType,
  targetId,
  reason,
  correlationId = ""
} = {}) {
  return createAccountingLogEvent({
    type: "accounting.support.action",
    parishId,
    actorId,
    correlationId,
    subjectType: targetType,
    subjectId: targetId,
    severity: "notice",
    metadata: { action, reason }
  });
}
