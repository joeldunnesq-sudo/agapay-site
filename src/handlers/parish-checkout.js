// src/handlers/parish-checkout.js
// Parish registration, giving checkout, and Stripe account/billing orchestration.

import { activeFestalAlmsCampaigns } from '../festal-alms.js';
import {
  givingCheckoutReturnUrls,
  normalizeGivingFrequency,
  stripeRecurringSchedule,
} from '../payments/giving-checkout.js';
import {
  d1Run,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
  verifyTurnstileIfConfigured,
} from '../lib/core.js';
import { ensureBenevolenceFundInRegistration } from '../lib/stewardship-funds.js';
import { buildParishOnboardingWorkflow, invalidateOnboardingSignoffIfChanged } from '../lib/parish-onboarding.js';
import { createTaxExemptionClaim, issueClaimUploadToken } from '../lib/tax-exemption.js';
import { createSubscriptionCheckoutForRegistration } from '../lib/subscription-checkout.js';
import {
  PARISH_INTRO_DEMO_DAYS,
  normalizeParishHouseholdBand,
  parishIntroDemoEligible,
  subscriptionTier as sharedSubscriptionTier,
} from '../lib/subscriptions.js';
import { loadParishPricingUsage, validateParishCheckoutBand } from '../lib/parish-pricing-usage.js';
import { parishSlug } from '../lib/format.js';
import {
  registrationAgreementEvidence,
  registrationRequiresJurisdiction,
  registrationRequiresValuesReview,
  registrationRequiresWebsite,
  sanitizePublicRegistrationInput,
} from '../lib/registration-intake.js';
import { withTaxReadinessDefaults } from '../lib/tax-readiness.js';
import { recordOrganizationRegistrationAcceptance } from '../lib/legal-acceptance.js';
import { centsFromAmount, checkoutFinancials, donationAmountError, donorName } from '../lib/stripe-fees.js';
import {
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  stripeFormRequest,
  stripeGetConnectedRequest,
  stripeGetRequest,
} from '../lib/stripe-connect.js';
import {
  generateDashboardToken,
  sendAdminRegistrationNotice,
  sendDashboardInvite,
  sendRegistrationConfirmation,
} from '../lib/parish-notifications.js';
import { publicBoolean, publicComment } from './parish-giving-catalog.js';
import { ensureCommemorationEntryFromOffering } from './parish-commemorations.js';
import {
  loadDonorOfferingByCheckout,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
} from './parish-donor-offerings.js';
import {
  appendAdminAudit,
  defaultSubscriptionTier,
  findCheckoutParish,
  findOrCreateDonorCustomer,
  findRegistrationByParishId,
  isCandleGivingFund,
  isGeneralGivingFund,
  loadRegistrationByReference,
  parishDashboardPayload,
  requireAdminContext,
  requireDonor,
  requireFields,
  saveRegistrationRecord,
  slugify,
  verifyParishDashboardBearer,
} from './parish.js';

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

