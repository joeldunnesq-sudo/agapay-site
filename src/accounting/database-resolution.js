// Generated from src/accounting/database-resolution.ts by npm run build:server. Do not edit.
import { AccountingDatabaseError } from './errors.js';
import { requireNonEmptyString } from './validation.js';
import { createAccountingConfiguration } from './environment.js';
import { resolveAccountingControlPlaneDatabase } from './control-plane.js';
const ACCOUNTING_DATABASE_STATUSES = Object.freeze([
  'unconfigured',
  'requested',
  'provisioning',
  'schema_validating',
  'active',
  'suspended',
  'archived',
  'migration_pending',
  'migration_failed',
  'restore_pending',
  'recovery_mode',
]);
function createUnconfiguredAccountingDatabase({ parishId, environment = '' } = {}) {
  const config = createAccountingConfiguration({}, { environment });
  return Object.freeze({
    status: 'unconfigured',
    parishId: requireNonEmptyString(parishId, 'parishId'),
    environment: config.environment,
    binding: null,
    registryRecord: Object.freeze({
      registryName: config.accountingDatabaseRegistry.name,
      implemented: false,
    }),
    reason: 'accounting_database_registry_not_implemented',
  });
}
async function resolveAccountingDatabase(_env, { parishId, environment = '' } = {}) {
  const config = createAccountingConfiguration(_env, { environment });
  if (!_env?.AGAPAY_DB?.prepare) {
    return createUnconfiguredAccountingDatabase({ parishId, environment: config.environment });
  }
  try {
    return await resolveAccountingControlPlaneDatabase(_env, {
      parishId,
      authenticatedParishId: parishId,
      environment: config.environment,
    });
  } catch (error) {
    if (String(error?.message || '').includes('no such table')) {
      return createUnconfiguredAccountingDatabase({ parishId, environment: config.environment });
    }
    throw error;
  }
}
function assertAccountingDatabaseResolution(resolution) {
  if (!resolution || typeof resolution !== 'object') {
    throw new AccountingDatabaseError('Accounting database resolver returned no result.');
  }
  if (!ACCOUNTING_DATABASE_STATUSES.includes(resolution.status)) {
    throw new AccountingDatabaseError('Accounting database resolver returned an unknown status.', {
      details: { status: resolution.status },
    });
  }
  if (!resolution.parishId) {
    throw new AccountingDatabaseError('Accounting database resolver omitted parishId.');
  }
  if ('bindingName' in resolution || 'databaseId' in resolution) {
    throw new AccountingDatabaseError('Accounting database resolver must not expose raw binding identifiers.', {
      details: { forbiddenFields: ['bindingName', 'databaseId'] },
    });
  }
  return resolution;
}
export {
  ACCOUNTING_DATABASE_STATUSES,
  assertAccountingDatabaseResolution,
  createUnconfiguredAccountingDatabase,
  resolveAccountingDatabase,
};
