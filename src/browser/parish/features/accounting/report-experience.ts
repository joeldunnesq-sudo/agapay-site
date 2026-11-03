// Treasurer report navigation, period selection and read-only transaction detail.
// Function declarations only: bundled into the existing reports classic script.
function accountingLocalDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function accountingReportPreferenceKey() {
  return `agapay.report-period:${currentParish?.parishId || ''}:${accountingData.setup?.currentFiscalYear?.startDate || ''}`;
}

function accountingSaveReportPreferences() {
  try {
    sessionStorage.setItem(
      accountingReportPreferenceKey(),
      JSON.stringify({ period: accountingReportPeriod(), budgetId: accountingSelectedBudgetId })
    );
  } catch {
    /* Reporting remains available when browser storage is disabled. */
  }
}

function accountingPeriodPreset(preset: string) {
  const today = new Date();
  const fiscal = accountingData.setup?.currentFiscalYear;
  const fiscalStart = fiscal?.startDate || `${today.getFullYear()}-01-01`;
  const fiscalEnd = fiscal?.endDate || `${today.getFullYear()}-12-31`;
  const lastEnd = accountingLocalDate(new Date(today.getFullYear(), today.getMonth(), 0));
  const end = lastEnd < fiscalStart ? accountingLocalDate(today) : lastEnd > fiscalEnd ? fiscalEnd : lastEnd;
  if (preset === 'lastMonth') return { start: end.slice(0, 7) + '-01', end };
  return { start: fiscalStart, end: preset === 'today' ? [accountingLocalDate(today), fiscalEnd].sort()[0] : end };
}

async function setAccountingReportPreset(preset: string) {
  if (accountingReportLoading) return;
  const period = accountingPeriodPreset(preset);
  if (accountingReportView === 'library') {
    accountingReportDateRange = period;
    accountingSaveReportPreferences();
    renderAccountingPane();
    return;
  }
  const form = document.querySelector<HTMLFormElement>('#accountingPane [data-report-period]');
  if (!form) return;
  (form.elements.namedItem('start') as HTMLInputElement).value = period.start;
  (form.elements.namedItem('end') as HTMLInputElement).value = period.end;
  await applyAccountingReportDates({ preventDefault() {}, currentTarget: form } as AccountingFormEvent);
}

function accountingReportShortcuts() {
  const choices = [
    ['activities', 'Income and expenses', 'What came in and what did we spend?', 'Income Statement'],
    ['budgetActual', 'Budget vs actual YTD', 'Are we within our parish plan?', 'Budget to Actual'],
    ['position', 'Cash and fund balances', 'What do we own and what do we owe?', 'Balance Sheet'],
    ['expenses', 'Spending by category', 'Where is parish money going?', 'Expense Breakdown'],
  ];
  return `<div class="acct-report-start" aria-label="Common treasurer reports">${choices.map(([id, title, copy, formal]) => `<button type="button" data-report-search="${escapeAttr(`${title} ${copy} ${formal} ${id === 'activities' ? 'tithes donations' : id === 'budgetActual' ? 'plan ytd' : ''}`.toLowerCase())}" onclick="openAccountingTreasurerReport('${id}')"><span class="acct-kicker">${escapeHtml(formal)}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small><span class="acct-report-open">Open report →</span></button>`).join('')}</div>`;
}

async function selectAccountingReportBudget(id: string) {
  if (accountingReportLoading) return;
  const previous = accountingSelectedBudgetId;
  accountingSelectedBudgetId = id;
  await openAccountingReport(accountingReportView);
  if (accountingCustomReport?.error) accountingSelectedBudgetId = previous;
  else accountingSaveReportPreferences();
}

function accountingReportBudgetPicker() {
  if (
    !['budgetActual', 'comparativeBudget', 'budgetByFund'].includes(accountingReportView) ||
    !accountingAvailableBudgets.length
  )
    return '';
  return `<label class="acct-budget-selection">Budget version<select aria-label="Budget version" onchange="selectAccountingReportBudget(this.value)" ${accountingReportLoading ? 'disabled' : ''}>${accountingAvailableBudgets.map((b) => `<option value="${escapeAttr(b.id)}" ${b.id === accountingSelectedBudgetId ? 'selected' : ''}>${escapeHtml(b.name || 'Budget')} · ${escapeHtml(b.status || 'Status not supplied')}${b.versionNumber ? ` · v${b.versionNumber}` : ''}</option>`).join('')}</select></label>`;
}

