'use strict';

/* global currentParish, isParishTier, stewardshipApi, authHeaders, escapeHtml, accountingMoney, escapeAttr,
  parishSessionStorageKey, givingMetricsState */
/* exported importAccountingFinancialSnapshot, openStewardshipMonthlyFinancialReport */

// Financial snapshot loading, presentation, accounting imports, and reports.
// Read shared parish identity and authentication only when actions run.

// A sample KPI grid (blurred, real layout, fake numbers) sits behind the
// upgrade CTA so a Mission-tier treasurer can see exactly what they're
// missing rather than just reading a sentence about it.
function renderFinancialsUpgradePrompt() {
  const sampleKpis =
    '<div class="sw-fin-kpi-grid">' +
    swFinKpi(
      'Total Income',
      '$84,200',
      '12 packets',
      'income',
      '<span class="sw-fin-yoy sw-fin-yoy-good">\u25B2 9% vs 2025</span>'
    ) +
    swFinKpi(
      'Total Expenses',
      '$71,600',
      'across all packets',
      'expense',
      '<span class="sw-fin-yoy sw-fin-yoy-bad">\u25B2 4% vs 2025</span>'
    ) +
    swFinKpi(
      'Net Surplus',
      '$12,600',
      'fiscal year 2026',
      'surplus',
      '<span class="sw-fin-yoy sw-fin-yoy-good">\u25B2 22% vs 2025</span>'
    ) +
    swFinKpi(
      'Expense Ratio',
      '85%',
      'of income spent',
      'surplus',
      '<span class="sw-fin-yoy sw-fin-yoy-good">\u25BC 3 pts vs 2025</span>'
    ) +
    swFinKpi('Restricted Funds', '$31,400', '4 funds tracked', '') +
    '</div>';

  return (
    '<div class="sw-fin-upsell-wrap">' +
    '<div class="sw-fin-upsell-preview" aria-hidden="true">' +
    sampleKpis +
    '</div>' +
    '<div class="sw-upsell-cta">' +
    '<strong style="font-family:var(--serif);font-size:1.1rem;color:var(--deep);">See your finances at a glance</strong>' +
    '<p class="section-note" style="margin:0;">Year-over-year income, expenses, and restricted fund balances — the numbers your council actually asks about at every meeting.</p>' +
    '<div class="sw-upsell-price"><strong>$99</strong><span>/ month</span></div>' +
    '<ul class="sw-upsell-list">' +
    '<li>Year-over-year comparison on every metric</li>' +
    '<li>Restricted fund balances tracked automatically</li>' +
    '<li>Full stewardship reports, donor retention, and giving distribution too</li>' +
    '</ul>' +
    '<button type="button" class="sw-subscribe-btn" onclick="switchTab(\'settings\')">Upgrade to Stewardship</button>' +
    '<p class="sw-upsell-note">Also included in the complete Parish plan.</p>' +
    '</div>' +
    '</div>'
  );
}

// ── Financial Snapshots Panel ───────────────────────────────────────────
let financialsState = { loaded: false, year: new Date().getFullYear(), data: null, accounting: null };

function financialSnapshotDateRange() {
  const currentYear = new Date().getFullYear();
  return {
    startDate: `${financialsState.year}-01-01`,
    endDate:
      financialsState.year === currentYear ? new Date().toISOString().slice(0, 10) : `${financialsState.year}-12-31`,
  };
}

