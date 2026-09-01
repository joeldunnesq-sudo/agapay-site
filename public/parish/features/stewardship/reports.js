'use strict';

/* global currentParish, authHeaders, escapeHtml, fmtDollars, swNumber, gmKpi */
/* exported renderGivingMetrics, ensureDiocesanStatisticsCard, loadDiocesanStatisticsPreview,
  downloadDiocesanStatisticsReport */

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

function diocesanStatisticsApi(year) {
  return (
    '/api/parish/dashboard/' +
    encodeURIComponent(currentParish?.parishId || '') +
    '/reports/diocesan-statistics?year=' +
    encodeURIComponent(year)
  );
}

function ensureDiocesanStatisticsCard() {
  const existing = document.getElementById('diocesanStatisticsPane');
  if (existing) return existing;
  const mount = document.getElementById('diocesanStatisticsMount');
  if (!mount) return null;
  mount.innerHTML = `<div class="sw-suite-tool-card sw-tool-financials-featured" id="diocesanStatisticsCard">
    <div class="sw-tool-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V7l8-4 8 4v14"/><path d="M2 21h20M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3"/></svg></div>
    <div class="sw-tool-card-header-row sw-report-card-header"><div><span class="sw-meeting-packets-kicker">Diocesan reporting</span><strong class="sw-tool-card-title">Annual Statistical Report</strong></div>
      <div class="sw-tool-card-actions"><select class="sw-year-select" id="diocesanStatisticsYear" aria-label="Diocesan statistical report year" onchange="loadDiocesanStatisticsPreview(+this.value)"></select>
        <button class="sw-report-generate-btn" id="diocesanStatisticsDownload" type="button" onclick="downloadDiocesanStatisticsReport(this)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"/><path d="M10 1.5V4.5h3M8 7v5M5.8 9.8 8 12l2.2-2.2"/></svg>Download annual PDF</button></div></div>
    <p class="sw-tool-card-desc">A parish-owned calendar-year summary of Directory membership, completed sacraments, Sunday attendance, and giving. Missing attendance remains explicit and is never reported as zero.</p>
    <div class="sw-tool-card-body" id="diocesanStatisticsPane" aria-live="polite"><p class="sw-tool-loading">Loading…</p></div>
  </div>`;
  return document.getElementById('diocesanStatisticsPane');
}

function diocesanStatisticsSelectedYear() {
  const select = document.getElementById('diocesanStatisticsYear');
  const currentYear = new Date().getFullYear();
  if (select && !select.options.length) {
    for (let year = currentYear; year >= currentYear - 5; year -= 1) {
      select.add(new Option(String(year), String(year)));
    }
  }
  return Number(select?.value || currentYear);
}

function renderDiocesanStatisticsPreview(report) {
  const attendance = report.attendance || {};
  const attendanceValue =
    attendance.status === 'reported' && typeof attendance.averageWeeklyAttendance === 'number'
      ? attendance.averageWeeklyAttendance.toLocaleString('en-US', { maximumFractionDigits: 1 })
      : 'Not reported';
  const attendanceDetail =
    attendance.status === 'reported'
      ? `${swNumber(attendance.weeksReported)} Sundays reported`
      : 'No attendance reported';
  return `<div class="sw-report-overview"><div class="sw-report-collected"><span class="sw-report-eyebrow">${escapeHtml(String(report.year))} diocesan snapshot</span><strong>${escapeHtml(attendanceValue)}</strong><span>average weekly attendance · ${escapeHtml(attendanceDetail)}</span></div>
    <div class="sw-kpi-grid sw-report-kpis">${gmKpi('Directory membership', swNumber(report.membership?.people), swNumber(report.membership?.households) + ' active households · ' + swNumber(report.membership?.catechumensMade) + ' catechumens made')}${gmKpi('Completed sacraments', swNumber(report.sacraments?.total), 'baptisms, chrismations, weddings, funerals')}${gmKpi('Recorded giving', fmtDollars(report.giving?.totalActualCents || 0), swNumber(report.giving?.activeDonors) + ' active donors')}</div></div>
    <p class="sw-chart-note">Membership is the current active Directory snapshot. Sacraments, attendance, and giving use the selected calendar year.</p>`;
}

async function loadDiocesanStatisticsPreview(year) {
  const pane = ensureDiocesanStatisticsCard();
  if (!pane || !currentParish) return;
  const select = document.getElementById('diocesanStatisticsYear');
  const selectedYear = Number(year || diocesanStatisticsSelectedYear());
  if (select) select.value = String(selectedYear);
  pane.innerHTML = '<p class="sw-tool-loading">Preparing annual summary…</p>';
  try {
    const response = await fetch(diocesanStatisticsApi(selectedYear), { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load the annual statistical summary.');
    pane.innerHTML = renderDiocesanStatisticsPreview(data.report || {});
  } catch (error) {
    pane.innerHTML = `<p class="sw-chart-empty">${escapeHtml(error.message || 'Unable to load the annual statistical summary.')}</p><button type="button" class="sw-action-btn" onclick="loadDiocesanStatisticsPreview(${selectedYear})">Try again</button>`;
  }
}

async function downloadDiocesanStatisticsReport(button) {
  if (!currentParish) return;
  const year = diocesanStatisticsSelectedYear();
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.textContent = 'Generating PDF…';
  }
  try {
    const response = await fetch(diocesanStatisticsApi(year), {
      method: 'POST',
      headers: authHeaders(),
    });
    const contentType = response.headers.get('Content-Type') || '';
    if (!response.ok || !contentType.includes('application/pdf')) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to generate the annual statistical report.');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `diocesan-statistical-report-${year}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    const pane = document.getElementById('diocesanStatisticsPane');
    if (pane)
      pane.insertAdjacentHTML(
        'beforeend',
        `<p class="sw-chart-empty">${escapeHtml(error.message || 'Unable to generate the annual statistical report.')}</p>`
      );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}
