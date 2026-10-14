import { buildReportCardExport } from '../../src/learn/academic-exports.js';
import { calculateCumulativeGPA } from '../../src/learn/gpa.js';
import { SeedLiturgicalSource } from '../../src/learn/liturgical-source.js';
import { applyPlannerOverrides } from '../../src/learn/planner-overrides.js';
void calculateCumulativeGPA([{ creditHours: 1, grade: { letter_grade: 'A' } }]);
void new SeedLiturgicalSource({ liturgicalWeek: { julian: [{ civilDate: '2026-10-14' }] } });
void applyPlannerOverrides([{ id: 'row', title: 'Lesson' }], { row: { '0': { action: 'reserve' } } });
// @ts-expect-error Academic exports require records and child identity.
void buildReportCardExport({ id: 'report' });
// @ts-expect-error Planner rows require an identity.
void applyPlannerOverrides([{ title: 'Lesson' }]);
// @ts-expect-error Calendar dates are string identifiers.
void new SeedLiturgicalSource({ liturgicalWeek: { julian: [{ civilDate: 42 }] } });
