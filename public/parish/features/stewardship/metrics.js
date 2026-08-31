'use strict';

/* global currentParish, stewardshipApi, authHeaders, checkNudgeEligibility, escapeHtml,
  parishSessionStorageKey, renderGivingMetrics */
/* exported loadGivingMetricsPanel, loadStewardshipHealthScorePanel, loadDonorConcentrationPanel,
  loadRecurringGivingPanel, loadGivingIntelligencePanels, openStewardshipMonthlyReport */

// Giving metrics, health, concentration, recurring gifts, and monthly reports.
// Read shared parish identity and authentication only when actions run.

// ── Giving Metrics Panel ─────────────────────────────────────────────────
let givingMetricsState = { loaded: false, year: new Date().getFullYear() };

async function loadGivingMetricsPanel(year) {
  const pane = document.getElementById('givingMetricsPane');
  if (!pane || !currentParish) return;
  if (year) givingMetricsState.year = year;
  if (!pane.querySelector('.sw-kpi-grid')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const y = givingMetricsState.year;
    const base = stewardshipApi().replace('/stewardship', '/stewardship/giving');
    const [summaryRes, fundsRes] = await Promise.all([
      fetch(base + '/summary?year=' + y, { headers: authHeaders() }),
      fetch(base + '/funds?year=' + y, { headers: authHeaders() }),
    ]);
    const summary = await summaryRes.json().catch(() => ({}));
    let funds = await fundsRes.json().catch(() => ({}));
    if (!summaryRes.ok)
      throw new Error(summary.detail || summary.error || `Giving summary failed (${summaryRes.status}).`);
    if (!fundsRes.ok) {
      funds = {
        funds: [],
        total_cents: 0,
        error: funds.detail || funds.error || `Giving funds failed (${fundsRes.status}).`,
      };
    }
    if (summary.error && summary.error.includes('not activated')) {
      pane.innerHTML = renderGivingMetricsUpgrade();
      return;
    }
    givingMetricsState.loaded = true;
    pane.innerHTML = renderGivingMetrics(summary, funds, y);
    // Background check — enable nudge button only if donors are 3+ months behind
    checkNudgeEligibility();
  } catch (e) {
    pane.innerHTML =
      '<p class="muted">Giving metrics unavailable' + (e.message ? ': ' + escapeHtml(e.message) : '.') + '</p>';
  }
}

function fmtDollars(cents) {
  return '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Keep missing percentages distinct from a measured zero.
function swPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function swNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
}

function swMetric(value, label, secondary = '') {
  return `<div class="sw-intelligence-metric"><div><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>${secondary}</div>`;
}

function swStackedChart(segments, description) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return '<p class="sw-chart-empty">No giving recorded for this comparison yet.</p>';
  const bars = segments
    .map((s) => `<span class="sw-chart-segment sw-chart-${s.tone}" style="width:${(s.value / total) * 100}%"></span>`)
    .join('');
  const legend = segments
    .map(
      (s) =>
        `<li><i class="sw-chart-${s.tone}" aria-hidden="true"></i><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.display ?? swNumber(s.value))}</strong></li>`
    )
    .join('');
  return `<div class="sw-stacked-chart" role="img" aria-label="${escapeHtml(description)}">${bars}</div><ul class="sw-chart-legend">${legend}</ul>`;
}

