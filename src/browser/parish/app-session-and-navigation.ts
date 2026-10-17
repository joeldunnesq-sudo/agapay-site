import type {
  ParishAppIdentity,
  ParishAppFeatureRequest,
  ParishAppPayload,
  ParishAppError,
  ParishAppStewardshipFeature,
} from './app-contracts.js';
import type { ParishAppBindings } from './app.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyParishSession<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

declare let editableFunds: ParishAppBindings['editableFunds'];
declare let editableCampaigns: ParishAppBindings['editableCampaigns'];
declare let editableFeastCampaigns: ParishAppBindings['editableFeastCampaigns'];
declare const parishSessionStorageKey: ParishAppBindings['parishSessionStorageKey'];
declare const legacyParishTokenStorageKey: ParishAppBindings['legacyParishTokenStorageKey'];
declare const identitySessionStorageKey: ParishAppBindings['identitySessionStorageKey'];
declare const identityEmailStorageKey: ParishAppBindings['identityEmailStorageKey'];
declare const setStatus: ParishAppBindings['setStatus'];
declare let activeTab: ParishAppBindings['activeTab'];
declare let currentParish: ParishAppBindings['currentParish'];
declare const moduleIncluded: ParishAppBindings['moduleIncluded'];
declare let activeParishFeatureRequest: ParishAppBindings['activeParishFeatureRequest'];
declare const authHeaders: ParishAppBindings['authHeaders'];
declare const escapeHtml: ParishAppBindings['escapeHtml'];
declare const starterLockedFeatures: ParishAppBindings['starterLockedFeatures'];

function givingCatalogSnapshot() {
  return JSON.stringify({
    funds: editableFunds,
    campaigns: editableCampaigns,
    feastCampaigns: editableFeastCampaigns,
  });
}

function accountingCatalogSnapshot() {
  return JSON.stringify({
    funds: editableFunds,
    campaigns: editableCampaigns,
  });
}

function saveSession() {
  try {
    sessionStorage.setItem(
      'agapay_parish_id',
      (document.getElementById('parishId') as HTMLInputElement | null)!.value.trim()
    );
    sessionStorage.setItem(
      parishSessionStorageKey,
      (document.getElementById('parishToken') as HTMLInputElement | null)!.value.trim()
    );
    sessionStorage.removeItem(legacyParishTokenStorageKey);
  } catch {}
}

function logoutParish() {
  try {
    sessionStorage.removeItem('agapay_parish_id');
    sessionStorage.removeItem(parishSessionStorageKey);
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    sessionStorage.removeItem(identitySessionStorageKey);
    sessionStorage.removeItem(identityEmailStorageKey);
  } catch {}
  window.location.href = '/give/login';
}

function loadRegisteredParishFeature(featureId: string, options?: unknown) {
  const feature = window.ParishFeatureRegistry?.get(featureId);
  if (!feature) {
    setStatus(`The ${featureId} feature is unavailable. Refresh the dashboard and try again.`, 'error');
    return null;
  }
  return feature.load(options);
}

function setPaymentStatus(msg: string, tone: string) {
  const el = document.getElementById('paymentStatus');
  if (el) el.textContent = msg || '';
  setStatus(msg, tone);
}

