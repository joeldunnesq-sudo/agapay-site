import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPastoralFollowup,
  defaultNextPastoralDueOn,
  findPastoralFollowup,
  listPastoralFollowupCandidates,
  listPastoralFollowups,
  recordPastoralContact,
  updatePastoralFollowup,
} from '../src/sacraments/pastoral-followup.js';
import {
  buildMemorialSchedule,
  listMemorialMarkers,
  materializeMemorialAnniversaries,
  recordRepose,
  scheduleMemorialService,
  updateMemorialMarker,
} from '../src/sacraments/memorial-followup.js';
import { inspectStorage } from '../src/portability/catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
for (const migration of [
  '0022_directory_canonical_foundation.sql',
  '0023_directory_contact_privacy_publication.sql',
  '0008_sacrament_requests.sql',
  '0119_sacrament_pastoral_followup.sql',
  '0120_sacrament_memorial_ticklers.sql',
])
  sqlite.exec(readFileSync(path.join(root, 'migrations', migration), 'utf8'));

function statement(sql) {
  return {
    parameters: [],
    bind(...parameters) {
      this.parameters = parameters;
      return this;
    },
    async first() {
      return sqlite.prepare(sql).get(...this.parameters) || null;
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...this.parameters) };
    },
    async run() {
      const result = sqlite.prepare(sql).run(...this.parameters);
      return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
    },
  };
}

