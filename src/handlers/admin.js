import {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_STORE_KEY,
  applyParishDashboardPassword,
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
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail,
  parishIdIndexKey,
  parseJsonRow,
  parsePasswordRecord,
  privilegedMfaRequired,
  rateLimit,
  rateLimitByKey,
  recordStripeEvent,
  safeParseJsonRow,
  saveDonor,
  verifyPasswordRecord,
  STRIPE_EVENT_PREFIX,
  stripeAccountIndexKey,
  stripePaymentIntentIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
} from "../lib/core.js";
import { beginMfaAuthentication } from "../lib/mfa.js";

import { loadAdminRegistrationPage } from "../lib/registrations.js";

import {
  monthLabel,
  parishSlug,
  slugify,
} from "../lib/format.js";

import {
  defaultSubscriptionTier,
  normalizeParishHouseholdBand,
  subscriptionReady,
  subscriptionTier,
} from "../lib/subscriptions.js";

import {
  createSubscriptionCheckoutForRegistration as createSubscriptionCheckoutForRegistrationShared,
} from "../lib/subscription-checkout.js";

import {
  generateDashboardToken,
  sendDashboardInvite,
} from "../lib/parish-notifications.js";
import { listMembershipsForParish } from "../lib/memberships.js";


import {
  listYtdStripeCharges,
  stripeAccountStatus,
  stripeFormRequest,
  stripeReady,
  summarizeCharges,
} from "../lib/stripe-connect.js";

import {
  appendAdminAudit,
  findRegistrationByParishId,
  loadRegistrationByReference,
  requireAdmin,
  requireAdminContext,
  saveRegistrationRecord,
  statusTimelineWithNext,
  storeDonorOffering,
} from "./parish.js";
import { saveCommemorationEntry } from "./parish-commemorations.js";

import { recordAuditEvent, listAuditEvents } from "../lib/audit-log.js";
import { TAX_READINESS_STATUSES, withTaxReadinessDefaults } from "../lib/tax-readiness.js";
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  normalizeOnboardingChecks,
  onboardingWorkflowEnabled,
  recommendedOnboardingState,
} from "../lib/parish-onboarding.js";
import { accountingEnabledFor, accountingTierFor } from "../lib/entitlements.js";
import { ensureBenevolenceFundInRegistration } from "../lib/stewardship-funds.js";
import { evaluateOnboardingVerification } from "../organizations/verification-policies.js";
import { accountingHealthOverview, activatePreparedParishAccounting, activateProtectiveState, createBoundD1ProvisioningAdapter, detectAccountingEnvironment, releaseProtectiveState, runIntegrityScan, verifyRecoveryEvidence } from "../accounting/index.js";
import { resolveAccountingDatabaseForParish } from "./accounting-ledger.js";

export { requireAdmin };

export {
  handleAdminLearnCommunity,
  handleAdminLearnFeedback,
  handleAdminLearnScholarship,
  handleAdminLearnSummary,
  handleAdminParishSupportTickets,
} from "./admin-learning-support.js";

export { handleAdminEmailDiagnostics } from "./admin-email-diagnostics.js";

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

