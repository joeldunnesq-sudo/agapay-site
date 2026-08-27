import { json } from "./core.js";
import { slugify } from "./format.js";
import { defaultSubscriptionTier, normalizeParishHouseholdBand, normalizeSubscriptionAddOns, subscriptionAddOnPricing, subscriptionReady, subscriptionTier } from "./subscriptions.js";
import { stripeFormRequest, stripeGetRequest } from "./stripe-connect.js";
import { applySubscriptionTaxCode } from "./tax-codes.js";
import { applyApprovedExemptionIfExists } from "./tax-exemption.js";
import { subscriptionCheckoutReadinessGate, withTaxReadinessDefaults } from "./tax-readiness.js";
import { ensureBenevolenceFundInRegistration } from "./stewardship-funds.js";
import { invalidateOnboardingSignoffIfChanged } from "./parish-onboarding.js";

async function persistSubscriptionMaterialChange(env, reference, registration, updated, saveRegistrationRecord) {
  const safeUpdate = await invalidateOnboardingSignoffIfChanged(registration, updated, {
    actor: registration.treasurerEmail || registration.priestEmail || "subscription",
    reason: "The parish subscription configuration changed.",
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app"
  });
  await saveRegistrationRecord(env, reference, safeUpdate, registration);
  return safeUpdate;
}

function withTierFundDefaults(registration, tier) {
  return tier?.modules?.givingPlus
    ? ensureBenevolenceFundInRegistration(registration).registration
    : registration;
}

async function activeGiveSubscriptionProduct(env) {
  const query = encodeURIComponent("metadata['agapay_product_key']:'give_platform'");
  const search = await stripeGetRequest(env, `/v1/products/search?query=${query}`);
  if (!search.ok) return search;
  const existing = Array.isArray(search.body?.data)
    ? search.body.data.find((product) => product?.active !== false && product?.id)
    : null;
  if (existing) return { ok: true, body: existing };

  const productForm = new URLSearchParams({
    name: "AGAPAY Give",
    description: "Orthodox giving, stewardship, and parish operations platform.",
    "metadata[agapay_product_key]": "give_platform"
  });
  return stripeFormRequest(env, "/v1/products", productForm);
}

