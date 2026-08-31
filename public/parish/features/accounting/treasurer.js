'use strict';

// Parish dashboard accounting: treasurer.
// Classic script; preserve global names used by the dashboard and inline actions.

function accountingSimpleRevenueOptions(selectedId = '') {
  const order = Object.keys(ACCOUNTING_SIMPLE_REVENUE_LABELS);
  return accountingData.accounts
    .filter((account) => account.category === 'revenue' && account.isActive !== false && !account.archivedAt)
    .sort((left, right) => {
      const leftIndex = order.indexOf(left.id),
        rightIndex = order.indexOf(right.id);
      if (leftIndex >= 0 || rightIndex >= 0)
        return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
      return String(left.name || '').localeCompare(String(right.name || ''));
    })
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(ACCOUNTING_SIMPLE_REVENUE_LABELS[account.id] || account.name)}</option>`
    )
    .join('');
}

function accountingSimpleFundOptions(selectedId = '') {
  return accountingData.funds
    .map(
      (fund) =>
        `<option value="${escapeAttr(fund.id)}" ${fund.id === selectedId ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
}

function accountingSimpleIncomeForm() {
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  const banks = accountingData.bankAccounts || [];
  if (!banks.length)
    return `<section class="acct-simple-income"><div><span class="acct-kicker">Record Income</span><h2>Add a bank account first</h2><p>A deposit needs a destination account. Open Reconciliation to add the parish checking or savings account.</p></div><button class="acct-primary" onclick="setAccountingView('banking')">Open bank accounts</button></section>`;
  return `<section class="acct-simple-income"><div class="acct-simple-income-head"><div><span class="acct-kicker">Record Income</span><h2>Record a deposit</h2><p>Tell AGAPAY what happened. The complete ledger entry is created and posted for you.</p></div><button type="button" class="acct-link" data-enable-income-splits onclick="enableAccountingIncomeSplits(this)">Split this deposit across funds</button></div><form onsubmit="submitAccountingSimpleIncome(event)"><div class="acct-simple-income-grid acct-simple-income-details"><label>Where did the money go?<select name="depositAccountId" required>${banks.map((bank) => `<option value="${escapeAttr(bank.ledgerAccountId)}">${escapeHtml(bank.name)}${bank.maskedLast4 ? ` · •••• ${escapeHtml(bank.maskedLast4)}` : ''}</option>`).join('')}</select></label><label>Date<input name="entryDate" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label><label class="wide">Description<input name="description" maxlength="240" required placeholder="Sunday offering, fundraiser deposit, or other detail"></label></div><div class="acct-income-split-total" hidden><label>Total deposit amount<input data-income-total type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" oninput="updateAccountingSplitDepositBalance(this.form)"></label><small>This must equal all allocations below.</small></div><div class="acct-income-splits" data-income-splits>${accountingIncomeSplitRow({ fundId: defaultFund?.id || '' }, false)}</div><div class="acct-income-split-actions" hidden><button type="button" class="acct-add-line" onclick="addAccountingIncomeSplit(this)">+ Add another allocation</button><button type="button" class="acct-link" onclick="disableAccountingIncomeSplits(this)">Use one allocation</button></div><div class="acct-balance acct-income-split-balance" hidden></div><div class="acct-simple-income-foot"><span class="acct-form-status">${escapeHtml(accountingSimpleIncomeMessage)}</span><button class="acct-primary" data-income-submit>Record income</button></div></form></section>`;
}

function accountingIncomeSplitRow(split = {}, removable = true) {
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  return `<div class="acct-income-split-row" data-income-split-row><label>What kind of income was this?<select data-income-revenue required onchange="updateAccountingSplitDepositBalance(this.form)"><option value="">Choose income type</option>${accountingSimpleRevenueOptions(split.revenueAccountId || '')}</select></label><label>Which fund?<select data-income-fund required onchange="updateAccountingSplitDepositBalance(this.form)">${accountingSimpleFundOptions(split.fundId || defaultFund?.id || '')}</select></label><label><span data-split-amount-label>Amount</span><input data-income-amount type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" value="${split.amount ? escapeAttr(split.amount) : ''}" oninput="updateAccountingSplitDepositBalance(this.form)"></label><label class="acct-income-line-memo">Line memo <small>Optional</small><input data-income-memo maxlength="240" placeholder="Envelope batch or collection detail" value="${escapeAttr(split.description || '')}"></label>${removable ? '<button type="button" class="acct-remove-line" onclick="removeAccountingIncomeSplit(this)" aria-label="Remove split">×</button>' : ''}</div>`;
}