async function loadAccountingOverviewSummaries(force = false) {
  if (accountingOverviewSummaries.loading || (!force && accountingOverviewSummaries.loadedAt)) return;
  const parishId = currentParish?.parishId;
  const snapshot = accountingOverviewSummaries;
  snapshot.loading = true;
  snapshot.errors = {};
  if (accountingView === 'overview') renderAccountingPane();
  const requests = [
    ['banking', '/bank/reconciliations'],
    ['close', '/close/workspace'],
    ...(accountingData.tier === 'advanced_operations'
      ? [
          ['payables', '/payables/overview'],
          ['budgets', '/budgets'],
        ]
      : []),
  ];
  await Promise.allSettled(
    requests.map(async ([key, path]) => {
      try {
        const response = await fetch(accountingApi(path), { headers: authHeaders() });
        const payload = (await response.json()) as AccountingWorkspaceResponse &
          AccountingCloseResponse &
          AccountingOperationsResponse;
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? 'Your profile does not have access to this summary.'
              : payload.message || payload.error || 'Summary unavailable.'
          );
        if (currentParish?.parishId !== parishId || snapshot !== accountingOverviewSummaries) return;
        if (key === 'payables') snapshot.payables = payload.overview;
        if (key === 'budgets')
          snapshot.budgetCount = (payload.budgets || []).filter((b) => b.status !== 'voided').length;
        if (key === 'banking')
          snapshot.openReconciliations = (payload.sessions || []).filter((s) =>
            ['in_progress', 'reopened'].includes(s.status)
          ).length;
        if (key === 'close') {
          snapshot.activeCloses = (payload.sessions || []).filter(
            (s) => !['completed', 'voided'].includes(s.status)
          ).length;
          snapshot.completedCloses = (payload.sessions || []).filter((s) => s.status === 'completed').length;
        }
      } catch (error) {
        if (snapshot === accountingOverviewSummaries) {
          snapshot.errors[key] = (error as Error).message;
          if (key === 'payables') delete snapshot.payables;
          if (key === 'budgets') delete snapshot.budgetCount;
          if (key === 'banking') delete snapshot.openReconciliations;
          if (key === 'close') {
            delete snapshot.activeCloses;
            delete snapshot.completedCloses;
          }
        }
      }
    })
  );
  if (currentParish?.parishId !== parishId || snapshot !== accountingOverviewSummaries) return;
  snapshot.loading = false;
  snapshot.loadedAt = new Date().toISOString();
  if (accountingView === 'overview') renderAccountingPane();
}

function accountingOverviewSummaryLabel(key: string) {
  return accountingOverviewSummaries.errors[key]
    ? 'Unavailable'
    : accountingOverviewSummaries.loading
      ? 'Loading…'
      : 'Not loaded';
}

function accountingReportDetailLink(value: string, detail: AccountingDrilldown, column?: number) {
  const spec = { ...detail };
  if (accountingReportView === 'activities' && column === 1) spec.restriction = 'without';
  if (accountingReportView === 'activities' && column === 2) spec.restriction = 'with';
  const encoded = escapeAttr(encodeURIComponent(JSON.stringify(spec)).replaceAll("'", '%27'));
  return `<button type="button" class="acct-report-drill" title="View posted transactions" aria-label="View posted transactions for ${escapeAttr(spec.label)}" onclick="openAccountingReportTransactions(decodeURIComponent('${encoded}'))">${escapeHtml(value)}<span aria-hidden="true"> ↗</span></button>`;
}

function openAccountingReportTransactions(encoded: string) {
  try {
    const detail = JSON.parse(encoded) as AccountingDrilldown;
    if (!detail || typeof detail.label !== 'string') return;
    accountingTransactionDetail = detail;
    accountingTransactionPage = 0;
    accountingTransactionSearch = '';
    accountingTransactionJournal = '';
    renderAccountingPane();
    document.querySelector<HTMLElement>('#accountingPane [data-transaction-heading]')?.focus();
  } catch {
    /* Ignore malformed navigation; never write accounting data. */
  }
}

function accountingReportTransactionRows() {
  const detail = accountingTransactionDetail!;
  const period = accountingReportPeriod();
  const fund = accountingData.funds.find((f) => f.id === detail.fundId);
  return accountingReportLedgerRows(detail.start || period.start, detail.end || period.end).filter((row) => {
    if (detail.accountNumber && row.accountNumber !== detail.accountNumber) return false;
    if (detail.category && row.category !== detail.category) return false;
    if (detail.fundId && (!fund || (row.fundCode ? row.fundCode !== fund.code : row.fund !== fund.name))) return false;
    if (detail.restriction) {
      const rowFund = accountingData.funds.find((f) => (row.fundCode ? f.code === row.fundCode : f.name === row.fund));
      if (
        /^donor_restricted/.test(rowFund?.restrictionType || rowFund?.restriction_type || '') !==
        (detail.restriction === 'with')
      )
        return false;
    }
    return (
      !accountingTransactionSearch ||
      `${row.entryNumber} ${row.description} ${row.fund} ${row.accountName}`
        .toLowerCase()
        .includes(accountingTransactionSearch)
    );
  });
}

