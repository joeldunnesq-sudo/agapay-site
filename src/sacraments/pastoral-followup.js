import { d1All, d1Batch, d1First, d1Run, generateSecret, normalizeEmail } from '../lib/core.js';

export const PASTORAL_FOLLOWUP_REASONS = new Set([
  'homebound',
  'hospitalized',
  'bereavement',
  'newcomer',
  'regular_check_in',
  'other',
]);
export const PASTORAL_CONTACT_TYPES = new Set([
  'phone',
  'home_visit',
  'hospital_visit',
  'communion',
  'conversation',
  'family_contact',
  'other',
]);
export const PASTORAL_CLOSURE_OUTCOMES = new Set([
  'recovered',
  'care_transferred',
  'declined',
  'moved',
  'reposed',
  'other',
]);

export class PastoralFollowUpError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

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

function validDateTime(value) {
  const text = cleanText(value, 40);
  const date = new Date(text);
  return !text || Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function cadence(value, required = false) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new PastoralFollowUpError('Choose a follow-up cadence.');
    return null;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new PastoralFollowUpError('Cadence must be between 1 and 3,650 days.');
  }
  return days;
}

function personScopeSql(alias = 'p') {
  return `(
    ${alias}.created_by_parish_id = ? OR
    EXISTS (
      SELECT 1 FROM directory_parish_affiliations a
      WHERE a.person_id = ${alias}.id AND a.parish_id = ? AND a.active = 1 AND a.status != 'former_member'
    ) OR
    EXISTS (
      SELECT 1 FROM directory_household_members m
      JOIN directory_households h ON h.id = m.household_id
      WHERE m.person_id = ${alias}.id AND m.active = 1 AND h.parish_id = ? AND h.active = 1
    )
  )`;
}

async function parishPerson(env, parishId, personId) {
  return d1First(
    env,
    `
    SELECT p.id, p.preferred_name
    FROM directory_people p
    WHERE p.id = ? AND p.active = 1 AND p.deceased = 0 AND ${personScopeSql('p')}
  `,
    personId,
    parishId,
    parishId,
    parishId
  );
}

function followupDto(row = {}) {
  return {
    id: row.id,
    parishId: row.parish_id,
    personId: row.person_id,
    personName: row.preferred_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    assignedPriestName: row.assigned_priest_name,
    assignedPriestEmail: row.assigned_priest_email || '',
    reason: row.reason,
    status: row.status,
    cadenceDays: row.cadence_days == null ? null : Number(row.cadence_days),
    nextDueOn: row.next_due_on || '',
    note: row.note || '',
    lastContactAt: row.last_contact_at || '',
    lastContactType: row.last_contact_type || '',
    contactCount: Number(row.contact_count || 0),
    closedAt: row.closed_at || '',
    closureOutcome: row.closure_outcome || '',
    closureReason: row.closure_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FOLLOWUP_SELECT = `
  SELECT f.*, p.preferred_name,
    (SELECT c.value FROM directory_contact_methods c
      WHERE c.parish_id = f.parish_id AND c.owner_type = 'person' AND c.owner_id = f.person_id
        AND c.contact_type = 'email' AND c.active = 1
      ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS contact_email,
    (SELECT c.value FROM directory_contact_methods c
      WHERE c.parish_id = f.parish_id AND c.owner_type = 'person' AND c.owner_id = f.person_id
        AND c.contact_type = 'phone' AND c.active = 1
      ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS contact_phone,
    (SELECT c.contacted_at FROM sacrament_pastoral_contacts c
      WHERE c.followup_id = f.id ORDER BY c.contacted_at DESC, c.created_at DESC LIMIT 1) AS last_contact_at,
    (SELECT c.contact_type FROM sacrament_pastoral_contacts c
      WHERE c.followup_id = f.id ORDER BY c.contacted_at DESC, c.created_at DESC LIMIT 1) AS last_contact_type,
    (SELECT COUNT(*) FROM sacrament_pastoral_contacts c WHERE c.followup_id = f.id) AS contact_count
  FROM sacrament_pastoral_followups f
  JOIN directory_people p ON p.id = f.person_id
`;

export async function listPastoralFollowups(env, parishId, assignedPriestEmail = '') {
  const normalizedAssignee = normalizeEmail(assignedPriestEmail);
  const rows = await d1All(
    env,
    `${FOLLOWUP_SELECT}
    WHERE f.parish_id = ?
      AND (? = '' OR LOWER(COALESCE(f.assigned_priest_email, '')) = ?)
    ORDER BY CASE f.status WHEN 'active' THEN 0 ELSE 1 END, f.next_due_on, f.updated_at DESC
    LIMIT 500
  `,
    parishId,
    normalizedAssignee,
    normalizedAssignee
  );
  return rows.map(followupDto);
}

export async function findPastoralFollowup(env, parishId, followupId) {
  const row = await d1First(env, `${FOLLOWUP_SELECT} WHERE f.id = ? AND f.parish_id = ?`, followupId, parishId);
  return row ? followupDto(row) : null;
}

export async function listPastoralFollowupCandidates(env, parishId, search = '') {
  const query = cleanText(search, 100).toLowerCase();
  const like = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const rows = await d1All(
    env,
    `
    SELECT p.id, p.preferred_name,
      (SELECT c.value FROM directory_contact_methods c
        WHERE c.parish_id = ? AND c.owner_type = 'person' AND c.owner_id = p.id
          AND c.contact_type = 'email' AND c.active = 1
        ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS contact_email,
      (SELECT c.value FROM directory_contact_methods c
        WHERE c.parish_id = ? AND c.owner_type = 'person' AND c.owner_id = p.id
          AND c.contact_type = 'phone' AND c.active = 1
        ORDER BY c.is_primary DESC, c.created_at LIMIT 1) AS contact_phone,
      f.id AS followup_id, f.status AS followup_status
    FROM directory_people p
    LEFT JOIN sacrament_pastoral_followups f ON f.parish_id = ? AND f.person_id = p.id
    WHERE p.active = 1 AND p.deceased = 0 AND ${personScopeSql('p')}
      AND (? = '' OR LOWER(p.preferred_name) LIKE ? ESCAPE '\\')
    ORDER BY p.preferred_name COLLATE NOCASE
    LIMIT 80
  `,
    parishId,
    parishId,
    parishId,
    parishId,
    parishId,
    parishId,
    query,
    like
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.preferred_name,
    email: row.contact_email || '',
    phone: row.contact_phone || '',
    followupId: row.followup_id || '',
    followupStatus: row.followup_status || '',
  }));
}

