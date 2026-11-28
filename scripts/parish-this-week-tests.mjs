import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { issueParishDashboardSession } from '../src/lib/core.js';
import { issuePlatformUserSession } from '../src/lib/identity.js';
import { routeParishRequest } from '../src/routes/parish.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';

const database = new DatabaseSync(':memory:');
database.exec('CREATE TABLE directory_ministries(id TEXT PRIMARY KEY, parish_id TEXT, display_name TEXT, status TEXT)');
for (const migration of [
  '0001_production_records',
  '0009_parish_commerce',
  '0020_platform_identity',
  '0092_koinonia_signups_and_exchange',
  '0093_ministry_workspace',
  '0099_parish_commerce_events',
  '0100_commerce_events_ministry_ownership',
  '0103_commerce_calendar_publication',
  '0106_privileged_mfa',
]) {
  database.exec(readFileSync(new URL(`../migrations/${migration}.sql`, import.meta.url), 'utf8'));
}

const env = {
  AGAPAY_ENVIRONMENT: 'test',
  PRIVILEGED_MFA_REQUIRED: 'true',
  AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  AGAPAY_DB: {
    prepare(sql) {
      const statement = database.prepare(sql);
      let parameters = [];
      return {
        bind(...values) {
          parameters = /\?\d/.test(sql)
            ? [Object.fromEntries(values.map((value, index) => ['?' + (index + 1), value]))]
            : values;
          return this;
        },
        async first() {
          return statement.get(...parameters) || null;
        },
        async all() {
          return { results: statement.all(...parameters) };
        },
        async run() {
          return { success: true, meta: statement.run(...parameters) };
        },
      };
    },
  },
};

const calendarUrl = 'https://calendar.example.com/parish.ics';
const owner = await issueParishDashboardSession({
  parishId: 'local',
  parishName: 'Local Parish',
  subscriptionTier: 'parish',
  subscriptionStatus: 'active',
  timezone: 'America/Chicago',
  koinoniaCalendarUrl: calendarUrl,
});
const staff = await issueParishDashboardSession(owner.registration, { accessType: 'staff' });
const timestamp = new Date().toISOString();
database
  .prepare('INSERT INTO registrations(reference,parish_id,data,updated_at,received_at) VALUES(?,?,?,?,?)')
  .run('local-ref', 'local', JSON.stringify(staff.registration), timestamp, timestamp);

const eventTime = Date.parse('2026-03-09T03:00:00Z'); // Sunday evening in Chicago after the DST transition.
const nextWeek = Date.parse('2026-03-09T05:00:00Z');
database.exec(`
  INSERT INTO directory_ministries VALUES ('choir','local','Choir','active'), ('outreach','elsewhere','Outreach','active');
  INSERT INTO koinonia_ministry_events(id,parish_id,ministry_id,title,starts_at,created_by_person_id,created_at,updated_at)
  VALUES ('choir-rehearsal','local','choir','Choir rehearsal',${eventTime},'person-private',0,0),
         ('other-rehearsal','elsewhere','outreach','Other parish rehearsal',${eventTime},'other-private',0,0),
         ('next-rehearsal','local','choir','Next week rehearsal',${nextWeek},'person-private',0,0);
  INSERT INTO koinonia_signup_sheets(id,parish_id,ministry_id,title,status,created_by_person_id,updated_by_person_id,created_at,updated_at)
  VALUES ('sunday','local','choir','Liturgy','open','person-private','person-private',0,0),
         ('closed','local','choir','Liturgy','closed','person-private','person-private',0,0),
         ('other-signups','elsewhere','outreach','Other parish signup','open','other-private','other-private',0,0);
  INSERT INTO koinonia_signup_slots(id,sheet_id,parish_id,label,needed_count,slot_date,created_at,updated_at)
  VALUES ('reader','sunday','local','Epistle reader',3,${eventTime},0,0),
         ('past-closed','closed','local','Choir setup',2,${eventTime},0,0),
         ('other-slot','other-signups','elsewhere','Other volunteer',2,${eventTime},0,0);
  INSERT INTO koinonia_signup_entries(id,slot_id,parish_id,person_id,comment,status,created_at,updated_at)
  VALUES ('current','reader','local','person-private','private comment','confirmed',0,0),
         ('cancelled','reader','local','other-volunteer','private comment','cancelled',0,0);
  INSERT INTO koinonia_signup_coverage_requests(id,parish_id,entry_id,requester_person_id,note,created_at,updated_at)
  VALUES ('cover','local','current','person-private','private note',0,0),
         ('not-counted','local','cancelled','other-volunteer','private note',0,0);
  INSERT INTO commerce_products(id,parish_id,name,commerce_module,status,event_date,show_on_calendar)
  VALUES ('workshop','local','Parish workshop','events','active','2026-03-07',1),
         ('private','local','Unpublished event','events','active','2026-03-07',0);
  INSERT INTO platform_users(id,email) VALUES ('staff','staff@example.com');
  INSERT INTO parish_memberships(id,user_id,parish_id,status) VALUES ('membership','staff','local','active');
`);
const staffIdentity = await issuePlatformUserSession(env, 'staff', { mfaVerifiedAt: timestamp });

