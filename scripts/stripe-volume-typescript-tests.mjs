import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  stripeChargeVolumeRecord,
  upsertStripeChargeVolumeRecord,
  refreshStripeVolume,
  summarizeStoredStripeVolume,
  summarizeStripeVolumeRows,
  startOfCurrentYearIso,
  classifyStripeCharge,
  STRIPE_PAYMENT_CLASSES,
} from '../src/lib/stripe-volume.js';
import * as classification from '../src/lib/payment-classification.js';
assert.equal(classifyStripeCharge, classification.classifyStripeCharge);
assert.equal(STRIPE_PAYMENT_CLASSES, classification.STRIPE_PAYMENT_CLASSES);
assert.equal(startOfCurrentYearIso(new Date('2025-12-31T23:59:59Z')), '2025-01-01T00:00:00.000Z');
assert.equal(startOfCurrentYearIso(new Date('2026-01-01T00:00:00Z')), '2026-01-01T00:00:00.000Z');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('migrations/0041_stripe_nonprofit_volume_tracking.sql', 'utf8'));
let batches = 0;
let failBatch = false;
const binding = {
  prepare(sql) {
    const make = (params) => ({
      bind: (...values) => make(values),
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => {
        const result = db.prepare(sql).run(...params);
        return { meta: { changes: result.changes } };
      },
    });
    return make([]);
  },
  async batch(statements) {
    batches += 1;
    db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
        if (failBatch) throw new Error('Synthetic atomic batch failure');
      }
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const env = { AGAPAY_DB: binding, STRIPE_SECRET_KEY: 'synthetic-test-key' };
const created = Math.floor(Date.now() / 1000);
const gift = (id, overrides = {}) => ({
  id,
  created,
  amount: 10000,
  paid: true,
  status: 'succeeded',
  metadata: { agapay_payment_class: 'qualifying_donation' },
  ...overrides,
});
const requests = [];
let replies = [];
const savedFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).origin, 'https://api.stripe.com');
  assert.equal(new URL(url).pathname, '/v1/charges');
  assert.equal(options.headers.Authorization, 'Bearer synthetic-test-key');
  assert.equal(options.headers['Stripe-Account'], 'acct_a');
  requests.push(new URL(url));
  assert.ok(replies.length, 'Unexpected Stripe read');
  const next = replies.shift();
  if (next instanceof Error) throw next;
  return Response.json(next.body || next, { status: next.status || 200 });
};
try {
  const original = gift('ch_one', { amount: '105.6', amount_refunded: '999', currency: 'USD' });
  const before = structuredClone(original);
  const record = stripeChargeVolumeRecord('parish-a', 'acct_a', original);
  assert.equal(record.grossCents, 106);
  assert.equal(record.refundedCents, 106);
  assert.equal(record.netCents, 0);
  assert.deepEqual(original, before);
  assert.equal(stripeChargeVolumeRecord('p', 'a', { amount: -1, paid: false }).chargeStatus, 'failed');
  assert.equal(stripeChargeVolumeRecord('p', 'a', { amount: Infinity }).grossCents, 0);
  assert.equal(await upsertStripeChargeVolumeRecord(env, '', 'acct_a', gift('ch_skip')), null);
  assert.equal(await upsertStripeChargeVolumeRecord(env, 'parish-a', 'acct_a', null), null);
  assert.equal(await upsertStripeChargeVolumeRecord({}, 'parish-a', 'acct_a', gift('ch_skip')), null);
  await upsertStripeChargeVolumeRecord(env, 'parish-a', 'acct_a', gift('ch_one'));
  await upsertStripeChargeVolumeRecord(env, 'parish-a', 'acct_a', gift('ch_one', { amount_refunded: 2500 }));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stripe_payment_volume_records').get().n, 1);
  assert.equal(db.prepare('SELECT net_cents FROM stripe_payment_volume_records').get().net_cents, 7500);
  await upsertStripeChargeVolumeRecord(env, 'parish-b', 'acct_b', gift('ch_other'));
  await upsertStripeChargeVolumeRecord(env, 'parish-a', 'acct_a', gift('ch_failed', { status: 'failed' }));
  await upsertStripeChargeVolumeRecord(env, 'parish-a', 'acct_a', gift('ch_old', { created: 1 }));
  let summary = await summarizeStoredStripeVolume(env, 'parish-a');
  assert.equal(summary.totalPaymentCount, 1);
  assert.equal(summary.totalNetCents, 7500);
  assert.equal(summary.meetsVolumeThreshold, false);
  replies = [
    {
      data: [
        gift('ch_two'),
        gift('ch_three', { metadata: { agapay_payment_class: 'nonqualifying_commerce' }, amount: 2500 }),
      ],
      has_more: true,
    },
  ];
  const first = await refreshStripeVolume(env, 'parish-a', 'acct_a', { maxPages: 1 });
  assert.equal(first.status, 'in_progress');
  assert.equal(first.scannedCount, 2);
  assert.equal(requests.at(-1).searchParams.get('starting_after'), null);
  assert.equal(requests.at(-1).searchParams.get('limit'), '100');
  assert.deepEqual(requests.at(-1).searchParams.getAll('expand[]'), ['data.payment_intent', 'data.invoice']);
  assert.equal(
    Number(requests.at(-1).searchParams.get('created[gte]')),
    new Date(startOfCurrentYearIso()).getTime() / 1000
  );
  replies = [{ data: [gift('ch_four')], has_more: false }];
  const resumed = await refreshStripeVolume(env, 'parish-a', 'acct_a');
  assert.equal(requests.at(-1).searchParams.get('starting_after'), 'ch_three');
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.scannedCount, 3);
  assert.ok(resumed.lastCompletedAt);
  assert.equal(batches, 2);
  summary = await summarizeStoredStripeVolume(env, 'parish-a');
  assert.equal(summary.totalPaymentCount, 4);
  assert.equal(summary.totalNetCents, 30000);
  assert.equal(summary.donationNetCents, 27500);
  assert.equal(summary.nonDonationNetCents, 2500);
  assert.equal(summary.meetsVolumeThreshold, true);
  replies = [{ body: { error: { message: 'Synthetic Stripe failure' } }, status: 503 }];
  await assert.rejects(refreshStripeVolume(env, 'parish-a', 'acct_a'), /Synthetic Stripe failure/);
  const failed = db.prepare('SELECT * FROM stripe_payment_volume_scans WHERE parish_id=?').get('parish-a');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.last_completed_at, resumed.lastCompletedAt);
  summary = await summarizeStoredStripeVolume(env, 'parish-a');
  assert.equal(summary.scan.complete, true, 'Historical completed scan remains available after refresh failure');
  assert.equal(summary.scan.error, 'Synthetic Stripe failure');
  assert.equal(requests.at(-1).searchParams.get('starting_after'), null, 'A fresh pass starts from the beginning');
  failBatch = true;
  replies = [{ data: [gift('ch_atomic_one'), gift('ch_atomic_two')], has_more: false }];
  await assert.rejects(refreshStripeVolume(env, 'parish-a', 'acct_a'), /atomic batch failure/);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM stripe_payment_volume_records WHERE stripe_charge_id LIKE 'ch_atomic_%'")
      .get().n,
    0
  );
  failBatch = false;
  replies = [{ data: [], has_more: true }];
  assert.equal(
    (await refreshStripeVolume(env, 'parish-a', 'acct_a')).status,
    'complete',
    'Empty page cannot leave an unresumable cursor'
  );
  const noStore = await summarizeStoredStripeVolume({}, 'parish-a');
  assert.equal(noStore.totalPaymentCount, 0);
  assert.equal(noStore.scan.status, 'not_started');
  assert.equal(replies.length, 0);
  assert.equal((await summarizeStoredStripeVolume(env, 'parish-b')).totalPaymentCount, 1);
  const rows = [
    { payment_class: 'qualifying_donation', net_cents: '800', payment_count: '8' },
    { payment_class: 'unknown-future-class', net_cents: '200', payment_count: 2 },
  ];
  assert.equal(summarizeStripeVolumeRows(rows, { status: 'complete' }).donationPercent, 80);
  assert.equal(summarizeStripeVolumeRows(rows, { status: 'complete' }).unclassifiedNetCents, 200);
  assert.equal(summarizeStripeVolumeRows(rows, { status: 'in_progress' }).meetsVolumeThreshold, false);
  assert.equal(summarizeStripeVolumeRows(null).totalPaymentCount, 0);
} finally {
  globalThis.fetch = savedFetch;
  db.close();
}
console.log(
  'PASS - Stripe volume SQLite upserts, parish isolation, fee/refund totals, bounded pages, scan resume/restart, failure persistence and atomic rollback'
);
import * as connect from '../src/lib/stripe-connect.js';
const requestCalls = [];
let transportReplies = [];
const oldFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).origin, 'https://api.stripe.com');
  requestCalls.push({ url: new URL(url), options });
  assert.ok(transportReplies.length, 'Unexpected Stripe transport call');
  const reply = transportReplies.shift();
  return Response.json(reply.body || reply, { status: reply.status || 200 });
};
try {
  for (const call of [
    () => connect.stripeGetRequest({}, '/v1/test'),
    () => connect.stripeGetConnectedRequest({}, '/v1/test', 'acct_a'),
    () => connect.stripeFormRequest({}, '/v1/test', 'amount=100'),
    () => connect.stripeFormConnectedRequest({}, '/v1/test', 'amount=100', 'acct_a'),
  ]) {
    const result = await call();
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  }
  assert.equal(requestCalls.length, 0);
  const requestEnv = { STRIPE_SECRET_KEY: 'synthetic-test-key' };
  transportReplies = [{ id: 'test' }];
  await connect.stripeFormRequest(requestEnv, '/v1/test', 'amount=100', 'PUT');
  assert.equal(requestCalls.at(-1).options.method, 'PUT');
  assert.equal(requestCalls.at(-1).options.body, 'amount=100');
  assert.equal(requestCalls.at(-1).options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(requestCalls.at(-1).options.headers.Authorization, 'Bearer synthetic-test-key');
  transportReplies = [{ id: 'test' }];
  await connect.stripeFormConnectedRequest(requestEnv, '/v1/test', 'amount=100', 'acct_a');
  assert.equal(requestCalls.at(-1).options.method, 'POST');
  assert.equal(requestCalls.at(-1).options.headers['Stripe-Account'], 'acct_a');
  transportReplies = [{ id: 'test' }];
  await connect.stripeFormConnectedRequest(requestEnv, '/v1/test', 'amount=100', '');
  assert.equal(Object.hasOwn(requestCalls.at(-1).options.headers, 'Stripe-Account'), false);
  transportReplies = [{ body: { error: { message: 'Synthetic rejection' } }, status: 400 }];
  const rejected = await connect.stripeGetRequest(requestEnv, '/v1/test');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.message, 'Synthetic rejection');
  transportReplies = Array.from({ length: 5 }, (_, index) => ({ data: [gift(`page_${index}`)], has_more: true }));
  const start = requestCalls.length;
  const listed = await connect.listYtdStripeCharges(requestEnv, 'acct_a');
  assert.equal(listed.ok, true);
  assert.equal(listed.body.data.length, 5);
  assert.equal(requestCalls.length - start, 5, 'Legacy list remains bounded to five pages');
  assert.equal(requestCalls[start].url.searchParams.get('starting_after'), null);
  assert.equal(requestCalls[start + 4].url.searchParams.get('starting_after'), 'page_3');
  assert.deepEqual(requestCalls[start].url.searchParams.getAll('expand[]'), ['data.balance_transaction']);
  transportReplies = [{ body: { error: { message: 'Read failed' } }, status: 503 }];
  assert.equal((await connect.listYtdStripeCharges(requestEnv, 'acct_a')).status, 503);
  transportReplies = [{ data: [], has_more: true }];
  assert.equal((await connect.listYtdStripeCharges(requestEnv, 'acct_a')).body.data.length, 0);
} finally {
  globalThis.fetch = oldFetch;
}
assert.equal(connect.stripeAccountStatus({ payouts_enabled: true, charges_enabled: true }), 'payouts_enabled');
assert.equal(
  connect.stripeAccountStatus({ charges_enabled: true, requirements: { disabled_reason: 'x' } }),
  'charges_enabled'
);
assert.equal(connect.stripeAccountStatus({ requirements: { disabled_reason: 'x' } }), 'restricted');
assert.equal(connect.stripeAccountStatus({ details_submitted: true }), 'onboarding');
assert.equal(connect.stripeAccountStatus(), 'invited');
assert.equal(connect.stripeReady(), false);
assert.equal(connect.stripeReady({ stripeAccountStatus: 'charges_enabled' }), true);
assert.equal(connect.normalizedCheckoutPaymentStatus({ status: 'expired' }), 'unpaid');
assert.equal(connect.normalizedCheckoutPaymentStatus({ status: 'expired', payment_status: 'paid' }), 'paid');
assert.equal(connect.normalizedCheckoutPaymentStatus({}, 'processing'), 'processing');
for (const value of ['true', '1', 'YES', ' On ', true]) assert.equal(connect.booleanFromStripeMetadata(value), true);
for (const value of ['false', '0', 'NO', ' off ', false])
  assert.equal(connect.booleanFromStripeMetadata(value, true), false);
