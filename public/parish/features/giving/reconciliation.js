'use strict';
/* global currentParish, authHeaders, moneyFull, setStatus, renderReconciliationAllocations,
  renderReconciliationPayouts, renderReconciliationExceptions, renderReconciliationGiftActivity,
  renderFundTransferWorksheet, collectFundTransferInstructions, renderReconciliationReviewHistory */
/* exported reconciliationDate, reconciliationMonthLabel, initReconciliationMonths,
  loadReconciliation, loadFundTransferWorksheet, saveReconciliationClose, updateReconciliationDifference */
let reconciliationData = null;
let reconciliationRequest = 0;
let reconciliationParish = '';
let reconciliationSaving = false;

function initReconciliationMonths() {
  const select = document.getElementById('reconcileMonth');
  if (!select || (select.options.length && reconciliationParish === currentParish?.parishId)) return;
  reconciliationParish = currentParish?.parishId || '';
  let timezone = currentParish?.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    timezone = 'UTC';
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      timeZone: timezone,
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );
  select.innerHTML = Array.from({ length: 36 }, (_, offset) => {
    const date = new Date(Date.UTC(+parts.year, +parts.month - 1 - offset, 1));
    const value = date.toISOString().slice(0, 7);
    return (
      '<option value="' +
      value +
      '"' +
      (offset === 1 ? ' selected' : '') +
      '>' +
      reconciliationMonthLabel(value) +
      (offset === 0 ? ' · in progress' : '') +
      '</option>'
    );
  }).join('');
}
function reconciliationMonthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return 'Selected month';
  return new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function reconciliationDate(seconds, timezone = reconciliationData?.period?.timezone || 'UTC') {
  if (!seconds) return '—';
  return new Date(Number(seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}
function setReconciliationLoading(message, state = 'Preparing report') {
  document.getElementById('pdxRcStatusPill').className = 'fr-state';
  document.getElementById('pdxRcStatusPill').textContent = state;
  document.getElementById('reconcileStatusLine').textContent = message;
  document.getElementById('reconcileResults').hidden = true;
  document.querySelectorAll('[data-reconcile-export]').forEach((button) => {
    button.disabled = true;
  });
}
async function loadReconciliation(btn) {
  if (!currentParish) return;
  initReconciliationMonths();
  const month = document.getElementById('reconcileMonth')?.value;
  const parishId = currentParish.parishId;
  const requestId = ++reconciliationRequest;
  reconciliationData = null;
  setReconciliationLoading('Matching Stripe payouts to giving records and funds…');
  document.getElementById('reconcileWorkspace').setAttribute('aria-busy', 'true');
  if (btn) btn.disabled = true;
  try {
    const response = await fetch(
      '/api/parish/dashboard/' +
        encodeURIComponent(parishId) +
        '/reconciliation?month=' +
        encodeURIComponent(month) +
        '&detail=full',
      { headers: authHeaders() }
    );
    const data = await response.json().catch(() => ({}));
    if (requestId !== reconciliationRequest || currentParish?.parishId !== parishId) return;
    if (!response.ok) throw new Error(data.detail || data.error || 'Unable to prepare this report. Please retry.');
    if (!data.available) throw new Error(data.reason || 'Connect Stripe to prepare your monthly report.');
    if (data.parishId !== parishId || data.period?.month !== month)
      throw new Error('Report context did not match. Please retry.');
    reconciliationData = data;
    renderReconciliation(data);
  } catch (error) {
    if (requestId === reconciliationRequest) setReconciliationLoading(error.message, 'Report unavailable');
  } finally {
    if (requestId === reconciliationRequest)
      document.getElementById('reconcileWorkspace').setAttribute('aria-busy', 'false');
    if (btn) btn.disabled = false;
  }
}
// Compatibility for older links: full detail now loads automatically.
function loadFundTransferWorksheet(btn) {
  return loadReconciliation(btn);
}
function renderReconciliation(data) {
  const summary = data.summary || {};
  const close = data.closeRecord;
  const currentReview = data.state === 'reconciled' && close?.bankConfirmed;
  document.getElementById('reconcileResults').hidden = false;
  document.getElementById('reconcileStatusLine').textContent =
    data.period.label +
    ' · ' +
    (data.period.timezone || 'UTC') +
    ' · USD · Payouts: Stripe expected arrival date · Prepared ' +
    new Date(data.generatedAt).toLocaleString();
  document.getElementById('reconcileDeposited').textContent = moneyFull(summary.depositedCents || 0);
  document.getElementById('reconcileMatched').textContent = moneyFull(summary.matchedNetCents || 0);
  document.getElementById('reconcileUnallocated').textContent = moneyFull(
    (summary.depositedCents || 0) - (summary.matchedNetCents || 0)
  );
  document.getElementById('reconcilePayoutCount').textContent =
    (summary.paidPayoutCount || 0) + ' paid payout(s) · Stripe-reported';
  document.getElementById('reconcileReviewCount').textContent = summary.unmatchedCount
    ? summary.unmatchedCount +
      ' unmatched item(s) · ' +
      moneyFull(summary.unmatchedAbsoluteCents || 0) +
      ' absolute activity'
    : data.complete
      ? 'All payout items classified'
      : 'Matching is not complete';
  const state = document.getElementById('pdxRcStatusPill');
  state.className = 'fr-state' + (currentReview ? ' is-verified' : '');
  state.textContent = currentReview
    ? 'Reconciled'
    : data.state === 'revised'
      ? 'Changed since last review'
      : summary.readyForReview
        ? 'Awaiting bank check'
        : data.period.inProgress
          ? 'Month in progress'
          : 'Needs review';
  renderReconciliationAllocations(data.allocations || [], summary.depositedCents || 0);
  renderReconciliationPayouts(data.payouts || [], data.transactions || []);
  renderReconciliationExceptions(data.exceptions || []);
  renderReconciliationGiftActivity(data.giftActivity || {});
  renderFundTransferWorksheet(data.transferWorksheet || {}, close?.transferInstructions || []);
  renderReconciliationReviewHistory(data.reviewHistory || []);
  const locked = close?.status === 'closed';
  document.getElementById('reconcileBankAmount').disabled = locked;
  document.getElementById('reconcileBankConfirmed').disabled = locked;
  document.querySelectorAll('[data-transfer-row] input, [data-transfer-row] select').forEach((input) => {
    if (locked) input.disabled = true;
  });
  document.getElementById('reconcileBankAmount').value = currentReview
    ? (close.bankStatementCents / 100).toFixed(2)
    : '';
  document.getElementById('reconcileBankConfirmed').checked = Boolean(currentReview);
  document.getElementById('reconcileNotes').value = close?.notes || '';
  document.getElementById('reconcileReopenButton').hidden = close?.status !== 'closed';
  document.getElementById('reconcileReviewNotice').textContent =
    data.state === 'revised'
      ? 'Source data changed after the saved review. Reopen and review this version; the prior record is preserved.'
      : !data.complete
        ? 'Draft report. Resolve unmatched or incomplete payout items before finalizing.'
        : data.period.inProgress
          ? 'This month is still in progress. You can inspect and export a draft.'
          : summary.inTransitCents
            ? 'A payout is still in transit. Wait for its final status before completing the month.'
            : 'Fund allocation does not move money. These are period receipts, not current fund balances.';
  document.querySelectorAll('[data-reconcile-export]').forEach((button) => {
    button.disabled = false;
  });
  updateReconciliationDifference();
}
function updateReconciliationDifference() {
  const data = reconciliationData;
  const value = document.getElementById('reconcileBankAmount')?.value || '';
  const amount = Math.round(Number(value) * 100);
  const valid = value !== '' && /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isSafeInteger(amount) && amount >= 0;
  const confirmed = document.getElementById('reconcileBankConfirmed')?.checked;
  const difference = valid ? amount - Number(data?.summary?.depositedCents || 0) : null;
  const output = document.getElementById('reconcileDifference');
  output.textContent = !valid
    ? 'Not checked against your bank yet.'
    : 'Difference: ' +
      moneyFull(difference) +
      (difference
        ? ' · check amounts and posting dates'
        : confirmed
          ? ' · bank total confirmed'
          : ' · confirm you checked the statement');
  output.className = 'fr-bank-difference' + (valid && !difference && confirmed ? ' is-verified' : '');
  document.getElementById('reconcileSaveButton').disabled =
    reconciliationSaving ||
    !data?.summary?.readyForReview ||
    !data?.complete ||
    !valid ||
    difference !== 0 ||
    !confirmed ||
    data.closeRecord?.status === 'closed';
}
async function saveReconciliationClose(closed, btn) {
  const data = reconciliationData;
  if (reconciliationSaving || !data || (closed && document.getElementById('reconcileSaveButton').disabled)) return;
  const notes = document.getElementById('reconcileNotes').value.trim();
  if (!closed && !notes) {
    setStatus('Add a reason for reopening this review.', 'error');
    return;
  }
  const parishId = currentParish.parishId;
  reconciliationSaving = true;
  if (btn) btn.disabled = true;
  updateReconciliationDifference();
  try {
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/reconciliation/close', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: data.period.month,
        closed,
        notes,
        bankStatementCents: Math.round(Number(document.getElementById('reconcileBankAmount').value) * 100),
        bankConfirmed: document.getElementById('reconcileBankConfirmed').checked,
        fingerprint: data.fingerprint,
        expectedReviewVersion: data.closeRecord?.reviewId || data.closeRecord?.updatedAt || null,
        transferInstructions: collectFundTransferInstructions(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save this review.');
    if (reconciliationData !== data || currentParish?.parishId !== parishId) return;
    data.closeRecord = result.record;
    data.reviewHistory = [result.record, ...(data.reviewHistory || [])].slice(0, 25);
    data.state = closed ? 'reconciled' : 'ready_for_bank_check';
    renderReconciliation(data);
    setStatus(
      closed ? 'Bank check and report revision saved.' : 'Review reopened. Prior versions are preserved.',
      'success'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    reconciliationSaving = false;
    if (btn && !closed) btn.disabled = false;
    updateReconciliationDifference();
  }
}
