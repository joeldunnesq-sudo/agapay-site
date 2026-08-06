// src/handlers/parish.js
// Parish handlers and shared helpers (Stripe, donor, admin extracted to own files).

import { activeFestalAlmsCampaigns } from "../festal-alms.js";
import {
  enrichParishGivingOptions,
  publicBoolean,
  publicComment,
} from "./parish-giving-catalog.js";
import {
  commemorationSourceIdFromOffering,
  ensureCommemorationEntryFromOffering,
  saveCommemorationEntry,
  splitSubmittedNames,
} from "./parish-commemorations.js";
import { submitParishSupportTicket } from "../lib/parish-support-tickets.js";
import { dismissParishFeatureRequest, loadPendingParishFeatureRequests } from "../lib/parish-feature-requests.js";
import {
  COMMEMORATION_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX,
  PARISH_ID_INDEX_PREFIX,
  PARISH_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_EVENT_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  applyDonorPassword,
  applyParishDashboardPassword,
  claimStripeEvent,
  clampListLimit,
  createPasswordRecord,
  d1All,
  d1Batch,
  d1First,
  d1Run,
  d1SetSetting,
  decodeListCursor,
  deleteDonor,
  donorCheckoutIndexKey,
  donorOfferingKey,
  encodeListCursor,
  finishStripeEvent,
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
  publicDonor,
  rateLimit,
  rateLimitByKey,
  recordStripeEvent,
  resolveAdminSession,
  resolveParishDashboardSession,
  safeParseJsonRow,
  saveDonor,
  secureCompare,
  sha256Hex,
  stripeAccountIndexKey,
  stripePaymentIntentIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
  verifyDonorPassword,
  verifyParishDashboardPassword,
  verifyPasswordRecord,
  verifyTurnstileIfConfigured,
} from "../lib/core.js";
import { loadGivingCatalogFromAccounting, synchronizeGivingCatalogWithAccounting } from "../accounting/source-wiring.js";
import { accountingAvailableForParish } from "../lib/accounting-demo-access.js";
import { parishLifeAvailableFor } from "../lib/parish-life-access.js";
import { fetchKoinoniaCalendarIcs, normalizeKoinoniaCalendarUrl } from "../lib/koinonia-calendar.js";
import { ensureBenevolenceFundInRegistration, mergeStewardshipFundsIntoRegistration } from "../lib/stewardship-funds.js";

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
export {
  bookstoreEnabledFor,
  givingFeatureAccess,
  hasParishPlusAccess,
  recordAuditEvent,
  sacramentsEnabledFor,
};

import { bookstoreEnabledFor, communicationsEnabledFor, directoryEnabledFor, entitlementsSummary, givingFeatureAccess, hasParishPlusAccess, sacramentsEnabledFor, stewardshipToolAccess, tierIncludesModule, tierIncludesParishPlus } from "../lib/entitlements.js";
import { getDirectorySettings } from "../directory/settings.js";

import {
  createTaxExemptionClaim,
  issueClaimUploadToken
} from "../lib/tax-exemption.js";
import {
  createSubscriptionCheckoutForRegistration,
} from "../lib/subscription-checkout.js";

import {
  PARISH_INTRO_DEMO_DAYS,
  defaultSubscriptionTier as sharedDefaultSubscriptionTier,
  parishIntroDemoEligible,
  subscriptionTier as sharedSubscriptionTier,
} from "../lib/subscriptions.js";

import {
  parishSlug,
} from "../lib/format.js";

import {
  resolveSettlementProfileId,
} from "../lib/settlement-profiles.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import { registrationAgreementEvidence, registrationRequiresJurisdiction, registrationRequiresValuesReview, registrationRequiresWebsite, sanitizePublicRegistrationInput } from "../lib/registration-intake.js";
import { ensureParishCurrentTermsAcceptance, recordOrganizationRegistrationAcceptance } from "../lib/legal-acceptance.js";
export { registrationRequiresJurisdiction };
import {
  publicPaymentFeeSchedules,
} from "../lib/payment-fees.js";
import {
  classifyStripeCharge,
} from "../lib/stripe-volume.js";
import {
  MAX_DONATION_CENTS,
  centsFromAmount,
  checkoutFinancials,
  checkoutPaymentMethod,
  donationAmountError,
  donorName,
  estimateStripeAchFeeCents,
  estimateStripeProcessingFeeCents,
  grossUpForAchFeeCents,
  grossUpForStripeProcessingFeeCents,
  offeringFeeBreakdown,
} from "../lib/stripe-fees.js";
import {
  booleanFromStripeMetadata,
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  numericCents,
  stripeAccountStatus,
  stripeFormConnectedRequest,
  stripeFormRequest,
  stripeGetConnectedRequest,
  stripeGetRequest,
  stripeObjectId,
  stripeReady,
} from "../lib/stripe-connect.js";
import {
  generateDashboardToken,
  htmlEscape,
  loadParishOnboardingGuideAttachment,
  monthLabel,
  publicSubscriptionTiers,
  sendAdminRegistrationNotice,
  sendDashboardInvite,
  sendParishPasswordResetEmail,
  sendRegistrationConfirmation,
  sendTreasurerStripeInvite,
  subscriptionReady,
} from "../lib/parish-notifications.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";

function d1(env) {
  return env.AGAPAY_DB || env.DB || null;
}

const BOOKSTORE_CATEGORIES = new Set(["book", "prayer_rope", "icon", "candle", "jewelry", "incense", "cd_dvd", "other"]);

export function centsFromBody(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

export function normalizeBookstoreBody(body = {}) {
  const category = BOOKSTORE_CATEGORIES.has(String(body.category || body.itemCategory || "").trim())
    ? String(body.category || body.itemCategory).trim()
    : "other";
  const name = String(body.name || "").trim().slice(0, 160);
  const description = String(body.description || "").trim().slice(0, 1200);
  const sku = String(body.sku || "").trim().slice(0, 80);
  const imageUrl = String(body.imageUrl || body.image_url || "").trim().slice(0, 800);
  return {
    name,
    description,
    category,
    sku,
    imageUrl,
    priceCents: centsFromBody(body.priceCents, 0),
    stockQuantity: centsFromBody(body.stockQuantity, 0),
    costBasisCents: centsFromBody(body.costBasisCents, 0),
    reorderThreshold: centsFromBody(body.reorderThreshold, 0)
  };
}

async function sendDonationReceiptIfNeeded(env, offering = {}) {
  const donorModule = await import("./donor.js");
  return donorModule.sendDonationReceiptIfNeeded(env, offering);
}

async function refreshStripeStatusForRegistration(env, reference, registration) {
  const stripeModule = await import("./stripe.js");
  return stripeModule.refreshStripeStatusForRegistration(env, reference, registration);
}

async function createStripeOnboardingSession(request, env, reference, registration, returnPath) {
  const stripeModule = await import("./stripe.js");
  return stripeModule.createStripeOnboardingSession(request, env, reference, registration, returnPath);
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
        updatedAt: new Date().toISOString()
      });
    }

    const commemorations = await loadDonorCommemorations(env, oldNormalized, 1000);
    for (const entry of commemorations) {
      await saveCommemorationEntry(env, {
        ...entry,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      });
    }
    return;
  }

  if (!env.AGAPAY_REGISTRATIONS) return;

  const offeringKeys = await listKvKeys(env, { prefix: donorOfferingKey(oldNormalized, ""), limit: 1000 });
  for (const key of offeringKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = {
        ...JSON.parse(raw),
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      };
      const newKey = donorOfferingKey(newNormalized, offering.id || key.name.split(":").pop());
      await env.AGAPAY_REGISTRATIONS.put(newKey, JSON.stringify(offering));
      if (offering.checkoutSessionId) await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(offering.checkoutSessionId), newKey);
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
      await env.AGAPAY_REGISTRATIONS.put(key.name, JSON.stringify({
        ...entry,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      }));
    } catch {
      // Ignore malformed commemoration records during email migration.
    }
  }
}

export async function requireDonor(request, env) {
  if (!hasProductionStore(env)) return null;
  const email = normalizeEmail(request.headers.get("X-AGAPAY-Donor-Email"));
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
  return {
    actor: session.actor || "Admin",
    authType: "session",
    expiresAt: session.expiresAt || ""
  };
}

export async function requireAdmin(request, env) {
  return Boolean(await requireAdminContext(request, env));
}

export function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

export function appendAdminAudit(registration, action, actor, details = {}) {
  const current = Array.isArray(registration?.adminAuditLog) ? registration.adminAuditLog : [];
  const entry = {
    id: generateSecret("audit"),
    action: String(action || "unknown"),
    actor: normalizeAdminActor(actor || "Admin"),
    at: new Date().toISOString(),
    details: details && typeof details === "object" ? details : {}
  };
  return {
    ...registration,
    adminAuditLog: [...current, entry].slice(-300)
  };
}

