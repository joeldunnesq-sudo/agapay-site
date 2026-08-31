import assert from 'node:assert/strict';
import { fundAllocation, fundReportPeriod, loadFundGiftActivity } from '../src/lib/fund-reporting.js';
import { givingFeatureAccess } from '../src/lib/entitlements.js';
import { createFundReconciliationFixture } from './lib/fund-reconciliation-fixture.mjs';

let passed = 0;
async function scenario(name, run) {
  const f = await createFundReconciliationFixture({ month: '2026-07' });
  f.installStripeMock();
  try {
    await run(f);
    console.log('PASS - ' + name);
    passed++;
  } finally {
    f.dispose();
  }
}
const report = async (f) => {
  const response = await f.report();
  assert.equal(response.status, 200);
  return response.json();
};
const closeBody = (f, r) => ({
  month: f.month,
  closed: true,
  bankConfirmed: true,
  bankStatementCents: r.summary.depositedCents,
  fingerprint: r.fingerprint,
});

await scenario('all-tier access, real SQL, actual signed fees/refunds and stable fingerprint', async (f) => {
  for (const tier of ['starter', 'giving', 'parish', 'diocese', 'monastery_free']) {
    assert.equal(givingFeatureAccess({ subscriptionTier: tier }, 'reconciliation'), true);
    f.registration.subscriptionTier = tier;
    f.updateRegistration();
    const r = await report(f);
    assert.equal(r.summary.readyForReview, true);
    assert.equal(r.summary.depositedCents, 1284854);
    assert.equal(r.summary.refundCents, 5000);
    assert.equal(
      r.allocations.reduce((sum, row) => sum + row.netCents, 0),
      r.summary.depositedCents
    );
    assert.equal(r.summary.totalFeeCents, 39146);
    assert.equal(r.state, 'ready_for_bank_check');
    assert.equal(r.fingerprint, (await report(f)).fingerprint);
    assert.ok(r.transferWorksheet.lines.every((row) => row.recommendedAction === 'retain'));
  }
  assert.equal((await f.report(f.month, 'invalid')).status, 401);
  assert.equal((await f.close({}, 'invalid')).status, 401);
  assert.equal((await f.report('not-a-month')).status, 422);
});

