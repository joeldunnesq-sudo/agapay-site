import assert from 'node:assert/strict';
import {
  ACCOUNTING_ENVIRONMENT_PROFILES,
  normalizeAccountingEnvironment,
  detectAccountingEnvironment,
  getAccountingEnvironmentProfile,
  createAccountingConfiguration,
  validateAccountingConfiguration,
  summarizeAccountingConfiguration,
} from '../src/accounting/environment.js';
import { AccountingConfigurationError, ValidationError } from '../src/accounting/errors.js';
const keys = ['AGAPAY_ACCOUNTING_ENV', 'AGAPAY_ENVIRONMENT', 'AGAPAY_ENV', 'NODE_ENV'];
const saved = keys.map((key) => process.env[key]);
try {
  for (const key of keys) delete process.env[key];
  for (const [input, expected] of Object.entries({
    dev: 'local',
    development: 'local',
    local: 'local',
    test: 'test',
    ci: 'test',
    preview: 'staging',
    stage: 'staging',
    staging: 'staging',
    prod: 'production',
    production: 'production',
  })) {
    assert.equal(normalizeAccountingEnvironment(` ${input.toUpperCase()} `), expected);
  }
  for (const value of [null, undefined, '', ' ', false, 0]) assert.equal(normalizeAccountingEnvironment(value), '');
  assert.throws(() => normalizeAccountingEnvironment('unknown-env'), AccountingConfigurationError);
  assert.equal(detectAccountingEnvironment(), 'local');
  process.env.NODE_ENV = 'production';
  process.env.AGAPAY_ENV = 'staging';
  assert.equal(detectAccountingEnvironment(), 'staging');
  process.env.AGAPAY_ENVIRONMENT = 'test';
  assert.equal(detectAccountingEnvironment(), 'test');
  process.env.AGAPAY_ACCOUNTING_ENV = 'local';
  assert.equal(detectAccountingEnvironment(), 'local');
  assert.equal(detectAccountingEnvironment({ ENVIRONMENT: 'staging' }), 'staging');
  assert.equal(
    detectAccountingEnvironment({
      ENVIRONMENT: 'staging',
      AGAPAY_ENV: 'test',
      AGAPAY_ENVIRONMENT: 'production',
      AGAPAY_ACCOUNTING_ENV: 'local',
    }),
    'local'
  );
  assert.equal(detectAccountingEnvironment({ AGAPAY_ACCOUNTING_ENV: 'production' }, { explicit: 'test' }), 'test');
  assert.equal(detectAccountingEnvironment({ AGAPAY_ACCOUNTING_ENV: 123, AGAPAY_ENVIRONMENT: ' staging ' }), 'staging');
  assert.throws(
    () => detectAccountingEnvironment({ AGAPAY_ACCOUNTING_ENV: 'invalid', AGAPAY_ENV: 'test' }),
    AccountingConfigurationError
  );
  assert.equal(getAccountingEnvironmentProfile(null), ACCOUNTING_ENVIRONMENT_PROFILES.local);
  assert.equal(getAccountingEnvironmentProfile(' '), undefined);
  for (const environment of ['local', 'test', 'staging', 'production']) {
    const config = createAccountingConfiguration({ AGAPAY_ACCOUNTING_ENV: environment });
    assert.equal(config.environment, environment);
    assert.equal(config.production, environment === 'production');
    assert.equal(config.safeForDevelopment, environment !== 'production');
    for (const value of [
      config,
      config.profile,
      config.centralDatabase,
      config.accountingDatabaseRegistry,
      config.storageRegistry,
    ])
      assert.ok(Object.isFrozen(value));
    assert.equal(validateAccountingConfiguration(config), config);
    assert.equal(Object.isFrozen(summarizeAccountingConfiguration(config)), true);
  }
  const config = createAccountingConfiguration(
    { AGAPAY_APP_URL: ' https://example.test/app ', AGAPAY_PUBLIC_URL: 'https://fallback.test' },
    {
      environment: 'test',
      centralDatabaseName: 'custom-db',
      accountingDatabaseRegistryName: 'custom-registry',
      storageRegistryName: 'custom-storage',
    }
  );
  assert.equal(config.appUrl, 'https://example.test/app');
  assert.deepEqual(summarizeAccountingConfiguration(config), {
    environment: 'test',
    workerName: 'agapay-site-test',
    appUrl: 'https://example.test/app',
    centralDatabaseName: 'custom-db',
    accountingDatabaseRegistry: 'custom-registry',
    storageRegistry: 'custom-storage',
    production: false,
  });
  assert.equal(
    createAccountingConfiguration(
      { AGAPAY_APP_URL: 123, AGAPAY_PUBLIC_URL: ' https://fallback.test ' },
      { environment: 'test' }
    ).appUrl,
    'https://fallback.test'
  );
  assert.throws(
    () =>
      validateAccountingConfiguration(createAccountingConfiguration({}, { environment: 'production' }), {
        allowProduction: false,
      }),
    AccountingConfigurationError
  );
  for (const value of [null, undefined, false, 1])
    assert.throws(() => validateAccountingConfiguration(value), ValidationError);
  for (const value of [
    {},
    { environment: '' },
    { environment: 'test' },
    { environment: 'test', centralDatabase: { binding: 'AGAPAY_DB' } },
  ])
    assert.throws(() => validateAccountingConfiguration(value), AccountingConfigurationError);
  assert.throws(
    () => validateAccountingConfiguration({ environment: '' }, { requireExplicitEnvironment: false }),
    AccountingConfigurationError
  );
  const legacy = { environment: 'test', centralDatabase: { binding: true, name: 1 }, extra: 'preserved' };
  assert.equal(validateAccountingConfiguration(legacy), legacy);
} finally {
  keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key];
    else process.env[key] = saved[index];
  });
}
console.log('PASS - Accounting environment precedence, configuration, and production restrictions');
