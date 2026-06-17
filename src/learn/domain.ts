export const CALENDAR_TYPES = ["julian", "revised-julian"] as const;
export type CalendarType = typeof CALENDAR_TYPES[number];

export const LESSON_BLOCK_STATUSES = ["not-started", "in-progress", "completed", "moved", "skipped"] as const;
export type LessonBlockStatus = typeof LESSON_BLOCK_STATUSES[number];

export const HOUSEHOLD_STREAM_TYPES = [
  "morning-basket",
  "family-read-aloud",
  "nature-study",
  "catechesis",
  "feast-day-activity"
] as const;
export type HouseholdStreamType = typeof HOUSEHOLD_STREAM_TYPES[number];

export const CHILD_TRACK_SUBJECT_TYPES = [
  "math",
  "phonics",
  "written-narration",
  "copywork",
  "independent-reading",
  "practical-life",
  "poetry",
  "handwriting",
  "memory-work",
  "art",
  "fine-motor",
  "songs"
] as const;
export type ChildTrackSubjectType = typeof CHILD_TRACK_SUBJECT_TYPES[number];

export const NARRATION_TYPES = ["oral", "written", "picture"] as const;
export type NarrationType = typeof NARRATION_TYPES[number];

export const PACE_MODES = ["steady", "grace", "recovery"] as const;
export type PaceMode = typeof PACE_MODES[number];

export const GRACE_MODES = ["full", "light", "minimum-viable", "feast-only", "custom"] as const;
export type GraceMode = typeof GRACE_MODES[number];

export const CYCLE_FRAMEWORK_TYPES = ["history", "catechesis", "combined"] as const;
export type CycleFrameworkType = typeof CYCLE_FRAMEWORK_TYPES[number];

export const CURRICULUM_SOURCE_KINDS = ["agapay-default", "household-custom", "third-party"] as const;
export type CurriculumSourceKind = typeof CURRICULUM_SOURCE_KINDS[number];

export const CURRICULUM_MAPPING_SCOPES = ["cycle", "term", "household-stream", "child-track"] as const;
export type CurriculumMappingScope = typeof CURRICULUM_MAPPING_SCOPES[number];

export const EVALUATION_MODELS = ["narrative-only", "complete-incomplete", "letter-grade", "percent", "pass-fail"] as const;
export type EvaluationModel = typeof EVALUATION_MODELS[number];

export const REPORT_EXPORT_FORMATS = ["pdf", "csv", "json"] as const;
export type ReportExportFormat = typeof REPORT_EXPORT_FORMATS[number];

export interface Household {
  id: string;
  slug: string;
  name: string;
  parentNames: string[];
  childrenCount: number;
  primaryMethod: string;
  liturgicalCalendarType: CalendarType;
  activeProductSlugs: string[];
}

export interface Child {
  id: string;
  householdId: string;
  firstName: string;
  ageYears: number;
  gradeLabel: string;
  avatarMonogram: string;
  accentToken: string;
}

export interface SchoolYear {
  id: string;
  householdId: string;
  label: string;
  startDate: string;
  endDate: string;
  currentTermId: string;
}

export interface Term {
  id: string;
  schoolYearId: string;
  label: string;
  startDate: string;
  endDate: string;
  paceMode: PaceMode;
}

export interface LiturgicalDay {
  id: string;
  civilDate: string;
  calendarType: CalendarType;
  oldStyleDateLabel: string;
  feastTitle: string;
  feastRank: string;
  saints: string[];
  fastingRule: string;
  tone: string;
  epistleRef: string;
  gospelRef: string;
  epistleTextKjv: string;
  gospelTextKjv: string;
  troparionText: string;
  troparionTone: string;
  kontakionText: string;
  kontakionTone: string;
}

export interface HouseholdStream {
  id: string;
  householdId: string;
  streamType: HouseholdStreamType;
  title: string;
  cadenceLabel: string;
}

export interface ChildTrack {
  id: string;
  childId: string;
  subjectType: ChildTrackSubjectType;
  title: string;
}

export interface LessonDay {
  id: string;
  householdId: string;
  civilDate: string;
  calendarType: CalendarType;
  liturgicalDayId: string;
}

export interface HouseholdLessonBlock {
  id: string;
  lessonDayId: string;
  householdStreamId: string;
  status: LessonBlockStatus;
  minutesPlanned: number;
  title: string;
  subtitle: string;
}

export interface ChildLessonBlock {
  id: string;
  lessonDayId: string;
  childTrackId: string;
  status: LessonBlockStatus;
  minutesPlanned: number;
  title: string;
  subtitle: string;
}

export interface ChurchRhythmPractice {
  id: string;
  lessonDayId: string;
  title: string;
  status: LessonBlockStatus;
  note: string;
}

export interface NarrationLog {
  id: string;
  childId: string;
  lessonDayId: string;
  narrationType: NarrationType;
  sourceTitle: string;
  note: string;
  loggedAt: string;
}

export interface Book {
  id: string;
  householdId: string;
  title: string;
  author: string;
  category: string;
}

export interface BookAssignment {
  id: string;
  bookId: string;
  assignmentType: "household" | "child";
  assigneeId: string;
  progressPercent: number;
}

