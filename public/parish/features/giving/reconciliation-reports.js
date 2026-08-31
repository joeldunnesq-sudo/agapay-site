'use strict';

/* global reconciliationData, escapeHtml, money, statusLabel, reconciliationDate, moneyFull, setStatus,
  collectFundTransferInstructions, currentParish, downloadBlob, reconciliationMonthLabel */
/* exported setReconcileAllocView, renderReconciliationGiftActivity, renderReconciliationPayouts,
  renderReconciliationExceptions, exportReconciliationCsv, printFundTransferWorksheet,
  printReconciliationReport */

// Giving reconciliation-reports; read shared identity and catalog state only when actions run.

// Persist allocation view choice across sessions
const PDX_RC_ALLOC_KEY = 'agapay_reconcile_alloc_view';

const PDX_RC_ALLOC_COLORS = ['#3B5A6F', '#C8A24A', '#7FA97A', '#B47A50', '#8A6BA1', '#5B7C99', '#A87256', '#4C8672'];

function getReconcileAllocView() {
  try {
    return localStorage.getItem(PDX_RC_ALLOC_KEY) || 'stacked';
  } catch {
    return 'stacked';
  }
}

function setReconcileAllocView(mode, btn) {
  try {
    localStorage.setItem(PDX_RC_ALLOC_KEY, mode);
  } catch {
    /* Storage may be unavailable; keep the selected view usable. */
  }
  if (btn) {
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  }
  if (reconciliationData?.allocations) {
    renderReconciliationAllocations(
      reconciliationData.allocations || [],
      reconciliationData.summary?.depositedCents || 0
    );
  }
}

function renderReconciliationAllocations(allocations, depositedCents) {
  const pane = document.getElementById('reconcileAllocationsPane');
  if (!pane) return;

  // Sync the toggle chips to the persisted preference
  const view = getReconcileAllocView();
  const toggle = document.getElementById('pdxRcAllocToggle');
  if (toggle) {
    toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === view));
  }

  if (!allocations.length) {
    pane.innerHTML =
      '<div class="pdx-recurring-empty">No matched fund allocations were found in this month\'s paid payouts.</div>';
    return;
  }

  const items = allocations.map((item, i) => {
    const net = Number(item.netCents || 0);
    const pct = depositedCents ? Math.max(0, Math.min(100, Math.round((net / depositedCents) * 100))) : 0;
    return {
      color: PDX_RC_ALLOC_COLORS[i % PDX_RC_ALLOC_COLORS.length],
      label: item.label || 'General Giving',
      category: item.category || 'Giving',
      transactionCount: Number(item.transactionCount || 0),
      feeCents: Number(item.feeCents || 0),
      netCents: net,
      percent: pct,
    };
  });
  const maxPct = Math.max(...items.map((i) => i.percent), 1);

  const stackedHtml = `
      <div class="pdx-rc-alloc-stacked">
        ${items
          .filter((i) => i.percent > 0)
          .map(
            (i) => `
          <div class="pdx-rc-alloc-seg" style="--w:${i.percent}%; background:${i.color};" title="${escapeHtml(i.label)}: ${escapeHtml(money(i.netCents))} (${i.percent}%)">
            ${i.percent >= 6 ? escapeHtml(money(i.netCents)) : ''}
          </div>
        `
          )
          .join('')}
      </div>
      <div class="pdx-rc-alloc-legend">
        ${items
          .map(
            (i) => `
          <div class="pdx-rc-alloc-legend-item">
            <span><span class="pdx-rc-alloc-legend-swatch" style="background:${i.color};"></span><span class="pdx-rc-alloc-legend-name">${escapeHtml(i.label)}</span></span>
            <span class="pdx-rc-alloc-legend-value">${escapeHtml(money(i.netCents))} <span class="pdx-rc-alloc-legend-pct">${i.percent}%</span></span>
          </div>
        `
          )
          .join('')}
      </div>`;

  const barsHtml = `
      <div class="pdx-rc-alloc-bar-list">
        ${items
          .map((i) => {
            const relative = Math.round((i.percent / maxPct) * 100);
            return `
          <div class="pdx-rc-alloc-bar-row">
            <span class="pdx-rc-alloc-legend-swatch" style="background:${i.color};"></span>
            <div class="pdx-rc-alloc-bar-body">
              <div class="pdx-rc-alloc-bar-top">
                <strong>${escapeHtml(i.label)}</strong>
                <span>${escapeHtml(money(i.netCents))}</span>
              </div>
              <div class="pdx-rc-alloc-bar-track"><i data-w="${relative}%" style="background:${i.color};"></i></div>
              <div class="pdx-rc-alloc-bar-meta">
                <span>${i.transactionCount} transaction${i.transactionCount === 1 ? '' : 's'}${i.feeCents ? ` · ${escapeHtml(money(i.feeCents))} fees` : ''}</span>
                <span>${i.percent}% of deposit</span>
              </div>
            </div>
          </div>`;
          })
          .join('')}
      </div>`;

  pane.innerHTML = view === 'bars' ? barsHtml : stackedHtml;

  // Animate the per-fund bar tracks
  if (view === 'bars') {
    requestAnimationFrame(() =>
      setTimeout(() => {
        pane.querySelectorAll('.pdx-rc-alloc-bar-track i').forEach((el, i) => {
          setTimeout(() => {
            el.style.width = el.dataset.w;
          }, i * 60);
        });
      }, 100)
    );
  }
}

