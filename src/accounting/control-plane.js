// Phase 1A: central accounting control-plane registry and lifecycle service.
//
// This is not the ledger. It records only ownership, lifecycle, database
// registry metadata, health, schema version state, and audit events.

import { d1, d1All, d1First, d1Run, generateSecret } from "../lib/core.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import { createAccountingConfiguration } from "./environment.js";
import { AccountingConfigurationError, AccountingDatabaseError, ValidationError } from "./errors.js";
import { requireNonEmptyString } from "./validation.js";

export const ACCOUNTING_ENTITY_STATES = Object.freeze([
  "not_enabled",
  "provisioning",
  "provisioned",
  "migrating",
  "ready",
  "suspended",
  "archived"
]);

export const ACCOUNTING_ACTIVATION_STATUSES = Object.freeze([
  "inactive",
  "active",
  "suspended",
  "archived"
]);

export const ACCOUNTING_DATABASE_PROVISIONING_STATUSES = Object.freeze([
  "pending",
  "provisioning",
  "provisioned",
  "migration_pending",
  "migrating",
  "ready",
  "failed"
]);

export const ACCOUNTING_DATABASE_HEALTH_STATUSES = Object.freeze([
  "unknown",
  "healthy",
  "degraded",
  "unhealthy",
  "blocked"
]);