export function statusTimelineWithNext(currentStatus, nextStatus, existingTimeline) {
  const timeline = Array.isArray(existingTimeline) ? [...existingTimeline] : [];
  const normalizedNext = String(nextStatus || currentStatus || "");
  if (!normalizedNext) return timeline;
  const latest = timeline[timeline.length - 1];
  if (latest?.status === normalizedNext) return timeline;
  timeline.push({
    status: normalizedNext,
    at: new Date().toISOString()
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
    not_started: "Not started",
    checkout_created: "Checkout created",
    trial_checkout_created: "Demo checkout created",
    trialing: "Free demo",
    active: "Active",
    past_due: "Past due",
    cancelled: "Cancelled",
    free_forever: "Free forever"
  };
  return labels[status] || status || "Not started";
}

export function subscriptionTierSummary(tier) {
  if (!tier) return "";
  if (tier.monthlyCents === null) return `${tier.label} - custom / negotiated subscription; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
  if (tier.monthlyCents === 0) return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
}

export function absoluteWebsiteUrl(value) {
  const website = String(value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

export async function storeDonorOffering(env, offering) {
  if (!hasProductionStore(env) || !offering?.donorEmail) return null;
  const email = normalizeEmail(offering.donorEmail);
  const id = offering.id || crypto.randomUUID();
  const fees = offeringFeeBreakdown(offering);
  const settlementProfileId = offering.settlementProfileId
    || (offering.parishId ? await resolveSettlementProfileId(env, offering.parishId, "giving") : null);
  const record = {
    id,
    donorEmail: email,
    donorName: offering.donorName || "",
    parishId: offering.parishId || "",
    parishName: offering.parishName || "",
    settlementProfileId: settlementProfileId || "",
    giftType: offering.giftType || "stewardship",
    title: offering.title || "AGAPAY offering",
    fund: offering.fund || "",
    campaign: offering.campaign || "",
    campaignId: offering.campaignId || "",
    campaignDescription: offering.campaignDescription || "",
    publicAnonymous: Boolean(offering.publicAnonymous),
    publicDisplayName: offering.publicDisplayName || "",
    publicComment: publicComment(offering.publicComment),
    feastDescription: offering.feastDescription || "",
    inMemoriam: offering.inMemoriam || "",
    frequency: offering.frequency || "once",
    paymentMethod: offering.paymentMethod || "",
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    parishNetCents: fees.parishNetCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    status: offering.status || "checkout_created",
    paymentStatus: offering.paymentStatus || "pending",
    checkoutSessionId: offering.checkoutSessionId || "",
    checkoutUrl: offering.checkoutUrl || "",
    stripeCustomerId: offering.stripeCustomerId || "",
    stripePaymentIntentId: offering.stripePaymentIntentId || "",
    stripeSubscriptionId: offering.stripeSubscriptionId || "",
    stripeChargeId: offering.stripeChargeId || "",
    stripeBalanceTransactionId: offering.stripeBalanceTransactionId || "",
    stripeFeeSource: offering.stripeFeeSource || "",
    namesLiving: offering.namesLiving || "",
    namesDeparted: offering.namesDeparted || "",
    commemorationKind: offering.commemorationKind || "",
    emailReceiptStatus: offering.emailReceiptStatus || "",
    emailReceiptId: offering.emailReceiptId || "",
    emailReceiptDetail: offering.emailReceiptDetail || "",
    emailReceiptSentAt: offering.emailReceiptSentAt || "",
    completedAt: offering.completedAt || "",
    feeReconciledAt: offering.feeReconciledAt || "",
    createdAt: offering.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO donor_offerings (
        id, donor_email, parish_id, checkout_session_id, payment_intent_id,
        stripe_subscription_id, status, payment_status, settlement_profile_id, created_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(id) DO UPDATE SET
         donor_email = excluded.donor_email,
         parish_id = excluded.parish_id,
         checkout_session_id = excluded.checkout_session_id,
         payment_intent_id = excluded.payment_intent_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         status = excluded.status,
         payment_status = excluded.payment_status,
         settlement_profile_id = excluded.settlement_profile_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      record.id,
      record.donorEmail,
      record.parishId,
      record.checkoutSessionId,
      record.stripePaymentIntentId,
      record.stripeSubscriptionId,
      record.status,
      record.paymentStatus,
      record.settlementProfileId,
      record.createdAt,
      record.updatedAt,
      JSON.stringify(record)
    );
  } else {
    const key = donorOfferingKey(email, id);
    await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(record));
    if (record.checkoutSessionId) {
      await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(record.checkoutSessionId), key);
    }
    if (record.stripePaymentIntentId) {
      await env.AGAPAY_REGISTRATIONS.put(stripePaymentIntentIndexKey(record.stripePaymentIntentId), key);
    }
  }
  return record;
}

export async function updateDonorOfferingByCheckout(env, checkoutSessionId, updates = {}) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  const current = await loadDonorOfferingByCheckout(env, checkoutSessionId);
  if (!current) return null;
  if (d1(env)) return storeDonorOffering(env, { ...current, ...updates });

  const key = await env.AGAPAY_REGISTRATIONS.get(donorCheckoutIndexKey(checkoutSessionId));
  if (!key) return null;
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(updated));
  if (updated.stripePaymentIntentId) {
    await env.AGAPAY_REGISTRATIONS.put(stripePaymentIntentIndexKey(updated.stripePaymentIntentId), key);
  }
  return updated;
}

export async function loadDonorOfferingByCheckout(env, checkoutSessionId) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE checkout_session_id = ?1 LIMIT 1", checkoutSessionId);
    return parseJsonRow(row);
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(donorCheckoutIndexKey(checkoutSessionId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function updateDonorOfferingByPaymentIntent(env, paymentIntentId, updates = {}) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE payment_intent_id = ?1 LIMIT 1", paymentIntentId);
    const current = parseJsonRow(row);
    if (!current) return null;
    return storeDonorOffering(env, { ...current, ...updates });
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(stripePaymentIntentIndexKey(paymentIntentId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  if (!raw) return null;
  const current = JSON.parse(raw);
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(updated));
  return updated;
}

export async function loadDonorOfferingByPaymentIntent(env, paymentIntentId) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE payment_intent_id = ?1 LIMIT 1", paymentIntentId);
    return parseJsonRow(row);
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(stripePaymentIntentIndexKey(paymentIntentId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function loadDonorOfferings(env, email, limit = 100) {
  if (d1(env)) {
    const rows = await d1All(
      env,
      "SELECT data FROM donor_offerings WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2",
      normalizeEmail(email),
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = donorOfferingKey(email, "");
  const keys = await listKvKeys(env, { prefix, limit });
  const offerings = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      offerings.push(JSON.parse(raw));
    } catch {
      // Ignore malformed donor offering records.
    }
  }
  return offerings.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function loadDonorCommemorations(env, email, limit = 100) {
  const normalized = normalizeEmail(email);
  if (d1(env)) {
    const rows = await d1All(
      env,
      "SELECT data FROM commemorations WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2",
      normalized,
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: Math.max(limit, 1000) });
  const entries = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) === normalized) entries.push(entry);
    } catch {
      // Ignore malformed commemoration records.
    }
  }
  return entries.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function paidOfferingStatus(offering = {}) {
  const status = String(offering.status || "").toLowerCase();
  const paymentStatus = String(offering.paymentStatus || "").toLowerCase();
  return status === "paid"
    || status === "complete"
    || status === "completed"
    || paymentStatus === "paid"
    || paymentStatus === "succeeded";
}

export function stripeObjectMetadata(...objects) {
  return objects.reduce((metadata, object) => ({
    ...metadata,
    ...(object?.metadata || {})
  }), {});
}

export async function stripePaymentIntentFinancialUpdates(env, paymentIntentId, parishId, fallback = {}) {
  if (!paymentIntentId || !parishId) return {};
  const parish = await findCheckoutParish(env, parishId);
  if (!parish?.stripeAccountId) return {};

  const paymentIntent = await stripeGetConnectedRequest(
    env,
    `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
    parish.stripeAccountId
  );
  if (!paymentIntent.ok) return {};

  const intent = paymentIntent.body || {};
  let charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const chargeId = stripeObjectId(intent.latest_charge);
  if (!charge && chargeId) {
    const chargeResult = await stripeGetConnectedRequest(
      env,
      `/v1/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
      parish.stripeAccountId
    );
    if (chargeResult.ok) charge = chargeResult.body || null;
  }

  const metadata = stripeObjectMetadata(fallback, intent, charge);
  const balanceTransaction = typeof charge?.balance_transaction === "object" ? charge.balance_transaction : null;
  const giftAmountCents = numericCents(metadata.amount_cents)
    || numericCents(fallback.giftAmountCents ?? fallback.amountCents)
    || numericCents(intent.amount_received || intent.amount);
  const chargeCents = numericCents(charge?.amount || intent.amount_received || intent.amount || fallback.chargeCents || giftAmountCents);
  const agapayFeeCents = numericCents(charge?.application_fee_amount ?? metadata.agapay_fee_cents ?? fallback.agapayFeeCents);
  const balanceFeeCents = numericCents(balanceTransaction?.fee);
  const stripeFeeCents = balanceFeeCents
    ? Math.max(0, balanceFeeCents - agapayFeeCents)
    : numericCents(fallback.stripeFeeCents ?? fallback.estimatedStripeFeeCents);
  const totalFeeCents = numericCents(balanceFeeCents || stripeFeeCents + agapayFeeCents);
  const coverFees = booleanFromStripeMetadata(metadata.cover_fees, fallback.coverFees);
  const donorCoveredFeeCents = coverFees ? Math.max(0, chargeCents - giftAmountCents) : 0;
  const balanceNetCents = numericCents(balanceTransaction?.net);
  const parishNetCents = balanceNetCents || Math.max(0, chargeCents - totalFeeCents);
  const paymentMethod = charge?.payment_method_details?.type || fallback.paymentMethod || "";

  return {
    amountCents: giftAmountCents,
    giftAmountCents,
    chargeCents,
    stripeFeeCents,
    estimatedStripeFeeCents: stripeFeeCents,
    agapayFeeCents,
    totalFeeCents,
    donorCoveredFeeCents,
    parishNetCents,
    coverFees,
    paymentMethod,
    stripeChargeId: charge?.id || fallback.stripeChargeId || "",
    stripeDisputed: charge?.disputed === true,
    stripeRefundedCents: numericCents(charge?.amount_refunded),
    stripeBalanceTransactionId: balanceTransaction?.id || fallback.stripeBalanceTransactionId || "",
    stripeFeeSource: balanceTransaction ? "balance_transaction" : "estimated",
    feeReconciledAt: new Date().toISOString()
  };
}

export async function refreshDonorOfferingFromStripeCheckout(env, offering = {}) {
  if (!offering.checkoutSessionId || paidOfferingStatus(offering)) return offering;

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) return offering;

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(offering.checkoutSessionId)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) return offering;

  const session = stripe.body || {};
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || "checkout_created";
  if (paymentStatus === "paid") status = "completed";
  if (session.status === "expired") status = "expired";
  const paymentIntentId = checkoutPaymentIntentId(session) || offering.stripePaymentIntentId || "";
  const feeUpdates = status === "completed" || paymentStatus === "paid"
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
    : {};

  const updated = await updateDonorOfferingByCheckout(env, offering.checkoutSessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || "",
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || "",
    completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
    ...feeUpdates
  });

  if (status === "completed" || paymentStatus === "paid") {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created ? new Date(session.created * 1000).toISOString() : offering.createdAt || new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updated || offering);
  }

  return updated || offering;
}

export async function reconcilePendingDonorOfferings(env, offerings = [], limit = 8) {
  const reconciled = [];
  let checked = 0;

  for (const offering of offerings) {
    if (
      checked < limit
      && offering.checkoutSessionId
      && !paidOfferingStatus(offering)
      && !["failed", "expired", "cancelled", "refunded"].includes(String(offering.paymentStatus || offering.status || "").toLowerCase())
    ) {
      checked += 1;
      reconciled.push(await refreshDonorOfferingFromStripeCheckout(env, offering));
    } else {
      reconciled.push(offering);
    }
  }

  return reconciled.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function paidCommemorationOfferingWithNames(offering = {}) {
  const giftType = String(offering.giftType || "").toLowerCase();
  if (giftType !== "commemoration") return false;
  if (!paidOfferingStatus(offering)) return false;
  return Boolean(splitSubmittedNames(offering.namesLiving).length || splitSubmittedNames(offering.namesDeparted).length);
}

export async function repairMissingDonorCommemorationsFromOfferings(env, email, offerings = []) {
  const paidCommemorations = offerings.filter(paidCommemorationOfferingWithNames);
  if (!paidCommemorations.length) return [];

  const existing = await loadDonorCommemorations(env, email, Math.max(1000, paidCommemorations.length + 100));
  const existingSources = new Set(existing.map((entry) => entry.sourceId || entry.id).filter(Boolean));
  const repaired = [];

  for (const offering of paidCommemorations) {
    const sourceId = commemorationSourceIdFromOffering(offering);
    if (existingSources.has(sourceId)) continue;
    const entry = await ensureCommemorationEntryFromOffering(env, offering, {
      id: sourceId,
      checkoutSessionId: offering.checkoutSessionId || "",
      parishId: offering.parishId || "",
      parishName: offering.parishName || "",
      donorEmail: offering.donorEmail || email || "",
      donorName: offering.donorName || "",
      giftType: "commemoration",
      frequency: offering.frequency || "once",
      amountCents: offering.amountCents || 0,
      namesLiving: offering.namesLiving || "",
      namesDeparted: offering.namesDeparted || "",
      createdAt: offering.completedAt || offering.createdAt || new Date().toISOString()
    });
    if (entry) {
      existingSources.add(entry.sourceId || entry.id);
      repaired.push(entry);
    }
  }

  return repaired;
}

export async function loadReconciledDonorCommemorations(env, email, offerings = null, limit = 100) {
  const donorOfferings = offerings || await loadDonorOfferings(env, email, Math.max(limit, 100));
  await repairMissingDonorCommemorationsFromOfferings(env, email, donorOfferings);
  return loadDonorCommemorations(env, email, limit);
}

export function donorSummaryFromOfferings(offerings, commemorations = []) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const ytd = offerings.filter((item) => new Date(item.createdAt || 0).getUTCFullYear() === year);
  const paid = ytd.filter(paidOfferingStatus);
  const recurring = offerings.filter((item) => item.frequency && item.frequency !== "once");
  const ytdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetYtdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  const feeSavingsCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).donorCoveredFeeCents, 0);
  const feeCoveredCount = paid.filter((item) => offeringFeeBreakdown(item).coverFees).length;
  // "Stewardship" giving = tithes / general parish offerings only. Excludes designated
  // funds, campaigns, candles, and commemorations — those are separate offering types
  // and should not count toward a donor's annual pledge progress. Offerings without a
  // giftType predate giftType tracking and are treated as stewardship, matching how
  // they're normalized everywhere else in the app.
  const isStewardshipOffering = (item) =>
    ["stewardship", "general"].includes(String(item.giftType || "stewardship").toLowerCase());
  const stewardshipPaid = paid.filter(isStewardshipOffering);
  const stewardshipYtdCents = stewardshipPaid.reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const monthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetMonthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  const stewardshipMonthCents = stewardshipPaid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  return {
    year,
    ytdCents,
    monthCents,
    parishNetYtdCents,
    parishNetMonthCents,
    stewardshipYtdCents,
    stewardshipMonthCents,
    feeSavingsCents,
    feeCoveragePercent: paid.length ? Math.round((feeCoveredCount / paid.length) * 100) : 0,
    offeringCount: ytd.length,
    paidOfferingCount: paid.length,
    recurringCount: recurring.length,
    commemorationCount: commemorations.reduce((sum, entry) => sum + (entry.living?.length || 0) + (entry.departed?.length || 0), 0),
    lastOfferingAt: offerings[0]?.createdAt || ""
  };
}

export function publicDonorOffering(offering = {}) {
  const fees = offeringFeeBreakdown(offering);
  return {
    ...offering,
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees
  };
}


export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeJurisdiction(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("rocor") || normalized.includes("russian orthodox church outside russia")) return "rocor";
  if (normalized.includes("orthodox church in america") || normalized === "oca") return "oca";
  if (normalized.includes("antiochian")) return "antiochian";
  if (normalized.includes("greek") || normalized.includes("goa")) return "goa";
  if (normalized.includes("serbian")) return "serbian";
  if (normalized.includes("romanian")) return "romanian";
  if (normalized.includes("bulgarian")) return "bulgarian";
  if (normalized.includes("ukrainian")) return "ukrainian";
  return slugify(value || "other");
}

export function communitySketchImage(type) {
  if (type === "monastery") return "/images/giving/monastery-square.png";
  if (type === "mission") return "/images/giving/mission-church-square.png";
  return "/images/giving/parish-church-square.png";
}

export function communitySketchAlt(type) {
  if (type === "monastery") return "Orthodox monastery sketch";
  if (type === "mission") return "Orthodox mission church sketch";
  return "Orthodox parish church sketch";
}

export function parishFromRegistration(registration) {
  if (!registration) return null;
  registration = mergeStewardshipFundsIntoRegistration(registration).registration;
  const id = registration.parishId || parishSlug(registration.parishName, registration.city);
  if (!id || registration.status !== "verified") return null;
  if (registration.givingStatus && registration.givingStatus !== "active") return null;
  const type = normalizeCommunityType(registration.communityType);
  const givingPlus = givingFeatureAccess(registration, "branding");
  const starterDesignatedFund = givingFeatureAccess(registration, "starterDesignatedFund");
  const candleGiving = givingFeatureAccess(registration, "candles");
  const configuredFunds = Array.isArray(registration.funds) ? registration.funds.filter((fund) => fund && fund.enabled !== false && fund.active !== false) : [];
  const generalFund = configuredFunds.find(isGeneralGivingFund) || {
    id: "general",
    name: "General Operating Fund",
    description: "Utilities, supplies, ministries, and day-to-day parish needs."
  };
  const designatedFunds = configuredFunds.filter((fund) => !isGeneralGivingFund(fund) && !isCandleGivingFund(fund));
  const publicFunds = givingPlus
    ? (configuredFunds.length ? configuredFunds : [generalFund])
    : [generalFund, ...(starterDesignatedFund ? designatedFunds.slice(0, 1) : [])];

  return {
    id,
    name: registration.parishName,
    type,
    jurisdiction: normalizeJurisdiction(registration.jurisdiction || "other"),
    jurisdictionLabel: registration.jurisdiction || "Other canonical jurisdiction",
    city: registration.city || "",
    state: registration.state || "",
    status: "verified",
    givingStatus: registration.givingStatus || "active",
    source: "registration",
    logoUrl: givingPlus ? registration.logoUrl || "" : "",
    imageUrl: (givingPlus ? registration.logoUrl : "") || registration.imageUrl || registration.photoUrl || communitySketchImage(type),
    imageAlt: givingPlus && registration.logoUrl
      ? `${registration.parishName || "Orthodox community"} logo`
      : registration.imageAlt || communitySketchAlt(type),
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    koinoniaCalendarUrl: registration.koinoniaCalendarUrl || "",
    patronalFeast: registration.patronalFeast || "",
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || "",
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || "",
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    givingPlusEnabled: givingPlus,
    designatedFundsEnabled: starterDesignatedFund && publicFunds.some((fund) => !isGeneralGivingFund(fund)),
    candlesEnabled: candleGiving && (registration.candlesEnabled ?? true),
    commemorationsEnabled: givingPlus && (registration.commemorationsEnabled ?? true),
    sacramentsEnabled: sacramentsEnabledFor(registration),
    bookstoreEnabled: bookstoreEnabledFor(registration),
    processingFeeSchedules: publicPaymentFeeSchedules(),
    funds: publicFunds,
    campaigns: givingPlus && Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: givingPlus && Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
}

export function isGeneralGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  return keys.some((value) => ["general", "stewardship", "general operating fund", "general stewardship"].includes(value));
}

export function isCandleGivingFund(fund = {}) {
  const keys = [fund.id, fund.code, fund.reportCode, fund.name].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  return keys.some((value) => ["candle", "candles", "candles / vigil lights", "candle fund"].includes(value));
}

export function starterFundCatalogError(funds = []) {
  const active = (Array.isArray(funds) ? funds : []).filter((fund) => fund && fund.enabled !== false && fund.active !== false);
  const generalCount = active.filter(isGeneralGivingFund).length;
  const designatedCount = active.filter((fund) => !isGeneralGivingFund(fund) && !isCandleGivingFund(fund)).length;
  const candleCount = active.filter(isCandleGivingFund).length;
  if (generalCount !== 1) return "Starter must keep exactly one active General Operating Fund.";
  if (candleCount > 1) return "Starter can keep only one active Candle Fund.";
  if (designatedCount > 1) return "Starter includes one active designated fund. Upgrade to Giving Plus for additional funds.";
  return "";
}

export function normalizeCommunityType(value) {
  const normalized = String(value || "parish").toLowerCase();
  if (normalized.includes("monastery") || normalized.includes("skete")) return "monastery";
  if (normalized.includes("mission")) return "mission";
  return "parish";
}

export async function saveRegistrationRecord(env, reference, registration, previous = null) {
  if (!reference) return registration;
  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const previousParishId = previous ? previous.parishId || parishSlug(previous.parishName, previous.city) : "";

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
      registration.status || "pending",
      registration.parishName || "",
      registration.communityType || "",
      registration.stripeAccountId || "",
      registration.stripeSubscriptionId || "",
      registration.receivedAt || "",
      registration.reviewedAt || registration.parishUpdatedAt || registration.subscriptionUpdatedAt || new Date().toISOString(),
      JSON.stringify(registration)
    );
    return registration;
  }

  if (hasProductionStore(env)) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
    if (parishId) await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), reference);
    if (previousParishId && previousParishId !== parishId) await env.AGAPAY_REGISTRATIONS.delete(parishIdIndexKey(previousParishId));

    if (registration.stripeAccountId) await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(registration.stripeAccountId), reference);
    if (previous?.stripeAccountId && previous.stripeAccountId !== registration.stripeAccountId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeAccountIndexKey(previous.stripeAccountId));
    }

    if (registration.stripeSubscriptionId) await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(registration.stripeSubscriptionId), reference);
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
    const row = await d1First(env, "SELECT data FROM registrations WHERE reference = ?1", reference);
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
  const query = String(options.query || options.q || "").trim().toLowerCase();
  const type = String(options.type || "").trim().toLowerCase();
  const jurisdiction = String(options.jurisdiction || "").trim().toLowerCase();

  if (d1(env)) {
    const where = ["status = 'verified'"];
    const params = [];

    if (cursor) {
      where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
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
       WHERE ${where.join(" AND ")}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const parishes = pageRows
      .map(safeParseJsonRow)
      .map(parishFromRegistration)
      .filter(Boolean);
    return {
      parishes,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { parishes: [], cursor: null, hasMore: false, limit, source: "none" };

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

  return { parishes: verified, cursor: null, hasMore: false, limit, source: "kv" };
}

export async function verifiedRegistrationParishes(env, options = {}) {
  const page = await loadVerifiedRegistrationParishPage(env, options);
  return page.parishes;
}

export async function findRegistrationByParishId(env, parishId) {
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
    const row = await d1First(env, "SELECT reference, data FROM registrations WHERE stripe_subscription_id = ?1 LIMIT 1", subscriptionId);
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
    const row = await d1First(env, "SELECT reference, data FROM registrations WHERE stripe_account_id = ?1 LIMIT 1", stripeAccountId);
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
    stripeAccountId: found.registration.stripeAccountId || ""
  };
}

export async function findOrCreateDonorCustomer(env, parish, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const name = donorName(body);
  const stripeAccountId = parish.stripeAccountId || "";

  const customerPath = `/v1/customers?email=${encodeURIComponent(email)}&limit=1`;
  const lookup = stripeAccountId
    ? await stripeGetConnectedRequest(env, customerPath, stripeAccountId)
    : await stripeGetRequest(env, customerPath);

  if (!lookup.ok) return lookup;

  const existing = Array.isArray(lookup.body.data)
    ? lookup.body.data.find((customer) => !customer.deleted)
    : null;
  if (existing?.id) return { ok: true, body: existing };

  const customerForm = new URLSearchParams({
    email,
    name,
    "metadata[agapay_parish_id]": parish.id,
    "metadata[agapay_parish_name]": parish.name || "",
    "metadata[agapay_donor_first_name]": body.firstName || "",
    "metadata[agapay_donor_last_name]": body.lastName || ""
  });

  return stripeFormConnectedRequest(env, "/v1/customers", customerForm, stripeAccountId);
}

export function paidOffering(offering) {
  return paidOfferingStatus(offering);
}

export function giftDisplayName(offering = {}) {
  const pieces = [offering.firstName, offering.lastName].filter(Boolean);
  return pieces.join(" ").trim() || offering.donorName || "";
}

export function publicParishGiftFromOffering(offering = {}) {
  const living = Array.isArray(offering.living)
    ? offering.living
    : String(offering.namesLiving || "").split(/\n+/).map((name) => name.trim()).filter(Boolean);
  const departed = Array.isArray(offering.departed)
    ? offering.departed
    : String(offering.namesDeparted || "").split(/\n+/).map((name) => name.trim()).filter(Boolean);
  const fees = offeringFeeBreakdown(offering);
  return {
    id: offering.id || offering.checkoutSessionId || offering.paymentIntentId || "",
    date: offering.createdAt || offering.paidAt || offering.updatedAt || "",
    createdAt: offering.createdAt || offering.paidAt || offering.updatedAt || "",
    amountCents: fees.parishNetCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    donorName: giftDisplayName(offering),
    donorEmail: offering.email || offering.donorEmail || "",
    fund: ["stewardship", "general"].includes(String(offering.giftType || "").toLowerCase())
      ? "General Operating Fund"
      : offering.fund || offering.fundId || "",
    fundId: ["stewardship", "general"].includes(String(offering.giftType || "").toLowerCase())
      ? "general"
      : offering.fundId || offering.fund || "",
    campaign: offering.campaign || offering.campaignId || "",
    campaignId: offering.campaignId || offering.campaign || "",
    description: offering.description || offering.campaignDescription || offering.inMemoriam || "",
    giftType: offering.giftType || "offering",
    frequency: offering.frequency || "once",
    recurring: Boolean(offering.frequency && offering.frequency !== "once"),
    type: offering.frequency && offering.frequency !== "once" ? "recurring" : "one_time",
    commemorationNames: [...living, ...departed],
    commemorationKind: offering.commemorationKind || ""
  };
}

export async function loadParishPaidOfferings(env, parishId, limit = 500) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT id, data, status, payment_status, created_at, updated_at
       FROM donor_offerings
       WHERE parish_id = ?1
          AND (payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'complete', 'completed'))
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows
      .map((row) => {
        const offering = parseJsonRow(row);
        if (!offering) return null;
        return {
          ...offering,
          id: offering.id || row.id || "",
          status: offering.status || row.status || "",
          paymentStatus: offering.paymentStatus || row.payment_status || "",
          createdAt: offering.createdAt || row.created_at || "",
          updatedAt: offering.updatedAt || row.updated_at || ""
        };
      })
      .filter(Boolean)
      .filter(paidOffering)
      .map(publicParishGiftFromOffering);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const gifts = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if ((offering.parishId || offering.parish_id) === parishId && paidOffering(offering)) {
        gifts.push(publicParishGiftFromOffering(offering));
      }
    } catch {}
  }
  return gifts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

export function recurringOfferingStatus(offering = {}) {
  const status = String(offering.status || "").toLowerCase();
  const paymentStatus = String(offering.paymentStatus || "").toLowerCase();
  if (["failed", "payment_failed", "past_due"].includes(status) || ["failed", "past_due"].includes(paymentStatus)) return "failed";
  if (["cancelled", "canceled"].includes(status) || ["cancelled", "canceled"].includes(paymentStatus)) return "cancelled";
  if (paidOfferingStatus(offering)) return "active";
  return "pending";
}

export function recurringHealthGroupKey(offering = {}) {
  return offering.stripeSubscriptionId
    || offering.stripe_subscription_id
    || [
      normalizeEmail(offering.donorEmail || offering.email || ""),
      offering.frequency || "recurring",
      offering.amountCents || "",
      offering.giftType || "",
      offering.fund || "",
      offering.campaign || ""
    ].join("|");
}

export function recurringExpectedDays(frequency = "") {
  const normalized = String(frequency || "").toLowerCase();
  if (normalized === "weekly") return 10;
  if (normalized === "biweekly") return 24;
  if (normalized === "quarterly") return 110;
  if (normalized === "yearly" || normalized === "annual") return 400;
  return 45;
}

export async function loadParishRecurringOfferings(env, parishId, limit = 1000) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT id, data, status, payment_status, stripe_subscription_id, created_at, updated_at
       FROM donor_offerings
       WHERE parish_id = ?1
         AND (
           COALESCE(stripe_subscription_id, '') != ''
           OR COALESCE(json_extract(data, '$.frequency'), 'once') != 'once'
         )
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows.map((row) => {
      const offering = parseJsonRow(row);
      if (!offering) return null;
      return {
        ...offering,
        id: offering.id || row.id || "",
        status: offering.status || row.status || "",
        paymentStatus: offering.paymentStatus || row.payment_status || "",
        stripeSubscriptionId: offering.stripeSubscriptionId || row.stripe_subscription_id || "",
        createdAt: offering.createdAt || row.created_at || "",
        updatedAt: offering.updatedAt || row.updated_at || ""
      };
    }).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const offerings = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (
        (offering.parishId || offering.parish_id) === parishId
        && (offering.stripeSubscriptionId || (offering.frequency && offering.frequency !== "once"))
      ) {
        offerings.push(offering);
      }
    } catch {}
  }
  return offerings.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit);
}

export function summarizeParishRecurringHealth(records = []) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const groups = new Map();

  for (const offering of records) {
    const key = recurringHealthGroupKey(offering);
    if (!key) continue;
    const status = recurringOfferingStatus(offering);
    const dateValue = offering.completedAt || offering.failedAt || offering.updatedAt || offering.createdAt || "";
    const timestamp = dateValue ? new Date(dateValue) : null;
    const group = groups.get(key) || {
      key,
      donorName: giftDisplayName(offering) || offering.donorName || "Anonymous donor",
      donorEmail: offering.donorEmail || offering.email || "",
      amountCents: Number(offering.amountCents || 0),
      frequency: offering.frequency || "recurring",
      giftType: offering.giftType || "recurring",
      fund: offering.fund || offering.campaign || offering.title || "",
      stripeSubscriptionId: offering.stripeSubscriptionId || "",
      lastPaidAt: "",
      lastFailureAt: "",
      failureMessage: ""
    };

    if (!group.stripeSubscriptionId && offering.stripeSubscriptionId) group.stripeSubscriptionId = offering.stripeSubscriptionId;
    if (!group.donorEmail && offering.donorEmail) group.donorEmail = offering.donorEmail;
    if (!group.fund && (offering.fund || offering.campaign || offering.title)) group.fund = offering.fund || offering.campaign || offering.title;
    if (!group.amountCents && offering.amountCents) group.amountCents = Number(offering.amountCents || 0);

    if (status === "active" && timestamp && (!group.lastPaidAt || timestamp > new Date(group.lastPaidAt))) {
      group.lastPaidAt = timestamp.toISOString();
      group.amountCents = Number(offering.amountCents || group.amountCents || 0);
    }
    if ((status === "failed" || status === "cancelled") && timestamp && (!group.lastFailureAt || timestamp > new Date(group.lastFailureAt))) {
      group.lastFailureAt = timestamp.toISOString();
      group.failureMessage = offering.failureMessage || (status === "cancelled" ? "Recurring gift cancelled." : "Recurring payment failed.");
    }

    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).map((group) => {
    const paidAt = group.lastPaidAt ? new Date(group.lastPaidAt) : null;
    const failureAt = group.lastFailureAt ? new Date(group.lastFailureAt) : null;
    const expectedDays = recurringExpectedDays(group.frequency);
    const daysSincePaid = paidAt ? Math.floor((now.getTime() - paidAt.getTime()) / 86400000) : null;
    const recoveredAfterFailure = Boolean(paidAt && failureAt && paidAt > failureAt);
    const failedThisMonth = Boolean(failureAt && failureAt >= monthStart && !recoveredAfterFailure);
    const lapsed = Boolean(!failedThisMonth && (!paidAt || daysSincePaid > expectedDays));
    return {
      ...group,
      status: failedThisMonth ? "failed" : lapsed ? "lapsed" : "active",
      daysSincePaid,
      expectedDays
    };
  });

  rows.sort((a, b) => {
    const order = { failed: 0, lapsed: 1, active: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      || String(b.lastFailureAt || b.lastPaidAt || "").localeCompare(String(a.lastFailureAt || a.lastPaidAt || ""));
  });

  return {
    activeCount: rows.filter((row) => row.status === "active").length,
    failedThisMonthCount: rows.filter((row) => row.status === "failed").length,
    lapsedCount: rows.filter((row) => row.status === "lapsed").length,
    monthlyRecurringCents: rows
      .filter((row) => row.status === "active")
      .reduce((sum, row) => sum + Number(row.amountCents || 0), 0),
    generatedAt: now.toISOString(),
    rows
  };
}

export async function handleRegistrations(request, env) {
  const limited = await rateLimit(request, env, "registrations", { limit: 6, windowSeconds: 600 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  body = sanitizePublicRegistrationInput(body);
  if (body.canonicalAgreement !== true) return json({ error: "Authorization and agreement to the Terms of Service are required." }, { status: 422 });

  const requiredFields = [
    "communityType",
    "parishName",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "subscriptionTier",
    "priestFirst",
    "priestEmail",
    "priestPhone",
    "treasurerFirst",
    "treasurerEmail",
    "acceptingName", "acceptingEmail", "acceptingRole"
  ];

  if (registrationRequiresJurisdiction(body.communityType)) requiredFields.push("jurisdiction");
  if (registrationRequiresWebsite(body.communityType)) requiredFields.push("website");
  if (registrationRequiresValuesReview(body.communityType)) requiredFields.push("organizationDescription");

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@") || !String(body.acceptingEmail).includes("@")) {
    return json({ error: "A valid primary contact and finance contact email are required" }, { status: 422 });
  }

  const communityType = String(body.communityType || "");
  const requestedTier = String(body.subscriptionTier || "").trim().toLowerCase();
  const selectableParishTiers = new Set(["starter", "giving", "stewardship", "parish"]);
  const validTierForCommunity = communityType === "Cathedral"
    ? requestedTier === "diocese"
    : communityType === "Monastery"
      ? requestedTier === "monastery_free"
      : selectableParishTiers.has(requestedTier);
  if (!validTierForCommunity) {
    return json({ error: "Choose a valid starting tier for this community type." }, { status: 422 });
  }

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`, receivedAt = new Date().toISOString();
  const subscriptionTierId = requestedTier;
  const tier = subscriptionTier(subscriptionTierId) || subscriptionTier(defaultSubscriptionTier(body));
  const baseParishId = parishSlug(body.parishName, body.city);
  let parishId = baseParishId;
  if (await findRegistrationByParishId(env, parishId)) {
    const stateSuffix = slugify(body.state);
    parishId = stateSuffix ? `${baseParishId}-${stateSuffix}`.slice(0, 80) : baseParishId;
    let collision = await findRegistrationByParishId(env, parishId);
    let suffix = 2;
    while (collision && suffix < 100) {
      parishId = `${baseParishId}-${stateSuffix ? `${stateSuffix}-` : ""}${suffix}`.slice(0, 80);
      collision = await findRegistrationByParishId(env, parishId);
      suffix += 1;
    }
    if (collision) return json({ error: "Unable to create a unique parish ID. Please contact AGAPAY support." }, { status: 409 });
  }
  const parishDashboardToken = generateDashboardToken();
  const registrationWithTier = {
    ...body,
    reference,
    status: "pending",
    receivedAt,
    canonicalVerification: "pending_review",
    parishId,
    parishUsername: parishId,
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: receivedAt,
    ...registrationAgreementEvidence(receivedAt),
    subscriptionTier: tier?.id || "parish",
    subscriptionStatus: tier?.monthlyCents === 0 ? "free_forever" : "not_started",
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || ""
  };
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
      sendRegistrationConfirmation(env, appUrl, registration)
    ]);
    await saveRegistrationRecord(env, reference, {
      ...registration,
      adminNotificationEmailStatus: notice.status,
      adminNotificationEmailId: notice.id || "",
      adminNotificationEmailDetail: notice.detail || "",
      adminNotificationEmailSentAt: notice.status === "sent" ? new Date().toISOString() : "",
      confirmationEmailStatus: confirmation.status,
      confirmationEmailId: confirmation.id || "",
      confirmationEmailSentAt: confirmation.status === "sent" ? new Date().toISOString() : ""
    }, registration);

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
    if (exemptionInput && (exemptionInput.claimsExemption === true || exemptionInput.claimsExemption === "yes")) {
      try {
        const jurisdiction = String(exemptionInput.jurisdiction || "").trim().toUpperCase();
        const repName = String(exemptionInput.authorizedRepresentativeName || "").trim();
        const repTitle = String(exemptionInput.authorizedRepresentativeTitle || "").trim();
        if (!jurisdiction) throw new Error("Exemption jurisdiction is required.");
        if (!repName || !repTitle) throw new Error("Authorized representative name and title are required.");
        if (exemptionInput.certified !== true) throw new Error("You must certify the exemption claim.");
        if (jurisdiction === "OTHER" && !String(exemptionInput.multistateExplanation || "").trim()) {
          throw new Error("Please explain the jurisdiction or multistate use this exemption relates to.");
        }

        const taxExemptionId = await createTaxExemptionClaim(env, {
          registrationReference: reference,
          parishId,
          jurisdiction,
          exemptionType: String(exemptionInput.exemptionType || "").trim() || "religious_organization",
          certificateNumber: exemptionInput.certificateNumber || "",
          effectiveDate: exemptionInput.effectiveDate || "",
          expirationDate: exemptionInput.expirationDate || "",
          authorizedRepresentativeName: repName,
          authorizedRepresentativeTitle: repTitle,
          actorUserId: body.treasurerEmail || body.priestEmail || "",
          internalReviewStatus: jurisdiction === "OTHER" ? "needs_manual_review" : null
        });
        if (d1(env)) {
          await d1Run(env, `UPDATE registrations SET tax_exemption_status = 'pending', current_tax_exemption_id = ?1 WHERE reference = ?2`, taxExemptionId, reference);
        }

        const upload = await issueClaimUploadToken(env, taxExemptionId);
        taxExemptionResult = {
          ok: true,
          taxExemptionId,
          uploadRequired: true,
          uploadToken: upload.token,
          uploadTokenExpiresAt: upload.expiresAt,
          uploadUrl: `/api/tax-exemption/${encodeURIComponent(taxExemptionId)}/upload`
        };
      } catch (exemptionError) {
        taxExemptionResult = { ok: false, error: exemptionError.message || "Could not submit exemption claim." };
      }
    }
  }

  return json(
    {
      ok: true,
      reference,
      mode: hasProductionStore(env) ? "stored" : "demo",
      message: "Registration received. AGAPAY will review the organization before activation.",
      ...(taxExemptionResult ? { taxExemption: taxExemptionResult } : {})
    },
    { status: 201 }
  );
}

