import type {
  LearnMonthFeast,
  LearnFamilyPlannerInput,
  LearnShellNode,
  LearnPlannerVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearn4<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const seedFamilyPrototypeState: LearnShellBindings['seedFamilyPrototypeState'];
declare const plannerScopeFromQuery: LearnShellBindings['plannerScopeFromQuery'];
declare const mealToolFromQuery: LearnShellBindings['mealToolFromQuery'];
declare const shell: LearnShellBindings['shell'];
declare const PLANNER_STATUS_META: LearnShellBindings['PLANNER_STATUS_META'];
declare const bar: LearnShellBindings['bar'];
declare const designedAssignmentsForDate: LearnShellBindings['designedAssignmentsForDate'];
declare const renderDesignedLessonList: LearnShellBindings['renderDesignedLessonList'];
declare const eventsForDate: LearnShellBindings['eventsForDate'];
declare const timeLabel: LearnShellBindings['timeLabel'];
declare const familyPlanningSetupPanel: LearnShellBindings['familyPlanningSetupPanel'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const renderPlannerTerm: LearnShellBindings['renderPlannerTerm'];
declare const renderPlannerYear: LearnShellBindings['renderPlannerYear'];
declare const softColor: LearnShellBindings['softColor'];
declare const panel: LearnShellBindings['panel'];
declare const marketingPreviewActive: LearnShellBindings['marketingPreviewActive'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const plannerHref: LearnShellBindings['plannerHref'];
declare const expandFamilyEvents: LearnShellBindings['expandFamilyEvents'];
declare const plannerDayLabel: LearnShellBindings['plannerDayLabel'];
declare const renderPlannerMonth: LearnShellBindings['renderPlannerMonth'];
declare const renderFamilyPlannerScope: LearnShellBindings['renderFamilyPlannerScope'];
declare const renderWeeklyAssignmentBoard: LearnShellBindings['renderWeeklyAssignmentBoard'];
declare const plannerDates: LearnShellBindings['plannerDates'];
declare const familyEventSetupRow: LearnShellBindings['familyEventSetupRow'];
declare const choreSetupRow: LearnShellBindings['choreSetupRow'];
declare const recipeSetupRow: LearnShellBindings['recipeSetupRow'];
declare const grocerySetupRow: LearnShellBindings['grocerySetupRow'];
declare const prototypeWeekDateMap: LearnShellBindings['prototypeWeekDateMap'];
declare const familyPlannerModel: LearnShellBindings['familyPlannerModel'];
declare const isImportantPlannerFeast: LearnShellBindings['isImportantPlannerFeast'];

function renderPlanner(vm: LearnPlannerVm) {
  if (!marketingPreviewActive()) seedFamilyPrototypeState(vm);
  const query = new URLSearchParams(window.location.search);
  const activeScope = plannerScopeFromQuery();
  const mealTool = mealToolFromQuery();
  const scopeAllowsTerm = activeScope === 'lessons';
  const viewSet = scopeAllowsTerm ? ['day', 'week', 'month', 'term', 'year'] : ['day', 'week', 'month'];
  const displayView = viewSet.includes(vm.activeView) ? vm.activeView : 'week';
  if (!scopeAllowsTerm && vm.activeView !== displayView) {
    window.history.replaceState(null, '', plannerHref({ view: displayView, term: null, termId: null }));
  }
  const viewTabs = viewSet.map((view) => ({
    id: view,
    label: view.charAt(0).toUpperCase() + view.slice(1),
    href: plannerHref(scopeAllowsTerm ? { view } : { view, term: null, termId: null }),
    active: displayView === view,
  }));
  const familyTabs = [
    { id: 'lessons', label: 'Lessons', icon: '▦' },
    { id: 'meals', label: 'Meals', icon: '♨' },
    { id: 'chores', label: 'Chores', icon: '✓' },
    { id: 'events', label: 'Events', icon: '◷' },
  ];
  const mealTools = [
    { id: 'plan', label: 'Plan', icon: '▦' },
    { id: 'recipes', label: 'Recipes', icon: '☰' },
    { id: 'groceries', label: 'Groceries', icon: '▤' },
    { id: 'pantry', label: 'Pantry', icon: '☖' },
  ];

  // ── Intro — shown on first visit per scope, dismissible ───────────────────────
  const introDismissedKey = `agapay.learn.plannerIntro.${activeScope}`;
  const introDismissed = typeof localStorage !== 'undefined' && localStorage.getItem(introDismissedKey) === '1';
  const introHtml = introDismissed
    ? ''
    : `
    ${renderFamilyPlannerIntro(vm, activeScope === 'meals' && mealTool !== 'plan' ? mealTool : activeScope)}
    <div style="margin-top:-8px;display:flex;justify-content:flex-end;">
      <button type="button" data-planner-intro-dismiss="${introDismissedKey}"
        style="border:0;background:none;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;padding:4px 0;">
        Hide this — I know what this page does
      </button>
    </div>`;

  const controls = `
    <div class="learn-family-toolbar">
      <div class="learn-family-tabs" aria-label="Planner view">
        ${viewTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? 'page' : 'false'}">${html(tab.label)}</a>`).join('')}
      </div>
      <div class="learn-family-tabs learn-family-tabs-wide" aria-label="Planner layer">
        ${familyTabs
          .map((tab) => {
            const nextScopeAllowsTerm = tab.id === 'lessons';
            return `<a href="${plannerHref({
              scope: tab.id,
              tool: tab.id === 'meals' ? mealTool : null,
              view: nextScopeAllowsTerm
                ? displayView
                : ['day', 'week', 'month'].includes(displayView)
                  ? displayView
                  : 'week',
              term: nextScopeAllowsTerm ? query.get('term') : null,
              termId: nextScopeAllowsTerm ? query.get('termId') : null,
            })}" aria-current="${activeScope === tab.id ? 'page' : 'false'}"><span>${html(tab.icon)}</span>${html(tab.label)}</a>`;
          })
          .join('')}
      </div>
      <div class="learn-family-range">
        <strong>${html(displayView === 'month' ? vm.month.label : vm.week.label)}</strong>
        <span>${html(vm.week.seasonLabel || 'Household rhythm')}</span>
      </div>
      ${scopeAllowsTerm && displayView !== 'year' ? `<div class="learn-family-tabs learn-family-term-tabs" aria-label="Planner term">${vm.termTabs.map((tab) => `<a href="${tab.href}" aria-current="${tab.active ? 'page' : 'false'}">${html(tab.label)}</a>`).join('')}</div>` : ''}
      ${!scopeAllowsTerm ? `<span class="learn-family-lock">Meals, chores, and events use day, week, and month views.</span>` : ''}
    </div>
    ${
      activeScope === 'meals'
        ? `<div class="learn-family-meal-tools" aria-label="Meal tools">
      ${mealTools.map((tool) => `<a href="${plannerHref({ scope: 'meals', tool: tool.id, view: displayView, term: null, termId: null })}" aria-current="${mealTool === tool.id ? 'page' : 'false'}"><span>${html(tool.icon)}</span>${html(tool.label)}</a>`).join('')}
    </div>`
        : ''
    }
  `;

  const lessonContent =
    displayView === 'day'
      ? renderPlannerDay(vm)
      : displayView === 'month'
        ? renderPlannerMonth(vm)
        : displayView === 'term'
          ? renderPlannerTerm(vm)
          : displayView === 'year'
            ? renderPlannerYear(vm)
            : renderPlannerWeek(vm);
  const scopedContent =
    activeScope === 'lessons'
      ? `${lessonContent}${renderPlannerReserveCard(vm)}`
      : renderFamilyPlannerScope(vm, activeScope, displayView, mealTool);

  const body = `
    <section data-screen-label="Family Planner" class="learn-family-page">
      ${introHtml}
      ${controls}
      ${scopedContent}
    </section>
  `;
  return shell(vm, body);
}

function plannerStatusMeta(status: string) {
  const normalized = String(status || 'planned').toLowerCase();
  return (
    learnOwnValue4(PLANNER_STATUS_META, normalized) || {
      label: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Planned',
      note: '',
    }
  );
}

function statusPill(status: string) {
  const normalized = String(status || '').toLowerCase();
  const color =
    normalized === 'completed'
      ? 'var(--navy)'
      : normalized === 'deferred'
        ? 'var(--gold)'
        : normalized === 'reserve'
          ? 'var(--muted)'
          : normalized === 'reduced'
            ? 'var(--gold)'
            : 'var(--muted)';
  const meta = plannerStatusMeta(status);
  return `<span title="${html(meta.note)}" style="border:1px solid ${color};color:${color};border-radius:999px;padding:2px 8px;font-size:11px;">${html(meta.label)}</span>`;
}

function renderPlannerReserveCard(vm: LearnPlannerVm) {
  const items = vm.term?.graceReserve || [];
  const currentMode = vm.term?.graceMode?.rule?.mode || vm.graceMode?.mode || '';
  const body = items.length
    ? `<div class="learn-reserve-grid">${items.map((item) => `<article style="border-color:${html(item.color)};background:${softColor(item.color, '18')};"><strong>${html(item.title)}</strong><small>${html(item.note || 'Saved in the reserve list for a roomier day.')}</small></article>`).join('')}</div>`
    : `<p class="learn-reserve-empty">No subjects are currently deferred into the reserve list.</p>`;
  return `
    <section class="learn-planner-reserve-card">
      <div class="learn-planner-reserve-head">
        <div>
          <small>GRACE RESERVE</small>
          <h2>Deferred Subjects</h2>
        </div>
        ${currentMode ? `<span>${html(currentMode)}</span>` : ''}
      </div>
      ${body}
    </section>
  `;
}

function gracePriorityBadge(priority: string) {
  if (!priority || priority === 'keep') {
    return `<span class="learn-grace-badge learn-grace-badge--keep" title="Grace Mode: always kept">✦ Keep</span>`;
  }
  if (priority === 'reduce first') {
    return `<span class="learn-grace-badge learn-grace-badge--reduce" title="Grace Mode: reduce minutes first">◐ Reduce</span>`;
  }
  // "bump if needed" / "defer if needed"
  return `<span class="learn-grace-badge learn-grace-badge--defer" title="Grace Mode: defer to reserve if needed">○ Defer</span>`;
}

function renderTermAtAGlance(vm: LearnPlannerVm) {
  const weekNum = vm.week.termWeekNumber || 0;
  const totalWeeks = vm.week.totalTermWeeks || 12;
  const percent = totalWeeks > 0 && weekNum > 0 ? Math.round((weekNum / totalWeeks) * 100) : 0;
  const hasDescription = Boolean(vm.term.description);

  if (hasDescription) {
    // Description mode: two-column — text left, week-dot track right
    const dots = Array.from({ length: totalWeeks }, (_, i) => {
      const w = i + 1;
      const isCurrent = w === weekNum;
      const isPast = w < weekNum;
      return `<span title="Week ${w}" style="display:inline-block;width:${isCurrent ? 12 : 8}px;height:${isCurrent ? 12 : 8}px;border-radius:50%;background:${isCurrent ? 'var(--gold)' : isPast ? 'rgba(181,148,47,.38)' : 'var(--line)'};${isCurrent ? 'box-shadow:0 0 0 3px rgba(181,148,47,.22);' : ''}vertical-align:middle;"></span>`;
    }).join('');
    return `
      <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;display:grid;grid-template-columns:1fr minmax(180px,.55fr);gap:22px;align-items:start;">
        <div>
          <div class="learn-eyebrow">Term at a Glance</div>
          <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;display:block;line-height:1.1;">${html(vm.term.label)}</strong>
          ${vm.term.dateRange ? `<div style="color:var(--muted);font-size:13px;margin:3px 0 10px;">${html(vm.term.dateRange)}</div>` : `<div style="margin-bottom:10px;"></div>`}
          <p style="margin:0;font-size:14px;line-height:1.6;color:var(--ink);">${html(vm.term.description)}</p>
        </div>
        <div style="padding-top:2px;">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.14em;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Week progress</div>
          ${weekNum && totalWeeks ? `<p style="margin:0 0 10px;font-size:13px;color:var(--muted);">Week ${weekNum} of ${totalWeeks}${vm.term.dateRange ? ` · ${html(vm.term.dateRange)}` : ''}</p>` : `<p style="margin:0 0 10px;font-size:13px;color:var(--muted);">Set term dates in Setup</p>`}
          <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">${dots}</div>
        </div>
      </section>
    `;
  }

  // Progress-bar mode (no description): matches renderTermProgressPanel style
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 22px;display:grid;grid-template-columns:minmax(200px,.75fr) 1fr;gap:22px;align-items:center;">
      <div>
        <div class="learn-eyebrow">Term at a Glance</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:26px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(vm.term.label || 'Current Term')}</h2>
        <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.4;">${weekNum && totalWeeks ? `Week ${weekNum} of ${totalWeeks}` : 'Set term dates in Setup'}${vm.term.dateRange ? ` · ${html(vm.term.dateRange)}` : ''}</p>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${percent}%</strong></div>
        ${bar(percent, 'var(--gold)')}
        <p style="margin:8px 0 0;font-size:12px;color:var(--muted);">Add a term description in Setup → Terms to show cycle and focus notes here.</p>
      </div>
    </section>
  `;
}

function renderPlannerWeek(vm: LearnPlannerVm) {
  return `
    ${renderWeeklyAssignmentBoard(vm)}
    <details class="learn-form-plan-summary">
      <summary><span><small>FORM PLANS</small><strong>Review generated group plans</strong></span><em>${vm.week.formRows.length} ${vm.week.formRows.length === 1 ? 'group' : 'groups'}</em></summary>
      <div>${
        vm.week.formRows.length
          ? vm.week.formRows
              .map(
                (form) =>
                  `<article><span style="background:${form.color};">${html(form.initials.slice(0, 2).join(''))}</span><div><strong>${html(form.formLabel)}</strong><small>${html(form.childNames.join(', '))}</small></div><p>${form.items
                    .slice(0, 4)
                    .map((item) => `<span>${html(item.title)}${item.sub ? ` · ${html(item.sub)}` : ''}</span>`)
                    .join(
                      ''
                    )}${form.items.length > 4 ? `<small>+ ${form.items.length - 4} more lessons</small>` : ''}</p></article>`
              )
              .join('')
          : emptyState('Add children and subjects in Setup to generate group plans.')
      }</div>
    </details>
  `;
}

// "Move unfinished work" — a small inline control shown only on a day's
// actually-unfinished (planned/reduced) blocks. Lets mom move a lesson to
// the next open day this week, or set it aside In Reserve, without manual
// rescheduling. See computeMoveUnfinishedWork() in
// src/learn/planner-overrides.js for the shared logic behind this.
function moveUnfinishedWorkControl(scope: string, rowId: string, weekday: string | number, status: string) {
  if (!rowId || (status !== 'planned' && status !== 'reduced')) return '';
  return `<div class="learn-move-unfinished" data-move-unfinished data-move-scope="${html(scope)}" data-move-row-id="${html(rowId)}" data-move-weekday="${weekday}" style="display:flex;gap:6px;justify-self:end;">
    <button type="button" data-move-mode="next-open-day" title="Move this to the next open day this week" style="border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:8px;padding:4px 8px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;">Move →</button>
    <button type="button" data-move-mode="reserve" title="Set this aside for a roomier day — no rush" style="border:1px solid var(--line);background:var(--paper);color:var(--muted);border-radius:8px;padding:4px 8px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;">Reserve</button>
  </div>`;
}

function renderPlannerDay(vm: LearnPlannerVm) {
  const day = vm.day.selected || {};
  const dayWeekday = Number.isInteger(vm.day.selectedIndex) ? vm.day.selectedIndex : 0;
  const dayLinks = vm.week.days
    .map(
      (item) =>
        `<a href="${html(learnSectionHref('planner', `view=day&date=${encodeURIComponent(item.date)}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}`))}" style="text-decoration:none;color:var(--ink);border:1px solid ${item.date === day.date ? 'var(--gold)' : 'var(--line)'};background:${item.date === day.date ? '#fbf2dd' : 'var(--paper)'};border-radius:10px;padding:10px;text-align:center;min-width:92px;"><strong style="display:block;color:${item.isSunday ? 'var(--burgundy)' : 'var(--gold)'};">${html(item.weekday)}</strong><small>${html(item.shortDate)}</small></a>`
    )
    .join('');
  const designedAssignments = designedAssignmentsForDate(vm, day.date);
  const household = designedAssignments.length
    ? renderDesignedLessonList(designedAssignments, '')
    : day.isSunday
      ? emptyState('Sunday is reserved for worship, rest, and family rhythm. No school blocks are scheduled.')
      : vm.day.householdBlocks.length
        ? vm.day.householdBlocks
            .map(
              (block) =>
                `<div style="display:grid;grid-template-columns:1fr 70px 100px auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span><strong>${html(block.title)}</strong><small style="display:block;color:var(--muted);">${html(block.sub)}</small></span><span>${html(block.minutes)}m</span>${statusPill(block.status)}${moveUnfinishedWorkControl('household', block.id, dayWeekday, block.status)}</div>`
            )
            .join('')
        : emptyState('Drag subjects into this day from the Week view, or add setup subjects for this week.');
  const forms = day.isSunday
    ? ''
    : vm.day.formBlocks
        .map(
          (form) =>
            `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:12px;display:grid;gap:10px;"><div style="display:flex;gap:10px;align-items:center;"><span style="width:34px;height:34px;border-radius:50%;background:${form.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(form.initials.slice(0, 2).join(''))}</span><span><strong>${html(form.formLabel)}</strong><small style="display:block;color:var(--muted);">${html(form.childNames.join(', '))}</small></span></div>${form.items.map((item) => `<div style="display:grid;grid-template-columns:1fr 60px 90px auto;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:8px;"><span><strong>${html(item.title)}</strong><small style="display:block;color:var(--muted);">${html(item.sub)}</small></span><span>${html(item.minutes)}m</span>${statusPill(item.status)}${moveUnfinishedWorkControl('child', item.id, dayWeekday, item.status)}</div>`).join('')}</div>`
        )
        .join('');
  const appointments = day.events || eventsForDate(vm, day.date);
  const appointmentPanel = appointments.length
    ? `<div style="display:grid;gap:9px;">${appointments.map((event) => `<div style="border:1px solid var(--line);border-radius:10px;background:var(--paper2);padding:10px 12px;"><strong>${html(event.title || 'Appointment')}</strong><small style="display:block;color:var(--muted);">${html([timeLabel(event.startTime), event.location, event.notes].filter(truthyLearn4).join(' · '))}</small></div>`).join('')}</div>`
    : emptyState('No appointments are scheduled for this day.');
  return `
    <div style="display:flex;gap:8px;overflow:auto;padding-bottom:2px;">${dayLinks}</div>
    <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start;">
      ${panel('Daily Plan', `<h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;margin:0;">${html(day.weekdayLong || day.weekday)} · ${html(day.shortDate || day.date)}</h2><p style="margin:6px 0 14px;color:var(--muted);">${html(day.feast)} · ${html(day.fasting)}</p>${household}`, { icon: day.isSunday ? '☩' : '▣' })}
      ${panel('Form Work', day.isSunday ? `<div style="color:var(--muted);line-height:1.45;">No Form work is scheduled on Sunday.</div>` : `<div style="display:grid;gap:10px;">${forms || emptyState('No Form blocks for this day.')}</div>`, { icon: '◎' })}
    </div>
    ${panel('Appointments', appointmentPanel, { icon: '◷' })}
    ${panel('Church Notes', `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;"><div><small style="color:var(--gold);letter-spacing:.12em;">EPISTLE</small><strong style="display:block;">${html(day.epistle || 'Set readings source')}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">GOSPEL</small><strong style="display:block;">${html(day.gospel || 'Set readings source')}</strong></div><div><small style="color:var(--gold);letter-spacing:.12em;">TONE</small><strong style="display:block;">${html(day.tone || 'Tone')}</strong></div></div>`, { icon: '✥' })}
  `;
}

function renderFamilyPlanningEditor(vm: LearnPlannerVm) {
  return `<form data-family-planning-form id="family-planner" style="display:grid;gap:12px;scroll-margin-top:110px;">${panel('Family Planner & Meals', familyPlanningSetupPanel({ familyPlanning: vm.familyPlanning, household: vm.familyPlanning!.household, children: vm.familyPlanning!.children }), { icon: '▣', largeTitle: true })}<div class="learn-family-planner-save"><span data-family-planning-status>Appointments, name days, meals, recipes, and groceries save independently from school setup.</span><button type="submit">Save Family Planner</button></div></form>`;
}

function renderFamilyPlannerIntro(vm: LearnPlannerVm, scope: string) {
  const tefa = learnExperience().tefaActive;
  const intros = {
    lessons: ['Family Planner', 'Lessons & Forms', 'Your school day, arranged by family work and Form work.', '▦'],
    meals: tefa
      ? [
          'Meal Planning',
          'A practical weekly menu',
          'Plan breakfast, lunch, and dinner beside lessons and family activities.',
          '♨',
        ]
      : [
          'Meal Planning',
          'Fast-aware weekly meals',
          'Plan breakfast, lunch, and dinner beside the Church calendar so fasting days and feast days shape the week naturally.',
          '♨',
        ],
    chores: tefa
      ? [
          'Household Chores',
          'Practical life for every child',
          'Keep a visible weekly rotation with age-appropriate responsibilities.',
          '✓',
        ]
      : [
          'Household Chores',
          'Practical life for every child',
          'Keep a visible weekly rotation with lighter expectations on Sundays and feast days.',
          '✓',
        ],
    events: tefa
      ? [
          'Family Calendar',
          'Appointments, field trips, and activities',
          'Keep the household’s real life beside lessons and meals.',
          '◷',
        ]
      : [
          'Family Calendar',
          'Appointments, field trips, and name days',
          'Keep the household’s real life beside lessons, feasts, and meals.',
          '◷',
        ],
    calendar: tefa
      ? [
          'Family Calendar',
          'Appointments, field trips, and activities',
          'Keep the household’s real life beside lessons and meals.',
          '◷',
        ]
      : [
          'Family Calendar',
          'Appointments, field trips, and name days',
          'Keep the household’s real life beside lessons, feasts, and meals.',
          '◷',
        ],
    recipes: tefa
      ? [
          'Recipe Library',
          'Your family recipe box',
          'Save recipes once and use them as the source for weekly meal planning.',
          '☰',
        ]
      : [
          'Recipe Library',
          'Your fast-aware family recipe box',
          'Save recipes once, mark fasting fit, and use them as the source for meal planning.',
          '☰',
        ],
    groceries: [
      'Grocery List',
      'From the menu to the store',
      'Group shopping by aisle and keep pantry staples from cluttering the list.',
      '▤',
    ],
    pantry: [
      'Pantry',
      'Staples, leftovers, and things already on hand',
      'Track what the household already has so the weekly grocery list stays practical and lean.',
      '☖',
    ],
  };
  const [kicker, title, desc, icon] = learnOwnValue4(intros, scope) || intros.lessons;
  return `
    <section class="learn-family-intro">
      <span class="learn-family-intro-watermark">${html(icon)}</span>
      <div class="learn-family-intro-icon">${html(icon)}</div>
      <div>
        <div class="learn-family-kicker">${html(kicker)}</div>
        <h1>${html(title)}</h1>
        <p>${html(desc)}</p>
      </div>
    </section>
  `;
}

function renderFamilyPlannerScopeLegacy(vm: LearnPlannerVm, scope: string) {
  const planning = vm.familyPlanning || {};
  const dates = plannerDates(vm);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  const recipes = planning.recipes || [];
  const groceries = planning.groceryItems || [];
  const chores = planning.chores || [];
  const eventsByDate = expandFamilyEvents(planning.events || [], dates);
  const titleMap = {
    meals: ['Weekly Meals', 'Plan one week at a time with fasting guidance beside the family calendar.', '♨'],
    chores: ['Chores', 'Keep practical life visible without crowding the school lesson plan.', '✓'],
    calendar: [
      'Family Calendar',
      'Appointments, field trips, extracurriculars, and name days in one household view.',
      '◷',
    ],
    recipes: ['Recipes', 'A fast-aware household recipe box connected to your weekly meal plan.', '☰'],
    groceries: ['Grocery List', 'A simple shopping list that can grow from meals and recipes.', '▤'],
  };
  const [title, intro, icon] = learnOwnValue4(titleMap, scope) || titleMap.meals;
  const saveBar = `<div class="learn-family-planner-save"><span data-family-planning-status>Changes save to this household's Learn planner.</span><button type="submit">Save ${html(title)}</button></div>`;
  const hidden = `<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><input type="hidden" name="familyPlanning.fastingPreference" value="${html(planning.fastingPreference || 'guidance')}"><input type="hidden" name="household.motherName" value="${html(planning.household?.motherName || '')}"><input type="hidden" name="household.motherNameDay" value="${html(planning.household?.motherNameDay || '')}"><input type="hidden" name="household.fatherName" value="${html(planning.household?.fatherName || '')}"><input type="hidden" name="household.fatherNameDay" value="${html(planning.household?.fatherNameDay || '')}"><input type="hidden" name="household.parishPatronalFeastName" value="${html(planning.household?.parishPatronalFeastName || '')}"><input type="hidden" name="household.parishPatronalFeastDate" value="${html(planning.household?.parishPatronalFeastDate || '')}">${(planning.children || []).map((child) => `<span data-family-child-id="${html(child.id)}" data-family-child-name="${html(child.name || '')}" hidden><input name="childNameDay" value="${html(child.nameDay || '')}"></span>`).join('')}`;
  let content = '';
  if (scope === 'meals') {
    content = `<div class="learn-family-section-note"><strong>Weekly menu</strong><span>Tap into the fields and save the week. Recipe picker and drag-and-drop meal assignment can layer on top of this without changing the data.</span></div><div class="learn-family-meal-grid">${dates
      .map((date) => {
        const day = plannerDayLabel(date);
        const meal = mealByDate.get(date) || {};
        const calendarDay: LearnShellNode = ((vm.month.days || []).find((item) => item.date === date) ||
          (vm.week.days || []).find((item) => item.date === date) ||
          {}) as LearnShellNode;
        const fastingClass = calendarDay.isFastDay ? 'is-fast' : calendarDay.isSunday ? 'is-feast' : '';
        return `<article class="learn-family-day-card ${fastingClass}" data-setup-row="meals" data-id="${html(meal.id || '')}"><div><span><small>${html(day.weekday)}</small><b>${html(day.short)}</b></span><strong>${html(calendarDay.fastingType || calendarDay.fasting || 'No fast')}</strong></div><input type="hidden" name="date" value="${html(date)}"><label><span>Breakfast</span><input name="breakfast" value="${html(meal.breakfast || '')}" placeholder="Add breakfast"></label><label><span>Lunch</span><input name="lunch" value="${html(meal.lunch || '')}" placeholder="Add lunch"></label><label><span>Dinner</span><input name="dinner" value="${html(meal.dinner || '')}" placeholder="Add dinner"></label></article>`;
      })
      .join('')}</div>`;
  } else if (scope === 'calendar') {
    content = `<div class="learn-family-section-note"><strong>This week's calendar</strong><span>Appointments, field trips, extracurriculars, and name days stay visible with school work and meals.</span></div><div class="learn-family-events-list">${dates
      .map((date) => {
        const day = plannerDayLabel(date);
        const rows = eventsByDate.get(date) || [{}];
        const calendarDay: LearnShellNode = (vm.week.days || []).find((item) => item.date === date) || {};
        return `<section class="learn-family-date-section"><header><span><small>${html(day.weekday)}</small><strong>${html(day.short)}</strong><em>${html(calendarDay.feast || 'Family day')}</em></span><button type="button" data-setup-add-row="familyEvents" data-setup-add-target="familyEvents-${html(date)}" data-setup-add-date="${html(date)}">+ Add</button></header><div id="familyEvents-${html(date)}" data-setup-list="familyEvents" style="display:grid;gap:8px;">${rows.map((event) => familyEventSetupRow({ ...event, date: event.date || date })).join('')}</div></section>`;
      })
      .join('')}</div>`;
  } else if (scope === 'chores') {
    const choreRows = chores.length ? chores : [{}];
    const household = planning.household || {};
    const roster = [
      { name: household.motherName || 'Mom', color: 'var(--burgundy)' },
      { name: household.fatherName || 'Dad', color: 'var(--navy)' },
      ...(planning.children || []).map((child) => ({
        name: child.name || 'Child',
        color: child.color || 'var(--gold)',
      })),
    ];
    content = `<div class="learn-family-section-note"><strong>Chore rhythm</strong><span>Create daily, weekly, monthly, quarterly, and yearly chores. Assign each one to Mom, Dad, Everyone, or a specific child.</span></div><div class="learn-family-chore-roster">${roster.map((person) => `<span><b style="background:${html(person.color)};">${html(String(person.name || 'C').slice(0, 1))}</b>${html(person.name)}</span>`).join('')}</div><div data-setup-list="chores" class="learn-family-edit-list">${choreRows.map((chore, index) => choreSetupRow(chore, index, planning)).join('')}</div><button type="button" data-setup-add-row="chores" class="learn-add-button">Add Chore</button>`;
  } else if (scope === 'recipes') {
    content = `<div class="learn-family-section-note"><strong>Recipe library</strong><span>Mark each recipe by fasting fit so AGAPAY can suggest better meals for fast days later.</span></div><div data-setup-list="recipes" class="learn-family-edit-list">${(recipes.length ? recipes : [{}]).map(recipeSetupRow).join('')}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button>`;
  } else {
    const byCategory = new Map<string, LearnShellNode[]>();
    groceries.forEach((item) => {
      const category = item.category || 'Other';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(item);
    });
    const summary = groceries.length
      ? [...byCategory.entries()]
          .map(
            ([category, items]) =>
              `<div class="learn-family-aisle"><strong>${html(category)}</strong><span>${items.map((item) => html(item.name)).join(', ')}</span></div>`
          )
          .join('')
      : '';
    content = `<div class="learn-family-section-note"><strong>Grocery list</strong><span>Group items by aisle. Checked items persist so the list can become a real weekly shopping tool.</span></div>${summary ? `<div class="learn-family-grocery-summary">${summary}</div>` : ''}<div data-setup-list="groceryItems" class="learn-family-edit-list">${(groceries.length ? groceries : [{}]).map(grocerySetupRow).join('')}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button>`;
  }
  return `<form data-family-planning-form id="family-planner" class="learn-family-planner-panel">${hidden}${content}${saveBar}</form>`;
}

