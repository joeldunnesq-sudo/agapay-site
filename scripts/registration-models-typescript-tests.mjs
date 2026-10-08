import assert from 'node:assert/strict';
import { buildAdminOverviewMetrics } from '../src/lib/admin-overview-metrics.js';
import {
  relationshipSnapshot,
  retentionFromSnapshots,
  parishOccasions,
  parishAttention,
  defaultMilestonePreferences,
  localOccasionClock,
} from '../src/lib/parish-relationships.js';
import {
  isBookstoreReadinessEnforced,
  bookstoreReadinessChecklist,
  bookstoreReadinessSummary,
  bookstoreSellerDisclosure,
} from '../src/lib/commerce-readiness.js';
import {
  withTaxReadinessDefaults,
  hasCompleteBillingAddress,
  subscriptionCheckoutReadinessGate,
  TAX_READINESS_STATUSES,
} from '../src/lib/tax-readiness.js';
const now = new Date('2026-10-07T12:00:00Z');
const registrations = [
  {
    reference: 'a',
    subscriptionTier: 'giving',
    subscriptionStatus: 'active',
    subscriptionMonthlyCents: '123.6',
    receivedAt: '2026-10-05T00:00:00Z',
  },
  { reference: 'b', subscriptionTier: 'mission', subscriptionStatus: 'active', subscriptionMonthlyCents: -1 },
  {
    reference: 'c',
    subscriptionTier: 'retired',
    subscriptionStatus: 'active',
    subscriptionMonthlyCents: 'not-a-price',
  },
  { reference: 'd', subscriptionStatus: 'canceled', subscriptionUpdatedAt: now.toISOString() },
  {
    reference: 'e',
    subscriptionStatus: 'cancelled',
    subscriptionStatusHistory: [{ status: 'CANCELED', at: '2026-10-06T00:00:00Z' }],
    subscriptionCancelledAt: '2026-10-06T00:00:00Z',
  },
  { reference: 'f', subscriptionStatus: 'active', subscriptionMonthlyCents: 0, receivedAt: '2026-10-08T00:00:00Z' },
];
const original = structuredClone(registrations);
const metrics = buildAdminOverviewMetrics(registrations, now, 100);
assert.equal(metrics.complete, false);
assert.equal(metrics.totalRegistered, 100);
assert.equal(metrics.weekStart, '2026-10-05T00:00:00.000Z');
assert.equal(metrics.newRegistrations, 1);
assert.equal(metrics.cancellations, 1);
assert.equal(metrics.undatedCancellations, 1);
assert.equal(metrics.unknownPriceSubscriptions, 2);
assert.equal(metrics.activePaidSubscriptions, 1);
assert.equal(metrics.monthlyRecurringCents, 124);
assert.equal(metrics.annualRecurringCents, 1488);
assert.deepEqual(registrations, original);
const snapshot = relationshipSnapshot(registrations);
assert.deepEqual(snapshot.a, { paid: true, cents: 124 });
assert.deepEqual(snapshot.b, { paid: false, cents: 0 });
assert.equal(retentionFromSnapshots(snapshot, snapshot).rate, 100);
assert.equal(retentionFromSnapshots({}, snapshot).rate, null);
assert.equal(retentionFromSnapshots(snapshot, {}).lost, 1);
assert.equal(retentionFromSnapshots(snapshot, {}).revenueRate, 0);
assert.deepEqual(defaultMilestonePreferences({ priestEmail: 'p@example.test' }), {
  anniversary: false,
  feast: false,
  recipient: 'p@example.test',
  feastRecipient: 'p@example.test',
  timeZone: 'America/Chicago',
});
assert.equal(
  parishAttention({ subscriptionStatus: 'past_due', subscriptionCancelAtPeriodEnd: true }).label,
  'Billing needs attention'
);
assert.equal(
  parishAttention({ subscriptionCancelAtPeriodEnd: true, subscriptionStatus: 'canceled' }).label,
  'Cancellation scheduled'
);
assert.equal(parishAttention({ subscriptionStatus: 'canceled' }).label, 'Subscription ended');
assert.equal(parishAttention({ status: 'pending' }).label, 'Complete parish verification');
assert.equal(parishAttention({ status: 'verified' }).label, 'Finish payment setup');
assert.equal(
  parishAttention({ status: 'verified', stripeAccountId: 'acct', stripeAccountStatus: 'payouts_enabled' }),
  null
);
assert.equal(localOccasionClock(new Date('2026-03-08T08:00:00Z')).hour, 3);
assert.equal(localOccasionClock(new Date('2026-11-01T07:00:00Z')).hour, 1);
assert.equal(
  parishOccasions(
    { receivedAt: '2024-02-29', patronalFeastDate: '02-30', patronalFeastName: 'Invalid' },
    '2025-01-01',
    0
  )[0].date,
  '2025-02-28'
);
assert.equal(parishOccasions({ receivedAt: '2024-02-29' }, '2028-01-01', 0)[0].date, '2028-02-29');
assert.deepEqual(parishOccasions({ receivedAt: 'invalid' }, '2026-01-01'), []);
for (const enabled of [undefined, false, 'false', ' true ', 1])
  assert.equal(
    isBookstoreReadinessEnforced({
      PARISH_COMMERCE_READINESS_ENABLED: enabled,
      PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL: true,
    }),
    false
  );