export interface CycleFramework {
  id: string;
  frameworkType: CycleFrameworkType;
  title: string;
  summary: string;
}

export interface CycleYear {
  id: string;
  cycleFrameworkId: string;
  yearNumber: number;
  title: string;
}

export interface CycleTopic {
  id: string;
  cycleYearId: string;
  subjectType: ChildTrackSubjectType | "history" | "catechesis";
  title: string;
  seasonLabel: string;
}

export interface CurriculumPackage {
  id: string;
  householdId: string;
  title: string;
  vendor: string;
  sourceKind?: CurriculumSourceKind;
}

export interface CurriculumSubject {
  id: string;
  curriculumPackageId: string;
  subjectType: ChildTrackSubjectType | "history" | "catechesis" | "enrichment" | "recitation";
  title: string;
  sortOrder: number;
}

export interface CurriculumResource {
  id: string;
  curriculumPackageId: string;
  curriculumSubjectId: string;
  title: string;
  author: string;
  resourceType: "book" | "hymn" | "scripture" | "icon" | "activity" | "custom";
  sourceKind: CurriculumSourceKind;
}

export interface CurriculumMapping {
  id: string;
  curriculumPackageId: string;
  curriculumResourceId: string;
  mappingScope: CurriculumMappingScope;
  targetId: string;
  cycleFrameworkId?: string;
  cycleYearId?: string;
  termId?: string;
  priority: number;
}

export interface HouseholdPaceProfile {
  id: string;
  householdId: string;
  title: string;
  paceMode: PaceMode;
}

export interface SeasonAdjustment {
  id: string;
  householdId: string;
  paceProfileId: string;
  title: string;
  adjustmentKind: "new-baby" | "recovery" | "travel" | "feast-prep";
  startsOn: string;
  endsOn: string;
}

export interface GraceModeRule {
  id: string;
  seasonAdjustmentId: string;
  mode: GraceMode;
  preserveChurchRhythms: boolean;
  preserveMorningBasket: boolean;
  reducePriorityThreshold: number;
}

export interface Rotation {
  id: string;
  householdId: string;
  termId: string;
  rotationType: "picture-study" | "composer" | "poet" | "nature-study" | "handicraft";
  title: string;
  currentSelection: string;
  weekRangeLabel: string;
  minutesPerWeek: number;
}

export interface CatechesisCycle {
  id: string;
  householdId: string;
  cycleYearId: string;
  title: string;
  currentLesson: string;
  lessonNumber: number;
  totalLessons: number;
  doctrinalTopic: string;
  evaluationModel: EvaluationModel;
}

export interface RecitationTrack {
  id: string;
  householdId: string;
  childId?: string;
  title: string;
  sourceKind: "creed" | "psalm" | "prayer" | "scripture" | "poetry";
  progressPercent: number;
  status: "memorizing" | "memorized" | "review";
}

export interface HymnStudy {
  id: string;
  householdId: string;
  termId: string;
  title: string;
  tone: string;
  source: string;
  status: "planned" | "in-progress" | "learned";
}

export interface EnrichmentBlock {
  id: string;
  householdId: string;
  termId: string;
  blockType: "art" | "nature-study" | "composer" | "timeline" | "handicraft";
  title: string;
  minutesPlanned: number;
  cadenceLabel: string;
}

export interface NatureJournalEntry {
  id: string;
  childId: string;
  observedOn: string;
  title: string;
  location: string;
  notes: string;
  mediaUrl?: string;
}

export interface ReportExport {
  id: string;
  householdId: string;
  exportType: "attendance" | "lesson-log" | "curriculum-list" | "narration-log" | "report-card" | "transcript";
  format: ReportExportFormat;
  status: "ready" | "queued" | "generated";
  generatedAt?: string;
}

export interface AcademicRecord {
  id: string;
  householdId: string;
  childId: string;
  schoolYearId: string;
  subject: string;
  evaluationModel: EvaluationModel;
  mark: string;
  narrativeSummary: string;
}

export interface ReportCard {
  id: string;
  householdId: string;
  childId: string;
  schoolYearId: string;
  termId: string;
  status: "draft" | "ready" | "exported";
  generatedAt?: string;
  summary: string;
  records: AcademicRecord[];
}

export interface Transcript {
  id: string;
  householdId: string;
  childId: string;
  status: "draft" | "ready" | "exported";
  generatedAt?: string;
  gradeSpan: string;
  credits: number;
  records: AcademicRecord[];
}

export interface CoOp {
  id: string;
  name: string;
  city: string;
  affiliation: string;
  learningCycleLabel: string;
  enabled: boolean;
}

export interface CoOpMember {
  id: string;
  coOpId: string;
  householdName: string;
  childrenCount: number;
  role: "member" | "lead" | "teacher";
}

export interface CoOpMeeting {
  id: string;
  coOpId: string;
  startsAt: string;
  endsAt: string;
  locationLabel: string;
}

export interface CoOpScheduleBlock {
  id: string;
  meetingId: string;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  teacherHouseholdName: string;
}

export interface CoOpAnnouncement {
  id: string;
  coOpId: string;
  title: string;
  body: string;
  postedAt: string;
  priority: "normal" | "important";
}
