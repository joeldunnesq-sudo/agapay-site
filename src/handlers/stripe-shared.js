// Generated from src/handlers/stripe-shared.ts by npm run build:server. Do not edit.
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
const NON_PRODUCTION_ENVIRONMENTS = /* @__PURE__ */ new Set(['development', 'test', 'staging', 'preview']);
const ORDER_COMPLETION_COMMERCE_MODULES = /* @__PURE__ */ new Set(['bookstore', 'events']);
const ORDER_COMPLETION_ORDER_ID_PREFIXES = ['bookstore_', 'event_'];
async function sendDonationReceiptIfNeeded(env, offering = {}) {
  const donorModule = await import('./donor.js');
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}
function isCommerceOrderCompletion(object = {}) {
  const module = String(object.metadata?.commerce_module || '');
  const orderId = String(object.metadata?.order_id || '');
  return (
    ORDER_COMPLETION_COMMERCE_MODULES.has(module) ||
    ORDER_COMPLETION_ORDER_ID_PREFIXES.some((prefix) => orderId.startsWith(prefix))
  );
}
export {
  NON_PRODUCTION_ENVIRONMENTS,
  ORDER_COMPLETION_COMMERCE_MODULES,
  ORDER_COMPLETION_ORDER_ID_PREFIXES,
  isCommerceOrderCompletion,
  sendDonationReceiptIfNeeded,
};
