import assert from 'node:assert/strict';
import {
  closeLearnTerm,
  loadLearnAcademicSnapshot,
  buildTranscriptsFromAcademicRecords,
  computeSubjectGrade,
} from '../src/learn/academic-records.js';
import { renderReportCardTemplate, renderHighSchoolTranscriptTemplate } from '../src/learn/academic-print-templates.js';
const records = new Map();
const env = {
  AGAPAY_REGISTRATIONS: {
    async get(key) {
      return records.get(key) ?? null;
    },
    async put(key, value) {
      records.set(key, value);
    },
  },
};
const setup = {
  identity: { householdId: 'family-a' },
  household: { id: 'ignored-household' },
  schoolYear: { id: 'year-one' },
  children: [
    { id: 'child-a', firstName: 'Alice', gradeLabel: 'Grade 9', formLabel: 'I' },
    { id: 'child-b', firstName: 'Bob', gradeLabel: 'Grade 10', formLabel: 'II' },
  ],
  terms: [{ id: 'term-one', label: 'Autumn', endDate: '2026-12-01' }],
  subjects: [
    {
      id: 'math',
      termId: 'term-one',
      childId: 'child-a',
      title: 'Math',
      startNumber: 1,
      currentNumber: 10,
      endNumber: 10,
      credits: 1,
      evaluationModel: 'letter-grade',
    },
    { id: 'ignored', termId: 'another-term', title: 'Not closed' },
  ],
  books: [
    {
      id: 'book',
      termId: 'term-one',
      formLabel: 'II',
      title: 'Reading',
      startChapter: 1,
      currentChapter: 2,
      endChapter: 3,
    },
  ],
};
assert.equal((await closeLearnTerm(env, {}, 'term-one')).status, 400);
assert.equal((await closeLearnTerm(env, setup, 'foreign-term')).status, 404);
const closed = await closeLearnTerm(env, setup, 'term-one');
assert.equal(closed.ok, true);
assert.equal(closed.academicRecords.length, 2);
assert.ok(closed.academicRecords.every((r) => r.householdId === 'family-a' && r.termId === 'term-one'));
const math = closed.academicRecords.find((r) => r.subject === 'Math');
assert.equal(math.childId, 'child-a');
assert.equal(math.mark, 'A');
assert.equal(math.credits, 1);
const reading = closed.academicRecords.find((r) => r.subject === 'Reading');
assert.equal(reading.childId, 'child-b');
assert.equal(reading.completionPercent, 67);
assert.equal(closed.reportCards.find((r) => r.childId === 'child-a').records.length, 1);
assert.equal(closed.reportCards.find((r) => r.childId === 'child-b').records.length, 1);
await closeLearnTerm(env, setup, 'term-one');
const snapshot = await loadLearnAcademicSnapshot(env, 'family-a');
assert.equal(snapshot.academicRecords.length, 2);
assert.equal(snapshot.reportCards.length, 2);
assert.deepEqual(await loadLearnAcademicSnapshot(env, 'family-b'), { academicRecords: [], reportCards: [] });
const fallback = await loadLearnAcademicSnapshot(
  {
    ...env,
    AGAPAY_DB: {
      prepare() {
        throw new Error('unavailable fixture');
      },
    },
  },
  'family-a'
);
assert.equal(fallback.academicRecords.length, 2);
records.set('__agapay_learn_academic_records:broken', 'not-json');
assert.deepEqual((await loadLearnAcademicSnapshot(env, 'broken')).academicRecords, []);
const transcripts = buildTranscriptsFromAcademicRecords({ ...setup, closedAcademicRecords: snapshot.academicRecords });
assert.equal(transcripts.find((r) => r.childId === 'child-a').credits, 1);
assert.equal(transcripts.find((r) => r.childId === 'child-b').credits, 0);
assert.equal(computeSubjectGrade({ percent: 200 }, 'percent'), '100%');
assert.equal(computeSubjectGrade({ percent: 0 }, 'letter-grade', 'Parent override'), 'Parent override');
const sqlEnv = {
  AGAPAY_DB: {
    prepare(sql) {
      return {
        bind(id) {
          assert.equal(id, 'family-a');
          return {
            async all() {
              return {
                results: sql.includes('learn_academic_records')
                  ? [
                      {
                        id: 'sql-authority',
                        child_id: 'child-a',
                        record_type: 'milestone',
                        occurred_on: '2026-01-01',
                        data: '{"id":"forged-json","childId":"foreign","subject":"Kept"}',
                      },
                    ]
                  : [],
              };
            },
          };
        },
      };
    },
  },
};
const sql = await loadLearnAcademicSnapshot(sqlEnv, 'family-a');
assert.equal(sql.academicRecords[0].id, 'sql-authority');
assert.equal(sql.academicRecords[0].childId, 'child-a');
assert.equal(sql.academicRecords[0].subject, 'Kept');
const html = renderReportCardTemplate({
  studentName: '<script>unsafe</script>',
  courses: [
    {
      courseTitle: '<b>Math</b>',
      grades: [{ termIndex: 1, letterGrade: 'A', teacherNotes: '<img src=x onerror=unsafe>' }],
    },
  ],
});
assert.ok(!html.includes('<script>unsafe'));
assert.ok(html.includes('&lt;script&gt;unsafe'));
assert.ok(html.includes('&lt;img src=x onerror=unsafe&gt;'));
const transcript = renderHighSchoolTranscriptTemplate({
  courses: [
    { courseTitle: 'High school', gradeLevel: 9, creditHours: 1, letterGrade: 'A' },
    { courseTitle: 'Excluded middle school', gradeLevel: 8, creditHours: 100, letterGrade: 'A' },
  ],
});
assert.ok(transcript.includes('High school'));
assert.ok(!transcript.includes('Excluded middle school'));
console.log(
  'PASS - term closure preserves child/household/term scope, grades/credits, idempotent KV persistence, D1-to-KV fallback, authoritative SQL identity, transcript grouping and escaped print output'
);
