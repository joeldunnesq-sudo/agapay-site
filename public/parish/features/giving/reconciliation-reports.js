'use strict';

/* global reconciliationData, escapeHtml, statusLabel, reconciliationDate, moneyFull, setStatus,
  collectFundTransferInstructions, currentParish, downloadBlob, reconciliationMonthLabel, fundReportColor */
/* exported renderReconciliationAllocations, setReconcileAllocView, renderReconciliationGiftActivity, renderReconciliationPayouts,
  renderReconciliationExceptions, exportReconciliationCsv, printFundTransferWorksheet,
  printReconciliationReport, exportFundReconciliation, renderReconciliationReviewHistory */

// Giving reconciliation-reports; read shared identity and catalog state only when actions run.

function renderReconciliationAllocations(allocations) {
  const pane = document.getElementById('reconcileAllocationsPane');
  if (!pane) return;
  if (!allocations.length) {
    pane.innerHTML =
      '<p class="fr-source">No verified fund allocations in this period. Check payout details and review items below.</p>';
    return;
  }
  pane.innerHTML = allocations
    .map((item) => {
      const transactions = (reconciliationData?.transactions || []).filter((row) => row.allocationKey === item.key);
      const detail = transactions
        .map(
          (row) =>
            '<tr><td>' +
            escapeHtml(reconciliationDate(row.created)) +
            '</td><td>' +
            escapeHtml(row.donorName || row.reportingCategory || 'Stripe activity') +
            '</td><td class="fr-number">' +
            moneyFull(row.grossCents) +
            '</td><td class="fr-number">' +
            moneyFull(row.feeCents) +
            '</td><td class="fr-number">' +
            moneyFull(row.netCents) +
            '</td></tr>'
        )
        .join('');
      return (
        '<details class="fr-fund" style="--fund-color:' +
        fundReportColor(item.key) +
        '"><summary><span class="fr-fund-name"><i class="fr-dot" aria-hidden="true"></i>' +
        escapeHtml(item.label) +
        '</span><span class="fr-fund-total">' +
        moneyFull(item.netCents) +
        '</span></summary>' +
        '<div class="fr-fund-detail">' +
        (item.catalogSource === 'historical_gift'
          ? '<p class="fr-source">Saved gift designation; not in the current Funds &amp; Alms catalog.</p>'
          : '') +
        '<div class="fr-breakdown"><div><span>Amounts charged</span><strong>' +
        moneyFull(item.chargedCents ?? item.grossCents) +
        '</strong></div><div><span>Actual fees</span><strong>' +
        moneyFull(item.feeCents) +
        '</strong></div><div><span>Refunds / negative adjustments</span><strong>' +
        moneyFull(item.refundsCents || 0) +
        '</strong></div></div><div class="fr-table-wrap"><table class="fr-table"><caption class="fr-source">' +
        Number(item.transactionCount || 0) +
        ' transaction(s) in these payouts · amounts charged include any donor-covered fees</caption>' +
        '<thead><tr><th>Activity date</th><th>Giver / activity</th><th class="fr-number">Gross</th><th class="fr-number">Fees</th><th class="fr-number">Net</th></tr></thead><tbody>' +
        detail +
        '</tbody></table></div></div></details>'
      );
    })
    .join('');
}

// Kept for older saved dashboard links; the accessible fund list is now primary.
function setReconcileAllocView() {
  renderReconciliationAllocations(reconciliationData?.allocations || []);
}

