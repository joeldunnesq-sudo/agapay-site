'use strict';

/* global financialsState, currentParish, isParishTier, renderGivingMetricsUpgrade, givingMetricsState,
  stewardshipApi, authHeaders, escapeHtml, escapeAttr, loadGivingMetricsPanel,
  loadStewardshipHealthScorePanel, loadFinancialSnapshotsPanel, outsideRequest,
  resetOutsideParish, outsideGivingState, outsideGiftAction */
/* exported openOutsideAgapayGiving, closeOutsideAgapayGiving, submitManualIncomeEntry,
  deleteManualIncomeEntry, ensureOutsideGivingCard, reviewCollectionAccounting */

// Outside-AGAPAY contribution entry, deletion, and dependent panel refreshes.
// Read shared parish identity and authentication only when actions run.

// ── Outside-AGAPAY contribution intake ──────────────────────────────────
// This is intentionally limited to contributions. Bookstore, retreat,
// rental, grant, and other operating revenue belongs in the financial
// snapshot (and eventually Accounting), never in stewardship-giving health.
const manualIncomeSourceLabels = {
  cash_and_checks: 'Cash/Check Collection',
  tithely: 'Tithe.ly',
  paypal: 'PayPal',
  other_giving_platform: 'Another Giving Platform',
};

let manualIncomeYear = null;
let manualIncomeLoad = 0;

function ensureOutsideGivingCard() {
  const mount = document.getElementById('stewardshipOutsideGivingMount');
  if (!mount || mount.children.length) return;
  mount.innerHTML = `<section class="sw-suite-tool-card sw-outside-card" aria-labelledby="swOutsideTitle">
    <span class="sw-attendance-eyebrow">Cash, checks &amp; other platforms</span><h2 id="swOutsideTitle" class="sw-tool-card-title">Record giving received elsewhere</h2>
    <p class="sw-tool-card-desc">Bring gifts received outside AGAPAY into your parish’s giving records. Choose the kind of entry you need.</p>
    <div class="sw-outside-choices"><article><h3>A donor’s gift</h3><p>Record a gift for a person or household, with its fund and optional pledge. Identified gifts can appear on annual giving statements.</p><button type="button" class="sw-report-generate-btn" onclick="openOutsideGift()">Record a donor’s gift</button></article>
    <article><h3>A collection or batch total</h3><p>Record an offering basket or a combined platform total for stewardship reports. Batch totals do not create individual donor statements.</p><button class="sw-action-btn" type="button" onclick="openOutsideAgapayGiving()">Record a collection total</button></article></div>
    <p class="sw-chart-note">Record each gift once: use individual gifts or a batch total for the same collection. Sales, rentals, and other operating revenue belong in Accounting.</p>
    <div class="sw-outside-giving-panel" id="stewardshipManualIncomePane" hidden></div></section>`;
}

