import type { ParishSacRequest, ParishSacRule, ParishSacCalendarItem } from './sacrament-feature-contracts.js';
import type { ParishSacBindings } from './features/sacraments.js';
declare const sacramentPriests: ParishSacBindings['sacramentPriests'];
declare let sacramentsPriestIndex: ParishSacBindings['sacramentsPriestIndex'];
declare const selectedSacramentPriest: ParishSacBindings['selectedSacramentPriest'];
declare const sacramentsGoogleState: ParishSacBindings['sacramentsGoogleState'];
declare const selectedSacramentsGoogleConnection: ParishSacBindings['selectedSacramentsGoogleConnection'];
declare const sacramentsAvailabilityState: ParishSacBindings['sacramentsAvailabilityState'];
declare const groupSacramentsRulesByType: ParishSacBindings['groupSacramentsRulesByType'];
declare const selectedSchedulableSacramentTypes: ParishSacBindings['selectedSchedulableSacramentTypes'];
declare const SAC_TIMEZONE_OPTIONS: ParishSacBindings['SAC_TIMEZONE_OPTIONS'];
declare const selectedSacramentServiceTypes: ParishSacBindings['selectedSacramentServiceTypes'];
declare const SAC_EDITABLE_SERVICE_TYPES: ParishSacBindings['SAC_EDITABLE_SERVICE_TYPES'];
declare const sacramentTypeLabel: ParishSacBindings['sacramentTypeLabel'];
declare const SAC_SCHEDULABLE_TYPES: ParishSacBindings['SAC_SCHEDULABLE_TYPES'];
declare const selectedSacramentOfferingLabel: ParishSacBindings['selectedSacramentOfferingLabel'];
declare const SAC_DAY_LABELS: ParishSacBindings['SAC_DAY_LABELS'];
declare const SACRAMENT_OVERDUE_HOURS: ParishSacBindings['SACRAMENT_OVERDUE_HOURS'];
declare const sacramentsApi: ParishSacBindings['sacramentsApi'];
declare const SACRAMENT_STATUS_OPTIONS: ParishSacBindings['SACRAMENT_STATUS_OPTIONS'];
declare const SACRAMENT_STATUS_LABELS: ParishSacBindings['SACRAMENT_STATUS_LABELS'];
declare const sacramentsRuleEditor: ParishSacBindings['sacramentsRuleEditor'];
declare const sacramentsState: ParishSacBindings['sacramentsState'];

