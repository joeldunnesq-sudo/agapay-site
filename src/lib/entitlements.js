// Generated from src/lib/entitlements.ts by npm run build:server. Do not edit.
import { hasActiveStewardshipComp, hasStewardshipAccess, stewardshipStatus } from './core.js';
import {
  subscriptionAddOns,
  subscriptionAddOnsFor,
  subscriptionTiers,
  subscriptionEntitlementActive,
} from './subscriptions.js';
import { organizationModuleProfile, organizationTypeEligibleForModule } from '../organizations/module-profiles.js';
import { organizationClassificationForRegistration } from '../organizations/types.js';
const TIER_MODULES = Object.fromEntries(
  subscriptionTiers.map((tier) => [
    tier.id,
    {
      ...tier.modules,
      accountingAdvancedOperations: tier.modules.accountingTier === 'advanced_operations',
    },
  ])
);
const LEGACY_MODULES = /* @__PURE__ */ new Set([
  'stewardshipHealth',
  'sacraments',
  'bookstore',
  'library',
  'accounting',
  'accountingAdvancedOperations',
]);
const MODULE_IDS = ['stewardshipHealth', 'sacraments', 'directory', 'bookstore', 'commerceSuite', 'textToGive'];
const GIVING_FEATURES = Object.freeze({
  basicGiving: null,
  candles: null,
  starterDesignatedFund: null,
  branding: 'givingPlus',
  customFunds: null,
  givers: null,
  campaigns: 'givingPlus',
  commemorations: null,
  annualStatements: 'givingPlus',
  reconciliation: null,
  giverInsights: 'givingPlus',
  qrToolkit: null,
});
function normalizedSubscriptionTier(registration) {
  const tier = String(registration?.subscriptionTier || '')
    .trim()
    .toLowerCase();
  return tier === 'mission' ? 'starter' : tier;
}
function tierIncludesModule(registration, moduleId) {
  const tier = normalizedSubscriptionTier(registration) || 'parish';
  if (!subscriptionEntitlementActive(registration)) return false;
  return Boolean(TIER_MODULES[tier]?.[moduleId]);
}
function givingFeatureAccess(registration, featureId) {
  if (!Object.prototype.hasOwnProperty.call(GIVING_FEATURES, featureId)) return false;
  const requiredModule = GIVING_FEATURES[featureId];
  return requiredModule === null
    ? organizationEligibleForEntitlementModule(registration, 'giving')
    : hasModuleAccess(registration, requiredModule);
}
function tierIncludesParishPlus(registration) {
  return MODULE_IDS.every((moduleId) => tierIncludesModule(registration, moduleId));
}
function hasLegacyParishPlusAddOn(registration) {
  return hasStewardshipAccess(registration);
}
function subscriptionAddOnIncludesModule(registration, moduleId) {
  if (!subscriptionEntitlementActive(registration)) return false;
  const selected = new Set(subscriptionAddOnsFor(registration));
  return subscriptionAddOns.some((addOn) => selected.has(addOn.id) && addOn.modules.includes(moduleId));
}
function structuralModuleId(moduleId) {
  return moduleId === 'accountingAdvancedOperations' ? 'accounting' : moduleId;
}
function organizationEligibleForEntitlementModule(registration, moduleId) {
  const classification = organizationClassificationForRegistration(registration);
  return Boolean(
    classification.recognized &&
    organizationTypeEligibleForModule(classification.organizationType, structuralModuleId(moduleId))
  );
}
function hasModuleAccess(registration, moduleId) {
  return (
    organizationEligibleForEntitlementModule(registration, moduleId) &&
    (tierIncludesModule(registration, moduleId) ||
      subscriptionAddOnIncludesModule(registration, moduleId) ||
      (LEGACY_MODULES.has(moduleId) && hasLegacyParishPlusAddOn(registration)))
  );
}
function hasParishPlusAccess(registration) {
  return (
    MODULE_IDS.every((moduleId) => organizationEligibleForEntitlementModule(registration, moduleId)) &&
    (tierIncludesParishPlus(registration) || hasLegacyParishPlusAddOn(registration))
  );
}
function stewardshipToolAccess(registration) {
  return hasModuleAccess(registration, 'stewardshipHealth');
}
function sacramentsEnabledFor(registration) {
  return Boolean(registration?.sacramentsEnabled) && hasModuleAccess(registration, 'sacraments');
}
function directoryEnabledFor(registration, settings = {}) {
  return (
    Boolean(settings?.directoryEnabled) &&
    Boolean(settings?.ordinaryMemberAccessEnabled) &&
    hasModuleAccess(registration, 'directory')
  );
}
function bookstoreEnabledFor(registration) {
  return registration?.bookstoreEnabled !== false && hasModuleAccess(registration, 'bookstore');
}
function communicationsEnabledFor(registration) {
  return registration?.communicationsEnabled !== false && hasModuleAccess(registration, 'communications');
}
function signupsEnabledFor(registration) {
  return communicationsEnabledFor(registration) && registration?.signupsEnabled !== false;
}
function exchangeEnabledFor(registration) {
  return communicationsEnabledFor(registration) && registration?.exchangeEnabled !== false;
}
function prayerRequestsEnabledFor(registration) {
  return communicationsEnabledFor(registration) && registration?.prayerRequestsEnabled !== false;
}
function commerceSuiteEnabledFor(registration) {
  return hasModuleAccess(registration, 'commerceSuite');
}
function eventsEnabledFor(registration) {
  return commerceSuiteEnabledFor(registration) && registration?.eventsEnabled !== false;
}
function mealsEnabledFor(registration) {
  return commerceSuiteEnabledFor(registration) && registration?.mealsEnabled !== false;
}
function accountingEnabledFor(registration) {
  if (!registration || registration.accountingEnabled === false) return false;
  return hasModuleAccess(registration, 'accounting');
}
function accountingTierFor(registration) {
  if (!accountingEnabledFor(registration)) return 'unavailable';
  return hasModuleAccess(registration, 'accountingAdvancedOperations') ? 'advanced_operations' : 'core';
}
function moduleSource(registration, moduleId) {
  if (!organizationEligibleForEntitlementModule(registration, moduleId)) return 'none';
  if (tierIncludesModule(registration, moduleId)) return 'tier';
  if (subscriptionAddOnIncludesModule(registration, moduleId)) return 'add_on';
  if (LEGACY_MODULES.has(moduleId) && hasLegacyParishPlusAddOn(registration)) return 'legacy_addon';
  return 'none';
}
function entitlementsSummary(registration) {
  const tier = normalizedSubscriptionTier(registration) || 'parish';
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
      moduleActivation: moduleProfile.activation,
    },
    parishPlusIncludedInTier: parishPlusStructurallyEligible && tierIncludesParishPlus(registration),
    parishPlusActive: hasParishPlusAccess(registration),
    legacyAddOnActive: parishPlusStructurallyEligible && hasLegacyParishPlusAddOn(registration),
    legacyAddOnStatus: stewardshipStatus(registration),
    comped: parishPlusStructurallyEligible && hasActiveStewardshipComp(registration),
    modules: {
      givingPlus: {
        included: hasModuleAccess(registration, 'givingPlus'),
        source: moduleSource(registration, 'givingPlus'),
      },
      stewardshipHealth: {
        included: hasModuleAccess(registration, 'stewardshipHealth'),
        source: moduleSource(registration, 'stewardshipHealth'),
      },
      sacraments: {
        // Tier access and the parish's donor-facing on/off choice are
        // separate concerns. The dashboard workspace must remain available
        // to an entitled parish so staff can turn the feature on.
        included: hasModuleAccess(registration, 'sacraments'),
        parishHasEnabled: Boolean(registration?.sacramentsEnabled),
        source: moduleSource(registration, 'sacraments'),
      },
      bookstore: {
        // Tier access and the parish's donor-facing on/off choice are
        // separate concerns, just as they are for Sacraments.
        included: hasModuleAccess(registration, 'bookstore'),
        parishHasEnabled: registration?.bookstoreEnabled !== false,
        source: moduleSource(registration, 'bookstore'),
      },
      commerceSuite: {
        included: commerceSuiteEnabledFor(registration),
        eventsEnabled: eventsEnabledFor(registration),
        mealsEnabled: mealsEnabledFor(registration),
        source: moduleSource(registration, 'commerceSuite'),
      },
      communications: {
        included: hasModuleAccess(registration, 'communications'),
        parishHasEnabled: registration?.communicationsEnabled !== false,
        source: moduleSource(registration, 'communications'),
      },
      directory: {
        included: hasModuleAccess(registration, 'directory'),
        source: moduleSource(registration, 'directory'),
      },
      library: {
        included: hasModuleAccess(registration, 'library'),
        source: moduleSource(registration, 'library'),
      },
      textToGive: {
        included: hasModuleAccess(registration, 'textToGive'),
        source: moduleSource(registration, 'textToGive'),
      },
      accounting: {
        included: accountingEnabledFor(registration),
        tier: accountingTierFor(registration),
        coreLedgerIncluded: accountingEnabledFor(registration),
        advancedOperationsIncluded: accountingTierFor(registration) === 'advanced_operations',
        source: moduleSource(registration, 'accounting'),
      },
    },
    givingFeatures: Object.fromEntries(
      Object.keys(GIVING_FEATURES).map((featureId) => [featureId, givingFeatureAccess(registration, featureId)])
    ),
  };
}
export {
  GIVING_FEATURES,
  accountingEnabledFor,
  accountingTierFor,
  bookstoreEnabledFor,
  commerceSuiteEnabledFor,
  communicationsEnabledFor,
  directoryEnabledFor,
  entitlementsSummary,
  eventsEnabledFor,
  exchangeEnabledFor,
  givingFeatureAccess,
  hasLegacyParishPlusAddOn,
  hasModuleAccess,
  hasParishPlusAccess,
  mealsEnabledFor,
  normalizedSubscriptionTier,
  organizationEligibleForEntitlementModule,
  prayerRequestsEnabledFor,
  sacramentsEnabledFor,
  signupsEnabledFor,
  stewardshipToolAccess,
  subscriptionAddOnIncludesModule,
  tierIncludesModule,
  tierIncludesParishPlus,
};
