// ── SACRAMENTS & SERVICES ────────────────────────────────
// Part of AGAPAY Parish + — automatically available to donors
// whose home parish has active Parish + access. See
// handleDonorSacraments in src/handlers/donor.js for the server-side gate.

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

const SACRAMENT_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  acknowledged: 'Received by Parish',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

const SACRAMENT_STATUS_TONE: Record<string, string> = {
  requested: 'pending',
  acknowledged: 'pending',
  scheduled: 'success',
  completed: 'success',
  declined: 'wine',
  cancelled: 'muted',
};

const SAC_SCHEDULABLE_TYPES = ['house_blessing', 'confession', 'home_visit', 'office_visit', 'anointing', 'counseling'];
const SAC_ACTIVE_STATUSES = ['requested', 'acknowledged', 'scheduled'];
const SAC_ACCORDION_CARDS: SacCard[] = [
  {
    id: 'confession',
    type: 'confession',
    section: 'sacrament',
    mode: 'book',
    title: 'Confession',
    description: 'Reserve an available time for confession.',
    icon: 'cross',
  },
  {
    id: 'anointing',
    type: 'anointing',
    section: 'sacrament',
    mode: 'book',
    title: 'Holy Unction',
    description: 'Request anointing and pastoral prayer when parish availability is open.',
    icon: 'oil',
  },
  {
    id: 'baptism',
    type: 'baptism',
    section: 'sacrament',
    mode: 'request',
    title: 'Baptism',
    description: 'Begin a baptism or chrismation request for parish review.',
    icon: 'water',
  },
  {
    id: 'wedding',
    type: 'wedding',
    section: 'sacrament',
    mode: 'request',
    title: 'Wedding',
    description: 'Start a wedding request and share the first details with your parish.',
    icon: 'rings',
  },
  {
    id: 'house_blessing',
    type: 'house_blessing',
    section: 'services',
    mode: 'book',
    title: 'Blessings',
    description: 'Schedule house, car, and other parish blessing requests.',
    icon: 'home',
    locationType: 'home',
  },
  {
    id: 'home_visit',
    type: 'home_visit',
    section: 'services',
    mode: 'book',
    title: 'Home Visit',
    description: 'Reserve an available time for a pastoral visit at home.',
    icon: 'home',
    locationType: 'home',
  },
  {
    id: 'office_visit',
    type: 'office_visit',
    section: 'services',
    mode: 'book',
    title: 'Office Visit',
    description: 'Reserve an available time to meet at the parish office.',
    icon: 'chat',
  },
  {
    id: 'counseling',
    type: 'counseling',
    section: 'services',
    mode: 'book',
    title: 'Pastoral Counseling',
    description: 'Book time for a pastoral conversation.',
    icon: 'chat',
  },
  {
    id: 'commemorations',
    section: 'services',
    mode: 'commemorations',
    title: 'Commemorations',
    description: 'Submit names of the living and departed at no cost.',
    icon: 'prayer',
  },
  {
    id: 'candles',
    section: 'services',
    mode: 'link',
    title: 'Candles',
    description: 'Offer a candle through the existing secure giving flow.',
    icon: 'candle',
    href: '/myagapay/giving/give?quick=1&giftType=candles',
  },
];
const SAC_REQUIREMENTS: Record<string, string[]> = {
  baptism: [
    "Candidate's full name and date of birth",
    'Parent or sponsor contact information',
    'Godparent(s) in good standing when applicable',
    'Preferred date or season for the service',
  ],
  wedding: [
    'Names of both parties',
    'Orthodox standing and prior marriage information',
    'Koumbaro/sponsor details when known',
    'Marriage license and premarital counseling status',
  ],
};
const sacAccordionState: SacState = {
  openId: '',
  requests: [],
  available: true,
  slotsByType: {},
  loadingSlots: {},
  selectedSlots: {},
  offerings: {
    types: ['house_blessing', 'confession', 'counseling', 'baptism', 'wedding'],
    custom: [],
  },
  dashboard: null,
  commemorations: null,
};

function sacramentCards() {
  const enabled = new Set(sacAccordionState.offerings?.types || []);
  const standard = SAC_ACCORDION_CARDS.filter((card) => !card.type || enabled.has(card.type));
  const custom = (sacAccordionState.offerings?.custom || []).map((service) => ({
    id: service.id,
    type: 'other',
    schedulingType: service.id,
    otherTypeLabel: service.label,
    section: 'services',
    mode: service.mode === 'schedule' ? 'book' : 'custom-request',
    title: service.label,
    description:
      service.mode === 'schedule'
        ? `Choose an available time for ${service.label.toLowerCase()}.`
        : `Send a ${service.label.toLowerCase()} request to your parish.`,
    icon: 'cross',
  }));
  return [...standard, ...custom];
}
let sacModalEscapeBound = false;
let sacramentSelectedSlot: SacSlotSelection | null = null;

function sacramentActiveRequests(type: string | undefined) {
  return sacAccordionState.requests.filter(
    (row) => row.sacramentType === type && SAC_ACTIVE_STATUSES.includes(row.status)
  );
}

function sacramentPrimaryRequest(type: string | undefined) {
  return sacramentActiveRequests(type)[0] || null;
}

function sacramentPrimaryRequestForCard(card: SacCard) {
  if (!card) return null;
  return (
    sacAccordionState.requests.find(
      (row) =>
        SAC_ACTIVE_STATUSES.includes(row.status) &&
        row.sacramentType === card.type &&
        (card.type !== 'other' ||
          String(row.otherTypeLabel || '').toLowerCase() === String(card.otherTypeLabel || '').toLowerCase())
    ) || null
  );
}

