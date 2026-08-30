'use strict';

// Parish dashboard Sacraments & Services feature.
// Loaded before app.js so existing inline dashboard actions keep their global names.
let sacramentsState = { loaded: false, requests: [], preparationTemplates: [], preparationDocumentsConfigured: false };
let sacramentsGoogleState = { loaded: false, loading: false, configured: false, connections: [] };
let sacramentsDashboardTab = 'rules';
let sacramentsPriestIndex = 0;

function sacramentsApi(path = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/sacraments' + path;
}

const SACRAMENT_TYPE_LABELS = {
  house_blessing: 'House Blessing',
  baptism: 'Baptism',
  chrismation: 'Chrismation',
  wedding: 'Wedding',
  funeral: 'Funeral',
  memorial_service: 'Memorial Service',
  confession: 'Confession',
  home_visit: 'Home Visit',
  office_visit: 'Office Visit',
  anointing: 'Holy Unction',
  counseling: 'Pastoral Counseling',
  other: 'Other Request',
};
const SACRAMENT_STATUS_OPTIONS = ['requested', 'acknowledged', 'scheduled', 'completed', 'declined', 'cancelled'];
const SACRAMENT_STATUS_LABELS = {
  requested: 'Requested',
  acknowledged: 'Received',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function sacramentTypeLabel(row) {
  return row.sacramentType === 'other' && row.otherTypeLabel
    ? row.otherTypeLabel
    : SACRAMENT_TYPE_LABELS[row.sacramentType] || row.sacramentType;
}

function setSacramentsDashboardTab(tab) {
  sacramentsDashboardTab = tab || 'rules';
  document.querySelectorAll('[data-sac-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sacTab === sacramentsDashboardTab);
  });
  if (['blackouts', 'rules', 'calendar'].includes(sacramentsDashboardTab) && !sacramentsAvailabilityState.loaded) {
    loadSacramentsAvailability();
  }
  if (sacramentsDashboardTab === 'calendar' && !sacramentsGoogleState.loaded) loadSacramentsGoogleStatus();
  renderSacramentsPanel();
}

function sacramentPriests() {
  const saved = Array.isArray(currentParish?.sacramentPriests) ? currentParish.sacramentPriests : [];
  const rows = saved
    .map((priest) => ({
      name: String(priest?.name || '').trim(),
      email: String(priest?.email || '').trim(),
      serviceTypes: Array.isArray(priest?.serviceTypes) ? priest.serviceTypes : defaultSacramentServiceTypes(),
      customServices: Array.isArray(priest?.customServices) ? priest.customServices : [],
    }))
    .filter((priest) => priest.name);
  if (rows.length) return rows;
  return [
    {
      name: 'Parish priest',
      email: currentParish?.priestEmail || '',
      serviceTypes: defaultSacramentServiceTypes(),
      customServices: [],
    },
  ];
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
    sacramentsState = {
      loaded: true,
      requests: data.requests || [],
      preparationTemplates: data.preparationTemplates || [],
      preparationDocumentsConfigured: Boolean(data.preparationDocumentsConfigured),
    };
    renderSacramentsPanel();
    setTimeout(() => loadSacramentsAvailability(), 250);
    setTimeout(() => loadSacramentsGoogleStatus(), 350);
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
  ['Pacific/Honolulu', 'Hawaii (Honolulu)'],
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
  const builtIn = SAC_SCHEDULABLE_TYPES.filter((type) => enabled.has(type));
  const custom = (selectedSacramentPriest().customServices || [])
    .filter((service) => service.mode === 'schedule')
    .map((service) => service.id);
  return [...builtIn, ...custom];
}

function selectedSacramentOfferingLabel(type) {
  const custom = (selectedSacramentPriest().customServices || []).find((service) => service.id === type);
  return custom?.label || sacramentTypeLabel({ sacramentType: type });
}

let sacramentsAvailabilityState = { loaded: false, loading: false, error: '', timezone: '', rules: [], blackouts: [] };
let sacramentsRuleEditor = { type: '', dayOfWeek: -1 };

