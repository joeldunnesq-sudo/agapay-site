import type {
  LearnChildSheetGroup,
  LearnFamilySetupContext,
  LearnTruthyFilter,
  LearnShellNode,
  LearnShellPayload,
  LearnSetupVm,
  LearnPrintVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const collapsibleSetupPanel: LearnShellBindings['collapsibleSetupPanel'];
declare const churchRhythmSetupPanel: LearnShellBindings['churchRhythmSetupPanel'];
declare const formationSetupPanel: LearnShellBindings['formationSetupPanel'];
declare const formSubjectsSetupPanel: LearnShellBindings['formSubjectsSetupPanel'];
declare const homeschoolMethodOptions: LearnShellBindings['homeschoolMethodOptions'];
declare const setupWeekdays: LearnShellBindings['setupWeekdays'];
declare const isLearnFamilyPlan: LearnShellBindings['isLearnFamilyPlan'];
declare const shell: LearnShellBindings['shell'];
declare const printCount: LearnShellBindings['printCount'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare let learnGoogleCalendarStatus: LearnShellBindings['learnGoogleCalendarStatus'];
declare const isOdysseyLearnContext: LearnShellBindings['isOdysseyLearnContext'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const panel: LearnShellBindings['panel'];
declare const setupInput: LearnShellBindings['setupInput'];
declare const setupSelect: LearnShellBindings['setupSelect'];
declare const setupTermOptions: LearnShellBindings['setupTermOptions'];
declare const missedLessonOptions: LearnShellBindings['missedLessonOptions'];
declare const childSetupRow: LearnShellBindings['childSetupRow'];
declare const termSetupRow: LearnShellBindings['termSetupRow'];
declare const nextSevenDates: LearnShellBindings['nextSevenDates'];
declare const familyEventSetupRow: LearnShellBindings['familyEventSetupRow'];
declare const recipeSetupRow: LearnShellBindings['recipeSetupRow'];
declare const grocerySetupRow: LearnShellBindings['grocerySetupRow'];

function setupExperience(method: string = 'Unsure', groupingMode: string = 'forms') {
  const groupName = groupingMode === 'grades' ? 'Grade-Level' : 'Form';
  const profiles = {
    'Charlotte Mason': {
      order: ['church', 'enrichment', 'subjects'],
      subjectTitle: `${groupName} Subjects`,
      note: "Living books, short lessons, narration, and generous enrichment are arranged around the household's Church rhythm.",
    },
    'Orthodox Classical': {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Classical Studies by Grade' : 'Classical Studies by Form',
      note: 'Church rhythm leads into ordered language, humanities, mathematics, and science, followed by enrichment.',
    },
    Traditional: {
      order: ['subjects', 'church', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Grade-Level Subjects' : 'Grouped Subjects',
      note: 'Familiar grade-level subjects come first, with Church rhythm and enrichment kept clear and easy to schedule.',
    },
    Eclectic: {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Flexible Subjects by Grade' : 'Flexible Subjects by Form',
      note: 'A flexible structure keeps core subjects, shared family work, and enrichment easy to mix without forcing one method.',
    },
    Unsure: {
      order: ['church', 'subjects', 'enrichment'],
      subjectTitle: groupingMode === 'grades' ? 'Core Subjects by Grade' : 'Core Subjects by Form',
      note: 'A balanced starting point keeps the essentials visible now and leaves room to refine your method later.',
    },
  };
  return (
    (profiles as unknown as Record<string, (typeof profiles)[keyof typeof profiles] | undefined>)[method] ||
    profiles.Unsure
  );
}

function mealSetupRow(meal: LearnShellNode = {}, date: string = '') {
  const resolvedDate = meal.date || date;
  const weekday = resolvedDate
    ? new Date(`${resolvedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })
    : 'Day';
  return `<div data-setup-row="meals" data-id="${html(meal.id || '')}" class="learn-meal-row"><div><strong>${html(weekday)}</strong><input type="date" name="date" value="${html(resolvedDate)}"></div>${setupInput('Breakfast', 'breakfast', meal.breakfast || '')}${setupInput('Lunch', 'lunch', meal.lunch || '')}${setupInput('Dinner', 'dinner', meal.dinner || '')}</div>`;
}

function familyPlanningSetupPanel(vm: LearnFamilySetupContext) {
  const planning = vm.familyPlanning || {};
  const household = vm.household || planning.household || {};
  const children = vm.children || planning.children || [];
  const dates = nextSevenDates(planning.weekStart);
  const mealByDate = new Map((planning.meals || []).map((meal) => [meal.date, meal]));
  return `<div class="learn-family-planning">
    <p class="learn-panel-intro">Keep the household calendar, meals, and practical life beside the school plan. Name days repeat annually; appointments and outings appear on their exact dates.</p>
    <div class="learn-family-adults">${setupInput("Mom's name", 'household.motherName', household.motherName || '')}${setupInput("Mom's name day", 'household.motherNameDay', household.motherNameDay || '', { type: 'date' })}${setupInput("Dad's name", 'household.fatherName', household.fatherName || '')}${setupInput("Dad's name day", 'household.fatherNameDay', household.fatherNameDay || '', { type: 'date' })}</div>
    <div class="learn-child-name-days">${children.map((child) => `<label data-family-child-id="${html(child.id)}"><span>${html(child.name)}'s name day</span><input type="date" name="childNameDay" value="${html(child.nameDay || '')}"></label>`).join('')}</div>
    <details id="learn-weekly-meals" open class="learn-planning-section"><summary><span>Weekly Meals</span><small>Plan one week at a time with fasting guidance from your selected Church calendar</small></summary>${setupSelect(
      'Fasting guidance',
      'familyPlanning.fastingPreference',
      planning.fastingPreference || 'guidance',
      [
        { value: 'guidance', label: 'Show guidance, let me decide' },
        { value: 'strict', label: 'Follow fasting guidance closely' },
        { value: 'off', label: 'Do not show meal guidance' },
      ]
    )}<input type="hidden" name="familyPlanning.weekStart" value="${html(dates[0])}"><div data-setup-list="meals" class="learn-meal-week">${dates.map((date) => mealSetupRow(mealByDate.get(date) || {}, date)).join('')}</div><p class="learn-planning-note">AGAPAY shows the fasting rule; it does not judge ingredients or replace guidance from your priest.</p></details>
    <details class="learn-planning-section"><summary><span>Family Calendar</span><small>Appointments, activities, field trips, and family events</small></summary><div data-setup-list="familyEvents" class="learn-planning-list">${(planning.events?.length ? planning.events : [{}]).map(familyEventSetupRow).join('')}</div><button type="button" data-setup-add-row="familyEvents" class="learn-add-button">Add Calendar Event</button></details>
    <details class="learn-planning-section"><summary><span>Recipes</span><small>Your household library, including fast-friendly favorites</small></summary><div data-setup-list="recipes" class="learn-planning-list">${(planning.recipes?.length ? planning.recipes : [{}]).map(recipeSetupRow).join('')}</div><button type="button" data-setup-add-row="recipes" class="learn-add-button">Add Recipe</button></details>
    <details class="learn-planning-section"><summary><span>Grocery List</span><small>A practical list generated and edited alongside the week</small></summary><div data-setup-list="groceryItems" class="learn-planning-list">${(planning.groceryItems?.length ? planning.groceryItems : [{}]).map(grocerySetupRow).join('')}</div><button type="button" data-setup-add-row="groceryItems" class="learn-add-button">Add Grocery Item</button></details>
  </div>`;
}

function renderSetup(vm: LearnSetupVm) {
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id || vm.terms?.[0]?.id || 'term_1';
  const groupingMode = vm.preferences.groupingMode === 'grades' ? 'grades' : 'forms';
  const experience = setupExperience(vm.household.method, groupingMode);
  const groupingTitle = groupingMode === 'grades' ? 'Children & Grades' : 'Children & Forms';
  const groupingCopy =
    groupingMode === 'grades'
      ? "Keep each child's familiar grade or level. Forms stay out of the way, and Planner and Print organize assignments by grade or individual child."
      : 'Assign each child a Form and color. Forms let siblings at similar stages share work without duplicating the plan.';
  const collapseDefault = Boolean(vm.setupCompleted);
  const productExperience = learnExperience();
  const rhythmSetupTitle = productExperience.tefaActive ? 'Optional Formation & Rhythm' : 'Church Rhythm';
  const rhythmSetupSummary = productExperience.tefaActive
    ? 'Optional household practices, readings, memory work, and calendar notes'
    : 'Daily prayers, readings, saints, feasts, and fasting rhythm';
  const adaptivePanels = {
    church: `<span id="learnSetupChurchRhythm" class="learn-setup-anchor"></span>${collapsibleSetupPanel('churchRhythm', rhythmSetupTitle, churchRhythmSetupPanel(vm), { icon: '☩', summary: rhythmSetupSummary, defaultCollapsed: collapseDefault })}`,
    enrichment: `<span id="learnSetupFormation" class="learn-setup-anchor"></span>${collapsibleSetupPanel('enrichment', 'Enrichment', formationSetupPanel(vm), { icon: '✥', summary: 'Shared books, recitation, music, art, and beauty subjects', defaultCollapsed: true })}`,
    subjects: `<span id="learnSetupSubjects" class="learn-setup-anchor"></span>${collapsibleSetupPanel('subjects', experience.subjectTitle, formSubjectsSetupPanel(vm, currentTermId), { icon: '✎', summary: 'Curriculum and recurring work by planning group', defaultCollapsed: true })}`,
  };
  const orthodoxHouseholdFields = productExperience.tefaActive
    ? ''
    : `${setupInput('Parish', 'household.parishName', vm.household.parish)}${setupInput('Parish patronal feast', 'household.parishPatronalFeastName', vm.household.parishPatronalFeastName || '')}${setupInput('Patronal feast date', 'household.parishPatronalFeastDate', vm.household.parishPatronalFeastDate || '', { type: 'date' })}${setupInput('Patron Saint of your homeschool', 'household.patronSaintName', vm.household.patronSaintName || '', { placeholder: 'e.g. St. Xenia of St. Petersburg' })}${setupInput('Patron Saint feast date', 'household.patronSaintFeastDate', vm.household.patronSaintFeastDate || '', { type: 'date' })}`;
  const orthodoxHouseholdNote = productExperience.tefaActive
    ? ''
    : `<p style="margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.4;">The patronal feast repeats annually on the Family Planner calendar so it can be honored alongside name days, fasts, and major feasts. If your homeschool has its own patron saint, that name day appears there too, and both names print on report cards and transcripts.</p>`;
  const calendarField = productExperience.tefaActive
    ? ''
    : setupSelect('Church calendar', 'preferences.calendarType', vm.preferences.calendarType, vm.calendarOptions);
  const householdContent = `<div class="learn-setup-method-note"><small>Organized for ${html(vm.household.method || 'your household')}</small><strong>${html(experience.note)}</strong></div><div class="learn-setup-household-grid">${setupInput('Household name', 'household.name', vm.household.name)}${setupInput('Parent name', 'household.parentName', vm.household.parentName)}${setupSelect('Method', 'household.primaryMethod', vm.household.method || 'Unsure', homeschoolMethodOptions)}${setupInput('Homeschool name', 'household.homeschoolName', vm.household.homeschoolName || '', { placeholder: productExperience.tefaActive ? 'e.g. Harper Family Homeschool' : 'e.g. St. Xenia Homeschool' })}${orthodoxHouseholdFields}${setupSelect(
    'Planning groups',
    'preferences.groupingMode',
    groupingMode,
    [
      { value: 'forms', label: 'Forms' },
      { value: 'grades', label: 'Traditional grades / levels' },
    ]
  )}${setupInput('School year', 'schoolYear.label', vm.schoolYear.label)}${setupInput('Year start', 'schoolYear.startDate', vm.schoolYear.startDate, { type: 'date' })}${setupInput('Year end', 'schoolYear.endDate', vm.schoolYear.endDate, { type: 'date' })}${setupSelect('Current term', 'schoolYear.currentTermId', currentTermId, setupTermOptions(vm.terms, vm.term))}${calendarField}${setupSelect('Evaluation', 'preferences.evaluationModel', vm.preferences.evaluationModel, vm.evaluationModels)}${`<details class="learn-day-picker"><summary><span>Default school days</span><strong data-day-summary>${html(
    setupWeekdays
      .filter((day) => (vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).includes(day.value))
      .map((day) => day.label)
      .join(' · ')
  )}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${(vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).includes(day.value) ? 'checked' : ''}>${day.label}</label>`).join('')}</div><input type="hidden" name="preferences.defaultSchoolDays" value="${html((vm.preferences.defaultSchoolDays || ['mon', 'tue', 'wed', 'thu', 'fri']).join(','))}"></details>`}${setupSelect('Default missed lesson', 'preferences.defaultMissedLessonBehavior', vm.preferences.defaultMissedLessonBehavior || 'next-occurrence', missedLessonOptions)}${setupInput('Default max minutes / child', 'preferences.defaultMaxDailyMinutes', vm.preferences.defaultMaxDailyMinutes || '240', { type: 'number' })}<input name="preferences.graceModeActive" type="hidden" value="${vm.preferences.graceModeActive ? 'true' : 'false'}" /><input name="preferences.graceModeDefault" type="hidden" value="${html(vm.preferences.graceModeDefault || 'light')}" /></div>${orthodoxHouseholdNote}`;
  const childrenContent = `<p style="margin:0 0 12px;color:var(--muted);">${html(groupingCopy)}</p><div data-setup-list="children" style="display:grid;gap:8px;">${(vm.children.length ? vm.children : [{}]).map((child) => childSetupRow(child, groupingMode)).join('')}</div><div class="learn-setup-add-actions"><button type="button" data-setup-add-row="children">Add one child</button>${isLearnFamilyPlan() ? `<button type="button" data-setup-add-children="3">Add 3 children</button>` : ''}</div>`;
  const termsContent = `<p style="margin:0 0 12px;color:var(--muted);line-height:1.45;">Term 4 / Summer is available for year-round homeschoolers. Assign subjects, books, and formation materials to the term where they belong.</p><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" data-setup-add-row="terms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Term</button></div><div data-setup-list="terms" style="display:grid;gap:10px;">${(vm.terms?.length ? vm.terms : [vm.term]).map((term, index) => termSetupRow(term, index)).join('')}</div>`;
  const body = `
    <form data-setup-form data-screen-label="Set Up" class="learn-stack">
      <span id="learnSetupHousehold" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel('household', 'Household', householdContent, { icon: '⌂', summary: 'Profile, method, school year, calendar, and defaults', defaultCollapsed: collapseDefault })}
      <span id="learnSetupChildren" class="learn-setup-anchor"></span>
      ${collapsibleSetupPanel('children', groupingTitle, childrenContent, { icon: '◎', summary: `${vm.children.length || 0} ${vm.children.length === 1 ? 'child' : 'children'} configured`, defaultCollapsed: collapseDefault })}
      ${collapsibleSetupPanel('terms', 'Terms', termsContent, { icon: '◷', summary: `${vm.terms?.length || 1} term${(vm.terms?.length || 1) === 1 ? '' : 's'} in this school year`, defaultCollapsed: collapseDefault })}
      ${experience.order.map((key: string) => (adaptivePanels as unknown as Record<string, (typeof adaptivePanels)[keyof typeof adaptivePanels] | undefined>)[key]).join('')}
      <div class="learn-setup-savebar">
        <span data-setup-status class="learn-muted">Setup saves to the household profile and D1-backed Learn records.</span>
        <button type="submit" style="border:none;background:var(--navy);color:#fff;border-radius:10px;padding:12px 20px;font-family:inherit;font-weight:700;">Save Setup</button>
      </div>
    </form>`;
  return shell(vm, body);
}

function renderPrintCenter(vm: LearnPrintVm) {
  const tefaActive = learnExperience().tefaActive;
  const householdTemplates = vm.templates.filter((t) => t.audience === 'mom' || t.audience === 'household');
  const childTemplates = vm.templates.filter((t) => t.audience === 'child');
  const freePlan = !isLearnFamilyPlan();
  const remaining = Math.max(0, vm.billing.printLimit - printCount());
  const nearLimit = freePlan && remaining <= 1;

  // ── Shared helpers ────────────────────────────────────────────────────────────
  const accessBadge = (isPrem: boolean) =>
    isPrem
      ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Family</span>`
      : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;">Free</span>`;

  // ── Row-style template item (for grouped lists) ───────────────────────────────
  const templateRow = (template: Partial<LearnPrintVm['templates'][number]>) => {
    const locked = template.premium && freePlan;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--line);${locked ? 'opacity:.72;' : ''}">
        <div style="flex:1;min-width:0;">
          <strong style="display:block;font-size:14px;color:var(--ink);">${html(template.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.35;">${html(template.description)}</small>
        </div>
        ${
          locked
            ? `<button type="button" data-print-upgrade
               style="flex:none;border:1px solid var(--gold);background:transparent;color:var(--gold);border-radius:8px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               🔒 Upgrade
             </button>`
            : `<button type="button" data-print-generate="${html(template.id)}"
               style="flex:none;border:none;background:var(--navy);color:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
               Print PDF
             </button>`
        }
      </div>`;
  };

  // ── Group household templates by purpose ──────────────────────────────────────
  const GROUPS = [
    {
      id: 'weekly',
      label: 'This Week',
      icon: '▦',
      desc: 'Household plan and the landscape lesson grid by Form for the current week.',
      premium: false,
      ids: ['print_mom_weekly', 'planner_lessons_week_form'],
    },
    {
      id: 'month',
      label: 'Month & Calendar',
      icon: '▣',
      desc: tefaActive
        ? 'Monthly household plans with school days and household events clearly marked.'
        : 'Monthly household plans with feast days and fast days clearly marked.',
      premium: false,
      ids: ['print_mom_month', 'planner_events_month'],
    },
    {
      id: 'lessons',
      label: 'Lesson Plans',
      icon: '☰',
      desc: 'Structured lesson grids by Form, term, or month.',
      premium: true,
      ids: ['planner_lessons_month_form', 'planner_lessons_term_form', 'print_mom_term', 'print_mom_liturgical'],
    },
    {
      id: 'kitchen',
      label: 'Meals, Recipes & Home',
      icon: '♨',
      desc: 'Meal plans, recipe collections, grocery lists, and chore charts for the household.',
      premium: true,
      ids: [
        'planner_meals_week',
        'planner_meals_month',
        'planner_recipes',
        'planner_grocery_week',
        'planner_chores_day',
        'planner_chores_week',
        'planner_chores_month',
      ],
    },
  ];

  const tmplById = new Map(householdTemplates.map((t) => [t.id, t]));
  const assignedIds = new Set(GROUPS.flatMap((g) => g.ids));
  const ungrouped = householdTemplates.filter((t) => !assignedIds.has(t.id));

  const groupSection = (group: (typeof GROUPS)[number]) => {
    const members = group.ids.map((id: string) => tmplById.get(id)).filter(Boolean as unknown as LearnTruthyFilter);
    if (group.id === 'kitchen') members.push(...ungrouped.filter((t) => t.premium));
    else if (group.id === 'weekly') members.push(...ungrouped.filter((t) => !t.premium));
    if (!members.length) return '';
    const groupLocked = group.premium && freePlan;
    return `
      <div style="background:var(--paper);border:1px solid ${groupLocked ? 'rgba(181,148,47,.3)' : 'var(--line)'};border-radius:12px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:13px 14px;background:${groupLocked ? 'linear-gradient(90deg,#fffaed,var(--paper))' : 'var(--paper2)'};border-bottom:1px solid var(--line);">
          <span style="font-size:16px;color:var(--gold);">${group.icon}</span>
          <div style="flex:1;min-width:0;">
            <strong style="font-size:15px;color:var(--ink);">${group.label}</strong>
            <small style="display:block;color:var(--muted);font-size:12px;">${group.desc}</small>
          </div>
          ${
            groupLocked
              ? `<span style="flex:none;border:1px solid var(--gold);background:#fbf2dd;color:var(--gold);border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Family Plan</span>`
              : `<span style="flex:none;border:1px solid #c2d9c4;background:#edf6ef;color:#365f3b;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Free</span>`
          }
        </div>
        ${members.map(templateRow).join('')}
      </div>`;
  };

  // ── Plan status bar ─────────────────────────────────────────────────────────
  const usedPct = freePlan ? Math.round(((vm.billing.printLimit - remaining) / vm.billing.printLimit) * 100) : 0;
  const statusBar = freePlan
    ? `<div style="margin-top:8px;height:5px;border-radius:99px;background:var(--line);overflow:hidden;">
         <div style="height:100%;width:${usedPct}%;background:${nearLimit ? 'var(--burgundy)' : 'var(--gold)'};border-radius:99px;transition:width .4s;"></div>
       </div>
       <small style="display:block;margin-top:5px;color:${nearLimit ? 'var(--burgundy)' : 'var(--muted)'};font-size:11px;">
         ${remaining} of ${vm.billing.printLimit} free prints remaining
       </small>`
    : '';

  // ── Plan banner ─────────────────────────────────────────────────────────────
  const planBanner = `
    <div style="border:1px solid ${nearLimit ? 'var(--burgundy)' : freePlan ? 'var(--line)' : 'rgba(181,148,47,.35)'};
      background:${freePlan ? 'var(--paper)' : 'linear-gradient(135deg,#fffdf5,#fdf5dc)'};
      border-radius:14px;padding:16px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <strong style="font-family:'Cormorant Garamond',serif;font-size:21px;color:var(--ink);">
          ${freePlan ? 'Free Plan' : '✦ Family Plan Active'}
        </strong>
        <span style="display:block;color:var(--muted);font-size:13px;margin-top:3px;line-height:1.45;">
          ${
            freePlan
              ? 'This Week and Month & Calendar packs are free. Lesson plans, meal plans, chore charts, recipes, and child sheets require the Family plan.'
              : 'All household plans, child sheets, lesson packs, meal plans, recipe collections, and planner prints are unlocked.'
          }
        </span>
        ${statusBar}
      </div>
      ${
        freePlan
          ? `<button type="button" data-print-upgrade
             style="flex:none;background:var(--navy);color:#fff;border:1px solid var(--gold);border-radius:10px;padding:11px 20px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
             Upgrade — Family Plan
           </button>`
          : `<span style="flex:none;color:var(--gold);font-size:13px;font-weight:700;padding-top:4px;">Unlocked ✦</span>`
      }
    </div>`;

  // ── Child sheet cards — one per child with dropdown ───────────────────────────
  const childrenMap = new Map<string, LearnChildSheetGroup>();
  childTemplates.forEach((t) => {
    const key = t.childId || t.child || t.id;
    if (!childrenMap.has(key))
      childrenMap.set(key, { name: t.child || 'Child', childId: t.childId, color: t.color, sheets: [] });
    childrenMap.get(key)!.sheets.push(t);
  });

  const childGroupCard = (group: LearnChildSheetGroup) => {
    const locked = freePlan;
    const initial = html((group.name || 'C').charAt(0).toUpperCase());
    const avatarBg = group.color || 'var(--slate)';
    const selectId = `child-sheet-sel-${html(group.childId || group.name)}`;
    const options = group.sheets
      .map((t: LearnPrintVm['templates'][number]) => `<option value="${html(t.id)}">${html(t.title)}</option>`)
      .join('');
    return `
      <article style="border:1px solid ${locked ? 'var(--gold)' : 'var(--line)'};border-radius:12px;background:${locked ? '#fffaed' : 'var(--paper)'};padding:14px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${avatarBg};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;">${initial}</span>
          <strong style="font-size:15px;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(group.name)}</strong>
          ${accessBadge(true)}
        </div>
        <select id="${selectId}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;font-family:inherit;font-size:13px;color:var(--ink);background:var(--paper2);cursor:${locked ? 'default' : 'pointer'};" ${locked ? 'disabled' : ''}>
          ${options}
        </select>
        <button type="button" data-child-print-group="${html(group.childId || group.name)}" data-child-select="${selectId}"
          style="border:1.5px solid ${locked ? 'var(--gold)' : 'var(--navy)'};background:${locked ? 'transparent' : 'var(--navy)'};color:${locked ? 'var(--gold)' : '#fff'};border-radius:9px;padding:10px 12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:center;">
          ${locked ? `<span style="margin-right:5px;font-size:11px;">🔒</span>Upgrade to unlock` : 'Generate PDF'}
        </button>
      </article>`;
  };

  const childGrid = childrenMap.size
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">${Array.from(childrenMap.values()).map(childGroupCard).join('')}</div>`
    : `<div style="padding:16px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:13px;line-height:1.5;">
         Child sheets appear here once children are added in Setup. Each child gets a weekly assignment sheet, term plan, and chore chart.
       </div>`;

  // ── Reports coming-soon section ─────────────────────────────────────────────
  const upcomingReports = [
    { label: 'Progress summaries', desc: 'Term and year snapshots by child, Form, and subject.' },
    { label: 'Report cards', desc: 'Narrative, complete/incomplete, percentage, and letter-grade formats.' },
    { label: 'Transcripts', desc: 'Course, credit, grade, and school-year records for older students.' },
    { label: 'State reporting exports', desc: 'Attendance, subject progress, and portfolio-ready summaries.' },
  ];

  const reportsSection = `
    <section id="reports" style="background:linear-gradient(135deg,var(--paper),var(--paper2));border:1px solid rgba(181,148,47,.35);border-radius:14px;padding:22px;display:grid;gap:18px;scroll-margin-top:110px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="color:var(--gold);font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;margin-bottom:6px;">Reports & Records</div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.05;margin:0 0 6px;color:var(--ink);">Beautiful records, built from work already done.</h2>
          <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.5;max-width:640px;">This workspace will turn saved lessons, narrations, subject progress, and term closures into polished homeschool records. Staged for a future release.</p>
        </div>
        <span style="flex:none;border:1px solid var(--gold);border-radius:999px;background:var(--navy);color:#fffaf0;padding:7px 14px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Coming Soon</span>
      </div>
      ${
        vm.reports?.stats?.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">${vm.reports.stats
              .map(
                (stat) => `
        <article style="border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.6);padding:14px;">
          <small style="display:block;color:var(--gold);font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;">${html(stat.label)}</small>
          <strong style="display:block;font-family:'Cormorant Garamond',serif;font-size:26px;margin-top:4px;color:var(--ink);">${html(stat.value)}</strong>
          <span style="display:block;color:var(--muted);font-size:12px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${html(stat.sub)}</span>
        </article>`
              )
              .join('')}</div>`
          : ''
      }
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${upcomingReports
          .map(
            (r) => `
          <article style="border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:14px;opacity:.78;">
            <strong style="display:block;color:var(--ink);margin-bottom:4px;">${r.label}</strong>
            <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.4;">${r.desc}</p>
          </article>`
          )
          .join('')}
      </div>
    </section>`;

  // ── Outputs reference ───────────────────────────────────────────────────────
  const outputsPanel = panel(
    'What You Can Print',
    `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Household</div>
        ${(vm.outputs?.household || vm.sampleOutputs?.mom || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>
      <div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Child</div>
        ${(vm.outputs?.child || vm.sampleOutputs?.child || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>
      ${
        (vm.outputs?.planner || vm.sampleOutputs?.planner || []).length
          ? `<div>
        <div style="color:var(--gold);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Planner</div>
        ${(vm.outputs?.planner || vm.sampleOutputs?.planner || []).map((item) => `<div style="padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink);">${html(item)}</div>`).join('')}
      </div>`
          : ''
      }
    </div>`,
    { icon: '✥' }
  );

  // ── Draft Job panel ─────────────────────────────────────────────────────────
  const draftJob = panel(
    'Weekly Family Plan',
    `
    <strong style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--ink);">${html(vm.job.status)}</strong>
    <div style="margin-top:8px;color:var(--muted);line-height:1.55;">
      ${html(vm.term.label)}<br>
      ${html(vm.term.week)}<br>
      ${vm.job.range ? html(vm.job.range) + ' · ' : ''}${html(vm.job.format)}
    </div>
    <button type="button" data-print-generate="weekly-pack"
      style="margin-top:14px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;">
      Generate Print Pack
    </button>
    ${
      !freePlan
        ? `<button type="button" data-print-generate="print_mom_month" data-print-month="${html(vm.term.monthKey)}"
      style="margin-top:8px;width:100%;background:transparent;color:var(--navy);border:1.5px solid var(--line);border-radius:10px;padding:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;">
      Month Calendar
    </button>`
        : ''
    }`,
    { icon: '✒' }
  );

  const body = `
    <section data-screen-label="Print Center" class="learn-stack">
      ${planBanner}
      <div style="display:grid;grid-template-columns:1fr 330px;gap:16px;align-items:start;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${GROUPS.map(groupSection).join('')}
        </div>
        ${draftJob}
      </div>
      ${panel('Child Sheets', childGrid, { icon: '◎' })}
      ${reportsSection}
      ${outputsPanel}
    </section>`;
  return shell(vm, body);
}

function redirectExpiredLearnSession() {
  if (window.MyAgapayShell?.redirectToLogin) {
    window.MyAgapayShell.redirectToLogin('session-expired');
    return;
  }
  localStorage.removeItem('agapayDonorToken');
  localStorage.removeItem('agapayDonorProfile');
  localStorage.removeItem('agapayDonorEmail');
  localStorage.removeItem('agapay.learn.plan');

  // Odyssey/TEFA sessions must never bounce to the general My AGAPAY login —
  // keep expired-session recovery inside the Odyssey namespace.
  const loginPath = isOdysseyLearnContext() ? '/learn/odyssey/dashboard/login' : '/myagapay/login';
  const loginUrl = new URL(loginPath, window.location.origin);
  loginUrl.searchParams.set('next', `${window.location.pathname}${window.location.search || ''}`);
  loginUrl.searchParams.set('reason', 'session-expired');
  window.location.replace(loginUrl.toString());
}

function waitForLearnSignIn(response: Response) {
  if (response.status !== 401) return null;
  redirectExpiredLearnSession();
  return new Promise<never>(() => {});
}

async function apiGet(path: string) {
  const response = await fetch(path, {
    headers: learnRequestHeaders(),
  });
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
  const payload = (await response.json().catch(() => ({}))) as LearnShellPayload;
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

async function apiPost(path: string, body: unknown) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: learnRequestHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach AGAPAY Learn. Please refresh, confirm you are still logged in, and try again.');
  }
  const signInRedirect = waitForLearnSignIn(response);
  if (signInRedirect) return signInRedirect;
  const payload = (await response.json().catch(() => ({}))) as LearnShellPayload;
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

async function syncLearnGoogleCalendar(extraEvents: LearnShellNode[] = [], statusEl: HTMLElement | null = null) {
  if (!learnGoogleCalendarStatus.configured || !learnGoogleCalendarStatus.connected) {
    if (statusEl)
      statusEl.textContent = `${statusEl.textContent} Google Calendar is not connected — connect it in Setup to sync.`;
    return null;
  }
  try {
    const calendar = storedLearnCalendar('');
    const pageParams = new URLSearchParams(window.location.search);
    // Pass the same date/term context the planner page is actually showing,
    // so the sync builds its event window around that week — not "today's"
    // week by default, which silently drops appointments/lessons outside it.
    const syncParams = {
      calendar,
      returnTo: window.location.pathname + window.location.search,
      date: pageParams.get('date') || '',
      termId: pageParams.get('termId') || '',
    };
    const result = await apiPost(learnApiUrl('/api/learn/google-calendar/sync', syncParams), { extraEvents });
    if (statusEl) {
      const count = Number(result?.syncedCount || 0);
      statusEl.textContent = count
        ? `${statusEl.textContent} Google Calendar synced ${count} item${count === 1 ? '' : 's'}.`
        : `${statusEl.textContent} Google Calendar is connected, but nothing matched this week to sync.`;
    }
    return result;
  } catch (error) {
    console.warn('Google Calendar sync skipped:', error);
    if (statusEl) statusEl.textContent = `${statusEl.textContent} Google Calendar sync needs attention.`;
    return null;
  }
}

function localIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function storedLearnCalendar(fallback: string = '') {
  try {
    return localStorage.getItem('agapay.learn.calendar') || fallback;
  } catch {
    return fallback;
  }
}

function learnApiUrl(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
}

function rowValue(row: HTMLElement, name: string) {
  const control = row.querySelector<HTMLElement>(`[name="${name}"]`);
  if (!control) return '';
  const controls = row.querySelectorAll<HTMLElement>(`[name="${name}"]`);
  if (controls.length > 1 && (control as HTMLInputElement | HTMLButtonElement).type === 'checkbox') {
    return [...controls]
      .filter((item) => (item as HTMLInputElement).checked)
      .map((item) => (item as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
      .join(', ');
  }
  if ((control as HTMLInputElement | HTMLButtonElement).type === 'checkbox')
    return (control as HTMLInputElement).checked;
  return (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value.trim();
}

function setupChildRowsFromForm(form: HTMLElement | null) {
  if (!form) return [];
  return [...form.querySelectorAll<HTMLElement>('[data-setup-row="children"]')]
    .map((row, index) => {
      const firstName = rowValue(row, 'firstName') as string;
      const id = row.dataset.id || `child_${index + 1}`;
      return {
        id,
        firstName,
        name: firstName || `Child ${index + 1}`,
        formLabel: rowValue(row, 'formLabel') as string,
        gradeLabel: rowValue(row, 'gradeLabel') as string,
      };
    })
    .filter((child) => child.firstName || child.formLabel || child.gradeLabel);
}
export type LearnShell2Part8 = {
  setupExperience: typeof setupExperience;
  mealSetupRow: typeof mealSetupRow;
  familyPlanningSetupPanel: typeof familyPlanningSetupPanel;
  renderSetup: typeof renderSetup;
  renderPrintCenter: typeof renderPrintCenter;
  redirectExpiredLearnSession: typeof redirectExpiredLearnSession;
  waitForLearnSignIn: typeof waitForLearnSignIn;
  apiGet: typeof apiGet;
  apiPost: typeof apiPost;
  syncLearnGoogleCalendar: typeof syncLearnGoogleCalendar;
  localIsoDate: typeof localIsoDate;
  storedLearnCalendar: typeof storedLearnCalendar;
  learnApiUrl: typeof learnApiUrl;
  rowValue: typeof rowValue;
  setupChildRowsFromForm: typeof setupChildRowsFromForm;
};
