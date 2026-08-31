// ── STATE ────────────────────────────────────────────────
  window.AgapayMfa?.installFetchStepUp();
  let currentParish     = null;
  let editableFunds     = [];
  let editableCampaigns = [];
  let editableFeastCampaigns = [];
  let givingCatalogBaseline = '';
  let accountingCatalogBaseline = '';
  let activeTab         = 'giving';
  let dashboardLoadPromise = null;
  let activeParishFeatureRequest = null;
  let parishFeatureRequests = [];
  const parishSessionStorageKey = 'agapay_parish_session_token';
  const legacyParishTokenStorageKey = 'agapay_parish_token';
  const identitySessionStorageKey = 'agapay_identity_session_token';
  const identityEmailStorageKey = 'agapay_identity_email';

  function givingCatalogSnapshot() {
    return JSON.stringify({
      funds: editableFunds,
      campaigns: editableCampaigns,
      feastCampaigns: editableFeastCampaigns
    });
  }

  function accountingCatalogSnapshot() {
    return JSON.stringify({
      funds: editableFunds,
      campaigns: editableCampaigns
    });
  }

  // ── SESSION PERSISTENCE ──────────────────────────────────
  (function restoreSession() {
    try {
      const isDashboardPage = Boolean(document.getElementById('setupWizardPane'));
      const id    = sessionStorage.getItem('agapay_parish_id');
      const token = sessionStorage.getItem(parishSessionStorageKey);
      const parishIdField = document.getElementById('parishId');
      const parishTokenField = document.getElementById('parishToken');
      const urlParish = new URLSearchParams(window.location.search).get('parish');
      sessionStorage.removeItem(legacyParishTokenStorageKey);
      if (isDashboardPage && (!id || !token)) {
        const suffix = urlParish || id;
        window.location.replace('/give/login' + (suffix ? `?parish=${encodeURIComponent(suffix)}` : ''));
        return;
      }
      if (id && parishIdField) parishIdField.value = id;
      if (token && parishTokenField) parishTokenField.value = token;
      if (id && token && isDashboardPage) {
        // Auto-load after a short delay so the page settles
        setTimeout(() => { const btn = document.getElementById('loadBtn'); loadDashboard(btn); }, 120);
      }
    } catch {}
  })();

  function saveSession() {
    try {
      sessionStorage.setItem('agapay_parish_id',    document.getElementById('parishId').value.trim());
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

  // ── TOAST ────────────────────────────────────────────────
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
    setTimeout(() => { toast.classList.remove('show'); toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
  }

  window.addEventListener('offline', () => {
    if (activeTab === 'accounting') setStatus('Connection lost. Your open Accounting form is still here; reconnect before submitting again.', 'error');
  });
  window.addEventListener('online', () => {
    if (activeTab === 'accounting') setStatus('Connection restored. Review the open form, then retry once.', 'success');
  });
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (activeTab === 'accounting') setStatus('AGAPAY was updated safely. Your open Accounting form was preserved.', 'success');
  });

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

  // ── TAB NAV ──────────────────────────────────────────────
  function switchTab(tab) {
    if (tab === 'parishplus') tab = 'bookstore';
    if (tab === 'commerce') tab = 'bookstore';
    if (tab === 'funds') tab = 'options';
    const panel = document.getElementById('tab-' + tab);
    if (!panel) {
      setStatus('That dashboard section is unavailable. Your current page was left open.', 'error');
      return;
    }
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach(n => n.classList.remove('active'));
    const nav   = document.getElementById('nav-' + tab);
    const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
    const content = document.querySelector('.content');
    if (panel) panel.classList.add('active');
    if (nav)   nav.classList.add('active');
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
    if (tab === 'accounting') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    activeTab = tab;
    const titles = { giving:'Giving Overview', reconcile:'Monthly Reconciliation', history:'Giving History', givers:'Givers', settings:'Settings', options:'Funds & Alms', campaigns:'Campaigns', text:'Text-to-Give', stewardship:'Stewardship Health', accounting:'Accounting', sacraments:'Sacraments & Services', directory:'Parish Directory', library:'Parish Library', communications:'Communications', bookstore:'Commerce' };
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    document.getElementById('topbarTitle').textContent = (isMobile && currentParish) ? (currentParish.parishName || 'Parish Dashboard') : (titles[tab] || 'Parish Dashboard');
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

  // ── AUTH ─────────────────────────────────────────────────
  function authHeaders() {
    const headers = { 'Accept':'application/json', 'Authorization':'Bearer ' + document.getElementById('parishToken').value.trim() };
    const accountingSession = accountingStaffSession();
    if (accountingSession?.profile?.id && accountingSession?.token) {
      headers['X-AGAPAY-Accounting-Profile'] = accountingSession.profile.id;
      headers['X-AGAPAY-Accounting-Token'] = accountingSession.token;
    }
    return headers;
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
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function closeParishSupportTicket() {
    const dialog = document.getElementById('parishSupportDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }

  function showParishFeatureRequestPopup(featureRequests = []) {
    const request = featureRequests.find((item) => item?.featureId === 'ministry-service')
      || featureRequests.find((item) => item?.featureId === 'giving-plus')
      || featureRequests.find((item) => item?.featureId === 'pledge-tracker');
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
    if (heading) heading.textContent = ministryService ? 'A parishioner wants to serve' : 'Your donors want more AGAPAY features';
    if (copy) copy.textContent = count === 1
      ? (ministryService ? 'A parishioner let you know they are ready to serve.' : `A parishioner asked your church to add ${givingPlus ? 'more giving options through Give +' : 'pledge tracking and the Stewardship features that support it'}.`)
      : (ministryService ? `${count} parishioners let you know they are ready to serve.` : `${count} parishioners asked your church to add ${givingPlus ? 'more giving options through Give +' : 'pledge tracking and the Stewardship features that support it'}.`);
    if (featureTitle) featureTitle.textContent = ministryService ? 'Ready to get involved' : givingPlus ? 'More ways to give' : 'Annual pledge progress';
    if (featureDescription) featureDescription.textContent = ministryService
      ? 'Consider publishing ministry opportunities or inviting parishioners to speak with a ministry leader after services.'
      : givingPlus
      ? 'Give + unlocks designated funds, candles, commemorations, campaigns, festal alms, and other donor giving choices.'
      : 'The Stewardship tier gives parishioners a live pledge tracker and gives parish leaders pledge, giving-health, and annual-meeting insights.';
    if (action) {
      action.textContent = ministryService ? 'Acknowledge' : givingPlus ? 'View Give + tier' : 'View Stewardship tier';
      action.setAttribute('onclick', ministryService ? 'dismissParishFeatureRequest(false)' : 'dismissParishFeatureRequest(true)');
    }
    if (status) status.textContent = 'Requests are counted privately; donor identities are not shown.';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
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
      if (typeof dialog?.close === 'function') dialog.close(); else dialog?.removeAttribute('open');
      if (viewStewardship) {
        switchTab('settings');
        document.getElementById('subscriptionTierUpgrade')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      if (status) status.textContent = error.message || 'Unable to save. Please try again.';
    }
  }

  async function submitParishSupportTicket() {
    if (!currentParish?.parishId) { setStatus('Load your parish dashboard before sending a support ticket.', 'error'); return; }
    const message = document.getElementById('parishSupportMessage').value.trim();
    const status = document.getElementById('parishSupportStatus');
    const button = document.getElementById('parishSupportSend');
    if (message.length < 8) { status.textContent = 'Please include a little more detail so we can help.'; return; }
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
          path: window.location.pathname
        })
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
    } finally { button.disabled = false; }
  }

  function renderDirectoryAdminAccessError(status = 401, message = '') {
    const heading = status === 403 ? 'Directory access is not available' : 'Parish Dashboard session required';
    const reason = status === 403
      ? (message || 'Directory Operations are not enabled for this parish, or this record belongs to another parish.')
      : 'Your Parish Dashboard session has expired. Please sign in again.';
    const action = status === 401
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
      free_forever: 'Free forever'
    };
    if (subscriptionLabels[normalized]) return subscriptionLabels[normalized];
    return normalized
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, c => c.toUpperCase());
  }

  async function loginFromParishPage(event) {
    event.preventDefault();
    const parishId = document.getElementById('parishId')?.value.trim();
    const password = document.getElementById('parishToken')?.value.trim();
    const submit = event.submitter;
    if (!parishId || !password) { setStatus('Enter the parish ID and password.','error'); return; }
    if (submit) { submit.classList.add('loading'); submit.disabled = true; }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/session', {
        method: 'POST',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ password })
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
      setStatus(err.message,'error');
    } finally {
      if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
    }
  }

  // ── HELPERS ──────────────────────────────────────────────
  function showParishAuthForm(formId) {
    ['parishLoginForm', 'parishAccessInviteForm', 'parishResetRequestForm', 'parishResetConfirmForm'].forEach((id) => {
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
    if (!parishId || !email) { setStatus('Enter the parish ID and contact email.','error'); return; }
    if (submit) { submit.classList.add('loading'); submit.disabled = true; }
    try {
      const res = await fetch('/api/parish/password-reset-request', {
        method: 'POST',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ parishId, email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to request reset link');
      setStatus('If that parish contact is registered, a reset link has been sent.','success');
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
      setStatus(err.message,'error');
    } finally {
      if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
    }
  }

  async function confirmParishPasswordReset(event) {
    event.preventDefault();
    const parishId = document.getElementById('parishResetConfirmId')?.value.trim();
    const token = document.getElementById('parishResetToken')?.value.trim();
    const newPassword = document.getElementById('parishNewPassword')?.value;
    const confirmPassword = document.getElementById('parishConfirmPassword')?.value;
    const submit = event.submitter;
    if (!parishId || !token || !newPassword) { setStatus('Enter the parish ID and new password.','error'); return; }
    if (newPassword !== confirmPassword) { setStatus('Passwords do not match.','error'); return; }
    if (submit) { submit.classList.add('loading'); submit.disabled = true; }
    try {
      const res = await fetch('/api/parish/password-reset-confirm', {
        method: 'POST',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ parishId, token, newPassword, confirmPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to update password');
      sessionStorage.removeItem('agapay_parish_id');
      sessionStorage.removeItem(parishSessionStorageKey);
      sessionStorage.removeItem(legacyParishTokenStorageKey);
      const parishIdField = document.getElementById('parishId');
      if (parishIdField) parishIdField.value = parishId;
      showParishAuthForm('parishLoginForm');
      setStatus('Password updated. Please log in with your new password.','success');
    } catch (err) {
      setStatus(err.message,'error');
    } finally {
      if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
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

  function fallbackFunds(v)     { return JSON.stringify(v && v.length ? v : [{ id:'general', name:'General Operating Fund', description:'Utilities, supplies, ministries, and day-to-day parish needs.' }], null, 2); }
  function fallbackCampaigns(v) { return JSON.stringify(Array.isArray(v) ? v : [], null, 2); }
  function fallbackFundsArray(v)     { return JSON.parse(fallbackFunds(v)); }
  function fallbackCampaignsArray(v) { return JSON.parse(fallbackCampaigns(v)); }
  function dedicatedGivingUrl() { return currentParish ? `${window.location.origin}/give/${encodeURIComponent(currentParish.parishId)}` : ''; }
  function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function slugifyLocal(v) { return String(v||'item').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'item'; }
  function money(cents) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format((Number(cents)||0)/100); }
  function moneyFull(cents) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(cents)||0)/100); }
  function shortDate(v) { if (!v) return 'No gifts yet'; return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(v)); }
  function fullDate(v)  { if (!v) return '—'; return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(v)); }
  function escapeHtml(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escapeAttr(v) { return escapeHtml(v).replace(/'/g,'&#39;'); }
  function isoDateLabel(value) {
    if (!value) return 'Not set';
    const raw = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T12:00:00') : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  }

  // Both functions prefer the server-computed entitlements payload
  // (src/lib/entitlements.js, surfaced as currentParish.entitlements) over
  // re-deriving tier/add-on logic here -- the fallback expressions only
  // matter for a brief window before the dashboard's first load response
  // lands, or against stale cached parish objects.
  function isParishTier(parish = currentParish) {
    if (parish?.entitlements) return Boolean(parish.entitlements.modules?.stewardshipHealth?.included);
    if (typeof parish?.parishPlusIncludedInTier === 'boolean') return parish.parishPlusIncludedInTier;
    return ['stewardship', 'parish', 'diocese'].includes(String(parish?.subscriptionTier || '').toLowerCase());
  }

  function isParishPlusActive() {
    if (currentParish?.entitlements) return Boolean(currentParish.entitlements.parishPlusActive);
    const sw = window.ParishFeatureRegistry?.get('stewardship')?.getStatus() || {};
    return Boolean(currentParish?.stewardshipActive || sw.legacyAddOnActive || (!sw.includedInParishTier && ['active', 'trialing', 'comped'].includes(sw.status)));
  }

  function isStarterTier(parish = currentParish) {
    return String(parish?.subscriptionTier || '').toLowerCase() === 'starter';
  }


  function openParishPortability() {
    if (currentParish?.parishId && window.ParishPortability) window.ParishPortability.open({ parishId: currentParish.parishId, headers: authHeaders });
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
    if (!token || !displayName || password.length < 8) { setStatus('Enter your name and a password of at least 8 characters.', 'error'); return; }
    if (password !== confirmation) { setStatus('Passwords do not match.', 'error'); return; }
    if (submit) { submit.classList.add('loading'); submit.disabled = true; }
    try {
      const res = await fetch('/api/identity/invitations/' + encodeURIComponent(token) + '/accept', {
        method: 'POST',
        headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
        body: JSON.stringify({ password, displayName })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to create your access');
      const authenticated = data.mfaRequired
        ? await window.AgapayMfa.runFlow(data, { displayName })
        : data;
      if (!authenticated.parishId || !authenticated.parishToken) throw new Error('Your account was created, but the parish dashboard could not be opened. Please contact AGAPAY support.');
      sessionStorage.setItem('agapay_parish_id', authenticated.parishId);
      sessionStorage.setItem(parishSessionStorageKey, authenticated.parishToken);
      sessionStorage.setItem(identitySessionStorageKey, authenticated.token || '');
      sessionStorage.setItem(identityEmailStorageKey, authenticated.identityEmail || '');
      sessionStorage.removeItem(legacyParishTokenStorageKey);
      window.location.href = '/parish/dashboard?parish=' + encodeURIComponent(authenticated.parishId);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
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

  const starterLockedFeatures = {
    options: ['Custom funds & alms', 'Create and name custom funds, organize designated giving, and manage standing alms with Give +.'],
    campaigns: ['Campaign pages', 'Create goal-based, shareable campaigns with Give +.'],
    givers: ['Giver insights', 'See donor-level history and deeper giving reports with Give +.'],
    reconcile: ['Monthly reconciliation', 'Match gifts, fees, refunds, and Stripe deposits with Give +.'],
    commemorations: ['Commemorations', 'Give includes candle giving. Liturgical commemorations, Moliebens, Panikhidas, and the priest queue are included with Give +.'],
    statements: ['Annual giving statements', 'Generate and email annual donor statements with Give +.'],
    stewardship: ['Stewardship Health', 'Track pledges, understand giving health, prepare stewardship reports, and keep annual records with the Stewardship tier.'],
    bookstore: ['Parish Commerce', 'Manage bookstore sales now and add more parish commerce products as they become available in the Stewardship tier.'],
    sacraments: ['Sacraments & Services', 'Receive pastoral requests, coordinate clergy schedules, and keep families informed with the Parish tier.'],
    text: ['Text-to-Give', 'Reserve parish keywords and route donors from the shared AGAPAY number to the right giving page with the Parish tier.'],
    accounting: ['Parish Accounting', 'Keep funds, ledgers, payables, budgets, reconciliation, and financial reports together with the Parish tier.'],
    directory: ['Parish Directory', 'Manage member and household records, privacy controls, namedays, ministries, and parish connections with the Parish tier.']
  };

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
    [[desktop, 'span', 'nav-requirement-label', 'nav-upgrade-badge'], [mobile, 'em', 'mobile-requirement-label', 'mobile-upgrade-badge']].forEach(([element, tag, className, upgradeClass]) => {
      if (!element) return;
      element.classList.toggle(element === desktop ? 'sidebar-nav-item--gated' : 'mobile-tab-link--gated', !included);
      let stack = element.querySelector(':scope > .nav-label-stack');
      if (!stack) {
        const name = element.querySelector(':scope > .nav-label') || (element === mobile ? element.querySelector(':scope > span') : null);
        const textNode = element === desktop
          ? Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          : null;
        const resolvedName = name || (textNode ? Object.assign(document.createElement('span'), { className: 'nav-label', textContent: textNode.textContent.trim() }) : null);
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

  function updateStarterPaywalls() {
    const givingPlusLocked = !hasGivingPlusAccess();
    const givingPlusTargets = {
      campaigns: document.getElementById('tab-campaigns'),
      givers: document.getElementById('tab-givers'),
      reconcile: document.getElementById('tab-reconcile'),
      statements: document.getElementById('pdxGsSection')
    };
    Object.entries(givingPlusTargets).forEach(([key, element]) => {
      syncDashboardPaywall(element, key, 'Give +', givingPlusLocked);
      if (['campaigns', 'givers', 'reconcile'].includes(key)) syncTierRequirementNavigation(key, 'Give +', !givingPlusLocked);
    });
    const optionsIncluded = hasFundManagementAccess();
    syncDashboardPaywall(document.getElementById('tab-options'), 'options', 'Give +', !optionsIncluded);
    syncTierRequirementNavigation('options', 'Give +', optionsIncluded);

    const stewardshipLocked = !moduleIncluded('stewardshipHealth');
    syncDashboardPaywall(document.getElementById('tab-stewardship'), 'stewardship', 'Give +', stewardshipLocked);
    syncTierRequirementNavigation('stewardship', 'Give +', !stewardshipLocked);
    const bookstoreLocked = !moduleIncluded('bookstore');
    syncDashboardPaywall(document.getElementById('tab-bookstore'), 'bookstore', 'Bookstore add-on', bookstoreLocked);
    syncTierRequirementNavigation('bookstore', 'Bookstore add-on', !bookstoreLocked);

    const parishTargets = {
      text: document.getElementById('tab-text')
    };
    Object.entries(parishTargets).forEach(([key, element]) => {
      const moduleKey = key === 'text' ? 'textToGive' : key;
      const locked = !moduleIncluded(moduleKey);
      syncDashboardPaywall(element, key, 'Parish', locked);
      syncTierRequirementNavigation(key, 'Parish', !locked);
    });
    syncDashboardPaywall(document.getElementById('tab-directory'), 'directory', 'Give +', !moduleIncluded('directory'));
    syncTierRequirementNavigation('directory', 'Give +', moduleIncluded('directory'));
    syncDashboardPaywall(document.getElementById('tab-sacraments'), 'sacraments', 'Sacraments add-on', !moduleIncluded('sacraments'));
    syncTierRequirementNavigation('sacraments', 'Sacraments add-on', moduleIncluded('sacraments'));
    syncDashboardPaywall(document.getElementById('tab-accounting'), 'accounting', 'Accounting add-on', !moduleIncluded('accounting'));
    syncTierRequirementNavigation('accounting', 'Accounting add-on', moduleIncluded('accounting'));
  }

  function moduleIncluded(moduleId) {
    return Boolean(currentParish?.entitlements?.modules?.[moduleId]?.included);
  }

  function accountingStaffSessionKey() { return `agapay.accountingStaff.${currentParish?.parishId || 'unknown'}`; }
  function accountingStaffSession() {
    try { const value = JSON.parse(sessionStorage.getItem(accountingStaffSessionKey()) || 'null'); return value?.expiresAt && Date.parse(value.expiresAt) > Date.now() ? value : null; } catch { return null; }
  }

  function updateStewardshipBadges(isActive, options = {}) {
    window.ParishFeatureRegistry?.get('stewardship')?.renderMeetings(isActive);
    const stewardshipActive = !isStarterTier() && moduleIncluded('stewardshipHealth');
    const bookstoreActive = moduleIncluded('bookstore');
    const sacramentsActive = moduleIncluded('sacraments');
    const parishLifeAvailable = Boolean(currentParish?.parishLifeAvailable);
    const communicationsNav = document.getElementById('nav-communications');
    const mobileCommunicationsNav = document.querySelector('.mobile-tab-link[data-nav-tab="communications"]');
    if (communicationsNav) communicationsNav.hidden = !parishLifeAvailable;
    if (mobileCommunicationsNav) mobileCommunicationsNav.hidden = !parishLifeAvailable;
    syncTierRequirementNavigation('stewardship', 'Give +', stewardshipActive);
    const bookstoreBadge = document.getElementById('bookstoreNavBadge');
    const mobileBookstoreBadge = document.getElementById('mobileBookstoreBadge');
    syncTierRequirementNavigation('bookstore', 'Bookstore add-on', bookstoreActive);
    if (bookstoreBadge) {
      bookstoreBadge.hidden = bookstoreActive;
      bookstoreBadge.textContent = 'Upgrade';
      bookstoreBadge.classList.remove('nav-upgrade-badge--active');
    }
    if (mobileBookstoreBadge) {
      mobileBookstoreBadge.hidden = bookstoreActive;
      mobileBookstoreBadge.textContent = 'Upgrade';
      mobileBookstoreBadge.classList.remove('mobile-upgrade-badge--active');
    }
    syncModuleStatusNavigation('bookstore', bookstoreActive, Boolean(currentParish?.bookstoreEnabled));

    // Entitlement and the parish's donor-facing on/off switch stay separate.
    const sacIsOn = Boolean(currentParish?.sacramentsEnabled);
    const sacBadge = document.getElementById('sacramentsNavBadge');
    syncTierRequirementNavigation('sacraments', 'Sacraments add-on', sacramentsActive);
    if (sacBadge) {
      sacBadge.hidden = sacramentsActive;
      sacBadge.textContent = 'Upgrade';
      sacBadge.classList.remove('nav-upgrade-badge--active');
    }
    syncModuleStatusNavigation('sacraments', sacramentsActive, sacIsOn);
    const libraryIncluded = isParishPlusActive();
    syncTierRequirementNavigation('library', 'Give +', libraryIncluded);
    syncModuleStatusNavigation('library', libraryIncluded && typeof currentParish?.libraryEnabled === 'boolean', Boolean(currentParish?.libraryEnabled));
    syncModuleStatusNavigation('directory', moduleIncluded('directory'), Boolean(currentParish?.directoryEnabled));
    syncModuleStatusNavigation('communications', moduleIncluded('communications'), Boolean(currentParish?.communicationsEnabled));
  }

  // ── BOOKSTORE ───────────────────────────────────────────────
  // Bookstore is available with Stewardship. The broader Commerce overview
  // and future product workspaces require the Parish-only commerceSuite
  // entitlement.
  // Two pieces: what's already in the parish's catalog, and a starter
  // list of common items they can check off instead of typing each one
  // in by hand. Prices on the starter list are suggestions, not fixed —
  // the parish edits them before anything gets added.
  function settlementProfilesApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/settlement-profiles' + path;
  }
  let settlementProfilesState = { loaded: false, loading: false, profiles: [], profileTypes: [], stewardshipActive: false };
  const SETTLEMENT_MODULE_LABELS = { giving: 'Giving (donations)', bookstore: 'Bookstore Payments', events: 'Meals & Events' };
  const SETTLEMENT_TYPE_LABELS = {
    general_giving: 'General Giving',
    liturgical: 'Liturgical',
    bookstore: 'Bookstore',
    festival: 'Festival',
    school: 'School',
    cemetery: 'Cemetery',
    camp: 'Camp',
    hall_rental: 'Hall Rental',
    fundraisers: 'Fundraisers'
  };
  async function loadSettlementProfilesPanel(force = false) {
    const body = document.getElementById('settlementProfilesBody');
    if (!body || !currentParish) return;
    if (settlementProfilesState.loaded && !force) { renderSettlementProfilesPanel(); return; }
    if (settlementProfilesState.loading) return;
    settlementProfilesState.loading = true;
    if (!settlementProfilesState.loaded) body.innerHTML = '<p class="sw-tool-loading">Loading payment routes&hellip;</p>';
    try {
      const res = await fetch(settlementProfilesApi(), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load payment routes.');
      settlementProfilesState.profiles = data.profiles || [];
      settlementProfilesState.profileTypes = data.profileTypes || [];
      settlementProfilesState.stewardshipActive = Boolean(data.stewardshipActive);
      settlementProfilesState.loaded = true;
      renderSettlementProfilesPanel();
    } catch (err) {
      body.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    } finally {
      settlementProfilesState.loading = false;
    }
  }
  function renderSettlementProfilesPanel() {
    const body = document.getElementById('settlementProfilesBody');
    if (!body) return;
    const profiles = settlementProfilesState.profiles;

    const rows = profiles.map(p => {
      const badges = [
        p.isDefaultGiving ? '<span class="sp-badge sp-badge--giving">Giving default</span>' : '',
        p.isDefaultCommerce ? '<span class="sp-badge sp-badge--commerce">Bookstore default</span>' : '',
        !p.isActive ? '<span class="sp-badge sp-badge--inactive">Inactive</span>' : ''
      ].filter(Boolean).join('');
      const moduleLabels = (p.modules || []).map(m => SETTLEMENT_MODULE_LABELS[m] || m).join(', ');
      return `
        <div class="sp-row${p.isActive ? '' : ' is-inactive'}" data-profile-id="${escapeAttr(p.id)}">
          <div class="sp-row-main">
            <input class="sp-name-input" type="text" value="${escapeAttr(p.name)}" maxlength="80"
              onkeydown="if(event.key==='Enter'){event.target.blur();}"
              onchange="renameSettlementProfile('${escapeAttr(p.id)}', this.value)" />
            <span class="sp-type-pill">${escapeHtml(SETTLEMENT_TYPE_LABELS[p.profileType] || p.profileType)}</span>
            ${badges}
          </div>
          <div class="sp-row-meta">${moduleLabels ? `Used by: ${escapeHtml(moduleLabels)}` : '<em>Not assigned to any module yet</em>'}</div>
          <details class="sp-row-menu"><summary>Manage route</summary><div class="sp-row-actions">
            ${!p.isDefaultGiving ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultGivingProfile('${escapeAttr(p.id)}')">Use for Giving</button>` : ''}
            ${!p.isDefaultCommerce ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultCommerceProfile('${escapeAttr(p.id)}')">Use for Bookstore</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleSettlementProfileActive('${escapeAttr(p.id)}', ${p.isActive ? 'false' : 'true'})">${p.isActive ? 'Deactivate' : 'Activate'}</button>
          </div></details>
        </div>`;
    }).join('');

    const activeProfiles = profiles.filter(p => p.isActive);
    const moduleAssignmentRows = Object.keys(SETTLEMENT_MODULE_LABELS)
      .filter(key => key !== 'bookstore' || settlementProfilesState.stewardshipActive)
      .map(key => {
        const current = profiles.find(p => (p.modules || []).includes(key));
        const options = activeProfiles.map(p =>
          `<option value="${escapeAttr(p.id)}" ${current?.id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
        return `
          <div class="sp-module-row">
            <span class="sp-module-label">${escapeHtml(SETTLEMENT_MODULE_LABELS[key])} activity</span>
            <select class="form-select" onchange="assignSettlementModule('${key}', this.value)">${options}</select>
          </div>`;
      }).join('');

    body.innerHTML = `
      <div class="sp-modules">
        <h4 class="sp-subhead">Send each activity to</h4>
        ${moduleAssignmentRows}
      </div>

      <details class="sp-route-list"><summary>${profiles.length} payment route${profiles.length === 1 ? '' : 's'}</summary><div class="sp-list">${rows || '<p class="bk-panel-empty">No payment routes yet.</p>'}</div></details>

      <details class="sp-new-route"><summary>Add another payment route</summary><form class="sp-new-form" onsubmit="createSettlementProfile(event)">
        <div class="sp-new-fields">
          <input class="form-input" id="spNewName" type="text" placeholder="Route name (e.g. Festival payments)" maxlength="80" required />
          <select class="form-select" id="spNewType">
            ${(settlementProfilesState.profileTypes.length ? settlementProfilesState.profileTypes : ['general_giving']).map(t =>
              `<option value="${escapeAttr(t)}">${escapeHtml(SETTLEMENT_TYPE_LABELS[t] || t)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Add route</button>
        </div>
      </form></details>`;
  }
  async function createSettlementProfile(event) {
    event.preventDefault();
    const name = document.getElementById('spNewName')?.value.trim();
    const profileType = document.getElementById('spNewType')?.value;
    if (!name) { setStatus('Enter a payment route name.', 'error'); return; }
    try {
      const res = await fetch(settlementProfilesApi(), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, profileType })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to create payment route.');
      setStatus(`"${name}" created.`, 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }
  async function renameSettlementProfile(profileId, name) {
    const clean = String(name || '').trim();
    if (!clean) { setStatus('Payment route name cannot be empty.', 'error'); await loadSettlementProfilesPanel(true); return; }
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId)), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to rename payment route.');
      setStatus('Payment route renamed.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
      await loadSettlementProfilesPanel(true);
    }
  }
  async function toggleSettlementProfileActive(profileId, makeActive) {
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId)), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: makeActive })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to update payment route.');
      setStatus(makeActive ? 'Payment route activated.' : 'Payment route deactivated.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }
  async function setDefaultGivingProfile(profileId) {
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-giving'), { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to set the Giving payment route.');
      setStatus('Giving payment route updated.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }
  async function setDefaultCommerceProfile(profileId) {
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-commerce'), { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to set the Bookstore payment route.');
      setStatus('Bookstore payment route updated.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }
  async function assignSettlementModule(moduleKey, profileId) {
    if (!profileId) return;
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/assign-module'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to assign module.');
      setStatus(`${SETTLEMENT_MODULE_LABELS[moduleKey] || moduleKey} reassigned.`, 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
      await loadSettlementProfilesPanel(true);
    }
  }

  function formatSacramentDateRange(startDate, endDate) {
    const start = formatSacramentDisplayDate(startDate);
    const end = formatSacramentDisplayDate(endDate);
    return !end || startDate === endDate ? start : `${start} – ${end}`;
  }

  function syncSacramentsBlackoutEndDate() {
    const start = document.getElementById('sacAvailNewBlackoutStartDate');
    const end = document.getElementById('sacAvailNewBlackoutEndDate');
    if (start && end && (!end.value || end.value < start.value)) end.value = start.value;
    if (start && end) end.min = start.value;
  }

  // ── LOAD DASHBOARD ────────────────────────────────────────
  // ── SETUP WIZARD ─────────────────────────────────────────
  function tierPriceLabel(tier) { if(!tier) return ''; if(tier.id==='parish'&&tier.householdPriced) return 'priced by active households'; if(tier.monthlyCents===null) return 'Custom'; if(Number(tier.monthlyCents)===0) return '$0/mo'; return `${money(tier.monthlyCents)}/mo`; }
  function parishTierDefinition() { return (currentParish?.subscriptionTiers || []).find((tier) => tier.id === 'parish') || null; }
  function parishBandPriceCents(band = {}) { return band.standardMonthlyCents; }
  function parishHouseholdBandOptionsMarkup(selectedId = '') {
    const bands = parishTierDefinition()?.householdBands || [];
    return `<option value="">Select an active-household range</option>${bands.map((band) => {
      const cents = parishBandPriceCents(band);
      const price = cents === null || cents === undefined ? 'Custom pricing' : `${money(cents)}/mo`;
      return `<option value="${escapeHtml(band.id)}" ${band.id===selectedId?'selected':''}>${escapeHtml(band.label)} — ${escapeHtml(price)}</option>`;
    }).join('')}`;
  }
  function parishHouseholdPickerMarkup({ tierSelectId, bandSelectId, groupId, summaryId }) {
    return `<div class="form-group full parish-household-pricing" id="${groupId}" hidden>
      <label class="form-label" for="${bandSelectId}">Active parish households</label>
      <select id="${bandSelectId}" onchange="syncParishHouseholdPricing('${tierSelectId}','${bandSelectId}','${groupId}','${summaryId}')">${parishHouseholdBandOptionsMarkup(currentParish?.parishHouseholdBand || '')}</select>
      <p class="section-note" id="${summaryId}">Choose a range to calculate the Parish monthly price.</p>
    </div>`;
  }
  function syncParishHouseholdPricing(tierSelectId, bandSelectId, groupId, summaryId) {
    const tier = document.getElementById(tierSelectId);
    const band = document.getElementById(bandSelectId);
    const group = document.getElementById(groupId);
    const summary = document.getElementById(summaryId);
    const isParish = tier?.value === 'parish';
    if (group) group.hidden = !isParish;
    if (!isParish || !summary) return;
    const selected = (parishTierDefinition()?.householdBands || []).find((item) => item.id === band?.value);
    if (!selected) { summary.textContent = 'Choose a range to calculate the Parish monthly price.'; return; }
    const cents = parishBandPriceCents(selected);
    summary.textContent = cents === null || cents === undefined
      ? `${selected.label} uses custom Parish pricing. AGAPAY will confirm the amount before billing.`
      : `${selected.label}: ${money(cents)}/month at the flat everyday rate.`;
  }
  function parishPricingUsageMarkup() {
    const usage = currentParish?.parishPricingUsage;
    if (!usage?.trackingAvailable) return '<div class="parish-pricing-usage is-neutral"><strong>Automatic household tracking</strong><span>AGAPAY will count represented households as parishioners link their My AGAPAY accounts.</span></div>';
    const userLabel = `${Number(usage.linkedUsers || 0)} linked user${Number(usage.linkedUsers || 0)===1?'':'s'}`;
    const householdLabel = `${Number(usage.representedHouseholds || 0)} represented household${Number(usage.representedHouseholds || 0)===1?'':'s'}`;
    const detail = usage.upgradeRequired
      ? `Your live household count has reached the ${usage.recommendedBandLabel} band. Select that band below to keep Parish pricing current.`
      : usage.nextThreshold === null
        ? 'This is the highest published Parish band; AGAPAY will coordinate custom pricing with your church.'
        : `${Number(usage.remainingUntilNextBand || 0)} more represented household${Number(usage.remainingUntilNextBand || 0)===1?'':'s'} before the ${usage.nextBandLabel} band.`;
    return `<div class="parish-pricing-usage ${usage.upgradeRequired?'needs-upgrade':'is-current'}"><strong>${usage.upgradeRequired?'Household-band update needed':'Household usage is being tracked'}</strong><span>${escapeHtml(userLabel)} across ${escapeHtml(householdLabel)}. ${escapeHtml(detail)}</span></div>`;
  }
  function subscriptionDemoActive(parish = currentParish) { return String(parish?.subscriptionStatus || '').toLowerCase() === 'trialing'; }
  function subscriptionDemoEnd(parish = currentParish) {
    const explicit = new Date(parish?.subscriptionTrialEndsAt || '');
    if (!Number.isNaN(explicit.getTime())) return explicit;
    const started = new Date(parish?.subscriptionTrialStartedAt || parish?.subscriptionActivatedAt || '');
    const days = Number(parish?.subscriptionTrialDays || 0);
    if (!Number.isNaN(started.getTime()) && days > 0) return new Date(started.getTime() + days * 86400000);
    return null;
  }
  function subscriptionDemoDateLabel(parish = currentParish) {
    const end = subscriptionDemoEnd(parish);
    return end ? end.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
  }
  function subscriptionDemoDaysRemaining(parish = currentParish) {
    const end = subscriptionDemoEnd(parish);
    return end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : Number(parish?.subscriptionTrialDays || 30);
  }
  function tierOptionsMarkup(selectedId) {
    const tiers = currentParish?.subscriptionTiers || [];
    return tiers.map(t => `<option value="${escapeHtml(t.id)}" ${t.id===selectedId?'selected':''}>${escapeHtml(t.label)} - ${escapeHtml(tierPriceLabel(t))}</option>`).join('');
  }
  function subscriptionAddOnPriceCents(addOn = {}) { return addOn.standardMonthlyCents; }
  function subscriptionAddOnPickerMarkup({ tierSelectId, groupId }) {
    const selected = new Set(currentParish?.subscriptionAddOns || []);
    const catalog = currentParish?.subscriptionAddOnCatalog || [];
    return `<div class="form-group full" id="${groupId}" data-tier-select-id="${tierSelectId}" hidden><label class="form-label">Optional Give + add-ons</label><div class="toggle-row">${catalog.map((addOn) => `<label class="check-card"><input type="checkbox" data-subscription-add-on="${escapeHtml(addOn.id)}" ${selected.has(addOn.id)?'checked':''} onchange="syncSubscriptionAddOnChoice('${groupId}')" /> <span><strong>${escapeHtml(addOn.label)}</strong><small>${escapeHtml(money(subscriptionAddOnPriceCents(addOn)))}/mo${addOn.id==='accounting'?' · includes Full Commerce':addOn.id==='full_commerce'?' · adds Events & Meals':''}</small></span></label>`).join('')}</div><p class="section-note">Give + already includes Koinonia, Parish Library, Directory, and Bookstore. Add Sacraments &amp; Services, Full Commerce, or Accounting Suite individually; included capabilities never stack, and Parish includes every module.</p><p class="section-note" data-subscription-price-summary aria-live="polite"></p></div>`;
  }
  function syncSubscriptionAddOnVisibility(tierSelectId, groupId) {
    const group = document.getElementById(groupId);
    if (group) group.hidden = document.getElementById(tierSelectId)?.value !== 'giving';
    syncSubscriptionAddOnChoice(groupId);
  }
  function syncSubscriptionAddOnChoice(groupId) {
    const group = document.getElementById(groupId);
    const accounting = group?.querySelector('[data-subscription-add-on="accounting"]');
    const fullCommerce = group?.querySelector('[data-subscription-add-on="full_commerce"]');
    if (fullCommerce) {
      if (accounting?.checked) fullCommerce.checked = false;
      fullCommerce.disabled = Boolean(accounting?.checked);
      fullCommerce.closest('.check-card')?.classList.toggle('is-disabled', Boolean(accounting?.checked));
    }
    updateSubscriptionAddOnTotal(groupId);
  }
  function updateSubscriptionAddOnTotal(groupId) {
    const group = document.getElementById(groupId);
    const summary = group?.querySelector('[data-subscription-price-summary]');
    const tierId = document.getElementById(group?.dataset.tierSelectId || '')?.value;
    const tier = (currentParish?.subscriptionTiers || []).find((item) => item.id === tierId);
    if (!summary || tierId !== 'giving' || !tier) return;
    const selected = new Set(selectedSubscriptionAddOns(groupId));
    const addOnCents = (currentParish?.subscriptionAddOnCatalog || [])
      .filter((addOn) => selected.has(addOn.id))
      .reduce((total, addOn) => total + Number(subscriptionAddOnPriceCents(addOn) || 0), 0);
    const totalCents = Number(tier.monthlyCents || 0) + addOnCents;
    summary.innerHTML = `<strong>Estimated monthly subscription: ${escapeHtml(money(totalCents))}/month.</strong> Stripe checkout will show this same recurring total before payment.`;
  }
  function selectedSubscriptionAddOns(groupId) {
    const group = document.getElementById(groupId);
    if (!group || group.hidden) return [];
    return Array.from(group.querySelectorAll('[data-subscription-add-on]:checked')).map((input) => input.dataset.subscriptionAddOn);
  }
  function setupCheckMarkup() { return '<span class="setup-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>'; }
  function billingStatusDone(status) { return ['active','trialing','free_forever'].includes(status); }
  async function refreshSubscriptionStatus(options) {
    if (!currentParish || !currentParish.parishId || !['checkout_created','trial_checkout_created'].includes(currentParish.subscriptionStatus)) return;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-refresh', { method:'POST', headers:authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh billing status');
      if (data.subscriptionStatus) {
        currentParish.subscriptionStatus = data.subscriptionStatus;
        currentParish.stripeSubscriptionId = data.stripeSubscriptionId || currentParish.stripeSubscriptionId || '';
        currentParish.stripeCustomerId = data.stripeCustomerId || currentParish.stripeCustomerId || '';
        currentParish.subscriptionTrialStartedAt = data.subscriptionTrialStartedAt || currentParish.subscriptionTrialStartedAt || '';
        currentParish.subscriptionTrialEndsAt = data.subscriptionTrialEndsAt || currentParish.subscriptionTrialEndsAt || '';
        currentParish.setup = {
          ...(currentParish.setup || {}),
          billingActive: billingStatusDone(data.subscriptionStatus)
        };
      }
    } catch (err) {
      const message = window.AgapayDiagnostics?.report(err, 'billing.refresh') || 'Unable to refresh billing status. Please try again.';
      if (!options || !options.quiet) setStatus(message, 'error');
    }
  }
  async function refreshStripeStatus(options) {
    if (!currentParish || !currentParish.parishId) return;
    const status = currentParish.stripeAccountStatus || '';
    if (!options?.force && ['charges_enabled','payouts_enabled'].includes(status)) return;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-refresh', { method:'POST', headers:authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh Stripe status');
      if (data.parish) currentParish = { ...currentParish, ...data.parish };
      if (data.onboarding) currentParish.onboarding = data.onboarding;
      if (options?.force) renderSetupWizard();
      if (options?.force && data.recovered) setStatus('Your existing Stripe connection was found and restored.','success');
    } catch (err) {
      const message = window.AgapayDiagnostics?.report(err, 'stripe.refresh') || 'Unable to refresh Stripe status. Please try again.';
      if (!options || !options.quiet) setStatus(message, 'error');
    }
  }
  function communityTypeKey(parish) { const raw=`${parish?.communityType||''} ${parish?.parishName||''}`.toLowerCase(); if(raw.includes('monastery')||raw.includes('skete')) return 'monastery'; if(raw.includes('mission')) return 'mission'; return 'parish'; }
  function communityMarkIcon(parish) {
    const type=communityTypeKey(parish);
    if(type==='monastery') return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><rect x="4" y="14" width="30" height="18" rx="1"/><rect x="14" y="6" width="10" height="14" rx="1"/><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M15 32 L15 25 Q19 21 23 25 L23 32"/><rect x="7" y="18" width="5" height="6" rx="2.5"/><rect x="26" y="18" width="5" height="6" rx="2.5"/></svg>';
    if(type==='mission')  return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M19 6 C10 10 8 17 11 22 C13 26 16 27 19 27 C22 27 25 26 27 22 C30 17 28 10 19 6Z"/><line x1="12" y1="27" x2="26" y2="27"/><line x1="13" y1="29" x2="25" y2="29"/></svg>';
    return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>';
  }
  // Preserve the shell entry point while onboarding owns its implementation.
  function renderSetupWizard() {
    return loadRegisteredParishFeature('onboarding');
  }

  // Dashboard-homepage "Your Subscription" panel: current plan, modules
  // included (driven by the same entitlements payload the server computes
  // in src/lib/entitlements.js), Stripe/billing status, and an upgrade
  // nudge when a module isn't included on the parish's current tier.
  function renderSubscriptionPanel() {
    const p = currentParish;
    const body = document.getElementById('pdxSubscriptionBody');
    if (!p || !body) return;
    const ent = p.entitlements || {};
    const modules = ent.modules || {};
    const tierLabel = p.subscriptionTierLabel || 'Parish';
    const demoActive = subscriptionDemoActive(p);
    const demoEndLabel = subscriptionDemoDateLabel(p);
    const demoDays = subscriptionDemoDaysRemaining(p);
    const parishBandMissing = p.subscriptionTier === 'parish' && !p.parishHouseholdBand;
    const standardPriceLabel = parishBandMissing ? 'Household band needed' : p.subscriptionMonthlyCents === 0 ? 'Free forever' : p.subscriptionMonthlyCents ? (money(p.subscriptionMonthlyCents) + '/mo') : 'Custom pricing';
    const priceLabel = demoActive ? `${demoDays} day${demoDays===1?'':'s'} remaining` : standardPriceLabel;
    const billingActive = Boolean(p.setup?.billingActive);
    const stripeConnected = Boolean(p.setup?.stripeConnected);
    const pricingUsage = p.parishPricingUsage || {};

    const statusChip = (label, active) => `<span class="pdx-sub-status ${active ? 'is-ready' : 'needs-attention'}"><span aria-hidden="true">${active ? '✓' : '!'}</span>${escapeHtml(label)}</span>`;
    const moduleRow = (label, moduleKey, description, includedTier) => {
      const mod = modules[moduleKey] || {};
      const included = Boolean(mod.included);
      const sourceLabel = included ? `Included with ${includedTier}` : 'Upgrade';
      return `<div class="pdx-sub-module ${included ? 'is-included' : 'is-locked'}">
        <span class="pdx-sub-module-mark" aria-hidden="true">${included ? '✓' : '◇'}</span>
        <div class="pdx-sub-module-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div>
        <span class="pdx-sub-module-state">${escapeHtml(sourceLabel)}</span>
      </div>`;
    };

    body.innerHTML = `
      <div class="pdx-sub-plan">
        <div class="pdx-sub-plan-glow" aria-hidden="true"></div>
        <div class="pdx-sub-plan-kicker">${demoActive?'Free 30-day demo':'Current plan'}</div>
        <div class="pdx-sub-plan-name">${escapeHtml(tierLabel)}</div>
        <div class="pdx-sub-plan-price">${escapeHtml(priceLabel)} <span>${demoActive?`Then ${escapeHtml(standardPriceLabel)}`:'Simple monthly subscription'}</span></div>
        <p class="pdx-sub-plan-copy">${demoActive?`No card is required during your demo${demoEndLabel?`, which runs through ${escapeHtml(demoEndLabel)}`:''}. Add billing information before it ends only if you want to continue.`:'Your plan controls which parish tools are ready now. Giving deposits continue to flow directly through your connected Stripe account.'}</p>
        <div class="pdx-sub-status-row">
          ${statusChip(demoActive ? 'Free demo active' : billingActive ? 'Billing active' : 'Billing not started', billingActive)}
          ${statusChip(stripeConnected ? 'Stripe connected' : 'Stripe not connected', stripeConnected)}
          ${pricingUsage.upgradeRequired ? statusChip('Household band update needed', false) : ''}
        </div>
        <button class="pdx-sub-plan-action" type="button" onclick="switchTab('settings')">${demoActive?'Add billing details or manage demo':ent.parishPlusIncludedInTier ? 'Manage subscription' : 'Explore upgrade options'}<span aria-hidden="true">→</span></button>
      </div>
      <div class="pdx-sub-modules">
        <div class="pdx-sub-modules-head"><div><span>Plan access</span><strong>Included parish tools</strong></div><button type="button" onclick="switchTab('settings')">Compare tiers</button></div>
        <div class="pdx-sub-module-grid">
          ${moduleRow('Give +', 'givingPlus', 'Custom funds, campaigns, givers, and reconciliation', 'Give +')}
          ${moduleRow('Stewardship Health', 'stewardshipHealth', 'Pledges, insights, and stewardship reporting', 'Give +')}
          ${moduleRow('Bookstore', 'bookstore', 'Parish commerce and Stripe-powered sales', 'Give +')}
          ${moduleRow('Parish Directory', 'directory', 'Member, household, and ministry records', 'Give +')}
          ${moduleRow('Sacraments & Services', 'sacraments', 'Pastoral requests and clergy coordination', 'Sacraments add-on')}
          ${moduleRow('Text-to-Give', 'textToGive', 'Keywords that route donors to your giving page', 'Parish')}
        </div>
      </div>`;
  }

  function updateTierScopedNavigation() {
    const stewardshipIncluded = moduleIncluded('stewardshipHealth');
    const directoryActive = moduleIncluded('directory');
    const accountingIncluded = moduleIncluded('accounting');
    const accountingNav = document.getElementById('nav-accounting');
    const stewardshipNav = document.getElementById('nav-stewardship');
    stewardshipNav?.removeAttribute('hidden');
    syncTierRequirementNavigation('stewardship', 'Give +', stewardshipIncluded);
    if (stewardshipNav) stewardshipNav.title = stewardshipIncluded ? 'Stewardship Health' : 'Requires Give +';
    document.getElementById('nav-directory')?.removeAttribute('hidden');
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="directory"]').forEach((el) => {
      el.hidden = false;
    });
    syncTierRequirementNavigation('directory', 'Give +', directoryActive);
    syncTierRequirementNavigation('library', 'Parish', moduleIncluded('sacraments'));
    syncTierRequirementNavigation('accounting', 'Accounting add-on', accountingIncluded);
    syncModuleStatusNavigation('accounting', accountingIncluded, accountingIncluded);
    if (accountingNav) accountingNav.title = accountingIncluded ? 'Accounting workspace' : 'Requires Accounting add-on or Parish';
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="stewardship"]').forEach((el) => {
      el.hidden = false;
      el.classList.toggle('mobile-tab-link--gated', !stewardshipIncluded);
    });
    orderTierNavigation();
  }

  function orderTierNavigation() {
    // Navigation follows the subscription ladder. Parish-only tools stay
    // inside their labeled group instead of being pulled into the root nav.
    const preParishOrder = [
      'giving', 'qr', 'history', 'options', 'campaigns', 'givers', 'reconcile',
      'stewardship', 'bookstore'
    ];
    // Product requirement: Koinonia sits directly after Directory and before
    // Accounting in the bottom Parish tier block.
    const parishOrder = ['sacraments', 'directory', 'library', 'communications', 'accounting', 'text'];
    const sidebar = document.querySelector('.sidebar-nav');
    preParishOrder.forEach((tab) => {
      const item = document.getElementById(`nav-${tab}`);
      if (sidebar && item) sidebar.appendChild(item);
    });
    const parishGroup = document.getElementById('nav-tier-parish');
    parishOrder.forEach((tab) => {
      const item = document.getElementById(`nav-${tab}`);
      if (parishGroup && item) parishGroup.appendChild(item);
    });
    if (sidebar && parishGroup) sidebar.appendChild(parishGroup);
    const settings = document.getElementById('nav-settings');
    if (sidebar && settings) sidebar.appendChild(settings);

    const mobile = document.querySelector('.mobile-tabbar');
    [...preParishOrder, ...parishOrder, 'settings'].forEach((tab) => {
      const item = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
      if (mobile && item) mobile.appendChild(item);
    });
  }

  // ── SALES-TAX EXEMPTION ───────────────────────────────────
  const taxExemptionJurisdictions = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','FEDERAL','OTHER'
  ];

  function taxExemptionApi(path = '') {
    if (!currentParish?.parishId) return '';
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/tax-exemption' + path;
  }

  function taxExemptionStatusCopy(status) {
    return {
      pending: ['Under review', 'AGAPAY is reviewing the exemption request. Sales tax remains enabled until approval.'],
      approved: ['Approved', 'Applicable AGAPAY subscription charges are tax-exempt. New billing Customers are synchronized before checkout.'],
      replacement_required: ['Document needed', 'AGAPAY requested updated documentation. Upload it here so the review can continue.'],
      rejected: ['Not approved', 'This request was not approved. You may submit a new request with corrected information.'],
      expired: ['Expired', 'The exemption is no longer active. Submit current documentation for a new review.'],
      revoked: ['Revoked', 'The exemption is no longer active. Contact support if you believe this is incorrect.']
    }[status] || ['Not submitted', 'No sales-tax exemption request is on file.'];
  }

  function taxExemptionJurisdictionOptions(selected = '') {
    const normalized = String(selected || currentParish?.state || '').trim().toUpperCase();
    return '<option value="">Choose jurisdiction…</option>' + taxExemptionJurisdictions.map((code) => {
      const label = code === 'FEDERAL' ? 'Federal' : code === 'OTHER' ? 'Other / multistate' : code;
      return `<option value="${code}" ${code === normalized ? 'selected' : ''}>${label}</option>`;
    }).join('');
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
    const detail = claim ? `
      <div class="tax-exemption-facts">
        <div><span>Jurisdiction</span><strong>${escapeHtml(claim.jurisdiction || '—')}</strong></div>
        <div><span>Certificate</span><strong>${escapeHtml(claim.maskedCertificateNumber || 'Not listed')}</strong></div>
        <div><span>Submitted</span><strong>${claim.createdAt ? escapeHtml(new Date(claim.createdAt).toLocaleDateString()) : '—'}</strong></div>
        <div><span>Expiration</span><strong>${claim.expirationDate ? escapeHtml(new Date(claim.expirationDate + 'T00:00:00').toLocaleDateString()) : 'No expiration listed'}</strong></div>
      </div>` : '';
    const reason = claim?.replacementReason || claim?.rejectionReason || claim?.revocationReason || '';
    let action = '';
    if (!claim || ['rejected', 'expired'].includes(status)) action = taxExemptionRequestForm(claim);
    else if (['pending', 'replacement_required'].includes(status)) action = taxExemptionDocumentForm(Boolean(data.hasDocument));
    else if (status === 'approved' && data.hasDocument) action = '<div class="btn-row"><button class="btn btn-ghost" type="button" onclick="viewParishTaxExemptionDocument(this)">View current document</button></div>';
    else if (status === 'revoked') action = '<p class="section-note">Contact <a href="mailto:support@agapay.app">support@agapay.app</a> before submitting a new request.</p>';

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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load sales-tax exemption status.');
      renderParishTaxExemption(payload);
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
      guidance.innerHTML = data.hasNoStatewideGeneralSalesTax ? `<div class="tax-exemption-guidance">${escapeHtml(data.guidance || '')} Documentation is still required if you are claiming an exemption.</div>` : '';
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
    if (!file || !file.size) { setTaxExemptionActionStatus('Choose the exemption document to upload.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error'); return; }
    const payload = {
      claimsExemption: true,
      jurisdiction: raw.get('jurisdiction'),
      exemptionType: raw.get('exemptionType'),
      multistateExplanation: String(raw.get('multistateExplanation') || '').trim(),
      certificateNumber: String(raw.get('certificateNumber') || '').trim(),
      effectiveDate: raw.get('effectiveDate'),
      expirationDate: raw.get('expirationDate'),
      authorizedRepresentativeName: String(raw.get('authorizedRepresentativeName') || '').trim(),
      authorizedRepresentativeTitle: String(raw.get('authorizedRepresentativeTitle') || '').trim(),
      certified: raw.get('certified') === 'on'
    };
    if (button) { button.disabled = true; button.classList.add('loading'); }
    setTaxExemptionActionStatus('Submitting request…');
    try {
      const response = await fetch(taxExemptionApi(), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to submit the request.');
      const upload = new FormData();
      upload.append('document', file, file.name);
      const uploadResponse = await fetch(taxExemptionApi('/upload'), { method: 'POST', headers: authHeaders(), body: upload });
      const uploadResult = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadResult.error || 'The request was saved, but the document upload failed. Retry the upload below.');
      setStatus('Sales-tax exemption request submitted for review.', 'success');
      await loadParishTaxExemption();
    } catch (error) {
      setTaxExemptionActionStatus(error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.classList.remove('loading'); }
    }
  }

  async function uploadParishTaxExemptionDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter;
    const file = new FormData(form).get('document');
    if (!file || !file.size) { setTaxExemptionActionStatus('Choose a document to upload.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { setTaxExemptionActionStatus('The document must be 10 MB or smaller.', 'error'); return; }
    if (button) { button.disabled = true; button.classList.add('loading'); }
    setTaxExemptionActionStatus('Uploading document…');
    try {
      const upload = new FormData();
      upload.append('document', file, file.name);
      const response = await fetch(taxExemptionApi('/upload'), { method: 'POST', headers: authHeaders(), body: upload });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to upload the document.');
      setStatus('Exemption document uploaded.', 'success');
      await loadParishTaxExemption();
    } catch (error) {
      setTaxExemptionActionStatus(error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.classList.remove('loading'); }
    }
  }

  async function viewParishTaxExemptionDocument(button) {
    if (button) { button.disabled = true; button.classList.add('loading'); }
    try {
      const response = await fetch(taxExemptionApi('/document'), { headers: authHeaders() });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to open the document.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const opened = window.open(objectUrl, '_blank', 'noopener');
      if (!opened) {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.target = '_blank';
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setTaxExemptionActionStatus(error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.classList.remove('loading'); }
    }
  }

  // ── RENDER DASHBOARD ──────────────────────────────────────
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
    const parishMeta = [p.communityType, p.jurisdiction, [p.city,p.state].filter(Boolean).join(', ')].filter(Boolean).join(' / ');
    document.getElementById('sidebarParishMeta').textContent = parishMeta;
    const chip = document.getElementById('sidebarStatusChip');
    const tierLabel = String(p.subscriptionTierLabel || p.subscriptionTier || 'Unassigned').trim();
    const tierDisplay = /\btier$/i.test(tierLabel) ? tierLabel : `${tierLabel} tier`;
    chip.textContent = `${statusLabel(p.givingStatus || 'active')} · ${tierDisplay}`;
    const isOnboardingLive = p.onboarding?.state === 'LIVE';
    chip.className = `sidebar-status-chip ${p.givingStatus || 'active'}${isOnboardingLive ? ' is-live' : ''}`;
    window.ParishFeatureRegistry?.get('giving')?.renderOverview();
    document.getElementById('sidebarPublicLink').href = dedicatedGivingUrl();
    document.getElementById('topbarTitle').textContent = p.parishName || 'Parish Dashboard';
    syncTopbarTabIcon(activeTab);
    const commIcon = document.getElementById('commemorationCommunityIcon');
    if (commIcon) commIcon.innerHTML = communityMarkIcon(p);
    const overviewEmpty = document.getElementById('overviewEmpty');
    if (overviewEmpty) overviewEmpty.style.display = 'none';
    renderSetupWizard();
    updateStarterPaywalls();

    const billingActive = Boolean((p.setup||{}).billingActive);
    const demoActive = subscriptionDemoActive(p);
    const demoEligible = Boolean(p.subscriptionIntroDemoEligible);
    const demoEndLabel = subscriptionDemoDateLabel(p);
    const canCancelSubscription = Boolean(p.stripeSubscriptionId && ['active', 'trialing'].includes(String(p.subscriptionStatus || '').toLowerCase()));
    const cancelSubscriptionButton = canCancelSubscription
      ? '<button class="btn btn-danger" onclick="openSubscriptionCancellation(this)">Cancel AGAPAY Give</button>'
      : '';
    const tierOptions = tierOptionsMarkup(p.subscriptionTier);
    document.getElementById('settingsPane').innerHTML = `
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Parish logo</label>
          <div class="parish-logo-settings">
            ${!hasGivingPlusAccess()
              ? `<div class="parish-logo-preview parish-logo-placeholder">Give +<br>feature</div>
                <div>
                  <p class="section-note">Add your parish logo to the dashboard, public giving pages, campaign pages, and church search with Give +. Any logo previously uploaded is preserved and will reappear if you upgrade.</p>
                  <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to Give +</button>
                </div>`
              : p.logoUrl
              ? `<img class="parish-logo-preview" src="${escapeHtml(p.logoUrl)}" alt="${escapeHtml((p.parishName || 'Parish') + ' logo')}" />`
              : '<div class="parish-logo-preview parish-logo-placeholder">No logo<br>uploaded</div>'}
            ${hasGivingPlusAccess() ? `<div>
              <div class="parish-logo-actions">
                <input id="parishLogoFile" type="file" accept="image/png,image/jpeg,image/webp" />
                <button class="btn btn-gold" type="button" onclick="uploadParishLogo(this)">Upload logo</button>
                ${p.logoUrl ? '<button class="btn btn-ghost" type="button" onclick="removeParishLogo(this)">Remove</button>' : ''}
              </div>
              <p class="section-note">PNG, JPG, or WebP, up to 5MB. A square image with a transparent or white background works best. Your logo appears on the dashboard, giving pages, campaigns, and church search.</p>
            </div>` : ''}
          </div>
        </div>
        <div class="form-group full"><label class="form-label" for="parishName">Parish name</label><input id="parishName" value="${escapeHtml(p.parishName||'')}" placeholder="Parish name" /></div>
        <div class="form-group"><label class="form-label">Jurisdiction</label><input value="${escapeHtml(p.jurisdiction||'')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="addressLine1">Address line 1</label><input id="addressLine1" value="${escapeHtml(p.addressLine1||'')}" placeholder="Street address" /></div>
        <div class="form-group full"><label class="form-label" for="addressLine2">Address line 2</label><input id="addressLine2" value="${escapeHtml(p.addressLine2||'')}" placeholder="Suite, unit, building (optional)" /></div>
        <div class="form-group"><label class="form-label" for="city">City</label><input id="city" value="${escapeHtml(p.city||'')}" placeholder="City" /></div>
        <div class="form-group"><label class="form-label" for="state">State</label><input id="state" value="${escapeHtml(p.state||'')}" placeholder="State" /></div>
        <div class="form-group"><label class="form-label" for="postalCode">Postal code</label><input id="postalCode" value="${escapeHtml(p.postalCode||'')}" placeholder="ZIP / postal code" /></div>
        <div class="form-group"><label class="form-label" for="country">Country</label><input id="country" value="${escapeHtml(p.country||'US')}" placeholder="Country code" /></div>
        <div class="form-group full"><label class="form-label" for="website">Website</label><input id="website" value="${escapeHtml(p.website||'')}" placeholder="https://example.org" /></div>
        <div class="form-group full"><label class="form-label" for="taxLegalName">Legal name for tax receipts</label><input id="taxLegalName" value="${escapeHtml(p.taxLegalName||'')}" placeholder="Defaults to parish name if left blank" /></div>
        <div class="form-group"><label class="form-label" for="taxEin">Federal EIN</label><input id="taxEin" value="${escapeHtml(p.taxEin||'')}" placeholder="##-#######" /></div>
        <div class="form-group full"><label class="form-label" for="settingsLiturgicalCalendar">Liturgical calendar</label><select id="settingsLiturgicalCalendar"><option value="julian" ${(p.liturgicalCalendar||'julian')==='julian'?'selected':''}>Julian</option><option value="gregorian" ${p.liturgicalCalendar==='gregorian'?'selected':''}>Revised-Julian</option></select></div>
        <div class="form-group full">
          <label class="form-label" for="patronalFeastName">Patronal saint or feast</label>
          <input id="patronalFeastName" list="patronalFeastSuggestions" value="${escapeHtml(patronalFeastDisplayName(p))}" placeholder="e.g. St. Nicholas the Wonderworker" onchange="syncPatronalFeastOptionsFromSettings()" />
          <datalist id="patronalFeastSuggestions">${allFeastPresets().map((feast) => `<option value="${escapeHtml(feast.name)}"></option>`).join('')}</datalist>
          <p class="section-note">Begin typing or enter any Orthodox saint or feast. The suggestions are conveniences, not the complete Church calendar.</p>
        </div>
        ${(() => { const observed = patronalMonthDay(p.patronalFeastDate); return `
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
        `; })()}
        <div class="form-group"><label class="form-label" for="givingStatus">Giving page status</label><select id="givingStatus"><option value="active" ${p.givingStatus==='active'?'selected':''} ${p.onboarding?.enabled&&p.onboarding?.state!=='LIVE'?'disabled':''}>Active${p.onboarding?.enabled&&p.onboarding?.state!=='LIVE'?' — requires treasurer signoff':''}</option><option value="paused" ${p.givingStatus==='paused'?'selected':''}>Paused</option><option value="hidden" ${p.givingStatus==='hidden'?'selected':''}>Hidden</option></select>${p.onboarding?.enabled&&p.onboarding?.state!=='LIVE'?'<p class="section-note">AGAPAY activates the page automatically when the treasurer completes Go Live.</p>':''}</div>
        <div class="form-group"><label class="form-label">Stripe onboarding</label><input value="${escapeHtml(p.stripeAccountStatus||'not_started')}" disabled /></div>
      </div>
      <p class="section-note">Changes here affect the parish's public giving page and visibility in the AGAPAY directory. Legal name and EIN are used on annual donor giving statements (Givers tab).</p>
      <div class="section-divider"><span>Dashboard password</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label" for="newDashboardPassword">New password</label><input id="newDashboardPassword" type="password" placeholder="At least 8 characters" autocomplete="new-password" /></div>
        <div class="form-group"><label class="form-label" for="confirmDashboardPassword">Confirm password</label><input id="confirmDashboardPassword" type="password" placeholder="Re-enter new password" autocomplete="new-password" /></div>
      </div>
      <p class="section-note">Leave blank unless you want to change the parish dashboard password.</p>
      <div class="section-divider"><span>Team access</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Priest access</label><input value="${escapeHtml(p.priestEmail||'Not listed')}" disabled /></div>
        <div class="form-group"><label class="form-label">Treasurer access</label><input value="${escapeHtml(p.treasurerEmail||'Not listed')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="sacramentPriestsText">Sacraments &amp; Services priests</label><textarea id="sacramentPriestsText" rows="4" placeholder="Fr. Michael | fr.michael@example.org&#10;Fr. Andrew | fr.andrew@example.org">${escapeHtml(formatSacramentPriestsForSettings(p.sacramentPriests || []))}</textarea></div>
      </div>
      <p class="section-note">Priest and treasurer dashboard access is included for every verified parish. Add one Sacraments &amp; Services priest per line. Use “Name | email” when you want the email stored too.</p>
      <div class="btn-row">
        <a class="btn btn-ghost" href="mailto:support@agapay.app?subject=${encodeURIComponent('Dashboard invite request for ' + (p.parishName || p.parishId || 'our parish'))}&body=${encodeURIComponent('Please add or update dashboard access for ' + (p.parishName || p.parishId || 'our parish') + '.\n\nRequested user:\nEmail:\nRole:\n\nRequested by:\n')}" target="_blank" rel="noopener">Request additional dashboard invite</a>
      </div>
      <div class="section-divider"><span>AGAPAY sales tax</span></div>
      <p class="section-note">A parish's nonprofit status does not automatically make every purchase tax-free. Submit the applicable exemption certificate here; AGAPAY will review it before changing subscription billing in Stripe.</p>
      <div id="taxExemptionPane" class="tax-exemption-pane"><p class="section-note">Loading sales-tax status…</p></div>
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      ${parishPricingUsageMarkup()}
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Current tier</label><input value="${escapeHtml(p.subscriptionTierLabel || p.subscriptionTier || 'Not selected')}" disabled /></div>
        <div class="form-group"><label class="form-label">Billing status</label><input value="${escapeHtml(statusLabel(p.subscriptionStatus || 'not_started'))}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="subscriptionTierUpgrade">Change AGAPAY tier</label><select id="subscriptionTierUpgrade" onchange="syncParishHouseholdPricing('subscriptionTierUpgrade','subscriptionHouseholdBandUpgrade','subscriptionHouseholdBandGroup','subscriptionHouseholdBandPrice');syncSubscriptionAddOnVisibility('subscriptionTierUpgrade','subscriptionAddOnUpgradeGroup')">${tierOptions}</select></div>
        ${parishHouseholdPickerMarkup({tierSelectId:'subscriptionTierUpgrade',bandSelectId:'subscriptionHouseholdBandUpgrade',groupId:'subscriptionHouseholdBandGroup',summaryId:'subscriptionHouseholdBandPrice'})}
        ${subscriptionAddOnPickerMarkup({tierSelectId:'subscriptionTierUpgrade',groupId:'subscriptionAddOnUpgradeGroup'})}
      </div>
      <p class="section-note">${p.parishId === 'st-fiacre' ? 'Demo mode: switch tiers instantly to show churches how AGAPAY changes at each level. No Stripe billing is changed.' : demoActive ? `Your free 30-day demo is active${demoEndLabel?` through ${escapeHtml(demoEndLabel)}`:''}. No card is required during the demo. Add billing information in the secure portal only if you want to continue afterward.` : billingActive ? "Choose a tier or individual Give + add-ons here to update the existing AGAPAY subscription. Use Stripe's secure billing portal for payment details or cancellation." : demoEligible ? 'Choose a tier and start the free 30-day demo. No card is required. Give + includes pledges, Stewardship Health, Parish Directory, and Bookstore; Parish includes the complete operations suite.' : 'Choose a tier and complete subscription checkout to reactivate AGAPAY.'}</p>
      <div class="btn-row">
        ${p.parishId === 'st-fiacre'
          ? '<button class="btn btn-gold" onclick="changeDemoTier(this)">Apply demo tier</button>'
          : demoActive
          ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply demo tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Add billing details</button>' + cancelSubscriptionButton
          : billingActive
          ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage payment details</button>' + cancelSubscriptionButton
          : `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">${demoEligible?'Start free 30-day demo':'Start tier checkout'}</button>`}
      </div>
      <div class="setup-link-box" id="subscriptionUpgradeLinkBox"><a id="subscriptionUpgradeLink" href="#" target="_blank" rel="noopener">Open billing checkout</a><p id="subscriptionUpgradeHelp"></p></div>
      <div class="section-divider"><span>Data portability</span></div>
      <p class="section-note">Your parish records should remain accessible when you leave. Download a copy or review export and closure options. Downloading alone never deletes data, and exporting does not cancel billing.</p>
      <div class="btn-row"><button type="button" class="btn btn-ghost" onclick="openParishPortability()">Data portability &amp; closure</button></div>
      <div class="section-divider"><span>Stripe account</span></div>
      <p class="section-note">Manage your parish Stripe account — update bank account details, payout schedule, business information, and view your full transaction history directly in Stripe.</p>
      <div class="btn-row">
        ${p.stripeAccountId && p.stripeChargesEnabled
          ? `<a class="btn btn-gold" href="https://dashboard.stripe.com" target="_blank" rel="noopener">Manage Stripe account ↗</a>`
          : `<button class="btn btn-ghost" disabled title="Complete Stripe onboarding to access your Stripe account">Stripe account not yet active</button>`}
      </div>
      <div class="section-divider"><span>Feature toggles</span></div>
      <div class="toggle-row">
        <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(p.recurringGivingEnabled??true)?'checked':''} /> Recurring giving</label>
        <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(p.candlesEnabled??true)?'checked':''} /> Candles</label>
        <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(p.commemorationsEnabled??true)?'checked':''} /> Commemorations</label>
        <label class="check-card" ${moduleIncluded('bookstore')?'':'title="Requires the Bookstore or Full Commerce add-on"'}>
          <input id="bookstoreEnabled" type="checkbox" ${moduleIncluded('bookstore')?'':'disabled'} ${(p.bookstoreEnabled??false)?'checked':''} /> Bookstore Payments
        </label>
      </div>
      ${moduleIncluded('bookstore') ? '' : '<p class="section-note">Bookstore Payments is available through the Bookstore add-on, Full Commerce, or Parish. Full Commerce already includes Bookstore.</p>'}
      <div class="btn-row">
        <button class="btn btn-gold" onclick="saveDashboard(this)">Save changes</button>
        ${(p.setup||{}).billingActive?'<button class="btn btn-primary" onclick="startStripeOnboarding(this)">Start Stripe onboarding</button>':'<button class="btn btn-ghost" disabled title="Complete AGAPAY billing first">Stripe unlocks after billing</button>'}
        <button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button>
        <button class="btn btn-ghost" onclick="logoutParish()">Log out</button>
      </div>
      <div class="stripe-link-box" id="stripeLinkBox">
        <a id="stripeOnboardingLink" href="#" target="_blank" rel="noopener">Open Stripe onboarding</a>
        <p>Stripe onboarding links are single-use. If the link expires, return here and create a new one.</p>
      </div>`;
    syncParishHouseholdPricing('subscriptionTierUpgrade','subscriptionHouseholdBandUpgrade','subscriptionHouseholdBandGroup','subscriptionHouseholdBandPrice');
    syncSubscriptionAddOnVisibility('subscriptionTierUpgrade','subscriptionAddOnUpgradeGroup');
    syncPatronalFeastOptionsFromSettings();
    loadParishTaxExemption();

    editableFunds          = fallbackFundsArray(p.funds);
    if (!hasGivingPlusAccess()) {
      let activeDesignatedSeen = false;
      editableFunds = editableFunds.map((fund) => {
        if (!fund || isGeneralDashboardFund(fund) || isCandleDashboardFund(fund) || fund.enabled === false || fund.active === false) return fund;
        if (!activeDesignatedSeen) { activeDesignatedSeen = true; return fund; }
        return { ...fund, enabled: false };
      });
    }
    editableCampaigns      = fallbackCampaignsArray(p.campaigns);
    editableFeastCampaigns = Array.isArray(p.feastCampaigns)
      ? p.feastCampaigns.map((campaign) => ({ ...campaign, destinationFundId: campaign.destinationFundId || 'benevolence-fund' }))
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

  async function uploadParishLogo(btn) {
    const file = document.getElementById('parishLogoFile')?.files?.[0];
    if (!file) { setStatus('Choose a logo image first.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { setStatus('Logo must be 5MB or smaller.', 'error'); return; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/logo', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': file.type },
        body: file
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to upload logo.');
      setStatus('Parish logo uploaded.', 'success');
      await loadDashboard();
    } catch (err) {
      setStatus(err.message || 'Unable to upload logo.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  async function removeParishLogo(btn) {
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/logo', {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to remove logo.');
      setStatus('Parish logo removed.', 'success');
      await loadDashboard();
    } catch (err) {
      setStatus(err.message || 'Unable to remove logo.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  // ── SAVE DASHBOARD ────────────────────────────────────────
  function payload() {
    const newPw = document.getElementById('newDashboardPassword')?.value.trim() || '';
    const conPw = document.getElementById('confirmDashboardPassword')?.value.trim() || '';
    if (newPw || conPw) { if (newPw.length < 8) throw new Error('Password must be at least 8 characters.'); if (newPw !== conPw) throw new Error('Passwords do not match.'); }
    const liturgicalCalendar = document.getElementById('feastLiturgicalCalendar')?.value
      || document.getElementById('settingsLiturgicalCalendar')?.value
      || currentParish?.liturgicalCalendar
      || 'julian';
    const patronalFeastName = document.getElementById('patronalFeastName')?.value.trim() || '';
    const patronalFeastMonth = Number(document.getElementById('patronalFeastMonth')?.value || 0);
    const patronalFeastDay = Number(document.getElementById('patronalFeastDay')?.value || 0);
    if (patronalFeastName && (!patronalFeastMonth || !patronalFeastDay)) throw new Error('Select the patronal feast month and day.');
    const patronalFeastDate = patronalFeastMonth && patronalFeastDay
      ? `${String(patronalFeastMonth).padStart(2, '0')}-${String(patronalFeastDay).padStart(2, '0')}`
      : '';
    const knownPatronalFeast = allFeastPresets().find((feast) => feast.name === patronalFeastName);
    const patronalFeast = patronalFeastName ? (knownPatronalFeast?.id || slugifyLocal(patronalFeastName)) : '';
    upsertPatronalFeastCampaign(patronalFeast, liturgicalCalendar, patronalFeastName, patronalFeastDate);
    const body = {
      parishName:             document.getElementById('parishName')?.value,
      addressLine1:           document.getElementById('addressLine1')?.value,
      addressLine2:           document.getElementById('addressLine2')?.value,
      city:                   document.getElementById('city')?.value,
      state:                  document.getElementById('state')?.value,
      postalCode:             document.getElementById('postalCode')?.value,
      country:                document.getElementById('country')?.value,
      website:                document.getElementById('website')?.value,
      taxLegalName:           document.getElementById('taxLegalName')?.value,
      taxEin:                 document.getElementById('taxEin')?.value,
      liturgicalCalendar,
      patronalFeast,
      patronalFeastName,
      patronalFeastDate,
      givingStatus:           document.getElementById('givingStatus')?.value,
      recurringGivingEnabled: document.getElementById('recurringGivingEnabled')?.checked,
      candlesEnabled:         document.getElementById('candlesEnabled')?.checked,
      commemorationsEnabled:  document.getElementById('commemorationsEnabled')?.checked,
      bookstoreEnabled:       document.getElementById('bookstoreEnabled')?.checked,
      sacramentPriests:       parseSacramentPriestsFromSettings(),
      ...(hasFundManagementAccess() ? {
        funds: editableFunds,
        givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
        accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline,
        ...(hasGivingPlusAccess() ? {
          campaigns: editableCampaigns,
          feastCampaigns: editableFeastCampaigns
        } : {})
      } : {}),
    };
    if (newPw) body.newDashboardPassword = newPw;
    return body;
  }

  function formatSacramentPriestsForSettings(priests) {
    const rows = Array.isArray(priests) ? priests : [];
    return rows.map((priest) => [priest.name, priest.email].filter(Boolean).join(' | ')).join('\n');
  }

  function parseSacramentPriestsFromSettings() {
    const raw = document.getElementById('sacramentPriestsText')?.value || '';
    const existing = Array.isArray(currentParish?.sacramentPriests) ? currentParish.sacramentPriests : [];
    return raw.split(/\r?\n/).map((line) => {
      const [name, email = ''] = line.split('|').map(part => part.trim());
      const saved = existing.find(priest =>
        (email && String(priest.email || '').toLowerCase() === email.toLowerCase())
        || String(priest.name || '').toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        email,
        serviceTypes: Array.isArray(saved?.serviceTypes) ? saved.serviceTypes : defaultSacramentServiceTypes(),
        customServices: Array.isArray(saved?.customServices) ? saved.customServices : []
      };
    }).filter((priest) => priest.name).slice(0, 12);
  }

  async function saveDashboard(btn) {
    if (!currentParish) return;
    let body; try { body = payload(); } catch (err) { setStatus(err.message,'error'); return; }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), { method:'PATCH', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || data.detail || 'Unable to save dashboard.','error'); return; }
      if (body.newDashboardPassword && data.token) { document.getElementById('parishToken').value = data.token; saveSession(); }
      setStatus(body.newDashboardPassword ? 'Settings saved. Password updated.' : 'Parish settings saved.', 'success');
      await loadDashboard();
    } catch (err) { setStatus(err.message,'error'); }
    finally { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } }
  }

  function copyPayload() { if (!currentParish){setStatus('Load a parish first.','error');return;} navigator.clipboard.writeText(JSON.stringify(payload(),null,2)); setStatus('Current settings copied.','success'); }

  // ── STRIPE ONBOARDING ─────────────────────────────────────
  async function startStripeOnboarding(btn) {
    if (!currentParish) return;
    const win = window.open('','_blank'); if (win) win.opener = null;
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-onboarding',{method:'POST',headers:authHeaders()});
      const data = await res.json(); if (!res.ok) throw new Error(data.detail||data.error||'Unable to create onboarding link');
      const lb=document.getElementById('stripeLinkBox');const ll=document.getElementById('stripeOnboardingLink');if(lb&&ll){ll.href=data.onboardingUrl;lb.classList.add('visible');}
      const sb=document.getElementById('setupLinkBox');const sl=document.getElementById('setupActionLink');const sh=document.getElementById('setupLinkHelp');
      if(sb&&sl){sl.href=data.onboardingUrl;sl.textContent='Open Stripe onboarding';sb.classList.add('visible');if(sh)sh.textContent=win?'Stripe onboarding opened in a new tab.':'Your browser blocked the new tab. Use this link.';}
      if(win) win.location.href=data.onboardingUrl;
      setStatus(win?'Stripe onboarding opened in a new tab.':'Stripe onboarding link created.','success');
    } catch(err){if(win)win.close();setStatus(err.message,'error');}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
  }

  // ── SUBSCRIPTION CHECKOUT ─────────────────────────────────
  async function startSubscriptionCheckout(btn, tierSelectId) {
    if (!currentParish) return;
    const startingFreeDemo = Boolean(currentParish.subscriptionIntroDemoEligible) || currentParish.subscriptionStatus === 'trial_checkout_created';
    const win = window.open('','_blank'); if (win) win.opener = null;
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      const tier = document.getElementById(tierSelectId || 'setupSubscriptionTier');
      const householdBandId = tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionHouseholdBandUpgrade' : 'setupParishHouseholdBand';
      const householdBand = document.getElementById(householdBandId);
      const addOnGroupId = tierSelectId === 'subscriptionTierUpgrade' ? 'subscriptionAddOnUpgradeGroup' : 'setupSubscriptionAddOnGroup';
      if ((tier?.value || currentParish.subscriptionTier) === 'parish' && !householdBand?.value) {
        throw new Error('Choose the parish active-household range before continuing.');
      }
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-checkout',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({subscriptionTier:tier?tier.value:currentParish.subscriptionTier,parishHouseholdBand:householdBand?.value||'',subscriptionAddOns:selectedSubscriptionAddOns(addOnGroupId)})});
      const data = await res.json(); if (!res.ok) throw new Error(data.detail||data.error||'Unable to create checkout');
      if (data.registration) currentParish = { ...currentParish, ...data.registration };
      if (!data.checkoutUrl){if(win)win.close();await loadDashboard();setStatus('Subscription updated. No checkout required.','success');await window.ParishFeatureRegistry?.get('accounting')?.activate?.();return;}
      const sb=tierSelectId ? (document.getElementById('subscriptionUpgradeLinkBox') || document.getElementById('setupLinkBox')) : (document.getElementById('setupLinkBox') || document.getElementById('subscriptionUpgradeLinkBox'));
      const sl=tierSelectId ? (document.getElementById('subscriptionUpgradeLink') || document.getElementById('setupActionLink')) : (document.getElementById('setupActionLink') || document.getElementById('subscriptionUpgradeLink'));
      const sh=tierSelectId ? (document.getElementById('subscriptionUpgradeHelp') || document.getElementById('setupLinkHelp')) : (document.getElementById('setupLinkHelp') || document.getElementById('subscriptionUpgradeHelp'));
      if(sb&&sl){sl.href=data.checkoutUrl;sl.textContent=startingFreeDemo?'Open free demo setup':'Open billing checkout';sb.classList.add('visible');if(sh)sh.textContent=win?(startingFreeDemo?'Free demo setup opened in a new tab. No card is required.':'Billing checkout opened in a new tab.'):'Your browser blocked the new tab. Use this link.';}
      if(win) win.location.href=data.checkoutUrl;
      setStatus(win?(startingFreeDemo?'Free demo setup opened in a new tab.':'Subscription checkout opened in a new tab.'):(startingFreeDemo?'Free demo setup is ready.':'Checkout created.'),'success');
    } catch(err){if(win)win.close();setStatus(err.message,'error');}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
  }

  async function loadStripeVolume(btn) {
    const body = document.getElementById('stripeVolumeBody');
    if (!currentParish || !body) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-volume', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.volume) throw new Error(data.detail || data.error || 'Unable to load Stripe volume');
      renderStripeVolume(data.volume || {});
      await loadNonprofitPricing();
    } catch (err) {
      body.innerHTML = `<div class="insights-empty-dark">${escapeHtml(err.message)}</div>`;
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
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
    const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/nonprofit-pricing' + path, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.detail || 'Unable to update the nonprofit-pricing application');
    return data;
  }

  async function loadNonprofitPricing(btn) {
    const body = document.getElementById('nonprofitPricingApplicationBody');
    if (!currentParish || !body) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
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
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
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
    const documents = (application.documents || []).filter(document => document.isCurrent);
    const statusLabel = String(application.status || 'not_started').replaceAll('_', ' ');
    const measuredPercent = Number(data.volume?.donationPercent || 0).toFixed(2);
    const applicationParishName = currentParish.parishName || currentParish.name || 'The parish';
    const applicationStatement = `${applicationParishName} confirms that ${measuredPercent}% of its measured year-to-date Stripe payment volume is from tax-deductible donations. The parish is a registered nonprofit organization and requests review for Stripe nonprofit pricing for connected account ${application.stripeAccountId || ''}. An authorized account owner is submitting this request while logged into the parish Stripe account.`;
    const checks = [
      ['Complete Stripe volume scan', readiness.measurementComplete],
      ['At least 80% measured donation volume', readiness.measuredAtOrAbove80],
      ['Signed parish attestation', readiness.attestationComplete],
      ['Nonprofit documentation uploaded', readiness.hasNonprofitProof]
    ];
    body.innerHTML = `
      <div style="display:grid;gap:18px;">
        <div class="insights-empty-dark" style="text-align:left;">
          <strong>Stripe confirmed:</strong> each Standard connected parish must apply separately. The account owner must be logged into the parish Stripe account and contact Stripe directly. AGAPAY prepares and tracks the packet but cannot submit it for the parish.
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><strong>Application status</strong><span>${escapeHtml(statusLabel)}</span></div>
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
          <div>${documents.length ? documents.map(document => `<button type="button" class="pdx-link-btn" onclick="viewNonprofitPricingDocument('${escapeAttr(document.id)}')">${escapeHtml(document.documentType.replaceAll('_', ' '))}: ${escapeHtml(document.filename)}</button>`).join('<br>') : '<span style="color:var(--muted);">No documents uploaded yet.</span>'}</div>
        </form>
        <div style="display:grid;gap:10px;">
          <strong>Submit through the parish Stripe account</strong>
          <p style="margin:0;color:var(--muted);font-size:13px;">When all four readiness checks are complete, sign in to Stripe, open Support, and request nonprofit pricing. Include the account ID, registered email, donation-volume confirmation, tax registration details, and tax-exempt documentation.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-secondary btn-sm" href="https://support.stripe.com/contact" target="_blank" rel="noopener">Open Stripe Support</a><input id="nppStripeCaseId" maxlength="120" placeholder="Stripe support case ID (if provided)" value="${escapeAttr(application.stripeSupportCaseId || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="markNonprofitPricingSubmitted(this)" ${readiness.readyToSubmit ? '' : 'disabled'}>I submitted this to Stripe</button></div>
        </div>
        ${application.status === 'submitted_to_stripe' || application.status === 'stripe_approved' || application.status === 'stripe_declined' ? `
          <div style="display:grid;gap:10px;">
            <strong>Record Stripe’s response</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;">Stripe said its review team will notify the connected account when pricing is applied. Upload that message above before recording approval.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;"><input id="nppEffectiveDate" type="date" value="${escapeAttr(application.stripeEffectiveDate || '')}" /><button class="btn btn-primary btn-sm" type="button" onclick="recordNonprofitPricingDecision('approved',this)">Stripe approved</button><button class="btn btn-secondary btn-sm" type="button" onclick="recordNonprofitPricingDecision('declined',this)">Stripe declined</button></div>
          </div>` : ''}
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
          accountOwnerSubmission: Boolean(document.getElementById('nppOwnerSubmit')?.checked)
        })
      });
      renderNonprofitPricingApplication(data);
      setStatus('Nonprofit-pricing attestation saved.', 'success');
    } catch (err) { setStatus(err.message, 'error'); }
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
    } catch (err) { setStatus(err.message, 'error'); }
  }

  async function markNonprofitPricingSubmitted(btn) {
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const data = await nonprofitPricingFetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_submitted', stripeSupportCaseId: document.getElementById('nppStripeCaseId')?.value || '' })
      });
      renderNonprofitPricingApplication(data);
      setStatus('Stripe submission recorded.', 'success');
    } catch (err) { setStatus(err.message, 'error'); }
    finally { if (btn?.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
  }

  async function recordNonprofitPricingDecision(decision, btn) {
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const data = await nonprofitPricingFetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_decision', decision, effectiveDate: document.getElementById('nppEffectiveDate')?.value || '' })
      });
      renderNonprofitPricingApplication(data);
      setStatus(`Stripe ${decision} decision recorded.`, 'success');
    } catch (err) { setStatus(err.message, 'error'); }
    finally { if (btn?.isConnected) { btn.disabled = false; btn.classList.remove('loading'); } }
  }

  async function viewNonprofitPricingDocument(documentId) {
    try {
      const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/nonprofit-pricing/documents/' + encodeURIComponent(documentId), { headers: authHeaders() });
      if (!response.ok) throw new Error('Unable to open document');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setStatus(err.message, 'error'); }
  }

  async function changeDemoTier(btn) {
    if (currentParish?.parishId !== 'st-fiacre') return;
    const tier = document.getElementById('subscriptionTierUpgrade')?.value || '';
    const parishHouseholdBand = document.getElementById('subscriptionHouseholdBandUpgrade')?.value || '';
    if (tier === 'parish' && !parishHouseholdBand) { setStatus('Choose the parish active-household range first.', 'error'); return; }
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      const res = await fetch('/api/parish/dashboard/st-fiacre/demo-tier', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionTier: tier, parishHouseholdBand })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to change the demo tier');
      currentParish = { ...currentParish, ...(data.parish || {}) };
      await loadDashboard();
      switchTab('settings');
      setStatus(`St. Fiacre is now demonstrating the ${data.parish?.subscriptionTierLabel || tier} tier.`, 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn){btn.classList.remove('loading');btn.disabled=false;}
    }
  }

  async function openSubscriptionPortal(btn) {
    if (!currentParish) return;
    const win = window.open('','_blank'); if (win) win.opener = null;
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      await refreshSubscriptionStatus({ quiet: true });
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-portal',{method:'POST',headers:authHeaders()});
      const data = await res.json(); if (!res.ok) throw new Error(data.detail||data.error||'Unable to open subscription management');
      if (win) win.location.href = data.portalUrl;
      setStatus(win?'Subscription management opened in a new tab.':'Subscription management link created.','success');
    } catch(err){if(win)win.close();setStatus(err.message,'error');}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
  }

  async function openSubscriptionCancellation(btn) {
    if (!currentParish) return;
    if (!window.confirm('Cancel AGAPAY Give? Stripe will show the cancellation date and ask you to confirm before anything changes.')) return;
    const win = window.open('', '_blank'); if (win) win.opener = null;
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      await refreshSubscriptionStatus({ quiet: true });
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-portal', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cancel' })
      });
      const data = await res.json(); if (!res.ok) throw new Error(data.detail||data.error||'Unable to open subscription cancellation');
      if (win) win.location.href = data.portalUrl;
      setStatus(win?'Subscription cancellation opened in a new tab. Confirm the change in Stripe.':'Subscription cancellation link created.','success');
    } catch(err){if(win)win.close();setStatus(err.message,'error');}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
  }

  const params = new URLSearchParams(window.location.search);
  const parishIdField = document.getElementById('parishId');
  if (params.get('parish') && parishIdField) parishIdField.value = params.get('parish');
  window.ParishFeatureRegistry?.get('giving')?.init();
  if (!initParishAccessInvitationPage()) initParishPasswordResetPage();
