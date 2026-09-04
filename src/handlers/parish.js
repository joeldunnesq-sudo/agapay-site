// src/handlers/parish.js
// Parish handlers and shared helpers (Stripe, donor, admin extracted to own files).

import { parishClosureState } from '../portability/closure.js';
import { saveCommemorationEntry } from './parish-commemorations.js';
import {
  COMMEMORATION_KEY_PREFIX,
  applyParishDashboardPassword,
  clampListLimit,
  d1All,
  d1Batch,
  d1First,
  d1Run,
  decodeListCursor,
  donorCheckoutIndexKey,
  donorOfferingKey,
  encodeListCursor,
  generateSecret,
  getAdminToken,
  getBearerToken,
  hasProductionStore,
  hashSessionToken,
  isSystemKvKey,
  issueParishDashboardSession,
  json,
  listKvKeys,
  loadDonor,
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail,
  parishIdIndexKey,
  parseJsonRow,
  privilegedMfaRequired,
  rateLimit,
  rateLimitByKey,
  resolveAdminSession,
  resolveParishDashboardSession,
  safeParseJsonRow,
  secureCompare,
  sha256Hex,
  stripeAccountIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
  verifyParishDashboardPassword,
} from '../lib/core.js';
import { beginMfaAuthentication } from '../lib/mfa.js';
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
export { registrationRequiresJurisdiction };
import { publicPaymentFeeSchedules } from '../lib/payment-fees.js';
import { loadParishPricingUsage } from '../lib/parish-pricing-usage.js';
import { donorName } from '../lib/stripe-fees.js';
import { stripeFormConnectedRequest, stripeGetConnectedRequest, stripeGetRequest } from '../lib/stripe-connect.js';
import { sendParishPasswordResetEmail } from '../lib/parish-notifications.js';

function d1(env) {
  return env.AGAPAY_DB || env.DB || null;
}

async function parishDashboardPayloadWithPricingUsage(env, parishId, registration) {
  return {
    ...parishDashboardPayload(parishId, registration),
    parishPricingUsage: await loadParishPricingUsage(env, parishId, registration),
  };
}

const BOOKSTORE_CATEGORIES = new Set([
  'book',
  'prayer_rope',
  'icon',
  'candle',
  'jewelry',
  'incense',
  'cd_dvd',
  'other',
]);

export function centsFromBody(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

export function normalizeBookstoreBody(body = {}) {
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

export async function verifyParishDashboardBearer(registration, token) {
  return Boolean(await resolveParishDashboardSession(registration, token));
}

export async function migrateDonorEmailReferences(env, oldEmail, newEmail) {
  const oldNormalized = normalizeEmail(oldEmail);
  const newNormalized = normalizeEmail(newEmail);
  if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) return;

  if (d1(env)) {
    const offerings = await loadDonorOfferings(env, oldNormalized, 1000);
    for (const offering of offerings) {
      await storeDonorOffering(env, {
        ...offering,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString(),
      });
    }

    const commemorations = await loadDonorCommemorations(env, oldNormalized, 1000);
    for (const entry of commemorations) {
      await saveCommemorationEntry(env, {
        ...entry,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (!env.AGAPAY_REGISTRATIONS) return;

  const offeringKeys = await listKvKeys(env, { prefix: donorOfferingKey(oldNormalized, ''), limit: 1000 });
  for (const key of offeringKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = {
        ...JSON.parse(raw),
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString(),
      };
      const newKey = donorOfferingKey(newNormalized, offering.id || key.name.split(':').pop());
      await env.AGAPAY_REGISTRATIONS.put(newKey, JSON.stringify(offering));
      if (offering.checkoutSessionId)
        await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(offering.checkoutSessionId), newKey);
      await env.AGAPAY_REGISTRATIONS.delete(key.name);
    } catch {
      // Ignore malformed donor offering records during email migration.
    }
  }

  const commemorationKeys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: 1000 });
  for (const key of commemorationKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) !== oldNormalized) continue;
      await env.AGAPAY_REGISTRATIONS.put(
        key.name,
        JSON.stringify({
          ...entry,
          donorEmail: newNormalized,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore malformed commemoration records during email migration.
    }
  }
}

export async function requireDonor(request, env) {
  if (!hasProductionStore(env)) return null;
  const email = normalizeEmail(request.headers.get('X-AGAPAY-Donor-Email'));
  const token = getBearerToken(request);
  if (!email || !token) return null;
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return null;
  if (!donor || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  if (donor.sessionExpiresAt && new Date(donor.sessionExpiresAt).getTime() < Date.now()) return null;
  const submittedHash = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submittedHash, donor.sessionTokenHash)) return null;
  return donor;
}