function openOutsideAgapayGiving() {
  ensureOutsideGivingCard();
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (!pane) return;
  pane.hidden = false;
  loadManualIncomePanel(manualIncomeYear || financialsState.year).then(() => {
    pane.querySelector('[name="amountCents"]')?.focus({ preventScroll: true });
  });
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeOutsideAgapayGiving() {
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (pane) pane.hidden = true;
}

async function loadManualIncomePanel(year, message = '') {
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (!pane || !currentParish) return;
  if (!isParishTier()) {
    pane.innerHTML = renderGivingMetricsUpgrade();
    return;
  }
  const y = Number(year || manualIncomeYear || financialsState.year || givingMetricsState.year);
  manualIncomeYear = y;
  const request = ++manualIncomeLoad;
  const parishId = currentParish.parishId;
  if (!pane.querySelector('.sw-income-form')) pane.innerHTML = '<p class="sw-tool-loading">Loading contributions…</p>';
  try {
    const res = await fetch(stewardshipApi('/income/manual?year=' + y), { headers: authHeaders() });
    const data = await res.json();
    if (request !== manualIncomeLoad || currentParish?.parishId !== parishId) return;
    if (!res.ok || data.error) throw new Error(data.error || 'Could not load contributions.');
    pane.innerHTML = renderManualIncome(data, y, message);
  } catch {
    if (request !== manualIncomeLoad || currentParish?.parishId !== parishId) return;
    const status = pane.querySelector('.sw-income-form-status');
    if (status)
      status.textContent =
        (message ? message + ' ' : '') + 'The list could not refresh. Close and reopen to try again.';
    else
      pane.innerHTML =
        '<p role="status">Contributions could not be loaded.</p><button type="button" class="sw-action-btn" onclick="loadManualIncomePanel()">Try again</button>';
  }
}

function renderManualIncome(d, year, message = '') {
  const fmt = (c) => (Number(c || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const entries = d.entries || [];
  const funds = (currentParish.funds || []).filter((fund) => fund.enabled !== false && fund.active !== false);
  const fundOptions = funds
    .map(
      (fund) =>
        `<option value="${escapeAttr(fund.id || fund.code)}">${escapeHtml(fund.name || fund.id || fund.code)}</option>`
    )
    .join('');
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: currentParish.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const date = String(year) === today.slice(0, 4) ? today : `${year}-01-01`;
  const rows = entries
    .map(
      (e) =>
        `<tr class="sw-income-row"><td>${escapeHtml(e.entryDate)}</td><td>${escapeHtml(e.sourceLabel || manualIncomeSourceLabels[e.source] || '')}</td><td>${escapeHtml(e.fundCode || '')}</td><td class="sw-td-right">${fmt(e.amountCents)}</td><td class="sw-income-notes">${escapeHtml([e.batchReference, e.notes].filter(Boolean).join(' · '))}</td><td>${e.id.startsWith('outside_') ? `<button type="button" class="sw-action-btn" onclick="reviewCollectionAccounting('${escapeAttr(e.id)}')">Review / link Accounting</button><span>Corrections in Givers</span>` : `<button type="button" class="sw-income-delete-btn" onclick="deleteManualIncomeEntry('${escapeAttr(e.id)}')" title="Delete entry" aria-label="Delete entry for ${escapeAttr(e.entryDate)}">&times;</button>`}</td></tr>`
    )
    .join('');
  const total = entries.reduce((sum, e) => sum + Number(e.amountCents || 0), 0);
  return `<div class="sw-outside-giving-head"><div><strong>Record a collection or batch</strong><p>Enter the total received for one date and fund. Keep different funds as separate entries.</p></div><button type="button" class="btn btn-ghost btn-sm" onclick="closeOutsideAgapayGiving()">Close</button></div>
    <form class="sw-income-form" onsubmit="submitManualIncomeEntry(event)">
      <div class="sw-income-form-row">
        <label>Amount received ($)<input type="number" name="amountCents" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required /></label>
        <label>Date received<input type="date" name="entryDate" value="${date}" max="${today}" required /></label>
        <label>Received through<select name="source" required onchange="this.form.querySelector('.sw-income-source-label-field').hidden = this.value !== 'other_giving_platform'; this.form.elements.sourceLabel.required = this.value === 'other_giving_platform'">${Object.entries(
          manualIncomeSourceLabels
        )
          .map(([key, label]) => `<option value="${key}">${label}</option>`)
          .join('')}</select></label>
        <label>Fund / designation<select name="fundId" required><option value="">Choose a fund from Funds &amp; Alms</option>${fundOptions}</select></label>
        <label class="sw-income-source-label-field" hidden>Platform name<input type="text" name="sourceLabel" placeholder="e.g. Venmo" maxlength="60" /></label>
      </div>
      <details class="sw-income-details"><summary>Add a deposit reference or note (optional)</summary><div class="sw-income-form-row"><label>Deposit or batch reference<input type="text" name="batchReference" placeholder="e.g. Deposit 1042" maxlength="120" /></label><label>Note<input type="text" name="notes" placeholder="e.g. Sunday collection" maxlength="200" /></label></div></details>
      <p class="sw-chart-note">Funds are shared with Funds &amp; Alms and Accounting. ${funds.length ? 'Choose the fund this collection belongs to.' : 'Add an active fund in Funds &amp; Alms before recording a collection.'}</p>
      <label class="sw-income-confirm"><input type="checkbox" name="confirmedNotDuplicate" required />This collection is not already recorded as individual gifts or another batch.</label>
      <label class="sw-income-duplicate" hidden>Why is this a separate collection?<input name="duplicateReason" maxlength="500" placeholder="Explain why this collection has identical details" /></label>
      <button type="submit" class="sw-report-generate-btn sw-income-submit-btn" ${funds.length ? '' : 'disabled'}>Record contribution</button>
      <div class="sw-income-form-status ${message ? 'sw-income-form-status--ok' : ''}" role="status" aria-live="polite">${escapeHtml(message)}</div>
    </form>
    <div class="sw-outside-history-head"><div><h3>Recorded outside giving</h3><p>${fmt(total)} across ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} in ${year}</p></div><label>View year<input aria-label="Outside giving year" type="number" min="2000" max="${now.getFullYear()}" value="${year}" onchange="if(this.reportValidity()) loadManualIncomePanel(+this.value)"></label></div>
    <div class="sw-fin-table-wrap"><table class="sw-fin-table sw-income-table"><thead><tr><th>Date</th><th>Source</th><th>Fund</th><th class="sw-th-right">Amount</th><th>Reference / note</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">No contributions recorded for this year. Add your first collection above.</td></tr>'}</tbody></table></div>
    <p class="sw-chart-note">These entries update Budget Pace, Stewardship Health, and stewardship reports. Record the deposit once in Accounting, then use Review / link Accounting to match the contribution to the same fund. Unlinked collections are not posted ledger income. Older collection entries can be reviewed in Accounting separately.</p>`;
}

async function submitManualIncomeEntry(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.saving === 'true') return;
  if (!form.reportValidity()) return;
  const status = form.querySelector('.sw-income-form-status');
  const submitBtn = form.querySelector('.sw-income-submit-btn');
  const fd = new FormData(form);
  const parishId = currentParish.parishId;
  const amountDollars = parseFloat(fd.get('amountCents'));
  const payload = {
    entryDate: fd.get('entryDate'),
    source: fd.get('source'),
    sourceLabel: fd.get('sourceLabel') || '',
    amountCents: Math.round((amountDollars || 0) * 100),
    fundId: fd.get('fundId') || '',
    batchReference: fd.get('batchReference') || '',
    notes: fd.get('notes') || '',
  };
  const inputKey = JSON.stringify(payload);
  if (form.dataset.inputKey !== inputKey) {
    form.dataset.requestKey = crypto.randomUUID();
    form.dataset.inputKey = inputKey;
  }
  form.dataset.saving = 'true';
  if (status) {
    status.textContent = 'Saving…';
    status.className = 'sw-income-form-status';
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    await outsideRequest('', {
      ...payload,
      source: payload.source === 'cash_and_checks' ? 'cash' : payload.source,
      reference: payload.batchReference,
      givingKind: 'other',
      giverReferenceId: '',
      confirmedNotDuplicate: fd.get('confirmedNotDuplicate') === 'on',
      duplicateReason: fd.get('duplicateReason') || '',
      requestKey: form.dataset.requestKey,
    });
    if (currentParish?.parishId !== parishId) return;
    if (status) {
      status.textContent = 'Saved.';
      status.className = 'sw-income-form-status sw-income-form-status--ok';
    }
    form.reset();
    form.elements.sourceLabel.required = false;
    const platformField = form.querySelector('.sw-income-source-label-field');
    if (platformField) platformField.hidden = true;
    await loadManualIncomePanel(
      Number(payload.entryDate.slice(0, 4)),
      'Contribution recorded. You can add another collection.'
    );
    if (currentParish?.parishId !== parishId) return;
    const nextForm = document.querySelector('#stewardshipManualIncomePane .sw-income-form');
    if (nextForm) {
      for (const key of ['entryDate', 'source', 'sourceLabel', 'fundId']) nextForm.elements[key].value = payload[key];
      nextForm.querySelector('.sw-income-source-label-field').hidden = payload.source !== 'other_giving_platform';
      nextForm.elements.sourceLabel.required = payload.source === 'other_giving_platform';
      nextForm.elements.amountCents.focus({ preventScroll: true });
    }
    // Qualified outside contributions affect Budget Pace, Stewardship Health,
    // and the derived contribution total in the fiscal-year snapshot.
    loadGivingMetricsPanel();
    loadStewardshipHealthScorePanel();
    loadFinancialSnapshotsPanel();
  } catch (e) {
    if (e.code === 'outside_gift_duplicate') form.querySelector('.sw-income-duplicate').hidden = false;
    if (status) {
      status.textContent = e.message;
      status.className = 'sw-income-form-status sw-income-form-status--error';
    }
  } finally {
    delete form.dataset.saving;
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function reviewCollectionAccounting(id) {
  const parishId = currentParish?.parishId;
  const status = document.querySelector('.sw-income-form-status');
  try {
    resetOutsideParish();
    const data = await outsideRequest('/' + encodeURIComponent(id));
    if (currentParish?.parishId !== parishId) return;
    outsideGivingState.rows = outsideGivingState.rows.filter((gift) => gift.id !== id).concat(data.gift);
    await outsideGiftAction(id, 'accounting');
  } catch (error) {
    if (currentParish?.parishId === parishId && status) status.textContent = error.message;
  }
}

async function deleteManualIncomeEntry(entryId) {
  if (!confirm('Delete this outside-AGAPAY contribution? This cannot be undone.')) return;
  try {
    const res = await fetch(stewardshipApi('/income/manual/' + encodeURIComponent(entryId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Delete failed.');
    loadManualIncomePanel();
    loadGivingMetricsPanel();
    loadStewardshipHealthScorePanel();
    loadFinancialSnapshotsPanel();
  } catch (e) {
    alert('Could not delete contribution: ' + e.message);
  }
}

document.addEventListener('agapay:outside-gift-saved', () => {
  if (!isParishTier()) return;
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (pane && !pane.hidden) loadManualIncomePanel();
  loadGivingMetricsPanel();
  loadStewardshipHealthScorePanel();
  loadFinancialSnapshotsPanel();
});
