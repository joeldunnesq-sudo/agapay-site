'use strict';

// Parish dashboard accounting: payables.
// Classic script; preserve global names used by the dashboard and inline actions.

function accountingParishOnly() {
  return `<div class="acct-tier-gate"><span class="acct-kicker">Parish Accounting</span><h2>Advanced parish operations</h2><p>Payables and budgeting are included with the Parish tier. Mission Accounting continues to include the essential ledger and reports.</p></div>`;
}

function renderAccountingPayables(pane) {
  if (accountingData.tier !== 'advanced_operations') {
    pane.innerHTML = accountingParishOnly();
    return;
  }
  const data = accountingData.payables;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading payables...</p>';
    return;
  }
  if (accountingPayablesView === 'payments') {
    renderAccountingPayments(pane, data);
    return;
  }
  if (accountingPayablesView === 'runs') {
    renderAccountingPaymentRuns(pane, data);
    return;
  }
  if (accountingPayablesView === '1099') {
    renderAccounting1099Review(pane, data);
    return;
  }
  if (accountingPayablesView === 'recurring') {
    renderAccountingRecurringBills(pane, data);
    return;
  }
  const overview = data.overview || {},
    tabs = [
      ['bills', 'Bills'],
      ['recurring', 'Recurring bills'],
      ['payments', 'Payments & Checks'],
      ['runs', 'Payment runs'],
      ['1099', '1099 review'],
      ['vendors', 'Vendors'],
      ['aging', 'Aging'],
    ];
  const vendorLifecycle = (vendor) => {
    const action = vendor.status === 'archived' ? 'unarchive' : 'archive',
      confirming =
        accountingVendorLifecycleConfirm?.id === vendor.id && accountingVendorLifecycleConfirm.action === action;
    const message =
      accountingLifecycleMessage?.type === 'vendor' && accountingLifecycleMessage.id === vendor.id
        ? `<span class="acct-lifecycle-message">${escapeHtml(accountingLifecycleMessage.text)}</span>`
        : '';
    return `<div class="acct-lifecycle-actions">${confirming ? `<span>${action === 'archive' ? 'Archive this vendor?' : 'Restore this vendor?'}</span><button type="button" onclick="changeAccountingVendorLifecycle('${escapeAttr(vendor.id)}','${action}',${vendor.version})">Confirm</button><button type="button" onclick="cancelAccountingLifecycle()">Cancel</button>` : `<button type="button" onclick="showAccountingVendorForm('${escapeAttr(vendor.id)}')">Edit</button><button type="button" onclick="beginAccountingVendorLifecycle('${escapeAttr(vendor.id)}','${action}')">${action === 'archive' ? 'Archive' : 'Unarchive'}</button>`}${message}</div>`;
  };
  let body = '';
  if (accountingPayablesView === 'vendors')
    body = `<div class="acct-list-head"><div><span class="acct-kicker">Vendor directory</span><h2>${data.vendors.length} vendors</h2></div><button class="acct-primary" type="button" onclick="showAccountingVendorForm()">New vendor</button></div><div id="accountingPhaseDForm"></div><div class="acct-card-grid">${data.vendors.map((vendor) => `<article class="acct-mini-card ${vendor.status === 'archived' ? 'retired' : ''}"><span>${escapeHtml(vendor.vendorNumber)} · ${escapeHtml(vendor.status)}</span><h3>${escapeHtml(vendor.displayName)}</h3><p>${escapeHtml(vendor.email || vendor.vendorType || 'Active vendor')}</p>${vendorLifecycle(vendor)}</article>`).join('') || accountingEmpty('No vendors yet', 'Add the first vendor before entering a bill.')}</div>`;
  else if (accountingPayablesView === 'aging')
    body = `<div class="acct-list-head"><div><span class="acct-kicker">Accounts payable aging</span><h2>${accountingMoney(data.aging.totalDue)} outstanding</h2></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Current</th><th>1–30</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th></tr></thead><tbody>${(data.aging.rows || []).map((row) => `<tr><td><strong>${escapeHtml(row.vendor)}</strong></td><td>${accountingMoney(row.current)}</td><td>${accountingMoney(row.days1to30)}</td><td>${accountingMoney(row.days31to60)}</td><td>${accountingMoney(row.days61to90)}</td><td>${accountingMoney(row.over90)}</td><td><strong>${accountingMoney(row.totalDue)}</strong></td></tr>`).join('') || '<tr><td colspan="7">No outstanding payables.</td></tr>'}</tbody></table></div>`;
  else
    body = `<div class="acct-list-head"><div><span class="acct-kicker">Bill workflow</span><h2>Vendor bills & approvals</h2></div><button class="acct-primary" type="button" onclick="showAccountingBillForm()">Enter bill</button></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Due</th><th>Vendor</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.bills.map((bill) => `<tr><td>${accountingDate(bill.dueDate)}</td><td><strong>${escapeHtml(bill.vendorName)}</strong></td><td>${escapeHtml(bill.vendorInvoiceNumber || bill.billNumber)}</td><td>${accountingMoney(bill.amountDue ?? bill.totalAmount)}</td><td><span class="acct-status ${escapeAttr(bill.status)}">${escapeHtml(bill.status)}</span></td><td><div class="acct-row-actions"><button onclick="openAccountingBillDetail('${escapeAttr(bill.id)}')">Details & attachments</button>${bill.status === 'draft' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','submit',${bill.version})">Submit</button>` : ''}${bill.status === 'submitted' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','approve',${bill.version})">Approve</button>` : ''}${bill.status === 'approved' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','post',${bill.version})">Post</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6">No bills entered.</td></tr>'}</tbody></table></div>`;
  pane.innerHTML = `<div class="acct-kpis"><div><span>Open payables</span><strong>${accountingMoney(overview.openPayables)}</strong></div><div><span>Awaiting approval</span><strong>${overview.awaitingApproval || 0}</strong></div><div><span>Overdue bills</span><strong>${overview.overdue || 0}</strong></div></div><div class="acct-subtabs">${tabs.map(([id, label]) => `<button class="${accountingPayablesView === id ? 'active' : ''}" onclick="setAccountingPayablesView('${id}')">${label}</button>`).join('')}</div>${body}`;
}

function accountingPayablesTabs() {
  return [
    ['bills', 'Bills'],
    ['recurring', 'Recurring bills'],
    ['payments', 'Payments & Checks'],
    ['runs', 'Payment runs'],
    ['1099', '1099 review'],
    ['vendors', 'Vendors'],
    ['aging', 'Aging'],
  ]
    .map(
      ([id, label]) =>
        `<button class="${accountingPayablesView === id ? 'active' : ''}" onclick="setAccountingPayablesView('${id}')">${label}</button>`
    )
    .join('');
}