assert.equal(
  isBookstoreReadinessEnforced(
    { PARISH_COMMERCE_READINESS_ENABLED: 'TRUE', PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW: true },
    { isNewlyEnabling: true }
  ),
  true
);
assert.equal(
  isBookstoreReadinessEnforced({
    PARISH_COMMERCE_READINESS_ENABLED: true,
    PARISH_COMMERCE_READINESS_ENFORCED_FOR_NEW: true,
  }),
  false
);
assert.equal(
  isBookstoreReadinessEnforced({
    PARISH_COMMERCE_READINESS_ENABLED: true,
    PARISH_COMMERCE_READINESS_ENFORCED_FOR_ALL: 'true',
  }),
  true
);
const ready = {
  stripeAccountId: 'acct',
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  parishName: 'Test',
  commerceSupportEmail: 'test@example.test',
  commerceRefundPolicyText: 'Refunds',
  commerceFulfillmentPolicyText: 'Pickup',
  commerceTaxResponsibilityAcknowledged: true,
  commerceMerchantOfRecordAcknowledged: true,
  commerceTermsAcceptedAt: '2026-01-01',
};
assert.equal(bookstoreReadinessSummary(ready).ready, true);
assert.equal(bookstoreReadinessSummary({}).unmetCount, 11);
assert.equal(
  bookstoreReadinessChecklist({ ...ready, stripeChargesEnabled: 'false' })[1].met,
  true,
  'preserve existing truthiness'
);
assert.match(bookstoreSellerDisclosure('  Test  '), /^Sold by Test\./);
assert.match(bookstoreSellerDisclosure(null), /^Sold by this parish\./);
const billing = {
  status: 'verified',
  parishName: 'Church',
  addressLine1: '123 Main',
  city: 'City',
  state: 'TX',
  postalCode: '12345',
  taxReadinessStatus: 'tax_blocked',
  custom: { keep: true },
};
const before = structuredClone(billing);
assert.equal(hasCompleteBillingAddress(billing), true);
assert.equal(withTaxReadinessDefaults(billing).billingCountry, 'US');
assert.deepEqual(subscriptionCheckoutReadinessGate(billing), { ok: true });
assert.deepEqual(billing, before);
assert.equal(withTaxReadinessDefaults({ ...billing, billingLegalName: 'Explicit' }).billingLegalName, 'Explicit');
assert.equal(
  withTaxReadinessDefaults({ ...billing, billingLegalName: '  ', taxLegalName: 'Tax name' }).billingLegalName,
  'Tax name'
);
assert.equal(
  withTaxReadinessDefaults({ ...billing, billingLegalName: 123 }).billingLegalName,
  123,
  'legacy values are not coerced by defaults'
);
assert.equal(withTaxReadinessDefaults({ taxReadinessStatus: 'invalid' }).taxReadinessStatus, 'tax_needs_review');
for (const status of TAX_READINESS_STATUSES)
  assert.equal(withTaxReadinessDefaults({ taxReadinessStatus: status }).taxReadinessStatus, status);
assert.equal(subscriptionCheckoutReadinessGate({}).status, 403);
assert.equal(subscriptionCheckoutReadinessGate({ status: 'verified' }).status, 422);
assert.equal(hasCompleteBillingAddress({ ...billing, addressLine1: '' }), false);
console.log(
  'PASS - reporting totals, relationship snapshots, attention precedence, DST/leap occasions, staged commerce flags, legacy billing defaults and checkout decisions'
);
