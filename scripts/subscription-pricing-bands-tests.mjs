import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EARLY_ADOPTER_LIMIT,
  parishHouseholdBands,
  publicSubscriptionTiers,
  subscriptionTier,
} from "../src/lib/subscriptions.js";
import { claimEarlyAdopterPricing } from "../src/lib/early-adopter-pricing.js";

assert.equal(EARLY_ADOPTER_LIMIT, 20);
assert.deepEqual(
  parishHouseholdBands.map((band) => [band.id, band.standardMonthlyCents, band.earlyAdopterMonthlyCents]),
  [
    ["under_50", 24900, 14900],
    ["50_149", 34900, 19900],
    ["150_299", 44900, 24900],
    ["300_599", 64900, 34900],
    ["600_plus", null, null],
  ]
);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "founding_20" }).monthlyCents, 24900);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "standard" }).monthlyCents, 44900);
assert.equal(subscriptionTier({ subscriptionTier: "giving", subscriptionPricingProgram: "standard" }).monthlyCents, 7900);
assert.equal(subscriptionTier({ subscriptionTier: "stewardship", subscriptionPricingProgram: "standard" }).monthlyCents, 14900);
assert.equal(publicSubscriptionTiers().find((tier) => tier.id === "parish").householdBands.length, 5);

const missingBandResponse = await (await import("../src/lib/subscription-checkout.js")).createSubscriptionCheckoutForRegistration({
  request: { url: "https://agapay.app/api/admin/registrations/test/subscription-checkout" },
  env: {}, reference: "test", registration: { subscriptionTier: "parish" }, body: {}, saveRegistrationRecord: async () => {}
});
assert.equal(missingBandResponse.status, 422);

class MemoryKV {
  constructor(records) { this.records = records; }
  async list() { return { keys: Object.keys(this.records).map((name) => ({ name })), list_complete: true }; }
  async get(key) { return this.records[key] || null; }
}

const claimedRecords = Object.fromEntries(Array.from({ length: 20 }, (_, index) => {
  const reference = `claimed-${index + 1}`;
  return [reference, JSON.stringify({ reference, subscriptionPricingProgram: "founding_20", subscriptionStatus: "active", earlyAdopterSlot: index + 1 })];
}));
assert.deepEqual(await claimEarlyAdopterPricing({ AGAPAY_REGISTRATIONS: new MemoryKV(claimedRecords) }, "next", {}), { program: "standard", slot: null });
delete claimedRecords["claimed-20"];
const twentieth = await claimEarlyAdopterPricing({ AGAPAY_REGISTRATIONS: new MemoryKV(claimedRecords) }, "next", {});
assert.equal(twentieth.program, "founding_20");
assert.equal(twentieth.slot, 20);

const pricingPage = await readFile(new URL("../public/give/pricing.html", import.meta.url), "utf8");
const registerPage = await readFile(new URL("../public/register.html", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0102_subscription_early_adopter_slots.sql", import.meta.url), "utf8");
assert.match(pricingPage, /Early adopter · first 20/);
assert.match(pricingPage, /Koinonia parish feed, targeted announcements, and member engagement/);
assert.match(pricingPage, /Ministry-led Events and Meals/);
assert.match(registerPage, /id="parishHouseholdBand"/);
assert.match(registerPage, /parishHouseholdBand: document\.getElementById\('parishHouseholdBand'\)\.value/);
assert.equal((migration.match(/\([0-9]+, 'available'/g) || []).length, 20);

console.log("PASS - household-based Parish pricing and the first-20 early-adopter program are wired");