export async function requireAdminContext(request, env) {
  const submitted = getAdminToken(request);
  if (!submitted) return null;

  const session = await resolveAdminSession(env, submitted);
  if (!session) return null;
  if (privilegedMfaRequired(env) && !session.mfaVerifiedAt) return null;
  return {
    actor: session.actor || 'Admin',
    authType: 'session',
    expiresAt: session.expiresAt || '',
    sessionId: session.id || '',
    mfaVerifiedAt: session.mfaVerifiedAt || '',
  };
}

export async function requireAdmin(request, env) {
  return Boolean(await requireAdminContext(request, env));
}

export function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

export function appendAdminAudit(registration, action, actor, details = {}) {
  const current = Array.isArray(registration?.adminAuditLog) ? registration.adminAuditLog : [];
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

export function statusTimelineWithNext(currentStatus, nextStatus, existingTimeline) {
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

export function subscriptionTier(id) {
  return sharedSubscriptionTier(id);
}

export function defaultSubscriptionTier(registration) {
  return sharedDefaultSubscriptionTier(registration);
}

export function subscriptionStatusLabel(status) {
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

export function subscriptionTierSummary(tier) {
  if (!tier) return '';
  if (tier.monthlyCents === null)
    return `${tier.label} - custom / negotiated subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  if (tier.monthlyCents === 0)
    return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo; ${tier.transactionRateLabel || 'no AGAPAY donation fee'}`;
}

export function absoluteWebsiteUrl(value) {
  const website = String(value || '').trim();
  if (!website) return '';
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeJurisdiction(value) {
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

export function communitySketchImage(type) {
  if (type === 'monastery') return '/images/giving/monastery-square.png';
  if (type === 'mission') return '/images/giving/mission-church-square.png';
  return '/images/giving/parish-church-square.png';
}

export function communitySketchAlt(type) {
  if (type === 'monastery') return 'Orthodox monastery sketch';
  if (type === 'mission') return 'Orthodox mission church sketch';
  return 'Orthodox parish church sketch';
}

function isCommunitySketchImage(value) {
  return [
    '/images/giving/monastery-square.png',
    '/images/giving/mission-church-square.png',
    '/images/giving/parish-church-square.png',
  ].includes(String(value || '').trim());
}
export function parishFromRegistration(registration) {
  if (!registration) return null;
  registration = mergeStewardshipFundsIntoRegistration(registration).registration;
  const id = registration.parishId || parishSlug(registration.parishName, registration.city);
  if (!id || registration.status !== 'verified') return null;
  if (registration.givingStatus && registration.givingStatus !== 'active') return null;
  // Older/admin-created records can carry a generic type despite a canonical mission or monastery name.
  // Match the admin dashboard's classification rule so the public sketch and
  // label cannot disagree with the organization the parish registered.
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

export function isGeneralGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) =>
    ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value)
  );
}

export function isCandleGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return keys.some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}

export function starterFundCatalogError(funds = []) {
  const active = (Array.isArray(funds) ? funds : []).filter(
    (fund) => fund && fund.enabled !== false && fund.active !== false
  );
  const generalCount = active.filter(isGeneralGivingFund).length;
  const candleCount = active.filter(isCandleGivingFund).length;
  if (generalCount !== 1) return 'Give must keep exactly one active General Operating Fund.';
  if (candleCount > 1) return 'Give can keep only one active Candle Fund.';
  return '';
}

export function normalizeCommunityType(value) {
  const normalized = String(value || 'parish').toLowerCase();
  if (normalized.includes('monastery') || normalized.includes('skete')) return 'monastery';
  if (normalized.includes('mission')) return 'mission';
  return 'parish';
}

export async function saveRegistrationRecord(env, reference, registration, previous = null) {
  if (!reference) return registration;
  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const previousParishId = previous ? previous.parishId || parishSlug(previous.parishName, previous.city) : '';

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO registrations (
        reference, parish_id, status, parish_name, community_type,
        stripe_account_id, stripe_subscription_id, received_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(reference) DO UPDATE SET
         parish_id = excluded.parish_id,
         status = excluded.status,
         parish_name = excluded.parish_name,
         community_type = excluded.community_type,
         stripe_account_id = excluded.stripe_account_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         received_at = excluded.received_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      reference,
      parishId,
      registration.status || 'pending',
      registration.parishName || '',
      registration.communityType || '',
      registration.stripeAccountId || '',
      registration.stripeSubscriptionId || '',
      registration.receivedAt || '',
      registration.reviewedAt ||
        registration.parishUpdatedAt ||
        registration.subscriptionUpdatedAt ||
        new Date().toISOString(),
      JSON.stringify(registration)
    );
    return registration;
  }

  if (hasProductionStore(env)) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
    if (parishId) await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), reference);
    if (previousParishId && previousParishId !== parishId)
      await env.AGAPAY_REGISTRATIONS.delete(parishIdIndexKey(previousParishId));

    if (registration.stripeAccountId)
      await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(registration.stripeAccountId), reference);
    if (previous?.stripeAccountId && previous.stripeAccountId !== registration.stripeAccountId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeAccountIndexKey(previous.stripeAccountId));
    }

    if (registration.stripeSubscriptionId)
      await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(registration.stripeSubscriptionId), reference);
    if (previous?.stripeSubscriptionId && previous.stripeSubscriptionId !== registration.stripeSubscriptionId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeSubscriptionIndexKey(previous.stripeSubscriptionId));
    }
  }

  return registration;
}

