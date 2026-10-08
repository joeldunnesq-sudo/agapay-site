import {
  subscriptionTier,
  subscriptionAddOnPricing,
  subscriptionEntitlementActive,
  type SubscriptionRegistration,
} from '../../src/lib/subscriptions.js';
import { hasModuleAccess, directoryEnabledFor } from '../../src/lib/entitlements.js';
import {
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  type OnboardingRegistration,
} from '../../src/lib/parish-onboarding.js';
import { loadParishPricingUsage } from '../../src/lib/parish-pricing-usage.js';
import { recordParishFeatureRequest, type FeatureRequestEnv } from '../../src/lib/parish-feature-requests.js';
const registration: OnboardingRegistration = {
  subscriptionStatus: 'trialing',
  subscriptionTrialEndsAt: null,
  funds: [{ id: 'general', isDefault: true }],
};
const allowed: boolean = hasModuleAccess(registration, 'accounting');
const ready: boolean = subscriptionEntitlementActive(registration);
const amount: number | null | undefined = subscriptionTier(registration).monthlyCents;
const pricing = subscriptionAddOnPricing('accounting');
const fee: number | undefined = pricing?.monthlyCents;
const workflow = buildParishOnboardingWorkflow(registration, {
  now: 0,
  memberships: [{ id: 'm1', parishId: 'a', status: 'active' }],
});
const usage = loadParishPricingUsage({}, 'a', registration);
void [allowed, ready, amount, fee, workflow, usage];
// @ts-expect-error Expiration is a stored date string, not a boolean.
const bad: SubscriptionRegistration = { subscriptionTrialEndsAt: true };
void bad;
// @ts-expect-error A module identifier must be a string.
hasModuleAccess(registration, 1);
// @ts-expect-error Directory settings must be an object.
directoryEnabledFor(registration, true);
// @ts-expect-error An add-on object must include its pricing/catalog contract.
subscriptionAddOnPricing({ id: 'accounting' });
// @ts-expect-error A typed onboarding caller must supply a fund collection.
buildParishOnboardingWorkflow({ funds: 'general' });
// @ts-expect-error Clock override must be numeric.
buildParishOnboardingWorkflow(registration, { now: 'today' });
// @ts-expect-error Signoffs are structured persisted objects.
invalidateOnboardingSignoffIfChanged({ treasurerSignoff: 'signed' }, registration);
// @ts-expect-error D1 binding must implement the database API.
loadParishPricingUsage({ AGAPAY_DB: 'database' }, 'a');
// @ts-expect-error KV must support get and put.
const badEnv: FeatureRequestEnv = { AGAPAY_REGISTRATIONS: {} };
void badEnv;
declare const env: FeatureRequestEnv;
// @ts-expect-error Feature requests require a donor identity.
recordParishFeatureRequest(env, { parishId: 'a', featureId: 'accounting' });