async function loadFinancialSnapshotsPanel(year) {
  const pane = document.getElementById('stewardshipFinancialsPane');
  if (!pane || !currentParish) return;

  if (!isParishTier()) {
    pane.innerHTML = renderFinancialsUpgradePrompt();
    return;
  }

  if (year) financialsState.year = year;

  // Populate year selector
  const sel = document.getElementById('financialsYearSelect');
  if (sel && !sel.options.length) {
    const cy = new Date().getFullYear();
    for (let y = cy; y >= cy - 4; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === financialsState.year) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  if (sel) sel.value = financialsState.year;

  pane.innerHTML = '<p class="muted sw-loading">Loading financial snapshots\u2026</p>';
  try {
    const period = financialSnapshotDateRange();
    const dates = new URLSearchParams(period).toString();
    const [res, accountingRes] = await Promise.all([
      fetch(stewardshipApi('/financials?year=' + financialsState.year), { headers: authHeaders() }),
      fetch(stewardshipApi('/financials/accounting-summary?' + dates), { headers: authHeaders() }),
    ]);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load financials');
    const accounting = accountingRes.ok
      ? await accountingRes.json().catch(() => ({ available: false, reason: 'fetch_failed' }))
      : { available: false, reason: 'fetch_failed' };
    financialsState.data = data;
    financialsState.accounting = accounting;
    financialsState.loaded = true;
    if (accounting.available) {
      pane.innerHTML =
        renderAccountingFinancialSnapshot(accounting, data) +
        '<div class="sw-fin-section-label">Frozen meeting snapshots</div>' +
        renderFinancialSnapshots(data);
    } else if (accounting.reason === 'not_provisioned') {
      pane.innerHTML =
        '<p class="muted">Your accounting setup is still being finalized. Manual financial snapshots remain available.</p>' +
        renderFinancialSnapshots(data);
    } else {
      // Stewardship-tier and legacy subscribers keep the existing manual
      // experience byte-for-byte when accounting is not included.
      pane.innerHTML = renderFinancialSnapshots(data);
    }
  } catch (e) {
    pane.innerHTML = '<p class="muted">Unable to load financial snapshots: ' + escapeHtml(e.message) + '</p>';
  }
}

function renderAccountingFinancialSnapshot(accounting, manual) {
  const fmt = (c) => accountingMoney(Number(c || 0));
  const meetings = manual.meetings || [];
  const meetingOptions = meetings
    .map(
      (meeting) => `<option value="${escapeAttr(meeting.id)}">${escapeHtml(meeting.title || 'Annual meeting')}</option>`
    )
    .join('');
  const funds = (accounting.restrictedFunds || [])
    .map(
      (fund) =>
        `<tr><td><strong>${escapeHtml(fund.fundName)}</strong></td><td>${fmt(fund.beginningBalanceCents)}</td><td>${fmt(fund.totalReceivedCents)}</td><td>${fmt(fund.totalDisbursedCents)}</td><td>${fmt(fund.endingBalanceCents)}</td></tr>`
    )
    .join('');
  return `<section class="acct-card"><div class="acct-list-head"><div><span class="acct-kicker">Live from Accounting</span><h2>${accounting.startDate} through ${accounting.endDate}</h2><p>Posted ledger activity. Importing freezes a copy for the selected meeting packet.</p></div><div class="acct-report-actions"><select id="stewardshipAccountingImportMeeting"><option value="">Create a new ${financialsState.year} snapshot</option>${meetingOptions}</select><button class="acct-primary" onclick="importAccountingFinancialSnapshot()">Import into meeting packet</button></div></div><div class="acct-kpis"><div><span>Total income</span><strong>${fmt(accounting.totalIncomeCents)}</strong></div><div><span>Total expenses</span><strong>${fmt(accounting.totalExpenseCents)}</strong></div><div><span>Net</span><strong>${fmt(accounting.netCents)}</strong></div></div>${funds ? `<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Restricted fund</th><th>Beginning</th><th>Received</th><th>Disbursed</th><th>Ending</th></tr></thead><tbody>${funds}</tbody></table></div>` : '<p class="muted">No restricted funds have activity in this period.</p>'}<p id="stewardshipAccountingImportStatus" class="muted"></p></section>`;
}

async function importAccountingFinancialSnapshot() {
  const meetingId = document.getElementById('stewardshipAccountingImportMeeting')?.value || null;
  const status = document.getElementById('stewardshipAccountingImportStatus');
  const body = {
    annualMeetingId: meetingId,
    fiscalYear: financialsState.year,
    ...financialSnapshotDateRange(),
  };
  if (status) status.textContent = 'Importing current accounting values…';
  try {
    const response = await fetch(stewardshipApi('/financials/import-from-accounting'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Import failed');
    if (status) status.textContent = payload.note || 'Imported from accounting.';
    await loadFinancialSnapshotsPanel(financialsState.year);
  } catch (error) {
    if (status) status.textContent = 'Unable to import: ' + error.message;
  }
}

function renderFinancialSnapshots(data) {
  const fmt = (c) => {
    const value = Number(c || 0);
    return (
      (value < 0 ? '-$' : '$') +
      (Math.abs(value) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    );
  };
  const snapshot = data.snapshot || null;
  const totals = data.totals || { totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 };
  const contributions = data.contributionTotals || {};
  const agapayRestrictedFunds = data.agapayRestrictedFunds || [];
  const externalAssets = data.externalAssets || [];
  const priorYear = data.priorYear || null;
  const revisions = data.revisions || [];
  const expenseRatioPct =
    totals.totalIncomeCents > 0 ? Math.round((totals.totalExpenseCents / totals.totalIncomeCents) * 100) : null;
  const priorExpenseRatioPct =
    priorYear?.totalIncomeCents > 0
      ? Math.round((priorYear.totalExpenseCents / priorYear.totalIncomeCents) * 100)
      : null;
  const summaryHtml =
    '<div class="sw-fin-source-note">' +
    '<span><i class="sw-fin-source-dot sw-fin-source-dot--auto"></i>Calculated automatically</span>' +
    '<span><i class="sw-fin-source-dot sw-fin-source-dot--editable"></i>Editable until Accounting launches</span>' +
    '</div>' +
    '<div class="sw-fin-kpi-grid">' +
    swFinKpi(
      'AGAPAY Contributions',
      fmt(contributions.agapayContributionsCents),
      'calculated from completed gifts',
      'income',
      ''
    ) +
    swFinKpi(
      'Outside Contributions',
      fmt(contributions.outsideContributionsCents),
      'qualified contribution entries',
      'income',
      ''
    ) +
    swFinKpi('Other Revenue', fmt(snapshot?.otherRevenueCents || 0), 'editable non-contribution revenue', '', '') +
    swFinKpi(
      'Total Income',
      fmt(totals.totalIncomeCents),
      'all revenue for ' + financialsState.year,
      'income',
      swFinYoy(totals.totalIncomeCents, priorYear?.totalIncomeCents, priorYear?.fiscalYear)
    ) +
    swFinKpi(
      'Total Expenses',
      fmt(totals.totalExpenseCents),
      'editable until Accounting',
      'expense',
      swFinYoy(totals.totalExpenseCents, priorYear?.totalExpenseCents, priorYear?.fiscalYear, true)
    ) +
    swFinKpi(
      'Net ' + (totals.netCents >= 0 ? 'Surplus' : 'Deficit'),
      fmt(Math.abs(totals.netCents)),
      'fiscal year ' + financialsState.year,
      totals.netCents >= 0 ? 'surplus' : 'deficit',
      swFinYoy(totals.netCents, priorYear?.netCents, priorYear?.fiscalYear)
    ) +
    swFinKpi(
      'Expense Ratio',
      expenseRatioPct === null ? '—' : expenseRatioPct + '%',
      'of income spent',
      expenseRatioPct === null ? '' : expenseRatioPct <= 85 ? 'surplus' : expenseRatioPct <= 100 ? '' : 'deficit',
      swFinYoy(expenseRatioPct, priorExpenseRatioPct, priorYear?.fiscalYear, true, true)
    ) +
    '</div>' +
    (!snapshot
      ? '<div class="sw-financials-empty"><p>The calculated contribution and restricted-fund inflow totals are live. Complete the snapshot to add expenses, other revenue, externally held assets, and notes.</p><button class="sw-new-packet-btn" type="button" onclick="openFinancialsEditor()">Complete ' +
        financialsState.year +
        ' snapshot</button></div>'
      : '');

  const agapayFundRows =
    agapayRestrictedFunds
      .map(
        (rf) =>
          '<tr class="sw-fund-row">' +
          '<td class="sw-td sw-fund-name"><strong>' +
          escapeHtml(rf.name) +
          '</strong><small>' +
          fmt(rf.agapayReceivedCents) +
          ' AGAPAY · ' +
          fmt(rf.outsideReceivedCents) +
          ' outside</small></td>' +
          '<td class="sw-td sw-td-right">' +
          fmt(rf.openingBalanceCents) +
          '</td>' +
          '<td class="sw-td sw-td-right sw-fin-income-lbl">' +
          fmt(rf.receivedCents) +
          '</td>' +
          '<td class="sw-td sw-td-right sw-fin-expense-lbl">' +
          fmt(rf.deductionsCents) +
          '</td>' +
          '<td class="sw-td sw-td-right ' +
          (rf.endingBalanceCents < 0 ? 'sw-fin-deficit' : 'sw-fin-surplus') +
          '">' +
          fmt(rf.endingBalanceCents) +
          '</td>' +
          '</tr>'
      )
      .join('') ||
    '<tr><td colspan="5" class="muted" style="text-align:center;padding:1rem;">No donor-restricted funds are configured in Funds &amp; Alms.</td></tr>';
  const automaticFundsHtml =
    '<div class="sw-fin-section-head"><div><div class="sw-fin-section-label">Restricted fund balances</div><p>Contributions calculate automatically; opening balances and deductions are maintained in the snapshot.</p></div><span class="sw-fin-auto-pill">Calculated</span></div>' +
    '<div class="sw-fin-table-wrap">' +
    '<table class="sw-fin-table">' +
    '<thead><tr>' +
    '<th class="sw-th">Fund</th>' +
    '<th class="sw-th sw-th-right">Opening</th>' +
    '<th class="sw-th sw-th-right">Inflows</th>' +
    '<th class="sw-th sw-th-right">Deductions</th>' +
    '<th class="sw-th sw-th-right">Ending</th>' +
    '</tr></thead>' +
    '<tbody>' +
    agapayFundRows +
    '</tbody>' +
    '</table>' +
    '</div>' +
    '<p class="sw-fin-basis-note">Ending balance = opening balance + AGAPAY and qualified outside contributions − expenses or deductions. A deficit remains visible when deductions exceed available funds.</p>';
  const externalAssetLabels = {
    investment: 'Investment',
    endowment: 'Endowment',
    real_property: 'Real property',
    external_fund: 'External fund',
    other: 'Other asset',
  };
  const externalRows =
    externalAssets
      .map(
        (asset) =>
          '<tr class="sw-fund-row">' +
          '<td class="sw-td sw-fund-name"><strong>' +
          escapeHtml(asset.name) +
          '</strong><small>' +
          escapeHtml(externalAssetLabels[asset.assetType] || 'External asset') +
          '</small></td>' +
          '<td class="sw-td">' +
          escapeHtml(asset.asOfDate || 'Not dated') +
          '</td>' +
          '<td class="sw-td">' +
          escapeHtml(asset.notes || '') +
          '</td>' +
          '<td class="sw-td sw-td-right sw-fin-surplus">' +
          fmt(asset.valueCents) +
          '</td>' +
          '</tr>'
      )
      .join('') ||
    '<tr><td colspan="4" class="muted" style="text-align:center;padding:1rem;">No externally held assets have been added.</td></tr>';
  const externalAssetsHtml =
    '<div class="sw-fin-section-head"><div><div class="sw-fin-section-label">Externally held assets</div><p>Investments, endowments, real property, and funds maintained outside AGAPAY.</p></div><span class="sw-fin-editable-pill">Editable</span></div>' +
    '<div class="sw-fin-table-wrap"><table class="sw-fin-table"><thead><tr><th>Asset</th><th>Valuation date</th><th>Note</th><th class="sw-th-right">Reported value</th></tr></thead><tbody>' +
    externalRows +
    '</tbody></table></div>';
  const revisionHtml = revisions.length
    ? '<div class="sw-fin-revisions"><div class="sw-fin-section-label">Revision history</div>' +
      revisions
        .map(
          (revision) =>
            '<div class="sw-fin-revision-row"><span>Version ' +
            revision.version +
            '</span><span>' +
            escapeHtml(new Date(revision.createdAt).toLocaleString()) +
            '</span><span>' +
            fmt(revision.totalIncomeCents) +
            ' income · ' +
            fmt(revision.totalExpenseCents) +
            ' expenses</span></div>'
        )
        .join('') +
      '</div>'
    : '';
  const statusHtml = snapshot
    ? '<div class="sw-fin-authority-status"><strong>Authoritative ' +
      financialsState.year +
      ' snapshot</strong><span>Version ' +
      snapshot.version +
      ' · Updated ' +
      escapeHtml(new Date(snapshot.updatedAt).toLocaleString()) +
      '</span></div>'
    : '';
  return statusHtml + summaryHtml + automaticFundsHtml + externalAssetsHtml + revisionHtml;
}

// Builds a "▲ 8% vs 2025" badge comparing current to prior-year value.
// `invertGood` flips the up/down color meaning for metrics where lower is
// better (expenses, expense ratio) rather than higher is better.
function swFinYoy(current, prior, priorYearLabel, invertGood, isRatioPoints) {
  if (current === null || current === undefined || !prior) return '';
  const delta = isRatioPoints ? current - prior : Math.round(((current - prior) / Math.abs(prior)) * 100);
  if (!isFinite(delta)) return '';
  const up = delta >= 0;
  const good = invertGood ? !up : up;
  const arrow = up ? '\u25B2' : '\u25BC';
  const suffix = isRatioPoints ? ' pts' : '%';
  return (
    '<span class="sw-fin-yoy ' +
    (good ? 'sw-fin-yoy-good' : 'sw-fin-yoy-bad') +
    '">' +
    arrow +
    ' ' +
    Math.abs(delta) +
    suffix +
    ' vs ' +
    priorYearLabel +
    '</span>'
  );
}

function swFinKpi(label, value, sub, type, yoyBadge) {
  const cls =
    type === 'income'
      ? 'sw-fin-income-lbl'
      : type === 'expense'
        ? 'sw-fin-expense-lbl'
        : type === 'surplus'
          ? 'sw-fin-surplus'
          : type === 'deficit'
            ? 'sw-fin-deficit'
            : '';
  return (
    '<div class="sw-kpi-card">' +
    '<span class="sw-kpi-label">' +
    label +
    '</span>' +
    '<strong class="sw-kpi-value ' +
    cls +
    '">' +
    value +
    '</strong>' +
    '<span class="sw-kpi-sub">' +
    sub +
    '</span>' +
    (yoyBadge || '') +
    '</div>'
  );
}

function stewardshipMonthlyFinancialReportUrl() {
  const token =
    document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
  const year = financialsState.year || givingMetricsState.year || new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const url = new URL(
    '/api/parish/dashboard/' +
      encodeURIComponent(currentParish?.parishId || '') +
      '/stewardship/report/monthly-financial',
    window.location.origin
  );
  url.searchParams.set('year', String(year));
  url.searchParams.set('month', String(year) + '-' + month);
  url.searchParams.set('t', token);
  return url.pathname + url.search;
}

function openStewardshipMonthlyFinancialReport() {
  if (!currentParish) return;
  window.open(stewardshipMonthlyFinancialReportUrl(), '_blank');
}
