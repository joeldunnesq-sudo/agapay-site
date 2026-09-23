'use strict';

/* global escapeHtml */
/* exported renderStewardshipFees, selectStewardshipFeePeriod */

function selectStewardshipFeePeriod(button, period) {
  const card = button.closest('.sw-fees');
  card.querySelectorAll('[data-fee-period]').forEach((panel) => {
    panel.hidden = panel.dataset.feePeriod !== period;
  });
  card.querySelectorAll('[data-fee-tab]').forEach((tab) => {
    tab.setAttribute('aria-pressed', String(tab === button));
  });
}

function renderStewardshipFees(report) {
  if (!report?.annual) return '<p class="sw-chart-note">Processing fee details are not available yet.</p>';
  const money = (value) =>
    (Number(value || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: report.currency || 'USD' });
  const a = report.annual;
  const coverage = a.actualStripeFeeCents
    ? Math.round((a.donorFundedStripeFeeCents / a.actualStripeFeeCents) * 100)
    : null;
  const table = (rows) =>
    `<div class="sw-fees-scroll"><table class="sw-fees-table"><caption class="sr-only">Stripe processing fees by period</caption><thead><tr><th scope="col">Period</th><th scope="col">Stripe fees</th><th scope="col">Donor funded</th><th scope="col">Parish funded</th><th scope="col">Awaiting fees</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${money(row.actualStripeFeeCents)}</td><td class="sw-fees-donor">${money(row.donorFundedStripeFeeCents)}</td><td>${money(row.parishFundedStripeFeeCents)}</td><td>${Number(row.pendingCount || 0)} gifts</td></tr>`).join('')}</tbody></table></div>`;
  const panels = [
    ['yearly', [a]],
    ['quarterly', report.quarterly],
    ['monthly', report.monthly],
  ];
  return `<section class="sw-fees" aria-label="Stripe processing fees">
    <div class="sw-fees-heading"><div><span class="sw-fees-eyebrow">The cost of giving</span><h3>Every gift. Every fee.</h3><p>How donor generosity offsets the parish’s Stripe processing costs.</p></div><span class="sw-fees-year">${escapeHtml(String(report.year))}</span></div>
    <div class="sw-fees-kpis"><div><span>Confirmed Stripe fees</span><strong>${money(a.actualStripeFeeCents)}</strong><small>${a.confirmedCount} reconciled gifts</small></div><div><span>Funded by donors</span><strong>${money(a.donorFundedStripeFeeCents)}</strong><small>From voluntary additional gifts</small></div><div><span>Funded by the parish</span><strong>${money(a.parishFundedStripeFeeCents)}</strong><small>Remaining processing cost</small></div></div>
    ${coverage === null ? '<p class="sw-fees-note">No confirmed Stripe processing costs for this year yet.</p>' : `<div class="sw-fees-coverage"><div><strong>${coverage}%</strong><span>of confirmed processing costs funded by donors</span></div><div class="sw-fees-bar" role="img" aria-label="Donors funded ${coverage}% of confirmed Stripe fees"><i style="width:${coverage}%"></i></div></div>`}
    <div class="sw-fees-tabs" role="group" aria-label="Fee reporting period">${panels.map(([key]) => `<button type="button" data-fee-tab="${key}" aria-pressed="${key === 'yearly'}" onclick="selectStewardshipFeePeriod(this, '${key}')">${key[0].toUpperCase() + key.slice(1)}</button>`).join('')}</div>
    ${panels.map(([key, rows]) => `<div data-fee-period="${key}" ${key === 'yearly' ? '' : 'hidden'}>${table(rows || [])}</div>`).join('')}
    <p class="sw-fees-note">Donors contributed <strong>${money(a.donorFeeContributionCents)}</strong> toward processing costs. ${a.excessCoverageCents ? `${money(a.excessCoverageCents)} of retained coverage exceeds confirmed fees and remains a contribution. ` : ''}${a.pendingCount ? `<strong>${a.pendingCount} gifts await reconciliation</strong> (${money(a.estimatedStripeFeeCents)} estimated fees, excluded from confirmed totals). ` : ''}${a.refundedCents ? `${money(a.refundedCents)} in recorded refunds; returned coverage is allocated to the parish share. ` : ''}Fee totals cover AGAPAY giving in USD, grouped by gift date; they exclude Commerce, subscription charges, and separate Stripe adjustments.${report.excludedCurrencyCount ? ` ${report.excludedCurrencyCount} non-USD gifts are excluded.` : ''}</p>
  </section>`;
}
