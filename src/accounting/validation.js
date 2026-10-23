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
function validateAccountingDate(entryDate) {
  const date =
    typeof entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
      ? /* @__PURE__ */ new Date(`${entryDate}T00:00:00Z`)
      : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entryDate) {
    throw new ValidationError('A valid entry date is required.');
  }
  return entryDate;
}
function validateJournalDraftInput({ entryDate, description, lines }) {
  validateAccountingDate(entryDate);
  requireNonEmptyString(description, 'description');
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new ValidationError('A description and at least two lines are required.');
  }
  let debits = 0,
    credits = 0;
  for (const line of lines) {
    if (!line || typeof line !== 'object') throw new ValidationError('Each journal line is required.');
    requireNonEmptyString(line.accountId, 'accountId');
    requireNonEmptyString(line.fundId, 'fundId');
    const debit = Number(line.debitAmount ?? 0),
      credit = Number(line.creditAmount ?? 0);
    if (
      !Number.isSafeInteger(debit) ||
      !Number.isSafeInteger(credit) ||
      debit < 0 ||
      credit < 0 ||
      debit > 0 === credit > 0
    ) {
      throw new ValidationError('Each line must contain one positive integer debit or credit amount.');
    }
    debits += debit;
    credits += credit;
    if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits)) {
      throw new ValidationError('Journal totals exceed the supported whole-cent range.');
    }
  }
}
export {
  requireNonEmptyString,
  validateAccountingCapability,
  validateAccountingContext,
  validateAccountingDate,
  validateGatewayRequest,
  validateIdempotencyKey,
  validateJournalDraftInput,
};
