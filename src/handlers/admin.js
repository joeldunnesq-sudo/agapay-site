import {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_STORE_KEY,
  clampListLimit,
  COMMEMORATION_KEY_PREFIX,
  createPasswordRecord,
  d1,
  d1All,
  d1First,
  d1GetSetting,
  d1Run,
  d1SetSetting,
  decodeListCursor,
  DONOR_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX,
  donorCheckoutIndexKey,
  donorOfferingKey,
  encodeListCursor,
  generateSecret,
  hasProductionStore,
  issueAdminSession,
  isSystemKvKey,
  json,
  listKvKeys,
  loadMyAgapayReleaseFlags,
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail,
  parishIdIndexKey,
  parseJsonRow,
  parsePasswordRecord,
  rateLimit,
  rateLimitByKey,
  recordStripeEvent,
  safeParseJsonRow,
  saveDonor,
  saveMyAgapayReleaseFlags,
  verifyPasswordRecord,
  STRIPE_EVENT_PREFIX,
  stripeAccountIndexKey,
  stripePaymentIntentIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
} from "../lib/core.js";

import {
  loadAdminRegistrationPage,
} from "../lib/registrations.js";

import {
  monthLabel,
  parishSlug,
  slugify,
} from "../lib/format.js";

import {
  defaultSubscriptionTier,
  subscriptionReady,
  subscriptionTier,
} from "../lib/subscriptions.js";

import {
  createSubscriptionCheckoutForRegistration as createSubscriptionCheckoutForRegistrationShared,
} from "../lib/subscription-checkout.js";

import {
  listLearnBillingRecords,
} from "../learn/billing.js";

import {
  createCuratedLearnCommunityResource,
  listLearnCommunityResources,
  moderateLearnCommunityResource,
  updateCuratedLearnCommunityResource,
} from "../learn/community-store.js";

import {
  listLearnFeedback,
  updateLearnFeedbackStatus,
} from "../learn/feedback-store.js";

import {
  listYtdStripeCharges,
  stripeAccountStatus,
  stripeFormRequest,
  stripeReady,
  summarizeCharges,
} from "../lib/stripe-connect.js";

import {
  appendAdminAudit,
  generateDashboardToken,
  loadRegistrationByReference,
  requireAdmin,
  requireAdminContext,
  saveCommemorationEntry,
  saveRegistrationRecord,
  sendDashboardInvite,
  statusTimelineWithNext,
  storeDonorOffering,
} from "./parish.js";

import { recordAuditEvent, listAuditEvents } from "../lib/audit-log.js";
import { TAX_READINESS_STATUSES, withTaxReadinessDefaults } from "../lib/tax-readiness.js";

export { requireAdmin };

// src/handlers/admin.js
// Admin registrations, platform summary, password, and management handlers.

function emptySubscriptionProduct(id, label) {
  return {
    id,
    label,
    monthlyCents: 0,
    activeCount: 0,
    trialingCount: 0,
    estimated: true
  };
}

function normalizeProductSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["active", "trialing", "free_forever"].includes(status)) return status;
  return "";
}

function addSubscriptionRevenueProduct(summary, id, label, cents, status = "active") {
  const normalized = normalizeProductSubscriptionStatus(status) || "active";
  const product = summary.byProduct[id] || emptySubscriptionProduct(id, label);
  product.label = label;
  if (normalized !== "free_forever") product.monthlyCents += Math.max(0, Number(cents || 0));
  if (normalized === "trialing") product.trialingCount += 1;
  else product.activeCount += 1;
  summary.byProduct[id] = product;
}

function monthlyEquivalentCents(value, interval = "month") {
  const cents = Math.max(0, Number(value || 0));
  if (!cents) return 0;
  return String(interval || "").toLowerCase().startsWith("year") ? Math.round(cents / 12) : cents;
}

function buildSubscriptionRevenueSummary(registrations = []) {
  const summary = {
    monthLabel: monthLabel(new Date().getUTCMonth()),
    totalMonthlyCents: 0,
    byProduct: {
      give: emptySubscriptionProduct("give", "AGAPAY Give"),
      stewardship: emptySubscriptionProduct("stewardship", "AGAPAY Parish +"),
      learn: emptySubscriptionProduct("learn", "AGAPAY Learn")
    },
    note: "Subscription revenue is estimated from active AGAPAY records and normalized to a monthly amount."
  };

  for (const registration of registrations) {
    if (subscriptionReady(registration)) {
      const tier = subscriptionTier(registration);
      const status = registration.subscriptionStatus || registration.billingStatus || "active";
      addSubscriptionRevenueProduct(summary, "give", "AGAPAY Give", tier.monthlyCents, status);
    }

    const stewardshipStatus = normalizeProductSubscriptionStatus(registration.stewardshipStatus);
    if (stewardshipStatus) {
      const plan = String(registration.stewardshipPlan || registration.stewardshipBillingInterval || "").toLowerCase();
      const monthlyCents = plan === "annual" ? Math.round(39900 / 12) : 3900;
      addSubscriptionRevenueProduct(summary, "stewardship", "AGAPAY Parish +", monthlyCents, stewardshipStatus);
    }

    const learnStatus = normalizeProductSubscriptionStatus(registration.learnSubscriptionStatus || registration.learnStatus);
    if (learnStatus) {
      const plan = String(registration.learnPlan || "").toLowerCase();
      const yearlyCents = plan.includes("founding") ? 4900 : 5900;
      const interval = registration.learnBillingInterval || "year";
      addSubscriptionRevenueProduct(summary, "learn", "AGAPAY Learn", monthlyEquivalentCents(registration.learnSubscriptionCents || yearlyCents, interval), learnStatus);
    }
  }

  summary.products = Object.values(summary.byProduct);
  summary.totalMonthlyCents = summary.products.reduce((sum, product) => sum + product.monthlyCents, 0);
  delete summary.byProduct;
  return summary;
}

