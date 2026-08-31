'use strict';

// Parish dashboard accounting: funds.
// Classic script; preserve global names used by the dashboard and inline actions.

async function loadAccountingFunds() {
  const pane = document.getElementById('accountingPane');
  try {
    const response = await fetch(accountingApi('/funds'), { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to load funds.');
    accountingFundCatalog = payload.funds || [];
    accountingData.funds = accountingFundCatalog.filter((fund) => Number(fund.isActive));
    renderAccountingPane();
  } catch (error) {
    if (pane) pane.innerHTML = accountingEmpty('Funds need attention', error.message);
  }
}

function restrictionLabel(value) {
  return (
    {
      unrestricted: 'Unrestricted',
      board_designated: 'Board designated',
      donor_restricted_temporary: 'Donor restricted · temporary',
      donor_restricted_permanent: 'Donor restricted · permanent',
    }[value] || value
  );
}

function toggleAccountingFundAccountSection(category) {
  accountingFundAccountSections.has(category)
    ? accountingFundAccountSections.delete(category)
    : accountingFundAccountSections.add(category);
  renderAccountingPane();
}

function renderAccountingFunds(pane) {
  if (!accountingFundCatalog) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading funds...</p>';
    return;
  }
  const isCurrentFund = (fund) =>
    Number(fund.isActive) &&
    !fund.archivedAt &&
    !['archived', 'inactive', 'retired', 'unused'].includes(
      String(fund.status || '')
        .trim()
        .toLowerCase()
    );
  const active = accountingFundCatalog.filter(isCurrentFund);
  const inactive = accountingFundCatalog.filter((fund) => !isCurrentFund(fund));
  const directoryFunds = accountingShowInactiveFunds ? accountingFundCatalog : active;
  const accountCatalog = accountingData.accountCatalog?.length
    ? accountingData.accountCatalog
    : accountingData.accounts;
  const fundActivity = accountingData.reports.fundActivity?.rows || [];
  const balanceFor = (fund) =>
    Number(fundActivity.find((row) => row.fundId === fund.id || row.code === fund.code)?.endingBalance || 0);
  const fundBalances = active.map((fund) => ({ fund, balance: balanceFor(fund) }));
  const largestFundBalance = Math.max(1, ...fundBalances.map((item) => Math.abs(item.balance)));
  const unrestricted = fundBalances.filter(({ fund }) => !String(fund.restrictionType).startsWith('donor_restricted'));
  const restricted = fundBalances.filter(({ fund }) => String(fund.restrictionType).startsWith('donor_restricted'));
  const categories = [
    ['asset', 'Assets'],
    ['liability', 'Liabilities'],
    ['net_asset', 'Equity / Fund Balances'],
    ['revenue', 'Income'],
    ['expense', 'Expenses'],
  ];
  const accountLifecycle = (account) => {
    const action = Number(account.isActive) ? 'archive' : 'unarchive',
      confirming =
        accountingAccountLifecycleConfirm?.id === account.id && accountingAccountLifecycleConfirm.action === action;
    const message =
      accountingLifecycleMessage?.type === 'account' && accountingLifecycleMessage.id === account.id
        ? `<span class="acct-lifecycle-message">${escapeHtml(accountingLifecycleMessage.text)}</span>`
        : '';
    return `<div class="acct-lifecycle-actions">${confirming ? `<span>${action === 'archive' ? 'Archive this account?' : 'Restore this account?'}</span><button type="button" onclick="changeAccountingAccountLifecycle('${escapeAttr(account.id)}','${action}',${account.version})">Confirm</button><button type="button" onclick="cancelAccountingLifecycle()">Cancel</button>` : `<button type="button" onclick="beginAccountingAccountLifecycle('${escapeAttr(account.id)}','${action}')">${action === 'archive' ? 'Archive' : 'Unarchive'}</button>`}${message}</div>`;
  };
  const standardAccountRows = (category) =>
    accountCatalog
      .filter((account) => account.category === category)
      .map(
        (account) =>
          `<div class="acct-account-lifecycle-row ${Number(account.isActive) ? '' : 'retired'}"><button class="acct-fund-account-row" onclick="showAccountingAccountForm('${escapeAttr(account.id)}')"><span>${escapeHtml(account.accountNumber)}</span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.normalBalance)} normal balance · ${Number(account.isActive) ? 'Edit number or name' : 'Archived'}</small></button>${accountLifecycle(account)}</div>`
      )
      .join('') || '<div class="acct-fund-account-empty">No posting accounts in this group.</div>';
  const fundBalanceRows = (items, empty) =>
    items.length
      ? items
          .map(
            ({ fund, balance }) =>
              `<div class="acct-fund-balance-row"><span>${escapeHtml(fund.code)}</span><strong>${escapeHtml(fund.name)} · Fund Balance</strong><small>${escapeHtml(restrictionLabel(fund.restrictionType))}</small><b class="${balance < 0 ? 'negative' : ''}">${accountingMoney(balance)}</b></div>`
          )
          .join('')
      : `<div class="acct-fund-account-empty">${empty}</div>`;
  const expenseRows = (group) => {
    const rows = accountCatalog.filter(
      (account) => account.category === 'expense' && (account.expenseGroup || 'other') === group
    );
    return `<div class="acct-expense-account-group"><div class="acct-expense-account-group-head"><div><strong>${group === 'administrative' ? 'Administrative Expenses' : 'Other Expenses'}</strong><small>${group === 'administrative' ? 'Salaries, clergy support, rent, and routine administration' : 'Travel, utilities, AGAPAY fees, building costs, and other operations'}</small></div><button onclick="showAccountingExpenseAccountForm('${group}')">＋ Add account</button></div>${
      rows
        .map((account) => {
          const fund = active.find((item) => item.id === account.defaultFundId),
            parent = accountCatalog.find((item) => item.id === account.parentAccountId);
          return `<div class="acct-account-lifecycle-row ${Number(account.isActive) ? '' : 'retired'}"><button class="acct-expense-account-row ${parent ? 'subaccount' : ''}" onclick="showAccountingExpenseAccountForm('${group}','${escapeAttr(account.id)}')"><span>${escapeHtml(account.accountNumber)}</span><strong>${escapeHtml(account.name)}</strong><small>${parent ? `Sub-account of ${escapeHtml(parent.name)} · ` : ''}${Number(account.isActive) ? escapeHtml(fund?.name || 'Choose fund when posting') : 'Archived'}</small><b>${Number(account.isSystem) ? 'Configure' : 'Edit'}</b></button>${accountLifecycle(account)}</div>`;
        })
        .join('') || '<div class="acct-fund-account-empty">No accounts in this expense group yet.</div>'
    }</div>`;
  };
  const accountForm = accountingExpenseAccountEditor
    ? (() => {
        const account = accountingExpenseAccountEditor.id
          ? accountingExpenseAccountEditor
          : {
              accountNumber: '',
              name: '',
              description: '',
              expenseGroup: accountingExpenseAccountEditor.expenseGroup || 'other',
              defaultFundId: active.find((fund) => Number(fund.isDefault))?.id || active[0]?.id || '',
              cashFlowClassification: 'operating',
            };
        const isExpense = (account.category || 'expense') === 'expense';
        const parentOptions = accountCatalog.filter(
          (item) => item.category === 'expense' && Number(item.isActive) && item.id !== account.id
        );
        return `<form class="acct-expense-account-form" onsubmit="saveAccountingExpenseAccount(event)"><div><span class="acct-kicker">${account.id ? 'Edit account' : 'New expense account'}</span><h3>${account.id ? escapeHtml(account.name) : account.expenseGroup === 'administrative' ? 'Administrative expense' : 'Other expense'}</h3><p>Every account has both a number and a name. The account category and normal balance remain protected.</p></div><div class="acct-form-grid"><label>Account number<input name="accountNumber" maxlength="24" required value="${escapeAttr(account.accountNumber || '')}" placeholder="5000"></label><label>Account name<input name="name" maxlength="120" required value="${escapeAttr(account.name || '')}" placeholder="Salaries"></label>${isExpense ? `<label>Expense group<select name="expenseGroup"><option value="administrative" ${account.expenseGroup === 'administrative' ? 'selected' : ''}>Administrative Expenses</option><option value="other" ${account.expenseGroup === 'other' ? 'selected' : ''}>Other Expenses</option></select></label><label>Default fund<select name="defaultFundId" required>${active.map((fund) => `<option value="${escapeAttr(fund.id)}" ${account.defaultFundId === fund.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('')}</select><small>Selected automatically when this account is used in a new journal entry.</small></label><label>Parent account<select name="parentAccountId"><option value="">No parent account</option>${parentOptions.map((parent) => `<option value="${escapeAttr(parent.id)}" ${account.parentAccountId === parent.id ? 'selected' : ''}>${escapeHtml(parent.accountNumber)} · ${escapeHtml(parent.name)}</option>`).join('')}</select><small>Optional: organize this as a sub-account.</small></label>` : `<input type="hidden" name="parentAccountId" value="${escapeAttr(account.parentAccountId || '')}"><label>Category<input value="${escapeAttr(String(account.category || '').replaceAll('_', ' '))}" readonly></label><label>Normal balance<input value="${escapeAttr(account.normalBalance || '')}" readonly></label>`}<label>Cash-flow classification<select name="cashFlowClassification" required><option value="operating" ${(account.cashFlowClassification || 'operating') === 'operating' ? 'selected' : ''}>Operating</option><option value="investing" ${account.cashFlowClassification === 'investing' ? 'selected' : ''}>Investing</option><option value="financing" ${account.cashFlowClassification === 'financing' ? 'selected' : ''}>Financing</option></select><small>Controls where balance changes appear on the cash-flow statement.</small></label></div><label>Description<input name="description" value="${escapeAttr(account.description || '')}" placeholder="What should be posted to this account?"></label><div class="acct-phase-form-foot"><button class="acct-primary">${account.id ? 'Save account' : 'Add account'}</button><button type="button" class="acct-refresh" onclick="accountingExpenseAccountEditor=null;renderAccountingPane()">Cancel</button><span class="acct-form-status"></span></div></form>`;
      })()
    : '';
  pane.innerHTML = `<section class="acct-fund-workspace"><div class="acct-fund-summary"><div class="acct-list-head"><div><span class="acct-kicker">Funds &amp; accounts</span><h2>Fund balances at a glance</h2><p>See each current fund's posted balance, then expand the account groups below to review the structure behind it.</p></div><button class="acct-refresh" onclick="setAccountingView('reports')">Open fund report</button></div>
        <div class="acct-fund-bars">${fundBalances.map(({ fund, balance }) => `<div class="acct-fund-bar-row"><div class="acct-fund-bar-label"><strong>${escapeHtml(fund.name)}</strong><span>${escapeHtml(fund.code)}</span></div><div class="acct-fund-bar-track"><i class="${String(fund.restrictionType).startsWith('donor_restricted') ? 'restricted' : ''} ${balance < 0 ? 'negative' : ''}" style="width:${Math.max(balance === 0 ? 0 : 3, Math.round((Math.abs(balance) / largestFundBalance) * 100))}%"></i></div><strong class="${balance < 0 ? 'negative' : ''}">${accountingMoney(balance)}</strong></div>`).join('') || '<div class="acct-empty"><strong>No active funds</strong><span>Add a fund to begin tracking balances.</span></div>'}</div>
      </div><div class="acct-fund-accounts"><div class="acct-fund-accounts-head"><div><span class="acct-kicker">Chart of accounts</span><h2>Accounts</h2><p>Expand a group to review posting accounts and the fund-balance structure.</p></div><div><span>${accountingData.accounts.length} active · ${accountCatalog.length - accountingData.accounts.length} archived</span><strong>${active.length} fund balances</strong></div></div>
        <div class="acct-fund-account-groups">${categories
          .map(([category, label]) => {
            const expanded = accountingFundAccountSections.has(category),
              editorHere =
                accountingExpenseAccountEditor && (accountingExpenseAccountEditor.category || 'expense') === category,
              categoryAccounts = accountCatalog.filter((account) => account.category === category);
            return `<section class="acct-fund-account-group ${expanded ? 'expanded' : ''}"><button class="acct-fund-account-group-head" onclick="toggleAccountingFundAccountSection('${category}')" aria-expanded="${expanded}"><span>${escapeHtml(label)}</span><small>${category === 'net_asset' ? `${active.length} automatic fund balance${active.length === 1 ? '' : 's'}` : `${categoryAccounts.length} account${categoryAccounts.length === 1 ? '' : 's'}`}</small><b>${expanded ? '−' : '＋'}</b></button>${expanded ? `<div class="acct-fund-account-group-body">${editorHere ? accountForm : ''}${category === 'net_asset' ? `${standardAccountRows(category)}<div class="acct-fund-net-assets"><div class="acct-fund-net-group"><h3><span>Unrestricted net assets</span><small>General and board-designated funds</small></h3>${fundBalanceRows(unrestricted, 'No unrestricted funds.')}</div><div class="acct-fund-net-group restricted"><h3><span>Restricted net assets</span><small>Donor-restricted purposes</small></h3>${fundBalanceRows(restricted, 'No restricted funds.')}</div></div>` : category === 'expense' ? `${expenseRows('administrative')}${expenseRows('other')}` : standardAccountRows(category)}</div>` : ''}</section>`;
          })
          .join('')}</div>
      </div></section>
      <section class="acct-funds-directory"><div class="acct-list-head"><div><span class="acct-kicker">Fund directory</span><h2>Funds</h2><p>Funds &amp; Alms is the source of truth. Current funds stay front and center; archived, inactive, retired, and unused funds remain available whenever you need their history.</p></div><button class="acct-primary" onclick="switchTab('options')">Manage in Funds &amp; Alms</button></div>
      <div class="acct-fund-tools"><label>Find a fund<input type="search" placeholder="Search by name, number, or purpose" oninput="filterAccountingFunds(this.value)"></label><div class="acct-fund-directory-actions"><span>${active.length} current${inactive.length ? ` · ${inactive.length} archived or unused` : ''}</span>${inactive.length ? `<button type="button" class="acct-fund-visibility-toggle ${accountingShowInactiveFunds ? 'active' : ''}" aria-pressed="${accountingShowInactiveFunds}" onclick="toggleAccountingInactiveFunds()"><b>${accountingShowInactiveFunds ? '✓' : '⌁'}</b><span><strong>${accountingShowInactiveFunds ? 'Hide archived &amp; unused' : 'Show archived &amp; unused'}</strong><small>${inactive.length} fund${inactive.length === 1 ? '' : 's'}</small></span></button>` : ''}</div></div>
      <div class="acct-funds-directory-grid">${directoryFunds.map((fund) => `<div class="acct-fund-directory-card ${isCurrentFund(fund) ? '' : 'retired'}" data-fund-search="${escapeAttr(`${fund.code} ${fund.name} ${fund.purpose || ''} ${fund.description || ''}`.toLowerCase())}"><span>${escapeHtml(fund.code)}</span><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(restrictionLabel(fund.restrictionType))}${Number(fund.isDefault) ? ' · Default' : ''}${isCurrentFund(fund) ? '' : ' · Archived / unused'}</small></div>`).join('') || accountingEmpty(accountingShowInactiveFunds ? 'No funds' : 'No current funds', inactive.length ? 'Use “Show archived & unused” to review historical funds.' : 'Add the first fund in Funds & Alms.')}</div></section>`;
}

function toggleAccountingInactiveFunds() {
  accountingShowInactiveFunds = !accountingShowInactiveFunds;
  renderAccountingPane();
}

function filterAccountingFunds(query) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  document.querySelectorAll('[data-fund-search]').forEach((row) => {
    row.hidden = needle && !row.dataset.fundSearch.includes(needle);
  });
}

function showAccountingExpenseAccountForm(group = 'other', id = '') {
  const existing = id
    ? (accountingData.accountCatalog || accountingData.accounts).find((account) => account.id === id)
    : null;
  accountingExpenseAccountEditor = existing
    ? { ...existing, expenseGroup: existing.expenseGroup || group }
    : { expenseGroup: group };
  accountingFundAccountSections.add('expense');
  renderAccountingPane();
}

function showAccountingAccountForm(id) {
  const existing = (accountingData.accountCatalog || accountingData.accounts).find((account) => account.id === id);
  if (!existing) return;
  accountingExpenseAccountEditor = { ...existing };
  accountingFundAccountSections.add(existing.category);
  renderAccountingPane();
}

async function saveAccountingExpenseAccount(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  status.textContent = 'Saving…';
  const body = Object.fromEntries(new FormData(form));
  const editing = Boolean(accountingExpenseAccountEditor?.id);
  if (editing) body.expectedVersion = accountingExpenseAccountEditor.version;
  const response = await fetch(
    accountingApi(editing ? `/accounts/${encodeURIComponent(accountingExpenseAccountEditor.id)}` : '/accounts'),
    {
      method: editing ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to save account.';
    return;
  }
  const reference = await fetch(accountingApi('/workspace-reference'), { headers: authHeaders() });
  const data = await reference.json().catch(() => ({}));
  if (!reference.ok) {
    status.textContent = data.message || 'Account saved, but the list could not refresh.';
    return;
  }
  accountingData.accounts = data.accounts || accountingData.accounts;
  accountingData.accountCatalog = data.accountCatalog || data.accounts || accountingData.accountCatalog;
  accountingExpenseAccountEditor = null;
  renderAccountingPane();
}

function beginAccountingAccountLifecycle(id, action) {
  accountingAccountLifecycleConfirm = { id, action };
  accountingLifecycleMessage = null;
  renderAccountingPane();
}

function cancelAccountingLifecycle() {
  accountingAccountLifecycleConfirm = null;
  accountingVendorLifecycleConfirm = null;
  accountingLifecycleMessage = null;
  renderAccountingPane();
}

async function changeAccountingAccountLifecycle(id, action, expectedVersion) {
  const response = await fetch(accountingApi(`/accounts/${encodeURIComponent(id)}/${action}`), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    accountingAccountLifecycleConfirm = null;
    accountingLifecycleMessage = {
      type: 'account',
      id,
      text: payload.message || payload.error || 'Unable to update this account.',
    };
    renderAccountingPane();
    return;
  }
  const reference = await fetch(accountingApi('/workspace-reference'), { headers: authHeaders() });
  const data = await reference.json().catch(() => ({}));
  if (!reference.ok) {
    accountingLifecycleMessage = {
      type: 'account',
      id,
      text: data.message || data.error || 'Account updated, but the list could not refresh.',
    };
    renderAccountingPane();
    return;
  }
  accountingData.accounts = data.accounts || [];
  accountingData.accountCatalog = data.accountCatalog || data.accounts || [];
  accountingExpenseAccountEditor = null;
  accountingAccountLifecycleConfirm = null;
  accountingLifecycleMessage = null;
  renderAccountingPane();
}
