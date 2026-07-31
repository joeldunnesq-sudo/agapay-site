// ── STATE ────────────────────────────────────────────────
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
  const parishSessionStorageKey = 'agapay_parish_session_token';
  const legacyParishTokenStorageKey = 'agapay_parish_token';

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

  function setPaymentStatus(msg, tone) {
    const el = document.getElementById('paymentStatus');
    if (el) el.textContent = msg || '';
    setStatus(msg, tone);
  }

  // ── TAB NAV ──────────────────────────────────────────────
  function switchTab(tab) {
    if (tab === 'parishplus') tab = 'bookstore';
    if (tab === 'commerce') tab = 'bookstore';
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach(n => n.classList.remove('active'));
    const panel = document.getElementById('tab-' + tab);
    const nav   = document.getElementById('nav-' + tab);
    const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
    if (panel) panel.classList.add('active');
    if (nav)   nav.classList.add('active');
    if (mobileNav) mobileNav.classList.add('active');
    document.querySelector('.app')?.classList.toggle('directory-tab-active', tab === 'directory');
    document.querySelector('.content')?.classList.toggle('directory-tab-active', tab === 'directory');
    document.querySelector('.app')?.classList.toggle('accounting-tab-active', tab === 'accounting');
    document.querySelector('.content')?.classList.toggle('accounting-tab-active', tab === 'accounting');
    document.querySelector('.app')?.classList.toggle('commerce-tab-active', tab === 'bookstore');
    document.querySelector('.content')?.classList.toggle('commerce-tab-active', tab === 'bookstore');
    document.querySelector('.app')?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
    document.querySelector('.content')?.classList.toggle('sacraments-tab-active', tab === 'sacraments');
    if (tab === 'accounting') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    activeTab = tab;
    const titles = { giving:'Giving Overview', reconcile:'Monthly Reconciliation', history:'Giving History', givers:'Givers', settings:'Settings', options:'Funds & Alms', campaigns:'Campaigns', text:'Text-to-Give', stewardship:'Stewardship Health', accounting:'Accounting', sacraments:'Sacraments & Services', directory:'Parish Directory', bookstore:'Commerce', qr:'QR Code & Giving Link' };
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    document.getElementById('topbarTitle').textContent = (isMobile && currentParish) ? (currentParish.parishName || 'Parish Dashboard') : (titles[tab] || 'Parish Dashboard');
    syncTopbarTabIcon(tab);
    if ((tab === 'history' || tab === 'givers' || tab === 'options') && currentParish && !allGifts.length) loadGivingHistory();
    if (tab === 'givers' && allGifts.length) renderGiversPanel();
    if (tab === 'options' && currentParish) renderGivingOptionsEditor();
    if (tab === 'campaigns' && currentParish) renderCampaignList(currentParish);
    if (tab === 'qr') { renderQrCode(); renderBulletinPreview(); }
    if (tab === 'stewardship') loadStewardshipPanel();
    if (tab === 'sacraments') loadSacramentsTab();
    if (tab === 'directory' && moduleIncluded('directory')) loadDirectoryAdminTab();
    if (tab === 'accounting') loadAccountingTab();
    if (tab === 'bookstore') {
      switchCommerceProduct(moduleIncluded('commerceSuite') ? 'overview' : 'bookstore', false);
      loadBookstoreCatalogTab();
    }
    if (tab === 'reconcile' && currentParish) loadReconciliation();
    if (tab === 'settings' && currentParish) loadSettlementProfilesPanel();
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
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
    const request = featureRequests.find((item) => item?.featureId === 'giving-plus')
      || featureRequests.find((item) => item?.featureId === 'pledge-tracker');
    const dialog = document.getElementById('parishFeatureRequestDialog');
    if (!request || !dialog) return;
    activeParishFeatureRequest = request;
    const count = Math.max(1, Number(request.count || 1));
    const copy = document.getElementById('parishFeatureRequestCopy');
    const featureTitle = document.getElementById('parishFeatureRequestTitle');
    const featureDescription = document.getElementById('parishFeatureRequestDescription');
    const action = document.getElementById('parishFeatureRequestAction');
    const status = document.getElementById('parishFeatureRequestStatus');
    const givingPlus = request.featureId === 'giving-plus';
    if (copy) copy.textContent = count === 1
      ? `A parishioner asked your church to add ${givingPlus ? 'more giving options through Giving Plus' : 'pledge tracking and the Stewardship features that support it'}.`
      : `${count} parishioners asked your church to add ${givingPlus ? 'more giving options through Giving Plus' : 'pledge tracking and the Stewardship features that support it'}.`;
    if (featureTitle) featureTitle.textContent = givingPlus ? 'More ways to give' : 'Annual pledge progress';
    if (featureDescription) featureDescription.textContent = givingPlus
      ? 'Giving Plus unlocks designated funds, candles, commemorations, campaigns, festal alms, and other donor giving choices.'
      : 'The Stewardship tier gives parishioners a live pledge tracker and gives parish leaders pledge, giving-health, and annual-meeting insights.';
    if (action) action.textContent = givingPlus ? 'View Giving Plus tier' : 'View Stewardship tier';
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
      if (!data.token) throw new Error('Login succeeded but no session token was returned.');
      sessionStorage.setItem('agapay_parish_id', parishId);
      sessionStorage.setItem(parishSessionStorageKey, data.token);
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
    ['parishLoginForm', 'parishResetRequestForm', 'parishResetConfirmForm'].forEach((id) => {
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

  function directoryAdminApi(path = '') {
    if (!currentParish?.parishId) return '';
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/directory/admin' + path;
  }

  async function loadDirectoryAdminTab(force = false) {
    const pane = document.getElementById('directoryAdminPane');
    if (!pane) return;
    if (!currentParish?.parishId) {
      pane.innerHTML = '<p class="muted">Load your parish dashboard before opening Directory Operations.</p>';
      return;
    }
    if (!force && pane.dataset.loaded === 'true') return;
    pane.innerHTML = '<p class="sw-tool-loading">Loading directory operations...</p>';
    const headers = authHeaders();
    try {
      const [settingsRes, dashboardRes, peopleRes, householdsRes, skillsRes, maintenanceRes, printRes] = await Promise.all([
        fetch(directoryAdminApi('/settings'), { headers }),
        fetch(directoryAdminApi('/dashboard'), { headers }),
        fetch(directoryAdminApi('/people?limit=8'), { headers }),
        fetch(directoryAdminApi('/households?limit=100'), { headers }),
        fetch(directoryAdminApi('/skills/listings?limit=8'), { headers }),
        fetch(directoryAdminApi('/maintenance'), { headers }),
        fetch(directoryAdminApi('/print/directory'), { headers })
      ]);
      if (dashboardRes.status === 401 || dashboardRes.status === 403) {
        const errorPayload = await dashboardRes.json().catch(() => ({}));
        pane.dataset.loaded = 'true';
        pane.innerHTML = renderDirectoryAdminAccessError(dashboardRes.status, errorPayload.message || errorPayload.error || '');
        return;
      }
      const settings = await settingsRes.json().catch(() => ({ settings: {} }));
      const dashboard = await dashboardRes.json();
      const people = await peopleRes.json();
      const households = await householdsRes.json();
      const skills = await skillsRes.json().catch(() => ({ skills: { listings: [] } }));
      const maintenance = await maintenanceRes.json().catch(() => ({ maintenance: {} }));
      const print = await printRes.json().catch(() => ({ print: {} }));
      renderDirectoryAdminPanel(dashboard.dashboard || {}, people.people || [], households.households || [], skills.skills || {}, maintenance.maintenance || {}, print.print || {}, settings.settings || {});
      pane.dataset.loaded = 'true';
    } catch (err) {
      pane.innerHTML = renderDirectoryAdminGenericError();
    }
  }

  let directoryAdminTab = 'directory';
  let directoryBrowseType = 'household';
  let directoryLastData = null;

  function switchDirectoryAdminTab(tab) {
    directoryAdminTab = tab;
    const pane = document.getElementById('directoryAdminPane');
    if (!pane) return;
    pane.querySelectorAll('[data-dir-tab]').forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.dirTab === tab)));
    pane.querySelectorAll('[data-dir-panel]').forEach((panel) => { panel.hidden = panel.dataset.dirPanel !== tab; });
  }

  // Single browse surface shared by People and Households -- previously
  // three separate sections (a photo gallery, a People list, a Households
  // list) covered the same "find a record" task with three different
  // layouts. One toggle + one search box + one result list replaces all
  // three.
  function directoryBrowseRow(record) {
    return directoryBrowseType === 'household' ? directoryHouseholdRow(record) : directoryPersonRow(record);
  }

  function renderDirectoryBrowseList(records) {
    const list = document.getElementById('directoryBrowseList');
    if (!list) return;
    const sortedRecords = [...records].sort((a, b) => directoryHouseholdSortKey(a.displayName).localeCompare(directoryHouseholdSortKey(b.displayName)));
    list.innerHTML = sortedRecords.length
      ? sortedRecords.map((record) => directoryCanonicalHouseholdRow(record, directoryLastData?.print?.households || [], directoryLastData?.skills?.listings || [])).join('')
      : `<tr><td colspan="4">${directoryEmptyState('No matches', 'No households match your search.')}</td></tr>`;
    hydrateDirectoryAdminImages(list);
  }

  function switchDirectoryBrowseType(type) {
    directoryBrowseType = type;
    const pane = document.getElementById('directoryAdminPane');
    pane?.querySelectorAll('[data-browse-type]').forEach((btn) => btn.classList.toggle('active', btn.dataset.browseType === type));
    const input = document.getElementById('directoryBrowseSearch');
    if (input) input.placeholder = type === 'household' ? 'Search by family name' : 'Search by person name';
    renderDirectoryBrowseList(type === 'household' ? (directoryLastData?.households || []) : (directoryLastData?.people || []));
  }

  let directoryBrowseSearchTimer = null;
  function searchDirectoryBrowse(value) {
    clearTimeout(directoryBrowseSearchTimer);
    directoryBrowseSearchTimer = setTimeout(() => runDirectoryBrowseSearch(String(value || '').trim()), 250);
  }
  async function runDirectoryBrowseSearch(query) {
    const list = document.getElementById('directoryBrowseList');
    if (!list) return;
    if (!query) { renderDirectoryBrowseList(directoryBrowseType === 'household' ? (directoryLastData?.households || []) : (directoryLastData?.people || [])); return; }
    list.innerHTML = '<p class="sw-tool-loading">Searching…</p>';
    try {
      const res = await fetch(directoryAdminApi('/households?limit=100&q=' + encodeURIComponent(query)), { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Search failed.');
      renderDirectoryBrowseList(payload.households || []);
    } catch (err) {
      list.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to search.')}</p>`;
    }
  }

  function renderDirectoryAdminPanel(dashboard, people, households, skills, maintenance, print, settings = {}) {
    const pane = document.getElementById('directoryAdminPane');
    if (!pane) return;
    const sortedHouseholds = [...households].sort((a, b) => directoryHouseholdSortKey(a.displayName).localeCompare(directoryHouseholdSortKey(b.displayName)));
    directoryLastData = { people, households: sortedHouseholds, skills, maintenance, print, settings };
    const parishName = currentParish?.parishName || currentParish?.name || 'Your parish';
    const publishedMembers = Array.isArray(print?.households) ? print.households : [];
    const publishedMemberCount = publishedMembers.length || people.length;
    const skillOptions = [...new Set((skills.listings || []).map((item) => item.displayLabel || item.skill?.name).filter(Boolean))].sort();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    pane.innerHTML = `
      <div class="pdx-dir-print-sheet">
      <section class="pdx-dir-canonical-head sw-suite-hero">
        <div class="sw-suite-hero-copy">
          <span class="pdx-dir-canonical-kicker sw-suite-eyebrow">Parish member records</span>
          <h1 class="sw-suite-heading">Parish Directory</h1>
          <p class="sw-suite-subhead">Find families, member contact information, namedays, and ways parishioners can help. <strong>${households.length}</strong> households <i></i> <strong>${publishedMemberCount}</strong> members</p>
        </div>
        <div class="pdx-dir-canonical-actions sw-suite-hero-status agapay-feature-actions">
          ${renderDirectoryFeatureToggle(settings)}
          <button class="pdx-dir-export-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/published-adults.csv')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>Export CSV</button>
          <button class="pdx-dir-print-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/directory.pdf')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>Download PDF</button>
        </div>
      </section>
      <div class="pdx-dir-tabs pdx-dir-view-switcher" role="tablist" aria-label="Parish directory views">
        <button class="pdx-dir-tab" type="button" role="tab" data-dir-tab="directory" aria-selected="true" onclick="switchDirectoryAdminTab('directory')">
          <span class="pdx-dir-tab-mark" aria-hidden="true">1</span>
          <span><strong>Families &amp; Members</strong><small>Search and review parish household records</small></span>
        </button>
        <button class="pdx-dir-tab" type="button" role="tab" data-dir-tab="tools" aria-selected="false" onclick="switchDirectoryAdminTab('tools')">
          <span class="pdx-dir-tab-mark" aria-hidden="true">2</span>
          <span><strong>Directory Management</strong><small>Skills, exports, and records needing attention</small></span>
        </button>
      </div>
      <div class="pdx-dir-tab-panel" data-dir-panel="directory">
        <section class="pdx-dir-privacy-bar">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Authorized parish staff always see the complete contact record.</span>
          <div class="pdx-dir-contact-mode" aria-label="Directory sharing legend">
            <span class="pdx-dir-contact-visibility is-shared" aria-hidden="true">●</span><b>Visible in My AGAPAY directory</b>
            <span class="pdx-dir-contact-visibility is-private" aria-hidden="true">●</span><b>Private from parishioners</b>
          </div>
          <small>The eye reports the family’s sharing choice. A street address is never shown to parishioners; only city and state can be shared.</small>
        </section>
        <section class="pdx-dir-canonical-controls">
          <label><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="search" id="directoryBrowseSearch" placeholder="Search by family or member name" oninput="searchDirectoryBrowse(this.value)" /></label>
          <select id="directoryNamedayFilter" onchange="filterCanonicalDirectoryRows()"><option value="">All namedays</option>${months.map((month) => `<option value="${month}">${month}</option>`).join('')}</select>
          <select id="directorySkillFilter" onchange="filterCanonicalDirectoryRows()"><option value="">All skills</option>${skillOptions.map((skill) => `<option value="${escapeAttr(skill)}">${escapeHtml(skill)}</option>`).join('')}</select>
        </section>
        <div class="pdx-dir-table-wrap">
          <table class="pdx-dir-table">
            <thead><tr><th>Household</th><th>Members &amp; Namedays</th><th>Contact &amp; Parishioner Visibility</th><th>Skills to Serve</th></tr></thead>
            <tbody id="directoryBrowseList">${sortedHouseholds.length ? sortedHouseholds.map((household) => directoryCanonicalHouseholdRow(household, publishedMembers, skills.listings || [])).join('') : `<tr><td colspan="4">${directoryEmptyState('No households yet', 'Households appear here after families join the parish directory.')}</td></tr>`}</tbody>
          </table>
        </div>
        <p class="pdx-dir-canonical-note"><strong>Where do these records come from?</strong> Families enter and maintain their information in My AGAPAY. Parish staff can review the information here without changing a family’s privacy choices.</p>
      </div>

      <div class="pdx-dir-tab-panel" data-dir-panel="tools" hidden>
        <section class="pdx-dir-management-intro">
          <span>Directory Management</span>
          <h2>Keep parish information useful and current</h2>
          <p>Review parishioner skills, export office lists, and follow up on records that need confirmation. Nothing in this area changes what parishioners can see unless you explicitly approve a publication request.</p>
        </section>
        <section class="pdx-panel pdx-dir-panel-skills">
          <div class="pdx-panel-header">
            <div class="pdx-panel-title"><div class="pdx-panel-title-icon"><svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5l-5-5 7-1z"/></svg></div>Parishioner Skills &amp; Service</div>
            <button class="pdx-link-btn" type="button" onclick="loadDirectoryAdminTab(true)">Refresh</button>
          </div>
          <p class="section-note">See the skills parishioners have volunteered to share, such as cooking, repairs, teaching, transportation, or event help.</p>
          <div class="pdx-dir-row-list">
            ${directorySkillsAdminRows(skills.listings || [])}
          </div>
          <div class="pdx-dir-actions">
            <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/skills.csv')">Skills CSV</button>
            <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/published-adults.csv')">Published Adults CSV</button>
            <button class="pdx-dir-action-btn" type="button" onclick="previewDirectoryAdminPrint('/print/skills')">Print Skills</button>
            <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/directory.pdf')">Download Directory PDF</button>
          </div>
        </section>
        <section class="pdx-panel">
          <div class="pdx-panel-header">
            <div class="pdx-panel-title"><div class="pdx-panel-title-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg></div>Directory Health</div>
          </div>
          <p class="section-note">These lists identify records that may need parish-office follow-up. Select an item to open the relevant record.</p>
          <div class="pdx-dir-row-list">
            ${directoryMaintenanceRow('Households current', maintenance.householdsCurrent, false, 'Verified recently and ready for member self-service.')}
            ${directoryMaintenanceRow('Households due', maintenance.householdsDue, false, 'Need annual confirmation soon.')}
            ${directoryMaintenanceRow('Overdue households', maintenance.householdsOverdue, true, 'Need staff follow-up now.')}
            ${directoryMaintenanceRow('Households not yet confirmed', maintenance.householdsNotStarted, true, 'These families were missing before because no confirmation record existed.')}
            ${directoryMaintenanceRow('Families with a My AGAPAY manager', maintenance.accountManagedHouseholds, false, 'One linked household account maintains the family directory entry and tax documents.')}
            ${directoryMaintenanceRow('Families needing account access', maintenance.householdsNeedingAccountAccess, true, 'No linked family account can maintain this household yet.')}
            ${directoryMaintenanceRow('Skill consents to review', maintenance.staleSkillConsents, false, 'Skill listings that need renewed consent.')}
            ${directoryMaintenanceRow('People not connected to a family account', maintenance.unclaimedPeople, true, 'Spouses and other adults are covered when their household already has a My AGAPAY manager.')}
          </div>
          ${directoryMaintenanceActions(maintenance.actions || {})}
        </section>
        <div id="directoryManagementDetail" class="pdx-dir-review-detail" aria-live="polite"></div>
      </div>
      </div>`;
    switchDirectoryAdminTab(directoryAdminTab);
    hydrateDirectoryAdminImages(pane);
  }

  function renderDirectoryFeatureToggle(settings = {}) {
    const enabled = Boolean(settings.directoryEnabled && settings.ordinaryMemberAccessEnabled);
    return `<label class="sac-admin-switch pdx-dir-feature-switch agapay-feature-switch" title="Show or hide the parish directory in My AGAPAY">
      <input type="checkbox" aria-label="Show parish directory in My AGAPAY" ${enabled ? 'checked' : ''} onchange="toggleDirectoryFeature(this)" />
      <span aria-hidden="true"></span>
      <em>${enabled ? 'On' : 'Off'}</em>
    </label>`;
  }

  async function toggleDirectoryFeature(input) {
    if (!currentParish) return;
    const enabled = Boolean(input?.checked);
    const previous = Boolean(currentParish.directoryEnabled);
    if (input) input.disabled = true;
    try {
      const response = await fetch(directoryAdminApi('/settings'), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ directoryEnabled: enabled, ordinaryMemberAccessEnabled: enabled })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Unable to update the parish directory.');
      const saved = payload.settings || {};
      currentParish.directoryEnabled = Boolean(saved.directoryEnabled && saved.ordinaryMemberAccessEnabled);
      syncModuleStatusNavigation('directory', moduleIncluded('directory'), currentParish.directoryEnabled);
      setStatus(currentParish.directoryEnabled ? 'Parish Directory is on for parishioners.' : 'Parish Directory is off for parishioners.', 'success');
      await loadDirectoryAdminTab(true);
    } catch (error) {
      currentParish.directoryEnabled = previous;
      if (input) input.checked = previous;
      setStatus(error.message, 'error');
    } finally {
      if (input) input.disabled = false;
    }
  }

  function hasGivingPlusAccess() {
    if (currentParish?.entitlements) return Boolean(currentParish.entitlements.givingFeatures?.branding);
    return String(currentParish?.subscriptionTier || '').toLowerCase() !== 'starter';
  }

  const starterLockedFeatures = {
    options: ['Custom funds & alms', 'Create and name custom funds, organize designated giving, and manage standing alms with Giving Plus.'],
    campaigns: ['Campaign pages', 'Create goal-based, shareable campaigns with Giving Plus.'],
    givers: ['Giver insights', 'See donor-level history and deeper giving reports with Giving Plus.'],
    reconcile: ['Monthly reconciliation', 'Match gifts, fees, refunds, and Stripe deposits with Giving Plus.'],
    commemorations: ['Commemorations', 'Candles, liturgical commemorations, Moliebens, Panikhidas, and the priest queue are included with Giving Plus.'],
    statements: ['Annual giving statements', 'Generate and email annual donor statements with Giving Plus.'],
    stewardship: ['Stewardship Health', 'Track pledges, understand giving health, prepare stewardship reports, and keep annual records with the Stewardship tier.'],
    bookstore: ['Parish Commerce', 'Manage bookstore sales now and add more parish commerce products as they become available in the Stewardship tier.'],
    sacraments: ['Sacraments & Services', 'Receive pastoral requests, coordinate clergy schedules, and keep families informed with the Parish tier.'],
    text: ['Text-to-Give', 'Reserve parish keywords and route donors from the shared AGAPAY number to the right giving page with the Parish tier.'],
    accounting: ['Parish Accounting', 'Keep funds, ledgers, payables, budgets, reconciliation, and financial reports together with the Parish tier.'],
    directory: ['Parish Directory', 'Manage member and household records, privacy controls, namedays, ministries, and parish connections with the Parish tier.']
  };

  function starterPaywallMarkup(featureKey, tierLabel = 'Giving Plus') {
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
      options: document.getElementById('tab-options'),
      campaigns: document.getElementById('tab-campaigns'),
      givers: document.getElementById('tab-givers'),
      reconcile: document.getElementById('tab-reconcile'),
      commemorations: document.getElementById('commemorationQueueCard'),
      statements: document.getElementById('pdxGsSection')
    };
    Object.entries(givingPlusTargets).forEach(([key, element]) => {
      syncDashboardPaywall(element, key, 'Giving Plus', givingPlusLocked);
      if (['options', 'campaigns', 'givers', 'reconcile'].includes(key)) syncTierRequirementNavigation(key, 'Giving Plus', !givingPlusLocked);
    });

    const stewardshipTargets = {
      stewardship: document.getElementById('tab-stewardship'),
      bookstore: document.getElementById('tab-bookstore')
    };
    Object.entries(stewardshipTargets).forEach(([key, element]) => {
      const locked = isStarterTier() || !moduleIncluded(key === 'bookstore' ? 'bookstore' : 'stewardshipHealth');
      syncDashboardPaywall(element, key, 'Stewardship', locked);
      syncTierRequirementNavigation(key, 'Stewardship', !locked);
    });

    const parishTargets = {
      sacraments: document.getElementById('tab-sacraments'),
      directory: document.getElementById('tab-directory'),
      text: document.getElementById('tab-text'),
      accounting: document.getElementById('tab-accounting')
    };
    Object.entries(parishTargets).forEach(([key, element]) => {
      const moduleKey = key === 'text' ? 'textToGive' : key;
      const locked = !moduleIncluded(moduleKey);
      syncDashboardPaywall(element, key, 'Parish', locked);
      syncTierRequirementNavigation(key, 'Parish', !locked);
    });
  }

  function moduleIncluded(moduleId) {
    return Boolean(currentParish?.entitlements?.modules?.[moduleId]?.included);
  }

  let accountingView = 'overview';
  let accountingReportView = 'library';
  let accountingCustomReport = null;
  let accountingDepthComparative = true;
  let accountingData = { setup: null, journals: [], ledger: [], reports: {}, accounts: [], accountCatalog: [], funds: [], bankAccounts: [], payables: null, budgets: null, banking: null, integrations: null, close: null, adjustments: null, governance: null, tier: '' };
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
  let accountingMigration = { active:false, session:null, sessions:[], step:'source', previews:{}, advanced:false };
  let accountingExperienceMode = 'treasurer';
  let accountingAdvancedNavExpanded = false;
  let accountingSimpleIncomeMessage = '';
  let accountingSimpleEntryMode = 'income';
  let accountingInKindGiftMessage = '';
  try { if (sessionStorage.getItem('agapay.accountingExperienceMode') === 'accountant') accountingExperienceMode = 'accountant'; } catch {}
  const ACCOUNTING_SIMPLE_REVENUE_LABELS = Object.freeze({
    acct_4000:'Stewardship & Tithes',
    acct_4010:'General Donations',
    acct_4030:'Candle Offerings',
    acct_4040:'Commemorations',
    acct_4300:'Bookstore Sales'
  });
  function accountingStaffSessionKey() { return `agapay.accountingStaff.${currentParish?.parishId || 'unknown'}`; }
  function accountingStaffSession() {
    try { const value = JSON.parse(sessionStorage.getItem(accountingStaffSessionKey()) || 'null'); return value?.expiresAt && Date.parse(value.expiresAt) > Date.now() ? value : null; } catch { return null; }
  }
  function accountingAccessApi(path = '') { return currentParish?.parishId ? `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/accounting-access${path}` : ''; }
  async function accountingAccessRequest(path, body) {
    const response = await fetch(accountingAccessApi(path), { method:'POST', headers:{ ...authHeaders(), 'Content-Type':'application/json' }, body:JSON.stringify(body || {}) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to update Accounting access.');
    return payload;
  }
  async function renderAccountingAccess(message = '') {
    const pane = document.getElementById('accountingPane'); if (!pane) return;
    try {
      const response = await fetch(accountingAccessApi('/profiles'), { headers:authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The parish session has expired.');
      const profiles = payload.profiles || [];
      pane.innerHTML = profiles.length ? `<section class="acct-access-card"><span class="acct-kicker">Protected financial workspace</span><h2>Who is using Accounting?</h2><p>Select your named profile and enter your six-digit PIN. This lets AGAPAY preserve a reliable audit trail without changing the parish’s main login.</p>${message ? `<div class="acct-access-message">${escapeHtml(message)}</div>` : ''}<form onsubmit="verifyAccountingStaff(event)"><label>Staff profile<select name="profileId" required>${profiles.map((profile) => `<option value="${escapeAttr(profile.id)}">${escapeHtml(profile.displayName)} · ${escapeHtml(profile.roleTemplate.replaceAll('_',' '))}</option>`).join('')}</select></label><label>Accounting PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required placeholder="Six digits"></label><button class="acct-primary">Open Accounting</button><span class="acct-form-status"></span></form></section>` : `<section class="acct-access-card"><span class="acct-kicker">Accounting activation</span><h2>Create the first financial administrator</h2><p>The parish login remains unchanged. This named profile identifies the person working in Accounting and protects approvals, checks, and close activity with a separate six-digit PIN.</p>${message ? `<div class="acct-access-message">${escapeHtml(message)}</div>` : ''}<form onsubmit="bootstrapAccountingStaff(event)"><label>Your name<input name="displayName" maxlength="120" required autocomplete="name" placeholder="e.g. Photini Argyris"></label><label>Responsibility<select name="roleTemplate"><option value="treasurer">Treasurer</option><option value="rector">Rector</option><option value="bookkeeper">Bookkeeper</option></select></label><label>Create a six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="Six digits"></label><button class="acct-primary">Activate Accounting access</button><span class="acct-form-status"></span></form></section>`;
    } catch (error) { pane.innerHTML = accountingEmpty('Accounting access needs attention', error.message); }
  }
  async function bootstrapAccountingStaff(event) {
    event.preventDefault(); const form=event.currentTarget,status=form.querySelector('.acct-form-status'); status.textContent='Creating profile…';
    try { const raw=Object.fromEntries(new FormData(form)); await accountingAccessRequest('/bootstrap',raw); await renderAccountingAccess('Profile created. Enter your new PIN to continue.'); } catch(error) { status.textContent=error.message; }
  }
  async function verifyAccountingStaff(event) {
    event.preventDefault(); const form=event.currentTarget,status=form.querySelector('.acct-form-status'); status.textContent='Verifying…';
    try { const payload=await accountingAccessRequest('/verify',Object.fromEntries(new FormData(form))); sessionStorage.setItem(accountingStaffSessionKey(),JSON.stringify({ token:payload.token,expiresAt:payload.expiresAt,profile:payload.profile })); const pane=document.getElementById('accountingPane'); if(pane)pane.dataset.loaded='false'; await loadAccountingTab(true); } catch(error) { status.textContent=error.message; }
  }
  async function addAccountingStaff(event) {
    event.preventDefault(); const form=event.currentTarget,status=form.querySelector('.acct-form-status'); status.textContent='Adding profile…';
    try { await accountingAccessRequest('/profiles',Object.fromEntries(new FormData(form))); form.reset(); status.textContent='Staff profile added.'; } catch(error) { status.textContent=error.message; }
  }
  async function changeAccountingPin(event) {
    event.preventDefault(); const form=event.currentTarget,status=form.querySelector('.acct-form-status');
    try { await accountingAccessRequest('/pin',Object.fromEntries(new FormData(form))); form.reset(); status.textContent='Your Accounting PIN has been changed.'; } catch(error) { status.textContent=error.message; }
  }
  async function lockAccountingWorkspace() {
    const session=accountingStaffSession(); if(session) await accountingAccessRequest('/logout',{profileId:session.profile.id}).catch(()=>{});
    sessionStorage.removeItem(accountingStaffSessionKey()); await renderAccountingAccess('Accounting has been locked.');
  }
  function accountingApi(path = '') {
    return currentParish?.parishId ? `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/accounting${path}` : '';
  }
  function accountingMoney(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isInteger(number) ? number / 100 : number);
  }
  function accountingDate(value) {
    if (!value) return '—';
    const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString();
  }
  function accountingEmpty(title, copy) {
    return `<div class="acct-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
  }
  async function renderAccountingAttachments(entityType, entityId, container) {
    if (!container) return;
    container.dataset.accountingAttachments = `${entityType}:${entityId}`;
    container.innerHTML = '<p class="sw-tool-loading">Loading attachments...</p>';
    const response = await fetch(accountingApi(`/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`), { headers:authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { container.innerHTML = accountingEmpty('Attachments unavailable', payload.message || payload.error || 'Unable to load attachments.'); return; }
    const items = payload.attachments || [];
    container.innerHTML = `<section class="acct-attachments"><div class="acct-list-head"><div><span class="acct-kicker">Private documents</span><h3>Attachments</h3><p>PDF, JPG, or PNG · 10 MB maximum</p></div></div><form class="acct-attachment-upload" onsubmit="accountingUpload(event,'${escapeAttr(entityType)}','${escapeAttr(entityId)}')"><label>Document<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></label><label>Display name<input name="displayName" maxlength="180" placeholder="Optional document label"></label><button class="acct-primary">Upload</button><span class="acct-form-status"></span></form><div class="acct-attachment-list">${items.map((item) => `<div><span><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.mimeType)} · ${Math.max(1,Math.ceil(Number(item.sizeBytes)/1024))} KB · ${accountingDate(item.createdAt)}</small></span><div class="acct-row-actions"><button type="button" onclick="downloadAccountingAttachment('${escapeAttr(item.id)}','${escapeAttr(item.displayName)}')">Download</button><button type="button" onclick="removeAccountingAttachment('${escapeAttr(item.id)}',${item.version},'${escapeAttr(entityType)}','${escapeAttr(entityId)}',this)">Delete</button></div></div>`).join('') || '<p>No attachments yet.</p>'}</div></section>`;
  }
  async function accountingUpload(event, entityType, entityId) {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('.acct-form-status'), data = new FormData(form);
    data.set('entityType', entityType); data.set('entityId', entityId);
    status.textContent = 'Uploading…';
    const response = await fetch(accountingApi('/attachments/upload'), { method:'POST', headers:authHeaders(), body:data });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { status.textContent = payload.message || payload.error || 'Unable to upload attachment.'; return; }
    await renderAccountingAttachments(entityType, entityId, form.closest('[data-accounting-attachments]'));
  }
  async function downloadAccountingAttachment(attachmentId, filename) {
    const response = await fetch(accountingApi(`/attachments/${encodeURIComponent(attachmentId)}/download`), { headers:authHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); alert(payload.message || payload.error || 'Unable to download attachment.'); return; }
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url; link.download = filename || 'attachment'; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  async function removeAccountingAttachment(attachmentId, expectedVersion, entityType, entityId, button) {
    if (!confirm('Delete this attachment from the accounting record?')) return;
    const response = await fetch(accountingApi(`/attachments/${encodeURIComponent(attachmentId)}`), { method:'DELETE', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ expectedVersion }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { alert(payload.message || payload.error || 'Unable to delete attachment.'); return; }
    await renderAccountingAttachments(entityType, entityId, button.closest('[data-accounting-attachments]'));
  }
  function accountingPreviewOnly() {
    return !moduleIncluded('accounting') || !currentParish?.accountingAvailable;
  }
  function renderAccountingPaywall(pane = document.getElementById('accountingPane')) {
    if (!pane) return;
    const included = moduleIncluded('accounting');
    const shell = pane.closest('.acct-suite-shell');
    shell?.classList.toggle('acct-suite-shell--tier-paywall', !included);
    document.getElementById('accountingTierLabel').textContent = included ? 'Parish Accounting' : 'Parish tier';
    document.getElementById('accountingTierCopy').textContent = included ? 'Beta access coming soon' : 'Upgrade to unlock';
    document.getElementById('accountingParishName').textContent = currentParish?.name || currentParish?.parishName || 'Your parish';
    document.getElementById('accountingFiscalYear').textContent = 'Current fiscal year';
    pane.dataset.loaded = 'preview';
    if (!included) {
      pane.innerHTML = `
        <div class="acct-tier-paywall">
          <div class="text-give-header">
            <div>
              <div class="text-give-eyebrow">Parish finances</div>
              <h1>Accounting</h1>
              <p>Keep giving, expenses, funds, budgets, reconciliation, and financial reporting together in one balanced set of parish books.</p>
            </div>
            <div class="text-give-header-mark acct-tier-paywall-mark" aria-hidden="true">₳</div>
          </div>

          <div class="text-give-launch sac-paywall-launch">
            <div class="text-give-launch-icon acct-tier-paywall-icon" aria-hidden="true">₳</div>
            <div>
              <span>Included with Parish</span>
              <h2>See the whole parish financial picture</h2>
              <p>Upgrade for true fund accounting, a balanced general ledger, payables, budgets, bank reconciliation, and parish-ready reports in one workspace.</p>
            </div>
            <button class="btn btn-gold sac-paywall-upgrade" type="button" onclick="switchTab('settings')">Review Parish tier</button>
          </div>

          <div class="text-give-grid sac-paywall-grid">
            <section class="text-give-card">
              <div class="text-give-card-head">
                <div class="section-title-icon acct-tier-card-icon" aria-hidden="true">≡</div>
                <div><h3>Connected parish books</h3><p>Giving and operations in one financial workspace</p></div>
              </div>
              <div class="acct-tier-preview-stats">
                <div><span>Cash on hand</span><strong>$84,260</strong></div>
                <div><span>Current activity</span><strong>$12,475</strong></div>
                <div><span>Tracked funds</span><strong>7</strong></div>
              </div>
            </section>

            <section class="text-give-card">
              <div class="text-give-card-head">
                <div class="section-title-icon acct-tier-card-icon" aria-hidden="true">▤</div>
                <div><h3>Accounting workspace</h3><p>Ledger, payables, budgets, reconciliation, and reports</p></div>
              </div>
              <div class="text-give-locked-region acct-tier-locked">
                <div class="text-give-lock-veil">
                  <span><span class="acct-tier-inline-lock" aria-hidden="true">⌑</span>Parish tier</span>
                </div>
                <div class="acct-tier-module-list">
                  <div><span>General ledger</span><strong>Balanced</strong></div>
                  <div><span>Bank reconciliation</span><strong>Ready to match</strong></div>
                  <div><span>Financial reports</span><strong>Parish ready</strong></div>
                </div>
              </div>
            </section>
          </div>

          <div class="feature-guide-grid sac-paywall-benefits">
            <article class="feature-guide-card"><span class="sac-paywall-number">01</span><h3>Track every fund</h3><p>Keep unrestricted, designated, and donor-restricted activity clear without separate spreadsheets.</p></article>
            <article class="feature-guide-card"><span class="sac-paywall-number">02</span><h3>Stay balanced</h3><p>Connect giving, expenses, payables, and bank activity to one dependable general ledger.</p></article>
            <article class="feature-guide-card"><span class="sac-paywall-number">03</span><h3>Report with confidence</h3><p>Prepare parish council, treasurer, and year-end reports from the same set of books.</p></article>
          </div>
        </div>`;
      return;
    }
    pane.innerHTML = `
      <section class="acct-paywall-launch">
        <div class="acct-paywall-launch-icon">₳</div>
        <div>
          <span>${included ? 'Beta testing' : 'Included with Parish'}</span>
          <h2>${included ? 'Your Accounting Suite preview is ready' : 'See the whole parish financial picture'}</h2>
          <p>Go beyond donation totals with true fund accounting, a balanced general ledger, payables, budgets, bank reconciliation, and parish-ready reports in one workspace.</p>
          <button class="btn btn-gold" type="button" onclick="switchTab('settings')">${included ? 'Review subscription' : 'Review Parish tier'}</button>
        </div>
      </section>
      <section class="acct-paywall-preview" aria-label="Preview of the AGAPAY Accounting Suite">
        <div class="acct-paywall-veil">
          <div>
            <span class="acct-paywall-lock">⌑</span>
            <strong>${included ? 'Accounting is currently in beta testing' : 'Unlock the Accounting Suite'}</strong>
            <small>${included ? 'St. Fiacre remains the live demonstration parish while access is prepared.' : 'Available with the Parish tier after beta testing.'}</small>
            <button class="acct-primary" type="button" onclick="switchTab('settings')">${included ? 'View plan details' : 'Explore Parish tier'}</button>
          </div>
        </div>
        <section class="acct-command-hero">
          <div><span class="acct-kicker">Financial command center</span><h2>Clarity for every parish dollar.</h2><p>Fund accounting, giving, payables, and bank activity—one balanced set of books.</p></div>
          <div class="acct-command-actions"><button><b>＋</b><span>New journal<small>Record an entry</small></span></button><button><b>◫</b><span>Manage funds<small>Track restrictions</small></span></button><button><b>⇄</b><span>Reconcile<small>Match the bank</small></span></button><button><b>▤</b><span>Run reports<small>Review results</small></span></button></div>
        </section>
        <div class="acct-suite-stats">
          <div class="acct-suite-stat featured"><span>Cash on hand</span><strong>$84,260</strong><small>Across active cash and bank accounts</small></div>
          <div class="acct-suite-stat"><span>Total net assets</span><strong>$126,840</strong><small>Financial position is balanced</small></div>
          <div class="acct-suite-stat"><span>Current activity</span><strong>$12,475</strong><small>24 posted entries · 2 drafts</small></div>
          <div class="acct-suite-stat"><span>Tracked funds</span><strong>7</strong><small>3 donor restricted</small></div>
        </div>
        <div class="acct-suite-overview-grid">
          <div>
            <div class="acct-suite-section-head"><h2>Where things stand</h2><span>One connected set of books</span></div>
            <div class="acct-suite-modules">
              <button class="acct-suite-module"><span>Payables</span><strong>$3,480</strong><small>2 awaiting approval</small></button>
              <button class="acct-suite-module"><span>Reconciliation</span><strong>1 open</strong><small>2 connected bank accounts</small></button>
              <button class="acct-suite-module"><span>Budget vs actual</span><strong>On track</strong><small>Current operating plan</small></button>
              <button class="acct-suite-module"><span>Financial reports</span><strong>Balanced</strong><small>Statements and trial balance</small></button>
            </div>
          </div>
        </div>
      </section>`;
  }
  function accountingViewTitle() {
    return ({ overview:'Overview', ledger:'General Ledger', journals:'Journal Entries', funds:'Funds', reports:'Financial Reports', payables:'Payables', budgets:'Budgets', banking:'Reconciliation', close:'Period Close', governance:'Governance', setup:'Setup', settings:'Settings', integrations:'Settings' })[accountingView] || 'Overview';
  }
  function syncAccountingExperienceChrome() {
    const shell = document.querySelector('.acct-suite-shell');
    if (shell) shell.dataset.accountingExperience = accountingExperienceMode;
    document.querySelectorAll('[data-accounting-experience]').forEach((button) => {
      const active = button.dataset.accountingExperience === accountingExperienceMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const isTreasurer = accountingExperienceMode === 'treasurer';
    const nav = document.querySelector('.acct-suite-rail nav');
    const advancedToggle = document.querySelector('[data-accounting-advanced-toggle]');
    const navOrder = isTreasurer
      ? ['overview','funds','payables','banking','reports','budgets','advanced','ledger','close','governance','setup','settings']
      : ['overview','ledger','funds','payables','banking','reports','budgets','close','governance','setup','settings'];
    if (nav && nav.dataset.accountingNavMode !== accountingExperienceMode) {
      navOrder.forEach((view) => {
        const button = view === 'advanced' ? advancedToggle : nav.querySelector(`[data-accounting-view="${view}"]`);
        if (button) nav.append(button);
      });
      nav.dataset.accountingNavMode = accountingExperienceMode;
    }
    document.querySelectorAll('[data-accounting-advanced]').forEach((button) => {
      button.hidden = isTreasurer && !accountingAdvancedNavExpanded;
    });
    if (advancedToggle) {
      const advancedViewActive = ['ledger','journals','close','governance','setup','settings','integrations'].includes(accountingView);
      advancedToggle.hidden = !isTreasurer;
      advancedToggle.setAttribute('aria-expanded', String(accountingAdvancedNavExpanded));
      advancedToggle.classList.toggle('active', advancedViewActive);
    }
    if (shell) shell.classList.toggle('acct-suite-shell--advanced-open', isTreasurer && accountingAdvancedNavExpanded);
  }
  function setAccountingExperienceMode(mode) {
    accountingExperienceMode = mode === 'accountant' ? 'accountant' : 'treasurer';
    accountingAdvancedNavExpanded = false;
    try { sessionStorage.setItem('agapay.accountingExperienceMode', accountingExperienceMode); } catch {}
    renderAccountingPane();
  }
  function toggleAccountingAdvancedNav() {
    accountingAdvancedNavExpanded = !accountingAdvancedNavExpanded;
    syncAccountingExperienceChrome();
  }
  function accountingSimpleRevenueOptions(selectedId = '') {
    const order = Object.keys(ACCOUNTING_SIMPLE_REVENUE_LABELS);
    return accountingData.accounts
      .filter((account) => account.category === 'revenue' && account.isActive !== false && !account.archivedAt)
      .sort((left, right) => {
        const leftIndex = order.indexOf(left.id), rightIndex = order.indexOf(right.id);
        if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
        return String(left.name || '').localeCompare(String(right.name || ''));
      })
      .map((account) => `<option value="${escapeAttr(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(ACCOUNTING_SIMPLE_REVENUE_LABELS[account.id] || account.name)}</option>`)
      .join('');
  }
  function accountingSimpleFundOptions(selectedId = '') {
    return accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}" ${fund.id === selectedId ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
  }
  function accountingSimpleIncomeForm() {
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    const banks = accountingData.bankAccounts || [];
    if (!banks.length) return `<section class="acct-simple-income"><div><span class="acct-kicker">Record Income</span><h2>Add a bank account first</h2><p>A deposit needs a destination account. Open Reconciliation to add the parish checking or savings account.</p></div><button class="acct-primary" onclick="setAccountingView('banking')">Open bank accounts</button></section>`;
    return `<section class="acct-simple-income"><div class="acct-simple-income-head"><div><span class="acct-kicker">Record Income</span><h2>Record a deposit</h2><p>Tell AGAPAY what happened. The complete ledger entry is created and posted for you.</p></div><button type="button" class="acct-link" data-enable-income-splits onclick="enableAccountingIncomeSplits(this)">Split this deposit across funds</button></div><form onsubmit="submitAccountingSimpleIncome(event)"><div class="acct-simple-income-grid acct-simple-income-details"><label>Where did the money go?<select name="depositAccountId" required>${banks.map((bank) => `<option value="${escapeAttr(bank.ledgerAccountId)}">${escapeHtml(bank.name)}${bank.maskedLast4 ? ` · •••• ${escapeHtml(bank.maskedLast4)}` : ''}</option>`).join('')}</select></label><label>Date<input name="entryDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label class="wide">Description<input name="description" maxlength="240" required placeholder="Sunday offering, fundraiser deposit, or other detail"></label></div><div class="acct-income-split-total" hidden><label>Total deposit amount<input data-income-total type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" oninput="updateAccountingSplitDepositBalance(this.form)"></label><small>This must equal all allocations below.</small></div><div class="acct-income-splits" data-income-splits>${accountingIncomeSplitRow({ fundId:defaultFund?.id || '' }, false)}</div><div class="acct-income-split-actions" hidden><button type="button" class="acct-add-line" onclick="addAccountingIncomeSplit(this)">+ Add another allocation</button><button type="button" class="acct-link" onclick="disableAccountingIncomeSplits(this)">Use one allocation</button></div><div class="acct-balance acct-income-split-balance" hidden></div><div class="acct-simple-income-foot"><span class="acct-form-status">${escapeHtml(accountingSimpleIncomeMessage)}</span><button class="acct-primary" data-income-submit>Record income</button></div></form></section>`;
  }
  function accountingIncomeSplitRow(split = {}, removable = true) {
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    return `<div class="acct-income-split-row" data-income-split-row><label>What kind of income was this?<select data-income-revenue required onchange="updateAccountingSplitDepositBalance(this.form)"><option value="">Choose income type</option>${accountingSimpleRevenueOptions(split.revenueAccountId || '')}</select></label><label>Which fund?<select data-income-fund required onchange="updateAccountingSplitDepositBalance(this.form)">${accountingSimpleFundOptions(split.fundId || defaultFund?.id || '')}</select></label><label><span data-split-amount-label>Amount</span><input data-income-amount type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" value="${split.amount ? escapeAttr(split.amount) : ''}" oninput="updateAccountingSplitDepositBalance(this.form)"></label><label class="acct-income-line-memo">Line memo <small>Optional</small><input data-income-memo maxlength="240" placeholder="Envelope batch or collection detail" value="${escapeAttr(split.description || '')}"></label>${removable ? '<button type="button" class="acct-remove-line" onclick="removeAccountingIncomeSplit(this)" aria-label="Remove split">×</button>' : ''}</div>`;
  }
  function enableAccountingIncomeSplits(button) {
    const form = button.closest('.acct-simple-income').querySelector('form');
    if (!form || form.dataset.splitEnabled === '1') return;
    form.dataset.splitEnabled = '1';
    button.hidden = true;
    form.querySelector('.acct-income-split-total').hidden = false;
    form.querySelector('.acct-income-split-actions').hidden = false;
    form.querySelector('.acct-income-split-balance').hidden = false;
    const firstAmount = form.querySelector('[data-income-amount]');
    form.querySelector('[data-income-total]').value = firstAmount.value;
    form.querySelectorAll('[data-split-amount-label]').forEach((label) => { label.textContent = 'Allocation amount'; });
    addAccountingIncomeSplit(form.querySelector('.acct-add-line'));
  }
  function disableAccountingIncomeSplits(button) {
    const form = button.closest('form');
    if (!form) return;
    form.dataset.splitEnabled = '0';
    Array.from(form.querySelectorAll('[data-income-split-row]')).slice(1).forEach((row) => row.remove());
    form.querySelector('.acct-income-split-total').hidden = true;
    form.querySelector('.acct-income-split-actions').hidden = true;
    form.querySelector('.acct-income-split-balance').hidden = true;
    form.closest('.acct-simple-income').querySelector('[data-enable-income-splits]').hidden = false;
    form.querySelectorAll('[data-split-amount-label]').forEach((label) => { label.textContent = 'Amount'; });
    form.querySelector('[data-income-submit]').disabled = false;
  }
  function addAccountingIncomeSplit(button) {
    const form = button.closest('form');
    const holder = form?.querySelector('[data-income-splits]');
    if (!holder) return;
    holder.insertAdjacentHTML('beforeend', accountingIncomeSplitRow());
    updateAccountingSplitDepositBalance(form);
  }
  function removeAccountingIncomeSplit(button) {
    const form = button.closest('form');
    if (form?.querySelectorAll('[data-income-split-row]').length <= 2) return;
    button.closest('[data-income-split-row]')?.remove();
    updateAccountingSplitDepositBalance(form);
  }
  function collectAccountingIncomeSplits(form) {
    const cents = (value) => Math.round(Number(value || 0) * 100);
    return Array.from(form.querySelectorAll('[data-income-split-row]')).map((row) => ({
      revenueAccountId:row.querySelector('[data-income-revenue]').value,
      fundId:row.querySelector('[data-income-fund]').value,
      amount:cents(row.querySelector('[data-income-amount]').value),
      description:row.querySelector('[data-income-memo]').value.trim()
    }));
  }
  function updateAccountingSplitDepositBalance(form) {
    if (!form || form.dataset.splitEnabled !== '1') return;
    const cents = (value) => Math.round(Number(value || 0) * 100);
    const total = cents(form.querySelector('[data-income-total]').value);
    const splits = collectAccountingIncomeSplits(form);
    const allocated = splits.reduce((sum, split) => sum + split.amount, 0);
    const complete = splits.every((split) => split.revenueAccountId && split.fundId && Number.isSafeInteger(split.amount) && split.amount > 0);
    const balanced = total > 0 && allocated === total && complete;
    const balance = form.querySelector('.acct-income-split-balance');
    balance.classList.toggle('balanced', balanced);
    balance.innerHTML = `<span>Deposit <strong>${accountingMoney(total)}</strong></span><span>Allocated <strong>${accountingMoney(allocated)}</strong></span><span>${balanced ? 'Balanced ✓' : complete ? `Difference ${accountingMoney(Math.abs(total - allocated))}` : 'Complete every allocation'}</span>`;
    form.querySelector('[data-income-submit]').disabled = !balanced;
  }
  function accountingSimpleActivityFeed() {
    const entries = accountingData.journals.filter((entry) => ['posted','reversed'].includes(entry.status)).slice(0, 8);
    return `<section class="acct-simple-feed"><div class="acct-suite-section-head"><div><span class="acct-kicker">Recent activity</span><h2>What has been recorded</h2></div></div>${entries.map((entry) => `<article><i>✓</i><p>You recorded <strong>${accountingMoney(entry.totalDebits ?? entry.total_debits ?? 0)}</strong> for ${escapeHtml(entry.description || 'parish activity')} on ${accountingDate(entry.postingDate || entry.entryDate)}.</p></article>`).join('') || accountingEmpty('No activity yet', 'Recorded income and posted parish activity will appear here.')}</section>`;
  }
  function accountingInKindDebitOptions() {
    const cashIds = new Set(['acct_1000','acct_1010','acct_1100']);
    return accountingData.accounts
      .filter((account) => ['asset','expense'].includes(account.category) && account.isActive !== false && !account.archivedAt)
      .filter((account) => !cashIds.has(account.id) && !(account.category === 'asset' && /cash|bank|checking|savings|undeposited/i.test(`${account.accountNumber || ''} ${account.name || ''}`)))
      .sort((left, right) => String(left.accountNumber || '').localeCompare(String(right.accountNumber || ''), undefined, { numeric:true }))
      .map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)} (${account.category === 'asset' ? 'Asset' : 'Expense'})</option>`)
      .join('');
  }
  function accountingInKindGiftForm() {
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    const debitOptions = accountingInKindDebitOptions();
    return `<section class="acct-simple-income acct-in-kind-gift"><div class="acct-simple-income-head"><div><span class="acct-kicker">Record a Non-Cash Gift</span><h2>Put a donated item on the books</h2><p>No money moved. AGAPAY will debit the account receiving the value and credit In-Kind Contributions.</p></div><button type="button" class="acct-link" onclick="openAccountingSimpleIncome()">Record cash income instead</button></div><form onsubmit="submitAccountingInKindGift(event)"><div class="acct-simple-income-grid"><label>What was received?<input name="itemDescription" maxlength="240" required placeholder="Processional cross, vehicle, building materials, or donated services"></label><label>Who gave it? <small>Optional</small><input name="donorName" maxlength="160" placeholder="Donor name for parish records"></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="Fair value"></label><label class="wide">How was the value determined?<textarea name="valuationBasis" maxlength="500" rows="3" required placeholder="Independent appraisal, comparable retail listing, or donor's stated value"></textarea></label><label>Which account should reflect it?<select name="debitAccountId" required><option value="">Choose an asset or expense account</option>${debitOptions}</select></label><label>Which fund?<select name="fundId" required>${accountingSimpleFundOptions(defaultFund?.id || '')}</select></label><label>Date<input name="entryDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></label></div>${debitOptions ? '' : '<p class="acct-form-status">Add an eligible expense or non-cash asset account before recording this gift.</p>'}<div class="acct-simple-income-foot"><span class="acct-form-status">${escapeHtml(accountingInKindGiftMessage)}</span><button class="acct-primary" ${debitOptions ? '' : 'disabled'}>Post non-cash gift</button></div></form></section>`;
  }
  function accountingOverviewHero() {
    if (accountingExperienceMode === 'treasurer') return `<section class="acct-command-hero">
      <div><span class="acct-kicker">Treasurer view</span><h2>Clarity for every parish dollar.</h2><p>Weekly parish bookkeeping in plain language, backed by the same audited accounting records.</p></div>
      <div class="acct-command-actions acct-command-actions-treasurer"><button onclick="openAccountingSimpleIncome()"><b>＋</b><span>Record Income<small>Cash, checks, and deposits</small></span></button><button onclick="openAccountingSimpleBill()"><b>◇</b><span>Pay a Bill<small>Enter a vendor expense</small></span></button><button onclick="openAccountingInKindGift()"><b>◆</b><span>Record a Non-Cash Gift<small>Donated goods, equipment, or services</small></span></button></div>
    </section>`;
    return `<section class="acct-command-hero">
      <div><span class="acct-kicker">Financial command center</span><h2>Clarity for every parish dollar.</h2><p>Fund accounting, giving, commerce, payables, and bank activity—one balanced set of books.</p></div>
      <div class="acct-command-actions"><button onclick="accountingView='journals';newAccountingJournal()"><b>＋</b><span>New journal<small>Record an entry</small></span></button><button onclick="switchTab('options')"><b>◫</b><span>Manage funds<small>Open Funds &amp; Alms</small></span></button><button onclick="setAccountingView('banking')"><b>⇄</b><span>Reconcile<small>Match the bank</small></span></button><button onclick="setAccountingView('reports')"><b>▤</b><span>Run reports<small>Review results</small></span></button></div>
    </section>`;
  }
  function accountingOverviewFundSummary(fund, fundActivity) {
    const ledgerBalance = Number(fundActivity.find((row) => row.fundId === fund.id || row.code === fund.code)?.endingBalance || 0);
    const sourceId = String(fund.givingSourceId || fund.giving_source_id || '');
    const campaign = (currentParish?.campaigns || []).find((item) =>
      item.accountingFundId === fund.id || (sourceId && String(item.id || item.slug || '') === sourceId)
    );
    const raisedCents = Number(campaign?.raisedCents || 0);
    if (String(fund.givingSourceType || fund.giving_source_type) === 'campaign' && !ledgerBalance && raisedCents > 0) {
      return { amount: raisedCents, label: 'Campaign raised', campaignProgress: true };
    }
    return {
      amount: ledgerBalance,
      label: fund.restrictionType || fund.restriction_type || (Number(fund.isDefault) ? 'Unrestricted' : 'Fund'),
      campaignProgress: false
    };
  }
  function accountingOverviewFundRank(fund) {
    if (Number(fund.isDefault)) return 0;
    if (String(fund.givingSourceType || fund.giving_source_type) === 'campaign') return 1;
    if (/benevolence/i.test(`${fund.name || ''} ${fund.givingSourceId || fund.giving_source_id || ''}`)) return 2;
    return 3;
  }
  function renderAccountingOverview(pane) {
    const position = accountingData.reports.position || {}, activities = accountingData.reports.activities || {};
    const cash = (position.rows || []).filter((row) => row.category === 'asset' && /cash|checking|bank|undeposited/i.test(`${row.accountName || ''}`)).reduce((sum,row) => sum + Number(row.amount || 0), 0);
    const netAssets = Number(position.totals?.netAssets || 0), activity = Number(activities.totals?.changeInNetAssets || 0);
    const posted = accountingData.journals.filter((entry) => ['posted','reversed'].includes(entry.status));
    const drafts = accountingData.journals.filter((entry) => entry.status === 'draft').length;
    const payables = accountingData.payables?.overview || {}, banking = accountingData.banking || {}, close = accountingData.close || {};
    const fundActivity = accountingData.reports.fundActivity?.rows || [];
    const overviewFunds = accountingData.funds
      .map((fund) => ({ fund, summary: accountingOverviewFundSummary(fund, fundActivity) }))
      .sort((a, b) => accountingOverviewFundRank(a.fund) - accountingOverviewFundRank(b.fund)
        || String(a.fund.name || '').localeCompare(String(b.fund.name || '')));
    pane.innerHTML = `${accountingOverviewHero()}<div class="acct-suite-stats">
      <div class="acct-suite-stat featured"><span>Cash on hand</span><strong>${accountingMoney(cash)}</strong><small>Across active cash and bank accounts</small></div>
      <div class="acct-suite-stat"><span>Total net assets</span><strong>${accountingMoney(netAssets)}</strong><small>${position.validation?.status === 'validated' ? 'Financial position is balanced' : 'Review the financial position'}</small></div>
      <div class="acct-suite-stat"><span>Current activity</span><strong>${accountingMoney(activity)}</strong><small>${posted.length} posted entries · ${drafts} draft${drafts === 1 ? '' : 's'}</small></div>
      <div class="acct-suite-stat"><span>Tracked funds</span><strong>${accountingData.funds.length}</strong><small>${accountingData.funds.filter(f=>String(f.restrictionType||f.restriction_type).startsWith('donor_restricted')).length} donor restricted</small></div>
    </div><div class="acct-suite-overview-grid"><div><div class="acct-suite-section-head"><h2>Where things stand</h2><span>Open a module to continue</span></div><div class="acct-suite-modules">
      <button class="acct-suite-module" onclick="setAccountingView('payables')"><span>Payables</span><strong>${accountingMoney(payables.openPayables)}</strong><small>${payables.awaitingApproval || 0} awaiting approval</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('banking')"><span>Reconciliation</span><strong>${(banking.sessions || []).filter((item) => item.status !== 'completed').length} open</strong><small>${(banking.accounts || []).length} connected bank account${(banking.accounts || []).length === 1 ? '' : 's'}</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('close')"><span>Period Close</span><strong>${(close.sessions || []).filter((item) => !['completed','voided'].includes(item.status)).length} active</strong><small>${(close.sessions || []).filter((item) => item.status === 'completed').length} completed closes</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('budgets')"><span>Budget vs actual</span><strong>${(accountingData.budgets?.items || []).length} plans</strong><small>Open budget versions and variance</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('ledger')"><span>Giving → Ledger</span><strong>${posted.length ? 'In sync' : 'Ready'}</strong><small>${posted.length} posted source entries</small></button>
      <button class="acct-suite-module" onclick="setAccountingView('reports')"><span>Financial reports</span><strong>${position.validation?.status === 'validated' ? 'Balanced' : 'Review'}</strong><small>Statements and trial balance</small></button>
    </div><div class="acct-suite-activity"><div class="acct-suite-section-head"><h2>Recent posted activity</h2><button class="acct-link" onclick="setAccountingView('ledger')">View ledger →</button></div><div class="acct-table-wrap acct-overview-activity-table"><table class="acct-table"><colgroup><col class="date"><col class="entry"><col class="memo"><col class="amount"></colgroup><thead><tr><th>Date</th><th>Entry</th><th>Memo</th><th>Amount</th></tr></thead><tbody>${posted.slice(0,5).map((entry) => `<tr><td>${accountingDate(entry.postingDate || entry.entryDate)}</td><td><strong>${escapeHtml(entry.entryNumber || entry.id || '')}</strong></td><td>${escapeHtml(entry.description || entry.memo || '')}</td><td>${accountingMoney(entry.totalDebits || entry.total_debits)}</td></tr>`).join('') || '<tr><td colspan="4">Posted activity will appear here.</td></tr>'}</tbody></table></div></div></div>
      <aside><div class="acct-suite-section-head"><h2>Fund balances</h2><span>${overviewFunds.length} active</span></div><div class="acct-suite-funds">${overviewFunds.map(({ fund, summary }) => `<div class="acct-suite-fund ${summary.campaignProgress ? 'campaign-progress' : ''}"><div><strong>${escapeHtml(fund.name)}</strong><span>${accountingMoney(summary.amount)}</span></div><small>${escapeHtml(summary.label)}</small></div>`).join('') || '<div class="acct-suite-fund"><strong>No funds configured</strong></div>'}</div><div class="acct-suite-health"><strong>Financial integrity: ${position.validation?.status === 'validated' ? 'healthy' : 'needs review'}</strong><p>The trial balance and financial-position equation are checked whenever reports load.</p></div></aside></div>`;
  }
  function accountingRegisterModel() {
    const options = accountingData.accounts
      .filter((item) => ['asset','liability'].includes(String(item.category || '').toLowerCase()))
      .map((item) => ({ id:item.id, number:String(item.accountNumber || item.account_number || ''), name:item.name || 'Account', category:item.category }))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric:true }));
    if (!options.some((account) => account.number === accountingLedgerAccountNumber)) {
      accountingLedgerAccountNumber = options.find((account) => /checking|cash|bank/i.test(account.name))?.number || options[0]?.number || '';
    }
    const account = options.find((item) => item.number === accountingLedgerAccountNumber) || options[0] || { number:'', name:'Account register' };
    const configuration = accountingData.accounts.find((item) => String(item.accountNumber || item.account_number || '') === account.number);
    const creditNormal = String(configuration?.normalBalance || configuration?.normal_balance || '').toLowerCase() === 'credit';
    let balance = 0;
    const chronological = accountingData.ledger
      .filter((row) => String(row.accountNumber || row.account_number || '') === account.number)
      .sort((a, b) => String(a.postingDate || a.entryDate || a.date || '').localeCompare(String(b.postingDate || b.entryDate || b.date || '')) || String(a.entryNumber || '').localeCompare(String(b.entryNumber || '')))
      .map((row) => {
        const debit = Number(row.debitAmount ?? row.debit_amount ?? 0);
        const credit = Number(row.creditAmount ?? row.credit_amount ?? 0);
        balance += creditNormal ? credit - debit : debit - credit;
        return { ...row, registerBalance:balance };
      });
    const query = accountingLedgerSearch.trim().toLowerCase();
    const visible = query ? chronological.filter((row) => [row.entryNumber,row.description,row.fundName,row.fund_name,row.sourceType].join(' ').toLowerCase().includes(query)) : chronological;
    return {
      account,
      configuration,
      options,
      rows:accountingLedgerNewestFirst ? [...visible].reverse() : visible,
      balance,
      debits:chronological.reduce((sum, row) => sum + Number(row.debitAmount ?? row.debit_amount ?? 0), 0),
      credits:chronological.reduce((sum, row) => sum + Number(row.creditAmount ?? row.credit_amount ?? 0), 0)
    };
  }
  function accountingRegisterEntryForm(register) {
    const selectedAccountId = register.configuration?.id || register.account.id || '';
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    const fundOptions = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}" ${fund.id === defaultFund?.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    const accountOptions = accountingData.accounts
      .filter((account) => account.id !== selectedAccountId)
      .map((account) => `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const revenueOptions = accountingData.accounts
      .filter((account) => account.category === 'revenue')
      .map((account) => `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const today = new Date().toISOString().slice(0,10);
    const transaction = `<form class="acct-register-entry-form" onsubmit="submitAccountingRegisterEntry(event,'transaction')"><div class="acct-register-entry-grid"><label>Date<input name="entryDate" type="date" required value="${today}"></label><label>Payee / source<input name="payee" maxlength="120" required placeholder="Who was paid or who sent this?"></label><label>Offset account<select name="offsetAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose account</option>${accountOptions}</select></label><label>Fund<select name="fundId" required>${fundOptions}</select></label><label>Check / reference<input name="reference" maxlength="60" placeholder="Optional"></label><label class="wide">Comment<input name="comment" maxlength="240" placeholder="What was this for?"></label><label>Payment<input name="payment" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00"></label><label>Deposit<input name="deposit" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00"></label></div><div class="acct-register-entry-foot"><span class="acct-form-status">Enter either a payment or a deposit.</span><button class="acct-primary">Post transaction</button></div></form>`;
    const contribution = `<form class="acct-register-entry-form" onsubmit="submitAccountingRegisterEntry(event,'contribution')"><div class="acct-register-entry-grid contribution"><label>Date<input name="entryDate" type="date" required value="${today}"></label><label>Contributor<input name="payee" maxlength="120" required placeholder="Name or contribution source"></label><label>Contribution account<select name="offsetAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose income account</option>${revenueOptions}</select></label><label>Fund<select name="fundId" required>${fundOptions}</select></label><label class="wide">Comment<input name="comment" maxlength="240" placeholder="Contribution details"></label><label>Deposit amount<input name="deposit" inputmode="decimal" type="number" min="0.01" step="0.01" required placeholder="0.00"></label></div><div class="acct-register-entry-foot"><span class="acct-form-status">The contribution will increase this register account and the selected fund.</span><button class="acct-primary">Post contribution</button></div></form>`;
    return `<section class="acct-register-entry"><div class="acct-register-entry-tabs"><button type="button" class="${accountingRegisterEntryMode === 'transaction' ? 'active' : ''}" onclick="setAccountingRegisterEntryMode('transaction')">＋ Deposit / Payment</button><button type="button" class="${accountingRegisterEntryMode === 'contribution' ? 'active' : ''}" onclick="setAccountingRegisterEntryMode('contribution')">＋ Contribution</button></div>${accountingRegisterEntryMode === 'contribution' ? contribution : transaction}</section>`;
  }
  function accountingRecurringPanel(register) {
    const items=accountingData.recurring||[],active=items.filter((item)=>item.status==='active');
    if(accountingRecurringEditor){
      const item=accountingRecurringEditor,registerAccounts=accountingData.accounts.filter((account)=>['asset','liability'].includes(account.category)),expenses=accountingData.accounts.filter((account)=>account.category==='expense'),defaultFund=accountingData.funds.find((fund)=>Number(fund.isDefault))||accountingData.funds[0];
      return `<section class="acct-recurring-panel"><div class="acct-recurring-head"><div><span class="acct-kicker">${item.id?'Edit schedule':'New recurring expense'}</span><h2>${item.id?escapeHtml(item.name):'Set it once. Let AGAPAY post it.'}</h2><p>Due expenses are posted automatically each morning with an auditable journal entry.</p></div><button class="acct-refresh" onclick="accountingRecurringEditor=null;renderAccountingPane()">Cancel</button></div><form class="acct-recurring-form" onsubmit="saveAccountingRecurring(event)"><label>Schedule name<input name="name" required maxlength="120" value="${escapeAttr(item.name||'')}" placeholder="Monthly internet bill"></label><label>Payee<input name="payee" required maxlength="120" value="${escapeAttr(item.payee||'')}" placeholder="Internet provider"></label><label>Pay from<select name="registerAccountId" required>${registerAccounts.map((account)=>`<option value="${escapeAttr(account.id)}" ${(item.registerAccountId||register.configuration?.id)===account.id?'selected':''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><label>Expense account<select name="expenseAccountId" required onchange="applyAccountingRegisterDefaultFund(this)"><option value="">Choose expense</option>${expenses.map((account)=>`<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId||'')}" ${item.expenseAccountId===account.id?'selected':''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><label>Fund<select name="fundId" required>${accountingData.funds.map((fund)=>`<option value="${escapeAttr(fund.id)}" ${(item.fundId||defaultFund?.id)===fund.id?'selected':''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('')}</select></label><label>Amount<input name="amountDollars" required type="number" min=".01" step=".01" value="${item.amount?(item.amount/100).toFixed(2):''}" placeholder="0.00"></label><label>Frequency<select name="frequency">${[['weekly','Weekly'],['biweekly','Every two weeks'],['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annually']].map(([value,label])=>`<option value="${value}" ${item.frequency===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Next posting date<input name="nextPostingDate" required type="date" value="${escapeAttr(item.nextPostingDate||new Date().toISOString().slice(0,10))}"></label><label>End date <small>Optional</small><input name="endDate" type="date" value="${escapeAttr(item.endDate||'')}"></label><label class="wide">Description<input name="description" maxlength="240" value="${escapeAttr(item.description||'')}" placeholder="What is this recurring expense for?"></label><div class="acct-recurring-foot"><span class="acct-form-status"></span><button class="acct-primary">${item.id?'Save schedule':'Start schedule'}</button></div></form></section>`;
    }
    return `<section class="acct-recurring-panel compact"><div class="acct-recurring-head"><div><span class="acct-kicker">Automation</span><h2>Recurring expenses</h2><p>${active.length} active schedule${active.length===1?'':'s'} · Due transactions post automatically each morning.</p></div><button class="acct-primary" onclick="accountingRecurringEditor={};renderAccountingPane()">＋ Schedule expense</button></div><div class="acct-recurring-list">${items.map((item)=>`<article><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.payee)} · ${escapeHtml(item.expenseAccount)} · ${escapeHtml(item.fund)}</small></div><span>${accountingMoney(item.amount)}<small>${escapeHtml(item.frequency)} · next ${accountingDate(item.nextPostingDate)}</small></span><i class="acct-status ${item.status==='active'?'posted':''}">${escapeHtml(item.status)}</i><div><button onclick="editAccountingRecurring('${escapeAttr(item.id)}')">Edit</button>${item.status==='active'?`<button onclick="toggleAccountingRecurring('${escapeAttr(item.id)}',${item.version},'paused')">Pause</button>`:item.status==='paused'?`<button onclick="toggleAccountingRecurring('${escapeAttr(item.id)}',${item.version},'active')">Resume</button>`:''}</div></article>`).join('')||'<div class="acct-fund-account-empty">No recurring expenses yet.</div>'}</div></section>`;
  }
  function accountingPledgeAccountSetting(settings = {}) {
    const revenue = accountingData.accounts.filter((account) => account.category === 'revenue');
    return `<label>Pledge comparison account<select id="accountingPledgeComparisonAccount"><option value="">Not configured</option>${revenue.map((account) => `<option value="${escapeAttr(account.id)}" ${settings.pledgeComparisonAccountId === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('')}</select><small>Choose the general stewardship/offering revenue account. AGAPAY will not guess or change a budget line.</small></label>`;
  }
  function renderAccountingPane() {
    const pane = document.getElementById('accountingPane');
    if (!pane) return;
    const reconcileWorkspace = document.getElementById('reconcileWorkspace');
    const reconcileParking = document.getElementById('tab-reconcile');
    if (reconcileWorkspace && reconcileParking && reconcileWorkspace.parentElement !== reconcileParking) reconcileParking.append(reconcileWorkspace);
    syncAccountingExperienceChrome();
    document.querySelectorAll('[data-accounting-view]').forEach((button) => button.classList.toggle('active', button.dataset.accountingView === accountingView || (button.dataset.accountingView === 'ledger' && accountingView === 'journals')));
    const pageTitle = document.getElementById('accountingPageTitle'); if (pageTitle) pageTitle.textContent = accountingViewTitle();
    if (accountingView === 'overview') { renderAccountingOverview(pane); return; }
    if (accountingView === 'settings') {
      const settings = accountingData.setup?.settings;
      if (!settings) { pane.innerHTML = accountingEmpty('Accounting settings are not loaded', 'Refresh to load the parish accounting configuration.'); return; }
      const staff=accountingStaffSession()?.profile;
      pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Accounting configuration</span><h2>Settings</h2><p>Manage the fiscal calendar, staff access, connected accounting, and help resources.</p></div><button class="acct-refresh" onclick="lockAccountingWorkspace()">Lock Accounting</button></div><div class="acct-setup-grid"><section class="acct-card acct-guide-card"><div><span class="acct-kicker">Accounting Suite Guide</span><h2>See how the whole system works</h2><p>Open the practical 13-page guide for Treasurer and Accountant views, income, non-cash gifts, bills, funds, reports, budgets, close, and staff access.</p></div><div class="acct-guide-actions"><a class="primary" href="/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf" target="_blank" rel="noopener">Open guide</a><a href="/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf" download>Download PDF</a></div></section><section class="acct-card acct-settings"><span class="acct-kicker">Fiscal calendar</span><h2>Parish accounting year</h2><label>Fiscal year starts<select id="accountingFiscalMonth">${Array.from({length:12},(_,index)=>`<option value="${index+1}" ${Number(settings.fiscalYearStartMonth||1)===index+1?'selected':''}>${new Date(2026,index,1).toLocaleString('en-US',{month:'long'})}</option>`).join('')}</select></label><label>Opening balances<select id="accountingOpeningDisposition"><option value="pending" ${settings.openingBalancesDisposition==='pending'?'selected':''}>Still to be entered</option><option value="required" ${settings.openingBalancesDisposition==='required'?'selected':''}>Required</option><option value="deferred" ${settings.openingBalancesDisposition==='deferred'?'selected':''}>Deferred</option><option value="not_applicable" ${settings.openingBalancesDisposition==='not_applicable'?'selected':''}>Not applicable</option><option value="posted" ${settings.openingBalancesDisposition==='posted'?'selected':''}>Posted</option></select></label>${accountingPledgeAccountSetting(settings)}<button type="button" class="acct-primary" onclick="saveAccountingSettings()">Save settings</button></section><section class="acct-card acct-settings"><span class="acct-kicker">Current operator</span><h2>${escapeHtml(staff?.displayName || 'Accounting staff')}</h2><p>${escapeHtml((staff?.roleTemplate || '').replaceAll('_',' '))} · Four-hour protected Accounting session.</p><form onsubmit="changeAccountingPin(event)"><label>New six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="acct-primary">Change my PIN</button><span class="acct-form-status"></span></form></section><section class="acct-card acct-settings"><span class="acct-kicker">Staff access</span><h2>Add a named profile</h2><form onsubmit="addAccountingStaff(event)"><label>Name<input name="displayName" required maxlength="120"></label><label>Responsibility<select name="roleTemplate"><option value="bookkeeper">Bookkeeper</option><option value="treasurer">Treasurer</option><option value="rector">Rector</option><option value="council_member">Council member</option></select></label><label>Temporary six-digit PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="acct-primary">Add profile</button><span class="acct-form-status"></span></form></section><section class="acct-card"><span class="acct-kicker">Connected activity</span><h2>Give &amp; Commerce</h2><p>Manage automatic posting, Stripe clearing, fees, refunds, and Parish Bookstore accounting.</p><button class="acct-primary" onclick="setAccountingView('integrations')">Open integration settings</button></section></div>`; return;
    }
    if (accountingView === 'setup') {
      const overview = accountingData.setup;
      if (!overview) { pane.innerHTML = accountingEmpty('Accounting setup is not loaded', 'Refresh to check the secure parish ledger.'); return; }
      if (accountingMigration.active) { renderAccountingMigrationWizard(pane); return; }
      const settings = overview.settings || {};
      pane.innerHTML = `<div class="acct-setup-grid">
        <section class="acct-card acct-setup-lead"><span class="acct-kicker">Setup progress</span><h2>${overview.initialization?.operational ? 'Your ledger is ready.' : 'Initialize your parish ledger.'}</h2><p>${overview.initialization?.operational ? `${overview.activeAccountCount || 0} accounts and ${overview.activeFundCount || 0} fund are ready for use.` : 'Create the protected nonprofit chart of accounts, General Operating Fund, fiscal year, and periods.'}</p>${overview.initialization?.operational ? '' : '<button type="button" class="acct-primary" onclick="initializeAccounting()">Initialize Accounting</button>'}</section>
        <section class="acct-card"><span class="acct-kicker">Readiness</span><div class="acct-checklist">${(overview.checklist || []).map((item) => `<div class="${item.complete ? 'complete' : ''}"><i>${item.complete ? '✓' : '○'}</i><span>${escapeHtml(item.label)}</span></div>`).join('')}</div></section>
        <section class="acct-card acct-settings"><span class="acct-kicker">Parish settings</span><h2>Fiscal year & opening balances</h2><label>Fiscal year starts<select id="accountingFiscalMonth">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${Number(settings.fiscalYearStartMonth || 1) === index + 1 ? 'selected' : ''}>${new Date(2026, index, 1).toLocaleString('en-US', { month: 'long' })}</option>`).join('')}</select></label><label>Opening balances<select id="accountingOpeningDisposition"><option value="pending" ${settings.openingBalancesDisposition === 'pending' ? 'selected' : ''}>Still to be entered</option><option value="required" ${settings.openingBalancesDisposition === 'required' ? 'selected' : ''}>Required</option><option value="deferred" ${settings.openingBalancesDisposition === 'deferred' ? 'selected' : ''}>Deferred</option><option value="not_applicable" ${settings.openingBalancesDisposition === 'not_applicable' ? 'selected' : ''}>Not applicable</option><option value="posted" ${settings.openingBalancesDisposition === 'posted' ? 'selected' : ''}>Posted</option></select></label>${accountingPledgeAccountSetting(settings)}<button type="button" class="acct-primary" onclick="saveAccountingSettings()" ${settings.version ? '' : 'disabled'}>Save settings</button></section>
        <section class="acct-card"><span class="acct-kicker">Ledger foundation validation</span><div id="accountingLedgerValidation" class="acct-facts"><div><strong>${overview.validation?.ok ? 'Healthy' : 'Review needed'}</strong><span>Ledger integrity</span></div></div><button type="button" class="acct-refresh" onclick="validateAccountingLedgerFoundation()">Validate foundation</button></section>
        <section class="acct-card acct-settings"><span class="acct-kicker">Opening balances</span><h2>Enter starting balances</h2><form class="acct-phase-form" onsubmit="postAccountingOpeningBalances(event)"><label>Effective date<input name="effectiveDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label>Description<input name="description" required value="Opening balances"></label><div class="acct-form-grid"><label>Debit account<select name="debitAccountId" required>${accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Credit account<select name="creditAccountId" required>${accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select><label>Fund<select name="fundId" required>${accountingData.funds.map(f=>`<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label></div><button class="acct-primary">Post opening balances</button><span class="acct-form-status"></span></form></section>
        <section class="acct-card"><span class="acct-kicker">Switching accounting systems</span><h2>Move from QuickBooks or Aplos</h2><p>Bring over a chart of accounts, vendors, funds, and either a clean opening balance or advanced general-ledger history through reviewed CSV steps.</p><button type="button" class="acct-primary" onclick="openAccountingMigration()">Open migration wizard</button><small>Treasurer-only · previews never write to the ledger.</small></section>
        <section class="acct-card"><span class="acct-kicker">Current books</span><div class="acct-facts"><div><strong>${escapeHtml(overview.currentFiscalYear?.name || 'Not set')}</strong><span>Fiscal year</span></div><div><strong>${escapeHtml(overview.currentPeriod?.name || 'Not open')}</strong><span>Open period</span></div><div><strong>${overview.validation?.ok ? 'Healthy' : 'Review needed'}</strong><span>Ledger integrity</span></div></div></section>
      </div>`;
      return;
    }
    if (accountingView === 'reports') { renderAccountingReports(pane); return; }
    if (accountingView === 'funds') { renderAccountingFunds(pane); return; }
    if (accountingView === 'payables') { renderAccountingPayables(pane); return; }
    if (accountingView === 'budgets') { renderAccountingBudgets(pane); return; }
    if (accountingView === 'banking') { renderAccountingBanking(pane); return; }
    if (accountingView === 'integrations') { renderAccountingIntegrations(pane); return; }
    if (accountingView === 'close') { renderAccountingClose(pane); return; }
    if (accountingView === 'governance') { renderAccountingGovernance(pane); return; }
    if (accountingExperienceMode === 'treasurer' && accountingView === 'ledger') {
      pane.innerHTML = `${accountingSimpleEntryMode === 'in-kind' ? accountingInKindGiftForm() : accountingSimpleIncomeForm()}${accountingSimpleActivityFeed()}`;
      return;
    }
    if (accountingJournalEditor) { renderAccountingJournalEditor(pane); return; }
    const register = accountingView === 'ledger' ? accountingRegisterModel() : null;
    const rows = register ? register.rows : accountingData.journals;
    if (accountingView !== 'ledger' && !rows.length) {
      pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Manual ledger</span><h2>Journal entries</h2></div><button type="button" class="acct-primary" onclick="newAccountingJournal()">New journal entry</button></div>${accountingEmpty('No journal entries yet', 'Create a balanced debit and credit to begin.')}`;
      return;
    }
    pane.innerHTML = accountingView === 'ledger' ? `
      <section class="acct-register-hero"><div class="acct-register-account"><span class="acct-kicker">Account register</span><label><select onchange="setAccountingLedgerAccount(this.value)">${register.options.map((account) => `<option value="${escapeAttr(account.number)}" ${account.number === register.account.number ? 'selected' : ''}>${escapeHtml(account.number)} · ${escapeHtml(account.name)}</option>`).join('')}</select></label><p>Choose the account where money was deposited or paid.</p></div><div class="acct-register-balance"><span>Current balance</span><strong>${accountingMoney(register.balance)}</strong><small>${register.rows.length} visible transaction${register.rows.length === 1 ? '' : 's'}</small></div><div class="acct-register-totals"><div><span>Total debits</span><strong>${accountingMoney(register.debits)}</strong></div><div><span>Total credits</span><strong>${accountingMoney(register.credits)}</strong></div></div></section>${accountingRegisterEntryForm(register)}${accountingRecurringPanel(register)}<div class="acct-register-actions"><div class="acct-ledger-toggle"><button class="active" onclick="setAccountingView('ledger')">Register</button><button onclick="setAccountingView('journals')">Journal entries</button></div><div><button class="acct-refresh" onclick="toggleAccountingLedgerOrder()">${accountingLedgerNewestFirst ? 'Oldest first' : 'Newest first'}</button><button class="acct-refresh" onclick="downloadAccountingLedger()">Export</button><button class="acct-refresh" onclick="printAccountingLedger()">Print</button></div></div><section class="acct-ledger-guide" aria-label="How to use the general ledger"><div><strong>Register</strong><span>Choose a cash, bank, or liability account, then record a payment, deposit, or contribution without building debit and credit lines yourself.</span></div><div><strong>Journal entries</strong><span>Use the journal-entry view for transfers, corrections, accruals, and other multi-line adjustments.</span></div><p>AGAPAY creates and posts the balanced journal entry behind every register transaction.</p></section><div class="acct-register-history-head"><div><span class="acct-kicker">Transaction history</span><h2>${escapeHtml(register.account.name)}</h2></div><form onsubmit="searchAccountingLedger(event)"><input name="query" value="${escapeAttr(accountingLedgerSearch)}" placeholder="Search this register"><button class="acct-refresh">Search</button>${accountingLedgerSearch ? '<button type="button" class="acct-link" onclick="clearAccountingLedgerSearch()">Clear</button>' : ''}</form></div><div class="acct-table-wrap acct-register-table"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Fund</th><th>Description</th><th>Payment</th><th>Deposit</th><th>Balance</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${accountingDate(row.postingDate || row.entryDate || row.date)}</td><td><strong>${escapeHtml(row.entryNumber || row.entry_number || '—')}</strong></td><td>${escapeHtml(row.fundName || row.fund_name || '—')}</td><td>${escapeHtml(row.description || row.memo || '')}</td><td>${Number(row.creditAmount ?? row.credit_amount ?? 0) ? accountingMoney(row.creditAmount ?? row.credit_amount) : '—'}</td><td>${Number(row.debitAmount ?? row.debit_amount ?? 0) ? accountingMoney(row.debitAmount ?? row.debit_amount) : '—'}</td><td><strong>${accountingMoney(row.registerBalance)}</strong></td></tr>`).join('') || '<tr><td colspan="7">No transactions in this account yet.</td></tr>'}</tbody></table></div>` : `
      <div class="acct-list-head"><div><span class="acct-kicker">Manual ledger</span><h2>Journal entries</h2></div><button type="button" class="acct-primary" onclick="newAccountingJournal()">New journal entry</button></div><div class="acct-ledger-toggle"><button onclick="setAccountingView('ledger')">Register</button><button class="active" onclick="setAccountingView('journals')">Journal entries</button></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Source</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${accountingDate(row.entryDate || row.entry_date || row.postingDate)}</td><td><strong>${escapeHtml(row.entryNumber || row.entry_number || row.id || '')}</strong></td><td>${escapeHtml(row.description || row.memo || '')}</td><td>${escapeHtml(row.sourceType || row.source_type || 'Manual')}</td><td><strong>${accountingMoney(row.totalDebits ?? row.total_debits ?? row.totalCredits ?? row.total_credits ?? 0)}</strong></td><td><span class="acct-status ${escapeAttr(row.status || 'draft')}">${escapeHtml(row.status || 'draft')}</span></td><td><button type="button" class="acct-link" onclick="openAccountingJournalAttachments('${escapeAttr(row.id)}')">Attachments</button>${row.status === 'draft' ? `<button type="button" class="acct-link" onclick="editAccountingJournal('${escapeAttr(row.id)}')">Continue</button><button type="button" class="acct-link" onclick="voidAccountingJournal('${escapeAttr(row.id)}')">Void</button>` : row.status === 'posted' ? `<button type="button" class="acct-link" onclick="reverseAccountingJournal('${escapeAttr(row.id)}')">Reverse</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function openAccountingJournalAttachments(id) {
    const pane = document.getElementById('accountingPane');
    if (!pane) return;
    pane.querySelector('[data-journal-attachment-panel]')?.remove();
    pane.insertAdjacentHTML('afterbegin', `<section class="acct-card" data-journal-attachment-panel><div class="acct-list-head"><div><span class="acct-kicker">Journal entry detail</span><h2>Supporting documents</h2></div><button class="acct-link" onclick="this.closest('[data-journal-attachment-panel]').remove()">Close</button></div><div data-accounting-attachments></div></section>`);
    renderAccountingAttachments('journal_entry', id, pane.querySelector('[data-journal-attachment-panel] [data-accounting-attachments]'));
  }
  function toggleAccountingLedgerOrder() {
    accountingLedgerNewestFirst = !accountingLedgerNewestFirst;
    renderAccountingPane();
  }
  function setAccountingLedgerAccount(accountNumber) { accountingLedgerAccountNumber = accountNumber; accountingLedgerSearch = ''; renderAccountingPane(); }
  function searchAccountingLedger(event) { event.preventDefault(); accountingLedgerSearch = String(new FormData(event.currentTarget).get('query') || '').trim(); renderAccountingPane(); }
  function clearAccountingLedgerSearch() { accountingLedgerSearch = ''; renderAccountingPane(); }
  function setAccountingRegisterEntryMode(mode) {
    accountingRegisterEntryMode = mode === 'contribution' ? 'contribution' : 'transaction';
    renderAccountingPane();
  }
  function applyAccountingRegisterDefaultFund(accountSelect) {
    const defaultFundId = accountSelect.selectedOptions[0]?.dataset.defaultFund || '';
    const fundSelect = accountSelect.form?.elements?.fundId;
    if (defaultFundId && fundSelect) fundSelect.value = defaultFundId;
  }
  async function submitAccountingRegisterEntry(event, kind) {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('.acct-form-status'), button = form.querySelector('button[type="submit"],button.acct-primary');
    const data = Object.fromEntries(new FormData(form));
    const register = accountingRegisterModel(), registerAccountId = register.configuration?.id || register.account.id || '';
    const payment = Math.round(Number(data.payment || 0) * 100), deposit = Math.round(Number(data.deposit || 0) * 100);
    const amount = kind === 'contribution' ? deposit : payment || deposit;
    if (!registerAccountId || !data.offsetAccountId || !data.fundId || !data.entryDate || !data.payee || !Number.isSafeInteger(amount) || amount <= 0 || (kind === 'transaction' && payment > 0 && deposit > 0)) {
      status.textContent = kind === 'contribution' ? 'Complete every required field and enter a contribution amount.' : 'Complete every required field and enter either a payment or a deposit.';
      status.className = 'acct-form-status error'; return;
    }
    const detail = [data.payee, data.comment, data.reference ? `Ref ${data.reference}` : ''].filter(Boolean).join(' · ');
    const lines = kind === 'contribution' || deposit > 0
      ? [{ accountId:registerAccountId, fundId:data.fundId, description:detail, debitAmount:amount }, { accountId:data.offsetAccountId, fundId:data.fundId, description:detail, creditAmount:amount }]
      : [{ accountId:data.offsetAccountId, fundId:data.fundId, description:detail, debitAmount:amount }, { accountId:registerAccountId, fundId:data.fundId, description:detail, creditAmount:amount }];
    button.disabled = true; status.className = 'acct-form-status'; status.textContent = 'Creating the balanced entry…';
    try {
      const createResponse = await fetch(accountingApi('/journals'), { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ entryDate:data.entryDate, description:detail, sourceType:kind === 'contribution' ? 'manual_register_contribution' : 'manual_register_transaction', lines }) });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(created.message || created.error || 'Unable to create this transaction.');
      const validationResponse = await fetch(accountingApi(`/journals/${encodeURIComponent(created.entry.id)}/validate`), { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ expectedVersion:created.entry.version }) });
      const validation = await validationResponse.json().catch(() => ({}));
      if (!validationResponse.ok || !validation.validation?.ok) throw new Error((validation.validation?.issues || [validation.message || 'The entry could not be validated.']).join(' · ').replaceAll('_',' '));
      status.textContent = 'Posting to the ledger…';
      const key = `register-ui-${created.entry.id}-${created.entry.version}`;
      const postResponse = await fetch(accountingApi(`/journals/${encodeURIComponent(created.entry.id)}/post`), { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ expectedVersion:created.entry.version, idempotencyKey:key, requestHash:key }) });
      const posted = await postResponse.json().catch(() => ({}));
      if (!postResponse.ok) throw new Error(posted.message || posted.error || 'Unable to post this transaction.');
      await loadAccountingTab(true);
    } catch (error) {
      status.textContent = error.message || 'Unable to post this transaction.';
      status.className = 'acct-form-status error'; button.disabled = false;
    }
  }
  function editAccountingRecurring(id){accountingRecurringEditor=(accountingData.recurring||[]).find((item)=>item.id===id)||null;renderAccountingPane();}
  async function saveAccountingRecurring(event){
    event.preventDefault();const form=event.currentTarget,status=form.querySelector('.acct-form-status'),body=Object.fromEntries(new FormData(form));body.amount=Math.round(Number(body.amountDollars||0)*100);delete body.amountDollars;
    if(accountingRecurringEditor?.id)body.expectedVersion=accountingRecurringEditor.version;
    status.textContent='Saving schedule…';
    const response=await fetch(accountingApi(accountingRecurringEditor?.id?`/recurring-transactions/${encodeURIComponent(accountingRecurringEditor.id)}`:'/recurring-transactions'),{method:accountingRecurringEditor?.id?'PATCH':'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));
    if(!response.ok){status.textContent=payload.message||payload.error||'Unable to save this recurring expense.';status.className='acct-form-status error';return;}
    accountingRecurringEditor=null;await loadAccountingTab(true);
  }
  async function toggleAccountingRecurring(id,expectedVersion,status){
    const response=await fetch(accountingApi(`/recurring-transactions/${encodeURIComponent(id)}`),{method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({expectedVersion,status})}),payload=await response.json().catch(()=>({}));
    if(!response.ok){alert(payload.message||payload.error||'Unable to update this recurring expense.');return;}await loadAccountingTab(true);
  }
  function accountingParishOnly() { return `<div class="acct-tier-gate"><span class="acct-kicker">Parish Accounting</span><h2>Advanced parish operations</h2><p>Payables and budgeting are included with the Parish tier. Mission Accounting continues to include the essential ledger and reports.</p></div>`; }
  function renderAccountingPayables(pane) {
    if (accountingData.tier !== 'advanced_operations') { pane.innerHTML = accountingParishOnly(); return; }
    const data = accountingData.payables;
    if (!data) { pane.innerHTML = '<p class="sw-tool-loading">Loading payables...</p>'; return; }
    if (accountingPayablesView === 'payments') { renderAccountingPayments(pane, data); return; }
    if (accountingPayablesView === 'runs') { renderAccountingPaymentRuns(pane, data); return; }
    if (accountingPayablesView === '1099') { renderAccounting1099Review(pane, data); return; }
    if (accountingPayablesView === 'recurring') { renderAccountingRecurringBills(pane, data); return; }
    const overview = data.overview || {}, tabs = [['bills','Bills'],['recurring','Recurring bills'],['payments','Payments & Checks'],['runs','Payment runs'],['1099','1099 review'],['vendors','Vendors'],['aging','Aging']];
    const vendorLifecycle = (vendor) => {
      const action = vendor.status === 'archived' ? 'unarchive' : 'archive', confirming = accountingVendorLifecycleConfirm?.id === vendor.id && accountingVendorLifecycleConfirm.action === action;
      const message = accountingLifecycleMessage?.type === 'vendor' && accountingLifecycleMessage.id === vendor.id ? `<span class="acct-lifecycle-message">${escapeHtml(accountingLifecycleMessage.text)}</span>` : '';
      return `<div class="acct-lifecycle-actions">${confirming ? `<span>${action === 'archive' ? 'Archive this vendor?' : 'Restore this vendor?'}</span><button type="button" onclick="changeAccountingVendorLifecycle('${escapeAttr(vendor.id)}','${action}',${vendor.version})">Confirm</button><button type="button" onclick="cancelAccountingLifecycle()">Cancel</button>` : `<button type="button" onclick="showAccountingVendorForm('${escapeAttr(vendor.id)}')">Edit</button><button type="button" onclick="beginAccountingVendorLifecycle('${escapeAttr(vendor.id)}','${action}')">${action === 'archive' ? 'Archive' : 'Unarchive'}</button>`}${message}</div>`;
    };
    let body = '';
    if (accountingPayablesView === 'vendors') body = `<div class="acct-list-head"><div><span class="acct-kicker">Vendor directory</span><h2>${data.vendors.length} vendors</h2></div><button class="acct-primary" type="button" onclick="showAccountingVendorForm()">New vendor</button></div><div id="accountingPhaseDForm"></div><div class="acct-card-grid">${data.vendors.map((vendor) => `<article class="acct-mini-card ${vendor.status==='archived'?'retired':''}"><span>${escapeHtml(vendor.vendorNumber)} · ${escapeHtml(vendor.status)}</span><h3>${escapeHtml(vendor.displayName)}</h3><p>${escapeHtml(vendor.email || vendor.vendorType || 'Active vendor')}</p>${vendorLifecycle(vendor)}</article>`).join('') || accountingEmpty('No vendors yet','Add the first vendor before entering a bill.')}</div>`;
    else if (accountingPayablesView === 'aging') body = `<div class="acct-list-head"><div><span class="acct-kicker">Accounts payable aging</span><h2>${accountingMoney(data.aging.totalDue)} outstanding</h2></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Current</th><th>1–30</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th></tr></thead><tbody>${(data.aging.rows || []).map((row) => `<tr><td><strong>${escapeHtml(row.vendor)}</strong></td><td>${accountingMoney(row.current)}</td><td>${accountingMoney(row.days1to30)}</td><td>${accountingMoney(row.days31to60)}</td><td>${accountingMoney(row.days61to90)}</td><td>${accountingMoney(row.over90)}</td><td><strong>${accountingMoney(row.totalDue)}</strong></td></tr>`).join('') || '<tr><td colspan="7">No outstanding payables.</td></tr>'}</tbody></table></div>`;
    else body = `<div class="acct-list-head"><div><span class="acct-kicker">Bill workflow</span><h2>Vendor bills & approvals</h2></div><button class="acct-primary" type="button" onclick="showAccountingBillForm()">Enter bill</button></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Due</th><th>Vendor</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.bills.map((bill) => `<tr><td>${accountingDate(bill.dueDate)}</td><td><strong>${escapeHtml(bill.vendorName)}</strong></td><td>${escapeHtml(bill.vendorInvoiceNumber || bill.billNumber)}</td><td>${accountingMoney(bill.amountDue ?? bill.totalAmount)}</td><td><span class="acct-status ${escapeAttr(bill.status)}">${escapeHtml(bill.status)}</span></td><td><div class="acct-row-actions"><button onclick="openAccountingBillDetail('${escapeAttr(bill.id)}')">Details & attachments</button>${bill.status === 'draft' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','submit',${bill.version})">Submit</button>` : ''}${bill.status === 'submitted' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','approve',${bill.version})">Approve</button>` : ''}${bill.status === 'approved' ? `<button onclick="accountingBillAction('${escapeAttr(bill.id)}','post',${bill.version})">Post</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6">No bills entered.</td></tr>'}</tbody></table></div>`;
    pane.innerHTML = `<div class="acct-kpis"><div><span>Open payables</span><strong>${accountingMoney(overview.openPayables)}</strong></div><div><span>Awaiting approval</span><strong>${overview.awaitingApproval || 0}</strong></div><div><span>Overdue bills</span><strong>${overview.overdue || 0}</strong></div></div><div class="acct-subtabs">${tabs.map(([id,label]) => `<button class="${accountingPayablesView === id ? 'active' : ''}" onclick="setAccountingPayablesView('${id}')">${label}</button>`).join('')}</div>${body}`;
  }
  function accountingPayablesTabs(){return [['bills','Bills'],['recurring','Recurring bills'],['payments','Payments & Checks'],['runs','Payment runs'],['1099','1099 review'],['vendors','Vendors'],['aging','Aging']].map(([id,label])=>`<button class="${accountingPayablesView===id?'active':''}" onclick="setAccountingPayablesView('${id}')">${label}</button>`).join('');}
  function renderAccountingRecurringBills(pane,data) {
    const schedules=data.recurringBills||[];
    pane.innerHTML=`<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Accounts payable automation</span><h2>Recurring vendor bills</h2><p>Each due date creates a reviewable draft bill. Nothing is approved, posted, or paid automatically.</p></div><button class="acct-primary" type="button" onclick="showAccountingRecurringBillForm()">New recurring bill</button></div><div id="accountingPhaseDForm"></div><div class="acct-card-grid">${schedules.map(item=>`<article class="acct-mini-card"><span>${escapeHtml(item.frequency)} · next ${accountingDate(item.nextBillDate)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.vendorName)} · ${escapeHtml(item.accountName)} · ${escapeHtml(item.fundName)}</p><strong>${accountingMoney(item.amount)}</strong><div class="acct-lifecycle-actions"><span class="acct-status ${item.status==='active'?'posted':'draft'}">${escapeHtml(item.status)}</span>${item.status==='active'?`<button type="button" onclick="toggleAccountingRecurringBill('${escapeAttr(item.id)}',${item.version},'paused')">Pause</button>`:item.status==='paused'?`<button type="button" onclick="toggleAccountingRecurringBill('${escapeAttr(item.id)}',${item.version},'active')">Resume</button>`:''}</div></article>`).join('')||accountingEmpty('No recurring bills yet','Create a schedule for utilities, insurance, subscriptions, or another repeating vendor bill.')}</div>`;
  }
  function renderAccountingPayments(pane,data) {
    const overview=data.overview||{}, payments=data.payments||[];
    const methodLabel={check:'Check',external:'Online bill pay',ach:'ACH / bank transfer',wire:'Wire transfer',debit_card:'Debit card',credit_card:'Credit card',cash:'Cash',other:'Other'};
    const paymentRows=payments.map(payment=>{const isCheck=payment.paymentMethod==='check';return `<tr><td>${accountingDate(payment.paymentDate)}</td><td><strong>${escapeHtml(payment.checkNumber||payment.referenceNumber||payment.paymentNumber)}</strong>${isCheck&&Number(payment.printCount)>1?`<br><small class="acct-check-state">Reprinted · ${Number(payment.printCount)} copies</small>`:isCheck&&Number(payment.printCount)===1?'<br><small class="acct-check-state">Original printed</small>':''}</td><td>${escapeHtml(methodLabel[payment.paymentMethod]||payment.paymentMethod)}</td><td>${escapeHtml(payment.vendorName)}</td><td>${escapeHtml(payment.bankAccountName)}</td><td>${accountingMoney(payment.totalAmount)}</td><td><span class="acct-status ${escapeAttr(payment.status)}">${payment.status==='voided'?'Voided':escapeHtml(payment.status)}</span></td><td><div class="acct-row-actions">${payment.status==='approved'?`${isCheck?`<button onclick="printAccountingCheck('${escapeAttr(payment.id)}',${Number(payment.printCount)||0})">${payment.printCount?'Reprint':'Print'}</button>`:''}<button onclick="postAccountingPayment('${escapeAttr(payment.id)}',${payment.version})" ${isCheck&&!payment.printCount?'disabled title="Print the check before posting"':''}>Post</button>`:payment.status==='posted'&&isCheck?`<button onclick="printAccountingCheck('${escapeAttr(payment.id)}',${Number(payment.printCount)||0})">Reprint</button>`:''}${['approved','posted'].includes(payment.status)?`<button onclick="voidAccountingPayment('${escapeAttr(payment.id)}',${payment.version})">Void</button>`:''}</div></td></tr>`}).join('');
    pane.innerHTML=`<div class="acct-kpis"><div><span>Open payables</span><strong>${accountingMoney(overview.openPayables)}</strong></div><div><span>Payments ready</span><strong>${payments.filter(payment=>payment.status==='approved').length}</strong></div><div><span>Payments posted</span><strong>${payments.filter(payment=>payment.status==='posted').length}</strong></div></div><div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Payment desk</span><h2>Bill payment register</h2></div><div class="acct-report-actions"><button class="acct-refresh" type="button" onclick="showAccountingCheckSettings()">Check settings</button><button class="acct-primary" type="button" onclick="showAccountingPaymentForm()">Pay bills</button></div></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Vendor</th><th>Bank</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${paymentRows||'<tr><td colspan="8">No bill payments yet.</td></tr>'}</tbody></table></div>`;
  }
  function renderAccountingPaymentRuns(pane,data){pane.innerHTML=`<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Month-end payables</span><h2>Payment runs</h2><p>Reserve a unique check range, review each vendor payment, post, then print one stack.</p></div><button class="acct-primary" onclick="showAccountingPaymentRunForm()">New payment run</button></div><div id="accountingPhaseDForm"></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Bank</th><th>Payments</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>${(data.paymentRuns||[]).map(run=>`<tr><td>${accountingDate(run.runDate)}</td><td>${escapeHtml(run.bankAccountName)}</td><td>${run.paymentCount}</td><td>${accountingMoney(run.totalAmount)}</td><td><span class="acct-status ${escapeAttr(run.status)}">${escapeHtml(run.status)}</span></td><td><div class="acct-row-actions">${run.status==='draft'?`<button onclick="postAccountingPaymentRun('${escapeAttr(run.id)}',${run.version})">Post remainder</button>`:''}<button onclick="printAccountingPaymentRun('${escapeAttr(run.id)}')">Print stack</button></div></td></tr>`).join('')||'<tr><td colspan="6">No payment runs yet.</td></tr>'}</tbody></table></div>`;}
  function renderAccounting1099Review(pane,data){const report=data.tax1099||{calendarYear:new Date().getFullYear(),vendors:[],disclaimer:'Data-preparation aid only; not a filed or filing-ready Form 1099-NEC or Form 1096.'};pane.innerHTML=`<div class="acct-subtabs">${accountingPayablesTabs()}</div><div class="acct-list-head"><div><span class="acct-kicker">Vendor tax review</span><h2>1099 review</h2><p>${escapeHtml(report.disclaimer)}</p></div><div class="acct-report-actions"><label>Calendar year <input id="accounting1099Year" type="number" min="2000" max="2200" value="${escapeAttr(report.calendarYear)}"></label><button class="acct-refresh" onclick="loadAccounting1099Review()">Run report</button><button class="acct-primary" onclick="downloadAccounting1099Review()">Export CSV</button></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Legal name</th><th>Tax ID</th><th>Classification</th><th>Eligible paid</th><th>$600 threshold</th></tr></thead><tbody>${(report.vendors||[]).map(vendor=>`<tr><td><strong>${escapeHtml(vendor.displayName)}</strong></td><td>${escapeHtml(vendor.legalName||'—')}</td><td>${vendor.taxIdLast4?`•••• ${escapeHtml(vendor.taxIdLast4)}`:'—'}</td><td>${escapeHtml(vendor.taxClassification||'—')}</td><td>${accountingMoney(vendor.totalPaid)}</td><td><span class="acct-status ${vendor.meetsThreshold?'posted':'draft'}">${vendor.meetsThreshold?'Threshold met':'Below threshold'}</span></td></tr>`).join('')||'<tr><td colspan="6">No vendors are flagged for 1099 review.</td></tr>'}</tbody></table></div><p class="acct-report-disclaimer">Card and third-party network payments are excluded because those amounts are generally reported by the payment network on Form 1099-K. Confirm filing obligations with a qualified tax professional.</p>`;}
  function renderAccountingPledgeComparison(comparison = {}) {
    if (!comparison.accountId) return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>Choose a stewardship revenue account</h3><p>Pledge totals are available, but AGAPAY will not guess which revenue account belongs in this comparison.</p><button class="acct-refresh" onclick="setAccountingView('settings')">Configure account</button></aside>`;
    if (comparison.budgetedLineAmountCents === null) return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>${accountingMoney(comparison.pledgedTotalCents)} pledged</h3><p>${comparison.pledgingHouseholds} pledging households for ${comparison.fiscalYear}. Add a draft line for ${escapeHtml(comparison.accountNumber)} · ${escapeHtml(comparison.accountName)} to compare it.</p></aside>`;
    return `<aside class="acct-card"><span class="acct-kicker">Compared to pledges</span><h3>${accountingMoney(comparison.pledgedTotalCents)} pledged</h3><div class="acct-facts"><div><strong>${accountingMoney(comparison.budgetedLineAmountCents)}</strong><span>Budgeted for ${escapeHtml(comparison.accountNumber)} · ${escapeHtml(comparison.accountName)}</span></div><div><strong>${accountingMoney(comparison.varianceCents)}</strong><span>Budget less pledges · informational only</span></div></div><p>${comparison.pledgingHouseholds} pledging households. This panel never changes a budget line.</p></aside>`;
  }
  function renderAccountingBudgets(pane) {
    if (accountingData.tier !== 'advanced_operations') { pane.innerHTML = accountingParishOnly(); return; }
    const data = accountingData.budgets;
    if (!data) { pane.innerHTML = '<p class="sw-tool-loading">Loading budgets...</p>'; return; }
    if (accountingBudgetReport) {
      const report = accountingBudgetReport;
      pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Budget to actual</span><h2>${escapeHtml(report.budget?.name || 'Budget variance')}</h2></div><div class="acct-report-actions"><button class="acct-refresh" onclick="closeAccountingBudgetReport()">Back</button><button class="acct-primary" onclick="downloadAccountingBudgetVariance('${escapeAttr(report.budget.id)}')">Export CSV</button></div></div><div class="acct-kpis"><div><span>Budget YTD</span><strong>${accountingMoney(report.totals?.budget)}</strong></div><div><span>Actual YTD</span><strong>${accountingMoney(report.totals?.actual)}</strong></div><div><span>Variance</span><strong>${accountingMoney(report.totals?.variance)}</strong></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account</th><th>Budget</th><th>Actual</th><th>Variance</th><th>Assessment</th></tr></thead><tbody>${(report.rows || []).map((row) => `<tr><td><strong>${escapeHtml(row.accountNumber)}</strong> ${escapeHtml(row.account)}</td><td>${accountingMoney(row.budget)}</td><td>${accountingMoney(row.actual)}</td><td>${accountingMoney(row.variance)}</td><td><span class="acct-status ${row.favorable ? 'posted' : ''}">${escapeHtml(row.varianceLabel)}</span></td></tr>`).join('') || '<tr><td colspan="5">No budget lines.</td></tr>'}</tbody></table></div>`; return;
    }
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Financial planning</span><h2>Budget versions</h2></div><button class="acct-primary" onclick="showAccountingBudgetForm()">New budget</button></div><div id="accountingPhaseDForm">${accountingBudgetEditor?`<div class="acct-setup-grid">${renderAccountingPledgeComparison(accountingBudgetEditor.pledgeComparison)}<section class="acct-card"><span class="acct-kicker">Inline budget-line editing</span><h2>Edit draft lines</h2>${accountingBudgetEditor.lines.map(line=>`<form class="acct-phase-form" onsubmit="updateAccountingBudgetLine(event,'${escapeAttr(accountingBudgetEditor.budgetId)}','${escapeAttr(line.id)}',${line.version})"><strong>${escapeHtml(line.accountNumber)} · ${escapeHtml(line.accountName)}</strong><div class="acct-form-grid"><label>Annual amount<input name="annualAmount" type="number" step="0.01" value="${Number(line.annualAmount||0)/100}" required></label><label>Allocation<select name="allocationStrategy"><option value="even" ${line.allocationStrategy==='even'?'selected':''}>Even monthly</option><option value="custom" ${line.allocationStrategy==='custom'?'selected':''}>Custom</option></select></label></div><button class="acct-primary">Save line</button><span class="acct-form-status"></span></form>`).join('')}</section></div>`:''}</div><div class="acct-card-grid">${data.items.map((budget) => `<article class="acct-budget-card"><div><span>Version ${budget.versionNumber}</span><h3>${escapeHtml(budget.name)}</h3><p>${escapeHtml(budget.description || 'Parish operating plan')}</p></div><span class="acct-status ${escapeAttr(budget.status)}">${escapeHtml(budget.status)}</span><div class="acct-row-actions"><button onclick="openAccountingBudgetVariance('${escapeAttr(budget.id)}')">Variance</button><button onclick="openAccountingCouncilPacket('${escapeAttr(budget.id)}')">Council packet</button>${budget.status === 'draft' ? `<button onclick="editAccountingBudgetLines('${escapeAttr(budget.id)}')">Edit lines</button><button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','submit',${budget.version})">Submit</button>` : ''}${budget.status === 'submitted' ? `<button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','approve',${budget.version})">Approve</button>` : ''}${budget.status === 'approved' ? `<button onclick="accountingBudgetAction('${escapeAttr(budget.id)}','lock',${budget.version})">Lock</button>` : ''}</div></article>`).join('') || accountingEmpty('No budgets yet','Create the first operating budget and allocate it by account and fund.')}</div>`;
  }
  function setAccountingView(view) {
    if (accountingPreviewOnly()) { renderAccountingPaywall(); return; }
    accountingView = ['overview', 'setup', 'settings', 'reports', 'journals', 'ledger', 'funds', 'payables', 'budgets', 'banking', 'integrations', 'close', 'governance'].includes(view) ? view : 'overview';
    renderAccountingPane();
    if (['payables', 'budgets'].includes(accountingView) && accountingData.tier === 'advanced_operations' && !accountingData[accountingView]) loadAccountingPhaseD();
    if (['banking', 'integrations'].includes(accountingView) && !accountingData[accountingView]) loadAccountingPhaseE();
    if (accountingView === 'funds' && !accountingFundCatalog) loadAccountingFunds();
    if (accountingView === 'close' && !accountingData.close) loadAccountingPhaseF();
    if (accountingView === 'governance' && !accountingData.governance) loadAccountingGovernance();
  }
  function openAccountingSimpleIncome() {
    accountingSimpleIncomeMessage = '';
    accountingSimpleEntryMode = 'income';
    accountingView = 'ledger';
    renderAccountingPane();
  }
  function openAccountingInKindGift() {
    accountingInKindGiftMessage = '';
    accountingSimpleEntryMode = 'in-kind';
    accountingView = 'ledger';
    renderAccountingPane();
  }
  async function openAccountingSimpleBill() {
    accountingPayablesView = 'bills';
    accountingView = 'payables';
    if (!accountingData.payables) await loadAccountingPhaseD();
    else renderAccountingPane();
    showAccountingBillForm();
  }
  async function submitAccountingSimpleIncome(event) {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('.acct-form-status'), button = form.querySelector('button[type="submit"],button.acct-primary');
    const raw = Object.fromEntries(new FormData(form)), splitEnabled = form.dataset.splitEnabled === '1';
    const splits = collectAccountingIncomeSplits(form);
    const amount = splitEnabled ? Math.round(Number(form.querySelector('[data-income-total]').value) * 100) : splits[0]?.amount;
    const allocated = splits.reduce((sum, split) => sum + split.amount, 0);
    if (!raw.depositAccountId || !raw.entryDate || !String(raw.description || '').trim() || !Number.isSafeInteger(amount) || amount <= 0 || splits.some((split) => !split.revenueAccountId || !split.fundId || !Number.isSafeInteger(split.amount) || split.amount <= 0) || (splitEnabled && allocated !== amount)) {
      status.textContent = 'Complete every field and enter an amount greater than zero.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Recording income…';
    const endpoint = splitEnabled && splits.length > 1 ? '/simple/split-deposits' : '/simple/deposits';
    const body = endpoint === '/simple/split-deposits'
      ? { entryDate:raw.entryDate, description:String(raw.description).trim(), depositAccountId:raw.depositAccountId, amount, splits, correlationId:`split-income-ui-${Date.now()}` }
      : { entryDate:raw.entryDate, description:String(raw.description).trim(), depositAccountId:raw.depositAccountId, revenueAccountId:splits[0].revenueAccountId, fundId:splits[0].fundId, amount, correlationId:`simple-income-ui-${Date.now()}` };
    const response = await fetch(accountingApi(endpoint), {
      method:'POST',
      headers:{ ...authHeaders(), 'Content-Type':'application/json' },
      body:JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = payload.message || payload.error || 'Unable to record this income.';
      button.disabled = false;
      return;
    }
    accountingSimpleIncomeMessage = `${accountingMoney(amount)} was recorded successfully.`;
    await loadAccountingTab(true);
    accountingView = 'ledger';
    renderAccountingPane();
  }
  async function submitAccountingInKindGift(event) {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('.acct-simple-income-foot .acct-form-status'), button = form.querySelector('button.acct-primary');
    const raw = Object.fromEntries(new FormData(form)), amount = Math.round(Number(raw.amount) * 100);
    if (!String(raw.itemDescription || '').trim() || !String(raw.valuationBasis || '').trim() || !raw.debitAccountId || !raw.fundId || !raw.entryDate || !Number.isSafeInteger(amount) || amount <= 0) {
      status.textContent = 'Describe the gift, explain its valuation, and complete every required field.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Posting non-cash gift…';
    const response = await fetch(accountingApi('/simple/in-kind-gifts'), {
      method:'POST',
      headers:{ ...authHeaders(), 'Content-Type':'application/json' },
      body:JSON.stringify({
        entryDate:raw.entryDate,
        itemDescription:String(raw.itemDescription).trim(),
        donorName:String(raw.donorName || '').trim(),
        valuationBasis:String(raw.valuationBasis).trim(),
        debitAccountId:raw.debitAccountId,
        fundId:raw.fundId,
        amount,
        correlationId:`in-kind-gift-ui-${Date.now()}`
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = payload.message || payload.error || 'Unable to record this non-cash gift.';
      button.disabled = false;
      return;
    }
    accountingInKindGiftMessage = `${accountingMoney(amount)} for ${String(raw.itemDescription).trim()} posted as a balanced non-cash gift.`;
    await loadAccountingTab(true);
    accountingSimpleEntryMode = 'in-kind';
    accountingView = 'ledger';
    renderAccountingPane();
  }
  const ACCOUNTING_REPORT_LIBRARY = [
    { id:'activities', title:'Income Statement', group:'Income statements', copy:'Revenue, expenses, and change in net assets for the current period.' },
    { id:'comparativePeriods', title:'Comparative Income Statement Periods', group:'Income statements', copy:'Compare this month with the immediately preceding month.' },
    { id:'incomeByFund', title:'Income Statement by Fund', group:'Income statements', copy:'Revenue, expenses, and net activity for every fund.' },
    { id:'incomeByMonth', title:'Income Statement by Month', group:'Income statements', copy:'Monthly revenue, expense, and net-activity trend.' },
    { id:'comparativeIncome', title:'Comparative Income Statement', group:'Income statements', copy:'Compare current-year activity with the same period last year.' },
    { id:'position', title:'Balance Sheet', group:'Balance sheets', copy:'Assets, liabilities, and net assets as of today.' },
    { id:'balanceByFund', title:'Balance Sheet by Fund', group:'Balance sheets', copy:'Financial position summarized separately for each fund.' },
    { id:'cashFlows', title:'Statement of Cash Flows', group:'Accountant package', copy:'Indirect-method operating, investing, and financing cash movement with reconciliation.' },
    { id:'functionalExpenses', title:'Statement of Functional Expenses', group:'Accountant package', copy:'Natural expense categories across program, management-and-general, and fundraising functions.' },
    { id:'netAssetRollforward', title:'Net Asset Rollforward', group:'Accountant package', copy:'Beginning, additions, reductions, and ending balances by restriction class.' },
    { id:'budgetActual', title:'Budget to Actual', group:'Budgeting', copy:'Compare the active budget with posted actual activity.', parishOnly:true },
    { id:'comparativeBudget', title:'Comparative Budget to Actual', group:'Budgeting', copy:'Compare the two most recent budget versions and actual results.', parishOnly:true },
    { id:'budgetByFund', title:'Budget by Fund', group:'Budgeting', copy:'Budget, actual, and variance summarized for each fund.', parishOnly:true },
    { id:'trialBalance', title:'Trial Balance', group:'Accounting detail', copy:'Ending debits and credits for every posting account.' },
    { id:'expenses', title:'Expense Breakdown', group:'Accounting detail', copy:'Visual expense analysis with the current AGAPAY subscription rate shown separately.' }
  ];
  function accountingReportPeriod() {
    const fiscal = accountingData.setup?.currentFiscalYear || {};
    const now = new Date(), today = now.toISOString().slice(0,10);
    return { start:fiscal.startDate || `${now.getUTCFullYear()}-01-01`, end:fiscal.endDate && fiscal.endDate < today ? fiscal.endDate : today };
  }
  function accountingReportLedgerRows(startDate = '0001-01-01', endDate = '9999-12-31') {
    const accounts = new Map(accountingData.accounts.map((account) => [String(account.accountNumber || ''),account]));
    return accountingData.ledger.filter((row) => {
      const date = String(row.postingDate || row.entryDate || row.date || '');
      return date >= startDate && date <= endDate;
    }).map((row) => {
      const account = accounts.get(String(row.accountNumber || row.account_number || '')) || {};
      const debit = Number(row.debitAmount ?? row.debit_amount ?? 0), credit = Number(row.creditAmount ?? row.credit_amount ?? 0);
      const category = account.category || '';
      const amount = ['revenue','liability','net_asset'].includes(category) ? credit - debit : debit - credit;
      return { ...row, account, category, amount, date:String(row.postingDate || row.entryDate || row.date || ''), fund:String(row.fundName || row.fund_name || 'Unassigned') };
    });
  }
  function accountingTabularReport(id) {
    const period = accountingReportPeriod(), current = accountingReportLedgerRows(period.start,period.end);
    const moneyColumn = (key,label) => ({ key,label,money:true });
    if (id === 'incomeByFund') {
      const groups = new Map();
      for (const row of current.filter((item)=>['revenue','expense'].includes(item.category))) { const item=groups.get(row.fund)||{name:row.fund,revenue:0,expenses:0}; item[row.category==='revenue'?'revenue':'expenses']+=row.amount; groups.set(row.fund,item); }
      const rows=[...groups.values()].map((row)=>({...row,net:row.revenue-row.expenses})).sort((a,b)=>a.name.localeCompare(b.name));
      return { title:'Income Statement by Fund', subtitle:`${period.start} through ${period.end}`, columns:[{key:'name',label:'Fund'},moneyColumn('revenue','Revenue'),moneyColumn('expenses','Expenses'),moneyColumn('net','Net activity')], rows };
    }
    if (id === 'balanceByFund') {
      const all = accountingReportLedgerRows('0001-01-01',period.end), groups=new Map();
      for (const row of all) { const item=groups.get(row.fund)||{name:row.fund,assets:0,liabilities:0,netAssets:0}; if(row.category==='asset')item.assets+=row.amount; else if(row.category==='liability')item.liabilities+=row.amount; else if(row.category==='net_asset')item.netAssets+=row.amount; else if(row.category==='revenue')item.netAssets+=row.amount; else if(row.category==='expense')item.netAssets-=row.amount; groups.set(row.fund,item); }
      return { title:'Balance Sheet by Fund', subtitle:`As of ${period.end}`, columns:[{key:'name',label:'Fund'},moneyColumn('assets','Assets'),moneyColumn('liabilities','Liabilities'),moneyColumn('netAssets','Net assets')], rows:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)) };
    }
    if (id === 'incomeByMonth') {
      const groups=new Map();
      for(const row of current.filter((item)=>['revenue','expense'].includes(item.category))){const key=row.date.slice(0,7),item=groups.get(key)||{month:key,revenue:0,expenses:0};item[row.category==='revenue'?'revenue':'expenses']+=row.amount;groups.set(key,item);}
      return { title:'Income Statement by Month', subtitle:`${period.start} through ${period.end}`, columns:[{key:'month',label:'Month'},moneyColumn('revenue','Revenue'),moneyColumn('expenses','Expenses'),moneyColumn('net','Net activity')], rows:[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)).map((row)=>({...row,net:row.revenue-row.expenses})) };
    }
    const accountComparison = (leftStart,leftEnd,rightStart,rightEnd,title,leftLabel,rightLabel) => {
      const groups=new Map(), add=(rows,key)=>rows.filter((item)=>['revenue','expense'].includes(item.category)).forEach((row)=>{const id=row.account.id||row.accountNumber,item=groups.get(id)||{account:`${row.account.accountNumber||row.accountNumber||''} · ${row.account.name||row.accountName||''}`,category:row.category,left:0,right:0};item[key]+=row.amount;groups.set(id,item);});
      add(accountingReportLedgerRows(leftStart,leftEnd),'left'); add(accountingReportLedgerRows(rightStart,rightEnd),'right');
      return { title, subtitle:`${leftLabel} compared with ${rightLabel}`, columns:[{key:'account',label:'Account'},{key:'category',label:'Category'},moneyColumn('left',leftLabel),moneyColumn('right',rightLabel),moneyColumn('change','Change')], rows:[...groups.values()].sort((a,b)=>a.account.localeCompare(b.account)).map((row)=>({...row,change:row.left-row.right})) };
    };
    if(id==='comparativePeriods'){const end=new Date(`${period.end}T00:00:00Z`),leftStart=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),1)),priorEnd=new Date(leftStart);priorEnd.setUTCDate(0);const priorStart=new Date(Date.UTC(priorEnd.getUTCFullYear(),priorEnd.getUTCMonth(),1));return accountComparison(leftStart.toISOString().slice(0,10),period.end,priorStart.toISOString().slice(0,10),priorEnd.toISOString().slice(0,10),'Comparative Income Statement Periods','Current month','Prior month');}
    if(id==='comparativeIncome'){const priorStart=String(Number(period.start.slice(0,4))-1)+period.start.slice(4),priorEnd=String(Number(period.end.slice(0,4))-1)+period.end.slice(4);return accountComparison(period.start,period.end,priorStart,priorEnd,'Comparative Income Statement','Current year','Prior year');}
    return null;
  }
  function renderAccountingReportLibrary(pane) {
    const groups=[...new Set(ACCOUNTING_REPORT_LIBRARY.map((report)=>report.group))];
    pane.innerHTML=`<section class="acct-report-library-head"><div><span class="acct-kicker">Financial reporting</span><h2>Reports</h2><p>Create clear parish financial statements, fund views, comparisons, and budget reports.</p></div><label>Search reports<input type="search" placeholder="Search by report name" oninput="filterAccountingReportLibrary(this.value)"></label></section><div class="acct-report-quick"><span>Quick access</span><button onclick="openAccountingReport('position')">Balance Sheet</button><button onclick="openAccountingReport('activities')">Income Statement</button><button onclick="openAccountingReport('expenses')">Expense Report</button><button onclick="openAccountingReport('budgetActual')">Budget to Actual</button></div><div class="acct-report-library">${groups.map((group)=>`<section><div class="acct-report-library-section"><div><strong>${escapeHtml(group)}</strong><small>${ACCOUNTING_REPORT_LIBRARY.filter((report)=>report.group===group).length} reports</small></div><span>⌄</span></div><div class="acct-report-library-grid">${ACCOUNTING_REPORT_LIBRARY.filter((report)=>report.group===group).map((report)=>`<button class="acct-report-library-card" data-report-search="${escapeAttr(`${report.title} ${report.copy} ${group}`.toLowerCase())}" onclick="openAccountingReport('${report.id}')"><i>☆</i><span><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.copy)}</small></span>${report.parishOnly&&accountingData.tier!=='advanced_operations'?'<b>Parish</b>':'<b>Open →</b>'}</button>`).join('')}</div></section>`).join('')}</div>`;
  }
  function filterAccountingReportLibrary(query) { const value=String(query||'').trim().toLowerCase(); document.querySelectorAll('[data-report-search]').forEach((card)=>card.hidden=value&&!card.dataset.reportSearch.includes(value)); }
  async function openAccountingReport(id) {
    const definition=ACCOUNTING_REPORT_LIBRARY.find((report)=>report.id===id); if(!definition)return;
    if(definition.parishOnly&&accountingData.tier!=='advanced_operations'){alert('This budgeting report is available with Parish Accounting.');return;}
    accountingReportView=id; accountingCustomReport=null;
    if(['activities','position','trialBalance','expenses'].includes(id)){renderAccountingPane();return;}
    if(['cashFlows','functionalExpenses','netAssetRollforward'].includes(id)){await loadAccountingDepthReport(id);return;}
    if(['budgetActual','comparativeBudget','budgetByFund'].includes(id)){await loadAccountingBudgetLibraryReport(id);return;}
    accountingCustomReport=accountingTabularReport(id); renderAccountingPane();
  }
  async function loadAccountingDepthReport(id) {
    const pane=document.getElementById('accountingPane'); if(pane)pane.innerHTML='<p class="sw-tool-loading">Preparing accountant report…</p>';
    const period=accountingReportPeriod(),priorStart=String(Number(period.start.slice(0,4))-1)+period.start.slice(4),priorEnd=String(Number(period.end.slice(0,4))-1)+period.end.slice(4);
    const paths={cashFlows:'statement-of-cash-flows',functionalExpenses:'statement-of-functional-expenses',netAssetRollforward:'net-asset-rollforward'},supportsComparison=id!=='netAssetRollforward';
    const compare=supportsComparison&&accountingDepthComparative,query=new URLSearchParams({from:period.start,to:period.end});
    if(compare){query.set('priorFrom',priorStart);query.set('priorTo',priorEnd);}
    try{
      const response=await fetch(accountingApi(`/reports/${paths[id]}?${query}`),{headers:authHeaders()}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||payload.error||'Unable to prepare this report.');
      const report=payload.report,current=report.current||report,prior=report.comparative||null,moneyColumn=(key,label)=>({key,label,money:true});
      if(id==='cashFlows'){const priorByLabel=new Map((prior?.rows||[]).map(row=>[row.label,row]));accountingCustomReport={title:'Statement of Cash Flows',subtitle:`${period.start} through ${period.end} · indirect method${current.validation?.status==='warning'?' · reconciliation warning':''}`,columns:[{key:'section',label:'Section'},{key:'label',label:'Cash-flow line'},moneyColumn('amount','Current period'),...(prior?[moneyColumn('priorAmount','Prior period')]:[])],rows:(current.rows||[]).map(row=>({...row,priorAmount:priorByLabel.get(row.label)?.amount||0})),serverPath:paths[id],comparativeSupported:true,disclaimer:current.validation?.status==='warning'?'Computed cash movement does not reconcile to cash-account movement. Review account classifications.':''};}
      else if(id==='functionalExpenses'){const priorById=new Map((prior?.rows||[]).map(row=>[row.accountId,row]));accountingCustomReport={title:'Statement of Functional Expenses',subtitle:`${period.start} through ${period.end}`,columns:[{key:'naturalCategory',label:'Natural category'},moneyColumn('program','Program'),moneyColumn('managementAndGeneral','Management & general'),moneyColumn('fundraising','Fundraising'),moneyColumn('total','Total'),...(prior?[moneyColumn('priorTotal','Prior total')]:[])],rows:(current.rows||[]).map(row=>({...row,priorTotal:priorById.get(row.accountId)?.total||0})),serverPath:paths[id],comparativeSupported:true,disclaimer:current.simplification};}
      else accountingCustomReport={title:'Net Asset Rollforward by Restriction Class',subtitle:`${period.start} through ${period.end}`,columns:[{key:'restrictionType',label:'Restriction class'},moneyColumn('beginningBalance','Beginning'),moneyColumn('additions','Additions'),moneyColumn('reductions','Reductions'),moneyColumn('endingBalance','Ending')],rows:(current.rows||[]).map(row=>({...row,restrictionType:restrictionLabel(row.restrictionType)})),serverPath:paths[id],comparativeSupported:false,disclaimer:'Restriction releases are not separately identifiable because ordinary fund-transfer journals carry no release classification.'};
      renderAccountingPane();
    }catch(error){accountingCustomReport={error:error.message||'Unable to prepare this report.'};renderAccountingPane();}
  }
  function toggleAccountingDepthComparative(){accountingDepthComparative=!accountingDepthComparative;loadAccountingDepthReport(accountingReportView);}
  async function loadAccountingBudgetLibraryReport(id) {
    const pane=document.getElementById('accountingPane'); if(pane)pane.innerHTML='<p class="sw-tool-loading">Creating budget report…</p>';
    try{
      const listResponse=await fetch(accountingApi('/budgets'),{headers:authHeaders()}),list=await listResponse.json().catch(()=>({}));
      if(!listResponse.ok)throw new Error(list.message||'Budgets are unavailable.');
      const budgets=(list.budgets||list.items||[]).filter((budget)=>budget.status!=='voided');
      if(!budgets.length)throw new Error('Create a budget before running this report.');
      const selected=budgets.slice(0,id==='comparativeBudget'?2:1),reports=[];
      for(const budget of selected){const response=await fetch(accountingApi(`/budgets/${encodeURIComponent(budget.id)}/variance?throughMonth=${new Date().getUTCMonth()+1}`),{headers:authHeaders()}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||'The budget report is unavailable.');reports.push(payload.report);}
      const moneyColumn=(key,label)=>({key,label,money:true});
      if(id==='budgetByFund'){const groups=new Map();for(const row of reports[0].rows||[]){const fund=accountingData.funds.find((item)=>item.id===row.fundId),name=fund?.name||'Unassigned',item=groups.get(name)||{name,budget:0,actual:0,variance:0};item.budget+=Number(row.budget||0);item.actual+=Number(row.actual||0);item.variance+=Number(row.variance||0);groups.set(name,item);}accountingCustomReport={title:'Budget by Fund',subtitle:reports[0].budget?.name||'',columns:[{key:'name',label:'Fund'},moneyColumn('budget','Budget'),moneyColumn('actual','Actual'),moneyColumn('variance','Variance')],rows:[...groups.values()]};}
      else if(id==='comparativeBudget'){const prior=new Map((reports[1]?.rows||[]).map((row)=>[row.accountId,row]));accountingCustomReport={title:'Comparative Budget to Actual',subtitle:`${reports[0].budget?.name||'Current budget'}${reports[1]?` compared with ${reports[1].budget?.name}`:''}`,columns:[{key:'account',label:'Account'},moneyColumn('budget','Current budget'),moneyColumn('actual','Current actual'),moneyColumn('priorBudget','Prior budget'),moneyColumn('variance','Variance')],rows:(reports[0].rows||[]).map((row)=>({account:`${row.accountNumber} · ${row.account}`,budget:row.budget,actual:row.actual,priorBudget:prior.get(row.accountId)?.budget||0,variance:row.variance}))};}
      else accountingCustomReport={title:'Budget to Actual',subtitle:reports[0].budget?.name||'',columns:[{key:'account',label:'Account'},moneyColumn('budget','Budget'),moneyColumn('actual','Actual'),moneyColumn('variance','Variance'),{key:'assessment',label:'Assessment'}],rows:(reports[0].rows||[]).map((row)=>({account:`${row.accountNumber} · ${row.account}`,budget:row.budget,actual:row.actual,variance:row.variance,assessment:row.varianceLabel}))};
      renderAccountingPane();
    }catch(error){accountingCustomReport={error:error.message||'Unable to create this report.'};renderAccountingPane();}
  }
  function renderAccountingReports(pane) {
    if(accountingReportView==='library'){renderAccountingReportLibrary(pane);return;}
    if(accountingCustomReport){if(accountingCustomReport.error){pane.innerHTML=`<div class="acct-list-head"><button class="acct-refresh" onclick="setAccountingReportView('library')">← All reports</button></div>${accountingEmpty('Report unavailable',accountingCustomReport.error)}`;return;}const report=accountingCustomReport;pane.innerHTML=`<div class="acct-report-head"><div><button class="acct-link" onclick="setAccountingReportView('library')">← All reports</button><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.subtitle||'')}</p></div><div class="acct-report-actions">${report.comparativeSupported?`<button class="acct-refresh" onclick="toggleAccountingDepthComparative()">${accountingDepthComparative?'Hide':'Show'} prior period</button>`:''}<button class="acct-refresh" onclick="printAccountingReport()">Print</button><button class="acct-refresh" onclick="downloadAccountingReport()">Export CSV</button></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr>${report.columns.map((column)=>`<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${report.rows.map((row)=>`<tr>${report.columns.map((column)=>`<td>${column.money?accountingMoney(row[column.key]):escapeHtml(row[column.key]??'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${report.columns.length}">No posted activity for this report.</td></tr>`}</tbody></table></div>${report.disclaimer?`<p class="acct-report-disclaimer">${escapeHtml(report.disclaimer)}</p>`:''}`;return;}
    const report=accountingData.reports[accountingReportView==='expenses'?'activities':accountingReportView];
    if(!report){pane.innerHTML=accountingEmpty('No report available yet','Initialize Accounting, then refresh to prepare financial statements.');return;}
    const reportTabs=[['library','All reports'],['trialBalance','Trial Balance'],['activities','Income Statement'],['expenses','Expenses'],['position','Balance Sheet']];
    if(accountingReportView==='expenses'){renderAccountingExpenses(pane,report,reportTabs);return;}
    const rows=report.rows||[],amount=(row)=>row.amount??(Number(row.endingDebit||0)-Number(row.endingCredit||0));
    pane.innerHTML=`<div class="acct-report-head"><div class="acct-view-switch">${reportTabs.map(([id,label])=>`<button type="button" class="${accountingReportView===id?'active':''}" onclick="setAccountingReportView('${id}')">${label}</button>`).join('')}</div><div class="acct-report-actions"><button type="button" class="acct-refresh" onclick="printAccountingReport()">Print</button><button type="button" class="acct-refresh" onclick="downloadAccountingReport()">Export CSV</button></div></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account</th><th>Category</th><th>Amount</th></tr></thead><tbody>${rows.map((row)=>`<tr><td><strong>${escapeHtml(row.accountNumber||'')}</strong> ${escapeHtml(row.accountName||row.name||'')}</td><td>${escapeHtml(row.category||row.accountType||'')}</td><td>${accountingMoney(amount(row))}</td></tr>`).join('')||'<tr><td colspan="3">No posted activity in this period.</td></tr>'}</tbody></table></div>`;
  }
  function setAccountingReportView(view) { accountingReportView=view; accountingCustomReport=null; renderAccountingPane(); }
  function renderAccountingExpenses(pane, report, reportTabs) {
    const grouped = new Map();
    for (const row of (report.rows || []).filter((item) => item.category === 'expense' && Number(item.amount) !== 0)) {
      const key = row.accountId || row.accountNumber || row.accountName;
      const current = grouped.get(key) || { ...row, amount:0 };
      current.amount += Number(row.amount || 0); grouped.set(key,current);
    }
    const expenses = [...grouped.values()].filter((row)=>row.amount>0).sort((a,b)=>b.amount-a.amount);
    const total = expenses.reduce((sum,row)=>sum+row.amount,0);
    const palette = ['#c8a24a','#315f71','#7d5d91','#4f7c59','#ba6d46','#587fa5','#9a7b3f','#6b7280'];
    let cursor = 0;
    const stops = expenses.map((row,index)=>{const start=cursor;cursor+=total?row.amount/total*100:0;return `${palette[index%palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;});
    const agapay = expenses.find((row)=>row.accountId==='acct_5850'||/agapay platform fees/i.test(row.accountName||''));
    const subscriptionMonthlyCents = currentParish?.subscriptionMonthlyCents;
    const hasPublishedSubscriptionPrice = subscriptionMonthlyCents !== null && subscriptionMonthlyCents !== undefined && Number.isFinite(Number(subscriptionMonthlyCents));
    const subscriptionPrice = hasPublishedSubscriptionPrice ? accountingMoney(Number(subscriptionMonthlyCents)) : 'Custom';
    const subscriptionTier = currentParish?.subscriptionTierLabel || currentParish?.subscriptionTier || 'Current';
    const postedAgapayExpense = Number(agapay?.amount || 0);
    pane.innerHTML = `<div class="acct-report-head"><div class="acct-view-switch">${reportTabs.map(([id,label])=>`<button type="button" class="${accountingReportView===id?'active':''}" onclick="setAccountingReportView('${id}')">${label}</button>`).join('')}</div><div class="acct-report-actions"><button type="button" class="acct-refresh" onclick="printAccountingReport()">Print</button><button type="button" class="acct-refresh" onclick="downloadAccountingReport()">Export CSV</button></div></div>
      <section class="acct-expense-hero"><div><span class="acct-kicker">Statement of activities · expenses</span><h2>What is costing the parish?</h2><p>Posted expenses for ${accountingDate(report.startDate)} through ${accountingDate(report.endDate)}. The current AGAPAY subscription rate is shown separately from posted ledger expenses.</p></div><div class="acct-expense-total"><span>Total expenses</span><strong>${accountingMoney(total)}</strong><small>${expenses.length} active expense categor${expenses.length===1?'y':'ies'}</small></div></section>
      <div class="acct-expense-layout"><section class="acct-expense-chart-card"><div class="acct-expense-pie" style="background:${stops.length?`conic-gradient(${stops.join(',')})`:'rgba(6,21,34,.08)'}"><div><strong>${accountingMoney(total)}</strong><span>total</span></div></div><div class="acct-expense-legend">${expenses.map((row,index)=>`<div><i style="background:${palette[index%palette.length]}"></i><span><strong>${escapeHtml(row.accountName||row.name)}</strong><small>${total?Math.round(row.amount/total*100):0}% of expenses</small></span><b>${accountingMoney(row.amount)}</b></div>`).join('')||'<p>No posted expenses for this period.</p>'}</div></section>
      <aside class="acct-expense-insights"><article class="acct-card"><span class="acct-kicker">Largest cost</span><h2>${escapeHtml(expenses[0]?.accountName||'No expenses yet')}</h2><strong>${accountingMoney(expenses[0]?.amount||0)}</strong><p>${total&&expenses[0]?`${Math.round(expenses[0].amount/total*100)}% of posted expenses for this period.`:'Expense entries will appear automatically after posting.'}</p></article><article class="acct-card agapay-fee"><span class="acct-kicker">Current plan</span><h2>AGAPAY Subscription</h2><strong>${subscriptionPrice}${hasPublishedSubscriptionPrice ? '<small>/month</small>' : ''}</strong><p>${escapeHtml(subscriptionTier)} tier. ${postedAgapayExpense > 0 ? `${accountingMoney(postedAgapayExpense)} is posted to the ledger for this period.` : 'No subscription payment has been posted to the ledger for this period.'}</p></article></aside></div>`;
  }
  async function loadAccountingFunds() {
    const pane = document.getElementById('accountingPane');
    try {
      const response = await fetch(accountingApi('/funds'), { headers: authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to load funds.');
      accountingFundCatalog = payload.funds || [];
      accountingData.funds = accountingFundCatalog.filter((fund) => Number(fund.isActive));
      renderAccountingPane();
    } catch (error) {
      if (pane) pane.innerHTML = accountingEmpty('Funds need attention', error.message);
    }
  }
  function restrictionLabel(value) {
    return ({ unrestricted:'Unrestricted', board_designated:'Board designated', donor_restricted_temporary:'Donor restricted · temporary', donor_restricted_permanent:'Donor restricted · permanent' })[value] || value;
  }
  function toggleAccountingFundAccountSection(category) {
    accountingFundAccountSections.has(category) ? accountingFundAccountSections.delete(category) : accountingFundAccountSections.add(category);
    renderAccountingPane();
  }
  function renderAccountingFunds(pane) {
    if (!accountingFundCatalog) { pane.innerHTML = '<p class="sw-tool-loading">Loading funds...</p>'; return; }
    const isCurrentFund = (fund) => Number(fund.isActive)
      && !fund.archivedAt
      && !['archived','inactive','retired','unused'].includes(String(fund.status || '').trim().toLowerCase());
    const active = accountingFundCatalog.filter(isCurrentFund);
    const inactive = accountingFundCatalog.filter((fund) => !isCurrentFund(fund));
    const directoryFunds = accountingShowInactiveFunds ? accountingFundCatalog : active;
    const accountCatalog = accountingData.accountCatalog?.length ? accountingData.accountCatalog : accountingData.accounts;
    const fundActivity = accountingData.reports.fundActivity?.rows || [];
    const balanceFor = (fund) => Number(fundActivity.find((row) => row.fundId === fund.id || row.code === fund.code)?.endingBalance || 0);
    const fundBalances = active.map((fund) => ({ fund, balance: balanceFor(fund) }));
    const largestFundBalance = Math.max(1, ...fundBalances.map((item) => Math.abs(item.balance)));
    const unrestricted = fundBalances.filter(({fund}) => !String(fund.restrictionType).startsWith('donor_restricted'));
    const restricted = fundBalances.filter(({fund}) => String(fund.restrictionType).startsWith('donor_restricted'));
    const categories = [['asset','Assets'],['liability','Liabilities'],['net_asset','Equity / Fund Balances'],['revenue','Income'],['expense','Expenses']];
    const accountLifecycle = (account) => {
      const action = Number(account.isActive) ? 'archive' : 'unarchive', confirming = accountingAccountLifecycleConfirm?.id === account.id && accountingAccountLifecycleConfirm.action === action;
      const message = accountingLifecycleMessage?.type === 'account' && accountingLifecycleMessage.id === account.id ? `<span class="acct-lifecycle-message">${escapeHtml(accountingLifecycleMessage.text)}</span>` : '';
      return `<div class="acct-lifecycle-actions">${confirming ? `<span>${action === 'archive' ? 'Archive this account?' : 'Restore this account?'}</span><button type="button" onclick="changeAccountingAccountLifecycle('${escapeAttr(account.id)}','${action}',${account.version})">Confirm</button><button type="button" onclick="cancelAccountingLifecycle()">Cancel</button>` : `<button type="button" onclick="beginAccountingAccountLifecycle('${escapeAttr(account.id)}','${action}')">${action === 'archive' ? 'Archive' : 'Unarchive'}</button>`}${message}</div>`;
    };
    const standardAccountRows = (category) => accountCatalog.filter((account) => account.category === category).map((account) => `<div class="acct-account-lifecycle-row ${Number(account.isActive)?'':'retired'}"><button class="acct-fund-account-row" onclick="showAccountingAccountForm('${escapeAttr(account.id)}')"><span>${escapeHtml(account.accountNumber)}</span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.normalBalance)} normal balance · ${Number(account.isActive)?'Edit number or name':'Archived'}</small></button>${accountLifecycle(account)}</div>`).join('') || '<div class="acct-fund-account-empty">No posting accounts in this group.</div>';
    const fundBalanceRows = (items, empty) => items.length ? items.map(({fund,balance}) => `<div class="acct-fund-balance-row"><span>${escapeHtml(fund.code)}</span><strong>${escapeHtml(fund.name)} · Fund Balance</strong><small>${escapeHtml(restrictionLabel(fund.restrictionType))}</small><b class="${balance<0?'negative':''}">${accountingMoney(balance)}</b></div>`).join('') : `<div class="acct-fund-account-empty">${empty}</div>`;
    const expenseRows = (group) => {
      const rows = accountCatalog.filter((account) => account.category === 'expense' && (account.expenseGroup || 'other') === group);
      return `<div class="acct-expense-account-group"><div class="acct-expense-account-group-head"><div><strong>${group === 'administrative' ? 'Administrative Expenses' : 'Other Expenses'}</strong><small>${group === 'administrative' ? 'Salaries, clergy support, rent, and routine administration' : 'Travel, utilities, AGAPAY fees, building costs, and other operations'}</small></div><button onclick="showAccountingExpenseAccountForm('${group}')">＋ Add account</button></div>${rows.map((account)=>{const fund=active.find((item)=>item.id===account.defaultFundId),parent=accountCatalog.find((item)=>item.id===account.parentAccountId);return `<div class="acct-account-lifecycle-row ${Number(account.isActive)?'':'retired'}"><button class="acct-expense-account-row ${parent?'subaccount':''}" onclick="showAccountingExpenseAccountForm('${group}','${escapeAttr(account.id)}')"><span>${escapeHtml(account.accountNumber)}</span><strong>${escapeHtml(account.name)}</strong><small>${parent?`Sub-account of ${escapeHtml(parent.name)} · `:''}${Number(account.isActive)?escapeHtml(fund?.name || 'Choose fund when posting'):'Archived'}</small><b>${Number(account.isSystem)?'Configure':'Edit'}</b></button>${accountLifecycle(account)}</div>`}).join('') || '<div class="acct-fund-account-empty">No accounts in this expense group yet.</div>'}</div>`;
    };
    const accountForm = accountingExpenseAccountEditor ? (() => {
      const account = accountingExpenseAccountEditor.id ? accountingExpenseAccountEditor : { accountNumber:'',name:'',description:'',expenseGroup:accountingExpenseAccountEditor.expenseGroup || 'other',defaultFundId:active.find((fund)=>Number(fund.isDefault))?.id || active[0]?.id || '',cashFlowClassification:'operating' };
      const isExpense = (account.category || 'expense') === 'expense';
      const parentOptions = accountCatalog.filter((item)=>item.category==='expense'&&Number(item.isActive)&&item.id!==account.id);
      return `<form class="acct-expense-account-form" onsubmit="saveAccountingExpenseAccount(event)"><div><span class="acct-kicker">${account.id?'Edit account':'New expense account'}</span><h3>${account.id?escapeHtml(account.name):account.expenseGroup==='administrative'?'Administrative expense':'Other expense'}</h3><p>Every account has both a number and a name. The account category and normal balance remain protected.</p></div><div class="acct-form-grid"><label>Account number<input name="accountNumber" maxlength="24" required value="${escapeAttr(account.accountNumber||'')}" placeholder="5000"></label><label>Account name<input name="name" maxlength="120" required value="${escapeAttr(account.name||'')}" placeholder="Salaries"></label>${isExpense?`<label>Expense group<select name="expenseGroup"><option value="administrative" ${account.expenseGroup==='administrative'?'selected':''}>Administrative Expenses</option><option value="other" ${account.expenseGroup==='other'?'selected':''}>Other Expenses</option></select></label><label>Default fund<select name="defaultFundId" required>${active.map((fund)=>`<option value="${escapeAttr(fund.id)}" ${account.defaultFundId===fund.id?'selected':''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('')}</select><small>Selected automatically when this account is used in a new journal entry.</small></label><label>Parent account<select name="parentAccountId"><option value="">No parent account</option>${parentOptions.map((parent)=>`<option value="${escapeAttr(parent.id)}" ${account.parentAccountId===parent.id?'selected':''}>${escapeHtml(parent.accountNumber)} · ${escapeHtml(parent.name)}</option>`).join('')}</select><small>Optional: organize this as a sub-account.</small></label>`:`<input type="hidden" name="parentAccountId" value="${escapeAttr(account.parentAccountId||'')}"><label>Category<input value="${escapeAttr(String(account.category||'').replaceAll('_',' '))}" readonly></label><label>Normal balance<input value="${escapeAttr(account.normalBalance||'')}" readonly></label>`}<label>Cash-flow classification<select name="cashFlowClassification" required><option value="operating" ${(account.cashFlowClassification||'operating')==='operating'?'selected':''}>Operating</option><option value="investing" ${account.cashFlowClassification==='investing'?'selected':''}>Investing</option><option value="financing" ${account.cashFlowClassification==='financing'?'selected':''}>Financing</option></select><small>Controls where balance changes appear on the cash-flow statement.</small></label></div><label>Description<input name="description" value="${escapeAttr(account.description||'')}" placeholder="What should be posted to this account?"></label><div class="acct-phase-form-foot"><button class="acct-primary">${account.id?'Save account':'Add account'}</button><button type="button" class="acct-refresh" onclick="accountingExpenseAccountEditor=null;renderAccountingPane()">Cancel</button><span class="acct-form-status"></span></div></form>`;
    })() : '';
    pane.innerHTML = `<section class="acct-fund-workspace"><div class="acct-fund-summary"><div class="acct-list-head"><div><span class="acct-kicker">Funds &amp; accounts</span><h2>Fund balances at a glance</h2><p>See each current fund's posted balance, then expand the account groups below to review the structure behind it.</p></div><button class="acct-refresh" onclick="setAccountingView('reports')">Open fund report</button></div>
        <div class="acct-fund-bars">${fundBalances.map(({fund,balance})=>`<div class="acct-fund-bar-row"><div class="acct-fund-bar-label"><strong>${escapeHtml(fund.name)}</strong><span>${escapeHtml(fund.code)}</span></div><div class="acct-fund-bar-track"><i class="${String(fund.restrictionType).startsWith('donor_restricted')?'restricted':''} ${balance<0?'negative':''}" style="width:${Math.max(balance===0?0:3,Math.round(Math.abs(balance)/largestFundBalance*100))}%"></i></div><strong class="${balance<0?'negative':''}">${accountingMoney(balance)}</strong></div>`).join('') || '<div class="acct-empty"><strong>No active funds</strong><span>Add a fund to begin tracking balances.</span></div>'}</div>
      </div><div class="acct-fund-accounts"><div class="acct-fund-accounts-head"><div><span class="acct-kicker">Chart of accounts</span><h2>Accounts</h2><p>Expand a group to review posting accounts and the fund-balance structure.</p></div><div><span>${accountingData.accounts.length} active · ${accountCatalog.length-accountingData.accounts.length} archived</span><strong>${active.length} fund balances</strong></div></div>
        <div class="acct-fund-account-groups">${categories.map(([category,label])=>{const expanded=accountingFundAccountSections.has(category), editorHere=accountingExpenseAccountEditor&&(accountingExpenseAccountEditor.category||'expense')===category, categoryAccounts=accountCatalog.filter(account=>account.category===category);return `<section class="acct-fund-account-group ${expanded?'expanded':''}"><button class="acct-fund-account-group-head" onclick="toggleAccountingFundAccountSection('${category}')" aria-expanded="${expanded}"><span>${escapeHtml(label)}</span><small>${category==='net_asset'?`${active.length} automatic fund balance${active.length===1?'':'s'}`:`${categoryAccounts.length} account${categoryAccounts.length===1?'':'s'}`}</small><b>${expanded?'−':'＋'}</b></button>${expanded?`<div class="acct-fund-account-group-body">${editorHere?accountForm:''}${category==='net_asset'?`${standardAccountRows(category)}<div class="acct-fund-net-assets"><div class="acct-fund-net-group"><h3><span>Unrestricted net assets</span><small>General and board-designated funds</small></h3>${fundBalanceRows(unrestricted,'No unrestricted funds.')}</div><div class="acct-fund-net-group restricted"><h3><span>Restricted net assets</span><small>Donor-restricted purposes</small></h3>${fundBalanceRows(restricted,'No restricted funds.')}</div></div>`:category==='expense'?`${expenseRows('administrative')}${expenseRows('other')}`:standardAccountRows(category)}</div>`:''}</section>`}).join('')}</div>
      </div></section>
      <section class="acct-funds-directory"><div class="acct-list-head"><div><span class="acct-kicker">Fund directory</span><h2>Funds</h2><p>Funds &amp; Alms is the source of truth. Current funds stay front and center; archived, inactive, retired, and unused funds remain available whenever you need their history.</p></div><button class="acct-primary" onclick="switchTab('options')">Manage in Funds &amp; Alms</button></div>
      <div class="acct-fund-tools"><label>Find a fund<input type="search" placeholder="Search by name, number, or purpose" oninput="filterAccountingFunds(this.value)"></label><div class="acct-fund-directory-actions"><span>${active.length} current${inactive.length?` · ${inactive.length} archived or unused`:''}</span>${inactive.length?`<button type="button" class="acct-fund-visibility-toggle ${accountingShowInactiveFunds?'active':''}" aria-pressed="${accountingShowInactiveFunds}" onclick="toggleAccountingInactiveFunds()"><b>${accountingShowInactiveFunds?'✓':'⌁'}</b><span><strong>${accountingShowInactiveFunds?'Hide archived &amp; unused':'Show archived &amp; unused'}</strong><small>${inactive.length} fund${inactive.length===1?'':'s'}</small></span></button>`:''}</div></div>
      <div class="acct-funds-directory-grid">${directoryFunds.map((fund)=>`<div class="acct-fund-directory-card ${isCurrentFund(fund)?'':'retired'}" data-fund-search="${escapeAttr(`${fund.code} ${fund.name} ${fund.purpose||''} ${fund.description||''}`.toLowerCase())}"><span>${escapeHtml(fund.code)}</span><strong>${escapeHtml(fund.name)}</strong><small>${escapeHtml(restrictionLabel(fund.restrictionType))}${Number(fund.isDefault)?' · Default':''}${isCurrentFund(fund)?'':' · Archived / unused'}</small></div>`).join('') || accountingEmpty(accountingShowInactiveFunds?'No funds':'No current funds',inactive.length?'Use “Show archived & unused” to review historical funds.':'Add the first fund in Funds & Alms.')}</div></section>`;
  }
  function toggleAccountingInactiveFunds() {
    accountingShowInactiveFunds = !accountingShowInactiveFunds;
    renderAccountingPane();
  }
  function filterAccountingFunds(query) {
    const needle = String(query || '').trim().toLowerCase();
    document.querySelectorAll('[data-fund-search]').forEach((row) => { row.hidden = needle && !row.dataset.fundSearch.includes(needle); });
  }
  function showAccountingExpenseAccountForm(group = 'other', id = '') {
    const existing = id ? (accountingData.accountCatalog || accountingData.accounts).find((account) => account.id === id) : null;
    accountingExpenseAccountEditor = existing ? { ...existing, expenseGroup:existing.expenseGroup || group } : { expenseGroup:group };
    accountingFundAccountSections.add('expense');
    renderAccountingPane();
  }
  function showAccountingAccountForm(id) {
    const existing = (accountingData.accountCatalog || accountingData.accounts).find((account) => account.id === id);
    if (!existing) return;
    accountingExpenseAccountEditor = { ...existing };
    accountingFundAccountSections.add(existing.category);
    renderAccountingPane();
  }
  async function saveAccountingExpenseAccount(event) {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('.acct-form-status');
    status.textContent = 'Saving…';
    const body = Object.fromEntries(new FormData(form));
    const editing = Boolean(accountingExpenseAccountEditor?.id);
    if (editing) body.expectedVersion = accountingExpenseAccountEditor.version;
    const response = await fetch(accountingApi(editing ? `/accounts/${encodeURIComponent(accountingExpenseAccountEditor.id)}` : '/accounts'), { method:editing?'PATCH':'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { status.textContent = payload.message || payload.error || 'Unable to save account.'; return; }
    const reference = await fetch(accountingApi('/workspace-reference'), { headers:authHeaders() });
    const data = await reference.json().catch(() => ({}));
    if (!reference.ok) { status.textContent = data.message || 'Account saved, but the list could not refresh.'; return; }
    accountingData.accounts = data.accounts || accountingData.accounts;
    accountingData.accountCatalog = data.accountCatalog || data.accounts || accountingData.accountCatalog;
    accountingExpenseAccountEditor = null;
    renderAccountingPane();
  }
  function beginAccountingAccountLifecycle(id, action) {
    accountingAccountLifecycleConfirm = { id, action };
    accountingLifecycleMessage = null;
    renderAccountingPane();
  }
  function cancelAccountingLifecycle() {
    accountingAccountLifecycleConfirm = null;
    accountingVendorLifecycleConfirm = null;
    accountingLifecycleMessage = null;
    renderAccountingPane();
  }
  async function changeAccountingAccountLifecycle(id, action, expectedVersion) {
    const response = await fetch(accountingApi(`/accounts/${encodeURIComponent(id)}/${action}`), { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ expectedVersion }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      accountingAccountLifecycleConfirm = null;
      accountingLifecycleMessage = { type:'account', id, text:payload.message || payload.error || 'Unable to update this account.' };
      renderAccountingPane();
      return;
    }
    const reference = await fetch(accountingApi('/workspace-reference'), { headers:authHeaders() });
    const data = await reference.json().catch(() => ({}));
    if (!reference.ok) {
      accountingLifecycleMessage = { type:'account', id, text:data.message || data.error || 'Account updated, but the list could not refresh.' };
      renderAccountingPane();
      return;
    }
    accountingData.accounts = data.accounts || [];
    accountingData.accountCatalog = data.accountCatalog || data.accounts || [];
    accountingExpenseAccountEditor = null;
    accountingAccountLifecycleConfirm = null;
    accountingLifecycleMessage = null;
    renderAccountingPane();
  }
  async function loadAccountingTab(force = false) {
    const pane = document.getElementById('accountingPane');
    if (!pane || !currentParish?.parishId) return;
    if (accountingPreviewOnly()) { renderAccountingPaywall(pane); return; }
    pane.closest('.acct-suite-shell')?.classList.remove('acct-suite-shell--tier-paywall');
    if (!force && pane.dataset.loaded === 'true') return;
    pane.innerHTML = '<p class="sw-tool-loading">Loading Accounting...</p>';
    try {
      const [setupRes, referenceRes, journalRes, ledgerRes, trialRes, activitiesRes, positionRes, fundActivityRes, recurringRes, ledgerStatusRes, bankAccountsRes] = await Promise.all([
        fetch(accountingApi('/setup'), { headers: authHeaders() }),
        fetch(accountingApi('/workspace-reference'), { headers: authHeaders() }),
        fetch(accountingApi('/journals?limit=50'), { headers: authHeaders() }),
        fetch(accountingApi('/general-ledger'), { headers: authHeaders() }),
        fetch(accountingApi('/reports/trial-balance'), { headers: authHeaders() }),
        fetch(accountingApi('/reports/statement-of-activities'), { headers: authHeaders() }),
        fetch(accountingApi('/reports/statement-of-financial-position'), { headers: authHeaders() }),
        fetch(accountingApi('/reports/fund-activity'), { headers: authHeaders() }),
        fetch(accountingApi('/recurring-transactions'), { headers: authHeaders() }),
        fetch(accountingApi('/ledger/status'), { headers: authHeaders() }),
        fetch(accountingApi('/bank/accounts'), { headers: authHeaders() })
      ]);
      const setup = await setupRes.json().catch(() => ({}));
      const reference = await referenceRes.json().catch(() => ({}));
      const journals = await journalRes.json().catch(() => ({}));
      const ledger = await ledgerRes.json().catch(() => ({}));
      const trial = await trialRes.json().catch(() => ({}));
      const activities = await activitiesRes.json().catch(() => ({}));
      const position = await positionRes.json().catch(() => ({}));
      const fundActivity = await fundActivityRes.json().catch(() => ({}));
      const recurring = await recurringRes.json().catch(() => ({}));
      const ledgerStatus = await ledgerStatusRes.json().catch(() => ({}));
      const bankAccounts = await bankAccountsRes.json().catch(() => ({}));
      if (setupRes.status === 401) { await renderAccountingAccess(); return; }
      if (!setupRes.ok) throw new Error(setup.message || setup.error || 'Accounting setup is unavailable.');
      if (!referenceRes.ok) throw new Error(reference.message || reference.error || 'The chart of accounts is unavailable.');
      if (!journalRes.ok) throw new Error(journals.message || journals.error || 'Accounting is unavailable.');
      if (!ledgerRes.ok) throw new Error(ledger.message || ledger.error || 'The general ledger is unavailable.');
      if (!fundActivityRes.ok) throw new Error(fundActivity.message || fundActivity.error || 'Fund balances are unavailable.');
      if (!recurringRes.ok) throw new Error(recurring.message || recurring.error || 'Recurring transactions are unavailable.');
      if (!ledgerStatusRes.ok) throw new Error(ledgerStatus.message || ledgerStatus.error || 'Ledger initialization status is unavailable.');
      if (setup.overview) setup.overview.initialization = ledgerStatus.status || setup.overview.initialization;
      accountingData = { setup: setup.overview, accounts: reference.accounts || [], accountCatalog: reference.accountCatalog || reference.accounts || [], funds: reference.funds || [], bankAccounts: bankAccountsRes.ok ? bankAccounts.accounts || [] : [], journals: journals.entries || [], ledger: ledger.rows || [], recurring: recurring.items || [], reports: { trialBalance: trial.report, activities: activities.report, position: position.report, fundActivity: fundActivity.report }, payables: accountingData.payables, budgets: accountingData.budgets, banking: accountingData.banking, integrations: accountingData.integrations, close: accountingData.close, adjustments: accountingData.adjustments, governance: accountingData.governance, tier: setup.tier || journals.tier || '' };
      document.getElementById('accountingTierLabel').textContent = accountingData.tier === 'advanced_operations' ? 'Parish Accounting' : 'Mission Accounting';
      document.getElementById('accountingTierCopy').textContent = accountingData.tier === 'advanced_operations' ? 'Advanced operations enabled' : 'Essential ledger and reports';
      document.getElementById('accountingParishName').textContent = currentParish.name || currentParish.parishName || 'Your parish';
      const fiscal = setup.overview?.currentFiscalYear; document.getElementById('accountingFiscalYear').textContent = fiscal?.name ? `FY ${fiscal.name}` : 'Current fiscal year';
      pane.dataset.loaded = 'true';
      renderAccountingPane();
    } catch (error) {
      pane.innerHTML = `<div class="acct-empty error"><strong>Accounting needs attention</strong><span>${escapeHtml(error.message || 'Unable to load Accounting.')}</span><button type="button" onclick="loadAccountingTab(true)">Try again</button></div>`;
    }
  }
  async function loadAccountingPhaseD() {
    if (accountingData.tier !== 'advanced_operations') { renderAccountingPane(); return; }
    const pane = document.getElementById('accountingPane');
    if (pane) pane.innerHTML = '<p class="sw-tool-loading">Loading Parish Accounting...</p>';
    try {
      const year = new Date().getUTCFullYear();
      const [overviewRes, vendorsRes, billsRes, recurringBillsRes, agingRes, budgetsRes, paymentsRes, runsRes, tax1099Res, banksRes] = await Promise.all(['/payables/overview','/payables/vendors','/payables/bills','/payables/recurring-bills','/payables/aging','/budgets','/payables/payments','/payables/payment-runs',`/payables/1099-summary?year=${year}`,'/bank/accounts'].map((path) => fetch(accountingApi(path), { headers: authHeaders() })));
      const [overview, vendors, bills, recurringBills, aging, budgets, payments, runs, tax1099, banks] = await Promise.all([overviewRes,vendorsRes,billsRes,recurringBillsRes,agingRes,budgetsRes,paymentsRes,runsRes,tax1099Res,banksRes].map((res) => res.json().catch(() => ({}))));
      const failure = [[overviewRes,overview],[vendorsRes,vendors],[billsRes,bills],[recurringBillsRes,recurringBills],[agingRes,aging],[budgetsRes,budgets],[paymentsRes,payments],[runsRes,runs],[tax1099Res,tax1099],[banksRes,banks]].find(([res]) => !res.ok);
      if (failure) throw new Error(failure[1].message || failure[1].error || 'Parish Accounting is unavailable.');
      accountingData.payables = { overview: overview.overview, vendors: vendors.vendors || [], bills: bills.bills || [], recurringBills: recurringBills.schedules || [], payments: payments.payments || [], paymentRuns: runs.paymentRuns || [], tax1099: tax1099.report || null, bankAccounts: banks.accounts || [], aging: aging.aging || { rows: [], totalDue: 0 } };
      accountingData.budgets = { items: budgets.budgets || [] };
      renderAccountingPane();
    } catch (error) { if (pane) pane.innerHTML = `<div class="acct-empty error"><strong>Unable to load Parish Accounting</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseD()">Try again</button></div>`; }
  }
  function renderAccountingBankStatements(pane) {
    const data = accountingData.banking; if (!data) { pane.innerHTML = '<p class="sw-tool-loading">Loading Bank Reconciliation...</p>'; return; }
    const accountOptions = data.accounts.map((a) => `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}${a.maskedLast4 ? ` · •••• ${escapeHtml(a.maskedLast4)}` : ''}</option>`).join('');
    pane.innerHTML = `<div class="acct-list-head"><div><span class="acct-kicker">Double-entry bank reconciliation</span><h2>Match statements to the ledger</h2><p>Use this after reviewing Giving and Stripe activity for the same period.</p></div></div>
      <div class="acct-kpis"><div><span>Bank accounts</span><strong>${data.accounts.length}</strong></div><div><span>Open reconciliations</span><strong>${data.sessions.filter(s=>s.status!=='completed').length}</strong></div><div><span>Completed</span><strong>${data.sessions.filter(s=>s.status==='completed').length}</strong></div></div>
      <div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Statement import</span><h2>Import bank activity</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="previewAccountingBankCsv(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><label>CSV statement<input name="statement" type="file" accept=".csv,text/csv" required></label><button class="acct-primary">Preview import</button><span class="acct-form-status"></span></form>` : '<p>Add a bank account before importing a statement.</p>'}${accountingBankPreview ? `<div class="acct-import-preview"><strong>${accountingBankPreview.validRows} ready</strong><span>${accountingBankPreview.invalidRows} need review · ${accountingMoney(accountingBankPreview.totalCredits)} credits · ${accountingMoney(accountingBankPreview.totalDebits)} debits</span><button class="acct-primary" onclick="commitAccountingBankCsv()">Import transactions</button></div>` : ''}</section>
      <section class="acct-card"><span class="acct-kicker">New statement period</span><h2>Start reconciliation</h2>${data.accounts.length ? `<form class="acct-phase-form" onsubmit="createAccountingReconciliation(event)"><label>Bank account<select name="bankAccountId" required>${accountOptions}</select></label><div class="acct-form-grid"><label>Start<input name="startDate" type="date" required></label><label>End<input name="endDate" type="date" required></label><label>Beginning balance<input name="beginningBalance" type="number" step="0.01" required></label><label>Ending balance<input name="endingBalance" type="number" step="0.01" required></label></div><button class="acct-primary">Start reconciliation</button><span class="acct-form-status"></span></form>` : `<p>Create a bank account by linking an asset account in Accounting Setup.</p><button class="acct-primary" onclick="showAccountingBankAccountForm()">Add bank account</button>`}</section></div>
      <div class="acct-list-head"><div><span class="acct-kicker">Statement history</span><h2>Reconciliation sessions</h2></div>${data.accounts.length ? '<button class="acct-refresh" onclick="showAccountingBankAccountForm()">Add bank account</button>' : ''}</div><div id="accountingPhaseEForm"></div><div class="acct-card-grid">${data.accounts.map(a=>`<article class="acct-budget-card"><div><span>Bank account</span><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.institutionName||'Institution not set')} ${a.maskedLast4?`· •••• ${escapeHtml(a.maskedLast4)}`:''}</p></div><div class="acct-row-actions"><button onclick="editAccountingBankAccount('${escapeAttr(a.id)}')">Edit bank account</button></div></article>`).join('')}${data.sessions.map(s=>`<article class="acct-budget-card"><div><span>${accountingDate(s.startDate)} – ${accountingDate(s.endDate)}</span><h3>${escapeHtml(s.bankAccountName)}</h3><p>Statement ending ${accountingMoney(s.endingBalance)} · Difference ${accountingMoney(s.difference)}</p></div><span class="acct-status ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span><div class="acct-row-actions"><button onclick="downloadAccountingFile(accountingApi('/bank/reconciliations/${escapeAttr(s.id)}.csv'),'agapay-bank-reconciliation.csv')">Export</button><button onclick="showAccountingEligibleItems('${escapeAttr(s.id)}')">Eligible ledger items</button>${s.status!=='completed'?`<button onclick="showAccountingReconciliationAdjustment('${escapeAttr(s.id)}')">Add adjustment</button>`:''}${s.status!=='completed'&&Number(s.difference)===0?`<button onclick="completeAccountingReconciliation('${escapeAttr(s.id)}',${s.version})">Complete</button>`:''}</div></article>`).join('') || accountingEmpty('No reconciliations yet','Import a statement and begin the first period.')}</div>`;
  }
  function renderAccountingBanking(pane) {
    const tabs = `<div class="acct-reconcile-switch" role="tablist" aria-label="Reconciliation workspace">
      <button type="button" class="${accountingReconciliationView === 'giving' ? 'active' : ''}" onclick="setAccountingReconciliationView('giving')">Giving &amp; Stripe</button>
      <button type="button" class="${accountingReconciliationView === 'bank' ? 'active' : ''}" onclick="setAccountingReconciliationView('bank')">Bank statements &amp; ledger</button>
    </div>`;
    if (accountingReconciliationView === 'bank') {
      renderAccountingBankStatements(pane);
      pane.insertAdjacentHTML('afterbegin', tabs);
      return;
    }
    pane.innerHTML = `${tabs}<div class="acct-reconcile-intro"><span class="acct-kicker">Connected giving activity</span><p>Review Stripe deposits, fund allocations, fees, refunds, and exceptions before completing the formal bank-statement reconciliation.</p></div>`;
    const workspace = document.getElementById('reconcileWorkspace');
    if (workspace) pane.append(workspace);
    loadReconciliation();
  }
  function setAccountingReconciliationView(view) {
    accountingReconciliationView = view === 'bank' ? 'bank' : 'giving';
    renderAccountingPane();
  }
  function renderAccountingIntegrationsBase(pane) {
    const data=accountingData.integrations;if(!data){pane.innerHTML='<p class="sw-tool-loading">Loading Give & Commerce...</p>';return;}const give=data.give||{},settings=data.settings||{},commerce=data.commerce;
    pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">Automated posting</span><h2>Give & Stripe accounting</h2><p>Donation charges, Stripe fees, refunds, and payouts flow into the ledger with traceable source records.</p></div></div><div class="acct-kpis"><div><span>Source events</span><strong>${give.events||0}</strong></div><div><span>Gross contributions</span><strong>${accountingMoney(give.grossContributions)}</strong></div><div><span>Stripe fees</span><strong>${accountingMoney(give.stripeFees)}</strong></div></div><div class="acct-setup-grid"><section class="acct-card acct-settings"><span class="acct-kicker">Posting policy</span><h2>Integration settings</h2><label>Posting mode<select id="accountingIntegrationMode"><option value="automatic" ${settings.postingMode==='automatic'?'selected':''}>Automatic</option><option value="review" ${settings.postingMode==='review'?'selected':''}>Review before posting</option></select></label><button class="acct-primary" onclick="saveAccountingIntegrationSettings()">Save policy</button></section><section class="acct-card"><span class="acct-kicker">Stripe clearing</span><h2>${accountingMoney(data.clearing?.calculatedBalance)} expected balance</h2><p>${data.clearing?.balanced===false?'Review the difference against Stripe before closing the period.':'Charges, fees, refunds, and payouts are aligned for this period.'}</p></section></div>${accountingData.tier!=='advanced_operations'?accountingParishOnly():`<div class="acct-list-head"><div><span class="acct-kicker">Parish Commerce</span><h2>Bookstore accounting</h2><p>Sales, refunds, fees, inventory cost, and sales-tax liability are posted from the AGAPAY Bookstore.</p></div><button class="acct-refresh" onclick="downloadAccountingFile(accountingApi('/commerce/sales-tax.csv'),'agapay-commerce-sales-tax.csv')">Export tax report</button></div><div class="acct-kpis"><div><span>Net sales</span><strong>${accountingMoney(commerce?.netSales)}</strong></div><div><span>Sales tax collected</span><strong>${accountingMoney(commerce?.salesTaxCollected)}</strong></div><div><span>Needs review</span><strong>${(commerce?.unposted||0)+(commerce?.exceptions||0)}</strong></div></div>`}`;
  }
  function renderAccountingIntegrations(pane){renderAccountingIntegrationsBase(pane);if(accountingData.tier!=='advanced_operations'||!accountingData.integrations)return;pane.insertAdjacentHTML('beforeend',`<div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Commerce item mapping</span><h2>Configure an item</h2><form class="acct-phase-form" onsubmit="configureAccountingCommerceItem(event)"><label>Operational item ID<input name="operationalItemId" required></label><label>Name<input name="name" required></label><label>Revenue account<select name="defaultRevenueAccountId">${accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Default fund<select name="defaultFundId">${accountingData.funds.map(f=>`<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><button class="acct-primary">Save commerce item</button><span class="acct-form-status"></span></form></section><section class="acct-card"><span class="acct-kicker">Commerce backfill preview</span><h2>Review historical orders</h2><form class="acct-phase-form" onsubmit="previewAccountingCommerceBackfill(event)"><label>Start<input name="startDate" type="date" required></label><label>End<input name="endDate" type="date" required></label><button class="acct-primary">Preview backfill</button><span class="acct-form-status"></span></form><div id="accountingCommerceBackfillPreview"></div></section></div>`);}
  async function configureAccountingCommerceItem(event){event.preventDefault();const payload=await phaseEMutation('/commerce/items',Object.fromEntries(new FormData(event.currentTarget)));if(payload)event.currentTarget.querySelector('.acct-form-status').textContent='Commerce item saved.';}
  async function previewAccountingCommerceBackfill(event){event.preventDefault();const payload=await phaseEMutation('/commerce/backfill-preview',Object.fromEntries(new FormData(event.currentTarget)));if(payload){const p=payload.preview||{},box=document.getElementById('accountingCommerceBackfillPreview');box.innerHTML=`<div class="acct-facts"><div><strong>${p.ordersFound||0}</strong><span>Orders found</span></div><div><strong>${p.readyToPost||0}</strong><span>Ready to post</span></div><div><strong>${p.missingMappings||0}</strong><span>Missing mappings</span></div></div>`;}}
  async function loadAccountingPhaseE(){const pane=document.getElementById('accountingPane');if(pane)pane.innerHTML='<p class="sw-tool-loading">Loading connected accounting...</p>';try{const paths=['/bank/accounts','/bank/reconciliations','/integrations/give-stripe/settings','/integrations/give-stripe/overview','/integrations/give-stripe/clearing'];if(accountingData.tier==='advanced_operations')paths.push('/commerce/overview');const responses=await Promise.all(paths.map(path=>fetch(accountingApi(path),{headers:authHeaders()})));const payloads=await Promise.all(responses.map(res=>res.json().catch(()=>({}))));const failed=responses.findIndex(res=>!res.ok);if(failed>=0)throw new Error(payloads[failed].message||payloads[failed].error||'Connected accounting is unavailable.');accountingData.banking={accounts:payloads[0].accounts||[],sessions:payloads[1].sessions||[]};accountingData.integrations={settings:payloads[2].settings||{},give:payloads[3].overview||{},clearing:payloads[4].clearing||{},commerce:payloads[5]?.overview||null};renderAccountingPane();}catch(error){if(pane)pane.innerHTML=`<div class="acct-empty error"><strong>Unable to load connected accounting</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseE()">Try again</button></div>`;}}
  function showAccountingBankAccountForm(){const holder=document.getElementById('accountingPhaseEForm');if(!holder)return;const assets=accountingData.accounts.filter(a=>a.category==='asset').map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('');holder.innerHTML=`<form class="acct-phase-form" onsubmit="createAccountingBankAccount(event)"><div class="acct-form-grid"><label>Account name<input name="name" required placeholder="Operating checking"></label><label>Institution<input name="institutionName"></label><label>Last four digits<input name="maskedLast4" maxlength="4" inputmode="numeric"></label><label>Ledger asset account<select name="ledgerAccountId" required>${assets}</select></label></div><button class="acct-primary">Add bank account</button><span class="acct-form-status"></span></form>`;}
  async function phaseEMutation(path,body,method='POST'){const res=await fetch(accountingApi(path),{method,headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)}),payload=await res.json().catch(()=>({}));if(!res.ok){const status=document.querySelector('.acct-form-status');if(status)status.textContent=payload.message||payload.error;else alert(payload.message||payload.error);return null;}return payload;}
  async function createAccountingBankAccount(event){event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget));if(await phaseEMutation('/bank/accounts',{...raw,accountType:'checking',isDefault:!accountingData.banking.accounts.length})){accountingData.banking=null;await loadAccountingPhaseE();}}
  async function previewAccountingBankCsv(event){event.preventDefault();const form=event.currentTarget,file=form.elements.statement.files[0];const payload=await phaseEMutation('/bank/imports/preview',{filename:file.name,csv:await file.text()});if(payload){accountingBankPreview={...payload.preview,bankAccountId:form.elements.bankAccountId.value};renderAccountingPane();}}
  async function commitAccountingBankCsv(){if(!accountingBankPreview)return;if(await phaseEMutation('/bank/imports/commit',{bankAccountId:accountingBankPreview.bankAccountId,preview:accountingBankPreview})){accountingBankPreview=null;accountingData.banking=null;await loadAccountingPhaseE();}}
  async function createAccountingReconciliation(event){event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget));raw.beginningBalance=Math.round(Number(raw.beginningBalance)*100);raw.endingBalance=Math.round(Number(raw.endingBalance)*100);if(await phaseEMutation('/bank/reconciliations',raw)){accountingData.banking=null;await loadAccountingPhaseE();}}
  async function completeAccountingReconciliation(id,version){if(await phaseEMutation(`/bank/reconciliations/${encodeURIComponent(id)}/complete`,{expectedVersion:version})){accountingData.banking=null;await loadAccountingPhaseE();}}
  function editAccountingBankAccount(id){const a=accountingData.banking.accounts.find(item=>item.id===id);if(!a)return;const holder=document.getElementById('accountingPhaseEForm');holder.innerHTML=`<form class="acct-phase-form" onsubmit="updateAccountingBankAccount(event,'${escapeAttr(id)}',${a.version})"><div class="acct-form-grid"><label>Name<input name="name" value="${escapeAttr(a.name)}" required></label><label>Institution<input name="institutionName" value="${escapeAttr(a.institutionName||'')}"></label><label>Last four<input name="maskedLast4" maxlength="4" value="${escapeAttr(a.maskedLast4||'')}"></label></div><button class="acct-primary">Save bank account</button><span class="acct-form-status"></span></form>`;}
  async function updateAccountingBankAccount(event,id,expectedVersion){event.preventDefault();const patch=Object.fromEntries(new FormData(event.currentTarget));if(await phaseEMutation(`/bank/accounts/${encodeURIComponent(id)}`,{expectedVersion,patch},'PATCH')){accountingData.banking=null;await loadAccountingPhaseE();}}
  async function showAccountingEligibleItems(id){const res=await fetch(accountingApi(`/bank/reconciliations/${encodeURIComponent(id)}/eligible-items`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error);return;}const holder=document.getElementById('accountingPhaseEForm');holder.innerHTML=`<section class="acct-card"><span class="acct-kicker">Reconciliation session detail</span><h2>Available to match</h2><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Net effect</th></tr></thead><tbody>${(payload.items||[]).map(item=>`<tr><td>${accountingDate(item.postingDate)}</td><td>${escapeHtml(item.entryNumber||item.journalEntryId)}</td><td>${escapeHtml(item.description||'')}</td><td>${accountingMoney(item.netEffect)}</td></tr>`).join('')||'<tr><td colspan="4">No eligible items.</td></tr>'}</tbody></table></div><div data-accounting-attachments></div></section>`;renderAccountingAttachments('reconciliation_session',id,holder.querySelector('[data-accounting-attachments]'));}
  function showAccountingReconciliationAdjustment(id){const holder=document.getElementById('accountingPhaseEForm'),accounts=accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join(''),funds=accountingData.funds.map(f=>`<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('');holder.innerHTML=`<form class="acct-phase-form" onsubmit="postAccountingReconciliationAdjustment(event,'${escapeAttr(id)}')"><h2>Reconciliation adjustment</h2><div class="acct-form-grid"><label>Date<input name="date" type="date" required value="${new Date().toISOString().slice(0,10)}"></label><label>Description<input name="description" required></label><label>Amount<input name="amount" type="number" min=".01" step=".01" required></label><label>Bank direction<select name="direction"><option value="credit">Increase bank</option><option value="debit">Decrease bank</option></select></label><label>Offset account<select name="offsetAccountId">${accounts}</select></label><label>Fund<select name="fundId">${funds}</select></label><label>Reason<input name="reason" required></label></div><button class="acct-primary">Post adjustment</button><span class="acct-form-status"></span></form>`;}
  async function postAccountingReconciliationAdjustment(event,id){event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget));raw.amount=Math.round(Number(raw.amount)*100);raw.idempotencyKey=`reconciliation-ui-${id}-${Date.now()}`;if(await phaseEMutation(`/bank/reconciliations/${encodeURIComponent(id)}/adjustments`,raw)){accountingData.banking=null;await loadAccountingPhaseE();}}
  async function saveAccountingIntegrationSettings(){const patch={postingMode:document.getElementById('accountingIntegrationMode').value};const payload=await phaseEMutation('/integrations/give-stripe/settings',{expectedVersion:accountingData.integrations.settings.version,patch},'PATCH');if(payload){accountingData.integrations.settings=payload.settings;renderAccountingPane();}}
  function renderAccountingCloseBase(pane){const data=accountingData.close;if(!data){pane.innerHTML='<p class="sw-tool-loading">Loading close workspace...</p>';return;}if(accountingCloseDetail){const s=accountingCloseDetail,summary=s.summary||{};pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">${escapeHtml((s.closeType||'period').replaceAll('_',' '))}</span><h2>Close checklist</h2><p>${summary.passed||0} passed · ${summary.warnings||0} warnings · ${summary.blockers||0} blockers</p></div><button class="acct-refresh" onclick="accountingCloseDetail=null;renderAccountingPane()">Back to close history</button></div><div class="acct-checklist acct-close-checklist">${(s.checks||[]).map(check=>`<div class="${check.status==='passed'?'complete':check.status==='failed'?'failed':''}"><i>${check.status==='passed'?'✓':check.status==='failed'?'!':'○'}</i><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.category)} · ${escapeHtml(check.status)}${check.details?.count?` · ${check.details.count} item(s)`:''}</small></span>${['warning','pending'].includes(check.status)&&!check.blocking?`<button onclick="waiveAccountingCloseCheck('${escapeAttr(s.id)}','${escapeAttr(check.id)}',${check.version})">Waive</button>`:''}</div>`).join('')}</div><div class="acct-close-actions"><button class="acct-refresh" onclick="validateAccountingClose('${escapeAttr(s.id)}',${s.version})">Run checks again</button>${['ready_for_review','reviewed','approved'].includes(s.status)&&!summary.blockers?`<button class="acct-primary" onclick="completeAccountingClose('${escapeAttr(s.id)}',${s.version},'${escapeAttr(s.closeType)}')">${s.closeType==='year_end'?'Execute year-end close':'Complete close'}</button>`:''}${s.status==='completed'?`<button class="acct-refresh" onclick="printAccountingClosePacket('${escapeAttr(s.id)}')">Print close packet</button>`:''}</div>`;return;}
    const fy=data.fiscalYears[0],openPeriods=data.periods.filter(p=>p.status==='open'&&(!fy||p.fiscalYearId===fy.id));pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">Controlled accounting close</span><h2>Month-end & year-end</h2><p>Review every subsystem, resolve blockers, preserve a snapshot, and lock the period.</p></div>${fy?`<button class="acct-refresh" onclick="downloadAccountingAuditTrail()">Export audit trail</button>`:''}</div><div class="acct-kpis"><div><span>Open periods</span><strong>${openPeriods.length}</strong></div><div><span>Close in progress</span><strong>${data.sessions.filter(s=>!['completed','voided'].includes(s.status)).length}</strong></div><div><span>Completed closes</span><strong>${data.sessions.filter(s=>s.status==='completed').length}</strong></div></div><div class="acct-setup-grid"><section class="acct-card"><span class="acct-kicker">Start month-end</span><h2>Close an accounting period</h2>${openPeriods.length?`<form class="acct-phase-form" onsubmit="createAccountingClose(event)"><input type="hidden" name="closeType" value="month_end"><label>Fiscal year<select name="fiscalYearId">${data.fiscalYears.map(y=>`<option value="${escapeAttr(y.id)}">${escapeHtml(y.name)}</option>`).join('')}</select></label><label>Open period<select name="accountingPeriodId">${openPeriods.map(p=>`<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label><button class="acct-primary">Begin month-end close</button><span class="acct-form-status"></span></form>`:'<p>No open accounting period is currently available.</p>'}</section><section class="acct-card"><span class="acct-kicker">Year-end</span><h2>Close revenue & expense accounts</h2><p>Preview the change in net assets and verify every prior period before creating the final closing entry.</p>${fy?`<button class="acct-primary" onclick="createAccountingYearEnd('${escapeAttr(fy.id)}')">Begin year-end close</button><button class="acct-link" onclick="downloadAccountingAccountantExport('${escapeAttr(fy.id)}')">Prepare accountant handoff</button>`:''}</section></div><div class="acct-list-head"><div><span class="acct-kicker">Close history</span><h2>Sessions & preserved snapshots</h2></div></div><div class="acct-card-grid">${data.sessions.map(s=>`<article class="acct-budget-card"><div><span>${escapeHtml((s.closeType||'close').replaceAll('_',' '))}</span><h3>${escapeHtml(data.periods.find(p=>p.id===s.accountingPeriodId)?.name||data.fiscalYears.find(y=>y.id===s.fiscalYearId)?.name||'Accounting close')}</h3><p>${s.lastValidatedAt?`Last checked ${accountingDate(s.lastValidatedAt)}`:'Checks not yet run'}</p></div><span class="acct-status ${escapeAttr(s.status)}">${escapeHtml(s.status)}</span><div class="acct-row-actions"><button onclick="openAccountingClose('${escapeAttr(s.id)}')">Open checklist</button></div></article>`).join('')||accountingEmpty('No close sessions yet','Begin with the current open accounting period.')}</div>`;}
  function renderAccountingClose(pane){renderAccountingCloseBase(pane);if(accountingCloseDetail||!accountingData.close)return;const adjustments=accountingData.adjustments||{items:[],templates:[]},fy=accountingData.close.fiscalYears[0];pane.insertAdjacentHTML('beforeend',`<div class="acct-list-head"><div><span class="acct-kicker">Adjusting entries</span><h2>Period adjustments</h2><p>Create, review, and post accruals, deferrals, corrections, and recurring templates.</p></div></div><div class="acct-setup-grid"><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingAdjustment(event)"><label>Type<select name="adjustmentType"><option value="accrual">Accrual</option><option value="deferral">Deferral</option><option value="reclassification">Reclassification</option><option value="correction">Correction</option><option value="other">Other</option></select></label><label>Effective date<input name="effectiveDate" type="date" required></label><label>Reason<input name="reason" required></label><label>Supporting memo<textarea name="supportingMemo" required></textarea></label><div class="acct-form-grid"><label>Debit account<select name="debitAccountId">${accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select></label><label>Credit account<select name="creditAccountId">${accountingData.accounts.map(a=>`<option value="${escapeAttr(a.id)}">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.name)}</option>`).join('')}</select><label>Fund<select name="fundId">${accountingData.funds.map(f=>`<option value="${escapeAttr(f.id)}">${escapeHtml(f.code)} · ${escapeHtml(f.name)}</option>`).join('')}</select></label><label>Amount<input name="amount" type="number" min=".01" step=".01" required></label></div><button class="acct-primary">Create adjustment</button><span class="acct-form-status"></span></form></section><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingAdjustmentTemplate(event)"><h2>New adjustment template</h2><label>Name<input name="name" required></label><label>Frequency<select name="frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option></select></label><button class="acct-primary">Create template from accounts above</button><span class="acct-form-status"></span></form><div class="acct-checklist">${adjustments.templates.map(t=>`<div><i>↻</i><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.frequency)}</small></span></div>`).join('')||'<p>No templates yet.</p>'}</div></section></div><div class="acct-card-grid">${adjustments.items.map(a=>`<article class="acct-budget-card"><div><span>${accountingDate(a.effectiveDate)}</span><h3>${escapeHtml(a.type)}</h3><p>${escapeHtml(a.reason)}</p></div><span class="acct-status ${escapeAttr(a.status)}">${escapeHtml(a.status)}</span>${a.status==='draft'?`<button onclick="postAccountingAdjustment('${escapeAttr(a.id)}',${a.version})">Post adjustment</button>`:''}</article>`).join('')||accountingEmpty('No adjustments yet','Create an adjusting entry for the open period.')}</div>${fy?`<section class="acct-card"><span class="acct-kicker">Fiscal-year governance</span><h2>${escapeHtml(fy.name)}</h2><div class="acct-row-actions"><button onclick="archiveAccountingFiscalYear('${escapeAttr(fy.id)}',${fy.version})">Archive fiscal year</button><button onclick="reopenAccountingFiscalYear('${escapeAttr(fy.id)}',${fy.version})">Reopen year-end close</button></div></section>`:''}`);}
  async function loadAccountingPhaseF(){const pane=document.getElementById('accountingPane');if(pane)pane.innerHTML='<p class="sw-tool-loading">Loading close workspace...</p>';try{const [res,adjustmentsRes,templatesRes]=await Promise.all(['/close/workspace','/adjustments','/adjustments/templates'].map(path=>fetch(accountingApi(path),{headers:authHeaders()}))),[payload,adjustments,templates]=await Promise.all([res,adjustmentsRes,templatesRes].map(response=>response.json().catch(()=>({}))));if(!res.ok)throw new Error(payload.message||payload.error);if(!adjustmentsRes.ok)throw new Error(adjustments.message||adjustments.error);if(!templatesRes.ok)throw new Error(templates.message||templates.error);accountingData.close={fiscalYears:payload.fiscalYears||[],periods:payload.periods||[],sessions:payload.sessions||[]};accountingData.adjustments={items:adjustments.adjustments||[],templates:templates.templates||[]};renderAccountingPane();}catch(error){if(pane)pane.innerHTML=`<div class="acct-empty error"><strong>Unable to load close workspace</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingPhaseF()">Try again</button></div>`;}}
  async function phaseFMutation(path,body){const res=await fetch(accountingApi(path),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error||'Unable to update close.');return null;}return payload;}
  async function createAccountingClose(event){event.preventDefault();const payload=await phaseFMutation('/close/sessions',Object.fromEntries(new FormData(event.currentTarget)));if(payload){await validateAccountingClose(payload.session.id,payload.session.version);}}
  async function createAccountingYearEnd(fiscalYearId){const payload=await phaseFMutation('/close/sessions',{closeType:'year_end',fiscalYearId});if(payload)await validateAccountingClose(payload.session.id,payload.session.version);}
  async function openAccountingClose(id){const res=await fetch(accountingApi(`/close/sessions/${encodeURIComponent(id)}`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error);return;}accountingCloseDetail=payload.session;renderAccountingPane();}
  async function validateAccountingClose(id,version){const payload=await phaseFMutation(`/close/sessions/${encodeURIComponent(id)}/validate`,{expectedVersion:version});if(payload){accountingCloseDetail=payload.session;renderAccountingPane();}}
  async function waiveAccountingCloseCheck(id,checkId,version){const reason=prompt('Reason for waiving this warning:');if(!reason)return;const payload=await phaseFMutation(`/close/sessions/${encodeURIComponent(id)}/waive`,{checkId,expectedVersion:version,reason});if(payload)await openAccountingClose(id);}
  async function completeAccountingClose(id,version,type){const path=type==='year_end'?`/close/year-end/${encodeURIComponent(accountingCloseDetail.fiscalYearId)}/execute`:`/close/sessions/${encodeURIComponent(id)}/complete`;const body=type==='year_end'?{closeSessionId:id,expectedVersion:version}:{expectedVersion:version};if(await phaseFMutation(path,body)){accountingCloseDetail=null;accountingData.close=null;await loadAccountingPhaseF();}}
  function printAccountingClosePacket(id){window.open(accountingApi(`/close/sessions/${encodeURIComponent(id)}/packet`),'_blank','noopener');}
  function downloadAccountingAuditTrail(){downloadAccountingFile(accountingApi('/close/audit-trail.csv'),'agapay-accounting-audit-trail.csv');}
  async function downloadAccountingAccountantExport(fiscalYearId){const payload=await phaseFMutation(`/close/year-end/${encodeURIComponent(fiscalYearId)}/accountant-export`,{});if(payload)alert('Accountant handoff prepared and preserved with its manifest.');}
  async function createAccountingAdjustment(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),amount=Math.round(Number(raw.amount)*100);raw.lines=[{accountId:raw.debitAccountId,fundId:raw.fundId,debitAmount:amount},{accountId:raw.creditAccountId,fundId:raw.fundId,creditAmount:amount}];delete raw.amount;delete raw.debitAccountId;delete raw.creditAccountId;delete raw.fundId;if(await phaseFMutation('/adjustments',raw)){accountingData.close=null;accountingData.adjustments=null;await loadAccountingPhaseF();}}
  async function postAccountingAdjustment(id,expectedVersion){if(await phaseFMutation(`/adjustments/${encodeURIComponent(id)}/post`,{expectedVersion})){accountingData.close=null;accountingData.adjustments=null;await loadAccountingPhaseF();}}
  async function createAccountingAdjustmentTemplate(event){event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget)),debit=accountingData.accounts[0],credit=accountingData.accounts[1],fund=accountingData.funds[0];raw.lines=[{accountId:debit?.id,fundId:fund?.id,debitAmount:1},{accountId:credit?.id,fundId:fund?.id,creditAmount:1}];if(await phaseFMutation('/adjustments/templates',raw)){accountingData.close=null;accountingData.adjustments=null;await loadAccountingPhaseF();}}
  async function archiveAccountingFiscalYear(id,expectedVersion){if(!confirm('Archive this fiscal year?'))return;if(await phaseFMutation(`/close/year-end/${encodeURIComponent(id)}/archive`,{expectedVersion})){accountingData.close=null;await loadAccountingPhaseF();}}
  async function reopenAccountingFiscalYear(id,expectedVersion){const reason=prompt('Reason for reopening this year-end close:');if(!reason)return;if(await phaseFMutation(`/close/year-end/${encodeURIComponent(id)}/reopen`,{expectedVersion,reason})){accountingData.close=null;await loadAccountingPhaseF();}}
  function renderAccountingGovernance(pane){const data=accountingData.governance;if(!data){pane.innerHTML='<p class="sw-tool-loading">Loading accounting governance...</p>';return;}const s=data.settings||{},h=data.health||{},p=h.protectiveState||{};pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">Parish record governance</span><h2>Retention, legal holds &amp; health</h2><p>Set parish record classifications and review the operational state of your books. Platform operators control integrity scans and protective-state changes.</p></div></div><div class="acct-setup-grid"><section class="acct-card acct-settings"><span class="acct-kicker">Retention settings</span><h2>Record classifications</h2><form class="acct-phase-form" onsubmit="saveAccountingRetention(event)"><div class="acct-form-grid">${[['accountingRecordsRetentionYears','Accounting records'],['bankStatementRetentionYears','Bank statements'],['invoiceRetentionYears','Invoices'],['auditLogRetentionYears','Audit logs'],['attachmentRetentionYears','Attachments'],['closePacketRetentionYears','Close packets']].map(([name,label])=>`<label>${label}<input name="${name}" type="number" min="1" max="100" step="1" required value="${Number(s[name]||7)}"></label>`).join('')}</div><label><input name="allowLegalHold" type="checkbox" ${s.allowLegalHold?'checked':''}> Allow legal holds</label><button class="acct-primary">Save retention settings</button><span class="acct-form-status"></span></form><p class="acct-governance-disclaimer">${escapeHtml(s.disclaimer||'')}</p></section><section class="acct-card"><span class="acct-kicker">Read-only health overview</span><h2>${escapeHtml(String(h.status||'unknown').replaceAll('_',' '))}</h2><p>${escapeHtml(p.safeSummary||'No protective restriction is active.')}</p><div class="acct-facts"><div><strong>${escapeHtml(String(p.state||'unknown').replaceAll('_',' '))}</strong><span>Protective state</span></div><div><strong>${h.activeWork||0}</strong><span>Active scans</span></div><div><strong>${(h.findings||[]).length}</strong><span>Open findings</span></div></div><p>${escapeHtml(h.disclaimer||'')}</p></section></div><div class="acct-list-head"><div><span class="acct-kicker">Legal holds</span><h2>Preserve designated records</h2></div></div><section class="acct-card"><form class="acct-phase-form" onsubmit="createAccountingLegalHold(event)"><div class="acct-form-grid"><label>Entity type<input name="entityType" required placeholder="journal_entry"></label><label>Entity ID<input name="entityId" required></label><label>Reason<input name="reason" required></label></div><button class="acct-primary" ${s.allowLegalHold?'':'disabled'}>Create legal hold</button><span class="acct-form-status"></span></form></section><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Placed</th><th>Entity</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${data.legalHolds.map(hold=>`<tr><td>${accountingDate(hold.placedAt)}</td><td><strong>${escapeHtml(hold.entityType)}</strong><br>${escapeHtml(hold.entityId)}</td><td>${escapeHtml(hold.reason)}</td><td><span class="acct-status ${escapeAttr(hold.status)}">${escapeHtml(hold.status)}</span></td><td>${hold.status==='active'?`<button class="acct-link" onclick="releaseAccountingLegalHold('${escapeAttr(hold.id)}',${hold.version})">Release</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5">No legal holds.</td></tr>'}</tbody></table></div>`;}
  async function loadAccountingGovernance(){const pane=document.getElementById('accountingPane');if(pane)pane.innerHTML='<p class="sw-tool-loading">Loading accounting governance...</p>';try{const responses=await Promise.all(['/governance/retention','/governance/legal-holds','/governance/health'].map(path=>fetch(accountingApi(path),{headers:authHeaders()}))),payloads=await Promise.all(responses.map(res=>res.json().catch(()=>({}))));const failed=responses.findIndex(res=>!res.ok);if(failed>=0)throw new Error(payloads[failed].message||payloads[failed].error||'Governance is unavailable.');accountingData.governance={settings:payloads[0].settings||{},legalHolds:payloads[1].legalHolds||[],health:payloads[2].health||{}};renderAccountingPane();}catch(error){if(pane)pane.innerHTML=`<div class="acct-empty error"><strong>Unable to load governance</strong><span>${escapeHtml(error.message)}</span><button onclick="loadAccountingGovernance()">Try again</button></div>`;}}
  async function saveAccountingRetention(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),patch={allowLegalHold:form.elements.allowLegalHold.checked};for(const key of ['accountingRecordsRetentionYears','bankStatementRetentionYears','invoiceRetentionYears','auditLogRetentionYears','attachmentRetentionYears','closePacketRetentionYears'])patch[key]=Number(raw[key]);const res=await fetch(accountingApi('/governance/retention'),{method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:accountingData.governance.settings.version,patch})}),payload=await res.json().catch(()=>({}));form.querySelector('.acct-form-status').textContent=res.ok?'Retention settings saved.':payload.message||payload.error||'Unable to save retention settings.';if(res.ok){accountingData.governance=null;await loadAccountingGovernance();}}
  async function createAccountingLegalHold(event){event.preventDefault();const form=event.currentTarget,res=await fetch(accountingApi('/governance/legal-holds'),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))}),payload=await res.json().catch(()=>({}));form.querySelector('.acct-form-status').textContent=res.ok?'Legal hold created.':payload.message||payload.error||'Unable to create legal hold.';if(res.ok){accountingData.governance=null;await loadAccountingGovernance();}}
  async function releaseAccountingLegalHold(id,expectedVersion){if(!confirm('Release this legal hold? The record remains in the governance history.'))return;const res=await fetch(accountingApi(`/governance/legal-holds/${encodeURIComponent(id)}/release`),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({expectedVersion})}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error||'Unable to release legal hold.');return;}accountingData.governance=null;await loadAccountingGovernance();}
  function setAccountingPayablesView(view) { accountingPayablesView = ['bills','recurring','payments','runs','1099','vendors','aging'].includes(view) ? view : 'bills'; renderAccountingPane(); }
  function phaseDForm() { return document.getElementById('accountingPhaseDForm'); }
  function openAccountingBillDetail(id) {
    const bill = accountingData.payables?.bills?.find((item) => item.id === id), holder = phaseDForm();
    if (!bill || !holder) return;
    holder.innerHTML = `<section class="acct-card"><div class="acct-list-head"><div><span class="acct-kicker">Bill detail</span><h2>${escapeHtml(bill.vendorInvoiceNumber || bill.billNumber)}</h2><p>${escapeHtml(bill.vendorName)} · ${accountingMoney(bill.totalAmount)}</p></div><button class="acct-link" onclick="phaseDForm().innerHTML=''">Close</button></div><div data-accounting-attachments></div></section>`;
    renderAccountingAttachments('bill', id, holder.querySelector('[data-accounting-attachments]'));
  }
  function showAccountingVendorForm(id = '') {
    const holder = phaseDForm(); if (!holder) return;
    const vendor = id ? accountingData.payables.vendors.find((item) => item.id === id) : null;
    const expenseOptions = accountingData.accounts.filter((account) => ['expense','asset'].includes(account.category)).map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const fundOptions = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    holder.innerHTML = `<form class="acct-phase-form" onsubmit="saveAccountingVendor(event,'${escapeAttr(vendor?.id||'')}',${Number(vendor?.version||0)})"><div class="acct-list-head"><div><span class="acct-kicker">${vendor?'Edit vendor':'New vendor'}</span><h2>${vendor?escapeHtml(vendor.displayName):'Add a payee'}</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Vendor name<input name="displayName" required value="${escapeAttr(vendor?.displayName||'')}"></label><label>Email<input name="email" type="email" value="${escapeAttr(vendor?.email||'')}"></label><label>Default expense or prepaid-asset account<select name="defaultExpenseAccountId"><option value="">None</option>${expenseOptions.replace(`value="${escapeAttr(vendor?.defaultExpenseAccountId||'')}"`,`value="${escapeAttr(vendor?.defaultExpenseAccountId||'')}" selected`)}</select></label><label>Default fund<select name="defaultFundId"><option value="">None</option>${fundOptions.replace(`value="${escapeAttr(vendor?.defaultFundId||'')}"`,`value="${escapeAttr(vendor?.defaultFundId||'')}" selected`)}</select></label></div><button class="acct-primary" type="submit">Save vendor</button><span class="acct-form-status"></span></form>`;
  }
  async function saveAccountingVendor(event, vendorId, expectedVersion) {
    event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
    const response = await fetch(accountingApi(vendorId ? `/payables/vendors/${encodeURIComponent(vendorId)}` : '/payables/vendors'), { method:vendorId?'PATCH':'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(vendorId ? { expectedVersion, patch:data } : data) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { form.querySelector('.acct-form-status').textContent = payload.message || payload.error || 'Unable to save vendor.'; return; }
    accountingData.payables = null;
    await loadAccountingPhaseD();
  }
  async function createAccountingVendor(event) { return saveAccountingVendor(event, '', 0); }
  function beginAccountingVendorLifecycle(id, action) { accountingVendorLifecycleConfirm = { id, action }; accountingLifecycleMessage = null; renderAccountingPane(); }
  async function changeAccountingVendorLifecycle(id, action, expectedVersion) {
    const response = await fetch(accountingApi(`/payables/vendors/${encodeURIComponent(id)}/${action}`), { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify({ expectedVersion }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { accountingVendorLifecycleConfirm = null; accountingLifecycleMessage = { type:'vendor', id, text:payload.message || payload.error || 'Unable to update this vendor.' }; renderAccountingPane(); return; }
    accountingVendorLifecycleConfirm = null; accountingLifecycleMessage = null; accountingData.payables = null; await loadAccountingPhaseD();
  }
  function applyAccountingBillVendorDefaults(vendorSelect) {
    const vendor = accountingData.payables?.vendors?.find((item) => item.id === vendorSelect.value);
    const form = vendorSelect.form;
    if (!vendor || !form) return;
    if (vendor.defaultExpenseAccountId && form.elements.accountId) form.elements.accountId.value = vendor.defaultExpenseAccountId;
    if (vendor.defaultFundId && form.elements.fundId) form.elements.fundId.value = vendor.defaultFundId;
    if (form.elements.name && !form.elements.name.value) form.elements.name.value = `${vendor.displayName} recurring bill`;
    if (form.elements.description && !form.elements.description.value) form.elements.description.value = `${vendor.displayName} bill`;
  }
  function showAccountingBillForm() {
    const holder = phaseDForm(); if (!holder) return;
    const vendors = accountingData.payables.vendors.filter((vendor) => vendor.status === 'active').map((vendor) => `<option value="${escapeAttr(vendor.id)}">${escapeHtml(vendor.displayName)}</option>`).join('');
    const accounts = accountingData.accounts.filter((account) => ['expense','asset'].includes(account.category)).map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const funds = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingBill(event)"><div class="acct-list-head"><div><span class="acct-kicker">Bill entry</span><h2>Record a vendor bill</h2><p>Selecting a vendor applies its saved account and fund defaults.</p></div><div class="acct-report-actions"><button type="button" class="acct-link" onclick="showAccountingRecurringBillForm()">Make recurring</button><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div></div><div class="acct-form-grid"><label>Vendor<select name="vendorId" required onchange="applyAccountingBillVendorDefaults(this)"><option value="">Choose vendor</option>${vendors}</select></label><label>Invoice number<input name="vendorInvoiceNumber"></label><label>Bill date<input name="billDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Description<input name="description" required></label><label>Expense or prepaid-asset account<select name="accountId" required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select name="fundId" required><option value="">Choose fund</option>${funds}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label></div><button class="acct-primary" type="submit">Save draft bill</button><span class="acct-form-status"></span></form>`;
  }
  async function createAccountingBill(event) {
    event.preventDefault(); const form = event.currentTarget, raw = Object.fromEntries(new FormData(form));
    const data = { vendorId: raw.vendorId, vendorInvoiceNumber: raw.vendorInvoiceNumber, billDate: raw.billDate, description: raw.description, lines: [{ description: raw.description, accountId: raw.accountId, fundId: raw.fundId, quantity: 1, unitAmount: Math.round(Number(raw.amount) * 100) }] };
    await accountingPhaseDMutation('/payables/bills', data, 'Draft bill saved.');
  }
  function showAccountingRecurringBillForm() {
    const holder = phaseDForm(); if (!holder) return;
    const vendors = accountingData.payables.vendors.filter((vendor) => vendor.status === 'active').map((vendor) => `<option value="${escapeAttr(vendor.id)}">${escapeHtml(vendor.displayName)}</option>`).join('');
    const accounts = accountingData.accounts.filter((account) => ['expense','asset'].includes(account.category)).map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const funds = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    holder.innerHTML = `<form class="acct-phase-form" onsubmit="saveAccountingRecurringBill(event)"><div class="acct-list-head"><div><span class="acct-kicker">Recurring bill</span><h2>Create reviewable draft bills automatically</h2><p>The schedule creates drafts only. Approval, posting, and payment remain separate controls.</p></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Vendor<select name="vendorId" required onchange="applyAccountingBillVendorDefaults(this)"><option value="">Choose vendor</option>${vendors}</select></label><label>Schedule name<input name="name" required maxlength="120" placeholder="Monthly internet"></label><label>Description<input name="description" required maxlength="240" placeholder="Internet service"></label><label>Expense or prepaid-asset account<select name="accountId" required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select name="fundId" required><option value="">Choose fund</option>${funds}</select></label><label>Amount<input name="amountDollars" type="number" min="0.01" step="0.01" required></label><label>Frequency<select name="frequency"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly" selected>Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option></select></label><label>First bill date<input name="nextBillDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>End date <small>Optional</small><input name="endDate" type="date"></label></div><button class="acct-primary" type="submit">Start recurring bill</button><span class="acct-form-status"></span></form>`;
  }
  async function saveAccountingRecurringBill(event) {
    event.preventDefault();
    const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),status=form.querySelector('.acct-form-status');
    const amount=Math.round(Number(raw.amountDollars)*100);
    const response=await fetch(accountingApi('/payables/recurring-bills'),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({...raw,amount})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){status.textContent=payload.message||payload.error||'Unable to save this recurring bill.';return;}
    accountingData.payables=null;
    await loadAccountingPhaseD();
    accountingPayablesView='recurring';
    renderAccountingPane();
  }
  async function toggleAccountingRecurringBill(id,expectedVersion,status) {
    const response=await fetch(accountingApi(`/payables/recurring-bills/${encodeURIComponent(id)}`),{method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({expectedVersion,status})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){alert(payload.message||payload.error||'Unable to update this recurring bill.');return;}
    accountingData.payables=null;
    await loadAccountingPhaseD();
  }
  function showAccountingPaymentForm(){const holder=phaseDForm();if(!holder)return;const bills=(accountingData.payables.bills||[]).filter(b=>['posted','partially_paid'].includes(b.status)&&Number(b.amountDue)>0),banks=accountingData.payables.bankAccounts||[];if(!bills.length||!banks.length){holder.innerHTML=accountingEmpty('Payment setup is incomplete',!banks.length?'Add an Accounting bank account before paying bills.':'Post an approved bill before creating a payment.');return;}holder.innerHTML=`<form class="acct-phase-form" onsubmit="createAccountingPayment(event)"><div class="acct-list-head"><div><span class="acct-kicker">Bill payment</span><h2>Select bills and how they were paid</h2><p>Online payments are recorded and posted immediately. Checks retain the print-then-post workflow.</p></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Payment method<select name="paymentMethod" required onchange="syncAccountingPaymentMethod(this.form)"><option value="external">Online bill pay</option><option value="ach">ACH / bank transfer</option><option value="wire">Wire transfer</option><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="check">Printed check</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Paid from<select name="bankAccountId" required onchange="syncAccountingPaymentMethod(this.form)">${banks.map(b=>`<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)}${b.maskedLast4?` · •••• ${escapeHtml(b.maskedLast4)}`:''}</option>`).join('')}</select></label><label data-payment-reference>Confirmation / reference number<input name="referenceNumber" autocomplete="off" required placeholder="Receipt or confirmation number"></label><label data-payment-check hidden>Check number<input id="accountingCheckNumber" name="checkNumber" inputmode="numeric"></label><label>Payment date<input name="paymentDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Memo<input name="memo" placeholder="Optional payment memo"></label></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th></th><th>Vendor</th><th>Invoice</th><th>Due</th><th>Amount due</th><th>Pay now</th></tr></thead><tbody>${bills.map(b=>`<tr><td><input type="checkbox" data-payment-bill value="${escapeAttr(b.id)}" data-vendor="${escapeAttr(b.vendorId)}" onchange="syncAccountingPaymentSelection(this)"></td><td>${escapeHtml(b.vendorName)}</td><td>${escapeHtml(b.vendorInvoiceNumber||b.billNumber)}</td><td>${accountingDate(b.dueDate)}</td><td>${accountingMoney(b.amountDue)}</td><td><input data-payment-amount type="number" min="0.01" max="${(Number(b.amountDue)/100).toFixed(2)}" step="0.01" value="${(Number(b.amountDue)/100).toFixed(2)}" disabled></td></tr>`).join('')}</tbody></table></div><div class="acct-phase-form-foot"><strong id="accountingPaymentTotal">Total $0.00</strong><button class="acct-primary" data-payment-submit>Record online payment</button><span class="acct-form-status"></span></div></form>`;syncAccountingPaymentMethod(holder.querySelector('form'));}
  function syncAccountingPaymentMethod(form){if(!form)return;const isCheck=form.elements.paymentMethod.value==='check',checkField=form.querySelector('[data-payment-check]'),referenceField=form.querySelector('[data-payment-reference]'),checkInput=form.elements.checkNumber,referenceInput=form.elements.referenceNumber,submit=form.querySelector('[data-payment-submit]');checkField.hidden=!isCheck;referenceField.hidden=isCheck;checkInput.required=isCheck;referenceInput.required=!isCheck;submit.textContent=isCheck?'Create check':'Record payment';if(isCheck)loadNextAccountingCheckNumber(form.elements.bankAccountId.value);}
  async function loadNextAccountingCheckNumber(bankAccountId){const res=await fetch(accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankAccountId)}`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(res.ok&&document.getElementById('accountingCheckNumber'))document.getElementById('accountingCheckNumber').value=payload.settings?.nextCheckNumber||'';}
  async function showAccountingCheckSettings(){const holder=phaseDForm(),banks=accountingData.payables.bankAccounts||[];if(!holder||!banks.length){if(holder)holder.innerHTML=accountingEmpty('No bank account is ready','Add an Accounting bank account before configuring check stock.');return;}holder.innerHTML='<p class="sw-tool-loading">Loading check settings...</p>';const bankId=banks[0].id,res=await fetch(accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankId)}`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(!res.ok){holder.innerHTML=accountingEmpty('Check settings are unavailable',payload.message||payload.error||'Try again.');return;}const s=payload.settings;holder.innerHTML=`<form class="acct-phase-form" onsubmit="saveAccountingCheckSettings(event)"><input type="hidden" name="bankAccountId" value="${escapeAttr(bankId)}"><input type="hidden" name="expectedVersion" value="${Number(s.version)}"><div class="acct-list-head"><div><span class="acct-kicker">Check stock</span><h2>Printing settings</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Bank account<select name="bankAccountIdDisplay" disabled>${banks.map(b=>`<option ${b.id===bankId?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}</select></label><label>Next check number<input name="nextCheckNumber" type="number" min="1" step="1" value="${Number(s.nextCheckNumber)}" required></label><label>Check stock style<select name="checkStyle"><option value="top_check_two_stubs" ${s.checkStyle==='top_check_two_stubs'?'selected':''}>Top check + two stubs</option><option value="bottom_check_two_stubs" ${s.checkStyle==='bottom_check_two_stubs'?'selected':''}>Two stubs + bottom check</option><option value="check_only" ${s.checkStyle==='check_only'?'selected':''}>Check only</option></select></label><label>Payer name<input name="payerName" value="${escapeAttr(s.payerName||'')}" required></label><label class="acct-wide">Payer address<textarea name="payerAddress" rows="3" required>${escapeHtml(s.payerAddress||'')}</textarea></label><label>Primary signature line<input name="signatureLine1" value="${escapeAttr(s.signatureLine1||'Authorized signature')}"></label><label>Secondary signature line<input name="signatureLine2" value="${escapeAttr(s.signatureLine2||'')}"></label></div><div class="acct-phase-form-foot"><button class="acct-primary">Save check settings</button><span class="acct-form-status"></span></div></form>`;}
  async function saveAccountingCheckSettings(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),res=await fetch(accountingApi('/payables/check-settings'),{method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({bankAccountId:raw.bankAccountId,expectedVersion:Number(raw.expectedVersion),patch:{nextCheckNumber:Number(raw.nextCheckNumber),checkStyle:raw.checkStyle,payerName:raw.payerName,payerAddress:raw.payerAddress,signatureLine1:raw.signatureLine1,signatureLine2:raw.signatureLine2}})}),payload=await res.json().catch(()=>({}));form.querySelector('.acct-form-status').textContent=res.ok?'Check settings saved.':payload.message||payload.error||'Unable to save check settings.';}
  function syncAccountingPaymentSelection(box){const form=box.form,selected=Array.from(form.querySelectorAll('[data-payment-bill]:checked')),vendor=selected[0]?.dataset.vendor||'';form.querySelectorAll('[data-payment-bill]').forEach(input=>{input.disabled=Boolean(vendor&&input.dataset.vendor!==vendor&&!input.checked);input.closest('tr').querySelector('[data-payment-amount]').disabled=!input.checked;});const total=selected.reduce((sum,input)=>sum+Number(input.closest('tr').querySelector('[data-payment-amount]').value||0),0);document.getElementById('accountingPaymentTotal').textContent=`Total ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(total)}`;}
  async function createAccountingPayment(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),selected=Array.from(form.querySelectorAll('[data-payment-bill]:checked'));if(!selected.length){form.querySelector('.acct-form-status').textContent='Select at least one bill.';return;}const applications=selected.map(input=>({billId:input.value,amountApplied:Math.round(Number(input.closest('tr').querySelector('[data-payment-amount]').value)*100)})),vendorId=selected[0].dataset.vendor,payload=await accountingPhaseDRequest('/payables/payments',{vendorId,bankAccountId:raw.bankAccountId,paymentDate:raw.paymentDate,paymentMethod:raw.paymentMethod,referenceNumber:raw.referenceNumber,checkNumber:raw.checkNumber,memo:raw.memo,applications});if(!payload)return;if(raw.paymentMethod!=='check'){const posted=await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(payload.payment.id)}/post`,{expectedVersion:payload.payment.version,idempotencyKey:`online-${payload.payment.id}-${payload.payment.version}`});if(!posted)return;}accountingData.payables=null;await loadAccountingPhaseD();accountingPayablesView='payments';renderAccountingPane();}
  function showAccountingPaymentRunForm(){const holder=phaseDForm(),bills=(accountingData.payables.bills||[]).filter(b=>['posted','partially_paid'].includes(b.status)&&Number(b.amountDue)>0),banks=accountingData.payables.bankAccounts||[];if(!holder)return;if(!bills.length||!banks.length){holder.innerHTML=accountingEmpty('Payment-run setup is incomplete',!banks.length?'Add an Accounting bank account first.':'Post vendor bills before creating a payment run.');return;}holder.innerHTML=`<form class="acct-phase-form acct-payment-run-builder" onsubmit="createAccountingPaymentRun(event)"><div class="acct-list-head"><div><span class="acct-kicker">Batch check run</span><h2>Select vendors and open bills</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Bank account<select name="bankAccountId" required onchange="syncAccountingPaymentRun(this.form)">${banks.map(bank=>`<option value="${escapeAttr(bank.id)}">${escapeHtml(bank.name)}</option>`).join('')}</select></label><label>Run date<input name="runDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Memo<input name="memo" placeholder="Month-end vendor checks"></label></div><div class="acct-table-wrap"><table class="acct-table"><thead><tr><th></th><th>Vendor</th><th>Invoice</th><th>Due</th><th>Amount due</th><th>Pay now</th></tr></thead><tbody>${bills.map(bill=>`<tr><td><input type="checkbox" data-run-bill value="${escapeAttr(bill.id)}" data-vendor="${escapeAttr(bill.vendorId)}" onchange="syncAccountingPaymentRun(this.form)"></td><td><strong>${escapeHtml(bill.vendorName)}</strong></td><td>${escapeHtml(bill.vendorInvoiceNumber||bill.billNumber)}</td><td>${accountingDate(bill.dueDate)}</td><td>${accountingMoney(bill.amountDue)}</td><td><input data-run-amount type="number" min="0.01" max="${(Number(bill.amountDue)/100).toFixed(2)}" step="0.01" value="${(Number(bill.amountDue)/100).toFixed(2)}" disabled></td></tr>`).join('')}</tbody></table></div><section class="acct-run-review"><span class="acct-kicker">Review</span><strong data-run-range>Select bills to preview the reserved check range.</strong><small data-run-summary>No vendors selected.</small></section><div class="acct-phase-form-foot"><button class="acct-primary">Create reviewable draft</button><span class="acct-form-status"></span></div></form>`;syncAccountingPaymentRun(holder.querySelector('form'));}
  async function syncAccountingPaymentRun(form){if(!form)return;const selected=Array.from(form.querySelectorAll('[data-run-bill]:checked'));form.querySelectorAll('[data-run-bill]').forEach(input=>{input.closest('tr').querySelector('[data-run-amount]').disabled=!input.checked;});const vendors=new Set(selected.map(input=>input.dataset.vendor)),total=selected.reduce((sum,input)=>sum+Number(input.closest('tr').querySelector('[data-run-amount]').value||0),0),summary=form.querySelector('[data-run-summary]'),range=form.querySelector('[data-run-range]');summary.textContent=`${vendors.size} vendor${vendors.size===1?'':'s'} · ${selected.length} bill${selected.length===1?'':'s'} · ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(total)}`;if(!vendors.size){range.textContent='Select bills to preview the reserved check range.';return;}range.textContent='Loading check-number range…';const bankId=new FormData(form).get('bankAccountId'),res=await fetch(accountingApi(`/payables/check-settings?bankAccountId=${encodeURIComponent(bankId)}`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(!res.ok){range.textContent=payload.message||'Check range unavailable.';return;}const start=Number(payload.settings.nextCheckNumber),end=start+vendors.size-1;range.textContent=`Checks ${start}${end===start?'':`–${end}`} will be atomically reserved when this draft is created.`;}
  async function createAccountingPaymentRun(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),selected=Array.from(form.querySelectorAll('[data-run-bill]:checked'));if(!selected.length){form.querySelector('.acct-form-status').textContent='Select at least one bill.';return;}const grouped=new Map();for(const input of selected){const vendorId=input.dataset.vendor,applications=grouped.get(vendorId)||[];applications.push({billId:input.value,amountApplied:Math.round(Number(input.closest('tr').querySelector('[data-run-amount]').value)*100)});grouped.set(vendorId,applications);}const selections=[...grouped].map(([vendorId,applications])=>({vendorId,applications})),payload=await accountingPhaseDRequest('/payables/payment-runs',{bankAccountId:raw.bankAccountId,runDate:raw.runDate,memo:raw.memo,selections});if(payload){accountingData.payables=null;await loadAccountingPhaseD();accountingPayablesView='runs';renderAccountingPane();}}
  async function postAccountingPaymentRun(id,version){const payload=await accountingPhaseDRequest(`/payables/payment-runs/${encodeURIComponent(id)}/post`,{expectedVersion:version});if(!payload)return;if(!payload.detail.complete){const failed=(payload.detail.results||[]).filter(item=>!item.ok);alert(`${failed.length} payment${failed.length===1?'':'s'} could not be posted. Earlier successful posts were retained; correct the remaining items and retry.`);}accountingData.payables=null;await loadAccountingPhaseD();}
  async function printAccountingPaymentRun(id){const reason=prompt('Reprint reason (leave blank for an original run):')||'';const win=window.open('about:blank','_blank');if(!win){alert('Allow pop-ups to print the payment run.');return;}win.document.write('<p style="font:16px Arial;padding:32px">Preparing payment run…</p>');const payload=await accountingPhaseDRequest(`/payables/payment-runs/${encodeURIComponent(id)}/print`,{reason});if(!payload){win.close();return;}win.document.open();win.document.write(payload.print.html);win.document.close();accountingData.payables=null;await loadAccountingPhaseD();}
  async function loadAccounting1099Review(){const input=document.getElementById('accounting1099Year'),year=Number(input?.value||new Date().getUTCFullYear()),res=await fetch(accountingApi(`/payables/1099-summary?year=${encodeURIComponent(year)}`),{headers:authHeaders()}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error||'Unable to prepare 1099 review.');return;}accountingData.payables.tax1099=payload.report;renderAccountingPane();}
  async function downloadAccounting1099Review(){const year=document.getElementById('accounting1099Year')?.value||accountingData.payables.tax1099?.calendarYear||new Date().getUTCFullYear(),res=await fetch(accountingApi(`/payables/1099-summary.csv?year=${encodeURIComponent(year)}`),{headers:authHeaders()});if(!res.ok){const payload=await res.json().catch(()=>({}));alert(payload.message||payload.error||'Unable to export 1099 review.');return;}const url=URL.createObjectURL(await res.blob()),link=document.createElement('a');link.href=url;link.download=`agapay-1099-review-${year}.csv`;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);}
  async function accountingPhaseDRequest(path,body){const res=await fetch(accountingApi(path),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)}),payload=await res.json().catch(()=>({}));if(!res.ok){const status=document.querySelector('.acct-form-status');if(status)status.textContent=payload.message||payload.error;else alert(payload.message||payload.error);return null;}return payload;}
  async function printAccountingCheck(id,printCount){const reason=printCount?prompt('Reason for reprinting this check:'):'';if(printCount&&!reason)return;const win=window.open('about:blank','_blank');if(!win){alert('Allow pop-ups to print checks.');return;}win.document.write('<p style="font:16px Arial;padding:32px">Preparing check…</p>');const payload=await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/print`,{reason});if(!payload){win.close();return;}win.document.open();win.document.write(payload.html);win.document.close();accountingData.payables=null;await loadAccountingPhaseD();}
  async function postAccountingPayment(id,version){if(await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/post`,{expectedVersion:version,idempotencyKey:`check-${id}-${version}`})){accountingData.payables=null;await loadAccountingPhaseD();}}
  async function voidAccountingPayment(id,version){const reason=prompt('Reason for voiding this payment:');if(!reason)return;if(await accountingPhaseDRequest(`/payables/payments/${encodeURIComponent(id)}/void`,{expectedVersion:version,reason})){accountingData.payables=null;await loadAccountingPhaseD();}}
  async function accountingBillAction(id, action, version) {
    const body = { expectedVersion: version };
    if (action === 'post') body.idempotencyKey = `parish-ui-${id}-${version}`;
    await accountingPhaseDMutation(`/payables/bills/${encodeURIComponent(id)}/${action}`, body, `Bill ${action}ed.`);
  }
  function showAccountingBudgetForm() {
    const holder = phaseDForm(); if (!holder) return;
    holder.innerHTML = `<form class="acct-phase-form" onsubmit="createAccountingBudget(event)"><div class="acct-list-head"><div><span class="acct-kicker">Budget builder</span><h2>Create a budget version</h2></div><button type="button" class="acct-link" onclick="phaseDForm().innerHTML=''">Cancel</button></div><div class="acct-form-grid"><label>Budget name<input name="name" required placeholder="2027 Operating Budget"></label><label>Description<input name="description" placeholder="Parish council operating plan"></label></div><div class="acct-journal-lines-head"><span>Budget lines</span><span>Annual amounts are allocated evenly across twelve months.</span></div><div id="accountingBudgetDraftLines">${accountingBudgetLineTemplate()}</div><button type="button" class="acct-add-line" onclick="addAccountingBudgetLine()">+ Add budget line</button><div class="acct-phase-form-foot"><button class="acct-primary" type="submit">Create draft budget</button><span class="acct-form-status"></span></div></form>`;
  }
  function accountingBudgetLineTemplate() {
    const accounts = accountingData.accounts.filter((account) => ['revenue','expense'].includes(account.category)).map((account) => `<option value="${escapeAttr(account.id)}">${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const funds = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}">${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    return `<div class="acct-budget-line"><label>Account<select data-budget-account required><option value="">Choose account</option>${accounts}</select></label><label>Fund<select data-budget-fund required><option value="">Choose fund</option>${funds}</select></label><label>Annual amount<input data-budget-amount type="number" min="0" step="0.01" required></label><button type="button" class="acct-remove-line" onclick="this.closest('.acct-budget-line').remove()">×</button></div>`;
  }
  function addAccountingBudgetLine() { document.getElementById('accountingBudgetDraftLines')?.insertAdjacentHTML('beforeend', accountingBudgetLineTemplate()); }
  async function createAccountingBudget(event) {
    event.preventDefault(); const form = event.currentTarget, raw = Object.fromEntries(new FormData(form));
    const start = accountingData.setup?.currentFiscalYear?.startDate || `${new Date().getFullYear()}-01-01`;
    const lines = Array.from(form.querySelectorAll('.acct-budget-line')).map((row) => ({ accountId: row.querySelector('[data-budget-account]').value, fundId: row.querySelector('[data-budget-fund]').value, annualAmount: Math.round(Number(row.querySelector('[data-budget-amount]').value) * 100), allocationStrategy: 'even_monthly' }));
    await accountingPhaseDMutation('/budgets', { name: raw.name, description: raw.description, fiscalYearId: `fy_${start.slice(0,4)}`, lines }, 'Draft budget created.');
  }
  async function accountingBudgetAction(id, action, version) { await accountingPhaseDMutation(`/budgets/${encodeURIComponent(id)}/${action}`, { expectedVersion: version }, `Budget ${action}ed.`); }
  async function editAccountingBudgetLines(budgetId){const [res,comparisonRes]=await Promise.all([fetch(accountingApi(`/budgets/${encodeURIComponent(budgetId)}`),{headers:authHeaders()}),fetch(accountingApi(`/budgets/${encodeURIComponent(budgetId)}/pledge-comparison`),{headers:authHeaders()})]),payload=await res.json().catch(()=>({})),comparisonPayload=await comparisonRes.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error);return;}accountingBudgetEditor={budgetId,lines:payload.detail?.lines||[],pledgeComparison:comparisonRes.ok?comparisonPayload.comparison:{accountId:null}};renderAccountingPane();}
  async function updateAccountingBudgetLine(event,budgetId,lineId,expectedVersion){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),input={annualAmount:Math.round(Number(raw.annualAmount)*100),allocationStrategy:raw.allocationStrategy};const res=await fetch(accountingApi(`/budgets/${encodeURIComponent(budgetId)}/lines/${encodeURIComponent(lineId)}`),{method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({expectedVersion,input})}),payload=await res.json().catch(()=>({}));form.querySelector('.acct-form-status').textContent=res.ok?'Budget line saved.':payload.message||payload.error||'Unable to save budget line.';if(res.ok)await editAccountingBudgetLines(budgetId);}
  async function openAccountingBudgetVariance(id) {
    const res = await fetch(accountingApi(`/budgets/${encodeURIComponent(id)}/variance`), { headers: authHeaders() }); const payload = await res.json().catch(() => ({}));
    if (!res.ok) { alert(payload.message || payload.error || 'Unable to prepare budget variance.'); return; }
    accountingBudgetReport = payload.report; renderAccountingPane();
  }
  function closeAccountingBudgetReport() { accountingBudgetReport = null; renderAccountingPane(); }
  function downloadAccountingBudgetVariance(id) { downloadAccountingFile(accountingApi(`/budgets/${encodeURIComponent(id)}/variance.csv`), 'agapay-budget-variance.csv'); }
  async function openAccountingCouncilPacket(id) {
    const win = window.open('about:blank', '_blank'); if (!win) { alert('Allow pop-ups for AGAPAY to open the council packet.'); return; }
    const res = await fetch(accountingApi(`/budgets/${encodeURIComponent(id)}/council-packet`), { headers: authHeaders() }); const payload = await res.json().catch(() => ({}));
    if (!res.ok) { win.close(); alert(payload.message || payload.error || 'Unable to prepare the council packet.'); return; }
    const packet = payload.packet || {}, rows = [...(packet.revenue || []), ...(packet.expenses || [])];
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(packet.title || 'Parish Council Budget Packet')}</title><style>body{margin:40px;color:#061522;font:13px Arial,sans-serif}h1{font:32px Georgia,serif}h2{margin-top:28px;font:22px Georgia,serif}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #d9d5ca;text-align:left}button{padding:8px 12px}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(packet.title || 'Parish Council Budget Packet')}</h1><p>Generated ${accountingDate(packet.generatedAt)}</p><button onclick="print()">Print packet</button><h2>Executive summary</h2><p>Budget ${accountingMoney(packet.executiveSummary?.budget)} · Actual ${accountingMoney(packet.executiveSummary?.actual)} · Variance ${accountingMoney(packet.executiveSummary?.variance)}</p><h2>Budget detail</h2><table><thead><tr><th>Account</th><th>Budget</th><th>Actual</th><th>Variance</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.accountNumber)} ${escapeHtml(row.account)}</td><td>${accountingMoney(row.budget)}</td><td>${accountingMoney(row.actual)}</td><td>${accountingMoney(row.variance)}</td></tr>`).join('')}</tbody></table></body></html>`); win.document.close(); win.focus();
  }
  async function accountingPhaseDMutation(path, body, success) {
    const res = await fetch(accountingApi(path), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const payload = await res.json().catch(() => ({}));
    if (!res.ok) { const status = document.querySelector('.acct-form-status'); if (status) status.textContent = payload.message || payload.error || 'Unable to save.'; else alert(payload.message || payload.error || 'Unable to save.'); return; }
    accountingData.payables = null; accountingData.budgets = null; accountingBudgetReport = null; await loadAccountingPhaseD();
  }
  function journalLineTemplate(line = {}) {
    const accountOptions = accountingData.accounts.map((account) => `<option value="${escapeAttr(account.id)}" data-default-fund="${escapeAttr(account.defaultFundId || '')}" ${line.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.accountNumber)} · ${escapeHtml(account.name)}</option>`).join('');
    const fundOptions = accountingData.funds.map((fund) => `<option value="${escapeAttr(fund.id)}" ${line.fundId === fund.id ? 'selected' : ''}>${escapeHtml(fund.code)} · ${escapeHtml(fund.name)}</option>`).join('');
    return `<div class="acct-journal-line"><label>Account<select data-journal-account><option value="">Choose account</option>${accountOptions}</select></label><label>Fund<select data-journal-fund><option value="">Choose fund</option>${fundOptions}</select></label><label>Debit<input data-journal-debit inputmode="decimal" type="number" min="0" step="0.01" value="${line.debitAmount ? (line.debitAmount / 100).toFixed(2) : ''}" placeholder="0.00"></label><label>Credit<input data-journal-credit inputmode="decimal" type="number" min="0" step="0.01" value="${line.creditAmount ? (line.creditAmount / 100).toFixed(2) : ''}" placeholder="0.00"></label><button type="button" class="acct-remove-line" onclick="removeAccountingJournalLine(this)" aria-label="Remove line">×</button></div>`;
  }
  function renderAccountingJournalEditor(pane = document.getElementById('accountingPane')) {
    if (!pane || !accountingJournalEditor) return;
    const draft = accountingJournalEditor;
    pane.innerHTML = `<section class="acct-journal-editor"><div class="acct-list-head"><div><span class="acct-kicker">${draft.id ? 'Draft journal entry' : 'New journal entry'}</span><h2>${draft.id ? escapeHtml(draft.description || 'Untitled draft') : 'Record a balanced entry'}</h2></div><button type="button" class="acct-refresh" onclick="closeAccountingJournal()">Back to entries</button></div><div class="acct-journal-meta"><label>Entry date<input id="accountingJournalDate" type="date" value="${escapeAttr(draft.entryDate)}"></label><label>Description<input id="accountingJournalDescription" type="text" maxlength="240" value="${escapeAttr(draft.description || '')}" placeholder="Describe the transaction"></label></div><div class="acct-journal-lines-head"><span>Lines</span><span>Every debit must be matched by a credit.</span></div><div id="accountingJournalLines">${draft.lines.map(journalLineTemplate).join('')}</div><button type="button" class="acct-add-line" onclick="addAccountingJournalLine()">+ Add line</button><div class="acct-journal-foot"><div id="accountingJournalBalance" class="acct-balance"></div><div id="accountingJournalValidation" class="acct-validation"></div><div class="acct-journal-actions"><button type="button" class="acct-refresh" onclick="saveAccountingJournal(false)">Save draft</button><button type="button" class="acct-primary" onclick="saveAccountingJournal(true)">Validate entry</button></div></div></section>${draft.id?'<section class="acct-card"><div data-accounting-attachments></div></section>':''}`;
    updateAccountingJournalBalance();
    pane.querySelectorAll('.acct-journal-line').forEach(bindAccountingJournalLine);
    if (draft.id) renderAccountingAttachments('journal_entry', draft.id, pane.querySelector('[data-accounting-attachments]'));
  }
  function bindAccountingJournalLine(row) {
    row.querySelectorAll('[data-journal-debit],[data-journal-credit]').forEach((input) => input.addEventListener('input', updateAccountingJournalBalance));
    row.querySelector('[data-journal-account]')?.addEventListener('change', (event) => {
      const defaultFundId = event.target.selectedOptions[0]?.dataset.defaultFund || '';
      const fundSelect = row.querySelector('[data-journal-fund]');
      if (defaultFundId && fundSelect) fundSelect.value = defaultFundId;
    });
  }
  function newAccountingJournal() {
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    accountingJournalEditor = { id: '', version: 0, entryDate: new Date().toISOString().slice(0, 10), description: '', lines: [{ fundId: defaultFund?.id || '' }, { fundId: defaultFund?.id || '' }] };
    renderAccountingPane();
  }
  async function editAccountingJournal(id) {
    const res = await fetch(accountingApi(`/journals/${encodeURIComponent(id)}`), { headers: authHeaders() });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { alert(payload.message || payload.error || 'Unable to open this draft.'); return; }
    accountingJournalEditor = payload.entry;
    renderAccountingPane();
  }
  function closeAccountingJournal() { accountingJournalEditor = null; renderAccountingPane(); }
  function addAccountingJournalLine() {
    const holder = document.getElementById('accountingJournalLines');
    const defaultFund = accountingData.funds.find((fund) => Number(fund.isDefault)) || accountingData.funds[0];
    if (holder) holder.insertAdjacentHTML('beforeend', journalLineTemplate({ fundId: defaultFund?.id || '' }));
    const row = holder?.lastElementChild;
    if (row) bindAccountingJournalLine(row);
    updateAccountingJournalBalance();
  }
  function removeAccountingJournalLine(button) { button.closest('.acct-journal-line')?.remove(); updateAccountingJournalBalance(); }
  function collectAccountingJournal() {
    const cents = (value) => Math.round(Number(value || 0) * 100);
    const lines = Array.from(document.querySelectorAll('.acct-journal-line')).map((row) => ({ accountId: row.querySelector('[data-journal-account]').value, fundId: row.querySelector('[data-journal-fund]').value, debitAmount: cents(row.querySelector('[data-journal-debit]').value), creditAmount: cents(row.querySelector('[data-journal-credit]').value) }));
    return { entryDate: document.getElementById('accountingJournalDate').value, description: document.getElementById('accountingJournalDescription').value.trim(), lines };
  }
  function updateAccountingJournalBalance() {
    const balance = document.getElementById('accountingJournalBalance');
    if (!balance) return;
    const data = collectAccountingJournal();
    const debits = data.lines.reduce((sum, line) => sum + line.debitAmount, 0), credits = data.lines.reduce((sum, line) => sum + line.creditAmount, 0);
    balance.classList.toggle('balanced', debits > 0 && debits === credits);
    balance.innerHTML = `<span>Debits <strong>${accountingMoney(debits)}</strong></span><span>Credits <strong>${accountingMoney(credits)}</strong></span><span>${debits > 0 && debits === credits ? 'Balanced ✓' : `Difference ${accountingMoney(Math.abs(debits - credits))}`}</span>`;
  }
  async function saveAccountingJournal(validateAfter = false) {
    const data = collectAccountingJournal();
    const validation = document.getElementById('accountingJournalValidation');
    if (!data.entryDate || !data.description || data.lines.length < 2 || data.lines.some((line) => !line.accountId || !line.fundId || ((line.debitAmount > 0) === (line.creditAmount > 0)))) { validation.innerHTML = '<span class="error">Complete the date, description, and at least two debit or credit lines.</span>'; return; }
    const editing = Boolean(accountingJournalEditor.id);
    const res = await fetch(accountingApi(editing ? `/journals/${encodeURIComponent(accountingJournalEditor.id)}` : '/journals'), { method: editing ? 'PATCH' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(editing ? { ...data, expectedVersion: accountingJournalEditor.version } : { ...data, sourceType: 'manual' }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { validation.innerHTML = `<span class="error">${escapeHtml(payload.message || payload.error || 'Unable to save this draft.')}</span>`; return; }
    accountingJournalEditor = { ...accountingJournalEditor, ...payload.entry, ...data };
    if (!validateAfter) { validation.innerHTML = '<span class="success">Draft saved.</span>'; return; }
    await validateAccountingJournal();
  }
  async function validateAccountingJournal() {
    const draft = accountingJournalEditor;
    const res = await fetch(accountingApi(`/journals/${encodeURIComponent(draft.id)}/validate`), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: draft.version }) });
    const payload = await res.json().catch(() => ({}));
    const box = document.getElementById('accountingJournalValidation');
    if (!res.ok || !payload.validation?.ok) { const issues = payload.validation?.issues || [payload.message || 'Entry is not ready to post.']; box.innerHTML = `<span class="error">${issues.map((issue) => escapeHtml(String(issue).replaceAll('_', ' '))).join(' · ')}</span>`; return; }
    box.innerHTML = '<span class="success">Balanced and ready to post.</span><button type="button" class="acct-post" onclick="postAccountingJournal()">Post to ledger</button>';
  }
  async function postAccountingJournal() {
    const draft = accountingJournalEditor;
    const key = `parish-ui-${draft.id}-${draft.version}`;
    const res = await fetch(accountingApi(`/journals/${encodeURIComponent(draft.id)}/post`), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: draft.version, idempotencyKey: key, requestHash: key }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { document.getElementById('accountingJournalValidation').innerHTML = `<span class="error">${escapeHtml(payload.message || payload.error || 'Unable to post this entry.')}</span>`; return; }
    accountingJournalEditor = null;
    await loadAccountingTab(true);
    accountingView = 'journals'; renderAccountingPane();
  }
  async function reverseAccountingJournal(id){const reason=prompt('Reason for reversing this journal entry:');if(!reason)return;const entryDate=prompt('Reversal date (YYYY-MM-DD):',new Date().toISOString().slice(0,10));if(!entryDate)return;const key=`journal-reversal-ui-${id}-${Date.now()}`,res=await fetch(accountingApi(`/journals/${encodeURIComponent(id)}/reverse`),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({entryDate,reason,idempotencyKey:key,requestHash:key})}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error||'Unable to reverse journal entry.');return;}await loadAccountingTab(true);}
  async function voidAccountingJournal(id){const reason=prompt('Reason for voiding this journal draft:');if(!reason)return;const res=await fetch(accountingApi(`/journals/${encodeURIComponent(id)}/void`),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({reason})}),payload=await res.json().catch(()=>({}));if(!res.ok){alert(payload.message||payload.error||'Unable to void journal draft.');return;}await loadAccountingTab(true);}
  async function initializeAccounting() {
    const res = await fetch(accountingApi('/ledger/initialize'), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { alert(payload.message || payload.error || 'Unable to initialize Accounting.'); return; }
    loadAccountingTab(true);
  }
  async function validateAccountingLedgerFoundation(){const res=await fetch(accountingApi('/ledger/validate'),{headers:authHeaders()}),payload=await res.json().catch(()=>({})),box=document.getElementById('accountingLedgerValidation');if(!box)return;box.innerHTML=res.ok?`<div><strong>${payload.validation?.ok?'Healthy':'Review needed'}</strong><span>${(payload.validation?.issues||[]).map(issue=>escapeHtml(issue.replaceAll('_',' '))).join(' · ')||'All foundation checks passed.'}</span></div>`:`<div><strong>Validation failed</strong><span>${escapeHtml(payload.message||payload.error||'Unable to validate ledger.')}</span></div>`;}
  async function postAccountingOpeningBalances(event){event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form)),amount=Math.round(Number(raw.amount)*100),key=`opening-ui-${raw.effectiveDate}-${Date.now()}`,body={effectiveDate:raw.effectiveDate,description:raw.description,idempotencyKey:key,requestHash:key,lines:[{accountId:raw.debitAccountId,fundId:raw.fundId,debitAmount:amount},{accountId:raw.creditAccountId,fundId:raw.fundId,creditAmount:amount}]},res=await fetch(accountingApi('/ledger/opening-balances'),{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)}),payload=await res.json().catch(()=>({}));form.querySelector('.acct-form-status').textContent=res.ok?'Opening balances posted.':payload.message||payload.error||'Unable to post opening balances.';if(res.ok)await loadAccountingTab(true);}
  async function accountingMigrationRequest(path, body = null) {
    const response = await fetch(accountingApi(`/migration${path}`), {
      method: body === null ? 'GET' : 'POST',
      headers: body === null ? authHeaders() : { ...authHeaders(), 'Content-Type':'application/json' },
      body: body === null ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Migration request failed.');
    return payload;
  }
  async function openAccountingMigration() {
    try {
      const payload = await accountingMigrationRequest('/sessions');
      accountingMigration = {
        ...accountingMigration,
        active:true,
        sessions:payload.sessions || [],
        session:(payload.sessions || []).find((session) => session.status === 'in_progress') || null,
        step:(payload.sessions || []).some((session) => session.status === 'in_progress') ? 'chart' : 'source'
      };
      renderAccountingPane();
    } catch (error) {
      alert(error.message);
    }
  }
  function closeAccountingMigration() {
    accountingMigration = { active:false, session:null, sessions:[], step:'source', previews:{}, advanced:false };
    renderAccountingPane();
  }
  async function createAccountingMigrationSession(event) {
    event.preventDefault();
    const form=event.currentTarget,status=form.querySelector('.acct-form-status');
    status.textContent='Starting migration…';
    try {
      const payload=await accountingMigrationRequest('/sessions',{sourceSystem:new FormData(form).get('sourceSystem')});
      accountingMigration.session=payload.session;
      accountingMigration.sessions=[payload.session,...accountingMigration.sessions.filter((session)=>session.id!==payload.session.id)];
      accountingMigration.step='chart';
      renderAccountingPane();
    } catch(error) { status.textContent=error.message; }
  }
  async function resumeAccountingMigration(id) {
    try {
      const payload=await accountingMigrationRequest(`/sessions/${encodeURIComponent(id)}`);
      accountingMigration.session=payload.session;
      accountingMigration.step='chart';
      renderAccountingPane();
    } catch(error) { alert(error.message); }
  }
  function setAccountingMigrationStep(step) { accountingMigration.step=step; renderAccountingPane(); }
  function migrationStatus(value) { return String(value || 'not_started').replaceAll('_',' '); }
  function migrationCsvForm(kind, title, columns) {
    return `<form class="acct-phase-form" onsubmit="previewAccountingMigrationCsv(event,'${escapeAttr(kind)}')"><label>${escapeHtml(title)} CSV<input name="file" type="file" accept=".csv,text/csv" required></label><details><summary>Column names</summary><div class="acct-form-grid">${columns.map(([key,label,fallback])=>`<label>${escapeHtml(label)}<input name="column_${escapeAttr(key)}" value="${escapeAttr(fallback)}" required></label>`).join('')}</div></details><button class="acct-primary">Review CSV</button><span class="acct-form-status"></span></form>`;
  }
  async function previewAccountingMigrationCsv(event, kind) {
    event.preventDefault();
    const form=event.currentTarget,status=form.querySelector('.acct-form-status'),raw=Object.fromEntries(new FormData(form)),file=form.elements.file.files[0];
    status.textContent='Validating CSV…';
    try {
      const columnMap=Object.fromEntries(Object.entries(raw).filter(([key])=>key.startsWith('column_')).map(([key,value])=>[key.slice(7),value]));
      const paths={chart:'chart-of-accounts',vendors:'vendors',funds:'funds',opening:'opening-balance',history:'transaction-history'};
      const payload=await accountingMigrationRequest(`/${paths[kind]}/preview`,{filename:file.name,csv:await file.text(),columnMap,migrationSessionId:accountingMigration.session?.id});
      accountingMigration.previews[kind]=payload.preview;
      renderAccountingPane();
    } catch(error) { status.textContent=error.message; }
  }
  async function refreshAccountingMigrationSession() {
    if (!accountingMigration.session) return;
    const payload=await accountingMigrationRequest(`/sessions/${encodeURIComponent(accountingMigration.session.id)}`);
    accountingMigration.session=payload.session;
  }
  function migrationCommitBase(kind) {
    return {
      migrationSessionId:accountingMigration.session.id,
      acknowledgeExistingActivity:Boolean((kind === 'history'
        ? [...document.querySelectorAll('[id="migrationAcknowledgeExisting"]')].at(-1)
        : document.getElementById('migrationAcknowledgeExisting'))?.checked)
    };
  }
  async function commitAccountingMigrationStep(kind) {
    if(kind==='chart'&&!confirm('Confirm each mapped source account type and commit this chart of accounts?'))return;
    const status=document.querySelector('[data-migration-commit-status]');
    if(status)status.textContent='Committing reviewed data…';
    try {
      const preview=accountingMigration.previews[kind],base={...migrationCommitBase(kind),preview};
      let path,body=base,next='cutover';
      if(kind==='chart'){
        path='/chart-of-accounts/commit';
        body.typeMap=Object.fromEntries(Array.from(document.querySelectorAll('[data-migration-type]')).map((select)=>[select.dataset.migrationType,select.value]));
        next='vendors';
      } else if(kind==='vendors'){
        path='/vendors/commit'; next='funds';
      } else if(kind==='funds'){
        path='/funds/commit';
        body.mappings=preview.rows.filter((row)=>row.status==='matched').map((row)=>({sourceFundRef:row.sourceFundRef,agapayFundId:row.agapayFundId}));
        body.newFunds=preview.rows.filter((row)=>row.status==='unmatched').map((row)=>({
          sourceFundRef:row.sourceFundRef,
          displayName:document.querySelector(`[data-migration-fund-name="${CSS.escape(row.sourceFundRef)}"]`).value,
          restrictionType:document.querySelector(`[data-migration-fund-restriction="${CSS.escape(row.sourceFundRef)}"]`).value,
          donorRestricted:document.querySelector(`[data-migration-fund-donor="${CSS.escape(row.sourceFundRef)}"]`).checked,
          accountNumber:document.querySelector(`[data-migration-fund-number="${CSS.escape(row.sourceFundRef)}"]`).value
        }));
      } else if(kind==='opening'){
        path='/opening-balance/commit'; body.effectiveDate=document.getElementById('migrationOpeningDate').value;
      } else {
        path='/transaction-history/commit'; body.advancedOptIn=true; body.batchSize=200;
      }
      const payload=await accountingMigrationRequest(path,body);
      await refreshAccountingMigrationSession();
      if(kind==='history'&&!payload.progress?.complete){accountingMigration.previews.history=preview;if(status)status.textContent=`${payload.progress.processed} of ${payload.progress.total} entries posted. Run the next batch to continue.`;renderAccountingPane();return;}
      delete accountingMigration.previews[kind];
      accountingMigration.step=next;
      await loadAccountingTab(true);
      accountingMigration.active=true;
      renderAccountingPane();
    } catch(error) { if(status)status.textContent=error.message; else alert(error.message); }
  }
  function migrationPreviewErrors(preview) {
    return preview?.errors?.length ? `<div class="acct-empty error"><strong>${preview.errors.length} item${preview.errors.length===1?'':'s'} need attention</strong><span>${escapeHtml(preview.errors.slice(0,5).map((error)=>`${error.rowNumber?`Row ${error.rowNumber}: `:''}${error.code}`).join(' · '))}</span></div>` : '';
  }
  function renderAccountingMigrationWizard(pane) {
    const session=accountingMigration.session;
    if(!session){
      pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">Accounting setup</span><h2>Move to AGAPAY</h2><p>CSV-based migration keeps the transfer reviewable and avoids creating a permanent live connection to the old system.</p></div><button class="acct-refresh" onclick="closeAccountingMigration()">← Setup</button></div><div class="acct-setup-grid"><section class="acct-card acct-setup-lead"><h2>Choose the source system</h2><form class="acct-phase-form" onsubmit="createAccountingMigrationSession(event)"><label>Source<select name="sourceSystem"><option value="quickbooks">QuickBooks</option><option value="aplos">Aplos</option><option value="other">Other CSV export</option></select></label><button class="acct-primary">Start migration</button><span class="acct-form-status"></span></form></section>${accountingMigration.sessions.length?`<section class="acct-card"><h2>Previous sessions</h2>${accountingMigration.sessions.map((item)=>`<button class="acct-refresh" onclick="resumeAccountingMigration('${escapeAttr(item.id)}')">${escapeHtml(item.sourceSystem)} · ${escapeHtml(migrationStatus(item.status))}</button>`).join('')}</section>`:''}</div>`;
      return;
    }
    const steps=[['chart','Chart of accounts',session.chartOfAccountsStatus],['vendors','Vendors',session.vendorsStatus],['funds','Funds',session.fundMappingStatus],['cutover','Balances & history',session.openingBalanceStatus==='completed'?session.openingBalanceStatus:session.transactionHistoryStatus]];
    const nav=`<div class="acct-checklist">${steps.map(([key,label,status])=>`<button type="button" class="${accountingMigration.step===key?'active':''} ${status==='completed'?'complete':''}" onclick="setAccountingMigrationStep('${key}')"><i>${status==='completed'?'✓':'○'}</i><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(migrationStatus(status))}</small></span></button>`).join('')}</div>`;
    let content='';
    if(accountingMigration.step==='chart'){
      const preview=accountingMigration.previews.chart;
      content=`<section class="acct-card"><span class="acct-kicker">Step 1</span><h2>Chart of accounts</h2><p>AGAPAY links matching account numbers or normalized names and creates only the rest. Every source type must be explicitly confirmed.</p>${preview?`${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Account</th><th>Source type</th><th>Action</th></tr></thead><tbody>${preview.rows.map((row)=>`<tr><td>${escapeHtml(`${row.accountNumber} ${row.name}`)}</td><td>${escapeHtml(row.sourceType)}</td><td>${escapeHtml(row.action)}</td></tr>`).join('')}</tbody></table></div><div class="acct-form-grid">${preview.distinctSourceTypes.map((label)=>`<label>${escapeHtml(label)}<select data-migration-type="${escapeAttr(label)}" required><option value="">Confirm category</option>${['asset','liability','net_asset','revenue','expense'].map((category)=>`<option value="${category}" ${preview.suggestedTypeMap[label]===category?'selected':''}>${escapeHtml(category.replaceAll('_',' '))}</option>`).join('')}</select></label>`).join('')}</div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I reviewed existing posted activity and understand an import can double-count it.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('chart')" ${preview.invalidRows?'disabled':''}>Commit chart of accounts</button><span data-migration-commit-status></span>`:migrationCsvForm('chart','Chart of accounts',[['sourceRef','Source account ID','Account ID'],['accountNumber','Account number','Account Number'],['name','Account name','Account Name'],['type','Source account type','Account Type'],['description','Description','Description']])}</section>`;
    } else if(accountingMigration.step==='vendors'){
      const preview=accountingMigration.previews.vendors;
      content=`<section class="acct-card"><span class="acct-kicker">Step 2</span><h2>Vendors</h2><p>Likely duplicates are skipped by normalized display name. New vendors pass through the same validation as ordinary Payables entry.</p>${preview?`${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Vendor</th><th>Email</th><th>Action</th></tr></thead><tbody>${preview.rows.map((row)=>`<tr><td>${escapeHtml(row.displayName)}</td><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.action)}</td></tr>`).join('')}</tbody></table></div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('vendors')" ${preview.invalidRows?'disabled':''}>Commit vendors</button><span data-migration-commit-status></span>`:migrationCsvForm('vendors','Vendor list',[['displayName','Vendor name','Vendor Name'],['legalName','Legal name','Legal Name'],['email','Email','Email'],['phone','Phone','Phone'],['taxIdLast4','Tax ID last four','Tax ID Last 4'],['taxClassification','Tax classification','Tax Classification']])}</section>`;
    } else if(accountingMigration.step==='funds'){
      const preview=accountingMigration.previews.funds;
      content=`<section class="acct-card"><span class="acct-kicker">Step 3</span><h2>Fund mapping</h2><p>Matched funds are linked. New funds are created only through the real Funds &amp; Alms save, using the complete current catalog plus these additions.</p>${preview?`${migrationPreviewErrors(preview)}<div class="acct-table-wrap"><table class="acct-table"><thead><tr><th>Source fund</th><th>Decision</th></tr></thead><tbody>${preview.rows.map((row)=>`<tr><td>${escapeHtml(row.name)}</td><td>${row.status==='matched'?`Matched to ${escapeHtml(row.agapayFundId)}`:`<div class="acct-form-grid"><label>Name<input data-migration-fund-name="${escapeAttr(row.sourceFundRef)}" value="${escapeAttr(row.name)}"></label><label>Restriction<select data-migration-fund-restriction="${escapeAttr(row.sourceFundRef)}"><option value="">Confirm restriction</option><option value="unrestricted">Unrestricted</option><option value="board_designated">Board designated</option><option value="donor_restricted_temporary">Donor restricted — temporary</option><option value="donor_restricted_permanent">Donor restricted — permanent</option></select></label><label>Account number<input data-migration-fund-number="${escapeAttr(row.sourceFundRef)}"></label><label><input data-migration-fund-donor="${escapeAttr(row.sourceFundRef)}" type="checkbox"> Donor restricted</label></div>`}</td></tr>`).join('')}</tbody></table></div><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('funds')" ${preview.invalidRows?'disabled':''}>Save Funds &amp; Alms and commit mapping</button><span data-migration-commit-status></span>`:migrationCsvForm('funds','Class or fund list',[['sourceRef','Source fund ID','Fund ID'],['name','Fund name','Fund Name']])}</section>`;
    } else {
      const opening=accountingMigration.previews.opening,history=accountingMigration.previews.history;
      content=`<section class="acct-card acct-setup-lead"><span class="acct-kicker">Recommended cutover</span><h2><strong>Start clean with an opening balance</strong></h2><p>Export a trial balance as of the day before AGAPAY begins. An unbalanced file is stopped in preview before anything posts.</p>${opening?`${migrationPreviewErrors(opening)}<div class="acct-facts"><div><strong>${accountingMoney(opening.totalDebits)}</strong><span>Debits</span></div><div><strong>${accountingMoney(opening.totalCredits)}</strong><span>Credits</span></div><div><strong>${opening.balanced?'Balanced':'Not balanced'}</strong><span>Preview status</span></div></div><label>Effective date<input id="migrationOpeningDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label><input id="migrationAcknowledgeExisting" type="checkbox"> I acknowledge existing posted ledger activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('opening')" ${opening.eligibleToCommit?'':'disabled'}>Post opening balance</button><span data-migration-commit-status></span>`:migrationCsvForm('opening','Trial balance',[['accountRef','Account reference','Account'],['debit','Debit','Debit'],['credit','Credit','Credit'],['fundRef','Optional fund reference','Fund']])}</section><section class="acct-card"><details ${accountingMigration.advanced?'open':''} ontoggle="accountingMigration.advanced=this.open"><summary><strong>Import full transaction history (advanced)</strong></summary><p class="acct-report-disclaimer">This reconstructs general-ledger balances only. It does not reconstruct the accounts-payable subledger, bill aging, or linked bill/payment history. Enter open unpaid bills manually through Payables after cutover.</p>${history?`${migrationPreviewErrors(history)}<p><strong>Grouping:</strong> ${escapeHtml(history.groupingMethod)} — ${escapeHtml(history.groupingExplanation)}</p><p>${history.eligibleGroups} balanced entries are eligible.</p><label><input id="migrationAcknowledgeExisting" type="checkbox"> I understand the AP limitation and acknowledge existing posted activity, if any.</label><button class="acct-primary" onclick="commitAccountingMigrationStep('history')">Post next batch of up to 200</button><span data-migration-commit-status></span>`:migrationCsvForm('history','General ledger detail',[['date','Date','Date'],['accountRef','Account reference','Account'],['debit','Debit','Debit'],['credit','Credit','Credit'],['memo','Memo','Memo'],['description','Description','Description'],['fundRef','Optional fund/class','Fund'],['groupRef','Optional transaction ID','Transaction ID']])}</details></section>`;
    }
    pane.innerHTML=`<div class="acct-list-head"><div><span class="acct-kicker">${escapeHtml(session.sourceSystem)} migration</span><h2>Migration workspace</h2><p>Session ${escapeHtml(session.id)} · progress is saved after every committed step.</p></div><button class="acct-refresh" onclick="closeAccountingMigration()">← Setup</button></div><div class="acct-setup-grid"><aside class="acct-card">${nav}</aside><div>${content}</div></div>`;
  }
  async function saveAccountingSettings() {
    const settings = accountingData.setup?.settings;
    if (!settings) return;
    const patch = { fiscalYearStartMonth: Number(document.getElementById('accountingFiscalMonth').value), openingBalancesDisposition: document.getElementById('accountingOpeningDisposition').value, pledgeComparisonAccountId: document.getElementById('accountingPledgeComparisonAccount')?.value || null };
    const res = await fetch(accountingApi('/settings'), { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: settings.version, patch }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { alert(payload.message || payload.error || 'Unable to save Accounting settings.'); return; }
    loadAccountingTab(true);
  }
  function downloadAccountingReport() {
    if (accountingCustomReport) {
      if(accountingCustomReport.serverPath){const period=accountingReportPeriod(),priorStart=String(Number(period.start.slice(0,4))-1)+period.start.slice(4),priorEnd=String(Number(period.end.slice(0,4))-1)+period.end.slice(4),query=new URLSearchParams({from:period.start,to:period.end});if(accountingCustomReport.comparativeSupported&&accountingDepthComparative){query.set('priorFrom',priorStart);query.set('priorTo',priorEnd);}downloadAccountingFile(accountingApi(`/reports/${accountingCustomReport.serverPath}.csv?${query}`),`agapay-${accountingCustomReport.serverPath}.csv`);return;}
      const quote=(value)=>`"${String(value??'').replaceAll('"','""')}"`;
      const lines=[accountingCustomReport.columns.map((column)=>quote(column.label)).join(','),...accountingCustomReport.rows.map((row)=>accountingCustomReport.columns.map((column)=>quote(column.money?(Number(row[column.key]||0)/100).toFixed(2):row[column.key])).join(','))];
      downloadBlob(`agapay-${accountingReportView.replaceAll(/([A-Z])/g,'-$1').toLowerCase()}.csv`,new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
      return;
    }
    const paths = { trialBalance: 'trial-balance', activities: 'statement-of-activities', expenses: 'statement-of-activities', position: 'statement-of-financial-position' };
    downloadAccountingFile(accountingApi(`/reports/${paths[accountingReportView]}.csv`), `agapay-${paths[accountingReportView]}.csv`);
  }
  function printAccountingReport() {
    if (accountingCustomReport) {
      const report=accountingCustomReport,win=window.open('about:blank','_blank');
      if(!win){alert('Allow pop-ups for AGAPAY to open the printable report.');return;}
      const headings=report.columns.map((column)=>`<th>${escapeHtml(column.label)}</th>`).join('');
      const rows=report.rows.map((row)=>`<tr>${report.columns.map((column)=>`<td>${column.money?accountingMoney(row[column.key]):escapeHtml(row[column.key]??'')}</td>`).join('')}</tr>`).join('');
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{margin:40px;color:#061522;font:13px Arial,sans-serif}h1{font:32px Georgia,serif}p{color:#68716d}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #d9d5ca;text-align:left}th{font-size:10px;text-transform:uppercase}@media print{button{display:none}}</style></head><body><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle||'')}</p><button onclick="print()">Print</button><table><thead><tr>${headings}</tr></thead><tbody>${rows||`<tr><td colspan="${report.columns.length}">No posted activity.</td></tr>`}</tbody></table></body></html>`);win.document.close();win.focus();return;
    }
    const report = accountingData.reports[accountingReportView === 'expenses' ? 'activities' : accountingReportView];
    if (!report) return;
    const titles = { trialBalance: 'Trial Balance', activities: 'Statement of Activities', expenses: 'Expense Breakdown', position: 'Statement of Financial Position' };
    const win = window.open('about:blank', '_blank');
    if (!win) { alert('Allow pop-ups for AGAPAY to open the printable report.'); return; }
    const rows = (report.rows || []).map((row) => `<tr><td>${escapeHtml(row.accountNumber || '')}</td><td>${escapeHtml(row.accountName || row.name || '')}</td><td>${escapeHtml(row.category || row.accountType || '')}</td><td>${accountingMoney(row.amount ?? (Number(row.endingDebit || 0) - Number(row.endingCredit || 0)))}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titles[accountingReportView]}</title><style>body{margin:40px;color:#061522;font:13px Arial,sans-serif}h1{font:32px Georgia,serif}p{color:#68716d}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #d9d5ca;text-align:left}th{font-size:10px;text-transform:uppercase}@media print{button{display:none}}</style></head><body><h1>${titles[accountingReportView]}</h1><p>${escapeHtml(report.startDate || '')}${report.endDate ? ` through ${escapeHtml(report.endDate)}` : report.asOfDate ? `As of ${escapeHtml(report.asOfDate)}` : ''}</p><button onclick="print()">Print</button><table><thead><tr><th>Number</th><th>Account</th><th>Category</th><th>Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No posted activity.</td></tr>'}</tbody></table></body></html>`);
    win.document.close(); win.focus();
  }
  async function downloadAccountingFile(url, fallbackName) {
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error('The Accounting export is unavailable.');
      const blob = await res.blob();
      const match = (res.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/);
      downloadBlob(match?.[1] || fallbackName, blob);
    } catch (error) { alert(error.message || 'Unable to download this Accounting export.'); }
  }
  async function downloadAccountingLedger() {
    try {
      const res = await fetch(accountingApi('/exports/general-ledger.csv'), { headers: authHeaders() });
      if (!res.ok) throw new Error('The general ledger export is unavailable.');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      downloadBlob(match?.[1] || 'agapay-ledger.csv', blob);
    } catch (error) {
      alert(error.message || 'Unable to export the general ledger.');
    }
  }
  async function printAccountingLedger() {
    const win = window.open('about:blank', '_blank');
    if (!win) {
      alert('Allow pop-ups for AGAPAY to open the printable ledger.');
      return;
    }
    win.document.write('<!doctype html><title>Preparing ledger…</title><p style="font:16px system-ui;padding:32px;">Preparing your printable ledger…</p>');
    win.document.close();
    try {
      const res = await fetch(accountingApi('/print/general-ledger'), { headers: authHeaders() });
      const html = await res.text();
      if (!res.ok) throw new Error('The printable general ledger is unavailable.');
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch (error) {
      win.close();
      alert(error.message || 'Unable to open the printable ledger.');
    }
  }

  function directoryHouseholdLastName(name) {
    const normalized = String(name || '').trim().replace(/^the\s+/i, '').replace(/\s+(family|household)$/i, '');
    const parts = normalized.split(/\s+/).filter(Boolean);
    return parts.at(-1) || normalized || 'Household';
  }

  function directoryHouseholdSortKey(name) {
    return `${directoryHouseholdLastName(name).toLocaleLowerCase('en-US')}\u0000${String(name || '').toLocaleLowerCase('en-US')}`;
  }

  function directoryHouseholdInitials(name) {
    return `${directoryHouseholdLastName(name).charAt(0)}H`.toUpperCase();
  }

  function directoryCanonicalHouseholdRow(household, publishedMembers = [], skillListings = []) {
    const name = household.displayName || 'Household';
    const memberRows = publishedMembers.filter((row) =>
      String(row.household_id || row.householdId || '') === String(household.id || '') ||
      String(row.display_name || row.displayName || '') === String(name)
    );
    const uniqueMembers = [...new Map(memberRows.map((row) => [row.person_id || row.personId || row.preferred_name || row.preferredName, row])).values()];
    const count = Number(household.memberCount || uniqueMembers.length || 0);
    const householdSkills = skillListings.filter((item) => {
      const householdName = item.household?.displayName || item.person?.householdDisplayName || item.householdDisplayName || '';
      return String(householdName) === String(name);
    }).map((item) => item.displayLabel || item.skill?.name).filter(Boolean);
    const staffContact = household.staffContact || {};
    const address = staffContact.address || {};
    const city = [address.city, address.region].filter(Boolean).join(', ');
    const email = staffContact.email?.value || '';
    const phone = staffContact.phone?.value || '';
    const fullAddress = [
      address.line1,
      address.line2,
      [address.city, address.region, address.postalCode].filter(Boolean).join(' '),
      address.country && address.country !== 'US' ? address.country : ''
    ].filter(Boolean).join(', ');
    const initials = directoryHouseholdInitials(name);
    const memberMarkup = uniqueMembers.length ? uniqueMembers.slice(0, 5).map((member) => {
      const feast = String(member.feast_month_day || member.feastMonthDay || '');
      let nameday = '';
      if (/^\d{2}-\d{2}$/.test(feast)) {
        const [month, day] = feast.split('-').map(Number);
        nameday = new Intl.DateTimeFormat(undefined, { month:'long', day:'numeric', timeZone:'UTC' }).format(new Date(Date.UTC(2024, month - 1, day)));
      }
      const saint = member.saint_name || member.saintName || '';
      return `<div>${escapeHtml(member.preferred_name || member.preferredName || '')}${nameday || saint ? ` <span>— ${escapeHtml([nameday, saint].filter(Boolean).join(' – '))}</span>` : ''}</div>`;
    }).join('') : `<div>${count ? count + ' family member' + (count === 1 ? '' : 's') : 'No published members'}</div>`;
    const contactField = (label, value, visibility, addressField = false) => {
      const shared = visibility === 'directory_members';
      const sharingLabel = shared
        ? (addressField ? 'City and state are visible to parishioners; street address remains private' : 'Visible to parishioners in My AGAPAY')
        : 'Private from parishioners';
      return `<div class="pdx-dir-contact-field ${value ? '' : 'is-empty'} ${shared ? 'is-shared' : 'is-private'}" title="${escapeAttr(sharingLabel)}">
      <span class="pdx-dir-contact-eye" role="img" aria-label="${escapeAttr(sharingLabel)}">${shared
        ? '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.1 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
      }</span>
      <small>${escapeHtml(label)}</small><span>${escapeHtml(value || 'Not entered')}</span>
    </div>`;
    };
    const namedaySearch = memberRows.map((row) => {
      const feast = String(row.feast_month_day || '');
      if (!/^\d{2}-\d{2}$/.test(feast)) return '';
      return new Intl.DateTimeFormat(undefined, { month:'long', timeZone:'UTC' }).format(new Date(Date.UTC(2024, Number(feast.slice(0,2)) - 1, 1)));
    }).join(' ');
    return `<tr class="pdx-dir-table-row" data-namedays="${escapeAttr(namedaySearch)}" data-skills="${escapeAttr(householdSkills.join(' '))}">
      <td><div class="pdx-dir-table-household"><span class="pdx-dir-table-avatar">${escapeHtml(initials)}</span><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(city || `${count} member${count === 1 ? '' : 's'}`)}</span></div></div></td>
      <td><div class="pdx-dir-table-members">${memberMarkup}</div></td>
      <td><div class="pdx-dir-table-contacts">${contactField('Email', email, staffContact.email?.visibility)}${contactField('Phone', phone, staffContact.phone?.visibility)}${contactField('Address', fullAddress || city, address.visibility, true)}</div></td>
      <td><div class="pdx-dir-table-skills">${householdSkills.length ? householdSkills.slice(0, 3).map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') : '<small>No published skills</small>'}</div></td>
    </tr>`;
  }

  function filterCanonicalDirectoryRows() {
    const month = document.getElementById('directoryNamedayFilter')?.value || '';
    const skill = document.getElementById('directorySkillFilter')?.value || '';
    document.querySelectorAll('#directoryBrowseList .pdx-dir-table-row').forEach((row) => {
      row.hidden = Boolean((month && !row.dataset.namedays.includes(month)) || (skill && !row.dataset.skills.includes(skill)));
    });
  }

  function directoryEmptyState(title, subtitle) {
    return `<div class="pdx-dir-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>`;
  }

  function directoryPriorityBadgeClass(priority) {
    const value = String(priority || '').toLowerCase();
    if (value === 'urgent') return 'urgent';
    if (value === 'high') return 'high';
    return '';
  }

  function directoryQueueRow(item) {
    const actions = Array.isArray(item.permittedActions) ? item.permittedActions : [];
    const sourceType = escapeAttr(item.sourceType);
    const sourceId = escapeAttr(item.sourceId);
    return `<div class="pdx-dir-row pdx-dir-queue-row" onclick="openDirectoryReview('${sourceType}','${sourceId}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDirectoryReview('${sourceType}','${sourceId}');}">
      <div class="pdx-dir-row-copy">
        <div class="pdx-dir-row-title">${escapeHtml(item.summary || item.reviewType)}</div>
        <div class="pdx-dir-row-meta">${escapeHtml(item.targetLabel || 'Directory record')} · ${escapeHtml(item.requesterLabel || 'Directory user')}</div>
      </div>
      <div class="pdx-dir-row-side">
        <span class="pdx-dir-badge ${directoryPriorityBadgeClass(item.priority)}">${escapeHtml(item.priority || 'normal')}</span>
        <button class="pdx-dir-action-btn" type="button" onclick="event.stopPropagation();openDirectoryReview('${sourceType}','${sourceId}')">${actions.includes('approve') ? 'Review' : 'Open'}</button>
      </div>
    </div>`;
  }

  function directoryDetailList(items, emptyTitle, emptyCopy, mapFn) {
    if (!Array.isArray(items) || !items.length) return directoryEmptyState(emptyTitle, emptyCopy);
    return `<div class="pdx-dir-detail-list">${items.map(mapFn).join('')}</div>`;
  }

  function directoryDetailTarget() {
    const tools = document.querySelector('[data-dir-panel="tools"]');
    return tools && !tools.hidden
      ? document.getElementById('directoryManagementDetail')
      : document.getElementById('directoryRecordDetail');
  }

  function directoryRecordDetailShell(kicker, title, subtitle, body, targetId = 'directoryRecordDetail') {
    return `
      <article class="pdx-dir-review-card pdx-dir-record-card">
        <div class="pdx-dir-review-top">
          <div class="pdx-dir-review-title-block">
            <span class="pdx-dir-review-kicker">${escapeHtml(kicker)}</span>
            <h2>${escapeHtml(title || 'Directory record')}</h2>
            <p>${escapeHtml(subtitle || '')}</p>
          </div>
          <button class="pdx-dir-close-btn" type="button" onclick="document.getElementById('${escapeAttr(targetId)}').innerHTML=''">Close</button>
        </div>
        ${body}
      </article>`;
  }
  async function hydrateDirectoryAdminImages(root = document) {
    const images = Array.from(root.querySelectorAll('img[data-directory-admin-src]:not([data-directory-admin-loaded])'));
    await Promise.all(images.map(async (img) => {
      img.dataset.directoryAdminLoaded = '1';
      try {
        const res = await fetch(img.dataset.directoryAdminSrc, { headers: authHeaders() });
        if (!res.ok) throw new Error('Photo unavailable');
        const blob = await res.blob();
        const previous = img.dataset.objectUrl || '';
        if (previous) URL.revokeObjectURL(previous);
        const objectUrl = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
      } catch {
        img.replaceWith(directoryPhotoPlaceholderElement('No photo'));
      }
    }));
  }
  function directoryPhotoPlaceholderElement(label) {
    const span = document.createElement('span');
    span.className = 'pdx-dir-thumb pdx-dir-thumb-placeholder';
    span.textContent = label || 'No photo';
    return span;
  }
  function directoryAdminPhotoImg(photo, className = 'pdx-dir-thumb', alt = 'Family photo') {
    return photo?.url
      ? `<img class="${className}" data-directory-admin-src="${escapeAttr(photo.url)}" alt="${escapeAttr(alt)}" />`
      : `<span class="${className} pdx-dir-thumb-placeholder">No photo</span>`;
  }
  function directoryHouseholdPhotoCard(photo) {
    if (!photo) {
      return `<section class="pdx-dir-review-column"><h4>Family photo</h4><div class="pdx-dir-empty"><strong>No family photo uploaded</strong><span>When a household uploads one in My AGAPAY, it will appear here for staff review and context.</span></div></section>`;
    }
    const status = photo.lifecycleStatus === 'approved' ? 'Approved' : photo.lifecycleStatus === 'pending_approval' ? 'Waiting on review' : 'Uploaded, not submitted';
    return `<section class="pdx-dir-review-column"><h4>Family photo</h4><div class="pdx-dir-photo-card">
      ${directoryAdminPhotoImg(photo, 'pdx-dir-photo-preview', 'Uploaded family photo')}
      <div><strong>${escapeHtml(status)}</strong><p>${escapeHtml((photo.visibility || 'private').replace(/_/g, ' '))} · ${escapeHtml(photo.processingStatus || 'processing status unavailable')}. This is the photo the family uploaded from My AGAPAY.</p></div>
    </div></section>`;
  }

  function directorySubmittedPhotoReview(photo) {
    if (!photo) return `<section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Submitted photo</h4>${directoryEmptyState('Photo unavailable', 'The submitted media record could not be loaded. Return this item rather than approving it without seeing the photo.')}</section>`;
    const ownerLabel = photo.ownerType === 'household' ? 'Household photo' : 'Individual photo';
    const visibility = String(photo.visibility || 'private').replace(/_/g, ' ');
    return `<section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Submitted photo</h4><div class="pdx-dir-photo-card">
      ${directoryAdminPhotoImg(photo, 'pdx-dir-photo-preview', 'Photo submitted for parish directory review')}
      <div>
        <strong>${escapeHtml(ownerLabel)}</strong>
        <p>This is the exact photo submitted from My AGAPAY.</p>
        <div class="pdx-dir-review-field"><span>Visible to</span><strong>${escapeHtml(visibility)}</strong></div>
        <div class="pdx-dir-review-field"><span>Ready to publish</span><strong>${photo.publicationEligible ? 'Yes' : 'No'}</strong></div>
        <div class="pdx-dir-review-field"><span>Processing</span><strong>${escapeHtml(photo.processingStatus || 'Unknown')}</strong></div>
      </div>
    </div></section>`;
  }

  async function openDirectoryPerson(personId) {
    const detail = directoryDetailTarget();
    if (!detail || !personId) return;
    detail.innerHTML = '<p class="sw-tool-loading">Opening person record...</p>';
    try {
      const res = await fetch(directoryAdminApi('/people/' + encodeURIComponent(personId)), { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Unable to open person record.');
      const record = payload.person || {};
      const person = record.person || {};
      const access = record.accountAccess || {};
      const invitation = access.activeInvitation || null;
      const household = (record.households || [])[0] || {};
      const accessPanel = access.child
        ? `<div class="pdx-dir-empty"><strong>Managed through the family account</strong><span>Children do not need a separate My AGAPAY account.</span></div>`
        : access.linked
          ? `<div class="pdx-dir-empty"><strong>Family account manager</strong><span>This adult’s My AGAPAY account manages the household directory entry and family tax documents.</span></div>`
          : access.householdManaged
            ? `<div class="pdx-dir-empty"><strong>Managed through the family account</strong><span>This adult does not need a separate My AGAPAY login or invitation. The linked family account manages this household.</span></div>${invitation ? `<div class="pdx-dir-actions"><button class="pdx-dir-action-btn" type="button" onclick="revokeDirectoryAccountInvitation('${escapeAttr(invitation.id)}','${escapeAttr(person.id)}')">Revoke old invitation</button></div>` : ''}`
          : invitation
            ? `<div class="pdx-dir-detail-chip"><strong>Invitation ${escapeHtml(invitation.status)}</strong><span>${escapeHtml(invitation.recipientEmail || '')} · expires ${escapeHtml(new Date(invitation.expiresAt).toLocaleDateString())}</span></div>
               <div class="pdx-dir-actions"><button class="pdx-dir-action-btn" type="button" onclick="resendDirectoryAccountInvitation('${escapeAttr(invitation.id)}','${escapeAttr(person.id)}')">Resend invitation</button><button class="pdx-dir-action-btn" type="button" onclick="revokeDirectoryAccountInvitation('${escapeAttr(invitation.id)}','${escapeAttr(person.id)}')">Revoke</button></div>`
            : `<form class="pdx-dir-actions" onsubmit="sendDirectoryAccountInvitation(event,'${escapeAttr(person.id)}','${escapeAttr(household.id || '')}')">
                 <label style="flex:1;min-width:220px">Adult email<input name="email" type="email" autocomplete="email" required placeholder="name@example.com" /></label>
                 <button class="pdx-dir-action-btn" type="submit">Send My AGAPAY invitation</button>
               </form><p class="section-note">The secure link connects this adult to their directory record${household.id ? ' and makes them a household administrator' : ''}.</p>`;
      detail.innerHTML = directoryRecordDetailShell('Person record', person.preferredName || person.legalName || 'Directory person', 'Use this detail view to understand why a member may or may not be able to manage their Directory information.', `
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column"><h4>Status</h4>
            ${directoryReviewObjectRows({
              preferredName: person.preferredName,
              legalName: person.legalName,
              active: person.active,
              publication: record.publication?.status || 'not configured',
              approval: record.publication?.approval_status || record.publication?.approvalStatus || 'not submitted'
            })}
          </section>
          <section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Households</h4>
            ${directoryDetailList(record.households, 'No household links', 'Link this person to a household before family tools feel complete.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.display_name || item.displayName || item.id)}</strong><span>${escapeHtml(item.relationship || 'member')}</span></div>`)}
          </section>
        </div>
        <section class="pdx-dir-review-column"><h4>My AGAPAY access</h4>${accessPanel}<div id="directoryInvitationResult"></div></section>
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column"><h4>Contacts</h4>
            ${directoryDetailList(record.contacts, 'No contacts', 'No staff-visible contact method is attached to this person.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.label || item.contact_type || item.contactType)}</strong><span>${escapeHtml(item.value || '')} · ${escapeHtml(item.visibility || '')}</span></div>`)}
          </section>
          <section class="pdx-dir-review-column"><h4>Notes</h4>
            ${directoryDetailList(record.notes, 'No notes', 'No internal notes are attached to this person.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.title || item.noteType || 'Note')}</strong><span>${escapeHtml(item.body || item.note || item.summary || '')}</span></div>`)}
          </section>
        </div>`, detail.id);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      detail.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to open this person record.')}</p>`;
    }
  }

  async function openDirectoryHousehold(householdId) {
    const detail = directoryDetailTarget();
    if (!detail || !householdId) return;
    detail.innerHTML = '<p class="sw-tool-loading">Opening household record...</p>';
    try {
      const res = await fetch(directoryAdminApi('/households/' + encodeURIComponent(householdId)), { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Unable to open household record.');
      const record = payload.household || {};
      const household = record.household || {};
      const contactRows = (record.contacts || []).map((item) => {
        const shared = item.visibility === 'directory_members';
        return `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.personName || 'Household')} · ${escapeHtml(item.label || item.contactType || 'Contact')}</strong><span>${escapeHtml(item.value || '')} · ${shared ? 'visible in My AGAPAY directory' : 'private from parishioners'}</span></div>`;
      });
      const addressRows = (record.addresses || []).map((item) => {
        const fullAddress = [item.line1, item.line2, [item.city, item.region, item.postalCode].filter(Boolean).join(' '), item.country && item.country !== 'US' ? item.country : ''].filter(Boolean).join(', ');
        const shared = item.visibility === 'directory_members';
        return `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.primary ? 'Primary household address' : item.addressType || 'Household address')}</strong><span>${escapeHtml(fullAddress || 'Not entered')} · ${shared ? 'city/state visible in My AGAPAY; street private' : 'private from parishioners'}</span></div>`;
      });
      detail.innerHTML = directoryRecordDetailShell('Household record', household.displayName || 'Directory household', 'This is the family container parishioners expect to edit from My AGAPAY.', `
        <div class="pdx-dir-review-grid">
          ${directoryHouseholdPhotoCard(record.photo)}
          <section class="pdx-dir-review-column"><h4>Status</h4>
            ${directoryReviewObjectRows({
              householdName: household.displayName,
              active: household.active,
              myAGAPAYAccess: record.accountManaged ? 'Managed by one family account' : 'Needs one family account manager',
              publication: record.publication?.status || 'not configured',
              approval: record.publication?.approval_status || record.publication?.approvalStatus || 'not submitted'
            })}
          </section>
        </div>
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Household admins</h4>
            ${directoryDetailList(record.administrators, 'No household admin', 'One adult should manage the family through the household’s My AGAPAY account.', (item) => `<button type="button" class="pdx-dir-detail-chip" onclick="openDirectoryPerson('${escapeAttr(item.id)}')"><strong>${escapeHtml(item.preferred_name || item.preferredName || item.id)}</strong><span>${item.accountLinked ? 'Family account manager' : record.accountManaged ? 'Managed through family account' : 'Household admin · account not linked'}</span></button>`)}
          </section>
        </div>
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column"><h4>Complete contact information</h4>
            ${directoryDetailList([...contactRows, ...addressRows], 'No contact information', 'Phone, email, and address will populate from the family account settings.', (item) => item)}
            <p class="pdx-dir-staff-contact-note">Staff-only view. Full street addresses are never published in the donor-side directory.</p>
          </section>
          <section class="pdx-dir-review-column"><h4>Members</h4>
            ${directoryDetailList(record.members, 'No members', 'Add household members before children, family photos, or household publication makes sense.', (item) => `<button type="button" class="pdx-dir-detail-chip" onclick="openDirectoryPerson('${escapeAttr(item.id)}')"><strong>${escapeHtml(item.preferred_name || item.preferredName || item.id)}</strong><span>${escapeHtml(item.relationship || 'member')} · ${item.accountLinked ? 'family account manager' : record.accountManaged ? 'managed through family account' : item.child ? 'managed through household' : 'family needs an account manager'}</span></button>`)}
          </section>
          <section class="pdx-dir-review-column"><h4>Notes</h4>
            ${directoryDetailList(record.notes, 'No notes', 'No internal notes are attached to this household.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.title || item.noteType || 'Note')}</strong><span>${escapeHtml(item.body || item.note || item.summary || '')}</span></div>`)}
          </section>
        </div>`, detail.id);
      hydrateDirectoryAdminImages(detail);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      detail.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to open this household record.')}</p>`;
    }
  }

  function directoryReviewValue(value) {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.map(directoryReviewValue).join(', ') : 'None';
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([key, item]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
          return label + ': ' + directoryReviewValue(item);
        })
        .join('\n') || 'Not set';
    }
    return String(value);
  }

  function directoryReviewObjectRows(obj) {
    if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) return '<div class="pdx-dir-empty"><strong>No proposed fields</strong><span>This item may only need status approval.</span></div>';
    return Object.entries(obj).filter(([key]) => !['publicationPreferences', 'source'].includes(key)).map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      return `<div class="pdx-dir-review-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(directoryReviewValue(value))}</strong></div>`;
    }).join('') || '<div class="pdx-dir-empty"><strong>No separate field changes</strong><span>Review the sharing choices for publication approval.</span></div>';
  }

  function directoryReviewPrefs(preferences) {
    if (!preferences || typeof preferences !== 'object') return '';
    const labels = { adultPreferredName: 'Name', adultEmail: 'Email', adultPhone: 'Phone', householdAddress: 'Address', personPhoto: 'Photo' };
    const anyPublished = Object.values(preferences).some(pref => pref?.visibility === 'directory_members' && pref?.publicationEligible);
    return `<div class="pdx-dir-review-prefs">
      <div class="pdx-dir-review-prefs-head">
        <strong>${anyPublished ? 'Approval will publish selected fields' : 'Parishioner sharing choices'}</strong>
        <span>${anyPublished ? 'Directory-visible after approval' : 'Nothing public unless the member requested it'}</span>
      </div>
      <div class="pdx-dir-pref-chip-list">
      ${Object.entries(preferences).map(([key, pref]) => {
        const visibility = pref?.visibility || 'private';
        const eligible = pref?.publicationEligible;
        const chipClass = visibility === 'directory_members' && eligible ? 'publish' : (visibility === 'private' ? 'private' : '');
        return `<span class="pdx-dir-pref-chip ${chipClass}"><b>${escapeHtml(labels[key] || key)}</b><small>${escapeHtml(visibility.replace(/_/g, ' '))}${eligible ? ' · requested' : ''}</small></span>`;
      }).join('')}
      </div>
      ${anyPublished ? '<em>Approving this item publishes only the fields marked for directory members.</em>' : ''}
    </div>`;
  }

  function directoryReviewMeta(item) {
    const parts = [
      item.reviewType ? statusLabel(item.reviewType) : '',
      item.requesterLabel ? 'Submitted by ' + item.requesterLabel : '',
      item.priority ? statusLabel(item.priority) + ' priority' : ''
    ].filter(Boolean);
    return parts.join(' · ');
  }

  async function openDirectoryReview(sourceType, sourceId) {
    const detail = document.getElementById('directoryReviewDetail');
    if (!detail || !sourceType || !sourceId) return;
    detail.innerHTML = '<p class="sw-tool-loading">Opening review item...</p>';
    try {
      const res = await fetch(directoryAdminApi('/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId)), { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Unable to open review item.');
      const review = payload.review || {};
      const item = review.item || {};
      const proposed = review.proposed || {};
      const submittedPhoto = review.media || proposed.photo || null;
      const actions = Array.isArray(item.permittedActions) ? item.permittedActions : [];
      detail.innerHTML = `
        <article class="pdx-dir-review-card">
          <div class="pdx-dir-review-top">
            <div class="pdx-dir-review-title-block">
              <span class="pdx-dir-review-kicker">Directory review</span>
              <h2>${escapeHtml(item.targetLabel || item.summary || 'Directory item')}</h2>
              <p>${escapeHtml(item.summary || 'Review the submitted member information and publication choices before approving.')}</p>
              <div class="pdx-dir-review-meta">${escapeHtml(directoryReviewMeta(item))}</div>
            </div>
            <div class="pdx-dir-review-top-actions">
              ${['person', 'household'].includes(item.targetType) && item.targetId ? `<button class="pdx-dir-action-btn" type="button" onclick="${item.targetType === 'household' ? 'openDirectoryHousehold' : 'openDirectoryPerson'}('${escapeAttr(item.targetId)}')">View full record</button>` : ''}
              <button class="pdx-dir-close-btn" type="button" onclick="document.getElementById('directoryReviewDetail').innerHTML=''">Close</button>
            </div>
          </div>
          ${directoryReviewPrefs(proposed.publicationPreferences)}
          ${submittedPhoto
            ? `<div class="pdx-dir-review-grid pdx-dir-review-grid-photo">${directorySubmittedPhotoReview(submittedPhoto)}</div>`
            : `<div class="pdx-dir-review-grid">
                <section class="pdx-dir-review-column"><h4>Current record</h4>${directoryReviewObjectRows(review.current || {})}</section>
                <section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Submitted changes</h4>${directoryReviewObjectRows(proposed)}</section>
              </div>`}
          ${actions.includes('approve') ? `
            <label class="pdx-dir-review-note"><span>Reviewer note</span><textarea id="directoryReviewNote" rows="2" placeholder="Optional note"></textarea></label>
            <div class="pdx-dir-review-actions">
              <button class="pdx-dir-action-btn pdx-dir-action-primary" type="button" data-review-decision="approve" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','approve', this)">Approve</button>
              <button class="pdx-dir-action-btn" type="button" data-review-decision="return" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','return', this)">Return for Changes</button>
              <button class="pdx-dir-action-btn pdx-dir-action-danger" type="button" data-review-decision="deny" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','deny', this)">Deny</button>
            </div>` : `<p class="section-note">This account can view the item, but it cannot approve it. Use a parish dashboard session or another staff reviewer with directory review permissions.</p>`}
        </article>`;
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hydrateDirectoryAdminImages(detail);
      await fetch(directoryAdminApi('/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId) + '/begin'), { method: 'POST', headers: authHeaders() }).catch(() => null);
    } catch (err) {
      detail.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to open this review item.')}</p>`;
    }
  }

  async function decideDirectoryReview(sourceType, sourceId, decision, button) {
    const note = document.getElementById('directoryReviewNote')?.value || '';
    const buttons = Array.from(document.querySelectorAll('[data-review-decision]'));
    buttons.forEach(btn => btn.disabled = true);
    const originalText = button?.textContent;
    if (button) button.textContent = decision === 'approve' ? 'Approving...' : 'Saving...';
    try {
      const res = await fetch(directoryAdminApi('/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId) + '/decision'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewerNote: note })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Review decision failed.');
      setStatus(decision === 'approve' ? 'Directory item approved.' : 'Directory item updated.', 'success');
      const detail = document.getElementById('directoryReviewDetail');
      if (detail) detail.innerHTML = '';
      await loadDirectoryAdminTab(true);
    } catch (err) {
      buttons.forEach(btn => btn.disabled = false);
      if (button && originalText) button.textContent = originalText;
      alert(err.message || 'Unable to save this review decision.');
    }
  }

  async function directoryInvitationMutation(path, body = {}) {
    const res = await fetch(directoryAdminApi(path), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Unable to update this invitation.');
    return payload;
  }

  async function sendDirectoryAccountInvitation(event, personId, householdId) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const email = String(new FormData(form).get('email') || '').trim();
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }
    try {
      const payload = await directoryInvitationMutation('/invitations', { personId, householdId, email });
      const result = document.getElementById('directoryInvitationResult');
      if (result) result.innerHTML = `<div class="pdx-dir-empty"><strong>${payload.delivery === 'sent' ? 'Invitation emailed' : 'Invitation created'}</strong><span>${payload.delivery === 'sent' ? 'The adult can use the secure link in their email.' : 'Email delivery is not configured. Copy this secure link and send it only to the intended adult.'}</span>${payload.delivery === 'sent' ? '' : `<button class="pdx-dir-action-btn" type="button" data-invitation-url="${escapeAttr(payload.invitationUrl || '')}" onclick="copyDirectoryInvitationLink(this)">Copy secure link</button>`}</div>`;
      setStatus(payload.delivery === 'sent' ? 'My AGAPAY invitation sent.' : 'Invitation created; copy the secure link.', payload.delivery === 'sent' ? 'success' : '');
      window.setTimeout(() => openDirectoryPerson(personId), 900);
    } catch (error) {
      setStatus(error.message || 'Unable to send invitation.', 'error');
      if (button) { button.disabled = false; button.textContent = 'Send My AGAPAY invitation'; }
    }
  }

  async function copyDirectoryInvitationLink(button) {
    const url = button?.dataset?.invitationUrl || '';
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setStatus('Secure invitation link copied.', 'success');
  }

  async function resendDirectoryAccountInvitation(invitationId, personId) {
    try {
      const payload = await directoryInvitationMutation('/invitations/' + encodeURIComponent(invitationId) + '/resend');
      if (payload.delivery !== 'sent' && payload.invitationUrl) {
        await navigator.clipboard.writeText(payload.invitationUrl).catch(() => {});
      }
      setStatus(payload.delivery === 'sent' ? 'Invitation resent.' : 'New secure link copied.', 'success');
      await openDirectoryPerson(personId);
    } catch (error) {
      setStatus(error.message || 'Unable to resend invitation.', 'error');
    }
  }

  async function revokeDirectoryAccountInvitation(invitationId, personId) {
    if (!confirm('Revoke this directory invitation? Its secure link will stop working.')) return;
    try {
      await directoryInvitationMutation('/invitations/' + encodeURIComponent(invitationId) + '/revoke');
      setStatus('Invitation revoked.', 'success');
      await openDirectoryPerson(personId);
    } catch (error) {
      setStatus(error.message || 'Unable to revoke invitation.', 'error');
    }
  }

  function directoryPersonRow(person) {
    const pending = person.pendingRequestCount || 0;
    const accessLabel = person.child
      ? 'Managed through family account'
      : person.claimed
        ? 'Family account manager'
        : person.householdManaged
          ? 'Managed through family account'
          : 'Family needs a My AGAPAY manager';
    return `<div class="pdx-dir-row pdx-dir-record-row" onclick="openDirectoryPerson('${escapeAttr(person.id)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDirectoryPerson('${escapeAttr(person.id)}');}">
      <div class="pdx-dir-row-media">
        ${directoryAdminPhotoImg(person.photo, 'pdx-dir-thumb pdx-dir-thumb-round', 'Photo of ' + (person.displayName || 'person'))}
        <div class="pdx-dir-row-copy"><div class="pdx-dir-row-title">${escapeHtml(person.displayName)}</div><div class="pdx-dir-row-meta">${escapeHtml(accessLabel)} · ${person.child ? 'Child' : 'Adult'}${person.householdCount ? ' · ' + person.householdCount + ' household link' + (person.householdCount === 1 ? '' : 's') : ''}</div></div>
      </div>
      <div class="pdx-dir-row-side">${pending ? `<span class="pdx-dir-badge high">${pending} pending</span>` : `<span class="pdx-dir-badge count">Current</span>`}<button class="pdx-dir-action-btn" type="button" onclick="event.stopPropagation();openDirectoryPerson('${escapeAttr(person.id)}')">Open</button></div>
    </div>`;
  }

  function directoryHouseholdRow(household) {
    const count = household.memberCount || 0;
    const admins = household.administratorCount || household.adminCount || 0;
    const pending = household.pendingRequestCount || 0;
    return `<div class="pdx-dir-row pdx-dir-record-row" onclick="openDirectoryHousehold('${escapeAttr(household.id)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDirectoryHousehold('${escapeAttr(household.id)}');}">
      <div class="pdx-dir-row-media">
        ${directoryAdminPhotoImg(household.photo, 'pdx-dir-thumb', 'Family photo for ' + (household.displayName || 'household'))}
        <div class="pdx-dir-row-copy">
          <div class="pdx-dir-row-title">${escapeHtml(household.displayName)}</div>
          <div class="pdx-dir-row-meta">${escapeHtml(count + ' member' + (count === 1 ? '' : 's'))} · ${escapeHtml(admins + ' household admin' + (admins === 1 ? '' : 's'))}${household.photo ? ' · family photo ' + escapeHtml((household.photo.lifecycleStatus || '').replace(/_/g, ' ')) : ''}</div>
        </div>
      </div>
      <div class="pdx-dir-row-side">
        ${pending ? `<span class="pdx-dir-badge high">${pending} pending</span>` : `<span class="pdx-dir-badge count">Current</span>`}
        <button class="pdx-dir-action-btn" type="button" onclick="event.stopPropagation();openDirectoryHousehold('${escapeAttr(household.id)}')">Open</button>
      </div>
    </div>`;
  }

  function directoryMaintenanceRow(label, value, alertIfPositive = false, help = '') {
    const numeric = Number(value ?? 0);
    return `<div class="pdx-dir-row">
      <div class="pdx-dir-row-copy"><div class="pdx-dir-row-title">${escapeHtml(label)}</div>${help ? `<div class="pdx-dir-row-meta">${escapeHtml(help)}</div>` : ''}</div>
      <div class="pdx-dir-row-side"><span class="pdx-dir-badge ${alertIfPositive && numeric > 0 ? 'urgent' : 'count'}">${escapeHtml(numeric)}</span></div>
    </div>`;
  }

  function directoryMaintenanceActions(actions = {}) {
    const groups = [
      ['Overdue households', actions.overdueHouseholds || [], 'household'],
      ['Confirm soon', actions.dueHouseholds || [], 'household'],
      ['Confirmation not started', actions.notStartedHouseholds || [], 'household'],
      ['Households needing account access', actions.householdsNeedingAccountAccess || [], 'household'],
      ['People not connected to a family account', actions.unclaimedPeople || [], 'person'],
      ['Renew skill consent', actions.staleSkillConsents || [], 'person']
    ].filter(([, items]) => items.length);
    if (!groups.length) return '<div class="pdx-dir-maintenance-clear"><strong>Nothing needs attention</strong><span>The directory has no overdue confirmations, stale consents, or adults needing account access.</span></div>';
    return `<div class="pdx-dir-maintenance-worklists">${groups.map(([title, items, type]) => `<section><h4>${escapeHtml(title)}</h4>${items.map((item) => `<button type="button" onclick="${type === 'household' ? 'openDirectoryHousehold' : 'openDirectoryPerson'}('${escapeAttr(type === 'person' ? (item.personId || item.id) : item.id)}')"><span><strong>${escapeHtml(item.displayName || 'Directory record')}</strong><small>${item.skillName ? escapeHtml(item.skillName) : item.dueAt ? 'Due ' + escapeHtml(new Date(item.dueAt).toLocaleDateString()) : 'Open record'}</small></span><b>Open →</b></button>`).join('')}</section>`).join('')}</div>`;
  }

  function directorySkillsAdminRows(listings) {
    if (!listings.length) return directoryEmptyState('Nothing to review', 'No Skills & Service listings are active or awaiting review.');
    return listings.map(item => `
      <div class="pdx-dir-row">
        <div class="pdx-dir-row-copy">
          <div class="pdx-dir-row-title">${escapeHtml(item.displayLabel || item.skill?.name || 'Skill listing')}</div>
          <div class="pdx-dir-row-meta">${escapeHtml(item.person?.displayName || 'Member')} · ${escapeHtml(item.status || '')}</div>
        </div>
        <div class="pdx-dir-row-side">
          ${item.status === 'hidden_by_parish' ? `<button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','restore')">Restore</button>` : `<button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','hide')">Hide</button>`}
          <button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','archive')">Archive</button>
        </div>
      </div>`).join('');
  }

  async function moderateDirectorySkill(id, action) {
    if (!id || !action) return;
    try {
      const reason = action === 'hide' ? 'Hidden from parish dashboard review.' : '';
      const res = await fetch(directoryAdminApi('/skills/listings/' + encodeURIComponent(id) + '/' + action), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Skill listing update failed.');
      loadDirectoryAdminTab(true);
    } catch (err) {
      alert(err.message || 'Unable to update this skill listing.');
    }
  }

  async function downloadDirectoryAdminExport(path) {
    try {
      const res = await fetch(directoryAdminApi(path), { headers: authHeaders() });
      if (!res.ok) throw new Error('Export is unavailable.');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      downloadBlob(match?.[1] || 'directory-export.csv', blob);
    } catch (err) {
      alert(err.message || 'Unable to download this export.');
    }
  }

  async function previewDirectoryAdminPrint(path) {
    const win = window.open('about:blank', '_blank');
    if (!win) {
      alert('Allow pop-ups for AGAPAY to open the printable directory.');
      return;
    }
    win.document.write('<!doctype html><title>Preparing directory…</title><p style="font:16px system-ui;padding:32px;">Preparing your printable directory…</p>');
    win.document.close();
    try {
      const res = await fetch(directoryAdminApi(path), { headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Print view is unavailable.');
      const print = payload.print || {};
      const html = path.includes('/print/directory') ? printableDirectoryHtml(print) : printableSkillsHtml(print);
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch (err) {
      win.close();
      alert(err.message || 'Unable to open this print view.');
    }
  }

  function printableDirectoryHtml(print = {}) {
    const grouped = new Map();
    (print.households || []).forEach((row) => {
      const name = row.display_name || row.displayName || 'Household';
      if (!grouped.has(name)) grouped.set(name, []);
      if (row.preferred_name || row.preferredName) grouped.get(name).push(row.preferred_name || row.preferredName);
    });
    const cards = Array.from(grouped.entries()).map(([household, members]) => `<article><h2>${escapeHtml(household)}</h2><p>${members.length ? members.map(escapeHtml).join(' · ') : 'No published members'}</p></article>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Parish Directory</title><style>
      @page{size:letter;margin:.55in}*{box-sizing:border-box}body{margin:0;color:#171715;background:#f6f1e8;font-family:Arial,sans-serif}header{padding:32px;background:linear-gradient(145deg,#061522,#0b2130);color:#f6f1e8}header small{color:#e8c879;text-transform:uppercase;letter-spacing:.14em;font-weight:700}h1{margin:6px 0 4px;font:600 36px Georgia,serif}header p{margin:0;color:rgba(246,241,232,.72)}.toolbar{display:flex;justify-content:flex-end;padding:14px 24px;background:#fff;border-bottom:1px solid #ddd}.toolbar button{border:0;border-radius:9px;padding:10px 16px;background:#061522;color:#fff;font-weight:700;cursor:pointer}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:24px}article{break-inside:avoid;padding:18px;border:1px solid #ddd5c7;border-radius:14px;background:#fff}article h2{margin:0 0 8px;font:600 22px Georgia,serif;color:#235c4d}article p{margin:0;color:#625e56;font-size:13px;line-height:1.55}footer{padding:0 24px 24px;color:#6f6a60;font-size:11px}@media print{body{background:#fff}.toolbar{display:none}header{padding:20px 24px}main{padding:18px 0}.toolbar+main{}article{box-shadow:none}}
    </style></head><body><header><small>AGAPAY Parish Directory</small><h1>Our Parish Family</h1><p>${escapeHtml(print.privacyReminder || 'Private parish directory. Do not distribute outside the parish.')}</p></header><div class="toolbar"><button onclick="window.print()">Print directory</button></div><main>${cards || '<article><h2>No published households</h2><p>There are no approved directory entries to print yet.</p></article>'}</main><footer>Generated ${escapeHtml(new Date(print.generatedAt || Date.now()).toLocaleString())}</footer></body></html>`;
  }

  function printableSkillsHtml(print = {}) {
    const rows = (print.listings || []).map((item) => `<article><h2>${escapeHtml(item.displayLabel || item.skill?.name || 'Skill')}</h2><p>${escapeHtml(item.person?.displayName || 'Parish member')} · ${escapeHtml(item.experienceLevel || '')} · ${escapeHtml(item.serviceMode || '')}</p></article>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Skills &amp; Service</title><style>body{font:14px/1.5 Arial;margin:32px;color:#171715}h1,h2{font-family:Georgia,serif}button{float:right;padding:9px 14px}article{break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>Skills &amp; Service</h1><p>${escapeHtml(print.disclaimer || '')}</p>${rows || '<p>No active listings.</p>'}</body></html>`;
  }

  function directoryMetric(label, value, iconPath) {
    return `<div class="pdx-kpi-card">
      <div class="pdx-kpi-label">${escapeHtml(label)}</div>
      <div class="pdx-kpi-value">${escapeHtml(value ?? 0)}</div>
      <div class="pdx-kpi-icon"><svg viewBox="0 0 24 24">${iconPath || ''}</svg></div>
    </div>`;
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
    syncTierRequirementNavigation('stewardship', 'Stewardship', stewardshipActive);
    const bookstoreBadge = document.getElementById('bookstoreNavBadge');
    const mobileBookstoreBadge = document.getElementById('mobileBookstoreBadge');
    syncTierRequirementNavigation('bookstore', 'Stewardship', bookstoreActive);
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

    // Sacraments & Services is a Parish tier feature. Parish-tier parishes
    // can turn the donor-facing entry on or off from the Sacraments tab.
    const sacIsOn = Boolean(currentParish?.sacramentsEnabled);
    const sacBadge = document.getElementById('sacramentsNavBadge');
    syncTierRequirementNavigation('sacraments', 'Parish', sacramentsActive);
    if (sacBadge) {
      sacBadge.hidden = sacramentsActive;
      sacBadge.textContent = 'Upgrade';
      sacBadge.classList.remove('nav-upgrade-badge--active');
    }
    syncModuleStatusNavigation('sacraments', sacramentsActive, sacIsOn);
    syncModuleStatusNavigation('directory', moduleIncluded('directory'), Boolean(currentParish?.directoryEnabled));
  }

  // ── BOOKSTORE ───────────────────────────────────────────────
  // Bookstore is available with Stewardship. The broader Commerce overview
  // and future product workspaces require the Parish-only commerceSuite
  // entitlement.
  // Two pieces: what's already in the parish's catalog, and a starter
  // list of common items they can check off instead of typing each one
  // in by hand. Prices on the starter list are suggestions, not fixed —
  // the parish edits them before anything gets added.
  let bookstoreCatalogState = { loaded: false, products: [], starterCatalog: [] };
  let commerceProductState = 'overview';

  function switchCommerceProduct(product, focus = true) {
    const fullSuite = moduleIncluded('commerceSuite');
    const allowed = fullSuite ? new Set(['overview', 'bookstore']) : new Set(['bookstore']);
    commerceProductState = allowed.has(product) ? product : (fullSuite ? 'overview' : 'bookstore');
    document.querySelectorAll('.commerce-product-tab').forEach((tab) => {
      const fullSuiteOnly = tab.dataset.commerceProduct !== 'bookstore';
      tab.hidden = fullSuiteOnly && !fullSuite;
      const active = tab.dataset.commerceProduct === commerceProductState;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active && focus) tab.focus({ preventScroll: true });
    });
    document.querySelectorAll('.commerce-workspace-panel').forEach((panel) => {
      const active = panel.dataset.commercePanel === commerceProductState;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (commerceProductState === 'overview') renderCommerceOverview();
  }

  function setCommerceOverviewRange(range) {
    bookstoreSalesState.range = ['30d', '90d', 'ytd', 'all'].includes(range) ? range : '90d';
    document.querySelectorAll('[data-commerce-range], .bk-range-btn').forEach((button) => {
      const active = button.getAttribute('data-commerce-range') === bookstoreSalesState.range
        || button.getAttribute('data-range') === bookstoreSalesState.range;
      button.classList.toggle('is-active', active);
    });
    loadBookstoreSalesPanel(true);
  }

  function refreshCommerceOverview() {
    loadBookstoreCatalogTab(true);
  }

  function renderCommerceOverview() {
    const body = document.getElementById('commerceOverviewBody');
    if (!body) return;
    if (!moduleIncluded('commerceSuite')) {
      body.replaceChildren();
      return;
    }
    const sales = bookstoreSalesState.data;
    const catalogReady = bookstoreCatalogState.loaded;
    if (!sales || !catalogReady) {
      body.innerHTML = '<p class="sw-tool-loading">Loading Commerce activity…</p>';
      return;
    }

    const kpis = sales.kpis || {};
    const products = bookstoreCatalogState.products || [];
    const activeProducts = products.filter((product) => String(product.status || 'active').toLowerCase() === 'active');
    const orders = bookstoreSalesState.orders || [];
    const hasActivity = Number(kpis.orderCount || 0) > 0;
    const bookstoreState = currentParish?.bookstoreEnabled ? 'Live in My AGAPAY' : 'Hidden from My AGAPAY';

    body.innerHTML = `
      <section class="commerce-overview-kpis" aria-label="Commerce metrics">
        <article class="commerce-overview-kpi commerce-overview-kpi--primary">
          <span>Net revenue</span>
          <strong>${money(kpis.netCents || 0)}</strong>
          <small>After payment fees${kpis.taxCents ? ` · ${money(kpis.taxCents)} tax collected` : ''}</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Gross sales</span>
          <strong>${money(kpis.grossCents || 0)}</strong>
          <small>${Number(kpis.orderCount || 0)} order${Number(kpis.orderCount || 0) === 1 ? '' : 's'} across Commerce</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Customers</span>
          <strong>${Number(kpis.uniqueCustomers || 0)}</strong>
          <small>${Number(kpis.repeatCustomers || 0)} returning customer${Number(kpis.repeatCustomers || 0) === 1 ? '' : 's'}</small>
        </article>
        <article class="commerce-overview-kpi">
          <span>Active offerings</span>
          <strong>${activeProducts.length}</strong>
          <small>${Number(kpis.unitsSold || 0)} item${Number(kpis.unitsSold || 0) === 1 ? '' : 's'} sold this period</small>
        </article>
      </section>

      <div class="commerce-overview-grid">
        <section class="commerce-overview-card commerce-product-summary">
          <header>
            <div><span class="commerce-card-eyebrow">Products</span><h2>Commerce activity</h2></div>
            <span class="commerce-card-note">All products</span>
          </header>
          <button class="commerce-product-summary-row" type="button" onclick="switchCommerceProduct('bookstore')">
            <span class="commerce-product-summary-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </span>
            <span class="commerce-product-summary-copy"><strong>Bookstore</strong><small>${escapeHtml(bookstoreState)} · ${activeProducts.length} active offering${activeProducts.length === 1 ? '' : 's'}</small></span>
            <span class="commerce-product-summary-metrics"><strong>${money(kpis.netCents || 0)}</strong><small>${Number(kpis.orderCount || 0)} order${Number(kpis.orderCount || 0) === 1 ? '' : 's'}</small></span>
            <span class="commerce-product-summary-arrow" aria-hidden="true">→</span>
          </button>
          <div class="commerce-coming-products">
            <span>Events</span><span>Meals</span><span>Retreats</span><span>Camp</span><span>Tuition</span>
            <small>Additional product activity will roll into this overview as each product launches.</small>
          </div>
        </section>

        <section class="commerce-overview-card commerce-recent-activity">
          <header>
            <div><span class="commerce-card-eyebrow">Latest</span><h2>Recent activity</h2></div>
            ${hasActivity ? `<button type="button" onclick="switchCommerceProduct('bookstore')">View Bookstore</button>` : ''}
          </header>
          ${orders.length ? `<div class="commerce-activity-list">${orders.slice(0, 5).map((order) => `
            <article>
              <span class="commerce-activity-avatar">${escapeHtml(bkInitials(order.donorName))}</span>
              <span class="commerce-activity-copy"><strong>${escapeHtml(order.donorName || 'Parishioner')}</strong><small>${escapeHtml(order.summary || 'Bookstore purchase')} · ${bkAgo(order.createdAt)}</small></span>
              <span class="commerce-activity-amount"><strong>${moneyFull(order.grossCents || 0)}</strong><small>Bookstore</small></span>
            </article>`).join('')}</div>`
            : `<div class="commerce-overview-empty"><strong>No Commerce sales yet</strong><p>Orders from every active Commerce product will appear here as parishioners make purchases.</p><button type="button" onclick="switchCommerceProduct('bookstore')">Set up Bookstore</button></div>`}
        </section>
      </div>`;
  }
  let bookstoreEditingProductId = null;

  function bookstoreApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/bookstore' + path;
  }

  function settlementProfilesApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/settlement-profiles' + path;
  }

  // ── Settlement Profiles (Settings tab) ──────────────────────────────────
  let settlementProfilesState = { loaded: false, loading: false, profiles: [], profileTypes: [], stewardshipActive: false };

  const SETTLEMENT_MODULE_LABELS = { giving: 'Giving (donations)', bookstore: 'Bookstore Payments' };
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
    if (!settlementProfilesState.loaded) body.innerHTML = '<p class="sw-tool-loading">Loading revenue streams&hellip;</p>';
    try {
      const res = await fetch(settlementProfilesApi(), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load revenue streams.');
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
        p.isDefaultGiving ? '<span class="sp-badge sp-badge--giving">Default giving</span>' : '',
        p.isDefaultCommerce ? '<span class="sp-badge sp-badge--commerce">Default commerce</span>' : '',
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
          <div class="sp-row-actions">
            ${!p.isDefaultGiving ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultGivingProfile('${escapeAttr(p.id)}')">Make default giving</button>` : ''}
            ${!p.isDefaultCommerce ? `<button class="btn btn-ghost btn-sm" type="button" onclick="setDefaultCommerceProfile('${escapeAttr(p.id)}')">Make default commerce</button>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleSettlementProfileActive('${escapeAttr(p.id)}', ${p.isActive ? 'false' : 'true'})">${p.isActive ? 'Deactivate' : 'Activate'}</button>
          </div>
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
            <span class="sp-module-label">${escapeHtml(SETTLEMENT_MODULE_LABELS[key])}</span>
            <select class="form-select" onchange="assignSettlementModule('${key}', this.value)">${options}</select>
          </div>`;
      }).join('');

    body.innerHTML = `
      <div class="sp-list">${rows || '<p class="bk-panel-empty">No revenue streams yet.</p>'}</div>

      <div class="sp-modules">
        <h4 class="sp-subhead">Module assignments</h4>
        ${moduleAssignmentRows}
      </div>

      <form class="sp-new-form" onsubmit="createSettlementProfile(event)">
        <h4 class="sp-subhead">Add a revenue stream</h4>
        <div class="sp-new-fields">
          <input class="form-input" id="spNewName" type="text" placeholder="Revenue stream name (e.g. Festival Fund)" maxlength="80" required />
          <select class="form-select" id="spNewType">
            ${(settlementProfilesState.profileTypes.length ? settlementProfilesState.profileTypes : ['general_giving']).map(t =>
              `<option value="${escapeAttr(t)}">${escapeHtml(SETTLEMENT_TYPE_LABELS[t] || t)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Add revenue stream</button>
        </div>
      </form>`;
  }

  async function createSettlementProfile(event) {
    event.preventDefault();
    const name = document.getElementById('spNewName')?.value.trim();
    const profileType = document.getElementById('spNewType')?.value;
    if (!name) { setStatus('Enter a revenue stream name.', 'error'); return; }
    try {
      const res = await fetch(settlementProfilesApi(), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, profileType })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to create revenue stream.');
      setStatus(`"${name}" created.`, 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function renameSettlementProfile(profileId, name) {
    const clean = String(name || '').trim();
    if (!clean) { setStatus('Revenue stream name cannot be empty.', 'error'); await loadSettlementProfilesPanel(true); return; }
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId)), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to rename revenue stream.');
      setStatus('Revenue stream renamed.', 'success');
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
      if (!res.ok) throw new Error(data.error || 'Unable to update revenue stream.');
      setStatus(makeActive ? 'Revenue stream activated.' : 'Revenue stream deactivated.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function setDefaultGivingProfile(profileId) {
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-giving'), { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to set default giving revenue stream.');
      setStatus('Default giving revenue stream updated.', 'success');
      await loadSettlementProfilesPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function setDefaultCommerceProfile(profileId) {
    try {
      const res = await fetch(settlementProfilesApi('/' + encodeURIComponent(profileId) + '/default-commerce'), { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to set default commerce revenue stream.');
      setStatus('Default commerce revenue stream updated.', 'success');
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

  const BOOKSTORE_CATEGORY_LABELS = {
    book: 'Book', prayer_rope: 'Prayer Rope', icon: 'Icon', candle: 'Candle',
    jewelry: 'Jewelry / Cross', incense: 'Incense', cd_dvd: 'CD / DVD', other: 'Other'
  };

  function bookstoreCategoryOptions(selected = 'other') {
    return Object.entries(BOOKSTORE_CATEGORY_LABELS).map(([value, label]) =>
      `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`
    ).join('');
  }

  const BOOKSTORE_NO_STATEWIDE_SALES_TAX_STATES = new Set(['DE', 'MT', 'NH', 'OR']);

  function normalizeStateCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    const names = {
      ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
      COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
      HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
      KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
      MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
      MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
      'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
      OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
      'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX',
      UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
      WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC'
    };
    if (/^[A-Z]{2}$/.test(raw)) return raw;
    return names[raw] || raw.slice(0, 2);
  }

  function renderBookstoreTaxReminder() {
    const box = document.getElementById('bookstoreTaxReminder');
    if (!box || !currentParish) return;
    const stateCode = normalizeStateCode(currentParish.state);
    const stateLabel = currentParish.state || 'your state';
    box.hidden = false;
    box.classList.remove('error');
    if (BOOKSTORE_NO_STATEWIDE_SALES_TAX_STATES.has(stateCode)) {
      box.innerHTML = `<strong>Sales tax:</strong> ${escapeHtml(stateLabel)} does not have a general statewide sales tax, so you do not need to worry about Stripe Tax setup for ordinary bookstore checkout. If your parish sells unusual taxable items, confirm locally.`;
      return;
    }
    if (stateCode === 'AK') {
      box.innerHTML = `<strong>Sales tax:</strong> Alaska has no statewide sales tax, but some local jurisdictions do collect sales tax. Check your local rules and turn on Stripe Tax if your parish needs to collect it.`;
      return;
    }
    box.innerHTML = `<strong>Sales tax reminder:</strong> ${escapeHtml(stateLabel)} may require sales tax on bookstore items. Set up Stripe Tax in your connected Stripe account before taking live bookstore payments so Stripe can show any required tax on the payment page.`;
  }

  function renderBookstoreFeatureToggle() {
    const root = document.getElementById('bookstoreFeatureToggle');
    if (!root) return;
    const enabled = Boolean(currentParish?.bookstoreEnabled);
    root.innerHTML = `<label class="sac-admin-switch agapay-feature-switch" title="Show or hide Bookstore in My AGAPAY">
      <input type="checkbox" aria-label="Show Bookstore in My AGAPAY" ${enabled ? 'checked' : ''} onchange="toggleBookstoreFeature(this)" />
      <span aria-hidden="true"></span>
      <em>${enabled ? 'On' : 'Off'}</em>
    </label>`;
  }

  async function toggleBookstoreFeature(input) {
    if (!currentParish) return;
    const enabled = Boolean(input?.checked);
    const previous = Boolean(currentParish.bookstoreEnabled);
    if (input) input.disabled = true;
    try {
      const response = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookstoreEnabled: enabled })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update Bookstore.');
      currentParish = { ...currentParish, ...(payload.parish || {}), bookstoreEnabled: Boolean(payload.parish?.bookstoreEnabled ?? enabled) };
      syncModuleStatusNavigation('bookstore', moduleIncluded('bookstore'), currentParish.bookstoreEnabled);
      setStatus(currentParish.bookstoreEnabled ? 'Bookstore is on for parishioners.' : 'Bookstore is off for parishioners.', 'success');
      loadBookstoreCatalogTab();
    } catch (error) {
      currentParish.bookstoreEnabled = previous;
      if (input) input.checked = previous;
      renderBookstoreFeatureToggle();
      setStatus(error.message, 'error');
    } finally {
      if (input) input.disabled = false;
    }
  }

  async function loadBookstoreCatalogTab(force = false) {
    const upsell = document.getElementById('bookstoreUpsellBanner');
    const live = document.getElementById('bookstoreLiveContent');
    const status = document.getElementById('bookstoreStatusLabel');
    if (!currentParish) return;

    const swActive = !isStarterTier() && moduleIncluded('bookstore');
    syncDashboardPaywall(document.getElementById('tab-bookstore'), 'bookstore', 'Stewardship', !swActive);
    updateStewardshipBadges(swActive, { renderPanel: false });
    if (!swActive) {
      if (upsell) upsell.hidden = true;
      if (live) live.hidden = true;
      return;
    }
    if (upsell) upsell.hidden = true;
    if (live) live.hidden = false;
    switchCommerceProduct(moduleIncluded('commerceSuite') ? commerceProductState : 'bookstore', false);
    renderBookstoreFeatureToggle();
    if (status) {
      status.textContent = currentParish.bookstoreEnabled ? 'Live in My AGAPAY' : 'Hidden until enabled';
      status.className = 'sw-suite-status-label ' + (currentParish.bookstoreEnabled ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
    }
    renderBookstoreTaxReminder();
    setTimeout(() => loadBookstoreSalesPanel(force), 250);

    if (bookstoreCatalogState.loaded && !force) {
      renderBookstoreCurrentItems(bookstoreCatalogState.products);
      renderBookstoreStarterCatalogUI(bookstoreCatalogState.starterCatalog);
      renderCommerceOverview();
      return;
    }

    const itemsPane = document.getElementById('bookstoreCurrentItems');
    const starterPane = document.getElementById('bookstoreStarterCatalog');
    if (itemsPane) itemsPane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    if (starterPane) starterPane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';

    try {
      const [productsRes, catalogRes] = await Promise.all([
        fetch(bookstoreApi('/products'), { headers: authHeaders() }),
        fetch(bookstoreApi('/starter-catalog'), { headers: authHeaders() })
      ]);
      const productsData = await productsRes.json().catch(() => ({}));
      const catalogData = await catalogRes.json().catch(() => ({}));
      if (!productsRes.ok) throw new Error(productsData.error || 'Unable to load your bookstore items.');
      if (!catalogRes.ok) throw new Error(catalogData.error || 'Unable to load the starter catalog.');

      bookstoreCatalogState = { loaded: true, products: productsData.products || [], starterCatalog: catalogData.catalog || [] };
      renderBookstoreCurrentItems(bookstoreCatalogState.products);
      renderBookstoreStarterCatalogUI(bookstoreCatalogState.starterCatalog);
      renderCommerceOverview();
    } catch (err) {
      if (itemsPane) itemsPane.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
      if (starterPane) starterPane.innerHTML = '';
    }
  }

  // ── Bookstore Sales & Customers ─────────────────────────────────────────
  let bookstoreSalesState = { loaded: false, loading: false, range: '90d', data: null, orders: [], nextCursor: null };

  function setBookstoreSalesRange(range) {
    if (bookstoreSalesState.range === range && bookstoreSalesState.loaded) return;
    bookstoreSalesState.range = range;
    document.querySelectorAll('.bk-range-btn').forEach(b =>
      b.classList.toggle('is-active', b.getAttribute('data-range') === range));
    loadBookstoreSalesPanel(true);
  }

  async function loadBookstoreSalesPanel(force = false) {
    const body = document.getElementById('bookstoreSalesBody');
    if (!body || !currentParish) return;
    if (bookstoreSalesState.loaded && !force) { renderBookstoreSalesPanel(); return; }
    if (bookstoreSalesState.loading) return;
    bookstoreSalesState.loading = true;
    if (!bookstoreSalesState.loaded) body.innerHTML = '<p class="sw-tool-loading">Loading sales…</p>';
    try {
      const res = await fetch(bookstoreApi('/sales?range=' + encodeURIComponent(bookstoreSalesState.range)), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load bookstore sales.');
      bookstoreSalesState.data = data;
      bookstoreSalesState.orders = data.orders || [];
      bookstoreSalesState.nextCursor = data.nextCursor || null;
      bookstoreSalesState.loaded = true;
      renderBookstoreSalesPanel();
      renderCommerceOverview();
    } catch (err) {
      body.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    } finally {
      bookstoreSalesState.loading = false;
    }
  }

  function bkAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!then) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60); if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24); if (days < 30) return days + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function bkInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '•';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function bkPaymentPill(status) {
    const map = {
      paid: ['Paid', 'ok'],
      refunded: ['Refunded', 'muted'],
      partially_refunded: ['Part. refund', 'warn']
    };
    const [label, tone] = map[status] || [status || '—', 'muted'];
    return `<span class="bk-pill bk-pill--${tone}">${escapeHtml(label)}</span>`;
  }

  function bkFulfillPill(status) {
    if (!status || status === 'none') return '';
    const map = {
      pending: ['Pending pickup', 'warn'], ready: ['Ready', 'info'],
      picked_up: ['Picked up', 'ok'], shipped: ['Shipped', 'ok'],
      fulfilled: ['Fulfilled', 'ok'], cancelled: ['Cancelled', 'muted']
    };
    const [label, tone] = map[status] || [status, 'muted'];
    return `<span class="bk-pill bk-pill--${tone}">${escapeHtml(label)}</span>`;
  }

  function bkSparkline(trend) {
    const max = Math.max(1, ...trend.map(t => t.grossCents));
    return `
      <div class="bk-spark">
        ${trend.map(t => {
          const h = Math.round((t.grossCents / max) * 100);
          return `<div class="bk-spark-col" title="${escapeAttr(t.label)}: ${money(t.grossCents)} · ${t.orders} order${t.orders === 1 ? '' : 's'}">
            <div class="bk-spark-bar-wrap"><div class="bk-spark-bar${t.grossCents ? '' : ' is-empty'}" style="height:${Math.max(h, t.grossCents ? 6 : 2)}%"></div></div>
            <span class="bk-spark-label">${escapeHtml(t.label)}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderBookstoreSalesPanel() {
    const body = document.getElementById('bookstoreSalesBody');
    const d = bookstoreSalesState.data;
    if (!body || !d) return;
    const k = d.kpis || {};
    const at = d.allTime || {};
    const hasSales = (k.orderCount || 0) > 0 || (bookstoreSalesState.orders || []).length > 0;

    if (!hasSales) {
      body.innerHTML = `
        <div class="bk-empty">
          <div class="bk-empty-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3h2l.4 2M7 13h10l3-8H5.4"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg></div>
          <h3>No bookstore sales yet</h3>
          <p>When parishioners buy from My AGAPAY, each order will appear here with the buyer, the items, and your net.</p>
          <a class="btn btn-ghost btn-sm" href="/myagapay/bookstore" target="_blank" rel="noopener">Preview the storefront →</a>
        </div>`;
      return;
    }

    const refundNote = (d.refunds && d.refunds.orderCount)
      ? `<span class="bk-refund-note">${d.refunds.orderCount} refund${d.refunds.orderCount === 1 ? '' : 's'} · ${money(d.refunds.grossCents)}</span>` : '';

    body.innerHTML = `
      <div class="bk-kpis">
        <div class="bk-kpi bk-kpi--hero">
          <span class="bk-kpi-label">Gross sales</span>
          <b class="bk-kpi-num">${money(k.grossCents)}</b>
          <span class="bk-kpi-foot">${k.orderCount} order${k.orderCount === 1 ? '' : 's'} · avg ${money(k.avgOrderCents)}</span>
        </div>
        <div class="bk-kpi bk-kpi--net">
          <span class="bk-kpi-label">Net to parish</span>
          <b class="bk-kpi-num">${money(k.netCents)}</b>
          <span class="bk-kpi-foot">after Stripe fees${k.taxCents ? ` · ${money(k.taxCents)} tax` : ''}</span>
        </div>
        <div class="bk-kpi">
          <span class="bk-kpi-label">Customers</span>
          <b class="bk-kpi-num">${k.uniqueCustomers}</b>
          <span class="bk-kpi-foot">${k.repeatCustomers} returning · ${k.unitsSold} item${k.unitsSold === 1 ? '' : 's'} sold</span>
        </div>
        <div class="bk-kpi bk-kpi--alltime">
          <span class="bk-kpi-label">All time</span>
          <b class="bk-kpi-num">${money(at.netCents)}</b>
          <span class="bk-kpi-foot">${at.orderCount} order${at.orderCount === 1 ? '' : 's'} · ${at.uniqueCustomers} buyer${at.uniqueCustomers === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="bk-mid">
        <section class="bk-panel bk-trend">
          <header class="bk-panel-head"><h3>Sales trend</h3><span class="bk-panel-sub">last 6 months ${refundNote}</span></header>
          ${bkSparkline(d.trend || [])}
        </section>
        <section class="bk-panel bk-top">
          <header class="bk-panel-head"><h3>Top items</h3><span class="bk-panel-sub">this range</span></header>
          ${(d.topProducts || []).length ? `<ol class="bk-toplist">${d.topProducts.map(p => `
            <li><span class="bk-toplist-name">${escapeHtml(p.name)}</span>
              <span class="bk-toplist-meta">${p.units}× · ${money(p.grossCents)}</span></li>`).join('')}</ol>`
            : '<p class="bk-panel-empty">No items sold in this range.</p>'}
        </section>
      </div>

      <section class="bk-panel bk-customers">
        <header class="bk-panel-head"><h3>Top customers</h3><span class="bk-panel-sub">by spend, from My AGAPAY</span></header>
        <div class="bk-cust-grid">
          ${(d.topCustomers || []).map(c => `
            <article class="bk-cust">
              <div class="bk-cust-avatar">${escapeHtml(bkInitials(c.name))}</div>
              <div class="bk-cust-main">
                <strong>${escapeHtml(c.name)}${c.isHomeParish ? '<span class="bk-cust-home" title="Home parish">★</span>' : ''}</strong>
                <span class="bk-cust-email">${escapeHtml(c.email)}</span>
              </div>
              <div class="bk-cust-metrics">
                <b>${money(c.grossCents)}</b>
                <span>${c.orders} order${c.orders === 1 ? '' : 's'} · ${bkAgo(c.lastOrderAt)}</span>
              </div>
            </article>`).join('')}
        </div>
      </section>

      <section class="bk-panel bk-ledger">
        <header class="bk-panel-head">
          <h3>Order ledger</h3>
          <div class="bk-search">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>
            <input type="search" id="bookstoreOrderSearch" placeholder="Search buyer or item…" value="${escapeAttr(bookstoreSalesState.query || '')}" onkeydown="if(event.key==='Enter')searchBookstoreOrders(this.value)" />
          </div>
        </header>
        <div id="bookstoreOrderList" class="bk-order-list">${renderBookstoreOrderRows(bookstoreSalesState.orders)}</div>
        <div class="bk-ledger-foot">${bookstoreSalesState.nextCursor
          ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
          : '<span class="bk-ledger-end">End of orders</span>'}</div>
      </section>`;
  }

  function renderBookstoreOrderRows(orders) {
    if (!orders || !orders.length) return '<p class="bk-panel-empty">No orders match.</p>';
    return orders.map(o => {
      const dateLabel = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const items = (o.items || []).map(it =>
        `<li><span>${escapeHtml(it.name)}${it.quantity > 1 ? ` <em>×${it.quantity}</em>` : ''}</span><span>${moneyFull(it.totalCents)}</span></li>`).join('');
      const refunded = o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded';
      return `
        <div class="bk-order${refunded ? ' is-refunded' : ''}">
          <button class="bk-order-head" type="button" onclick="this.closest('.bk-order').classList.toggle('is-open')">
            <div class="bk-order-buyer">
              <div class="bk-order-avatar">${escapeHtml(bkInitials(o.donorName))}</div>
              <div>
                <strong>${escapeHtml(o.donorName)}${o.isMyAgapay ? '<span class="bk-tag">My AGAPAY</span>' : ''}</strong>
                <span class="bk-order-sub">${escapeHtml(o.summary)}${o.quantity > 1 ? ` · ${o.quantity} items` : ''}</span>
              </div>
            </div>
            <div class="bk-order-side">
              <div class="bk-order-amounts"><b>${moneyFull(o.grossCents)}</b><span>net ${moneyFull(o.netCents)}</span></div>
              <div class="bk-order-tags">${bkPaymentPill(o.paymentStatus)}${bkFulfillPill(o.fulfillmentStatus)}</div>
              <span class="bk-order-date">${dateLabel}</span>
              <svg class="bk-order-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 5 3 3 3-3"/></svg>
            </div>
          </button>
          <div class="bk-order-detail">
            <div class="bk-order-detail-inner">
              <div class="bk-order-detail-meta">
                <span>${escapeHtml(o.donorEmail)}</span>
                ${o.orderNumber ? `<span>#${escapeHtml(o.orderNumber)}</span>` : ''}
                <span>${escapeHtml((o.source || '').replace(/_/g, ' '))}</span>
                ${o.settlementProfileName ? `<span>${escapeHtml(o.settlementProfileName)}</span>` : ''}
              </div>
              <ul class="bk-order-items">${items || '<li><span>Bookstore order</span><span>' + moneyFull(o.grossCents) + '</span></li>'}</ul>
              <div class="bk-order-detail-totals">
                ${o.taxCents ? `<span>Tax <b>${moneyFull(o.taxCents)}</b></span>` : ''}
                ${(o.stripeFeeCents || o.agapayFeeCents) ? `<span>Fees <b>${moneyFull((o.stripeFeeCents||0) + (o.agapayFeeCents||0))}</b></span>` : ''}
                <span>Gross <b>${moneyFull(o.grossCents)}</b></span>
                <span>Net to parish <b>${moneyFull(o.netCents)}</b></span>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  async function searchBookstoreOrders(query) {
    if (!currentParish) return;
    bookstoreSalesState.query = (query || '').trim();
    const list = document.getElementById('bookstoreOrderList');
    if (list) list.innerHTML = '<p class="sw-tool-loading">Searching…</p>';
    try {
      const url = bookstoreApi('/sales?range=' + encodeURIComponent(bookstoreSalesState.range)
        + '&q=' + encodeURIComponent(bookstoreSalesState.query));
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      bookstoreSalesState.orders = data.orders || [];
      bookstoreSalesState.nextCursor = data.nextCursor || null;
      if (list) list.innerHTML = renderBookstoreOrderRows(bookstoreSalesState.orders);
      const foot = document.querySelector('.bk-ledger-foot');
      if (foot) foot.innerHTML = bookstoreSalesState.nextCursor
        ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
        : '<span class="bk-ledger-end">End of orders</span>';
    } catch (err) {
      if (list) list.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadMoreBookstoreOrders(btn) {
    if (!currentParish || !bookstoreSalesState.nextCursor) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      const url = bookstoreApi('/sales?range=' + encodeURIComponent(bookstoreSalesState.range)
        + (bookstoreSalesState.query ? '&q=' + encodeURIComponent(bookstoreSalesState.query) : '')
        + '&cursor=' + encodeURIComponent(bookstoreSalesState.nextCursor));
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load more.');
      bookstoreSalesState.orders = bookstoreSalesState.orders.concat(data.orders || []);
      bookstoreSalesState.nextCursor = data.nextCursor || null;
      const list = document.getElementById('bookstoreOrderList');
      if (list) list.innerHTML = renderBookstoreOrderRows(bookstoreSalesState.orders);
      const foot = document.querySelector('.bk-ledger-foot');
      if (foot) foot.innerHTML = bookstoreSalesState.nextCursor
        ? '<button class="btn btn-ghost btn-sm" type="button" onclick="loadMoreBookstoreOrders(this)">Load more orders</button>'
        : '<span class="bk-ledger-end">End of orders</span>';
    } catch (err) {
      setStatus(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Load more orders'; }
    }
  }

  function renderBookstoreCurrentItems(products) {
    const pane = document.getElementById('bookstoreCurrentItems');
    if (!pane) return;
    if (!products.length) {
      pane.innerHTML = '<p class="bookstore-empty">Nothing added yet. Use the starter catalog below or add a custom item.</p>';
      return;
    }
    pane.innerHTML = `
      <div class="bookstore-current-list">
        ${products.map(p => `
          <article class="bookstore-current-row">
            <div class="bookstore-current-main">
              <strong>${escapeHtml(p.name || 'Bookstore item')}</strong>
              <span>${escapeHtml(BOOKSTORE_CATEGORY_LABELS[p.category] || p.category || 'Other')}${p.sku ? ` · ${escapeHtml(p.sku)}` : ''}</span>
              ${p.description ? `<small>${escapeHtml(p.description)}</small>` : ''}
            </div>
            <div class="bookstore-current-metrics">
              <b>${moneyFull(Number(p.priceCents || 0))}</b>
              <em class="bookstore-status-pill">${escapeHtml(p.status || 'active')}</em>
            </div>
            <div class="bookstore-row-actions">
              <button class="sw-action-btn" type="button" onclick="openBookstoreItemModal('${escapeAttr(p.id)}')">Edit</button>
              <button class="sw-action-btn danger" type="button" onclick="archiveBookstoreItem('${escapeAttr(p.id)}', this)">Archive</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function buildBookstoreItemModal() {
    const existing = document.getElementById('bookstoreItemModal');
    if (existing) return existing;
    const modal = document.createElement('div');
    modal.id = 'bookstoreItemModal';
    modal.className = 'bookstore-modal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="bookstore-modal" role="dialog" aria-modal="true" aria-labelledby="bookstoreItemModalTitle">
        <div class="bookstore-modal-head">
          <div>
            <span class="sw-suite-eyebrow">Bookstore catalog</span>
            <h2 id="bookstoreItemModalTitle">Edit item</h2>
          </div>
          <button class="bookstore-modal-close" type="button" onclick="closeBookstoreItemModal()" aria-label="Close">×</button>
        </div>
        <form class="bookstore-modal-form" onsubmit="saveBookstoreItemFromModal(event)">
          <label>Item name<input id="bookstoreModalName" required /></label>
          <label>Category<select id="bookstoreModalCategory">${bookstoreCategoryOptions('other')}</select></label>
          <label class="full">Description<textarea id="bookstoreModalDescription" rows="3"></textarea></label>
          <label>Price<input id="bookstoreModalPrice" type="number" min="0.01" step="0.01" required /></label>
          <input id="bookstoreModalStock" type="hidden" value="0" />
          <label>SKU / barcode<input id="bookstoreModalSku" /></label>
          <label class="full">Image URL<input id="bookstoreModalImage" placeholder="https://..." /></label>
          <div class="bookstore-modal-actions">
            <button class="btn btn-ghost" type="button" onclick="closeBookstoreItemModal()">Cancel</button>
            <button class="btn btn-gold" type="submit">Save item</button>
          </div>
        </form>
      </div>
    `;
    modal.addEventListener('click', event => { if (event.target === modal) closeBookstoreItemModal(); });
    document.body.appendChild(modal);
    return modal;
  }

  function openBookstoreItemModal(productId) {
    const product = bookstoreCatalogState.products.find(p => p.id === productId);
    if (!product) { setStatus('Bookstore item not found.', 'error'); return; }
    const modal = buildBookstoreItemModal();
    bookstoreEditingProductId = productId;
    document.getElementById('bookstoreModalName').value = product.name || '';
    document.getElementById('bookstoreModalCategory').innerHTML = bookstoreCategoryOptions(product.category || 'other');
    document.getElementById('bookstoreModalDescription').value = product.description || '';
    document.getElementById('bookstoreModalPrice').value = (Number(product.priceCents || 0) / 100).toFixed(2);
    document.getElementById('bookstoreModalStock').value = Number(product.stockQuantity || 0);
    document.getElementById('bookstoreModalSku').value = product.sku || '';
    document.getElementById('bookstoreModalImage').value = product.imageUrl || '';
    modal.hidden = false;
    document.body.classList.add('bookstore-modal-open');
    setTimeout(() => document.getElementById('bookstoreModalName')?.focus(), 0);
  }

  function closeBookstoreItemModal() {
    const modal = document.getElementById('bookstoreItemModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('bookstore-modal-open');
    bookstoreEditingProductId = null;
  }

  function renderBookstoreStarterCatalogUI(catalog) {
    const pane = document.getElementById('bookstoreStarterCatalog');
    if (!pane) return;
    if (!catalog.length) { pane.innerHTML = '<p style="margin:0;">No starter items available.</p>'; return; }

    pane.innerHTML = catalog.map(group => `
      <div class="bookstore-starter-group">
        <h4>${escapeHtml(group.label)}</h4>
        <div class="bookstore-starter-list">
          ${group.items.map(item => `
            <label class="bookstore-starter-row ${item.alreadyAdded ? 'is-added' : ''}">
              <input type="checkbox" data-starter-key="${escapeAttr(item.key)}" ${item.alreadyAdded ? 'disabled checked' : ''} />
              <span>${escapeHtml(item.name)}${item.alreadyAdded ? ' <em>already added</em>' : ''}</span>
              ${item.alreadyAdded ? '' : `
                <div class="bookstore-starter-fields">
                  <input type="text" value="${escapeAttr(item.name)}" data-starter-name="${escapeAttr(item.key)}" title="Item name" />
                  <select data-starter-category="${escapeAttr(item.key)}" title="Category">${bookstoreCategoryOptions(item.category || 'other')}</select>
                  <input type="text" value="${escapeAttr(item.key)}" data-starter-sku="${escapeAttr(item.key)}" title="SKU / barcode" />
                </div>
                <input type="number" min="0.01" step="0.01" value="${(item.suggestedPriceCents / 100).toFixed(2)}" data-starter-price="${escapeAttr(item.key)}" title="Price" />
                <input type="hidden" value="0" data-starter-stock="${escapeAttr(item.key)}" />
              `}
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  async function submitBookstoreStarterCatalog(btn) {
    const checked = Array.from(document.querySelectorAll('#bookstoreStarterCatalog input[type="checkbox"][data-starter-key]:checked:not(:disabled)'));
    if (!checked.length) { setStatus('Check off at least one item to add.', 'error'); return; }

    const items = checked.map(box => {
      const key = box.getAttribute('data-starter-key');
      const nameInput = document.querySelector(`[data-starter-name="${CSS.escape(key)}"]`);
      const categoryInput = document.querySelector(`[data-starter-category="${CSS.escape(key)}"]`);
      const skuInput = document.querySelector(`[data-starter-sku="${CSS.escape(key)}"]`);
      const priceInput = document.querySelector(`[data-starter-price="${CSS.escape(key)}"]`);
      const stockInput = document.querySelector(`[data-starter-stock="${CSS.escape(key)}"]`);
      const priceCents = priceInput ? Math.round(Number(priceInput.value || 0) * 100) : undefined;
      const stockQuantity = stockInput ? Number(stockInput.value || 0) : 0;
      return {
        key,
        name: nameInput?.value || '',
        category: categoryInput?.value || 'other',
        sku: skuInput?.value || '',
        priceCents,
        stockQuantity
      };
    });

    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
      const res = await fetch(bookstoreApi('/starter-catalog/add'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to add items.');
      setStatus(`Added ${data.added.length} item${data.added.length === 1 ? '' : 's'} to your bookstore.`, 'success');
      await loadBookstoreCatalogTab(true);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add selected items to my bookstore'; }
    }
  }

  async function submitBookstoreManualItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector('button[type="submit"]');
    const body = {
      name: document.getElementById('bookstoreItemName')?.value || '',
      description: document.getElementById('bookstoreItemDescription')?.value || '',
      category: document.getElementById('bookstoreItemCategory')?.value || 'other',
      priceCents: Math.round(Number(document.getElementById('bookstoreItemPrice')?.value || 0) * 100),
      stockQuantity: Number(document.getElementById('bookstoreItemStock')?.value || 0),
      sku: document.getElementById('bookstoreItemSku')?.value || '',
      imageUrl: document.getElementById('bookstoreItemImage')?.value || ''
    };
    if (!body.name.trim() || body.priceCents < 1) {
      setStatus('Item name and price are required.', 'error');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
    try {
      const res = await fetch(bookstoreApi('/products'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to add item.');
      form.reset();
      document.getElementById('bookstoreItemStock').value = '0';
      setStatus('Bookstore item added.', 'success');
      await loadBookstoreCatalogTab(true);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add item'; }
    }
  }

  async function saveBookstoreItemFromModal(event) {
    event.preventDefault();
    const productId = bookstoreEditingProductId;
    const btn = event.submitter;
    const body = {
      name: document.getElementById('bookstoreModalName')?.value || '',
      description: document.getElementById('bookstoreModalDescription')?.value || '',
      category: document.getElementById('bookstoreModalCategory')?.value || 'other',
      sku: document.getElementById('bookstoreModalSku')?.value || '',
      imageUrl: document.getElementById('bookstoreModalImage')?.value || '',
      priceCents: Math.round(Number(document.getElementById('bookstoreModalPrice')?.value || 0) * 100),
      stockQuantity: Number(document.getElementById('bookstoreModalStock')?.value || 0)
    };
    if (!productId) return;
    if (!String(body.name || '').trim()) {
      setStatus('Item name is required.', 'error');
      return;
    }
    if (body.priceCents < 1) {
      setStatus('Price must be greater than zero.', 'error');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
      const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId)), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to save item.');
      setStatus('Bookstore item saved.', 'success');
      closeBookstoreItemModal();
      await loadBookstoreCatalogTab(true);
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  }

  async function archiveBookstoreItem(productId, btn) {
    if (!confirm('Archive this bookstore item? Parishioners will no longer see it.')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Archiving...'; }
    try {
      const res = await fetch(bookstoreApi('/products/' + encodeURIComponent(productId)), {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to archive item.');
      setStatus('Bookstore item archived.', 'success');
      await loadBookstoreCatalogTab(true);
    } catch (err) {
      setStatus(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Archive'; }
    }
  }

  // ── SACRAMENTS & SERVICES ──────────────────────────────────
  // A Parish tier feature — gated server-side by the exact same
  // hasStewardshipAccess() check as the rest of the tier features. This panel
  // reuses stewardshipState (already fetched by loadStewardshipPanel) to
  // decide whether to show the upsell or the actual request list, so
  // switching to this tab never needs a second status round-trip.
  let sacramentsState = { loaded: false, requests: [] };
  let sacramentsDashboardTab = 'rules';
  let sacramentsPriestIndex = 0;

  function sacramentsApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/sacraments' + path;

  }

  const SACRAMENT_TYPE_LABELS = {
    house_blessing: 'House Blessing', baptism: 'Baptism', chrismation: 'Chrismation',
    wedding: 'Wedding', funeral: 'Funeral', memorial_service: 'Memorial Service',
    confession: 'Confession', home_visit: 'Home Visit', office_visit: 'Office Visit',
    anointing: 'Holy Unction', counseling: 'Pastoral Counseling', other: 'Other Request'
  };
  const SACRAMENT_STATUS_OPTIONS = ['requested', 'acknowledged', 'scheduled', 'completed', 'declined', 'cancelled'];
  const SACRAMENT_STATUS_LABELS = {
    requested: 'Requested', acknowledged: 'Received', scheduled: 'Scheduled',
    completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled'
  };

  function sacramentTypeLabel(row) {
    return row.sacramentType === 'other' && row.otherTypeLabel ? row.otherTypeLabel : (SACRAMENT_TYPE_LABELS[row.sacramentType] || row.sacramentType);
  }

  function setSacramentsDashboardTab(tab) {
    sacramentsDashboardTab = tab || 'rules';
    document.querySelectorAll('[data-sac-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sacTab === sacramentsDashboardTab);
    });
    if (['blackouts', 'rules', 'calendar'].includes(sacramentsDashboardTab) && !sacramentsAvailabilityState.loaded) {
      loadSacramentsAvailability();
    }
    renderSacramentsPanel();
  }

  function sacramentPriests() {
    const saved = Array.isArray(currentParish?.sacramentPriests) ? currentParish.sacramentPriests : [];
    const rows = saved.map((priest) => ({
      name: String(priest?.name || '').trim(),
      email: String(priest?.email || '').trim(),
      serviceTypes: Array.isArray(priest?.serviceTypes) ? priest.serviceTypes : defaultSacramentServiceTypes(),
      customServices: Array.isArray(priest?.customServices) ? priest.customServices : []
    })).filter((priest) => priest.name);
    if (rows.length) return rows;
    return [{ name: 'Parish priest', email: currentParish?.priestEmail || '', serviceTypes: defaultSacramentServiceTypes(), customServices: [] }];
  }

  function selectedSacramentPriest() {
    const priests = sacramentPriests();
    if (sacramentsPriestIndex >= priests.length) sacramentsPriestIndex = 0;
    return priests[sacramentsPriestIndex] || { name: '', email: '' };
  }

  function renderSacramentsPriestPicker() {
    const root = document.getElementById('sacramentsPriestPicker');
    if (!root) return;
    const priests = sacramentPriests();
    if (sacramentsPriestIndex >= priests.length) sacramentsPriestIndex = 0;
    root.innerHTML = `<span>Priest</span><div class="sac-admin-priest-tabs">
      ${priests.map((priest, index) => `<button type="button" class="${index === sacramentsPriestIndex ? 'active' : ''}" onclick="selectSacramentsPriest(${index})">${escapeHtml(priest.name)}</button>`).join('')}
    </div>`;
  }

  function selectSacramentsPriest(index) {
    sacramentsPriestIndex = Number(index) || 0;
    sacramentsRuleEditor = { type: '', dayOfWeek: -1 };
    renderSacramentsPriestPicker();
    renderSacramentsPanel();
  }

  // Soft rollout: Sacraments & Services only shows real, live content for
  // parishes an AGAPAY admin has enabled (registration.sacramentsEnabled,
  // set via the admin panel). Every other parish sees the coming-soon
  // banner instead. Mirrors the server-side gate in handlers/parish.js and
  // handlers/donor.js (sacramentsEnabledFor).
  function loadSacramentsTab() {
    const banner = document.getElementById('sacramentsComingSoonBanner');
    const live = document.getElementById('sacramentsLiveContent');
    const isAvailable = moduleIncluded('sacraments');
    syncDashboardPaywall(document.getElementById('tab-sacraments'), 'sacraments', 'Parish', !isAvailable);
    syncTierRequirementNavigation('sacraments', 'Parish', isAvailable);
    if (banner) banner.hidden = isAvailable;
    if (live) live.hidden = !isAvailable;
    renderSacramentsFeatureToggle();
    renderSacramentsPriestPicker();
    if (isAvailable) loadSacramentsPanel();
  }

  async function loadSacramentsPanel(force = false) {
    const statusLabel = document.getElementById('sacramentsStatusLabel');
    const pane = document.getElementById('sacramentsPane');
    if (!pane) return;
    if (!currentParish) {
      if (statusLabel) statusLabel.textContent = 'Not loaded';
      return;
    }
    renderSacramentsFeatureToggle();
    renderSacramentsPriestPicker();

    if (!currentParish.sacramentsEnabled) {
      if (statusLabel) statusLabel.textContent = 'Off';
      pane.innerHTML = renderSacramentsDisabledPanel();
      return;
    }
    if (statusLabel) statusLabel.textContent = 'On';

    if (sacramentsState.loaded && !force) {
      renderSacramentsPanel();
      return;
    }

    pane.innerHTML = '<p class="sw-tool-loading">Loading…</p>';
    try {
      const res = await fetch(sacramentsApi(), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load requests.');
      sacramentsState = { loaded: true, requests: data.requests || [] };
      renderSacramentsPanel();
      setTimeout(() => loadSacramentsAvailability(), 250);
    } catch (err) {
      pane.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    }
  }

  // ── AVAILABILITY & ONLINE BOOKING (native, no third-party calendar) ──────
  const SAC_TIMEZONE_OPTIONS = [
    ['America/New_York', 'Eastern (New York)'],
    ['America/Chicago', 'Central (Chicago)'],
    ['America/Denver', 'Mountain (Denver)'],
    ['America/Phoenix', 'Mountain, no DST (Phoenix)'],
    ['America/Los_Angeles', 'Pacific (Los Angeles)'],
    ['America/Anchorage', 'Alaska (Anchorage)'],
    ['Pacific/Honolulu', 'Hawaii (Honolulu)']
  ];
  const SAC_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SAC_DEFAULT_SERVICE_TYPES = ['house_blessing', 'confession', 'counseling', 'baptism', 'wedding'];
  const SAC_EDITABLE_SERVICE_TYPES = [...SAC_DEFAULT_SERVICE_TYPES];
  const SAC_SCHEDULABLE_TYPES = ['house_blessing', 'confession', 'home_visit', 'office_visit', 'anointing', 'counseling'];

  function defaultSacramentServiceTypes() {
    return [...SAC_DEFAULT_SERVICE_TYPES];
  }

  function selectedSacramentServiceTypes() {
    const types = selectedSacramentPriest().serviceTypes;
    return Array.isArray(types) ? types : defaultSacramentServiceTypes();
  }

  function selectedSchedulableSacramentTypes() {
    const enabled = new Set(selectedSacramentServiceTypes());
    const builtIn = SAC_SCHEDULABLE_TYPES.filter(type => enabled.has(type));
    const custom = (selectedSacramentPriest().customServices || [])
      .filter(service => service.mode === 'schedule')
      .map(service => service.id);
    return [...builtIn, ...custom];
  }

  function selectedSacramentOfferingLabel(type) {
    const custom = (selectedSacramentPriest().customServices || []).find(service => service.id === type);
    return custom?.label || sacramentTypeLabel({ sacramentType: type });
  }

  let sacramentsAvailabilityState = { loaded: false, loading: false, error: '', timezone: '', rules: [], blackouts: [] };
  let sacramentsRuleEditor = { type: '', dayOfWeek: -1 };

  async function loadSacramentsAvailability(force) {
    const pane = document.getElementById('sacramentsPane');
    if (!pane || !currentParish) return;
    if (sacramentsAvailabilityState.loaded && !force) { renderSacramentsPanel(); return; }
    sacramentsAvailabilityState = { ...sacramentsAvailabilityState, loading: true, error: '' };
    renderSacramentsPanel();
    try {
      const res = await fetch(sacramentsApi('/availability'), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load availability.');
      sacramentsAvailabilityState = { loaded: true, loading: false, error: '', timezone: data.timezone || '', rules: data.rules || [], blackouts: data.blackouts || [] };
      renderSacramentsPanel();
    } catch (err) {
      sacramentsAvailabilityState = { ...sacramentsAvailabilityState, loaded: true, loading: false, error: err.message || 'Unable to load availability.' };
      renderSacramentsPanel();
    }
  }

  function renderSacramentsFeatureToggle() {
    const root = document.getElementById('sacramentsFeatureToggle');
    if (!root) return;
    const enabled = Boolean(currentParish?.sacramentsEnabled);
    root.innerHTML = `<label class="sac-admin-switch agapay-feature-switch" title="Show or hide Sacraments &amp; Services in My AGAPAY">
      <input type="checkbox" aria-label="Show Sacraments and Services in My AGAPAY" ${enabled ? 'checked' : ''} onchange="toggleSacramentsFeature(this)" />
      <span aria-hidden="true"></span>
      <em>${enabled ? 'On' : 'Off'}</em>
    </label>`;
  }

  function renderSacramentsDisabledPanel() {
    return `<div class="sac-admin-panel sac-admin-empty">
      <span>Off for parishioners</span>
      <h2>Sacraments &amp; Services is turned off</h2>
      <p>Parishioners will not see booking or request options while this is off. Turn it on when your parish is ready to receive requests.</p>
    </div>`;
  }

  async function toggleSacramentsFeature(input) {
    if (!currentParish) return;
    const enabled = Boolean(input?.checked);
    const previous = Boolean(currentParish.sacramentsEnabled);
    if (input) input.disabled = true;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sacramentsEnabled: enabled })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to update Sacraments & Services.');
      currentParish = { ...currentParish, ...(data.parish || {}), sacramentsEnabled: Boolean(data.parish?.sacramentsEnabled ?? enabled) };
      sacramentsState.loaded = false;
      sacramentsAvailabilityState = { loaded: false, loading: false, error: '', timezone: '', rules: [], blackouts: [] };
      setStatus(currentParish.sacramentsEnabled ? 'Sacraments & Services is on for parishioners.' : 'Sacraments & Services is off for parishioners.', 'success');
      syncModuleStatusNavigation('sacraments', moduleIncluded('sacraments'), currentParish.sacramentsEnabled);
      renderSacramentsFeatureToggle();
      loadSacramentsPanel(true);
    } catch (err) {
      currentParish.sacramentsEnabled = previous;
      if (input) input.checked = previous;
      syncModuleStatusNavigation('sacraments', moduleIncluded('sacraments'), previous);
      renderSacramentsFeatureToggle();
      setStatus(err.message, 'error');
    } finally {
      if (input) input.disabled = false;
    }
  }

  function renderSacramentsAvailability() {
    const st = sacramentsAvailabilityState;
    if (st.loading || !st.loaded) return renderSacramentsLoadingPanel('Loading weekly availability...');
    if (st.error) return renderSacramentsErrorPanel(st.error, 'loadSacramentsAvailability(true)');
    if (!st.timezone) {
      return `
        <div class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div>
              <span>Parish timezone</span>
              <h2>Set the timezone first</h2>
            </div>
          </div>
          <p class="sac-admin-muted">Online booking needs your parish timezone before weekly windows can be offered to families.</p>
          ${renderSacramentsTimezoneForm()}
        </div>`;
    }
    const rulesByType = groupSacramentsRulesByType();
    const schedulableTypes = selectedSchedulableSacramentTypes();
    return `
      ${renderSacramentsOfferingsEditor()}
      <div class="sac-admin-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Weekly recurring availability</span>
            <h2>Open booking windows</h2>
          </div>
          <button class="sac-admin-small-btn" type="button" onclick="loadSacramentsAvailability(true)">Refresh</button>
        </div>
        <p class="sac-admin-muted">Set the regular times parishioners may book. These are the windows My AGAPAY uses to show real openings.</p>
        ${renderSacramentsTimezoneForm()}
        <div class="sac-admin-availability-list">
          ${schedulableTypes.length
            ? schedulableTypes.map(type => renderSacramentsAvailabilityType(type, rulesByType[type] || [])).join('')
            : '<p class="sac-admin-empty-line">Turn on at least one bookable service above to add weekly availability.</p>'}
        </div>
      </div>
      <div class="sac-admin-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Add a window</span>
            <h2>New weekly block</h2>
          </div>
        </div>
        ${renderSacramentsAvailabilityAddForm()}
      </div>`;
  }

  function renderSacramentsTimezoneForm() {
    const st = sacramentsAvailabilityState;
    const tzOptions = '<option value="">Choose timezone...</option>' + SAC_TIMEZONE_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === st.timezone ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
    return `
      <div class="sac-admin-form-row sac-admin-timezone-row">
        <label>
          <span>Parish timezone</span>
          <select id="sacAvailTimezone">${tzOptions}</select>
        </label>
        <button class="sac-admin-outline-btn" type="button" onclick="saveSacramentsAvailabilityTimezone(this)">Save timezone</button>
      </div>`;
  }

  function groupSacramentsRulesByType() {
    const rulesByType = {};
    const priest = selectedSacramentPriest();
    selectedSchedulableSacramentTypes().forEach(t => { rulesByType[t] = []; });
    sacramentsAvailabilityState.rules
      .filter(r => (r.priestName || '') === (priest.name || ''))
      .forEach(r => { (rulesByType[r.sacramentType] = rulesByType[r.sacramentType] || []).push(r); });
    Object.values(rulesByType).forEach(rows => rows.sort((a, b) => (a.dayOfWeek - b.dayOfWeek) || String(a.startTime).localeCompare(String(b.startTime))));
    return rulesByType;
  }

  function renderSacramentsOfferingsEditor() {
    const priest = selectedSacramentPriest();
    const enabled = new Set(selectedSacramentServiceTypes());
    const custom = Array.isArray(priest.customServices) ? priest.customServices : [];
    return `
      <div class="sac-admin-panel sac-admin-offerings-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Online offerings</span>
            <h2>Available from ${escapeHtml(priest.name)}</h2>
          </div>
        </div>
        <p class="sac-admin-muted">Choose what parishioners can request online. Added services may begin with parish follow-up or use the booking windows below.</p>
        <div class="sac-admin-offering-checks">
          ${SAC_EDITABLE_SERVICE_TYPES.map(type => `
            <label>
              <input type="checkbox" ${enabled.has(type) ? 'checked' : ''} onchange="toggleSacramentsOffering('${type}', this.checked)" />
              <span><strong>${escapeHtml(sacramentTypeLabel({ sacramentType: type }))}</strong><small>${SAC_SCHEDULABLE_TYPES.includes(type) ? 'Online scheduling' : 'By request'}</small></span>
            </label>`).join('')}
        </div>
        ${custom.length ? `<div class="sac-admin-custom-offerings">${custom.map(service => `
          <article class="sac-admin-custom-offering">
            <div><span><strong>${escapeHtml(service.label)}</strong><small>Custom offering</small></span></div>
            <select aria-label="How ${escapeAttr(service.label)} is offered" onchange="updateCustomSacramentsOfferingMode('${escapeAttr(service.id)}', this.value)">
              <option value="request" ${service.mode !== 'schedule' ? 'selected' : ''}>By request</option>
              <option value="schedule" ${service.mode === 'schedule' ? 'selected' : ''}>Online scheduling</option>
            </select>
            <button type="button" aria-label="Remove ${escapeAttr(service.label)}" onclick="removeCustomSacramentsOffering('${escapeAttr(service.id)}')">×</button>
          </article>
        `).join('')}</div>` : ''}
        <div class="sac-admin-add-offering-box">
          <div><strong>Add another offering</strong></div>
          <label class="sac-admin-add-offering"><span>Offering name</span><input id="sacAvailCustomOffering" placeholder="e.g. Memorial Service" /></label>
          <label class="sac-admin-add-offering-mode"><span>How it works</span><select id="sacAvailCustomOfferingMode"><option value="request">By request</option><option value="schedule">Online scheduling</option></select></label>
          <button class="sac-admin-outline-btn" type="button" onclick="addCustomSacramentsOffering(this)">Add offering</button>
          <span id="sacAvailOfferingStatus" class="sac-admin-status-text"></span>
        </div>
      </div>`;
  }

  async function saveSelectedSacramentPriestOfferings(serviceTypes, customServices, statusMessage) {
    if (!currentParish) return;
    const priests = sacramentPriests().map((priest, index) => index === sacramentsPriestIndex
      ? { ...priest, serviceTypes, customServices }
      : priest);
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sacramentPriests: priests })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to update online offerings.');
    currentParish = { ...currentParish, ...(data.parish || {}), sacramentPriests: data.parish?.sacramentPriests || priests };
    setStatus(statusMessage || 'Online offerings updated.', 'success');
    renderSacramentsPriestPicker();
    renderSacramentsPanel();
  }

  async function toggleSacramentsOffering(type, enabled) {
    const priest = selectedSacramentPriest();
    const next = new Set(selectedSacramentServiceTypes());
    enabled ? next.add(type) : next.delete(type);
    try {
      await saveSelectedSacramentPriestOfferings([...next], priest.customServices || [], 'Online offerings updated.');
    } catch (err) {
      setStatus(err.message, 'error');
      renderSacramentsPanel();
    }
  }

  async function addCustomSacramentsOffering(btn) {
    const input = document.getElementById('sacAvailCustomOffering');
    const status = document.getElementById('sacAvailOfferingStatus');
    const label = String(input?.value || '').trim();
    const mode = document.getElementById('sacAvailCustomOfferingMode')?.value === 'schedule' ? 'schedule' : 'request';
    if (!label) {
      if (status) status.textContent = 'Enter an offering name.';
      return;
    }
    const aliases = { 'holy unction': 'anointing', unction: 'anointing', 'home visit': 'home_visit', 'office visit': 'office_visit' };
    const builtIn = aliases[label.toLowerCase()];
    const priest = selectedSacramentPriest();
    const types = new Set(selectedSacramentServiceTypes());
    const custom = [...(priest.customServices || [])];
    if (builtIn) {
      types.add(builtIn);
    } else {
      const id = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
      if (!id || id === 'custom_') return;
      if (!custom.some(service => service.id === id)) custom.push({ id, label, mode });
    }
    if (btn) btn.disabled = true;
    try {
      await saveSelectedSacramentPriestOfferings([...types], custom, `${label} added for ${priest.name}.`);
    } catch (err) {
      if (status) status.textContent = err.message;
      setStatus(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function updateCustomSacramentsOfferingMode(id, mode) {
    const priest = selectedSacramentPriest();
    const custom = (priest.customServices || []).map(service =>
      service.id === id ? { ...service, mode: mode === 'schedule' ? 'schedule' : 'request' } : service
    );
    try {
      await saveSelectedSacramentPriestOfferings(
        selectedSacramentServiceTypes(),
        custom,
        mode === 'schedule' ? 'Online scheduling enabled for this offering.' : 'This offering will now begin by request.'
      );
      sacramentsAvailabilityState.loaded = false;
      loadSacramentsAvailability(true);
    } catch (err) {
      setStatus(err.message, 'error');
      renderSacramentsPanel();
    }
  }

  async function removeCustomSacramentsOffering(id) {
    const priest = selectedSacramentPriest();
    const custom = (priest.customServices || []).filter(service => service.id !== id);
    try {
      await saveSelectedSacramentPriestOfferings(selectedSacramentServiceTypes(), custom, 'Offering removed.');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function renderSacramentsAvailabilityType(type, rules) {
    const label = selectedSacramentOfferingLabel(type);
    const rows = rules.length ? rules.map(r => `
      <div class="sac-admin-rule-row">
        <div>
          <strong>${SAC_DAY_LABELS[r.dayOfWeek]}</strong>
          <span>${escapeHtml(r.startTime)}-${escapeHtml(r.endTime)} · ${r.slotMinutes} min slots</span>
        </div>
        <button class="sac-admin-text-btn" type="button" onclick="deleteSacramentsAvailabilityRule('${r.id}')">Remove</button>
      </div>`).join('') : '<p class="sac-admin-empty-line">No weekly windows set.</p>';
    return `<div class="sac-admin-type-block">
      <h3>${escapeHtml(label)}</h3>
      ${rows}
    </div>`;
  }

  function renderSacramentsAvailabilityAddForm() {
    const types = selectedSchedulableSacramentTypes();
    return `
      <div class="sac-admin-form-grid">
        <label><span>Priest</span><input value="${escapeHtml(selectedSacramentPriest().name)}" disabled /></label>
        <label><span>Type</span><select id="sacAvailNewType" ${types.length ? '' : 'disabled'}>${types.map(t => `<option value="${t}">${escapeHtml(selectedSacramentOfferingLabel(t))}</option>`).join('')}</select></label>
        <label><span>Day</span><select id="sacAvailNewDay">${SAC_DAY_LABELS.map((l, i) => `<option value="${i}">${l}</option>`).join('')}</select></label>
        <label><span>Start</span><input type="time" id="sacAvailNewStart" value="16:00" /></label>
        <label><span>End</span><input type="time" id="sacAvailNewEnd" value="18:00" /></label>
        <label><span>Slot length</span><input type="number" min="5" max="240" step="5" id="sacAvailNewSlotMinutes" value="30" /></label>
      </div>
      <div class="sac-admin-actions">
        <button class="sac-admin-outline-btn" type="button" onclick="addSacramentsAvailabilityRule(this)" ${types.length ? '' : 'disabled'}>Add window</button>
        <span id="sacAvailRuleStatus" class="sac-admin-status-text"></span>
      </div>`;
  }

  function renderSacramentsBlackouts() {
    const st = sacramentsAvailabilityState;
    if (st.loading || !st.loaded) return renderSacramentsLoadingPanel('Loading blackout dates...');
    if (st.error) return renderSacramentsErrorPanel(st.error, 'loadSacramentsAvailability(true)');
    const priest = selectedSacramentPriest();
    const priestBlackouts = st.blackouts.filter(b => (b.priestName || '') === (priest.name || ''));
    const blackoutRows = priestBlackouts.length ? priestBlackouts.map(b => `
      <div class="sac-admin-blackout-row">
        <div>
          <strong>${escapeHtml(formatSacramentDateRange(b.startDate || b.date, b.endDate || b.date))}</strong>
          <span>${b.reason ? escapeHtml(b.reason) : 'Unavailable'}</span>
        </div>
        <button class="sac-admin-text-btn" type="button" onclick="deleteSacramentsAvailabilityBlackout('${b.id}')">Remove</button>
      </div>`).join('') : '<p class="sac-admin-empty-line">No blackout dates yet.</p>';
    return `
      <div class="sac-admin-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Blackout dates</span>
            <h2>Unavailable days</h2>
          </div>
          <button class="sac-admin-small-btn" type="button" onclick="loadSacramentsAvailability(true)">Refresh</button>
        </div>
        <p class="sac-admin-muted">Dates listed here will be hidden from parishioners looking for open booking times with ${escapeHtml(priest.name)}.</p>
        <div class="sac-admin-blackout-list">${blackoutRows}</div>
      </div>
      <div class="sac-admin-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Add a blackout date range</span>
            <h2>Block one day or a range</h2>
          </div>
        </div>
        <div class="sac-admin-form-row">
          <label><span>Priest</span><input value="${escapeHtml(priest.name)}" disabled /></label>
          <label><span>Start date</span><input type="date" id="sacAvailNewBlackoutStartDate" onchange="syncSacramentsBlackoutEndDate()" /></label>
          <label><span>End date</span><input type="date" id="sacAvailNewBlackoutEndDate" /></label>
          <label><span>Reason</span><input id="sacAvailNewBlackoutReason" placeholder="e.g. Clergy retreat" /></label>
        </div>
        <div class="sac-admin-actions">
          <button class="sac-admin-outline-btn" type="button" onclick="addSacramentsAvailabilityBlackout(this)">Add blackout</button>
          <span id="sacAvailBlackoutStatus" class="sac-admin-status-text"></span>
        </div>
      </div>`;
  }

  function renderSacramentsLoadingPanel(message) {
    return `<div class="sac-admin-panel sac-admin-empty"><span>Loading</span><h2>${escapeHtml(message)}</h2><p>Fetching the latest parish scheduling settings.</p></div>`;
  }

  function renderSacramentsErrorPanel(message, retryAction) {
    return `<div class="sac-admin-panel sac-admin-empty">
      <span>Scheduling</span>
      <h2>Could not load this section</h2>
      <p>${escapeHtml(message)}</p>
      <div class="sac-admin-actions" style="justify-content:center;"><button class="sac-admin-outline-btn" type="button" onclick="${retryAction}">Retry</button></div>
    </div>`;
  }

  async function saveSacramentsAvailabilityTimezone(btn) {
    const tz = document.getElementById('sacAvailTimezone')?.value || '';
    if (!tz || !currentParish) return;
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save timezone.');
      currentParish.timezone = tz;
      sacramentsAvailabilityState.timezone = tz;
      setStatus('Parish timezone saved.', 'success');
      renderSacramentsPanel();
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  async function addSacramentsAvailabilityRule(btn) {
    const status = document.getElementById('sacAvailRuleStatus');
    const sacramentType = document.getElementById('sacAvailNewType')?.value;
    const dayOfWeek = Number(document.getElementById('sacAvailNewDay')?.value);
    const startTime = document.getElementById('sacAvailNewStart')?.value;
    const endTime = document.getElementById('sacAvailNewEnd')?.value;
    const slotMinutes = Number(document.getElementById('sacAvailNewSlotMinutes')?.value) || 30;
    const priest = selectedSacramentPriest();
    if (!sacramentsAvailabilityState.timezone) {
      if (status) { status.textContent = 'Set and save your parish timezone first.'; status.style.color = 'var(--red, #8b2020)'; }
      return;
    }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    if (status) status.textContent = '';
    try {
      const res = await fetch(sacramentsApi('/availability/rules'), {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sacramentType, dayOfWeek, startTime, endTime, slotMinutes, priestName: priest.name, priestEmail: priest.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to add window.');
      if (status) { status.textContent = 'Window added.'; status.style.color = 'var(--green, #2a7a4b)'; }
      await loadSacramentsAvailability(true);
    } catch (err) {
      if (status) { status.textContent = err.message; status.style.color = 'var(--red, #8b2020)'; }
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  async function deleteSacramentsAvailabilityRule(ruleId) {
    if (!currentParish) return;
    try {
      const res = await fetch(sacramentsApi('/availability/rules/' + encodeURIComponent(ruleId)), { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Unable to remove window.');
      await loadSacramentsAvailability(true);
    } catch (err) { setStatus(err.message, 'error'); }
  }

  async function addSacramentsAvailabilityBlackout(btn) {
    const status = document.getElementById('sacAvailBlackoutStatus');
    const startDate = document.getElementById('sacAvailNewBlackoutStartDate')?.value;
    const endDate = document.getElementById('sacAvailNewBlackoutEndDate')?.value || startDate;
    const reason = document.getElementById('sacAvailNewBlackoutReason')?.value || '';
    const priest = selectedSacramentPriest();
    if (!startDate) { if (status) { status.textContent = 'Choose a start date.'; status.style.color = 'var(--red, #8b2020)'; } return; }
    if (endDate < startDate) { if (status) { status.textContent = 'End date must be on or after the start date.'; status.style.color = 'var(--red, #8b2020)'; } return; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    if (status) status.textContent = '';
    try {
      const res = await fetch(sacramentsApi('/availability/blackouts'), {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, reason, priestName: priest.name, priestEmail: priest.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to add blackout date.');
      if (status) { status.textContent = 'Blackout added.'; status.style.color = 'var(--green, #2a7a4b)'; }
      await loadSacramentsAvailability(true);
    } catch (err) {
      if (status) { status.textContent = err.message; status.style.color = 'var(--red, #8b2020)'; }
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  async function deleteSacramentsAvailabilityBlackout(blackoutId) {
    if (!currentParish) return;
    try {
      const res = await fetch(sacramentsApi('/availability/blackouts/' + encodeURIComponent(blackoutId)), { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Unable to remove blackout date.');
      await loadSacramentsAvailability(true);
    } catch (err) { setStatus(err.message, 'error'); }
  }

  function renderSacramentsUpsell() {
    return `
      <div class="sw-suite-tool-grid" style="grid-template-columns:1fr;">
        <div class="sw-suite-tool-card" style="text-align:center;padding:2.2rem 1.5rem;">
          <strong class="sw-tool-card-title">Sacraments &amp; Services is included on the Parish tier</strong>
          <p class="sw-tool-card-desc" style="max-width:480px;margin:0.6rem auto 1.2rem;">
            Let parishioners request house blessings, baptisms, weddings, and more directly from My AGAPAY —
            routed straight to your parish dashboard.
          </p>
          <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Review Parish tier</button>
        </div>
      </div>`;
  }

  // Groups requests by urgency rather than a flat active/history split, so
  // a priest can tell at a glance what needs attention: unacknowledged
  // requests (oldest first, flagged overdue past 48h — a client-side
  // "tickler" highlight computed from data already on the request, no
  // backend change needed), what's scheduled in the next 7 days, what's
  // scheduled further out, and closed history.
  const SACRAMENT_OVERDUE_HOURS = 48;

  function daysWaiting(createdAt) {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  }

  function isOverdue(row) {
    if (row.status !== 'requested' || !row.createdAt) return false;
    return (Date.now() - new Date(row.createdAt).getTime()) > SACRAMENT_OVERDUE_HOURS * 3600000;
  }

  function isThisWeek(row) {
    if (row.status !== 'scheduled' || !row.confirmedDate) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAhead = new Date(today.getTime() + 7 * 86400000);
    const confirmed = new Date(row.confirmedDate + 'T00:00:00');
    return confirmed >= today && confirmed <= weekAhead;
  }

  function renderSacramentsPanel() {
    const pane = document.getElementById('sacramentsPane');
    if (!pane) return;
    document.querySelectorAll('[data-sac-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sacTab === sacramentsDashboardTab);
    });
    if (sacramentsDashboardTab === 'availability') {
      pane.innerHTML = renderSacramentsAvailability();
      return;
    }
    if (sacramentsDashboardTab === 'blackouts') {
      pane.innerHTML = renderSacramentsBlackouts();
      return;
    }
    if (sacramentsDashboardTab === 'rules') {
      pane.innerHTML = renderSacramentsRules();
      return;
    }
    if (sacramentsDashboardTab === 'calendar') {
      pane.innerHTML = renderSacramentsCalendar();
      return;
    }
    const requests = sacramentsState.requests || [];
    if (!requests.length) {
      pane.innerHTML = `
        <div class="sac-admin-panel sac-admin-empty">
          <span>Requests</span>
          <h2>No requests yet</h2>
          <p>When a parishioner requests a blessing, baptism, wedding, counseling appointment, or other service from My AGAPAY, it will appear here.</p>
        </div>`;
      return;
    }

    const needsResponse = requests.filter(r => r.status === 'requested')
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const thisWeek = requests.filter(r => isThisWeek(r))
      .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
    const scheduled = requests.filter(r => r.status === 'scheduled' && !isThisWeek(r))
      .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
    const acknowledged = requests.filter(r => r.status === 'acknowledged');
    const history = requests.filter(r => ['completed', 'declined', 'cancelled'].includes(r.status));

    const section = (title, rows, opts) => rows.length
      ? `<section class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div><span>Requests</span><h2>${title}</h2></div>
            <b>${rows.length}</b>
          </div>
          <div class="sac-admin-request-list">${rows.map(r => sacramentParishRow(r, opts)).join('')}</div>
        </section>`
      : '';

    pane.innerHTML = `
      ${section('Needs a response', needsResponse, { showAge: true })}
      ${section('Scheduled this week', thisWeek, {})}
      ${section('Acknowledged', acknowledged, {})}
      ${section('Scheduled', scheduled, {})}
      ${history.length ? `<details class="sac-admin-panel sac-admin-history"><summary><span>History</span><h2>Closed requests <b>${history.length}</b></h2></summary><div class="sac-admin-request-list">${history.map(r => sacramentParishRow(r, {})).join('')}</div></details>` : ''}
    `;
  }

  function sacramentParishRow(row, opts = {}) {
    const typeLabel = sacramentTypeLabel(row);
    const statusOptions = SACRAMENT_STATUS_OPTIONS.map(s => `<option value="${s}" ${s === row.status ? 'selected' : ''}>${SACRAMENT_STATUS_LABELS[s]}</option>`).join('');
    const overdue = opts.showAge && isOverdue(row);
    const ageChip = opts.showAge
      ? `<span class="sac-age-chip ${overdue ? 'overdue' : ''}">${daysWaiting(row.createdAt)}d waiting</span>`
      : '';
    const requested = [row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(' · ');
    const confirmed = [row.confirmedDate, row.confirmedTime].filter(Boolean).join(' · ');
    const meta = [
      row.participantNames || row.donorEmail,
      confirmed || requested || formatSacramentDisplayDate(row.createdAt),
      row.clergyAssigned
    ].filter(Boolean).join(' · ');
    return `
      <article class="sac-admin-request${overdue ? ' overdue' : ''}" id="sacrow-${row.id}">
        <div class="sac-admin-request-main">
          <div class="sac-admin-request-title">
            <strong>${escapeHtml(typeLabel)}</strong>
            <span class="sac-admin-pill ${escapeAttr(row.status)}">${escapeHtml(SACRAMENT_STATUS_LABELS[row.status] || row.status)}</span>
            ${ageChip}
          </div>
          <span class="sac-admin-request-meta">${escapeHtml(meta || 'No date yet')}</span>
          <span class="sac-admin-request-contact">${escapeHtml(row.donorEmail)}${row.phone ? ' · ' + escapeHtml(row.phone) : ''}</span>
        </div>
        <button class="sac-admin-text-btn" type="button" onclick="toggleSacramentRequestEditor('${row.id}')">Edit</button>
        <div class="sac-admin-request-details">
          ${requested ? `<span><strong>Requested:</strong> ${escapeHtml(requested)}</span>` : ''}
          ${row.locationAddress ? `<span><strong>Location:</strong> ${escapeHtml(row.locationAddress)}</span>` : ''}
          ${row.notes ? `<span><strong>Notes:</strong> ${escapeHtml(row.notes)}</span>` : ''}
        </div>
        <div class="sac-admin-request-editor" id="saceditor-${row.id}" hidden>
          <div class="sac-admin-form-grid">
            <label><span>Status</span><select id="sacstatus-${row.id}" onchange="onSacramentStatusChange('${row.id}')">${statusOptions}</select></label>
            <label><span>Confirmed date</span><input type="date" id="sacdate-${row.id}" value="${escapeAttr(row.confirmedDate || '')}" /></label>
            <label><span>Confirmed time</span><input type="text" id="sactime-${row.id}" value="${escapeAttr(row.confirmedTime || '')}" placeholder="10:00 AM" /></label>
            <label><span>Clergy assigned</span><input type="text" id="sacclergy-${row.id}" value="${escapeAttr(row.clergyAssigned || '')}" /></label>
          </div>
          <div class="sac-admin-request-fields" id="sacfields-${row.id}" style="${row.status === 'scheduled' ? '' : 'display:none;'}"></div>
          <label class="sac-admin-wide-field" id="sacdecline-${row.id}" style="${row.status === 'declined' ? '' : 'display:none;'}"><span>Reason shown to the parishioner</span><input type="text" id="sacreason-${row.id}" value="${escapeAttr(row.declineReason || '')}" /></label>
          <label class="sac-admin-wide-field"><span>Internal notes</span><textarea id="sacnotes-${row.id}" rows="2">${escapeHtml(row.parishNotes || '')}</textarea></label>
          <div class="sac-admin-actions">
            <button class="sac-admin-outline-btn" type="button" onclick="saveSacramentRequest('${row.id}')">Save</button>
          </div>
        </div>
      </article>`;
  }

  function toggleSacramentRequestEditor(id) {
    const editor = document.getElementById('saceditor-' + id);
    if (editor) editor.hidden = !editor.hidden;
  }

  function renderSacramentsRules() {
    const st = sacramentsAvailabilityState;
    if (st.loading || !st.loaded) return renderSacramentsLoadingPanel('Loading sacrament rules...');
    if (st.error) return renderSacramentsErrorPanel(st.error, 'loadSacramentsAvailability(true)');
    const rulesByType = groupSacramentsRulesByType();
    const offeredTypes = [
      ...selectedSacramentServiceTypes(),
      ...(selectedSacramentPriest().customServices || []).map(service => service.id)
    ];
    const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `
      ${renderSacramentsOfferingsEditor()}
      <div class="sac-admin-panel">
        <div class="sac-admin-panel-head">
          <div>
            <span>Sacrament rules</span>
            <h2>Allowed booking days</h2>
          </div>
          <button class="sac-admin-small-btn" type="button" onclick="loadSacramentsAvailability(true)">Refresh</button>
        </div>
        <p class="sac-admin-muted">Choose a day to view its current windows or publish a new opening. Highlighted days already have availability.</p>
        <div class="sac-admin-rules-list">
          ${offeredTypes.map(type => {
            const typeRules = rulesByType[type] || [];
            const activeDays = new Set(typeRules.map(rule => Number(rule.dayOfWeek)));
            const schedulable = selectedSchedulableSacramentTypes().includes(type);
            const selectedDay = sacramentsRuleEditor.type === type ? Number(sacramentsRuleEditor.dayOfWeek) : -1;
            return `<div class="sac-admin-rules-row">
              <strong>${escapeHtml(selectedSacramentOfferingLabel(type))}</strong>
              <div class="sac-admin-day-chips">
                ${schedulable
                  ? dayShort.map((label, index) => `<button type="button" class="${activeDays.has(index) ? 'active' : ''} ${selectedDay === index ? 'selected' : ''}" aria-expanded="${selectedDay === index ? 'true' : 'false'}" onclick="selectSacramentRuleDay('${escapeAttr(type)}', ${index})">${label}</button>`).join('')
                  : '<span class="active">Request only</span>'}
              </div>
              ${schedulable && selectedDay >= 0 ? renderSacramentRuleDayEditor(type, selectedDay, typeRules) : ''}
            </div>`;
          }).join('') || '<p class="sac-admin-empty-line">No online offerings selected.</p>'}
        </div>
      </div>`;
  }

  function selectSacramentRuleDay(type, dayOfWeek) {
    const isSame = sacramentsRuleEditor.type === type && Number(sacramentsRuleEditor.dayOfWeek) === Number(dayOfWeek);
    sacramentsRuleEditor = isSame ? { type: '', dayOfWeek: -1 } : { type, dayOfWeek: Number(dayOfWeek) };
    renderSacramentsPanel();
  }

  function renderSacramentRuleDayEditor(type, dayOfWeek, rules) {
    const dayRules = (rules || []).filter(rule => Number(rule.dayOfWeek) === Number(dayOfWeek));
    const label = selectedSacramentOfferingLabel(type);
    return `
      <div class="sac-admin-rule-window-editor">
        <div class="sac-admin-rule-window-head">
          <div><span>${escapeHtml(label)}</span><strong>${SAC_DAY_LABELS[dayOfWeek]} windows</strong></div>
          <button type="button" aria-label="Close ${escapeAttr(SAC_DAY_LABELS[dayOfWeek])} window editor" onclick="selectSacramentRuleDay('${escapeAttr(type)}', ${dayOfWeek})">×</button>
        </div>
        ${dayRules.length ? `<div class="sac-admin-rule-window-list">${dayRules.map(rule => `
          <div>
            <span><strong>${escapeHtml(rule.startTime)}–${escapeHtml(rule.endTime)}</strong><small>${Number(rule.slotMinutes) || 30} minute appointments</small></span>
            <button type="button" onclick="deleteSacramentsAvailabilityRule('${escapeAttr(rule.id)}')">Remove</button>
          </div>`).join('')}</div>` : '<p class="sac-admin-empty-line">No windows published for this day yet.</p>'}
        ${sacramentsAvailabilityState.timezone ? `
          <div class="sac-admin-rule-window-form">
            <input type="hidden" id="sacAvailNewType" value="${escapeAttr(type)}" />
            <input type="hidden" id="sacAvailNewDay" value="${dayOfWeek}" />
            <label><span>Starts</span><input type="time" id="sacAvailNewStart" value="16:00" /></label>
            <label><span>Ends</span><input type="time" id="sacAvailNewEnd" value="18:00" /></label>
            <label><span>Appointment length</span><select id="sacAvailNewSlotMinutes">
              <option value="15">15 minutes</option>
              <option value="30" selected>30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select></label>
            <button class="sac-admin-outline-btn" type="button" onclick="addSacramentsAvailabilityRule(this)">Add window</button>
            <span id="sacAvailRuleStatus" class="sac-admin-status-text" aria-live="polite"></span>
          </div>` : `
          <div class="sac-admin-rule-timezone">
            <p class="sac-admin-muted">Set the parish timezone before publishing this window.</p>
            ${renderSacramentsTimezoneForm()}
          </div>`}
      </div>`;
  }

  function formatSacramentDisplayDate(value) {
    if (!value) return '';
    const date = new Date(String(value).includes('T') ? value : String(value) + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderSacramentsCalendar() {
    const st = sacramentsAvailabilityState;
    if (st.loading || !st.loaded) return renderSacramentsLoadingPanel('Loading calendar...');
    if (st.error) return renderSacramentsErrorPanel(st.error, 'loadSacramentsAvailability(true)');
    const priest = selectedSacramentPriest();
    const requests = (sacramentsState.requests || []).filter(row =>
      row.status === 'scheduled' && (row.clergyAssigned || '') === (priest.name || '')
    );
    const blackouts = (st.blackouts || []).filter(row =>
      (row.priestName || '') === (priest.name || '')
    );
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = new Date(year, month, 1);
    const startOffset = monthStart.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const byDay = {};
    requests.forEach(row => {
      const date = row.confirmedDate || row.requestedDate || '';
      if (!date.startsWith(monthKey)) return;
      const day = Number(date.slice(-2));
      if (!day) return;
      byDay[day] = byDay[day] || [];
      byDay[day].push(row);
    });
    blackouts.forEach(row => {
      const start = String(row.startDate || row.date || '');
      const end = String(row.endDate || row.date || start);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${monthKey}-${String(day).padStart(2, '0')}`;
        if (date < start || date > end) continue;
        byDay[day] = byDay[day] || [];
        byDay[day].push({ blackout: true, sacramentType: 'blackout', confirmedTime: 'All day', clergyAssigned: row.reason || 'Unavailable' });
      }
    });
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push('<span class="sac-admin-cal-cell empty"></span>');
    for (let day = 1; day <= daysInMonth; day++) {
      const items = byDay[day] || [];
      const hasBlackout = items.some(item => item.blackout);
      const hasScheduled = items.some(item => !item.blackout);
      const stateClass = hasBlackout && hasScheduled ? 'has-blackout has-scheduled' : hasBlackout ? 'has-blackout' : hasScheduled ? 'has-scheduled' : '';
      cells.push(`<button class="sac-admin-cal-cell ${stateClass}" type="button" onclick="selectSacramentsCalendarDay(${day})">${day}</button>`);
    }
    const firstBookedDay = Object.keys(byDay).map(Number).sort((a, b) => a - b)[0] || now.getDate();
    const selected = Number(document.getElementById('sacramentsCalendarSelectedDay')?.value || firstBookedDay);
    const selectedItems = byDay[selected] || [];
    return `
      <div class="sac-admin-calendar-layout">
        <input type="hidden" id="sacramentsCalendarSelectedDay" value="${selected}" />
        <section class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div>
              <span>${escapeHtml(priest.name)}’s calendar</span>
              <h2>${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            </div>
          </div>
          <div class="sac-admin-weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="sac-admin-calendar-grid">${cells.join('')}</div>
          <div class="sac-admin-calendar-legends">
            <div class="sac-admin-legend blackout"><i></i><span>Blackout date</span></div>
            <div class="sac-admin-legend scheduled"><i></i><span>Scheduled date</span></div>
          </div>
        </section>
        <section class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div>
              <span>Selected day</span>
              <h2>${formatSacramentDisplayDate(`${monthKey}-${String(selected).padStart(2, '0')}`)}</h2>
            </div>
          </div>
          <div class="sac-admin-day-list">
            ${selectedItems.length ? selectedItems.map(item => `
              <div class="sac-admin-day-card ${item.blackout ? 'blackout' : 'scheduled'}">
                <strong>${item.blackout ? 'Blackout' : escapeHtml(sacramentTypeLabel(item))}</strong>
                <span>${escapeHtml(item.confirmedTime || item.requestedTimeWindow || 'Time TBD')} · ${escapeHtml(item.clergyAssigned || item.donorEmail || '')}</span>
              </div>`).join('') : '<p class="sac-admin-empty-line">No bookings this day.</p>'}
          </div>
        </section>
      </div>`;
  }

  function selectSacramentsCalendarDay(day) {
    const input = document.getElementById('sacramentsCalendarSelectedDay');
    if (input) input.value = String(day);
    renderSacramentsPanel();
  }

  function onSacramentStatusChange(id) {
    const select = document.getElementById('sacstatus-' + id);
    const status = select?.value || '';
    const scheduledFields = document.getElementById('sacfields-' + id);
    const declineFields = document.getElementById('sacdecline-' + id);
    if (scheduledFields) scheduledFields.style.display = status === 'scheduled' ? '' : 'none';
    if (declineFields) declineFields.style.display = status === 'declined' ? '' : 'none';
  }

  async function saveSacramentRequest(id) {
    const status = document.getElementById('sacstatus-' + id)?.value;
    const body = {
      status,
      confirmedDate: document.getElementById('sacdate-' + id)?.value || '',
      confirmedTime: document.getElementById('sactime-' + id)?.value || '',
      clergyAssigned: document.getElementById('sacclergy-' + id)?.value || '',
      declineReason: document.getElementById('sacreason-' + id)?.value || '',
      parishNotes: document.getElementById('sacnotes-' + id)?.value || ''
    };
    try {
      const res = await fetch(sacramentsApi('/' + encodeURIComponent(id)), {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to save.');
      setStatus('Request updated.', 'success');
      sacramentsState.loaded = false;
      await loadSacramentsPanel(true);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

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
    const rows = [
      ...editableFunds.map((item, index) => ({ kind: 'fund', label: 'Fund', item, index })),
      ...editableCampaigns.map(item => ({ kind: 'campaign', label: 'Campaign', item })),
      ...editableFeastCampaigns.filter(item => item.enabled !== false).map(item => ({ kind: 'campaign', label: 'Feast campaign', item }))
    ];
    return `<div class="options-summary-card"><div class="options-summary-head"><span>Active giving options</span><small>Based on paid gifts in AGAPAY</small></div><div class="options-progress-table">${rows.length ? rows.map(row => {
      const progress = optionProgress(row.item, row.kind);
      const isEditableFund = row.kind === 'fund' && Number.isInteger(row.index);
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
        <div class="option-builder-title">Add a fund</div>
        <p class="section-note">Funds shown above are the source of truth for donor choices and the Accounting suite. Saving creates or updates the matching accounting funds automatically.</p>
        <div class="builder-grid"><select id="fundPreset" onchange="fillGivingPreset('fund')"><option value="custom" selected>Custom fund — name it yourself</option><optgroup label="Start from a preset">${presetOptions(fundPresets)}</optgroup></select><input id="fundAccountNumber" maxlength="24" placeholder="Fund account number (optional), e.g. 2100" /><input id="fundName" maxlength="120" placeholder="Custom fund name, e.g. New Iconostasis Fund" /><select id="fundRestriction"><option value="unrestricted">Unrestricted</option><option value="board_designated">Board designated</option><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option></select><textarea id="fundDescription" maxlength="500" placeholder="Describe what this parish-created fund supports."></textarea><button class="btn btn-gold" onclick="addGivingOption('fund')">Add custom fund</button></div>
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

  function addGivingOption(kind) { const prefix=kind==='fund'?'fund':'campaign'; const nameEl=document.getElementById(`${prefix}Name`); const descEl=document.getElementById(`${prefix}Description`); const name=nameEl?.value.trim(); if(!name){setStatus(`Enter a ${kind} name.`,'error');return;} const id=slugifyLocal(name); const target=kind==='fund'?editableFunds:editableCampaigns; if(target.some((item)=>item.id===id||String(item.name||'').trim().toLowerCase()===name.toLowerCase())){setStatus(`A ${kind} with that name already exists.`,'error');return;} const item={id,name,description:descEl?.value.trim()||(kind==='fund'?'Designated support for this parish.':'Parish-approved alms for this need.'),accountNumber:document.getElementById(`${prefix}AccountNumber`)?.value.trim()||'',restrictionType:document.getElementById(`${prefix}Restriction`)?.value||(kind==='campaign'?'donor_restricted_temporary':'unrestricted'),...(kind==='fund'?{fundType:document.getElementById('fundPreset')?.value==='custom'?'custom':'preset'}:{})}; if(kind==='campaign'){const goalCents=parseDollarsToCents(document.getElementById('campaignGoal')?.value); if(goalCents>0) item.goalCents=goalCents;} target.push(item); nameEl.value=''; descEl.value=''; const goalEl=document.getElementById(`${prefix}Goal`); if(goalEl) goalEl.value=''; renderGivingOptionsEditor(); setStatus(`${kind==='fund'?'Fund':'Campaign'} added. Save when ready.`,'success'); }
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
    if (!parishId || !document.getElementById('parishToken').value.trim()) { setStatus('Enter the parish ID and password.','error'); return; }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    const loadBtn = document.getElementById('loadBtn');
    if (loadBtn) { loadBtn.classList.add('loading'); loadBtn.disabled = true; }
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId), { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load dashboard');
      currentParish = data.parish;
      await refreshSubscriptionStatus({ quiet: true });
      await refreshStripeStatus({ quiet: true });
      saveSession();
      renderDashboard();
      showParishFeatureRequestPopup(data.featureRequests || []);
      updateStewardshipBadges(isParishPlusActive(), { renderPanel: false });
      setTimeout(() => loadGivingSummary(), 250);
      setTimeout(() => loadRecurringHealth(), 500);
      setTimeout(() => renderQrCode(), 750);
      setTimeout(() => loadCommemorations(), 1000);
      if (['history', 'givers', 'options'].includes(activeTab)) {
        loadGivingHistory();
      } else {
        setTimeout(() => loadGivingHistory(), 1250);
      }
      stewardshipState.loaded = false;
      if (activeTab === 'stewardship') loadStewardshipPanel(true);
      if (activeTab === 'reconcile') loadReconciliation();
    } catch (err) { setStatus(err.message,'error'); }
    finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      if (loadBtn) { loadBtn.classList.remove('loading'); loadBtn.disabled = false; }
    }
  }

  // ── SETUP WIZARD ─────────────────────────────────────────
  function tierPriceLabel(tier) { if(!tier) return ''; if(tier.monthlyCents===null) return 'Custom'; if(Number(tier.monthlyCents)===0) return '$0/mo'; return `${money(tier.monthlyCents)}/mo`; }
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
    if (!currentParish || !currentParish.parishId || !currentParish.stripeAccountId) return;
    const status = currentParish.stripeAccountStatus || '';
    if (!options?.force && ['charges_enabled','payouts_enabled'].includes(status)) return;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/stripe-refresh', { method:'POST', headers:authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh Stripe status');
      if (data.parish) currentParish = { ...currentParish, ...data.parish };
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
  function renderSetupWizard() {
    const pane=document.getElementById('setupWizardPane'); if(!pane||!currentParish) return;
    const setup=currentParish.setup||{}; const stripeDone=Boolean(setup.stripeConnected); const billingDone=Boolean(setup.billingActive);
    if(stripeDone&&billingDone){pane.innerHTML='';return;}
    const tierOptions=tierOptionsMarkup(currentParish.subscriptionTier);
    const demoEligible=Boolean(currentParish.subscriptionIntroDemoEligible);
    const pendingDemo=currentParish.subscriptionStatus==='trial_checkout_created';
    const freeDemoPath=demoEligible||pendingDemo;
    pane.innerHTML=`<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="setup-title">${freeDemoPath?'First-time setup':'Continue with AGAPAY'}</div><p class="setup-copy">${freeDemoPath?'Start with a free 30-day AGAPAY demo, then connect Stripe so the parish can receive gifts.':'Your free demo has ended. Choose a tier and add billing information to restore subscription access.'}</p><div class="setup-steps"><div class="setup-step done">${setupCheckMarkup()}<div><strong>1. Contact info verified</strong><span>Your canonical parish registration has been verified.</span></div></div><div class="setup-step done">${setupCheckMarkup()}<div><strong>2. Choose your ${freeDemoPath?'demo ':''}tier</strong><span>${escapeHtml(currentParish.subscriptionTierLabel || currentParish.subscriptionTier || 'Your selected tier')} determines which tools are available.</span></div></div><div class="setup-step ${billingDone?'done':''}">${setupCheckMarkup()}<div><strong>3. ${freeDemoPath?'Start the free demo':'Activate the subscription'}</strong><span>${billingDone?'Your free demo is active. No card was required.':pendingDemo?'Finish the no-card demo confirmation to activate AGAPAY.':demoEligible?'Confirm the free 30-day demo. No card is required.':'Add billing information to continue with the selected tier.'}</span></div></div><div class="setup-step ${stripeDone?'done':''}">${setupCheckMarkup()}<div><strong>4. Connect Stripe for donations</strong><span>${stripeDone?'Stripe is connected for parish giving.':billingDone?'Connect the parish payout account. This is separate from AGAPAY billing.':freeDemoPath?'Donation setup unlocks after the demo begins.':'Donation setup remains separate from the AGAPAY subscription.'}</span></div></div></div></div><div class="setup-action-panel">${billingDone?'':`<label for="setupSubscriptionTier">AGAPAY ${freeDemoPath?'demo ':''}tier</label><select id="setupSubscriptionTier">${tierOptions}</select><button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startSubscriptionCheckout(this)">${pendingDemo?'Continue demo setup':demoEligible?'Start free 30-day demo':'Activate subscription'}</button><p class="setup-copy setup-action-copy">${freeDemoPath?'No card required. You will add billing information only if you choose to continue after the demo.':'Secure checkout collects the billing information needed to reactivate AGAPAY.'}</p>`}${billingDone&&!stripeDone?'<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startStripeOnboarding(this)">Connect Stripe for donations</button><p class="setup-copy setup-action-copy">This asks for parish payout and organization details—not payment for AGAPAY.</p>':''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">${freeDemoPath?'Open free demo setup':'Open subscription setup'}</a><p id="setupLinkHelp"></p></div></div></div></div>`;
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
    const standardPriceLabel = p.subscriptionMonthlyCents === 0 ? 'Free forever' : p.subscriptionMonthlyCents ? (money(p.subscriptionMonthlyCents) + '/mo') : 'Custom pricing';
    const priceLabel = demoActive ? `${demoDays} day${demoDays===1?'':'s'} remaining` : standardPriceLabel;
    const billingActive = Boolean(p.setup?.billingActive);
    const stripeConnected = Boolean(p.setup?.stripeConnected);

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
        </div>
        <button class="pdx-sub-plan-action" type="button" onclick="switchTab('settings')">${demoActive?'Add billing details or manage demo':ent.parishPlusIncludedInTier ? 'Manage subscription' : 'Explore upgrade options'}<span aria-hidden="true">→</span></button>
      </div>
      <div class="pdx-sub-modules">
        <div class="pdx-sub-modules-head"><div><span>Plan access</span><strong>Included parish tools</strong></div><button type="button" onclick="switchTab('settings')">Compare tiers</button></div>
        <div class="pdx-sub-module-grid">
          ${moduleRow('Giving Plus', 'givingPlus', 'Custom funds, campaigns, givers, and reconciliation', 'Giving Plus')}
          ${moduleRow('Stewardship Health', 'stewardshipHealth', 'Pledges, insights, and stewardship reporting', 'Stewardship')}
          ${moduleRow('Bookstore', 'bookstore', 'Parish commerce and Stripe-powered sales', 'Stewardship')}
          ${moduleRow('Parish Directory', 'directory', 'Member, household, and ministry records', 'Parish')}
          ${moduleRow('Sacraments & Services', 'sacraments', 'Pastoral requests and clergy coordination', 'Parish')}
          ${moduleRow('Text-to-Give', 'textToGive', 'Keywords that route donors to your giving page', 'Parish')}
        </div>
      </div>`;
  }

  function updateTierScopedNavigation() {
    const stewardshipIncluded = !isStarterTier() && (isParishTier() || isParishPlusActive());
    const directoryActive = moduleIncluded('directory');
    const accountingIncluded = moduleIncluded('accounting');
    const accountingNav = document.getElementById('nav-accounting');
    const accountingBadge = document.getElementById('accountingNavSoonBadge');
    const stewardshipNav = document.getElementById('nav-stewardship');
    stewardshipNav?.removeAttribute('hidden');
    syncTierRequirementNavigation('stewardship', 'Stewardship', stewardshipIncluded);
    if (stewardshipNav) stewardshipNav.title = stewardshipIncluded ? 'Stewardship Health' : 'Requires Stewardship';
    document.getElementById('nav-directory')?.removeAttribute('hidden');
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="directory"]').forEach((el) => {
      el.hidden = false;
    });
    syncTierRequirementNavigation('directory', 'Parish', directoryActive);
    syncTierRequirementNavigation('accounting', 'Parish', accountingIncluded);
    if (accountingNav) accountingNav.title = accountingIncluded ? 'Accounting workspace' : 'Requires Parish';
    if (accountingBadge) accountingBadge.hidden = !accountingIncluded;
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="accounting"]').forEach((el) => {
      const badge = el.querySelector('.mobile-soon-badge');
      if (badge) badge.hidden = !accountingIncluded;
    });
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="stewardship"]').forEach((el) => {
      el.hidden = false;
      el.classList.toggle('mobile-tab-link--gated', !stewardshipIncluded);
    });
    orderTierNavigation();
  }

  function orderTierNavigation() {
    // Navigation follows the subscription ladder: Giving, Stewardship,
    // Parish, announced future modules, then account settings.
    const tierOrder = [
      'giving', 'qr', 'history', 'options', 'campaigns', 'givers', 'reconcile',
      'stewardship', 'bookstore',
      'sacraments', 'directory',
      'accounting', 'text',
      'settings'
    ];
    const sidebar = document.querySelector('.sidebar-nav');
    tierOrder.forEach((tab) => {
      const item = document.getElementById(`nav-${tab}`);
      if (sidebar && item) sidebar.appendChild(item);
    });
    const mobile = document.querySelector('.mobile-tabbar');
    tierOrder.forEach((tab) => {
      const item = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
      if (mobile && item) mobile.appendChild(item);
    });
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
    chip.className   = 'sidebar-status-chip ' + (p.givingStatus || 'active');
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
    const tierOptions = tierOptionsMarkup(p.subscriptionTier);
    document.getElementById('settingsPane').innerHTML = `
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Parish logo</label>
          <div class="parish-logo-settings">
            ${!hasGivingPlusAccess()
              ? `<div class="parish-logo-preview parish-logo-placeholder">Giving Plus<br>feature</div>
                <div>
                  <p class="section-note">Add your parish logo to the dashboard, public giving pages, campaign pages, and church search with Giving Plus. Any logo previously uploaded is preserved and will reappear if you upgrade.</p>
                  <button class="btn btn-gold" type="button" onclick="switchTab('settings')">Upgrade to Giving Plus</button>
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
        <div class="form-group"><label class="form-label" for="givingStatus">Giving page status</label><select id="givingStatus"><option value="active" ${p.givingStatus==='active'?'selected':''}>Active</option><option value="paused" ${p.givingStatus==='paused'?'selected':''}>Paused</option><option value="hidden" ${p.givingStatus==='hidden'?'selected':''}>Hidden</option></select></div>
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
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Current tier</label><input value="${escapeHtml(p.subscriptionTierLabel || p.subscriptionTier || 'Not selected')}" disabled /></div>
        <div class="form-group"><label class="form-label">Billing status</label><input value="${escapeHtml(statusLabel(p.subscriptionStatus || 'not_started'))}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="subscriptionTierUpgrade">Change AGAPAY tier</label><select id="subscriptionTierUpgrade">${tierOptions}</select></div>
      </div>
      <p class="section-note">${p.parishId === 'st-fiacre' ? 'Demo mode: switch tiers instantly to show churches how AGAPAY changes at each level. No Stripe billing is changed.' : demoActive ? `Your free 30-day demo is active${demoEndLabel?` through ${escapeHtml(demoEndLabel)}`:''}. No card is required during the demo. Add billing information in the secure portal only if you want to continue afterward.` : billingActive ? "Choose a tier here to update the existing AGAPAY subscription. Use Stripe's secure billing portal for payment details or cancellation." : demoEligible ? 'Choose a tier and start the free 30-day demo. No card is required. Stewardship unlocks pledge and giving-health tools; Parish adds the complete operations suite.' : 'Choose a tier and complete subscription checkout to reactivate AGAPAY.'}</p>
      <div class="btn-row">
        ${p.parishId === 'st-fiacre'
          ? '<button class="btn btn-gold" onclick="changeDemoTier(this)">Apply demo tier</button>'
          : demoActive
          ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply demo tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Add billing details or cancel</button>'
          : billingActive
          ? '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Apply tier change</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage payment details or cancel</button>'
          : `<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, 'subscriptionTierUpgrade')">${demoEligible?'Start free 30-day demo':'Start tier checkout'}</button>`}
      </div>
      <div class="setup-link-box" id="subscriptionUpgradeLinkBox"><a id="subscriptionUpgradeLink" href="#" target="_blank" rel="noopener">Open billing checkout</a><p id="subscriptionUpgradeHelp"></p></div>
      <div class="section-divider"><span>Stripe account</span></div>
      <p class="section-note">Manage your parish Stripe account — update bank account details, payout schedule, business information, and view your full transaction history directly in Stripe.</p>
      <div class="btn-row">
        ${p.stripeAccountId && p.stripeChargesEnabled
          ? `<a class="btn btn-ghost" href="https://dashboard.stripe.com" target="_blank" rel="noopener">Manage Stripe account ↗</a>`
          : `<button class="btn btn-ghost" disabled title="Complete Stripe onboarding to access your Stripe account">Stripe account not yet active</button>`}
      </div>
      <div class="section-divider"><span>Feature toggles</span></div>
      <div class="toggle-row">
        <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(p.recurringGivingEnabled??true)?'checked':''} /> Recurring giving</label>
        <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(p.candlesEnabled??true)?'checked':''} /> Candles</label>
        <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(p.commemorationsEnabled??true)?'checked':''} /> Commemorations</label>
        <label class="check-card" ${moduleIncluded('bookstore')?'':'title="Requires Stewardship or Parish"'}>
          <input id="bookstoreEnabled" type="checkbox" ${moduleIncluded('bookstore')?'':'disabled'} ${(p.bookstoreEnabled??false)?'checked':''} /> Bookstore Payments
        </label>
      </div>
      ${moduleIncluded('bookstore') ? '' : '<p class="section-note">Bookstore Payments is included with Stewardship and Parish. Review the plans to let donors pay for books, prayer ropes, and other items from My AGAPAY.</p>'}
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
    syncPatronalFeastOptionsFromSettings();

    editableFunds          = fallbackFundsArray(p.funds);
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
    if (activeTab === 'qr') renderBulletinPreview();
  }

  // ── GIVING OPTIONS EDITOR ─────────────────────────────────
  function renderGivingOptionsEditor() {
    const pane = document.getElementById('editorPane'); if (!pane) return;
    pane.innerHTML = `
      ${renderOptionsProgressSummary()}
      <div class="giving-options-intro">These are the choices donors see after selecting <strong>Designated Fund</strong> or <strong>Alms Campaign</strong>. Add presets or write your own.</div>
      <div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Alms campaigns</h3><span class="option-group-count">${editableCampaigns.length} shown</span></div><div class="option-list">${optionCards(editableCampaigns,'campaign','No alms campaigns configured yet.')}</div><div class="option-builder"><div class="option-builder-title">Add an alms campaign</div><div class="builder-grid"><select id="campaignPreset" onchange="fillGivingPreset('campaign')"><option value="">Choose a preset...</option>${presetOptions(campaignPresets)}</select><input id="campaignAccountNumber" maxlength="24" placeholder="Account number, e.g. 2200" /><input id="campaignName" placeholder="Campaign name, e.g. Support for the Petrov Family" /><select id="campaignRestriction"><option value="donor_restricted_temporary">Donor restricted · temporary</option><option value="donor_restricted_permanent">Donor restricted · permanent</option><option value="board_designated">Board designated</option><option value="unrestricted">Unrestricted</option></select><textarea id="campaignDescription" placeholder="Describe the need in plain language."></textarea><input id="campaignGoal" type="number" min="0" step="1" placeholder="Goal amount, e.g. 45000" /><button class="btn btn-ghost" onclick="addGivingOption('campaign')">Add campaign</button></div></div></div>
      ${renderFeastCampaignSetup()}
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
    const ids = ['reconcileAllocationsPane', 'reconcileGiftActivityPane', 'reconcilePayoutsPane', 'reconcileExceptionsPane'];
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
        body: JSON.stringify({ month: reconciliationData.period?.month, bankStatementCents, expectedDepositCents, notes, closed })
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

  function printReconciliationReport() {
    if (!reconciliationData?.available) { setStatus('Run the reconciliation first.', 'error'); return; }
    const data = reconciliationData;
    const summary = data.summary || {};
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) { setStatus('Allow pop-ups to print the closeout report.', 'error'); return; }
    const allocations = (data.allocations || []).map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.label)}</td><td>${item.transactionCount || 0}</td><td>${moneyFull(item.netCents || 0)}</td></tr>`).join('');
    const payouts = (data.payouts || []).map(item => `<tr><td>${reconciliationDate(item.arrivalDate)}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(statusLabel(item.status))}</td><td>${moneyFull(item.amountCents || 0)}</td></tr>`).join('');
    const exceptions = (data.exceptions || []).map(item => `<li>${escapeHtml(item.message)}</li>`).join('') || '<li>None.</li>';
    popup.document.write(`<!doctype html><html><head><title>AGAPAY Reconciliation</title><style>body{font:14px Arial;color:#061522;margin:40px}h1,h2{font-family:Georgia,serif}header{border-bottom:3px solid #c9a24a;margin-bottom:24px;padding-bottom:16px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary div{border:1px solid #ddd;padding:12px}.summary span{display:block;color:#666;font-size:11px;text-transform:uppercase}.summary strong{font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}footer{margin-top:36px;border-top:1px solid #ccc;padding-top:12px;color:#666}@media print{body{margin:18mm}.no-print{display:none}}@media(max-width:700px){.summary{grid-template-columns:1fr 1fr}}</style></head><body><header><small>AGAPAY GIVE · MONTHLY RECONCILIATION</small><h1>${escapeHtml(currentParish.parishName || 'Parish')}</h1><p>${escapeHtml(reconciliationMonthLabel(data.period?.month))}</p></header><div class="summary"><div><span>Bank deposits</span><strong>${money(summary.depositedCents || 0)}</strong></div><div><span>Gross activity</span><strong>${money(summary.grossActivityCents || 0)}</strong></div><div><span>Total fees</span><strong>${money(summary.totalFeeCents || 0)}</strong></div><div><span>Matched</span><strong>${summary.matchedPercent ?? 0}%</strong></div></div><h2>Fund allocation</h2><table><thead><tr><th>Category</th><th>Post to</th><th>Count</th><th>Net</th></tr></thead><tbody>${allocations || '<tr><td colspan="4">No allocations.</td></tr>'}</tbody></table><h2>Stripe payouts</h2><table><thead><tr><th>Arrival</th><th>Payout</th><th>Status</th><th>Amount</th></tr></thead><tbody>${payouts || '<tr><td colspan="4">No payouts.</td></tr>'}</tbody></table><h2>Review items</h2><ul>${exceptions}</ul><footer>Generated ${escapeHtml(new Date(data.generatedAt || Date.now()).toLocaleString())} · AGAPAY Give</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
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
      ...(hasGivingPlusAccess() ? {
        funds: editableFunds,
        campaigns: editableCampaigns,
        feastCampaigns: editableFeastCampaigns,
        givingCatalogChanged: givingCatalogSnapshot() !== givingCatalogBaseline,
        accountingCatalogChanged: accountingCatalogSnapshot() !== accountingCatalogBaseline
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
  function renderBulletinPreview() {
    const nameEl = document.getElementById('bulletinParishName');
    const urlEl  = document.getElementById('bulletinUrl');
    if (nameEl && currentParish) nameEl.textContent = currentParish.parishName || 'Parish Name';
    if (urlEl  && currentParish) urlEl.textContent  = dedicatedGivingUrl() || 'agapay.app/give/parish-name-city';
    // QR is rendered by renderQrCode which writes to bulletinQrCode too
    if (currentQrSvg) { const bqr = document.getElementById('bulletinQrCode'); if (bqr) bqr.innerHTML = currentQrSvg; }
  }

  function buildBulletinSvg() {
    const parishName = escapeHtml(currentParish?.parishName || 'Parish Name');
    const url        = dedicatedGivingUrl() || 'agapay.app/give/parish-name-city';
    const qrInner    = currentQrSvg || '<text x="75" y="75" text-anchor="middle" font-size="10" fill="#6F6A60">QR code</text>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="840" height="560">
      <rect width="420" height="280" fill="#FFFDF9"/>
      <rect x="12" y="12" width="396" height="256" rx="8" fill="none" stroke="#B8902F" stroke-width="2"/>
      <rect x="18" y="18" width="384" height="244" rx="6" fill="none" stroke="#B8902F" stroke-width="0.5" stroke-dasharray="4,3"/>
      <text x="210" y="50" text-anchor="middle" font-family="Georgia,serif" font-size="20" font-weight="bold" fill="#061522">${parishName}</text>
      <text x="210" y="70" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#6F6A60">Give online — simple, secure, and Orthodox.</text>
      <g transform="translate(145,82) scale(0.43)">${qrInner}</g>
      <text x="210" y="225" text-anchor="middle" font-family="monospace" font-size="9" fill="#6F6A60">${escapeHtml(url)}</text>
      <text x="210" y="256" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#9A9488">Powered by AGAPAY · agapay.app</text>
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
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-checkout',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({subscriptionTier:tier?tier.value:currentParish.subscriptionTier})});
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
    const applicationStatement = `${currentParish.name} confirms that ${measuredPercent}% of its measured year-to-date Stripe payment volume is from tax-deductible donations. The parish is a registered nonprofit organization and requests review for Stripe nonprofit pricing for connected account ${application.stripeAccountId || ''}. An authorized account owner is submitting this request while logged into the parish Stripe account.`;
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
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      const res = await fetch('/api/parish/dashboard/st-fiacre/demo-tier', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionTier: tier })
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
  initParishPasswordResetPage();


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
