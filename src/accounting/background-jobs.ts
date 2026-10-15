export interface AccountingJobInput {
  type?: unknown;
  parishId?: string;
  payload?: unknown;
  correlationId?: string;
  idempotencyKey?: string;
  createdAt?: string;
  attempt?: unknown;
}
export interface JobError {
  code?: unknown;
  name?: unknown;
  message?: unknown;
}
export interface RetryEnvelope {
  type?: string;
  parishId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  attempt?: unknown;
  maxAttempts?: unknown;
}
// Phase 0.75F: background job contract. These envelopes are transport-neutral
// and can be delivered by Queues, Workflows, Cron, or manual admin actions.

import { ValidationError } from './errors.js';
import { requireNonEmptyString } from './validation.js';

export const ACCOUNTING_JOB_SCHEMA_VERSION = 1;

export const ACCOUNTING_JOB_TYPES = Object.freeze({
  STRIPE_SOURCE_EVENT_READY: 'stripe.source_event.ready',
  ACCOUNTING_POSTING_RETRY: 'accounting.posting.retry',
  ACCOUNTING_DATABASE_PROVISION: 'accounting.database.provision',
  ACCOUNTING_MIGRATION_APPLY: 'accounting.migration.apply',
  ACCOUNTING_BACKUP_EXPORT: 'accounting.backup.export',
  ACCOUNTING_RESTORE_VALIDATE: 'accounting.restore.validate',
  ACCOUNTING_REPORT_GENERATE: 'accounting.report.generate',
  ACCOUNTING_INTEGRITY_SCAN: 'accounting.integrity.scan',
  ACCOUNTING_RECOVERY_VERIFY: 'accounting.recovery.verify',
  ACCOUNTING_EXPORT_GENERATE: 'accounting.export.generate',
  APLOS_IMPORT: 'aplos.import',
});

export const ACCOUNTING_JOB_PRIMITIVES = Object.freeze({
  QUEUE: 'queue',
  WORKFLOW: 'workflow',
  CRON: 'cron',
  MANUAL: 'manual',
});

const JOB_REGISTRY = Object.freeze({
  [ACCOUNTING_JOB_TYPES.STRIPE_SOURCE_EVENT_READY]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.QUEUE,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 5,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_POSTING_RETRY]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.QUEUE,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 5,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_DATABASE_PROVISION]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 3,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_MIGRATION_APPLY]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: false,
    maxAttempts: 1,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_BACKUP_EXPORT]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.CRON,
    requiresGateway: true,
    requiresParish: false,
    maxAttempts: 3,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_RESTORE_VALIDATE]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 1,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_REPORT_GENERATE]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.QUEUE,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 3,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_INTEGRITY_SCAN]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 3,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_RECOVERY_VERIFY]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 1,
  },
  [ACCOUNTING_JOB_TYPES.ACCOUNTING_EXPORT_GENERATE]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.QUEUE,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 3,
  },
  [ACCOUNTING_JOB_TYPES.APLOS_IMPORT]: {
    primitive: ACCOUNTING_JOB_PRIMITIVES.WORKFLOW,
    requiresGateway: true,
    requiresParish: true,
    maxAttempts: 1,
  },
});

const FORBIDDEN_PAYLOAD_KEYS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'privateKey',
  'database',
  'binding',
  'dsn',
  'connectionString',
];

function assertNoForbiddenPayloadKeys(value: unknown, path = 'payload') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS.some((forbidden) => normalized.includes(forbidden.toLowerCase()))) {
      throw new ValidationError('Accounting job payload contains a forbidden field.', {
        details: { field: `${path}.${key}` },
      });
    }
    assertNoForbiddenPayloadKeys(child, `${path}.${key}`);
  }
}

export function accountingJobDefinition(type: string) {
  return JOB_REGISTRY[type as keyof typeof JOB_REGISTRY] || null;
}

export function createAccountingJobEnvelope({
  type,
  parishId = '',
  payload = {},
  correlationId = '',
  idempotencyKey = '',
  createdAt = new Date().toISOString(),
  attempt = 0,
}: AccountingJobInput = {}) {
  const jobType = requireNonEmptyString(type, 'type');
  const definition = accountingJobDefinition(jobType);
  if (!definition) {
    throw new ValidationError('Unknown accounting job type.', { details: { type: jobType } });
  }
  if (definition.requiresParish) requireNonEmptyString(parishId, 'parishId');
  requireNonEmptyString(correlationId, 'correlationId');
  assertNoForbiddenPayloadKeys(payload);
  return {
    schemaVersion: ACCOUNTING_JOB_SCHEMA_VERSION,
    type: jobType,
    primitive: definition.primitive,
    requiresAccountingGateway: definition.requiresGateway,
    parishId,
    payload,
    correlationId,
    idempotencyKey: idempotencyKey || `${jobType}:${parishId || 'platform'}:${correlationId}`,
    attempt: Number(attempt || 0),
    maxAttempts: definition.maxAttempts,
    createdAt,
  };
}

export function parseAccountingJobEnvelope(value: unknown) {
  const envelope = (typeof value === 'string' ? JSON.parse(value) : value) as
    (AccountingJobInput & { schemaVersion?: unknown }) | null | undefined;
  if (envelope?.schemaVersion !== ACCOUNTING_JOB_SCHEMA_VERSION) {
    throw new ValidationError('Unsupported accounting job schema version.', {
      details: { schemaVersion: envelope?.schemaVersion },
    });
  }
  return createAccountingJobEnvelope(envelope);
}

export function classifyAccountingJobError(error: JobError = {}) {
  const code = String(error.code || error.name || '');
  if (['ValidationError', 'CapabilityDeniedError', 'AuthorizationError', 'DomainBoundaryError'].includes(code)) {
    return { retryable: false, reason: code };
  }
  if (code === 'ClosedPeriodError' || code === 'DuplicatePostingError') {
    return { retryable: false, reason: code };
  }
  return { retryable: true, reason: code || 'transient_error' };
}

export function shouldRetryAccountingJob(envelope: RetryEnvelope = {}, error: JobError = {}) {
  const classification = classifyAccountingJobError(error);
  if (!classification.retryable) return false;
  return Number(envelope.attempt || 0) + 1 < Number(envelope.maxAttempts || 0);
}

export function createFailedAccountingJobRecord(envelope: RetryEnvelope = {}, error: JobError = {}) {
  return {
    jobType: envelope.type || '',
    parishId: envelope.parishId || '',
    correlationId: envelope.correlationId || '',
    idempotencyKey: envelope.idempotencyKey || '',
    attempt: Number(envelope.attempt || 0),
    maxAttempts: Number(envelope.maxAttempts || 0),
    retryable: shouldRetryAccountingJob(envelope, error),
    errorName: String(error.name || error.code || 'Error'),
    errorMessage: String(error.message || '').slice(0, 500),
    failedAt: new Date().toISOString(),
  };
}