export async function handleCheckout(request, env) {
  const limited = await rateLimit(request, env, "checkout", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const missing = requireFields(body, ["parishId", "giftType", "amount", "firstName", "email"]);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return json({ error: donationAmountError(body.amount) }, { status: 422 });

  const parish = await findCheckoutParish(env, body.parishId);
  if (!parish || parish.status !== "verified") return json({ error: "Verified parish not found" }, { status: 404 });
  const giftTypeAliases = { candle: "candles", funds: "fund", love: "commemoration", alms: "feast" };
  const rawGiftType = String(body.giftType || "").trim().toLowerCase();
  const requestedGiftType = giftTypeAliases[rawGiftType] || rawGiftType;
  const permittedGiftType = ["stewardship", "general"].includes(requestedGiftType)
    || (requestedGiftType === "fund" && parish.designatedFundsEnabled)
    || (requestedGiftType === "candles" && parish.candlesEnabled)
    || (parish.givingPlusEnabled && ["commemoration", "campaign", "feast"].includes(requestedGiftType));
  if (!permittedGiftType) {
    return json({ error: "This offering type is available with Giving Plus." }, { status: 403 });
  }

  const requestedFundKey = String(body.fundId || body.fund || "").trim();
  const requestedFund = requestedGiftType === "fund"
    ? (Array.isArray(parish.funds) ? parish.funds : []).find((fund) =>
      !isGeneralGivingFund(fund) && !isCandleGivingFund(fund)
      && [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(requestedFundKey)
    )
    : null;
  if (requestedGiftType === "fund" && !requestedFund) {
    return json({ error: "Choose the active designated fund offered by this parish." }, { status: 422 });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      mode: "demo",
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions."
    });
  }

  if (!parish.stripeAccountId) {
    return json(
      { error: "Parish Stripe account is not connected yet", detail: "This parish needs to complete Stripe onboarding before it can receive donations." },
      { status: 422 }
    );
  }

  const recurring = body.frequency && body.frequency !== "once";
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const normalizedDonorEmail = normalizeEmail(body.email);
  const normalizedGiftType = requestedGiftType;
  const checkoutGiftType = requestedGiftType;
  const commemorationKind = checkoutGiftType === "commemoration"
    && String(body.commemorationKind || "") === "molieben_panikhida"
    ? "molieben_panikhida"
    : "proskomedia_liturgy";
  const isFestalAlms = ["alms", "feast"].includes(normalizedGiftType);
  const isGeneralStewardship = ["stewardship", "general"].includes(checkoutGiftType);
  const requestedCampaignId = String(body.campaignId || body.campaign || "").trim();
  const checkoutFeastCampaigns = isFestalAlms
    ? activeFestalAlmsCampaigns(parish.feastCampaigns, parish.liturgicalCalendar)
    : [];
  const feastCampaign = isFestalAlms
    ? checkoutFeastCampaigns.find((campaign) =>
      [campaign?.id, campaign?.feastId, campaign?.name, campaign?.campaignName]
        .filter(Boolean).map(String).includes(requestedCampaignId)
    )
    : null;
  const destinationFundId = String(feastCampaign?.destinationFundId || "benevolence-fund");
  const destinationFund = isFestalAlms
    ? (Array.isArray(parish.funds) ? parish.funds : []).find((fund) =>
      [fund?.id, fund?.code, fund?.name].filter(Boolean).map(String).includes(destinationFundId)
    )
    : null;
  const candleFund = requestedGiftType === "candles"
    ? (Array.isArray(parish.funds) ? parish.funds : []).find(isCandleGivingFund)
    : null;
  const checkoutFund = isFestalAlms
    ? destinationFund?.name || "Benevolence Fund"
    : isGeneralStewardship ? "General Operating Fund" : requestedGiftType === "candles" ? candleFund?.name || "Candles / Vigil Lights" : requestedFund?.name || "";
  const checkoutFundId = isFestalAlms
    ? destinationFund?.id || destinationFund?.code || "benevolence-fund"
    : isGeneralStewardship ? "general" : requestedGiftType === "candles" ? candleFund?.id || candleFund?.code || "candle" : requestedFund?.id || requestedFund?.code || "";
  const checkoutCampaign = isFestalAlms
    ? feastCampaign?.campaignName || feastCampaign?.name || body.campaign || ""
    : body.campaign || "";
  const checkoutCampaignId = isFestalAlms
    ? feastCampaign?.id || feastCampaign?.feastId || requestedCampaignId
    : body.campaignId || body.campaign || "";
  const donor = await requireDonor(request, env);
  const donorDashboardReturn = Boolean(donor?.email && normalizeEmail(donor.email) === normalizedDonorEmail);
  const campaignPageCheckout = String(body.source || "").toLowerCase() === "campaign_page";
  const returnPath = String(body.returnPath || "").startsWith("/") ? String(body.returnPath) : "";
  const successUrl = donorDashboardReturn
    ? `${appUrl}/myagapay?gift_success=1&session_id={CHECKOUT_SESSION_ID}`
    : campaignPageCheckout
    ? `${appUrl}/give/${encodeURIComponent(parish.id)}?giftType=campaign&campaign=${encodeURIComponent(body.campaign || "")}&success=1&session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/give/${encodeURIComponent(parish.id)}?success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = donorDashboardReturn
    ? `${appUrl}/myagapay/giving/give?checkout_canceled=1`
    : campaignPageCheckout && returnPath
    ? `${appUrl}${returnPath}${returnPath.includes("?") ? "&" : "?"}checkout_canceled=1`
    : `${appUrl}/give/${encodeURIComponent(parish.id)}?canceled=1`;
  const {
    chargeCents,
    estimatedStripeFeeCents,
    agapayFeeCents,
    totalTransactionFeeCents,
    paymentMethod
  } = checkoutFinancials(amountCents, Boolean(body.coverFees), recurring, body.paymentMethod);
  const giftLabel = checkoutGiftType.replace(/-/g, " ");
  const normalizedDonorName = donorName(body);
  const customer = await findOrCreateDonorCustomer(env, parish, body);
  if (!customer.ok) {
    return json(
      { error: "Stripe customer setup failed", detail: customer.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const checkoutMetadata = {
    public_anonymous: publicBoolean(body.publicAnonymous) ? "true" : "false",
    public_display_name: publicBoolean(body.publicAnonymous) ? "Anonymous" : normalizedDonorName,
    public_comment: publicComment(body.publicComment),
    agapay_payment_class: "qualifying_donation",
    agapay_classification_version: "1",
    parish_id: parish.id,
    parish_name: parish.name || "",
    stripe_customer_id: customer.body.id || "",
    donor_email: normalizedDonorEmail,
    donor_name: normalizedDonorName,
    donor_first_name: body.firstName || "",
    donor_last_name: body.lastName || "",
    gift_type: checkoutGiftType,
    commemoration_kind: checkoutGiftType === "commemoration" ? commemorationKind : "",
    fund: checkoutFund,
    fund_id: checkoutFundId,
    feast_description: body.feastDescription || "",
    in_memoriam: body.inMemoriam || "",
    campaign: checkoutCampaign,
    campaign_id: checkoutCampaignId,
    campaign_description: body.campaignDescription || "",
    frequency: body.frequency || "once",
    amount_cents: String(amountCents),
    charge_cents: String(chargeCents),
    agapay_fee_cents: String(agapayFeeCents),
    estimated_stripe_fee_cents: String(estimatedStripeFeeCents),
    total_fee_cents: String(totalTransactionFeeCents),
    payment_method: paymentMethod,
    cover_fees: body.coverFees ? "true" : "false",
    names_living: body.namesLiving || "",
    names_departed: body.namesDeparted || ""
  };

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customer.body.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  });

  form.set("payment_method_types[0]", paymentMethod === "ach" ? "us_bank_account" : "card");

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

  // on_behalf_of ensures card statement descriptors and branding show the
  // parish's name rather than AGAPAY's. Required for correct Stripe Connect
  // settlement and dispute ownership on standard connected accounts.
  if (parish.stripeAccountId) {
    if (recurring) {
      form.set("subscription_data[on_behalf_of]", parish.stripeAccountId);
    } else {
      form.set("payment_intent_data[on_behalf_of]", parish.stripeAccountId);
    }
  }

  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", body.frequency === "weekly" || body.frequency === "biweekly" ? "week" : "month");
    if (body.frequency === "biweekly") form.set("line_items[0][price_data][recurring][interval_count]", "2");
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (parish.stripeAccountId) headers["Stripe-Account"] = parish.stripeAccountId;

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: form
  });
  const stripeBody = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return json(
      { error: "Stripe checkout session failed", detail: stripeBody.error?.message || "Unknown Stripe error" },
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
    campaignDescription: body.campaignDescription || "",
    publicAnonymous: publicBoolean(body.publicAnonymous),
    publicDisplayName: publicBoolean(body.publicAnonymous) ? "Anonymous" : normalizedDonorName,
    publicComment: publicComment(body.publicComment),
    feastDescription: body.feastDescription || "",
    inMemoriam: body.inMemoriam || "",
    frequency: body.frequency || "once",
    amountCents,
    chargeCents,
    agapayFeeCents,
    estimatedStripeFeeCents,
    paymentMethod,
    coverFees: Boolean(body.coverFees),
    status: "checkout_created",
    paymentStatus: "pending",
    checkoutSessionId: stripeBody.id,
    checkoutUrl: stripeBody.url || "",
    stripeCustomerId: customer.body.id || "",
    namesLiving: body.namesLiving || "",
    namesDeparted: body.namesDeparted || "",
    commemorationKind: checkoutGiftType === "commemoration" ? commemorationKind : ""
  });

  return json({ id: stripeBody.id, url: stripeBody.url }, { status: 201 });
}

export async function handleCheckoutSessionStatus(request, env) {
  const limited = await rateLimit(request, env, "checkout-status", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;

  const url = new URL(request.url);
  let sessionId = url.searchParams.get("session_id") || "";
  if (!sessionId && request.method === "POST") {
    try {
      const body = await request.json();
      sessionId = body.sessionId || body.session_id || "";
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  sessionId = String(sessionId || "").trim();
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json({ error: "Missing checkout session id" }, { status: 422 });
  }

  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) {
    return json({ error: "Checkout session is not tracked by AGAPAY" }, { status: 404 });
  }

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: "Parish Stripe account is not connected yet" }, { status: 422 });
  }

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) {
    return json(
      { error: "Unable to verify checkout session", detail: stripe.body.error?.message || "Stripe rejected the lookup" },
      { status: 502 }
    );
  }

  const session = stripe.body || {};
  const paymentIntentId = checkoutPaymentIntentId(session);
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || "checkout_created";
  if (paymentStatus === "paid") status = "completed";
  if (session.status === "expired") status = "expired";
  const feeUpdates = status === "completed" || paymentStatus === "paid"
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
    : {};

  const updated = await updateDonorOfferingByCheckout(env, sessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || "",
    stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || "",
    completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
    ...feeUpdates
  });
  if (status === "completed" || paymentStatus === "paid") {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created ? new Date(session.created * 1000).toISOString() : offering.createdAt || new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updated || {});
  }

  return json({
    ok: true,
    checkoutSessionId: sessionId,
    status: updated?.status || status,
    paymentStatus: updated?.paymentStatus || paymentStatus,
    paymentIntentId: updated?.stripePaymentIntentId || paymentIntentId || ""
  });
}

export async function handleParishStripeRefresh(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const refreshed = await refreshStripeStatusForRegistration(env, found.key, found.registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });

  return json({ ok: true, parish: parishDashboardPayload(parishId, refreshed.registration), registration: refreshed.registration });
}

export async function handleDashboardInvite(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-email-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before sending a dashboard invite" }, { status: 422 });
  }

  const parishDashboardToken = registration.parishDashboardToken || generateDashboardToken();
  const withToken = {
    ...registration,
    parishId: registration.parishId || parishSlug(registration.parishName, registration.city),
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString()
  };

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendDashboardInvite(env, appUrl, withToken);
  const updated = {
    ...withToken,
    dashboardInviteEmailStatus: email.status,
    dashboardInviteEmailId: email.id || "",
    dashboardInviteEmailDetail: email.detail || "",
    dashboardInviteEmailRecipients: email.recipients || [],
    dashboardInviteEmailSentAt: email.status === "sent" ? new Date().toISOString() : withToken.dashboardInviteEmailSentAt
  };
  const audited = appendAdminAudit(updated, "dashboard_invite_requested", adminContext.actor, {
    emailStatus: email.status || "unknown",
    recipients: email.recipients || []
  });
  await saveRegistrationRecord(env, reference, audited, withToken);

  return json({ ok: true, email, registration: audited });
}

export async function handleParishStripeOnboarding(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for giving yet" }, { status: 422 });
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
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for billing setup yet" }, { status: 422 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return createSubscriptionCheckoutForRegistration({
    request,
    env,
    reference: found.key,
    registration: found.registration,
    body,
    introductoryTrialDays: parishIntroDemoEligible(found.registration) ? PARISH_INTRO_DEMO_DAYS : 0,
    returnPath: `/parish/dashboard?parish=${encodeURIComponent(parishId)}`,
    saveRegistrationRecord
  });
}

export async function handleParishDemoTier(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (parishId !== "st-fiacre") return json({ error: "Demo tier switching is available only for St. Fiacre." }, { status: 404 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const requestedTier = String(body.subscriptionTier || "").trim().toLowerCase();
  const tier = sharedSubscriptionTier({ subscriptionTier: requestedTier });
  if (!tier || !["starter", "giving", "stewardship", "parish"].includes(tier.id)) {
    return json({ error: "Choose Starter, Giving Plus, Stewardship, or Parish for the demo." }, { status: 422 });
  }

  const current = found.registration;
  const tierUpdate = {
    ...current,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: "active",
    subscriptionTrialDays: 0,
    demoTierChangedAt: new Date().toISOString(),
    parishUpdatedAt: new Date().toISOString()
  };
  const updated = tier.modules?.givingPlus
    ? ensureBenevolenceFundInRegistration(tierUpdate).registration
    : tierUpdate;
  await saveRegistrationRecord(env, found.key, updated, current);
  return json({ ok: true, parish: parishDashboardPayload(parishId, updated) });
}

export async function handleParishSubscriptionRefresh(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const registration = found.registration;
  const sessionId = registration.stripeSubscriptionCheckoutSessionId || "";
  if (!sessionId) {
    return json({
      ok: true,
      subscriptionStatus: registration.subscriptionStatus || "not_started",
      stripeSubscriptionId: registration.stripeSubscriptionId || "",
      stripeCustomerId: registration.stripeCustomerId || ""
    });
  }

  const session = await stripeGetRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription lookup failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const stripeSession = session.body || {};
  const now = new Date().toISOString();
  const updates = {
    stripeCustomerId: stripeSession.customer || registration.stripeCustomerId || "",
    stripeSubscriptionCheckoutSessionStatus: stripeSession.status || registration.stripeSubscriptionCheckoutSessionStatus || "",
    stripeSubscriptionCheckoutPaymentStatus: stripeSession.payment_status || registration.stripeSubscriptionCheckoutPaymentStatus || "",
    subscriptionLastCheckedAt: now
  };

  if (
    stripeSession.mode === "subscription" &&
    stripeSession.subscription &&
    (stripeSession.status === "complete" || stripeSession.payment_status === "paid")
  ) {
    const trialDays = Number(registration.subscriptionTrialDays || 0);
    updates.subscriptionStatus = trialDays > 0 ? "trialing" : "active";
    updates.stripeSubscriptionId = stripeSession.subscription;
    updates.subscriptionActivatedAt = registration.subscriptionActivatedAt || now;
    if (trialDays > 0) {
      updates.subscriptionIntroDemoRedeemedAt = registration.subscriptionIntroDemoRedeemedAt || now;
      updates.subscriptionTrialStartedAt = registration.subscriptionTrialStartedAt || now;
      updates.subscriptionTrialEndsAt = registration.subscriptionTrialEndsAt
        || new Date(Date.now() + trialDays * 86400000).toISOString();
    }
  }

  const updated = {
    ...registration,
    ...updates
  };
  await saveRegistrationRecord(env, found.key, updated, registration);

  return json({
    ok: true,
    subscriptionStatus: updated.subscriptionStatus || "not_started",
    stripeSubscriptionId: updated.stripeSubscriptionId || "",
    stripeCustomerId: updated.stripeCustomerId || "",
    subscriptionTrialStartedAt: updated.subscriptionTrialStartedAt || "",
    subscriptionTrialEndsAt: updated.subscriptionTrialEndsAt || "",
    stripeSubscriptionCheckoutSessionStatus: updated.stripeSubscriptionCheckoutSessionStatus || "",
    stripeSubscriptionCheckoutPaymentStatus: updated.stripeSubscriptionCheckoutPaymentStatus || ""
  });
}

export async function handleParishSubscriptionPortal(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const body = await request.json().catch(() => ({}));
  const flow = String(body.flow || "manage").trim().toLowerCase();
  if (!["manage", "cancel"].includes(flow)) {
    return json({ error: "Invalid subscription portal flow" }, { status: 400 });
  }

  const customerId = found.registration.stripeCustomerId || "";
  if (!customerId) {
    return json(
      { error: "No billing customer found", detail: "Complete AGAPAY billing checkout before opening subscription management." },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: customerId,
    return_url: `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  });
  if (flow === "cancel") {
    const subscriptionId = found.registration.stripeSubscriptionId || "";
    if (!subscriptionId) {
      return json(
        { error: "No active subscription found", detail: "Refresh billing status before cancelling AGAPAY Give." },
        { status: 422 }
      );
    }
    form.set("flow_data[type]", "subscription_cancel");
    form.set("flow_data[subscription_cancel][subscription]", subscriptionId);
    form.set("flow_data[after_completion][type]", "redirect");
    form.set(
      "flow_data[after_completion][redirect][return_url]",
      `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}&subscription_cancelled=1`
    );
  }
  if (env.AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION) {
    form.set("configuration", env.AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION);
  }
  const session = await stripeFormRequest(env, "/v1/billing_portal/sessions", form);
  if (!session.ok) {
    return json(
      { error: "Stripe billing portal failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({ ok: true, portalUrl: session.body.url });
}


export function summarizeCharges(charges) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0
  }));
  const givers = new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = "";

  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.paid === false) continue;
    if (classifyStripeCharge(charge).paymentClass !== "qualifying_donation") continue;

    const created = new Date((charge.created || 0) * 1000);
    if (created.getUTCFullYear() !== year) continue;

    const chargeCents = numericCents(charge.amount_captured || charge.amount);
    const refundedCents = numericCents(charge.amount_refunded);
    const metadataGiftCents = numericCents(charge.metadata?.amount_cents);
    const coverFees = String(charge.metadata?.cover_fees || "").toLowerCase() === "true";
    const paymentMethod = charge.metadata?.payment_method || "";
    const balanceTransaction = typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    const agapayFeeCents = numericCents(charge.application_fee_amount || charge.metadata?.agapay_fee_cents);
    const balanceFeeCents = balanceTransaction ? numericCents(balanceTransaction.fee) : 0;
    const stripeFeeCents = balanceTransaction
      ? Math.max(0, balanceFeeCents - agapayFeeCents)
      : paymentMethod === "ach"
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

    const giverKey = charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    if (!lastGiftAt || created.toISOString() > lastGiftAt) lastGiftAt = created.toISOString();
  }

  return {
    year,
    currency: "usd",
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly
  };
}

