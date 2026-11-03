'use strict';

// Parish dashboard accounting: reports.
// Classic script; preserve global names used by the dashboard and inline actions.

const ACCOUNTING_REPORT_LIBRARY = [
  {
    id: 'assetRegister',
    title: 'Asset Register',
    group: 'Assets',
    copy: 'Property, locations, acquisition cost, posted depreciation and net book value as of the selected date.',
  },
  {
    id: 'generalLedger',
    title: 'General Ledger',
    group: 'Accounting detail',
    copy: 'Posted transactions by account, with opening balances, debits, credits, and running balances.',
  },
  {
    id: 'activities',
    title: 'Income Statement',
    group: 'Income statements',
    copy: 'Income Statement: total revenue less expenses, showing the parish’s surplus or deficit.',
  },
  {
    id: 'comparativePeriods',
    title: 'Comparative Income Statement Periods',
    group: 'Income statements',
    copy: 'Compare the selected period with the preceding period.',
  },
  {
    id: 'incomeByFund',
    title: 'Income Statement by Fund',
    group: 'Income statements',
    copy: 'Revenue, expenses, and net activity for every fund.',
  },
  {
    id: 'incomeByMonth',
    title: 'Income Statement by Month',
    group: 'Income statements',
    copy: 'Monthly revenue, expense, and net-activity trend.',
  },
  {
    id: 'comparativeIncome',
    title: 'Comparative Income Statement',
    group: 'Income statements',
    copy: 'Compare current-year activity with the same period last year.',
  },
  {
    id: 'position',
    title: 'Balance Sheet',
    group: 'Balance sheets',
    copy: 'Assets, liabilities, and net assets as of the selected report end.',
  },
  {
    id: 'balanceByFund',
    title: 'Balance Sheet by Fund',
    group: 'Balance sheets',
    copy: 'Financial position summarized separately for each fund.',
  },
  {
    id: 'cashFlows',
    title: 'Statement of Cash Flows',
    group: 'Accountant package',
    copy: 'Indirect-method operating, investing, and financing cash movement with reconciliation.',
  },
  {
    id: 'functionalExpenses',
    title: 'Statement of Functional Expenses',
    group: 'Accountant package',
    copy: 'Natural expense categories across program, management-and-general, and fundraising functions.',
  },
  {
    id: 'netAssetRollforward',
    title: 'Net Asset Rollforward',
    group: 'Accountant package',
    copy: 'Beginning, additions, reductions, and ending balances by restriction class.',
  },
  {
    id: 'budgetActual',
    title: 'Budget to Actual',
    group: 'Budgeting',
    copy: 'Compare the active budget with posted actual activity.',
    parishOnly: true,
  },
  {
    id: 'comparativeBudget',
    title: 'Comparative Budget to Actual',
    group: 'Budgeting',
    copy: 'Compare the selected budget with its preceding approved version and actual results.',
    parishOnly: true,
  },
  {
    id: 'budgetByFund',
    title: 'Budget by Fund',
    group: 'Budgeting',
    copy: 'Budget, actual, and variance summarized for each fund.',
    parishOnly: true,
  },
  {
    id: 'trialBalance',
    title: 'Trial Balance',
    group: 'Accounting detail',
    copy: 'Ending debits and credits for every posting account.',
  },
  {
    id: 'expenses',
    title: 'Expense Breakdown',
    group: 'Accounting detail',
    copy: 'Visual expense analysis with the current AGAPAY subscription rate shown separately.',
  },
];

let accountingTransactionPage = 0;
let accountingTransactionSearch = '';
let accountingTransactionJournal = '';

let accountingReportDateRange: { start: string; end: string } | null = null;
let accountingSelectedBudgetId = '';
let accountingAvailableBudgets: AccountingBudgetSummary[] = [];
let accountingReportLoading = false;
let accountingTransactionDetail: AccountingDrilldown | null = null;

function accountingReportPeriod() {
  if (accountingReportDateRange) return accountingReportDateRange;
  try {
    const saved = JSON.parse(sessionStorage.getItem(accountingReportPreferenceKey()) || 'null');
    const validDate = (v: unknown): v is string =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    if (
      saved?.period &&
      validDate(saved.period.start) &&
      validDate(saved.period.end) &&
      saved.period.start <= saved.period.end
    ) {
      accountingReportDateRange = { start: saved.period.start, end: saved.period.end };
      accountingSelectedBudgetId = typeof saved.budgetId === 'string' ? saved.budgetId : '';
      return accountingReportDateRange;
    }
  } catch {
    /* Private mode or an invalid saved preference falls back to a safe default. */
  }
  return accountingPeriodPreset('ytd');
}

