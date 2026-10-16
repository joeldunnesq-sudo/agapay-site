import type { PDFDocument, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import type { SeedLearnRepository } from './repository.js';
import type { buildPlannerWeek, buildPlannerMonth } from './repository-planner.js';
import type { LearnRuntimeSeed, LearnRuntimeChild, LearnRuntimePlannerRow } from './setup-operation-contracts.js';
export interface PrintChild extends Partial<LearnRuntimeChild> {
  name?: string;
  form?: string;
  color?: string;
  summary?: string;
  [key: string]: unknown;
}
export type PrintFamily = Partial<LearnSetupSnapshot['familyPlanning']> & {
  chores?: PrintChore[];
  groceryItems?: PrintGrocery[];
};
export type PrintChore = LearnSetupSnapshot['familyPlanning']['chores'][number] & { timeOfDay?: string };
export type PrintGrocery = LearnSetupSnapshot['familyPlanning']['groceryItems'][number] & {
  aisle?: string;
  title?: string;
  notes?: string;
};
export interface PrintWeek {
  label?: string;
  termLabel?: string;
  dates?: string[];
  householdRows?: PrintPlannerRow[];
  childRows?: PrintPlannerRow[];
  liturgicalDays?: PrintDay[];
  familyDays?: PrintFamilyDay[];
  groceryItems?: PrintGrocery[];
  events?: LearnSetupSnapshot['familyPlanning']['events'];
  recipes?: LearnSetupSnapshot['familyPlanning']['recipes'];
  [key: string]: unknown;
}
export type PrintFamilyDay = Partial<ReturnType<typeof buildPlannerWeek>['familyDays'][number]> & Partial<PrintDay>;
export interface PrintCenterInput {
  household?: Partial<LearnRuntimeSeed['household']>;
  children?: PrintChild[];
  templates: PrintTemplate[];
  week?: PrintWeek;
  month?: { label?: string; printableTitle?: string; fastDays?: number; feastDays?: number; days?: PrintDay[] };
  term?: Partial<LearnRuntimeSeed['term']> & { week?: string };
  calendarToggle?: { label?: string; active?: string; description?: string };
  familyPlanning?: PrintFamily;
  termSetup?: {
    activeTermId?: string;
    setupCards?: PrintCard[];
    termOptions?: { id: string; label: string; startDate?: string; endDate?: string }[];
    pacingRows?: unknown[];
  };
}

export type PrintReportsInput = Omit<
  Partial<ReturnType<SeedLearnRepository['getReports']>>,
  'children' | 'reportCards' | 'transcripts' | 'narrationLogs'
> & {
  children?: PrintChild[];
  reportCards?: PrintReport[];
  transcripts?: PrintReport[];
  narrationLogs?: {
    date?: string;
    child?: PrintChild;
    childName?: string;
    childId?: string;
    source?: string;
    narrationType?: string;
    type?: string;
    note?: string;
  }[];
};
export interface PrintReport {
  child?: PrintChild;
  childId?: string;
  gradeSpan?: unknown;
  credits?: unknown;
  status?: string;
  summary?: unknown;
  records?: { subject?: string; mark?: unknown; evaluationModel?: unknown; narrativeSummary?: string }[];
}

export interface PrintTemplate {
  id?: string;
  title?: string;
  templateType?: string;
  childId?: string;
  termId?: string;
  month?: string;
  year?: string;
  child?: PrintChild | null;
}
export interface PrintOptions {
  templateId?: string;
  childId?: string;
  termId?: string;
  month?: string;
  year?: string;
  generatedAt?: string;
  label?: string;
  designedWeek?: DesignedWeek | null;
}
export interface DesignedAssignment {
  id?: string;
  [key: string]: unknown;
  title?: string;
  sub?: string;
  note?: string;
  color?: string;
  kind?: string;
  formLabels?: string[];
}
export interface DesignedDay {
  [key: string]: unknown;
  date?: string;
  weekday?: string | number;
  shortDate?: string;
  feast?: string;
  isSunday?: boolean;
  assignments?: DesignedAssignment[];
}
export interface DesignedWeek {
  label?: string;
  termLabel?: string;
  forms?: string[];
  days?: DesignedDay[];
  unassigned?: DesignedAssignment[];
}
export interface DesignedForm {
  [key: string]: unknown;
  label: string;
  days: DesignedDay[];
  unassigned?: DesignedAssignment[];
}
export interface PrintCard {
  [key: string]: unknown;
  label?: unknown;
  value?: unknown;
  detail?: unknown;
  title?: unknown;
  note?: unknown;
}
export type PrintDay = Omit<Partial<ReturnType<typeof buildPlannerMonth>['days'][number]>, 'weekday'> & {
  weekday?: string | number;
  date?: string;
  title?: string;
  rank?: string;
  feastMarker?: string;
  shortDate?: string;
  feast?: string;
  assignments?: DesignedAssignment[];
};
export type PrintSection = { heading?: string } & (
  | { type: 'table'; columns: string[]; flex?: number[] | null; rows: unknown[][] }
  | { type: 'cards'; items: PrintCard[] }
  | { type: 'list'; items: PrintCard[] }
  | { type: 'liturgical'; days: PrintDay[] }
  | { type: 'calendar-grid'; days: PrintDay[] }
  | { type: 'checkboxes'; days: string[]; subjects: string[] }
  | { type: 'designed-week'; days: DesignedDay[] }
  | { type: 'notes'; lineCount: number }
);
export interface PrintDocument {
  title: string;
  subtitle: string;
  sections: PrintSection[];
  household?: string;
  generatedAt?: string;
  templateId?: string;
  layout?: string;
  designedForms?: DesignedForm[];
  footerRole?: string;
  footerNote?: string;
  [key: string]: unknown;
}
export interface WeeklyDocumentInput {
  household?: Partial<LearnRuntimeSeed['household']>;
  week?: PrintWeek;
  calendarToggle?: PrintCenterInput['calendarToggle'];
}
export interface PdfFonts {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  times: PDFFont;
  timesBold: PDFFont;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
}
export interface PdfState {
  pdf: PDFDocument;
  fonts: PdfFonts;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  currentSectionHeading?: string;
  markImage?: PDFImage | null;
  docTitle?: string;
  docSubtitle?: string;
}
export interface FormHeader {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}
export interface FormGrid {
  heading?: string;
  columns: string[];
  flex?: number[];
  rows: unknown[][];
  boldRowIndexes?: number[];
  emptyLabel?: string;
}
export interface FormBlock {
  title: string;
  fields: { label: string; value: unknown }[];
}
export interface CourseTable {
  heading: string;
  rows: unknown[][];
  totals: { credit: string; gp: string };
}
export interface AcademicCourse {
  id?: string;
  childId?: string;
  courseTitle?: string;
  subjectCategory?: string;
  gradeLevel?: unknown;
  creditHours?: unknown;
  grades?: { termIndex?: unknown; letterGrade?: string }[];
}
export interface AcademicPdfInput {
  household?: { name?: string; homeschoolName?: string; patronSaintName?: string };
  child?: { id?: string; firstName?: string; name?: string; gradeLabel?: string; gradeLevel?: number };
  academicYear?: { name?: string };
  courses?: AcademicCourse[];
  attendance?: {
    byChild?: { childId?: string; present?: number; absent?: number; excused?: number; instructionalDays?: number }[];
  } | null;
  testScores?: {
    childId?: string;
    testName?: string;
    testType?: string;
    testDate?: string;
    compositeScore?: unknown;
    englishScore?: unknown;
    mathScore?: unknown;
    readingScore?: unknown;
    scienceScore?: unknown;
    writingScore?: unknown;
    totalScore?: unknown;
    readingWritingScore?: unknown;
    date?: string;
    score?: unknown;
    notes?: string;
  }[];
  generatedAt?: string;
}
export type PrintTruthyFilter = <T>(value: T | null | undefined | false) => value is NonNullable<T>;
export type PrintPlannerRow = LearnRuntimePlannerRow & { child?: PrintChild };

import type { LearnSetupSnapshot } from './setup-persistence.js';
export interface LandscapeRow {
  title: string;
  sub: string;
  cells: string[][];
}