await scenario('blank bank checks, mismatches, stale reports and concurrent closes cannot finalize', async (f) => {
  const r = await report(f),
    body = closeBody(f, r);
  assert.equal((await f.close({ ...body, bankStatementCents: null })).status, 400);
  assert.equal((await f.close({ ...body, bankStatementCents: String(body.bankStatementCents) })).status, 400);
  assert.equal((await f.close({ ...body, bankConfirmed: false })).status, 400);
  assert.equal(
    (await f.close({ ...body, bankStatementCents: body.bankStatementCents + 1, notes: 'Override' })).status,
    409
  );
  assert.equal((await f.close({ ...body, fingerprint: 'stale' })).status, 409);
  assert.equal((await f.close(null)).status, 400);
  const attempts = await Promise.all([f.close(body), f.close(body)]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
  const current = await report(f);
  assert.equal(current.state, 'reconciled');
  assert.equal(current.reviewHistory.length, 1, 'losing concurrent save must not write a history snapshot');
  assert.ok(current.closeRecord.reviewedSessionId);
  const snapshot = f.db
    .prepare('SELECT value FROM app_settings WHERE key=?')
    .get('reconciliation-close:synthetic-parish:2026-07:revision:' + current.closeRecord.reviewId);
  assert.equal(JSON.parse(snapshot.value).report.fingerprint, r.fingerprint);
  assert.equal((await f.close({ ...body, expectedReviewVersion: current.closeRecord.reviewId })).status, 409);
  assert.equal(
    (await f.close({ month: f.month, closed: false, expectedReviewVersion: current.closeRecord.reviewId })).status,
    400
  );
  const reopened = await f.close({
    month: f.month,
    closed: false,
    expectedReviewVersion: current.closeRecord.reviewId,
    notes: 'Bank statement correction',
  });
  assert.equal(reopened.status, 200);
  const next = (await reopened.json()).record;
  assert.equal(next.previousReviewId, current.closeRecord.reviewId);
  assert.equal((await f.close({ ...body, expectedReviewVersion: next.reviewId })).status, 200);
});

await scenario('oversized audit snapshots cannot leave a false reconciled record', async (f) => {
  f.addOffering({ ...f.offerings[0], donorName: 'Oversized fixture '.repeat(120000) });
  const r = await report(f);
  assert.equal((await f.close(closeBody(f, r))).status, 413);
  assert.equal((await report(f)).closeRecord, null);
  assert.equal(
    f.db.prepare("SELECT count(*) AS total FROM app_settings WHERE key LIKE 'reconciliation-close:%'").get().total,
    0
  );
});

await scenario('Funds & Alms owns monthly and weekly names while gift designations remain immutable', async (f) => {
  const original = await report(f);
  f.registration.funds[1].name = 'Building Renewal';
  f.registration.funds[1].enabled = false;
  f.updateRegistration();
  let r = await report(f);
  const building = r.allocations.find((row) => row.fundId === 'building');
  assert.equal(building.label, 'Building Renewal');
  assert.equal(building.category, 'Retired fund');
  assert.equal(building.catalogSource, 'funds_and_alms');
  assert.equal(building.netCents, original.allocations.find((row) => row.fundId === 'building').netCents);
  assert.notEqual(r.fingerprint, original.fingerprint);
  assert.ok(
    r.transactions.some((row) => row.fund === 'Building & Restoration' && row.allocationLabel === 'Building Renewal')
  );
  const activity = await loadFundGiftActivity(f.env, f.registration.parishId, r.period, f.registration);
  assert.equal(activity.allocations.find((row) => row.fundId === 'building').label, 'Building Renewal');
  f.registration.funds = f.registration.funds.filter((row) => row.id !== 'building');
  f.registration.funds.push({ id: 'new-building', name: 'Building & Restoration' });
  f.updateRegistration();
  r = await report(f);
  assert.equal(r.allocations.find((row) => row.fundId === 'building').catalogSource, 'historical_gift');
  assert.ok(
    !r.allocations.some((row) => row.fundId === 'new-building'),
    'reused name must not steal historical ID receipts'
  );
  assert.equal(r.complete, true);
  assert.equal(fundAllocation({ fund: 'Mission Outreach' }, f.registration).fundId, 'missions');
  f.registration.feastCampaigns = [{ id: 'feast', destinationFundId: 'missions' }];
  assert.equal(fundAllocation({ giftType: 'feast', campaignId: 'feast' }, f.registration), null);
  assert.equal(
    fundAllocation({ giftType: 'feast', fundId: 'benevolence-fund', campaignId: 'feast' }, f.registration).fundId,
    'benevolence-fund'
  );
  f.registration.funds.push({ id: 'missions-duplicate', name: 'Mission Outreach' });
  assert.equal(fundAllocation({ fund: 'Mission Outreach' }, f.registration), null);
});

await scenario('late changes invalidate review without overwriting its snapshot', async (f) => {
  const r = await report(f);
  await f.close(closeBody(f, r));
  f.payouts[0].status = 'failed';
  const changed = await report(f);
  assert.equal(changed.state, 'revised');
  assert.equal(changed.summary.readyForReview, false);
  assert.notEqual(changed.fingerprint, changed.closeRecord.fingerprint);
});

await scenario('equal-and-opposite unknown items cannot cancel into a clean report', async (f) => {
  const rows = f.transactions.get(f.payouts[0].id);
  for (const amount of [1000, -1000])
    rows.push({
      id: 'txn_unknown_' + amount,
      amount,
      fee: 0,
      net: amount,
      currency: 'usd',
      type: 'adjustment',
      source: null,
    });
  const r = await report(f);
  assert.equal(r.summary.unmatchedNetCents, 0);
  assert.equal(r.summary.unmatchedCount, 2);
  assert.equal(r.summary.unmatchedAbsoluteCents, 2000);
  assert.equal(r.complete, false);
  assert.equal((await f.close(closeBody(f, r))).status, 409);
});

await scenario('tenant, account, source and currency mismatches remain unresolved', async (f) => {
  const gift = { ...f.offerings[0], parishId: 'another-parish' };
  f.addOffering(gift);
  let r = await report(f);
  assert.equal(r.summary.unmatchedCount, 1);
  assert.equal(r.transactions.find((row) => row.paymentIntentId === gift.stripePaymentIntentId).donorName, '');
  f.addOffering({ ...gift, parishId: 'synthetic-parish', stripeAccountId: 'acct_other' });
  assert.equal((await report(f)).summary.unmatchedCount, 1);
  f.payouts[0].currency = 'eur';
  r = await report(f);
  assert.equal(r.complete, false);
  assert.ok(r.exceptions.some((row) => row.code === 'currency'));
  assert.equal(
    r.payouts.some((row) => row.id === f.payouts[0].id),
    false
  );
});

await scenario('manual, preparing, partial, and unavailable Stripe data cannot finalize', async (f) => {
  f.payouts[0].automatic = false;
  assert.equal((await report(f)).complete, false);
  f.payouts[0].automatic = true;
  f.payouts[0].reconciliation_status = 'in_progress';
  assert.equal((await report(f)).complete, false);
  f.payouts[0].reconciliation_status = 'completed';
  f.overrides.transactionHasMore = true;
  assert.equal((await report(f)).complete, false);
  f.overrides.transactionHasMore = false;
  f.overrides.payoutHasMore = true;
  assert.equal((await report(f)).complete, false);
  f.overrides.payoutHasMore = false;
  f.overrides.fail = true;
  assert.equal((await f.report()).status, 502);
});

await scenario('month boundaries use Stripe arrival dates without a lookback cutoff', async (f) => {
  f.payouts[0].arrival_date = Date.parse('2026-07-01T00:00:00Z') / 1000;
  f.payouts[0].created = Date.parse('2026-01-01T00:00:00Z') / 1000;
  assert.equal((await report(f)).payouts.length, 4);
  assert.ok(
    f.stripeRequests.some(
      (url) => url.searchParams.get('arrival_date[gte]') === String(Date.parse('2026-07-01T00:00:00Z') / 1000)
    )
  );
  assert.ok(f.stripeRequests.every((url) => !url.searchParams.has('created[gte]')));
});

await scenario('period-scoped weekly paging exceeds the old 2,000-gift cache', async (f) => {
  const period = fundReportPeriod({ week: true, now: new Date('2026-08-31T12:00:00Z'), timezone: 'America/Chicago' });
  assert.equal(period.startDate, '2026-08-24');
  assert.equal(period.endDate, '2026-08-31');
  f.db.exec('BEGIN');
  for (let i = 0; i < 2001; i++)
    f.addOffering({
      id: 'week_' + i,
      parishId: 'synthetic-parish',
      stripePaymentIntentId: 'pi_week_' + i,
      createdAt: '2026-08-24T06:00:00Z',
      paidAt: '',
      amountCents: 100,
      stripeFeeCents: 3,
      stripeFeeSource: 'balance_transaction',
      fundId: 'general',
    });
  f.addOffering({
    id: 'pending',
    parishId: 'synthetic-parish',
    stripePaymentIntentId: 'pi_pending',
    status: 'pending',
    paymentStatus: 'pending',
    createdAt: '2026-08-24T06:00:00Z',
    amountCents: 9000000,
  });
  f.db.exec('COMMIT');
  const activity = await loadFundGiftActivity(f.env, 'synthetic-parish', period);
  assert.equal(activity.giftCount, 2001);
  assert.equal(activity.parishNetCents, 2001 * 97);
  assert.equal(activity.estimatedFeeCount, 0);
  assert.equal(activity.complete, true);
  assert.ok(f.statements.filter((row) => row.sql.includes('ORDER BY id LIMIT 500')).length >= 5);
});

await scenario('empty month is zero and pending payout is not a deposit', async (f) => {
  f.payouts.length = 0;
  let r = await report(f);
  assert.equal(r.summary.depositedCents, 0);
  assert.equal(r.summary.matchedPercent, null);
  assert.equal(r.summary.readyForReview, true);
  f.payouts.push({
    id: 'po_pending',
    amount: 5000,
    status: 'pending',
    currency: 'usd',
    arrival_date: Date.parse('2026-07-02T00:00:00Z') / 1000,
  });
  r = await report(f);
  assert.equal(r.summary.depositedCents, 0);
  assert.equal(r.summary.inTransitCents, 5000);
  assert.equal(r.summary.readyForReview, false);
});

await scenario('exact pagination boundaries succeed but one extra item stays incomplete', async (f) => {
  f.payouts.splice(1);
  const rows = Array.from({ length: 500 }, (_, i) => ({
    ...f.transactions.get(f.payouts[0].id)[0],
    id: 'txn_page_' + i,
  }));
  f.transactions.set(f.payouts[0].id, rows);
  f.payouts[0].amount = rows.reduce((sum, row) => sum + row.net, 0);
  assert.equal((await report(f)).complete, true);
  rows.push({ ...rows[0], id: 'txn_page_extra' });
  f.payouts[0].amount += rows[0].net;
  let r = await report(f);
  assert.equal(r.complete, false);
  assert.ok(r.exceptions.some((row) => row.code === 'transaction_limit'));
  rows.splice(1);
  f.payouts[0].amount = rows[0].net;
  for (let i = 1; i < 101; i++) {
    const payout = { ...f.payouts[0], id: 'po_page_' + i };
    f.payouts.push(payout);
    f.transactions.set(payout.id, [{ ...rows[0], id: 'txn_payout_' + i }]);
  }
  r = await report(f);
  assert.equal(r.complete, false);
  assert.ok(r.exceptions.some((row) => row.code === 'payout_limit'));
});

await scenario('source lookup limit, duplicate IDs and signed dispute reversal are explicit', async (f) => {
  f.payouts.splice(1);
  const original = f.transactions.get(f.payouts[0].id)[0];
  const rows = Array.from({ length: 80 }, (_, i) => ({ ...original, id: 'txn_lookup_' + i, source: 'ch_lookup_' + i }));
  f.transactions.set(f.payouts[0].id, rows);
  f.payouts[0].amount = rows.reduce((sum, row) => sum + row.net, 0);
  f.overrides.source = { id: 'ch_sample', payment_intent: f.offerings[0].stripePaymentIntentId };
  assert.equal((await report(f)).complete, true);
  rows.push({ ...original, id: 'txn_lookup_extra', source: 'ch_lookup_extra' });
  f.payouts[0].amount += original.net;
  assert.equal((await report(f)).complete, false);
  rows.splice(0, rows.length, original, original);
  f.payouts[0].amount = original.net * 2;
  assert.ok((await report(f)).exceptions.some((row) => row.code === 'transaction_identity'));
  rows.splice(1);
  rows.push({
    ...original,
    id: 'txn_dispute_return',
    type: 'adjustment',
    reporting_category: 'dispute_reversal',
    amount: 5000,
    fee: -1500,
    net: 6500,
    fee_details: [{ type: 'stripe_fee', amount: -1500 }],
  });
  f.payouts[0].amount = original.net + 6500;
  const r = await report(f);
  assert.equal(r.complete, true);
  assert.equal(r.summary.refundCents, 0, 'positive dispute recovery is not a refund debit');
  assert.equal(r.summary.totalFeeCents, original.fee - 1500);
});

const march = fundReportPeriod({ month: '2026-03', timezone: 'America/Chicago' });
assert.equal(march.startIso, '2026-03-01T06:00:00.000Z');
assert.equal(march.endIso, '2026-04-01T05:00:00.000Z');
assert.equal(fundReportPeriod({ now: new Date('2026-08-01T02:00:00Z'), timezone: 'America/Chicago' }).month, '2026-06');
assert.equal(fundAllocation({ giftType: 'candle' }), null);
assert.equal(fundAllocation({ fundId: 'archived', fund: 'Historical name' }).key, 'fund:archived');
assert.equal(fundAllocation({ fund: 'Building fund' }).key, 'legacy-fund:building fund');
console.log(`PASS - ${passed} reconciliation scenarios plus DST and classification checks`);
