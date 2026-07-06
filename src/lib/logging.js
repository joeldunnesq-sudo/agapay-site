// Structured, sanitized event logging for Cloudflare Worker log ingestion.
//
// This is intentionally NOT a durable store — it emits JSON lines to
// console.log/console.error, which Cloudflare's dashboard log stream and
// Logpush both pick up. See docs/MONITORING_CHECKLIST.md for how to wire
// alerts on top of these logs.
//
// Do NOT log: passwords, reset tokens, full authorization headers, Stripe
// secrets, full payment method details, sensitive student records, raw
// private email bodies, or full webhook signatures. sanitize() below strips
// known-sensitive keys defensively, but callers should still avoid passing
// raw secrets in `metadata` in the first place.
//
// Usage:
//   import { logEvent } from "../lib/logging.js";
//   await logEvent(env, {
//     eventType: "donor.login.failed",
//     severity: "warn",
//     requestId,
//     route: "/api/donor/login",
//     method: "POST",
//     retryable: false,
//     metadata: { emailHash: await sha256Hex(email) },
//   });

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|signature|api[_-]?key|card|cvv|ssn)/i;

/** Recursively strip keys matching SENSITIVE_KEY_PATTERN from an object. */
export function sanitize(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = typeof val === "object" ? sanitize(val, depth + 1) : val;
  }
  return out;
}

/** Trim and cap an error message so stack traces / huge payloads don't flood logs. */
export function sanitizedErrorMessage(err) {
  const message = err?.message || String(err || "Unknown error");
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

/**
 * Emit one structured log line.
 *
 * @param {object} env - Worker env (used only to read AGAPAY_BUILD_SHA; never logged raw)
 * @param {object} fields
 * @param {string} fields.eventType - e.g. "stripe.webhook.failed", "donor.login.failed"
 * @param {"debug"|"info"|"warn"|"error"} [fields.severity]
 * @param {string} [fields.requestId]
 * @param {string} [fields.route]
 * @param {string} [fields.method]
 * @param {string} [fields.userId] - only when safe/necessary; prefer a hash over raw email
 * @param {string} [fields.organizationId]
 * @param {string} [fields.stripeEventId]
 * @param {string} [fields.jobId]
 * @param {string} [fields.errorName]
 * @param {string|Error} [fields.error] - will be reduced to a sanitized, length-capped message
 * @param {boolean} [fields.retryable]
 * @param {object} [fields.metadata] - free-form context; run through sanitize()
 */
export async function logEvent(env, fields = {}) {
  const {
    eventType,
    severity = "info",
    requestId = null,
    route = null,
    method = null,
    userId = null,
    organizationId = null,
    stripeEventId = null,
    jobId = null,
    errorName = null,
    error = null,
    retryable = null,
    metadata = null,
  } = fields;

  const line = {
    eventType: eventType || "unknown",
    severity,
    requestId,
    route,
    method,
    userId,
    organizationId,
    stripeEventId,
    jobId,
    errorName: errorName || (error && error.name) || null,
    errorMessage: error ? sanitizedErrorMessage(error) : null,
    retryable,
    deploymentVersion: env?.AGAPAY_BUILD_SHA || "unknown",
    timestamp: new Date().toISOString(),
    metadata: metadata ? sanitize(metadata) : null,
  };

  const payload = JSON.stringify(line);
  if (severity === "error" || severity === "warn") {
    console.error(payload);
  } else {
    console.log(payload);
  }
  return line;
}
