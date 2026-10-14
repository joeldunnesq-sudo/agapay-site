import assert from 'node:assert/strict';
import { createAccountingConfiguration } from '../src/accounting/environment.js';
import { createAccountingStorageRegistry, validateAccountingStorageRegistry } from '../src/accounting/storage.js';
import { createMigrationSafetyPlan } from '../src/accounting/migration-safety.js';
import { AccountingConfigurationError, ValidationError } from '../src/accounting/errors.js';
const config = createAccountingConfiguration({}, { environment: 'test' });
const env = {
  AGAPAY_DB: {},
  CAMPAIGN_ASSETS: {},
  TAX_EXEMPTION_DOCS: {},
  GIVING_STATEMENTS: {},
  ACCOUNTING_BACKUPS: {},
  AGAPAY_REGISTRATIONS: {},
  ACCOUNTING_DOCUMENTS: {},
  ACCOUNTING_JOBS: {},
};
const registry = createAccountingStorageRegistry(env, config);
assert.equal(registry.environment, 'test');
assert.equal(registry.centralD1.present, true);
for (const key of ['campaignAssets', 'taxExemptionDocs', 'givingStatements', 'accountingBackups'])
  assert.equal(registry.r2[key].present, true);
assert.equal(registry.kv.nonAccountingRegistrations.present, true);
assert.equal(registry.r2.accountingDocuments.present, false);
assert.equal(registry.queues.accountingJobs.present, false);
assert.equal(registry.accountingD1.implemented, false);
assert.deepEqual(registry.accountingD1.bindings, []);
for (const value of [
  registry,
  registry.centralD1,
  registry.accountingD1,
  registry.accountingD1.bindings,
  registry.r2,
  registry.r2.accountingBackups,
  registry.kv,
  registry.queues,
  registry.workflows,
])
  assert.ok(Object.isFrozen(value));
assert.equal(validateAccountingStorageRegistry(registry), registry);
assert.equal(createAccountingStorageRegistry(Object.create(env), config).centralD1.present, false);
for (const value of [null, {}, { AGAPAY_DB: false }]) {
  const missing = createAccountingStorageRegistry(value, config);
  assert.equal(missing.centralD1.present, false);
  assert.throws(() => validateAccountingStorageRegistry(missing), AccountingConfigurationError);
  assert.equal(validateAccountingStorageRegistry(missing, { requireCentralD1: false }), missing);
}
for (const value of [null, undefined, false, 1])
  assert.throws(() => validateAccountingStorageRegistry(value), AccountingConfigurationError);
assert.throws(
  () => validateAccountingStorageRegistry(registry, { requireAccountingD1: true }),
  AccountingConfigurationError
);
assert.throws(
  () => validateAccountingStorageRegistry(registry, { requireAccountingDocuments: true }),
  AccountingConfigurationError
);
const legacy = {
  centralD1: { present: 'yes' },
  accountingD1: { implemented: 1 },
  r2: { accountingDocuments: { present: {} } },
  extra: 'preserved',
};
assert.equal(
  validateAccountingStorageRegistry(legacy, { requireAccountingD1: true, requireAccountingDocuments: true }),
  legacy
);
const plan = createMigrationSafetyPlan({ environment: 'test' });
assert.deepEqual(plan, {
  environment: 'test',
  databaseName: 'agapay-test',
  remote: false,
  productionTarget: false,
  purpose: 'schema_migration',
  command: 'npx wrangler d1 migrations apply agapay-test --local',
  executeAutomatically: false,
});
assert.ok(Object.isFrozen(plan));
const remote = createMigrationSafetyPlan({
  environment: 'staging',
  databaseName: ' custom-db ',
  remote: true,
  purpose: 'review',
});
assert.equal(remote.databaseName, 'custom-db');
assert.equal(remote.command, 'npx wrangler d1 migrations apply custom-db --remote');
assert.equal(remote.purpose, 'review');
assert.equal(remote.executeAutomatically, false);
assert.throws(() => createMigrationSafetyPlan({ environment: 'production' }), AccountingConfigurationError);
assert.throws(
  () => createMigrationSafetyPlan({ environment: 'test', databaseName: 'agapay-production' }),
  AccountingConfigurationError
);
assert.throws(
  () => createMigrationSafetyPlan({ environment: 'test', databaseName: 'agapay-production', confirmProduction: true }),
  AccountingConfigurationError
);
const production = createMigrationSafetyPlan({ environment: 'production', confirmProduction: true, remote: true });
assert.equal(production.productionTarget, true);
assert.equal(production.executeAutomatically, false);
assert.equal(production.command, 'npx wrangler d1 migrations apply agapay-production --remote');
assert.throws(
  () => createMigrationSafetyPlan({ environment: 'production', databaseName: 'custom-db' }),
  AccountingConfigurationError
);
assert.throws(() => createMigrationSafetyPlan({ environment: 'test', databaseName: ' ' }), ValidationError);
assert.equal(createMigrationSafetyPlan({ environment: 'test', databaseName: 123 }).databaseName, '123');
console.log('PASS - Accounting storage bindings and migration plan safety');