assert.equal(connect.booleanFromStripeMetadata('unknown', true), true);
assert.equal(connect.stripeObjectId({ id: 'pi_a' }), 'pi_a');
assert.equal(connect.stripeObjectId(null), '');
assert.equal(connect.checkoutPaymentIntentId({ payment_intent: { id: 'pi_b' } }), 'pi_b');
const currentYear = new Date().getUTCFullYear();
const currentCreated = Date.UTC(currentYear, 0, 15) / 1000;
const charges = [
  gift('a', { created: currentCreated, receipt_email: 'DONOR@EXAMPLE.TEST' }),
  gift('b', {
    created: currentCreated,
    amount: 10081,
    receipt_email: 'donor@example.test',
    metadata: {
      agapay_payment_class: 'qualifying_donation',
      amount_cents: '10000',
      cover_fees: 'true',
      payment_method: 'ach',
    },
  }),
  gift('c', {
    created: currentCreated,
    receipt_email: 'other@example.test',
    application_fee_amount: 20,
    balance_transaction: { fee: 300, net: 9700 },
  }),
  gift('commerce', { created: currentCreated, metadata: { commerce_module: 'bookstore' } }),
  gift('failed', { created: currentCreated, status: 'failed' }),
  gift('old', { created: Date.UTC(currentYear - 1, 0, 1) / 1000 }),
  gift('refunded', { created: currentCreated, amount_refunded: 10000 }),
];
const beforeSummary = structuredClone(charges);
const summarized = connect.summarizeCharges(charges);
assert.equal(summarized.ytdCents, 29380);
assert.equal(summarized.grossGiftCents, 30000);
assert.equal(summarized.donorCoveredFeeCents, 81);
assert.equal(summarized.feesAbsorbedCents, 620);
assert.equal(summarized.giftCount, 3);
assert.equal(summarized.giverCount, 2);
assert.equal(summarized.monthly[0].amountCents, 29380);
assert.equal(summarized.monthly[0].agapayFeeCents, 20);
assert.equal(
  summarized.monthly.reduce((sum, m) => sum + m.amountCents, 0),
  summarized.ytdCents
);
assert.deepEqual(charges, beforeSummary);
console.log(
  'PASS - Stripe transport contracts, connected-account headers, pagination limits, status helpers and donor fee summaries'
);
