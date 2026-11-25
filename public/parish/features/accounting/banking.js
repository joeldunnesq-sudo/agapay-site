// Generated from src/browser/parish/features/accounting/banking.ts by npm run build:browser. Do not edit.
'use strict';
function renderAccountingBankStatements(pane) {
  const data = accountingData.banking;
  const closePeriod = accountingCloseTaskCode ? accountingClosePeriod() : null;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading Bank Reconciliation...</p>';
    return;
  }
  const accountOptions = data.accounts
    .map(
      (a) =>
        `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}${a.maskedLast4 ? ` · •••• ${escapeHtml(a.maskedLast4)}` : ''}</option>`
    )
    .join('');
  pane.innerHTML = `<div class="acct-list-head"><div><h2>Match a bank statement</h2><p>Use this after reviewing Giving and Stripe activity for the same period.</p></div></div>
      <div class="acct-kpis"><div><span>Bank accounts</span><strong>${data.accounts.length}</strong></div><div><span>Open reconciliations</span><strong>${data.sessions.filter((s) => ['in_progress', 'reopened'].includes(s.status)).length}</strong></div><div><span>Completed</span><strong>${data.sessions.filter((s) => s.status === 'completed').length}</strong></div></div>
      <div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Step 1</span><h2>Import bank activity</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="previewAccountingBankCsv(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><label>CSV statement<input name="statement" type="file" accept=".csv,text/csv" required></label><button class="acct-primary">Preview import</button><span class="acct-form-status"></span></form>` : '<p>Add a bank account before importing a statement.</p>'}${accountingBankPreview ? `<div class="acct-import-preview"><strong>${accountingBankPreview.validRows} ready</strong><span>${accountingBankPreview.invalidRows} need review · ${accountingMoney(accountingBankPreview.totalCredits)} credits · ${accountingMoney(accountingBankPreview.totalDebits)} debits</span><button class="acct-primary" onclick="commitAccountingBankCsv()">Import transactions</button></div>` : ''}</section>
      <section class="acct-card"><span class="acct-kicker">Step 2</span><h2>Start reconciliation</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="createAccountingReconciliation(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><div class="acct-form-grid"><label>Start<input name="startDate" type="date" value="${escapeAttr(closePeriod?.startDate || '')}" required></label><label>End<input name="endDate" type="date" value="${escapeAttr(closePeriod?.endDate || '')}" required></label><label>Beginning balance<input name="beginningBalance" type="number" step="0.01" required></label><label>Ending balance<input name="endingBalance" type="number" step="0.01" required></label></div><button class="acct-primary">Start reconciliation</button><span class="acct-form-status"></span></form>` : `<p>Create a bank account by linking an asset account in Accounting Setup.</p><button class="acct-primary" onclick="showAccountingBankAccountForm()">Add bank account</button>`}</section></div>
      <div class="acct-list-head"><div><span class="acct-kicker">Step 3</span><h2>Review and finish statements</h2></div>${data.accounts.length ? '<button class="acct-refresh" onclick="showAccountingBankAccountForm()">Add bank account</button>' : ''}</div><div id="accountingPhaseEForm"></div><div class="acct-card-grid">${data.accounts.map((a) => `<article class="acct-budget-card"><div><span>Bank account</span><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.institutionName || 'Institution not set')} ${a.maskedLast4 ? `· •••• ${escapeHtml(a.maskedLast4)}` : ''}</p></div><div class="acct-row-actions"><button onclick="editAccountingBankAccount('${escapeAttr(a.id)}')">Edit bank account</button></div></article>`).join('')}${data.sessions.map((s) => `<article class="acct-budget-card"><div><span>${accountingDate(s.startDate)} – ${accountingDate(s.endDate)}</span><h3>${escapeHtml(s.bankAccountName)}</h3><p>Statement ending ${accountingMoney(s.endingBalance)} · Difference ${accountingMoney(s.difference)}</p></div><span class="acct-status ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span><div class="acct-row-actions"><button onclick="downloadAccountingFile(accountingApi('/bank/reconciliations/${escapeAttr(s.id)}.csv'),'agapay-bank-reconciliation.csv')">Export</button><button onclick="showAccountingEligibleItems('${escapeAttr(s.id)}')">Eligible ledger items</button>${['in_progress', 'reopened'].includes(s.status) ? `<button onclick="openAccountingStatementReview('${escapeAttr(s.id)}')">Review matches</button>` : ''}${['in_progress', 'reopened'].includes(s.status) ? `<button onclick="showAccountingReconciliationAdjustment('${escapeAttr(s.id)}')">Add adjustment</button>` : ''}${['in_progress', 'reopened'].includes(s.status) && Number(s.difference) === 0 && accountingHomeTask !== 'banking' ? `<button onclick="completeAccountingReconciliation('${escapeAttr(s.id)}',${s.version})">Complete</button>` : ''}</div></article>`).join('') || accountingEmpty('No reconciliations yet', 'Import a statement and begin the first period.')}</div>`;
}
function renderAccountingBankAccounts(pane) {
  if (accountingData.bankAccountsUnavailable) {
    pane.innerHTML =
      '<section class="acct-card"><h2>Unable to load bank accounts</h2><button class="acct-refresh" onclick="loadAccountingTab(true)">Retry</button></section>';
    return;
  }
  const accounts = accountingData.bankAccounts;
  pane.innerHTML = `<section class="acct-card"><div class="acct-list-head"><div><h2>Bank accounts</h2><p>Add the checking or savings accounts your parish uses for deposits and statement reconciliation.</p></div><button type="button" class="acct-primary" onclick="showAccountingBankAccountForm()">Add bank account</button><button type="button" class="acct-refresh" onclick="showAccountingBankTransferForm()">Record a transfer</button></div><div id="accountingPhaseEForm"></div><div class="acct-card-grid">${accounts.map((account) => `<article class="acct-budget-card"><div><span>${escapeHtml((account.accountType || 'Bank account').replaceAll('_', ' '))}</span><h3>${escapeHtml(account.name)}</h3><p>${escapeHtml(account.institutionName || '')}${account.maskedLast4 ? ` · •••• ${escapeHtml(account.maskedLast4)}` : ''}</p></div><div class="acct-row-actions"><button onclick="editAccountingBankAccount('${escapeAttr(account.id)}')">Edit bank account</button></div></article>`).join('')}</div></section><section class="acct-card"><h2>Transfer history</h2><div id="accountingTransferHistory"></div></section>`;
  void loadAccountingTransferHistory();
}
function renderAccountingBanking(pane) {
  const tabs = `<div class="acct-reconcile-switch" role="tablist" aria-label="Banking workspace">
      <button type="button" class="${accountingReconciliationView === 'accounts' ? 'active' : ''}" onclick="setAccountingReconciliationView('accounts')">Bank accounts</button>
      <button type="button" class="${accountingReconciliationView === 'giving' ? 'active' : ''}" onclick="setAccountingReconciliationView('giving')">Stripe payouts &amp; funds</button>
      <button type="button" class="${accountingReconciliationView === 'bank' ? 'active' : ''}" onclick="setAccountingReconciliationView('bank')">Bank reconciliation</button>
    </div>`;
  if (accountingReconciliationView !== 'giving') {
    if (accountingReconciliationView === 'accounts') renderAccountingBankAccounts(pane);
    else renderAccountingBankStatements(pane);
    pane.insertAdjacentHTML('afterbegin', tabs);
    return;
  }
  pane.innerHTML = `${tabs}<div class="acct-reconcile-intro"><span class="acct-kicker">Stripe payout review</span><p>Monthly reconciliation shows Stripe payouts, fund allocations, fees, refunds, and exceptions. Then use Bank reconciliation here to match the full parish bank statement to the accounting ledger.</p><button type="button" class="acct-primary" onclick="switchTab('reconcile')">Open Monthly reconciliation</button></div>`;
}
function setAccountingReconciliationView(view) {
  accountingReconciliationView = view;
  renderAccountingPane();
  if (view === 'bank' && !accountingData.banking) void loadAccountingPhaseE();
}
function renderAccountingIntegrationsBase(pane) {
  const data = accountingData.integrations;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading Give & Commerce...</p>';
    return;
  }
  const give = data.give?.totals || data.give || {},
    settings = data.settings || {},
    commerce = data.commerce;
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Automated posting</span><h2>Give & Stripe accounting</h2><p>Donation charges, Stripe fees, refunds, and payouts flow into the ledger with traceable source records.</p></div></div><div class="acct-kpis"><div><span>Source events</span><strong>${give.events || 0}</strong></div><div><span>Gross contributions</span><strong>${accountingMoney(give.grossContributions)}</strong></div><div><span>Stripe fees</span><strong>${accountingMoney(give.stripeFees)}</strong></div></div><div class="acct-setup-grid"><section class="acct-card acct-settings"><span class="acct-kicker">Posting policy</span><h2>Integration settings</h2><label>Posting mode<select id="accountingIntegrationMode"><option value="automatic" ${settings.postingMode === 'automatic' ? 'selected' : ''}>Automatic</option><option value="review_required" ${settings.postingMode === 'review_required' ? 'selected' : ''}>Review before posting</option></select></label><button class="acct-primary" onclick="saveAccountingIntegrationSettings()">Save policy</button></section><section class="acct-card"><span class="acct-kicker">Stripe clearing</span><h2>${accountingMoney(data.clearing?.calculatedBalance)} expected balance</h2><p>${data.clearing?.balanced === false ? 'Review the difference against Stripe before closing the period.' : 'Charges, fees, refunds, and payouts are aligned for this period.'}</p></section></div>${accountingData.tier !== 'advanced_operations' ? accountingParishOnly() : `<div class="acct-list-head"><div><span class="acct-kicker">Parish Commerce</span><h2>Commerce accounting</h2><p>Bookstore and Meals &amp; Events sales, refunds, fees, inventory cost, and sales-tax liability post into one traceable ledger workflow.</p></div><button class="acct-refresh" onclick="downloadAccountingFile(accountingApi('/commerce/sales-tax.csv'),'agapay-commerce-sales-tax.csv')">Export tax report</button></div><div class="acct-kpis"><div><span>Net sales</span><strong>${accountingMoney(commerce?.netSales)}</strong></div><div><span>Sales tax collected</span><strong>${accountingMoney(commerce?.salesTaxCollected)}</strong></div><div><span>Needs review</span><strong>${(commerce?.unposted || 0) + (commerce?.exceptions || 0)}</strong></div></div>`}`;
}
function renderAccountingIntegrations(pane) {
  renderAccountingIntegrationsBase(pane);
  if (accountingData.integrations) {
    renderAccountingServiceInvoices(pane);
    renderAccountingFeeCoverageRepair(pane);
  }
  if (accountingData.tier !== 'advanced_operations' || !accountingData.integrations) return;
  pane.insertAdjacentHTML(
    'beforeend',
    `<div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Commerce item mapping</span><h2>Configure an item</h2><form class="acct-phase-form" onsubmit="configureAccountingCommerceItem(event)"><label>Operational item ID<input name="operationalItemId" required></label><label>Name<input name="name" required></label><label>Revenue account<select name="defaultRevenueAccountId">${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Default fund<select name="defaultFundId">${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><button class="acct-primary">Save commerce item</button><span class="acct-form-status"></span></form></section><section class="acct-card"><span class="acct-kicker">Commerce backfill preview</span><h2>Review historical orders</h2><form class="acct-phase-form" onsubmit="previewAccountingCommerceBackfill(event)"><label>Start<input name="startDate" type="date" required></label><label>End<input name="endDate" type="date" required></label><button class="acct-primary">Preview backfill</button><span class="acct-form-status"></span></form><div id="accountingCommerceBackfillPreview"></div></section></div>`
  );
}
function renderAccountingServiceInvoices(pane) {
  const invoices = accountingData.integrations.give?.serviceInvoices || [];
  const rows = invoices
    .map(
      (row) =>
        `<tr><td>${escapeHtml(String(row.paidAt).slice(0, 10))}</td><td>${escapeHtml(row.planLabel)}<br><small>${escapeHtml(row.invoiceId)}</small></td><td>${escapeHtml(row.currency)} ${(Number(row.amountCents) / 100).toFixed(2)}</td><td>${escapeHtml(row.status.replaceAll('_', ' '))}${row.message ? `<br><small>${escapeHtml(row.message)}</small>` : ''}</td><td>${row.status !== 'posted' ? `<button type="button" class="acct-refresh" data-source-id="${escapeAttr(row.id)}" onclick="postAccountingServiceInvoice(this)">Review &amp; post</button>` : ''}</td></tr>`
    )
    .join('');
  pane.insertAdjacentHTML(
    'beforeend',
    `<section class="acct-card"><span class="acct-kicker">AGAPAY service billing</span><h2>Your plan. Your actual costs.</h2><p>Service subscriptions are recorded separately from Stripe processing and AGAPAY transaction fees. Each entry follows the paid invoice and its billed plan.</p>${rows ? `<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Paid</th><th>Plan / invoice</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No paid service invoices have been captured yet.</p>'}<p class="muted">Up to 100 invoices, with unposted items first. Automatic posting follows your posting policy and open accounting periods. Expense account 5860 holds service costs; match the bank or card payment to AGAPAY Billing Clearing (2180), without booking the expense again. Earlier invoices, refunds and credit notes require reconciliation.</p></section>`
  );
}
async function postAccountingServiceInvoice(button) {
  const id = button.dataset.sourceId;
  if (!id) return;
  button.disabled = true;
  try {
    const payload = await phaseEMutation(`/integrations/service-invoices/${encodeURIComponent(id)}/post`, {});
    if (payload) await loadAccountingPhaseE();
  } finally {
    button.disabled = false;
  }
}
async function configureAccountingCommerceItem(event) {
  event.preventDefault();
  const payload = await phaseEMutation('/commerce/items', Object.fromEntries(new FormData(event.currentTarget)));
  if (payload) event.currentTarget.querySelector('.acct-form-status').textContent = 'Commerce item saved.';
}
async function previewAccountingCommerceBackfill(event) {
  event.preventDefault();
  const payload = await phaseEMutation(
    '/commerce/backfill-preview',
    Object.fromEntries(new FormData(event.currentTarget))
  );
  if (payload) {
    const p = payload.preview || {},
      box = document.getElementById('accountingCommerceBackfillPreview');
    box.innerHTML = `<div class="acct-facts"><div><strong>${p.ordersFound || 0}</strong><span>Orders found</span></div><div><strong>${p.readyToPost || 0}</strong><span>Ready to post</span></div><div><strong>${p.missingMappings || 0}</strong><span>Missing mappings</span></div></div>`;
  }
}
async function loadAccountingPhaseE() {
  const pane = document.getElementById('accountingPane');
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Loading connected accounting...</p>';
  const loading = pane?.firstElementChild;
  const workspace = accountingData;
  try {
    if ((accountingHomeTask === 'banking' || accountingCloseTaskCode) && accountingReconciliationView === 'bank') {
      const [accounts, reconciliations] = await Promise.all([
        accountingDeskRead('/bank/accounts'),
        accountingDeskRead('/bank/reconciliations'),
      ]);
      if (!loading?.isConnected || workspace !== accountingData) return;
      workspace.bankAccounts = accounts.accounts;
      workspace.banking = { accounts: accounts.accounts, sessions: reconciliations.sessions };
      renderAccountingPane();
      return;
    }
    const paths = [
      '/bank/accounts',
      '/bank/reconciliations',
      '/integrations/give-stripe/settings',
      '/integrations/give-stripe/overview',
      '/integrations/give-stripe/clearing',
    ];
    if (accountingData.tier === 'advanced_operations') paths.push('/commerce/overview');
    const responses = await Promise.all(paths.map((path) => fetch(accountingApi(path), { headers: authHeaders() })));
    const payloads = await Promise.all(responses.map((res) => res.json().catch(() => ({}))));
    if (responses[0].ok && Array.isArray(payloads[0].accounts)) {
      accountingData.bankAccounts = payloads[0].accounts;
      accountingData.bankAccountsUnavailable = false;
    }
    const failed = responses.findIndex((res) => !res.ok);
    if (failed >= 0)
      throw new Error(payloads[failed].message || payloads[failed].error || 'Connected accounting is unavailable.');
    const sessions = payloads[1].sessions || [];
    for (const session of sessions.filter((item) => ['in_progress', 'reopened'].includes(item.status))) {
      const response = await fetch(accountingApi('/bank/reconciliations/' + encodeURIComponent(session.id)), {
        headers: authHeaders(),
      });
      const detail = await response.json().catch(() => ({}));
      if (!response.ok || !detail.reconciliation)
        throw new Error(detail.message || detail.error || 'Unable to validate reconciliation totals.');
      Object.assign(session, detail.reconciliation);
    }
    accountingData.banking = { accounts: payloads[0].accounts || [], sessions };
    accountingData.integrations = {
      settings: payloads[2].settings || {},
      give: payloads[3].overview || {},
      clearing: payloads[4].clearing || {},
      commerce: payloads[5]?.overview || null,
    };
    renderAccountingPane();
  } catch (error) {
    if (pane)
      pane.innerHTML = `<div class="acct-empty error"><strong>Unable to load connected accounting</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseE()">Try again</button></div>`;
  }
}
function showAccountingBankAccountForm() {
  const holder = document.getElementById('accountingPhaseEForm');
  if (!holder) return;
  holder.innerHTML = accountingBankAccountForm();
  holder.querySelector('[name="name"]')?.focus();
}
async function loadAccountingTransferHistory(offset = 0) {
  const holder = document.getElementById('accountingTransferHistory');
  if (!holder) return;
  if (!offset) holder.replaceChildren();
  holder.querySelector('[data-transfer-more]')?.remove();
  let page = holder.querySelector('[data-transfer-offset="' + offset + '"]');
  if (!page) {
    page = document.createElement('div');
    page.dataset.transferOffset = String(offset);
    holder.append(page);
  }
  page.innerHTML = '<p role="status">Loading transfers…</p>';
  try {
    const response = await fetch(accountingApi('/bank/transfers?offset=' + offset), { headers: authHeaders() });
    if (!response.ok) throw new Error('Transfer history unavailable');
    const { transfers, nextOffset } = await response.json();
    if (!page.isConnected) return;
    const rows = transfers
      .map(
        (transfer) =>
          `<tr><td>${accountingDate(transfer.date)}</td><td>${escapeHtml(transfer.fromAccount)}</td><td>${escapeHtml(transfer.toAccount)}</td><td>${accountingMoney(transfer.amount)}</td><td>${escapeHtml(transfer.fund || '')}</td><td>${escapeHtml(transfer.description)}${transfer.status === 'reversed' ? ' · Reversed' : ''}</td></tr>`
      )
      .join('');
    page.innerHTML = rows
      ? `<div class="acct-table-wrap"><table class="acct-table" aria-label="Bank transfers"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Fund</th><th>Memo</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p>No transfers recorded in Banking yet.</p>';
    if (nextOffset !== null)
      page.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="acct-refresh" data-transfer-more onclick="loadAccountingTransferHistory(${Number(nextOffset)})">Show older transfers</button>`
      );
  } catch {
    page.innerHTML = `<p role="status">Could not load transfer history.</p><button type="button" class="acct-refresh" data-transfer-more onclick="loadAccountingTransferHistory(${offset})">Retry</button>`;
  }
}
function showAccountingBankTransferForm() {
  const holder = document.getElementById('accountingPhaseEForm');
  if (!holder) return;
  const accounts = accountingData.bankAccounts.filter(
    (bank) => bank.ledgerAccountId && bank.isActive !== false && (!bank.status || bank.status === 'active')
  );
  if (accounts.length < 2) {
    holder.innerHTML =
      '<p role="status">Add two bank accounts before recording a transfer.</p><button type="button" class="acct-refresh" onclick="showAccountingBankAccountForm()">Add bank account</button>';
    return;
  }
  const funds = accountingData.funds.filter((fund) => fund.isActive !== false && !fund.archivedAt);
  const defaultFund = funds.find((fund) => Number(fund.isDefault)) || funds[0];
  const options = accounts
    .map(
      (bank) =>
        `<option value="${escapeAttr(bank.ledgerAccountId)}">${escapeHtml(bank.name)}${bank.maskedLast4 ? ` · •••• ${escapeHtml(bank.maskedLast4)}` : ''}</option>`
    )
    .join('');
  holder.innerHTML = `<form class="acct-phase-form" data-operation-key="${crypto.randomUUID()}" onsubmit="submitAccountingBankTransfer(event)">
    <h3>Record a transfer</h3><p>Use this after money has moved between parish bank accounts. If it came from a check, record the check once in the account that received it first.</p>
    <div class="acct-form-grid">
      <label>From<select name="fromAccountId" required><option value="">Choose sending account</option>${options}</select></label>
      <label>To<select name="toAccountId" required><option value="">Choose receiving account</option>${options}</select></label>
      <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
      <label>Transfer date<input name="entryDate" type="date" value="${/* @__PURE__ */ new Date().toISOString().slice(0, 10)}" required></label>
      <label>Fund<select name="fundId" required>${accountingSimpleFundOptions(defaultFund?.id)}</select><small>Choose the fund the money already belongs to.</small></label>
      <label>Memo (optional)<input name="description" maxlength="240" placeholder="Move funds to savings"></label>
    </div>
    <div class="acct-phase-form-foot"><button type="submit" class="acct-primary">Save transfer</button><button type="button" class="acct-refresh" onclick="renderAccountingPane()">Cancel</button><span class="acct-form-status" role="status"></span></div>
  </form>`;
  holder.querySelector('select')?.focus();
}
async function submitAccountingBankTransfer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.acct-form-status');
  if (button.disabled) return;
  if (!values.fromAccountId || !values.toAccountId || values.fromAccountId === values.toAccountId) {
    status.textContent = 'Choose two different bank accounts.';
    return;
  }
  const amount = Math.round(Number(values.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    status.textContent = 'Enter a transfer amount greater than zero.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Recording transfer…';
  try {
    const payload = await phaseEMutation(
      '/bank/transfers',
      { ...values, amount, operationKey: form.dataset.operationKey },
      'POST',
      form
    );
    if (!payload) return;
    accountingData.banking = null;
    if (!form.isConnected) return;
    const holder = form.parentElement;
    if (holder)
      holder.innerHTML =
        '<p role="status">Transfer recorded. It will appear in both bank accounts for reconciliation.</p>';
    void loadAccountingTransferHistory();
  } catch {
    status.textContent = 'Could not confirm the transfer. Submit these same details again to check or complete it.';
  } finally {
    button.disabled = false;
  }
}
function accountingBankAccountForm() {
  const assets = accountingData.accounts
    .filter(
      (a) =>
        a.category === 'asset' &&
        Boolean(a.isActive) &&
        !accountingData.bankAccounts.some((bank) => bank.ledgerAccountId === a.id)
    )
    .map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`)
    .join('');
  const operatingChecking = accountingData.accounts.find(
    (account) => account.id === 'acct_1010' && Boolean(account.isActive)
  );
  const hint = operatingChecking
    ? `<small>If this is your main checking account, choose ${escapeHtml(operatingChecking.accountNumber)} · ${escapeHtml(operatingChecking.name)}.</small>`
    : '';
  return `<form class="acct-phase-form" onsubmit="createAccountingBankAccount(event)"><div class="acct-form-grid"><label>Account name<input name="name" required placeholder="Operating checking"></label><label>Account type<select name="accountType"><option value="checking">Checking</option><option value="savings">Savings</option><option value="money_market">Money market</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Institution (optional)<input name="institutionName"></label><label>Last four digits (optional)<input name="maskedLast4" maxlength="4" inputmode="numeric" pattern="[0-9]{4}"></label><label>Matching ledger account<select name="ledgerAccountId" required onchange="toggleAccountingNewBankLedger(this)"><option value="">Choose an existing ledger account</option>${assets}<option value="new">Create a ledger account for this bank account</option></select>${hint}</label></div><p data-new-bank-ledger hidden>AGAPAY will create a separate cash ledger account with this name. You can record deposits after saving.</p><button class="acct-primary">Save bank account</button><span class="acct-form-status" role="status"></span></form>`;
}
function toggleAccountingNewBankLedger(select) {
  const details = select.form?.querySelector('[data-new-bank-ledger]');
  if (details) details.hidden = select.value !== 'new';
}
async function phaseEMutation(path, body, method = 'POST', form) {
  const res = await fetch(accountingApi(path), {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = (form || document).querySelector('.acct-form-status');
    if (status) status.textContent = payload.message || payload.error;
    else alert(payload.message || payload.error);
    return null;
  }
  return payload;
}
async function createAccountingBankAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = form.querySelector('.acct-form-status');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = 'Saving bank account…';
  try {
    const payload = await phaseEMutation(
      '/bank/accounts',
      {
        ...Object.fromEntries(new FormData(form)),
        isDefault: !accountingData.bankAccounts.length,
      },
      'POST',
      form
    );
    if (!payload) return;
    if (!payload.account) throw new Error('Missing saved bank account');
    accountingData.bankAccounts = [...accountingData.bankAccounts, payload.account];
    accountingData.bankAccountsUnavailable = false;
    accountingData.banking = null;
    if (!form.isConnected) return;
    if (accountingView === 'banking') {
      if (accountingReconciliationView === 'accounts') {
        renderAccountingPane();
        const holder = document.getElementById('accountingPhaseEForm');
        if (holder) holder.innerHTML = '<p role="status">Bank account saved.</p>';
      } else await loadAccountingPhaseE();
    } else {
      accountingSimpleIncomeMessage = 'Bank account saved. Enter the deposit details below.';
      renderAccountingPane();
    }
  } catch {
    status.textContent = 'Could not confirm whether the account was saved. Refresh Accounting before trying again.';
  } finally {
    button.disabled = false;
  }
}
async function previewAccountingBankCsv(event) {
  event.preventDefault();
  const form = event.currentTarget,
    file = form.elements.statement.files[0];
  const payload = await phaseEMutation('/bank/imports/preview', { filename: file.name, csv: await file.text() });
  if (payload) {
    accountingBankPreview = {
      ...payload.preview,
      bankAccountId: form.elements.bankAccountId.value,
    };
    renderAccountingPane();
  }
}
async function commitAccountingBankCsv() {
  if (!accountingBankPreview) return;
  if (
    await phaseEMutation('/bank/imports/commit', {
      bankAccountId: accountingBankPreview.bankAccountId,
      preview: accountingBankPreview,
    })
  ) {
    accountingBankPreview = null;
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}
async function createAccountingReconciliation(event) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget));
  raw.beginningBalance = Math.round(Number(raw.beginningBalance) * 100);
  raw.endingBalance = Math.round(Number(raw.endingBalance) * 100);
  const result = await phaseEMutation('/bank/reconciliations', raw);
  if (result) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}
async function openAccountingStatementReview(id) {
  const holder = document.getElementById('accountingPhaseEForm');
  if (!holder) return;
  holder.innerHTML =
    '<section class="acct-card"><p role="status">Reading the statement and looking for matches…</p></section>';
  const loading = holder.firstElementChild;
  const path = `/bank/reconciliations/${encodeURIComponent(id)}`;
  try {
    const [{ reconciliation }, suggestions] = await Promise.all([
      accountingDeskRead(path),
      accountingDeskRead(`${path}/suggestions?review=1`).catch(() => null),
    ]);
    if (!loading?.isConnected) return;
    if (!reconciliation) throw new Error('This statement could not be found.');
    const { bankAccount, startDate, endDate, difference, version, status } = reconciliation;
    const editable = ['in_progress', 'reopened'].includes(status);
    const candidates = (suggestions?.suggestions || []).filter((item) => item.bankDate && item.ledgerDate);
    const unmatched = suggestions?.bankItems?.length;
    holder.innerHTML = `<section class="acct-card acct-statement-review" tabindex="-1">
      <div class="acct-list-head"><div><h2>${escapeHtml(bankAccount.name)}</h2><p>${accountingDate(startDate)} – ${accountingDate(endDate)}</p></div><button type="button" class="acct-link" onclick="this.closest('section').remove()">Back to statements</button></div>
      <div class="acct-kpis"><div><span>Statement balance</span><strong>${accountingMoney(reconciliation.endingBalance)}</strong></div><div><span>Book balance</span><strong>${accountingMoney(reconciliation.ledgerEndingBalance)}</strong></div><div><span>Remaining difference</span><strong>${accountingMoney(difference)}</strong></div></div>
      ${
        editable
          ? `<h3>Check suggested matches</h3><p>Compare each bank transaction with the entry in your books. Confirm only when they describe the same transaction.</p>
        ${suggestions ? '' : '<p>Suggested matches are unavailable.</p>'}
        <ul class="acct-statement-matches">${candidates.map((item) => `<li><div><small>Bank · ${accountingDate(item.bankDate)}</small><strong>${escapeHtml(item.bankDescription || 'Bank transaction')}</strong></div><div><small>Books · ${accountingDate(item.ledgerDate)}</small><strong>${escapeHtml(item.ledgerDescription || item.entryNumber || 'Book entry')}</strong></div><div><strong>${accountingMoney(item.direction === 'debit' ? -item.amount : item.amount)}</strong><small>${escapeHtml((item.reasons || []).join(', '))}</small></div><button type="button" onclick="confirmAccountingStatementMatch(this,'${escapeAttr(id)}','${escapeAttr(item.bankTransactionId)}','${escapeAttr(item.journalLineId)}')">Confirm match</button></li>`).join('')}</ul>
        ${unmatched === 0 ? '<p>All imported transactions for this statement period have been matched. Check the uploaded file covered the entire statement.</p>' : unmatched ? `<p>${unmatched} imported ${unmatched === 1 ? 'transaction needs' : 'transactions need'} a match.</p>` : ''}
        ${unmatched && suggestions ? accountingManualStatementMatch(id, suggestions) : ''}
        <div class="acct-row-actions"><button type="button" onclick="showAccountingEligibleItems('${escapeAttr(id)}')">Review unmatched book entries</button><button type="button" onclick="showAccountingReconciliationAdjustment('${escapeAttr(id)}')">Record an adjustment</button>${difference === 0 && unmatched === 0 ? `<button type="button" class="acct-primary" onclick="completeAccountingStatementReview(this,'${escapeAttr(id)}',${Number(version)})">Mark statement reconciled</button>` : ''}</div>
        <p class="acct-form-status" role="status"></p>`
          : `<p>${status === 'completed' ? 'This statement is reconciled.' : 'This statement is closed to changes.'}</p>`
      }
      </section>`;
    holder.querySelector('.acct-statement-review')?.focus();
  } catch (error) {
    if (loading?.isConnected)
      loading.querySelector('[role="status"]').textContent = error instanceof Error ? error.message : String(error);
  }
}
function accountingManualStatementMatch(id, { bankItems, ledgerItems }) {
  const choices = (name, items) =>
    items
      .map(
        ({ id: id2, date, description, amount }) =>
          `<label><input type="checkbox" name="${name}" value="${escapeAttr(id2)}"> <span>${accountingDate(date)} · ${escapeHtml(description || 'Transaction')} · ${accountingMoney(amount)}</span></label>`
      )
      .join('');
  return `<details class="acct-statement-manual"><summary>Choose transactions yourself</summary><form onsubmit="submitAccountingManualMatch(event,'${escapeAttr(id)}')"><p>Select the bank and book entries that belong together. Their totals must match.</p><div class="acct-statement-choice-grid"><fieldset><legend>On the bank statement</legend>${choices('bank', bankItems)}</fieldset><fieldset><legend>In the books</legend>${
    choices(
      'ledger',
      (ledgerItems || []).map((item) => ({
        id: item.journalLineId,
        date: item.postingDate,
        description: item.description || item.entryNumber,
        amount: item.netEffect,
      }))
    ) || '<p>No unmatched book entries are available.</p>'
  }</fieldset></div><button type="submit" class="acct-primary">Confirm selected match</button></form></details>`;
}
function submitAccountingManualMatch(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const selected = new FormData(form);
  saveAccountingStatementMatch(
    form.querySelector('button'),
    id,
    selected.getAll('bank').map(String),
    selected.getAll('ledger').map(String)
  );
}
function confirmAccountingStatementMatch(button, id, bankTransactionId, journalLineId) {
  saveAccountingStatementMatch(button, id, [bankTransactionId], [journalLineId]);
}
async function saveAccountingStatementMatch(button, id, bankTransactionIds, journalLineIds) {
  const review = button.closest('section');
  const buttons = [...review.querySelectorAll('button')];
  const status = review.querySelector('[role="status"]');
  if (!bankTransactionIds.length || !journalLineIds.length) {
    status.textContent = 'Choose at least one bank transaction and one book entry.';
    return;
  }
  const matchType = `${bankTransactionIds.length === 1 ? 'one' : 'many'}_to_${journalLineIds.length === 1 ? 'one' : 'many'}`;
  buttons.forEach((control) => {
    control.disabled = true;
  });
  status.textContent = 'Confirming the match…';
  try {
    const result = await phaseEMutation(
      `/bank/reconciliations/${encodeURIComponent(id)}/matches`,
      {
        bankTransactionIds,
        journalLineIds,
        matchType,
      },
      'POST',
      review
    );
    if (result && review.isConnected) await openAccountingStatementReview(id);
  } catch {
    if (review.isConnected)
      status.textContent = 'Unable to confirm the match. Reopen the statement to see its current status.';
  } finally {
    buttons.forEach((control) => {
      control.disabled = false;
    });
  }
}
async function completeAccountingStatementReview(button, id, version) {
  if (!confirm('Do the matched entries agree with this bank statement? Completing it saves the reconciliation.'))
    return;
  button.disabled = true;
  try {
    await completeAccountingReconciliation(id, version, button.closest('section'));
  } catch {
    button.closest('section').querySelector('[role="status"]').textContent =
      'Unable to complete the reconciliation. Reopen the statement to check its status.';
  } finally {
    button.disabled = false;
  }
}
async function completeAccountingReconciliation(id, version, holder) {
  if (
    await phaseEMutation(
      `/bank/reconciliations/${encodeURIComponent(id)}/complete`,
      { expectedVersion: version },
      'POST',
      holder
    )
  ) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}
function editAccountingBankAccount(id) {
  const a = accountingData.bankAccounts.find((item) => item.id === id);
  if (!a) return;
  const holder = document.getElementById('accountingPhaseEForm');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="updateAccountingBankAccount(event,'${escapeAttr(id)}',${a.version})"><div class="acct-form-grid"><label>Name<input name="name" value="${escapeAttr(a.name)}" required></label><label>Institution<input name="institutionName" value="${escapeAttr(a.institutionName || '')}"></label><label>Last four<input name="maskedLast4" maxlength="4" value="${escapeAttr(a.maskedLast4 || '')}"></label></div><button class="acct-primary">Save bank account</button><span class="acct-form-status"></span></form>`;
}
async function updateAccountingBankAccount(event, id, expectedVersion) {
  event.preventDefault();
  const patch = Object.fromEntries(new FormData(event.currentTarget));
  const payload = await phaseEMutation(
    `/bank/accounts/${encodeURIComponent(id)}`,
    { expectedVersion, patch },
    'PATCH',
    event.currentTarget
  );
  if (!payload?.account) return;
  const account = payload.account;
  accountingData.bankAccounts = accountingData.bankAccounts.map((item) => (item.id === id ? account : item));
  accountingData.banking = null;
  if (accountingReconciliationView === 'accounts') renderAccountingPane();
  else await loadAccountingPhaseE();
}
async function showAccountingEligibleItems(id) {
  const res = await fetch(accountingApi(`/bank/reconciliations/${encodeURIComponent(id)}/eligible-items`), {
      headers: authHeaders(),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error);
    return;
  }
  const holder = document.getElementById('accountingPhaseEForm');
  holder.innerHTML = `<section class="acct-card"><span class="acct-kicker">Reconciliation session detail</span><h2>Available to match</h2><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Net effect</th></tr></thead><tbody>${(payload.items || []).map((item) => `<tr><td>${accountingDate(item.postingDate)}</td><td>${escapeHtml(item.entryNumber || item.journalEntryId)}</td><td>${escapeHtml(item.description || '')}</td><td>${accountingMoney(item.netEffect)}</td></tr>`).join('') || '<tr><td colspan="4">No eligible items.</td></tr>'}</tbody></table></div><div data-accounting-attachments></div></section>`;
  renderAccountingAttachments('reconciliation_session', id, holder.querySelector('[data-accounting-attachments]'));
}
function showAccountingReconciliationAdjustment(id) {
  const holder = document.getElementById('accountingPhaseEForm'),
    accounts = accountingData.accounts
      .map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`)
      .join(''),
    funds = accountingData.funds
      .map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`)
      .join('');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="postAccountingReconciliationAdjustment(event,'${escapeAttr(id)}')"><h2>Reconciliation adjustment</h2><div class="acct-form-grid"><label>Date<input name="date" type="date" required value="${/* @__PURE__ */ new Date().toISOString().slice(0, 10)}"></label><label>Description<input name="description" required></label><label>Amount<input name="amount" type="number" min=".01" step=".01" required></label><label>Bank direction<select name="direction"><option value="credit">Increase bank</option><option value="debit">Decrease bank</option></select></label><label>Offset account<select name="offsetAccountId">${accounts}</select></label><label>Fund<select name="fundId">${funds}</select></label><label>Reason<input name="reason" required></label></div><button class="acct-primary">Post adjustment</button><span class="acct-form-status"></span></form>`;
}
async function postAccountingReconciliationAdjustment(event, id) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget));
  raw.amount = Math.round(Number(raw.amount) * 100);
  raw.idempotencyKey = `reconciliation-ui-${id}-${Date.now()}`;
  if (await phaseEMutation(`/bank/reconciliations/${encodeURIComponent(id)}/adjustments`, raw)) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}
async function saveAccountingIntegrationSettings() {
  const patch = { postingMode: document.getElementById('accountingIntegrationMode').value };
  const payload = await phaseEMutation(
    '/integrations/give-stripe/settings',
    { expectedVersion: accountingData.integrations.settings.version, patch },
    'PATCH'
  );
  if (payload) {
    accountingData.integrations.settings = payload.settings;
    renderAccountingPane();
  }
}
let accountingMatchSuggestions = [];
async function showAccountingMatchSuggestions(id) {
  const holder = document.getElementById('accountingPhaseEForm');
  holder.innerHTML = '<p class="sw-tool-loading">Checking bank matches…</p>';
  try {
    const response = await fetch(accountingApi('/bank/reconciliations/' + encodeURIComponent(id) + '/suggestions'), {
      headers: authHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to load matches.');
    accountingMatchSuggestions = payload.suggestions || [];
    const itemsResponse = await fetch(
      accountingApi('/bank/reconciliations/' + encodeURIComponent(id) + '/eligible-items'),
      {
        headers: authHeaders(),
      }
    );
    const itemsPayload = await itemsResponse.json().catch(() => ({}));
    if (!itemsResponse.ok)
      throw new Error(itemsPayload.message || itemsPayload.error || 'Unable to load ledger details.');
    const ledgerItems = new Map((itemsPayload.items || []).map((item) => [item.journalLineId, item]));
    holder.innerHTML =
      '<section class="acct-card"><h2>Review suggested matches</h2><p>Confirm that each statement transaction corresponds to the ledger entry before matching.</p><div class="acct-form-status" role="status"></div>' +
      accountingMatchSuggestions
        .map(
          (item, index) =>
            '<div class="acct-budget-card"><strong>' +
            accountingMoney(item.amount) +
            '</strong><p>' +
            escapeHtml(item.reasons.join(' · ')) +
            '</p><p>' +
            escapeHtml(ledgerItems.get(item.journalLineId)?.description || '') +
            '</p><small>' +
            escapeHtml(ledgerItems.get(item.journalLineId)?.postingDate || '') +
            ' · ' +
            escapeHtml(ledgerItems.get(item.journalLineId)?.entryNumber || item.journalEntryId) +
            '</small><button type="button" class="acct-primary" data-reconciliation="' +
            escapeAttr(id) +
            '" onclick="confirmAccountingSuggestedMatch(this.dataset.reconciliation,' +
            index +
            ',this)">Confirm match</button></div>'
        )
        .join('') +
      (accountingMatchSuggestions.length ? '' : '<p>No suggested matches remain.</p>') +
      '</section>';
    holder.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    holder.innerHTML = accountingEmpty('Matches unavailable', error.message);
  }
}
async function confirmAccountingSuggestedMatch(id, index, button) {
  const match = accountingMatchSuggestions[index];
  if (!match) return;
  button.disabled = true;
  try {
    const result = await phaseEMutation('/bank/reconciliations/' + encodeURIComponent(id) + '/matches', {
      bankTransactionIds: [match.bankTransactionId],
      journalLineIds: [match.journalLineId],
    });
    if (result) {
      accountingData.banking = null;
      await loadAccountingPhaseE();
      await showAccountingMatchSuggestions(id);
    }
  } catch (error) {
    const status = document.querySelector('#accountingPhaseEForm .acct-form-status');
    if (status) status.textContent = error.message || 'Unable to confirm the match. Please try again.';
  } finally {
    button.disabled = false;
  }
}
function renderAccountingFeeCoverageRepair(pane) {
  const card = document.createElement('section');
  card.className = 'acct-card acct-settings';
  card.innerHTML =
    '<span class="acct-kicker">Contribution accuracy</span><h2>Donor fee-covering gifts</h2><p>Recognize voluntary additions omitted from older giving imports. Preview a batch before applying it. Posted journals stay intact; missing additions create linked contribution entries under your posting policy.</p><label>Calendar year<input data-fee-repair-year type="number" min="2000" max="2200" value="' +
    /* @__PURE__ */ new Date().getFullYear() +
    '"></label><button class="acct-primary" type="button" onclick="previewAccountingFeeCoverage(this)">Preview historical gifts</button><div data-fee-repair-output role="status" aria-live="polite"></div>';
  pane.append(card);
}
async function previewAccountingFeeCoverage(button, apply = false, next = false) {
  const card = button.closest('.acct-card');
  const box = card.querySelector('[data-fee-repair-output]');
  const year = Number(card.querySelector('[data-fee-repair-year]').value);
  const prior = card.feeCoveragePreview;
  const afterId = next ? prior?.nextCursor || '' : apply ? prior?.afterId || '' : '';
  if (apply && (!prior || prior.year !== year)) {
    box.textContent = 'Preview this year before applying additions.';
    return;
  }
  const body = { year, afterId, apply, expectedAdditions: apply ? prior.additions : [] };
  card.querySelectorAll('button').forEach((item) => {
    item.disabled = true;
  });
  box.textContent = apply ? 'Recognizing reviewed contributions…' : 'Reviewing historical gifts…';
  try {
    const response = await fetch(accountingApi('/integrations/give-stripe/fee-coverage-backfill'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to review fee-covering gifts.');
    const result = payload.feeCoverage;
    card.feeCoveragePreview = { ...result, afterId };
    const posted = result.additions.filter((item) => item.status === 'posted').length;
    box.innerHTML =
      '<p><strong>' +
      (apply
        ? posted + ' additions posted; ' + (result.additions.length - posted) + ' require review.'
        : result.additions.length + ' missing additions · ' + accountingMoney(result.totalCents)) +
      '</strong><br>' +
      result.scanned +
      ' gifts reviewed in this batch.</p>' +
      (!apply && result.additions.length
        ? '<button type="button" class="acct-primary" onclick="previewAccountingFeeCoverage(this,true)">Recognize reviewed additions</button>'
        : '') +
      (result.nextCursor
        ? '<button type="button" class="acct-refresh" onclick="previewAccountingFeeCoverage(this,false,true)">Preview next batch</button>'
        : '<p>End of this year’s history.</p>');
  } catch (error) {
    box.textContent = error.message;
  } finally {
    card.querySelectorAll('button').forEach((item) => {
      item.disabled = false;
    });
  }
}
