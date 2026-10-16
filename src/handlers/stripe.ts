import type {
  StripeWebhookEvent,
  StripeHandlerEnv,
  StripeHandlerRegistration,
} from './stripe-composition-contracts.js';

import '../accounting/service-costs.js';

import '../accounting/source-wiring.js';

import '../payments/donation-events.js';

import {
  claimStripeEvent,
  finishStripeEvent,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';

import { logEvent } from '../lib/logging.js';

import '../lib/subscriptions.js';

import { createSubscriptionCheckoutForRegistration } from '../lib/subscription-checkout.js';

import '../learn/billing.js';

import '../lib/email.js';

import '../lib/format.js';

import '../lib/stripe-connect.js';

import '../lib/stripe-volume.js';

import '../lib/stripe-fees.js';

import '../lib/parish-onboarding.js';

import { sendDashboardInvite } from '../lib/parish-notifications.js';

import { activateEarlyAdopterPricing, retireEarlyAdopterPricing } from '../lib/early-adopter-pricing.js';

import {
  appendAdminAudit,
  loadRegistrationByReference,
  requireAdminContext,
  saveRegistrationRecord,
} from './parish.js';

import './parish-commemorations.js';

import './parish-commerce.js';

import '../accounting/source-wiring.js';
import './stripe-shared.js';
import './stripe-shared.js';
import { invalidateAndSaveMaterialRegistration, refreshStripeStatusForRegistration } from './stripe-account-refresh.js';
import { processStripeWebhookEvent } from './stripe-webhook-processing.js';
export { createStripeOnboardingSession, refreshStripeStatusForRegistration } from './stripe-account-refresh.js';
export { processStripeWebhookEvent } from './stripe-webhook-processing.js';

export async function handleSubscriptionCheckout(request: Request, env: StripeHandlerEnv, reference: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: 'Registration not found' }, { status: 404 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const response = await createSubscriptionCheckoutForRegistration({
    request,
    env,
    reference,
    registration,
    body,
    returnPath: '/admin',
    allowTrial: true,
    saveRegistrationRecord,
  });
  let payload: { registration?: StripeHandlerRegistration } | null = null;
  try {
    payload = (await response.clone().json()) as { registration?: StripeHandlerRegistration };
  } catch {
    return response;
  }
  if (!response.ok || !payload?.registration) return response;

  const audited = appendAdminAudit(
    payload.registration,
    payload.registration.subscriptionTrialDays ? 'subscription_demo_checkout_created' : 'subscription_checkout_created',
    adminContext.actor,
    {
      subscriptionTier: payload.registration.subscriptionTier || '',
      subscriptionStatus: payload.registration.subscriptionStatus || '',
      trialDays: payload.registration.subscriptionTrialDays || 0,
      checkoutSessionId: payload.registration.stripeSubscriptionCheckoutSessionId || '',
    }
  );
  await saveRegistrationRecord(env, reference, audited, payload.registration);
  payload.registration = audited;
  return json(payload, { status: response.status });
}

export function parseStripeSignature(header: string | null) {
  const values: Record<string, string> = {};
  for (const part of String(header || '').split(',')) {
    const [key, value] = part.split('=');
    if (key && value) values[key.trim()] = value.trim();
  }
  return values;
}

export function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function secureCompare(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyStripeWebhook(payload: string, signatureHeader: string | null, secret: string | undefined) {
  if (!secret) return false;
  const signature = parseStripeSignature(signatureHeader);
  if (!signature.t || !signature.v1) return false;

  const timestamp = Number(signature.t);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${signature.t}.${payload}`;
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  return secureCompare(toHex(digest), signature.v1);
}

export function stripeWebhookSecrets(env: StripeHandlerEnv) {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_CONNECT].filter(
    (secret, index, secrets) => secret && secrets.indexOf(secret) === index
  );
}

export async function verifyStripeWebhookWithAnySecret(
  payload: string,
  signatureHeader: string | null,
  secrets: (string | undefined)[]
) {
  for (const secret of secrets) {
    if (await verifyStripeWebhook(payload, signatureHeader, secret)) return true;
  }
  return false;
}

export function subscriptionStatusFromStripe(status: string | null | undefined) {
  if (status === 'active' || status === 'trialing') return status;
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'cancelled';
  if (status === 'paused') return 'paused';
  return status || 'not_started';
}

export async function updateSubscriptionRecord(
  env: StripeHandlerEnv,
  reference: string,
  updates: Partial<StripeHandlerRegistration>
) {
  if (!hasProductionStore(env) || !reference) return null;
  const current = await loadRegistrationByReference(env, reference);
  if (!current) return null;
  const nextStatus = String(updates.subscriptionStatus || current.subscriptionStatus || '').toLowerCase();
  if (current.subscriptionPricingProgram === 'founding_20' && nextStatus === 'active') {
    await activateEarlyAdopterPricing(env, reference);
    updates = { ...updates, earlyAdopterActivatedAt: current.earlyAdopterActivatedAt || new Date().toISOString() };
  }
  if (current.subscriptionPricingProgram === 'founding_20' && nextStatus === 'cancelled') {
    await retireEarlyAdopterPricing(env, reference);
    updates = {
      ...updates,
      subscriptionPricingProgram: 'standard',
      earlyAdopterEndedAt: new Date().toISOString(),
      earlyAdopterSlot: null,
    };
  }
  const updated = {
    ...current,
    ...updates,
    subscriptionUpdatedAt: new Date().toISOString(),
  };
  const saved = await invalidateAndSaveMaterialRegistration(
    env,
    reference,
    current,
    updated,
    'stripe-webhook',
    'Stripe changed the AGAPAY subscription configuration.'
  );
  const becamePaid =
    String(current.subscriptionStatus || '').toLowerCase() !== 'active' &&
    String(updates.subscriptionStatus || '').toLowerCase() === 'active';
  const treasurerAccepted = saved.onboardingAccess?.treasurer?.status === 'accepted';
  if (!becamePaid || treasurerAccepted) return saved;

  const invite = (await sendDashboardInvite(
    env,
    env.AGAPAY_APP_URL || env.AGAPAY_PUBLIC_URL || 'https://agapay.app',
    saved as Parameters<typeof sendDashboardInvite>[2]
  )) as Awaited<ReturnType<typeof sendDashboardInvite>> & { id?: string; detail?: unknown };
  const withTreasurerInvite = {
    ...saved,
    dashboardInviteEmailStatus: invite.status,
    dashboardInviteEmailId: invite.id || '',
    dashboardInviteEmailDetail: invite.detail || '',
    dashboardInviteEmailRecipients: invite.recipients || [],
    dashboardInviteEmailSentAt: invite.status === 'sent' ? new Date().toISOString() : saved.dashboardInviteEmailSentAt,
    onboardingAccess: invite.access ? { ...(saved.onboardingAccess || {}), ...invite.access } : saved.onboardingAccess,
    paidTreasurerInviteRequestedAt: new Date().toISOString(),
  };
  await saveRegistrationRecord(env, reference, withTreasurerInvite, saved);
  return withTreasurerInvite;
}

export async function handleStripeWebhook(request: Request, env: StripeHandlerEnv) {
  const requestId = crypto.randomUUID();
  const route = '/api/stripe/webhook';

  const secrets = stripeWebhookSecrets(env);
  if (!secrets.length) {
    await logEvent(env, {
      eventType: 'stripe.webhook.misconfigured',
      severity: 'error',
      requestId,
      route,
      method: 'POST',
      retryable: false,
    });
    return json({ error: 'STRIPE_WEBHOOK_SECRET is not configured' }, { status: 500 });
  }

  const payload = await request.text();
  const verified = await verifyStripeWebhookWithAnySecret(payload, request.headers.get('Stripe-Signature'), secrets);
  if (!verified) {
    await logEvent(env, {
      eventType: 'stripe.webhook.invalid_signature',
      severity: 'warn',
      requestId,
      route,
      method: 'POST',
      retryable: false,
    });
    return json({ error: 'Invalid Stripe signature' }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    await logEvent(env, {
      eventType: 'stripe.webhook.invalid_payload',
      severity: 'warn',
      requestId,
      route,
      method: 'POST',
      retryable: false,
    });
    return json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const claim = await claimStripeEvent(env, event);
  if (!claim.claimed) {
    await logEvent(env, {
      eventType: 'stripe.webhook.duplicate',
      severity: 'info',
      requestId,
      route,
      method: 'POST',
      stripeEventId: event.id,
      metadata: { type: event.type, status: claim.status || 'processed' },
    });
    return json({ received: true, duplicate: true, status: claim.status || 'processed' });
  }

  try {
    await processStripeWebhookEvent(env, event);
    await finishStripeEvent(env, event.id, 'processed');
    await logEvent(env, {
      eventType: 'stripe.webhook.processed',
      severity: 'info',
      requestId,
      route,
      method: 'POST',
      stripeEventId: event.id,
      metadata: { type: event.type },
    });
    return json({ received: true });
  } catch (error) {
    await finishStripeEvent(env, event.id, 'failed', (error as Error | undefined)?.message || String(error));
    await logEvent(env, {
      eventType: 'stripe.webhook.processing_failed',
      severity: 'error',
      requestId,
      route,
      method: 'POST',
      stripeEventId: event.id,
      errorName: (error as Error | undefined)?.name,
      error: error as Error,
      retryable: true,
      metadata: { type: event.type },
    });
    return json(
      { error: 'Webhook processing failed', detail: (error as Error | undefined)?.message || 'Unknown webhook error' },
      { status: 500 }
    );
  }
}

export async function handleStripeRefresh(request: Request, env: StripeHandlerEnv, reference: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-money-actions', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: 'Registration not found' }, { status: 404 });

  const refreshed = await refreshStripeStatusForRegistration(env, reference, registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });
  let updated = refreshed.registration;
  if (
    (registration.stripeAccountStatus || 'not_started') !==
    (refreshed.registration.stripeAccountStatus || 'not_started')
  ) {
    updated = appendAdminAudit(refreshed.registration, 'stripe_status_refreshed', adminContext.actor, {
      from: registration.stripeAccountStatus || 'not_started',
      to: refreshed.registration.stripeAccountStatus || 'not_started',
    });
    await saveRegistrationRecord(env, reference, updated, refreshed.registration);
  }

  return json({ ok: true, recovered: refreshed.recovered === true, registration: updated });
}
