import { requestContext } from './request-context.js';
export type SanitizedValue = null | string | number | boolean | SanitizedValue[] | SanitizedRecord;
export interface SanitizedRecord {
  [key: string]: SanitizedValue;
}
// The release workflow injects the build SHA separately from Wrangler bindings.
export type LoggingEnv = Partial<Env> & {
  readonly AGAPAY_BUILD_SHA?: string;
};
export interface LogEventFields {
  readonly eventType?: string;
  readonly severity?: 'debug' | 'info' | 'warn' | 'error';
  readonly requestId?: string | null;
  readonly route?: string | null;
  readonly method?: string | null;
  readonly userId?: string | null;
  readonly organizationId?: string | null;
  readonly stripeEventId?: string | null;
  readonly jobId?: string | null;
  readonly errorName?: string | null;
  readonly error?: string | Error | null;
  readonly retryable?: boolean | null;
  readonly metadata?: unknown;
}

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

const MAX_LOG_BYTES = 16000;

/** Bounded, JSON-safe metadata. Never execute getters or retain over-depth data. */
export function sanitize(value: unknown, depth = 0): SanitizedValue {
  const seen = new WeakSet();
  let remaining = 200;
  function visit(item: unknown, level: number): SanitizedValue {
    if (remaining-- <= 0 || level > 4) return '[truncated]';
    if (item === null || item === undefined) return null;
    if (typeof item === 'string') return item.slice(0, 1000);
    if (typeof item === 'boolean') return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (typeof item === 'bigint') return String(item).slice(0, 1000);
    if (typeof item !== 'object') return '[unsupported]';
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    try {
      const out: SanitizedValue[] | SanitizedRecord = Array.isArray(item) ? [] : Object.create(null);
      for (const key of Object.keys(item).slice(0, 50)) {
        if (remaining <= 0) break;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        const safeKey = key.slice(0, 100);
        const result = SENSITIVE_KEY_PATTERN.test(key)
          ? '[redacted]'
          : descriptor && Object.hasOwn(descriptor, 'value')
            ? visit(descriptor.value, level + 1)
            : '[accessor]';
        if (Array.isArray(out)) out.push(result);
        else out[safeKey] = result;
      }
      return out;
    } catch {
      return '[unavailable]';
    } finally {
      seen.delete(item);
    }
  }
  return visit(value, depth);
}

/** Trim and cap an error message so stack traces / huge payloads don't flood logs. */
export function sanitizedErrorMessage(err: string | Error | null | undefined): string {
  const message = (err as Error | null | undefined)?.message || String(err || 'Unknown error');
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
export async function logEvent(
  env: LoggingEnv | null | undefined,
  fields: LogEventFields = {}
): Promise<SanitizedRecord> {
  try {
    const {
      eventType,
      severity = 'info',
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

    const context = requestContext.getStore();
    const line = {
      eventType: eventType || 'unknown',
      severity,
      requestId: context?.requestId || requestId,
      route: context?.route || route,
      method: context?.method || method,
      durationMs: context ? Math.max(0, Date.now() - context.startedAt) : null,
      userId,
      organizationId,
      stripeEventId,
      jobId,
      errorName: errorName || (error && (error as Error).name) || null,
      errorMessage: error ? sanitizedErrorMessage(error) : null,
      retryable,
      deploymentVersion: context?.deploymentVersion || env?.AGAPAY_BUILD_SHA || 'unknown',
      timestamp: new Date().toISOString(),
      metadata: metadata ? sanitize(metadata) : null,
    };

    // The root is an internally constructed plain record; nested untrusted values
    // are bounded by sanitize. Preserve the existing outer catch on failures.
    const safeLine = sanitize(line) as SanitizedRecord;
    let payload = JSON.stringify(safeLine);
    if (new TextEncoder().encode(payload).length > MAX_LOG_BYTES) {
      safeLine.metadata = '[truncated: log size limit]';
      payload = JSON.stringify(safeLine);
    }
    if (new TextEncoder().encode(payload).length > MAX_LOG_BYTES) {
      payload = JSON.stringify({
        eventType: String(safeLine.eventType || 'unknown').slice(0, 100),
        severity: 'warn',
        metadata: '[truncated: log size limit]',
      });
    }
    if (severity === 'error' || severity === 'warn') {
      console.error(payload);
    } else {
      console.log(payload);
    }
    return safeLine;
  } catch {
    const fallback = { eventType: 'logging.failed', severity: 'error', timestamp: new Date().toISOString() };
    try {
      console.error(JSON.stringify(fallback));
    } catch {
      /* Logging must not break the caller. */
    }
    return fallback;
  }
}
