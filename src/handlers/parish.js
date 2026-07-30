// src/handlers/parish.js
// Parish handlers and shared helpers (Stripe, donor, admin extracted to own files).

import { activeFestalAlmsCampaigns } from "../festal-alms.js";
import { submitParishSupportTicket } from "../lib/parish-support-tickets.js";
import { dismissParishFeatureRequest, loadPendingParishFeatureRequests } from "../lib/parish-feature-requests.js";
import {
  ADMIN_PASSWORD_KV_KEY,
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
  d1First,
  d1GetSetting,
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
  issueAdminSession,
  issueParishDashboardSession,
  json,
  listKvKeys,
  loadDonor,
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail,
  parishIdIndexKey,
  parseJsonRow,
  parsePasswordRecord,
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
import { mergeStewardshipFundsIntoRegistration } from "../lib/stewardship-funds.js";

export {
  d1All,
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
  hasParishPlusAccess,
  recordAuditEvent,
  sacramentsEnabledFor,
};

import { bookstoreEnabledFor, directoryEnabledFor, entitlementsSummary, givingFeatureAccess, hasParishPlusAccess, sacramentsEnabledFor, stewardshipToolAccess, tierIncludesModule, tierIncludesParishPlus } from "../lib/entitlements.js";
import { getDirectorySettings } from "../directory/settings.js";

import {
  createTaxExemptionClaim,
  issueClaimUploadToken
} from "../lib/tax-exemption.js";
import {
  createSubscriptionCheckoutForRegistration,
} from "../lib/subscription-checkout.js";

import {
  defaultSubscriptionTier as sharedDefaultSubscriptionTier,
  subscriptionTier as sharedSubscriptionTier,
} from "../lib/subscriptions.js";

import {
  parishSlug,
} from "../lib/format.js";

import {
  resolveSettlementProfileId,
} from "../lib/settlement-profiles.js";

import { recordAuditEvent } from "../lib/audit-log.js";
import {
  publicPaymentFeeSchedules,
} from "../lib/payment-fees.js";
import {
  classifyStripeCharge,
  refreshStripeVolume,
  summarizeStoredStripeVolume,
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
  listYtdStripeCharges,
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
  agapayEmailHtml,
  generateDashboardToken,
  htmlEscape,
  loadParishOnboardingGuideAttachment,
  monthLabel,
  publicSubscriptionTiers,
  sendAdminRegistrationNotice,
  sendDashboardInvite,
  sendEmail,
  sendParishPasswordResetEmail,
  sendRegistrationConfirmation,
  sendTreasurerStripeInvite,
  subscriptionReady,
} from "../lib/parish-notifications.js";

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

export async function verifyAdminPassword(env, submitted) {
  if (!submitted) return false;
  const storedPassword = d1(env)
    ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
    : env.AGAPAY_REGISTRATIONS
      ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
      : "";
  const fallbackPassword = !storedPassword && d1(env) && env.AGAPAY_REGISTRATIONS
    ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
    : "";
  const passwordToCheck = storedPassword || fallbackPassword;
  if (passwordToCheck && await verifyPasswordRecord(submitted, passwordToCheck)) return true;
  if (passwordToCheck && !parsePasswordRecord(passwordToCheck) && secureCompare(submitted, passwordToCheck)) return true;
  return Boolean(env.AGAPAY_ADMIN_TOKEN && secureCompare(submitted, env.AGAPAY_ADMIN_TOKEN));
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

export async function handleAdminSession(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const password = String(body.password || "").trim();
  if (!(await verifyAdminPassword(env, password))) return unauthorized();

  const actor = normalizeAdminActor(body.actor || "Admin");
  const session = await issueAdminSession(env, actor);
  return json({
    ok: true,
    token: session.token,
    actor: session.actor,
    expiresAt: session.expiresAt
  });
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

export function weekWindow(date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

export function splitSubmittedNames(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function commemorationKey(parishId, sourceId) {
  return `${COMMEMORATION_KEY_PREFIX}${parishId}:${sourceId}`;
}

export async function loadCommemorationEntries(env, parishId, startDate, endDate) {
  if (!parishId) return [];

  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT data FROM commemorations
       WHERE parish_id = ?1 AND created_at >= ?2 AND created_at <= ?3
       ORDER BY created_at DESC
       LIMIT 1000`,
      parishId,
      startDate ? startDate.toISOString() : "0000-01-01T00:00:00.000Z",
      endDate ? endDate.toISOString() : "9999-12-31T23:59:59.999Z"
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = commemorationKey(parishId, "");
  const keys = await listKvKeys(env, { prefix, limit: 1000 });
  const entries = [];

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      const created = new Date(entry.createdAt || 0);
      if (startDate && created < startDate) continue;
      if (endDate && created > endDate) continue;
      entries.push(entry);
    } catch {
      // Ignore malformed queue entries rather than blocking the dashboard.
    }
  }

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return entries;
}

export async function storeCommemorationEntry(env, sourceId, metadata = {}, fallback = {}) {
  if (!hasProductionStore(env)) return null;
  const parishId = metadata.parish_id || fallback.parishId || "";
  const living = splitSubmittedNames(metadata.names_living || fallback.namesLiving || "");
  const departed = splitSubmittedNames(metadata.names_departed || fallback.namesDeparted || "");
  if (!parishId || (!living.length && !departed.length)) return null;

  const entry = {
    id: sourceId || crypto.randomUUID(),
    parishId,
    parishName: metadata.parish_name || fallback.parishName || "",
    sourceId: sourceId || "",
    giftType: metadata.gift_type || fallback.giftType || "commemoration",
    commemorationKind: metadata.commemoration_kind || fallback.commemorationKind || "proskomedia_liturgy",
    frequency: metadata.frequency || fallback.frequency || "once",
    donorEmail: normalizeEmail(fallback.donorEmail || metadata.donor_email || ""),
    donorName: fallback.donorName || metadata.donor_name || "",
    amountCents: Number(fallback.amountCents || 0),
    living,
    departed,
    note: fallback.note || metadata.in_memoriam || metadata.note || "",
    createdAt: fallback.createdAt || new Date().toISOString()
  };

  return saveCommemorationEntry(env, entry);
}

export function commemorationSourceIdFromOffering(offering = {}) {
  return offering.checkoutSessionId
    || offering.stripePaymentIntentId
    || offering.id
    || crypto.randomUUID();
}

export async function ensureCommemorationEntryFromOffering(env, offering = {}, overrides = {}) {
  const giftType = String(overrides.giftType || offering.giftType || "").toLowerCase();
  if (giftType !== "commemoration") return null;

  return storeCommemorationEntry(
    env,
    commemorationSourceIdFromOffering({ ...offering, ...overrides }),
    {
      parish_id: overrides.parishId || offering.parishId || "",
      parish_name: overrides.parishName || offering.parishName || "",
      donor_email: overrides.donorEmail || offering.donorEmail || "",
      donor_name: overrides.donorName || offering.donorName || "",
      gift_type: giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      names_living: overrides.namesLiving || offering.namesLiving || "",
      names_departed: overrides.namesDeparted || offering.namesDeparted || "",
      commemoration_kind: overrides.commemorationKind || offering.commemorationKind || "proskomedia_liturgy"
    },
    {
      parishId: overrides.parishId || offering.parishId || "",
      parishName: overrides.parishName || offering.parishName || "",
      donorEmail: overrides.donorEmail || offering.donorEmail || "",
      donorName: overrides.donorName || offering.donorName || "",
      giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      amountCents: Number(overrides.amountCents ?? offering.amountCents ?? 0),
      namesLiving: overrides.namesLiving || offering.namesLiving || "",
      namesDeparted: overrides.namesDeparted || offering.namesDeparted || "",
      commemorationKind: overrides.commemorationKind || offering.commemorationKind || "proskomedia_liturgy",
      createdAt: overrides.createdAt || offering.createdAt || new Date().toISOString()
    }
  );
}

export async function saveCommemorationEntry(env, entry) {
  if (!hasProductionStore(env) || !entry?.parishId || !entry?.id) return null;
  const record = {
    ...entry,
    donorEmail: normalizeEmail(entry.donorEmail || ""),
    createdAt: entry.createdAt || new Date().toISOString()
  };

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO commemorations (id, parish_id, source_id, donor_email, created_at, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         parish_id = excluded.parish_id,
         source_id = excluded.source_id,
         donor_email = excluded.donor_email,
         created_at = excluded.created_at,
         data = excluded.data`,
      `${record.parishId}:${record.id}`,
      record.parishId,
      record.sourceId || record.id,
      record.donorEmail,
      record.createdAt,
      JSON.stringify(record)
    );
  } else {
    await env.AGAPAY_REGISTRATIONS.put(commemorationKey(record.parishId, record.id), JSON.stringify(record));
  }
  return record;
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
    patronalFeast: registration.patronalFeast || "",
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || "",
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || "",
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    givingPlusEnabled: givingPlus,
    candlesEnabled: givingPlus && (registration.candlesEnabled ?? true),
    commemorationsEnabled: givingPlus && (registration.commemorationsEnabled ?? true),
    sacramentsEnabled: sacramentsEnabledFor(registration),
    bookstoreEnabled: bookstoreEnabledFor(registration),
    processingFeeSchedules: publicPaymentFeeSchedules(),
    funds: givingPlus && Array.isArray(registration.funds) && registration.funds.length ? registration.funds : [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ],
    campaigns: givingPlus && Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: givingPlus && Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
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

export function normalizedOptionKeys(option = {}) {
  return [option.id, option.feastId, option.name, option.campaignName, option.title]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
}

function campaignGiftKeys(gift = {}) {
  return normalizedOptionKeys({
    id: gift.campaignId,
    name: gift.campaign,
    campaignName: gift.description || gift.campaignDescription,
    title: gift.giftType === "campaign" ? gift.fund : ""
  });
}

function giftMatchesCampaignKeys(gift, keys) {
  const giftType = String(gift.giftType || "").toLowerCase();
  return ["campaign", "alms", "feast"].includes(giftType) && campaignGiftKeys(gift).some((key) => keys.has(key));
}

export function campaignRaisedTotals(campaign, gifts) {
  const keys = new Set(normalizedOptionKeys(campaign));
  let raisedCents = 0;
  let giftCount = 0;
  gifts.forEach((gift) => {
    if (giftMatchesCampaignKeys(gift, keys)) {
      raisedCents += Number(gift.amountCents || 0);
      giftCount += 1;
    }
  });
  return { raisedCents, giftCount };
}

function publicBoolean(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
}

function publicComment(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 280);
}

function campaignPublicSupporters(campaign, gifts) {
  const keys = new Set(normalizedOptionKeys(campaign));
  return gifts
    .filter((gift) => giftMatchesCampaignKeys(gift, keys))
    .map((gift) => {
      const anonymous = publicBoolean(gift.publicAnonymous);
      const name = anonymous ? "Anonymous" : (gift.publicDisplayName || gift.donorName || "AGAPAY donor");
      return {
        name,
        amountCents: Number(gift.amountCents || gift.giftAmountCents || 0),
        comment: publicComment(gift.publicComment),
        anonymous,
        createdAt: gift.createdAt || gift.completedAt || ""
      };
    })
    .filter((gift) => gift.amountCents > 0)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 24);
}

function stFiacreRoofDemoSupporters() {
  return [
    {
      name: "Sophia Lebedev",
      amountCents: 55000,
      comment: "May this church shelter generations to come.",
      anonymous: false,
      createdAt: "2026-07-05T09:30:00.000Z"
    },
    {
      name: "Anonymous",
      amountCents: 80000,
      comment: "For the continued life of the parish.",
      anonymous: true,
      createdAt: "2026-06-07T12:30:00.000Z"
    },
    {
      name: "Elena Sokolov",
      amountCents: 65000,
      comment: "With love for our parish home.",
      anonymous: false,
      createdAt: "2026-05-03T10:00:00.000Z"
    },
    {
      name: "Nikolai Volkov",
      amountCents: 125000,
      comment: "Glory to God for this parish and the work ahead.",
      anonymous: false,
      createdAt: "2026-04-05T13:00:00.000Z"
    },
    {
      name: "Anna Kozlov",
      amountCents: 100000,
      comment: "For our children and the future of the parish.",
      anonymous: false,
      createdAt: "2026-03-15T10:30:00.000Z"
    },
    {
      name: "Anonymous",
      amountCents: 75000,
      comment: "Praying this roof protects the church for many years.",
      anonymous: true,
      createdAt: "2026-02-22T09:45:00.000Z"
    },
    {
      name: "Maria Petrov",
      amountCents: 50000,
      comment: "In thanksgiving for the mission and all who worship here.",
      anonymous: false,
      createdAt: "2026-02-01T11:15:00.000Z"
    },
    {
      name: "Joel Dunn",
      amountCents: 7500,
      comment: "May God bless this work.",
      anonymous: false,
      createdAt: "2026-01-18T11:15:00.000Z"
    }
  ];
}

export async function enrichParishGivingOptions(env, parish) {
  if (!parish?.id) return parish;
  const gifts = await loadParishPaidOfferings(env, parish.id, 1000);
  const enrichCampaign = (campaign) => {
    const totals = campaignRaisedTotals(campaign, gifts);
    const supporters = campaignPublicSupporters(campaign, gifts);
    const photos = Array.isArray(campaign.photos) ? campaign.photos : [];
    const optionKeys = [
      ...normalizedOptionKeys(campaign),
      campaign.slug,
      campaign.code
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    const isStFiacreRoofDemo = parish.id === "st-fiacre"
      && optionKeys.some((key) => ["alms", "roof-campaign", "roof-restoration", "roof campaign", "church roof restoration"].includes(key));
    const coverPhotoUrl = campaign.coverPhotoUrl
      || campaign.coverUrl
      || campaign.imageUrl
      || campaign.photoUrl
      || (typeof photos[0] === "string" ? photos[0] : photos[0]?.url)
      || (isStFiacreRoofDemo ? "/images/marketplace/dome-cross.jpg" : "")
      || "";
    const seededRaisedCents = isStFiacreRoofDemo ? 557500 : 0;
    return {
      ...campaign,
      name: isStFiacreRoofDemo ? "Church Roof Restoration" : campaign.name || campaign.campaignName || "Parish Campaign",
      description: isStFiacreRoofDemo ? "Help us restore and protect our church for generations to come." : campaign.description,
      category: isStFiacreRoofDemo ? "Building" : campaign.category,
      goalCents: isStFiacreRoofDemo ? 1000000 : Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0),
      coverPhotoUrl,
      raisedCents: totals.raisedCents || (isStFiacreRoofDemo
        ? seededRaisedCents
        : Number(campaign.raisedCents || campaign.amountCents || campaign.currentCents || 0)),
      giftCount: totals.giftCount || (isStFiacreRoofDemo
        ? 8
        : Number(campaign.giftCount || campaign.donorCount || 0)),
      supporters: supporters.length ? supporters : (isStFiacreRoofDemo ? stFiacreRoofDemoSupporters() : [])
    };
  };
  return {
    ...parish,
    campaigns: (parish.campaigns || []).map(enrichCampaign),
    feastCampaigns: activeFestalAlmsCampaigns(
      parish.feastCampaigns,
      parish.liturgicalCalendar
    ).map(enrichCampaign)
  };
}

export async function handleParishes(request, env) {
  const url = new URL(request.url);

  // Fast single-parish lookup: /api/parishes?id=st-fiacre
  // Used by the give/form page to avoid fetching all parishes just to find one.
  const singleId = (url.searchParams.get("id") || "").trim();
  if (singleId) {
    const found = await findRegistrationByParishId(env, singleId);
    if (!found) return json({ error: "Parish not found" }, { status: 404 });
    const parish = parishFromRegistration(found.registration);
    if (parish.status !== "verified") return json({ error: "Parish not found" }, { status: 404 });
    const enriched = await enrichParishGivingOptions(env, parish);
    return json({ parish: enriched, source: "d1" });
  }

  const page = await loadVerifiedRegistrationParishPage(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    q: url.searchParams.get("q") || url.searchParams.get("search"),
    type: url.searchParams.get("type"),
    jurisdiction: url.searchParams.get("jurisdiction")
  });
  const enrichedParishes = await Promise.all(page.parishes.map((parish) => enrichParishGivingOptions(env, parish)));

  return json({
    parishes: enrichedParishes,
    cursor: page.cursor,
    hasMore: page.hasMore,
    limit: page.limit,
    source: page.source
  });
}

export async function handlePublicCampaign(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const url = new URL(request.url);
  const parishId = String(url.searchParams.get("parish") || url.searchParams.get("parishId") || "").trim();
  const slug = String(url.searchParams.get("slug") || url.searchParams.get("campaign") || url.searchParams.get("c") || "").trim();
  if (!parishId || !slug) return json({ error: "Campaign parish and slug are required." }, { status: 422 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Campaign not found" }, { status: 404 });
  const parish = parishFromRegistration(found.registration);
  if (!parish) return json({ error: "Campaign not found" }, { status: 404 });

  const enrichedParish = await enrichParishGivingOptions(env, parish);
  const campaigns = [
    ...(Array.isArray(enrichedParish.campaigns) ? enrichedParish.campaigns : []),
    ...(Array.isArray(enrichedParish.feastCampaigns) ? enrichedParish.feastCampaigns : [])
  ];
  const normalizedSlug = slugify(slug);
  const campaign = campaigns.find((item) => {
    const keys = [item.slug, item.id, item.feastId, item.name, item.campaignName, item.title]
      .filter(Boolean)
      .map((value) => slugify(value));
    return keys.includes(normalizedSlug);
  });
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });

  const status = String(campaign.status || (campaign.enabled === false ? "hidden" : "active")).toLowerCase();
  if (["hidden", "cancelled", "inactive"].includes(status)) {
    return json({ error: "Campaign not found" }, { status: 404 });
  }

  return json({
    ok: true,
    parish: enrichedParish,
    campaign: {
      ...campaign,
      slug: campaign.slug || slugify(campaign.name || campaign.campaignName || campaign.id || slug)
    }
  });
}

export async function handleParishCampaignUpload(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-campaign-upload", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "campaigns")) {
    return json({ error: "Campaigns are available with Giving Plus." }, { status: 403 });
  }

  if (!env.CAMPAIGN_ASSETS || !env.CAMPAIGN_ASSETS_URL) {
    return json({ error: "Campaign photo storage is not configured." }, { status: 503 });
  }

  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowed = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const ext = allowed.get(contentType);
  if (!ext) {
    return json({ error: "Campaign photos must be JPG, PNG, or WebP images." }, { status: 415 });
  }

  const maxBytes = 10 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    return json({ error: "Campaign photo must be 10MB or smaller." }, { status: 413 });
  }

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Campaign photo is empty." }, { status: 422 });
  if (bytes.byteLength > maxBytes) return json({ error: "Campaign photo must be 10MB or smaller." }, { status: 413 });

  const uploadUrl = new URL(request.url);
  const campaignId = slugify(uploadUrl.searchParams.get("campaign") || "draft");
  const key = [
    "campaigns",
    slugify(parishId),
    campaignId,
    `${Date.now()}-${crypto.randomUUID()}.${ext}`
  ].join("/");
  await env.CAMPAIGN_ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
  const publicBase = String(env.CAMPAIGN_ASSETS_URL || "").replace(/\/+$/, "");
  return json({
    ok: true,
    key,
    url: `${publicBase}/${key}`,
    contentType,
    size: bytes.byteLength
  });
}

