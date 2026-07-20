import { loadAccountingEntityByParish, recordProvisioningCompleted, registerAccountingEntity, setAccountingDatabaseProvisioningStatus, transitionAccountingEntity, updateAccountingSchemaVersion, validateAccountingRegistry } from "../control-plane.js";
import { deterministicAccountingDatabaseName } from "./naming.js";
import { provisionAccountingDatabase } from "./service.js";

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
