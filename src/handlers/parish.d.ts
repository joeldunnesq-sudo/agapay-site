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
export function givingFeatureAccess(
  registration: CatalogRegistration,
  feature: 'campaigns' | 'branding' | 'giverInsights'
): boolean;
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

// Donor authentication remains in parish.js; this describes its library consumer's read boundary.
export function requireDonor(
  request: Request,
  env: Partial<Env>
): Promise<import('../lib/identity-contracts.js').DonorRecord | null>;

export function requireAdminContext(
  request: Request,
  env: Partial<Env>
): Promise<{ actor: string; authType: string; expiresAt: string; sessionId: string; mfaVerifiedAt: string } | null>;
export function requireAdmin(request: Request, env: Partial<Env>): Promise<boolean>;

export function handleParishDashboard(request: Request, env: Partial<Env>, parishId: string): Promise<Response>;

export function absoluteWebsiteUrl(value?: unknown): string;

export { loadParishRecurringOfferings, summarizeParishRecurringHealth } from './parish-giving-read-models.js';
export { parishDashboardPayload, summarizeCharges } from './parish-dashboard-handler.js';

export function appendAdminAudit<T extends Record<string, unknown>>(
  registration: T,
  action: string,
  actor: string,
  details: Record<string, unknown>
): T;

export { normalizeSacramentPriests } from './parish-dashboard-handler.js';

export { sacramentsEnabledFor } from '../lib/entitlements.js';

export { d1All, d1First, d1Run, generateSecret } from '../lib/core.js';

export { bookstoreEnabledFor } from '../lib/entitlements.js';
export { recordAuditEvent } from '../lib/audit-log.js';
export { stripePaymentIntentFinancialUpdates } from './parish-donor-offerings.js';

export function findCheckoutParish(
  env: Partial<Env>,
  parishId: string
): Promise<(CatalogParish & { stripeAccountId?: string }) | null>;

export const handleParishStripeRefresh: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishStripeRefresh'];

export const handleDashboardInvite: import('../routes/admin.js').AdminActions<Env>['handleDashboardInvite'];

export const handleParishStripeOnboarding: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishStripeOnboarding'];

export const handleParishSubscriptionCheckout: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishSubscriptionCheckout'];

export const handleParishDemoTier: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishDemoTier'];

export const handleParishSubscriptionRefresh: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishSubscriptionRefresh'];

export const handleParishSubscriptionPortal: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishSubscriptionPortal'];

export const handleParishFeatureRequestDismiss: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishFeatureRequestDismiss'];

export const handleParishSession: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishSession'];

export const handleRegistrations: import('../routes/public.js').PublicActions<Env>['handleRegistrations'];

export const handleCheckout: import('../routes/parish.js').ParishActions<Env, ExecutionContext>['handleCheckout'];

export const handleCheckoutSessionStatus: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleCheckoutSessionStatus'];

export const handleParishPasswordResetRequest: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishPasswordResetRequest'];

export const handleParishPasswordResetConfirm: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishPasswordResetConfirm'];
