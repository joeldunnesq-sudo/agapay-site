// AGAPAY Accounting Package 0.75E -- Accounting database resolution boundary.
//
// This abstraction exists before parish accounting databases exist. Future
// code asks the gateway to resolve an accounting database; it never reaches
// for AGAPAY_DB or a raw binding name on its own.

import { AccountingDatabaseError } from "./errors.js";
import { requireNonEmptyString } from "./validation.js";

export const ACCOUNTING_DATABASE_STATUSES = Object.freeze([
  "unconfigured",
  "requested",
  "provisioning",
  "schema_validating",
  "active",
  "suspended",
  "archived",
  "migration_pending",
  "migration_failed",
  "restore_pending",
  "recovery_mode"
]);

export function createUnconfiguredAccountingDatabase({ parishId, environment = "production" } = {}) {
  return Object.freeze({
    status: "unconfigured",
    parishId: requireNonEmptyString(parishId, "parishId"),
    environment: environment || "production",
    binding: null,
    registryRecord: null,
    reason: "accounting_database_registry_not_implemented"
  });
}

export async function resolveAccountingDatabase(_env, { parishId, environment = "production" } = {}) {
  return createUnconfiguredAccountingDatabase({ parishId, environment });
}

export function assertAccountingDatabaseResolution(resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new AccountingDatabaseError("Accounting database resolver returned no result.");
  }
  if (!ACCOUNTING_DATABASE_STATUSES.includes(resolution.status)) {
    throw new AccountingDatabaseError("Accounting database resolver returned an unknown status.", {
      details: { status: resolution.status }
    });
  }
  if (!resolution.parishId) {
    throw new AccountingDatabaseError("Accounting database resolver omitted parishId.");
  }
  if ("bindingName" in resolution || "databaseId" in resolution) {
    throw new AccountingDatabaseError("Accounting database resolver must not expose raw binding identifiers.", {
      details: { forbiddenFields: ["bindingName", "databaseId"] }
    });
  }
  return resolution;
}
