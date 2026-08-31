'use strict';

// Technical activation and chart import are deliberately separate from balance posting.
const accountingActivation = { parishId: '', timer: null, status: null, import: null, complete: false };

function accountingActivationShell(step, content) {
  const parish = escapeHtml(currentParish?.name || currentParish?.parishName || 'Your parish');
  return `<div class="acct-wizard"><header class="acct-wizard-hero"><div><span class="acct-wizard-eyebrow">A NEW CHAPTER FOR YOUR PARISH</span><h2>Your books. Beautifully organized.</h2><p>A private accounting home for ${parish}.</p></div><div class="acct-wizard-seal" aria-hidden="true">✦<span>AGAPAY<br>ACCOUNTING</span></div></header><ol class="acct-wizard-steps" aria-label="Accounting activation progress">${['Prepare your books', 'Secure your workspace', 'Make it yours'].map((label, index) => `<li ${step === index + 1 ? 'aria-current="step"' : ''} class="${step > index + 1 ? 'is-complete' : ''}"><span>${step > index + 1 ? '✓' : index + 1}</span>${label}</li>`).join('')}</ol><div class="acct-wizard-body">${content}</div><footer class="acct-wizard-footer"><span aria-hidden="true">◇</span> Private parish books · Named staff access · A clear audit trail</footer></div>`;
}

