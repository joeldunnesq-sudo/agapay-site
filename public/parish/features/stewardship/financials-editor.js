'use strict';

/* global financialsState, escapeAttr, fmtDollars, escapeHtml, currentParish, stewardshipApi, authHeaders,
  loadFinancialSnapshotsPanel */
/* exported openFinancialsEditor, recalculateRestrictedFundRow, addFinancialsAssetRow,
  removeFinancialsAssetRow, saveFinancialsSnapshot */

// Financial snapshot editor, restricted-fund adjustments, and external assets.
// Read shared parish identity and authentication only when actions run.

function openFinancialsEditor() {
  const card = document.getElementById('stewardshipFinancialsEditorCard');
  const pane = document.getElementById('stewardshipFinancialsEditorPane');
  const title = document.getElementById('financialsEditorTitle');
  if (!card || !pane) return;

  const fs = financialsState.data?.snapshot || {};
  const contributions = financialsState.data?.contributionTotals || {};
  const restrictedFunds = financialsState.data?.agapayRestrictedFunds || [];
  const externalAssets = financialsState.data?.externalAssets || [];
  if (title)
    title.textContent = fs.id ? 'Edit Authoritative Financial Snapshot' : 'Complete Authoritative Financial Snapshot';
  const fmt100 = (c) => (c ? (c / 100).toFixed(2) : '');

  const assetRows = externalAssets.length
    ? externalAssets.map((asset, i) => renderFinancialsEditorAssetRow(asset, i)).join('')
    : renderFinancialsEditorAssetRow({}, 0);
  const restrictedFundRows = restrictedFunds.map((fund) => renderFinancialsRestrictedAdjustmentRow(fund)).join('');

  pane.innerHTML =
    '<form id="financialsEditorForm" onsubmit="saveFinancialsSnapshot(event)">' +
    '<div class="stewardship-form-grid" style="margin-bottom:.85rem">' +
    '<label>Snapshot title<input name="title" value="' +
    escapeAttr(fs.title || financialsState.year + ' Financial Snapshot') +
    '" /></label>' +
    '<label>Fiscal year<input name="fiscalYear" type="number" value="' +
    financialsState.year +
    '" readonly /></label>' +
    '</div>' +
    '<div class="stewardship-editor-section">' +
    '<div>' +
    '<h3>Restricted Fund Balances</h3>' +
    '<p>Inflows are calculated from AGAPAY and qualified outside contributions. Enter the opening balance and expenses or deductions for each fund.</p>' +
    '</div>' +
    (restrictedFundRows
      ? '<div class="sw-fin-restricted-header"><span>Fund</span><span>Opening</span><span>Inflows</span><span>Deductions</span><span>Ending</span><span>Note</span></div><div id="financialsRestrictedAdjustmentRows">' +
        restrictedFundRows +
        '</div>'
      : '<p class="muted">No donor-restricted funds are configured in Funds &amp; Alms.</p>') +
    '</div>' +
    '<div class="stewardship-editor-section">' +
    '<div><div><h3>Income &amp; Expenses</h3><p>Contribution totals are calculated and cannot be overwritten here.' +
    (fs.importedFromAccountingAt
      ? ' Imported from accounting on ' +
        new Date(fs.importedFromAccountingAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }) +
        '.'
      : '') +
    '</p></div></div>' +
    '<div class="sw-fin-derived-grid">' +
    '<div><span>AGAPAY contributions</span><strong>' +
    fmtDollars(contributions.agapayContributionsCents || 0) +
    '</strong></div>' +
    '<div><span>Outside-AGAPAY contributions</span><strong>' +
    fmtDollars(contributions.outsideContributionsCents || 0) +
    '</strong></div>' +
    '</div>' +
    '<div class="stewardship-form-grid">' +
    '<label>Other revenue ($)<input name="otherRevenueDollars" type="number" step="0.01" min="0" value="' +
    fmt100(fs.otherRevenueCents) +
    '" placeholder="0.00" /><small>Bookstore, retreat, rental, grant, and other non-contribution revenue.</small></label>' +
    '<label>Total expenses ($)<input name="totalExpenseDollars" type="number" step="0.01" min="0" value="' +
    fmt100(fs.totalExpenseCents) +
    '" placeholder="0.00" /></label>' +
    '<label style="grid-column:1/-1">Notes<textarea name="notes" rows="3" placeholder="Budget notes, audit status, carryover details\u2026">' +
    escapeHtml(fs.notes || '') +
    '</textarea></label>' +
    '</div>' +
    '</div>' +
    '<div class="stewardship-editor-section">' +
    '<div>' +
    '<h3>Externally Held Assets</h3>' +
    '<p>Only add assets maintained outside AGAPAY. Restricted giving inside AGAPAY is calculated automatically.</p>' +
    '<button class="btn btn-ghost btn-sm" type="button" onclick="addFinancialsAssetRow()">Add asset</button>' +
    '</div>' +
    '<div class="sw-fin-asset-header">' +
    '<span>Type</span><span>Name</span><span>Reported value</span><span>Valuation date</span><span>Note</span><span></span>' +
    '</div>' +
    '<div id="financialsAssetRows">' +
    assetRows +
    '</div>' +
    '</div>' +
    '<div class="btn-row">' +
    '<button class="btn btn-gold" type="submit" id="financialsSaveBtn">Save snapshot</button>' +
    '<button class="btn btn-ghost" type="button" onclick="closeFinancialsEditor()">Cancel</button>' +
    '<span id="financialsSaveStatus" style="font-size:.82rem;color:var(--stone)"></span>' +
    '</div>' +
    '</form>';

  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFinancialsRestrictedAdjustmentRow(fund) {
  const dollars = (c) => (Number(c || 0) ? (Number(c) / 100).toFixed(2) : '');
  return (
    '<div class="sw-fin-restricted-adjustment-row" data-fund-id="' +
    escapeAttr(fund.id || fund.code || fund.name || '') +
    '" data-received-cents="' +
    Number(fund.receivedCents || 0) +
    '">' +
    '<div class="sw-fin-restricted-name"><strong>' +
    escapeHtml(fund.name || 'Restricted fund') +
    '</strong><small>' +
    fmtDollars(fund.agapayReceivedCents || 0) +
    ' AGAPAY · ' +
    fmtDollars(fund.outsideReceivedCents || 0) +
    ' outside</small></div>' +
    '<label><span>Opening</span><input type="number" step="0.01" min="0" data-field="openingBalance" value="' +
    dollars(fund.openingBalanceCents) +
    '" placeholder="0.00" oninput="recalculateRestrictedFundRow(this)" /></label>' +
    '<div class="sw-fin-restricted-derived"><span>Inflows</span><strong>' +
    fmtDollars(fund.receivedCents || 0) +
    '</strong></div>' +
    '<label><span>Deductions</span><input type="number" step="0.01" min="0" data-field="deductions" value="' +
    dollars(fund.deductionsCents) +
    '" placeholder="0.00" oninput="recalculateRestrictedFundRow(this)" /></label>' +
    '<div class="sw-fin-restricted-derived"><span>Ending</span><strong data-field="endingBalance">' +
    fmtDollars(fund.endingBalanceCents || 0) +
    '</strong></div>' +
    '<label><span>Note</span><input type="text" maxlength="1000" data-field="notes" value="' +
    escapeAttr(fund.adjustmentNotes || '') +
    '" placeholder="Optional expense detail" /></label>' +
    '</div>'
  );
}

