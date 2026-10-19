import type { CatalogRegistration, ParishRegistration, ParishFund } from './parish-composition-contracts.js';

// src/handlers/parish.js
// Parish handlers and shared helpers (Stripe, donor, admin extracted to own files).

import '../portability/closure.js';

import './parish-commemorations.js';

import {
  d1All,
  d1Batch,
  d1First,
  d1Run,
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeAdminActor,
  rateLimit,
  resolveParishDashboardSession,
  unauthorized,
} from '../lib/core.js';

import '../lib/mfa.js';

import { mergeStewardshipFundsIntoRegistration } from '../lib/stewardship-funds.js';

import {
  donorSummaryFromOfferings,
  loadDonorCommemorations,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  paidCommemorationOfferingWithNames,
  paidOfferingStatus,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  refreshDonorOfferingFromStripeCheckout,
  repairMissingDonorCommemorationsFromOfferings,
  storeDonorOffering,
  stripeObjectMetadata,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
  updateDonorOfferingByPaymentIntent,
} from './parish-donor-offerings.js';

import {
  giftDisplayName,
  loadParishPaidOfferings,
  loadParishRecurringOfferings,
  paidOffering,
  publicParishGiftFromOffering,
  recurringExpectedDays,
  recurringHealthGroupKey,
  recurringOfferingStatus,
  summarizeParishRecurringHealth,
} from './parish-giving-read-models.js';

import {
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
} from './parish-checkout.js';

import {
  givingCatalogChanged,
  handleParishDashboard,
  handleParishFeatureRequestDismiss,
  normalizeSacramentPriests,
  parishDashboardPayload,
  summarizeCharges,
} from './parish-dashboard-handler.js';

import {
  bookstoreEnabledFor,
  givingFeatureAccess,
  hasParishPlusAccess,
  sacramentsEnabledFor,
} from '../lib/entitlements.js';

import {
  defaultSubscriptionTier as sharedDefaultSubscriptionTier,
  subscriptionTier as sharedSubscriptionTier,
} from '../lib/subscriptions.js';

import { parishSlug } from '../lib/format.js';

import { recordAuditEvent } from '../lib/audit-log.js';

import { registrationRequiresJurisdiction } from '../lib/registration-intake.js';

import { publicPaymentFeeSchedules } from '../lib/payment-fees.js';

import '../lib/parish-pricing-usage.js';

import { donorName } from '../lib/stripe-fees.js';

import { stripeFormConnectedRequest, stripeGetConnectedRequest, stripeGetRequest } from '../lib/stripe-connect.js';

import '../lib/parish-notifications.js';
import { BOOKSTORE_CATEGORIES } from './parish-shared.js';
import { isCommunitySketchImage } from './parish-shared.js';
import './parish-authentication.js';
import './parish-registration-storage.js';

export {
  donorSummaryFromOfferings,
  loadDonorCommemorations,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  paidCommemorationOfferingWithNames,
  paidOfferingStatus,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  refreshDonorOfferingFromStripeCheckout,
  repairMissingDonorCommemorationsFromOfferings,
  storeDonorOffering,
  stripeObjectMetadata,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
  updateDonorOfferingByPaymentIntent,
};

export {
  giftDisplayName,
  loadParishPaidOfferings,
  loadParishRecurringOfferings,
  paidOffering,
  publicParishGiftFromOffering,
  recurringExpectedDays,
  recurringHealthGroupKey,
  recurringOfferingStatus,
  summarizeParishRecurringHealth,
};

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

export {
  givingCatalogChanged,
  handleParishDashboard,
  handleParishFeatureRequestDismiss,
  normalizeSacramentPriests,
  parishDashboardPayload,
  summarizeCharges,
};

export {
  d1All,
  d1Batch,
  d1First,
  d1Run,
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
};

export { bookstoreEnabledFor, givingFeatureAccess, hasParishPlusAccess, recordAuditEvent, sacramentsEnabledFor };

