import assert from 'node:assert/strict';
import * as health from '../src/lib/recurring-health.js';
import * as legacy from '../src/handlers/parish-giving-read-models.js';
import { paidOfferingStatus } from '../src/lib/paid-offering-status.js';
import { paidOfferingStatus as legacyPaid } from '../src/handlers/parish-donor-offerings.js';
import { normalizeEmail } from '../src/lib/normalize-email.js';
import { normalizeEmail as legacyEmail } from '../src/lib/core.js';
assert.equal(paidOfferingStatus, legacyPaid);
assert.equal(normalizeEmail, legacyEmail);
for (const [name, fn] of Object.entries(health)) assert.equal(legacy[name], fn, name);
assert.equal(normalizeEmail(' A@Example.test '), 'a@example.test');
assert.equal(normalizeEmail(null), '');
assert.equal(normalizeEmail(42), '42');
for (const status of ['paid', 'complete', 'completed'])
  assert.equal(paidOfferingStatus({ status: status.toUpperCase() }), true);
assert.equal(paidOfferingStatus({ paymentStatus: 'SUCCEEDED' }), true);
assert.equal(paidOfferingStatus({ status: 'succeeded' }), false);
assert.equal(paidOfferingStatus({ recordType: 'subscription_setup', status: 'paid' }), false);
assert.equal(health.recurringOfferingStatus({ status: 'cancelled', paymentStatus: 'failed' }), 'failed');
assert.equal(health.recurringOfferingStatus({ status: 'paid', paymentStatus: 'canceled' }), 'cancelled');
assert.equal(health.recurringOfferingStatus({ status: 'complete' }), 'active');
assert.equal(health.recurringOfferingStatus({ recordType: 'subscription_setup', status: 'paid' }), 'pending');
assert.deepEqual(
  ['weekly', 'biweekly', 'quarterly', 'yearly', 'annual', 'MONTHLY', ''].map(health.recurringExpectedDays),
  [10, 24, 110, 400, 400, 45, 45]
);
assert.equal(
  health.recurringHealthGroupKey({ donorEmail: ' A@B.test ', frequency: 'monthly', amountCents: 100 }),
  'a@b.test|monthly|100|||'
);
const opaqueKey = {};
assert.equal(
  health.recurringHealthGroupKey({ stripeSubscriptionId: opaqueKey, stripe_subscription_id: 'ignored' }),
  opaqueKey
);
assert.equal(health.recurringHealthGroupKey({ stripe_subscription_id: 'alias' }), 'alias');
const RealDate = Date;
const fixed = Date.parse('2026-09-20T12:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [fixed]));
  }
  static now() {
    return fixed;
  }
};
try {
  const ago = (days) => new Date(fixed - days * 86400000).toISOString();
  const paid = (key, days, extra = {}) => ({
    stripeSubscriptionId: key,
    status: 'paid',
    createdAt: ago(days),
    frequency: 'weekly',
    amountCents: 100,
    ...extra,
  });
  const rows = Object.freeze(
    [
      paid('boundary', 10),
      paid('lapsed', 11),
      { stripeSubscriptionId: 'failed', status: 'failed', failedAt: ago(1), amountCents: 200 },
      { stripeSubscriptionId: 'recovered', status: 'failed', failedAt: ago(2), donorName: 'First metadata' },
      paid('recovered', 1, { amountCents: 300, donorName: 'Later metadata', donorEmail: 'later@example.test' }),
      { stripeSubscriptionId: 'pending', status: 'pending' },
      { stripeSubscriptionId: 'cancelled', status: 'cancelled', updatedAt: ago(1) },
      { stripeSubscriptionId: 'old-failure', status: 'failed', failedAt: '2026-08-31T00:00:00Z' },
    ].map(Object.freeze)
  );
  const before = structuredClone(rows);
  const result = health.summarizeParishRecurringHealth(rows);
  assert.equal(result.activeCount, 2);
  assert.equal(result.failedThisMonthCount, 2);
  assert.equal(result.lapsedCount, 3);
  assert.equal(result.monthlyRecurringCents, 400);
  assert.equal(result.generatedAt, '2026-09-20T12:00:00.000Z');
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ['failed', 'failed', 'lapsed', 'lapsed', 'lapsed', 'active', 'active']
  );
  const byKey = new Map(result.rows.map((r) => [r.key, r]));
  assert.equal(byKey.get('boundary').daysSincePaid, 10);
  assert.equal(byKey.get('lapsed').daysSincePaid, 11);
  assert.equal(byKey.get('pending').daysSincePaid, null);
  assert.equal(byKey.get('recovered').donorName, 'First metadata');
  assert.equal(byKey.get('recovered').donorEmail, 'later@example.test');
  assert.equal(byKey.get('cancelled').failureMessage, 'Recurring gift cancelled.');
  assert.deepEqual(rows, before);
  assert.throws(() => health.summarizeParishRecurringHealth([paid('bad', 0, { createdAt: 'bad' })]), RangeError);
  assert.equal(health.summarizeParishRecurringHealth([{ status: 'pending', createdAt: 'bad' }]).lapsedCount, 1);
  assert.equal(health.summarizeParishRecurringHealth([paid('priority', 0, { completedAt: ago(11) })]).lapsedCount, 1);
  const tie = health.summarizeParishRecurringHealth([
    paid('same', 1),
    { stripeSubscriptionId: 'same', status: 'failed', failedAt: ago(1) },
  ]);
  assert.equal(tie.failedThisMonthCount, 1);
  assert.equal(health.summarizeParishRecurringHealth().rows.length, 0);
} finally {
  globalThis.Date = RealDate;
}
console.log(
  'PASS - recurring health status precedence, grouping, UTC failure/recovery, lapse thresholds and compatibility contracts'
);