export function parishDashboardPayload(parishId, registration) {
  const currentTier = subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration));
  const givingPlus = givingFeatureAccess(registration, "branding");
  return {
    parishId,
    parishName: registration.parishName,
    logoUrl: givingPlus ? registration.logoUrl || "" : "",
    communityType: registration.communityType,
    jurisdiction: registration.jurisdiction,
    sacramentsEnabled: Boolean(registration.sacramentsEnabled),
    addressLine1: registration.addressLine1 || "",
    addressLine2: registration.addressLine2 || "",
    city: registration.city,
    state: registration.state,
    postalCode: registration.postalCode || "",
    country: registration.country || "US",
    website: registration.website,
    taxLegalName: registration.taxLegalName || "",
    taxEin: registration.taxEin || "",
    timezone: registration.timezone || "",
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    koinoniaCalendarUrl: registration.koinoniaCalendarUrl || "",
    patronalFeast: registration.patronalFeast || "",
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || "",
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || "",
    givingStatus: registration.givingStatus || "active",
    stripeAccountId: registration.stripeAccountId || "",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    stripeChargesEnabled: Boolean(registration.stripeChargesEnabled),
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionTierLabel: currentTier?.label || registration.subscriptionTierLabel || "",
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    stripeCustomerId: registration.stripeCustomerId || "",
    stripeSubscriptionId: registration.stripeSubscriptionId || "",
    // Display the current published tier price. Stored amounts describe an
    // earlier checkout and must not leave the dashboard advertising a stale
    // plan price after the catalog changes.
    subscriptionMonthlyCents: currentTier?.monthlyCents ?? null,
    subscriptionTrialDays: Number(registration.subscriptionTrialDays || 0),
    subscriptionTrialStartedAt: registration.subscriptionTrialStartedAt || "",
    subscriptionTrialEndsAt: registration.subscriptionTrialEndsAt || "",
    subscriptionIntroDemoEligible: parishIntroDemoEligible(registration),
    parishDashboardTokenTemporary: Boolean(registration.parishDashboardTokenTemporary),
    priestEmail: registration.priestEmail || "",
    sacramentPriests: normalizeSacramentPriests(registration),
    treasurerEmail: registration.treasurerEmail || "",
    setup: {
      contactInfoVerified: true,
      stripeConnected: stripeReady(registration),
      billingActive: subscriptionReady(registration),
      temporaryPassword: Boolean(registration.parishDashboardTokenTemporary)
    },
    subscriptionTiers: publicSubscriptionTiers(),
    platformFee: registration.platformFee || "",
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    candlesEnabled: registration.candlesEnabled ?? true,
    commemorationsEnabled: registration.commemorationsEnabled ?? true,
    bookstoreEnabled: bookstoreEnabledFor(registration),
    communicationsEnabled: communicationsEnabledFor(registration),
    stewardshipActive: stewardshipToolAccess(registration),
    parishPlusIncludedInTier: tierIncludesParishPlus(registration),
    entitlements: entitlementsSummary(registration),
    funds: Array.isArray(registration.funds) ? registration.funds : [],
    campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
}

