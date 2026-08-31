'use strict';

// Parish dashboard accounting: accounting.
// Classic script; preserve global names used by the dashboard and inline actions.

let accountingView = 'overview';

let accountingReportView = 'library';

let accountingCustomReport = null;

let accountingDepthComparative = true;

let accountingData = {
  setup: null,
  journals: [],
  ledger: [],
  reports: {},
  accounts: [],
  accountCatalog: [],
  funds: [],
  bankAccounts: [],
  payables: null,
  budgets: null,
  banking: null,
  integrations: null,
  close: null,
  adjustments: null,
  governance: null,
  tier: '',
};

let accountingBankPreview = null;

let accountingFundCatalog = null;

let accountingShowInactiveFunds = false;

let accountingFundAccountSections = new Set(['net_asset']);

let accountingExpenseAccountEditor = null;

let accountingVendorLifecycleConfirm = null;

let accountingAccountLifecycleConfirm = null;

let accountingLifecycleMessage = null;

let accountingReconciliationView = 'giving';

let accountingCloseDetail = null;

let accountingJournalEditor = null;

let accountingLedgerNewestFirst = false;

let accountingLedgerAccountNumber = '';

let accountingLedgerSearch = '';

let accountingRegisterEntryMode = 'transaction';

let accountingRecurringEditor = null;

let accountingPayablesView = 'bills';

let accountingBudgetReport = null;

let accountingBudgetEditor = null;

let accountingMigration = { active: false, session: null, sessions: [], step: 'source', previews: {}, advanced: false };

let accountingExperienceMode = 'treasurer';

let accountingAdvancedNavExpanded = false;

let accountingSimpleIncomeMessage = '';

let accountingSimpleEntryMode = 'income';

let accountingInKindGiftMessage = '';

try {
  if (sessionStorage.getItem('agapay.accountingExperienceMode') === 'accountant')
    accountingExperienceMode = 'accountant';
} catch {}

const ACCOUNTING_SIMPLE_REVENUE_LABELS = Object.freeze({
  acct_4000: 'Stewardship & Tithes',
  acct_4010: 'General Donations',
  acct_4030: 'Candle Offerings',
  acct_4040: 'Commemorations',
  acct_4300: 'Bookstore Sales',
});

function accountingAccessApi(path = '') {
  return currentParish?.parishId
    ? `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/accounting-access${path}`
    : '';
}

async function accountingAccessRequest(path, body) {
  const response = await fetch(accountingAccessApi(path), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to update Accounting access.');
  return payload;
}

async function renderAccountingAccess(message = '') {
  const pane = document.getElementById('accountingPane');
  if (!pane) return;
  try {
    const response = await fetch(accountingAccessApi('/profiles'), { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The parish session has expired.');
    if (payload.accounting && !payload.accounting.ready) {
      renderAccountingReadiness(payload.accounting, pane);
      return;
    }
    const profiles = payload.profiles || [];
    pane.innerHTML = profiles.length
      ? `<section class="acct-access-card"><span class="acct-kicker">Protected financial workspace</span><h2>Who is using Accounting?</h2><p>Select your named profile and enter your six-digit PIN. This lets AGAPAY preserve a reliable audit trail without changing the parish’s main login.</p>${message ? `<div class="acct-access-message">${escapeHtml(message)}</div>` : ''}<form onsubmit="verifyAccountingStaff(event)"><label>Staff profile<select name="profileId" required>${profiles.map((profile) => `<option value="${escapeAttr(profile.id)}">${escapeHtml(profile.displayName)} · ${escapeHtml(profile.roleTemplate.replaceAll('_', ' '))}</option>`).join('')}</select></label><label>Accounting PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required placeholder="Six digits"></label><button class="acct-primary">Open Accounting</button><span class="acct-form-status"></span></form></section>`
      : `<section class="acct-access-card"><span class="acct-kicker">Accounting activation</span><h2>Create the first financial administrator</h2><p>The parish login remains unchanged. This named profile identifies the person working in Accounting and protects approvals, checks, and close activity with a separate six-digit PIN.</p>${message ? `<div class="acct-access-message">${escapeHtml(message)}</div>` : ''}<form onsubmit="bootstrapAccountingStaff(event)"><label>Your name<input name="displayName" maxlength="120" required autocomplete="name" placeholder="e.g. Photini Argyris"></label><label>Responsibility<select name="roleTemplate"><option value="treasurer">Treasurer</option><option value="rector">Rector</option><option value="bookkeeper">Bookkeeper</option></select></label><label>Create a six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="Six digits"></label><button class="acct-primary">Activate Accounting access</button><span class="acct-form-status"></span></form></section>`;
  } catch (error) {
    pane.innerHTML = accountingEmpty('Accounting access needs attention', error.message);
  }
}

async function bootstrapAccountingStaff(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  status.textContent = 'Creating profile…';
  try {
    const raw = Object.fromEntries(new FormData(form));
    await accountingAccessRequest('/bootstrap', raw);
    await renderAccountingAccess('Profile created. Enter your new PIN to continue.');
  } catch (error) {
    status.textContent = error.message;
  }
}

async function verifyAccountingStaff(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  status.textContent = 'Verifying…';
  try {
    const payload = await accountingAccessRequest('/verify', Object.fromEntries(new FormData(form)));
    sessionStorage.setItem(
      accountingStaffSessionKey(),
      JSON.stringify({ token: payload.token, expiresAt: payload.expiresAt, profile: payload.profile })
    );
    const pane = document.getElementById('accountingPane');
    if (pane) pane.dataset.loaded = 'false';
    await loadAccountingTab(true);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function addAccountingStaff(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  status.textContent = 'Adding profile…';
  try {
    await accountingAccessRequest('/profiles', Object.fromEntries(new FormData(form)));
    form.reset();
    status.textContent = 'Staff profile added.';
  } catch (error) {
    status.textContent = error.message;
  }
}

async function changeAccountingPin(event) {
  event.preventDefault();
  const form = event.currentTarget,
    status = form.querySelector('.acct-form-status');
  try {
    await accountingAccessRequest('/pin', Object.fromEntries(new FormData(form)));
    form.reset();
    status.textContent = 'Your Accounting PIN has been changed.';
  } catch (error) {
    status.textContent = error.message;
  }
}

async function lockAccountingWorkspace() {
  const session = accountingStaffSession();
  if (session) await accountingAccessRequest('/logout', { profileId: session.profile.id }).catch(() => {});
  sessionStorage.removeItem(accountingStaffSessionKey());
  await renderAccountingAccess('Accounting has been locked.');
}

function accountingApi(path = '') {
  return currentParish?.parishId
    ? `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/accounting${path}`
    : '';
}

function accountingMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isInteger(number) ? number / 100 : number
  );
}

function accountingDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString();
}

function accountingEmpty(title, copy) {
  return `<div class="acct-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
}

window.ParishFeatureRegistry.register('accounting', {
  load: loadAccountingTab,
  refresh: () => loadAccountingTab(true),
});