function filterAccountingReportTransactions(value: string) {
  accountingTransactionSearch = value.trim().toLowerCase();
  accountingTransactionPage = 0;
  // Preserve search focus and caret by replacing only the results.
  const results = document.getElementById('accountingTransactionResults');
  if (results) results.innerHTML = accountingReportTransactionTable();
}

function accountingReportTransactionTable() {
  const rows = accountingReportTransactionRows();
  const start = accountingTransactionPage * 50;
  const visible = rows.slice(start, start + 50);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return `<div class="acct-detail-summary"><span>${rows.length} posted ledger lines</span><strong>${accountingMoney(total)}</strong><small>Net account activity for the filters shown. A balance detail includes all posted history through its as-of date.</small></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Entry and description</th><th>Account / fund</th><th class="number">Debit</th><th class="number">Credit</th></tr></thead><tbody>${visible.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td><button class="acct-link" onclick="showAccountingReportJournal('${escapeAttr(encodeURIComponent(row.entryNumber).replaceAll("'", '%27'))}')">${escapeHtml(row.entryNumber)}</button><small>${escapeHtml(row.description || '')}</small><small>${escapeHtml(row.sourceType || '')}</small></td><td>${escapeHtml(row.accountNumber)} · ${escapeHtml(row.accountName)}<small>${escapeHtml(row.fund)}</small></td><td class="number">${accountingStatementMoney(row.debitAmount)}</td><td class="number">${accountingStatementMoney(row.creditAmount)}</td></tr>`).join('') || '<tr><td colspan="5">No posted transactions match these filters.</td></tr>'}</tbody></table></div><div class="acct-detail-pagination"><button type="button" onclick="changeAccountingTransactionPage(-1)" ${start === 0 ? 'disabled' : ''}>Previous</button><span>${rows.length ? start + 1 : 0}–${Math.min(start + 50, rows.length)} of ${rows.length}</span><button type="button" onclick="changeAccountingTransactionPage(1)" ${start + 50 >= rows.length ? 'disabled' : ''}>Next</button></div>`;
}

function changeAccountingTransactionPage(change: number) {
  const count = accountingReportTransactionRows().length;
  accountingTransactionPage = Math.max(
    0,
    Math.min(Math.max(0, Math.ceil(count / 50) - 1), accountingTransactionPage + change)
  );
  const results = document.getElementById('accountingTransactionResults');
  if (results) results.innerHTML = accountingReportTransactionTable();
}

function showAccountingReportJournal(encoded: string) {
  accountingTransactionJournal = decodeURIComponent(encoded);
  renderAccountingPane();
}

function closeAccountingReportTransactions() {
  accountingTransactionDetail = null;
  accountingTransactionJournal = '';
  renderAccountingPane();
}

function renderAccountingReportTransactions(pane: HTMLElement) {
  const detail = accountingTransactionDetail!;
  const period = accountingReportPeriod();
  const journal = accountingTransactionJournal
    ? accountingReportLedgerRows('0001-01-01', '9999-12-31').filter(
        (row) => row.entryNumber === accountingTransactionJournal
      )
    : [];
  pane.innerHTML = `<section class="acct-report-detail"><button type="button" class="acct-link" onclick="closeAccountingReportTransactions()">← Back to ${escapeHtml(ACCOUNTING_REPORT_LIBRARY.find((r) => r.id === accountingReportView)?.title || 'report')}</button><span class="acct-kicker">Posted transaction detail · read only</span><h2 tabindex="-1" data-transaction-heading>${escapeHtml(detail.label)}</h2><p>${escapeHtml(detail.start || period.start)} through ${escapeHtml(detail.end || period.end)}${detail.restriction ? ` · ${escapeHtml(detail.restriction)} donor restrictions` : ''}</p><label>Find an entry<input type="search" value="${escapeAttr(accountingTransactionSearch)}" placeholder="Entry, description, account or fund" oninput="filterAccountingReportTransactions(this.value)"></label><div id="accountingTransactionResults">${accountingReportTransactionTable()}</div>${journal.length ? `<section class="acct-journal-preview"><h3>Complete journal ${escapeHtml(accountingTransactionJournal)}</h3><p>All posted lines in this entry, including accounts outside the report filter.</p><table class="acct-table"><thead><tr><th>Account and fund</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${journal.map((row) => `<tr><td>${escapeHtml(row.accountNumber)} ${escapeHtml(row.accountName)} · ${escapeHtml(row.fund)}</td><td>${accountingStatementMoney(row.debitAmount)}</td><td>${accountingStatementMoney(row.creditAmount)}</td></tr>`).join('')}</tbody></table></section>` : ''}</section>`;
}

async function openAccountingTreasurerReport(id: string) {
  if (accountingReportLoading) return;
  accountingView = 'reports';
  await openAccountingReport(id);
}