function toggleSacramentAddressField() {
  const typeEl = document.getElementById('sacramentType') as HTMLInputElement | null;
  const locationRow = document.getElementById('sacramentLocationRow');
  const addressGroup = document.getElementById('sacramentAddressGroup');
  const otherGroup = document.getElementById('sacramentOtherLabelGroup');
  const type = typeEl?.value || '';
  const needsAddress = sacramentLocationHint(type);
  if (locationRow) locationRow.style.display = type ? '' : 'none';
  if (addressGroup)
    addressGroup.style.display = needsAddress
      ? ''
      : (document.getElementById('sacramentLocationType') as HTMLInputElement | null)?.value === 'home'
        ? ''
        : 'none';
  if (otherGroup) otherGroup.style.display = type === 'other' ? '' : 'none';
  updateSacramentSchedulingUI();
}

// Real-time availability (native, no third-party calendar) for the three
// "schedulable" sacrament types. Falls back to the free-text preferred
// date/time fields if the parish hasn't configured any windows yet.
function updateSacramentSchedulingUI() {
  const type = (document.getElementById('sacramentType') as HTMLInputElement | null)?.value || '';
  const freeText = document.getElementById('sacramentFreeTextFields');
  const slotGroup = document.getElementById('sacramentSlotPickerGroup');
  sacramentSelectedSlot = null;
  const dateInput = document.getElementById('sacramentSlotDate') as HTMLInputElement | null;
  const timeInput = document.getElementById('sacramentSlotTime') as HTMLInputElement | null;
  if (dateInput) dateInput.value = '';
  if (timeInput) timeInput.value = '';
  const note = document.getElementById('sacramentSlotSelectedNote');
  if (note) note.textContent = '';

  if (!SAC_SCHEDULABLE_TYPES.includes(type)) {
    if (freeText) freeText.style.display = 'contents';
    if (slotGroup) slotGroup.style.display = 'none';
    return;
  }
  loadSacramentSlots(type);
}

async function loadSacramentSlots(type: string) {
  const freeText = document.getElementById('sacramentFreeTextFields');
  const slotGroup = document.getElementById('sacramentSlotPickerGroup');
  const picker = document.getElementById('sacramentSlotPicker');
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  if (!parishId) return;

  if (slotGroup) slotGroup.style.display = '';
  if (picker) picker.innerHTML = '<p class="form-help">Loading availability…</p>';

  try {
    const data = await donorApi<SacPayload>(
      `/api/donor/sacraments/availability?parishId=${encodeURIComponent(parishId)}&sacramentType=${encodeURIComponent(type)}`
    );
    const slots = Array.isArray(data.slots) ? data.slots : [];
    if (!slots.length) {
      // No online scheduling set up for this type yet -- fall back to free text.
      if (freeText) freeText.style.display = 'contents';
      if (slotGroup) slotGroup.style.display = 'none';
      return;
    }
    if (freeText) freeText.style.display = 'none';
    renderSacramentSlots(slots);
  } catch {
    // Availability lookup failing shouldn't block the donor -- fall back to free text.
    if (freeText) freeText.style.display = 'contents';
    if (slotGroup) slotGroup.style.display = 'none';
  }
}

async function loadSacramentSlotsForCard(type: string, force: boolean = false) {
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  if (!parishId || (!SAC_SCHEDULABLE_TYPES.includes(type) && !/^custom_[a-z0-9_-]+$/.test(type))) return [];
  if (!force && Array.isArray(sacAccordionState.slotsByType[type])) return sacAccordionState.slotsByType[type];
  sacAccordionState.loadingSlots[type] = true;
  renderSacramentAccordions();
  try {
    const data = await donorApi<SacPayload>(
      `/api/donor/sacraments/availability?parishId=${encodeURIComponent(parishId)}&sacramentType=${encodeURIComponent(type)}`
    );
    const slots = Array.isArray(data.slots) ? data.slots : [];
    sacAccordionState.slotsByType[type] = slots;
    return slots;
  } catch {
    sacAccordionState.slotsByType[type] = [];
    return [];
  } finally {
    sacAccordionState.loadingSlots[type] = false;
    renderSacramentAccordions();
  }
}

function renderSacramentSlots(slots: SacSlot[]) {
  const picker = document.getElementById('sacramentSlotPicker');
  if (!picker) return;
  const byDate = new Map<string, SacSlot[]>();
  for (const slot of slots) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date)!.push(slot);
  }
  picker.innerHTML = Array.from(byDate.entries())
    .map(([date, daySlots]) => {
      const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const chips = daySlots
        .map((s) => {
          const timeLabel = s.label.split(', ').pop();
          return `<button type="button" class="sac-slot-chip" data-date="${escapeHtml(s.date)}" data-time="${escapeHtml(s.time)}" onclick="selectSacramentSlot('${s.date}','${s.time}', this)">${escapeHtml(timeLabel)}</button>`;
        })
        .join('');
      return `<div class="sac-slot-day"><div class="sac-slot-day-label">${escapeHtml(dayLabel)}</div><div class="sac-slot-chips">${chips}</div></div>`;
    })
    .join('');
}

