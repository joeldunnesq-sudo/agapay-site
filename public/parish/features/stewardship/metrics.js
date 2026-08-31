'use strict';

/* global currentParish, stewardshipApi, authHeaders, checkNudgeEligibility, escapeHtml,
  parishSessionStorageKey */
/* exported loadGivingMetricsPanel, loadStewardshipHealthScorePanel, loadDonorConcentrationPanel,
  loadRecurringGivingPanel, openStewardshipMonthlyReport */

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

function swRing(pct, tone, valueLabel, subLabel) {
  const clamped = Math.max(0, Math.min(100, pct));
  const circumference = 2 * Math.PI * 26;
  const dash = (clamped / 100) * circumference;
  return (
    '<div class="sw-ring-row">' +
    '<svg class="sw-ring-svg" viewBox="0 0 60 60">' +
    '<circle class="sw-ring-track" cx="30" cy="30" r="26"/>' +
    '<circle class="sw-ring-fill tone-' +
    tone +
    '" cx="30" cy="30" r="26" ' +
    'stroke-dasharray="' +
    dash.toFixed(1) +
    ' ' +
    circumference.toFixed(1) +
    '"/>' +
    '</svg>' +
    '<div class="sw-ring-copy"><strong>' +
    escapeHtml(valueLabel) +
    '</strong><span>' +
    escapeHtml(subLabel) +
    '</span></div>' +
    '</div>'
  );
}

function renderGivingMetrics(s, f, year) {
  const pct =
    s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.total_actual_cents / s.total_pledged_cents) * 100)) : 0;
  const rrPct =
    s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.run_rate_cents / s.total_pledged_cents) * 100)) : 0;
  const yoy =
    s.prior_year_actual_cents > 0
      ? Math.round(((s.total_actual_cents - s.prior_year_actual_cents) / s.prior_year_actual_cents) * 100)
      : null;
  const yoyHtml =
    yoy !== null
      ? '<span class="sw-yoy sw-yoy-' +
        (yoy >= 0 ? 'up' : 'down') +
        '">' +
        (yoy >= 0 ? '▲' : '▼') +
        ' ' +
        Math.abs(yoy) +
        '% vs prior year</span>'
      : '';

  // Budget Pace — the annual pledge total treated as the giving goal,
  // pro-rated against how far through the fiscal year today is. This is
  // what turns "projected year-end: $218,000" from a number nobody can
  // evaluate into a clear behind/ahead-of-pace verdict.
  let budgetPaceHtml = '';
  if (s.total_pledged_cents > 0 && s.day_of_year && s.days_in_year) {
    const expectedByTodayCents = Math.round(s.total_pledged_cents * (s.day_of_year / s.days_in_year));
    const behindPaceCents = expectedByTodayCents - s.total_actual_cents;
    const isBehind = behindPaceCents > 0;
    budgetPaceHtml =
      '<div class="sw-fin-section-label" style="margin-top:1.1rem;">Budget Pace</div>' +
      '<div class="sw-budget-pace-grid">' +
      gmKpi('Annual Goal', fmtDollars(s.total_pledged_cents), 'fiscal year ' + year) +
      gmKpi('Expected by Today', fmtDollars(expectedByTodayCents), 'pro-rated to date') +
      gmKpi('Actual Collected', fmtDollars(s.total_actual_cents), '') +
      gmKpi(isBehind ? 'Behind Pace' : 'Ahead of Pace', fmtDollars(Math.abs(behindPaceCents)), '') +
      gmKpi(
        'Projected Year-End',
        fmtDollars(s.run_rate_cents),
        s.run_rate_cents >= s.total_pledged_cents ? 'on track to meet goal' : 'short of goal at this pace'
      ) +
      '</div>';
  }

  const fundRows = (f.funds || [])
    .filter((fd) => fd.total_cents > 0)
    .map(
      (fd) =>
        '<tr class="sw-fund-row">' +
        '<td class="sw-fund-name">' +
        escapeHtml(fd.fund_name) +
        '</td>' +
        '<td class="sw-fund-total">' +
        fmtDollars(fd.total_cents) +
        '</td>' +
        '<td class="sw-fund-pct">' +
        fd.pct_of_total +
        '%' +
        '<span class="sw-fund-bar"><i style="width:' +
        Math.min(100, fd.pct_of_total) +
        '%"></i></span>' +
        '</td>' +
        '</tr>'
    )
    .join('');

  const ringTone = pct >= 90 ? 'green' : pct >= 60 ? 'gold' : 'red';
  const ringHtml = s.total_pledged_cents > 0 ? swRing(pct, ringTone, pct + '%', 'of pledge goal') : '';

  return (
    ringHtml +
    '<div class="sw-kpi-grid">' +
    gmKpi('Collected', fmtDollars(s.total_actual_cents), yoyHtml || s.active_donors + ' donors') +
    gmKpi('Pledged', fmtDollars(s.total_pledged_cents), s.pledging_donors + ' pledging households') +
    gmKpi('Fulfillment', s.fulfillment_rate_pct !== null ? s.fulfillment_rate_pct + '%' : '—', 'of pledge goal') +
    gmKpi('Avg / Donor', fmtDollars(s.avg_per_donor_cents), s.active_donors + ' active this year') +
    '</div>' +
    budgetPaceHtml +
    (s.total_pledged_cents > 0
      ? '<div class="sw-progress-block">' +
        '<div class="sw-progress-label"><span>Collected vs pledge goal</span><strong>' +
        pct +
        '%</strong></div>' +
        '<div class="sw-progress-track"><div class="sw-progress-fill" style="width:' +
        pct +
        '%"></div></div>' +
        '<div class="sw-progress-label sw-progress-label--runrate"><span>Run-rate projection</span><strong>' +
        fmtDollars(s.run_rate_cents) +
        '</strong></div>' +
        '<div class="sw-progress-track"><div class="sw-progress-fill sw-progress-fill--dim" style="width:' +
        rrPct +
        '%"></div></div>' +
        '</div>'
      : '') +
    (fundRows
      ? '<div class="sw-fund-table-wrap">' +
        '<table class="sw-fund-table">' +
        '<thead><tr><th>Fund</th><th class="sw-th-right">Total</th><th class="sw-th-right">Share</th></tr></thead>' +
        '<tbody>' +
        fundRows +
        '</tbody>' +
        '</table>' +
        '</div>'
      : '')
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
  const score = d.score;
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
        '</div>' +
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
    '">' +
    '<strong>' +
    (score === null ? '—' : score) +
    '</strong>' +
    '<span>/ 100</span>' +
    '</div>' +
    '<div class="sw-health-score-copy">' +
    '<div class="sw-health-score-headline">Stewardship Health: ' +
    (score === null ? '—' : score + '/100') +
    ' — ' +
    escapeHtml(d.status) +
    '</div>' +
    '<p class="sw-health-score-sub">' +
    (d.components && d.components.length
      ? 'Calculated from ' +
        d.components.length +
        ' signal' +
        (d.components.length === 1 ? '' : 's') +
        ' below. ' +
        escapeHtml(explainer)
      : escapeHtml(explainer)) +
    '</p>' +
    '</div>' +
    '</div>' +
    (chips ? '<div class="sw-health-chips">' + chips + '</div>' : '') +
    (chips
      ? '<p class="sw-health-score-footnote">Each score below is out of 100. Anything under 75 shows a specific suggestion for what would help most.</p>'
      : '')
  );
}

