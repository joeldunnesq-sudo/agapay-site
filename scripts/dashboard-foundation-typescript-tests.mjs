import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  subscriptionEntitlementActive,
  subscriptionReady,
  subscriptionTierFromStripePriceId,
  subscriptionTier,
  publicSubscriptionTiers,
  publicSubscriptionAddOns,
  normalizeSubscriptionAddOns,
  parishHouseholdBandForCount,
} from '../src/lib/subscriptions.js';
import {
  hasModuleAccess,
  accountingEnabledFor,
  directoryEnabledFor,
  givingFeatureAccess,
  entitlementsSummary,
} from '../src/lib/entitlements.js';
import { loadParishPricingUsage, validateParishCheckoutBand } from '../src/lib/parish-pricing-usage.js';
import { parishLifeAvailableFor } from '../src/lib/parish-life-access.js';
import {
  normalizeOnboardingChecks,
  onboardingMaterialVersion,
  invalidateOnboardingSignoffIfChanged,
  requiredPersonalAccessAccepted,
  validateGeneralOperatingFund,
} from '../src/lib/parish-onboarding.js';
import {
  recordParishFeatureRequest,
  loadPendingParishFeatureRequests,
  dismissParishFeatureRequest,
} from '../src/lib/parish-feature-requests.js';

// Exercise the connected pricing/access boundary with legacy and current records.
const base = { communityType: 'parish', subscriptionTier: 'giving', subscriptionAddOns: ['accounting'] };
for (const status of [
  '',
  'active',
  'trialing',
  'free_forever',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'paused',
]) {
  const registration = { ...base, subscriptionStatus: status };
  const allowed = ['', 'active', 'trialing', 'free_forever'].includes(status);
  assert.equal(subscriptionEntitlementActive(registration), allowed, status);
  assert.equal(hasModuleAccess(registration, 'accountingAdvancedOperations'), allowed, status);
  assert.equal(accountingEnabledFor(registration), allowed, status);
  assert.equal(givingFeatureAccess(registration, 'basicGiving'), true);
  assert.equal(givingFeatureAccess(registration, 'unknown-feature'), false);
  assert.equal(hasModuleAccess(registration, 'unknown-module'), false);
}
assert.equal(subscriptionReady({}), false);
assert.equal(subscriptionEntitlementActive({}), true);
assert.equal(subscriptionReady({ stripeSubscriptionId: 'legacy' }), true);
assert.equal(subscriptionReady({ stripeSubscriptionId: 'legacy', subscriptionStatus: 'canceled' }), false);
for (const end of ['2000-01-01', 'invalid']) {
  assert.equal(accountingEnabledFor({ ...base, subscriptionStatus: 'trialing', subscriptionTrialEndsAt: end }), false);
}
assert.equal(
  accountingEnabledFor({ ...base, subscriptionStatus: 'trialing', subscriptionTrialEndsAt: '2999-01-01' }),
  true
);
assert.equal(accountingEnabledFor({ ...base, accountingEnabled: false }), false);
assert.equal(accountingEnabledFor({ ...base, communityType: 'business' }), false);
assert.equal(directoryEnabledFor(base, { directoryEnabled: true }), false);
assert.equal(directoryEnabledFor(base, { directoryEnabled: true, ordinaryMemberAccessEnabled: true }), true);
const legacy = {
  ...base,
  subscriptionTier: 'starter',
  subscriptionStatus: 'canceled',
  stewardshipComp: { active: true },
};
assert.equal(entitlementsSummary(legacy).modules.accounting.source, 'legacy_addon');
assert.equal(accountingEnabledFor({ ...legacy, stewardshipComp: { active: true, expiresAt: '2000-01-01' } }), false);
assert.deepEqual(normalizeSubscriptionAddOns('sacraments,full_commerce,accounting,accounting'), [
  'sacraments',
  'accounting',
]);
assert.deepEqual(normalizeSubscriptionAddOns('null'), []);
assert.deepEqual(normalizeSubscriptionAddOns(['accounting'], 'parish'), []);
for (const [count, band] of [
  [-1, 'under_50'],
  [49, 'under_50'],
  ['50', '50_149'],
  [149, '50_149'],
  [150, '150_299'],
  [300, '300_599'],
  [600, '600_plus'],
]) {
  assert.equal(parishHouseholdBandForCount(count).id, band);
}
assert.equal(subscriptionTier('mission').id, 'starter');
assert.equal(subscriptionTier({ communityType: 'monastery' }).monthlyCents, 0);
const price = subscriptionTierFromStripePriceId({ AGAPAY_STRIPE_PRICE_PARISH_149_MONTHLY: 'price_one' }, 'price_one');
assert.equal(price.parishHouseholdBand, 'under_50');
assert.equal(price.pricingProgram, 'early_adopter', 'retain historical lookup precedence for shared price bindings');
assert.equal(subscriptionTierFromStripePriceId({}, 'missing'), null);
assert.doesNotMatch(
  JSON.stringify([publicSubscriptionTiers(), publicSubscriptionAddOns()]),
  /StripePriceEnv|stripePriceEnv/
);
for (const environment of ['development', 'test', 'staging', 'preview'])
  assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: ` ${environment.toUpperCase()} ` }), true);
assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: 'production' }), false);
assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: 'production', AGAPAY_PARISH_LIFE_ENABLED: ' TRUE ' }), true);

// Run the actual household query: deduplicate linked users/households and isolate tenants.
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE directory_people(id TEXT, active INTEGER);
CREATE TABLE directory_parish_affiliations(person_id TEXT, parish_id TEXT, active INTEGER, status TEXT);
CREATE TABLE directory_person_links(person_id TEXT, external_id TEXT, link_type TEXT, active INTEGER);
CREATE TABLE directory_household_members(person_id TEXT, household_id TEXT, active INTEGER);
CREATE TABLE directory_households(id TEXT, parish_id TEXT, active INTEGER);
INSERT INTO directory_households VALUES ('home', 'a', 1), ('foreign-home', 'b', 1);
`);
for (let i = 0; i < 52; i++) {
  const id = `person-${i}`;
  db.prepare('INSERT INTO directory_people VALUES (?, 1)').run(id);
  db.prepare("INSERT INTO directory_parish_affiliations VALUES (?, 'a', 1, 'member')").run(id);
  db.prepare("INSERT INTO directory_person_links VALUES (?, ?, 'platform_user', 1)").run(id, `user-${i}`);
  if (i < 2) db.prepare("INSERT INTO directory_household_members VALUES (?, 'home', 1)").run(id);
}
db.exec(
  "INSERT INTO directory_person_links VALUES ('person-0', 'user-0', 'platform_user', 1); INSERT INTO directory_household_members VALUES ('person-2', 'foreign-home', 1)"
);
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              return db.prepare(sql).get(...params) ?? null;
            },
          };
        },
      };
    },
  },
};
const selected = { subscriptionTier: 'parish', parishHouseholdBand: 'under_50' };
const usage = await loadParishPricingUsage(env, 'a', selected);
assert.equal(usage.linkedUsers, 52);
assert.equal(usage.representedHouseholds, 51);
assert.equal(usage.upgradeRequired, true);
assert.equal((await validateParishCheckoutBand(env, 'a', selected)).recommendedBandId, '50_149');
assert.equal(await validateParishCheckoutBand(env, 'a', selected, { parishHouseholdBand: '50_149' }), null);
assert.equal(await validateParishCheckoutBand(env, 'a', selected, { subscriptionTier: 'giving' }), null);
assert.equal((await loadParishPricingUsage(env, 'b', selected)).representedHouseholds, 0);
assert.equal((await loadParishPricingUsage({}, 'a', selected)).trackingAvailable, false);
db.exec('DROP TABLE directory_people');
assert.equal((await loadParishPricingUsage(env, 'a', selected)).trackingAvailable, false);
assert.equal(await validateParishCheckoutBand(env, 'a', selected), null);
db.close();

// Approval snapshots remain stable for ordering and invalidate on actual material changes.
const registration = {
  ...base,
  parishId: 'a',
  parishName: 'Public Name',
  taxLegalName: 'Legal Name',
  onboardingWorkflowVersion: 1,
  onboardingState: 'LIVE',
  givingStatus: 'active',
  treasurerEmail: 'TREASURER@example.test',
  funds: [
    {
      id: 'general',
      name: 'General Operating Fund',
      restrictionType: 'unrestricted',
      isDefault: true,
      accountingFundId: 'fund_general',
    },
  ],
};
assert.equal(validateGeneralOperatingFund(registration).passed, true);
const signed = {
  ...registration,
  treasurerSignoff: { status: 'signed', snapshotVersion: await onboardingMaterialVersion(registration) },
};
assert.equal(await invalidateOnboardingSignoffIfChanged(signed, signed), signed);
const renamed = await invalidateOnboardingSignoffIfChanged(signed, { ...signed, parishName: 'New Public Name' });
assert.equal(renamed.treasurerSignoff.status, 'signed');
assert.equal(renamed.treasurerSignoff.snapshotVersion, await onboardingMaterialVersion(renamed));
const changed = await invalidateOnboardingSignoffIfChanged(signed, { ...signed, taxLegalName: 'New Legal Name' });
assert.equal(changed.treasurerSignoff.status, 'invalidated');
assert.equal(changed.givingStatus, 'paused');
assert.equal(changed.onboardingState, 'CONFIGURING');
assert.equal(signed.givingStatus, 'active', 'input registration is not mutated');
assert.equal(
  await onboardingMaterialVersion(registration),
  await onboardingMaterialVersion(Object.fromEntries(Object.entries(registration).reverse()))
);
const checks = normalizeOnboardingChecks({
  givingConfiguration: { status: 'not_applicable' },
  importDecision: { status: 'not_applicable' },
});
assert.equal(checks.givingConfiguration.status, 'not_started');
assert.equal(checks.importDecision.status, 'not_applicable');
const access = {
  ...registration,
  onboardingAccess: { treasurer: { status: 'accepted', email: 'treasurer@example.test', membershipId: 'm1' } },
};
assert.equal(
  requiredPersonalAccessAccepted(access, { memberships: [{ id: 'm1', parishId: 'b', status: 'active' }] }),
  false
);
assert.equal(
  requiredPersonalAccessAccepted(access, { memberships: [{ id: 'm1', parishId: 'a', status: 'active' }] }),
  true
);

// Corrupt/missing KV records recover, hashes deduplicate, and dismissal only clears on new interest.
const values = new Map([['parish-feature-requests:a', '{invalid']]);
const kvEnv = {
  AGAPAY_REGISTRATIONS: {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  },
};
const request = { parishId: 'a', featureId: 'feature', donorEmail: 'ONE@example.test' };
assert.equal((await recordParishFeatureRequest(kvEnv, request)).request.count, 1);
assert.equal(await dismissParishFeatureRequest(kvEnv, 'a', 'feature'), true);
assert.equal(
  (await recordParishFeatureRequest(kvEnv, { ...request, donorEmail: ' one@example.test ' })).duplicate,
  true
);
assert.deepEqual(await loadPendingParishFeatureRequests(kvEnv, 'a'), []);
await recordParishFeatureRequest(kvEnv, { ...request, donorEmail: 'two@example.test' });
assert.equal((await loadPendingParishFeatureRequests(kvEnv, 'a'))[0].count, 2);
assert.deepEqual(await loadPendingParishFeatureRequests(kvEnv, 'b'), []);
assert.equal(await dismissParishFeatureRequest(kvEnv, 'b', 'feature'), false);
assert.doesNotMatch(values.get('parish-feature-requests:a'), /one@example|two@example/i);
console.log('Dashboard foundation TypeScript regressions passed.');
