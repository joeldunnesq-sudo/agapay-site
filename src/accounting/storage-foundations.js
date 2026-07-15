// Phase 0.75I: storage, backup, restore, and migration-orchestration guardrails.

import { ValidationError } from "./errors.js";
import { requireNonEmptyString } from "./validation.js";

export const ACCOUNTING_R2_ALLOWED_CONTENT_TYPES = Object.freeze([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/json"
]);

export const ACCOUNTING_DOCUMENT_CLASSES = Object.freeze([
  "receipt",
  "invoice",
  "statement",
  "export",
  "backup",
  "import"
]);

export const BACKUP_STATES = Object.freeze(["requested", "running", "completed", "failed", "expired"]);
export const RESTORE_STATES = Object.freeze(["requested", "validating", "ready", "rejected", "completed", "failed"]);

const BACKUP_TRANSITIONS = Object.freeze({
  requested: ["running", "failed"],
  running: ["completed", "failed"],
  completed: ["expired"],
  failed: [],
  expired: []
});

const RESTORE_TRANSITIONS = Object.freeze({
  requested: ["validating", "rejected"],
  validating: ["ready", "rejected", "failed"],
  ready: ["completed", "failed"],
  rejected: [],
  completed: [],
  failed: []
});

export function sanitizeStorageSegment(value, fieldName = "segment") {
  const segment = requireNonEmptyString(String(value || ""), fieldName)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!segment || segment === "." || segment === "..") {
    throw new ValidationError("Storage segment is not usable.", { details: { field: fieldName } });
  }
  return segment;
}

export function createAccountingR2ObjectKey({
  environment,
  parishId,
  documentClass,
  objectId,
  version = 1,
  extension = "bin"
} = {}) {
  if (!ACCOUNTING_DOCUMENT_CLASSES.includes(documentClass)) {
    throw new ValidationError("Unsupported accounting document class.", { details: { documentClass } });
  }
  return [
    "accounting",
    sanitizeStorageSegment(environment, "environment"),
    sanitizeStorageSegment(parishId, "parishId"),
    sanitizeStorageSegment(documentClass, "documentClass"),
    `v${Number(version || 1)}`,
    `${sanitizeStorageSegment(objectId, "objectId")}.${sanitizeStorageSegment(extension, "extension")}`
  ].join("/");
}

export function validateAccountingDocumentUpload({
  contentType,
  sizeBytes,
  checksum,
  parishId,
  requesterParishId
} = {}) {
  if (!ACCOUNTING_R2_ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new ValidationError("Unsupported accounting document content type.", { details: { contentType } });
  }
  if (Number(sizeBytes || 0) <= 0 || Number(sizeBytes || 0) > 25 * 1024 * 1024) {
    throw new ValidationError("Accounting document size is outside the allowed range.", { details: { sizeBytes } });
  }
  requireNonEmptyString(checksum, "checksum");
  if (parishId && requesterParishId && parishId !== requesterParishId) {
    throw new ValidationError("Requester cannot access another parish accounting object.", { details: { parishId, requesterParishId } });
  }
  return true;
}

export function assertStateTransition(kind, fromState, toState) {
  const map = kind === "restore" ? RESTORE_TRANSITIONS : BACKUP_TRANSITIONS;
  const allowed = map[fromState] || [];
  if (!allowed.includes(toState)) {
    throw new ValidationError("Accounting state transition is not allowed.", {
      details: { kind, fromState, toState }
    });
  }
  return true;
}

export function createBackupRequest({ environment, tenantId = "platform", requestedBy, archivedTenant = false } = {}) {
  return {
    kind: "backup",
    state: "requested",
    environment: sanitizeStorageSegment(environment, "environment"),
    tenantId: sanitizeStorageSegment(tenantId, "tenantId"),
    requestedBy: requireNonEmptyString(requestedBy, "requestedBy"),
    archivedTenant: Boolean(archivedTenant),
    duplicateKey: `backup:${environment}:${tenantId}`,
    requestedAt: new Date().toISOString()
  };
}

export function createMigrationOrchestrationPlan({
  environment,
  migrationId,
  lockId,
  schemaDriftDetected = false,
  canaryStatus = "pending",
  perParishDivergence = false
} = {}) {
  const plan = {
    environment: sanitizeStorageSegment(environment, "environment"),
    migrationId: requireNonEmptyString(migrationId, "migrationId"),
    lockId: requireNonEmptyString(lockId, "lockId"),
    schemaDriftDetected: Boolean(schemaDriftDetected),
    canaryStatus,
    perParishDivergence: Boolean(perParishDivergence),
    allowed: true,
    blockers: []
  };
  if (plan.schemaDriftDetected) plan.blockers.push("schema_drift_detected");
  if (plan.canaryStatus === "failed") plan.blockers.push("canary_failed");
  if (plan.perParishDivergence) plan.blockers.push("per_parish_divergence");
  plan.allowed = plan.blockers.length === 0;
  return plan;
}
