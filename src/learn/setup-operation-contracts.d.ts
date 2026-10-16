import type { getLearnSeedSnapshot } from './demo-data.js';
import type { LearnSetupSnapshot } from './setup-persistence.js';
import type { StoredAcademicRecord, StoredReportCard } from './academic-record-contracts.js';
export interface SetupInputNode extends Record<string, unknown> {
  completion?: SetupInputNode;
  household?: SetupInputNode;
  schoolYear?: SetupInputNode;
  term?: SetupInputNode;
  preferences?: SetupInputNode;
  historyCycle?: SetupInputNode | null;
  formation?: SetupInputNode;
  familyPlanning?: SetupInputNode;
  coOp?: SetupInputNode;
  starterWeek?: SetupInputNode | null;
  catechesis?: SetupInputNode;
  dailyMinutes?: SetupInputNode;
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  description?: string;
  resource?: string;
  source?: string;
  formLabel?: string;
  gradeLabel?: string;
  childId?: string;
  termId?: string;
  framework?: string;
  cycleYear?: string;
  rotation?: string;
  action?: string;
  reason?: string;
  scope?: string;
  itemId?: string;
  civilDate?: string;
  startDate?: string;
  endDate?: string;
  activeStartDate?: string;
  activeEndDate?: string;
  schedulingMode?: string;
  weeklyFrequency?: string;
  cadenceLabel?: string;
  cadence?: string;
  resourceType?: string;
  planningMode?: string;
  gracePriority?: string;
  graceNote?: string;
  progressionType?: string;
  color?: string;
  sourceKind?: string;
  materialType?: string;
  blockType?: string;
  streamType?: string;
  subjectType?: string;
  category?: string;
  priorityLevel?: string;
  defaultMissedLessonBehavior?: string;
  childIds?: unknown[];
  formLabels?: string[];
  parentNames?: unknown[];
  scheduledDays?: string[];
  scheduledWeeks?: number[];
  weeklyPlans?: string[];
  resources?: (string | SetupInputNode)[];
  children?: SetupInputNode[];
  terms?: SetupInputNode[];
  streams?: SetupInputNode[];
  books?: SetupInputNode[];
  subjects?: SetupInputNode[];
  formationMaterials?: SetupInputNode[];
  churchRhythms?: SetupInputNode[];
  recitationTracks?: SetupInputNode[];
  hymnStudies?: SetupInputNode[];
  enrichmentBlocks?: SetupInputNode[];
}
export interface SetupBookInput {
  id?: string;
  title?: unknown;
  author?: string;
  category?: string;
  termId?: string;
  formLabel?: string;
  formLabels?: string[];
  gradeLabel?: string;
  childId?: string;
  childIds?: unknown[];
  audienceLabel?: string;
  planningMode?: string;
  weeklyFrequency?: string;
  scheduledWeeks?: number[];
  weeklyPlans?: string[];
  minutes?: number | string;
  color?: string;
  sourceKind?: string;
}
export type DemoLearnSeed = ReturnType<typeof getLearnSeedSnapshot>;
export type LearnRuntimeChild = DemoLearnSeed['children'][number] & Partial<LearnSetupSnapshot['children'][number]>;
export type LearnRuntimeBook = Omit<
  Partial<LearnSetupSnapshot['books'][number]>,
  'startChapter' | 'currentChapter' | 'endChapter' | 'totalChapters' | 'minutes'
