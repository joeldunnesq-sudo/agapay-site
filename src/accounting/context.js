// AGAPAY Accounting Package 0.75E -- Accounting Context.
//
// Future accounting services receive this context object from the gateway.
// They should not re-authenticate, re-query membership, or independently
// resolve an accounting database.

import { validateAccountingContext, validateIdempotencyKey } from "./validation.js";

export const ACCOUNTING_GATEWAY_CONTEXT = Symbol.for("agapay.accounting.gateway_context");

function requestHeader(request, name) {
  return request?.headers?.get?.(name) || "";
}

export function correlationIdForAccountingRequest(request) {
  return requestHeader(request, "X-Request-Id") || crypto.randomUUID();
}

export function requestMetadataForAccounting(request) {
  const url = request?.url || "";
  return Object.freeze({
    method: request?.method || "",
    url,
    path: url ? new URL(url).pathname : "",
    userAgent: requestHeader(request, "User-Agent"),
    ipAddress: requestHeader(request, "CF-Connecting-IP") || requestHeader(request, "X-Forwarded-For")
  });
}

export function prepareIdempotencyContext({ parishId, requestType, idempotencyKey = "", request = null } = {}) {
  const explicit = validateIdempotencyKey(idempotencyKey);
  const header = validateIdempotencyKey(requestHeader(request, "Idempotency-Key"));
  const key = explicit || header;
  return Object.freeze({
    key,
    source: key ? (explicit ? "explicit" : "request_header") : "not_provided",
    scope: `${parishId || "unknown"}:${requestType || "unknown"}`,
    duplicateDetectionReady: false
  });
}

export function createAccountingContext({
  request,
  parishId,
  requestType,
  capability,
  authorization,
  accountingDatabase,
  idempotencyKey = "",
  metadata = {}
} = {}) {
  const context = {
    [ACCOUNTING_GATEWAY_CONTEXT]: true,
    parishId,
    requestType,
    user: authorization?.user || null,
    membership: authorization?.membership || null,
    authorization: {
      capability,
      capabilities: Object.freeze([...(authorization?.capabilities || [])])
    },
    correlationId: correlationIdForAccountingRequest(request),
    request: requestMetadataForAccounting(request),
    audit: Object.freeze({
      actorUserId: authorization?.user?.id || "",
      actorType: "platform_user",
      parishId,
      membershipId: authorization?.membership?.id || "",
      requestType,
      futureTransactionId: ""
    }),
    idempotency: prepareIdempotencyContext({ parishId, requestType, idempotencyKey, request }),
    accountingDatabase,
    transaction: Object.freeze({
      lifecycle: "not_started",
      futureTransactionId: ""
    }),
    metadata: Object.freeze({ ...metadata })
  };

  validateAccountingContext(context);
  return Object.freeze(context);
}

export function isAccountingGatewayContext(context) {
  return Boolean(context?.[ACCOUNTING_GATEWAY_CONTEXT]);
}
