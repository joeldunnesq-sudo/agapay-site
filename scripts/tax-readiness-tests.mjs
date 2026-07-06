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

import {
  TAX_READINESS_STATUSES,
  DEFAULT_TAX_READINESS_STATUS,
  hasCompleteBillingAddress,
  withTaxReadinessDefaults,
  taxReadinessCheckoutGate
} from "../src/lib/tax-readiness.js";
import { createSubscriptionCheckoutForRegistration } from "../src/lib/subscription-checkout.js";

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

// ── hasCompleteBillingAddress ───────────────────────────────────────────────
check("hasCompleteBillingAddress: true when all required fields present (line2 optional)", () => {
  assert.equal(hasCompleteBillingAddress(COMPLETE_ADDRESS), true);
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
  assert.equal(result.billingLegalName, "");
  assert.equal(result.reference, "abc123"); // existing data preserved
});
check("withTaxReadinessDefaults: never mutates the input object", () => {
  const oldRegistration = { reference: "abc123" };
  withTaxReadinessDefaults(oldRegistration);
  assert.equal(Object.keys(oldRegistration).length, 1); // untouched
});
check("withTaxReadinessDefaults: never overwrites an already-set value", () => {
  const result = withTaxReadinessDefaults({ taxReadinessStatus: "tax_ready_for_checkout", billingCity: "Chicago" });
  assert.equal(result.taxReadinessStatus, "tax_ready_for_checkout");
  assert.equal(result.billingCity, "Chicago");
});
check("withTaxReadinessDefaults: rejects an invalid/corrupt stored status back to the safe default", () => {
  const result = withTaxReadinessDefaults({ taxReadinessStatus: "some_garbage_value" });
  assert.equal(result.taxReadinessStatus, DEFAULT_TAX_READINESS_STATUS);
});

// ── taxReadinessCheckoutGate (the actual pre-checkout gate) ─────────────────
check("gate: blocks when not canonically verified", () => {
  const result = taxReadinessCheckoutGate({ status: "pending", ...COMPLETE_ADDRESS, taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, false);
  assert.equal(result.body.code, "not_verified");
});
check("gate: blocks when verified but billing address incomplete, regardless of tax status", () => {
  const result = taxReadinessCheckoutGate({ status: "verified", taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, false);
  assert.equal(result.body.code, "billing_address_required");
  assert.equal(result.status, 422);
});
check("gate: blocks when verified + address complete but tax readiness not yet cleared (default tax_needs_review)", () => {
  const result = taxReadinessCheckoutGate({ status: "verified", ...COMPLETE_ADDRESS });
  assert.equal(result.ok, false);
  assert.equal(result.body.code, "tax_readiness_required");
  assert.equal(result.body.taxReadinessStatus, "tax_needs_review");
});
check("gate: blocks when tax status is explicitly tax_blocked", () => {
  const result = taxReadinessCheckoutGate({ status: "verified", ...COMPLETE_ADDRESS, taxReadinessStatus: "tax_blocked" });
  assert.equal(result.ok, false);
  assert.equal(result.body.taxReadinessStatus, "tax_blocked");
});
check("gate: passes when verified + address complete + tax_ready_for_checkout", () => {
  const result = taxReadinessCheckoutGate({ status: "verified", ...COMPLETE_ADDRESS, taxReadinessStatus: "tax_ready_for_checkout" });
  assert.equal(result.ok, true);
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

await checkAsync("checkout: paid tier + not tax-ready is blocked before any Stripe call is made", async () => {
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCallCount++; throw new Error("Should not reach Stripe"); };
  try {
    const registration = { status: "verified", subscriptionTier: "mission", ...COMPLETE_ADDRESS }; // verified + address, but no taxReadinessStatus set
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest, env: { STRIPE_SECRET_KEY: "sk_test_fake" }, reference: "test-ref", registration, body: {}, saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.code, "tax_readiness_required");
    assert.equal(fetchCallCount, 0);
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

await checkAsync("checkout: verified + complete address + tax_ready_for_checkout succeeds (Stripe calls mocked)", async () => {
  let calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/v1/customers")) {
      return { ok: true, json: async () => ({ id: "cus_fake123" }) };
    }
    if (String(url).includes("/v1/checkout/sessions")) {
      return { ok: true, json: async () => ({ id: "cs_fake123", url: "https://checkout.stripe.com/fake" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  try {
    const registration = {
      status: "verified", subscriptionTier: "mission", taxReadinessStatus: "tax_ready_for_checkout",
      treasurerEmail: "treasurer@example.org", parishName: "St. Fiacre", ...COMPLETE_ADDRESS
    };
    const response = await createSubscriptionCheckoutForRegistration({
      request: fakeRequest, env: { STRIPE_SECRET_KEY: "sk_test_fake" }, reference: "test-ref", registration, body: {}, saveRegistrationRecord: noopSave
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.checkoutUrl, "https://checkout.stripe.com/fake");
    assert.equal(calls.length, 2); // customer create + checkout session create
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