export async function handleParishLogo(request, env, parishId) {
  if (!["POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const limited = await rateLimit(request, env, "parish-logo", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (request.method === "POST" && !givingFeatureAccess(found.registration, "branding")) {
    return json({ error: "Parish logo branding is available with Giving Plus." }, { status: 403 });
  }
  if (!env.CAMPAIGN_ASSETS || !env.CAMPAIGN_ASSETS_URL) {
    return json({ error: "Parish logo storage is not configured." }, { status: 503 });
  }

  const previousKey = String(found.registration.logoStorageKey || "");
  if (request.method === "DELETE") {
    const updated = {
      ...found.registration,
      logoUrl: "",
      logoStorageKey: "",
      parishUpdatedAt: new Date().toISOString()
    };
    await saveRegistrationRecord(env, found.key, updated, found.registration);
    if (previousKey) await env.CAMPAIGN_ASSETS.delete(previousKey);
    return json({ ok: true, logoUrl: "" });
  }

  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowed = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const ext = allowed.get(contentType);
  if (!ext) return json({ error: "Logo must be a JPG, PNG, or WebP image." }, { status: 415 });

  const maxBytes = 5 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    return json({ error: "Logo must be 5MB or smaller." }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Logo image is empty." }, { status: 422 });
  if (bytes.byteLength > maxBytes) return json({ error: "Logo must be 5MB or smaller." }, { status: 413 });

  const key = `parish-logos/${slugify(parishId)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await env.CAMPAIGN_ASSETS.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }
  });
  const publicBase = String(env.CAMPAIGN_ASSETS_URL || "").replace(/\/+$/, "");
  const logoUrl = `${publicBase}/${key}`;
  const updated = {
    ...found.registration,
    logoUrl,
    logoStorageKey: key,
    parishUpdatedAt: new Date().toISOString()
  };
  try {
    await saveRegistrationRecord(env, found.key, updated, found.registration);
  } catch (error) {
    await env.CAMPAIGN_ASSETS.delete(key);
    throw error;
  }
  if (previousKey && previousKey !== key) await env.CAMPAIGN_ASSETS.delete(previousKey);
  return json({ ok: true, logoUrl, key, contentType, size: bytes.byteLength });
}

export async function loadPaidDonorOfferingPlatformTotals(env) {
  if (d1(env)) {
    const row = await d1First(
      env,
      `SELECT
         COUNT(*) AS gift_count,
         COALESCE(SUM(CAST(json_extract(data, '$.amountCents') AS INTEGER)), 0) AS total_given_cents
       FROM donor_offerings
       WHERE payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'completed')`
    );
    return {
      giftCount: Number(row?.gift_count || 0),
      totalGivenCents: Number(row?.total_given_cents || 0)
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { giftCount: 0, totalGivenCents: 0 };
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: 5000 });
  let giftCount = 0;
  let totalGivenCents = 0;

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (paidOfferingStatus(offering)) {
        giftCount += 1;
        totalGivenCents += Number(offering.amountCents || 0);
      }
    } catch {
      // Ignore malformed donation records in public aggregate totals.
    }
  }

  return { giftCount, totalGivenCents };
}

export async function handlePublicPlatformSummary(env) {
  if (!hasProductionStore(env)) {
    return json({
      summary: {
        organizationsSupported: 0,
        activeCampaigns: 0,
        totalGivenCents: 0,
        giftCount: 0,
        dataSource: "not_configured",
        generatedAt: new Date().toISOString()
      }
    });
  }

  const parishes = await verifiedRegistrationParishes(env, { limit: 10000 });
  const donationTotals = await loadPaidDonorOfferingPlatformTotals(env);
  const activeCampaigns = parishes.reduce((total, parish) => {
    const campaigns = Array.isArray(parish.campaigns) ? parish.campaigns : [];
    return total + campaigns.filter((campaign) => campaign && campaign.active !== false && campaign.hidden !== true).length;
  }, 0);

  return json({
    summary: {
      organizationsSupported: parishes.length,
      activeCampaigns,
      totalGivenCents: donationTotals.totalGivenCents,
      giftCount: donationTotals.giftCount,
      dataSource: d1(env) ? "d1" : "kv",
      generatedAt: new Date().toISOString()
    }
  });
}

export function registrationRequiresJurisdiction(type) {
  return ["Mission", "Parish", "Cathedral", "Monastery / Skete"].includes(String(type || ""));
}

export function registrationRequiresValuesReview(type) {
  return ["Business", "Ministry / Nonprofit", "School / Academy", "Other Orthodox Organization"].includes(String(type || ""));
}

export function registrationRequiresWebsite(type) {
  return String(type || "") === "Business";
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
    "treasurerEmail"
  ];

  if (registrationRequiresJurisdiction(body.communityType)) requiredFields.push("jurisdiction");
  if (registrationRequiresWebsite(body.communityType)) requiredFields.push("website");
  if (registrationRequiresValuesReview(body.communityType)) requiredFields.push("organizationDescription");

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@")) {
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

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`;
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
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body,
    parishId,
    parishUsername: parishId,
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: new Date().toISOString(),
    subscriptionTier: tier?.id || "parish",
    subscriptionStatus: tier?.monthlyCents === 0 ? "free_forever" : "not_started",
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || ""
  };

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
          actorUserId: treasurerEmail || priestEmail || "",
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
  const requestedGiftType = String(body.giftType || "").trim().toLowerCase();
  if (!parish.givingPlusEnabled && !["stewardship", "general"].includes(requestedGiftType)) {
    return json({ error: "This offering type is available with Giving Plus." }, { status: 403 });
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
  const normalizedGiftType = String(body.giftType || "").toLowerCase();
  const checkoutGiftType = normalizedGiftType === "love" ? "commemoration" : normalizedGiftType;
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
  const checkoutFund = isFestalAlms
    ? destinationFund?.name || "Benevolence Fund"
    : isGeneralStewardship ? "General Operating Fund" : body.fund || "";
  const checkoutFundId = isFestalAlms
    ? destinationFund?.id || destinationFund?.code || "benevolence-fund"
    : isGeneralStewardship ? "general" : body.fundId || "";
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

  // Checkout is created as a direct charge in the parish account by the
  // Stripe-Account header below. Do not also set on_behalf_of to that same
  // account: Stripe rejects that combination, and the direct-charge context
  // already gives the parish its own branding, statement descriptor,
  // settlement, and dispute ownership.

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
  const updated = {
    ...current,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: "active",
    subscriptionTrialDays: 0,
    demoTierChangedAt: new Date().toISOString(),
    parishUpdatedAt: new Date().toISOString()
  };
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
    updates.subscriptionStatus = Number(registration.subscriptionTrialDays || 0) > 0 ? "trialing" : "active";
    updates.stripeSubscriptionId = stripeSession.subscription;
    updates.subscriptionActivatedAt = registration.subscriptionActivatedAt || now;
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


export async function listRecentStripePayouts(env, stripeAccountId, limit = 10) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit) } };
}

