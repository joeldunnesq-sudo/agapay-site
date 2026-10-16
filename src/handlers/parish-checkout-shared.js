// Generated from src/handlers/parish-checkout-shared.ts by npm run build:server. Do not edit.
import '../payments/donation-events.js';
import '../festal-alms.js';
import '../lib/registration-retries.js';
import '../payments/giving-checkout.js';
import '../lib/core.js';
import '../lib/stewardship-funds.js';
import '../lib/parish-onboarding.js';
import '../lib/tax-exemption.js';
import '../lib/subscription-checkout.js';
import '../lib/subscriptions.js';
import { loadParishPricingUsage } from '../lib/parish-pricing-usage.js';
import '../lib/format.js';
import '../lib/registration-intake.js';
import '../lib/tax-readiness.js';
import '../lib/legal-acceptance.js';
import '../lib/stripe-fees.js';
import '../lib/stripe-connect.js';
import '../lib/parish-notifications.js';
import './parish-giving-catalog.js';
import './parish-commemorations.js';
import './parish-donor-offerings.js';
import { parishDashboardPayload } from './parish.js';
import './parish-registration-intake.js';
import './parish-giving-checkout.js';
import './parish-checkout.js';
function d1(env) {
  return env.AGAPAY_DB || env.DB || null;
}
async function parishDashboardPayloadWithPricingUsage(env, parishId, registration) {
  return {
    ...parishDashboardPayload(parishId, registration),
    parishPricingUsage: await loadParishPricingUsage(env, parishId, registration),
  };
}
async function sendDonationReceiptIfNeeded(env, offering = {}) {
  const donorModule = await import('./donor.js');
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}
async function refreshStripeStatusForRegistration(env, reference, registration) {
  const stripeModule = await import('./stripe.js');
  return stripeModule.refreshStripeStatusForRegistration(env, reference, registration);
}
async function createStripeOnboardingSession(request, env, reference, registration, returnPath) {
  const stripeModule = await import('./stripe.js');
  return stripeModule.createStripeOnboardingSession(request, env, reference, registration, returnPath);
}
export {
  createStripeOnboardingSession,
  d1,
  parishDashboardPayloadWithPricingUsage,
  refreshStripeStatusForRegistration,
  sendDonationReceiptIfNeeded,
};
