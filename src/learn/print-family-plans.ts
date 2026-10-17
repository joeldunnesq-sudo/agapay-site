import type {
  LearnSetupSnapshot,
  PrintCenterInput,
  PrintTemplate,
  PrintFamilyDay,
  PrintChild,
  PrintChore,
  PrintGrocery,
  DesignedForm,
} from './print-documents-composition-contracts.js';

import 'pdf-lib';

import './gpa.js';
import { DAYS, FORM_ORDER, WEEKDAYS_LONG } from './print-documents-shared.js';
import {
  text,
  childFormLabel,
  childForTemplate,
  tableSection,
  listSection,
  cardsSection,
  baseDocument,
} from './print-documents-shared.js';
import { buildTermPlan, buildMonthCalendar, buildChildWeekly, buildChildTerm } from './print-document-builders.js';

// Match Boolean filtering while exposing its non-null result to TypeScript.
function truthyPrintFamily<T>(value: T | null | undefined | false): value is NonNullable<T> {
  return Boolean(value);
}

export function choresByAssignee(chores: PrintChore[] = [], children: PrintChild[] = []) {
  const people = [
    { name: 'Everyone', color: '#102a4c' },
    ...children
      .filter((c) => c.firstName || c.name)
      .map((c) => ({ name: c.firstName || c.name, color: c.color || '#34507a' })),
  ];
  const map = new Map(people.map((p) => [p.name, { ...p, byDay: new Map<string, PrintChore[]>() }]));
  chores.forEach((chore) => {
    const assignee = chore.assignee || 'Everyone';
    if (!map.has(assignee)) map.set(assignee, { name: assignee, color: '#34507a', byDay: new Map() });
    const day = chore.day || ''; // day is the full weekday name e.g. "Monday"
    const key = day || 'Any Day';
    const bucket = map.get(assignee)!.byDay;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key)!.push(chore);
  });
  return Array.from(map.values()).filter((p) => p.byDay.size > 0 || p.name === 'Everyone');
}
export function buildChorePlanWeek(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const chores = printCenter.familyPlanning?.chores || [];
  const children = printCenter.children || [];
  const childId = template.childId || '';

  if (childId) {
    // Child-specific weekly chore chart
    const child = children.find((c) => c.id === childId) || {};
    const name = child.firstName || child.name || 'Child';
    const myChores = chores.filter(
      (c) => (c.assignee || 'Everyone') === name || (c.assignee || 'Everyone') === 'Everyone'
    );
    doc.title = text(`${name}'s Weekly Chores`);
    doc.footerRole = doc.title;
    doc.subtitle = text(`${printCenter.household?.name || 'Household'} · ${printCenter.week?.label || 'Current Week'}`);
    doc.sections = [
      cardsSection('Student', [
        { label: 'Name', value: name, detail: childFormLabel(child) },
        { label: 'Week', value: printCenter.week?.label || '—', detail: printCenter.term?.label || '' },
        {
          label: 'Chores',
          value: String(myChores.length),
          detail: `${myChores.filter((c) => c.completed).length} completed`,
        },
      ]),
      tableSection(
        'Chore Rotation',
        ['Chore', 'Day', 'Time', 'Notes'],
        myChores.map((c) => [c.title, c.day || 'Any Day', c.timeOfDay || 'Anytime', c.notes || '']),
        { flex: [3, 1.5, 1.5, 3] }
      ),
      {
        type: 'checkboxes' as const,
        heading: 'Weekly Checkoff',
        subjects: myChores.map((c) => text(c.title)).filter(truthyPrintFamily),
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      },
    ].filter(truthyPrintFamily);
    return doc;
  }

  // Household weekly chore chart — grouped by person, day columns
  const assigneeGroups = choresByAssignee(chores, children);
  const rows = assigneeGroups.flatMap((person) =>
    WEEKDAYS_LONG.map((day) => {
      const dayChores = (person.byDay.get(day) || []).concat(person.byDay.get('Any Day') || []);
      return [
        person.name,
        day,
        dayChores.map((c) => c.title).join('; ') || '—',
        dayChores
          .map((c) => c.timeOfDay || '')
          .filter(truthyPrintFamily)
          .join('; '),
      ];
    }).filter((row) => row[2] !== '—')
  );

  doc.sections = [
    cardsSection('Chore Summary', [
      { label: 'Week', value: printCenter.week?.label || 'Current Week', detail: printCenter.term?.label || '' },
      { label: 'Total Chores', value: String(chores.length), detail: 'Across all assignees' },
      {
        label: 'Assigned',
        value: String(new Set(chores.map((c) => c.assignee || 'Everyone')).size),
        detail: 'People with chores',
      },
    ]),
    rows.length
      ? tableSection('Weekly Chore Rotation', ['Person', 'Day', 'Chores', 'Time'], rows, { flex: [2, 1.5, 4, 1.5] })
      : listSection('Chores', ['No chores have been set up yet. Add chores in the Family Planner.']),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildChorePlanDay(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const chores = printCenter.familyPlanning?.chores || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayWeekday = WEEKDAYS_LONG[new Date(today + 'T12:00:00Z').getUTCDay()];
  const todayChores = chores.filter((c) => !c.day || c.day === todayWeekday || c.day === '');
  doc.title = 'Daily Chore Chart';
  doc.subtitle = text(`${printCenter.household?.name || 'Household'} · ${todayWeekday}`);
  doc.sections = [
    cardsSection('Today', [
      { label: 'Day', value: todayWeekday, detail: today },
      { label: 'Chores', value: String(todayChores.length), detail: 'Due today (including unscheduled)' },
    ]),
    tableSection(
      "Today's Chores",
      ['Chore', 'Assigned To', 'Time', 'Notes'],
      todayChores.length
        ? todayChores.map((c) => [c.title, c.assignee || 'Everyone', c.timeOfDay || 'Anytime', c.notes || ''])
        : [['No chores set for today.', '', '', '']],
      { flex: [3, 2, 1.5, 2.5] }
    ),
    {
      type: 'checkboxes' as const,
      heading: 'Checkoff',
      subjects: todayChores.map((c) => `${text(c.title)} (${c.assignee || 'Everyone'})`).filter(truthyPrintFamily),
      days: ['Done'],
    },
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildChorePlanMonth(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const chores = printCenter.familyPlanning?.chores || [];
  const byDay = new Map<string, PrintChore[]>();
  chores.forEach((c) => {
    const key = c.day || 'Any Day';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(c);
  });
  const rows = [...WEEKDAYS_LONG, 'Any Day']
    .filter((d) => byDay.has(d))
    .flatMap((day) =>
      byDay.get(day)!.map((c) => [day, c.title, c.assignee || 'Everyone', c.timeOfDay || 'Anytime', c.notes || ''])
    );
  doc.title = 'Monthly Chore Chart';
  doc.subtitle = text(
    `${printCenter.household?.name || 'Household'} · ${printCenter.month?.label || printCenter.term?.label || 'Current Month'}`
  );
  doc.sections = [
    cardsSection('Chore Overview', [
      { label: 'Month', value: printCenter.month?.label || 'Current', detail: 'Recurring chore rotation' },
      {
        label: 'Chores',
        value: String(chores.length),
        detail: `${new Set(chores.map((c) => c.assignee || 'Everyone')).size} people assigned`,
      },
    ]),
    rows.length
      ? tableSection('Chore Rotation', ['Day', 'Chore', 'Assigned To', 'Time', 'Notes'], rows, {
          flex: [1.5, 3, 2, 1.5, 2],
        })
      : listSection('Chores', ['No chores have been set up yet. Add chores in the Family Planner.']),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildMealPlanWeek(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const meals = printCenter.familyPlanning?.meals || [];
  const days: PrintFamilyDay[] =
    printCenter.week?.familyDays || printCenter.week?.dates?.map((d) => ({ civilDate: d })) || [];
  const mealByDate = new Map(meals.map((m) => [m.date, m]));
  const rows = days
    .map((day) => {
      const m: Partial<LearnSetupSnapshot['familyPlanning']['meals'][number]> =
        mealByDate.get(day.civilDate as string) || {};
      const fasting = day.isFastDay ? day.fastingType || day.fastingRule || 'Fast' : '';
      return [
        text(day.weekdayLabel || day.civilDate || ''),
        text(day.feastTitle || ''),
        fasting,
        text(m.breakfast || m.lunch || ''),
        text(m.dinner || ''),
      ];
    })
    .filter((row) => row[0]);
  doc.sections = [
    cardsSection('Week Summary', [
      { label: 'Week', value: printCenter.week?.label || 'Current Week', detail: printCenter.term?.label || '' },
      {
        label: 'Fast Days',
        value: String(days.filter((d) => d.isFastDay).length),
        detail: 'Days with fasting guidance',
      },
      { label: 'Calendar', value: printCenter.calendarToggle?.label || 'Orthodox Calendar', detail: '' },
    ]),
    tableSection('Weekly Meals', ['Day', 'Feast/Fast', 'Fasting Rule', 'Lunch', 'Dinner'], rows, {
      flex: [1.5, 2.5, 2, 2.5, 2.5],
    }),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildMealPlanMonth(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const meals = printCenter.familyPlanning?.meals || [];
  const mealByDate = new Map(meals.map((m) => [m.date, m]));
  const days = (printCenter.month?.days || []).filter((d) => d?.inMonth);
  const rows = days
    .map((day) => {
      const m: Partial<LearnSetupSnapshot['familyPlanning']['meals'][number]> =
        mealByDate.get(day.civilDate as string) || {};
      return [
        String(day.dayNumber || ''),
        text(day.feastTitle || ''),
        day.isFastDay ? text(day.fastingType || day.fastingRule || 'Fast') : '',
        text(m.breakfast || m.lunch || ''),
        text(m.dinner || ''),
      ];
    })
    .filter((row) => row[0]);
  doc.title = text(printCenter.month?.label ? `${printCenter.month.label} Meal Plan` : 'Monthly Meal Plan');
  doc.subtitle = text(
    `${printCenter.household?.name || 'Household'} · ${printCenter.calendarToggle?.label || 'Orthodox Calendar'}`
  );
  doc.sections = [
    cardsSection('Month Summary', [
      { label: 'Month', value: printCenter.month?.label || 'Current', detail: 'Meals beside the Orthodox calendar' },
      { label: 'Fast Days', value: String(printCenter.month?.fastDays || 0), detail: 'Days with fasting guidance' },
      { label: 'Feast Days', value: String(printCenter.month?.feastDays || 0), detail: 'Major liturgical markers' },
    ]),
    tableSection('Monthly Meals', ['Date', 'Feast', 'Fasting', 'Lunch/Breakfast', 'Dinner'], rows, {
      flex: [0.8, 2.5, 2, 2.5, 2.5],
    }),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildEventsPlanMonth(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const events = printCenter.familyPlanning?.events || [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the original input read during the runtime migration.
  const nameDays = printCenter.familyPlanning?.nameDays || [];
  const eventsByDate = new Map<string | undefined, LearnSetupSnapshot['familyPlanning']['events']>();
  events.forEach((e) => {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
    eventsByDate.get(e.date)!.push(e);
  });
  const days = (printCenter.month?.days || []).filter((d) => d?.inMonth);
  const rows = days
    .filter((day) => eventsByDate.has(day.civilDate) || day.nameDays?.length || day.isFastDay || day.feastTitle)
    .map((day) => {
      const dayEvents = eventsByDate.get(day.civilDate) || [];
      const feast = text(day.feastTitle || '');
      const fasting = day.isFastDay ? text(day.fastingType || 'Fast') : '';
      const evtStr = dayEvents.map((e) => `${e.startTime ? e.startTime + ' ' : ''}${e.title}`).join('; ');
      return [String(day.dayNumber || ''), text(day.weekdayLabel || ''), feast, fasting, text(evtStr)];
    });
  doc.title = text(printCenter.month?.label ? `${printCenter.month.label} Events` : 'Monthly Events Chart');
  doc.subtitle = text(
    `${printCenter.household?.name || 'Household'} · ${printCenter.calendarToggle?.label || 'Orthodox Calendar'}`
  );
  doc.sections = [
    cardsSection('Month Overview', [
      {
        label: 'Month',
        value: printCenter.month?.label || 'Current',
        detail: 'Appointments, feast days, and family events',
      },
      { label: 'Events', value: String(events.length), detail: 'Household events and appointments' },
      { label: 'Fast Days', value: String(printCenter.month?.fastDays || 0), detail: 'Fasting days this month' },
    ]),
    rows.length
      ? tableSection('Month Events & Calendar', ['Date', 'Day', 'Feast', 'Fasting', 'Events'], rows, {
          flex: [0.8, 1.2, 2.5, 2, 4],
        })
      : listSection('Events', ['No events have been added yet. Add events in the Family Planner.']),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildRecipeCollection(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const recipes = printCenter.familyPlanning?.recipes || printCenter.week?.recipes || [];
  doc.title = 'Recipe Collection';
  doc.subtitle = text(`${printCenter.household?.name || 'Household'} · Fasting-Aware Family Recipes`);
  doc.sections = [
    cardsSection('Recipe Library', [
      { label: 'Recipes', value: String(recipes.length), detail: 'Saved family recipes' },
      {
        label: 'Fasting Fit',
        value: String(recipes.filter((r) => r.fastingType && r.fastingType !== 'free').length),
        detail: 'Fasting-compatible recipes',
      },
    ]),
    tableSection(
      'Recipes',
      ['Recipe', 'Fasting Fit', 'Category', 'Source'],
      recipes.map((r) => [r.title, r.fastingType || 'Any day', r.category || '', r.sourceUrl || '']),
      { flex: [4, 2, 2, 3] }
    ),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildGroceryListWeek(printCenter: PrintCenterInput, template: PrintTemplate, generatedAt: string) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const items = printCenter.familyPlanning?.groceryItems || printCenter.week?.groceryItems || [];
  doc.title = 'Weekly Grocery List';
  doc.subtitle = text(`${printCenter.household?.name || 'Household'} · ${printCenter.week?.label || 'Current Week'}`);
  const byCategory = new Map<string, PrintGrocery[]>();
  items.forEach((item) => {
    const cat = text(item.category || item.aisle || 'General');
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  });
  const rows = Array.from(byCategory.entries()).flatMap(([cat, catItems]) =>
    catItems.map((item) => [
      cat,
      text(item.name || item.title || ''),
      text(item.quantity || ''),
      text(item.notes || ''),
    ])
  );
  doc.sections = [
    cardsSection('List Summary', [
      { label: 'Week', value: printCenter.week?.label || 'Current Week', detail: printCenter.term?.label || '' },
      { label: 'Items', value: String(items.length), detail: `${byCategory.size} categories` },
    ]),
    rows.length
      ? tableSection('Grocery List', ['Category', 'Item', 'Qty', 'Notes'], rows, { flex: [2, 4, 1, 3] })
      : listSection('Items', ['No grocery items yet. Add items in the Family Planner.']),
  ].filter(truthyPrintFamily);
  return doc;
}
export function buildPlannerLessonWeekForm(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  const doc = baseDocument(printCenter, template, generatedAt);
  const week = printCenter.week || {};

  // Build the 7-slot day-header array from liturgical days, falling back to DAYS constants
  const litDays = week.liturgicalDays || [];
  const dates = week.dates || [];
  const dayHeaders = dates.map((date, i) => {
    const lit = litDays.find((d) => d.civilDate === date) || {};
    const weekday = lit.weekday || lit.weekdayLabel || DAYS[i] || '';
    const shortDate = date ? date.slice(5).replace('-', '/') : '';
    return { weekday, shortDate, date, isSunday: weekday === 'Sun' || weekday === 'Sunday' };
  });

  // ── Form groups from child rows ──────────────────────────────────────────
  const formGroups = new Map<string, DesignedForm>();
  (week.childRows || []).forEach((row) => {
    // Prefer the subject's formLabels array; fall back to child's form label
    const formLabel =
      (Array.isArray(row.formLabels) && row.formLabels.filter((l) => l && l !== '__family')[0]) ||
      childFormLabel(row.child) ||
      'Form';
    if (!formGroups.has(formLabel)) {
      formGroups.set(formLabel, {
        label: formLabel,
        days: dayHeaders.map((d) => ({ ...d, assignments: [] })),
        unassigned: [],
      });
    }
    const group = formGroups.get(formLabel)!;
    (row.minutes || []).forEach((mins, dayIndex) => {
      if (Number(mins || 0) > 0) {
        group.days[dayIndex].assignments!.push({
          id: row.id || row.title,
          title: row.title || 'Subject',
          sub: row.detail || '',
          note: `${Number(mins)}m`,
          formLabels: row.formLabels || [],
        });
      }
    });
  });

  // ── Family group from household rows ─────────────────────────────────────
  if ((week.householdRows || []).length) {
    const familyGroup: DesignedForm = {
      label: 'Family',
      days: dayHeaders.map((d) => ({ ...d, assignments: [] })),
      unassigned: [],
    };
    (week.householdRows || []).forEach((row) => {
      (row.minutes || []).forEach((mins, dayIndex) => {
        if (Number(mins || 0) > 0) {
          familyGroup.days[dayIndex].assignments!.push({
            id: row.id || row.title,
            title: row.title || 'Household',
            sub: row.detail || '',
            note: `${Number(mins)}m`,
            formLabels: [],
          });
        }
      });
    });
    // Insert Family first
    const existing = Array.from(formGroups.entries());
    formGroups.clear();
    formGroups.set('Family', familyGroup);
    existing.forEach(([k, v]) => formGroups.set(k, v));
  }

  // Sort form groups: Family first, then FORM_ORDER, then alpha
  const sortedForms = Array.from(formGroups.values()).sort((a, b) => {
    if (a.label === 'Family') return -1;
    if (b.label === 'Family') return 1;
    const ai = FORM_ORDER.indexOf(a.label);
    const bi = FORM_ORDER.indexOf(b.label);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.label.localeCompare(b.label);
  });

  doc.layout = 'designed-week-forms-landscape';
  doc.designedForms = sortedForms;
  doc.title = text(`${week.label || 'Current Week'} Lesson Plans`);
  doc.subtitle = text(`${printCenter.household?.name || 'Household'} · ${printCenter.term?.label || 'Current Term'}`);
  doc.footerRole = 'Planner — Lessons by Form';
  return doc;
}
export function buildPlannerLessonMonthForm(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  const doc = buildMonthCalendar(printCenter, template, generatedAt);
  doc.title = text(
    printCenter.month?.label ? `${printCenter.month.label} Lesson Plans` : 'Monthly Lesson Plans by Form'
  );
  return doc;
}
export function buildPlannerLessonTermForm(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  return buildTermPlan(printCenter, template, generatedAt);
}
export function buildPlannerLessonWeekChild(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  return buildChildWeekly(printCenter, template, generatedAt);
}
export function buildPlannerLessonMonthChild(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  const doc = buildMonthCalendar(printCenter, template, generatedAt);
  const child = childForTemplate(printCenter, template);
  const name = child?.firstName || 'Child';
  doc.title = text(`${name}'s Monthly Lessons`);
  doc.footerRole = doc.title;
  return doc;
}
export function buildPlannerLessonTermChild(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
) {
  return buildChildTerm(printCenter, template, generatedAt);
}