const env = {
  AGAPAY_DB: {
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const prepared of statements) results.push(await prepared.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

const now = Date.now();
sqlite
  .prepare(
    `INSERT INTO directory_people
  (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, created_at, updated_at)
  VALUES (?, ?, ?, 'unknown', 0, 1, ?, ?)`
  )
  .run('person-a', 'parish-a', 'Mary Adams', now, now);
sqlite
  .prepare(
    `INSERT INTO directory_people
  (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, created_at, updated_at)
  VALUES (?, ?, ?, 'unknown', 0, 1, ?, ?)`
  )
  .run('person-shared', 'parish-b', 'John Shared', now, now);
sqlite
  .prepare(
    `INSERT INTO directory_people
  (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, created_at, updated_at)
  VALUES (?, ?, ?, 'unknown', 0, 1, ?, ?)`
  )
  .run('person-b', 'parish-b', 'Not Parish A', now, now);
sqlite
  .prepare(
    `INSERT INTO directory_parish_affiliations
  (id, person_id, parish_id, status, active, created_at, updated_at)
  VALUES ('aff-shared', 'person-shared', 'parish-a', 'member', 1, ?, ?)`
  )
  .run(now, now);
sqlite
  .prepare(
    `INSERT INTO directory_contact_methods
  (id, parish_id, owner_type, owner_id, contact_type, label, value, normalized_value,
   is_primary, verified, visibility, active, created_at, updated_at)
  VALUES ('phone-a', 'parish-a', 'person', 'person-a', 'phone', 'mobile', '555-0101',
   '5550101', 1, 0, 'clergy', 1, ?, ?)`
  )
  .run(now, now);

const candidates = await listPastoralFollowupCandidates(env, 'parish-a', '');
assert.deepEqual(
  candidates.map((row) => row.id),
  ['person-shared', 'person-a']
);
assert.equal(candidates.find((row) => row.id === 'person-a').phone, '555-0101');
assert.deepEqual(
  (await listPastoralFollowupCandidates(env, 'parish-a', 'mary')).map((row) => row.id),
  ['person-a']
);

let followup = await createPastoralFollowup(env, {
  parishId: 'parish-a',
  personId: 'person-a',
  assignedPriestName: 'Fr. Thomas',
  assignedPriestEmail: 'FATHER@example.test',
  reason: 'homebound',
  cadenceDays: 30,
  nextDueOn: '2026-09-02',
  note: 'Monthly check-in',
  actor: 'office@example.test',
});
assert.equal(followup.personName, 'Mary Adams');
assert.equal(followup.assignedPriestEmail, 'father@example.test');
assert.equal(followup.contactPhone, '555-0101');
assert.equal(followup.contactCount, 0);
await assert.rejects(
  () =>
    createPastoralFollowup(env, {
      parishId: 'parish-a',
      personId: 'person-a',
      assignedPriestName: 'Fr. Thomas',
      nextDueOn: '2026-09-03',
    }),
  /already has/
);
await assert.rejects(
  () =>
    createPastoralFollowup(env, {
      parishId: 'parish-a',
      personId: 'person-b',
      assignedPriestName: 'Fr. Thomas',
      nextDueOn: '2026-09-03',
    }),
  /not active in this parish/
);
assert.equal(await findPastoralFollowup(env, 'parish-b', followup.id), null, 'follow-ups must be tenant scoped');

followup = await recordPastoralContact(env, {
  parishId: 'parish-a',
  followupId: followup.id,
  contactType: 'phone',
  contactedAt: '2026-09-01T16:00:00.000Z',
  nextDueOn: '2026-10-01',
  summary: 'Spoke briefly',
  actor: 'father@example.test',
});
assert.equal(followup.contactCount, 1);
assert.equal(followup.lastContactType, 'phone');
assert.equal(followup.nextDueOn, '2026-10-01');
await assert.rejects(
  () =>
    recordPastoralContact(env, {
      parishId: 'parish-a',
      followupId: followup.id,
      contactType: 'phone',
      contactedAt: 'not-a-date',
      nextDueOn: '2026-10-02',
    }),
  /valid contact date/
);

followup = await updatePastoralFollowup(env, {
  parishId: 'parish-a',
  id: followup.id,
  assignedPriestName: 'Fr. Nicholas',
  assignedPriestEmail: 'nicholas@example.test',
  nextDueOn: '2026-10-08',
  cadenceDays: 14,
});
assert.equal(followup.assignedPriestName, 'Fr. Nicholas');
assert.equal(followup.cadenceDays, 14);

followup = await updatePastoralFollowup(env, {
  parishId: 'parish-a',
  id: followup.id,
  action: 'close',
  closureOutcome: 'care_transferred',
  closureReason: 'Moved to family care',
  actor: 'nicholas@example.test',
});
assert.equal(followup.status, 'closed');
assert.equal(followup.nextDueOn, '');
assert.equal(followup.closureOutcome, 'care_transferred');

followup = await updatePastoralFollowup(env, {
  parishId: 'parish-a',
  id: followup.id,
  nextDueOn: '2026-10-15',
});
assert.equal(followup.status, 'active');
assert.equal(followup.closedAt, '');
assert.equal((await listPastoralFollowups(env, 'parish-a')).length, 1);
assert.equal(defaultNextPastoralDueOn('2026-09-01T16:00:00.000Z', 30), '2026-10-01');
assert.deepEqual(
  buildMemorialSchedule('2026-09-01', ['third_day', 'ninth_day', 'fortieth_day']).map((marker) => marker.targetDate),
  ['2026-09-03', '2026-09-09', '2026-10-10']
);
const repose = await recordRepose(env, {
  parishId: 'parish-a',
  followupId: followup.id,
  reposedOn: '2026-09-01',
  markerTypes: ['third_day', 'ninth_day', 'fortieth_day', 'six_month', 'first_anniversary'],
  annualEnabled: true,
  actor: 'nicholas@example.test',
});
assert.equal(repose.markers.length, 5);
assert.equal(sqlite.prepare('SELECT deceased FROM directory_people WHERE id = ?').get('person-a').deceased, 1);
assert.equal(sqlite.prepare('SELECT reposed_on FROM directory_people WHERE id = ?').get('person-a').reposed_on, '2026-09-01');
followup = await findPastoralFollowup(env, 'parish-a', followup.id);
assert.equal(followup.closureOutcome, 'reposed');
await assert.rejects(
  () => recordRepose(env, { parishId: 'parish-a', followupId: followup.id, reposedOn: '2026-09-01' }),
  /Reopen this follow-up/
);
let memorials = await listMemorialMarkers(env, 'parish-a');
const fortieth = memorials.find((marker) => marker.markerType === 'fortieth_day');
const scheduled = await scheduleMemorialService(env, {
  parishId: 'parish-a',
  markerId: fortieth.id,
  scheduledFor: '2026-10-11',
  confirmedTime: '10:00 AM',
  actor: 'nicholas@example.test',
});
assert.equal(scheduled.marker.status, 'scheduled');
assert.equal(scheduled.request.request_source, 'pastoral_memorial');
assert.equal(scheduled.request.person_id, 'person-a');
await assert.rejects(
  () => scheduleMemorialService(env, { parishId: 'parish-b', markerId: fortieth.id, scheduledFor: '2026-10-11' }),
  /not found/
);
const ninth = memorials.find((marker) => marker.markerType === 'ninth_day');
assert.equal((await updateMemorialMarker(env, { parishId: 'parish-a', markerId: ninth.id, status: 'skipped', note: 'Family request' })).status, 'skipped');
assert.ok((await materializeMemorialAnniversaries(env, Date.UTC(2028, 7, 5))).created >= 1);
memorials = await listMemorialMarkers(env, 'parish-a');
assert.ok(memorials.some((marker) => marker.markerKey === 'annual_2028'));

const pastoralInventory = (await inspectStorage(env.AGAPAY_DB)).filter((table) =>
  table.name.startsWith('sacrament_pastoral_') || table.name.startsWith('sacrament_memorial_')
);
assert.deepEqual(
  pastoralInventory.map((table) => table.name),
  [
    'sacrament_memorial_cycles',
    'sacrament_memorial_markers',
    'sacrament_pastoral_contacts',
    'sacrament_pastoral_followups',
  ]
);
assert.ok(pastoralInventory.every((table) => table.classification === 'parish'));
assert.match(pastoralInventory.find((table) => table.name === 'sacrament_pastoral_contacts').scope, /followup_id/);

const route = readFileSync(path.join(root, 'src', 'routes', 'parish.js'), 'utf8');
const worker = readFileSync(path.join(root, 'src', 'worker.js'), 'utf8');
const parishSacramentsHandler = readFileSync(path.join(root, 'src', 'handlers', 'parish-sacraments.js'), 'utf8');
const dashboard = readFileSync(path.join(root, 'public', 'parish', 'dashboard.html'), 'utf8');
const feature = readFileSync(
  path.join(root, 'public', 'parish', 'features', 'sacraments', 'pastoral-followup.js'),
  'utf8'
);
assert.match(route, /handleParishPastoralFollowUp/);
assert.match(worker, /handleParishPastoralFollowUp/);
assert.match(dashboard, /data-sac-tab="follow-up"/);
assert.match(feature, /Log contact/);
assert.match(feature, /Schedule visit/);
assert.match(feature, /Close after this contact/);
assert.match(feature, /Recovered \/ no routine follow-up needed/);
assert.match(feature, /Date of repose/);
assert.match(feature, /Memorial observances/);
assert.match(worker, /memorial_anniversary_materialization/);
assert.match(worker, /assigned_priest_email/);
assert.match(worker, /Memorial observances to arrange/);
assert.match(parishSacramentsHandler, /updated\.request_source === "pastoral_memorial"/);
assert.match(parishSacramentsHandler, /updated\.request_source !== "pastoral_memorial"/);

console.log('PASS - Pastoral follow-up closes with outcomes and creates scoped repose memorial ticklers and services');
