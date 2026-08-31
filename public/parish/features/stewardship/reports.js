'use strict';

/* global escapeHtml, fmtDollars, swNumber, gmKpi */
/* exported renderGivingMetrics */

// Visual report summary. All amounts come from the existing giving APIs.
function swReportAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? fmtDollars(value) : '—';
}

function swReportBar(label, value, scale, tone) {
  const available = typeof value === 'number' && Number.isFinite(value);
  const width = available && scale > 0 ? Math.max(0, Math.min(100, (value / scale) * 100)) : 0;
  return `<div class="sw-report-bar-row"><div class="sw-report-bar-label"><span>${escapeHtml(label)}</span><strong>${swReportAmount(value)}</strong></div><div class="sw-report-bar-track" aria-hidden="true"><i class="sw-chart-${tone}" style="width:${width}%"></i></div></div>`;
}

function swReportBudget(s, year) {
  const goal = s.total_pledged_cents;
  const actual = s.total_actual_cents;
  const projection = s.run_rate_cents;
  const hasGoal = goal > 0;
  const hasActual = typeof actual === 'number' && Number.isFinite(actual);
  const elapsed = s.day_of_year > 0 && s.days_in_year > 0 ? Math.min(1, s.day_of_year / s.days_in_year) : null;
  const expected = hasGoal && elapsed !== null ? Math.round(goal * elapsed) : null;
  const difference = expected !== null && hasActual ? actual - expected : null;
  const pct = hasGoal && hasActual ? Math.round((actual / goal) * 100) : null;
  const period = year < new Date().getFullYear() ? 'at year-end' : 'to date';
  const verdict =
    difference === null ? '' : difference === 0 ? 'On pace' : difference > 0 ? 'Ahead of pace' : 'Behind pace';
  const status = verdict
    ? `<span class="sw-report-pace-badge ${difference >= 0 ? 'is-ahead' : 'is-behind'}">${verdict}</span>`
    : '';
  const scale = Math.max(goal || 0, actual || 0, projection || 0, expected || 0, 1);
  const chart = hasGoal
    ? `<div class="sw-report-budget-chart" role="img" aria-label="${escapeHtml(`Collected ${swReportAmount(actual)}. Expected ${period}: ${swReportAmount(expected)}. Projected year-end: ${swReportAmount(projection)}. Annual pledge goal: ${swReportAmount(goal)}. Bars use the same dollar scale.`)}">${swReportBar('Collected', actual, scale, 'green')}${swReportBar('Expected ' + period, expected, scale, 'sand')}${swReportBar('Projected year-end', projection, scale, 'gold')}</div>`
    : '<p class="sw-chart-empty">No annual pledge goal yet. Budget pace will appear once pledges are recorded for this year.</p>';
  return `<section class="sw-report-chart-card"><div class="sw-report-chart-heading"><h3>Budget Pace</h3>${status}</div>
    <div class="sw-report-chart-metric"><strong>${pct === null ? '—' : pct + '%'}</strong><span>of annual pledge goal</span></div>
    ${difference === null ? '' : `<p class="sw-report-pace-note">${difference === 0 ? 'Giving is right on the expected pace.' : `<strong>${fmtDollars(Math.abs(difference))}</strong> ${difference > 0 ? 'ahead of' : 'below'} expected giving ${period}.`}</p>`}
    ${chart}<div class="sw-report-chart-footer"><span>Annual pledge goal</span><strong>${hasGoal ? fmtDollars(goal) : 'Not set'}</strong></div>
    <p class="sw-chart-note">Expected giving follows the elapsed portion of the year. The projection estimates year-end giving at the current pace.</p></section>`;
}

function swReportFunds(f) {
  const funds = (f.funds || [])
    .filter((fund) => fund.total_cents > 0)
    .slice()
    .sort((a, b) => b.total_cents - a.total_cents);
  const total = funds.reduce((sum, fund) => sum + fund.total_cents, 0);
  const rows = funds
    .map((fund, index) => {
      const pct = total > 0 ? (fund.total_cents / total) * 100 : 0;
      const share = pct > 0 && pct < 1 ? '<1%' : Math.round(pct) + '%';
      return `<li class="sw-report-fund"><div class="sw-report-fund-label"><span>${escapeHtml(fund.fund_name)}</span><strong>${fmtDollars(fund.total_cents)}</strong></div><div class="sw-report-fund-bottom"><div class="sw-report-bar-track" aria-hidden="true"><i class="sw-chart-${index === 0 ? 'gold' : 'sand'}" style="width:${pct}%"></i></div><span>${escapeHtml(share)}</span></div></li>`;
    })
    .join('');
  const content = f.error
    ? '<p class="sw-chart-empty">Fund breakdown is temporarily unavailable. The giving totals are still shown above.</p><button type="button" class="sw-action-btn" onclick="loadGivingMetricsPanel()">Try again</button>'
    : rows
      ? `<ul class="sw-report-funds">${rows}</ul>`
      : '<p class="sw-chart-empty">No giving by fund yet. Recorded gifts will appear here with their share of the fund total.</p>';
  return `<section class="sw-report-chart-card"><div class="sw-report-chart-heading"><h3>Giving by Fund</h3><span class="sw-report-chart-caption">Share of fund giving</span></div>
    <div class="sw-report-chart-metric"><strong>${f.error ? '—' : fmtDollars(total)}</strong><span>${f.error ? 'fund total unavailable' : `across ${funds.length} ${funds.length === 1 ? 'fund' : 'funds'}`}</span></div>
    ${content}<p class="sw-chart-note">Recorded AGAPAY gifts by fund. Outside giving is included in the overall collected total, but not this breakdown.</p></section>`;
}

function renderGivingMetrics(s, f, year) {
  const label = year < new Date().getFullYear() ? 'Collected in ' + year : year + ' collected to date';
  const prior =
    typeof s.prior_year_actual_cents === 'number'
      ? `<div class="sw-report-prior"><span>Prior full-year giving · ${year - 1}</span><strong>${fmtDollars(s.prior_year_actual_cents)}</strong><span>For context; current-year giving may cover a shorter period.</span></div>`
      : '';
  return `<div class="sw-report-overview"><div class="sw-report-collected"><span class="sw-report-eyebrow">${escapeHtml(label)}</span><strong>${swReportAmount(s.total_actual_cents)}</strong><span>${swNumber(s.active_donors)} active donors · includes qualified outside giving</span></div>
    <div class="sw-kpi-grid sw-report-kpis">${gmKpi('Annual pledges', swReportAmount(s.total_pledged_cents), swNumber(s.pledging_donors) + ' pledging households')}${gmKpi('Projected year-end', swReportAmount(s.run_rate_cents), 'at the current giving pace')}${gmKpi('Average per donor', swReportAmount(s.avg_per_donor_cents), 'recorded giving per active donor')}</div></div>
    <div class="sw-report-chart-grid">${swReportBudget(s, year)}${swReportFunds(f)}</div>${prior}`;
}
