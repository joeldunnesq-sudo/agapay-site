import type { LearnShellNode, LearnShellOptions, LearnPlannerVm, LearnGradesVm } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell-setup-calendar.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearnSetup1<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const US_FEDERAL_HOLIDAY_CACHE: LearnShellBindings['US_FEDERAL_HOLIDAY_CACHE'];
declare const graceModeOptions: LearnShellBindings['graceModeOptions'];
declare const formOptions: LearnShellBindings['formOptions'];
declare const DEFAULT_TERM_WEEK_COUNT: LearnShellBindings['DEFAULT_TERM_WEEK_COUNT'];

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
  // tefaActive drives PRESENTATION ONLY (labels, nav order, copy). It never
  // changes which account, routes, or activation status the person has —
  // those stay tied to `odyssey` regardless of the toggle below.
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
    navOrder: null as string[] | null,
  };
}

function html(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function panel(title: unknown, content: string, options: LearnShellOptions = {}) {
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

function emptyState(label: string) {
  return `<div style="padding:18px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-style:italic;background:rgba(255,255,255,.22);">${html(label)}</div>`;
}

function softColor(color: string | undefined, alpha: string | number = '22') {
  const value = String(color || '#b5942f').trim();
  return value.startsWith('#') && value.length === 7 ? `${value}${alpha}` : 'var(--paper2)';
}

function renderPlannerTerm(vm: LearnPlannerVm) {
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

function renderPlannerYear(vm: LearnPlannerVm) {
  // ── Term timeline ─────────────────────────────────────────────────────────────
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

  // ── Season topics by type ─────────────────────────────────────────────────────
  const topicsByType = vm.year.topics.reduce((map, topic) => {
    const key = topic.type || 'Enrichment';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(topic);
    return map;
  }, new Map<string, LearnShellNode[]>());

  const topicsGrid = topicsByType.size
    ? Array.from(topicsByType.entries())
        .map(
          ([type, topics]) => `
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">${html(type)}</div>
          ${topics
            .map(
              (topic: LearnShellNode) => `
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

  // ── Curriculum packages ───────────────────────────────────────────────────────
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

  // ── Upcoming feasts ───────────────────────────────────────────────────────────
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

function attendanceDateLabel(date: string = '') {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: 'Day', short: date };
  return {
    day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(parsed),
    short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed),
  };
}

function attendanceStatusLabel(status: string = 'present') {
  return (
    {
      present: 'Present',
      absent: 'Absent',
      excused: 'Excused',
      holiday: 'Holiday',
    }[status] || 'Present'
  );
}

function attendanceStatusMark(status: string = 'present') {
  return (
    {
      present: 'P',
      absent: 'A',
      excused: 'E',
      holiday: 'H',
    }[status] || 'P'
  );
}

function isoDateFromUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcHolidayDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 12));
}

function addHoliday(map: Map<string, string>, date: Date, name: string) {
  map.set(isoDateFromUTC(date), name);
}

