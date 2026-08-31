'use strict';

// Parish dashboard accounting: migration.
// Classic script; preserve global names used by the dashboard and inline actions.

async function accountingMigrationRequest(path, body = null) {
  const response = await fetch(accountingApi(`/migration${path}`), {
    method: body === null ? 'GET' : 'POST',
    headers: body === null ? authHeaders() : { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Migration request failed.');
  return payload;
}

async function openAccountingMigration() {
  try {
    const payload = await accountingMigrationRequest('/sessions');
    accountingMigration = {
      ...accountingMigration,
      active: true,
      sessions: payload.sessions || [],
      session: (payload.sessions || []).find((session) => session.status === 'in_progress') || null,
      step: (payload.sessions || []).some((session) => session.status === 'in_progress') ? 'chart' : 'source',
    };
    renderAccountingPane();
  } catch (error) {
    alert(error.message);
  }
}

function closeAccountingMigration() {
  accountingMigration = { active: false, session: null, sessions: [], step: 'source', previews: {}, advanced: false };
  renderAccountingPane();
}

async function createAccountingMigrationSession(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  status.textContent = 'Starting migration…';
  try {
    const payload = await accountingMigrationRequest('/sessions', {
      sourceSystem: new FormData(form).get('sourceSystem'),
    });
    accountingMigration.session = payload.session;
    accountingMigration.sessions = [
      payload.session,
      ...accountingMigration.sessions.filter((session) => session.id !== payload.session.id),
    ];
    accountingMigration.step = 'chart';
    renderAccountingPane();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function resumeAccountingMigration(id) {
  try {
    const payload = await accountingMigrationRequest(`/sessions/${encodeURIComponent(id)}`);
    accountingMigration.session = payload.session;
    accountingMigration.step = 'chart';
    renderAccountingPane();
  } catch (error) {
    alert(error.message);
  }
}

function setAccountingMigrationStep(step) {
  accountingMigration.step = step;
  renderAccountingPane();
}

function migrationStatus(value) {
  return String(value || 'not_started').replaceAll('_', ' ');
}

function migrationSourceGuide(sourceSystem, expanded = false) {
  const source = String(sourceSystem || '').toLowerCase();
  if (!['aplos', 'quickbooks'].includes(source)) return '';
  const isAplos = source === 'aplos';
  const sourceName = isAplos ? 'Aplos' : 'QuickBooks Desktop';
  const peopleSteps = isAplos
    ? [
        'Navigate to Reports and choose the Contact Details report.',
        'Click the orange plus sign to add the fields you want to bring over, such as address.',
        'Under Report Actions, click Export to export the file to Excel.',
      ]
    : [
        'Open the Reports menu and select Customer Contact List.',
        'Click Customize in the top-left corner.',
        'Click Change Columns and choose the columns to include in your export.',
        'Click Run Report.',
        'Click Export and save the report as an Excel file.',
      ];
  const givingSteps = isAplos
    ? [
        'Navigate to Donor Management.',
        'Select Donation Reports, then Donations by Contact.',
        'Set the date range you want to migrate.',
        'Under Report Filters, choose Funds and select every fund.',
        'Select Download to export the report.',
      ]
    : [
        'Open Reports, highlight Sales, and select Sales by Customer Detail.',
        'Select the date range you want to migrate.',
        'Click Refresh.',
        'Click Export or Excel and save the report as an Excel file.',
      ];
  const list = (steps) => `<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
  return `<details class="acct-card acct-migration-guide" ${expanded ? 'open' : ''}><summary><span><small>Source guide</small><strong>Exporting data from ${escapeHtml(sourceName)}</strong></span><i aria-hidden="true">⌄</i></summary><div class="acct-migration-guide-body"><section><h3>Exporting people</h3>${list(peopleSteps)}</section><section><h3>Exporting giving</h3>${list(givingSteps)}</section><section class="acct-migration-guide-import"><h3>Preparing files for AGAPAY</h3><ol><li>Open the matching migration step for the data you are importing.</li><li>Use the exported workbook to populate the requested columns.</li><li>Keep the first row intact because it contains the column headers.</li><li>Save the finished file as a <strong>.CSV</strong> file.</li><li>Upload the CSV in this workspace, review the preview, and commit it when the results are correct.</li></ol></section></div></details>`;
}

function migrationCsvForm(kind, title, columns) {
  return `<form class="acct-phase-form" onsubmit="previewAccountingMigrationCsv(event,'${escapeAttr(kind)}')"><label>${escapeHtml(title)} CSV<input name="file" type="file" accept=".csv,text/csv" required></label><details><summary>Column names</summary><div class="acct-form-grid">${columns.map(([key, label, fallback]) => `<label>${escapeHtml(label)}<input name="column_${escapeAttr(key)}" value="${escapeAttr(fallback)}" required></label>`).join('')}</div></details><button class="acct-primary">Review CSV</button><span class="acct-form-status"></span></form>`;
}

async function previewAccountingMigrationCsv(event, kind) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    raw = Object.fromEntries(new FormData(form)),
    file = form.elements.file.files[0];
  status.textContent = 'Validating CSV…';
  try {
    const columnMap = Object.fromEntries(
      Object.entries(raw)
        .filter(([key]) => key.startsWith('column_'))
        .map(([key, value]) => [key.slice(7), value])
    );
    const paths = {
      chart: 'chart-of-accounts',
      vendors: 'vendors',
      funds: 'funds',
      opening: 'opening-balance',
      history: 'transaction-history',
    };
    const payload = await accountingMigrationRequest(`/${paths[kind]}/preview`, {
      filename: file.name,
      csv: await file.text(),
      columnMap,
      migrationSessionId: accountingMigration.session?.id,
    });
    accountingMigration.previews[kind] = payload.preview;
    renderAccountingPane();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function refreshAccountingMigrationSession() {
  if (!accountingMigration.session) return;
  const payload = await accountingMigrationRequest(`/sessions/${encodeURIComponent(accountingMigration.session.id)}`);
  accountingMigration.session = payload.session;
}

function migrationCommitBase(kind) {
  return {
    migrationSessionId: accountingMigration.session.id,
    acknowledgeExistingActivity: Boolean(
      (kind === 'history'
        ? [...document.querySelectorAll('[id="migrationAcknowledgeExisting"]')].at(-1)
        : document.getElementById('migrationAcknowledgeExisting')
      )?.checked
    ),
  };
}

async function commitAccountingMigrationStep(kind) {
  if (kind === 'chart' && !confirm('Confirm each mapped source account type and commit this chart of accounts?'))
    return;
  const status = document.querySelector('[data-migration-commit-status]');
  if (status) status.textContent = 'Committing reviewed data…';
  try {
    const preview = accountingMigration.previews[kind],
      base = { ...migrationCommitBase(kind), preview };
    let path,
      body = base,
      next = 'cutover';
    if (kind === 'chart') {
      path = '/chart-of-accounts/commit';
      body.typeMap = Object.fromEntries(
        Array.from(document.querySelectorAll('[data-migration-type]')).map((select) => [
          select.dataset.migrationType,
          select.value,
        ])
      );
      next = 'vendors';
    } else if (kind === 'vendors') {
      path = '/vendors/commit';
      next = 'funds';
    } else if (kind === 'funds') {
      path = '/funds/commit';
      body.mappings = preview.rows
        .filter((row) => row.status === 'matched')
        .map((row) => ({ sourceFundRef: row.sourceFundRef, agapayFundId: row.agapayFundId }));
      body.newFunds = preview.rows
        .filter((row) => row.status === 'unmatched')
        .map((row) => ({
          sourceFundRef: row.sourceFundRef,
          displayName: document.querySelector(`[data-migration-fund-name="${CSS.escape(row.sourceFundRef)}"]`).value,
          restrictionType: document.querySelector(
            `[data-migration-fund-restriction="${CSS.escape(row.sourceFundRef)}"]`
          ).value,
          donorRestricted: document.querySelector(`[data-migration-fund-donor="${CSS.escape(row.sourceFundRef)}"]`)
            .checked,
          accountNumber: document.querySelector(`[data-migration-fund-number="${CSS.escape(row.sourceFundRef)}"]`)
            .value,
        }));
    } else if (kind === 'opening') {
      path = '/opening-balance/commit';
      body.effectiveDate = document.getElementById('migrationOpeningDate').value;
    } else {
      path = '/transaction-history/commit';
      body.advancedOptIn = true;
      body.batchSize = 200;
    }
    const payload = await accountingMigrationRequest(path, body);
    await refreshAccountingMigrationSession();
    if (kind === 'history' && !payload.progress?.complete) {
      accountingMigration.previews.history = preview;
      if (status)
        status.textContent = `${payload.progress.processed} of ${payload.progress.total} entries posted. Run the next batch to continue.`;
      renderAccountingPane();
      return;
    }
    delete accountingMigration.previews[kind];
    accountingMigration.step = next;
    await loadAccountingTab(true);
    accountingMigration.active = true;
    renderAccountingPane();
  } catch (error) {
    if (status) status.textContent = error.message;
    else alert(error.message);
  }
}

function migrationPreviewErrors(preview) {
  return preview?.errors?.length
    ? `<div class="acct-empty error"><strong>${preview.errors.length} item${preview.errors.length === 1 ? '' : 's'} need attention</strong><span>${escapeHtml(
        preview.errors
          .slice(0, 5)
          .map((error) => `${error.rowNumber ? `Row ${error.rowNumber}: ` : ''}${error.code}`)
          .join(' · ')
      )}</span></div>`
    : '';
}

function renderAccountingMigrationWizard(pane) {
  const session = accountingMigration.session;
  if (!session) {
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Accounting setup</span><h2>Move to AGAPAY</h2><p>CSV-based migration keeps the transfer reviewable and avoids creating a permanent live connection to the old system.</p></div><button class="acct-refresh" onclick="closeAccountingMigration()">← Setup</button></div><div class="acct-setup-grid"><section class="acct-card acct-setup-lead"><h2>Choose the source system</h2><form class="acct-phase-form" onsubmit="createAccountingMigrationSession(event)"><label>Source<select name="sourceSystem"><option value="quickbooks">QuickBooks</option><option value="aplos">Aplos</option><option value="other">Other CSV export</option></select></label><button class="acct-primary">Start migration</button><span class="acct-form-status"></span></form></section>${accountingMigration.sessions.length ? `<section class="acct-card"><h2>Previous sessions</h2>${accountingMigration.sessions.map((item) => `<button class="acct-refresh" onclick="resumeAccountingMigration('${escapeAttr(item.id)}')">${escapeHtml(item.sourceSystem)} · ${escapeHtml(migrationStatus(item.status))}</button>`).join('')}</section>` : ''}</div><div class="acct-migration-source-guides">${migrationSourceGuide('aplos', true)}${migrationSourceGuide('quickbooks')}</div>`;
    return;
  }
  const steps = [
    ['chart', 'Chart of accounts', session.chartOfAccountsStatus],
    ['vendors', 'Vendors', session.vendorsStatus],
    ['funds', 'Funds', session.fundMappingStatus],
    [
      'cutover',
      'Balances & history',
      session.openingBalanceStatus === 'completed' ? session.openingBalanceStatus : session.transactionHistoryStatus,
    ],
  ];
  const nav = `<div class="acct-checklist">${steps.map(([key, label, status]) => `<button type="button" class="${accountingMigration.step === key ? 'active' : ''} ${status === 'completed' ? 'complete' : ''}" onclick="setAccountingMigrationStep('${key}')"><i>${status === 'completed' ? '✓' : '○'}</i><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(migrationStatus(status))}</small></span></button>`).join('')}</div>`;
  let content = '';
  if (accountingMigration.step === 'chart') {
    const preview = accountingMigration.previews.chart;
    content = `<section class="acct-card"><span class="acct-kicker">Step 1</span><h2>Chart of accounts</h2><p>AGAPAY links matching account numbers or normalized names and creates only the rest. Every source type must be explicitly confirmed.</p>${
      preview
        ? `${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account</th><th>Source type</th><th>Action</th></tr></thead><tbody>${preview.rows.map((row) => `<tr><td>${escapeHtml(`${row.accountNumber} ${row.name}`)}</td><td>${escapeHtml(row.sourceType)}</td><td>${escapeHtml(row.action)}</td></tr>`).join('')}</tbody></table></div><div class="acct-form-grid">${preview.distinctSourceTypes.map((label) => `<label>${escapeHtml(label)}<select data-migration-type="${escapeAttr(label)}" required><option value="">Confirm category</option>${['asset', 'liability', 'net_asset', 'revenue', 'expense'].map((category) => `<option value="${category}" ${preview.suggestedTypeMap[label] === category ? 'selected' : ''}>${escapeHtml(category.replaceAll('_', ' '))}</option>`).join('')}</select></label>`).join('')}</div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I reviewed existing posted activity and understand an import can double-count it.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('chart')" ${preview.invalidRows ? 'disabled' : ''}>Commit chart of accounts</button><span data-migration-commit-status></span>`
        : migrationCsvForm('chart', 'Chart of accounts', [
            ['sourceRef', 'Source account ID', 'Account ID'],
            ['accountNumber', 'Account number', 'Account Number'],
            ['name', 'Account name', 'Account Name'],
            ['type', 'Source account type', 'Account Type'],
            ['description', 'Description', 'Description'],
          ])
    }</section>`;
  } else if (accountingMigration.step === 'vendors') {
    const preview = accountingMigration.previews.vendors;
    content = `<section class="acct-card"><span class="acct-kicker">Step 2</span><h2>Vendors</h2><p>Likely duplicates are skipped by normalized display name. New vendors pass through the same validation as ordinary Payables entry.</p>${
      preview
        ? `${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Email</th><th>Action</th></tr></thead><tbody>${preview.rows.map((row) => `<tr><td>${escapeHtml(row.displayName)}</td><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.action)}</td></tr>`).join('')}</tbody></table></div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('vendors')" ${preview.invalidRows ? 'disabled' : ''}>Commit vendors</button><span data-migration-commit-status></span>`
        : migrationCsvForm('vendors', 'Vendor list', [
            ['displayName', 'Vendor name', 'Vendor Name'],
            ['legalName', 'Legal name', 'Legal Name'],
            ['email', 'Email', 'Email'],
            ['phone', 'Phone', 'Phone'],
            ['taxIdLast4', 'Tax ID last four', 'Tax ID Last 4'],
            ['taxClassification', 'Tax classification', 'Tax Classification'],
          ])
    }</section>`;
  } else if (accountingMigration.step === 'funds') {
    const preview = accountingMigration.previews.funds;
    content = `<section class="acct-card"><span class="acct-kicker">Step 3</span><h2>Fund mapping</h2><p>Matched funds are linked. New funds are created only through the real Funds &amp; Alms save, using the complete current catalog plus these additions.</p>${
      preview
        ? `${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Source fund</th><th>Decision</th></tr></thead><tbody>${preview.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.status === 'matched' ? `Matched to ${escapeHtml(row.agapayFundId)}` : `<div class="acct-form-grid"><label>Name<input data-migration-fund-name="${escapeAttr(row.sourceFundRef)}" value="${escapeAttr(row.name)}"></label><label>Restriction<select data-migration-fund-restriction="${escapeAttr(row.sourceFundRef)}"><option value="">Confirm restriction</option><option value="unrestricted">Unrestricted</option><option value="board_designated">Board designated</option><option value="donor_restricted_temporary">Donor restricted — temporary</option><option value="donor_restricted_permanent">Donor restricted — permanent</option></select></label><label>Account number<input data-migration-fund-number="${escapeAttr(row.sourceFundRef)}"></label><label><input data-migration-fund-donor="${escapeAttr(row.sourceFundRef)}" type="checkbox"> Donor restricted</label></div>`}</td></tr>`).join('')}</tbody></table></div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('funds')" ${preview.invalidRows ? 'disabled' : ''}>Save Funds &amp; Alms and commit mapping</button><span data-migration-commit-status></span>`
        : migrationCsvForm('funds', 'Class or fund list', [
            ['sourceRef', 'Source fund ID', 'Fund ID'],
            ['name', 'Fund name', 'Fund Name'],
          ])
    }</section>`;
  } else {
    const opening = accountingMigration.previews.opening,
      history = accountingMigration.previews.history;
    content = `<section class="acct-card acct-setup-lead"><span class="acct-kicker">Recommended cutover</span><h2><strong>Start clean with an opening balance</strong></h2><p>Export a trial balance as of the day before AGAPAY begins. An unbalanced file is stopped in preview before anything posts.</p>${
      opening
        ? `${migrationPreviewErrors(opening)}<div class="acct-facts"><div><strong>${accountingMoney(opening.totalDebits)}</strong><span>Debits</span></div><div><strong>${accountingMoney(opening.totalCredits)}</strong><span>Credits</span></div><div><strong>${opening.balanced ? 'Balanced' : 'Not balanced'}</strong><span>Preview status</span></div></div><label>Effective date<input id="migrationOpeningDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('opening')" ${opening.eligibleToCommit ? '' : 'disabled'}>Post opening balance</button><span data-migration-commit-status></span>`
        : migrationCsvForm('opening', 'Trial balance', [
            ['accountRef', 'Account reference', 'Account'],
            ['debit', 'Debit', 'Debit'],
            ['credit', 'Credit', 'Credit'],
            ['fundRef', 'Optional fund reference', 'Fund'],
          ])
    }</section><section class="acct-card"><details ${accountingMigration.advanced ? 'open' : ''} ontoggle="accountingMigration.advanced=this.open"><summary><strong>Import full transaction history (advanced)</strong></summary><p class="acct-report-disclaimer">This reconstructs general-ledger balances only. It does not reconstruct the accounts-payable subledger, bill aging, or linked bill/payment history. Enter open unpaid bills manually through Payables after cutover.</p>${
      history
        ? `${migrationPreviewErrors(history)}<p><strong>Grouping:</strong> ${escapeHtml(history.groupingMethod)} — ${escapeHtml(history.groupingExplanation)}</p><p>${history.eligibleGroups} balanced entries are eligible.</p><label><input id="migrationAcknowledgeExisting" type="checkbox"> I understand the AP limitation and acknowledge existing posted activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('history')">Post next batch of up to 200</button><span data-migration-commit-status></span>`
        : migrationCsvForm('history', 'General ledger detail', [
            ['date', 'Date', 'Date'],
            ['accountRef', 'Account reference', 'Account'],
            ['debit', 'Debit', 'Debit'],
            ['credit', 'Credit', 'Credit'],
            ['memo', 'Memo', 'Memo'],
            ['description', 'Description', 'Description'],
            ['fundRef', 'Optional fund/class', 'Fund'],
            ['groupRef', 'Optional transaction ID', 'Transaction ID'],
          ])
    }</details></section>`;
  }
  const sourceGuides = `<div class="acct-migration-source-guides">${migrationSourceGuide('aplos', session.sourceSystem === 'aplos')}${migrationSourceGuide('quickbooks', session.sourceSystem === 'quickbooks')}</div>`;
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">${escapeHtml(session.sourceSystem)} migration</span><h2>Migration workspace</h2><p>Session ${escapeHtml(session.id)} · progress is saved after every committed step.</p></div><button class="acct-refresh" onclick="closeAccountingMigration()">← Setup</button></div><div class="acct-setup-grid"><aside class="acct-card">${nav}</aside><div class="acct-migration-main">${sourceGuides}${content}</div></div>`;
}
