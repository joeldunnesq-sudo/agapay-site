import { json, normalizeEmail } from "../lib/core.js";

export const LEARN_FREE_CHILD_LIMIT = 2;
export const LEARN_FREE_PRINT_LIMIT = 3;
export const LEARN_FAMILY_PLAN = "family";
export const LEARN_FREE_PLAN = "free";

const yearlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY";
const monthlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY";
const foundingYearlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_YEARLY";
const foundingMonthlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FOUNDING_MONTHLY";
const planCatalog = {
  "founding-family": {
    label: "AGAPAY Learn Founding Family",
    unitAmount: 4900,
    interval: "year",
    description: "Founding annual subscription for AGAPAY Learn."
  },
  family: {
    label: "AGAPAY Learn Family",
    unitAmount: 5900,
    interval: "year",
    description: "Annual household subscription for AGAPAY Learn."
  }
};
const defaultFullAccessEmails = [
  "stephaie@dunncrew.com",
  "stephanie@dunncrew.com"
];

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

function learnPriceId(env = {}, plan = LEARN_FAMILY_PLAN) {
  if (normalizeCheckoutPlan(plan) === "founding-family") {
    return env[foundingYearlyPriceEnv] || env[foundingMonthlyPriceEnv] || env[yearlyPriceEnv] || env[monthlyPriceEnv] || "";
  }
  return env[yearlyPriceEnv] || env[monthlyPriceEnv] || "";
}

function learnPlanDetails(plan) {
  return planCatalog[normalizeCheckoutPlan(plan)] || planCatalog.family;
}

function checkoutConfigured(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function requestEmail(request) {
  return normalizeEmail(
    request?.headers?.get("X-AGAPAY-Learn-Email")
    || request?.headers?.get("X-AGAPAY-User-Email")
    || request?.headers?.get("CF-Access-Authenticated-User-Email")
    || ""
  );
}

function configuredFullAccessEmails(env = {}) {
  return String(env.AGAPAY_LEARN_FULL_ACCESS_EMAILS || "")
    .split(/[,\s]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function learnEmailHasFullAccess(email, env = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return new Set([...defaultFullAccessEmails, ...configuredFullAccessEmails(env)]).has(normalized);
}

export function learnPlanForRequest(request, env = {}) {
  const email = requestEmail(request);
  if (learnEmailHasFullAccess(email, env)) return LEARN_FAMILY_PLAN;
  const headerPlan = String(request?.headers?.get("X-AGAPAY-Learn-Plan") || "").trim().toLowerCase();
  if (headerPlan === LEARN_FAMILY_PLAN) return LEARN_FAMILY_PLAN;
  return LEARN_FREE_PLAN;
}

export function learnRequestHasFamilyAccess(request, env = {}) {
  return learnPlanForRequest(request, env) === LEARN_FAMILY_PLAN;
}

export function learnBillingStatus(request, env = {}) {
  const plan = learnPlanForRequest(request, env);
  return json({
    ok: true,
    product: "learn",
    plan,
    paidPlan: LEARN_FAMILY_PLAN,
    fullAccess: plan === LEARN_FAMILY_PLAN,
    childLimit: LEARN_FREE_CHILD_LIMIT,
    printLimit: LEARN_FREE_PRINT_LIMIT,
    checkoutConfigured: checkoutConfigured(env),
    priceSource: learnPriceId(env) ? "configured_price" : "inline_price_data",
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
  const priceId = learnPriceId(env, plan);
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
  const planDetails = learnPlanDetails(plan);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
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
  }
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("automatic_tax[enabled]", "true");
  params.set("success_url", `${baseUrl}/myagapay/learn/setup?learn_billing=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${baseUrl}/myagapay/learn/setup?learn_billing=cancelled`);
  params.set("metadata[product]", "learn");
  params.set("metadata[plan]", plan);
  params.set("subscription_data[metadata][product]", "learn");
  params.set("subscription_data[metadata][plan]", plan);

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