function renderReconciliationGiftActivity(activity) {
  const pane = document.getElementById('reconcileGiftActivityPane');
  if (!pane) return;
  if (!activity.available || !activity.complete) {
    pane.innerHTML =
      '<p class="fr-source">' + escapeHtml(activity.reason || 'Giving-date totals are unavailable.') + '</p>';
    return;
  }
  const items = [
    { label: 'Gifts made', value: activity.giftCount || 0, isMoney: false },
    { label: 'Gross gifts', value: activity.grossGiftCents || 0, isMoney: true },
    { label: 'Parish net', value: activity.parishNetCents || 0, isMoney: true },
    { label: 'Gift fees', value: activity.feeCents || 0, isMoney: true },
  ];
  pane.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:14px; margin-bottom:10px;">
        ${items
          .map(
            (it) => `
          <div style="padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--paper);">
            <div style="font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--stone); font-weight:600; margin-bottom:4px;">${it.label}</div>
            <div style="font-family:var(--serif); font-size:22px; font-weight:600; color:var(--ink);">${escapeHtml(it.isMoney ? moneyFull(it.value) : String(it.value))}</div>
          </div>
        `
          )
          .join('')}
      </div>
      <p class="fr-source">By gift paid date. Net is before refunds and disputes; ${activity.estimatedFeeCount ? 'includes estimated fees' : 'uses recorded fees'}. Gift totals can differ from payouts and are not current fund balances.</p>`;
}

function renderReconciliationPayouts(payouts, transactions) {
  const pane = document.getElementById('reconcilePayoutsPane');
  if (!pane) return;
  if (!payouts.length) {
    pane.innerHTML =
      '<div class="pdx-recurring-empty">No Stripe payouts have an expected arrival date in this month.</div>';
    return;
  }
  pane.innerHTML = `<div class="pdx-rc-payout-list">${payouts
    .map((payout) => {
      const rows = transactions.filter((row) => row.payoutId === payout.id);
      const arrival = payout.arrivalDate ? new Date(Number(payout.arrivalDate) * 1000) : null;
      const day = arrival ? String(arrival.getUTCDate()).padStart(2, '0') : '—';
      const mon = arrival ? arrival.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : '';
      const diff = Math.abs(Number(payout.differenceCents || 0));
      const unmatched = rows.filter((r) => !r.matched).length;
      const chipClass =
        payout.matchingComplete !== true || unmatched > 0 || diff > 100
          ? 'attention'
          : diff > 0
            ? 'partial'
            : 'matched';
      const chipLabel =
        payout.matchingComplete !== true
          ? 'Not verified'
          : unmatched > 0
            ? `${unmatched} to review`
            : diff > 0
              ? 'Composition delta'
              : 'Items matched';
      const payoutIdShort =
        String(payout.id || 'Stripe payout').slice(0, 16) + (String(payout.id || '').length > 16 ? '...' : '');
      return `<details class="pdx-rc-payout">
        <summary class="pdx-rc-payout-summary">
          <div class="pdx-rc-payout-date-badge"><b>${day}</b><span>${mon}</span></div>
          <div class="pdx-rc-payout-copy">
            <strong>${escapeHtml(payoutIdShort)}</strong>
            <small>${payout.transactionCount || 0} Stripe transaction${payout.transactionCount === 1 ? '' : 's'}${payout.status && payout.status !== 'paid' ? ` · ${escapeHtml(statusLabel(payout.status))}` : ''}</small>
          </div>
          <div class="pdx-rc-payout-amount">${escapeHtml(moneyFull(payout.amountCents || 0))}</div>
          <span class="pdx-rc-payout-status-chip ${chipClass}">${escapeHtml(chipLabel)}</span>
        </summary>
        <div class="pdx-rc-payout-body">
          <div class="pdx-rc-payout-body-line"><span>Matched to gifts</span><b>${escapeHtml(moneyFull(payout.matchedNetCents || 0))}</b></div>
          <div class="pdx-rc-payout-body-line"><span>Composition difference</span><b>${escapeHtml(payout.matchingComplete ? moneyFull(payout.differenceCents || 0) : 'Not verified')}</b></div>
          <div class="pdx-rc-payout-body-line"><span>Reference gifts</span><b>${payout.transactionCount || 0} listed · ${rows.filter((r) => r.matched).length} matched</b></div>
          ${
            rows.length
              ? `<table><thead><tr><th>Date</th><th>Post to</th><th>Donor</th><th>Gross</th><th>Fees</th><th>Net</th><th>Match</th></tr></thead><tbody>
            ${rows
              .map(
                (row) => `<tr>
              <td>${escapeHtml(reconciliationDate(row.created))}</td>
              <td>${escapeHtml(row.allocationLabel || row.reportingCategory || 'Stripe activity')}</td>
              <td>${escapeHtml(row.donorName || '—')}</td>
              <td>${escapeHtml(moneyFull(row.grossCents || 0))}</td>
              <td>${escapeHtml(moneyFull(row.feeCents || 0))}</td>
              <td><b>${escapeHtml(moneyFull(row.netCents || 0))}</b></td>
              <td><span class="${row.matched ? 'pdx-rc-match-chip-yes' : 'pdx-rc-match-chip-no'}">${row.matched ? 'Matched' : 'Review'}</span></td>
            </tr>`
              )
              .join('')}
          </tbody></table>`
              : ''
          }
        </div>
      </details>`;
    })
    .join('')}</div>`;
}

function renderReconciliationExceptions(exceptions) {
  const pane = document.getElementById('reconcileExceptionsPane');
  if (!pane) return;
  if (!exceptions.length) {
    pane.innerHTML = `<div class="pdx-rc-exceptions-empty">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        <strong>No matching exceptions recorded</strong>
        <span>A bank check is still required before this report is reconciled.</span>
      </div>`;
    return;
  }
  pane.innerHTML = `<div class="pdx-rc-exception-list">${exceptions
    .map((item) => {
      const severity = item.severity === 'error' || item.severity === 'critical' ? 'error' : 'warning';
      return `<div class="pdx-rc-exception ${severity}">
        <div class="pdx-rc-exception-icon">
          ${
            severity === 'error'
              ? '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>'
              : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
          }
        </div>
        <div class="pdx-rc-exception-copy">
          <strong>${escapeHtml(item.message || 'Review this item.')}</strong>
          ${item.payoutId ? `<small>Payout ${escapeHtml(item.payoutId)}</small>` : ''}
        </div>
        <div class="pdx-rc-exception-amount">${item.amountCents ? escapeHtml(moneyFull(item.amountCents)) : ''}</div>
      </div>`;
    })
    .join('')}</div>`;
}

function renderReconciliationReviewHistory(history) {
  const pane = document.getElementById('reconcileReviewHistory');
  if (!pane) return;
  pane.innerHTML = history.length
    ? history
        .map(
          (record) =>
            '<div class="fr-review-entry"><strong>' +
            (record.status === 'closed' ? 'Reconciled review' : 'Reopened for review') +
            '</strong><span>' +
            escapeHtml(new Date(record.updatedAt).toLocaleString()) +
            ' · ' +
            (record.bankConfirmed
              ? moneyFull(record.bankStatementCents) + ' bank total confirmed'
              : 'Bank check required') +
            '</span><p>' +
            escapeHtml(record.notes || 'No treasurer note.') +
            '</p><small>Revision ' +
            escapeHtml(record.reviewId || '') +
            '</small></div>'
        )
        .join('')
    : '<p class="fr-source">No saved reviews for this month yet.</p>';
}

function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value !== 'number' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function exportFundReconciliation(kind = 'funds') {
  const data = reconciliationData;
  if (!data?.available) {
    setStatus('Prepare the report before exporting.', 'error');
    return;
  }
  const status =
    data.state === 'reconciled'
      ? 'Reconciled'
      : 'Draft - ' + (data.complete ? 'bank review pending' : 'incomplete or unresolved');
  const context = [
    data.period.month,
    data.period.timezone || 'UTC',
    'Stripe expected arrival date (UTC calendar date)',
    'USD',
    status,
    data.fingerprint || '',
    data.generatedAt,
    data.stripeAccountId || '',
  ];
  const headers = [
    'Month',
    'Parish timezone',
    'Date basis',
    'Currency',
    'Review status',
    'Report fingerprint',
    'Prepared at',
    'Stripe account',
  ];
  const cents = (n) => Number((Number(n || 0) / 100).toFixed(2));
  const rows =
    kind === 'transactions'
      ? [
          [
            ...headers,
            'Activity date',
            'Payout ID',
            'Payout status',
            'Transaction ID',
            'Fund',
            'Giver',
            'Gross',
            'Fees',
            'Net',
            'Matched',
          ],
          ...(data.transactions || []).map((item) => [
            ...context,
            reconciliationDate(item.created),
            item.payoutId,
            item.payoutStatus,
            item.id,
            item.allocationLabel,
            item.donorName,
            cents(item.grossCents),
            cents(item.feeCents),
            cents(item.netCents),
            item.matched ? 'Yes' : 'No',
          ]),
        ]
      : [
          [
            ...headers,
            'Fund ID',
            'Fund',
            'Transactions',
            'Amounts charged',
            'Refunds / negative adjustments',
            'Actual fees',
            'Net attributed',
          ],
          ...(data.allocations || []).map((item) => [
            ...context,
            item.fundId || item.key,
            item.label,
            item.transactionCount,
            cents(item.chargedCents ?? item.grossCents),
            cents(item.refundsCents),
            cents(item.feeCents),
            cents(item.netCents),
          ]),
          [
            ...context,
            'unallocated',
            'Unallocated / needs review',
            data.summary?.unmatchedCount || 0,
            '',
            '',
            '',
            cents((data.summary?.depositedCents || 0) - (data.summary?.matchedNetCents || 0)),
          ],
        ];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const name = currentParish.parishId + '-reconciliation-' + data.period.month + '-' + kind + '.csv';
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  setStatus('Exported ' + name + '.', 'success');
}
function exportReconciliationCsv() {
  exportFundReconciliation('funds');
}

function printFundTransferWorksheet() {
  const worksheet = reconciliationData?.transferWorksheet;
  if (!worksheet?.available) {
    setStatus('Prepare the detailed fund transfer worksheet first.', 'error');
    return;
  }
  const instructions = new Map(collectFundTransferInstructions().map((item) => [item.key, item]));
  const rows = (worksheet.lines || [])
    .map((item) => {
      const instruction = instructions.get(item.key) || { action: item.recommendedAction || 'retain' };
      const handling = instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account';
      const status = instruction.action === 'transfer' ? (instruction.completed ? 'Completed' : 'Pending') : 'Retained';
      return `<tr><td><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.category)}</small></td><td>${moneyFull(item.grossCents || 0)}</td><td>${moneyFull(item.feeCents || 0)}</td><td><strong>${moneyFull(item.netCents || 0)}</strong></td><td>${escapeHtml(handling)}</td><td>${escapeHtml(instruction.destination || '—')}</td><td>${escapeHtml(status)}${instruction.reference ? `<small>${escapeHtml(instruction.reference)}</small>` : ''}</td></tr>`;
    })
    .join('');
  const popup = window.open('', '_blank');
  if (!popup) {
    setStatus('Allow pop-ups to print the fund transfer worksheet.', 'error');
    return;
  }
  popup.opener = null;
  popup.document.write(
    `<!doctype html><html><head><title>AGAPAY Fund Transfer Worksheet</title><style>body{font:13px Arial;color:#061522;margin:38px}header{border-bottom:3px solid #c9a24a;padding-bottom:15px;margin-bottom:22px}small{display:block;color:#68717a;margin-top:3px}h1{font:600 28px Georgia,serif;margin:5px 0}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:10px;text-transform:uppercase}.summary strong{display:block;font:600 20px Georgia,serif;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#555}.hold{border:1px solid #d7b96c;background:#fff8e6;padding:10px;margin-top:14px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:48px}.sign div{border-top:1px solid #333;padding-top:6px;color:#666}.note{margin-top:24px;color:#666;line-height:1.5}@media print{body{margin:14mm}}@media(max-width:700px){.summary{grid-template-columns:1fr}}</style></head><body><header><small>AGAPAY GIVE · TREASURER WORKSHEET</small><h1>${escapeHtml(currentParish?.parishName || 'Parish')}</h1><div>${escapeHtml(reconciliationMonthLabel(reconciliationData?.period?.month))} · USD · ${reconciliationData?.state === 'reconciled' ? 'Reconciled report' : 'DRAFT — NOT BANK-VERIFIED'}</div></header><div class="summary"><div><span>Stripe deposits</span><strong>${moneyFull(worksheet.depositedCents || 0)}</strong></div><div><span>Planned transfers</span><strong>${moneyFull(
      [...instructions.entries()].reduce((sum, [key, value]) => {
        const line = (worksheet.lines || []).find((item) => item.key === key);
        return sum + (value.action === 'transfer' && Number(line?.netCents || 0) > 0 ? Number(line.netCents) : 0);
      }, 0)
    )}</strong></div><div><span>Unallocated / review</span><strong>${moneyFull(worksheet.unallocatedCents || 0)}</strong></div></div>${Number(worksheet.unallocatedCents || 0) !== 0 ? `<div class="hold"><strong>Hold ${moneyFull(Math.abs(Number(worksheet.unallocatedCents || 0)))} for review.</strong> Do not distribute the unmatched amount until reconciliation exceptions are resolved.</div>` : ''}<table><thead><tr><th>Fund</th><th>Gross</th><th>Fees</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status / reference</th></tr></thead><tbody>${rows}</tbody></table><p class="note">Stripe payouts settle into the parish deposit account. These amounts are period receipts after recorded fees and adjustments, not current fund balances or a recommendation to transfer the full amount. Worksheet edits are unsaved until the review is saved. AGAPAY does not initiate or approve bank transfers.</p><div class="sign"><div>Treasurer signature / date</div><div>Reviewer signature / date</div></div><script>window.onload=()=>window.print()</script></body></html>`
  );
  popup.document.close();
}

function printReconciliationReport() {
  if (!reconciliationData?.available) {
    setStatus('Run the reconciliation first.', 'error');
    return;
  }
  const data = reconciliationData;
  const summary = data.summary || {};
  const popup = window.open('', '_blank');
  if (!popup) {
    setStatus('Allow pop-ups to print the closeout report.', 'error');
    return;
  }
  const allocations = (data.allocations || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.label)}</td><td>${item.transactionCount || 0}</td><td>${moneyFull(item.netCents || 0)}</td></tr>`
    )
    .join('');
  const payouts = (data.payouts || [])
    .map(
      (item) =>
        `<tr><td>${reconciliationDate(item.arrivalDate, 'UTC')}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(statusLabel(item.status))}</td><td>${moneyFull(item.amountCents || 0)}</td></tr>`
    )
    .join('');
  const exceptions =
    (data.exceptions || []).map((item) => `<li>${escapeHtml(item.message)}</li>`).join('') || '<li>None.</li>';
  const transferInstructions = new Map(collectFundTransferInstructions().map((item) => [item.key, item]));
  const transfers = (data.transferWorksheet?.lines || [])
    .map((item) => {
      const instruction = transferInstructions.get(item.key) || { action: item.recommendedAction || 'retain' };
      return `<tr><td>${escapeHtml(item.label)}</td><td>${moneyFull(item.netCents || 0)}</td><td>${instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account'}</td><td>${escapeHtml(instruction.destination || '—')}</td><td>${instruction.completed ? 'Completed' : instruction.action === 'transfer' ? 'Pending' : 'Retained'}</td></tr>`;
    })
    .join('');
  popup.opener = null;
  popup.document.write(
    `<!doctype html><html><head><title>AGAPAY Reconciliation</title><style>body{font:14px Arial;color:#061522;margin:40px}h1,h2{font-family:Georgia,serif}header{border-bottom:3px solid #c9a24a;margin-bottom:24px;padding-bottom:16px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:11px;text-transform:uppercase}.summary strong{font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}footer{margin-top:36px;border-top:1px solid #ccc;padding-top:12px;color:#666}@media print{body{margin:18mm}.no-print{display:none}}@media(max-width:700px){.summary{grid-template-columns:1fr 1fr}}</style></head><body><header><small>AGAPAY GIVE · MONTHLY RECONCILIATION</small><h1>${escapeHtml(currentParish.parishName || 'Parish')}</h1><p>${escapeHtml(reconciliationMonthLabel(data.period?.month))} · USD · ${escapeHtml(data.period?.timezone || 'UTC')}</p><p><strong>${data.state === 'reconciled' ? 'RECONCILED — BANK CHECK SAVED' : 'DRAFT — NOT BANK-VERIFIED'}</strong></p><p>Payout basis: Stripe expected arrival date (UTC calendar date). These are period receipts, not current fund balances.</p><small>Report fingerprint: ${escapeHtml(data.fingerprint || 'Unavailable')}</small></header><div class="summary"><div><span>Bank deposits</span><strong>${moneyFull(summary.depositedCents || 0)}</strong></div><div><span>Gross activity</span><strong>${moneyFull(summary.grossActivityCents || 0)}</strong></div><div><span>Total fees</span><strong>${moneyFull(summary.totalFeeCents || 0)}</strong></div><div><span>Needs allocation</span><strong>${moneyFull((summary.depositedCents || 0) - (summary.matchedNetCents || 0))}</strong></div></div><h2>Fund allocation</h2><table><thead><tr><th>Category</th><th>Post to</th><th>Count</th><th>Net</th></tr></thead><tbody>${allocations || '<tr><td colspan="4">No allocations.</td></tr>'}</tbody></table>${transfers ? `<h2>Fund transfer worksheet</h2><table><thead><tr><th>Fund</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status</th></tr></thead><tbody>${transfers}</tbody></table>` : ''}<h2>Stripe payouts</h2><table><thead><tr><th>Arrival</th><th>Payout</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payouts || '<tr><td colspan="4">No payouts.</td></tr>'}</tbody></table><h2>Review items</h2><ul>${exceptions}</ul><h2>Saved bank check</h2><p>${data.state === 'reconciled' ? moneyFull(data.closeRecord.bankStatementCents) + ' confirmed · ' + escapeHtml(data.closeRecord.closedAt) : 'Not verified for this report revision.'}</p><p>${escapeHtml(data.closeRecord?.notes || '')}</p><footer>Generated ${escapeHtml(new Date(data.generatedAt || Date.now()).toLocaleString())} · AGAPAY Give</footer><script>window.onload=()=>window.print()</script></body></html>`
  );
  popup.document.close();
}
