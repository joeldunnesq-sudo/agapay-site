import { json } from "./core.js";
import { slugify } from "./format.js";
import { defaultSubscriptionTier, subscriptionTier } from "./subscriptions.js";
import { stripeFormRequest } from "./stripe-connect.js";

export async function createSubscriptionCheckoutForRegistration({
  request,
  env,
  reference,
  registration,
  body = {},
  returnPath = "/admin",
  saveRegistrationRecord
}) {
  const tierId = body.subscriptionTier || registration.subscriptionTier || defaultSubscriptionTier(registration);
  const tier = subscriptionTier({ ...registration, subscriptionTier: tierId });
  if (!tier) return json({ error: "Unknown subscription tier" }, { status: 422 });

  if (tier.monthlyCents === 0) {
    const updated = {
      ...registration,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionMonthlyCents: 0,
      subscriptionStatus: "free_forever",
      subscriptionUpdatedAt: new Date().toISOString()
    };
    await saveRegistrationRecord(env, reference, updated, registration);
    return json({ ok: true, subscription: updated.subscriptionStatus, registration: updated });
  }

  if (tier.monthlyCents === null && !env[tier.stripePriceEnv]) {
    return json({ error: "This tier needs a Stripe Price ID or a custom billing setup before checkout can be created" }, { status: 422 });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeCustomerId = registration.stripeCustomerId || "";
  if (!stripeCustomerId) {
    const customerForm = new URLSearchParams({
      email: registration.treasurerEmail || registration.priestEmail || "",
      name: registration.parishName || "AGAPAY parish",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
      "metadata[agapay_subscription_tier]": tier.id
    });
    const customer = await stripeFormRequest(env, "/v1/customers", customerForm);
    if (!customer.ok) {
      return json(
        { error: "Stripe customer creation failed", detail: customer.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeCustomerId = customer.body.id;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const checkoutForm = new URLSearchParams({
    mode: "subscription",
    customer: stripeCustomerId,
    "automatic_tax[enabled]": "true",
    billing_address_collection: "required",
    "customer_update[address]": "auto",
    success_url: `${appUrl}${returnPath}${returnSeparator}subscription_return=${encodeURIComponent(reference)}`,
    cancel_url: `${appUrl}${returnPath}${returnSeparator}subscription_cancel=${encodeURIComponent(reference)}`,
    client_reference_id: reference,
    "metadata[agapay_reference]": reference,
    "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "metadata[agapay_subscription_tier]": tier.id,
    "subscription_data[metadata][agapay_reference]": reference,
    "subscription_data[metadata][agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "subscription_data[metadata][agapay_subscription_tier]": tier.id,
    "line_items[0][quantity]": "1"
  });

  const configuredPriceId = tier.stripePriceEnv ? env[tier.stripePriceEnv] : "";
  if (configuredPriceId) {
    checkoutForm.set("line_items[0][price]", configuredPriceId);
  } else {
    checkoutForm.set("line_items[0][price_data][currency]", "usd");
    checkoutForm.set("line_items[0][price_data][unit_amount]", String(tier.monthlyCents));
    checkoutForm.set("line_items[0][price_data][recurring][interval]", "month");
    checkoutForm.set("line_items[0][price_data][tax_behavior]", "exclusive");
    checkoutForm.set("line_items[0][price_data][product_data][name]", `AGAPAY ${tier.label} Subscription`);
    checkoutForm.set("line_items[0][price_data][product_data][description]", tier.description);
  }

  const session = await stripeFormRequest(env, "/v1/checkout/sessions", checkoutForm);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription checkout failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: "checkout_created",
    stripeCustomerId,
    stripeSubscriptionCheckoutSessionId: session.body.id || "",
    stripeSubscriptionCheckoutCreatedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return json({ ok: true, checkoutUrl: session.body.url, registration: updated }, { status: 201 });
}