function renderAccountingRecurringBills(pane, data) {
  const schedules = data.recurringBills || [];
  pane.innerHTML = `<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Accounts payable automation</span><h2>Recurring vendor bills</h2><p>Each due date creates a reviewable draft bill. Nothing is approved, posted, or paid automatically.</p></div><button class="acct-primary" type="button" onclick="showAccountingRecurringBillForm()">New recurring bill</button></div><div id="accountingPhaseDForm"></div><div class="acct-card-grid">${schedules.map((item) => `<article class="acct-mini-card"><span>${escapeHtml(item.frequency)} · next ${accountingDate(item.nextBillDate)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.vendorName)} · ${escapeHtml(item.accountName)} · ${escapeHtml(item.fundName)}</p><strong>${accountingMoney(item.amount)}</strong><div class="acct-lifecycle-actions"><span class="acct-status ${item.status === 'active' ? 'posted' : 'draft'}">${escapeHtml(item.status)}</span>${item.status === 'active' ? `<button type="button" onclick="toggleAccountingRecurringBill('${escapeAttr(item.id)}',${item.version},'paused')">Pause</button>` : item.status === 'paused' ? `<button type="button" onclick="toggleAccountingRecurringBill('${escapeAttr(item.id)}',${item.version},'active')">Resume</button>` : ''}</div></article>`).join('') || accountingEmpty('No recurring bills yet', 'Create a schedule for utilities, insurance, subscriptions, or another repeating vendor bill.')}</div>`;
}

function renderAccountingPayments(pane, data) {
  const overview = data.overview || {},
    payments = data.payments || [];
  const methodLabel = {
    check: 'Check',
    external: 'Online bill pay',
    ach: 'ACH / bank transfer',
    wire: 'Wire transfer',
    debit_card: 'Debit card',
    credit_card: 'Credit card',
    cash: 'Cash',
    other: 'Other',
  };
  const paymentRows = payments
    .map((payment) => {
      const isCheck = payment.paymentMethod === 'check';
      return `<tr><td>${accountingDate(payment.paymentDate)}</td><td><strong>${escapeHtml(payment.checkNumber || payment.referenceNumber || payment.paymentNumber)}</strong>${isCheck && Number(payment.printCount) > 1 ? `<br><small class="acct-check-state">Reprinted · ${Number(payment.printCount)} copies</small>` : isCheck && Number(payment.printCount) === 1 ? '<br><small class="acct-check-state">Original printed</small>' : ''}</td><td>${escapeHtml(methodLabel[payment.paymentMethod] || payment.paymentMethod)}</td><td>${escapeHtml(payment.vendorName)}</td><td>${escapeHtml(payment.bankAccountName)}</td><td>${accountingMoney(payment.totalAmount)}</td><td><span class="acct-status ${escapeAttr(payment.status)}">${payment.status === 'voided' ? 'Voided' : escapeHtml(payment.status)}</span></td><td><div class="acct-row-actions">${payment.status === 'approved' ? `${isCheck ? `<button onclick="printAccountingCheck('${escapeAttr(payment.id)}',${Number(payment.printCount) || 0})">${payment.printCount ? 'Reprint' : 'Print'}</button>` : ''}<button onclick="postAccountingPayment('${escapeAttr(payment.id)}',${payment.version})" ${isCheck && !payment.printCount ? 'disabled title="Print the check before posting"' : ''}>Post</button>` : payment.status === 'posted' && isCheck ? `<button onclick="printAccountingCheck('${escapeAttr(payment.id)}',${Number(payment.printCount) || 0})">Reprint</button>` : ''}${['approved', 'posted'].includes(payment.status) ? `<button onclick="voidAccountingPayment('${escapeAttr(payment.id)}',${payment.version})">Void</button>` : ''}</div></td></tr>`;
    })
    .join('');
  pane.innerHTML = `<div class="acct-kpis"><div><span>Open payables</span><strong>${accountingMoney(overview.openPayables)}</strong></div><div><span>Payments ready</span><strong>${payments.filter((payment) => payment.status === 'approved').length}</strong></div><div><span>Payments posted</span><strong>${payments.filter((payment) => payment.status === 'posted').length}</strong></div></div><div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Payment desk</span><h2>Bill payment register</h2></div><div class="acct-report-actions"><button class="acct-refresh" type="button" onclick="showAccountingCheckSettings()">Check settings</button><button class="acct-primary" type="button" onclick="showAccountingPaymentForm()">Pay bills</button></div></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Vendor</th><th>Bank</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="8">No bill payments yet.</td></tr>'}</tbody></table></div>`;
}

function renderAccountingPaymentRuns(pane, data) {
  pane.innerHTML = `<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Month-end payables</span><h2>Payment runs</h2><p>Reserve a unique check range, review each vendor payment, post, then print one stack.</p></div><button class="acct-primary" onclick="showAccountingPaymentRunForm()">New payment run</button></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Bank</th><th>Payments</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>${(data.paymentRuns || []).map((run) => `<tr><td>${accountingDate(run.runDate)}</td><td>${escapeHtml(run.bankAccountName)}</td><td>${run.paymentCount}</td><td>${accountingMoney(run.totalAmount)}</td><td><span class="acct-status ${escapeAttr(run.status)}">${escapeHtml(run.status)}</span></td><td><div class="acct-row-actions">${run.status === 'draft' ? `<button onclick="postAccountingPaymentRun('${escapeAttr(run.id)}',${run.version})">Post remainder</button>` : ''}<button onclick="printAccountingPaymentRun('${escapeAttr(run.id)}')">Print stack</button></div></td></tr>`).join('') || '<tr><td colspan="6">No payment runs yet.</td></tr>'}</tbody></table></div>`;
}