function renderSacramentsPriestPicker() {
  const root = document.getElementById('sacramentsPriestPicker');
  if (!root) return;
  const priests = sacramentPriests();
  if (sacramentsPriestIndex >= priests.length) sacramentsPriestIndex = 0;
  root.innerHTML = `<span>Priest</span><div class="sac-admin-priest-tabs">
      ${priests.map((priest, index) => `<button type="button" class="${index === sacramentsPriestIndex ? 'active' : ''}" onclick="selectSacramentsPriest(${index})">${escapeHtml(priest.name)}</button>`).join('')}
    </div>`;
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
          ? `Scheduled requests assigned to ${escapeHtml(priest.name)} automatically create or update events in <strong>${escapeHtml(connection!.calendarName || 'AGAPAY Sacraments')}</strong>.${lastSync ? ` Last synced ${escapeHtml(lastSync)}.` : ''}`
          : !priest.email
            ? 'Add this priest’s email in Settings before connecting a calendar.'
            : !state.configured
              ? 'Google Calendar credentials have not been configured for this AGAPAY environment.'
              : `Connect ${escapeHtml(priest.email)}. AGAPAY will create a dedicated Sacraments calendar and keep assigned, scheduled requests synchronized.`
      }</p>
      ${connection?.lastError ? `<div class="notice error">Last sync issue: ${escapeHtml(connection.lastError)}</div>` : ''}
    </section>`;
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

function renderSacramentsAvailabilityType(type: string, rules: ParishSacRule[]) {
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

function renderSacramentsLoadingPanel(message: string) {
  return `<div class="sac-admin-panel sac-admin-empty"><span>Loading</span><h2>${escapeHtml(message)}</h2><p>Fetching the latest parish scheduling settings.</p></div>`;
}

function renderSacramentsErrorPanel(message: string, retryAction: string) {
  return `<div class="sac-admin-panel sac-admin-empty">
      <span>Scheduling</span>
      <h2>Could not load this section</h2>
      <p>${escapeHtml(message)}</p>
      <div class="sac-admin-actions" style="justify-content:center;"><button class="sac-admin-outline-btn" type="button" onclick="${retryAction}">Retry</button></div>
    </div>`;
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

function daysWaiting(createdAt: string | undefined) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function isOverdue(row: ParishSacRequest) {
  if (row.status !== 'requested' || !row.createdAt) return false;
  return Date.now() - new Date(row.createdAt).getTime() > SACRAMENT_OVERDUE_HOURS * 3600000;
}

function isThisWeek(row: ParishSacRequest) {
  if (row.status !== 'scheduled' || !row.confirmedDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAhead = new Date(today.getTime() + 7 * 86400000);
  const confirmed = new Date(row.confirmedDate + 'T00:00:00');
  return confirmed >= today && confirmed <= weekAhead;
}

function renderParishPreparationPlan(row: ParishSacRequest) {
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
        ${(item.documents || []).length ? `<div class="sac-prep-document-list">${item.documents!.map((doc) => `<div><a href="${sacramentsApi('/' + encodeURIComponent(row.id) + '/preparation/documents/' + encodeURIComponent(doc.id))}" target="_blank" rel="noopener">${escapeHtml(doc.displayName)}</a><span>${escapeHtml(doc.reviewStatus)}</span><button type="button" onclick="reviewSacramentPreparationDocument('${row.id}','${doc.id}','accepted')">Accept</button><button type="button" onclick="reviewSacramentPreparationDocument('${row.id}','${doc.id}','rejected')">Needs attention</button></div>`).join('')}</div>` : ''}
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

function sacramentParishRow(row: ParishSacRequest, opts: { showAge?: boolean } = {}) {
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

function renderSacramentRuleDayEditor(type: string, dayOfWeek: number, rules: ParishSacRule[]) {
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

function formatSacramentDisplayDate(value: string | undefined) {
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
  const byDay: Record<number, ParishSacCalendarItem[]> = {};
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
  const selected = Number(
    (
      document.getElementById('sacramentsCalendarSelectedDay') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    )?.value || firstBookedDay
  );
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
export type ParishSacPresentation = {
  renderSacramentsPriestPicker: typeof renderSacramentsPriestPicker;
  renderSacramentsGoogleCalendarCard: typeof renderSacramentsGoogleCalendarCard;
  renderSacramentsFeatureToggle: typeof renderSacramentsFeatureToggle;
  renderSacramentsDisabledPanel: typeof renderSacramentsDisabledPanel;
  renderSacramentsAvailability: typeof renderSacramentsAvailability;
  renderSacramentsTimezoneForm: typeof renderSacramentsTimezoneForm;
  renderSacramentsOfferingsEditor: typeof renderSacramentsOfferingsEditor;
  renderSacramentsAvailabilityType: typeof renderSacramentsAvailabilityType;
  renderSacramentsAvailabilityAddForm: typeof renderSacramentsAvailabilityAddForm;
  renderSacramentsBlackouts: typeof renderSacramentsBlackouts;
  renderSacramentsLoadingPanel: typeof renderSacramentsLoadingPanel;
  renderSacramentsErrorPanel: typeof renderSacramentsErrorPanel;
  renderSacramentsUpsell: typeof renderSacramentsUpsell;
  daysWaiting: typeof daysWaiting;
  isOverdue: typeof isOverdue;
  isThisWeek: typeof isThisWeek;
  renderParishPreparationPlan: typeof renderParishPreparationPlan;
  sacramentParishRow: typeof sacramentParishRow;
  renderSacramentsRules: typeof renderSacramentsRules;
  renderSacramentRuleDayEditor: typeof renderSacramentRuleDayEditor;
  formatSacramentDisplayDate: typeof formatSacramentDisplayDate;
  renderSacramentsCalendar: typeof renderSacramentsCalendar;
};