function emptyDonationFeeSummary(now = new Date()) {
  return {
    month: now.getUTCMonth() + 1,
    monthLabel: monthLabel(now.getUTCMonth()),
    agapayFeeCents: 0,
    grossGiftCents: 0,
    netDonationCents: 0,
    giftCount: 0,
    connectedAccounts: 0,
    dataSource: "not_configured",
    note: "Donation fee revenue appears after connected Stripe gifts are available."
  };
}

const LEARN_SCHOLARSHIP_KV_PREFIX = "__agapay_learn_scholarship:";

function learnPlanMonthlyCents(plan = "family") {
  return String(plan || "").toLowerCase().includes("founding") ? Math.round(4900 / 12) : Math.round(5900 / 12);
}

function learnSubscriptionStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  if (["active", "trialing", "past_due", "cancelled", "canceled", "free_forever"].includes(status)) {
    return status === "canceled" ? "cancelled" : status;
  }
  return "active";
}

function learnScholarshipKey(id) {
  return `${LEARN_SCHOLARSHIP_KV_PREFIX}${id}`;
}

function learnScholarshipCode(prefix = "AGAPAYLEARN") {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${String(prefix || "AGAPAYLEARN").replace(/[^A-Z0-9]+/gi, "").toUpperCase().slice(0, 18) || "AGAPAYLEARN"}-${suffix}`;
}

async function saveLearnScholarship(env, record) {
  const raw = JSON.stringify(record);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(learnScholarshipKey(record.id), raw);
  if (d1(env)) {
    try {
      await d1SetSetting(env, learnScholarshipKey(record.id), raw);
    } catch {}
  }
}

async function listLearnScholarships(env) {
  const byId = new Map();
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: LEARN_SCHOLARSHIP_KV_PREFIX, limit: 1000 });
    for (const key of keys) {
      const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw);
        if (record?.id) byId.set(record.id, record);
      } catch {}
    }
  }
  if (d1(env)) {
    try {
      const rows = await d1All(env, "SELECT key, value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT 1000", `${LEARN_SCHOLARSHIP_KV_PREFIX}%`);
      for (const row of rows) {
        try {
          const record = JSON.parse(row.value || "");
          if (record?.id) byId.set(record.id, record);
        } catch {}
      }
    } catch {}
  }
  return [...byId.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function learnBillingMetrics(records = [], now = new Date()) {
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    newSubscriptions: 0,
    cancellations: 0,
    active: 0
  }));
  const counts = { active: 0, trialing: 0, pastDue: 0, cancelled: 0, freeForever: 0 };
  let monthlyRecurringCents = 0;

  for (const record of records) {
    const status = record.cancelAtPeriodEnd || record.cancelledAt || record.canceledAt
      ? "cancelled"
      : learnSubscriptionStatus(record.status);
    if (status === "active") counts.active += 1;
    if (status === "trialing") counts.trialing += 1;
    if (status === "past_due") counts.pastDue += 1;
    if (status === "free_forever") counts.freeForever += 1;
    if (status === "cancelled") counts.cancelled += 1;
    if (!["cancelled", "free_forever"].includes(status)) {
      monthlyRecurringCents += Math.max(0, Number(record.monthlyEquivalentCents || record.monthlyCents || learnPlanMonthlyCents(record.plan)));
    }

    const created = record.createdAt ? new Date(record.createdAt) : null;
    if (created && !Number.isNaN(created.getTime()) && created.getUTCFullYear() === now.getUTCFullYear()) {
      monthly[created.getUTCMonth()].newSubscriptions += 1;
    }
    const cancelledAt = record.cancelledAt || record.canceledAt || (status === "cancelled" ? record.updatedAt : "");
    const cancelledDate = cancelledAt ? new Date(cancelledAt) : null;
    if (cancelledDate && !Number.isNaN(cancelledDate.getTime()) && cancelledDate.getUTCFullYear() === now.getUTCFullYear()) {
      monthly[cancelledDate.getUTCMonth()].cancellations += 1;
    }
  }

  let running = 0;
  for (const month of monthly) {
    running += month.newSubscriptions - month.cancellations;
    month.active = Math.max(0, running);
  }

  return {
    year: now.getUTCFullYear(),
    generatedAt: now.toISOString(),
    totalRecords: records.length,
    monthlyRecurringCents,
    counts,
    monthly,
    recent: records
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, 12)
      .map((record) => ({
        email: record.email || "",
        plan: record.plan || "family",
        status: record.cancelAtPeriodEnd || record.cancelledAt || record.canceledAt ? "cancelled" : learnSubscriptionStatus(record.status),
        createdAt: record.createdAt || "",
        updatedAt: record.updatedAt || "",
        stripeSubscriptionId: record.stripeSubscriptionId || ""
      }))
  };
}

export async function handleAdminLearnSummary(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const records = await listLearnBillingRecords(env);
  const scholarships = await listLearnScholarships(env);
  const communityResources = await listLearnCommunityResources(env, { includeAll: true, includeSeeded: true });
  const feedback = await listLearnFeedback(env, { limit: 200 });
  return json({
    ok: true,
    learn: {
      subscriptions: learnBillingMetrics(records),
      scholarships,
      communityModeration: {
        counts: communityResources.reduce((counts, resource) => {
          counts[resource.status] = (counts[resource.status] || 0) + 1;
          if ((resource.flags || []).length) counts.flagged += 1;
          return counts;
        }, { pending: 0, approved: 0, hidden: 0, removed: 0, flagged: 0 }),
        resources: communityResources.slice(0, 100)
      },
      feedback: {
        counts: feedback.reduce((counts, item) => {
          const status = item.status || "new";
          counts[status] = (counts[status] || 0) + 1;
          counts.total += 1;
          return counts;
        }, { total: 0, new: 0, "seen-considered": 0, archived: 0 }),
        suggestions: feedback.slice(0, 100)
      },
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
      promotionCodesEnabled: true
    }
  });
}

export async function handleAdminMyAgapayReleaseFlags(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === "GET") {
    return json({ ok: true, flags: await loadMyAgapayReleaseFlags(env) });
  }

  if (request.method !== "POST" && request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const flags = await saveMyAgapayReleaseFlags(env, {
    marketplaceDirectoryLive: body.marketplaceDirectoryLive === true
  });

  return json({ ok: true, flags });
}

export async function handleAdminLearnFeedback(request, env, feedbackId = "") {
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-learn-feedback", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Suggestion update was invalid." }, { status: 400 });
  const result = await updateLearnFeedbackStatus(env, request, adminContext, feedbackId, body);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleAdminLearnCommunity(request, env, resourceId = "") {
  if (!["POST", "PATCH"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-learn-community", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Moderation update was invalid." }, { status: 400 });
  if (request.method === "POST") {
    const result = await createCuratedLearnCommunityResource(env, adminContext, body);
    return json(result, { status: result.ok ? 201 : result.status || 500 });
  }
  if (body.action === "update") {
    const result = await updateCuratedLearnCommunityResource(env, adminContext, resourceId, body);
    return json(result, { status: result.ok ? 200 : result.status || 500 });
  }
  const result = await moderateLearnCommunityResource(env, adminContext, resourceId, body);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleAdminLearnScholarship(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-learn-scholarship", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const body = await request.json().catch(() => ({}));
  const percentOff = Math.min(100, Math.max(1, Number(body.percentOff || 100)));
  const maxRedemptions = Math.max(1, Number(body.maxRedemptions || 1));
  const code = String(body.code || learnScholarshipCode(body.prefix)).trim().toUpperCase();
  const label = String(body.label || "AGAPAY Learn scholarship").trim();
  const createdAt = new Date().toISOString();
  const record = {
    id: generateSecret("learn_scholarship"),
    product: "learn",
    code,
    label,
    percentOff,
    maxRedemptions,
    redeemedCount: 0,
    status: "active",
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
    stripeCouponId: "",
    stripePromotionCodeId: "",
    createdAt,
    createdBy: adminContext.actor || "Admin"
  };

  if (env.STRIPE_SECRET_KEY) {
    const couponParams = new URLSearchParams();
    couponParams.set("percent_off", String(percentOff));
    couponParams.set("duration", "forever");
    couponParams.set("name", label);
    couponParams.set("metadata[product]", "learn");
    couponParams.set("metadata[source]", "agapay_admin");
    const couponResponse = await fetch("https://api.stripe.com/v1/coupons", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: couponParams
    });
    const coupon = await couponResponse.json().catch(() => ({}));
    if (!couponResponse.ok || !coupon.id) {
      return json({ ok: false, error: coupon.error?.message || "Stripe could not create the scholarship coupon." }, { status: couponResponse.status || 502 });
    }
    const promoParams = new URLSearchParams();
    promoParams.set("promotion[type]", "coupon");
    promoParams.set("promotion[coupon]", coupon.id);
    promoParams.set("code", code);
    promoParams.set("max_redemptions", String(maxRedemptions));
    promoParams.set("active", "true");
    promoParams.set("metadata[product]", "learn");
    promoParams.set("metadata[source]", "agapay_admin");
    const promoResponse = await fetch("https://api.stripe.com/v1/promotion_codes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: promoParams
    });
    const promotion = await promoResponse.json().catch(() => ({}));
    if (!promoResponse.ok || !promotion.id) {
      return json({ ok: false, error: promotion.error?.message || "Stripe could not create the scholarship promotion code." }, { status: promoResponse.status || 502 });
    }
    record.stripeCouponId = coupon.id;
    record.stripePromotionCodeId = promotion.id;
  }

  await saveLearnScholarship(env, record);
  return json({ ok: true, scholarship: record });
}



export async function handleAdminRegistrations(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) {
    return missingProductionStoreResponse();
  }

  const url = new URL(request.url);
  const page = await loadAdminRegistrationPage(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    status: url.searchParams.get("status"),
    q: url.searchParams.get("q") || url.searchParams.get("search")
  });
  return json(page);
}

export async function loadAllRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 10000, 25000);
  if (d1(env)) {
    const registrations = [];
    let cursor = "";
    do {
      const decoded = decodeListCursor(cursor);
      const where = [];
      const params = [];
      if (options.status) {
        where.push("status = ?");
        params.push(options.status);
      }
      if (decoded) {
        where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
        params.push(decoded.receivedAt, decoded.receivedAt, decoded.reference);
      }
      const rows = await d1All(
        env,
        `SELECT reference, received_at, data
         FROM registrations
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY received_at DESC, reference DESC
         LIMIT ?`,
        ...params,
        501
      );
      const pageRows = rows.slice(0, 500);
      registrations.push(...pageRows.map(safeParseJsonRow).filter(Boolean));
      if (registrations.length >= hardLimit) return registrations.slice(0, hardLimit);
      cursor = rows.length > 500 ? encodeListCursor(pageRows[pageRows.length - 1]) : "";
    } while (cursor);
    return registrations;
  }

  return loadAllKvRegistrations(env, { hardLimit });
}

export async function loadAllKvRegistrations(env, options = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return [];

  const keys = await listKvKeys(env, { limit: options.hardLimit || 10000 });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      registrations.push(JSON.parse(raw));
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  return registrations;
}

export async function handleAdminMigrateKvToD1(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-maintenance", { limit: 3, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!d1(env)) return json({ error: "AGAPAY_DB D1 binding is not configured" }, { status: 500 });
  if (!env.AGAPAY_REGISTRATIONS) return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });

  const keys = await listKvKeys(env, { limit: 5000 });
  const migrated = {
    registrations: 0,
    donors: 0,
    offerings: 0,
    commemorations: 0,
    settings: 0,
    stripeEvents: 0,
    skipped: 0
  };

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) {
      migrated.skipped += 1;
      continue;
    }

    try {
      if (key.name === ADMIN_PASSWORD_KV_KEY) {
        await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, raw);
        migrated.settings += 1;
      } else if (key.name.startsWith(DONOR_KEY_PREFIX)) {
        await saveDonor(env, JSON.parse(raw));
        migrated.donors += 1;
      } else if (key.name.startsWith(DONOR_OFFERING_KEY_PREFIX)) {
        await storeDonorOffering(env, JSON.parse(raw));
        migrated.offerings += 1;
      } else if (key.name.startsWith(COMMEMORATION_KEY_PREFIX)) {
        await saveCommemorationEntry(env, JSON.parse(raw));
        migrated.commemorations += 1;
      } else if (key.name.startsWith(STRIPE_EVENT_PREFIX)) {
        await recordStripeEvent(env, key.name.slice(STRIPE_EVENT_PREFIX.length));
        migrated.stripeEvents += 1;
      } else if (isSystemKvKey(key.name)) {
        migrated.skipped += 1;
      } else {
        const registration = JSON.parse(raw);
        await saveRegistrationRecord(env, registration.reference || key.name, registration);
        migrated.registrations += 1;
      }
    } catch {
      migrated.skipped += 1;
    }
  }

  return json({ ok: true, migrated, migratedAt: new Date().toISOString() });
}

export async function handleAdminPlatformSummary(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    registered: 0,
    verified: 0,
    ytdDonationsCents: 0,
    giftCount: 0
  }));

  let totalRegistered = 0;
  let totalVerified = 0;
  let connectedStripeAccounts = 0;
  const connected = [];
  let revenueRegistrations = [];

  if (d1(env)) {
    const totals = await d1First(
      env,
      `SELECT
         COUNT(*) AS total_registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS total_verified,
         SUM(CASE WHEN COALESCE(stripe_account_id, '') != '' THEN 1 ELSE 0 END) AS connected_stripe_accounts
       FROM registrations`
    );
    totalRegistered = Number(totals?.total_registered || 0);
    totalVerified = Number(totals?.total_verified || 0);
    connectedStripeAccounts = Number(totals?.connected_stripe_accounts || 0);

    const monthRows = await d1All(
      env,
      `SELECT
         CAST(strftime('%m', received_at) AS INTEGER) AS month,
         COUNT(*) AS registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified
       FROM registrations
       WHERE received_at >= ?1 AND received_at < ?2
       GROUP BY month`,
      `${year}-01-01T00:00:00.000Z`,
      `${year + 1}-01-01T00:00:00.000Z`
    );
    for (const row of monthRows) {
      const target = monthly[Number(row.month || 0) - 1];
      if (!target) continue;
      target.registered = Number(row.registered || 0);
      target.verified = Number(row.verified || 0);
    }

    const connectedRows = await d1All(
      env,
      `SELECT data FROM registrations
       WHERE COALESCE(stripe_account_id, '') != ''
       ORDER BY received_at DESC, reference DESC
       LIMIT 2000`
    );
    connected.push(...connectedRows.map(safeParseJsonRow).filter(Boolean));
    revenueRegistrations = await loadAllRegistrations(env, { hardLimit: 10000 });
  } else {
    const registrations = await loadAllRegistrations(env);
    revenueRegistrations = registrations;
    for (const registration of registrations) {
      totalRegistered += 1;
      if (registration.status === "verified") totalVerified += 1;
      if (registration.stripeAccountId) {
        connectedStripeAccounts += 1;
        connected.push(registration);
      }

      const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
      if (received && !Number.isNaN(received.getTime()) && received.getUTCFullYear() === year) {
        monthly[received.getUTCMonth()].registered += 1;
        if (registration.status === "verified") monthly[received.getUTCMonth()].verified += 1;
      }
    }
  }

  let donationDataSource = "not_configured";
  let donationError = "";
  const donationFeeRevenue = emptyDonationFeeSummary(now);

  if (env.STRIPE_SECRET_KEY && connected.length) {
    donationDataSource = "stripe";
    donationFeeRevenue.dataSource = "stripe";
    donationFeeRevenue.connectedAccounts = connected.length;
    for (const registration of connected) {
      const result = await listYtdStripeCharges(env, registration.stripeAccountId);
      if (!result.ok) {
        donationDataSource = "partial";
        donationFeeRevenue.dataSource = "partial";
        donationError = result.body?.error?.message || "Stripe giving summary failed for at least one parish.";
        donationFeeRevenue.note = donationError;
        continue;
      }

      const summary = summarizeCharges(result.body.data || []);
      for (const month of summary.monthly) {
        const target = monthly[month.month - 1];
        target.ytdDonationsCents += month.amountCents || 0;
        target.giftCount += month.giftCount || 0;
        if (month.month === donationFeeRevenue.month) {
          donationFeeRevenue.agapayFeeCents += month.agapayFeeCents || 0;
          donationFeeRevenue.grossGiftCents += month.grossGiftCents || 0;
          donationFeeRevenue.netDonationCents += month.amountCents || 0;
          donationFeeRevenue.giftCount += month.giftCount || 0;
        }
      }
    }
  } else if (!connected.length) {
    donationDataSource = "not_connected";
    donationFeeRevenue.dataSource = "not_connected";
  }
  if (donationFeeRevenue.dataSource === "stripe") {
    donationFeeRevenue.note = "Current-month AGAPAY application fees from successful connected Stripe gifts.";
  }

  const ytdDonationsCents = monthly.reduce((sum, item) => sum + item.ytdDonationsCents, 0);
  const giftCount = monthly.reduce((sum, item) => sum + item.giftCount, 0);
  const subscriptionRevenue = buildSubscriptionRevenueSummary(revenueRegistrations);

  return json({
    summary: {
      year,
      generatedAt: now.toISOString(),
      totalRegistered,
      totalVerified,
      connectedStripeAccounts,
      ytdDonationsCents,
      giftCount,
      revenue: {
        subscriptionRevenue,
        donationFeeRevenue
      },
      donationDataSource,
      donationError,
      monthly
    }
  });
}

export async function handleAdminRegistrationGivingSummary(request, env, reference) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (!registration.stripeAccountId) {
    return json({
      summary: {
        dataSource: "not_connected",
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: "",
        monthly: []
      }
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      summary: {
        dataSource: "not_configured",
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: "",
        monthly: []
      }
    });
  }

  const result = await listYtdStripeCharges(env, registration.stripeAccountId);
  if (!result.ok) {
    return json(
      { error: "Unable to load Stripe giving summary", detail: result.body?.error?.message || "Stripe request failed" },
      { status: 502 }
    );
  }

  const summary = summarizeCharges(result.body?.data || []);
  return json({
    summary: {
      ...summary,
      dataSource: "stripe",
      stripeAccountId: registration.stripeAccountId
    }
  });
}

export async function handleAdminReleaseStatus(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();

  let registrationCount = 0;
  let verifiedCount = 0;
  let stripeReadyCount = 0;
  let subscriptionReadyCount = 0;
  if (hasProductionStore(env) && d1(env)) {
    const row = await d1First(
      env,
      `SELECT
         COUNT(*) AS registration_count,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.stripeAccountStatus') IN ('charges_enabled', 'payouts_enabled') THEN 1 ELSE 0 END) AS stripe_ready_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.subscriptionStatus') IN ('active', 'free_forever') THEN 1 ELSE 0 END) AS subscription_ready_count
       FROM registrations`
    );
    registrationCount = Number(row?.registration_count || 0);
    verifiedCount = Number(row?.verified_count || 0);
    stripeReadyCount = Number(row?.stripe_ready_count || 0);
    subscriptionReadyCount = Number(row?.subscription_ready_count || 0);
  } else if (hasProductionStore(env)) {
    const registrations = await loadAllRegistrations(env);
    const verified = registrations.filter((registration) => registration.status === "verified");
    registrationCount = registrations.length;
    verifiedCount = verified.length;
    stripeReadyCount = verified.filter((registration) => stripeReady(registration)).length;
    subscriptionReadyCount = verified.filter((registration) => subscriptionReady(registration)).length;
  }
  const storedAdminPassword = d1(env)
    ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
    : env.AGAPAY_REGISTRATIONS
      ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
      : "";

  return json({
    ok: true,
    releaseStatus: {
      checkedAt: new Date().toISOString(),
      storeMode: d1(env) ? "d1" : (env.AGAPAY_REGISTRATIONS ? "kv" : "none"),
      productionStoreConfigured: hasProductionStore(env),
      d1Configured: Boolean(d1(env)),
      kvConfigured: Boolean(env.AGAPAY_REGISTRATIONS),
      stripeSecretConfigured: Boolean(env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      stripeConnectWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET_CONNECT),
      resendConfigured: Boolean(env.RESEND_API_KEY),
      appUrlConfigured: Boolean(env.AGAPAY_APP_URL),
      turnstileConfigured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      adminPasswordConfigured: Boolean(storedAdminPassword || env.AGAPAY_ADMIN_TOKEN),
      registrationCount,
      verifiedCount,
      stripeReadyCount,
      subscriptionReadyCount,
      // Actual feature-flag values, not just whether something is configured --
      // see wrangler.toml [vars] for what each one gates. Admin-only (this
      // whole endpoint requires requireAdmin above); these are toggles, not
      // secrets, so safe to surface for diagnostics.
      featureFlags: {
        AGAPAY_ENABLE_KV_MIGRATION: env.AGAPAY_ENABLE_KV_MIGRATION === "true",
        SUBSCRIPTION_TAX_CODES_ENABLED: env.SUBSCRIPTION_TAX_CODES_ENABLED === "true",
        LEARN_PERSISTED_CUSTOMER_ENFORCED: env.LEARN_PERSISTED_CUSTOMER_ENFORCED === "true",
        PARISH_COMMERCE_READINESS_ENABLED: env.PARISH_COMMERCE_READINESS_ENABLED === "true",
        PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW: env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW === "true",
        PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL: env.PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL === "true",
        TAX_EXEMPTION_WORKFLOW_ENABLED: env.TAX_EXEMPTION_WORKFLOW_ENABLED === "true",
        TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED: env.TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED === "true",
        TAX_EXEMPTION_STRIPE_SYNC_ENABLED: env.TAX_EXEMPTION_STRIPE_SYNC_ENABLED === "true"
      }
    }
  });
}

export async function handleAdminRebuildIndexes(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-maintenance", { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registrations = await loadAllRegistrations(env);
  let indexed = 0;
  for (const registration of registrations) {
    if (!registration.reference || registration.status === "unreadable") continue;
    await saveRegistrationRecord(env, registration.reference, registration, registration);
    indexed += 1;
  }

  const rebuiltAt = new Date().toISOString();
  await recordAuditEvent(env, request, {
    action: "admin.index_rebuild",
    actorUserId: adminContext.actor,
    targetType: "registrations",
    after: { indexed, rebuiltAt }
  });

  return json({ ok: true, indexed, rebuiltAt });
}

export async function handleAdminSession(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (request.method === "DELETE") {
    return json({ ok: true });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = String(body.password || body.adminPassword || "").trim();
  if (!password) return unauthorized();
  const accountLimited = await rateLimitByKey(request, env, "admin-auth-account", "admin", { limit: 20, windowSeconds: 300 });
  if (accountLimited) return accountLimited;

  let valid = false;
  if (hasProductionStore(env)) {
    const stored = d1(env)
      ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
      : await env.AGAPAY_REGISTRATIONS?.get(ADMIN_PASSWORD_KV_KEY);
    const parsed = parsePasswordRecord(stored);
    if (parsed) valid = await verifyPasswordRecord(password, parsed);
  }
  if (!valid && env.AGAPAY_ADMIN_TOKEN && password === env.AGAPAY_ADMIN_TOKEN) valid = true;
  if (!valid && env.AGAPAY_ADMIN_PASSWORD && password === env.AGAPAY_ADMIN_PASSWORD) valid = true;
  if (!valid) return unauthorized();

  const session = await issueAdminSession(env, "Admin");
  return json({ ok: true, ...session });
}

export async function handleAdminPassword(request, env) {
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-password", { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newPassword = String(body.newAdminPassword || "").trim();
  const confirmPassword = String(body.confirmAdminPassword || "").trim();
  if (newPassword.length < 12) {
    return json({ error: "Admin password must be at least 12 characters." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return json({ error: "Admin passwords do not match." }, { status: 400 });
  }
  if (newPassword === env.AGAPAY_ADMIN_TOKEN) {
    return json({ error: "Choose a password different from the Cloudflare root secret." }, { status: 400 });
  }

  const passwordRecord = JSON.stringify(await createPasswordRecord(newPassword));
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await d1SetSetting(env, ADMIN_SESSION_STORE_KEY, JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() }));
  } else {
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_SESSION_STORE_KEY, JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() }));
  }
  return json({ ok: true, updatedAt: new Date().toISOString(), sessionsInvalidated: true });
}

export async function handleAdminRegistrationDetail(request, env, reference) {
  const limited = await rateLimit(
    request,
    env,
    request.method === "PATCH" ? "admin-registration-write" : "admin-auth",
    { limit: request.method === "PATCH" ? 30 : 80, windowSeconds: 300 }
  );
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === "GET") {
    const registration = await loadRegistrationByReference(env, reference);
    if (!registration) return json({ error: "Registration not found" }, { status: 404 });
    return json({ registration: withTaxReadinessDefaults(registration) });
  }

  if (request.method === "PATCH") {
    const current = await loadRegistrationByReference(env, reference);
    if (!current) return json({ error: "Registration not found" }, { status: 404 });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const nextStatus = body.status || current.status;
    const reviewedByNext = body.reviewedBy ?? current.reviewedBy ?? "";
    const verificationSourceNext = body.verificationSource ?? current.verificationSource ?? "";
    const bishopOrAuthorityNext = body.bishopOrAuthority ?? current.bishopOrAuthority ?? "";
    const dioceseOrDeaneryNext = body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? "";

    // Tax readiness is a manual admin decision, separate from canonical
    // verification -- see src/lib/tax-readiness.js. A blank/unknown value
    // in the body is never treated as "clear the status"; it just means
    // this PATCH didn't touch it.
    const currentTaxReadinessStatus = TAX_READINESS_STATUSES.includes(current.taxReadinessStatus)
      ? current.taxReadinessStatus
      : "tax_needs_review";
    const nextTaxReadinessStatus = TAX_READINESS_STATUSES.includes(body.taxReadinessStatus)
      ? body.taxReadinessStatus
      : currentTaxReadinessStatus;
    const taxReadinessStatusChanged = nextTaxReadinessStatus !== currentTaxReadinessStatus;

    if (nextStatus === "verified") {
      const missing = [];
      if (!String(reviewedByNext || "").trim()) missing.push("reviewedBy");
      if (!String(verificationSourceNext || "").trim()) missing.push("verificationSource");
      if (!String(bishopOrAuthorityNext || "").trim()) missing.push("bishopOrAuthority");
      if (!String(dioceseOrDeaneryNext || "").trim()) missing.push("dioceseOrDeanery");
      if (missing.length) {
        return json(
          {
            error: "Canonical verification is incomplete. Fill reviewer name, verification source, bishop/authority, and diocese/deanery before marking verified.",
            missing
          },
          { status: 422 }
        );
      }
    }

    const parishId = nextStatus === "verified"
      ? current.parishId || parishSlug(current.parishName, current.city)
      : current.parishId;
    const requestedDashboardToken = body.parishDashboardToken !== undefined
      ? String(body.parishDashboardToken || "").trim()
      : String(current.parishDashboardToken || "").trim();
    const parishDashboardToken = nextStatus === "verified" && !requestedDashboardToken
      ? generateDashboardToken()
      : requestedDashboardToken;
    const nextSubscriptionTierId = body.subscriptionTier || current.subscriptionTier || defaultSubscriptionTier(current);
    const nextTier = subscriptionTier(nextSubscriptionTierId) || subscriptionTier(defaultSubscriptionTier(current));
    const nextSubscriptionStatus = nextTier?.monthlyCents === 0
      ? "free_forever"
      : body.subscriptionStatus || current.subscriptionStatus || "not_started";
    let updated = {
      ...current,
      status: nextStatus,
      parishId,
      parishUsername: current.parishUsername || parishId,
      givingStatus: body.givingStatus || current.givingStatus || (nextStatus === "verified" ? "active" : "hidden"),
      stripeAccountStatus: body.stripeAccountStatus || current.stripeAccountStatus || "not_started",
      stripeAccountId: body.stripeAccountId ?? current.stripeAccountId ?? "",
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext,
      platformFee: body.platformFee ?? current.platformFee ?? "",
      liturgicalCalendar: body.liturgicalCalendar ?? current.liturgicalCalendar ?? "julian",
      subscriptionTier: nextTier?.id || nextSubscriptionTierId,
      subscriptionTierLabel: nextTier?.label || current.subscriptionTierLabel || "",
      subscriptionMonthlyCents: nextTier?.monthlyCents ?? current.subscriptionMonthlyCents ?? null,
      subscriptionStatus: nextSubscriptionStatus,
      stripeCustomerId: body.stripeCustomerId ?? current.stripeCustomerId ?? "",
      stripeSubscriptionId: body.stripeSubscriptionId ?? current.stripeSubscriptionId ?? "",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishDashboardToken,
      parishDashboardTokenTemporary: Boolean(parishDashboardToken),
      parishDashboardTokenCreatedAt: parishDashboardToken && parishDashboardToken !== current.parishDashboardToken
        ? new Date().toISOString()
        : current.parishDashboardTokenCreatedAt,
      reviewerNotes: body.reviewerNotes ?? current.reviewerNotes ?? "",
      // Tax readiness / billing (see src/lib/tax-readiness.js) -- kept
      // separate from canonical `status` above by design.
      taxReadinessStatus: nextTaxReadinessStatus,
      taxReadinessNotes: body.taxReadinessNotes ?? current.taxReadinessNotes ?? "",
      taxReadinessReviewedAt: taxReadinessStatusChanged ? new Date().toISOString() : (current.taxReadinessReviewedAt || ""),
      taxReadinessReviewedBy: taxReadinessStatusChanged ? adminContext.actor : (current.taxReadinessReviewedBy || ""),
      billingLegalName: body.billingLegalName ?? current.billingLegalName ?? "",
      billingAddressLine1: body.billingAddressLine1 ?? current.billingAddressLine1 ?? "",
      billingAddressLine2: body.billingAddressLine2 ?? current.billingAddressLine2 ?? "",
      billingCity: body.billingCity ?? current.billingCity ?? "",
      billingState: body.billingState ?? current.billingState ?? "",
      billingPostalCode: body.billingPostalCode ?? current.billingPostalCode ?? "",
      billingCountry: body.billingCountry ?? current.billingCountry ?? "",
      statusTimeline: statusTimelineWithNext(current.status, nextStatus, current.statusTimeline),
      stripeStatusHistory: statusTimelineWithNext(
        current.stripeAccountStatus || "not_started",
        body.stripeAccountStatus || current.stripeAccountStatus || "not_started",
        current.stripeStatusHistory
      ),
      subscriptionStatusHistory: statusTimelineWithNext(
        current.subscriptionStatus || "not_started",
        nextSubscriptionStatus,
        current.subscriptionStatusHistory
      ),
      lastWorkflowEventAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt: nextStatus === "verified"
        ? current.publicProfileCreatedAt || new Date().toISOString()
        : current.publicProfileCreatedAt
    };

    const reviewerNote = String(body.reviewerNotes || "").trim();
    if (reviewerNote) {
      const nextHistory = Array.isArray(current.notesHistory) ? [...current.notesHistory] : [];
      nextHistory.push({
        author: normalizeAdminActor(reviewedByNext || adminContext.actor),
        text: reviewerNote,
        createdAt: new Date().toISOString()
      });
      updated.notesHistory = nextHistory.slice(-200);
    }

    if (nextStatus !== current.status) {
      updated = appendAdminAudit(updated, "status_changed", adminContext.actor, {
        from: current.status || "pending",
        to: nextStatus
      });
    }
    if ((body.subscriptionStatus || current.subscriptionStatus || "not_started") !== (current.subscriptionStatus || "not_started")) {
      updated = appendAdminAudit(updated, "subscription_status_changed", adminContext.actor, {
        from: current.subscriptionStatus || "not_started",
        to: body.subscriptionStatus || current.subscriptionStatus || "not_started"
      });
    }
    if ((body.stripeAccountStatus || current.stripeAccountStatus || "not_started") !== (current.stripeAccountStatus || "not_started")) {
      updated = appendAdminAudit(updated, "stripe_status_changed", adminContext.actor, {
        from: current.stripeAccountStatus || "not_started",
        to: body.stripeAccountStatus || current.stripeAccountStatus || "not_started"
      });
    }
    if (reviewerNote) {
      updated = appendAdminAudit(updated, "review_note_added", reviewedByNext || adminContext.actor, {
        notePreview: reviewerNote.slice(0, 160)
      });
    }

    let dashboardInvite = null;
    if (body.sendDashboardInvite && nextStatus === "verified") {
      const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
      dashboardInvite = await sendDashboardInvite(env, appUrl, updated);
      updated = {
        ...updated,
        dashboardInviteEmailStatus: dashboardInvite.status,
        dashboardInviteEmailId: dashboardInvite.id || "",
        dashboardInviteEmailDetail: dashboardInvite.detail || "",
        dashboardInviteEmailRecipients: dashboardInvite.recipients || [],
        dashboardInviteEmailSentAt: dashboardInvite.status === "sent"
          ? new Date().toISOString()
          : updated.dashboardInviteEmailSentAt
      };
      updated = appendAdminAudit(updated, "dashboard_invite_requested", adminContext.actor, {
        emailStatus: dashboardInvite.status || "unknown",
        recipients: dashboardInvite.recipients || []
      });
    }

    await saveRegistrationRecord(env, reference, updated, current);

    if (nextStatus !== current.status) {
      await recordAuditEvent(env, request, {
        action: "registration.status_changed",
        actorUserId: adminContext.actor,
        targetType: "registration",
        targetId: reference,
        organizationId: parishId || reference,
        reason: reviewerNote || null,
        before: { status: current.status || "pending" },
        after: { status: nextStatus }
      });
    }

    if (taxReadinessStatusChanged) {
      await recordAuditEvent(env, request, {
        action: "registration.tax_readiness_changed",
        actorUserId: adminContext.actor,
        targetType: "registration",
        targetId: reference,
        organizationId: parishId || reference,
        reason: (body.taxReadinessNotes || "").trim() || null,
        before: { taxReadinessStatus: currentTaxReadinessStatus },
        after: { taxReadinessStatus: nextTaxReadinessStatus }
      });
    }

    return json({ ok: true, registration: updated, dashboardInvite });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

export async function createSubscriptionCheckoutForRegistration(request, env, reference, registration, body = {}, returnPath = "/admin") {
  return createSubscriptionCheckoutForRegistrationShared({
    request,
    env,
    reference,
    registration,
    body,
    returnPath,
    saveRegistrationRecord
  });
}

// Phase 6 -- admin audit-log viewer. Read-only; recordAuditEvent() (in
// ../lib/audit-log.js) is the only write path into this table.
export async function handleAdminAuditLog(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const url = new URL(request.url);
  const result = await listAuditEvents(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor") || "",
    action: url.searchParams.get("action") || "",
    actorUserId: url.searchParams.get("actor") || "",
    actorType: url.searchParams.get("actorType") || "",
    targetType: url.searchParams.get("targetType") || "",
    targetId: url.searchParams.get("targetId") || "",
    organizationId: url.searchParams.get("organization") || "",
    since: url.searchParams.get("since") || "",
    until: url.searchParams.get("until") || ""
  });

  return json(result);
}