function renderAccounting1099Review(pane, data) {
  const report = data.tax1099 || {
    calendarYear: new Date().getFullYear(),
    vendors: [],
    disclaimer: 'Data-preparation aid only; not a filed or filing-ready Form 1099-NEC or Form 1096.',
  };
  pane.innerHTML = `<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Vendor tax review</span><h2>1099 review</h2><p>${escapeHtml(report.disclaimer)}</p></div><div class="acct-report-actions"><label>Calendar year <input id="accounting1099Year" type="number" min="2000" max="2200" value="${escapeAttr(report.calendarYear)}"></label><button class="acct-refresh" onclick="loadAccounting1099Review()">Run report</button><button class="acct-primary" onclick="downloadAccounting1099Review()">Export CSV</button></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Legal name</th><th>Tax ID</th><th>Classification</th><th>Eligible paid</th><th>$600 threshold</th></tr></thead><tbody>${(report.vendors || []).map((vendor) => `<tr><td><strong>${escapeHtml(vendor.displayName)}</strong></td><td>${escapeHtml(vendor.legalName || '—')}</td><td>${vendor.taxIdLast4 ? `•••• ${escapeHtml(vendor.taxIdLast4)}` : '—'}</td><td>${escapeHtml(vendor.taxClassification || '—')}</td><td>${accountingMoney(vendor.totalPaid)}</td><td><span class="acct-status ${vendor.meetsThreshold ? 'posted' : 'draft'}">${vendor.meetsThreshold ? 'Threshold met' : 'Below threshold'}</span></td></tr>`).join('') || '<tr><td colspan="6">No vendors are flagged for 1099 review.</td></tr>'}</tbody></table></div><p class="acct-report-disclaimer">Card and third-party network payments are excluded because those amounts are generally reported by the payment network on Form 1099-K. Confirm filing obligations with a qualified tax professional.</p>`;
}

function renderAccountingPledgeComparison(comparison = {}) {
  if (!comparison.accountId)
    return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>Choose a stewardship revenue account</h3><p>Pledge totals are available, but AGAPAY will not guess which revenue account belongs in this comparison.</p><button class="acct-refresh" onclick="setAccountingView('settings')">Configure account</button></aside>`;
  if (comparison.budgetedLineAmountCents === null)
    return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>${accountingMoney(comparison.pledgedTotalCents)} pledged</h3><p>${comparison.pledgingHouseholds} pledging households for ${comparison.fiscalYear}. Add a draft line for ${escapeHtml(comparison.accountNumber)} · ${escapeHtml(comparison.accountName)} to compare it.</p></aside>`;
  return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>${accountingMoney(comparison.pledgedTotalCents)} pledged</h3><div class="acct-facts"><div><strong>${accountingMoney(comparison.budgetedLineAmountCents)}</strong><span>Budgeted for ${escapeHtml(comparison.accountNumber)} · ${escapeHtml(comparison.accountName)}</span></div><div><strong>${accountingMoney(comparison.varianceCents)}</strong><span>Budget less pledges · informational only</span></div></div><p>${comparison.pledgingHouseholds} pledging households. This panel never changes a budget line.</p></aside>`;
}

function renderAccountingBudgets(pane) {
  if (accountingData.tier !== 'advanced_operations') {
    pane.innerHTML = accountingParishOnly();
    return;
  }
  const data = accountingData.budgets;
  if (!data) {
    pane.innerHTML = '<p class="sw-tool-loading">Loading budgets...</p>';
    return;
  }
  if (accountingBudgetReport) {
    const report = accountingBudgetReport;
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Budget to actual</span><h2>${escapeHtml(report.budget?.name || 'Budget variance')}</h2></div><div class="acct-report-actions"><button class="acct-refresh" onclick="closeAccountingBudgetReport()">Back</button><button class="acct-primary" onclick="downloadAccountingBudgetVariance('${escapeAttr(report.budget.id)}')">Export CSV</button></div></div><div class="acct-kpis"><div><span>Budget YTD</span><strong>${accountingMoney(report.totals?.budget)}</strong></div><div><span>Actual YTD</span><strong>${accountingMoney(report.totals?.actual)}</strong></div><div><span>Variance</span><strong>${accountingMoney(report.totals?.variance)}</strong></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account</th><th>Budget</th><th>Actual</th><th>Variance</th><th>Assessment</th></tr></thead><tbody>${(report.rows || []).map((row) => `<tr><td><strong>${escapeHtml(row.accountNumber)}</strong> ${escapeHtml(row.account)}</td><td>${accountingMoney(row.budget)}</td><td>${accountingMoney(row.actual)}</td><td>${accountingMoney(row.variance)}</td><td><span class="acct-status ${row.favorable ? 'posted' : ''}">${escapeHtml(row.varianceLabel)}</span></td></tr>`).join('') || '<tr><td colspan="5">No budget lines.</td></tr>'}</tbody></table></div>`;
    return;
  }
  pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Financial planning</span><h2>Budget versions</h2></div><button class="acct-primary" onclick="showAccountingBudgetForm()">New budget</button></div><div id="accountingPhaseDForm">${accountingBudgetEditor ? `<div class="acct-setup-grid">${renderAccountingPledgeComparison(accountingBudgetEditor.pledgeComparison)}<section class="acct-card"><span class="acct-kicker">Inline budget-line editing</span><h2>Edit draft lines</h2>${accountingBudgetEditor.lines.map((line) => `<form class="acct-phase-form" onsubmit="updateAccountingBudgetLine(event,'${escapeAttr(accountingBudgetEditor.budgetId)}','${escapeAttr(line.id)}',${line.version})"><strong>${escapeHtml(line.accountNumber)} · ${escapeHtml(line.accountName)}</strong><div class="acct-form-grid"><label>Annual amount<input name="annualAmount" type="number" step="0.01" value="${Number(line.annualAmount || 0) / 100}" required></label><label>Allocation<select name="allocationStrategy"><option value="even" ${line.allocationStrategy === 'even' ? 'selected' : ''}>Even monthly</option><option value="custom" ${line.allocationStrategy === 'custom' ? 'selected' : ''}>Custom</option></select></label></div><button class="acct-primary">Save line</button><span class="acct-form-status"></span></form>`).join('')}</section></div>` : ''}</div><div class="acct-card-grid">${data.items.map((budget) => `<article class="acct-budget-card"><div><span>Version ${budget.versionNumber}</span><h3>${escapeHtml(budget.name)}</h3><p>${escapeHtml(budget.description || 'Parish operating plan')}</p></div><span class="acct-status ${escapeAttr(budget.status)}">${escapeHtml(budget.status)}</span><div class="acct-row-actions"><button onclick="openAccountingBudgetVariance('${escapeAttr(budget.id)}')">Variance</button><button onclick="openAccountingCouncilPacket('${escapeAttr(budget.id)}')">Council packet</button>${budget.status === 'draft' ? `<button onclick="editAccountingBudgetLines('${escapeAttr(budget.id)}')">Edit lines</button><button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','submit',${budget.version})">Submit</button>` : ''}${budget.status === 'submitted' ? `<button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','approve',${budget.version})">Approve</button>` : ''}${budget.status === 'approved' ? `<button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','lock',${budget.version})">Lock</button>` : ''}</div></article>`).join('') || accountingEmpty('No budgets yet', 'Create the first operating budget and allocate it by account and fund.')}</div>`;
}

function setAccountingPayablesView(view) {
  accountingPayablesView = ['bills', 'recurring', 'payments', 'runs', '1099', 'vendors', 'aging'].includes(view)
    ? view
    : 'bills';
  renderAccountingPane();
}

function phaseDForm() {
  return document.getElementById('accountingPhaseDForm');
}

function openAccountingBillDetail(id) {
  const bill = accountingData.payables?.bills?.find((item) => item.id === id),
    holder = phaseDForm();
  if (!bill || !holder) return;
  holder.innerHTML = `<section class="acct-card"><div class="acct-list-head"><div><span class="acct-kicker">Bill detail</span><h2>${escapeHtml(bill.vendorInvoiceNumber || bill.billNumber)}</h2><p>${escapeHtml(bill.vendorName)} · ${accountingMoney(bill.totalAmount)}</p></div><button class="acct-link" onclick="phaseDForm().innerHTML=''">Close</button></div><div data-accounting-attachments></div></section>`;
  renderAccountingAttachments('bill', id, holder.querySelector('[data-accounting-attachments]'));
}

function showAccountingVendorForm(id = '') {
  const holder = phaseDForm();
  if (!holder) return;
  const vendor = id ? accountingData.payables.vendors.find((item) => item.id === id) : null;
  const expenseOptions = accountingData.accounts
    .filter((account) => ['expense', 'asset'].includes(account.category))
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const fundOptions = accountingData.funds
    .map(
      (fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="saveAccountingVendor(event,'${escapeAttr(vendor?.id || '')}',${Number(vendor?.version || 0)})"><div class="acct-list-head"><div><span class="acct-kicker">${vendor ? 'Edit vendor' : 'New vendor'}</span><h2>${vendor ? escapeHtml(vendor.displayName) : 'Add a payee'}</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Vendor name<input name="displayName" required value="${escapeAttr(vendor?.displayName || '')}"></label><label>Email<input name="email" type="email" value="${escapeAttr(vendor?.email || '')}"></label><label>Default expense or prepaid-asset account<select name="defaultExpenseAccountId"><option value="">None</option>${expenseOptions.replace(`value="${escapeAttr(vendor?.defaultExpenseAccountId || '')}"`, `value="${escapeAttr(vendor?.defaultExpenseAccountId || '')}" selected`)}</select></label><label>Default fund<select name="defaultFundId"><option value="">None</option>${fundOptions.replace(`value="${escapeAttr(vendor?.defaultFundId || '')}"`, `value="${escapeAttr(vendor?.defaultFundId || '')}" selected`)}</select></label></div><button class="acct-primary" type="submit">Save vendor</button><span class="acct-form-status"></span></form>`;
}