function selectSacramentSlot(date: string, time: string, btn: HTMLButtonElement | null) {
  sacramentSelectedSlot = { date, time };
  const dateInput = document.getElementById('sacramentSlotDate') as HTMLInputElement | null;
  const timeInput = document.getElementById('sacramentSlotTime') as HTMLInputElement | null;
  if (dateInput) dateInput.value = date;
  if (timeInput) timeInput.value = time;
  document.querySelectorAll<HTMLElement>('.sac-slot-chip').forEach((el) => el.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
  const note = document.getElementById('sacramentSlotSelectedNote');
  if (note) {
    const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    note.textContent = `Selected: ${label} at ${btn ? btn.textContent : time}`;
  }
}

function toggleSacramentAddressFieldByLocation() {
  const addressGroup = document.getElementById('sacramentAddressGroup');
  const locationType = (document.getElementById('sacramentLocationType') as HTMLInputElement | null)?.value || 'church';
  const sacramentType = (document.getElementById('sacramentType') as HTMLInputElement | null)?.value || '';
  if (addressGroup) {
    addressGroup.style.display = locationType === 'home' || sacramentLocationHint(sacramentType) ? '' : 'none';
  }
}

function openSacramentAccordion(id: string) {
  sacAccordionState.openId = id;
  renderSacramentModal();
  const card = sacramentCards().find((item) => item.id === id);
  if (card?.mode === 'book') loadSacramentSlotsForCard(card.schedulingType || card.type!);
}

function closeSacramentModal() {
  sacAccordionState.openId = '';
  renderSacramentModal();
}

function selectSacramentAccordionSlot(type: string, date: string, time: string, btn: HTMLButtonElement | null) {
  sacAccordionState.selectedSlots[type] = {
    date,
    time,
    label: btn?.textContent || time,
    priestName: btn?.dataset?.priestName || '',
    priestEmail: btn?.dataset?.priestEmail || '',
  };
  document
    .querySelectorAll<HTMLElement>(`[data-sac-slot-type="${CSS.escape(type)}"]`)
    .forEach((el) => el.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
  const note = document.querySelector<HTMLElement>(`[data-sac-selected-note="${CSS.escape(type)}"]`);
  if (note) {
    const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    note.textContent = `Selected: ${label} at ${sacAccordionState.selectedSlots[type].label}`;
  }
}

function renderSacramentUpcomingStrip() {
  const el = document.getElementById('sacramentUpcomingStrip');
  if (!el) return;
  const rows = sacAccordionState.requests.filter((row) => SAC_ACTIVE_STATUSES.includes(row.status));
  if (!rows.length) {
    el.innerHTML = '<div class="sac-upcoming-empty">No upcoming sacrament or service requests yet.</div>';
    return;
  }
  el.innerHTML = rows
    .map((row) => {
      const statusLabel = SACRAMENT_STATUS_LABELS[row.status] || row.status;
      const tone = SACRAMENT_STATUS_TONE[row.status] || 'pending';
      const summary = sacramentSummary(row);
      const meta = [row.clergyAssigned, row.locationType === 'home' ? 'Home' : '', row.locationAddress]
        .filter(Boolean)
        .join(' · ');
      return `<article class="sac-upcoming-card">
      <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
      <strong>${escapeHtml(sacramentTypeLabel(row.sacramentType, row.otherTypeLabel))}</strong>
      <small>${escapeHtml(summary || 'Parish review')}</small>
      ${meta ? `<em>${escapeHtml(meta)}</em>` : ''}
    </article>`;
    })
    .join('');
}

function sacramentCardHeader(card: SacCard) {
  const request = card.type ? sacramentPrimaryRequestForCard(card) : null;
  const status = request
    ? `<span class="sac-card-state">${escapeHtml(SACRAMENT_STATUS_LABELS[request.status] || request.status)}</span>`
    : '';
  return `<button class="sac-accordion-trigger" type="button" aria-haspopup="dialog" onclick="openSacramentAccordion('${card.id}')">
    <span class="sac-accordion-icon">${sacramentIcon(card.icon)}</span>
    <span class="sac-accordion-copy"><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.description)}</small></span>
    ${status}
    <span class="sac-accordion-chevron" aria-hidden="true">›</span>
  </button>`;
}

function renderSlotPickerForCard(card: SacCard) {
  const existing = sacramentPrimaryRequestForCard(card);
  const schedulingType = card.schedulingType || card.type!;
  if (existing) {
    return `<div class="sac-booked-panel"><strong>Booked — ${escapeHtml(sacramentSummary(existing) || card.title)}</strong><p>Your parish can see this request.</p><button class="btn btn-ghost btn-sm" type="button" onclick="cancelSacramentRequest('${existing.id}', this)">Change</button></div>`;
  }
  if (sacAccordionState.loadingSlots[schedulingType]) return '<div class="notice">Loading availability...</div>';
  const slots = sacAccordionState.slotsByType[schedulingType] || [];
  if (!slots.length) {
    return card.type === 'other'
      ? renderCustomSacramentRequestForm(card)
      : `<form class="sac-card-form" onsubmit="submitSacramentAccordionRequest(event, '${card.type}')">
      <p class="form-help">No online times are listed right now. Send a request and your parish will follow up.</p>
      ${sacramentCommonFields(card)}
      <div class="form-grid"><div class="form-group"><label class="form-label">Preferred date</label><input class="form-input" name="requestedDate" type="date" /></div><div class="form-group"><label class="form-label">Preferred time</label><input class="form-input" name="requestedTimeWindow" placeholder="e.g. weekday morning" /></div></div>
      <button class="btn btn-gold" type="submit">Send request</button>
    </form>`;
  }
  const byDate = new Map<string, SacSlot[]>();
  slots.forEach((slot) => {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date)!.push(slot);
  });
  const days = Array.from(byDate.entries())
    .map(([date, daySlots]) => {
      const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      return `<div class="sac-slot-day"><div class="sac-slot-day-label">${escapeHtml(dayLabel)}</div><div class="sac-slot-chips">${daySlots
        .map((slot) => {
          const timeLabel =
            String(slot.label || '')
              .split(', ')
              .pop() || slot.time;
          const priestSuffix = slot.priestName ? ` · ${slot.priestName}` : '';
          return `<button type="button" class="sac-slot-chip" data-sac-slot-type="${escapeHtml(schedulingType)}" data-priest-name="${escapeHtml(slot.priestName || '')}" data-priest-email="${escapeHtml(slot.priestEmail || '')}" onclick="selectSacramentAccordionSlot('${schedulingType}','${slot.date}','${slot.time}', this)">${escapeHtml(timeLabel + priestSuffix)}</button>`;
        })
        .join('')}</div></div>`;
    })
    .join('');
  return `<form class="sac-card-form" onsubmit="submitSacramentAccordionBooking(event, '${card.id}')">
    <div class="sac-slot-picker">${days}</div>
    <p class="form-help" data-sac-selected-note="${escapeHtml(schedulingType)}"></p>
    ${sacramentCommonFields(card)}
    <button class="btn btn-gold" type="submit">Book selected time</button>
  </form>`;
}

function sacramentCommonFields(card: SacCard) {
  const needsAddress = card.locationType === 'home' || sacramentLocationHint(card.type);
  return `<div class="form-grid">
    ${needsAddress ? `<div class="form-group full"><label class="form-label">Address</label><input class="form-input" name="locationAddress" placeholder="Street, city, state" required /></div>` : ''}
    <div class="form-group full"><label class="form-label">Who is this for?</label><input class="form-input" name="participantNames" placeholder="Names of those involved" /></div>
    <div class="form-group"><label class="form-label">Best phone number</label><input class="form-input" name="phone" type="tel" placeholder="For scheduling" /></div>
    <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes" placeholder="Anything your priest should know"></textarea></div>
  </div>`;
}

function donorFormDataHeaders() {
  const headers = new Headers(donorAuthHeaders());
  headers.delete('Content-Type');
  return headers;
}

function renderDonorSacramentPreparation(request: SacRequest) {
  const plan = request?.preparation;
  if (!plan) return '';
  const progress = plan.progress || { completed: 0, total: 0, percent: 0, complete: false };
  const editable = ['requested', 'acknowledged', 'scheduled'].includes(request.status);
  const documentUrl = (id: string, download = false) =>
    `/api/donor/sacraments/${encodeURIComponent(request.id)}/preparation/documents/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;
  return `<section class="sac-preparation-plan" aria-label="${escapeHtml(plan.title || 'Preparation checklist')}">
    <header class="sac-preparation-head">
      <div><span>Preparation checklist</span><h3>${escapeHtml(plan.title || 'Preparation')}</h3></div>
      <strong>${progress.completed}/${progress.total}</strong>
    </header>
    <div class="sac-preparation-progress" aria-label="${progress.percent}% complete"><i style="width:${progress.percent}%"></i></div>
    ${plan.introduction ? `<p>${escapeHtml(plan.introduction)}</p>` : ''}
    ${plan.canonicalNote ? `<div class="sac-preparation-canonical"><strong>Pastoral guidance</strong><span>${escapeHtml(plan.canonicalNote)}</span></div>` : ''}
    <p class="sac-preparation-scope">${escapeHtml(plan.requirementsNotice || '')}</p>
    ${(plan.guides || []).length ? `<div class="sac-preparation-guides"><strong>Guides and forms</strong>${plan.guides!.map((guide) => `<a href="${documentUrl(guide.id, true)}">${escapeHtml(guide.displayName)}</a>`).join('')}</div>` : ''}
    <div class="sac-preparation-items">
      ${(plan.items || [])
        .map((item) => {
          const done = ['completed', 'approved', 'waived'].includes(item.status);
          const canCheck = editable && ['information', 'confirmation'].includes(item.itemType);
          const documents = item.documents || [];
          return `<article class="sac-preparation-item is-${escapeHtml(item.status)}">
          <div class="sac-preparation-item-main">
            ${['information', 'confirmation'].includes(item.itemType) ? `<input type="checkbox" ${done ? 'checked' : ''} ${canCheck ? '' : 'disabled'} aria-label="Mark ${escapeHtml(item.title)} complete" onchange="updateSacramentPreparationItem('${request.id}','${item.id}',this.checked)" />` : `<span class="sac-preparation-item-mark" aria-hidden="true">${item.itemType === 'document' ? '↥' : '✦'}</span>`}
            <div><strong>${escapeHtml(item.title)}${item.required ? ' *' : ''}</strong><p>${escapeHtml(item.description || '')}</p><span class="sac-preparation-status">${escapeHtml(sacramentPreparationStatusLabel(item.status))}</span>${item.reviewerNote ? `<small>${escapeHtml(item.reviewerNote)}</small>` : ''}</div>
          </div>
          ${documents.length ? `<div class="sac-preparation-documents">${documents.map((doc) => `<div><a href="${documentUrl(doc.id)}" target="_blank" rel="noopener">${escapeHtml(doc.displayName)}</a><span>${escapeHtml(doc.reviewStatus === 'rejected' ? 'Needs attention' : doc.reviewStatus)}</span>${editable && doc.uploadedByType === 'donor' && doc.reviewStatus !== 'accepted' ? `<button type="button" onclick="deleteSacramentPreparationDocument('${request.id}','${doc.id}')">Remove</button>` : ''}</div>`).join('')}</div>` : ''}
          ${editable && item.itemType === 'document' ? `<form class="sac-preparation-upload" onsubmit="uploadSacramentPreparationDocument(event,'${request.id}','${item.id}')"><input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" required /><button class="btn btn-ghost btn-sm" type="submit">Upload document</button><small>PDF, JPG, or PNG · up to 10 MB</small></form>` : ''}
        </article>`;
        })
        .join('')}
    </div>
  </section>`;
}

async function updateSacramentPreparationItem(requestId: string, itemId: string, completed: boolean) {
  try {
    setDonorStatus('Saving preparation progress...');
    await donorApi<SacPayload>(
      `/api/donor/sacraments/${encodeURIComponent(requestId)}/preparation/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      }
    );
    setDonorStatus('Preparation progress saved.', 'success');
    await loadDonorSacramentsPage();
  } catch (error) {
    setDonorStatus((error as Error).message, 'error');
    await loadDonorSacramentsPage();
  }
}

async function uploadSacramentPreparationDocument(event: Event, requestId: string, itemId: string) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Uploading...';
    }
    setDonorStatus('Uploading securely...');
    await donorApi<SacPayload>(
      `/api/donor/sacraments/${encodeURIComponent(requestId)}/preparation/items/${encodeURIComponent(itemId)}/documents`,
      {
        method: 'POST',
        headers: donorFormDataHeaders(),
        body: new FormData(form),
      }
    );
    setDonorStatus('Document submitted to your parish.', 'success');
    await loadDonorSacramentsPage();
  } catch (error) {
    setDonorStatus((error as Error).message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Upload document';
    }
  }
}

async function deleteSacramentPreparationDocument(requestId: string, documentId: string) {
  if (!confirm('Remove this submitted document?')) return;
  try {
    await donorApi<SacPayload>(
      `/api/donor/sacraments/${encodeURIComponent(requestId)}/preparation/documents/${encodeURIComponent(documentId)}`,
      { method: 'DELETE' }
    );
    setDonorStatus('Document removed.', 'success');
    await loadDonorSacramentsPage();
  } catch (error) {
    setDonorStatus((error as Error).message, 'error');
  }
}

function renderRequestFormForCard(card: SacCard) {
  const existing = sacramentPrimaryRequest(card.type);
  if (existing)
    return `<div class="sac-booked-panel"><strong>Request sent — ${escapeHtml(sacramentSummary(existing))}</strong><p>Your parish will review and follow up.</p><button class="btn btn-ghost btn-sm" type="button" onclick="cancelSacramentRequest('${existing.id}', this)">Change</button></div>${renderDonorSacramentPreparation(existing)}`;
  const requirements = (SAC_REQUIREMENTS[card.type!] || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const detailFields =
    card.type === 'baptism'
      ? `<div class="form-grid">
        <div class="form-group full"><label class="form-label">Candidate name</label><input class="form-input" name="candidateName" required /></div>
        <div class="form-group"><label class="form-label">Date of birth</label><input class="form-input" name="candidateDob" type="date" /></div>
        <div class="form-group"><label class="fee-toggle"><input name="candidateIsAdult" type="checkbox" /><span><strong>Adult candidate</strong></span></label></div>
        <div class="form-group full"><label class="form-label">Parents / sponsors</label><input class="form-input" name="parentNames" /></div>
        <div class="form-group"><label class="form-label">Godparent name</label><input class="form-input" name="godparent1Name" /></div>
        <div class="form-group"><label class="form-label">Godparent parish</label><input class="form-input" name="godparent1HomeParish" /></div>
      </div>`
      : `<div class="form-grid">
        <div class="form-group"><label class="form-label">First party name</label><input class="form-input" name="partyAName" required /></div>
        <div class="form-group"><label class="form-label">Second party name</label><input class="form-input" name="partyBName" required /></div>
        <div class="form-group"><label class="fee-toggle"><input name="partyAOrthodox" type="checkbox" /><span><strong>First party is Orthodox</strong></span></label></div>
        <div class="form-group"><label class="fee-toggle"><input name="partyBOrthodox" type="checkbox" /><span><strong>Second party is Orthodox</strong></span></label></div>
        <div class="form-group"><label class="form-label">Koumbaro / sponsor</label><input class="form-input" name="koumbaroName" /></div>
        <div class="form-group"><label class="form-label">Marriage license</label><select class="form-input" name="marriageLicenseStatus"><option value="not_started">Not started</option><option value="applied">Applied</option><option value="obtained">Obtained</option></select></div>
      </div>`;
  return `<form class="sac-card-form" onsubmit="submitSacramentAccordionRequest(event, '${card.type}')">
    <ul class="sac-requirements">${requirements}</ul>
    ${detailFields}
    <div class="form-grid"><div class="form-group"><label class="form-label">Preferred date</label><input class="form-input" name="requestedDate" type="date" /></div><div class="form-group"><label class="form-label">Preferred time</label><input class="form-input" name="requestedTimeWindow" placeholder="e.g. Saturday morning" /></div><div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes" placeholder="Anything your parish should know"></textarea></div></div>
    <button class="btn btn-gold" type="submit">Send request</button>
  </form>`;
}

function renderCustomSacramentRequestForm(card: SacCard) {
  return `<form class="sac-card-form" onsubmit="submitCustomSacramentRequest(event, '${escapeHtml(card.id)}')">
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">Who is this for?</label><input class="form-input" name="participantNames" placeholder="Names of those involved" /></div>
      <div class="form-group"><label class="form-label">Preferred date</label><input class="form-input" name="requestedDate" type="date" /></div>
      <div class="form-group"><label class="form-label">Preferred time</label><input class="form-input" name="requestedTimeWindow" placeholder="e.g. weekday morning" /></div>
      <div class="form-group"><label class="form-label">Best phone number</label><input class="form-input" name="phone" type="tel" /></div>
      <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes"></textarea></div>
    </div>
    <button class="btn btn-gold" type="submit">Send request</button>
  </form>`;
}

async function submitCustomSacramentRequest(event: Event, cardId: string) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const card = sacramentCards().find((item) => item.id === cardId);
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  if (!parishId || !card?.otherTypeLabel)
    return setDonorStatus('Choose your parish before submitting a request.', 'error');
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    await donorApi<SacPayload>('/api/donor/sacraments', {
      method: 'POST',
      body: JSON.stringify({
        parishId,
        sacramentType: 'other',
        otherTypeLabel: card.otherTypeLabel,
        locationType: 'church',
        requestedDate: formValue(form, 'requestedDate'),
        requestedTimeWindow: formValue(form, 'requestedTimeWindow'),
        participantNames: formValue(form, 'participantNames'),
        phone: formValue(form, 'phone') || donorProfile()?.contactPhone || '',
        notes: formValue(form, 'notes'),
      }),
    });
    setDonorStatus('Request sent. Your parish will follow up.', 'success');
    await loadDonorSacramentsPage();
  } catch (err) {
    setDonorStatus((err as SacRequestError).message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    }
  }
}

async function requestParishStewardshipUpgrade(clickedButton: HTMLButtonElement | null) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.pledge-encourage-btn')];
  const statuses = [...document.querySelectorAll<HTMLElement>('[data-pledge-request-status]')];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  statuses.forEach((status) => {
    status.textContent = 'Sending your request…';
  });
  try {
    const result = await donorApi<SacPayload>('/api/donor/stewardship-feature-request', { method: 'POST' });
    const message = result.message || 'Your parish will see your request in its dashboard.';
    statuses.forEach((status) => {
      status.textContent = message;
    });
    buttons.forEach((button) => {
      button.textContent = 'Request sent';
    });
  } catch (error) {
    statuses.forEach((status) => {
      status.textContent = (error as Error).message || 'Unable to send your request.';
    });
    buttons.forEach((button) => {
      button.disabled = false;
    });
    if (clickedButton) clickedButton.focus();
  }
}

function renderCommemorationsCard() {
  return `<form class="sac-card-form" id="commemorationForm" onsubmit="submitCommemoration(event)">
    <div class="donor-commemoration-kind-options" role="radiogroup" aria-label="Type of commemoration">
      <label><input type="radio" name="commemorationServiceKind" value="proskomedia_liturgy" checked /><span><strong>Liturgical commemoration</strong><small>At the Proskomedia and Divine Liturgy</small></span></label>
      <label><input type="radio" name="commemorationServiceKind" value="molieben_panikhida" /><span><strong>Molieben (Paraklesis) &amp; Panikhida (Parastas)</strong><small>Prayer service for the living or memorial service for the departed</small></span></label>
    </div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">My Parish</label><div class="form-input" id="commemorationParishDisplay" aria-live="polite">Loading your parish...</div><input id="commemorationParishId" type="hidden" /></div>
      <div class="form-group"><label class="form-label" for="commemorationLivingNames">Living names</label><textarea class="form-textarea" id="commemorationLivingNames" placeholder="One name per line"></textarea></div>
      <div class="form-group"><label class="form-label" for="commemorationDepartedNames">Departed names</label><textarea class="form-textarea" id="commemorationDepartedNames" placeholder="One name per line"></textarea></div>
      <div class="form-group full"><label class="form-label" for="commemorationLiturgyDate">Liturgy date</label><input class="form-input" id="commemorationLiturgyDate" type="date" /></div>
      <div class="form-group full"><label class="form-label" for="commemorationIntentionNote">Note for parish</label><input class="form-input" id="commemorationIntentionNote" placeholder="Optional context for the priest or parish office" /></div>
    </div>
    <p class="form-help">Commemorations are free. Candle offerings remain in the Give flow.</p>
    <button class="btn btn-gold" type="submit" id="commemorationSubmitButton">Submit commemoration</button>
    <div class="list section-gap" id="commemorationList"></div>
  </form>`;
}

function renderSacramentCardBody(card: SacCard) {
  if (card.mode === 'book') return renderSlotPickerForCard(card);
  if (card.mode === 'request') return renderRequestFormForCard(card);
  if (card.mode === 'custom-request') return renderCustomSacramentRequestForm(card);
  if (card.mode === 'commemorations') return renderCommemorationsCard();
  if (card.mode === 'link')
    return `<div class="sac-link-panel"><p>Candle offerings are paid gifts, so they continue through the secure Give checkout.</p><a class="btn btn-gold" href="${card.href}">Offer a candle</a></div>`;
  return '';
}

function renderAccordionCard(card: SacCard) {
  return `<article class="sac-accordion-card">
    ${sacramentCardHeader(card)}
  </article>`;
}

function renderSacramentModal() {
  let modal = document.getElementById('sacramentServiceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sacramentServiceModal';
    modal.className = 'sac-modal';
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeSacramentModal();
    });
    document.body.appendChild(modal);
  }
  if (!sacModalEscapeBound) {
    sacModalEscapeBound = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sacAccordionState.openId) closeSacramentModal();
    });
  }
  const card = sacramentCards().find((item) => item.id === sacAccordionState.openId);
  if (!card) {
    modal.hidden = true;
    modal.innerHTML = '';
    document.body.classList.remove('sac-modal-open');
    return;
  }
  modal.hidden = false;
  document.body.classList.add('sac-modal-open');
  modal.innerHTML = `<div class="sac-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sacModalTitle">
    <div class="sac-modal-head">
      <span class="sac-accordion-icon">${sacramentIcon(card.icon)}</span>
      <div><h2 id="sacModalTitle">${escapeHtml(card.title)}</h2><p>${escapeHtml(card.description)}</p></div>
      <button class="sac-modal-close" type="button" aria-label="Close" onclick="closeSacramentModal()">×</button>
    </div>
    <div class="sac-modal-body">${renderSacramentCardBody(card)}</div>
  </div>`;
  if (card.id === 'commemorations') {
    renderCommemorationParish(donorDefaultParish() || donorProfile()?.defaultParish || null);
    renderCommemorationsPayload(sacAccordionState.commemorations || {}, sacAccordionState.dashboard);
  }
}

function renderSacramentAccordions() {
  const sacRoot = document.getElementById('sacramentAccordion');
  const servicesRoot = document.getElementById('servicesAccordion');
  const cards = sacramentCards();
  if (sacRoot)
    sacRoot.innerHTML = cards
      .filter((card) => card.section === 'sacrament')
      .map(renderAccordionCard)
      .join('');
  if (servicesRoot)
    servicesRoot.innerHTML = cards
      .filter((card) => card.section === 'services')
      .map(renderAccordionCard)
      .join('');
  renderSacramentUpcomingStrip();
  renderSacramentModal();
}

async function loadDonorSacramentsPage() {
  const session = donorSession();
  const list = document.getElementById('sacramentList');
  const formCard = document.getElementById('sacramentFormCard');
  const unavailableNotice = document.getElementById('sacramentUnavailableNotice');
  primeCommemorationParishDisplay();

  if (!session.email || !session.token) {
    if (list) list.innerHTML = '<div class="notice">Sign in to view your requests.</div>';
    const strip = document.getElementById('sacramentUpcomingStrip');
    if (strip) strip.innerHTML = '<div class="notice">Sign in to view Sacraments & Services.</div>';
    return;
  }

  const donor = donorProfile();
  const parishId = donor?.defaultParishId || '';
  renderCommemorationParish(donorDefaultParish());
  const parishInput = document.getElementById('sacramentParishId') as HTMLInputElement | null;
  if (parishInput) parishInput.value = parishId;

  if (!parishId) {
    if (formCard) formCard.style.display = 'none';
    if (unavailableNotice) {
      unavailableNotice.style.display = 'block';
      unavailableNotice.textContent = 'Choose your parish in Settings before requesting a sacrament or service.';
    }
    if (list) list.innerHTML = '';
    renderSacramentAccordions();
    return;
  }

  const cached = readDonorCache<SacPayload>('sacraments');
  if (cached) renderSacramentsPayload(cached);

  try {
    const [sacramentsResult, dashboardResult, commemorationsResult] = await Promise.allSettled([
      donorApi<SacPayload>('/api/donor/sacraments', { headers: donorAuthHeaders({ 'X-AGAPAY-Parish-Id': parishId }) }),
      donorApi<SacPayload>('/api/donor/dashboard'),
      donorApi<SacPayload>('/api/donor/commemorations'),
    ]);
    if (sacramentsResult.status === 'rejected') throw sacramentsResult.reason;
    const data = sacramentsResult.value;
    if (dashboardResult.status === 'fulfilled') {
      sacAccordionState.dashboard = dashboardResult.value;
      if (dashboardResult.value?.donor) setDonorProfile(dashboardResult.value.donor);
    }
    if (commemorationsResult.status === 'fulfilled') {
      sacAccordionState.commemorations = commemorationsResult.value;
      writeDonorCache(
        'commemorations',
        renderCommemorationsPayload(commemorationsResult.value, sacAccordionState.dashboard)
      );
    }
    writeDonorCache('sacraments', data);
    renderSacramentsPayload(data);
  } catch (err) {
    if (isDonorUnauthorized(err)) {
      clearDonorSession();
      if (list) list.innerHTML = '<div class="notice">Session expired. Please sign in again.</div>';
      return;
    }
    if (!cached) {
      if (list) list.innerHTML = `<div class="notice">${escapeHtml((err as SacRequestError).message)}</div>`;
    }
  }
}

function renderSacramentsPayload(payload: SacPayload = {}) {
  const formCard = document.getElementById('sacramentFormCard');
  const unavailableNotice = document.getElementById('sacramentUnavailableNotice');
  const list = document.getElementById('sacramentList');

  const available = payload.available !== false; // default to showing the form while first loading
  if (formCard) formCard.style.display = available ? '' : 'none';
  if (unavailableNotice) {
    unavailableNotice.style.display = available ? 'none' : 'block';
    unavailableNotice.textContent =
      'Your parish has not enabled Sacraments & Services yet. This feature is part of AGAPAY Parish +.';
  }

  const requests = Array.isArray(payload.requests) ? payload.requests : [];
  sacAccordionState.requests = requests;
  sacAccordionState.available = available;
  if (payload.offerings) sacAccordionState.offerings = payload.offerings;
  const parishSummary = document.getElementById('sacramentParishSummary');
  if (parishSummary)
    parishSummary.textContent =
      donorDefaultParish()?.name || donorProfile()?.defaultParishName || payload.parishId || 'My parish';
  if (list) {
    list.innerHTML = requests.length
      ? requests.map(sacramentRequestRow).join('')
      : '<div class="notice">No requests submitted yet.</div>';
  }
  renderSacramentAccordions();
  return payload;
}

function formValue(form: HTMLFormElement | null, name: string) {
  return (form as SacForm | null)?.elements?.[name]?.value || '';
}

function formChecked(form: HTMLFormElement | null, name: string) {
  return (form as SacForm | null)?.elements?.[name]?.checked === true;
}

async function submitSacramentAccordionBooking(event: Event, cardId: string) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  const card = (sacramentCards().find((item) => item.id === cardId) || {}) as Partial<SacCard>;
  const schedulingType = card.schedulingType || card.type! || cardId;
  const sacramentType = card.type || cardId;
  const slot = sacAccordionState.selectedSlots[schedulingType];
  if (!parishId) return setDonorStatus('Choose your parish in Settings before booking.', 'error');
  if (!slot) return setDonorStatus('Pick an open time to book.', 'error');
  const body: SacRequestBody = {
    parishId,
    sacramentType,
    schedulingType,
    otherTypeLabel: card.otherTypeLabel || '',
    locationType: card.locationType || 'church',
    locationAddress: formValue(form, 'locationAddress'),
    date: slot.date,
    time: slot.time,
    priestName: slot.priestName || '',
    priestEmail: slot.priestEmail || '',
    participantNames: formValue(form, 'participantNames'),
    phone: formValue(form, 'phone') || donorProfile()?.contactPhone || '',
    notes: formValue(form, 'notes'),
  };
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Booking...';
    }
    setDonorStatus('Booking your slot...');
    await donorApi<SacPayload>('/api/donor/sacraments/book', { method: 'POST', body: JSON.stringify(body) });
    setDonorStatus('Booked. Your parish can see the confirmed time.', 'success');
    sacAccordionState.selectedSlots[schedulingType] = null;
    sacAccordionState.slotsByType[schedulingType] = null;
    await loadDonorSacramentsPage();
  } catch (err) {
    if ((err as SacRequestError).data?.slotTaken) {
      setDonorStatus('That time was just taken. Pick another.', 'error');
      await loadSacramentSlotsForCard(schedulingType, true);
    } else {
      setDonorStatus((err as SacRequestError).message, 'error');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Book selected time';
    }
  }
}

async function submitSacramentAccordionRequest(event: Event, sacramentType: string) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  if (!parishId) return setDonorStatus('Choose your parish in Settings before submitting a request.', 'error');
  const card = (SAC_ACCORDION_CARDS.find((item) => item.type === sacramentType) || {}) as Partial<SacCard>;
  const body: SacRequestBody = {
    parishId,
    sacramentType,
    locationType: card.locationType || 'church',
    locationAddress: formValue(form, 'locationAddress'),
    requestedDate: formValue(form, 'requestedDate'),
    requestedTimeWindow: formValue(form, 'requestedTimeWindow'),
    participantNames: formValue(form, 'participantNames'),
    phone: formValue(form, 'phone') || donorProfile()?.contactPhone || '',
    notes: formValue(form, 'notes'),
  };
  if (sacramentType === 'baptism') {
    body.baptismDetails = {
      candidateName: formValue(form, 'candidateName'),
      candidateDob: formValue(form, 'candidateDob'),
      candidateIsAdult: formChecked(form, 'candidateIsAdult'),
      parentNames: formValue(form, 'parentNames'),
      godparent1Name: formValue(form, 'godparent1Name'),
      godparent1HomeParish: formValue(form, 'godparent1HomeParish'),
    };
  }
  if (sacramentType === 'wedding') {
    body.weddingDetails = {
      partyAName: formValue(form, 'partyAName'),
      partyAOrthodox: formChecked(form, 'partyAOrthodox'),
      partyBName: formValue(form, 'partyBName'),
      partyBOrthodox: formChecked(form, 'partyBOrthodox'),
      koumbaroName: formValue(form, 'koumbaroName'),
      marriageLicenseStatus: formValue(form, 'marriageLicenseStatus') || 'not_started',
    };
  }
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    setDonorStatus('Sending your request...');
    await donorApi<SacPayload>('/api/donor/sacraments', { method: 'POST', body: JSON.stringify(body) });
    setDonorStatus('Request sent. Your parish will follow up.', 'success');
    await loadDonorSacramentsPage();
  } catch (err) {
    setDonorStatus((err as SacRequestError).message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    }
  }
}

async function submitSacramentRequest(event: Event) {
  event.preventDefault();
  const parishId =
    (document.getElementById('sacramentParishId') as HTMLInputElement | null)?.value ||
    donorProfile()?.defaultParishId ||
    '';
  const sacramentType = (document.getElementById('sacramentType') as HTMLInputElement | null)?.value || '';
  if (!parishId) {
    setDonorStatus('Choose your parish in Settings before submitting a request.', 'error');
    return;
  }
  if (!sacramentType) {
    setDonorStatus("Choose what you're requesting.", 'error');
    return;
  }
  const otherTypeLabel = (document.getElementById('sacramentOtherLabel') as HTMLInputElement | null)?.value || '';
  if (sacramentType === 'other' && !otherTypeLabel.trim()) {
    setDonorStatus("Describe what you're requesting.", 'error');
    return;
  }
  const locationType = (document.getElementById('sacramentLocationType') as HTMLInputElement | null)?.value || 'church';
  const locationAddress = (document.getElementById('sacramentAddress') as HTMLInputElement | null)?.value || '';
  if ((locationType === 'home' || sacramentLocationHint(sacramentType)) && !locationAddress.trim()) {
    setDonorStatus('An address is required for a house blessing or home visit.', 'error');
    return;
  }

  const slotPickerShown = document.getElementById('sacramentSlotPickerGroup')?.style.display !== 'none';
  const isBooking = SAC_SCHEDULABLE_TYPES.includes(sacramentType) && slotPickerShown;
  if (isBooking && !sacramentSelectedSlot) {
    setDonorStatus('Pick an open time to book.', 'error');
    return;
  }

  const participantNames = (document.getElementById('sacramentParticipants') as HTMLInputElement | null)?.value || '';
  const phone =
    (document.getElementById('sacramentPhone') as HTMLInputElement | null)?.value || donorProfile()?.contactPhone || '';
  const notes = (document.getElementById('sacramentNotes') as HTMLInputElement | null)?.value || '';

  const body = isBooking
    ? {
        parishId,
        sacramentType,
        locationType,
        locationAddress,
        date: sacramentSelectedSlot!.date,
        time: sacramentSelectedSlot!.time,
        participantNames,
        phone,
        notes,
      }
    : {
        parishId,
        sacramentType,
        otherTypeLabel,
        locationType,
        locationAddress,
        requestedDate: (document.getElementById('sacramentDate') as HTMLInputElement | null)?.value || '',
        requestedTimeWindow: (document.getElementById('sacramentTimeWindow') as HTMLInputElement | null)?.value || '',
        participantNames,
        phone,
        notes,
      };

  const submitBtn = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isBooking ? 'Booking...' : 'Sending...';
    }
    setDonorStatus(isBooking ? 'Booking your slot...' : 'Sending your request...');
    await donorApi<SacPayload>(isBooking ? '/api/donor/sacraments/book' : '/api/donor/sacraments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setDonorStatus(
      isBooking ? "Booked! You'll see it confirmed below." : 'Request sent. Your parish will follow up to confirm.',
      'success'
    );
    (event.target as HTMLFormElement).reset();
    toggleSacramentAddressField();
    await loadDonorSacramentsPage();
  } catch (err) {
    if ((err as SacRequestError).data?.slotTaken) {
      setDonorStatus('That time was just taken by someone else — pick another.', 'error');
      loadSacramentSlots(sacramentType);
    } else {
      setDonorStatus((err as SacRequestError).message, 'error');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    }
  }
}

async function cancelSacramentRequest(id: string, btn: HTMLButtonElement | null) {
  if (!id) return;
  if (!confirm("Cancel this request? This can't be undone.")) return;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Cancelling...';
    }
    await donorApi<SacPayload>(`/api/donor/sacraments/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    setDonorStatus('Request cancelled.', 'success');
    await loadDonorSacramentsPage();
  } catch (err) {
    setDonorStatus((err as SacRequestError).message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cancel request';
    }
  }
}
