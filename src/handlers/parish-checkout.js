// Generated from src/handlers/parish-checkout.ts by npm run build:server. Do not edit.
import '../payments/donation-events.js';
import '../festal-alms.js';
import '../lib/registration-retries.js';
import '../payments/giving-checkout.js';
import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { ensureBenevolenceFundInRegistration } from '../lib/stewardship-funds.js';
import { buildParishOnboardingWorkflow, invalidateOnboardingSignoffIfChanged } from '../lib/parish-onboarding.js';
import '../lib/tax-exemption.js';
import { createSubscriptionCheckoutForRegistration } from '../lib/subscription-checkout.js';
import {
  PARISH_INTRO_DEMO_DAYS,
  normalizeParishHouseholdBand,
  parishIntroDemoEligible,
  subscriptionTier as sharedSubscriptionTier,
} from '../lib/subscriptions.js';
import { validateParishCheckoutBand } from '../lib/parish-pricing-usage.js';
import { parishSlug } from '../lib/format.js';
import '../lib/registration-intake.js';
import '../lib/tax-readiness.js';
import '../lib/legal-acceptance.js';
import '../lib/stripe-fees.js';
import { stripeFormRequest, stripeGetRequest } from '../lib/stripe-connect.js';
import { generateDashboardToken, sendDashboardInvite } from '../lib/parish-notifications.js';
import './parish-giving-catalog.js';
import './parish-commemorations.js';
import './parish-donor-offerings.js';
import {
  appendAdminAudit,
  findRegistrationByParishId,
  loadRegistrationByReference,
  parishDashboardPayload,
  requireAdminContext,
  saveRegistrationRecord,
  verifyParishDashboardBearer,
} from './parish.js';
import {
  d1,
  parishDashboardPayloadWithPricingUsage,
  refreshStripeStatusForRegistration,
  createStripeOnboardingSession,
} from './parish-checkout-shared.js';
import './parish-registration-intake.js';
import './parish-giving-checkout.js';
import { handleRegistrations } from './parish-registration-intake.js';
import { handleCheckout, handleCheckoutSessionStatus } from './parish-giving-checkout.js';
async function handleParishStripeRefresh(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-money-actions', { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  const refreshed = await refreshStripeStatusForRegistration(env, found.key, found.registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });
  const onboarding = await buildParishOnboardingWorkflow(refreshed.registration, {
    appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
  });
  return json({
    ok: true,
    recovered: refreshed.recovered === true,
    parish: { ...parishDashboardPayload(parishId, refreshed.registration), onboarding },
    onboarding,
    registration: refreshed.registration,
  });
}
async function handleDashboardInvite(request, env, reference) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-email-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: 'Registration not found' }, { status: 404 });
  if (registration.status !== 'verified') {
    return json({ error: 'Verify the parish before sending a dashboard invite' }, { status: 422 });
  }
  const parishDashboardToken = registration.parishDashboardToken || (d1(env) ? '' : generateDashboardToken());
  const withToken = {
    ...registration,
    parishId: registration.parishId || parishSlug(registration.parishName, registration.city),
    parishDashboardToken,
    parishDashboardTokenTemporary: d1(env) ? Boolean(registration.parishDashboardTokenTemporary) : true,
    parishDashboardTokenCreatedAt:
      registration.parishDashboardTokenCreatedAt || /* @__PURE__ */ new Date().toISOString(),
  };
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendDashboardInvite(env, appUrl, withToken);
  const updated = {
    ...withToken,
    dashboardInviteEmailStatus: email.status,
    dashboardInviteEmailId: email.id || '',
    dashboardInviteEmailDetail: email.detail || '',
    dashboardInviteEmailRecipients: email.recipients || [],
    dashboardInviteEmailSentAt:
      email.status === 'sent' ? /* @__PURE__ */ new Date().toISOString() : withToken.dashboardInviteEmailSentAt,
    onboardingAccess: email.access
      ? { ...(withToken.onboardingAccess || {}), ...email.access }
      : withToken.onboardingAccess,
  };
  const audited = appendAdminAudit(updated, 'dashboard_invite_requested', adminContext.actor, {
    emailStatus: email.status || 'unknown',
    recipients: email.recipients || [],
  });
  await saveRegistrationRecord(env, reference, audited, withToken);
  return json({ ok: true, email, registration: audited });
}
async function handleParishStripeOnboarding(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-money-actions', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== 'verified') {
    return json({ error: 'This parish is not verified for giving yet' }, { status: 422 });
  }
  const result = await createStripeOnboardingSession(
    request,
    env,
    found.key,
    found.registration,
    `/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  );
  if (result instanceof Response) return result;
  return json({ ok: true, onboardingUrl: result.onboardingUrl, parish: result.registration });
}
async function handleParishSubscriptionCheckout(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-money-actions', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== 'verified') {
    return json({ error: 'This parish is not verified for billing setup yet' }, { status: 422 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const liveUsage = await validateParishCheckoutBand(env, parishId, found.registration, body);
  if (liveUsage)
    return json(
      {
        error: `Your ${liveUsage.representedHouseholds} represented households require the ${liveUsage.recommendedBandLabel} Parish pricing band.`,
        code: 'parish_household_band_upgrade_required',
        parishPricingUsage: liveUsage,
      },
      { status: 422 }
    );
  return createSubscriptionCheckoutForRegistration({
    request,
    env,
    reference: found.key,
    registration: found.registration,
    body,
    introductoryTrialDays: parishIntroDemoEligible(found.registration) ? PARISH_INTRO_DEMO_DAYS : 0,
    returnPath: `/parish/dashboard?parish=${encodeURIComponent(parishId)}`,
    saveRegistrationRecord,
  });
}
async function handleParishDemoTier(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (parishId !== 'st-fiacre')
    return json({ error: 'Demo tier switching is available only for St. Fiacre.' }, { status: 404 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const requestedTier = String(body.subscriptionTier || '')
    .trim()
    .toLowerCase();
  const requestedHouseholdBand = normalizeParishHouseholdBand(
    body.parishHouseholdBand ?? found.registration.parishHouseholdBand
  );
  if (requestedTier === 'parish' && !requestedHouseholdBand) {
    return json({ error: 'Choose a valid active-household range for the Parish demo.' }, { status: 422 });
  }
  const tier = sharedSubscriptionTier({
    ...found.registration,
    subscriptionTier: requestedTier,
    parishHouseholdBand: requestedHouseholdBand,
  });
  if (!tier || !['starter', 'giving', 'parish'].includes(tier.id)) {
    return json({ error: 'Choose Give, Give +, or Parish for the demo.' }, { status: 422 });
  }
  const current = found.registration;
  const tierUpdate = {
    ...current,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    parishHouseholdBand: requestedHouseholdBand || current.parishHouseholdBand || '',
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: 'active',
    subscriptionTrialDays: 0,
    demoTierChangedAt: /* @__PURE__ */ new Date().toISOString(),
    parishUpdatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
  let updated = tier.modules?.givingPlus ? ensureBenevolenceFundInRegistration(tierUpdate).registration : tierUpdate;
  updated = await invalidateOnboardingSignoffIfChanged(current, updated, {
    actor: current.treasurerEmail || current.priestEmail || 'parish',
    reason: 'The parish subscription tier changed.',
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
  });
  await saveRegistrationRecord(env, found.key, updated, current);
  return json({ ok: true, parish: await parishDashboardPayloadWithPricingUsage(env, parishId, updated) });
}
async function handleParishSubscriptionRefresh(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-money-actions', { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  const registration = found.registration;
  const sessionId = registration.stripeSubscriptionCheckoutSessionId || '';
  if (!sessionId) {
    return json({
      ok: true,
      subscriptionStatus: registration.subscriptionStatus || 'not_started',
      stripeSubscriptionId: registration.stripeSubscriptionId || '',
      stripeCustomerId: registration.stripeCustomerId || '',
    });
  }
  const session = await stripeGetRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!session.ok) {
    return json(
      { error: 'Stripe subscription lookup failed', detail: session.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }
  const stripeSession = session.body || {};
  const now = /* @__PURE__ */ new Date().toISOString();
  const updates = {
    stripeCustomerId: stripeSession.customer || registration.stripeCustomerId || '',
    stripeSubscriptionCheckoutSessionStatus:
      stripeSession.status || registration.stripeSubscriptionCheckoutSessionStatus || '',
    stripeSubscriptionCheckoutPaymentStatus:
      stripeSession.payment_status || registration.stripeSubscriptionCheckoutPaymentStatus || '',
    subscriptionLastCheckedAt: now,
  };
  if (
    stripeSession.mode === 'subscription' &&
    stripeSession.subscription &&
    (stripeSession.status === 'complete' || stripeSession.payment_status === 'paid')
  ) {
    const trialDays = Number(registration.subscriptionTrialDays || 0);
    updates.subscriptionStatus = trialDays > 0 ? 'trialing' : 'active';
    updates.stripeSubscriptionId = stripeSession.subscription;
    updates.subscriptionActivatedAt = registration.subscriptionActivatedAt || now;
    if (trialDays > 0) {
      updates.subscriptionIntroDemoRedeemedAt = registration.subscriptionIntroDemoRedeemedAt || now;
      updates.subscriptionTrialStartedAt = registration.subscriptionTrialStartedAt || now;
      updates.subscriptionTrialEndsAt =
        registration.subscriptionTrialEndsAt || new Date(Date.now() + trialDays * 864e5).toISOString();
    }
  }
  let updated = { ...registration, ...updates };
  updated = await invalidateOnboardingSignoffIfChanged(registration, updated, {
    actor: registration.treasurerEmail || registration.priestEmail || 'parish',
    reason: 'Stripe subscription status changed.',
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
  });
  await saveRegistrationRecord(env, found.key, updated, registration);
  return json({
    ok: true,
    subscriptionStatus: updated.subscriptionStatus || 'not_started',
    stripeSubscriptionId: updated.stripeSubscriptionId || '',
    stripeCustomerId: updated.stripeCustomerId || '',
    subscriptionTrialStartedAt: updated.subscriptionTrialStartedAt || '',
    subscriptionTrialEndsAt: updated.subscriptionTrialEndsAt || '',
    stripeSubscriptionCheckoutSessionStatus: updated.stripeSubscriptionCheckoutSessionStatus || '',
    stripeSubscriptionCheckoutPaymentStatus: updated.stripeSubscriptionCheckoutPaymentStatus || '',
  });
}
async function handleParishSubscriptionPortal(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-money-actions', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  const body = await request.json().catch(() => ({}));
  const flow = String(body.flow || 'manage')
    .trim()
    .toLowerCase();
  if (!['manage', 'cancel'].includes(flow)) {
    return json({ error: 'Invalid subscription portal flow' }, { status: 400 });
  }
  const customerId = found.registration.stripeCustomerId || '';
  if (!customerId) {
    return json(
      {
        error: 'No billing customer found',
        detail: 'Complete AGAPAY billing checkout before opening subscription management.',
      },
      { status: 422 }
    );
  }
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: customerId,
    return_url: `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}`,
  });
  if (flow === 'cancel') {
    const subscriptionId = found.registration.stripeSubscriptionId || '';
    if (!subscriptionId) {
      return json(
        { error: 'No active subscription found', detail: 'Refresh billing status before cancelling AGAPAY Give.' },
        { status: 422 }
      );
    }
    form.set('flow_data[type]', 'subscription_cancel');
    form.set('flow_data[subscription_cancel][subscription]', subscriptionId);
    form.set('flow_data[after_completion][type]', 'redirect');
    form.set(
      'flow_data[after_completion][redirect][return_url]',
      `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}&subscription_cancelled=1`
    );
  } else form.set('flow_data[type]', 'payment_method_update');
  if (env.AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION) {
    form.set('configuration', env.AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION);
  }
  const session = await stripeFormRequest(env, '/v1/billing_portal/sessions', form);
  if (!session.ok) {
    return json(
      { error: 'Stripe billing portal failed', detail: session.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }
  return json({ ok: true, portalUrl: session.body.url });
}
export {
  handleCheckout,
  handleCheckoutSessionStatus,
  handleDashboardInvite,
  handleParishDemoTier,
  handleParishStripeOnboarding,
  handleParishStripeRefresh,
  handleParishSubscriptionCheckout,
  handleParishSubscriptionPortal,
  handleParishSubscriptionRefresh,
  handleRegistrations,
};
