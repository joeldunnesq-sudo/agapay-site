  // ── STATE ────────────────────────────────────────────────
  let currentParish     = null;
  let currentQrSvg      = '';
  let editableFunds     = [];
  let editableCampaigns = [];
  let editableFeastCampaigns = [];
  let activeTab         = 'giving';
  let allGifts          = [];   // full history cache
  let filteredGifts     = [];   // filtered view

  // ── SESSION PERSISTENCE ──────────────────────────────────
  (function restoreSession() {
    try {
      const isDashboardPage = Boolean(document.getElementById('setupWizardPane'));
      const id    = sessionStorage.getItem('agapay_parish_id');
      const token = sessionStorage.getItem('agapay_parish_token');
      const parishIdField = document.getElementById('parishId');
      const parishTokenField = document.getElementById('parishToken');
      const urlParish = new URLSearchParams(window.location.search).get('parish');
      if (isDashboardPage && (!id || !token)) {
        const suffix = urlParish || id;
        window.location.replace('/parish/login' + (suffix ? `?parish=${encodeURIComponent(suffix)}` : ''));
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
      sessionStorage.setItem('agapay_parish_token', document.getElementById('parishToken').value.trim());
    } catch {}
  }

  function logoutParish() {
    try {
      sessionStorage.removeItem('agapay_parish_id');
      sessionStorage.removeItem('agapay_parish_token');
    } catch {}
    window.location.href = '/parish/login';
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
    const titles = { giving:'Giving Overview', history:'Giving History', givers:'Givers', settings:'Settings', options:'Funds & Campaigns', qr:'QR Code & Giving Link' };
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    document.getElementById('topbarTitle').textContent = (isMobile && currentParish) ? (currentParish.parishName || 'Parish Dashboard') : (titles[tab] || 'Parish Dashboard');
    if ((tab === 'history' || tab === 'givers' || tab === 'options') && currentParish && !allGifts.length) loadGivingHistory();
    if (tab === 'givers' && allGifts.length) renderGiversPanel();
    if (tab === 'qr') renderBulletinPreview();
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
      const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(parishId), {
        headers: { 'Accept':'application/json', 'Authorization':'Bearer ' + password }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to log in');
      sessionStorage.setItem('agapay_parish_id', parishId);
      sessionStorage.setItem('agapay_parish_token', password);
      window.location.href = '/parish/dashboard?parish=' + encodeURIComponent(parishId);
    } catch (err) {
      setStatus(err.message,'error');
    } finally {
      if (submit) { submit.classList.remove('loading'); submit.disabled = false; }
    }
  }

  // ── HELPERS ──────────────────────────────────────────────
  function fallbackFunds(v)     { return JSON.stringify(v && v.length ? v : [{ id:'general', name:'General Operating Fund', description:'Utilities, supplies, ministries, and day-to-day parish needs.' }], null, 2); }
  function fallbackCampaigns(v) { return JSON.stringify(v && v.length ? v : [{ id:'alms', name:'Alms Campaign', description:'Parish-approved alms for a specific need.' }], null, 2); }
  function fallbackFundsArray(v)     { return JSON.parse(fallbackFunds(v)); }
  function fallbackCampaignsArray(v) { return JSON.parse(fallbackCampaigns(v)); }
  function dedicatedGivingUrl() { return currentParish ? `${window.location.origin}/give/form?parish=${encodeURIComponent(currentParish.parishId)}` : ''; }
  function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function qrFilename(ext) { return `${currentParish?.parishId || 'agapay-parish'}-giving-qr.${ext}`; }
  function slugifyLocal(v) { return String(v||'item').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'item'; }
  function money(cents) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format((Number(cents)||0)/100); }
  function moneyFull(cents) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(cents)||0)/100); }
  function shortDate(v) { if (!v) return 'No gifts yet'; return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(v)); }
  function fullDate(v)  { if (!v) return '—'; return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(v)); }
  function escapeHtml(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

  function renderGiversPanel() {
    const pane = document.getElementById('giversPane');
    if (!pane) return;
    const groups = new Map();
    allGifts.forEach(gift => {
      const key = (gift.donorEmail || gift.donorName || 'anonymous').toLowerCase();
      const existing = groups.get(key) || { name: gift.donorName || 'Anonymous giver', email: gift.donorEmail || '', giftCount: 0, totalCents: 0, recurring: false, lastGiftAt: '' };
      existing.giftCount += 1;
      existing.totalCents += Number(gift.amountCents || 0);
      existing.recurring = existing.recurring || Boolean(gift.recurring);
      const date = gift.date || gift.createdAt || '';
      if (date && (!existing.lastGiftAt || date > existing.lastGiftAt)) existing.lastGiftAt = date;
      groups.set(key, existing);
    });
    const givers = Array.from(groups.values()).sort((a, b) => b.totalCents - a.totalCents);
    const total = givers.reduce((sum, giver) => sum + giver.totalCents, 0);
    const recurring = givers.filter(giver => giver.recurring).length;
    const last = givers.map(giver => giver.lastGiftAt).filter(Boolean).sort().pop();
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('giverStatCount', givers.length);
    set('giverStatTotal', money(total));
    set('giverStatRecurring', recurring);
    set('giverStatLast', shortDate(last));
    if (!givers.length) {
      pane.innerHTML = '<div class="history-empty">No paid gifts have been recorded yet.</div>';
      return;
    }
    pane.innerHTML = `<div class="giver-list">${givers.map(giver => `<article class="giver-card"><div><strong>${escapeHtml(giver.name)}</strong><span>${escapeHtml(giver.email || 'No email shown')}</span></div><div><b>${moneyFull(giver.totalCents)}</b><span>${giver.giftCount} gift${giver.giftCount === 1 ? '' : 's'}${giver.recurring ? ' · recurring' : ''}</span><small>Last gift ${escapeHtml(shortDate(giver.lastGiftAt))}</small></div></article>`).join('')}</div>`;
  }

  function addGivingOption(kind) { const prefix=kind==='fund'?'fund':'campaign'; const nameEl=document.getElementById(`${prefix}Name`); const descEl=document.getElementById(`${prefix}Description`); const name=nameEl?.value.trim(); if(!name){setStatus(`Enter a ${kind} name.`,'error');return;} const item={id:slugifyLocal(name),name,description:descEl?.value.trim()||(kind==='fund'?'Designated support for this parish.':'Parish-approved alms for this need.')}; if(kind==='campaign'){const goalCents=parseDollarsToCents(document.getElementById('campaignGoal')?.value); if(goalCents>0) item.goalCents=goalCents;} if(kind==='fund') editableFunds.push(item); else editableCampaigns.push(item); nameEl.value=''; descEl.value=''; const goalEl=document.getElementById(`${prefix}Goal`); if(goalEl) goalEl.value=''; renderGivingOptionsEditor(); setStatus(`${kind==='fund'?'Fund':'Campaign'} added. Save when ready.`,'success'); }
  function removeGivingOption(kind,i) { if(kind==='fund') editableFunds.splice(i,1); else editableCampaigns.splice(i,1); renderGivingOptionsEditor(); setStatus('Option removed. Save when ready.','success'); }

  // ── FEAST CAMPAIGN HELPERS ────────────────────────────────
  function calendarLabel(v) { return window.AGAPAYLiturgicalCalendar?.calendarLabel(v) || (v==='gregorian'?'Revised Julian / Gregorian':'Julian / Old Calendar'); }
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
    return `<div class="option-group"><div class="option-group-head"><h3 class="option-group-title">Major feast alms campaigns</h3><span class="option-group-count">${editableFeastCampaigns.filter(f=>f.enabled!==false).length} enabled</span></div><div class="option-builder"><div class="option-builder-title">Calendar timing</div><div class="builder-grid"><select id="feastLiturgicalCalendar" onchange="renderGivingOptionsEditor()"><option value="julian" ${cal==='julian'?'selected':''}>Julian / Old Calendar</option><option value="gregorian" ${cal==='gregorian'?'selected':''}>Revised Julian / Gregorian</option></select><p class="section-note" style="margin:0;">AGAPAY computes fixed feasts from this calendar and keeps Pascha-based feasts on the shared Orthodox paschalion.</p></div></div><div class="option-list"><div class="feast-grid">${feasts.map(feast=>{const enabled=isFeastEnabled(feast.id);return `<div class="feast-card ${enabled?'enabled':''}"><div><div class="feast-name">${escapeHtml(feast.name)}</div><div class="feast-meta">${escapeHtml(calendarLabel(cal))} · ${escapeHtml(feastDateLabel(feast))}</div></div><label class="mini-toggle" aria-label="Toggle ${escapeHtml(feast.name)}"><input type="checkbox" ${enabled?'checked':''} onchange="toggleFeastCampaign('${escapeHtml(feast.id)}',this.checked)"/><span></span></label></div>`;}).join('')}</div></div></div>`;
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
      loadGivingSummary();
      loadRecurringHealth();
      loadCommemorations();
    } catch (err) { setStatus(err.message,'error'); }
    finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      if (loadBtn) { loadBtn.classList.remove('loading'); loadBtn.disabled = false; }
    }
  }

  // ── SETUP WIZARD ─────────────────────────────────────────
  function tierPriceLabel(tier) { if(!tier) return ''; if(tier.monthlyCents===null) return 'Custom'; if(Number(tier.monthlyCents)===0) return '$0/mo'; return `${money(tier.monthlyCents)}/mo`; }
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
    const tiers=currentParish.subscriptionTiers||[];
    const tierOptions=tiers.map(t=>`<option value="${escapeHtml(t.id)}" ${t.id===currentParish.subscriptionTier?'selected':''}>${escapeHtml(t.label)} - ${escapeHtml(tierPriceLabel(t))}</option>`).join('');
    pane.innerHTML=`<div class="setup-wizard-card"><div class="setup-wizard-body"><div><div class="setup-title">First-time setup</div><p class="setup-copy">Choose the parish's AGAPAY tier first, then connect Stripe so gifts can be received through the platform.</p><div class="setup-steps"><div class="setup-step done">${setupCheckMarkup()}<div><strong>1. Contact info verified</strong><span>Your registration has already supplied the parish contact details.</span></div></div><div class="setup-step ${billingDone?'done':''}">${setupCheckMarkup()}<div><strong>2. Select tier and billing</strong><span>${billingDone?'AGAPAY subscription billing is active.':'Choose the parish tier and complete billing checkout.'}</span></div></div><div class="setup-step ${stripeDone?'done':''}">${setupCheckMarkup()}<div><strong>3. Connect Stripe</strong><span>${stripeDone?'Stripe is connected for parish giving.':billingDone?'Create a Stripe onboarding link and complete the account setup.':'Stripe setup unlocks after billing is active.'}</span></div></div></div></div><div class="setup-action-panel">${billingDone?'':`<label for="setupSubscriptionTier">AGAPAY tier</label><select id="setupSubscriptionTier">${tierOptions}</select><button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startSubscriptionCheckout(this)">Start billing checkout</button><p class="setup-copy setup-action-copy">After billing is active, you will connect Stripe so the parish can receive donations.</p>`}${billingDone&&!stripeDone?'<button class="btn btn-gold" style="width:100%;justify-content:center;" onclick="startStripeOnboarding(this)">Connect Stripe</button>':''}<div class="setup-link-box" id="setupLinkBox"><a id="setupActionLink" href="#" target="_blank" rel="noopener">Open setup link</a><p id="setupLinkHelp"></p></div></div></div></div>`;
  }

  // ── RENDER DASHBOARD ──────────────────────────────────────
  function renderDashboard() {
    const p = currentParish;
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
        <div class="form-group full"><label class="form-label" for="settingsLiturgicalCalendar">Liturgical calendar</label><select id="settingsLiturgicalCalendar" onchange="syncPatronalFeastOptionsFromSettings()"><option value="julian" ${(p.liturgicalCalendar||'julian')==='julian'?'selected':''}>Julian / Old Calendar</option><option value="gregorian" ${p.liturgicalCalendar==='gregorian'?'selected':''}>Revised Julian / Gregorian</option></select></div>
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
      <div class="section-divider"><span>AGAPAY subscription</span></div>
      <p class="section-note">Open Stripe's secure billing portal to change tiers, update payment details, or cancel the AGAPAY subscription.</p>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="openSubscriptionPortal(this)">Manage or cancel subscription</button>
      </div>
      <div class="section-divider"><span>Feature toggles</span></div>
      <div class="toggle-row">
        <label class="check-card"><input id="recurringGivingEnabled" type="checkbox" ${(p.recurringGivingEnabled??true)?'checked':''} /> Recurring giving</label>
        <label class="check-card"><input id="candlesEnabled" type="checkbox" ${(p.candlesEnabled??true)?'checked':''} /> Candles</label>
        <label class="check-card"><input id="commemorationsEnabled" type="checkbox" ${(p.commemorationsEnabled??true)?'checked':''} /> Commemorations</label>
      </div>
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

  function renderGivingSummary(summary) {
    const pane = document.getElementById('givingSummaryPane'); if (!pane) return;
    if (!summary || summary.dataSource === 'not_connected') { pane.innerHTML = '<div class="insights-empty-dark">Connect Stripe to show year-to-date giving, donor counts, and monthly trends here.</div>'; return; }
    const monthly = summary.monthly || [];
    const maxAmount = Math.max(...monthly.map(m => m.amountCents || 0), 1);
    const bars = monthly.map((m, i) => { const h = Math.max(4, Math.round(((m.amountCents||0)/maxAmount)*190)); return `<div class="chart-bar-wrap" title="${escapeHtml(m.label)}: ${money(m.amountCents||0)}"><div class="chart-bar" style="height:${h}px;animation-delay:${i*0.04}s"></div><div class="chart-label">${escapeHtml(m.label)}</div></div>`; }).join('');
    pane.innerHTML = `<div class="insights-layout"><div class="insights-hero"><div class="insights-label">${summary.year||new Date().getFullYear()} YTD giving</div><div class="insights-total">${money(summary.ytdCents||0)}</div><div class="insights-meta">Last gift: ${escapeHtml(shortDate(summary.lastGiftAt))}</div><div class="insight-stats"><div class="insight-stat"><strong>${summary.giftCount||0}</strong><span>Gifts</span></div><div class="insight-stat"><strong>${summary.giverCount||0}</strong><span>Givers</span></div><div class="insight-stat"><strong>${money(summary.averageGiftCents||0)}</strong><span>Avg gift</span></div></div></div><div class="chart-card"><div class="insights-label" style="color:var(--muted);">Monthly giving level</div><div class="chart-bars">${bars}</div><div class="chart-note">${escapeHtml(summary.note||'Based on successful Stripe charges for this connected parish account.')}</div></div></div>`;
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
    const rows = Array.isArray(health.rows) ? health.rows : [];
    const needsAttention = rows.filter(row => row.status === 'failed' || row.status === 'lapsed').slice(0, 6);
    const activeCount = Number(health.activeCount || 0);
    const failedCount = Number(health.failedThisMonthCount || 0);
    const lapsedCount = Number(health.lapsedCount || 0);
    const list = needsAttention.length ? needsAttention.map(row => `
      <div class="recurring-health-row ${escapeHtml(row.status || 'active')}">
        <div>
          <strong>${escapeHtml(row.donorName || 'Anonymous donor')}</strong>
          <span>${escapeHtml([row.donorEmail, row.fund || row.giftType || 'Recurring gift'].filter(Boolean).join(' / '))}</span>
        </div>
        <div class="recurring-health-row-meta">
          <b>${money(row.amountCents || 0)}</b>
          <span>${escapeHtml(recurringDateLabel(row))}</span>
        </div>
        <span class="recurring-health-status ${escapeHtml(row.status || 'active')}">${escapeHtml(recurringStatusLabel(row.status))}</span>
      </div>`).join('') : '<div class="recurring-health-empty success">No failed or lapsed recurring gifts need attention right now.</div>';

    pane.innerHTML = `
      <div class="recurring-health-grid">
        <div class="recurring-health-stat active"><strong>${activeCount}</strong><span>Active recurring gifts</span></div>
        <div class="recurring-health-stat failed"><strong>${failedCount}</strong><span>Failed this month</span></div>
        <div class="recurring-health-stat lapsed"><strong>${lapsedCount}</strong><span>Lapsed or overdue</span></div>
        <div class="recurring-health-stat value"><strong>${money(health.monthlyRecurringCents || 0)}</strong><span>Expected recurring amount</span></div>
      </div>
      <div class="recurring-health-note">Failed payments are recorded from Stripe recurring invoice events. Lapsed gifts are recurring gifts whose last successful payment is older than the expected giving interval.</div>
      <div class="recurring-health-list">${list}</div>`;
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
    const total    = filteredGifts.reduce((s, g) => s + (g.amountCents || 0), 0);
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
        <td><span class="history-amount">${moneyFull(g.amountCents)}</span></td>
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
            <th>Date</th><th>Amount</th><th>Donor</th><th>Email</th><th>Fund</th><th>Type</th><th>Commemorations</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── CSV EXPORT ────────────────────────────────────────────
  function exportHistoryCsv() {
    if (!filteredGifts.length) { setStatus('No gifts to export. Load history first.','error'); return; }
    const headers = ['Date','Amount','Donor Name','Donor Email','Fund','Type','Commemorations'];
    const rows = filteredGifts.map(g => [
      fullDate(g.date || g.createdAt),
      ((g.amountCents || 0) / 100).toFixed(2),
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
      if (body.newDashboardPassword) { document.getElementById('parishToken').value = body.newDashboardPassword; saveSession(); }
      setStatus(body.newDashboardPassword ? 'Settings saved. Password updated.' : 'Parish settings saved.', 'success');
      await loadDashboard();
    } catch (err) { setStatus(err.message,'error'); }
    finally { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } }
  }

  function copyPayload() { if (!currentParish){setStatus('Load a parish first.','error');return;} navigator.clipboard.writeText(JSON.stringify(payload(),null,2)); setStatus('Current settings copied.','success'); }

  // ── QR CODE ───────────────────────────────────────────────
  function renderQrCode() {
    const targets = ['qrCode','qrCodeHero','bulletinQrCode'].map(id=>document.getElementById(id)).filter(Boolean);
    const inputs  = ['givingUrlInput','givingUrlHeroInput'].map(id=>document.getElementById(id)).filter(Boolean);
    const url     = dedicatedGivingUrl();
    inputs.forEach(inp => { inp.value = url; });
    if (!url || typeof qrcode === 'undefined') { targets.forEach(t => { t.innerHTML = '<span style="font-size:11px;color:var(--stone);text-align:center;line-height:1.5;">Load dashboard<br>to generate QR</span>'; }); currentQrSvg = ''; return; }
    const qr = qrcode(0,'M'); qr.addData(url); qr.make();
    currentQrSvg = qr.createSvgTag(5,3).replace(/<svg /,'<svg role="img" aria-label="AGAPAY giving QR code" ').replace(/fill="#000000"/g,'fill="#061522"');
    targets.forEach(t => { t.innerHTML = currentQrSvg; });
  }

  async function copyGivingLink() { const url=dedicatedGivingUrl(); if(!url){setStatus('Load a parish first.','error');return;} await navigator.clipboard.writeText(url); setStatus('Giving page link copied.','success'); }

  function downloadQrSvg() {
    if (!currentQrSvg) renderQrCode(); if (!currentQrSvg){setStatus('QR code not ready yet.','error');return;}
    const svg=currentQrSvg.includes('xmlns=')?currentQrSvg:currentQrSvg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
    downloadBlob(qrFilename('svg'),new Blob([svg],{type:'image/svg+xml;charset=utf-8'})); setStatus('QR code SVG downloaded.','success');
  }

  function downloadQrPng() {
    if (!currentQrSvg) renderQrCode(); if (!currentQrSvg){setStatus('QR code not ready yet.','error');return;}
    const svg=currentQrSvg.includes('xmlns=')?currentQrSvg:currentQrSvg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
    const img=new Image(); const svgUrl=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);ctx.drawImage(img,0,0,1200,1200);URL.revokeObjectURL(svgUrl);canvas.toBlob(blob=>{if(!blob){setStatus('Unable to create PNG.','error');return;}downloadBlob(qrFilename('png'),blob);setStatus('QR code PNG downloaded.','success');},'image/png');};
    img.onerror=()=>{URL.revokeObjectURL(svgUrl);setStatus('Unable to render QR code PNG.','error');};
    img.src=svgUrl;
  }

  // ── BULLETIN INSERT ───────────────────────────────────────
  function renderBulletinPreview() {
    const nameEl = document.getElementById('bulletinParishName');
    const urlEl  = document.getElementById('bulletinUrl');
    if (nameEl && currentParish) nameEl.textContent = currentParish.parishName || 'Parish Name';
    if (urlEl  && currentParish) urlEl.textContent  = dedicatedGivingUrl() || 'agapay.app/give/form?parish=…';
    // QR is rendered by renderQrCode which writes to bulletinQrCode too
    if (currentQrSvg) { const bqr = document.getElementById('bulletinQrCode'); if (bqr) bqr.innerHTML = currentQrSvg; }
  }

  function buildBulletinSvg() {
    const parishName = escapeHtml(currentParish?.parishName || 'Parish Name');
    const url        = dedicatedGivingUrl() || 'agapay.app/give/form?parish=…';
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

  function downloadBulletinSvg() {
    if (!currentParish){setStatus('Load a parish first.','error');return;}
    if (!currentQrSvg) renderQrCode();
    const svg  = buildBulletinSvg();
    const name = `${currentParish.parishId || 'parish'}-bulletin-insert.svg`;
    downloadBlob(name, new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    setStatus('Bulletin insert SVG downloaded.','success');
  }

  function downloadBulletinPng() {
    if (!currentParish){setStatus('Load a parish first.','error');return;}
    if (!currentQrSvg) renderQrCode();
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
  async function startSubscriptionCheckout(btn) {
    if (!currentParish) return;
    const win = window.open('','_blank'); if (win) win.opener = null;
    if (btn){btn.classList.add('loading');btn.disabled=true;}
    try {
      const tier = document.getElementById('setupSubscriptionTier');
      const res  = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/subscription-checkout',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({subscriptionTier:tier?tier.value:currentParish.subscriptionTier})});
      const data = await res.json(); if (!res.ok) throw new Error(data.detail||data.error||'Unable to create checkout');
      if (!data.checkoutUrl){if(win)win.close();await loadDashboard();setStatus('Subscription updated. No checkout required.','success');return;}
      const sb=document.getElementById('setupLinkBox');const sl=document.getElementById('setupActionLink');const sh=document.getElementById('setupLinkHelp');
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
    const pane=document.getElementById('commemorationQueuePane'); if(!pane) return;
    const entries=data.entries||[]; const living=entries.flatMap(e=>e.living||[]); const departed=entries.flatMap(e=>e.departed||[]);
    const list=names=>names.length?`<ul>${names.map(n=>`<li>${escapeHtml(n)}</li>`).join('')}</ul>`:'<p class="section-note">No names submitted this week.</p>';
    pane.innerHTML=`<div class="commemoration-list"><div class="commemoration-column"><h4>Living</h4>${list(living)}</div><div class="commemoration-column"><h4>Departed</h4>${list(departed)}</div></div><p class="commemoration-meta">${entries.length} commemoration gift${entries.length===1?'':'s'} found for the current weekly queue.</p>`;
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
  const params = new URLSearchParams(window.location.search);
  const parishIdField = document.getElementById('parishId');
  if (params.get('parish') && parishIdField) parishIdField.value = params.get('parish');