export async function createSubscriptionCheckoutForRegistration({
  request,
  env,
  reference,
  registration,
  body = {},
  returnPath = "/admin",
  allowTrial = false,
  introductoryTrialDays = 0,
  saveRegistrationRecord
}) {
  const tierId = body.subscriptionTier || registration.subscriptionTier || defaultSubscriptionTier(registration);
  const requestedAddOns = normalizeSubscriptionAddOns(body.subscriptionAddOns ?? registration.subscriptionAddOns ?? [], tierId);
  const requestedHouseholdBand = normalizeParishHouseholdBand(body.parishHouseholdBand ?? registration.parishHouseholdBand);
  if (String(tierId || "").toLowerCase() === "parish" && !requestedHouseholdBand) {
    return json({ error: "Choose a valid active-household range for Parish pricing." }, { status: 422 });
  }
  if (requestedHouseholdBand) registration = { ...registration, parishHouseholdBand: requestedHouseholdBand };
  if (String(tierId || "").toLowerCase() === "parish") {
    registration = { ...registration, subscriptionPricingProgram: "standard" };
  }
  const tier = subscriptionTier({ ...registration, subscriptionTier: tierId });
  if (!tier) return json({ error: "Unknown subscription tier" }, { status: 422 });
  const addOns = requestedAddOns.map((id) => subscriptionAddOnPricing(id, registration.subscriptionPricingProgram)).filter(Boolean);
  const addOnMonthlyCents = addOns.reduce((sum, addOn) => sum + Number(addOn.monthlyCents || 0), 0);
  const subscriptionMonthlyCents = Number(tier.monthlyCents || 0) + addOnMonthlyCents;

  if (tier.monthlyCents === 0) {
    let updated = withTierFundDefaults({
      ...registration,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionAddOns: [],
      subscriptionAddOnMonthlyCents: 0,
      subscriptionMonthlyCents: 0,
      subscriptionStatus: "free_forever",
      subscriptionUpdatedAt: new Date().toISOString()
    }, tier);
    updated = await persistSubscriptionMaterialChange(env, reference, registration, updated, saveRegistrationRecord);
    return json({ ok: true, subscription: updated.subscriptionStatus, registration: updated });
  }

  if (tier.monthlyCents === null && !env[tier.stripePriceEnv]) {
    return json({ error: "This tier needs a Stripe Price ID or a custom billing setup before checkout can be created" }, { status: 422 });
  }

  // Canonical verification and a usable billing address remain required.
  // Per-parish tax approval does not: parish transaction tax belongs to the
  // connected account, while AGAPAY subscription tax is handled by Stripe's
  // platform-level automatic tax configuration below.
  const billingRegistration = withTaxReadinessDefaults(registration);
  const gate = subscriptionCheckoutReadinessGate(billingRegistration);
  if (!gate.ok) return json(gate.body, { status: gate.status });

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  // introductoryTrialDays comes from a trusted server route. Browser-provided
  // trialDays stays ignored unless an authenticated admin opts into allowTrial.
  const trustedIntroDays = Math.trunc(Number(introductoryTrialDays || 0));
  const requestedTrialDays = trustedIntroDays > 0
    ? trustedIntroDays
    : allowTrial ? Math.trunc(Number(body.trialDays || 0)) : 0;
  const trialDays = requestedTrialDays >= 1 && requestedTrialDays <= 90 ? requestedTrialDays : 0;

  // An active parish already has a Stripe subscription. Change its existing
  // subscription item instead of creating a second subscription or relying
  // on a Billing Portal configuration that may not expose every AGAPAY tier.
  // Stripe supports either a configured Price ID or inline price_data when
  // updating a subscription item.
  if (registration.stripeSubscriptionId && subscriptionReady(registration) && !trialDays) {
    const subscription = await stripeGetRequest(
      env,
      `/v1/subscriptions/${encodeURIComponent(registration.stripeSubscriptionId)}?expand[]=items.data.price.product`
    );
    if (!subscription.ok) {
      return json(
        { error: "Stripe subscription lookup failed", detail: subscription.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }

    const item = subscription.body?.items?.data?.[0];
    const currentProductObject = item?.price?.product;
    const currentProduct = typeof currentProductObject === "string"
      ? item.price.product
      : currentProductObject?.id || "";
    if (!item?.id || (!env[tier.stripePriceEnv] && !currentProduct)) {
      return json(
        { error: "Stripe subscription cannot be changed", detail: "The current subscription item or product could not be resolved." },
        { status: 502 }
      );
    }

    const updateForm = new URLSearchParams({
      "items[0][id]": item.id,
      "items[0][quantity]": "1",
      proration_behavior: "create_prorations",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
      "metadata[agapay_subscription_tier]": tier.id,
      "metadata[agapay_subscription_add_ons]": requestedAddOns.join(","),
      "metadata[agapay_pricing_program]": registration.subscriptionPricingProgram || "standard",
      "metadata[agapay_household_band]": registration.parishHouseholdBand || "",
      "metadata[agapay_early_adopter_slot]": registration.earlyAdopterSlot ? String(registration.earlyAdopterSlot) : ""
    });
    const configuredPriceId = tier.stripePriceEnv ? env[tier.stripePriceEnv] : "";
    if (configuredPriceId) {
      updateForm.set("items[0][price]", configuredPriceId);
    } else {
      let priceProductId = currentProduct;
      if (typeof currentProductObject === "object" && currentProductObject?.active === false) {
        const activeProduct = await activeGiveSubscriptionProduct(env);
        if (!activeProduct.ok || !activeProduct.body?.id) {
          return json(
            { error: "Stripe subscription product setup failed", detail: activeProduct.body?.error?.message || "No active AGAPAY subscription product is available." },
            { status: 502 }
          );
        }
        priceProductId = activeProduct.body.id;
      }
      updateForm.set("items[0][price_data][currency]", "usd");
      updateForm.set("items[0][price_data][product]", priceProductId);
      updateForm.set("items[0][price_data][recurring][interval]", "month");
      updateForm.set("items[0][price_data][unit_amount]", String(tier.monthlyCents));
      updateForm.set("items[0][price_data][tax_behavior]", "exclusive");
    }

    const existingItems = Array.isArray(subscription.body?.items?.data) ? subscription.body.items.data : [];
    existingItems.slice(1).forEach((existingItem, index) => {
      if (!existingItem?.id) return;
      const itemIndex = index + 1;
      updateForm.set(`items[${itemIndex}][id]`, existingItem.id);
      updateForm.set(`items[${itemIndex}][deleted]`, "true");
    });
    addOns.forEach((addOn, index) => {
      const itemIndex = existingItems.length + index;
      const addOnPriceId = addOn.stripePriceEnv ? env[addOn.stripePriceEnv] : "";
      updateForm.set(`items[${itemIndex}][quantity]`, "1");
      if (addOnPriceId) updateForm.set(`items[${itemIndex}][price]`, addOnPriceId);
      else {
        updateForm.set(`items[${itemIndex}][price_data][currency]`, "usd");
        updateForm.set(`items[${itemIndex}][price_data][product]`, currentProduct);
        updateForm.set(`items[${itemIndex}][price_data][recurring][interval]`, "month");
        updateForm.set(`items[${itemIndex}][price_data][unit_amount]`, String(addOn.monthlyCents));
        updateForm.set(`items[${itemIndex}][price_data][tax_behavior]`, "exclusive");
      }
    });

    const changed = await stripeFormRequest(
      env,
      `/v1/subscriptions/${encodeURIComponent(registration.stripeSubscriptionId)}`,
      updateForm
    );
    if (!changed.ok) {
      return json(
        { error: "Stripe subscription update failed", detail: changed.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }

    let updated = withTierFundDefaults({
      ...billingRegistration,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionAddOns: requestedAddOns,
      subscriptionAddOnMonthlyCents: addOnMonthlyCents,
      subscriptionBaseMonthlyCents: tier.monthlyCents,
      subscriptionMonthlyCents,
      subscriptionStatus: changed.body.status || registration.subscriptionStatus || "active",
      stripeSubscriptionId: changed.body.id || registration.stripeSubscriptionId,
      subscriptionUpdatedAt: new Date().toISOString()
    }, tier);
    updated = await persistSubscriptionMaterialChange(env, reference, registration, updated, saveRegistrationRecord);
    return json({ ok: true, subscriptionChanged: true, registration: updated });
  }

  let stripeCustomerId = registration.stripeCustomerId || "";
  if (!stripeCustomerId) {
    const customerForm = new URLSearchParams({
      email: registration.treasurerEmail || registration.priestEmail || "",
      name: billingRegistration.billingLegalName || registration.parishName || "AGAPAY parish",
      "address[line1]": billingRegistration.billingAddressLine1,
      "address[line2]": billingRegistration.billingAddressLine2,
      "address[city]": billingRegistration.billingCity,
      "address[state]": billingRegistration.billingState,
      "address[postal_code]": billingRegistration.billingPostalCode,
      "address[country]": billingRegistration.billingCountry,
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

    // A parish may have already had its exemption claim approved before
    // this Customer existed (see approveTaxExemption's "waiting for
    // customer" path in src/lib/tax-exemption.js). Apply it now, before
    // creating the first taxable Checkout Session -- never silently create
    // a taxable subscription for an already-approved-exempt parish.
    const exemptionApplied = await applyApprovedExemptionIfExists(env, {
      registration: { ...billingRegistration, reference },
      stripeCustomerId,
      customerRole: "giving_parish_plus"
    });
    if (exemptionApplied.applied && !exemptionApplied.ok) {
      return json(
        { error: "Billing configuration issue -- your organization's approved tax exemption could not be applied yet. Please contact support@agapay.app before completing checkout." },
        { status: 503 }
      );
    }
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
    "metadata[agapay_subscription_add_ons]": requestedAddOns.join(","),
    "metadata[agapay_pricing_program]": registration.subscriptionPricingProgram || "standard",
    "metadata[agapay_household_band]": registration.parishHouseholdBand || "",
    "metadata[agapay_early_adopter_slot]": registration.earlyAdopterSlot ? String(registration.earlyAdopterSlot) : "",
    "metadata[agapay_trial_days]": trialDays ? String(trialDays) : "",
    "subscription_data[metadata][agapay_reference]": reference,
    "subscription_data[metadata][agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "subscription_data[metadata][agapay_subscription_tier]": tier.id,
    "subscription_data[metadata][agapay_subscription_add_ons]": requestedAddOns.join(","),
    "subscription_data[metadata][agapay_pricing_program]": registration.subscriptionPricingProgram || "standard",
    "subscription_data[metadata][agapay_household_band]": registration.parishHouseholdBand || "",
    "subscription_data[metadata][agapay_early_adopter_slot]": registration.earlyAdopterSlot ? String(registration.earlyAdopterSlot) : "",
    "subscription_data[metadata][agapay_trial_days]": trialDays ? String(trialDays) : "",
    "line_items[0][quantity]": "1"
  });

  if (trialDays) {
    checkoutForm.set("payment_method_collection", "if_required");
    checkoutForm.set("subscription_data[trial_period_days]", String(trialDays));
    checkoutForm.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
  }

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
    // These four tiers (mission/parish/diocese/monastery_free) are all the
    // same underlying product -- the AGAPAY Giving/platform subscription --
    // at different price points, so they all use the "giving" tax code key.
    const taxCodeResult = applySubscriptionTaxCode(checkoutForm, "line_items[0][price_data][product_data]", "giving", env);
    if (taxCodeResult.blocked) {
      return json(
        { error: "Billing configuration issue -- checkout is temporarily unavailable while a required tax setting is completed. Please contact support@agapay.app." },
        { status: 503 }
      );
    }
  }

  for (const [index, addOn] of addOns.entries()) {
    const itemIndex = index + 1;
    const addOnPriceId = addOn.stripePriceEnv ? env[addOn.stripePriceEnv] : "";
    checkoutForm.set(`line_items[${itemIndex}][quantity]`, "1");
    if (addOnPriceId) {
      checkoutForm.set(`line_items[${itemIndex}][price]`, addOnPriceId);
      continue;
    }
    checkoutForm.set(`line_items[${itemIndex}][price_data][currency]`, "usd");
    checkoutForm.set(`line_items[${itemIndex}][price_data][unit_amount]`, String(addOn.monthlyCents));
    checkoutForm.set(`line_items[${itemIndex}][price_data][recurring][interval]`, "month");
    checkoutForm.set(`line_items[${itemIndex}][price_data][tax_behavior]`, "exclusive");
    checkoutForm.set(`line_items[${itemIndex}][price_data][product_data][name]`, `AGAPAY ${addOn.label} Add-on`);
    checkoutForm.set(`line_items[${itemIndex}][price_data][product_data][description]`, addOn.description);
    const addOnTaxCode = applySubscriptionTaxCode(checkoutForm, `line_items[${itemIndex}][price_data][product_data]`, "giving", env);
    if (addOnTaxCode.blocked) return json({ error: "Billing configuration issue -- checkout is temporarily unavailable while a required tax setting is completed. Please contact support@agapay.app." }, { status: 503 });
  }

  const session = await stripeFormRequest(env, "/v1/checkout/sessions", checkoutForm);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription checkout failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  let updated = withTierFundDefaults({
    ...billingRegistration,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionAddOns: requestedAddOns,
    subscriptionAddOnMonthlyCents: addOnMonthlyCents,
    subscriptionBaseMonthlyCents: tier.monthlyCents,
    subscriptionMonthlyCents,
    subscriptionStatus: trialDays ? "trial_checkout_created" : "checkout_created",
    subscriptionTrialDays: trialDays || 0,
    subscriptionTrialRequestedAt: trialDays ? new Date().toISOString() : "",
    stripeCustomerId,
    stripeSubscriptionCheckoutSessionId: session.body.id || "",
    stripeSubscriptionCheckoutCreatedAt: new Date().toISOString()
  }, tier);
  updated = await persistSubscriptionMaterialChange(env, reference, registration, updated, saveRegistrationRecord);

  return json({ ok: true, checkoutUrl: session.body.url, registration: updated }, { status: 201 });
}
