// src/handlers/parish-dashboard-handler.js
// Parish dashboard presentation, settings updates, and feature-request actions.

import {
  applyParishDashboardPassword,
  getBearerToken,
  hasProductionStore,
  issueParishDashboardSession,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { classifyStripeCharge } from '../lib/stripe-volume.js';
import { estimateStripeAchFeeCents, estimateStripeProcessingFeeCents } from '../lib/stripe-fees.js';
import { numericCents, stripeReady } from '../lib/stripe-connect.js';
import { monthLabel, publicSubscriptionTiers, subscriptionReady } from '../lib/parish-notifications.js';
import {
  normalizeParishHouseholdBand,
  parishIntroDemoEligible,
  publicSubscriptionAddOns,
  subscriptionAddOnPricing,
  subscriptionAddOnsFor,
  subscriptionTier as sharedSubscriptionTier,
} from '../lib/subscriptions.js';
import {
  accountingEnabledFor,
  bookstoreEnabledFor,
  communicationsEnabledFor,
  directoryEnabledFor,
  entitlementsSummary,
  eventsEnabledFor,
  exchangeEnabledFor,
  givingFeatureAccess,
  hasModuleAccess,
  mealsEnabledFor,
  prayerRequestsEnabledFor,
  signupsEnabledFor,
  stewardshipToolAccess,
} from '../lib/entitlements.js';
import { loadParishPricingUsage } from '../lib/parish-pricing-usage.js';
import { submitParishSupportTicket } from '../lib/parish-support-tickets.js';
import { dismissParishFeatureRequest, loadPendingParishFeatureRequests } from '../lib/parish-feature-requests.js';
import {
  loadGivingCatalogFromAccounting,
  synchronizeGivingCatalogWithAccounting,
} from '../accounting/source-wiring.js';
import { accountingCatalogRequiredForParish } from '../lib/accounting-availability.js';
import { parishLifeAvailableFor } from '../lib/parish-life-access.js';
import { getDirectorySettings } from '../directory/settings.js';
import { fetchKoinoniaCalendarIcs, normalizeKoinoniaCalendarUrl } from '../lib/koinonia-calendar.js';
import {
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  onboardingWorkflowEnabled,
  recommendedOnboardingState,
  recordParishGivingSetupReview,
} from '../lib/parish-onboarding.js';
import { enrichParishGivingOptions } from './parish-giving-catalog.js';
import {
  defaultSubscriptionTier,
  findRegistrationByParishId,
  saveRegistrationRecord,
  starterFundCatalogError,
  verifyParishDashboardBearer,
} from './parish.js';

export function summarizeCharges(charges) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0,
  }));
  const givers = new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = '';

  for (const charge of charges) {
    if (charge.status !== 'succeeded' || charge.paid === false) continue;
    if (classifyStripeCharge(charge).paymentClass !== 'qualifying_donation') continue;

    const created = new Date((charge.created || 0) * 1000);
    if (created.getUTCFullYear() !== year) continue;

    const chargeCents = numericCents(charge.amount_captured || charge.amount);
    const refundedCents = numericCents(charge.amount_refunded);
    const metadataGiftCents = numericCents(charge.metadata?.amount_cents);
    const coverFees = String(charge.metadata?.cover_fees || '').toLowerCase() === 'true';
    const paymentMethod = charge.metadata?.payment_method || '';
    const balanceTransaction = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    const agapayFeeCents = numericCents(charge.application_fee_amount || charge.metadata?.agapay_fee_cents);
    const balanceFeeCents = balanceTransaction ? numericCents(balanceTransaction.fee) : 0;
    const stripeFeeCents = balanceTransaction
      ? Math.max(0, balanceFeeCents - agapayFeeCents)
      : paymentMethod === 'ach'
        ? estimateStripeAchFeeCents(chargeCents)
        : estimateStripeProcessingFeeCents(chargeCents);
    const totalFeeCents = Math.max(0, stripeFeeCents + agapayFeeCents);
    const giftCents = metadataGiftCents || Math.max(0, chargeCents - (coverFees ? totalFeeCents : 0));
    const netCents = balanceTransaction
      ? Math.max(0, numericCents(balanceTransaction.net) - refundedCents)
      : Math.max(0, chargeCents - refundedCents - totalFeeCents);
    if (!netCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += giftCents;
    if (coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += Math.max(0, chargeCents - giftCents);
    } else {
      feesAbsorbedCents += totalFeeCents;
    }
    giftCount += 1;

    const giverKey =
      charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    if (!lastGiftAt || created.toISOString() > lastGiftAt) lastGiftAt = created.toISOString();
  }

  return {
    year,
    currency: 'usd',
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly,
  };
}