// AGAPAY no longer charges a donation platform fee (see checkoutFinancials
// in src/handlers/parish.js) -- AGAPAY's revenue is the parish subscription
// plan. This summary now reflects legacy/historical application-fee
// revenue only; new gifts will always report agapayFeeCents: 0.
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
    note: "AGAPAY no longer charges a donation fee; this reflects legacy application-fee revenue from before the change."
  };
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
    donationFeeRevenue.note = "AGAPAY no longer charges a donation fee; this month's total reflects any legacy application fees still settling from before the change.";
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
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.subscriptionStatus') IN ('active', 'trialing', 'free_forever') THEN 1 ELSE 0 END) AS subscription_ready_count
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
      nonprofitPricingDocsConfigured: Boolean(env.NONPROFIT_PRICING_DOCS),
      nonprofitPricingAlertEmailConfigured: Boolean(env.NONPROFIT_PRICING_ALERT_EMAIL),
      adminPasswordConfigured: Boolean(storedAdminPassword),
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

  const stored = hasProductionStore(env)
    ? d1(env)
      ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
      : await env.AGAPAY_REGISTRATIONS?.get(ADMIN_PASSWORD_KV_KEY)
    : "";
  if (!(await verifyPasswordRecord(password, stored))) return unauthorized();

  const actor = normalizeAdminActor(body.actor || "Admin");
  if (privilegedMfaRequired(env)) {
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: "platform_admin",
        principalId: "platform",
        purpose: "login",
        metadata: { actor },
      })),
    });
  }
  const session = await issueAdminSession(env, actor);
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
    const normalized = withTaxReadinessDefaults(registration);
    return json({
      registration: {
        ...normalized,
        onboardingWorkflow: await buildParishOnboardingWorkflow(normalized, {
          appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
          receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app"
        }),
        onboardingTestMode: stagingOnboardingTestMode(env)
      }
    });
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
    const enteringVerified = nextStatus === "verified" && current.status !== "verified";
    const reviewedByNext = body.reviewedBy ?? current.reviewedBy ?? "";
    const verificationSourceNext = body.verificationSource ?? current.verificationSource ?? "";
    const bishopOrAuthorityNext = body.bishopOrAuthority ?? current.bishopOrAuthority ?? "";
    const dioceseOrDeaneryNext = body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? "";
    const onboardingVerification = evaluateOnboardingVerification({
      ...current,
      status: nextStatus,
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext
    });

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

    if (nextStatus === "verified" && !onboardingVerification.passed) {
      return json(
        {
          error: onboardingVerification.incompleteMessage,
          missing: onboardingVerification.missingFields
        },
        { status: 422 }
      );
    }

    const parishId = nextStatus === "verified"
      ? current.parishId || parishSlug(current.parishName, current.city)
      : current.parishId;
    const requestedDashboardToken = body.parishDashboardToken !== undefined
      ? String(body.parishDashboardToken || "").trim()
      : String(current.parishDashboardToken || "").trim();
    const parishDashboardToken = nextStatus === "verified" && !requestedDashboardToken && !d1(env)
      ? generateDashboardToken()
      : requestedDashboardToken;
    const nextSubscriptionTierId = body.subscriptionTier || current.subscriptionTier || defaultSubscriptionTier(current);
    const nextParishHouseholdBand = normalizeParishHouseholdBand(body.parishHouseholdBand ?? current.parishHouseholdBand);
    const nextTier = subscriptionTier({ ...current, subscriptionTier: nextSubscriptionTierId, parishHouseholdBand: nextParishHouseholdBand }) || subscriptionTier({ ...current, subscriptionTier: defaultSubscriptionTier(current), parishHouseholdBand: nextParishHouseholdBand });
    const nextSubscriptionStatus = nextTier?.monthlyCents === 0
      ? "free_forever"
      : body.subscriptionStatus || current.subscriptionStatus || "not_started";
    let updated = {
      ...current,
      status: nextStatus,
      parishId,
      parishUsername: current.parishUsername || parishId,
      givingStatus: enteringVerified
        ? "hidden"
        : (onboardingWorkflowEnabled(current) && current.onboardingState !== "LIVE" && body.givingStatus === "active")
          ? "hidden"
          : body.givingStatus || current.givingStatus || "hidden",
      // Stripe connection state is owned by parish-led Stripe onboarding and
      // verified server-side. Never accept these fields from an Admin form:
      // a stale open page could otherwise erase a connection made moments ago.
      stripeAccountStatus: current.stripeAccountStatus || "not_started",
      stripeAccountId: current.stripeAccountId || "",
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext,
      platformFee: body.platformFee ?? current.platformFee ?? "",
      liturgicalCalendar: body.liturgicalCalendar ?? current.liturgicalCalendar ?? "julian",
      subscriptionTier: nextTier?.id || nextSubscriptionTierId,
      parishHouseholdBand: nextParishHouseholdBand || current.parishHouseholdBand || "",
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
        current.stripeAccountStatus || "not_started",
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
    if (nextStatus === "verified") {
      updated = {
        ...updated,
        onboardingWorkflowVersion: Math.max(
          Number(current.onboardingWorkflowVersion || 0),
          PARISH_ONBOARDING_WORKFLOW_VERSION
        ),
        onboardingChecks: normalizeOnboardingChecks(
          body.onboardingChecks,
          current.onboardingChecks,
          adminContext.actor
        )
      };
      updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks);
    }
    if (nextTier?.modules?.givingPlus) {
      updated = ensureBenevolenceFundInRegistration(updated).registration;
    }

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
          : updated.dashboardInviteEmailSentAt,
        onboardingAccess: dashboardInvite.access
          ? { ...(updated.onboardingAccess || {}), ...dashboardInvite.access }
          : updated.onboardingAccess
      };
      updated = appendAdminAudit(updated, "dashboard_invite_requested", adminContext.actor, {
        emailStatus: dashboardInvite.status || "unknown",
        recipients: dashboardInvite.recipients || []
      });
    }

    if (nextStatus === "verified") {
      updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks);
    }
    updated = await invalidateOnboardingSignoffIfChanged(current, updated, {
      actor: adminContext.actor,
      reason: "AGAPAY Admin changed material onboarding configuration.",
      receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app"
    });

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

    return json({
      ok: true,
      registration: {
        ...updated,
        onboardingWorkflow: await buildParishOnboardingWorkflow(updated, {
          appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
          receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app"
        }),
        onboardingTestMode: stagingOnboardingTestMode(env)
      },
      dashboardInvite
    });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

