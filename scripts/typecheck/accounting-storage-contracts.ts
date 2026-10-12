import { createAccountingConfiguration } from '../../src/accounting/environment.js';
import { createAccountingStorageRegistry, validateAccountingStorageRegistry } from '../../src/accounting/storage.js';
import { createMigrationSafetyPlan } from '../../src/accounting/migration-safety.js';
const config = createAccountingConfiguration({}, { environment: 'test' });
const registry = createAccountingStorageRegistry({}, config);
const present: boolean = registry.centralD1.present;
void present;
validateAccountingStorageRegistry(registry, { requireCentralD1: false });
// @ts-expect-error Validation options require booleans.
validateAccountingStorageRegistry(registry, { requireAccountingD1: 'true' });
// @ts-expect-error Registry status is immutable.
registry.centralD1.present = true;
const plan = createMigrationSafetyPlan({ environment: 'test', databaseName: 123 });
const command: string = plan.command;
void command;
// @ts-expect-error Remote option requires a boolean.
createMigrationSafetyPlan({ remote: 'true' });
// @ts-expect-error Confirmation requires a boolean.
createMigrationSafetyPlan({ confirmProduction: 'true' });
// @ts-expect-error Plans are immutable.
plan.executeAutomatically = true;
const input: unknown = {};
const output = validateAccountingStorageRegistry(input);
// @ts-expect-error Minimal validation does not fully type arbitrary registry inputs.
void output.centralD1.present;