function accountingReportLedgerRows(startDate = '0001-01-01', endDate = '9999-12-31') {
  const accounts = new Map(
    (accountingData.accountCatalog?.length ? accountingData.accountCatalog : accountingData.accounts || []).map(
      (account) => [String(account.accountNumber || ''), account]
    )
  );
  return accountingData.ledger
    .filter((row) => {
      const date = String(row.postingDate || row.entryDate || row.date || '');
      return date >= startDate && date <= endDate;
    })
    .map((row) => {
      const account: Partial<AccountingAccount> =
        accounts.get(String(row.accountNumber || row.account_number || '')) || {};
      const debit = Number(row.debitAmount ?? row.debit_amount ?? 0),
        credit = Number(row.creditAmount ?? row.credit_amount ?? 0);
      const category = account.category || '';
      const amount = ['revenue', 'liability', 'net_asset'].includes(category) ? credit - debit : debit - credit;
      return {
        ...row,
        account,
        category,
        amount,
        date: String(row.postingDate || row.entryDate || row.date || ''),
        fund: String(row.fundName || row.fund_name || 'Unassigned'),
      };
    });
}

function accountingTabularReport(id: string) {
  if (id === 'generalLedger') return accountingGeneralLedgerReport();
  const period = accountingReportPeriod(),
    current = accountingReportLedgerRows(period.start, period.end);
  const moneyColumn = (key: string, label: string) => ({ key, label, money: true });
  if (id === 'incomeByFund') {
    const groups = new Map<string, { name: string; revenue: number; expenses: number }>();
    for (const row of current.filter((item) => ['revenue', 'expense'].includes(item.category))) {
      const item = groups.get(row.fund) || { name: row.fund, revenue: 0, expenses: 0 };
      item[row.category === 'revenue' ? 'revenue' : 'expenses'] += row.amount;
      groups.set(row.fund, item);
    }
    const rows = [...groups.values()]
      .map((row) => ({ ...row, net: row.revenue - row.expenses }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      title: 'Income Statement by Fund',
      subtitle: `${period.start} through ${period.end}`,
      columns: [
        { key: 'name', label: 'Fund' },
        moneyColumn('revenue', 'Revenue'),
        moneyColumn('expenses', 'Expenses'),
        moneyColumn('net', 'Net activity'),
      ],
      rows,
    };
  }
  if (id === 'balanceByFund') {
    const all = accountingReportLedgerRows('0001-01-01', period.end),
      groups = new Map<string, { name: string; assets: number; liabilities: number; netAssets: number }>();
    for (const row of all) {
      const item = groups.get(row.fund) || { name: row.fund, assets: 0, liabilities: 0, netAssets: 0 };
      if (row.category === 'asset') item.assets += row.amount;
      else if (row.category === 'liability') item.liabilities += row.amount;
      else if (row.category === 'net_asset') item.netAssets += row.amount;
      else if (row.category === 'revenue') item.netAssets += row.amount;
      else if (row.category === 'expense') item.netAssets -= row.amount;
      groups.set(row.fund, item);
    }
    return {
      title: 'Balance Sheet by Fund',
      subtitle: `As of ${period.end}`,
      columns: [
        { key: 'name', label: 'Fund' },
        moneyColumn('assets', 'Assets'),
        moneyColumn('liabilities', 'Liabilities'),
        moneyColumn('netAssets', 'Net assets'),
      ],
      rows: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  if (id === 'incomeByMonth') {
    const groups = new Map<string, { month: string; revenue: number; expenses: number }>();
    for (const row of current.filter((item) => ['revenue', 'expense'].includes(item.category))) {
      const key = row.date.slice(0, 7),
        item = groups.get(key) || { month: key, revenue: 0, expenses: 0 };
      item[row.category === 'revenue' ? 'revenue' : 'expenses'] += row.amount;
      groups.set(key, item);
    }
    return {
      title: 'Income Statement by Month',
      subtitle: `${period.start} through ${period.end}`,
      columns: [
        { key: 'month', label: 'Month' },
        moneyColumn('revenue', 'Revenue'),
        moneyColumn('expenses', 'Expenses'),
        moneyColumn('net', 'Net activity'),
      ],
      rows: [...groups.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((row) => ({ ...row, net: row.revenue - row.expenses })),
    };
  }
  const accountComparison = (
    leftStart: string,
    leftEnd: string,
    rightStart: string,
    rightEnd: string,
    title: string,
    leftLabel: string,
    rightLabel: string
  ) => {
    const groups = new Map<unknown, { account: string; category: string; left: number; right: number }>(),
      add = (rows: ReturnType<typeof accountingReportLedgerRows>, key: 'left' | 'right') =>
        rows
          .filter((item) => ['revenue', 'expense'].includes(item.category))
          .forEach((row) => {
            const id = row.account.id || row.accountNumber,
              item = groups.get(id) || {
                account: `${row.account.accountNumber || row.accountNumber || ''} · ${row.account.name || row.accountName || ''}`,
                category: row.category,
                left: 0,
                right: 0,
              };
            item[key] += row.amount;
            groups.set(id, item);
          });
    add(accountingReportLedgerRows(leftStart, leftEnd), 'left');
    add(accountingReportLedgerRows(rightStart, rightEnd), 'right');
    return {
      title,
      subtitle: `${leftStart} through ${leftEnd} compared with ${rightStart} through ${rightEnd}`,
      columns: [
        { key: 'account', label: 'Account' },
        moneyColumn('left', `${leftLabel} (${leftStart} to ${leftEnd})`),
        moneyColumn('right', `${rightLabel} (${rightStart} to ${rightEnd})`),
        moneyColumn('change', 'Change'),
      ],
      rows: [...groups.values()]
        .sort((a, b) => a.account.localeCompare(b.account))
        .map((row) => ({ ...row, change: row.left - row.right })),
    };
  };
  if (id === 'comparativePeriods') {
    const end = new Date(`${period.end}T00:00:00Z`),
      leftStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)),
      priorEnd = new Date(leftStart);
    priorEnd.setUTCDate(0);
    const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1));
    return accountComparison(
      leftStart.toISOString().slice(0, 10),
      period.end,
      priorStart.toISOString().slice(0, 10),
      priorEnd.toISOString().slice(0, 10),
      'Comparative Income Statement Periods',
      'Month to date',
      'Prior full month'
    );
  }
  if (id === 'comparativeIncome') {
    const priorStart = accountingPriorYear(period.start),
      priorEnd = accountingPriorYear(period.end);
    return accountComparison(
      period.start,
      period.end,
      priorStart,
      priorEnd,
      'Comparative Income Statement',
      'Current year',
      'Prior year'
    );
  }
  return null;
}