// ── TAB NAV ──────────────────────────────────────────────
function switchTab(tab: string) {
  if (tab === 'parishplus') tab = 'bookstore';
  if (tab === 'commerce') tab = 'bookstore';
  if (tab === 'funds') tab = 'options';
  const panel = document.getElementById('tab-' + tab);
  if (!panel) {
    setStatus('That dashboard section is unavailable. Your current page was left open.', 'error');
    return;
  }
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => p.classList.remove('active'));
  document
    .querySelectorAll<HTMLElement>('.sidebar-nav-item, .mobile-tab-link')
    .forEach((n) => n.classList.remove('active'));
  const nav = document.getElementById('nav-' + tab);
  const mobileNav = document.querySelector<HTMLElement>(`.mobile-tab-link[data-nav-tab="${tab}"]`);
  const content = document.querySelector<HTMLElement>('.content');
  if (panel) panel.classList.add('active');
  if (nav) nav.classList.add('active');
  if (mobileNav) mobileNav.classList.add('active');
  content?.classList.toggle('standalone-tab-active', panel?.parentElement === content);
  document.querySelector<HTMLElement>('.app')?.classList.toggle('directory-tab-active', tab === 'directory');
  content?.classList.toggle('directory-tab-active', tab === 'directory');
  document.querySelector<HTMLElement>('.app')?.classList.toggle('accounting-tab-active', tab === 'accounting');
  content?.classList.toggle('accounting-tab-active', tab === 'accounting');
  document.querySelector<HTMLElement>('.app')?.classList.toggle('commerce-tab-active', tab === 'bookstore');
  content?.classList.toggle('commerce-tab-active', tab === 'bookstore');
  document.querySelector<HTMLElement>('.app')?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
  content?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
  if (['accounting', 'reconcile'].includes(tab)) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  activeTab = tab;
  const titles: Record<string, string> = {
    giving: 'Giving Overview',
    reconcile: 'Monthly Reconciliation',
    history: 'Giving History',
    givers: 'Givers',
    settings: 'Settings',
    options: 'Funds & Alms',
    campaigns: 'Campaigns',
    text: 'Text-to-Give',
    stewardship: 'Stewardship Health',
    accounting: 'Accounting',
    sacraments: 'Sacraments & Services',
    directory: 'Parish Directory',
    library: 'Parish Library',
    communications: 'Communications',
    bookstore: 'Commerce',
  };
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  document.getElementById('topbarTitle')!.textContent =
    isMobile && currentParish ? currentParish.parishName || 'Parish Dashboard' : titles[tab] || 'Parish Dashboard';
  syncTopbarTabIcon(tab);
  if (['history', 'givers', 'options', 'reconcile'].includes(tab)) loadRegisteredParishFeature('giving', tab);
  if (tab === 'campaigns' && currentParish) loadRegisteredParishFeature('campaigns');
  if (tab === 'stewardship') loadRegisteredParishFeature('stewardship');
  if (tab === 'sacraments') loadRegisteredParishFeature('sacraments');
  if (tab === 'directory' && moduleIncluded('directory')) loadRegisteredParishFeature('directory');
  if (tab === 'library') loadRegisteredParishFeature('library');
  if (tab === 'communications') loadRegisteredParishFeature('koinonia');
  if (tab === 'accounting') loadRegisteredParishFeature('accounting');
  if (tab === 'bookstore') loadRegisteredParishFeature('commerce');
  content?.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncTopbarTabIcon(tab: string) {
  const icon = document.getElementById('topbarTitleIcon');
  const navIcon = document.getElementById(`nav-${tab}`)?.querySelector<HTMLElement>(':scope > svg');
  if (!icon) return;
  icon.replaceChildren();
  if (navIcon) icon.appendChild(navIcon.cloneNode(true));
}

