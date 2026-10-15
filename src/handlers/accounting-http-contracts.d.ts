import type { PortabilityDatabase } from '../portability/contracts.js';
import type { CatalogRegistration } from './parish-giving-catalog.js';
export type AccountingHttpDatabase = PortabilityDatabase;
export interface AccountingHttpActor {
  id: string;
  type?: string;
  capabilities: readonly string[];
}
export interface AccountingHttpError {
  message?: string;
  name?: string;
  details?: { conflict?: unknown };
  status?: number;
}
export interface AccountingHttpOptions extends Record<string, unknown> {
  actor: AccountingHttpActor;
  entitlementTier?: unknown;
}
export interface AccountingHttpContext {
  error?: undefined;
  db: AccountingHttpDatabase;
  actor: AccountingHttpActor;
  tier: string;
  databaseStatus: string;
  databaseHealth: string;
  registration: CatalogRegistration;
}
export interface AccountingHttpFailure {
  error: Response;
  db?: never;
  actor?: never;
  tier?: never;
  databaseStatus?: never;
  databaseHealth?: never;
  registration?: never;
}
