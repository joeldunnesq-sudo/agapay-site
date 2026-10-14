// AGAPAY Accounting Package 0.75G -- Central environment/configuration layer.
//
// Future accounting modules should import this file instead of reading raw
// environment variables or scattering production/staging checks.

import { AccountingConfigurationError, ValidationError } from './errors.js';

export interface AccountingConfigurationOptions {
  environment?: unknown;
  centralDatabaseName?: string;
  accountingDatabaseRegistryName?: string;
  storageRegistryName?: string;
}
interface ConfigurationValidationFields {
  environment?: unknown;
  centralDatabase?: { binding?: unknown; name?: unknown } | null;
}
export interface ConfigurationValidationOptions {
  requireExplicitEnvironment?: boolean;
  allowProduction?: boolean;
}
export type AccountingConfiguration = ReturnType<typeof createAccountingConfiguration>;
type EnvironmentProfile = (typeof ACCOUNTING_ENVIRONMENT_PROFILES)[keyof typeof ACCOUNTING_ENVIRONMENT_PROFILES];

export const ACCOUNTING_ENVIRONMENTS = Object.freeze(['local', 'test', 'staging', 'production']);

export const ACCOUNTING_ENVIRONMENT_PROFILES = Object.freeze({
  local: Object.freeze({
    name: 'local',
    workerName: 'agapay-site-local',
    centralDatabaseName: 'agapay-local',
    accountingDatabaseRegistryName: 'accounting-databases-local',
    storageRegistryName: 'accounting-storage-local',
    publicUrl: 'http://localhost:8787',
    allowsProductionMutation: false,
  }),
  test: Object.freeze({
    name: 'test',
    workerName: 'agapay-site-test',
    centralDatabaseName: 'agapay-test',
    accountingDatabaseRegistryName: 'accounting-databases-test',
    storageRegistryName: 'accounting-storage-test',
    publicUrl: 'http://localhost:8787',
    allowsProductionMutation: false,
  }),
  staging: Object.freeze({
    name: 'staging',
    workerName: 'agapay-site-staging',
    centralDatabaseName: 'agapay-staging',
    accountingDatabaseRegistryName: 'accounting-databases-staging',
    storageRegistryName: 'accounting-storage-staging',
    publicUrl: 'https://staging.agapay.app',
    allowsProductionMutation: false,
  }),
  production: Object.freeze({
    name: 'production',
    workerName: 'agapay-site',
    centralDatabaseName: 'agapay-production',
    accountingDatabaseRegistryName: 'accounting-databases-production',
    storageRegistryName: 'accounting-storage-production',
    publicUrl: 'https://agapay.app',
    allowsProductionMutation: true,
  }),
});

const ENV_ALIASES: Readonly<Record<string, string | undefined>> = Object.freeze({
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
});

function readBindingValue(env: unknown, key: string) {
  if (!env || typeof env !== 'object') return '';
  const value = (env as Record<string, unknown>)[key];
  if (typeof value === 'string') return value.trim();
  return '';
}

function readProcessValue(key: string) {
  if (typeof process === 'undefined' || !process?.env) return '';
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeAccountingEnvironment(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  const mapped = ENV_ALIASES[normalized];
  if (!mapped) {
    throw new AccountingConfigurationError('Unknown accounting environment.', {
      details: { environment: value, allowed: ACCOUNTING_ENVIRONMENTS },
    });
  }
  return mapped;
}

export function detectAccountingEnvironment(env: unknown = {}, { explicit = '' }: { explicit?: unknown } = {}) {
  const candidates = [
    explicit,
    readBindingValue(env, 'AGAPAY_ACCOUNTING_ENV'),
    readBindingValue(env, 'AGAPAY_ENVIRONMENT'),
    readBindingValue(env, 'AGAPAY_ENV'),
    readBindingValue(env, 'ENVIRONMENT'),
    readProcessValue('AGAPAY_ACCOUNTING_ENV'),
    readProcessValue('AGAPAY_ENVIRONMENT'),
    readProcessValue('AGAPAY_ENV'),
    readProcessValue('NODE_ENV'),
  ];

  const first = candidates.find((candidate) => String(candidate || '').trim());
  return normalizeAccountingEnvironment(first || 'local');
}

export function getAccountingEnvironmentProfile(environment: unknown) {
  const name = normalizeAccountingEnvironment(environment || 'local');
  return (ACCOUNTING_ENVIRONMENT_PROFILES as Readonly<Record<string, EnvironmentProfile | undefined>>)[name];
}

export function createAccountingConfiguration(env: unknown = {}, options: AccountingConfigurationOptions = {}) {
  const environment = detectAccountingEnvironment(env, { explicit: options.environment });
  const profile = getAccountingEnvironmentProfile(environment);
  const appUrl =
    readBindingValue(env, 'AGAPAY_APP_URL') || readBindingValue(env, 'AGAPAY_PUBLIC_URL') || profile!.publicUrl;

  return Object.freeze({
    environment,
    profile,
    appUrl,
    centralDatabase: Object.freeze({
      binding: 'AGAPAY_DB',
      name: options.centralDatabaseName || profile!.centralDatabaseName,
    }),
    accountingDatabaseRegistry: Object.freeze({
      name: options.accountingDatabaseRegistryName || profile!.accountingDatabaseRegistryName,
      implemented: false,
    }),
    storageRegistry: Object.freeze({
      name: options.storageRegistryName || profile!.storageRegistryName,
      implemented: false,
    }),
    production: environment === 'production',
    safeForDevelopment: environment !== 'production',
  });
}

export function validateAccountingConfiguration<T>(
  config: T,
  { requireExplicitEnvironment = true, allowProduction = true }: ConfigurationValidationOptions = {}
): T {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Accounting configuration is required.', { details: { field: 'config' } });
  }
  if (
    !(ACCOUNTING_ENVIRONMENTS as readonly unknown[]).includes((config as ConfigurationValidationFields).environment)
  ) {
    throw new AccountingConfigurationError('Accounting configuration has an invalid environment.', {
      details: { environment: (config as ConfigurationValidationFields).environment },
    });
  }
  if (requireExplicitEnvironment && !(config as ConfigurationValidationFields).environment) {
    throw new AccountingConfigurationError('Accounting environment must be explicit.');
  }
  if (!allowProduction && (config as ConfigurationValidationFields).environment === 'production') {
    throw new AccountingConfigurationError('Production accounting environment is not allowed for this operation.');
  }
  if (
    !(config as ConfigurationValidationFields).centralDatabase?.binding ||
    !(config as ConfigurationValidationFields).centralDatabase?.name
  ) {
    throw new AccountingConfigurationError('Central database configuration is incomplete.');
  }
  return config;
}

export function summarizeAccountingConfiguration(config: AccountingConfiguration) {
  validateAccountingConfiguration(config);
  return Object.freeze({
    environment: config.environment,
    workerName: config.profile!.workerName,
    appUrl: config.appUrl,
    centralDatabaseName: config.centralDatabase.name,
    accountingDatabaseRegistry: config.accountingDatabaseRegistry.name,
    storageRegistry: config.storageRegistry.name,
    production: config.production,
  });
}
