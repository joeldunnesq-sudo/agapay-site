// ── STATE ────────────────────────────────────────────────
  window.AgapayMfa?.installFetchStepUp();
  let currentParish     = null;
  let currentQrSvg      = '';
  let editableFunds     = [];
  let editableCampaigns = [];
  let editableFeastCampaigns = [];
  let givingCatalogBaseline = '';
  let accountingCatalogBaseline = '';
  let editingGivingOption = null;
  let activeTab         = 'giving';
  let editingCampaignId = null;
  let campaignCoverUrl  = '';
  let campaignPhotos    = [];
  let allGifts          = [];   // full history cache
  let manualAccountingGifts = []; // posted manual contributions used by overview widgets
  let filteredGifts     = [];   // filtered view
  let reconciliationData = null;
  let stewardshipState   = { loaded: false, stewardship: null, meetings: [], selectedMeeting: null };
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

  function setDashboardBootMessage(title, message) {
    const titleEl = document.getElementById('dashboardBootTitle');
    const messageEl = document.getElementById('dashboardBootMessage');
    if (titleEl && title) titleEl.textContent = title;
    if (messageEl && message) messageEl.textContent = message;
  }

  function finishDashboardBoot() {
    document.body.classList.remove('dashboard-booting', 'dashboard-load-failed');
    document.body.classList.add('dashboard-ready');
    document.querySelector('.app')?.setAttribute('aria-busy', 'false');
  }

  function failDashboardBoot(message) {
    setDashboardBootMessage('We could not open the dashboard', message || 'Please sign in again and retry.');
    document.body.classList.add('dashboard-load-failed');
    document.getElementById('dashboardBootRecovery')?.removeAttribute('hidden');
  }

  function setDashboardRefreshing(refreshing) {
    document.body.classList.toggle('dashboard-refreshing', refreshing);
    document.querySelector('.app')?.setAttribute('aria-busy', refreshing ? 'true' : 'false');
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

  // ── PRESETS ──────────────────────────────────────────────
  const fundPresets = {
    general:    { id:'general',    name:'General Operating Fund',    description:'Utilities, supplies, ministries, and day-to-day parish needs.' },
    building:   { id:'building',   name:'New Building Fund',          description:'Support for property purchase, construction, renovation, or long-term building needs.' },
    clergy:     { id:'clergy',     name:'Clergy Support Fund',        description:'Direct support for the priest, clergy family, and clergy-related parish needs.' },
    benevolence:{ id:'benevolence-fund',name:'Benevolence Fund',      description:'Restricted assistance for the poor, needy families, and neighbors facing hardship.', restrictionType:'donor_restricted_temporary' },
    education:  { id:'education',  name:'Education & Youth Fund',     description:'Catechism, youth programs, parish school materials, retreats, and formation.' },
    icons:      { id:'icons',      name:'Icons & Beautification Fund',description:'Icons, liturgical furnishings, vestments, candles, and beautification of the church.' },
    missions:   { id:'missions',   name:'Mission & Outreach Fund',    description:'Evangelism, local outreach, charitable work, and mission-related parish efforts.' }
  };
  const campaignPresets = {
    disaster:  { id:'disaster-relief',  name:'Disaster Relief',             description:'Emergency alms for parish families or neighbors affected by fire, flood, storm, or other disaster.' },
    medical:   { id:'medical-support',  name:'Medical or Sickness Support', description:'Alms for someone facing medical bills, recovery costs, or serious illness.' },
    priestCar: { id:'priest-car-fund',  name:"Priest's Car Fund",           description:'Support toward a reliable vehicle or vehicle repairs for clergy transportation needs.' },
    funeral:   { id:'funeral-support',  name:'Funeral & Burial Support',    description:'Alms to help a family with funeral, burial, or memorial-related expenses.' },
    family:    { id:'family-hardship',  name:'Family Hardship Support',     description:'Temporary alms for rent, utilities, food, travel, or urgent family needs.' },
    monastery: { id:'monastery-support',name:'Monastery Support',           description:'Alms for monastery needs, hospitality, supplies, repairs, or monastic support.' },
    sisterhood:{ id:'sisterhood-support',name:'Sisterhood Support',         description:'Alms to strengthen the parish sisterhood in its charitable work, hospitality, and service.' },
    brotherhood:{ id:'brotherhood-support',name:'Brotherhood Support',      description:'Alms to support the parish brotherhood in fellowship, service, and practical parish needs.' }
  };
  const fallbackFeastPresets = [
    { id:'pascha',             name:'Pascha', displayDate:'Varies', sourceDate:'Moveable feast from Orthodox Pascha' },
    { id:'ascension',          name:'Ascension', displayDate:'Varies', sourceDate:'Moveable feast - 39 days after Pascha' },
    { id:'pentecost',          name:'Pentecost', displayDate:'Varies', sourceDate:'Moveable feast - 49 days after Pascha' },
    { id:'nativity-theotokos', name:'Nativity of the Theotokos', displayDate:'Sep 21', sourceDate:'Julian Sep 8' },
    { id:'exaltation-cross',   name:'Exaltation of the Cross', displayDate:'Sep 27', sourceDate:'Julian Sep 14' },
    { id:'entrance-theotokos', name:'Entrance of the Theotokos', displayDate:'Dec 4', sourceDate:'Julian Nov 21' },
    { id:'nativity-christ',    name:'Nativity of Christ', displayDate:'Jan 7', sourceDate:'Julian Dec 25' },
    { id:'theophany',          name:'Theophany', displayDate:'Jan 19', sourceDate:'Julian Jan 6' },
    { id:'meeting-lord',       name:'Meeting of the Lord', displayDate:'Feb 15', sourceDate:'Julian Feb 2' },
    { id:'annunciation',       name:'Annunciation', displayDate:'Apr 7', sourceDate:'Julian Mar 25' },
    { id:'transfiguration',    name:'Transfiguration', displayDate:'Aug 19', sourceDate:'Julian Aug 6' },
    { id:'dormition',          name:'Dormition of the Theotokos', displayDate:'Aug 28', sourceDate:'Julian Aug 15' }
  ];

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
    if ((tab === 'history' || tab === 'givers' || tab === 'options') && currentParish && !allGifts.length) loadGivingHistory();
    if (tab === 'givers' && allGifts.length) renderGiversPanel();
    if (tab === 'options' && currentParish) {
      renderGivingOptionsEditor();
      loadSettlementProfilesPanel();
    }
    if (tab === 'campaigns' && currentParish) renderCampaignList(currentParish);
    if (tab === 'stewardship') loadStewardshipPanel();
    if (tab === 'sacraments') loadRegisteredParishFeature('sacraments');
    if (tab === 'directory' && moduleIncluded('directory')) loadRegisteredParishFeature('directory');
    if (tab === 'library') loadRegisteredParishFeature('library');
    if (tab === 'communications') loadRegisteredParishFeature('koinonia');
    if (tab === 'accounting') loadRegisteredParishFeature('accounting');
    if (tab === 'bookstore') loadRegisteredParishFeature('commerce');
    if (tab === 'reconcile' && currentParish) loadReconciliation();
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
  function qrFilename(ext) { return `${currentParish?.parishId || 'agapay-parish'}-giving-qr.${ext}`; }
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

  function stewardshipApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stewardship' + path;
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
    const sw = stewardshipState.stewardship || {};
    return Boolean(currentParish?.stewardshipActive || sw.legacyAddOnActive || (!sw.includedInParishTier && ['active', 'trialing', 'comped'].includes(sw.status)));
  }

  function isStarterTier(parish = currentParish) {
    return String(parish?.subscriptionTier || '').toLowerCase() === 'starter';
  }

  async function loadStewardshipPanel(force = false) {
    const status = document.getElementById('stewardshipStatusLabel');
    const planPane = document.getElementById('stewardshipPlanPane');
    if (!planPane) return;
    if (!currentParish) {
      if (status) status.textContent = 'Not loaded';
      return;
    }
    const stewardshipLocked = isStarterTier() || (!isParishTier() && !isParishPlusActive());
    syncDashboardPaywall(document.getElementById('tab-stewardship'), 'stewardship', 'Stewardship', stewardshipLocked);
    if (stewardshipLocked) {
      renderStewardshipUnavailableForTier();
      return;
    }
    if (stewardshipState.loaded && !force) {
      renderStewardshipPanel();
      renderParishPlusMeetingsPane(document.getElementById('parishPlusMeetingsPane'), isParishPlusActive());
      // Always reload metrics/financials when switching to the tab
      const _active = isParishPlusActive();
      if (_active) loadStewardshipEssentialPanels();
      return;
    }
    if (status) status.textContent = 'Loading…';
    try {
      const res = await fetch(stewardshipApi(), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      stewardshipState = {
        loaded: true,
        stewardship: data.stewardship || { status: 'coming_soon', active: false },
        meetings: data.meetings || [],
        subscribePlans: data.subscribePlans || [],
        setupRequired: !!data.setupRequired,
        comingSoon: !!data.comingSoon,
        selectedMeeting: null
      };
    } catch (err) {
      stewardshipState = {
        loaded: true,
        stewardship: { status: 'coming_soon', active: false },
        meetings: [], subscribePlans: [], setupRequired: false, comingSoon: true, selectedMeeting: null
      };
    }
    updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
    renderStewardshipPanel();
    loadStewardshipEssentialPanels();
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

  function loadStewardshipEssentialPanels() {
    loadStewardshipHealthScorePanel();
    setTimeout(() => loadGivingMetricsPanel(), 300);
    setTimeout(() => loadFinancialSnapshotsPanel(), 600);
    setTimeout(() => loadManualIncomePanel(), 900);
    setTimeout(() => loadDonorConcentrationPanel(), 1200);
    setTimeout(() => loadRecurringGivingPanel(), 1500);
  }

  // ── Giving Metrics Panel ─────────────────────────────────────────────────
  let givingMetricsState = { loaded: false, year: new Date().getFullYear() };

  async function loadGivingMetricsPanel(year) {
    const pane = document.getElementById('givingMetricsPane');
    if (!pane || !currentParish) return;
    if (year) givingMetricsState.year = year;
    if (!pane.querySelector('.sw-kpi-grid')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const y = givingMetricsState.year;
      const base = stewardshipApi().replace('/stewardship', '/stewardship/giving');
      const [summaryRes, fundsRes] = await Promise.all([
        fetch(base + '/summary?year=' + y, { headers: authHeaders() }),
        fetch(base + '/funds?year=' + y, { headers: authHeaders() })
      ]);
      const summary = await summaryRes.json().catch(() => ({}));
      let funds = await fundsRes.json().catch(() => ({}));
      if (!summaryRes.ok) throw new Error(summary.detail || summary.error || `Giving summary failed (${summaryRes.status}).`);
      if (!fundsRes.ok) {
        funds = { funds: [], total_cents: 0, error: funds.detail || funds.error || `Giving funds failed (${fundsRes.status}).` };
      }
      if (summary.error && summary.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      givingMetricsState.loaded = true;
      pane.innerHTML = renderGivingMetrics(summary, funds, y);
      // Background check — enable nudge button only if donors are 3+ months behind
      checkNudgeEligibility();
    } catch (e) {
      pane.innerHTML = '<p class="muted">Giving metrics unavailable' + (e.message ? ': ' + escapeHtml(e.message) : '.') + '</p>';
    }
  }

  function fmtDollars(cents) {
    return '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function swRing(pct, tone, valueLabel, subLabel) {
    const clamped = Math.max(0, Math.min(100, pct));
    const circumference = 2 * Math.PI * 26;
    const dash = (clamped / 100) * circumference;
    return (
      '<div class="sw-ring-row">' +
        '<svg class="sw-ring-svg" viewBox="0 0 60 60">' +
          '<circle class="sw-ring-track" cx="30" cy="30" r="26"/>' +
          '<circle class="sw-ring-fill tone-' + tone + '" cx="30" cy="30" r="26" ' +
            'stroke-dasharray="' + dash.toFixed(1) + ' ' + circumference.toFixed(1) + '"/>' +
        '</svg>' +
        '<div class="sw-ring-copy"><strong>' + escapeHtml(valueLabel) + '</strong><span>' + escapeHtml(subLabel) + '</span></div>' +
      '</div>'
    );
  }

  function renderGivingMetrics(s, f, year) {
    const pct   = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.total_actual_cents / s.total_pledged_cents) * 100)) : 0;
    const rrPct = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.run_rate_cents   / s.total_pledged_cents) * 100)) : 0;
    const yoy   = s.prior_year_actual_cents > 0
      ? Math.round(((s.total_actual_cents - s.prior_year_actual_cents) / s.prior_year_actual_cents) * 100) : null;
    const yoyHtml = yoy !== null
      ? '<span class="sw-yoy sw-yoy-' + (yoy >= 0 ? 'up' : 'down') + '">' + (yoy >= 0 ? '▲' : '▼') + ' ' + Math.abs(yoy) + '% vs prior year</span>' : '';

    // Budget Pace — the annual pledge total treated as the giving goal,
    // pro-rated against how far through the fiscal year today is. This is
    // what turns "projected year-end: $218,000" from a number nobody can
    // evaluate into a clear behind/ahead-of-pace verdict.
    let budgetPaceHtml = '';
    if (s.total_pledged_cents > 0 && s.day_of_year && s.days_in_year) {
      const expectedByTodayCents = Math.round(s.total_pledged_cents * (s.day_of_year / s.days_in_year));
      const behindPaceCents = expectedByTodayCents - s.total_actual_cents;
      const isBehind = behindPaceCents > 0;
      budgetPaceHtml =
        '<div class="sw-fin-section-label" style="margin-top:1.1rem;">Budget Pace</div>' +
        '<div class="sw-budget-pace-grid">' +
          gmKpi('Annual Goal', fmtDollars(s.total_pledged_cents), 'fiscal year ' + year) +
          gmKpi('Expected by Today', fmtDollars(expectedByTodayCents), 'pro-rated to date') +
          gmKpi('Actual Collected', fmtDollars(s.total_actual_cents), '') +
          gmKpi(isBehind ? 'Behind Pace' : 'Ahead of Pace', fmtDollars(Math.abs(behindPaceCents)), '') +
          gmKpi('Projected Year-End', fmtDollars(s.run_rate_cents), s.run_rate_cents >= s.total_pledged_cents ? 'on track to meet goal' : 'short of goal at this pace') +
        '</div>';
    }

    const fundRows = (f.funds || []).filter(fd => fd.total_cents > 0).map(fd =>
      '<tr class="sw-fund-row">' +
        '<td class="sw-fund-name">' + escapeHtml(fd.fund_name) + '</td>' +
        '<td class="sw-fund-total">' + fmtDollars(fd.total_cents) + '</td>' +
        '<td class="sw-fund-pct">' + fd.pct_of_total + '%' +
          '<span class="sw-fund-bar"><i style="width:' + Math.min(100, fd.pct_of_total) + '%"></i></span>' +
        '</td>' +
      '</tr>'
    ).join('');

    const ringTone = pct >= 90 ? 'green' : pct >= 60 ? 'gold' : 'red';
    const ringHtml = s.total_pledged_cents > 0
      ? swRing(pct, ringTone, pct + '%', 'of pledge goal')
      : '';

    return (
      ringHtml +
      '<div class="sw-kpi-grid">' +
        gmKpi('Collected',   fmtDollars(s.total_actual_cents),  yoyHtml || (s.active_donors + ' donors')) +
        gmKpi('Pledged',     fmtDollars(s.total_pledged_cents), s.pledging_donors + ' pledging households') +
        gmKpi('Fulfillment', s.fulfillment_rate_pct !== null ? s.fulfillment_rate_pct + '%' : '—', 'of pledge goal') +
        gmKpi('Avg / Donor', fmtDollars(s.avg_per_donor_cents), s.active_donors + ' active this year') +
      '</div>' +
      budgetPaceHtml +
      (s.total_pledged_cents > 0 ?
        '<div class="sw-progress-block">' +
          '<div class="sw-progress-label"><span>Collected vs pledge goal</span><strong>' + pct + '%</strong></div>' +
          '<div class="sw-progress-track"><div class="sw-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="sw-progress-label sw-progress-label--runrate"><span>Run-rate projection</span><strong>' + fmtDollars(s.run_rate_cents) + '</strong></div>' +
          '<div class="sw-progress-track"><div class="sw-progress-fill sw-progress-fill--dim" style="width:' + rrPct + '%"></div></div>' +
        '</div>'
      : '') +
      (fundRows ?
        '<div class="sw-fund-table-wrap">' +
          '<table class="sw-fund-table">' +
            '<thead><tr><th>Fund</th><th class="sw-th-right">Total</th><th class="sw-th-right">Share</th></tr></thead>' +
            '<tbody>' + fundRows + '</tbody>' +
          '</table>' +
        '</div>'
      : '')
    );
  }

  function gmKpi(label, value, sub) {
    return (
      '<div class="sw-kpi-card">' +
        '<span class="sw-kpi-label">' + label + '</span>' +
        '<strong class="sw-kpi-value">' + value + '</strong>' +
        '<span class="sw-kpi-sub">' + sub + '</span>' +
      '</div>'
    );
  }

  function renderGivingMetricsUpgrade() {
    return (
      '<div class="sw-upgrade-nudge">' +
        '<p>Stewardship reports are included with the Stewardship and Parish plans.</p>' +
        '<button type="button" class="sw-upgrade-btn" onclick="switchTab(\'settings\')">Review parish tier</button>' +
      '</div>'
    );
  }

  // A sample KPI grid (blurred, real layout, fake numbers) sits behind the
  // upgrade CTA so a Mission-tier treasurer can see exactly what they're
  // missing rather than just reading a sentence about it.
  function renderFinancialsUpgradePrompt() {
    const sampleKpis =
      '<div class="sw-fin-kpi-grid">' +
        swFinKpi('Total Income', '$84,200', '12 packets', 'income', '<span class="sw-fin-yoy sw-fin-yoy-good">\u25B2 9% vs 2025</span>') +
        swFinKpi('Total Expenses', '$71,600', 'across all packets', 'expense', '<span class="sw-fin-yoy sw-fin-yoy-bad">\u25B2 4% vs 2025</span>') +
        swFinKpi('Net Surplus', '$12,600', 'fiscal year 2026', 'surplus', '<span class="sw-fin-yoy sw-fin-yoy-good">\u25B2 22% vs 2025</span>') +
        swFinKpi('Expense Ratio', '85%', 'of income spent', 'surplus', '<span class="sw-fin-yoy sw-fin-yoy-good">\u25BC 3 pts vs 2025</span>') +
        swFinKpi('Restricted Funds', '$31,400', '4 funds tracked', '') +
      '</div>';

    return (
      '<div class="sw-fin-upsell-wrap">' +
        '<div class="sw-fin-upsell-preview" aria-hidden="true">' + sampleKpis + '</div>' +
        '<div class="sw-upsell-cta">' +
          '<strong style="font-family:var(--serif);font-size:1.1rem;color:var(--deep);">See your finances at a glance</strong>' +
          '<p class="section-note" style="margin:0;">Year-over-year income, expenses, and restricted fund balances — the numbers your council actually asks about at every meeting.</p>' +
          '<div class="sw-upsell-price"><strong>$99</strong><span>/ month</span></div>' +
          '<ul class="sw-upsell-list">' +
            '<li>Year-over-year comparison on every metric</li>' +
            '<li>Restricted fund balances tracked automatically</li>' +
            '<li>Full stewardship reports, donor retention, and giving distribution too</li>' +
          '</ul>' +
          '<button type="button" class="sw-subscribe-btn" onclick="switchTab(\'settings\')">Upgrade to Stewardship</button>' +
          '<p class="sw-upsell-note">Also included in the complete Parish plan.</p>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Outside-AGAPAY contribution intake ──────────────────────────────────
  // This is intentionally limited to contributions. Bookstore, retreat,
  // rental, grant, and other operating revenue belongs in the financial
  // snapshot (and eventually Accounting), never in stewardship-giving health.
  const manualIncomeSourceLabels = {
    cash_and_checks: 'Cash/Check Collection',
    tithely: 'Tithe.ly',
    paypal: 'PayPal',
    other_giving_platform: 'Another Giving Platform'
  };

  function openOutsideAgapayGiving() {
    const pane = document.getElementById('stewardshipManualIncomePane');
    if (!pane) return;
    pane.hidden = false;
    loadManualIncomePanel(financialsState.year);
    pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeOutsideAgapayGiving() {
    const pane = document.getElementById('stewardshipManualIncomePane');
    if (pane) pane.hidden = true;
  }

  async function loadManualIncomePanel(year) {
    const pane = document.getElementById('stewardshipManualIncomePane');
    if (!pane || !currentParish) return;
    if (!isParishTier()) { pane.innerHTML = renderGivingMetricsUpgrade(); return; }

    const y = year || financialsState.year || givingMetricsState.year;
    if (!pane.querySelector('.sw-income-form')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const res = await fetch(stewardshipApi('/income/manual?year=' + y), { headers: authHeaders() });
      const data = await res.json();
      if (data.error && data.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      pane.innerHTML = renderManualIncome(data);
    } catch (e) {
      pane.innerHTML = '<p class="muted">Outside-AGAPAY giving data unavailable.</p>';
    }
  }

  function renderManualIncome(d) {
    const fmt = (c) => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const entries = d.entries || [];
    const today = new Date().toISOString().slice(0, 10);

    const rows = entries.length ? entries.map(e =>
      '<tr class="sw-income-row">' +
        '<td>' + escapeHtml(e.entryDate) + '</td>' +
        '<td>' + escapeHtml(e.sourceLabel) + '</td>' +
        '<td>' + escapeHtml(e.fundCode || '') + '</td>' +
        '<td class="sw-td-right">' + fmt(e.amountCents) + '</td>' +
        '<td class="sw-income-notes">' + escapeHtml([e.batchReference, e.notes].filter(Boolean).join(' · ')) + '</td>' +
        '<td><button type="button" class="sw-income-delete-btn" onclick="deleteManualIncomeEntry(\'' + escapeAttr(e.id) + '\')" title="Delete entry">&times;</button></td>' +
      '</tr>'
    ).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem;">No outside-AGAPAY contributions recorded for this year.</td></tr>';

    const bySourceHtml = Object.keys(d.by_source_cents || {}).length
      ? '<div class="sw-income-by-source">' + Object.entries(d.by_source_cents).map(([src, cents]) =>
          '<span><strong>' + fmt(cents) + '</strong> ' + escapeHtml(manualIncomeSourceLabels[src] || src) + '</span>'
        ).join('') + '</div>'
      : '';

    return (
      '<div class="sw-outside-giving-head">' +
        '<div><strong>Record outside-AGAPAY giving</strong><p>Only contributions belong here. Operating revenue is entered in the financial snapshot.</p></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="closeOutsideAgapayGiving()">Close</button>' +
      '</div>' +
      '<form class="sw-income-form" onsubmit="submitManualIncomeEntry(event)">' +
        '<div class="sw-income-form-row">' +
          '<label>Date<input type="date" name="entryDate" value="' + today + '" max="' + today + '" required /></label>' +
          '<label>Contribution source<select name="source" required onchange="this.closest(\'.sw-income-form-row\').querySelector(\'.sw-income-source-label-field\').hidden = (this.value !== \'other_giving_platform\')">' +
            '<option value="cash_and_checks">Cash/Check Collection</option>' +
            '<option value="tithely">Tithe.ly</option>' +
            '<option value="paypal">PayPal</option>' +
            '<option value="other_giving_platform">Another Giving Platform</option>' +
          '</select></label>' +
          '<label class="sw-income-source-label-field" hidden>Platform name<input type="text" name="sourceLabel" placeholder="e.g. Venmo" maxlength="60" /></label>' +
          '<label>Amount<input type="number" name="amountCents" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required /></label>' +
          '<label>Fund/designation<input type="text" name="fundCode" placeholder="e.g. General Fund" maxlength="60" required /></label>' +
          '<label>Deposit or batch reference<input type="text" name="batchReference" placeholder="Optional reference" maxlength="120" /></label>' +
          '<label class="sw-income-notes-field">Optional note<input type="text" name="notes" placeholder="e.g. Sunday collection" maxlength="200" /></label>' +
          '<button type="submit" class="sw-action-btn sw-income-submit-btn">Record contribution</button>' +
        '</div>' +
        '<div class="sw-income-form-status" aria-live="polite"></div>' +
      '</form>' +
      (bySourceHtml || '') +
      '<div class="sw-fin-table-wrap" style="margin-top:.75rem;">' +
        '<table class="sw-fin-table sw-income-table">' +
          '<thead><tr><th>Date</th><th>Source</th><th>Fund</th><th class="sw-th-right">Amount</th><th>Reference / note</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<p class="muted" style="font-size:.72rem;margin:.6rem 0 0;">These contribution entries flow into Budget Pace, Stewardship Health, the monthly report, and the authoritative financial snapshot.</p>'
    );
  }

  async function submitManualIncomeEntry(event) {
    event.preventDefault();
    const form = event.target;
    const status = form.querySelector('.sw-income-form-status');
    const submitBtn = form.querySelector('.sw-income-submit-btn');
    const fd = new FormData(form);
    const amountDollars = parseFloat(fd.get('amountCents'));
    const payload = {
      entryDate: fd.get('entryDate'),
      source: fd.get('source'),
      sourceLabel: fd.get('sourceLabel') || '',
      amountCents: Math.round((amountDollars || 0) * 100),
      fundCode: fd.get('fundCode') || '',
      batchReference: fd.get('batchReference') || '',
      notes: fd.get('notes') || '',
    };
    if (status) { status.textContent = 'Saving…'; status.className = 'sw-income-form-status'; }
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(stewardshipApi('/income/manual'), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not save entry.');
      if (status) { status.textContent = 'Saved.'; status.className = 'sw-income-form-status sw-income-form-status--ok'; }
      form.reset();
      const platformField = form.querySelector('.sw-income-source-label-field');
      if (platformField) platformField.hidden = true;
      loadManualIncomePanel();
      // Qualified outside contributions affect Budget Pace, Stewardship Health,
      // and the derived contribution total in the fiscal-year snapshot.
      loadGivingMetricsPanel();
      loadStewardshipHealthScorePanel();
      loadFinancialSnapshotsPanel();
    } catch (e) {
      if (status) { status.textContent = e.message; status.className = 'sw-income-form-status sw-income-form-status--error'; }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteManualIncomeEntry(entryId) {
    if (!confirm('Delete this outside-AGAPAY contribution? This cannot be undone.')) return;
    try {
      const res = await fetch(stewardshipApi('/income/manual/' + encodeURIComponent(entryId)), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      loadManualIncomePanel();
      loadGivingMetricsPanel();
      loadStewardshipHealthScorePanel();
      loadFinancialSnapshotsPanel();
    } catch (e) {
      alert('Could not delete contribution: ' + e.message);
    }
  }

  // page of disconnected numbers.
  async function loadStewardshipHealthScorePanel(year) {
    const pane = document.getElementById('stewardshipHealthScorePane');
    if (!pane || !currentParish) return;
    if (!pane.querySelector('.sw-health-score-row')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const y = year || givingMetricsState.year;
      const res = await fetch(stewardshipApi('/giving/health-score?year=' + y), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `Health score failed (${res.status}).`);
      if (data.error && data.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      pane.innerHTML = renderStewardshipHealthScore(data);
    } catch (e) {
      pane.innerHTML = '<p class="muted">Stewardship health score unavailable' + (e.message ? ': ' + escapeHtml(e.message) : '.') + '</p>';
    }
  }

  function renderStewardshipHealthScore(d) {
    const score = d.score;
    const tone = score === null ? 'gold' : score >= 80 ? 'green' : score >= 60 ? 'gold' : 'red';

    const componentTips = {
      pledge_fulfillment: 'Pledges are behind where they should be by now — a personal reminder to households who pledged usually works better than a mass email.',
      recurring_stability: 'Recurring gifts are failing or being canceled — reaching out to update payment info can recover this before it becomes a bigger gap.',
      donor_retention: 'Fewer of last year\u2019s donors have given again this year — a short personal check-in tends to bring people back faster than a form letter.',
      lapsed_donors: 'A number of last year\u2019s donors haven\u2019t given yet this year — a warm, specific "we missed you" note outperforms a generic reminder.',
      year_end_projection: 'At the current pace, giving is on track to fall short of the annual goal — a mid-year appeal or campaign can close the gap before year-end.',
      concentration_risk: 'A large share of annual giving comes from just a few households — growing the base of regular, smaller donors reduces how exposed the parish is if one household\u2019s giving changes.',
    };
    const statusExplainer = {
      'On Track': 'Giving, retention, and recurring gifts are all healthy — no urgent follow-up needed this month.',
      'Needs Attention': 'One or more of the signals below is starting to slip. Nothing urgent yet, but worth a look before it becomes a bigger gap.',
      'At Risk': 'Multiple signals below are struggling at once. The tips under each low score are the fastest way to move this number.',
      'Not enough data yet': 'This parish doesn\u2019t have enough giving history yet — the score fills in automatically as the year of data builds up.',
    };

    const chips = (d.components || []).map(c => {
      const isLow = c.score < 75;
      const tip = componentTips[c.key] || '';
      return '<div class="sw-health-chip' + (isLow ? ' sw-health-chip--low' : '') + '">' +
        '<div class="sw-health-chip-top">' +
          '<span class="sw-health-chip-label">' + escapeHtml(c.label) + '</span>' +
          '<span class="sw-health-chip-score tone-' + (c.score >= 75 ? 'green' : c.score >= 50 ? 'gold' : 'red') + '">' + c.score + '</span>' +
        '</div>' +
        (isLow && tip ? '<p class="sw-health-chip-tip">' + escapeHtml(tip) + '</p>' : '') +
      '</div>';
    }).join('');

    const explainer = statusExplainer[d.status] || '';

    return (
      '<div class="sw-health-score-row">' +
        '<div class="sw-health-score-badge tone-' + tone + '">' +
          '<strong>' + (score === null ? '—' : score) + '</strong>' +
          '<span>/ 100</span>' +
        '</div>' +
        '<div class="sw-health-score-copy">' +
          '<div class="sw-health-score-headline">Stewardship Health: ' + (score === null ? '—' : score + '/100') + ' — ' + escapeHtml(d.status) + '</div>' +
          '<p class="sw-health-score-sub">' + (d.components && d.components.length
            ? 'Calculated from ' + d.components.length + ' signal' + (d.components.length === 1 ? '' : 's') + ' below. ' + escapeHtml(explainer)
            : escapeHtml(explainer)) + '</p>' +
        '</div>' +
      '</div>' +
      (chips ? '<div class="sw-health-chips">' + chips + '</div>' : '') +
      (chips ? '<p class="sw-health-score-footnote">Each score below is out of 100. Anything under 75 shows a specific suggestion for what would help most.</p>' : '')
    );
  }

  // ── Donor Concentration Risk Panel ──────────────────────────────────────
  // Replaces the tier-histogram Giving Distribution card. Same anonymized
  // source data, ranked instead of bucketed — "top 5 households give 41%"
  // is the number a parish council actually needs to gauge fragility.
  async function loadDonorConcentrationPanel(year) {
    const pane = document.getElementById('stewardshipConcentrationPane');
    if (!pane || !currentParish) return;
    if (!pane.querySelector('.sw-concentration-row')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const y = year || givingMetricsState.year;
      const res = await fetch(stewardshipApi('/giving/concentration?year=' + y), { headers: authHeaders() });
      const data = await res.json();
      if (data.error && data.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      pane.innerHTML = renderDonorConcentration(data);
    } catch (e) {
      pane.innerHTML = '<p class="muted">Concentration data unavailable.</p>';
    }
  }

  function renderDonorConcentration(d) {
    if (!d.total_donors) {
      return '<p class="muted" style="font-size:.85rem;">No giving recorded yet for this fiscal year.</p>';
    }
    const riskLabel = d.risk_level === 'high' ? 'Fragile' : d.risk_level === 'moderate' ? 'Watch' : 'Diversified';
    const riskTone = d.risk_level === 'high' ? 'red' : d.risk_level === 'moderate' ? 'gold' : 'green';
    return (
      '<div class="sw-concentration-row">' +
        '<div class="sw-concentration-stat">' +
          '<strong>' + (d.top5_pct === null ? '—' : d.top5_pct + '%') + '</strong>' +
          '<span>Top 5 households provide</span>' +
        '</div>' +
        '<div class="sw-concentration-stat">' +
          '<strong>' + (d.top10_pct === null ? '—' : d.top10_pct + '%') + '</strong>' +
          '<span>Top 10 households provide</span>' +
        '</div>' +
      '</div>' +
      '<div class="sw-concentration-risk-badge tone-' + riskTone + '">' + riskLabel + '</div>' +
      '<p class="muted" style="font-size:.72rem;margin:.6rem 0 0;">Based on ' + d.total_donors + ' giving household' + (d.total_donors === 1 ? '' : 's') + ' this fiscal year. No individual identities shown.</p>'
    );
  }

  // ── Recurring Giving Health Panel ───────────────────────────────────────
  async function loadRecurringGivingPanel(year) {
    const pane = document.getElementById('stewardshipRecurringPane');
    if (!pane || !currentParish) return;
    if (!pane.querySelector('.sw-recurring-kpi-grid')) pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const y = year || givingMetricsState.year;
      const res = await fetch(stewardshipApi('/giving/recurring?year=' + y), { headers: authHeaders() });
      const data = await res.json();
      if (data.error && data.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      pane.innerHTML = renderRecurringGiving(data);
    } catch (e) {
      pane.innerHTML = '<p class="muted">Recurring giving data unavailable.</p>';
    }
  }

  function renderRecurringGiving(d) {
    return (
      '<div class="sw-recurring-kpi-grid">' +
        gmKpi('Recurring Donors', d.recurring_donor_count, 'giving on a schedule') +
        gmKpi('Monthly Revenue', fmtDollars(d.monthly_recurring_revenue_cents), 'recurring, normalized to monthly') +
        gmKpi('Avg Recurring Gift', fmtDollars(d.avg_recurring_gift_cents), 'per donor, monthly-equivalent') +
        gmKpi('% of Giving Recurring', d.pct_of_total_giving_recurring === null ? '—' : d.pct_of_total_giving_recurring + '%', 'of total giving this year') +
      '</div>' +
      '<div class="sw-recurring-alert-row">' +
        '<div class="sw-recurring-alert' + (d.failed_payments_90d > 0 ? ' sw-recurring-alert--warn' : '') + '">' +
          '<strong>' + d.failed_payments_90d + '</strong><span>Failed payments (90d)</span>' +
        '</div>' +
        '<div class="sw-recurring-alert' + (d.canceled_gifts_90d > 0 ? ' sw-recurring-alert--warn' : '') + '">' +
          '<strong>' + d.canceled_gifts_90d + '</strong><span>Canceled gifts (90d)</span>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Financial Snapshots Panel ───────────────────────────────────────────
  let financialsState = { loaded: false, year: new Date().getFullYear(), data: null, accounting: null };
  function financialSnapshotDateRange() {
    const currentYear = new Date().getFullYear();
    return {
      startDate: `${financialsState.year}-01-01`,
      endDate: financialsState.year === currentYear ? new Date().toISOString().slice(0,10) : `${financialsState.year}-12-31`
    };
  }

  async function loadFinancialSnapshotsPanel(year) {
    const pane = document.getElementById('stewardshipFinancialsPane');
    if (!pane || !currentParish) return;

    if (!isParishTier()) { pane.innerHTML = renderFinancialsUpgradePrompt(); return; }

    if (year) financialsState.year = year;

    // Populate year selector
    const sel = document.getElementById('financialsYearSelect');
    if (sel && !sel.options.length) {
      const cy = new Date().getFullYear();
      for (let y = cy; y >= cy - 4; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (y === financialsState.year) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    if (sel) sel.value = financialsState.year;

    pane.innerHTML = '<p class="muted sw-loading">Loading financial snapshots\u2026</p>';
    try {
      const period = financialSnapshotDateRange();
      const dates = new URLSearchParams(period).toString();
      const [res, accountingRes] = await Promise.all([
        fetch(stewardshipApi('/financials?year=' + financialsState.year), { headers: authHeaders() }),
        fetch(stewardshipApi('/financials/accounting-summary?' + dates), { headers: authHeaders() })
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load financials');
      const accounting = accountingRes.ok ? await accountingRes.json().catch(() => ({ available:false, reason:'fetch_failed' })) : { available:false, reason:'fetch_failed' };
      financialsState.data = data;
      financialsState.accounting = accounting;
      financialsState.loaded = true;
      if (accounting.available) {
        pane.innerHTML = renderAccountingFinancialSnapshot(accounting, data) +
          '<div class="sw-fin-section-label">Frozen meeting snapshots</div>' +
          renderFinancialSnapshots(data);
      } else if (accounting.reason === 'not_provisioned') {
        pane.innerHTML = '<p class="muted">Your accounting setup is still being finalized. Manual financial snapshots remain available.</p>' + renderFinancialSnapshots(data);
      } else {
        // Stewardship-tier and legacy subscribers keep the existing manual
        // experience byte-for-byte when accounting is not included.
        pane.innerHTML = renderFinancialSnapshots(data);
      }
    } catch (e) {
      pane.innerHTML = '<p class="muted">Unable to load financial snapshots: ' + escapeHtml(e.message) + '</p>';
    }
  }

  function renderAccountingFinancialSnapshot(accounting, manual) {
    const fmt = (c) => accountingMoney(Number(c || 0));
    const meetings = manual.meetings || [];
    const meetingOptions = meetings.map((meeting) => `<option value="${escapeAttr(meeting.id)}">${escapeHtml(meeting.title || 'Annual meeting')}</option>`).join('');
    const funds = (accounting.restrictedFunds || []).map((fund) => `<tr><td><strong>${escapeHtml(fund.fundName)}</strong></td><td>${fmt(fund.beginningBalanceCents)}</td><td>${fmt(fund.totalReceivedCents)}</td><td>${fmt(fund.totalDisbursedCents)}</td><td>${fmt(fund.endingBalanceCents)}</td></tr>`).join('');
    return `<section class="acct-card"><div class="acct-list-head"><div><span class="acct-kicker">Live from Accounting</span><h2>${accounting.startDate} through ${accounting.endDate}</h2><p>Posted ledger activity. Importing freezes a copy for the selected meeting packet.</p></div><div class="acct-report-actions"><select id="stewardshipAccountingImportMeeting"><option value="">Create a new ${financialsState.year} snapshot</option>${meetingOptions}</select><button class="acct-primary" onclick="importAccountingFinancialSnapshot()">Import into meeting packet</button></div></div><div class="acct-kpis"><div><span>Total income</span><strong>${fmt(accounting.totalIncomeCents)}</strong></div><div><span>Total expenses</span><strong>${fmt(accounting.totalExpenseCents)}</strong></div><div><span>Net</span><strong>${fmt(accounting.netCents)}</strong></div></div>${funds ? `<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Restricted fund</th><th>Beginning</th><th>Received</th><th>Disbursed</th><th>Ending</th></tr></thead><tbody>${funds}</tbody></table></div>` : '<p class="muted">No restricted funds have activity in this period.</p>'}<p id="stewardshipAccountingImportStatus" class="muted"></p></section>`;
  }

  async function importAccountingFinancialSnapshot() {
    const meetingId = document.getElementById('stewardshipAccountingImportMeeting')?.value || null;
    const status = document.getElementById('stewardshipAccountingImportStatus');
    const body = {
      annualMeetingId: meetingId,
      fiscalYear: financialsState.year,
      ...financialSnapshotDateRange()
    };
    if (status) status.textContent = 'Importing current accounting values…';
    try {
      const response = await fetch(stewardshipApi('/financials/import-from-accounting'), {
        method:'POST',
        headers:{ ...authHeaders(), 'Content-Type':'application/json' },
        body:JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Import failed');
      if (status) status.textContent = payload.note || 'Imported from accounting.';
      await loadFinancialSnapshotsPanel(financialsState.year);
    } catch (error) {
      if (status) status.textContent = 'Unable to import: ' + error.message;
    }
  }

  function renderFinancialSnapshots(data) {
    const fmt = (c) => {
      const value = Number(c || 0);
      return (value < 0 ? '-$' : '$') + (Math.abs(value) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };
    const snapshot = data.snapshot || null;
    const totals = data.totals || { totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 };
    const contributions = data.contributionTotals || {};
    const agapayRestrictedFunds = data.agapayRestrictedFunds || [];
    const externalAssets = data.externalAssets || [];
    const priorYear = data.priorYear || null;
    const revisions = data.revisions || [];
    const expenseRatioPct = totals.totalIncomeCents > 0 ? Math.round((totals.totalExpenseCents / totals.totalIncomeCents) * 100) : null;
    const priorExpenseRatioPct = priorYear?.totalIncomeCents > 0 ? Math.round((priorYear.totalExpenseCents / priorYear.totalIncomeCents) * 100) : null;
    const summaryHtml =
      '<div class="sw-fin-source-note">' +
        '<span><i class="sw-fin-source-dot sw-fin-source-dot--auto"></i>Calculated automatically</span>' +
        '<span><i class="sw-fin-source-dot sw-fin-source-dot--editable"></i>Editable until Accounting launches</span>' +
      '</div>' +
      '<div class="sw-fin-kpi-grid">' +
        swFinKpi('AGAPAY Contributions', fmt(contributions.agapayContributionsCents), 'calculated from completed gifts', 'income', '') +
        swFinKpi('Outside Contributions', fmt(contributions.outsideContributionsCents), 'qualified contribution entries', 'income', '') +
        swFinKpi('Other Revenue', fmt(snapshot?.otherRevenueCents || 0), 'editable non-contribution revenue', '', '') +
        swFinKpi('Total Income', fmt(totals.totalIncomeCents), 'all revenue for ' + financialsState.year, 'income', swFinYoy(totals.totalIncomeCents, priorYear?.totalIncomeCents, priorYear?.fiscalYear)) +
        swFinKpi('Total Expenses', fmt(totals.totalExpenseCents), 'editable until Accounting', 'expense', swFinYoy(totals.totalExpenseCents, priorYear?.totalExpenseCents, priorYear?.fiscalYear, true)) +
        swFinKpi('Net ' + (totals.netCents >= 0 ? 'Surplus' : 'Deficit'), fmt(Math.abs(totals.netCents)), 'fiscal year ' + financialsState.year, totals.netCents >= 0 ? 'surplus' : 'deficit', swFinYoy(totals.netCents, priorYear?.netCents, priorYear?.fiscalYear)) +
        swFinKpi('Expense Ratio', expenseRatioPct === null ? '—' : expenseRatioPct + '%', 'of income spent', expenseRatioPct === null ? '' : (expenseRatioPct <= 85 ? 'surplus' : expenseRatioPct <= 100 ? '' : 'deficit'), swFinYoy(expenseRatioPct, priorExpenseRatioPct, priorYear?.fiscalYear, true, true)) +
      '</div>' +
      (!snapshot ? '<div class="sw-financials-empty"><p>The calculated contribution and restricted-fund inflow totals are live. Complete the snapshot to add expenses, other revenue, externally held assets, and notes.</p><button class="sw-new-packet-btn" type="button" onclick="openFinancialsEditor()">Complete ' + financialsState.year + ' snapshot</button></div>' : '');

    const agapayFundRows = agapayRestrictedFunds.map(rf =>
        '<tr class="sw-fund-row">' +
          '<td class="sw-td sw-fund-name"><strong>' + escapeHtml(rf.name) + '</strong><small>' + fmt(rf.agapayReceivedCents) + ' AGAPAY · ' + fmt(rf.outsideReceivedCents) + ' outside</small></td>' +
          '<td class="sw-td sw-td-right">' + fmt(rf.openingBalanceCents) + '</td>' +
          '<td class="sw-td sw-td-right sw-fin-income-lbl">' + fmt(rf.receivedCents) + '</td>' +
          '<td class="sw-td sw-td-right sw-fin-expense-lbl">' + fmt(rf.deductionsCents) + '</td>' +
          '<td class="sw-td sw-td-right ' + (rf.endingBalanceCents < 0 ? 'sw-fin-deficit' : 'sw-fin-surplus') + '">' + fmt(rf.endingBalanceCents) + '</td>' +
        '</tr>'
      ).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:1rem;">No donor-restricted funds are configured in Funds &amp; Alms.</td></tr>';
    const automaticFundsHtml =
        '<div class="sw-fin-section-head"><div><div class="sw-fin-section-label">Restricted fund balances</div><p>Contributions calculate automatically; opening balances and deductions are maintained in the snapshot.</p></div><span class="sw-fin-auto-pill">Calculated</span></div>' +
        '<div class="sw-fin-table-wrap">' +
          '<table class="sw-fin-table">' +
            '<thead><tr>' +
              '<th class="sw-th">Fund</th>' +
              '<th class="sw-th sw-th-right">Opening</th>' +
              '<th class="sw-th sw-th-right">Inflows</th>' +
              '<th class="sw-th sw-th-right">Deductions</th>' +
              '<th class="sw-th sw-th-right">Ending</th>' +
            '</tr></thead>' +
            '<tbody>' + agapayFundRows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="sw-fin-basis-note">Ending balance = opening balance + AGAPAY and qualified outside contributions − expenses or deductions. A deficit remains visible when deductions exceed available funds.</p>';
    const externalAssetLabels = {
      investment: 'Investment',
      endowment: 'Endowment',
      real_property: 'Real property',
      external_fund: 'External fund',
      other: 'Other asset'
    };
    const externalRows = externalAssets.map(asset =>
      '<tr class="sw-fund-row">' +
        '<td class="sw-td sw-fund-name"><strong>' + escapeHtml(asset.name) + '</strong><small>' + escapeHtml(externalAssetLabels[asset.assetType] || 'External asset') + '</small></td>' +
        '<td class="sw-td">' + escapeHtml(asset.asOfDate || 'Not dated') + '</td>' +
        '<td class="sw-td">' + escapeHtml(asset.notes || '') + '</td>' +
        '<td class="sw-td sw-td-right sw-fin-surplus">' + fmt(asset.valueCents) + '</td>' +
      '</tr>'
    ).join('') || '<tr><td colspan="4" class="muted" style="text-align:center;padding:1rem;">No externally held assets have been added.</td></tr>';
    const externalAssetsHtml =
      '<div class="sw-fin-section-head"><div><div class="sw-fin-section-label">Externally held assets</div><p>Investments, endowments, real property, and funds maintained outside AGAPAY.</p></div><span class="sw-fin-editable-pill">Editable</span></div>' +
      '<div class="sw-fin-table-wrap"><table class="sw-fin-table"><thead><tr><th>Asset</th><th>Valuation date</th><th>Note</th><th class="sw-th-right">Reported value</th></tr></thead><tbody>' +
      externalRows + '</tbody></table></div>';
    const revisionHtml = revisions.length
      ? '<div class="sw-fin-revisions"><div class="sw-fin-section-label">Revision history</div>' +
        revisions.map(revision => '<div class="sw-fin-revision-row"><span>Version ' + revision.version + '</span><span>' +
          escapeHtml(new Date(revision.createdAt).toLocaleString()) + '</span><span>' +
          fmt(revision.totalIncomeCents) + ' income · ' + fmt(revision.totalExpenseCents) + ' expenses</span></div>').join('') +
        '</div>'
      : '';
    const statusHtml = snapshot
      ? '<div class="sw-fin-authority-status"><strong>Authoritative ' + financialsState.year + ' snapshot</strong><span>Version ' + snapshot.version + ' · Updated ' + escapeHtml(new Date(snapshot.updatedAt).toLocaleString()) + '</span></div>'
      : '';
    return statusHtml + summaryHtml + automaticFundsHtml + externalAssetsHtml + revisionHtml;
  }

  // Builds a "▲ 8% vs 2025" badge comparing current to prior-year value.
  // `invertGood` flips the up/down color meaning for metrics where lower is
  // better (expenses, expense ratio) rather than higher is better.
  function swFinYoy(current, prior, priorYearLabel, invertGood, isRatioPoints) {
    if (current === null || current === undefined || !prior) return '';
    const delta = isRatioPoints ? (current - prior) : Math.round(((current - prior) / Math.abs(prior)) * 100);
    if (!isFinite(delta)) return '';
    const up = delta >= 0;
    const good = invertGood ? !up : up;
    const arrow = up ? '\u25B2' : '\u25BC';
    const suffix = isRatioPoints ? ' pts' : '%';
    return '<span class="sw-fin-yoy ' + (good ? 'sw-fin-yoy-good' : 'sw-fin-yoy-bad') + '">' +
      arrow + ' ' + Math.abs(delta) + suffix + ' vs ' + priorYearLabel +
    '</span>';
  }

  function swFinKpi(label, value, sub, type, yoyBadge) {
    const cls = type === 'income' ? 'sw-fin-income-lbl' : type === 'expense' ? 'sw-fin-expense-lbl' : type === 'surplus' ? 'sw-fin-surplus' : type === 'deficit' ? 'sw-fin-deficit' : '';
    return '<div class="sw-kpi-card">' +
      '<span class="sw-kpi-label">' + label + '</span>' +
      '<strong class="sw-kpi-value ' + cls + '">' + value + '</strong>' +
      '<span class="sw-kpi-sub">' + sub + '</span>' +
      (yoyBadge || '') +
    '</div>';
  }

  function openFinancialsEditor() {
    const card = document.getElementById('stewardshipFinancialsEditorCard');
    const pane = document.getElementById('stewardshipFinancialsEditorPane');
    const title = document.getElementById('financialsEditorTitle');
    if (!card || !pane) return;

    const fs = financialsState.data?.snapshot || {};
    const contributions = financialsState.data?.contributionTotals || {};
    const restrictedFunds = financialsState.data?.agapayRestrictedFunds || [];
    const externalAssets = financialsState.data?.externalAssets || [];
    if (title) title.textContent = fs.id ? 'Edit Authoritative Financial Snapshot' : 'Complete Authoritative Financial Snapshot';
    const fmt100 = (c) => c ? (c / 100).toFixed(2) : '';

    const assetRows = externalAssets.length
      ? externalAssets.map((asset, i) => renderFinancialsEditorAssetRow(asset, i)).join('')
      : renderFinancialsEditorAssetRow({}, 0);
    const restrictedFundRows = restrictedFunds.map((fund) => renderFinancialsRestrictedAdjustmentRow(fund)).join('');

    pane.innerHTML =
      '<form id="financialsEditorForm" onsubmit="saveFinancialsSnapshot(event)">' +
        '<div class="stewardship-form-grid" style="margin-bottom:.85rem">' +
          '<label>Snapshot title<input name="title" value="' + escapeAttr(fs.title || financialsState.year + ' Financial Snapshot') + '" /></label>' +
          '<label>Fiscal year<input name="fiscalYear" type="number" value="' + financialsState.year + '" readonly /></label>' +
        '</div>' +
        '<div class="stewardship-editor-section">' +
          '<div>' +
            '<h3>Restricted Fund Balances</h3>' +
            '<p>Inflows are calculated from AGAPAY and qualified outside contributions. Enter the opening balance and expenses or deductions for each fund.</p>' +
          '</div>' +
          (restrictedFundRows
            ? '<div class="sw-fin-restricted-header"><span>Fund</span><span>Opening</span><span>Inflows</span><span>Deductions</span><span>Ending</span><span>Note</span></div><div id="financialsRestrictedAdjustmentRows">' + restrictedFundRows + '</div>'
            : '<p class="muted">No donor-restricted funds are configured in Funds &amp; Alms.</p>') +
        '</div>' +
        '<div class="stewardship-editor-section">' +
          '<div><div><h3>Income &amp; Expenses</h3><p>Contribution totals are calculated and cannot be overwritten here.' + (fs.importedFromAccountingAt ? ' Imported from accounting on ' + new Date(fs.importedFromAccountingAt).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) + '.' : '') + '</p></div></div>' +
          '<div class="sw-fin-derived-grid">' +
            '<div><span>AGAPAY contributions</span><strong>' + fmtDollars(contributions.agapayContributionsCents || 0) + '</strong></div>' +
            '<div><span>Outside-AGAPAY contributions</span><strong>' + fmtDollars(contributions.outsideContributionsCents || 0) + '</strong></div>' +
          '</div>' +
          '<div class="stewardship-form-grid">' +
            '<label>Other revenue ($)<input name="otherRevenueDollars" type="number" step="0.01" min="0" value="' + fmt100(fs.otherRevenueCents) + '" placeholder="0.00" /><small>Bookstore, retreat, rental, grant, and other non-contribution revenue.</small></label>' +
            '<label>Total expenses ($)<input name="totalExpenseDollars" type="number" step="0.01" min="0" value="' + fmt100(fs.totalExpenseCents) + '" placeholder="0.00" /></label>' +
            '<label style="grid-column:1/-1">Notes<textarea name="notes" rows="3" placeholder="Budget notes, audit status, carryover details\u2026">' + escapeHtml(fs.notes || '') + '</textarea></label>' +
          '</div>' +
        '</div>' +
        '<div class="stewardship-editor-section">' +
          '<div>' +
            '<h3>Externally Held Assets</h3>' +
            '<p>Only add assets maintained outside AGAPAY. Restricted giving inside AGAPAY is calculated automatically.</p>' +
            '<button class="btn btn-ghost btn-sm" type="button" onclick="addFinancialsAssetRow()">Add asset</button>' +
          '</div>' +
          '<div class="sw-fin-asset-header">'+
            '<span>Type</span><span>Name</span><span>Reported value</span><span>Valuation date</span><span>Note</span><span></span>' +
          '</div>' +
          '<div id="financialsAssetRows">' + assetRows + '</div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn btn-gold" type="submit" id="financialsSaveBtn">Save snapshot</button>' +
          '<button class="btn btn-ghost" type="button" onclick="closeFinancialsEditor()">Cancel</button>' +
          '<span id="financialsSaveStatus" style="font-size:.82rem;color:var(--stone)"></span>' +
        '</div>' +
      '</form>';

    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderFinancialsRestrictedAdjustmentRow(fund) {
    const dollars = (c) => Number(c || 0) ? (Number(c) / 100).toFixed(2) : '';
    return '<div class="sw-fin-restricted-adjustment-row" data-fund-id="' + escapeAttr(fund.id || fund.code || fund.name || '') + '" data-received-cents="' + Number(fund.receivedCents || 0) + '">' +
      '<div class="sw-fin-restricted-name"><strong>' + escapeHtml(fund.name || 'Restricted fund') + '</strong><small>' + fmtDollars(fund.agapayReceivedCents || 0) + ' AGAPAY · ' + fmtDollars(fund.outsideReceivedCents || 0) + ' outside</small></div>' +
      '<label><span>Opening</span><input type="number" step="0.01" min="0" data-field="openingBalance" value="' + dollars(fund.openingBalanceCents) + '" placeholder="0.00" oninput="recalculateRestrictedFundRow(this)" /></label>' +
      '<div class="sw-fin-restricted-derived"><span>Inflows</span><strong>' + fmtDollars(fund.receivedCents || 0) + '</strong></div>' +
      '<label><span>Deductions</span><input type="number" step="0.01" min="0" data-field="deductions" value="' + dollars(fund.deductionsCents) + '" placeholder="0.00" oninput="recalculateRestrictedFundRow(this)" /></label>' +
      '<div class="sw-fin-restricted-derived"><span>Ending</span><strong data-field="endingBalance">' + fmtDollars(fund.endingBalanceCents || 0) + '</strong></div>' +
      '<label><span>Note</span><input type="text" maxlength="1000" data-field="notes" value="' + escapeAttr(fund.adjustmentNotes || '') + '" placeholder="Optional expense detail" /></label>' +
    '</div>';
  }

  function recalculateRestrictedFundRow(control) {
    const row = control?.closest('.sw-fin-restricted-adjustment-row');
    if (!row) return;
    const opening = Math.round(parseFloat(row.querySelector('[data-field="openingBalance"]')?.value || '0') * 100);
    const deductions = Math.round(parseFloat(row.querySelector('[data-field="deductions"]')?.value || '0') * 100);
    const ending = opening + Number(row.dataset.receivedCents || 0) - deductions;
    const output = row.querySelector('[data-field="endingBalance"]');
    if (output) {
      output.textContent = fmtDollars(ending);
      output.classList.toggle('sw-fin-deficit', ending < 0);
      output.classList.toggle('sw-fin-surplus', ending >= 0);
    }
  }

  function renderFinancialsEditorAssetRow(asset, i) {
    const fmt100 = (c) => c ? (c / 100).toFixed(2) : '';
    const options = [
      ['investment', 'Investment'],
      ['endowment', 'Endowment'],
      ['real_property', 'Real property'],
      ['external_fund', 'External fund'],
      ['other', 'Other asset']
    ].map(([value, label]) => '<option value="' + value + '" ' + ((asset.assetType || 'investment') === value ? 'selected' : '') + '>' + label + '</option>').join('');
    return '<div class="stewardship-repeat-row sw-fin-asset-row-edit" data-row-type="external-asset">' +
      '<select data-field="assetType">' + options + '</select>' +
      '<input type="text" data-field="name" value="' + escapeAttr(asset.name || '') + '" placeholder="Asset or fund name" />' +
      '<input type="number" step="0.01" min="0" data-field="value" value="' + fmt100(asset.valueCents) + '" placeholder="0.00" />' +
      '<input type="date" data-field="asOfDate" value="' + escapeAttr(asset.asOfDate || '') + '" />' +
      '<input type="text" data-field="notes" value="' + escapeAttr(asset.notes || '') + '" maxlength="1000" placeholder="Optional note" />' +
      '<button class="btn btn-ghost btn-sm" type="button" onclick="removeFinancialsAssetRow(this)">×</button>' +
    '</div>';
  }

  function addFinancialsAssetRow() {
    const container = document.getElementById('financialsAssetRows');
    if (!container) return;
    const count = container.querySelectorAll('.sw-fin-asset-row-edit').length;
    container.insertAdjacentHTML('beforeend', renderFinancialsEditorAssetRow({}, count));
  }

  function removeFinancialsAssetRow(btn) {
    const row = btn?.closest('.sw-fin-asset-row-edit');
    const parent = row?.parentElement;
    if (!row || !parent) return;
    if (parent.querySelectorAll('.sw-fin-asset-row-edit').length <= 1) {
      row.querySelectorAll('input').forEach((input) => { input.value = ''; });
      const select = row.querySelector('select');
      if (select) select.value = 'investment';
    } else {
      row.remove();
    }
  }

  async function saveFinancialsSnapshot(event) {
    event.preventDefault();
    const form = document.getElementById('financialsEditorForm');
    const status = document.getElementById('financialsSaveStatus');
    const btn = document.getElementById('financialsSaveBtn');
    if (!form || !currentParish) return;

    const fd = new FormData(form);
    const otherRevenueCents = Math.round(parseFloat(fd.get('otherRevenueDollars') || '0') * 100);
    const totalExpenseCents = Math.round(parseFloat(fd.get('totalExpenseDollars') || '0') * 100);

    const assetRows = [...form.querySelectorAll('.sw-fin-asset-row-edit')];
    const externalAssets = assetRows.map(row => {
      const get = (f) => row.querySelector('[data-field="' + f + '"]')?.value || '';
      return {
        assetType: get('assetType'),
        name: get('name').trim(),
        valueCents: Math.round(parseFloat(get('value') || '0') * 100),
        asOfDate: get('asOfDate'),
        notes: get('notes').trim()
      };
    }).filter(asset => asset.name);
    const restrictedFundAdjustments = [...form.querySelectorAll('.sw-fin-restricted-adjustment-row')].map(row => {
      const get = (f) => row.querySelector('[data-field="' + f + '"]')?.value || '';
      return {
        fundId: row.dataset.fundId || '',
        openingBalanceCents: Math.round(parseFloat(get('openingBalance') || '0') * 100),
        deductionsCents: Math.round(parseFloat(get('deductions') || '0') * 100),
        notes: get('notes').trim()
      };
    }).filter(fund => fund.fundId);

    const payload = {
      otherRevenueCents,
      totalExpenseCents,
      notes: fd.get('notes') || '',
      fiscalYear: parseInt(fd.get('fiscalYear') || financialsState.year, 10),
      title: fd.get('title') || '',
      externalAssets,
      restrictedFundAdjustments
    };

    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    if (status) status.textContent = 'Saving\u2026';
    try {
      const res = await fetch(stewardshipApi('/financials'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (status) status.textContent = '\u2713 Saved';
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
      closeFinancialsEditor();
      financialsState.loaded = false;
      loadFinancialSnapshotsPanel();
    } catch (e) {
      if (status) status.textContent = 'Error: ' + e.message;
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  function closeFinancialsEditor() {
    const card = document.getElementById('stewardshipFinancialsEditorCard');
    if (card) card.hidden = true;
  }

  // ── Pledge nudge modal ───────────────────────────────────────────────────
  let nudgePreviewData = null;

  async function checkNudgeEligibility() {
    if (!currentParish) return;
    const btn = document.getElementById('nudgeBtn');
    if (!btn) return;
    try {
      const res  = await fetch(stewardshipApi('/nudge?year=' + new Date().getFullYear()), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.thresholdActive) {
        // Too early in the year — no one can be 3 months behind yet
        btn.disabled = true;
        btn.title    = 'No donors are 3+ months behind on their pledge yet.';
        btn.querySelector('svg + span, svg').nextSibling && (btn.lastChild.textContent = ' Nudge donors (none behind)');
        // Rebuild label safely
        const svg = btn.querySelector('svg');
        btn.innerHTML = '';
        if (svg) btn.appendChild(svg);
        btn.appendChild(document.createTextNode(' Nudge donors (none behind)'));
        return;
      }
      const count = (data.behind || []).length;
      if (count === 0) {
        btn.disabled = true;
        btn.title    = 'All pledging donors are on track — no nudges needed.';
        const svg = btn.querySelector('svg');
        btn.innerHTML = '';
        if (svg) btn.appendChild(svg);
        btn.appendChild(document.createTextNode(' All donors on track'));
      } else {
        btn.disabled = false;
        btn.title    = count + ' donor' + (count !== 1 ? 's are' : ' is') + ' at least 3 months behind on their pledge.';
        btn.onclick  = () => openNudgeModal();
        const svg = btn.querySelector('svg');
        btn.innerHTML = '';
        if (svg) btn.appendChild(svg);
        btn.appendChild(document.createTextNode(' Nudge ' + count + ' behind-schedule donor' + (count !== 1 ? 's' : '')));
        btn.classList.add('sw-nudge-btn--ready');
      }
    } catch {
      // Silent — leave button disabled
    }
  }


  async function openNudgeModal() {
    if (!currentParish) return;
    const modal = document.getElementById('nudgeAdminModal');
    if (!modal) { buildNudgeModal(); }
    const m = document.getElementById('nudgeAdminModal');
    const body = document.getElementById('nudgeAdminBody');
    if (body) body.innerHTML = '<p class="sw-loading">Checking pledges…</p>';
    m.hidden = false;

    try {
      const res = await fetch(stewardshipApi('/nudge?year=' + new Date().getFullYear()), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load pledge data');
      nudgePreviewData = data;
      renderNudgePreview(data);
    } catch (e) {
      if (body) body.innerHTML = '<p class="muted">' + escapeHtml(e.message) + '</p>';
    }
  }

  function buildNudgeModal() {
    const el = document.createElement('div');
    el.id = 'nudgeAdminModal';
    el.className = 'sw-nudge-admin-modal-backdrop';
    el.hidden = true;
    el.innerHTML =
      '<div class="sw-nudge-admin-modal">' +
        '<div class="sw-nudge-admin-header">' +
          '<h3>Nudge Behind-Schedule Donors</h3>' +
          '<button class="sw-nudge-admin-close" type="button" onclick="closeNudgeModal()" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="sw-nudge-admin-body" id="nudgeAdminBody"><p class="sw-loading">Loading…</p></div>' +
        '<div class="sw-nudge-admin-footer" id="nudgeAdminFooter" hidden>' +
          '<p class="sw-nudge-admin-note">A gentle pastoral message will appear in each donor’s My AGAPAY dashboard the next time they log in.</p>' +
          '<button class="sw-nudge-send-btn" type="button" id="nudgeSendBtn" onclick="sendNudges(this)">Send nudges</button>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', e => { if (e.target === el) closeNudgeModal(); });
    document.body.appendChild(el);
  }

  function renderNudgePreview(data) {
    const body   = document.getElementById('nudgeAdminBody');
    const footer = document.getElementById('nudgeAdminFooter');
    if (!body) return;
    const behind = data.behind || [];
    const fmt = (c) => '$' + ((c||0)/100).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
    if (!behind.length) {
      body.innerHTML = '<p class="sw-nudge-none">All pledging donors are on track for ' + (data.year || new Date().getFullYear()) + '. No nudges needed.</p>';
      if (footer) footer.hidden = true;
      return;
    }
    body.innerHTML =
      '<p class="sw-nudge-summary">' + behind.length + ' donor' + (behind.length !== 1 ? 's are' : ' is') + ' behind schedule for ' + (data.year || new Date().getFullYear()) + '.</p>' +
      '<div class="sw-nudge-list">' +
        behind.map(d =>
          '<div class="sw-nudge-row-preview">' +
            '<span class="sw-nudge-email">' + escapeHtml(d.donorEmail) + '</span>' +
            '<span class="sw-nudge-amounts">' +
              '<span>Pledged: ' + fmt(d.pledgeCents) + '</span>' +
              '<span>Given: ' + fmt(d.givenCents) + '</span>' +
              '<span class="sw-nudge-behind">Behind: ' + fmt(d.expectedCents - d.givenCents) + '</span>' +
            '</span>' +
          '</div>'
        ).join('') +
      '</div>';
    if (footer) footer.hidden = false;
  }

  async function sendNudges(btn) {
    if (!currentParish || !nudgePreviewData?.behind?.length) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const res = await fetch(stewardshipApi('/nudge?year=' + (nudgePreviewData.year || new Date().getFullYear())), {
        method: 'POST', headers: authHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send nudges');
      const body = document.getElementById('nudgeAdminBody');
      const footer = document.getElementById('nudgeAdminFooter');
      if (body) body.innerHTML = '<p class="sw-nudge-none">✓ ' + (data.sent || 0) + ' nudge' + (data.sent !== 1 ? 's' : '') + ' sent. Donors will see the message the next time they log into My AGAPAY.</p>';
      if (footer) footer.hidden = true;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send nudges'; }
      setStatus(e.message, 'error');
    }
  }

  function closeNudgeModal() {
    const m = document.getElementById('nudgeAdminModal');
    if (m) m.hidden = true;
    nudgePreviewData = null;
  }

  function stewardshipMonthlyReportUrl() {
    const token = document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
    const url = new URL('/api/parish/dashboard/' + encodeURIComponent(currentParish?.parishId || '') + '/stewardship/report/monthly', window.location.origin);
    url.searchParams.set('year', String(givingMetricsState.year || new Date().getFullYear()));
    url.searchParams.set('t', token);
    return url.pathname + url.search;
  }

  function openStewardshipMonthlyReport() {
    if (!currentParish) return;
    window.open(stewardshipMonthlyReportUrl(), '_blank');
  }

  function stewardshipMonthlyFinancialReportUrl() {
    const token = document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
    const year = financialsState.year || givingMetricsState.year || new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const url = new URL('/api/parish/dashboard/' + encodeURIComponent(currentParish?.parishId || '') + '/stewardship/report/monthly-financial', window.location.origin);
    url.searchParams.set('year', String(year));
    url.searchParams.set('month', String(year) + '-' + month);
    url.searchParams.set('t', token);
    return url.pathname + url.search;
  }

  function openStewardshipMonthlyFinancialReport() {
    if (!currentParish) return;
    window.open(stewardshipMonthlyFinancialReportUrl(), '_blank');
  }

  function updateStewardshipBadges(isActive, options = {}) {
    renderParishPlusMeetingsPane(document.getElementById('parishPlusMeetingsPane'), isActive);
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

  // ── SACRAMENTS & SERVICES ──────────────────────────────────
  // A Parish tier feature — gated server-side by the exact same
  // hasStewardshipAccess() check as the rest of the tier features. This panel
  // reuses stewardshipState (already fetched by loadStewardshipPanel) to
  // decide whether to show the upsell or the actual request list, so
  // switching to this tab never needs a second status round-trip.
  async function prefetchStewardshipBadge() {
    if (!currentParish) return;
    try {
      const res  = await fetch(stewardshipApi(), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      stewardshipState = {
        loaded:          true,
        stewardship:     data.stewardship    || { status: 'coming_soon', active: false },
        meetings:        data.meetings        || [],
        subscribePlans:  data.subscribePlans  || [],
        setupRequired:   !!data.setupRequired,
        comingSoon:      !!data.comingSoon,
        selectedMeeting: null
      };
      const sw       = stewardshipState.stewardship || {};
      updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
      maybeShowStewardshipCompExpiryNotice(sw);
    } catch { /* silent — badge stays gold */ }
  }

  // Shows a one-time-per-day pop-up when a Founding 20 free-year
  // Parish tier feature grant is within 30 days of expiring. Dismissal
  // is remembered in localStorage per parish + grant expiry date, so it
  // won't nag more than once a day, and stops entirely once the grant
  // itself changes (renewed, converted to paid, or expired).
  function maybeShowStewardshipCompExpiryNotice(sw) {
    const comp = sw?.comp;
    if (sw?.status !== 'comped' || !comp?.expiresAt) return;

    const expiresAt = new Date(comp.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const msUntilExpiry = expiresAt - Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (msUntilExpiry > THIRTY_DAYS_MS || msUntilExpiry < 0) return;

    const dismissKey = 'agapay.stewardshipCompNotice.' + (currentParish?.parishId || '') + '.' + comp.expiresAt;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(dismissKey) === today) return;

    localStorage.setItem(dismissKey, today);
    showStewardshipCompExpiryModal(comp);
  }

  function showStewardshipCompExpiryModal(comp) {
    document.getElementById('stewardshipCompNoticeOverlay')?.remove();

    const expiresLabel = new Date(comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const daysLeft = Math.max(1, Math.round((new Date(comp.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    const overlay = document.createElement('div');
    overlay.id = 'stewardshipCompNoticeOverlay';
    overlay.className = 'sw-comp-notice-overlay';
    overlay.innerHTML =
      '<div class="sw-comp-notice-card" role="dialog" aria-modal="true" aria-labelledby="swCompNoticeTitle">' +
        '<button class="sw-comp-notice-close" type="button" aria-label="Close" onclick="dismissStewardshipCompNotice()">\u00d7</button>' +
        '<div class="sw-comp-notice-icon">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V6l-8-4z" fill="currentColor"/></svg>' +
        '</div>' +
        '<span class="sw-comp-notice-eyebrow">Founding Parish</span>' +
        '<h2 id="swCompNoticeTitle">Your free year is ending soon</h2>' +
        '<p>Your complimentary year of <strong>Parish tier features</strong> ends on <strong>' + escapeHtml(expiresLabel) + '</strong> \u2014 about ' + daysLeft + ' days from now.</p>' +
        '<p class="sw-comp-notice-sub">No action is needed if you would like to let it lapse. If your parish council would like to continue, you can add it as a paid feature at any time.</p>' +
        '<div class="sw-comp-notice-actions">' +
          '<button class="sw-comp-notice-btn-primary" type="button" onclick="dismissStewardshipCompNotice(); switchTab(\'settings\')">Review Parish tier</button>' +
          '<button class="sw-comp-notice-btn-secondary" type="button" onclick="dismissStewardshipCompNotice()">Remind me later</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('sw-comp-notice-overlay--visible'));
  }

  function dismissStewardshipCompNotice() {
    const overlay = document.getElementById('stewardshipCompNoticeOverlay');
    if (!overlay) return;
    overlay.classList.remove('sw-comp-notice-overlay--visible');
    setTimeout(() => overlay.remove(), 200);
  }

  function renderStewardshipUnavailableForTier() {
    const statusEl  = document.getElementById('stewardshipStatusLabel');
    const planPane  = document.getElementById('stewardshipPlanPane');
    const metricPane = document.getElementById('givingMetricsPane');
    const finPane = document.getElementById('stewardshipFinancialsPane');
    const healthPane = document.getElementById('stewardshipHealthScorePane');
    const concentrationPane = document.getElementById('stewardshipConcentrationPane');
    const recurringPane = document.getElementById('stewardshipRecurringPane');
    const manualIncomePane = document.getElementById('stewardshipManualIncomePane');
    if (statusEl) {
      statusEl.textContent = 'Parish tier';
      statusEl.className = 'sw-suite-status-label sw-suite-status--upsell';
    }
    if (planPane) {
      planPane.innerHTML =
        '<div class="sw-upsell-row-inner">' +
          '<div class="sw-upsell-row-copy">' +
            '<strong>Stewardship plan</strong>' +
            '<p>Upgrade to Stewardship or Parish to use pledge reports, donor insights, and Stewardship Health.</p>' +
          '</div>' +
          '<div class="sw-upsell-row-actions">' +
            '<button class="sw-subscribe-btn" type="button" onclick="switchTab(\'settings\')">Review tier settings</button>' +
          '</div>' +
        '</div>';
    }
    const locked = '<div class="sw-tool-locked"><div class="sw-tool-locked-items"><div><span>✓</span> Included with Stewardship and Parish</div></div><div class="sw-tool-locked-badge">Stewardship required</div></div>';
    if (metricPane) metricPane.innerHTML = locked;
    if (finPane) finPane.innerHTML = locked;
    if (healthPane) healthPane.innerHTML = locked;
    if (concentrationPane) concentrationPane.innerHTML = locked;
    if (recurringPane) recurringPane.innerHTML = locked;
    if (manualIncomePane) manualIncomePane.innerHTML = locked;
  }

  function renderStewardshipPanel() {
    const statusEl  = document.getElementById('stewardshipStatusLabel');
    const planPane  = document.getElementById('stewardshipPlanPane');
    if (!planPane) return;

    const sw = stewardshipState.stewardship || {};
    const isActive   = sw.active || ['active', 'trialing', 'comped'].includes(sw.status);
    const isTrialing = sw.status === 'trialing';
    const isComped   = sw.status === 'comped' && sw.comp;

    // Hero status label
    if (statusEl) {
      statusEl.textContent = isActive
        ? (sw.includedInParishTier ? 'Included in Parish tier' : (isComped ? 'Free — Founding Parish' : (isTrialing ? 'Trial active' : 'Active')))
        : 'Parish tier';
      statusEl.className = 'sw-suite-status-label ' + (isActive ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
    }

    updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });

    if (isActive) {
      renderStewardshipActiveState(planPane, sw, isTrialing);
    } else {
      renderStewardshipUpsellState(planPane);
    }
  }

  // Active state: populate the plan row (billing management) and Stewardship-only tools
  function renderStewardshipActiveState(planPane, sw, isTrialing) {
    // ── Plan row — billing status + manage button ──────────────────────────
    const isComped = sw.status === 'comped' && sw.comp;
    const expiresLabel = isComped && sw.comp.expiresAt
      ? new Date(sw.comp.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    planPane.innerHTML =
      '<div class="sw-plan-row-inner">' +
        '<div class="sw-plan-row-copy">' +
          '<span class="sw-plan-badge">' + (sw.includedInParishTier ? 'Included' : (isComped ? 'Free Year' : (isTrialing ? 'Trial' : 'Active'))) + '</span>' +
          '<span class="sw-plan-name">Stewardship</span>' +
          '<span class="sw-plan-parish">' + escapeHtml(currentParish?.parishName || '') + '</span>' +
          (isComped ? '<span class="sw-plan-parish" style="opacity:.75;">Founding parish — free through ' + escapeHtml(expiresLabel) + '</span>' : '') +
        '</div>' +
        (sw.includedInParishTier || isComped ? '' : '<button class="sw-manage-btn" type="button" onclick="openStewardshipBilling(this)">Manage billing</button>') +
      '</div>';

    // Show the financials year select + new button
    const finActions = document.getElementById('financialsHeaderActions');
    if (finActions) finActions.hidden = false;
  }

  function renderParishPlusMeetingsPane(meetingsPane, active) {
    if (!meetingsPane) return;
    const meetings = stewardshipState.meetings || [];
    const year = new Date().getFullYear();
    const stateChip = document.getElementById('parishPlusPacketsState');

    if (active) {
      // State chip reflects the current-year packet's status, or a prompt to start
      if (stateChip) {
        const thisYear = meetings.find(m => Number(m.fiscalYear) === year);
        if (thisYear) {
          const st = (thisYear.status || 'draft').toLowerCase();
          const label = { draft: 'Draft', ready: 'Ready', generated: 'Generated', archived: 'Archived' }[st] || st;
          stateChip.textContent = `${year} · ${label}`;
          stateChip.className = 'pdx-pp-card-state ' + (st === 'ready' || st === 'generated' ? 'ready' : 'soon');
        } else {
          stateChip.textContent = `Start ${year}`;
          stateChip.className = 'pdx-pp-card-state attention';
        }
      }
      meetingsPane.innerHTML =
        (meetings.length ? renderMeetingsList(meetings) : renderMeetingsEmpty(year)) +
        '<div class="pdx-pp-card-foot">' +
          '<button class="pdx-pp-new-btn" type="button" onclick="newStewardshipMeeting()">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>' +
            ' New packet' +
          '</button>' +
        '</div>';
      return;
    }

    if (stateChip) { stateChip.textContent = 'Parish tier'; stateChip.className = 'pdx-pp-card-state locked'; }
    meetingsPane.innerHTML =
      '<div class="pdx-pp-locked-items">' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Agenda, opening prayer, quorum call</div>' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Rector, treasurer &amp; ministry reports</div>' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Financial summary &amp; restricted funds</div>' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Nominees, elections, resolutions</div>' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Sign-in sheet &amp; minutes template</div>' +
        '<div class="pdx-pp-locked-item"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Print-ready PDF packet</div>' +
      '</div>' +
      '<div class="pdx-pp-card-foot"><button class="pdx-pp-hero-cta" type="button" style="width:auto;" onclick="switchTab(\'settings\')">Upgrade to Parish</button></div>';
  }

  // Upsell state: lock Stewardship tool cards, show tier CTA in plan row
  function renderMeetingsList(meetings) {
    const statusLabels = { draft:'Draft', ready:'Ready', generated:'Generated', archived:'Archived' };
    const statusClasses = { draft:'pdx-pp-pill-draft', ready:'pdx-pp-pill-ready', generated:'pdx-pp-pill-generated', archived:'pdx-pp-pill-archived' };
    return '<div class="pdx-pp-meetings">' +
      meetings.map(m => {
        const statusKey = (m.status || 'draft').toLowerCase();
        const label = statusLabels[statusKey] || statusKey;
        const cls = statusClasses[statusKey] || 'pdx-pp-pill-draft';
        const dateStr = m.meetingDate ? new Date(m.meetingDate).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
        const metaParts = [m.fiscalYear, dateStr, m.location ? escapeHtml(m.location) : ''].filter(Boolean).join(' · ');
        return '<div class="pdx-pp-meeting-row">' +
          '<div class="pdx-pp-meeting-info">' +
            '<strong class="pdx-pp-meeting-title">' + escapeHtml(m.title || (m.fiscalYear + ' Annual Meeting')) + '</strong>' +
            '<span class="pdx-pp-meeting-meta">' + metaParts + '</span>' +
          '</div>' +
          '<div class="pdx-pp-meeting-actions">' +
            '<span class="pdx-pp-pill ' + cls + '">' + label + '</span>' +
            '<button class="pdx-pp-mini-btn" type="button" onclick="editStewardshipMeeting(\'' + escapeAttr(m.id) + '\')">Edit</button>' +
            '<a class="pdx-pp-mini-btn" href="' + escapeAttr(stewardshipPreviewUrl(m.id)) + '" target="_blank" rel="noopener">Preview</a>' +
            '<a class="pdx-pp-mini-btn" href="' + escapeAttr(stewardshipPreviewUrl(m.id, 'pdf')) + '" target="_blank" rel="noopener">PDF</a>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderMeetingsEmpty(year) {
    return '<div class="sw-meetings-empty">' +
      '<div class="sw-meetings-empty-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' +
        '</svg>' +
      '</div>' +
      '<strong>No packets yet</strong>' +
      '<span>Create your first ' + year + ' Annual Parish Meeting packet.</span>' +
      '<button class="sw-new-packet-btn" type="button" onclick="newStewardshipMeeting()">Create ' + year + ' packet</button>' +
    '</div>';
  }

  function renderStewardshipUpsellState(planPane) {
    // ── Plan row — subscribe CTA ───────────────────────────────────────────
    planPane.innerHTML =
      '<div class="sw-upsell-row-inner">' +
        '<div class="sw-upsell-row-copy">' +
          '<strong>Stewardship plan</strong>' +
          '<p>Stewardship reports, pledge context, and giving-health insights are included with Stewardship and Parish.</p>' +
        '</div>' +
        '<div class="sw-upsell-row-actions">' +
          '<button class="sw-subscribe-btn" type="button" onclick="switchTab(\'settings\')">Review tier settings</button>' +
        '</div>' +
      '</div>';

    // ── Giving metrics tool card — locked ─────────────────────────────────
    const metricPane = document.getElementById('givingMetricsPane');
    if (metricPane) {
      metricPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Pledge vs. actual fulfillment</div>' +
            '<div><span>✓</span> Fund breakdown &amp; share</div>' +
            '<div><span>✓</span> Run-rate projection</div>' +
            '<div><span>✓</span> Year-over-year comparison</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }

    // ── Financials tool card — locked ──────────────────────────────────────
    const finPane = document.getElementById('stewardshipFinancialsPane');
    if (finPane) {
      finPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Income &amp; expense by fiscal year</div>' +
            '<div><span>✓</span> Restricted fund ledger</div>' +
            '<div><span>✓</span> Net surplus / deficit tracking</div>' +
            '<div><span>✓</span> Year-end stewardship records</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }

    // ── Health Score tool card — locked ─────────────────────────────────────
    const healthPane = document.getElementById('stewardshipHealthScorePane');
    if (healthPane) {
      healthPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> One composite score from six giving signals</div>' +
            '<div><span>✓</span> Pledge fulfillment, retention, and concentration risk at a glance</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }

    // ── Concentration Risk tool card — locked ───────────────────────────────
    const concentrationPane = document.getElementById('stewardshipConcentrationPane');
    if (concentrationPane) {
      concentrationPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Top 5 / top 10 household giving concentration</div>' +
            '<div><span>✓</span> No individual donor identities shown</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }

    // ── Recurring Giving Health tool card — locked ──────────────────────────
    const recurringPane = document.getElementById('stewardshipRecurringPane');
    if (recurringPane) {
      recurringPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Recurring donors, MRR, and average gift</div>' +
            '<div><span>✓</span> Failed payments and canceled gifts</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }

    // ── Outside-AGAPAY contribution intake — locked ─────────────────────────
    const manualIncomePane = document.getElementById('stewardshipManualIncomePane');
    if (manualIncomePane) {
      manualIncomePane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Log weekly cash &amp; check totals</div>' +
            '<div><span>✓</span> Add contributions from Tithe.ly, PayPal, and other giving platforms</div>' +
          '</div>' +
          '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
        '</div>';
    }
  }

  function stewardshipPreviewUrl(meetingId, suffix = 'preview') {
    const token = document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
    const url = new URL('/parish/stewardship/annual-meetings/' + encodeURIComponent(meetingId) + '/' + suffix, window.location.origin);
    url.searchParams.set('parishId', currentParish?.parishId || '');
    url.searchParams.set('t', token);
    return url.pathname + url.search;
  }

  async function startStewardshipSubscription(plan, btn) {
    if (!currentParish) { setStatus('Load a parish first.','error'); return; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const res = await fetch(stewardshipApi('/subscribe'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type':'application/json' },
        body: JSON.stringify({ plan })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to start Stewardship checkout.');
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (err) {
      setStatus(err.message, 'error');
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  async function openStewardshipBilling(btn) {
    if (!currentParish) { setStatus('Load a parish first.','error'); return; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const res = await fetch(stewardshipApi('/billing-portal'), { method:'POST', headers:authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to open Stewardship billing.');
      if (data.portalUrl) window.location.href = data.portalUrl;
    } catch (err) {
      setStatus(err.message, 'error');
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  // Builds a single-line mailing address from the parish's Settings tab
  // fields, mirroring registrationAddressLine() server-side.
  function parishAddressLine(parish) {
    if (!parish) return '';
    return [
      parish.addressLine1,
      parish.addressLine2,
      [parish.city, parish.state, parish.postalCode].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ');
  }

  function emptyStewardshipMeeting() {
    const year = new Date().getFullYear();
    return {
      id: '',
      title: `${year} Annual Parish Meeting`,
      fiscalYear: year,
      meetingDate: '',
      meetingTime: '',
      // Most parishes meet in their own hall; easy to edit if this one doesn't.
      location: currentParish?.parishName ? `${currentParish.parishName} Parish Hall` : '',
      parishNameOverride: currentParish?.parishName || '',
      // Seeded from the parish's Settings tab — editable per meeting from there.
      jurisdiction: currentParish?.jurisdiction || '',
      address: parishAddressLine(currentParish),
      signatureLineCount: 24,
      noteLineCount: 12,
      status: 'draft',
      agendaItems: [{ title:'Opening prayer', durationMinutes:5 }, { title:'Reports', durationMinutes:30 }, { title:'Financial review', durationMinutes:20 }],
      reports: [
        { reportType:'priest', title:'Rector Report', body:'', createdBy:'' },
        { reportType:'treasurer', title:'Treasurer Report', body:'', createdBy:'' },
        { reportType:'brotherhood', title:'Brotherhood Report', body:'', createdBy:'' },
        { reportType:'sisterhood', title:'Sisterhood Report', body:'', createdBy:'' }
      ],
      financialSummary: { totalIncomeCents:0, totalExpenseCents:0, netCents:0, notes:'' },
      restrictedFunds: [],
      nominees: [],
      resolutions: []
    };
  }

  function newStewardshipMeeting() {
    if (!currentParish) { setStatus('Load a parish first.','error'); return; }
    stewardshipState.selectedMeeting = emptyStewardshipMeeting();
    renderStewardshipEditor();
  }

  async function editStewardshipMeeting(meetingId) {
    if (!meetingId) return;
    try {
      const card = document.getElementById('stewardshipEditorCard');
      const pane = document.getElementById('stewardshipEditorPane');
      if (card) card.hidden = false;
      if (pane) pane.innerHTML = '<p class="muted">Loading packet...</p>';
      const res = await fetch(stewardshipApi('/meetings/' + encodeURIComponent(meetingId)), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error || 'Unable to load packet.') + ' (HTTP ' + res.status + ')');
      if (!data.meeting) throw new Error('Server returned no meeting data.');
      stewardshipState.selectedMeeting = data.meeting;
      renderStewardshipEditor();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function closeStewardshipEditor() {
    stewardshipState.selectedMeeting = null;
    const card = document.getElementById('stewardshipEditorCard');
    if (card) card.hidden = true;
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

  function stewardshipMeetingReports(items = []) {
    const reports = Array.isArray(items) ? items.map(item => ({ ...item })) : [];
    [
      { reportType: 'brotherhood', title: 'Brotherhood Report', body: '', createdBy: '' },
      { reportType: 'sisterhood', title: 'Sisterhood Report', body: '', createdBy: '' }
    ].forEach(required => {
      if (!reports.some(report => report.reportType === required.reportType)) reports.push(required);
    });
    return reports;
  }

  function stewardshipRepeaterRows(type, items) {
    const rows = items && items.length ? items : [{}];
    return rows.map((item, index) => {
      if (type === 'agenda') return `<div class="stewardship-repeat-row" data-row-type="agenda">
        <label class="stewardship-row-field"><span>Agenda item</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="e.g. Treasurer's report" /></label>
        <label class="stewardship-row-field"><span>Time allotted</span><input type="number" min="0" data-field="durationMinutes" value="${escapeAttr(item.durationMinutes)}" placeholder="Minutes" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'report') return `<div class="stewardship-repeat-row" data-row-type="report">
        <label class="stewardship-row-field"><span>Report type</span><select data-field="reportType">
          ${['priest','warden','treasurer','stewardship','brotherhood','sisterhood','ministry','custom'].map(t=>`<option value="${t}" ${item.reportType===t?'selected':''}>${statusLabel(t)}</option>`).join('')}
        </select></label>
        <label class="stewardship-row-field"><span>Report title</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Title shown in packet" /></label>
        <label class="stewardship-row-field stewardship-row-field--wide"><span>Report content</span><textarea data-field="body" rows="5" placeholder="Write or paste the report here">${escapeHtml(item.body)}</textarea></label>
        <label class="stewardship-row-field"><span>Leader / presenter <small>Optional</small></span><input type="text" data-field="createdBy" value="${escapeAttr(item.createdBy)}" placeholder="Name of the report leader or presenter" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'fund') return `<div class="stewardship-repeat-row" data-row-type="fund">
        <label class="stewardship-row-field"><span>Fund name</span><input type="text" data-field="fundName" value="${escapeAttr(item.fundName)}" placeholder="Restricted fund" /></label>
        <label class="stewardship-row-field"><span>Beginning balance</span><input type="number" step="0.01" data-field="beginningBalance" value="${Number(item.beginningBalanceCents||0)/100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Received</span><input type="number" step="0.01" data-field="totalReceived" value="${Number(item.totalReceivedCents||0)/100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Disbursed</span><input type="number" step="0.01" data-field="totalDisbursed" value="${Number(item.totalDisbursedCents||0)/100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Ending balance</span><input type="number" step="0.01" data-field="endingBalance" value="${Number(item.endingBalanceCents||0)/100 || ''}" placeholder="$0.00" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'nominee') return `<div class="stewardship-repeat-row" data-row-type="nominee">
        <label class="stewardship-row-field"><span>Nominee's full name</span><input type="text" data-field="fullName" value="${escapeAttr(item.fullName)}" placeholder="Candidate's name" /></label>
        <label class="stewardship-row-field"><span>Position</span><input type="text" data-field="position" value="${escapeAttr(item.position)}" placeholder="e.g. Parish council member" /></label>
        <label class="stewardship-row-field stewardship-row-field--wide"><span>Candidate biography <small>Optional</small></span><textarea data-field="bio" rows="3" placeholder="Short biography for the packet">${escapeHtml(item.bio)}</textarea></label>
        <label class="stewardship-row-field"><span>Nominated by <small>Optional</small></span><input type="text" data-field="nominatedBy" value="${escapeAttr(item.nominatedBy)}" placeholder="Name of the person making the nomination" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      return `<div class="stewardship-repeat-row" data-row-type="resolution">
        <label class="stewardship-row-field"><span>Resolution title</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Short descriptive title" /></label>
        <label class="stewardship-row-field stewardship-resolution-text"><span>Full resolution text</span><textarea data-field="resolvedText" rows="8" placeholder="Write the complete action to be considered. The packet will add “RESOLVED, THAT” when printed.">${escapeHtml(item.resolvedText)}</textarea></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
    }).join('');
  }

  function renderStewardshipEditor() {
    const meeting = stewardshipState.selectedMeeting || emptyStewardshipMeeting();
    const card = document.getElementById('stewardshipEditorCard');
    const pane = document.getElementById('stewardshipEditorPane');
    const title = document.getElementById('stewardshipEditorTitle');
    if (!card || !pane) return;
    card.hidden = false;
    if (title) title.textContent = meeting.id ? 'Edit Annual Meeting Packet' : 'New Annual Meeting Packet';
    const income = Number(meeting.financialSummary?.totalIncomeCents || 0) / 100;
    const expense = Number(meeting.financialSummary?.totalExpenseCents || 0) / 100;
    pane.innerHTML = `
      <form class="stewardship-native-form" id="stewardshipMeetingForm" onsubmit="saveStewardshipMeeting(event, 'draft')">
        <div class="stewardship-form-grid">
          <label>Title<input name="title" value="${escapeAttr(meeting.title)}" required /></label>
          <label>Fiscal year<input name="fiscalYear" type="number" value="${escapeAttr(meeting.fiscalYear)}" required /></label>
          <label>Meeting date<input name="meetingDate" type="date" value="${escapeAttr(meeting.meetingDate)}" /></label>
          <label>Meeting time<input name="meetingTime" type="time" value="${escapeAttr(meeting.meetingTime)}" /></label>
          <label>Location<input name="location" value="${escapeAttr(meeting.location)}" /></label>
          <label>Jurisdiction<input name="jurisdiction" value="${escapeAttr(meeting.jurisdiction)}" /></label>
        </div>
        <label>Address<textarea name="address" rows="2">${escapeHtml(meeting.address)}</textarea></label>
        <div class="stewardship-editor-section stewardship-packet-layout-section">
          <div><div><h3>Printed packet layout</h3><p>Choose how much handwriting space to include in the final packet.</p></div></div>
          <div class="stewardship-form-grid">
            <label>Sign-in lines<input name="signatureLineCount" type="number" min="1" max="200" value="${escapeAttr(meeting.signatureLineCount || 24)}" /><small>Numbered attendee signature rows on the sign-in sheet.</small></label>
            <label>Note-taking lines<input name="noteLineCount" type="number" min="0" max="200" value="${escapeAttr(meeting.noteLineCount ?? 12)}" /><small>Blank ruled lines on the meeting-minutes page.</small></label>
          </div>
        </div>
        <div class="stewardship-editor-section"><div><h3>Agenda</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('agenda')">Add item</button></div><div id="stewardshipAgendaRows">${stewardshipRepeaterRows('agenda', meeting.agendaItems)}</div></div>
        <div class="stewardship-editor-section"><div><div><h3>Reports</h3><p>Include the report title, written content, and the leader or presenter responsible for it.</p></div><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('report')">Add report</button></div><div id="stewardshipReportRows">${stewardshipRepeaterRows('report', stewardshipMeetingReports(meeting.reports))}</div></div>
        <div class="stewardship-editor-section"><div><h3>Financial summary</h3></div><div class="stewardship-form-grid">
          <label>Total income<input name="totalIncome" type="number" step="0.01" value="${income || ''}" /></label>
          <label>Total expenses<input name="totalExpense" type="number" step="0.01" value="${expense || ''}" /></label>
          <label>Notes<textarea name="financialNotes" rows="2">${escapeHtml(meeting.financialSummary?.notes || '')}</textarea></label>
        </div></div>
        <div class="stewardship-editor-section"><div><h3>Restricted funds</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('fund')">Add fund</button></div><div id="stewardshipFundRows">${stewardshipRepeaterRows('fund', meeting.restrictedFunds)}</div></div>
        <div class="stewardship-editor-section"><div><h3>Nominees</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('nominee')">Add nominee</button></div><div id="stewardshipNomineeRows">${stewardshipRepeaterRows('nominee', meeting.nominees)}</div></div>
        <div class="stewardship-editor-section"><div><h3>Resolutions</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('resolution')">Add resolution</button></div><div id="stewardshipResolutionRows">${stewardshipRepeaterRows('resolution', meeting.resolutions)}</div></div>
        <div class="btn-row">
          <button class="btn btn-gold" type="submit">Save draft</button>
          <button class="btn btn-ghost" type="button" onclick="saveStewardshipMeeting(event, 'ready')">Mark ready</button>
          ${meeting.id ? `<a class="btn btn-ghost" href="${escapeAttr(stewardshipPreviewUrl(meeting.id))}" target="_blank" rel="noopener">Preview</a><a class="btn btn-ghost" href="${escapeAttr(stewardshipPreviewUrl(meeting.id, 'pdf'))}" target="_blank" rel="noopener">Print/PDF</a>` : ''}
        </div>
      </form>`;
    card.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function addStewardshipRow(type) {
    const target = document.getElementById({ agenda:'stewardshipAgendaRows', report:'stewardshipReportRows', fund:'stewardshipFundRows', nominee:'stewardshipNomineeRows', resolution:'stewardshipResolutionRows' }[type]);
    if (!target) return;
    target.insertAdjacentHTML('beforeend', stewardshipRepeaterRows(type, [{}]));
  }

  function removeStewardshipRow(btn) {
    const row = btn?.closest('.stewardship-repeat-row');
    const parent = row?.parentElement;
    if (!row || !parent) return;
    if (parent.querySelectorAll('.stewardship-repeat-row').length <= 1) {
      row.querySelectorAll('input, textarea').forEach(input => input.value = '');
      return;
    }
    row.remove();
  }

  function readStewardshipRows(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return [...container.querySelectorAll('.stewardship-repeat-row')].map(row => {
      const item = {};
      row.querySelectorAll('[data-field]').forEach(input => { item[input.dataset.field] = input.value.trim(); });
      return item;
    }).filter(item => Object.values(item).some(Boolean));
  }

  function dollarsToNumber(value) {
    const amount = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(amount) ? amount : 0;
  }

  async function saveStewardshipMeeting(event, status = 'draft') {
    event?.preventDefault?.();
    const form = document.getElementById('stewardshipMeetingForm');
    if (!form) return;
    const fd = new FormData(form);
    const meeting = stewardshipState.selectedMeeting || {};
    const body = {
      title: fd.get('title'),
      fiscalYear: fd.get('fiscalYear'),
      meetingDate: fd.get('meetingDate'),
      meetingTime: fd.get('meetingTime'),
      location: fd.get('location'),
      jurisdiction: fd.get('jurisdiction'),
      address: fd.get('address'),
      signatureLineCount: fd.get('signatureLineCount'),
      noteLineCount: fd.get('noteLineCount'),
      status,
      agendaItems: readStewardshipRows('stewardshipAgendaRows'),
      reports: readStewardshipRows('stewardshipReportRows'),
      financialSummary: {
        totalIncome: dollarsToNumber(fd.get('totalIncome')),
        totalExpense: dollarsToNumber(fd.get('totalExpense')),
        notes: fd.get('financialNotes')
      },
      restrictedFunds: readStewardshipRows('stewardshipFundRows'),
      nominees: readStewardshipRows('stewardshipNomineeRows'),
      resolutions: readStewardshipRows('stewardshipResolutionRows')
    };
    const method = meeting.id ? 'PATCH' : 'POST';
    const path = meeting.id ? '/meetings/' + encodeURIComponent(meeting.id) : '/meetings';
    try {
      const res = await fetch(stewardshipApi(path), {
        method,
        headers: { ...authHeaders(), 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error || 'Unable to save packet.') + ' [' + method + ' ' + path + ', HTTP ' + res.status + ']');
      stewardshipState.selectedMeeting = data.meeting;
      stewardshipState.loaded = false;
      setStatus('Stewardship packet saved.','success');
      await loadStewardshipPanel(true);
      stewardshipState.selectedMeeting = data.meeting;
      renderStewardshipEditor();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  // ── GIVING OPTIONS HELPERS ────────────────────────────────
  function optionCards(items, kind, emptyText) {
    if (!items || !items.length) return `<div class="option-empty">${emptyText}</div>`;
    return items.map((item, i) => {
      const isEditing = editingGivingOption?.kind === kind && editingGivingOption?.index === i;
      const restrictionType = item.restrictionType || (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted');
      return `
      <div class="option-item">
        <div class="option-item-head">
          <div class="option-name">${escapeHtml(item.name || item.id || 'Untitled')}</div>
          <div class="option-item-actions">
            <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('${kind}',${i})">${isEditing ? 'Close' : 'Edit'}</button>
            <button class="icon-button" type="button" aria-label="Remove ${escapeAttr(item.name || kind)}" onclick="removeGivingOption('${kind}',${i})">x</button>
          </div>
        </div>
        <div class="option-desc">${escapeHtml(item.description || '')}</div>
        <small>${escapeHtml(item.accountNumber || 'Number assigned when saved')} · ${escapeHtml(restrictionLabel(restrictionType))}</small>
        ${isEditing ? `
          <form class="option-edit-form" onsubmit="updateGivingOption(event,'${kind}',${i})">
            <label>Name<input name="name" maxlength="120" required value="${escapeAttr(item.name || '')}" /></label>
            <label>Account number<input name="accountNumber" maxlength="24" value="${escapeAttr(item.accountNumber || '')}" placeholder="e.g. BENEVOLENCE" /></label>
            <label>Restriction
              <select name="restrictionType">
                <option value="unrestricted" ${restrictionType === 'unrestricted' ? 'selected' : ''}>Unrestricted</option>
                <option value="board_designated" ${restrictionType === 'board_designated' ? 'selected' : ''}>Board designated</option>
                <option value="donor_restricted_temporary" ${restrictionType === 'donor_restricted_temporary' ? 'selected' : ''}>Donor restricted · temporary</option>
                <option value="donor_restricted_permanent" ${restrictionType === 'donor_restricted_permanent' ? 'selected' : ''}>Donor restricted · permanent</option>
              </select>
            </label>
            <label class="full">Description<textarea name="description" maxlength="500">${escapeHtml(item.description || '')}</textarea></label>
            <div class="option-edit-actions">
              <button class="btn btn-primary btn-sm" type="submit">Apply changes</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('${kind}',${i})">Cancel</button>
              <small>The fund ID stays unchanged so prior gifts remain linked correctly.</small>
            </div>
          </form>` : ''}
      </div>`;
    }).join('');
  }
  function presetOptions(presets) { return Object.entries(presets).map(([k,v])=>`<option value="${k}">${escapeHtml(v.name)}</option>`).join(''); }
  function fillGivingPreset(kind) { const presets=kind==='fund'?fundPresets:campaignPresets; const prefix=kind==='fund'?'fund':'campaign'; const preset=presets[document.getElementById(`${prefix}Preset`)?.value]; if(!preset) return; document.getElementById(`${prefix}Name`).value=preset.name; document.getElementById(`${prefix}Description`).value=preset.description; const restriction=document.getElementById(`${prefix}Restriction`); if(restriction&&preset.restrictionType) restriction.value=preset.restrictionType; }
  function parseDollarsToCents(value) {
    const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
  }

  function optionKeys(item = {}) {
    return [item.id, item.feastId, item.name, item.campaignName, item.title]
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase());
  }

  function giftMatchesOption(gift, item, kind) {
    const keys = new Set(optionKeys(item));
    const giftKeys = kind === 'fund'
      ? optionKeys({ id: gift.fundId, name: gift.fund })
      : optionKeys({ id: gift.campaignId, name: gift.campaign, campaignName: gift.description });
    return giftKeys.some(key => keys.has(key));
  }

  function optionProgress(item, kind) {
    const gifts = allGifts.filter(gift => giftMatchesOption(gift, item, kind));
    const raisedCents = gifts.reduce((sum, gift) => sum + Number(gift.amountCents || 0), 0);
    const goalCents = kind === 'campaign' ? Number(item.goalCents || item.targetCents || item.goalAmountCents || 0) : 0;
    return { raisedCents, goalCents, giftCount: gifts.length };
  }

  function progressMarkup(raisedCents, goalCents) {
    if (!goalCents) return '<span class="progress-muted">No goal set</span>';
    const pct = Math.min(100, Math.round((raisedCents / goalCents) * 100));
    return `<div class="option-progress"><span style="width:${pct}%"></span></div><small>${pct}%</small>`;
  }

  function renderOptionsProgressSummary() {
    const activeFunds = editableFunds.filter((fund) => fund && fund.enabled !== false && fund.active !== false);
    const activeDesignatedFunds = activeFunds.filter((fund) => !isGeneralDashboardFund(fund) && !isCandleDashboardFund(fund));
    const starterLimitReached = !hasGivingPlusAccess() && activeDesignatedFunds.length >= 1;
    const summaryFunds = editableFunds.map((item, index) => ({ item, index }));
    if (!summaryFunds.some((row) => isCandleDashboardFund(row.item))) {
      summaryFunds.push({ item: { id: 'candle', name: 'Candles / Vigil Lights', description: 'Built-in candle offerings and prayer intentions.', restrictionType: 'unrestricted', starterBuiltin: true }, index: null });
    }
    const rows = [
      ...summaryFunds.map(({ item, index }) => ({ kind: 'fund', label: isGeneralDashboardFund(item) ? 'General fund' : isCandleDashboardFund(item) ? 'Candle fund' : 'Designated fund', item, index })).filter((row) => row.item?.enabled !== false && row.item?.active !== false),
      ...(hasGivingPlusAccess() ? editableCampaigns.map(item => ({ kind: 'campaign', label: 'Campaign', item })) : []),
      ...(hasGivingPlusAccess() ? editableFeastCampaigns.filter(item => item.enabled !== false).map(item => ({ kind: 'campaign', label: 'Feast campaign', item })) : [])
    ];
    return `<div class="options-summary-card"><div class="options-summary-head"><span>Active giving options</span><small>Based on paid gifts in AGAPAY</small></div><div class="options-progress-table">${rows.length ? rows.map(row => {
      const progress = optionProgress(row.item, row.kind);
      const isEditableFund = row.kind === 'fund' && Number.isInteger(row.index) && !isCandleDashboardFund(row.item);
      const isEditing = isEditableFund && editingGivingOption?.kind === 'fund' && editingGivingOption?.index === row.index;
      const restrictionType = row.item.restrictionType || (row.kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted');
      return `<div class="options-progress-row">
        <span>${escapeHtml(row.label)}</span>
          <div class="option-summary-identity">
            <div class="option-summary-title">
              <strong>${escapeHtml(row.item.name || row.item.campaignName || row.item.id || 'Giving option')}</strong>
            </div>
          ${row.item.description ? `<small class="option-summary-description">${escapeHtml(row.item.description)}</small>` : ''}
          <small>${escapeHtml(row.item.accountNumber || 'Number assigned when saved')} · ${escapeHtml(restrictionLabel(restrictionType))}</small>
        </div>
        <span>${moneyFull(progress.raisedCents)} raised</span>
        <span>${row.kind === 'campaign' && progress.goalCents ? `Goal ${moneyFull(progress.goalCents)}` : ''}</span>
        <div>${progressMarkup(progress.raisedCents, progress.goalCents)}</div>
        <div class="options-summary-action">${isEditableFund ? `<button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('fund',${row.index})">${isEditing ? 'Close' : 'Edit'}</button>` : ''}</div>
        ${isEditing ? `
          <form class="option-edit-form options-summary-edit" onsubmit="updateGivingOption(event,'fund',${row.index})">
            <label>Name<input name="name" maxlength="120" required value="${escapeAttr(row.item.name || '')}" /></label>
            <label>Account number<input name="accountNumber" maxlength="24" value="${escapeAttr(row.item.accountNumber || '')}" placeholder="e.g. BENEVOLENCE" /></label>
            <label>Restriction
              <select name="restrictionType">
                <option value="unrestricted" ${restrictionType === 'unrestricted' ? 'selected' : ''}>Unrestricted</option>
                <option value="board_designated" ${restrictionType === 'board_designated' ? 'selected' : ''}>Board designated</option>
                <option value="donor_restricted_temporary" ${restrictionType === 'donor_restricted_temporary' ? 'selected' : ''}>Donor restricted · temporary</option>
                <option value="donor_restricted_permanent" ${restrictionType === 'donor_restricted_permanent' ? 'selected' : ''}>Donor restricted · permanent</option>
              </select>
            </label>
            <label class="full">Description<textarea name="description" maxlength="500">${escapeHtml(row.item.description || '')}</textarea></label>
            <div class="option-edit-actions">
              <button class="btn btn-primary btn-sm" type="submit">Apply changes</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="editGivingOption('fund',${row.index})">Cancel</button>
              <small>The fund ID stays unchanged so prior gifts remain linked correctly.</small>
            </div>
          </form>` : ''}
      </div>`;
    }).join('') : '<div class="option-empty options-summary-empty">No giving options configured yet.</div>'}</div>
      <div class="option-builder options-summary-builder">
        <div class="option-builder-title">${hasGivingPlusAccess() ? 'Add a fund' : 'Your Give designated fund'}</div>
        <p class="section-note">${hasGivingPlusAccess() ? 'Funds shown above are the source of truth for donor choices and the Accounting suite. Saving creates or updates the matching accounting funds automatically.' : 'Give includes General Operating, one active designated fund, and candle giving. Edit the designated fund above or upgrade for additional funds.'}</p>
        ${starterLimitReached ? '<div class="option-empty">Your one Give designated fund is active. Edit it above, or upgrade to Give + to add more.</div>' : `<div class="builder-grid"><select id="fundPreset" onchange="fillGivingPreset('fund')"><option value="custom" selected>Custom fund — name it yourself</option><optgroup label="Start from a preset">${presetOptions(fundPresets)}</optgroup></select><input id="fundAccountNumber" maxlength="24" placeholder="Fund account number (optional), e.g. 2100" /><input id="fundName" maxlength="120" placeholder="Custom fund name, e.g. Mission Development Fund" /><select id="fundRestriction"><option value="unrestricted">Unrestricted</option><option value="board_designated">Board designated</option><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option></select><textarea id="fundDescription" maxlength="500" placeholder="Describe what this parish-created fund supports."></textarea><button class="btn btn-gold" onclick="addGivingOption('fund')">Add designated fund</button></div>`}
      </div>
    </div>`;
  }

  let pdxGiversSort = 'amount';
  function setGiversSort(mode, btn) {
    pdxGiversSort = mode;
    if (btn) {
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    renderGiversDirectory();
  }
  function scrollToGiverDirectory() {
    const el = document.getElementById('pdxGvDirectorySection');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderGiversPanel() {
    const groups = new Map();
    allGifts.forEach(gift => {
      const key = (gift.donorEmail || gift.donorName || 'anonymous').toLowerCase();
      const existing = groups.get(key) || { name: gift.donorName || 'Anonymous giver', email: gift.donorEmail || '', giftCount: 0, totalCents: 0, recurring: false, lastGiftAt: '', firstGiftAt: '' };
      existing.giftCount += 1;
      existing.totalCents += Number(gift.amountCents || 0);
      existing.recurring = existing.recurring || Boolean(gift.recurring);
      const date = gift.date || gift.createdAt || '';
      if (date) {
        if (!existing.lastGiftAt || date > existing.lastGiftAt) existing.lastGiftAt = date;
        if (!existing.firstGiftAt || date < existing.firstGiftAt) existing.firstGiftAt = date;
      }
      groups.set(key, existing);
    });
    const givers = Array.from(groups.values()).sort((a, b) => b.totalCents - a.totalCents);
    window.pdxGiversAll = givers;

    const total = givers.reduce((sum, g) => sum + g.totalCents, 0);
    const recurring = givers.filter(g => g.recurring).length;
    const last = givers.map(g => g.lastGiftAt).filter(Boolean).sort().pop();

    // Median gift (across all gifts, not per-donor)
    const amounts = allGifts.map(g => Number(g.amountCents || 0)).filter(a => a > 0).sort((a, b) => a - b);
    const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;

    // "New this month" = donors whose first gift was in the current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = givers.filter(g => g.firstGiftAt && g.firstGiftAt >= monthStart).length;

    // KPIs — use the shared count-up helper if available
    const setCount = (id, val, opts = {}) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (typeof pdxAnimateCount === 'function') pdxAnimateCount(el, val, opts);
      else el.textContent = opts.money ? money(val) : String(val);
    };
    setCount('giverStatCount', givers.length);
    setCount('giverStatTotal', total, { money: true });
    setCount('pdxGvKpiMedian', median, { money: true });
    setCount('giverStatRecurring', recurring);

    const countMeta = document.getElementById('pdxGvKpiCountMeta');
    if (countMeta) countMeta.innerHTML = newThisMonth > 0
      ? `<span class="pdx-delta up">${newThisMonth}</span>new this month`
      : `<span style="opacity:0.7;">Distinct households</span>`;
    const totalMeta = document.getElementById('pdxGvKpiTotalMeta');
    if (totalMeta) totalMeta.innerHTML = `<span style="opacity:0.7;">Across ${allGifts.length} gift${allGifts.length === 1 ? '' : 's'}</span>`;
    const recurringMeta = document.getElementById('pdxGvKpiRecurringMeta');
    if (recurringMeta) {
      const pct = givers.length ? Math.round((recurring / givers.length) * 100) : 0;
      recurringMeta.innerHTML = `<span style="opacity:0.7;">${pct}% of households</span>`;
    }

    // Legacy hidden binding for "last gift" (still referenced elsewhere in app.js)
    const legacyLast = document.getElementById('giverStatLast');
    if (legacyLast) legacyLast.textContent = shortDate(last);

    // Hero: title with count, mini-donut ratio
    const heroTitle = document.getElementById('pdxGvTitle');
    if (heroTitle) heroTitle.innerHTML = givers.length
      ? `<em>${givers.length}</em> household${givers.length === 1 ? ' has' : 's have'} given<br>to your parish this year.`
      : `Load giving history to see your parish community.`;
    const donutPct = document.getElementById('pdxGvRecurringPct');
    const donutSub = document.getElementById('pdxGvRecurringSub');
    const donut = document.getElementById('pdxGvDonut');
    const ratio = givers.length ? recurring / givers.length : 0;
    if (donutPct) donutPct.textContent = `${Math.round(ratio * 100)}%`;
    if (donutSub) donutSub.textContent = `${recurring} of ${givers.length} household${givers.length === 1 ? '' : 's'}`;
    if (donut) {
      const C = 2 * Math.PI * 82; // ≈ 515
      donut.setAttribute('stroke-dasharray', C);
      donut.setAttribute('stroke-dashoffset', C);
      requestAnimationFrame(() => setTimeout(() => {
        donut.style.strokeDashoffset = String(C * (1 - ratio));
      }, 300));
    }

    // Leaderboard: top 6
    const lbEl = document.getElementById('pdxGvLeaderboard');
    if (lbEl) {
      const topSix = givers.slice(0, 6);
      lbEl.innerHTML = topSix.length ? `<div class="pdx-gv-leaderboard">${topSix.map((g, i) => {
        const avgCents = g.giftCount ? Math.round(g.totalCents / g.giftCount) : 0;
        const top = i < 3 ? 'top' : '';
        return `<div class="pdx-gv-lb-row ${top}">
          <div class="pdx-gv-lb-rank">${i + 1}</div>
          <div class="pdx-gv-lb-copy">
            <div class="pdx-gv-lb-name">${escapeHtml(g.name)}</div>
            <div class="pdx-gv-lb-meta">${g.giftCount} gift${g.giftCount === 1 ? '' : 's'}${g.recurring ? ' <span class="pdx-gv-lb-recur">Recurring</span>' : ''}</div>
          </div>
          <div class="pdx-gv-lb-amount">${escapeHtml(money(g.totalCents))}<small>${escapeHtml(money(avgCents))} avg</small></div>
        </div>`;
      }).join('')}</div>` : '<div class="pdx-recurring-empty">No paid gifts have been recorded yet.</div>';
    }

    // Nudge list: recurring donors whose last gift is > 30 days old
    const nudgeEl = document.getElementById('pdxGvNudgeList');
    if (nudgeEl) {
      const dayMs = 86400000;
      const nudgeCandidates = givers
        .filter(g => g.recurring && g.lastGiftAt)
        .map(g => ({ ...g, daysQuiet: Math.floor((now - new Date(g.lastGiftAt)) / dayMs) }))
        .filter(g => g.daysQuiet >= 30)
        .sort((a, b) => b.daysQuiet - a.daysQuiet)
        .slice(0, 6);
      if (nudgeCandidates.length === 0) {
        nudgeEl.innerHTML = `<div class="pdx-gv-nudge-empty">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>All caught up</strong>
          <span>No recurring givers have gone quiet.</span>
        </div>`;
      } else {
        nudgeEl.innerHTML = `<div class="pdx-gv-nudge-list">${nudgeCandidates.map(g => {
          const lapsed = g.daysQuiet >= 90;
          const avgCents = g.giftCount ? Math.round(g.totalCents / g.giftCount) : 0;
          return `<div class="pdx-gv-nudge ${lapsed ? 'lapsed' : ''}">
            <div class="pdx-gv-nudge-copy">
              <div class="pdx-gv-nudge-name">${escapeHtml(g.name)}</div>
              <div class="pdx-gv-nudge-meta">Avg ${escapeHtml(money(avgCents))}/gift · Last gift ${escapeHtml(shortDate(g.lastGiftAt))}</div>
            </div>
            <div class="pdx-gv-nudge-status">
              <div class="pdx-gv-nudge-days">${g.daysQuiet}</div>
              <div class="pdx-gv-nudge-days-label">${lapsed ? 'days · lapsed' : 'days quiet'}</div>
            </div>
          </div>`;
        }).join('')}</div>`;
      }
    }

    renderGiversDirectory();
    populateGivingStatementsPanel();
    checkNudgeEligibility();
  }

  // ── ANNUAL GIVING STATEMENTS ───────────────────────────────
  let gsJobHistoryLoaded = false;

  function populateGivingStatementsPanel() {
    const yearSel = document.getElementById('gsFiscalYear');
    if (yearSel && !yearSel.dataset.populated) {
      const nowYear = new Date().getFullYear();
      const years = [nowYear - 1, nowYear, nowYear - 2, nowYear - 3];
      yearSel.innerHTML = years.map((y, i) => `<option value="${y}" ${i === 0 ? 'selected' : ''}>${y}</option>`).join('');
      yearSel.dataset.populated = '1';
    }
    const donorSel = document.getElementById('gsPreviewDonor');
    if (donorSel) {
      const givers = (Array.isArray(window.pdxGiversAll) ? window.pdxGiversAll : []).filter(g => g.email);
      donorSel.innerHTML = givers.length
        ? givers.map(g => `<option value="${escapeHtml(g.email)}">${escapeHtml(g.name || g.email)} (${escapeHtml(g.email)})</option>`).join('')
        : '<option value="">No donors with gifts loaded yet</option>';
    }
    if (!gsJobHistoryLoaded) {
      gsJobHistoryLoaded = true;
      loadGivingStatementJobHistory();
    }
  }

  async function previewGivingStatement(btn) {
    if (!currentParish) { setStatus('Load a parish first.', 'error'); return; }
    const fiscalYear = document.getElementById('gsFiscalYear')?.value;
    const donorEmail = document.getElementById('gsPreviewDonor')?.value;
    if (!fiscalYear || !donorEmail) { setStatus('Choose a tax year and donor to preview.', 'error'); return; }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/preview', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: Number(fiscalYear), donorEmail })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to generate preview.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  async function startGivingStatementJob(btn) {
    if (!currentParish) { setStatus('Load a parish first.', 'error'); return; }
    const fiscalYear = document.getElementById('gsFiscalYear')?.value;
    if (!fiscalYear) { setStatus('Choose a tax year first.', 'error'); return; }
    if (!confirm(`Generate and email ${fiscalYear} giving statements to every donor who gave this parish that year?`)) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/jobs', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: Number(fiscalYear) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start the giving-statement batch.');
      setStatus(`Started generating statements for ${data.totalDonors} donor(s).`, 'success');
      const progress = document.getElementById('gsJobProgress');
      if (progress) progress.hidden = false;
      pollGivingStatementJob(data.jobId);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  async function pollGivingStatementJob(jobId) {
    if (!currentParish) return;
    const textEl = document.getElementById('gsJobProgressText');
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/jobs/' + encodeURIComponent(jobId), { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to check batch status.');
      if (textEl) {
        textEl.textContent = `${data.status.replace(/_/g, ' ')} — ${data.processedDonors}/${data.totalDonors} processed (${data.sentCount} sent, ${data.failedCount} failed)`;
      }
      if (data.status === 'pending' || data.status === 'running') {
        setTimeout(() => pollGivingStatementJob(jobId), 3000);
      } else {
        const progress = document.getElementById('gsJobProgress');
        if (progress) setTimeout(() => { progress.hidden = true; }, 8000);
        loadGivingStatementJobHistory();
      }
    } catch (err) {
      if (textEl) textEl.textContent = err.message;
    }
  }

  async function loadGivingStatementJobHistory() {
    if (!currentParish) return;
    const wrap = document.getElementById('gsJobHistory');
    if (!wrap) return;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-statements/jobs', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load batch history.');
      const jobs = data.jobs || [];
      if (!jobs.length) {
        wrap.innerHTML = '<div class="pdx-recurring-empty">No giving-statement batches generated yet.</div>';
        return;
      }
      wrap.innerHTML = `<table class="history-table"><thead><tr><th>Tax year</th><th>Status</th><th>Sent</th><th>Failed</th><th>Started</th></tr></thead><tbody>${jobs.map(j => `
        <tr>
          <td>${escapeHtml(String(j.fiscalYear))}</td>
          <td>${escapeHtml(String(j.status).replace(/_/g, ' '))}</td>
          <td>${escapeHtml(String(j.sentCount))} / ${escapeHtml(String(j.totalDonors))}</td>
          <td>${escapeHtml(String(j.failedCount))}</td>
          <td>${escapeHtml(shortDate(j.createdAt))}</td>
        </tr>`).join('')}</tbody></table>`;
    } catch (err) {
      wrap.innerHTML = `<div class="pdx-recurring-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderGiversDirectory() {
    const pane = document.getElementById('giversPane');
    if (!pane) return;
    const all = Array.isArray(window.pdxGiversAll) ? window.pdxGiversAll : [];
    if (!all.length) {
      pane.innerHTML = '<div class="pdx-gv-dir-empty">No paid gifts have been recorded yet.</div>';
      return;
    }
    const search = (document.getElementById('pdxGvSearch')?.value || '').trim().toLowerCase();
    let filtered = search ? all.filter(g => (g.name || '').toLowerCase().includes(search) || (g.email || '').toLowerCase().includes(search)) : all.slice();
    switch (pdxGiversSort) {
      case 'recency': filtered.sort((a, b) => (b.lastGiftAt || '').localeCompare(a.lastGiftAt || '')); break;
      case 'gifts':   filtered.sort((a, b) => b.giftCount - a.giftCount); break;
      case 'name':    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'amount':
      default:        filtered.sort((a, b) => b.totalCents - a.totalCents);
    }
    if (!filtered.length) {
      pane.innerHTML = '<div class="pdx-gv-dir-empty">No givers match that search.</div>';
      return;
    }
    pane.innerHTML = `<div class="pdx-gv-dir-grid">${filtered.map(g => `
      <div class="pdx-gv-dir-card">
        <div class="pdx-gv-dir-top">
          <span class="pdx-gv-dir-name">${escapeHtml(g.name)}</span>
          <span class="pdx-gv-dir-amount">${escapeHtml(money(g.totalCents))}</span>
        </div>
        <div class="pdx-gv-dir-email">${escapeHtml(g.email || 'No email shown')}</div>
        <div class="pdx-gv-dir-meta">
          <span>${g.giftCount} gift${g.giftCount === 1 ? '' : 's'}</span>
          ${g.recurring ? '<span class="pdx-gv-dir-recur">Recurring</span>' : `<span>Last ${escapeHtml(shortDate(g.lastGiftAt))}</span>`}
        </div>
      </div>
    `).join('')}</div>`;
  }

  function addGivingOption(kind) {
    if (kind === 'campaign' && !hasGivingPlusAccess()) { setStatus('Campaigns require Give +.', 'error'); return; }
    if (kind === 'fund' && !hasGivingPlusAccess() && editableFunds.some((fund) => fund && !isGeneralDashboardFund(fund) && !isCandleDashboardFund(fund) && fund.enabled !== false && fund.active !== false)) {
      setStatus('Give includes one active designated fund. Edit the current fund or upgrade to add more.', 'error');
      return;
    }
    const prefix = kind === 'fund' ? 'fund' : 'campaign';
    const nameEl = document.getElementById(`${prefix}Name`);
    const descEl = document.getElementById(`${prefix}Description`);
    const name = nameEl?.value.trim();
    if (!name) { setStatus(`Enter a ${kind} name.`, 'error'); return; }
    const id = slugifyLocal(name);
    const target = kind === 'fund' ? editableFunds : editableCampaigns;
    if (target.some((item) => item.id === id || String(item.name || '').trim().toLowerCase() === name.toLowerCase())) { setStatus(`A ${kind} with that name already exists.`, 'error'); return; }
    const item = { id, name, description: descEl?.value.trim() || (kind === 'fund' ? 'Designated support for this parish.' : 'Parish-approved alms for this need.'), accountNumber: document.getElementById(`${prefix}AccountNumber`)?.value.trim() || '', restrictionType: document.getElementById(`${prefix}Restriction`)?.value || (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted'), ...(kind === 'fund' ? { fundType: document.getElementById('fundPreset')?.value === 'custom' ? 'custom' : 'preset' } : {}) };
    if (kind === 'campaign') { const goalCents = parseDollarsToCents(document.getElementById('campaignGoal')?.value); if (goalCents > 0) item.goalCents = goalCents; }
    target.push(item);
    nameEl.value = '';
    descEl.value = '';
    const goalEl = document.getElementById(`${prefix}Goal`);
    if (goalEl) goalEl.value = '';
    renderGivingOptionsEditor();
    setStatus(`${kind === 'fund' ? 'Fund' : 'Campaign'} added. Save when ready.`, 'success');
  }
  function editGivingOption(kind, i) {
    editingGivingOption = editingGivingOption?.kind === kind && editingGivingOption?.index === i ? null : { kind, index: i };
    renderGivingOptionsEditor();
  }
  function updateGivingOption(event, kind, i) {
    event.preventDefault();
    const target = kind === 'fund' ? editableFunds : editableCampaigns;
    const current = target[i];
    if (!current) return;
    const form = event.currentTarget;
    const name = String(form.elements.name?.value || '').trim();
    if (!name) { setStatus(`Enter a ${kind} name.`, 'error'); return; }
    if (target.some((item, index) => index !== i && String(item.name || '').trim().toLowerCase() === name.toLowerCase())) {
      setStatus(`Another ${kind} already uses that name.`, 'error');
      return;
    }
    const validRestrictions = new Set(['unrestricted','board_designated','donor_restricted_temporary','donor_restricted_permanent']);
    const requestedRestriction = String(form.elements.restrictionType?.value || '');
    const accountNumber = String(form.elements.accountNumber?.value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    target[i] = {
      ...current,
      name,
      description: String(form.elements.description?.value || '').trim(),
      accountNumber: accountNumber || current.accountNumber || '',
      restrictionType: validRestrictions.has(requestedRestriction) ? requestedRestriction : (current.restrictionType || 'unrestricted')
    };
    editingGivingOption = null;
    renderGivingOptionsEditor();
    setStatus(`${kind === 'fund' ? 'Fund' : 'Campaign'} updated. Save giving options to publish the change.`, 'success');
  }
  function removeGivingOption(kind,i) { if(kind==='fund') editableFunds.splice(i,1); else editableCampaigns.splice(i,1); editingGivingOption=null; renderGivingOptionsEditor(); setStatus('Option removed. Save when ready.','success'); }

  // ── FEAST CAMPAIGN HELPERS ────────────────────────────────
  function calendarLabel(v) { return window.AGAPAYLiturgicalCalendar?.calendarLabel(v) || (v==='gregorian'?'Revised-Julian':'Julian'); }
  function feastPresetsForCalendar(cal) {
    const api = window.AGAPAYLiturgicalCalendar;
    if (!api) return fallbackFeastPresets;
    return api.liturgicalFeastsForYear(new Date().getFullYear(), cal)
      .filter(feast => ['great', 'major'].includes(feast.rank))
      .map(feast => ({ id:feast.id, name:feast.name, displayDate:feast.displayDate, sourceDate:feast.sourceDate }));
  }
  function feastDateLabel(feast) { return feast.displayDate || feast.date || ''; }
  function patronalFeastCampaignChoice(cal) {
    const saved = editableFeastCampaigns.find((campaign) => campaign?.patronal);
    const id = currentParish?.patronalFeast || saved?.id || '';
    const name = currentParish?.patronalFeastName || saved?.name || '';
    const feastDate = currentParish?.patronalFeastDate || saved?.feastDate || '';
    if (!id || !name) return null;
    const monthDay = patronalMonthDay(feastDate);
    const displayDate = monthDay.month && monthDay.day
      ? new Date(2024, monthDay.month - 1, monthDay.day).toLocaleDateString('en-US', { month:'short', day:'numeric' })
      : 'Date set in parish settings';
    return { id, name, displayDate, feastDate: feastDate.slice(-5), patronal:true, calendar:cal };
  }
  function feastCampaignChoices(cal) {
    const feasts = feastPresetsForCalendar(cal);
    const patronal = patronalFeastCampaignChoice(cal);
    if (!patronal) return feasts;
    const existingIndex = feasts.findIndex((feast) => feast.id === patronal.id);
    if (existingIndex >= 0) {
      feasts[existingIndex] = { ...feasts[existingIndex], patronal:true, feastDate:patronal.feastDate };
      return feasts;
    }
    return [...feasts, patronal];
  }
  function isFeastEnabled(id) { return editableFeastCampaigns.some(f=>f.id===id&&f.enabled!==false); }
  function toggleFeastCampaign(id,checked) {
    const cal=document.getElementById('feastLiturgicalCalendar')?.value||currentParish?.liturgicalCalendar||'julian';
    const feast=feastCampaignChoices(cal).find(f=>f.id===id);
    if(!feast) return;
    editableFeastCampaigns=editableFeastCampaigns.filter(f=>f.id!==id);
    if(checked) editableFeastCampaigns.push({
      id:feast.id,
      name:feast.name,
      enabled:true,
      campaignName:`${feast.name} Alms Campaign`,
      description:`Parish-approved alms connected to ${feast.name}.`,
      destinationFundId:'benevolence-fund',
      ...(feast.patronal ? { patronal:true, feastDate:feast.feastDate } : {})
    });
    renderGivingOptionsEditor();
    setStatus(checked?`${feast.name} enabled. Save when ready.`:`${feast.name} disabled. Save when ready.`,'success');
  }
  function feastDestinationFundOptions(selectedId) {
    const selected = selectedId || 'benevolence-fund';
    return editableFunds
      .filter((fund) => fund && fund.enabled !== false)
      .map((fund) => {
        const id = String(fund.id || fund.code || fund.name || '');
        const name = String(fund.name || fund.id || 'Designated fund');
        return `<option value="${escapeHtml(id)}" ${id===selected?'selected':''}>${escapeHtml(name)}</option>`;
      }).join('');
  }
  function updateFeastCampaignFund(feastId, destinationFundId) {
    const campaign = editableFeastCampaigns.find((item) => item.id === feastId);
    if (!campaign) return;
    campaign.destinationFundId = destinationFundId || 'benevolence-fund';
    const fund = editableFunds.find((item) => [item?.id,item?.code,item?.name].filter(Boolean).map(String).includes(campaign.destinationFundId));
    setStatus(`${campaign.name || 'Feast'} gifts will go to ${fund?.name || 'Benevolence Fund'}. Save when ready.`, 'success');
  }
  function allFeastPresets() {
    const cal = document.getElementById('settingsLiturgicalCalendar')?.value || currentParish?.liturgicalCalendar || 'julian';
    return feastPresetsForCalendar(cal);
  }
  function patronalFeastDisplayName(parish) {
    if (parish?.patronalFeastName) return parish.patronalFeastName;
    const selected = parish?.patronalFeast || '';
    return allFeastPresets().find((feast) => feast.id === selected)?.name || selected;
  }
  function patronalMonthDay(value) {
    const monthDay = String(value || '').slice(-5);
    return /^\d{2}-\d{2}$/.test(monthDay)
      ? { month: Number(monthDay.slice(0, 2)), day: Number(monthDay.slice(3, 5)) }
      : { month: 0, day: 0 };
  }
  function patronalMonthOptions(selected) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const label = new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' });
      return `<option value="${month}" ${month === selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }
  function patronalDayOptions(month, selected) {
    const count = month ? new Date(2024, month, 0).getDate() : 31;
    return Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      return `<option value="${day}" ${day === selected ? 'selected' : ''}>${day}</option>`;
    }).join('');
  }
  function updatePatronalFeastDays(preferredDay) {
    const month = Number(document.getElementById('patronalFeastMonth')?.value || 0);
    const daySelect = document.getElementById('patronalFeastDay');
    if (!daySelect) return;
    const selected = Math.min(Number(preferredDay || daySelect.value || 1), new Date(2024, month, 0).getDate());
    daySelect.innerHTML = patronalDayOptions(month, selected);
  }
  function syncPatronalFeastOptionsFromSettings() {
    const nameInput = document.getElementById('patronalFeastName');
    const monthInput = document.getElementById('patronalFeastMonth');
    const dayInput = document.getElementById('patronalFeastDay');
    if (!nameInput || !monthInput || !dayInput) return;
    const match = allFeastPresets().find((feast) => feast.name === nameInput.value);
    if (match) {
      const parts = patronalMonthDay(match.date);
      if (parts.month) monthInput.value = String(parts.month);
      updatePatronalFeastDays(parts.day);
    }
  }
  function upsertPatronalFeastCampaign(patronalFeastId, calendar, customName = '', customDate = '') {
    if (!patronalFeastId) return;
    const feast = feastPresetsForCalendar(calendar).find(item => item.id === patronalFeastId)
      || feastPresetsForCalendar(calendar === 'julian' ? 'gregorian' : 'julian').find(item => item.id === patronalFeastId)
      || fallbackFeastPresets.find(item => item.id === patronalFeastId)
      || { id: patronalFeastId, name: customName || 'Patronal Feast', date: customDate };
    const existing = editableFeastCampaigns.find(item => item.id === patronalFeastId);
    if (existing) {
      existing.name = customName || feast.name;
      if (existing.enabled == null) existing.enabled = true;
      if (customDate) existing.feastDate = customDate.slice(-5);
      if (!existing.campaignName) existing.campaignName = `${feast.name} Patronal Feast Campaign`;
      if (!existing.description) existing.description = `Parish-approved alms connected to ${feast.name}.`;
      if (!existing.destinationFundId) existing.destinationFundId = 'benevolence-fund';
      existing.patronal = true;
      return;
    }
    editableFeastCampaigns.push({
      id: feast.id,
      name: customName || feast.name,
      enabled: true,
      patronal: true,
      ...(customDate ? { feastDate: customDate.slice(-5) } : {}),
      campaignName: `${feast.name} Patronal Feast Campaign`,
      description: `Parish-approved alms connected to ${feast.name}.`,
      destinationFundId: 'benevolence-fund'
    });
  }
  function renderFeastCampaignSetup() {
    const cal=document.getElementById('feastLiturgicalCalendar')?.value||currentParish?.liturgicalCalendar||'julian';
    const feasts=feastCampaignChoices(cal);
    return `<div class="option-group"><div class="option-group-head"><div><h3 class="option-group-title">Major feast alms campaigns</h3><p class="section-note" style="margin:.25rem 0 0;">Each feast defaults to Benevolence Fund. Choose General Operating or another designated fund when appropriate.</p></div><span class="option-group-count">${editableFeastCampaigns.filter(f=>f.enabled!==false).length} enabled</span></div><div class="option-builder"><div class="option-builder-title">Calendar timing</div><div class="builder-grid"><select id="feastLiturgicalCalendar" onchange="renderGivingOptionsEditor()"><option value="julian" ${cal==='julian'?'selected':''}>Julian</option><option value="gregorian" ${cal==='gregorian'?'selected':''}>Revised-Julian</option></select><p class="section-note" style="margin:0;">AGAPAY computes fixed feasts from this calendar and keeps Pascha-based feasts on the shared Orthodox paschalion. The parish feast day comes from Parish Settings.</p></div></div><div class="option-list"><div class="feast-grid">${feasts.map(feast=>{const campaign=editableFeastCampaigns.find(item=>item.id===feast.id);const enabled=campaign&&campaign.enabled!==false;const destinationFundId=campaign?.destinationFundId||'benevolence-fund';return `<div class="feast-card ${enabled?'enabled':''}"><div><div class="feast-name">${escapeHtml(feast.name)}${feast.patronal?'<span class="feast-patronal-badge">Parish feast day</span>':''}</div><div class="feast-meta">${escapeHtml(calendarLabel(cal))} · ${escapeHtml(feastDateLabel(feast))}</div></div><label class="mini-toggle" aria-label="Toggle ${escapeHtml(feast.name)}"><input type="checkbox" ${enabled?'checked':''} onchange="toggleFeastCampaign('${escapeHtml(feast.id)}',this.checked)"/><span></span></label>${enabled?`<label class="feast-fund-select"><span>Gift destination</span><select onchange="updateFeastCampaignFund('${escapeHtml(feast.id)}',this.value)">${feastDestinationFundOptions(destinationFundId)}</select></label>`:''}</div>`;}).join('')}</div></div></div>`;
  }

  // ── LOAD DASHBOARD ────────────────────────────────────────
  async function loadDashboard(btn) {
    if (dashboardLoadPromise) return dashboardLoadPromise;
    dashboardLoadPromise = loadDashboardInner(btn);
    try {
      return await dashboardLoadPromise;
    } finally {
      dashboardLoadPromise = null;
    }
  }

  async function loadDashboardInner(btn) {
    const parishId = document.getElementById('parishId').value.trim();
    const initialLoad = !currentParish;
    if (!parishId || !document.getElementById('parishToken').value.trim()) {
      if (initialLoad) failDashboardBoot('Your parish session has expired. Please sign in again.');
      setStatus('Enter the parish ID and password.','error');
      return;
    }
    if (initialLoad) {
      setDashboardBootMessage('Preparing your parish workspace', 'Loading your parish, plan, and available tools.');
      document.querySelector('.app')?.setAttribute('aria-busy', 'true');
    } else {
      setDashboardRefreshing(true);
    }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    const loadBtn = document.getElementById('loadBtn');
    if (loadBtn) { loadBtn.classList.add('loading'); loadBtn.disabled = true; }
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId), { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load dashboard');
      currentParish = data.parish;
      await Promise.all([
        refreshSubscriptionStatus({ quiet: true }),
        refreshStripeStatus({ quiet: true }),
        refreshParishLibraryNavigationStatus()
      ]);
      bookstoreCatalogState = { loaded: false, products: [], lowStockProducts: [], countSessions: [], starterCatalog: [] };
      bookstoreLowStockOnly = false;
      saveSession();
      renderDashboard();
      if (initialLoad) finishDashboardBoot();
      syncBookstoreLowStockNavigation();
      setTimeout(() => loadBookstoreLowStockBadge(), 150);
      const googleCalendarResult = new URLSearchParams(window.location.search).get('googleCalendar');
      if (googleCalendarResult) {
        switchTab('sacraments');
        setSacramentsDashboardTab('calendar');
        setStatus(googleCalendarResult === 'connected'
          ? 'Google Calendar connected. Scheduled requests for this priest will now sync automatically.'
          : new URLSearchParams(window.location.search).get('message') || 'Google Calendar could not be connected.',
        googleCalendarResult === 'connected' ? 'success' : 'error');
        window.history.replaceState({}, '', '/parish/dashboard');
      }
      parishFeatureRequests = data.featureRequests || [];
      showParishFeatureRequestPopup(data.featureRequests || []);
      updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
      setTimeout(() => loadGivingSummary(), 250);
      setTimeout(() => loadRecurringHealth(), 500);
      setTimeout(async () => { await renderQrCode(); }, 750);
      setTimeout(() => loadCommemorations(), 1000);
      if (['history', 'givers', 'options'].includes(activeTab)) {
        loadGivingHistory();
      } else {
        setTimeout(() => loadGivingHistory(), 1250);
      }
      stewardshipState.loaded = false;
      if (activeTab === 'stewardship') loadStewardshipPanel(true);
      if (activeTab === 'reconcile') loadReconciliation();
    } catch (err) {
      if (initialLoad) failDashboardBoot(err.message);
      setStatus(err.message,'error');
    }
    finally {
      if (!initialLoad) setDashboardRefreshing(false);
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      if (loadBtn) { loadBtn.classList.remove('loading'); loadBtn.disabled = false; }
    }
  }

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
      if (!options || !options.quiet) setStatus(err.message, 'error');
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
      if (!options || !options.quiet) setStatus(err.message, 'error');
    }
  }
  function communityTypeKey(parish) { const raw=`${parish?.communityType||''} ${parish?.parishName||''}`.toLowerCase(); if(raw.includes('monastery')||raw.includes('skete')) return 'monastery'; if(raw.includes('mission')) return 'mission'; return 'parish'; }
  function communityMarkIcon(parish) {
    const type=communityTypeKey(parish);
    if(type==='monastery') return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><rect x="4" y="14" width="30" height="18" rx="1"/><rect x="14" y="6" width="10" height="14" rx="1"/><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M15 32 L15 25 Q19 21 23 25 L23 32"/><rect x="7" y="18" width="5" height="6" rx="2.5"/><rect x="26" y="18" width="5" height="6" rx="2.5"/></svg>';
    if(type==='mission')  return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="6"/><line x1="16.5" y1="3.5" x2="21.5" y2="3.5"/><line x1="16" y1="5.5" x2="22" y2="5.5"/><path d="M19 6 C10 10 8 17 11 22 C13 26 16 27 19 27 C22 27 25 26 27 22 C30 17 28 10 19 6Z"/><line x1="12" y1="27" x2="26" y2="27"/><line x1="13" y1="29" x2="25" y2="29"/></svg>';
    return '<svg viewBox="0 0 38 38" fill="none" aria-hidden="true"><line x1="19" y1="2" x2="19" y2="5"/><line x1="17" y1="3.5" x2="21" y2="3.5"/><path d="M19 5 C15 7 13 11 14 14 C15 16 17 17 19 17 C21 17 23 16 24 14 C25 11 23 7 19 5Z"/><line x1="10" y1="6" x2="10" y2="8"/><path d="M10 8 C8 9.5 7 12 7.5 14 C8 15.5 9 16 10 16 C11 16 12 15.5 12.5 14 C13 12 12 9.5 10 8Z"/><line x1="28" y1="6" x2="28" y2="8"/><path d="M28 8 C26 9.5 25 12 25.5 14 C26 15.5 27 16 28 16 C29 16 30 15.5 30.5 14 C31 12 30 9.5 28 8Z"/><rect x="4" y="17" width="30" height="14" rx="1"/><path d="M16 31 L16 25 Q19 22 22 25 L22 31"/></svg>';
  }
  const treasurerAffirmationCopy = {
    stripeAccount: 'The connected Stripe account belongs to this parish.',
    payoutBank: 'The payout bank account shown in Stripe is correct.',
    organizationName: 'The public and legal organization names are correct.',
    generalFund: 'The General Operating Fund is correct.',
    designatedFunds: 'The designated funds and campaigns are correct.',
    recurringGiving: 'Recurring giving is enabled or disabled as intended.',
    receiptDetails: 'The receipt name and contact details are correct.',
    agapayPlan: 'The selected AGAPAY plan is correct.'
  };
  function onboardingSignoffMarkup(workflow) {
    const summary = workflow.summary || {};
    const org = summary.organization || {};
    const stripe = summary.stripe || {};
    const plan = summary.plan || {};
    const giving = summary.giving || {};
    const receipt = summary.receipt || {};
    const stripeCheckedAt = workflow.stripe?.checkedAt ? new Date(workflow.stripe.checkedAt).toLocaleString() : 'not refreshed';
    const designated = [...(giving.designatedFunds || []), ...(giving.campaigns || []), ...(giving.feastCampaigns || [])];
    const general = (giving.generalFunds || [])[0];
    const bankLabel = stripe.payoutBankName
      ? `${stripe.payoutBankName}${stripe.payoutBankLast4 ? ` ending ${stripe.payoutBankLast4}` : ''}`
      : 'Confirm the payout bank directly in Stripe';
    const rows = [
      ['Organization', org.publicName || 'Not set', org.legalReceiptName && org.legalReceiptName !== org.publicName ? `Receipt name: ${org.legalReceiptName}` : 'Public and receipt names match'],
      ['Stripe account', stripe.accountId || 'Not connected', `Charges ${stripe.chargesEnabled ? 'enabled' : 'blocked'} · payouts ${stripe.payoutsEnabled ? 'enabled' : 'blocked'} · refreshed ${stripeCheckedAt}`],
      ['Payout bank', bankLabel, 'Bank details remain visible in Stripe only'],
      ['General fund', general?.name || 'Not configured', general?.accountNumber ? `Account ${general.accountNumber}` : 'Unrestricted operating fund'],
      ['Designated giving', `${designated.length} active item${designated.length === 1 ? '' : 's'}`, designated.map(item => item.name).filter(Boolean).join(', ') || 'No designated funds or campaigns'],
      ['Recurring giving', giving.recurringGivingEnabled ? 'Enabled' : 'Disabled', 'Parish-selected setting'],
      ['Receipt', receipt.legalName || org.publicName || 'Not set', receipt.contact || 'No contact configured'],
      ['AGAPAY plan', plan.label || plan.id || 'Not selected', plan.status || 'Status unavailable']
    ];
    return `<div class="treasurer-signoff" id="treasurerSignoff">
      <div class="treasurer-signoff-head"><div><span>Required final approval</span><h3>Treasurer go-live signoff</h3><p>Review the frozen configuration below. All eight affirmations are recorded with the signer and timestamp.</p></div><span class="onboarding-snapshot">Snapshot ${escapeHtml(String(workflow.materialVersion || '').slice(0, 10))}</span></div>
      <div class="signoff-summary">${rows.map(([label, value, detail]) => `<div class="signoff-summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`).join('')}</div>
      <div class="signoff-affirmations">${Object.entries(treasurerAffirmationCopy).map(([key, label]) => `<label><input class="treasurer-affirmation" type="checkbox" data-key="${key}"><span>${escapeHtml(label)}</span></label>`).join('')}</div>
      <div class="signoff-identity">
        <div><label for="goLiveSignerName">Treasurer name</label><input id="goLiveSignerName" autocomplete="name" placeholder="Full legal name"></div>
        <div><label for="goLiveSignerTitle">Title</label><input id="goLiveSignerTitle" value="Parish Treasurer" autocomplete="organization-title"></div>
        <div><label for="goLiveSignerEmail">Treasurer email on file</label><input id="goLiveSignerEmail" type="email" value="${escapeHtml(summary.treasurerEmail || '')}" readonly aria-describedby="goLiveSignerEmailNote"><small id="goLiveSignerEmailNote">This email will be recorded with the signoff. No separate treasurer login is required.</small></div>
      </div>
      <label class="signoff-authority"><input id="goLiveAuthority" type="checkbox"><span>I am authorized to approve online giving for this parish.</span></label>
      <div class="signoff-submit"><p id="goLiveError" role="alert"></p><button class="btn btn-gold" type="button" onclick="submitTreasurerGoLive(this)">Go Live</button></div>
    </div>`;
  }
  function renderSimpleParishSetupWizard(workflow) {
    const pane = document.getElementById('setupWizardPane');
    if (!pane) return;
    const live = workflow.state === 'LIVE';
    const givingUrl = workflow.summary?.givingUrl || `/give/${encodeURIComponent(currentParish.parishId || '')}`;
    const stages = workflow.parishStages || [
      { key:'access', title:'Accept access', detail:'Create your personal password.', passed:true },
      { key:'payments', title:'Connect payments', detail:'Choose a plan and connect Stripe.', passed:Boolean(workflow.stripe?.ready) },
      { key:'launch', title:'Review and launch', detail:'Confirm the parish details and approve launch.', passed:live }
    ];
    const stageMarkup = stages.map((stage, index) => {
      const current = !stage.passed && stages.slice(0, index).every((item) => item.passed);
      return `<div class="parish-setup-stage ${stage.passed ? 'done' : current ? 'current' : 'later'}"><span>${stage.passed ? '&#10003;' : index + 1}</span><div><strong>${escapeHtml(stage.title)}</strong><small>${escapeHtml(stage.detail || '')}</small></div><em>${stage.passed ? 'Complete' : current ? 'Now' : 'Next'}</em></div>`;
    }).join('');
    const blockerKeys = new Set((workflow.blockers || []).map((item) => item.key));
    const needsPlan = blockerKeys.has('subscription');
    const needsStripe = blockerKeys.has('stripeConnected') || blockerKeys.has('stripeReady');
    const needsGivingReview = ['generalFund','givingConfiguration','importDecision'].some((key) => blockerKeys.has(key));
    const action = live
      ? `<div class="onboarding-live-mark" aria-hidden="true">&#10003;</div><strong>Giving is live</strong><p class="setup-copy setup-action-copy">Your giving page and QR code are ready to share.</p><a class="btn btn-gold onboarding-link-button" href="${escapeHtml(givingUrl)}" target="_blank" rel="noopener">Open giving page</a>`
      : workflow.canGoLive
        ? `<strong>Review and launch</strong><p class="setup-copy setup-action-copy">Everything is ready. The treasurer reviews the parish details once and approves giving.</p><button class="btn btn-gold" type="button" onclick="document.getElementById('treasurerSignoff')?.scrollIntoView({behavior:'smooth',block:'start'})">Review and launch</button>`
        : needsPlan
          ? `<strong>Choose your AGAPAY plan</strong><p class="setup-copy setup-action-copy">Confirm the plan your parish selected. Stripe opens immediately after billing is ready.</p><button class="btn btn-gold" type="button" onclick="switchTab('settings')">Choose plan</button>`
          : needsStripe
            ? `<strong>${workflow.stripe?.connected ? 'Finish connecting Stripe' : 'Connect the parish Stripe account'}</strong><p class="setup-copy setup-action-copy">Stripe securely collects the parish and payout-bank details. AGAPAY never sees the full bank account number.</p>${workflow.stripe?.connected ? '<button class="btn btn-gold" type="button" onclick="refreshStripeStatus({force:true})">Check Stripe status</button>' : '<button class="btn btn-gold" type="button" onclick="startStripeOnboarding(this)">Connect Stripe</button>'}`
            : needsGivingReview
              ? `<strong>Review the giving setup</strong><p class="setup-copy setup-action-copy">A short wizard will show only the giving choices included with ${escapeHtml(currentParish.subscriptionTierLabel || 'your plan')}.</p><button class="btn btn-gold" type="button" onclick="openGivingSetupWizard()">Review giving setup</button>`
              : `<strong>AGAPAY is preparing your setup</strong><p class="setup-copy setup-action-copy">Your onboarding team is finishing an internal verification. There is nothing else for the parish to complete right now.</p>`;
    pane.innerHTML = `<div class="setup-wizard-card deterministic-onboarding parish-simple-setup"><div class="setup-wizard-body"><div><div class="onboarding-kicker">10-minute parish setup</div><div class="setup-title">Three steps to start giving</div><p class="setup-copy">${live ? 'Launch is complete.' : 'AGAPAY handles the internal checks. Your parish only completes the three steps below.'}</p><div class="parish-setup-stages">${stageMarkup}</div></div><div class="setup-action-panel">${action}</div></div>${workflow.canGoLive ? onboardingSignoffMarkup(workflow) : ''}</div>`;
  }

  function renderDeterministicOnboardingWizard(workflow) {
    renderSimpleParishSetupWizard(workflow);
  }

  let givingSetupWizardStep = 0;
  let givingSetupDraft = null;

  function givingSetupTierDetails() {
    const tier = String(currentParish?.subscriptionTier || 'starter').toLowerCase();
    const label = currentParish?.subscriptionTierLabel || (tier === 'starter' ? 'Give' : 'Give +');
    const givingPlus = hasGivingPlusAccess();
    const featureCopy = tier === 'starter'
      ? 'General Operating, one designated fund, candles, and recurring giving'
      : tier === 'stewardship'
        ? 'Unlimited funds and campaigns, recurring giving, donor tools, and Stewardship Health'
        : ['parish', 'diocese'].includes(tier)
          ? 'Unlimited funds and campaigns, recurring giving, stewardship, and the complete parish operations suite'
          : 'Unlimited funds and campaigns, recurring giving, receipts, and enhanced giving reports';
    return { tier, label, givingPlus, designatedLimit: givingPlus ? Infinity : 1, featureCopy };
  }

  function activeGivingSetupItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => item && item.enabled !== false && item.active !== false);
  }

  function buildGivingSetupDraft() {
    const activeFunds = activeGivingSetupItems(editableFunds.length ? editableFunds : fallbackFundsArray(currentParish?.funds));
    const savedGeneral = activeFunds.find(isGeneralDashboardFund) || fundPresets.general;
    return {
      general: {
        ...savedGeneral,
        id: 'general',
        name: savedGeneral.name || 'General Operating Fund',
        description: savedGeneral.description || fundPresets.general.description
      },
      designatedFunds: activeFunds.filter((fund) => !isGeneralDashboardFund(fund) && !isCandleDashboardFund(fund)).map((fund) => ({ ...fund })),
      campaigns: activeGivingSetupItems(editableCampaigns.length ? editableCampaigns : currentParish?.campaigns).map((campaign) => ({ ...campaign })),
      recurringGivingEnabled: currentParish?.recurringGivingEnabled !== false,
      candlesEnabled: currentParish?.candlesEnabled !== false,
      importDecision: /requested help importing/i.test(currentParish?.onboarding?.checks?.importDecision?.note || '') ? 'requested' : 'none'
    };
  }

  function closeGivingSetupWizard() {
    document.getElementById('givingSetupModal')?.remove();
    document.body.classList.remove('giving-setup-modal-open');
    givingSetupDraft = null;
    givingSetupWizardStep = 0;
  }

  function captureGivingSetupWizardStep() {
    if (!givingSetupDraft) return;
    if (givingSetupWizardStep === 0) {
      givingSetupDraft.general.name = document.getElementById('givingSetupGeneralName')?.value.trim() || '';
      givingSetupDraft.general.description = document.getElementById('givingSetupGeneralDescription')?.value.trim() || '';
      givingSetupDraft.recurringGivingEnabled = Boolean(document.getElementById('givingSetupRecurring')?.checked);
      givingSetupDraft.candlesEnabled = Boolean(document.getElementById('givingSetupCandles')?.checked);
    }
    if (givingSetupWizardStep === 2) {
      givingSetupDraft.importDecision = document.querySelector('input[name="givingSetupImportDecision"]:checked')?.value || 'none';
    }
  }

  function givingSetupChoiceRows(items, kind) {
    const label = kind === 'fund' ? 'designated fund' : 'campaign';
    if (!items.length) return `<div class="giving-setup-empty">No ${label}s selected. That is okay—you can add them later.</div>`;
    return `<div class="giving-setup-selected">${items.map((item, index) => `<div class="giving-setup-selected-row"><span><strong>${escapeHtml(item.name || 'Giving option')}</strong><small>${escapeHtml(item.description || (kind === 'fund' ? 'Parish-designated giving destination' : 'Time-limited parish campaign'))}</small></span><button type="button" aria-label="Remove ${escapeHtml(item.name || label)}" onclick="removeGivingSetupChoice('${kind}',${index})">Remove</button></div>`).join('')}</div>`;
  }

  function givingSetupPresetButtons(kind) {
    const source = kind === 'fund' ? fundPresets : campaignPresets;
    const selected = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
    const entries = Object.entries(source).filter(([key]) => kind !== 'fund' || key !== 'general').slice(0, kind === 'fund' ? 6 : 4);
    return `<div class="giving-setup-presets">${entries.map(([key, preset]) => {
      const alreadyAdded = selected.some((item) => item.id === preset.id || String(item.name || '').toLowerCase() === preset.name.toLowerCase());
      return `<button type="button" class="giving-setup-preset ${alreadyAdded ? 'is-selected' : ''}" ${alreadyAdded ? 'disabled' : ''} onclick="addGivingSetupPreset('${kind}','${key}')"><strong>${alreadyAdded ? '&#10003; ' : '+ '}${escapeHtml(preset.name)}</strong><small>${escapeHtml(preset.description)}</small></button>`;
    }).join('')}</div>`;
  }

  function givingSetupBasicsMarkup(tier) {
    return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 1 of 3</span><h3>Set the giving basics</h3><p>These are the choices every parish needs before accepting a gift.</p></div>
      <div class="giving-setup-field"><label for="givingSetupGeneralName">Primary giving destination</label><input id="givingSetupGeneralName" maxlength="120" value="${escapeAttr(givingSetupDraft.general.name)}"><small>AGAPAY keeps the stable General Operating Fund identifier behind the scenes for reports and accounting.</small></div>
      <div class="giving-setup-field"><label for="givingSetupGeneralDescription">What this fund supports</label><textarea id="givingSetupGeneralDescription" maxlength="500">${escapeHtml(givingSetupDraft.general.description)}</textarea></div>
      <div class="giving-setup-toggle-grid">
        <label class="giving-setup-toggle"><input id="givingSetupRecurring" type="checkbox" ${givingSetupDraft.recurringGivingEnabled ? 'checked' : ''}><span><strong>Allow recurring gifts</strong><small>Donors can give weekly, monthly, quarterly, or annually.</small></span></label>
        <label class="giving-setup-toggle"><input id="givingSetupCandles" type="checkbox" ${givingSetupDraft.candlesEnabled ? 'checked' : ''}><span><strong>Accept candle offerings</strong><small>Keep the built-in candles and vigil lights giving choice.</small></span></label>
      </div>
      <div class="giving-setup-plan-note"><strong>${escapeHtml(tier.label)} includes</strong><span>${escapeHtml(tier.featureCopy)}</span></div>
    </div>`;
  }

  function givingSetupChoicesMarkup(tier) {
    const fundLimit = Number.isFinite(tier.designatedLimit) ? `Choose up to ${tier.designatedLimit}` : 'Choose any that apply';
    return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 2 of 3</span><h3>Choose giving destinations</h3><p>${escapeHtml(fundLimit)}. Start small—these can always be changed later.</p></div>
      <section class="giving-setup-choice-section"><div class="giving-setup-choice-head"><div><strong>Designated funds</strong><small>${tier.givingPlus ? 'Your plan supports unlimited active designated funds.' : 'Give supports one active designated fund.'}</small></div><em>${givingSetupDraft.designatedFunds.length}${Number.isFinite(tier.designatedLimit) ? ` / ${tier.designatedLimit}` : ''} selected</em></div>${givingSetupChoiceRows(givingSetupDraft.designatedFunds, 'fund')}${givingSetupPresetButtons('fund')}<div class="giving-setup-custom"><input id="givingSetupCustomFund" maxlength="120" placeholder="Or name a different fund"><button type="button" onclick="addGivingSetupCustom('fund')">Add fund</button></div></section>
      ${tier.givingPlus ? `<section class="giving-setup-choice-section"><div class="giving-setup-choice-head"><div><strong>Launch campaigns</strong><small>Optional, time-limited needs. Skip this if there is no current campaign.</small></div><em>${givingSetupDraft.campaigns.length} selected</em></div>${givingSetupChoiceRows(givingSetupDraft.campaigns, 'campaign')}${givingSetupPresetButtons('campaign')}<div class="giving-setup-custom"><input id="givingSetupCustomCampaign" maxlength="120" placeholder="Or name a current campaign"><button type="button" onclick="addGivingSetupCustom('campaign')">Add campaign</button></div></section>` : '<div class="giving-setup-upgrade-note"><strong>Campaigns are not part of Give.</strong><span>You can launch now with General Operating, one designated fund, and candles. Upgrade later if the parish needs campaigns.</span></div>'}
    </div>`;
  }

  function givingSetupReviewMarkup(tier) {
    const rows = [
      ['AGAPAY plan', tier.label],
      ['Primary fund', givingSetupDraft.general.name || 'General Operating Fund'],
      ['Designated funds', givingSetupDraft.designatedFunds.length ? givingSetupDraft.designatedFunds.map((item) => item.name).join(', ') : 'None for launch'],
      ...(tier.givingPlus ? [['Campaigns', givingSetupDraft.campaigns.length ? givingSetupDraft.campaigns.map((item) => item.name).join(', ') : 'None for launch']] : []),
      ['Recurring giving', givingSetupDraft.recurringGivingEnabled ? 'Enabled' : 'Disabled'],
      ['Candle offerings', givingSetupDraft.candlesEnabled ? 'Enabled' : 'Disabled'],
      ['Existing donor records', givingSetupDraft.importDecision === 'requested' ? 'Ask AGAPAY about an import' : 'Launch without an import']
    ];
    return `<div class="giving-setup-screen">
      <div class="giving-setup-screen-heading"><span>Step 3 of 3</span><h3>Review and save</h3><p>This is what donors will see at launch. Saving sends the setup to AGAPAY for the final launch review.</p></div>
      <div class="giving-setup-review">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      <fieldset class="giving-setup-import"><legend>Do you need help importing existing donors or pledges?</legend><label><input type="radio" name="givingSetupImportDecision" value="none" ${givingSetupDraft.importDecision !== 'requested' ? 'checked' : ''}><span><strong>No, launch without an import</strong><small>You can request an import later.</small></span></label><label><input type="radio" name="givingSetupImportDecision" value="requested" ${givingSetupDraft.importDecision === 'requested' ? 'checked' : ''}><span><strong>Yes, contact me about an import</strong><small>This records the request without holding up the ten-minute setup.</small></span></label></fieldset>
      <div class="giving-setup-ready"><span aria-hidden="true">&#10003;</span><div><strong>Ready to save</strong><small>You can reopen this wizard or use Funds &amp; Alms to make changes before launch.</small></div></div>
      <div class="giving-setup-save-status" id="givingSetupSaveStatus" role="status" aria-live="polite"></div>
    </div>`;
  }

  function renderGivingSetupWizard() {
    const modal = document.getElementById('givingSetupModal');
    if (!modal || !givingSetupDraft) return;
    const tier = givingSetupTierDetails();
    const screen = givingSetupWizardStep === 0
      ? givingSetupBasicsMarkup(tier)
      : givingSetupWizardStep === 1
        ? givingSetupChoicesMarkup(tier)
        : givingSetupReviewMarkup(tier);
    modal.innerHTML = `<div class="giving-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="givingSetupTitle">
      <header class="giving-setup-dialog-head"><div><span class="giving-setup-tier">${escapeHtml(tier.label)} setup</span><h2 id="givingSetupTitle">Review giving setup</h2></div><button type="button" class="giving-setup-close" aria-label="Close giving setup" onclick="closeGivingSetupWizard()">&times;</button></header>
      <div class="giving-setup-progress" aria-label="Giving setup progress">${[0,1,2].map((step) => `<span class="${step < givingSetupWizardStep ? 'done' : step === givingSetupWizardStep ? 'current' : ''}"><i>${step < givingSetupWizardStep ? '&#10003;' : step + 1}</i>${['Basics','Destinations','Review'][step]}</span>`).join('')}</div>
      <div class="giving-setup-dialog-body">${screen}</div>
      <footer class="giving-setup-dialog-actions"><button type="button" class="btn btn-ghost" onclick="${givingSetupWizardStep ? 'setGivingSetupWizardStep(' + (givingSetupWizardStep - 1) + ')' : 'closeGivingSetupWizard()'}">${givingSetupWizardStep ? 'Back' : 'Cancel'}</button>${givingSetupWizardStep < 2 ? `<button type="button" class="btn btn-gold" onclick="setGivingSetupWizardStep(${givingSetupWizardStep + 1})">Continue</button>` : '<button type="button" class="btn btn-gold" onclick="saveGivingSetupWizard(this)">Save giving setup</button>'}</footer>
    </div>`;
  }

  function openGivingSetupWizard() {
    document.getElementById('givingSetupModal')?.remove();
    givingSetupDraft = buildGivingSetupDraft();
    givingSetupWizardStep = 0;
    const modal = document.createElement('div');
    modal.id = 'givingSetupModal';
    modal.className = 'giving-setup-modal';
    document.body.appendChild(modal);
    document.body.classList.add('giving-setup-modal-open');
    renderGivingSetupWizard();
    setTimeout(() => document.getElementById('givingSetupGeneralName')?.focus(), 0);
  }

  function setGivingSetupWizardStep(step) {
    captureGivingSetupWizardStep();
    if (!givingSetupDraft.general.name) {
      setStatus('Enter the primary giving destination before continuing.', 'error');
      document.getElementById('givingSetupGeneralName')?.focus();
      return;
    }
    givingSetupWizardStep = Math.max(0, Math.min(2, Number(step) || 0));
    renderGivingSetupWizard();
  }

  function addGivingSetupPreset(kind, key) {
    if (!givingSetupDraft) return;
    const tier = givingSetupTierDetails();
    const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
    if (kind === 'campaign' && !tier.givingPlus) return;
    if (kind === 'fund' && target.length >= tier.designatedLimit) {
      setStatus(`${tier.label} supports one active designated fund. Remove the current choice to select another.`, 'error');
      return;
    }
    const preset = (kind === 'fund' ? fundPresets : campaignPresets)[key];
    if (!preset || target.some((item) => item.id === preset.id)) return;
    target.push({ ...preset, enabled:true, active:true, donorVisible:true, givingEnabled:true, restrictionType:preset.restrictionType || (kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted') });
    renderGivingSetupWizard();
  }

  function addGivingSetupCustom(kind) {
    if (!givingSetupDraft) return;
    const tier = givingSetupTierDetails();
    const input = document.getElementById(kind === 'fund' ? 'givingSetupCustomFund' : 'givingSetupCustomCampaign');
    const name = input?.value.trim() || '';
    if (!name) { setStatus(`Enter a ${kind === 'fund' ? 'fund' : 'campaign'} name first.`, 'error'); return; }
    const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
    if (kind === 'campaign' && !tier.givingPlus) return;
    if (kind === 'fund' && target.length >= tier.designatedLimit) {
      setStatus(`${tier.label} supports one active designated fund. Remove the current choice to add another.`, 'error');
      return;
    }
    if (target.some((item) => String(item.name || '').toLowerCase() === name.toLowerCase())) { setStatus('That giving destination is already selected.', 'error'); return; }
    target.push({ id:slugifyLocal(name), name, description:kind === 'fund' ? 'Designated support for this parish.' : 'Parish-approved alms for this need.', enabled:true, active:true, donorVisible:true, givingEnabled:true, restrictionType:kind === 'campaign' ? 'donor_restricted_temporary' : 'unrestricted' });
    renderGivingSetupWizard();
  }

  function removeGivingSetupChoice(kind, index) {
    if (!givingSetupDraft) return;
    const target = kind === 'fund' ? givingSetupDraft.designatedFunds : givingSetupDraft.campaigns;
    target.splice(Number(index), 1);
    renderGivingSetupWizard();
  }

  async function saveGivingSetupWizard(button) {
    if (!currentParish || !givingSetupDraft) return;
    captureGivingSetupWizardStep();
    const general = {
      ...givingSetupDraft.general,
      id:'general', code:givingSetupDraft.general.code || 'general', reportCode:givingSetupDraft.general.reportCode || 'general',
      name:givingSetupDraft.general.name || 'General Operating Fund', description:givingSetupDraft.general.description || fundPresets.general.description,
      restrictionType:'unrestricted', isDefault:true, enabled:true, active:true, donorVisible:true, givingEnabled:true
    };
    const selectedFundIds = new Set(givingSetupDraft.designatedFunds.map((fund) => String(fund.id || fund.name || '').toLowerCase()));
    const selectedCampaignIds = new Set(givingSetupDraft.campaigns.map((campaign) => String(campaign.id || campaign.name || '').toLowerCase()));
    const inactiveFunds = editableFunds.filter((fund) => fund && !isGeneralDashboardFund(fund) && !isCandleDashboardFund(fund) && (fund.enabled === false || fund.active === false) && !selectedFundIds.has(String(fund.id || fund.name || '').toLowerCase()));
    const candleFunds = editableFunds.filter(isCandleDashboardFund);
    const inactiveCampaigns = editableCampaigns.filter((campaign) => campaign && (campaign.enabled === false || campaign.active === false) && !selectedCampaignIds.has(String(campaign.id || campaign.name || '').toLowerCase()));
    editableFunds = [general, ...givingSetupDraft.designatedFunds, ...candleFunds, ...inactiveFunds];
    if (hasGivingPlusAccess()) editableCampaigns = [...givingSetupDraft.campaigns, ...inactiveCampaigns];
    const recurring = document.getElementById('recurringGivingEnabled');
    const candles = document.getElementById('candlesEnabled');
    if (recurring) recurring.checked = givingSetupDraft.recurringGivingEnabled;
    if (candles) candles.checked = givingSetupDraft.candlesEnabled;
    const body = {
      funds: editableFunds,
      recurringGivingEnabled: givingSetupDraft.recurringGivingEnabled,
      candlesEnabled: givingSetupDraft.candlesEnabled,
      givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
      accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline,
      givingSetupReviewed: true,
      importDecision: givingSetupDraft.importDecision === 'requested' ? 'requested' : 'none',
      ...(hasGivingPlusAccess() ? { campaigns: editableCampaigns } : {})
    };
    const saveStatus = document.getElementById('givingSetupSaveStatus');
    if (saveStatus) { saveStatus.className = 'giving-setup-save-status visible'; saveStatus.textContent = 'Saving your giving setup\u2026'; }
    if (button) { button.classList.add('loading'); button.disabled = true; button.textContent = 'Saving\u2026'; }
    try {
      const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), { method:'PATCH', headers:{ ...authHeaders(), 'Content-Type':'application/json' }, body:JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || data.detail || 'Unable to save the giving setup.');
      closeGivingSetupWizard();
      await loadDashboard();
      setStatus('Giving setup saved. AGAPAY can now complete the final launch review.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
      if (saveStatus?.isConnected) { saveStatus.className = 'giving-setup-save-status visible error'; saveStatus.textContent = error.message || 'Unable to save the giving setup.'; }
      if (button?.isConnected) { button.classList.remove('loading'); button.disabled = false; button.textContent = 'Save giving setup'; }
    }
  }
  async function submitTreasurerGoLive(button) {
    const workflow = currentParish?.onboarding;
    const errorEl = document.getElementById('goLiveError');
    if (!workflow?.canGoLive) return;
    const affirmations = {};
    document.querySelectorAll('.treasurer-affirmation').forEach((input) => { affirmations[input.dataset.key] = input.checked; });
    const body = {
      snapshotVersion: workflow.materialVersion,
      affirmations,
      signerName: document.getElementById('goLiveSignerName')?.value || '',
      signerTitle: document.getElementById('goLiveSignerTitle')?.value || '',
      authorityConfirmed: Boolean(document.getElementById('goLiveAuthority')?.checked)
    };
    if (errorEl) errorEl.textContent = '';
    button.disabled = true;
    button.textContent = 'Publishing…';
    try {
      const res = await fetch(`/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/onboarding`, { method:'POST', headers:{ ...authHeaders(), 'Accept':'application/json', 'Content-Type':'application/json' }, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok && data.code === 'onboarding_snapshot_changed' && data.onboarding) {
        if (data.parish) currentParish = { ...currentParish, ...data.parish };
        currentParish.onboarding = data.onboarding;
        renderDashboard();
        const signerName = document.getElementById('goLiveSignerName');
        const signerTitle = document.getElementById('goLiveSignerTitle');
        if (signerName) signerName.value = body.signerName;
        if (signerTitle) signerTitle.value = body.signerTitle;
        const refreshedError = document.getElementById('goLiveError');
        const refreshMessage = 'Stripe was refreshed and the current launch summary is shown below. Review it, check the confirmations again, and click Go Live.';
        if (refreshedError) refreshedError.textContent = refreshMessage;
        document.getElementById('treasurerSignoff')?.scrollIntoView({ behavior:'smooth', block:'start' });
        setStatus(refreshMessage, 'info');
        return;
      }
      if (!res.ok) throw new Error(data.error || data.errors?.[0] || 'Unable to complete go-live signoff');
      if (data.parish) currentParish = { ...currentParish, ...data.parish };
      if (data.onboarding) currentParish.onboarding = data.onboarding;
      renderDashboard();
      setStatus('Treasurer signoff recorded. The parish giving page is live.', 'success');
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      setStatus(err.message, 'error');
      button.disabled = false;
      button.textContent = 'Go Live';
    }
  }
  function renderSetupWizard() {
    const pane=document.getElementById('setupWizardPane'); if(!pane||!currentParish) return;
    if(currentParish.onboarding?.enabled){
      if(currentParish.onboarding.state==='LIVE'){
        const credentialStep=(currentParish.onboarding.steps||[]).find((step)=>step.key==='credential');
        const paidTreasurerAccessNeeded=String(currentParish.subscriptionStatus||'').toLowerCase()==='active' && credentialStep && !credentialStep.passed;
        pane.innerHTML=paidTreasurerAccessNeeded ? `<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="onboarding-kicker">Paid account security</div><div class="setup-title">Treasurer access needs one final step</div><p class="setup-copy">Your giving page remains live. We sent the treasurer an individual access link now that the parish subscription is paid.</p></div><div class="setup-action-panel"><strong>Check the treasurer email</strong><p class="setup-copy setup-action-copy">The treasurer creates a personal password once. Trial setup and Go Live never require this second login.</p></div></div></div>` : '';
        return;
      }
      renderDeterministicOnboardingWizard(currentParish.onboarding);return;
    }
    const setup=currentParish.setup||{}; const stripeDone=Boolean(setup.stripeConnected); const billingDone=Boolean(setup.billingActive);
    if(stripeDone&&billingDone){pane.innerHTML='';return;}
    const tierOptions=tierOptionsMarkup(currentParish.subscriptionTier);
    const demoEligible=Boolean(currentParish.subscriptionIntroDemoEligible);
    const pendingDemo=currentParish.subscriptionStatus==='trial_checkout_created';
    const freeDemoPath=demoEligible||pendingDemo;
    pane.innerHTML=`<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="setup-title">${freeDemoPath?'First-time setup':'Continue with AGAPAY'}</div><p class="setup-copy">${freeDemoPath?'Start with a free 30-day AGAPAY demo, then connect Stripe so the parish can receive gifts.':'Your free demo has ended. Choose a tier and add billing information to restore subscription access.'}</p><div class="setup-steps"><div class="setup-step done">${setupCheckMarkup()}<div><strong>1. Contact info verified</strong><span>Your canonical parish registration has been verified.</span></div></div><div class="setup-step done">${setupCheckMarkup()}<div><strong>2. Choose your ${freeDemoPath?'demo ':''}tier</strong><span>${escapeHtml(currentParish.subscriptionTierLabel || currentParish.subscriptionTier || 'Your selected tier')} determines which tools are available.</span></div></div><div class="setup-step ${billingDone?'done':''}">${setupCheckMarkup()}<div><strong>3. ${freeDemoPath?'Start the free demo':'Activate the subscription'}</strong><span>${billingDone?'Your free demo is active. No card was required.':pendingDemo?'Finish the no-card demo confirmation to activate AGAPAY.':demoEligible?'Confirm the free 30-day demo. No card is required.':'Add billing information to continue with the selected tier.'}</span></div></div><div class="setup-step ${stripeDone?'done':''}">${setupCheckMarkup()}<div><strong>4. Connect Stripe for donations</strong><span>${stripeDone?'Stripe is connected for parish giving.':billingDone?'Connect the parish payout account. This is separate from AGAPAY billing.':freeDemoPath?'Donation setup unlocks after the demo begins.':'Donation setup remains separate from the AGAPAY subscription.'}</span></div></div></div></div><div class="setup-action-panel">${billingDone?'':`<label for="setupSubscriptionTier">AGAPAY ${freeDemoPath?'demo ':''}tier</label><select id="setupSubscriptionTier" onchange="syncParishHouseholdPricing('setupSubscriptionTier','setupParishHouseholdBand','setupParishHouseholdBandGroup','setupParishHouseholdPrice')">${tierOptions}</select>${parishHouseholdPickerMarkup({tierSelectId:'setupSubscriptionTier',bandSelectId:'setupParishHouseholdBand',groupId:'setupParishHouseholdBandGroup',summaryId:'setupParishHouseholdPrice'})}<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startSubscriptionCheckout(this)">${pendingDemo?'Continue demo setup':demoEligible?'Start free 30-day demo':'Activate subscription'}</button><p class="setup-copy setup-action-copy">${freeDemoPath?'No card required. You will add billing information only if you choose to continue after the demo.':'Secure checkout collects the billing information needed to reactivate AGAPAY.'}</p>`}${billingDone&&!stripeDone?'<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startStripeOnboarding(this)">Connect Stripe for donations</button><p class="setup-copy setup-action-copy">This asks for parish payout and organization details—not payment for AGAPAY.</p>':''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">${freeDemoPath?'Open free demo setup':'Open subscription setup'}</a><p id="setupLinkHelp"></p></div></div></div></div>`;
    if (!billingDone) syncParishHouseholdPricing('setupSubscriptionTier','setupParishHouseholdBand','setupParishHouseholdBandGroup','setupParishHouseholdPrice');
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
    const overviewStatus = document.getElementById('overviewGivingStatus');
    const overviewStatusNote = document.getElementById('overviewGivingStatusNote');
    const overviewStripe = document.getElementById('overviewStripeStatus');
    const overviewFunds = document.getElementById('overviewFundsCount');
    const overviewCampaigns = document.getElementById('overviewCampaignsCount');
    if (overviewStatus) overviewStatus.textContent = statusLabel(p.givingStatus || 'active');
    if (overviewStatusNote) {
      const status = p.givingStatus || 'active';
      overviewStatusNote.textContent = status === 'active'
        ? 'Your public giving page is visible and ready to receive offerings.'
        : status === 'paused'
          ? 'Your giving page is paused. Donors can view it, but checkout is temporarily disabled.'
          : 'Your giving page is hidden from public discovery.';
    }
    if (overviewStripe) overviewStripe.textContent = statusLabel(p.stripeAccountStatus || 'not_started');
    if (overviewFunds) overviewFunds.textContent = (p.funds || []).length;
    if (overviewCampaigns) overviewCampaigns.textContent = (p.campaigns || []).length;
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
    if (activeTab === 'options') renderGivingOptionsEditor();
    if (activeTab === 'campaigns') renderCampaignList(p);
  }

  // ── GIVING OPTIONS EDITOR ─────────────────────────────────
  function renderGivingOptionsEditor() {
    const pane = document.getElementById('editorPane'); if (!pane) return;
    pane.innerHTML = `
      ${renderOptionsProgressSummary()}
      <div class="giving-options-intro">${hasGivingPlusAccess() ? 'These are the choices donors see after selecting <strong>Designated Fund</strong> or <strong>Alms Campaign</strong>. Add presets or write your own.' : 'Give offers your mission three clear destinations: <strong>General Operating</strong>, <strong>one designated fund</strong>, and <strong>Candles</strong>.'}</div>
      ${hasGivingPlusAccess() ? `<div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Alms campaigns</h3><span class="option-group-count">${editableCampaigns.length} shown</span></div><div class="option-list">${optionCards(editableCampaigns,'campaign','No alms campaigns configured yet.')}</div><div class="option-builder"><div class="option-builder-title">Add an alms campaign</div><div class="builder-grid"><select id="campaignPreset" onchange="fillGivingPreset('campaign')"><option value="">Choose a preset...</option>${presetOptions(campaignPresets)}</select><input id="campaignAccountNumber" maxlength="24" placeholder="Account number, e.g. 2200" /><input id="campaignName" placeholder="Campaign name, e.g. Support for the Petrov Family" /><select id="campaignRestriction"><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option><option value="board_designated">Board designated</option><option value="unrestricted">Unrestricted</option></select><textarea id="campaignDescription" placeholder="Describe the need in plain language."></textarea><input id="campaignGoal" type="number" min="0" step="1" placeholder="Goal amount, e.g. 45000" /><button class="btn btn-ghost" onclick="addGivingOption('campaign')">Add campaign</button></div></div></div>${renderFeastCampaignSetup()}` : '<aside class="starter-tier-upgrade-card"><div><span class="starter-tier-paywall-badge">Give +</span><strong>Need more giving destinations?</strong><p>Your current plan remains fully usable with General Operating, one designated fund, and candles. Upgrade only when you need unlimited funds, campaigns, commemorations, festal alms, branding, statements, or enhanced reporting.</p></div><button class="btn btn-gold" type="button" onclick="switchTab(\'settings\')">Compare plans</button></aside>'}
      <div class="btn-row"><button class="btn btn-gold" onclick="saveDashboard(this)">Save giving options</button><button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button></div>`;
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

  // ── GIVING SUMMARY (YTD chart) ────────────────────────────
  async function loadGivingSummary(btn) {
    const pane = document.getElementById('givingSummaryPane'); if (!currentParish || !pane) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    pane.innerHTML = '<div class="insights-empty-dark">Loading giving summary...</div>';
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-summary', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load giving summary');
      renderGivingSummary(data.summary);
      loadStripeVolume();
    } catch (err) { pane.innerHTML = `<div class="insights-empty-dark">${escapeHtml(err.message)}</div>`; }
    finally { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } }
  }

  // ── PDX helpers: count-up + sparkline ────────────────────
  function pdxAnimateCount(el, target, opts = {}) {
    if (!el) return;
    const t = Number(target) || 0;
    const isMoney = !!opts.money;
    const duration = opts.duration || 1200;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = from + (t - from) * eased;
      el.textContent = isMoney ? money(Math.round(value)) : Math.round(value).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function pdxDrawSparkline(svg, data) {
    if (!svg) return;
    if (!Array.isArray(data) || data.length < 2) {
      svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="rgba(246,241,232,0.4)" font-size="12" font-family="DM Sans, sans-serif">No monthly data yet</text>';
      return;
    }
    const w = 600, h = 130, pad = 8;
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    const step = (w - pad * 2) / (data.length - 1);
    const points = data.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2 - 20);
      return [x, y];
    });
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const areaPath = linePath + ` L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;
    svg.innerHTML = `
      <defs>
        <linearGradient id="pdxSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E8C879" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#E8C879" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#pdxSparkFill)" opacity="0"/>
      <path d="${linePath}" fill="none" stroke="#E8C879" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === points.length - 1 ? 4 : 2.5}" fill="${i === points.length - 1 ? '#F6F1E8' : '#E8C879'}" opacity="0"/>`).join('')}
    `;
    const linePathEl = svg.querySelector('path[stroke]');
    const areaPathEl = svg.querySelector('path[fill^="url"]');
    if (linePathEl && linePathEl.getTotalLength) {
      const len = linePathEl.getTotalLength();
      linePathEl.style.strokeDasharray = len;
      linePathEl.style.strokeDashoffset = len;
      linePathEl.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      requestAnimationFrame(() => setTimeout(() => {
        linePathEl.style.strokeDashoffset = 0;
        if (areaPathEl) { areaPathEl.style.transition = 'opacity 0.8s ease 0.6s'; areaPathEl.style.opacity = 1; }
        svg.querySelectorAll('circle').forEach((c, i) => {
          c.style.transition = `opacity 0.4s ease ${0.8 + i * 0.05}s`;
          c.style.opacity = 1;
        });
      }, 300));
    }
  }

  function renderGivingSummary(summary) {
    const heroTotal = document.getElementById('pdxHeroTotal');
    const heroRange = document.getElementById('pdxHeroRange');
    const heroSub   = document.getElementById('pdxHeroSub');
    const heroTitle = document.getElementById('pdxHeroTitle');
    const heroSpark = document.getElementById('pdxHeroSpark');
    const kpiDonors = document.getElementById('pdxKpiDonors');
    const kpiAvgGift = document.getElementById('pdxKpiAvgGift');
    const kpiRecurring = document.getElementById('pdxKpiRecurring');
    const kpiGiftCount = document.getElementById('pdxKpiGiftCount');
    const kpiDonorsMeta = document.getElementById('pdxKpiDonorsMeta');
    const kpiAvgGiftMeta = document.getElementById('pdxKpiAvgGiftMeta');
    const kpiGiftCountMeta = document.getElementById('pdxKpiGiftCountMeta');

    if (!summary || summary.dataSource === 'not_connected') {
      if (heroTotal) heroTotal.textContent = '—';
      if (heroSub) heroSub.innerHTML = '<span style="opacity:0.7;">Connect Stripe to show year-to-date giving.</span>';
      if (heroRange) heroRange.textContent = 'Stripe not connected';
      return;
    }
    const year = summary.year || new Date().getFullYear();
    if (heroTitle) heroTitle.textContent = `${year} year to date`;
    if (heroRange) heroRange.textContent = `Jan 1 – ${shortDate(summary.lastGiftAt) || 'today'} · net of fees`;

    // Hero total with count-up
    if (heroTotal) pdxAnimateCount(heroTotal, summary.ytdCents || 0, { money: true });

    // Sub line: gross + last gift date
    if (heroSub) {
      const gross = money(summary.grossGiftCents || summary.ytdCents || 0);
      const lastGift = summary.lastGiftAt ? `Last gift ${escapeHtml(shortDate(summary.lastGiftAt))}` : 'No gifts recorded yet';
      heroSub.innerHTML = `<span style="opacity:0.75;">Gross ${gross} · ${lastGift}</span>`;
    }

    // KPI band
    if (kpiDonors) pdxAnimateCount(kpiDonors, summary.giverCount || 0);
    if (kpiAvgGift) pdxAnimateCount(kpiAvgGift, summary.averageGiftCents || 0, { money: true });
    if (kpiGiftCount) pdxAnimateCount(kpiGiftCount, summary.giftCount || 0);
    // Recurring givers filled by renderRecurringHealth; leave a placeholder here
    if (kpiRecurring && kpiRecurring.textContent === '—') kpiRecurring.textContent = '—';

    if (kpiDonorsMeta) kpiDonorsMeta.innerHTML = `<span style="opacity:0.75;">Distinct givers this year</span>`;
    if (kpiAvgGiftMeta) {
      const coverage = Math.max(0, Math.min(100, Number(summary.feeCoveragePercent || 0)));
      kpiAvgGiftMeta.innerHTML = coverage > 0
        ? `<span class="pdx-delta up">${coverage}%</span>covering fees`
        : `<span style="opacity:0.75;">Net after fees</span>`;
    }
    if (kpiGiftCountMeta) kpiGiftCountMeta.innerHTML = `<span style="opacity:0.75;">All completed gifts</span>`;

    // Sparkline
    if (heroSpark) pdxDrawSparkline(heroSpark, (summary.monthly || []).map(m => Number(m.amountCents || 0)));
  }

  async function loadRecurringHealth(btn) {
    const pane = document.getElementById('recurringHealthPane');
    if (!currentParish || !pane) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    pane.innerHTML = '<div class="recurring-health-empty">Checking recurring giving health...</div>';
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/recurring-health', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load recurring giving health');
      renderRecurringHealth(data.health || {});
    } catch (err) {
      pane.innerHTML = `<div class="recurring-health-empty">${escapeHtml(err.message)}</div>`;
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  function recurringStatusLabel(status) {
    if (status === 'failed') return 'Failed this month';
    if (status === 'lapsed') return 'Lapsed';
    return 'Active';
  }

  function recurringDateLabel(row) {
    if (row.status === 'failed' && row.lastFailureAt) return `Failed ${shortDate(row.lastFailureAt)}`;
    if (row.lastPaidAt) return `Last paid ${shortDate(row.lastPaidAt)}`;
    return 'No completed gift recorded';
  }

  function renderRecurringHealth(health) {
    const pane = document.getElementById('recurringHealthPane');
    if (!pane) return;
    const activeCount = Number(health.activeCount || 0);
    const failedCount = Number(health.failedThisMonthCount || 0);
    const lapsedCount = Number(health.lapsedCount || 0);
    const total = activeCount + failedCount + lapsedCount;
    const monthlyRecurring = Number(health.monthlyRecurringCents || 0);

    // Update the "Recurring givers" KPI card to reflect active recurring
    const kpiRecurring = document.getElementById('pdxKpiRecurring');
    const kpiRecurringMeta = document.getElementById('pdxKpiRecurringMeta');
    if (kpiRecurring) pdxAnimateCount(kpiRecurring, activeCount);
    if (kpiRecurringMeta) {
      const needsAttention = failedCount + lapsedCount;
      kpiRecurringMeta.innerHTML = needsAttention > 0
        ? `<span class="pdx-delta down">${needsAttention}</span>need attention`
        : `<span class="pdx-delta up">healthy</span>no issues`;
    }

    if (total === 0) {
      pane.innerHTML = '<div class="pdx-recurring-empty">No recurring gifts yet. Recurring giving health will appear here once donors set up monthly gifts.</div>';
      return;
    }

    const C = 2 * Math.PI * 70; // donut circumference
    const activeShare = activeCount / total;
    const lapsedShare = lapsedCount / total;
    const failedShare = failedCount / total;
    const needsAttention = failedCount + lapsedCount;
    const noteText = needsAttention === 0
      ? 'All recurring gifts are healthy.'
      : `Reach out to ${needsAttention} giver${needsAttention === 1 ? '' : 's'} to restore monthly gifts.`;

    pane.innerHTML = `
      <div class="pdx-recurring-layout">
        <div class="pdx-donut-wrap">
          <svg viewBox="0 0 170 170">
            <circle cx="85" cy="85" r="70" fill="none" stroke="rgba(6,21,34,0.06)" stroke-width="16"/>
            <circle class="pdx-donut-arc" data-arc="active" cx="85" cy="85" r="70" fill="none" stroke="#4A7C59" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
            <circle class="pdx-donut-arc" data-arc="lapsed" cx="85" cy="85" r="70" fill="none" stroke="#C4922A" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
            <circle class="pdx-donut-arc" data-arc="failed" cx="85" cy="85" r="70" fill="none" stroke="#B04A3F" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="0 ${C}" stroke-dashoffset="0"/>
          </svg>
          <div class="pdx-donut-center">
            <div class="pdx-donut-num">${total}</div>
            <div class="pdx-donut-label">Recurring</div>
          </div>
        </div>
        <div class="pdx-recurring-legend">
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#4A7C59;"></span>
            <span class="pdx-legend-label">Active</span>
            <span class="pdx-legend-value">${activeCount}</span>
          </div>
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#C4922A;"></span>
            <span class="pdx-legend-label">Lapsed <small>(30+ days)</small></span>
            <span class="pdx-legend-value">${lapsedCount}</span>
          </div>
          <div class="pdx-legend-row">
            <span class="pdx-legend-dot" style="background:#B04A3F;"></span>
            <span class="pdx-legend-label">Failed this month</span>
            <span class="pdx-legend-value">${failedCount}</span>
          </div>
          ${monthlyRecurring > 0 ? `<div class="pdx-legend-note">Expected monthly: ${escapeHtml(money(monthlyRecurring))}. ${escapeHtml(noteText)}</div>` : `<div class="pdx-legend-note">${escapeHtml(noteText)}</div>`}
        </div>
      </div>`;

    // Animate arcs after paint
    requestAnimationFrame(() => setTimeout(() => {
      const active = pane.querySelector('[data-arc="active"]');
      const lapsed = pane.querySelector('[data-arc="lapsed"]');
      const failed = pane.querySelector('[data-arc="failed"]');
      if (active) {
        active.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
        active.style.strokeDasharray = `${C * activeShare} ${C}`;
      }
      if (lapsed) {
        lapsed.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.1s';
        lapsed.style.strokeDasharray = `${C * lapsedShare} ${C}`;
        lapsed.style.strokeDashoffset = -C * activeShare;
      }
      if (failed) {
        failed.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s, stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s';
        failed.style.strokeDasharray = `${C * failedShare} ${C}`;
        failed.style.strokeDashoffset = -C * (activeShare + lapsedShare);
      }
    }, 100));
  }

  // ── GIVING HISTORY ────────────────────────────────────────
  async function loadGivingHistory(btn) {
    if (!currentParish) { setStatus('Load a parish first.','error'); return; }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    const wrap = document.getElementById('historyTableWrap');
    if (wrap) wrap.innerHTML = '<div class="history-empty">Loading gift history...</div>';
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-history', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load giving history');
      allGifts = data.gifts || [];
      manualAccountingGifts = data.manualAccountingGifts || [];
      renderCandleGiving();
      // Populate fund filter
      const funds = [...new Set(allGifts.map(g => g.fund || g.fundId || 'General').filter(Boolean))];
      const fundSel = document.getElementById('histFundFilter');
      if (fundSel) { fundSel.innerHTML = '<option value="all">All funds</option>' + funds.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join(''); }
      filterHistory();
      if (currentParish) renderGivingOptionsEditor();
      renderGiversPanel();
    } catch (err) {
      if (wrap) wrap.innerHTML = `<div class="history-empty">${escapeHtml(err.message)}</div>`;
    } finally { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } }
  }

  function filterHistory() {
    const q    = (document.getElementById('histSearch')?.value || '').toLowerCase();
    const type = document.getElementById('histTypeFilter')?.value || 'all';
    const fund = document.getElementById('histFundFilter')?.value  || 'all';
    const range = document.getElementById('histRangeFilter')?.value || 'ytd';
    const now = new Date();
    const rangeStart = range === '30d'
      ? new Date(now.getTime() - 30 * 86400000)
      : range === '90d'
        ? new Date(now.getTime() - 90 * 86400000)
        : range === 'ytd'
          ? new Date(now.getFullYear(), 0, 1)
          : null;
    filteredGifts = allGifts.filter(g => {
      const haystack = [g.donorName, g.donorEmail, g.fund, g.fundId, g.description, ...(g.commemorationNames || [])].join(' ').toLowerCase();
      const matchQ    = !q    || haystack.includes(q);
      const matchType = type === 'all' || g.type === type || (type === 'recurring' && g.recurring) || (type === 'one_time' && !g.recurring);
      const matchFund = fund === 'all' || (g.fund || g.fundId || 'General') === fund;
      const giftDate = new Date(g.date || g.createdAt || 0);
      const matchRange = !rangeStart || (!Number.isNaN(giftDate.getTime()) && giftDate >= rangeStart);
      return matchQ && matchType && matchFund && matchRange;
    }).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    renderHistoryTable();
    renderGiversPanel();
  }

  function renderHistoryInsights() {
    const trendPane = document.getElementById('historyTrendPanel');
    const fundPane = document.getElementById('historyFundPanel');
    const gifts = filteredGifts || [];
    const latestDate = gifts.reduce((latest, gift) => {
      const date = new Date(gift.date || gift.createdAt || 0);
      return !Number.isNaN(date.getTime()) && date > latest ? date : latest;
    }, new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
      months.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        cents: 0,
        gifts: 0
      });
    }
    const monthMap = new Map(months.map(month => [month.key, month]));
    const fundMap = new Map();
    gifts.forEach((gift) => {
      const date = new Date(gift.date || gift.createdAt || 0);
      const cents = Number((gift.parishNetCents ?? gift.amountCents) || 0);
      if (!Number.isNaN(date.getTime())) {
        const bucket = monthMap.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        if (bucket) { bucket.cents += cents; bucket.gifts += 1; }
      }
      const fund = gift.fund || gift.fundId || 'General';
      fundMap.set(fund, (fundMap.get(fund) || 0) + cents);
    });
    const maxMonth = Math.max(1, ...months.map(month => month.cents));
    if (trendPane) {
      trendPane.innerHTML = gifts.length ? `
        <div class="parish-history-bars">${months.map((month) => `
          <div class="parish-history-bar-column" title="${escapeAttr(month.label)} · ${moneyFull(month.cents)} · ${month.gifts} gift${month.gifts === 1 ? '' : 's'}">
            <div class="parish-history-bar-track"><span style="height:${Math.max(month.cents ? 9 : 2, Math.round(month.cents / maxMonth * 100))}%"></span></div>
            <strong>${escapeHtml(month.label)}</strong>
            <small>${month.cents ? money(month.cents) : '—'}</small>
          </div>`).join('')}</div>`
        : '<div class="parish-history-insight-empty">No giving activity matches this view.</div>';
    }
    const funds = [...fundMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxFund = Math.max(1, ...funds.map(([, cents]) => cents));
    if (fundPane) {
      fundPane.innerHTML = funds.length ? funds.map(([fund, cents], index) => `
        <div class="parish-history-fund-row">
          <span class="parish-history-fund-rank">${index + 1}</span>
          <span class="parish-history-fund-copy"><strong>${escapeHtml(fund)}</strong><i><b style="width:${Math.max(4, Math.round(cents / maxFund * 100))}%"></b></i></span>
          <span class="parish-history-fund-amount">${money(cents)}</span>
        </div>`).join('')
        : '<div class="parish-history-insight-empty">Fund allocation will appear after gifts are recorded.</div>';
    }
  }

  function renderHistoryTable() {
    // Summary stats
    const total    = filteredGifts.reduce((s, g) => s + ((g.parishNetCents ?? g.amountCents) || 0), 0);
    const avg      = filteredGifts.length ? Math.round(total / filteredGifts.length) : 0;
    const recurring = filteredGifts.filter(g => g.recurring).length;
    const donors = new Set(filteredGifts.map(g => String(g.donorEmail || g.donorName || '').trim().toLowerCase()).filter(Boolean)).size;
    const feeCovered = filteredGifts.filter(g => g.coverFees).length;
    document.getElementById('histStatTotal').textContent     = filteredGifts.length;
    document.getElementById('histStatAmount').textContent    = money(total);
    document.getElementById('histStatAvg').textContent      = filteredGifts.length ? money(avg) : '—';
    document.getElementById('histStatRecurring').textContent = recurring;
    const donorStat = document.getElementById('histStatDonors');
    if (donorStat) donorStat.textContent = donors;
    const context = document.getElementById('historyHeroContext');
    if (context) context.textContent = `${recurring} recurring gift${recurring === 1 ? '' : 's'} · ${feeCovered} fee-covered · ${donors} distinct donor${donors === 1 ? '' : 's'}`;
    const resultCount = document.getElementById('historyResultCount');
    if (resultCount) resultCount.textContent = `Showing ${filteredGifts.length} of ${allGifts.length} gift${allGifts.length === 1 ? '' : 's'}`;
    renderHistoryInsights();

    const wrap = document.getElementById('historyTableWrap');
    if (!wrap) return;
    if (!filteredGifts.length) {
      wrap.innerHTML = `<div class="history-empty">${allGifts.length ? 'No gifts match the current filters.' : 'No gift history found. Connect Stripe to see recent gifts here.'}</div>`;
      return;
    }
    const rows = filteredGifts.map(g => {
      const giftCents = Number((g.giftAmountCents ?? g.amountCents) || 0);
      const netCents = Number((g.parishNetCents ?? g.amountCents) || 0);
      const feeCents = Number(g.totalFeeCents || 0);
      const details = (g.commemorationNames || []).length
        ? `<span class="parish-history-row-note">For ${escapeHtml(g.commemorationNames.join(', '))}</span>` : '';
      return `
        <tr>
          <td data-label="Date"><strong class="parish-history-date">${escapeHtml(fullDate(g.date || g.createdAt))}</strong></td>
          <td data-label="Donor"><span class="parish-history-donor"><strong>${g.donorName ? escapeHtml(g.donorName) : 'Anonymous donor'}</strong><small>${g.donorEmail ? escapeHtml(g.donorEmail) : 'No email available'}</small></span></td>
          <td data-label="Fund"><span class="history-fund">${escapeHtml(g.fund || g.fundId || 'General')}</span>${details}</td>
          <td data-label="Gift"><span class="history-amount">${moneyFull(giftCents)}</span></td>
          <td data-label="Fees"><span class="history-fee ${g.coverFees ? 'covered' : 'absorbed'}">${g.coverFees ? 'Donor covered' : (feeCents ? '-' + moneyFull(feeCents) : 'No fee')}</span></td>
          <td data-label="Net"><span class="parish-history-net">${moneyFull(netCents)}</span></td>
          <td data-label="Type"><span class="history-type">${g.recurring ? 'Recurring' : 'One-time'}</span></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead><tr>
            <th>Date</th><th>Donor</th><th>Fund &amp; intention</th><th>Gift</th><th>Fees</th><th>Net</th><th>Type</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── CSV EXPORT ────────────────────────────────────────────
  function exportHistoryCsv() {
    if (!filteredGifts.length) { setStatus('No gifts to export. Load history first.','error'); return; }
    const headers = ['Date','Parish Received','Gift Amount','Fees','Fees Covered By Donor','Donor Name','Donor Email','Fund','Type','Commemorations'];
    const rows = filteredGifts.map(g => [
      fullDate(g.date || g.createdAt),
      (((g.parishNetCents ?? g.amountCents) || 0) / 100).toFixed(2),
      (((g.giftAmountCents ?? g.amountCents) || 0) / 100).toFixed(2),
      ((g.totalFeeCents || 0) / 100).toFixed(2),
      g.coverFees ? 'Yes' : 'No',
      g.donorName || 'Anonymous',
      g.donorEmail || '',
      g.fund || g.fundId || 'General',
      g.recurring ? 'Recurring' : 'One-time',
      (g.commemorationNames || []).join('; ')
    ].map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','));
    const csv  = [headers.join(','), ...rows].join('\n');
    const name = `${currentParish?.parishId || 'parish'}-giving-history-${new Date().toISOString().slice(0,10)}.csv`;
    downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    setStatus(`Exported ${filteredGifts.length} gifts to ${name}.`, 'success');
  }

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
    const [year, monthNumber] = String(month || '').split('-').map(Number);
    if (!year || !monthNumber) return String(month || 'Selected month');
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function reconciliationDate(seconds) {
    if (!seconds) return '—';
    return new Date(Number(seconds) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function setReconciliationLoading(message) {
    const ids = ['reconcileAllocationsPane', 'reconcileTransferWorksheetPane', 'reconcileGiftActivityPane', 'reconcilePayoutsPane', 'reconcileExceptionsPane'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
    });
  }

  async function loadReconciliation(btn) {
    if (!currentParish) { setStatus('Load a parish first.', 'error'); return; }
    initReconciliationMonths();
    const month = document.getElementById('reconcileMonth')?.value;
    if (!month) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    setReconciliationLoading('Loading reconciliation summary…');
    try {
      const path = `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation?month=${encodeURIComponent(month)}`;
      const response = await fetch(path, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || `Unable to run reconciliation (${response.status}).`);
      reconciliationData = data;
      renderReconciliation(data);
    } catch (error) {
      reconciliationData = null;
      setReconciliationLoading(error.message);
      const status = document.getElementById('reconcileStatusLine');
      if (status) status.innerHTML = `<span class="reconcile-state attention">Needs attention</span><span>${escapeHtml(error.message)}</span>`;
      setStatus(error.message, 'error');
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  async function loadFundTransferWorksheet(btn) {
    if (!currentParish) { setStatus('Load a parish first.', 'error'); return; }
    const month = document.getElementById('reconcileMonth')?.value;
    if (!month) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    const pane = document.getElementById('reconcileTransferWorksheetPane');
    if (pane) pane.innerHTML = '<div class="history-empty">Matching paid Stripe payouts to fund records…</div>';
    try {
      const path = `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation?month=${encodeURIComponent(month)}&detail=full`;
      const response = await fetch(path, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || `Unable to prepare fund transfers (${response.status}).`);
      reconciliationData = data;
      renderReconciliation(data);
      document.getElementById('reconcileTransferWorksheetPane')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setStatus('Fund transfer worksheet prepared from paid Stripe payouts.', 'success');
    } catch (error) {
      if (pane) pane.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
      setStatus(error.message, 'error');
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
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
    if (payoutCountEl) payoutCountEl.textContent = `Across ${paidPayouts} paid payout${paidPayouts === 1 ? '' : 's'}${gross ? ` · ${money(gross)} gross before fees` : ''}`;

    const matchedPctEl = document.getElementById('reconcileMatchedPercent');
    if (matchedPctEl) matchedPctEl.textContent = `${matchedPct}%`;
    const matchSub = document.getElementById('pdxRcMatchSub');
    if (matchSub) matchSub.textContent = `${money(matchedNet)} traced to gifts${fees ? ` · ${money(fees)} in fees` : ''}`;
    const matchBar = document.getElementById('pdxRcMatchBarFill');
    if (matchBar) {
      matchBar.style.width = '0';
      requestAnimationFrame(() => setTimeout(() => { matchBar.style.width = Math.max(0, Math.min(100, matchedPct)) + '%'; }, 200));
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
    if (amount) amount.value = close ? (Number(close.bankStatementCents || 0) / 100).toFixed(2) : (Number(summary.depositedCents || 0) / 100).toFixed(2);
    if (notes) notes.value = close?.notes || '';
    updateReconciliationDifference();
  }

  // Persist allocation view choice across sessions
  const PDX_RC_ALLOC_KEY = 'agapay_reconcile_alloc_view';
  const PDX_RC_ALLOC_COLORS = ['#3B5A6F', '#C8A24A', '#7FA97A', '#B47A50', '#8A6BA1', '#5B7C99', '#A87256', '#4C8672'];
  function getReconcileAllocView() { try { return localStorage.getItem(PDX_RC_ALLOC_KEY) || 'stacked'; } catch { return 'stacked'; } }
  function setReconcileAllocView(mode, btn) {
    try { localStorage.setItem(PDX_RC_ALLOC_KEY, mode); } catch {}
    if (btn) {
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    if (reconciliationData?.allocations) {
      renderReconciliationAllocations(reconciliationData.allocations || [], reconciliationData.summary?.depositedCents || 0);
    }
  }

  function renderReconciliationAllocations(allocations, depositedCents) {
    const pane = document.getElementById('reconcileAllocationsPane');
    if (!pane) return;

    // Sync the toggle chips to the persisted preference
    const view = getReconcileAllocView();
    const toggle = document.getElementById('pdxRcAllocToggle');
    if (toggle) {
      toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === view));
    }

    if (!allocations.length) {
      pane.innerHTML = '<div class="pdx-recurring-empty">No matched fund allocations were found in this month\'s paid payouts.</div>';
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
        percent: pct
      };
    });
    const maxPct = Math.max(...items.map(i => i.percent), 1);

    const stackedHtml = `
      <div class="pdx-rc-alloc-stacked">
        ${items.filter(i => i.percent > 0).map(i => `
          <div class="pdx-rc-alloc-seg" style="--w:${i.percent}%; background:${i.color};" title="${escapeHtml(i.label)}: ${escapeHtml(money(i.netCents))} (${i.percent}%)">
            ${i.percent >= 6 ? escapeHtml(money(i.netCents)) : ''}
          </div>
        `).join('')}
      </div>
      <div class="pdx-rc-alloc-legend">
        ${items.map(i => `
          <div class="pdx-rc-alloc-legend-item">
            <span><span class="pdx-rc-alloc-legend-swatch" style="background:${i.color};"></span><span class="pdx-rc-alloc-legend-name">${escapeHtml(i.label)}</span></span>
            <span class="pdx-rc-alloc-legend-value">${escapeHtml(money(i.netCents))} <span class="pdx-rc-alloc-legend-pct">${i.percent}%</span></span>
          </div>
        `).join('')}
      </div>`;

    const barsHtml = `
      <div class="pdx-rc-alloc-bar-list">
        ${items.map(i => {
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
        }).join('')}
      </div>`;

    pane.innerHTML = view === 'bars' ? barsHtml : stackedHtml;

    // Animate the per-fund bar tracks
    if (view === 'bars') {
      requestAnimationFrame(() => setTimeout(() => {
        pane.querySelectorAll('.pdx-rc-alloc-bar-track i').forEach((el, i) => {
          setTimeout(() => { el.style.width = el.dataset.w; }, i * 60);
        });
      }, 100));
    }
  }

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
      pane.innerHTML = '<div class="pdx-recurring-empty">No matched fund allocations are available for a transfer worksheet.</div>';
      return;
    }

    const savedByKey = new Map((Array.isArray(savedInstructions) ? savedInstructions : []).map(item => [String(item.key || ''), item]));
    const rows = worksheet.lines.map(line => {
      const saved = savedByKey.get(String(line.key || '')) || {};
      const action = line.needsReview ? 'retain' : (saved.action || line.recommendedAction || 'retain');
      const transfer = action === 'transfer';
      return `<div class="pdx-rc-transfer-row ${line.needsReview ? 'needs-review' : ''}" data-transfer-row data-key="${escapeAttr(line.key || '')}" data-net-cents="${Number(line.netCents || 0)}">
        <div class="pdx-rc-transfer-fund">
          <span>${escapeHtml(line.category || 'Giving')}</span>
          <strong>${escapeHtml(line.label || 'General Giving')}</strong>
          <small>${Number(line.transactionCount || 0)} transaction${Number(line.transactionCount || 0) === 1 ? '' : 's'} · ${escapeHtml(money(line.grossCents || 0))} gross · ${escapeHtml(money(line.feeCents || 0))} fees</small>
        </div>
        <div class="pdx-rc-transfer-net"><span>Net amount</span><strong>${escapeHtml(moneyFull(line.netCents || 0))}</strong></div>
        <label class="pdx-rc-transfer-action">Handling
          <select data-transfer-action onchange="updateFundTransferWorksheet()" ${line.needsReview ? 'disabled' : ''}>
            <option value="retain" ${transfer ? '' : 'selected'}>Keep in deposit account</option>
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
    }).join('');
    const unallocated = Number(worksheet.unallocatedCents || 0);
    pane.innerHTML = `<div class="pdx-rc-transfer-summary">
        <div><span>Stripe deposits</span><strong>${escapeHtml(money(worksheet.depositedCents || 0))}</strong></div>
        <div><span>Planned transfers</span><strong id="reconcileTransferPlanned">${escapeHtml(money(worksheet.recommendedTransferCents || 0))}</strong></div>
        <div><span>Remain in deposit account</span><strong id="reconcileTransferRetained">${escapeHtml(money(worksheet.retainInDepositAccountCents || 0))}</strong></div>
      </div>
      ${unallocated !== 0 ? `<div class="pdx-rc-transfer-hold"><strong>Keep ${escapeHtml(moneyFull(Math.abs(unallocated)))} in the deposit account for review.</strong><span>The paid payout and matched fund totals differ. Do not distribute this amount until the reconciliation exceptions are resolved.</span></div>` : '<div class="pdx-rc-transfer-ready"><strong>Fund totals match the paid Stripe deposits.</strong><span>Review the destinations below before making transfers.</span></div>'}
      <div class="pdx-rc-transfer-list">${rows}</div>
      <p class="pdx-rc-transfer-disclaimer">These are accounting instructions for the parish treasurer. AGAPAY does not initiate, schedule, or approve transfers between parish bank accounts.</p>`;
    updateFundTransferWorksheet();
  }

  function updateFundTransferWorksheet() {
    const rows = [...document.querySelectorAll('[data-transfer-row]')];
    let plannedCents = 0;
    rows.forEach(row => {
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
    const depositedCents = Number(reconciliationData?.transferWorksheet?.depositedCents || reconciliationData?.summary?.depositedCents || 0);
    const planned = document.getElementById('reconcileTransferPlanned');
    const retained = document.getElementById('reconcileTransferRetained');
    if (planned) planned.textContent = money(plannedCents);
    if (retained) retained.textContent = money(depositedCents - plannedCents);
  }

  function collectFundTransferInstructions() {
    const rows = [...document.querySelectorAll('[data-transfer-row]')];
    if (!rows.length) return Array.isArray(reconciliationData?.closeRecord?.transferInstructions)
      ? reconciliationData.closeRecord.transferInstructions
      : [];
    return rows.map(row => {
      const action = row.querySelector('[data-transfer-action]')?.value === 'transfer' ? 'transfer' : 'retain';
      return {
        key: row.dataset.key || '',
        action,
        destination: action === 'transfer' ? (row.querySelector('[data-transfer-destination]')?.value.trim() || '') : '',
        completed: action === 'transfer' && Boolean(row.querySelector('[data-transfer-completed]')?.checked),
        reference: action === 'transfer' ? (row.querySelector('[data-transfer-reference]')?.value.trim() || '') : ''
      };
    }).filter(item => item.key);
  }

  function renderReconciliationGiftActivity(activity) {
    const pane = document.getElementById('reconcileGiftActivityPane');
    if (!pane) return;
    const items = [
      { label: 'Gifts made', value: activity.giftCount || 0, isMoney: false },
      { label: 'Gross gifts', value: activity.grossGiftCents || 0, isMoney: true },
      { label: 'Parish net', value: activity.parishNetCents || 0, isMoney: true },
      { label: 'Gift fees', value: activity.feeCents || 0, isMoney: true }
    ];
    pane.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:14px; margin-bottom:10px;">
        ${items.map(it => `
          <div style="padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--paper);">
            <div style="font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:var(--stone); font-weight:600; margin-bottom:4px;">${it.label}</div>
            <div style="font-family:var(--serif); font-size:22px; font-weight:600; color:var(--ink);">${escapeHtml(it.isMoney ? money(it.value) : String(it.value))}</div>
          </div>
        `).join('')}
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
    const monthShort = { 0:'Jan', 1:'Feb', 2:'Mar', 3:'Apr', 4:'May', 5:'Jun', 6:'Jul', 7:'Aug', 8:'Sep', 9:'Oct', 10:'Nov', 11:'Dec' };
    pane.innerHTML = `<div class="pdx-rc-payout-list">${payouts.map(payout => {
      const rows = transactions.filter(row => row.payoutId === payout.id);
      const arrival = payout.arrivalDate ? new Date(payout.arrivalDate) : null;
      const day = arrival ? String(arrival.getDate()).padStart(2, '0') : '—';
      const mon = arrival ? monthShort[arrival.getMonth()] : '';
      const diff = Math.abs(Number(payout.differenceCents || 0));
      const unmatched = rows.filter(r => !r.matched).length;
      const chipClass = unmatched > 0 || diff > 100 ? 'attention' : diff > 0 ? 'partial' : 'matched';
      const chipLabel = unmatched > 0 ? `${unmatched} to review` : diff > 0 ? 'Composition delta' : 'Fully matched';
      const payoutIdShort = String(payout.id || 'Stripe payout').slice(0, 16) + (String(payout.id || '').length > 16 ? '...' : '');
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
          <div class="pdx-rc-payout-body-line"><span>Reference gifts</span><b>${payout.transactionCount || 0} listed · ${rows.filter(r => r.matched).length} matched</b></div>
          ${rows.length ? `<table><thead><tr><th>Date</th><th>Post to</th><th>Donor</th><th>Gross</th><th>Fees</th><th>Net</th><th>Match</th></tr></thead><tbody>
            ${rows.map(row => `<tr>
              <td>${escapeHtml(reconciliationDate(row.created))}</td>
              <td>${escapeHtml(row.allocationLabel || row.reportingCategory || 'Stripe activity')}</td>
              <td>${escapeHtml(row.donorName || '—')}</td>
              <td>${escapeHtml(moneyFull(row.grossCents || 0))}</td>
              <td>${escapeHtml(moneyFull(row.feeCents || 0))}</td>
              <td><b>${escapeHtml(moneyFull(row.netCents || 0))}</b></td>
              <td><span class="${row.matched ? 'pdx-rc-match-chip-yes' : 'pdx-rc-match-chip-no'}">${row.matched ? 'Matched' : 'Review'}</span></td>
            </tr>`).join('')}
          </tbody></table>` : ''}
        </div>
      </details>`;
    }).join('')}</div>`;
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
    pane.innerHTML = `<div class="pdx-rc-exception-list">${exceptions.map(item => {
      const severity = (item.severity === 'error' || item.severity === 'critical') ? 'error' : 'warning';
      return `<div class="pdx-rc-exception ${severity}">
        <div class="pdx-rc-exception-icon">
          ${severity === 'error'
            ? '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>'
            : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}
        </div>
        <div class="pdx-rc-exception-copy">
          <strong>${escapeHtml(item.message || 'Review this item.')}</strong>
          ${item.payoutId ? `<small>Payout ${escapeHtml(item.payoutId)}</small>` : ''}
        </div>
        <div class="pdx-rc-exception-amount">${item.amountCents ? escapeHtml(moneyFull(item.amountCents)) : ''}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function updateReconciliationDifference() {
    const el = document.getElementById('reconcileDifference');
    if (!el) return;
    if (!reconciliationData?.available) { el.innerHTML = '<span>Difference</span><b>—</b>'; return; }
    const entered = Math.round(Number(document.getElementById('reconcileBankAmount')?.value || 0) * 100);
    const expected = Number(reconciliationData.summary?.depositedCents || 0);
    const difference = entered - expected;
    const balancedClass = difference === 0 ? 'zero' : 'mismatch';
    const label = difference === 0 ? '$0.00 ✓' : moneyFull(difference);
    el.innerHTML = `<span>Difference</span><b class="${balancedClass}">${escapeHtml(label)}</b>`;
  }

  async function saveReconciliationClose(closed, btn) {
    if (!currentParish || !reconciliationData?.available) { setStatus('Run the reconciliation first.', 'error'); return; }
    const bankStatementCents = Math.round(Number(document.getElementById('reconcileBankAmount')?.value || 0) * 100);
    const expectedDepositCents = Number(reconciliationData.summary?.depositedCents || 0);
    const notes = document.getElementById('reconcileNotes')?.value.trim() || '';
    if (closed && bankStatementCents !== expectedDepositCents && !notes) {
      setStatus('Add a treasurer note explaining the bank difference before closing.', 'error');
      document.getElementById('reconcileNotes')?.focus();
      return;
    }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const response = await fetch(`/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation/close`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: reconciliationData.period?.month,
          bankStatementCents,
          expectedDepositCents,
          notes,
          closed,
          transferInstructions: collectFundTransferInstructions()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save the month close.');
      reconciliationData.closeRecord = data.record;
      renderReconciliation(reconciliationData);
      setStatus(closed ? 'Month closed and preserved for the parish record.' : 'Month reopened.', 'success');
    } catch (error) { setStatus(error.message, 'error'); }
    finally { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } }
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function exportReconciliationCsv() {
    if (!reconciliationData?.available) { setStatus('Run the reconciliation first.', 'error'); return; }
    const data = reconciliationData;
    const transferInstructions = new Map(collectFundTransferInstructions().map(item => [item.key, item]));
    const rows = [
      ['AGAPAY Monthly Reconciliation', currentParish?.parishName || ''],
      ['Month', data.period?.month || ''],
      ['Deposited to bank', (Number(data.summary?.depositedCents || 0) / 100).toFixed(2)],
      ['Stripe fees', (Number(data.summary?.stripeFeeCents || 0) / 100).toFixed(2)],
      ['AGAPAY fees', (Number(data.summary?.agapayFeeCents || 0) / 100).toFixed(2)],
      [],
      ['Fund Allocation'],
      ['Category', 'Fund / Campaign', 'Transactions', 'Gross', 'Fees', 'Net'],
      ...(data.allocations || []).map(item => [item.category, item.label, item.transactionCount, item.grossCents / 100, item.feeCents / 100, item.netCents / 100]),
      [],
      ['Fund Transfer Worksheet'],
      ['Fund / Campaign', 'Net amount', 'Handling', 'Destination', 'Completed', 'Reference'],
      ...(data.transferWorksheet?.lines || []).map(item => {
        const instruction = transferInstructions.get(item.key) || { action: item.recommendedAction || 'retain' };
        return [item.label, item.netCents / 100, instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account', instruction.destination || '', instruction.completed ? 'Yes' : 'No', instruction.reference || ''];
      }),
      ['Unallocated amount held for review', Number(data.transferWorksheet?.unallocatedCents || 0) / 100],
      [],
      ['Stripe Payouts'],
      ['Arrival date', 'Payout ID', 'Status', 'Amount', 'Matched', 'Difference'],
      ...(data.payouts || []).map(item => [reconciliationDate(item.arrivalDate), item.id, item.status, item.amountCents / 100, (item.matchedNetCents || 0) / 100, (item.differenceCents || 0) / 100]),
      [],
      ['Transaction Detail'],
      ['Date', 'Payout ID', 'Allocation', 'Donor', 'Gross', 'Fees', 'Net', 'Matched'],
      ...(data.transactions || []).map(item => [reconciliationDate(item.created), item.payoutId, item.allocationLabel, item.donorName, item.grossCents / 100, item.feeCents / 100, item.netCents / 100, item.matched ? 'Yes' : 'No'])
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
    const name = `${currentParish.parishId}-reconciliation-${data.period.month}.csv`;
    downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    setStatus(`Exported ${name}.`, 'success');
  }

  function printFundTransferWorksheet() {
    const worksheet = reconciliationData?.transferWorksheet;
    if (!worksheet?.available) { setStatus('Prepare the detailed fund transfer worksheet first.', 'error'); return; }
    const instructions = new Map(collectFundTransferInstructions().map(item => [item.key, item]));
    const rows = (worksheet.lines || []).map(item => {
      const instruction = instructions.get(item.key) || { action: item.recommendedAction || 'retain' };
      const handling = instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account';
      const status = instruction.action === 'transfer' ? (instruction.completed ? 'Completed' : 'Pending') : 'Retained';
      return `<tr><td><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.category)}</small></td><td>${moneyFull(item.grossCents || 0)}</td><td>${moneyFull(item.feeCents || 0)}</td><td><strong>${moneyFull(item.netCents || 0)}</strong></td><td>${escapeHtml(handling)}</td><td>${escapeHtml(instruction.destination || '—')}</td><td>${escapeHtml(status)}${instruction.reference ? `<small>${escapeHtml(instruction.reference)}</small>` : ''}</td></tr>`;
    }).join('');
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) { setStatus('Allow pop-ups to print the fund transfer worksheet.', 'error'); return; }
    popup.document.write(`<!doctype html><html><head><title>AGAPAY Fund Transfer Worksheet</title><style>body{font:13px Arial;color:#061522;margin:38px}header{border-bottom:3px solid #c9a24a;padding-bottom:15px;margin-bottom:22px}small{display:block;color:#68717a;margin-top:3px}h1{font:600 28px Georgia,serif;margin:5px 0}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:10px;text-transform:uppercase}.summary strong{display:block;font:600 20px Georgia,serif;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#555}.hold{border:1px solid #d7b96c;background:#fff8e6;padding:10px;margin-top:14px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:48px}.sign div{border-top:1px solid #333;padding-top:6px;color:#666}.note{margin-top:24px;color:#666;line-height:1.5}@media print{body{margin:14mm}}@media(max-width:700px){.summary{grid-template-columns:1fr}}</style></head><body><header><small>AGAPAY GIVE · TREASURER WORKSHEET</small><h1>${escapeHtml(currentParish?.parishName || 'Parish')}</h1><div>${escapeHtml(reconciliationMonthLabel(reconciliationData?.period?.month))}</div></header><div class="summary"><div><span>Stripe deposits</span><strong>${moneyFull(worksheet.depositedCents || 0)}</strong></div><div><span>Planned transfers</span><strong>${moneyFull([...instructions.entries()].reduce((sum,[key,value])=>{const line=(worksheet.lines||[]).find(item=>item.key===key);return sum+(value.action==='transfer'&&Number(line?.netCents||0)>0?Number(line.netCents):0)},0))}</strong></div><div><span>Unallocated / review</span><strong>${moneyFull(worksheet.unallocatedCents || 0)}</strong></div></div>${Number(worksheet.unallocatedCents || 0)!==0?`<div class="hold"><strong>Hold ${moneyFull(Math.abs(Number(worksheet.unallocatedCents || 0)))} for review.</strong> Do not distribute the unmatched amount until reconciliation exceptions are resolved.</div>`:''}<table><thead><tr><th>Fund</th><th>Gross</th><th>Fees</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status / reference</th></tr></thead><tbody>${rows}</tbody></table><p class="note">Stripe made one combined payout to the parish deposit account. These amounts are derived from paid payout activity after recorded fees, refunds, and disputes. AGAPAY does not initiate or approve bank transfers.</p><div class="sign"><div>Treasurer signature / date</div><div>Reviewer signature / date</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function printReconciliationReport() {
    if (!reconciliationData?.available) { setStatus('Run the reconciliation first.', 'error'); return; }
    const data = reconciliationData;
    const summary = data.summary || {};
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) { setStatus('Allow pop-ups to print the closeout report.', 'error'); return; }
    const allocations = (data.allocations || []).map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.label)}</td><td>${item.transactionCount || 0}</td><td>${moneyFull(item.netCents || 0)}</td></tr>`).join('');
    const payouts = (data.payouts || []).map(item => `<tr><td>${reconciliationDate(item.arrivalDate)}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(statusLabel(item.status))}</td><td>${moneyFull(item.amountCents || 0)}</td></tr>`).join('');
    const exceptions = (data.exceptions || []).map(item => `<li>${escapeHtml(item.message)}</li>`).join('') || '<li>None.</li>';
    const transferInstructions = new Map(collectFundTransferInstructions().map(item => [item.key, item]));
    const transfers = (data.transferWorksheet?.lines || []).map(item => { const instruction = transferInstructions.get(item.key) || { action:item.recommendedAction || 'retain' }; return `<tr><td>${escapeHtml(item.label)}</td><td>${moneyFull(item.netCents || 0)}</td><td>${instruction.action === 'transfer' ? 'Transfer manually' : 'Keep in deposit account'}</td><td>${escapeHtml(instruction.destination || '—')}</td><td>${instruction.completed ? 'Completed' : instruction.action === 'transfer' ? 'Pending' : 'Retained'}</td></tr>`; }).join('');
    popup.document.write(`<!doctype html><html><head><title>AGAPAY Reconciliation</title><style>body{font:14px Arial;color:#061522;margin:40px}h1,h2{font-family:Georgia,serif}header{border-bottom:3px solid #c9a24a;margin-bottom:24px;padding-bottom:16px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:11px;text-transform:uppercase}.summary strong{font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}footer{margin-top:36px;border-top:1px solid #ccc;padding-top:12px;color:#666}@media print{body{margin:18mm}.no-print{display:none}}@media(max-width:700px){.summary{grid-template-columns:1fr 1fr}}</style></head><body><header><small>AGAPAY GIVE · MONTHLY RECONCILIATION</small><h1>${escapeHtml(currentParish.parishName || 'Parish')}</h1><p>${escapeHtml(reconciliationMonthLabel(data.period?.month))}</p></header><div class="summary"><div><span>Bank deposits</span><strong>${money(summary.depositedCents || 0)}</strong></div><div><span>Gross activity</span><strong>${money(summary.grossActivityCents || 0)}</strong></div><div><span>Total fees</span><strong>${money(summary.totalFeeCents || 0)}</strong></div><div><span>Matched</span><strong>${summary.matchedPercent ?? 0}%</strong></div></div><h2>Fund allocation</h2><table><thead><tr><th>Category</th><th>Post to</th><th>Count</th><th>Net</th></tr></thead><tbody>${allocations || '<tr><td colspan="4">No allocations.</td></tr>'}</tbody></table>${transfers ? `<h2>Fund transfer worksheet</h2><table><thead><tr><th>Fund</th><th>Net</th><th>Handling</th><th>Destination</th><th>Status</th></tr></thead><tbody>${transfers}</tbody></table>` : ''}<h2>Stripe payouts</h2><table><thead><tr><th>Arrival</th><th>Payout</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payouts || '<tr><td colspan="4">No payouts.</td></tr>'}</tbody></table><h2>Review items</h2><ul>${exceptions}</ul><footer>Generated ${escapeHtml(new Date(data.generatedAt || Date.now()).toLocaleString())} · AGAPAY Give</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
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

  // ── QR CODE ───────────────────────────────────────────────
  // The AGAPAY mark embedded in the QR code needs to be a self-contained
  // data URI, not a /mark.png path reference. Live in the DOM, a path
  // reference resolves fine — but downloadQrPng() rasterizes the SVG via
  // an off-document Image()/canvas, and browsers refuse to load external
  // resources (or silently taint the canvas) for a detached, blob-sourced
  // SVG. Converting the logo to a data URI once and reusing it removes the
  // external reference entirely, so the logo survives the PNG export too.
  let markDataUriPromise = null;
  function markDataUri() {
    if (markDataUriPromise) return markDataUriPromise;
    markDataUriPromise = fetch('/mark.png')
      .then(res => res.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch(() => { markDataUriPromise = null; return ''; }); // allow retry on failure
    return markDataUriPromise;
  }

  async function renderQrCode() {
    const targets = ['qrCode','qrCodeHero','qrCodeHeroPreview','bulletinQrCode'].map(id=>document.getElementById(id)).filter(Boolean);
    const inputs  = ['givingUrlInput','givingUrlHeroInput','qrGivingUrlInput'].map(id=>document.getElementById(id)).filter(Boolean);
    const url     = dedicatedGivingUrl();
    inputs.forEach(inp => { inp.value = url; });
    if (!url || typeof qrcode === 'undefined') { targets.forEach(t => { t.innerHTML = '<span style="font-size:11px;color:var(--stone);text-align:center;line-height:1.5;">Load dashboard<br>to generate QR</span>'; }); currentQrSvg = ''; return; }
    const qr = qrcode(0,'H'); qr.addData(url); qr.make();
    const rawSvg = qr.createSvgTag(5,3).replace(/<svg /,'<svg role="img" aria-label="AGAPAY giving QR code" ').replace(/fill="#000000"/g,'fill="#061522"');
    currentQrSvg = brandQrSvg(rawSvg, '');
    targets.forEach(t => { t.innerHTML = currentQrSvg; });
    const logoHref = await markDataUri();
    if (logoHref) {
      currentQrSvg = brandQrSvg(rawSvg, logoHref);
      targets.forEach(t => { t.innerHTML = currentQrSvg; });
    }
  }

  function brandQrSvg(svg, logoHref) {
    const badge = `
      <g class="agapay-qr-badge" aria-hidden="true">
        <circle cx="50%" cy="50%" r="10.5%" fill="#FFFDF9" stroke="#C8A24A" stroke-width="1.4"/>
        ${logoHref ? `<image href="${logoHref}" x="41.5%" y="41.5%" width="17%" height="17%" preserveAspectRatio="xMidYMid meet"/>` : ''}
      </g>`;
    return svg.replace('</svg>', `${badge}</svg>`);
  }

  async function copyGivingLink() { const url=dedicatedGivingUrl(); if(!url){setStatus('Load a parish first.','error');return;} await navigator.clipboard.writeText(url); setStatus('Giving page link copied.','success'); }

  // A previously-rendered currentQrSvg can exist without the logo baked in —
  // e.g. the very first render happened before markDataUri() resolved, or a
  // transient fetch failure produced a logo-less badge that then got cached
  // as "the" QR code. Checking truthiness alone isn't enough; re-render
  // whenever the logo image isn't actually present in the markup.
  function qrHasLogo() { return currentQrSvg.includes('<image '); }

  async function downloadQrSvg() {
    if (!currentQrSvg || !qrHasLogo()) await renderQrCode(); if (!currentQrSvg){setStatus('QR code not ready yet.','error');return;}
    const svg=currentQrSvg.includes('xmlns=')?currentQrSvg:currentQrSvg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
    downloadBlob(qrFilename('svg'),new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    setStatus(qrHasLogo() ? 'QR code SVG downloaded.' : 'QR code SVG downloaded — logo could not be loaded, try again.', qrHasLogo() ? 'success' : 'error');
  }

  async function downloadQrPng() {
    if (!currentQrSvg || !qrHasLogo()) await renderQrCode(); if (!currentQrSvg){setStatus('QR code not ready yet.','error');return;}
    const svg=currentQrSvg.includes('xmlns=')?currentQrSvg:currentQrSvg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
    const img=new Image(); const svgUrl=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);ctx.drawImage(img,0,0,1200,1200);URL.revokeObjectURL(svgUrl);canvas.toBlob(blob=>{if(!blob){setStatus('Unable to create PNG.','error');return;}downloadBlob(qrFilename('png'),blob);setStatus(qrHasLogo() ? 'QR code PNG downloaded.' : 'QR code PNG downloaded — logo could not be loaded, try again.', qrHasLogo() ? 'success' : 'error');},'image/png');};
    img.onerror=()=>{URL.revokeObjectURL(svgUrl);setStatus('Unable to render QR code PNG.','error');};
    img.src=svgUrl;
  }

  // ── BULLETIN INSERT ───────────────────────────────────────
  function bulletinDisplayUrl() {
    return (dedicatedGivingUrl() || 'agapay.app/give/parish-name-city').replace(/^https?:\/\//i, '');
  }

  function positionBulletinQr(svg, x, y, size) {
    if (!svg) return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="#FFFFFF" stroke="#DDD6C9"/><text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="10" fill="#6F6A60">QR code</text>`;
    const opening = svg.match(/<svg\b[^>]*>/i)?.[0];
    if (!opening) return svg;
    const positioned = opening
      // qrcode-generator already sets preserveAspectRatio on its root SVG.
      // Remove every positioning attribute before adding the bulletin-specific
      // values so the nested SVG remains valid XML (duplicate attributes make
      // browsers reject the download and prevent PNG rasterization).
      .replace(/\s(?:x|y|width|height|preserveAspectRatio)=(?:"[^"]*"|'[^']*')/gi, '')
      .replace('<svg', `<svg x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"`);
    return svg.replace(opening, positioned);
  }

  function buildBulletinSvg() {
    const parishName = escapeHtml(currentParish?.parishName || 'Parish Name');
    const url        = escapeHtml(bulletinDisplayUrl());
    const parishSize = parishName.length > 46 ? 15 : parishName.length > 34 ? 17 : 19;
    const urlSize    = url.length > 54 ? 7 : url.length > 42 ? 8 : 9;
    const qrInner    = positionBulletinQr(currentQrSvg, 289, 94, 96);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="840" height="560">
      <rect width="420" height="280" fill="#FBF7EE"/>
      <rect width="420" height="68" fill="#061522"/>
      <rect y="66" width="420" height="2" fill="#C8A24A"/>
      <text x="24" y="30" font-family="Georgia,serif" font-size="${parishSize}" font-weight="bold" fill="#F6F1E8">${parishName}</text>
      <text x="396" y="43" text-anchor="end" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing="1.6" fill="#E8C879">ONLINE GIVING</text>
      <text x="24" y="116" font-family="Georgia,serif" font-size="24" font-weight="bold" letter-spacing="-.2" fill="#061522">Give with gratitude.</text>
      <text x="24" y="141" font-family="Arial,sans-serif" font-size="10" fill="#6F6A60">Support the life and ministries of our parish through</text>
      <text x="24" y="156" font-family="Arial,sans-serif" font-size="10" fill="#6F6A60">simple, secure online giving.</text>
      <rect x="24" y="182" width="230" height="32" rx="16" fill="#FFFFFF" stroke="#D8C38F"/>
      <text x="139" y="202" text-anchor="middle" font-family="Arial,sans-serif" font-size="${urlSize}" font-weight="bold" fill="#061522">${url}</text>
      <rect x="278" y="84" width="118" height="144" rx="10" fill="#FFFFFF" stroke="#C8A24A"/>
      ${qrInner}
      <text x="337" y="211" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing="1.3" fill="#8B681D">SCAN TO GIVE</text>
      <line x1="24" y1="246" x2="396" y2="246" stroke="#DDD6C9"/>
      <circle cx="28" cy="261" r="3.5" fill="#C8A24A"/>
      <text x="37" y="264" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" letter-spacing=".7" fill="#8F887C">POWERED BY AGAPAY</text>
    </svg>`;
  }

  async function downloadBulletinSvg() {
    if (!currentParish){setStatus('Load a parish first.','error');return;}
    if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
    const svg  = buildBulletinSvg();
    const name = `${currentParish.parishId || 'parish'}-bulletin-insert.svg`;
    downloadBlob(name, new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    setStatus('Bulletin insert SVG downloaded.','success');
  }

  async function downloadBulletinPng() {
    if (!currentParish){setStatus('Load a parish first.','error');return;}
    if (!currentQrSvg || !qrHasLogo()) await renderQrCode();
    const svg    = buildBulletinSvg();
    const img    = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = 1680; canvas.height = 1120;
      const ctx    = canvas.getContext('2d'); ctx.fillStyle = '#FFFDF9'; ctx.fillRect(0,0,1680,1120);
      ctx.drawImage(img,0,0,1680,1120); URL.revokeObjectURL(svgUrl);
      canvas.toBlob(blob => {
        if (!blob){setStatus('Unable to create PNG.','error');return;}
        downloadBlob(`${currentParish.parishId||'parish'}-bulletin-insert.png`, blob);
        setStatus('Bulletin insert PNG downloaded.','success');
      },'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(svgUrl); setStatus('Unable to render bulletin PNG.','error'); };
    img.src = svgUrl;
  }

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
      if (!data.checkoutUrl){if(win)win.close();await loadDashboard();setStatus('Subscription updated. No checkout required.','success');return;}
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

  // ── COMMUNICATIONS ────────────────────────────────────────
  // koinonia implementations live under features/koinonia/.

  // ── COMMEMORATIONS ────────────────────────────────────────
  function renderCommemorations(data) {
    const pane = document.getElementById('commemorationQueuePane'); if (!pane) return;
    const entries = data.entries || [];
    if (!entries.length) {
      pane.innerHTML = '<div class="pdx-commemoration-empty">No commemoration names submitted this week yet. Names will appear here as donors submit them.</div>';
      return;
    }
    const cards = [];
    entries.forEach(entry => {
      const from = entry.donorName || entry.name || entry.donorEmail || 'Anonymous';
      const when = shortDate(entry.createdAt || entry.date || entry.paidAt);
      const service = entry.commemorationKind === 'molieben_panikhida'
        ? 'Molieben / Panikhida'
        : 'Proskomedia / Liturgy';
      const meta = when
        ? `${escapeHtml(service)} · from ${escapeHtml(from)} · ${escapeHtml(when)}`
        : `${escapeHtml(service)} · from ${escapeHtml(from)}`;
      const living = Array.isArray(entry.living) ? entry.living.filter(Boolean) : [];
      const departed = Array.isArray(entry.departed) ? entry.departed.filter(Boolean) : [];
      if (living.length) {
        cards.push(`<div class="pdx-commemoration-card">
          <span class="pdx-commemoration-kind">For the Living</span>
          <span class="pdx-commemoration-names">${escapeHtml(living.join(', '))}</span>
          <span class="pdx-commemoration-from">${meta}</span>
        </div>`);
      }
      if (departed.length) {
        cards.push(`<div class="pdx-commemoration-card">
          <span class="pdx-commemoration-kind">For the Departed</span>
          <span class="pdx-commemoration-names">${escapeHtml(departed.join(', '))}</span>
          <span class="pdx-commemoration-from">${meta}</span>
        </div>`);
      }
    });
    pane.innerHTML = cards.length
      ? `<div class="pdx-commemoration-grid">${cards.join('')}</div>`
      : '<div class="pdx-commemoration-empty">Commemoration gifts were found this week but no names were attached.</div>';
  }

  async function loadCommemorations(btn) {
    const pane=document.getElementById('commemorationQueuePane'); if(!currentParish||!pane) return;
    if(btn){btn.classList.add('loading');btn.disabled=true;}
    pane.innerHTML='<p class="section-note">Loading this week\'s commemoration names...</p>';
    try {
      const res=await fetch('/api/parish/dashboard/'+encodeURIComponent(currentParish.parishId)+'/commemorations',{headers:authHeaders()});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Unable to load commemorations');
      renderCommemorations(data);
    } catch(err){pane.innerHTML=`<p class="section-note">${escapeHtml(err.message)}</p>`;}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
  }

  // ── URL PARAM AUTO-FILL ───────────────────────────────────
  function candleGiftSignals(gift = {}) {
    return [
      gift.giftType,
      gift.fund,
      gift.fundId,
      gift.campaign,
      gift.campaignId,
      gift.description,
      gift.label,
      gift.memo,
      gift.note
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function isCandleGift(gift) {
    const text = candleGiftSignals(gift);
    return /\bcandle|candles|vigil|intention|intentions\b/.test(text);
  }

  function giftNames(gift = {}) {
    const buckets = [
      gift.commemorationNames,
      gift.names,
      gift.namesLiving,
      gift.namesDeparted,
      gift.living,
      gift.departed
    ];
    return buckets
      .flatMap(value => Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/))
      .map(name => String(name || '').trim())
      .filter(Boolean);
  }

  function renderCandleGiving() {
    const pane = document.getElementById('candleGivingPane');
    if (!pane) return;
    const gifts = [...allGifts, ...manualAccountingGifts].filter(isCandleGift);
    if (!gifts.length) {
      pane.innerHTML = '<div class="pdx-candle-empty">No candle gifts found yet. Candle activity will appear here once donors choose a candle-related fund.</div>';
      return;
    }

    // Bucket last 6 months
    const now = new Date();
    const monthLabels = [];
    const monthKeys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      monthLabels.push(d.toLocaleDateString(undefined, { month: 'short' }));
    }
    const monthTotals = Object.fromEntries(monthKeys.map(k => [k, 0]));
    const priorSixMonthsTotal = { cents: 0 };
    gifts.forEach(gift => {
      const dateStr = gift.createdAt || gift.date || gift.paidAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cents = Number(gift.parishNetCents || gift.amountCents || 0);
      if (key in monthTotals) monthTotals[key] += cents;
      else {
        // Compute prior 6mo for trend comparison
        const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (monthsAgo >= 6 && monthsAgo < 12) priorSixMonthsTotal.cents += cents;
      }
    });
    const last6Total = Object.values(monthTotals).reduce((a, b) => a + b, 0);
    const maxMonth = Math.max(...Object.values(monthTotals), 1);
    const trend = priorSixMonthsTotal.cents > 0
      ? Math.round(((last6Total - priorSixMonthsTotal.cents) / priorSixMonthsTotal.cents) * 100)
      : null;

    const rows = monthKeys.map((k, i) => {
      const pct = Math.round((monthTotals[k] / maxMonth) * 100);
      return `<div class="pdx-candle-row">
        <span class="pdx-candle-name">${escapeHtml(monthLabels[i])}</span>
        <div class="pdx-candle-bar-track"><div class="pdx-candle-bar-fill" data-fill="${pct}"></div></div>
        <span class="pdx-candle-value">${escapeHtml(money(monthTotals[k]))}</span>
      </div>`;
    }).join('');

    const trendChip = trend === null
      ? ''
      : trend > 0
        ? `<span class="pdx-delta up" style="font-size:12px;">${trend}% vs. prior 6mo</span>`
        : trend < 0
          ? `<span class="pdx-delta down" style="font-size:12px;">${Math.abs(trend)}% vs. prior 6mo</span>`
          : `<span class="pdx-delta flat" style="font-size:12px;">Flat vs. prior 6mo</span>`;

    pane.innerHTML = `
      <div class="pdx-candle-list">${rows}</div>
      <div class="pdx-candle-summary">
        <div>
          <div class="pdx-candle-summary-label">6-month total</div>
          <div class="pdx-candle-summary-total">${escapeHtml(money(last6Total))}</div>
        </div>
        ${trendChip}
      </div>`;

    // Animate bar fills
    requestAnimationFrame(() => setTimeout(() => {
      pane.querySelectorAll('.pdx-candle-bar-fill').forEach((el, i) => {
        setTimeout(() => { el.style.width = el.dataset.fill + '%'; }, i * 80);
      });
    }, 100));
  }

  const params = new URLSearchParams(window.location.search);
  const parishIdField = document.getElementById('parishId');
  if (params.get('parish') && parishIdField) parishIdField.value = params.get('parish');
  initReconciliationMonths();
  if (!initParishAccessInvitationPage()) initParishPasswordResetPage();


// ═══════════════════════════════════════════════════════════════
// CAMPAIGN MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function renderCampaignList(parish) {
  const pane = document.getElementById('campaignListPane');
  if (!pane) return;
  const campaigns = parish?.campaigns || [];
  if (!campaigns.length) {
    pane.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg></div><h3>No campaigns yet</h3><p>Create your first campaign to start a dedicated fundraising page donors can share.</p></div>';
    return;
  }
  const usd = c => (Number(c||0)/100).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const statusMap = { active:{label:'Active',cls:'status-active'}, completed:{label:'Completed',cls:'status-completed'}, paused:{label:'Paused',cls:'status-paused'} };
  pane.innerHTML = campaigns.map(c => {
    const raised = Number(c.raisedCents||0), goal = Number(c.goalCents||0);
    const pct    = goal > 0 ? Math.min(100, Math.round((raised/goal)*100)) : 0;
    const slug   = c.slug || slugifyCampaign(c.name);
    const pageUrl = campaignPublicUrl(parish.parishId, slug);
    const s = statusMap[c.status] || statusMap.active;
    const campaignId = String(c.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div class="campaign-list-item" style="border:1px solid var(--line);border-radius:10px;padding:1rem 1.1rem;margin-bottom:10px;background:var(--paper);">' +
      '<div style="display:flex;align-items:flex-start;gap:8px;">' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
      '<strong style="font-size:0.95rem;color:var(--ink)">' + escCamp(c.name) + '</strong>' +
      '<span class="' + s.cls + '" style="display:inline-flex;align-items:center;gap:5px;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:0.2rem 0.6rem;border-radius:100px;">' + s.label + '</span>' +
      '</div>' +
      '<div style="width:100%;height:6px;background:var(--gold-soft,rgba(200,162,74,0.15));border-radius:100px;overflow:hidden;margin:4px 0 2px;">' +
      '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#C8A24A,#e8c56a);border-radius:100px;transition:width 0.8s ease;"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--stone);">' +
      '<span>' + usd(raised) + ' raised' + (goal ? ' of ' + usd(goal) : '') + '</span>' +
      '<span>' + (c.giftCount||0) + ' gift' + ((c.giftCount||0)!==1?'s':'') + '</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">' +
      '<a href="' + pageUrl + '" target="_blank" class="btn btn-ghost btn-sm" title="View public page">&#8599; View</a>' +
      '<button class="btn btn-ghost btn-sm" onclick="editCampaign(\'' + campaignId + '\')" title="Edit">Edit</button>' +
      '</div></div></div>';
  }).join('');
}

function slugifyCampaign(str) {
  return String(str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function campaignPublicUrl(parishId, campaignSlug) {
  const parishSegment = slugifyCampaign(parishId);
  const campaignSegment = slugifyCampaign(campaignSlug).replace(/-campaign$/, '');
  return '/give/' + encodeURIComponent(parishSegment) + '/' + encodeURIComponent(campaignSegment) + '-campaign';
}

function escCamp(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openNewCampaignForm() {
  editingCampaignId = null; campaignCoverUrl = ''; campaignPhotos = [];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('campName',''); set('campGoal',''); set('campEndsAt',''); set('campDescription','');
  const statusEl = document.getElementById('campStatus'); if (statusEl) statusEl.value = 'active';
  const preview = document.getElementById('campCoverPreview'); if (preview) preview.hidden = true;
  const placeholder = document.getElementById('campCoverPlaceholder'); if (placeholder) placeholder.hidden = false;
  const grid = document.getElementById('campPhotosGrid'); if (grid) grid.innerHTML = '';
  const statusSpan = document.getElementById('campSaveStatus'); if (statusSpan) statusSpan.textContent = '';
  const updateCard = document.getElementById('campaignUpdateCard'); if (updateCard) updateCard.hidden = true;
  const editorCard = document.getElementById('campaignEditorCard');
  if (editorCard) { editorCard.hidden = false; editorCard.scrollIntoView({behavior:'smooth',block:'start'}); }
}

function editCampaign(campaignId) {
  if (!currentParish) return;
  const c = (currentParish.campaigns||[]).find(x => x.id === campaignId);
  if (!c) return;
  editingCampaignId = campaignId; campaignCoverUrl = c.coverPhotoUrl || ''; campaignPhotos = (c.photos||[]).map(p => typeof p === 'string' ? {url:p,key:''} : p);
  const titleEl = document.getElementById('campaignEditorTitle'); if (titleEl) titleEl.textContent = 'Edit Campaign';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('campName', c.name); set('campGoal', c.goalCents ? String(Math.round(c.goalCents/100)) : '');
  set('campEndsAt', c.endsAt ? c.endsAt.substring(0,10) : '');
  set('campDescription', c.description);
  const statusEl = document.getElementById('campStatus'); if (statusEl) statusEl.value = c.status || 'active';
  const statusSpan = document.getElementById('campSaveStatus'); if (statusSpan) statusSpan.textContent = '';
  const preview = document.getElementById('campCoverPreview');
  const placeholder = document.getElementById('campCoverPlaceholder');
  const coverImg = document.getElementById('campCoverImg');
  if (campaignCoverUrl && preview && placeholder && coverImg) {
    coverImg.src = campaignCoverUrl; preview.hidden = false; placeholder.hidden = true;
  } else if (preview && placeholder) { preview.hidden = true; placeholder.hidden = false; }
  renderCampPhotosGrid();
  const editorCard = document.getElementById('campaignEditorCard');
  const updateCard = document.getElementById('campaignUpdateCard');
  if (editorCard) { editorCard.hidden = false; editorCard.scrollIntoView({behavior:'smooth',block:'start'}); }
  if (updateCard) updateCard.hidden = false;
}

function closeCampaignEditor() {
  const editorCard = document.getElementById('campaignEditorCard'); if (editorCard) editorCard.hidden = true;
  const updateCard = document.getElementById('campaignUpdateCard'); if (updateCard) updateCard.hidden = true;
  editingCampaignId = null;
}

async function uploadCampaignPhoto(file, campaignId) {
  const parishId = currentParish?.parishId; if (!parishId) throw new Error('No parish loaded');
  const qs = campaignId ? '?campaign=' + encodeURIComponent(campaignId) : '';
  const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId) + '/campaign-upload' + qs, {
    method:'POST', headers:{...authHeaders(),'Content-Type':file.type}, body:file
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function handleCoverUpload(input) {
  const file = input.files?.[0]; if (!file) return;
  const zone = document.getElementById('campCoverUploadZone'); if (zone) zone.style.opacity = '0.6';
  try {
    const result = await uploadCampaignPhoto(file, editingCampaignId);
    campaignCoverUrl = result.url;
    const img = document.getElementById('campCoverImg'); if (img) img.src = campaignCoverUrl;
    const preview = document.getElementById('campCoverPreview'); if (preview) preview.hidden = false;
    const placeholder = document.getElementById('campCoverPlaceholder'); if (placeholder) placeholder.hidden = true;
  } catch(e) { alert('Cover upload failed: ' + e.message); }
  finally { if (zone) zone.style.opacity = ''; input.value = ''; }
}

function removeCoverPhoto(e) {
  e.stopPropagation(); campaignCoverUrl = '';
  const img = document.getElementById('campCoverImg'); if (img) img.src = '';
  const preview = document.getElementById('campCoverPreview'); if (preview) preview.hidden = true;
  const placeholder = document.getElementById('campCoverPlaceholder'); if (placeholder) placeholder.hidden = false;
}

async function handlePhotosUpload(input) {
  const files = Array.from(input.files||[]); if (!files.length) return;
  for (const file of files) {
    try { const r = await uploadCampaignPhoto(file, editingCampaignId); campaignPhotos.push({url:r.url,key:r.key}); }
    catch(e) { alert('Photo upload failed: ' + e.message); }
  }
  renderCampPhotosGrid(); input.value = '';
}

function renderCampPhotosGrid() {
  const grid = document.getElementById('campPhotosGrid'); if (!grid) return;
  grid.innerHTML = campaignPhotos.map((p,i) =>
    '<div style="position:relative;"><img src="' + p.url + '" alt="Photo ' + (i+1) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;" />' +
    '<button type="button" onclick="removeCampPhoto(' + i + ')" style="position:absolute;top:4px;right:4px;background:rgba(6,21,34,0.72);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:0.75rem;line-height:1;">&#10005;</button></div>'
  ).join('');
}

function removeCampPhoto(i) { campaignPhotos.splice(i,1); renderCampPhotosGrid(); }

async function saveCampaign() {
  if (!currentParish) return;
  const statusSpan = document.getElementById('campSaveStatus');
  const btn = document.getElementById('saveCampaignBtn');
  const name = (document.getElementById('campName')?.value || '').trim();
  if (!name) { if (statusSpan) statusSpan.textContent = 'Campaign name is required.'; return; }
  const goalVal = (document.getElementById('campGoal')?.value || '').trim();
  const campaignData = {
    id: editingCampaignId || ('camp_' + crypto.randomUUID().replace(/-/g,'').substring(0,10)),
    name,
    slug: slugifyCampaign(name),
    goalCents: goalVal ? Math.round(Number(goalVal)*100) : 0,
    description: (document.getElementById('campDescription')?.value || '').trim(),
    status: document.getElementById('campStatus')?.value || 'active',
    endsAt: document.getElementById('campEndsAt')?.value || '',
    coverPhotoUrl: campaignCoverUrl,
    photos: campaignPhotos.map(p => ({url:p.url,key:p.key})),
    createdAt: editingCampaignId ? ((currentParish.campaigns||[]).find(c=>c.id===editingCampaignId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updates: editingCampaignId ? ((currentParish.campaigns||[]).find(c=>c.id===editingCampaignId)?.updates || []) : [],
  };
  let campaigns = [...(currentParish.campaigns||[])];
  campaigns = editingCampaignId ? campaigns.map(c => c.id===editingCampaignId ? campaignData : c) : [...campaigns, campaignData];
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  if (statusSpan) statusSpan.textContent = 'Saving…';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method:'PATCH', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({campaigns})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    currentParish = {...currentParish, campaigns: data.campaigns||campaigns};
    editingCampaignId = campaignData.id;
    renderCampaignList(currentParish);
    const updateCard = document.getElementById('campaignUpdateCard'); if (updateCard) updateCard.hidden = false;
    const slug = campaignData.slug;
    const pageUrl = campaignPublicUrl(currentParish.parishId, slug);
    if (statusSpan) statusSpan.innerHTML = '✓ Saved — <a href="' + pageUrl + '" target="_blank" style="color:var(--gold)">View campaign page ↗</a>';
  } catch(e) {
    if (statusSpan) statusSpan.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

async function postCampaignUpdate() {
  if (!currentParish || !editingCampaignId) return;
  const body = (document.getElementById('updateBody')?.value || '').trim();
  const statusSpan = document.getElementById('updatePostStatus');
  if (!body) { if (statusSpan) statusSpan.textContent = 'Write something first.'; return; }
  const campaign = (currentParish.campaigns||[]).find(c => c.id===editingCampaignId);
  if (!campaign) return;
  const newUpdate = { id:'upd_'+crypto.randomUUID().replace(/-/g,'').substring(0,10), date:new Date().toISOString(), body };
  const updates = [newUpdate, ...(campaign.updates||[])];
  const campaigns = (currentParish.campaigns||[]).map(c => c.id===editingCampaignId ? {...c,updates} : c);
  if (statusSpan) statusSpan.textContent = 'Posting…';
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method:'PATCH', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({campaigns})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    currentParish = {...currentParish, campaigns: data.campaigns||campaigns};
    const bodyEl = document.getElementById('updateBody'); if (bodyEl) bodyEl.value = '';
    if (statusSpan) statusSpan.textContent = '✓ Update posted';
    setTimeout(() => { if (statusSpan) statusSpan.textContent = ''; }, 3000);
  } catch(e) {
    if (statusSpan) statusSpan.textContent = 'Error: ' + e.message;
  }
}
