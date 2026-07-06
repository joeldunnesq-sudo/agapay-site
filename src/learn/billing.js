import { d1, d1All, d1First, d1Run, json, listKvKeys, normalizeEmail, safeParseJsonRow } from "../lib/core.js";
import { requireDonor } from "../handlers/parish.js";
import { applySubscriptionTaxCode } from "../lib/tax-codes.js";
import { stripeFormRequest } from "../lib/stripe-connect.js";

export const LEARN_FREE_CHILD_LIMIT = 2;
export const LEARN_FREE_PRINT_LIMIT = 3;
export const LEARN_FAMILY_PLAN = "family";
export const LEARN_FREE_PLAN = "free";

const yearlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY";
const monthlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY";
const foundingYearlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_YEARLY";
const foundingMonthlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_MONTHLY";
const planCatalog = {
  "founding-family:year": {
    label: "AGAPAY Learn Founding Family",
    unitAmount: 4900,
    interval: "year",
    description: "Founding annual subscription for AGAPAY Learn."
  },
  "founding-family:month": {
    label: "AGAPAY Learn Founding Family",
    unitAmount: 500,
    interval: "month",
    description: "Founding monthly subscription for AGAPAY Learn."
  },
  "family:year": {
    label: "AGAPAY Learn Family",
    unitAmount: 5900,
    interval: "year",
    description: "Annual household subscription for AGAPAY Learn."
  },
  "family:month": {
    label: "AGAPAY Learn Family",
    unitAmount: 600,
    interval: "month",
    description: "Monthly household subscription for AGAPAY Learn."
  }
};
export const LEARN_BILLING_KV_PREFIX = "__agapay_learn_billing:";
const DEFAULT_FULL_ACCESS_EMAILS = [
  "stephaie@dunncrew.com",
  "stephanie@dunncrew.com"
];

function slug(value, fallback = "item") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function publicBaseUrl(request, env = {}) {
  const configured = String(env.AGAPAY_PUBLIC_URL || env.AGAPAY_APP_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function normalizeCheckoutPlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "founding" || plan === "founding-family" || plan === "founding_family") return "founding-family";
  return LEARN_FAMILY_PLAN;
}

function normalizeCheckoutInterval(value) {
  const interval = String(value || "").trim().toLowerCase();
  if (interval === "monthly" || interval === "month") return "month";
  return "year";
}

function learnPriceId(env = {}, plan = LEARN_FAMILY_PLAN, interval = "year") {
  const billingInterval = normalizeCheckoutInterval(interval);
  if (normalizeCheckoutPlan(plan) === "founding-family") {
    return billingInterval === "month"
      ? env[foundingMonthlyPriceEnv] || env[monthlyPriceEnv] || ""
      : env[foundingYearlyPriceEnv] || env[yearlyPriceEnv] || "";
  }
  return billingInterval === "month" ? env[monthlyPriceEnv] || "" : env[yearlyPriceEnv] || "";
}

function learnPlanDetails(plan, interval = "year") {
  return planCatalog[`${normalizeCheckoutPlan(plan)}:${normalizeCheckoutInterval(interval)}`] || planCatalog["family:year"];
}

function checkoutConfigured(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function isFutureIso(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) && time > Date.now();
}

function billingGrantsPaidAccess(billing = {}) {
  const status = String(billing?.status || "").toLowerCase();
  if (["active", "trialing", "free_forever"].includes(status)) return true;
  return Boolean(billing?.cancelAtPeriodEnd && isFutureIso(billing.currentPeriodEnd));
}

async function requestEmail(request, env = {}) {
  const donor = await requireDonor(request, env);
  return normalizeEmail(donor?.email || "");
}

function learnBillingIdentityFromEmail(email) {
  const normalized = normalizeEmail(email);
  return {
    email: normalized,
    householdId: normalized ? `learn_household_${slug(normalized)}` : ""
  };
}

async function learnBillingIdentity(request, env = {}) {
  return learnBillingIdentityFromEmail(await requestEmail(request, env));
}

