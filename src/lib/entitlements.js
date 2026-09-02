// Centralized feature-entitlement logic for the AGAPAY Parish subscription
// model. This is the single source of truth for "does this organization have
// access to X" -- every handler and the parish dashboard client should
// derive access from these functions rather than re-deriving the same
// tier/add-on logic independently (which is how sacramentsEnabledFor ended
// up defined twice, byte-identical, in parish.js and donor.js, and how the
// client carried its own copy of the tier check in public/parish/app.js).
//
// AGAPAY Parish + was previously sold as a separate $39/mo add-on
// subscription. It is no longer sold that way: each module below is
// included on specific tiers instead. Parishes with a still-active legacy
// add-on subscription or comp grant keep their historical module access.
// This compatibility path is not a purchasable plan or a feature gate.
import { hasActiveStewardshipComp, hasStewardshipAccess, stewardshipStatus } from "./core.js";
import { subscriptionAddOns, subscriptionAddOnsFor, subscriptionTiers, subscriptionEntitlementActive } from "./subscriptions.js";
import { organizationModuleProfile, organizationTypeEligibleForModule } from "../organizations/module-profiles.js";
import { organizationClassificationForRegistration } from "../organizations/types.js";

// Per-tier, per-module inclusion. Give + is the purchasable foundation for
// Directory, Bookstore, Parish Library, and Koinonia; the remaining
// operational pillars layer onto it as add-ons.
const TIER_MODULES = Object.fromEntries(subscriptionTiers.map((tier) => [tier.id, {
  ...tier.modules,
  accountingAdvancedOperations: tier.modules.accountingTier === "advanced_operations"
}]));
const LEGACY_MODULES = new Set(["stewardshipHealth", "sacraments", "bookstore", "library", "accounting", "accountingAdvancedOperations"]);
const MODULE_IDS = ["stewardshipHealth", "sacraments", "directory", "bookstore", "commerceSuite", "textToGive"];
export const GIVING_FEATURES = Object.freeze({
  basicGiving: null,
  candles: null,
  starterDesignatedFund: null,
  branding: "givingPlus",
  customFunds: null,
  givers: null,
  campaigns: "givingPlus",
  commemorations: null,
  annualStatements: "givingPlus",
  reconciliation: null,
  giverInsights: "givingPlus",
  qrToolkit: null
});

export function normalizedSubscriptionTier(registration) {
  const tier = String(registration?.subscriptionTier || "").trim().toLowerCase();
  return tier === "mission" ? "starter" : tier;
}

export function tierIncludesModule(registration, moduleId) {
  const tier = normalizedSubscriptionTier(registration) || "parish";
  if (!subscriptionEntitlementActive(registration)) return false;
  return Boolean(TIER_MODULES[tier]?.[moduleId]);
}

export function givingFeatureAccess(registration, featureId) {
  if (!Object.prototype.hasOwnProperty.call(GIVING_FEATURES, featureId)) return false;
  const requiredModule = GIVING_FEATURES[featureId];
  return requiredModule === null
    ? organizationEligibleForEntitlementModule(registration, "giving")
    : hasModuleAccess(registration, requiredModule);
}

// Back-compat convenience: "Parish +" as a bundle, true if the parish's
// tier includes every module that used to ship under that add-on.
export function tierIncludesParishPlus(registration) {
  return MODULE_IDS.every((moduleId) => tierIncludesModule(registration, moduleId));
}

// The legacy $39/mo add-on: active/trialing Stripe subscription or an
// active comp grant. Not sold to new parishes; honored for existing ones,
// and unlocks every module (matching what the add-on always included).
export function hasLegacyParishPlusAddOn(registration) {
  return hasStewardshipAccess(registration);
}

export function subscriptionAddOnIncludesModule(registration, moduleId) {
  if (!subscriptionEntitlementActive(registration)) return false;
  const selected = new Set(subscriptionAddOnsFor(registration));
  return subscriptionAddOns.some((addOn) => selected.has(addOn.id) && addOn.modules.includes(moduleId));
}

function structuralModuleId(moduleId) {
  // Advanced Accounting is a subscription tier inside the structurally
  // eligible Accounting module, not a separately activatable organization module.
  return moduleId === "accountingAdvancedOperations" ? "accounting" : moduleId;
}

export function organizationEligibleForEntitlementModule(registration, moduleId) {
  const classification = organizationClassificationForRegistration(registration);
  return Boolean(
    classification.recognized
    && organizationTypeEligibleForModule(classification.organizationType, structuralModuleId(moduleId))
  );
}

export function hasModuleAccess(registration, moduleId) {
  return organizationEligibleForEntitlementModule(registration, moduleId)
    && (tierIncludesModule(registration, moduleId)
    || subscriptionAddOnIncludesModule(registration, moduleId)
    || (LEGACY_MODULES.has(moduleId) && hasLegacyParishPlusAddOn(registration)));
}

// True if the parish has at least the Parish-tier module set, or the
// legacy add-on. Used where a single "Parish + active" boolean is needed
// (e.g. dashboard nav badges) rather than a per-module check.
export function hasParishPlusAccess(registration) {
  return MODULE_IDS.every((moduleId) => organizationEligibleForEntitlementModule(registration, moduleId))
    && (tierIncludesParishPlus(registration) || hasLegacyParishPlusAddOn(registration));
}

export function stewardshipToolAccess(registration) {
  return hasModuleAccess(registration, "stewardshipHealth");
}

export function sacramentsEnabledFor(registration) {
  return Boolean(registration?.sacramentsEnabled) && hasModuleAccess(registration, "sacraments");
}

