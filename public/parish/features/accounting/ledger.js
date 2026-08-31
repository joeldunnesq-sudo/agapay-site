'use strict';

// Parish dashboard accounting: ledger.
// Classic script; preserve global names used by the dashboard and inline actions.

async function submitAccountingRegisterEntry(event, kind) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    button = form.querySelector('button[type="submit"],button.acct-primary');
  const data = Object.fromEntries(new FormData(form));
  const register = accountingRegisterModel(),
    registerAccountId = register.configuration?.id || register.account.id || '';
  const payment = Math.round(Number(data.payment || 0) * 100),
    deposit = Math.round(Number(data.deposit || 0) * 100);
  const amount = kind === 'contribution' ? deposit : payment || deposit;
  if (
    !registerAccountId ||
    !data.offsetAccountId ||
    !data.fundId ||
    !data.entryDate ||
    !data.payee ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    (kind === 'transaction' && payment > 0 && deposit > 0)
  ) {
    status.textContent =
      kind === 'contribution'
        ? 'Complete every required field and enter a contribution amount.'
        : 'Complete every required field and enter either a payment or a deposit.';
    status.className = 'acct-form-status error';
    return;
  }
  const detail = [data.payee, data.comment, data.reference ? `Ref ${data.reference}` : ''].filter(Boolean).join(' · ');
  const lines =
    kind === 'contribution' || deposit > 0
      ? [
          { accountId: registerAccountId, fundId: data.fundId, description: detail, debitAmount: amount },
          { accountId: data.offsetAccountId, fundId: data.fundId, description: detail, creditAmount: amount },
        ]
      : [
          { accountId: data.offsetAccountId, fundId: data.fundId, description: detail, debitAmount: amount },
          { accountId: registerAccountId, fundId: data.fundId, description: detail, creditAmount: amount },
        ];
  button.disabled = true;
  status.className = 'acct-form-status';
  status.textContent = 'Creating the balanced entry…';
  try {
    const createResponse = await fetch(accountingApi('/journals'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryDate: data.entryDate,
        description: detail,
        sourceType: kind === 'contribution' ? 'manual_register_contribution' : 'manual_register_transaction',
        lines,
      }),
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) throw new Error(created.message || created.error || 'Unable to create this transaction.');
    const validationResponse = await fetch(
      accountingApi(`/journals/${encodeURIComponent(created.entry.id)}/validate`),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: created.entry.version }),
      }
    );
    const validation = await validationResponse.json().catch(() => ({}));
    if (!validationResponse.ok || !validation.validation?.ok)
      throw new Error(
        (validation.validation?.issues || [validation.message || 'The entry could not be validated.'])
          .join(' · ')
          .replaceAll('_', ' ')
      );
    status.textContent = 'Posting to the ledger…';
    const key = `register-ui-${created.entry.id}-${created.entry.version}`;
    const postResponse = await fetch(accountingApi(`/journals/${encodeURIComponent(created.entry.id)}/post`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: created.entry.version, idempotencyKey: key, requestHash: key }),
    });
    const posted = await postResponse.json().catch(() => ({}));
    if (!postResponse.ok) throw new Error(posted.message || posted.error || 'Unable to post this transaction.');
    await loadAccountingTab(true);
  } catch (error) {
    status.textContent = error.message || 'Unable to post this transaction.';
    status.className = 'acct-form-status error';
    button.disabled = false;
  }
}

function editAccountingRecurring(id) {
  accountingRecurringEditor = (accountingData.recurring || []).find((item) => item.id === id) || null;
  renderAccountingPane();
}

async function saveAccountingRecurring(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status'),
    body = Object.fromEntries(new FormData(form));
  body.amount = Math.round(Number(body.amountDollars || 0) * 100);
  delete body.amountDollars;
  if (accountingRecurringEditor?.id) body.expectedVersion = accountingRecurringEditor.version;
  status.textContent = 'Saving schedule…';
  const response = await fetch(
      accountingApi(
        accountingRecurringEditor?.id
          ? `/recurring-transactions/${encodeURIComponent(accountingRecurringEditor.id)}`
          : '/recurring-transactions'
      ),
      {
        method: accountingRecurringEditor?.id ? 'PATCH' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    ),
    payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = payload.message || payload.error || 'Unable to save this recurring expense.';
    status.className = 'acct-form-status error';
    return;
  }
  accountingRecurringEditor = null;
  await loadAccountingTab(true);
}

