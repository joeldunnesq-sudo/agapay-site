'use strict';

// Parish dashboard Directory feature.
// Loaded before app.js so existing inline dashboard actions keep their global names.

function directoryAdminApi(path = '') {
  if (!currentParish?.parishId) return '';
  return '/api/parish/dashboard/' + encodeURIComponent(currentParish.parishId) + '/directory/admin' + path;
}

function openDirectoryImport() {
  window.DirectoryImport.open({
    api: directoryAdminApi,
    headers: authHeaders,
    onChange: () => loadDirectoryAdminTab(true),
  });
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
    const [settingsRes, dashboardRes, queueRes, peopleRes, householdsRes, skillsRes, maintenanceRes, printRes] =
      await Promise.all([
        fetch(directoryAdminApi('/settings'), { headers }),
        fetch(directoryAdminApi('/dashboard'), { headers }),
        fetch(directoryAdminApi('/queue'), { headers }),
        fetch(directoryAdminApi('/people?limit=8'), { headers }),
        fetch(directoryAdminApi('/households?limit=100'), { headers }),
        fetch(directoryAdminApi('/skills/listings?limit=8'), { headers }),
        fetch(directoryAdminApi('/maintenance'), { headers }),
        fetch(directoryAdminApi('/print/directory'), { headers }),
      ]);
    if (dashboardRes.status === 401 || dashboardRes.status === 403) {
      const errorPayload = await dashboardRes.json().catch(() => ({}));
      pane.dataset.loaded = 'true';
      pane.innerHTML = renderDirectoryAdminAccessError(
        dashboardRes.status,
        errorPayload.message || errorPayload.error || ''
      );
      return;
    }
    const settings = await settingsRes.json().catch(() => ({ settings: {} }));
    const dashboard = await dashboardRes.json();
    const queue = await queueRes.json().catch(() => ({ items: [] }));
    const people = await peopleRes.json();
    const households = await householdsRes.json();
    const skills = await skillsRes.json().catch(() => ({ skills: { listings: [] } }));
    const maintenance = await maintenanceRes.json().catch(() => ({ maintenance: {} }));
    const print = await printRes.json().catch(() => ({ print: {} }));
    renderDirectoryAdminPanel(
      dashboard.dashboard || {},
      queue.items || [],
      people.people || [],
      households.households || [],
      skills.skills || {},
      maintenance.maintenance || {},
      print.print || {},
      settings.settings || {}
    );
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
  pane
    .querySelectorAll('[data-dir-tab]')
    .forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.dirTab === tab)));
  pane.querySelectorAll('[data-dir-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.dirPanel !== tab;
  });
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
  const sortedRecords = [...records].sort((a, b) =>
    directoryHouseholdSortKey(a.displayName).localeCompare(directoryHouseholdSortKey(b.displayName))
  );
  list.innerHTML = sortedRecords.length
    ? sortedRecords
        .map((record) =>
          directoryCanonicalHouseholdRow(
            record,
            directoryLastData?.print?.households || [],
            directoryLastData?.skills?.listings || []
          )
        )
        .join('')
    : `<tr><td colspan="4">${directoryEmptyState('No matches', 'No households match your search.')}</td></tr>`;
  hydrateDirectoryAdminImages(list);
}

function switchDirectoryBrowseType(type) {
  directoryBrowseType = type;
  const pane = document.getElementById('directoryAdminPane');
  pane
    ?.querySelectorAll('[data-browse-type]')
    .forEach((btn) => btn.classList.toggle('active', btn.dataset.browseType === type));
  const input = document.getElementById('directoryBrowseSearch');
  if (input) input.placeholder = type === 'household' ? 'Search by family name' : 'Search by person name';
  renderDirectoryBrowseList(
    type === 'household' ? directoryLastData?.households || [] : directoryLastData?.people || []
  );
}

