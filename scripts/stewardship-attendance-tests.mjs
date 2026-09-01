import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  getParishAttendanceTrend,
  saveParishWeeklyHeadcount,
  setAttendanceDelegate,
  sundayOnOrBefore,
  validateAttendanceWeek,
  validateHeadcount,
} from '../src/stewardship/attendance.js';
import { GroupMessageAccessError, recordDelegatedParishHeadcount } from '../src/handlers/donor-groups.js';

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
        first: async () => statement.get(),
        all: async () => ({ results: statement.all() }),
        run: async () => statement.run(),
      };
    },
  };
}

const db = new DatabaseSync(':memory:');
try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE parish_stewardship_settings (
      parish_id TEXT PRIMARY KEY,
      has_stewardship_suite INTEGER NOT NULL DEFAULT 0,
      stripe_subscription_item_id TEXT,
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE directory_ministries (
      id TEXT PRIMARY KEY,
      parish_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );
    CREATE TABLE directory_ministry_leaders (
      id TEXT PRIMARY KEY,
      parish_id TEXT NOT NULL,
      ministry_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  db.exec(readFileSync(new URL('../migrations/0116_parish_weekly_headcounts.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO parish_stewardship_settings(parish_id,has_stewardship_suite) VALUES (?,1)').run('parish-a');
  db.prepare("INSERT INTO directory_ministries VALUES ('council','parish-a','Parish Council',1,'active')").run();
  db.prepare("INSERT INTO directory_ministries VALUES ('choir','parish-a','Choir',2,'active')").run();
  db.prepare("INSERT INTO directory_ministry_leaders VALUES ('leader-1','parish-a','council','person-leader',1)").run();
  const env = { AGAPAY_DB: d1Binding(db) };

  const currentSunday = sundayOnOrBefore();
  const priorSunday = new Date(`${currentSunday}T00:00:00.000Z`);
  priorSunday.setUTCDate(priorSunday.getUTCDate() - 7);
  const priorWeek = priorSunday.toISOString().slice(0, 10);

  assert.equal(validateAttendanceWeek(currentSunday), currentSunday);
  assert.throws(() => validateAttendanceWeek('2026-08-31'), /Sunday/);
  assert.equal(validateHeadcount(0), 0, 'an intentional zero remains a valid measured headcount');
  assert.throws(() => validateHeadcount(''), /whole number/, 'a missing value must not become a measured zero');
  assert.throws(() => validateHeadcount(null), /whole number/, 'a null value must not become a measured zero');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO parish_weekly_headcounts
            (id, parish_id, week_of, headcount, submitted_by_actor_type, submitted_by_actor_id)
           VALUES ('invalid-date', 'parish-a', 'not-a-date', 1, 'parish_staff', 'staff')`
        )
        .run(),
    /CHECK constraint failed/,
    'the database rejects malformed week dates even when SQLite date() returns NULL'
  );
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO parish_weekly_headcounts
            (id, parish_id, week_of, headcount, submitted_by_actor_type, submitted_by_actor_id)
           VALUES ('missing-ministry', 'parish-a', ?, 1, 'ministry_leader', 'leader')`
        )
        .run(priorWeek),
    /CHECK constraint failed/,
    'the database requires ministry provenance for leader submissions'
  );

  await saveParishWeeklyHeadcount(env, {
    parishId: 'parish-a',
    weekOf: currentSunday,
    headcount: 120,
    actorType: 'parish_staff',
    actorId: 'dashboard-ref',
  });
  await saveParishWeeklyHeadcount(env, {
    parishId: 'parish-a',
    weekOf: currentSunday,
    headcount: 135,
    actorType: 'parish_staff',
    actorId: 'dashboard-ref',
  });
  const savedRows = db
    .prepare('SELECT * FROM parish_weekly_headcounts WHERE parish_id=? AND week_of=?')
    .all('parish-a', currentSunday);
  assert.equal(savedRows.length, 1, 'same-Sunday correction updates instead of duplicating');
  assert.equal(savedRows[0].headcount, 135);
  assert.equal(savedRows[0].submitted_by_actor_type, 'parish_staff');

  await setAttendanceDelegate(env, { parishId: 'parish-a', ministryId: 'council' });
  const leaderSaved = await recordDelegatedParishHeadcount(
    new Request('https://agapay.test/api/donor/groups/council/headcount', {
      method: 'PATCH',
      body: JSON.stringify({ weekOf: priorWeek, headcount: 99 }),
    }),
    env,
    { parishId: 'parish-a', personId: 'person-leader' },
    'council'
  );
  assert.equal(leaderSaved.headcount, 99);
  const delegatedRow = db.prepare('SELECT * FROM parish_weekly_headcounts WHERE week_of=?').get(priorWeek);
  assert.equal(delegatedRow.submitted_by_actor_type, 'ministry_leader');
  assert.equal(delegatedRow.submitted_by_ministry_id, 'council');

  await assert.rejects(
    recordDelegatedParishHeadcount(
      new Request('https://agapay.test/api/donor/groups/council/headcount', {
        method: 'PATCH',
        body: JSON.stringify({ weekOf: priorWeek, headcount: 88 }),
      }),
      env,
      { parishId: 'parish-a', personId: 'person-member' },
      'council'
    ),
    (error) => error instanceof GroupMessageAccessError && error.status === 403,
    'non-leader ministry members cannot submit parish attendance'
  );

  const trend = await getParishAttendanceTrend(env, { parishId: 'parish-a', weeks: 13 });
  assert.equal(trend.points.length, 13);
  assert.equal(trend.summary.weeksReported, 2);
  assert.equal(trend.summary.latestHeadcount, 135);
  assert.equal(trend.delegate.ministryId, 'council');
  assert.ok(
    trend.points.some((point) => point.headcount === null),
    'missing Sundays remain explicit gaps'
  );

  await setAttendanceDelegate(env, { parishId: 'parish-a', ministryId: null });
  assert.equal(
    db
      .prepare('SELECT headcount_delegate_ministry_id FROM parish_stewardship_settings WHERE parish_id=?')
      .get('parish-a').headcount_delegate_ministry_id,
    null
  );
  assert.equal(
    db.prepare('SELECT count(*) AS count FROM parish_weekly_headcounts WHERE parish_id=?').get('parish-a').count,
    2,
    'removing delegation preserves parish history'
  );

  const dashboard = readFileSync(new URL('../public/parish/dashboard.html', import.meta.url), 'utf8');
  const metrics = readFileSync(new URL('../public/parish/features/stewardship/metrics.js', import.meta.url), 'utf8');
  const groups = readFileSync(new URL('../public/myagapay/groups.js', import.meta.url), 'utf8');
  assert.match(dashboard, /id="stewardshipAttendanceMount"/);
  assert.ok(
    dashboard.indexOf('stewardshipAttendanceMount') < dashboard.indexOf('Stewardship Reports'),
    'attendance mount appears before reports'
  );
  assert.match(metrics, /id="stewardshipAttendancePane"/);
  assert.match(metrics, /function swTrendChart\(points\)/);
  assert.match(metrics, /typeof point\.headcount === 'number'/);
  assert.match(groups, /group\?\.headcountDelegated\|\|group\.role!==\'leader\'/);

  console.log('PASS - parish-owned attendance upserts, delegation, leader gate, gaps, trend summary, and UI wiring');
} finally {
  db.close();
}