> & {
  id: string;
  title: string;
  author: string;
  category: string;
  householdId?: string;
  minutes?: number | string;
  startChapter?: number | string;
  currentChapter?: number | string;
  endChapter?: number | string;
  totalChapters?: number | string;
  childId?: string;
  childIds?: unknown[];
  formLabels?: string[];
  gradeLabel?: string;
  gracePriority?: string;
  planningMode?: string;
  sourceKind?: string;
  weeklyPlans?: string[];
  resource?: string;
};
export interface LearnRuntimePlannerRow {
  id: string;
  title: string;
  detail: string;
  priority: number;
  minutes: number[];
  statuses: string[];
  streamId?: string;
  householdStreamId?: string;
  childId?: string | null;
  sourceId?: string;
  resourceIndex?: number;
  childIds?: unknown[];
  planningMode?: string;
  formLabels?: string[];
  groupLabel?: string;
  href?: string;
  gracePriority?: string;
  graceNote?: string;
  graceModeApplied?: boolean;
  priorityLevel?: string;
  instructionMode?: string;
  missedLessonBehavior?: string;
  color?: string;
  movedFromWeekday?: number | null;
  movedToWeekday?: number | null;
}
export type LearnRuntimeSeed = Omit<
  DemoLearnSeed,
  | 'children'
  | 'books'
  | 'libraryBooks'
  | 'currentReadAlouds'
  | 'plannerWeek'
  | 'dashboardDaily'
  | 'curriculumResources'
  | 'termSetup'
  | 'bookAssignments'
  | 'catechesisCycles'
  | 'recitationTracks'
  | 'hymnStudies'
  | 'enrichmentBlocks'
> & {
  household: DemoLearnSeed['household'] & Partial<LearnSetupSnapshot['household']>;
  children: LearnRuntimeChild[];
  books: LearnRuntimeBook[];
  libraryBooks: (LearnRuntimeBook & Partial<DemoLearnSeed['libraryBooks'][number]>)[];
  currentReadAlouds: (Omit<LearnRuntimeBook, 'id' | 'category'> &
    Partial<DemoLearnSeed['currentReadAlouds'][number]>)[];
  plannerWeek: Omit<DemoLearnSeed['plannerWeek'], 'householdRows' | 'childRows'> & {
    householdRows: LearnRuntimePlannerRow[];
    childRows: LearnRuntimePlannerRow[];
    termWeekNumber?: number;
  };
  dashboardDaily: Record<
    string,
    Omit<DemoLearnSeed['dashboardDaily']['2025-05-07'], 'churchRhythms'> & {
      churchRhythms: (Partial<DemoLearnSeed['dashboardDaily']['2025-05-07']['churchRhythms'][number]> &
        Partial<LearnSetupSnapshot['formation']['churchRhythms'][number]> & {
          id: string;
          title: string;
          note: string;
          status: string;
        })[];
    }
  >;
  curriculumResources: (Omit<DemoLearnSeed['curriculumResources'][number], 'curriculumSubjectId'> & {
    curriculumSubjectId: string | null;
    sortOrder?: number;
  })[];
  termSetup: DemoLearnSeed['termSetup'] & { graceReserve?: unknown };
  bookAssignments: (Omit<DemoLearnSeed['bookAssignments'][number], 'assigneeId' | 'currentLabel'> & {
    assigneeId?: string;
    currentLabel?: string;
    childId?: string | null;
    householdId?: string;
    formLabel?: string;
  })[];
  catechesisCycles: (Partial<DemoLearnSeed['catechesisCycles'][number]> &
    Partial<LearnSetupSnapshot['formation']['catechesis']>)[];
  recitationTracks: (Partial<DemoLearnSeed['recitationTracks'][number]> &
    Partial<LearnSetupSnapshot['formation']['recitationTracks'][number]> & { id: string; title: string })[];
  hymnStudies: (Partial<DemoLearnSeed['hymnStudies'][number]> &
    Partial<LearnSetupSnapshot['formation']['hymnStudies'][number]> & { id: string; title: string })[];
  enrichmentBlocks: (Partial<DemoLearnSeed['enrichmentBlocks'][number]> &
    Partial<LearnSetupSnapshot['formation']['enrichmentBlocks'][number]> & { id: string; title: string })[];
  setupSnapshot?: LearnSetupSnapshot;
  familyPlanning?: LearnSetupSnapshot['familyPlanning'];
  closedAcademicRecords?: StoredAcademicRecord[];
  closedReportCards?: StoredReportCard[];
};
export type SetupTruthyFilter = <T>(value: T | null | undefined | false) => value is NonNullable<T>;
