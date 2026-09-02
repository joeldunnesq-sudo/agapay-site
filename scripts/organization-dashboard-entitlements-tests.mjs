import assert from 'node:assert/strict';
import {
  accountingEnabledFor,
  bookstoreEnabledFor,
  communicationsEnabledFor,
  entitlementsSummary,
  eventsEnabledFor,
  exchangeEnabledFor,
  givingFeatureAccess,
  hasModuleAccess,
  mealsEnabledFor,
  organizationEligibleForEntitlementModule,
  prayerRequestsEnabledFor,
  signupsEnabledFor,
  stewardshipToolAccess,
  tierIncludesModule,
} from '../src/lib/entitlements.js';
import { parishDashboardPayload } from '../src/handlers/parish.js';

const legacyChurch = { parishId: 'legacy-church', subscriptionTier: 'parish' };
const legacySummary = entitlementsSummary(legacyChurch);
assert.equal(legacySummary.organizationEligibility.organizationType, 'church');
assert.equal(legacySummary.organizationEligibility.moduleActivation, 'active');
assert.equal(legacySummary.modules.accounting.included, true);
assert.equal(legacySummary.modules.library.included, true);
assert.equal(legacySummary.givingFeatures.basicGiving, true);

const explicitChurch = {
  parishId: 'church-1',
  parishName: 'Church One',
  communityType: 'Parish',
  subscriptionTier: 'parish',
};
assert.deepEqual(entitlementsSummary(explicitChurch).modules, legacySummary.modules);

for (const communityType of [
  'Ministry',
  'Nonprofit',
  'School / Academy',
  'Business',
  'Other Orthodox Organization',
  'Unsupported Future Type',
]) {
  const registration = {
    parishId: `dormant-${communityType}`,
    parishName: `Dormant ${communityType}`,
    communityType,
    subscriptionTier: 'parish',
    subscriptionStatus: 'active',
    subscriptionAddOns: ['accounting'],
    stewardshipStatus: 'active',
    bookstoreEnabled: true,
    communicationsEnabled: true,
    eventsEnabled: true,
    mealsEnabled: true,
  };
  const summary = entitlementsSummary(registration);

  assert.equal(tierIncludesModule(registration, 'accounting'), true, 'Subscription calculation remains independent');
  assert.equal(summary.organizationEligibility.moduleActivation, 'reserved');
  assert.equal(summary.parishPlusIncludedInTier, false);
  assert.equal(summary.parishPlusActive, false);
  assert.equal(summary.legacyAddOnActive, false);
  assert.equal(summary.comped, false);
  for (const [moduleId, module] of Object.entries(summary.modules)) {
    assert.equal(module.included, false, `${communityType} unexpectedly received ${moduleId}`);
    assert.equal(module.source, 'none', `${communityType} exposed a subscription source for ${moduleId}`);
  }
  for (const [featureId, included] of Object.entries(summary.givingFeatures)) {
    assert.equal(included, false, `${communityType} unexpectedly received giving feature ${featureId}`);
  }

  assert.equal(organizationEligibleForEntitlementModule(registration, 'accounting'), false);
  assert.equal(hasModuleAccess(registration, 'accounting'), false);
  assert.equal(accountingEnabledFor(registration), false);
  assert.equal(bookstoreEnabledFor(registration), false);
  assert.equal(communicationsEnabledFor(registration), false);
  assert.equal(eventsEnabledFor(registration), false);
  assert.equal(mealsEnabledFor(registration), false);
  assert.equal(signupsEnabledFor(registration), false);
  assert.equal(exchangeEnabledFor(registration), false);
  assert.equal(prayerRequestsEnabledFor(registration), false);
  assert.equal(stewardshipToolAccess(registration), false);
  assert.equal(givingFeatureAccess(registration, 'basicGiving'), false);

  const payload = parishDashboardPayload(registration.parishId, registration);
  assert.equal(payload.parishPlusIncludedInTier, false);
  assert.equal(payload.stewardshipActive, false);
  assert.equal(payload.bookstoreEnabled, false);
  assert.equal(payload.eventsEnabled, false);
  assert.equal(payload.mealsEnabled, false);
  assert.equal(payload.communicationsEnabled, false);
  assert.equal(payload.signupsEnabled, false);
  assert.equal(payload.exchangeEnabled, false);
  assert.equal(payload.prayerRequestsEnabled, false);
  assert.equal(payload.accountingAvailable, false);
}

const monastery = entitlementsSummary({
  parishId: 'monastery-1',
  communityType: 'Monastery / Skete',
  subscriptionTier: 'monastery_free',
});
assert.equal(monastery.organizationEligibility.moduleActivation, 'active');
assert.equal(monastery.givingFeatures.basicGiving, true);
assert.equal(monastery.modules.accounting.included, false);

const diocese = entitlementsSummary({
  parishId: 'diocese-1',
  communityType: 'Diocese',
  subscriptionTier: 'diocese',
});
assert.equal(diocese.organizationEligibility.moduleActivation, 'active');
assert.equal(diocese.modules.accounting.included, true);

console.log('PASS - Package 6 dashboard entitlements require both organization eligibility and subscription access');
