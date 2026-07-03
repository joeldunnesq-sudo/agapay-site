// ── STATE ────────────────────────────────────────────────
  let currentParish     = null;
  let currentQrSvg      = '';
  let editableFunds     = [];
  let editableCampaigns = [];
  let editableFeastCampaigns = [];
  let activeTab         = 'giving';
  let editingCampaignId = null;
  let campaignCoverUrl  = '';
  let campaignPhotos    = [];
  let allGifts          = [];   // full history cache
  let filteredGifts     = [];   // filtered view
  let reconciliationData = null;
  let stewardshipState   = { loaded: false, stewardship: null, meetings: [], selectedMeeting: null };
  const parishSessionStorageKey = 'agapay_parish_session_token';
  const legacyParishTokenStorageKey = 'agapay_parish_token';

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
    benevolence:{ id:'benevolence',name:'Benevolence Fund',           description:'Parish-approved assistance for families and neighbors facing hardship.' },
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

  function setPaymentStatus(msg, tone) {
    const el = document.getElementById('paymentStatus');
    if (el) el.textContent = msg || '';
    setStatus(msg, tone);
  }

  // ── TAB NAV ──────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach(n => n.classList.remove('active'));
    const panel = document.getElementById('tab-' + tab);
    const nav   = document.getElementById('nav-' + tab);
    const mobileNav = document.querySelector(`.mobile-tab-link[data-nav-tab="${tab}"]`);
    if (panel) panel.classList.add('active');
    if (nav)   nav.classList.add('active');
    if (mobileNav) mobileNav.classList.add('active');
    activeTab = tab;
    const titles = { giving:'Giving Overview', reconcile:'Monthly Reconciliation', history:'Giving History', givers:'Givers', settings:'Settings', options:'Funds & Alms', campaigns:'Campaigns', text:'Text-to-Give', stewardship:'Stewardship', parishplus:'AGAPAY Parish +', sacraments:'Sacraments & Services', bookstore:'Bookstore', qr:'QR Code & Giving Link' };
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    document.getElementById('topbarTitle').textContent = (isMobile && currentParish) ? (currentParish.parishName || 'Parish Dashboard') : (titles[tab] || 'Parish Dashboard');
    if ((tab === 'history' || tab === 'givers' || tab === 'options') && currentParish && !allGifts.length) loadGivingHistory();
    if (tab === 'givers' && allGifts.length) renderGiversPanel();
    if (tab === 'qr') renderBulletinPreview();
    if (tab === 'stewardship') loadStewardshipPanel();
    if (tab === 'parishplus') renderParishPlusPanel();
    if (tab === 'sacraments') loadSacramentsTab();
    if (tab === 'bookstore') loadBookstoreCatalogTab();
    if (tab === 'reconcile' && currentParish) loadReconciliation();
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── AUTH ─────────────────────────────────────────────────
  function authHeaders() {
    return { 'Accept':'application/json', 'Authorization':'Bearer ' + document.getElementById('parishToken').value.trim() };
  }

  function statusLabel(value) {
    return String(value || 'active')
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
  function fallbackCampaigns(v) { return JSON.stringify(v && v.length ? v : [{ id:'alms', name:'Alms Campaign', description:'Parish-approved alms for a specific need.' }], null, 2); }
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

  function isParishTier(parish = currentParish) {
    return String(parish?.subscriptionTier || '').toLowerCase() === 'parish';
  }

  function isParishPlusActive() {
    const sw = stewardshipState.stewardship || {};
    return Boolean(currentParish?.stewardshipActive || sw.legacyAddOnActive || (!sw.includedInParishTier && ['active', 'trialing', 'comped'].includes(sw.status)));
  }

  function renderParishPlusPanel() {
    const active = isParishPlusActive();
    const status = document.getElementById('parishPlusStatusLabel');
    if (status) {
      status.textContent = active ? 'Active' : 'Add-on · $39/mo';
      status.className = 'sw-suite-status-label ' + (active ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
    }
  }

  async function loadStewardshipPanel(force = false) {
    const status = document.getElementById('stewardshipStatusLabel');
    const planPane = document.getElementById('stewardshipPlanPane');
    if (!planPane) return;
    if (!currentParish) {
      if (status) status.textContent = 'Not loaded';
      return;
    }
    if (!isParishTier()) {
      renderStewardshipUnavailableForTier();
      return;
    }
    if (stewardshipState.loaded && !force) {
      renderStewardshipPanel();
      // Always reload metrics/financials when switching to the tab
      const _sw = stewardshipState.stewardship || {};
      const _active = _sw.active || ['active','trialing'].includes(_sw.status);
      if (_active) { loadGivingMetricsPanel(); loadFinancialSnapshotsPanel(); }
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
    renderStewardshipPanel();
    // Load giving metrics and financial snapshots in parallel
    loadGivingMetricsPanel();
    loadFinancialSnapshotsPanel();
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
      const [summary, funds] = await Promise.all([
        fetch(base + '/summary?year=' + y, { headers: authHeaders() }).then(r => r.json()),
        fetch(base + '/funds?year=' + y, { headers: authHeaders() }).then(r => r.json())
      ]);
      if (summary.error && summary.error.includes('not activated')) {
        pane.innerHTML = renderGivingMetricsUpgrade();
        return;
      }
      givingMetricsState.loaded = true;
      pane.innerHTML = renderGivingMetrics(summary, funds, y);
      // Background check — enable nudge button only if donors are 3+ months behind
      checkNudgeEligibility();
    } catch (e) {
      pane.innerHTML = '<p class="muted">Giving metrics unavailable.</p>';
    }
  }

  function fmtDollars(cents) {
    return '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function renderGivingMetrics(s, f, year) {
    const pct   = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.total_actual_cents / s.total_pledged_cents) * 100)) : 0;
    const rrPct = s.total_pledged_cents > 0 ? Math.min(100, Math.round((s.run_rate_cents   / s.total_pledged_cents) * 100)) : 0;
    const yoy   = s.prior_year_actual_cents > 0
      ? Math.round(((s.total_actual_cents - s.prior_year_actual_cents) / s.prior_year_actual_cents) * 100) : null;
    const yoyHtml = yoy !== null
      ? '<span class="sw-yoy sw-yoy-' + (yoy >= 0 ? 'up' : 'down') + '">' + (yoy >= 0 ? '▲' : '▼') + ' ' + Math.abs(yoy) + '% vs prior year</span>' : '';

    const fundRows = (f.funds || []).filter(fd => fd.total_cents > 0).map(fd =>
      '<tr class="sw-fund-row">' +
        '<td class="sw-fund-name">' + escapeHtml(fd.fund_name) + '</td>' +
        '<td class="sw-fund-total">' + fmtDollars(fd.total_cents) + '</td>' +
        '<td class="sw-fund-pct">' + fd.pct_of_total + '%' +
          '<span class="sw-fund-bar"><i style="width:' + Math.min(100, fd.pct_of_total) + '%"></i></span>' +
        '</td>' +
      '</tr>'
    ).join('');

    return (
      '<div class="sw-kpi-grid">' +
        gmKpi('Collected',   fmtDollars(s.total_actual_cents),  yoyHtml || (s.active_donors + ' donors')) +
        gmKpi('Pledged',     fmtDollars(s.total_pledged_cents), s.pledging_donors + ' pledging households') +
        gmKpi('Fulfillment', s.fulfillment_rate_pct !== null ? s.fulfillment_rate_pct + '%' : '—', 'of pledge goal') +
        gmKpi('Avg / Donor', fmtDollars(s.avg_per_donor_cents), s.active_donors + ' active this year') +
      '</div>' +
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
      : '') +
      '<div class="sw-nudge-row">' +
        '<button class="sw-nudge-btn" id="nudgeBtn" type="button" disabled title="Checking pledge status…">'
          + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
          + '<path d="M8 1a5 5 0 0 1 5 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 0 1 5-5z"/>'
          + '<circle cx="8" cy="6" r="1.5"/>'
          + '</svg>'
          + ' Checking pledge status…</button>' +
      '</div>'
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
        '<p>Stewardship reports are included with the Parish tier.</p>' +
        '<button type="button" class="sw-upgrade-btn" onclick="switchTab(\'settings\')">Review parish tier</button>' +
      '</div>'
    );
  }

  // ── Financial Snapshots Panel ───────────────────────────────────────────
  let financialsState = { loaded: false, year: new Date().getFullYear(), data: null };

  async function loadFinancialSnapshotsPanel(year) {
    const pane = document.getElementById('stewardshipFinancialsPane');
    if (!pane || !currentParish) return;

    if (!isParishTier()) { pane.innerHTML = '<p class="muted">Financial snapshots are included with the Parish tier.</p>'; return; }

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
      const res = await fetch(stewardshipApi('/financials?year=' + financialsState.year), { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load financials');
      financialsState.data = data;
      financialsState.loaded = true;
      pane.innerHTML = renderFinancialSnapshots(data);
    } catch (e) {
      pane.innerHTML = '<p class="muted">Unable to load financial snapshots: ' + escapeHtml(e.message) + '</p>';
    }
  }

  function renderFinancialSnapshots(data) {
    const fmt = (c) => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { financialSummaries = [], restrictedFunds = [], totals, meetings = [] } = data;

    if (!meetings.length) {
      return '<div class="sw-financials-empty">' +
        '<p>No financial data for ' + financialsState.year + ' yet.</p>' +
        '<p class="muted" style="font-size:.82rem">Create a meeting packet or standalone snapshot to record income, expenses, and restricted fund balances.</p>' +
        '<button class="sw-new-packet-btn" type="button" onclick="openFinancialsEditor(null)" style="margin-top:.5rem">+ New financial snapshot</button>' +
      '</div>';
    }

    // Income / expense summary cards
    let summaryHtml = '';
    if (totals) {
      const netSign = totals.netCents >= 0 ? 'surplus' : 'deficit';
      summaryHtml =
        '<div class="sw-fin-kpi-grid">' +
          swFinKpi('Total Income',  fmt(totals.totalIncomeCents),  financialSummaries.length + ' packet' + (financialSummaries.length !== 1 ? 's' : ''), 'income') +
          swFinKpi('Total Expenses', fmt(totals.totalExpenseCents), 'across all packets', 'expense') +
          swFinKpi('Net ' + (totals.netCents >= 0 ? 'Surplus' : 'Deficit'), fmt(Math.abs(totals.netCents)), 'fiscal year ' + financialsState.year, netSign) +
        '</div>';
    }

    // Per-packet breakdown
    let packetsHtml = '';
    if (financialSummaries.length) {
      packetsHtml =
        '<div class="sw-fin-section-label">By packet</div>' +
        '<div class="sw-fin-packets">' +
        financialSummaries.map(fs => {
          const net = fs.netCents;
          const netCls = net >= 0 ? 'sw-fin-surplus' : 'sw-fin-deficit';
          return '<div class="sw-fin-packet-row">' +
            '<div class="sw-fin-packet-info">' +
              '<span class="sw-fin-packet-title">' + escapeHtml(fs.meetingTitle || 'Packet') + '</span>' +
              (fs.meetingDate ? '<span class="sw-fin-packet-date">' + new Date(fs.meetingDate + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + '</span>' : '') +
            '</div>' +
            '<div class="sw-fin-packet-amounts">' +
              '<span class="sw-fin-income-lbl">' + fmt(fs.totalIncomeCents) + '</span>' +
              '<span class="sw-fin-expense-lbl">' + fmt(fs.totalExpenseCents) + '</span>' +
              '<span class="' + netCls + '">' + (net >= 0 ? '+' : '') + fmt(net) + '</span>' +
            '</div>' +
            '<button class="sw-action-btn" type="button" onclick="openFinancialsEditor(\'' + escapeAttr(fs.annualMeetingId) + '\')">Edit</button>' +
          '</div>';
        }).join('') +
        '</div>';
    }

    // Restricted funds table
    let fundsHtml = '';
    if (restrictedFunds.length) {
      // Group by fund name across packets, show each row
      const rows = restrictedFunds.map(rf =>
        '<tr class="sw-fund-row">' +
          '<td class="sw-td sw-fund-name">' + escapeHtml(rf.fundName) + '</td>' +
          '<td class="sw-td sw-td-right">' + fmt(rf.beginningBalanceCents) + '</td>' +
          '<td class="sw-td sw-td-right sw-fin-income-lbl">' + fmt(rf.totalReceivedCents) + '</td>' +
          '<td class="sw-td sw-td-right sw-fin-expense-lbl">' + fmt(rf.totalDisbursedCents) + '</td>' +
          '<td class="sw-td sw-td-right ' + (rf.endingBalanceCents >= 0 ? 'sw-fin-surplus' : 'sw-fin-deficit') + '">' + fmt(rf.endingBalanceCents) + '</td>' +
          '<td class="sw-td sw-td-muted" style="font-size:.78rem">' + escapeHtml(rf.meetingTitle || '') + '</td>' +
        '</tr>'
      ).join('');

      fundsHtml =
        '<div class="sw-fin-section-label" style="margin-top:1.25rem">Restricted funds</div>' +
        '<div class="sw-fin-table-wrap">' +
          '<table class="sw-fin-table">' +
            '<thead><tr>' +
              '<th class="sw-th">Fund</th>' +
              '<th class="sw-th sw-th-right">Beginning</th>' +
              '<th class="sw-th sw-th-right">Received</th>' +
              '<th class="sw-th sw-th-right">Disbursed</th>' +
              '<th class="sw-th sw-th-right">Ending</th>' +
              '<th class="sw-th">Source packet</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    }

    return summaryHtml + packetsHtml + fundsHtml;
  }

  function swFinKpi(label, value, sub, type) {
    const cls = type === 'income' ? 'sw-fin-income-lbl' : type === 'expense' ? 'sw-fin-expense-lbl' : type === 'surplus' ? 'sw-fin-surplus' : 'sw-fin-deficit';
    return '<div class="sw-kpi-card">' +
      '<span class="sw-kpi-label">' + label + '</span>' +
      '<strong class="sw-kpi-value ' + cls + '">' + value + '</strong>' +
      '<span class="sw-kpi-sub">' + sub + '</span>' +
    '</div>';
  }

  function openFinancialsEditor(meetingId) {
    const card = document.getElementById('stewardshipFinancialsEditorCard');
    const pane = document.getElementById('stewardshipFinancialsEditorPane');
    const title = document.getElementById('financialsEditorTitle');
    if (!card || !pane) return;

    // Find existing data for this meeting if provided
    const existing = meetingId && financialsState.data
      ? {
          summary: financialsState.data.financialSummaries.find(fs => fs.annualMeetingId === meetingId),
          funds:   financialsState.data.restrictedFunds.filter(rf => rf.annualMeetingId === meetingId),
          meeting: financialsState.data.meetings.find(m => m.id === meetingId)
        }
      : null;

    if (title) title.textContent = existing?.meeting ? 'Edit: ' + (existing.meeting.title || 'Packet') : 'New Financial Snapshot';

    const fs = existing?.summary || {};
    const funds = existing?.funds || [];
    const fmt100 = (c) => c ? (c / 100).toFixed(2) : '';

    const fundRows = funds.length
      ? funds.map((rf, i) => renderFinancialsEditorFundRow(rf, i)).join('')
      : renderFinancialsEditorFundRow({}, 0);

    pane.innerHTML =
      '<form id="financialsEditorForm" onsubmit="saveFinancialsSnapshot(event)">' +
        (meetingId ? '<input type="hidden" name="annualMeetingId" value="' + escapeAttr(meetingId) + '" />' : '') +
        (!meetingId ? '<div class="stewardship-form-grid" style="margin-bottom:.85rem">' +
          '<label>Snapshot title<input name="title" value="' + financialsState.year + ' Financial Snapshot" /></label>' +
          '<label>Fiscal year<input name="fiscalYear" type="number" value="' + financialsState.year + '" /></label>' +
        '</div>' : '') +
        '<div class="stewardship-editor-section">' +
          '<div><h3>Income &amp; Expenses</h3></div>' +
          '<div class="stewardship-form-grid">' +
            '<label>Total income ($)<input name="totalIncomeDollars" type="number" step="0.01" min="0" value="' + fmt100(fs.totalIncomeCents) + '" placeholder="0.00" /></label>' +
            '<label>Total expenses ($)<input name="totalExpenseDollars" type="number" step="0.01" min="0" value="' + fmt100(fs.totalExpenseCents) + '" placeholder="0.00" /></label>' +
            '<label style="grid-column:1/-1">Notes<textarea name="notes" rows="2" placeholder="Budget notes, audit status, carryover details\u2026">' + escapeHtml(fs.notes || '') + '</textarea></label>' +
          '</div>' +
        '</div>' +
        '<div class="stewardship-editor-section">' +
          '<div>' +
            '<h3>Restricted Funds</h3>' +
            '<button class="btn btn-ghost btn-sm" type="button" onclick="addFinancialsFundRow()">Add fund</button>' +
          '</div>' +
          '<div class="sw-fin-fund-header">'+
            '<span>Fund name</span><span>Beginning</span><span>Received</span><span>Disbursed</span><span>Ending</span><span></span>' +
          '</div>' +
          '<div id="financialsFundRows">' + fundRows + '</div>' +
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

  function renderFinancialsEditorFundRow(rf, i) {
    const fmt100 = (c) => c ? (c / 100).toFixed(2) : '';
    return '<div class="stewardship-repeat-row sw-fin-fund-row-edit" data-row-type="fund">' +
      '<input type="text" data-field="fundName" value="' + escapeAttr(rf.fundName || '') + '" placeholder="Fund name" />' +
      '<input type="number" step="0.01" min="0" data-field="beginningBalance" value="' + fmt100(rf.beginningBalanceCents) + '" placeholder="0.00" />' +
      '<input type="number" step="0.01" min="0" data-field="totalReceived" value="' + fmt100(rf.totalReceivedCents) + '" placeholder="0.00" />' +
      '<input type="number" step="0.01" min="0" data-field="totalDisbursed" value="' + fmt100(rf.totalDisbursedCents) + '" placeholder="0.00" />' +
      '<input type="number" step="0.01" min="0" data-field="endingBalance" value="' + fmt100(rf.endingBalanceCents) + '" placeholder="0.00" />' +
      '<button class="btn btn-ghost btn-sm" type="button" onclick="removeFinancialsFundRow(this)">×</button>' +
    '</div>';
  }

  function addFinancialsFundRow() {
    const container = document.getElementById('financialsFundRows');
    if (!container) return;
    const count = container.querySelectorAll('.sw-fin-fund-row-edit').length;
    container.insertAdjacentHTML('beforeend', renderFinancialsEditorFundRow({}, count));
  }

  function removeFinancialsFundRow(btn) {
    const row = btn?.closest('.sw-fin-fund-row-edit');
    const parent = row?.parentElement;
    if (!row || !parent) return;
    if (parent.querySelectorAll('.sw-fin-fund-row-edit').length <= 1) {
      row.querySelectorAll('input').forEach(inp => inp.value = '');
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
    const annualMeetingId = fd.get('annualMeetingId') || null;
    const totalIncomeCents  = Math.round(parseFloat(fd.get('totalIncomeDollars') || '0') * 100);
    const totalExpenseCents = Math.round(parseFloat(fd.get('totalExpenseDollars') || '0') * 100);

    const fundRows = [...form.querySelectorAll('.sw-fin-fund-row-edit')];
    const restrictedFunds = fundRows.map(row => {
      const get = (f) => row.querySelector('[data-field="' + f + '"]')?.value || '';
      return {
        fundName:              get('fundName').trim(),
        beginningBalanceCents: Math.round(parseFloat(get('beginningBalance') || '0') * 100),
        totalReceivedCents:    Math.round(parseFloat(get('totalReceived')    || '0') * 100),
        totalDisbursedCents:   Math.round(parseFloat(get('totalDisbursed')   || '0') * 100),
        endingBalanceCents:    Math.round(parseFloat(get('endingBalance')    || '0') * 100),
      };
    }).filter(rf => rf.fundName);

    const payload = {
      annualMeetingId,
      totalIncomeCents,
      totalExpenseCents,
      netCents: totalIncomeCents - totalExpenseCents,
      notes: fd.get('notes') || '',
      fiscalYear: parseInt(fd.get('fiscalYear') || financialsState.year, 10),
      title: fd.get('title') || '',
      restrictedFunds
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

  function stewardshipGivingPageUrl() {
    const token = document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
    const url = new URL('/parish/stewardship/giving', window.location.origin);
    url.searchParams.set('parishId', currentParish?.parishId || '');
    url.searchParams.set('t', token);
    return url.pathname + url.search;
  }

  function updateStewardshipBadges(isActive) {
    const badge = document.getElementById('parishPlusNavBadge');
    if (badge) {
      badge.textContent = isActive ? 'Active' : 'Upgrade';
      badge.classList.toggle('nav-upgrade-badge--active', isActive);
    }
    const mobileBadge = document.getElementById('mobileStewBadge');
    if (mobileBadge) {
      mobileBadge.textContent = isActive ? 'Active' : 'Upgrade';
      mobileBadge.classList.toggle('mobile-upgrade-badge--active', isActive);
    }
    renderParishPlusPanel();
    const bookstoreNav = document.getElementById('nav-bookstore');
    const bookstoreBadge = document.getElementById('bookstoreNavBadge');
    const mobileBookstoreBadge = document.getElementById('mobileBookstoreBadge');
    if (bookstoreNav) {
      bookstoreNav.classList.toggle('sidebar-nav-item--gated', !isActive);
      bookstoreNav.title = isActive ? '' : 'Requires AGAPAY Parish +';
    }
    if (bookstoreBadge) {
      bookstoreBadge.hidden = isActive;
      bookstoreBadge.textContent = 'Upgrade';
      bookstoreBadge.classList.remove('nav-upgrade-badge--active');
    }
    if (mobileBookstoreBadge) {
      mobileBookstoreBadge.hidden = isActive;
      mobileBookstoreBadge.textContent = 'Upgrade';
      mobileBookstoreBadge.classList.remove('mobile-upgrade-badge--active');
    }

    // Sacraments & Services is an AGAPAY Parish + feature and also has a
    // rollout flag. Without Stewardship access, show it as gated; with access,
    // show Coming soon unless the parish is on the live rollout list.
    const sacIsRolledOut = Boolean(currentParish?.parishId && SACRAMENTS_ROLLOUT_PARISH_IDS.has(currentParish.parishId));
    const sacNav = document.getElementById('nav-sacraments');
    const sacSoonBadge = document.getElementById('sacramentsNavSoonBadge');
    const sacBadge = document.getElementById('sacramentsNavBadge');
    if (sacNav) {
      sacNav.classList.toggle('sidebar-nav-item--gated', !isActive);
      sacNav.title = isActive ? '' : 'Requires AGAPAY Parish +';
    }
    if (sacSoonBadge) sacSoonBadge.hidden = !isActive || sacIsRolledOut;
    if (sacBadge) {
      sacBadge.hidden = isActive && !sacIsRolledOut;
      sacBadge.textContent = isActive ? 'Active' : 'Upgrade';
      sacBadge.classList.toggle('nav-upgrade-badge--active', isActive);
    }
  }

  // ── BOOKSTORE ───────────────────────────────────────────────
  // Also an AGAPAY Parish + feature, gated the same way as Sacraments.
  // Two pieces: what's already in the parish's catalog, and a starter
  // list of common items they can check off instead of typing each one
  // in by hand. Prices on the starter list are suggestions, not fixed —
  // the parish edits them before anything gets added.
  let bookstoreCatalogState = { loaded: false, products: [], starterCatalog: [] };
  let bookstoreEditingProductId = null;

  function bookstoreApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/bookstore' + path;
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

  async function loadBookstoreCatalogTab(force = false) {
    const upsell = document.getElementById('bookstoreUpsellBanner');
    const live = document.getElementById('bookstoreLiveContent');
    const status = document.getElementById('bookstoreStatusLabel');
    if (!currentParish) return;

    // Reuse the AGAPAY Parish + status already fetched for that tab, with
    // the dashboard payload as a fallback when the parish opens Bookstore first.
    const sw = stewardshipState.stewardship || {};
    const swActive = Boolean(currentParish.stewardshipActive || sw.active || ['active', 'trialing', 'comped'].includes(sw.status));
    updateStewardshipBadges(swActive);
    if (!swActive) {
      if (upsell) upsell.hidden = false;
      if (live) live.hidden = true;
      return;
    }
    if (upsell) upsell.hidden = true;
    if (live) live.hidden = false;
    if (status) {
      status.textContent = currentParish.bookstoreEnabled ? 'Live in My AGAPAY' : 'Hidden until enabled';
      status.className = 'sw-suite-status-label ' + (currentParish.bookstoreEnabled ? 'sw-suite-status--active' : 'sw-suite-status--upsell');
    }
    renderBookstoreTaxReminder();

    if (bookstoreCatalogState.loaded && !force) {
      renderBookstoreCurrentItems(bookstoreCatalogState.products);
      renderBookstoreStarterCatalogUI(bookstoreCatalogState.starterCatalog);
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
    } catch (err) {
      if (itemsPane) itemsPane.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
      if (starterPane) starterPane.innerHTML = '';
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
              <span>${Number(p.stockQuantity || 0)} in stock</span>
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
          <label>In stock<input id="bookstoreModalStock" type="number" min="0" step="1" /></label>
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
                <input type="number" min="0" step="1" value="0" data-starter-stock="${escapeAttr(item.key)}" title="Starting stock count" />
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
  // An AGAPAY Parish + feature — gated server-side by the exact same
  // hasStewardshipAccess() check as the rest of the add-on. This panel
  // reuses stewardshipState (already fetched by loadStewardshipPanel) to
  // decide whether to show the upsell or the actual request list, so
  // switching to this tab never needs a second status round-trip.
  let sacramentsState = { loaded: false, requests: [] };

  function sacramentsApi(path = '') {
    if (!currentParish?.parishId) throw new Error('Load a parish first.');
    return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/sacraments' + path;

  }

  const SACRAMENT_TYPE_LABELS = {
    house_blessing: 'House Blessing', baptism: 'Baptism', chrismation: 'Chrismation',
    wedding: 'Wedding', funeral: 'Funeral', memorial_service: 'Memorial Service',
    confession: 'Confession', home_visit: 'Home Visit', other: 'Other Request'
  };
  const SACRAMENT_STATUS_OPTIONS = ['requested', 'acknowledged', 'scheduled', 'completed', 'declined', 'cancelled'];
  const SACRAMENT_STATUS_LABELS = {
    requested: 'Requested', acknowledged: 'Received', scheduled: 'Scheduled',
    completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled'
  };

  function sacramentTypeLabel(row) {
    return row.sacramentType === 'other' && row.otherTypeLabel ? row.otherTypeLabel : (SACRAMENT_TYPE_LABELS[row.sacramentType] || row.sacramentType);
  }

  // Limited rollout: Sacraments & Services only shows real, live content for
  // allowlisted parishes (currently just st-fiacre, for internal testing).
  // Every other parish sees the coming-soon banner instead. Mirrors the
  // server-side allowlist in handlers/parish.js and handlers/donor.js — to
  // launch broadly, update both here and there.
  const SACRAMENTS_ROLLOUT_PARISH_IDS = new Set(['st-fiacre']);

  function loadSacramentsTab() {
    const banner = document.getElementById('sacramentsComingSoonBanner');
    const live = document.getElementById('sacramentsLiveContent');
    const isRolledOut = Boolean(currentParish?.parishId && SACRAMENTS_ROLLOUT_PARISH_IDS.has(currentParish.parishId));
    if (banner) banner.hidden = isRolledOut;
    if (live) live.hidden = !isRolledOut;
    if (isRolledOut) loadSacramentsPanel();
  }

  async function loadSacramentsPanel(force = false) {
    const statusLabel = document.getElementById('sacramentsStatusLabel');
    const pane = document.getElementById('sacramentsPane');
    if (!pane) return;
    if (!currentParish) {
      if (statusLabel) statusLabel.textContent = 'Not loaded';
      return;
    }

    // Reuse the AGAPAY Parish + status already fetched for the add-on
    // tab — no need to hit the network twice for the same gate.
    const sw = stewardshipState.stewardship || {};
    const swActive = sw.active || ['active', 'trialing', 'comped'].includes(sw.status);
    if (!swActive) {
      if (statusLabel) statusLabel.textContent = 'Add-on · $39/mo';
      pane.innerHTML = renderSacramentsUpsell();
      return;
    }
    if (statusLabel) statusLabel.textContent = 'Active';

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
    } catch (err) {
      pane.innerHTML = `<div class="notice error">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderSacramentsUpsell() {
    return `
      <div class="sw-suite-tool-grid" style="grid-template-columns:1fr;">
        <div class="sw-suite-tool-card" style="text-align:center;padding:2.2rem 1.5rem;">
          <strong class="sw-tool-card-title">Sacraments &amp; Services is part of AGAPAY Parish +</strong>
          <p class="sw-tool-card-desc" style="max-width:480px;margin:0.6rem auto 1.2rem;">
            Let parishioners request house blessings, baptisms, weddings, and more directly from My AGAPAY —
            routed straight to your parish dashboard.
          </p>
          <button class="btn btn-gold" type="button" onclick="switchTab('parishplus')">View AGAPAY Parish +</button>
        </div>
      </div>`;
  }

  function renderSacramentsPanel() {
    const pane = document.getElementById('sacramentsPane');
    if (!pane) return;
    const requests = sacramentsState.requests || [];
    if (!requests.length) {
      pane.innerHTML = '<div class="sw-suite-tool-card" style="text-align:center;padding:2rem;"><p class="sw-tool-card-desc">No requests yet. When a parishioner requests a house blessing, baptism, or other service from My AGAPAY, it will appear here.</p></div>';
      return;
    }

    const active = requests.filter(r => ['requested', 'acknowledged', 'scheduled'].includes(r.status));
    const closed = requests.filter(r => ['completed', 'declined', 'cancelled'].includes(r.status));

    pane.innerHTML = `
      ${active.length ? `<div class="sac-parish-section"><h3>Active</h3>${active.map(sacramentParishRow).join('')}</div>` : ''}
      ${closed.length ? `<div class="sac-parish-section"><h3>History</h3>${closed.map(sacramentParishRow).join('')}</div>` : ''}
    `;
  }

  function sacramentParishRow(row) {
    const typeLabel = sacramentTypeLabel(row);
    const statusOptions = SACRAMENT_STATUS_OPTIONS.map(s => `<option value="${s}" ${s === row.status ? 'selected' : ''}>${SACRAMENT_STATUS_LABELS[s]}</option>`).join('');
    return `
      <div class="sac-parish-row" id="sacrow-${row.id}">
        <div class="sac-parish-row-top">
          <div>
            <strong>${escapeHtml(typeLabel)}</strong>
            <span class="sac-parish-row-donor">${escapeHtml(row.donorEmail)}${row.phone ? ' · ' + escapeHtml(row.phone) : ''}</span>
          </div>
          <select class="sw-year-select" style="max-width:150px;" id="sacstatus-${row.id}" onchange="onSacramentStatusChange('${row.id}')">${statusOptions}</select>
        </div>
        ${row.participantNames ? `<div class="sac-parish-row-meta"><strong>For:</strong> ${escapeHtml(row.participantNames)}</div>` : ''}
        ${row.requestedDate || row.requestedTimeWindow ? `<div class="sac-parish-row-meta"><strong>Requested:</strong> ${escapeHtml([row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(' · '))}</div>` : ''}
        ${row.locationAddress ? `<div class="sac-parish-row-meta"><strong>Location:</strong> ${escapeHtml(row.locationAddress)}</div>` : ''}
        ${row.notes ? `<div class="sac-parish-row-meta"><strong>Notes:</strong> ${escapeHtml(row.notes)}</div>` : ''}

        <div class="sac-parish-row-fields" id="sacfields-${row.id}" style="${row.status === 'scheduled' ? '' : 'display:none;'}">
          <div class="form-grid">
            <div><label>Confirmed date</label><input type="date" id="sacdate-${row.id}" value="${escapeAttr(row.confirmedDate || '')}" /></div>
            <div><label>Confirmed time</label><input type="text" id="sactime-${row.id}" value="${escapeAttr(row.confirmedTime || '')}" placeholder="10:00 AM" /></div>
            <div><label>Clergy assigned</label><input type="text" id="sacclergy-${row.id}" value="${escapeAttr(row.clergyAssigned || '')}" /></div>
          </div>
        </div>
        <div class="sac-parish-row-fields" id="sacdecline-${row.id}" style="${row.status === 'declined' ? '' : 'display:none;'}">
          <label>Reason (shown to the parishioner)</label>
          <input type="text" id="sacreason-${row.id}" value="${escapeAttr(row.declineReason || '')}" />
        </div>
        <div class="sac-parish-row-fields">
          <label>Internal notes (not shared with the parishioner)</label>
          <textarea id="sacnotes-${row.id}" rows="2">${escapeHtml(row.parishNotes || '')}</textarea>
        </div>
        <div class="btn-row" style="margin-top:0.5rem;">
          <button class="btn btn-gold btn-sm" type="button" onclick="saveSacramentRequest('${row.id}')">Save</button>
        </div>
      </div>`;
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
      updateStewardshipBadges(isParishPlusActive());
      maybeShowStewardshipCompExpiryNotice(sw);
    } catch { /* silent — badge stays gold */ }
  }

  // Shows a one-time-per-day pop-up when a Founding 20 free-year
  // AGAPAY Parish + comp grant is within 30 days of expiring. Dismissal
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
        '<p>Your complimentary year of <strong>AGAPAY Parish +</strong> ends on <strong>' + escapeHtml(expiresLabel) + '</strong> \u2014 about ' + daysLeft + ' days from now.</p>' +
        '<p class="sw-comp-notice-sub">No action is needed if you would like to let it lapse. If your parish council would like to continue, you can add it as a paid feature at any time.</p>' +
        '<div class="sw-comp-notice-actions">' +
          '<button class="sw-comp-notice-btn-primary" type="button" onclick="dismissStewardshipCompNotice(); switchTab(\'parishplus\')">View AGAPAY Parish +</button>' +
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
    const meetingsPane = document.getElementById('stewardshipMeetingsPane');
    const metricPane = document.getElementById('givingMetricsPane');
    const finPane = document.getElementById('stewardshipFinancialsPane');
    if (statusEl) {
      statusEl.textContent = 'Parish tier';
      statusEl.className = 'sw-suite-status-label sw-suite-status--upsell';
    }
    if (planPane) {
      planPane.innerHTML =
        '<div class="sw-upsell-row-inner">' +
          '<div class="sw-upsell-row-copy">' +
            '<strong>Parish tier</strong>' +
            '<p>Stewardship tools are included with the Parish tier. Upgrade the AGAPAY tier to use pledge reports, annual meeting packets, and financial snapshots.</p>' +
          '</div>' +
          '<div class="sw-upsell-row-actions">' +
            '<button class="sw-subscribe-btn" type="button" onclick="switchTab(\'settings\')">Review tier settings</button>' +
          '</div>' +
        '</div>';
    }
    const locked = '<div class="sw-tool-locked"><div class="sw-tool-locked-items"><div><span>✓</span> Included with the Parish tier</div></div><div class="sw-tool-locked-badge">Parish tier required</div></div>';
    if (meetingsPane) meetingsPane.innerHTML = locked;
    if (metricPane) metricPane.innerHTML = locked;
    if (finPane) finPane.innerHTML = locked;
  }

  function renderStewardshipPanel() {
    const statusEl  = document.getElementById('stewardshipStatusLabel');
    const planPane  = document.getElementById('stewardshipPlanPane');
    const meetingsPane = document.getElementById('stewardshipMeetingsPane');
    if (!planPane || !meetingsPane) return;

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

    updateStewardshipBadges(isParishPlusActive());

    if (isActive) {
      renderStewardshipActiveState(planPane, meetingsPane, sw, isTrialing);
    } else {
      renderStewardshipUpsellState(planPane, meetingsPane);
    }
  }

  // Active state: populate the plan row (billing management) + meetings tool card
  function renderStewardshipActiveState(planPane, meetingsPane, sw, isTrialing) {
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

    // ── Meetings tool card ─────────────────────────────────────────────────
    const meetings = stewardshipState.meetings || [];
    const year = new Date().getFullYear();
    meetingsPane.innerHTML =
      '<div class="sw-tool-meetings-header">' +
        '<button class="sw-new-packet-btn" type="button" onclick="newStewardshipMeeting()">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>' +
          ' New packet' +
        '</button>' +
      '</div>' +
      (meetings.length ? renderMeetingsList(meetings) : renderMeetingsEmpty(year));

    // Show the financials year select + new button
    const finActions = document.getElementById('financialsHeaderActions');
    if (finActions) finActions.hidden = false;

    // Wire the full metrics report link
    const reportLink = document.getElementById('swGivingFullLink');
    if (reportLink) {
      reportLink.href = stewardshipGivingPageUrl();
      reportLink.hidden = false;
    }
  }

  // Upsell state: lock all three tool cards, show subscribe CTA in plan row
  function renderMeetingsList(meetings) {
    const statusLabels = { draft:'Draft', ready:'Ready', generated:'Generated', archived:'Archived' };
    const statusClasses = { draft:'sw-pill-draft', ready:'sw-pill-ready', generated:'sw-pill-generated', archived:'sw-pill-archived' };
    return '<div class="sw-meetings-list">' +
      meetings.map(m => {
        const statusKey = (m.status || 'draft').toLowerCase();
        const label = statusLabels[statusKey] || statusKey;
        const cls = statusClasses[statusKey] || 'sw-pill-draft';
        const dateStr = m.meetingDate ? new Date(m.meetingDate).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
        const metaParts = [m.fiscalYear, dateStr, m.location ? escapeHtml(m.location) : ''].filter(Boolean).join(' · ');
        return '<div class="sw-meeting-row">' +
          '<div class="sw-meeting-info">' +
            '<strong class="sw-meeting-title">' + escapeHtml(m.title || (m.fiscalYear + ' Annual Meeting')) + '</strong>' +
            '<span class="sw-meeting-meta">' + metaParts + '</span>' +
          '</div>' +
          '<div class="sw-meeting-actions">' +
            '<span class="sw-pill ' + cls + '">' + label + '</span>' +
            '<button class="sw-action-btn" type="button" onclick="editStewardshipMeeting(\'' + escapeAttr(m.id) + '\')">Edit</button>' +
            '<a class="sw-action-btn" href="' + escapeAttr(stewardshipPreviewUrl(m.id)) + '" target="_blank" rel="noopener">Preview</a>' +
            '<a class="sw-action-btn" href="' + escapeAttr(stewardshipPreviewUrl(m.id, 'pdf')) + '" target="_blank" rel="noopener">PDF</a>' +
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

  function renderStewardshipUpsellState(planPane, meetingsPane) {
    const year = new Date().getFullYear();

    // ── Plan row — subscribe CTA ───────────────────────────────────────────
    planPane.innerHTML =
      '<div class="sw-upsell-row-inner">' +
        '<div class="sw-upsell-row-copy">' +
          '<strong>$39<span>/mo</span></strong>' +
          '<p>Parish commerce, annual meeting packets, financial snapshots, and print-ready parish records — all in your dashboard.</p>' +
        '</div>' +
        '<div class="sw-upsell-row-actions">' +
          '<button class="sw-subscribe-btn" type="button" onclick="startStewardshipSubscription(\'monthly\', this)">Start 14-day free trial</button>' +
          '<p class="sw-upsell-note">No commitment. Cancel anytime.</p>' +
        '</div>' +
      '</div>';

    // ── Meetings tool card — locked preview ────────────────────────────────
    meetingsPane.innerHTML =
      '<div class="sw-tool-locked">' +
        '<div class="sw-tool-locked-items">' +
          '<div><span>✓</span> Agenda, opening prayer, quorum call</div>' +
          '<div><span>✓</span> Rector, treasurer &amp; ministry reports</div>' +
          '<div><span>✓</span> Financial summary &amp; restricted funds</div>' +
          '<div><span>✓</span> Nominees, elections, resolutions</div>' +
          '<div><span>✓</span> Sign-in sheet &amp; minutes template</div>' +
          '<div><span>✓</span> Print-ready PDF packet</div>' +
        '</div>' +
        '<div class="sw-tool-locked-badge">Subscribe to unlock</div>' +
      '</div>';

    // ── Giving metrics tool card — locked ─────────────────────────────────
    const metricPane = document.getElementById('givingMetricsPane');
    if (metricPane) {
      metricPane.innerHTML =
        '<div class="sw-tool-locked">' +
          '<div class="sw-tool-locked-items">' +
            '<div><span>✓</span> Pledge vs. actual fulfillment</div>' +
            '<div><span>✓</span> Fund breakdown &amp; share</div>' +
            '<div><span>✓</span> Donor retention &amp; new givers</div>' +
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
            '<div><span>✓</span> Linked to meeting packets</div>' +
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
      status: 'draft',
      agendaItems: [{ title:'Opening prayer', durationMinutes:5 }, { title:'Reports', durationMinutes:30 }, { title:'Financial review', durationMinutes:20 }],
      reports: [{ reportType:'priest', title:'Rector Report', body:'' }, { reportType:'treasurer', title:'Treasurer Report', body:'' }],
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

  function stewardshipRepeaterRows(type, items) {
    const rows = items && items.length ? items : [{}];
    return rows.map((item, index) => {
      if (type === 'agenda') return `<div class="stewardship-repeat-row" data-row-type="agenda">
        <input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Agenda item" />
        <input type="number" data-field="durationMinutes" value="${escapeAttr(item.durationMinutes)}" placeholder="Minutes" />
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'report') return `<div class="stewardship-repeat-row" data-row-type="report">
        <select data-field="reportType">
          ${['priest','warden','treasurer','stewardship','ministry','custom'].map(t=>`<option value="${t}" ${item.reportType===t?'selected':''}>${statusLabel(t)}</option>`).join('')}
        </select>
        <input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Report title" />
        <textarea data-field="body" rows="3" placeholder="Report notes">${escapeHtml(item.body)}</textarea>
        <input type="text" data-field="createdBy" value="${escapeAttr(item.createdBy)}" placeholder="Signed by (optional)" />
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'fund') return `<div class="stewardship-repeat-row" data-row-type="fund">
        <input type="text" data-field="fundName" value="${escapeAttr(item.fundName)}" placeholder="Fund name" />
        <input type="number" data-field="beginningBalance" value="${Number(item.beginningBalanceCents||0)/100 || ''}" placeholder="Beginning $" />
        <input type="number" data-field="totalReceived" value="${Number(item.totalReceivedCents||0)/100 || ''}" placeholder="Received $" />
        <input type="number" data-field="totalDisbursed" value="${Number(item.totalDisbursedCents||0)/100 || ''}" placeholder="Disbursed $" />
        <input type="number" data-field="endingBalance" value="${Number(item.endingBalanceCents||0)/100 || ''}" placeholder="Ending $" />
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'nominee') return `<div class="stewardship-repeat-row" data-row-type="nominee">
        <input type="text" data-field="fullName" value="${escapeAttr(item.fullName)}" placeholder="Nominee name" />
        <input type="text" data-field="position" value="${escapeAttr(item.position)}" placeholder="Position" />
        <textarea data-field="bio" rows="2" placeholder="Short bio (optional)">${escapeHtml(item.bio)}</textarea>
        <input type="text" data-field="nominatedBy" value="${escapeAttr(item.nominatedBy)}" placeholder="Nominated by (optional)" />
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      return `<div class="stewardship-repeat-row" data-row-type="resolution">
        <input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Resolution title" />
        <textarea data-field="resolvedText" rows="3" placeholder="Resolved text">${escapeHtml(item.resolvedText)}</textarea>
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
        <div class="stewardship-editor-section"><div><h3>Agenda</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('agenda')">Add item</button></div><div id="stewardshipAgendaRows">${stewardshipRepeaterRows('agenda', meeting.agendaItems)}</div></div>
        <div class="stewardship-editor-section"><div><h3>Reports</h3><button class="btn btn-ghost btn-sm" type="button" onclick="addStewardshipRow('report')">Add report</button></div><div id="stewardshipReportRows">${stewardshipRepeaterRows('report', meeting.reports)}</div></div>
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
    return items.map((item, i) => `
      <div class="option-item">
        <div class="option-item-head">
          <div class="option-name">${escapeHtml(item.name || item.id || 'Untitled')}</div>
          <button class="icon-button" onclick="removeGivingOption('${kind}',${i})">x</button>
        </div>
        <div class="option-desc">${escapeHtml(item.description || '')}</div>
      </div>`).join('');
  }
  function presetOptions(presets) { return Object.entries(presets).map(([k,v])=>`<option value="${k}">${escapeHtml(v.name)}</option>`).join(''); }
  function syncGivingOptionEditors() { const f=document.getElementById('fundsJson'); const c=document.getElementById('campaignsJson'); if(f) f.value=JSON.stringify(editableFunds,null,2); if(c) c.value=JSON.stringify(editableCampaigns,null,2); }
  function syncGivingOptionsFromAdvanced() { const f=document.getElementById('fundsJson'); const c=document.getElementById('campaignsJson'); editableFunds=JSON.parse(f?.value||'[]'); editableCampaigns=JSON.parse(c?.value||'[]'); }
  function fillGivingPreset(kind) { const presets=kind==='fund'?fundPresets:campaignPresets; const prefix=kind==='fund'?'fund':'campaign'; const preset=presets[document.getElementById(`${prefix}Preset`)?.value]; if(!preset) return; document.getElementById(`${prefix}Name`).value=preset.name; document.getElementById(`${prefix}Description`).value=preset.description; }
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
      ...editableFunds.map(item => ({ kind: 'fund', label: 'Fund', item })),
      ...editableCampaigns.map(item => ({ kind: 'campaign', label: 'Campaign', item })),
      ...editableFeastCampaigns.filter(item => item.enabled !== false).map(item => ({ kind: 'campaign', label: 'Feast campaign', item }))
    ];
    if (!rows.length) return '';
    return `<div class="options-summary-card"><div class="options-summary-head"><span>Active giving options</span><small>Based on paid gifts in AGAPAY</small></div><div class="options-progress-table">${rows.map(row => {
      const progress = optionProgress(row.item, row.kind);
      return `<div class="options-progress-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.item.name || row.item.campaignName || row.item.id || 'Giving option')}</strong><span>${moneyFull(progress.raisedCents)} raised</span><span>${row.kind === 'campaign' && progress.goalCents ? `Goal ${moneyFull(progress.goalCents)}` : ''}</span><div>${progressMarkup(progress.raisedCents, progress.goalCents)}</div></div>`;
    }).join('')}</div></div>`;
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

  function addGivingOption(kind) { const prefix=kind==='fund'?'fund':'campaign'; const nameEl=document.getElementById(`${prefix}Name`); const descEl=document.getElementById(`${prefix}Description`); const name=nameEl?.value.trim(); if(!name){setStatus(`Enter a ${kind} name.`,'error');return;} const item={id:slugifyLocal(name),name,description:descEl?.value.trim()||(kind==='fund'?'Designated support for this parish.':'Parish-approved alms for this need.')}; if(kind==='campaign'){const goalCents=parseDollarsToCents(document.getElementById('campaignGoal')?.value); if(goalCents>0) item.goalCents=goalCents;} if(kind==='fund') editableFunds.push(item); else editableCampaigns.push(item); nameEl.value=''; descEl.value=''; const goalEl=document.getElementById(`${prefix}Goal`); if(goalEl) goalEl.value=''; renderGivingOptionsEditor(); setStatus(`${kind==='fund'?'Fund':'Campaign'} added. Save when ready.`,'success'); }
  function removeGivingOption(kind,i) { if(kind==='fund') editableFunds.splice(i,1); else editableCampaigns.splice(i,1); renderGivingOptionsEditor(); setStatus('Option removed. Save when ready.','success'); }

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
  function isFeastEnabled(id) { return editableFeastCampaigns.some(f=>f.id===id&&f.enabled!==false); }
  function toggleFeastCampaign(id,checked) { const cal=document.getElementById('feastLiturgicalCalendar')?.value||currentParish?.liturgicalCalendar||'julian'; const feast=feastPresetsForCalendar(cal).find(f=>f.id===id); if(!feast) return; editableFeastCampaigns=editableFeastCampaigns.filter(f=>f.id!==id); if(checked) editableFeastCampaigns.push({id:feast.id,name:feast.name,enabled:true,campaignName:`${feast.name} Alms Campaign`,description:`Parish-approved alms connected to ${feast.name}.`}); renderGivingOptionsEditor(); setStatus(checked?`${feast.name} enabled. Save when ready.`:`${feast.name} disabled. Save when ready.`,'success'); }
  function allFeastPresets() {
    const cal = document.getElementById('settingsLiturgicalCalendar')?.value || currentParish?.liturgicalCalendar || 'julian';
    return feastPresetsForCalendar(cal);
  }
  function syncPatronalFeastOptionsFromSettings() {
    const select = document.getElementById('patronalFeast');
    if (!select) return;
    const selected = select.value || currentParish?.patronalFeast || '';
    const calendar = document.getElementById('settingsLiturgicalCalendar')?.value || currentParish?.liturgicalCalendar || 'julian';
    const options = allFeastPresets();
    select.innerHTML = `<option value="">Select a patronal feast day...</option>${options.map((feast) => `<option value="${escapeHtml(feast.id)}" ${selected === feast.id ? 'selected' : ''}>${escapeHtml(feast.name)} (${escapeHtml(feastDateLabel(feast))})</option>`).join('')}`;
  }
  function upsertPatronalFeastCampaign(patronalFeastId, calendar) {
    if (!patronalFeastId) return;
    const feast = feastPresetsForCalendar(calendar).find(item => item.id === patronalFeastId)
      || feastPresetsForCalendar(calendar === 'julian' ? 'gregorian' : 'julian').find(item => item.id === patronalFeastId)
      || fallbackFeastPresets.find(item => item.id === patronalFeastId);
    if (!feast) return;
    const existing = editableFeastCampaigns.find(item => item.id === patronalFeastId);
    if (existing) {
      existing.name = feast.name;
      existing.enabled = true;
      if (!existing.campaignName) existing.campaignName = `${feast.name} Patronal Feast Campaign`;
      if (!existing.description) existing.description = `Parish-approved alms connected to ${feast.name}.`;
      existing.patronal = true;
      return;
    }
    editableFeastCampaigns.push({
      id: feast.id,
      name: feast.name,
      enabled: true,
      patronal: true,
      campaignName: `${feast.name} Patronal Feast Campaign`,
      description: `Parish-approved alms connected to ${feast.name}.`
    });
  }
  function renderFeastCampaignSetup() {
    const cal=document.getElementById('feastLiturgicalCalendar')?.value||currentParish?.liturgicalCalendar||'julian';
    const feasts=feastPresetsForCalendar(cal);
    return `<div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Major feast alms campaigns</h3><span class="option-group-count">${editableFeastCampaigns.filter(f=>f.enabled!==false).length} enabled</span></div><div class="option-builder"><div class="option-builder-title">Calendar timing</div><div class="builder-grid"><select id="feastLiturgicalCalendar" onchange="renderGivingOptionsEditor()"><option value="julian" ${cal==='julian'?'selected':''}>Julian</option><option value="gregorian" ${cal==='gregorian'?'selected':''}>Revised-Julian</option></select><p class="section-note" style="margin:0;">AGAPAY computes fixed feasts from this calendar and keeps Pascha-based feasts on the shared Orthodox paschalion.</p></div></div><div class="option-list"><div class="feast-grid">${feasts.map(feast=>{const enabled=isFeastEnabled(feast.id);return `<div class="feast-card ${enabled?'enabled':''}"><div><div class="feast-name">${escapeHtml(feast.name)}</div><div class="feast-meta">${escapeHtml(calendarLabel(cal))} · ${escapeHtml(feastDateLabel(feast))}</div></div><label class="mini-toggle" aria-label="Toggle ${escapeHtml(feast.name)}"><input type="checkbox" ${enabled?'checked':''} onchange="toggleFeastCampaign('${escapeHtml(feast.id)}',this.checked)"/><span></span></label></div>`;}).join('')}</div></div></div>`;
  }

  // ── LOAD DASHBOARD ────────────────────────────────────────
  async function loadDashboard(btn) {
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
      renderCampaignList(currentParish);
      prefetchStewardshipBadge();
      loadGivingSummary();
      loadRecurringHealth();
      loadCommemorations();
      loadGivingHistory();
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
  function tierOptionsMarkup(selectedId) {
    const tiers = currentParish?.subscriptionTiers || [];
    return tiers.map(t => `<option value="${escapeHtml(t.id)}" ${t.id===selectedId?'selected':''}>${escapeHtml(t.label)} - ${escapeHtml(tierPriceLabel(t))}</option>`).join('');
  }
  function setupCheckMarkup() { return '<span class="setup-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>'; }
  function billingStatusDone(status) { return ['active','free_forever'].includes(status); }
  async function refreshSubscriptionStatus(options) {
    if (!currentParish || !currentParish.parishId || currentParish.subscriptionStatus !== 'checkout_created') return;
    try {
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-refresh', { method:'POST', headers:authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to refresh billing status');
      if (data.subscriptionStatus) {
        currentParish.subscriptionStatus = data.subscriptionStatus;
        currentParish.stripeSubscriptionId = data.stripeSubscriptionId || currentParish.stripeSubscriptionId || '';
        currentParish.stripeCustomerId = data.stripeCustomerId || currentParish.stripeCustomerId || '';
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
      if (data.parish) currentParish = data.parish;
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
    pane.innerHTML=`<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="setup-title">First-time setup</div><p class="setup-copy">Choose the parish's AGAPAY tier first, then connect Stripe so gifts can be received through the platform.</p><div class="setup-steps"><div class="setup-step done">${setupCheckMarkup()}<div><strong>1. Contact info verified</strong><span>Your registration has already supplied the parish contact details.</span></div></div><div class="setup-step ${billingDone?'done':''}">${setupCheckMarkup()}<div><strong>2. Select tier and billing</strong><span>${billingDone?'AGAPAY subscription billing is active.':'Choose the parish tier and complete billing checkout.'}</span></div></div><div class="setup-step ${stripeDone?'done':''}">${setupCheckMarkup()}<div><strong>3. Connect Stripe</strong><span>${stripeDone?'Stripe is connected for parish giving.':billingDone?'Create a Stripe onboarding link and complete the account setup.':'Stripe setup unlocks after billing is active.'}</span></div></div></div></div><div class="setup-action-panel">${billingDone?'':`<label for="setupSubscriptionTier">AGAPAY tier</label><select id="setupSubscriptionTier">${tierOptions}</select><button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startSubscriptionCheckout(this)">Start billing checkout</button><p class="setup-copy setup-action-copy">After billing is active, you will connect Stripe so the parish can receive donations.</p>`}${billingDone&&!stripeDone?'<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startStripeOnboarding(this)">Connect Stripe</button>':''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">Open setup link</a><p id="setupLinkHelp"></p></div></div></div></div>`;
  }

  function updateTierScopedNavigation() {
    const showStewardship = isParishTier();
    document.getElementById('nav-stewardship')?.toggleAttribute('hidden', !showStewardship);
    document.querySelectorAll('.mobile-tab-link[data-nav-tab="stewardship"]').forEach((el) => {
      el.hidden = !showStewardship;
    });
    if (!showStewardship && activeTab === 'stewardship') switchTab('giving');
  }

  // ── RENDER DASHBOARD ──────────────────────────────────────
  function renderDashboard() {
    const p = currentParish;
    updateTierScopedNavigation();
    document.getElementById('sidebarProfile').classList.add('visible');
    document.getElementById('sidebarParishName').textContent = p.parishName || 'Parish';
    const parishMeta = [p.communityType, p.jurisdiction, [p.city,p.state].filter(Boolean).join(', ')].filter(Boolean).join(' / ');
    document.getElementById('sidebarParishMeta').textContent = parishMeta;
    const chip = document.getElementById('sidebarStatusChip');
    chip.textContent = p.givingStatus || 'active';
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
    const commIcon = document.getElementById('commemorationCommunityIcon');
    if (commIcon) commIcon.innerHTML = communityMarkIcon(p);
    const overviewEmpty = document.getElementById('overviewEmpty');
    if (overviewEmpty) overviewEmpty.style.display = 'none';
    renderSetupWizard();

    const billingActive = Boolean((p.setup||{}).billingActive);
    const tierOptions = tierOptionsMarkup(p.subscriptionTier);
    document.getElementById('settingsPane').innerHTML = `
      <div class="form-grid">
        <div class="form-group full"><label class="form-label" for="parishName">Parish name</label><input id="parishName" value="${escapeHtml(p.parishName||'')}" placeholder="Parish name" /></div>
        <div class="form-group"><label class="form-label">Jurisdiction</label><input value="${escapeHtml(p.jurisdiction||'')}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="addressLine1">Address line 1</label><input id="addressLine1" value="${escapeHtml(p.addressLine1||'')}" placeholder="Street address" /></div>
        <div class="form-group full"><label class="form-label" for="addressLine2">Address line 2</label><input id="addressLine2" value="${escapeHtml(p.addressLine2||'')}" placeholder="Suite, unit, building (optional)" /></div>
        <div class="form-group"><label class="form-label" for="city">City</label><input id="city" value="${escapeHtml(p.city||'')}" placeholder="City" /></div>
        <div class="form-group"><label class="form-label" for="state">State</label><input id="state" value="${escapeHtml(p.state||'')}" placeholder="State" /></div>
        <div class="form-group"><label class="form-label" for="postalCode">Postal code</label><input id="postalCode" value="${escapeHtml(p.postalCode||'')}" placeholder="ZIP / postal code" /></div>
        <div class="form-group"><label class="form-label" for="country">Country</label><input id="country" value="${escapeHtml(p.country||'US')}" placeholder="Country code" /></div>
        <div class="form-group full"><label class="form-label" for="website">Website</label><input id="website" value="${escapeHtml(p.website||'')}" placeholder="https://example.org" /></div>
        <div class="form-group full"><label class="form-label" for="settingsLiturgicalCalendar">Liturgical calendar</label><select id="settingsLiturgicalCalendar" onchange="syncPatronalFeastOptionsFromSettings()"><option value="julian" ${(p.liturgicalCalendar||'julian')==='julian'?'selected':''}>Julian</option><option value="gregorian" ${p.liturgicalCalendar==='gregorian'?'selected':''}>Revised-Julian</option></select></div>
        <div class="form-group full"><label class="form-label" for="patronalFeast">Patronal feast day</label><select id="patronalFeast"></select></div>
        <div class="form-group"><label class="form-label" for="givingStatus">Giving page status</label><select id="givingStatus"><option value="active" ${p.givingStatus==='active'?'selected':''}>Active</option><option value="paused" ${p.givingStatus==='paused'?'selected':''}>Paused</option><option value="hidden" ${p.givingStatus==='hidden'?'selected':''}>Hidden</option></select></div>
        <div class="form-group"><label class="form-label">Stripe onboarding</label><input value="${escapeHtml(p.stripeAccountStatus||'not_started')}" disabled /></div>
      </div>
      <p class="section-note">Changes here affect the parish's public giving page and visibility in the AGAPAY directory.</p>
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
      </div>
      <p class="section-note">Priest and treasurer dashboard access is included for every verified parish. Parish tier adds staff invite workflow for extra users such as bookkeepers, campaign helpers, or parish council officers.</p>
      <div class="btn-row">
        <a class="btn btn-ghost" href="mailto:support@agapay.app?subject=${encodeURIComponent('Dashboard invite request for ' + (p.parishName || p.parishId || 'our parish'))}&body=${encodeURIComponent('Please add or update dashboard access for ' + (p.parishName || p.parishId || 'our parish') + '.\n\nRequested user:\nEmail:\nRole:\n\nRequested by:\n')}" target="_blank" rel="noopener">Request additional dashboard invite</a>
      </div>
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Current tier</label><input value="${escapeHtml(p.subscriptionTierLabel || p.subscriptionTier || 'Not selected')}" disabled /></div>
        <div class="form-group"><label class="form-label">Billing status</label><input value="${escapeHtml(statusLabel(p.subscriptionStatus || 'not_started'))}" disabled /></div>
        <div class="form-group full"><label class="form-label" for="subscriptionTierUpgrade">Change AGAPAY tier</label><select id="subscriptionTierUpgrade">${tierOptions}</select></div>
      </div>
      <p class="section-note">${billingActive ? "Use Stripe's secure billing portal to upgrade or change tiers, update payment details, or cancel the AGAPAY subscription." : 'Choose a tier and complete billing checkout. Parish tier unlocks Stewardship in this dashboard.'}</p>
      <div class="btn-row">
        ${billingActive
          ? '<button class="btn btn-gold" onclick="openSubscriptionPortal(this)">Change tier in billing portal</button><button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage payment details</button>'
          : '<button class="btn btn-gold" onclick="startSubscriptionCheckout(this, \'subscriptionTierUpgrade\')">Start tier checkout</button>'}
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
        <label class="check-card" ${p.stewardshipActive?'':'title="Requires AGAPAY Parish +"'}>
          <input id="bookstoreEnabled" type="checkbox" ${p.stewardshipActive?'':'disabled'} ${(p.bookstoreEnabled??false)?'checked':''} /> Bookstore Payments
        </label>
      </div>
      ${p.stewardshipActive ? '' : '<p class="section-note">Bookstore Payments is part of AGAPAY Parish +. <button type="button" class="inline-link-button" onclick="switchTab(\'parishplus\')">View AGAPAY Parish +</button> to let donors pay for books, prayer ropes, and other items from My AGAPAY.</p>'}
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

    renderQrCode();
    editableFunds          = fallbackFundsArray(p.funds);
    editableCampaigns      = fallbackCampaignsArray(p.campaigns);
    editableFeastCampaigns = Array.isArray(p.feastCampaigns) ? p.feastCampaigns : [];
    renderGivingOptionsEditor();
    renderBulletinPreview();
  }

  // ── GIVING OPTIONS EDITOR ─────────────────────────────────
  function renderGivingOptionsEditor() {
    const pane = document.getElementById('editorPane'); if (!pane) return;
    pane.innerHTML = `
      ${renderOptionsProgressSummary()}
      <div class="giving-options-intro">These are the choices donors see after selecting <strong>Designated Fund</strong> or <strong>Alms Campaign</strong>. Add presets or write your own.</div>
      <div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Designated funds</h3><span class="option-group-count">${editableFunds.length} shown</span></div><div class="option-list">${optionCards(editableFunds,'fund','No funds configured yet.')}</div><div class="option-builder"><div class="option-builder-title">Add a fund</div><div class="builder-grid"><select id="fundPreset" onchange="fillGivingPreset('fund')"><option value="">Choose a preset...</option>${presetOptions(fundPresets)}</select><input id="fundName" placeholder="Fund name, e.g. New Iconostasis Fund" /><textarea id="fundDescription" placeholder="Describe this fund in plain language."></textarea><button class="btn btn-ghost" onclick="addGivingOption('fund')">Add fund</button></div></div></div>
      <div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Alms campaigns</h3><span class="option-group-count">${editableCampaigns.length} shown</span></div><div class="option-list">${optionCards(editableCampaigns,'campaign','No alms campaigns configured yet.')}</div><div class="option-builder"><div class="option-builder-title">Add an alms campaign</div><div class="builder-grid"><select id="campaignPreset" onchange="fillGivingPreset('campaign')"><option value="">Choose a preset...</option>${presetOptions(campaignPresets)}</select><input id="campaignName" placeholder="Campaign name, e.g. Support for the Petrov Family" /><textarea id="campaignDescription" placeholder="Describe the need in plain language."></textarea><input id="campaignGoal" type="number" min="0" step="1" placeholder="Goal amount, e.g. 45000" /><button class="btn btn-ghost" onclick="addGivingOption('campaign')">Add campaign</button></div></div></div>
      ${renderFeastCampaignSetup()}
      <details class="advanced-editor"><summary>Advanced edit (JSON)</summary><div class="editor-label-row"><label for="fundsJson">Designated funds</label><span class="editor-hint">Each item needs id, name, description</span></div><textarea id="fundsJson" spellcheck="false" onchange="syncGivingOptionsFromAdvanced()">${JSON.stringify(editableFunds,null,2)}</textarea><div style="height:0.9rem;"></div><div class="editor-label-row"><label for="campaignsJson">Alms campaigns</label><span class="editor-hint">Each item needs id, name, description</span></div><textarea id="campaignsJson" spellcheck="false" onchange="syncGivingOptionsFromAdvanced()">${JSON.stringify(editableCampaigns,null,2)}</textarea></details>
      <div class="btn-row"><button class="btn btn-gold" onclick="saveDashboard(this)">Save giving options</button><button class="btn btn-ghost" onclick="loadDashboard()">Discard changes</button></div>`;
    syncGivingOptionEditors();
  }

  // ── GIVING SUMMARY (YTD chart) ────────────────────────────
  async function loadGivingSummary(btn) {
    const pane = document.getElementById('givingSummaryPane'); if (!currentParish || !pane) return;
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    pane.innerHTML = '<div class="insights-empty-dark">Loading Stripe giving summary...</div>';
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/giving-summary', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Unable to load giving summary');
      renderGivingSummary(data.summary);
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
    filteredGifts = allGifts.filter(g => {
      const haystack = [g.donorName, g.donorEmail, g.fund, g.fundId, g.description].join(' ').toLowerCase();
      const matchQ    = !q    || haystack.includes(q);
      const matchType = type === 'all' || g.type === type || (type === 'recurring' && g.recurring) || (type === 'one_time' && !g.recurring);
      const matchFund = fund === 'all' || (g.fund || g.fundId || 'General') === fund;
      return matchQ && matchType && matchFund;
    });
    renderHistoryTable();
    renderGiversPanel();
  }

  function renderHistoryTable() {
    // Summary stats
    const total    = filteredGifts.reduce((s, g) => s + ((g.parishNetCents ?? g.amountCents) || 0), 0);
    const avg      = filteredGifts.length ? Math.round(total / filteredGifts.length) : 0;
    const recurring = filteredGifts.filter(g => g.recurring).length;
    document.getElementById('histStatTotal').textContent     = filteredGifts.length;
    document.getElementById('histStatAmount').textContent    = money(total);
    document.getElementById('histStatAvg').textContent      = filteredGifts.length ? money(avg) : '—';
    document.getElementById('histStatRecurring').textContent = recurring;

    const wrap = document.getElementById('historyTableWrap');
    if (!wrap) return;
    if (!filteredGifts.length) {
      wrap.innerHTML = `<div class="history-empty">${allGifts.length ? 'No gifts match the current filters.' : 'No gift history found. Connect Stripe to see recent gifts here.'}</div>`;
      return;
    }
    const rows = filteredGifts.map(g => `
      <tr>
        <td>${escapeHtml(fullDate(g.date || g.createdAt))}</td>
        <td><span class="history-amount">${moneyFull((g.parishNetCents ?? g.amountCents) || 0)}</span><span class="history-subamount">Gift ${moneyFull((g.giftAmountCents ?? g.amountCents) || 0)}</span></td>
        <td><span class="history-fee ${g.coverFees ? 'covered' : 'absorbed'}">${g.coverFees ? 'Covered' : '-' + moneyFull(g.totalFeeCents || 0)}</span></td>
        <td>${g.donorName ? escapeHtml(g.donorName) : '<span style="color:var(--muted)">Anonymous</span>'}</td>
        <td>${g.donorEmail ? escapeHtml(g.donorEmail) : '—'}</td>
        <td><span class="history-fund">${escapeHtml(g.fund || g.fundId || 'General')}</span></td>
        <td><span class="history-type">${g.recurring ? 'Recurring' : 'One-time'}</span></td>
        <td style="color:var(--stone);font-size:12px;">${g.commemorationNames ? escapeHtml(g.commemorationNames.join(', ')) : '—'}</td>
      </tr>`).join('');

    wrap.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead><tr>
            <th>Date</th><th>Parish received</th><th>Fees</th><th>Donor</th><th>Email</th><th>Fund</th><th>Type</th><th>Commemorations</th>
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
    setReconciliationLoading('Matching Stripe payouts to AGAPAY gifts…');
    try {
      const path = `/api/parish/dashboard/${encodeURIComponent(currentParish.parishId)}/reconciliation?month=${encodeURIComponent(month)}`;
      const response = await fetch(path, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Unable to run reconciliation.');
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
    syncGivingOptionsFromAdvanced();
    const newPw = document.getElementById('newDashboardPassword')?.value.trim() || '';
    const conPw = document.getElementById('confirmDashboardPassword')?.value.trim() || '';
    if (newPw || conPw) { if (newPw.length < 8) throw new Error('Password must be at least 8 characters.'); if (newPw !== conPw) throw new Error('Passwords do not match.'); }
    const liturgicalCalendar = document.getElementById('feastLiturgicalCalendar')?.value
      || document.getElementById('settingsLiturgicalCalendar')?.value
      || currentParish?.liturgicalCalendar
      || 'julian';
    const patronalFeast = document.getElementById('patronalFeast')?.value || '';
    upsertPatronalFeastCampaign(patronalFeast, liturgicalCalendar);
    const body = {
      parishName:             document.getElementById('parishName')?.value,
      addressLine1:           document.getElementById('addressLine1')?.value,
      addressLine2:           document.getElementById('addressLine2')?.value,
      city:                   document.getElementById('city')?.value,
      state:                  document.getElementById('state')?.value,
      postalCode:             document.getElementById('postalCode')?.value,
      country:                document.getElementById('country')?.value,
      website:                document.getElementById('website')?.value,
      liturgicalCalendar,
      patronalFeast,
      givingStatus:           document.getElementById('givingStatus')?.value,
      recurringGivingEnabled: document.getElementById('recurringGivingEnabled')?.checked,
      candlesEnabled:         document.getElementById('candlesEnabled')?.checked,
      commemorationsEnabled:  document.getElementById('commemorationsEnabled')?.checked,
      bookstoreEnabled:       document.getElementById('bookstoreEnabled')?.checked,
      funds:                  editableFunds,
      campaigns:              editableCampaigns,
      feastCampaigns:         editableFeastCampaigns,
    };
    if (newPw) body.newDashboardPassword = newPw;
    return body;
  }

  async function saveDashboard(btn) {
    if (!currentParish) return;
    let body; try { body = payload(); } catch (err) { setStatus(err.message,'error'); return; }
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), { method:'PATCH', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || 'Unable to save dashboard.','error'); return; }
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
    const logoHref = await markDataUri();
    currentQrSvg = brandQrSvg(rawSvg, logoHref);
    targets.forEach(t => { t.innerHTML = currentQrSvg; });
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
      if(sb&&sl){sl.href=data.checkoutUrl;sl.textContent='Open billing checkout';sb.classList.add('visible');if(sh)sh.textContent=win?'Billing checkout opened in a new tab.':'Your browser blocked the new tab. Use this link.';}
      if(win) win.location.href=data.checkoutUrl;
      setStatus(win?'Subscription checkout opened in a new tab.':'Checkout created.','success');
    } catch(err){if(win)win.close();setStatus(err.message,'error');}
    finally{if(btn){btn.classList.remove('loading');btn.disabled=false;}}
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
      const meta = when ? `from ${escapeHtml(from)} · ${escapeHtml(when)}` : `from ${escapeHtml(from)}`;
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
    const gifts = allGifts.filter(isCandleGift);
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
