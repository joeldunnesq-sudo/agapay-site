// Generated from src/handlers/parish.ts by npm run build:server. Do not edit.
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
import {
  migrateDonorEmailReferences,
  requireDonor,
  requireAdminContext,
  requireAdmin,
  handleParishSession,
  handleParishPasswordResetRequest,
  handleParishPasswordResetConfirm,
} from './parish-authentication.js';
import {
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
function centsFromBody(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}
function normalizeBookstoreBody(body = {}) {
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
async function verifyParishDashboardBearer(registration, token) {
  return Boolean(await resolveParishDashboardSession(registration, token));
}
function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === void 0 || value === null || String(value).trim() === '';
  });
}
function appendAdminAudit(registration, action, actor, details = {}) {
  const current = Array.isArray(registration?.adminAuditLog) ? registration.adminAuditLog : [];
  const entry = {
    id: generateSecret('audit'),
    action: String(action || 'unknown'),
    actor: normalizeAdminActor(actor || 'Admin'),
    at: /* @__PURE__ */ new Date().toISOString(),
    details: details && typeof details === 'object' ? details : {},
  };
  return {
    ...registration,
    adminAuditLog: [...current, entry].slice(-300),
  };
}
function statusTimelineWithNext(currentStatus, nextStatus, existingTimeline) {
  const timeline = Array.isArray(existingTimeline) ? [...existingTimeline] : [];
  const normalizedNext = String(nextStatus || currentStatus || '');
  if (!normalizedNext) return timeline;
  const latest = timeline[timeline.length - 1];
  if (latest?.status === normalizedNext) return timeline;
  timeline.push({
    status: normalizedNext,
    at: /* @__PURE__ */ new Date().toISOString(),
  });
  return timeline;
}
function subscriptionTier(id) {
  return sharedSubscriptionTier(id);
}
function defaultSubscriptionTier(registration) {
  return sharedDefaultSubscriptionTier(registration);
}
function subscriptionStatusLabel(status) {
  const labels = {
    not_started: 'Not started',
    checkout_created: 'Checkout created',
    trial_checkout_created: 'Demo checkout created',
    trialing: 'Free demo',
    active: 'Active',
    past_due: 'Past due',
    cancelled: 'Cancelled',
    free_forever: 'Free forever',
  };
  return labels[status] || status || 'Not started';
}
function subscriptionTierSummary(tier) {
  if (!tier) return '';
  if (tier.monthlyCents === null)
    return `${tier.label} - custom / negotiated subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  if (tier.monthlyCents === 0)
    return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
}
function absoluteWebsiteUrl(value) {
  const website = String(value || '').trim();
  if (!website) return '';
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
function normalizeJurisdiction(value) {
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
function communitySketchImage(type) {
  if (type === 'monastery') return '/images/giving/monastery-square.png';
  if (type === 'mission') return '/images/giving/mission-church-square.png';
  return '/images/giving/parish-church-square.png';
}
function communitySketchAlt(type) {
  if (type === 'monastery') return 'Orthodox monastery sketch';
  if (type === 'mission') return 'Orthodox mission church sketch';
  return 'Orthodox parish church sketch';
}
function parishFromRegistration(registration) {
  if (!registration) return null;
  registration = mergeStewardshipFundsIntoRegistration(registration).registration;
  const id = registration.parishId || parishSlug(registration.parishName, registration.city);
  if (!id || registration.status !== 'verified') return null;
  if (registration.givingStatus && registration.givingStatus !== 'active') return null;
  const type = normalizeCommunityType(`${registration.communityType || ''} ${registration.parishName || ''}`);
  const givingPlus = givingFeatureAccess(registration, 'branding');
  const starterDesignatedFund = givingFeatureAccess(registration, 'starterDesignatedFund');
  const candleGiving = givingFeatureAccess(registration, 'candles');
  const configuredFunds = Array.isArray(registration.funds)
    ? registration.funds.filter((fund) => fund && fund.enabled !== false && fund.active !== false)
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
  const storedImageUrl = registration.imageUrl || registration.photoUrl || '';
  const customImageUrl = isCommunitySketchImage(storedImageUrl) ? '' : storedImageUrl;
  return {
    id,
    name: registration.parishName,
    type,
    communityType: registration.communityType || type,
    jurisdiction: normalizeJurisdiction(registration.jurisdiction || 'other'),
    jurisdictionLabel: registration.jurisdiction || 'Other canonical jurisdiction',
    city: registration.city || '',
    state: registration.state || '',
    status: 'verified',
    givingStatus: registration.givingStatus || 'active',
    source: 'registration',
    logoUrl: givingPlus ? registration.logoUrl || '' : '',
    imageUrl: (givingPlus ? registration.logoUrl : '') || customImageUrl || communitySketchImage(type),
    imageAlt:
      givingPlus && registration.logoUrl
        ? `${registration.parishName || 'Orthodox community'} logo`
        : customImageUrl
          ? registration.imageAlt || `${registration.parishName || 'Orthodox community'} image`
          : communitySketchAlt(type),
    liturgicalCalendar: registration.liturgicalCalendar || 'julian',
    koinoniaCalendarUrl: registration.koinoniaCalendarUrl || '',
    patronalFeast: registration.patronalFeast || '',
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || '',
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || '',
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    givingPlusEnabled: givingPlus,
    designatedFundsEnabled: starterDesignatedFund && publicFunds.some((fund) => !isGeneralGivingFund(fund)),
    candlesEnabled: candleGiving && (registration.candlesEnabled ?? true),
    commemorationsEnabled:
      givingFeatureAccess(registration, 'commemorations') && (registration.commemorationsEnabled ?? true),
    sacramentsEnabled: sacramentsEnabledFor(registration),
    bookstoreEnabled: bookstoreEnabledFor(registration),
    processingFeeSchedules: publicPaymentFeeSchedules(),
    funds: publicFunds,
    campaigns: givingPlus && Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: givingPlus && Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : [],
  };
}
function isGeneralGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) =>
    ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value)
  );
}
function isCandleGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}
function starterFundCatalogError(funds = []) {
  const active = (Array.isArray(funds) ? funds : []).filter(
    (fund) => fund && fund.enabled !== false && fund.active !== false
  );
  const generalCount = active.filter(isGeneralGivingFund).length;
  const candleCount = active.filter(isCandleGivingFund).length;
  if (generalCount !== 1) return 'Give must keep exactly one active General Operating Fund.';
  if (candleCount > 1) return 'Give can keep only one active Candle Fund.';
  return '';
}
function normalizeCommunityType(value) {
  const normalized = String(value || 'parish').toLowerCase();
  if (normalized.includes('monastery') || normalized.includes('skete')) return 'monastery';
  if (normalized.includes('mission')) return 'mission';
  return 'parish';
}
async function findOrCreateDonorCustomer(env, parish, body) {
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
  const existing = Array.isArray(lookup.body.data) ? lookup.body.data.find((customer) => !customer.deleted) : null;
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
export {
  absoluteWebsiteUrl,
  appendAdminAudit,
  bookstoreEnabledFor,
  centsFromBody,
  communitySketchAlt,
  communitySketchImage,
  d1All,
  d1Batch,
  d1First,
  d1Run,
  defaultSubscriptionTier,
  donorSummaryFromOfferings,
  findCheckoutParish,
  findOrCreateDonorCustomer,
  findRegistrationByParishId,
  findRegistrationByStripeAccountId,
  findRegistrationByStripeSubscriptionId,
  generateSecret,
  getBearerToken,
  giftDisplayName,
  givingCatalogChanged,
  givingFeatureAccess,
  handleCheckout,
  handleCheckoutSessionStatus,
  handleDashboardInvite,
  handleParishDashboard,
  handleParishDemoTier,
  handleParishFeatureRequestDismiss,
  handleParishPasswordResetConfirm,
  handleParishPasswordResetRequest,
  handleParishSession,
  handleParishStripeOnboarding,
  handleParishStripeRefresh,
  handleParishSubscriptionCheckout,
  handleParishSubscriptionPortal,
  handleParishSubscriptionRefresh,
  handleRegistrations,
  hasParishPlusAccess,
  hasProductionStore,
  isCandleGivingFund,
  isGeneralGivingFund,
  json,
  loadDonorCommemorations,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadIndexedRegistration,
  loadParishPaidOfferings,
  loadParishRecurringOfferings,
  loadReconciledDonorCommemorations,
  loadRegistrationByReference,
  loadVerifiedRegistrationParishPage,
  migrateDonorEmailReferences,
  missingProductionStoreResponse,
  normalizeBookstoreBody,
  normalizeCommunityType,
  normalizeJurisdiction,
  normalizeSacramentPriests,
  paidCommemorationOfferingWithNames,
  paidOffering,
  paidOfferingStatus,
  parishDashboardPayload,
  parishFromRegistration,
  publicDonorOffering,
  publicParishGiftFromOffering,
  rateLimit,
  reconcilePendingDonorOfferings,
  recordAuditEvent,
  recurringExpectedDays,
  recurringHealthGroupKey,
  recurringOfferingStatus,
  refreshDonorOfferingFromStripeCheckout,
  registrationRequiresJurisdiction,
  repairMissingDonorCommemorationsFromOfferings,
  requireAdmin,
  requireAdminContext,
  requireDonor,
  requireFields,
  sacramentsEnabledFor,
  saveRegistrationRecord,
  slugify,
  starterFundCatalogError,
  statusTimelineWithNext,
  storeDonorOffering,
  stripeObjectMetadata,
  stripePaymentIntentFinancialUpdates,
  subscriptionStatusLabel,
  subscriptionTier,
  subscriptionTierSummary,
  summarizeCharges,
  summarizeParishRecurringHealth,
  unauthorized,
  updateDonorOfferingByCheckout,
  updateDonorOfferingByPaymentIntent,
  verifiedRegistrationParishes,
  verifyParishDashboardBearer,
};
