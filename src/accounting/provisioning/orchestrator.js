import { loadAccountingEntityByParish, recordProvisioningCompleted, registerAccountingEntity, setAccountingDatabaseProvisioningStatus, transitionAccountingEntity, updateAccountingSchemaVersion, validateAccountingRegistry } from "../control-plane.js";
import { deterministicAccountingDatabaseName } from "./naming.js";
import { provisionAccountingDatabase } from "./service.js";

const REQUIRED_PRODUCTION_TABLES = Object.freeze([
  "accounting_journal_entries",
  "accounting_journal_lines",
  "accounting_bills",
  "accounting_budgets",
  "accounting_reconciliation_sessions",
  "accounting_integrity_scans",
  "accounting_integrity_findings",
  "accounting_protective_state"
]);

async function validatePreparedDatabase(adapter, physical) {
  const integrity = await adapter.execute(physical.providerId, "PRAGMA quick_check");
  const result = integrity?.[0]?.results?.[0]?.quick_check || integrity?.results?.[0]?.quick_check;
  if (result !== "ok") throw new Error("Prepared accounting database failed SQLite quick_check.");
  const rows = await adapter.execute(physical.providerId, "SELECT name FROM sqlite_master WHERE type='table'");
  const names = new Set((rows?.[0]?.results || rows?.results || []).map((row) => row.name));
  const missing = REQUIRED_PRODUCTION_TABLES.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Prepared accounting database is missing required tables: ${missing.join(", ")}`);
}

// Static D1 bindings are provisioned by infrastructure, then activated through
// the same central lifecycle registry used by parish signup. This path never
// requires a Cloudflare API token inside the Worker.
export async function activatePreparedParishAccounting(env, { adapter, parishId, databaseIdentifier, environment = "production", subscriptionTier = "parish", actorUserId = "accounting-scheduler", correlationId = "" }) {
  let entity = await loadAccountingEntityByParish(env, parishId);
  if (entity?.entityStatus === "ready") return validateAccountingRegistry(env, { parishId, environment });
  const physical = await adapter.findByName(databaseIdentifier);
  if (!physical) throw new Error("Prepared accounting database binding was not found.");
  await validatePreparedDatabase(adapter, physical);
  if (!entity) entity = await registerAccountingEntity(env, { parishId, environment, subscriptionTier, databaseIdentifier, actorUserId, actorType: "system", reason: "Production control-plane activation of prepared parish database", correlationId });
  try {
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "provisioning" });
    entity = await loadAccountingEntityByParish(env, parishId);
    if (entity.entityStatus === "provisioning") entity = await recordProvisioningCompleted(env, { parishId, environment, actorUserId, actorType: "system", reason: "Bound D1 database validated", correlationId });
    if (entity.entityStatus === "provisioned") entity = await transitionAccountingEntity(env, { parishId, toState: "migrating", actorUserId, actorType: "system", reason: "Validating production accounting schema", correlationId });
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "migrating" });
    await updateAccountingSchemaVersion(env, { parishId, environment, schemaVersion: 14, migrationVersion: "0014_phase_g_query_indexes", actorUserId, actorType: "system", reason: "Full accounting schema validated", correlationId });
    entity = await loadAccountingEntityByParish(env, parishId);
    if (entity.entityStatus === "migrating") await transitionAccountingEntity(env, { parishId, toState: "ready", actorUserId, actorType: "system", reason: "Prepared accounting database activated", correlationId });
    return validateAccountingRegistry(env, { parishId, environment });
  } catch (error) {
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "failed", healthStatus: "unhealthy" });
    throw error;
  }
}

export async function provisionParishAccounting(env, { adapter, parishId, environment, subscriptionTier = "parish", actorUserId = "", request = null, correlationId = "" }) {
  let entity = await loadAccountingEntityByParish(env, parishId);
  if (!entity) entity = await registerAccountingEntity(env, { parishId, environment, subscriptionTier, databaseIdentifier: await deterministicAccountingDatabaseName({ parishId, environment }), actorUserId, actorType: "platform_user", reason: "Accounting setup requested", request, correlationId });
  if (entity.entityStatus === "ready") return validateAccountingRegistry(env, { parishId, environment });
  try {
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "provisioning" });
    const result = await provisionAccountingDatabase({ adapter, parishId, environment });
    entity = await loadAccountingEntityByParish(env, parishId);
    if (entity.entityStatus === "provisioning") entity = await recordProvisioningCompleted(env, { parishId, environment, actorUserId, actorType: "platform_user", request, correlationId });
    if (entity.entityStatus === "provisioned") entity = await transitionAccountingEntity(env, { parishId, toState: "migrating", actorUserId, actorType: "platform_user", reason: "Applying accounting foundation", request, correlationId });
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "migrating" });
    await updateAccountingSchemaVersion(env, { parishId, environment, schemaVersion: result.schemaVersion, migrationVersion: result.migrationVersion, schemaVersionId: "acct_schema_1", actorUserId, actorType: "platform_user", request, correlationId });
    entity = await loadAccountingEntityByParish(env, parishId);
    if (entity.entityStatus === "migrating") await transitionAccountingEntity(env, { parishId, toState: "ready", actorUserId, actorType: "platform_user", reason: "Accounting database validated", request, correlationId });
    return validateAccountingRegistry(env, { parishId, environment });
  } catch (error) {
    await setAccountingDatabaseProvisioningStatus(env, { entityId: entity.id, environment, status: "failed", healthStatus: "unhealthy" });
    throw error;
  }
}