export async function listStripeBalanceTransactionsForPayout(env, stripeAccountId, payoutId, limit = 100) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      payout: payoutId,
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    params.append("expand[]", "data.source");
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

export function reconciliationPeriod(value, now = new Date()) {
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2020 || year > 2200 || monthNumber < 1 || monthNumber > 12) return reconciliationPeriod(fallback, now);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return {
    month,
    year,
    monthNumber,
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
}

export async function listStripePayoutsForPeriod(env, stripeAccountId, period, limit = 100) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;
  // Payout creation can precede bank arrival, so include a generous lookback and filter by arrival date below.
  const createdLookback = period.startUnix - (45 * 86400);

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length))),
      "created[gte]": String(createdLookback),
      "created[lt]": String(period.endUnix)
    });
    if (startingAfter) params.set("starting_after", startingAfter);
    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;
    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data.filter((payout) => {
      const bankDate = Number(payout.arrival_date || payout.created || 0);
      return bankDate >= period.startUnix && bankDate < period.endUnix;
    }));
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;
    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 10) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit), truncated: payouts.length >= limit } };
}

function paymentIntentFromStripeSource(source) {
  if (!source || typeof source === "string") return "";
  return stripeObjectId(source.payment_intent)
    || stripeObjectId(source.charge?.payment_intent)
    || stripeObjectId(source.source?.payment_intent);
}