async function toggleAccountingRecurring(id, expectedVersion, status) {
  const response = await fetch(accountingApi(`/recurring-transactions/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, status }),
    }),
    payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(payload.message || payload.error || 'Unable to update this recurring expense.');
    return;
  }
  await loadAccountingTab(true);
}

function journalLineTemplate(line = {}) {
  const accountOptions = accountingData.accounts
    .map(
      (account) =>
        `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}" ${line.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`
    )
    .join('');
  const fundOptions = accountingData.funds
    .map(
      (fund) =>
        `<option value="${escapeAttr(fund.id)}" ${line.fundId === fund.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`
    )
    .join('');
  return `<div class="acct-journal-line"><label>Account<select data-journal-account><option value="">Choose account</option>${accountOptions}</select></label><label>Fund<select data-journal-fund><option value="">Choose fund</option>${fundOptions}</select></label><label>Debit<input data-journal-debit inputmode="decimal" type="number" min="0" step="0.01" value="${line.debitAmount ? (line.debitAmount / 100).toFixed(2) : ''}" placeholder="0.00"></label><label>Credit<input data-journal-credit inputmode="decimal" type="number" min="0" step="0.01" value="${line.creditAmount ? (line.creditAmount / 100).toFixed(2) : ''}" placeholder="0.00"></label><button type="button" class="acct-remove-line" onclick="removeAccountingJournalLine(this)" aria-label="Remove line">×</button></div>`;
}

function renderAccountingJournalEditor(pane = document.getElementById('accountingPane')) {
  if (!pane || !accountingJournalEditor) return;
  const draft = accountingJournalEditor;
  pane.innerHTML = `<section class="acct-journal-editor"><div class="acct-list-head"><div><span class="acct-kicker">${draft.id ? 'Draft journal entry' : 'New journal entry'}</span><h2>${draft.id ? escapeHtml(draft.description || 'Untitled draft') : 'Record a balanced entry'}</h2></div><button type="button" class="acct-refresh" onclick="closeAccountingJournal()">Back to entries</button></div><div class="acct-journal-meta"><label>Entry date<input id="accountingJournalDate" type="date" value="${escapeAttr(draft.entryDate)}"></label><label>Description<input id="accountingJournalDescription" type="text" maxlength="240" value="${escapeAttr(draft.description || '')}" placeholder="Describe the transaction"></label></div><div class="acct-journal-lines-head"><span>Lines</span><span>Every debit must be matched by a credit.</span></div><div id="accountingJournalLines">${draft.lines.map(journalLineTemplate).join('')}</div><button type="button" class="acct-add-line" onclick="addAccountingJournalLine()">+ Add line</button><div class="acct-journal-foot"><div id="accountingJournalBalance" class="acct-balance"></div><div id="accountingJournalValidation" class="acct-validation"></div><div class="acct-journal-actions"><button type="button" class="acct-refresh" onclick="saveAccountingJournal(false)">Save draft</button><button type="button" class="acct-primary" onclick="saveAccountingJournal(true)">Validate entry</button></div></div></section>${draft.id ? '<section class="acct-card"><div data-accounting-attachments></div></section>' : ''}`;
  updateAccountingJournalBalance();
  pane.querySelectorAll('.acct-journal-line').forEach(bindAccountingJournalLine);
  if (draft.id)
    renderAccountingAttachments('journal_entry', draft.id, pane.querySelector('[data-accounting-attachments]'));
}

function bindAccountingJournalLine(row) {
  row
    .querySelectorAll('[data-journal-debit],[data-journal-credit]')
    .forEach((input) => input.addEventListener('input', updateAccountingJournalBalance));
  row.querySelector('[data-journal-account]')?.addEventListener('change', (event) => {
    const defaultFundId = event.target.selectedOptions[0]?.dataset.defaultFund || '';
    const fundSelect = row.querySelector('[data-journal-fund]');
    if (defaultFundId && fundSelect) fundSelect.value = defaultFundId;
  });
}

