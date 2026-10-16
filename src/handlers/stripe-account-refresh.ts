import type {
  StripeWebhookObject,
  StripeHandlerEnv,
  StripeHandlerRegistration,
  StripeRefreshOptions,
  StripeObjectResponse,
} from './stripe-composition-contracts.js';

import '../accounting/service-costs.js';

import '../accounting/source-wiring.js';

import '../payments/donation-events.js';

import { json } from '../lib/core.js';

import '../lib/logging.js';

import '../lib/subscriptions.js';

import '../lib/subscription-checkout.js';

import '../learn/billing.js';

import '../lib/email.js';

import { absoluteWebsiteUrl, slugify } from '../lib/format.js';

import { stripeAccountStatus, stripeFormRequest, stripeGetRequest } from '../lib/stripe-connect.js';

import '../lib/stripe-volume.js';

import '../lib/stripe-fees.js';

import { STRIPE_READINESS_MAX_AGE_MS, invalidateOnboardingSignoffIfChanged } from '../lib/parish-onboarding.js';

import '../lib/parish-notifications.js';

import '../lib/early-adopter-pricing.js';

import { saveRegistrationRecord } from './parish.js';

import './parish-commemorations.js';

import './parish-commerce.js';

import '../accounting/source-wiring.js';
import { NON_PRODUCTION_ENVIRONMENTS } from './stripe-shared.js';
import './stripe-shared.js';
import './stripe.js';
import './stripe-webhook-processing.js';
export function stripePayoutBankSummary(account: Partial<StripeWebhookObject> = {}) {
  const bank = (Array.isArray(account.external_accounts?.data) ? account.external_accounts.data : []).find(
    (entry) => entry?.object === 'bank_account'
  );
  if (!bank) return {};
  return {
    stripePayoutBankName: String(bank.bank_name || '')
      .trim()
      .slice(0, 160),
    stripePayoutBankLast4: String(bank.last4 || '')
      .trim()
      .slice(-4),
  };
}
export function stripeAccountMaterialState(account: Partial<StripeWebhookObject> = {}) {
  return JSON.stringify({
    id: String(account.id || ''),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    disabledReason: String(account.requirements?.disabled_reason || ''),
    requirementsDue: [
      ...(Array.isArray(account.requirements?.currently_due) ? account.requirements.currently_due : []),
    ].sort(),
    ...stripePayoutBankSummary(account),
  });
}
export function storedStripeMaterialState(registration: StripeHandlerRegistration = {}) {
  return JSON.stringify({
    id: String(registration.stripeAccountId || ''),
    chargesEnabled: registration.stripeChargesEnabled === true,
    payoutsEnabled: registration.stripePayoutsEnabled === true,
    detailsSubmitted: registration.stripeDetailsSubmitted === true,
    disabledReason: String(registration.stripeDisabledReason || ''),
    requirementsDue: [
      ...(Array.isArray(registration.stripeRequirementsDue) ? registration.stripeRequirementsDue : []),
    ].sort(),
    stripePayoutBankName: String(registration.stripePayoutBankName || ''),
    stripePayoutBankLast4: String(registration.stripePayoutBankLast4 || ''),
  });
}
export async function retrieveConnectedAccountForRefresh(
  env: StripeHandlerEnv,
  registration: StripeHandlerRegistration = {},
  referenceHint: string = ''
): Promise<StripeObjectResponse> {
  const environment = String(env.AGAPAY_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  const fixture = registration.onboardingStripeTestFixture;
  if (
    NON_PRODUCTION_ENVIRONMENTS.has(environment) &&
    String(registration.stripeAccountId || '').startsWith('acct_staging_') &&
    fixture?.id === registration.stripeAccountId
  ) {
    return { ok: true, status: 200, body: fixture!, simulated: true };
  }
  if (registration.stripeAccountId) {
    const retrieved = (await stripeGetRequest(
      env,
      `/v1/accounts/${encodeURIComponent(registration.stripeAccountId)}`
    )) as StripeObjectResponse;
    if (retrieved.ok || retrieved.status !== 404) return retrieved;
  }

  if (!registration.stripeOnboardingLinkCreatedAt) {
    return {
      ok: false,
      status: 422,
      body: { error: { message: 'This parish has not started Stripe onboarding yet' } },
    };
  }

  // An Admin page opened before parish-led onboarding could previously save a
  // stale blank account ID over the newly connected account. Recover the
  // account from the immutable AGAPAY metadata written when the parish started
  // Stripe onboarding. Never guess from name or email.
  const reference = String(registration.reference || referenceHint || '').trim();
  const parishId = String(registration.parishId || '').trim();
  if (!reference && !parishId) {
    return {
      ok: false,
      status: 422,
      body: { error: { message: 'No AGAPAY registration identity is available for Stripe recovery' } },
    };
  }

  const matches = [];
  let startingAfter = '';
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (startingAfter) query.set('starting_after', startingAfter);
    const listed = (await stripeGetRequest(env, `/v1/accounts?${query}`)) as StripeObjectResponse;
    if (!listed.ok) return listed;
    const accounts = Array.isArray(listed.body?.data) ? listed.body.data : [];
    matches.push(
      ...accounts.filter((account) => {
        const metadata = account?.metadata || {};
        return (
          (reference && metadata.agapay_reference === reference) || (parishId && metadata.agapay_parish_id === parishId)
        );
      })
    );
    if (!listed.body?.has_more || !accounts.length) break;
    startingAfter = String(accounts.at(-1)?.id || '');
    if (!startingAfter) break;
  }

  const unique = [...new Map(matches.map((account) => [account.id, account])).values()];
  if (unique.length === 1) return { ok: true, status: 200, body: unique[0], recovered: true };
  if (unique.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        error: {
          message: 'Multiple Stripe accounts match this parish. AGAPAY support must select the canonical account.',
        },
      },
    };
  }
  return {
    ok: false,
    status: 422,
    body: { error: { message: 'No connected Stripe account was found for this parish' } },
  };
}
export async function invalidateAndSaveMaterialRegistration<
  P extends StripeHandlerRegistration,
  N extends StripeHandlerRegistration,
