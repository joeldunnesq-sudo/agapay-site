import { generateSecret } from '../lib/core.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ACTOR_TYPES = new Set(['parish_staff', 'ministry_leader']);

export class AttendanceValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AttendanceValidationError';
    this.status = status;
  }
}

export function sundayOnOrBefore(value = new Date()) {
  const source = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(source.getTime())) throw new AttendanceValidationError('Choose a valid week.');
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function validateAttendanceWeek(value) {
  const weekOf = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    throw new AttendanceValidationError('Week must be an ISO date for a Sunday.');
  }
  const date = new Date(`${weekOf}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== weekOf || date.getUTCDay() !== 0) {
    throw new AttendanceValidationError('Week must be a valid Sunday.');
  }
  return weekOf;
}

export function validateHeadcount(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    throw new AttendanceValidationError('Headcount must be a whole number of zero or more.');
  }
  const headcount = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isSafeInteger(headcount) || headcount < 0) {
    throw new AttendanceValidationError('Headcount must be a whole number of zero or more.');
  }
  return headcount;
}

function requestedWeeks(value) {
  const weeks = Number.parseInt(String(value || 52), 10);
  return Number.isFinite(weeks) ? Math.max(4, Math.min(104, weeks)) : 52;
}

function weekSequence(endingSunday, weeks) {
  const end = new Date(`${endingSunday}T00:00:00.000Z`);
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(end.getTime() - (weeks - index - 1) * 7 * DAY_MS);
    return date.toISOString().slice(0, 10);
  });
}

function average(values) {
  const reported = values.filter((value) => typeof value === 'number');
  if (!reported.length) return null;
  return Math.round((reported.reduce((sum, value) => sum + value, 0) / reported.length) * 10) / 10;
}

function summaryFor(points) {
  const reported = points.filter((point) => typeof point.headcount === 'number');
  const latest = reported.at(-1) || null;
  const currentWindow = points.slice(-8).map((point) => point.headcount);
  const priorWindow = points.slice(-16, -8).map((point) => point.headcount);
  const currentAverage = average(currentWindow);
  const priorAverage = average(priorWindow);
  const changePct =
    currentAverage !== null && priorAverage !== null && priorAverage > 0
      ? Math.round(((currentAverage - priorAverage) / priorAverage) * 1000) / 10
      : null;
  return {
    latestHeadcount: latest?.headcount ?? null,
    latestWeekOf: latest?.weekOf ?? null,
    eightWeekAverage: currentAverage,
    priorEightWeekAverage: priorAverage,
    eightWeekChangePct: changePct,
    weeksReported: reported.length,
    expectedWeeks: points.length,
    reportingCoveragePct: points.length ? Math.round((reported.length / points.length) * 1000) / 10 : null,
  };
}

export async function loadAttendanceDelegation(env, parishId) {
  const row = await env.AGAPAY_DB.prepare(
    `
    SELECT s.headcount_delegate_ministry_id AS ministry_id,
           m.display_name AS ministry_name
    FROM parish_stewardship_settings s
    LEFT JOIN directory_ministries m
      ON m.id = s.headcount_delegate_ministry_id
     AND m.parish_id = s.parish_id
     AND m.status = 'active'
    WHERE s.parish_id = ?
  `
  )
    .bind(parishId)
    .first();
  if (!row?.ministry_id || !row?.ministry_name) return null;
  return { ministryId: row.ministry_id, ministryName: row.ministry_name };
}

export async function listAttendanceDelegateOptions(env, parishId) {
  const result = await env.AGAPAY_DB.prepare(
    `
    SELECT m.id, m.display_name
    FROM directory_ministries m
    WHERE parish_id = ? AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM directory_ministry_leaders ml
        WHERE ml.parish_id = m.parish_id AND ml.ministry_id = m.id AND ml.active = 1
      )
    ORDER BY display_order ASC, display_name ASC
  `
  )
    .bind(parishId)
    .all();
  return (result.results || []).map((row) => ({ id: row.id, name: row.display_name || 'Ministry' }));
}

export async function getParishAttendanceTrend(env, { parishId, weeks = 52 }) {
  const windowWeeks = requestedWeeks(weeks);
  const endingSunday = sundayOnOrBefore();
  const expected = weekSequence(endingSunday, windowWeeks);
  const [rowsResult, delegate, delegateOptions] = await Promise.all([
    env.AGAPAY_DB.prepare(
      `
      SELECT week_of, headcount
      FROM parish_weekly_headcounts
      WHERE parish_id = ? AND week_of >= ? AND week_of <= ?
      ORDER BY week_of ASC
    `
    )
      .bind(parishId, expected[0], endingSunday)
      .all(),
    loadAttendanceDelegation(env, parishId),
    listAttendanceDelegateOptions(env, parishId),
  ]);
  const recorded = new Map((rowsResult.results || []).map((row) => [row.week_of, Number(row.headcount)]));
  const points = expected.map((weekOf) => ({
    weekOf,
    headcount: recorded.has(weekOf) ? recorded.get(weekOf) : null,
  }));
  return {
    range: { weeks: windowWeeks, startWeekOf: expected[0], endWeekOf: endingSunday },
    points,
    summary: summaryFor(points),
    delegate,
    delegateOptions,
  };
}

export async function saveParishWeeklyHeadcount(env, input) {
  const parishId = String(input.parishId || '').trim();
  const actorType = String(input.actorType || '').trim();
  const actorId = String(input.actorId || '').trim();
  if (!parishId || !actorId || !ALLOWED_ACTOR_TYPES.has(actorType)) {
    throw new AttendanceValidationError('Attendance submission identity is incomplete.', 403);
  }
  const weekOf = validateAttendanceWeek(input.weekOf);
  const headcount = validateHeadcount(input.headcount);
  const ministryId = actorType === 'ministry_leader' ? String(input.ministryId || '').trim() : null;
  if (actorType === 'ministry_leader' && !ministryId) {
    throw new AttendanceValidationError('Delegated ministry is required.', 403);
  }
  const id = generateSecret('parish_headcount');
  await env.AGAPAY_DB.prepare(
    `
    INSERT INTO parish_weekly_headcounts
      (id, parish_id, week_of, headcount, submitted_by_actor_type, submitted_by_actor_id, submitted_by_ministry_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(parish_id, week_of) DO UPDATE SET
      headcount = excluded.headcount,
      submitted_by_actor_type = excluded.submitted_by_actor_type,
      submitted_by_actor_id = excluded.submitted_by_actor_id,
      submitted_by_ministry_id = excluded.submitted_by_ministry_id,
      updated_at = datetime('now')
  `
  )
    .bind(id, parishId, weekOf, headcount, actorType, actorId, ministryId)
    .run();
  return { ok: true, weekOf, headcount };
}

export async function setAttendanceDelegate(env, { parishId, ministryId }) {
  const normalizedMinistryId =
    ministryId == null || String(ministryId).trim() === '' ? null : String(ministryId).trim();
  if (normalizedMinistryId) {
    const ministry = await env.AGAPAY_DB.prepare(
      `
      SELECT m.id FROM directory_ministries m
      WHERE m.id = ? AND m.parish_id = ? AND m.status = 'active'
        AND EXISTS (
          SELECT 1 FROM directory_ministry_leaders ml
          WHERE ml.parish_id = m.parish_id AND ml.ministry_id = m.id AND ml.active = 1
        )
      LIMIT 1
    `
    )
      .bind(normalizedMinistryId, parishId)
      .first();
    if (!ministry) throw new AttendanceValidationError('Choose an active ministry with an active leader.');
  }
  await env.AGAPAY_DB.prepare(
    `
    UPDATE parish_stewardship_settings
    SET headcount_delegate_ministry_id = ?, updated_at = datetime('now')
    WHERE parish_id = ?
  `
  )
    .bind(normalizedMinistryId, parishId)
    .run();
  return loadAttendanceDelegation(env, parishId);
}
