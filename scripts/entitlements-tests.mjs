import assert from "node:assert/strict";
import {
  bookstoreEnabledFor,
  commerceSuiteEnabledFor,
  communicationsEnabledFor,
  accountingEnabledFor,
  accountingTierFor,
  directoryEnabledFor,
  entitlementsSummary,
  eventsEnabledFor,
  givingFeatureAccess,
  hasLegacyParishPlusAddOn,
  hasModuleAccess,
  hasParishPlusAccess,
  mealsEnabledFor,
  sacramentsEnabledFor,
  tierIncludesModule,
  tierIncludesParishPlus
} from "../src/lib/entitlements.js";
import { parishIntroDemoEligible } from "../src/lib/subscriptions.js";

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

await test("Give + includes stewardship, directory, and Bookstore without operational add-ons", async () => {
  const reg = { subscriptionTier: "giving" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(tierIncludesModule(reg, "directory"), true);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesParishPlus(reg), false);
  assert.equal(hasParishPlusAccess(reg), false);
});

await test("Give provides core giving without Give + features", async () => {
  const reg = { subscriptionTier: "starter" };
  assert.equal(tierIncludesModule(reg, "givingPlus"), false);
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(entitlementsSummary(reg).modules.givingPlus.included, false);
  assert.equal(tierIncludesModule({ subscriptionTier: "giving" }, "givingPlus"), true);
  for (const feature of ["branding", "customFunds", "campaigns", "annualStatements", "reconciliation", "giverInsights"]) {
    assert.equal(givingFeatureAccess(reg, feature), false);
    assert.equal(givingFeatureAccess({ subscriptionTier: "giving" }, feature), true);
  }
  assert.equal(givingFeatureAccess(reg, "basicGiving"), true);
  assert.equal(givingFeatureAccess(reg, "candles"), true);
  assert.equal(givingFeatureAccess(reg, "starterDesignatedFund"), true);
  assert.equal(givingFeatureAccess(reg, "qrToolkit"), true);
  assert.equal(givingFeatureAccess(reg, "commemorations"), true);
  assert.equal(givingFeatureAccess(reg, "campaigns"), false);
  assert.equal(entitlementsSummary(reg).givingFeatures.branding, false);
  assert.equal(entitlementsSummary(reg).givingFeatures.candles, true);
  assert.equal(entitlementsSummary(reg).givingFeatures.starterDesignatedFund, true);
});