function learnBillingKey(email) {
  return `${LEARN_BILLING_KV_PREFIX}${slug(normalizeEmail(email), "unknown")}`;
}

// Household billing identity (learn_households.id, e.g.
// "learn_household_<slug(email)>") is derived from email at household-
// creation time only. Per the Phase 2/3 plan: this id is NOT recomputed
// when a household's email later changes -- it's treated as immutable and
// used only as Stripe metadata. A future migration to a random, permanent
// household id (independent of email) is real technical debt but is out of
// scope for this phase, since the current id is load-bearing across every
// existing Learn foreign key and auth lookup.
//
// Returns { stripeCustomerId, blocked } for a stable, reusable platform-
// account Stripe Customer for a Learn household -- creating one once and
// persisting it on learn_households.stripe_customer_id, rather than
// relying on bare `customer_email` (which lets Stripe silently create a
// new, unlinked Customer on every checkout attempt). Never reuses a
// parish's registration.stripeCustomerId/stewardshipStripeCustomerId, and
// is never itself eligible for the parish subscription tax-exemption
// workflow (src/lib/tax-exemption.js) -- Learn households are not parishes.
//
// Feature-flagged rollout via env.LEARN_PERSISTED_CUSTOMER_ENFORCED:
//   - Unset/"false" (default): legacy customer_email fallback is still
//     permitted if a stable Customer can't be created (no household row
//     yet, or Stripe error) -- but every fallback logs a prominent
//     structured warning; this mode never claims enforcement is complete.
//   - "true": a stable Customer is required. If it can't be created,
//     returns { blocked: true } and the caller (learnBillingCheckout) must
//     refuse checkout with a user-safe billing error rather than falling
//     back to customer_email.
//
// Race-safety: Customer creation uses a compare-and-set UPDATE
// (`WHERE stripe_customer_id IS NULL`) so two simultaneous checkout
// requests for the same household can't both "win" and leave two
// plausible-looking Customers referenced from application state. The
// loser's freshly-created Stripe Customer is a real duplicate on Stripe's
// side (this function cannot un-create it) -- it is logged as a flagged
// duplicate for manual reconciliation and never auto-merged or deleted.
export async function ensureLearnHouseholdStripeCustomer(env, { householdId, email }) {
  const enforced = String(env.LEARN_PERSISTED_CUSTOMER_ENFORCED || "").toLowerCase() === "true";
  if (!householdId || !email) return { stripeCustomerId: "", blocked: enforced };
  if (!d1(env)) return { stripeCustomerId: "", blocked: enforced };

  const existing = await d1First(env, "SELECT stripe_customer_id FROM learn_households WHERE id = ?1", householdId);
  if (existing?.stripe_customer_id) return { stripeCustomerId: existing.stripe_customer_id, blocked: false };

  if (!existing) {
    // No household row yet -- nothing to compare-and-set against.
    console.warn("learn_stripe_customer_no_household_row", JSON.stringify({ householdId, enforced }));
    return { stripeCustomerId: "", blocked: enforced };
  }

  if (!env.STRIPE_SECRET_KEY) return { stripeCustomerId: "", blocked: enforced };

  const form = new URLSearchParams({
    email,
    "metadata[agapay_household_id]": householdId,
    "metadata[agapay_product]": "learn"
  });
  const created = await stripeFormRequest(env, "/v1/customers", form);
  if (!created.ok) {
    console.error("learn_stripe_customer_create_failed", JSON.stringify({ householdId, error: created.body?.error?.message || "unknown" }));
    return { stripeCustomerId: "", blocked: enforced };
  }

  const stripeCustomerId = created.body.id;
  const now = new Date().toISOString();

  // Compare-and-set: only persist if no other concurrent request already
  // won this race. `meta.changes === 0` means we lost.
  const result = await d1Run(
    env,
    `UPDATE learn_households SET stripe_customer_id = ?1, stripe_customer_created_at = ?2, last_stripe_sync_at = ?2 WHERE id = ?3 AND stripe_customer_id IS NULL`,
    stripeCustomerId,
    now,
    householdId
  );

  if (!result || Number(result.meta?.changes || 0) === 0) {
    // Lost the race -- another request already persisted a canonical
    // Customer for this household in the meantime. Use THAT one; flag the
    // Customer we just created (and are discarding) as a duplicate for
    // manual reconciliation. Never merge or delete automatically.
    const winner = await d1First(env, "SELECT stripe_customer_id FROM learn_households WHERE id = ?1", householdId);
    console.error("learn_stripe_customer_duplicate_detected", JSON.stringify({
      householdId,
      canonicalStripeCustomerId: winner?.stripe_customer_id || "",
      discardedStripeCustomerId: stripeCustomerId,
      note: "This Customer was created on Stripe but lost a local compare-and-set race. It is NOT deleted or merged automatically -- flagged for manual reconciliation."
    }));
    return { stripeCustomerId: winner?.stripe_customer_id || "", blocked: !winner?.stripe_customer_id && enforced };
  }

  return { stripeCustomerId, blocked: false };
}

