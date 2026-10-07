import type { PaymentMetadata } from '../payments/classification.js';
export interface StripeInvoiceMetadata {
  subscription_details?: { metadata?: PaymentMetadata | null } | null;
  lines?: { data?: ({ metadata?: PaymentMetadata | null } | null)[] | null } | null;
}
export interface StripeChargeClassificationInput {
  invoice?: string | StripeInvoiceMetadata | null;
  payment_intent?: string | { metadata?: PaymentMetadata | null } | null;
  metadata?: PaymentMetadata | null;
}

import { classifyPaymentMetadata } from '../payments/classification.js';

export { STRIPE_PAYMENT_CLASSES } from '../payments/classification.js';

// Compatibility facade for existing Stripe nonprofit-volume consumers. New
// payment flows should use the organization-aware payment domain directly.
export function classifyStripeCharge(charge: StripeChargeClassificationInput = {}) {
  const metadata = {
    ...((charge.invoice as StripeInvoiceMetadata | null | undefined)?.subscription_details?.metadata || {}),
    ...((charge.invoice as StripeInvoiceMetadata | null | undefined)?.lines?.data?.[0]?.metadata || {}),
    ...((charge.payment_intent as { metadata?: PaymentMetadata | null } | null | undefined)?.metadata || {}),
    ...(charge.metadata || {}),
  };
  const classification = classifyPaymentMetadata(metadata);
  return { paymentClass: classification.paymentClass, source: classification.source };
}
