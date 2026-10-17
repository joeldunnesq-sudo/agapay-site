import type {
  LearnAssignmentContext,
  LearnFamilyContext,
  LearnShellWeekAssignment,
  LearnShellViewModel,
  LearnShellNode,
  LearnDashboardVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearn3<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const bar: LearnShellBindings['bar'];
declare const saintCardTitle: LearnShellBindings['saintCardTitle'];
declare const forceDisplayedSaintFirst: LearnShellBindings['forceDisplayedSaintFirst'];
declare const saintMatchKey: LearnShellBindings['saintMatchKey'];
declare const completionCheck: LearnShellBindings['completionCheck'];
declare const shell: LearnShellBindings['shell'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const panel: LearnShellBindings['panel'];
declare const marketingPreviewActive: LearnShellBindings['marketingPreviewActive'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const expandFamilyEvents: LearnShellBindings['expandFamilyEvents'];
declare const choreDueOnDay: LearnShellBindings['choreDueOnDay'];
declare const plannerDayLabel: LearnShellBindings['plannerDayLabel'];
declare const nextSevenDates: LearnShellBindings['nextSevenDates'];
declare const eventRecurrence: LearnShellBindings['eventRecurrence'];
declare const eventRecurrenceLabel: LearnShellBindings['eventRecurrenceLabel'];
declare const choreScheduleLabel: LearnShellBindings['choreScheduleLabel'];

function renderTermProgressPanel(vm: LearnShellViewModel) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  return `
    <section style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:minmax(220px,.8fr) 1fr;gap:18px;align-items:center;box-shadow:0 1px 3px rgba(20,40,70,.04);">
      <div>
        <div class="learn-eyebrow">Term at a Glance</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || 'Current Term')}</h2>
        <p style="margin:0;color:var(--muted);line-height:1.4;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : 'Set term dates in Setup'}${term.dateRange ? ` · ${html(term.dateRange)}` : ''}</p>
        ${term.description ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:var(--ink);">${html(term.description)}</p>` : ''}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, 'var(--gold)')}
      </div>
    </section>
  `;
}

function renderTodayLearnContext(vm: LearnShellViewModel) {
  const term = vm.termProgress || {};
  const progress = Number(term.percent || 0);
  const currentMode = vm.graceMode?.active ? vm.graceMode.mode || 'light' : 'full';
  const modes = [
    { id: 'full', title: 'Full', detail: 'Run every scheduled item as planned.' },
    { id: 'light', title: 'Medium', detail: 'Keep up to 4 ranked child subjects; reserve the rest.' },
    { id: 'minimum viable', title: 'Light', detail: 'Keep up to 2 top-ranked child subjects as short touchpoints.' },
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;margin-top:18px;width:100%;">
      <section style="border:1px solid var(--line);border-radius:14px;background:rgba(255,252,245,.72);padding:14px;">
        <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Term at a Glance</div>
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:25px;line-height:1.05;margin:5px 0 4px;color:var(--ink);">${html(term.label || 'Current Term')}</h3>
        <p style="margin:0 0 10px;color:var(--muted);line-height:1.35;">${term.currentWeek && term.totalWeeks ? `Week ${html(term.currentWeek)} of ${html(term.totalWeeks)}` : 'Set term dates in Setup'}${term.dateRange ? ` · ${html(term.dateRange)}` : ''}</p>
        ${term.description ? `<p style="margin:-2px 0 10px;font-size:13px;line-height:1.5;color:var(--ink);">${html(term.description)}</p>` : ''}
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:7px;color:#33405a;font-size:13px;"><span>Term progress</span><strong>${html(progress)}%</strong></div>
        ${bar(progress, 'var(--gold)')}
      </section>
      <section style="border:1px solid rgba(181,148,47,.34);border-radius:14px;background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);padding:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <span><span style="display:block;color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Grace Mode</span><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">Today’s rhythm</strong></span>
          <span data-grace-mode-status style="color:var(--muted);font-size:12px;min-height:18px;">${vm.graceMode?.active ? '' : 'Full plan · no Grace Mode'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px;">
          ${modes
            .map((mode) => {
              const active = mode.id === currentMode;
              return `<button type="button" data-grace-mode="${html(mode.id)}" aria-pressed="${active ? 'true' : 'false'}" title="${html(mode.detail)}" style="border:1px solid ${active ? 'var(--gold)' : 'var(--line)'};border-radius:11px;background:${active ? 'var(--navy)' : 'rgba(255,255,255,.62)'};color:${active ? '#fffaf0' : 'var(--ink)'};padding:10px;text-align:left;cursor:pointer;font-family:inherit;min-height:84px;"><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:20px;line-height:1;">${html(mode.title)}</strong><small style="display:block;margin-top:5px;line-height:1.25;color:${active ? 'rgba(255,250,240,.82)' : 'var(--muted)'};">${html(mode.detail)}</small></button>`;
            })
            .join('')}
        </div>
        <button type="button" data-grace-mode="full" style="margin-top:8px;width:100%;border:1px solid ${currentMode === 'full' ? 'var(--navy)' : 'var(--line)'};border-radius:9px;background:${currentMode === 'full' ? 'rgba(6,21,34,.06)' : 'transparent'};color:var(--muted);padding:7px 10px;text-align:center;cursor:pointer;font-family:inherit;font-size:13px;">
          ${currentMode === 'full' ? '✓ Full plan — no Grace Mode active' : 'Return to full plan'}
        </button>
      </section>
    </div>
  `;
}

function weekAssignmentStorageKey(vm: LearnAssignmentContext, explicitWeekKey: string = '') {
  const itemIds = (vm.week?.weeklyAssignmentItems || []).map((item) => item.id).join(',');
  const weekKey =
    explicitWeekKey || [vm.week?.days?.[0]?.date, vm.week?.days?.[6]?.date].filter(truthyLearn3).join('_') || 'week';
  return `agapay.learn.weekAssignments.${weekKey}.${itemIds}`;
}

function readWeekAssignmentState(vm: LearnAssignmentContext, explicitWeekKey: string = '') {
  try {
    return JSON.parse(localStorage.getItem(weekAssignmentStorageKey(vm, explicitWeekKey)) || '{}') as Record<
      string,
      LearnShellWeekAssignment
    >;
  } catch {
    return {};
  }
}

function designedAssignmentsForDate(vm: LearnAssignmentContext, date: string) {
  if (!date) return [];
  const items = vm.week?.weeklyAssignmentItems || [];
  if (marketingPreviewActive()) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return items
      .filter((item) => ['planned', 'reduced', 'completed'].includes(item.statuses?.[weekday]))
      .slice(0, 6)
      .map((item) => ({ ...item, note: item.sub || '', sub: item.sub || '' }));
  }
  const state = readWeekAssignmentState(vm);
  return items
    .map((item) => {
      const saved = state[item.id];
      return saved?.zone === date
        ? {
            ...item,
            note: saved.note || '',
            sub: saved.note || item.sub || '',
          }
        : null;
    })
    .filter(truthyLearn3);
}

function timeLabel(value: unknown = '') {
  return value ? value : 'All day';
}

function eventsForDate(vm: LearnFamilyContext, date: string) {
  return expandFamilyEvents(vm.familyPlanning?.events || [], [date]).get(date) || [];
}

function mealForDate(vm: LearnFamilyContext, date: string) {
  return (vm.familyPlanning?.meals || []).find((meal) => meal.date === date) || null;
}

function choresForDate(vm: LearnFamilyContext, date: string) {
  return (vm.familyPlanning?.chores || []).filter((chore) =>
    choreDueOnDay(chore, {
      date,
      long: plannerDayLabel(date).long,
    })
  );
}

function renderDesignedLessonList(assignments: LearnShellNode[], emptyMessage: string) {
  return assignments.length
    ? `<div class="learn-designed-lesson-list">${assignments
        .map(
          (item) => `
        <article class="learn-designed-lesson-card" style="border-left-color:${html(item.color || 'var(--gold)')};">
          <strong>${html(item.title)}</strong>
          ${item.sub ? `<small>${html(item.sub)}</small>` : ''}
          ${item.note && item.note !== item.sub ? `<em>${html(item.note)}</em>` : ''}
        </article>`
        )
        .join('')}</div>`
    : emptyState(emptyMessage);
}

function renderDashboardDesignedLessons(vm: LearnDashboardVm) {
  const date = vm.todayInChurch?.civilDate || '';
  const assignments = designedAssignmentsForDate(vm, date);
  const dayHref = learnSectionHref('planner', `view=day&date=${encodeURIComponent(date)}`);
  return `
    <div class="learn-card">
      <div class="learn-section-head">
        <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">▦</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">TODAY'S DESIGNED LESSONS</span></span>
        <a href="${html(dayHref)}" style="color:var(--gold);font-size:12px;font-weight:800;text-decoration:none;">Open day</a>
      </div>
      ${renderDesignedLessonList(assignments, "Drag subjects into this day from the Week view to seed today's Dashboard lessons.")}
    </div>
  `;
}

function renderDashboardFamilyCards(vm: LearnDashboardVm) {
  const date = vm.todayInChurch?.civilDate || '';
  const todayEvents = eventsForDate(vm, date);
  const upcomingDates = nextSevenDates(date).concat(
    Array.from({ length: 84 }, (_, index) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      parsed.setUTCDate(parsed.getUTCDate() + index + 8);
      return parsed.toISOString().slice(0, 10);
    })
  );
  const upcomingEvents = [...expandFamilyEvents(vm.familyPlanning?.events || [], upcomingDates).entries()]
    .flatMap(([eventDate, events]) => events.map((event) => ({ ...event, occurrenceDate: eventDate })))
    .filter((event) => event.occurrenceDate >= date)
    .sort((a, b) =>
      `${a.occurrenceDate} ${a.startTime || ''}`.localeCompare(`${b.occurrenceDate} ${b.startTime || ''}`)
    )
    .slice(0, 4);
  const meal = mealForDate(vm, date);
  const chores = choresForDate(vm, date).slice(0, 6);
  const appointmentItems = todayEvents.length ? todayEvents : upcomingEvents;
  const appointmentTitle = todayEvents.length ? "Today's Appointments" : 'Upcoming Appointments';
  return `
    <div class="learn-dashboard-family-grid">
      <section class="learn-dashboard-family-card">
        <div><small>APPOINTMENTS</small><h3>${html(appointmentTitle)}</h3></div>
        ${
          appointmentItems.length
            ? `<div class="learn-dashboard-mini-list">${appointmentItems
                .map((event) => {
                  const eventDate = event.occurrenceDate || event.date;
                  return `<span><strong>${html(event.title || 'Appointment')}</strong><small>${html(eventDate === date ? timeLabel(event.startTime) : `${eventDate} · ${timeLabel(event.startTime)}`)}${event.location ? ` · ${html(event.location)}` : ''}${eventRecurrence(event.recurrence) !== 'none' ? ` · ${html(eventRecurrenceLabel(event.recurrence))}` : ''}</small></span>`;
                })
                .join('')}</div>`
            : emptyState('Add appointments in Planner > Events.')
        }
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>MEALS</small><h3>Meal Plan</h3></div>
        ${
          meal
            ? `<div class="learn-dashboard-mini-list">
          <span><strong>Breakfast</strong><small>${html(meal.breakfast || 'Open')}</small></span>
          <span><strong>Lunch</strong><small>${html(meal.lunch || 'Open')}</small></span>
          <span><strong>Dinner</strong><small>${html(meal.dinner || 'Open')}</small></span>
        </div>`
            : emptyState("Plan today's meals in Planner > Meals.")
        }
      </section>
      <section class="learn-dashboard-family-card">
        <div><small>CHORES</small><h3>Household Chores</h3></div>
        ${chores.length ? `<div class="learn-dashboard-mini-list">${chores.map((chore) => `<span><strong>${html(chore.title || 'Chore')}</strong><small>${html([chore.assignee, choreScheduleLabel(chore), chore.notes].filter(truthyLearn3).join(' · '))}</small></span>`).join('')}</div>` : emptyState('Add chores in Planner > Chores.')}
      </section>
    </div>
  `;
}

function renderTefaViewToggleBanner(experience: ReturnType<typeof learnExperience>) {
  const tefa = experience.viewMode === 'tefa';
  if (tefa) {
    return `
      <div data-tefa-view-toggle-row style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%);border:1px solid rgba(181,148,47,.34);border-radius:14px;padding:14px 18px;">
        <div style="min-width:0;">
          <div style="color:var(--gold);font-size:10.5px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;">Odyssey marketplace edition</div>
          <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">Built for flexible Texas homeschool planning</strong>
          <span style="display:block;font-size:12.5px;color:var(--muted);margin-top:2px;">Lessons, attendance, grades, household planning, and printable records in one calm workspace.</span>
        </div>
        <span style="display:inline-flex;align-items:center;border:1px solid var(--gold);background:var(--paper2);border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;color:var(--navy);">TEFA Edition</span>
      </div>`;
  }
  return `
    <div data-tefa-view-toggle-row style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:${tefa ? 'linear-gradient(135deg,#fffaf0 0%,#f7edd6 100%)' : 'var(--paper)'};border:1px solid ${tefa ? 'rgba(181,148,47,.34)' : 'var(--line)'};border-radius:14px;padding:14px 18px;">
      <div style="min-width:0;">
        <div style="color:var(--gold);font-size:10.5px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;">Dashboard view</div>
        <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:21px;line-height:1.1;color:var(--ink);">${tefa ? 'TEFA Edition' : 'Classic AGAPAY Learn'}</strong>
        <span style="display:block;font-size:12.5px;color:var(--muted);margin-top:2px;">${tefa ? "Today's lessons, planner, attendance, grades, and print tools lead the dashboard." : 'The full Orthodox household dashboard, with Church Rhythm leading the day.'}</span>
      </div>
      <button type="button" data-tefa-view-toggle role="switch" aria-checked="${tefa ? 'true' : 'false'}" aria-label="Switch to ${tefa ? 'the classic AGAPAY Learn dashboard' : 'TEFA Edition'}" style="display:flex;align-items:center;gap:9px;flex:none;border:1px solid var(--gold);background:var(--paper2);border-radius:999px;padding:7px 12px;cursor:pointer;font-family:inherit;">
        <span style="font-size:12px;font-weight:700;color:${tefa ? 'var(--muted)' : 'var(--navy)'};">Classic</span>
        <span aria-hidden="true" style="position:relative;width:40px;height:23px;border-radius:999px;background:${tefa ? 'var(--gold)' : 'var(--line)'};display:inline-flex;align-items:center;padding:2px;transition:background .15s;">
          <span style="width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transform:translateX(${tefa ? '17px' : '0'});transition:transform .15s;"></span>
        </span>
        <span style="font-size:12px;font-weight:700;color:${tefa ? 'var(--navy)' : 'var(--muted)'};">TEFA</span>
      </button>
    </div>
  `;
}

function renderDashboard(vm: LearnDashboardVm) {
  const today = vm.todayInChurch;
  const todayArtworkUrl = today.iconUrl || '/images/learn/today-in-the-church.jpg';
  const displayedSaintTitle = saintCardTitle(today);
  const orderedSaintStories = forceDisplayedSaintFirst(today.saintStories || [], displayedSaintTitle);
  const churchIconPanel = `<div class="learn-today-art-panel"><img src="${html(todayArtworkUrl)}" alt="Illustrated Orthodox homeschool planner open to today" loading="lazy"></div>`;
  const saintPreview =
    displayedSaintTitle && displayedSaintTitle !== 'Lives of the Saints'
      ? `${today.saintNames?.length > 1 ? `${today.saintNames.length} commemorations` : 'Open the life'} for today.`
      : today.saintNames?.length
        ? today.saintNames.slice(0, 2).join('; ') +
          (today.saintNames.length > 2 ? ` + ${today.saintNames.length - 2} more` : '')
        : 'Open the lives commemorated today.';
  const saintIcon = orderedSaintStories?.find((saint) => saint.iconUrl)?.iconUrl || '';
  const displayedSaintKey = saintMatchKey(displayedSaintTitle);
  const displayedSaintStory = orderedSaintStories?.find((saint) => {
    const key = saintMatchKey(saint?.name || saint?.title || '');
    return (
      key &&
      displayedSaintKey &&
      (key === displayedSaintKey || key.includes(displayedSaintKey) || displayedSaintKey.includes(key))
    );
  });
  const saintCentury =
    displayedSaintStory?.reposeCentury ||
    orderedSaintStories?.find((saint) => saint.reposeCentury)?.reposeCentury ||
    '';
  const saintCard = `<button type="button" data-saint-of-day data-saint-title="${html(displayedSaintTitle)}" data-date="${html(today.civilDate)}" data-calendar="${html(today.calendarType)}" style="margin-top:14px;width:100%;text-align:left;border:1px solid rgba(181,148,47,.34);background:linear-gradient(135deg,#fffaf0,#f7edd6);border-radius:13px;padding:13px;display:flex;gap:12px;align-items:center;cursor:pointer;font-family:inherit;color:var(--ink);box-shadow:0 1px 2px rgba(20,40,70,.04);">
    ${saintIcon ? `<img src="${html(saintIcon)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--goldsoft);flex:none;">` : `<span style="width:48px;height:48px;border-radius:50%;background:var(--navy);color:#f3ead4;display:grid;place-items:center;flex:none;font-size:23px;">✥</span>`}
    <span style="min-width:0;line-height:1.25;"><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Saint of the Day</span><strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(displayedSaintTitle)}</strong>${saintCentury ? `<span style="display:block;color:var(--gold);font-size:12px;font-weight:800;margin:2px 0 1px;">${html(saintCentury)}</span>` : ''}<small style="display:block;color:var(--muted);line-height:1.35;">${html(saintPreview)}</small></span>
    <span style="margin-left:auto;color:var(--gold);font-size:20px;flex:none;">→</span>
  </button>`;

  // ── Readings — distinct actionable callout ────────────────────────────────────
  const hasReadings = today.epistleRef || today.gospelRef;
  const readingsCallout = hasReadings
    ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☰</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Epistle</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.epistleRef)}</strong>
      </div>
      <div style="background:linear-gradient(135deg,#fffbf0,#f7edd6);border:1px solid rgba(181,148,47,.28);border-radius:11px;padding:12px;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
          <span style="color:var(--gold);font-size:14px;">☩</span>
          <span style="color:var(--gold);font-size:10px;letter-spacing:.13em;font-weight:800;text-transform:uppercase;">Gospel</span>
        </div>
        <strong style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);line-height:1.1;">${html(today.gospelRef)}</strong>
      </div>
    </div>`
    : '';

  // ── Church Rhythms — proper grid with breathing room ──────────────────────────
  const rhythmsGrid = vm.churchRhythms.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1px;background:var(--line);border-radius:10px;overflow:hidden;">
        ${vm.churchRhythms
          .map(
            (r, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--paper);">
            ${completionCheck(r, 'daily', r.label)}
            <span style="line-height:1.25;min-width:0;">
              <span style="display:block;font-size:15px;color:var(--ink);font-weight:500;">${html(r.label)}</span>
              ${r.sub ? `<span style="display:block;font-size:12px;color:var(--muted);">${html(r.sub)}</span>` : ''}
            </span>
          </div>`
          )
          .join('')}
       </div>`
    : emptyState('Add church rhythms in Setup — Morning Prayer, Readings, Saint of the Day.');

  // ── Together This Week ────────────────────────────────────────────────────────
  const householdGroups = vm.householdStream.reduce((groups, item) => {
    const label = item.group || 'Everyone Together';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
    return groups;
  }, new Map<string, LearnShellNode[]>());
  const togetherThisWeek = householdGroups.size
    ? [...householdGroups.entries()]
        .map(
          ([group, items]) => `
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 8px;">
            <strong style="color:var(--ink);font-family:'Cormorant Garamond',serif;font-size:18px;">${html(group)}</strong>
            <span style="font-size:11px;color:var(--muted);">${items.filter((item: LearnShellNode) => item.complete).length}/${items.length} complete</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px;">
            ${items
              .map(
                (item: LearnShellNode) => `
              <div style="display:flex;align-items:center;gap:12px;background:var(--paper2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;">
                <span style="width:38px;height:38px;border-radius:50%;background:#f1e6c9;color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(item.icon)}</span>
                <a href="${html(item.href)}" style="flex:1;min-width:0;line-height:1.2;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:15.5px;color:var(--ink);">${html(item.title)}</span>
                  <span style="display:block;font-size:12.5px;color:var(--muted);">${html(item.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:13px;flex:none;">${html(item.time)}</span>
                ${completionCheck(item, 'weekly', item.title)}
              </div>`
              )
              .join('')}
          </div>
        </section>`
        )
        .join('')
    : `<div style="color:var(--muted);font-style:italic;">Run Quick Setup or add Enrichment in Advanced Setup to build this week together.</div>`;

  // ── Week stats strip — above child columns ────────────────────────────────────
  const weekStatsStrip = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
      ${vm.thisWeek
        .map(
          (w) => `
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <span style="width:40px;height:40px;border-radius:50%;background:${w.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none;">${html(w.icon)}</span>
          <div style="min-width:0;">
            <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--ink);line-height:1;">${html(w.big)}</span>
            <span style="display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(w.label)}</span>
            <span style="display:block;font-size:11px;color:var(--gold);font-weight:600;">${html(w.sub)}</span>
          </div>
        </div>`
        )
        .join('')}
      <a href="${html(learnSectionHref('planner'))}" style="background:var(--navy);border:1px solid var(--gold);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#fffaf0;font-weight:700;text-decoration:none;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        Open Planner <span style="color:var(--gold);">→</span>
      </a>
    </div>`;

  // ── Child columns — with empty state ─────────────────────────────────────────
  const childColumnsGrid = vm.childColumns.length
    ? vm.childColumns
        .map(
          (col) => `
        <article style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line);">
            <span style="width:34px;height:34px;border-radius:50%;background:${col.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;flex:none;">${html(col.initial)}</span>
            <div style="line-height:1.15;min-width:0;">
              <span style="display:block;font-size:10px;letter-spacing:.12em;color:var(--gold);font-weight:600;">${html(col.tag)}</span>
              <span style="display:block;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(col.name)} <span class="learn-muted-sm">• Age ${html(col.age)}</span></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${col.tasks
              .map(
                (t) => `
              <div style="display:flex;align-items:center;gap:9px;background:var(--paper2);border:1px solid var(--line);border-radius:9px;padding:9px 10px;">
                <a href="${html(learnSectionHref('planner'))}" style="flex:1;min-width:0;line-height:1.15;text-decoration:none;color:inherit;">
                  <span style="display:block;font-weight:600;font-size:14px;color:var(--ink);">${html(t.title)}</span>
                  <span style="display:block;font-size:11.5px;color:var(--muted);">${html(t.sub)}</span>
                </a>
                <span style="color:var(--muted);font-size:11.5px;flex:none;">${html(t.time)}</span>
                ${completionCheck(t, 'weekly', `${col.name}: ${t.title}`)}
              </div>`
              )
              .join('')}
          </div>
        </article>`
        )
        .join('')
    : `<div style="grid-column:1/-1;background:var(--paper);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center;">
         <div style="color:var(--gold);font-size:28px;margin-bottom:10px;">◎</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--ink);display:block;margin-bottom:6px;">No children in the planner yet</strong>
         <p style="color:var(--muted);margin:0 0 16px;line-height:1.5;">Add children in Setup to see their individual work here each week.</p>
         <a href="${html(learnSectionHref('onboarding'))}" style="display:inline-flex;align-items:center;gap:8px;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:10px 18px;text-decoration:none;font-weight:700;font-size:14px;">Go to Setup →</a>
       </div>`;

  const experience = learnExperience();
  const churchCollapsed =
    experience.odyssey &&
    (() => {
      try {
        return localStorage.getItem('agapay.learn.churchCardMinimized') === 'true';
      } catch {
        return experience.tefaActive;
      }
    })();

  const churchSectionBody = `
      <!-- Today in the Church -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px;display:flex;gap:24px;box-shadow:0 1px 3px rgba(20,40,70,.04);flex-wrap:wrap;">
        ${churchIconPanel}
        <div class="learn-today-main">
          <div style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">${html(today.kicker)}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--ink);line-height:1.1;">${html(displayedSaintTitle)}</div>
          <div class="learn-today-meta-grid">
            <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">▣</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">LITURGICAL DATE</span><span style="font-size:16px;display:block;">${html(today.liturgicalDateLabel)}</span>${today.annoMundiLabel ? `<span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.annoMundiLabel)}</span>` : ''}</span></div>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">✥</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">TONE OF THE WEEK</span><span style="font-size:16px;">${html(today.toneLabel)}</span></span></div>
              <div style="display:flex;gap:10px;"><span style="color:var(--gold);font-size:17px;margin-top:2px;">♙</span><span><span style="display:block;color:var(--gold);font-size:10.5px;letter-spacing:.13em;font-weight:600;">FASTING RULE</span><span style="font-size:16px;display:block;">${html(today.fastingRule)}</span><span style="color:var(--muted);font-size:13px;font-style:italic;">${html(today.fastingNote)}</span></span></div>
            </div>
            <div class="learn-today-readings">
              ${readingsCallout}
            </div>
          </div>
          ${saintCard}
        </div>
        <div class="learn-today-hymns">
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.troparionLabel)}</div>
          <p style="margin:6px 0 16px;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.troparionText)}</p>
          <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:600;">${html(today.kontakionLabel)}</div>
          <p style="margin:6px 0 0;font-size:15.5px;line-height:1.5;color:#33405a;">${html(today.kontakionText)}</p>
        </div>
        ${renderTodayLearnContext(vm)}
      </div>

      <!-- Daily Church Rhythms — proper grid -->
      <div class="learn-card">
        <div class="learn-section-head">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:16px;">✥</span><span style="color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:600;">DAILY CHURCH RHYTHMS</span></span>
          <small class="learn-muted">Resets each day</small>
        </div>
        ${rhythmsGrid}
      </div>
  `;

  // Odyssey/TEFA users get a real collapsible wrapper around Church content —
  // minimized by default (see index.html's first-visit default), expandable,
  // and the choice persists via localStorage. Non-Odyssey users always see
  // it expanded, as before.
  const churchSectionHtml = experience.tefaActive
    ? ''
    : experience.odyssey
      ? `
      <div data-church-section style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span class="learn-eyebrow" style="display:flex;align-items:center;gap:8px;"><span style="color:var(--gold);">✥</span>Church Rhythm${experience.tefaActive ? ' (Optional)' : ''}</span>
          <button type="button" data-church-section-toggle aria-expanded="${churchCollapsed ? 'false' : 'true'}" style="border:1px solid var(--line);background:var(--paper2);border-radius:9px;padding:6px 13px;font-family:inherit;font-size:12.5px;color:var(--ink);cursor:pointer;">
            <span data-church-section-toggle-label>${churchCollapsed ? 'Show Church Rhythm' : 'Minimize'}</span>
          </button>
        </div>
        <div data-church-section-body ${churchCollapsed ? 'hidden' : ''} style="display:${churchCollapsed ? 'none' : 'flex'};flex-direction:column;gap:22px;">
          ${churchSectionBody}
        </div>
      </div>
    `
      : `<div style="display:flex;flex-direction:column;gap:22px;">${churchSectionBody}</div>`;

  const lessonsAndFamilyHtml = `${renderDashboardDesignedLessons(vm)}\n      ${renderDashboardFamilyCards(vm)}`;

  const togetherAndWeekHtml = `
      <!-- Together This Week — full width -->
      <div class="learn-card">
        <div class="learn-section-head">
          <span style="display:flex;align-items:center;gap:9px;"><span style="color:var(--gold);font-size:17px;">⌂</span><span class="learn-eyebrow">TOGETHER THIS WEEK</span></span>
          <small class="learn-muted">Resets Sunday</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:13px;">${togetherThisWeek}</div>
      </div>

      <!-- Week stats strip + child columns -->
      <!-- learn-week-overview WEEK AT A GLANCE -->
      <section style="display:grid;gap:14px;">
        <div style="display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;">Forms & Children</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1;margin:5px 0 0;color:var(--ink);">Individual work this week</h2>
          </div>
          <small class="learn-muted">${vm.childColumns.length} ${vm.childColumns.length === 1 ? 'learner' : 'learners'}</small>
        </div>
        ${weekStatsStrip}
        <div class="learn-child-week-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;align-items:start;">
          ${childColumnsGrid}
        </div>
      </section>
  `;

  // TEFA Edition: lessons/planner/attendance content leads, Church Rhythm
  // trails (and stays collapsed by default). Classic AGAPAY Learn: Church
  // Rhythm leads, as it always has.
  const sectionOrder = experience.tefaActive
    ? `${lessonsAndFamilyHtml}\n${togetherAndWeekHtml}\n${churchSectionHtml}`
    : `${churchSectionHtml}\n${lessonsAndFamilyHtml}\n${togetherAndWeekHtml}`;

  const body = `
    <section data-screen-label="Dashboard" style="display:flex;flex-direction:column;gap:22px;">
      ${experience.odyssey ? renderTefaViewToggleBanner(experience) : ''}
      ${sectionOrder}
    </section>
  `;
  return shell(vm, body);
}
export type LearnShell2Part2 = {
  renderTermProgressPanel: typeof renderTermProgressPanel;
  renderTodayLearnContext: typeof renderTodayLearnContext;
  weekAssignmentStorageKey: typeof weekAssignmentStorageKey;
  readWeekAssignmentState: typeof readWeekAssignmentState;
  designedAssignmentsForDate: typeof designedAssignmentsForDate;
  timeLabel: typeof timeLabel;
  eventsForDate: typeof eventsForDate;
  mealForDate: typeof mealForDate;
  choresForDate: typeof choresForDate;
  renderDesignedLessonList: typeof renderDesignedLessonList;
  renderDashboardDesignedLessons: typeof renderDashboardDesignedLessons;
  renderDashboardFamilyCards: typeof renderDashboardFamilyCards;
  renderTefaViewToggleBanner: typeof renderTefaViewToggleBanner;
  renderDashboard: typeof renderDashboard;
};