function renderAccountingReportLibrary(pane: HTMLElement) {
  const groups = [...new Set(ACCOUNTING_REPORT_LIBRARY.map((report) => report.group))];
  pane.innerHTML = `<section class="acct-report-library-head"><div><span class="acct-kicker">Parish financial reporting</span><h2>What would you like to understand?</h2><p>Start with a treasurer report, or explore the full library below.</p></div><label>Find a report<input type="search" placeholder="Try budget, tithes, cash or expenses" oninput="filterAccountingReportLibrary(this.value)"></label></section>${accountingReportDateForm()}${accountingReportShortcuts()}<p class="acct-library-result" role="status" id="accountingReportSearchStatus"></p><div class="acct-report-library">${groups
    .map(
      (group) =>
        `<section data-report-group><div class="acct-report-library-section"><div><strong>${escapeHtml(group)}</strong><small>${ACCOUNTING_REPORT_LIBRARY.filter((r) => r.group === group).length} reports</small></div></div><div class="acct-report-library-grid">${ACCOUNTING_REPORT_LIBRARY.filter(
          (r) => r.group === group
        )
          .map(
            (report) =>
              `<button type="button" class="acct-report-library-card" data-report-search="${escapeAttr(`${report.title} ${report.copy} ${group} ${report.id === 'budgetActual' ? 'within budget ytd plan' : report.id === 'activities' ? 'tithes donations income spending surplus' : report.id === 'position' ? 'cash assets liabilities' : ''}`.toLowerCase())}" onclick="openAccountingReport('${report.id}')"><span><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.copy)}</small></span><b>Open →</b></button>`
          )
          .join('')}</div></section>`
    )
    .join('')}</div>`;
}

function filterAccountingReportLibrary(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cards = [...document.querySelectorAll<HTMLElement>('[data-report-search]')];
  cards.forEach((card) => (card.hidden = !terms.every((term) => card.dataset.reportSearch!.includes(term))));
  document.querySelectorAll<HTMLElement>('[data-report-group]').forEach((group) => {
    group.hidden = ![...group.querySelectorAll<HTMLElement>('[data-report-search]')].some((card) => !card.hidden);
  });
  const status = document.getElementById('accountingReportSearchStatus');
  if (status)
    status.textContent =
      terms.length && cards.every((card) => card.hidden)
        ? 'No matching reports. Try income, budget, fund or cash.'
        : '';
}

async function openAccountingReport(id: string) {
  if (accountingReportLoading) return;
  const definition = ACCOUNTING_REPORT_LIBRARY.find((report) => report.id === id);
  if (!definition) return;
  if (definition.parishOnly && accountingData.tier !== 'advanced_operations') {
    alert('This budgeting report is available with Parish Accounting.');
    return;
  }
  accountingReportLoading = true;
  accountingTransactionDetail = null;
  try {
    accountingReportView = id;
    accountingCustomReport = null;
    if (id === 'assetRegister') {
      await loadAccountingAssetReport();
      return;
    }
    if (['activities', 'position', 'trialBalance', 'expenses'].includes(id)) {
      await loadAccountingCoreReport(id as 'activities' | 'position' | 'trialBalance' | 'expenses');
      return;
    }
    if (['cashFlows', 'functionalExpenses', 'netAssetRollforward'].includes(id)) {
      await loadAccountingDepthReport(id);
      return;
    }
    if (['budgetActual', 'comparativeBudget', 'budgetByFund'].includes(id)) {
      await loadAccountingBudgetLibraryReport(id);
      return;
    }
    accountingCustomReport = accountingTabularReport(id);
    renderAccountingPane();
  } finally {
    accountingReportLoading = false;
    if (typeof accountingView === 'undefined' || accountingView === 'reports') renderAccountingPane();
  }
}