function stagingOnboardingTestMode(env = {}) {
  return ["development", "local", "preview", "staging", "test"]
    .includes(String(env.AGAPAY_ENVIRONMENT || "").trim().toLowerCase());
}

function stagingGeneralFund(funds = []) {
  const active = (Array.isArray(funds) ? funds : []).filter((fund) => fund && fund.enabled !== false && fund.active !== false);
  const isGeneral = (fund) => {
    const values = [fund.id, fund.code, fund.reportCode, fund.name].map((value) => String(value || "").trim().toLowerCase());
    return values.some((value) => ["general", "stewardship", "general operating fund", "general stewardship"].includes(value));
  };
  const general = active.find(isGeneral);
  if (general) {
    let keptGeneral = false;
    return (Array.isArray(funds) ? funds : []).map((fund) => {
      if (!isGeneral(fund) || fund.enabled === false || fund.active === false) return fund;
      if (!keptGeneral) {
        keptGeneral = true;
        return {
          ...fund,
          id: "general",
          code: "general",
          restrictionType: "unrestricted",
          isDefault: true,
          enabled: true,
          active: true,
          donorVisible: true,
          givingEnabled: true,
          accountingFundId: "fund_general"
        };
      }
      return { ...fund, enabled: false, active: false };
    });
  }
  return [{
    id: "general",
    name: "General Operating Fund",
    description: "Unrestricted parish operations",
    restrictionType: "unrestricted",
    isDefault: true,
    enabled: true,
    active: true,
    donorVisible: true,
    givingEnabled: true,
    accountingFundId: "fund_general"
  }, ...(Array.isArray(funds) ? funds : [])];
}

