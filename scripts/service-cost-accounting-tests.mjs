import { processStripeWebhookEvent } from '../src/handlers/stripe.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activationTestDatabase } from './lib/accounting-activation-fixture.mjs';
import {
  serviceInvoiceFacts,
  recordServiceInvoice,
  postServiceInvoices,
  readServiceCosts,
} from '../src/accounting/service-costs.js';
import { initializeLedger } from '../src/accounting/ledger/service.js';
import { statementOfActivities } from '../src/accounting/reports/service.js';
import { accountingFinancialSnapshot } from '../src/handlers/stewardship-accounting-bridge.js';
import { accountingCouncilReport } from '../src/stewardship/council-reports.js';
import { createFundReconciliationFixture } from './lib/fund-reconciliation-fixture.mjs';
import { handleStewardshipFinancials } from '../src/handlers/stewardship-financials.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const central = activationTestDatabase();
central.sqlite.exec('CREATE TABLE stewardship_authoritative_financial_snapshots(id TEXT)');
central.sqlite.exec(read('migrations/0127_agapay_service_costs.sql'));
const env = {
  AGAPAY_DB: central,
  AGAPAY_STRIPE_PRICE_GIVING_79_MONTHLY: 'price_giving',
  AGAPAY_STRIPE_PRICE_STARTER_MONTHLY: 'price_starter',
};
const registration = {
  parishId: 'parish-a',
  stripeSubscriptionId: 'sub_a',
  stripeCustomerId: 'cus_a',
  subscriptionTier: 'parish',
};
const invoice = (id, amount, price = 'price_giving', date = '2026-07-12') => ({
  id,
  amount_paid: amount,
  currency: 'usd',
  status: 'paid',
  customer: 'cus_a',
  parent: { subscription_details: { subscription: 'sub_a' } },
  status_transitions: { paid_at: Date.parse(date) / 1000 },
  lines: { data: [{ pricing: { price_details: { price } } }] },
});
assert.equal(serviceInvoiceFacts(env, invoice('inv_one', 3950), registration).planLabel, 'Give +');
assert.equal(serviceInvoiceFacts(env, invoice('inv_one', 3950), { ...registration, stripeCustomerId: 'other' }), null);
assert.equal(
  serviceInvoiceFacts(env, { ...invoice('inv_one', 3950), metadata: { donor_email: 'donor@test' } }, registration),
  null
);
assert.equal(
  serviceInvoiceFacts(env, invoice('inv_one', 3950), { ...registration, stripeSubscriptionId: 'other' }),
  null
);
assert.throws(() => serviceInvoiceFacts(env, invoice('bad', 1.2), registration), /billing facts/);
central.sqlite.exec('CREATE TABLE registrations(reference TEXT, stripe_subscription_id TEXT, data TEXT)');
central.sqlite.prepare('INSERT INTO registrations VALUES(?,?,?)').run('reg_a', 'sub_a', JSON.stringify(registration));
central.sqlite.exec('UPDATE registrations SET stripe_subscription_id=NULL');
await assert.rejects(
  () =>
    processStripeWebhookEvent(env, {
      type: 'invoice.paid',
      data: { object: { ...invoice('inv_one', 3950), metadata: { agapay_reference: 'reg_a' } } },
    }),
  /retry delivery/
);
central.sqlite.exec("UPDATE registrations SET stripe_subscription_id='sub_a'");
await processStripeWebhookEvent(env, { type: 'invoice.paid', data: { object: invoice('inv_one', 3950) } });
await processStripeWebhookEvent(env, { type: 'invoice.payment_succeeded', data: { object: invoice('inv_one', 3950) } });
await processStripeWebhookEvent(env, {
  type: 'invoice.paid',
  account: 'acct_connected',
  data: { object: invoice('inv_connected', 3950) },
});
assert.equal(central.sqlite.prepare('SELECT COUNT(*) n FROM agapay_service_invoices').get().n, 1);
await recordServiceInvoice(env, invoice('inv_one', 3950), { ...registration, subscriptionTier: 'starter' });
await assert.rejects(() => recordServiceInvoice(env, invoice('inv_one', 7900), registration), /conflicting/);
await recordServiceInvoice(env, invoice('inv_two', 900, 'price_starter', '2026-08-12'), registration);
await recordServiceInvoice(env, invoice('inv_trial', 0), registration);
assert.equal((await readServiceCosts(env, 'parish-a', 2026)).totalCents, 4850);
assert.equal((await readServiceCosts(env, 'parish-b', 2026)).totalCents, 0);

const ledger = activationTestDatabase();
for (const file of [
  '0001_accounting_database_foundation.sql',
  '0002_core_ledger.sql',
  '0003_phase2a_setup_configuration.sql',
  '0005_phase2c_reporting_indexes.sql',
])
  ledger.sqlite.exec(read('accounting-migrations/' + file));
const actor = { id: 'test', capabilities: ['accounting.configure', 'accounting.view', 'accounting.reports.view'] };
await initializeLedger(ledger, { actor, date: new Date('2026-01-01') });
for (const file of [
  '0006_phase2d_give_stripe_integration.sql',
  '0021_phase_n_cash_flow_classification.sql',
  '0026_service_subscription_costs.sql',
])
  ledger.sqlite.exec(read('accounting-migrations/' + file));