async function saveAccountingVendor(event, vendorId, expectedVersion) {
  event.preventDefault();
  const form = event.currentTarget,
    data = Object.fromEntries(new FormData(form));
  const response = await fetch(
    accountingApi(vendorId ? `/payables/vendors/${encodeURIComponent(vendorId)}` : '/payables/vendors'),
    {
      method: vendorId ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(vendorId ? { expectedVersion, patch: data } : data),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    form.querySelector('.acct-form-status').textContent = payload.message || payload.error || 'Unable to save vendor.';
    return;
  }
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

async function createAccountingVendor(event) {
  return saveAccountingVendor(event, '', 0);
}

function beginAccountingVendorLifecycle(id, action) {
  accountingVendorLifecycleConfirm = { id, action };
  accountingLifecycleMessage = null;
  renderAccountingPane();
}

async function changeAccountingVendorLifecycle(id, action, expectedVersion) {
  const response = await fetch(accountingApi(`/payables/vendors/${encodeURIComponent(id)}/${action}`), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    accountingVendorLifecycleConfirm = null;
    accountingLifecycleMessage = {
      type: 'vendor',
      id,
      text: payload.message || payload.error || 'Unable to update this vendor.',
    };
    renderAccountingPane();
    return;
  }
  accountingVendorLifecycleConfirm = null;
  accountingLifecycleMessage = null;
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

function applyAccountingBillVendorDefaults(vendorSelect) {
  const vendor = accountingData.payables?.vendors?.find((item) => item.id === vendorSelect.value);
  const form = vendorSelect.form;
  if (!vendor || !form) return;
  if (vendor.defaultExpenseAccountId && form.elements.accountId)
    form.elements.accountId.value = vendor.defaultExpenseAccountId;
  if (vendor.defaultFundId && form.elements.fundId) form.elements.fundId.value = vendor.defaultFundId;
  if (form.elements.name && !form.elements.name.value)
    form.elements.name.value = `${vendor.displayName} recurring bill`;
  if (form.elements.description && !form.elements.description.value)
    form.elements.description.value = `${vendor.displayName} bill`;
}

function showAccountingBillForm() {
  const holder = phaseDForm();
  if (!holder) return;
  const vendors = accountingData.payables.vendors
    .filter((vendor) => vendor.status === 'active')
    .map((vendor) => `<option value="${escapeAttr(vendor.id)}">${escapeHtml(vendor.displayName)}</option>`)
    .join('');
  const accounts = accountingData.accounts
    .filter((account) => ['expense', 'asset'].includes(account.category))
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const funds = accountingData.funds
    .map(
      (fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingBill(event)"><div class="acct-list-head"><div><span class="acct-kicker">Bill entry</span><h2>Record a vendor bill</h2><p>Selecting a vendor applies its saved account and fund defaults.</p></div><div class="acct-report-actions"><button type="button" class="acct-link" onclick="showAccountingRecurringBillForm()">Make recurring</button><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div></div><div class="acct-form-grid"><label>Vendor<select name="vendorId" required onchange="applyAccountingBillVendorDefaults(this)"><option value="">Choose vendor</option>${vendors}</select></label><label>Invoice number<input name="vendorInvoiceNumber"></label><label>Bill date<input name="billDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Description<input name="description" required></label><label>Expense or prepaid-asset account<select name="accountId" required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select name="fundId" required><option value="">Choose fund</option>${funds}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label></div><button class="acct-primary" type="submit">Save draft bill</button><span class="acct-form-status"></span></form>`;
}

async function createAccountingBill(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form));
  const data = {
    vendorId: raw.vendorId,
    vendorInvoiceNumber: raw.vendorInvoiceNumber,
    billDate: raw.billDate,
    description: raw.description,
    lines: [
      {
        description: raw.description,
        accountId: raw.accountId,
        fundId: raw.fundId,
        quantity: 1,
        unitAmount: Math.round(Number(raw.amount) * 100),
      },
    ],
  };
  await accountingPhaseDMutation('/payables/bills', data, 'Draft bill saved.');
}

function showAccountingRecurringBillForm() {
  const holder = phaseDForm();
  if (!holder) return;
  const vendors = accountingData.payables.vendors
    .filter((vendor) => vendor.status === 'active')
    .map((vendor) => `<option value="${escapeAttr(vendor.id)}">${escapeHtml(vendor.displayName)}</option>`)
    .join('');
  const accounts = accountingData.accounts
    .filter((account) => ['expense', 'asset'].includes(account.category))
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const funds = accountingData.funds
    .map(
      (fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="saveAccountingRecurringBill(event)"><div class="acct-list-head"><div><span class="acct-kicker">Recurring bill</span><h2>Create reviewable draft bills automatically</h2><p>The schedule creates drafts only. Approval, posting, and payment remain separate controls.</p></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Vendor<select name="vendorId" required onchange="applyAccountingBillVendorDefaults(this)"><option value="">Choose vendor</option>${vendors}</select></label><label>Schedule name<input name="name" required maxlength="120" placeholder="Monthly internet"></label><label>Description<input name="description" required maxlength="240" placeholder="Internet service"></label><label>Expense or prepaid-asset account<select name="accountId" required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select name="fundId" required><option value="">Choose fund</option>${funds}</select></label><label>Amount<input name="amountDollars" type="number" min="0.01" step="0.01" required></label><label>Frequency<select name="frequency"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly" selected>Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option></select></label><label>First bill date<input name="nextBillDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>End date <small>Optional</small><input name="endDate" type="date"></label></div><button class="acct-primary" type="submit">Start recurring bill</button><span class="acct-form-status"></span></form>`;
}

async function saveAccountingRecurringBill(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    status = form.querySelector('.acct-form-status');
  const amount = Math.round(Number(raw.amountDollars) * 100);
  const response = await fetch(accountingApi('/payables/recurring-bills'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...raw, amount }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to save this recurring bill.';
    return;
  }
  accountingData.payables = null;
  await loadAccountingPhaseD();
  accountingPayablesView = 'recurring';
  renderAccountingPane();
}

async function toggleAccountingRecurringBill(id, expectedVersion, status) {
  const response = await fetch(accountingApi(`/payables/recurring-bills/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, status }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(payload.message || payload.error || 'Unable to update this recurring bill.');
    return;
  }
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

function showAccountingPaymentForm() {
  const holder = phaseDForm();
  if (!holder) return;
  const bills = (accountingData.payables.bills || []).filter(
      (b) => ['posted', 'partially_paid'].includes(b.status) && Number(b.amountDue) > 0
    ),
    banks = accountingData.payables.bankAccounts || [];
  if (!bills.length || !banks.length) {
    holder.innerHTML = accountingEmpty(
      'Payment setup is incomplete',
      !banks.length
        ? 'Add an Accounting bank account before paying bills.'
        : 'Post an approved bill before creating a payment.'
    );
    return;
  }
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingPayment(event)"><div class="acct-list-head"><div><span class="acct-kicker">Bill payment</span><h2>Select bills and how they were paid</h2><p>Online payments are recorded and posted immediately. Checks retain the print-then-post workflow.</p></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Payment method<select name="paymentMethod" required onchange="syncAccountingPaymentMethod(this.form)"><option value="external">Online bill pay</option><option value="ach">ACH / bank transfer</option><option value="wire">Wire transfer</option><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="check">Printed check</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Paid from<select name="bankAccountId" required onchange="syncAccountingPaymentMethod(this.form)">${banks.map((b) => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)}${b.maskedLast4 ? ` · •••• ${escapeHtml(b.maskedLast4)}` : ''}</option>`).join('')}</select></label><label data-payment-reference>Confirmation / reference number<input name="referenceNumber" autocomplete="off" required placeholder="Receipt or confirmation number"></label><label data-payment-check hidden>Check number<input id="accountingCheckNumber" name="checkNumber" inputmode="numeric"></label><label>Payment date<input name="paymentDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Memo<input name="memo" placeholder="Optional payment memo"></label></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th></th><th>Vendor</th><th>Invoice</th><th>Due</th><th>Amount due</th><th>Pay now</th></tr></thead><tbody>${bills.map((b) => `<tr><td><input type="checkbox" data-payment-bill value="${escapeAttr(b.id)}" data-vendor="${escapeAttr(b.vendorId)}" onchange="syncAccountingPaymentSelection(this)"></td><td>${escapeHtml(b.vendorName)}</td><td>${escapeHtml(b.vendorInvoiceNumber || b.billNumber)}</td><td>${accountingDate(b.dueDate)}</td><td>${accountingMoney(b.amountDue)}</td><td><input data-payment-amount type="number" min="0.01" max="${(Number(b.amountDue) / 100).toFixed(2)}" step="0.01" value="${(Number(b.amountDue) / 100).toFixed(2)}" disabled></td></tr>`).join('')}</tbody></table></div><div class="acct-phase-form-foot"><strong id="accountingPaymentTotal">Total $0.00</strong><button class="acct-primary" data-payment-submit>Record online payment</button><span class="acct-form-status"></span></div></form>`;
  syncAccountingPaymentMethod(holder.querySelector('form'));
}

function syncAccountingPaymentMethod(form) {
  if (!form) return;
  const isCheck = form.elements.paymentMethod.value === 'check',
    checkField = form.querySelector('[data-payment-check]'),
    referenceField = form.querySelector('[data-payment-reference]'),
    checkInput = form.elements.checkNumber,
    referenceInput = form.elements.referenceNumber,
    submit = form.querySelector('[data-payment-submit]');
  checkField.hidden = !isCheck;
  referenceField.hidden = isCheck;
  checkInput.required = isCheck;
  referenceInput.required = !isCheck;
  submit.textContent = isCheck ? 'Create check' : 'Record payment';
  if (isCheck) loadNextAccountingCheckNumber(form.elements.bankAccountId.value);
}

async function loadNextAccountingCheckNumber(bankAccountId) {
  const res = await fetch(
      accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankAccountId)}`),
      { headers: authHeaders() }
    ),
    payload = await res.json().catch(() => ({}));
  if (res.ok && document.getElementById('accountingCheckNumber'))
    document.getElementById('accountingCheckNumber').value = payload.settings?.nextCheckNumber || '';
}

async function showAccountingCheckSettings() {
  const holder = phaseDForm(),
    banks = accountingData.payables.bankAccounts || [];
  if (!holder || !banks.length) {
    if (holder)
      holder.innerHTML = accountingEmpty(
        'No bank account is ready',
        'Add an Accounting bank account before configuring check stock.'
      );
    return;
  }
  holder.innerHTML = '<p class="sw-tool-loading">Loading check settings...</p>';
  const bankId = banks[0].id,
    res = await fetch(accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankId)}`), {
      headers: authHeaders(),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    holder.innerHTML = accountingEmpty(
      'Check settings are unavailable',
      payload.message || payload.error || 'Try again.'
    );
    return;
  }
  const s = payload.settings;
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="saveAccountingCheckSettings(event)"><input type="hidden" name="bankAccountId" value="${escapeAttr(bankId)}"><input type="hidden" name="expectedVersion" value="${Number(s.version)}"><div class="acct-list-head"><div><span class="acct-kicker">Check stock</span><h2>Printing settings</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Bank account<select name="bankAccountIdDisplay" disabled>${banks.map((b) => `<option ${b.id === bankId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}</select></label><label>Next check number<input name="nextCheckNumber" type="number" min="1" step="1" value="${Number(s.nextCheckNumber)}" required></label><label>Check stock style<select name="checkStyle"><option value="top_check_two_stubs" ${s.checkStyle === 'top_check_two_stubs' ? 'selected' : ''}>Top check + two stubs</option><option value="bottom_check_two_stubs" ${s.checkStyle === 'bottom_check_two_stubs' ? 'selected' : ''}>Two stubs + bottom check</option><option value="check_only" ${s.checkStyle === 'check_only' ? 'selected' : ''}>Check only</option></select></label><label>Payer name<input name="payerName" value="${escapeAttr(s.payerName || '')}" required></label><label class="acct-wide">Payer address<textarea name="payerAddress" rows="3" required>${escapeHtml(s.payerAddress || '')}</textarea></label><label>Primary signature line<input name="signatureLine1" value="${escapeAttr(s.signatureLine1 || 'Authorized signature')}"></label><label>Secondary signature line<input name="signatureLine2" value="${escapeAttr(s.signatureLine2 || '')}"></label></div><div class="acct-phase-form-foot"><button class="acct-primary">Save check settings</button><span class="acct-form-status"></span></div></form>`;
}

async function saveAccountingCheckSettings(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    res = await fetch(accountingApi('/payables/check-settings'), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankAccountId: raw.bankAccountId,
        expectedVersion: Number(raw.expectedVersion),
        patch: {
          nextCheckNumber: Number(raw.nextCheckNumber),
          checkStyle: raw.checkStyle,
          payerName: raw.payerName,
          payerAddress: raw.payerAddress,
          signatureLine1: raw.signatureLine1,
          signatureLine2: raw.signatureLine2,
        },
      }),
    }),
    payload = await res.json().catch(() => ({}));
  form.querySelector('.acct-form-status').textContent = res.ok
    ? 'Check settings saved.'
    : payload.message || payload.error || 'Unable to save check settings.';
}

function syncAccountingPaymentSelection(box) {
  const form = box.form,
    selected = Array.from(form.querySelectorAll('[data-payment-bill]:checked')),
    vendor = selected[0]?.dataset.vendor || '';
  form.querySelectorAll('[data-payment-bill]').forEach((input) => {
    input.disabled = Boolean(vendor && input.dataset.vendor !== vendor && !input.checked);
    input.closest('tr').querySelector('[data-payment-amount]').disabled = !input.checked;
  });
  const total = selected.reduce(
    (sum, input) => sum + Number(input.closest('tr').querySelector('[data-payment-amount]').value || 0),
    0
  );
  document.getElementById('accountingPaymentTotal').textContent =
    `Total ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}`;
}

async function createAccountingPayment(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    selected = Array.from(form.querySelectorAll('[data-payment-bill]:checked'));
  if (!selected.length) {
    form.querySelector('.acct-form-status').textContent = 'Select at least one bill.';
    return;
  }
  const applications = selected.map((input) => ({
      billId: input.value,
      amountApplied: Math.round(Number(input.closest('tr').querySelector('[data-payment-amount]').value) * 100),
    })),
    vendorId = selected[0].dataset.vendor,
    payload = await accountingPhaseDRequest('/payables/payments', {
      vendorId,
      bankAccountId: raw.bankAccountId,
      paymentDate: raw.paymentDate,
      paymentMethod: raw.paymentMethod,
      referenceNumber: raw.referenceNumber,
      checkNumber: raw.checkNumber,
      memo: raw.memo,
      applications,
    });
  if (!payload) return;
  if (raw.paymentMethod !== 'check') {
    const posted = await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(payload.payment.id)}/post`, {
      expectedVersion: payload.payment.version,
      idempotencyKey: `online-${payload.payment.id}-${payload.payment.version}`,
    });
    if (!posted) return;
  }
  accountingData.payables = null;
  await loadAccountingPhaseD();
  accountingPayablesView = 'payments';
  renderAccountingPane();
}

function showAccountingPaymentRunForm() {
  const holder = phaseDForm(),
    bills = (accountingData.payables.bills || []).filter(
      (b) => ['posted', 'partially_paid'].includes(b.status) && Number(b.amountDue) > 0
    ),
    banks = accountingData.payables.bankAccounts || [];
  if (!holder) return;
  if (!bills.length || !banks.length) {
    holder.innerHTML = accountingEmpty(
      'Payment-run setup is incomplete',
      !banks.length ? 'Add an Accounting bank account first.' : 'Post vendor bills before creating a payment run.'
    );
    return;
  }
  holder.innerHTML = `<form class="acct-phase-form acct-payment-run-builder" onsubmit="createAccountingPaymentRun(event)"><div class="acct-list-head"><div><span class="acct-kicker">Batch check run</span><h2>Select vendors and open bills</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Bank account<select name="bankAccountId" required onchange="syncAccountingPaymentRun(this.form)">${banks.map((bank) => `<option value="${escapeAttr(bank.id)}">${escapeHtml(bank.name)}</option>`).join('')}</select></label><label>Run date<input name="runDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Memo<input name="memo" placeholder="Month-end vendor checks"></label></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th></th><th>Vendor</th><th>Invoice</th><th>Due</th><th>Amount due</th><th>Pay now</th></tr></thead><tbody>${bills.map((bill) => `<tr><td><input type="checkbox" data-run-bill value="${escapeAttr(bill.id)}" data-vendor="${escapeAttr(bill.vendorId)}" onchange="syncAccountingPaymentRun(this.form)"></td><td><strong>${escapeHtml(bill.vendorName)}</strong></td><td>${escapeHtml(bill.vendorInvoiceNumber || bill.billNumber)}</td><td>${accountingDate(bill.dueDate)}</td><td>${accountingMoney(bill.amountDue)}</td><td><input data-run-amount type="number" min="0.01" max="${(Number(bill.amountDue) / 100).toFixed(2)}" step="0.01" value="${(Number(bill.amountDue) / 100).toFixed(2)}" disabled></td></tr>`).join('')}</tbody></table></div><section class="acct-run-review"><span class="acct-kicker">Review</span><strong data-run-range>Select bills to preview the reserved check range.</strong><small data-run-summary>No vendors selected.</small></section><div class="acct-phase-form-foot"><button class="acct-primary">Create reviewable draft</button><span class="acct-form-status"></span></div></form>`;
  syncAccountingPaymentRun(holder.querySelector('form'));
}

async function syncAccountingPaymentRun(form) {
  if (!form) return;
  const selected = Array.from(form.querySelectorAll('[data-run-bill]:checked'));
  form.querySelectorAll('[data-run-bill]').forEach((input) => {
    input.closest('tr').querySelector('[data-run-amount]').disabled = !input.checked;
  });
  const vendors = new Set(selected.map((input) => input.dataset.vendor)),
    total = selected.reduce(
      (sum, input) => sum + Number(input.closest('tr').querySelector('[data-run-amount]').value || 0),
      0
    ),
    summary = form.querySelector('[data-run-summary]'),
    range = form.querySelector('[data-run-range]');
  summary.textContent = `${vendors.size} vendor${vendors.size === 1 ? '' : 's'} · ${selected.length} bill${selected.length === 1 ? '' : 's'} · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}`;
  if (!vendors.size) {
    range.textContent = 'Select bills to preview the reserved check range.';
    return;
  }
  range.textContent = 'Loading check-number range…';
  const bankId = new FormData(form).get('bankAccountId'),
    res = await fetch(accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankId)}`), {
      headers: authHeaders(),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    range.textContent = payload.message || 'Check range unavailable.';
    return;
  }
  const start = Number(payload.settings.nextCheckNumber),
    end = start + vendors.size - 1;
  range.textContent = `Checks ${start}${end === start ? '' : `–${end}`} will be atomically reserved when this draft is created.`;
}

async function createAccountingPaymentRun(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    selected = Array.from(form.querySelectorAll('[data-run-bill]:checked'));
  if (!selected.length) {
    form.querySelector('.acct-form-status').textContent = 'Select at least one bill.';
    return;
  }
  const grouped = new Map();
  for (const input of selected) {
    const vendorId = input.dataset.vendor,
      applications = grouped.get(vendorId) || [];
    applications.push({
      billId: input.value,
      amountApplied: Math.round(Number(input.closest('tr').querySelector('[data-run-amount]').value) * 100),
    });
    grouped.set(vendorId, applications);
  }
  const selections = [...grouped].map(([vendorId, applications]) => ({ vendorId, applications })),
    payload = await accountingPhaseDRequest('/payables/payment-runs', {
      bankAccountId: raw.bankAccountId,
      runDate: raw.runDate,
      memo: raw.memo,
      selections,
    });
  if (payload) {
    accountingData.payables = null;
    await loadAccountingPhaseD();
    accountingPayablesView = 'runs';
    renderAccountingPane();
  }
}

async function postAccountingPaymentRun(id, version) {
  const payload = await accountingPhaseDRequest(`/payables/payment-runs/${encodeURIComponent(id)}/post`, {
    expectedVersion: version,
  });
  if (!payload) return;
  if (!payload.detail.complete) {
    const failed = (payload.detail.results || []).filter((item) => !item.ok);
    alert(
      `${failed.length} payment${failed.length === 1 ? '' : 's'} could not be posted. Earlier successful posts were retained; correct the remaining items and retry.`
    );
  }
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

async function printAccountingPaymentRun(id) {
  const reason = prompt('Reprint reason (leave blank for an original run):') || '';
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('Allow pop-ups to print the payment run.');
    return;
  }
  win.document.write('<p style="font:16px Arial;padding:32px">Preparing payment run…</p>');
  const payload = await accountingPhaseDRequest(`/payables/payment-runs/${encodeURIComponent(id)}/print`, { reason });
  if (!payload) {
    win.close();
    return;
  }
  win.document.open();
  win.document.write(payload.print.html);
  win.document.close();
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

async function loadAccounting1099Review() {
  const input = document.getElementById('accounting1099Year'),
    year = Number(input?.value || new Date().getUTCFullYear()),
    res = await fetch(accountingApi(`/payables/1099-summary?year=${encodeURIComponent(year)}`), {
      headers: authHeaders(),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to prepare 1099 review.');
    return;
  }
  accountingData.payables.tax1099 = payload.report;
  renderAccountingPane();
}

async function downloadAccounting1099Review() {
  const year =
      document.getElementById('accounting1099Year')?.value ||
      accountingData.payables.tax1099?.calendarYear ||
      new Date().getUTCFullYear(),
    res = await fetch(accountingApi(`/payables/1099-summary.csv?year=${encodeURIComponent(year)}`), {
      headers: authHeaders(),
    });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    alert(payload.message || payload.error || 'Unable to export 1099 review.');
    return;
  }
  const url = URL.createObjectURL(await res.blob()),
    link = document.createElement('a');
  link.href = url;
  link.download = `agapay-1099-review-${year}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function accountingPhaseDRequest(path, body) {
  const res = await fetch(accountingApi(path), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = document.querySelector('.acct-form-status');
    if (status) status.textContent = payload.message || payload.error;
    else alert(payload.message || payload.error);
    return null;
  }
  return payload;
}

async function printAccountingCheck(id, printCount) {
  const reason = printCount ? prompt('Reason for reprinting this check:') : '';
  if (printCount && !reason) return;
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('Allow pop-ups to print checks.');
    return;
  }
  win.document.write('<p style="font:16px Arial;padding:32px">Preparing check…</p>');
  const payload = await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/print`, { reason });
  if (!payload) {
    win.close();
    return;
  }
  win.document.open();
  win.document.write(payload.html);
  win.document.close();
  accountingData.payables = null;
  await loadAccountingPhaseD();
}

async function postAccountingPayment(id, version) {
  if (
    await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/post`, {
      expectedVersion: version,
      idempotencyKey: `check-${id}-${version}`,
    })
  ) {
    accountingData.payables = null;
    await loadAccountingPhaseD();
  }
}

