// Generated from src/accounting/validation.ts by npm run build:server. Do not edit.
import { ValidationError } from './errors.js';
function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} is required.`, {
      details: { field: fieldName },
    });
  }
  return value.trim();
}
function validateAccountingCapability(capability) {
  const normalized = requireNonEmptyString(capability, 'capability');
  if (!normalized.startsWith('accounting.') && !normalized.startsWith('ap.') && !normalized.startsWith('bank.')) {
    throw new ValidationError('Accounting gateway capability must belong to an accounting-adjacent domain.', {
      details: { capability: normalized },
    });
  }
  return normalized;
}
function validateGatewayRequest({ parishId, capability, requestType }) {
  return {
    parishId: requireNonEmptyString(parishId, 'parishId'),
    capability: validateAccountingCapability(capability),
    requestType: requireNonEmptyString(requestType, 'requestType'),
  };
}
function validateIdempotencyKey(key) {
  if (key == null || key === '') return '';
  const normalized = String(key).trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ValidationError('Idempotency key must be between 8 and 200 characters.', {
      details: { field: 'idempotencyKey' },
    });
  }
  return normalized;
}
function validateAccountingContext(context) {
  if (!context || typeof context !== 'object') {
    throw new ValidationError('Accounting context is required.', { details: { field: 'context' } });
  }
  requireNonEmptyString(context.parishId, 'context.parishId');
  requireNonEmptyString(context.requestType, 'context.requestType');
  requireNonEmptyString(context.correlationId, 'context.correlationId');
  if (!context.user?.id) {
    throw new ValidationError('Accounting context requires an authenticated user.', {
      details: { field: 'context.user' },
    });
  }
  if (!context.membership?.id) {
    throw new ValidationError('Accounting context requires an active parish membership.', {
      details: { field: 'context.membership' },
    });
  }
  if (!context.authorization?.capability) {
    throw new ValidationError('Accounting context requires an authorization capability.', {
      details: { field: 'context.authorization.capability' },
    });
  }
  if (!context.accountingDatabase) {
    throw new ValidationError('Accounting context requires accounting database resolution.', {
      details: { field: 'context.accountingDatabase' },
    });
  }
  return context;
}
export {
  requireNonEmptyString,
  validateAccountingCapability,
  validateAccountingContext,
  validateGatewayRequest,
  validateIdempotencyKey,
};
