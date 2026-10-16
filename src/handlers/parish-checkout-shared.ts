import type { CheckoutEnvironment, CheckoutRegistration } from './parish-checkout-composition-contracts.js';

import '../payments/donation-events.js';

// src/handlers/parish-checkout.js
// Parish registration, giving checkout, and Stripe account/billing orchestration.

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

export function d1(env: CheckoutEnvironment) {
  return env.AGAPAY_DB || env.DB || null;
}
export async function parishDashboardPayloadWithPricingUsage(
  env: CheckoutEnvironment,
  parishId: string,
  registration: CheckoutRegistration
) {
  return {
    ...parishDashboardPayload(parishId, registration),
    parishPricingUsage: await loadParishPricingUsage(env, parishId, registration),
  };
}
export async function sendDonationReceiptIfNeeded(
  env: CheckoutEnvironment,
  offering: import('./parish-donor-offerings.js').ReceiptOffering = {}
) {
  const donorModule = await import('./donor.js');
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}
export async function refreshStripeStatusForRegistration(
  env: CheckoutEnvironment,
  reference: string,
  registration: CheckoutRegistration
) {
  const stripeModule = await import('./stripe.js');
  return stripeModule.refreshStripeStatusForRegistration(env, reference, registration);
}
export async function createStripeOnboardingSession(
  request: Request,
  env: CheckoutEnvironment,
  reference: string,
  registration: CheckoutRegistration,
  returnPath: string
) {
  const stripeModule = await import('./stripe.js');
  return stripeModule.createStripeOnboardingSession(request, env, reference, registration, returnPath);
}