async function voidAccountingPayment(id, version) {
  const reason = prompt('Reason for voiding this payment:');
  if (!reason) return;
  if (
    await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/void`, {
      expectedVersion: version,
      reason,
    })
  ) {
    accountingData.payables = null;
    await loadAccountingPhaseD();
  }
}

async function accountingBillAction(id, action, version) {
  const body = { expectedVersion: version };
  if (action === 'post') body.idempotencyKey = `parish-ui-${id}-${version}`;
  await accountingPhaseDMutation(`/payables/bills/${encodeURIComponent(id)}/${action}`, body, `Bill ${action}ed.`);
}

function showAccountingBudgetForm() {
  const holder = phaseDForm();
  if (!holder) return;
  holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingBudget(event)"><div class="acct-list-head"><div><span class="acct-kicker">Budget builder</span><h2>Create a budget version</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Budget name<input name="name" required placeholder="2027 Operating Budget"></label><label>Description<input name="description" placeholder="Parish council operating plan"></label></div><div class="acct-journal-lines-head"><span>Budget lines</span><span>Annual amounts are allocated evenly across twelve months.</span></div><div id="accountingBudgetDraftLines">${accountingBudgetLineTemplate()}</div><button type="button" class="acct-add-line" onclick="addAccountingBudgetLine()">+ Add budget line</button><div class="acct-phase-form-foot"><button class="acct-primary" type="submit">Create draft budget</button><span class="acct-form-status"></span></div></form>`;
}

function accountingBudgetLineTemplate() {
  const accounts = accountingData.accounts
    .filter((account) => ['revenue', 'expense'].includes(account.category))
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const funds = accountingData.funds
    .map(
      (fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  return `<div class="acct-budget-line"><label>Account<select data-budget-account required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select data-budget-fund required><option value="">Choose fund</option>${funds}</select></label><label>Annual amount<input data-budget-amount type="number" min="0" step="0.01" required></label><button type="button" class="acct-remove-line" onclick="this.closest('.acct-budget-line').remove()">×</button></div>`;
}

function addAccountingBudgetLine() {
  document
    .getElementById('accountingBudgetDraftLines')
    ?.insertAdjacentHTML('beforeend', accountingBudgetLineTemplate());
}

async function createAccountingBudget(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form));
  const start = accountingData.setup?.currentFiscalYear?.startDate || `${new Date().getFullYear()}-01-01`;
  const lines = Array.from(form.querySelectorAll('.acct-budget-line')).map((row) => ({
    accountId: row.querySelector('[data-budget-account]').value,
    fundId: row.querySelector('[data-budget-fund]').value,
    annualAmount: Math.round(Number(row.querySelector('[data-budget-amount]').value) * 100),
    allocationStrategy: 'even_monthly',
  }));
  await accountingPhaseDMutation(
    '/budgets',
    { name: raw.name, description: raw.description, fiscalYearId: `fy_${start.slice(0, 4)}`, lines },
    'Draft budget created.'
  );
}

async function accountingBudgetAction(id, action, version) {
  await accountingPhaseDMutation(
    `/budgets/${encodeURIComponent(id)}/${action}`,
    { expectedVersion: version },
    `Budget ${action}ed.`
  );
}

async function editAccountingBudgetLines(budgetId) {
  const [res, comparisonRes] = await Promise.all([
      fetch(accountingApi(`/budgets/${encodeURIComponent(budgetId)}`), { headers: authHeaders() }),
      fetch(accountingApi(`/budgets/${encodeURIComponent(budgetId)}/pledge-comparison`), { headers: authHeaders() }),
    ]),
    payload = await res.json().catch(() => ({})),
    comparisonPayload = await comparisonRes.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error);
    return;
  }
  accountingBudgetEditor = {
    budgetId,
    lines: payload.detail?.lines || [],
    pledgeComparison: comparisonRes.ok ? comparisonPayload.comparison : { accountId: null },
  };
  renderAccountingPane();
}