export function directoryEnabledFor(registration, settings = {}) {
  return Boolean(settings?.directoryEnabled)
    && Boolean(settings?.ordinaryMemberAccessEnabled)
    && hasModuleAccess(registration, "directory");
}

export function bookstoreEnabledFor(registration) {
  return registration?.bookstoreEnabled !== false && hasModuleAccess(registration, "bookstore");
}

export function communicationsEnabledFor(registration) {
  return registration?.communicationsEnabled !== false && hasModuleAccess(registration, "communications");
}

export function signupsEnabledFor(registration) {
  return communicationsEnabledFor(registration)
    && registration?.signupsEnabled !== false;
}

export function exchangeEnabledFor(registration) {
  return communicationsEnabledFor(registration)
    && registration?.exchangeEnabled !== false;
}

export function prayerRequestsEnabledFor(registration) {
  return communicationsEnabledFor(registration)
    && registration?.prayerRequestsEnabled !== false;
}

export function commerceSuiteEnabledFor(registration) {
  return hasModuleAccess(registration, "commerceSuite");
}

export function eventsEnabledFor(registration) {
  return commerceSuiteEnabledFor(registration)
    && registration?.eventsEnabled !== false;
}

export function mealsEnabledFor(registration) {
  return commerceSuiteEnabledFor(registration)
    && registration?.mealsEnabled !== false;
}

export function accountingEnabledFor(registration) {
  if (!registration || registration.accountingEnabled === false) return false;
  return hasModuleAccess(registration, "accounting");
}

export function accountingTierFor(registration) {
  if (!accountingEnabledFor(registration)) return "unavailable";
  return hasModuleAccess(registration, "accountingAdvancedOperations") ? "advanced_operations" : "core";
}

function moduleSource(registration, moduleId) {
  if (!organizationEligibleForEntitlementModule(registration, moduleId)) return "none";
  if (tierIncludesModule(registration, moduleId)) return "tier";
  if (subscriptionAddOnIncludesModule(registration, moduleId)) return "add_on";
  if (LEGACY_MODULES.has(moduleId) && hasLegacyParishPlusAddOn(registration)) return "legacy_addon";
  return "none";
}

// A single payload the parish dashboard client can consume directly,
// instead of re-deriving tier/add-on logic itself.
export function entitlementsSummary(registration) {
  const tier = normalizedSubscriptionTier(registration) || "parish";
  const classification = organizationClassificationForRegistration(registration);
  const moduleProfile = organizationModuleProfile(classification.organizationType);
  const parishPlusStructurallyEligible = MODULE_IDS.every((moduleId) =>
    organizationEligibleForEntitlementModule(registration, moduleId)
  );
  return {
    tier,
    addOns: subscriptionAddOnsFor(registration),
    organizationEligibility: {
      organizationType: classification.organizationType,
      organizationSubtype: classification.organizationSubtype,
      classificationRecognized: classification.recognized,
      moduleProfileId: moduleProfile.id,
      moduleActivation: moduleProfile.activation
    },
    parishPlusIncludedInTier: parishPlusStructurallyEligible && tierIncludesParishPlus(registration),
    parishPlusActive: hasParishPlusAccess(registration),
    legacyAddOnActive: parishPlusStructurallyEligible && hasLegacyParishPlusAddOn(registration),
    legacyAddOnStatus: stewardshipStatus(registration),
    comped: parishPlusStructurallyEligible && hasActiveStewardshipComp(registration),
    modules: {
      givingPlus: {
        included: hasModuleAccess(registration, "givingPlus"),
        source: moduleSource(registration, "givingPlus")
      },
      stewardshipHealth: {
        included: hasModuleAccess(registration, "stewardshipHealth"),
        source: moduleSource(registration, "stewardshipHealth")
      },
      sacraments: {
        // Tier access and the parish's donor-facing on/off choice are
        // separate concerns. The dashboard workspace must remain available
        // to an entitled parish so staff can turn the feature on.
        included: hasModuleAccess(registration, "sacraments"),
        parishHasEnabled: Boolean(registration?.sacramentsEnabled),
        source: moduleSource(registration, "sacraments")
      },
      bookstore: {
        // Tier access and the parish's donor-facing on/off choice are
        // separate concerns, just as they are for Sacraments.
        included: hasModuleAccess(registration, "bookstore"),
        parishHasEnabled: registration?.bookstoreEnabled !== false,
        source: moduleSource(registration, "bookstore")
      },
      commerceSuite: {
        included: commerceSuiteEnabledFor(registration),
        eventsEnabled: eventsEnabledFor(registration),
        mealsEnabled: mealsEnabledFor(registration),
        source: moduleSource(registration, "commerceSuite")
      },
      communications: {
        included: hasModuleAccess(registration, "communications"),
        parishHasEnabled: registration?.communicationsEnabled !== false,
        source: moduleSource(registration, "communications")
      },
      directory: {
        included: hasModuleAccess(registration, "directory"),
        source: moduleSource(registration, "directory")
      },
      library: {
        included: hasModuleAccess(registration, "library"),
        source: moduleSource(registration, "library")
      },
      textToGive: {
        included: hasModuleAccess(registration, "textToGive"),
        source: moduleSource(registration, "textToGive")
      },
      accounting: {
        included: accountingEnabledFor(registration),
        tier: accountingTierFor(registration),
        coreLedgerIncluded: accountingEnabledFor(registration),
        advancedOperationsIncluded: accountingTierFor(registration) === "advanced_operations",
        source: moduleSource(registration, "accounting")
      }
    },
    givingFeatures: Object.fromEntries(
      Object.keys(GIVING_FEATURES).map((featureId) => [featureId, givingFeatureAccess(registration, featureId)])
    )
  };
}