const url = 'https://parish.test/api/parish/dashboard/local/this-week';
function load(token, { week = '2026-03-02', email, method = 'GET' } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (email) headers.set('X-AGAPAY-User-Email', email);
  const request = new Request(`${url}?week=${week}`, { method, headers });
  return routeParishRequest({ request, env, url: new URL(request.url) });
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (requested) => {
    assert.equal(requested, calendarUrl);
    return new Response(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:fast',
        'DTSTART;VALUE=DATE:20260302',
        'SUMMARY:All-day observance',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:vespers',
        'DTSTART:20260309T023000Z',
        'SUMMARY:Vespers',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
    );
  };
  assert.equal((await load(null)).status, 401);
  assert.equal((await load(staff.token)).status, 401);
  assert.equal((await load(owner.token, { method: 'POST' })).status, 405);
  assert.equal((await load(owner.token, { week: '2026-03-03' })).status, 422);
  assert.equal((await load(owner.token, { week: '2026-02-30' })).status, 422);

  const response = await load(owner.token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  const view = await response.json();
  assert.equal(view.weekEnd, '2026-03-08');
  assert.equal(view.calendarState, 'connected');
  assert.deepEqual(
    view.events.map(({ title, day, kind }) => [title, day, kind]),
    [
      ['All-day observance', '2026-03-02', 'calendar'],
      ['Parish workshop', '2026-03-07', 'registration'],
      ['Vespers', '2026-03-08', 'calendar'],
      ['Choir rehearsal', '2026-03-08', 'ministry'],
    ]
  );
  assert.deepEqual(
    view.serving.map(({ id, day, confirmed, open, coverage }) => [id, day, confirmed, open, coverage]),
    [
      ['past-closed', '2026-03-08', 0, 0, 0],
      ['reader', '2026-03-08', 1, 2, 1],
    ]
  );
  assert.doesNotMatch(JSON.stringify(view), /person-private|private comment|private note/);

  const auth = { email: 'staff@example.com' };
  const limited = await (await load(staffIdentity.token, auth)).json();
  assert.deepEqual(
    limited.events.map(({ kind }) => kind),
    ['calendar', 'registration', 'calendar']
  );
  assert.deepEqual(limited.serving, []);
  database.exec(
    "INSERT INTO membership_capabilities(id,membership_id,capability) VALUES ('cap','membership','communications.manage')"
  );
  const coordinator = await (await load(staffIdentity.token, auth)).json();
  assert.equal(coordinator.serving.length, 2);
  database.exec("UPDATE parish_memberships SET status='revoked' WHERE id='membership'");
  assert.equal((await load(staffIdentity.token, auth)).status, 401);

  globalThis.fetch = async () => new Response('', { status: 503 });
  const offlineCalendar = await (await load(owner.token)).json();
  assert.equal(offlineCalendar.calendarState, 'unavailable');
  assert.deepEqual(
    offlineCalendar.events.map(({ kind }) => kind),
    ['registration', 'ministry']
  );
  assert.equal(offlineCalendar.serving.length, 2);
  database
    .prepare("UPDATE registrations SET data=json_set(data, '$.subscriptionTier', 'giving') WHERE parish_id='local'")
    .run();
  const givePlus = await (await load(owner.token)).json();
  assert.deepEqual(
    givePlus.events.map(({ kind }) => kind),
    ['ministry']
  );
  assert.equal(givePlus.serving.length, 2);
  database
    .prepare("UPDATE registrations SET data=json_set(data, '$.subscriptionTier', 'starter') WHERE parish_id='local'")
    .run();
  assert.equal((await load(owner.token)).status, 403);
  console.log(
    'PASS - parish week calendar, daylight-saving boundary, signup and coverage counts, and staff permissions'
  );
} finally {
  globalThis.fetch = originalFetch;
  database.close();
}
