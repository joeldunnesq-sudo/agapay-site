import { classifyPaymentMetadata } from '../payments/classification.js';

export { STRIPE_PAYMENT_CLASSES } from '../payments/classification.js';

// Compatibility facade for existing Stripe nonprofit-volume consumers. New
// payment flows should use the organization-aware payment domain directly.
export function classifyStripeCharge(charge = {}) {
  const metadata = {
    ...(charge.invoice?.subscription_details?.metadata || {}),
    ...(charge.invoice?.lines?.data?.[0]?.metadata || {}),
    ...(charge.payment_intent?.metadata || {}),
    ...(charge.metadata || {}),
  };
  const classification = classifyPaymentMetadata(metadata);
  return { paymentClass: classification.paymentClass, source: classification.source };
}
