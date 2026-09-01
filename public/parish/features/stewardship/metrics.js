'use strict';

/* global currentParish, stewardshipApi, authHeaders, checkNudgeEligibility, escapeHtml,
  parishSessionStorageKey, renderGivingMetrics */
/* exported loadGivingMetricsPanel, loadStewardshipHealthScorePanel, loadDonorConcentrationPanel,
  loadRecurringGivingPanel, loadGivingIntelligencePanels, loadStewardshipAttendancePanel,
  saveStewardshipAttendance, saveAttendanceDelegate, syncAttendanceEntryFromWeek,
  openStewardshipMonthlyReport */

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

// ── Weekly parish attendance ─────────────────────────────────────────────
let attendanceState = { weeks: 52, data: null, message: '' };

function ensureStewardshipAttendanceCard() {
  let pane = document.getElementById('stewardshipAttendancePane');
  if (pane) return pane;
  const mount = document.getElementById('stewardshipAttendanceMount');
  if (!mount) return null;
  mount.innerHTML = `<section class="sw-suite-tool-card sw-attendance-card" aria-labelledby="stewardshipAttendanceTitle"><div class="sw-attendance-heading"><div><span class="sw-attendance-eyebrow">Parish life</span><h2 class="sw-tool-card-title" id="stewardshipAttendanceTitle">Weekly attendance</h2><p class="sw-tool-card-desc">A parish-wide view of Sunday headcount, with missing weeks kept visible.</p></div><div class="sw-attendance-ranges" aria-label="Attendance chart range"><button type="button" data-attendance-weeks="13" onclick="loadStewardshipAttendancePanel(13)">13 weeks</button><button type="button" data-attendance-weeks="26" onclick="loadStewardshipAttendancePanel(26)">26 weeks</button><button type="button" data-attendance-weeks="52" class="is-active" onclick="loadStewardshipAttendancePanel(52)">52 weeks</button></div></div><div class="sw-attendance-pane" id="stewardshipAttendancePane" aria-live="polite"><p class="sw-tool-loading">Loading…</p></div></section>`;
  pane = document.getElementById('stewardshipAttendancePane');
  return pane;
}

function swAttendanceDate(value, options = { month: 'short', day: 'numeric' }) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', options);
}