async function loadAccountingDepthReport(id: string) {
  const pane = document.getElementById('accountingPane') as HTMLElement;
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Preparing accountant report…</p>';
  const period = accountingReportPeriod(),
    priorStart = accountingPriorYear(period.start),
    priorEnd = accountingPriorYear(period.end);
  const paths: Record<string, string> = {
      cashFlows: 'statement-of-cash-flows',
      functionalExpenses: 'statement-of-functional-expenses',
      netAssetRollforward: 'net-asset-rollforward',
    },
    supportsComparison = id !== 'netAssetRollforward';
  const compare = supportsComparison && accountingDepthComparative,
    query = new URLSearchParams({ from: period.start, to: period.end });
  if (compare) {
    query.set('priorFrom', priorStart);
    query.set('priorTo', priorEnd);
  }
  try {
    const response = await fetch(accountingApi(`/reports/${paths[id]}?${query}`), { headers: authHeaders() }),
      payload = await (response.json().catch(() => ({})) as Promise<AccountingWorkspaceResponse>);
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to prepare this report.');
    const report = payload.report,
      current = report.current || report,
      prior = report.comparative || null,
      moneyColumn = (key: string, label: string) => ({ key, label, money: true });
    if (id === 'cashFlows') {
      const priorByLabel = new Map((prior?.rows || []).map((row) => [row.label, row]));
      accountingCustomReport = {
        title: 'Statement of Cash Flows',
        subtitle: `${period.start} through ${period.end} · indirect method${current.validation?.status === 'warning' ? ' · reconciliation warning' : ''}`,
        columns: [
          { key: 'label', label: 'Cash-flow line' },
          moneyColumn('amount', 'Current period'),
          ...(prior ? [moneyColumn('priorAmount', `Prior (${priorStart} to ${priorEnd})`)] : []),
        ],
        rows: (current.rows || []).map((row) => ({ ...row, priorAmount: priorByLabel.get(row.label)?.amount || 0 })),
        serverPath: paths[id],
        comparativeSupported: true,
        disclaimer:
          current.validation?.status === 'warning'
            ? 'Computed cash movement does not reconcile to cash-account movement. Review account classifications.'
            : '',
      };
    } else if (id === 'functionalExpenses') {
      const priorById = new Map((prior?.rows || []).map((row) => [row.accountId, row]));
      accountingCustomReport = {
        title: 'Statement of Functional Expenses',
        subtitle: `${period.start} through ${period.end}`,
        columns: [
          { key: 'naturalCategory', label: 'Natural category' },
          moneyColumn('program', 'Program'),
          moneyColumn('managementAndGeneral', 'Management & general'),
          moneyColumn('fundraising', 'Fundraising'),
          moneyColumn('total', 'Total'),
          ...(prior ? [moneyColumn('priorTotal', 'Prior total')] : []),
        ],
        rows: (current.rows || []).map((row) => ({ ...row, priorTotal: priorById.get(row.accountId)?.total || 0 })),
        serverPath: paths[id],
        comparativeSupported: true,
        disclaimer: current.simplification,
      };
    } else
      accountingCustomReport = {
        title: 'Net Asset Rollforward by Restriction Class',
        subtitle: `${period.start} through ${period.end}`,
        columns: [
          { key: 'restrictionType', label: 'Restriction class' },
          moneyColumn('beginningBalance', 'Beginning'),
          moneyColumn('additions', 'Additions'),
          moneyColumn('reductions', 'Reductions'),
          moneyColumn('otherChanges', 'Transfers / other changes'),
          moneyColumn('endingBalance', 'Ending'),
        ],
        rows: ['without', 'with'].map((restriction) => {
          const rows = (current.rows || []).filter(
            (row) => /^donor_restricted/.test(row.restrictionType) === (restriction === 'with')
          );
          const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
          const beginningBalance = sum('beginningBalance'),
            additions = sum('additions'),
            reductions = sum('reductions'),
            endingBalance = sum('endingBalance');
          return {
            restrictionType: restriction === 'with' ? 'With donor restrictions' : 'Without donor restrictions',
            beginningBalance,
            additions,
            reductions,
            endingBalance,
            otherChanges: endingBalance - beginningBalance - additions + reductions,
          };
        }),
        serverPath: paths[id],
        comparativeSupported: false,
        disclaimer:
          'Transfers / other changes reconcile beginning net assets and activity to ending net assets. They are not automatically classified as releases from donor restrictions; review the underlying journals.',
      };
    renderAccountingPane();
  } catch (error) {
    accountingCustomReport = { error: (error as Error).message || 'Unable to prepare this report.' };
    renderAccountingPane();
  }
}

function toggleAccountingDepthComparative() {
  accountingDepthComparative = !accountingDepthComparative;
  loadAccountingDepthReport(accountingReportView);
}

