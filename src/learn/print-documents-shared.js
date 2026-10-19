// Generated from src/learn/print-documents-shared.ts by npm run build:server. Do not edit.
import { StandardFonts, rgb } from 'pdf-lib';
import './gpa.js';
import {
  buildHouseholdWeekly,
  buildTermPlan,
  buildMonthCalendar,
  buildChildWeekly,
  buildChildTerm,
} from './print-document-builders.js';
import {
  buildChorePlanWeek,
  buildChorePlanDay,
  buildChorePlanMonth,
  buildMealPlanWeek,
  buildMealPlanMonth,
  buildEventsPlanMonth,
  buildRecipeCollection,
  buildGroceryListWeek,
  buildPlannerLessonWeekForm,
  buildPlannerLessonMonthForm,
  buildPlannerLessonTermForm,
  buildPlannerLessonWeekChild,
  buildPlannerLessonMonthChild,
  buildPlannerLessonTermChild,
} from './print-family-plans.js';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LETTER = [612, 792];
const LANDSCAPE = [792, 612];
const MARGIN = 46;
const FORM_ORDER = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];
const NAVY = rgb(0.02, 0.08, 0.15);
const NAVY_SOFT = rgb(0.06, 0.16, 0.24);
const GOLD = rgb(0.72, 0.55, 0.2);
const GOLD_SOFT = rgb(0.94, 0.86, 0.65);
const CREAM = rgb(0.98, 0.95, 0.88);
const PAPER = rgb(1, 0.99, 0.96);
const INK = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.36, 0.38, 0.42);
const LINE = rgb(0.83, 0.78, 0.68);
const BURGUNDY = rgb(0.55, 0.1, 0.12);
const FAST_BG = rgb(0.98, 0.92, 0.92);
const FEAST_BG = rgb(0.97, 0.94, 0.84);
const FONT_URLS = {
  cormorant: 'https://fonts.gstatic.com/s/cormorantgaramond/v22/co3YmX5slCNuHLi8bLeY9MK7whWMhyjYrEPjuw.ttf',
  cormorantBold: 'https://fonts.gstatic.com/s/cormorantgaramond/v22/co3bmX5slCNuHLi8bLeY9MK7whWMhyjQAllvuTWD.ttf',
  dmSans: 'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.ttf',
  dmSansBold: 'https://fonts.gstatic.com/s/dmsans/v15/rP2Cp2ywxg089UriASitCBimCyUsn3ux.ttf',
};
const fetchFont = fetchBytes;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CORE_SUBJECT_CATEGORIES = /* @__PURE__ */ new Set(['English', 'Math', 'Science', 'History']);
const GRADE_LEVEL_NAMES = { 9: 'Freshman Year', 10: 'Sophomore Year', 11: 'Junior Year', 12: 'Senior Year' };
const GRADE_PERCENT_RANGES = [
  ['A+', '97-100'],
  ['A', '93-96'],
  ['A-', '90-92'],
  ['B+', '87-89'],
  ['B', '83-86'],
  ['B-', '80-82'],
  ['C+', '77-79'],
  ['C', '73-76'],
  ['C-', '70-72'],
  ['D+', '67-69'],
  ['D', '63-66'],
  ['D-', '60-62'],
  ['F', '<60'],
];
async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.arrayBuffer();
}
async function embedFonts(pdf) {
  try {
    const [cormorantBytes, cormorantBoldBytes, dmSansBytes, dmSansBoldBytes] = await Promise.all([
      fetchFont(FONT_URLS.cormorant),
      fetchFont(FONT_URLS.cormorantBold),
      fetchFont(FONT_URLS.dmSans),
      fetchFont(FONT_URLS.dmSansBold),
    ]);
    return {
      serif: await pdf.embedFont(cormorantBytes),
      serifBold: await pdf.embedFont(cormorantBoldBytes),
      sans: await pdf.embedFont(dmSansBytes),
      sansBold: await pdf.embedFont(dmSansBoldBytes),
      // Aliases used in drawing helpers
      times: await pdf.embedFont(cormorantBytes),
      timesBold: await pdf.embedFont(cormorantBoldBytes),
      helvetica: await pdf.embedFont(dmSansBytes),
      helveticaBold: await pdf.embedFont(dmSansBoldBytes),
    };
  } catch {
    const times = await pdf.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return {
      serif: times,
      serifBold: timesBold,
      sans: helvetica,
      sansBold: helveticaBold,
      times,
      timesBold,
      helvetica,
      helveticaBold,
    };
  }
}
function text(value) {
  return String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
    .trim();
}
function sumMinutes(minutes = []) {
  return minutes.reduce((sum, m) => sum + Number(m || 0), 0);
}
function childFormLabel(child = {}) {
  if (child.formLabel || child.gradeLabel || child.form) return child.formLabel || child.gradeLabel || child.form;
  const years = Number(child.ageYears);
  if (!Number.isFinite(years)) return 'Household Form';
  if (years <= 5) return 'Little Ones';
  if (years <= 8) return 'Form I';
  if (years <= 11) return 'Form II';
  if (years <= 14) return 'Form III';
  if (years <= 16) return 'Form IV';
  return 'Form V';
}
function groupChildRowsByForm(childRows = []) {
  const groups = /* @__PURE__ */ new Map();
  childRows.forEach((row) => {
    const label = childFormLabel(row.child);
    if (!groups.has(label)) groups.set(label, { label, children: /* @__PURE__ */ new Set(), details: [], minutes: 0 });
    const g = groups.get(label);
    if (row.child?.firstName) g.children.add(row.child.firstName);
    if (row.title) g.details.push(row.detail ? `${row.title}: ${row.detail}` : row.title);
    g.minutes += sumMinutes(row.minutes);
  });
  return Array.from(groups.values());
}
function findTemplate(printCenter, templateId) {
  const requested = templateId === 'weekly-pack' ? 'print_mom_weekly' : templateId;
  return (
    printCenter.templates.find((t) => t.id === requested) ||
    printCenter.templates.find((t) => t.id === 'print_mom_weekly') ||
    printCenter.templates[0] || {
      id: 'print_mom_weekly',
      title: 'Weekly Household Plan',
      templateType: 'weekly-household-plan',
    }
  );
}
function templateWithParams(template, params = {}) {
  return {
    ...template,
    childId: params.childId || template.childId || '',
    termId: params.termId || template.termId || '',
    month: params.month || template.month || '',
    year: params.year || template.year || '',
  };
}
function childForTemplate(printCenter, template) {
  if (template.child) return template.child;
  return printCenter.children.find((c) => c.id === template.childId) || null;
}
function tableSection(heading, columns, rows, { flex } = {}) {
  return {
    type: 'table',
    heading,
    columns,
    flex: flex || null,
    rows: rows.filter((row) => row.some((cell) => text(cell))),
  };
}
function listSection(heading, items) {
  const mapped = items
    .map((item) => (typeof item === 'string' ? { label: item, detail: '' } : item))
    .filter((item) => text(item.label || item.detail));
  if (!mapped.length) return null;
  return { type: 'list', heading, items: mapped };
}
function cardsSection(heading, items) {
  const filtered = items.filter((item) => text(item.label || item.value || item.detail));
  if (!filtered.length) return null;
  return { type: 'cards', heading, items: filtered };
}
function liturgicalSection(heading, days) {
  const filtered = (days || []).filter((d) => d && (d.title || d.date));
  if (!filtered.length) return null;
  return { type: 'liturgical', heading, days: filtered };
}
function calendarGridSection(heading, days) {
  if (!days?.length) return null;
  return { type: 'calendar-grid', heading, days };
}
function momNotesSection(lineCount = 5) {
  return { type: 'notes', heading: 'Mom Notes', lineCount };
}
function baseDocument(printCenter, template, generatedAt) {
  const household = printCenter.household?.name || 'Household';
  const term = printCenter.term?.label || 'Current Term';
  const week = printCenter.week?.label || '';
  return {
    title: text(template.title || 'AGAPAY Learn Print Pack'),
    subtitle: text(`${household} · ${term}${week ? ' · ' + week : ''}`),
    footerRole: text(template.title || 'Household Plan'),
    household: text(household),
    generatedAt,
    templateId: template.id,
    sections: [],
    footerNote: `${household} · Generated by AGAPAY Learn`,
  };
}
function withMomNotes(doc) {
  if (doc && Array.isArray(doc.sections) && doc.layout !== 'designed-week-forms-landscape') {
    doc.sections.push(momNotesSection());
  }
  return doc;
}
function resolveLearnPrintDocument(printCenter, template, generatedAt) {
  const type = template.templateType || 'weekly-household-plan';
  if (type === 'term-plan' || template.id === 'print_mom_term')
    return buildTermPlan(printCenter, template, generatedAt);
  if (type === 'month-calendar' || template.id === 'print_mom_month')
    return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === 'liturgical-school-calendar' || template.id === 'print_mom_liturgical')
    return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === 'child-weekly-assignment') return buildChildWeekly(printCenter, template, generatedAt);
  if (type === 'child-term-plan') return buildChildTerm(printCenter, template, generatedAt);
  if (type === 'planner-chores-day') return buildChorePlanDay(printCenter, template, generatedAt);
  if (type === 'planner-chores-week') return buildChorePlanWeek(printCenter, template, generatedAt);
  if (type === 'planner-chores-month') return buildChorePlanMonth(printCenter, template, generatedAt);
  if (type === 'planner-chores-week-child') return buildChorePlanWeek(printCenter, template, generatedAt);
  if (type === 'planner-meals-week') return buildMealPlanWeek(printCenter, template, generatedAt);
  if (type === 'planner-meals-month') return buildMealPlanMonth(printCenter, template, generatedAt);
  if (type === 'planner-events-month') return buildEventsPlanMonth(printCenter, template, generatedAt);
  if (type === 'planner-recipes') return buildRecipeCollection(printCenter, template, generatedAt);
  if (type === 'planner-grocery-week') return buildGroceryListWeek(printCenter, template, generatedAt);
  if (type === 'planner-lesson-week-form') return buildPlannerLessonWeekForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-month-form') return buildPlannerLessonMonthForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-term-form') return buildPlannerLessonTermForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-week-child') return buildPlannerLessonWeekChild(printCenter, template, generatedAt);
  if (type === 'planner-lesson-month-child') return buildPlannerLessonMonthChild(printCenter, template, generatedAt);
  if (type === 'planner-lesson-term-child') return buildPlannerLessonTermChild(printCenter, template, generatedAt);
  return buildHouseholdWeekly(printCenter, template, generatedAt);
}
function newPdfState(pdf, fonts) {
  let currentPage;
  return {
    pdf,
    fonts,
    pages: [],
    y: 0,
    get page() {
      if (!currentPage) throw new Error('Create a PDF page before drawing.');
      return currentPage;
    },
    set page(page) {
      currentPage = page;
    },
  };
}
export {
  BURGUNDY,
  CORE_SUBJECT_CATEGORIES,
  CREAM,
  DAYS,
  FAST_BG,
  FEAST_BG,
  FONT_URLS,
  FORM_ORDER,
  GOLD,
  GOLD_SOFT,
  GRADE_LEVEL_NAMES,
  GRADE_PERCENT_RANGES,
  INK,
  LANDSCAPE,
  LETTER,
  LINE,
  MARGIN,
  MUTED,
  NAVY,
  NAVY_SOFT,
  PAPER,
  WEEKDAYS_LONG,
  baseDocument,
  calendarGridSection,
  cardsSection,
  childForTemplate,
  childFormLabel,
  embedFonts,
  fetchBytes,
  fetchFont,
  findTemplate,
  groupChildRowsByForm,
  listSection,
  liturgicalSection,
  momNotesSection,
  newPdfState,
  resolveLearnPrintDocument,
  sumMinutes,
  tableSection,
  templateWithParams,
  text,
  withMomNotes,
};
