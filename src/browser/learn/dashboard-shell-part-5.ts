import type {
  LearnPrototypeForm,
  LearnShellNode,
  LearnShellPrototypeState,
  LearnShellError,
  LearnPlannerVm,
  LearnFormationVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyLearn5<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

declare const storedLearnCalendar: LearnShellBindings['storedLearnCalendar'];
declare const prototypeRecipeType: LearnShellBindings['prototypeRecipeType'];
declare const prototypeDaySeeds: LearnShellBindings['prototypeDaySeeds'];
declare const learnAccountEmail: LearnShellBindings['learnAccountEmail'];
declare const prototypeMonthSeed: LearnShellBindings['prototypeMonthSeed'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const check: LearnShellBindings['check'];
declare const bar: LearnShellBindings['bar'];
declare const shell: LearnShellBindings['shell'];
declare const ACCENTS: LearnShellBindings['ACCENTS'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const panel: LearnShellBindings['panel'];
declare const prototypeWeekDateMap: LearnShellBindings['prototypeWeekDateMap'];
declare const PROTOTYPE_RECIPE_TITLES: LearnShellBindings['PROTOTYPE_RECIPE_TITLES'];
declare const prototypeStateToFamilyPlanningPayload: LearnShellBindings['prototypeStateToFamilyPlanningPayload'];

function prototypeSetupSeed(vm: LearnPlannerVm) {
  const grouping = (vm.familyPlanning?.children || []).some((child) => child.formLabel) ? 'Forms' : 'Grades';
  const formMap = new Map<string, LearnPrototypeForm>();
  (vm.familyPlanning?.children || []).forEach((child, index) => {
    const label = child.formLabel || child.gradeLabel || child.form || child.grade || 'Household';
    if (!formMap.has(label)) {
      formMap.set(label, {
        id: `form_${formMap.size + 1}`,
        label,
        color: child.color || ACCENTS[index % ACCENTS.length],
        children: [],
        subjects: [],
      });
    }
    formMap.get(label)!.children.push(child.name || child.firstName || `Child ${index + 1}`);
  });
  (vm.week?.formRows || []).forEach((row) => {
    const label = row.formLabel || row.label || 'Household';
    if (!formMap.has(label))
      formMap.set(label, {
        id: `form_${formMap.size + 1}`,
        label,
        color: row.color || ACCENTS[formMap.size % ACCENTS.length],
        children: [],
        subjects: [],
      });
    const target = formMap.get(label);
    (row.blocks || []).forEach((block: LearnShellNode) => {
      const title = block.title || row.title;
      if (title && !target!.subjects.includes(title)) target!.subjects.push(title);
    });
  });
  (vm.term?.pacingRows || []).forEach((row) => {
    const label = row.formLabel || row.label || '';
    const targets = label && formMap.has(label) ? [formMap.get(label)] : [...formMap.values()];
    targets.forEach((target) => {
      const title = row.subjectTitle || row.title || row.label;
      if (title && !target!.subjects.includes(title)) target!.subjects.push(title);
    });
  });
  const forms = [...formMap.values()].map((form) => ({
    ...form,
    subjects: form.subjects.length ? form.subjects : ['Math', 'Language Arts', 'History', 'Science', 'Literature'],
  }));
  return {
    calendar: storedLearnCalendar(vm.preferences?.calendarType || ''),
    grouping,
    enrichment: (vm.week?.householdRows || []).map((row) => row.title).filter(truthyLearn5),
    forms: forms.length
      ? forms
      : [
          {
            id: 'household',
            label: 'Household',
            color: '#b5942f',
            children: [],
            subjects: ['Math', 'Language Arts', 'History', 'Science', 'Literature'],
          },
        ],
  };
}

function prototypeKidsSeed(vm: LearnPlannerVm) {
  const chores = vm.familyPlanning?.chores || [];
  return (vm.familyPlanning?.children || []).map((child, index) => {
    const name = child.name || child.firstName || `Child ${index + 1}`;
    const childChores = chores
      .filter((chore) => !chore.assignee || chore.assignee === name)
      .map((chore) => chore.title)
      .filter(truthyLearn5);
    return {
      name,
      color: child.color || ACCENTS[index % ACCENTS.length],
      chores: childChores.length ? childChores : ['', '', '', '', ''],
    };
  });
}

function backendRecipeToPrototype(recipe: LearnShellNode, index: number = 0) {
  const id = recipe.id || `agp_recipe_${index + 1}`;
  const types = [
    prototypeRecipeType(
      String(recipe.category || '')
        .toLowerCase()
        .includes('breakfast')
        ? 'breakfast'
        : String(recipe.category || '')
              .toLowerCase()
              .includes('lunch')
          ? 'lunch'
          : 'dinner'
    ),
  ];
  return {
    id,
    recipe: {
      name: recipe.title || `Recipe ${index + 1}`,
      types,
      level:
        recipe.fastingType === 'strict'
          ? 'strict'
          : recipe.fastingType === 'fish'
            ? 'fish'
            : recipe.fastingType === 'regular'
              ? 'rich'
              : 'oilwine',
      time: '30 min',
      servings: 4,
      glyph: '🍲',
      ingredients: String(recipe.ingredients || '')
        .split(',')
        .map((item) => item.trim())
        .filter(truthyLearn5),
      note: recipe.instructions || recipe.category || 'Saved from AGAPAY Learn.',
      custom: true,
    },
  };
}

function seedFamilyPrototypeState(vm: LearnPlannerVm) {
  const existing = JSON.parse(localStorage.getItem('agapay.planner.v2') || '{}') as LearnShellPrototypeState;
  const planning = vm.familyPlanning || {};
  const dateToKey = Object.fromEntries(Object.entries(prototypeWeekDateMap(vm)).map(([key, date]) => [date, key]));
  const userRecipes: NonNullable<LearnShellPrototypeState['userRecipes']> = {};
  const recipeIdsByTitle = new Map(
    Object.entries(PROTOTYPE_RECIPE_TITLES).map(([id, title]) => [title.toLowerCase(), id])
  );
  (planning.recipes || []).forEach((recipe, index) => {
    const converted = backendRecipeToPrototype(recipe, index);
    userRecipes[converted.id] = converted.recipe;
    recipeIdsByTitle.set(converted.recipe.name.toLowerCase(), converted.id);
  });
  const plan: Record<string, string> = {};
  (planning.meals || []).forEach((meal) => {
    const dayKey = dateToKey[meal.date as string];
    if (!dayKey) return;
    ['breakfast', 'lunch', 'dinner'].forEach((slot: string) => {
      const title = learnMealSlotValue(meal, slot);
      if (!title) return;
      let recipeId = recipeIdsByTitle.get(String(title).toLowerCase());
      if (!recipeId) {
        recipeId = `agp_${dayKey}_${slot}`;
        userRecipes[recipeId] = {
          name: title,
          types: [slot],
          level: 'oilwine',
          time: '30 min',
          servings: 4,
          glyph: '🍲',
          ingredients: [],
          note: 'Saved from AGAPAY Learn.',
          custom: true,
        };
        recipeIdsByTitle.set(String(title).toLowerCase(), recipeId);
      }
      plan[`${dayKey}-${slot}`] = recipeId;
    });
  });
  const events = (planning.events || []).map((event, index) => ({
    id: event.id || `agp_event_${index + 1}`,
    type: event.eventType || 'Appointment',
    title: event.title || 'Family event',
    dayKey: dateToKey[event.date as string] || 'd3',
    time: event.startTime || '',
    who: event.location || 'Family',
    note: event.notes || '',
  }));
  const pantry = (planning.groceryItems || [])
    .filter((item) => item.pantry || item.inPantry)
    .map((item) => item.name)
    .filter(truthyLearn5);
  const manualGroceries = (planning.groceryItems || [])
    .filter((item) => !(item.pantry || item.inPantry))
    .map((item, index) => ({
      id: item.id || `agp_grocery_${index + 1}`,
      aisle: item.category || 'Pantry',
      label: item.quantity ? `${item.quantity} ${item.name}` : item.name,
    }))
    .filter((item) => item.label);
  const dayKeyByLabel = Object.fromEntries(
    prototypeDaySeeds(vm).map((day) => [String(day.long || day.weekday || '').toLowerCase(), day.key])
  );
  const chores: Record<string, string> = {};
  const choreDetails: NonNullable<LearnShellPrototypeState['choreDetails']> = {};
  (planning.chores || []).forEach((chore) => {
    const assignee = chore.assignee || 'Everyone';
    const dayKey = dayKeyByLabel[String(chore.day || '').toLowerCase()] || '';
    if (dayKey && chore.title) {
      const key = `${assignee}::${dayKey}`;
      chores[key] = chore.title;
      choreDetails[key] = {
        id: chore.id || '',
        title: chore.title || '',
        assignee,
        cadence: chore.cadence || 'weekly',
        day: chore.day || '',
        dayOfMonth: chore.dayOfMonth || '',
        quarterMonth: chore.quarterMonth || '',
        timeOfDay: chore.timeOfDay || 'Anytime',
        notes: chore.notes || '',
        completed: Boolean(chore.completed),
      };
    }
  });
  const seed = {
    email: learnAccountEmail(),
    ui: {
      view: new URLSearchParams(window.location.search).get('view') || 'week',
      scope: new URLSearchParams(window.location.search).get('scope') || 'lessons',
      tab: new URLSearchParams(window.location.search).get('tool') || 'plan',
    },
    days: prototypeDaySeeds(vm),
    month: prototypeMonthSeed(vm),
    setup: prototypeSetupSeed(vm),
    kids: prototypeKidsSeed(vm),
    pantry,
    chores,
    feast: {
      dateLong: (vm.week?.days || []).find((day) => day.feast)?.shortDate || '',
      name: (vm.week?.days || []).find((day) => day.feast)?.feast || 'Upcoming Feast',
      tasks: [],
    },
  };
  localStorage.setItem('agapay.planner.seed.v1', JSON.stringify(seed));
  if (existing?.__agapayBackendSynced) return;
  localStorage.setItem(
    'agapay.planner.v2',
    JSON.stringify({
      __agapayBackendSynced: true,
      plan,
      pantry,
      userRecipes,
      manualGroceries,
      events,
      chores,
      choreDetails,
      groceryChecked: {},
      feastPlan: {},
      google: {
        open: false,
        connected: false,
        email: learnAccountEmail(),
        last: '',
        layers: { lessons: true, terms: true, feasts: true, events: true, chores: false },
      },
    })
  );
}

function wireFamilyPrototypeBackend(vm: LearnPlannerVm, frame: HTMLIFrameElement) {
  let lastSeen = localStorage.getItem('agapay.planner.v2') || '';
  let lastPosted = localStorage.getItem('agapay.planner.v2.backendHash') || '';
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const status = document.createElement('div');
  status.className = 'learn-prototype-sync-status';
  status.textContent = 'Family Planner sync is ready.';
  frame.closest<HTMLElement>('.learn-prototype-embed')?.prepend(status);

  const syncNow = async () => {
    const raw = localStorage.getItem('agapay.planner.v2') || '';
    if (!raw || raw === lastPosted) return;
    let state: LearnShellPrototypeState;
    try {
      state = JSON.parse(raw) as LearnShellPrototypeState;
    } catch {
      return;
    }
    status.textContent = 'Saving Family Planner...';
    status.dataset.state = 'saving';
    try {
      await apiPost('/api/learn/family-planning', prototypeStateToFamilyPlanningPayload(vm, state));
      lastPosted = raw;
      localStorage.setItem('agapay.planner.v2.backendHash', raw);
      status.textContent = 'Family Planner saved.';
      status.dataset.state = 'saved';
    } catch (error) {
      status.textContent = (error as LearnShellError).message || 'Family Planner could not save.';
      status.dataset.state = 'error';
    }
  };

  const scheduleSync = () => {
    window.clearTimeout(syncTimer as number | undefined);
    syncTimer = window.setTimeout(syncNow, 650);
  };

  const poll = window.setInterval(() => {
    const current = localStorage.getItem('agapay.planner.v2') || '';
    if (current !== lastSeen) {
      lastSeen = current;
      scheduleSync();
    }
  }, 900);

  frame.addEventListener(
    'load',
    () => {
      lastSeen = localStorage.getItem('agapay.planner.v2') || '';
      scheduleSync();
    },
    { once: true }
  );

  window.addEventListener(
    'beforeunload',
    () => {
      window.clearInterval(poll);
    },
    { once: true }
  );
}

function renderTefaFormation(vm: LearnFormationVm) {
  const rhythmContent = vm.rhythms?.length
    ? vm.rhythms
        .map(
          (item) =>
            `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);">${check(item.complete)}<span><strong style="display:block;font-size:14px;">${html(item.title)}</strong>${item.note ? `<small class="learn-muted">${html(item.note)}</small>` : ''}</span></div>`
        )
        .join('')
    : emptyState('Add an optional household routine in Setup.');
  const memoryContent = vm.recitation?.length
    ? vm.recitation
        .map(
          (item) =>
            `<div style="padding:11px 0;border-top:1px solid var(--line);"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:7px;"><strong>${html(item.title)}</strong><small class="learn-muted">${html(item.status)}</small></div>${bar(item.progress, 'var(--navy)')}<small class="learn-muted">${html(item.progress)}% complete</small></div>`
        )
        .join('')
    : emptyState('Add poems, speeches, vocabulary, or other memory work in Setup.');
  const enrichmentContent = vm.enrichment?.length
    ? vm.enrichment
        .map(
          (item) =>
            `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line);"><span><strong style="display:block;">${html(item.title)}</strong><small class="learn-muted">${html(item.type)}</small></span><small class="learn-muted">${html(item.minutes)}</small></div>`
        )
        .join('')
    : emptyState('Add art, music, nature study, and other enrichment in Setup.');
  const natureContent = vm.nature?.length
    ? vm.nature
        .map(
          (entry: LearnShellNode) =>
            `<article style="padding:12px 0;border-top:1px solid var(--line);"><strong style="font-family:'Cormorant Garamond',serif;font-size:20px;">${html(entry.title)}</strong>${entry.location ? `<small style="display:block;color:var(--gold);margin-top:2px;">${html(entry.location)}</small>` : ''}${entry.notes ? `<p style="margin:7px 0 0;color:var(--muted);line-height:1.45;">${html(entry.notes)}</p>` : ''}</article>`
        )
        .join('')
    : emptyState('Nature journal entries appear here as you add them.');
  const body = `<section data-screen-label="Formation & Enrichment" class="learn-stack">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px;align-items:start;">
      ${panel('Household Rhythms', rhythmContent, { icon: '◷' })}
      ${panel('Memory & Recitation', memoryContent, { icon: '☰' })}
      ${panel('Art, Music & Enrichment', enrichmentContent, { icon: '✣' })}
      ${panel('Nature Journal', natureContent, { icon: '✦' })}
    </div>
  </section>`;
  return shell(vm, body);
}

function renderFormation(vm: LearnFormationVm) {
  if (learnExperience().tefaActive) return renderTefaFormation(vm);
  // ── Today panel — liturgical day, readings, saint, fasting all in one place ─
  const fastBadge =
    vm.today.fasting && !/no fast/i.test(vm.today.fasting)
      ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(110,47,42,.10);color:var(--burgundy);border:1px solid rgba(110,47,42,.22);border-radius:999px;padding:4px 11px;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">✦ ${html(vm.today.fasting)}</span>`
      : '';
  const readingButtons = vm.today.readingTasks?.length
    ? `<div style="display:grid;gap:8px;margin-top:14px;">${vm.today.readingTasks
        .map(
          (r) => `
        <button type="button" data-reading-check aria-pressed="false"
          style="display:flex;align-items:center;gap:11px;text-align:left;border:1px solid var(--line);border-radius:11px;background:var(--paper2);padding:11px 13px;font-family:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s;">
          <span data-reading-mark style="flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--gold);display:grid;place-items:center;color:var(--gold);font-size:11px;"></span>
          <span style="min-width:0;">
            <strong style="display:block;font-size:14px;">${html(r.label)}</strong>
            <small style="color:var(--muted);font-size:12px;">${html(r.ref)}</small>
          </span>
        </button>`
        )
        .join('')}</div>`
    : vm.today.readings
      ? `<p style="margin:12px 0 0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.today.readings)}</p>`
      : '';

  const saintBlock = vm.today.saint
    ? `<div style="margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(181,148,47,.08),rgba(181,148,47,.03));border:1px solid rgba(181,148,47,.22);border-radius:10px;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Commemorated Today</div>
         <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--ink);line-height:1.25;">${html(vm.today.saint)}</strong>
       </div>`
    : '';

  const troparionBlock = vm.today.troparion
    ? `<div style="margin-top:12px;padding:12px 14px;border-left:3px solid var(--goldsoft);background:rgba(255,255,255,.5);border-radius:0 8px 8px 0;">
         <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:5px;">Troparion</div>
         <p style="margin:0;font-family:'Cormorant Garamond',serif;font-size:16px;line-height:1.55;color:#2a3550;font-style:italic;">${html(vm.today.troparion)}</p>
       </div>`
    : '';

  const todayPanel = panel(
    'Today in the Church',
    `
    <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;line-height:1.05;margin:0;color:var(--ink);">${html(vm.today.title)}</h2>
      <small class="learn-muted-sm">${html(vm.today.date)}</small>
    </div>
    ${fastBadge}
    ${readingButtons}
    ${saintBlock}
    ${troparionBlock}`,
    { icon: '☩', largeTitle: false, style: '' }
  );

  // ── Church rhythms — daily household formation checklist ─────────────────────
  const rhythmsContent = vm.rhythms.length
    ? vm.rhythms
        .map(
          (item) => `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);">
          ${check(item.complete)}
          <div style="min-width:0;">
            <strong style="font-size:14px;display:block;">${html(item.title)}</strong>
            ${item.note ? `<small style="color:var(--muted);font-size:12px;">${html(item.note)}</small>` : ''}
          </div>
        </div>`
        )
        .join('')
    : emptyState('Add daily rhythms in Setup — Morning Prayer, Readings, Scripture memory.');
  const rhythmsPanel = panel('Daily Household Rhythms', rhythmsContent, { icon: '✥' });

  // ── Upcoming feasts — oriented around the week ahead ─────────────────────────
  const feastItems = vm.feasts.length
    ? vm.feasts
        .map(
          (feast) => `
        <div style="display:grid;grid-template-columns:56px 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:start;">
          <div style="text-align:center;background:linear-gradient(180deg,var(--navy),#1b2c4a);border-radius:9px;padding:8px 4px;border:1px solid rgba(181,148,47,.28);">
            <div style="color:var(--gold);font-size:18px;">✦</div>
            <div style="color:#f3ead4;font-size:10px;line-height:1.2;margin-top:2px;">${html(feast.date || 'Soon')}</div>
          </div>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;line-height:1.2;display:block;">${html(feast.title)}</strong>
            ${feast.fasting ? `<small style="color:var(--burgundy);font-size:11px;font-weight:700;">${html(feast.fasting)}</small>` : ''}
          </div>
        </div>`
        )
        .join('')
    : emptyState('Connect a calendar source to see upcoming feasts.');
  const feastsPanel = panel(
    'Upcoming Feasts',
    `${feastItems}<a href="/myagapay/learn/planner" style="display:block;margin-top:10px;text-align:center;font-size:13px;color:var(--gold);text-decoration:none;border:1px solid var(--line);border-radius:9px;padding:9px;">View full calendar →</a>`,
    { icon: '☩' }
  );

  // ── Catechesis ────────────────────────────────────────────────────────────────
  const catechesisPanel = panel(
    'Catechesis',
    `
    <small style="color:var(--gold);letter-spacing:.12em;text-transform:uppercase;font-size:10px;">${html(vm.catechesis.progress) || 'Current Lesson'}</small>
    <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:22px;margin:6px 0 8px;color:var(--ink);">${html(vm.catechesis.title)}</strong>
    <p style="margin:0;color:#33405a;line-height:1.5;font-size:14px;">${html(vm.catechesis.currentLesson)}</p>
    ${vm.catechesis.topic ? `<small style="display:block;margin-top:8px;color:var(--muted);">${html(vm.catechesis.topic)}</small>` : ''}`,
    { icon: '✥' }
  );

  // ── Recitation & Memory Work ──────────────────────────────────────────────────
  const memoryContent = vm.recitation.length
    ? vm.recitation
        .map(
          (item) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;">
            <strong style="font-size:14px;">${html(item.title)}</strong>
            <small style="color:var(--muted);white-space:nowrap;font-size:11px;">${html(item.status)}</small>
          </div>
          ${bar(item.progress, 'var(--navy)')}
          <small style="color:var(--muted);font-size:11px;">${item.progress}% memorised</small>
        </div>`
        )
        .join('')
    : emptyState('Add recitation tracks in Setup — Psalms, Catechism, Scripture.');
  const memoryPanel = panel('Recitation & Memory', memoryContent, { icon: '☰' });

  // ── Hymn Study ────────────────────────────────────────────────────────────────
  const hymnContent = vm.hymns.length
    ? vm.hymns
        .map(
          (hymn) => `
        <div style="padding:11px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(hymn.title)}</strong>
          <small style="color:var(--muted);font-size:12px;">${[hymn.tone, hymn.source].filter(truthyLearn5).join(' · ')}</small>
        </div>`
        )
        .join('')
    : emptyState('Add hymns to study in Setup.');
  const hymnsPanel = panel('Hymn Study', hymnContent, { icon: '♫' });

  // ── Enrichment ────────────────────────────────────────────────────────────────
  const enrichContent = vm.enrichment.length
    ? vm.enrichment
        .map(
          (item) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:center;">
          <span style="min-width:0;">
            <strong style="font-size:13px;display:block;">${html(item.title)}</strong>
            ${item.type ? `<small style="color:var(--muted);font-size:11px;text-transform:capitalize;">${html(item.type)}</small>` : ''}
          </span>
          <span style="color:var(--muted);font-size:12px;white-space:nowrap;">${html(item.minutes)}</span>
        </div>`
        )
        .join('')
    : emptyState('Add enrichment blocks in Setup.');
  const enrichPanel = panel('Enrichment', enrichContent, { icon: '✣' });

  // ── Nature Journal ────────────────────────────────────────────────────────────
  const natureContent = vm.nature?.length
    ? vm.nature
        .map(
          (entry: LearnShellNode) => `
        <div style="padding:10px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(entry.title)}</strong>
          ${entry.location ? `<small style="color:var(--muted);font-size:12px;">📍 ${html(entry.location)}</small>` : ''}
          ${entry.notes ? `<p style="margin:5px 0 0;font-size:13px;color:#33405a;line-height:1.4;">${html(entry.notes)}</p>` : ''}
        </div>`
        )
        .join('')
    : emptyState('Nature journal entries will appear here as you add them.');
  const naturePanel = panel('Nature Journal', natureContent, { icon: '✦' });

  const body = `
    <section data-screen-label="Formation" class="learn-stack">

      <div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;">
        ${todayPanel}
        ${rhythmsPanel}
        ${feastsPanel}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start;">
        ${catechesisPanel}
        ${memoryPanel}
        ${hymnsPanel}
        ${enrichPanel}
        ${naturePanel}
      </div>

    </section>`;
  return shell(vm, body);
}

function bookCover(book: LearnShellNode = {}, icon: string = '☰') {
  const title = String(book.title || 'Book')
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return `<div style="width:58px;height:82px;flex:none;border-radius:7px;border:1.5px solid var(--goldsoft);background:linear-gradient(145deg,var(--navy),#1b2c4a 58%,#6e2f2a);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 18px rgba(20,40,70,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f7e8bd;padding:7px;gap:5px;"><span style="font-size:17px;color:var(--gold2);">${icon}</span><small style="font-size:10px;line-height:1.05;">${html(title)}</small></div>`;
}
export type LearnShell2Part4 = {
  prototypeSetupSeed: typeof prototypeSetupSeed;
  prototypeKidsSeed: typeof prototypeKidsSeed;
  backendRecipeToPrototype: typeof backendRecipeToPrototype;
  seedFamilyPrototypeState: typeof seedFamilyPrototypeState;
  wireFamilyPrototypeBackend: typeof wireFamilyPrototypeBackend;
  renderTefaFormation: typeof renderTefaFormation;
  renderFormation: typeof renderFormation;
  bookCover: typeof bookCover;
};

function learnMealSlotValue(meal: LearnShellNode, slot: string) {
  if (slot === 'breakfast' || slot === 'lunch' || slot === 'dinner') return meal?.[slot];
  return undefined;
}