async function loadAccountingBudgetLibraryReport(id: string) {
  const pane = document.getElementById('accountingPane') as HTMLElement;
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Creating budget report…</p>';
  try {
    const fiscalId = accountingData.setup?.currentFiscalYear?.id;
    const budgetPath = fiscalId ? `/budgets?fiscalYearId=${encodeURIComponent(fiscalId)}` : '/budgets';
    const listResponse = await fetch(accountingApi(budgetPath), { headers: authHeaders() }),
      list = await (listResponse.json().catch(() => ({})) as Promise<AccountingWorkspaceResponse>);
    if (!listResponse.ok) throw new Error(list.message || 'Budgets are unavailable.');
    const budgets: AccountingBudgetSummary[] = (list.budgets || list.items || [])
      .filter((budget) => budget.id && budget.status !== 'voided')
      .map((budget) => ({
        id: String(budget.id),
        name: budget.name,
        status: budget.status || '',
        versionNumber: 'versionNumber' in budget ? Number(budget.versionNumber) : undefined,
      }));
    accountingAvailableBudgets = budgets;

    if (!budgets.length) throw new Error('Create a budget before running this report.');
    const period = accountingReportPeriod();
    const fiscalStart = accountingData.setup?.currentFiscalYear?.startDate || period.start;
    const fiscalEnd = accountingData.setup?.currentFiscalYear?.endDate || period.end;
    const [year, month] = period.end.split('-').map(Number);
    const monthEnd = accountingLocalDate(new Date(year, month, 0));
    if (period.end !== monthEnd || period.start !== fiscalStart || period.end < fiscalStart || period.end > fiscalEnd)
      throw new Error(
        'Budget reports compare whole fiscal months. Choose Fiscal YTD through last month, or set the fiscal-year start and a month-end cutoff within this fiscal year. No dates have been changed.'
      );
    if (!budgets.some((b) => b.id === accountingSelectedBudgetId))
      accountingSelectedBudgetId = (budgets.find((b) => ['approved', 'locked'].includes(b.status)) || budgets[0]).id;

    const throughMonth = Math.min(
      12,
      Math.max(
        1,
        (Number(period.end.slice(0, 4)) - Number(fiscalStart.slice(0, 4))) * 12 +
          Number(period.end.slice(5, 7)) -
          Number(fiscalStart.slice(5, 7)) +
          1
      )
    );
    const chosen = budgets.find((b) => b.id === accountingSelectedBudgetId)!;
    const priorBudgets = budgets
      .filter(
        (b) =>
          b.id !== chosen.id &&
          (!b.status || ['approved', 'locked'].includes(b.status)) &&
          (chosen.versionNumber == null || b.versionNumber == null || b.versionNumber < chosen.versionNumber)
      )
      .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    const selected = [chosen, ...priorBudgets].slice(0, id === 'comparativeBudget' ? 2 : 1),
      reports: AccountingServerReport[] = [];
    for (const budget of selected) {
      const response = await fetch(
          accountingApi(`/budgets/${encodeURIComponent(budget.id)}/variance?throughMonth=${throughMonth}`),
          { headers: authHeaders() }
        ),
        payload = await (response.json().catch(() => ({})) as Promise<AccountingWorkspaceResponse>);
      if (!response.ok) throw new Error(payload.message || 'The budget report is unavailable.');
      reports.push(payload.report);
    }
    const moneyColumn = (key: string, label: string) => ({ key, label, money: true });
    if (id === 'budgetByFund') {
      const groups = new Map<
        string,
        { name: string; fundId: string; category: string | undefined; budget: number; actual: number; variance: number }
      >();
      for (const row of reports[0].rows || []) {
        const fund = accountingData.funds.find((item) => item.id === row.fundId),
          name = fund?.name || 'Unassigned',
          groupKey = name + ':' + row.category,
          item = groups.get(groupKey) || {
            name,
            fundId: row.fundId,
            category: row.category,
            budget: 0,
            actual: 0,
            variance: 0,
          };
        item.budget += Number(row.budget || 0);
        item.actual += Number(row.actual || 0);
        item.variance += Number(row.variance || 0);
        groups.set(groupKey, item);
      }
      accountingCustomReport = {
        title: 'Budget by Fund',
        subtitle: reports[0].budget?.name || '',
        columns: [
          { key: 'name', label: 'Fund' },
          moneyColumn('budget', 'Budget'),
          moneyColumn('actual', 'Actual'),
          moneyColumn('variance', 'Variance'),
        ],
        rows: [...groups.values()],
      };
    } else if (id === 'comparativeBudget') {
      if (!reports[1])
        throw new Error('Choose a budget with an earlier approved or locked version before running this comparison.');
      const prior = new Map((reports[1]?.rows || []).map((row) => [row.accountId + ':' + row.fundId, row]));
      accountingCustomReport = {
        title: 'Comparative Budget to Actual',
        subtitle: `${reports[0].budget?.name || 'Current budget'}${reports[1] ? ` compared with ${reports[1].budget?.name}` : ''}`,
        columns: [
          { key: 'account', label: 'Account' },
          moneyColumn('budget', 'Current budget'),
          moneyColumn('actual', 'Current actual'),
          moneyColumn('priorBudget', `Prior budget (through ${reports[1].throughDate})`),
          moneyColumn('variance', 'Variance'),
        ],
        rows: [
          ...(reports[0].rows || []),
          ...(reports[1].rows || [])
            .filter(
              (row) =>
                !(reports[0].rows || []).some(
                  (current) => current.accountId === row.accountId && current.fundId === row.fundId
                )
            )
            .map((row) => ({ ...row, budget: 0, actual: 0, variance: 0 })),
        ].map((row) => ({
          accountNumber: row.accountNumber,
          fundId: row.fundId,
          account: `${row.accountNumber} · ${row.account} (${accountingData.funds.find((fund) => fund.id === row.fundId)?.name || 'Unassigned'})`,
          category: row.category,
          budget: row.budget,
          actual: row.actual,
          priorBudget: prior.get(row.accountId + ':' + row.fundId)?.budget || 0,
          variance: row.variance,
        })),
      };
    } else
      accountingCustomReport = {
        title: 'Budget to Actual',
        subtitle: reports[0].budget?.name || '',
        columns: [
          { key: 'account', label: 'Account' },
          moneyColumn('budget', 'Budget'),
          moneyColumn('actual', 'Actual'),
          moneyColumn('variance', 'Variance'),
          { key: 'assessment', label: 'Assessment' },
        ],
        rows: (reports[0].rows || []).map((row) => ({
          accountNumber: row.accountNumber,
          fundId: row.fundId,
          account: `${row.accountNumber} · ${row.account} (${accountingData.funds.find((fund) => fund.id === row.fundId)?.name || 'Unassigned'})`,
          category: row.category,
          budget: row.budget,
          actual: row.actual,
          variance: row.variance,
          assessment: row.varianceLabel,
        })),
      };
    accountingCustomReport.subtitle += ' | Fiscal YTD through ' + reports[0].throughDate + ' (whole months)';
    accountingCustomReport.disclaimer =
      'Fiscal year-to-date budget compared with posted actuals through ' +
      reports[0].throughDate +
      '. Variance is actual less budget; positive revenue variance is favorable and positive expense variance is unfavorable.';
    renderAccountingPane();
  } catch (error) {
    accountingCustomReport = { error: (error as Error).message || 'Unable to create this report.' };
    renderAccountingPane();
  }
}

