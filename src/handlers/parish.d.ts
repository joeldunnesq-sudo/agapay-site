// Narrow contract for legacy helpers used by the migrated giving catalog.
// This is not validation of registration JSON or type coverage of parish.js.
import type { GivingCatalogEnv, CatalogRegistration, CatalogParish } from './parish-giving-catalog.js';
export { json } from '../lib/http-responses.js';
export { paidOfferingStatus } from '../lib/paid-offering-status.js';
export { loadParishPaidOfferings } from './parish-giving-read-models.js';
export function findRegistrationByParishId<Registration extends CatalogRegistration = CatalogRegistration>(
  env: GivingCatalogEnv,
  id: string
): Promise<{ key: string; registration: Registration } | null>;
export function getBearerToken(request: Request): string;
export function givingFeatureAccess(registration: CatalogRegistration, feature: 'campaigns' | 'branding'): boolean;
export function hasProductionStore(env: GivingCatalogEnv): boolean;
export function missingProductionStoreResponse(): Response;
export function parishFromRegistration(registration: CatalogRegistration): CatalogParish | null;
export function rateLimit(
  request: Request,
  env: GivingCatalogEnv,
  bucket: string,
  options: { limit: number; windowSeconds: number }
): Promise<Response | null>;
export function saveRegistrationRecord(
  env: GivingCatalogEnv,
  reference: string,
  registration: CatalogRegistration,
  previous?: CatalogRegistration | null
): Promise<CatalogRegistration>;
export function slugify(value: unknown): string;
export function unauthorized(): Response;
interface CatalogPageOptions {
  limit?: string | number | null;
  cursor?: string | null;
  q?: string | null;
  type?: string | null;
  jurisdiction?: string | null;
}
export function loadVerifiedRegistrationParishPage(
  env: GivingCatalogEnv,
  options?: CatalogPageOptions
): Promise<{ parishes: CatalogParish[]; cursor: string | null; hasMore: boolean; limit: number; source: string }>;
export function verifiedRegistrationParishes(
  env: GivingCatalogEnv,
  options?: CatalogPageOptions
): Promise<CatalogParish[]>;
export function verifyParishDashboardBearer(registration: CatalogRegistration, token: string): Promise<boolean>;

export { defaultSubscriptionTier } from '../lib/subscriptions.js';
export function starterFundCatalogError(funds?: unknown): string;
