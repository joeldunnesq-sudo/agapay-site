'use strict';

/* global escapeHtml, currentParish, setStatus, authHeaders, pdxAnimateCount, money,
  renderReconciliationAllocations, renderFundTransferWorksheet, renderReconciliationGiftActivity,
  renderReconciliationPayouts, renderReconciliationExceptions, moneyFull, collectFundTransferInstructions */
/* exported reconciliationDate, loadReconciliation, loadFundTransferWorksheet, saveReconciliationClose */

// Giving reconciliation; read shared identity and catalog state only when actions run.
let reconciliationData = null;

// ── MONTHLY RECONCILIATION ────────────────────────────────
function initReconciliationMonths() {
  const select = document.getElementById('reconcileMonth');
  if (!select || select.options.length) return;
  const now = new Date();
  const options = [];
  for (let offset = 0; offset < 36; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    options.push(`<option value="${value}">${label}</option>`);
  }
  select.innerHTML = options.join('');
}

function reconciliationMonthLabel(month) {
  const [year, monthNumber] = String(month || '')
    .split('-')
    .map(Number);
  if (!year || !monthNumber) return String(month || 'Selected month');
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function reconciliationDate(seconds) {
  if (!seconds) return '—';
  return new Date(Number(seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function setReconciliationLoading(message) {
  const ids = [
    'reconcileAllocationsPane',
    'reconcileTransferWorksheetPane',
    'reconcileGiftActivityPane',
    'reconcilePayoutsPane',
    'reconcileExceptionsPane',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
  });
}

async function loadReconciliation(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  initReconciliationMonths();
  const month = document.getElementById('reconcileMonth')?.value;
  if (!month) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  setReconciliationLoading('Loading reconciliation summary…');
  try {
    const path = `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation?month=${encodeURIComponent(month)}`;
    const response = await fetch(path, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.detail || data.error || `Unable to run reconciliation (${response.status}).`);
    reconciliationData = data;
    renderReconciliation(data);
  } catch (error) {
    reconciliationData = null;
    setReconciliationLoading(error.message);
    const status = document.getElementById('reconcileStatusLine');
    if (status)
      status.innerHTML = `<span class="reconcile-state attention">Needs attention</span><span>${escapeHtml(error.message)}</span>`;
    setStatus(error.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function loadFundTransferWorksheet(btn) {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  const month = document.getElementById('reconcileMonth')?.value;
  if (!month) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  const pane = document.getElementById('reconcileTransferWorksheetPane');
  if (pane) pane.innerHTML = '<div class="history-empty">Matching paid Stripe payouts to fund records…</div>';
  try {
    const path = `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation?month=${encodeURIComponent(month)}&detail=full`;
    const response = await fetch(path, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.detail || data.error || `Unable to prepare fund transfers (${response.status}).`);
    reconciliationData = data;
    renderReconciliation(data);
    document.getElementById('reconcileTransferWorksheetPane')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('Fund transfer worksheet prepared from paid Stripe payouts.', 'success');
  } catch (error) {
    if (pane) pane.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function renderReconciliation(data) {
  if (!data?.available) {
    setReconciliationLoading(data?.reason || 'Connect Stripe before reconciling monthly deposits.');
    return;
  }
  const summary = data.summary || {};
  const close = data.closeRecord || null;
  const deposited = Number(summary.depositedCents || 0);
  const gross = Number(summary.grossActivityCents || 0);
  const fees = Number(summary.totalFeeCents || 0);
  const stripeFees = Number(summary.stripeFeeCents || 0);
  const agapayFees = Number(summary.agapayFeeCents || 0);
  const refunds = Number(summary.refundCents || 0);
  const matchedNet = Number(summary.matchedNetCents || 0);
  const matchedPct = Number(summary.matchedPercent ?? 0);
  const exceptionCount = Number(summary.exceptionCount || 0);
  const paidPayouts = Number(summary.paidPayoutCount || 0);

  // Hero: month title, deposit total with count-up, sub, match block
  const monthTitle = document.getElementById('pdxRcMonthTitle');
  if (monthTitle) monthTitle.textContent = reconciliationMonthLabel(data.period?.month) || 'Selected month';

  const depositedEl = document.getElementById('reconcileDeposited');
  if (depositedEl) pdxAnimateCount(depositedEl, deposited, { money: true });

  const payoutCountEl = document.getElementById('reconcilePayoutCount');
  if (payoutCountEl)
    payoutCountEl.textContent = `Across ${paidPayouts} paid payout${paidPayouts === 1 ? '' : 's'}${gross ? ` · ${money(gross)} gross before fees` : ''}`;

  const matchedPctEl = document.getElementById('reconcileMatchedPercent');
  if (matchedPctEl) matchedPctEl.textContent = `${matchedPct}%`;
  const matchSub = document.getElementById('pdxRcMatchSub');
  if (matchSub) matchSub.textContent = `${money(matchedNet)} traced to gifts${fees ? ` · ${money(fees)} in fees` : ''}`;
  const matchBar = document.getElementById('pdxRcMatchBarFill');
  if (matchBar) {
    matchBar.style.width = '0';
    requestAnimationFrame(() =>
      setTimeout(() => {
        matchBar.style.width = Math.max(0, Math.min(100, matchedPct)) + '%';
      }, 200)
    );
  }
  // Legacy hidden binding
  const matchedLegacy = document.getElementById('reconcileMatched');
  if (matchedLegacy) matchedLegacy.textContent = money(matchedNet);

  // Status pill: closed > ready > open (ready = zero exceptions + not closed)
  const statusPill = document.getElementById('pdxRcStatusPill');
  if (statusPill) {
    const isClosed = close?.status === 'closed';
    const isReady = !isClosed && exceptionCount === 0 && deposited > 0;
    statusPill.className = 'pdx-rc-status-pill ' + (isClosed ? 'closed' : isReady ? 'ready' : 'open');
    statusPill.textContent = isClosed ? 'Month closed' : isReady ? 'Ready to close' : 'Open month';
  }

  // KPIs
  const grossEl = document.getElementById('reconcileGross');
  if (grossEl) pdxAnimateCount(grossEl, gross, { money: true });
  const feesEl = document.getElementById('reconcileFees');
  if (feesEl) pdxAnimateCount(feesEl, fees, { money: true });
  const feeBreak = document.getElementById('reconcileFeeBreakdown');
  if (feeBreak) feeBreak.textContent = `Stripe ${money(stripeFees)} · AGAPAY ${money(agapayFees)}`;
  const refundsEl = document.getElementById('reconcileRefunds');
  if (refundsEl) pdxAnimateCount(refundsEl, refunds, { money: true });
  const excEl = document.getElementById('reconcileExceptions');
  if (excEl) pdxAnimateCount(excEl, exceptionCount);
  const excCard = document.getElementById('pdxRcExceptionsCard');
  if (excCard) excCard.classList.toggle('attention', exceptionCount > 0);

  renderReconciliationAllocations(data.allocations || [], deposited);
  renderFundTransferWorksheet(data.transferWorksheet || {}, close?.transferInstructions || []);
  renderReconciliationGiftActivity(data.giftActivity || {});
  renderReconciliationPayouts(data.payouts || [], data.transactions || []);
  renderReconciliationExceptions(data.exceptions || []);

  const amount = document.getElementById('reconcileBankAmount');
  const notes = document.getElementById('reconcileNotes');
  if (amount)
    amount.value = close
      ? (Number(close.bankStatementCents || 0) / 100).toFixed(2)
      : (Number(summary.depositedCents || 0) / 100).toFixed(2);
  if (notes) notes.value = close?.notes || '';
  updateReconciliationDifference();
}

function updateReconciliationDifference() {
  const el = document.getElementById('reconcileDifference');
  if (!el) return;
  if (!reconciliationData?.available) {
    el.innerHTML = '<span>Difference</span><b>—</b>';
    return;
  }
  const entered = Math.round(Number(document.getElementById('reconcileBankAmount')?.value || 0) * 100);
  const expected = Number(reconciliationData.summary?.depositedCents || 0);
  const difference = entered - expected;
  const balancedClass = difference === 0 ? 'zero' : 'mismatch';
  const label = difference === 0 ? '$0.00 ✓' : moneyFull(difference);
  el.innerHTML = `<span>Difference</span><b class="${balancedClass}">${escapeHtml(label)}</b>`;
}

async function saveReconciliationClose(closed, btn) {
  if (!currentParish || !reconciliationData?.available) {
    setStatus('Run the reconciliation first.', 'error');
    return;
  }
  const bankStatementCents = Math.round(Number(document.getElementById('reconcileBankAmount')?.value || 0) * 100);
  const expectedDepositCents = Number(reconciliationData.summary?.depositedCents || 0);
  const notes = document.getElementById('reconcileNotes')?.value.trim() || '';
  if (closed && bankStatementCents !== expectedDepositCents && !notes) {
    setStatus('Add a treasurer note explaining the bank difference before closing.', 'error');
    document.getElementById('reconcileNotes')?.focus();
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const response = await fetch(
      `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation/close`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: reconciliationData.period?.month,
          bankStatementCents,
          expectedDepositCents,
          notes,
          closed,
          transferInstructions: collectFundTransferInstructions(),
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save the month close.');
    reconciliationData.closeRecord = data.record;
    renderReconciliation(reconciliationData);
    setStatus(closed ? 'Month closed and preserved for the parish record.' : 'Month reopened.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
