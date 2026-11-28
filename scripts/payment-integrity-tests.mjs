import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { processStripeWebhookEvent } from '../src/handlers/stripe.js';
import { storeDonorOffering, loadDonorOfferings, paidOfferingStatus } from '../src/handlers/parish-donor-offerings.js';
import { createFundAllocationResolver } from '../src/lib/fund-reporting.js';
import { sendDonorDonationReceiptEmail } from '../src/handlers/donor.js';
import { sendDonationReceiptMessage } from '../src/payments/donation-receipts.js';
import { initializeLedger, stripeClearingValidation } from '../src/accounting/index.js';
import worker from '../src/worker.js';
import { handleCheckout } from '../src/handlers/parish-checkout.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const prepare = (sql) => ({
    params: [],
    bind(...params) {
      this.params = params;
      return this;
    },
    statement() {
      const params = [];
      const query = sql.replace(/\?(\d+)/g, (_, n) => {
        params.push(this.params[Number(n) - 1]);
        return '?';
      });
      return [sqlite.prepare(query), params.length ? params : this.params];
    },
    async first() {
      const [stmt, args] = this.statement();
      return stmt.get(...args) || null;
    },
    async all() {
      const [stmt, args] = this.statement();
      return { results: stmt.all(...args), success: true };
    },
    async run() {
      const [stmt, args] = this.statement();
      return { success: true, meta: { changes: stmt.run(...args).changes } };
    },
  });
  return {
    sqlite,
    prepare,
    async batch(items) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const item of items) result.push(await item.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function fixture(environment = 'production') {
  const db = database();
  db.sqlite.exec(`CREATE TABLE donor_offerings (id TEXT PRIMARY KEY, donor_email TEXT, parish_id TEXT,
    checkout_session_id TEXT, payment_intent_id TEXT, stripe_subscription_id TEXT, status TEXT, payment_status TEXT,
    settlement_profile_id TEXT, created_at TEXT, updated_at TEXT, data TEXT);
    CREATE TABLE accounting_entities(id TEXT, parish_id TEXT, entity_status TEXT);
    CREATE TABLE accounting_databases(id TEXT, accounting_entity_id TEXT, environment TEXT, database_identifier TEXT, provisioning_status TEXT, health_status TEXT);
    CREATE TABLE registrations(reference TEXT,parish_id TEXT,stripe_account_id TEXT,data TEXT,updated_at TEXT,received_at TEXT);
    CREATE TABLE commerce_orders(id TEXT, stripe_payment_intent_id TEXT, total_charged_cents INTEGER);
    CREATE TABLE stripe_events(id TEXT PRIMARY KEY, received_at TEXT);
    INSERT INTO accounting_entities VALUES('entity-a','parish-a','ready');`);
  db.sqlite
    .prepare("INSERT INTO accounting_databases VALUES('db-a','entity-a',?,'ledger-a','ready','healthy')")
    .run(environment);
  db.sqlite.exec(readFileSync('migrations/0125_donation_receipt_delivery.sql', 'utf8'));
  db.sqlite.exec(readFileSync('migrations/0002_stripe_event_status.sql', 'utf8'));
  db.sqlite.exec(readFileSync('migrations/0010_settlement_profiles.sql', 'utf8').split(/\r?\nALTER TABLE/)[0]);
  const ledger = database();
  for (const file of readdirSync('accounting-migrations')
    .filter((file) => /^\d.*\.sql$/.test(file))
    .sort()) {
    try {
      ledger.sqlite.exec(readFileSync(`accounting-migrations/${file}`, 'utf8'));
    } catch (error) {
      throw new Error(file + ': ' + error.message);
    }
    if (file.startsWith('0002_'))
      await initializeLedger(ledger, {
        actor: { id: 'test', capabilities: ['accounting.configure'] },
        date: new Date(),
      });
  }
  await initializeLedger(ledger, { actor: { id: 'test', capabilities: ['accounting.configure'] }, date: new Date() });
  ledger.sqlite.exec(
    "UPDATE accounting_integration_settings SET give_posting_enabled=1, stripe_posting_enabled=1, posting_mode='automatic'"
  );
  return {
    AGAPAY_ENVIRONMENT: environment,
    AGAPAY_DB: db,
    LEDGER_A: ledger,
    ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'ledger-a': 'LEDGER_A' }),
    AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  };
}