function reconciliationAllocation(offering = {}) {
  const giftType = String(offering.giftType || "offering").toLowerCase();
  const campaign = offering.campaign || offering.campaignId || "";
  const fund = offering.fund || offering.fundId || "";
  if (["alms", "feast"].includes(giftType)) {
    return { key: "fund:benevolence", category: "Benevolence Fund", label: "Festal Alms for the Poor/Needy" };
  }
  if (campaign || giftType === "campaign") {
    return { key: `campaign:${campaign || fund || "campaign"}`, category: "Campaign", label: campaign || fund || "Parish Campaign" };
  }
  if (["candle", "candles"].includes(giftType)) return { key: "candles", category: "Candles", label: "Candle Offerings" };
  if (["memorial", "commemoration", "commemorations"].includes(giftType)) {
    return { key: "commemorations", category: "Commemorations", label: "Memorials & Commemorations" };
  }
  if (fund && !/^(?:general(?: operating)?(?: fund)?|general stewardship|stewardship)$/i.test(fund)) {
    return { key: `fund:${fund}`, category: "Designated Fund", label: fund };
  }
  return { key: "general", category: "General Giving", label: fund || "General Operating Fund" };
}

function signedFeeParts(transaction, source) {
  const details = Array.isArray(transaction.fee_details) ? transaction.fee_details : [];
  const applicationFee = details
    .filter((item) => String(item.type || "").includes("application"))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sourceApplicationFee = Number(source?.application_fee_amount || 0);
  const agapayFeeCents = applicationFee || sourceApplicationFee;
  return {
    agapayFeeCents,
    stripeFeeCents: Number(transaction.fee || 0) - agapayFeeCents
  };
}

async function reconciliationCloseRecord(env, parishId, month) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const raw = d1(env) ? await d1GetSetting(env, key) : await env.AGAPAY_REGISTRATIONS?.get(key);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

async function saveReconciliationCloseRecord(env, parishId, month, record) {
  const key = `reconciliation-close:${parishId}:${month}`;
  const value = JSON.stringify(record);
  if (d1(env)) return d1SetSetting(env, key, value);
  return env.AGAPAY_REGISTRATIONS.put(key, value);
}

export async function listRecentStripeBalanceTransactions(env, stripeAccountId, limit = 25) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