function enableAccountingIncomeSplits(button) {
  const form = button.closest('.acct-simple-income').querySelector('form');
  if (!form || form.dataset.splitEnabled === '1') return;
  form.dataset.splitEnabled = '1';
  button.hidden = true;
  form.querySelector('.acct-income-split-total').hidden = false;
  form.querySelector('.acct-income-split-actions').hidden = false;
  form.querySelector('.acct-income-split-balance').hidden = false;
  const firstAmount = form.querySelector('[data-income-amount]');
  form.querySelector('[data-income-total]').value = firstAmount.value;
  form.querySelectorAll('[data-split-amount-label]').forEach((label) => {
    label.textContent = 'Allocation amount';
  });
  addAccountingIncomeSplit(form.querySelector('.acct-add-line'));
}

function disableAccountingIncomeSplits(button) {
  const form = button.closest('form');
  if (!form) return;
  form.dataset.splitEnabled = '0';
  Array.from(form.querySelectorAll('[data-income-split-row]'))
    .slice(1)
    .forEach((row) => row.remove());
  form.querySelector('.acct-income-split-total').hidden = true;
  form.querySelector('.acct-income-split-actions').hidden = true;
  form.querySelector('.acct-income-split-balance').hidden = true;
  form.closest('.acct-simple-income').querySelector('[data-enable-income-splits]').hidden = false;
  form.querySelectorAll('[data-split-amount-label]').forEach((label) => {
    label.textContent = 'Amount';
  });
  form.querySelector('[data-income-submit]').disabled = false;
}

function addAccountingIncomeSplit(button) {
  const form = button.closest('form');
  const holder = form?.querySelector('[data-income-splits]');
  if (!holder) return;
  holder.insertAdjacentHTML('beforeend', accountingIncomeSplitRow());
  updateAccountingSplitDepositBalance(form);
}

function removeAccountingIncomeSplit(button) {
  const form = button.closest('form');
  if (form?.querySelectorAll('[data-income-split-row]').length <= 2) return;
  button.closest('[data-income-split-row]')?.remove();
  updateAccountingSplitDepositBalance(form);
}

function collectAccountingIncomeSplits(form) {
  const cents = (value) => Math.round(Number(value || 0) * 100);
  return Array.from(form.querySelectorAll('[data-income-split-row]')).map((row) => ({
    revenueAccountId: row.querySelector('[data-income-revenue]').value,
    fundId: row.querySelector('[data-income-fund]').value,
    amount: cents(row.querySelector('[data-income-amount]').value),
    description: row.querySelector('[data-income-memo]').value.trim(),
  }));
}

function updateAccountingSplitDepositBalance(form) {
  if (!form || form.dataset.splitEnabled !== '1') return;
  const cents = (value) => Math.round(Number(value || 0) * 100);
  const total = cents(form.querySelector('[data-income-total]').value);
  const splits = collectAccountingIncomeSplits(form);
  const allocated = splits.reduce((sum, split) => sum + split.amount, 0);
  const complete = splits.every(
    (split) => split.revenueAccountId && split.fundId && Number.isSafeInteger(split.amount) && split.amount > 0
  );
  const balanced = total > 0 && allocated === total && complete;
  const balance = form.querySelector('.acct-income-split-balance');
  balance.classList.toggle('balanced', balanced);
  balance.innerHTML = `<span>Deposit <strong>${accountingMoney(total)}</strong></span><span>Allocated <strong>${accountingMoney(allocated)}</strong></span><span>${balanced ? 'Balanced ✓' : complete ? `Difference ${accountingMoney(Math.abs(total - allocated))}` : 'Complete every allocation'}</span>`;
  form.querySelector('[data-income-submit]').disabled = !balanced;
}

