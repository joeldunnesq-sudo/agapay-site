import { htmlEscape } from '../lib/format.js';

export function givingFeeReportHtml(report) {
  if (!report?.annual) return '';
  const money = (value) =>
    (Number(value || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: report.currency });
  const a = report.annual;
  const rows = [...report.quarterly, ...report.monthly];
  return `<link rel="stylesheet" href="/styles/stewardship-fees.css?v=20260923fees1" />
  <section class="sw-fees" aria-label="Stripe processing fees">
    <div class="sw-fees-heading"><div><span class="sw-fees-eyebrow">The cost of giving</span><h3>Every gift. Every fee.</h3><p>Calendar-year Stripe costs and the generosity that funds them.</p></div><span class="sw-fees-year">${report.year}</span></div>
    <div class="sw-fees-kpis"><div><span>Confirmed Stripe fees</span><strong>${money(a.actualStripeFeeCents)}</strong><small>${a.confirmedCount} reconciled gifts</small></div><div><span>Funded by donors</span><strong>${money(a.donorFundedStripeFeeCents)}</strong><small>Voluntary additional gifts</small></div><div><span>Funded by the parish</span><strong>${money(a.parishFundedStripeFeeCents)}</strong><small>Remaining processing cost</small></div></div>
    <div class="sw-fees-scroll"><table class="sw-fees-table"><thead><tr><th>Period</th><th>Stripe fees</th><th>Donor funded</th><th>Parish funded</th><th>Awaiting fees</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${htmlEscape(r.label)}</th><td>${money(r.actualStripeFeeCents)}</td><td class="sw-fees-donor">${money(r.donorFundedStripeFeeCents)}</td><td>${money(r.parishFundedStripeFeeCents)}</td><td>${r.pendingCount} gifts</td></tr>`).join('')}</tbody></table></div>
    <p class="sw-fees-note">Donors contributed ${money(a.donorFeeContributionCents)} toward processing costs; ${money(a.excessCoverageCents)} of retained coverage exceeds confirmed fees and remains a contribution. ${a.pendingCount} gifts await reconciliation (${money(a.estimatedStripeFeeCents)} estimated fees, excluded from confirmed totals). Fees are grouped by gift date across this calendar year. Recorded refunds: ${money(a.refundedCents)}; returned coverage is allocated to the parish share. USD AGAPAY giving only; Commerce, subscriptions, separate Stripe adjustments, and ${report.excludedCurrencyCount} non-USD gifts are excluded. This fee detail supplements the financial report and must not be added to expenses a second time.</p>
  </section>`;
}

export async function appendGivingFeeReport(response, report) {
  const html = await response.text();
  const section = givingFeeReportHtml(report);
  const closing = html.includes('</main>') ? '</main>' : '</body>';
  return new Response(html.replace(closing, `${section}${closing}`), {
    status: response.status,
    headers: response.headers,
  });
}