export async function handleParishPayoutDiagnostics(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (!found.registration.stripeAccountId) {
    return json({
      parishId,
      available: false,
      reason: "Stripe is not connected for this parish."
    });
  }

  const stripeAccountId = found.registration.stripeAccountId;
  const payoutsResult = await listRecentStripePayouts(env, stripeAccountId, 5);
  if (!payoutsResult.ok) {
    return json({
      parishId,
      stripeAccountId,
      available: false,
      payoutsRequest: {
        ok: false,
        status: payoutsResult.status,
        error: payoutsResult.body?.error?.message || "Unknown Stripe error"
      }
    }, { status: 502 });
  }

  const payouts = payoutsResult.body.data || [];
  const diagnostics = {
    parishId,
    stripeAccountId,
    payoutsRequest: {
      ok: true,
      count: payouts.length
    },
    payouts: payouts.map((payout) => ({
      id: payout.id,
      status: payout.status,
      amount: payout.amount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      currency: payout.currency || "usd"
    })),
    balanceTransactionsRequest: null,
    samplePayoutTransactions: [],
    matchedOfferings: [],
    traceability: {
      chargeLinkedTransactionCount: 0,
      paymentIntentLinkedOfferingCount: 0,
      notes: []
    }
  };

  if (!payouts.length) {
    diagnostics.traceability.notes.push("Stripe returned no payouts for this connected account yet.");

    const recentBalanceResult = await listRecentStripeBalanceTransactions(env, stripeAccountId, 25);
    if (!recentBalanceResult.ok) {
      diagnostics.balanceTransactionsRequest = {
        ok: false,
        status: recentBalanceResult.status,
        error: recentBalanceResult.body?.error?.message || "Unknown Stripe error"
      };
      diagnostics.traceability.notes.push("Recent balance transactions could not be listed, so charge traceability remains unverified.");
      return json(diagnostics);
    }

    diagnostics.balanceTransactionsRequest = {
      ok: true,
      mode: "recent",
      count: recentBalanceResult.body.data?.length || 0
    };

    const recentTransactions = recentBalanceResult.body.data || [];
    const chargeIds = new Set();
    const paymentIntentIds = new Set();
    const matchedOfferings = [];

    for (const transaction of recentTransactions) {
      const sourceId = typeof transaction.source === "string"
        ? transaction.source
        : transaction.source?.id || "";
      if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
      if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
    }

    for (const chargeId of chargeIds) {
      const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
      if (!chargeResult.ok) continue;
      const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
        ? chargeResult.body.payment_intent
        : chargeResult.body.payment_intent?.id || "";
      if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
    }

    for (const paymentIntentId of paymentIntentIds) {
      const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
      if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
    }

    diagnostics.samplePayoutTransactions = recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      net: transaction.net,
      source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
      reportingCategory: transaction.reporting_category || "",
      availableOn: transaction.available_on || 0,
      created: transaction.created || 0
    }));
    diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
      id: offering.id,
      donorName: offering.donorName || "",
      donorEmail: offering.donorEmail || "",
      amountCents: offering.amountCents || 0,
      chargeCents: offering.chargeCents || offering.amountCents || 0,
      agapayFeeCents: offering.agapayFeeCents || 0,
      estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
      giftType: offering.giftType || "",
      fund: offering.fund || "",
      campaign: offering.campaign || "",
      paymentIntentId: offering.stripePaymentIntentId || "",
      checkoutSessionId: offering.checkoutSessionId || ""
    }));
    diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
    diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
    if (chargeIds.size) diagnostics.traceability.notes.push("Recent balance transactions include charge ids in `source`.");
    if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
    if (matchedOfferings.length) diagnostics.traceability.notes.push("Recent balance transactions can be matched back to AGAPAY donor_offerings records.");
    return json(diagnostics);
  }

  const samplePayout = payouts[0];
  const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, samplePayout.id, 100);
  if (!balanceResult.ok) {
    diagnostics.balanceTransactionsRequest = {
      ok: false,
      payoutId: samplePayout.id,
      status: balanceResult.status,
      error: balanceResult.body?.error?.message || "Unknown Stripe error"
    };
    return json(diagnostics, { status: 502 });
  }

  diagnostics.balanceTransactionsRequest = {
    ok: true,
    payoutId: samplePayout.id,
    count: balanceResult.body.data?.length || 0
  };

  const transactions = balanceResult.body.data || [];
  const chargeIds = new Set();
  const paymentIntentIds = new Set();
  const matchedOfferings = [];

  for (const transaction of transactions) {
    const sourceId = typeof transaction.source === "string"
      ? transaction.source
      : transaction.source?.id || "";
    if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
    if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
  }

  for (const chargeId of chargeIds) {
    const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
    if (!chargeResult.ok) continue;
    const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
      ? chargeResult.body.payment_intent
      : chargeResult.body.payment_intent?.id || "";
    if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
  }

  for (const paymentIntentId of paymentIntentIds) {
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
  }

  diagnostics.samplePayoutTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    fee: transaction.fee,
    net: transaction.net,
    source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
    reportingCategory: transaction.reporting_category || "",
    availableOn: transaction.available_on || 0,
    created: transaction.created || 0
  }));
  diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
    id: offering.id,
    donorName: offering.donorName || "",
    donorEmail: offering.donorEmail || "",
    amountCents: offering.amountCents || 0,
    chargeCents: offering.chargeCents || offering.amountCents || 0,
    agapayFeeCents: offering.agapayFeeCents || 0,
    estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
    giftType: offering.giftType || "",
    fund: offering.fund || "",
    campaign: offering.campaign || "",
    paymentIntentId: offering.stripePaymentIntentId || "",
    checkoutSessionId: offering.checkoutSessionId || ""
  }));
  diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
  diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
  if (chargeIds.size) diagnostics.traceability.notes.push("Sample payout balance transactions include charge ids in `source`.");
  if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
  if (matchedOfferings.length) {
    diagnostics.traceability.notes.push("At least some payout line items can be matched back to AGAPAY donor_offerings records.");
  } else {
    diagnostics.traceability.notes.push("No AGAPAY donor_offerings records matched the sampled payout transaction sources yet.");
  }

  return json(diagnostics);
}

