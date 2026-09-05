import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { processStripeWebhookEvent } from '../src/handlers/stripe.js';
import { storeDonorOffering, loadDonorOfferings, paidOfferingStatus } from '../src/handlers/parish-donor-offerings.js';
import { createFundAllocationResolver } from '../src/lib/fund-reporting.js';
import { sendDonationReceiptMessage } from '../src/payments/donation-receipts.js';
import { initializeLedger } from '../src/accounting/index.js';
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

async function fixture() {
  const db = database();
  db.sqlite.exec(`CREATE TABLE donor_offerings (id TEXT PRIMARY KEY, donor_email TEXT, parish_id TEXT,
    checkout_session_id TEXT, payment_intent_id TEXT, stripe_subscription_id TEXT, status TEXT, payment_status TEXT,
    settlement_profile_id TEXT, created_at TEXT, updated_at TEXT, data TEXT);
    CREATE TABLE accounting_entities(id TEXT, parish_id TEXT, entity_status TEXT);
    CREATE TABLE accounting_databases(id TEXT, accounting_entity_id TEXT, environment TEXT, database_identifier TEXT, provisioning_status TEXT, health_status TEXT);
    CREATE TABLE registrations(reference TEXT,parish_id TEXT,data TEXT,updated_at TEXT,received_at TEXT);
    CREATE TABLE commerce_orders(id TEXT, stripe_payment_intent_id TEXT, total_charged_cents INTEGER);
    INSERT INTO accounting_entities VALUES('entity-a','parish-a','ready');
    INSERT INTO accounting_databases VALUES('db-a','entity-a','production','ledger-a','ready','healthy');`);
  db.sqlite.exec(readFileSync('migrations/0125_donation_receipt_delivery.sql', 'utf8'));
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

try {
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