export async function createPastoralFollowup(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const personId = cleanText(input.personId, 160);
  const priestName = cleanText(input.assignedPriestName, 120);
  const priestEmail = normalizeEmail(input.assignedPriestEmail);
  const reason = cleanText(input.reason, 40) || 'regular_check_in';
  const nextDueOn = validDate(input.nextDueOn);
  if (!parishId || !personId) throw new PastoralFollowUpError('Choose a person from the parish directory.');
  if (!(await parishPerson(env, parishId, personId))) {
    throw new PastoralFollowUpError('That person is not active in this parish directory.', 404);
  }
  if (!priestName) throw new PastoralFollowUpError('Choose the priest responsible for follow-up.');
  if (!PASTORAL_FOLLOWUP_REASONS.has(reason)) throw new PastoralFollowUpError('Choose a valid pastoral care reason.');
  if (!nextDueOn) throw new PastoralFollowUpError('Choose the first follow-up date.');
  const id = generateSecret('pastoral');
  try {
    await d1Run(
      env,
      `
      INSERT INTO sacrament_pastoral_followups
        (id, parish_id, person_id, assigned_priest_name, assigned_priest_email, reason,
         status, cadence_days, next_due_on, note, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
      id,
      parishId,
      personId,
      priestName,
      priestEmail || null,
      reason,
      cadence(input.cadenceDays),
      nextDueOn,
      cleanText(input.note, 1200) || null,
      cleanText(input.actor, 180) || 'parish-dashboard'
    );
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || error || ''))) {
      throw new PastoralFollowUpError('This person already has a pastoral follow-up plan.', 409);
    }
    throw error;
  }
  return findPastoralFollowup(env, parishId, id);
}

export async function updatePastoralFollowup(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const id = cleanText(input.id, 160);
  const existing = await d1First(
    env,
    'SELECT * FROM sacrament_pastoral_followups WHERE id = ? AND parish_id = ?',
    id,
    parishId
  );
  if (!existing) throw new PastoralFollowUpError('Pastoral follow-up not found.', 404);
  const action = cleanText(input.action, 30) || 'update';
  const actor = cleanText(input.actor, 180) || 'parish-dashboard';
  if (existing.closure_outcome === 'reposed' && action !== 'close') {
    throw new PastoralFollowUpError('A repose record cannot be reopened as a living pastoral follow-up.', 409);
  }
  if (action === 'close') {
    const outcome = cleanText(input.closureOutcome, 40) || 'other';
    const reason = cleanText(input.closureReason, 500) || 'Pastoral follow-up completed';
    if (!PASTORAL_CLOSURE_OUTCOMES.has(outcome) || outcome === 'reposed') {
      throw new PastoralFollowUpError('Choose a valid closure outcome. Record a repose through the memorial workflow.');
    }
    await d1Run(
      env,
      `
      UPDATE sacrament_pastoral_followups
      SET status = 'closed', next_due_on = NULL, closed_at = ?, closed_by = ?,
          closure_outcome = ?, closure_reason = ?, updated_at = ?
      WHERE id = ? AND parish_id = ?
    `,
      new Date().toISOString(),
      actor,
      outcome,
      reason,
      new Date().toISOString(),
      id,
      parishId
    );
    return findPastoralFollowup(env, parishId, id);
  }
  const priestName =
    input.assignedPriestName === undefined ? existing.assigned_priest_name : cleanText(input.assignedPriestName, 120);
  const priestEmail =
    input.assignedPriestEmail === undefined
      ? existing.assigned_priest_email
      : normalizeEmail(input.assignedPriestEmail);
  const reason = input.reason === undefined ? existing.reason : cleanText(input.reason, 40);
  const nextDueOn = validDate(input.nextDueOn === undefined ? existing.next_due_on : input.nextDueOn);
  if (!priestName) throw new PastoralFollowUpError('Choose the priest responsible for follow-up.');
  if (!PASTORAL_FOLLOWUP_REASONS.has(reason)) throw new PastoralFollowUpError('Choose a valid pastoral care reason.');
  if (!nextDueOn) throw new PastoralFollowUpError('Choose the next follow-up date.');
  const nextCadence = input.cadenceDays === undefined ? existing.cadence_days : cadence(input.cadenceDays);
  const note = input.note === undefined ? existing.note : cleanText(input.note, 1200) || null;
  await d1Run(
    env,
    `
    UPDATE sacrament_pastoral_followups
    SET assigned_priest_name = ?, assigned_priest_email = ?, reason = ?, status = 'active',
        cadence_days = ?, next_due_on = ?, note = ?, closed_at = NULL, closed_by = NULL,
        closure_outcome = NULL, closure_reason = NULL, updated_at = ?
    WHERE id = ? AND parish_id = ?
  `,
    priestName,
    priestEmail || null,
    reason,
    nextCadence,
    nextDueOn,
    note,
    new Date().toISOString(),
    id,
    parishId
  );
  return findPastoralFollowup(env, parishId, id);
}

export async function recordPastoralContact(env, input = {}) {
  const parishId = cleanText(input.parishId, 120);
  const followupId = cleanText(input.followupId, 160);
  const contactType = cleanText(input.contactType, 40);
  const submittedContactedAt = cleanText(input.contactedAt, 40);
  const contactedAt = submittedContactedAt ? validDateTime(submittedContactedAt) : new Date().toISOString();
  const actor = cleanText(input.actor, 180) || 'parish-dashboard';
  const close = input.close === true;
  const existing = await d1First(
    env,
    'SELECT * FROM sacrament_pastoral_followups WHERE id = ? AND parish_id = ?',
    followupId,
    parishId
  );
  if (!existing) throw new PastoralFollowUpError('Pastoral follow-up not found.', 404);
  if (existing.closure_outcome === 'reposed') {
    throw new PastoralFollowUpError('Contact cannot be logged against a repose record.', 409);
  }
  if (!PASTORAL_CONTACT_TYPES.has(contactType)) throw new PastoralFollowUpError('Choose how contact was made.');
  if (!contactedAt) throw new PastoralFollowUpError('Choose a valid contact date and time.');
  const nextDueOn = close ? null : validDate(input.nextDueOn);
  if (!close && !nextDueOn) throw new PastoralFollowUpError('Choose the next follow-up date or close the plan.');
  const now = new Date().toISOString();
  const contactId = generateSecret('pastoralcontact');
  const statements = [
    {
      sql: `INSERT INTO sacrament_pastoral_contacts
      (id, followup_id, contact_type, contacted_at, recorded_by, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [contactId, followupId, contactType, contactedAt, actor, cleanText(input.summary, 1200) || null, now],
    },
  ];
  if (close) {
    const outcome = cleanText(input.closureOutcome, 40) || 'other';
    if (!PASTORAL_CLOSURE_OUTCOMES.has(outcome) || outcome === 'reposed') {
      throw new PastoralFollowUpError('Choose a valid closure outcome. Record a repose through the memorial workflow.');
    }
    statements.push({
      sql: `UPDATE sacrament_pastoral_followups
        SET status = 'closed', next_due_on = NULL, closed_at = ?, closed_by = ?,
            closure_outcome = ?, closure_reason = ?, updated_at = ? WHERE id = ? AND parish_id = ?`,
      params: [
        now,
        actor,
        outcome,
        cleanText(input.closureReason, 500) || 'Pastoral follow-up completed',
        now,
        followupId,
        parishId,
      ],
    });
  } else {
    statements.push({
      sql: `UPDATE sacrament_pastoral_followups
        SET status = 'active', next_due_on = ?, closed_at = NULL, closed_by = NULL,
            closure_outcome = NULL, closure_reason = NULL, updated_at = ? WHERE id = ? AND parish_id = ?`,
      params: [nextDueOn, now, followupId, parishId],
    });
  }
  await d1Batch(env, statements);
  return findPastoralFollowup(env, parishId, followupId);
}

export function defaultNextPastoralDueOn(contactedAt, cadenceDays) {
  const date = new Date(contactedAt);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + cadence(cadenceDays, true));
  return date.toISOString().slice(0, 10);
}