async function paymentIntentForReconciliationTransaction(env, stripeAccountId, transaction, lookupState) {
  const source = transaction.source;
  const sourceId = stripeObjectId(source);
  const expandedPaymentIntent = paymentIntentFromStripeSource(source);
  if (expandedPaymentIntent) return { paymentIntentId: expandedPaymentIntent, source };
  if (!sourceId || lookupState.count >= lookupState.limit) return { paymentIntentId: "", source };
  if (lookupState.cache.has(sourceId)) return lookupState.cache.get(sourceId);

  lookupState.count += 1;
  let result = null;
  if (sourceId.startsWith("ch_")) {
    result = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(sourceId)}`, stripeAccountId);
  } else if (sourceId.startsWith("re_")) {
    result = await stripeGetConnectedRequest(env, `/v1/refunds/${encodeURIComponent(sourceId)}`, stripeAccountId);
  }
  const resolvedSource = result?.ok ? result.body : source;
  let paymentIntentId = paymentIntentFromStripeSource(resolvedSource);
  if (!paymentIntentId && result?.ok && sourceId.startsWith("re_")) {
    const chargeId = stripeObjectId(result.body.charge);
    if (chargeId && lookupState.count < lookupState.limit) {
      lookupState.count += 1;
      const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
      if (chargeResult.ok) paymentIntentId = stripeObjectId(chargeResult.body.payment_intent);
    }
  }
  const resolved = { paymentIntentId, source: resolvedSource };
  lookupState.cache.set(sourceId, resolved);
  return resolved;
}

export async function handleParishReconciliation(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-reconciliation", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "reconciliation")) {
    return json({ error: "Monthly reconciliation is available with Giving Plus." }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = reconciliationPeriod(url.searchParams.get("month"));
  const detailed = url.searchParams.get("detail") === "full";
  const closeRecord = await reconciliationCloseRecord(env, parishId, period.month);
  const stripeAccountId = found.registration.stripeAccountId || "";
  if (!stripeAccountId) {
    return json({
      available: false,
      reason: "Connect Stripe before reconciling monthly deposits.",
      parishId,
      period,
      closeRecord,
      generatedAt: new Date().toISOString()
    });
  }

  const payoutsResult = await listStripePayoutsForPeriod(env, stripeAccountId, period, 100);
  if (!payoutsResult.ok) {
    return json({ error: "Unable to load Stripe payouts", detail: payoutsResult.body?.error?.message || "Stripe request failed" }, { status: 502 });
  }

  const payouts = payoutsResult.body.data || [];
  if (!detailed) {
    const payoutRows = payouts.map((payout) => ({
      id: payout.id,
      status: String(payout.status || "unknown").toLowerCase(),
      amountCents: Number(payout.amount || 0),
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      transactionCount: 0,
      compositionNetCents: 0,
      matchedNetCents: 0,
      differenceCents: 0
    }));
    const depositedCents = payoutRows
      .filter((payout) => payout.status === "paid")
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const inTransitCents = payoutRows
      .filter((payout) => ["pending", "in_transit"].includes(payout.status))
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const failedPayoutCents = payoutRows
      .filter((payout) => ["failed", "canceled", "cancelled"].includes(payout.status))
      .reduce((sum, payout) => sum + payout.amountCents, 0);
    const gifts = (await loadParishPaidOfferings(env, parishId, 2000)).filter((gift) => {
      const time = new Date(gift.createdAt || gift.date || 0).getTime();
      return Number.isFinite(time) && time >= Date.parse(period.startIso) && time < Date.parse(period.endIso);
    });
    return json({
      available: true,
      parishId,
      period,
      closeRecord,
      summary: {
        depositedCents,
        inTransitCents,
        failedPayoutCents,
        grossActivityCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || gift.amountCents || 0), 0),
        refundCents: 0,
        stripeFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.stripeFeeCents || 0), 0),
        agapayFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.agapayFeeCents || 0), 0),
        totalFeeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0),
        payoutCompositionNetCents: 0,
        matchedNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
        unmatchedNetCents: 0,
        matchedPercent: 100,
        payoutCount: payouts.length,
        paidPayoutCount: payoutRows.filter((payout) => payout.status === "paid").length,
        exceptionCount: 0
      },
      giftActivity: {
        giftCount: gifts.length,
        grossGiftCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || 0), 0),
        parishNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
        feeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0)
      },
      allocations: [],
      payouts: payoutRows.sort((a, b) => Number(b.arrivalDate || 0) - Number(a.arrivalDate || 0)),
      transactions: [],
      exceptions: [],
      generatedAt: new Date().toISOString(),
      note: "Fast reconciliation summary. Detailed Stripe transaction matching is deferred to keep the dashboard responsive."
    });
  }

  const lookupState = { count: 0, limit: 80, cache: new Map() };
  const offeringCache = new Map();
  const allocations = new Map();
  const exceptions = [];
  const payoutRows = [];
  const transactionRows = [];
  let depositedCents = 0;
  let inTransitCents = 0;
  let failedPayoutCents = 0;
  let grossActivityCents = 0;
  let refundCents = 0;
  let stripeFeeCents = 0;
  let agapayFeeCents = 0;
  let payoutCompositionNetCents = 0;
  let matchedNetCents = 0;
  let unmatchedNetCents = 0;

  for (const payout of payouts) {
    const payoutStatus = String(payout.status || "unknown").toLowerCase();
    const payoutAmount = Number(payout.amount || 0);
    if (payoutStatus === "paid") depositedCents += payoutAmount;
    else if (["pending", "in_transit"].includes(payoutStatus)) inTransitCents += payoutAmount;
    else if (["failed", "canceled", "cancelled"].includes(payoutStatus)) failedPayoutCents += payoutAmount;

    const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, payout.id, 500);
    if (!balanceResult.ok) {
      exceptions.push({ severity: "error", code: "payout_unavailable", payoutId: payout.id, message: `Could not load the transactions composing payout ${payout.id}.` });
      payoutRows.push({
        id: payout.id,
        status: payoutStatus,
        amountCents: payoutAmount,
        arrivalDate: payout.arrival_date || 0,
        created: payout.created || 0,
        transactionCount: 0,
        compositionNetCents: 0,
        differenceCents: payoutAmount
      });
      continue;
    }

    const transactions = balanceResult.body.data || [];
    let payoutNet = 0;
    let payoutMatchedNet = 0;
    for (const transaction of transactions) {
      const transactionNet = Number(transaction.net || 0);
      const transactionAmount = Number(transaction.amount || 0);
      const resolved = await paymentIntentForReconciliationTransaction(env, stripeAccountId, transaction, lookupState);
      const paymentIntentId = resolved.paymentIntentId;
      let offering = null;
      if (paymentIntentId) {
        if (!offeringCache.has(paymentIntentId)) {
          offeringCache.set(paymentIntentId, await loadDonorOfferingByPaymentIntent(env, paymentIntentId));
        }
        offering = offeringCache.get(paymentIntentId);
      }
      const feeParts = signedFeeParts(transaction, resolved.source);
      const reportingCategory = String(transaction.reporting_category || transaction.type || "other");
      const isRefund = transactionAmount < 0 || /refund|dispute|chargeback/.test(reportingCategory);
      const includedInDeposits = payoutStatus === "paid";
      const allocation = offering ? reconciliationAllocation(offering) : null;

      payoutNet += transactionNet;
      if (includedInDeposits) {
        payoutCompositionNetCents += transactionNet;
        if (transactionAmount > 0) grossActivityCents += transactionAmount;
        if (isRefund) refundCents += Math.abs(transactionAmount);
        stripeFeeCents += feeParts.stripeFeeCents;
        agapayFeeCents += feeParts.agapayFeeCents;
        if (offering && allocation) {
          matchedNetCents += transactionNet;
          payoutMatchedNet += transactionNet;
          const row = allocations.get(allocation.key) || {
            ...allocation,
            grossCents: 0,
            feeCents: 0,
            netCents: 0,
            transactionCount: 0
          };
          row.grossCents += transactionAmount;
          row.feeCents += Number(transaction.fee || 0);
          row.netCents += transactionNet;
          row.transactionCount += 1;
          allocations.set(allocation.key, row);
        } else {
          unmatchedNetCents += transactionNet;
        }
      }

      transactionRows.push({
        id: transaction.id,
        payoutId: payout.id,
        payoutStatus,
        created: transaction.created || 0,
        availableOn: transaction.available_on || 0,
        type: transaction.type || "",
        reportingCategory,
        sourceId: stripeObjectId(transaction.source),
        paymentIntentId,
        grossCents: transactionAmount,
        feeCents: Number(transaction.fee || 0),
        netCents: transactionNet,
        matched: Boolean(offering),
        donorName: offering ? giftDisplayName(offering) : "",
        donorEmail: offering?.donorEmail || offering?.email || "",
        giftType: offering?.giftType || "",
        fund: offering?.fund || offering?.fundId || "",
        campaign: offering?.campaign || offering?.campaignId || "",
        allocationCategory: allocation?.category || "Unmatched",
        allocationLabel: allocation?.label || "Unmatched Stripe activity"
      });
    }

    const differenceCents = payoutAmount - payoutNet;
    if (payoutStatus === "paid" && differenceCents !== 0) {
      exceptions.push({ severity: "warning", code: "payout_difference", payoutId: payout.id, amountCents: differenceCents, message: `Payout ${payout.id} differs from its listed Stripe transactions.` });
    }
    payoutRows.push({
      id: payout.id,
      status: payoutStatus,
      amountCents: payoutAmount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      transactionCount: transactions.length,
      compositionNetCents: payoutNet,
      matchedNetCents: payoutMatchedNet,
      differenceCents
    });
  }

  if (unmatchedNetCents !== 0) {
    exceptions.push({ severity: "warning", code: "unmatched_activity", amountCents: unmatchedNetCents, message: "Some deposited Stripe activity could not be matched to an AGAPAY gift record. Review it before posting fund allocations." });
  }
  if (inTransitCents) exceptions.push({ severity: "info", code: "in_transit", amountCents: inTransitCents, message: "One or more payouts expected this month are still pending or in transit." });
  if (failedPayoutCents) exceptions.push({ severity: "error", code: "failed_payout", amountCents: failedPayoutCents, message: "A payout failed or was canceled and should not be recorded as a bank deposit." });
  if (lookupState.count >= lookupState.limit) exceptions.push({ severity: "warning", code: "lookup_limit", message: "The month contains more Stripe source records than could be matched in one request. Export and review unmatched activity." });
  if (payoutsResult.body.truncated) exceptions.push({ severity: "warning", code: "payout_limit", message: "Only the first 100 payouts for this month are shown." });

  const gifts = (await loadParishPaidOfferings(env, parishId, 2000)).filter((gift) => {
    const time = new Date(gift.createdAt || gift.date || 0).getTime();
    return Number.isFinite(time) && time >= Date.parse(period.startIso) && time < Date.parse(period.endIso);
  });
  const giftActivity = {
    giftCount: gifts.length,
    grossGiftCents: gifts.reduce((sum, gift) => sum + Number(gift.giftAmountCents || 0), 0),
    parishNetCents: gifts.reduce((sum, gift) => sum + Number(gift.parishNetCents ?? gift.amountCents ?? 0), 0),
    feeCents: gifts.reduce((sum, gift) => sum + Number(gift.totalFeeCents || 0), 0)
  };

  const matchedPercent = payoutCompositionNetCents
    ? Math.max(0, Math.min(100, Math.round((matchedNetCents / payoutCompositionNetCents) * 100)))
    : 100;

  return json({
    available: true,
    parishId,
    period,
    closeRecord,
    summary: {
      depositedCents,
      inTransitCents,
      failedPayoutCents,
      grossActivityCents,
      refundCents,
      stripeFeeCents,
      agapayFeeCents,
      totalFeeCents: stripeFeeCents + agapayFeeCents,
      payoutCompositionNetCents,
      matchedNetCents,
      unmatchedNetCents,
      matchedPercent,
      payoutCount: payouts.length,
      paidPayoutCount: payoutRows.filter((payout) => payout.status === "paid").length,
      exceptionCount: exceptions.length
    },
    giftActivity,
    allocations: Array.from(allocations.values()).sort((a, b) => b.netCents - a.netCents),
    payouts: payoutRows.sort((a, b) => Number(b.arrivalDate || 0) - Number(a.arrivalDate || 0)),
    transactions: transactionRows.sort((a, b) => Number(b.created || 0) - Number(a.created || 0)),
    exceptions,
    generatedAt: new Date().toISOString(),
    note: "Bank deposits are grouped by Stripe payout arrival date. Gift activity is grouped separately by the date each gift was made."
  });
}

export async function handleParishReconciliationClose(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-reconciliation-close", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "reconciliation")) {
    return json({ error: "Monthly reconciliation is available with Giving Plus." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }
  const period = reconciliationPeriod(body.month);
  const bankStatementCents = Math.round(Number(body.bankStatementCents));
  if (!Number.isFinite(bankStatementCents) || bankStatementCents < 0) return json({ error: "Enter a valid bank statement deposit total." }, { status: 400 });
  const closed = body.closed !== false;
  const stripeAccountId = found.registration.stripeAccountId || "";
  if (!stripeAccountId) return json({ error: "Connect Stripe before closing a reconciliation month." }, { status: 409 });
  const payoutsResult = await listStripePayoutsForPeriod(env, stripeAccountId, period, 100);
  if (!payoutsResult.ok) {
    return json({ error: "Unable to verify Stripe deposits before closing the month.", detail: payoutsResult.body?.error?.message || "Stripe request failed" }, { status: 502 });
  }
  const expectedDepositCents = (payoutsResult.body.data || [])
    .filter((payout) => String(payout.status || "").toLowerCase() === "paid")
    .reduce((sum, payout) => sum + Number(payout.amount || 0), 0);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  if (closed && bankStatementCents !== expectedDepositCents && !notes) {
    return json({ error: "Add a treasurer note explaining the bank difference before closing." }, { status: 400 });
  }
  const record = {
    parishId,
    month: period.month,
    status: closed ? "closed" : "open",
    bankStatementCents,
    expectedDepositCents,
    differenceCents: bankStatementCents - expectedDepositCents,
    notes,
    closedAt: closed ? new Date().toISOString() : "",
    updatedAt: new Date().toISOString()
  };
  await saveReconciliationCloseRecord(env, parishId, period.month, record);
  return json({ ok: true, record });
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

export function summarizeStoredParishGifts(gifts = []) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const giftYears = gifts
    .map((gift) => new Date(gift.createdAt || gift.date || 0).getUTCFullYear())
    .filter((yearValue) => Number.isFinite(yearValue));
  const year = giftYears.includes(currentYear)
    ? currentYear
    : giftYears.length
      ? Math.max(...giftYears)
      : currentYear;
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

  for (const gift of gifts) {
    const created = new Date(gift.createdAt || gift.date || 0);
    if (created.getUTCFullYear() !== year) continue;
    const netCents = numericCents(gift.parishNetCents ?? gift.amountCents);
    const grossCents = numericCents(gift.giftAmountCents ?? gift.amountCents);
    if (!netCents && !grossCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += grossCents;
    feesAbsorbedCents += numericCents(gift.totalFeeCents);
    if (gift.coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += numericCents(gift.donorCoveredFeeCents);
    }
    giftCount += 1;
    const giverKey = gift.donorEmail || gift.donorName || gift.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    const iso = created.toISOString();
    if (!lastGiftAt || iso > lastGiftAt) lastGiftAt = iso;
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

export async function handleParishGivingSummary(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const emptySummary = {
    ...summarizeCharges([]),
    generatedAt: new Date().toISOString()
  };

  const url = new URL(request.url);
  const forceStripe = url.searchParams.get("source") === "stripe";
  const storedGifts = await loadParishPaidOfferings(env, parishId, 2000);
  if (storedGifts.length && !forceStripe) {
    return json({
      summary: {
        ...summarizeStoredParishGifts(storedGifts),
        dataSource: "stored",
        generatedAt: new Date().toISOString(),
        note: "Showing stored AGAPAY gift records."
      }
    });
  }

  if (!found.registration.stripeAccountId || String(found.registration.stripeAccountId).startsWith("acct_demo_")) {
    return json({
      summary: {
        ...(storedGifts.length ? summarizeStoredParishGifts(storedGifts) : emptySummary),
        dataSource: storedGifts.length ? "stored" : "not_connected",
        generatedAt: new Date().toISOString(),
        note: storedGifts.length
          ? "Showing seeded AGAPAY gift records for this demo parish."
          : "Stripe is not connected yet."
      }
    });
  }

  const result = await listYtdStripeCharges(env, found.registration.stripeAccountId);
  if (!result.ok) {
    if (storedGifts.length) {
      return json({
        summary: {
          ...summarizeStoredParishGifts(storedGifts),
          dataSource: "stored",
          generatedAt: new Date().toISOString(),
          note: "Showing stored AGAPAY gift records because Stripe summary is unavailable."
        }
      });
    }
    return json(
      { error: "Stripe giving summary failed", detail: result.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    summary: {
      ...summarizeCharges(result.body.data || []),
      dataSource: "stripe",
      generatedAt: new Date().toISOString(),
      note: result.body.data?.length >= 500 ? "Showing the first 500 Stripe charges for this year." : ""
    }
  });
}

export async function handleParishStripeVolume(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-stripe-volume", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();

  const stripeAccountId = found.registration.stripeAccountId || "";
  if (!stripeAccountId || stripeAccountId.startsWith("acct_demo_")) {
    return json({
      volume: {
        ...(await summarizeStoredStripeVolume(env, parishId)),
        connected: false,
        note: "Connect the parish Stripe account to begin payment-volume tracking."
      }
    });
  }

  try {
    const refresh = await refreshStripeVolume(env, parishId, stripeAccountId);
    const volume = await summarizeStoredStripeVolume(env, parishId, refresh.periodStart);
    return json({
      volume: {
        ...volume,
        connected: true,
        note: volume.scan.complete
          ? "Donation share is an AGAPAY estimate based on classified Stripe charge volume."
          : "Stripe history is still being scanned. Refresh again to continue before relying on the percentage."
      }
    });
  } catch (error) {
    const volume = await summarizeStoredStripeVolume(env, parishId);
    return json({
      error: "Stripe volume refresh failed",
      detail: error?.message || "Stripe request failed",
      volume: { ...volume, connected: true }
    }, { status: 502 });
  }
}

export async function handleParishGivingHistory(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const gifts = await loadParishPaidOfferings(env, parishId, 500);
  return json({
    gifts,
    generatedAt: new Date().toISOString()
  });
}

export async function handleParishRecurringHealth(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!givingFeatureAccess(found.registration, "giverInsights")) {
    return json({ error: "Recurring-gift insights are available with Giving Plus." }, { status: 403 });
  }

  const records = await loadParishRecurringOfferings(env, parishId, 1000);
  return json({
    health: summarizeParishRecurringHealth(records)
  });
}

// Marks a bookstore commerce order paid once Stripe confirms, and reconciles
// real Stripe fees / parish net from the balance transaction. Without this the
// order sits at payment_status='pending' forever and never shows up in sales
// reporting. Idempotent: a second call for an already-paid order is a no-op.
// `object` is the Stripe checkout.session (kind='session') or payment_intent
// (kind='payment_intent') from the webhook.
export async function completeCommerceOrderFromStripe(env, object = {}, kind = "session") {
  if (!d1(env)) return null;
  const meta = object.metadata || {};
  if (meta.commerce_module && meta.commerce_module !== "bookstore") return null;

  const paymentIntentId = kind === "payment_intent"
    ? (object.id || "")
    : (checkoutPaymentIntentId(object) || stripeObjectId(object.payment_intent) || "");

  let order = null;
  if (kind === "session" && object.id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE checkout_session_id = ? AND commerce_module = 'bookstore'`,
      object.id);
  }
  if (!order && meta.order_id) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE id = ? AND commerce_module = 'bookstore'`,
      meta.order_id);
  }
  if (!order && paymentIntentId) {
    order = await d1First(env,
      `SELECT * FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
      paymentIntentId);
  }
  if (!order) return null;
  if (order.payment_status === "paid") return order; // accounting wiring can still replay safely

  const fees = paymentIntentId
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, order.parish_id, {
      chargeCents: numericCents(object.amount_total || object.amount_received || order.total_charged_cents),
      coverFees: order.cover_fees === 1
    })
    : {};

  const totalCents = numericCents(object.amount_total || object.amount_received)
    || Number(fees.chargeCents || 0)
    || Number(order.subtotal_cents || 0);
  const taxCents = numericCents(object.total_details?.amount_tax) || Number(order.tax_cents || 0);
  const stripeFeeCents = Number(fees.stripeFeeCents || 0);
  const agapayFeeCents = Number(fees.agapayFeeCents || 0); // bookstore takes no AGAPAY fee
  const netCents = Number(fees.parishNetCents || Math.max(0, totalCents - stripeFeeCents - agapayFeeCents));
  const now = new Date().toISOString();
  const completedAt = object.created ? new Date(object.created * 1000).toISOString() : now;

  await d1Run(env,
    `UPDATE commerce_orders
     SET payment_status = 'paid', status = 'completed',
         tax_cents = ?, total_charged_cents = ?, stripe_fee_cents = ?, agapay_fee_cents = ?,
         parish_net_cents = ?, stripe_payment_intent_id = ?, stripe_charge_id = ?,
         stripe_customer_id = COALESCE(NULLIF(?, ''), stripe_customer_id),
         fulfillment_status = CASE WHEN fulfillment_status = 'pending' THEN 'ready' ELSE fulfillment_status END,
         completed_at = ?, updated_at = ?
     WHERE id = ?`,
    taxCents, totalCents, stripeFeeCents, agapayFeeCents, netCents,
    paymentIntentId || order.stripe_payment_intent_id || "",
    fees.stripeChargeId || order.stripe_charge_id || "",
    object.customer || order.stripe_customer_id || "",
    completedAt, now, order.id
  );

  return { ...order, payment_status: "paid", status: "completed", tax_cents: taxCents,
    total_charged_cents: totalCents, stripe_fee_cents: stripeFeeCents,
    agapay_fee_cents: agapayFeeCents, parish_net_cents: netCents,
    stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id || "",
    completed_at: completedAt };
}

