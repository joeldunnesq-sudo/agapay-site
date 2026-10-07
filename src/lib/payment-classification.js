// Generated from src/lib/payment-classification.ts by npm run build:server. Do not edit.
import { classifyPaymentMetadata } from '../payments/classification.js';
import { STRIPE_PAYMENT_CLASSES } from '../payments/classification.js';
function classifyStripeCharge(charge = {}) {
  const metadata = {
    ...(charge.invoice?.subscription_details?.metadata || {}),
    ...(charge.invoice?.lines?.data?.[0]?.metadata || {}),
    ...(charge.payment_intent?.metadata || {}),
    ...(charge.metadata || {}),
  };
  const classification = classifyPaymentMetadata(metadata);
  return { paymentClass: classification.paymentClass, source: classification.source };
}
export { STRIPE_PAYMENT_CLASSES, classifyStripeCharge };