export async function loadIndexedRegistration(env, indexKey) {
  if (!env.AGAPAY_REGISTRATIONS || !indexKey) return null;
  const reference = await env.AGAPAY_REGISTRATIONS.get(indexKey);
  if (!reference) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  try {
    return { key: reference, registration: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export async function loadRegistrationByReference(env, reference) {
  if (!reference) return null;

  if (d1(env)) {
    const row = await d1First(env, 'SELECT data FROM registrations WHERE reference = ?1', reference);
    const registration = parseJsonRow(row);
    if (registration) return registration;
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  const registration = JSON.parse(raw);
  if (d1(env)) await saveRegistrationRecord(env, reference, registration);
  return registration;
}

export async function loadVerifiedRegistrationParishPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const query = String(options.query || options.q || '')
    .trim()
    .toLowerCase();
  const type = String(options.type || '')
    .trim()
    .toLowerCase();
  const jurisdiction = String(options.jurisdiction || '')
    .trim()
    .toLowerCase();

  if (d1(env)) {
    const where = ["status = 'verified'"];
    const params = [];

    if (cursor) {
      where.push('(received_at < ? OR (received_at = ? AND reference < ?))');
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }
    if (type) {
      where.push("LOWER(COALESCE(json_extract(data, '$.communityType'), '')) LIKE ?");
      params.push(`%${type}%`);
    }
    if (jurisdiction) {
      where.push("LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?");
      params.push(`%${jurisdiction}%`);
    }

    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       WHERE ${where.join(' AND ')}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const parishes = pageRows.map(safeParseJsonRow).map(parishFromRegistration).filter(Boolean);
    return {
      parishes,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: 'd1',
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { parishes: [], cursor: null, hasMore: false, limit, source: 'none' };

  const keys = await listKvKeys(env, { limit });
  const verified = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const parish = parishFromRegistration(JSON.parse(raw));
      if (parish) verified.push(parish);
    } catch {
      // Ignore malformed registration records in the public parish directory.
    }
  }

  return { parishes: verified, cursor: null, hasMore: false, limit, source: 'kv' };
}

export async function verifiedRegistrationParishes(env, options = {}) {
  const page = await loadVerifiedRegistrationParishPage(env, options);
  return page.parishes;
}

export async function findRegistrationByParishId(env, parishId) {
  if (await parishClosureState(env, parishId)) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      `SELECT reference, data FROM registrations
       WHERE parish_id = ?1
       ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC, updated_at DESC, reference DESC
       LIMIT 1`,
      parishId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, parishIdIndexKey(parishId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      const currentParishId = registration.parishId || parishSlug(registration.parishName, registration.city);
      if (currentParishId === parishId) {
        await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records while searching.
    }
  }

  return null;
}

export async function findRegistrationByStripeSubscriptionId(env, subscriptionId) {
  if (!subscriptionId) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_subscription_id = ?1 LIMIT 1',
      subscriptionId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeSubscriptionIndexKey(subscriptionId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeSubscriptionId === subscriptionId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(subscriptionId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

export async function findRegistrationByStripeAccountId(env, stripeAccountId) {
  if (!stripeAccountId) return null;
  if (d1(env)) {
    const row = await d1First(
      env,
      'SELECT reference, data FROM registrations WHERE stripe_account_id = ?1 LIMIT 1',
      stripeAccountId
    );
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeAccountIndexKey(stripeAccountId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeAccountId === stripeAccountId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(stripeAccountId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

export async function findCheckoutParish(env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;

  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;

  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || '',
  };
}

export async function findOrCreateDonorCustomer(env, parish, body) {
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

export async function handleParishSession(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-auth', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const accountLimited = await rateLimitByKey(request, env, 'parish-auth-account', parishId, {
    limit: 20,
    windowSeconds: 300,
  });
  if (accountLimited) return accountLimited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });

  const password = String(body.password || '').trim();
  if (!(await verifyParishDashboardPassword(found.registration, password))) return unauthorized();
  if (privilegedMfaRequired(env))
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: 'parish_admin',
        principalId: parishId,
        purpose: 'login',
        metadata: {},
      })),
    });

  const session = await issueParishDashboardSession(found.registration);
  await saveRegistrationRecord(env, found.key, session.registration, found.registration);

  return json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    parish: await parishDashboardPayloadWithPricingUsage(env, parishId, session.registration),
  });
}

