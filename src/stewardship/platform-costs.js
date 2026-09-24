import { readGivingFeeReport } from '../lib/giving-fee-report.js';
import { readServiceCosts } from '../accounting/service-costs.js';
import { htmlEscape } from '../lib/format.js';

export async function readPlatformCosts(env, parishId, year) {
  const [processing, service] = await Promise.all([
    readGivingFeeReport(env, parishId, year),
    readServiceCosts(env, parishId, year),
  ]);
  return { processing, service, totalCents: processing.annual.actualStripeFeeCents + service.totalCents };
}

export function platformCostTable(costs, { included = false } = {}) {
  if (!costs) return '';
  const money = (value) => (Number(value || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return `<section class="section acct-card"><h2>Processing &amp; AGAPAY service costs</h2>
    <table><thead><tr><th>Expense line</th><th>Calendar-year amount</th></tr></thead><tbody>
    <tr><td>Stripe payment processing · confirmed giving fees</td><td>${money(costs.processing.annual.actualStripeFeeCents)}</td></tr>
    <tr><td>AGAPAY service subscription · paid invoices</td><td>${money(costs.service.totalCents)}</td></tr></tbody></table>
    <p>${included ? 'These costs are included in total expenses automatically. Enter other parish expenses separately.' : 'The saved expense total uses an all-in basis. These details are not added again; review that your saved total includes them.'}</p>
    <p>Donor fee coverage remains contribution income; the full processing cost remains an expense. Service charges use actual paid invoices, including the billed tier, discounts and prorations, and are separate from processing.</p>
    ${costs.service.invoices.length ? `<details><summary>Service invoice detail</summary><table><thead><tr><th>Paid</th><th>Plan / invoice</th><th>Amount</th><th>Accounting</th></tr></thead><tbody>${costs.service.invoices.map((row) => `<tr><td>${htmlEscape(row.paid_at.slice(0, 10))}</td><td>${htmlEscape(row.plan_label)} · ${htmlEscape(row.invoice_id)}</td><td>${htmlEscape(row.currency)} ${(row.amount_cents / 100).toFixed(2)}</td><td>${htmlEscape(row.accounting_status.replaceAll('_', ' '))}</td></tr>`).join('')}</tbody></table></details>` : '<p>No paid service invoices have been captured for this year.</p>'}
    <p class="muted">Service invoices are captured from activation of automatic billing accounting. Earlier invoices, refunds and credit notes require reconciliation. Subscription payments use the payment date. Processing uses the gift date; estimates, Commerce fees and ${costs.processing.excludedCurrencyCount + costs.service.excludedCurrencyCount} non-USD records are excluded from this snapshot breakdown. Accounting reports use posted ledger entries instead.</p></section>`;
}

export function ledgerCostTable(monthly, yearToDate, money) {
  const cost = (data, number) =>
    (data.expenseLines || [])
      .filter((row) => row.accountNumber === number)
      .reduce((sum, row) => sum + Number(row.amount), 0);
  const lines = [
    ['5840', 'Bank & payment processing fees'],
    ['5850', 'AGAPAY transaction fees'],
    ['5860', 'AGAPAY service subscription'],
  ];
  return `<section><h2>Processing &amp; platform expenses</h2><div class="table-wrap"><table><thead><tr><th>Expense line</th><th>This month</th><th>Year to date</th></tr></thead><tbody>${lines.map(([number, label]) => `<tr><td>${label}</td><td>${money(cost(monthly, number) / 100)}</td><td>${money(cost(yearToDate, number) / 100)}</td></tr>`).join('')}</tbody></table></div><p class="note">Included in total expenses above. Processing includes the full fee even when donors fund it. AGAPAY service subscriptions are separate from transaction fees. Subscription entries use paid invoice amounts and the billed plan. Match the bank or card payment to AGAPAY Billing Clearing (2180), without recording the expense twice. Review unposted invoices in Accounting integrations; closed periods and review requirements still apply. These lines use standard accounts 5840–5860; fees mapped to custom accounts remain in total expenses.</p></section>`;
}
