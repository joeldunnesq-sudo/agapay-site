// Generated from src/lib/logging.ts by npm run build:server. Do not edit.
import { requestContext } from './request-context.js';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|signature|api[_-]?key|card|cvv|ssn)/i;
const MAX_LOG_BYTES = 16e3;
function sanitize(value, depth = 0) {
  const seen = /* @__PURE__ */ new WeakSet();
  let remaining = 200;
  function visit(item, level) {
    if (remaining-- <= 0 || level > 4) return '[truncated]';
    if (item === null || item === void 0) return null;
    if (typeof item === 'string') return item.slice(0, 1e3);
    if (typeof item === 'boolean') return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (typeof item === 'bigint') return String(item).slice(0, 1e3);
    if (typeof item !== 'object') return '[unsupported]';
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    try {
      const out = Array.isArray(item) ? [] : /* @__PURE__ */ Object.create(null);
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
function sanitizedErrorMessage(err) {
  const message = err?.message || String(err || 'Unknown error');
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}
async function logEvent(env, fields = {}) {
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
      errorName: errorName || (error && error.name) || null,
      errorMessage: error ? sanitizedErrorMessage(error) : null,
      retryable,
      deploymentVersion: context?.deploymentVersion || env?.AGAPAY_BUILD_SHA || 'unknown',
      timestamp: /* @__PURE__ */ new Date().toISOString(),
      metadata: metadata ? sanitize(metadata) : null,
    };
    const safeLine = sanitize(line);
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
    const fallback = {
      eventType: 'logging.failed',
      severity: 'error',
      timestamp: /* @__PURE__ */ new Date().toISOString(),
    };
    try {
      console.error(JSON.stringify(fallback));
    } catch {}
    return fallback;
  }
}
export { logEvent, sanitize, sanitizedErrorMessage };