/**
 * Trusted-metadata-first reconciliation/backfill for households that
 * predate persisted Customer creation (i.e. were billed via bare
 * customer_email before this phase). NOT run automatically -- an admin or
 * ops script invokes this deliberately.
 *
 * Matching priority:
 *   1. Stripe Customers with metadata.agapay_household_id === householdId
 *      (trusted -- these were created by this codebase's own metadata).
 *   2. Only if zero metadata matches: Stripe Customers whose email matches
 *      the household's email, as secondary/lower-confidence evidence.
 *
 * Outcomes:
 *   - Exactly one high-confidence (metadata) match -> backfilled automatically.
 *   - Zero matches -> left unset; the household simply creates a fresh
 *     Customer on its next checkout via ensureLearnHouseholdStripeCustomer.
 *   - Multiple matches (metadata OR email) -> NOT backfilled; flagged for
 *     manual review. No guessing.
 */
export function selectLearnStripeCustomerBackfillMatch({ householdId, email, candidates = [] }) {
  const metadataMatches = candidates.filter((c) => c?.metadata?.agapay_household_id === householdId);
  if (metadataMatches.length === 1) return { action: "backfill", stripeCustomerId: metadataMatches[0].id, confidence: "metadata" };
  if (metadataMatches.length > 1) return { action: "manual_review", reason: "multiple metadata matches", candidates: metadataMatches.map((c) => c.id) };

  const normalizedEmail = normalizeEmail(email);
  const emailMatches = normalizedEmail ? candidates.filter((c) => normalizeEmail(c.email) === normalizedEmail) : [];
  if (emailMatches.length === 1) return { action: "backfill", stripeCustomerId: emailMatches[0].id, confidence: "email" };
  if (emailMatches.length > 1) return { action: "manual_review", reason: "multiple email matches", candidates: emailMatches.map((c) => c.id) };

  return { action: "unset", reason: "no candidates found" };
}

