import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { aggregateDiocesanStatistics, buildDiocesanStatisticsPdf } from '../src/reports/diocesan-statistics.js';
import { readWorkerCompositionSource } from './lib/worker-composition-source.mjs';

function d1Binding(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            first: async () => statement.get(...values),
            all: async () => ({ results: statement.all(...values) }),
            run: async () => statement.run(...values),
          };
        },
      };
    },
  };
}

const giving = async (_env, _parishId, year) => ({
  fiscal_year: year,
  total_actual_cents: 2500000,
  total_pledged_cents: 3000000,
  pledge_actual_cents: 2250000,
  active_donors: 42,
  pledging_donors: 35,
  fulfillment_rate_pct: 75,
  manual_income_cents: 100000,
});

const db = new DatabaseSync(':memory:');
try {
  db.exec(`
    CREATE TABLE parish_weekly_headcounts (
      id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, week_of TEXT NOT NULL, headcount INTEGER NOT NULL
    );
    CREATE TABLE sacrament_requests (
      id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, sacrament_type TEXT NOT NULL,
      status TEXT NOT NULL, confirmed_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE directory_people (
      id TEXT PRIMARY KEY, active INTEGER NOT NULL
    );
    CREATE TABLE directory_households (
      id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE directory_household_members (
      id TEXT PRIMARY KEY, household_id TEXT NOT NULL, person_id TEXT NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE directory_parish_affiliations (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, parish_id TEXT NOT NULL, status TEXT NOT NULL,
      joined_date TEXT, active INTEGER NOT NULL, created_at INTEGER NOT NULL
    );

    INSERT INTO parish_weekly_headcounts VALUES
      ('a1', 'full', '2025-01-05', 100),
      ('a2', 'full', '2025-01-12', 130),
      ('a3', 'full', '2024-12-29', 999);

    INSERT INTO sacrament_requests VALUES
      ('s1', 'full', 'baptism', 'completed', '2025-02-01', '2025-01-01', '2025-02-01'),
      ('s2', 'full', 'chrismation', 'completed', '2025-03-01', '2025-01-01', '2025-03-01'),
      ('s3', 'full', 'wedding', 'completed', '2025-04-01', '2025-01-01', '2025-04-01'),
      ('s4', 'full', 'funeral', 'completed', NULL, '2025-05-01', '2025-05-02'),
      ('s5', 'full', 'funeral', 'scheduled', '2025-06-01', '2025-01-01', '2025-06-01'),
      ('s6', 'full', 'baptism', 'completed', '2024-02-01', '2024-01-01', '2024-02-01');

    INSERT INTO directory_people VALUES ('p1', 1), ('p2', 1), ('p3', 1), ('inactive', 0), ('former', 1);
    INSERT INTO directory_households VALUES ('h1', 'full', 1), ('h2', 'full', 1), ('h3', 'full', 0);
    INSERT INTO directory_household_members VALUES
      ('hm1', 'h1', 'p1', 1), ('hm2', 'h1', 'p2', 1), ('hm3', 'h2', 'p3', 1),
      ('hm4', 'h3', 'inactive', 1), ('hm5', 'h2', 'former', 1);
    INSERT INTO directory_parish_affiliations VALUES
      ('af1', 'p1', 'full', 'member', '2026-01-06', 1, 1767657600000),
      ('af2', 'p2', 'full', 'catechumen', NULL, 1, 1735689600000),
      ('af3', 'p3', 'full', 'clergy', '2020-01-01', 1, 1577836800000),
      ('af4', 'inactive', 'full', 'member', '2020-01-01', 1, 1577836800000),
      ('af5', 'former', 'full', 'former_member', '2020-01-01', 1, 1577836800000),
      ('af6', 'p1', 'full', 'catechumen', '2025-01-05', 0, 1736035200000);
  `);

  const env = { AGAPAY_DB: d1Binding(db) };
  const full = await aggregateDiocesanStatistics(env, {
    parishId: 'full',
    year: 2025,
    givingSummaryLoader: giving,
  });
  assert.equal(full.attendance.status, 'reported');
  assert.equal(full.attendance.averageWeeklyAttendance, 115);
  assert.equal(full.attendance.weeksReported, 2);
  assert.equal(full.membership.people, 3);
  assert.equal(full.membership.households, 2);
  assert.equal(full.membership.catechumensMade, 2);
  assert.deepEqual(full.membership.statuses, { catechumen: 1, clergy: 1, member: 1 });
  assert.deepEqual(full.sacraments, { baptism: 1, chrismation: 1, wedding: 1, funeral: 1, total: 4 });
  assert.equal(full.giving.totalActualCents, 2500000);

  const empty = await aggregateDiocesanStatistics(env, {
    parishId: 'empty',
    year: 2025,
    givingSummaryLoader: giving,
  });
  assert.equal(empty.attendance.status, 'not_reported');
  assert.equal(empty.attendance.message, 'No attendance reported');
  assert.equal(empty.attendance.averageWeeklyAttendance, null);
  assert.equal(empty.attendance.weeksReported, 0);

  const fullPdf = await buildDiocesanStatisticsPdf({ parish: { parishName: 'St. Fiacre' }, report: full });
  const emptyPdf = await buildDiocesanStatisticsPdf({ parish: { parishName: 'Empty Parish' }, report: empty });
  assert.equal(Buffer.from(fullPdf).subarray(0, 5).toString(), '%PDF-');
  assert.equal(Buffer.from(emptyPdf).subarray(0, 5).toString(), '%PDF-');
  assert.ok(fullPdf.length > 1500);
  assert.ok(emptyPdf.length > 1500);

  const route = readFileSync(new URL('../src/routes/stewardship.js', import.meta.url), 'utf8');
  const worker = readWorkerCompositionSource();
  const dashboard = readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
  const reports = readFileSync(new URL('../public/parish/features/stewardship/reports.js', import.meta.url), 'utf8');
  assert.match(route, /\/reports\/diocesan-statistics/);
  assert.match(worker, /handleDiocesanStatisticsReport/);
  assert.match(dashboard, /id="diocesanStatisticsMount"/);
  assert.match(reports, /Annual Statistical Report/);
  assert.match(reports, /No attendance reported/);
  assert.match(reports, /method: 'POST'/);

  console.log('PASS - diocesan annual aggregation, explicit missing attendance, funeral count, PDF, and UI wiring');
} finally {
  db.close();
}
