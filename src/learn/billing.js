import { json } from "../lib/core.js";

export const LEARN_FREE_CHILD_LIMIT = 2;
export const LEARN_FREE_PRINT_LIMIT = 3;

const yearlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY";
const monthlyPriceEnv = "AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY";

function publicBaseUrl(request, env = {}) {
  const configured = String(env.AGAPAY_PUBLIC_URL || env.AGAPAY_APP_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function learnPriceId(env = {}) {
  return env[yearlyPriceEnv] || env[monthlyPriceEnv] || "";
}

function checkoutConfigured(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY && learnPriceId(env));
}

export function learnBillingStatus(request, env = {}) {
  return json({
    ok: true,
    product: "learn",
    plan: "free",
    paidPlan: "family",
    childLimit: LEARN_FREE_CHILD_LIMIT,
    printLimit: LEARN_FREE_PRINT_LIMIT,
    checkoutConfigured: checkoutConfigured(env),
    checkoutEndpoint: "/api/learn/billing/checkout",
    requiredEnv: [
      "STRIPE_SECRET_KEY",
      `${yearlyPriceEnv} or ${monthlyPriceEnv}`,
      "AGAPAY_PUBLIC_URL"
    ],
    successUrl: `${publicBaseUrl(request, env)}/learn/onboarding?learn_billing=success`,
    cancelUrl: `${publicBaseUrl(request, env)}/learn/onboarding?learn_billing=cancelled`
  });
}

export async function learnBillingCheckout(request, env = {}) {
  const priceId = learnPriceId(env);
  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return json({
      ok: false,
      error: "Stripe checkout is not configured for AGAPAY Learn yet.",
      requiredEnv: [
        "STRIPE_SECRET_KEY",
        `${yearlyPriceEnv} or ${monthlyPriceEnv}`,
        "AGAPAY_PUBLIC_URL"
      ]
    }, { status: 503 });
  }

  const baseUrl = publicBaseUrl(request, env);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("allow_promotion_codes", "true");
  params.set("success_url", `${baseUrl}/learn/onboarding?learn_billing=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${baseUrl}/learn/onboarding?learn_billing=cancelled`);
  params.set("metadata[product]", "learn");
  params.set("metadata[plan]", "family");

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