export async function loadLearnBillingRecord(env = {}, email = "") {
  const identity = learnBillingIdentityFromEmail(email);
  if (!identity.email) return null;

  if (d1(env)) {
    try {
      const row = await d1First(env, "SELECT data FROM learn_households WHERE id = ?1 LIMIT 1", identity.householdId);
      const household = safeParseJsonRow(row);
      const billing = household?.learnBilling || household?.billing || null;
      if (billing?.status) return billing;
    } catch {
      // Learn schema may not be applied yet; KV billing records remain the fallback.
    }
  }

  if (env.AGAPAY_REGISTRATIONS) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(learnBillingKey(identity.email));
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function saveLearnBillingRecord(env = {}, record = {}) {
  const identity = learnBillingIdentityFromEmail(record.email);
  if (!identity.email) return { ok: false, reason: "missing_email" };
  const now = new Date().toISOString();
  // Billing address is often only present on the checkout-completion call
  // (from Stripe's own customer_details.address); fall back to whatever
  // was already stored so a later renewal-webhook save doesn't blank it.
  const existing = await loadLearnBillingRecord(env, identity.email).catch(() => null);
  const saved = {
    product: "learn",
    email: identity.email,
    householdId: record.householdId || identity.householdId,
    plan: normalizeCheckoutPlan(record.plan),
    status: String(record.status || "active").toLowerCase(),
    learnSubscriptionCents: Math.max(0, Number(record.learnSubscriptionCents || learnPlanDetails(record.plan, record.interval || record.billingInterval).unitAmount || 0)),
    stripeCustomerId: record.stripeCustomerId || "",
    stripeSubscriptionId: record.stripeSubscriptionId || "",
    stripeCheckoutSessionId: record.stripeCheckoutSessionId || "",
    source: record.source || "",
    interval: normalizeCheckoutInterval(record.interval || record.billingInterval),
    learnBillingInterval: normalizeCheckoutInterval(record.interval || record.billingInterval),
    currentPeriodEnd: record.currentPeriodEnd || "",
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd || record.cancel_at_period_end),
    cancelledAt: record.cancelledAt || record.canceledAt || "",
    // Billing address -- stored where practical (e.g. captured from Stripe's
    // own customer_details.address on checkout completion, see
    // persistLearnBillingFromStripe below). Not currently used to gate Learn
    // checkout -- see src/lib/tax-readiness.js, which gates parish/AGAPAY Give
    // subscriptions only. Non-destructive: only overwrites when a new value
    // is actually provided.
    billingLegalName: record.billingLegalName || existing?.billingLegalName || "",
    billingAddressLine1: record.billingAddressLine1 || existing?.billingAddressLine1 || "",
    billingAddressLine2: record.billingAddressLine2 || existing?.billingAddressLine2 || "",
    billingCity: record.billingCity || existing?.billingCity || "",
    billingState: record.billingState || existing?.billingState || "",
    billingPostalCode: record.billingPostalCode || existing?.billingPostalCode || "",
    billingCountry: record.billingCountry || existing?.billingCountry || "",
    updatedAt: now,
    createdAt: record.createdAt || now
  };

  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(learnBillingKey(identity.email), JSON.stringify(saved));
  }

  if (d1(env)) {
    try {
      const row = await d1First(env, "SELECT data FROM learn_households WHERE id = ?1 LIMIT 1", saved.householdId);
      const household = safeParseJsonRow(row);
      if (household) {
        await d1Run(
          env,
          "UPDATE learn_households SET data = ?1, updated_at = ?2 WHERE id = ?3",
          JSON.stringify({ ...household, ownerEmail: household.ownerEmail || identity.email, learnBilling: saved }),
          now,
          saved.householdId
        );
      }
    } catch {
      // Keep billing persistence working through KV until the Learn schema is present.
    }
  }

  return { ok: true, billing: saved };
}

export async function listLearnBillingRecords(env = {}) {
  const byKey = new Map();
  const add = (record = {}) => {
    const email = normalizeEmail(record.email || "");
    const key = email || record.stripeSubscriptionId || record.stripeCheckoutSessionId || record.householdId || "";
    if (!key) return;
    byKey.set(key, { ...record, email, product: "learn" });
  };

  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: LEARN_BILLING_KV_PREFIX, limit: 10000 });
    for (const key of keys) {
      const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
      if (!raw) continue;
      try {
        add(JSON.parse(raw));
      } catch {}
    }
  }

  if (d1(env)) {
    try {
      const rows = await d1All(env, "SELECT id, data, updated_at FROM learn_households ORDER BY updated_at DESC LIMIT 10000");
      for (const row of rows) {
        const household = safeParseJsonRow(row);
        const billing = household?.learnBilling || household?.billing || null;
        if (billing?.status) {
          add({
            ...billing,
            householdId: billing.householdId || row.id || household?.id || "",
            email: billing.email || household?.ownerEmail || ""
          });
        }
      }
    } catch {
      // Learn schema may not exist in every local/dev environment.
    }
  }

  return [...byKey.values()];
}

