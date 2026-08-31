import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
// scripts/tax-readiness-tests.mjs
//
// Exercises the real src/lib/tax-readiness.js gate directly (pure
// functions, no mocking needed), plus src/lib/subscription-checkout.js's
// actual createSubscriptionCheckoutForRegistration() end-to-end for the
// free-tier bypass and the two blocking paths -- with a monkeypatched
// global fetch so no real network/Stripe calls happen, and an assertion
// that fetch was never called for the blocked paths (proof no Stripe
// Customer or Checkout Session gets created before the gate passes).
//
// Run directly: node scripts/tax-readiness-tests.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TAX_READINESS_STATUSES,
  DEFAULT_TAX_READINESS_STATUS,
  hasCompleteBillingAddress,
  withTaxReadinessDefaults,
  subscriptionCheckoutReadinessGate
} from "../src/lib/tax-readiness.js";
import { createSubscriptionCheckoutForRegistration } from "../src/lib/subscription-checkout.js";
import { subscriptionReady } from "../src/lib/subscriptions.js";

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS - ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${label}`);
    console.error(`  ${err.message}`);
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`PASS - ${label}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${label}`);
    console.error(`  ${err.message}`);
  }
}

const COMPLETE_ADDRESS = {
  billingLegalName: "St. Fiacre Orthodox Church",
  billingAddressLine1: "123 Main St",
  billingCity: "Springfield",
  billingState: "IL",
  billingPostalCode: "62701",
  billingCountry: "US"
};

const REGISTRATION_ADDRESS = {
  parishName: "St. Nicholas Orthodox Church",
  addressLine1: "45 Registration Way",
  addressLine2: "Parish Office",
  city: "San Antonio",
  state: "TX",
  postalCode: "78205",
  country: "US"
};

const parishDashboardScript = readParishDashboardSource();
const adminDashboardHtml = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
const adminDashboardScript = readFileSync(new URL("../public/admin/app.js", import.meta.url), "utf8");
const taxExemptionHandlerSource = readFileSync(new URL("../src/handlers/tax-exemption.js", import.meta.url), "utf8");

check("parish dashboard: exposes the complete authenticated exemption request, upload, status, and document-view workflow", () => {
  for (const required of [
    "taxExemptionPane",
    "submitParishTaxExemption",
    "uploadParishTaxExemptionDocument",
    "viewParishTaxExemptionDocument",
    "'/tax-exemption' + path",
    "taxExemptionApi('/upload')",
    "taxExemptionApi('/document')"
  ]) assert.ok(parishDashboardScript.includes(required), `missing parish exemption UI wiring: ${required}`);
});

check("admin dashboard: makes exemption reviews a numbered overview step and documents the Stripe confirmation workflow", () => {
  for (const required of [
    "overviewTaxExemptionCount",
    "Review tax exemptions",
    "Confirm Stripe sync.",
    "navTaxExemptionCount"
  ]) assert.ok(adminDashboardHtml.includes(required), `missing admin exemption workflow affordance: ${required}`);
  assert.ok(adminDashboardScript.includes("loadTaxExemptionSummary();"));
  assert.ok(adminDashboardScript.includes("c.needsAttention"));
});

check("parish exemption route: prevents duplicate active claims and links a later terminal-state claim to the prior record", () => {
  assert.ok(taxExemptionHandlerSource.includes('["pending", "replacement_required", "approved"].includes(currentClaim.status)'));
  assert.ok(taxExemptionHandlerSource.includes("supersedesTaxExemptionId: currentClaim?.id || null"));
});

// ── hasCompleteBillingAddress ───────────────────────────────────────────────
check("hasCompleteBillingAddress: true when all required fields present (line2 optional)", () => {
  assert.equal(hasCompleteBillingAddress(COMPLETE_ADDRESS), true);
});
check("hasCompleteBillingAddress: registration name and address provide the initial billing address", () => {
  assert.equal(hasCompleteBillingAddress(REGISTRATION_ADDRESS), true);
});
check("hasCompleteBillingAddress: false when a required field is missing", () => {
  const { billingState, ...withoutState } = COMPLETE_ADDRESS;
  assert.equal(hasCompleteBillingAddress(withoutState), false);
});
check("hasCompleteBillingAddress: false when a required field is blank/whitespace", () => {
  assert.equal(hasCompleteBillingAddress({ ...COMPLETE_ADDRESS, billingCity: "   " }), false);
});

// ── withTaxReadinessDefaults ─────────────────────────────────────────────────
check("withTaxReadinessDefaults: old registration with no tax fields gets safe defaults, doesn't crash", () => {
  const oldRegistration = { reference: "abc123", status: "verified", parishName: "Old Parish" };
  const result = withTaxReadinessDefaults(oldRegistration);
  assert.equal(result.taxReadinessStatus, DEFAULT_TAX_READINESS_STATUS);
  assert.equal(result.billingLegalName, "Old Parish");
  assert.equal(result.reference, "abc123"); // existing data preserved
});
check("withTaxReadinessDefaults: never mutates the input object", () => {
  const oldRegistration = { reference: "abc123" };
  withTaxReadinessDefaults(oldRegistration);
  assert.equal(Object.keys(oldRegistration).length, 1); // untouched
});
check("withTaxReadinessDefaults: never overwrites an already-set value", () => {
  const result = withTaxReadinessDefaults({
    ...REGISTRATION_ADDRESS,
    taxReadinessStatus: "tax_ready_for_checkout",
    billingLegalName: "Separate Billing Entity",
    billingCity: "Chicago"
  });
  assert.equal(result.taxReadinessStatus, "tax_ready_for_checkout");
  assert.equal(result.billingLegalName, "Separate Billing Entity");
  assert.equal(result.billingCity, "Chicago");
});
check("withTaxReadinessDefaults: maps every registration address field into billing", () => {
  const result = withTaxReadinessDefaults(REGISTRATION_ADDRESS);
  assert.equal(result.billingLegalName, REGISTRATION_ADDRESS.parishName);
  assert.equal(result.billingAddressLine1, REGISTRATION_ADDRESS.addressLine1);
  assert.equal(result.billingAddressLine2, REGISTRATION_ADDRESS.addressLine2);
  assert.equal(result.billingCity, REGISTRATION_ADDRESS.city);
  assert.equal(result.billingState, REGISTRATION_ADDRESS.state);
  assert.equal(result.billingPostalCode, REGISTRATION_ADDRESS.postalCode);
  assert.equal(result.billingCountry, REGISTRATION_ADDRESS.country);
});
check("withTaxReadinessDefaults: rejects an invalid/corrupt stored status back to the safe default", () => {
  const result = withTaxReadinessDefaults({ taxReadinessStatus: "some_garbage_value" });
  assert.equal(result.taxReadinessStatus, DEFAULT_TAX_READINESS_STATUS);
});

// ── subscriptionCheckoutReadinessGate (verification + billing only) ─────────
check("gate: blocks when not canonically verified", () => {
  const result = subscriptionCheckoutReadinessGate({ status: "pending", ...COMPLETE_ADDRESS, taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, false);
  assert.equal(result.body.code, "not_verified");
});
check("gate: blocks when verified but billing address incomplete, regardless of tax status", () => {
  const result = subscriptionCheckoutReadinessGate({ status: "verified", taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, false);
  assert.equal(result.body.code, "billing_address_required");
  assert.equal(result.status, 422);
});
check("gate: per-parish tax review status does not block subscription checkout", () => {
  for (const taxReadinessStatus of ["tax_needs_review", "tax_registration_pending", "tax_not_required_yet", "tax_blocked"]) {
    const result = subscriptionCheckoutReadinessGate({ status: "verified", ...COMPLETE_ADDRESS, taxReadinessStatus });
    assert.equal(result.ok, true, `${taxReadinessStatus} must not gate platform Stripe Checkout`);
  }
});
check("gate: passes when verified + address complete + tax_ready_for_checkout", () => {
  const result = subscriptionCheckoutReadinessGate({ status: "verified", ...COMPLETE_ADDRESS, taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, true);
});
check("gate: passes with the inherited registration address", () => {
  const result = subscriptionCheckoutReadinessGate({ status: "verified", ...REGISTRATION_ADDRESS, taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, true);
});
check("subscription readiness: an explicit cancellation overrides an old Stripe subscription ID", () => {
  assert.equal(subscriptionReady({ stripeSubscriptionId: "sub_old", subscriptionStatus: "cancelled" }), false);
  assert.equal(subscriptionReady({ stripeSubscriptionId: "sub_trial", subscriptionStatus: "trialing" }), true);
  assert.equal(subscriptionReady({ stripeSubscriptionId: "sub_legacy" }), true);
});

// ── End-to-end via the real createSubscriptionCheckoutForRegistration() ────
const fakeRequest = { url: "https://agapay.app/api/admin/registrations/test-ref/subscription-checkout" };
async function noopSave(env, reference, registration) { return registration; }

await checkAsync("checkout: free tier bypasses the gate entirely (no verification, no address, no tax review needed)", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("Should not call Stripe for a free tier"); };
  try {
    const registration = { status: "pending", subscriptionTier: "monastery_free" }; // NOT verified, NO billing address
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest, env: {}, reference: "test-ref", registration, body: {}, saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("checkout: paid tier missing billing address is blocked before any Stripe call, even if marked tax_ready_for_checkout", async () => {
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCallCount++; throw new Error("Should not reach Stripe"); };
  try {
    const registration = { status: "verified", subscriptionTier: "mission", taxReadinessStatus: "tax_ready_for_checkout" }; // no billing address
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest, env: { STRIPE_SECRET_KEY: "sk_test_fake" }, reference: "test-ref", registration, body: {}, saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.code, "billing_address_required");
    assert.equal(fetchCallCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("checkout: Parish paid checkout relies on Stripe automatic tax, not manual parish tax status", async () => {
  let calls = [];
  let customerBody = "";
  let checkoutBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes("/v1/customers")) {
      customerBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "cus_fake123" }) };
    }
    if (String(url).includes("/v1/checkout/sessions")) {
      checkoutBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "cs_fake123", url: "https://checkout.stripe.com/fake" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified", subscriptionTier: "parish", parishHouseholdBand: "under_50", taxReadinessStatus: "tax_needs_review",
      treasurerEmail: "treasurer@example.org", ...REGISTRATION_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest, env: { STRIPE_SECRET_KEY: "sk_test_fake" }, reference: "test-ref", registration, body: {}, saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const checkout = new URLSearchParams(checkoutBody);
    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.checkoutUrl, "https://checkout.stripe.com/fake");
    assert.equal(calls.length, 2); // customer create + checkout session create
    const customer = new URLSearchParams(customerBody);
    assert.equal(customer.get("name"), REGISTRATION_ADDRESS.parishName);
    assert.equal(customer.get("address[line1]"), REGISTRATION_ADDRESS.addressLine1);
    assert.equal(customer.get("address[line2]"), REGISTRATION_ADDRESS.addressLine2);
    assert.equal(customer.get("address[city]"), REGISTRATION_ADDRESS.city);
    assert.equal(customer.get("address[state]"), REGISTRATION_ADDRESS.state);
    assert.equal(customer.get("address[postal_code]"), REGISTRATION_ADDRESS.postalCode);
    assert.equal(customer.get("address[country]"), REGISTRATION_ADDRESS.country);
    assert.equal(payload.registration.billingAddressLine1, REGISTRATION_ADDRESS.addressLine1);
    assert.equal(checkout.get("automatic_tax[enabled]"), "true");
    assert.equal(checkout.get("billing_address_collection"), "required");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("active subscription: changes the existing item instead of creating a second Checkout subscription", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let updateBody = "";
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (String(url).includes("/v1/subscriptions/sub_existing") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          id: "sub_existing",
          status: "active",
          items: { data: [{ id: "si_existing", price: { product: { id: "prod_existing" } } }] }
        })
      };
    }
    if (String(url).includes("/v1/subscriptions/sub_existing") && options.method === "POST") {
      updateBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "sub_existing", status: "active" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified",
      subscriptionTier: "starter",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_existing",
      parishId: "st-test",
      parishName: "St. Test",
      taxReadinessStatus: "tax_ready_for_checkout",
      ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest,
      env: { STRIPE_SECRET_KEY: "sk_test_fake" },
      reference: "test-ref",
      registration,
      body: { subscriptionTier: "parish", parishHouseholdBand: "under_50" },
      saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const params = new URLSearchParams(updateBody);
    assert.equal(response.status, 200);
    assert.equal(payload.subscriptionChanged, true);
    assert.equal(payload.registration.subscriptionTier, "parish");
    assert.equal(calls.length, 2);
    assert.equal(params.get("items[0][id]"), "si_existing");
    assert.equal(params.get("items[0][price_data][product]"), "prod_existing");
    assert.equal(params.get("items[0][price_data][unit_amount]"), "14900");
    assert.equal(params.get("proration_behavior"), "create_prorations");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("active subscription: replaces an archived inline Checkout product with the active AGAPAY product", async () => {
  const originalFetch = globalThis.fetch;
  let updateBody = "";
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes("/v1/subscriptions/sub_archived") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          id: "sub_archived",
          status: "active",
          items: { data: [{ id: "si_archived", price: { product: { id: "prod_archived", active: false } } }] }
        })
      };
    }
    if (value.includes("/v1/products/search")) {
      return { ok: true, json: async () => ({ data: [{ id: "prod_agapay_give", active: true }] }) };
    }
    if (value.includes("/v1/subscriptions/sub_archived") && options.method === "POST") {
      updateBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "sub_archived", status: "active" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified",
      subscriptionTier: "starter",
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_archived",
      parishId: "st-test",
      parishName: "St. Test",
      taxReadinessStatus: "tax_ready_for_checkout",
      ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest,
      env: { STRIPE_SECRET_KEY: "sk_test_fake" },
      reference: "test-ref",
      registration,
      body: { subscriptionTier: "parish", parishHouseholdBand: "under_50" },
      saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const params = new URLSearchParams(updateBody);
    assert.equal(response.status, 200);
    assert.equal(payload.subscriptionChanged, true);
    assert.equal(params.get("items[0][price_data][product]"), "prod_agapay_give");
    assert.equal(params.get("items[0][price_data][unit_amount]"), "14900");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("checkout: admin-authorized demo creates a no-card trial that cancels if no payment method is added", async () => {
  let checkoutBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/v1/checkout/sessions")) {
      checkoutBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "cs_trial123", url: "https://checkout.stripe.com/trial" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified", subscriptionTier: "parish", parishHouseholdBand: "under_50", taxReadinessStatus: "tax_blocked",
      stripeCustomerId: "cus_existing", parishName: "St. Fiacre", ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest,
      env: { STRIPE_SECRET_KEY: "sk_test_fake" },
      reference: "test-ref",
      registration,
      body: { trialDays: 30 },
      allowTrial: true,
      saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const params = new URLSearchParams(checkoutBody);
    assert.equal(response.status, 201);
    assert.equal(payload.registration.subscriptionStatus, "trial_checkout_created");
    assert.equal(payload.registration.subscriptionTrialDays, 30);
    assert.equal(params.get("payment_method_collection"), "if_required");
    assert.equal(params.get("subscription_data[trial_period_days]"), "30");
    assert.equal(params.get("subscription_data[trial_settings][end_behavior][missing_payment_method]"), "cancel");
    assert.equal(params.get("metadata[agapay_trial_days]"), "30");
    assert.equal(params.get("subscription_data[metadata][agapay_trial_days]"), "30");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("checkout: trusted parish introductory demo creates a 30-day no-card trial", async () => {
  let checkoutBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/v1/checkout/sessions")) {
      checkoutBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "cs_parish_intro", url: "https://checkout.stripe.com/parish-intro" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified", subscriptionTier: "parish", parishHouseholdBand: "under_50", taxReadinessStatus: "tax_needs_review",
      stripeCustomerId: "cus_existing", parishName: "St. Nicholas", ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest,
      env: { STRIPE_SECRET_KEY: "sk_test_fake" },
      reference: "canonical-parish-ref",
      registration,
      body: { subscriptionTier: "parish", parishHouseholdBand: "under_50", trialDays: 90 },
      introductoryTrialDays: 30,
      saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const params = new URLSearchParams(checkoutBody);
    assert.equal(response.status, 201);
    assert.equal(payload.registration.subscriptionStatus, "trial_checkout_created");
    assert.equal(payload.registration.subscriptionTrialDays, 30);
    assert.equal(params.get("payment_method_collection"), "if_required");
    assert.equal(params.get("subscription_data[trial_period_days]"), "30");
    assert.equal(params.get("subscription_data[trial_settings][end_behavior][missing_payment_method]"), "cancel");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await checkAsync("checkout: parish-supplied trialDays cannot create a free trial", async () => {
  let checkoutBody = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/v1/checkout/sessions")) {
      checkoutBody = String(options.body || "");
      return { ok: true, json: async () => ({ id: "cs_paid123", url: "https://checkout.stripe.com/paid" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified", subscriptionTier: "parish", parishHouseholdBand: "under_50", taxReadinessStatus: "tax_ready_for_checkout",
      stripeCustomerId: "cus_existing", parishName: "St. Fiacre", ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest,
      env: { STRIPE_SECRET_KEY: "sk_test_fake" },
      reference: "test-ref",
      registration,
      body: { trialDays: 30 },
      saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    const params = new URLSearchParams(checkoutBody);
    assert.equal(response.status, 201);
    assert.equal(payload.registration.subscriptionStatus, "checkout_created");
    assert.equal(params.has("subscription_data[trial_period_days]"), false);
    assert.equal(params.has("payment_method_collection"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("");
if (failures > 0) {
  console.error(`${failures} tax readiness test(s) failed.`);
  process.exit(1);
}
console.log("All tax readiness tests passed.");
