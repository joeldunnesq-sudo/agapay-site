// Generated from src/directory/ministry-participants.ts by npm run build:server. Do not edit.
import {
  MINISTRY_PARTICIPATION_TYPES,
  parishIdFor,
  requireManage,
  parishProfileCandidateId,
  parishProfileEmail,
  enumValue,
  loadMinistry,
  loadAdultPerson,
  d1All,
  d1First,
  generateSecret,
  loadDonor,
  normalizeEmail,
  ensurePlatformUser,
  DirectoryServiceError,
  auditStatement,
  nowMs,
  runAtomic,
} from './ministries-shared.js';
import { getMinistryAdmin } from './ministries.js';
import './ministry-publication.js';
import './ministry-interest.js';
async function assignMinistryParticipant(
  env,
  {
    context,
    ministryId,
    personId,
    participationType = 'participant',
    publish = false,
    source = 'administrator_assigned',
    requestId = '',
    correlationId = '',
  }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  await loadMinistry(env, { parishId, ministryId });
  const person = await loadAdultPerson(env, { parishId, personId });
  const type = enumValue(participationType, MINISTRY_PARTICIPATION_TYPES, 'participationType', 'participant');
  const timestamp = nowMs();
  const id = generateSecret('dir_min_part');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_participants
              (id, parish_id, ministry_id, person_id, source, status, participation_type,
               publication_preference, approved_publication, start_at, assigned_by_user_id,
               request_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        ministryId,
        person.id,
        source,
        type,
        publish ? 'directory' : 'hidden',
        publish ? 1 : 0,
        timestamp,
        actor.userId,
        requestId || null,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.ministry.participant_assigned',
      actor,
      parishId,
      targetType: 'directory_ministry_participant',
      targetId: id,
      metadata: { ministryId, personId: person.id, participationType: type, grantsCapability: false },
      correlationId,
    }),
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}
async function searchMinistryParticipantCandidates(env, { context, query = '', limit = 20 }) {
  requireManage(context);
  const parishId = parishIdFor(context);
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (needle.length < 2) return [];
  const like = `%${needle}%`;
  const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const people = await d1All(
    env,
    `SELECT p.id, p.preferred_name,
            COALESCE(
              (SELECT c.value FROM directory_contact_methods c
                WHERE c.parish_id = ?1 AND c.owner_type = 'person' AND c.owner_id = p.id
                  AND c.contact_type = 'email' AND c.active = 1
                ORDER BY c.is_primary DESC, c.created_at ASC LIMIT 1),
              (SELECT pu.email FROM directory_person_links pl
                JOIN platform_users pu ON pu.id = pl.external_id AND pu.status = 'active'
                WHERE pl.person_id = p.id AND pl.link_type = 'platform_user' AND pl.active = 1
                ORDER BY pl.created_at ASC LIMIT 1),
              ''
            ) AS email
       FROM directory_people p
      WHERE p.active = 1
        AND (
          p.created_by_parish_id = ?1
          OR EXISTS (SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id = p.id AND a.parish_id = ?1 AND a.active = 1 AND a.status != 'former_member')
          OR EXISTS (SELECT 1 FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE hm.person_id = p.id AND hm.active = 1 AND h.active = 1 AND h.parish_id = ?1)
        )
        AND NOT EXISTS (
          SELECT 1 FROM directory_person_privacy_flags f
           WHERE f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
             AND (f.protected_person = 1 OR f.is_child = 1)
        )
        AND (
          LOWER(p.preferred_name) LIKE ?2
          OR EXISTS (SELECT 1 FROM directory_contact_methods c WHERE c.owner_type = 'person' AND c.owner_id = p.id AND c.contact_type = 'email' AND c.active = 1 AND LOWER(c.value) LIKE ?2)
          OR EXISTS (SELECT 1 FROM directory_person_links pl JOIN platform_users pu ON pu.id = pl.external_id WHERE pl.person_id = p.id AND pl.link_type = 'platform_user' AND pl.active = 1 AND LOWER(pu.email) LIKE ?2)
        )
      ORDER BY p.preferred_name ASC, p.id ASC
      LIMIT ?3`,
    parishId,
    like,
    cappedLimit
  );
  const candidates = people.map((row) => ({
    candidateId: row.id,
    personId: row.id,
    displayName: row.preferred_name || 'Parishioner',
    email: normalizeEmail(row.email),
    source: 'directory',
  }));
  if (candidates.length >= cappedLimit) return candidates;
  const profiles = await d1All(
    env,
    `SELECT email, data
       FROM donors
      WHERE LOWER(default_parish_id) = LOWER(?1)
        AND (
          LOWER(email) LIKE ?2
          OR LOWER(COALESCE(json_extract(data, '$.donorName'), '')) LIKE ?2
          OR LOWER(COALESCE(json_extract(data, '$.householdName'), '')) LIKE ?2
        )
      ORDER BY LOWER(COALESCE(json_extract(data, '$.donorName'), email)) ASC
      LIMIT ?3`,
    parishId,
    like,
    cappedLimit
  );
  const existingEmails = new Set(candidates.map((candidate) => candidate.email).filter(Boolean));
  for (const row of profiles) {
    const email = normalizeEmail(row.email);
    if (!email || existingEmails.has(email) || candidates.length >= cappedLimit) continue;
    let profileName = '';
    try {
      const profile = JSON.parse(row.data || '{}');
      if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
        const donorName = 'donorName' in profile && typeof profile.donorName === 'string' ? profile.donorName : '';
        const householdName =
          'householdName' in profile && typeof profile.householdName === 'string' ? profile.householdName : '';
        profileName = donorName || householdName;
      }
    } catch {}
    candidates.push({
      candidateId: parishProfileCandidateId(email),
      personId: '',
      displayName: String(profileName || email.split('@')[0]).trim() || 'Parishioner',
      email,
      source: 'parish_profile',
    });
    existingEmails.add(email);
  }
  return candidates;
}
async function ensureParishProfileDirectoryPerson(env, { context, candidateId, correlationId = '' }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const email = parishProfileEmail(candidateId);
  if (!email) throw new DirectoryServiceError('validation_failed', 'Choose a valid parish profile.', 422);
  const donor = await loadDonor(env, email);
  if (
    !donor ||
    String(donor.defaultParishId || '')
      .trim()
      .toLowerCase() !== parishId.toLowerCase()
  ) {
    throw new DirectoryServiceError('not_found', 'That My AGAPAY profile is not assigned to this parish.', 404);
  }
  const displayName =
    String(donor.donorName || donor.householdName || email.split('@')[0])
      .trim()
      .slice(0, 160) || 'Parishioner';
  const user = await ensurePlatformUser(env, { email, displayName });
  if (!user?.id)
    throw new DirectoryServiceError('identity_unavailable', 'The My AGAPAY profile could not be linked.', 503);
  const linked = await d1First(
    env,
    `SELECT p.id, p.active FROM directory_person_links l
       JOIN directory_people p ON p.id = l.person_id
      WHERE l.link_type = 'platform_user' AND l.external_id = ?1 AND l.active = 1
      ORDER BY l.created_at ASC LIMIT 1`,
    user.id
  );
  if (linked && Number(linked.active || 0) !== 1) {
    throw new DirectoryServiceError(
      'inactive_person',
      'This parish profile is linked to an inactive directory record.',
      409
    );
  }
  const timestamp = nowMs();
  const personId = linked?.id || generateSecret('dir_person');
  const statements = [];
  if (!linked) {
    statements.push(
      {
        sql: `INSERT INTO directory_people
                (id, created_by_parish_id, preferred_name, legal_name, middle_name, suffix, biological_sex, deceased, active, notes, created_at, updated_at)
              VALUES (?, ?, ?, '', '', '', 'unknown', 0, 1, ?, ?, ?)`,
        params: [
          personId,
          parishId,
          displayName,
          'Created from a parish-approved ministry assignment.',
          timestamp,
          timestamp,
        ],
      },
      {
        sql: `INSERT INTO directory_person_links (id, person_id, link_type, external_id, active, created_at, updated_at)
              VALUES (?, ?, 'platform_user', ?, 1, ?, ?)`,
        params: [generateSecret('dir_link'), personId, user.id, timestamp, timestamp],
      },
      {
        sql: `INSERT OR IGNORE INTO directory_contact_methods
                (id, parish_id, owner_type, owner_id, contact_type, label, value, normalized_value, is_primary, verified, visibility, active, created_at, updated_at)
              VALUES (?, ?, 'person', ?, 'email', 'personal', ?, ?, 1, ?, 'private', 1, ?, ?)`,
        params: [
          generateSecret('dir_contact'),
          parishId,
          personId,
          email,
          email,
          donor.emailVerifiedAt ? 1 : 0,
          timestamp,
          timestamp,
        ],
      }
    );
  }
  statements.push(
    {
      sql: `INSERT INTO directory_parish_affiliations
              (id, person_id, parish_id, status, joined_date, left_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'visitor', NULL, NULL, 1, ?, ?)
            ON CONFLICT(person_id, parish_id, status) DO UPDATE SET active = 1, left_date = NULL, updated_at = excluded.updated_at`,
      params: [generateSecret('dir_affil'), personId, parishId, timestamp, timestamp],
    },
    auditStatement({
      action: linked ? 'directory.ministry.profile_affiliation_linked' : 'directory.ministry.profile_person_created',
      actor,
      parishId,
      targetType: 'directory_person',
      targetId: personId,
      after: { source: 'myagapay_parish_profile', ministryAssignment: true },
      correlationId,
    })
  );
  await runAtomic(env, statements);
  return personId;
}
async function assignMinistryParticipantCandidate(
  env,
  { context, ministryId, candidateId, personId = '', correlationId = '', ...options }
) {
  const resolvedPersonId = parishProfileEmail(candidateId)
    ? await ensureParishProfileDirectoryPerson(env, { context, candidateId, correlationId })
    : String(personId || candidateId || '').trim();
  return assignMinistryParticipant(env, { context, ministryId, personId: resolvedPersonId, correlationId, ...options });
}
async function removeMinistryParticipant(env, { context, participantId, reasonCode = '', correlationId = '' }) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First(
    env,
    "SELECT * FROM directory_ministry_participants WHERE id = ?1 AND parish_id = ?2 AND status IN ('active','paused')",
    participantId,
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry participant assignment was not found.', 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_ministry_participants SET status = 'removed', end_at = ?1, publication_preference = 'hidden', approved_publication = 0, updated_at = ?1, revision = revision + 1 WHERE id = ?2",
      params: [timestamp, participantId],
    },
    auditStatement({
      action: 'directory.ministry.participant_removed',
      actor,
      parishId,
      targetType: 'directory_ministry_participant',
      targetId: participantId,
      metadata: { ministryId: row.ministry_id, personId: row.person_id, reasonCode },
      correlationId,
    }),
  ]);
  return { ok: true, ministryId: row.ministry_id };
}
async function setMinistryParticipationPublication(
  env,
  { context, participantId, preference = 'hidden', approvedPublication = false, correlationId = '' }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First(
    env,
    'SELECT * FROM directory_ministry_participants WHERE id = ?1 AND parish_id = ?2',
    participantId,
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry participant assignment was not found.', 404);
  const pref = enumValue(preference, ['hidden', 'directory'], 'publicationPreference', 'hidden');
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_ministry_participants SET publication_preference = ?1, approved_publication = ?2, updated_at = ?3, revision = revision + 1 WHERE id = ?4',
      params: [pref, approvedPublication ? 1 : 0, timestamp, participantId],
    },
    auditStatement({
      action: 'directory.ministry.participation_publication_updated',
      actor,
      parishId,
      targetType: 'directory_ministry_participant',
      targetId: participantId,
      metadata: { preference: pref, approvedPublication: Boolean(approvedPublication) },
      correlationId,
    }),
  ]);
  return { ok: true, participantId };
}
export {
  assignMinistryParticipant,
  assignMinistryParticipantCandidate,
  ensureParishProfileDirectoryPerson,
  removeMinistryParticipant,
  searchMinistryParticipantCandidates,
  setMinistryParticipationPublication,
};
