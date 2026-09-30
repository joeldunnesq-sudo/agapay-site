import assert from 'node:assert/strict';
import { buildAdminOverviewMetrics } from '../src/lib/admin-overview-metrics.js';
import { processStripeWebhookEvent } from '../src/handlers/stripe.js';
import worker from '../src/worker.js';
import { createPasswordRecord } from '../src/lib/core.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';

const now = new Date('2026-09-30T12:00:00Z');
const rows = [
  { receivedAt: '2026-09-28T00:00:00Z', subscriptionStatus: 'active', subscriptionMonthlyCents: 7900 },
  { receivedAt: '2026-09-27T23:59:59Z', subscriptionStatus: 'trialing', subscriptionMonthlyCents: 14900 },
  { receivedAt: '2026-10-01T00:00:00Z', subscriptionStatus: 'free_forever', subscriptionMonthlyCents: 9900 },
  { receivedAt: '2026-09-29T12:00:00Z', subscriptionStatus: 'cancelled', subscriptionCancelledAt: '2026-09-29T13:00:00Z', subscriptionStatusHistory: [{ status: 'cancelled', at: '2026-09-29T13:00:00Z' }] },
  { subscriptionStatus: 'canceled', subscriptionUpdatedAt: now.toISOString() },
  { subscriptionStatus: 'active', subscriptionTier: 'giving', subscriptionAddOns: ['sacraments'] },
  { subscriptionStatus: 'active', subscriptionTier: 'diocese' },
  { subscriptionStatus: 'past_due', subscriptionMonthlyCents: 10000 },
  { subscriptionStatus: 'active', subscriptionMonthlyCents: 0 },
];
const result = buildAdminOverviewMetrics(rows, now);
assert.equal(result.weekStart, '2026-09-28T00:00:00.000Z');
assert.equal(result.newRegistrations, 2, 'Monday inclusive; previous Sunday and future dates excluded');
assert.equal(result.cancellations, 1, 'Count each parish once even with a timestamp and a history entry');
assert.equal(result.undatedCancellations, 1, 'Never use a generic edit timestamp as a cancellation date');
assert.equal(result.monthlyRecurringCents, 16700, 'Exclude trials, free, canceled, past-due and unknown custom prices; include add-ons');
assert.equal(result.annualRecurringCents, 200400);
assert.equal(result.activePaidSubscriptions, 2);
assert.equal(result.unknownPriceSubscriptions, 1);
assert.equal(buildAdminOverviewMetrics([], now).monthlyRecurringCents, 0);
assert.equal(buildAdminOverviewMetrics(rows, now, 10001).complete, false, 'Do not present a capped registration scan as complete');
assert.equal(buildAdminOverviewMetrics([], new Date('2027-01-01T12:00:00Z')).weekStart, '2026-12-28T00:00:00.000Z');
assert.equal(buildAdminOverviewMetrics([{ subscriptionStatus: 'active', subscriptionStatusHistory: [{ status: 'cancelled', at: '2026-09-29T00:00:00Z' }] }], now).cancellations, 1, 'Reactivation must not erase a recorded cancellation');
console.log('PASS - Parish weekly metrics, revenue exclusions, unknown dates and prices, and year boundaries');

const store = new Map();
const env = {
  AGAPAY_TEST_MODE: '1', AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  AGAPAY_REGISTRATIONS: {
    get: async key => store.get(key) ?? null,
    put: async (key, value) => store.set(key, String(value)),
    delete: async key => store.delete(key),
    list: async ({ prefix = '' } = {}) => ({ keys: [...store.keys()].filter(name => name.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
  },
};
store.set('AGP-METRIC-TEST', JSON.stringify({ reference: 'AGP-METRIC-TEST', receivedAt: new Date().toISOString(), subscriptionStatus: 'active', subscriptionMonthlyCents: 7900 }));
const event = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_metric_test', status: 'canceled', canceled_at: 1790686800, metadata: { agapay_reference: 'AGP-METRIC-TEST' } } } };
await processStripeWebhookEvent(env, event);
await processStripeWebhookEvent(env, event);
const stored = JSON.parse(store.get('AGP-METRIC-TEST'));
assert.equal(stored.subscriptionCancelledAt, new Date(1790686800 * 1000).toISOString(), 'Stripe cancellation time survives retries');
assert.equal(buildAdminOverviewMetrics([stored], now).cancellations, 1);

const password = 'test-only-metrics-password';
store.set('__agapay_admin_password', JSON.stringify(await createPasswordRecord(password)));
const request = (path, options = {}) => new Request(`https://agapay.test${path}`, options);
const unauthorized = await worker.fetch(request('/api/admin/platform-summary'), env);
assert.equal(unauthorized.status, 401);
const login = await worker.fetch(request('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, actor: 'Metrics Test' }) }), env);
assert.equal(login.status, 200);
const session = await login.json();
const response = await worker.fetch(request('/api/admin/platform-summary', { headers: { Authorization: `Bearer ${session.token}` } }), env);
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.summary.overviewMetrics.newRegistrations, 1);
assert.equal(payload.summary.overviewMetrics.complete, true);
assert.equal(payload.summary.overviewMetrics.monthlyRecurringCents, 0);
console.log('PASS - Authenticated summary API and replay-safe Stripe cancellation timestamp');
