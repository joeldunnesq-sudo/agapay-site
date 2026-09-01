import { d1All, d1Batch, d1First, generateSecret, normalizeEmail } from '../lib/core.js';
import { PastoralFollowUpError } from './pastoral-followup.js';

export const MEMORIAL_MARKER_TYPES = new Set([
  'third_day',
  'ninth_day',
  'fortieth_day',
  'six_month',
  'first_anniversary',
]);

export const MEMORIAL_MARKER_STATUSES = new Set(['pending', 'arranged', 'completed', 'skipped']);

const MARKER_DEFINITIONS = Object.freeze({
  third_day: { label: '3rd day', leadDays: 2, date: (value) => addDays(value, 2) },
  ninth_day: { label: '9th day', leadDays: 7, date: (value) => addDays(value, 8) },
  fortieth_day: { label: '40th day', leadDays: 14, date: (value) => addDays(value, 39) },
  six_month: { label: 'Six months', leadDays: 30, date: (value) => addMonths(value, 6) },
  first_anniversary: { label: 'First anniversary', leadDays: 30, date: (value) => addYears(value, 1) },
});

function cleanText(value, max = 1000) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function validDate(value) {
  const text = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? '' : text;
}

function utcDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function addMonths(value, months) {
  const source = utcDate(value);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay))));
}

function addYears(value, years) {
  const source = utcDate(value);
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay))));
}

function reminderDate(reposedOn, targetDate, leadDays) {
  const proposed = addDays(targetDate, -leadDays);
  return proposed < reposedOn ? reposedOn : proposed;
}

function selectedMarkerTypes(value) {
  const requested = Array.isArray(value) ? value : [...MEMORIAL_MARKER_TYPES];
  const selected = requested.map((item) => cleanText(item, 40)).filter((item) => MEMORIAL_MARKER_TYPES.has(item));
  if (!selected.length) throw new PastoralFollowUpError('Choose at least one memorial observance.');
  return [...new Set(selected)];
}

