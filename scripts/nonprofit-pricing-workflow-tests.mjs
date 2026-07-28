import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nonprofitApplicationReadiness,
  nonprofitThresholdRisk,
  STRIPE_NONPROFIT_POLICY,
} from "../src/lib/nonprofit-pricing.js";
import { generateNonprofitPricingStorageKey } from "../src/lib/nonprofit-pricing-storage.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("migrations/0042_nonprofit_pricing_applications.sql");
const worker = read("src/worker.js");
const handler = read("src/handlers/nonprofit-pricing.js");
const parishHtml = read("public/parish/dashboard.html");
const parishApp = read("public/parish/app.js");
const adminHtml = read("public/admin.html");
const adminApp = read("public/admin/app.js");
const wrangler = read("wrangler.toml");

for (const table of [
  "nonprofit_pricing_applications",
  "nonprofit_pricing_documents",
  "nonprofit_pricing_audit_log",
  "nonprofit_pricing_threshold_alerts"
]) {
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing ${table}`);
}

assert.equal(STRIPE_NONPROFIT_POLICY.standardAccountsApplySeparately, true);
assert.equal(STRIPE_NONPROFIT_POLICY.accountOwnerMustSubmitWhileLoggedIn, true);
assert.equal(STRIPE_NONPROFIT_POLICY.platformMaySubmitForAccount, false);
assert.equal(STRIPE_NONPROFIT_POLICY.measurementPeriod, "not_confirmed_by_stripe");

const volume = {
  totalNetCents: 100_000,
  nonDonationNetCents: 16_000,
  unclassifiedNetCents: 1_000,
  donationPercent: 83,
  scan: { complete: true }
};
assert.deepEqual(nonprofitThresholdRisk(volume), {
  classifiedNonDonationPercent: 16,
  thresholdExposureCents: 17_000,
  thresholdExposurePercent: 17,
  additionalNonDonationCapacityCents: 3_750,
  headroomPercent: 3,
  riskBand: "watch"
});
assert.equal(nonprofitThresholdRisk({ ...volume, nonDonationNetCents: 18_000 }).riskBand, "near");
assert.equal(nonprofitThresholdRisk({ ...volume, nonDonationNetCents: 20_000 }).riskBand, "breached");
assert.equal(nonprofitThresholdRisk({ ...volume, scan: { complete: false } }).riskBand, "indeterminate");

const application = {
  attested_at: "2026-07-28T00:00:00.000Z",
  confirms_registered_nonprofit: 1,
  confirms_over_80_percent: 1,
  confirms_tax_deductible_donations: 1,
  confirms_account_owner_submission: 1
};
const documents = [{ document_type: "irs_determination", is_current: 1 }];
assert.equal(nonprofitApplicationReadiness(application, documents, volume).readyToSubmit, true);
assert.equal(nonprofitApplicationReadiness(application, [], volume).readyToSubmit, false);

const storageKey = generateNonprofitPricingStorageKey();
assert.match(storageKey, /^nonprofit-pricing\/[a-f0-9]{64}$/);
assert.ok(!storageKey.includes("parish"));

assert.ok(wrangler.includes('binding = "NONPROFIT_PRICING_DOCS"'));
assert.ok(wrangler.includes("NONPROFIT_PRICING_ALERT_EMAIL"));
assert.ok(worker.includes('endsWith("/nonprofit-pricing")'));
assert.ok(worker.includes("/api/admin/nonprofit-pricing/alerts/run"));
assert.ok(handler.includes("Upload Stripe's approval message before recording approval."));
assert.ok(parishHtml.includes("Apply for Stripe nonprofit pricing"));
assert.ok(parishApp.includes("saveNonprofitPricingAttestation"));
assert.ok(adminHtml.includes("Donation-volume threshold monitor"));
assert.ok(adminApp.includes("thresholdExposurePercent"));

console.log("Nonprofit pricing workflow tests passed.");
