'use strict';

let pastoralFollowUpState = {
  parishId: '',
  loaded: false,
  loading: false,
  error: '',
  followups: [],
  memorials: [],
  candidates: [],
  candidatesLoaded: false,
  scope: 'all',
  access: null,
};

function pastoralAuthHeaders() {
  const token = sessionStorage.getItem('agapay_identity_session_token') || '';
  const email = sessionStorage.getItem('agapay_identity_email') || '';
  if (!token || !email) return authHeaders();
  return { Accept: 'application/json', Authorization: 'Bearer ' + token, 'X-AGAPAY-User-Email': email };
}

const PASTORAL_REASON_LABELS = {
  homebound: 'Homebound',
  hospitalized: 'Hospitalized',
  bereavement: 'Bereavement',
  newcomer: 'Newcomer',
  regular_check_in: 'Regular check-in',
  other: 'Other pastoral need',
};
const PASTORAL_CONTACT_LABELS = {
  phone: 'Phone call',
  home_visit: 'Home visit',
  hospital_visit: 'Hospital visit',
  communion: 'Communion brought',
  conversation: 'In-person conversation',
  family_contact: 'Family contact',
  other: 'Other contact',
};
const PASTORAL_CLOSURE_LABELS = {
  recovered: 'Recovered / no routine follow-up needed',
  care_transferred: 'Care transferred',
  declined: 'Person declined further follow-up',
  moved: 'Moved away',
  reposed: 'Reposed',
  other: 'Other',
};
const MEMORIAL_MARKER_LABELS = {
  third_day: '3rd day',
  ninth_day: '9th day',
  fortieth_day: '40th day',
  six_month: 'Six months',
  first_anniversary: 'First anniversary',
  annual_anniversary: 'Annual anniversary',
};

