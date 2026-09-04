import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkerCompositionSource } from './lib/worker-composition-source.mjs';
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
import {
  buildPastoralDigestGroups,
  sendDailyPastoralCareDigestEmails,
} from '../src/sacraments/pastoral-digest.js';
import { inspectStorage } from '../src/portability/catalog.js';
import { CAPABILITY_CATALOG, ROLE_TEMPLATES } from '../src/lib/authorization.js';
import { issueParishDashboardSession } from '../src/lib/core.js';
import { handleParishPastoralFollowUp } from '../src/handlers/parish-pastoral-followup.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
for (const migration of [
  '0001_production_records.sql',
  '0020_platform_identity.sql',
  '0022_directory_canonical_foundation.sql',
  '0023_directory_contact_privacy_publication.sql',
  '0008_sacrament_requests.sql',
  '0119_sacrament_pastoral_followup.sql',
  '0120_sacrament_memorial_ticklers.sql',
  '0121_sacrament_clergy_care_scope.sql',
  '0122_sacrament_pastoral_digest_delivery.sql',
  '0123_priest_pastoral_coverage.sql',
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

sqlite.prepare(`INSERT INTO parish_memberships (id, user_id, parish_id, role_template, status) VALUES (?, ?, ?, ?, 'active')`).run('membership-priest', 'user-priest', 'parish-a', 'priest');
sqlite.prepare(`INSERT INTO parish_memberships (id, user_id, parish_id, role_template, status) VALUES (?, ?, ?, ?, 'active')`).run('membership-rector', 'user-rector', 'parish-a', 'rector');
sqlite.exec(readFileSync(path.join(root, 'migrations', '0121_sacrament_clergy_care_scope.sql'), 'utf8'));
sqlite.exec(readFileSync(path.join(root, 'migrations', '0123_priest_pastoral_coverage.sql'), 'utf8'));
assert.deepEqual(
  sqlite.prepare('SELECT capability FROM membership_capabilities WHERE membership_id = ? ORDER BY capability').all('membership-priest').map((row) => row.capability),
  ['sacraments.pastoral.coverage', 'sacraments.pastoral.manage_own']
);
assert.deepEqual(
  sqlite.prepare('SELECT capability FROM membership_capabilities WHERE membership_id = ? ORDER BY capability').all('membership-rector').map((row) => row.capability),
  ['sacraments.pastoral.coverage', 'sacraments.pastoral.manage_own']
);

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
    `INSERT INTO directory_people
  (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, created_at, updated_at)
  VALUES (?, ?, ?, 'unknown', 0, 1, ?, ?)`
  )
  .run('person-repose', 'parish-a', 'Helen Repose', now, now);
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
  ['person-repose', 'person-shared', 'person-a']
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

const dashboardSession = await issueParishDashboardSession({
  parishId: 'parish-a',
  parishName: 'St. Test Parish',
  subscriptionTier: 'parish',
  sacramentsEnabled: true,
  sacramentPriests: [
    { name: 'Fr. Thomas', email: 'father@example.test' },
    { name: 'Fr. Nicholas', email: 'nicholas@example.test' },
  ],
  parishDashboardSessions: [],
});
sqlite.prepare(`INSERT INTO registrations
  (reference, parish_id, status, parish_name, received_at, updated_at, data)
  VALUES (?, ?, 'verified', ?, datetime('now'), datetime('now'), ?)`)
  .run('registration-parish-a', 'parish-a', 'St. Test Parish', JSON.stringify(dashboardSession.registration));
const dashboardResponse = await handleParishPastoralFollowUp(
  new Request('https://agapay.app/api/parish/dashboard/parish-a/sacraments/follow-up?scope=mine', {
    headers: { Authorization: `Bearer ${dashboardSession.token}` },
  }),
  env,
  'parish-a'
);
assert.equal(dashboardResponse.status, 200, 'the normal parish dashboard session must open Follow-up');
const dashboardPayload = await dashboardResponse.json();
assert.equal(dashboardPayload.access.dashboardSession, true);
assert.equal(dashboardPayload.access.scope, 'all', 'a parish dashboard session sees the full clergy coverage list');
assert.equal(dashboardPayload.access.canCover, true);
assert.equal(dashboardPayload.followups.length, 1);

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
assert.equal((await listPastoralFollowups(env, 'parish-a', 'nicholas@example.test')).length, 1);
assert.equal((await listPastoralFollowups(env, 'parish-a', 'other@example.test')).length, 0);
assert.equal(defaultNextPastoralDueOn('2026-09-01T16:00:00.000Z', 30), '2026-10-01');
assert.deepEqual(
  buildMemorialSchedule('2026-09-01', ['third_day', 'ninth_day', 'fortieth_day']).map((marker) => marker.targetDate),
  ['2026-09-03', '2026-09-09', '2026-10-10']
);
await assert.rejects(
  () => recordRepose(env, {
    parishId: 'parish-a',
    personId: 'person-a',
    assignedPriestName: 'Fr. Nicholas',
    assignedPriestEmail: 'nicholas@example.test',
    reposedOn: '2026-09-01',
  }),
  /already has a pastoral follow-up/
);
await assert.rejects(
  () => recordRepose(env, {
    parishId: 'parish-a',
    personId: 'person-b',
    assignedPriestName: 'Fr. Nicholas',
    assignedPriestEmail: 'nicholas@example.test',
    reposedOn: '2026-09-01',
  }),
  /active person from this parish directory/
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
const standaloneRepose = await recordRepose(env, {
  parishId: 'parish-a',
  personId: 'person-repose',
  assignedPriestName: 'Fr. Nicholas',
  assignedPriestEmail: 'nicholas@example.test',
  reposedOn: '2026-09-02',
  markerTypes: ['third_day', 'fortieth_day'],
  annualEnabled: false,
  actor: 'nicholas@example.test',
});
assert.equal(standaloneRepose.markers.length, 2);
assert.equal(sqlite.prepare('SELECT followup_id FROM sacrament_memorial_cycles WHERE person_id = ?').get('person-repose').followup_id, null);
assert.equal(sqlite.prepare('SELECT deceased FROM directory_people WHERE id = ?').get('person-repose').deceased, 1);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sacrament_pastoral_followups WHERE person_id = ?').get('person-repose').count, 0);
assert.deepEqual(standaloneRepose.markers.map((marker) => marker.targetDate), ['2026-09-04', '2026-10-11']);
assert.equal((await listMemorialMarkers(env, 'parish-a', 'other@example.test')).length, 0);
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

const groupedDigest = buildPastoralDigestGroups([
  { id: 'due-a', assigned_priest_email: 'FATHER@example.test', preferred_name: 'Due Today', reason: 'homebound', next_due_on: '2026-09-02' },
  { id: 'overdue-a', assigned_priest_email: 'father@example.test', preferred_name: 'Overdue Person', reason: 'hospitalized', next_due_on: '2026-08-31' },
  { id: 'upcoming-a', assigned_priest_email: 'father@example.test', preferred_name: 'Upcoming Person', reason: 'regular_check_in', next_due_on: '2026-09-09' },
  { id: 'future-a', assigned_priest_email: 'father@example.test', preferred_name: 'Later Person', reason: 'other', next_due_on: '2026-09-10' },
  { id: 'due-b', assigned_priest_email: 'nicholas@example.test', preferred_name: 'Other Assignment', reason: 'bereavement', next_due_on: '2026-09-02' },
  { id: 'unassigned', assigned_priest_email: '', preferred_name: 'Unassigned Person', reason: 'other', next_due_on: '2026-09-02' },
], '2026-09-02');
assert.equal(groupedDigest.length, 2);
assert.deepEqual(
  groupedDigest.find((group) => group.recipientEmail === 'father@example.test'),
  {
    recipientEmail: 'father@example.test',
    assignedPriestName: '',
    overdue: [{ id: 'overdue-a', personName: 'Overdue Person', reason: 'hospitalized', nextDueOn: '2026-08-31' }],
    dueToday: [{ id: 'due-a', personName: 'Due Today', reason: 'homebound', nextDueOn: '2026-09-02' }],
    upcoming: [{ id: 'upcoming-a', personName: 'Upcoming Person', reason: 'regular_check_in', nextDueOn: '2026-09-09' }],
    total: 3,
    today: '2026-09-02',
    upcomingThrough: '2026-09-09',
  }
);

for (const [id, name] of [
  ['person-digest-overdue', 'Anna Overdue'],
  ['person-digest-today', 'Basil Today'],
  ['person-digest-upcoming', 'Clara Upcoming'],
  ['person-digest-other', 'Demetri Other'],
]) {
  sqlite.prepare(`INSERT INTO directory_people
    (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, created_at, updated_at)
    VALUES (?, 'parish-a', ?, 'unknown', 0, 1, ?, ?)`)
    .run(id, name, now, now);
}
await createPastoralFollowup(env, {
  parishId: 'parish-a', personId: 'person-digest-overdue', assignedPriestName: 'Fr. Thomas',
  assignedPriestEmail: 'father@example.test', reason: 'hospitalized', nextDueOn: '2026-08-30',
  note: 'Private hospital details must never appear in a digest.', actor: 'office@example.test',
});
await createPastoralFollowup(env, {
  parishId: 'parish-a', personId: 'person-digest-today', assignedPriestName: 'Fr. Thomas',
  assignedPriestEmail: 'father@example.test', reason: 'homebound', nextDueOn: '2026-09-02',
  actor: 'office@example.test',
});
await createPastoralFollowup(env, {
  parishId: 'parish-a', personId: 'person-digest-upcoming', assignedPriestName: 'Fr. Thomas',
  assignedPriestEmail: 'father@example.test', reason: 'regular_check_in', nextDueOn: '2026-09-08',
  actor: 'office@example.test',
});
await createPastoralFollowup(env, {
  parishId: 'parish-a', personId: 'person-digest-other', assignedPriestName: 'Fr. Nicholas',
  assignedPriestEmail: 'nicholas@example.test', reason: 'bereavement', nextDueOn: '2026-09-02',
  actor: 'office@example.test',
});

const deliveredMessages = [];
const digestOptions = {
  registrations: [{
    parishId: 'parish-a', parishName: 'St. Test Parish', subscriptionTier: 'parish', sacramentsEnabled: true,
  }],
  emailSender: async (_emailEnv, message, deliveryOptions) => {
    deliveredMessages.push({ message, deliveryOptions });
    return { status: 'sent', httpStatus: 200, id: `email-${deliveredMessages.length}` };
  },
};
const digestResults = await sendDailyPastoralCareDigestEmails(env, '2026-09-02T14:00:00.000Z', digestOptions);
assert.equal(digestResults.length, 2);
assert.equal(digestResults.find((result) => result.to[0] === 'father@example.test').overdueCount, 1);
assert.equal(digestResults.find((result) => result.to[0] === 'father@example.test').dueTodayCount, 1);
assert.equal(digestResults.find((result) => result.to[0] === 'father@example.test').upcomingCount, 1);
assert.equal(deliveredMessages.length, 2);
const fatherDigest = deliveredMessages.find((entry) => entry.message.to[0] === 'father@example.test');
assert.match(fatherDigest.message.subject, /1 pastoral follow-up overdue/);
assert.match(fatherDigest.message.html, /Overdue/);
assert.match(fatherDigest.message.html, /Due today/);
assert.match(fatherDigest.message.html, /Upcoming · next 7 days/);
assert.match(fatherDigest.message.html, /Anna Overdue/);
assert.match(fatherDigest.message.html, /Basil Today/);
assert.match(fatherDigest.message.html, /Clara Upcoming/);
assert.doesNotMatch(fatherDigest.message.html, /Demetri Other/);
assert.doesNotMatch(fatherDigest.message.html, /Private hospital details/);
assert.match(fatherDigest.message.text, /Care notes are not included/);
assert.match(fatherDigest.deliveryOptions.idempotencyKey, /^pastoral-digest-[a-f0-9]{64}$/);

const duplicateResults = await sendDailyPastoralCareDigestEmails(env, '2026-09-02T14:05:00.000Z', digestOptions);
assert.ok(duplicateResults.every((result) => result.status === 'skipped' && result.reason === 'already_sent'));
assert.equal(deliveredMessages.length, 2, 'a retry must not send the same priest digest twice');
sqlite.prepare(`UPDATE sacrament_pastoral_digest_deliveries SET status = 'failed' WHERE recipient_masked = 'f***@example.test'`).run();
const failedRetryResults = await sendDailyPastoralCareDigestEmails(env, '2026-09-02T14:10:00.000Z', digestOptions);
assert.equal(failedRetryResults.find((result) => result.to[0] === 'father@example.test').status, 'sent');
assert.equal(failedRetryResults.find((result) => result.to[0] === 'nicholas@example.test').reason, 'already_sent');
assert.equal(deliveredMessages.length, 3, 'a failed ledger entry should be eligible for a same-day retry');
const deliveryRows = sqlite.prepare('SELECT * FROM sacrament_pastoral_digest_deliveries ORDER BY recipient_masked').all();
assert.equal(deliveryRows.length, 2);
assert.ok(deliveryRows.every((row) => row.status === 'sent'));
assert.ok(deliveryRows.every((row) => !JSON.stringify(row).includes('father@example.test')));
assert.ok(deliveryRows.every((row) => !JSON.stringify(row).includes('nicholas@example.test')));
assert.ok(deliveryRows.every((row) => !JSON.stringify(row).includes('Anna Overdue')));

const pastoralInventory = (await inspectStorage(env.AGAPAY_DB)).filter((table) =>
  table.name.startsWith('sacrament_pastoral_') || table.name.startsWith('sacrament_memorial_')
);
assert.deepEqual(
  pastoralInventory.map((table) => table.name),
  [
    'sacrament_memorial_cycles',
    'sacrament_memorial_markers',
    'sacrament_pastoral_contacts',
    'sacrament_pastoral_digest_deliveries',
    'sacrament_pastoral_followups',
  ]
);
assert.ok(pastoralInventory.every((table) => table.classification === 'parish'));
assert.match(pastoralInventory.find((table) => table.name === 'sacrament_pastoral_contacts').scope, /followup_id/);

const route = readFileSync(path.join(root, 'src', 'routes', 'parish.js'), 'utf8');
const worker = readWorkerCompositionSource(root);
const parishSacramentsHandler = readFileSync(path.join(root, 'src', 'handlers', 'parish-sacraments.js'), 'utf8');
const dashboard = readFileSync(path.join(root, 'public', 'parish', 'dashboard.html'), 'utf8');
const feature = readFileSync(
  path.join(root, 'public', 'parish', 'features', 'sacraments', 'pastoral-followup.js'),
  'utf8'
);
const pastoralHandler = readFileSync(path.join(root, 'src', 'handlers', 'parish-pastoral-followup.js'), 'utf8');
const pastoralDigest = readFileSync(path.join(root, 'src', 'sacraments', 'pastoral-digest.js'), 'utf8');
const adminRoute = readFileSync(path.join(root, 'src', 'routes', 'admin.js'), 'utf8');
const wrangler = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
assert.match(route, /handleParishPastoralFollowUp/);
assert.match(worker, /handleParishPastoralFollowUp/);
assert.match(dashboard, /data-sac-tab="follow-up"/);
assert.match(feature, /Log contact/);
assert.match(feature, /Schedule visit/);
assert.match(feature, /Close after this contact/);
assert.match(feature, /Recovered \/ no routine follow-up needed/);
assert.match(feature, /Date of repose/);
assert.match(feature, /Memorial observances/);
assert.match(feature, /Cover all clergy/);
assert.match(feature, /Record a repose/);
assert.match(feature, /agapay_identity_session_token/);
assert.match(pastoralHandler, /requireActiveMembership/);
assert.match(pastoralHandler, /verifyParishDashboardBearer/);
assert.match(pastoralHandler, /dashboardSession: true/);
assert.match(pastoralHandler, /actorType: context\.identity \? 'platform_user' : 'parish'/);
assert.match(pastoralHandler, /assigned to another priest/);
assert.ok(CAPABILITY_CATALOG.includes('sacraments.pastoral.manage_own'));
assert.ok(CAPABILITY_CATALOG.includes('sacraments.pastoral.coverage'));
assert.ok(ROLE_TEMPLATES.priest.includes('sacraments.pastoral.manage_own'));
assert.ok(ROLE_TEMPLATES.priest.includes('sacraments.pastoral.coverage'));
assert.ok(ROLE_TEMPLATES.rector.includes('sacraments.pastoral.coverage'));
assert.match(worker, /memorial_anniversary_materialization/);
assert.match(worker, /Memorial observances to arrange/);
assert.match(worker, /daily_pastoral_care_digest/);
assert.match(pastoralDigest, /Overdue/);
assert.match(pastoralDigest, /Due today/);
assert.match(pastoralDigest, /Upcoming · next 7 days/);
assert.match(pastoralDigest, /Care notes are not included/);
assert.match(adminRoute, /send-daily-pastoral-digest/);
assert.match(wrangler, /"0 14 \* \* \*"/);
assert.match(parishSacramentsHandler, /updated\.request_source === "pastoral_memorial"/);
assert.match(parishSacramentsHandler, /updated\.request_source !== "pastoral_memorial"/);

console.log('PASS - Named-clergy queues, repose ticklers, and idempotent daily pastoral digests are wired end to end');