function accountingSimpleActivityFeed() {
  const entries = accountingData.journals.filter((entry) => ['posted', 'reversed'].includes(entry.status)).slice(0, 8);
  return `<section class="acct-simple-feed"><div class="acct-suite-section-head"><div><span class="acct-kicker">Recent activity</span><h2>What has been recorded</h2></div></div>${entries.map((entry) => `<article><i>✓</i><p>You recorded <strong>${accountingMoney(entry.totalDebits ?? entry.total_debits ?? 0)}</strong> for ${escapeHtml(entry.description || 'parish activity')} on ${accountingDate(entry.postingDate || entry.entryDate)}.</p></article>`).join('') || accountingEmpty('No activity yet', 'Recorded income and posted parish activity will appear here.')}</section>`;
}

function accountingInKindDebitOptions() {
  const cashIds = new Set(['acct_1000', 'acct_1010', 'acct_1100']);
  return accountingData.accounts
    .filter(
      (account) => ['asset', 'expense'].includes(account.category) && account.isActive !== false && !account.archivedAt
    )
    .filter(
      (account) =>
        !cashIds.has(account.id) &&
        !(
          account.category === 'asset' &&
          /cash|bank|checking|savings|undeposited/i.test(`${account.accountNumber || ''} ${account.name || ''}`)
        )
    )
    .sort((left, right) =>
      String(left.accountNumber || '').localeCompare(String(right.accountNumber || ''), undefined, { numeric: true })
    )
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)} (${account.category === 'asset' ? 'Asset' : 'Expense'})</option>`
    )
    .join('');
}

function accountingInKindGiftForm() {
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  const debitOptions = accountingInKindDebitOptions();
  return `<section class="acct-simple-income acct-in-kind-gift"><div class="acct-simple-income-head"><div><span class="acct-kicker">Record a Non-Cash Gift</span><h2>Put a donated item on the books</h2><p>No money moved. AGAPAY will debit the account receiving the value and credit In-Kind Contributions.</p></div><button type="button" class="acct-link" onclick="openAccountingSimpleIncome()">Record cash income instead</button></div><form onsubmit="submitAccountingInKindGift(event)"><div class="acct-simple-income-grid"><label>What was received?<input name="itemDescription" maxlength="240" required placeholder="Processional cross, vehicle, building materials, or donated services"></label><label>Who gave it? <small>Optional</small><input name="donorName" maxlength="160" placeholder="Donor name for parish records"></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="Fair value"></label><label class="wide">How was the value determined?<textarea name="valuationBasis" maxlength="500" rows="3" required placeholder="Independent appraisal, comparable retail listing, or donor's stated value"></textarea></label><label>Which account should reflect it?<select name="debitAccountId" required><option value="">Choose an asset or expense account</option>${debitOptions}</select></label><label>Which fund?<select name="fundId" required>${accountingSimpleFundOptions(defaultFund?.id || '')}</select></label><label>Date<input name="entryDate" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label></div>${debitOptions ? '' : '<p class="acct-form-status">Add an eligible expense or non-cash asset account before recording this gift.</p>'}<div class="acct-simple-income-foot"><span class="acct-form-status">${escapeHtml(accountingInKindGiftMessage)}</span><button class="acct-primary" ${debitOptions ? '' : 'disabled'}>Post non-cash gift</button></div></form></section>`;
}

function accountingOverviewHero() {
  if (accountingExperienceMode === 'treasurer')
    return `<section class="acct-command-hero">
      <div><span class="acct-kicker">Treasurer view</span><h2>Clarity for every parish dollar.</h2><p>Weekly parish bookkeeping in plain language, backed by the same audited accounting records.</p></div>
      <div class="acct-command-actions acct-command-actions-treasurer"><button onclick="openAccountingSimpleIncome()"><b>＋</b><span>Record Income<small>Cash, checks, and deposits</small></span></button><button onclick="openAccountingSimpleBill()"><b>◇</b><span>Pay a Bill<small>Enter a vendor expense</small></span></button><button onclick="openAccountingInKindGift()"><b>◆</b><span>Record a Non-Cash Gift<small>Donated goods, equipment, or services</small></span></button></div>
    </section>`;
  return `<section class="acct-command-hero">
      <div><span class="acct-kicker">Financial command center</span><h2>Clarity for every parish dollar.</h2><p>Fund accounting, giving, commerce, payables, and bank activity—one balanced set of books.</p></div>
      <div class="acct-command-actions"><button onclick="accountingView='journals';newAccountingJournal()"><b>＋</b><span>New journal<small>Record an entry</small></span></button><button onclick="switchTab('options')"><b>◫</b><span>Manage funds<small>Open Funds &amp; Alms</small></span></button><button onclick="setAccountingView('banking')"><b>⇄</b><span>Reconcile<small>Match the bank</small></span></button><button onclick="setAccountingView('reports')"><b>▤</b><span>Run reports<small>Review results</small></span></button></div>
    </section>`;
}

function accountingOverviewFundSummary(fund, fundActivity) {
  const ledgerBalance = Number(
    fundActivity.find((row) => row.fundId === fund.id || row.code === fund.code)?.endingBalance || 0
  );
  const sourceId = String(fund.givingSourceId || fund.giving_source_id || '');
  const campaign = (currentParish?.campaigns || []).find(
    (item) => item.accountingFundId === fund.id || (sourceId && String(item.id || item.slug || '') === sourceId)
  );
  const raisedCents = Number(campaign?.raisedCents || 0);
  if (String(fund.givingSourceType || fund.giving_source_type) === 'campaign' && !ledgerBalance && raisedCents > 0) {
    return { amount: raisedCents, label: 'Campaign raised', campaignProgress: true };
  }
  return {
    amount: ledgerBalance,
    label: fund.restrictionType || fund.restriction_type || (Number(fund.isDefault) ? 'Unrestricted' : 'Fund'),
    campaignProgress: false,
  };
}

function accountingOverviewFundRank(fund) {
  if (Number(fund.isDefault)) return 0;
  if (String(fund.givingSourceType || fund.giving_source_type) === 'campaign') return 1;
  if (/benevolence/i.test(`${fund.name || ''} ${fund.givingSourceId || fund.giving_source_id || ''}`)) return 2;
  return 3;
}

function renderAccountingOverview(pane) {
  const position = accountingData.reports.position || {},
    activities = accountingData.reports.activities || {};
  const cash = (position.rows || [])
    .filter((row) => row.category === 'asset' && /cash|checking|bank|undeposited/i.test(`${row.accountName || ''}`))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const netAssets = Number(position.totals?.netAssets || 0),
    activity = Number(activities.totals?.changeInNetAssets || 0);
  const posted = accountingData.journals.filter((entry) => ['posted', 'reversed'].includes(entry.status));
  const drafts = accountingData.journals.filter((entry) => entry.status === 'draft').length;
  const payables = accountingData.payables?.overview || {},
    banking = accountingData.banking || {},
    close = accountingData.close || {};
  const fundActivity = accountingData.reports.fundActivity?.rows || [];
  const overviewFunds = accountingData.funds
    .map((fund) => ({ fund, summary: accountingOverviewFundSummary(fund, fundActivity) }))
    .sort(
      (a, b) =>
        accountingOverviewFundRank(a.fund) - accountingOverviewFundRank(b.fund) ||
        String(a.fund.name || '').localeCompare(String(b.fund.name || ''))
    );
  pane.innerHTML = `${accountingOverviewHero()}<div class="acct-suite-stats">
      <div class="acct-suite-stat featured"><span>Cash on hand</span><strong>${accountingMoney(cash)}</strong><small>Across active cash and bank accounts</small></div>
      <div class="acct-suite-stat"><span>Total net assets</span><strong>${accountingMoney(netAssets)}</strong><small>${position.validation?.status === 'validated' ? 'Financial position is balanced' : 'Review the financial position'}</small></div>
      <div class="acct-suite-stat"><span>Current activity</span><strong>${accountingMoney(activity)}</strong><small>${posted.length} posted entries · ${drafts} draft${drafts === 1 ? '' : 's'}</small></div>
      <div class="acct-suite-stat"><span>Tracked funds</span><strong>${accountingData.funds.length}</strong><small>${accountingData.funds.filter((f) => String(f.restrictionType || f.restriction_type).startsWith('donor_restricted')).length} donor restricted</small></div>
    </div><div class="acct-suite-overview-grid"><div><div class="acct-suite-section-head"><h2>Where things stand</h2><span>Open a module to continue</span></div><div class="acct-suite-modules">
      <button class="acct-suite-module" onclick="setAccountingView('payables')"><span>Payables</span><strong>${accountingMoney(payables.openPayables)}</strong><small>${payables.awaitingApproval || 0} awaiting approval</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('banking')"><span>Reconciliation</span><strong>${(banking.sessions || []).filter((item) => item.status !== 'completed').length} open</strong><small>${(banking.accounts || []).length} connected bank account${(banking.accounts || []).length === 1 ? '' : 's'}</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('close')"><span>Period Close</span><strong>${(close.sessions || []).filter((item) => !['completed', 'voided'].includes(item.status)).length} active</strong><small>${(close.sessions || []).filter((item) => item.status === 'completed').length} completed closes</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('budgets')"><span>Budget vs actual</span><strong>${(accountingData.budgets?.items || []).length} plans</strong><small>Open budget versions and variance</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('ledger')"><span>Giving → Ledger</span><strong>${posted.length ? 'In sync' : 'Ready'}</strong><small>${posted.length} posted source entries</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('reports')"><span>Financial reports</span><strong>${position.validation?.status === 'validated' ? 'Balanced' : 'Review'}</strong><small>Statements and trial balance</small></button>
    </div><div class="acct-suite-activity"><div class="acct-suite-section-head"><h2>Recent posted activity</h2><button class="acct-link" onclick="setAccountingView('ledger')">View ledger →</button></div><div class="acct-table-wrap acct-overview-activity-table"><table class="acct-table"><colgroup><col class="date"><col class="entry"><col class="memo"><col class="amount"></colgroup><thead><tr><th>Date</th><th>Entry</th><th>Memo</th><th>Amount</th></tr></thead><tbody>${
      posted
        .slice(0, 5)
        .map(
          (entry) =>
            `<tr><td>${accountingDate(entry.postingDate || entry.entryDate)}</td><td><strong>${escapeHtml(entry.entryNumber || entry.id || '')}</strong></td><td>${escapeHtml(entry.description || entry.memo || '')}</td><td>${accountingMoney(entry.totalDebits || entry.total_debits)}</td></tr>`
        )
        .join('') || '<tr><td colspan="4">Posted activity will appear here.</td></tr>'
    }</tbody></table></div></div></div>
      <aside><div class="acct-suite-section-head"><h2>Fund balances</h2><span>${overviewFunds.length} active</span></div><div class="acct-suite-funds">${overviewFunds.map(({ fund, summary }) => `<div class="acct-suite-fund ${summary.campaignProgress ? 'campaign-progress' : ''}"><div><strong>${escapeHtml(fund.name)}</strong><span>${accountingMoney(summary.amount)}</span></div><small>${escapeHtml(summary.label)}</small></div>`).join('') || '<div class="acct-suite-fund"><strong>No funds configured</strong></div>'}</div><div class="acct-suite-health"><strong>Financial integrity: ${position.validation?.status === 'validated' ? 'healthy' : 'needs review'}</strong><p>The trial balance and financial-position equation are checked whenever reports load.</p></div></aside></div>`;
}

function accountingRegisterModel() {
  const options = accountingData.accounts
    .filter((item) => ['asset', 'liability'].includes(String(item.category || '').toLowerCase()))
    .map((item) => ({
      id: item.id,
      number: String(item.accountNumber || item.account_number || ''),
      name: item.name || 'Account',
      category: item.category,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  if (!options.some((account) => account.number === accountingLedgerAccountNumber)) {
    accountingLedgerAccountNumber =
      options.find((account) => /checking|cash|bank/i.test(account.name))?.number || options[0]?.number || '';
  }
  const account = options.find((item) => item.number === accountingLedgerAccountNumber) ||
    options[0] || { number: '', name: 'Account register' };
  const configuration = accountingData.accounts.find(
    (item) => String(item.accountNumber || item.account_number || '') === account.number
  );
  const creditNormal =
    String(configuration?.normalBalance || configuration?.normal_balance || '').toLowerCase() === 'credit';
  let balance = 0;
  const chronological = accountingData.ledger
    .filter((row) => String(row.accountNumber || row.account_number || '') === account.number)
    .sort(
      (a, b) =>
        String(a.postingDate || a.entryDate || a.date || '').localeCompare(
          String(b.postingDate || b.entryDate || b.date || '')
        ) || String(a.entryNumber || '').localeCompare(String(b.entryNumber || ''))
    )
    .map((row) => {
      const debit = Number(row.debitAmount ?? row.debit_amount ?? 0);
      const credit = Number(row.creditAmount ?? row.credit_amount ?? 0);
      balance += creditNormal ? credit - debit : debit - credit;
      return { ...row, registerBalance: balance };
    });
  const query = accountingLedgerSearch.trim().toLowerCase();
  const visible = query
    ? chronological.filter((row) =>
        [row.entryNumber, row.description, row.fundName, row.fund_name, row.sourceType]
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
    : chronological;
  return {
    account,
    configuration,
    options,
    rows: accountingLedgerNewestFirst ? [...visible].reverse() : visible,
    balance,
    debits: chronological.reduce((sum, row) => sum + Number(row.debitAmount ?? row.debit_amount ?? 0), 0),
    credits: chronological.reduce((sum, row) => sum + Number(row.creditAmount ?? row.credit_amount ?? 0), 0),
  };
}

function accountingRegisterEntryForm(register) {
  const selectedAccountId = register.configuration?.id || register.account.id || '';
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  const fundOptions = accountingData.funds
    .map(
      (fund) =>
        `<option value="${escapeAttr(fund.id)}" ${fund.id === defaultFund?.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  const accountOptions = accountingData.accounts
    .filter((account) => account.id !== selectedAccountId)
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const revenueOptions = accountingData.accounts
    .filter((account) => account.category === 'revenue')
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const today = new Date().toISOString().slice(0, 10);
  const transaction = `<form class="acct-register-entry-form" onsubmit="submitAccountingRegisterEntry(event,'transaction')"><div class="acct-register-entry-grid"><label>Date<input name="entryDate" type="date" required value="${today}"></label><label>Payee / source<input name="payee" maxlength="120" required placeholder="Who was paid or who sent this?"></label><label>Offset account<select name="offsetAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose account</option>${accountOptions}</select></label><label>Fund<select name="fundId" required>${fundOptions}</select></label><label>Check / reference<input name="reference" maxlength="60" placeholder="Optional"></label><label class="wide">Comment<input name="comment" maxlength="240" placeholder="What was this for?"></label><label>Payment<input name="payment" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00"></label><label>Deposit<input name="deposit" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00"></label></div><div class="acct-register-entry-foot"><span class="acct-form-status">Enter either a payment or a deposit.</span><button class="acct-primary">Post transaction</button></div></form>`;
  const contribution = `<form class="acct-register-entry-form" onsubmit="submitAccountingRegisterEntry(event,'contribution')"><div class="acct-register-entry-grid contribution"><label>Date<input name="entryDate" type="date" required value="${today}"></label><label>Contributor<input name="payee" maxlength="120" required placeholder="Name or contribution source"></label><label>Contribution account<select name="offsetAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose income account</option>${revenueOptions}</select></label><label>Fund<select name="fundId" required>${fundOptions}</select></label><label class="wide">Comment<input name="comment" maxlength="240" placeholder="Contribution details"></label><label>Deposit amount<input name="deposit" inputmode="decimal" type="number" min="0.01" step="0.01" required placeholder="0.00"></label></div><div class="acct-register-entry-foot"><span class="acct-form-status">The contribution will increase this register account and the selected fund.</span><button class="acct-primary">Post contribution</button></div></form>`;
  return `<section class="acct-register-entry"><div class="acct-register-entry-tabs"><button type="button" class="${accountingRegisterEntryMode === 'transaction' ? 'active' : ''}" onclick="setAccountingRegisterEntryMode('transaction')">＋ Deposit / Payment</button><button type="button" class="${accountingRegisterEntryMode === 'contribution' ? 'active' : ''}" onclick="setAccountingRegisterEntryMode('contribution')">＋ Contribution</button></div>${accountingRegisterEntryMode === 'contribution' ? contribution : transaction}</section>`;
}

