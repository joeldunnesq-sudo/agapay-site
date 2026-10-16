import type { CatalogRegistration } from './parish-giving-catalog.js';
/** Consumed refresh boundary only; the Stripe handler implementation remains JavaScript. */
export function refreshStripeStatusForRegistration<T extends CatalogRegistration>(
  env: Partial<Env>,
  reference: string,
  registration: T,
  options?: { actor?: string; reason?: string; preserveReviewedTimestamp?: boolean; persist?: boolean }
): Promise<
  | { ok: false; status: number; body: { error: string; code: string; retryable: boolean; detail: string } }
  | { ok: true; registration: T; recovered?: boolean }
>;

export function verifyStripeWebhook(payload: string, signature: string, secret: string): Promise<boolean>;

export const handleSubscriptionCheckout: import('../routes/admin.js').AdminActions<Env>['handleSubscriptionCheckout'];

export const handleStripeWebhook: import('../routes/public.js').PublicActions<Env>['handleStripeWebhook'];

export const handleStripeRefresh: import('../routes/admin.js').AdminActions<Env>['handleStripeRefresh'];

export function createStripeOnboardingSession(
  request: Request,
  env: Partial<Env>,
  reference: string,
  registration: import('./parish-giving-catalog.js').CatalogRegistration,
  returnPath?: string
): Promise<
  Response | { onboardingUrl: string; registration: import('./parish-giving-catalog.js').CatalogRegistration }
>;
