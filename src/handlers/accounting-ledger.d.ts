import type { AccountingHttpContext, AccountingHttpFailure } from './accounting-http-contracts.js';
export function accountingContext(
  request: Request,
  env: Partial<Env>,
  parishId: string,
  capability: string
): Promise<AccountingHttpContext | AccountingHttpFailure | null>;

export function resolveAccountingDatabaseForParish(
  env: Partial<Env>,
  parishId: string
): Promise<{
  registration: import('./parish-giving-catalog.js').CatalogRegistration | null;
  entity: import('../accounting/control-plane.js').AccountingEntityRecord | null;
  registry: import('../accounting/control-plane.js').AccountingRegistryRecord | null;
  db: import('../portability/contracts.js').PortabilityDatabase | null;
}>;