export async function handleRegistrations(request, env) {
  const limited = await rateLimit(request, env, 'registrations', { limit: 6, windowSeconds: 600 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  body = sanitizePublicRegistrationInput(body);
  if (body.canonicalAgreement !== true)
    return json({ error: 'Authorization and agreement to the Terms of Service are required.' }, { status: 422 });

  const requiredFields = [
    'communityType',
    'parishName',
    'addressLine1',
    'city',
    'state',
    'postalCode',
    'subscriptionTier',
    'priestFirst',
    'priestEmail',
    'priestPhone',
    'treasurerFirst',
    'treasurerEmail',
    'acceptingName',
    'acceptingEmail',
    'acceptingRole',
  ];

  if (registrationRequiresJurisdiction(body.communityType)) requiredFields.push('jurisdiction');
  if (String(body.subscriptionTier || '').toLowerCase() === 'parish') requiredFields.push('parishHouseholdBand');
  if (registrationRequiresWebsite(body.communityType)) requiredFields.push('website');
  if (registrationRequiresValuesReview(body.communityType)) requiredFields.push('organizationDescription');

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: 'Missing required fields', fields: missing }, { status: 422 });

  if (
    !String(body.priestEmail).includes('@') ||
    !String(body.treasurerEmail).includes('@') ||
    !String(body.acceptingEmail).includes('@')
  ) {
    return json({ error: 'A valid primary contact and finance contact email are required' }, { status: 422 });
  }

  const communityType = String(body.communityType || '');
  const requestedTier = String(body.subscriptionTier || '')
    .trim()
    .toLowerCase();
  const selectableParishTiers = new Set(['starter', 'giving', 'parish']);
  const validTierForCommunity =
    communityType === 'Cathedral'
      ? requestedTier === 'diocese'
      : communityType === 'Monastery'
        ? requestedTier === 'monastery_free'
        : selectableParishTiers.has(requestedTier);
  if (!validTierForCommunity) {
    return json({ error: 'Choose a valid starting tier for this community type.' }, { status: 422 });
  }
  if (requestedTier === 'parish' && !normalizeParishHouseholdBand(body.parishHouseholdBand))
    return json({ error: 'Choose a valid active-household range.' }, { status: 422 });
  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`,
    receivedAt = new Date().toISOString();
  const subscriptionTierId = requestedTier;
  const tier =
    sharedSubscriptionTier({ ...body, subscriptionTier: subscriptionTierId }) ||
    sharedSubscriptionTier({ ...body, subscriptionTier: defaultSubscriptionTier(body) });
  const baseParishId = parishSlug(body.parishName, body.city);
  let parishId = baseParishId;
  if (await findRegistrationByParishId(env, parishId)) {
    const stateSuffix = slugify(body.state);
    parishId = stateSuffix ? `${baseParishId}-${stateSuffix}`.slice(0, 80) : baseParishId;
    let collision = await findRegistrationByParishId(env, parishId);
    let suffix = 2;
    while (collision && suffix < 100) {
      parishId = `${baseParishId}-${stateSuffix ? `${stateSuffix}-` : ''}${suffix}`.slice(0, 80);
      collision = await findRegistrationByParishId(env, parishId);
      suffix += 1;
    }
    if (collision)
      return json({ error: 'Unable to create a unique parish ID. Please contact AGAPAY support.' }, { status: 409 });
  }
  const parishDashboardToken = generateDashboardToken();
  const registrationWithTier = withTaxReadinessDefaults({
    ...body,
    reference,
    status: 'pending',
    receivedAt,
    canonicalVerification: 'pending_review',
    parishId,
    parishUsername: parishId,
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: receivedAt,
    ...registrationAgreementEvidence(receivedAt),
    subscriptionTier: tier?.id || 'parish',
    subscriptionPricingProgram: tier?.id === 'parish' ? 'early_adopter_candidate' : 'standard',
    subscriptionStatus: tier?.monthlyCents === 0 ? 'free_forever' : 'not_started',
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || '',
  });
  const registration = tier?.modules?.givingPlus
    ? ensureBenevolenceFundInRegistration(registrationWithTier).registration
    : registrationWithTier;

  await recordOrganizationRegistrationAcceptance(env, request, { body, parishId, reference });

  let taxExemptionResult = null;
  if (env.AGAPAY_REGISTRATIONS) {
    await saveRegistrationRecord(env, reference, registration);
    const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
    const [notice, confirmation] = await Promise.all([
      sendAdminRegistrationNotice(env, appUrl, registration),
      sendRegistrationConfirmation(env, appUrl, registration),
    ]);
    await saveRegistrationRecord(
      env,
      reference,
      {
        ...registration,
        adminNotificationEmailStatus: notice.status,
        adminNotificationEmailId: notice.id || '',
        adminNotificationEmailDetail: notice.detail || '',
        adminNotificationEmailSentAt: notice.status === 'sent' ? new Date().toISOString() : '',
        confirmationEmailStatus: confirmation.status,
        confirmationEmailId: confirmation.id || '',
        confirmationEmailSentAt: confirmation.status === 'sent' ? new Date().toISOString() : '',
      },
      registration
    );

    // Optional inline sales-tax exemption claim, submitted in the same
    // registration request. This never blocks or rolls back the
    // registration itself: any failure here is caught and surfaced in the
    // response as taxExemption.error, with the registration already saved.
    //
    // Phase 3B correction: the certificate document is NOT sent as base64
    // inside this JSON body. The claim is created here with no binary
    // attached, and a short-lived, claim-scoped upload token is returned so
    // the browser can upload the file separately via multipart/form-data to
    // POST /api/tax-exemption/:taxExemptionId/upload. That route verifies
    // the token (see verifyClaimUploadToken in src/lib/tax-exemption.js)
    // rather than requiring a parish dashboard bearer token that doesn't
    // exist yet immediately after registration.
    const exemptionInput = body.taxExemption;
    if (exemptionInput && (exemptionInput.claimsExemption === true || exemptionInput.claimsExemption === 'yes')) {
      try {
        const jurisdiction = String(exemptionInput.jurisdiction || '')
          .trim()
          .toUpperCase();
        const repName = String(exemptionInput.authorizedRepresentativeName || '').trim();
        const repTitle = String(exemptionInput.authorizedRepresentativeTitle || '').trim();
        if (!jurisdiction) throw new Error('Exemption jurisdiction is required.');
        if (!repName || !repTitle) throw new Error('Authorized representative name and title are required.');
        if (exemptionInput.certified !== true) throw new Error('You must certify the exemption claim.');
        if (jurisdiction === 'OTHER' && !String(exemptionInput.multistateExplanation || '').trim()) {
          throw new Error('Please explain the jurisdiction or multistate use this exemption relates to.');
        }

        const taxExemptionId = await createTaxExemptionClaim(env, {
          registrationReference: reference,
          parishId,
          jurisdiction,
          exemptionType: String(exemptionInput.exemptionType || '').trim() || 'religious_organization',
          certificateNumber: exemptionInput.certificateNumber || '',
          effectiveDate: exemptionInput.effectiveDate || '',
          expirationDate: exemptionInput.expirationDate || '',
          authorizedRepresentativeName: repName,
          authorizedRepresentativeTitle: repTitle,
          actorUserId: body.treasurerEmail || body.priestEmail || '',
          internalReviewStatus: jurisdiction === 'OTHER' ? 'needs_manual_review' : null,
        });
        if (d1(env)) {
          await d1Run(
            env,
            `UPDATE registrations SET tax_exemption_status = 'pending', current_tax_exemption_id = ?1 WHERE reference = ?2`,
            taxExemptionId,
            reference
          );
        }

        const upload = await issueClaimUploadToken(env, taxExemptionId);
        taxExemptionResult = {
          ok: true,
          taxExemptionId,
          uploadRequired: true,
          uploadToken: upload.token,
          uploadTokenExpiresAt: upload.expiresAt,
          uploadUrl: `/api/tax-exemption/${encodeURIComponent(taxExemptionId)}/upload`,
        };
      } catch (exemptionError) {
        taxExemptionResult = { ok: false, error: exemptionError.message || 'Could not submit exemption claim.' };
      }
    }
  }

  return json(
    {
      ok: true,
      reference,
      mode: hasProductionStore(env) ? 'stored' : 'demo',
      message: 'Registration received. AGAPAY will review the organization before activation.',
      ...(taxExemptionResult ? { taxExemption: taxExemptionResult } : {}),
    },
    { status: 201 }
  );
}

export async function handleCheckout(request, env) {
  const limited = await rateLimit(request, env, 'checkout', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const missing = requireFields(body, ['parishId', 'giftType', 'amount', 'firstName', 'email']);
  if (missing.length) return json({ error: 'Missing required fields', fields: missing }, { status: 422 });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return json({ error: donationAmountError(body.amount) }, { status: 422 });

  const requestedFrequency = normalizeGivingFrequency(body.frequency);
  if (!requestedFrequency) return json({ error: 'Choose a supported gift frequency.' }, { status: 422 });

  const parish = await findCheckoutParish(env, body.parishId);
  if (!parish || parish.status !== 'verified') return json({ error: 'Verified parish not found' }, { status: 404 });
  const giftTypeAliases = { candle: 'candles', funds: 'fund', love: 'commemoration', alms: 'feast' };
  const rawGiftType = String(body.giftType || '')
    .trim()
    .toLowerCase();
  const requestedGiftType = giftTypeAliases[rawGiftType] || rawGiftType;
  const permittedGiftType =
    ['stewardship', 'general'].includes(requestedGiftType) ||
    (requestedGiftType === 'fund' && parish.designatedFundsEnabled) ||
    (requestedGiftType === 'candles' && parish.candlesEnabled) ||
    (parish.givingPlusEnabled && ['commemoration', 'campaign', 'feast'].includes(requestedGiftType));
  if (!permittedGiftType) {
    return json({ error: 'This offering type is available with Give +.' }, { status: 403 });
  }

  const requestedFundKey = String(body.fundId || body.fund || '').trim();
  const requestedFund =
    requestedGiftType === 'fund'
      ? (Array.isArray(parish.funds) ? parish.funds : []).find(
          (fund) =>
            !isGeneralGivingFund(fund) &&
            !isCandleGivingFund(fund) &&
            [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(requestedFundKey)
        )
      : null;
  if (requestedGiftType === 'fund' && !requestedFund) {
    return json({ error: 'Choose the active designated fund offered by this parish.' }, { status: 422 });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      mode: 'demo',
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: 'Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions.',
    });
  }

  if (!parish.stripeAccountId) {
    return json(
      {
        error: 'Parish Stripe account is not connected yet',
        detail: 'This parish needs to complete Stripe onboarding before it can receive donations.',
      },
      { status: 422 }
    );
  }

  const recurring = requestedFrequency !== 'once';
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const normalizedDonorEmail = normalizeEmail(body.email);
  const normalizedGiftType = requestedGiftType;
  const checkoutGiftType = requestedGiftType;
  const commemorationKind =
    checkoutGiftType === 'commemoration' && String(body.commemorationKind || '') === 'molieben_panikhida'
      ? 'molieben_panikhida'
      : 'proskomedia_liturgy';
  const isFestalAlms = ['alms', 'feast'].includes(normalizedGiftType);
  const isGeneralStewardship = ['stewardship', 'general'].includes(checkoutGiftType);
  const requestedCampaignId = String(body.campaignId || body.campaign || '').trim();
  const checkoutFeastCampaigns = isFestalAlms
    ? activeFestalAlmsCampaigns(parish.feastCampaigns, parish.liturgicalCalendar)
    : [];
  const feastCampaign = isFestalAlms
    ? checkoutFeastCampaigns.find((campaign) =>
        [campaign?.id, campaign?.feastId, campaign?.name, campaign?.campaignName]
          .filter(Boolean)
          .map(String)
          .includes(requestedCampaignId)
      )
    : null;
  const destinationFundId = String(feastCampaign?.destinationFundId || 'benevolence-fund');
  const destinationFund = isFestalAlms
    ? (Array.isArray(parish.funds) ? parish.funds : []).find((fund) =>
        [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(destinationFundId)
      )
    : null;
  const candleFund =
    requestedGiftType === 'candles' ? (Array.isArray(parish.funds) ? parish.funds : []).find(isCandleGivingFund) : null;
  const checkoutFund = isFestalAlms
    ? destinationFund?.name || 'Benevolence Fund'
    : isGeneralStewardship
      ? 'General Operating Fund'
      : requestedGiftType === 'candles'
        ? candleFund?.name || 'Candles / Vigil Lights'
        : requestedFund?.name || '';
  const checkoutFundId = isFestalAlms
    ? destinationFund?.id || destinationFund?.code || 'benevolence-fund'
    : isGeneralStewardship
      ? 'general'
      : requestedGiftType === 'candles'
        ? candleFund?.id || candleFund?.code || 'candle'
        : requestedFund?.id || requestedFund?.code || '';
  const checkoutCampaign = isFestalAlms
    ? feastCampaign?.campaignName || feastCampaign?.name || body.campaign || ''
    : body.campaign || '';
  const checkoutCampaignId = isFestalAlms
    ? feastCampaign?.id || feastCampaign?.feastId || requestedCampaignId
    : body.campaignId || body.campaign || '';
  const donor = await requireDonor(request, env);
  const donorDashboardReturn = Boolean(donor?.email && normalizeEmail(donor.email) === normalizedDonorEmail);
  const { successUrl, cancelUrl } = givingCheckoutReturnUrls({
    appUrl,
    parishId: parish.id,
    source: body.source,
    returnPath: body.returnPath,
    donorDashboardReturn,
    campaign: body.campaign,
  });
  const { chargeCents, estimatedStripeFeeCents, agapayFeeCents, totalTransactionFeeCents, paymentMethod } =
    checkoutFinancials(amountCents, Boolean(body.coverFees), recurring, body.paymentMethod);
  const giftLabel = checkoutGiftType.replace(/-/g, ' ');
  const normalizedDonorName = donorName(body);
  const customer = await findOrCreateDonorCustomer(env, parish, body);
  if (!customer.ok) {
    return json(
      { error: 'Stripe customer setup failed', detail: customer.body.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  const checkoutMetadata = {
    public_anonymous: publicBoolean(body.publicAnonymous) ? 'true' : 'false',
    public_display_name: publicBoolean(body.publicAnonymous) ? 'Anonymous' : normalizedDonorName,
    public_comment: publicComment(body.publicComment),
    agapay_payment_class: 'qualifying_donation',
    agapay_classification_version: '1',
    parish_id: parish.id,
    parish_name: parish.name || '',
    stripe_customer_id: customer.body.id || '',
    donor_email: normalizedDonorEmail,
    donor_name: normalizedDonorName,
    donor_first_name: body.firstName || '',
    donor_last_name: body.lastName || '',
    gift_type: checkoutGiftType,
    commemoration_kind: checkoutGiftType === 'commemoration' ? commemorationKind : '',
    fund: checkoutFund,
    fund_id: checkoutFundId,
    feast_description: body.feastDescription || '',
    in_memoriam: body.inMemoriam || '',
    campaign: checkoutCampaign,
    campaign_id: checkoutCampaignId,
    campaign_description: body.campaignDescription || '',
    frequency: requestedFrequency,
    amount_cents: String(amountCents),
    charge_cents: String(chargeCents),
    agapay_fee_cents: String(agapayFeeCents),
    estimated_stripe_fee_cents: String(estimatedStripeFeeCents),
    total_fee_cents: String(totalTransactionFeeCents),
    payment_method: paymentMethod,
    cover_fees: body.coverFees ? 'true' : 'false',
    names_living: body.namesLiving || '',
    names_departed: body.namesDeparted || '',
  };

  const form = new URLSearchParams({
    mode: recurring ? 'subscription' : 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customer.body.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `${parish.name} - ${giftLabel}`,
    'line_items[0][price_data][unit_amount]': String(chargeCents),
  });

  form.set('payment_method_types[0]', paymentMethod === 'ach' ? 'us_bank_account' : 'card');

  for (const [key, value] of Object.entries(checkoutMetadata)) {
    form.set(`metadata[${key}]`, value);
    if (recurring) {
      form.set(`subscription_data[metadata][${key}]`, value);
    } else {
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }
  }

  // AGAPAY does not collect an application fee on donations -- AGAPAY's
  // revenue is the parish subscription plan, not a percentage of gifts.
  // Donations flow to the parish's connected Stripe account with only
  // Stripe's own processing cost deducted (see checkoutFinancials above).

  if (recurring) {
    const recurringSchedule = stripeRecurringSchedule(requestedFrequency);
    form.set('line_items[0][price_data][recurring][interval]', recurringSchedule.interval);
    if (recurringSchedule.count > 1) {
      form.set('line_items[0][price_data][recurring][interval_count]', String(recurringSchedule.count));
    }
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (parish.stripeAccountId) headers['Stripe-Account'] = parish.stripeAccountId;

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers,
    body: form,
  });
  const stripeBody = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return json(
      { error: 'Stripe checkout session failed', detail: stripeBody.error?.message || 'Unknown Stripe error' },
      { status: 502 }
    );
  }

  await storeDonorOffering(env, {
    id: stripeBody.id,
    donorEmail: normalizedDonorEmail,
    donorName: normalizedDonorName,
    parishId: parish.id,
    parishName: parish.name,
    giftType: checkoutGiftType,
    title: `${parish.name} - ${giftLabel}`,
    fund: checkoutFund,
    fundId: checkoutFundId,
    campaign: checkoutCampaign,
    campaignId: checkoutCampaignId,
    campaignDescription: body.campaignDescription || '',
    publicAnonymous: publicBoolean(body.publicAnonymous),
    publicDisplayName: publicBoolean(body.publicAnonymous) ? 'Anonymous' : normalizedDonorName,
    publicComment: publicComment(body.publicComment),
    feastDescription: body.feastDescription || '',
    inMemoriam: body.inMemoriam || '',
    frequency: requestedFrequency,
    amountCents,
    chargeCents,
    agapayFeeCents,
    estimatedStripeFeeCents,
    paymentMethod,
    coverFees: Boolean(body.coverFees),
    status: 'checkout_created',
    paymentStatus: 'pending',
    checkoutSessionId: stripeBody.id,
    checkoutUrl: stripeBody.url || '',
    stripeCustomerId: customer.body.id || '',
    namesLiving: body.namesLiving || '',
    namesDeparted: body.namesDeparted || '',
    commemorationKind: checkoutGiftType === 'commemoration' ? commemorationKind : '',
  });

  return json({ id: stripeBody.id, url: stripeBody.url }, { status: 201 });
}

export async function handleCheckoutSessionStatus(request, env) {
  const limited = await rateLimit(request, env, 'checkout-status', { limit: 30, windowSeconds: 300 });
  if (limited) return limited;

  const url = new URL(request.url);
  let sessionId = url.searchParams.get('session_id') || '';
  if (!sessionId && request.method === 'POST') {
    try {
      const body = await request.json();
      sessionId = body.sessionId || body.session_id || '';
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  sessionId = String(sessionId || '').trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return json({ error: 'Missing checkout session id' }, { status: 422 });
  }

  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) {
    return json({ error: 'Checkout session is not tracked by AGAPAY' }, { status: 404 });
  }

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: 'Parish Stripe account is not connected yet' }, { status: 422 });
  }

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) {
    return json(
      {
        error: 'Unable to verify checkout session',
        detail: stripe.body.error?.message || 'Stripe rejected the lookup',
      },
      { status: 502 }
    );
  }

  const session = stripe.body || {};
  const paymentIntentId = checkoutPaymentIntentId(session);
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || 'checkout_created';
  if (paymentStatus === 'paid') status = 'completed';
  if (session.status === 'expired') status = 'expired';
  const feeUpdates =
    status === 'completed' || paymentStatus === 'paid'
      ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
      : {};

  const updated = await updateDonorOfferingByCheckout(env, sessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || '',
    stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || '',
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || '',
    completedAt: status === 'completed' ? offering.completedAt || new Date().toISOString() : offering.completedAt || '',
    ...feeUpdates,
  });
  if (status === 'completed' || paymentStatus === 'paid') {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created
        ? new Date(session.created * 1000).toISOString()
        : offering.createdAt || new Date().toISOString(),
    });
    await sendDonationReceiptIfNeeded(env, updated || {});
  }

  return json({
    ok: true,
    checkoutSessionId: sessionId,
    status: updated?.status || status,
    paymentStatus: updated?.paymentStatus || paymentStatus,
    paymentIntentId: updated?.stripePaymentIntentId || paymentIntentId || '',
  });
}

export async function handleParishStripeRefresh(request, env, parishId) {
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

export async function handleDashboardInvite(request, env, reference) {
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
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString(),
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
      email.status === 'sent' ? new Date().toISOString() : withToken.dashboardInviteEmailSentAt,
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

export async function handleParishStripeOnboarding(request, env, parishId) {
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

export async function handleParishSubscriptionCheckout(request, env, parishId) {
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

export async function handleParishDemoTier(request, env, parishId) {
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
    demoTierChangedAt: new Date().toISOString(),
    parishUpdatedAt: new Date().toISOString(),
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

export async function handleParishSubscriptionRefresh(request, env, parishId) {
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
  const now = new Date().toISOString();
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
        registration.subscriptionTrialEndsAt || new Date(Date.now() + trialDays * 86400000).toISOString();
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

export async function handleParishSubscriptionPortal(request, env, parishId) {
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