export function normalizeSacramentPriests(registration = {}) {
  const saved = Array.isArray(registration.sacramentPriests) ? registration.sacramentPriests : [];
  const rows = saved.map((priest) => ({
    name: String(priest?.name || "").trim().slice(0, 120),
    email: String(priest?.email || "").trim().slice(0, 180),
    serviceTypes: sanitizeSacramentServiceTypes(priest?.serviceTypes),
    customServices: sanitizeCustomSacramentServices(priest?.customServices)
  })).filter((priest) => priest.name);
  if (rows.length) return rows.slice(0, 12);
  const fallbackName = [registration.priestFirst, registration.priestLast].filter(Boolean).join(" ").trim() || "Parish priest";
  return [{
    name: fallbackName,
    email: registration.priestEmail || "",
    serviceTypes: defaultSacramentServiceTypes(),
    customServices: []
  }];
}

const DEFAULT_SACRAMENT_SERVICE_TYPES = [
  "house_blessing", "confession", "counseling", "baptism", "wedding"
];
const EDITABLE_SACRAMENT_SERVICE_TYPES = new Set([
  ...DEFAULT_SACRAMENT_SERVICE_TYPES, "home_visit", "office_visit", "anointing"
]);

function defaultSacramentServiceTypes() {
  return [...DEFAULT_SACRAMENT_SERVICE_TYPES];
}

