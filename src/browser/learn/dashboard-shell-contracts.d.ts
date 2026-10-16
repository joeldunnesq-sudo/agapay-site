import type { LearnSimpleDraftShape } from './dashboard-shell.js';
import type * as VM from './dashboard-view-models.js';
import type { LearnViewEntity, LearnViewPayload } from './view-model-contracts.js';
export type LearnShellNode = Omit<LearnViewEntity, 'dayNumber' | 'meal' | 'ageYears'> & {
  method?: string;
  parish?: string;
  parentName?: string;
  time?: string;
  season?: string;
  desc?: string;
  starterWeek?: { enabled?: boolean; generatedAt?: string } | null;
  ageYears?: string | number;
  meal?: string | LearnShellNode | null;
  occurrenceDate?: string;
  feastTitle?: string;
  short?: string;
  long?: string;
  feast?: string;
  weekdayShort?: string;
  fastingRule?: string;
  fullDate?: string;
  personName?: string;
  dayNumber?: string | number;
  sub?: string;
  weekday?: string;
  shortDate?: string;
  startTime?: string;
  endTime?: string;
};
export type LearnDashboardVm = ReturnType<typeof VM.toDashboardViewModel>;
type LearnPlannerBase = ReturnType<typeof VM.toPlannerViewModel>;
export type LearnPlannerVm = Omit<LearnPlannerBase, 'week' | 'term' | 'familyPlanning'> & {
  preferences?: LearnShellNode;
  activeScope?: string;
  week: Omit<LearnPlannerBase['week'], 'days' | 'formRows'> & {
    termLabel?: string;
    days: (LearnPlannerBase['week']['days'][number] & { feastTitle?: string })[];
    formRows: (LearnPlannerBase['week']['formRows'][number] & {
      label?: string;
      blocks?: LearnShellNode[];
      title?: string;
    })[];
  };
  term: Omit<LearnPlannerBase['term'], 'summary' | 'pacingRows'> & {
    summary: LearnPlannerBase['term']['summary'] & { weeks?: number };
    pacingRows: (LearnPlannerBase['term']['pacingRows'][number] & {
      formLabel?: string;
      subjectTitle?: string;
      title?: string;
    })[];
  };
  familyPlanning: Omit<LearnPlannerBase['familyPlanning'], 'children'> & {
    children: (LearnPlannerBase['familyPlanning']['children'][number] & {
      firstName?: string;
      form?: string;
      grade?: string;
    })[];
  };
};
export type LearnFormationVm = ReturnType<typeof VM.toFormationViewModel>;
export type LearnBooksVm = ReturnType<typeof VM.toBooksViewModel>;
type LearnGradesBase = ReturnType<typeof VM.toGradesViewModel>;
type LearnGradeCourseBase = LearnGradesBase['courses'][number];
export type LearnGradeRecord = Omit<
  LearnGradeCourseBase['grades'][number],
  'numericScore' | 'attendanceDays' | 'id'
> & { id?: string; numericScore: string | number; attendanceDays: string | number };
export type LearnGradeCourse = Omit<LearnGradeCourseBase, 'gradeLevel' | 'creditHours' | 'grades' | 'childId'> & {
  childId?: string;
  gradeLevel: string | number;
  creditHours: string | number;
  grades: LearnGradeRecord[];
};
export type LearnGradesVm = Omit<LearnGradesBase, 'courses' | 'childCourses'> & {
  courses: LearnGradeCourse[];
  childCourses: LearnGradeCourse[];
  testScores?: LearnShellNode[];
};
export type LearnCoOpVm = ReturnType<typeof VM.toCoOpViewModel>;
export type LearnCommunityVm = ReturnType<typeof VM.toCommunityViewModel>;
type LearnSetupBase = ReturnType<typeof VM.toSetupViewModel>;
type LearnSetupChild = Omit<LearnSetupBase['children'][number], 'nameDay' | 'initial'> & {
  nameDay?: string;
  initial?: string;
};
export type LearnSetupVm = Omit<
  LearnSetupBase,
  'familyPlanning' | 'preferences' | 'subjects' | 'formationSetup' | 'children'