async function updateAccountingBudgetLine(event, budgetId, lineId, expectedVersion) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    input = { annualAmount: Math.round(Number(raw.annualAmount) * 100), allocationStrategy: raw.allocationStrategy };
  const res = await fetch(
      accountingApi(`/budgets/${encodeURIComponent(budgetId)}/lines/${encodeURIComponent(lineId)}`),
      {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion, input }),
      }
    ),
    payload = await res.json().catch(() => ({}));
  form.querySelector('.acct-form-status').textContent = res.ok
    ? 'Budget line saved.'
    : payload.message || payload.error || 'Unable to save budget line.';
  if (res.ok) await editAccountingBudgetLines(budgetId);
}

async function openAccountingBudgetVariance(id) {
  const res = await fetch(accountingApi(`/budgets/${encodeURIComponent(id)}/variance`), { headers: authHeaders() });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to prepare budget variance.');
    return;
  }
  accountingBudgetReport = payload.report;
  renderAccountingPane();
}

function closeAccountingBudgetReport() {
  accountingBudgetReport = null;
  renderAccountingPane();
}

function downloadAccountingBudgetVariance(id) {
  downloadAccountingFile(
    accountingApi(`/budgets/${encodeURIComponent(id)}/variance.csv`),
    'agapay-budget-variance.csv'
  );
}