export async function handleAdminOnboardingTest(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!stagingOnboardingTestMode(env)) {
    return json({ error: "Onboarding test controls are disabled outside non-production environments." }, { status: 403 });
  }
  const limited = await rateLimit(request, env, "admin-onboarding-test", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const current = await loadRegistrationByReference(env, reference);
  if (!current) return json({ error: "Registration not found" }, { status: 404 });
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "").trim();
  if (!["prepare_ready", "simulate_stripe_ready", "pass_manual_gates", "reset_signoff", "reset_workflow"].includes(action)) {
    return json({ error: "Unknown staging onboarding action." }, { status: 422 });
  }

  const now = new Date().toISOString();
  const actor = `${adminContext.actor} (staging test)`;
  const allPassed = Object.fromEntries([
    "authorizedRepresentative", "givingConfiguration"
  ].map((key) => [key, { status: "passed", evidence: "staging-simulation", note: "Passed by the staging workflow test control." }]));
  allPassed.importDecision = { status: "not_applicable", evidence: "staging-simulation", note: "No donor import is required for this staging exercise." };
  const allReset = Object.fromEntries([
    "authorizedRepresentative", "givingConfiguration", "importDecision"
  ].map((key) => [key, { status: "not_started", evidence: "", note: "" }]));
  let updated = {
    ...current,
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    givingStatus: "hidden",
    treasurerSignoff: null,
    goLiveAt: "",
    goLiveBy: "",
    parishUpdatedAt: now
  };
  let stagingPassword = "";
  let memberships = [];

  if (action === "simulate_stripe_ready" || action === "prepare_ready") {
    const stagingAccountId = `acct_staging_${String(updated.parishId || reference).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
    updated = {
      ...updated,
      stripeAccountId: stagingAccountId,
      stripeAccountStatus: "payouts_enabled",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeDisabledReason: "",
      stripeRequirementsDue: [],
      stripeStatusCheckedAt: now,
      stripePayoutBankName: "AGAPAY Staging Bank",
      stripePayoutBankLast4: "4242",
      onboardingStripeTestFixture: {
        id: stagingAccountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [] },
        external_accounts: {
          data: [{ object: "bank_account", bank_name: "AGAPAY Staging Bank", last4: "4242" }]
        }
      }
    };
  }
  if (action === "pass_manual_gates" || action === "prepare_ready") {
    updated.onboardingChecks = normalizeOnboardingChecks(allPassed, updated.onboardingChecks, actor, now);
  }
  if (action === "reset_workflow") {
    updated.onboardingChecks = normalizeOnboardingChecks(allReset, updated.onboardingChecks, actor, now);
    if (String(updated.stripeAccountId || "").startsWith("acct_staging_")) {
      updated = {
        ...updated,
        stripeAccountId: "",
        stripeAccountStatus: "not_started",
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: false,
        stripeDisabledReason: "",
        stripeRequirementsDue: [],
        stripeStatusCheckedAt: "",
        stripePayoutBankName: "",
        stripePayoutBankLast4: "",
        onboardingStripeTestFixture: null
      };
    }
  }
  if (action === "prepare_ready") {
    if (!normalizeEmail(updated.treasurerEmail) || !normalizeEmail(updated.priestEmail)) {
      return json({ error: "A priest email and treasurer email are required before preparing the signoff exercise." }, { status: 422 });
    }
    const tier = subscriptionTier(updated);
    stagingPassword = generateSecret("Agapay-Staging");
    updated = await applyParishDashboardPassword({
      ...updated,
      status: "verified",
      parishId: updated.parishId || parishSlug(updated.parishName, updated.city),
      parishUsername: updated.parishUsername || updated.parishId || parishSlug(updated.parishName, updated.city),
      reviewedBy: updated.reviewedBy || actor,
      verificationSource: updated.verificationSource || "Staging canonical directory fixture",
      bishopOrAuthority: updated.bishopOrAuthority || "Staging diocesan authority",
      dioceseOrDeanery: updated.dioceseOrDeanery || "Staging deanery",
      dashboardInviteEmailStatus: "sent",
      dashboardInviteEmailSentAt: updated.dashboardInviteEmailSentAt || now,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionMonthlyCents: tier.monthlyCents,
      subscriptionStatus: tier.monthlyCents === 0 ? "free_forever" : "trialing",
      funds: stagingGeneralFund(updated.funds),
      onboardingChecks: normalizeOnboardingChecks(allPassed, updated.onboardingChecks, actor, now),
      parishDashboardSessions: []
    }, stagingPassword, { temporary: false });

    updated.onboardingAccess = {};
  }

  if (d1(env) && updated.parishId && !memberships.length) {
    memberships = await listMembershipsForParish(env, updated.parishId);
  }
  updated.onboardingState = recommendedOnboardingState(updated, updated.onboardingChecks, { memberships });
  updated = appendAdminAudit(updated, `staging_onboarding_${action}`, actor, { environment: env.AGAPAY_ENVIRONMENT || "non-production" });
  await saveRegistrationRecord(env, reference, updated, current);
  const onboardingWorkflow = await buildParishOnboardingWorkflow(updated, {
    appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    memberships
  });
  return json({
    ok: true,
    action,
    stagingPassword: stagingPassword || undefined,
    registration: { ...updated, onboardingWorkflow, onboardingTestMode: true }
  });
}

export async function createSubscriptionCheckoutForRegistration(request, env, reference, registration, body = {}, returnPath = "/admin") {
  return createSubscriptionCheckoutForRegistrationShared({
    request,
    env,
    reference,
    registration,
    body,
    returnPath,
    allowTrial: true,
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

const ADMIN_ACCOUNTING_ACTOR=Object.freeze({id:"accounting-integrity-operator",type:"system",capabilities:Object.freeze(["accounting.integrity.view","accounting.integrity.scan","accounting.integrity.protect","accounting.recovery.verify"])});
const PROTECTIVE_STATES=new Set(["normal","degraded_read_only","posting_blocked","recovering"]);
const accountingRows=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];
const accountingServiceTier=tier=>tier==="advanced_operations"||tier==="parish"?"parish":"mission";
function preparedAccountingDatabase(env,parishId){let configured={};try{configured=JSON.parse(String(env.ACCOUNTING_PREPARED_PARISH_DATABASES||"{}"));}catch{return"";}const identifier=configured?.[parishId];return typeof identifier==="string"?identifier.trim():"";}
async function listAdminAccountingTargets(env){const environment=detectAccountingEnvironment(env),canaryParishId=String(env.ACCOUNTING_CANARY_PARISH_ID||"").trim();const rows=await d1All(env,`SELECT e.parish_id parishId,e.subscription_tier subscriptionTier,e.entity_status entityStatus,e.activation_status activationStatus,d.provisioning_status provisioningStatus,d.health_status healthStatus FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id WHERE e.entity_status='ready' AND e.activation_status='active' AND d.environment=? AND d.provisioning_status='ready' ORDER BY e.parish_id`,environment);return rows.map(row=>Object.freeze({parishId:row.parishId,subscriptionTier:accountingServiceTier(row.subscriptionTier),entityStatus:row.entityStatus,activationStatus:row.activationStatus,provisioningStatus:row.provisioningStatus,healthStatus:row.healthStatus,internalCanary:Boolean(canaryParishId&&row.parishId===canaryParishId)}));}
async function adminAccountingTarget(env,parishId){const resolved=await resolveAccountingDatabaseForParish(env,parishId);if(!resolved.entity||resolved.entity.entityStatus!=="ready"||resolved.entity.activationStatus!=="active"||resolved.registry?.provisioningStatus!=="ready")return{error:json({error:"Parish accounting is not provisioned."},{status:409})};if(!resolved.db)return{error:json({error:"Parish accounting database is unavailable."},{status:503})};const tier=resolved.registration?accountingTierFor(resolved.registration):resolved.entity.subscriptionTier;return{...resolved,tier:accountingServiceTier(tier)};}
export async function handleAdminAccountingOperations(request,env){const admin=await requireAdminContext(request,env);if(!admin)return unauthorized();const url=new URL(request.url),path=url.pathname,body=request.method==="GET"?{}:await request.json().catch(()=>({}));try{
if(request.method==="GET"&&path==="/api/admin/accounting/targets")return json({ok:true,environment:detectAccountingEnvironment(env),targets:await listAdminAccountingTargets(env)});
const parishId=String(request.method==="GET"?url.searchParams.get("parishId")||"":body.parishId||"").trim();if(!parishId)return json({error:"parishId is required."},{status:422});
if(request.method==="POST"&&path==="/api/admin/accounting/activate-prepared"){const environment=detectAccountingEnvironment(env);if(environment==="production")return json({error:"Prepared database activation is unavailable in production."},{status:403});const registration=(await findRegistrationByParishId(env,parishId))?.registration||null;if(!registration)return json({error:"Parish was not found."},{status:404});if(!accountingEnabledFor(registration))return json({error:"Accounting is not included in this subscription."},{status:403});const databaseIdentifier=preparedAccountingDatabase(env,parishId);if(!databaseIdentifier)return json({error:"No prepared accounting database is assigned to this parish."},{status:409});const result=await activatePreparedParishAccounting(env,{adapter:createBoundD1ProvisioningAdapter(env),parishId,databaseIdentifier,environment,subscriptionTier:accountingServiceTier(accountingTierFor(registration)),actorUserId:admin.actor,correlationId:`admin-activation-${Date.now()}`});await recordAuditEvent(env,request,{action:"accounting.prepared_database.activate",actorUserId:admin.actor,actorType:"admin",targetType:"parish_accounting",targetId:parishId,organizationId:parishId,reason:"Activate configured prepared accounting database",metadata:{environment,databaseIdentifier,result}});return json({ok:true,parishId,result});}
const target=await adminAccountingTarget(env,parishId);if(target.error)return target.error;const {db,tier}=target;
if(request.method==="GET"&&path==="/api/admin/accounting/health")return json({ok:true,parishId,health:await accountingHealthOverview(db,{actor:ADMIN_ACCOUNTING_ACTOR,entitlementTier:tier})});
if(request.method==="GET"&&path==="/api/admin/accounting/integrity-scans")return json({ok:true,parishId,scans:await accountingRows(db,`SELECT s.id,s.scan_type scanType,s.scope,s.status,s.started_at startedAt,s.completed_at completedAt,s.checks_total checksTotal,s.checks_passed checksPassed,s.checks_warned checksWarned,s.checks_failed checksFailed,s.critical_failures criticalFailures,s.scanner_version scannerVersion,s.schema_version schemaVersion,s.correlation_id correlationId,COUNT(f.id) findingCount,SUM(CASE WHEN f.severity='critical' THEN 1 ELSE 0 END) criticalFindingCount FROM accounting_integrity_scans s LEFT JOIN accounting_integrity_findings f ON f.scan_id=s.id GROUP BY s.id ORDER BY s.created_at DESC LIMIT 50`)});
if(request.method==="GET"&&path==="/api/admin/accounting/recovery-verifications")return json({ok:true,parishId,verifications:await accountingRows(db,`SELECT id,verification_type verificationType,status,artifact_reference artifactReference,artifact_checksum artifactChecksum,manifest_checksum manifestChecksum,schema_valid schemaValid,trial_balance_hash trialBalanceHash,source_links_valid sourceLinksValid,reconciliations_valid reconciliationsValid,close_snapshots_valid closeSnapshotsValid,verified_by verifiedBy,verified_at verifiedAt,expires_at expiresAt,correlation_id correlationId FROM accounting_recovery_verifications ORDER BY verified_at DESC LIMIT 50`)});
let action="",result=null,reason=body.reason||body.reasonCode||"";if(request.method==="POST"&&path==="/api/admin/accounting/integrity-scan"){action="accounting.integrity_scan.run";result=await runIntegrityScan(db,{actor:ADMIN_ACCOUNTING_ACTOR,entitlementTier:tier,scanType:body.scanType||"manual",scope:body.scope||"full",correlationId:body.correlationId||"",resumeScanId:body.resumeScanId||""});}
else if(request.method==="POST"&&path==="/api/admin/accounting/protective-state"){if(!PROTECTIVE_STATES.has(body.state))return json({error:"Protective state must be normal, degraded_read_only, posting_blocked, or recovering."},{status:422});if(body.state==="normal")return json({error:"Use the protective-state release route to return to normal."},{status:422});action="accounting.protective_state.activate";result=await activateProtectiveState(db,{actor:ADMIN_ACCOUNTING_ACTOR,state:body.state,reasonCode:body.reasonCode,safeSummary:body.safeSummary,sourceScanId:body.sourceScanId||null,expectedVersion:body.expectedVersion});}
else if(request.method==="POST"&&path==="/api/admin/accounting/protective-state/release"){action="accounting.protective_state.release";result=await releaseProtectiveState(db,{actor:ADMIN_ACCOUNTING_ACTOR,expectedVersion:body.expectedVersion,reason:body.reason});}
else if(request.method==="POST"&&path==="/api/admin/accounting/recovery-verification"){action="accounting.recovery_evidence.verify";result=await verifyRecoveryEvidence(db,{actor:ADMIN_ACCOUNTING_ACTOR,entitlementTier:tier,verificationType:body.verificationType,artifactReference:body.artifactReference,artifactBody:body.artifactBody,manifest:body.manifest,correlationId:body.correlationId||""});}
else return json({error:"Not found"},{status:404});
await recordAuditEvent(env,request,{action,actorUserId:admin.actor,actorType:"admin",targetType:"parish_accounting",targetId:parishId,organizationId:parishId,reason:String(reason||"").trim()||null,metadata:{systemActorId:ADMIN_ACCOUNTING_ACTOR.id,result}});return json({ok:true,parishId,result});
}catch(error){const conflict=Boolean(error?.details?.conflict);return json({error:conflict?"conflict":"accounting_request_failed",message:error?.message||"Accounting operations request failed."},{status:conflict?409:400});}}