await test("Accounting is available through its Give + add-on or Parish", async () => {
  assert.equal(accountingEnabledFor({ subscriptionTier: "giving" }), false);
  const accountingAddOn = { subscriptionTier: "giving", subscriptionAddOns: ["bookstore", "full_commerce", "accounting"] };
  assert.equal(accountingEnabledFor(accountingAddOn), true);
  assert.equal(bookstoreEnabledFor(accountingAddOn), true);
  assert.equal(commerceSuiteEnabledFor(accountingAddOn), true);
  assert.deepEqual(entitlementsSummary(accountingAddOn).addOns, ["accounting"]);
  assert.equal(accountingTierFor(accountingAddOn), "advanced_operations");
  assert.equal(accountingEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(accountingTierFor({ subscriptionTier: "giving" }), "unavailable");
  assert.equal(accountingTierFor({ subscriptionTier: "parish" }), "advanced_operations");
  assert.equal(entitlementsSummary({ subscriptionTier: "giving" }).modules.accounting.coreLedgerIncluded, false);
  assert.equal(entitlementsSummary({ subscriptionTier: "parish" }).modules.accounting.advancedOperationsIncluded, true);
});

await test("Give + add-ons unlock only their selected modules", async () => {
  const reg = { subscriptionTier: "giving", subscriptionAddOns: ["bookstore", "sacraments"] };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(hasModuleAccess(reg, "sacraments"), true);
  assert.equal(tierIncludesModule(reg, "directory"), true);
  assert.equal(hasModuleAccess(reg, "bookstore"), true);
  assert.equal(tierIncludesModule(reg, "commerceSuite"), false);
  assert.equal(bookstoreEnabledFor(reg), true);
  assert.deepEqual(entitlementsSummary(reg).addOns, ["sacraments"]);
  assert.equal(commerceSuiteEnabledFor(reg), false);
  assert.equal(tierIncludesModule(reg, "textToGive"), false);
});

await test("Parish tier includes every public module", async () => {
  const reg = { subscriptionTier: "parish" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(tierIncludesModule(reg, "sacraments"), true);
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesModule(reg, "commerceSuite"), true);
  assert.equal(commerceSuiteEnabledFor(reg), true);
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

await test("The introductory parish demo is available only before the first activation", async () => {
  assert.equal(parishIntroDemoEligible({ subscriptionStatus: "not_started" }), true);
  assert.equal(parishIntroDemoEligible({ subscriptionStatus: "trial_checkout_created", subscriptionTrialDays: 30 }), true);
  assert.equal(parishIntroDemoEligible({ subscriptionActivatedAt: "2026-07-01T00:00:00.000Z" }), false);
  assert.equal(parishIntroDemoEligible({ subscriptionTrialEndsAt: "2026-08-01T00:00:00.000Z" }), false);
  assert.equal(parishIntroDemoEligible({ stripeSubscriptionId: "sub_previous" }), false);
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
  assert.equal(hasModuleAccess(reg, "commerceSuite"), false);
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

await test("Full Commerce includes Bookstore and never requires both add-ons", async () => {
  const commerce = entitlementsSummary({ subscriptionTier: "giving", subscriptionAddOns: ["bookstore", "full_commerce"] });
  const parish = entitlementsSummary({ subscriptionTier: "parish" });
  assert.deepEqual(commerce.addOns, ["full_commerce"]);
  assert.equal(commerce.modules.bookstore.included, true);
  assert.equal(commerce.modules.commerceSuite.included, true);
  assert.equal(parish.modules.bookstore.included, true);
  assert.equal(parish.modules.commerceSuite.included, true);
  assert.equal(commerceSuiteEnabledFor({ subscriptionTier: "diocese" }), true);
  assert.equal(commerceSuiteEnabledFor({ subscriptionTier: "giving" }), false);
});

await test("Events and Meals default on but retain independent donor-facing switches", async () => {
  const registration = { subscriptionTier: "parish", eventsEnabled: false, mealsEnabled: true };
  const summary = entitlementsSummary(registration).modules.commerceSuite;
  assert.equal(summary.included, true, "turning off a storefront must not remove the parish admin workspace");
  assert.equal(summary.eventsEnabled, false);
  assert.equal(summary.mealsEnabled, true);
  assert.equal(eventsEnabledFor(registration), false);
  assert.equal(mealsEnabledFor(registration), true);
  assert.equal(eventsEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(mealsEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(eventsEnabledFor({ subscriptionTier: "giving" }), false);
  assert.equal(mealsEnabledFor({ subscriptionTier: "giving" }), false);
});

await test("communications is included in Give + and honors the parish on/off choice", async () => {
  assert.equal(communicationsEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(communicationsEnabledFor({ subscriptionTier: "parish", communicationsEnabled: false }), false);
  assert.equal(communicationsEnabledFor({ subscriptionTier: "diocese" }), true);
  assert.equal(communicationsEnabledFor({ subscriptionTier: "giving" }), true);
  assert.equal(communicationsEnabledFor({ subscriptionTier: "giving", subscriptionAddOns: ["koinonia"] }), true);
  assert.equal(communicationsEnabledFor({ subscriptionTier: "mission", stewardshipStatus: "active" }), false);
  const disabled = entitlementsSummary({ subscriptionTier: "parish", communicationsEnabled: false }).modules.communications;
  assert.equal(disabled.included, true, "turning Communications off must not remove the staff workspace entitlement");
  assert.equal(disabled.parishHasEnabled, false);
  assert.equal(disabled.source, "tier");
});

await test("directoryEnabledFor requires the tier and both parish member-directory switches", async () => {
  const enabled = { directoryEnabled: true, ordinaryMemberAccessEnabled: true };
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, enabled), true);
  assert.equal(directoryEnabledFor({ subscriptionTier: "giving" }, enabled), true);
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, { ...enabled, directoryEnabled: false }), false);
  assert.equal(directoryEnabledFor({ subscriptionTier: "parish" }, { ...enabled, ordinaryMemberAccessEnabled: false }), false);
});

await test("bookstoreEnabledFor defaults open (not explicitly false) once module access exists", async () => {
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish", bookstoreEnabled: false }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "giving" }), true);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "giving", bookstoreEnabled: false }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "giving", subscriptionAddOns: ["full_commerce"] }), true);
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