export const ACCOUNTING_LIFECYCLE_TRANSITIONS = Object.freeze({
  not_enabled: Object.freeze(["provisioning"]),
  provisioning: Object.freeze(["provisioned", "suspended", "archived"]),
  provisioned: Object.freeze(["migrating", "suspended", "archived"]),
  migrating: Object.freeze(["ready", "suspended", "archived"]),
  ready: Object.freeze(["migrating", "suspended", "archived"]),
  suspended: Object.freeze(["ready", "archived"]),
  archived: Object.freeze([])
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeEnvironment(env, environment = "") {
  return createAccountingConfiguration(env, { environment }).environment;
}

function lifecycleTimestampColumns(toState) {
  if (toState === "ready") return { activationStatus: "active", enabledAt: nowIso(), suspendedAt: null, archivedAt: null };
  if (toState === "suspended") return { activationStatus: "suspended", suspendedAt: nowIso() };
  if (toState === "archived") return { activationStatus: "archived", archivedAt: nowIso() };
  return { activationStatus: "inactive" };
}

function assertCentralStore(env) {
  if (!d1(env)) {
    throw new AccountingConfigurationError("Central AGAPAY database is required for the accounting control plane.");
  }
}

export function assertAccountingLifecycleTransition(fromState, toState) {
  if (!ACCOUNTING_ENTITY_STATES.includes(fromState) || !ACCOUNTING_ENTITY_STATES.includes(toState)) {
    throw new ValidationError("Unknown accounting lifecycle state.", { details: { fromState, toState } });
  }
  if (!(ACCOUNTING_LIFECYCLE_TRANSITIONS[fromState] || []).includes(toState)) {
    throw new ValidationError("Accounting lifecycle transition is not allowed.", { details: { fromState, toState } });
  }
  return true;
}

export function activationStatusForLifecycle(entityStatus) {
  if (entityStatus === "ready") return "active";
  if (entityStatus === "suspended") return "suspended";
  if (entityStatus === "archived") return "archived";
  return "inactive";
}

function toEntity(row = {}) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    parishId: row.parish_id,
    entityStatus: row.entity_status,
    activationStatus: row.activation_status,
    subscriptionTier: row.subscription_tier,
    enabledAt: row.enabled_at,
    suspendedAt: row.suspended_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function toDatabase(row = {}) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    accountingEntityId: row.accounting_entity_id,
    environment: row.environment,
    schemaVersionId: row.schema_version_id || "",
    schemaVersion: Number(row.schema_version || 0),
    migrationVersion: row.migration_version,
    provisioningStatus: row.provisioning_status,
    healthStatus: row.health_status,
    provisionedAt: row.provisioned_at,
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function auditLifecycle(env, request, {
  action,
  actorUserId = "",
  actorType = "system",
  parishId,
  entityId,
  databaseId = "",
  reason = "",
  before = null,
  after = null,
  correlationId = ""
} = {}) {
  await recordAuditEvent(env, request, {
    action,
    actorUserId,
    actorType,
    targetType: "accounting_entity",
    targetId: entityId,
    organizationId: parishId,
    requestId: correlationId,
    reason,
    before,
    after,
    metadata: databaseId ? { accountingDatabaseRegistryId: databaseId } : null
  });
}

async function insertLifecycleEvent(env, {
  entityId,
  databaseId = "",
  eventType,
  fromState = "",
  toState = "",
  actorUserId = "",
  actorType = "system",
  reason = "",
  correlationId = ""
} = {}) {
  const id = generateSecret("acct_evt");
  await d1Run(
    env,
    `INSERT INTO accounting_lifecycle_events
       (id, accounting_entity_id, accounting_database_id, event_type, from_state, to_state,
        actor_user_id, actor_type, reason, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entityId,
    databaseId || null,
    eventType,
    fromState || null,
    toState || null,
    actorUserId || null,
    actorType,
    reason || null,
    correlationId || null,
    nowIso()
  );
  return id;
}

export async function loadAccountingEntityByParish(env, parishId) {
  assertCentralStore(env);
  const row = await d1First(env, "SELECT * FROM accounting_entities WHERE parish_id = ?", requireNonEmptyString(parishId, "parishId"));
  return toEntity(row);
}

export async function loadAccountingDatabaseForEntity(env, entityId, environment = "production") {
  assertCentralStore(env);
  const row = await d1First(
    env,
    "SELECT * FROM accounting_databases WHERE accounting_entity_id = ? AND environment = ?",
    requireNonEmptyString(entityId, "entityId"),
    normalizeEnvironment(env, environment)
  );
  return toDatabase(row);
}

// Server-only provisioning metadata. Never return this object from an API.
export async function loadAccountingDatabaseProviderRecord(env, entityId, environment = "production") {
  assertCentralStore(env);
  const row = await d1First(env, "SELECT id, accounting_entity_id, environment, database_identifier FROM accounting_databases WHERE accounting_entity_id = ? AND environment = ?", requireNonEmptyString(entityId, "entityId"), normalizeEnvironment(env, environment));
  return row ? Object.freeze({ id: row.id, accountingEntityId: row.accounting_entity_id, environment: row.environment, databaseIdentifier: row.database_identifier }) : null;
}

export async function setAccountingDatabaseProvisioningStatus(env, { entityId, environment = "production", status, healthStatus = "unknown" } = {}) {
  if (!ACCOUNTING_DATABASE_PROVISIONING_STATUSES.includes(status)) throw new ValidationError("Unknown accounting provisioning status.");
  if (!ACCOUNTING_DATABASE_HEALTH_STATUSES.includes(healthStatus)) throw new ValidationError("Unknown accounting health status.");
  await d1Run(env, `UPDATE accounting_databases SET provisioning_status = ?, health_status = ?, updated_at = ? WHERE accounting_entity_id = ? AND environment = ?`, status, healthStatus, nowIso(), requireNonEmptyString(entityId, "entityId"), normalizeEnvironment(env, environment));
  return loadAccountingDatabaseForEntity(env, entityId, environment);
}

export async function registerAccountingEntity(env, {
  parishId,
  subscriptionTier = "mission",
  environment = "production",
  databaseIdentifier = "",
  actorUserId = "",
  actorType = "system",
  reason = "Phase 1A accounting registration",
  request = null,
  correlationId = ""
} = {}) {
  assertCentralStore(env);
  const normalizedParishId = requireNonEmptyString(parishId, "parishId");
  const normalizedEnvironment = normalizeEnvironment(env, environment);
  const existing = await loadAccountingEntityByParish(env, normalizedParishId);
  if (existing) return existing;

  const entityId = generateSecret("acct_entity");
  const databaseId = generateSecret("acct_db");
  const now = nowIso();
  const identifier = databaseIdentifier || `accounting-${normalizedEnvironment}-${normalizedParishId}`;

  await d1Run(
    env,
    `INSERT INTO accounting_entities
       (id, parish_id, entity_status, activation_status, subscription_tier, created_at, updated_at)
     VALUES (?, ?, 'provisioning', 'inactive', ?, ?, ?)`,
    entityId,
    normalizedParishId,
    subscriptionTier,
    now,
    now
  );

  await d1Run(
    env,
    `INSERT INTO accounting_databases
       (id, accounting_entity_id, environment, database_identifier, schema_version, migration_version,
        provisioning_status, health_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 'none', 'provisioning', 'unknown', ?, ?)`,
    databaseId,
    entityId,
    normalizedEnvironment,
    identifier,
    now,
    now
  );

  await insertLifecycleEvent(env, {
    entityId,
    databaseId,
    eventType: "accounting.enabled",
    fromState: "not_enabled",
    toState: "provisioning",
    actorUserId,
    actorType,
    reason,
    correlationId
  });
  const entity = await loadAccountingEntityByParish(env, normalizedParishId);
  await auditLifecycle(env, request, {
    action: "accounting.enabled",
    actorUserId,
    actorType,
    parishId: normalizedParishId,
    entityId,
    databaseId,
    reason,
    after: entity,
    correlationId
  });
  return entity;
}

export async function transitionAccountingEntity(env, {
  parishId,
  toState,
  actorUserId = "",
  actorType = "system",
  reason = "",
  request = null,
  correlationId = ""
} = {}) {
  assertCentralStore(env);
  const entity = await loadAccountingEntityByParish(env, parishId);
  if (!entity) throw new AccountingConfigurationError("Accounting entity is not registered.", { details: { parishId } });
  assertAccountingLifecycleTransition(entity.entityStatus, toState);
  const stamps = lifecycleTimestampColumns(toState);
  const now = nowIso();
  await d1Run(
    env,
    `UPDATE accounting_entities
     SET entity_status = ?, activation_status = ?, enabled_at = COALESCE(?, enabled_at),
         suspended_at = ?, archived_at = ?, updated_at = ?
     WHERE id = ?`,
    toState,
    stamps.activationStatus,
    stamps.enabledAt || null,
    Object.prototype.hasOwnProperty.call(stamps, "suspendedAt") ? stamps.suspendedAt : entity.suspendedAt,
    Object.prototype.hasOwnProperty.call(stamps, "archivedAt") ? stamps.archivedAt : entity.archivedAt,
    now,
    entity.id
  );
  const after = await loadAccountingEntityByParish(env, parishId);
  const database = await loadAccountingDatabaseForEntity(env, entity.id);
  await insertLifecycleEvent(env, {
    entityId: entity.id,
    databaseId: database?.id || "",
    eventType: `accounting.${toState}`,
    fromState: entity.entityStatus,
    toState,
    actorUserId,
    actorType,
    reason,
    correlationId
  });
  await auditLifecycle(env, request, {
    action: `accounting.${toState}`,
    actorUserId,
    actorType,
    parishId,
    entityId: entity.id,
    databaseId: database?.id || "",
    reason,
    before: entity,
    after,
    correlationId
  });
  return after;
}

export async function recordProvisioningCompleted(env, {
  parishId,
  environment = "production",
  actorUserId = "",
  actorType = "system",
  reason = "Provisioning completed",
  request = null,
  correlationId = ""
} = {}) {
  const entity = await transitionAccountingEntity(env, { parishId, toState: "provisioned", actorUserId, actorType, reason, request, correlationId });
  const database = await loadAccountingDatabaseForEntity(env, entity.id, environment);
  if (database) {
    await d1Run(
      env,
      `UPDATE accounting_databases
       SET provisioning_status = 'provisioned', health_status = 'unknown',
           provisioned_at = COALESCE(provisioned_at, ?), updated_at = ?
       WHERE id = ?`,
      nowIso(),
      nowIso(),
      database.id
    );
    await auditLifecycle(env, request, {
      action: "accounting.provisioning_completed",
      actorUserId,
      actorType,
      parishId,
      entityId: entity.id,
      databaseId: database.id,
      reason,
      after: await loadAccountingDatabaseForEntity(env, entity.id, environment),
      correlationId
    });
  }
  return loadAccountingEntityByParish(env, parishId);
}

export async function updateAccountingSchemaVersion(env, {
  parishId,
  environment = "production",
  schemaVersion,
  migrationVersion,
  schemaVersionId = "",
  actorUserId = "",
  actorType = "system",
  reason = "Schema version updated",
  request = null,
  correlationId = ""
} = {}) {
  assertCentralStore(env);
  const entity = await loadAccountingEntityByParish(env, parishId);
  if (!entity) throw new AccountingConfigurationError("Accounting entity is not registered.", { details: { parishId } });
  const database = await loadAccountingDatabaseForEntity(env, entity.id, environment);
  if (!database) throw new AccountingDatabaseError("Accounting database registry row is missing.", { details: { parishId, environment } });
  const numericSchemaVersion = Number(schemaVersion);
  if (!Number.isInteger(numericSchemaVersion) || numericSchemaVersion < 0) {
    throw new ValidationError("schemaVersion must be a non-negative integer.", { details: { schemaVersion } });
  }
  requireNonEmptyString(migrationVersion, "migrationVersion");
  await d1Run(
    env,
    `UPDATE accounting_databases
     SET schema_version_id = ?, schema_version = ?, migration_version = ?, provisioning_status = 'ready',
         health_status = 'healthy', last_validated_at = ?, updated_at = ?
     WHERE id = ?`,
    schemaVersionId || null,
    numericSchemaVersion,
    migrationVersion,
    nowIso(),
    nowIso(),
    database.id
  );
  const after = await loadAccountingDatabaseForEntity(env, entity.id, environment);
  await insertLifecycleEvent(env, {
    entityId: entity.id,
    databaseId: database.id,
    eventType: "accounting.schema_updated",
    fromState: entity.entityStatus,
    toState: entity.entityStatus,
    actorUserId,
    actorType,
    reason,
    correlationId
  });
  await auditLifecycle(env, request, {
    action: "accounting.schema_updated",
    actorUserId,
    actorType,
    parishId,
    entityId: entity.id,
    databaseId: database.id,
    reason,
    before: database,
    after,
    correlationId
  });
  return after;
}

export async function validateAccountingRegistry(env, { parishId, environment = "production" } = {}) {
  assertCentralStore(env);
  const issues = [];
  const entity = await loadAccountingEntityByParish(env, parishId);
  if (!entity) {
    issues.push({ code: "entity_missing", severity: "error" });
    return { ok: false, entity: null, database: null, issues };
  }
  const database = await loadAccountingDatabaseForEntity(env, entity.id, environment);
  if (!database) issues.push({ code: "database_missing", severity: "error" });
  if (entity.entityStatus === "archived") issues.push({ code: "entity_archived", severity: "error" });
  if (entity.entityStatus === "suspended") issues.push({ code: "entity_suspended", severity: "error" });
  if (database && entity.entityStatus === "ready" && database.provisioningStatus !== "ready") {
    issues.push({ code: "provisioning_mismatch", severity: "error" });
  }
  if (database && entity.entityStatus === "ready" && database.schemaVersion <= 0) {
    issues.push({ code: "schema_version_missing", severity: "error" });
  }
  if (database && ["unhealthy", "blocked"].includes(database.healthStatus)) {
    issues.push({ code: "database_health_blocked", severity: "error" });
  }
  return { ok: issues.length === 0, entity, database, issues };
}

export async function validateAccountingEntityForUse(env, {
  parishId,
  environment = "production",
  actorUserId = "",
  actorType = "system",
  reason = "Accounting registry validation",
  request = null,
  correlationId = ""
} = {}) {
  const result = await validateAccountingRegistry(env, { parishId, environment });
  if (!result.ok) {
    await recordAuditEvent(env, request, {
      action: "accounting.validation_failed",
      actorUserId,
      actorType,
      targetType: "accounting_entity",
      targetId: result.entity?.id || parishId || "",
      organizationId: parishId,
      requestId: correlationId,
      reason,
      metadata: {
        issueCodes: result.issues.map((issue) => issue.code).join(",")
      }
    });
  }
  return result;
}

export async function resolveAccountingControlPlaneDatabase(env, {
  parishId,
  environment = "production",
  authenticatedParishId = "",
  user = null
} = {}) {
  assertCentralStore(env);
  const requestedParishId = requireNonEmptyString(parishId, "parishId");
  const authParishId = requireNonEmptyString(authenticatedParishId || parishId, "authenticatedParishId");
  if (requestedParishId !== authParishId) {
    throw new AccountingDatabaseError("Cross-parish accounting database resolution is denied.", {
      details: { parishId: requestedParishId, authenticatedParishId: authParishId }
    });
  }
  const validation = await validateAccountingRegistry(env, { parishId: requestedParishId, environment });
  if (!validation.ok) {
    const blocking = validation.issues.map((issue) => issue.code);
    throw new AccountingDatabaseError("Accounting database is not safe to use.", {
      details: { parishId: requestedParishId, blockers: blocking, userId: user?.id || "" }
    });
  }
  return Object.freeze({
    status: "active",
    parishId: requestedParishId,
    environment: validation.database.environment,
    binding: null,
    registryRecord: Object.freeze({
      entityId: validation.entity.id,
      databaseRegistryId: validation.database.id,
      entityStatus: validation.entity.entityStatus,
      activationStatus: validation.entity.activationStatus,
      schemaVersion: validation.database.schemaVersion,
      migrationVersion: validation.database.migrationVersion,
      provisioningStatus: validation.database.provisioningStatus,
      healthStatus: validation.database.healthStatus
    })
  });
}

export async function listAccountingLifecycleEvents(env, entityId) {
  assertCentralStore(env);
  const rows = await d1All(
    env,
    `SELECT * FROM accounting_lifecycle_events WHERE accounting_entity_id = ? ORDER BY created_at ASC`,
    requireNonEmptyString(entityId, "entityId")
  );
  return rows.map((row) => Object.freeze({
    id: row.id,
    accountingEntityId: row.accounting_entity_id,
    accountingDatabaseId: row.accounting_database_id || "",
    eventType: row.event_type,
    fromState: row.from_state || "",
    toState: row.to_state || "",
    actorUserId: row.actor_user_id || "",
    actorType: row.actor_type,
    reason: row.reason || "",
    correlationId: row.correlation_id || "",
    createdAt: row.created_at
  }));
}