> & {
  children: LearnSetupChild[];
  familyPlanning: LearnSetupBase['familyPlanning'] & { household?: LearnShellNode; children?: LearnShellNode[] };
  preferences: LearnSetupBase['preferences'] & {
    defaultSchoolDays?: string[];
    defaultMissedLessonBehavior?: string;
    defaultMaxDailyMinutes?: string | number;
  };
  subjects: (LearnSetupBase['subjects'][number] & { type?: string })[];
  formationSetup: Omit<LearnSetupBase['formationSetup'], 'enrichmentBlocks'> & {
    enrichmentBlocks: (LearnSetupBase['formationSetup']['enrichmentBlocks'][number] & { type?: string })[];
  };
};
export type LearnPrintVm = ReturnType<typeof VM.toPrintCenterViewModel> & {
  sampleOutputs?: { mom?: string[]; child?: string[]; planner?: string[] };
};
type ViewVariants =
  | LearnDashboardVm
  | LearnPlannerVm
  | LearnFormationVm
  | LearnBooksVm
  | LearnGradesVm
  | LearnCoOpVm
  | LearnCommunityVm
  | LearnSetupVm
  | LearnPrintVm
  | LearnReportsVm;
type Keys<U> = U extends unknown ? keyof U : never;
type ValueAt<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? U[K] : never) : never;
type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type Objects<U> = Exclude<U, Primitive>;
type Merge<U, D extends 0[] = []> = unknown extends U
  ? unknown
  : D['length'] extends 6
    ? U
    : | Extract<U, Primitive>
      | ([Objects<U>] extends [never]
          ? never
          : [Objects<U>] extends [readonly unknown[]]
            ? Merge<Objects<U> extends readonly (infer E)[] ? E : never, [...D, 0]>[]
            : { [K in Keys<Objects<U>>]?: Merge<ValueAt<Objects<U>, K>, [...D, 0]> });
export type LearnShellViewModel = Omit<Merge<ViewVariants>, 'shell' | 'page' | 'household'> & {
  shell: LearnDashboardVm['shell'];
  page: LearnDashboardVm['page'];
  household?: Merge<ValueAt<ViewVariants, 'household'>> & { parishName?: string; parish?: string; method?: string };
};
export interface LearnShellOptions {
  upgrade?: boolean;
  defaultCollapsed?: boolean;
  summary?: string;
  icon?: string;
  style?: string;
  largeTitle?: boolean;
  action?: string;
  contentHtml?: string;
  width?: string;
  type?: string;
  step?: string;
  placeholder?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
}
export interface LearnShellDateParts {
  year: number;
  month: number;
  day: number;
}
export interface LearnShellPrototypeState {
  __agapayBackendSynced?: boolean;
  plan?: Record<string, string>;
  userRecipes?: Record<
    string,
    {
      name?: string;
      level?: string;
      types?: string[];
      ingredients?: string[];
      note?: string;
      time?: string;
      servings?: number;
      glyph?: string;
      custom?: boolean;
    }
  >;
  chores?: Record<string, string>;
  choreDetails?: Record<string, LearnShellNode>;
  events?: {
    id?: string;
    title?: string;
    type?: string;
    dayKey?: string;
    time?: string;
    who?: string;
    note?: string;
  }[];
  pantry?: string[];
  manualGroceries?: { id?: string; label?: string; aisle?: string }[];
  groceryChecked?: Record<string, boolean>;
}
export type LearnShellSimpleDraft = LearnSimpleDraftShape;
export interface LearnShellSectionOptions {
  group: string;
  panel: string;
  title: string;
  detail?: string;
  count?: number;
  icon?: string;
  minutes?: string;
  teksUrl?: string;
  content?: string;
}
export interface LearnShellGoogleStatus {
  loaded: boolean;
  configured: boolean;
  connected: boolean;
  accountEmail?: string;
}
export interface LearnShellError extends Error {
  code?: string;
  status?: number;
  response?: Response;
}
export interface LearnShellPayload extends LearnViewPayload {
  saints?: LearnShellNode[];
  term?: LearnShellNode;
  academicRecords?: LearnShellNode[];
  checkoutUrl?: string;
  url?: string;
  authUrl?: string;
  savedAt?: string;
  error?: string;
  message?: string;
  detail?: string;
  code?: string;
  plan?: string;
  fullAccess?: boolean;
  printLimit?: number;
  configured?: boolean;
  connected?: boolean;
  accountEmail?: string;
  setupCompleted?: boolean;
  dashboard?: LearnViewEntity;
  planner?: LearnViewEntity;
  formation?: LearnViewEntity;
  books?: LearnViewEntity;
  grades?: LearnViewEntity;
  setup?: LearnViewEntity;
  onboarding?: LearnViewEntity & { setupSnapshot?: LearnShellNode };
  printCenter?: LearnViewEntity;
  community?: LearnViewEntity;
  testScores?: { scores?: LearnViewEntity[] };
}

