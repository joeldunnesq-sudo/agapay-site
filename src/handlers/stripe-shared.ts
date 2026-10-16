import type { StripeWebhookObject, StripeHandlerEnv, ReceiptOffering } from './stripe-composition-contracts.js';

import '../accounting/service-costs.js';

import '../accounting/source-wiring.js';

import '../payments/donation-events.js';

import '../lib/core.js';

import '../lib/logging.js';

import '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import '../learn/billing.js';

import '../lib/email.js';

import '../lib/format.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-volume.js';

import '../lib/stripe-fees.js';

import '../lib/parish-onboarding.js';

import '../lib/parish-notifications.js';

import '../lib/early-adopter-pricing.js';

import './parish.js';

import './parish-commemorations.js';

import './parish-commerce.js';

import '../accounting/source-wiring.js';
import './stripe-account-refresh.js';
import './stripe.js';
import './stripe-webhook-processing.js';
export const NON_PRODUCTION_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'preview']);
export const ORDER_COMPLETION_COMMERCE_MODULES = new Set(['bookstore', 'events']);
export const ORDER_COMPLETION_ORDER_ID_PREFIXES = ['bookstore_', 'event_'];
export async function sendDonationReceiptIfNeeded(env: StripeHandlerEnv, offering: ReceiptOffering = {}) {
  const donorModule = await import('./donor.js');
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}
export function isCommerceOrderCompletion(object: Partial<StripeWebhookObject> = {}) {
  const module = String(object.metadata?.commerce_module || '');
  const orderId = String(object.metadata?.order_id || '');
  return (
    ORDER_COMPLETION_COMMERCE_MODULES.has(module) ||
    ORDER_COMPLETION_ORDER_ID_PREFIXES.some((prefix) => orderId.startsWith(prefix))
  );
}