function addObservedFixedHoliday(
  map: Map<string, string>,
  year: number,
  monthIndex: number,
  day: number,
  name: string
) {
  const actual = utcHolidayDate(year, monthIndex, day);
  const observed = utcHolidayDate(year, monthIndex, day);
  const weekday = actual.getUTCDay();
  if (weekday === 6) observed.setUTCDate(observed.getUTCDate() - 1);
  if (weekday === 0) observed.setUTCDate(observed.getUTCDate() + 1);
  addHoliday(map, observed, name);
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, nth: number) {
  const date = utcHolidayDate(year, monthIndex, 1);
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (nth - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number) {
  const date = utcHolidayDate(year, monthIndex + 1, 0);
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function usFederalHolidayMap(year: number) {
  if (US_FEDERAL_HOLIDAY_CACHE.has(year)) return US_FEDERAL_HOLIDAY_CACHE.get(year);
  const holidays = new Map<string, string>();
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

function nationalHolidayForDate(date: string = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const year = Number(date.slice(0, 4));
  return (
    [year - 1, year, year + 1].map((candidateYear) => usFederalHolidayMap(candidateYear)!.get(date)).find(Boolean) || ''
  );
}

function renderAttendanceTracker(vm: LearnGradesVm) {
  const dates = vm.attendance.weekDates.length ? vm.attendance.weekDates : [];
  const byKey = new Map(
    vm.attendance.entries.map((entry: LearnShellNode) => [`${entry.childId}::${entry.date}`, entry])
  );
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

function setupInput(label: string, name: string, value: unknown = '', options: LearnShellOptions = {}) {
  const type = options.type || 'text';
  const step = options.step ? ` step="${html(options.step)}"` : '';
  const placeholder = options.placeholder ? ` placeholder="${html(options.placeholder)}"` : '';
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<input name="${html(name)}" type="${html(type)}"${step}${placeholder} value="${html(value)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);" /></label>`;
}

function setupSelect(
  label: string,
  name: string,
  value: unknown,
  options: (string | { value?: unknown; label?: unknown })[]
) {
  return `<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">${html(label)}<select name="${html(name)}" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);">${options
    .map((option) => {
      const optionValue = typeof option === 'object' && option !== null && 'value' in option ? option.value : option;
      const optionLabel = typeof option === 'object' && option !== null && 'label' in option ? option.label : option;
      return `<option value="${html(optionValue)}" ${optionValue === value ? 'selected' : ''}>${html(optionLabel)}</option>`;
    })
    .join('')}</select></label>`;
}

function setupTermOptions(terms: LearnShellNode[] = [], fallbackTerm: LearnShellNode = {}) {
  const source = terms.length ? terms : [fallbackTerm];
  return source.map((term, index) => ({
    value: term.id || `term_${index + 1}`,
    label: term.label || `Term ${index + 1}`,
  }));
}

function termSetupRow(term: LearnShellNode = {}, index: number = 0) {
  const termId = term.id || `term_${index + 1}`;
  return `<div data-setup-row="terms" data-id="${html(termId)}" style="display:grid;grid-template-columns:1fr .7fr .7fr .55fr auto auto;gap:10px;align-items:end;border:1px solid var(--line);border-radius:12px;background:var(--paper2);padding:12px;"><input type="hidden" name="id" value="${html(termId)}" />${setupInput('Term name', 'label', term.label || `Term ${index + 1}`)}${setupInput('Start', 'startDate', term.startDate || '', { type: 'date' })}${setupInput('End', 'endDate', term.endDate || '', { type: 'date' })}${setupInput('Weeks', 'weeksCount', term.weeksCount || 12, { type: 'number' })}<button type="button" data-close-term="${html(termId)}" style="align-self:end;border:1px solid var(--gold);background:#fbf2dd;color:var(--ink);border-radius:9px;padding:10px 12px;font-family:inherit;font-weight:700;">Close Term</button>${setupRemoveButton()}<label style="grid-column:1 / -1;display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Term description — cycle, focus, or notes<textarea name="description" rows="2" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);resize:vertical;font-size:13px;">${html(term.description || '')}</textarea></label></div>`;
}

function setupRemoveButton() {
  return `<button type="button" data-setup-remove-row aria-label="Remove row" style="align-self:end;border:1px solid var(--line);background:var(--paper);color:var(--burgundy);border-radius:9px;padding:10px 12px;font-family:inherit;">Remove</button>`;
}

function setupGracePriorityValue(value: unknown = 'core') {
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

function setupGraceModeBehavior(value: unknown = 'core') {
  return `<span class="learn-grace-behavior-field">${setupSelect('Grace priority', 'gracePriority', setupGracePriorityValue(value), graceModeOptions)}<small>Full runs all scheduled work. Medium keeps up to 4 ranked child subjects per day. Light keeps up to 2 and turns kept work into short touchpoints.</small></span>`;
}

function planningModeOptionsFor(groupingMode: string = 'forms') {
  return [
    { value: 'family', label: 'Family-Based' },
    { value: 'forms', label: groupingMode === 'grades' ? 'Grade-Based' : 'Forms-Based' },
  ];
}

function setupGroupOptions(children: LearnShellNode[] = [], groupingMode: string = 'forms') {
  const values =
    groupingMode === 'grades'
      ? children.map((child) => child.gradeLabel || child.grade)
      : children.map((child) => child.formLabel || child.form);
  const unique = [
    ...new Set(values.map((value) => String(value || '').trim()).filter((value) => value && value !== 'Form V')),
  ];
  return groupingMode === 'grades' ? unique : [...new Set([...formOptions, ...unique])];
}

function activeSetupGroupLabels(
  children: LearnShellNode[] = [],
  groupingMode: string = 'forms',
  resources: LearnShellNode[] = []
) {
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
  const labels = [...new Set([...childLabels, ...resourceLabels, ...fallback])];
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

function primaryResourceGroupLabel(resource: LearnShellNode = {}, groupingMode: string = 'forms') {
  const labels = Array.isArray(resource.formLabels)
    ? resource.formLabels.map((value) => String(value || '').trim()).filter(truthyLearnSetup1)
    : String(resource.formLabels || resource.formLabel || '')
        .split(',')
        .map((value) => value.trim())
        .filter(truthyLearnSetup1);
  if (labels.length) return labels[0];
  if (groupingMode === 'grades' && resource.gradeLabel) return String(resource.gradeLabel).trim();
  return '';
}

function scheduledTermWeeks(value: unknown, totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? (value as (string | number)[]) : String(value || '').split(',');
  const selected = direct
    .map((week) => Number.parseInt(week as string, 10))
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks);
  return selected.length
    ? [...new Set(selected)].sort((a, b) => a - b)
    : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}

function selectedTermWeeks(value: unknown, totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
  const direct = Array.isArray(value) ? (value as (string | number)[]) : String(value || '').split(',');
  return [
    ...new Set(
      direct
        .map((week) => Number.parseInt(week as string, 10))
        .filter((week) => Number.isInteger(week) && week >= 1 && week <= totalWeeks)
    ),
  ].sort((a, b) => a - b);
}

function termWeekSummaryFromSelected(selected: number[] = [], totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
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

function termWeekSummary(weeks: unknown = [], totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
  return termWeekSummaryFromSelected(scheduledTermWeeks(weeks, totalWeeks), totalWeeks);
}

function setupTermWeekPicker(value: unknown, totalWeeks: number = DEFAULT_TERM_WEEK_COUNT) {
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
export type LearnShell0Part0 = {
  isOdysseyLearnContext: typeof isOdysseyLearnContext;
  learnViewMode: typeof learnViewMode;
  learnExperience: typeof learnExperience;
  html: typeof html;
  panel: typeof panel;
  emptyState: typeof emptyState;
  softColor: typeof softColor;
  renderPlannerTerm: typeof renderPlannerTerm;
  renderPlannerYear: typeof renderPlannerYear;
  attendanceDateLabel: typeof attendanceDateLabel;
  attendanceStatusLabel: typeof attendanceStatusLabel;
  attendanceStatusMark: typeof attendanceStatusMark;
  isoDateFromUTC: typeof isoDateFromUTC;
  utcHolidayDate: typeof utcHolidayDate;
  addHoliday: typeof addHoliday;
  addObservedFixedHoliday: typeof addObservedFixedHoliday;
  nthWeekdayOfMonth: typeof nthWeekdayOfMonth;
  lastWeekdayOfMonth: typeof lastWeekdayOfMonth;
  usFederalHolidayMap: typeof usFederalHolidayMap;
  nationalHolidayForDate: typeof nationalHolidayForDate;
  renderAttendanceTracker: typeof renderAttendanceTracker;
  setupInput: typeof setupInput;
  setupSelect: typeof setupSelect;
  setupTermOptions: typeof setupTermOptions;
  termSetupRow: typeof termSetupRow;
  setupRemoveButton: typeof setupRemoveButton;
  setupGracePriorityValue: typeof setupGracePriorityValue;
  setupGraceModeBehavior: typeof setupGraceModeBehavior;
  planningModeOptionsFor: typeof planningModeOptionsFor;
  setupGroupOptions: typeof setupGroupOptions;
  activeSetupGroupLabels: typeof activeSetupGroupLabels;
  primaryResourceGroupLabel: typeof primaryResourceGroupLabel;
  scheduledTermWeeks: typeof scheduledTermWeeks;
  selectedTermWeeks: typeof selectedTermWeeks;
  termWeekSummaryFromSelected: typeof termWeekSummaryFromSelected;
  termWeekSummary: typeof termWeekSummary;
  setupTermWeekPicker: typeof setupTermWeekPicker;
};