export { registrationRequiresJurisdiction };
export {
  migrateDonorEmailReferences,
  requireDonor,
  requireAdminContext,
  requireAdmin,
  handleParishSession,
  handleParishPasswordResetRequest,
  handleParishPasswordResetConfirm,
} from './parish-authentication.js';
export {
  saveRegistrationRecord,
  loadIndexedRegistration,
  loadRegistrationByReference,
  loadVerifiedRegistrationParishPage,
  verifiedRegistrationParishes,
  findRegistrationByParishId,
  findRegistrationByStripeSubscriptionId,
  findRegistrationByStripeAccountId,
  findCheckoutParish,
} from './parish-registration-storage.js';

export function centsFromBody(value: unknown, fallback: number = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

export function normalizeBookstoreBody(
  body: Record<string, unknown> = {}
): import('./bookstore-operation-contracts.js').BookstoreNormalizedBody {
  const category = BOOKSTORE_CATEGORIES.has(String(body.category || body.itemCategory || '').trim())
    ? String(body.category || body.itemCategory).trim()
    : 'other';
  const name = String(body.name || '')
    .trim()
    .slice(0, 160);
  const description = String(body.description || '')
    .trim()
    .slice(0, 1200);
  const sku = String(body.sku || '')
    .trim()
    .slice(0, 80);
  const imageUrl = String(body.imageUrl || body.image_url || '')
    .trim()
    .slice(0, 800);
  return {
    name,
    description,
    category,
    sku,
    imageUrl,
    priceCents: centsFromBody(body.priceCents, 0),
    stockQuantity: centsFromBody(body.stockQuantity, 0),
    costBasisCents: centsFromBody(body.costBasisCents, 0),
    reorderThreshold: centsFromBody(body.reorderThreshold, 0),
  };
}

export async function verifyParishDashboardBearer(
  registration: import('../organizations/types.js').RegistrationRecord | null | undefined,
  token: string
) {
  return Boolean(await resolveParishDashboardSession(registration, token));
}

export function requireFields(body: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

export function appendAdminAudit<T extends CatalogRegistration>(
  registration: T,
  action: unknown,
  actor: unknown,
  details: Record<string, unknown> = {}
) {
  const current = Array.isArray((registration as ParishRegistration)?.adminAuditLog)
    ? (registration as ParishRegistration).adminAuditLog!
    : [];
  const entry = {
    id: generateSecret('audit'),
    action: String(action || 'unknown'),
    actor: normalizeAdminActor(actor || 'Admin'),
    at: new Date().toISOString(),
    details: details && typeof details === 'object' ? details : {},
  };
  return {
    ...registration,
    adminAuditLog: [...current, entry].slice(-300),
  };
}

export function statusTimelineWithNext(
  currentStatus: string,
  nextStatus: string,
  existingTimeline: Record<string, unknown>[] | undefined
) {
  const timeline = Array.isArray(existingTimeline) ? [...existingTimeline] : [];
  const normalizedNext = String(nextStatus || currentStatus || '');
  if (!normalizedNext) return timeline;
  const latest = timeline[timeline.length - 1];
  if (latest?.status === normalizedNext) return timeline;
  timeline.push({
    status: normalizedNext,
    at: new Date().toISOString(),
  });
  return timeline;
}

export function subscriptionTier(id: unknown) {
  return sharedSubscriptionTier(id as string);
}

export function defaultSubscriptionTier(registration: CatalogRegistration) {
  return sharedDefaultSubscriptionTier(registration);
}

export function subscriptionStatusLabel(status: unknown) {
  const labels: Record<string, string> = {
    not_started: 'Not started',
    checkout_created: 'Checkout created',
    trial_checkout_created: 'Demo checkout created',
    trialing: 'Free demo',
    active: 'Active',
    past_due: 'Past due',
    cancelled: 'Cancelled',
    free_forever: 'Free forever',
  };
  return labels[status as string] || status || 'Not started';
}

export function subscriptionTierSummary(tier: ReturnType<typeof subscriptionTier>) {
  if (!tier) return '';
  if (tier.monthlyCents === null)
    return `${tier.label} - custom / negotiated subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  if (tier.monthlyCents === 0)
    return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  return `${tier.label} - $${(tier.monthlyCents! / 100).toFixed(0)}/mo; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
}

export function absoluteWebsiteUrl(value: unknown) {
  const website = String(value || '').trim();
  if (!website) return '';
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

export function slugify(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeJurisdiction(value: unknown) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('rocor') || normalized.includes('russian orthodox church outside russia')) return 'rocor';
  if (normalized.includes('orthodox church in america') || normalized === 'oca') return 'oca';
  if (normalized.includes('antiochian')) return 'antiochian';
  if (normalized.includes('greek') || normalized.includes('goa')) return 'goa';
  if (normalized.includes('serbian')) return 'serbian';
  if (normalized.includes('romanian')) return 'romanian';
  if (normalized.includes('bulgarian')) return 'bulgarian';
  if (normalized.includes('ukrainian')) return 'ukrainian';
  return slugify(value || 'other');
}

export function communitySketchImage(type: string) {
  if (type === 'monastery') return '/images/giving/monastery-square.png';
  if (type === 'mission') return '/images/giving/mission-church-square.png';
  return '/images/giving/parish-church-square.png';
}

export function communitySketchAlt(type: string) {
  if (type === 'monastery') return 'Orthodox monastery sketch';
  if (type === 'mission') return 'Orthodox mission church sketch';
  return 'Orthodox parish church sketch';
}

export function parishFromRegistration(registration: CatalogRegistration | null | undefined) {
  if (!registration) return null;
  registration = mergeStewardshipFundsIntoRegistration(registration).registration;
  const id =
    (registration as ParishRegistration).parishId ||
    parishSlug((registration as ParishRegistration).parishName, (registration as ParishRegistration).city);
  if (!id || (registration as ParishRegistration).status !== 'verified') return null;
  if (
    (registration as ParishRegistration).givingStatus &&
    (registration as ParishRegistration).givingStatus !== 'active'
  )
    return null;
  // Older/admin-created records can carry a generic type despite a canonical mission or monastery name.
  // Match the admin dashboard's classification rule so the public sketch and
  // label cannot disagree with the organization the parish registered.
  const type = normalizeCommunityType(
    `${(registration as ParishRegistration).communityType || ''} ${(registration as ParishRegistration).parishName || ''}`
  );
  const givingPlus = givingFeatureAccess(registration, 'branding');
  const starterDesignatedFund = givingFeatureAccess(registration, 'starterDesignatedFund');
  const candleGiving = givingFeatureAccess(registration, 'candles');
  const configuredFunds = Array.isArray((registration as ParishRegistration).funds)
    ? (registration as ParishRegistration).funds!.filter(
        (fund) => fund && fund.enabled !== false && fund.active !== false
      )
    : [];
  const generalFund = configuredFunds.find(isGeneralGivingFund) || {
    id: 'general',
    name: 'General Operating Fund',
    description: 'Utilities, supplies, ministries, and day-to-day parish needs.',
  };
  const designatedFunds = configuredFunds.filter((fund) => !isGeneralGivingFund(fund) && !isCandleGivingFund(fund));
  const publicFunds = givingPlus
    ? configuredFunds.length
      ? configuredFunds
      : [generalFund]
    : [generalFund, ...(starterDesignatedFund ? designatedFunds : [])];

  const storedImageUrl =
    (registration as ParishRegistration).imageUrl || (registration as ParishRegistration).photoUrl || '';
  const customImageUrl = isCommunitySketchImage(storedImageUrl) ? '' : storedImageUrl;

  return {
    id,
    name: (registration as ParishRegistration).parishName,
    type,
    communityType: (registration as ParishRegistration).communityType || type,
    jurisdiction: normalizeJurisdiction((registration as ParishRegistration).jurisdiction || 'other'),
    jurisdictionLabel: (registration as ParishRegistration).jurisdiction || 'Other canonical jurisdiction',
    city: (registration as ParishRegistration).city || '',
    state: (registration as ParishRegistration).state || '',
    status: 'verified',
    givingStatus: (registration as ParishRegistration).givingStatus || 'active',
    source: 'registration',
    logoUrl: givingPlus ? (registration as ParishRegistration).logoUrl || '' : '',
    imageUrl:
      (givingPlus ? (registration as ParishRegistration).logoUrl : '') || customImageUrl || communitySketchImage(type),
    imageAlt:
      givingPlus && (registration as ParishRegistration).logoUrl
        ? `${(registration as ParishRegistration).parishName || 'Orthodox community'} logo`
        : customImageUrl
          ? (registration as ParishRegistration).imageAlt ||
            `${(registration as ParishRegistration).parishName || 'Orthodox community'} image`
          : communitySketchAlt(type),
    liturgicalCalendar: (registration as ParishRegistration).liturgicalCalendar || 'julian',
    koinoniaCalendarUrl: (registration as ParishRegistration).koinoniaCalendarUrl || '',
    patronalFeast: (registration as ParishRegistration).patronalFeast || '',
    patronalFeastName:
      (registration as ParishRegistration).patronalFeastName ||
      (registration as ParishRegistration).parishPatronalFeastName ||
      '',
    patronalFeastDate:
      (registration as ParishRegistration).patronalFeastDate ||
      (registration as ParishRegistration).parishPatronalFeastDate ||
      '',
    recurringGivingEnabled: (registration as ParishRegistration).recurringGivingEnabled ?? true,
    givingPlusEnabled: givingPlus,
    designatedFundsEnabled: starterDesignatedFund && publicFunds.some((fund) => !isGeneralGivingFund(fund)),
    candlesEnabled: candleGiving && ((registration as ParishRegistration).candlesEnabled ?? true),
    commemorationsEnabled:
      givingFeatureAccess(registration, 'commemorations') &&
      ((registration as ParishRegistration).commemorationsEnabled ?? true),
    sacramentsEnabled: sacramentsEnabledFor(registration),
    bookstoreEnabled: bookstoreEnabledFor(registration),
    processingFeeSchedules: publicPaymentFeeSchedules(),
    funds: publicFunds,
    campaigns:
      givingPlus && Array.isArray((registration as ParishRegistration).campaigns)
        ? (registration as ParishRegistration).campaigns
        : [],
    feastCampaigns:
      givingPlus && Array.isArray((registration as ParishRegistration).feastCampaigns)
        ? (registration as ParishRegistration).feastCampaigns
        : [],
  };
}

export function isGeneralGivingFund(fund: ParishFund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) =>
    ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value)
  );
}

