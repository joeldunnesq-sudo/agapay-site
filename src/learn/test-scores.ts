import type { TestScore, TestScoreRow, TestScoreInput } from './test-score-contracts.js';
import { d1, d1All, d1Run, json, unauthorized } from '../lib/core.js';
import { learnSetupIdentity } from './setup-persistence.js';
import { loadChildren, loadSetupForIdentity } from './grade-records.js';

const devTestScores = new Map<string, TestScore[]>();

function list<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function text(value: unknown, fallback: string = '') {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

function scoreOrNull(value: unknown, { min = 0, max = 1600 }: { min?: number; max?: number } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function isoDate(value: unknown) {
  const normalized = text(value, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function stableSegment(value: unknown, fallback: string = 'item') {
  return (
    text(value, fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}

function testScoreId(childId: string, testType: string, testDate: string, index: number) {
  return `test_score_${stableSegment(childId, 'child')}_${stableSegment(testType, 'test')}_${stableSegment(testDate || String(index), 'entry')}`;
}

function normalizeTestScorePayload(
  entry: TestScoreInput = {},
  { childId, index = 0 }: { childId: string; index?: number }
) {
  const testType = /^sat$/i.test(entry.testType as string) ? 'SAT' : 'ACT';
  const testDate = isoDate(entry.testDate);
  const resolvedId = text(entry.id, testScoreId(childId, testType, testDate, index));
  if (testType === 'SAT') {
    return {
      id: resolvedId,
      childId,
      testType,
      testDate,
      totalScore: scoreOrNull(entry.totalScore, { min: 400, max: 1600 }),
      readingWritingScore: scoreOrNull(entry.readingWritingScore, { min: 200, max: 800 }),
      mathScore: scoreOrNull(entry.mathScore, { min: 200, max: 800 }),
      compositeScore: null,
      englishScore: null,
      readingScore: null,
      scienceScore: null,
      writingScore: null,
    };
  }
  return {
    id: resolvedId,
    childId,
    testType,
    testDate,
    compositeScore: scoreOrNull(entry.compositeScore, { min: 1, max: 36 }),
    englishScore: scoreOrNull(entry.englishScore, { min: 1, max: 36 }),
    mathScore: scoreOrNull(entry.mathScore, { min: 1, max: 36 }),
    readingScore: scoreOrNull(entry.readingScore, { min: 1, max: 36 }),
    scienceScore: scoreOrNull(entry.scienceScore, { min: 1, max: 36 }),
    writingScore: scoreOrNull(entry.writingScore, { min: 1, max: 36 }),
    totalScore: null,
    readingWritingScore: null,
  };
}

function rowToTestScore(row: TestScoreRow) {
  return {
    id: row.id,
    childId: row.child_id,
    testType: row.test_type,
    testDate: row.test_date || '',
    compositeScore: row.composite_score,
    totalScore: row.total_score,
    englishScore: row.english_score,
    mathScore: row.math_score,
    readingScore: row.reading_score,
    scienceScore: row.science_score,
    writingScore: row.writing_score,
    readingWritingScore: row.reading_writing_score,
  };
}

function devKey(householdId: string) {
  return householdId;
}

function devTestScoresFor(householdId: string) {
  return list<TestScore>(devTestScores.get(devKey(householdId)));
}

function saveDevTestScores(householdId: string, childId: string, entries: TestScore[]) {
  const existing = devTestScoresFor(householdId).filter((row) => row.childId !== childId);
  const merged = [...existing, ...entries];
  devTestScores.set(devKey(householdId), merged);
  return merged;
}

export async function loadTestScores(env: Partial<Env>, householdId: string) {
  if (!d1(env)) return devTestScoresFor(householdId);
  try {
    const rows = await d1All<TestScoreRow>(
      env,
      `SELECT id, child_id, test_type, test_date, composite_score, total_score, english_score, math_score, reading_score, science_score, writing_score, reading_writing_score
       FROM learn_test_scores
       WHERE household_id = ?1
       ORDER BY child_id, test_date DESC`,
      householdId
    );
    return rows.map(rowToTestScore);
  } catch {
    return [];
  }
}

export async function handleLearnTestScores(request: Request, env: Partial<Env>) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  const setupSnapshot = await loadSetupForIdentity(env, identity);
  const children = await loadChildren(env, identity.householdId, setupSnapshot);
  const testScores = await loadTestScores(env, identity.householdId);
  return json({
    ok: true,
    testScores: {
      children: children.map((child, index) => ({
        id: child.id,
        firstName: text(child.firstName || child.name, `Child ${index + 1}`),
      })),
      scores: testScores,
    },
  });
}

export async function handleLearnTestScoresSave(request: Request, env: Partial<Env>) {
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();

  const payload = (await request.json().catch(() => null)) as { childId?: unknown; scores?: TestScoreInput[] } | null;
  if (!payload || typeof payload !== 'object')
    return json({ ok: false, error: 'Test score payload was invalid.' }, { status: 400 });

  const setupSnapshot = await loadSetupForIdentity(env, identity);
  const children = await loadChildren(env, identity.householdId, setupSnapshot);
  const childIds = new Set(children.map((child) => child.id));
  const childId = text(payload.childId || children[0]?.id, '');
  if (!childIds.has(childId))
    return json({ ok: false, error: 'Choose a child from this household before saving test scores.' }, { status: 400 });

  const entries = list<TestScoreInput>(payload.scores)
    .map((entry, index) => normalizeTestScorePayload(entry, { childId, index }))
    .filter(
      (entry) =>
        entry.testDate ||
        entry.compositeScore !== null ||
        entry.totalScore !== null ||
        entry.englishScore !== null ||
        entry.mathScore !== null ||
        entry.readingScore !== null ||
        entry.scienceScore !== null ||
        entry.writingScore !== null ||
        entry.readingWritingScore !== null
    );

  if (!d1(env)) {
    const saved = saveDevTestScores(identity.householdId, childId, entries);
    return json({ ok: true, testScores: saved.filter((row) => row.childId === childId) });
  }

  const timestamp = new Date().toISOString();
  const keepIds = entries.map((entry) => entry.id);

  for (const entry of entries) {
    await d1Run(
      env,
      `INSERT INTO learn_test_scores (id, household_id, child_id, test_type, test_date, composite_score, total_score, english_score, math_score, reading_score, science_score, writing_score, reading_writing_score, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
       ON CONFLICT(id) DO UPDATE SET
         test_type = excluded.test_type,
         test_date = excluded.test_date,
         composite_score = excluded.composite_score,
         total_score = excluded.total_score,
         english_score = excluded.english_score,
         math_score = excluded.math_score,
         reading_score = excluded.reading_score,
         science_score = excluded.science_score,
         writing_score = excluded.writing_score,
         reading_writing_score = excluded.reading_writing_score,
         updated_at = excluded.updated_at`,
      entry.id,
      identity.householdId,
      childId,
      entry.testType,
      entry.testDate || null,
      entry.compositeScore,
      entry.totalScore,
      entry.englishScore,
      entry.mathScore,
      entry.readingScore,
      entry.scienceScore,
      entry.writingScore,
      entry.readingWritingScore,
      timestamp
    );
  }

  if (keepIds.length) {
    const placeholders = keepIds.map((_, index) => `?${index + 3}`).join(', ');
    await d1Run(
      env,
      `DELETE FROM learn_test_scores WHERE household_id = ?1 AND child_id = ?2 AND id NOT IN (${placeholders})`,
      identity.householdId,
      childId,
      ...keepIds
    );
  } else {
    await d1Run(
      env,
      `DELETE FROM learn_test_scores WHERE household_id = ?1 AND child_id = ?2`,
      identity.householdId,
      childId
    );
  }

  const refreshed = await loadTestScores(env, identity.householdId);
  return json({ ok: true, testScores: refreshed.filter((row) => row.childId === childId) });
}