function recalculateRestrictedFundRow(control) {
  const row = control?.closest('.sw-fin-restricted-adjustment-row');
  if (!row) return;
  const opening = Math.round(parseFloat(row.querySelector('[data-field="openingBalance"]')?.value || '0') * 100);
  const deductions = Math.round(parseFloat(row.querySelector('[data-field="deductions"]')?.value || '0') * 100);
  const ending = opening + Number(row.dataset.receivedCents || 0) - deductions;
  const output = row.querySelector('[data-field="endingBalance"]');
  if (output) {
    output.textContent = fmtDollars(ending);
    output.classList.toggle('sw-fin-deficit', ending < 0);
    output.classList.toggle('sw-fin-surplus', ending >= 0);
  }
}

function renderFinancialsEditorAssetRow(asset) {
  const fmt100 = (c) => (c ? (c / 100).toFixed(2) : '');
  const options = [
    ['investment', 'Investment'],
    ['endowment', 'Endowment'],
    ['real_property', 'Real property'],
    ['external_fund', 'External fund'],
    ['other', 'Other asset'],
  ]
    .map(
      ([value, label]) =>
        '<option value="' +
        value +
        '" ' +
        ((asset.assetType || 'investment') === value ? 'selected' : '') +
        '>' +
        label +
        '</option>'
    )
    .join('');
  return (
    '<div class="stewardship-repeat-row sw-fin-asset-row-edit" data-row-type="external-asset">' +
    '<select data-field="assetType">' +
    options +
    '</select>' +
    '<input type="text" data-field="name" value="' +
    escapeAttr(asset.name || '') +
    '" placeholder="Asset or fund name" />' +
    '<input type="number" step="0.01" min="0" data-field="value" value="' +
    fmt100(asset.valueCents) +
    '" placeholder="0.00" />' +
    '<input type="date" data-field="asOfDate" value="' +
    escapeAttr(asset.asOfDate || '') +
    '" />' +
    '<input type="text" data-field="notes" value="' +
    escapeAttr(asset.notes || '') +
    '" maxlength="1000" placeholder="Optional note" />' +
    '<button class="btn btn-ghost btn-sm" type="button" onclick="removeFinancialsAssetRow(this)">×</button>' +
    '</div>'
  );
}