function swTrendChart(points) {
  const measured = points.filter((point) => typeof point.headcount === 'number');
  if (!measured.length) {
    return '<div class="sw-attendance-empty"><strong>No attendance recorded yet</strong><p>Record a Sunday headcount to begin the parish trend. Missing weeks will remain blank rather than appearing as zero.</p></div>';
  }
  const width = 860;
  const height = 300;
  const margin = { top: 22, right: 28, bottom: 46, left: 52 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(1, ...measured.map((point) => point.headcount));
  const ceiling = Math.max(10, Math.ceil(maximum / 10) * 10);
  const x = (index) =>
    margin.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value) => margin.top + innerHeight - (value / ceiling) * innerHeight;
  const pathSegments = (values) => {
    const segments = [];
    let segment = [];
    values.forEach((value, index) => {
      if (typeof value === 'number') segment.push([x(index), y(value)]);
      else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    });
    if (segment.length) segments.push(segment);
    return segments;
  };
  const weeklySegments = pathSegments(points.map((point) => point.headcount));
  const rollingValues = points.map((point, index) => {
    if (typeof point.headcount !== 'number') return null;
    const values = points
      .slice(Math.max(0, index - 7), index + 1)
      .map((entry) => entry.headcount)
      .filter((value) => typeof value === 'number');
    return values.length >= 2 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  });
  const rollingSegments = pathSegments(rollingValues);
  const weeklyPaths = weeklySegments
    .map((segment) => {
      const line = segment.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
      const area = `${line} L${segment.at(-1)[0].toFixed(1)},${(margin.top + innerHeight).toFixed(1)} L${segment[0][0].toFixed(1)},${(margin.top + innerHeight).toFixed(1)} Z`;
      return `<path class="sw-attendance-area" d="${area}"/><path class="sw-attendance-line" d="${line}"/>`;
    })
    .join('');
  const rollingPaths = rollingSegments
    .map(
      (segment) =>
        `<path class="sw-attendance-average-line" d="${segment.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}"/>`
    )
    .join('');
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => {
      const value = Math.round(ceiling * (1 - fraction));
      const py = margin.top + innerHeight * fraction;
      return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${py}" y2="${py}"/><text x="${margin.left - 10}" y="${py + 4}">${value}</text>`;
    })
    .join('');
  const tickIndexes = [
    ...new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1]),
  ];
  const ticks = tickIndexes
    .map(
      (index) =>
        `<text x="${x(index)}" y="${height - 15}" text-anchor="middle">${escapeHtml(swAttendanceDate(points[index].weekOf))}</text>`
    )
    .join('');
  const latestIndex = points.map((point) => point.headcount).findLastIndex((value) => typeof value === 'number');
  const latest = points[latestIndex];
  const description = `${measured.length} of ${points.length} Sundays reported. Latest attendance ${latest.headcount} on ${swAttendanceDate(latest.weekOf, { month: 'long', day: 'numeric', year: 'numeric' })}. Gaps indicate weeks with no report.`;
  return `<div class="sw-attendance-chart-wrap"><svg class="sw-attendance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description)}"><g class="sw-attendance-grid">${grid}${ticks}</g>${weeklyPaths}${rollingPaths}<circle class="sw-attendance-latest" cx="${x(latestIndex)}" cy="${y(latest.headcount)}" r="6"/><circle class="sw-attendance-latest-core" cx="${x(latestIndex)}" cy="${y(latest.headcount)}" r="2.5"/></svg><div class="sw-attendance-legend" aria-hidden="true"><span><i class="is-weekly"></i>Weekly headcount</span><span><i class="is-average"></i>8-week rolling average</span></div><p class="sw-chart-note">${escapeHtml(description)}</p></div>`;
}

