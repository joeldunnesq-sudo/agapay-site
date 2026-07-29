import assert from "node:assert/strict";
import {
  bookstoreEnabledFor,
  accountingEnabledFor,
  accountingTierFor,
  directoryEnabledFor,
  entitlementsSummary,
  givingFeatureAccess,
  hasLegacyParishPlusAddOn,
  hasModuleAccess,
  hasParishPlusAccess,
  sacramentsEnabledFor,
  tierIncludesModule,
  tierIncludesParishPlus
} from "../src/lib/entitlements.js";

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("Giving includes only the essential giving platform", async () => {
  const reg = { subscriptionTier: "giving" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesModule(reg, "bookstore"), false);
  assert.equal(tierIncludesParishPlus(reg), false);
  assert.equal(hasParishPlusAccess(reg), false);
});

await test("Starter provides core giving without Giving Plus features", async () => {
  const reg = { subscriptionTier: "starter" };
  assert.equal(tierIncludesModule(reg, "givingPlus"), false);
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(entitlementsSummary(reg).modules.givingPlus.included, false);
  assert.equal(tierIncludesModule({ subscriptionTier: "giving" }, "givingPlus"), true);
  for (const feature of ["branding", "customFunds", "campaigns", "commemorations", "annualStatements", "reconciliation", "giverInsights"]) {
    assert.equal(givingFeatureAccess(reg, feature), false);
    assert.equal(givingFeatureAccess({ subscriptionTier: "giving" }, feature), true);
  }
  assert.equal(givingFeatureAccess(reg, "basicGiving"), true);
  assert.equal(givingFeatureAccess(reg, "qrToolkit"), true);
  assert.equal(entitlementsSummary(reg).givingFeatures.branding, false);
});

await test("Accounting remains unavailable outside the private Parish demo", async () => {
  assert.equal(accountingEnabledFor({ subscriptionTier: "giving" }), false);
  assert.equal(accountingEnabledFor({ subscriptionTier: "stewardship" }), false);
  assert.equal(accountingEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(accountingTierFor({ subscriptionTier: "giving" }), "unavailable");
  assert.equal(accountingTierFor({ subscriptionTier: "parish" }), "advanced_operations");
  assert.equal(entitlementsSummary({ subscriptionTier: "giving" }).modules.accounting.coreLedgerIncluded, false);
  assert.equal(entitlementsSummary({ subscriptionTier: "parish" }).modules.accounting.advancedOperationsIncluded, true);
});

await test("Stewardship adds insights but not parish operations", async () => {
  const reg = { subscriptionTier: "stewardship" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesModule(reg, "directory"), false);
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesModule(reg, "textToGive"), false);
});

await test("Parish tier includes every public module", async () => {
  const reg = { subscriptionTier: "parish" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(tierIncludesModule(reg, "sacraments"), true);
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesModule(reg, "directory"), true);
  assert.equal(tierIncludesModule(reg, "textToGive"), true);
  assert.equal(tierIncludesParishPlus(reg), true);
  assert.equal(hasParishPlusAccess(reg), true);
});

await test("A cancelled no-card demo loses its tier modules", async () => {
  const reg = {
    subscriptionTier: "parish",
    subscriptionStatus: "cancelled",
    subscriptionTrialDays: 30,
    sacramentsEnabled: true,
    bookstoreEnabled: true
  };
  assert.equal(tierIncludesModule(reg, "directory"), false);
  assert.equal(accountingEnabledFor(reg), false);
  assert.equal(sacramentsEnabledFor(reg), false);
  assert.equal(bookstoreEnabledFor(reg), false);
});

await test("Diocese tier includes every module, same as Parish", async () => {
  const reg = { subscriptionTier: "diocese" };
  assert.equal(tierIncludesParishPlus(reg), true);
  assert.equal(hasModuleAccess(reg, "sacraments"), true);
});

await test("Monastery tier receives the basic Giving feature set for free", async () => {
  const reg = { subscriptionTier: "monastery_free" };
  assert.equal(tierIncludesModule(reg, "bookstore"), false);
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesParishPlus(reg), false);
});

