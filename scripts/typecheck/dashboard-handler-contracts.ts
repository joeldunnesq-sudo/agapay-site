import {
  handleParishDashboard,
  handleParishFeatureRequestDismiss,
  parishDashboardPayload,
  givingCatalogChanged,
  normalizeSacramentPriests,
  summarizeCharges,
  type DashboardEnv,
  type DashboardRegistration,
} from '../../src/handlers/parish-dashboard-handler.js';
import {
  recordParishGivingSetupReview,
  invalidateOnboardingSignoffIfChanged,
} from '../../src/lib/parish-onboarding.js';
import { findRegistrationByParishId } from '../../src/handlers/parish.js';
declare const env: DashboardEnv;
const request = new Request('https://example.test');
const registration: DashboardRegistration = {
  parishId: 'a',
  subscriptionTier: 'giving',
  campaigns: [{ id: 'a', name: 'Campaign' }],
  sacramentPriests: [{ name: 'Priest', serviceTypes: ['wedding'] }],
};
const response: Promise<Response> = handleParishDashboard(request, env, 'a');
const dismiss: Promise<Response> = handleParishFeatureRequestDismiss(request, env, 'a', 'giving-plus');
const cents: number | null = parishDashboardPayload('a', registration).subscriptionMonthlyCents;
const gifts: number = summarizeCharges([]).giftCount;
const changed: boolean = givingCatalogChanged({ campaigns: [] }, registration);
const priests = normalizeSacramentPriests(registration);
const lookup = findRegistrationByParishId<DashboardRegistration>(env, 'a');
const reviewed = recordParishGivingSetupReview({ ...registration, correlationId: 'test' });
const correlation: string = reviewed.correlationId;
const refreshed: DashboardRegistration = reviewed;
async function preservedRegistrationFields() {
  const updated = await invalidateOnboardingSignoffIfChanged(registration, { ...registration, correlationId: 'test' });
  const field: string = updated.correlationId;
  const preserved: DashboardRegistration = updated;
  return { field, preserved };
}
void [response, dismiss, cents, gifts, changed, priests, lookup, correlation, refreshed, preservedRegistrationFields];
// @ts-expect-error Handler callers must supply an actual Request.
handleParishDashboard({}, env, 'a');
// @ts-expect-error IDs must be strings.
handleParishFeatureRequestDismiss(request, env, 'a', 42);
// @ts-expect-error The stored campaign contract must be a collection.
parishDashboardPayload('a', { campaigns: 'campaign' });
// @ts-expect-error The stored Stripe readiness status is a string.
parishDashboardPayload('a', { stripeAccountStatus: true });
// @ts-expect-error Priest entries must have an object shape.
normalizeSacramentPriests({ sacramentPriests: [42] });
// @ts-expect-error Catalog comparison accepts collections, not a scalar fund ID.
givingCatalogChanged({ funds: 'general' }, registration);
// @ts-expect-error Charge summaries consume a collection.
summarizeCharges({ amount: 100 });