function markerDto(row = {}) {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    parishId: row.parish_id,
    personId: row.person_id,
    personName: row.preferred_name || '',
    assignedPriestName: row.assigned_priest_name,
    assignedPriestEmail: row.assigned_priest_email || '',
    reposedOn: row.reposed_on,
    markerKey: row.marker_key,
    markerType: row.marker_type,
    markerLabel: row.marker_label || MARKER_DEFINITIONS[row.marker_type]?.label || 'Annual anniversary',
    targetDate: row.target_date,
    remindOn: row.remind_on,
    status: row.status,
    scheduledFor: row.scheduled_for || '',
    serviceRequestId: row.service_request_id || '',
    note: row.note || '',
    annualEnabled: Number(row.annual_enabled || 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MARKER_SELECT = `
  SELECT m.*, c.parish_id, c.person_id, c.assigned_priest_name, c.assigned_priest_email,
    c.reposed_on, c.annual_enabled, p.preferred_name,
    CASE m.marker_type
      WHEN 'third_day' THEN '3rd day'
      WHEN 'ninth_day' THEN '9th day'
      WHEN 'fortieth_day' THEN '40th day'
      WHEN 'six_month' THEN 'Six months'
      WHEN 'first_anniversary' THEN 'First anniversary'
      ELSE 'Annual anniversary'
    END AS marker_label
  FROM sacrament_memorial_markers m
  JOIN sacrament_memorial_cycles c ON c.id = m.cycle_id
  JOIN directory_people p ON p.id = c.person_id
`;

export function buildMemorialSchedule(reposedOnInput, markerTypesInput) {
  const reposedOn = validDate(reposedOnInput);
  if (!reposedOn) throw new PastoralFollowUpError('Choose a valid date of repose.');
  return selectedMarkerTypes(markerTypesInput).map((markerType) => {
    const definition = MARKER_DEFINITIONS[markerType];
    const targetDate = definition.date(reposedOn);
    return {
      markerKey: markerType,
      markerType,
      markerLabel: definition.label,
      targetDate,
      remindOn: reminderDate(reposedOn, targetDate, definition.leadDays),
    };
  });
}

export async function listMemorialMarkers(env, parishId) {
  const rows = await d1All(
    env,
    `${MARKER_SELECT}
     WHERE c.parish_id = ? AND c.status = 'active'
     ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'arranged' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
       m.target_date, p.preferred_name COLLATE NOCASE
     LIMIT 1000`,
    parishId
  );
  return rows.map(markerDto);
}

export async function findMemorialMarker(env, parishId, markerId) {
  const row = await d1First(env, `${MARKER_SELECT} WHERE c.parish_id = ? AND m.id = ?`, parishId, markerId);
  return row ? markerDto(row) : null;
}

export async function recordRepose(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const followupId = cleanText(input.followupId, 160);
  const actor = cleanText(input.actor, 180) || 'parish-dashboard';
  const reposedOn = validDate(input.reposedOn);
  const markers = buildMemorialSchedule(reposedOn, input.markerTypes);
  const followup = await d1First(
    env,
    `SELECT f.*, p.preferred_name FROM sacrament_pastoral_followups f
     JOIN directory_people p ON p.id = f.person_id
     WHERE f.id = ? AND f.parish_id = ?`,
    followupId,
    parishId
  );
  if (!followup) throw new PastoralFollowUpError('Pastoral follow-up not found.', 404);
  if (followup.status !== 'active') throw new PastoralFollowUpError('Reopen this follow-up before recording a repose.', 409);
  if (!reposedOn) throw new PastoralFollowUpError('Choose a valid date of repose.');
  const existing = await d1First(
    env,
    'SELECT id FROM sacrament_memorial_cycles WHERE parish_id = ? AND person_id = ?',
    parishId,
    followup.person_id
  );
  if (existing) throw new PastoralFollowUpError('This person already has a memorial observance cycle.', 409);

  const cycleId = generateSecret('memorialcycle');
  const now = new Date().toISOString();
  const includeSixMonth = markers.some((marker) => marker.markerType === 'six_month');
  const annualEnabled = input.annualEnabled !== false;
  const statements = [
    {
      sql: `UPDATE directory_people SET deceased = 1, reposed_on = ?, updated_at = ? WHERE id = ?`,
      params: [reposedOn, Date.now(), followup.person_id],
    },
    {
      sql: `UPDATE sacrament_pastoral_followups
        SET status = 'closed', next_due_on = NULL, closed_at = ?, closed_by = ?, closure_outcome = 'reposed',
            closure_reason = ?, updated_at = ? WHERE id = ? AND parish_id = ?`,
      params: [now, actor, cleanText(input.closureReason, 500) || `Reposed ${reposedOn}`, now, followupId, parishId],
    },
    {
      sql: `INSERT INTO sacrament_memorial_cycles
        (id, parish_id, person_id, followup_id, assigned_priest_name, assigned_priest_email,
         reposed_on, status, include_six_month, annual_enabled, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      params: [
        cycleId,
        parishId,
        followup.person_id,
        followupId,
        followup.assigned_priest_name,
        followup.assigned_priest_email || null,
        reposedOn,
        includeSixMonth ? 1 : 0,
        annualEnabled ? 1 : 0,
        actor,
        now,
        now,
      ],
    },
    ...markers.map((marker) => ({
      sql: `INSERT INTO sacrament_memorial_markers
        (id, cycle_id, marker_key, marker_type, target_date, remind_on, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      params: [
        generateSecret('memorialmarker'),
        cycleId,
        marker.markerKey,
        marker.markerType,
        marker.targetDate,
        marker.remindOn,
        now,
        now,
      ],
    })),
  ];
  await d1Batch(env, statements);
  return {
    cycleId,
    personId: followup.person_id,
    personName: followup.preferred_name,
    assignedPriestName: followup.assigned_priest_name,
    assignedPriestEmail: followup.assigned_priest_email || '',
    reposedOn,
    markers: (await listMemorialMarkers(env, parishId)).filter((marker) => marker.cycleId === cycleId),
  };
}

export async function updateMemorialMarker(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const markerId = cleanText(input.markerId, 180);
  const status = cleanText(input.status, 30);
  if (!MEMORIAL_MARKER_STATUSES.has(status)) throw new PastoralFollowUpError('Choose a valid memorial status.');
  const existing = await findMemorialMarker(env, parishId, markerId);
  if (!existing) throw new PastoralFollowUpError('Memorial observance not found.', 404);
  if (existing.status === 'scheduled' && status === 'arranged') {
    throw new PastoralFollowUpError('This observance already has a scheduled service request.', 409);
  }
  const now = new Date().toISOString();
  const scheduledFor = input.scheduledFor === undefined ? existing.scheduledFor : validDate(input.scheduledFor) || null;
  if (status === 'arranged' && !scheduledFor) throw new PastoralFollowUpError('Choose a valid arranged date.');
  await d1Batch(env, [
    {
      sql: `UPDATE sacrament_memorial_markers
        SET status = ?, scheduled_for = ?, note = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND cycle_id IN (SELECT id FROM sacrament_memorial_cycles WHERE parish_id = ?)`,
      params: [
        status,
        scheduledFor,
        cleanText(input.note, 1000) || null,
        ['completed', 'skipped'].includes(status) ? now : null,
        now,
        markerId,
        parishId,
      ],
    },
  ]);
  return findMemorialMarker(env, parishId, markerId);
}

export async function scheduleMemorialService(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const markerId = cleanText(input.markerId, 180);
  const scheduledFor = validDate(input.scheduledFor);
  const confirmedTime = cleanText(input.confirmedTime, 40);
  const marker = await findMemorialMarker(env, parishId, markerId);
  if (!marker) throw new PastoralFollowUpError('Memorial observance not found.', 404);
  if (!scheduledFor) throw new PastoralFollowUpError('Choose the date for the memorial service.');
  if (marker.serviceRequestId || marker.status === 'scheduled') {
    throw new PastoralFollowUpError('This memorial observance already has a service request.', 409);
  }
  const requestId = generateSecret('sac');
  const now = new Date().toISOString();
  const internalEmail = normalizeEmail(marker.assignedPriestEmail || input.actor) || 'parish-dashboard@agapay.invalid';
  await d1Batch(env, [
    {
      sql: `INSERT INTO sacrament_requests
        (id, parish_id, donor_email, person_id, request_source, source_id, sacrament_type, status,
         requested_date, participant_names, location_type, notes, confirmed_date, confirmed_time,
         clergy_assigned, parish_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pastoral_memorial', ?, 'memorial_service', 'scheduled',
          ?, ?, 'church', ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        requestId,
        parishId,
        internalEmail,
        marker.personId,
        markerId,
        marker.targetDate,
        marker.personName,
        `${marker.markerLabel} observance; target date ${marker.targetDate}.`,
        scheduledFor,
        confirmedTime || null,
        marker.assignedPriestName,
        cleanText(input.note, 1000) || `Created from the ${marker.markerLabel} memorial tickler.`,
        now,
        now,
      ],
    },
    {
      sql: `UPDATE sacrament_memorial_markers
        SET status = 'scheduled', scheduled_for = ?, service_request_id = ?, note = ?, updated_at = ?
        WHERE id = ? AND cycle_id IN (SELECT id FROM sacrament_memorial_cycles WHERE parish_id = ?)`,
      params: [scheduledFor, requestId, cleanText(input.note, 1000) || null, now, markerId, parishId],
    },
  ]);
  return {
    marker: await findMemorialMarker(env, parishId, markerId),
    request: await d1First(env, 'SELECT * FROM sacrament_requests WHERE id = ? AND parish_id = ?', requestId, parishId),
  };
}

export async function materializeMemorialAnniversaries(env, asOf = Date.now()) {
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return { created: 0 };
  const cycles = await d1All(
    env,
    `SELECT id, reposed_on FROM sacrament_memorial_cycles
     WHERE status = 'active' AND annual_enabled = 1 ORDER BY id LIMIT 5000`
  );
  const now = date.toISOString();
  const today = now.slice(0, 10);
  const statements = [];
  for (const cycle of cycles) {
    const reposeYear = Number(cycle.reposed_on.slice(0, 4));
    for (const year of [date.getUTCFullYear(), date.getUTCFullYear() + 1]) {
      if (year <= reposeYear + 1) continue;
      const targetDate = addYears(cycle.reposed_on, year - reposeYear);
      const remindOn = reminderDate(cycle.reposed_on, targetDate, 30);
      if (remindOn > today || targetDate < addDays(today, -365)) continue;
      statements.push({
        sql: `INSERT OR IGNORE INTO sacrament_memorial_markers
          (id, cycle_id, marker_key, marker_type, target_date, remind_on, status, created_at, updated_at)
          VALUES (?, ?, ?, 'annual_anniversary', ?, ?, 'pending', ?, ?)`,
        params: [
          generateSecret('memorialmarker'),
          cycle.id,
          `annual_${year}`,
          targetDate,
          remindOn,
          now,
          now,
        ],
      });
    }
  }
  let created = 0;
  for (let index = 0; index < statements.length; index += 200) {
    const results = await d1Batch(env, statements.slice(index, index + 200));
    created += results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  }
  return { created };
}