async function loadGivingIntelligencePanels(year) {
  const y = year || givingMetricsState.year;
  await Promise.all(
    [
      ['stewardshipDistributionPane', '/giving/distribution', renderGivingDistribution],
      ['stewardshipRetentionPane', '/giving/retention', renderDonorRetention],
    ].map(async ([id, endpoint, render]) => {
      const pane = document.getElementById(id);
      if (!pane || !currentParish) return;
      const parishId = currentParish.parishId;
      pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
      try {
        const res = await fetch(stewardshipApi(endpoint + '?year=' + y), { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.detail || data.error || 'Please try again.');
        if (currentParish?.parishId !== parishId) return;
        pane.innerHTML = render(data);
      } catch {
        if (currentParish?.parishId !== parishId) return;
        pane.innerHTML =
          '<p class="sw-chart-empty">This giving insight is unavailable right now.</p><button type="button" class="sw-action-btn" onclick="loadGivingIntelligencePanels()">Try again</button>';
      }
    })
  );
}

function renderGivingDistribution(d) {
  if (!Array.isArray(d.tiers) || !d.total_donors) {
    return '<p class="sw-chart-empty">No giving recorded yet. Donor counts by annual giving level will appear here.</p>';
  }
  const max = Math.max(1, ...d.tiers.map((t) => t.count));
  const labels = ['Under $500', '$500–2k', '$2–5k', '$5–10k', '$10k+'];
  const chart = d.tiers
    .map(
      (t, i) =>
        `<div class="sw-distribution-column"><div class="sw-distribution-track"><div class="sw-distribution-bar" style="height:${(t.count / max) * 100}%"><strong>${swNumber(t.count)}</strong></div></div><span>${escapeHtml(labels[i] || t.label)}</span></div>`
    )
    .join('');
  const description = d.tiers.map((t, i) => `${labels[i] || t.label}: ${t.count} donors`).join('; ');
  return (
    swMetric(
      swNumber(d.total_donors),
      'giving donors',
      `<span class="sw-chart-period">${escapeHtml(String(d.fiscal_year || givingMetricsState.year))} giving</span>`
    ) +
    `<div class="sw-distribution-chart" role="img" aria-label="${escapeHtml(description)}">${chart}</div>` +
    '<p class="sw-chart-note">Number of donors by total annual giving. Each donor appears in one band.</p>'
  );
}

function renderDonorRetention(d) {
  const rate = swPercent(d.retention_rate_pct);
  const retained = d.retained || 0;
  const newDonors = d.new_donors || 0;
  const lapsed = d.lapsed || 0;
  return (
    swMetric(
      rate === null ? '—' : rate + '%',
      'donor retention',
      `<span class="sw-chart-period">${escapeHtml(String(d.prior_year || givingMetricsState.year - 1))} → ${escapeHtml(String(d.fiscal_year || givingMetricsState.year))}</span>`
    ) +
    swStackedChart(
      [
        { label: 'Retained', value: retained, tone: 'green' },
        { label: 'New', value: newDonors, tone: 'gold' },
        { label: 'Lapsed', value: lapsed, tone: 'sand' },
      ],
      `${retained} retained, ${newDonors} new, ${lapsed} lapsed donors. Bar shows donor counts across both years.`
    ) +
    `<p class="sw-chart-note">${rate === null ? 'No prior-year donors to compare yet.' : `${swNumber(retained)} of ${swNumber(d.prior_donors)} prior-year donors have given again.`} Lapsed means no recorded gift in the selected year.</p>`
  );
}

function gmKpi(label, value, sub) {
  return (
    '<div class="sw-kpi-card">' +
    '<span class="sw-kpi-label">' +
    label +
    '</span>' +
    '<strong class="sw-kpi-value">' +
    value +
    '</strong>' +
    '<span class="sw-kpi-sub">' +
    sub +
    '</span>' +
    '</div>'
  );
}

function renderGivingMetricsUpgrade() {
  return (
    '<div class="sw-upgrade-nudge">' +
    '<p>Stewardship reports are included with the Stewardship and Parish plans.</p>' +
    '<button type="button" class="sw-upgrade-btn" onclick="switchTab(\'settings\')">Review parish tier</button>' +
    '</div>'
  );
}

// page of disconnected numbers.
async function loadStewardshipHealthScorePanel(year) {
  const pane = document.getElementById('stewardshipHealthScorePane');
  if (!pane || !currentParish) return;
  if (!pane.querySelector('.sw-health-score-row')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const y = year || givingMetricsState.year;
    const res = await fetch(stewardshipApi('/giving/health-score?year=' + y), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `Health score failed (${res.status}).`);
    if (data.error && data.error.includes('not activated')) {
      pane.innerHTML = renderGivingMetricsUpgrade();
      return;
    }
    pane.innerHTML = renderStewardshipHealthScore(data);
  } catch (e) {
    pane.innerHTML =
      '<p class="muted">Stewardship health score unavailable' +
      (e.message ? ': ' + escapeHtml(e.message) : '.') +
      '</p>';
  }
}

function renderStewardshipHealthScore(d) {
  const score = swPercent(d.score);
  const tone = score === null ? 'gold' : score >= 80 ? 'green' : score >= 60 ? 'gold' : 'red';

  const componentTips = {
    pledge_fulfillment:
      'Pledges are behind where they should be by now — a personal reminder to households who pledged usually works better than a mass email.',
    recurring_stability:
      'Recurring gifts are failing or being canceled — reaching out to update payment info can recover this before it becomes a bigger gap.',
    donor_retention:
      'Fewer of last year\u2019s donors have given again this year — a short personal check-in tends to bring people back faster than a form letter.',
    lapsed_donors:
      'A number of last year\u2019s donors haven\u2019t given yet this year — a warm, specific "we missed you" note outperforms a generic reminder.',
    year_end_projection:
      'At the current pace, giving is on track to fall short of the annual goal — a mid-year appeal or campaign can close the gap before year-end.',
    concentration_risk:
      'A large share of annual giving comes from just a few households — growing the base of regular, smaller donors reduces how exposed the parish is if one household\u2019s giving changes.',
  };
  const statusExplainer = {
    'On Track': 'Giving, retention, and recurring gifts are all healthy — no urgent follow-up needed this month.',
    'Needs Attention':
      'One or more of the signals below is starting to slip. Nothing urgent yet, but worth a look before it becomes a bigger gap.',
    'At Risk':
      'Multiple signals below are struggling at once. The tips under each low score are the fastest way to move this number.',
    'Not enough data yet':
      'This parish doesn\u2019t have enough giving history yet — the score fills in automatically as the year of data builds up.',
  };

  const chips = (d.components || [])
    .map((c) => {
      const isLow = c.score < 75;
      const tip = componentTips[c.key] || '';
      return (
        '<div class="sw-health-chip' +
        (isLow ? ' sw-health-chip--low' : '') +
        '">' +
        '<div class="sw-health-chip-top">' +
        '<span class="sw-health-chip-label">' +
        escapeHtml(c.label) +
        '</span>' +
        '<span class="sw-health-chip-score tone-' +
        (c.score >= 75 ? 'green' : c.score >= 50 ? 'gold' : 'red') +
        '">' +
        c.score +
        '</span>' +
        '</div><div class="sw-signal-track" aria-hidden="true"><i style="width:' +
        (swPercent(c.score) || 0) +
        '%"></i></div>' +
        (isLow && tip ? '<p class="sw-health-chip-tip">' + escapeHtml(tip) + '</p>' : '') +
        '</div>'
      );
    })
    .join('');

  const explainer = statusExplainer[d.status] || '';

  return (
    '<div class="sw-health-score-row">' +
    '<div class="sw-health-score-badge tone-' +
    tone +
    '" style="--sw-score:' +
    (score || 0) +
    '%">' +
    '<strong>' +
    (score === null ? '—' : score) +
    '</strong>' +
    '<span>/ 100</span>' +
    '</div>' +
    '<div class="sw-health-score-copy">' +
    '<div class="sw-health-score-headline">' +
    escapeHtml(d.status || (score === null ? 'Not enough data yet' : 'Stewardship health score')) +
    '</div>' +
    '<p class="sw-health-score-sub">' +
    (d.components && d.components.length
      ? 'Calculated from ' +
        d.components.length +
        ' giving signals. Open the breakdown to see what is working and where to follow up.'
      : escapeHtml(explainer)) +
    '</p>' +
    '</div>' +
    '</div>' +
    (chips
      ? '<details class="sw-health-details"><summary>Explore the health score <span>' +
        d.components.length +
        ' signals</span></summary><div class="sw-health-chips">' +
        chips +
        '</div>'
      : '') +
    (chips
      ? '<p class="sw-health-score-footnote">Each signal is scored out of 100. Scores under 75 include a suggestion for follow-up.</p></details>'
      : '')
  );
}

// ── Donor Concentration Risk Panel ──────────────────────────────────────
// The same anonymous giving data, ranked to show dependence on top households.
async function loadDonorConcentrationPanel(year) {
  const pane = document.getElementById('stewardshipConcentrationPane');
  if (!pane || !currentParish) return;
  if (!pane.querySelector('.sw-concentration-row')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const y = year || givingMetricsState.year;
    const res = await fetch(stewardshipApi('/giving/concentration?year=' + y), { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Concentration data unavailable.');
    if (data.error && data.error.includes('not activated')) {
      pane.innerHTML = renderGivingMetricsUpgrade();
      return;
    }
    pane.innerHTML = renderDonorConcentration(data);
  } catch {
    pane.innerHTML = '<p class="muted">Concentration data unavailable.</p>';
  }
}

function renderDonorConcentration(d) {
  if (!d.total_donors) {
    return '<p class="muted" style="font-size:.85rem;">No giving recorded yet for this fiscal year.</p>';
  }
  const riskLabel = d.risk_level === 'high' ? 'Fragile' : d.risk_level === 'moderate' ? 'Watch' : 'Diversified';
  const riskTone = d.risk_level === 'high' ? 'red' : d.risk_level === 'moderate' ? 'gold' : 'green';
  const top10 = swPercent(d.top10_pct);
  return (
    '<div class="sw-concentration-row">' +
    '<div class="sw-concentration-stat">' +
    '<strong>' +
    (d.top5_pct === null ? '—' : d.top5_pct + '%') +
    '</strong>' +
    '<span>Top 5 households provide</span>' +
    '</div>' +
    '<div class="sw-concentration-stat">' +
    '<strong>' +
    (d.top10_pct === null ? '—' : d.top10_pct + '%') +
    '</strong>' +
    '<span>Top 10 households provide</span>' +
    '</div>' +
    '</div>' +
    '<div class="sw-concentration-risk-badge tone-' +
    riskTone +
    '">' +
    riskLabel +
    '</div>' +
    (top10 === null
      ? '<p class="sw-chart-empty">Giving shares are not available yet.</p>'
      : swStackedChart(
          [
            { label: 'Top 10 households', value: top10, display: top10 + '%', tone: 'gold' },
            { label: 'Everyone else', value: 100 - top10, display: 100 - top10 + '%', tone: 'pale' },
          ],
          `Top 10 households provide ${top10}% of giving; everyone else provides ${100 - top10}%.`
        )) +
    '<p class="muted" style="font-size:.72rem;margin:.6rem 0 0;">Based on ' +
    d.total_donors +
    ' giving household' +
    (d.total_donors === 1 ? '' : 's') +
    ' this fiscal year. No individual identities shown.</p>'
  );
}

// ── Recurring Giving Health Panel ───────────────────────────────────────
async function loadRecurringGivingPanel(year) {
  const pane = document.getElementById('stewardshipRecurringPane');
  if (!pane || !currentParish) return;
  if (!pane.querySelector('.sw-recurring-kpi-grid')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const y = year || givingMetricsState.year;
    const res = await fetch(stewardshipApi('/giving/recurring?year=' + y), { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Recurring giving data unavailable.');
    if (data.error && data.error.includes('not activated')) {
      pane.innerHTML = renderGivingMetricsUpgrade();
      return;
    }
    pane.innerHTML = renderRecurringGiving(data);
  } catch {
    pane.innerHTML = '<p class="muted">Recurring giving data unavailable.</p>';
  }
}

function renderRecurringGiving(d) {
  const pct = swPercent(d.pct_of_total_giving_recurring);
  return (
    swMetric(
      pct === null ? '—' : pct + '%',
      'of giving is recurring',
      `<span class="sw-chart-period">${escapeHtml(String(d.fiscal_year || givingMetricsState.year))} giving</span>`
    ) +
    (pct === null
      ? '<p class="sw-chart-empty">A giving split will appear when gift totals are available.</p>'
      : swStackedChart(
          [
            { label: 'Recurring', value: pct, display: pct + '%', tone: 'green' },
            { label: 'One-time', value: 100 - pct, display: 100 - pct + '%', tone: 'sand' },
          ],
          `Recurring gifts are ${pct}% of total giving; one-time gifts are ${100 - pct}%.`
        )) +
    '<div class="sw-recurring-kpi-grid">' +
    gmKpi('Active donors', swNumber(d.recurring_donor_count), 'recurring') +
    gmKpi('Monthly Revenue', fmtDollars(d.monthly_recurring_revenue_cents), 'recurring, normalized to monthly') +
    gmKpi('Average gift', fmtDollars(d.avg_recurring_gift_cents), 'monthly-equivalent') +
    '</div>' +
    '<div class="sw-recurring-alert-row">' +
    '<div class="sw-recurring-alert' +
    (d.failed_payments_90d > 0 ? ' sw-recurring-alert--warn' : '') +
    '">' +
    '<strong>' +
    swNumber(d.failed_payments_90d) +
    '</strong><span>Failed payments (90d)</span>' +
    '</div>' +
    '<div class="sw-recurring-alert' +
    (d.canceled_gifts_90d > 0 ? ' sw-recurring-alert--warn' : '') +
    '">' +
    '<strong>' +
    swNumber(d.canceled_gifts_90d) +
    '</strong><span>Canceled gifts (90d)</span>' +
    '</div>' +
    '</div>'
  );
}

function stewardshipMonthlyReportUrl() {
  const token =
    document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
  const url = new URL(
    '/api/parish/dashboard/' + encodeURIComponent(currentParish?.parishId || '') + '/stewardship/report/monthly',
    window.location.origin
  );
  url.searchParams.set('year', String(givingMetricsState.year || new Date().getFullYear()));
  url.searchParams.set('t', token);
  return url.pathname + url.search;
}

function openStewardshipMonthlyReport() {
  if (!currentParish) return;
  window.open(stewardshipMonthlyReportUrl(), '_blank');
}
