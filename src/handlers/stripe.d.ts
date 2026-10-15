import type { CatalogRegistration } from './parish-giving-catalog.js';
/** Consumed refresh boundary only; the Stripe handler implementation remains JavaScript. */
export function refreshStripeStatusForRegistration<T extends CatalogRegistration>(
  env: Partial<Env>,
  reference: string,
  registration: T,
  options?: { actor?: string; reason?: string; preserveReviewedTimestamp?: boolean; persist?: boolean }
): Promise<
  | { ok: false; status: number; body: { error: string; code: string; retryable: boolean; detail: string } }
  | { ok: true; registration: T }
>;

export function verifyStripeWebhook(payload: string, signature: string, secret: string): Promise<boolean>;
