'use strict';

/* global financialsState, currentParish, isParishTier, renderGivingMetricsUpgrade, givingMetricsState,
  stewardshipApi, authHeaders, escapeHtml, escapeAttr, loadGivingMetricsPanel,
  loadStewardshipHealthScorePanel, loadFinancialSnapshotsPanel */
/* exported openOutsideAgapayGiving, closeOutsideAgapayGiving, submitManualIncomeEntry,
  deleteManualIncomeEntry */

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

function openOutsideAgapayGiving() {
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (!pane) return;
  pane.hidden = false;
  loadManualIncomePanel(financialsState.year);
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeOutsideAgapayGiving() {
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (pane) pane.hidden = true;
}

async function loadManualIncomePanel(year) {
  const pane = document.getElementById('stewardshipManualIncomePane');
  if (!pane || !currentParish) return;
  if (!isParishTier()) {
    pane.innerHTML = renderGivingMetricsUpgrade();
    return;
  }

  const y = year || financialsState.year || givingMetricsState.year;
  if (!pane.querySelector('.sw-income-form')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
  try {
    const res = await fetch(stewardshipApi('/income/manual?year=' + y), { headers: authHeaders() });
    const data = await res.json();
    if (data.error && data.error.includes('not activated')) {
      pane.innerHTML = renderGivingMetricsUpgrade();
      return;
    }
    pane.innerHTML = renderManualIncome(data);
  } catch {
    pane.innerHTML = '<p class="muted">Outside-AGAPAY giving data unavailable.</p>';
  }
}

function renderManualIncome(d) {
  const fmt = (c) =>
    '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const entries = d.entries || [];
  const today = new Date().toISOString().slice(0, 10);

  const rows = entries.length
    ? entries
        .map(
          (e) =>
            '<tr class="sw-income-row">' +
            '<td>' +
            escapeHtml(e.entryDate) +
            '</td>' +
            '<td>' +
            escapeHtml(e.sourceLabel) +
            '</td>' +
            '<td>' +
            escapeHtml(e.fundCode || '') +
            '</td>' +
            '<td class="sw-td-right">' +
            fmt(e.amountCents) +
            '</td>' +
            '<td class="sw-income-notes">' +
            escapeHtml([e.batchReference, e.notes].filter(Boolean).join(' · ')) +
            '</td>' +
            (e.id.startsWith('outside_')
              ? '<td>Manage in Givers</td>'
              : '<td><button type="button" class="sw-income-delete-btn" onclick="deleteManualIncomeEntry(\'' +
                escapeAttr(e.id) +
                '\')" title="Delete entry">&times;</button></td>') +
            '</tr>'
        )
        .join('')
    : '<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem;">No outside-AGAPAY contributions recorded for this year.</td></tr>';

  const bySourceHtml = Object.keys(d.by_source_cents || {}).length
    ? '<div class="sw-income-by-source">' +
      Object.entries(d.by_source_cents)
        .map(
          ([src, cents]) =>
            '<span><strong>' + fmt(cents) + '</strong> ' + escapeHtml(manualIncomeSourceLabels[src] || src) + '</span>'
        )
        .join('') +
      '</div>'
    : '';

  return (
    '<div class="sw-outside-giving-head">' +
    '<div><strong>Record outside-AGAPAY giving</strong><p>Only contributions belong here. Operating revenue is entered in the financial snapshot.</p></div>' +
    '<button type="button" class="btn btn-ghost btn-sm" onclick="closeOutsideAgapayGiving()">Close</button>' +
    '</div>' +
    '<form class="sw-income-form" onsubmit="submitManualIncomeEntry(event)">' +
    '<div class="sw-income-form-row">' +
    '<label>Date<input type="date" name="entryDate" value="' +
    today +
    '" max="' +
    today +
    '" required /></label>' +
    "<label>Contribution source<select name=\"source\" required onchange=\"this.closest('.sw-income-form-row').querySelector('.sw-income-source-label-field').hidden = (this.value !== 'other_giving_platform')\">" +
    '<option value="cash_and_checks">Cash/Check Collection</option>' +
    '<option value="tithely">Tithe.ly</option>' +
    '<option value="paypal">PayPal</option>' +
    '<option value="other_giving_platform">Another Giving Platform</option>' +
    '</select></label>' +
    '<label class="sw-income-source-label-field" hidden>Platform name<input type="text" name="sourceLabel" placeholder="e.g. Venmo" maxlength="60" /></label>' +
    '<label>Amount<input type="number" name="amountCents" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required /></label>' +
    '<label>Fund/designation<input type="text" name="fundCode" placeholder="e.g. General Fund" maxlength="60" required /></label>' +
    '<label>Deposit or batch reference<input type="text" name="batchReference" placeholder="Optional reference" maxlength="120" /></label>' +
    '<label class="sw-income-notes-field">Optional note<input type="text" name="notes" placeholder="e.g. Sunday collection" maxlength="200" /></label>' +
    '<button type="submit" class="sw-action-btn sw-income-submit-btn">Record contribution</button>' +
    '</div>' +
    '<div class="sw-income-form-status" aria-live="polite"></div>' +
    '</form>' +
    (bySourceHtml || '') +
    '<div class="sw-fin-table-wrap" style="margin-top:.75rem;">' +
    '<table class="sw-fin-table sw-income-table">' +
    '<thead><tr><th>Date</th><th>Source</th><th>Fund</th><th class="sw-th-right">Amount</th><th>Reference / note</th><th></th></tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody>' +
    '</table>' +
    '</div>' +
    '<p class="muted" style="font-size:.72rem;margin:.6rem 0 0;">These contribution entries flow into Budget Pace, Stewardship Health, the monthly report, and the authoritative financial snapshot.</p>'
  );
}

async function submitManualIncomeEntry(event) {
  event.preventDefault();
  const form = event.target;
  const status = form.querySelector('.sw-income-form-status');
  const submitBtn = form.querySelector('.sw-income-submit-btn');
  const fd = new FormData(form);
  const amountDollars = parseFloat(fd.get('amountCents'));
  const payload = {
    entryDate: fd.get('entryDate'),
    source: fd.get('source'),
    sourceLabel: fd.get('sourceLabel') || '',
    amountCents: Math.round((amountDollars || 0) * 100),
    fundCode: fd.get('fundCode') || '',
    batchReference: fd.get('batchReference') || '',
    notes: fd.get('notes') || '',
  };
  if (status) {
    status.textContent = 'Saving…';
    status.className = 'sw-income-form-status';
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await fetch(stewardshipApi('/income/manual'), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not save entry.');
    if (status) {
      status.textContent = 'Saved.';
      status.className = 'sw-income-form-status sw-income-form-status--ok';
    }
    form.reset();
    const platformField = form.querySelector('.sw-income-source-label-field');
    if (platformField) platformField.hidden = true;
    loadManualIncomePanel();
    // Qualified outside contributions affect Budget Pace, Stewardship Health,
    // and the derived contribution total in the fiscal-year snapshot.
    loadGivingMetricsPanel();
    loadStewardshipHealthScorePanel();
    loadFinancialSnapshotsPanel();
  } catch (e) {
    if (status) {
      status.textContent = e.message;
      status.className = 'sw-income-form-status sw-income-form-status--error';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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