export function isCandleGivingFund(fund: ParishFund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}

export function starterFundCatalogError(funds: unknown = []) {
  const active = (Array.isArray(funds) ? funds : []).filter(
    (fund: { enabled?: unknown; active?: unknown } | null) => fund && fund.enabled !== false && fund.active !== false
  );
  const generalCount = active.filter(isGeneralGivingFund).length;
  const candleCount = active.filter(isCandleGivingFund).length;
  if (generalCount !== 1) return 'Give must keep exactly one active General Operating Fund.';
  if (candleCount > 1) return 'Give can keep only one active Candle Fund.';
  return '';
}

export function normalizeCommunityType(value: unknown) {
  const normalized = String(value || 'parish').toLowerCase();
  if (normalized.includes('monastery') || normalized.includes('skete')) return 'monastery';
  if (normalized.includes('mission')) return 'mission';
  return 'parish';
}

export async function findOrCreateDonorCustomer(
  env: Partial<Env> & { STRIPE_SECRET_KEY?: string },
  parish: { id: string; name?: string; stripeAccountId?: string },
  body: { email: string; firstName?: string; lastName?: string }
) {
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const name = donorName(body);
  const stripeAccountId = parish.stripeAccountId || '';

  const customerPath = `/v1/customers?email=${encodeURIComponent(email)}&limit=1`;
  const lookup = stripeAccountId
    ? await stripeGetConnectedRequest(env, customerPath, stripeAccountId)
    : await stripeGetRequest(env, customerPath);

  if (!lookup.ok) return lookup;

  const existing = Array.isArray(lookup.body.data)
    ? lookup.body.data.find((customer: { deleted?: boolean; id?: string }) => !customer.deleted)
    : null;
  if (existing?.id) return { ok: true, body: existing };

  const customerForm = new URLSearchParams({
    email,
    name,
    'metadata[agapay_parish_id]': parish.id,
    'metadata[agapay_parish_name]': parish.name || '',
    'metadata[agapay_donor_first_name]': body.firstName || '',
    'metadata[agapay_donor_last_name]': body.lastName || '',
  });

  return stripeFormConnectedRequest(env, '/v1/customers', customerForm, stripeAccountId);
}
