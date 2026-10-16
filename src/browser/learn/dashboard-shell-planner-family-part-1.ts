import type {
  LearnFamilyPlannerInput,
  LearnAssignmentContext,
  LearnTruthyFilter,
  LearnShellWeekAssignment,
  LearnShellAssignment,
  LearnFamilyPlannerModel,
  LearnShellNode,
  LearnPlannerVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell-planner-family.js';

declare const eventRecurrenceOptions: LearnShellBindings['eventRecurrenceOptions'];
declare const nextSevenDates: LearnShellBindings['nextSevenDates'];
declare const choreTimeOptions: LearnShellBindings['choreTimeOptions'];
declare const isImportantPlannerFeast: LearnShellBindings['isImportantPlannerFeast'];
declare const familyEventSetupRow: LearnShellBindings['familyEventSetupRow'];
declare const recipeSetupRow: LearnShellBindings['recipeSetupRow'];
declare const grocerySetupRow: LearnShellBindings['grocerySetupRow'];
declare const ACCENTS: LearnShellBindings['ACCENTS'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const setupInput: LearnShellBindings['setupInput'];
declare const setupSelect: LearnShellBindings['setupSelect'];
declare const setupRemoveButton: LearnShellBindings['setupRemoveButton'];
declare const learnExperience: LearnShellBindings['learnExperience'];

function marketingPreviewActive() {
  return isOdysseyLearnContext() && new URLSearchParams(window.location.search).get('marketing') === '1';
}

function learnSectionHref(section: string = 'dashboard', query: string = '') {
  const regular = {
    dashboard: '/myagapay/learn',
    planner: '/myagapay/learn/planner',
    formation: '/myagapay/learn/formation',
    books: '/myagapay/learn/books',
    grades: '/myagapay/learn/grades',
    community: '/myagapay/learn/community',
    'co-op': '/myagapay/learn/co-op',
    'print-center': '/myagapay/learn/print',
    onboarding: '/myagapay/learn/setup',
  };
  const odyssey = {
    dashboard: '/learn/odyssey/dashboard',
    planner: '/learn/odyssey/dashboard/planner',
    formation: '/learn/odyssey/dashboard/formation',
    books: '/learn/odyssey/dashboard/books',
    grades: '/learn/odyssey/dashboard/grades',
    community: '/learn/odyssey/dashboard/community',
    'co-op': '/learn/odyssey/dashboard/co-op',
    'print-center': '/learn/odyssey/dashboard/print',
    onboarding: '/learn/odyssey/dashboard/setup',
  };
  const base =
    ((isOdysseyLearnContext() ? odyssey : regular) as unknown as Record<string, string | undefined>)[section] ||
    (isOdysseyLearnContext() ? odyssey.dashboard : regular.dashboard);
  const params = new URLSearchParams(query);
  if (marketingPreviewActive()) params.set('marketing', '1');
  return params.size ? `${base}?${params.toString()}` : base;
}

function plannerHref(updates: Record<string, string | null | undefined> = {}) {
  const next = new URLSearchParams(window.location.search);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  });
  return learnSectionHref('planner', next.toString());
}

function designedAssignmentsByDateForMonth(vm: LearnAssignmentContext) {
  const items = vm.week?.weeklyAssignmentItems || [];
  const itemIds = items.map((item) => item.id).join(',');
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const assignmentsByDate = new Map<string, LearnShellAssignment[]>();
  if (!itemIds || typeof localStorage === 'undefined') return assignmentsByDate;
  const prefix = 'agapay.learn.weekAssignments.';
  const suffix = `.${itemIds}`;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
      let state: Record<string, LearnShellWeekAssignment> = {};
      try {
        state = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {
        state = {};
      }
      Object.entries(state).forEach(([stateKey, saved]) => {
        const date = String(saved?.zone || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const sourceId = saved?.sourceId || stateKey.split('__auto__')[0] || stateKey;
        const item = itemLookup.get(sourceId as string) || itemLookup.get(stateKey as string);
        if (!item) return;
        const assignment = {
          ...item,
          note: saved?.note || '',
          sub: saved?.note || item.sub || '',
          color: item.color || 'var(--gold)',
        };
        if (!assignmentsByDate.has(date)) assignmentsByDate.set(date, []);
        assignmentsByDate.get(date)!.push(assignment);
      });
    }
  } catch {
    return assignmentsByDate;
  }
  return assignmentsByDate;
}