function renderAccountingReports(pane: HTMLElement) {
  if (accountingTransactionDetail) {
    renderAccountingReportTransactions(pane);
    return;
  }
  if (accountingReportView === 'library') {
    renderAccountingReportLibrary(pane);
    return;
  }
  if (accountingCustomReport?.error) {
    pane.innerHTML =
      '<button class="acct-refresh" onclick="setAccountingReportView(&quot;library&quot;)">← All reports</button>' +
      accountingReportDateForm() +
      accountingEmpty('Report needs a selection', accountingCustomReport.error);
    return;
  }
  try {
    const report = accountingStatementDocument();
    let insights = '';
    if (accountingReportView === 'expenses') {
      const holder = { innerHTML: '' };
      renderAccountingExpenses(holder, accountingData.reports.activities, []);
      insights =
        '<details><summary>Expense insights and current plan</summary>' +
        holder.innerHTML.slice(holder.innerHTML.indexOf('<section class="acct-expense-hero"')) +
        '</details>';
    }
    const comparison = accountingCustomReport?.comparativeSupported
      ? '<button class="acct-refresh" onclick="toggleAccountingDepthComparative()">' +
        (accountingDepthComparative ? 'Hide' : 'Show') +
        ' prior period</button>'
      : '';
    pane.innerHTML =
      '<div class="acct-report-head"><button class="acct-link" onclick="setAccountingReportView(&quot;library&quot;)">← All reports</button><div class="acct-report-actions">' +
      comparison +
      accountingStatementActions() +
      '</div></div>' +
      accountingReportDateForm() +
      accountingReportBudgetPicker() +
      (report.rows.some((row) => row.drilldown)
        ? '<p class="acct-report-hint">Select an underlined account or amount to see its posted transactions.</p>'
        : '') +
      '<p class="acct-report-mobile-hint">Swipe across the statement to see all columns.</p>' +
      (accountingReportView === 'activities' ? accountingIncomeSummary(accountingData.reports.activities) : '') +
      accountingStatementHtml(report) +
      insights;
  } catch (error) {
    pane.innerHTML = accountingEmpty('Report unavailable', (error as Error).message);
  }
}

function openAccountingIncomeReport() {
  void openAccountingTreasurerReport('activities');
}

function accountingIncomeSummary(report: AccountingReport, printable = false) {
  const totals = report.totals;
  if (!totals || !Number.isFinite(totals.revenue) || !Number.isFinite(totals.expenses))
    return '<p>Revenue and expense totals are unavailable. Refresh Accounting to try again.</p>';
  const net = totals.revenue - totals.expenses;
  const label = net > 0 ? 'Net surplus' : net < 0 ? 'Net deficit' : 'Break-even';
  const heading = `<h2>Revenue minus expenses</h2><p>Income Statement · ${escapeHtml(report.startDate || '')} through ${escapeHtml(report.endDate || '')}. Posted ledger activity.</p>`;
  const summaryMoney = (value: number) => (value < 0 ? `(${accountingMoney(-value)})` : accountingMoney(value));
  const cells = `<div><span>Total revenue</span><strong>${accountingMoney(totals.revenue)}</strong></div><div><span>Total expenses</span><strong>${accountingMoney(totals.expenses)}</strong></div><div><span>${label}</span><strong>${summaryMoney(net)}</strong></div>`;
  if (printable)
    return (
      heading +
      `<p><strong>Total revenue:</strong> ${accountingMoney(totals.revenue)} &nbsp; − &nbsp; <strong>Total expenses:</strong> ${accountingMoney(totals.expenses)} &nbsp; = &nbsp; <strong>${label}:</strong> ${summaryMoney(net)}</p>`
    );
  return `<section class="acct-income-summary">${heading}<div class="acct-income-equation">${cells}</div></section>`;
}