function newAccountingJournal() {
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  accountingJournalEditor = {
    id: '',
    version: 0,
    entryDate: new Date().toISOString().slice(0, 10),
    description: '',
    lines: [{ fundId: defaultFund?.id || '' }, { fundId: defaultFund?.id || '' }],
  };
  renderAccountingPane();
}

async function editAccountingJournal(id) {
  const res = await fetch(accountingApi(`/journals/${encodeURIComponent(id)}`), { headers: authHeaders() });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to open this draft.');
    return;
  }
  accountingJournalEditor = payload.entry;
  renderAccountingPane();
}

function closeAccountingJournal() {
  accountingJournalEditor = null;
  renderAccountingPane();
}

function addAccountingJournalLine() {
  const holder = document.getElementById('accountingJournalLines');
  const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
  if (holder) holder.insertAdjacentHTML('beforeend', journalLineTemplate({ fundId: defaultFund?.id || '' }));
  const row = holder?.lastElementChild;
  if (row) bindAccountingJournalLine(row);
  updateAccountingJournalBalance();
}

function removeAccountingJournalLine(button) {
  button.closest('.acct-journal-line')?.remove();
  updateAccountingJournalBalance();
}

function collectAccountingJournal() {
  const cents = (value) => Math.round(Number(value || 0) * 100);
  const lines = Array.from(document.querySelectorAll('.acct-journal-line')).map((row) => ({
    accountId: row.querySelector('[data-journal-account]').value,
    fundId: row.querySelector('[data-journal-fund]').value,
    debitAmount: cents(row.querySelector('[data-journal-debit]').value),
    creditAmount: cents(row.querySelector('[data-journal-credit]').value),
  }));
  return {
    entryDate: document.getElementById('accountingJournalDate').value,
    description: document.getElementById('accountingJournalDescription').value.trim(),
    lines,
  };
}

function updateAccountingJournalBalance() {
  const balance = document.getElementById('accountingJournalBalance');
  if (!balance) return;
  const data = collectAccountingJournal();
  const debits = data.lines.reduce((sum, line) => sum + line.debitAmount, 0),
    credits = data.lines.reduce((sum, line) => sum + line.creditAmount, 0);
  balance.classList.toggle('balanced', debits > 0 && debits === credits);
  balance.innerHTML = `<span>Debits <strong>${accountingMoney(debits)}</strong></span><span>Credits <strong>${accountingMoney(credits)}</strong></span><span>${debits > 0 && debits === credits ? 'Balanced ✓' : `Difference ${accountingMoney(Math.abs(debits - credits))}`}</span>`;
}

async function saveAccountingJournal(validateAfter = false) {
  const data = collectAccountingJournal();
  const validation = document.getElementById('accountingJournalValidation');
  if (
    !data.entryDate ||
    !data.description ||
    data.lines.length < 2 ||
    data.lines.some((line) => !line.accountId || !line.fundId || line.debitAmount > 0 === line.creditAmount > 0)
  ) {
    validation.innerHTML =
      '<span class="error">Complete the date, description, and at least two debit or credit lines.</span>';
    return;
  }
  const editing = Boolean(accountingJournalEditor.id);
  const res = await fetch(
    accountingApi(editing ? `/journals/${encodeURIComponent(accountingJournalEditor.id)}` : '/journals'),
    {
      method: editing ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(
        editing ? { ...data, expectedVersion: accountingJournalEditor.version } : { ...data, sourceType: 'manual' }
      ),
    }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    validation.innerHTML = `<span class="error">${escapeHtml(payload.message || payload.error || 'Unable to save this draft.')}</span>`;
    return;
  }
  accountingJournalEditor = { ...accountingJournalEditor, ...payload.entry, ...data };
  if (!validateAfter) {
    validation.innerHTML = '<span class="success">Draft saved.</span>';
    return;
  }
  await validateAccountingJournal();
}

