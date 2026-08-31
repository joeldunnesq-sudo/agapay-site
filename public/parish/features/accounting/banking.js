'use strict';

// Parish dashboard accounting: banking.
// Classic script; preserve global names used by the dashboard and inline actions.

function renderAccountingBankStatements(pane) {
  const data = accountingData.banking;
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
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Double-entry bank reconciliation</span><h2>Match statements to the ledger</h2><p>Use this after reviewing Giving and Stripe activity for the same period.</p></div></div>
      <div class="acct-kpis"><div><span>Bank accounts</span><strong>${data.accounts.length}</strong></div><div><span>Open reconciliations</span><strong>${data.sessions.filter((s) => s.status !== 'completed').length}</strong></div><div><span>Completed</span><strong>${data.sessions.filter((s) => s.status === 'completed').length}</strong></div></div>
      <div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Statement import</span><h2>Import bank activity</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="previewAccountingBankCsv(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><label>CSV statement<input name="statement" type="file" accept=".csv,text/csv" required></label><button class="acct-primary">Preview import</button><span class="acct-form-status"></span></form>` : '<p>Add a bank account before importing a statement.</p>'}${accountingBankPreview ? `<div class="acct-import-preview"><strong>${accountingBankPreview.validRows} ready</strong><span>${accountingBankPreview.invalidRows} need review · ${accountingMoney(accountingBankPreview.totalCredits)} credits · ${accountingMoney(accountingBankPreview.totalDebits)} debits</span><button class="acct-primary" onclick="commitAccountingBankCsv()">Import transactions</button></div>` : ''}</section>
      <section class="acct-card"><span class="acct-kicker">New statement period</span><h2>Start reconciliation</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="createAccountingReconciliation(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><div class="acct-form-grid"><label>Start<input name="startDate" type="date" required></label><label>End<input name="endDate" type="date" required></label><label>Beginning balance<input name="beginningBalance" type="number" step="0.01" required></label><label>Ending balance<input name="endingBalance" type="number" step="0.01" required></label></div><button class="acct-primary">Start reconciliation</button><span class="acct-form-status"></span></form>` : `<p>Create a bank account by linking an asset account in Accounting Setup.</p><button class="acct-primary" onclick="showAccountingBankAccountForm()">Add bank account</button>`}</section></div>
      <div class="acct-list-head"><div><span class="acct-kicker">Statement history</span><h2>Reconciliation sessions</h2></div>${data.accounts.length ? '<button class="acct-refresh" onclick="showAccountingBankAccountForm()">Add bank account</button>' : ''}</div><div id="accountingPhaseEForm"></div><div class="acct-card-grid">${data.accounts.map((a) => `<article class="acct-budget-card"><div><span>Bank account</span><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.institutionName || 'Institution not set')} ${a.maskedLast4 ? `· •••• ${escapeHtml(a.maskedLast4)}` : ''}</p></div><div class="acct-row-actions"><button onclick="editAccountingBankAccount('${escapeAttr(a.id)}')">Edit bank account</button></div></article>`).join('')}${data.sessions.map((s) => `<article class="acct-budget-card"><div><span>${accountingDate(s.startDate)} – ${accountingDate(s.endDate)}</span><h3>${escapeHtml(s.bankAccountName)}</h3><p>Statement ending ${accountingMoney(s.endingBalance)} · Difference ${accountingMoney(s.difference)}</p></div><span class="acct-status ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span><div class="acct-row-actions"><button onclick="downloadAccountingFile(accountingApi('/bank/reconciliations/${escapeAttr(s.id)}.csv'),'agapay-bank-reconciliation.csv')">Export</button><button onclick="showAccountingEligibleItems('${escapeAttr(s.id)}')">Eligible ledger items</button>${s.status !== 'completed' ? `<button onclick="showAccountingReconciliationAdjustment('${escapeAttr(s.id)}')">Add adjustment</button>` : ''}${s.status !== 'completed' && Number(s.difference) === 0 ? `<button onclick="completeAccountingReconciliation('${escapeAttr(s.id)}',${s.version})">Complete</button>` : ''}</div></article>`).join('') || accountingEmpty('No reconciliations yet', 'Import a statement and begin the first period.')}</div>`;
}

function renderAccountingBanking(pane) {
  const tabs = `<div class="acct-reconcile-switch" role="tablist" aria-label="Reconciliation workspace">
      <button type="button" class="${accountingReconciliationView === 'giving' ? 'active' : ''}" onclick="setAccountingReconciliationView('giving')">Giving &amp; Stripe</button>
      <button type="button" class="${accountingReconciliationView === 'bank' ? 'active' : ''}" onclick="setAccountingReconciliationView('bank')">Bank statements &amp; ledger</button>
    </div>`;
  if (accountingReconciliationView === 'bank') {
    renderAccountingBankStatements(pane);
    pane.insertAdjacentHTML('afterbegin', tabs);
    return;
  }
  pane.innerHTML = `${tabs}<div class="acct-reconcile-intro"><span class="acct-kicker">Connected giving activity</span><p>Review Stripe deposits, fund allocations, fees, refunds, and exceptions before completing the formal bank-statement reconciliation.</p></div>`;
  const workspace = document.getElementById('reconcileWorkspace');
  if (workspace) pane.append(workspace);
  loadReconciliation();
}

function setAccountingReconciliationView(view) {
  accountingReconciliationView = view === 'bank' ? 'bank' : 'giving';
  renderAccountingPane();
}

function renderAccountingIntegrationsBase(pane) {
  const data = accountingData.integrations;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading Give & Commerce...</p>';
    return;
  }
  const give = data.give || {},
    settings = data.settings || {},
    commerce = data.commerce;
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Automated posting</span><h2>Give & Stripe accounting</h2><p>Donation charges, Stripe fees, refunds, and payouts flow into the ledger with traceable source records.</p></div></div><div class="acct-kpis"><div><span>Source events</span><strong>${give.events || 0}</strong></div><div><span>Gross contributions</span><strong>${accountingMoney(give.grossContributions)}</strong></div><div><span>Stripe fees</span><strong>${accountingMoney(give.stripeFees)}</strong></div></div><div class="acct-setup-grid"><section class="acct-card acct-settings"><span class="acct-kicker">Posting policy</span><h2>Integration settings</h2><label>Posting mode<select id="accountingIntegrationMode"><option value="automatic" ${settings.postingMode === 'automatic' ? 'selected' : ''}>Automatic</option><option value="review" ${settings.postingMode === 'review' ? 'selected' : ''}>Review before posting</option></select></label><button class="acct-primary" onclick="saveAccountingIntegrationSettings()">Save policy</button></section><section class="acct-card"><span class="acct-kicker">Stripe clearing</span><h2>${accountingMoney(data.clearing?.calculatedBalance)} expected balance</h2><p>${data.clearing?.balanced === false ? 'Review the difference against Stripe before closing the period.' : 'Charges, fees, refunds, and payouts are aligned for this period.'}</p></section></div>${accountingData.tier !== 'advanced_operations' ? accountingParishOnly() : `<div class="acct-list-head"><div><span class="acct-kicker">Parish Commerce</span><h2>Commerce accounting</h2><p>Bookstore and Meals &amp; Events sales, refunds, fees, inventory cost, and sales-tax liability post into one traceable ledger workflow.</p></div><button class="acct-refresh" onclick="downloadAccountingFile(accountingApi('/commerce/sales-tax.csv'),'agapay-commerce-sales-tax.csv')">Export tax report</button></div><div class="acct-kpis"><div><span>Net sales</span><strong>${accountingMoney(commerce?.netSales)}</strong></div><div><span>Sales tax collected</span><strong>${accountingMoney(commerce?.salesTaxCollected)}</strong></div><div><span>Needs review</span><strong>${(commerce?.unposted || 0) + (commerce?.exceptions || 0)}</strong></div></div>`}`;
}