const loadDonorOfferingById = async (env, id) =>
  JSON.parse(env.AGAPAY_DB.sqlite.prepare('SELECT data FROM donor_offerings WHERE id=?').get(id)?.data || 'null');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('Unexpected network access');
};
const base = {
  id: 'cs_a',
  checkoutSessionId: 'cs_a',
  recordType: 'subscription_setup',
  donorEmail: 'audit@example.invalid',
  parishId: 'parish-a',
  parishName: 'Parish A',
  giftType: 'fund',
  frequency: 'monthly',
  amountCents: 1000,
  fund: 'Special Fund',
  fundId: 'stable-id',
  settlementProfileId: 'test',
};
const metadata = {
  donor_email: base.donorEmail,
  parish_id: base.parishId,
  parish_name: base.parishName,
  gift_type: 'fund',
  fund: 'Special Fund',
  fund_id: 'stable-id',
  amount_cents: '1000',
  frequency: 'monthly',
};
const invoice = {
  id: 'in_a',
  subscription: 'sub_a',
  payment_intent: 'pi_a',
  amount_paid: 1000,
  created: Math.floor(Date.now() / 1000),
  subscription_details: { metadata },
};
const event = (type, object) => ({ type, data: { object } });

async function deliver(env, id, type, object, extra = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = 'whsec_payment_integrity_fixture';
  const body = JSON.stringify({ id, created: timestamp, ...event(type, object), ...extra });
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return worker.fetch(
    new Request('https://agapay.test/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
      body,
    }),
    { ...env, STRIPE_WEBHOOK_SECRET: secret }
  );
}

async function paidBankGift(env, name) {
  const checkout = {
    id: `cs_${name}`,
    payment_intent: `pi_${name}`,
    mode: 'payment',
    payment_status: 'paid',
    created: invoice.created,
  };
  await storeDonorOffering(env, {
    ...base,
    id: checkout.id,
    checkoutSessionId: checkout.id,
    stripePaymentIntentId: checkout.payment_intent,
    recordType: 'payment',
    frequency: 'once',
    paymentMethod: 'ach',
    status: 'pending',
    paymentStatus: 'unpaid',
    donorRestricted: true,
  });
  assert.equal(
    (await deliver(env, `evt_${name}_paid`, 'checkout.session.async_payment_succeeded', checkout)).status,
    200
  );
  return checkout;
}

function postedLines(env, type) {
  return env.LEDGER_A.sqlite
    .prepare(
      `SELECT l.account_id, l.fund_id, l.debit_amount, l.credit_amount
       FROM accounting_journal_lines l JOIN accounting_journal_entries j ON j.id=l.journal_entry_id
       WHERE j.source_type=? AND j.status='posted' ORDER BY l.account_id`
    )
    .all(`integration.${type}`)
    .map((row) => ({ ...row }));
}