async function validateAccountingJournal() {
  const draft = accountingJournalEditor;
  const res = await fetch(accountingApi(`/journals/${encodeURIComponent(draft.id)}/validate`), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: draft.version }),
  });
  const payload = await res.json().catch(() => ({}));
  const box = document.getElementById('accountingJournalValidation');
  if (!res.ok || !payload.validation?.ok) {
    const issues = payload.validation?.issues || [payload.message || 'Entry is not ready to post.'];
    box.innerHTML = `<span class="error">${issues.map((issue) => escapeHtml(String(issue).replaceAll('_', ' '))).join(' · ')}</span>`;
    return;
  }
  box.innerHTML =
    '<span class="success">Balanced and ready to post.</span><button type="button" class="acct-post" onclick="postAccountingJournal()">Post to ledger</button>';
}

async function postAccountingJournal() {
  const draft = accountingJournalEditor;
  const key = `parish-ui-${draft.id}-${draft.version}`;
  const res = await fetch(accountingApi(`/journals/${encodeURIComponent(draft.id)}/post`), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: draft.version, idempotencyKey: key, requestHash: key }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    document.getElementById('accountingJournalValidation').innerHTML =
      `<span class="error">${escapeHtml(payload.message || payload.error || 'Unable to post this entry.')}</span>`;
    return;
  }
  accountingJournalEditor = null;
  await loadAccountingTab(true);
  accountingView = 'journals';
  renderAccountingPane();
}

async function reverseAccountingJournal(id) {
  const reason = prompt('Reason for reversing this journal entry:');
  if (!reason) return;
  const entryDate = prompt('Reversal date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!entryDate) return;
  const key = `journal-reversal-ui-${id}-${Date.now()}`,
    res = await fetch(accountingApi(`/journals/${encodeURIComponent(id)}/reverse`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryDate, reason, idempotencyKey: key, requestHash: key }),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to reverse journal entry.');
    return;
  }
  await loadAccountingTab(true);
}

async function voidAccountingJournal(id) {
  const reason = prompt('Reason for voiding this journal draft:');
  if (!reason) return;
  const res = await fetch(accountingApi(`/journals/${encodeURIComponent(id)}/void`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
    payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to void journal draft.');
    return;
  }
  await loadAccountingTab(true);
}

async function initializeAccounting() {
  const res = await fetch(accountingApi('/ledger/initialize'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(payload.message || payload.error || 'Unable to initialize Accounting.');
    return;
  }
  loadAccountingTab(true);
}

async function validateAccountingLedgerFoundation() {
  const res = await fetch(accountingApi('/ledger/validate'), { headers: authHeaders() }),
    payload = await res.json().catch(() => ({})),
    box = document.getElementById('accountingLedgerValidation');
  if (!box) return;
  box.innerHTML = res.ok
    ? `<div><strong>${payload.validation?.ok ? 'Healthy' : 'Review needed'}</strong><span>${(payload.validation?.issues || []).map((issue) => escapeHtml(issue.replaceAll('_', ' '))).join(' · ') || 'All foundation checks passed.'}</span></div>`
    : `<div><strong>Validation failed</strong><span>${escapeHtml(payload.message || payload.error || 'Unable to validate ledger.')}</span></div>`;
}

async function postAccountingOpeningBalances(event) {
  event.preventDefault();
  const form = event.currentTarget,
    raw = Object.fromEntries(new FormData(form)),
    amount = Math.round(Number(raw.amount) * 100),
    key = `opening-ui-${raw.effectiveDate}-${Date.now()}`,
    body = {
      effectiveDate: raw.effectiveDate,
      description: raw.description,
      idempotencyKey: key,
      requestHash: key,
      lines: [
        { accountId: raw.debitAccountId, fundId: raw.fundId, debitAmount: amount },
        { accountId: raw.creditAccountId, fundId: raw.fundId, creditAmount: amount },
      ],
    },
    res = await fetch(accountingApi('/ledger/opening-balances'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    payload = await res.json().catch(() => ({}));
  form.querySelector('.acct-form-status').textContent = res.ok
    ? 'Opening balances posted.'
    : payload.message || payload.error || 'Unable to post opening balances.';
  if (res.ok) await loadAccountingTab(true);
}