async function loadPastoralFollowUps(force = false) {
  if (!currentParish) return;
  if (pastoralFollowUpState.parishId !== currentParish.parishId) {
    pastoralFollowUpState = {
      parishId: currentParish.parishId,
      loaded: false,
      loading: false,
      error: '',
      followups: [],
      memorials: [],
      candidates: [],
      candidatesLoaded: false,
      scope: 'all',
      access: null,
    };
  }
  if (pastoralFollowUpState.loading || (pastoralFollowUpState.loaded && !force)) return;
  pastoralFollowUpState = { ...pastoralFollowUpState, loading: true, error: '' };
  renderSacramentsPanel();
  try {
    const response = await fetch(sacramentsApi('/follow-up?scope=' + encodeURIComponent(pastoralFollowUpState.scope)), {
      headers: pastoralAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load pastoral follow-up.');
    pastoralFollowUpState = {
      ...pastoralFollowUpState,
      parishId: currentParish.parishId,
      loaded: true,
      loading: false,
      error: '',
      followups: data.followups || [],
      memorials: data.memorials || [],
      access: data.access || null,
      scope: data.access?.scope || pastoralFollowUpState.scope,
    };
  } catch (error) {
    pastoralFollowUpState = {
      ...pastoralFollowUpState,
      loaded: true,
      loading: false,
      error: error.message || 'Unable to load pastoral follow-up.',
    };
  }
  renderSacramentsPanel();
}

async function searchPastoralFollowUpCandidates() {
  const query = document.getElementById('pastoralCandidateSearch')?.value || '';
  const status = document.getElementById('pastoralCandidateStatus');
  if (status) status.textContent = 'Searching…';
  try {
    const response = await fetch(sacramentsApi('/follow-up/candidates?q=' + encodeURIComponent(query)), {
      headers: pastoralAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to search the directory.');
    pastoralFollowUpState.candidates = data.people || [];
    pastoralFollowUpState.candidatesLoaded = true;
    renderSacramentsPanel();
    const details = document.getElementById('pastoralAddFollowUp');
    if (details) details.open = true;
  } catch (error) {
    if (status) status.textContent = error.message;
    setStatus(error.message, 'error');
  }
}

function pastoralDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function pastoralToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pastoralDateFromToday(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function pastoralLocalDateTime() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function pastoralNextDue(days, contactedAt = '') {
  const date = contactedAt ? new Date(contactedAt) : new Date();
  if (Number.isNaN(date.getTime())) return pastoralDateFromToday(days);
  date.setDate(date.getDate() + Number(days || 30));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function pastoralAddCalendarDate(value, { days = 0, months = 0, years = 0 } = {}) {
  const source = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(source.getTime())) return '';
  if (days) source.setUTCDate(source.getUTCDate() + days);
  if (months || years) {
    const targetYear = source.getUTCFullYear() + years;
    const targetMonth = source.getUTCMonth() + months;
    const day = source.getUTCDate();
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    source.setUTCFullYear(targetYear, targetMonth, Math.min(day, lastDay));
  }
  return source.toISOString().slice(0, 10);
}

function pastoralMemorialDates(reposedOn) {
  return {
    third_day: pastoralAddCalendarDate(reposedOn, { days: 2 }),
    ninth_day: pastoralAddCalendarDate(reposedOn, { days: 8 }),
    fortieth_day: pastoralAddCalendarDate(reposedOn, { days: 39 }),
    six_month: pastoralAddCalendarDate(reposedOn, { months: 6 }),
    first_anniversary: pastoralAddCalendarDate(reposedOn, { years: 1 }),
  };
}

function pastoralRelativeDue(dateText) {
  const due = new Date(`${dateText}T12:00:00`);
  const today = new Date(`${pastoralToday()}T12:00:00`);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function pastoralLastContact(row) {
  if (!row.lastContactAt) return 'No contact logged yet';
  const date = new Date(row.lastContactAt);
  const dateText = Number.isNaN(date.getTime())
    ? row.lastContactAt
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  return `${PASTORAL_CONTACT_LABELS[row.lastContactType] || 'Contact'} · ${dateText}`;
}

function pastoralReasonOptions(selected) {
  return Object.entries(PASTORAL_REASON_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`
    )
    .join('');
}

function pastoralClosureOptions(selected = 'recovered', includeReposed = true) {
  return Object.entries(PASTORAL_CLOSURE_LABELS)
    .filter(([value]) => includeReposed || value !== 'reposed')
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`
    )
    .join('');
}

function pastoralPriestOptions(row) {
  return sacramentPriests()
    .map((priest) => {
      const selected =
        String(priest.email || '').toLowerCase() === String(row.assignedPriestEmail || '').toLowerCase() ||
        (!priest.email && priest.name === row.assignedPriestName);
      return `<option value="${escapeAttr(priest.email || priest.name)}" ${selected ? 'selected' : ''}>${escapeHtml(priest.name)}</option>`;
    })
    .join('');
}

function pastoralCreatePriestField(label = 'Assigned priest') {
  const access = pastoralFollowUpState.access || {};
  if (!access.canCover)
    return `<label><span>${escapeHtml(label)}</span><input value="${escapeAttr(access.priest?.name || access.userName || '')}" disabled /></label>`;
  return `<label><span>${escapeHtml(label)}</span><select name="assignedPriest" required>${sacramentPriests()
    .map((priest) => `<option value="${escapeAttr(priest.email || priest.name)}">${escapeHtml(priest.name)}</option>`)
    .join('')}</select></label>`;
}

function pastoralFollowUpCard(row, urgency = '') {
  const id = escapeAttr(row.id);
  const contactOptions = Object.entries(PASTORAL_CONTACT_LABELS)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join('');
  const cadence = Number(row.cadenceDays || 30);
  return `<article class="pastoral-card ${escapeAttr(urgency)}">
      <div class="pastoral-card-main">
        <div class="pastoral-card-title">
          <strong>${escapeHtml(row.personName)}</strong>
          <span class="pastoral-reason">${escapeHtml(PASTORAL_REASON_LABELS[row.reason] || row.reason)}</span>
          ${urgency === 'overdue' ? '<span class="pastoral-urgent">Overdue</span>' : ''}
        </div>
        <p>${escapeHtml([row.contactPhone, row.contactEmail].filter(Boolean).join(' · ') || 'No contact method on file')}</p>
        <p><b>${escapeHtml(pastoralRelativeDue(row.nextDueOn))}</b> · ${escapeHtml(formatSacramentDisplayDate(row.nextDueOn))}</p>
        <p>${escapeHtml(pastoralLastContact(row))}${row.cadenceDays ? ` · Every ${Number(row.cadenceDays)} days` : ''}</p>
        ${row.note ? `<p class="pastoral-card-note">${escapeHtml(row.note)}</p>` : ''}
      </div>
      <div class="pastoral-card-actions">
        <button class="btn btn-gold btn-sm" type="button" onclick="togglePastoralContactForm('${id}')">Log contact</button>
        <button class="sac-admin-small-btn" type="button" onclick="openPastoralSchedule('${id}')">Schedule visit</button>
        <button class="sac-admin-text-btn" type="button" onclick="togglePastoralSettings('${id}')">Manage</button>
      </div>
      <form class="pastoral-inline-form" id="pastoral-contact-${id}" onsubmit="savePastoralContact(event, '${id}')" hidden>
        <div class="sac-admin-form-grid">
          <label><span>Contact type</span><select name="contactType">${contactOptions}</select></label>
          <label><span>Contacted at</span><input name="contactedAt" type="datetime-local" value="${escapeAttr(pastoralLocalDateTime())}" required /></label>
          <label><span>Next follow-up</span><input name="nextDueOn" type="date" value="${escapeAttr(pastoralNextDue(cadence))}" required /></label>
          <label class="pastoral-close-check"><span>Plan status</span><em><input name="close" type="checkbox" onchange="togglePastoralContactClose(this)" /> Close after this contact</em></label>
          <label><span>Closure outcome</span><select name="closureOutcome" disabled>${pastoralClosureOptions('recovered', false)}</select></label>
        </div>
        <label class="sac-admin-wide-field"><span>Brief pastoral note</span><textarea name="summary" rows="2" maxlength="1200" placeholder="Keep this concise; do not record medical detail."></textarea></label>
        <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit">Save contact</button><button class="sac-admin-text-btn" type="button" onclick="togglePastoralContactForm('${id}')">Cancel</button></div>
      </form>
      <form class="pastoral-inline-form" id="pastoral-settings-${id}" onsubmit="savePastoralSettings(event, '${id}')" hidden>
        <div class="sac-admin-form-grid">
          ${pastoralFollowUpState.access?.canCover ? `<label><span>Assigned priest</span><select name="assignedPriest">${pastoralPriestOptions(row)}</select></label>` : `<label><span>Assigned priest</span><input value="${escapeAttr(row.assignedPriestName)}" disabled /></label>`}
          <label><span>Reason</span><select name="reason">${pastoralReasonOptions(row.reason)}</select></label>
          <label><span>Next follow-up</span><input name="nextDueOn" type="date" value="${escapeAttr(row.nextDueOn)}" required /></label>
          <label><span>Cadence in days</span><input name="cadenceDays" type="number" min="1" max="3650" value="${escapeAttr(row.cadenceDays || '')}" /></label>
        </div>
        <label class="sac-admin-wide-field"><span>Care note</span><textarea name="note" rows="2" maxlength="1200">${escapeHtml(row.note || '')}</textarea></label>
        <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit">Save plan</button><button class="sac-admin-small-btn" type="button" onclick="snoozePastoralFollowUp('${id}')">Snooze 7 days</button><button class="sac-admin-text-btn" type="button" onclick="togglePastoralClosure('${id}')">End follow-up</button></div>
      </form>
      <form class="pastoral-inline-form pastoral-closure-form" id="pastoral-closure-${id}" onsubmit="savePastoralClosure(event, '${id}')" hidden>
        <div class="sac-admin-form-grid">
          <label><span>Why is this follow-up ending?</span><select name="closureOutcome" onchange="togglePastoralReposeFields(this)">${pastoralClosureOptions()}</select></label>
          <label class="sac-admin-wide-field"><span>Brief note</span><input name="closureReason" maxlength="500" placeholder="Optional context for clergy history" /></label>
        </div>
        <div class="pastoral-repose-fields" data-repose-fields hidden>
          <div class="sac-admin-form-grid">
            <label><span>Date of repose</span><input name="reposedOn" type="date" onchange="updatePastoralMemorialPreview(this.form)" /></label>
            <label class="pastoral-close-check"><span>Ongoing observance</span><em><input name="annualEnabled" type="checkbox" checked /> Continue annual reminders</em></label>
          </div>
          <fieldset class="pastoral-marker-choices">
            <legend>Memorial observances</legend>
            ${['third_day', 'ninth_day', 'fortieth_day', 'six_month', 'first_anniversary']
              .map(
                (type) =>
                  `<label><input type="checkbox" name="markerType" value="${type}" checked onchange="updatePastoralMemorialPreview(this.form)" /><span>${escapeHtml(MEMORIAL_MARKER_LABELS[type])}</span><small data-marker-preview="${type}"></small></label>`
              )
              .join('')}
          </fieldset>
          <p class="sac-admin-muted">Dates are counted inclusively from the date of repose and remain editable when the service is scheduled.</p>
        </div>
        <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit">Save outcome</button><button class="sac-admin-text-btn" type="button" onclick="togglePastoralClosure('${id}')">Cancel</button></div>
      </form>
    </article>`;
}

function pastoralQueue(title, subtitle, rows, urgency) {
  if (!rows.length) return '';
  return `<section class="sac-admin-panel pastoral-queue">
      <div class="sac-admin-panel-head"><div><span>${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div><b>${rows.length}</b></div>
      <div class="pastoral-card-list">${rows.map((row) => pastoralFollowUpCard(row, urgency)).join('')}</div>
    </section>`;
}

function memorialMarkerCard(marker, urgency = '') {
  const id = escapeAttr(marker.id);
  const scheduled = marker.status === 'scheduled';
  const arranged = marker.status === 'arranged';
  const settled = scheduled || arranged;
  return `<article class="pastoral-card pastoral-memorial-card ${escapeAttr(urgency)}">
      <div class="pastoral-card-main">
        <div class="pastoral-card-title">
          <strong>${escapeHtml(marker.personName)}</strong>
          <span class="pastoral-reason">${escapeHtml(marker.markerLabel || MEMORIAL_MARKER_LABELS[marker.markerType] || 'Memorial')}</span>
          ${urgency === 'overdue' ? '<span class="pastoral-urgent">Needs attention</span>' : ''}
          ${settled ? `<span class="pastoral-scheduled">${arranged ? 'Arranged' : 'Scheduled'}</span>` : ''}
        </div>
        <p><b>${escapeHtml(settled ? `${arranged ? 'Arranged' : 'Scheduled'} ${formatSacramentDisplayDate(marker.scheduledFor)}` : pastoralRelativeDue(marker.targetDate))}</b> · Target ${escapeHtml(formatSacramentDisplayDate(marker.targetDate))}</p>
        <p>Reposed ${escapeHtml(formatSacramentDisplayDate(marker.reposedOn))} · ${escapeHtml(marker.assignedPriestName)}</p>
        ${marker.note ? `<p class="pastoral-card-note">${escapeHtml(marker.note)}</p>` : ''}
      </div>
      <div class="pastoral-card-actions">
        ${
          scheduled
            ? `<button class="sac-admin-small-btn" type="button" onclick="openMemorialRequest('${escapeAttr(marker.serviceRequestId)}')">Open request</button>`
            : arranged
              ? `<button class="btn btn-gold btn-sm" type="button" onclick="completeMemorialMarker('${id}')">Mark complete</button><button class="sac-admin-text-btn" type="button" onclick="reopenMemorialMarker('${id}')">Needs scheduling</button>`
              : `<button class="btn btn-gold btn-sm" type="button" onclick="toggleMemorialSchedule('${id}')">Schedule service</button>
               <button class="sac-admin-small-btn" type="button" onclick="arrangeMemorialElsewhere('${id}')">Mark arranged</button>
               <button class="sac-admin-text-btn" type="button" onclick="skipMemorialMarker('${id}')">Skip</button>`
        }
      </div>
      ${
        settled
          ? ''
          : `<form class="pastoral-inline-form" id="memorial-schedule-${id}" onsubmit="scheduleMemorialMarker(event, '${id}')" hidden>
              <div class="sac-admin-form-grid">
                <label><span>Service date</span><input name="scheduledFor" type="date" value="${escapeAttr(marker.targetDate)}" required /></label>
                <label><span>Time</span><input name="confirmedTime" maxlength="40" placeholder="10:00 AM" /></label>
              </div>
              <label class="sac-admin-wide-field"><span>Internal note</span><textarea name="note" rows="2" maxlength="1000" placeholder="Optional scheduling note"></textarea></label>
              <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit">Create memorial request</button><button class="sac-admin-text-btn" type="button" onclick="toggleMemorialSchedule('${id}')">Cancel</button></div>
            </form>`
      }
    </article>`;
}

function memorialQueue(title, subtitle, rows, urgency = '') {
  if (!rows.length) return '';
  return `<section class="sac-admin-panel pastoral-queue pastoral-memorial-queue">
      <div class="sac-admin-panel-head"><div><span>${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div><b>${rows.length}</b></div>
      <div class="pastoral-card-list">${rows.map((row) => memorialMarkerCard(row, urgency)).join('')}</div>
    </section>`;
}

function pastoralAddForm() {
  const people = pastoralFollowUpState.candidates || [];
  const options = people
    .map((person) => {
      const label = [person.name, person.phone || person.email].filter(Boolean).join(' · ');
      const disabled = Boolean(person.followupId);
      const trackedLabel = person.followupStatus === 'closed' ? ' — closed; reopen from history' : ' — already tracked';
      return `<option value="${escapeAttr(person.id)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}${disabled ? trackedLabel : ''}</option>`;
    })
    .join('');
  return `<details class="sac-admin-panel pastoral-add" id="pastoralAddFollowUp">
      <summary><span>Add follow-up</span><strong>Start tracking someone</strong></summary>
      <p class="sac-admin-muted">Choose an active person from Directory, assign responsibility, and set the first date this plan should surface.</p>
      <div class="pastoral-directory-search">
        <input id="pastoralCandidateSearch" placeholder="Search directory by name" onkeydown="if(event.key==='Enter'){event.preventDefault();searchPastoralFollowUpCandidates();}" />
        <button class="sac-admin-outline-btn" type="button" onclick="searchPastoralFollowUpCandidates()">Search Directory</button>
        <span id="pastoralCandidateStatus" class="sac-admin-status-text"></span>
      </div>
      <form class="pastoral-add-form" onsubmit="createPastoralFollowUp(event)">
        <div class="sac-admin-form-grid">
          <label><span>Person</span><select name="personId" required><option value="">${pastoralFollowUpState.candidatesLoaded ? 'Choose a person…' : 'Search Directory first…'}</option>${options}</select></label>
          ${pastoralCreatePriestField()}
          <label><span>Reason</span><select name="reason">${pastoralReasonOptions('regular_check_in')}</select></label>
          <label><span>First follow-up</span><input name="nextDueOn" type="date" value="${escapeAttr(pastoralToday())}" required /></label>
          <label><span>Repeat every</span><select name="cadenceDays"><option value="7">Week</option><option value="14">2 weeks</option><option value="30" selected>Month</option><option value="60">2 months</option><option value="90">3 months</option><option value="180">6 months</option><option value="365">Year</option></select></label>
        </div>
        <label class="sac-admin-wide-field"><span>Care note</span><textarea name="note" rows="2" maxlength="1200" placeholder="A brief reminder for clergy; avoid unnecessary medical detail."></textarea></label>
        <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit" ${people.length ? '' : 'disabled'}>Add follow-up</button></div>
      </form>
    </details>`;
}

function pastoralStandaloneReposeForm() {
  const people = (pastoralFollowUpState.candidates || []).filter((person) => !person.followupId);
  const options = people
    .map(
      (person) =>
        `<option value="${escapeAttr(person.id)}">${escapeHtml([person.name, person.phone || person.email].filter(Boolean).join(' · '))}</option>`
    )
    .join('');
  return `<details class="sac-admin-panel pastoral-add" id="pastoralRecordRepose">
      <summary><span>Memorial care</span><strong>Record a repose</strong></summary>
      <p class="sac-admin-muted">Use this when the person was not already on a pastoral follow-up plan. AGAPAY will close their active directory status and create the selected memorial reminders.</p>
      <div class="pastoral-directory-search">
        <input id="pastoralReposeSearch" placeholder="Search Directory by name" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('pastoralCandidateSearch').value=this.value;searchPastoralFollowUpCandidates();}" />
        <button class="sac-admin-outline-btn" type="button" onclick="searchPastoralReposeCandidates()">Search Directory</button>
      </div>
      <form class="pastoral-add-form" onsubmit="recordStandalonePastoralRepose(event)">
        <div class="sac-admin-form-grid">
          <label><span>Person</span><select name="personId" required><option value="">${pastoralFollowUpState.candidatesLoaded ? 'Choose a person…' : 'Search Directory first…'}</option>${options}</select></label>
          ${pastoralCreatePriestField('Memorial responsibility')}
          <label><span>Date of repose</span><input name="reposedOn" type="date" required onchange="updatePastoralMemorialPreview(this.form)" /></label>
          <label class="pastoral-close-check"><span>Ongoing observance</span><em><input name="annualEnabled" type="checkbox" checked /> Continue annual reminders</em></label>
        </div>
        <fieldset class="pastoral-marker-choices"><legend>Memorial observances</legend>
          ${['third_day', 'ninth_day', 'fortieth_day', 'six_month', 'first_anniversary'].map((type) => `<label><input type="checkbox" name="markerType" value="${type}" checked onchange="updatePastoralMemorialPreview(this.form)" /><span>${escapeHtml(MEMORIAL_MARKER_LABELS[type])}</span><small data-marker-preview="${type}"></small></label>`).join('')}
        </fieldset>
        <label class="sac-admin-wide-field"><span>Brief note</span><input name="closureReason" maxlength="500" placeholder="Optional context for clergy history" /></label>
        <div class="sac-admin-actions"><button class="btn btn-gold btn-sm" type="submit" ${people.length ? '' : 'disabled'}>Record repose and create reminders</button></div>
      </form>
    </details>`;
}

function renderPastoralFollowUps() {
  const state = pastoralFollowUpState;
  if (state.loading || !state.loaded) return renderSacramentsLoadingPanel('Loading pastoral follow-up…');
  if (state.error) return renderSacramentsErrorPanel(state.error, 'loadPastoralFollowUps(true)');
  const rows = state.followups;
  const active = rows.filter((row) => row.status === 'active');
  const today = pastoralToday();
  const weekEnd = pastoralDateFromToday(7);
  const overdue = active.filter((row) => row.nextDueOn < today);
  const dueThisWeek = active.filter((row) => row.nextDueOn >= today && row.nextDueOn <= weekEnd);
  const upcoming = active.filter((row) => row.nextDueOn > weekEnd);
  const closed = rows.filter((row) => row.status === 'closed');
  const memorials = state.memorials;
  const memorialActionable = memorials.filter((marker) => marker.status === 'pending');
  const memorialDue = memorialActionable.filter((marker) => marker.remindOn <= today);
  const memorialUpcoming = memorialActionable.filter((marker) => marker.remindOn > today);
  const memorialScheduled = memorials.filter((marker) => ['scheduled', 'arranged'].includes(marker.status));
  const memorialHistory = memorials.filter((marker) => ['completed', 'skipped'].includes(marker.status));
  return `<section class="pastoral-heading">
      <div><span>Clergy tickler</span><h2>Pastoral follow-up</h2><p>Keep the next contact and memorial observance visible so no one falls through the cracks.</p></div>
      <div class="sac-admin-actions">
        ${state.access?.canCover && !state.access?.dashboardSession ? `<button class="sac-admin-small-btn" type="button" onclick="setPastoralScope('${state.scope === 'all' ? 'mine' : 'all'}')">${state.scope === 'all' ? 'Show my care list' : 'Cover all clergy'}</button>` : ''}
        <button class="sac-admin-small-btn" type="button" onclick="loadPastoralFollowUps(true)">Refresh</button>
      </div>
    </section>
    <div class="pastoral-summary" aria-label="Pastoral follow-up summary">
      <div class="overdue"><strong>${overdue.length}</strong><span>Overdue</span></div>
      <div><strong>${dueThisWeek.length}</strong><span>Due this week</span></div>
      <div class="memorial"><strong>${memorialDue.length}</strong><span>Memorials to arrange</span></div>
      <div><strong>${upcoming.length}</strong><span>Upcoming</span></div>
    </div>
    ${pastoralAddForm()}
    ${pastoralStandaloneReposeForm()}
    ${memorialQueue('Memorial observances', 'Needs scheduling', memorialDue, 'overdue')}
    ${memorialQueue('Scheduled memorials', 'Linked to Requests & Calendar', memorialScheduled)}
    ${pastoralQueue('Overdue', 'Needs attention', overdue, 'overdue')}
    ${pastoralQueue('Due this week', 'Next seven days', dueThisWeek, 'due')}
    ${pastoralQueue('Upcoming', 'Later follow-up', upcoming, 'upcoming')}
    ${memorialQueue('Later memorial observances', 'Preparation window has not opened', memorialUpcoming)}
    ${!active.length && !memorialActionable.length && !memorialScheduled.length ? `<div class="sac-admin-panel sac-admin-empty"><span>All clear</span><h2>No active follow-ups in ${state.scope === 'all' ? 'the clergy coverage list' : 'your care list'}</h2><p>Add someone from Directory when ongoing contact would help.</p></div>` : ''}
    ${closed.length ? `<details class="sac-admin-panel sac-admin-history pastoral-history"><summary><span>History</span><h2>Closed plans <b>${closed.length}</b></h2></summary><div class="pastoral-card-list">${closed.map((row) => `<article class="pastoral-closed-row"><div><strong>${escapeHtml(row.personName)}</strong><span>${escapeHtml(PASTORAL_CLOSURE_LABELS[row.closureOutcome] || row.closureReason || 'Closed')} · ${escapeHtml(formatSacramentDisplayDate(row.closedAt))}</span></div>${row.closureOutcome === 'reposed' ? '<span>Memorial cycle active</span>' : `<button class="sac-admin-text-btn" type="button" onclick="reopenPastoralFollowUp('${escapeAttr(row.id)}')">Reopen</button>`}</article>`).join('')}</div></details>` : ''}
    ${memorialHistory.length ? `<details class="sac-admin-panel sac-admin-history pastoral-history"><summary><span>Memorial history</span><h2>Completed or skipped <b>${memorialHistory.length}</b></h2></summary><div class="pastoral-card-list">${memorialHistory.map((marker) => `<article class="pastoral-closed-row"><div><strong>${escapeHtml(marker.personName)} · ${escapeHtml(marker.markerLabel)}</strong><span>${escapeHtml(marker.status)} · ${escapeHtml(formatSacramentDisplayDate(marker.targetDate))}</span></div></article>`).join('')}</div></details>` : ''}`;
}

function togglePastoralContactForm(id) {
  const form = document.getElementById('pastoral-contact-' + id);
  if (form) form.hidden = !form.hidden;
}

function togglePastoralSettings(id) {
  const form = document.getElementById('pastoral-settings-' + id);
  if (form) form.hidden = !form.hidden;
}

function togglePastoralClosure(id) {
  const form = document.getElementById('pastoral-closure-' + id);
  if (form) form.hidden = !form.hidden;
}

function togglePastoralReposeFields(select) {
  const fields = select.form?.querySelector('[data-repose-fields]');
  if (!fields) return;
  fields.hidden = select.value !== 'reposed';
  const reposeDate = select.form.elements.reposedOn;
  if (reposeDate) reposeDate.required = select.value === 'reposed';
  if (select.value === 'reposed') updatePastoralMemorialPreview(select.form);
}

function updatePastoralMemorialPreview(form) {
  const dates = pastoralMemorialDates(form?.elements?.reposedOn?.value || '');
  form?.querySelectorAll('[data-marker-preview]').forEach((node) => {
    const checkbox = form.querySelector(`input[name="markerType"][value="${node.dataset.markerPreview}"]`);
    node.textContent =
      checkbox?.checked && dates[node.dataset.markerPreview]
        ? formatSacramentDisplayDate(dates[node.dataset.markerPreview])
        : '';
  });
}

function togglePastoralContactClose(input) {
  const next = input.form?.elements?.nextDueOn;
  const outcome = input.form?.elements?.closureOutcome;
  if (!next) return;
  next.disabled = input.checked;
  next.required = !input.checked;
  if (outcome) outcome.disabled = !input.checked;
}

function toggleMemorialSchedule(id) {
  const form = document.getElementById('memorial-schedule-' + id);
  if (form) form.hidden = !form.hidden;
}

async function pastoralMutation(path, method, body, successMessage) {
  const response = await fetch(sacramentsApi('/follow-up' + path), {
    method,
    headers: { ...pastoralAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save pastoral follow-up.');
  pastoralFollowUpState.loaded = false;
  await loadPastoralFollowUps(true);
  setStatus(successMessage, 'success');
  return data;
}

async function createPastoralFollowUp(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const priestKey = form.elements.assignedPriest?.value || pastoralFollowUpState.access?.priest?.email || '';
  const priest =
    sacramentPriests().find((row) => (row.email || row.name) === priestKey) ||
    pastoralFollowUpState.access?.priest ||
    selectedSacramentPriest();
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    await pastoralMutation(
      '',
      'POST',
      {
        personId: form.elements.personId.value,
        assignedPriestName: priest.name,
        assignedPriestEmail: priest.email,
        reason: form.elements.reason.value,
        nextDueOn: form.elements.nextDueOn.value,
        cadenceDays: Number(form.elements.cadenceDays.value),
        note: form.elements.note.value,
      },
      'Pastoral follow-up added.'
    );
    pastoralFollowUpState.candidatesLoaded = false;
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function renderPastoralCareOwner() {
  const root = document.getElementById('sacramentsPriestPicker');
  if (!root) return;
  const access = pastoralFollowUpState.access || {};
  const label = access.priest?.name || access.userName || access.userEmail || 'Parish team';
  root.innerHTML = `<span>${pastoralFollowUpState.scope === 'all' ? 'Coverage' : 'Care list'}</span><div class="sac-admin-priest-tabs"><button type="button" class="active" disabled>${escapeHtml(pastoralFollowUpState.scope === 'all' ? 'All clergy' : label)}</button></div>`;
}

function setPastoralScope(scope) {
  pastoralFollowUpState.scope = scope === 'all' ? 'all' : 'mine';
  pastoralFollowUpState.loaded = false;
  loadPastoralFollowUps(true);
}

async function searchPastoralReposeCandidates() {
  const source = document.getElementById('pastoralReposeSearch');
  const target = document.getElementById('pastoralCandidateSearch');
  if (target) target.value = source?.value || '';
  await searchPastoralFollowUpCandidates();
  const details = document.getElementById('pastoralRecordRepose');
  if (details) details.open = true;
}

async function recordStandalonePastoralRepose(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const priestKey = form.elements.assignedPriest?.value || pastoralFollowUpState.access?.priest?.email || '';
  const priest =
    sacramentPriests().find((row) => (row.email || row.name) === priestKey) ||
    pastoralFollowUpState.access?.priest ||
    selectedSacramentPriest();
  const markerTypes = [...form.querySelectorAll('input[name="markerType"]:checked')].map((input) => input.value);
  if (!markerTypes.length) {
    setStatus('Choose at least one memorial observance.', 'error');
    return;
  }
  const person = pastoralFollowUpState.candidates.find((row) => row.id === form.elements.personId.value);
  const confirmed = window.confirm(
    `Record ${person?.name || 'this person'} as reposed on ${formatSacramentDisplayDate(form.elements.reposedOn.value)}? This will mark the Directory record as reposed and create ${markerTypes.length} memorial reminder${markerTypes.length === 1 ? '' : 's'}.`
  );
  if (!confirmed) return;
  if (button) button.disabled = true;
  try {
    await pastoralMutation(
      '/repose',
      'POST',
      {
        personId: form.elements.personId.value,
        assignedPriestName: priest.name,
        assignedPriestEmail: priest.email,
        reposedOn: form.elements.reposedOn.value,
        markerTypes,
        annualEnabled: Boolean(form.elements.annualEnabled.checked),
        closureReason: form.elements.closureReason.value,
      },
      'Repose recorded and memorial reminders created.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function openPastoralReposeFromDirectory(personId, personName) {
  switchTab('sacraments');
  setSacramentsDashboardTab('follow-up');
  await loadPastoralFollowUps();
  try {
    const response = await fetch(sacramentsApi('/follow-up/candidates?q=' + encodeURIComponent(personName || '')), {
      headers: pastoralAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to open memorial care.');
    pastoralFollowUpState.candidates = data.people || [];
    pastoralFollowUpState.candidatesLoaded = true;
    renderSacramentsPanel();
    const details = document.getElementById('pastoralRecordRepose');
    if (details) details.open = true;
    const select = details?.querySelector('select[name="personId"]');
    if (select && [...select.options].some((option) => option.value === personId)) select.value = personId;
    details?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function savePastoralContact(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const close = Boolean(form.elements.close.checked);
  try {
    await pastoralMutation(
      '/' + encodeURIComponent(id) + '/contacts',
      'POST',
      {
        contactType: form.elements.contactType.value,
        contactedAt: new Date(form.elements.contactedAt.value).toISOString(),
        nextDueOn: close ? '' : form.elements.nextDueOn.value,
        close,
        closureOutcome: close ? form.elements.closureOutcome.value : '',
        summary: form.elements.summary.value,
      },
      close ? 'Contact logged and follow-up closed.' : 'Contact logged and next follow-up scheduled.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function savePastoralSettings(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const priestKey = form.elements.assignedPriest?.value || '';
  const priest = sacramentPriests().find((row) => (row.email || row.name) === priestKey) || null;
  try {
    const assignment = priest ? { assignedPriestName: priest.name, assignedPriestEmail: priest.email } : {};
    await pastoralMutation(
      '/' + encodeURIComponent(id),
      'PATCH',
      {
        ...assignment,
        reason: form.elements.reason.value,
        nextDueOn: form.elements.nextDueOn.value,
        cadenceDays: form.elements.cadenceDays.value ? Number(form.elements.cadenceDays.value) : null,
        note: form.elements.note.value,
      },
      'Pastoral follow-up updated.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function snoozePastoralFollowUp(id) {
  const row = pastoralFollowUpState.followups.find((item) => item.id === id);
  if (!row) return;
  try {
    await pastoralMutation(
      '/' + encodeURIComponent(id),
      'PATCH',
      { nextDueOn: pastoralDateFromToday(7) },
      'Follow-up snoozed for seven days.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function savePastoralClosure(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const outcome = form.elements.closureOutcome.value;
  try {
    if (outcome === 'reposed') {
      const markerTypes = [...form.querySelectorAll('input[name="markerType"]:checked')].map((input) => input.value);
      await pastoralMutation(
        '/' + encodeURIComponent(id) + '/repose',
        'POST',
        {
          reposedOn: form.elements.reposedOn.value,
          markerTypes,
          annualEnabled: Boolean(form.elements.annualEnabled.checked),
          closureReason: form.elements.closureReason.value,
        },
        'Repose recorded and memorial reminders created.'
      );
    } else {
      await pastoralMutation(
        '/' + encodeURIComponent(id),
        'PATCH',
        {
          action: 'close',
          closureOutcome: outcome,
          closureReason: form.elements.closureReason.value,
        },
        'Pastoral follow-up closed.'
      );
    }
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function updateMemorialMarker(id, body, successMessage) {
  try {
    await pastoralMutation('/memorials/' + encodeURIComponent(id), 'PATCH', body, successMessage);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function scheduleMemorialMarker(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await pastoralMutation(
      '/memorials/' + encodeURIComponent(id) + '/schedule',
      'POST',
      {
        scheduledFor: form.elements.scheduledFor.value,
        confirmedTime: form.elements.confirmedTime.value,
        note: form.elements.note.value,
      },
      'Memorial service request created and added to the clergy calendar.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function arrangeMemorialElsewhere(id) {
  const marker = pastoralFollowUpState.memorials.find((item) => item.id === id);
  if (!marker) return;
  const date = window.prompt('What date has the memorial been arranged for?', marker.targetDate);
  if (date === null) return;
  await updateMemorialMarker(id, { status: 'arranged', scheduledFor: date }, 'Memorial marked as arranged.');
}

async function skipMemorialMarker(id) {
  const note = window.prompt('Why is this observance being skipped?', 'Not observed at this parish');
  if (note === null) return;
  await updateMemorialMarker(id, { status: 'skipped', note }, 'Memorial observance skipped.');
}

async function completeMemorialMarker(id) {
  await updateMemorialMarker(id, { status: 'completed' }, 'Memorial observance completed.');
}

async function reopenMemorialMarker(id) {
  await updateMemorialMarker(
    id,
    { status: 'pending', scheduledFor: '' },
    'Memorial observance returned to the scheduling queue.'
  );
}

function openMemorialRequest() {
  setSacramentsDashboardTab('requests');
  setStatus('Requests opened. The memorial service is linked to its observance tickler.', 'success');
}

async function reopenPastoralFollowUp(id) {
  try {
    await pastoralMutation(
      '/' + encodeURIComponent(id),
      'PATCH',
      { nextDueOn: pastoralToday() },
      'Pastoral follow-up reopened for today.'
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function openPastoralSchedule() {
  setSacramentsDashboardTab('calendar');
  setStatus(
    'Calendar opened for the selected priest. Schedule the Home Visit through the existing request workflow.',
    'success'
  );
}

window.SacramentPastoralFollowUp = {
  load: loadPastoralFollowUps,
  render: renderPastoralFollowUps,
  reset() {
    pastoralFollowUpState = {
      parishId: '',
      loaded: false,
      loading: false,
      error: '',
      followups: [],
      memorials: [],
      candidates: [],
      candidatesLoaded: false,
      scope: 'all',
      access: null,
    };
  },
};

function installSacramentPastoralFollowUp() {
  const renderSacramentsPanelWithoutPastoralFollowUp = window.renderSacramentsPanel;
  const setSacramentsDashboardTabWithoutPastoralFollowUp = window.setSacramentsDashboardTab;
  if (!renderSacramentsPanelWithoutPastoralFollowUp || !setSacramentsDashboardTabWithoutPastoralFollowUp) return;
  window.renderSacramentsPanel = function renderSacramentsPanelWithPastoralFollowUp() {
    if (sacramentsDashboardTab !== 'follow-up') return renderSacramentsPanelWithoutPastoralFollowUp();
    const pane = document.getElementById('sacramentsPane');
    if (!pane) return;
    document.querySelectorAll('[data-sac-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.sacTab === 'follow-up');
    });
    renderPastoralCareOwner();
    pane.innerHTML = renderPastoralFollowUps();
  };
  window.setSacramentsDashboardTab = function setSacramentsDashboardTabWithPastoralFollowUp(tab) {
    if (tab !== 'follow-up') {
      const result = setSacramentsDashboardTabWithoutPastoralFollowUp(tab);
      renderSacramentsPriestPicker();
      return result;
    }
    sacramentsDashboardTab = 'follow-up';
    loadPastoralFollowUps();
    window.renderSacramentsPanel();
  };
}

document.addEventListener('DOMContentLoaded', installSacramentPastoralFollowUp, { once: true });