let directoryBrowseSearchTimer = null;
function searchDirectoryBrowse(value) {
  clearTimeout(directoryBrowseSearchTimer);
  directoryBrowseSearchTimer = setTimeout(() => runDirectoryBrowseSearch(String(value || '').trim()), 250);
}
async function runDirectoryBrowseSearch(query) {
  const list = document.getElementById('directoryBrowseList');
  if (!list) return;
  if (!query) {
    renderDirectoryBrowseList(
      directoryBrowseType === 'household' ? directoryLastData?.households || [] : directoryLastData?.people || []
    );
    return;
  }
  list.innerHTML = '<p class="sw-tool-loading">Searching…</p>';
  try {
    const res = await fetch(directoryAdminApi('/households?limit=100&q=' + encodeURIComponent(query)), {
      headers: authHeaders(),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Search failed.');
    renderDirectoryBrowseList(payload.households || []);
  } catch (err) {
    list.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to search.')}</p>`;
  }
}

function renderDirectoryAdminPanel(dashboard, queue, people, households, skills, maintenance, print, settings = {}) {
  const pane = document.getElementById('directoryAdminPane');
  if (!pane) return;
  const sortedHouseholds = [...households].sort((a, b) =>
    directoryHouseholdSortKey(a.displayName).localeCompare(directoryHouseholdSortKey(b.displayName))
  );
  const managementQueue = queue.map((item) => ({ ...item, queueKind: 'submission' }));
  directoryLastData = {
    dashboard,
    queue: managementQueue,
    people,
    households: sortedHouseholds,
    skills,
    maintenance,
    print,
    settings,
  };
  const parishName = currentParish?.parishName || currentParish?.name || 'Your parish';
  const publishedMembers = Array.isArray(print?.households) ? print.households : [];
  const publishedMemberCount = publishedMembers.length || people.length;
  const skillOptions = [
    ...new Set((skills.listings || []).map((item) => item.displayLabel || item.skill?.name).filter(Boolean)),
  ].sort();
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  pane.innerHTML = `
      <div class="pdx-dir-print-sheet">
      <section class="pdx-dir-canonical-head sw-suite-hero">
        <div class="sw-suite-hero-copy">
          <span class="pdx-dir-canonical-kicker sw-suite-eyebrow">Parish member records</span>
          <h1 class="sw-suite-heading">Parish Directory</h1>
          <p class="sw-suite-subhead">Find families, member contact information, namedays, and ways parishioners can help. <strong>${households.length}</strong> households <i></i> <strong>${publishedMemberCount}</strong> members</p>
        </div>
        <div class="pdx-dir-canonical-actions sw-suite-hero-status agapay-feature-actions">
          <button class="pdx-dir-export-btn" type="button" onclick="openDirectoryImport()">Import directory</button>
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
          <span><strong>Directory Management</strong><small>${managementQueue.length} submission${managementQueue.length === 1 ? '' : 's'} awaiting review</small></span>
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
        <div id="directoryRecordDetail" class="pdx-dir-review-detail pdx-dir-inline-detail" aria-live="polite"></div>
        <p class="pdx-dir-canonical-note"><strong>Where do these records come from?</strong> Families enter and maintain their information in My AGAPAY, or parish staff import existing contacts. Imported contacts remain private until the normal sharing and approval steps are complete. Parish staff can review information without changing a family’s privacy choices.</p>
      </div>

      <div class="pdx-dir-tab-panel" data-dir-panel="tools" hidden>
        <section class="pdx-dir-management-intro">
          <span>Directory Management</span>
          <h2>Review completed directory submissions</h2>
          <p>A parishioner appears here only after creating a My AGAPAY account, choosing this parish, completing directory information, and submitting it for review. Guest donors and unfinished profiles do not create parish follow-up.</p>
        </section>
        ${directoryHealthOverview(dashboard.metrics || {}, maintenance, managementQueue.length)}
        <section class="pdx-panel pdx-dir-review-queue-panel">
          <div class="pdx-panel-header">
            <div class="pdx-panel-title"><div class="pdx-panel-title-icon"><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>Submission Review Queue</div>
            <button class="pdx-link-btn" type="button" onclick="loadDirectoryAdminTab(true)">Refresh</button>
          </div>
          <div class="pdx-dir-review-queue" id="directoryReviewQueue">${directoryReviewQueueRows(managementQueue)}</div>
        </section>
        <div id="directoryManagementDetail" class="pdx-dir-review-detail pdx-dir-queue-detail" aria-live="polite"></div>
        <details class="pdx-dir-utilities">
          <summary><span><strong>Skills and exports</strong><small>Open these less-frequent management tools</small></span><b>Show tools</b></summary>
          <div class="pdx-dir-utilities-body">
            <div class="pdx-dir-row-list">${directorySkillsAdminRows(skills.listings || [])}</div>
            <div class="pdx-dir-actions">
              <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/skills.csv')">Skills CSV</button>
              <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/published-adults.csv')">Published Adults CSV</button>
              <button class="pdx-dir-action-btn" type="button" onclick="previewDirectoryAdminPrint('/print/skills')">Print Skills</button>
              <button class="pdx-dir-action-btn" type="button" onclick="downloadDirectoryAdminExport('/exports/directory.pdf')">Directory PDF</button>
            </div>
          </div>
        </details>
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
      body: JSON.stringify({ directoryEnabled: enabled, ordinaryMemberAccessEnabled: enabled }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Unable to update the parish directory.');
    const saved = payload.settings || {};
    currentParish.directoryEnabled = Boolean(saved.directoryEnabled && saved.ordinaryMemberAccessEnabled);
    syncModuleStatusNavigation('directory', moduleIncluded('directory'), currentParish.directoryEnabled);
    setStatus(
      currentParish.directoryEnabled
        ? 'Parish Directory is on for parishioners.'
        : 'Parish Directory is off for parishioners.',
      'success'
    );
    await loadDirectoryAdminTab(true);
  } catch (error) {
    currentParish.directoryEnabled = previous;
    if (input) input.checked = previous;
    setStatus(error.message, 'error');
  } finally {
    if (input) input.disabled = false;
  }
}

function directoryHouseholdLastName(name) {
  const normalized = String(name || '')
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+(family|household)$/i, '');
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
  const memberRows = publishedMembers.filter(
    (row) =>
      String(row.household_id || row.householdId || '') === String(household.id || '') ||
      String(row.display_name || row.displayName || '') === String(name)
  );
  const uniqueMembers = [
    ...new Map(
      memberRows.map((row) => [row.person_id || row.personId || row.preferred_name || row.preferredName, row])
    ).values(),
  ];
  const count = Number(household.memberCount || uniqueMembers.length || 0);
  const householdSkills = skillListings
    .filter((item) => {
      const householdName =
        item.household?.displayName || item.person?.householdDisplayName || item.householdDisplayName || '';
      return String(householdName) === String(name);
    })
    .map((item) => item.displayLabel || item.skill?.name)
    .filter(Boolean);
  const staffContact = household.staffContact || {};
  const address = staffContact.address || {};
  const city = [address.city, address.region].filter(Boolean).join(', ');
  const email = staffContact.email?.value || '';
  const phone = staffContact.phone?.value || '';
  const fullAddress = [
    address.line1,
    address.line2,
    [address.city, address.region, address.postalCode].filter(Boolean).join(' '),
    address.country && address.country !== 'US' ? address.country : '',
  ]
    .filter(Boolean)
    .join(', ');
  const initials = directoryHouseholdInitials(name);
  const memberMarkup = uniqueMembers.length
    ? uniqueMembers
        .slice(0, 5)
        .map((member) => {
          const feast = String(member.feast_month_day || member.feastMonthDay || '');
          let nameday = '';
          if (/^\d{2}-\d{2}$/.test(feast)) {
            const [month, day] = feast.split('-').map(Number);
            nameday = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
              new Date(Date.UTC(2024, month - 1, day))
            );
          }
          const saint = member.saint_name || member.saintName || '';
          return `<div>${escapeHtml(member.preferred_name || member.preferredName || '')}${nameday || saint ? ` <span>— ${escapeHtml([nameday, saint].filter(Boolean).join(' – '))}</span>` : ''}</div>`;
        })
        .join('')
    : `<div>${count ? count + ' family member' + (count === 1 ? '' : 's') : 'No published members'}</div>`;
  const contactField = (label, value, visibility, addressField = false) => {
    const shared = visibility === 'directory_members';
    const sharingLabel = shared
      ? addressField
        ? 'City and state are visible to parishioners; street address remains private'
        : 'Visible to parishioners in My AGAPAY'
      : 'Private from parishioners';
    return `<div class="pdx-dir-contact-field ${value ? '' : 'is-empty'} ${shared ? 'is-shared' : 'is-private'}" title="${escapeAttr(sharingLabel)}">
      <span class="pdx-dir-contact-eye" role="img" aria-label="${escapeAttr(sharingLabel)}">${
        shared
          ? '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.1 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
      }</span>
      <small>${escapeHtml(label)}</small><span>${escapeHtml(value || 'Not entered')}</span>
    </div>`;
  };
  const namedaySearch = memberRows
    .map((row) => {
      const feast = String(row.feast_month_day || '');
      if (!/^\d{2}-\d{2}$/.test(feast)) return '';
      return new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2024, Number(feast.slice(0, 2)) - 1, 1))
      );
    })
    .join(' ');
  return `<tr class="pdx-dir-table-row" data-namedays="${escapeAttr(namedaySearch)}" data-skills="${escapeAttr(householdSkills.join(' '))}">
      <td><div class="pdx-dir-table-household"><span class="pdx-dir-table-avatar">${escapeHtml(initials)}</span><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(city || `${count} member${count === 1 ? '' : 's'}`)}</span><button class="pdx-dir-table-manage" type="button" onclick="openDirectoryHousehold('${escapeAttr(household.id)}')">Manage accounts</button></div></div></td>
      <td><div class="pdx-dir-table-members">${memberMarkup}</div></td>
      <td><div class="pdx-dir-table-contacts">${contactField('Email', email, staffContact.email?.visibility)}${contactField('Phone', phone, staffContact.phone?.visibility)}${contactField('Address', fullAddress || city, address.visibility, true)}</div></td>
      <td><div class="pdx-dir-table-skills">${
        householdSkills.length
          ? householdSkills
              .slice(0, 3)
              .map((skill) => `<span>${escapeHtml(skill)}</span>`)
              .join('')
          : '<small>No published skills</small>'
      }</div></td>
    </tr>`;
}

function filterCanonicalDirectoryRows() {
  const month = document.getElementById('directoryNamedayFilter')?.value || '';
  const skill = document.getElementById('directorySkillFilter')?.value || '';
  document.querySelectorAll('#directoryBrowseList .pdx-dir-table-row').forEach((row) => {
    row.hidden = Boolean(
      (month && !row.dataset.namedays.includes(month)) || (skill && !row.dataset.skills.includes(skill))
    );
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
  await Promise.all(
    images.map(async (img) => {
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
    })
  );
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
  const status =
    photo.lifecycleStatus === 'approved'
      ? 'Approved'
      : photo.lifecycleStatus === 'pending_approval'
        ? 'Waiting on review'
        : 'Uploaded, not submitted';
  return `<section class="pdx-dir-review-column"><h4>Family photo</h4><div class="pdx-dir-photo-card">
      ${directoryAdminPhotoImg(photo, 'pdx-dir-photo-preview', 'Uploaded family photo')}
      <div><strong>${escapeHtml(status)}</strong><p>${escapeHtml((photo.visibility || 'private').replace(/_/g, ' '))} · ${escapeHtml(photo.processingStatus || 'processing status unavailable')}. This is the photo the family uploaded from My AGAPAY.</p></div>
    </div></section>`;
}

function directorySubmittedPhotoReview(photo) {
  if (!photo)
    return `<section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Submitted photo</h4>${directoryEmptyState('Photo unavailable', 'The submitted media record could not be loaded. Return this item rather than approving it without seeing the photo.')}</section>`;
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

function directoryAccessStatusRow(label, value, description, tone = 'neutral') {
  return `<div class="pdx-dir-status-row is-${escapeAttr(tone)}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(description)}</span></div><em>${escapeHtml(value)}</em></div>`;
}

function directoryHouseholdSummaryCard(label, value, description, tone = 'neutral') {
  return `<div class="pdx-dir-household-summary-card is-${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(description)}</small></div>`;
}

async function removeDirectoryPersonFromParish(personId, displayName, expectedVersion, householdId = '') {
  const name = displayName || 'this person';
  if (
    !confirm(
      `Remove ${name} from this parish?\n\nThis immediately hides them from the parishioner directory and blocks Koinonia. Their My AGAPAY account and giving history will not be deleted.`
    )
  )
    return;
  try {
    const res = await fetch(directoryAdminApi('/people/' + encodeURIComponent(personId) + '/remove-from-parish'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, reasonCode: 'parish_directory_removed' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Unable to remove parish access.');
    setStatus(
      `${name} no longer has parish directory or Koinonia access. Their account and giving history were preserved.`,
      'success'
    );
    if (householdId) await openDirectoryHousehold(householdId);
    else await openDirectoryPerson(personId);
  } catch (error) {
    setStatus(error.message || 'Unable to remove parish access.', 'error');
  }
}

async function openDirectoryPerson(personId) {
  const detail = directoryDetailTarget();
  if (!detail || !personId) return;
  detail.innerHTML = '<p class="sw-tool-loading">Opening person record...</p>';
  try {
    const res = await fetch(directoryAdminApi('/people/' + encodeURIComponent(personId)), { headers: authHeaders() });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Unable to open person record.');
    const record = payload.person || {};
    const person = record.person || {};
    const access = record.accountAccess || {};
    const invitation = access.activeInvitation || null;
    const household = (record.households || [])[0] || {};
    const parishConnected = record.parishConnected === true;
    const publicationVisible =
      record.publication?.status === 'approved' && record.publication?.approval_status === 'approved';
    const verificationStatus = record.householdVerification?.status || 'due';
    const koinoniaAllowed =
      parishConnected && access.linked && Boolean(household.id) && verificationStatus === 'current';
    const accessPanel = access.child
      ? `<div class="pdx-dir-empty"><strong>Managed through the family account</strong><span>Children do not need a separate My AGAPAY account.</span></div>`
      : access.linked
        ? `<div class="pdx-dir-empty"><strong>My AGAPAY account linked</strong><span>This adult has their own identity inside the shared household and can be recognized for Koinonia ministries and groups.</span></div>`
        : invitation
          ? `<div class="pdx-dir-detail-chip"><strong>Invitation ${escapeHtml(invitation.status)}</strong><span>${escapeHtml(invitation.recipientEmail || '')} · expires ${escapeHtml(new Date(invitation.expiresAt).toLocaleDateString())}</span></div>
               <div class="pdx-dir-actions"><button class="pdx-dir-action-btn" type="button" onclick="resendDirectoryAccountInvitation('${escapeAttr(invitation.id)}','${escapeAttr(person.id)}')">Resend invitation</button><button class="pdx-dir-action-btn" type="button" onclick="revokeDirectoryAccountInvitation('${escapeAttr(invitation.id)}','${escapeAttr(person.id)}')">Revoke</button></div>`
          : `<form class="pdx-dir-actions" onsubmit="sendDirectoryAccountInvitation(event,'${escapeAttr(person.id)}','${escapeAttr(household.id || '')}')">
                 <label style="flex:1;min-width:220px">Adult email<input name="email" type="email" autocomplete="email" required placeholder="name@example.com" /></label>
                 <button class="pdx-dir-action-btn" type="submit">Send My AGAPAY invitation</button>
               </form><p class="section-note">The secure link connects this adult’s own My AGAPAY account to their person record${household.id ? ' and shared household' : ''}. Other linked adults keep their own sign-in.</p>`;
    detail.innerHTML = directoryRecordDetailShell(
      'Person record',
      person.preferredName || person.legalName || 'Directory person',
      'See exactly what this person can access and what other parishioners can see.',
      `
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column"><h4>Access &amp; visibility</h4>
            <div class="pdx-dir-status-list">
              ${directoryAccessStatusRow('Parish connection', parishConnected ? 'Active' : 'Removed', parishConnected ? 'This person is currently connected to this parish.' : 'This parish no longer grants directory or Koinonia access.', parishConnected ? 'good' : 'blocked')}
              ${directoryAccessStatusRow('My AGAPAY account', access.linked ? 'Connected' : 'Not connected', access.linked ? 'Their sign-in and giving history remain available.' : 'No personal My AGAPAY sign-in is linked to this record.', access.linked ? 'good' : 'neutral')}
              ${directoryAccessStatusRow('Parishioner directory', publicationVisible && parishConnected ? 'Visible' : 'Hidden', publicationVisible && parishConnected ? 'Approved parishioners can find this person.' : 'This person is not shown to parishioners.', publicationVisible && parishConnected ? 'good' : 'neutral')}
              ${directoryAccessStatusRow('Koinonia', koinoniaAllowed ? 'Allowed' : 'Blocked', koinoniaAllowed ? 'Parish connection, account link, and household confirmation are current.' : !parishConnected ? 'Parish access was removed.' : !access.linked ? 'A personal account must be connected.' : !household.id ? 'A household connection is required.' : 'The household confirmation is not current.', koinoniaAllowed ? 'good' : 'blocked')}
            </div>
          </section>
          <section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Households</h4>
            ${directoryDetailList(record.households, 'No household links', 'Link this person to a household before family tools feel complete.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.display_name || item.displayName || item.id)}</strong><span>${escapeHtml(item.relationship || 'member')}</span></div>`)}
          </section>
        </div>
        <section class="pdx-dir-review-column"><h4>My AGAPAY access</h4>${accessPanel}<div id="directoryInvitationResult"></div></section>
        ${!access.child && parishConnected ? `<section class="pdx-dir-danger-zone"><div><strong>Remove from parish</strong><p>Use this when the person should no longer appear in this parish’s directory or enter Koinonia. Their My AGAPAY account and giving history will be kept.</p></div><button type="button" onclick="removeDirectoryPersonFromParish('${escapeAttr(person.id)}','${escapeAttr(person.preferredName || person.legalName || 'this person')}','${escapeAttr(person.version || '')}','${escapeAttr(household.id || '')}')">Remove from parish</button></section>` : ''}
        <div class="pdx-dir-review-grid">
          <section class="pdx-dir-review-column"><h4>Contacts</h4>
            ${directoryDetailList(record.contacts, 'No contacts', 'No staff-visible contact method is attached to this person.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.label || item.contact_type || item.contactType)}</strong><span>${escapeHtml(item.value || '')} · ${escapeHtml(item.visibility || '')}</span></div>`)}
          </section>
          <section class="pdx-dir-review-column"><h4>Notes</h4>
            ${directoryDetailList(record.notes, 'No notes', 'No internal notes are attached to this person.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.title || item.noteType || 'Note')}</strong><span>${escapeHtml(item.body || item.note || item.summary || '')}</span></div>`)}
          </section>
        </div>`,
      detail.id
    );
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    detail.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to open this person record.')}</p>`;
  }
}

function directoryHouseholdAccountRow(member, householdId, verificationStatus, managerIds = new Set()) {
  const name = member.preferred_name || member.preferredName || member.id;
  const relationship = String(member.relationship || 'adult').replace(/_/g, ' ');
  const manager = managerIds.has(String(member.id));
  if (member.child) {
    return `<div class="pdx-dir-account-row is-child"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(relationship)} · managed by household adults</span></div><em>Child profile</em></div>`;
  }
  const removal = member.parishConnected
    ? `<button class="is-danger" type="button" onclick="removeDirectoryPersonFromParish('${escapeAttr(member.id)}','${escapeAttr(name)}','${escapeAttr(member.personVersion || '')}','${escapeAttr(householdId)}')">Remove from parish</button>`
    : '';
  if (!member.parishConnected) {
    return `<div class="pdx-dir-account-row is-removed"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(relationship)} · My AGAPAY account and household record preserved</span></div><em>Parish access removed</em></div>`;
  }
  if (member.accountLinked) {
    const ready = verificationStatus === 'current';
    return `<div class="pdx-dir-account-row is-linked"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(relationship)}${manager ? ' · household manager' : ''}</span></div><div class="pdx-dir-account-state"><em>Account connected</em><span>${ready ? 'Koinonia allowed' : 'Koinonia blocked · household confirmation required'}</span></div>${removal}</div>`;
  }
  if (member.invitation) {
    return `<div class="pdx-dir-account-row is-pending"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(relationship)}${manager ? ' · household manager' : ''}</span></div><div class="pdx-dir-account-state"><em>Invitation pending</em><span>${escapeHtml(member.invitation.recipientEmail || member.email || '')}</span></div><div class="pdx-dir-account-actions"><button type="button" onclick="resendDirectoryAccountInvitation('${escapeAttr(member.invitation.id)}','${escapeAttr(member.id)}','${escapeAttr(householdId)}')">Resend</button><button type="button" onclick="revokeDirectoryAccountInvitation('${escapeAttr(member.invitation.id)}','${escapeAttr(member.id)}','${escapeAttr(householdId)}')">Revoke</button></div>${removal}</div>`;
  }
  return `<form class="pdx-dir-account-row is-needed" onsubmit="sendDirectoryHouseholdInvitation(event,'${escapeAttr(member.id)}','${escapeAttr(householdId)}')"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(relationship)}${manager ? ' · household manager' : ''} · no account connected</span></div><label><span class="sr-only">Email for ${escapeHtml(name)}</span><input name="email" type="email" autocomplete="email" required value="${escapeAttr(member.email || '')}" placeholder="adult@example.com" /></label><button type="submit">Send invitation</button>${removal}</form>`;
}

async function openDirectoryHousehold(householdId) {
  const detail = directoryDetailTarget();
  if (!detail || !householdId) return;
  detail.innerHTML = '<p class="sw-tool-loading">Opening household record...</p>';
  try {
    const res = await fetch(directoryAdminApi('/households/' + encodeURIComponent(householdId)), {
      headers: authHeaders(),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Unable to open household record.');
    const record = payload.household || {};
    const household = record.household || {};
    const adultMembers = (record.members || []).filter((item) => !item.child);
    const linkedAdults = adultMembers.filter((item) => item.accountLinked).length;
    const pendingAdults = adultMembers.filter((item) => !item.accountLinked && item.invitation).length;
    const connectedAdults = adultMembers.filter((item) => item.parishConnected).length;
    const verificationStatus = record.verification?.status || 'due';
    const publicationVisible =
      record.publication?.status === 'approved' && record.publication?.approval_status === 'approved';
    const koinoniaReadyAdults = adultMembers.filter((item) => item.accountLinked && item.parishConnected).length;
    const managerIds = new Set((record.administrators || []).map((item) => String(item.id)));
    const contactRows = (record.contacts || []).map((item) => {
      const shared = item.visibility === 'directory_members';
      return `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.personName || 'Household')} · ${escapeHtml(item.label || item.contactType || 'Contact')}</strong><span>${escapeHtml(item.value || '')} · ${shared ? 'visible in My AGAPAY directory' : 'private from parishioners'}</span></div>`;
    });
    const addressRows = (record.addresses || []).map((item) => {
      const fullAddress = [
        item.line1,
        item.line2,
        [item.city, item.region, item.postalCode].filter(Boolean).join(' '),
        item.country && item.country !== 'US' ? item.country : '',
      ]
        .filter(Boolean)
        .join(', ');
      const shared = item.visibility === 'directory_members';
      return `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.primary ? 'Primary household address' : item.addressType || 'Household address')}</strong><span>${escapeHtml(fullAddress || 'Not entered')} · ${shared ? 'city/state visible in My AGAPAY; street private' : 'private from parishioners'}</span></div>`;
    });
    detail.innerHTML = directoryRecordDetailShell(
      'Household access',
      household.displayName || 'Directory household',
      'Manage who belongs to this parish, who can enter Koinonia, and what the family shares.',
      `
        <section class="pdx-dir-household-overview"><h4>At a glance</h4><div class="pdx-dir-household-summary">
          ${directoryHouseholdSummaryCard('Parishioner directory', publicationVisible ? 'Visible' : 'Hidden', publicationVisible ? 'Parishioners can find this family.' : 'This family is not published.', publicationVisible ? 'good' : 'neutral')}
          ${directoryHouseholdSummaryCard('Koinonia', verificationStatus === 'current' && koinoniaReadyAdults ? `${koinoniaReadyAdults} allowed` : 'Blocked', verificationStatus !== 'current' ? 'Household confirmation is required.' : koinoniaReadyAdults ? 'Connected adults may enter.' : 'No connected adult has access.', verificationStatus === 'current' && koinoniaReadyAdults ? 'good' : 'blocked')}
          ${directoryHouseholdSummaryCard('Household confirmation', verificationStatus === 'current' ? 'Current' : verificationStatus === 'overdue' ? 'Overdue' : 'Required', verificationStatus === 'current' ? 'Family information is current.' : 'Reconfirm before allowing Koinonia.', verificationStatus === 'current' ? 'good' : 'warn')}
        </div></section>
        <section class="pdx-dir-review-column pdx-dir-household-access"><div class="pdx-dir-section-heading"><div><h4>People &amp; access</h4><p>${connectedAdults} of ${adultMembers.length} adults connected to the parish · ${linkedAdults} My AGAPAY account${linkedAdults === 1 ? '' : 's'} linked${pendingAdults ? ` · ${pendingAdults} invitation${pendingAdults === 1 ? '' : 's'} pending` : ''}</p></div></div>
          <div class="pdx-dir-account-list">${(record.members || []).map((item) => directoryHouseholdAccountRow(item, household.id, verificationStatus, managerIds)).join('') || directoryEmptyState('No household members', 'Add people to this household before linking accounts.')}</div>
          <p class="section-note">Each adult uses a separate My AGAPAY sign-in. Children stay under household management.</p>
        </section>
        <details class="pdx-dir-household-details"><summary><span>Family directory information</span><small>Photo, contact information, and address</small></summary><div class="pdx-dir-review-grid">
          ${directoryHouseholdPhotoCard(record.photo)}
          <section class="pdx-dir-review-column"><h4>Contact &amp; address</h4>
            ${directoryDetailList([...contactRows, ...addressRows], 'No contact information', 'Phone, email, and address will populate from the family account settings.', (item) => item)}
            <p class="pdx-dir-staff-contact-note">Staff-only view. Full street addresses are never published in the donor-side directory.</p>
          </section>
        </div></details>
        <details class="pdx-dir-household-details"><summary><span>Internal notes</span><small>${(record.notes || []).length ? `${record.notes.length} note${record.notes.length === 1 ? '' : 's'}` : 'No notes'}</small></summary><section class="pdx-dir-review-column">
          ${directoryDetailList(record.notes, 'No notes', 'No internal notes are attached to this household.', (item) => `<div class="pdx-dir-detail-chip"><strong>${escapeHtml(item.title || item.noteType || 'Note')}</strong><span>${escapeHtml(item.body || item.note || item.summary || '')}</span></div>`)}
        </section></details>`,
      detail.id
    );
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
    return (
      Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== '')
        .map(([key, item]) => {
          const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^./, (c) => c.toUpperCase());
          return label + ': ' + directoryReviewValue(item);
        })
        .join('\n') || 'Not set'
    );
  }
  return String(value);
}

function directoryReviewObjectRows(obj) {
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).length)
    return '<div class="pdx-dir-empty"><strong>No proposed fields</strong><span>This item may only need status approval.</span></div>';
  return (
    Object.entries(obj)
      .filter(([key]) => !['publicationPreferences', 'source'].includes(key))
      .map(([key, value]) => {
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .replace(/^./, (c) => c.toUpperCase());
        return `<div class="pdx-dir-review-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(directoryReviewValue(value))}</strong></div>`;
      })
      .join('') ||
    '<div class="pdx-dir-empty"><strong>No separate field changes</strong><span>Review the sharing choices for publication approval.</span></div>'
  );
}

function directoryReviewPrefs(preferences) {
  if (!preferences || typeof preferences !== 'object') return '';
  const labels = {
    adultPreferredName: 'Name',
    adultEmail: 'Email',
    adultPhone: 'Phone',
    householdAddress: 'Address',
    personPhoto: 'Photo',
  };
  const anyPublished = Object.values(preferences).some(
    (pref) => pref?.visibility === 'directory_members' && pref?.publicationEligible
  );
  return `<div class="pdx-dir-review-prefs">
      <div class="pdx-dir-review-prefs-head">
        <strong>${anyPublished ? 'Approval will publish selected fields' : 'Parishioner sharing choices'}</strong>
        <span>${anyPublished ? 'Directory-visible after approval' : 'Nothing public unless the member requested it'}</span>
      </div>
      <div class="pdx-dir-pref-chip-list">
      ${Object.entries(preferences)
        .map(([key, pref]) => {
          const visibility = pref?.visibility || 'private';
          const eligible = pref?.publicationEligible;
          const chipClass =
            visibility === 'directory_members' && eligible ? 'publish' : visibility === 'private' ? 'private' : '';
          return `<span class="pdx-dir-pref-chip ${chipClass}"><b>${escapeHtml(labels[key] || key)}</b><small>${escapeHtml(visibility.replace(/_/g, ' '))}${eligible ? ' · requested' : ''}</small></span>`;
        })
        .join('')}
      </div>
      ${anyPublished ? '<em>Approving this item publishes only the fields marked for directory members.</em>' : ''}
    </div>`;
}

function directoryReviewMeta(item) {
  const parts = [
    item.reviewType ? statusLabel(item.reviewType) : '',
    item.requesterLabel ? 'Submitted by ' + item.requesterLabel : '',
    item.priority ? statusLabel(item.priority) + ' priority' : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

async function openDirectoryReview(sourceType, sourceId) {
  const detail = document.getElementById('directoryManagementDetail');
  if (!detail || !sourceType || !sourceId) return;
  detail.innerHTML = '<p class="sw-tool-loading">Opening review item...</p>';
  try {
    const res = await fetch(
      directoryAdminApi('/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId)),
      { headers: authHeaders() }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Unable to open review item.');
    let review = payload.review || {};
    const beginRes = await fetch(
      directoryAdminApi('/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId) + '/begin'),
      { method: 'POST', headers: authHeaders() }
    ).catch(() => null);
    if (beginRes?.ok) {
      const beginPayload = await beginRes.json().catch(() => ({}));
      if (beginPayload.ok !== false && beginPayload.review) review = beginPayload.review;
    }
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
              <button class="pdx-dir-close-btn" type="button" onclick="document.getElementById('directoryManagementDetail').innerHTML=''">Close</button>
            </div>
          </div>
          ${directoryReviewPrefs(proposed.publicationPreferences)}
          ${
            submittedPhoto
              ? `<div class="pdx-dir-review-grid pdx-dir-review-grid-photo">${directorySubmittedPhotoReview(submittedPhoto)}</div>`
              : `<div class="pdx-dir-review-grid">
                <section class="pdx-dir-review-column"><h4>Current record</h4>${directoryReviewObjectRows(review.current || {})}</section>
                <section class="pdx-dir-review-column pdx-dir-review-column-new"><h4>Submitted changes</h4>${directoryReviewObjectRows(proposed)}</section>
              </div>`
          }
          ${directoryReviewConversation(review.conversation || [])}
          ${
            actions.some((action) => ['approve', 'return', 'deny'].includes(action))
              ? `
            <label class="pdx-dir-review-note"><span>Message to parishioner</span><textarea id="directoryReviewNote" rows="2" placeholder="Required when asking for information; optional otherwise"></textarea></label>
            <div class="pdx-dir-review-actions">
              ${actions.includes('approve') ? `<button class="pdx-dir-action-btn pdx-dir-action-primary" type="button" data-review-decision="approve" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','approve', this, '${escapeAttr(item.version || '')}')">Confirm submission</button>` : ''}
              ${actions.includes('return') ? `<button class="pdx-dir-action-btn" type="button" data-review-decision="return" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','return', this, '${escapeAttr(item.version || '')}')">Ask for information</button>` : ''}
              ${actions.includes('deny') ? `<button class="pdx-dir-action-btn pdx-dir-action-danger" type="button" data-review-decision="deny" onclick="decideDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}','deny', this, '${escapeAttr(item.version || '')}')">Decline</button>` : ''}
            </div>`
              : `<p class="section-note">This account can view the item, but it cannot approve it. Use a parish dashboard session or another staff reviewer with directory review permissions.</p>`
          }
        </article>`;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hydrateDirectoryAdminImages(detail);
  } catch (err) {
    detail.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Unable to open this review item.')}</p>`;
  }
}

async function decideDirectoryReview(sourceType, sourceId, decision, button, version = '') {
  const note = document.getElementById('directoryReviewNote')?.value.trim() || '';
  if (decision === 'return' && !note) {
    setStatus('Tell the parishioner exactly what information is needed.', 'error');
    return;
  }
  if (decision === 'deny' && !confirm('Decline this directory submission?')) return;
  const buttons = Array.from(document.querySelectorAll('[data-review-decision]'));
  buttons.forEach((btn) => (btn.disabled = true));
  const originalText = button?.textContent;
  if (button) button.textContent = decision === 'approve' ? 'Approving...' : 'Saving...';
  try {
    const res = await fetch(
      directoryAdminApi(
        '/reviews/' + encodeURIComponent(sourceType) + '/' + encodeURIComponent(sourceId) + '/decision'
      ),
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewerNote: note, requesterNote: note, expectedVersion: version }),
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.message || payload.error || 'Review decision failed.');
    setStatus(decision === 'approve' ? 'Directory item approved.' : 'Directory item updated.', 'success');
    const detail = document.getElementById('directoryManagementDetail');
    if (detail) detail.innerHTML = '';
    await loadDirectoryAdminTab(true);
  } catch (err) {
    buttons.forEach((btn) => (btn.disabled = false));
    if (button && originalText) button.textContent = originalText;
    alert(err.message || 'Unable to save this review decision.');
  }
}

async function directoryInvitationMutation(path, body = {}) {
  const res = await fetch(directoryAdminApi(path), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false)
    throw new Error(payload.message || payload.error || 'Unable to update this invitation.');
  return payload;
}

async function sendDirectoryAccountInvitation(event, personId, householdId) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const email = String(new FormData(form).get('email') || '').trim();
  if (button) {
    button.disabled = true;
    button.textContent = 'Sending…';
  }
  try {
    const payload = await directoryInvitationMutation('/invitations', { personId, householdId, email });
    const result = document.getElementById('directoryInvitationResult');
    if (result)
      result.innerHTML = `<div class="pdx-dir-empty"><strong>${payload.delivery === 'sent' ? 'Invitation emailed' : 'Invitation created'}</strong><span>${payload.delivery === 'sent' ? 'The adult can use the secure link in their email.' : 'Email delivery is not configured. Copy this secure link and send it only to the intended adult.'}</span>${payload.delivery === 'sent' ? '' : `<button class="pdx-dir-action-btn" type="button" data-invitation-url="${escapeAttr(payload.invitationUrl || '')}" onclick="copyDirectoryInvitationLink(this)">Copy secure link</button>`}</div>`;
    setStatus(
      payload.delivery === 'sent' ? 'My AGAPAY invitation sent.' : 'Invitation created; copy the secure link.',
      payload.delivery === 'sent' ? 'success' : ''
    );
    window.setTimeout(() => openDirectoryPerson(personId), 900);
  } catch (error) {
    setStatus(error.message || 'Unable to send invitation.', 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Send My AGAPAY invitation';
    }
  }
}

async function sendDirectoryHouseholdInvitation(event, personId, householdId) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const email = String(new FormData(form).get('email') || '').trim();
  if (button) {
    button.disabled = true;
    button.textContent = 'Sending…';
  }
  try {
    const payload = await directoryInvitationMutation('/invitations', { personId, householdId, email });
    setStatus(
      payload.delivery === 'sent'
        ? 'Adult account invitation sent.'
        : 'Invitation created; the secure link is ready to copy from the person record.',
      'success'
    );
    await openDirectoryHousehold(householdId);
  } catch (error) {
    setStatus(error.message || 'Unable to send invitation.', 'error');
    if (button) {
      button.disabled = false;
      button.textContent = 'Send secure invitation';
    }
  }
}

async function copyDirectoryInvitationLink(button) {
  const url = button?.dataset?.invitationUrl || '';
  if (!url) return;
  await navigator.clipboard.writeText(url);
  setStatus('Secure invitation link copied.', 'success');
}

async function resendDirectoryAccountInvitation(invitationId, personId, householdId = '') {
  try {
    const payload = await directoryInvitationMutation('/invitations/' + encodeURIComponent(invitationId) + '/resend');
    if (payload.delivery !== 'sent' && payload.invitationUrl) {
      await navigator.clipboard.writeText(payload.invitationUrl).catch(() => {});
    }
    setStatus(payload.delivery === 'sent' ? 'Invitation resent.' : 'New secure link copied.', 'success');
    if (householdId) await openDirectoryHousehold(householdId);
    else await openDirectoryPerson(personId);
  } catch (error) {
    setStatus(error.message || 'Unable to resend invitation.', 'error');
  }
}

async function revokeDirectoryAccountInvitation(invitationId, personId, householdId = '') {
  if (!confirm('Revoke this directory invitation? Its secure link will stop working.')) return;
  try {
    await directoryInvitationMutation('/invitations/' + encodeURIComponent(invitationId) + '/revoke');
    setStatus('Invitation revoked.', 'success');
    if (householdId) await openDirectoryHousehold(householdId);
    else await openDirectoryPerson(personId);
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
      : 'Adult account not linked';
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

function directoryHealthOverview(metrics = {}, maintenance = {}, actionCount = 0) {
  const current = Number(maintenance.householdsCurrent || 0);
  const due = Number(maintenance.householdsDue || 0);
  const overdue = Number(maintenance.householdsOverdue || 0);
  const tracked = current + due + overdue;
  const percent = tracked ? Math.round((current / tracked) * 100) : 100;
  const required = Number(actionCount || 0);
  return `<section class="pdx-dir-health" aria-label="Directory health">
      <div class="pdx-dir-health-summary">
        <div class="pdx-dir-health-ring" style="--health-pct:${percent}%"><span><strong>${percent}%</strong><small>current</small></span></div>
        <div><span class="pdx-dir-health-kicker">Directory health</span><h3>${required ? `${required} submission${required === 1 ? '' : 's'} awaiting review` : 'No submissions need review'}</h3><p>${tracked ? `${current} of ${tracked} participating households have current confirmation.` : 'No participating household confirmations are due yet.'} Only completed My AGAPAY submissions enter the queue below.</p></div>
      </div>
      <div class="pdx-dir-health-grid">
        ${directoryHealthTile('Awaiting review', metrics.totalPending || 0, 'Confirm, decline, or request information', Number(metrics.totalPending || 0) ? 'urgent' : 'good')}
        ${directoryHealthTile('Current households', current, 'Confirmed and ready for self-service', 'good')}
        ${directoryHealthTile('Confirmations due', due + overdue, `${overdue} overdue · member reminders stay in My AGAPAY`, overdue ? 'urgent' : 'watch')}
        ${directoryHealthTile('Connected households', Number(maintenance.accountManagedHouseholds || 0), 'Households connected to a My AGAPAY account', 'good')}
      </div>
    </section>`;
}

function directoryHealthTile(label, value, copy, tone) {
  return `<div class="pdx-dir-health-tile is-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(copy)}</small></div>`;
}

function directoryReviewTypeLabel(type = '') {
  const labels = {
    publication_person: 'Member directory submission',
    publication_household: 'Household directory submission',
    membership_add_adult: 'Add adult to household',
    membership_remove: 'Remove household member',
    household_relationship_change: 'Household relationship change',
    child_publication_review: 'Child sharing request',
    publication_media: 'Photo sharing request',
    person_canonical_correction: 'Member record correction',
  };
  return labels[type] || String(type || 'Directory submission').replace(/_/g, ' ');
}

function directoryReviewQueueRows(items = []) {
  if (!items.length)
    return `<div class="pdx-dir-queue-empty"><span>✓</span><strong>No submissions awaiting review</strong><small>Completed directory submissions will appear here after a member sends them from My AGAPAY.</small></div>`;
  return items
    .map((item) => {
      const openAction = `openDirectoryReview('${escapeAttr(item.sourceType)}','${escapeAttr(item.sourceId)}')`;
      return `<article class="pdx-dir-queue-row">
      <div class="pdx-dir-queue-priority is-${escapeAttr(item.priority || 'normal')}" aria-label="${escapeAttr(item.priority || 'normal')} priority"></div>
      <div class="pdx-dir-queue-copy"><span>${escapeHtml(directoryReviewTypeLabel(item.reviewType))}</span><strong>${escapeHtml(item.targetLabel || 'Directory record')}</strong><small>${escapeHtml(item.summary || 'Directory review')} · ${item.ageDays ? `${escapeHtml(item.ageDays)} day${item.ageDays === 1 ? '' : 's'} waiting` : 'New'}</small></div>
      <div class="pdx-dir-queue-state"><span>${escapeHtml((item.queueStatus || 'pending_review').replace(/_/g, ' '))}</span><button type="button" onclick="${openAction}">Review</button></div>
    </article>`;
    })
    .join('');
}

function directoryReviewConversation(messages = []) {
  if (!messages.length) return '';
  return `<div class="pdx-dir-review-conversation"><h4>Question and response</h4>${messages.map((message) => `<div class="is-${escapeAttr(message.direction)}"><span>${message.direction === 'staff_to_member' ? 'Parish office' : 'Parishioner'}</span><p>${escapeHtml(message.body)}</p></div>`).join('')}</div>`;
}

function directorySkillsAdminRows(listings) {
  if (!listings.length)
    return directoryEmptyState('Nothing to review', 'No Skills & Service listings are active or awaiting review.');
  return listings
    .map(
      (item) => `
      <div class="pdx-dir-row">
        <div class="pdx-dir-row-copy">
          <div class="pdx-dir-row-title">${escapeHtml(item.displayLabel || item.skill?.name || 'Skill listing')}</div>
          <div class="pdx-dir-row-meta">${escapeHtml(item.person?.displayName || 'Member')} · ${escapeHtml(item.status || '')}</div>
        </div>
        <div class="pdx-dir-row-side">
          ${item.status === 'hidden_by_parish' ? `<button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','restore')">Restore</button>` : `<button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','hide')">Hide</button>`}
          <button class="pdx-dir-action-btn" type="button" onclick="moderateDirectorySkill('${escapeHtml(item.id)}','archive')">Archive</button>
        </div>
      </div>`
    )
    .join('');
}

async function moderateDirectorySkill(id, action) {
  if (!id || !action) return;
  try {
    const reason = action === 'hide' ? 'Hidden from parish dashboard review.' : '';
    const res = await fetch(directoryAdminApi('/skills/listings/' + encodeURIComponent(id) + '/' + action), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Skill listing update failed.');
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
  win.document.write(
    '<!doctype html><title>Preparing directory…</title><p style="font:16px system-ui;padding:32px;">Preparing your printable directory…</p>'
  );
  win.document.close();
  try {
    const res = await fetch(directoryAdminApi(path), { headers: authHeaders() });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false)
      throw new Error(payload.message || payload.error || 'Print view is unavailable.');
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
  const cards = Array.from(grouped.entries())
    .map(
      ([household, members]) =>
        `<article><h2>${escapeHtml(household)}</h2><p>${members.length ? members.map(escapeHtml).join(' · ') : 'No published members'}</p></article>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Parish Directory</title><style>
      @page{size:letter;margin:.55in}*{box-sizing:border-box}body{margin:0;color:#171715;background:#f6f1e8;font-family:Arial,sans-serif}header{padding:32px;background:linear-gradient(145deg,#061522,#0b2130);color:#f6f1e8}header small{color:#e8c879;text-transform:uppercase;letter-spacing:.14em;font-weight:700}h1{margin:6px 0 4px;font:600 36px Georgia,serif}header p{margin:0;color:rgba(246,241,232,.72)}.toolbar{display:flex;justify-content:flex-end;padding:14px 24px;background:#fff;border-bottom:1px solid #ddd}.toolbar button{border:0;border-radius:9px;padding:10px 16px;background:#061522;color:#fff;font-weight:700;cursor:pointer}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:24px}article{break-inside:avoid;padding:18px;border:1px solid #ddd5c7;border-radius:14px;background:#fff}article h2{margin:0 0 8px;font:600 22px Georgia,serif;color:#235c4d}article p{margin:0;color:#625e56;font-size:13px;line-height:1.55}footer{padding:0 24px 24px;color:#6f6a60;font-size:11px}@media print{body{background:#fff}.toolbar{display:none}header{padding:20px 24px}main{padding:18px 0}.toolbar+main{}article{box-shadow:none}}
    </style></head><body><header><small>AGAPAY Parish Directory</small><h1>Our Parish Family</h1><p>${escapeHtml(print.privacyReminder || 'Private parish directory. Do not distribute outside the parish.')}</p></header><div class="toolbar"><button onclick="window.print()">Print directory</button></div><main>${cards || '<article><h2>No published households</h2><p>There are no approved directory entries to print yet.</p></article>'}</main><footer>Generated ${escapeHtml(new Date(print.generatedAt || Date.now()).toLocaleString())}</footer></body></html>`;
}

function printableSkillsHtml(print = {}) {
  const rows = (print.listings || [])
    .map(
      (item) =>
        `<article><h2>${escapeHtml(item.displayLabel || item.skill?.name || 'Skill')}</h2><p>${escapeHtml(item.person?.displayName || 'Parish member')} · ${escapeHtml(item.experienceLevel || '')} · ${escapeHtml(item.serviceMode || '')}</p></article>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Skills &amp; Service</title><style>body{font:14px/1.5 Arial;margin:32px;color:#171715}h1,h2{font-family:Georgia,serif}button{float:right;padding:9px 14px}article{break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>Skills &amp; Service</h1><p>${escapeHtml(print.disclaimer || '')}</p>${rows || '<p>No active listings.</p>'}</body></html>`;
}

function directoryMetric(label, value, iconPath) {
  return `<div class="pdx-kpi-card">
      <div class="pdx-kpi-label">${escapeHtml(label)}</div>
      <div class="pdx-kpi-value">${escapeHtml(value ?? 0)}</div>
      <div class="pdx-kpi-icon"><svg viewBox="0 0 24 24">${iconPath || ''}</svg></div>
    </div>`;
}

window.ParishFeatureRegistry.register('directory', {
  load: loadDirectoryAdminTab,
  refresh: () => loadDirectoryAdminTab(true),
  openImport: openDirectoryImport,
});
