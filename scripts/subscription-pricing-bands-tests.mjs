import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parishHouseholdBands,
  parishPricingUsageStatus,
  publicSubscriptionTiers,
  subscriptionAddOns,
  normalizeSubscriptionAddOns,
  subscriptionTier,
} from "../src/lib/subscriptions.js";

assert.deepEqual(
  parishHouseholdBands.map((band) => [band.id, band.standardMonthlyCents, band.earlyAdopterMonthlyCents]),
  [
    ["under_50", 14900, 14900],
    ["50_149", 17900, 17900],
    ["150_299", 19900, 19900],
    ["300_599", 20900, 20900],
    ["600_plus", null, null],
  ]
);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "founding_20" }).monthlyCents, 19900);
assert.equal(subscriptionTier({ subscriptionTier: "parish", parishHouseholdBand: "150_299", subscriptionPricingProgram: "standard" }).monthlyCents, 19900);
assert.equal(subscriptionTier({ subscriptionTier: "giving", subscriptionPricingProgram: "standard" }).monthlyCents, 7900);
assert.deepEqual(subscriptionAddOns.map((addOn) => [addOn.id, addOn.earlyAdopterMonthlyCents, addOn.standardMonthlyCents]), [
  ["sacraments", 900, 900],
  ["full_commerce", 2900, 2900],
  ["accounting", 12900, 12900]
]);
assert.deepEqual(normalizeSubscriptionAddOns(["bookstore", "full_commerce"], "giving"), ["full_commerce"]);
assert.deepEqual(normalizeSubscriptionAddOns(["bookstore", "full_commerce", "accounting"], "giving"), ["accounting"]);
const accountingBundle = normalizeSubscriptionAddOns(["bookstore", "full_commerce", "accounting"], "giving");
assert.equal(
  subscriptionTier({ subscriptionTier: "giving" }).monthlyCents
    + subscriptionAddOns.filter((addOn) => accountingBundle.includes(addOn.id)).reduce((total, addOn) => total + addOn.standardMonthlyCents, 0),
  20800,
  "Give + with Accounting should bill $208/month without stacking included Commerce or Bookstore prices"
);
const focusedOperationsBundle = normalizeSubscriptionAddOns(["koinonia", "sacraments", "bookstore", "full_commerce", "accounting"], "giving");
assert.deepEqual(focusedOperationsBundle, ["sacraments", "accounting"]);
assert.equal(
  subscriptionTier({ subscriptionTier: "giving" }).monthlyCents
    + subscriptionAddOns.filter((addOn) => focusedOperationsBundle.includes(addOn.id)).reduce((total, addOn) => total + addOn.standardMonthlyCents, 0),
  21700,
  "Give + with all non-overlapping operational add-ons should bill $217/month"
);
assert.equal(publicSubscriptionTiers().some((tier) => tier.id === "stewardship"), false);
assert.equal(publicSubscriptionTiers().find((tier) => tier.id === "parish").householdBands.length, 5);
assert.deepEqual(
  parishPricingUsageStatus({ parishHouseholdBand: "under_50" }, 50, 63),
  {
    linkedUsers: 63,
    representedHouseholds: 50,
    selectedBandId: "under_50",
    selectedBandLabel: "Under 50 households",
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

const pricingPage = await readFile(new URL("../public/give/index.html", import.meta.url), "utf8");
const registerPage = await readFile(new URL("../public/register.html", import.meta.url), "utf8");
const parishDashboardApp = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
const parishHandler = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const parishPricingUsage = await readFile(new URL("../src/lib/parish-pricing-usage.js", import.meta.url), "utf8");
assert.doesNotMatch(pricingPage, /early-adopter|first 20/i);
assert.doesNotMatch(pricingPage, /Koinonia · \$49\/mo/);
assert.match(pricingPage, /Sacraments &amp; Services<\/span><strong>\$9\/mo/);
assert.match(pricingPage, /Full Commerce<\/span><strong>\$29\/mo/);
assert.match(pricingPage, /Accounting Suite<\/span><strong>\$129\/mo/);
assert.match(pricingPage, /Koinonia parish community and media/);
assert.match(pricingPage, /Full Commerce adds Events, Meals, tax, and connected orders/);
assert.match(registerPage, /id="parishHouseholdBand"/);
assert.match(registerPage, /parishHouseholdBand: document\.getElementById\('parishHouseholdBand'\)\.value/);
assert.match(parishDashboardApp, /bandSelectId:'subscriptionHouseholdBandUpgrade'/);
assert.match(parishDashboardApp, /parishHouseholdBand:householdBand\?\.value\|\|''/);
assert.match(parishDashboardApp, /Household-band update needed/);
assert.match(parishDashboardApp, /linked user/);
assert.match(parishPricingUsage, /COUNT\(DISTINCT links\.external_id\) AS linked_users/);
assert.match(parishPricingUsage, /COUNT\(DISTINCT COALESCE\(households\.id, 'person:' \|\| people\.id\)\) AS represented_households/);
assert.match(parishHandler, /code: "parish_household_band_upgrade_required"/);
console.log("PASS - proposal-aligned Parish pricing and purchasable Give + add-ons are wired");