function accountingRecurringPanel(register) {
  const items = accountingData.recurring || [],
    active = items.filter((item) => item.status === 'active');
  if (accountingRecurringEditor) {
    const item = accountingRecurringEditor,
      registerAccounts = accountingData.accounts.filter((account) => ['asset', 'liability'].includes(account.category)),
      expenses = accountingData.accounts.filter((account) => account.category === 'expense'),
      defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    return `<section class="acct-recurring-panel"><div class="acct-recurring-head"><div><span class="acct-kicker">${item.id ? 'Edit schedule' : 'New recurring expense'}</span><h2>${item.id ? escapeHtml(item.name) : 'Set it once. Let AGAPAY post it.'}</h2><p>Due expenses are posted automatically each morning with an auditable journal entry.</p></div><button class="acct-refresh" onclick="accountingRecurringEditor=null;renderAccountingPane()">Cancel</button></div><form class="acct-recurring-form" onsubmit="saveAccountingRecurring(event)"><label>Schedule name<input name="name" required maxlength="120" value="${escapeAttr(item.name || '')}" placeholder="Monthly internet bill"></label><label>Payee<input name="payee" required maxlength="120" value="${escapeAttr(item.payee || '')}" placeholder="Internet provider"></label><label>Pay from<select name="registerAccountId" required>${registerAccounts.map((account) => `<option value="${escapeAttr(account.id)}" ${(item.registerAccountId || register.configuration?.id) === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><label>Expense account<select name="expenseAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose expense</option>${expenses.map((account) => `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}" ${item.expenseAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><label>Fund<select name="fundId" required>${accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}" ${(item.fundId || defaultFund?.id) === fund.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('')}</select></label><label>Amount<input name="amountDollars" required type="number" min=".01" step=".01" value="${item.amount ? (item.amount / 100).toFixed(2) : ''}" placeholder="0.00"></label><label>Frequency<select name="frequency">${[
      ['weekly', 'Weekly'],
      ['biweekly', 'Every two weeks'],
      ['monthly', 'Monthly'],
      ['quarterly', 'Quarterly'],
      ['annual', 'Annually'],
    ]
      .map(
        ([value, label]) => `<option value="${value}" ${item.frequency === value ? 'selected' : ''}>${label}</option>`
      )
      .join(
        ''
      )}</select></label><label>Next posting date<input name="nextPostingDate" required type="date" value="${escapeAttr(item.nextPostingDate || new Date().toISOString().slice(0, 10))}"></label><label>End date <small>Optional</small><input name="endDate" type="date" value="${escapeAttr(item.endDate || '')}"></label><label class="wide">Description<input name="description" maxlength="240" value="${escapeAttr(item.description || '')}" placeholder="What is this recurring expense for?"></label><div class="acct-recurring-foot"><span class="acct-form-status"></span><button class="acct-primary">${item.id ? 'Save schedule' : 'Start schedule'}</button></div></form></section>`;
  }
  return `<section class="acct-recurring-panel compact"><div class="acct-recurring-head"><div><span class="acct-kicker">Automation</span><h2>Recurring expenses</h2><p>${active.length} active schedule${active.length === 1 ? '' : 's'} · Due transactions post automatically each morning.</p></div><button class="acct-primary" onclick="accountingRecurringEditor={};renderAccountingPane()">＋ Schedule expense</button></div><div class="acct-recurring-list">${items.map((item) => `<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.payee)} · ${escapeHtml(item.expenseAccount)} · ${escapeHtml(item.fund)}</small></div><span>${accountingMoney(item.amount)}<small>${escapeHtml(item.frequency)} · next ${accountingDate(item.nextPostingDate)}</small></span><i class="acct-status ${item.status === 'active' ? 'posted' : ''}">${escapeHtml(item.status)}</i><div><button onclick="editAccountingRecurring('${escapeAttr(item.id)}')">Edit</button>${item.status === 'active' ? `<button onclick="toggleAccountingRecurring('${escapeAttr(item.id)}',${item.version},'paused')">Pause</button>` : item.status === 'paused' ? `<button onclick="toggleAccountingRecurring('${escapeAttr(item.id)}',${item.version},'active')">Resume</button>` : ''}</div></article>`).join('') || '<div class="acct-fund-account-empty">No recurring expenses yet.</div>'}</div></section>`;
}

function accountingPledgeAccountSetting(settings = {}) {
  const revenue = accountingData.accounts.filter((account) => account.category === 'revenue');
  return `<label>Pledge comparison account<select id="accountingPledgeComparisonAccount"><option value="">Not configured</option>${revenue.map((account) => `<option value="${escapeAttr(account.id)}" ${settings.pledgeComparisonAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select><small>Choose the general stewardship/offering revenue account. AGAPAY will not guess or change a budget line.</small></label>`;
}

async function submitAccountingSimpleIncome(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button[type="submit"],button.acct-primary');
  const raw = Object.fromEntries(new FormData(form)),
    splitEnabled = form.dataset.splitEnabled === '1';
  const splits = collectAccountingIncomeSplits(form);
  const amount = splitEnabled
    ? Math.round(Number(form.querySelector('[data-income-total]').value) * 100)
    : splits[0]?.amount;
  const allocated = splits.reduce((sum, split) => sum + split.amount, 0);
  if (
    !raw.depositAccountId ||
    !raw.entryDate ||
    !String(raw.description || '').trim() ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    splits.some(
      (split) => !split.revenueAccountId || !split.fundId || !Number.isSafeInteger(split.amount) || split.amount <= 0
    ) ||
    (splitEnabled && allocated !== amount)
  ) {
    status.textContent = 'Complete every field and enter an amount greater than zero.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Recording income…';
  const endpoint = splitEnabled && splits.length > 1 ? '/simple/split-deposits' : '/simple/deposits';
  const body =
    endpoint === '/simple/split-deposits'
      ? {
          entryDate: raw.entryDate,
          description: String(raw.description).trim(),
          depositAccountId: raw.depositAccountId,
          amount,
          splits,
          correlationId: `split-income-ui-${Date.now()}`,
        }
      : {
          entryDate: raw.entryDate,
          description: String(raw.description).trim(),
          depositAccountId: raw.depositAccountId,
          revenueAccountId: splits[0].revenueAccountId,
          fundId: splits[0].fundId,
          amount,
          correlationId: `simple-income-ui-${Date.now()}`,
        };
  const response = await fetch(accountingApi(endpoint), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to record this income.';
    button.disabled = false;
    return;
  }
  accountingSimpleIncomeMessage = `${accountingMoney(amount)} was recorded successfully.`;
  await loadAccountingTab(true);
  accountingView = 'ledger';
  renderAccountingPane();
}

async function submitAccountingInKindGift(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-simple-income-foot .acct-form-status'),
    button = form.querySelector('button.acct-primary');
  const raw = Object.fromEntries(new FormData(form)),
    amount = Math.round(Number(raw.amount) * 100);
  if (
    !String(raw.itemDescription || '').trim() ||
    !String(raw.valuationBasis || '').trim() ||
    !raw.debitAccountId ||
    !raw.fundId ||
    !raw.entryDate ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    status.textContent = 'Describe the gift, explain its valuation, and complete every required field.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Posting non-cash gift…';
  const response = await fetch(accountingApi('/simple/in-kind-gifts'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entryDate: raw.entryDate,
      itemDescription: String(raw.itemDescription).trim(),
      donorName: String(raw.donorName || '').trim(),
      valuationBasis: String(raw.valuationBasis).trim(),
      debitAccountId: raw.debitAccountId,
      fundId: raw.fundId,
      amount,
      correlationId: `in-kind-gift-ui-${Date.now()}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to record this non-cash gift.';
    button.disabled = false;
    return;
  }
  accountingInKindGiftMessage = `${accountingMoney(amount)} for ${String(raw.itemDescription).trim()} posted as a balanced non-cash gift.`;
  await loadAccountingTab(true);
  accountingSimpleEntryMode = 'in-kind';
  accountingView = 'ledger';
  renderAccountingPane();
}