function renderAccountingIntegrations(pane) {
  renderAccountingIntegrationsBase(pane);
  if (accountingData.tier !== 'advanced_operations' || !accountingData.integrations) return;
  pane.insertAdjacentHTML(
    'beforeend',
    `<div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Commerce item mapping</span><h2>Configure an item</h2><form class="acct-phase-form" onsubmit="configureAccountingCommerceItem(event)"><label>Operational item ID<input name="operationalItemId" required></label><label>Name<input name="name" required></label><label>Revenue account<select name="defaultRevenueAccountId">${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Default fund<select name="defaultFundId">${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><button class="acct-primary">Save commerce item</button><span class="acct-form-status"></span></form></section><section class="acct-card"><span class="acct-kicker">Commerce backfill preview</span><h2>Review historical orders</h2><form class="acct-phase-form" onsubmit="previewAccountingCommerceBackfill(event)"><label>Start<input name="startDate" type="date" required></label><label>End<input name="endDate" type="date" required></label><button class="acct-primary">Preview backfill</button><span class="acct-form-status"></span></form><div id="accountingCommerceBackfillPreview"></div></section></div>`
  );
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
  try {
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
    const failed = responses.findIndex((res) => !res.ok);
    if (failed >= 0)
      throw new Error(payloads[failed].message || payloads[failed].error || 'Connected accounting is unavailable.');
    accountingData.banking = { accounts: payloads[0].accounts || [], sessions: payloads[1].sessions || [] };
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
  const assets = accountingData.accounts
    .filter((a) => a.category === 'asset')
    .map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`)
    .join('');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingBankAccount(event)"><div class="acct-form-grid"><label>Account name<input name="name" required placeholder="Operating checking"></label><label>Institution<input name="institutionName"></label><label>Last four digits<input name="maskedLast4" maxlength="4" inputmode="numeric"></label><label>Ledger asset account<select name="ledgerAccountId" required>${assets}</select></label></div><button class="acct-primary">Add bank account</button><span class="acct-form-status"></span></form>`;
}

async function phaseEMutation(path, body, method = 'POST') {
  const res = await fetch(accountingApi(path), {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = document.querySelector('.acct-form-status');
    if (status) status.textContent = payload.message || payload.error;
    else alert(payload.message || payload.error);
    return null;
  }
  return payload;
}

async function createAccountingBankAccount(event) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget));
  if (
    await phaseEMutation('/bank/accounts', {
      ...raw,
      accountType: 'checking',
      isDefault: !accountingData.banking.accounts.length,
    })
  ) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}