function setAccountingReportView(view: string) {
  accountingTransactionDetail = null;
  accountingReportView = view;
  accountingCustomReport = null;
  renderAccountingPane();
}

function downloadAccountingReport() {
  try {
    const report = accountingStatementDocument();
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+@\t\r]/.test(text) || /^-\D/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const lines = [
      [report.parish],
      [report.title],
      [report.period],
      [report.basis, report.currency],
      report.columns.map((col) => col.label),
      ...report.rows.map((row) =>
        report.columns.map((col, i) =>
          row.kind === 'section'
            ? i === 0
              ? row.cells[0]
              : ''
            : col.money
              ? (Number(row.cells[i] || 0) / 100).toFixed(2)
              : (row.cells[i] ?? '')
        )
      ),
      ...report.notes.map((note) => [note]),
    ];
    downloadBlob(
      'agapay-' + accountingReportView + '.csv',
      new Blob([lines.map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    );
  } catch (error) {
    alert((error as Error).message);
  }
}

function printAccountingReport() {
  const report = accountingStatementDocument();
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('Allow pop-ups for AGAPAY to open the printable report.');
    return;
  }
  win.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
      escapeHtml(report.title) +
      '</title><link rel="stylesheet" href="/parish/accounting-reports.css?v=20261103treasurer1"></head><body><button onclick="print()">Print</button>' +
      accountingStatementHtml(report, false) +
      '</body></html>'
  );
  win.document.close();
  win.focus();
}

async function downloadAccountingFile(url: string, fallbackName: string) {
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('The Accounting export is unavailable.');
    const blob = await res.blob();
    const match = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/);
    downloadBlob(match?.[1] || fallbackName, blob);
  } catch (error) {
    alert((error as Error).message || 'Unable to download this Accounting export.');
  }
}

async function downloadAccountingLedger() {
  try {
    const res = await fetch(accountingApi('/exports/general-ledger.csv'), { headers: authHeaders() });
    if (!res.ok) throw new Error('The general ledger export is unavailable.');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    downloadBlob(match?.[1] || 'agapay-ledger.csv', blob);
  } catch (error) {
    alert((error as Error).message || 'Unable to export the general ledger.');
  }
}

async function printAccountingLedger() {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('Allow pop-ups for AGAPAY to open the printable ledger.');
    return;
  }
  win.document.write(
    '<!doctype html><title>Preparing ledger…</title><p style="font:16px system-ui;padding:32px;">Preparing your printable ledger…</p>'
  );
  win.document.close();
  try {
    const res = await fetch(accountingApi('/print/general-ledger'), { headers: authHeaders() });
    const html = await res.text();
    if (!res.ok) throw new Error('The printable general ledger is unavailable.');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  } catch (error) {
    win.close();
    alert((error as Error).message || 'Unable to open the printable ledger.');
  }
}

function accountingReportDateForm() {
  const period = accountingReportPeriod();
  const budget = ['budgetActual', 'comparativeBudget', 'budgetByFund'].includes(accountingReportView);
  return `<section class="acct-period-panel"><div class="acct-period-context"><span class="acct-kicker">Shared reporting period</span><strong>${escapeHtml(period.start)} through ${escapeHtml(period.end)}</strong><small>${budget ? 'Fiscal YTD budget and actuals use the same month-end cutoff.' : 'This selection follows you between reports.'}</small></div><div class="acct-period-presets"><button type="button" onclick="setAccountingReportPreset('lastMonth')" ${accountingReportLoading ? 'disabled' : ''}>Last completed month</button><button type="button" onclick="setAccountingReportPreset('ytd')" ${accountingReportLoading ? 'disabled' : ''}>Fiscal YTD through last month</button><button type="button" onclick="setAccountingReportPreset('today')" ${accountingReportLoading ? 'disabled' : ''}>Fiscal YTD through today</button></div><form data-report-period class="acct-phase-form" onsubmit="applyAccountingReportDates(event)"><div class="acct-form-grid"><label>Report start<input name="start" type="date" value="${escapeAttr(period.start)}" required></label><label>Report end<input name="end" type="date" value="${escapeAttr(period.end)}" required></label></div><button class="acct-primary" ${accountingReportLoading ? 'disabled' : ''}>Apply report dates</button><span class="acct-form-status" role="status"></span></form></section>`;
}

