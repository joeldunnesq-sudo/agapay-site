// Generated from src/browser/parish/features/accounting/assets.ts by npm run build:browser. Do not edit.
'use strict';
let accountingAssetsTenant = '';
let accountingAssetsRequest = 0;
let accountingAssetsData = null;
let accountingAssetDetail = null;
let accountingAssetAsOf = '';
let accountingAssetBusy = false;
let accountingAssetPreviewRequest = 0;
let accountingAssetError = '';
let accountingAssetPreview = null;
function resetAccountingAssets() {
  accountingAssetsTenant = currentParish?.parishId || '';
  accountingAssetsRequest++;
  accountingAssetsData = null;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  accountingAssetError = '';
  accountingAssetBusy = false;
  accountingAssetAsOf = accountingReportPeriod().end;
}
async function accountingAssetFetch(path, method = 'GET', body) {
  const response = await fetch(accountingApi('/assets' + path), {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Unable to load assets.');
  return payload;
}
async function loadAccountingAssets() {
  if (accountingAssetsTenant !== (currentParish?.parishId || '')) resetAccountingAssets();
  const request = ++accountingAssetsRequest,
    tenant = accountingAssetsTenant;
  accountingAssetBusy = true;
  accountingAssetsData = null;
  accountingAssetError = '';
  renderAccountingPane();
  try {
    const data = await accountingAssetFetch('?asOf=' + encodeURIComponent(accountingAssetAsOf));
    if (request === accountingAssetsRequest && tenant === currentParish?.parishId) accountingAssetsData = data;
  } catch (error) {
    if (request === accountingAssetsRequest) accountingAssetError = error.message;
  } finally {
    if (request === accountingAssetsRequest) {
      accountingAssetBusy = false;
      if (accountingView === 'assets') renderAccountingPane();
    }
  }
}
function accountingAssetAccountOptions(category, normalBalance) {
  return (
    '<option value="">Choose account</option>' +
    accountingData.accounts
      .filter((a) => a.category === category && (!normalBalance || a.normalBalance === normalBalance))
      .map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`)
      .join('')
  );
}
function renderAccountingAssets(pane) {
  if (accountingAssetsTenant !== (currentParish?.parishId || '')) resetAccountingAssets();
  if (accountingAssetDetail) {
    renderAccountingAssetDetail(pane);
    return;
  }
  const data = accountingAssetsData;
  pane.innerHTML = `<section class="acct-asset-hero"><div><span class="acct-kicker">Stewardship of parish property</span><h2>Assets, clearly accounted for.</h2><p>Track what the parish owns, where it belongs, and its value over time.</p></div><button class="acct-primary" onclick="newAccountingAsset()">＋ Register an asset</button></section>
 <div class="acct-asset-toolbar"><button class="acct-refresh" onclick="showAccountingAssetAccountSetup()">Set up asset accounts</button><label>Values as of <input type="date" value="${escapeAttr(accountingAssetAsOf)}" onchange="accountingAssetAsOf=this.value;loadAccountingAssets()"></label><button class="acct-refresh" onclick="loadAccountingAssets()">Refresh</button><button class="acct-refresh" onclick="setAccountingView('reports');openAccountingReport('assetRegister')">Open printable report</button><label>Find an asset <input type="search" placeholder="Name, tag or location" oninput="filterAccountingAssets(this.value)"></label></div>
 ${accountingAssetError ? `<div role="alert" class="acct-card">${escapeHtml(accountingAssetError)}</div>` : ''}
 ${accountingAssetBusy ? '<p role="status">Loading asset register…</p>' : ''}
 ${data ? `<div class="acct-asset-metrics"><section><span>Active asset cost</span><strong>${accountingMoney(data.totals.cost)}</strong></section><section><span>Posted depreciation</span><strong>${accountingMoney(data.totals.accumulated)}</strong></section><section><span>Net book value</span><strong>${accountingMoney(data.totals.netBookValue)}</strong></section></div><p class="acct-asset-policy">${escapeHtml(data.policy)}</p>${data.rows.length && data.reconciliation ? `<p class="acct-asset-policy" role="status">${data.reconciliation.balanced ? 'Registered control accounts reconcile to the ledger.' : 'Review unregistered assets or prior depreciation: cost difference ' + accountingMoney(data.reconciliation.costDifference) + '; accumulated depreciation difference ' + accountingMoney(data.reconciliation.accumulatedDifference) + '.'}</p>` : ''}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Asset</th><th>Location</th><th>Cost</th><th>Posted depreciation</th><th>Book value</th><th>Status</th></tr></thead><tbody id="accountingAssetRows">${data.rows.map((a) => `<tr data-asset-search="${escapeAttr((a.tag + ' ' + a.name + ' ' + a.location).toLowerCase())}"><td><button class="acct-link" data-asset-id="${escapeAttr(a.id)}" onclick="openAccountingAsset(this.dataset.assetId)"><strong>${escapeHtml(a.tag)}</strong> · ${escapeHtml(a.name)}</button></td><td>${escapeHtml(a.location || '—')}</td><td>${accountingMoney(a.cost)}</td><td>${accountingMoney(a.postedDepreciation)}</td><td><strong>${accountingMoney(a.netBookValue)}</strong></td><td>${escapeHtml(a.status)}</td></tr>`).join('') || '<tr><td colspan="6">No registered assets for this date. Record the acquisition, then register the asset.</td></tr>'}</tbody></table></div>` : '<p>Choose Refresh to load the register.</p>'}`;
}
function filterAccountingAssets(query) {
  document
    .querySelectorAll('#accountingAssetRows tr[data-asset-search]')
    .forEach((row) => (row.hidden = !row.dataset.assetSearch?.includes(query.trim().toLowerCase())));
}
async function openAccountingAsset(id) {
  const tenant = currentParish?.parishId,
    request = ++accountingAssetsRequest;
  try {
    const detail = await accountingAssetFetch('/' + encodeURIComponent(id));
    if (tenant !== currentParish?.parishId || request !== accountingAssetsRequest || accountingView !== 'assets')
      return;
    accountingAssetDetail = detail;
    accountingAssetPreview = null;
    renderAccountingPane();
  } catch (error) {
    alert(error.message);
  }
}
function closeAccountingAsset() {
  accountingAssetsRequest++;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  loadAccountingAssets();
}
async function newAccountingAsset() {
  const pane = document.getElementById('accountingPane'),
    tenant = currentParish?.parishId,
    request = ++accountingAssetsRequest;
  pane.innerHTML = '<p role="status">Finding posted acquisitions…</p>';
  try {
    const response = await fetch(accountingApi('/assets/acquisition-lines'), { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load acquisitions.');
    if (tenant !== currentParish?.parishId || request !== accountingAssetsRequest || accountingView !== 'assets')
      return;
    pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-card"><span class="acct-kicker">Add to the register</span><h2>Register a parish asset</h2><button class="acct-link" type="button" onclick="showAccountingAssetAccountSetup()">Set up asset accounts</button><p>Record the purchase, opening balance, or in-kind gift in the ledger first. Select its asset debit below. Registration does not book the cost again.</p><p>Cost account: debit asset, investing classification. Accumulated depreciation: credit asset, operating classification. Use Set up asset accounts to create or select these accounts before registering.</p><form class="acct-phase-form" onsubmit="saveAccountingAsset(event)"><div class="acct-form-grid">
 <label>Acquisition entry<select name="acquisitionLineId" required><option value="">Choose posted asset debit</option>${data.rows
   .filter((r) => r.available > 0)
   .map(
     (r) =>
       `<option value="${escapeAttr(r.id)}">${escapeHtml(r.entry_date)} · ${escapeHtml(r.account_name)} · ${accountingMoney(r.available)} available · ${escapeHtml(r.description)}</option>`
   )
   .join('')}</select></label>
 <label>Asset tag<input name="tag" required maxlength="80" placeholder="EQ-001"></label><label>Asset name<input name="name" required maxlength="160"></label><label>In-service date<input name="inServiceDate" type="date" required></label>
 <label>Cost allocated to this asset<input name="cost" type="number" min="0.01" step="0.01" required></label><label>Salvage value<input name="salvage" type="number" min="0" step="0.01" value="0" required></label><label>Useful life (months)<input name="lifeMonths" type="number" min="1" max="1200" value="60" required></label><label>Depreciation method<select name="method"><option value="straight_line">Monthly straight-line</option><option value="none">Nondepreciable (e.g. land)</option></select></label>
 <label>Accumulated depreciation<select name="accumulatedAccountId">${accountingAssetAccountOptions('asset', 'credit')}</select></label><label>Depreciation expense<select name="expenseAccountId">${accountingAssetAccountOptions('expense', 'debit')}</select></label><label>Location<input name="location" maxlength="160"></label><label>Serial number<input name="serialNumber" maxlength="160"></label><label>Insurance value<input name="insuranceValue" type="number" min="0" step="0.01" value="0"></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label></div>
 <p>Monthly straight-line includes the full in-service and disposal months. Financial terms are fixed when registered. Historical assets with prior depreciation require a reviewed opening subledger import; do not register them as new acquisitions.</p><button class="acct-primary">Register asset</button><span class="acct-form-status" role="status"></span></form></section>`;
  } catch (error) {
    if (tenant === currentParish?.parishId)
      pane.innerHTML = accountingEmpty('Asset registration unavailable', error.message);
  }
}
function accountingAssetFormValues(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  for (const key of ['cost', 'salvage', 'insuranceValue', 'proceeds'])
    if (key in values) values[key] = Math.round(Number(values[key]) * 100);
  if ('lifeMonths' in values) values.lifeMonths = Number(values.lifeMonths);
  return values;
}
async function saveAccountingAsset(event) {
  event.preventDefault();
  const form = event.currentTarget,
    tenant = currentParish?.parishId,
    button = form.querySelector('button'),
    status = form.querySelector('.acct-form-status');
  button.disabled = true;
  status.textContent = 'Registering…';
  const values = accountingAssetFormValues(form);
  values.operationKey = form.dataset.operationKey ||= crypto.randomUUID();
  try {
    const result = await accountingAssetFetch('', 'POST', values);
    if (tenant === currentParish?.parishId) await openAccountingAsset(result.asset.id);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
function renderAccountingAssetDetail(pane) {
  const detail = accountingAssetDetail,
    a = detail.asset;
  pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-asset-hero"><div><span class="acct-kicker">${escapeHtml(a.tag)} · ${escapeHtml(a.status)}</span><h2>${escapeHtml(a.name)}</h2><p>Acquired ${accountingDate(a.acquisition_date)} · In service ${accountingDate(a.in_service_date)}</p></div><strong>${accountingMoney(a.cost)} cost</strong></section>
 <section class="acct-card"><h3>Property details</h3><form class="acct-phase-form" onsubmit="saveAccountingAssetMetadata(event)"><div class="acct-form-grid"><label>Location<input name="location" maxlength="160" value="${escapeAttr(a.location)}"></label><label>Serial number<input name="serialNumber" maxlength="160" value="${escapeAttr(a.serial_number)}"></label><label>Insurance value<input name="insuranceValue" type="number" min="0" step="0.01" value="${a.insurance_value / 100}"></label><label>Notes<textarea name="notes" maxlength="4000">${escapeHtml(a.notes)}</textarea></label></div><button class="acct-refresh">Save details</button><span class="acct-form-status" role="status"></span></form></section>
 ${a.status === 'active' ? `<section class="acct-card"><h3>Review an accounting action</h3><p>Preview calculated entries before posting. Disposal includes any depreciation due through its month.</p><form class="acct-phase-form" onsubmit="previewAccountingAsset(event)" oninput="invalidateAccountingAssetPreview()"><div class="acct-form-grid"><label>Action<select name="kind"><option value="depreciation">Post depreciation</option><option value="disposal">Dispose / retire asset</option></select></label><label>Posting date<input type="date" name="throughDate" required value="${escapeAttr(accountingAssetAsOf)}"></label><label>Disposal proceeds (zero for retirement)<input name="proceeds" type="number" step="0.01" min="0" value="0"></label><label>Proceeds cash account<select name="cashAccountId">${accountingAssetAccountOptions('asset', 'debit')}</select></label><label>Gain account<select name="gainAccountId">${accountingAssetAccountOptions('revenue', 'credit')}</select></label><label>Loss account<select name="lossAccountId">${accountingAssetAccountOptions('expense', 'debit')}</select></label></div><button class="acct-primary">Preview journal</button><span class="acct-form-status" role="status"></span></form><div id="accountingAssetPreview"></div></section>` : ''}
 <section class="acct-card"><h3>Posted asset history</h3><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Through</th><th>Action</th><th>Depreciation</th><th>Supporting entry</th></tr></thead><tbody>${detail.movements.map((m) => `<tr><td>${accountingDate(m.through_date)}</td><td>${escapeHtml(m.kind)}</td><td>${accountingMoney(m.depreciation)}</td><td><button class="acct-link" data-journal="${escapeAttr(m.journal_id)}" onclick="openAccountingJournalAttachments(this.dataset.journal)">Journal documents</button></td></tr>`).join('') || '<tr><td colspan="4">No asset postings yet.</td></tr>'}</tbody></table></div></section>
 <section class="acct-card"><h3>Depreciation schedule</h3><p>Estimated monthly charges · ${a.life_months} months · ${accountingMoney(a.salvage)} salvage. A schedule is not evidence of a posting.</p><details><summary>Show schedule (${detail.schedule.length} months)</summary><div class="acct-table-wrap acct-asset-schedule"><table class="acct-table"><thead><tr><th>Month-end</th><th>Charge</th><th>Accumulated</th><th>Book value</th></tr></thead><tbody>${detail.schedule.map((s) => `<tr><td>${accountingDate(s.throughDate)}</td><td>${accountingMoney(s.amount)}</td><td>${accountingMoney(s.accumulated)}</td><td>${accountingMoney(s.netBookValue)}</td></tr>`).join('')}</tbody></table></div></details></section><section class="acct-card"><h3>Acquisition documents</h3><p>Invoices, appraisals and property documents are stored with the acquisition journal entry and shared by assets linked to it.</p><div id="accountingAssetDocuments"></div></section>`;
  renderAccountingAttachments(
    'journal_entry',
    detail.source.journal_entry_id,
    document.getElementById('accountingAssetDocuments')
  );
}
async function saveAccountingAssetMetadata(event) {
  event.preventDefault();
  const form = event.currentTarget,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status');
  try {
    await accountingAssetFetch('/' + encodeURIComponent(detail.asset.id), 'PATCH', {
      ...accountingAssetFormValues(form),
      expectedVersion: detail.asset.version,
    });
    if (tenant === currentParish?.parishId) await openAccountingAsset(detail.asset.id);
  } catch (error) {
    status.textContent = error.message;
  }
}
function invalidateAccountingAssetPreview() {
  accountingAssetPreviewRequest++;
  accountingAssetPreview = null;
  const pane = document.getElementById('accountingAssetPreview');
  if (pane) pane.innerHTML = '';
}
async function previewAccountingAsset(event) {
  event.preventDefault();
  const form = event.currentTarget,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status');
  invalidateAccountingAssetPreview();
  const previewRequest = accountingAssetPreviewRequest;
  const input = accountingAssetFormValues(form),
    kind = input.kind === 'disposal' ? 'disposal' : 'depreciation';
  input.expectedVersion = detail.asset.version;
  input.operationKey = crypto.randomUUID();
  try {
    const result = await accountingAssetFetch(
      '/' + encodeURIComponent(detail.asset.id) + '/' + kind + '-preview',
      'POST',
      input
    );
    if (
      tenant !== currentParish?.parishId ||
      accountingAssetDetail !== detail ||
      previewRequest !== accountingAssetPreviewRequest
    )
      return;
    accountingAssetPreview = { kind, input, result };
    document.getElementById('accountingAssetPreview').innerHTML =
      `<div class="acct-asset-review"><h3>Review before posting</h3><p>${escapeHtml(input.throughDate)} · Depreciation ${accountingMoney(result.depreciation)} · ${kind === 'disposal' ? 'Proceeds ' + accountingMoney(result.proceeds) + ' · Gain / loss ' + accountingMoney(result.gainLoss) : 'Book value ' + accountingMoney(result.netBookValue)}</p><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account / purpose</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${result.lines.map((l) => `<tr><td>${escapeHtml(accountingData.accounts.find((a) => a.id === l.accountId)?.name || l.accountId)} · ${escapeHtml(l.description)}</td><td>${accountingMoney(l.debitAmount)}</td><td>${accountingMoney(l.creditAmount)}</td></tr>`).join('')}</tbody></table></div><button class="acct-primary" onclick="postAccountingAsset(this)">Confirm and post ${kind}</button><p>Posts the preview shown above. If you change the form, preview again before posting.</p></div>`;
  } catch (error) {
    status.textContent = error.message;
  }
}
async function postAccountingAsset(button) {
  const preview = accountingAssetPreview,
    detail = accountingAssetDetail,
    tenant = currentParish?.parishId;
  if (!preview || !detail) return;
  button.disabled = true;
  try {
    await accountingAssetFetch(
      '/' + encodeURIComponent(detail.asset.id) + '/' + (preview.kind === 'disposal' ? 'dispose' : 'depreciation-post'),
      'POST',
      preview.input
    );
    if (tenant === currentParish?.parishId) await openAccountingAsset(detail.asset.id);
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}
async function loadAccountingAssetReport() {
  const tenant = currentParish?.parishId,
    period = accountingReportPeriod();
  try {
    const data = await accountingAssetFetch('?asOf=' + encodeURIComponent(period.end));
    if (tenant !== currentParish?.parishId) return;
    accountingCustomReport = {
      title: 'Asset Register',
      subtitle: 'As of ' + period.end,
      columns: [
        { key: 'tag', label: 'Tag' },
        { key: 'name', label: 'Asset' },
        { key: 'location', label: 'Location' },
        { key: 'cost', label: 'Cost', money: true },
        { key: 'postedDepreciation', label: 'Posted depreciation', money: true },
        { key: 'netBookValue', label: 'Book value', money: true },
        { key: 'status', label: 'Status' },
      ],
      rows: data.rows,
      disclaimer:
        data.policy +
        (data.reconciliation && !data.reconciliation.balanced
          ? ' Review required: registered control accounts differ from the ledger. Cost difference ' +
            accountingMoney(data.reconciliation.costDifference) +
            '; accumulated depreciation difference ' +
            accountingMoney(data.reconciliation.accumulatedDifference) +
            '.'
          : '') +
        ' Disposed asset cost and depreciation are historical reference values; active assets reconcile to the balance sheet.',
    };
  } catch (error) {
    accountingCustomReport = { error: error.message };
  }
}
function showAccountingAssetAccountSetup() {
  accountingAssetsRequest++;
  accountingAssetDetail = null;
  accountingAssetPreview = null;
  const pane = document.getElementById('accountingPane');
  const roles = [
    {
      key: 'cost',
      title: 'Asset cost',
      number: '1500',
      name: 'Equipment',
      category: 'asset',
      normal: 'debit',
      classification: 'investing',
    },
    {
      key: 'accumulated',
      title: 'Accumulated depreciation',
      number: '1590',
      name: 'Accumulated depreciation',
      category: 'asset',
      normal: 'credit',
      classification: 'operating',
    },
    {
      key: 'expense',
      title: 'Depreciation expense',
      number: '5900',
      name: 'Depreciation expense',
      category: 'expense',
      normal: 'debit',
      classification: 'operating',
    },
  ];
  pane.innerHTML = `<button class="acct-link" onclick="closeAccountingAsset()">← Asset register</button><section class="acct-card"><span class="acct-kicker">Asset account setup</span><h2>Prepare your asset accounts</h2><p>Select an existing account or create a new one for each purpose. This creates chart accounts only. Record a purchase or non-cash gift afterward, then link its posted entry to the asset register.</p><form class="acct-phase-form" onsubmit="saveAccountingAssetAccountSetup(event)">${roles
    .map(
      (role) =>
        `<fieldset><legend>${escapeHtml(role.title)}</legend><p>${escapeHtml(role.category)} · ${escapeHtml(role.normal)} normal balance · ${escapeHtml(role.classification)} cash-flow classification</p><div class="acct-form-grid"><label>Account<select name="${role.key}ExistingId"><option value="">Create a new account</option>${accountingData.accounts
          .filter(
            (a) =>
              a.category === role.category &&
              a.normalBalance === role.normal &&
              a.cashFlowClassification === role.classification &&
              (role.category !== 'asset' || Number(a.accountNumber) >= 1100)
          )
          .map(
            (a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`
          )
          .join(
            ''
          )}</select></label><label>New account number<input name="${role.key}Number" pattern="[0-9]{4,6}" value="${role.number}"></label><label>New account name<input name="${role.key}Name" maxlength="120" value="${escapeAttr(role.name)}"></label></div></fieldset>`
    )
    .join(
      ''
    )}<label>Default fund for new depreciation expenses<select name="fundId" required>${accountingData.funds.map((f) => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.name)}</option>`).join('')}</select></label><p>Existing accounts keep their numbers, names and classifications. New numbers must be unused and above 1099.</p><button class="acct-primary">Save asset account setup</button><span class="acct-form-status" role="status"></span></form></section>`;
}
async function saveAccountingAssetAccountSetup(event) {
  event.preventDefault();
  const form = event.currentTarget,
    tenant = currentParish?.parishId,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Saving asset accounts…';
  const input = Object.fromEntries(new FormData(form));
  input.operationKey = form.dataset.operationKey ||= crypto.randomUUID();
  try {
    await accountingAssetFetch('/account-setup', 'POST', input);
    const response = await fetch(accountingApi('/workspace-reference'), { headers: authHeaders() }),
      reference = await response.json();
    if (!response.ok) throw new Error('Accounts saved. Refresh Accounting to load the updated chart.');
    if (tenant !== currentParish?.parishId || accountingView !== 'assets') return;
    accountingData.accounts = reference.accounts || accountingData.accounts;
    accountingData.accountCatalog = reference.accountCatalog || accountingData.accountCatalog;
    closeAccountingAsset();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}
