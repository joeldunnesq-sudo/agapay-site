import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EARLY_ADOPTER_LIMIT,
  parishHouseholdBands,
  parishPricingUsageStatus,
  publicSubscriptionTiers,
  subscriptionAddOns,
  normalizeSubscriptionAddOns,
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
    ["300_599", 54900, 34900],
    ["600_plus", null, null],
  ]
);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "founding_20" }).monthlyCents, 24900);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "standard" }).monthlyCents, 44900);
assert.equal(subscriptionTier({ subscriptionTier: "giving", subscriptionPricingProgram: "standard" }).monthlyCents, 7900);
assert.deepEqual(subscriptionAddOns.map((addOn) => [addOn.id, addOn.earlyAdopterMonthlyCents, addOn.standardMonthlyCents]), [
  ["koinonia", 2900, 2900],
  ["sacraments", 1900, 1900],
  ["bookstore", 900, 900],
  ["full_commerce", 3900, 3900],
  ["accounting", 17900, 17900]
]);
assert.deepEqual(normalizeSubscriptionAddOns(["bookstore", "full_commerce"], "giving"), ["full_commerce"]);
assert.deepEqual(normalizeSubscriptionAddOns(["bookstore", "full_commerce", "accounting"], "giving"), ["accounting"]);
const accountingBundle = normalizeSubscriptionAddOns(["bookstore", "full_commerce", "accounting"], "giving");
assert.equal(
  subscriptionTier({ subscriptionTier: "giving" }).monthlyCents
    + subscriptionAddOns.filter((addOn) => accountingBundle.includes(addOn.id)).reduce((total, addOn) => total + addOn.standardMonthlyCents, 0),
  25800,
  "Giving Plus with Accounting should bill $258/month without stacking included Commerce or Bookstore prices"
);
const focusedOperationsBundle = normalizeSubscriptionAddOns(["koinonia", "sacraments", "bookstore", "full_commerce", "accounting"], "giving");
assert.deepEqual(focusedOperationsBundle, ["koinonia", "sacraments", "accounting"]);
assert.equal(
  subscriptionTier({ subscriptionTier: "giving" }).monthlyCents
    + subscriptionAddOns.filter((addOn) => focusedOperationsBundle.includes(addOn.id)).reduce((total, addOn) => total + addOn.standardMonthlyCents, 0),
  30600,
  "Giving Plus with all non-overlapping operational add-ons should bill $306/month"
);
assert.equal(publicSubscriptionTiers().some((tier) => tier.id === "stewardship"), false);
assert.equal(publicSubscriptionTiers().find((tier) => tier.id === "parish").householdBands.length, 5);
assert.deepEqual(
  parishPricingUsageStatus({ parishHouseholdBand: "under_50" }, 50, 63),
  {
    linkedUsers: 63,
    representedHouseholds: 50,
    selectedBandId: "under_50",
    selectedBandLabel: "Fewer than 50 households",
    recommendedBandId: "50_149",
    recommendedBandLabel: "50–149 households",
    nextBandId: "50_149",
    nextBandLabel: "50–149 households",
    nextThreshold: 50,
    remainingUntilNextBand: 0,
    needsBandSelection: false,
    upgradeRequired: true
  }
);

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
const parishDashboardApp = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
const parishHandler = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const parishPricingUsage = await readFile(new URL("../src/lib/parish-pricing-usage.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0102_subscription_early_adopter_slots.sql", import.meta.url), "utf8");
assert.match(pricingPage, /Early adopter · first 20/);
assert.match(pricingPage, /Koinonia parish feed, targeted announcements, and member engagement/);
assert.match(pricingPage, /Ministry-led Events and Meals/);
assert.match(registerPage, /id="parishHouseholdBand"/);
assert.match(registerPage, /parishHouseholdBand: document\.getElementById\('parishHouseholdBand'\)\.value/);
assert.match(parishDashboardApp, /bandSelectId:'subscriptionHouseholdBandUpgrade'/);
assert.match(parishDashboardApp, /parishHouseholdBand:householdBand\?\.value\|\|''/);
assert.match(parishDashboardApp, /Household-band update needed/);
assert.match(parishDashboardApp, /linked user/);
assert.match(parishPricingUsage, /COUNT\(DISTINCT links\.external_id\) AS linked_users/);
assert.match(parishPricingUsage, /COUNT\(DISTINCT COALESCE\(households\.id, 'person:' \|\| people\.id\)\) AS represented_households/);
assert.match(parishHandler, /code: "parish_household_band_upgrade_required"/);
assert.equal((migration.match(/\([0-9]+, 'available'/g) || []).length, 20);

console.log("PASS - household-based Parish pricing and the first-20 early-adopter program are wired");