async function accountingActivationStatus() {
  const response = await fetch(accountingAccessApi('/activation'), { headers: authHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to check Accounting setup.');
  return payload;
}

async function accountingActivationGuard(pane) {
  if (accountingActivation.parishId !== currentParish.parishId) {
    clearTimeout(accountingActivation.timer);
    Object.assign(accountingActivation, {
      parishId: currentParish.parishId,
      status: null,
      import: null,
      complete: false,
    });
  }
  if (accountingActivation.complete) return false;
  const parishId = currentParish.parishId,
    status = await accountingActivationStatus();
  if (currentParish?.parishId !== parishId) return true;
  accountingActivation.status = status;
  if (status.completed) {
    accountingActivation.complete = true;
    return false;
  }
  await renderAccountingActivation(pane);
  return true;
}

async function openAccountingActivation() {
  const pane = document.getElementById('accountingPane');
  if (!pane) return;
  try {
    await accountingActivationGuard(pane);
  } catch (error) {
    pane.innerHTML = accountingEmpty('Accounting setup needs attention', error.message);
  }
}

async function renderAccountingActivation(pane = document.getElementById('accountingPane')) {
  clearTimeout(accountingActivation.timer);
  if (!pane) return;
  pane.dataset.loaded = 'activation';
  const status = accountingActivation.status;
  document.getElementById('accountingTierLabel').textContent = 'Accounting is included';
  document.getElementById('accountingTierCopy').textContent = 'Let’s set up your books';
  document.getElementById('accountingParishName').textContent =
    currentParish.name || currentParish.parishName || 'Your parish';
  if (status.status === 'ready') {
    if (!accountingStaffSession()) {
      await renderAccountingAccess();
      const form = pane.innerHTML;
      pane.innerHTML = accountingActivationShell(2, form);
      return;
    }
    if (!accountingActivation.import) {
      const { sessions = [] } = await accountingMigrationRequest('/sessions');
      const imported = sessions.find((session) => session.chartOfAccountsStatus === 'completed');
      if (imported) accountingActivation.import = { result: { alreadyImported: true } };
    }
    renderAccountingActivationChart(pane);
    return;
  }
  if (status.status === 'not_started' || status.status === 'review_required') {
    const today = new Date().toLocaleDateString('en-CA');
    pane.innerHTML = accountingActivationShell(
      1,
      `<div class="acct-wizard-layout"><section><span class="acct-kicker">A thoughtful start</span><h3>Less setup. More clarity.</h3><p>We’ll prepare your chart of accounts, fiscal calendar and existing giving funds. Then you can bring your accounts over from Aplos or QuickBooks.</p><form class="acct-wizard-form" onsubmit="startAccountingActivation(event)"><label>Start keeping books on<input name="startDate" type="date" required value="${escapeAttr(today)}"><small>This sets your starting period. No historical transactions are imported.</small></label><label>Fiscal year begins in<select name="fiscalYearStartMonth">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${new Date(2026, index, 1).toLocaleString('en', { month: 'long' })}</option>`).join('')}</select></label><button class="acct-primary" ${status.available ? '' : 'disabled'}>Create my parish’s books <span aria-hidden="true">→</span></button><div class="acct-form-status" role="status">${status.available ? '' : status.status === 'review_required' ? 'Existing books need a support review before setup can continue. They will not be replaced.' : 'Automatic setup is awaiting platform configuration. Contact AGAPAY support; your plan already includes Accounting.'}</div></form></section><aside class="acct-wizard-summary"><span class="acct-kicker">Prepared for your parish</span><h3>Everything in its place.</h3><ul><li><b>Private books</b><span>A separate database owned by your parish.</span></li><li><b>A complete foundation</b><span>Ledger, funds, payables, reconciliation and reports.</span></li><li><b>Your existing accounts</b><span>Upload Aplos or QuickBooks CSVs, or use the parish starter chart.</span></li></ul><p class="acct-wizard-note">USD · No new Stripe charges · Opening balances stay pending until reviewed.</p></aside></div>`
    );
    return;
  }
  const stages = [
    ['database', 'Create private books'],
    ['schema', 'Prepare the accounting foundation'],
    ['calendar', 'Build your fiscal calendar'],
    ['funds', 'Bring over giving funds'],
    ['validation', 'Check everything is ready'],
  ];
  const active = stages.findIndex(([key]) => key === status.step),
    failed = status.status === 'failed';
  pane.innerHTML = accountingActivationShell(
    1,
    `<section class="acct-wizard-progress"><div class="acct-wizard-orbit ${failed ? 'is-paused' : ''}" aria-hidden="true">${failed ? 'Ⅱ' : '✦'}</div><h3>${failed ? 'Safely paused. Ready when you are.' : 'Making room for good stewardship.'}</h3><p>${failed ? escapeHtml(status.message) : 'We’re preparing your parish’s books. You can leave this page and return later.'}</p><ol aria-label="Provisioning stages">${stages.map(([key, label], index) => `<li class="${index < active ? 'is-complete' : index === active ? 'is-current' : ''}"><span aria-hidden="true">${index < active ? '✓' : index + 1}</span><div><b>${label}</b>${key === 'schema' && index === active ? `<small>${status.migrationCount || 0} schema updates applied</small>` : ''}</div></li>`).join('')}</ol><div role="status" class="acct-form-status" id="accountingActivationPollStatus"></div>${failed && status.retryable ? '<button class="acct-primary" onclick="retryAccountingActivation(this)">Resume setup →</button>' : ''}${status.status === 'pending' ? '<button class="acct-refresh" onclick="retryAccountingActivation(this)">Resume if setup has not started</button>' : ''}<small class="acct-wizard-reference">Setup reference: ${escapeHtml(status.reference || '')}</small></section>`
  );
  if (!failed) accountingActivation.timer = setTimeout(pollAccountingActivation, 10000);
}

async function pollAccountingActivation() {
  clearTimeout(accountingActivation.timer);
  if (
    !document.getElementById('accountingActivationPollStatus') ||
    !document.getElementById('accountingPane')?.getClientRects().length ||
    document.hidden ||
    accountingActivation.parishId !== currentParish?.parishId
  )
    return;
  try {
    accountingActivation.status = await accountingActivationStatus();
    await renderAccountingActivation();
  } catch (error) {
    const status = document.getElementById('accountingActivationPollStatus');
    if (status) status.textContent = `${error.message} Checking again shortly…`;
    accountingActivation.timer = setTimeout(pollAccountingActivation, 20000);
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.getElementById('accountingActivationPollStatus')) pollAccountingActivation();
});

async function startAccountingActivation(event) {
  event.preventDefault();
  const form = event.currentTarget,
    button = form.querySelector('button'),
    status = form.querySelector('.acct-form-status');
  button.disabled = true;
  status.textContent = 'Starting your private workspace…';
  try {
    accountingActivation.status = await accountingAccessRequest(
      '/activation/start',
      Object.fromEntries(new FormData(form))
    );
    await renderAccountingActivation();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
async function retryAccountingActivation(button) {
  button.disabled = true;
  try {
    accountingActivation.status = await accountingAccessRequest(
      '/activation/start',
      accountingActivation.status.options
    );
    await renderAccountingActivation();
  } catch (error) {
    document.getElementById('accountingActivationPollStatus').textContent = error.message;
    button.disabled = false;
  }
}

function renderAccountingActivationChart(pane = document.getElementById('accountingPane')) {
  const imported = accountingActivation.import;
  pane.innerHTML = accountingActivationShell(
    3,
    `<section class="acct-wizard-chart"><span class="acct-kicker">Familiar accounts. A fresh workspace.</span><h3>Bring your chart of accounts.</h3><p>Upload an Aplos or QuickBooks chart-of-accounts CSV. We’ll show what will be created and what will link to an existing account before you approve anything.</p><div class="acct-wizard-note">Account names, numbers and types only. Balances and transaction history are not posted. Existing system accounts stay protected.</div>${
      imported?.result
        ? `<div class="acct-wizard-success" role="status"><b>Your accounts are ready.</b><p>${imported.result.alreadyImported ? 'This file was already imported safely.' : `${imported.result.created} accounts created · ${imported.result.linked} linked to existing accounts.`}</p></div><button class="acct-primary" onclick="finishAccountingActivation(this)">Open my books →</button>`
        : `<form class="acct-wizard-form" onsubmit="previewAccountingActivationChart(event)"><div class="acct-wizard-form-grid"><label>Exported from<select name="sourceSystem"><option value="aplos" ${imported?.sourceSystem !== 'quickbooks' ? 'selected' : ''}>Aplos</option><option value="quickbooks" ${imported?.sourceSystem === 'quickbooks' ? 'selected' : ''}>QuickBooks</option></select></label><label>Chart of accounts CSV<input name="file" type="file" accept=".csv,text/csv" ${imported?.csv ? '' : 'required'}><small>Up to 250 accounts · 1 MB · CSV with column headers</small></label></div><details><summary>Match columns manually</summary><p>Leave blank to detect common Aplos and QuickBooks headers. Use the exact column name if your export differs.</p><div class="acct-wizard-form-grid">${[
            ['name', 'Account name'],
            ['accountNumber', 'Account number'],
            ['type', 'Account type'],
            ['sourceRef', 'Account ID (optional)'],
            ['description', 'Description (optional)'],
          ]
            .map(
              ([key, label]) =>
                `<label>${label}<input name="column_${key}" value="${escapeAttr(imported?.columnMap?.[key] || '')}" placeholder="Auto-detect"></label>`
            )
            .join(
              ''
            )}</div></details><button class="acct-primary">${imported?.csv ? 'Review updated CSV' : 'Preview my accounts'} →</button><div class="acct-form-status" role="status"></div></form><div id="accountingActivationPreview">${imported?.preview ? accountingActivationChartPreview(imported.preview) : ''}</div><div class="acct-wizard-skip"><span>Starting fresh? Your parish starter chart is already prepared.</span><button class="acct-refresh" onclick="finishAccountingActivation(this)">Use starter chart for now →</button></div>`
    }</section>`
  );
}

function accountingActivationChartPreview(preview) {
  const categories = [
    ['asset', 'Asset'],
    ['liability', 'Liability'],
    ['net_asset', 'Net assets / equity'],
    ['revenue', 'Revenue / income'],
    ['expense', 'Expense'],
  ];
  return `<section class="acct-wizard-review"><h4>Review your import</h4><p><b>${preview.createCount} new accounts</b> · ${preview.linkCount} existing account links</p>${preview.ignoredBalanceColumns.length ? `<p class="acct-wizard-note">Balance columns ignored: ${preview.ignoredBalanceColumns.map(escapeHtml).join(', ')}. Opening balances remain pending.</p>` : ''}<div class="acct-wizard-form-grid">${preview.distinctSourceTypes.map((type) => `<label>${escapeHtml(type)} →<select data-activation-type="${escapeAttr(type)}" onchange="updateAccountingActivationTypes()"><option value="">Choose category…</option>${categories.map(([value, label]) => `<option value="${value}" ${preview.selectedTypeMap[type] === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}</div>${
    preview.errors.length
      ? `<div class="acct-wizard-errors" role="alert"><b>Resolve these items before importing</b><ul>${preview.errors
          .slice(0, 20)
          .map((error) => `<li>Row ${error.rowNumber}: ${escapeHtml(error.message)}</li>`)
          .join('')}</ul></div>`
      : ''
  }<div class="acct-wizard-table" tabindex="0" aria-label="Account import preview"><table><thead><tr><th>Number</th><th>Account</th><th>Category</th><th>Action</th></tr></thead><tbody>${preview.rows.map((row) => `<tr><td>${escapeHtml(row.accountNumber || 'Auto')}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.category || 'Choose above')}</td><td>${row.action === 'link' ? `Link → ${escapeHtml(row.matchName)}` : 'Create new'}</td></tr>`).join('')}</tbody></table></div><label class="acct-wizard-confirm"><input type="checkbox" id="accountingActivationConfirm">I reviewed the categories and existing account links. Create these accounts without posting balances.</label><button class="acct-primary" id="accountingActivationCommit" onclick="commitAccountingActivationChart(this)" ${preview.errors.length ? 'disabled' : ''}>Import reviewed accounts →</button><div role="status" id="accountingActivationImportStatus" class="acct-form-status"></div></section>`;
}

async function previewAccountingActivationChart(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Reading and validating accounts…';
  try {
    const file = form.elements.file.files[0],
      raw = Object.fromEntries(new FormData(form));
    if (file && file.size > 1_000_000) throw new Error('Choose a CSV smaller than 1 MB.');
    const previous = accountingActivation.import;
    if (!file && !previous?.csv) throw new Error('Choose an Aplos or QuickBooks CSV.');
    const input = {
      filename: file?.name || previous.filename,
      csv: file ? await file.text() : previous.csv,
      sourceSystem: raw.sourceSystem,
      columnMap: Object.fromEntries(
        Object.entries(raw)
          .filter(([key]) => key.startsWith('column_'))
          .map(([key, value]) => [key.slice(7), value])
      ),
      typeMap: file ? {} : previous.typeMap || {},
    };
    const { preview } = await accountingAccessRequest('/activation/chart/preview', input);
    accountingActivation.import = { ...input, preview, columnMap: preview.columnMap, typeMap: preview.selectedTypeMap };
    renderAccountingActivationChart();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function updateAccountingActivationTypes() {
  const input = accountingActivation.import;
  input.typeMap = Object.fromEntries(
    [...document.querySelectorAll('[data-activation-type]')].map((select) => [
      select.dataset.activationType,
      select.value,
    ])
  );
  const button = document.getElementById('accountingActivationCommit');
  if (button) button.disabled = true;
  const typeMap = { ...input.typeMap };
  try {
    const { preview } = await accountingAccessRequest('/activation/chart/preview', {
      ...input,
      typeMap,
      preview: undefined,
    });
    if (JSON.stringify(typeMap) !== JSON.stringify(input.typeMap)) return;
    input.preview = preview;
    document.getElementById('accountingActivationPreview').innerHTML = accountingActivationChartPreview(preview);
  } catch (error) {
    document.getElementById('accountingActivationImportStatus').textContent = error.message;
  }
}

async function commitAccountingActivationChart(button) {
  const status = document.getElementById('accountingActivationImportStatus');
  if (!document.getElementById('accountingActivationConfirm').checked) {
    status.textContent = 'Confirm the reviewed account mappings first.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Importing your reviewed accounts…';
  try {
    const input = accountingActivation.import;
    if (!input.migrationSessionId) {
      const { session } = await accountingMigrationRequest('/sessions', { sourceSystem: input.sourceSystem });
      input.migrationSessionId = session.id;
    }
    const { result } = await accountingAccessRequest('/activation/chart/commit', {
      ...input,
      preview: undefined,
      fingerprint: input.preview.fingerprint,
      confirmed: true,
    });
    accountingActivation.import = { result }; // Release raw CSV from browser memory after commit.
    renderAccountingActivationChart();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function finishAccountingActivation(button) {
  button.disabled = true;
  try {
    await accountingAccessRequest('/activation/complete');
    accountingActivation.import = null;
    accountingActivation.complete = true;
    await loadAccountingTab(true);
  } catch (error) {
    button.disabled = false;
    const status = document.querySelector('.acct-wizard .acct-form-status');
    if (status) status.textContent = error.message;
  }
}
