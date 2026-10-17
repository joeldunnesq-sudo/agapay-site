// Generated from src/browser/learn/dashboard-shell-planner-family.ts by npm run build:browser. Do not edit.
function truthyLearnPlanner1(value) {
  return Boolean(value);
}
function marketingPreviewActive() {
  return isOdysseyLearnContext() && new URLSearchParams(window.location.search).get('marketing') === '1';
}
function learnSectionHref(section = 'dashboard', query = '') {
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
    (isOdysseyLearnContext() ? odyssey : regular)[section] ||
    (isOdysseyLearnContext() ? odyssey.dashboard : regular.dashboard);
  const params = new URLSearchParams(query);
  if (marketingPreviewActive()) params.set('marketing', '1');
  return params.size ? `${base}?${params.toString()}` : base;
}
function plannerHref(updates = {}) {
  const next = new URLSearchParams(window.location.search);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === void 0 || value === '') next.delete(key);
    else next.set(key, value);
  });
  return learnSectionHref('planner', next.toString());
}
function designedAssignmentsByDateForMonth(vm) {
  const items = vm.week?.weeklyAssignmentItems || [];
  const itemIds = items.map((item) => item.id).join(',');
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const assignmentsByDate = /* @__PURE__ */ new Map();
  if (!itemIds || typeof localStorage === 'undefined') return assignmentsByDate;
  const prefix = 'agapay.learn.weekAssignments.';
  const suffix = `.${itemIds}`;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
      let state = {};
      try {
        state = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {
        state = {};
      }
      Object.entries(state).forEach(([stateKey, saved]) => {
        const date = String(saved?.zone || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const sourceId = saved?.sourceId || stateKey.split('__auto__')[0] || stateKey;
        const item = itemLookup.get(sourceId) || itemLookup.get(stateKey);
        if (!item) return;
        const assignment = {
          ...item,
          note: saved?.note || '',
          sub: saved?.note || item.sub || '',
          color: item.color || 'var(--gold)',
        };
        if (!assignmentsByDate.has(date)) assignmentsByDate.set(date, []);
        assignmentsByDate.get(date).push(assignment);
      });
    }
  } catch {
    return assignmentsByDate;
  }
  return assignmentsByDate;
}
function renderWeeklyAssignmentBoard(vm) {
  const items = vm.week.weeklyAssignmentItems || [];
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
  const card = (item) => {
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
      .filter(truthyLearnPlanner1)
      .join(' ');
    const familyChip = isFamilyItem
      ? `<span class="learn-family-card-chip" title="Family — Everyone subject">◈ Family</span>`
      : '';
    const chipsHtml = `<div class="learn-week-assignment-chips">${familyChip}${minsLabel ? `<span class="learn-week-assignment-minutes">${html(minsLabel)}</span>` : ''}<span class="learn-grace-chip learn-grace-chip--${graceClass}${appliedClass}">${graceLabel}</span></div>`;
    const expandBtn = `<button type="button" class="learn-week-card-expand" data-card-expand data-item-id="${html(item.id)}" aria-label="Edit ${html(item.title)}" title="Edit details"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8L10 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    return `<article class="${cardClass}" draggable="true" data-week-assignment-card data-item-id="${html(item.id)}" data-week-assignment-kind="${html(item.kind || '')}" data-week-form-labels="${html((item.formLabels || []).join('|'))}" data-statuses="${html((item.statuses || []).join(','))}" data-weekly-frequency="${html(item.weeklyFrequency || '')}" data-grace-priority="${html(priority)}" data-item-sub="${html(item.sub || '')}" data-item-color="${html(item.color || '')}" style="border-left-color:${html(item.color || 'var(--gold)')}"><div class="learn-week-assignment-card-head"><div class="learn-week-assignment-card-body"><strong>${html(item.title)}</strong>${chipsHtml}</div>${expandBtn}</div><textarea data-week-assignment-note placeholder="Specify chapters, pages, lessons, or notes for this day" style="display:none">${html(item.sub || '')}</textarea></article>`;
  };
  const weekNum = vm.week.termWeekNumber || 0;
  const totalWeeks = vm.week.totalTermWeeks || 0;
  const weekLabel = weekNum && totalWeeks ? `Week ${weekNum} of ${totalWeeks}` : vm.week.label || 'This Week';
  const weekStartDate = vm.week.weekStartDate || vm.week.days?.[0]?.date || '';
  const weekEndDate = vm.week.weekEndDate || vm.week.days?.[6]?.date || '';
  return `
    <section class="learn-week-assignment-board" data-week-assignment-board data-week-key="${html([vm.week.days[0]?.date, vm.week.days[6]?.date].filter(truthyLearnPlanner1).join('_'))}" data-week-start="${html(weekStartDate)}" data-week-end="${html(weekEndDate)}">
      <div class="learn-week-assignment-head">
        <div>
          <div>WEEKLY PLANNER</div>
          <h2>${html(vm.week.label || 'This Week')}</h2>
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
          ${vm.week.days
            .map((day) => {
              const appointments = day.events || [];
              const feastLabel = day.feast || day.feastTitle || '';
              const fastingLabel = day.isFastDay ? day.fastingType || day.fasting || 'Fast day' : '';
              const showFeastRibbon = Boolean(feastLabel || fastingLabel);
              const feastRibbon = showFeastRibbon
                ? `<div class="learn-week-day-feast${day.isFastDay ? ' is-fast' : ''}">${feastLabel ? `<span class="learn-week-day-feast-title">${html(feastLabel)}</span>` : ''}${fastingLabel ? `<span class="learn-week-day-feast-fast">${html(fastingLabel)}</span>` : ''}</div>`
                : '';
              const appointmentCard = (
                appt
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
function plannerDates(vm) {
  const start =
    vm.familyPlanning.weekStart || vm.week.days?.[0]?.date || /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  return nextSevenDates(start);
}
function plannerDayLabel(date = '') {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? /* @__PURE__ */ new Date(`${date}T12:00:00`)
    : /* @__PURE__ */ new Date();
  return {
    weekday: parsed.toLocaleDateString(void 0, { weekday: 'short' }),
    long: parsed.toLocaleDateString(void 0, { weekday: 'long' }),
    short: parsed.toLocaleDateString(void 0, { month: 'short', day: 'numeric' }),
  };
}
function choreCadence(chore = {}) {
  const raw = String(chore.cadence || chore.frequency || '').toLowerCase();
  if (['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(raw)) return raw;
  return chore.day ? 'weekly' : 'daily';
}
function choreAssigneeOptions(planning = {}) {
  const household = planning.household || {};
  const names = [
    'Everyone',
    household.motherName || 'Mom',
    household.fatherName || 'Dad',
    ...(planning.children || []).map((child) => child.name || child.firstName).filter(truthyLearnPlanner1),
  ];
  return [...new Set(names.filter(truthyLearnPlanner1))];
}
function dayOfMonthOptions() {
  return [
    { value: '', label: 'Choose day' },
    ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}` })),
  ];
}
function choreTimeValues(value = '') {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,\u00b7|]/);
  return values.map((item) => item.trim()).filter((item) => choreTimeOptions.includes(item));
}
function choreTimeLabel(value = '') {
  const selected = choreTimeValues(value);
  return selected.length ? selected.join(' & ') : 'Anytime';
}
function choreTimeCheckboxes(name, value = '') {
  const selected = choreTimeValues(value);
  return `<fieldset class="learn-chore-time-field"><legend>Time</legend>${choreTimeOptions.map((option) => `<label><input type="checkbox" name="${html(name)}" value="${html(option)}" ${selected.includes(option) ? 'checked' : ''}> ${html(option)}</label>`).join('')}<small>Select one or more.</small></fieldset>`;
}
function eventRecurrence(value = '') {
  const raw = String(value || '').toLowerCase();
  return ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(raw) ? raw : 'none';
}
function eventRecurrenceLabel(value = '') {
  return eventRecurrenceOptions.find((option) => option.value === eventRecurrence(value))?.label || 'Does not repeat';
}
function isoDateParts(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
function eventOccursOnDate(event = {}, date = '') {
  if (!event.date || !date || date < event.date) return false;
  const recurrence = eventRecurrence(event.recurrence);
  if (recurrence === 'none') return event.date === date;
  const start = /* @__PURE__ */ new Date(`${event.date}T00:00:00.000Z`);
  const target = /* @__PURE__ */ new Date(`${date}T00:00:00.000Z`);
  const diffDays = Math.round((Number(target) - Number(start)) / 864e5);
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
function expandFamilyEvents(events = [], dates = []) {
  const byDate = /* @__PURE__ */ new Map();
  dates.filter(truthyLearnPlanner1).forEach((date) => {
    const matches = events
      .filter((event) => eventOccursOnDate(event, date))
      .map((event) => ({ ...event, occurrenceDate: date }));
    if (matches.length) byDate.set(date, matches);
  });
  return byDate;
}
function choreSetupRow(chore = {}, index = 0, planning = {}) {
  const cadence = choreCadence(chore);
  const assignees = choreAssigneeOptions(planning);
  return `<article data-setup-row="chores" data-id="${html(chore.id || '')}" class="learn-chore-editor">
    <div class="learn-chore-editor-main">
      ${setupInput('Chore', 'title', chore.title || '')}
      ${setupSelect('Assigned to', 'assignee', chore.assignee || 'Everyone', assignees)}
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
      ${setupSelect('Weekly day', 'day', chore.day || '', ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])}
      ${setupSelect('Monthly day', 'dayOfMonth', String(chore.dayOfMonth || ''), dayOfMonthOptions())}
      ${setupSelect('Quarter month', 'quarterMonth', String(chore.quarterMonth || '1'), [
        { value: '1', label: '1st month' },
        { value: '2', label: '2nd month' },
        { value: '3', label: '3rd month' },
      ])}
      ${setupInput('Starts on', 'assignedDate', chore.assignedDate || '', { type: 'date' })}
      ${choreTimeCheckboxes('timeOfDay', chore.timeOfDay || '')}
      ${setupInput('Notes', 'notes', chore.notes || '')}
      <label class="learn-check-field"><input type="checkbox" name="completed" ${chore.completed ? 'checked' : ''}> Done</label>
    </div>
  </article>`;
}
function familyPlannerModel(vm) {
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
  const calendarDates = [...new Set([...dates, ...monthDays.map((day) => day.date)].filter(truthyLearnPlanner1))];
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
function renderFeastsPanel(model, mode = 'week') {
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
            <small style="margin-top:2px;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html([day.feastRank || 'Feast', day.isFastDay ? day.fastingType || day.fasting || '' : ''].filter(truthyLearnPlanner1).join(' · '))}</small>
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
      <p><strong>${html(day.feast || day.feastTitle || 'Feast day')}</strong><small>${html([day.feastRank || 'Feast', day.isFastDay ? day.fastingType || day.fasting || '' : ''].filter(truthyLearnPlanner1).join(' · '))}</small></p>
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
function mealSlotLabel(slot) {
  return { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }[slot] || slot;
}
function plannerHiddenData(model) {
  const mealDates = [
    ...new Set([...model.weekDays, ...model.monthDays].map((day) => day.date).filter(truthyLearnPlanner1)),
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
function plannerMonthQuery(model) {
  const firstInMonth = (model.monthDays || []).find((day) => day.inMonth !== false && day.date)?.date || '';
  return String(model.monthKey || firstInMonth.slice(0, 7) || /* @__PURE__ */ new Date().toISOString().slice(0, 7));
}
function renderPlannerDaySelector(model, selectedDate) {
  return `<div class="learn-family-day-selector">${model.weekDays.map((day) => `<a href="${plannerHref({ view: 'day', date: day.date })}" class="${day.date === selectedDate ? 'is-active' : ''}"><span>${day.isSunday ? '☩' : day.isFastDay ? '✥' : '·'}</span><strong>${html(day.weekday || day.weekdayLong || day.long)}</strong><small>${html(day.shortDate || day.short || day.date)}</small></a>`).join('')}</div>`;
}
function renderMealCard(day, meal, slot) {
  const value = meal?.[slot] || '';
  return `<button type="button" class="learn-family-meal-card" data-meal-open data-date="${html(day.date)}" data-slot="${html(slot)}"><span>${html(mealSlotLabel(slot))}</span><strong>${html(value || 'No dish yet')}</strong><small>${value ? 'change it' : 'add a dish'} →</small></button>`;
}
function truthyLearnPlanner2(value) {
  return Boolean(value);
}
function renderMealsPlan(model, displayView, vm) {
  const selectedDate =
    new URLSearchParams(window.location.search).get('date') || vm.day?.selected?.date || model.weekDays[0]?.date || '';
  if (displayView === 'day') {
    const day = model.weekDays.find((item) => item.date === selectedDate) || model.weekDays[0] || {};
    const meal = model.mealByDate.get(day.date) || {};
    return `<div class="learn-family-prototype">${renderPlannerDaySelector(model, day.date)}<section class="learn-family-day-hero ${day.isFastDay ? 'is-fast' : ''}"><div><small>${html(day.long || day.weekdayLong || 'Today')}</small><h2>${html(day.weekdayLong || day.long || 'Selected Day')} · ${html(day.shortDate || day.short || day.date)}</h2><p>${html(day.feast || 'Household rhythm')} ${day.fasting ? `· ${html(day.fasting)}` : ''}</p></div><button type="button" data-event-open data-date="${html(day.date)}">+ Add to calendar</button></section><section class="learn-family-card-grid learn-family-card-grid-three">${['breakfast', 'lunch', 'dinner'].map((slot) => renderMealCard(day, meal, slot)).join('')}</section></div>`;
  }
  if (displayView === 'month') {
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, 'month')}${renderFamilyMonthOverview(model, 'meals')}${renderFastingLegend()}</div>`;
  }
  const todayIso = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
  return `<div class="learn-family-week-layout"><section class="learn-family-week-board"><div class="learn-family-week-scroll"><div class="learn-family-week-head"><span></span>${model.weekDays
    .map((day) => {
      const isToday = day.date === todayIso;
      const hasFeast = Boolean(day.feast || day.feastTitle) || day.isSunday;
      const stateClass = day.isFastDay ? 'is-fast' : hasFeast ? 'is-feast' : isToday ? 'is-today' : 'is-ordinary';
      const labelText = day.isFastDay
        ? day.fastingType || day.fasting || 'Fast'
        : day.feast || day.feastTitle || (day.isSunday ? 'Sunday' : '');
      return `<strong class="${stateClass}">${html(day.weekday || day.weekdayLong)}<small>${html(day.shortDate || day.short)}</small>${labelText ? `<em>${html(labelText)}</em>` : ''}</strong>`;
    })
    .join(
      ''
    )}</div>${['breakfast', 'lunch', 'dinner'].map((slot) => `<div class="learn-family-week-row"><strong>${html(mealSlotLabel(slot))}</strong>${model.weekDays.map((day) => `<div>${renderMealCard(day, model.mealByDate.get(day.date) || {}, slot)}</div>`).join('')}</div>`).join('')}</div></section><div style="display:grid;gap:14px;">${renderFeastsPanel(model, 'week')}${renderFastingLegend()}</div></div>`;
}
function renderRecipesTool(model) {
  return `<section class="learn-family-tool-grid"><div class="learn-family-section-note"><strong>Recipe Library</strong><span>Add family recipes once, mark fasting fit, then choose them from the meal picker.</span><button type="button" data-recipe-open>+ New recipe</button></div><div class="learn-family-recipe-grid">${(model.recipes.length ? model.recipes : [{ title: 'Add your first recipe', fastingType: 'free', category: 'Family favorite' }]).map((recipe) => `<article class="learn-family-recipe-card" data-recipe-title="${html(recipe.title || '')}" data-recipe-fasting="${html(recipe.fastingType || '')}" data-recipe-category="${html(recipe.category || '')}" data-recipe-source="${html(recipe.sourceUrl || '')}" data-recipe-ingredients="${html(recipe.ingredients || '')}" data-recipe-instructions="${html(recipe.instructions || '')}"><div><span>☰</span><small>${html(recipe.fastingType || 'Any day')}</small></div><h3>${html(recipe.title || 'Untitled Recipe')}</h3><p>${html(recipe.category || 'Recipe')}</p><button type="button" data-recipe-open>Edit recipe</button></article>`).join('')}</div></section>`;
}
function renderGroceriesTool(model) {
  const byCategory = /* @__PURE__ */ new Map();
  const shoppingItems = model.groceries.filter((item) => !item.pantry);
  shoppingItems.forEach((item) => {
    const category = item.category || 'Other';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(item);
  });
  const pantryCount = model.groceries.filter((item) => item.pantry).length;
  return `<section class="learn-family-grocery-layout">
    <div class="learn-family-section-note"><strong>Grocery List</strong><span>Build the weekly list from the menu. Pantry staples stay out of the shopping list unless you mark them as needed.</span><button type="button" data-grocery-add>+ Add grocery</button></div>
    <div class="learn-family-grocery-summary">${[...byCategory.entries()].length ? [...byCategory.entries()].map(([category, items]) => `<div class="learn-family-aisle"><strong>${html(category)}</strong>${items.map((item) => `<label class="${item.checked ? 'is-checked' : ''}"><input type="checkbox" ${item.checked ? 'checked' : ''}> ${html(item.quantity ? `${item.quantity} ` : '')}${html(item.name)}</label>`).join('')}</div>`).join('') : emptyState('No grocery items yet. Add items from recipes or the grocery button.')}</div>
    <aside class="learn-family-shopping-card"><small>Shopping rhythm</small><h3>Weekly list</h3><p>${html(String(shoppingItems.length))} item${shoppingItems.length === 1 ? '' : 's'} to shop · ${html(String(pantryCount))} pantry staple${pantryCount === 1 ? '' : 's'} saved.</p><a href="${plannerHref({ scope: 'meals', tool: 'pantry', view: 'week', term: null, termId: null })}">Review pantry →</a></aside>
  </section>`;
}
function renderPantryTool(model) {
  const pantryItems = model.groceries.filter((item) => item.inPantry || item.pantry || item.have);
  return `<section class="learn-family-pantry-layout">
    <div class="learn-family-section-note"><strong>Pantry</strong><span>Your pantry tells the grocery list what you already have. Staples here are kept apart from the shopping list so you shop only for what is missing.</span><button type="button" data-grocery-add data-pantry-add>+ Add staple</button></div>
    <div class="learn-family-pantry-cloud">${pantryItems.length ? pantryItems.map((item) => `<span>${html(item.name || item.title || item.item)}<button type="button" data-grocery-remove="${html(item.id || '')}" aria-label="Remove ${html(item.name || item.title || 'item')}">×</button></span>`).join('') : `<p class="learn-family-empty-line">No pantry staples yet. Add staples like rice, flour, olive oil, beans, or leftovers.</p>`}</div>
    <aside><small>Why it matters</small><p>Pantry staples and leftovers should shape the week instead of hiding in your cabinets. This keeps meal planning practical, fast-aware, and less wasteful.</p></aside>
  </section>`;
}
function renderFamilyMonthOverview(model, scope = 'meals') {
  const cells = model.monthDays.length ? model.monthDays : model.weekDays;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthlyChoresForDay = (day) =>
    (model.chores || []).filter((chore) => {
      if (!['monthly', 'quarterly', 'yearly'].includes(choreCadence(chore))) return false;
      return choreDueOnDay(chore, day);
    });
  const monthlyChoresByAssignee = (day) => {
    const groups = /* @__PURE__ */ new Map();
    monthlyChoresForDay(day).forEach((chore) => {
      const key = chore.assignee || 'Everyone';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(chore);
    });
    return [...groups.entries()];
  };
  const headerAction =
    scope === 'meals'
      ? `<a href="${plannerHref({ scope: 'meals', tool: 'groceries', view: 'month', month: plannerMonthQuery(model), term: null, termId: null })}">Grocery list →</a>`
      : scope === 'chores'
        ? `<a href="${plannerHref({ scope: 'chores', view: 'week', month: plannerMonthQuery(model), term: null, termId: null })}">Week view →</a>`
        : `<span></span>`;
  return `<section class="learn-family-month-card">
    <header><div><small>${html(scope === 'meals' ? 'Meal calendar' : scope === 'events' ? 'Family calendar' : 'Scheduled chores')}</small><h3>${html(model.monthLabel)}</h3></div>${headerAction}</header>
    <div class="learn-family-month-weekdays">${weekdays.map((day) => `<span>${html(day)}</span>`).join('')}</div>
    <div class="learn-family-month-board is-full-month">${cells
      .map((day) => {
        const meal = day.meal || model.mealByDate.get(day.date) || {};
        const events = model.eventsByDate.get(day.date) || [];
        const monthlyChores = monthlyChoresByAssignee(day);
        const feastLabel = day.feast || day.feastTitle || '';
        const fastingLabel = day.fastingType || day.fasting || day.fastingRule || '';
        const scopeText =
          scope === 'meals'
            ? meal.dinner || meal.lunch || meal.breakfast || ''
            : scope === 'chores'
              ? monthlyChores.length
                ? `${monthlyChores.reduce((sum, [, chores]) => sum + chores.length, 0)} scheduled chore${monthlyChores.reduce((sum, [, chores]) => sum + chores.length, 0) === 1 ? '' : 's'}`
                : ''
              : events[0]?.title || '';
        const addButton =
          scope === 'meals'
            ? `<button type="button" data-meal-open data-date="${html(day.date)}" data-slot="dinner">${html(scopeText ? 'Edit dinner' : '+ Dinner')}</button>`
            : scope === 'events'
              ? `<button type="button" data-event-open data-date="${html(day.date)}">${html(scopeText ? 'Edit' : '+ Event')}</button>`
              : `<button type="button" data-chore-open data-cadence="monthly" data-day-of-month="${html(day.dayNumber || '')}" data-assigned-date="${html(day.date || '')}" data-assignee="Everyone">+ Monthly chore</button>`;
        return `<article class="${day.inMonth === false ? 'is-muted' : ''} ${day.isFastDay ? 'is-fast' : ''} ${day.isSunday ? 'is-feast' : ''}">
      <div><strong>${html(day.weekday || day.weekdayLong || '')}</strong><span>${html(day.dayNumber || day.shortDate || day.short)}</span></div>
      <small>${html([fastingLabel, feastLabel].filter(truthyLearnPlanner2).join(' · ') || 'Household day')}</small>
      ${
        scope === 'meals'
          ? `<p>${html(scopeText || (day.isFastDay ? 'Fast-aware meal plan' : day.isSunday || feastLabel ? 'Feast-day meal plan' : 'Plan dinner'))}</p>${[
              'breakfast',
              'lunch',
              'dinner',
            ]
              .filter((slot) => meal[slot])
              .map((slot) => `<em>${html(mealSlotLabel(slot))}: ${html(meal[slot])}</em>`)
              .join('')}`
          : scope === 'chores'
            ? monthlyChores.length
              ? `<div class="learn-family-month-chore-list">${monthlyChores.map(([assignee, chores]) => `<span><strong>${html(assignee)}</strong><small>${html(chores.map((chore) => `${chore.title || 'Chore'} (${choreTimeLabel(chore.timeOfDay)})`).join(', '))}</small></span>`).join('')}</div>`
              : `<p>${html(day.inMonth === false ? '' : 'No monthly chores')}</p>`
            : `<p>${html(scopeText || 'Plan')}</p>`
      }
      ${events
        .slice(0, 2)
        .map((event) => `<em>${html(event.startTime || '')} ${html(event.title)}</em>`)
        .join('')}
      ${addButton}
    </article>`;
      })
      .join('')}</div>
  </section>`;
}
function monthDiffBetween(startParts, targetParts) {
  return (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
}
function choreAssignedParts(chore = {}) {
  return isoDateParts(chore.assignedDate || chore.startDate || chore.date || '');
}
function choreDueOnDay(chore = {}, day = {}) {
  const date = day.date || '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? /* @__PURE__ */ new Date(`${date}T12:00:00`) : null;
  const cadence = choreCadence(chore);
  const weekday = day.weekdayLong || day.long || plannerDayLabel(date).long;
  if (cadence === 'daily') return true;
  if (cadence === 'weekly') return !chore.day || chore.day === weekday;
  if (!parsed) return false;
  const assigned = choreAssignedParts(chore);
  const target = isoDateParts(date);
  if (assigned && target) {
    const monthDiff = monthDiffBetween(assigned, target);
    const dueDay = Number(chore.dayOfMonth || assigned.day);
    if (monthDiff < 0 || (monthDiff === 0 && target.day < assigned.day)) return false;
    if (target.day !== dueDay) return false;
    if (cadence === 'monthly') return true;
    if (cadence === 'quarterly') return monthDiff % 3 === 0;
    if (cadence === 'yearly') return monthDiff % 12 === 0;
  }
  const choreDay = Number(chore.dayOfMonth || 0);
  if (cadence === 'monthly') return !choreDay || choreDay === parsed.getDate();
  if (cadence === 'quarterly') {
    const quarterSlot = String((parsed.getMonth() % 3) + 1);
    return (
      (!chore.quarterMonth || String(chore.quarterMonth) === quarterSlot) &&
      (!choreDay || choreDay === parsed.getDate())
    );
  }
  if (cadence === 'yearly') return false;
  return false;
}
function choreScheduleLabel(chore = {}) {
  const cadence = choreCadence(chore);
  const time = choreTimeLabel(chore.timeOfDay);
  const schedule =
    cadence === 'daily'
      ? 'Daily'
      : cadence === 'weekly'
        ? chore.day
          ? `Weekly · ${chore.day}`
          : 'Weekly'
        : cadence === 'monthly'
          ? chore.dayOfMonth
            ? `Monthly · day ${chore.dayOfMonth}`
            : 'Monthly'
          : cadence === 'quarterly'
            ? `Quarterly${chore.assignedDate ? ` · from ${chore.assignedDate}` : chore.quarterMonth ? ` · month ${chore.quarterMonth}` : ''}${chore.dayOfMonth ? ` · day ${chore.dayOfMonth}` : ''}`
            : `Yearly${chore.assignedDate ? ` · ${chore.assignedDate.slice(5)}` : ''}${chore.dayOfMonth ? ` · day ${chore.dayOfMonth}` : ''}`;
  return `${schedule} · ${time}`;
}
function choreOpenAttributes(chore = null, personName = '', day = {}) {
  const dayLabel = day.weekdayLong || day.long || '';
  const attrs = [
    `data-chore-open`,
    `data-assignee="${html(personName)}"`,
    `data-day="${html(dayLabel)}"`,
    `data-assigned-date="${html(day.date || '')}"`,
  ];
  if (chore) {
    attrs.push(
      `data-chore-existing="1"`,
      `data-chore-id="${html(chore.id || '')}"`,
      `data-chore-title="${html(chore.title || '')}"`,
      `data-chore-assignee="${html(chore.assignee || 'Everyone')}"`,
      `data-chore-cadence="${html(choreCadence(chore))}"`,
      `data-chore-day="${html(chore.day || dayLabel)}"`,
      `data-chore-day-of-month="${html(chore.dayOfMonth || '')}"`,
      `data-chore-quarter-month="${html(chore.quarterMonth || '1')}"`,
      `data-chore-assigned-date="${html(chore.assignedDate || '')}"`,
      `data-chore-time-of-day="${html(chore.timeOfDay || 'Anytime')}"`,
      `data-chore-notes="${html(chore.notes || '')}"`
    );
  }
  return attrs.join(' ');
}
function renderChoresScope(model, displayView) {
  const people = [
    { name: 'Everyone', color: 'var(--navy)', initial: '✥' },
    ...model.children.filter((child) => child.name),
  ];
  const choresForPersonDay = (person, day) =>
    model.chores.filter((item) => (item.assignee || 'Everyone') === person.name && choreDueOnDay(item, day));
  const renderChoreButton = (chore, person, day) =>
    `<button type="button" class="learn-family-mini-card" ${choreOpenAttributes(chore, person.name, day)}><strong>${html(chore.title || 'Chore')}</strong><small>${html(choreScheduleLabel(chore))}</small></button>`;
  const addChoreButton = (person, day, compact = false) =>
    `<button type="button" class="${compact ? 'learn-family-mini-card learn-family-add-chore-card' : 'learn-family-add-chore-card'}" ${choreOpenAttributes(null, person.name, day)}><strong>+ Add chore</strong><small>${html(day.weekday || day.weekdayLong || day.long || 'Day')}</small></button>`;
  if (displayView === 'month') {
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFamilyMonthOverview(model, 'chores')}${renderFastingLegend()}</div>`;
  }
  if (displayView === 'day') {
    const selectedDate = new URLSearchParams(window.location.search).get('date') || model.weekDays[0]?.date || '';
    const day = model.weekDays.find((item) => item.date === selectedDate) || model.weekDays[0] || {};
    return `<div class="learn-family-prototype">${renderPlannerDaySelector(model, day.date)}<section class="learn-family-card-grid">${people
      .map((person) => {
        const chores = choresForPersonDay(person, day);
        return `<article class="learn-family-person-card" style="--person-color:${html(person.color)};"><span>${html(person.initial || person.name.slice(0, 1) || '•')}</span><strong>${html(person.name)}</strong>${chores.length ? `<div class="learn-family-chore-stack">${chores.map((chore) => renderChoreButton(chore, person, day)).join('')}</div>` : `<p>${html(day.isSunday ? 'Rest' : 'Choose a chore')}</p>`}<button type="button" ${choreOpenAttributes(null, person.name, day)}>Add chore</button></article>`;
      })
      .join('')}</section></div>`;
  }
  return `<section class="learn-family-week-board"><div class="learn-family-week-scroll"><div class="learn-family-week-head"><span></span>${model.weekDays.map((day) => `<strong>${html(day.weekday || day.weekdayLong)}<small>${html(day.shortDate || day.short)}</small></strong>`).join('')}</div>${people
    .map(
      (person) =>
        `<div class="learn-family-week-row learn-family-chore-row" style="--person-color:${html(person.color)};"><strong><span>${html(person.initial || person.name.slice(0, 1) || '•')}</span>${html(person.name)}</strong>${model.weekDays
          .map((day) => {
            const chores = choresForPersonDay(person, day);
            return `<div><div class="learn-family-chore-stack">${chores.map((chore) => renderChoreButton(chore, person, day)).join('')}${addChoreButton(person, day, true)}</div></div>`;
          })
          .join('')}</div>`
    )
    .join('')}</div></section>`;
}
function renderEventsScope(model, displayView) {
  const selectedDate = new URLSearchParams(window.location.search).get('date') || model.weekDays[0]?.date || '';
  const days = displayView === 'day' ? model.weekDays.filter((day) => day.date === selectedDate) : model.weekDays;
  if (displayView === 'month')
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, 'month')}${renderFamilyMonthOverview(model, 'events')}</div>`;
  const eventRow = (event, day) => {
    const recurs = eventRecurrence(event.recurrence) !== 'none';
    return `<div class="learn-family-event-row-wrap" draggable="true" data-event-drag data-event-id="${html(event.id || '')}" data-date="${html(event.date || day.date)}" data-title="${html(event.title || '')}" data-time="${html(event.startTime || '')}" data-location="${html(event.location || '')}" data-notes="${html(event.notes || '')}" data-type="${html(event.eventType || '')}" data-recurrence="${html(event.recurrence || 'none')}">
      <span class="learn-family-event-drag-handle" aria-hidden="true" title="Drag to another day">⠿</span>
      <button type="button" class="learn-family-event-row" data-event-open data-event-id="${html(event.id || '')}" data-date="${html(event.date || day.date)}" data-title="${html(event.title || '')}" data-time="${html(event.startTime || '')}" data-location="${html(event.location || '')}" data-notes="${html(event.notes || '')}" data-type="${html(event.eventType || '')}" data-recurrence="${html(event.recurrence || 'none')}">
        <span>${html(event.startTime || '—')}</span>
        <strong>${html(event.title)}</strong>
        <small>${html([event.location || event.eventType || 'Family event', recurs ? eventRecurrenceLabel(event.recurrence) : ''].filter(truthyLearnPlanner2).join(' · '))}</small>
      </button>
    </div>`;
  };
  return `<div class="learn-family-prototype">${displayView === 'day' ? renderPlannerDaySelector(model, selectedDate) : ''}<div class="learn-family-events-list">${days
    .map((day) => {
      const events = model.eventsByDate.get(day.date) || [];
      return `<section class="learn-family-date-section" data-event-dropzone="${html(day.date)}">
      <header><span><small>${html(day.weekday || day.weekdayLong)}</small><strong>${html(day.shortDate || day.short || day.date)}</strong><em>${html(day.feast || '')}</em></span><button type="button" data-event-open data-date="${html(day.date)}">+ Add event</button></header>
      <div class="learn-family-event-rows" data-event-rows>${events.length ? events.map((event) => eventRow(event, day)).join('') : `<p class="learn-family-empty-line" data-event-empty-hint>Drag an appointment here, or add one.</p>`}</div>
    </section>`;
    })
    .join('')}</div></div>`;
}
function renderFamilyPlannerModals(model) {
  return `<div class="learn-family-modal" data-family-modal="meal" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Meal Picker</small><h2>Choose a dish</h2><p data-meal-modal-context>Pick a recipe or type a dish name.</p><input data-meal-custom-input placeholder="Type a dish name..."><div class="learn-family-picker-list">${model.recipes.length ? model.recipes.map((recipe) => `<button type="button" data-meal-pick="${html(recipe.title)}"><strong>${html(recipe.title)}</strong><span>${html(recipe.fastingType || 'Any day')} · ${html(recipe.category || 'Recipe')}</span></button>`).join('') : `<span class="learn-family-empty-line">No recipes yet. You can still type a dish above.</span>`}</div><div class="learn-family-modal-actions"><button type="button" data-meal-clear>Clear meal</button><button type="button" data-meal-save>Save meal</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="recipe" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Recipe</small><h2>Save a family recipe</h2><div class="learn-family-modal-grid">${setupInput('Recipe name', 'modalRecipe.title')}${setupSelect('Fasting fit', 'modalRecipe.fastingType', '', ['free', 'fish', 'oilwine', 'strict'])}${setupInput('Category', 'modalRecipe.category')}${setupInput('Source URL', 'modalRecipe.sourceUrl')}<label>Ingredients<textarea name="modalRecipe.ingredients" rows="4"></textarea></label><label>Instructions<textarea name="modalRecipe.instructions" rows="4"></textarea></label></div><div class="learn-family-modal-actions"><button type="button" data-family-modal-close>Cancel</button><button type="button" data-recipe-save>Save recipe</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="event" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Calendar</small><h2 data-event-modal-title>Add to calendar</h2><div class="learn-family-modal-grid">${setupInput('Title', 'modalEvent.title')}${setupSelect('Type', 'modalEvent.eventType', '', ['Appointment', 'Field Trip', 'Extracurricular', 'Name Day', 'Family'])}${setupInput('Date', 'modalEvent.date', '', { type: 'date' })}${setupInput('Time', 'modalEvent.startTime', '', { type: 'time' })}${setupSelect('Repeats', 'modalEvent.recurrence', 'none', eventRecurrenceOptions)}${setupInput('Location', 'modalEvent.location')}<label>Notes<textarea name="modalEvent.notes" rows="3"></textarea></label></div><div class="learn-family-modal-actions"><button type="button" data-event-delete hidden>Delete event</button><button type="button" data-family-modal-close>Cancel</button><button type="button" data-event-save>Save event</button></div></div></div>
  <div class="learn-family-modal" data-family-modal="chore" hidden><div class="learn-family-modal-card"><button type="button" class="learn-family-modal-close" data-family-modal-close aria-label="Close">×</button><small>Chore Rhythm</small><h2 data-chore-modal-title>Add chore</h2><div class="learn-family-modal-grid">${setupInput('Chore', 'modalChore.title')}${setupSelect('Assigned to', 'modalChore.assignee', 'Everyone', choreAssigneeOptions(model.planning))}${setupSelect(
    'Type',
    'modalChore.cadence',
    'weekly',
    [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' },
      { value: 'yearly', label: 'Yearly' },
    ]
  )}${setupSelect('Weekly day', 'modalChore.day', '', ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])}${setupSelect('Monthly day', 'modalChore.dayOfMonth', '', dayOfMonthOptions())}${setupSelect(
    'Quarter month',
    'modalChore.quarterMonth',
    '1',
    [
      { value: '1', label: '1st month' },
      { value: '2', label: '2nd month' },
      { value: '3', label: '3rd month' },
    ]
  )}${setupInput('Starts on', 'modalChore.assignedDate', '', { type: 'date' })}${choreTimeCheckboxes('modalChore.timeOfDay')}<label style="display:grid;gap:5px;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Notes<input name="modalChore.notes" type="text" value="" style="min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--paper2);font-family:inherit;color:var(--ink);" /></label></div><div class="learn-chore-batch-list" data-chore-batch-list hidden></div><div class="learn-family-modal-actions"><button type="button" data-chore-delete hidden>Delete chore</button><button type="button" data-family-modal-close>Cancel</button><button type="button" data-chore-save-add>Save & add another</button><button type="button" data-chore-save>Save chore</button></div></div></div>`;
}
function renderFamilyPlannerScope(vm, scope, displayView = 'week', mealTool = 'plan') {
  const model = familyPlannerModel(vm);
  const hidden = plannerHiddenData(model);
  const saveBar = `<div class="learn-family-planner-save"><span data-family-planning-status>Changes save to the household Family Planner.</span><button type="submit">Save Family Planner</button></div>`;
  const content =
    scope === 'meals'
      ? mealTool === 'recipes'
        ? renderRecipesTool(model)
        : mealTool === 'groceries'
          ? renderGroceriesTool(model)
          : mealTool === 'pantry'
            ? renderPantryTool(model)
            : renderMealsPlan(model, displayView, vm)
      : scope === 'chores'
        ? renderChoresScope(model, displayView)
        : renderEventsScope(model, displayView);
  return `<form data-family-planning-form id="family-planner" class="learn-family-planner-panel">${hidden}<div data-family-planner-live>${content}</div>${saveBar}${renderFamilyPlannerModals(model)}</form>`;
}
function prototypeWeekDateMap(vm) {
  const model = familyPlannerModel(vm);
  const days = model.weekDays.length ? model.weekDays : plannerDates(vm).map((date) => ({ date }));
  return Object.fromEntries(days.slice(0, 7).map((day, index) => [`d${index}`, day.date]));
}
function recipeTitleFromPrototypeId(id, state = {}) {
  return state.userRecipes?.[id]?.name || PROTOTYPE_RECIPE_TITLES[id] || id || '';
}
function isImportantPlannerFeast(day = {}) {
  const feast = String(day.feast || day.feastTitle || '').trim();
  if (!feast || /^fast day$/i.test(feast)) return false;
  const rank = String(day.feastRank || '').trim();
  const text = `${feast} ${rank}`.toLowerCase();
  const realRank = rank && !/daily rhythm/i.test(rank);
  return (
    Boolean(realRank) ||
    /patronal feast|nativity|forerunner|theotokos|apostle|apostles|great feast|major|vigil|polyeleos|doxology|ascension|pentecost|transfiguration|annunciation|presentation|exaltation|pascha/.test(
      text
    )
  );
}
function prototypeStateToFamilyPlanningPayload(vm, state) {
  const keyToDate = prototypeWeekDateMap(vm);
  try {
    const seed = JSON.parse(localStorage.getItem('agapay.planner.seed.v1') || '{}');
    (seed.month?.days || []).forEach((day) => {
      if (day.key && day.fullDate) keyToDate[day.key] = day.fullDate;
    });
  } catch {}
  const recipes = Object.entries(state.userRecipes || {})
    .map(([id, recipe]) => ({
      id,
      title: recipe.name || '',
      fastingType: recipe.level || 'adaptable',
      category: Array.isArray(recipe.types) ? recipe.types.join(', ') : 'Recipe',
      sourceUrl: '',
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.join(', ') : '',
      instructions: recipe.note || '',
    }))
    .filter((recipe) => recipe.title);
  const mealsByDate = /* @__PURE__ */ new Map();
  Object.entries(state.plan || {}).forEach(([key, recipeId]) => {
    const [dayKey, slot] = key.split('-');
    const date = keyToDate[dayKey];
    if (!date || !slot) return;
    if (!mealsByDate.has(date)) mealsByDate.set(date, { date });
    mealsByDate.get(date)[slot] = recipeTitleFromPrototypeId(recipeId, state);
  });
  const events = (state.events || [])
    .map((event) => ({
      id: event.id || '',
      title: event.title || '',
      eventType: event.type || 'Appointment',
      date: keyToDate[event.dayKey] || keyToDate.d3 || '',
      startTime: event.time || '',
      location: event.who || '',
      notes: event.note || '',
    }))
    .filter((event) => event.title && event.date);
  const seedDays = (() => {
    try {
      return JSON.parse(localStorage.getItem('agapay.planner.seed.v1') || '{}').days || [];
    } catch {
      return [];
    }
  })();
  const dayLabelByKey = Object.fromEntries(seedDays.map((day) => [day.key, day.long || day.weekday || '']));
  const choreDetails = state.choreDetails || {};
  const chores = Object.entries(state.chores || {})
    .map(([key, title], index) => {
      const [assignee = 'Everyone', dayKey = ''] = key.split('::');
      const detail = choreDetails[key] || {};
      return {
        id: detail.id || `prototype_chore_${index}`,
        title: detail.title || title,
        assignee: detail.assignee || assignee,
        cadence: detail.cadence || 'weekly',
        day: detail.day || dayLabelByKey[dayKey] || '',
        dayOfMonth: detail.dayOfMonth || '',
        quarterMonth: detail.quarterMonth || '',
        assignedDate: detail.assignedDate || '',
        timeOfDay: detail.timeOfDay || 'Anytime',
        notes: detail.notes || '',
        completed: Boolean(detail.completed),
      };
    })
    .filter((chore) => chore.title);
  const pantryItems = (state.pantry || []).map((name, index) => ({
    id: `pantry_${index}`,
    name,
    quantity: '',
    category: 'Pantry',
    checked: false,
    pantry: true,
  }));
  const groceryItems = (state.manualGroceries || [])
    .map((item) => ({
      id: item.id || '',
      name: item.label || '',
      quantity: '',
      category: item.aisle || 'Other',
      checked: Boolean(state.groceryChecked?.[item.id]),
      pantry: false,
    }))
    .filter((item) => item.name);
  return {
    household: vm.familyPlanning?.household || {},
    childNameDays: (vm.familyPlanning?.children || []).map((child) => ({
      childId: child.id || '',
      nameDay: child.nameDay || '',
    })),
    familyPlanning: {
      fastingPreference: vm.familyPlanning?.fastingPreference || 'guidance',
      weekStart: keyToDate.d0 || '',
      meals: [...mealsByDate.values()],
      recipes,
      groceryItems: [...pantryItems, ...groceryItems],
      events,
      chores: chores.length ? chores : vm.familyPlanning?.chores || [],
    },
  };
}
function adjacentMonthKey(monthKey, delta) {
  const [year, month] = String(monthKey || '')
    .split('-')
    .map(Number);
  const date = new Date(
    Date.UTC(
      Number.isFinite(year) ? year : /* @__PURE__ */ new Date().getUTCFullYear(),
      (Number.isFinite(month) ? month : 1) - 1 + delta,
      1
    )
  );
  return date.toISOString().slice(0, 7);
}
function uniqueMonthLessons(items) {
  const seen = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    const key = [item.id || '', item.title || '', item.sub || '', item.note || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function renderMonthLessonChip(item) {
  const color = item.color || 'var(--gold)';
  return `<span title="${html([item.title, item.sub].filter(truthyLearnPlanner2).join(' - '))}" style="display:flex;align-items:center;gap:5px;min-width:0;border:1px solid rgba(181,148,47,.22);border-left:3px solid ${html(color)};border-radius:7px;background:${softColor(color, '16')};padding:3px 5px;color:#243047;font-size:10.5px;line-height:1.15;">
    <span style="width:6px;height:6px;border-radius:999px;background:${html(color)};flex:0 0 auto;"></span>
    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(item.title)}</span>
  </span>`;
}
function renderPlannerMonth(vm) {
  const month = vm.month || {};
  const designedByDate = designedAssignmentsByDateForMonth(vm);
  const dayCells = (month.days || [])
    .map((day) => {
      const muted = !day.inMonth;
      const fastBg = day.isFastDay ? 'rgba(110,47,42,.12)' : day.isSunday ? 'rgba(181,148,47,.14)' : 'var(--paper2)';
      const border = day.isToday ? 'var(--gold)' : day.isFastDay ? 'rgba(110,47,42,.38)' : 'var(--line)';
      const familyItems = [
        ...(day.nameDays || []).map((entry) => ({ title: `Name day · ${entry.personName}` })),
        ...(day.events || []).map((entry) => ({ title: entry.title })),
        ...(day.meal?.dinner ? [{ title: `Dinner · ${day.meal.dinner}` }] : []),
      ];
      const lessons = uniqueMonthLessons(
        [...(designedByDate.get(day.date) || []), ...(day.householdPlan || []), ...(day.formPlan || [])].filter(
          (item) => item?.title
        )
      );
      const visibleLessons = lessons.slice(0, 4);
      const moreLessons = lessons.length - visibleLessons.length;
      const visibleFamilyItems = familyItems.slice(0, Math.max(0, 4 - visibleLessons.length));
      return `<article style="min-height:110px;border:1px solid ${border};border-radius:10px;background:${muted ? 'rgba(248,240,221,.46)' : fastBg};padding:8px;display:flex;flex-direction:column;gap:5px;box-shadow:${day.isToday ? 'inset 0 0 0 1px rgba(181,148,47,.45)' : 'none'};opacity:${muted ? '.55' : '1'};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <span style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:${day.isFastDay ? 'var(--burgundy)' : 'var(--ink)'};">${html(day.dayNumber)}</span>
        ${day.isToday ? `<span style="border:1px solid var(--gold);border-radius:999px;padding:2px 6px;font-size:9px;color:var(--gold);font-weight:700;">TODAY</span>` : ''}
      </div>
      <strong style="font-size:11px;line-height:1.2;color:${day.isFastDay ? 'var(--burgundy)' : 'var(--ink)'};">${html(day.feast)}</strong>
      ${day.isFastDay ? `<span style="color:var(--burgundy);font-size:10px;font-weight:700;">${html(day.fastingType || day.fasting)}</span>` : ''}
      <div style="display:grid;gap:3px;margin-top:auto;">
        ${visibleLessons.length ? visibleLessons.map(renderMonthLessonChip).join('') : ''}
        ${moreLessons > 0 ? `<span style="font-size:10px;color:var(--muted);font-weight:700;">+${html(moreLessons)} more</span>` : ''}
        ${visibleFamilyItems.length ? visibleFamilyItems.map((plan) => `<span style="font-size:10px;color:#526078;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(plan.title)}</span>`).join('') : ''}
      </div>
    </article>`;
    })
    .join('');
  return `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <!-- Full-width calendar panel -->
      <div style="background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 16px;box-shadow:0 1px 3px rgba(20,40,70,.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <div>
            <div style="color:var(--gold);font-size:11px;letter-spacing:.15em;font-weight:700;text-transform:uppercase;">Household Month</div>
            <h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;line-height:1;margin:5px 0 0;color:var(--ink);">${html(month.label)}</h2>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="${html(learnSectionHref('planner', `view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, -1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}`))}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">← Previous</a>
            <button type="button" data-planner-month-print="${html(month.key)}" style="border:1px solid var(--gold);background:var(--navy);color:#fff;border-radius:9px;padding:9px 14px;font-family:inherit;font-weight:700;cursor:pointer;">Print Month</button>
            <a href="${html(learnSectionHref('planner', `view=month&month=${encodeURIComponent(adjacentMonthKey(month.key, 1))}&term=${encodeURIComponent(vm.term.activeTerm)}&termId=${encodeURIComponent(vm.term.activeTermId)}`))}" style="border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--ink);text-decoration:none;background:var(--paper2);">Next →</a>
          </div>
        </div>
        <!-- 7-column day header -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;">
          ${(month.weekdays || []).map((day) => `<div style="color:var(--gold);font-size:10px;letter-spacing:.12em;font-weight:700;text-align:center;text-transform:uppercase;padding-bottom:4px;">${html(day)}</div>`).join('')}
        </div>
        <!-- Day cells — no min-width, fills container naturally -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">
          ${dayCells}
        </div>
      </div>

      <!-- Sidebar panels below, side by side -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
        ${panel(
          'Month Notes',
          `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">Fast Days</small>
              <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--burgundy);line-height:1;">${html(month.fastDays)}</strong>
              <span class="learn-muted-sm">Marked in red.</span>
            </div>
            <div>
              <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">Feast Markers</small>
              <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--ink);line-height:1;">${html(month.feastDays)}</strong>
              <span class="learn-muted-sm">Major liturgical rhythms.</span>
            </div>
          </div>
          <p style="margin:12px 0 0;font-size:13px;color:#33405a;line-height:1.45;border-top:1px solid var(--line);padding-top:12px;">Print a clean household copy — feast days, fasts, and the month at a glance.</p>`,
          { icon: '▣' }
        )}
        ${panel(
          'Legend',
          `
          <div style="display:grid;gap:10px;">
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:rgba(110,47,42,.12);border:1px solid rgba(110,47,42,.38);"></i> Fast day</span>
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:rgba(181,148,47,.14);border:1px solid var(--line);"></i> Sunday / feast rhythm</span>
            <span style="display:flex;gap:9px;align-items:center;font-size:13px;"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:var(--paper2);border:1px solid var(--gold);"></i> Today</span>
          </div>`,
          { icon: '✥' }
        )}
      </div>

    </div>
  `;
}
function familyEventSetupRow(event = {}) {
  return `<div data-setup-row="familyEvents" data-id="${html(event.id || '')}" class="learn-family-row learn-event-row">${setupInput('Event', 'title', event.title || '')}${setupSelect(
    'Type',
    'eventType',
    event.eventType || 'appointment',
    [
      { value: 'appointment', label: 'Appointment' },
      { value: 'field-trip', label: 'Field trip' },
      { value: 'extracurricular', label: 'Extracurricular' },
      { value: 'family', label: 'Family' },
      { value: 'other', label: 'Other' },
    ]
  )}${setupInput('Date', 'date', event.date || '', { type: 'date' })}${setupInput('Starts', 'startTime', event.startTime || '', { type: 'time' })}${setupSelect('Repeats', 'recurrence', event.recurrence || 'none', eventRecurrenceOptions)}${setupInput('Location', 'location', event.location || '')}${setupInput('Notes', 'notes', event.notes || '')}${setupRemoveButton()}</div>`;
}
function recipeSetupRow(recipe = {}) {
  return `<div data-setup-row="recipes" data-id="${html(recipe.id || '')}" class="learn-family-row learn-recipe-row">${setupInput('Recipe', 'title', recipe.title || '')}${setupSelect(
    'Fasting fit',
    'fastingType',
    recipe.fastingType || 'adaptable',
    [
      { value: 'fast-friendly', label: 'Fast-friendly' },
      { value: 'adaptable', label: 'Easy to adapt' },
      { value: 'regular', label: 'Regular meal' },
    ]
  )}${setupInput('Category', 'category', recipe.category || 'Dinner')}${setupInput('Source link', 'sourceUrl', recipe.sourceUrl || '', { type: 'url' })}${setupInput('Ingredients', 'ingredients', recipe.ingredients || '')}${setupInput('Notes / method', 'instructions', recipe.instructions || '')}${setupRemoveButton()}</div>`;
}
function grocerySetupRow(item = {}) {
  const isPantry = Boolean(item.pantry || item.inPantry);
  return `<div data-setup-row="groceryItems" data-id="${html(item.id || '')}" class="learn-family-row learn-grocery-row">${setupInput('Item', 'name', item.name || '')}${setupInput('Quantity', 'quantity', item.quantity || '')}${setupSelect('Aisle', 'category', item.category || (isPantry ? 'Pantry' : 'Produce'), ['Produce', 'Pantry', 'Bakery', 'Dairy', 'Frozen', 'Household', 'Other'])}<label class="learn-check-field"><input type="checkbox" name="checked" ${item.checked ? 'checked' : ''}> In cart</label><label class="learn-check-field"><input type="checkbox" name="pantry" ${isPantry ? 'checked' : ''}> Pantry staple</label>${setupRemoveButton()}</div>`;
}
function nextSevenDates(startDate = '') {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? /* @__PURE__ */ new Date(`${startDate}T12:00:00`)
    : /* @__PURE__ */ new Date();
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  isOdysseyLearnContext,
  html,
  emptyState,
  setupInput,
  setupSelect,
  setupRemoveButton,
  learnExperience,
  softColor,
  panel,
} from './dashboard-shell-setup-calendar.js';
const choreTimeOptions = ['Morning', 'Afternoon', 'Evening'];
const eventRecurrenceOptions = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
const PROTOTYPE_RECIPE_TITLES = {
  b1: 'Lenten Oatmeal, Apple & Cinnamon',
  b2: 'Avocado & Tomato Toast',
  b3: 'Tahini, Banana & Honey Toast',
  b4: 'Smoked Salmon on Rye',
  b5: 'Yogurt, Honey & Walnuts',
  l1: 'Lentil Soup (Fakes)',
  l2: 'Hummus & Veggie Pita',
  l3: 'Roasted Vegetable Orzo',
  l4: 'Sardines & Greens on Toast',
  l5: 'Greek Salad with Feta',
  d1: 'Gigantes — Greek Baked Beans',
  d2: 'Stuffed Peppers, Rice & Herbs',
  d3: 'Mushroom Stew over Polenta',
  d4: 'Baked Cod, Lemon & Potatoes',
  d5: 'Pan-Seared Trout, Rice Pilaf',
  d6: 'Roast Chicken & Lemon Potatoes',
  d7: 'Spanakopita',
  d8: 'Chickpea & Vegetable Stew',
  d9: 'Herb-Roasted Salmon & Greens',
  s1: 'Olive & Herb Bread',
  s2: 'Semolina Halva',
  s3: 'Chocolate Olive-Oil Cake',
  s4: 'Walnut Baklava',
};
export {
  PROTOTYPE_RECIPE_TITLES,
  choreDueOnDay,
  choreScheduleLabel,
  choreSetupRow,
  choreTimeValues,
  eventRecurrence,
  eventRecurrenceLabel,
  expandFamilyEvents,
  familyEventSetupRow,
  familyPlannerModel,
  grocerySetupRow,
  isImportantPlannerFeast,
  learnSectionHref,
  marketingPreviewActive,
  mealSlotLabel,
  nextSevenDates,
  plannerDates,
  plannerDayLabel,
  plannerHref,
  prototypeStateToFamilyPlanningPayload,
  prototypeWeekDateMap,
  recipeSetupRow,
  renderChoresScope,
  renderFamilyPlannerScope,
  renderPlannerMonth,
  renderWeeklyAssignmentBoard,
};
