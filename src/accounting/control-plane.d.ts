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