function dayKeyForChore(chore: LearnShellNode | null | undefined = {}, vm: Partial<LearnPlannerVm> = {}) {
  const dayLabel = String(chore!.day || '').toLowerCase();
  return (
    Object.entries(prototypeWeekDateMap(vm as LearnFamilyPlannerInput)).find(([, date]) => {
      const label = plannerDayLabel(date).long.toLowerCase();
      return label === dayLabel;
    })?.[0] || ''
  );
}

function prototypeRecipeType(slot: string = 'dinner') {
  if (slot === 'breakfast') return 'breakfast';
  if (slot === 'lunch') return 'lunch';
  return 'dinner';
}

function prototypeDaySeeds(vm: LearnPlannerVm) {
  const model = familyPlannerModel(vm);
  const days: LearnShellNode[] = model.weekDays.length
    ? model.weekDays
    : plannerDates(vm).map((date) => ({ date, ...plannerDayLabel(date) }));
  return days.slice(0, 7).map((day, index) => ({
    key: `d${index}`,
    fullDate: day.date || '',
    weekday: day.weekday || day.weekdayShort || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index] || '',
    long: day.weekdayLong || day.long || day.weekday || '',
    short: day.shortDate || day.short || day.date || '',
    date: Number(day.dayNumber || String(day.date || '').slice(-2)) || index + 1,
    level: isImportantPlannerFeast(day)
      ? 'fish'
      : day.isSunday
        ? 'fish'
        : day.isFastDay
          ? String(day.fastingType || day.fasting || '')
              .toLowerCase()
              .includes('strict')
            ? 'strict'
            : 'oilwine'
          : 'rich',
    feast: isImportantPlannerFeast(day) ? day.feast || day.feastTitle || '' : '',
    tag:
      day.fastingType ||
      day.fasting ||
      (isImportantPlannerFeast(day) ? day.feast || day.feastTitle || 'Feast day' : 'No fast'),
    sunday: Boolean(day.isSunday),
    isToday: Boolean(day.isToday),
    feastDay: isImportantPlannerFeast(day),
    school: index === 0 ? 'Church & rest' : 'Plan the day',
  }));
}