function renderReconciliationGiftActivity(activity) {
  const pane = document.getElementById('reconcileGiftActivityPane');
  if (!pane) return;
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
            <div style="font-family:var(--serif); font-size:22px; font-weight:600; color:var(--ink);">${escapeHtml(it.isMoney ? money(it.value) : String(it.value))}</div>
          </div>
        `
          )
          .join('')}
      </div>
      <p style="font-size:12px; color:var(--stone); margin:0;">These gifts were made during the month. Stripe may deposit some of them in a later month.</p>`;
}

function renderReconciliationPayouts(payouts, transactions) {
  const pane = document.getElementById('reconcilePayoutsPane');
  if (!pane) return;
  if (!payouts.length) {
    pane.innerHTML = '<div class="pdx-recurring-empty">No Stripe payouts arrived in this month.</div>';
    return;
  }
  const monthShort = {
    0: 'Jan',
    1: 'Feb',
    2: 'Mar',
    3: 'Apr',
    4: 'May',
    5: 'Jun',
    6: 'Jul',
    7: 'Aug',
    8: 'Sep',
    9: 'Oct',
    10: 'Nov',
    11: 'Dec',
  };
  pane.innerHTML = `<div class="pdx-rc-payout-list">${payouts
    .map((payout) => {
      const rows = transactions.filter((row) => row.payoutId === payout.id);
      const arrival = payout.arrivalDate ? new Date(payout.arrivalDate) : null;
      const day = arrival ? String(arrival.getDate()).padStart(2, '0') : '—';
      const mon = arrival ? monthShort[arrival.getMonth()] : '';
      const diff = Math.abs(Number(payout.differenceCents || 0));
      const unmatched = rows.filter((r) => !r.matched).length;
      const chipClass = unmatched > 0 || diff > 100 ? 'attention' : diff > 0 ? 'partial' : 'matched';
      const chipLabel = unmatched > 0 ? `${unmatched} to review` : diff > 0 ? 'Composition delta' : 'Fully matched';
      const payoutIdShort =
        String(payout.id || 'Stripe payout').slice(0, 16) + (String(payout.id || '').length > 16 ? '...' : '');
      return `<details class="pdx-rc-payout">
        <summary class="pdx-rc-payout-summary">
          <div class="pdx-rc-payout-date-badge"><b>${day}</b><span>${mon}</span></div>
          <div class="pdx-rc-payout-copy">
            <strong>${escapeHtml(payoutIdShort)}</strong>
            <small>${payout.transactionCount || 0} Stripe transaction${payout.transactionCount === 1 ? '' : 's'}${payout.status && payout.status !== 'paid' ? ` · ${escapeHtml(statusLabel(payout.status))}` : ''}</small>
          </div>
          <div class="pdx-rc-payout-amount">${escapeHtml(money(payout.amountCents || 0))}</div>
          <span class="pdx-rc-payout-status-chip ${chipClass}">${escapeHtml(chipLabel)}</span>
        </summary>
        <div class="pdx-rc-payout-body">
          <div class="pdx-rc-payout-body-line"><span>Matched to gifts</span><b>${escapeHtml(money(payout.matchedNetCents || 0))}</b></div>
          <div class="pdx-rc-payout-body-line"><span>Composition difference</span><b>${escapeHtml(money(payout.differenceCents || 0))}</b></div>
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
        <strong>Ready to close</strong>
        <span>No payout exceptions need review.</span>
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

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportReconciliationCsv() {
  if (!reconciliationData?.available) {
    setStatus('Run the reconciliation first.', 'error');
    return;
  }
  const data = reconciliationData;
  const transferInstructions = new Map(collectFundTransferInstructions().map((item) => [item.key, item]));
  const rows = [
    ['AGAPAY Monthly Reconciliation', currentParish?.parishName || ''],
    ['Month', data.period?.month || ''],
    ['Deposited to bank', (Number(data.summary?.depositedCents || 0) / 100).toFixed(2)],
    ['Stripe fees', (Number(data.summary?.stripeFeeCents || 0) / 100).toFixed(2)],
    ['AGAPAY fees', (Number(data.summary?.agapayFeeCents || 0) / 100).toFixed(2)],
    [],
    ['Fund Allocation'],
    ['Category', 'Fund / Campaign', 'Transactions', 'Gross', 'Fees', 'Net'],
    ...(data.allocations || []).map((item) => [
      item.category,
      item.label,
      item.transactionCount,
      item.grossCents / 100,
      item.feeCents / 100,
      item.netCents / 100,
    ]),
    [],
    ['Fund Transfer Worksheet'],
    ['Fund / Campaign', 'Net amount', 'Handling', 'Destination', 'Completed', 'Reference'],
    ...(data.transferWorksheet?.lines || []).map((item) => {
      const instruction = transferInstructions.get(item.key) || { action: item.recommendedAction || 'retain' };
      return [
        item.label,
        item.netCents / 100,
        instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account',
        instruction.destination || '',
        instruction.completed ? 'Yes' : 'No',
        instruction.reference || '',
      ];
    }),
    ['Unallocated amount held for review', Number(data.transferWorksheet?.unallocatedCents || 0) / 100],
    [],
    ['Stripe Payouts'],
    ['Arrival date', 'Payout ID', 'Status', 'Amount', 'Matched', 'Difference'],
    ...(data.payouts || []).map((item) => [
      reconciliationDate(item.arrivalDate),
      item.id,
      item.status,
      item.amountCents / 100,
      (item.matchedNetCents || 0) / 100,
      (item.differenceCents || 0) / 100,
    ]),
    [],
    ['Transaction Detail'],
    ['Date', 'Payout ID', 'Allocation', 'Donor', 'Gross', 'Fees', 'Net', 'Matched'],
    ...(data.transactions || []).map((item) => [
      reconciliationDate(item.created),
      item.payoutId,
      item.allocationLabel,
      item.donorName,
      item.grossCents / 100,
      item.feeCents / 100,
      item.netCents / 100,
      item.matched ? 'Yes' : 'No',
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const name = `${currentParish.parishId}-reconciliation-${data.period.month}.csv`;
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  setStatus(`Exported ${name}.`, 'success');
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
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    setStatus('Allow pop-ups to print the fund transfer worksheet.', 'error');
    return;
  }
  popup.document.write(
    `<!doctype html><html><head><title>AGAPAY Fund Transfer Worksheet</title><style>body{font:13px Arial;color:#061522;margin:38px}header{border-bottom:3px solid #c9a24a;padding-bottom:15px;margin-bottom:22px}small{display:block;color:#68717a;margin-top:3px}h1{font:600 28px Georgia,serif;margin:5px 0}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:10px;text-transform:uppercase}.summary strong{display:block;font:600 20px Georgia,serif;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#555}.hold{border:1px solid #d7b96c;background:#fff8e6;padding:10px;margin-top:14px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:48px}.sign div{border-top:1px solid #333;padding-top:6px;color:#666}.note{margin-top:24px;color:#666;line-height:1.5}@media print{body{margin:14mm}}@media(max-width:700px){.summary{grid-template-columns:1fr}}</style></head><body><header><small>AGAPAY GIVE · TREASURER WORKSHEET</small><h1>${escapeHtml(currentParish?.parishName || 'Parish')}</h1><div>${escapeHtml(reconciliationMonthLabel(reconciliationData?.period?.month))}</div></header><div class="summary"><div><span>Stripe deposits</span><strong>${moneyFull(worksheet.depositedCents || 0)}</strong></div><div><span>Planned transfers</span><strong>${moneyFull(
      [...instructions.entries()].reduce((sum, [key, value]) => {
        const line = (worksheet.lines || []).find((item) => item.key === key);
        return sum + (value.action === 'transfer' && Number(line?.netCents || 0) > 0 ? Number(line.netCents) : 0);
      }, 0)
    )}</strong></div><div><span>Unallocated / review</span><strong>${moneyFull(worksheet.unallocatedCents || 0)}</strong></div></div>${Number(worksheet.unallocatedCents || 0) !== 0 ? `<div class="hold"><strong>Hold ${moneyFull(Math.abs(Number(worksheet.unallocatedCents || 0)))} for review.</strong> Do not distribute the unmatched amount until reconciliation exceptions are resolved.</div>` : ''}<table><thead><tr><th>Fund</th><th>Gross</th><th>Fees</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status / reference</th></tr></thead><tbody>${rows}</tbody></table><p class="note">Stripe made one combined payout to the parish deposit account. These amounts are derived from paid payout activity after recorded fees, refunds, and disputes. AGAPAY does not initiate or approve bank transfers.</p><div class="sign"><div>Treasurer signature / date</div><div>Reviewer signature / date</div></div><script>window.onload=()=>window.print()</script></body></html>`
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
  const popup = window.open('', '_blank', 'noopener,noreferrer');
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
        `<tr><td>${reconciliationDate(item.arrivalDate)}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(statusLabel(item.status))}</td><td>${moneyFull(item.amountCents || 0)}</td></tr>`
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
  popup.document.write(
    `<!doctype html><html><head><title>AGAPAY Reconciliation</title><style>body{font:14px Arial;color:#061522;margin:40px}h1,h2{font-family:Georgia,serif}header{border-bottom:3px solid #c9a24a;margin-bottom:24px;padding-bottom:16px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:11px;text-transform:uppercase}.summary strong{font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}footer{margin-top:36px;border-top:1px solid #ccc;padding-top:12px;color:#666}@media print{body{margin:18mm}.no-print{display:none}}@media(max-width:700px){.summary{grid-template-columns:1fr 1fr}}</style></head><body><header><small>AGAPAY GIVE · MONTHLY RECONCILIATION</small><h1>${escapeHtml(currentParish.parishName || 'Parish')}</h1><p>${escapeHtml(reconciliationMonthLabel(data.period?.month))}</p></header><div class="summary"><div><span>Bank deposits</span><strong>${money(summary.depositedCents || 0)}</strong></div><div><span>Gross activity</span><strong>${money(summary.grossActivityCents || 0)}</strong></div><div><span>Total fees</span><strong>${money(summary.totalFeeCents || 0)}</strong></div><div><span>Matched</span><strong>${summary.matchedPercent ?? 0}%</strong></div></div><h2>Fund allocation</h2><table><thead><tr><th>Category</th><th>Post to</th><th>Count</th><th>Net</th></tr></thead><tbody>${allocations || '<tr><td colspan="4">No allocations.</td></tr>'}</tbody></table>${transfers ? `<h2>Fund transfer worksheet</h2><table><thead><tr><th>Fund</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status</th></tr></thead><tbody>${transfers}</tbody></table>` : ''}<h2>Stripe payouts</h2><table><thead><tr><th>Arrival</th><th>Payout</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payouts || '<tr><td colspan="4">No payouts.</td></tr>'}</tbody></table><h2>Review items</h2><ul>${exceptions}</ul><footer>Generated ${escapeHtml(new Date(data.generatedAt || Date.now()).toLocaleString())} · AGAPAY Give</footer><script>window.onload=()=>window.print()</script></body></html>`
  );
  popup.document.close();
}