export function parishDashboardPayload(parishId, registration) {
  const currentTier = sharedSubscriptionTier(registration);
  const givingPlus = givingFeatureAccess(registration, 'branding');
  const currentAddOns = subscriptionAddOnsFor(registration);
  const entitlements = entitlementsSummary(registration);
  const currentAddOnMonthlyCents = currentAddOns.reduce(
    (sum, id) => sum + Number(subscriptionAddOnPricing(id, registration.subscriptionPricingProgram)?.monthlyCents || 0),
    0
  );
  return {
    parishId,
    parishName: registration.parishName,
    logoUrl: givingPlus ? registration.logoUrl || '' : '',
    communityType: registration.communityType,
    jurisdiction: registration.jurisdiction,
    sacramentsEnabled: Boolean(registration.sacramentsEnabled),
    addressLine1: registration.addressLine1 || '',
    addressLine2: registration.addressLine2 || '',
    city: registration.city,
    state: registration.state,
    postalCode: registration.postalCode || '',
    country: registration.country || 'US',
    website: registration.website,
    taxLegalName: registration.taxLegalName || '',
    taxEin: registration.taxEin || '',
    timezone: registration.timezone || '',
    liturgicalCalendar: registration.liturgicalCalendar || 'julian',
    koinoniaCalendarUrl: registration.koinoniaCalendarUrl || '',
    patronalFeast: registration.patronalFeast || '',
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || '',
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || '',
    givingStatus: registration.givingStatus || 'active',
    stripeAccountId: registration.stripeAccountId || '',
    stripeAccountStatus: registration.stripeAccountStatus || 'not_started',
    stripeChargesEnabled: Boolean(registration.stripeChargesEnabled),
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionTierLabel: currentTier?.label || registration.subscriptionTierLabel || '',
    parishHouseholdBand: normalizeParishHouseholdBand(registration.parishHouseholdBand),
    subscriptionPricingProgram: registration.subscriptionPricingProgram || '',
    subscriptionStatus: registration.subscriptionStatus || 'not_started',
    stripeCustomerId: registration.stripeCustomerId || '',
    stripeSubscriptionId: registration.stripeSubscriptionId || '',
    // Display the current published tier price. Stored amounts describe an
    // earlier checkout and must not leave the dashboard advertising a stale
    // plan price after the catalog changes.
    subscriptionMonthlyCents:
      currentTier?.monthlyCents === null ? null : Number(currentTier?.monthlyCents || 0) + currentAddOnMonthlyCents,
    subscriptionAddOns: currentAddOns,
    subscriptionTrialDays: Number(registration.subscriptionTrialDays || 0),
    subscriptionTrialStartedAt: registration.subscriptionTrialStartedAt || '',
    subscriptionTrialEndsAt: registration.subscriptionTrialEndsAt || '',
    subscriptionIntroDemoEligible: parishIntroDemoEligible(registration),
    parishDashboardTokenTemporary: Boolean(registration.parishDashboardTokenTemporary),
    priestEmail: registration.priestEmail || '',
    sacramentPriests: normalizeSacramentPriests(registration),
    treasurerEmail: registration.treasurerEmail || '',
    setup: {
      contactInfoVerified: true,
      stripeConnected: stripeReady(registration),
      billingActive: subscriptionReady(registration),
      temporaryPassword: Boolean(registration.parishDashboardTokenTemporary),
    },
    subscriptionTiers: publicSubscriptionTiers(),
    subscriptionAddOnCatalog: publicSubscriptionAddOns(),
    platformFee: registration.platformFee || '',
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    candlesEnabled: registration.candlesEnabled ?? true,
    commemorationsEnabled: registration.commemorationsEnabled ?? true,
    bookstoreEnabled: bookstoreEnabledFor(registration),
    eventsEnabled: eventsEnabledFor(registration),
    mealsEnabled: mealsEnabledFor(registration),
    communicationsEnabled: communicationsEnabledFor(registration),
    signupsEnabled: signupsEnabledFor(registration),
    exchangeEnabled: exchangeEnabledFor(registration),
    prayerRequestsEnabled: prayerRequestsEnabledFor(registration),
    stewardshipActive: stewardshipToolAccess(registration),
    parishPlusIncludedInTier: entitlements.parishPlusIncludedInTier,
    entitlements,
    accountingAvailable: accountingEnabledFor(registration),
    funds: Array.isArray(registration.funds) ? registration.funds : [],
    campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : [],
  };
}