>(
  env: StripeHandlerEnv,
  reference: string,
  previous: P,
  next: N,
  actor: string,
  reason: string,
  persist: boolean = true
) {
  const updated = await invalidateOnboardingSignoffIfChanged(previous, next, {
    actor,
    reason,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
  });
  if (persist) await saveRegistrationRecord(env, reference, updated, previous);
  return updated;
}

export async function createStripeOnboardingSession(
  request: Request,
  env: StripeHandlerEnv,
  reference: string,
  registration: StripeHandlerRegistration,
  returnPath: string = '/admin'
) {
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeAccountId = registration.stripeAccountId || '';
  let stripeAccount = null;

  if (!stripeAccountId) {
    const accountForm = new URLSearchParams({
      type: 'standard',
      country: 'US',
      email: registration.treasurerEmail || registration.priestEmail || '',
      business_type: 'non_profit',
      'business_profile[name]': registration.parishName || 'AGAPAY Parish',
      'business_profile[product_description]':
        'Online tithes, stewardship, and charitable donations for an Orthodox Christian parish.',
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'metadata[agapay_reference]': reference,
      'metadata[agapay_parish_id]': registration.parishId || slugify(registration.parishName),
    });
    const website = absoluteWebsiteUrl(registration.website);
    if (website) accountForm.set('business_profile[url]', website);

    const created = (await stripeFormRequest(env, '/v1/accounts', accountForm)) as StripeObjectResponse;
    if (!created.ok) {
      return json(
        {
          error: 'Stripe connected account creation failed',
          detail: created.body.error?.message || 'Unknown Stripe error',
        },
        { status: 502 }
      );
    }

    stripeAccount = created.body;
    stripeAccountId = stripeAccount.id as string;
  } else {
    const retrieved = (await stripeGetRequest(
      env,
      `/v1/accounts/${encodeURIComponent(stripeAccountId)}`
    )) as StripeObjectResponse;
    if (!retrieved.ok) {
      return json(
        {
          error: 'Stripe connected account lookup failed',
          detail: retrieved.body.error?.message || 'Unknown Stripe error',
        },
        { status: 502 }
      );
    }
    stripeAccount = retrieved.body;
  }

  const returnSeparator = returnPath.includes('?') ? '&' : '?';
  const linkForm = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: `${appUrl}${returnPath}${returnSeparator}stripe_refresh=${encodeURIComponent(reference)}`,
    return_url: `${appUrl}${returnPath}${returnSeparator}stripe_return=${encodeURIComponent(reference)}`,
    type: 'account_onboarding',
  });
  const link = (await stripeFormRequest(env, '/v1/account_links', linkForm)) as StripeObjectResponse;
  if (!link.ok) {
    return json(
      { error: 'Stripe onboarding link failed', detail: link.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  const next = {
    ...registration,
    ...stripePayoutBankSummary(stripeAccount),
    parishDashboardToken: registration.parishDashboardToken || crypto.randomUUID(),
    stripeAccountId,
    stripeAccountStatus: stripeAccountStatus(stripeAccount),
    stripeChargesEnabled: Boolean(stripeAccount.charges_enabled),
    stripePayoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    stripeDetailsSubmitted: Boolean(stripeAccount.details_submitted),
    stripeDisabledReason: stripeAccount.requirements?.disabled_reason || '',
    stripeRequirementsDue: stripeAccount.requirements?.currently_due || [],
    stripeOnboardingLinkCreatedAt: new Date().toISOString(),
    reviewedAt: registration.reviewedAt || new Date().toISOString(),
  };
  const updated = await invalidateAndSaveMaterialRegistration(
    env,
    reference,
    registration,
    next,
    'stripe-connect',
    'The connected Stripe account or payout destination changed.'
  );

  return { onboardingUrl: link.body.url, registration: updated };
}

export async function refreshStripeStatusForRegistration<T extends StripeHandlerRegistration>(
  env: StripeHandlerEnv,
  reference: string,
  registration: T,
  options: StripeRefreshOptions = {}
) {
  const retrieved = await retrieveConnectedAccountForRefresh(env, registration, reference);
  if (!retrieved.ok) {
    return {
      ok: false as const,
      status: retrieved.status === 409 ? 409 : retrieved.status === 422 ? 422 : 502,
      body: {
        error:
          retrieved.body.error?.message ||
          'Stripe could not confirm the connected account. Please retry before going live.',
        code:
          retrieved.status === 409
            ? 'stripe_account_ambiguous'
            : retrieved.status === 422
              ? 'stripe_account_not_found'
              : 'stripe_refresh_failed',
        retryable: ![409, 422].includes(retrieved.status),
        detail: retrieved.body.error?.message || 'Unknown Stripe error',
      },
    };
  }

  const account = retrieved.body;
  const confirmedAt = new Date().toISOString();
  const priorCheckedAtMs = new Date(registration.stripeStatusCheckedAt || '').getTime();
  const unchanged = stripeAccountMaterialState(account) === storedStripeMaterialState(registration);
  const preserveReviewedTimestamp =
    options.preserveReviewedTimestamp === true &&
    unchanged &&
    Number.isFinite(priorCheckedAtMs) &&
    Date.now() - priorCheckedAtMs <= STRIPE_READINESS_MAX_AGE_MS;
  const next = {
    ...registration,
    ...stripePayoutBankSummary(account),
    stripeAccountId: String(account.id || registration.stripeAccountId || ''),
    stripeAccountStatus: stripeAccountStatus(account),
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeDisabledReason: account.requirements?.disabled_reason || '',
    stripeRequirementsDue: account.requirements?.currently_due || [],
    stripeStatusCheckedAt: preserveReviewedTimestamp ? registration.stripeStatusCheckedAt : confirmedAt,
    stripeLastConfirmedAt: confirmedAt,
  };
  const updated = await invalidateAndSaveMaterialRegistration(
    env,
    reference,
    registration,
    next,
    options.actor || 'stripe-refresh',
    options.reason || 'Stripe changed the connected account readiness or payout destination.',
    options.persist !== false
  );

  return {
    ok: true as const,
    registration: updated as T & typeof updated,
    account,
    confirmedAt,
    recovered: retrieved.recovered === true,
    simulated: retrieved.simulated === true,
  };
}
