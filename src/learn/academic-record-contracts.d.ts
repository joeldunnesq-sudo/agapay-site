export interface AcademicChild {
  id: string;
  firstName?: string;
  name?: string;
  formLabel?: string;
  gradeLabel?: string;
}
export interface AcademicTerm {
  id?: string;
  label?: string;
  endDate?: string;
}
export interface AcademicAssignment {
  id?: string;
  childId?: string;
  formLabel?: string;
  termId?: string;
  title?: string;
  subjectType?: string;
  resource?: string;
  progressionType?: string;
  finalGradeOverride?: string;
  evaluationModel?: string;
  author?: string;
  audienceLabel?: string;
  category?: string;
  credits?: unknown;
  startNumber?: unknown;
  currentNumber?: unknown;
  completedThroughNumber?: unknown;
  endNumber?: unknown;
  startChapter?: unknown;
  currentChapter?: unknown;
  completedThroughChapter?: unknown;
  endChapter?: unknown;
  totalChapters?: unknown;
}
export interface AcademicProgress {
  start: number;
  current: number;
  end: number;
  completed: number;
  total: number;
  percent: number;
}
export interface StoredAcademicRecord extends Record<string, unknown> {
  id: string;
  childId: string;
  recordType?: string;
  credits?: unknown;
  progress?: AcademicProgress;
  subjectTitle?: string;
  subject?: string;
  source?: string;
  subjectType?: string;
  completionPercent?: number;
  progressionType?: string;
  mark?: string;
}
export interface StoredReportCard extends Record<string, unknown> {
  id: string;
  childId: string;
  schoolYearId?: string;
  status?: string;
}
export interface AcademicSetup {
  identity?: { householdId?: string };
  household?: { id?: string };
  schoolYear?: { id?: string };
  children?: AcademicChild[];
  term?: AcademicTerm;
  terms?: AcademicTerm[];
  preferences?: { evaluationModel?: string };
  subjects?: AcademicAssignment[];
  books?: AcademicAssignment[];
  closedAcademicRecords?: StoredAcademicRecord[];
  academicRecords?: StoredAcademicRecord[];
}
export interface AcademicSqlRow {
  id: string;
  child_id: string;
  record_type: string;
  occurred_on: string;
  data: string;
  created_at: string;
  updated_at: string;
}
export interface ReportCardSqlRow {
  id: string;
  child_id: string;
  school_year_id: string;
  status: string;
  data: string;
  created_at: string;
  updated_at: string;
}
