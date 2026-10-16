// Generated from src/browser/parish/app.ts by npm run build:browser. Do not edit.
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
    sessionStorage.setItem('agapay_parish_id', document.getElementById('parishId').value.trim());
    sessionStorage.setItem(parishSessionStorageKey, document.getElementById('parishToken').value.trim());
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
function loadRegisteredParishFeature(featureId, options) {
  const feature = window.ParishFeatureRegistry?.get(featureId);
  if (!feature) {
    setStatus(`The ${featureId} feature is unavailable. Refresh the dashboard and try again.`, 'error');
    return null;
  }
  return feature.load(options);
}
function setPaymentStatus(msg, tone) {
  const el = document.getElementById('paymentStatus');
  if (el) el.textContent = msg || '';
  setStatus(msg, tone);
}
function switchTab(tab) {
  if (tab === 'parishplus') tab = 'bookstore';
  if (tab === 'commerce') tab = 'bookstore';
  if (tab === 'funds') tab = 'options';
  const panel = document.getElementById('tab-' + tab);
  if (!panel) {
    setStatus('That dashboard section is unavailable. Your current page was left open.', 'error');
    return;
  }
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach((n) => n.classList.remove('active'));
  const nav = document.getElementById('nav-' + tab);
  const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
  const content = document.querySelector('.content');
  if (panel) panel.classList.add('active');
  if (nav) nav.classList.add('active');
  if (mobileNav) mobileNav.classList.add('active');
  content?.classList.toggle('standalone-tab-active', panel?.parentElement === content);
  document.querySelector('.app')?.classList.toggle('directory-tab-active', tab === 'directory');
  content?.classList.toggle('directory-tab-active', tab === 'directory');
  document.querySelector('.app')?.classList.toggle('accounting-tab-active', tab === 'accounting');
  content?.classList.toggle('accounting-tab-active', tab === 'accounting');
  document.querySelector('.app')?.classList.toggle('commerce-tab-active', tab === 'bookstore');
  content?.classList.toggle('commerce-tab-active', tab === 'bookstore');
  document.querySelector('.app')?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
  content?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
  if (['accounting', 'reconcile'].includes(tab)) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  activeTab = tab;
  const titles = {
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
  document.getElementById('topbarTitle').textContent =
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
function syncTopbarTabIcon(tab) {
  const icon = document.getElementById('topbarTitleIcon');
  const navIcon = document.getElementById(`nav-${tab}`)?.querySelector(':scope > svg');
  if (!icon) return;
  icon.replaceChildren();
  if (navIcon) icon.appendChild(navIcon.cloneNode(true));
}
function openParishSupportTicket() {
  const dialog = document.getElementById('parishSupportDialog');
  if (!dialog) return;
  document.getElementById('parishSupportStatus').textContent = '';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
function closeParishSupportTicket() {
  const dialog = document.getElementById('parishSupportDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}
function showParishFeatureRequestPopup(featureRequests = []) {
  const request =
    featureRequests.find((item) => item?.featureId === 'ministry-service') ||
    featureRequests.find((item) => item?.featureId === 'giving-plus') ||
    featureRequests.find((item) => item?.featureId === 'pledge-tracker');
  const dialog = document.getElementById('parishFeatureRequestDialog');
  if (!request || !dialog) return;
  activeParishFeatureRequest = request;
  const count = Math.max(1, Number(request.count || 1));
  const copy = document.getElementById('parishFeatureRequestCopy');
  const heading = document.getElementById('parishFeatureRequestHeading');
  const featureTitle = document.getElementById('parishFeatureRequestTitle');
  const featureDescription = document.getElementById('parishFeatureRequestDescription');
  const action = document.getElementById('parishFeatureRequestAction');
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
async function dismissParishFeatureRequest(viewStewardship = false) {
  const request = activeParishFeatureRequest;
  const dialog = document.getElementById('parishFeatureRequestDialog');
  const status = document.getElementById('parishFeatureRequestStatus');
  if (!request || !currentParish?.parishId) return;
  if (status) status.textContent = 'Saving…';
  try {
    const response = await fetch(
      `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/feature-requests/${encodeURIComponent(request.featureId)}/dismiss`,
      { method: 'POST', headers: authHeaders() }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to dismiss this request.');
    activeParishFeatureRequest = null;
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    if (viewStewardship) {
      switchTab('settings');
      document.getElementById('subscriptionTierUpgrade')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  } catch (error) {
    if (status) status.textContent = error.message || 'Unable to save. Please try again.';
  }
}
async function submitParishSupportTicket() {
  if (!currentParish?.parishId) {
    setStatus('Load your parish dashboard before sending a support ticket.', 'error');
    return;
  }
  const message = document.getElementById('parishSupportMessage').value.trim();
  const status = document.getElementById('parishSupportStatus');
  const button = document.getElementById('parishSupportSend');
  if (message.length < 8) {
    status.textContent = 'Please include a little more detail so we can help.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Sending your ticket…';
  try {
    const response = await fetch(`/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: document.getElementById('parishSupportType').value,
        subject: document.getElementById('parishSupportSubject').value.trim(),
        message,
        page: activeTab,
        path: window.location.pathname,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send your support ticket.');
    const emailNote = result.ticket?.email?.status === 'sent' ? ' We also emailed the AGAPAY team.' : '';
    status.textContent = 'Your ticket was created.' + emailNote;
    document.getElementById('parishSupportMessage').value = '';
    document.getElementById('parishSupportSubject').value = '';
    setStatus('Support ticket sent.', 'success');
    setTimeout(closeParishSupportTicket, 900);
  } catch (error) {
    status.textContent = error.message || 'Unable to send your support ticket.';
  } finally {
    button.disabled = false;
  }
}
function renderDirectoryAdminAccessError(status = 401, message = '') {
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
function renderDirectoryAdminGenericError(message = '') {
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
function statusLabel(value) {
  const normalized = String(value || 'active').toLowerCase();
  const subscriptionLabels = {
    trialing: 'Free demo',
    trial_checkout_created: 'Demo setup started',
    checkout_created: 'Checkout started',
    free_forever: 'Free forever',
  };
  if (subscriptionLabels[normalized]) return subscriptionLabels[normalized];
  return normalized.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
async function loginFromParishPage(event) {
  event.preventDefault();
  const parishId = document.getElementById('parishId')?.value.trim();
  const password = document.getElementById('parishToken')?.value.trim();
  const submit = event.submitter;
  if (!parishId || !password) {
    setStatus('Enter the parish ID and password.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    submit.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/session', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
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
    setStatus(err.message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }
}
function showParishAuthForm(formId) {
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
  const parishId = document.getElementById('parishId')?.value.trim();
  const resetId = document.getElementById('parishResetId');
  if (parishId && resetId) resetId.value = parishId;
  showParishAuthForm('parishResetRequestForm');
}
async function requestParishPasswordReset(event) {
  event.preventDefault();
  const parishId = document.getElementById('parishResetId')?.value.trim();
  const email = document.getElementById('parishResetEmail')?.value.trim();
  const submit = event.submitter;
  if (!parishId || !email) {
    setStatus('Enter the parish ID and contact email.', 'error');
    return;
  }
  if (submit) {
    submit.classList.add('loading');
    submit.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/password-reset-request', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parishId, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to request reset link');
    setStatus('If that parish contact is registered, a reset link has been sent.', 'success');
    if (data.resetUrl) {
      const actions = document.getElementById('parishResetRequestForm')?.querySelector('.parish-auth-actions');
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
    setStatus(err.message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }
}
async function confirmParishPasswordReset(event) {
  event.preventDefault();
  const parishId = document.getElementById('parishResetConfirmId')?.value.trim();
  const token = document.getElementById('parishResetToken')?.value.trim();
  const newPassword = document.getElementById('parishNewPassword')?.value;
  const confirmPassword = document.getElementById('parishConfirmPassword')?.value;
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
    submit.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/password-reset-confirm', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parishId, token, newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to update password');
    sessionStorage.removeItem('agapay_parish_id');
    sessionStorage.removeItem(parishSessionStorageKey);
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    const parishIdField2 = document.getElementById('parishId');
    if (parishIdField2) parishIdField2.value = parishId;
    showParishAuthForm('parishLoginForm');
    setStatus('Password updated. Please log in with your new password.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }
}
function initParishPasswordResetPage() {
  const resetParams = new URLSearchParams(window.location.search);
  const token = resetParams.get('token') || '';
  const parishId = resetParams.get('parish') || '';
  if (!token && resetParams.get('reset') !== '1') return;
  const tokenField = document.getElementById('parishResetToken');
  const confirmId = document.getElementById('parishResetConfirmId');
  const requestId = document.getElementById('parishResetId');
  if (tokenField) tokenField.value = token;
  if (confirmId) confirmId.value = parishId;
  if (requestId) requestId.value = parishId;
  showParishAuthForm(token ? 'parishResetConfirmForm' : 'parishResetRequestForm');
}
function fallbackFunds(v) {
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
function fallbackCampaigns(v) {
  return JSON.stringify(Array.isArray(v) ? v : [], null, 2);
}
function fallbackFundsArray(v) {
  return JSON.parse(fallbackFunds(v));
}
function fallbackCampaignsArray(v) {
  return JSON.parse(fallbackCampaigns(v));
}
function dedicatedGivingUrl() {
  return currentParish ? `${window.location.origin}/give/${encodeURIComponent(currentParish.parishId)}` : '';
}
function dedicatedGivingEmbedUrl() {
  return currentParish ? `${window.location.origin}/give/embed/${encodeURIComponent(currentParish.parishId)}` : '';
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function slugifyLocal(v) {
  return (
    String(v || 'item')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'item'
  );
}
function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    (Number(cents) || 0) / 100
  );
}
function moneyFull(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}
function shortDate(v) {
  if (!v) return 'No gifts yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(v));
}
function fullDate(v) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v));
}
function isoDateLabel(value) {
  if (!value) return 'Not set';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? /* @__PURE__ */ new Date(raw + 'T12:00:00') : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function isParishTier(parish = currentParish) {
  if (parish?.entitlements) return Boolean(parish.entitlements.modules?.stewardshipHealth?.included);
  if (typeof parish?.parishPlusIncludedInTier === 'boolean') return parish.parishPlusIncludedInTier;
  return ['stewardship', 'parish', 'diocese'].includes(String(parish?.subscriptionTier || '').toLowerCase());
}
function isParishPlusActive() {
  if (currentParish?.entitlements) return Boolean(currentParish.entitlements.parishPlusActive);
  const sw = window.ParishFeatureRegistry?.get('stewardship')?.getStatus() || {};
  return Boolean(
    currentParish?.stewardshipActive ||
    sw.legacyAddOnActive ||
    (!sw.includedInParishTier && ['active', 'trialing', 'comped'].includes(sw.status))
  );
}
function isStarterTier(parish = currentParish) {
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
async function acceptParishAccessInvitation(event) {
  event.preventDefault();
  const token = document.getElementById('parishAccessInviteToken')?.value.trim();
  const displayName = document.getElementById('parishAccessName')?.value.trim();
  const password = document.getElementById('parishAccessPassword')?.value || '';
  const confirmation = document.getElementById('parishAccessPasswordConfirm')?.value || '';
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
    submit.disabled = true;
  }
  try {
    const res = await fetch('/api/identity/invitations/' + encodeURIComponent(token) + '/accept', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, displayName }),
    });
    const data = await res.json().catch(() => ({}));
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
    setStatus(err.message, 'error');
  } finally {
    if (submit) {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }
}
function initParishAccessInvitationPage() {
  const invite = new URLSearchParams(window.location.search).get('invite') || '';
  if (!invite) return false;
  const tokenField = document.getElementById('parishAccessInviteToken');
  if (tokenField) tokenField.value = invite;
  showParishAuthForm('parishAccessInviteForm');
  const eyebrow = document.querySelector('.parish-auth-intro .eyebrow');
  const heading = document.querySelector('.parish-auth-intro h1');
  const copy = document.querySelector('.parish-auth-intro p');
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
function isGeneralDashboardFund(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['general', 'stewardship', 'general operating fund', 'general stewardship'].includes(value));
}
function isCandleDashboardFund(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .some((value) => ['candle', 'candles', 'candles / vigil lights', 'candle fund'].includes(value));
}
function starterPaywallMarkup(featureKey, tierLabel = 'Give +') {
  const [title, copy] = starterLockedFeatures[featureKey];
  return `<div class="starter-tier-paywall">
      <span class="starter-tier-paywall-badge">${escapeHtml(tierLabel)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(copy)}</p>
      <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to ${escapeHtml(tierLabel)}</button>
    </div>`;
}
function syncDashboardPaywall(element, featureKey, tierLabel, locked) {
  if (!element) return;
  element.classList.toggle('starter-tier-locked', locked);
  let paywall = element.querySelector(':scope > .starter-tier-paywall');
  if (locked && !paywall) {
    element.insertAdjacentHTML('beforeend', starterPaywallMarkup(featureKey, tierLabel));
    paywall = element.querySelector(':scope > .starter-tier-paywall');
  }
  if (!locked && paywall) paywall.remove();
}
function syncTierRequirementNavigation(tab, tierLabel, included) {
  const desktop = document.getElementById(`nav-${tab}`);
  const mobile = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
  [
    [desktop, 'span', 'nav-requirement-label', 'nav-upgrade-badge'],
    [mobile, 'em', 'mobile-requirement-label', 'mobile-upgrade-badge'],
  ].forEach(([element, tag, className, upgradeClass]) => {
    if (!element) return;
    element.classList.toggle(element === desktop ? 'sidebar-nav-item--gated' : 'mobile-tab-link--gated', !included);
    let stack = element.querySelector(':scope > .nav-label-stack');
    if (!stack) {
      const name =
        element.querySelector(':scope > .nav-label') ||
        (element === mobile ? element.querySelector(':scope > span') : null);
      const textNode =
        element === desktop
          ? Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          : null;
      const resolvedName =
        name ||
        (textNode
          ? Object.assign(document.createElement('span'), {
              className: 'nav-label',
              textContent: textNode.textContent.trim(),
            })
          : null);
      if (resolvedName) {
        stack = document.createElement('span');
        stack.className = 'nav-label-stack';
        element.insertBefore(stack, name || textNode);
        if (textNode) textNode.remove();
        stack.appendChild(resolvedName);
      }
    }
    let label = element.querySelector(`:scope > .${className}`);
    if (!label) label = stack?.querySelector(`:scope > .${className}`) || null;
    let upgrade = element.querySelector(`:scope > .${upgradeClass}`);
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
    const statusBadge = element.querySelector(':scope > .nav-soon-badge, :scope > .mobile-soon-badge');
    if (statusBadge) statusBadge.hidden = !included;
    if (included && label) label.remove();
  });
}
function syncModuleStatusNavigation(tab, included, enabled) {
  const desktop = document.querySelector(`#nav-${tab} > .nav-module-status`);
  const mobile = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"] > .mobile-module-status`);
  [desktop, mobile].forEach((badge) => {
    if (!badge) return;
    badge.hidden = !included;
    badge.textContent = enabled ? 'On' : 'Off';
    badge.classList.toggle('is-on', Boolean(enabled));
  });
}
function taxExemptionApi(path = '') {
  if (!currentParish?.parishId) return '';
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/tax-exemption' + path;
}
function taxExemptionStatusCopy(status) {
  return (
    {
      pending: ['Under review', 'AGAPAY is reviewing the exemption request. Sales tax remains enabled until approval.'],
      approved: [
        'Approved',
        'Applicable AGAPAY subscription charges are tax-exempt. New billing Customers are synchronized before checkout.',
      ],
      replacement_required: [
        'Document needed',
        'AGAPAY requested updated documentation. Upload it here so the review can continue.',
      ],
      rejected: [
        'Not approved',
        'This request was not approved. You may submit a new request with corrected information.',
      ],
      expired: ['Expired', 'The exemption is no longer active. Submit current documentation for a new review.'],
      revoked: ['Revoked', 'The exemption is no longer active. Contact support if you believe this is incorrect.'],
    }[status] || ['Not submitted', 'No sales-tax exemption request is on file.']
  );
}
function taxExemptionJurisdictionOptions(selected = '') {
  const normalized = String(selected || currentParish?.state || '')
    .trim()
    .toUpperCase();
  return (
    '<option value="">Choose jurisdiction…</option>' +
    taxExemptionJurisdictions
      .map((code) => {
        const label = code === 'FEDERAL' ? 'Federal' : code === 'OTHER' ? 'Other / multistate' : code;
        return `<option value="${code}" ${code === normalized ? 'selected' : ''}>${label}</option>`;
      })
      .join('')
  );
}
function taxExemptionRequestForm(previousClaim = null) {
  return `
      <form class="tax-exemption-form" onsubmit="submitParishTaxExemption(event)">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="taxExemptionJurisdiction">Exemption jurisdiction</label>
            <select id="taxExemptionJurisdiction" name="jurisdiction" required onchange="syncTaxExemptionJurisdiction()">${taxExemptionJurisdictionOptions(previousClaim?.jurisdiction)}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionType">Organization type</label>
            <select id="taxExemptionType" name="exemptionType">
              <option value="religious_organization">Religious organization</option>
              <option value="charitable_organization">Charitable organization</option>
              <option value="government_entity">Government entity</option>
              <option value="other">Other exempt organization</option>
            </select>
          </div>
          <div class="form-group full" id="taxExemptionOtherGroup" hidden>
            <label class="form-label" for="taxExemptionExplanation">Jurisdiction or multistate explanation</label>
            <textarea id="taxExemptionExplanation" name="multistateExplanation" rows="3" placeholder="Explain where and how this exemption applies."></textarea>
          </div>
          <div class="form-group full" id="taxExemptionStateGuidance" hidden></div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionCertificateNumber">Certificate number <span class="optional">(if shown)</span></label>
            <input id="taxExemptionCertificateNumber" name="certificateNumber" autocomplete="off" placeholder="Certificate or exemption number" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionEffectiveDate">Effective date <span class="optional">(if shown)</span></label>
            <input id="taxExemptionEffectiveDate" name="effectiveDate" type="date" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionExpirationDate">Expiration date <span class="optional">(if applicable)</span></label>
            <input id="taxExemptionExpirationDate" name="expirationDate" type="date" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionDocument">Exemption document</label>
            <input id="taxExemptionDocument" name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required />
            <p class="section-note">PDF, JPG, or PNG, up to 10 MB. The document is stored privately and is visible only to authorized parish and AGAPAY administrators.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionRepresentativeName">Authorized representative</label>
            <input id="taxExemptionRepresentativeName" name="authorizedRepresentativeName" required placeholder="Full legal name" />
          </div>
          <div class="form-group">
            <label class="form-label" for="taxExemptionRepresentativeTitle">Representative title</label>
            <input id="taxExemptionRepresentativeTitle" name="authorizedRepresentativeTitle" required placeholder="Treasurer, rector, board officer…" />
          </div>
        </div>
        <label class="check-card tax-exemption-certification"><input name="certified" type="checkbox" required /> I certify that I am authorized to submit this request and that the information and document are accurate.</label>
        <p class="section-note">Submitting a document does not automatically make the parish tax-exempt. AGAPAY reviews the request and applies the exemption to subscription billing only after approval.</p>
        <div class="btn-row"><button class="btn btn-gold" type="submit">Submit for review</button></div>
      </form>`;
}
function taxExemptionDocumentForm(hasDocument = false) {
  return `
      <form class="tax-exemption-upload" onsubmit="uploadParishTaxExemptionDocument(event)">
        <div class="form-group">
          <label class="form-label" for="taxExemptionReplacementDocument">${hasDocument ? 'Replace current document' : 'Upload exemption document'}</label>
          <input id="taxExemptionReplacementDocument" name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required />
          <p class="section-note">PDF, JPG, or PNG, up to 10 MB. Uploading a replacement archives the prior document; it does not approve the request.</p>
        </div>
        <div class="btn-row">
          <button class="btn btn-gold" type="submit">${hasDocument ? 'Upload replacement' : 'Upload document'}</button>
          ${hasDocument ? '<button class="btn btn-ghost" type="button" onclick="viewParishTaxExemptionDocument(this)">View current document</button>' : ''}
        </div>
      </form>`;
}
function renderParishTaxExemption(data = {}) {
  const pane = document.getElementById('taxExemptionPane');
  if (!pane) return;
  const claim = data.claim || null;
  const status = claim?.status || '';
  const copy = taxExemptionStatusCopy(status);
  const detail = claim
    ? `
      <div class="tax-exemption-facts">
        <div><span>Jurisdiction</span><strong>${escapeHtml(claim.jurisdiction || '—')}</strong></div>
        <div><span>Certificate</span><strong>${escapeHtml(claim.maskedCertificateNumber || 'Not listed')}</strong></div>
        <div><span>Submitted</span><strong>${claim.createdAt ? escapeHtml(new Date(claim.createdAt).toLocaleDateString()) : '—'}</strong></div>
        <div><span>Expiration</span><strong>${claim.expirationDate ? escapeHtml(/* @__PURE__ */ new Date(claim.expirationDate + 'T00:00:00').toLocaleDateString()) : 'No expiration listed'}</strong></div>
      </div>`
    : '';
  const reason = claim?.replacementReason || claim?.rejectionReason || claim?.revocationReason || '';
  let action = '';
  if (!claim || ['rejected', 'expired'].includes(status)) action = taxExemptionRequestForm(claim);
  else if (['pending', 'replacement_required'].includes(status))
    action = taxExemptionDocumentForm(Boolean(data.hasDocument));
  else if (status === 'approved' && data.hasDocument)
    action =
      '<div class="btn-row"><button class="btn btn-ghost" type="button" onclick="viewParishTaxExemptionDocument(this)">View current document</button></div>';
  else if (status === 'revoked')
    action =
      '<p class="section-note">Contact <a href="mailto:support@agapay.app">support@agapay.app</a> before submitting a new request.</p>';
  pane.innerHTML = `
      <div class="tax-exemption-status-card tax-exemption-status-${escapeHtml(status || 'none')}">
        <div><span class="tax-exemption-eyebrow">Current status</span><h3>${escapeHtml(copy[0])}</h3><p>${escapeHtml(copy[1])}</p></div>
        <span class="tax-exemption-status-pill">${escapeHtml(copy[0])}</span>
      </div>
      ${reason ? `<div class="tax-exemption-reason"><strong>AGAPAY note</strong><span>${escapeHtml(reason)}</span></div>` : ''}
      ${detail}
      ${action}
      <div id="taxExemptionActionStatus" class="section-note" role="status" aria-live="polite"></div>`;
  syncTaxExemptionJurisdiction();
}
async function loadParishTaxExemption() {
  const pane = document.getElementById('taxExemptionPane');
  if (!pane || !currentParish?.parishId) return;
  pane.innerHTML = '<p class="section-note">Loading sales-tax status…</p>';
  try {
    const response = await fetch(taxExemptionApi(), { headers: authHeaders(), cache: 'no-store' });
    const payload2 = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload2.error || 'Unable to load sales-tax exemption status.');
    renderParishTaxExemption(payload2);
  } catch (error) {
    pane.innerHTML = `<div class="tax-exemption-error"><strong>Sales-tax status is unavailable.</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-ghost" type="button" onclick="loadParishTaxExemption()">Try again</button></div>`;
  }
}
async function syncTaxExemptionJurisdiction() {
  const select = document.getElementById('taxExemptionJurisdiction');
  const otherGroup = document.getElementById('taxExemptionOtherGroup');
  const explanation = document.getElementById('taxExemptionExplanation');
  const guidance = document.getElementById('taxExemptionStateGuidance');
  if (!select) return;
  const isOther = select.value === 'OTHER';
  if (otherGroup) otherGroup.hidden = !isOther;
  if (explanation) explanation.required = isOther;
  if (!guidance || !select.value || ['FEDERAL', 'OTHER'].includes(select.value)) {
    if (guidance) guidance.hidden = true;
    return;
  }
  try {
    const response = await fetch('/api/tax-exemption/state-guidance?state=' + encodeURIComponent(select.value));
    const data = await response.json().catch(() => ({}));
    guidance.hidden = !data.hasNoStatewideGeneralSalesTax;
    guidance.innerHTML = data.hasNoStatewideGeneralSalesTax
      ? `<div class="tax-exemption-guidance">${escapeHtml(data.guidance || '')} Documentation is still required if you are claiming an exemption.</div>`
      : '';
  } catch {
    guidance.hidden = true;
  }
}
function setTaxExemptionActionStatus(message, kind = '') {
  const status = document.getElementById('taxExemptionActionStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `section-note tax-exemption-action-status ${kind}`;
}
async function submitParishTaxExemption(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const raw = new FormData(form);
  const file = raw.get('document');
  if (!file || !file.size) {
    setTaxExemptionActionStatus('Choose the exemption document to upload.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error');
    return;
  }
  const payload2 = {
    claimsExemption: true,
    jurisdiction: raw.get('jurisdiction'),
    exemptionType: raw.get('exemptionType'),
    multistateExplanation: String(raw.get('multistateExplanation') || '').trim(),
    certificateNumber: String(raw.get('certificateNumber') || '').trim(),
    effectiveDate: raw.get('effectiveDate'),
    expirationDate: raw.get('expirationDate'),
    authorizedRepresentativeName: String(raw.get('authorizedRepresentativeName') || '').trim(),
    authorizedRepresentativeTitle: String(raw.get('authorizedRepresentativeTitle') || '').trim(),
    certified: raw.get('certified') === 'on',
  };
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  setTaxExemptionActionStatus('Submitting request…');
  try {
    const response = await fetch(taxExemptionApi(), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload2),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to submit the request.');
    const upload = new FormData();
    upload.append('document', file, file.name);
    const uploadResponse = await fetch(taxExemptionApi('/upload'), {
      method: 'POST',
      headers: authHeaders(),
      body: upload,
    });
    const uploadResult = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok)
      throw new Error(
        uploadResult.error || 'The request was saved, but the document upload failed. Retry the upload below.'
      );
    setStatus('Sales-tax exemption request submitted for review.', 'success');
    await loadParishTaxExemption();
  } catch (error) {
    setTaxExemptionActionStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
async function uploadParishTaxExemptionDocument(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const file = new FormData(form).get('document');
  if (!file || !file.size) {
    setTaxExemptionActionStatus('Choose a document to upload.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error');
    return;
  }
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  setTaxExemptionActionStatus('Uploading document…');
  try {
    const upload = new FormData();
    upload.append('document', file, file.name);
    const response = await fetch(taxExemptionApi('/upload'), { method: 'POST', headers: authHeaders(), body: upload });
    const payload2 = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload2.error || 'Unable to upload the document.');
    setStatus('Exemption document uploaded.', 'success');
    await loadParishTaxExemption();
  } catch (error) {
    setTaxExemptionActionStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
async function viewParishTaxExemptionDocument(button) {
  if (button) {
    button.disabled = true;
    button.classList.add('loading');
  }
  try {
    const response = await fetch(taxExemptionApi('/document'), { headers: authHeaders() });
    if (!response.ok) {
      const payload2 = await response.json().catch(() => ({}));
      throw new Error(payload2.error || 'Unable to open the document.');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const opened = window.open(objectUrl, '_blank', 'noopener');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 6e4);
  } catch (error) {
    setTaxExemptionActionStatus(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
}
async function uploadParishLogo(btn) {
  const file = document.getElementById('parishLogoFile')?.files?.[0];
  if (!file) {
    setStatus('Choose a logo image first.', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus('Logo must be 5MB or smaller.', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/logo', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': file.type },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to upload logo.');
    setStatus('Parish logo uploaded.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus(err.message || 'Unable to upload logo.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}
async function removeParishLogo(btn) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/logo', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to remove logo.');
    setStatus('Parish logo removed.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus(err.message || 'Unable to remove logo.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}
function formatSacramentPriestsForSettings(priests) {
  const rows = Array.isArray(priests) ? priests : [];
  return rows.map((priest) => [priest.name, priest.email].filter(Boolean).join(' | ')).join('\n');
}
function parseSacramentPriestsFromSettings() {
  const raw = document.getElementById('sacramentPriestsText')?.value || '';
  const existing = Array.isArray(currentParish?.sacramentPriests) ? currentParish.sacramentPriests : [];
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const [name, email = ''] = line.split('|').map((part) => part.trim());
      const saved = existing.find(
        (priest) =>
          (email && String(priest.email || '').toLowerCase() === email.toLowerCase()) ||
          String(priest.name || '').toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        email,
        serviceTypes: Array.isArray(saved?.serviceTypes) ? saved.serviceTypes : defaultSacramentServiceTypes(),
        customServices: Array.isArray(saved?.customServices) ? saved.customServices : [],
      };
    })
    .filter((priest) => priest.name)
    .slice(0, 12);
}
async function saveDashboard(btn) {
  if (!currentParish) return;
  let body;
  try {
    body = payload();
  } catch (err) {
    setStatus(err.message, 'error');
    return;
  }
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || data.detail || 'Unable to save dashboard.', 'error');
      return;
    }
    if (body.newDashboardPassword && data.token) {
      document.getElementById('parishToken').value = data.token;
      saveSession();
    }
    setStatus(body.newDashboardPassword ? 'Settings saved. Password updated.' : 'Parish settings saved.', 'success');
    await loadDashboard();
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
function copyPayload() {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(payload(), null, 2));
  setStatus('Current settings copied.', 'success');
}
async function startStripeOnboarding(btn) {
  if (!currentParish) return;
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-onboarding',
      { method: 'POST', headers: authHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to create onboarding link');
    const lb = document.getElementById('stripeLinkBox');
    const ll = document.getElementById('stripeOnboardingLink');
    if (lb && ll) {
      ll.href = data.onboardingUrl;
      lb.classList.add('visible');
    }
    const sb = document.getElementById('setupLinkBox');
    const sl = document.getElementById('setupActionLink');
    const sh = document.getElementById('setupLinkHelp');
    if (sb && sl) {
      sl.href = data.onboardingUrl;
      sl.textContent = 'Open Stripe onboarding';
      sb.classList.add('visible');
      if (sh)
        sh.textContent = win
          ? 'Stripe onboarding opened in a new tab.'
          : 'Your browser blocked the new tab. Use this link.';
    }
    if (win) win.location.href = data.onboardingUrl;
    setStatus(win ? 'Stripe onboarding opened in a new tab.' : 'Stripe onboarding link created.', 'success');
  } catch (err) {
    if (win) win.close();
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
async function startSubscriptionCheckout(btn, tierSelectId) {
  if (!currentParish) return;
  const startingFreeDemo =
    Boolean(currentParish.subscriptionIntroDemoEligible) ||
    currentParish.subscriptionStatus === 'trial_checkout_created';
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const tier = document.getElementById(tierSelectId || 'setupSubscriptionTier');
    const householdBandId =
      tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionHouseholdBandUpgrade' : 'setupParishHouseholdBand';
    const householdBand = document.getElementById(householdBandId);
    const addOnGroupId =
      tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionAddOnUpgradeGroup' : 'setupSubscriptionAddOnGroup';
    if ((tier?.value || currentParish.subscriptionTier) === 'parish' && !householdBand?.value) {
      throw new Error('Choose the parish active-household range before continuing.');
    }
    const res = await fetch(
      '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-checkout',
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionTier: tier ? tier.value : currentParish.subscriptionTier,
          parishHouseholdBand: householdBand?.value || '',
          subscriptionAddOns: selectedSubscriptionAddOns(addOnGroupId),
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Unable to create checkout');
    if (data.registration) currentParish = { ...currentParish, ...data.registration };
    if (!data.checkoutUrl) {
      if (win) win.close();
      await loadDashboard();
      setStatus('Subscription updated. No checkout required.', 'success');
      await window.ParishFeatureRegistry?.get('accounting')?.activate?.();
      return;
    }
    const sb = tierSelectId
      ? document.getElementById('subscriptionUpgradeLinkBox') || document.getElementById('setupLinkBox')
      : document.getElementById('setupLinkBox') || document.getElementById('subscriptionUpgradeLinkBox');
    const sl = tierSelectId
      ? document.getElementById('subscriptionUpgradeLink') || document.getElementById('setupActionLink')
      : document.getElementById('setupActionLink') || document.getElementById('subscriptionUpgradeLink');
    const sh = tierSelectId
      ? document.getElementById('subscriptionUpgradeHelp') || document.getElementById('setupLinkHelp')
      : document.getElementById('setupLinkHelp') || document.getElementById('subscriptionUpgradeHelp');
    if (sb && sl) {
      sl.href = data.checkoutUrl;
      sl.textContent = startingFreeDemo ? 'Open free demo setup' : 'Open billing checkout';
      sb.classList.add('visible');
      if (sh)
        sh.textContent = win
          ? startingFreeDemo
            ? 'Free demo setup opened in a new tab. No card is required.'
            : 'Billing checkout opened in a new tab.'
          : 'Your browser blocked the new tab. Use this link.';
    }
    if (win) win.location.href = data.checkoutUrl;
    setStatus(
      win
        ? startingFreeDemo
          ? 'Free demo setup opened in a new tab.'
          : 'Subscription checkout opened in a new tab.'
        : startingFreeDemo
          ? 'Free demo setup is ready.'
          : 'Checkout created.',
      'success'
    );
  } catch (err) {
    if (win) win.close();
    setStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
async function loadStripeVolume(btn) {
  const body = document.getElementById('stripeVolumeBody');
  if (!currentParish || !body) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-volume', {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.volume) throw new Error(data.detail || data.error || 'Unable to load Stripe volume');
    renderStripeVolume(data.volume || {});
    await loadNonprofitPricing();
  } catch (err) {
    body.innerHTML = `<div class="insights-empty-dark">${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
function renderStripeVolume(volume) {
  const body = document.getElementById('stripeVolumeBody');
  const panel = document.getElementById('stripeVolumePanel');
  if (!body) return;
  panel?.classList.toggle('npp-panel-expanded', Boolean(volume.connected));
  if (!volume.connected) {
    const billingReady = Boolean(currentParish?.setup?.billingActive);
    body.innerHTML = `
        <div class="npp-empty-state">
          <div class="npp-empty-mark" aria-hidden="true">S</div>
          <div class="npp-empty-content">
            <span class="npp-eyebrow">Required first step</span>
            <h3>Connect your parish Stripe account</h3>
            <p>AGAPAY needs a Standard connected account before it can measure donation and non-donation payment volume.</p>
            <div class="npp-benefit-row" aria-label="What happens after connecting Stripe">
              <span>Automatic volume tracking</span>
              <span>80% eligibility monitoring</span>
              <span>Secure parish-level reporting</span>
            </div>
            <div class="npp-empty-actions">
              <button class="btn btn-primary" type="button" onclick="startStripeOnboarding(this)" ${billingReady ? '' : 'disabled title="Complete AGAPAY subscription billing first"'}>
                ${billingReady ? 'Connect Stripe' : 'Complete billing to connect Stripe'}
              </button>
              <small>${billingReady ? 'You will finish securely in Stripe.' : 'Stripe connection unlocks after subscription billing is active.'}</small>
            </div>
          </div>
        </div>`;
    return;
  }
  const complete = Boolean(volume.scan?.complete);
  const percent = Number(volume.donationPercent || 0);
  const thresholdMet = complete && percent >= Number(volume.thresholdPercent || 80);
  const status = !complete ? 'Scan in progress' : thresholdMet ? 'Volume threshold met' : 'Below 80% threshold';
  body.innerHTML = `
      <div class="pdx-kpi-band" style="margin:0;">
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Donation share</div><div class="pdx-kpi-value">${percent.toFixed(2)}%</div><div class="pdx-kpi-meta">${escapeHtml(status)}</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Donations</div><div class="pdx-kpi-value">${money(volume.donationNetCents || 0)}</div><div class="pdx-kpi-meta">Net Stripe volume</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Non-donations</div><div class="pdx-kpi-value">${money(volume.nonDonationNetCents || 0)}</div><div class="pdx-kpi-meta">Commerce and other classified payments</div></div>
        <div class="pdx-kpi-card"><div class="pdx-kpi-label">Unclassified</div><div class="pdx-kpi-value">${money(volume.unclassifiedNetCents || 0)}</div><div class="pdx-kpi-meta">Included in total, not counted as donations</div></div>
      </div>
      <p style="margin:14px 0 0;color:var(--muted);font-size:13px;">${escapeHtml(volume.note || '')} This is an operational estimate; Stripe makes the pricing decision.</p>
    `;
}
async function nonprofitPricingFetch(path = '', init = {}) {
  const response = await fetch(
    '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/nonprofit-pricing' + path,
    {
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || 'Unable to update the nonprofit-pricing application');
  return data;
}
async function loadNonprofitPricing(btn) {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!currentParish || !body) return;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  try {
    const data = await nonprofitPricingFetch();
    renderNonprofitPricingApplication(data);
  } catch (err) {
    if (/connect the parish standard stripe account/i.test(err.message || '')) {
      renderNonprofitPricingDisconnected();
    } else {
      document.getElementById('nonprofitPricingApplicationPanel')?.classList.remove('npp-panel-expanded');
      body.innerHTML = `<div class="insights-empty-dark">${escapeHtml(err.message)}</div>`;
    }
  } finally {
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}
function renderNonprofitPricingDisconnected() {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!body) return;
  document.getElementById('nonprofitPricingApplicationPanel')?.classList.remove('npp-panel-expanded');
  body.innerHTML = `
      <div class="npp-empty-state npp-empty-state-secondary">
        <div class="npp-empty-mark npp-empty-mark-muted" aria-hidden="true">%</div>
        <div class="npp-empty-content">
          <span class="npp-eyebrow">Unlocks after Stripe connection</span>
          <h3>Your application workspace will appear here</h3>
          <p>Once Stripe is connected, AGAPAY will calculate the parish’s donation share and guide you through attestation, document upload, and submission to Stripe.</p>
          <div class="npp-mini-steps" aria-label="Nonprofit pricing application steps">
            <div class="is-current"><strong>1</strong><span>Connect Stripe</span></div>
            <div><strong>2</strong><span>Verify 80% donation volume</span></div>
            <div><strong>3</strong><span>Prepare and submit</span></div>
          </div>
          <button class="btn btn-primary npp-stripe-account-button" type="button" onclick="document.getElementById('stripeVolumePanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })">Manage Stripe Account</button>
        </div>
      </div>`;
}
function renderNonprofitPricingApplication(data) {
  const body = document.getElementById('nonprofitPricingApplicationBody');
  if (!body) return;
  document.getElementById('nonprofitPricingApplicationPanel')?.classList.add('npp-panel-expanded');
  const application = data.application || {};
  const readiness = application.readiness || {};
  const confirmations = application.confirmations || {};
  const documents = (application.documents || []).filter((document2) => document2.isCurrent);
  const statusLabel2 = String(application.status || 'not_started').replaceAll('_', ' ');
  const measuredPercent = Number(data.volume?.donationPercent || 0).toFixed(2);
  const applicationParishName = currentParish.parishName || currentParish.name || 'The parish';
  const applicationStatement = `${applicationParishName} confirms that ${measuredPercent}% of its measured year-to-date Stripe payment volume is from tax-deductible donations. The parish is a registered nonprofit organization and requests review for Stripe nonprofit pricing for connected account ${application.stripeAccountId || ''}. An authorized account owner is submitting this request while logged into the parish Stripe account.`;
  const checks = [
    ['Complete Stripe volume scan', readiness.measurementComplete],
    ['At least 80% measured donation volume', readiness.measuredAtOrAbove80],
    ['Signed parish attestation', readiness.attestationComplete],
    ['Nonprofit documentation uploaded', readiness.hasNonprofitProof],
  ];
  body.innerHTML = `
      <div style="display:grid;gap:18px;">
        <div class="insights-empty-dark" style="text-align:left;">
          <strong>Stripe confirmed:</strong> each Standard connected parish must apply separately. The account owner must be logged into the parish Stripe account and contact Stripe directly. AGAPAY prepares and tracks the packet but cannot submit it for the parish.
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><strong>Application status</strong><span>${escapeHtml(statusLabel2)}</span></div>
          <div style="display:grid;gap:6px;margin-top:10px;">${checks.map(([label, done]) => `<div>${done ? '✓' : '○'} ${escapeHtml(label)}</div>`).join('')}</div>
        </div>
        <div style="display:grid;gap:8px;">
          <strong>Application statement</strong>
          <textarea id="nppApplicationStatement" rows="4" readonly>${escapeHtml(applicationStatement)}</textarea>
          <button class="btn btn-secondary btn-sm" type="button" onclick="copyNonprofitPricingStatement()">Copy statement</button>
          <small style="color:var(--muted);">AGAPAY uses year-to-date volume because Stripe did not confirm its review team’s measurement period. Stripe makes the final determination.</small>
        </div>
        <form onsubmit="saveNonprofitPricingAttestation(event)" style="display:grid;gap:10px;">
          <strong>Authorized representative attestation</strong>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
            <input id="nppAttestedName" required maxlength="160" placeholder="Representative name" value="${escapeAttr(application.attestedByName || '')}" />
            <input id="nppAttestedTitle" required maxlength="160" placeholder="Title, e.g. Treasurer" value="${escapeAttr(application.attestedByTitle || '')}" />
            <input id="nppEinLastFour" required maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="EIN last four" value="${escapeAttr(application.einLastFour || '')}" />
          </div>
          <label><input id="nppRegistered" type="checkbox" ${confirmations.registeredNonprofit ? 'checked' : ''}> I confirm the parish is a registered nonprofit organization.</label>
          <label><input id="nppTaxDeductible" type="checkbox" ${confirmations.taxDeductibleDonations ? 'checked' : ''}> I confirm the payments classified as donations are tax-deductible donations.</label>
          <label><input id="nppOver80" type="checkbox" ${confirmations.over80Percent ? 'checked' : ''}> I confirm that more than 80% of this Stripe account’s payment volume comes from tax-deductible donations.</label>
          <label><input id="nppOwnerSubmit" type="checkbox" ${confirmations.accountOwnerSubmission ? 'checked' : ''}> I understand an authorized parish account owner must sign in to Stripe and submit the request directly.</label>
          <button class="btn btn-primary btn-sm" type="submit">Sign and save attestation</button>
        </form>
        <form onsubmit="uploadNonprofitPricingDocument(event)" style="display:grid;gap:10px;">
          <strong>Private supporting documents</strong>
          <p style="margin:0;color:var(--muted);font-size:13px;">Upload an IRS determination letter, tax-exempt proof, or Stripe’s eventual approval message. Files remain private and are served only through authenticated dashboard routes.</p>
          <div style="display:grid;grid-template-columns:minmax(180px,0.5fr) minmax(220px,1fr) auto;gap:10px;">
            <select id="nppDocumentType"><option value="irs_determination">IRS determination letter</option><option value="tax_exempt_proof">Other tax-exempt proof</option><option value="stripe_approval">Stripe approval message</option><option value="other">Other</option></select>
            <input id="nppDocumentFile" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
            <button class="btn btn-secondary btn-sm" type="submit">Upload</button>
          </div>
          <div>${documents.length ? documents.map((document2) => `<button type="button" class="pdx-link-btn" onclick="viewNonprofitPricingDocument('${escapeAttr(document2.id)}')">${escapeHtml(document2.documentType.replaceAll('_', ' '))}: ${escapeHtml(document2.filename)}</button>`).join('<br>') : '<span style="color:var(--muted);">No documents uploaded yet.</span>'}</div>
        </form>
        <div style="display:grid;gap:10px;">
          <strong>Submit through the parish Stripe account</strong>
          <p style="margin:0;color:var(--muted);font-size:13px;">When all four readiness checks are complete, sign in to Stripe, open Support, and request nonprofit pricing. Include the account ID, registered email, donation-volume confirmation, tax registration details, and tax-exempt documentation.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-secondary btn-sm" href="https://support.stripe.com/contact" target="_blank" rel="noopener">Open Stripe Support</a><input id="nppStripeCaseId" maxlength="120" placeholder="Stripe support case ID (if provided)" value="${escapeAttr(application.stripeSupportCaseId || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="markNonprofitPricingSubmitted(this)" ${readiness.readyToSubmit ? '' : 'disabled'}>I submitted this to Stripe</button></div>
        </div>
        ${
          application.status === 'submitted_to_stripe' ||
          application.status === 'stripe_approved' ||
          application.status === 'stripe_declined'
            ? `
          <div style="display:grid;gap:10px;">
            <strong>Record Stripe’s response</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;">Stripe said its review team will notify the connected account when pricing is applied. Upload that message above before recording approval.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;"><input id="nppEffectiveDate" type="date" value="${escapeAttr(application.stripeEffectiveDate || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="recordNonprofitPricingDecision('approved',this)">Stripe approved</button><button class="btn btn-secondary btn-sm" type="button" onclick="recordNonprofitPricingDecision('declined',this)">Stripe declined</button></div>
          </div>`
            : ''
        }
      </div>
    `;
}
async function copyNonprofitPricingStatement() {
  const statement = document.getElementById('nppApplicationStatement')?.value || '';
  try {
    await navigator.clipboard.writeText(statement);
    setStatus('Application statement copied.', 'success');
  } catch {
    const field = document.getElementById('nppApplicationStatement');
    field?.select();
    setStatus('Select and copy the application statement.', '');
  }
}
async function saveNonprofitPricingAttestation(event) {
  event.preventDefault();
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_attestation',
        name: document.getElementById('nppAttestedName')?.value || '',
        title: document.getElementById('nppAttestedTitle')?.value || '',
        einLastFour: document.getElementById('nppEinLastFour')?.value || '',
        registeredNonprofit: Boolean(document.getElementById('nppRegistered')?.checked),
        taxDeductibleDonations: Boolean(document.getElementById('nppTaxDeductible')?.checked),
        over80Percent: Boolean(document.getElementById('nppOver80')?.checked),
        accountOwnerSubmission: Boolean(document.getElementById('nppOwnerSubmit')?.checked),
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus('Nonprofit-pricing attestation saved.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}
async function uploadNonprofitPricingDocument(event) {
  event.preventDefault();
  const file = document.getElementById('nppDocumentFile')?.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.set('documentType', document.getElementById('nppDocumentType')?.value || '');
  form.set('document', file);
  try {
    await nonprofitPricingFetch('/documents', { method: 'POST', body: form });
    await loadNonprofitPricing();
    setStatus('Private nonprofit document uploaded.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}
async function markNonprofitPricingSubmitted(btn) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_submitted',
        stripeSupportCaseId: document.getElementById('nppStripeCaseId')?.value || '',
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus('Stripe submission recorded.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}
async function recordNonprofitPricingDecision(decision, btn) {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const data = await nonprofitPricingFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_decision',
        decision,
        effectiveDate: document.getElementById('nppEffectiveDate')?.value || '',
      }),
    });
    renderNonprofitPricingApplication(data);
    setStatus(`Stripe ${decision} decision recorded.`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}
async function viewNonprofitPricingDocument(documentId) {
  try {
    const response = await fetch(
      '/api/parish/dashboard/' +
        encodeURIComponent(currentParish.parishId) +
        '/nonprofit-pricing/documents/' +
        encodeURIComponent(documentId),
      { headers: authHeaders() }
    );
    if (!response.ok) throw new Error('Unable to open document');
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}
window.AgapayMfa?.installFetchStepUp();
let currentParish = null;
let editableFunds = [];
let editableCampaigns = [];
let editableFeastCampaigns = [];
let givingCatalogBaseline = '';
let accountingCatalogBaseline = '';
let activeTab = 'giving';
let dashboardLoadPromise = null;
let activeParishFeatureRequest = null;
let parishFeatureRequests = [];
const parishSessionStorageKey = 'agapay_parish_session_token';
const legacyParishTokenStorageKey = 'agapay_parish_token';
const identitySessionStorageKey = 'agapay_identity_session_token';
const identityEmailStorageKey = 'agapay_identity_email';
(function restoreSession() {
  try {
    const isDashboardPage = Boolean(document.getElementById('setupWizardPane'));
    const id = sessionStorage.getItem('agapay_parish_id');
    const token = sessionStorage.getItem(parishSessionStorageKey);
    const parishIdField2 = document.getElementById('parishId');
    const parishTokenField = document.getElementById('parishToken');
    const urlParish = new URLSearchParams(window.location.search).get('parish');
    sessionStorage.removeItem(legacyParishTokenStorageKey);
    if (isDashboardPage && (!id || !token)) {
      const suffix = urlParish || id;
      window.location.replace('/give/login' + (suffix ? `?parish=${encodeURIComponent(suffix)}` : ''));
      return;
    }
    if (id && parishIdField2) parishIdField2.value = id;
    if (token && parishTokenField) parishTokenField.value = token;
    if (id && token && isDashboardPage) {
      setTimeout(() => {
        const btn = document.getElementById('loadBtn');
        loadDashboard(btn);
      }, 120);
    }
  } catch {}
})();
function setStatus(message, tone = '') {
  if (!message) return;
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = tone ? `toast ${tone}` : 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4e3);
}
window.addEventListener('offline', () => {
  if (activeTab === 'accounting')
    setStatus('Connection lost. Your open Accounting form is still here; reconnect before submitting again.', 'error');
});
window.addEventListener('online', () => {
  if (activeTab === 'accounting') setStatus('Connection restored. Review the open form, then retry once.', 'success');
});
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (activeTab === 'accounting')
    setStatus('AGAPAY was updated safely. Your open Accounting form was preserved.', 'success');
});
function authHeaders() {
  const headers = {
    Accept: 'application/json',
    Authorization: 'Bearer ' + document.getElementById('parishToken').value.trim(),
  };
  const accountingSession = accountingStaffSession();
  if (accountingSession?.profile?.id && accountingSession?.token) {
    headers['X-AGAPAY-Accounting-Profile'] = accountingSession.profile.id;
    headers['X-AGAPAY-Accounting-Token'] = accountingSession.token;
  }
  return headers;
}
function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(v) {
  return escapeHtml(v).replace(/'/g, '&#39;');
}
const starterLockedFeatures = {
  options: [
    'Custom funds & alms',
    'Create and name custom funds, organize designated giving, and manage standing alms with Give +.',
  ],
  campaigns: ['Campaign pages', 'Create goal-based, shareable campaigns with Give +.'],
  givers: ['Giver insights', 'See donor-level history and deeper giving reports with Give +.'],
  reconcile: ['Monthly reconciliation', 'Understand Stripe payouts and fund allocations on every plan.'],
  commemorations: [
    'Commemorations',
    'Give includes candle giving. Liturgical commemorations, Moliebens, Panikhidas, and the priest queue are included with Give +.',
  ],
  statements: ['Annual giving statements', 'Generate and email annual donor statements with Give +.'],
  stewardship: [
    'Stewardship Health',
    'Track pledges, understand giving health, prepare stewardship reports, and keep annual records with Give +.',
  ],
  bookstore: [
    'Parish Commerce',
    'Manage bookstore sales now and add more parish commerce products as they become available with Give +; Events and Meals require Full Commerce or Parish.',
  ],
  sacraments: [
    'Sacraments & Services',
    'Receive pastoral requests, coordinate clergy schedules, and keep families informed with the Parish tier.',
  ],
  text: [
    'Text-to-Give',
    'Reserve parish keywords and route donors from the shared AGAPAY number to the right giving page with the Parish tier.',
  ],
  accounting: [
    'Parish Accounting',
    'Keep funds, ledgers, payables, budgets, reconciliation, and financial reports together with the Parish tier.',
  ],
  directory: [
    'Parish Directory',
    'Manage member and household records, privacy controls, namedays, ministries, and parish connections with the Parish tier.',
  ],
};
let settlementProfilesState = {
  loaded: false,
  loading: false,
  profiles: [],
  profileTypes: [],
  stewardshipActive: false,
};
const SETTLEMENT_MODULE_LABELS = {
  giving: 'Giving (donations)',
  bookstore: 'Bookstore Payments',
  events: 'Meals & Events',
};
const SETTLEMENT_TYPE_LABELS = {
  general_giving: 'General Giving',
  liturgical: 'Liturgical',
  bookstore: 'Bookstore',
  festival: 'Festival',
  school: 'School',
  cemetery: 'Cemetery',
  camp: 'Camp',
  hall_rental: 'Hall Rental',
  fundraisers: 'Fundraisers',
};
const taxExemptionJurisdictions = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'FEDERAL',
  'OTHER',
];
function renderDashboard() {
  const p = currentParish;
  updateTierScopedNavigation();
  renderSubscriptionPanel();
  document.getElementById('sidebarProfile').classList.add('visible');
  document.getElementById('sidebarParishName').textContent = p.parishName || 'Parish';
  const sidebarLogo = document.getElementById('sidebarParishLogo');
  if (sidebarLogo) {
    sidebarLogo.hidden = !p.logoUrl;
    sidebarLogo.src = p.logoUrl || '';
    sidebarLogo.alt = p.logoUrl ? `${p.parishName || 'Parish'} logo` : '';
  }
  const parishMeta = [p.communityType, p.jurisdiction, [p.city, p.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' / ');
  document.getElementById('sidebarParishMeta').textContent = parishMeta;
  const chip = document.getElementById('sidebarStatusChip');
  const tierLabel = String(p.subscriptionTierLabel || p.subscriptionTier || 'Unassigned').trim();
  const tierDisplay = /\btier$/i.test(tierLabel) ? tierLabel : `${tierLabel} tier`;
  chip.textContent = `${statusLabel(p.givingStatus || 'active')} · ${tierDisplay}`;
  const isOnboardingLive = p.onboarding?.state === 'LIVE';
  chip.className = `sidebar-status-chip ${p.givingStatus || 'active'}${isOnboardingLive ? ' is-live' : ''}`;
  window.ParishFeatureRegistry?.get('giving')?.renderOverview();
  document.getElementById('sidebarPublicLink').href = dedicatedGivingUrl();
  const embedPreviewLink = document.getElementById('givingEmbedPreviewLink');
  if (embedPreviewLink) embedPreviewLink.href = dedicatedGivingEmbedUrl();
  document.getElementById('topbarTitle').textContent = p.parishName || 'Parish Dashboard';
  syncTopbarTabIcon(activeTab);
  const commIcon = document.getElementById('commemorationCommunityIcon');
  if (commIcon) commIcon.innerHTML = communityMarkIcon(p);
  const overviewEmpty = document.getElementById('overviewEmpty');
  if (overviewEmpty) overviewEmpty.style.display = 'none';
  renderSetupWizard();
  updateStarterPaywalls();
  const billingActive = Boolean((p.setup || {}).billingActive);
  const demoActive = subscriptionDemoActive(p);
  const demoEligible = Boolean(p.subscriptionIntroDemoEligible);
  const demoEndLabel = subscriptionDemoDateLabel(p);
  const canCancelSubscription = Boolean(
    p.stripeSubscriptionId && ['active', 'trialing'].includes(String(p.subscriptionStatus || '').toLowerCase())
  );
  const cancelSubscriptionButton = canCancelSubscription
    ? '<button class="btn btn-danger" onclick="openSubscriptionCancellation(this)">Cancel AGAPAY Give</button>'
    : '';
  const tierOptions = tierOptionsMarkup(p.subscriptionTier);
  document.getElementById('settingsPane').innerHTML = `
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Parish logo</label>
          <div class="parish-logo-settings">
            ${
              !hasGivingPlusAccess()
                ? `<div class="parish-logo-preview parish-logo-placeholder">Give +<br>feature</div>
                <div>
                  <p class="section-note">Add your parish logo to the dashboard, public giving pages, campaign pages, and church search with Give +. Any logo previously uploaded is preserved and will reappear if you upgrade.</p>
                  <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to Give +</button>
                </div>`
                : p.logoUrl
                  ? `<img class="parish-logo-preview" src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml((p.parishName || 'Parish') + ' logo')}" />`
                  : '<div class="parish-logo-preview parish-logo-placeholder">No logo<br>uploaded</div>'
            }
            ${
              hasGivingPlusAccess()
                ? `<div>
              <div class="parish-logo-actions">
                <input id="parishLogoFile" type="file" accept="image/png,image/jpeg,image/webp" />
                <button class="btn btn-gold" type="button" onclick="uploadParishLogo(this)">Upload logo</button>
                ${p.logoUrl ? '<button class="btn btn-ghost" type="button" onclick="removeParishLogo(this)">Remove</button>' : ''}
              </div>
              <p class="section-note">PNG, JPG, or WebP, up to 5MB. A square image with a transparent or white background works best. Your logo appears on the dashboard, giving pages, campaigns, and church search.</p>
            </div>`
                : ''
            }
          </div>
        </div>
        <div class="form-group full"><label class="form-label" for="parishName">Parish name</label><input id="parishName" value="${escapeHtml(p.parishName || '')}" placeholder="Parish name" /></div>
        <div class="form-group"><label class="form-label">Jurisdiction</label><input value="${escapeHtml(p.jurisdiction || '')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="addressLine1">Address line 1</label><input id="addressLine1" value="${escapeHtml(p.addressLine1 || '')}" placeholder="Street address" /></div>
        <div class="form-group full"><label class="form-label" for="addressLine2">Address line 2</label><input id="addressLine2" value="${escapeHtml(p.addressLine2 || '')}" placeholder="Suite, unit, building (optional)" /></div>
        <div class="form-group"><label class="form-label" for="city">City</label><input id="city" value="${escapeHtml(p.city || '')}" placeholder="City" /></div>
        <div class="form-group"><label class="form-label" for="state">State</label><input id="state" value="${escapeHtml(p.state || '')}" placeholder="State" /></div>
        <div class="form-group"><label class="form-label" for="postalCode">Postal code</label><input id="postalCode" value="${escapeHtml(p.postalCode || '')}" placeholder="ZIP / postal code" /></div>
        <div class="form-group"><label class="form-label" for="country">Country</label><input id="country" value="${escapeHtml(p.country || 'US')}" placeholder="Country code" /></div>
        <div class="form-group full"><label class="form-label" for="website">Website</label><input id="website" value="${escapeHtml(p.website || '')}" placeholder="https://example.org" /></div>
        <div class="form-group full"><label class="form-label" for="taxLegalName">Legal name for tax receipts</label><input id="taxLegalName" value="${escapeHtml(p.taxLegalName || '')}" placeholder="Defaults to parish name if left blank" /></div>
        <div class="form-group"><label class="form-label" for="taxEin">Federal EIN</label><input id="taxEin" value="${escapeHtml(p.taxEin || '')}" placeholder="##-#######" /></div>
        <div class="form-group full"><label class="form-label" for="settingsLiturgicalCalendar">Liturgical calendar</label><select id="settingsLiturgicalCalendar"><option value="julian" ${(p.liturgicalCalendar || 'julian') === 'julian' ? 'selected' : ''}>Julian</option><option value="gregorian" ${p.liturgicalCalendar === 'gregorian' ? 'selected' : ''}>Revised-Julian</option></select></div>
        <div class="form-group full">
          <label class="form-label" for="patronalFeastName">Patronal saint or feast</label>
          <input id="patronalFeastName" list="patronalFeastSuggestions" value="${escapeHtml(patronalFeastDisplayName(p))}" placeholder="e.g. St. Nicholas the Wonderworker" onchange="syncPatronalFeastOptionsFromSettings()" />
          <datalist id="patronalFeastSuggestions">${allFeastPresets()
            .map((feast) => `<option value="${escapeHtml(feast.name)}"></option>`)
            .join('')}</datalist>
          <p class="section-note">Begin typing or enter any Orthodox saint or feast. The suggestions are conveniences, not the complete Church calendar.</p>
        </div>
        ${(() => {
          const observed = patronalMonthDay(p.patronalFeastDate);
          return `
        <div class="form-group">
          <label class="form-label" for="patronalFeastMonth">Observed feast month</label>
          <select id="patronalFeastMonth" onchange="updatePatronalFeastDays()">
            <option value="">Select month...</option>
            ${patronalMonthOptions(observed.month)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="patronalFeastDay">Observed feast day</label>
          <select id="patronalFeastDay">
            <option value="">Select day...</option>
            ${patronalDayOptions(observed.month, observed.day)}
          </select>
          <p class="section-note">The patronal feast recurs annually, so no year is needed.</p>
        </div>
        `;
        })()}
        <div class="form-group"><label class="form-label" for="givingStatus">Giving page status</label><select id="givingStatus"><option value="active" ${p.givingStatus === 'active' ? 'selected' : ''} ${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? 'disabled' : ''}>Active${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? ' — requires treasurer signoff' : ''}</option><option value="paused" ${p.givingStatus === 'paused' ? 'selected' : ''}>Paused</option><option value="hidden" ${p.givingStatus === 'hidden' ? 'selected' : ''}>Hidden</option></select>${p.onboarding?.enabled && p.onboarding?.state !== 'LIVE' ? '<p class="section-note">AGAPAY activates the page automatically when the treasurer completes Go Live.</p>' : ''}</div>
        <div class="form-group"><label class="form-label">Stripe onboarding</label><input value="${escapeHtml(p.stripeAccountStatus || 'not_started')}" disabled /></div>
      </div>
      <p class="section-note">Changes here affect the parish's public giving page and visibility in the AGAPAY directory. Legal name and EIN are used on annual donor giving statements (Givers tab).</p>
      <div class="section-divider"><span>Dashboard password</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label" for="newDashboardPassword">New password</label><input id="newDashboardPassword" type="password" placeholder="At least 8 characters" autocomplete="new-password" /></div>
        <div class="form-group"><label class="form-label" for="confirmDashboardPassword">Confirm password</label><input id="confirmDashboardPassword" type="password" placeholder="Re-enter new password" autocomplete="new-password" /></div>
      </div>
      <p class="section-note">Leave blank unless you want to change the parish dashboard password.</p>
      <div class="section-divider"><span>Team access</span></div>
      <div id="parishStaffAccessManager"><div class="staff-access-loading">Loading staff access…</div></div>
      <div class="section-divider"><span>Clergy scheduling contacts</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Priest access</label><input value="${escapeHtml(p.priestEmail || 'Not listed')}" disabled /></div>
        <div class="form-group"><label class="form-label">Treasurer access</label><input value="${escapeHtml(p.treasurerEmail || 'Not listed')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="sacramentPriestsText">Sacraments &amp; Services priests</label><textarea id="sacramentPriestsText" rows="4" placeholder="Fr. Michael | fr.michael@example.org&#10;Fr. Andrew | fr.andrew@example.org">${escapeHtml(formatSacramentPriestsForSettings(p.sacramentPriests || []))}</textarea></div>
      </div>
      <p class="section-note">These addresses route Sacraments &amp; Services assignments and notifications; they do not create logins. Add personal access above for every person who signs in.</p>
      <div class="section-divider"><span>AGAPAY sales tax</span></div>
      <p class="section-note">A parish's nonprofit status does not automatically make every purchase tax-free. Submit the applicable exemption certificate here; AGAPAY will review it before changing subscription billing in Stripe.</p>
      <div id="taxExemptionPane" class="tax-exemption-pane"><p class="section-note">Loading sales-tax status…</p></div>
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      ${parishPricingUsageMarkup()}
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Current tier</label><input value="${escapeHtml(p.subscriptionTierLabel || p.subscriptionTier || 'Not selected')}" disabled /></div>
        <div class="form-group"><label class="form-label">Billing status</label><input value="${escapeHtml(statusLabel(p.subscriptionStatus || 'not_started'))}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="subscriptionTierUpgrade">Change AGAPAY tier</label><select id="subscriptionTierUpgrade" onchange="syncParishHouseholdPricing('subscriptionTierUpgrade','subscriptionHouseholdBandUpgrade','subscriptionHouseholdBandGroup','subscriptionHouseholdBandPrice');syncSubscriptionAddOnVisibility('subscriptionTierUpgrade','subscriptionAddOnUpgradeGroup')">${tierOptions}</select></div>
        ${parishHouseholdPickerMarkup({ tierSelectId: 'subscriptionTierUpgrade', bandSelectId: 'subscriptionHouseholdBandUpgrade', groupId: 'subscriptionHouseholdBandGroup', summaryId: 'subscriptionHouseholdBandPrice' })}
        ${subscriptionAddOnPickerMarkup({ tierSelectId: 'subscriptionTierUpgrade', groupId: 'subscriptionAddOnUpgradeGroup' })}
      </div>
      <p class="section-note">${p.parishId === 'st-fiacre' ? 'Demo mode: switch tiers instantly to show churches how AGAPAY changes at each level. No Stripe billing is changed.' : demoActive ? `Your free 30-day demo is active${demoEndLabel ? ` through ${escapeHtml(demoEndLabel)}` : ''}. No card is required during the demo. Add billing information in the secure portal only if you want to continue afterward.` : billingActive ? "Choose a tier or individual Give + add-ons here to update the existing AGAPAY subscription. Use Stripe's secure billing portal for payment details or cancellation." : demoEligible ? 'Choose a tier and start the free 30-day demo. No card is required. Give + includes pledges, Stewardship Health, Parish Directory, and Bookstore; Parish includes the complete operations suite.' : 'Choose a tier and complete subscription checkout to reactivate AGAPAY.'}</p>
      <div class="btn-row">
        ${p.parishId === 'st-fiacre' ? '<button class="btn btn-gold" onclick="changeDemoTier(this)">Apply demo tier</button>' : demoActive ? `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">Apply demo tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Add billing details</button>` + cancelSubscriptionButton : billingActive ? `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">Apply tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage payment details</button>` + cancelSubscriptionButton : `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">${demoEligible ? 'Start free 30-day demo' : 'Start tier checkout'}</button>`}
      </div>
      <div class="setup-link-box" id="subscriptionUpgradeLinkBox"><a id="subscriptionUpgradeLink" href="#" target="_blank" rel="noopener">Open billing checkout</a><p id="subscriptionUpgradeHelp"></p></div>
      <div id="parishBackupCard"></div>
      <div class="section-divider"><span>Stripe account</span></div>
      <p class="section-note">Manage your parish Stripe account — update bank account details, payout schedule, business information, and view your full transaction history directly in Stripe.</p>
      <div class="btn-row">
        ${p.stripeAccountId && p.stripeChargesEnabled ? `<a class="btn btn-gold" href="https://dashboard.stripe.com" target="_blank" rel="noopener">Manage Stripe account ↗</a>` : `<button class="btn btn-ghost" disabled title="Complete Stripe onboarding to access your Stripe account">Stripe account not yet active</button>`}
      </div>
      <div class="section-divider"><span>Feature toggles</span></div>
      <div class="toggle-row">
        <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(p.recurringGivingEnabled ?? true) ? 'checked' : ''} /> Recurring giving</label>
        <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(p.candlesEnabled ?? true) ? 'checked' : ''} /> Candles</label>
        <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(p.commemorationsEnabled ?? true) ? 'checked' : ''} /> Commemorations</label>
        <label class="check-card" ${moduleIncluded('bookstore') ? '' : 'title="Requires Give + or Parish"'}>
          <input id="bookstoreEnabled" type="checkbox" ${moduleIncluded('bookstore') ? '' : 'disabled'} ${(p.bookstoreEnabled ?? false) ? 'checked' : ''} /> Bookstore Payments
        </label>
      </div>
      ${moduleIncluded('bookstore') ? '' : '<p class="section-note">Bookstore is included in Give +. Full Commerce adds Events and Meals; Parish includes the entire suite.</p>'}
      <div class="btn-row">
        <button class="btn btn-gold" onclick="saveDashboard(this)">Save changes</button>
        ${(p.setup || {}).billingActive ? '<button class="btn btn-primary" onclick="startStripeOnboarding(this)">Start Stripe onboarding</button>' : '<button class="btn btn-ghost" disabled title="Complete AGAPAY billing first">Stripe unlocks after billing</button>'}
        <button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button>
        <button class="btn btn-ghost" onclick="logoutParish()">Log out</button>
      </div>
      <div class="stripe-link-box" id="stripeLinkBox">
        <a id="stripeOnboardingLink" href="#" target="_blank" rel="noopener">Open Stripe onboarding</a>
        <p>Stripe onboarding links are single-use. If the link expires, return here and create a new one.</p>
      </div>`;
  window.ParishBackup?.mount({
    element: document.getElementById('parishBackupCard'),
    parishId: p.parishId,
    headers: authHeaders,
  });
  syncParishHouseholdPricing(
    'subscriptionTierUpgrade',
    'subscriptionHouseholdBandUpgrade',
    'subscriptionHouseholdBandGroup',
    'subscriptionHouseholdBandPrice'
  );
  syncSubscriptionAddOnVisibility('subscriptionTierUpgrade', 'subscriptionAddOnUpgradeGroup');
  syncPatronalFeastOptionsFromSettings();
  loadParishTaxExemption();
  loadParishStaffAccess();
  editableFunds = fallbackFundsArray(p.funds);
  editableCampaigns = fallbackCampaignsArray(p.campaigns);
  editableFeastCampaigns = Array.isArray(p.feastCampaigns)
    ? p.feastCampaigns.map((campaign) => ({
        ...campaign,
        destinationFundId: campaign.destinationFundId || 'benevolence-fund',
      }))
    : [];
  if (p.patronalFeast && (p.patronalFeastName || p.parishPatronalFeastName)) {
    upsertPatronalFeastCampaign(
      p.patronalFeast,
      p.liturgicalCalendar || 'julian',
      p.patronalFeastName || p.parishPatronalFeastName,
      p.patronalFeastDate || p.parishPatronalFeastDate || ''
    );
  }
  givingCatalogBaseline = givingCatalogSnapshot();
  accountingCatalogBaseline = accountingCatalogSnapshot();
  if (activeTab === 'options') window.ParishFeatureRegistry?.get('giving')?.renderOptions();
  if (activeTab === 'campaigns') loadRegisteredParishFeature('campaigns');
}
function payload() {
  const newPw = document.getElementById('newDashboardPassword')?.value.trim() || '';
  const conPw = document.getElementById('confirmDashboardPassword')?.value.trim() || '';
  if (newPw || conPw) {
    if (newPw.length < 8) throw new Error('Password must be at least 8 characters.');
    if (newPw !== conPw) throw new Error('Passwords do not match.');
  }
  const liturgicalCalendar =
    document.getElementById('feastLiturgicalCalendar')?.value ||
    document.getElementById('settingsLiturgicalCalendar')?.value ||
    currentParish?.liturgicalCalendar ||
    'julian';
  const patronalFeastName = document.getElementById('patronalFeastName')?.value.trim() || '';
  const patronalFeastMonth = Number(document.getElementById('patronalFeastMonth')?.value || 0);
  const patronalFeastDay = Number(document.getElementById('patronalFeastDay')?.value || 0);
  if (patronalFeastName && (!patronalFeastMonth || !patronalFeastDay))
    throw new Error('Select the patronal feast month and day.');
  const patronalFeastDate =
    patronalFeastMonth && patronalFeastDay
      ? `${String(patronalFeastMonth).padStart(2, '0')}-${String(patronalFeastDay).padStart(2, '0')}`
      : '';
  const knownPatronalFeast = allFeastPresets().find((feast) => feast.name === patronalFeastName);
  const patronalFeast = patronalFeastName ? knownPatronalFeast?.id || slugifyLocal(patronalFeastName) : '';
  upsertPatronalFeastCampaign(patronalFeast, liturgicalCalendar, patronalFeastName, patronalFeastDate);
  const body = {
    parishName: document.getElementById('parishName')?.value,
    addressLine1: document.getElementById('addressLine1')?.value,
    addressLine2: document.getElementById('addressLine2')?.value,
    city: document.getElementById('city')?.value,
    state: document.getElementById('state')?.value,
    postalCode: document.getElementById('postalCode')?.value,
    country: document.getElementById('country')?.value,
    website: document.getElementById('website')?.value,
    taxLegalName: document.getElementById('taxLegalName')?.value,
    taxEin: document.getElementById('taxEin')?.value,
    liturgicalCalendar,
    patronalFeast,
    patronalFeastName,
    patronalFeastDate,
    givingStatus: document.getElementById('givingStatus')?.value,
    recurringGivingEnabled: document.getElementById('recurringGivingEnabled')?.checked,
    candlesEnabled: document.getElementById('candlesEnabled')?.checked,
    commemorationsEnabled: document.getElementById('commemorationsEnabled')?.checked,
    bookstoreEnabled: document.getElementById('bookstoreEnabled')?.checked,
    sacramentPriests: parseSacramentPriestsFromSettings(),
    ...(hasFundManagementAccess()
      ? {
          funds: editableFunds,
          givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
          accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline,
          ...(hasGivingPlusAccess()
            ? {
                campaigns: editableCampaigns,
                feastCampaigns: editableFeastCampaigns,
              }
            : {}),
        }
      : {}),
  };
  if (newPw) body.newDashboardPassword = newPw;
  return body;
}
const params = new URLSearchParams(window.location.search);
const parishIdField = document.getElementById('parishId');
if (params.get('parish') && parishIdField) parishIdField.value = params.get('parish');
window.ParishFeatureRegistry?.get('giving')?.init();
if (!initParishAccessInvitationPage()) initParishPasswordResetPage();
