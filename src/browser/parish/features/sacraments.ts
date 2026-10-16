'use strict';
import type { ParishSacPresentation } from '../sacrament-feature-presentation.js';
declare const renderSacramentsPriestPicker: ParishSacPresentation['renderSacramentsPriestPicker'];
declare const renderSacramentsFeatureToggle: ParishSacPresentation['renderSacramentsFeatureToggle'];
declare const renderSacramentsDisabledPanel: ParishSacPresentation['renderSacramentsDisabledPanel'];
declare const renderSacramentsAvailability: ParishSacPresentation['renderSacramentsAvailability'];
declare const renderSacramentsBlackouts: ParishSacPresentation['renderSacramentsBlackouts'];
declare const isThisWeek: ParishSacPresentation['isThisWeek'];
declare const sacramentParishRow: ParishSacPresentation['sacramentParishRow'];
declare const renderSacramentsRules: ParishSacPresentation['renderSacramentsRules'];
declare const renderSacramentsCalendar: ParishSacPresentation['renderSacramentsCalendar'];
import type {
  ParishSacRequest,
  ParishSacRule,
  ParishSacPriest,
  ParishSacCustomService,
  ParishSacPayload,
  ParishSacState,
  ParishSacGoogleState,
  ParishSacAvailabilityState,
} from '../sacrament-feature-contracts.js';

// Parish dashboard Sacraments & Services feature.
// Loaded before app.js so existing inline dashboard actions keep their global names.
let sacramentsState: ParishSacState = {
  loaded: false,
  requests: [],
  preparationTemplates: [],
  preparationDocumentsConfigured: false,
};
let sacramentsGoogleState: ParishSacGoogleState = { loaded: false, loading: false, configured: false, connections: [] };
let sacramentsDashboardTab = 'rules';
let sacramentsPriestIndex = 0;

function sacramentsApi(path: string = '') {
  if (!currentParish?.parishId) throw new Error('Load a parish first.');
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/sacraments' + path;
}