try {
  const blockedFetch = globalThis.fetch;
  for (const receiptEnv of [{}, { AGAPAY_FROM_EMAIL: 'AGAPAY <onboarding@agapay.app>' }]) {
    let sentReceipt;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      sentReceipt = JSON.parse(options.body);
      return Response.json({ id: 'receipt-sender-test' });
    };
    const receipt = await sendDonorDonationReceiptEmail(
      {
        ...receiptEnv,
        RESEND_API_KEY: 'test-key',
        AGAPAY_REPLY_TO_EMAIL: 'support@agapay.app',
      },
      { ...base, isDiagnostic: true, amountCents: 1000, chargeCents: 1061 }
    );
    assert.equal(receipt.status, 'sent');
    assert.equal(sentReceipt.from, 'AGAPAY Receipts <receipts@agapay.app>');
    assert.equal(sentReceipt.reply_to, 'support@agapay.app');
    assert.deepEqual(sentReceipt.to, ['audit@example.invalid']);
    assert.match(sentReceipt.subject, /AGAPAY receipt/);
  }
  globalThis.fetch = blockedFetch;
  console.log('PASS - donation receipts use their own sender even when the global onboarding sender is configured');
  for (const invoiceFirst of [false, true]) {
    const env = await fixture();
    const saved = await storeDonorOffering(env, base);
    assert.equal(saved.fundId, 'stable-id');
    const resolve = createFundAllocationResolver({
      funds: [
        { id: 'stable-id', name: 'Renamed Fund' },
        { id: 'other', name: 'Special Fund' },
      ],
    });
    assert.equal(resolve(saved).fundId, 'stable-id');
    if (invoiceFirst) await processStripeWebhookEvent(env, event('invoice.paid', invoice));
    await processStripeWebhookEvent(
      env,
      event('checkout.session.completed', {
        id: 'cs_a',
        mode: 'subscription',
        payment_status: 'unpaid',
        subscription: 'sub_a',
      })
    );
    assert.equal(paidOfferingStatus(await loadDonorOfferingById(env, 'cs_a')), false);
    if (!invoiceFirst) {
      await processStripeWebhookEvent(env, event('payment_intent.succeeded', { id: 'pi_a', metadata }));
      assert.equal(env.LEDGER_A.sqlite.prepare('SELECT count(*) n FROM accounting_journal_entries').get().n, 0);
      await processStripeWebhookEvent(env, event('invoice.paid', invoice));
    }
    await processStripeWebhookEvent(
      env,
      event('checkout.session.async_payment_succeeded', {
        id: 'cs_a',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_a',
      })
    );
    await processStripeWebhookEvent(env, event('invoice.payment_succeeded', invoice));
    const gifts = await loadDonorOfferings(env, base.donorEmail);
    assert.equal(gifts.filter(paidOfferingStatus).length, 1);
    assert.equal(
      gifts.filter(paidOfferingStatus).reduce((sum, gift) => sum + gift.amountCents, 0),
      1000
    );
    const entries = env.LEDGER_A.sqlite.prepare("SELECT * FROM accounting_journal_entries WHERE status='posted'").all();
    assert.equal(entries.length, 1, 'one payment posts once despite duplicate events');
    const totals = env.LEDGER_A.sqlite
      .prepare('SELECT sum(debit_amount) debit,sum(credit_amount) credit FROM accounting_journal_lines')
      .get();
    assert.equal(totals.debit, totals.credit);
    await processStripeWebhookEvent(
      env,
      event('invoice.paid', { ...invoice, id: 'in_renewal', payment_intent: 'pi_renewal' })
    );
    assert.equal(
      env.LEDGER_A.sqlite.prepare("SELECT count(*) n FROM accounting_journal_entries WHERE status='posted'").get().n,
      2,
      'renewal posts without another PaymentIntent event'
    );
    const paid = await loadDonorOfferingById(env, 'in_a');
    await storeDonorOffering(env, { ...paid, emailReceiptSentAt: '2026-09-05T00:00:00Z' });
    await processStripeWebhookEvent(env, event('invoice.paid', invoice));
    assert.equal((await loadDonorOfferingById(env, 'in_a')).emailReceiptSentAt, '2026-09-05T00:00:00Z');
  }
  console.log(
    'PASS - first recurring payment and renewal post exactly once in either event order; unpaid setup never posts; fund identity and receipt marker survive'
  );

  const concurrent = await fixture();
  await Promise.all([
    processStripeWebhookEvent(concurrent, event('invoice.paid', invoice)),
    processStripeWebhookEvent(concurrent, event('invoice.payment_succeeded', invoice)),
  ]);
  assert.equal(
    concurrent.LEDGER_A.sqlite.prepare("SELECT count(*) n FROM accounting_journal_entries WHERE status='posted'").get()
      .n,
    1
  );
  const modern = {
    ...invoice,
    id: 'in_modern',
    payment_intent: undefined,
    subscription: undefined,
    subscription_details: undefined,
    parent: { subscription_details: { metadata, subscription: 'sub_a' } },
    payments: { data: [{ status: 'paid', payment: { payment_intent: 'pi_modern' } }] },
  };
  await processStripeWebhookEvent(concurrent, event('invoice.paid', modern));
  assert.equal((await loadDonorOfferingById(concurrent, 'in_modern')).stripePaymentIntentId, 'pi_modern');
  concurrent.LEDGER_A.sqlite.exec(
    "UPDATE accounting_integration_settings SET default_contribution_account_id='acct_4020'"
  );
  await processStripeWebhookEvent(
    concurrent,
    event('charge.refunded', {
      id: 'ch_modern',
      payment_intent: 'pi_modern',
      amount: 1000,
      amount_refunded: 400,
      refunds: { data: [{ id: 're_part', amount: 400, created: invoice.created }] },
    })
  );
  assert.equal((await loadDonorOfferingById(concurrent, 'in_modern')).refundedCents, 400);
  await processStripeWebhookEvent(concurrent, event('invoice.paid', modern));
  assert.equal(
    (await loadDonorOfferingById(concurrent, 'in_modern')).status,
    'partially_refunded',
    'late invoice must not undo a refund'
  );
  assert.equal(
    concurrent.LEDGER_A.sqlite.prepare("SELECT count(*) n FROM accounting_journal_entries WHERE status='posted'").get()
      .n,
    3
  );
  const fullRefund = {
    id: 'ch_modern',
    payment_intent: 'pi_modern',
    amount: 1000,
    amount_refunded: 1000,
    refunds: {
      data: [
        { id: 're_part', amount: 400, created: invoice.created },
        { id: 're_rest', amount: 600, created: invoice.created },
      ],
    },
  };
  await processStripeWebhookEvent(concurrent, event('charge.refunded', fullRefund));
  await processStripeWebhookEvent(
    concurrent,
    event('charge.refunded', { ...fullRefund, amount_refunded: 400, refunds: { data: [fullRefund.refunds.data[0]] } })
  );
  assert.equal((await loadDonorOfferingById(concurrent, 'in_modern')).status, 'refunded');
  assert.equal((await loadDonorOfferingById(concurrent, 'in_modern')).refundedCents, 1000);
  assert.equal(
    concurrent.LEDGER_A.sqlite
      .prepare("SELECT sum(credit_amount-debit_amount) n FROM accounting_journal_lines WHERE account_id='acct_4010'")
      .get().n,
    1000,
    'refunds reverse the original account even after settings change'
  );
  console.log(
    'PASS - concurrent invoice delivery and current invoice shape; partial/full refunds survive delayed events'
  );

  const achEnv = await fixture();
  const ach = await paidBankGift(achEnv, 'bank');
  const staleCheckout = { ...ach, payment_status: 'unpaid', created: ach.created - 1 };
  assert.equal((await deliver(achEnv, 'evt_bank_unpaid', 'checkout.session.completed', staleCheckout)).status, 200);
  assert.equal((await deliver(achEnv, 'evt_bank_expired', 'checkout.session.expired', staleCheckout)).status, 200);
  const settled = await loadDonorOfferingById(achEnv, ach.id);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.paymentStatus, 'paid');
  assert.equal(settled.stripePaymentIntentId, ach.payment_intent);
  assert.equal(postedLines(achEnv, 'donation_succeeded').length, 2);
  console.log('PASS - a signed, delayed unpaid or expired Checkout event cannot undo a settled ACH gift');

  const refundEnv = await fixture('staging');
  const refundPayment = await paidBankGift(refundEnv, 'refund');
  const original = postedLines(refundEnv, 'donation_succeeded');
  refundEnv.STRIPE_SECRET_KEY = 'sk_test_payment_integrity_fixture';
  let providerUnavailable = true;
  let refundPending = true;
  const refundRequests = [];
  const charge = {
    id: 'ch_refund',
    payment_intent: { id: refundPayment.payment_intent },
    amount: 1000,
    amount_refunded: 1000,
  };
  globalThis.fetch = async (url, options) => {
    const request = new URL(url);
    assert.equal(options.headers['Stripe-Account'], 'acct_refund_fixture');
    if (request.pathname === '/v1/charges/ch_refund') return Response.json(charge);
    assert.equal(request.pathname, '/v1/refunds');
    assert.equal(request.searchParams.get('charge'), 'ch_refund');
    const cursor = request.searchParams.get('starting_after');
    refundRequests.push(cursor);
    if (providerUnavailable) return Response.json({}, { status: 503 });
    const refund = cursor ? { id: 're_part', amount: 400 } : { id: 're_rest', amount: 600 };
    return Response.json({
      data: [{ ...refund, status: !cursor && refundPending ? 'pending' : 'succeeded', created: invoice.created }],
      has_more: !cursor,
    });
  };
  const connected = { account: 'acct_refund_fixture' };
  assert.equal((await deliver(refundEnv, 'evt_refund', 'charge.refunded', charge, connected)).status, 500);
  assert.equal((await loadDonorOfferingById(refundEnv, refundPayment.id)).status, 'completed');
  assert.equal((await deliver(refundEnv, 'evt_refund_retry', 'charge.refunded', charge, connected)).status, 500);
  providerUnavailable = false;
  const retries = await Promise.all([
    deliver(refundEnv, 'evt_refund', 'charge.refunded', charge, connected),
    deliver(refundEnv, 'evt_refund', 'charge.refunded', charge, connected),
  ]);
  assert.deepEqual(
    retries.map((response) => response.status),
    [200, 200]
  );
  const retryResults = await Promise.all(retries.map((response) => response.json()));
  assert.equal(
    retryResults.filter((result) => result.duplicate).length,
    1,
    'Only one delivery may reclaim a failed event'
  );
  const duplicate = await deliver(refundEnv, 'evt_refund', 'charge.refunded', charge, connected);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await loadDonorOfferingById(refundEnv, refundPayment.id)).refundedCents, 400);
  assert.equal(postedLines(refundEnv, 'donation_partially_refunded').length, 2);
  refundPending = false;
  const settledRefund = { id: 're_rest', charge: charge.id, status: 'succeeded' };
  assert.equal(
    (await deliver(refundEnv, 'evt_refund_settled', 'refund.updated', settledRefund, connected)).status,
    200
  );
  assert.equal((await deliver(refundEnv, 'evt_refund_replay', 'charge.refunded', charge, connected)).status, 200);
  assert.deepEqual(refundRequests, [null, null, null, 're_rest', null, 're_rest', null, 're_rest']);
  assert.equal((await loadDonorOfferingById(refundEnv, refundPayment.id)).refundedCents, 1000);
  const refundLines = postedLines(refundEnv, 'donation_partially_refunded');
  assert.equal(refundLines.length, 4);
  for (const line of original) {
    const reversals = refundLines.filter((refund) => refund.account_id === line.account_id);
    assert.ok(reversals.every((refund) => refund.fund_id === line.fund_id));
    assert.equal(
      reversals.reduce((sum, refund) => sum + refund.debit_amount, 0),
      line.credit_amount
    );
    assert.equal(
      reversals.reduce((sum, refund) => sum + refund.credit_amount, 0),
      line.debit_amount
    );
  }
  globalThis.fetch = async () => {
    throw new Error('Unexpected network access');
  };
  console.log('PASS - unexpanded connected-account refunds retry on provider failure and post every page exactly once');

  for (const outcome of ['won', 'lost']) {
    const disputeEnv = await fixture();
    const gift = await paidBankGift(disputeEnv, outcome);
    const dispute = {
      id: `dp_${outcome}`,
      payment_intent: gift.payment_intent,
      amount: 1000,
      created: invoice.created,
      currency: 'usd',
    };
    const opened = { ...dispute, status: 'needs_response' };
    const closed = { ...dispute, status: outcome };
    if (outcome === 'lost') {
      assert.equal((await deliver(disputeEnv, 'evt_open', 'charge.dispute.created', opened)).status, 200);
      assert.equal((await loadDonorOfferingById(disputeEnv, gift.id)).status, 'disputed');
    }
    assert.equal((await deliver(disputeEnv, 'evt_close', 'charge.dispute.closed', closed)).status, 200);
    assert.equal((await deliver(disputeEnv, 'evt_late_open', 'charge.dispute.created', opened)).status, 200);
    assert.equal((await deliver(disputeEnv, 'evt_repeat_close', 'charge.dispute.closed', closed)).status, 200);
    const saved = await loadDonorOfferingById(disputeEnv, gift.id);
    assert.equal(saved.disputeStatus, outcome);
    assert.equal(saved.status, outcome === 'won' ? 'completed' : 'dispute_closed');
    const withdrawn = postedLines(disputeEnv, 'stripe_dispute_created');
    assert.deepEqual(
      withdrawn,
      postedLines(disputeEnv, 'donation_succeeded').map((line) => ({
        ...line,
        debit_amount: line.credit_amount,
        credit_amount: line.debit_amount,
      }))
    );
    assert.deepEqual(
      postedLines(disputeEnv, 'stripe_dispute_won'),
      outcome === 'won' ? postedLines(disputeEnv, 'donation_succeeded') : []
    );
    const day = new Date().toISOString().slice(0, 10);
    const clearing = await stripeClearingValidation(disputeEnv.LEDGER_A, {
      actor: { id: 'test', capabilities: ['accounting.integrations.view'] },
      entitlementTier: 'parish',
      startDate: day,
      endDate: day,
    });
    assert.equal(clearing.endingLedgerClearingBalance, outcome === 'won' ? 1000 : 0);
  }
  console.log(
    'PASS - signed donation dispute events record one debit, restore only won amounts, and preserve closed outcomes'
  );

  const env = await fixture();
  env.RESEND_API_KEY = 'test-key';
  const message = { from: 'test@example.invalid', to: ['audit@example.invalid'], subject: 'receipt', html: 'original' };
  let requests = [];
  let release;
  globalThis.fetch = async (url, options) => {
    requests.push(options);
    await new Promise((resolve) => {
      release = resolve;
    });
    return Response.json({ id: 'email-a' });
  };
  const first = sendDonationReceiptMessage(env, base, message);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(sendDonationReceiptMessage(env, base, { ...message, html: 'changed' }), /in progress/);
  release();
  await first;
  await sendDonationReceiptMessage(env, base, { ...message, html: 'changed' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers['Idempotency-Key'], 'donation:parish-a:cs_a');
  // Simulate an ambiguous provider response, then retry with a changed rendering.
  const retryGift = { ...base, id: 'retry' };
  globalThis.fetch = async (url, options) => {
    requests.push(options);
    throw new Error('timeout');
  };
  await assert.rejects(sendDonationReceiptMessage(env, retryGift, message), /failed/);
  globalThis.fetch = async (url, options) => {
    requests.push(options);
    return Response.json({ id: 'email-retry' });
  };
  await sendDonationReceiptMessage(env, retryGift, { ...message, html: 'changed' });
  assert.equal(requests.at(-1).body, requests.at(-2).body, 'retry payload is frozen');
  assert.equal(requests.at(-1).headers['Idempotency-Key'], requests.at(-2).headers['Idempotency-Key']);
  env.AGAPAY_DB.sqlite
    .prepare("UPDATE donation_receipt_deliveries SET status='failed', first_attempt_at=? WHERE id=?")
    .run(Date.now() - 24 * 60 * 60 * 1000, 'donation:parish-a:retry');
  const beforeExpiredRetry = requests.length;
  await assert.rejects(sendDonationReceiptMessage(env, retryGift, message), /retry window expired/);
  assert.equal(requests.length, beforeExpiredRetry, 'expired provider key must never trigger another send');
  assert.equal(
    env.AGAPAY_DB.sqlite
      .prepare('SELECT status FROM donation_receipt_deliveries WHERE id=?')
      .get('donation:parish-a:retry').status,
    'needs_review'
  );
  console.log(
    'PASS - concurrent receipt delivery is claimed once and ambiguous retries preserve provider key and payload'
  );

  globalThis.fetch = async () => {
    throw new Error('Checkout must reject before calling Stripe');
  };
  env.STRIPE_SECRET_KEY = 'test-key';
  const registration = {
    ...base,
    parishId: 'parish-a',
    status: 'verified',
    givingStatus: 'active',
    subscriptionTier: 'parish',
    subscriptionStatus: 'active',
    recurringGivingEnabled: false,
    commemorationsEnabled: false,
    stripeAccountId: 'acct_test',
    campaigns: [{ id: 'closed', name: 'Closed', active: false }],
  };
  env.AGAPAY_DB.sqlite
    .prepare('INSERT INTO registrations(reference,parish_id,data) VALUES(?,?,?)')
    .run('reg-a', 'parish-a', JSON.stringify(registration));
  for (const extra of [
    { giftType: 'general', frequency: 'monthly' },
    { giftType: 'commemoration', frequency: 'once' },
    { giftType: 'campaign', campaignId: 'closed', frequency: 'once' },
    { giftType: 'campaign', campaignId: 'invented', frequency: 'once' },
  ]) {
    const response = await handleCheckout(
      new Request('https://agapay.test/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parishId: 'parish-a', amount: 10, firstName: 'Test', email: base.donorEmail, ...extra }),
      }),
      env
    );
    assert.equal(response.status, 422, await response.text());
  }
  console.log('PASS - checkout rejects disabled recurring gifts, commemorations, and inactive or unknown campaigns');
} finally {
  globalThis.fetch = originalFetch;
}
