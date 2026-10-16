// Generated from src/handlers/parish-giving-checkout.ts by npm run build:server. Do not edit.
import { subscriptionSetupUpdates } from '../payments/donation-events.js';
import { activeFestalAlmsCampaigns } from '../festal-alms.js';
import '../lib/registration-retries.js';
import {
  givingCheckoutReturnUrls,
  normalizeGivingFrequency,
  stripeRecurringSchedule,
} from '../payments/giving-checkout.js';
import { json, normalizeEmail, rateLimit, verifyTurnstileIfConfigured } from '../lib/core.js';
import '../lib/stewardship-funds.js';
import '../lib/parish-onboarding.js';
import '../lib/tax-exemption.js';
import '../lib/subscription-checkout.js';
import '../lib/subscriptions.js';
import '../lib/parish-pricing-usage.js';
import '../lib/format.js';
import '../lib/registration-intake.js';
import '../lib/tax-readiness.js';
import '../lib/legal-acceptance.js';
import { centsFromAmount, checkoutFinancials, donationAmountError, donorName } from '../lib/stripe-fees.js';
import {
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  stripeGetConnectedRequest,
} from '../lib/stripe-connect.js';
import '../lib/parish-notifications.js';
import { publicBoolean, publicComment } from './parish-giving-catalog.js';
import { ensureCommemorationEntryFromOffering } from './parish-commemorations.js';
import {
  loadDonorOfferingByCheckout,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
} from './parish-donor-offerings.js';
import {
  findCheckoutParish,
  findOrCreateDonorCustomer,
  isCandleGivingFund,
  isGeneralGivingFund,
  requireDonor,
  requireFields,
} from './parish.js';
import { sendDonationReceiptIfNeeded } from './parish-checkout-shared.js';
import './parish-registration-intake.js';
import './parish-checkout.js';
async function handleCheckout(request, env) {
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
  const giftTypeAliases = {
    candle: 'candles',
    funds: 'fund',
    love: 'commemoration',
    alms: 'feast',
  };
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
  if (requestedFrequency !== 'once' && parish.recurringGivingEnabled === false) {
    return json(
      { error: 'This parish is currently accepting one-time gifts only. Choose a one-time gift.' },
      { status: 422 }
    );
  }
  if (requestedGiftType === 'commemoration' && parish.commemorationsEnabled === false) {
    return json(
      { error: 'Commemoration offerings are currently unavailable. Choose another offering.' },
      { status: 422 }
    );
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
    ? checkoutFeastCampaigns.find((campaign2) =>
        [campaign2?.id, campaign2?.feastId, campaign2?.name, campaign2?.campaignName]
          .filter(Boolean)
          .map(String)
          .includes(requestedCampaignId)
      )
    : null;
  const campaign =
    requestedGiftType === 'campaign'
      ? (parish.campaigns || []).find(
          (item) =>
            [item.id, item.slug, item.name, item.campaignName, item.title]
              .filter(Boolean)
              .map(String)
              .includes(requestedCampaignId) &&
            item.active !== false &&
            item.enabled !== false &&
            item.hidden !== true &&
            ['active', 'published', 'open'].includes(String(item.status || 'active').toLowerCase())
        )
      : null;
  if ((isFestalAlms && !feastCampaign) || (requestedGiftType === 'campaign' && !campaign)) {
    return json(
      { error: 'This campaign is no longer accepting gifts. Refresh the parish page and choose an active campaign.' },
      { status: 422 }
    );
  }
  const destinationFundId = String(feastCampaign?.destinationFundId || 'benevolence-fund');
  const destinationFund = isFestalAlms
    ? (Array.isArray(parish.funds) ? parish.funds : []).find((fund) =>
        [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(destinationFundId)
      )
    : null;
  if (isFestalAlms && !destinationFund) {
    return json(
      { error: 'This campaign’s designated fund is unavailable. Choose another offering or contact the parish.' },
      { status: 422 }
    );
  }
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
    : campaign?.name || campaign?.campaignName || campaign?.title || '';
  const checkoutCampaignId = isFestalAlms
    ? feastCampaign?.id || feastCampaign?.feastId || requestedCampaignId
    : campaign?.id || campaign?.slug || '';
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
    recordType: recurring ? 'subscription_setup' : 'payment',
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
async function handleCheckoutSessionStatus(request, env) {
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
  const setup = subscriptionSetupUpdates(session, offering);
  if (setup) {
    await updateDonorOfferingByCheckout(env, sessionId, setup);
    return json({
      ok: true,
      checkoutSessionId: sessionId,
      status: session.payment_status === 'paid' ? 'completed' : 'pending',
      paymentStatus: session.payment_status || 'pending',
      paymentIntentId: '',
    });
  }
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
    completedAt:
      status === 'completed'
        ? offering.completedAt || /* @__PURE__ */ new Date().toISOString()
        : offering.completedAt || '',
    ...feeUpdates,
  });
  if (status === 'completed' || paymentStatus === 'paid') {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created
        ? new Date(session.created * 1e3).toISOString()
        : offering.createdAt || /* @__PURE__ */ new Date().toISOString(),
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
export { handleCheckout, handleCheckoutSessionStatus };