const SACRAMENT_TYPE_LABELS: Record<string, string> = {
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
const SACRAMENT_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  acknowledged: 'Received',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function sacramentTypeLabel(row: Pick<ParishSacRequest, 'sacramentType' | 'otherTypeLabel'>) {
  return row.sacramentType === 'other' && row.otherTypeLabel
    ? row.otherTypeLabel
    : SACRAMENT_TYPE_LABELS[row.sacramentType] || row.sacramentType;
}

function setSacramentsDashboardTab(tab: string) {
  sacramentsDashboardTab = tab || 'rules';
  document.querySelectorAll<HTMLElement>('[data-sac-tab]').forEach((btn) => {
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

function selectedSacramentPriest(): ParishSacPriest {
  const priests = sacramentPriests();
  if (sacramentsPriestIndex >= priests.length) sacramentsPriestIndex = 0;
  return priests[sacramentsPriestIndex] || { name: '', email: '' };
}

function selectSacramentsPriest(index: number) {
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

async function loadSacramentsPanel(force: boolean = false) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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
    pane.innerHTML = `<div class="notice error">${escapeHtml((err as Error).message)}</div>`;
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

function selectedSacramentOfferingLabel(type: string) {
  const custom = (selectedSacramentPriest().customServices || []).find((service) => service.id === type);
  return custom?.label || sacramentTypeLabel({ sacramentType: type });
}

let sacramentsAvailabilityState: ParishSacAvailabilityState = {
  loaded: false,
  loading: false,
  error: '',
  timezone: '',
  rules: [],
  blackouts: [],
};
let sacramentsRuleEditor = { type: '', dayOfWeek: -1 };

async function loadSacramentsAvailability(force?: boolean) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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
      error: (err as Error).message || 'Unable to load availability.',
    };
    renderSacramentsPanel();
  }
}

async function loadSacramentsGoogleStatus(force: boolean = false) {
  if (!currentParish || (sacramentsGoogleState.loaded && !force) || sacramentsGoogleState.loading) return;
  sacramentsGoogleState = { ...sacramentsGoogleState, loading: true };
  renderSacramentsPanel();
  try {
    const res = await fetch(sacramentsApi('/google-calendar/status'), { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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
      error: (err as Error).message || 'Unable to load Google Calendar status.',
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

async function connectSacramentsGoogleCalendar(button: HTMLButtonElement | null) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
    if (!res.ok || !data.authUrl) throw new Error(data.error || 'Unable to begin Google Calendar connection.');
    window.location.href = data.authUrl;
  } catch (err) {
    if (button) button.disabled = false;
    setStatus((err as Error).message, 'error');
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to disconnect Google Calendar.');
    sacramentsGoogleState.loaded = false;
    await loadSacramentsGoogleStatus(true);
    setStatus(`Google Calendar disconnected for ${priest.name}.`, 'success');
  } catch (err) {
    setStatus((err as Error).message, 'error');
  }
}

async function toggleSacramentsFeature(input: HTMLInputElement | null) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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
    syncModuleStatusNavigation('sacraments', moduleIncluded('sacraments'), currentParish.sacramentsEnabled!);
    renderSacramentsFeatureToggle();
    loadSacramentsPanel(true);
  } catch (err) {
    currentParish.sacramentsEnabled = previous;
    if (input) input.checked = previous;
    syncModuleStatusNavigation('sacraments', moduleIncluded('sacraments'), previous);
    renderSacramentsFeatureToggle();
    setStatus((err as Error).message, 'error');
  } finally {
    if (input) input.disabled = false;
  }
}

function groupSacramentsRulesByType() {
  const rulesByType: Record<string, ParishSacRule[]> = {};
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

async function saveSelectedSacramentPriestOfferings(
  serviceTypes: string[],
  customServices: ParishSacCustomService[],
  statusMessage: string
) {
  if (!currentParish) return;
  const priests = sacramentPriests().map((priest, index) =>
    index === sacramentsPriestIndex ? { ...priest, serviceTypes, customServices } : priest
  );
  const res = await fetch('/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId), {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sacramentPriests: priests }),
  });
  const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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

async function toggleSacramentsOffering(type: string, enabled: boolean) {
  const priest = selectedSacramentPriest();
  const next = new Set(selectedSacramentServiceTypes());
  enabled ? next.add(type) : next.delete(type);
  try {
    await saveSelectedSacramentPriestOfferings([...next], priest.customServices || [], 'Online offerings updated.');
  } catch (err) {
    setStatus((err as Error).message, 'error');
    renderSacramentsPanel();
  }
}

async function addCustomSacramentsOffering(btn: HTMLButtonElement | null) {
  const input = document.getElementById('sacAvailCustomOffering') as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const status = document.getElementById('sacAvailOfferingStatus');
  const label = String(input?.value || '').trim();
  const mode =
    (
      document.getElementById('sacAvailCustomOfferingMode') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    )?.value === 'schedule'
      ? 'schedule'
      : 'request';
  if (!label) {
    if (status) status.textContent = 'Enter an offering name.';
    return;
  }
  const aliases: Record<string, string> = {
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
    if (status) status.textContent = (err as Error).message;
    setStatus((err as Error).message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function updateCustomSacramentsOfferingMode(id: string, mode: string) {
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
    setStatus((err as Error).message, 'error');
    renderSacramentsPanel();
  }
}

async function removeCustomSacramentsOffering(id: string) {
  const priest = selectedSacramentPriest();
  const custom = (priest.customServices || []).filter((service) => service.id !== id);
  try {
    await saveSelectedSacramentPriestOfferings(selectedSacramentServiceTypes(), custom, 'Offering removed.');
  } catch (err) {
    setStatus((err as Error).message, 'error');
  }
}

async function saveSacramentsAvailabilityTimezone(btn: HTMLButtonElement | null) {
  const tz =
    (document.getElementById('sacAvailTimezone') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
      ?.value || '';
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
    const data = (await res.json()) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to save timezone.');
    currentParish.timezone = tz;
    sacramentsAvailabilityState.timezone = tz;
    setStatus('Parish timezone saved.', 'success');
    renderSacramentsPanel();
  } catch (err) {
    setStatus((err as Error).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function addSacramentsAvailabilityRule(btn: HTMLButtonElement | null) {
  const status = document.getElementById('sacAvailRuleStatus');
  const sacramentType = (
    document.getElementById('sacAvailNewType') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  )?.value;
  const dayOfWeek = Number(
    (document.getElementById('sacAvailNewDay') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
      ?.value
  );
  const startTime = (
    document.getElementById('sacAvailNewStart') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  )?.value;
  const endTime = (
    document.getElementById('sacAvailNewEnd') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  )?.value;
  const slotMinutes =
    Number(
      (
        document.getElementById('sacAvailNewSlotMinutes') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
      )?.value
    ) || 30;
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
    const data = (await res.json()) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to add window.');
    if (status) {
      status.textContent = 'Window added.';
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadSacramentsAvailability(true);
  } catch (err) {
    if (status) {
      status.textContent = (err as Error).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function deleteSacramentsAvailabilityRule(ruleId: string) {
  if (!currentParish) return;
  try {
    const res = await fetch(sacramentsApi('/availability/rules/' + encodeURIComponent(ruleId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Unable to remove window.');
    await loadSacramentsAvailability(true);
  } catch (err) {
    setStatus((err as Error).message, 'error');
  }
}

async function addSacramentsAvailabilityBlackout(btn: HTMLButtonElement | null) {
  const status = document.getElementById('sacAvailBlackoutStatus');
  const startDate = (
    document.getElementById('sacAvailNewBlackoutStartDate') as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  )?.value;
  const endDate =
    (
      document.getElementById('sacAvailNewBlackoutEndDate') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    )?.value || startDate;
  const reason =
    (
      document.getElementById('sacAvailNewBlackoutReason') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    )?.value || '';
  const priest = selectedSacramentPriest();
  if (!startDate) {
    if (status) {
      status.textContent = 'Choose a start date.';
      status.style.color = 'var(--red, #8b2020)';
    }
    return;
  }
  if (endDate! < startDate) {
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
    const data = (await res.json()) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to add blackout date.');
    if (status) {
      status.textContent = 'Blackout added.';
      status.style.color = 'var(--green, #2a7a4b)';
    }
    await loadSacramentsAvailability(true);
  } catch (err) {
    if (status) {
      status.textContent = (err as Error).message;
      status.style.color = 'var(--red, #8b2020)';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

async function deleteSacramentsAvailabilityBlackout(blackoutId: string) {
  if (!currentParish) return;
  try {
    const res = await fetch(sacramentsApi('/availability/blackouts/' + encodeURIComponent(blackoutId)), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Unable to remove blackout date.');
    await loadSacramentsAvailability(true);
  } catch (err) {
    setStatus((err as Error).message, 'error');
  }
}

// Groups requests by urgency rather than a flat active/history split, so
// a priest can tell at a glance what needs attention: unacknowledged
// requests (oldest first, flagged overdue past 48h — a client-side
// "tickler" highlight computed from data already on the request, no
// backend change needed), what's scheduled in the next 7 days, what's
// scheduled further out, and closed history.
const SACRAMENT_OVERDUE_HOURS = 48;

async function reviewSacramentPreparationItem(requestId: string, itemId: string, status: string) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to review the step.');
    await loadSacramentsPanel(true);
    setStatus('Preparation step updated.', 'success');
  } catch (error) {
    setStatus((error as Error).message, 'error');
  }
}

async function reviewSacramentPreparationDocument(requestId: string, documentId: string, reviewStatus: string) {
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
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
    if (!res.ok) throw new Error(data.error || 'Unable to review the document.');
    await loadSacramentsPanel(true);
    setStatus('Document review saved.', 'success');
  } catch (error) {
    setStatus((error as Error).message, 'error');
  }
}

function renderSacramentsPanel() {
  const pane = document.getElementById('sacramentsPane');
  if (!pane) return;
  document.querySelectorAll<HTMLElement>('[data-sac-tab]').forEach((btn) => {
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
    .sort(
      (a, b) => (new Date(a.createdAt || 0) as unknown as number) - (new Date(b.createdAt || 0) as unknown as number)
    );
  const thisWeek = requests
    .filter((r) => isThisWeek(r))
    .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
  const scheduled = requests
    .filter((r) => r.status === 'scheduled' && !isThisWeek(r))
    .sort((a, b) => (a.confirmedDate || '').localeCompare(b.confirmedDate || ''));
  const acknowledged = requests.filter((r) => r.status === 'acknowledged');
  const history = requests.filter((r) => ['completed', 'declined', 'cancelled'].includes(r.status));

  const section = (title: string, rows: ParishSacRequest[], opts: { showAge?: boolean }) =>
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

function toggleSacramentRequestEditor(id: string) {
  const editor = document.getElementById('saceditor-' + id);
  if (editor) editor.hidden = !editor.hidden;
}

function selectSacramentRuleDay(type: string, dayOfWeek: number) {
  const isSame = sacramentsRuleEditor.type === type && Number(sacramentsRuleEditor.dayOfWeek) === Number(dayOfWeek);
  sacramentsRuleEditor = isSame ? { type: '', dayOfWeek: -1 } : { type, dayOfWeek: Number(dayOfWeek) };
  renderSacramentsPanel();
}

function selectSacramentsCalendarDay(day: string) {
  const input = document.getElementById('sacramentsCalendarSelectedDay') as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (input) input.value = String(day);
  renderSacramentsPanel();
}

function onSacramentStatusChange(id: string) {
  const select = document.getElementById('sacstatus-' + id) as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const status = select?.value || '';
  const scheduledFields = document.getElementById('sacfields-' + id);
  const declineFields = document.getElementById('sacdecline-' + id);
  if (scheduledFields) scheduledFields.style.display = status === 'scheduled' ? '' : 'none';
  if (declineFields) declineFields.style.display = status === 'declined' ? '' : 'none';
}

async function saveSacramentRequest(id: string) {
  const status = (
    document.getElementById('sacstatus-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  )?.value;
  const body = {
    status,
    confirmedDate:
      (document.getElementById('sacdate-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
        ?.value || '',
    confirmedTime:
      (document.getElementById('sactime-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
        ?.value || '',
    clergyAssigned:
      (document.getElementById('sacclergy-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
        ?.value || '',
    declineReason:
      (document.getElementById('sacreason-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
        ?.value || '',
    parishNotes:
      (document.getElementById('sacnotes-' + id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
        ?.value || '',
  };
  try {
    const res = await fetch(sacramentsApi('/' + encodeURIComponent(id)), {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ParishSacPayload;
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
    setStatus((err as Error).message, 'error');
  }
}

window.ParishFeatureRegistry.register('sacraments', {
  load: loadSacramentsTab,
  refresh: () => loadSacramentsPanel(true),
});

export type ParishSacBindings = {
  sacramentPriests: typeof sacramentPriests;
  sacramentsPriestIndex: typeof sacramentsPriestIndex;
  selectedSacramentPriest: typeof selectedSacramentPriest;
  sacramentsGoogleState: typeof sacramentsGoogleState;
  selectedSacramentsGoogleConnection: typeof selectedSacramentsGoogleConnection;
  sacramentsAvailabilityState: typeof sacramentsAvailabilityState;
  groupSacramentsRulesByType: typeof groupSacramentsRulesByType;
  selectedSchedulableSacramentTypes: typeof selectedSchedulableSacramentTypes;
  SAC_TIMEZONE_OPTIONS: typeof SAC_TIMEZONE_OPTIONS;
  selectedSacramentServiceTypes: typeof selectedSacramentServiceTypes;
  SAC_EDITABLE_SERVICE_TYPES: typeof SAC_EDITABLE_SERVICE_TYPES;
  sacramentTypeLabel: typeof sacramentTypeLabel;
  SAC_SCHEDULABLE_TYPES: typeof SAC_SCHEDULABLE_TYPES;
  selectedSacramentOfferingLabel: typeof selectedSacramentOfferingLabel;
  SAC_DAY_LABELS: typeof SAC_DAY_LABELS;
  SACRAMENT_OVERDUE_HOURS: typeof SACRAMENT_OVERDUE_HOURS;
  sacramentsApi: typeof sacramentsApi;
  SACRAMENT_STATUS_OPTIONS: typeof SACRAMENT_STATUS_OPTIONS;
  SACRAMENT_STATUS_LABELS: typeof SACRAMENT_STATUS_LABELS;
  sacramentsRuleEditor: typeof sacramentsRuleEditor;
  sacramentsState: typeof sacramentsState;
};
