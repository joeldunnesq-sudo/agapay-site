'use strict';

// Parish dashboard accounting: workspace.
// Classic script; preserve global names used by the dashboard and inline actions.

async function renderAccountingAttachments(entityType, entityId, container) {
  if (!container) return;
  container.dataset.accountingAttachments = `${entityType}:${entityId}`;
  container.innerHTML = '<p class="sw-tool-loading">Loading attachments...</p>';
  const response = await fetch(
    accountingApi(`/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`),
    { headers: authHeaders() }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    container.innerHTML = accountingEmpty(
      'Attachments unavailable',
      payload.message || payload.error || 'Unable to load attachments.'
    );
    return;
  }
  const items = payload.attachments || [];
  container.innerHTML = `<section class="acct-attachments"><div class="acct-list-head"><div><span class="acct-kicker">Private documents</span><h3>Attachments</h3><p>PDF, JPG, or PNG · 10 MB maximum</p></div></div><form class="acct-attachment-upload" onsubmit="accountingUpload(event,'${escapeAttr(entityType)}','${escapeAttr(entityId)}')"><label>Document<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></label><label>Display name<input name="displayName" maxlength="180" placeholder="Optional document label"></label><button class="acct-primary">Upload</button><span class="acct-form-status"></span></form><div class="acct-attachment-list">${items.map((item) => `<div><span><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.mimeType)} · ${Math.max(1, Math.ceil(Number(item.sizeBytes) / 1024))} KB · ${accountingDate(item.createdAt)}</small></span><div class="acct-row-actions"><button type="button" onclick="downloadAccountingAttachment('${escapeAttr(item.id)}','${escapeAttr(item.displayName)}')">Download</button><button type="button" onclick="removeAccountingAttachment('${escapeAttr(item.id)}',${item.version},'${escapeAttr(entityType)}','${escapeAttr(entityId)}',this)">Delete</button></div></div>`).join('') || '<p>No attachments yet.</p>'}</div></section>`;
}

async function accountingUpload(event, entityType, entityId) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    data = new FormData(form);
  data.set('entityType', entityType);
  data.set('entityId', entityId);
  status.textContent = 'Uploading…';
  const response = await fetch(accountingApi('/attachments/upload'), {
    method: 'POST',
    headers: authHeaders(),
    body: data,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to upload attachment.';
    return;
  }
  await renderAccountingAttachments(entityType, entityId, form.closest('[data-accounting-attachments]'));
}