function sanitizeSacramentServiceTypes(value) {
  if (!Array.isArray(value)) return defaultSacramentServiceTypes();
  return [...new Set(value.map((type) => String(type || "").trim()).filter((type) => EDITABLE_SACRAMENT_SERVICE_TYPES.has(type)))];
}

function sanitizeCustomSacramentServices(value) {
  if (!Array.isArray(value)) return [];
  return value.map((service) => ({
    id: String(service?.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80),
    label: String(service?.label || "").trim().slice(0, 120),
    mode: service?.mode === "schedule" ? "schedule" : "request"
  })).filter((service) => service.id && service.label).slice(0, 20);
}

function sanitizeSacramentPriests(value, current) {
  if (!Array.isArray(value)) return normalizeSacramentPriests(current);
  const rows = value.map((priest) => ({
    name: String(priest?.name || "").trim().slice(0, 120),
    email: String(priest?.email || "").trim().slice(0, 180),
    serviceTypes: sanitizeSacramentServiceTypes(priest?.serviceTypes),
    customServices: sanitizeCustomSacramentServices(priest?.customServices)
  })).filter((priest) => priest.name);
  return rows.slice(0, 12);
}

const GIVING_CATALOG_COMPUTED_FIELDS = new Set([
  "giftCount",
  "raisedCents",
  "supporters",
  "visibility"
]);

function comparableGivingCatalogValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => comparableGivingCatalogValue(item));
  if (!value || typeof value !== "object") return value;
  const comparable = {};
  Object.keys(value).sort().forEach((field) => {
    if (GIVING_CATALOG_COMPUTED_FIELDS.has(field)) return;
    const fieldValue = value[field];
    if (field === "goalCents" && Number(fieldValue || 0) === 0) return;
    if (field === "coverPhotoUrl" && !String(fieldValue || "").trim()) return;
    comparable[field] = comparableGivingCatalogValue(fieldValue, field);
  });
  return comparable;
}

export function givingCatalogChanged(next = {}, current = {}) {
  return ["funds", "campaigns", "feastCampaigns"].some((field) =>
    JSON.stringify(comparableGivingCatalogValue(next[field] || [], field))
      !== JSON.stringify(comparableGivingCatalogValue(current[field] || [], field))
  );
}

export async function handleParishDashboard(request, env, parishId) {
  const limited = await rateLimit(
    request,
    env,
    ["PATCH", "POST"].includes(request.method) ? "parish-dashboard-write" : "parish-auth",
    { limit: ["PATCH", "POST"].includes(request.method) ? 20 : 40, windowSeconds: 300 }
  );
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Support request was invalid." }, { status: 400 });
    const result = await submitParishSupportTicket(env, request, { ...found.registration, parishId }, body);
    return json(result, { status: result.ok ? 201 : result.status || 500 });
  }

  if (request.method === "GET") {
    const { registration } = found;
    const [catalog, directorySettings, pendingFeatureRequests] = await Promise.all([
      loadGivingCatalogFromAccounting(env, parishId, registration),
      getDirectorySettings(env, parishId),
      loadPendingParishFeatureRequests(env, parishId)
    ]);
    const featureRequests = pendingFeatureRequests.filter((item) =>
      item.featureId === "ministry-service"
      || (item.featureId === "pledge-tracker" && !stewardshipToolAccess(registration))
      || (item.featureId === "giving-plus" && !givingFeatureAccess(registration, "customFunds"))
    );
    const dashboardParish = await enrichParishGivingOptions(env, {
      ...parishDashboardPayload(parishId, registration),
      id: parishId,
      accountingAvailable: accountingAvailableForParish(parishId, env),
      parishLifeAvailable: parishLifeAvailableFor(env),
      directoryEnabled: directoryEnabledFor(registration, directorySettings)
    });
    return json({
      // The parish-managed Funds & Alms record is authoritative. Accounting
      // consumes it on save; accounting must never overwrite this editor.
      // Campaign progress comes from the same paid offerings that power the
      // donor dashboard and public campaign pages.
      parish: dashboardParish,
      accountingCatalogConnected: catalog.available,
      featureRequests
    });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const current = found.registration;
    const givingPlus = givingFeatureAccess(current, "customFunds");
    const starterDesignatedFund = givingFeatureAccess(current, "starterDesignatedFund");
    if (!starterDesignatedFund && body.funds !== undefined) {
      return json({ error: "Designated funds are not available on this plan." }, { status: 403 });
    }
    if (!givingPlus && (body.campaigns !== undefined || body.feastCampaigns !== undefined)) {
      return json({ error: "Campaigns and festal alms are available with Giving Plus." }, { status: 403 });
    }
    if (!givingPlus && body.funds !== undefined) {
      const limitError = starterFundCatalogError(body.funds);
      if (limitError) return json({ error: limitError }, { status: 422 });
    }
    const requestedPassword = body.newDashboardPassword !== undefined
      ? String(body.newDashboardPassword || "").trim()
      : "";
    if (requestedPassword && requestedPassword.length < 8) {
      return json({ error: "Dashboard password must be at least 8 characters." }, { status: 400 });
    }

    const catalogFieldsSubmitted = body.funds !== undefined
      || body.campaigns !== undefined
      || body.feastCampaigns !== undefined;
    const submittedCatalog = {
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns
    };
    const catalogChanged = catalogFieldsSubmitted && (
      body.givingCatalogChanged === true
      || (body.givingCatalogChanged === undefined && givingCatalogChanged(submittedCatalog, current))
    );
    let normalizedKoinoniaCalendarUrl = current.koinoniaCalendarUrl || "";
    if (body.koinoniaCalendarUrl !== undefined) {
      const value = String(body.koinoniaCalendarUrl || "").trim();
      if (!value) {
        normalizedKoinoniaCalendarUrl = "";
      } else {
        try {
          normalizedKoinoniaCalendarUrl = normalizeKoinoniaCalendarUrl(value).slice(0, 2000);
          await fetchKoinoniaCalendarIcs(normalizedKoinoniaCalendarUrl);
        } catch (error) {
          const message = /public HTTPS|valid/.test(String(error?.message || "")) ? "Paste a valid public HTTPS calendar link. Google Calendar share links and iCal/ICS feeds are supported." : "We could not read a public ICS calendar from that link. Make sure the calendar is public, then try again.";
          return json({ error: message }, { status: 422 });
        }
      }
    }

    let updated = {
      ...current,
      parishName: String(body.parishName ?? current.parishName ?? "").trim() || current.parishName || "",
      addressLine1: String(body.addressLine1 ?? current.addressLine1 ?? "").trim(),
      addressLine2: String(body.addressLine2 ?? current.addressLine2 ?? "").trim(),
      city: String(body.city ?? current.city ?? "").trim(),
      state: String(body.state ?? current.state ?? "").trim(),
      postalCode: String(body.postalCode ?? current.postalCode ?? "").trim(),
      country: String(body.country ?? current.country ?? "US").trim() || "US",
      website: body.website ?? current.website ?? "",
      taxLegalName: String(body.taxLegalName ?? current.taxLegalName ?? "").trim(),
      taxEin: String(body.taxEin ?? current.taxEin ?? "").trim(),
      timezone: (() => {
        const requested = String(body.timezone ?? current.timezone ?? "").trim();
        if (!requested) return current.timezone || "";
        try {
          new Intl.DateTimeFormat(undefined, { timeZone: requested });
          return requested;
        } catch {
          return current.timezone || "";
        }
      })(),
      liturgicalCalendar: body.liturgicalCalendar || current.liturgicalCalendar || "julian",
      koinoniaCalendarUrl: normalizedKoinoniaCalendarUrl,
      patronalFeast: String(body.patronalFeast ?? current.patronalFeast ?? "").trim(),
      patronalFeastName: String(body.patronalFeastName ?? current.patronalFeastName ?? current.parishPatronalFeastName ?? "").trim().slice(0, 160),
      patronalFeastDate: (() => {
        const value = String(body.patronalFeastDate ?? current.patronalFeastDate ?? current.parishPatronalFeastDate ?? "").trim();
        return /^(?:\d{4}-)?\d{2}-\d{2}$/.test(value) ? value.slice(-5) : "";
      })(),
      givingStatus: body.givingStatus || current.givingStatus || "active",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      communicationsEnabled: Boolean(body.communicationsEnabled ?? current.communicationsEnabled ?? true),
      sacramentsEnabled: Boolean(body.sacramentsEnabled ?? current.sacramentsEnabled ?? false) && hasParishPlusAccess(current),
      sacramentPriests: body.sacramentPriests !== undefined ? sanitizeSacramentPriests(body.sacramentPriests, current) : normalizeSacramentPriests(current),
      bookstoreEnabled: Boolean(body.bookstoreEnabled ?? current.bookstoreEnabled ?? false),
      funds: catalogChanged ? submittedCatalog.funds : current.funds,
      campaigns: catalogChanged ? submittedCatalog.campaigns : current.campaigns,
      feastCampaigns: catalogChanged ? submittedCatalog.feastCampaigns : current.feastCampaigns,
      parishUpdatedAt: new Date().toISOString()
    };

    let nextSession = null;
    if (requestedPassword) {
      updated = await applyParishDashboardPassword(updated, requestedPassword, { temporary: false });
      updated = {
        ...updated,
        parishDashboardSessions: []
      };
      nextSession = await issueParishDashboardSession(updated);
      updated = nextSession.registration;
    }

    const accountingCatalogChanged = catalogChanged && (
      body.accountingCatalogChanged === true
      || (body.accountingCatalogChanged === undefined && givingCatalogChanged({
        funds: updated.funds,
        campaigns: updated.campaigns
      }, {
        funds: current.funds,
        campaigns: current.campaigns
      }))
    );
    let catalogSync = { available: true, synchronized: 0 };
    if (accountingCatalogChanged) {
      catalogSync = await synchronizeGivingCatalogWithAccounting(env, parishId, updated);
      if (!catalogSync.available) {
        return json({
          error: "accounting_catalog_unavailable",
          message: "Funds & Alms could not be saved because the Accounting catalog is unavailable. Nothing was changed."
        }, { status: 503 });
      }
      updated = {
        ...updated,
        funds: catalogSync.funds,
        campaigns: catalogSync.campaigns,
        feastCampaigns: catalogSync.feastCampaigns || []
      };
    }
    await saveRegistrationRecord(env, found.key, updated, current);
    return json({
      ok: true,
      parish: updated,
      accountingCatalog: catalogSync,
      token: nextSession?.token || "",
      expiresAt: nextSession?.expiresAt || ""
    });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

export async function handleParishFeatureRequestDismiss(request, env, parishId, featureId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!["pledge-tracker", "giving-plus", "ministry-service"].includes(featureId)) return json({ error: "Unknown feature request" }, { status: 404 });
  await dismissParishFeatureRequest(env, parishId, featureId);
  return json({ ok: true });
}