function prototypeMonthSeed(vm: LearnPlannerVm) {
  const model = familyPlannerModel(vm);
  const weekDateToKey = Object.fromEntries(prototypeDaySeeds(vm).map((day) => [day.fullDate, day.key]));
  const monthDays = (model.monthDays || []).map((day) => {
    const feast = day.feast || day.feastTitle || '';
    const fasting = day.fastingType || day.fasting || '';
    const importantFeast = isImportantPlannerFeast(day);
    const key = weekDateToKey[day.date as string] || (day.date ? `m_${String(day.date).replaceAll('-', '')}` : '');
    return {
      key,
      fullDate: day.date || '',
      dayNumber:
        day.dayNumber ||
        String(day.date || '')
          .slice(-2)
          .replace(/^0/, ''),
      weekday: day.weekday || day.weekdayLong || '',
      long: day.weekdayLong || day.long || day.weekday || '',
      short: day.shortDate || day.short || day.date || '',
      date: Number(day.dayNumber || String(day.date || '').slice(-2)) || 0,
      level: importantFeast
        ? 'fish'
        : day.isSunday
          ? 'fish'
          : day.isFastDay
            ? String(fasting).toLowerCase().includes('strict')
              ? 'strict'
              : 'oilwine'
            : 'rich',
      tag: fasting || (importantFeast ? feast || 'Feast day' : 'No fast'),
      sunday: Boolean(day.isSunday),
      feastDay: importantFeast,
      inMonth: day.inMonth !== false,
      isToday: Boolean(day.isToday),
      isSunday: Boolean(day.isSunday),
      isFastDay: Boolean(day.isFastDay),
      isImportantFeast: importantFeast,
      feast,
      feastRank: day.feastRank || '',
      fasting,
      fastingType: day.fastingType || '',
      meal: day.meal || null,
    };
  });
  const monthFeasts: LearnMonthFeast[] = monthDays
    .filter((day) => day.inMonth !== false && day.isImportantFeast)
    .slice(0, 8)
    .map((day, index) => ({
      id: `month_${day.fullDate || index}`,
      day: day.dayNumber || '',
      dateLabel: day.dayNumber ? String(day.dayNumber) : day.fullDate || '',
      name: day.feast || 'Fast day',
      rank: day.isFastDay
        ? [day.feastRank || 'Feast', day.fasting || day.fastingType || ''].filter(truthyLearn4).join(' · ')
        : day.feastRank || 'Feast',
      plan: index === 0,
    }));
  let weekFeasts = monthDays
    .filter((day) => weekDateToKey[day.fullDate] && day.isImportantFeast)
    .map((day, index) => ({
      id: `week_${day.fullDate || index}`,
      day: day.dayNumber || '',
      dateLabel: day.short || day.dayNumber || day.fullDate || '',
      name: day.feast || 'Feast',
      rank: day.isFastDay
        ? [day.feastRank || 'Feast', day.fasting || day.fastingType || ''].filter(truthyLearn4).join(' · ')
        : day.feastRank || 'Feast',
      fullDate: day.fullDate || '',
      plan: index === 0,
    }));
  const calendarType = String(
    vm.preferences?.calendarType ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('agapay.learn.calendar') : '') ||
      ''
  );
  const revisedLike = /revised|gregorian/i.test(calendarType);
  const june24 = monthDays.find((day) => day.inMonth !== false && String(day.fullDate || '').slice(5) === '06-24');
  if (revisedLike && june24 && !monthFeasts.some((feast) => feast.id === `month_${june24.fullDate}`)) {
    june24.feast = june24.feast || 'Nativity of St. John the Forerunner';
    june24.feastDay = true;
    june24.isImportantFeast = true;
    june24.level = 'fish';
    monthFeasts.push({
      id: `month_${june24.fullDate}`,
      day: june24.dayNumber || '24',
      dateLabel: june24.dayNumber || '24',
      name: june24.feast,
      rank: [june24.fasting || june24.fastingType || '', 'Feast'].filter(truthyLearn4).join(' · '),
      plan: monthFeasts.length === 0,
    });
  }
  if (
    revisedLike &&
    june24 &&
    weekDateToKey[june24.fullDate] &&
    !weekFeasts.some((feast) => feast.fullDate === june24.fullDate)
  ) {
    weekFeasts = weekFeasts.concat({
      id: `week_${june24.fullDate}_forerunner`,
      day: june24.dayNumber || '24',
      dateLabel: june24.short || june24.dayNumber || 'Jun 24',
      name: 'Nativity of St. John the Forerunner',
      rank: [june24.fasting || june24.fastingType || '', 'Feast'].filter(truthyLearn4).join(' · '),
      fullDate: june24.fullDate || '',
      plan: weekFeasts.length === 0,
    });
  }
  weekFeasts.sort((a, b) => String(a.fullDate || '').localeCompare(String(b.fullDate || '')));
  const weekDays = model.weekDays || [];
  const weekStart = weekDays[0]?.shortDate || weekDays[0]?.short || weekDays[0]?.date || '';
  const weekEnd =
    weekDays[weekDays.length - 1]?.shortDate ||
    weekDays[weekDays.length - 1]?.short ||
    weekDays[weekDays.length - 1]?.date ||
    '';
  const fastNames = [
    ...new Set(
      monthDays
        .filter((day) => day.inMonth !== false && day.isFastDay)
        .map((day) => day.fasting || day.fastingType || 'Fast day')
        .filter(truthyLearn4)
    ),
  ];
  return {
    key: vm.month?.key || model.monthKey || new Date().toISOString().slice(0, 7),
    label: model.monthLabel || vm.month?.label || 'Month Calendar',
    weekdays: vm.month?.weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    days: monthDays,
    feasts: monthFeasts,
    weekFeasts,
    weekRange: weekStart && weekEnd ? `${weekStart} - ${weekEnd}` : 'This week',
    fastingSummary: fastNames.length ? fastNames.slice(0, 2).join(' + ') : 'Church calendar',
  };
}
export type LearnShell2Part3 = {
  renderPlanner: typeof renderPlanner;
  plannerStatusMeta: typeof plannerStatusMeta;
  statusPill: typeof statusPill;
  renderPlannerReserveCard: typeof renderPlannerReserveCard;
  gracePriorityBadge: typeof gracePriorityBadge;
  renderTermAtAGlance: typeof renderTermAtAGlance;
  renderPlannerWeek: typeof renderPlannerWeek;
  moveUnfinishedWorkControl: typeof moveUnfinishedWorkControl;
  renderPlannerDay: typeof renderPlannerDay;
  renderFamilyPlanningEditor: typeof renderFamilyPlanningEditor;
  renderFamilyPlannerIntro: typeof renderFamilyPlannerIntro;
  renderFamilyPlannerScopeLegacy: typeof renderFamilyPlannerScopeLegacy;
  dayKeyForChore: typeof dayKeyForChore;
  prototypeRecipeType: typeof prototypeRecipeType;
  prototypeDaySeeds: typeof prototypeDaySeeds;
  prototypeMonthSeed: typeof prototypeMonthSeed;
};

// Read only owned table entries; unknown and prototype keys use the caller's fallback.
function learnOwnValue4<T extends object>(table: T, key: string): T[keyof T] | undefined {
  for (const name in table) {
    if (name === key && Object.hasOwn(table, name)) return table[name];
  }
  return undefined;
}