async function applyAccountingReportDates(event: AccountingFormEvent) {
  event.preventDefault();
  if (accountingReportLoading) return;
  const form = event.currentTarget,
    values = Object.fromEntries(new FormData(form)) as Record<string, string>;
  if (!values.start || !values.end || values.start > values.end) {
    form.querySelector<HTMLElement>('.acct-form-status')!.textContent =
      'Choose a start date on or before the end date.';
    return;
  }
  const previousRange = accountingReportDateRange;
  const previousReports = { ...accountingData.reports };
  const previousCustom = accountingCustomReport;
  accountingReportDateRange = { start: values.start, end: values.end };
  if (accountingReportView === 'library') {
    accountingSaveReportPreferences();
    renderAccountingPane();
    return;
  }
  await openAccountingReport(accountingReportView);
  if (accountingCustomReport?.error) {
    const message = accountingCustomReport.error;
    accountingReportDateRange = previousRange;
    accountingData.reports = previousReports;
    accountingCustomReport = previousCustom;
    renderAccountingPane();
    const status = document.querySelector<HTMLElement>('#accountingPane .acct-form-status');
    if (status) status.textContent = message;
  } else accountingSaveReportPreferences();
}

function renderAccountingExpenses(
  pane: Pick<HTMLElement, 'innerHTML'>,
  report: AccountingReport,
  reportTabs: [string, string][]
) {
  const grouped = new Map<unknown, AccountingReportRow & { amount: number }>();
  for (const row of (report.rows || []).filter((item) => item.category === 'expense' && Number(item.amount) !== 0)) {
    const key = row.accountId || row.accountNumber || row.accountName;
    const current = grouped.get(key) || { ...row, amount: 0 };
    current.amount += Number(row.amount || 0);
    grouped.set(key, current);
  }
  const expenses = [...grouped.values()].filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = expenses.reduce((sum, row) => sum + row.amount, 0);
  const palette = ['#c8a24a', '#315f71', '#7d5d91', '#4f7c59', '#ba6d46', '#587fa5', '#9a7b3f', '#6b7280'];
  let cursor = 0;
  const stops = expenses.map((row, index) => {
    const start = cursor;
    cursor += total ? (row.amount / total) * 100 : 0;
    return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const agapay = expenses.find(
    (row) => row.accountId === 'acct_5850' || /agapay platform fees/i.test(row.accountName || '')
  );
  const subscriptionMonthlyCents = currentParish?.subscriptionMonthlyCents;
  const hasPublishedSubscriptionPrice =
    subscriptionMonthlyCents !== null &&
    subscriptionMonthlyCents !== undefined &&
    Number.isFinite(Number(subscriptionMonthlyCents));
  const subscriptionPrice = hasPublishedSubscriptionPrice
    ? accountingMoney(Number(subscriptionMonthlyCents))
    : 'Custom';
  const subscriptionTier = currentParish?.subscriptionTierLabel || currentParish?.subscriptionTier || 'Current';
  const postedAgapayExpense = Number(agapay?.amount || 0);
  pane.innerHTML = `<div class="acct-report-head"><div class="acct-view-switch">${reportTabs.map(([id, label]) => `<button type="button" class="${accountingReportView === id ? 'active' : ''}" onclick="setAccountingReportView('${id}')">${label}</button>`).join('')}</div><div class="acct-report-actions"><button type="button" class="acct-refresh" onclick="printAccountingReport()">Print</button><button type="button" class="acct-refresh" onclick="downloadAccountingReport()">Export CSV</button></div></div>
      <section class="acct-expense-hero"><div><span class="acct-kicker">Statement of activities · expenses</span><h2>What is costing the parish?</h2><p>Posted expenses for ${accountingDate(report.startDate)} through ${accountingDate(report.endDate)}. The current AGAPAY subscription rate is shown separately from posted ledger expenses.</p></div><div class="acct-expense-total"><span>Total expenses</span><strong>${accountingMoney(total)}</strong><small>${expenses.length} active expense categor${expenses.length === 1 ? 'y' : 'ies'}</small></div></section>
      <div class="acct-expense-layout"><section class="acct-expense-chart-card"><div class="acct-expense-pie" style="background:${stops.length ? `conic-gradient(${stops.join(',')})` : 'rgba(6,21,34,.08)'}"><div><strong>${accountingMoney(total)}</strong><span>total</span></div></div><div class="acct-expense-legend">${expenses.map((row, index) => `<div><i style="background:${palette[index % palette.length]}"></i><span><strong>${escapeHtml(row.accountName || row.name)}</strong><small>${total ? Math.round((row.amount / total) * 100) : 0}% of expenses</small></span><b>${accountingMoney(row.amount)}</b></div>`).join('') || '<p>No posted expenses for this period.</p>'}</div></section>
      <aside class="acct-expense-insights"><article class="acct-card"><span class="acct-kicker">Largest cost</span><h2>${escapeHtml(expenses[0]?.accountName || 'No expenses yet')}</h2><strong>${accountingMoney(expenses[0]?.amount || 0)}</strong><p>${total && expenses[0] ? `${Math.round((expenses[0].amount / total) * 100)}% of posted expenses for this period.` : 'Expense entries will appear automatically after posting.'}</p></article><article class="acct-card agapay-fee"><span class="acct-kicker">Current plan</span><h2>AGAPAY Subscription</h2><strong>${subscriptionPrice}${hasPublishedSubscriptionPrice ? '<small>/month</small>' : ''}</strong><p>${escapeHtml(subscriptionTier)} tier. ${postedAgapayExpense > 0 ? `${accountingMoney(postedAgapayExpense)} is posted to the ledger for this period.` : 'No subscription payment has been posted to the ledger for this period.'}</p></article></aside></div>`;
}
