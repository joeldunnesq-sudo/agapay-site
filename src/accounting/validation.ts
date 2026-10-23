// AGAPAY Accounting Package 0.75E -- Central accounting validation helpers.
//
// Future accounting services should add validation here or behind this
// module, not inline throughout route handlers and services.

import { ValidationError } from './errors.js';

export interface GatewayRequestInput {
  parishId: unknown;
  capability: unknown;
  requestType: unknown;
}

// Type-only property views preserve the legacy truthiness checks. These do not
// claim that nested identifiers or the resolved database have been validated.
interface AccountingContextFields {
  parishId?: unknown;
  requestType?: unknown;
  correlationId?: unknown;
  user?: { id?: unknown } | null;
  membership?: { id?: unknown } | null;
  authorization?: { capability?: unknown } | null;
  accountingDatabase?: unknown;
}

export function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} is required.`, {
      details: { field: fieldName },
    });
  }
  return value.trim();
}

export function validateAccountingCapability(capability: unknown) {
  const normalized = requireNonEmptyString(capability, 'capability');
  if (!normalized.startsWith('accounting.') && !normalized.startsWith('ap.') && !normalized.startsWith('bank.')) {
    throw new ValidationError('Accounting gateway capability must belong to an accounting-adjacent domain.', {
      details: { capability: normalized },
    });
  }
  return normalized;
}

export function validateGatewayRequest({ parishId, capability, requestType }: GatewayRequestInput) {
  return {
    parishId: requireNonEmptyString(parishId, 'parishId'),
    capability: validateAccountingCapability(capability),
    requestType: requireNonEmptyString(requestType, 'requestType'),
  };
}

export function validateIdempotencyKey(key: unknown) {
  if (key == null || key === '') return '';
  const normalized = String(key).trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ValidationError('Idempotency key must be between 8 and 200 characters.', {
      details: { field: 'idempotencyKey' },
    });
  }
  return normalized;
}

export function validateAccountingContext<T>(context: T): T {
  if (!context || typeof context !== 'object') {
    throw new ValidationError('Accounting context is required.', { details: { field: 'context' } });
  }
  requireNonEmptyString((context as AccountingContextFields).parishId, 'context.parishId');
  requireNonEmptyString((context as AccountingContextFields).requestType, 'context.requestType');
  requireNonEmptyString((context as AccountingContextFields).correlationId, 'context.correlationId');
  if (!(context as AccountingContextFields).user?.id) {
    throw new ValidationError('Accounting context requires an authenticated user.', {
      details: { field: 'context.user' },
    });
  }
  if (!(context as AccountingContextFields).membership?.id) {
    throw new ValidationError('Accounting context requires an active parish membership.', {
      details: { field: 'context.membership' },
    });
  }
  if (!(context as AccountingContextFields).authorization?.capability) {
    throw new ValidationError('Accounting context requires an authorization capability.', {
      details: { field: 'context.authorization.capability' },
    });
  }
  if (!(context as AccountingContextFields).accountingDatabase) {
    throw new ValidationError('Accounting context requires accounting database resolution.', {
      details: { field: 'context.accountingDatabase' },
    });
  }
  return context;
}

export function validateAccountingDate(entryDate: unknown) {
  const date =
    typeof entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entryDate) ? new Date(`${entryDate}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entryDate) {
    throw new ValidationError('A valid entry date is required.');
  }
  return entryDate;
}

export function validateJournalDraftInput({
  entryDate,
  description,
  lines,
}: {
  entryDate: unknown;
  description: unknown;
  lines: readonly { accountId: unknown; fundId: unknown; debitAmount?: unknown; creditAmount?: unknown }[];
}) {
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