function configuredFullAccessEmails(env = {}) {
  const configured = String(env.AGAPAY_LEARN_FULL_ACCESS_EMAILS || "")
    .split(/[,\s]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
  return [...new Set([...DEFAULT_FULL_ACCESS_EMAILS.map((email) => normalizeEmail(email)), ...configured])];
}

export function learnEmailHasFullAccess(email, env = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return new Set(configuredFullAccessEmails(env)).has(normalized);
}

export async function learnEmailHasPaidAccess(email, env = {}) {
  if (learnEmailHasFullAccess(email, env)) return true;
  const billing = await loadLearnBillingRecord(env, email);
  return billingGrantsPaidAccess(billing);
}

export async function learnPlanForRequest(request, env = {}, identity = null) {
  const email = identity?.email || await requestEmail(request, env);
  if (learnEmailHasFullAccess(email, env)) return LEARN_FAMILY_PLAN;
  return LEARN_FREE_PLAN;
}

export async function learnRequestHasFamilyAccess(request, env = {}, identity = null) {
  return await learnPlanForRequest(request, env, identity) === LEARN_FAMILY_PLAN;
}

export async function learnRequestHasFamilyAccessAsync(request, env = {}, identity = null) {
  if (await learnRequestHasFamilyAccess(request, env, identity)) return true;
  const email = identity?.email || await requestEmail(request, env);
  if (!email) return false;
  return learnEmailHasPaidAccess(email, env);
}

export async function learnBillingStatus(request, env = {}) {
  const identity = await learnBillingIdentity(request, env);
  if (!identity.email) return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const email = identity.email;
  const billing = await loadLearnBillingRecord(env, email);
  const hasPaidAccess = billingGrantsPaidAccess(billing);
  const plan = hasPaidAccess ? LEARN_FAMILY_PLAN : await learnPlanForRequest(request, env, identity);
  return json({
    ok: true,
    product: "learn",
    plan,
    paidPlan: LEARN_FAMILY_PLAN,
    fullAccess: plan === LEARN_FAMILY_PLAN,
    billing,
    childLimit: LEARN_FREE_CHILD_LIMIT,
    printLimit: LEARN_FREE_PRINT_LIMIT,
    checkoutConfigured: checkoutConfigured(env),
    priceSource: learnPriceId(env, LEARN_FAMILY_PLAN, "year") || learnPriceId(env, LEARN_FAMILY_PLAN, "month") ? "configured_price" : "inline_price_data",
    checkoutEndpoint: "/api/learn/billing/checkout",
    requiredEnv: [
      "STRIPE_SECRET_KEY",
      `${yearlyPriceEnv} or ${monthlyPriceEnv} optional; inline price data is used when absent`,
      "AGAPAY_PUBLIC_URL"
    ],
    successUrl: `${publicBaseUrl(request, env)}/myagapay/learn/setup?learn_billing=success`,
    cancelUrl: `${publicBaseUrl(request, env)}/myagapay/learn/setup?learn_billing=cancelled`
  });
}

export async function learnBillingCheckout(request, env = {}) {
  const body = await request.json().catch(() => ({}));
  const plan = normalizeCheckoutPlan(body.plan);
  const interval = normalizeCheckoutInterval(body.interval || body.billingInterval);
  const identity = await learnBillingIdentity(request, env);
  const priceId = learnPriceId(env, plan, interval);
  if (!env.STRIPE_SECRET_KEY) {
    return json({
      ok: false,
      error: "Stripe checkout is not configured for AGAPAY Learn yet.",
      requiredEnv: [
        "STRIPE_SECRET_KEY",
        `${foundingYearlyPriceEnv} or ${foundingMonthlyPriceEnv} optional for founding pricing`,
        `${yearlyPriceEnv} or ${monthlyPriceEnv} optional for family pricing`,
        "AGAPAY_PUBLIC_URL"
      ]
    }, { status: 503 });
  }

  const baseUrl = publicBaseUrl(request, env);
  const planDetails = learnPlanDetails(plan, interval);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("billing_address_collection", "required");
  if (priceId) {
    params.set("line_items[0][price]", priceId);
  } else {
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][unit_amount]", String(planDetails.unitAmount));
    params.set("line_items[0][price_data][recurring][interval]", planDetails.interval);
    params.set("line_items[0][price_data][product_data][name]", planDetails.label);
    params.set("line_items[0][price_data][product_data][description]", planDetails.description);
    params.set("line_items[0][price_data][product_data][metadata][product]", "learn");
    params.set("line_items[0][price_data][product_data][metadata][plan]", plan);
    const taxCodeResult = applySubscriptionTaxCode(params, "line_items[0][price_data][product_data]", "learn", env);
    if (taxCodeResult.blocked) {
      return json(
        { ok: false, error: "Billing configuration issue -- checkout is temporarily unavailable while a required tax setting is completed. Please contact support@agapay.app." },
        { status: 503 }
      );
    }
  }
  params.set("line_items[0][quantity]", "1");
  const customerResult = identity.email
    ? await ensureLearnHouseholdStripeCustomer(env, { householdId: identity.householdId, email: identity.email })
    : { stripeCustomerId: "", blocked: false };
  if (customerResult.blocked) {
    return json({
      ok: false,
      error: "Billing configuration issue -- checkout is temporarily unavailable. Please try again shortly or contact support@agapay.app."
    }, { status: 503 });
  }
  if (customerResult.stripeCustomerId) {
    params.set("customer", customerResult.stripeCustomerId);
    params.set("customer_update[address]", "auto");
  } else if (identity.email) {
    // Legacy fallback -- only reachable when
    // env.LEARN_PERSISTED_CUSTOMER_ENFORCED is not "true". Every fallback
    // here means ensureLearnHouseholdStripeCustomer already logged a
    // structured warning; this is never silent.
    console.warn("learn_checkout_using_legacy_customer_email_fallback", JSON.stringify({ householdId: identity.householdId }));
    params.set("customer_email", identity.email);
  }
  params.set("allow_promotion_codes", "true");
  params.set("automatic_tax[enabled]", "true");
  const checkoutSuccessPath = identity.email
    ? "/myagapay/learn/setup?learn_billing=success&session_id={CHECKOUT_SESSION_ID}"
    : `/myagapay/signup?learn_billing=success&session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent("/myagapay/learn/setup?learn_billing=success")}`;
  const checkoutCancelPath = identity.email
    ? "/myagapay/learn/setup?learn_billing=cancelled"
    : "/learn/pricing?learn_billing=cancelled";
  params.set("success_url", `${baseUrl}${checkoutSuccessPath}`);
  params.set("cancel_url", `${baseUrl}${checkoutCancelPath}`);
  params.set("metadata[product]", "learn");
  params.set("metadata[plan]", plan);
  params.set("metadata[interval]", interval);
  params.set("metadata[email]", identity.email);
  params.set("metadata[household_id]", identity.householdId);
  params.set("subscription_data[metadata][product]", "learn");
  params.set("subscription_data[metadata][plan]", plan);
  params.set("subscription_data[metadata][interval]", interval);
  params.set("subscription_data[metadata][email]", identity.email);
  params.set("subscription_data[metadata][household_id]", identity.householdId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.url) {
    return json({
      ok: false,
      error: session.error?.message || "Stripe could not create the AGAPAY Learn checkout session."
    }, { status: response.status || 502 });
  }

  return json({
    ok: true,
    url: session.url,
    sessionId: session.id
  });
}