function addFinancialsAssetRow() {
  const container = document.getElementById('financialsAssetRows');
  if (!container) return;
  const count = container.querySelectorAll('.sw-fin-asset-row-edit').length;
  container.insertAdjacentHTML('beforeend', renderFinancialsEditorAssetRow({}, count));
}

function removeFinancialsAssetRow(btn) {
  const row = btn?.closest('.sw-fin-asset-row-edit');
  const parent = row?.parentElement;
  if (!row || !parent) return;
  if (parent.querySelectorAll('.sw-fin-asset-row-edit').length <= 1) {
    row.querySelectorAll('input').forEach((input) => {
      input.value = '';
    });
    const select = row.querySelector('select');
    if (select) select.value = 'investment';
  } else {
    row.remove();
  }
}

async function saveFinancialsSnapshot(event) {
  event.preventDefault();
  const form = document.getElementById('financialsEditorForm');
  const status = document.getElementById('financialsSaveStatus');
  const btn = document.getElementById('financialsSaveBtn');
  if (!form || !currentParish) return;

  const fd = new FormData(form);
  const otherRevenueCents = Math.round(parseFloat(fd.get('otherRevenueDollars') || '0') * 100);
  const totalExpenseCents = Math.round(parseFloat(fd.get('totalExpenseDollars') || '0') * 100);

  const assetRows = [...form.querySelectorAll('.sw-fin-asset-row-edit')];
  const externalAssets = assetRows
    .map((row) => {
      const get = (f) => row.querySelector('[data-field="' + f + '"]')?.value || '';
      return {
        assetType: get('assetType'),
        name: get('name').trim(),
        valueCents: Math.round(parseFloat(get('value') || '0') * 100),
        asOfDate: get('asOfDate'),
        notes: get('notes').trim(),
      };
    })
    .filter((asset) => asset.name);
  const restrictedFundAdjustments = [...form.querySelectorAll('.sw-fin-restricted-adjustment-row')]
    .map((row) => {
      const get = (f) => row.querySelector('[data-field="' + f + '"]')?.value || '';
      return {
        fundId: row.dataset.fundId || '',
        openingBalanceCents: Math.round(parseFloat(get('openingBalance') || '0') * 100),
        deductionsCents: Math.round(parseFloat(get('deductions') || '0') * 100),
        notes: get('notes').trim(),
      };
    })
    .filter((fund) => fund.fundId);

  const payload = {
    otherRevenueCents,
    totalExpenseCents,
    notes: fd.get('notes') || '',
    fiscalYear: parseInt(fd.get('fiscalYear') || financialsState.year, 10),
    title: fd.get('title') || '',
    externalAssets,
    restrictedFundAdjustments,
  };

  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  if (status) status.textContent = 'Saving\u2026';
  try {
    const res = await fetch(stewardshipApi('/financials'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed');
    if (status) status.textContent = '\u2713 Saved';
    setTimeout(() => {
      if (status) status.textContent = '';
    }, 3000);
    closeFinancialsEditor();
    financialsState.loaded = false;
    loadFinancialSnapshotsPanel();
  } catch (e) {
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

function closeFinancialsEditor() {
  const card = document.getElementById('stewardshipFinancialsEditorCard');
  if (card) card.hidden = true;
}
