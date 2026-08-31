'use strict';

/* global stewardshipState, escapeHtml, escapeAttr, parishSessionStorageKey, currentParish, setStatus,
  stewardshipApi, authHeaders, statusLabel, loadStewardshipPanel */
/* exported renderParishPlusMeetingsPane, newStewardshipMeeting, editStewardshipMeeting,
  closeStewardshipEditor, addStewardshipRow, removeStewardshipRow, saveStewardshipMeeting */

// Annual-meeting packet listing, drafts, repeaters, saves, and preview links.
// Read shared parish identity and authentication only when actions run.

function renderParishPlusMeetingsPane(meetingsPane, active) {
  if (!meetingsPane) return;
  const meetings = stewardshipState.meetings || [];
  const year = new Date().getFullYear();
  const stateChip = document.getElementById('parishPlusPacketsState');

  if (active) {
    // State chip reflects the current-year packet's status, or a prompt to start
    if (stateChip) {
      const thisYear = meetings.find((m) => Number(m.fiscalYear) === year);
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

  if (stateChip) {
    stateChip.textContent = 'Parish tier';
    stateChip.className = 'pdx-pp-card-state locked';
  }
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
  const statusLabels = { draft: 'Draft', ready: 'Ready', generated: 'Generated', archived: 'Archived' };
  const statusClasses = {
    draft: 'pdx-pp-pill-draft',
    ready: 'pdx-pp-pill-ready',
    generated: 'pdx-pp-pill-generated',
    archived: 'pdx-pp-pill-archived',
  };
  return (
    '<div class="pdx-pp-meetings">' +
    meetings
      .map((m) => {
        const statusKey = (m.status || 'draft').toLowerCase();
        const label = statusLabels[statusKey] || statusKey;
        const cls = statusClasses[statusKey] || 'pdx-pp-pill-draft';
        const dateStr = m.meetingDate
          ? new Date(m.meetingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '';
        const metaParts = [m.fiscalYear, dateStr, m.location ? escapeHtml(m.location) : ''].filter(Boolean).join(' · ');
        return (
          '<div class="pdx-pp-meeting-row">' +
          '<div class="pdx-pp-meeting-info">' +
          '<strong class="pdx-pp-meeting-title">' +
          escapeHtml(m.title || m.fiscalYear + ' Annual Meeting') +
          '</strong>' +
          '<span class="pdx-pp-meeting-meta">' +
          metaParts +
          '</span>' +
          '</div>' +
          '<div class="pdx-pp-meeting-actions">' +
          '<span class="pdx-pp-pill ' +
          cls +
          '">' +
          label +
          '</span>' +
          '<button class="pdx-pp-mini-btn" type="button" onclick="editStewardshipMeeting(\'' +
          escapeAttr(m.id) +
          '\')">Edit</button>' +
          '<a class="pdx-pp-mini-btn" href="' +
          escapeAttr(stewardshipPreviewUrl(m.id)) +
          '" target="_blank" rel="noopener">Preview</a>' +
          '<a class="pdx-pp-mini-btn" href="' +
          escapeAttr(stewardshipPreviewUrl(m.id, 'pdf')) +
          '" target="_blank" rel="noopener">PDF</a>' +
          '</div>' +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function renderMeetingsEmpty(year) {
  return (
    '<div class="sw-meetings-empty">' +
    '<div class="sw-meetings-empty-icon" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' +
    '</svg>' +
    '</div>' +
    '<strong>No packets yet</strong>' +
    '<span>Create your first ' +
    year +
    ' Annual Parish Meeting packet.</span>' +
    '<button class="sw-new-packet-btn" type="button" onclick="newStewardshipMeeting()">Create ' +
    year +
    ' packet</button>' +
    '</div>'
  );
}

function stewardshipPreviewUrl(meetingId, suffix = 'preview') {
  const token =
    document.getElementById('parishToken')?.value.trim() || sessionStorage.getItem(parishSessionStorageKey) || '';
  const url = new URL(
    '/parish/stewardship/annual-meetings/' + encodeURIComponent(meetingId) + '/' + suffix,
    window.location.origin
  );
  url.searchParams.set('parishId', currentParish?.parishId || '');
  url.searchParams.set('t', token);
  return url.pathname + url.search;
}

// Builds a single-line mailing address from the parish's Settings tab
// fields, mirroring registrationAddressLine() server-side.
function parishAddressLine(parish) {
  if (!parish) return '';
  return [
    parish.addressLine1,
    parish.addressLine2,
    [parish.city, parish.state, parish.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
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
    agendaItems: [
      { title: 'Opening prayer', durationMinutes: 5 },
      { title: 'Reports', durationMinutes: 30 },
      { title: 'Financial review', durationMinutes: 20 },
    ],
    reports: [
      { reportType: 'priest', title: 'Rector Report', body: '', createdBy: '' },
      { reportType: 'treasurer', title: 'Treasurer Report', body: '', createdBy: '' },
      { reportType: 'brotherhood', title: 'Brotherhood Report', body: '', createdBy: '' },
      { reportType: 'sisterhood', title: 'Sisterhood Report', body: '', createdBy: '' },
    ],
    financialSummary: { totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0, notes: '' },
    restrictedFunds: [],
    nominees: [],
    resolutions: [],
  };
}

function newStewardshipMeeting() {
  if (!currentParish) {
    setStatus('Load a parish first.', 'error');
    return;
  }
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

function stewardshipMeetingReports(items = []) {
  const reports = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  [
    { reportType: 'brotherhood', title: 'Brotherhood Report', body: '', createdBy: '' },
    { reportType: 'sisterhood', title: 'Sisterhood Report', body: '', createdBy: '' },
  ].forEach((required) => {
    if (!reports.some((report) => report.reportType === required.reportType)) reports.push(required);
  });
  return reports;
}

function stewardshipRepeaterRows(type, items) {
  const rows = items && items.length ? items : [{}];
  return rows
    .map((item) => {
      if (type === 'agenda')
        return `<div class="stewardship-repeat-row" data-row-type="agenda">
        <label class="stewardship-row-field"><span>Agenda item</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="e.g. Treasurer's report" /></label>
        <label class="stewardship-row-field"><span>Time allotted</span><input type="number" min="0" data-field="durationMinutes" value="${escapeAttr(item.durationMinutes)}" placeholder="Minutes" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'report')
        return `<div class="stewardship-repeat-row" data-row-type="report">
        <label class="stewardship-row-field"><span>Report type</span><select data-field="reportType">
          ${['priest', 'warden', 'treasurer', 'stewardship', 'brotherhood', 'sisterhood', 'ministry', 'custom'].map((t) => `<option value="${t}" ${item.reportType === t ? 'selected' : ''}>${statusLabel(t)}</option>`).join('')}
        </select></label>
        <label class="stewardship-row-field"><span>Report title</span><input type="text" data-field="title" value="${escapeAttr(item.title)}" placeholder="Title shown in packet" /></label>
        <label class="stewardship-row-field stewardship-row-field--wide"><span>Report content</span><textarea data-field="body" rows="5" placeholder="Write or paste the report here">${escapeHtml(item.body)}</textarea></label>
        <label class="stewardship-row-field"><span>Leader / presenter <small>Optional</small></span><input type="text" data-field="createdBy" value="${escapeAttr(item.createdBy)}" placeholder="Name of the report leader or presenter" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'fund')
        return `<div class="stewardship-repeat-row" data-row-type="fund">
        <label class="stewardship-row-field"><span>Fund name</span><input type="text" data-field="fundName" value="${escapeAttr(item.fundName)}" placeholder="Restricted fund" /></label>
        <label class="stewardship-row-field"><span>Beginning balance</span><input type="number" step="0.01" data-field="beginningBalance" value="${Number(item.beginningBalanceCents || 0) / 100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Received</span><input type="number" step="0.01" data-field="totalReceived" value="${Number(item.totalReceivedCents || 0) / 100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Disbursed</span><input type="number" step="0.01" data-field="totalDisbursed" value="${Number(item.totalDisbursedCents || 0) / 100 || ''}" placeholder="$0.00" /></label>
        <label class="stewardship-row-field"><span>Ending balance</span><input type="number" step="0.01" data-field="endingBalance" value="${Number(item.endingBalanceCents || 0) / 100 || ''}" placeholder="$0.00" /></label>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeStewardshipRow(this)">Remove</button>
      </div>`;
      if (type === 'nominee')
        return `<div class="stewardship-repeat-row" data-row-type="nominee">
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
    })
    .join('');
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
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addStewardshipRow(type) {
  const target = document.getElementById(
    {
      agenda: 'stewardshipAgendaRows',
      report: 'stewardshipReportRows',
      fund: 'stewardshipFundRows',
      nominee: 'stewardshipNomineeRows',
      resolution: 'stewardshipResolutionRows',
    }[type]
  );
  if (!target) return;
  target.insertAdjacentHTML('beforeend', stewardshipRepeaterRows(type, [{}]));
}

function removeStewardshipRow(btn) {
  const row = btn?.closest('.stewardship-repeat-row');
  const parent = row?.parentElement;
  if (!row || !parent) return;
  if (parent.querySelectorAll('.stewardship-repeat-row').length <= 1) {
    row.querySelectorAll('input, textarea').forEach((input) => (input.value = ''));
    return;
  }
  row.remove();
}

function readStewardshipRows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return [...container.querySelectorAll('.stewardship-repeat-row')]
    .map((row) => {
      const item = {};
      row.querySelectorAll('[data-field]').forEach((input) => {
        item[input.dataset.field] = input.value.trim();
      });
      return item;
    })
    .filter((item) => Object.values(item).some(Boolean));
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
      notes: fd.get('financialNotes'),
    },
    restrictedFunds: readStewardshipRows('stewardshipFundRows'),
    nominees: readStewardshipRows('stewardshipNomineeRows'),
    resolutions: readStewardshipRows('stewardshipResolutionRows'),
  };
  const method = meeting.id ? 'PATCH' : 'POST';
  const path = meeting.id ? '/meetings/' + encodeURIComponent(meeting.id) : '/meetings';
  try {
    const res = await fetch(stewardshipApi(path), {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        (data.error || 'Unable to save packet.') + ' [' + method + ' ' + path + ', HTTP ' + res.status + ']'
      );
    stewardshipState.selectedMeeting = data.meeting;
    stewardshipState.loaded = false;
    setStatus('Stewardship packet saved.', 'success');
    await loadStewardshipPanel(true);
    stewardshipState.selectedMeeting = data.meeting;
    renderStewardshipEditor();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}