async function openAccountingCouncilPacket(id) {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('Allow pop-ups for AGAPAY to open the council packet.');
    return;
  }
  const res = await fetch(accountingApi(`/budgets/${encodeURIComponent(id)}/council-packet`), {
    headers: authHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    win.close();
    alert(payload.message || payload.error || 'Unable to prepare the council packet.');
    return;
  }
  const packet = payload.packet || {},
    rows = [...(packet.revenue || []), ...(packet.expenses || [])];
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(packet.title || 'Parish Council Budget Packet')}</title><style>body{margin:40px;color:#061522;font:13px Arial,sans-serif}h1{font:32px Georgia,serif}h2{margin-top:28px;font:22px Georgia,serif}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #d9d5ca;text-align:left}button{padding:8px 12px}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(packet.title || 'Parish Council Budget Packet')}</h1><p>Generated ${accountingDate(packet.generatedAt)}</p><button onclick="print()">Print packet</button><h2>Executive summary</h2><p>Budget ${accountingMoney(packet.executiveSummary?.budget)} · Actual ${accountingMoney(packet.executiveSummary?.actual)} · Variance ${accountingMoney(packet.executiveSummary?.variance)}</p><h2>Budget detail</h2><table><thead><tr><th>Account</th><th>Budget</th><th>Actual</th><th>Variance</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.accountNumber)} ${escapeHtml(row.account)}</td><td>${accountingMoney(row.budget)}</td><td>${accountingMoney(row.actual)}</td><td>${accountingMoney(row.variance)}</td></tr>`).join('')}</tbody></table></body></html>`
  );
  win.document.close();
  win.focus();
}

async function accountingPhaseDMutation(path, body, success) {
  const res = await fetch(accountingApi(path), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = document.querySelector('.acct-form-status');
    if (status) status.textContent = payload.message || payload.error || 'Unable to save.';
    else alert(payload.message || payload.error || 'Unable to save.');
    return;
  }
  accountingData.payables = null;
  accountingData.budgets = null;
  accountingBudgetReport = null;
  await loadAccountingPhaseD();
}
