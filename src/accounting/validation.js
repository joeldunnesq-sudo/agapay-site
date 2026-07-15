// AGAPAY Accounting Package 0.75E -- Central accounting validation helpers.
//
// Future accounting services should add validation here or behind this
// module, not inline throughout route handlers and services.

import { ValidationError } from "./errors.js";

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${fieldName} is required.`, {
      details: { field: fieldName }
    });
  }
  return value.trim();
}

export function validateAccountingCapability(capability) {
  const normalized = requireNonEmptyString(capability, "capability");
  if (!normalized.startsWith("accounting.") && !normalized.startsWith("ap.") && !normalized.startsWith("bank.")) {
    throw new ValidationError("Accounting gateway capability must belong to an accounting-adjacent domain.", {
      details: { capability: normalized }
    });
  }
  return normalized;
}

export function validateGatewayRequest({ parishId, capability, requestType }) {
  return {
    parishId: requireNonEmptyString(parishId, "parishId"),
    capability: validateAccountingCapability(capability),
    requestType: requireNonEmptyString(requestType, "requestType")
  };
}

export function validateIdempotencyKey(key) {
  if (key == null || key === "") return "";
  const normalized = String(key).trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ValidationError("Idempotency key must be between 8 and 200 characters.", {
      details: { field: "idempotencyKey" }
    });
  }
  return normalized;
}

export function validateAccountingContext(context) {
  if (!context || typeof context !== "object") {
    throw new ValidationError("Accounting context is required.", { details: { field: "context" } });
  }
  requireNonEmptyString(context.parishId, "context.parishId");
  requireNonEmptyString(context.requestType, "context.requestType");
  requireNonEmptyString(context.correlationId, "context.correlationId");
  if (!context.user?.id) {
    throw new ValidationError("Accounting context requires an authenticated user.", {
      details: { field: "context.user" }
    });
  }
  if (!context.membership?.id) {
    throw new ValidationError("Accounting context requires an active parish membership.", {
      details: { field: "context.membership" }
    });
  }
  if (!context.authorization?.capability) {
    throw new ValidationError("Accounting context requires an authorization capability.", {
      details: { field: "context.authorization.capability" }
    });
  }
  if (!context.accountingDatabase) {
    throw new ValidationError("Accounting context requires accounting database resolution.", {
      details: { field: "context.accountingDatabase" }
    });
  }
  return context;
}