async function loadSacramentsAvailability(force) {
  const pane = document.getElementById('sacramentsPane');
  if (!pane || !currentParish) return;
  if (sacramentsAvailabilityState.loaded && !force) {
    renderSacramentsPanel();
    return;
  }
  sacramentsAvailabilityState = { ...sacramentsAvailabilityState, loading: true, error: '' };
  renderSacramentsPanel();
  try {
    const res = await fetch(sacramentsApi('/availability'), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load availability.');
    sacramentsAvailabilityState = {
      loaded: true,
      loading: false,
      error: '',
      timezone: data.timezone || '',
      rules: data.rules || [],
      blackouts: data.blackouts || [],
    };
    renderSacramentsPanel();
  } catch (err) {
    sacramentsAvailabilityState = {
      ...sacramentsAvailabilityState,
      loaded: true,
      loading: false,
      error: err.message || 'Unable to load availability.',
    };
    renderSacramentsPanel();
  }
}

async function loadSacramentsGoogleStatus(force = false) {
  if (!currentParish || (sacramentsGoogleState.loaded && !force) || sacramentsGoogleState.loading) return;
  sacramentsGoogleState = { ...sacramentsGoogleState, loading: true };
  renderSacramentsPanel();
  try {
    const res = await fetch(sacramentsApi('/google-calendar/status'), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load Google Calendar status.');
    sacramentsGoogleState = {
      loaded: true,
      loading: false,
      configured: Boolean(data.configured),
      connections: data.connections || [],
      error: '',
    };
  } catch (err) {
    sacramentsGoogleState = {
      ...sacramentsGoogleState,
      loaded: true,
      loading: false,
      error: err.message || 'Unable to load Google Calendar status.',
    };
  }
  renderSacramentsPanel();
}

function selectedSacramentsGoogleConnection() {
  const email = String(selectedSacramentPriest().email || '').toLowerCase();
  return (
    (sacramentsGoogleState.connections || []).find((row) => String(row.email || '').toLowerCase() === email) || null
  );
}

function renderSacramentsGoogleCalendarCard() {
  const priest = selectedSacramentPriest();
  const state = sacramentsGoogleState;
  const connection = selectedSacramentsGoogleConnection();
  if (state.loading || !state.loaded) return renderSacramentsLoadingPanel('Checking Google Calendar connection...');
  if (state.error) return renderSacramentsErrorPanel(state.error, 'loadSacramentsGoogleStatus(true)');
  const connected = Boolean(connection?.connected);
  const lastSync = connection?.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : '';
  return `<section class="sac-admin-panel">
      <div class="sac-admin-panel-head">
        <div><span>Google Calendar</span><h2>${connected ? 'Calendar connected' : 'Connect ' + escapeHtml(priest.name)}</h2></div>
        ${
          connected
            ? `<button class="sac-admin-small-btn" type="button" onclick="disconnectSacramentsGoogleCalendar()">Disconnect</button>`
            : `<button class="btn btn-gold btn-sm" type="button" onclick="connectSacramentsGoogleCalendar(this)" ${!priest.email || !state.configured ? 'disabled' : ''}>Connect Google Calendar</button>`
        }
      </div>
      <p class="sac-admin-muted">${
        connected
          ? `Scheduled requests assigned to ${escapeHtml(priest.name)} automatically create or update events in <strong>${escapeHtml(connection.calendarName || 'AGAPAY Sacraments')}</strong>.${lastSync ? ` Last synced ${escapeHtml(lastSync)}.` : ''}`
          : !priest.email
            ? 'Add this priest’s email in Settings before connecting a calendar.'
            : !state.configured
              ? 'Google Calendar credentials have not been configured for this AGAPAY environment.'
              : `Connect ${escapeHtml(priest.email)}. AGAPAY will create a dedicated Sacraments calendar and keep assigned, scheduled requests synchronized.`
      }</p>
      ${connection?.lastError ? `<div class="notice error">Last sync issue: ${escapeHtml(connection.lastError)}</div>` : ''}
    </section>`;
}

async function connectSacramentsGoogleCalendar(button) {
  const priest = selectedSacramentPriest();
  if (!priest.email) {
    setStatus('Add this priest’s email in Settings first.', 'error');
    return;
  }
  if (button) button.disabled = true;
  try {
    const res = await fetch(sacramentsApi('/google-calendar/connect'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ priestEmail: priest.email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.authUrl) throw new Error(data.error || 'Unable to begin Google Calendar connection.');
    window.location.href = data.authUrl;
  } catch (err) {
    if (button) button.disabled = false;
    setStatus(err.message, 'error');
  }
}

async function disconnectSacramentsGoogleCalendar() {
  const priest = selectedSacramentPriest();
  if (
    !window.confirm(
      `Disconnect Google Calendar for ${priest.name}? Existing Google events will remain, but AGAPAY will stop updating them.`
    )
  )
    return;
  try {
    const res = await fetch(sacramentsApi('/google-calendar/disconnect'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ priestEmail: priest.email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to disconnect Google Calendar.');
    sacramentsGoogleState.loaded = false;
    await loadSacramentsGoogleStatus(true);
    setStatus(`Google Calendar disconnected for ${priest.name}.`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
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
      body: JSON.stringify({ sacramentsEnabled: enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to update Sacraments & Services.');
    currentParish = {
      ...currentParish,
      ...(data.parish || {}),
      sacramentsEnabled: Boolean(data.parish?.sacramentsEnabled ?? enabled),
    };
    sacramentsState.loaded = false;
    sacramentsAvailabilityState = { loaded: false, loading: false, error: '', timezone: '', rules: [], blackouts: [] };
    setStatus(
      currentParish.sacramentsEnabled
        ? 'Sacraments & Services is on for parishioners.'
        : 'Sacraments & Services is off for parishioners.',
      'success'
    );
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
          ${
            schedulableTypes.length
              ? schedulableTypes.map((type) => renderSacramentsAvailabilityType(type, rulesByType[type] || [])).join('')
              : '<p class="sac-admin-empty-line">Turn on at least one bookable service above to add weekly availability.</p>'
          }
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
  const tzOptions =
    '<option value="">Choose timezone...</option>' +
    SAC_TIMEZONE_OPTIONS.map(
      ([v, l]) => `<option value="${v}" ${v === st.timezone ? 'selected' : ''}>${escapeHtml(l)}</option>`
    ).join('');
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
  selectedSchedulableSacramentTypes().forEach((t) => {
    rulesByType[t] = [];
  });
  sacramentsAvailabilityState.rules
    .filter((r) => (r.priestName || '') === (priest.name || ''))
    .forEach((r) => {
      (rulesByType[r.sacramentType] = rulesByType[r.sacramentType] || []).push(r);
    });
  Object.values(rulesByType).forEach((rows) =>
    rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || String(a.startTime).localeCompare(String(b.startTime)))
  );
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
          ${SAC_EDITABLE_SERVICE_TYPES.map(
            (type) => `
            <label>
              <input type="checkbox" ${enabled.has(type) ? 'checked' : ''} onchange="toggleSacramentsOffering('${type}', this.checked)" />
              <span><strong>${escapeHtml(sacramentTypeLabel({ sacramentType: type }))}</strong><small>${SAC_SCHEDULABLE_TYPES.includes(type) ? 'Online scheduling' : 'By request'}</small></span>
            </label>`
          ).join('')}
        </div>
        ${
          custom.length
            ? `<div class="sac-admin-custom-offerings">${custom
                .map(
                  (service) => `
          <article class="sac-admin-custom-offering">
            <div><span><strong>${escapeHtml(service.label)}</strong><small>Custom offering</small></span></div>
            <select aria-label="How ${escapeAttr(service.label)} is offered" onchange="updateCustomSacramentsOfferingMode('${escapeAttr(service.id)}', this.value)">
              <option value="request" ${service.mode !== 'schedule' ? 'selected' : ''}>By request</option>
              <option value="schedule" ${service.mode === 'schedule' ? 'selected' : ''}>Online scheduling</option>
            </select>
            <button type="button" aria-label="Remove ${escapeAttr(service.label)}" onclick="removeCustomSacramentsOffering('${escapeAttr(service.id)}')">×</button>
          </article>
        `
                )
                .join('')}</div>`
            : ''
        }
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
  const priests = sacramentPriests().map((priest, index) =>
    index === sacramentsPriestIndex ? { ...priest, serviceTypes, customServices } : priest
  );
  const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sacramentPriests: priests }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to update online offerings.');
  currentParish = {
    ...currentParish,
    ...(data.parish || {}),
    sacramentPriests: data.parish?.sacramentPriests || priests,
  };
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
  const aliases = {
    'holy unction': 'anointing',
    unction: 'anointing',
    'home visit': 'home_visit',
    'office visit': 'office_visit',
  };
  const builtIn = aliases[label.toLowerCase()];
  const priest = selectedSacramentPriest();
  const types = new Set(selectedSacramentServiceTypes());
  const custom = [...(priest.customServices || [])];
  if (builtIn) {
    types.add(builtIn);
  } else {
    const id =
      'custom_' +
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
    if (!id || id === 'custom_') return;
    if (!custom.some((service) => service.id === id)) custom.push({ id, label, mode });
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
  const custom = (priest.customServices || []).map((service) =>
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
  const custom = (priest.customServices || []).filter((service) => service.id !== id);
  try {
    await saveSelectedSacramentPriestOfferings(selectedSacramentServiceTypes(), custom, 'Offering removed.');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderSacramentsAvailabilityType(type, rules) {
  const label = selectedSacramentOfferingLabel(type);
  const rows = rules.length
    ? rules
        .map(
          (r) => `
      <div class="sac-admin-rule-row">
        <div>
          <strong>${SAC_DAY_LABELS[r.dayOfWeek]}</strong>
          <span>${escapeHtml(r.startTime)}-${escapeHtml(r.endTime)} · ${r.slotMinutes} min slots</span>
        </div>
        <button class="sac-admin-text-btn" type="button" onclick="deleteSacramentsAvailabilityRule('${r.id}')">Remove</button>
      </div>`
        )
        .join('')
    : '<p class="sac-admin-empty-line">No weekly windows set.</p>';
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
        <label><span>Type</span><select id="sacAvailNewType" ${types.length ? '' : 'disabled'}>${types.map((t) => `<option value="${t}">${escapeHtml(selectedSacramentOfferingLabel(t))}</option>`).join('')}</select></label>
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
  const priestBlackouts = st.blackouts.filter((b) => (b.priestName || '') === (priest.name || ''));
  const blackoutRows = priestBlackouts.length
    ? priestBlackouts
        .map(
          (b) => `
      <div class="sac-admin-blackout-row">
        <div>
          <strong>${escapeHtml(formatSacramentDateRange(b.startDate || b.date, b.endDate || b.date))}</strong>
          <span>${b.reason ? escapeHtml(b.reason) : 'Unavailable'}</span>
        </div>
        <button class="sac-admin-text-btn" type="button" onclick="deleteSacramentsAvailabilityBlackout('${b.id}')">Remove</button>
      </div>`
        )
        .join('')
    : '<p class="sac-admin-empty-line">No blackout dates yet.</p>';
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
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  try {
    const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz }),
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
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
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
    if (status) {
      status.textContent = 'Set and save your parish timezone first.';
      status.style.color = 'var(--red, #8b2020)';
    }
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  if (status) status.textContent = '';
  try {
    const res = await fetch(sacramentsApi('/availability/rules'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sacramentType,
        dayOfWeek,
        startTime,
        endTime,
        slotMinutes,
        priestName: priest.name,
        priestEmail: priest.email,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to add window.');
    if (status) {
      status.textContent = 'Window added.';
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadSacramentsAvailability(true);
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function deleteSacramentsAvailabilityRule(ruleId) {
  if (!currentParish) return;
  try {
    const res = await fetch(sacramentsApi('/availability/rules/' + encodeURIComponent(ruleId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Unable to remove window.');
    await loadSacramentsAvailability(true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function addSacramentsAvailabilityBlackout(btn) {
  const status = document.getElementById('sacAvailBlackoutStatus');
  const startDate = document.getElementById('sacAvailNewBlackoutStartDate')?.value;
  const endDate = document.getElementById('sacAvailNewBlackoutEndDate')?.value || startDate;
  const reason = document.getElementById('sacAvailNewBlackoutReason')?.value || '';
  const priest = selectedSacramentPriest();
  if (!startDate) {
    if (status) {
      status.textContent = 'Choose a start date.';
      status.style.color = 'var(--red, #8b2020)';
    }
    return;
  }
  if (endDate < startDate) {
    if (status) {
      status.textContent = 'End date must be on or after the start date.';
      status.style.color = 'var(--red, #8b2020)';
    }
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
  }
  if (status) status.textContent = '';
  try {
    const res = await fetch(sacramentsApi('/availability/blackouts'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, reason, priestName: priest.name, priestEmail: priest.email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to add blackout date.');
    if (status) {
      status.textContent = 'Blackout added.';
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadSacramentsAvailability(true);
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function deleteSacramentsAvailabilityBlackout(blackoutId) {
  if (!currentParish) return;
  try {
    const res = await fetch(sacramentsApi('/availability/blackouts/' + encodeURIComponent(blackoutId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Unable to remove blackout date.');
    await loadSacramentsAvailability(true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
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
  return Date.now() - new Date(row.createdAt).getTime() > SACRAMENT_OVERDUE_HOURS * 3600000;
}

function isThisWeek(row) {
  if (row.status !== 'scheduled' || !row.confirmedDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAhead = new Date(today.getTime() + 7 * 86400000);
  const confirmed = new Date(row.confirmedDate + 'T00:00:00');
  return confirmed >= today && confirmed <= weekAhead;
}

function preparationItemEditorRow(item = {}, index = 0) {
  const type = item.itemType || 'confirmation';
  return `<div class="sac-prep-editor-item" data-prep-item data-item-id="${escapeAttr(item.id || '')}">
      <span class="sac-prep-drag-order">${index + 1}</span>
      <div class="sac-prep-editor-fields">
        <input class="form-control" data-prep-title value="${escapeAttr(item.title || '')}" placeholder="Preparation step" />
        <textarea class="form-control" data-prep-description rows="2" placeholder="Clear instructions for the parishioner">${escapeHtml(item.description || '')}</textarea>
        <div class="sac-prep-editor-options">
          <select class="form-control" data-prep-type>
            ${[
              ['information', 'Guide / information'],
              ['confirmation', 'Parishioner confirmation'],
              ['document', 'Document required'],
              ['clergy_review', 'Clergy review'],
            ]
              .map(([value, label]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
          <label><input type="checkbox" data-prep-required ${item.required !== false ? 'checked' : ''} /> Required</label>
          <button class="sac-admin-text-btn" type="button" onclick="removePreparationTemplateItem(this)">Remove</button>
        </div>
      </div>
    </div>`;
}

function preparationTemplateEditor(template) {
  const type = template.sacramentType;
  const typeLabel = type === 'wedding' ? 'Wedding' : 'Baptism';
  const guides = template.guides || [];
  return `<section class="sac-admin-panel sac-prep-template" data-prep-template="${type}">
      <div class="sac-admin-panel-head">
        <div><span>Preparation template</span><h2>${typeLabel}</h2></div>
        <b>v${Number(template.version || 1)}</b>
      </div>
      <p class="sac-prep-scope-notice">${escapeHtml(template.requirementsNotice || '')}</p>
      <div class="sac-prep-template-fields">
        <label class="sac-admin-wide-field"><span>Title</span><input class="form-control" data-prep-template-title value="${escapeAttr(template.title || '')}" /></label>
        <label class="sac-admin-wide-field"><span>Introduction</span><textarea class="form-control" data-prep-template-introduction rows="3">${escapeHtml(template.introduction || '')}</textarea></label>
        <label class="sac-admin-wide-field"><span>Pastoral and canonical guidance</span><textarea class="form-control" data-prep-template-canonical rows="3">${escapeHtml(template.canonicalNote || '')}</textarea><small>State your parish's requirements under clergy direction; avoid implying one universal jurisdictional rule.</small></label>
      </div>
      <div class="sac-prep-editor-list" data-prep-item-list>
        ${(template.items || []).map(preparationItemEditorRow).join('')}
      </div>
      <div class="sac-admin-actions">
        <button class="sac-admin-outline-btn" type="button" onclick="addPreparationTemplateItem('${type}')">Add step</button>
        <button class="btn btn-gold" type="button" onclick="savePreparationTemplate('${type}', this)">Save ${typeLabel} template</button>
      </div>
      <div class="sac-prep-guides">
        <div class="sac-admin-panel-head"><div><span>Downloads</span><h2>Parish guides and forms</h2></div></div>
        ${guides.length ? `<div class="sac-prep-guide-list">${guides.map((guide) => `<div class="sac-prep-guide-row"><a href="${sacramentsApi('/preparation/documents/' + encodeURIComponent(guide.id) + '?download=1')}" target="_blank" rel="noopener">${escapeHtml(guide.displayName)}</a><span>${Math.max(1, Math.round(Number(guide.fileSize || 0) / 1024))} KB</span><button type="button" class="sac-admin-text-btn" onclick="deletePreparationGuide('${guide.id}')">Remove</button></div>`).join('')}</div>` : '<p class="sac-admin-muted">No preparation guides uploaded yet.</p>'}
        ${sacramentsState.preparationDocumentsConfigured ? `<form class="sac-prep-upload-form" onsubmit="uploadPreparationGuide(event, '${type}')"><input class="form-control" name="displayName" placeholder="Guide title" required /><input class="form-control" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" required /><button class="sac-admin-outline-btn" type="submit">Upload guide</button></form>` : '<div class="notice">Private sacrament document storage must be configured before uploading guides.</div>'}
      </div>
    </section>`;
}

function renderSacramentsPreparationTemplates() {
  const templates = sacramentsState.preparationTemplates || [];
  if (!templates.length)
    return '<div class="sac-admin-panel sac-admin-empty"><span>Preparation</span><h2>Templates unavailable</h2><p>Apply the Sacrament Preparation database migration, then refresh this page.</p></div>';
  return `<div class="sac-prep-template-grid">${templates.map(preparationTemplateEditor).join('')}</div>`;
}

function addPreparationTemplateItem(type) {
  const list = document.querySelector(`[data-prep-template="${type}"] [data-prep-item-list]`);
  if (!list) return;
  list.insertAdjacentHTML('beforeend', preparationItemEditorRow({}, list.querySelectorAll('[data-prep-item]').length));
}

function removePreparationTemplateItem(button) {
  const row = button.closest('[data-prep-item]');
  const list = row?.parentElement;
  row?.remove();
  list?.querySelectorAll('.sac-prep-drag-order').forEach((node, index) => {
    node.textContent = String(index + 1);
  });
}

async function savePreparationTemplate(type, button) {
  const root = document.querySelector(`[data-prep-template="${type}"]`);
  if (!root) return;
  const items = [...root.querySelectorAll('[data-prep-item]')].map((row) => ({
    id: row.dataset.itemId || '',
    title: row.querySelector('[data-prep-title]')?.value || '',
    description: row.querySelector('[data-prep-description]')?.value || '',
    itemType: row.querySelector('[data-prep-type]')?.value || 'confirmation',
    required: Boolean(row.querySelector('[data-prep-required]')?.checked),
  }));
  const body = {
    title: root.querySelector('[data-prep-template-title]')?.value || '',
    introduction: root.querySelector('[data-prep-template-introduction]')?.value || '',
    canonicalNote: root.querySelector('[data-prep-template-canonical]')?.value || '',
    items,
  };
  try {
    if (button) button.disabled = true;
    const res = await fetch(sacramentsApi('/preparation/templates/' + encodeURIComponent(type)), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to save the template.');
    const index = sacramentsState.preparationTemplates.findIndex((item) => item.sacramentType === type);
    if (index >= 0) sacramentsState.preparationTemplates[index] = data.template;
    setStatus(`${type === 'wedding' ? 'Wedding' : 'Baptism'} preparation template saved.`, 'success');
    renderSacramentsPanel();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function uploadPreparationGuide(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  try {
    if (button) button.disabled = true;
    const res = await fetch(sacramentsApi('/preparation/templates/' + encodeURIComponent(type) + '/documents'), {
      method: 'POST',
      headers: authHeaders(),
      body: new FormData(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to upload the guide.');
    sacramentsState.preparationTemplates = data.templates || sacramentsState.preparationTemplates;
    setStatus('Preparation guide uploaded.', 'success');
    renderSacramentsPanel();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function deletePreparationGuide(documentId) {
  if (!confirm('Remove this preparation guide?')) return;
  try {
    const res = await fetch(sacramentsApi('/preparation/documents/' + encodeURIComponent(documentId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to remove the guide.');
    await loadSacramentsPanel(true);
    setStatus('Preparation guide removed.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderParishPreparationPlan(row) {
  const plan = row.preparation;
  if (!plan) return '';
  const progress = plan.progress || { completed: 0, total: 0, percent: 0 };
  return `<details class="sac-prep-request-plan">
      <summary><span>Preparation</span><strong>${progress.completed}/${progress.total} required steps complete</strong><i style="--progress:${progress.percent}%"></i></summary>
      <p class="sac-prep-scope-notice">${escapeHtml(plan.requirementsNotice || '')}</p>
      ${plan.items
        .map(
          (item) => `<article class="sac-prep-review-item is-${escapeAttr(item.status)}">
        <div><span class="sac-prep-item-status">${escapeHtml(String(item.status || 'pending').replaceAll('_', ' '))}</span><strong>${escapeHtml(item.title)}${item.required ? ' *' : ''}</strong><p>${escapeHtml(item.description || '')}</p>${item.parishionerNote ? `<small>Parishioner note: ${escapeHtml(item.parishionerNote)}</small>` : ''}</div>
        ${(item.documents || []).length ? `<div class="sac-prep-document-list">${item.documents.map((doc) => `<div><a href="${sacramentsApi('/' + encodeURIComponent(row.id) + '/preparation/documents/' + encodeURIComponent(doc.id))}" target="_blank" rel="noopener">${escapeHtml(doc.displayName)}</a><span>${escapeHtml(doc.reviewStatus)}</span><button type="button" onclick="reviewSacramentPreparationDocument('${row.id}','${doc.id}','accepted')">Accept</button><button type="button" onclick="reviewSacramentPreparationDocument('${row.id}','${doc.id}','rejected')">Needs attention</button></div>`).join('')}</div>` : ''}
        <div class="sac-prep-review-actions">
          <button type="button" onclick="reviewSacramentPreparationItem('${row.id}','${item.id}','approved')">Approve</button>
          <button type="button" onclick="reviewSacramentPreparationItem('${row.id}','${item.id}','needs_attention')">Needs attention</button>
          <button type="button" onclick="reviewSacramentPreparationItem('${row.id}','${item.id}','waived')">Waive</button>
        </div>
        ${item.reviewerNote ? `<small>Parish note: ${escapeHtml(item.reviewerNote)}</small>` : ''}
      </article>`
        )
        .join('')}
    </details>`;
}

async function reviewSacramentPreparationItem(requestId, itemId, status) {
  const reviewerNote =
    status === 'needs_attention' ? prompt('What does the parishioner need to correct or provide?') || '' : '';
  if (status === 'needs_attention' && !reviewerNote) return;
  try {
    const res = await fetch(
      sacramentsApi('/' + encodeURIComponent(requestId) + '/preparation/items/' + encodeURIComponent(itemId)),
      {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewerNote }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to review the step.');
    await loadSacramentsPanel(true);
    setStatus('Preparation step updated.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function reviewSacramentPreparationDocument(requestId, documentId, reviewStatus) {
  const reviewerNote = reviewStatus === 'rejected' ? prompt('What needs attention in this document?') || '' : '';
  if (reviewStatus === 'rejected' && !reviewerNote) return;
  try {
    const res = await fetch(
      sacramentsApi('/' + encodeURIComponent(requestId) + '/preparation/documents/' + encodeURIComponent(documentId)),
      {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus, reviewerNote }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to review the document.');
    await loadSacramentsPanel(true);
    setStatus('Document review saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderSacramentsPanel() {
  const pane = document.getElementById('sacramentsPane');
  if (!pane) return;
  document.querySelectorAll('[data-sac-tab]').forEach((btn) => {
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
  if (sacramentsDashboardTab === 'preparation') {
    pane.innerHTML = renderSacramentsPreparationTemplates();
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

  const needsResponse = requests
    .filter((r) => r.status === 'requested')
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const thisWeek = requests
    .filter((r) => isThisWeek(r))
    .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
  const scheduled = requests
    .filter((r) => r.status === 'scheduled' && !isThisWeek(r))
    .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
  const acknowledged = requests.filter((r) => r.status === 'acknowledged');
  const history = requests.filter((r) => ['completed', 'declined', 'cancelled'].includes(r.status));

  const section = (title, rows, opts) =>
    rows.length
      ? `<section class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div><span>Requests</span><h2>${title}</h2></div>
            <b>${rows.length}</b>
          </div>
          <div class="sac-admin-request-list">${rows.map((r) => sacramentParishRow(r, opts)).join('')}</div>
        </section>`
      : '';

  pane.innerHTML = `
      ${section('Needs a response', needsResponse, { showAge: true })}
      ${section('Scheduled this week', thisWeek, {})}
      ${section('Acknowledged', acknowledged, {})}
      ${section('Scheduled', scheduled, {})}
      ${history.length ? `<details class="sac-admin-panel sac-admin-history"><summary><span>History</span><h2>Closed requests <b>${history.length}</b></h2></summary><div class="sac-admin-request-list">${history.map((r) => sacramentParishRow(r, {})).join('')}</div></details>` : ''}
    `;
}

function sacramentParishRow(row, opts = {}) {
  const typeLabel = sacramentTypeLabel(row);
  const statusOptions = SACRAMENT_STATUS_OPTIONS.map(
    (s) => `<option value="${s}" ${s === row.status ? 'selected' : ''}>${SACRAMENT_STATUS_LABELS[s]}</option>`
  ).join('');
  const overdue = opts.showAge && isOverdue(row);
  const ageChip = opts.showAge
    ? `<span class="sac-age-chip ${overdue ? 'overdue' : ''}">${daysWaiting(row.createdAt)}d waiting</span>`
    : '';
  const requested = [row.requestedDate, row.requestedTimeWindow].filter(Boolean).join(' · ');
  const confirmed = [row.confirmedDate, row.confirmedTime].filter(Boolean).join(' · ');
  const meta = [
    row.participantNames || row.donorEmail,
    confirmed || requested || formatSacramentDisplayDate(row.createdAt),
    row.clergyAssigned,
  ]
    .filter(Boolean)
    .join(' · ');
  const clergyOptions = [
    '<option value="">Choose priest...</option>',
    ...sacramentPriests().map(
      (priest) =>
        `<option value="${escapeAttr(priest.name)}" ${priest.name === row.clergyAssigned ? 'selected' : ''}>${escapeHtml(priest.name)}</option>`
    ),
  ].join('');
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
          ${renderParishPreparationPlan(row)}
        </div>
        <div class="sac-admin-request-editor" id="saceditor-${row.id}" hidden>
          <div class="sac-admin-form-grid">
            <label><span>Status</span><select id="sacstatus-${row.id}" onchange="onSacramentStatusChange('${row.id}')">${statusOptions}</select></label>
            <label><span>Confirmed date</span><input type="date" id="sacdate-${row.id}" value="${escapeAttr(row.confirmedDate || '')}" /></label>
            <label><span>Confirmed time</span><input type="text" id="sactime-${row.id}" value="${escapeAttr(row.confirmedTime || '')}" placeholder="10:00 AM" /></label>
            <label><span>Clergy assigned</span><select id="sacclergy-${row.id}">${clergyOptions}</select></label>
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
    ...(selectedSacramentPriest().customServices || []).map((service) => service.id),
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
          ${
            offeredTypes
              .map((type) => {
                const typeRules = rulesByType[type] || [];
                const activeDays = new Set(typeRules.map((rule) => Number(rule.dayOfWeek)));
                const schedulable = selectedSchedulableSacramentTypes().includes(type);
                const selectedDay = sacramentsRuleEditor.type === type ? Number(sacramentsRuleEditor.dayOfWeek) : -1;
                return `<div class="sac-admin-rules-row">
              <strong>${escapeHtml(selectedSacramentOfferingLabel(type))}</strong>
              <div class="sac-admin-day-chips">
                ${
                  schedulable
                    ? dayShort
                        .map(
                          (label, index) =>
                            `<button type="button" class="${activeDays.has(index) ? 'active' : ''} ${selectedDay === index ? 'selected' : ''}" aria-expanded="${selectedDay === index ? 'true' : 'false'}" onclick="selectSacramentRuleDay('${escapeAttr(type)}', ${index})">${label}</button>`
                        )
                        .join('')
                    : '<span class="active">Request only</span>'
                }
              </div>
              ${schedulable && selectedDay >= 0 ? renderSacramentRuleDayEditor(type, selectedDay, typeRules) : ''}
            </div>`;
              })
              .join('') || '<p class="sac-admin-empty-line">No online offerings selected.</p>'
          }
        </div>
      </div>`;
}

function selectSacramentRuleDay(type, dayOfWeek) {
  const isSame = sacramentsRuleEditor.type === type && Number(sacramentsRuleEditor.dayOfWeek) === Number(dayOfWeek);
  sacramentsRuleEditor = isSame ? { type: '', dayOfWeek: -1 } : { type, dayOfWeek: Number(dayOfWeek) };
  renderSacramentsPanel();
}

function renderSacramentRuleDayEditor(type, dayOfWeek, rules) {
  const dayRules = (rules || []).filter((rule) => Number(rule.dayOfWeek) === Number(dayOfWeek));
  const label = selectedSacramentOfferingLabel(type);
  return `
      <div class="sac-admin-rule-window-editor">
        <div class="sac-admin-rule-window-head">
          <div><span>${escapeHtml(label)}</span><strong>${SAC_DAY_LABELS[dayOfWeek]} windows</strong></div>
          <button type="button" aria-label="Close ${escapeAttr(SAC_DAY_LABELS[dayOfWeek])} window editor" onclick="selectSacramentRuleDay('${escapeAttr(type)}', ${dayOfWeek})">×</button>
        </div>
        ${
          dayRules.length
            ? `<div class="sac-admin-rule-window-list">${dayRules
                .map(
                  (rule) => `
          <div>
            <span><strong>${escapeHtml(rule.startTime)}–${escapeHtml(rule.endTime)}</strong><small>${Number(rule.slotMinutes) || 30} minute appointments</small></span>
            <button type="button" onclick="deleteSacramentsAvailabilityRule('${escapeAttr(rule.id)}')">Remove</button>
          </div>`
                )
                .join('')}</div>`
            : '<p class="sac-admin-empty-line">No windows published for this day yet.</p>'
        }
        ${
          sacramentsAvailabilityState.timezone
            ? `
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
          </div>`
            : `
          <div class="sac-admin-rule-timezone">
            <p class="sac-admin-muted">Set the parish timezone before publishing this window.</p>
            ${renderSacramentsTimezoneForm()}
          </div>`
        }
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
  const requests = (sacramentsState.requests || []).filter(
    (row) => row.status === 'scheduled' && (row.clergyAssigned || '') === (priest.name || '')
  );
  const blackouts = (st.blackouts || []).filter((row) => (row.priestName || '') === (priest.name || ''));
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const startOffset = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const byDay = {};
  requests.forEach((row) => {
    const date = row.confirmedDate || row.requestedDate || '';
    if (!date.startsWith(monthKey)) return;
    const day = Number(date.slice(-2));
    if (!day) return;
    byDay[day] = byDay[day] || [];
    byDay[day].push(row);
  });
  blackouts.forEach((row) => {
    const start = String(row.startDate || row.date || '');
    const end = String(row.endDate || row.date || start);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (date < start || date > end) continue;
      byDay[day] = byDay[day] || [];
      byDay[day].push({
        blackout: true,
        sacramentType: 'blackout',
        confirmedTime: 'All day',
        clergyAssigned: row.reason || 'Unavailable',
      });
    }
  });
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<span class="sac-admin-cal-cell empty"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const items = byDay[day] || [];
    const hasBlackout = items.some((item) => item.blackout);
    const hasScheduled = items.some((item) => !item.blackout);
    const stateClass =
      hasBlackout && hasScheduled
        ? 'has-blackout has-scheduled'
        : hasBlackout
          ? 'has-blackout'
          : hasScheduled
            ? 'has-scheduled'
            : '';
    cells.push(
      `<button class="sac-admin-cal-cell ${stateClass}" type="button" onclick="selectSacramentsCalendarDay(${day})">${day}</button>`
    );
  }
  const firstBookedDay =
    Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)[0] || now.getDate();
  const selected = Number(document.getElementById('sacramentsCalendarSelectedDay')?.value || firstBookedDay);
  const selectedItems = byDay[selected] || [];
  return `
      ${renderSacramentsGoogleCalendarCard()}
      <div class="sac-admin-calendar-layout">
        <input type="hidden" id="sacramentsCalendarSelectedDay" value="${selected}" />
        <section class="sac-admin-panel">
          <div class="sac-admin-panel-head">
            <div>
              <span>${escapeHtml(priest.name)}’s calendar</span>
              <h2>${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            </div>
          </div>
          <div class="sac-admin-weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div>
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
            ${
              selectedItems.length
                ? selectedItems
                    .map(
                      (item) => `
              <div class="sac-admin-day-card ${item.blackout ? 'blackout' : 'scheduled'}">
                <strong>${item.blackout ? 'Blackout' : escapeHtml(sacramentTypeLabel(item))}</strong>
                <span>${escapeHtml(item.confirmedTime || item.requestedTimeWindow || 'Time TBD')} · ${escapeHtml(item.clergyAssigned || item.donorEmail || '')}</span>
              </div>`
                    )
                    .join('')
                : '<p class="sac-admin-empty-line">No bookings this day.</p>'
            }
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
    parishNotes: document.getElementById('sacnotes-' + id)?.value || '',
  };
  try {
    const res = await fetch(sacramentsApi('/' + encodeURIComponent(id)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to save.');
    const sync = data.calendarSync || {};
    setStatus(
      sync.status === 'created' || sync.status === 'updated'
        ? `Request updated and ${sync.status === 'created' ? 'added to' : 'updated in'} Google Calendar.`
        : sync.status === 'error'
          ? `Request updated. Google Calendar needs attention: ${sync.error || 'sync failed.'}`
          : 'Request updated.',
      sync.status === 'error' ? 'error' : 'success'
    );
    sacramentsState.loaded = false;
    await loadSacramentsPanel(true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

window.ParishFeatureRegistry.register('sacraments', {
  load: loadSacramentsTab,
  refresh: () => loadSacramentsPanel(true),
});