export async function learnBillingCancel(request, env = {}) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const identity = await learnBillingIdentity(request, env);
  if (!identity.email) return json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const billing = await loadLearnBillingRecord(env, identity.email);
  if (!billing?.stripeSubscriptionId) {
    return json({
      ok: false,
      error: "No Stripe-backed AGAPAY Learn subscription was found for this account."
    }, { status: 404 });
  }
  if (billing.cancelAtPeriodEnd || String(billing.status || "").toLowerCase() === "cancelled") {
    return json({ ok: true, billing, message: "This AGAPAY Learn subscription is already scheduled to cancel." });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({
      ok: false,
      error: "Stripe is not configured, so AGAPAY cannot cancel this Learn subscription yet."
    }, { status: 503 });
  }

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(billing.stripeSubscriptionId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ cancel_at_period_end: "true" })
  });
  const subscription = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      ok: false,
      error: subscription.error?.message || "Stripe could not schedule this AGAPAY Learn subscription for cancellation."
    }, { status: response.status || 502 });
  }

  const saved = await saveLearnBillingRecord(env, {
    ...billing,
    email: identity.email,
    householdId: billing.householdId || identity.householdId,
    status: subscription.status || billing.status || "active",
    stripeCustomerId: subscription.customer || billing.stripeCustomerId || "",
    stripeSubscriptionId: subscription.id || billing.stripeSubscriptionId,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : billing.currentPeriodEnd,
    cancelAtPeriodEnd: true,
    cancelledAt: new Date().toISOString()
  });

  return json({
    ok: true,
    billing: saved.billing,
    message: "Your AGAPAY Learn subscription is scheduled to cancel at the end of the current billing period."
  });
}

