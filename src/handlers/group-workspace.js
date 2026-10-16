// Generated from src/handlers/group-workspace.ts by npm run build:server. Do not edit.
import '../lib/content-reads.js';
import '../lib/push-notifications.js';
import { d1All, d1Batch, d1First, d1Run, generateSecret } from '../lib/core.js';
import '../lib/entitlements.js';
import './parish.js';
import './koinonia-access.js';
import './parish-events.js';
import { AttendanceValidationError, saveParishWeeklyHeadcount } from '../stewardship/attendance.js';
import { GroupMessageAccessError } from './donor-groups-shared.js';
import { requireActiveMinistryMember } from './donor-groups-shared.js';
import './group-attachments.js';
import { isActiveMinistryLeader } from './donor-groups.js';
async function ministryWorkspaceOverview(env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const now = Date.now();
  const [event, signup, resource, message, myCommitments, coverageRequests] = await Promise.all([
    d1First(
      env,
      'SELECT * FROM koinonia_ministry_events WHERE parish_id=? AND ministry_id=? AND starts_at>=? ORDER BY starts_at LIMIT 1',
      context.parishId,
      ministryId,
      now
    ),
    d1First(
      env,
      `SELECT s.id,s.title,s.status,COUNT(slot.id) slot_count,COALESCE(SUM(MAX(0,slot.needed_count-(SELECT COUNT(*) FROM koinonia_signup_entries e WHERE e.slot_id=slot.id AND e.status='confirmed'))),0) openings FROM koinonia_signup_sheets s LEFT JOIN koinonia_signup_slots slot ON slot.sheet_id=s.id WHERE s.parish_id=? AND s.ministry_id=? AND s.status='open' GROUP BY s.id ORDER BY openings DESC,s.updated_at DESC LIMIT 1`,
      context.parishId,
      ministryId
    ),
    d1First(
      env,
      'SELECT * FROM koinonia_ministry_resources WHERE parish_id=? AND ministry_id=? ORDER BY updated_at DESC LIMIT 1',
      context.parishId,
      ministryId
    ),
    d1First(
      env,
      'SELECT id,body,created_at FROM parish_group_messages WHERE parish_id=? AND ministry_id=? ORDER BY created_at DESC,id DESC LIMIT 1',
      context.parishId,
      ministryId
    ),
    d1All(
      env,
      `SELECT e.id,s.id sheet_id,slot.label,slot.slot_date,s.title FROM koinonia_signup_entries e JOIN koinonia_signup_slots slot ON slot.id=e.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id WHERE e.parish_id=? AND e.person_id=? AND e.status='confirmed' AND s.ministry_id=? AND (slot.slot_date IS NULL OR slot.slot_date>=?) ORDER BY slot.slot_date LIMIT 5`,
      context.parishId,
      context.personId,
      ministryId,
      now
    ),
    d1All(
      env,
      `SELECT request.id,request.note,person.preferred_name requester_name,slot.label,slot.slot_date,s.title FROM koinonia_signup_coverage_requests request JOIN koinonia_signup_entries entry ON entry.id=request.entry_id JOIN koinonia_signup_slots slot ON slot.id=entry.slot_id JOIN koinonia_signup_sheets s ON s.id=slot.sheet_id LEFT JOIN directory_people person ON person.id=request.requester_person_id WHERE request.parish_id=? AND s.ministry_id=? AND request.status='open' AND request.requester_person_id<>? ORDER BY slot.slot_date LIMIT 10`,
      context.parishId,
      ministryId,
      context.personId
    ),
  ]);
  return {
    event: event || null,
    signup: signup || null,
    resource: resource || null,
    latestMessage: message || null,
    myCommitments: myCommitments.map((commitment) => ({ ...commitment, sheetId: commitment.sheet_id })),
    coverageRequests,
  };
}
async function ministryWorkspaceMembers(env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const rows = await d1All(
    env,
    `WITH members AS (
    SELECT person_id,participation_type role FROM directory_ministry_participants WHERE parish_id=?1 AND ministry_id=?2 AND status='active'
    UNION SELECT person_id,assignment_type role FROM directory_ministry_leaders WHERE parish_id=?1 AND ministry_id=?2 AND active=1)
    SELECT p.id person_id,p.preferred_name,m.role,COALESCE(a.availability_note,'') availability_note,
      EXISTS(SELECT 1 FROM directory_ministry_leaders l WHERE l.parish_id=?1 AND l.ministry_id=?2 AND l.person_id=p.id AND l.active=1) is_leader
    FROM members m JOIN directory_people p ON p.id=m.person_id AND p.active=1
    LEFT JOIN koinonia_ministry_availability a ON a.parish_id=?1 AND a.ministry_id=?2 AND a.person_id=p.id
    GROUP BY p.id ORDER BY is_leader DESC,p.preferred_name`,
    context.parishId,
    ministryId
  );
  return {
    members: rows.map((r) => ({
      personId: r.person_id,
      name: r.preferred_name || 'Parish member',
      role: Number(r.is_leader) ? 'leader' : r.role || 'member',
      availabilityNote: r.availability_note,
      mine: r.person_id === context.personId,
    })),
  };
}
async function updateMinistryAvailability(request, env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const body = await request.json().catch(() => ({}));
  const note = String(body.availabilityNote || '')
    .trim()
    .slice(0, 300);
  await d1Run(
    env,
    `INSERT INTO koinonia_ministry_availability(parish_id,ministry_id,person_id,availability_note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(parish_id,ministry_id,person_id) DO UPDATE SET availability_note=excluded.availability_note,updated_at=excluded.updated_at`,
    context.parishId,
    ministryId,
    context.personId,
    note,
    Date.now()
  );
  return { ok: true };
}
async function listMinistrySchedule(env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const events = await d1All(
    env,
    `SELECT event.*,(SELECT COUNT(*) FROM koinonia_ministry_event_attendance a WHERE a.event_id=event.id AND a.status='present') attendance_count FROM koinonia_ministry_events event WHERE parish_id=? AND ministry_id=? AND starts_at>=? ORDER BY starts_at LIMIT 100`,
    context.parishId,
    ministryId,
    Date.now() - 864e5
  );
  return { events };
}
async function createMinistryEvents(request, env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const b = await request.json().catch(() => ({}));
  const title = String(b.title || '')
    .trim()
    .slice(0, 180);
  const startsAt = Number(b.startsAt);
  const repeatCount = Math.min(12, Math.max(1, Number(b.repeatCount) || 1));
  if (!title || !Number.isFinite(startsAt))
    throw new GroupMessageAccessError('Title and start date are required.', 422);
  const recurrence = repeatCount > 1 ? generateSecret('ministry_series') : null;
  const now = Date.now();
  const statements = [];
  const ids = [];
  for (let i = 0; i < repeatCount; i += 1) {
    const id = generateSecret('ministry_event');
    ids.push(id);
    statements.push({
      sql: `INSERT INTO koinonia_ministry_events(id,parish_id,ministry_id,title,description,location,starts_at,ends_at,recurrence_group_id,created_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        id,
        context.parishId,
        ministryId,
        title,
        String(b.description || '').slice(0, 1e3),
        String(b.location || '').slice(0, 240),
        startsAt + i * 7 * 864e5,
        b.endsAt ? Number(b.endsAt) + i * 7 * 864e5 : null,
        recurrence,
        context.personId,
        now,
        now,
      ],
    });
  }
  await d1Batch(env, statements);
  return { ok: true, eventIds: ids };
}
async function deleteMinistryEvent(env, context, ministryId, eventId) {
  await requireActiveMinistryMember(env, context, ministryId);
  await d1Run(
    env,
    'DELETE FROM koinonia_ministry_events WHERE id=? AND parish_id=? AND ministry_id=?',
    eventId,
    context.parishId,
    ministryId
  );
  return { ok: true };
}
async function recordMinistryAttendance(request, env, context, ministryId, eventId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const b = await request.json().catch(() => ({}));
  const personId = String(b.personId || '');
  const status = ['present', 'absent', 'excused'].includes(b.status) ? b.status : 'present';
  await d1Run(
    env,
    `INSERT INTO koinonia_ministry_event_attendance(event_id,person_id,status,recorded_by_person_id,recorded_at) SELECT id,?,?,?,? FROM koinonia_ministry_events WHERE id=? AND parish_id=? AND ministry_id=? ON CONFLICT(event_id,person_id) DO UPDATE SET status=excluded.status,recorded_by_person_id=excluded.recorded_by_person_id,recorded_at=excluded.recorded_at`,
    personId,
    status,
    context.personId,
    Date.now(),
    eventId,
    context.parishId,
    ministryId
  );
  return { ok: true };
}
async function listMinistryResources(env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  return {
    resources: await d1All(
      env,
      'SELECT * FROM koinonia_ministry_resources WHERE parish_id=? AND ministry_id=? ORDER BY updated_at DESC',
      context.parishId,
      ministryId
    ),
  };
}
async function createMinistryResource(request, env, context, ministryId) {
  await requireActiveMinistryMember(env, context, ministryId);
  const b = await request.json().catch(() => ({}));
  const title = String(b.title || '')
    .trim()
    .slice(0, 180);
  const type = ['link', 'document', 'checklist', 'training'].includes(b.resourceType) ? b.resourceType : 'link';
  let url = String(b.url || '')
    .trim()
    .slice(0, 2e3);
  if (!title) throw new GroupMessageAccessError('Resource title is required.', 422);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      url = parsed.toString();
    } catch {
      throw new GroupMessageAccessError('Use a valid http or https resource link.', 422);
    }
  }
  const id = generateSecret('ministry_resource'),
    now = Date.now();
  await d1Run(
    env,
    'INSERT INTO koinonia_ministry_resources(id,parish_id,ministry_id,title,resource_type,url,notes,created_by_person_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    id,
    context.parishId,
    ministryId,
    title,
    type,
    url,
    String(b.notes || '').slice(0, 2e3),
    context.personId,
    now,
    now
  );
  return { ok: true, resourceId: id };
}
async function deleteMinistryResource(env, context, ministryId, id) {
  await requireActiveMinistryMember(env, context, ministryId);
  await d1Run(
    env,
    'DELETE FROM koinonia_ministry_resources WHERE id=? AND parish_id=? AND ministry_id=?',
    id,
    context.parishId,
    ministryId
  );
  return { ok: true };
}
async function recordDelegatedParishHeadcount(request, env, context, ministryId) {
  if (
    !(await isActiveMinistryLeader(env, {
      parishId: context.parishId,
      ministryId,
      personId: context.personId,
    }))
  ) {
    throw new GroupMessageAccessError(
      'Only an active leader of the delegated ministry can record parish attendance.',
      403
    );
  }
  const delegated = await d1First(
    env,
    `
    SELECT m.id
    FROM parish_stewardship_settings s
    JOIN directory_ministries m
      ON m.id = s.headcount_delegate_ministry_id
     AND m.parish_id = s.parish_id
     AND m.status = 'active'
    WHERE s.parish_id = ? AND m.id = ? AND s.has_stewardship_suite = 1
    LIMIT 1
  `,
    context.parishId,
    ministryId
  );
  if (!delegated) {
    throw new GroupMessageAccessError('This ministry is not currently delegated to record parish attendance.', 403);
  }
  const body = await request.json().catch(() => ({}));
  try {
    return await saveParishWeeklyHeadcount(env, {
      parishId: context.parishId,
      weekOf: body.weekOf,
      headcount: body.headcount,
      actorType: 'ministry_leader',
      actorId: context.personId,
      ministryId,
    });
  } catch (error) {
    if (error instanceof AttendanceValidationError) {
      throw new GroupMessageAccessError(error.message, error.status);
    }
    throw error;
  }
}
export {
  createMinistryEvents,
  createMinistryResource,
  deleteMinistryEvent,
  deleteMinistryResource,
  listMinistryResources,
  listMinistrySchedule,
  ministryWorkspaceMembers,
  ministryWorkspaceOverview,
  recordDelegatedParishHeadcount,
  recordMinistryAttendance,
  updateMinistryAvailability,
};