export async function handleParishPasswordResetRequest(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-password-reset-request', { limit: 6, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parishId = String(body.parishId || '').trim();
  const email = normalizeEmail(body.email);
  if (!parishId || !email) return json({ error: 'Parish ID and email are required' }, { status: 422 });

  const generic = {
    ok: true,
    message: 'If that parish and contact email match our records, a reset link has been sent.',
  };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json(generic);

  const registration = found.registration;
  const contactEmails = Array.from(
    new Set([normalizeEmail(registration.priestEmail), normalizeEmail(registration.treasurerEmail)].filter(Boolean))
  );
  if (!contactEmails.includes(email)) return json(generic);

  const resetToken = generateSecret('parish_reset');
  const resetSalt = generateSecret('parish_reset_salt');
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, '')}/give/login?reset=1&parish=${encodeURIComponent(registration.parishId || parishId)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...registration,
    parishPasswordResetSalt: resetSalt,
    parishPasswordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    parishPasswordResetSentAt: new Date().toISOString(),
    parishPasswordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    parishUpdatedAt: new Date().toISOString(),
  };

  const emailResult = await sendParishPasswordResetEmail(env, appUrl, updated, resetUrl, contactEmails);
  updated.parishPasswordResetEmailStatus = emailResult.status || '';
  updated.parishPasswordResetEmailDetail = emailResult.detail || '';
  await saveRegistrationRecord(env, found.key, updated, registration);

  return json({
    ...generic,
    email: { status: emailResult.status || 'unknown', detail: emailResult.detail || '' },
    resetUrl: emailResult.status === 'not_configured' ? resetUrl : undefined,
  });
}

export async function handleParishPasswordResetConfirm(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-password-reset-confirm', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parishId = String(body.parishId || '').trim();
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || body.password || '').trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || '').trim();
  if (!parishId || !token) return json({ error: 'Parish ID and reset token are required' }, { status: 422 });
  if (newPassword.length < 8)
    return json({ error: 'Dashboard password must be at least 8 characters.' }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: 'Dashboard passwords do not match.' }, { status: 422 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return unauthorized();
  const current = found.registration;
  if (!current.parishPasswordResetSalt || !current.parishPasswordResetTokenHash) {
    return json({ error: 'Reset link is missing or expired. Please request a new link.' }, { status: 410 });
  }
  if (current.parishPasswordResetExpiresAt && new Date(current.parishPasswordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: 'Reset link expired. Please request a new link.' }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${current.parishPasswordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, current.parishPasswordResetTokenHash)) return unauthorized();

  let updated = await applyParishDashboardPassword(
    {
      ...current,
      parishPasswordResetSalt: '',
      parishPasswordResetTokenHash: '',
      parishPasswordResetSentAt: '',
      parishPasswordResetExpiresAt: '',
      parishPasswordResetEmailStatus: '',
      parishPasswordResetEmailDetail: '',
      parishDashboardSessions: [],
      parishUpdatedAt: new Date().toISOString(),
    },
    newPassword,
    { temporary: false }
  );
  updated = {
    ...updated,
    parishDashboardSessions: [],
  };
  await saveRegistrationRecord(env, found.key, updated, current);

  return json({ ok: true, updatedAt: updated.parishDashboardTokenUpdatedAt || new Date().toISOString() });
}