async function parishDashboardPayloadWithPricingUsage(env, parishId, registration) {
  return {
    ...parishDashboardPayload(parishId, registration),
    parishPricingUsage: await loadParishPricingUsage(env, parishId, registration),
  };
}

export function normalizeSacramentPriests(registration = {}) {
  const saved = Array.isArray(registration.sacramentPriests) ? registration.sacramentPriests : [];
  const rows = saved
    .map((priest) => ({
      name: String(priest?.name || '')
        .trim()
        .slice(0, 120),
      email: String(priest?.email || '')
        .trim()
        .slice(0, 180),
      serviceTypes: sanitizeSacramentServiceTypes(priest?.serviceTypes),
      customServices: sanitizeCustomSacramentServices(priest?.customServices),
    }))
    .filter((priest) => priest.name);
  if (rows.length) return rows.slice(0, 12);
  const fallbackName =
    [registration.priestFirst, registration.priestLast].filter(Boolean).join(' ').trim() || 'Parish priest';
  return [
    {
      name: fallbackName,
      email: registration.priestEmail || '',
      serviceTypes: defaultSacramentServiceTypes(),
      customServices: [],
    },
  ];
}

const DEFAULT_SACRAMENT_SERVICE_TYPES = ['house_blessing', 'confession', 'counseling', 'baptism', 'wedding'];
const EDITABLE_SACRAMENT_SERVICE_TYPES = new Set([
  ...DEFAULT_SACRAMENT_SERVICE_TYPES,
  'home_visit',
  'office_visit',
  'anointing',
]);

function defaultSacramentServiceTypes() {
  return [...DEFAULT_SACRAMENT_SERVICE_TYPES];
}

function sanitizeSacramentServiceTypes(value) {
  if (!Array.isArray(value)) return defaultSacramentServiceTypes();
  return [
    ...new Set(
      value.map((type) => String(type || '').trim()).filter((type) => EDITABLE_SACRAMENT_SERVICE_TYPES.has(type))
    ),
  ];
}

function sanitizeCustomSacramentServices(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((service) => ({
      id: String(service?.id || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 80),
      label: String(service?.label || '')
        .trim()
        .slice(0, 120),
      mode: service?.mode === 'schedule' ? 'schedule' : 'request',
    }))
    .filter((service) => service.id && service.label)
    .slice(0, 20);
}

function sanitizeSacramentPriests(value, current) {
  if (!Array.isArray(value)) return normalizeSacramentPriests(current);
  const rows = value
    .map((priest) => ({
      name: String(priest?.name || '')
        .trim()
        .slice(0, 120),
      email: String(priest?.email || '')
        .trim()
        .slice(0, 180),
      serviceTypes: sanitizeSacramentServiceTypes(priest?.serviceTypes),
      customServices: sanitizeCustomSacramentServices(priest?.customServices),
    }))
    .filter((priest) => priest.name);
  return rows.slice(0, 12);
}