// Reflects a Stripe refund back onto the bookstore order so sales reporting
// stays honest. Safe to call for any charge — no-ops when the charge isn't a
// bookstore order.
export async function refundCommerceOrderFromStripe(env, charge = {}) {
  if (!d1(env)) return null;
  const pi = stripeObjectId(charge.payment_intent);
  if (!pi) return null;
  const order = await d1First(env,
    `SELECT id, total_charged_cents FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
    pi);
  if (!order) return null;
  const refunded = numericCents(charge.amount_refunded);
  const full = refunded >= numericCents(charge.amount || order.total_charged_cents);
  const state = full ? "refunded" : "partially_refunded";
  await d1Run(env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    state, state, new Date().toISOString(), order.id);
  return order;
}

// Reflects Stripe disputes back onto bookstore orders. Safe to call for any
// charge dispute: non-bookstore and unknown payment intents no-op.
export async function disputeCommerceOrderFromStripe(env, dispute = {}, phase = "created") {
  if (!d1(env)) return null;
  const pi = stripeObjectId(dispute.payment_intent);
  if (!pi) return null;
  const order = await d1First(env,
    `SELECT id FROM commerce_orders WHERE stripe_payment_intent_id = ? AND commerce_module = 'bookstore'`,
    pi);
  if (!order) return null;
  const won = String(dispute.status || "").toLowerCase() === "won";
  const state = phase === "closed"
    ? (won ? "completed" : "dispute_closed")
    : "disputed";
  const paymentStatus = phase === "closed"
    ? (won ? "paid" : "dispute_closed")
    : "disputed";
  await d1Run(env,
    `UPDATE commerce_orders SET payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
    paymentStatus, state, new Date().toISOString(), order.id);
  return order;
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
    patronalFeast: registration.patronalFeast || "",
    patronalFeastName: registration.patronalFeastName || registration.parishPatronalFeastName || "",
    patronalFeastDate: registration.patronalFeastDate || registration.parishPatronalFeastDate || "",
    givingStatus: registration.givingStatus || "active",
    stripeAccountId: registration.stripeAccountId || "",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionTierLabel: currentTier?.label || registration.subscriptionTierLabel || "",
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    // Display the current published tier price. Stored amounts describe an
    // earlier checkout and must not leave the dashboard advertising a stale
    // plan price after the catalog changes.
    subscriptionMonthlyCents: currentTier?.monthlyCents ?? null,
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
      (item.featureId === "pledge-tracker" && !stewardshipToolAccess(registration))
      || (item.featureId === "giving-plus" && !givingFeatureAccess(registration, "customFunds"))
    );
    const dashboardParish = await enrichParishGivingOptions(env, {
      ...parishDashboardPayload(parishId, registration),
      id: parishId,
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
    if (!givingPlus && (body.funds !== undefined || body.campaigns !== undefined || body.feastCampaigns !== undefined)) {
      return json({ error: "Custom funds and campaigns are available with Giving Plus." }, { status: 403 });
    }
    const requestedPassword = body.newDashboardPassword !== undefined
      ? String(body.newDashboardPassword || "").trim()
      : "";
    if (requestedPassword && requestedPassword.length < 8) {
      return json({ error: "Dashboard password must be at least 8 characters." }, { status: 400 });
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
      sacramentsEnabled: Boolean(body.sacramentsEnabled ?? current.sacramentsEnabled ?? false) && hasParishPlusAccess(current),
      sacramentPriests: body.sacramentPriests !== undefined ? sanitizeSacramentPriests(body.sacramentPriests, current) : normalizeSacramentPriests(current),
      bookstoreEnabled: Boolean(body.bookstoreEnabled ?? current.bookstoreEnabled ?? false),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
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

    const catalogChanged = JSON.stringify(updated.funds || []) !== JSON.stringify(current.funds || [])
      || JSON.stringify(updated.campaigns || []) !== JSON.stringify(current.campaigns || [])
      || JSON.stringify(updated.feastCampaigns || []) !== JSON.stringify(current.feastCampaigns || []);
    let catalogSync = { available: true, synchronized: 0 };
    if (catalogChanged) {
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
  if (!["pledge-tracker", "giving-plus"].includes(featureId)) return json({ error: "Unknown feature request" }, { status: 404 });
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
