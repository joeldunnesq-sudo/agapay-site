export interface LearnScoreIdentity {
  email: string;
  householdId: string;
  donor?: unknown;
}
export interface LearnScoreChild {
  id: string;
  firstName?: string;
  name?: string;
}
export interface LearnScoreSetup {
  children?: LearnScoreChild[];
  [field: string]: unknown;
}
export interface TestScoreInput extends Record<string, unknown> {
  testType?: string;
}
export interface TestScore {
  id: string;
  childId: string;
  testType: string;
  testDate: string;
  compositeScore: number | null;
  totalScore: number | null;
  englishScore: number | null;
  mathScore: number | null;
  readingScore: number | null;
  scienceScore: number | null;
  writingScore: number | null;
  readingWritingScore: number | null;
}
export interface TestScoreRow {
  id: string;
  child_id: string;
  test_type: string;
  test_date: string | null;
  composite_score: number | null;
  total_score: number | null;
  english_score: number | null;
  math_score: number | null;
  reading_score: number | null;
  science_score: number | null;
  writing_score: number | null;
  reading_writing_score: number | null;
}
