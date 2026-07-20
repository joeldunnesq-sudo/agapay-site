import assert from "node:assert/strict";
import {
  bookstoreEnabledFor,
  accountingEnabledFor,
  accountingTierFor,
  entitlementsSummary,
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

await test("Mission tier includes no add-on modules", async () => {
  const reg = { subscriptionTier: "mission" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesModule(reg, "bookstore"), false);
  assert.equal(tierIncludesParishPlus(reg), false);
  assert.equal(hasParishPlusAccess(reg), false);
});

await test("Mission and Parish both receive core Accounting without crippling the Mission ledger", async () => {
  assert.equal(accountingEnabledFor({ subscriptionTier: "mission" }), true);
  assert.equal(accountingEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(accountingTierFor({ subscriptionTier: "mission" }), "core");
  assert.equal(accountingTierFor({ subscriptionTier: "parish" }), "advanced_operations");
  assert.equal(entitlementsSummary({ subscriptionTier: "mission" }).modules.accounting.coreLedgerIncluded, true);
  assert.equal(entitlementsSummary({ subscriptionTier: "mission" }).modules.accounting.advancedOperationsIncluded, false);
  assert.equal(entitlementsSummary({ subscriptionTier: "parish" }).modules.accounting.advancedOperationsIncluded, true);
});

await test("Parish tier includes every module (folded-in AGAPAY Parish +)", async () => {
  const reg = { subscriptionTier: "parish" };
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), true);
  assert.equal(tierIncludesModule(reg, "sacraments"), true);
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesParishPlus(reg), true);
  assert.equal(hasParishPlusAccess(reg), true);
});

await test("Diocese tier includes every module, same as Parish", async () => {
  const reg = { subscriptionTier: "diocese" };
  assert.equal(tierIncludesParishPlus(reg), true);
  assert.equal(hasModuleAccess(reg, "sacraments"), true);
});

await test("Monastery tier includes Bookstore only, not Stewardship or Sacraments", async () => {
  const reg = { subscriptionTier: "monastery_free" };
  assert.equal(tierIncludesModule(reg, "bookstore"), true);
  assert.equal(tierIncludesModule(reg, "stewardshipHealth"), false);
  assert.equal(tierIncludesModule(reg, "sacraments"), false);
  assert.equal(tierIncludesParishPlus(reg), false);
});

await test("An active legacy $39/mo add-on subscription grandfathers a Mission-tier parish into every module", async () => {
  const reg = { subscriptionTier: "mission", stewardshipStatus: "active" };
  assert.equal(hasLegacyParishPlusAddOn(reg), true);
  assert.equal(hasParishPlusAccess(reg), true);
  assert.equal(hasModuleAccess(reg, "stewardshipHealth"), true);
  assert.equal(hasModuleAccess(reg, "sacraments"), true);
  assert.equal(hasModuleAccess(reg, "bookstore"), true);
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

await test("bookstoreEnabledFor defaults open (not explicitly false) once module access exists", async () => {
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish" }), true);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "parish", bookstoreEnabled: false }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "mission" }), false);
  assert.equal(bookstoreEnabledFor({ subscriptionTier: "monastery_free" }), true);
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
