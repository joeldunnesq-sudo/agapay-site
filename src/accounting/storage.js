// AGAPAY Accounting Package 0.75G -- Storage abstraction registry.
//
// Accounting code should depend on this registry, not raw Cloudflare
// bindings. The current implementation exposes existing operational
// bindings and placeholders for future accounting resources.

import { AccountingConfigurationError } from "./errors.js";
import { createAccountingConfiguration, validateAccountingConfiguration } from "./environment.js";

function hasBinding(env, bindingName) {
  return Boolean(env && bindingName && Object.prototype.hasOwnProperty.call(env, bindingName) && env[bindingName]);
}

function bindingStatus(env, bindingName) {
  return Object.freeze({
    binding: bindingName,
    present: hasBinding(env, bindingName)
  });
}

export function createAccountingStorageRegistry(env = {}, config = createAccountingConfiguration(env)) {
  validateAccountingConfiguration(config);
  return Object.freeze({
    environment: config.environment,
    centralD1: bindingStatus(env, config.centralDatabase.binding),
    accountingD1: Object.freeze({
      implemented: false,
      registry: config.accountingDatabaseRegistry.name,
      bindings: Object.freeze([])
    }),
    r2: Object.freeze({
      campaignAssets: bindingStatus(env, "CAMPAIGN_ASSETS"),
      taxExemptionDocs: bindingStatus(env, "TAX_EXEMPTION_DOCS"),
      givingStatements: bindingStatus(env, "GIVING_STATEMENTS"),
      accountingDocuments: Object.freeze({ binding: "ACCOUNTING_DOCUMENTS", present: false, implemented: false }),
      accountingBackups: Object.freeze({ ...bindingStatus(env, "ACCOUNTING_BACKUPS"), implemented: true })
    }),
    kv: Object.freeze({
      nonAccountingRegistrations: bindingStatus(env, "AGAPAY_REGISTRATIONS")
    }),
    queues: Object.freeze({
      accountingJobs: Object.freeze({ binding: "ACCOUNTING_JOBS", present: false, implemented: false })
    }),
    workflows: Object.freeze({
      aplosMigration: Object.freeze({ binding: "APLOS_MIGRATION_WORKFLOW", present: false, implemented: false })
    })
  });
}

export function validateAccountingStorageRegistry(registry, {
  requireCentralD1 = true,
  requireAccountingD1 = false,
  requireAccountingDocuments = false
} = {}) {
  if (!registry || typeof registry !== "object") {
    throw new AccountingConfigurationError("Accounting storage registry is required.");
  }
  if (requireCentralD1 && !registry.centralD1?.present) {
    throw new AccountingConfigurationError("Central AGAPAY_DB binding is required for accounting environment checks.", {
      details: { binding: registry.centralD1?.binding || "AGAPAY_DB" }
    });
  }
  if (requireAccountingD1 && !registry.accountingD1?.implemented) {
    throw new AccountingConfigurationError("Accounting D1 bindings are not configured yet.");
  }
  if (requireAccountingDocuments && !registry.r2?.accountingDocuments?.present) {
    throw new AccountingConfigurationError("Accounting document R2 binding is not configured yet.");
  }
  return registry;
}
