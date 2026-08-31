'use strict';

/* global escapeAttr, escapeHtml, moneyFull, reconciliationData */
/* exported renderFundTransferWorksheet, collectFundTransferInstructions, updateFundTransferWorksheet */

// Giving transfers; read shared identity and catalog state only when actions run.

function renderFundTransferWorksheet(worksheet, savedInstructions = []) {
  const pane = document.getElementById('reconcileTransferWorksheetPane');
  const printButton = document.getElementById('reconcileTransferPrintButton');
  if (!pane) return;
  if (printButton) printButton.disabled = !worksheet?.available;

  if (worksheet?.requiresDetail) {
    pane.innerHTML = `<div class="pdx-rc-transfer-empty">
        <div><strong>Prepare the transfer plan when you are ready.</strong><span>AGAPAY will match each paid Stripe payout to its gifts, fees, refunds, and designated funds. This can take a little longer than the monthly summary.</span></div>
        <button class="btn btn-gold" type="button" onclick="loadFundTransferWorksheet(this)">Prepare fund transfers</button>
      </div>`;
    return;
  }
  if (!worksheet?.available || !Array.isArray(worksheet.lines) || !worksheet.lines.length) {
    pane.innerHTML =
      '<div class="pdx-recurring-empty">No matched fund allocations are available for a transfer worksheet.</div>';
    return;
  }

  const savedByKey = new Map(
    (Array.isArray(savedInstructions) ? savedInstructions : []).map((item) => [String(item.key || ''), item])
  );
  const rows = worksheet.lines
    .map((line) => {
      const saved = savedByKey.get(String(line.key || '')) || {};
      const action = line.needsReview ? 'retain' : saved.action || line.recommendedAction || 'retain';
      const transfer = action === 'transfer';
      return `<div class="pdx-rc-transfer-row ${line.needsReview ? 'needs-review' : ''}" data-transfer-row data-key="${escapeAttr(line.key || '')}" data-net-cents="${Number(line.netCents || 0)}">
        <div class="pdx-rc-transfer-fund">
          <span>${escapeHtml(line.category || 'Giving')}</span>
          <strong>${escapeHtml(line.label || 'General Giving')}</strong>
          <small>${Number(line.transactionCount || 0)} transaction${Number(line.transactionCount || 0) === 1 ? '' : 's'} · ${escapeHtml(moneyFull(line.grossCents || 0))} gross · ${escapeHtml(moneyFull(line.feeCents || 0))} fees</small>
        </div>
        <div class="pdx-rc-transfer-net"><span>Net amount</span><strong>${escapeHtml(moneyFull(line.netCents || 0))}</strong></div>
        <label class="pdx-rc-transfer-action">Handling
          <select data-transfer-action onchange="updateFundTransferWorksheet()" ${line.needsReview ? 'disabled' : ''}>
            <option value="retain" ${transfer ? '' : 'selected'}>Record allocation only</option>
            <option value="transfer" ${transfer ? 'selected' : ''}>Transfer manually</option>
          </select>
        </label>
        <label class="pdx-rc-transfer-destination">Destination bank / account nickname
          <input data-transfer-destination maxlength="160" placeholder="Example: Building Fund savings" value="${escapeAttr(saved.destination || '')}" ${transfer ? '' : 'disabled'} />
        </label>
        <label class="pdx-rc-transfer-completed"><input data-transfer-completed type="checkbox" ${saved.completed && transfer ? 'checked' : ''} ${transfer ? '' : 'disabled'} onchange="updateFundTransferWorksheet()" /> Transfer completed</label>
        <label class="pdx-rc-transfer-reference">Bank reference or check number
          <input data-transfer-reference maxlength="160" placeholder="Optional confirmation" value="${escapeAttr(saved.reference || '')}" ${transfer ? '' : 'disabled'} />
        </label>
        ${line.needsReview ? '<div class="pdx-rc-transfer-warning">This fund has a negative net amount. Review refunds or disputes before moving money.</div>' : ''}
      </div>`;
    })
    .join('');
  const unallocated = Number(worksheet.unallocatedCents || 0);
  pane.innerHTML = `<div class="pdx-rc-transfer-summary">
        <div><span>Stripe deposits</span><strong>${escapeHtml(moneyFull(worksheet.depositedCents || 0))}</strong></div>
        <div><span>Planned transfers</span><strong id="reconcileTransferPlanned">${escapeHtml(moneyFull(worksheet.recommendedTransferCents || 0))}</strong></div>
        <div><span>Remain in deposit account</span><strong id="reconcileTransferRetained">${escapeHtml(moneyFull(worksheet.retainInDepositAccountCents || 0))}</strong></div>
      </div>
      ${!worksheet.readyToTransfer ? `<div class="pdx-rc-transfer-hold"><strong>Review required before using these amounts.</strong><span>Unallocated difference: ${escapeHtml(moneyFull(unallocated))}. Unresolved items can offset to zero; check all review items above.</span></div>` : '<div class="pdx-rc-transfer-ready"><strong>Fund totals match the paid Stripe deposits.</strong><span>Allocations do not require separate bank transfers. Record optional handling below.</span></div>'}
      <div class="pdx-rc-transfer-list">${rows}</div>
      <p class="pdx-rc-transfer-disclaimer">Optional treasurer notes, saved with the reconciled review. Period receipts are not current fund balances or a recommendation to transfer the full amount. AGAPAY does not initiate, schedule, or approve transfers between parish bank accounts.</p>`;
  updateFundTransferWorksheet();
}

function updateFundTransferWorksheet() {
  const rows = [...document.querySelectorAll('[data-transfer-row]')];
  let plannedCents = 0;
  rows.forEach((row) => {
    const action = row.querySelector('[data-transfer-action]')?.value || 'retain';
    const transfer = action === 'transfer';
    const netCents = Number(row.dataset.netCents || 0);
    if (transfer && netCents > 0) plannedCents += netCents;
    const destination = row.querySelector('[data-transfer-destination]');
    const completed = row.querySelector('[data-transfer-completed]');
    const reference = row.querySelector('[data-transfer-reference]');
    if (destination) destination.disabled = !transfer;
    if (completed) {
      completed.disabled = !transfer;
      if (!transfer) completed.checked = false;
    }
    if (reference) reference.disabled = !transfer;
    row.classList.toggle('is-transfer', transfer);
  });
  const depositedCents = Number(
    reconciliationData?.transferWorksheet?.depositedCents || reconciliationData?.summary?.depositedCents || 0
  );
  const planned = document.getElementById('reconcileTransferPlanned');
  const retained = document.getElementById('reconcileTransferRetained');
  if (planned) planned.textContent = moneyFull(plannedCents);
  if (retained) retained.textContent = moneyFull(depositedCents - plannedCents);
}

function collectFundTransferInstructions() {
  const rows = [...document.querySelectorAll('[data-transfer-row]')];
  if (!rows.length)
    return Array.isArray(reconciliationData?.closeRecord?.transferInstructions)
      ? reconciliationData.closeRecord.transferInstructions
      : [];
  return rows
    .map((row) => {
      const action = row.querySelector('[data-transfer-action]')?.value === 'transfer' ? 'transfer' : 'retain';
      return {
        key: row.dataset.key || '',
        action,
        destination: action === 'transfer' ? row.querySelector('[data-transfer-destination]')?.value.trim() || '' : '',
        completed: action === 'transfer' && Boolean(row.querySelector('[data-transfer-completed]')?.checked),
        reference: action === 'transfer' ? row.querySelector('[data-transfer-reference]')?.value.trim() || '' : '',
      };
    })
    .filter((item) => item.key);
}