export async function handleParishSession(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const accountLimited = await rateLimitByKey(request, env, "parish-auth-account", parishId, { limit: 20, windowSeconds: 300 });
  if (accountLimited) return accountLimited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const password = String(body.password || "").trim();
  if (!(await verifyParishDashboardPassword(found.registration, password))) {
    return unauthorized();
  }

  const termsAcceptanceError = await ensureParishCurrentTermsAcceptance(env, request, parishId, body);
  if (termsAcceptanceError) return json(termsAcceptanceError, { status: 428 });

  const session = await issueParishDashboardSession(found.registration);
  await saveRegistrationRecord(env, found.key, session.registration, found.registration);

  return json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    parish: parishDashboardPayload(parishId, session.registration)
  });
}

export async function handleParishPasswordResetRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-password-reset-request", { limit: 6, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = String(body.parishId || "").trim();
  const email = normalizeEmail(body.email);
  if (!parishId || !email) return json({ error: "Parish ID and email are required" }, { status: 422 });

  const generic = { ok: true, message: "If that parish and contact email match our records, a reset link has been sent." };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json(generic);

  const registration = found.registration;
  const contactEmails = Array.from(new Set([
    normalizeEmail(registration.priestEmail),
    normalizeEmail(registration.treasurerEmail)
  ].filter(Boolean)));
  if (!contactEmails.includes(email)) return json(generic);

  const resetToken = generateSecret("parish_reset");
  const resetSalt = generateSecret("parish_reset_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, "")}/give/login?reset=1&parish=${encodeURIComponent(registration.parishId || parishId)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...registration,
    parishPasswordResetSalt: resetSalt,
    parishPasswordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    parishPasswordResetSentAt: new Date().toISOString(),
    parishPasswordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    parishUpdatedAt: new Date().toISOString()
  };

  const emailResult = await sendParishPasswordResetEmail(env, appUrl, updated, resetUrl, contactEmails);
  updated.parishPasswordResetEmailStatus = emailResult.status || "";
  updated.parishPasswordResetEmailDetail = emailResult.detail || "";
  await saveRegistrationRecord(env, found.key, updated, registration);

  return json({
    ...generic,
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    resetUrl: emailResult.status === "not_configured" ? resetUrl : undefined
  });
}

export async function handleParishPasswordResetConfirm(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-password-reset-confirm", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = String(body.parishId || "").trim();
  const token = String(body.token || "");
  const newPassword = String(body.newPassword || body.password || "").trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || "").trim();
  if (!parishId || !token) return json({ error: "Parish ID and reset token are required" }, { status: 422 });
  if (newPassword.length < 8) return json({ error: "Dashboard password must be at least 8 characters." }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: "Dashboard passwords do not match." }, { status: 422 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return unauthorized();
  const current = found.registration;
  if (!current.parishPasswordResetSalt || !current.parishPasswordResetTokenHash) {
    return json({ error: "Reset link is missing or expired. Please request a new link." }, { status: 410 });
  }
  if (current.parishPasswordResetExpiresAt && new Date(current.parishPasswordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: "Reset link expired. Please request a new link." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${current.parishPasswordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, current.parishPasswordResetTokenHash)) return unauthorized();

  let updated = await applyParishDashboardPassword({
    ...current,
    parishPasswordResetSalt: "",
    parishPasswordResetTokenHash: "",
    parishPasswordResetSentAt: "",
    parishPasswordResetExpiresAt: "",
    parishPasswordResetEmailStatus: "",
    parishPasswordResetEmailDetail: "",
    parishDashboardSessions: [],
    parishUpdatedAt: new Date().toISOString()
  }, newPassword, { temporary: false });
  updated = {
    ...updated,
    parishDashboardSessions: []
  };
  await saveRegistrationRecord(env, found.key, updated, current);

  return json({ ok: true, updatedAt: updated.parishDashboardTokenUpdatedAt || new Date().toISOString() });
}
