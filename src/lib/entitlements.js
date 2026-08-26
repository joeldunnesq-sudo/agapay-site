// Centralized feature-entitlement logic for the AGAPAY Parish subscription
// model. This is the single source of truth for "does this parish have
// access to X" -- every handler and the parish dashboard client should
// derive access from these functions rather than re-deriving the same
// tier/add-on logic independently (which is how sacramentsEnabledFor ended
// up defined twice, byte-identical, in parish.js and donor.js, and how the
// client carried its own copy of the tier check in public/parish/app.js).
//
// AGAPAY Parish + was previously sold as a separate $39/mo add-on
// subscription. It is no longer sold that way: each module below is
// included on specific tiers instead. Parishes with a still-active legacy
// add-on subscription or comp grant keep access to every module regardless
// of tier, so no existing subscriber loses anything they are currently
// paying for.
import { hasActiveStewardshipComp, hasStewardshipAccess, stewardshipStatus } from "./core.js";
import { subscriptionAddOns, subscriptionAddOnsFor } from "./subscriptions.js";

// Per-tier, per-module inclusion. Bookstore/Commerce is included for
// monasteries even though Stewardship Health and Sacraments are not --
// matches the "product and craft sale campaigns" capability already
// promised on the public features page for monastic communities.
const TIER_MODULES = {
  starter: { givingPlus: false, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, commerceSuite: false, communications: false, textToGive: false, accounting: false, accountingAdvancedOperations: false },
  giving: { givingPlus: true, stewardshipHealth: true, sacraments: false, directory: true, bookstore: false, commerceSuite: false, communications: false, textToGive: false, accounting: false, accountingAdvancedOperations: false },
  parish: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, commerceSuite: true, communications: true, textToGive: true, accounting: true, accountingAdvancedOperations: true },
  diocese: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, commerceSuite: true, communications: true, textToGive: true, accounting: true, accountingAdvancedOperations: true },
  monastery_free: { givingPlus: true, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, commerceSuite: false, communications: false, textToGive: false, accounting: false, accountingAdvancedOperations: false }
};
const MODULE_IDS = ["stewardshipHealth", "sacraments", "directory", "bookstore", "commerceSuite", "textToGive"];
export const GIVING_FEATURES = Object.freeze({
  basicGiving: null,
  candles: null,
  starterDesignatedFund: null,
  branding: "givingPlus",
  customFunds: "givingPlus",
  campaigns: "givingPlus",
  commemorations: null,
  annualStatements: "givingPlus",
  reconciliation: "givingPlus",
  giverInsights: "givingPlus",
  qrToolkit: null
});

export function normalizedSubscriptionTier(registration) {
  const tier = String(registration?.subscriptionTier || "").toLowerCase();
  return tier === "mission" ? "starter" : tier;
}

export function tierIncludesModule(registration, moduleId) {
  const tier = normalizedSubscriptionTier(registration) || "parish";
  const status = String(registration?.subscriptionStatus || "").toLowerCase();
  const isEndedDemo = Number(registration?.subscriptionTrialDays || 0) > 0
    && ["cancelled", "canceled", "paused", "past_due", "unpaid", "incomplete_expired"].includes(status);
  if (isEndedDemo) return false;
  return Boolean(TIER_MODULES[tier]?.[moduleId]);
}

export function givingFeatureAccess(registration, featureId) {
  if (!Object.prototype.hasOwnProperty.call(GIVING_FEATURES, featureId)) return false;
  const requiredModule = GIVING_FEATURES[featureId];
  return requiredModule === null || tierIncludesModule(registration, requiredModule);
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
  const selected = new Set(subscriptionAddOnsFor(registration));
  return subscriptionAddOns.some((addOn) => selected.has(addOn.id) && addOn.modules.includes(moduleId));
}

export function hasModuleAccess(registration, moduleId) {
  // Directory and Text-to-Give were never part of the retired Parish + add-on.
  // They are available only through a tier that explicitly includes them.
  if (moduleId === "directory" || moduleId === "textToGive" || moduleId === "commerceSuite" || moduleId === "communications") {
    return tierIncludesModule(registration, moduleId) || subscriptionAddOnIncludesModule(registration, moduleId);
  }
  return tierIncludesModule(registration, moduleId) || subscriptionAddOnIncludesModule(registration, moduleId) || hasLegacyParishPlusAddOn(registration);
}

// True if the parish has at least the Parish-tier module set, or the
// legacy add-on. Used where a single "Parish + active" boolean is needed
// (e.g. dashboard nav badges) rather than a per-module check.
export function hasParishPlusAccess(registration) {
  return tierIncludesParishPlus(registration) || hasLegacyParishPlusAddOn(registration);
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
  if (normalizedSubscriptionTier(registration) === "starter") return false;
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
  return registration?.accountingEnabled !== false && hasModuleAccess(registration, "accounting");
}

export function accountingTierFor(registration) {
  if (!accountingEnabledFor(registration)) return "unavailable";
  return hasModuleAccess(registration, "accountingAdvancedOperations") ? "advanced_operations" : "core";
}

function moduleSource(registration, moduleId) {
  if (tierIncludesModule(registration, moduleId)) return "tier";
  if (subscriptionAddOnIncludesModule(registration, moduleId)) return "add_on";
  if (hasLegacyParishPlusAddOn(registration)) return "legacy_addon";
  return "none";
}

// A single payload the parish dashboard client can consume directly,
// instead of re-deriving tier/add-on logic itself.
export function entitlementsSummary(registration) {
  const tier = normalizedSubscriptionTier(registration) || "parish";
  return {
    tier,
    addOns: subscriptionAddOnsFor(registration),
    parishPlusIncludedInTier: tierIncludesParishPlus(registration),
    parishPlusActive: hasParishPlusAccess(registration),
    legacyAddOnActive: hasLegacyParishPlusAddOn(registration),
    legacyAddOnStatus: stewardshipStatus(registration),
    comped: hasActiveStewardshipComp(registration),
    modules: {
      givingPlus: {
        included: tierIncludesModule(registration, "givingPlus"),
        source: tierIncludesModule(registration, "givingPlus") ? "tier" : "none"
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
