import { buildAdminOverviewMetrics } from '../../src/lib/admin-overview-metrics.js';
import {
  relationshipSnapshot,
  retentionFromSnapshots,
  parishOccasions,
  localOccasionClock,
} from '../../src/lib/parish-relationships.js';
import { bookstoreReadinessChecklist, isBookstoreReadinessEnforced } from '../../src/lib/commerce-readiness.js';
import { subscriptionCheckoutReadinessGate, withTaxReadinessDefaults } from '../../src/lib/tax-readiness.js';
const totals: number = buildAdminOverviewMetrics([{ subscriptionStatus: 'active' }]).monthlyRecurringCents;
const snapshot = relationshipSnapshot([{ reference: 'parish', subscriptionMonthlyCents: 14900 }]);
const rate: number | null = retentionFromSnapshots(snapshot, {}).rate;
const ready: boolean = bookstoreReadinessChecklist({ stripeChargesEnabled: 'legacy-value' })[0].met;
const decision = subscriptionCheckoutReadinessGate({ status: 'verified' });
if (!decision.ok) {
  const code: 'not_verified' | 'billing_address_required' = decision.body.code;
  void code;
}
void [totals, rate, ready, withTaxReadinessDefaults({ billingLegalName: 123 })];
// @ts-expect-error Metrics require a collection of records.
buildAdminOverviewMetrics({});
// @ts-expect-error Stored dates must be strings for typed metrics callers.
buildAdminOverviewMetrics([{ receivedAt: 123 }]);
// @ts-expect-error Snapshots require stable registration references.
relationshipSnapshot([{ parishId: 'p' }]);
// @ts-expect-error Snapshot cents must be numeric.
retentionFromSnapshots({ a: { paid: true, cents: '14900' } }, {});
// @ts-expect-error Occasions require a date string.
parishOccasions({}, new Date());
// @ts-expect-error Local clocks accept a Date or numeric timestamp.
localOccasionClock('today');
// @ts-expect-error The rollout context must use a boolean.
isBookstoreReadinessEnforced({}, { isNewlyEnabling: 'true' });
if (decision.ok) {
  // @ts-expect-error Successful checkout decisions do not have an error body.
  void decision.body;
}