function openParishSupportTicket() {
  const dialog = document.getElementById('parishSupportDialog') as HTMLDialogElement | null;
  if (!dialog) return;
  document.getElementById('parishSupportStatus')!.textContent = '';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeParishSupportTicket() {
  const dialog = document.getElementById('parishSupportDialog') as HTMLDialogElement | null;
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function showParishFeatureRequestPopup(featureRequests: ParishAppFeatureRequest[] = []) {
  const request =
    featureRequests.find((item) => item?.featureId === 'ministry-service') ||
    featureRequests.find((item) => item?.featureId === 'giving-plus') ||
    featureRequests.find((item) => item?.featureId === 'pledge-tracker');
  const dialog = document.getElementById('parishFeatureRequestDialog') as HTMLDialogElement | null;
  if (!request || !dialog) return;
  activeParishFeatureRequest = request;
  const count = Math.max(1, Number(request.count || 1));
  const copy = document.getElementById('parishFeatureRequestCopy');
  const heading = document.getElementById('parishFeatureRequestHeading');
  const featureTitle = document.getElementById('parishFeatureRequestTitle');
  const featureDescription = document.getElementById('parishFeatureRequestDescription');
  const action = document.getElementById('parishFeatureRequestAction') as HTMLButtonElement | null;
  const status = document.getElementById('parishFeatureRequestStatus');
  const givingPlus = request.featureId === 'giving-plus';
  const ministryService = request.featureId === 'ministry-service';
  if (heading)
    heading.textContent = ministryService ? 'A parishioner wants to serve' : 'Your donors want more AGAPAY features';
  if (copy)
    copy.textContent =
      count === 1
        ? ministryService
          ? 'A parishioner let you know they are ready to serve.'
          : `A parishioner asked your church to add ${givingPlus ? 'more giving options through Give +' : 'pledge tracking and the Stewardship features that support it'}.`
        : ministryService
          ? `${count} parishioners let you know they are ready to serve.`
          : `${count} parishioners asked your church to add ${givingPlus ? 'more giving options through Give +' : 'pledge tracking and the Stewardship features that support it'}.`;
  if (featureTitle)
    featureTitle.textContent = ministryService
      ? 'Ready to get involved'
      : givingPlus
        ? 'More ways to give'
        : 'Annual pledge progress';
  if (featureDescription)
    featureDescription.textContent = ministryService
      ? 'Consider publishing ministry opportunities or inviting parishioners to speak with a ministry leader after services.'
      : givingPlus
        ? 'Give + adds campaigns, festal alms, branding, annual statements, and enhanced reporting to complete essential giving.'
        : 'Give + gives parishioners a live pledge tracker and gives parish leaders pledge, giving-health, and annual-meeting insights.';
  if (action) {
    action.textContent = ministryService ? 'Acknowledge' : givingPlus ? 'View Give + tier' : 'View Give + tier';
    action.setAttribute(
      'onclick',
      ministryService ? 'dismissParishFeatureRequest(false)' : 'dismissParishFeatureRequest(true)'
    );
  }
  if (status) status.textContent = 'Requests are counted privately; donor identities are not shown.';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function dismissParishFeatureRequest(viewStewardship: boolean = false) {
  const request = activeParishFeatureRequest;
  const dialog = document.getElementById('parishFeatureRequestDialog') as HTMLDialogElement | null;
  const status = document.getElementById('parishFeatureRequestStatus');
  if (!request || !currentParish?.parishId) return;
  if (status) status.textContent = 'Saving…';
  try {
    const response = await fetch(
      `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/feature-requests/${encodeURIComponent(request.featureId)}/dismiss`,
      { method: 'POST', headers: authHeaders() }
    );
    const result = (await response.json().catch(() => ({}))) as ParishAppPayload;
    if (!response.ok) throw new Error(result.error || 'Unable to dismiss this request.');
    activeParishFeatureRequest = null;
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    if (viewStewardship) {
      switchTab('settings');
      (document.getElementById('subscriptionTierUpgrade') as HTMLSelectElement | null)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  } catch (error) {
    if (status) status.textContent = (error as ParishAppError).message || 'Unable to save. Please try again.';
  }
}

async function submitParishSupportTicket() {
  if (!currentParish?.parishId) {
    setStatus('Load your parish dashboard before sending a support ticket.', 'error');
    return;
  }
  const message = (document.getElementById('parishSupportMessage') as HTMLTextAreaElement | null)!.value.trim();
  const status = document.getElementById('parishSupportStatus');
  const button = document.getElementById('parishSupportSend') as HTMLButtonElement | null;
  if (message.length < 8) {
    status!.textContent = 'Please include a little more detail so we can help.';
    return;
  }
  button!.disabled = true;
  status!.textContent = 'Sending your ticket…';
  try {
    const response = await fetch(`/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: (document.getElementById('parishSupportType') as HTMLSelectElement | null)!.value,
        subject: (document.getElementById('parishSupportSubject') as HTMLInputElement | null)!.value.trim(),
        message,
        page: activeTab,
        path: window.location.pathname,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as ParishAppPayload;
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send your support ticket.');
    const emailNote = result.ticket?.email?.status === 'sent' ? ' We also emailed the AGAPAY team.' : '';
    status!.textContent = 'Your ticket was created.' + emailNote;
    (document.getElementById('parishSupportMessage') as HTMLTextAreaElement | null)!.value = '';
    (document.getElementById('parishSupportSubject') as HTMLInputElement | null)!.value = '';
    setStatus('Support ticket sent.', 'success');
    setTimeout(closeParishSupportTicket, 900);
  } catch (error) {
    status!.textContent = (error as ParishAppError).message || 'Unable to send your support ticket.';
  } finally {
    button!.disabled = false;
  }
}

function renderDirectoryAdminAccessError(status: number = 401, message: string = '') {
  const heading = status === 403 ? 'Directory access is not available' : 'Parish Dashboard session required';
  const reason =
    status === 403
      ? message || 'Directory Operations are not enabled for this parish, or this record belongs to another parish.'
      : 'Your Parish Dashboard session has expired. Please sign in again.';
  const action =
    status === 401
      ? '<button type="button" class="btn btn-gold" onclick="logoutParish()">Sign in again</button>'
      : '<button type="button" class="btn btn-gold" onclick="loadDirectoryAdminTab(true)">Retry</button>';
  return `
      <div class="pdx-dir-access-card">
        <div class="pdx-dir-access-icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
        <div class="pdx-dir-access-copy">
          <div class="pdx-gv-eyebrow">Directory access</div>
          <h3>${escapeHtml(heading)}</h3>
          <p>${escapeHtml(reason)}</p>
        </div>
        <div class="pdx-dir-access-actions">
          ${action}
        </div>
      </div>`;
}

function renderDirectoryAdminGenericError(message: string = '') {
  return `
      <div class="pdx-dir-access-card">
        <div class="pdx-dir-access-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <div class="pdx-dir-access-copy">
          <div class="pdx-gv-eyebrow">Directory access</div>
          <h3>Directory Operations is unavailable right now</h3>
          <p>${message ? escapeHtml(message) : 'We could not reach the directory service. Check your connection and try again.'}</p>
        </div>
        <div class="pdx-dir-access-actions">
          <button type="button" class="btn btn-gold" onclick="loadDirectoryAdminTab(true)">Retry</button>
        </div>
      </div>`;
}

function statusLabel(value: unknown) {
  const normalized = String(value || 'active').toLowerCase();
  const subscriptionLabels: Record<string, string> = {
    trialing: 'Free demo',
    trial_checkout_created: 'Demo setup started',
    checkout_created: 'Checkout started',
    free_forever: 'Free forever',
  };
  if (subscriptionLabels[normalized]) return subscriptionLabels[normalized];
  return normalized.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

async function loginFromParishPage(event: SubmitEvent) {
  event.preventDefault();
  const parishId = (document.getElementById('parishId') as HTMLInputElement | null)?.value.trim();
  const password = (document.getElementById('parishToken') as HTMLInputElement | null)?.value.trim();
  const submit = event.submitter;
  if (!parishId || !password) {
    setStatus('Enter the parish ID and password.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/session', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to log in');
    const authenticated = data.mfaRequired
      ? await window.AgapayMfa.runFlow(data, { displayName: parishId + ' administrator' })
      : data;
    if (!authenticated.token) throw new Error('Login succeeded but no session token was returned.');
    sessionStorage.setItem('agapay_parish_id', parishId);
    sessionStorage.setItem(parishSessionStorageKey, authenticated.token);
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    window.location.href = '/parish/dashboard?parish=' + encodeURIComponent(parishId);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

// ── HELPERS ──────────────────────────────────────────────
function showParishAuthForm(formId: string) {
  [
    'parishLoginForm',
    'parishStaffLoginForm',
    'parishAccessInviteForm',
    'parishResetRequestForm',
    'parishResetConfirmForm',
  ].forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.hidden = id !== formId;
  });
}

function showParishLogin() {
  showParishAuthForm('parishLoginForm');
}

function showParishPasswordReset() {
  const parishId = (document.getElementById('parishId') as HTMLInputElement | null)?.value.trim();
  const resetId = document.getElementById('parishResetId') as HTMLInputElement | null;
  if (parishId && resetId) resetId.value = parishId;
  showParishAuthForm('parishResetRequestForm');
}

async function requestParishPasswordReset(event: SubmitEvent) {
  event.preventDefault();
  const parishId = (document.getElementById('parishResetId') as HTMLInputElement | null)?.value.trim();
  const email = (document.getElementById('parishResetEmail') as HTMLInputElement | null)?.value.trim();
  const submit = event.submitter;
  if (!parishId || !email) {
    setStatus('Enter the parish ID and contact email.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  try {
    const res = await fetch('/api/parish/password-reset-request', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parishId, email }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to request reset link');
    setStatus('If that parish contact is registered, a reset link has been sent.', 'success');
    if (data.resetUrl) {
      const actions = (
        document.getElementById('parishResetRequestForm') as HTMLFormElement | null
      )?.querySelector<HTMLElement>('.parish-auth-actions');
      if (actions && !document.getElementById('parishTestResetLink')) {
        const link = document.createElement('a');
        link.id = 'parishTestResetLink';
        link.href = data.resetUrl;
        link.textContent = 'Open test reset link';
        link.className = 'btn btn-ghost';
        actions.appendChild(link);
      }
    }
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

async function confirmParishPasswordReset(event: SubmitEvent) {
  event.preventDefault();
  const parishId = (document.getElementById('parishResetConfirmId') as HTMLInputElement | null)?.value.trim();
  const token = (document.getElementById('parishResetToken') as HTMLInputElement | null)?.value.trim();
  const newPassword = (document.getElementById('parishNewPassword') as HTMLInputElement | null)?.value;
  const confirmPassword = (document.getElementById('parishConfirmPassword') as HTMLInputElement | null)?.value;
  const submit = event.submitter;
  if (!parishId || !token || !newPassword) {
    setStatus('Enter the parish ID and new password.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    setStatus('Passwords do not match.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  try {
    const res = await fetch('/api/parish/password-reset-confirm', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parishId, token, newPassword, confirmPassword }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to update password');
    sessionStorage.removeItem('agapay_parish_id');
    sessionStorage.removeItem(parishSessionStorageKey);
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    const parishIdField = document.getElementById('parishId') as HTMLInputElement | null;
    if (parishIdField) parishIdField.value = parishId;
    showParishAuthForm('parishLoginForm');
    setStatus('Password updated. Please log in with your new password.', 'success');
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

function initParishPasswordResetPage() {
  const resetParams = new URLSearchParams(window.location.search);
  const token = resetParams.get('token') || '';
  const parishId = resetParams.get('parish') || '';
  if (!token && resetParams.get('reset') !== '1') return;
  const tokenField = document.getElementById('parishResetToken') as HTMLInputElement | null;
  const confirmId = document.getElementById('parishResetConfirmId') as HTMLInputElement | null;
  const requestId = document.getElementById('parishResetId') as HTMLInputElement | null;
  if (tokenField) tokenField.value = token;
  if (confirmId) confirmId.value = parishId;
  if (requestId) requestId.value = parishId;
  showParishAuthForm(token ? 'parishResetConfirmForm' : 'parishResetRequestForm');
}

function fallbackFunds(v: { length?: unknown } | null | undefined) {
  return JSON.stringify(
    v && v.length
      ? v
      : [
          {
            id: 'general',
            name: 'General Operating Fund',
            description: 'Utilities, supplies, ministries, and day-to-day parish needs.',
          },
        ],
    null,
    2
  );
}

function fallbackCampaigns(v: unknown) {
  return JSON.stringify(Array.isArray(v) ? v : [], null, 2);
}

function fallbackFundsArray(v: { length?: unknown } | null | undefined): ParishGivingOption[] {
  return JSON.parse(fallbackFunds(v));
}

function fallbackCampaignsArray(v: unknown): ParishGivingOption[] {
  return JSON.parse(fallbackCampaigns(v));
}

function dedicatedGivingUrl() {
  return currentParish ? `${window.location.origin}/give/${encodeURIComponent(currentParish.parishId)}` : '';
}

function dedicatedGivingEmbedUrl() {
  return currentParish ? `${window.location.origin}/give/embed/${encodeURIComponent(currentParish.parishId)}` : '';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slugifyLocal(v: unknown) {
  return (
    String(v || 'item')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'item'
  );
}

function money(cents: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    (Number(cents) || 0) / 100
  );
}

function moneyFull(cents: unknown) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

function shortDate(v: unknown) {
  if (!v) return 'No gifts yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(v as string));
}

function fullDate(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(v as string)
  );
}

function isoDateLabel(value: unknown) {
  if (!value) return 'Not set';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00') : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Both functions prefer the server-computed entitlements payload
// (src/lib/entitlements.js, surfaced as currentParish.entitlements) over
// re-deriving tier/add-on logic here -- the fallback expressions only
// matter for a brief window before the dashboard's first load response
// lands, or against stale cached parish objects.
function isParishTier(parish: ParishAppIdentity | null = currentParish) {
  if (parish?.entitlements) return Boolean(parish.entitlements.modules?.stewardshipHealth?.included);
  if (typeof parish?.parishPlusIncludedInTier === 'boolean') return parish.parishPlusIncludedInTier;
  return ['stewardship', 'parish', 'diocese'].includes(String(parish?.subscriptionTier || '').toLowerCase());
}

function isParishPlusActive() {
  if (currentParish?.entitlements) return Boolean(currentParish.entitlements.parishPlusActive);
  const sw =
    (window.ParishFeatureRegistry?.get('stewardship') as ParishAppStewardshipFeature | null)?.getStatus() || {};
  return Boolean(
    currentParish?.stewardshipActive ||
    sw.legacyAddOnActive ||
    (!sw.includedInParishTier && ['active', 'trialing', 'comped'].includes(sw.status as string))
  );
}

function isStarterTier(parish: ParishAppIdentity | null = currentParish) {
  return String(parish?.subscriptionTier || '').toLowerCase() === 'starter';
}

function openParishPortability() {
  if (sessionStorage.getItem(identitySessionStorageKey))
    return setStatus(
      'Sign out, then use the primary parish login to access data portability or close the account.',
      'error'
    );
  if (currentParish?.parishId && window.ParishPortability)
    window.ParishPortability.open({ parishId: currentParish.parishId, headers: authHeaders });
}

function hasGivingPlusAccess() {
  if (currentParish?.entitlements) return Boolean(currentParish.entitlements.givingFeatures?.branding);
  return String(currentParish?.subscriptionTier || '').toLowerCase() !== 'starter';
}

async function acceptParishAccessInvitation(event: SubmitEvent) {
  event.preventDefault();
  const token = (document.getElementById('parishAccessInviteToken') as HTMLInputElement | null)?.value.trim();
  const displayName = (document.getElementById('parishAccessName') as HTMLInputElement | null)?.value.trim();
  const password = (document.getElementById('parishAccessPassword') as HTMLInputElement | null)?.value || '';
  const confirmation = (document.getElementById('parishAccessPasswordConfirm') as HTMLInputElement | null)?.value || '';
  const submit = event.submitter;
  if (!token || !displayName || password.length < 8) {
    setStatus('Enter your name and a password of at least 8 characters.', 'error');
    return;
  }
  if (password !== confirmation) {
    setStatus('Passwords do not match.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
  }
  try {
    const res = await fetch('/api/identity/invitations/' + encodeURIComponent(token) + '/accept', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, displayName }),
    });
    const data = (await res.json().catch(() => ({}))) as ParishAppPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to create your access');
    const authenticated = data.mfaRequired ? await window.AgapayMfa.runFlow(data, { displayName }) : data;
    if (!authenticated.parishId || !authenticated.parishToken)
      throw new Error(
        'Your account was created, but the parish dashboard could not be opened. Please contact AGAPAY support.'
      );
    sessionStorage.setItem('agapay_parish_id', authenticated.parishId);
    sessionStorage.setItem(parishSessionStorageKey, authenticated.parishToken);
    sessionStorage.setItem(identitySessionStorageKey, authenticated.token || '');
    sessionStorage.setItem(identityEmailStorageKey, authenticated.identityEmail || '');
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    window.location.href = '/parish/dashboard?parish=' + encodeURIComponent(authenticated.parishId);
  } catch (err) {
    setStatus((err as ParishAppError).message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      (submit as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
    }
  }
}

function initParishAccessInvitationPage() {
  const invite = new URLSearchParams(window.location.search).get('invite') || '';
  if (!invite) return false;
  const tokenField = document.getElementById('parishAccessInviteToken') as HTMLInputElement | null;
  if (tokenField) tokenField.value = invite;
  showParishAuthForm('parishAccessInviteForm');
  const eyebrow = document.querySelector<HTMLElement>('.parish-auth-intro .eyebrow');
  const heading = document.querySelector<HTMLElement>('.parish-auth-intro h1');
  const copy = document.querySelector<HTMLElement>('.parish-auth-intro p');
  if (eyebrow) eyebrow.textContent = 'You are invited';
  if (heading) heading.textContent = 'Create your AGAPAY access.';
  if (copy) copy.textContent = 'One personal password. Then connect payments, review the parish details, and launch.';
  return true;
}

function hasStarterDesignatedFundAccess() {
  if (currentParish?.entitlements) return Boolean(currentParish.entitlements.givingFeatures?.starterDesignatedFund);
  return true;
}

function hasFundManagementAccess() {
  return hasGivingPlusAccess() || hasStarterDesignatedFundAccess();
}

function isGeneralDashboardFund(fund: ParishGivingOption = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(truthyParishSession)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value));
}

function isCandleDashboardFund(fund: ParishGivingOption = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(truthyParishSession)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}

function starterPaywallMarkup(featureKey: string, tierLabel: string = 'Give +') {
  const [title, copy] = starterLockedFeatures[featureKey];
  return `<div class="starter-tier-paywall">
      <span class="starter-tier-paywall-badge">${escapeHtml(tierLabel)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(copy)}</p>
      <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to ${escapeHtml(tierLabel)}</button>
    </div>`;
}

function syncDashboardPaywall(element: HTMLElement | null, featureKey: string, tierLabel: string, locked: boolean) {
  if (!element) return;
  element.classList.toggle('starter-tier-locked', locked);
  let paywall = element.querySelector<HTMLElement>(':scope > .starter-tier-paywall');
  if (locked && !paywall) {
    element.insertAdjacentHTML('beforeend', starterPaywallMarkup(featureKey, tierLabel));
    paywall = element.querySelector<HTMLElement>(':scope > .starter-tier-paywall');
  }
  if (!locked && paywall) paywall.remove();
}

function syncTierRequirementNavigation(tab: string, tierLabel: string, included: boolean) {
  const desktop = document.getElementById(`nav-${tab}`);
  const mobile = document.querySelector<HTMLElement>(`.mobile-tab-link[data-nav-tab="${tab}"]`);
  (
    [
      [desktop, 'span', 'nav-requirement-label', 'nav-upgrade-badge'],
      [mobile, 'em', 'mobile-requirement-label', 'mobile-upgrade-badge'],
    ] as const
  ).forEach(([element, tag, className, upgradeClass]) => {
    if (!element) return;
    element.classList.toggle(element === desktop ? 'sidebar-nav-item--gated' : 'mobile-tab-link--gated', !included);
    let stack = element.querySelector<HTMLElement>(':scope > .nav-label-stack');
    if (!stack) {
      const name =
        element.querySelector<HTMLElement>(':scope > .nav-label') ||
        (element === mobile ? element.querySelector<HTMLElement>(':scope > span') : null);
      const textNode =
        element === desktop
          ? Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim())
          : null;
      const resolvedName =
        name ||
        (textNode
          ? Object.assign(document.createElement('span'), {
              className: 'nav-label',
              textContent: textNode.textContent!.trim(),
            })
          : null);
      if (resolvedName) {
        stack = document.createElement('span');
        stack.className = 'nav-label-stack';
        element.insertBefore(stack, (name || textNode)!);
        if (textNode) textNode.remove();
        stack.appendChild(resolvedName);
      }
    }
    let label = element.querySelector<HTMLElement>(`:scope > .${className}`);
    if (!label) label = stack?.querySelector<HTMLElement>(`:scope > .${className}`) || null;
    let upgrade = element.querySelector<HTMLElement>(`:scope > .${upgradeClass}`);
    if (!included && !label) {
      label = document.createElement(tag);
      label.className = className;
      (stack || element).appendChild(label);
    }
    if (!included && !upgrade) {
      upgrade = document.createElement(element === desktop ? 'span' : 'em');
      upgrade.className = upgradeClass;
      upgrade.dataset.tierUpgrade = 'true';
      element.appendChild(upgrade);
    }
    if (label) label.textContent = `Requires ${tierLabel}`;
    if (upgrade) {
      upgrade.textContent = 'Upgrade';
      upgrade.hidden = included;
    }
    const statusBadge = element.querySelector<HTMLElement>(':scope > .nav-soon-badge, :scope > .mobile-soon-badge');
    if (statusBadge) statusBadge.hidden = !included;
    if (included && label) label.remove();
  });
}

function syncModuleStatusNavigation(tab: string, included: boolean, enabled: boolean) {
  const desktop = document.querySelector<HTMLElement>(`#nav-${tab} > .nav-module-status`);
  const mobile = document.querySelector<HTMLElement>(`.mobile-tab-link[data-nav-tab="${tab}"] > .mobile-module-status`);
  [desktop, mobile].forEach((badge) => {
    if (!badge) return;
    badge.hidden = !included;
    badge.textContent = enabled ? 'On' : 'Off';
    badge.classList.toggle('is-on', Boolean(enabled));
  });
}
export type ParishAppPart1 = {
  givingCatalogSnapshot: typeof givingCatalogSnapshot;
  accountingCatalogSnapshot: typeof accountingCatalogSnapshot;
  saveSession: typeof saveSession;
  logoutParish: typeof logoutParish;
  loadRegisteredParishFeature: typeof loadRegisteredParishFeature;
  setPaymentStatus: typeof setPaymentStatus;
  switchTab: typeof switchTab;
  syncTopbarTabIcon: typeof syncTopbarTabIcon;
  openParishSupportTicket: typeof openParishSupportTicket;
  closeParishSupportTicket: typeof closeParishSupportTicket;
  showParishFeatureRequestPopup: typeof showParishFeatureRequestPopup;
  dismissParishFeatureRequest: typeof dismissParishFeatureRequest;
  submitParishSupportTicket: typeof submitParishSupportTicket;
  renderDirectoryAdminAccessError: typeof renderDirectoryAdminAccessError;
  renderDirectoryAdminGenericError: typeof renderDirectoryAdminGenericError;
  statusLabel: typeof statusLabel;
  loginFromParishPage: typeof loginFromParishPage;
  showParishAuthForm: typeof showParishAuthForm;
  showParishLogin: typeof showParishLogin;
  showParishPasswordReset: typeof showParishPasswordReset;
  requestParishPasswordReset: typeof requestParishPasswordReset;
  confirmParishPasswordReset: typeof confirmParishPasswordReset;
  initParishPasswordResetPage: typeof initParishPasswordResetPage;
  fallbackFunds: typeof fallbackFunds;
  fallbackCampaigns: typeof fallbackCampaigns;
  fallbackFundsArray: typeof fallbackFundsArray;
  fallbackCampaignsArray: typeof fallbackCampaignsArray;
  dedicatedGivingUrl: typeof dedicatedGivingUrl;
  dedicatedGivingEmbedUrl: typeof dedicatedGivingEmbedUrl;
  downloadBlob: typeof downloadBlob;
  slugifyLocal: typeof slugifyLocal;
  money: typeof money;
  moneyFull: typeof moneyFull;
  shortDate: typeof shortDate;
  fullDate: typeof fullDate;
  isoDateLabel: typeof isoDateLabel;
  isParishTier: typeof isParishTier;
  isParishPlusActive: typeof isParishPlusActive;
  isStarterTier: typeof isStarterTier;
  openParishPortability: typeof openParishPortability;
  hasGivingPlusAccess: typeof hasGivingPlusAccess;
  acceptParishAccessInvitation: typeof acceptParishAccessInvitation;
  initParishAccessInvitationPage: typeof initParishAccessInvitationPage;
  hasStarterDesignatedFundAccess: typeof hasStarterDesignatedFundAccess;
  hasFundManagementAccess: typeof hasFundManagementAccess;
  isGeneralDashboardFund: typeof isGeneralDashboardFund;
  isCandleDashboardFund: typeof isCandleDashboardFund;
  starterPaywallMarkup: typeof starterPaywallMarkup;
  syncDashboardPaywall: typeof syncDashboardPaywall;
  syncTierRequirementNavigation: typeof syncTierRequirementNavigation;
  syncModuleStatusNavigation: typeof syncModuleStatusNavigation;
};
