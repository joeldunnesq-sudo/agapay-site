import type {
  PrintCenterInput,
  PrintTemplate,
  PrintOptions,
  PrintCard,
  PrintDay,
  PrintDocument,
  PrintPlannerRow,
  PrintChild,
} from './print-documents-composition-contracts.js';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const LETTER: [number, number] = [612, 792];
export const LANDSCAPE: [number, number] = [792, 612];
export const MARGIN = 46;
export const FORM_ORDER = ['Little Ones', 'Form I', 'Form II', 'Form III', 'Form IV'];
export const NAVY = rgb(0.02, 0.08, 0.15);
export const NAVY_SOFT = rgb(0.06, 0.16, 0.24);
export const GOLD = rgb(0.72, 0.55, 0.2);
export const GOLD_SOFT = rgb(0.94, 0.86, 0.65);
export const CREAM = rgb(0.98, 0.95, 0.88);
export const PAPER = rgb(1.0, 0.99, 0.96);
export const INK = rgb(0.08, 0.1, 0.14);
export const MUTED = rgb(0.36, 0.38, 0.42);
export const LINE = rgb(0.83, 0.78, 0.68);
export const BURGUNDY = rgb(0.55, 0.1, 0.12);
export const FAST_BG = rgb(0.98, 0.92, 0.92);
export const FEAST_BG = rgb(0.97, 0.94, 0.84);
export const FONT_URLS = {
  cormorant: 'https://fonts.gstatic.com/s/cormorantgaramond/v22/co3YmX5slCNuHLi8bLeY9MK7whWMhyjYrEPjuw.ttf',
  cormorantBold: 'https://fonts.gstatic.com/s/cormorantgaramond/v22/co3bmX5slCNuHLi8bLeY9MK7whWMhyjQAllvuTWD.ttf',
  dmSans: 'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZa4ET-DNl0.ttf',
  dmSansBold: 'https://fonts.gstatic.com/s/dmsans/v15/rP2Cp2ywxg089UriASitCBimCyUsn3ux.ttf',
};
export const fetchFont = fetchBytes;
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const CORE_SUBJECT_CATEGORIES = new Set(['English', 'Math', 'Science', 'History']);
export const GRADE_LEVEL_NAMES = { 9: 'Freshman Year', 10: 'Sophomore Year', 11: 'Junior Year', 12: 'Senior Year' };
export const GRADE_PERCENT_RANGES = [
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
export async function fetchBytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.arrayBuffer();
}
export async function embedFonts(pdf: PDFDocument) {
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
    // Graceful fallback to standard PDF fonts
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
export function text(value: unknown, ignoredFallback?: unknown): string;
export function text(value: unknown) {
  return String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
    .trim();
}
export function sumMinutes(minutes: unknown[] = []) {
  return minutes.reduce<number>((sum, m) => sum + Number(m || 0), 0);
}
export function childFormLabel(child: PrintChild = {}): string {
  if (child.formLabel || child.gradeLabel || child.form)
    return (child.formLabel || child.gradeLabel || child.form) as string;
  const years = Number(child.ageYears);
  if (!Number.isFinite(years)) return 'Household Form';
  if (years <= 5) return 'Little Ones';
  if (years <= 8) return 'Form I';
  if (years <= 11) return 'Form II';
  if (years <= 14) return 'Form III';
  if (years <= 16) return 'Form IV';
  return 'Form V';
}
export function groupChildRowsByForm(childRows: PrintPlannerRow[] = []) {
  const groups = new Map<string, { label: string; children: Set<string>; details: string[]; minutes: number }>();
  childRows.forEach((row) => {
    const label = childFormLabel(row.child);
    if (!groups.has(label)) groups.set(label, { label, children: new Set(), details: [], minutes: 0 });
    const g = groups.get(label)!;
    if (row.child?.firstName) g.children.add(row.child.firstName);
    if (row.title) g.details.push(row.detail ? `${row.title}: ${row.detail}` : row.title);
    g.minutes += sumMinutes(row.minutes);
  });
  return Array.from(groups.values());
}
export function findTemplate(printCenter: PrintCenterInput, templateId: string) {
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
export function templateWithParams(template: PrintTemplate, params: PrintOptions = {}) {
  return {
    ...template,
    childId: params.childId || template.childId || '',
    termId: params.termId || template.termId || '',
    month: params.month || template.month || '',
    year: params.year || template.year || '',
  };
}
export function childForTemplate(printCenter: PrintCenterInput, template: PrintTemplate) {
  if (template.child) return template.child;
  return printCenter.children!.find((c) => c.id === template.childId) || null;
}
export function tableSection(
  heading: string,
  columns: string[],
  rows: unknown[][],
  { flex }: { flex?: number[] } = {}
) {
  return {
    type: 'table' as const,
    heading,
    columns,
    flex: flex || null,
    rows: rows.filter((row) => row.some((cell) => text(cell))),
  };
}
export function listSection(heading: string, items: (string | PrintCard)[]) {
  const mapped = items
    .map((item) => (typeof item === 'string' ? { label: item, detail: '' } : item))
    .filter((item) => text(item.label || item.detail));
  if (!mapped.length) return null;
  return { type: 'list' as const, heading, items: mapped };
}
export function cardsSection(heading: string, items: PrintCard[]) {
  const filtered = items.filter((item) => text(item.label || item.value || item.detail));
  if (!filtered.length) return null;
  return { type: 'cards' as const, heading, items: filtered };
}
export function liturgicalSection(heading: string, days: PrintDay[]) {
  const filtered = (days || []).filter((d) => d && (d.title || d.date));
  if (!filtered.length) return null;
  return { type: 'liturgical' as const, heading, days: filtered };
}
export function calendarGridSection(heading: string, days: PrintDay[]) {
  if (!days?.length) return null;
  return { type: 'calendar-grid' as const, heading, days };
}
export function momNotesSection(lineCount: number = 5) {
  return { type: 'notes' as const, heading: 'Mom Notes', lineCount };
}
export function baseDocument(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
): PrintDocument {
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
export function withMomNotes(doc: PrintDocument): PrintDocument {
  if (doc && Array.isArray(doc.sections) && doc.layout !== 'designed-week-forms-landscape') {
    doc.sections.push(momNotesSection());
  }
  return doc;
}
export function resolveLearnPrintDocument(
  printCenter: PrintCenterInput,
  template: PrintTemplate,
  generatedAt: string
): PrintDocument {
  const type = template.templateType || 'weekly-household-plan';

  // ── Core Learn templates ──────────────────────────────────────────────────
  if (type === 'term-plan' || template.id === 'print_mom_term')
    return buildTermPlan(printCenter, template, generatedAt);
  if (type === 'month-calendar' || template.id === 'print_mom_month')
    return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === 'liturgical-school-calendar' || template.id === 'print_mom_liturgical')
    return buildMonthCalendar(printCenter, template, generatedAt);
  if (type === 'child-weekly-assignment') return buildChildWeekly(printCenter, template, generatedAt);
  if (type === 'child-term-plan') return buildChildTerm(printCenter, template, generatedAt);

  // ── Planner: Chores ───────────────────────────────────────────────────────
  if (type === 'planner-chores-day') return buildChorePlanDay(printCenter, template, generatedAt);
  if (type === 'planner-chores-week') return buildChorePlanWeek(printCenter, template, generatedAt);
  if (type === 'planner-chores-month') return buildChorePlanMonth(printCenter, template, generatedAt);
  if (type === 'planner-chores-week-child') return buildChorePlanWeek(printCenter, template, generatedAt);

  // ── Planner: Meals ────────────────────────────────────────────────────────
  if (type === 'planner-meals-week') return buildMealPlanWeek(printCenter, template, generatedAt);
  if (type === 'planner-meals-month') return buildMealPlanMonth(printCenter, template, generatedAt);

  // ── Planner: Events ───────────────────────────────────────────────────────
  if (type === 'planner-events-month') return buildEventsPlanMonth(printCenter, template, generatedAt);

  // ── Planner: Recipes & Grocery ────────────────────────────────────────────
  if (type === 'planner-recipes') return buildRecipeCollection(printCenter, template, generatedAt);
  if (type === 'planner-grocery-week') return buildGroceryListWeek(printCenter, template, generatedAt);

  // ── Planner: Lessons ──────────────────────────────────────────────────────
  if (type === 'planner-lesson-week-form') return buildPlannerLessonWeekForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-month-form') return buildPlannerLessonMonthForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-term-form') return buildPlannerLessonTermForm(printCenter, template, generatedAt);
  if (type === 'planner-lesson-week-child') return buildPlannerLessonWeekChild(printCenter, template, generatedAt);
  if (type === 'planner-lesson-month-child') return buildPlannerLessonMonthChild(printCenter, template, generatedAt);
  if (type === 'planner-lesson-term-child') return buildPlannerLessonTermChild(printCenter, template, generatedAt);

  // ── Default ───────────────────────────────────────────────────────────────
  return buildHouseholdWeekly(printCenter, template, generatedAt);
}