ledger.sqlite.exec(
  "UPDATE accounting_integration_settings SET posting_mode='automatic'; UPDATE accounting_periods SET status='open'"
);
await postServiceInvoices(env, ledger, 'parish-a');
await postServiceInvoices(env, ledger, 'parish-a');
assert.equal(
  ledger.sqlite.prepare("SELECT COUNT(*) n FROM accounting_journal_entries WHERE status='posted'").get().n,
  2
);
const report = await statementOfActivities(ledger, { actor, startDate: '2026-01-01', endDate: '2026-12-31' });
assert.equal(report.totals.expenses, 4850);
assert.equal(report.rows.find((row) => row.accountNumber === '5860').amount, 4850);
assert.equal(
  ledger.sqlite.prepare("SELECT SUM(credit_amount) n FROM accounting_journal_lines WHERE account_id='acct_2180'").get()
    .n,
  4850
);
assert.equal(
  ledger.sqlite.prepare("SELECT COUNT(*) n FROM accounting_journal_lines WHERE account_id='acct_1110'").get().n,
  0,
  'service billing must not reduce giving Stripe clearing'
);
assert.match(
  ledger.sqlite.prepare("SELECT description FROM accounting_journal_entries WHERE description LIKE '%inv_one%'").get()
    .description,
  /Give \+/
);

ledger.sqlite.exec("UPDATE accounting_periods SET status='closed' WHERE '2026-09-12' BETWEEN start_date AND end_date");
await recordServiceInvoice(env, invoice('inv_closed', 7900, 'price_giving', '2026-09-12'), registration);
await postServiceInvoices(env, ledger, 'parish-a');
assert.equal(
  central.sqlite.prepare("SELECT accounting_status FROM agapay_service_invoices WHERE invoice_id='inv_closed'").get()
    .accounting_status,
  'exception'
);
ledger.sqlite.exec("UPDATE accounting_periods SET status='open'");
await postServiceInvoices(env, ledger, 'parish-a');
assert.equal(
  central.sqlite.prepare("SELECT accounting_status FROM agapay_service_invoices WHERE invoice_id='inv_closed'").get()
    .accounting_status,
  'posted',
  'reopening period can retry the same draft'
);
ledger.sqlite.exec("UPDATE accounting_integration_settings SET posting_mode='review_required'");
await recordServiceInvoice(env, invoice('inv_review', 7900), registration);
await postServiceInvoices(env, ledger, 'parish-a');
assert.equal(
  central.sqlite.prepare("SELECT accounting_status FROM agapay_service_invoices WHERE invoice_id='inv_review'").get()
    .accounting_status,
  'waiting_for_review'
);
await recordServiceInvoice(env, { ...invoice('inv_currency', 7900), currency: 'eur' }, registration);
await postServiceInvoices(env, ledger, 'parish-a');
assert.equal(
  central.sqlite.prepare("SELECT accounting_status FROM agapay_service_invoices WHERE invoice_id='inv_currency'").get()
    .accounting_status,
  'exception'
);
const snapshot = accountingFinancialSnapshot(report, { rows: [] }, { startDate: '2026-01-01', endDate: '2026-12-31' });
const html = await accountingCouncilReport(
  'Test parish',
  { monthLabel: 'July 2026', monthStart: '2026-07-01', monthEnd: '2026-07-31' },
  snapshot,
  snapshot
).text();
assert.match(html, /AGAPAY service subscription/);
assert.match(html, /Bank & payment processing fees/);
assert.match(html, /\$48.50/);

const f = await createFundReconciliationFixture({ month: '2026-07' });
try {
  for (const file of [
    '0005_stewardship_annual_meetings.sql',
    '0016_manual_income_entries.sql',
    '0049_authoritative_stewardship_financial_snapshots.sql',
    '0050_financial_snapshot_external_assets.sql',
    '0052_restricted_fund_snapshot_adjustments.sql',
    '0127_agapay_service_costs.sql',
  ])
    f.db.exec(read('migrations/' + file));
  f.registration.subscriptionTier = 'parish';
  f.updateRegistration();
  const pid = f.registration.parishId;
  await recordServiceInvoice(f.env, invoice('inv_snapshot', 3950), { ...registration, parishId: pid });
  const request = (body) =>
    new Request(`https://test/api/parish/dashboard/${pid}/stewardship/financials?year=2026`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const get = async () => (await handleStewardshipFinancials(request(), f.env, pid)).json();
  const initial = await get();
  assert.equal(initial.automaticCostsIncluded, true);
  assert.equal(initial.totals.totalExpenseCents, initial.platformCosts.totalCents);
  const save = async (automaticCostsExcluded) => {
    const response = await handleStewardshipFinancials(
      request({ fiscalYear: 2026, totalExpenseCents: 10000, automaticCostsExcluded }),
      f.env,
      pid
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  const auto = await save(true);
  assert.equal(auto.snapshot.totalExpenseCents, 10000 + initial.platformCosts.totalCents);
  assert.equal((await get()).snapshot.totalExpenseCents, auto.snapshot.totalExpenseCents);
  const savedRow = f.db
    .prepare(
      'SELECT total_income_cents,total_expense_cents,net_cents FROM stewardship_authoritative_financial_snapshots'
    )
    .get();
  assert.equal(savedRow.net_cents, savedRow.total_income_cents - savedRow.total_expense_cents);
  const allIn = await save(false);
  assert.equal(allIn.snapshot.totalExpenseCents, 10000, 'existing all-in expenses must not be charged twice');
  assert.equal((await get()).totals.totalExpenseCents, 10000);
} finally {
  f.db.close();
  central.sqlite.close();
  ledger.sqlite.close();
}
console.log(
  'PASS - billed tier, discounted actual amount, deduplication, tenant scope, clearing, closed-period retry, review, currency and automatic versus all-in expense totals'
);
