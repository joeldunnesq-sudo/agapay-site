import type {
  LearnFamilyPlannerInput,
  LearnPrototypeSeed,
  LearnShellViewModel,
  LearnShellNode,
  LearnShellDateParts,
  LearnShellPrototypeState,
  LearnPlannerVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell-planner-family.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearnPlanner2<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const familyPlannerModel: LearnShellBindings['familyPlannerModel'];
declare const renderPlannerDaySelector: LearnShellBindings['renderPlannerDaySelector'];
declare const renderMealCard: LearnShellBindings['renderMealCard'];
declare const renderFeastsPanel: LearnShellBindings['renderFeastsPanel'];
declare const renderFastingLegend: LearnShellBindings['renderFastingLegend'];
declare const mealSlotLabel: LearnShellBindings['mealSlotLabel'];
declare const plannerHref: LearnShellBindings['plannerHref'];
declare const choreCadence: LearnShellBindings['choreCadence'];
declare const plannerMonthQuery: LearnShellBindings['plannerMonthQuery'];
declare const choreTimeLabel: LearnShellBindings['choreTimeLabel'];
declare const isoDateParts: LearnShellBindings['isoDateParts'];
declare const plannerDayLabel: LearnShellBindings['plannerDayLabel'];
declare const eventRecurrence: LearnShellBindings['eventRecurrence'];
declare const eventRecurrenceLabel: LearnShellBindings['eventRecurrenceLabel'];
declare const eventRecurrenceOptions: LearnShellBindings['eventRecurrenceOptions'];
declare const choreAssigneeOptions: LearnShellBindings['choreAssigneeOptions'];
declare const dayOfMonthOptions: LearnShellBindings['dayOfMonthOptions'];
declare const choreTimeCheckboxes: LearnShellBindings['choreTimeCheckboxes'];
declare const plannerHiddenData: LearnShellBindings['plannerHiddenData'];
declare const plannerDates: LearnShellBindings['plannerDates'];
declare const PROTOTYPE_RECIPE_TITLES: LearnShellBindings['PROTOTYPE_RECIPE_TITLES'];
declare const designedAssignmentsByDateForMonth: LearnShellBindings['designedAssignmentsByDateForMonth'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];
declare const html: LearnShellBindings['html'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const setupInput: LearnShellBindings['setupInput'];
declare const setupSelect: LearnShellBindings['setupSelect'];
declare const softColor: LearnShellBindings['softColor'];
declare const panel: LearnShellBindings['panel'];

function renderMealsPlan(model: ReturnType<typeof familyPlannerModel>, displayView: string, vm: LearnShellViewModel) {
  const selectedDate =
    new URLSearchParams(window.location.search).get('date') || vm.day?.selected?.date || model.weekDays[0]?.date || '';
  if (displayView === 'day') {
    const day = model.weekDays.find((item) => item.date === selectedDate) || model.weekDays[0] || {};
    const meal = model.mealByDate.get(day.date) || {};
    return `<div class="learn-family-prototype">${renderPlannerDaySelector(model, day.date)}<section class="learn-family-day-hero ${day.isFastDay ? 'is-fast' : ''}"><div><small>${html(day.long || day.weekdayLong || 'Today')}</small><h2>${html(day.weekdayLong || day.long || 'Selected Day')} · ${html(day.shortDate || day.short || day.date)}</h2><p>${html(day.feast || 'Household rhythm')} ${day.fasting ? `· ${html(day.fasting)}` : ''}</p></div><button type="button" data-event-open data-date="${html(day.date)}">+ Add to calendar</button></section><section class="learn-family-card-grid learn-family-card-grid-three">${['breakfast', 'lunch', 'dinner'].map((slot: string) => renderMealCard(day, meal, slot)).join('')}</section></div>`;
  }
  if (displayView === 'month') {
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, 'month')}${renderFamilyMonthOverview(model, 'meals')}${renderFastingLegend()}</div>`;
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  return `<div class="learn-family-week-layout"><section class="learn-family-week-board"><div class="learn-family-week-scroll"><div class="learn-family-week-head"><span></span>${model.weekDays
    .map((day) => {
      const isToday = day.date === todayIso;
      const hasFeast = Boolean(day.feast || day.feastTitle) || day.isSunday;
      // Priority matches the legend's visual hierarchy: fast day overrides feast/Sunday styling,
      // feast or Sunday overrides today, today overrides ordinary.
      const stateClass = day.isFastDay ? 'is-fast' : hasFeast ? 'is-feast' : isToday ? 'is-today' : 'is-ordinary';
      const labelText = day.isFastDay
        ? day.fastingType || day.fasting || 'Fast'
        : day.feast || day.feastTitle || (day.isSunday ? 'Sunday' : '');
      return `<strong class="${stateClass}">${html(day.weekday || day.weekdayLong)}<small>${html(day.shortDate || day.short)}</small>${labelText ? `<em>${html(labelText)}</em>` : ''}</strong>`;
    })
    .join(
      ''
    )}</div>${['breakfast', 'lunch', 'dinner'].map((slot: string) => `<div class="learn-family-week-row"><strong>${html(mealSlotLabel(slot))}</strong>${model.weekDays.map((day) => `<div>${renderMealCard(day, model.mealByDate.get(day.date) || {}, slot)}</div>`).join('')}</div>`).join('')}</div></section><div style="display:grid;gap:14px;">${renderFeastsPanel(model, 'week')}${renderFastingLegend()}</div></div>`;
}

function renderRecipesTool(model: ReturnType<typeof familyPlannerModel>) {
  return `<section class="learn-family-tool-grid"><div class="learn-family-section-note"><strong>Recipe Library</strong><span>Add family recipes once, mark fasting fit, then choose them from the meal picker.</span><button type="button" data-recipe-open>+ New recipe</button></div><div class="learn-family-recipe-grid">${(model.recipes.length ? model.recipes : [{ title: 'Add your first recipe', fastingType: 'free', category: 'Family favorite' }]).map((recipe) => `<article class="learn-family-recipe-card" data-recipe-title="${html(recipe.title || '')}" data-recipe-fasting="${html(recipe.fastingType || '')}" data-recipe-category="${html(recipe.category || '')}" data-recipe-source="${html(recipe.sourceUrl || '')}" data-recipe-ingredients="${html(recipe.ingredients || '')}" data-recipe-instructions="${html(recipe.instructions || '')}"><div><span>☰</span><small>${html(recipe.fastingType || 'Any day')}</small></div><h3>${html(recipe.title || 'Untitled Recipe')}</h3><p>${html(recipe.category || 'Recipe')}</p><button type="button" data-recipe-open>Edit recipe</button></article>`).join('')}</div></section>`;
}

function renderGroceriesTool(model: ReturnType<typeof familyPlannerModel>) {
  const byCategory = new Map<string, LearnShellNode[]>();
  const shoppingItems = model.groceries.filter((item) => !item.pantry);
  shoppingItems.forEach((item) => {
    const category = item.category || 'Other';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(item);
  });
  const pantryCount = model.groceries.filter((item) => item.pantry).length;
  return `<section class="learn-family-grocery-layout">
    <div class="learn-family-section-note"><strong>Grocery List</strong><span>Build the weekly list from the menu. Pantry staples stay out of the shopping list unless you mark them as needed.</span><button type="button" data-grocery-add>+ Add grocery</button></div>
    <div class="learn-family-grocery-summary">${[...byCategory.entries()].length ? [...byCategory.entries()].map(([category, items]) => `<div class="learn-family-aisle"><strong>${html(category)}</strong>${items.map((item: LearnShellNode) => `<label class="${item.checked ? 'is-checked' : ''}"><input type="checkbox" ${item.checked ? 'checked' : ''}> ${html(item.quantity ? `${item.quantity} ` : '')}${html(item.name)}</label>`).join('')}</div>`).join('') : emptyState('No grocery items yet. Add items from recipes or the grocery button.')}</div>
    <aside class="learn-family-shopping-card"><small>Shopping rhythm</small><h3>Weekly list</h3><p>${html(String(shoppingItems.length))} item${shoppingItems.length === 1 ? '' : 's'} to shop · ${html(String(pantryCount))} pantry staple${pantryCount === 1 ? '' : 's'} saved.</p><a href="${plannerHref({ scope: 'meals', tool: 'pantry', view: 'week', term: null, termId: null })}">Review pantry →</a></aside>
  </section>`;
}

function renderPantryTool(model: ReturnType<typeof familyPlannerModel>) {
  const pantryItems = model.groceries.filter((item) => item.inPantry || item.pantry || item.have);
  return `<section class="learn-family-pantry-layout">
    <div class="learn-family-section-note"><strong>Pantry</strong><span>Your pantry tells the grocery list what you already have. Staples here are kept apart from the shopping list so you shop only for what is missing.</span><button type="button" data-grocery-add data-pantry-add>+ Add staple</button></div>
    <div class="learn-family-pantry-cloud">${pantryItems.length ? pantryItems.map((item) => `<span>${html(item.name || item.title || item.item)}<button type="button" data-grocery-remove="${html(item.id || '')}" aria-label="Remove ${html(item.name || item.title || 'item')}">×</button></span>`).join('') : `<p class="learn-family-empty-line">No pantry staples yet. Add staples like rice, flour, olive oil, beans, or leftovers.</p>`}</div>
    <aside><small>Why it matters</small><p>Pantry staples and leftovers should shape the week instead of hiding in your cabinets. This keeps meal planning practical, fast-aware, and less wasteful.</p></aside>
  </section>`;
}

function renderFamilyMonthOverview(model: ReturnType<typeof familyPlannerModel>, scope: string = 'meals') {
  const cells = model.monthDays.length ? model.monthDays : model.weekDays;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthlyChoresForDay = (day: LearnShellNode) =>
    (model.chores || []).filter((chore) => {
      if (!['monthly', 'quarterly', 'yearly'].includes(choreCadence(chore))) return false;
      return choreDueOnDay(chore, day);
    });
  const monthlyChoresByAssignee = (day: LearnShellNode) => {
    const groups = new Map<string, LearnShellNode[]>();
    monthlyChoresForDay(day).forEach((chore) => {
      const key = chore.assignee || 'Everyone';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(chore);
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
        const meal = (day.meal || model.mealByDate.get(day.date) || {}) as LearnShellNode;
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
              .filter((slot: string) => (meal as unknown as Record<string, string | undefined>)[slot])
              .map(
                (slot: string) =>
                  `<em>${html(mealSlotLabel(slot))}: ${html((meal as unknown as Record<string, string | undefined>)[slot])}</em>`
              )
              .join('')}`
          : scope === 'chores'
            ? monthlyChores.length
              ? `<div class="learn-family-month-chore-list">${monthlyChores.map(([assignee, chores]) => `<span><strong>${html(assignee)}</strong><small>${html(chores.map((chore: LearnShellNode) => `${chore.title || 'Chore'} (${choreTimeLabel(chore.timeOfDay)})`).join(', '))}</small></span>`).join('')}</div>`
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

function monthDiffBetween(startParts: LearnShellDateParts, targetParts: LearnShellDateParts) {
  return (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
}

function choreAssignedParts(chore: LearnShellNode | null | undefined = {}) {
  return isoDateParts(chore!.assignedDate || chore!.startDate || chore!.date || '');
}

function choreDueOnDay(chore: LearnShellNode | null | undefined = {}, day: LearnShellNode = {}) {
  const date = day.date || '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null;
  const cadence = choreCadence(chore);
  const weekday = day.weekdayLong || day.long || plannerDayLabel(date).long;
  if (cadence === 'daily') return true;
  if (cadence === 'weekly') return !chore!.day || chore!.day === weekday;
  if (!parsed) return false;
  const assigned = choreAssignedParts(chore);
  const target = isoDateParts(date);
  if (assigned && target) {
    const monthDiff = monthDiffBetween(assigned, target);
    const dueDay = Number(chore!.dayOfMonth || assigned.day);
    if (monthDiff < 0 || (monthDiff === 0 && target.day < assigned.day)) return false;
    if (target.day !== dueDay) return false;
    if (cadence === 'monthly') return true;
    if (cadence === 'quarterly') return monthDiff % 3 === 0;
    if (cadence === 'yearly') return monthDiff % 12 === 0;
  }
  const choreDay = Number(chore!.dayOfMonth || 0);
  if (cadence === 'monthly') return !choreDay || choreDay === parsed.getDate();
  if (cadence === 'quarterly') {
    const quarterSlot = String((parsed.getMonth() % 3) + 1);
    return (
      (!chore!.quarterMonth || String(chore!.quarterMonth) === quarterSlot) &&
      (!choreDay || choreDay === parsed.getDate())
    );
  }
  if (cadence === 'yearly') return false;
  return false;
}

function choreScheduleLabel(chore: LearnShellNode | null | undefined = {}) {
  const cadence = choreCadence(chore);
  const time = choreTimeLabel(chore!.timeOfDay);
  const schedule =
    cadence === 'daily'
      ? 'Daily'
      : cadence === 'weekly'
        ? chore!.day
          ? `Weekly · ${chore!.day}`
          : 'Weekly'
        : cadence === 'monthly'
          ? chore!.dayOfMonth
            ? `Monthly · day ${chore!.dayOfMonth}`
            : 'Monthly'
          : cadence === 'quarterly'
            ? `Quarterly${chore!.assignedDate ? ` · from ${chore!.assignedDate}` : chore!.quarterMonth ? ` · month ${chore!.quarterMonth}` : ''}${chore!.dayOfMonth ? ` · day ${chore!.dayOfMonth}` : ''}`
            : `Yearly${chore!.assignedDate ? ` · ${chore!.assignedDate.slice(5)}` : ''}${chore!.dayOfMonth ? ` · day ${chore!.dayOfMonth}` : ''}`;
  return `${schedule} · ${time}`;
}

function choreOpenAttributes(
  chore: LearnShellNode | null | undefined = null,
  personName: string = '',
  day: LearnShellNode = {}
) {
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

function renderChoresScope(model: ReturnType<typeof familyPlannerModel>, displayView: string) {
  const people = [
    { name: 'Everyone', color: 'var(--navy)', initial: '✥' },
    ...model.children.filter((child) => child.name),
  ];
  const choresForPersonDay = (person: { name: string; color?: string; initial?: string }, day: LearnShellNode) =>
    model.chores.filter((item) => (item.assignee || 'Everyone') === person.name && choreDueOnDay(item, day));
  const renderChoreButton = (
    chore: LearnShellNode,
    person: { name: string; color?: string; initial?: string },
    day: LearnShellNode
  ) =>
    `<button type="button" class="learn-family-mini-card" ${choreOpenAttributes(chore, person.name, day)}><strong>${html(chore.title || 'Chore')}</strong><small>${html(choreScheduleLabel(chore))}</small></button>`;
  const addChoreButton = (
    person: { name: string; color?: string; initial?: string },
    day: LearnShellNode,
    compact = false
  ) =>
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

function renderEventsScope(model: ReturnType<typeof familyPlannerModel>, displayView: string) {
  const selectedDate = new URLSearchParams(window.location.search).get('date') || model.weekDays[0]?.date || '';
  const days = displayView === 'day' ? model.weekDays.filter((day) => day.date === selectedDate) : model.weekDays;
  if (displayView === 'month')
    return `<div style="display:flex;flex-direction:column;gap:14px;">${renderFeastsPanel(model, 'month')}${renderFamilyMonthOverview(model, 'events')}</div>`;
  const eventRow = (event: LearnShellNode, day: LearnShellNode) => {
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

function renderFamilyPlannerModals(model: ReturnType<typeof familyPlannerModel>) {
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

function renderFamilyPlannerScope(
  vm: LearnPlannerVm,
  scope: string,
  displayView: string = 'week',
  mealTool: string = 'plan'
) {
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

function prototypeWeekDateMap(vm: LearnFamilyPlannerInput) {
  const model = familyPlannerModel(vm);
  const days = model.weekDays.length ? model.weekDays : plannerDates(vm).map((date) => ({ date }));
  return Object.fromEntries(days.slice(0, 7).map((day, index) => [`d${index}`, day.date]));
}

function recipeTitleFromPrototypeId(id: string, state: LearnShellPrototypeState = {}) {
  return state.userRecipes?.[id]?.name || PROTOTYPE_RECIPE_TITLES[id] || id || '';
}

function isImportantPlannerFeast(day: LearnShellNode = {}) {
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

function prototypeStateToFamilyPlanningPayload(vm: LearnPlannerVm, state: LearnShellPrototypeState) {
  const keyToDate = prototypeWeekDateMap(vm);
  try {
    const seed = JSON.parse(localStorage.getItem('agapay.planner.seed.v1') || '{}') as LearnPrototypeSeed;
    (seed.month?.days || []).forEach((day: LearnShellNode) => {
      if (day.key && day.fullDate) keyToDate[day.key] = day.fullDate;
    });
  } catch {
    // Keep the week map if the local seed cannot be read.
  }
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
  const mealsByDate = new Map<string, Record<string, string | undefined>>();
  Object.entries(state.plan || {}).forEach(([key, recipeId]) => {
    const [dayKey, slot] = key.split('-');
    const date = keyToDate[dayKey];
    if (!date || !slot) return;
    if (!mealsByDate.has(date)) mealsByDate.set(date, { date });
    mealsByDate.get(date)![slot] = recipeTitleFromPrototypeId(recipeId, state);
  });
  const events = (state.events || [])
    .map((event) => ({
      id: event.id || '',
      title: event.title || '',
      eventType: event.type || 'Appointment',
      date: keyToDate[event.dayKey as string] || keyToDate.d3 || '',
      startTime: event.time || '',
      location: event.who || '',
      notes: event.note || '',
    }))
    .filter((event) => event.title && event.date);
  const seedDays = (() => {
    try {
      return (JSON.parse(localStorage.getItem('agapay.planner.seed.v1') || '{}') as LearnPrototypeSeed).days || [];
    } catch {
      return [];
    }
  })();
  const dayLabelByKey = Object.fromEntries(
    seedDays.map((day: LearnShellNode) => [day.key, day.long || day.weekday || ''])
  );
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
      checked: Boolean(state.groceryChecked?.[item.id as string]),
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

function adjacentMonthKey(monthKey: string, delta: number) {
  const [year, month] = String(monthKey || '')
    .split('-')
    .map(Number);
  const date = new Date(
    Date.UTC(
      Number.isFinite(year) ? year : new Date().getUTCFullYear(),
      (Number.isFinite(month) ? month : 1) - 1 + delta,
      1
    )
  );
  return date.toISOString().slice(0, 7);
}

function uniqueMonthLessons(items: LearnShellNode[]) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.id || '', item.title || '', item.sub || '', item.note || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderMonthLessonChip(item: LearnShellNode) {
  const color = item.color || 'var(--gold)';
  return `<span title="${html([item.title, item.sub].filter(truthyLearnPlanner2).join(' - '))}" style="display:flex;align-items:center;gap:5px;min-width:0;border:1px solid rgba(181,148,47,.22);border-left:3px solid ${html(color)};border-radius:7px;background:${softColor(color, '16')};padding:3px 5px;color:#243047;font-size:10.5px;line-height:1.15;">
    <span style="width:6px;height:6px;border-radius:999px;background:${html(color)};flex:0 0 auto;"></span>
    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(item.title)}</span>
  </span>`;
}

function renderPlannerMonth(vm: LearnPlannerVm) {
  const month = vm.month || {};
  const designedByDate = designedAssignmentsByDateForMonth(vm);
  const dayCells = (month.days || [])
    .map((day) => {
      const muted = !day.inMonth;
      const fastBg = day.isFastDay ? 'rgba(110,47,42,.12)' : day.isSunday ? 'rgba(181,148,47,.14)' : 'var(--paper2)';
      const border = day.isToday ? 'var(--gold)' : day.isFastDay ? 'rgba(110,47,42,.38)' : 'var(--line)';
      const familyItems = [
        ...(day.nameDays || []).map((entry: LearnShellNode) => ({ title: `Name day · ${entry.personName}` })),
        ...(day.events || []).map((entry: LearnShellNode) => ({ title: entry.title })),
        ...((day.meal as unknown as LearnShellNode)?.dinner
          ? [{ title: `Dinner · ${(day.meal as unknown as LearnShellNode).dinner}` }]
          : []),
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
export type LearnShell1Part1 = {
  renderMealsPlan: typeof renderMealsPlan;
  renderRecipesTool: typeof renderRecipesTool;
  renderGroceriesTool: typeof renderGroceriesTool;
  renderPantryTool: typeof renderPantryTool;
  renderFamilyMonthOverview: typeof renderFamilyMonthOverview;
  monthDiffBetween: typeof monthDiffBetween;
  choreAssignedParts: typeof choreAssignedParts;
  choreDueOnDay: typeof choreDueOnDay;
  choreScheduleLabel: typeof choreScheduleLabel;
  choreOpenAttributes: typeof choreOpenAttributes;
  renderChoresScope: typeof renderChoresScope;
  renderEventsScope: typeof renderEventsScope;
  renderFamilyPlannerModals: typeof renderFamilyPlannerModals;
  renderFamilyPlannerScope: typeof renderFamilyPlannerScope;
  prototypeWeekDateMap: typeof prototypeWeekDateMap;
  recipeTitleFromPrototypeId: typeof recipeTitleFromPrototypeId;
  isImportantPlannerFeast: typeof isImportantPlannerFeast;
  prototypeStateToFamilyPlanningPayload: typeof prototypeStateToFamilyPlanningPayload;
  adjacentMonthKey: typeof adjacentMonthKey;
  uniqueMonthLessons: typeof uniqueMonthLessons;
  renderMonthLessonChip: typeof renderMonthLessonChip;
  renderPlannerMonth: typeof renderPlannerMonth;
};