function attendanceMetric(label, value, detail) {
  return `<div class="sw-attendance-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function renderStewardshipAttendance(data) {
  const summary = data.summary || {};
  const latest = summary.latestHeadcount === null ? '—' : Number(summary.latestHeadcount).toLocaleString('en-US');
  const average =
    summary.eightWeekAverage === null
      ? '—'
      : Number(summary.eightWeekAverage).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const change =
    summary.eightWeekChangePct === null
      ? '—'
      : `${summary.eightWeekChangePct > 0 ? '+' : ''}${summary.eightWeekChangePct}%`;
  const coverage = summary.reportingCoveragePct === null ? '—' : `${summary.reportingCoveragePct}%`;
  const delegateOptions = (data.delegateOptions || [])
    .map(
      (ministry) =>
        `<option value="${escapeHtml(ministry.id)}"${data.delegate?.ministryId === ministry.id ? ' selected' : ''}>${escapeHtml(ministry.name)}</option>`
    )
    .join('');
  const selectedWeek = data.range?.endWeekOf || '';
  const selectedPoint = (data.points || []).find((point) => point.weekOf === selectedWeek);
  const message = attendanceState.message
    ? `<p class="sw-attendance-status is-success" role="status">${escapeHtml(attendanceState.message)}</p>`
    : '<p class="sw-attendance-status" id="attendanceSaveStatus" role="status"></p>';
  return `<div class="sw-attendance-kpis">${attendanceMetric('Latest Sunday', latest, summary.latestWeekOf ? swAttendanceDate(summary.latestWeekOf, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No report yet')}${attendanceMetric('8-week average', average, 'Reported Sundays')}${attendanceMetric('Change', change, 'Prior 8-week average')}${attendanceMetric('Reporting coverage', coverage, `${summary.weeksReported || 0} of ${summary.expectedWeeks || 0} Sundays`)}</div><div class="sw-attendance-controls"><form class="sw-attendance-entry" onsubmit="saveStewardshipAttendance(event)"><div><span class="sw-attendance-control-label">Record this week</span><p>Staff can enter or correct any Sunday.</p></div><label>Sunday<input id="attendanceWeekOf" name="weekOf" type="date" min="${escapeHtml(data.range?.startWeekOf || '')}" max="${escapeHtml(data.range?.endWeekOf || '')}" value="${escapeHtml(selectedWeek)}" onchange="syncAttendanceEntryFromWeek(this.value)" required></label><label>Headcount<input id="attendanceHeadcount" name="headcount" type="number" min="0" step="1" value="${typeof selectedPoint?.headcount === 'number' ? selectedPoint.headcount : ''}" placeholder="0" required></label><button type="submit">Save attendance</button></form><form class="sw-attendance-delegation" onsubmit="saveAttendanceDelegate(event)"><div><span class="sw-attendance-control-label">Entry delegation</span><p>Parish staff always retain access. Delegation only lets active leaders submit.</p></div><label>Ministry<select name="ministryId"><option value="">Parish staff only</option>${delegateOptions}</select></label><button type="submit">Save delegation</button></form></div>${message}${swTrendChart(data.points || [])}`;
}

async function loadStewardshipAttendancePanel(weeks = attendanceState.weeks) {
  const pane = ensureStewardshipAttendanceCard();
  if (!pane || !currentParish) return;
  attendanceState.weeks = Number(weeks) || 52;
  document
    .querySelectorAll('[data-attendance-weeks]')
    .forEach((button) =>
      button.classList.toggle('is-active', Number(button.dataset.attendanceWeeks) === attendanceState.weeks)
    );
  pane.setAttribute('aria-busy', 'true');
  if (!attendanceState.data) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const res = await fetch(stewardshipApi(`/attendance?weeks=${attendanceState.weeks}`), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Attendance is unavailable.');
    attendanceState.data = data;
    pane.innerHTML = renderStewardshipAttendance(data);
    attendanceState.message = '';
  } catch (error) {
    pane.innerHTML = `<div class="sw-attendance-empty"><strong>Attendance unavailable</strong><p>${escapeHtml(error.message)}</p><button type="button" onclick="loadStewardshipAttendancePanel()">Try again</button></div>`;
  } finally {
    pane.removeAttribute('aria-busy');
  }
}

function syncAttendanceEntryFromWeek(weekOf) {
  const input = document.getElementById('attendanceHeadcount');
  const point = attendanceState.data?.points?.find((entry) => entry.weekOf === weekOf);
  if (input) input.value = typeof point?.headcount === 'number' ? point.headcount : '';
}

async function saveStewardshipAttendance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  button.disabled = true;
  try {
    const res = await fetch(stewardshipApi('/attendance'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekOf: data.get('weekOf'), headcount: Number(data.get('headcount')) }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Unable to save attendance.');
    attendanceState.message = `Saved ${payload.headcount.toLocaleString('en-US')} for ${swAttendanceDate(payload.weekOf, { month: 'long', day: 'numeric', year: 'numeric' })}.`;
    await loadStewardshipAttendancePanel();
  } catch (error) {
    const status = document.getElementById('attendanceSaveStatus');
    if (status) {
      status.textContent = error.message;
      status.className = 'sw-attendance-status is-error';
    }
  } finally {
    button.disabled = false;
  }
}

async function saveAttendanceDelegate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const ministryId = new FormData(form).get('ministryId');
  button.disabled = true;
  try {
    const res = await fetch(stewardshipApi('/attendance/delegation'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ministryId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Unable to save delegation.');
    attendanceState.message = payload.delegate
      ? `${payload.delegate.ministryName} can now submit weekly attendance.`
      : 'Weekly attendance is now staff-only.';
    await loadStewardshipAttendancePanel();
  } catch (error) {
    const status = document.getElementById('attendanceSaveStatus');
    if (status) {
      status.textContent = error.message;
      status.className = 'sw-attendance-status is-error';
    }
  } finally {
    button.disabled = false;
  }
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
