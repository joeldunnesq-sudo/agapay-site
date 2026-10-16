// Generated from src/browser/learn/dashboard-shell-setup-calendar.ts by npm run build:browser. Do not edit.
function isOdysseyLearnContext() {
  return document.body.dataset.learnContext === 'odyssey';
}
function learnViewMode() {
  if (!isOdysseyLearnContext()) return 'classic';
  return 'tefa';
}
function learnExperience() {
  const odyssey = isOdysseyLearnContext();
  const viewMode = learnViewMode();
  const tefaActive = odyssey && viewMode === 'tefa';
  return {
    odyssey,
    viewMode,
    tefaActive,
    brandName: 'AGAPAY Learn',
    brandTagline: tefaActive ? 'TEFA Homeschool Planner' : 'Love how you learn',
    backHref: odyssey ? '/learn/odyssey' : '/myagapay',
    backLabel: odyssey ? 'TEFA Portal' : 'AGAPAY Give',
    activationBadge: odyssey ? 'Activated through Odyssey / TEFA' : null,
    dashboardKicker: tefaActive ? 'TEFA HOMESCHOOL PLANNER' : 'AGAPAY LEARN',
    dashboardDescription: tefaActive
      ? "Your TEFA homeschool planner — today's lessons, planner, attendance, grades, and printable records in one place."
      : null,
    // Relabels existing shared nav items (same hrefs/ids) for the TEFA audience.
    navLabels: tefaActive
      ? {
          dashboard: "Today's Lessons",
          planner: 'Planner',
          onboarding: 'Setup & TEKS Subjects',
          formation: 'Formation & Enrichment',
          books: 'Books & Curriculum',
          grades: 'Attendance, Grades & Reports',
          'print-center': 'Print Center',
          community: 'Homeschool Resources',
          'co-op': 'Co-op',
        }
      : {},
    // TEFA/Odyssey families see the exact same nav order as classic AGAPAY
    // Learn (dashboard, planner, formation, books, grades, community, co-op,
    // print-center, onboarding) — only the labels differ, via navLabels
    // above. No custom ordering here; vm.shell.nav's built-in order is used
    // for both contexts so the two dashboards feel like the same product.
    navOrder: null,
  };
}
function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function panel(title, content, options = {}) {
  const icon = options.icon || '✥';
  const style = options.style || '';
  const headingStyle = options.largeTitle
    ? "font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;color:var(--ink);letter-spacing:0;text-transform:none;font-weight:700;"
    : 'color:var(--gold);font-size:12px;letter-spacing:.15em;font-weight:600;';
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(20,40,70,.04);${style}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line);">
        <div style="display:flex;align-items:center;gap:9px;${headingStyle}"><span style="font-size:${options.largeTitle ? '21px' : '17px'};color:var(--gold);">${icon}</span>${html(title)}</div>
        ${options.action ? `<div style="font-size:13px;color:var(--muted);">${options.action}</div>` : ''}
      </div>
      ${content}
    </section>
  `;
}
function emptyState(label) {
  return `<div style="padding:18px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-style:italic;background:rgba(255,255,255,.22);">${html(label)}</div>`;
}
function softColor(color, alpha = '22') {
  const value = String(color || '#b5942f').trim();
  return value.startsWith('#') && value.length === 7 ? `${value}${alpha}` : 'var(--paper2)';
}
function renderPlannerTerm(vm) {
  const weekCells = Array.from(
    { length: Number(vm.term.summary.weeks || 12) },
    (_, index) => `<div style="text-align:center;color:var(--ink);font-size:13px;">${index + 1}</div>`
  ).join('');
  const pacingRows = vm.term.pacingRows
    .map(
      (row) =>
        `<div style="display:grid;grid-template-columns:150px repeat(12,1fr);min-width:920px;border-top:1px solid var(--line);align-items:stretch;"><div style="padding:12px;display:flex;gap:9px;align-items:flex-start;"><span style="width:28px;height:28px;border-radius:50%;background:${html(row.color)};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:13px;">✥</span><span><strong>${html(row.label)}</strong><small style="display:block;color:var(--muted);">${html(row.subtitle)}</small></span></div><div style="grid-column:span 12;display:grid;grid-template-columns:repeat(12,1fr);position:relative;border-left:1px solid var(--line);background:linear-gradient(90deg,rgba(231,220,192,.32) 1px,transparent 1px);background-size:calc(100% / 12) 100%;">${row.segments.map((segment) => `<div style="grid-column:${segment.start} / span ${segment.span};margin:7px 4px;border:1px solid ${html(segment.color)};border-radius:8px;background:${softColor(segment.color, '26')};display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:13px;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(255,255,255,.32);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${html(segment.color)};margin-right:6px;"></span>${html(segment.title)}</div>`).join('')}</div></div>`
    )
    .join('');
  return `
    <div style="display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px;">${vm.term.setupCards.map((card) => `<div style="background:var(--paper);border:1px solid ${html(card.color)};border-radius:12px;padding:14px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);"><small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(card.title)}</small><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:8px 0;color:var(--ink);">${html(card.value)}</strong><span style="color:var(--muted);line-height:1.35;">${html(card.detail)}</span></div>`).join('')}</div>
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;">
      <div style="overflow-x:auto;overflow-y:visible;">
      <div style="min-width:920px;">
        <div style="display:grid;grid-template-columns:150px repeat(12,1fr);padding:12px 0;border-bottom:1px solid var(--line);"><div style="padding-left:12px;color:var(--gold);font-size:12px;letter-spacing:.15em;">TERM PACING</div>${weekCells}</div>
        ${pacingRows || emptyState('Add pacing rows in Setup.')}
      </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:.9fr repeat(${Math.min(vm.term.childTracks.length, 4)}, minmax(150px,1fr));gap:12px;">
      ${panel('Family-Based Learning', vm.term.householdSummary.map((item) => `<div class="learn-list-row">${html(item)}</div>`).join('') || emptyState('Add household streams in Setup.'), { icon: '⌂', style: 'min-width:0;' })}
      ${vm.term.childTracks
        .slice(0, 4)
        .map((child) =>
          panel(
            `${child.name} · Age ${child.age}`,
            `<div style="display:grid;gap:8px;">${child.tracks.map((track) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(track)}</div>`).join('') || emptyState('No tracks configured.')}</div>`,
            { icon: child.initial, style: 'min-width:0;' }
          )
        )
        .join('')}
    </div>
    ${vm.term.childTracks.length > 4 ? `<div style="color:var(--muted);font-size:13px;padding:6px 2px;">+ ${vm.term.childTracks.length - 4} more ${vm.term.childTracks.length - 4 === 1 ? 'child' : 'children'} — add Setup tracks to see their columns here.</div>` : ''}
  `;
}
function renderPlannerYear(vm) {
  const totalTerms = vm.year.terms.length || 4;
  const termTimeline = vm.year.terms
    .map((term, i) => {
      const active = term.active;
      return `
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;">
        <div style="width:100%;height:8px;border-radius:99px;background:${active ? 'var(--gold)' : 'var(--line)'};position:relative;">
          ${active ? `<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:var(--gold);border:2px solid #fff;box-shadow:0 0 0 2px var(--gold);"></div>` : ''}
        </div>
        <strong style="font-size:13px;color:${active ? 'var(--ink)' : 'var(--muted)'};">${html(term.label)}</strong>
        <small style="font-size:11px;color:${active ? 'var(--gold)' : 'var(--muted)'};">${active ? 'Current' : 'Planned'}</small>
      </div>
      ${i < totalTerms - 1 ? `<div style="width:16px;flex:none;height:8px;margin-top:0;align-self:center;"></div>` : ''}`;
    })
    .join('');
  const topicsByType = vm.year.topics.reduce((map, topic) => {
    const key = topic.type || 'Enrichment';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(topic);
    return map;
  }, /* @__PURE__ */ new Map());
  const topicsGrid = topicsByType.size
    ? Array.from(topicsByType.entries())
        .map(
          ([type, topics]) => `
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">${html(type)}</div>
          ${topics
            .map(
              (topic) => `
            <div class="learn-list-row">
              <strong style="display:block;font-size:14px;color:var(--ink);">${html(topic.title)}</strong>
              ${topic.season ? `<small style="color:var(--muted);font-size:11px;">${html(topic.season)}</small>` : ''}
            </div>`
            )
            .join('')}
        </div>`
        )
        .join('')
    : `<div style="color:var(--muted);font-style:italic;font-size:13px;">Add curriculum subjects in Setup to populate the year view.</div>`;
  const pkgCards = vm.year.curriculumPackages.length
    ? vm.year.curriculumPackages
        .map(
          (pkg) => `
        <div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:13px;">
          ${pkg.vendor ? `<small style="color:var(--gold);font-size:10px;letter-spacing:.1em;font-weight:800;text-transform:uppercase;">${html(pkg.vendor)}</small>` : ''}
          <strong style="display:block;margin:4px 0 5px;font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);">${html(pkg.title)}</strong>
          <span style="color:var(--muted);line-height:1.4;font-size:13px;">${html(pkg.summary)}</span>
        </div>`
        )
        .join('')
    : `<div style="color:var(--muted);font-style:italic;font-size:13px;padding:8px 0;">Add curriculum packages in Setup.</div>`;
  const feastItems = vm.year.upcomingFeasts.length
    ? vm.year.upcomingFeasts
        .map(
          (feast) => `
        <div style="display:grid;grid-template-columns:52px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line);align-items:start;">
          <div style="text-align:center;background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:8px;padding:7px 4px;border:1px solid rgba(181,148,47,.28);">
            <div style="color:var(--gold);font-size:14px;">✦</div>
            <div style="color:#f3ead4;font-size:9px;line-height:1.2;margin-top:2px;">${html(feast.date || '')}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:16px;line-height:1.2;display:block;">${html(feast.title)}</strong>
            ${feast.fasting ? `<small style="color:var(--burgundy);font-size:11px;font-weight:700;">${html(feast.fasting)}</small>` : ''}
          </div>
        </div>`
        )
        .join('')
    : emptyState('Connect a calendar source to see upcoming feasts.');
  return `
    <div style="display:grid;gap:16px;">

      ${panel(
        'School Year',
        `
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0 0 4px;">${html(vm.year.schoolYear)}</h2>
        <p style="margin:0 0 18px;color:var(--muted);font-size:13px;">${html(vm.year.dateRange)}${vm.year.cycleTitle ? ` · ${html(vm.year.cycleTitle)}` : ''}${vm.year.cycleYear ? ` · ${html(vm.year.cycleYear)}` : ''}</p>
        <div style="display:flex;gap:0;align-items:flex-start;">
          ${termTimeline}
        </div>`,
        { icon: '▣' }
      )}

      <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;align-items:start;">
        ${panel('Season Topics', `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;">${topicsGrid}</div>`, { icon: '☰' })}
        ${panel('Upcoming Feasts', feastItems, { icon: '✦' })}
      </div>

      ${panel('Curriculum Packages', `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">${pkgCards}</div>`, { icon: '✥' })}

    </div>
  `;
}
function attendanceDateLabel(date = '') {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? /* @__PURE__ */ new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: 'Day', short: date };
  return {
    day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(parsed),
    short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed),
  };
}
function attendanceStatusLabel(status = 'present') {
  return (
    {
      present: 'Present',
      absent: 'Absent',
      excused: 'Excused',
      holiday: 'Holiday',
    }[status] || 'Present'
  );
}
function attendanceStatusMark(status = 'present') {
  return (
    {
      present: 'P',
      absent: 'A',
      excused: 'E',
      holiday: 'H',
    }[status] || 'P'
  );
}
function isoDateFromUTC(date) {
  return date.toISOString().slice(0, 10);
}
function utcHolidayDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12));
}
function addHoliday(map, date, name) {
  map.set(isoDateFromUTC(date), name);
}
function addObservedFixedHoliday(map, year, monthIndex, day, name) {
  const actual = utcHolidayDate(year, monthIndex, day);
  const observed = utcHolidayDate(year, monthIndex, day);
  const weekday = actual.getUTCDay();
  if (weekday === 6) observed.setUTCDate(observed.getUTCDate() - 1);
  if (weekday === 0) observed.setUTCDate(observed.getUTCDate() + 1);
  addHoliday(map, observed, name);
}
function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const date = utcHolidayDate(year, monthIndex, 1);
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (nth - 1) * 7);
  return date;
}
function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const date = utcHolidayDate(year, monthIndex + 1, 0);
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}
function usFederalHolidayMap(year) {
  if (US_FEDERAL_HOLIDAY_CACHE.has(year)) return US_FEDERAL_HOLIDAY_CACHE.get(year);
  const holidays = /* @__PURE__ */ new Map();
  addObservedFixedHoliday(holidays, year, 0, 1, "New Year's Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 0, 1, 3), 'Martin Luther King Jr. Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 1, 1, 3), "Washington's Birthday");
  addHoliday(holidays, lastWeekdayOfMonth(year, 4, 1), 'Memorial Day');
  addObservedFixedHoliday(holidays, year, 5, 19, 'Juneteenth National Independence Day');
  addObservedFixedHoliday(holidays, year, 6, 4, 'Independence Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 8, 1, 1), 'Labor Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 9, 1, 2), 'Columbus Day');
  addObservedFixedHoliday(holidays, year, 10, 11, 'Veterans Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 10, 4, 4), 'Thanksgiving Day');
  addObservedFixedHoliday(holidays, year, 11, 25, 'Christmas Day');
  US_FEDERAL_HOLIDAY_CACHE.set(year, holidays);
  return holidays;
}
function nationalHolidayForDate(date = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const year = Number(date.slice(0, 4));
  return (
    [year - 1, year, year + 1].map((candidateYear) => usFederalHolidayMap(candidateYear).get(date)).find(Boolean) || ''
  );
}
function renderAttendanceTracker(vm) {
  const dates = vm.attendance.weekDates.length ? vm.attendance.weekDates : [];
  const byKey = new Map(vm.attendance.entries.map((entry) => [`${entry.childId}::${entry.date}`, entry]));
  const childSummary = new Map(vm.attendance.summary.byChild.map((row) => [row.childId, row]));
  const head = dates
    .map((date) => {
      const label = attendanceDateLabel(date);
      const holiday = nationalHolidayForDate(date);
      return `<span><strong>${html(label.day)}</strong><small>${html(label.short)}${holiday ? ` · ${html(holiday)}` : ''}</small></span>`;
    })
    .join('');
  const rows = vm.children
    .map((child) => {
      const summary = childSummary.get(child.id) || {};
      return `<div class="learn-attendance-row" data-attendance-child="${html(child.id)}">
      <div class="learn-attendance-student">
        <span style="background:${html(child.color)};">${html(child.initial)}</span>
        <strong>${html(child.name)}</strong>
        <small>${html(summary.instructionalDays || 0)} instructional day${Number(summary.instructionalDays || 0) === 1 ? '' : 's'}</small>
      </div>
      ${dates
        .map((date) => {
          const holiday = nationalHolidayForDate(date);
          const entry = byKey.get(`${child.id}::${date}`) || {
            status: holiday ? 'holiday' : 'present',
            minutes: 0,
            notes: holiday,
          };
          const status = entry.status || 'present';
          return `<button type="button" class="learn-attendance-cell is-${html(status)}" data-attendance-cell data-child-id="${html(child.id)}" data-date="${html(date)}" data-status="${html(status)}" data-default-status="${holiday ? 'holiday' : 'present'}" data-holiday-name="${html(holiday)}" data-minutes="${html(entry.minutes || '')}" data-notes="${html(entry.notes || holiday || '')}" aria-label="${html(`${child.name} ${date}: ${attendanceStatusLabel(status)}${holiday ? ` (${holiday})` : ''}`)}"><strong>${html(attendanceStatusMark(status))}</strong><small>${html(holiday && status === 'holiday' ? holiday : attendanceStatusLabel(status))}</small></button>`;
        })
        .join('')}
    </div>`;
    })
    .join('');
  const guidance = `<div class="learn-attendance-guidance"><strong>Attendance is optional.</strong><span>Texas homeschools do not need this tracker, but families in states that require attendance can keep a clean household log here.</span></div>`;
  return `
    <section data-attendance-form class="learn-attendance-panel is-collapsed">
      <div class="learn-attendance-toolbar">
        <div>
          <small>Household Attendance</small>
          <h2>Weekly attendance log</h2>
          <em data-attendance-status aria-live="polite">Attendance card minimized. Mark the week present or expand for details.</em>
        </div>
        <div class="learn-attendance-actions">
          <button type="button" data-attendance-present-week>Mark All Present</button>
          <button type="button" data-attendance-toggle aria-expanded="false">Expand</button>
          <button type="button" data-attendance-save>Save Attendance</button>
        </div>
      </div>
      <div class="learn-attendance-body" data-attendance-body hidden>
        ${guidance}
        <div class="learn-attendance-grid" style="--attendance-cols:${dates.length};">
          <div class="learn-attendance-head"><span></span>${head}</div>
          ${rows}
        </div>
        <div class="learn-attendance-legend">
          <span><b class="is-present">P</b> Present</span>
          <span><b class="is-absent">A</b> Absent</span>
          <span><b class="is-excused">E</b> Excused</span>
          <span><b class="is-holiday">H</b> Holiday</span>
        </div>
      </div>
    </section>`;
}
function setupInput(label, name, value = '', options = {}) {
  const type = options.type || 'text';
  const step = options.step ? ` step="${html(options.step)}"` : '';
  const placeholder = options.placeholder ? ` placeholder="${html(options.placeholder)}"` : '';
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<input name="${html(name)}" type="${html(type)}"${step}${placeholder} value="${html(value)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);" /></label>`;
}
function setupSelect(label, name, value, options) {
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<select name="${html(name)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);">${options
    .map((option) => {
      const optionValue = typeof option === 'object' && option !== null && 'value' in option ? option.value : option;
      const optionLabel = typeof option === 'object' && option !== null && 'label' in option ? option.label : option;
      return `<option value="${html(optionValue)}" ${optionValue === value ? 'selected' : ''}>${html(optionLabel)}</option>`;
    })
    .join('')}</select></label>`;
}
function setupTermOptions(terms = [], fallbackTerm = {}) {
  const source = terms.length ? terms : [fallbackTerm];
  return source.map((term, index) => ({
    value: term.id || `term_${index + 1}`,
    label: term.label || `Term ${index + 1}`,
  }));
}
function termSetupRow(term = {}, index = 0) {
  const termId = term.id || `term_${index + 1}`;
  return `<div data-setup-row="terms" data-id="${html(termId)}" style="display:grid;grid-template-columns:1fr .7fr .7fr .55fr auto auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;"><input type="hidden" name="id" value="${html(termId)}" />${setupInput('Term name', 'label', term.label || `Term ${index + 1}`)}${setupInput('Start', 'startDate', term.startDate || '', { type: 'date' })}${setupInput('End', 'endDate', term.endDate || '', { type: 'date' })}${setupInput('Weeks', 'weeksCount', term.weeksCount || 12, { type: 'number' })}<button type="button" data-close-term="${html(termId)}" style="align-self:end;border:1px solid var(--gold);background:#fbf2dd;color:var(--ink);border-radius:9px;padding:10px 12px;font-family:inherit;font-weight:700;">Close Term</button>${setupRemoveButton()}<label style="grid-column:1 / -1;display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Term description — cycle, focus, or notes<textarea name="description" rows="2" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);resize:vertical;font-size:13px;">${html(term.description || '')}</textarea></label></div>`;
}
function setupRemoveButton() {
  return `<button type="button" data-setup-remove-row aria-label="Remove row" style="align-self:end;border:1px solid var(--line);background:var(--paper);color:var(--burgundy);border-radius:9px;padding:10px 12px;font-family:inherit;">Remove</button>`;
}
function setupGracePriorityValue(value = 'core') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim();
  if (normalized === 'keep' || normalized === 'always keep') return 'core';
  if (normalized === 'important') return 'high';
  if (normalized === 'reduce first' || normalized === 'shorten' || normalized === 'helpful') return 'medium';
  if (
    normalized === 'bump if needed' ||
    normalized === 'defer if needed' ||
    normalized === 'minimum only' ||
    normalized === 'optional'
  )
    return 'low';
  return ['core', 'high', 'medium', 'low'].includes(normalized) ? normalized : 'core';
}
function setupGraceModeBehavior(value = 'core') {
  return `<span class="learn-grace-behavior-field">${setupSelect('Grace priority', 'gracePriority', setupGracePriorityValue(value), graceModeOptions)}<small>Full runs all scheduled work. Medium keeps up to 4 ranked child subjects per day. Light keeps up to 2 and turns kept work into short touchpoints.</small></span>`;
}
function planningModeOptionsFor(groupingMode = 'forms') {
  return [
    { value: 'family', label: 'Family-Based' },
    { value: 'forms', label: groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based' },
  ];
}
function setupGroupOptions(children = [], groupingMode = 'forms') {
  const values =
    groupingMode === 'grades'
      ? children.map((child) => child.gradeLabel || child.grade)
      : children.map((child) => child.formLabel || child.form);
  const unique = [
    ...new Set(values.map((value) => String(value || '').trim()).filter((value) => value && value !== 'Form V')),
  ];
  return groupingMode === 'grades' ? unique : [.../* @__PURE__ */ new Set([...formOptions, ...unique])];
}
function activeSetupGroupLabels(children = [], groupingMode = 'forms', resources = []) {
  const childLabels = (
    groupingMode === 'grades'
      ? children.map((child) => child.gradeLabel || child.grade)
      : children.map((child) => child.formLabel || child.form)
  )
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== 'Form V');
  const resourceLabels = resources
    .flatMap((resource) => {
      if (Array.isArray(resource.formLabels) && resource.formLabels.length) return resource.formLabels;
      return [resource.formLabel, resource.gradeLabel];
    })
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== 'Form V');
  const fallback = groupingMode === 'grades' ? [] : formOptions;
  const labels = [.../* @__PURE__ */ new Set([...childLabels, ...resourceLabels, ...fallback])];
  if (groupingMode !== 'forms') return labels;
  const formOrder = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];
  return labels.sort((a, b) => {
    const aIndex = formOrder.indexOf(a);
    const bIndex = formOrder.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1)
      return (aIndex === -1 ? formOrder.length : aIndex) - (bIndex === -1 ? formOrder.length : bIndex);
    return a.localeCompare(b);
  });
}
function primaryResourceGroupLabel(resource = {}, groupingMode = 'forms') {
  const labels = Array.isArray(resource.formLabels)
    ? resource.formLabels.map((value) => String(value || '').trim()).filter(Boolean)
    : String(resource.formLabels || resource.formLabel || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
  if (labels.length) return labels[0];
  if (groupingMode === 'grades' && resource.gradeLabel) return String(resource.gradeLabel).trim();
  return '';
}
function scheduledTermWeeks(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  const selected = direct
    .map((week) => Number.parseInt(week, 10))
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks);
  return selected.length
    ? [...new Set(selected)].sort((a, b) => a - b)
    : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}
function selectedTermWeeks(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? value : String(value || '').split(',');
  return [
    ...new Set(
      direct
        .map((week) => Number.parseInt(week, 10))
        .filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks)
    ),
  ].sort((a, b) => a - b);
}
function termWeekSummaryFromSelected(selected = [], totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  if (selected.length === totalWeeks) return `All ${totalWeeks} weeks`;
  if (!selected.length) return 'Choose weeks';
  const ranges = [];
  let start = selected[0];
  let previous = selected[0];
  for (const week of selected.slice(1)) {
    if (week === previous + 1) {
      previous = week;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = previous = week;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return `Weeks ${ranges.join(', ')}`;
}
function termWeekSummary(weeks = [], totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  return termWeekSummaryFromSelected(scheduledTermWeeks(weeks, totalWeeks), totalWeeks);
}
function setupTermWeekPicker(value, totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const selected = scheduledTermWeeks(value, totalWeeks);
  return `<details class="learn-day-picker learn-term-week-picker"><summary><span>Term weeks</span><strong data-term-week-summary>${html(termWeekSummary(selected, totalWeeks))}</strong></summary><div class="learn-day-picker-menu" style="grid-template-columns:repeat(4,minmax(54px,1fr));">${Array.from(
    { length: totalWeeks },
    (_, index) => index + 1
  )
    .map(
      (week) =>
        `<label><input type="checkbox" data-term-week-choice value="${week}" ${selected.includes(week) ? 'checked' : ''}>W${week}</label>`
    )
    .join(
      ''
    )}</div><div style="display:flex;gap:8px;padding:8px 10px 2px;"><button type="button" data-term-weeks-all class="learn-add-button" style="padding:6px 10px;">All weeks</button><button type="button" data-term-weeks-odd class="learn-add-button" style="padding:6px 10px;">Odd weeks</button><button type="button" data-term-weeks-even class="learn-add-button" style="padding:6px 10px;">Even weeks</button></div><input type="hidden" name="scheduledWeeks" value="${html(selected.join(','))}"></details>`;
}
function resourceFieldName(index, field) {
  return `resources.${index}.${field}`;
}
function setupResourceWeekPicker(index, scheduledWeeks = [], totalWeeks = DEFAULT_TERM_WEEK_COUNT) {
  const selected = selectedTermWeeks(scheduledWeeks, totalWeeks);
  const summary = termWeekSummaryFromSelected(selected, totalWeeks);
  const name = resourceFieldName(index, 'scheduledWeeks');
  return `<details class="learn-day-picker learn-term-week-picker learn-resource-week-picker" data-resource-week-picker="${index}"><summary><span>Active weeks</span><strong data-term-week-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu" style="grid-template-columns:repeat(4,minmax(54px,1fr));">${Array.from(
    { length: totalWeeks },
    (_, i) => i + 1
  )
    .map(
      (week) =>
        `<label><input type="checkbox" data-term-week-choice value="${week}" ${selected.includes(week) ? 'checked' : ''}>W${week}</label>`
    )
    .join(
      ''
    )}</div><div style="display:flex;gap:8px;padding:8px 10px 2px;"><button type="button" data-term-weeks-all class="learn-add-button" style="padding:6px 10px;">All</button><button type="button" data-term-weeks-odd class="learn-add-button" style="padding:6px 10px;">Odd</button><button type="button" data-term-weeks-even class="learn-add-button" style="padding:6px 10px;">Even</button></div><input type="hidden" data-resource-field="scheduledWeeks" name="${html(name)}" value="${html(selected.join(','))}"></details>`;
}
function setupResourceWeeklyPlanFields(index, value = []) {
  const entries = Array.isArray(value) ? value : String(value || '').split('|');
  return `<div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, weekIndex) => `<label>Week ${weekIndex + 1}<input type="text" data-resource-field="weeklyPlans.${weekIndex + 1}" name="${html(resourceFieldName(index, `weeklyPlans.${weekIndex + 1}`))}" value="${html(entries[weekIndex] || '')}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join('')}</div>`;
}
function setupResourcePlanningModePicker(index, item = {}, children = [], groupingMode = 'forms') {
  const label = groupingMode === 'grades' ? 'Grades / levels' : 'Forms';
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || '').split(',');
  const selectedGroups = [...new Set(selected.map((value) => String(value || '').trim()).filter(Boolean))];
  const familyBased = (item.planningMode || 'forms') !== 'forms' || !selectedGroups.length;
  const summary = familyBased
    ? 'Family-Based'
    : `${groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based'}: ${selectedGroups.join(', ')}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based')}"><summary><span>${html(label)}</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? 'checked' : ''}>${html(option)}</label>`).join('')}</div><input type="hidden" data-planning-mode-field data-resource-field="planningMode" name="${html(resourceFieldName(index, 'planningMode'))}" value="${familyBased ? 'family' : 'forms'}"><input type="hidden" data-form-label-field data-resource-field="formLabel" name="${html(resourceFieldName(index, 'formLabel'))}" value="${html(selectedGroups[0] || '')}"><input type="hidden" data-form-labels-field data-resource-field="formLabels" name="${html(resourceFieldName(index, 'formLabels'))}" value="${html(selectedGroups.join(','))}"><input type="hidden" data-grade-label-field data-resource-field="gradeLabel" name="${html(resourceFieldName(index, 'gradeLabel'))}" value="${html(groupingMode === 'grades' ? selectedGroups[0] || '' : item.gradeLabel || '')}"></details>`;
}
function setupResourceChildPicker(index, children = [], selectedIds = []) {
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
  const summary = selected.length
    ? children
        .filter((child) => selected.includes(child.id))
        .map((child) => child.name || child.firstName || child.id)
        .join(', ')
    : 'Use Forms';
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? 'checked' : ''}>${html(child.name || child.firstName || child.id)}</label>`).join('')}</div><input type="hidden" data-child-ids-field data-resource-field="childIds" name="${html(resourceFieldName(index, 'childIds'))}" value="${html(selected.join(','))}"></details>`;
}
function setupResourcePlanningCard(index, resource = {}, children = [], groupingMode = 'forms') {
  return `<details class="learn-weekly-plan-fields learn-resource-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>${html(termWeekSummaryFromSelected(selectedTermWeeks(resource.scheduledWeeks || [])))}</strong></summary><div class="learn-resource-plan-controls">${setupResourceWeekPicker(index, resource.scheduledWeeks || [])}${setupResourcePlanningModePicker(index, resource, children, groupingMode)}${setupResourceChildPicker(index, children, resource.childIds || [])}</div>${setupResourceWeeklyPlanFields(index, resource.weeklyPlans || [])}</details>`;
}
function normalizeSetupResource(resource, subject = {}) {
  const raw = typeof resource === 'string' ? { title: resource } : resource || {};
  return {
    title: String(raw.title || raw.resource || ''),
    scheduledWeeks: raw.scheduledWeeks || [],
    weeklyPlans: raw.weeklyPlans || subject.weeklyPlans || [],
    planningMode: raw.planningMode || subject.planningMode || 'forms',
    formLabel: raw.formLabel || subject.formLabel || '',
    formLabels:
      Array.isArray(raw.formLabels) && raw.formLabels.length
        ? raw.formLabels
        : Array.isArray(subject.formLabels)
          ? subject.formLabels
          : [],
    gradeLabel: raw.gradeLabel || subject.gradeLabel || '',
    childIds:
      Array.isArray(raw.childIds) && raw.childIds.length
        ? raw.childIds
        : Array.isArray(subject.childIds)
          ? subject.childIds
          : [],
  };
}
function setupResourceRow(resource = {}, index = 0, children = [], groupingMode = 'forms') {
  const resolved = String(resource.title || '').trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open</a>`
    : '';
  const summary = termWeekSummaryFromSelected(selectedTermWeeks(resource.scheduledWeeks || []));
  return `<div data-resource-row="${index}" class="learn-resource-card" draggable="true" title="Drag this resource to another subject tile">
    <div class="learn-resource-card-summary">
      <small>${html(index === 0 ? 'Book / source / resource' : `Resource ${index + 1}`)}</small>
      <strong data-resource-summary-title>${html(resolved || 'Untitled resource')}</strong>
      <span data-resource-summary-detail>${html(summary)}</span>
      ${link}
    </div>
    <div class="learn-resource-card-actions"><button type="button" data-edit-resource>Edit</button><button type="button" data-remove-resource aria-label="Remove resource">Remove</button></div>
    <div class="learn-resource-modal" data-resource-modal hidden>
      <div class="learn-resource-modal-card">
        <button type="button" class="learn-family-modal-close" data-resource-modal-close aria-label="Close">×</button>
        <small>${html(index === 0 ? 'Book / source / resource' : `Resource ${index + 1}`)}</small>
        <h2>Resource details</h2>
        <label>Title, source note, or URL<input type="text" data-resource-field="title" name="${html(resourceFieldName(index, 'title'))}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." /></label>
        <div class="learn-resource-card-plan">${setupResourcePlanningCard(index, resource, children, groupingMode)}</div>
        <div class="learn-family-modal-actions"><button type="button" data-resource-modal-close>Cancel</button><button type="button" data-resource-modal-save>Save resource</button></div>
      </div>
    </div>
  </div>`;
}
function setupResourceLane(label, rows = [], index = 0, groupingMode = 'forms') {
  const laneLabel = label || 'Family-Based';
  const resourceLabel = rows.length === 1 ? 'resource' : 'resources';
  const addLabel = label ? `+ Add ${laneLabel} resource` : '+ Add family resource';
  return `<section class="learn-resource-form-lane" data-resource-lane="${html(label || '__family')}">
    <header><span>${html(laneLabel)}</span><strong>${rows.length} ${resourceLabel}</strong></header>
    <div class="learn-resource-form-lane-body">${rows.join('')}<button type="button" data-add-resource data-resource-form-label="${html(label)}" data-resource-grouping-mode="${html(groupingMode)}">${html(addLabel)}</button></div>
  </section>`;
}
function setupResourceList(resources = [], children = [], groupingMode = 'forms', subject = {}) {
  const entries =
    Array.isArray(resources) && resources.length
      ? resources
      : groupingMode === 'forms'
        ? []
        : [{ title: '', scheduledWeeks: [] }];
  const normalised = entries.map((entry) => normalizeSetupResource(entry, subject));
  if (groupingMode === 'forms') {
    const groupLabels = activeSetupGroupLabels(children, groupingMode, normalised);
    const lanes = new Map([['', []], ...groupLabels.map((label) => [label, []])]);
    normalised.forEach((resource, index) => {
      const label = primaryResourceGroupLabel(resource, groupingMode);
      if (!lanes.has(label)) lanes.set(label, []);
      lanes.get(label).push(setupResourceRow(resource, index, children, groupingMode));
    });
    const renderedLanes = [...lanes.entries()]
      .map(([label, rows2], index) => setupResourceLane(label, rows2, index, groupingMode))
      .join('');
    return `<div data-resource-list class="learn-resource-list learn-resource-list-by-form">${renderedLanes}</div>`;
  }
  const rows = normalised.map((resource, index) => setupResourceRow(resource, index, children, groupingMode)).join('');
  return `<div data-resource-list class="learn-resource-list">${rows}<button type="button" data-add-resource>+ Add resource</button></div>`;
}
function setupPlanningModePicker(item = {}, children = [], groupingMode = 'forms') {
  const label = groupingMode === 'grades' ? 'Grades / levels' : 'Forms';
  const groupOptions = setupGroupOptions(children, groupingMode);
  const selected = Array.isArray(item.formLabels)
    ? item.formLabels
    : String(item.formLabels || item.formLabel || '').split(',');
  const selectedGroups = [...new Set(selected.map((value) => String(value || '').trim()).filter(Boolean))];
  const familyBased = (item.planningMode || 'family') !== 'forms' || !selectedGroups.length;
  const summary = familyBased
    ? 'Family-Based'
    : `${groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based'}: ${selectedGroups.join(', ')}`;
  return `<details class="learn-day-picker learn-planning-mode-picker" data-planning-group-label="${html(groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based')}"><summary><span>Planning Mode</span><strong data-planning-mode-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${groupOptions.map((option) => `<label><input type="checkbox" data-planning-form-choice value="${html(option)}" ${selectedGroups.includes(option) ? 'checked' : ''}>${html(option)}</label>`).join('')}</div><input type="hidden" name="planningMode" value="${familyBased ? 'family' : 'forms'}"><input type="hidden" name="formLabel" value="${html(selectedGroups[0] || '')}"><input type="hidden" name="formLabels" value="${html(selectedGroups.join(','))}"><input type="hidden" name="gradeLabel" value="${html(groupingMode === 'grades' ? selectedGroups[0] || '' : item.gradeLabel || '')}"></details>`;
}
function setupColorSelect(label, name, value = colorChoices[0]) {
  const resolved = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : colorChoices[0];
  return `<label class="learn-color-field" style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<span style="display:flex;gap:8px;align-items:center;"><input name="${html(name)}" type="color" value="${html(resolved)}" list="learnColorChoices" style="width:44px;height:40px;flex:0 0 auto;border:1px solid var(--line);border-radius:9px;padding:3px;background:var(--paper2);"><input name="${html(name)}Hex" type="text" value="${html(resolved)}" pattern="#[0-9A-Fa-f]{6}" style="min-width:0;flex:1;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);"><span data-color-preview style="width:34px;height:34px;border-radius:50%;background:${html(resolved)};border:1px solid var(--goldsoft);"></span></span><datalist id="learnColorChoices">${colorChoices.map((color) => `<option value="${html(color)}"></option>`).join('')}</datalist></label>`;
}
function setupChildColor(value = colorChoices[0]) {
  const resolved = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : colorChoices[0];
  return `<label class="learn-child-color-field"><span>Color</span><input name="color" type="color" value="${html(resolved)}" list="learnColorChoices" aria-label="Planner color"><datalist id="learnColorChoices">${colorChoices.map((color) => `<option value="${html(color)}"></option>`).join('')}</datalist></label>`;
}
function childSetupRow(child = {}, groupingMode = 'forms') {
  const groupingField =
    groupingMode === 'forms'
      ? setupSelect('Form', 'formLabel', child.formLabel || child.form || '', formOptions)
      : `<input type="hidden" name="formLabel" value="${html(child.formLabel || child.form || '')}" />`;
  return `<div data-setup-row="children" data-id="${html(child.id || '')}" class="learn-family-row learn-child-row"><span class="learn-child-monogram" style="background:${html(child.color || colorChoices[0])};">${html((child.firstName || child.name || 'C').charAt(0))}</span>${setupInput('Child name', 'firstName', child.firstName || child.name || '')}${setupInput('Age', 'ageYears', child.age || '', { type: 'number' })}${setupInput('Grade / level', 'gradeLabel', child.gradeLabel || child.grade || '')}${groupingField}${setupChildColor(child.color || colorChoices[0])}${setupRemoveButton()}</div>`;
}
function subjectSetupRow(
  subject = {},
  children = [],
  terms = [],
  currentTermId = '',
  groupingMode = 'forms',
  tileMinutes = ''
) {
  const minutes = subject.minutes || tileMinutes || '20';
  return `<div data-setup-row="subjects" data-id="${html(subject.id || '')}" class="learn-setup-row learn-setup-row-subject"><div class="learn-setup-row-main"><div class="learn-setup-row-identity">${setupInput('Subject / skill', 'title', subject.title || '')}${setupSelect('Schedule type', 'weeklyFrequency', subject.weeklyFrequency === '1x' ? 'weekly' : subject.weeklyFrequency || subject.cadenceLabel || 'daily', simpleScheduleOptions)}${setupRemoveButton()}</div>${setupResourceList(subject.resources?.length ? subject.resources : subject.resource ? [{ title: subject.resource, scheduledWeeks: [] }] : [], children, groupingMode, subject)}<input type="hidden" name="minutes" value="${html(minutes)}" /><input type="hidden" name="subjectType" value="${html(subject.subjectType || subject.type || 'custom')}" /><input type="hidden" name="instructionMode" value="${html(subject.instructionMode || 'parent-led')}" /><input type="hidden" name="resourceType" value="${html(subject.resourceType || subject.sourceType || (subject.resource ? 'curriculum' : 'none'))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(subject.progressionType || 'lessons')}" /><input type="hidden" name="priorityLevel" value="${html(subject.priorityLevel || 'important')}" /></div><div class="learn-setup-row-meta">${setupSelect('Term', 'termId', subject.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('If missed', 'missedLessonBehavior', subject.missedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Credits', 'credits', subject.credits || '', { type: 'number', step: '0.25' })}${setupInput('Final mark', 'finalGradeOverride', subject.finalGradeOverride || '')}${setupColorSelect('Planner Color', 'color', subject.color || colorChoices[0])}${setupGraceModeBehavior(subject.gracePriority || 'core')}<span class="learn-setup-grace-note">${setupInput('Grace Mode note', 'graceNote', subject.graceNote || 'Deferred gracefully to the reserve list.')}</span></div></div>`;
}
function bookSetupRow(book = {}, terms = [], currentTermId = '') {
  return `<div data-setup-row="books" data-id="${html(book.id || '')}" style="display:grid;grid-template-columns:1.1fr .9fr .7fr .75fr .55fr .55fr .55fr .75fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Title', 'title', book.title || '')}${setupInput('Author', 'author', book.author || '')}${setupInput('Category', 'category', book.category || '')}${setupSelect('Planning Mode', 'planningMode', book.planningMode || (book.formLabel ? 'forms' : 'family'), planningModeOptions)}${setupInput('Start Ch.', 'startChapter', book.startChapter || '', { type: 'number' })}${setupInput('Done Ch.', 'currentChapter', book.currentChapter || book.startChapter || '', { type: 'number' })}${setupInput('End Ch.', 'endChapter', book.endChapter || book.totalChapters || '', { type: 'number' })}${setupColorSelect('Planner Color', 'color', book.color || colorChoices[2])}${setupRemoveButton()}<div style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;">${setupSelect('Term', 'termId', book.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('Form', 'formLabel', book.formLabel || '', [{ value: '', label: 'All Forms' }, ...formOptions])}${setupSelect('Frequency', 'weeklyFrequency', book.weeklyFrequency || 'daily', weeklyFrequencyOptions)}${setupTermWeekPicker(book.scheduledWeeks)}${setupSelect('Audience', 'audienceLabel', book.audienceLabel || 'Household', ['Household', 'Morning Basket', 'Independent', 'Read-Aloud'])}${setupInput('Minutes', 'minutes', book.minutes || '20', { type: 'number' })}${setupInput('Grace Note', 'graceNote', book.graceNote || 'Reading moved into the reserve basket.')}</div></div>`;
}
function formationSetupRow(material = {}, terms = [], currentTermId = '') {
  return `<div data-setup-row="formationMaterials" data-id="${html(material.id || '')}" style="display:grid;grid-template-columns:1.1fr .75fr 1fr .75fr .65fr .75fr .8fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Material', 'title', material.title || '')}${setupSelect('Preset', 'materialType', material.materialType || 'Catechesis', ['Catechesis', 'Art Study', 'Poetry', 'Music Study'])}${setupInput('Source', 'source', material.source || '')}${setupSelect('Planning Mode', 'planningMode', material.planningMode || 'family', planningModeOptions)}${setupSelect('Frequency', 'weeklyFrequency', material.weeklyFrequency || material.cadence || '1x', weeklyFrequencyOptions)}${setupTermWeekPicker(material.scheduledWeeks)}${setupSelect('Term', 'termId', material.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupInput('Minutes', 'minutes', material.minutes || '', { type: 'number' })}${setupColorSelect('Term Color', 'color', material.color || colorChoices[3])}${setupRemoveButton()}</div>`;
}
function formationRhythmSetupRow(rhythm = {}) {
  return `<div data-setup-row="formationRhythms" data-id="${html(rhythm.id || '')}" style="display:grid;grid-template-columns:1fr 1.15fr .65fr .45fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Rhythm', 'title', rhythm.title || '')}${setupInput('Note', 'note', rhythm.note || '')}${setupSelect('Frequency', 'weeklyFrequency', rhythm.weeklyFrequency || rhythm.cadenceLabel || rhythm.cadence || 'daily', weeklyFrequencyOptions)}${setupInput('Minutes', 'minutes', rhythm.minutes || rhythm.minutesPlanned || '', { type: 'number' })}${setupRemoveButton()}</div>`;
}
function formationRecitationSetupRow(track = {}, children = [], groupingMode = 'forms') {
  return `<div data-setup-row="formationRecitation" data-id="${html(track.id || '')}" style="display:grid;grid-template-columns:1fr .85fr .95fr .65fr .85fr .55fr auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;">${setupInput('Memory Work', 'title', track.title || '')}${setupInput('Source', 'sourceKind', track.sourceKind || track.source || '')}${setupPlanningModePicker(track, children, groupingMode)}${setupSelect('Frequency', 'weeklyFrequency', track.weeklyFrequency || 'daily', weeklyFrequencyOptions)}${setupTermWeekPicker(track.scheduledWeeks)}${setupInput('Minutes', 'minutes', track.minutes || '', { type: 'number' })}${setupRemoveButton()}</div>`;
}
function formationEnrichmentSetupRow(
  block = {},
  children = [],
  terms = [],
  currentTermId = '',
  groupingMode = 'forms',
  tileMinutes = ''
) {
  const blockTypeOptions = learnExperience().tefaActive
    ? [
        'Recitation & Memory Work',
        'Art Study',
        'Music Study',
        'Folk Songs',
        'Poetry',
        'Shakespeare',
        'Nature Study',
        'Composer',
        'Timeline',
      ]
    : [
        'Catechesis',
        'Recitation & Memory Work',
        'Saints & Feasts',
        'Icon Study',
        'Hymn Study',
        'Art Study',
        'Music Study',
        'Folk Songs',
        'Poetry',
        'Shakespeare',
        'Nature Study',
        'Composer',
        'Timeline',
      ];
  const minutes = block.minutesPlanned || block.minutes || tileMinutes || '20';
  const resourceEntries =
    Array.isArray(block.resources) && block.resources.length
      ? block.resources
      : block.resource || block.source || block.title
        ? [
            {
              title: block.resource || block.source || block.title,
              scheduledWeeks: block.scheduledWeeks || [],
              weeklyPlans: block.weeklyPlans || [],
              planningMode: block.planningMode || 'forms',
              formLabel: block.formLabel || '',
              formLabels: block.formLabels || [],
              gradeLabel: block.gradeLabel || '',
              childIds: block.childIds || (block.childId ? [block.childId] : []),
            },
          ]
        : [];
  return `<div data-setup-row="formationEnrichment" data-id="${html(block.id || '')}" class="learn-setup-row learn-setup-row-enrichment"><div class="learn-setup-row-main"><div class="learn-setup-row-identity">${setupSelect('Formation card', 'blockType', block.blockType || block.type || 'Art Study', blockTypeOptions)}${setupSelect('Schedule type', 'weeklyFrequency', block.weeklyFrequency === '1x' ? 'weekly' : block.weeklyFrequency || block.cadenceLabel || block.cadence || 'weekly', simpleScheduleOptions)}${setupRemoveButton()}</div>${setupResourceList(resourceEntries, children, groupingMode, block)}<input type="hidden" name="minutesPlanned" value="${html(minutes)}" /><input type="hidden" name="instructionMode" value="${html(block.instructionMode || 'shared')}" /><input type="hidden" name="resourceType" value="${html(block.resourceType || block.sourceType || (resourceEntries.length ? 'curriculum' : 'none'))}" /><input type="hidden" name="schedulingMode" value="fixed" /><input type="hidden" name="progressionType" value="${html(block.progressionType || 'lessons')}" /><input type="hidden" name="priorityLevel" value="${html(block.priorityLevel || 'enrichment')}" /></div><div class="learn-setup-row-meta">${setupSelect('Term', 'termId', block.termId || currentTermId, setupTermOptions(terms, { id: currentTermId, label: 'Current Term' }))}${setupSelect('If missed', 'missedLessonBehavior', block.missedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Credits', 'credits', block.credits || '', { type: 'number', step: '0.25' })}${setupInput('Final mark', 'finalGradeOverride', block.finalGradeOverride || '')}${setupColorSelect('Planner Color', 'color', block.color || colorChoices[2])}${setupGraceModeBehavior(block.gracePriority || 'medium')}<span class="learn-setup-grace-note">${setupInput('Grace Mode note', 'graceNote', block.graceNote || 'Deferred gracefully to the reserve list.')}</span></div></div>`;
}
const US_FEDERAL_HOLIDAY_CACHE = /* @__PURE__ */ new Map();
const formOptions = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];
const graceModeOptions = [
  { value: 'core', label: '1 Core: chosen first in every mode' },
  { value: 'high', label: '2 High: keep after Core' },
  { value: 'medium', label: '3 Medium: keep if the cap has room' },
  { value: 'low', label: '4 Low: first moved to reserve' },
];
const missedLessonOptions = [
  { value: 'next-school-day', label: 'Move to next school day' },
  { value: 'next-occurrence', label: 'Move to next scheduled occurrence' },
  { value: 'end-of-term', label: 'Add to end of term' },
  { value: 'leave-incomplete', label: 'Leave incomplete' },
  { value: 'skip', label: 'Skip automatically' },
  { value: 'ask', label: 'Ask each time' },
];
const planningModeOptions = planningModeOptionsFor('forms');
const weeklyFrequencyOptions = [
  { value: 'daily', label: 'Daily' },
  { value: '4x', label: '4x / week' },
  { value: '3x', label: '3x / week' },
  { value: '2x', label: '2x / week' },
  { value: '1x', label: '1x / week' },
  { value: 'as-needed', label: 'As needed' },
];
const simpleScheduleOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];
const DEFAULT_TERM_WEEK_COUNT = 12;
const colorChoices = [
  '#14294a',
  '#6e2f2a',
  '#4a5a31',
  '#b5942f',
  '#4b3158',
  '#34507a',
  '#7f3f2a',
  '#2f5f5b',
  '#7b496f',
  '#8a6a2f',
  '#3f4f73',
  '#9a3f45',
];
export {
  DEFAULT_TERM_WEEK_COUNT,
  attendanceStatusLabel,
  attendanceStatusMark,
  bookSetupRow,
  childSetupRow,
  colorChoices,
  emptyState,
  formOptions,
  formationEnrichmentSetupRow,
  formationRecitationSetupRow,
  formationRhythmSetupRow,
  formationSetupRow,
  html,
  isOdysseyLearnContext,
  learnExperience,
  missedLessonOptions,
  panel,
  primaryResourceGroupLabel,
  renderAttendanceTracker,
  renderPlannerTerm,
  renderPlannerYear,
  resourceFieldName,
  scheduledTermWeeks,
  selectedTermWeeks,
  setupInput,
  setupRemoveButton,
  setupResourceRow,
  setupSelect,
  setupTermOptions,
  softColor,
  subjectSetupRow,
  termSetupRow,
  termWeekSummary,
  termWeekSummaryFromSelected,
};