export async function persistLearnBillingFromStripe(env = {}, source = {}) {
  const metadata = source.metadata || {};
  const email = normalizeEmail(
    metadata.email
    || source.customer_email
    || source.customer_details?.email
    || source.customerEmail
    || ""
  );
  if (!email) return { ok: false, reason: "missing_email" };
  // Stripe includes customer_details.address on checkout.session.completed
  // events when billing_address_collection is "required" (it is, above).
  // Not present on subscription-lifecycle webhooks -- that's fine,
  // saveLearnBillingRecord falls back to whatever was already stored.
  const address = source.customer_details?.address || null;
  return saveLearnBillingRecord(env, {
    email,
    householdId: metadata.household_id || "",
    plan: metadata.plan || "family",
    interval: metadata.interval || source.interval || "",
    learnSubscriptionCents: learnPlanDetails(metadata.plan || "family", metadata.interval || source.interval || "year").unitAmount,
    status: source.status || "active",
    stripeCustomerId: source.customer || source.stripeCustomerId || "",
    stripeSubscriptionId: source.subscription || source.id || source.stripeSubscriptionId || "",
    stripeCheckoutSessionId: source.checkoutSessionId || "",
    currentPeriodEnd: source.current_period_end ? new Date(source.current_period_end * 1000).toISOString() : "",
    cancelAtPeriodEnd: Boolean(source.cancel_at_period_end),
    cancelledAt: source.canceled_at ? new Date(source.canceled_at * 1000).toISOString() : "",
    billingLegalName: source.customer_details?.name || "",
    billingAddressLine1: address?.line1 || "",
    billingAddressLine2: address?.line2 || "",
    billingCity: address?.city || "",
    billingState: address?.state || "",
    billingPostalCode: address?.postal_code || "",
    billingCountry: address?.country || ""
  });
}

// ── Odyssey activation ──────────────────────────────────────────────────────────
// Called when a family enters their Odyssey purchase reference code.
// Creates a family billing record with no Stripe IDs and source: 'odyssey'.
export async function activateLearnOdysseyAccount(env = {}, email = "", odysseyRef = "") {
  if (!email) return { ok: false, error: "Email is required." };
  const existing = await loadLearnBillingRecord(env, email);
  if (existing && billingGrantsPaidAccess(existing) && existing.source !== "odyssey") {
    // Already has a paid subscription via another channel — don't overwrite
    return { ok: true, alreadyActive: true, plan: existing.plan };
  }
  const record = {
    email,
    plan: LEARN_FAMILY_PLAN,
    status: "active",
    source: "odyssey",
    odysseyRef: String(odysseyRef || "").trim().slice(0, 100),
    interval: "year",
    learnSubscriptionCents: 7900,
    stripeCustomerId: "",
    stripeSubscriptionId: "",
    stripeCheckoutSessionId: "",
    currentPeriodEnd: "",
    cancelAtPeriodEnd: false
  };
  const result = await saveLearnBillingRecord(env, record);
  if (!result.ok) return { ok: false, error: result.reason || "Failed to activate." };
  return { ok: true, plan: LEARN_FAMILY_PLAN, source: "odyssey" };
}