export interface LearnFamilyPlannerModel {
  planning: LearnShellNode;
  dates: string[];
  monthKey: string;
  monthLabel: string;
  weekDays: LearnCalendarDay[];
  monthDays: LearnCalendarDay[];
  mealByDate: Map<string | undefined, LearnShellNode>;
  eventsByDate: Map<string | undefined, LearnShellNode[]>;
  recipes: LearnShellNode[];
  groceries: LearnShellNode[];
  chores: LearnShellNode[];
  children: (LearnShellNode & { name: string; color: string; initial: string })[];
}

type LearnReportsBase = ReturnType<typeof VM.toReportsViewModel>;
export type LearnReportsVm = Omit<LearnReportsBase, 'exports'> & {
  exports: (LearnReportsBase['exports'][number] & { label?: string })[];
};
export interface LearnShellWeekAssignment {
  zone?: string;
  sourceId?: string;
  note?: string;
  completed?: boolean;
  autoPlaced?: boolean;
  status?: string;
}
export type LearnShellAssignment = LearnPlannerVm['week']['weeklyAssignmentItems'][number] & { note?: string };

export interface LearnPrototypeForm {
  id: string;
  label: string;
  color: string;
  children: string[];
  subjects: string[];
}

export interface LearnPrototypeSeed {
  days?: LearnShellNode[];
  month?: { days?: LearnShellNode[] };
}
export interface LearnResourceFieldSnapshot {
  name: string;
  value: string;
  checked: boolean;
}

export interface LearnTruthyFilter {
  <T>(value: T): value is NonNullable<T>;
}
export interface LearnSetupResourceRow {
  title: string;
  scheduledWeeks: number[];
  weeklyPlans?: string[];
  planningMode?: string;
  formLabel?: string;
  formLabels?: string[];
  gradeLabel?: string;
  childIds?: string[];
}

export type LearnChromeModel = Pick<LearnShellViewModel, 'shell' | 'page'> & {
  graceMode?: { statusLabel?: string; label?: string; active?: boolean; mode?: string };
};
export interface LearnAssignmentContext {
  week?: { weeklyAssignmentItems?: LearnPlannerVm['week']['weeklyAssignmentItems']; days?: { date: string }[] };
}
export interface LearnFamilyContext {
  familyPlanning?: Pick<LearnShellNode, 'events' | 'meals' | 'chores'>;
}

export interface LearnSetupTileValues extends Record<string, unknown> {
  title: string;
  detail?: string;
  minutes?: string;
}
export type LearnFaithTextFields = Partial<
  Record<'title' | 'label' | 'sub' | 'subtitle' | 'detail' | 'note' | 'type' | 'category' | 'description', unknown>
>;
export type LearnCalendarDay = LearnShellNode & { date: string };

export interface LearnHouseholdPlanningInfo {
  name?: string;
  motherName?: string;
  motherNameDay?: string;
  fatherName?: string;
  fatherNameDay?: string;
  parishPatronalFeastName?: string;
  parishPatronalFeastDate?: string;
}
export interface LearnFamilySetupContext {
  household?: LearnHouseholdPlanningInfo;
  children?: LearnShellNode[];
  familyPlanning?: Pick<
    LearnShellNode,
    'weekStart' | 'fastingPreference' | 'nameDays' | 'meals' | 'recipes' | 'chores' | 'events' | 'groceryItems'
  > & { household?: LearnHouseholdPlanningInfo; children?: LearnShellNode[] };
}

export interface LearnChildSheetGroup {
  name: string;
  childId: string;
  color: string;
  sheets: LearnPrintVm['templates'];
}
export type LearnCommunityResource = Partial<LearnCommunityVm['resources'][number]>;
export type LearnFamilyPlannerInput = Pick<LearnPlannerVm, 'week' | 'month'> & {
  familyPlanning: Pick<
    LearnShellNode,
    | 'children'
    | 'meals'
    | 'groceryItems'
    | 'events'
    | 'recipes'
    | 'chores'
    | 'weekStart'
    | 'fastingPreference'
    | 'household'
  >;
};

export interface LearnMonthFeast {
  id: string;
  day: string | number;
  dateLabel: string | number;
  name: string;
  rank: string;
  plan: boolean;
}