// ── Donor Concentration Risk Panel ──────────────────────────────────────
// Replaces the tier-histogram Giving Distribution card. Same anonymized
// source data, ranked instead of bucketed — "top 5 households give 41%"
// is the number a parish council actually needs to gauge fragility.
async function loadDonorConcentrationPanel(year) {
  const pane = document.getElementById('stewardshipConcentrationPane');
  if (!pane || !currentParish) return;
  if (!pane.querySelector('.sw-concentration-row')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const y = year || givingMetricsState.year;
    const res = await fetch(stewardshipApi('/giving/concentration?year=' + y), { headers: authHeaders() });
    const data = await res.json();
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
  return (
    '<div class="sw-recurring-kpi-grid">' +
    gmKpi('Recurring Donors', d.recurring_donor_count, 'giving on a schedule') +
    gmKpi('Monthly Revenue', fmtDollars(d.monthly_recurring_revenue_cents), 'recurring, normalized to monthly') +
    gmKpi('Avg Recurring Gift', fmtDollars(d.avg_recurring_gift_cents), 'per donor, monthly-equivalent') +
    gmKpi(
      '% of Giving Recurring',
      d.pct_of_total_giving_recurring === null ? '—' : d.pct_of_total_giving_recurring + '%',
      'of total giving this year'
    ) +
    '</div>' +
    '<div class="sw-recurring-alert-row">' +
    '<div class="sw-recurring-alert' +
    (d.failed_payments_90d > 0 ? ' sw-recurring-alert--warn' : '') +
    '">' +
    '<strong>' +
    d.failed_payments_90d +
    '</strong><span>Failed payments (90d)</span>' +
    '</div>' +
    '<div class="sw-recurring-alert' +
    (d.canceled_gifts_90d > 0 ? ' sw-recurring-alert--warn' : '') +
    '">' +
    '<strong>' +
    d.canceled_gifts_90d +
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