await test("An active legacy add-on preserves its original modules but not new Parish-only features", async () => {
  const reg = { subscriptionTier: "mission", stewardshipStatus: "active" };
  assert.equal(hasLegacyParishPlusAddOn(reg), true);
  assert.equal(hasParishPlusAccess(reg), true);
  assert.equal(hasModuleAccess(reg, "stewardshipHealth"), true);
  assert.equal(hasModuleAccess(reg, "sacraments"), true);
  assert.equal(hasModuleAccess(reg, "bookstore"), true);
  assert.equal(hasModuleAccess(reg, "directory"), false);
  assert.equal(hasModuleAccess(reg, "textToGive"), false);
});

await test("A cancelled legacy add-on does not grant access on Mission tier", async () => {
  const reg = { subscriptionTier: "mission", stewardshipStatus: "cancelled" };
  assert.equal(hasLegacyParishPlusAddOn(reg), false);
  assert.equal(hasParishPlusAccess(reg), false);
});

await test("An active stewardship comp grant grandfathers a Mission-tier parish regardless of Stripe status", async () => {
  const reg = {
    subscriptionTier: "mission",
    stewardshipStatus: "cancelled",
    stewardshipComp: { active: true, expiresAt: new Date(Date.now() + 86400000).toISOString() }
  };
  assert.equal(hasLegacyParishPlusAddOn(reg), true);
  assert.equal(hasParishPlusAccess(reg), true);
});

await test("An expired comp grant does not grant access", async () => {
  const reg = {
    subscriptionTier: "mission",
    stewardshipStatus: "cancelled",
    stewardshipComp: { active: true, expiresAt: new Date(Date.now() - 86400000).toISOString() }
  };
  assert.equal(hasLegacyParishPlusAddOn(reg), false);
});

await test("sacramentsEnabledFor requires both parish opt-in AND module access", async () => {
  assert.equal(sacramentsEnabledFor({ subscriptionTier: "parish", sacramentsEnabled: true }), true);
  assert.equal(sacramentsEnabledFor({ subscriptionTier: "parish", sacramentsEnabled: false }), false);
  assert.equal(sacramentsEnabledFor({ subscriptionTier: "mission", sacramentsEnabled: true }), false);
});

await test("Sacraments dashboard access remains included when the donor-facing feature is off", async () => {
  const summary = entitlementsSummary({ subscriptionTier: "parish", sacramentsEnabled: false });
  assert.equal(summary.modules.sacraments.included, true);
  assert.equal(summary.modules.sacraments.parishHasEnabled, false);
  assert.equal(sacramentsEnabledFor({ subscriptionTier: "parish", sacramentsEnabled: false }), false);
});

await test("Bookstore dashboard access remains included when the donor-facing feature is off", async () => {
  const summary = entitlementsSummary({ subscriptionTier: "parish", bookstoreEnabled: false });
  assert.equal(summary.modules.bookstore.included, true);
  assert.equal(summary.modules.bookstore.parishHasEnabled, false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish", bookstoreEnabled: false }), false);
});

await test("directoryEnabledFor requires the tier and both parish member-directory switches", async () => {
  const enabled = { directoryEnabled: true, ordinaryMemberAccessEnabled: true };
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, enabled), true);
  assert.equal(directoryEnabledFor({ subscriptionTier: "giving" }, enabled), false);
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, { ...enabled, directoryEnabled: false }), false);
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, { ...enabled, ordinaryMemberAccessEnabled: false }), false);
});

await test("bookstoreEnabledFor defaults open (not explicitly false) once module access exists", async () => {
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish", bookstoreEnabled: false }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "giving" }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "monastery_free" }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "starter", stewardshipStatus: "active" }), false);
});

await test("entitlementsSummary reports source as tier, legacy_addon, or none", async () => {
  assert.equal(entitlementsSummary({ subscriptionTier: "parish" }).modules.stewardshipHealth.source, "tier");
  assert.equal(entitlementsSummary({ subscriptionTier: "mission", stewardshipStatus: "active" }).modules.stewardshipHealth.source, "legacy_addon");
  assert.equal(entitlementsSummary({ subscriptionTier: "mission" }).modules.stewardshipHealth.source, "none");
});

await test("entitlementsSummary shape carries parishPlusIncludedInTier and parishPlusActive independently", async () => {
  const summary = entitlementsSummary({ subscriptionTier: "mission", stewardshipStatus: "trialing" });
  assert.equal(summary.parishPlusIncludedInTier, false);
  assert.equal(summary.parishPlusActive, true);
  assert.equal(summary.legacyAddOnActive, true);
});

if (process.exitCode) {
  console.error(`\n${passed} entitlements assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. entitlements-tests.mjs OK.`);
