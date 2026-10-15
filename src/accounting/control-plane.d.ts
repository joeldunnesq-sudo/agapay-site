export interface AccountingEntityRecord {
  id: string;
  parishId: string;
  entityStatus: string;
  activationStatus: string;
  [field: string]: unknown;
}
export interface AccountingRegistryRecord {
  id: string;
  environment: string;
  provisioningStatus: string;
  healthStatus: string;
  [field: string]: unknown;
}
export function loadAccountingEntityByParish(
  env: Partial<Env>,
  parishId: string
): Promise<AccountingEntityRecord | null>;
export function loadAccountingDatabaseForEntity(
  env: Partial<Env>,
  entityId: string,
  environment?: string
): Promise<AccountingRegistryRecord | null>;
export function resolveAccountingControlPlaneDatabase(
  env: Partial<Env>,
  options: { parishId?: unknown; authenticatedParishId?: unknown; environment?: string }
): Promise<{
  readonly status: 'active';
  readonly parishId: string;
  readonly environment: string;
  readonly binding: null;
  readonly registryRecord: Readonly<Record<string, unknown>>;
}>;

export function loadAccountingDatabaseProviderRecord(
  env: Partial<Env>,
  entityId: string,
  environment: string
): Promise<{ databaseIdentifier: string } | null>;

export interface AccountingLifecycleOptions {
  parishId: string;
  environment?: string;
  subscriptionTier?: string;
  databaseIdentifier?: string;
  actorUserId?: string;
  actorType?: string;
  reason?: string;
  request?: Request | null;
  correlationId?: string;
}
export function registerAccountingEntity(
  env: Partial<Env>,
  options: AccountingLifecycleOptions
): Promise<AccountingEntityRecord>;
export function recordProvisioningCompleted(
  env: Partial<Env>,
  options: AccountingLifecycleOptions
): Promise<AccountingEntityRecord>;
export function transitionAccountingEntity(
  env: Partial<Env>,
  options: AccountingLifecycleOptions & { toState: string }
): Promise<AccountingEntityRecord>;
export function setAccountingDatabaseProvisioningStatus(
  env: Partial<Env>,
  options: { entityId: string; environment?: string; status: string; healthStatus?: string }
): Promise<unknown>;
export function updateAccountingSchemaVersion(
  env: Partial<Env>,
  options: AccountingLifecycleOptions & { schemaVersion: number; migrationVersion: string; schemaVersionId?: string }
): Promise<unknown>;
export function validateAccountingRegistry(
  env: Partial<Env>,
  options: { parishId: string; environment?: string }
): Promise<{
  ok: boolean;
  entity: AccountingEntityRecord | null;
  database: AccountingRegistryRecord | null;
  issues: { code: string; severity: string }[];
}>;