async function downloadAccountingAttachment(attachmentId, filename) {
  const response = await fetch(accountingApi(`/attachments/${encodeURIComponent(attachmentId)}/download`), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.message || payload.error || 'Unable to download attachment.');
    return;
  }
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement('a');
  link.href = url;
  link.download = filename || 'attachment';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function removeAccountingAttachment(attachmentId, expectedVersion, entityType, entityId, button) {
  if (!confirm('Delete this attachment from the accounting record?')) return;
  const response = await fetch(accountingApi(`/attachments/${encodeURIComponent(attachmentId)}`), {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(payload.message || payload.error || 'Unable to delete attachment.');
    return;
  }
  await renderAccountingAttachments(entityType, entityId, button.closest('[data-accounting-attachments]'));
}

function accountingPreviewOnly() {
  return !moduleIncluded('accounting') || !currentParish?.accountingAvailable;
}

function renderAccountingPaywall(pane = document.getElementById('accountingPane')) {
  if (!pane) return;
  const included = moduleIncluded('accounting');
  const shell = pane.closest('.acct-suite-shell');
  shell?.classList.toggle('acct-suite-shell--tier-paywall', !included);
  document.getElementById('accountingTierLabel').textContent = included ? 'Parish Accounting' : 'Parish tier';
  document.getElementById('accountingTierCopy').textContent = included ? 'Included in your plan' : 'Upgrade to unlock';
  document.getElementById('accountingParishName').textContent =
    currentParish?.name || currentParish?.parishName || 'Your parish';
  document.getElementById('accountingFiscalYear').textContent = 'Current fiscal year';
  pane.dataset.loaded = 'preview';
  if (!included) {
    pane.innerHTML = `
        <div class="acct-tier-paywall">
          <div class="text-give-header">
            <div>
              <div class="text-give-eyebrow">Parish finances</div>
              <h1>Accounting</h1>
              <p>Keep giving, expenses, funds, budgets, reconciliation, and financial reporting together in one balanced set of parish books.</p>
            </div>
            <div class="text-give-header-mark acct-tier-paywall-mark" aria-hidden="true">₳</div>
          </div>

          <div class="text-give-launch sac-paywall-launch">
            <div class="text-give-launch-icon acct-tier-paywall-icon" aria-hidden="true">₳</div>
            <div>
              <span>Included with Parish</span>
              <h2>See the whole parish financial picture</h2>
              <p>Upgrade for true fund accounting, a balanced general ledger, payables, budgets, bank reconciliation, and parish-ready reports in one workspace.</p>
            </div>
            <button class="btn btn-gold sac-paywall-upgrade" type="button" onclick="switchTab('settings')">Review Parish tier</button>
          </div>

          <div class="text-give-grid sac-paywall-grid">
            <section class="text-give-card">
              <div class="text-give-card-head">
                <div class="section-title-icon acct-tier-card-icon" aria-hidden="true">≡</div>
                <div><h3>Connected parish books</h3><p>Giving and operations in one financial workspace</p></div>
              </div>
              <div class="acct-tier-preview-stats">
                <div><span>Cash on hand</span><strong>$84,260</strong></div>
                <div><span>Current activity</span><strong>$12,475</strong></div>
                <div><span>Tracked funds</span><strong>7</strong></div>
              </div>
            </section>

            <section class="text-give-card">
              <div class="text-give-card-head">
                <div class="section-title-icon acct-tier-card-icon" aria-hidden="true">▤</div>
                <div><h3>Accounting workspace</h3><p>Ledger, payables, budgets, reconciliation, and reports</p></div>
              </div>
              <div class="text-give-locked-region acct-tier-locked">
                <div class="text-give-lock-veil">
                  <span><span class="acct-tier-inline-lock" aria-hidden="true">⌑</span>Parish tier</span>
                </div>
                <div class="acct-tier-module-list">
                  <div><span>General ledger</span><strong>Balanced</strong></div>
                  <div><span>Bank reconciliation</span><strong>Ready to match</strong></div>
                  <div><span>Financial reports</span><strong>Parish ready</strong></div>
                </div>
              </div>
            </section>
          </div>

          <div class="feature-guide-grid sac-paywall-benefits">
            <article class="feature-guide-card"><span class="sac-paywall-number">01</span><h3>Track every fund</h3><p>Keep unrestricted, designated, and donor-restricted activity clear without separate spreadsheets.</p></article>
            <article class="feature-guide-card"><span class="sac-paywall-number">02</span><h3>Stay balanced</h3><p>Connect giving, expenses, payables, and bank activity to one dependable general ledger.</p></article>
            <article class="feature-guide-card"><span class="sac-paywall-number">03</span><h3>Report with confidence</h3><p>Prepare parish council, treasurer, and year-end reports from the same set of books.</p></article>
          </div>
        </div>`;
    return;
  }
  renderAccountingReadiness({ status: 'disabled', ready: false }, pane);
}

function renderAccountingReadiness(accounting, pane = document.getElementById('accountingPane')) {
  if (!pane) return;
  const setup = accounting.status === 'setup_required';
  const disabled = accounting.status === 'disabled';
  const title = setup
    ? 'Accounting is included — setup is required'
    : disabled
      ? 'Accounting access is disabled'
      : 'Accounting needs attention';
  const message = setup
    ? 'Your Parish tier or Accounting add-on includes Accounting during the free trial. This parish does not yet have its own Accounting books. Contact AGAPAY support to complete setup; no additional upgrade is required.'
    : disabled
      ? 'Accounting is included in your plan, but access has been disabled for this parish. Contact AGAPAY support for help.'
      : 'Accounting is included in your plan, but its books are not ready or did not pass their safety checks. Contact AGAPAY support before continuing.';
  pane.dataset.loaded = 'pending';
  const copy = document.getElementById('accountingTierCopy');
  if (copy) copy.textContent = setup ? 'Included · Setup required' : 'Included · Needs attention';
  pane.innerHTML = `<section class="acct-access-card"><span class="acct-kicker">Accounting access</span><h2>${title}</h2><p>${message}</p><button class="acct-primary" type="button" onclick="loadAccountingTab(true)">Check again</button></section>`;
}

function accountingViewTitle() {
  return (
    {
      overview: 'Overview',
      ledger: 'General Ledger',
      journals: 'Journal Entries',
      funds: 'Funds',
      reports: 'Financial Reports',
      payables: 'Payables',
      budgets: 'Budgets',
      banking: 'Reconciliation',
      close: 'Period Close',
      governance: 'Governance',
      setup: 'Setup',
      settings: 'Settings',
      integrations: 'Settings',
    }[accountingView] || 'Overview'
  );
}

function syncAccountingExperienceChrome() {
  const shell = document.querySelector('.acct-suite-shell');
  if (shell) shell.dataset.accountingExperience = accountingExperienceMode;
  document.querySelectorAll('[data-accounting-experience]').forEach((button) => {
    const active = button.dataset.accountingExperience === accountingExperienceMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const isTreasurer = accountingExperienceMode === 'treasurer';
  const nav = document.querySelector('.acct-suite-rail nav');
  const advancedToggle = document.querySelector('[data-accounting-advanced-toggle]');
  const navOrder = isTreasurer
    ? [
        'overview',
        'funds',
        'payables',
        'banking',
        'reports',
        'budgets',
        'advanced',
        'ledger',
        'close',
        'governance',
        'setup',
        'settings',
      ]
    : [
        'overview',
        'ledger',
        'funds',
        'payables',
        'banking',
        'reports',
        'budgets',
        'close',
        'governance',
        'setup',
        'settings',
      ];
  if (nav && nav.dataset.accountingNavMode !== accountingExperienceMode) {
    navOrder.forEach((view) => {
      const button = view === 'advanced' ? advancedToggle : nav.querySelector(`[data-accounting-view="${view}"]`);
      if (button) nav.append(button);
    });
    nav.dataset.accountingNavMode = accountingExperienceMode;
  }
  document.querySelectorAll('[data-accounting-advanced]').forEach((button) => {
    button.hidden = isTreasurer && !accountingAdvancedNavExpanded;
  });
  if (advancedToggle) {
    const advancedViewActive = [
      'ledger',
      'journals',
      'close',
      'governance',
      'setup',
      'settings',
      'integrations',
    ].includes(accountingView);
    advancedToggle.hidden = !isTreasurer;
    advancedToggle.setAttribute('aria-expanded', String(accountingAdvancedNavExpanded));
    advancedToggle.classList.toggle('active', advancedViewActive);
  }
  if (shell) shell.classList.toggle('acct-suite-shell--advanced-open', isTreasurer && accountingAdvancedNavExpanded);
}

function setAccountingExperienceMode(mode) {
  accountingExperienceMode = mode === 'accountant' ? 'accountant' : 'treasurer';
  accountingAdvancedNavExpanded = false;
  try {
    sessionStorage.setItem('agapay.accountingExperienceMode', accountingExperienceMode);
  } catch {}
  renderAccountingPane();
}

function toggleAccountingAdvancedNav() {
  accountingAdvancedNavExpanded = !accountingAdvancedNavExpanded;
  syncAccountingExperienceChrome();
}

function renderAccountingPane() {
  const pane = document.getElementById('accountingPane');
  if (!pane) return;
  const reconcileWorkspace = document.getElementById('reconcileWorkspace');
  const reconcileParking = document.getElementById('tab-reconcile');
  if (reconcileWorkspace && reconcileParking && reconcileWorkspace.parentElement !== reconcileParking)
    reconcileParking.append(reconcileWorkspace);
  syncAccountingExperienceChrome();
  document
    .querySelectorAll('[data-accounting-view]')
    .forEach((button) =>
      button.classList.toggle(
        'active',
        button.dataset.accountingView === accountingView ||
          (button.dataset.accountingView === 'ledger' && accountingView === 'journals')
      )
    );
  const pageTitle = document.getElementById('accountingPageTitle');
  if (pageTitle) pageTitle.textContent = accountingViewTitle();
  if (accountingView === 'overview') {
    renderAccountingOverview(pane);
    return;
  }
  if (accountingView === 'settings') {
    const settings = accountingData.setup?.settings;
    if (!settings) {
      pane.innerHTML = accountingEmpty(
        'Accounting settings are not loaded',
        'Refresh to load the parish accounting configuration.'
      );
      return;
    }
    const staff = accountingStaffSession()?.profile;
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Accounting configuration</span><h2>Settings</h2><p>Manage the fiscal calendar, staff access, connected accounting, and help resources.</p></div><button class="acct-refresh" onclick="lockAccountingWorkspace()">Lock Accounting</button></div><div class="acct-setup-grid"><section class="acct-card acct-guide-card"><div><span class="acct-kicker">Accounting Suite Guide</span><h2>See how the whole system works</h2><p>Open the practical 13-page guide for Treasurer and Accountant views, income, non-cash gifts, bills, funds, reports, budgets, close, and staff access.</p></div><div class="acct-guide-actions"><a class="primary" href="/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf" target="_blank" rel="noopener">Open guide</a><a href="/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf" download>Download PDF</a></div></section><section class="acct-card acct-settings"><span class="acct-kicker">Fiscal calendar</span><h2>Parish accounting year</h2><label>Fiscal year starts<select id="accountingFiscalMonth">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${Number(settings.fiscalYearStartMonth || 1) === index + 1 ? 'selected' : ''}>${new Date(2026, index, 1).toLocaleString('en-US', { month: 'long' })}</option>`).join('')}</select></label><label>Opening balances<select id="accountingOpeningDisposition"><option value="pending" ${settings.openingBalancesDisposition === 'pending' ? 'selected' : ''}>Still to be entered</option><option value="required" ${settings.openingBalancesDisposition === 'required' ? 'selected' : ''}>Required</option><option value="deferred" ${settings.openingBalancesDisposition === 'deferred' ? 'selected' : ''}>Deferred</option><option value="not_applicable" ${settings.openingBalancesDisposition === 'not_applicable' ? 'selected' : ''}>Not applicable</option><option value="posted" ${settings.openingBalancesDisposition === 'posted' ? 'selected' : ''}>Posted</option></select></label>${accountingPledgeAccountSetting(settings)}<button type="button" class="acct-primary" onclick="saveAccountingSettings()">Save settings</button></section><section class="acct-card acct-settings"><span class="acct-kicker">Current operator</span><h2>${escapeHtml(staff?.displayName || 'Accounting staff')}</h2><p>${escapeHtml((staff?.roleTemplate || '').replaceAll('_', ' '))} · Four-hour protected Accounting session.</p><form onsubmit="changeAccountingPin(event)"><label>New six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="acct-primary">Change my PIN</button><span class="acct-form-status"></span></form></section><section class="acct-card acct-settings"><span class="acct-kicker">Staff access</span><h2>Add a named profile</h2><form onsubmit="addAccountingStaff(event)"><label>Name<input name="displayName" required maxlength="120"></label><label>Responsibility<select name="roleTemplate"><option value="bookkeeper">Bookkeeper</option><option value="treasurer">Treasurer</option><option value="rector">Rector</option><option value="council_member">Council member</option></select></label><label>Temporary six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="acct-primary">Add profile</button><span class="acct-form-status"></span></form></section><section class="acct-card"><span class="acct-kicker">Connected activity</span><h2>Give &amp; Commerce</h2><p>Manage automatic posting, Stripe clearing, fees, refunds, and all Parish Commerce accounting.</p><button class="acct-primary" onclick="setAccountingView('integrations')">Open integration settings</button></section></div>`;
    return;
  }
  if (accountingView === 'setup') {
    const overview = accountingData.setup;
    if (!overview) {
      pane.innerHTML = accountingEmpty('Accounting setup is not loaded', 'Refresh to check the secure parish ledger.');
      return;
    }
    if (accountingMigration.active) {
      renderAccountingMigrationWizard(pane);
      return;
    }
    const settings = overview.settings || {};
    pane.innerHTML = `<div class="acct-setup-grid">
        <section class="acct-card acct-setup-lead"><span class="acct-kicker">Setup progress</span><h2>${overview.initialization?.operational ? 'Your ledger is ready.' : 'Initialize your parish ledger.'}</h2><p>${overview.initialization?.operational ? `${overview.activeAccountCount || 0} accounts and ${overview.activeFundCount || 0} fund are ready for use.` : 'Create the protected nonprofit chart of accounts, General Operating Fund, fiscal year, and periods.'}</p>${overview.initialization?.operational ? '' : '<button type="button" class="acct-primary" onclick="initializeAccounting()">Initialize Accounting</button>'}</section>
        <section class="acct-card"><span class="acct-kicker">Readiness</span><div class="acct-checklist">${(overview.checklist || []).map((item) => `<div class="${item.complete ? 'complete' : ''}"><i>${item.complete ? '✓' : '○'}</i><span>${escapeHtml(item.label)}</span></div>`).join('')}</div></section>
        <section class="acct-card acct-settings"><span class="acct-kicker">Parish settings</span><h2>Fiscal year & opening balances</h2><label>Fiscal year starts<select id="accountingFiscalMonth">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${Number(settings.fiscalYearStartMonth || 1) === index + 1 ? 'selected' : ''}>${new Date(2026, index, 1).toLocaleString('en-US', { month: 'long' })}</option>`).join('')}</select></label><label>Opening balances<select id="accountingOpeningDisposition"><option value="pending" ${settings.openingBalancesDisposition === 'pending' ? 'selected' : ''}>Still to be entered</option><option value="required" ${settings.openingBalancesDisposition === 'required' ? 'selected' : ''}>Required</option><option value="deferred" ${settings.openingBalancesDisposition === 'deferred' ? 'selected' : ''}>Deferred</option><option value="not_applicable" ${settings.openingBalancesDisposition === 'not_applicable' ? 'selected' : ''}>Not applicable</option><option value="posted" ${settings.openingBalancesDisposition === 'posted' ? 'selected' : ''}>Posted</option></select></label>${accountingPledgeAccountSetting(settings)}<button type="button" class="acct-primary" onclick="saveAccountingSettings()" ${settings.version ? '' : 'disabled'}>Save settings</button></section>
        <section class="acct-card"><span class="acct-kicker">Ledger foundation validation</span><div id="accountingLedgerValidation" class="acct-facts"><div><strong>${overview.validation?.ok ? 'Healthy' : 'Review needed'}</strong><span>Ledger integrity</span></div></div><button type="button" class="acct-refresh" onclick="validateAccountingLedgerFoundation()">Validate foundation</button></section>
        <section class="acct-card acct-settings"><span class="acct-kicker">Opening balances</span><h2>Enter starting balances</h2><form class="acct-phase-form" onsubmit="postAccountingOpeningBalances(event)"><label>Effective date<input name="effectiveDate" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label><label>Description<input name="description" required value="Opening balances"></label><div class="acct-form-grid"><label>Debit account<select name="debitAccountId" required>${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Credit account<select name="creditAccountId" required>${accountingData.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select><label>Fund<select name="fundId" required>${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label></div><button class="acct-primary">Post opening balances</button><span class="acct-form-status"></span></form></section>
        <section class="acct-card"><span class="acct-kicker">Switching accounting systems</span><h2>Move from QuickBooks or Aplos</h2><p>Bring over a chart of accounts, vendors, funds, and either a clean opening balance or advanced general-ledger history through reviewed CSV steps.</p><button type="button" class="acct-primary" onclick="openAccountingMigration()">Open migration wizard</button><small>Treasurer-only · previews never write to the ledger.</small></section>
        <section class="acct-card"><span class="acct-kicker">Current books</span><div class="acct-facts"><div><strong>${escapeHtml(overview.currentFiscalYear?.name || 'Not set')}</strong><span>Fiscal year</span></div><div><strong>${escapeHtml(overview.currentPeriod?.name || 'Not open')}</strong><span>Open period</span></div><div><strong>${overview.validation?.ok ? 'Healthy' : 'Review needed'}</strong><span>Ledger integrity</span></div></div></section>
      </div>`;
    return;
  }
  if (accountingView === 'reports') {
    renderAccountingReports(pane);
    return;
  }
  if (accountingView === 'funds') {
    renderAccountingFunds(pane);
    return;
  }
  if (accountingView === 'payables') {
    renderAccountingPayables(pane);
    return;
  }
  if (accountingView === 'budgets') {
    renderAccountingBudgets(pane);
    return;
  }
  if (accountingView === 'banking') {
    renderAccountingBanking(pane);
    return;
  }
  if (accountingView === 'integrations') {
    renderAccountingIntegrations(pane);
    return;
  }
  if (accountingView === 'close') {
    renderAccountingClose(pane);
    return;
  }
  if (accountingView === 'governance') {
    renderAccountingGovernance(pane);
    return;
  }
  if (accountingExperienceMode === 'treasurer' && accountingView === 'ledger') {
    pane.innerHTML = `${accountingSimpleEntryMode === 'in-kind' ? accountingInKindGiftForm() : accountingSimpleIncomeForm()}${accountingSimpleActivityFeed()}`;
    return;
  }
  if (accountingJournalEditor) {
    renderAccountingJournalEditor(pane);
    return;
  }
  const register = accountingView === 'ledger' ? accountingRegisterModel() : null;
  const rows = register ? register.rows : accountingData.journals;
  if (accountingView !== 'ledger' && !rows.length) {
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Manual ledger</span><h2>Journal entries</h2></div><button type="button" class="acct-primary" onclick="newAccountingJournal()">New journal entry</button></div>${accountingEmpty('No journal entries yet', 'Create a balanced debit and credit to begin.')}`;
    return;
  }
  pane.innerHTML =
    accountingView === 'ledger'
      ? `
      <section class="acct-register-hero"><div class="acct-register-account"><span class="acct-kicker">Account register</span><label><select onchange="setAccountingLedgerAccount(this.value)">${register.options.map((account) => `<option value="${escapeAttr(account.number)}" ${account.number === register.account.number ? 'selected' : ''}>${escapeHtml(account.number)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><p>Choose the account where money was deposited or paid.</p></div><div class="acct-register-balance"><span>Current balance</span><strong>${accountingMoney(register.balance)}</strong><small>${register.rows.length} visible transaction${register.rows.length === 1 ? '' : 's'}</small></div><div class="acct-register-totals"><div><span>Total debits</span><strong>${accountingMoney(register.debits)}</strong></div><div><span>Total credits</span><strong>${accountingMoney(register.credits)}</strong></div></div></section>${accountingRegisterEntryForm(register)}${accountingRecurringPanel(register)}<div class="acct-register-actions"><div class="acct-ledger-toggle"><button class="active" onclick="setAccountingView('ledger')">Register</button><button onclick="setAccountingView('journals')">Journal entries</button></div><div><button class="acct-refresh" onclick="toggleAccountingLedgerOrder()">${accountingLedgerNewestFirst ? 'Oldest first' : 'Newest first'}</button><button class="acct-refresh" onclick="downloadAccountingLedger()">Export</button><button class="acct-refresh" onclick="printAccountingLedger()">Print</button></div></div><section class="acct-ledger-guide" aria-label="How to use the general ledger"><div><strong>Register</strong><span>Choose a cash, bank, or liability account, then record a payment, deposit, or contribution without building debit and credit lines yourself.</span></div><div><strong>Journal entries</strong><span>Use the journal-entry view for transfers, corrections, accruals, and other multi-line adjustments.</span></div><p>AGAPAY creates and posts the balanced journal entry behind every register transaction.</p></section><div class="acct-register-history-head"><div><span class="acct-kicker">Transaction history</span><h2>${escapeHtml(register.account.name)}</h2></div><form onsubmit="searchAccountingLedger(event)"><input name="query" value="${escapeAttr(accountingLedgerSearch)}" placeholder="Search this register"><button class="acct-refresh">Search</button>${accountingLedgerSearch ? '<button type="button" class="acct-link" onclick="clearAccountingLedgerSearch()">Clear</button>' : ''}</form></div><div class="acct-table-wrap acct-register-table"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Fund</th><th>Description</th><th>Payment</th><th>Deposit</th><th>Balance</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${accountingDate(row.postingDate || row.entryDate || row.date)}</td><td><strong>${escapeHtml(row.entryNumber || row.entry_number || '—')}</strong></td><td>${escapeHtml(row.fundName || row.fund_name || '—')}</td><td>${escapeHtml(row.description || row.memo || '')}</td><td>${Number(row.creditAmount ?? row.credit_amount ?? 0) ? accountingMoney(row.creditAmount ?? row.credit_amount) : '—'}</td><td>${Number(row.debitAmount ?? row.debit_amount ?? 0) ? accountingMoney(row.debitAmount ?? row.debit_amount) : '—'}</td><td><strong>${accountingMoney(row.registerBalance)}</strong></td></tr>`).join('') || '<tr><td colspan="7">No transactions in this account yet.</td></tr>'}</tbody></table></div>`
      : `
      <div class="acct-list-head"><div><span class="acct-kicker">Manual ledger</span><h2>Journal entries</h2></div><button type="button" class="acct-primary" onclick="newAccountingJournal()">New journal entry</button></div><div class="acct-ledger-toggle"><button onclick="setAccountingView('ledger')">Register</button><button class="active" onclick="setAccountingView('journals')">Journal entries</button></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Source</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${accountingDate(row.entryDate || row.entry_date || row.postingDate)}</td><td><strong>${escapeHtml(row.entryNumber || row.entry_number || row.id || '')}</strong></td><td>${escapeHtml(row.description || row.memo || '')}</td><td>${escapeHtml(row.sourceType || row.source_type || 'Manual')}</td><td><strong>${accountingMoney(row.totalDebits ?? row.total_debits ?? row.totalCredits ?? row.total_credits ?? 0)}</strong></td><td><span class="acct-status ${escapeAttr(row.status || 'draft')}">${escapeHtml(row.status || 'draft')}</span></td><td><button type="button" class="acct-link" onclick="openAccountingJournalAttachments('${escapeAttr(row.id)}')">Attachments</button>${row.status === 'draft' ? `<button type="button" class="acct-link" onclick="editAccountingJournal('${escapeAttr(row.id)}')">Continue</button><button type="button" class="acct-link" onclick="voidAccountingJournal('${escapeAttr(row.id)}')">Void</button>` : row.status === 'posted' ? `<button type="button" class="acct-link" onclick="reverseAccountingJournal('${escapeAttr(row.id)}')">Reverse</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function openAccountingJournalAttachments(id) {
  const pane = document.getElementById('accountingPane');
  if (!pane) return;
  pane.querySelector('[data-journal-attachment-panel]')?.remove();
  pane.insertAdjacentHTML(
    'afterbegin',
    `<section class="acct-card" data-journal-attachment-panel><div class="acct-list-head"><div><span class="acct-kicker">Journal entry detail</span><h2>Supporting documents</h2></div><button class="acct-link" onclick="this.closest('[data-journal-attachment-panel]').remove()">Close</button></div><div data-accounting-attachments></div></section>`
  );
  renderAccountingAttachments(
    'journal_entry',
    id,
    pane.querySelector('[data-journal-attachment-panel] [data-accounting-attachments]')
  );
}

function toggleAccountingLedgerOrder() {
  accountingLedgerNewestFirst = !accountingLedgerNewestFirst;
  renderAccountingPane();
}

function setAccountingLedgerAccount(accountNumber) {
  accountingLedgerAccountNumber = accountNumber;
  accountingLedgerSearch = '';
  renderAccountingPane();
}

function searchAccountingLedger(event) {
  event.preventDefault();
  accountingLedgerSearch = String(new FormData(event.currentTarget).get('query') || '').trim();
  renderAccountingPane();
}

function clearAccountingLedgerSearch() {
  accountingLedgerSearch = '';
  renderAccountingPane();
}

function setAccountingRegisterEntryMode(mode) {
  accountingRegisterEntryMode = mode === 'contribution' ? 'contribution' : 'transaction';
  renderAccountingPane();
}

function applyAccountingRegisterDefaultFund(accountSelect) {
  const defaultFundId = accountSelect.selectedOptions[0]?.dataset.defaultFund || '';
  const fundSelect = accountSelect.form?.elements?.fundId;
  if (defaultFundId && fundSelect) fundSelect.value = defaultFundId;
}

function setAccountingView(view) {
  if (accountingPreviewOnly()) {
    renderAccountingPaywall();
    return;
  }
  accountingView = [
    'overview',
    'setup',
    'settings',
    'reports',
    'journals',
    'ledger',
    'funds',
    'payables',
    'budgets',
    'banking',
    'integrations',
    'close',
    'governance',
  ].includes(view)
    ? view
    : 'overview';
  renderAccountingPane();
  if (
    ['payables', 'budgets'].includes(accountingView) &&
    accountingData.tier === 'advanced_operations' &&
    !accountingData[accountingView]
  )
    loadAccountingPhaseD();
  if (['banking', 'integrations'].includes(accountingView) && !accountingData[accountingView]) loadAccountingPhaseE();
  if (accountingView === 'funds' && !accountingFundCatalog) loadAccountingFunds();
  if (accountingView === 'close' && !accountingData.close) loadAccountingPhaseF();
  if (accountingView === 'governance' && !accountingData.governance) loadAccountingGovernance();
}

function openAccountingSimpleIncome() {
  accountingSimpleIncomeMessage = '';
  accountingSimpleEntryMode = 'income';
  accountingView = 'ledger';
  renderAccountingPane();
}

function openAccountingInKindGift() {
  accountingInKindGiftMessage = '';
  accountingSimpleEntryMode = 'in-kind';
  accountingView = 'ledger';
  renderAccountingPane();
}

async function openAccountingSimpleBill() {
  accountingPayablesView = 'bills';
  accountingView = 'payables';
  if (!accountingData.payables) await loadAccountingPhaseD();
  else renderAccountingPane();
  showAccountingBillForm();
}

async function loadAccountingTab(force = false) {
  const pane = document.getElementById('accountingPane');
  if (!pane || !currentParish?.parishId) return;
  if (accountingPreviewOnly()) {
    renderAccountingPaywall(pane);
    return;
  }
  pane.closest('.acct-suite-shell')?.classList.remove('acct-suite-shell--tier-paywall');
  if (!force && pane.dataset.loaded === 'true') return;
  pane.innerHTML = '<p class="sw-tool-loading">Loading Accounting...</p>';
  try {
    const [
      setupRes,
      referenceRes,
      journalRes,
      ledgerRes,
      trialRes,
      activitiesRes,
      positionRes,
      fundActivityRes,
      recurringRes,
      ledgerStatusRes,
      bankAccountsRes,
    ] = await Promise.all([
      fetch(accountingApi('/setup'), { headers: authHeaders() }),
      fetch(accountingApi('/workspace-reference'), { headers: authHeaders() }),
      fetch(accountingApi('/journals?limit=50'), { headers: authHeaders() }),
      fetch(accountingApi('/general-ledger'), { headers: authHeaders() }),
      fetch(accountingApi('/reports/trial-balance'), { headers: authHeaders() }),
      fetch(accountingApi('/reports/statement-of-activities'), { headers: authHeaders() }),
      fetch(accountingApi('/reports/statement-of-financial-position'), { headers: authHeaders() }),
      fetch(accountingApi('/reports/fund-activity'), { headers: authHeaders() }),
      fetch(accountingApi('/recurring-transactions'), { headers: authHeaders() }),
      fetch(accountingApi('/ledger/status'), { headers: authHeaders() }),
      fetch(accountingApi('/bank/accounts'), { headers: authHeaders() }),
    ]);
    const setup = await setupRes.json().catch(() => ({}));
    const reference = await referenceRes.json().catch(() => ({}));
    const journals = await journalRes.json().catch(() => ({}));
    const ledger = await ledgerRes.json().catch(() => ({}));
    const trial = await trialRes.json().catch(() => ({}));
    const activities = await activitiesRes.json().catch(() => ({}));
    const position = await positionRes.json().catch(() => ({}));
    const fundActivity = await fundActivityRes.json().catch(() => ({}));
    const recurring = await recurringRes.json().catch(() => ({}));
    const ledgerStatus = await ledgerStatusRes.json().catch(() => ({}));
    const bankAccounts = await bankAccountsRes.json().catch(() => ({}));
    if (setupRes.status === 401) {
      await renderAccountingAccess();
      return;
    }
    if (setupRes.status === 409 && setup.accounting) {
      renderAccountingReadiness(setup.accounting, pane);
      return;
    }
    if (!setupRes.ok) throw new Error(setup.message || setup.error || 'Accounting setup is unavailable.');
    if (!referenceRes.ok)
      throw new Error(reference.message || reference.error || 'The chart of accounts is unavailable.');
    if (!journalRes.ok) throw new Error(journals.message || journals.error || 'Accounting is unavailable.');
    if (!ledgerRes.ok) throw new Error(ledger.message || ledger.error || 'The general ledger is unavailable.');
    if (!fundActivityRes.ok)
      throw new Error(fundActivity.message || fundActivity.error || 'Fund balances are unavailable.');
    if (!recurringRes.ok)
      throw new Error(recurring.message || recurring.error || 'Recurring transactions are unavailable.');
    if (!ledgerStatusRes.ok)
      throw new Error(ledgerStatus.message || ledgerStatus.error || 'Ledger initialization status is unavailable.');
    if (setup.overview) setup.overview.initialization = ledgerStatus.status || setup.overview.initialization;
    accountingData = {
      setup: setup.overview,
      accounts: reference.accounts || [],
      accountCatalog: reference.accountCatalog || reference.accounts || [],
      funds: reference.funds || [],
      bankAccounts: bankAccountsRes.ok ? bankAccounts.accounts || [] : [],
      journals: journals.entries || [],
      ledger: ledger.rows || [],
      recurring: recurring.items || [],
      reports: {
        trialBalance: trial.report,
        activities: activities.report,
        position: position.report,
        fundActivity: fundActivity.report,
      },
      payables: accountingData.payables,
      budgets: accountingData.budgets,
      banking: accountingData.banking,
      integrations: accountingData.integrations,
      close: accountingData.close,
      adjustments: accountingData.adjustments,
      governance: accountingData.governance,
      tier: setup.tier || journals.tier || '',
    };
    document.getElementById('accountingTierLabel').textContent =
      accountingData.tier === 'advanced_operations' ? 'Parish Accounting' : 'Mission Accounting';
    document.getElementById('accountingTierCopy').textContent =
      accountingData.tier === 'advanced_operations' ? 'Advanced operations enabled' : 'Essential ledger and reports';
    document.getElementById('accountingParishName').textContent =
      currentParish.name || currentParish.parishName || 'Your parish';
    const fiscal = setup.overview?.currentFiscalYear;
    document.getElementById('accountingFiscalYear').textContent = fiscal?.name
      ? `FY ${fiscal.name}`
      : 'Current fiscal year';
    pane.dataset.loaded = 'true';
    renderAccountingPane();
  } catch (error) {
    pane.innerHTML = `<div class="acct-empty error"><strong>Accounting needs attention</strong><span>${escapeHtml(error.message || 'Unable to load Accounting.')}</span><button type="button" onclick="loadAccountingTab(true)">Try again</button></div>`;
  }
}

async function loadAccountingPhaseD() {
  if (accountingData.tier !== 'advanced_operations') {
    renderAccountingPane();
    return;
  }
  const pane = document.getElementById('accountingPane');
  if (pane) pane.innerHTML = '<p class="sw-tool-loading">Loading Parish Accounting...</p>';
  try {
    const year = new Date().getUTCFullYear();
    const [
      overviewRes,
      vendorsRes,
      billsRes,
      recurringBillsRes,
      agingRes,
      budgetsRes,
      paymentsRes,
      runsRes,
      tax1099Res,
      banksRes,
    ] = await Promise.all(
      [
        '/payables/overview',
        '/payables/vendors',
        '/payables/bills',
        '/payables/recurring-bills',
        '/payables/aging',
        '/budgets',
        '/payables/payments',
        '/payables/payment-runs',
        `/payables/1099-summary?year=${year}`,
        '/bank/accounts',
      ].map((path) => fetch(accountingApi(path), { headers: authHeaders() }))
    );
    const [overview, vendors, bills, recurringBills, aging, budgets, payments, runs, tax1099, banks] =
      await Promise.all(
        [
          overviewRes,
          vendorsRes,
          billsRes,
          recurringBillsRes,
          agingRes,
          budgetsRes,
          paymentsRes,
          runsRes,
          tax1099Res,
          banksRes,
        ].map((res) => res.json().catch(() => ({})))
      );
    const failure = [
      [overviewRes, overview],
      [vendorsRes, vendors],
      [billsRes, bills],
      [recurringBillsRes, recurringBills],
      [agingRes, aging],
      [budgetsRes, budgets],
      [paymentsRes, payments],
      [runsRes, runs],
      [tax1099Res, tax1099],
      [banksRes, banks],
    ].find(([res]) => !res.ok);
    if (failure) throw new Error(failure[1].message || failure[1].error || 'Parish Accounting is unavailable.');
    accountingData.payables = {
      overview: overview.overview,
      vendors: vendors.vendors || [],
      bills: bills.bills || [],
      recurringBills: recurringBills.schedules || [],
      payments: payments.payments || [],
      paymentRuns: runs.paymentRuns || [],
      tax1099: tax1099.report || null,
      bankAccounts: banks.accounts || [],
      aging: aging.aging || { rows: [], totalDue: 0 },
    };
    accountingData.budgets = { items: budgets.budgets || [] };
    renderAccountingPane();
  } catch (error) {
    if (pane)
      pane.innerHTML = `<div class="acct-empty error"><strong>Unable to load Parish Accounting</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseD()">Try again</button></div>`;
  }
}

async function saveAccountingSettings() {
  const settings = accountingData.setup?.settings;
  if (!settings) return;
  const patch = {
    fiscalYearStartMonth: Number(document.getElementById('accountingFiscalMonth').value),
    openingBalancesDisposition: document.getElementById('accountingOpeningDisposition').value,
    pledgeComparisonAccountId: document.getElementById('accountingPledgeComparisonAccount')?.value || null,
  };
  const res = await fetch(accountingApi('/settings'), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: settings.version, patch }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to save Accounting settings.');
    return;
  }
  loadAccountingTab(true);
}