const GIVING_CATALOG_COMPUTED_FIELDS = new Set(['giftCount', 'raisedCents', 'supporters', 'visibility']);

function comparableGivingCatalogValue(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => comparableGivingCatalogValue(item));
  if (!value || typeof value !== 'object') return value;
  const comparable = {};
  Object.keys(value)
    .sort()
    .forEach((field) => {
      if (GIVING_CATALOG_COMPUTED_FIELDS.has(field)) return;
      const fieldValue = value[field];
      if (field === 'goalCents' && Number(fieldValue || 0) === 0) return;
      if (field === 'coverPhotoUrl' && !String(fieldValue || '').trim()) return;
      comparable[field] = comparableGivingCatalogValue(fieldValue, field);
    });
  return comparable;
}

export function givingCatalogChanged(next = {}, current = {}) {
  return ['funds', 'campaigns', 'feastCampaigns'].some(
    (field) =>
      JSON.stringify(comparableGivingCatalogValue(next[field] || [], field)) !==
      JSON.stringify(comparableGivingCatalogValue(current[field] || [], field))
  );
}

export async function handleParishDashboard(request, env, parishId) {
  const limited = await rateLimit(
    request,
    env,
    ['PATCH', 'POST'].includes(request.method) ? 'parish-dashboard-write' : 'parish-auth',
    { limit: ['PATCH', 'POST'].includes(request.method) ? 20 : 40, windowSeconds: 300 }
  );
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Support request was invalid.' }, { status: 400 });
    const result = await submitParishSupportTicket(env, request, { ...found.registration, parishId }, body);
    return json(result, { status: result.ok ? 201 : result.status || 500 });
  }

  if (request.method === 'GET') {
    const { registration } = found;
    const [catalog, directorySettings, pendingFeatureRequests] = await Promise.all([
      loadGivingCatalogFromAccounting(env, parishId, registration),
      getDirectorySettings(env, parishId),
      loadPendingParishFeatureRequests(env, parishId),
    ]);
    const featureRequests = pendingFeatureRequests.filter(
      (item) =>
        item.featureId === 'ministry-service' ||
        (item.featureId === 'pledge-tracker' && !stewardshipToolAccess(registration)) ||
        (item.featureId === 'giving-plus' && !givingFeatureAccess(registration, 'campaigns'))
    );
    const dashboardParish = await enrichParishGivingOptions(env, {
      ...(await parishDashboardPayloadWithPricingUsage(env, parishId, registration)),
      id: parishId,
      parishLifeAvailable: parishLifeAvailableFor(env),
      directoryEnabled: directoryEnabledFor(registration, directorySettings),
    });
    dashboardParish.onboarding = await buildParishOnboardingWorkflow(registration, {
      appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    });
    // The parish-managed Funds & Alms record is authoritative; Accounting consumes it on save and never overwrites this editor.
    return json({ parish: dashboardParish, accountingCatalogConnected: catalog.available, featureRequests });
  }

  if (request.method === 'PATCH') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const current = found.registration;
    if (onboardingWorkflowEnabled(current) && current.onboardingState !== 'LIVE' && body.givingStatus === 'active') {
      return json(
        {
          error: 'Treasurer Go-Live signoff is required before the giving page can be activated.',
        },
        { status: 409 }
      );
    }
    const givingPlus = givingFeatureAccess(current, 'campaigns');
    const starterDesignatedFund = givingFeatureAccess(current, 'starterDesignatedFund');
    if (!starterDesignatedFund && body.funds !== undefined) {
      return json({ error: 'Designated funds are not available on this plan.' }, { status: 403 });
    }
    if (!givingPlus && (body.campaigns !== undefined || body.feastCampaigns !== undefined)) {
      return json({ error: 'Campaigns and festal alms are available with Give +.' }, { status: 403 });
    }
    if (!givingPlus && body.funds !== undefined) {
      const limitError = starterFundCatalogError(body.funds);
      if (limitError) return json({ error: limitError }, { status: 422 });
    }
    const requestedPassword =
      body.newDashboardPassword !== undefined ? String(body.newDashboardPassword || '').trim() : '';
    if (requestedPassword && requestedPassword.length < 8) {
      return json({ error: 'Dashboard password must be at least 8 characters.' }, { status: 400 });
    }

    const catalogFieldsSubmitted =
      body.funds !== undefined || body.campaigns !== undefined || body.feastCampaigns !== undefined;
    const submittedCatalog = {
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
    };
    const catalogChanged =
      catalogFieldsSubmitted &&
      (body.givingCatalogChanged === true ||
        (body.givingCatalogChanged === undefined && givingCatalogChanged(submittedCatalog, current)));
    let normalizedKoinoniaCalendarUrl = current.koinoniaCalendarUrl || '';
    if (body.koinoniaCalendarUrl !== undefined) {
      const value = String(body.koinoniaCalendarUrl || '').trim();
      if (!value) {
        normalizedKoinoniaCalendarUrl = '';
      } else {
        try {
          normalizedKoinoniaCalendarUrl = normalizeKoinoniaCalendarUrl(value).slice(0, 2000);
          await fetchKoinoniaCalendarIcs(normalizedKoinoniaCalendarUrl);
        } catch (error) {
          const message = /public HTTPS|valid/.test(String(error?.message || ''))
            ? 'Paste a valid public HTTPS calendar link. Google Calendar share links and iCal/ICS feeds are supported.'
            : 'We could not read a public ICS calendar from that link. Make sure the calendar is public, then try again.';
          return json({ error: message }, { status: 422 });
        }
      }
    }

    let updated = {
      ...current,
      parishName: String(body.parishName ?? current.parishName ?? '').trim() || current.parishName || '',
      addressLine1: String(body.addressLine1 ?? current.addressLine1 ?? '').trim(),
      addressLine2: String(body.addressLine2 ?? current.addressLine2 ?? '').trim(),
      city: String(body.city ?? current.city ?? '').trim(),
      state: String(body.state ?? current.state ?? '').trim(),
      postalCode: String(body.postalCode ?? current.postalCode ?? '').trim(),
      country: String(body.country ?? current.country ?? 'US').trim() || 'US',
      website: body.website ?? current.website ?? '',
      taxLegalName: String(body.taxLegalName ?? current.taxLegalName ?? '').trim(),
      taxEin: String(body.taxEin ?? current.taxEin ?? '').trim(),
      timezone: (() => {
        const requested = String(body.timezone ?? current.timezone ?? '').trim();
        if (!requested) return current.timezone || '';
        try {
          new Intl.DateTimeFormat(undefined, { timeZone: requested });
          return requested;
        } catch {
          return current.timezone || '';
        }
      })(),
      liturgicalCalendar: body.liturgicalCalendar || current.liturgicalCalendar || 'julian',
      koinoniaCalendarUrl: normalizedKoinoniaCalendarUrl,
      patronalFeast: String(body.patronalFeast ?? current.patronalFeast ?? '').trim(),
      patronalFeastName: String(
        body.patronalFeastName ?? current.patronalFeastName ?? current.parishPatronalFeastName ?? ''
      )
        .trim()
        .slice(0, 160),
      patronalFeastDate: (() => {
        const value = String(
          body.patronalFeastDate ?? current.patronalFeastDate ?? current.parishPatronalFeastDate ?? ''
        ).trim();
        return /^(?:\d{4}-)?\d{2}-\d{2}$/.test(value) ? value.slice(-5) : '';
      })(),
      givingStatus: body.givingStatus || current.givingStatus || 'active',
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      communicationsEnabled: Boolean(body.communicationsEnabled ?? current.communicationsEnabled ?? true),
      signupsEnabled: Boolean(body.signupsEnabled ?? current.signupsEnabled ?? true),
      exchangeEnabled: Boolean(body.exchangeEnabled ?? current.exchangeEnabled ?? true),
      prayerRequestsEnabled: Boolean(body.prayerRequestsEnabled ?? current.prayerRequestsEnabled ?? true),
      sacramentsEnabled:
        Boolean(body.sacramentsEnabled ?? current.sacramentsEnabled ?? false) && hasModuleAccess(current, 'sacraments'),
      sacramentPriests:
        body.sacramentPriests !== undefined
          ? sanitizeSacramentPriests(body.sacramentPriests, current)
          : normalizeSacramentPriests(current),
      bookstoreEnabled: Boolean(body.bookstoreEnabled ?? current.bookstoreEnabled ?? false),
      eventsEnabled: Boolean(body.eventsEnabled ?? current.eventsEnabled ?? true),
      mealsEnabled: Boolean(body.mealsEnabled ?? current.mealsEnabled ?? true),
      funds: catalogChanged ? submittedCatalog.funds : current.funds,
      campaigns: catalogChanged ? submittedCatalog.campaigns : current.campaigns,
      feastCampaigns: catalogChanged ? submittedCatalog.feastCampaigns : current.feastCampaigns,
      parishUpdatedAt: new Date().toISOString(),
    };

    let nextSession = null;
    if (requestedPassword) {
      updated = await applyParishDashboardPassword(updated, requestedPassword, { temporary: false });
      updated = {
        ...updated,
        parishDashboardSessions: [],
      };
      nextSession = await issueParishDashboardSession(updated);
      updated = nextSession.registration;
    }

    const accountingCatalogChanged =
      catalogChanged &&
      (await accountingCatalogRequiredForParish(env, parishId, current)) &&
      (body.accountingCatalogChanged === true ||
        (body.accountingCatalogChanged === undefined &&
          givingCatalogChanged(
            {
              funds: updated.funds,
              campaigns: updated.campaigns,
            },
            {
              funds: current.funds,
              campaigns: current.campaigns,
            }
          )));
    let catalogSync = { available: true, synchronized: 0 };
    if (accountingCatalogChanged) {
      catalogSync = await synchronizeGivingCatalogWithAccounting(env, parishId, updated);
      if (!catalogSync.available) {
        return json(
          {
            error: 'accounting_catalog_unavailable',
            message:
              'Funds & Alms could not be saved because the Accounting catalog is unavailable. Nothing was changed.',
          },
          { status: 503 }
        );
      }
      updated = {
        ...updated,
        funds: catalogSync.funds,
        campaigns: catalogSync.campaigns,
        feastCampaigns: catalogSync.feastCampaigns || [],
      };
    }
    if (onboardingWorkflowEnabled(updated) && body.givingSetupReviewed === true) {
      updated = recordParishGivingSetupReview(
        updated,
        body.importDecision,
        current.treasurerEmail || current.priestEmail || 'Parish dashboard'
      );
    }
    if (onboardingWorkflowEnabled(updated))
      updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks);
    updated = await invalidateOnboardingSignoffIfChanged(current, updated, {
      actor: current.treasurerEmail || current.priestEmail || 'parish',
      reason: 'The parish changed material onboarding configuration.',
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    });
    await saveRegistrationRecord(env, found.key, updated, current);
    const responseParish = await parishDashboardPayloadWithPricingUsage(env, parishId, updated);
    responseParish.onboarding = await buildParishOnboardingWorkflow(updated, {
      appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    });
    return json({
      ok: true,
      parish: responseParish,
      accountingCatalog: catalogSync,
      token: nextSession?.token || '',
      expiresAt: nextSession?.expiresAt || '',
    });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleParishFeatureRequestDismiss(request, env, parishId, featureId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!['pledge-tracker', 'giving-plus', 'ministry-service'].includes(featureId))
    return json({ error: 'Unknown feature request' }, { status: 404 });
  await dismissParishFeatureRequest(env, parishId, featureId);
  return json({ ok: true });
}
