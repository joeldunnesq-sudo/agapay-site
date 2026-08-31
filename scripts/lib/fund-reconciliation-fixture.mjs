// Local-only synthetic data. Real handlers and SQL, no Stripe or production data.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { issueParishDashboardSession } from '../../src/lib/core.js';
import { entitlementsSummary } from '../../src/lib/entitlements.js';
import { fundReportPeriod } from '../../src/lib/fund-reporting.js';
import {
  handleParishReconciliation,
  handleParishReconciliationClose,
} from '../../src/handlers/parish-reconciliation.js';

export async function createFundReconciliationFixture({ month = fundReportPeriod().month } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE registrations(reference TEXT PRIMARY KEY,parish_id TEXT,data TEXT,updated_at TEXT,received_at TEXT);
    CREATE TABLE donor_offerings(id TEXT PRIMARY KEY,parish_id TEXT,payment_intent_id TEXT,status TEXT,payment_status TEXT,created_at TEXT,data TEXT);`);
  const statements = [];
  const binding = {
    async batch(items) {
      db.exec('BEGIN');
      try {
        const results = items.map((item) => item.runSync());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          statements.push({ sql, values });
          args = /\?\d/.test(sql)
            ? [Object.fromEntries(values.map((value, index) => ['?' + (index + 1), value]))]
            : values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args), success: true };
        },
        runSync() {
          return { meta: { changes: Number(statement.run(...args).changes) }, success: true };
        },
        async run() {
          return this.runSync();
        },
      };
    },
  };
  const funds = [
    { id: 'general', name: 'General Operating Fund', enabled: true },
    { id: 'building', name: 'Building & Restoration', enabled: true },
    { id: 'benevolence-fund', name: 'Benevolence Fund', enabled: true },
    { id: 'missions', name: 'Mission Outreach', enabled: true },
    { id: 'youth', name: 'Youth & Family Ministry', enabled: true },
  ];
  const issued = await issueParishDashboardSession({
    parishId: 'synthetic-parish',
    parishName: 'St. Mark Orthodox Mission',
    communityType: 'Mission',
    subscriptionTier: 'starter',
    subscriptionTierLabel: 'Give',
    subscriptionStatus: 'active',
    stripeAccountId: 'acct_synthetic',
    stripeAccountStatus: 'payouts_enabled',
    timezone: 'America/Chicago',
    givingStatus: 'active',
    funds,
    campaigns: [],
    setup: { billingActive: true, stripeConnected: true },
    onboarding: { enabled: true, state: 'LIVE', blockers: [], stripe: {} },
  });
  const registration = issued.registration;
  const updateRegistration = () =>
    db
      .prepare('INSERT OR REPLACE INTO registrations VALUES(?,?,?,?,?)')
      .run(
        'fixture',
        registration.parishId,
        JSON.stringify(registration),
        new Date().toISOString(),
        new Date().toISOString()
      );
  updateRegistration();
  const env = { AGAPAY_DB: binding, STRIPE_SECRET_KEY: 'sk_test_synthetic_never_sent', AGAPAY_ENVIRONMENT: 'test' };
  const payouts = [],
    transactions = new Map(),
    offerings = [];
  const stamp = (day, hour = 12) =>
    Date.parse(month + '-' + String(day).padStart(2, '0') + 'T' + String(hour).padStart(2, '0') + ':00:00Z') / 1000;
  const addOffering = (gift) => {
    offerings.push(gift);
    db.prepare('INSERT OR REPLACE INTO donor_offerings VALUES(?,?,?,?,?,?,?)').run(
      gift.id,
      gift.parishId,
      gift.stripePaymentIntentId,
      gift.status || 'paid',
      gift.paymentStatus || 'paid',
      gift.createdAt,
      JSON.stringify(gift)
    );
  };
  for (let p = 0; p < 4; p++) {
    const day = 3 + p * 7;
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const id = 'sample_' + p + '_' + i;
      const amount = [205000, 68500, 27500, 18000, 9500][i] + p * 500;
      const fee = Math.round(amount * 0.029) + 30;
      const gift = {
        id,
        parishId: registration.parishId,
        stripeAccountId: registration.stripeAccountId,
        stripePaymentIntentId: 'pi_' + id,
        fundId: funds[i].id,
        fund: funds[i].name,
        donorName: ['Anna Martin', 'Michael & Maria Cole', 'Nicholas Reed', 'Sophia Bell', 'Paul James'][i],
        donorEmail: 'giver' + i + '@example.test',
        currency: 'usd',
        giftType: 'general',
        amountCents: amount,
        chargeCents: amount,
        stripeFeeCents: fee,
        stripeFeeSource: 'balance_transaction',
        createdAt: new Date(stamp(day - 1) * 1000).toISOString(),
        paidAt: new Date(stamp(day - 1) * 1000).toISOString(),
      };
      addOffering(gift);
      rows.push({
        id: 'txn_' + id,
        amount,
        fee,
        net: amount - fee,
        currency: 'usd',
        type: 'charge',
        reporting_category: 'charge',
        created: stamp(day - 1),
        fee_details: [{ type: 'stripe_fee', amount: fee }],
        source: { id: 'ch_' + id, payment_intent: gift.stripePaymentIntentId },
      });
    }
    if (p === 3)
      rows.push({
        id: 'txn_refund',
        amount: -5000,
        fee: 0,
        net: -5000,
        currency: 'usd',
        type: 'refund',
        reporting_category: 'refund',
        created: stamp(day - 1),
        fee_details: [],
        source: { id: 're_sample', payment_intent: 'pi_sample_0_1' },
      });
    const payout = {
      id: 'po_sample_' + p,
      amount: rows.reduce((sum, row) => sum + row.net, 0),
      status: 'paid',
      automatic: true,
      method: 'standard',
      reconciliation_status: 'completed',
      arrival_date: stamp(day, 0),
      created: stamp(day - 1),
      currency: 'usd',
      livemode: false,
    };
    payouts.push(payout);
    transactions.set(payout.id, rows);
  }
  const originalFetch = globalThis.fetch;
  const stripeRequests = [];
  const overrides = { payoutHasMore: false, transactionHasMore: false, fail: false, source: null };
  function installStripeMock() {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.stripe.com', 'fixture must never contact an external service');
      assert.equal(init.headers['Stripe-Account'], registration.stripeAccountId);
      assert.equal(init.method || 'GET', 'GET', 'reconciliation must never move money');
      stripeRequests.push(url);
      if (overrides.fail) return Response.json({ error: { message: 'Synthetic provider failure' } }, { status: 503 });
      let list, more;
      if (url.pathname === '/v1/payouts') {
        const from = +url.searchParams.get('arrival_date[gte]'),
          to = +url.searchParams.get('arrival_date[lt]');
        list = payouts.filter((row) => row.arrival_date >= from && row.arrival_date < to).toReversed();
        more = overrides.payoutHasMore;
      } else if (url.pathname === '/v1/balance_transactions') {
        list = transactions.get(url.searchParams.get('payout')) || [];
        more = overrides.transactionHasMore;
      } else if (overrides.source) return Response.json(overrides.source);
      else throw new Error('Unexpected synthetic Stripe path: ' + url.pathname);
      const after = url.searchParams.get('starting_after');
      const offset = after ? list.findIndex((row) => row.id === after) + 1 : 0;
      const data = list.slice(offset, offset + Number(url.searchParams.get('limit') || 100));
      return Response.json({ data, has_more: more || offset + data.length < list.length });
    };
  }
  const request = (suffix, body, token = issued.token) =>
    new Request('https://parish.test/api/parish/dashboard/synthetic-parish' + suffix, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    db,
    env,
    registration,
    token: issued.token,
    month,
    payouts,
    transactions,
    offerings,
    overrides,
    statements,
    stripeRequests,
    addOffering,
    updateRegistration,
    installStripeMock,
    dashboard: () => ({
      ...registration,
      parishDashboardSessions: undefined,
      entitlements: entitlementsSummary(registration),
    }),
    report: (selected = month, token = issued.token) =>
      handleParishReconciliation(
        request('/reconciliation?month=' + selected, undefined, token),
        env,
        registration.parishId
      ),
    close: (body, token = issued.token) =>
      handleParishReconciliationClose(request('/reconciliation/close', body, token), env, registration.parishId),
    dispose() {
      globalThis.fetch = originalFetch;
      db.close();
    },
  };
}
