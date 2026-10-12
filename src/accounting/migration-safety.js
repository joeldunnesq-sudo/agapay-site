// Generated from src/accounting/migration-safety.ts by npm run build:server. Do not edit.
import { AccountingConfigurationError, ValidationError } from './errors.js';
import { createAccountingConfiguration, validateAccountingConfiguration } from './environment.js';
function createMigrationSafetyPlan({
  env = {},
  environment = '',
  databaseName = '',
  remote = false,
  confirmProduction = false,
  purpose = 'schema_migration',
} = {}) {
  const config = validateAccountingConfiguration(createAccountingConfiguration(env, { environment }));
  const targetDatabase = String(databaseName || config.centralDatabase.name || '').trim();
  if (!targetDatabase) {
    throw new ValidationError('Migration target database name is required.');
  }
  const productionTarget = config.environment === 'production' || targetDatabase === 'agapay-production';
  if (productionTarget && !confirmProduction) {
    throw new AccountingConfigurationError('Production migration plan requires explicit confirmation.', {
      details: {
        environment: config.environment,
        databaseName: targetDatabase,
        requiredFlag: '--confirm-production',
      },
    });
  }
  if (config.environment !== 'production' && targetDatabase === 'agapay-production') {
    throw new AccountingConfigurationError('Non-production environments may not target agapay-production.', {
      details: { environment: config.environment, databaseName: targetDatabase },
    });
  }
  const command = `npx wrangler d1 migrations apply ${targetDatabase}${remote ? ' --remote' : ' --local'}`;
  return Object.freeze({
    environment: config.environment,
    databaseName: targetDatabase,
    remote: Boolean(remote),
    productionTarget,
    purpose,
    command,
    executeAutomatically: false,
  });
}
export { createMigrationSafetyPlan };
