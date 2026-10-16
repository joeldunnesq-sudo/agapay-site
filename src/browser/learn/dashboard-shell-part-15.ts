import type {
  LearnTruthyFilter,
  LearnShellNode,
  LearnShellPrototypeState,
  LearnShellPayload,
  LearnShellError,
  LearnPlannerVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const wireWeeklyAssignmentBoard: LearnShellBindings['wireWeeklyAssignmentBoard'];
declare const wireMoveUnfinishedWork: LearnShellBindings['wireMoveUnfinishedWork'];
declare const root: LearnShellBindings['root'];
declare const mount: LearnShellBindings['mount'];
declare const wireFamilyPrototypeBackend: LearnShellBindings['wireFamilyPrototypeBackend'];
declare const storedLearnCalendar: LearnShellBindings['storedLearnCalendar'];
declare const learnApiUrl: LearnShellBindings['learnApiUrl'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare const downloadBlob: LearnShellBindings['downloadBlob'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const familyPlanningPayloadFromForm: LearnShellBindings['familyPlanningPayloadFromForm'];
declare const rowValue: LearnShellBindings['rowValue'];
declare const dayKeyForChore: LearnShellBindings['dayKeyForChore'];
declare const setupBlankRow: LearnShellBindings['setupBlankRow'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const syncLearnGoogleCalendar: LearnShellBindings['syncLearnGoogleCalendar'];
declare const prepareOdysseyViewModel: LearnShellBindings['prepareOdysseyViewModel'];
declare const renderPlanner: LearnShellBindings['renderPlanner'];
declare const html: LearnShellBindings['html'];
declare const plannerDayLabel: LearnShellBindings['plannerDayLabel'];
declare const choreScheduleLabel: LearnShellBindings['choreScheduleLabel'];
declare const familyEventSetupRow: LearnShellBindings['familyEventSetupRow'];
declare const choreSetupRow: LearnShellBindings['choreSetupRow'];
declare const recipeSetupRow: LearnShellBindings['recipeSetupRow'];
declare const grocerySetupRow: LearnShellBindings['grocerySetupRow'];
declare const prototypeWeekDateMap: LearnShellBindings['prototypeWeekDateMap'];
declare const familyPlannerModel: LearnShellBindings['familyPlannerModel'];
declare const renderChoresScope: LearnShellBindings['renderChoresScope'];
declare const choreTimeValues: LearnShellBindings['choreTimeValues'];
declare const mealSlotLabel: LearnShellBindings['mealSlotLabel'];
declare const toPlannerViewModel: LearnShellBindings['toPlannerViewModel'];
declare const renderLearnRoot: LearnShellBindings['renderLearnRoot'];

function wirePlanner(vm: LearnPlannerVm) {
  if (vm.activeView) localStorage.setItem('agapay.learn.plannerView', vm.activeView);
  if (vm.month?.key) localStorage.setItem('agapay.learn.plannerMonth', vm.month.key);
  if (vm.term?.activeTerm) localStorage.setItem('agapay.learn.plannerTerm', String(vm.term.activeTerm));
  wireWeeklyAssignmentBoard(vm);
  wireMoveUnfinishedWork(vm);

  // Week navigation — prev / next / today
  root!.querySelectorAll<HTMLButtonElement>('[data-week-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const board = root!.querySelector<HTMLElement>('[data-week-assignment-board]');
      const weekStart = board?.dataset.weekStart || '';
      const direction = button.dataset.weekNav;
      let targetDate;
      if (direction === 'today') {
        targetDate = new Date().toISOString().slice(0, 10);
      } else {
        const offset = Number(direction) * 7;
        const base = weekStart ? new Date(`${weekStart}T12:00:00Z`) : new Date();
        base.setUTCDate(base.getUTCDate() + offset);
        targetDate = base.toISOString().slice(0, 10);
      }
      const params = new URLSearchParams(window.location.search);
      params.set('date', targetDate);
      params.set('view', 'week');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
      mount();
    });
  });

  // Intro dismiss — sets a localStorage flag so the intro hides on next visit
  root!.querySelector<HTMLButtonElement>('[data-planner-intro-dismiss]')?.addEventListener('click', (event) => {
    const key = (event.currentTarget as HTMLElement).dataset.plannerIntroDismiss;
    if (key) localStorage.setItem(key, '1');
    const introEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('.learn-family-intro')?.parentElement;
    // Remove the intro block and the dismiss button row together
    (event.currentTarget as HTMLElement).closest<HTMLElement>("div[style*='justify-content:flex-end']")?.remove();
    (event.currentTarget as HTMLElement).closest<HTMLElement>('.learn-family-intro')?.remove();
  });

  const prototypeFrame = root!.querySelector<HTMLIFrameElement>('[data-family-prototype-frame]');
  if (prototypeFrame) wireFamilyPrototypeBackend(vm, prototypeFrame);
  root!.querySelector<HTMLButtonElement>('[data-planner-month-print]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const month =
      (button as HTMLElement).dataset.plannerMonthPrint || vm.month?.key || new Date().toISOString().slice(0, 7);
    const originalText = (button as HTMLElement).textContent;
    (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
    (button as HTMLElement).textContent = 'Generating...';
    try {
      const calendar = storedLearnCalendar('');
      const response = await fetch(learnApiUrl('/api/learn/print/print_mom_month', { calendar, month }), {
        method: 'POST',
        headers: learnRequestHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ month }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/pdf')) {
        const payload = contentType.includes('application/json')
          ? ((await response.json().catch(() => ({}))) as LearnShellPayload)
          : {};
        throw new Error(payload.error || 'Unable to generate the month calendar. Please try again.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(fileMatch?.[1] || `agapay-learn-${month}-calendar.pdf`, blob);
    } catch (error) {
      showLearnDialog(
        'Month Calendar Could Not Be Generated',
        (error as LearnShellError).message || 'Please refresh and try again.',
        []
      );
    } finally {
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      (button as HTMLElement).textContent = originalText as unknown as string;
    }
  });
  const familyForm = root!.querySelector<HTMLFormElement>('[data-family-planning-form]');
  let activeMeal: { date: string; slot: string } | null = null;
  const openFamilyModal = (name: string) => {
    const modal = familyForm?.querySelector<HTMLElement>(`[data-family-modal="${name}"]`);
    if (!modal) return null;
    modal.hidden = false;
    modal.style.display = 'flex';
    modal.querySelector<HTMLInputElement>('input, textarea, button')?.focus();
    return modal;
  };
  const closeFamilyModals = () => {
    familyForm?.querySelectorAll<HTMLElement>('[data-family-modal]').forEach((modal) => {
      modal.hidden = true;
      modal.style.display = 'none';
    });
  };
  const submitFamilyPlanner = () => {
    (familyForm as HTMLFormElement)?.requestSubmit();
  };
  const refreshChoreCalendar = () => {
    if (!familyForm) return;
    const live = familyForm.querySelector<HTMLElement>('[data-family-planner-live]');
    if (!live) return;
    const params = new URLSearchParams(window.location.search);
    const scope = params.get('scope') || vm.activeScope || 'lessons';
    if (scope !== 'chores') return;
    const displayView = params.get('view') || vm.activeView || 'week';
    const payload = familyPlanningPayloadFromForm(familyForm);
    const nextVm = {
      ...vm,
      familyPlanning: {
        ...(vm.familyPlanning || {}),
        ...(payload.familyPlanning || {}),
        household: {
          ...(vm.familyPlanning?.household || {}),
          ...(payload.household || {}),
        },
        children: vm.familyPlanning?.children || [],
      },
    };
    live.innerHTML = renderChoresScope(familyPlannerModel(nextVm), displayView);
  };
  const setModalValue = (name: string, value: unknown) => {
    const fields = familyForm?.querySelectorAll<HTMLElement>(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return;
    if (fields.length > 1 && (fields[0] as HTMLInputElement | HTMLButtonElement).type === 'checkbox') {
      const selected = choreTimeValues(value);
      fields.forEach((field) => {
        (field as HTMLInputElement).checked = selected.includes(
          (field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
        );
      });
      return;
    }
    (fields[0] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (value ||
      '') as unknown as string;
  };
  const getModalValue = (name: string) => {
    const fields = familyForm?.querySelectorAll<HTMLElement>(`[name="${CSS.escape(name)}"]`) || [];
    if (!fields.length) return '';
    if (fields.length > 1 && (fields[0] as HTMLInputElement | HTMLButtonElement).type === 'checkbox') {
      return [...fields]
        .filter((field) => (field as HTMLInputElement).checked)
        .map((field) => (field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
        .join(', ');
    }
    return (fields[0] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value?.trim() || '';
  };
  const resetChoreBatchList = () => {
    const batchList = familyForm?.querySelector<HTMLElement>('[data-chore-batch-list]');
    if (!batchList) return;
    batchList.innerHTML = '';
    batchList.hidden = true;
  };
  const addChoreToBatchList = (entry: LearnShellNode | undefined = {}) => {
    const batchList = familyForm?.querySelector<HTMLElement>('[data-chore-batch-list]');
    if (!batchList || !entry.title) return;
    batchList.hidden = false;
    batchList.insertAdjacentHTML(
      'beforeend',
      `<span><strong>${html(entry.title)}</strong><small>${html([entry.assignee || 'Everyone', choreScheduleLabel(entry)].filter(Boolean as unknown as LearnTruthyFilter).join(' · '))}</small></span>`
    );
  };
  let activeChore: LearnShellNode | null = null;
  let activeEvent: LearnShellNode | null = null;
  const removeEventRows = (eventEntry: LearnShellNode = {}) => {
    if (!familyForm) return;
    familyForm
      .querySelectorAll<HTMLElement>('[data-setup-list="familyEvents"] [data-setup-row="familyEvents"]')
      .forEach((row) => {
        const sameId = eventEntry.id && row.dataset.id === eventEntry.id;
        const sameDetails =
          !eventEntry.id &&
          (rowValue(row, 'title') as string) === (eventEntry.title || '') &&
          (rowValue(row, 'date') as string) === (eventEntry.date || '') &&
          (rowValue(row, 'startTime') as string) === (eventEntry.startTime || '');
        if (sameId || sameDetails) row.remove();
      });
  };
  const choreStorageKey = (chore: LearnShellNode = {}) => {
    const dayKey = dayKeyForChore(chore, vm);
    return dayKey ? `${chore.assignee || 'Everyone'}::${dayKey}::${chore.id || chore.title || 'chore'}` : '';
  };
  const removeChoreRows = (chore: LearnShellNode = {}) => {
    if (!familyForm) return;
    familyForm.querySelectorAll<HTMLElement>('[data-setup-list="chores"] [data-setup-row="chores"]').forEach((row) => {
      const sameId = chore.id && row.dataset.id === chore.id;
      const sameDetails =
        !chore.id &&
        (rowValue(row, 'title') as string) === (chore.title || '') &&
        (rowValue(row, 'assignee') as string) === (chore.assignee || 'Everyone') &&
        (rowValue(row, 'day') as string) === (chore.day || '');
      if (sameId || sameDetails) row.remove();
    });
  };
  const removeChoreFromDraftState = (chore: LearnShellNode = {}) => {
    const key = choreStorageKey(chore);
    if (!key) return;
    try {
      const state = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}') as LearnShellPrototypeState;
      if (state.chores) delete state.chores[key];
      if (state.choreDetails) delete state.choreDetails[key];
      localStorage.setItem('agapay.planner.v2', JSON.stringify(state));
    } catch {
      // The hidden setup row removal is still enough for the backend save.
    }
  };
  const setMealValue = (date: string, slot: string, value: unknown) => {
    if (!date || !slot) return;
    let row = familyForm?.querySelector<HTMLElement>(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    if (!row) {
      const list = familyForm?.querySelector<HTMLElement>('[data-setup-list="meals"]');
      list?.insertAdjacentHTML(
        'beforeend',
        `<div data-setup-row="meals" data-date="${html(date)}" hidden><input name="date" value="${html(date)}"><input name="breakfast" value=""><input name="lunch" value=""><input name="dinner" value=""></div>`
      );
      row = familyForm?.querySelector<HTMLElement>(`[data-setup-row="meals"][data-date="${CSS.escape(date)}"]`);
    }
    const input = row?.querySelector<HTMLElement>(`[name="${CSS.escape(slot)}"]`);
    if (input)
      (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (value || '') as unknown as string;
    root!
      .querySelectorAll<HTMLElement>(
        `[data-meal-open][data-date="${CSS.escape(date)}"][data-slot="${CSS.escape(slot)}"]`
      )
      .forEach((button) => {
        const strong = button.querySelector<HTMLElement>('strong');
        const small = button.querySelector<HTMLElement>('small');
        if (strong) strong.textContent = (value || 'No dish yet') as string;
        if (small) small.textContent = value ? 'change it →' : 'add a dish →';
      });
  };
  familyForm?.addEventListener('click', (event) => {
    const close = (event.target as HTMLElement).closest<HTMLElement>('[data-family-modal-close]');
    if (close) {
      closeFamilyModals();
      return;
    }
    const mealButton = (event.target as HTMLElement).closest<HTMLElement>('[data-meal-open]');
    if (mealButton) {
      activeMeal = { date: mealButton.dataset.date || '', slot: mealButton.dataset.slot || '' };
      const modal = openFamilyModal('meal');
      const input = modal?.querySelector<HTMLInputElement>('[data-meal-custom-input]');
      const context = modal?.querySelector<HTMLElement>('[data-meal-modal-context]');
      const row = familyForm.querySelector<HTMLElement>(
        `[data-setup-row="meals"][data-date="${CSS.escape(activeMeal.date)}"]`
      );
      if (input)
        (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value =
          (
            row?.querySelector<HTMLElement>(`[name="${CSS.escape(activeMeal.slot)}"]`) as
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          )?.value || '';
      if (context) context.textContent = `${mealSlotLabel(activeMeal.slot)} · ${activeMeal.date}`;
      return;
    }
    const mealPick = (event.target as HTMLElement).closest<HTMLElement>('[data-meal-pick]');
    if (mealPick && activeMeal) {
      const input = familyForm.querySelector<HTMLInputElement>('[data-meal-custom-input]');
      if (input)
        (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = mealPick.dataset.mealPick || '';
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-meal-clear]') && activeMeal) {
      setMealValue(activeMeal.date, activeMeal.slot, '');
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-meal-save]') && activeMeal) {
      setMealValue(
        activeMeal.date,
        activeMeal.slot,
        (
          familyForm.querySelector<HTMLInputElement>('[data-meal-custom-input]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || ''
      );
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const recipeOpen = (event.target as HTMLElement).closest<HTMLElement>('[data-recipe-open]');
    if (recipeOpen) {
      const card = recipeOpen.closest<HTMLElement>('[data-recipe-title]');
      setModalValue('modalRecipe.title', card?.dataset.recipeTitle || '');
      setModalValue('modalRecipe.fastingType', card?.dataset.recipeFasting || 'free');
      setModalValue('modalRecipe.category', card?.dataset.recipeCategory || '');
      setModalValue('modalRecipe.sourceUrl', card?.dataset.recipeSource || '');
      setModalValue('modalRecipe.ingredients', card?.dataset.recipeIngredients || '');
      setModalValue('modalRecipe.instructions', card?.dataset.recipeInstructions || '');
      openFamilyModal('recipe');
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-recipe-save]')) {
      const list = familyForm.querySelector<HTMLElement>('[data-setup-list="recipes"]');
      const recipe = {
        title: getModalValue('modalRecipe.title'),
        fastingType: getModalValue('modalRecipe.fastingType'),
        category: getModalValue('modalRecipe.category'),
        sourceUrl: getModalValue('modalRecipe.sourceUrl'),
        ingredients: getModalValue('modalRecipe.ingredients'),
        instructions: getModalValue('modalRecipe.instructions'),
      };
      if (recipe.title && list) list.insertAdjacentHTML('beforeend', recipeSetupRow(recipe));
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const eventOpen = (event.target as HTMLElement).closest<HTMLElement>('[data-event-open]');
    if (eventOpen) {
      const existingEventId = eventOpen.dataset.eventId || '';
      activeEvent = existingEventId
        ? {
            id: existingEventId,
            title: eventOpen.dataset.title || '',
            eventType: eventOpen.dataset.type || '',
            date: eventOpen.dataset.date || '',
            startTime: eventOpen.dataset.time || '',
            recurrence: eventOpen.dataset.recurrence || 'none',
            location: eventOpen.dataset.location || '',
            notes: eventOpen.dataset.notes || '',
          }
        : null;
      setModalValue('modalEvent.title', eventOpen.dataset.title || '');
      setModalValue('modalEvent.eventType', eventOpen.dataset.type || 'Family');
      setModalValue('modalEvent.date', eventOpen.dataset.date || '');
      setModalValue('modalEvent.startTime', eventOpen.dataset.time || '');
      setModalValue('modalEvent.recurrence', eventOpen.dataset.recurrence || 'none');
      setModalValue('modalEvent.location', eventOpen.dataset.location || '');
      setModalValue('modalEvent.notes', eventOpen.dataset.notes || '');
      const eventDeleteButton = familyForm.querySelector<HTMLButtonElement>('[data-event-delete]');
      if (eventDeleteButton) eventDeleteButton.hidden = !existingEventId;
      const eventModalTitle = familyForm.querySelector<HTMLElement>('[data-event-modal-title]');
      if (eventModalTitle) eventModalTitle.textContent = existingEventId ? 'Edit calendar event' : 'Add to calendar';
      openFamilyModal('event');
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-event-delete]')) {
      if (activeEvent) {
        removeEventRows(activeEvent);
        activeEvent = null;
      }
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-event-save]')) {
      const list = familyForm.querySelector<HTMLElement>('[data-setup-list="familyEvents"]');
      const entry = {
        id: activeEvent?.id || '',
        title: getModalValue('modalEvent.title'),
        eventType: getModalValue('modalEvent.eventType'),
        date: getModalValue('modalEvent.date'),
        startTime: getModalValue('modalEvent.startTime'),
        recurrence: getModalValue('modalEvent.recurrence') || 'none',
        location: getModalValue('modalEvent.location'),
        notes: getModalValue('modalEvent.notes'),
      };
      // Editing an existing event: remove its old row first so save updates
      // in place instead of appending a duplicate alongside it.
      if (activeEvent) removeEventRows(activeEvent);
      if (entry.title && entry.date && list) list.insertAdjacentHTML('beforeend', familyEventSetupRow(entry));
      activeEvent = null;
      closeFamilyModals();
      submitFamilyPlanner();
      return;
    }
    const choreOpen = (event.target as HTMLElement).closest<HTMLElement>('[data-chore-open]');
    if (choreOpen) {
      const existing = choreOpen.dataset.choreExisting === '1';
      activeChore = existing
        ? {
            id: choreOpen.dataset.choreId || '',
            title: choreOpen.dataset.choreTitle || '',
            assignee: choreOpen.dataset.choreAssignee || choreOpen.dataset.assignee || 'Everyone',
            cadence: choreOpen.dataset.choreCadence || 'weekly',
            day: choreOpen.dataset.choreDay || choreOpen.dataset.day || '',
            dayOfMonth: choreOpen.dataset.choreDayOfMonth || '',
            quarterMonth: choreOpen.dataset.choreQuarterMonth || '1',
            assignedDate: choreOpen.dataset.choreAssignedDate || choreOpen.dataset.assignedDate || '',
            timeOfDay: choreOpen.dataset.choreTimeOfDay || 'Anytime',
            notes: choreOpen.dataset.choreNotes || '',
          }
        : null;
      setModalValue('modalChore.title', activeChore?.title || '');
      setModalValue('modalChore.assignee', activeChore?.assignee || choreOpen.dataset.assignee || 'Everyone');
      setModalValue('modalChore.cadence', activeChore?.cadence || choreOpen.dataset.cadence || 'weekly');
      setModalValue('modalChore.day', activeChore?.day || choreOpen.dataset.day || '');
      setModalValue('modalChore.dayOfMonth', activeChore?.dayOfMonth || choreOpen.dataset.dayOfMonth || '');
      setModalValue('modalChore.quarterMonth', activeChore?.quarterMonth || '1');
      setModalValue('modalChore.assignedDate', activeChore?.assignedDate || choreOpen.dataset.assignedDate || '');
      setModalValue('modalChore.timeOfDay', activeChore?.timeOfDay || 'Anytime');
      setModalValue('modalChore.notes', activeChore?.notes || '');
      const deleteButton = familyForm.querySelector<HTMLButtonElement>('[data-chore-delete]');
      if (deleteButton) deleteButton.hidden = !existing;
      const addAnotherButton = familyForm.querySelector<HTMLButtonElement>('[data-chore-save-add]');
      if (addAnotherButton) addAnotherButton.hidden = existing;
      resetChoreBatchList();
      const title = familyForm.querySelector<HTMLElement>('[data-chore-modal-title]');
      if (title) title.textContent = existing ? 'Edit chore' : 'Add chore';
      openFamilyModal('chore');
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-chore-delete]')) {
      if (activeChore) {
        removeChoreRows(activeChore);
        removeChoreFromDraftState(activeChore);
      }
      activeChore = null;
      closeFamilyModals();
      refreshChoreCalendar();
      submitFamilyPlanner();
      return;
    }
    const saveChoreButton = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-chore-save], [data-chore-save-add]'
    );
    if (saveChoreButton) {
      const addAnother = saveChoreButton.hasAttribute('data-chore-save-add');
      const list = familyForm.querySelector<HTMLElement>('[data-setup-list="chores"]');
      const entry = {
        id: activeChore?.id || '',
        title: getModalValue('modalChore.title'),
        assignee: getModalValue('modalChore.assignee'),
        cadence: getModalValue('modalChore.cadence') || 'weekly',
        day: getModalValue('modalChore.day'),
        dayOfMonth: getModalValue('modalChore.dayOfMonth'),
        quarterMonth: getModalValue('modalChore.quarterMonth'),
        assignedDate: getModalValue('modalChore.assignedDate'),
        timeOfDay: getModalValue('modalChore.timeOfDay'),
        notes: getModalValue('modalChore.notes'),
      };
      if (!entry.title) {
        const titleInput = familyForm.querySelector<HTMLElement>('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
        return;
      }
      if (list) {
        const payload = familyPlanningPayloadFromForm(familyForm);
        const planningForRow = {
          ...(payload.familyPlanning || {}),
          household: payload.household || {},
          children: vm.familyPlanning?.children || [],
        };
        if (activeChore) {
          removeChoreRows(activeChore);
          removeChoreFromDraftState(activeChore);
        }
        list.insertAdjacentHTML('beforeend', choreSetupRow(entry, 0, planningForRow));
        try {
          const dayKey = dayKeyForChore(entry, vm);
          if (dayKey) {
            const key = `${entry.assignee || 'Everyone'}::${dayKey}::${entry.id || entry.title || Date.now()}`;
            const state = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}') as LearnShellPrototypeState;
            state.chores = { ...(state.chores || {}), [key]: entry.title || '' };
            state.choreDetails = {
              ...(state.choreDetails || {}),
              [key]: { ...entry, day: entry.day || plannerDayLabel(prototypeWeekDateMap(vm)[dayKey]).long },
            };
            localStorage.setItem('agapay.planner.v2', JSON.stringify(state));
          }
        } catch {
          // Hidden setup rows still carry the chore if local planner state cannot be updated.
        }
      }
      activeChore = null;
      refreshChoreCalendar();
      if (addAnother) {
        addChoreToBatchList(entry);
        setModalValue('modalChore.title', '');
        setModalValue('modalChore.timeOfDay', '');
        setModalValue('modalChore.notes', '');
        const titleInput = familyForm.querySelector<HTMLElement>('[name="modalChore.title"]');
        if (titleInput) titleInput.focus();
      } else {
        closeFamilyModals();
        submitFamilyPlanner();
      }
      return;
    }
    const groceryRemove = (event.target as HTMLElement).closest<HTMLElement>('[data-grocery-remove]');
    if (groceryRemove) {
      const id = groceryRemove.dataset.groceryRemove || '';
      if (id) {
        const row = familyForm.querySelector<HTMLElement>(
          `[data-setup-list="groceryItems"] [data-setup-row="groceryItems"][data-id="${CSS.escape(id)}"]`
        );
        if (row) row.remove();
      }
      submitFamilyPlanner();
      return;
    }
    const groceryAdd = (event.target as HTMLElement).closest<HTMLElement>('[data-grocery-add]');
    if (groceryAdd) {
      const list = familyForm.querySelector<HTMLElement>('[data-setup-list="groceryItems"]');
      const pantry = groceryAdd.hasAttribute('data-pantry-add');
      if (list)
        list.insertAdjacentHTML(
          'beforeend',
          grocerySetupRow({
            name: pantry ? 'New pantry staple' : 'New grocery item',
            category: pantry ? 'Pantry' : 'Produce',
            pantry,
          })
        );
      submitFamilyPlanner();
      return;
    }
    const remove = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-remove-row]');
    if (remove) {
      const row = remove.closest<HTMLElement>('[data-setup-row]');
      // No row type rendered by this form requires keeping a minimum of one —
      // recipes, groceries, chores, and family events all render a blank
      // placeholder row when their list is empty. The old length > 1 guard
      // blocked deletion whenever only one row remained.
      if (row) row.remove();
      return;
    }
    const add = (event.target as HTMLElement).closest<HTMLElement>('[data-setup-add-row]');
    if (!add) return;
    const list = add.dataset.setupAddTarget
      ? familyForm.querySelector<HTMLElement>(`#${CSS.escape(add.dataset.setupAddTarget)}`)
      : familyForm.querySelector<HTMLElement>(`[data-setup-list="${add.dataset.setupAddRow}"]`);
    if (list)
      list.insertAdjacentHTML(
        'beforeend',
        setupBlankRow(add.dataset.setupAddRow!, familyForm, { date: add.dataset.setupAddDate || '' })
      );
  });
  // ── Appointment drag-and-drop between days ──────────────────────────────
  // Each rendered appointment (data-event-drag) can be dragged onto another
  // day's drop zone (data-event-dropzone). On drop, the matching setup row's
  // date field is updated in place and the form is resaved.
  let draggedEventRow: HTMLElement | null = null;
  familyForm?.addEventListener('dragstart', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-event-drag]');
    if (!row) return;
    draggedEventRow = row;
    row.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', row.dataset.eventId || row.dataset.title || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  familyForm?.addEventListener('dragend', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-event-drag]');
    if (row) row.classList.remove('is-dragging');
    draggedEventRow = null;
    familyForm
      .querySelectorAll<HTMLElement>('[data-event-dropzone]')
      .forEach((zone) => zone.classList.remove('is-over'));
  });
  familyForm?.addEventListener('dragover', (event) => {
    const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-event-dropzone]');
    if (!zone || !draggedEventRow) return;
    event.preventDefault();
    zone.classList.add('is-over');
  });
  familyForm?.addEventListener('dragleave', (event) => {
    const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-event-dropzone]');
    if (zone) zone.classList.remove('is-over');
  });
  familyForm?.addEventListener('drop', (event) => {
    const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-event-dropzone]');
    if (!zone || !draggedEventRow) return;
    event.preventDefault();
    zone.classList.remove('is-over');
    const targetDate = zone.dataset.eventDropzone || '';
    const sourceRow = draggedEventRow;
    draggedEventRow = null;
    if (!targetDate || targetDate === sourceRow.dataset.date) return;
    const movedEvent = {
      id: sourceRow.dataset.eventId || '',
      title: sourceRow.dataset.title || '',
      eventType: sourceRow.dataset.type || '',
      date: sourceRow.dataset.date || '',
      startTime: sourceRow.dataset.time || '',
      recurrence: sourceRow.dataset.recurrence || 'none',
      location: sourceRow.dataset.location || '',
      notes: sourceRow.dataset.notes || '',
    };
    // Update the underlying hidden setup row's date, then move the
    // rendered card into the target day's list so the UI reflects the
    // change immediately, ahead of the resave confirming it.
    removeEventRows(movedEvent);
    const list = familyForm.querySelector<HTMLElement>('[data-setup-list="familyEvents"]');
    if (list) list.insertAdjacentHTML('beforeend', familyEventSetupRow({ ...movedEvent, date: targetDate }));
    const rowsContainer = zone.querySelector<HTMLElement>('[data-event-rows]');
    if (rowsContainer) {
      rowsContainer.querySelector<HTMLElement>('[data-event-empty-hint]')?.remove();
      sourceRow.remove();
      rowsContainer.appendChild(sourceRow);
      sourceRow.dataset.date = targetDate;
      sourceRow.querySelectorAll<HTMLElement>('[data-event-open], [data-date]').forEach((el: HTMLElement) => {
        if (el.dataset.date !== undefined) el.dataset.date = targetDate;
      });
    }
    submitFamilyPlanner();
  });

  familyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = familyForm.querySelector<HTMLElement>('[data-family-planning-status]');
    const submit = familyForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    status!.textContent = 'Saving family planner...';
    submit!.disabled = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const saveQuery = new URLSearchParams({
        calendar: params.get('calendar') || storedLearnCalendar(''),
        view: params.get('view') || vm.activeView || 'week',
        month: params.get('month') || vm.month?.key || new Date().toISOString().slice(0, 7),
        date: params.get('date') || vm.day?.selected?.date || new Date().toISOString().slice(0, 10),
      });
      const saved = await apiPost(
        `/api/learn/family-planning?${saveQuery.toString()}`,
        familyPlanningPayloadFromForm(familyForm)
      );
      status!.textContent = `Family planner saved${saved.savedAt ? ` at ${new Date(saved.savedAt).toLocaleTimeString()}` : ''}.`;
      status!.style.color = 'var(--gold)';
      await syncLearnGoogleCalendar([], status);
      // Re-render the planner from the returned payload so calendar-type changes
      // and other data-driven updates are immediately reflected without a full reload.
      if (saved.planner) {
        const updatedVm: LearnPlannerVm = toPlannerViewModel({ ok: true, planner: saved.planner });
        const scope = params.get('scope') || updatedVm.activeScope || 'lessons';
        const displayView = params.get('view') || updatedVm.activeView || 'week';
        const preparedVm = prepareOdysseyViewModel(updatedVm);
        renderLearnRoot(root, renderPlanner(preparedVm));
        wirePlanner(preparedVm);
      }
    } catch (error) {
      status!.textContent = (error as LearnShellError).message;
      status!.style.color = 'var(--burgundy)';
    } finally {
      submit!.disabled = false;
    }
  });

  // ── Lesson block note save ────────────────────────────────────────────────────
  root!.querySelectorAll<HTMLFormElement>('[data-block-note-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const blockId = form.dataset.blockNoteForm || '';
      const note =
        (
          form.querySelector<HTMLElement>('[data-block-note-input]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '';
      const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }
      try {
        await apiPost('/api/learn/planner', { action: 'note', blockId, note });
        const wrap = form.closest<HTMLElement>('[data-block-note-wrap]');
        if (wrap) {
          wrap.querySelector<HTMLElement>('[data-block-note-display]')!.textContent = note;
          wrap.dataset.blockNoteOpen = '';
        }
      } catch (error) {
        showLearnDialog('Note Could Not Be Saved', (error as LearnShellError).message || 'Please try again.', []);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Note';
        }
      }
    });
  });

  // ── Lesson block reschedule ───────────────────────────────────────────────────
  root!.querySelectorAll<HTMLElement>('[data-block-reschedule]').forEach((button) => {
    button.addEventListener('click', async () => {
      const blockId = button.dataset.blockReschedule || '';
      const fromDate = button.dataset.blockFromDate || '';
      const toDate = button.dataset.blockToDate || '';
      if (!blockId || !fromDate || !toDate) return;
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      try {
        const calendar = storedLearnCalendar('');
        const saved = await apiPost(learnApiUrl('/api/learn/planner', { calendar }), {
          action: 'reschedule',
          blockId,
          fromDate,
          toDate,
        });
        await syncLearnGoogleCalendar();
        if (saved.planner) {
          const updatedVm = toPlannerViewModel({ ok: true, planner: saved.planner });
          const preparedVm = prepareOdysseyViewModel(updatedVm);
          renderLearnRoot(root, renderPlanner(preparedVm));
          wirePlanner(preparedVm);
        }
      } catch (error) {
        showLearnDialog('Reschedule Could Not Be Saved', (error as LearnShellError).message || 'Please try again.', []);
      } finally {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
      }
    });
  });
}
export type LearnShell2Part14 = { wirePlanner: typeof wirePlanner };