async function previewAccountingBankCsv(event) {
  event.preventDefault();
  const form = event.currentTarget,
    file = form.elements.statement.files[0];
  const payload = await phaseEMutation('/bank/imports/preview', { filename: file.name, csv: await file.text() });
  if (payload) {
    accountingBankPreview = { ...payload.preview, bankAccountId: form.elements.bankAccountId.value };
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
  if (await phaseEMutation('/bank/reconciliations', raw)) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}

async function completeAccountingReconciliation(id, version) {
  if (await phaseEMutation(`/bank/reconciliations/${encodeURIComponent(id)}/complete`, { expectedVersion: version })) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
}

function editAccountingBankAccount(id) {
  const a = accountingData.banking.accounts.find((item) => item.id === id);
  if (!a) return;
  const holder = document.getElementById('accountingPhaseEForm');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="updateAccountingBankAccount(event,'${escapeAttr(id)}',${a.version})"><div class="acct-form-grid"><label>Name<input name="name" value="${escapeAttr(a.name)}" required></label><label>Institution<input name="institutionName" value="${escapeAttr(a.institutionName || '')}"></label><label>Last four<input name="maskedLast4" maxlength="4" value="${escapeAttr(a.maskedLast4 || '')}"></label></div><button class="acct-primary">Save bank account</button><span class="acct-form-status"></span></form>`;
}

async function updateAccountingBankAccount(event, id, expectedVersion) {
  event.preventDefault();
  const patch = Object.fromEntries(new FormData(event.currentTarget));
  if (await phaseEMutation(`/bank/accounts/${encodeURIComponent(id)}`, { expectedVersion, patch }, 'PATCH')) {
    accountingData.banking = null;
    await loadAccountingPhaseE();
  }
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
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="postAccountingReconciliationAdjustment(event,'${escapeAttr(id)}')"><h2>Reconciliation adjustment</h2><div class="acct-form-grid"><label>Date<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label><label>Description<input name="description" required></label><label>Amount<input name="amount" type="number" min=".01" step=".01" required></label><label>Bank direction<select name="direction"><option value="credit">Increase bank</option><option value="debit">Decrease bank</option></select></label><label>Offset account<select name="offsetAccountId">${accounts}</select></label><label>Fund<select name="fundId">${funds}</select></label><label>Reason<input name="reason" required></label></div><button class="acct-primary">Post adjustment</button><span class="acct-form-status"></span></form>`;
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