function renderWeeklyAssignmentBoard(vm: LearnPlannerVm) {
  const items = vm.week!.weeklyAssignmentItems || [];
  const graceActive = vm.graceMode?.active;
  const graceMode = vm.graceMode?.mode || 'light';
  const formOrder = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];
  const formLabels = [
    ...new Set(items.flatMap((item) => item.formLabels || []).filter((label) => label && label !== '__family')),
  ].sort((a, b) => {
    const ai = formOrder.indexOf(a);
    const bi = formOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  const card = (item: LearnShellAssignment) => {
    const priority = item.gracePriority || 'keep';
    const isDeferrable = priority === 'bump if needed' || priority === 'defer if needed';
    const isReducible = priority === 'reduce first';
    const graceClass = isDeferrable ? 'defer' : isReducible ? 'reduce' : priority === 'skip' ? 'skip' : 'keep';
    const graceLabel = isDeferrable ? 'Defer' : isReducible ? 'Reduce' : priority === 'skip' ? 'Skip' : 'Core';
    const minsLabel = item.minutes > 0 ? `${item.minutes}m` : '';
    const appliedClass = graceActive && (isDeferrable || isReducible) ? ' is-applied' : '';
    const itemFormLabels = item.formLabels || [];
    const isFamilyItem =
      !itemFormLabels.length || itemFormLabels.includes('__family') || itemFormLabels.includes('Household Form');
    const cardClass = [
      'learn-week-assignment-card',
      isFamilyItem ? 'is-family-card' : '',
      graceActive && isDeferrable ? 'is-grace-deferred' : '',
      graceActive && isReducible ? 'is-grace-reduced' : '',
    ]
      .filter(Boolean as unknown as LearnTruthyFilter)
      .join(' ');
    // Chips row: family tag (if applicable) + minutes badge + grace chip
    const familyChip = isFamilyItem
      ? `<span class="learn-family-card-chip" title="Family — Everyone subject">◈ Family</span>`
      : '';
    const chipsHtml = `<div class="learn-week-assignment-chips">${familyChip}${minsLabel ? `<span class="learn-week-assignment-minutes">${html(minsLabel)}</span>` : ''}<span class="learn-grace-chip learn-grace-chip--${graceClass}${appliedClass}">${graceLabel}</span></div>`;
    // Expand button (opens modal via JS)
    const expandBtn = `<button type="button" class="learn-week-card-expand" data-card-expand data-item-id="${html(item.id)}" aria-label="Edit ${html(item.title)}" title="Edit details"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8L10 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    return `<article class="${cardClass}" draggable="true" data-week-assignment-card data-item-id="${html(item.id)}" data-week-assignment-kind="${html(item.kind || '')}" data-week-form-labels="${html((item.formLabels || []).join('|'))}" data-statuses="${html((item.statuses || []).join(','))}" data-weekly-frequency="${html(item.weeklyFrequency || '')}" data-grace-priority="${html(priority)}" data-item-sub="${html(item.sub || '')}" data-item-color="${html(item.color || '')}" style="border-left-color:${html(item.color || 'var(--gold)')}"><div class="learn-week-assignment-card-head"><div class="learn-week-assignment-card-body"><strong>${html(item.title)}</strong>${chipsHtml}</div>${expandBtn}</div><textarea data-week-assignment-note placeholder="Specify chapters, pages, lessons, or notes for this day" style="display:none">${html(item.sub || '')}</textarea></article>`;
  };
  const weekNum = vm.week!.termWeekNumber || 0;
  const totalWeeks = vm.week!.totalTermWeeks || 0;
  const weekLabel = weekNum && totalWeeks ? `Week ${weekNum} of ${totalWeeks}` : vm.week!.label || 'This Week';
  const weekStartDate = vm.week!.weekStartDate || vm.week!.days?.[0]?.date || '';
  const weekEndDate = vm.week!.weekEndDate || vm.week!.days?.[6]?.date || '';
  return `
    <section class="learn-week-assignment-board" data-week-assignment-board data-week-key="${html([vm.week!.days[0]?.date, vm.week!.days[6]?.date].filter(Boolean as unknown as LearnTruthyFilter).join('_'))}" data-week-start="${html(weekStartDate)}" data-week-end="${html(weekEndDate)}">
      <div class="learn-week-assignment-head">
        <div>
          <div>WEEKLY PLANNER</div>
          <h2>${html(vm.week!.label || 'This Week')}</h2>
        </div>
        <div class="learn-week-nav" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" data-week-nav="-1" aria-label="Previous week" style="border:1px solid var(--line);background:var(--paper2);color:var(--ink);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;">← Prev</button>
            <span style="font-size:13px;color:var(--muted);white-space:nowrap;padding:0 4px;">${html(weekLabel)}</span>
            <button type="button" data-week-nav="1" aria-label="Next week" style="border:1px solid var(--line);background:var(--paper2);color:var(--ink);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;">Next →</button>
            <button type="button" data-week-nav="today" style="border:1px solid var(--goldsoft);background:var(--paper);border-radius:9px;padding:8px 12px;font-family:inherit;cursor:pointer;color:var(--gold);font-weight:600;">Today</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${graceActive ? `<span class="learn-grace-mode-banner learn-grace-mode-banner--${html(graceMode)}" title="Grace Mode is active — badges show what will be kept, reduced, or deferred"><span>${graceMode === 'minimum' ? '✦' : graceMode === 'light' ? '◐' : '✦'}</span> Grace Mode: ${html(graceMode.charAt(0).toUpperCase() + graceMode.slice(1))}</span>` : `<small class="learn-week-assignment-hint">Drag a subject into a day.</small>`}
            <button type="button" data-week-designed-print>Print designed week</button>
          </div>
        </div>
      </div>
      ${
        formLabels.length
          ? `
      <div class="learn-week-controls-row">
        <div class="learn-week-form-tabs" aria-label="Planner form selector">
          <button type="button" class="learn-week-form-tab-family" data-week-form-filter="__family" aria-pressed="false" title="Show only Family — Everyone subjects so you can place them across the week">◈ Family</button>
          ${formLabels.map((label) => `<button type="button" data-week-form-filter="${html(label)}" aria-pressed="false">${html(label)}</button>`).join('')}
        </div>
        <label class="learn-family-view-toggle" title="Choose how family-wide subjects appear alongside Form subjects">
          <span class="learn-family-view-toggle-label">Show family subjects</span>
          <span class="learn-family-view-switch">
            <input type="checkbox" data-family-view-toggle>
            <span class="learn-family-view-track"><span class="learn-family-view-thumb"></span></span>
          </span>
          <span class="learn-family-view-toggle-state" data-family-view-state>in its own lane</span>
        </label>
        <div class="learn-week-bulk-actions">
          <button type="button" data-week-auto-fill>Fill from Setup</button>
          <button type="button" data-week-reset-form>Reset group</button>
        </div>
      </div>`
          : ''
      }
      <div class="learn-week-assignment-layout">
        <div class="learn-week-assignment-pool">
          <div class="learn-week-pool-heading"><strong data-pool-heading>Available subjects</strong><span data-pool-count></span></div>
          <div class="learn-week-assignment-dropzone" data-week-assignment-zone="pool">${items.length ? items.map(card).join('') : emptyState('No setup subjects are active this week.')}</div>
          <div class="learn-week-family-lane" data-family-lane hidden>
            <strong>Family — Everyone</strong>
            <div class="learn-week-assignment-dropzone learn-week-family-lane-zone" data-week-assignment-zone="pool-family"></div>
          </div>
        </div>
        <div class="learn-week-assignment-days">
          ${vm
            .week!.days.map((day) => {
              const appointments = day.events || [];
              const feastLabel = day.feast || day.feastTitle || '';
              const fastingLabel = day.isFastDay ? day.fastingType || day.fasting || 'Fast day' : '';
              const showFeastRibbon = Boolean(feastLabel || fastingLabel);
              const feastRibbon = showFeastRibbon
                ? `<div class="learn-week-day-feast${day.isFastDay ? ' is-fast' : ''}">${feastLabel ? `<span class="learn-week-day-feast-title">${html(feastLabel)}</span>` : ''}${fastingLabel ? `<span class="learn-week-day-feast-fast">${html(fastingLabel)}</span>` : ''}</div>`
                : '';
              const appointmentCard = (
                appt: LearnShellNode
              ) => `<div class="learn-week-appt-card" draggable="true" data-week-appt-drag data-appt-id="${html(appt.id || '')}" data-appt-date="${html(appt.date || day.date)}" data-appt-title="${html(appt.title || '')}" data-appt-time="${html(appt.startTime || '')}" data-appt-type="${html(appt.eventType || '')}" data-appt-location="${html(appt.location || '')}" data-appt-notes="${html(appt.notes || '')}" data-appt-recurrence="${html(appt.recurrence || 'none')}">
              <span class="learn-week-appt-handle" aria-hidden="true" title="Drag to another day">⠿</span>
              <button type="button" class="learn-week-appt-open" data-week-appt-open data-appt-id="${html(appt.id || '')}" data-appt-date="${html(appt.date || day.date)}" data-appt-title="${html(appt.title || '')}" data-appt-time="${html(appt.startTime || '')}" data-appt-type="${html(appt.eventType || '')}" data-appt-location="${html(appt.location || '')}" data-appt-notes="${html(appt.notes || '')}" data-appt-recurrence="${html(appt.recurrence || 'none')}">
                ${appt.startTime ? `<span class="learn-week-appt-time">${html(appt.startTime)}</span>` : ''}<span class="learn-week-appt-title">${html(appt.title || 'Appointment')}</span>
              </button>
            </div>`;
              const addApptButton = `<button type="button" class="learn-week-appt-add" data-week-appt-add data-appt-date="${html(day.date)}" title="Add appointment">+ Appointment</button>`;
              return `<div class="learn-week-assignment-day${day.isSunday ? ' is-sunday' : ''}"><strong>${html(day.weekday || day.weekdayLong)}<span>${html(day.shortDate || day.date)}</span></strong>${feastRibbon}<div class="learn-week-appt-list" data-week-appt-dropzone="${html(day.date)}">${appointments.map(appointmentCard).join('')}${addApptButton}</div><div class="learn-week-assignment-dropzone" data-week-assignment-zone="${html(day.date)}"></div></div>`;
            })
            .join('')}
        </div>
      </div>
      <div class="learn-week-appt-modal-backdrop" data-week-appt-modal hidden>
        <div class="learn-week-appt-modal-card">
          <button type="button" class="learn-family-modal-close" data-week-appt-modal-close aria-label="Close">×</button>
          <small>Calendar</small>
          <h2 data-week-appt-modal-title>Edit appointment</h2>
          <div class="learn-family-modal-grid">
            ${setupInput('Title', 'weekApptModal.title')}
            ${setupSelect('Type', 'weekApptModal.eventType', '', ['Appointment', 'Field Trip', 'Extracurricular', 'Name Day', 'Family'])}
            ${setupInput('Date', 'weekApptModal.date', '', { type: 'date' })}
            ${setupInput('Time', 'weekApptModal.startTime', '', { type: 'time' })}
            ${setupSelect('Repeats', 'weekApptModal.recurrence', 'none', eventRecurrenceOptions)}
            ${setupInput('Location', 'weekApptModal.location')}
            <label>Notes<textarea name="weekApptModal.notes" rows="3"></textarea></label>
          </div>
          <div class="learn-family-modal-actions">
            <button type="button" data-week-appt-delete>Delete event</button>
            <button type="button" data-week-appt-modal-close>Cancel</button>
            <button type="button" data-week-appt-save>Save event</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function plannerDates(vm: LearnFamilyPlannerInput) {
  const start = vm.familyPlanning.weekStart || vm.week.days?.[0]?.date || new Date().toISOString().slice(0, 10);
  return nextSevenDates(start);
}

function plannerDayLabel(date: string = '') {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date();
  return {
    weekday: parsed.toLocaleDateString(undefined, { weekday: 'short' }),
    long: parsed.toLocaleDateString(undefined, { weekday: 'long' }),
    short: parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

function choreCadence(chore: LearnShellNode | null | undefined = {}) {
  const raw = String(chore!.cadence || chore!.frequency || '').toLowerCase();
  if (['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(raw)) return raw;
  return chore!.day ? 'weekly' : 'daily';
}

function choreAssigneeOptions(planning: LearnShellNode = {}) {
  const household = planning.household || {};
  const names = [
    'Everyone',
    household.motherName || 'Mom',
    household.fatherName || 'Dad',
    ...(planning.children || [])
      .map((child) => child.name || child.firstName)
      .filter(Boolean as unknown as LearnTruthyFilter),
  ];
  return [...new Set(names.filter(Boolean as unknown as LearnTruthyFilter))];
}

function dayOfMonthOptions() {
  return [
    { value: '', label: 'Choose day' },
    ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}` })),
  ];
}

function choreTimeValues(value: unknown = '') {
  const values = Array.isArray(value) ? (value as string[]) : String(value || '').split(/[,\u00b7|]/);
  return values.map((item) => item.trim()).filter((item) => choreTimeOptions.includes(item));
}

function choreTimeLabel(value: unknown = '') {
  const selected = choreTimeValues(value);
  return selected.length ? selected.join(' & ') : 'Anytime';
}

function choreTimeCheckboxes(name: string, value: unknown = '') {
  const selected = choreTimeValues(value);
  return `<fieldset class="learn-chore-time-field"><legend>Time</legend>${choreTimeOptions.map((option) => `<label><input type="checkbox" name="${html(name)}" value="${html(option)}" ${selected.includes(option) ? 'checked' : ''}> ${html(option)}</label>`).join('')}<small>Select one or more.</small></fieldset>`;
}

function eventRecurrence(value: unknown = '') {
  const raw = String(value || '').toLowerCase();
  return ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(raw) ? raw : 'none';
}

function eventRecurrenceLabel(value: unknown = '') {
  return eventRecurrenceOptions.find((option) => option.value === eventRecurrence(value))?.label || 'Does not repeat';
}

function isoDateParts(value: unknown = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function eventOccursOnDate(event: LearnShellNode = {}, date: string = '') {
  if (!event.date || !date || date < event.date) return false;
  const recurrence = eventRecurrence(event.recurrence);
  if (recurrence === 'none') return event.date === date;
  const start = new Date(`${event.date}T00:00:00.000Z`);
  const target = new Date(`${date}T00:00:00.000Z`);
  const diffDays = Math.round(((target as unknown as number) - (start as unknown as number)) / 86400000);
  if (diffDays < 0) return false;
  if (recurrence === 'weekly') return diffDays % 7 === 0;
  if (recurrence === 'biweekly') return diffDays % 14 === 0;
  const startParts = isoDateParts(event.date);
  const targetParts = isoDateParts(date);
  if (!startParts || !targetParts || startParts.day !== targetParts.day) return false;
  const monthDiff = (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
  if (recurrence === 'monthly') return monthDiff >= 0;
  if (recurrence === 'quarterly') return monthDiff >= 0 && monthDiff % 3 === 0;
  return recurrence === 'yearly' && startParts.month === targetParts.month;
}

function expandFamilyEvents(events: LearnShellNode[] = [], dates: string[] = []) {
  const byDate = new Map<string, LearnShellNode[]>();
  dates.filter(Boolean as unknown as LearnTruthyFilter).forEach((date) => {
    const matches = events
      .filter((event) => eventOccursOnDate(event, date))
      .map((event) => ({ ...event, occurrenceDate: date }));
    if (matches.length) byDate.set(date, matches);
  });
  return byDate;
}

function choreSetupRow(
  chore: LearnShellNode | null | undefined = {},
  index: number = 0,
  planning: LearnShellNode = {}
) {
  const cadence = choreCadence(chore);
  const assignees = choreAssigneeOptions(planning);
  return `<article data-setup-row="chores" data-id="${html(chore!.id || '')}" class="learn-chore-editor">
    <div class="learn-chore-editor-main">
      ${setupInput('Chore', 'title', chore!.title || '')}
      ${setupSelect('Assigned to', 'assignee', chore!.assignee || 'Everyone', assignees)}
      ${setupSelect('Type', 'cadence', cadence, [
        { value: 'daily', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' },
      ])}
      ${setupRemoveButton()}
    </div>
    <div class="learn-chore-editor-schedule">
      ${setupSelect('Weekly day', 'day', chore!.day || '', ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])}
      ${setupSelect('Monthly day', 'dayOfMonth', String(chore!.dayOfMonth || ''), dayOfMonthOptions())}
      ${setupSelect('Quarter month', 'quarterMonth', String(chore!.quarterMonth || '1'), [
        { value: '1', label: '1st month' },
        { value: '2', label: '2nd month' },
        { value: '3', label: '3rd month' },
      ])}
      ${setupInput('Starts on', 'assignedDate', chore!.assignedDate || '', { type: 'date' })}
      ${choreTimeCheckboxes('timeOfDay', chore!.timeOfDay || '')}
      ${setupInput('Notes', 'notes', chore!.notes || '')}
      <label class="learn-check-field"><input type="checkbox" name="completed" ${chore!.completed ? 'checked' : ''}> Done</label>
    </div>
  </article>`;
}

function familyPlannerModel(vm: LearnFamilyPlannerInput): LearnFamilyPlannerModel {
  const planning = vm.familyPlanning || {};
  const dates = plannerDates(vm);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  const children = (planning.children || []).map((child, index) => ({
    ...child,
    name: child.name || child.firstName || `Child ${index + 1}`,
    color: child.color || ACCENTS[index % ACCENTS.length],
    initial:
      child.initial ||
      String(child.name || child.firstName || '?')
        .charAt(0)
        .toUpperCase(),
  }));
  const groceries = (planning.groceryItems || []).map((item) => ({
    ...item,
    pantry: Boolean(item.pantry || item.inPantry),
    checked: Boolean(item.checked),
  }));
  const monthDays = (vm.month?.days || []).map((day) => ({
    ...day,
    date: day.date,
    short: day.dayNumber ? `${day.weekday || ''} ${day.dayNumber}`.trim() : day.date,
    long: day.weekday || '',
    isFastDay: Boolean(day.isFastDay),
    meal: day.meal || mealByDate.get(day.date) || null,
  }));
  const calendarDates = [
    ...new Set([...dates, ...monthDays.map((day) => day.date)].filter(Boolean as unknown as LearnTruthyFilter)),
  ];
  const eventsByDate = expandFamilyEvents(planning.events || [], calendarDates);
  const weekDays = dates.map((date) => {
    const label = plannerDayLabel(date);
    const liturgical = (vm.week.days || []).find((day) => day.date === date) || {};
    return { date, ...label, ...liturgical };
  });
  return {
    planning,
    dates,
    monthKey: vm.month?.key || '',
    monthLabel: vm.month?.label || 'Month Calendar',
    weekDays,
    monthDays,
    mealByDate,
    eventsByDate,
    recipes: planning.recipes || [],
    groceries,
    chores: planning.chores || [],
    children,
  };
}

function renderFeastsPanel(model: ReturnType<typeof familyPlannerModel>, mode: string = 'week') {
  if (learnExperience().tefaActive) return '';
  const days = (mode === 'month' ? model.monthDays : model.weekDays)
    .filter((day) => day.inMonth !== false && isImportantPlannerFeast(day))
    .slice(0, mode === 'month' ? 8 : 5);

  if (mode === 'month') {
    return `<aside class="learn-family-feasts-card" style="position:static;top:auto;display:grid;grid-template-columns:minmax(170px,.55fr) minmax(0,2.45fr);gap:12px;align-items:center;padding:12px 14px;">
      <div style="min-width:0;">
        <small>Feasts this month</small>
        <strong style="font-size:24px;line-height:1;">Church Calendar</strong>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;min-width:0;">
        ${
          days.length
            ? days
                .map(
                  (
                    day
                  ) => `<article class="${day.isFastDay ? 'is-fast' : ''}" style="display:flex;grid-template-columns:none;align-items:center;gap:8px;min-width:0;flex:1 1 180px;max-width:260px;padding:8px 10px;border-radius:11px;">
          <span style="min-width:34px;min-height:34px;width:34px;height:34px;border-radius:9px;font-size:12px;flex:none;">${html(day.dayNumber || day.shortDate || day.short || day.date)}</span>
          <p style="margin:0;min-width:0;">
            <strong style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(day.feast || day.feastTitle || 'Feast day')}</strong>
            <small style="margin-top:2px;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html([day.feastRank || 'Feast', day.isFastDay ? day.fastingType || day.fasting || '' : ''].filter(Boolean as unknown as LearnTruthyFilter).join(' · '))}</small>
          </p>
        </article>`
                )
                .join('')
            : `<p class="learn-family-empty-line" style="margin:0;">No major feast markers in this range.</p>`
        }
      </div>
    </aside>`;
  }

  return `<aside class="learn-family-feasts-card">
    <div><small>Feasts this week</small><strong>Church Calendar</strong></div>
    ${
      days.length
        ? days
            .map(
              (day) => `<article class="${day.isFastDay ? 'is-fast' : ''}">
      <span>${html(day.dayNumber || day.shortDate || day.short || day.date)}</span>
      <p><strong>${html(day.feast || day.feastTitle || 'Feast day')}</strong><small>${html([day.feastRank || 'Feast', day.isFastDay ? day.fastingType || day.fasting || '' : ''].filter(Boolean as unknown as LearnTruthyFilter).join(' · '))}</small></p>
    </article>`
            )
            .join('')
        : `<p class="learn-family-empty-line">No major feast markers in this range.</p>`
    }
  </aside>`;
}

function renderFastingLegend() {
  if (learnExperience().tefaActive) {
    return `<div class="learn-family-fasting-legend" aria-label="Planner legend"><span><i class="is-today"></i> Today</span><span><i class="is-ordinary"></i> Planned day</span></div>`;
  }
  return `<div class="learn-family-fasting-legend" aria-label="Fasting legend">
    <span><i class="is-strict"></i> Fast day</span>
    <span><i class="is-feast"></i> Feast or Sunday</span>
    <span><i class="is-today"></i> Today</span>
    <span><i class="is-ordinary"></i> Ordinary day</span>
  </div>`;
}

function mealSlotLabel(slot: string) {
  return { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }[slot] || slot;
}

function plannerHiddenData(model: ReturnType<typeof familyPlannerModel>) {
  const mealDates = [
    ...new Set(
      [...model.weekDays, ...model.monthDays].map((day) => day.date).filter(Boolean as unknown as LearnTruthyFilter)
    ),
  ];
  const meals = mealDates
    .map((date) => {
      const day = model.monthDays.find((item) => item.date === date) ||
        model.weekDays.find((item) => item.date === date) || { date };
      const meal = model.mealByDate.get(day.date) || { date: day.date };
      return `<div data-setup-row="meals" data-date="${html(day.date)}" hidden><input name="date" value="${html(day.date)}"><input name="breakfast" value="${html(meal.breakfast || '')}"><input name="lunch" value="${html(meal.lunch || '')}"><input name="dinner" value="${html(meal.dinner || '')}"></div>`;
    })
    .join('');
  return `<div hidden>
    <input name="familyPlanning.fastingPreference" value="${html(model.planning.fastingPreference || 'guidance')}">
    <input name="familyPlanning.weekStart" value="${html(model.planning.weekStart || model.weekDays[0]?.date || '')}">
    <input name="household.motherName" value="${html(model.planning.household?.motherName || '')}">
    <input name="household.motherNameDay" value="${html(model.planning.household?.motherNameDay || '')}">
    <input name="household.fatherName" value="${html(model.planning.household?.fatherName || '')}">
    <input name="household.fatherNameDay" value="${html(model.planning.household?.fatherNameDay || '')}">
    <input name="household.parishPatronalFeastName" value="${html(model.planning.household?.parishPatronalFeastName || '')}">
    <input name="household.parishPatronalFeastDate" value="${html(model.planning.household?.parishPatronalFeastDate || '')}">
    ${model.children.map((child) => `<span data-family-child-id="${html(child.id || '')}" data-family-child-name="${html(child.name || '')}"><input name="childNameDay" value="${html(child.nameDay || '')}"></span>`).join('')}
    <div data-setup-list="meals">${meals}</div>
    <div data-setup-list="familyEvents">${(model.planning.events || []).map(familyEventSetupRow).join('')}</div>
    <div data-setup-list="recipes">${model.recipes.map(recipeSetupRow).join('')}</div>
    <div data-setup-list="groceryItems">${model.groceries.map(grocerySetupRow).join('')}</div>
    <div data-setup-list="chores">${model.chores.map((chore, index) => choreSetupRow(chore, index, model.planning)).join('')}</div>
  </div>`;
}

function plannerMonthQuery(model: ReturnType<typeof familyPlannerModel>) {
  const firstInMonth = (model.monthDays || []).find((day) => day.inMonth !== false && day.date)?.date || '';
  return String(model.monthKey || firstInMonth.slice(0, 7) || new Date().toISOString().slice(0, 7));
}

function renderPlannerDaySelector(model: ReturnType<typeof familyPlannerModel>, selectedDate: string) {
  return `<div class="learn-family-day-selector">${model.weekDays.map((day) => `<a href="${plannerHref({ view: 'day', date: day.date })}" class="${day.date === selectedDate ? 'is-active' : ''}"><span>${day.isSunday ? '☩' : day.isFastDay ? '✥' : '·'}</span><strong>${html(day.weekday || day.weekdayLong || day.long)}</strong><small>${html(day.shortDate || day.short || day.date)}</small></a>`).join('')}</div>`;
}

function renderMealCard(day: LearnShellNode, meal: LearnShellNode, slot: string) {
  const value = (meal as unknown as Record<string, unknown>)?.[slot] || '';
  return `<button type="button" class="learn-family-meal-card" data-meal-open data-date="${html(day.date)}" data-slot="${html(slot)}"><span>${html(mealSlotLabel(slot))}</span><strong>${html(value || 'No dish yet')}</strong><small>${value ? 'change it' : 'add a dish'} →</small></button>`;
}
export type LearnShell1Part0 = {
  marketingPreviewActive: typeof marketingPreviewActive;
  learnSectionHref: typeof learnSectionHref;
  plannerHref: typeof plannerHref;
  designedAssignmentsByDateForMonth: typeof designedAssignmentsByDateForMonth;
  renderWeeklyAssignmentBoard: typeof renderWeeklyAssignmentBoard;
  plannerDates: typeof plannerDates;
  plannerDayLabel: typeof plannerDayLabel;
  choreCadence: typeof choreCadence;
  choreAssigneeOptions: typeof choreAssigneeOptions;
  dayOfMonthOptions: typeof dayOfMonthOptions;
  choreTimeValues: typeof choreTimeValues;
  choreTimeLabel: typeof choreTimeLabel;
  choreTimeCheckboxes: typeof choreTimeCheckboxes;
  eventRecurrence: typeof eventRecurrence;
  eventRecurrenceLabel: typeof eventRecurrenceLabel;
  isoDateParts: typeof isoDateParts;
  eventOccursOnDate: typeof eventOccursOnDate;
  expandFamilyEvents: typeof expandFamilyEvents;
  choreSetupRow: typeof choreSetupRow;
  familyPlannerModel: typeof familyPlannerModel;
  renderFeastsPanel: typeof renderFeastsPanel;
  renderFastingLegend: typeof renderFastingLegend;
  mealSlotLabel: typeof mealSlotLabel;
  plannerHiddenData: typeof plannerHiddenData;
  plannerMonthQuery: typeof plannerMonthQuery;
  renderPlannerDaySelector: typeof renderPlannerDaySelector;
  renderMealCard: typeof renderMealCard;
};
