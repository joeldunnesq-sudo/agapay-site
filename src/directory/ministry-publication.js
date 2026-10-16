// Generated from src/directory/ministry-publication.ts by npm run build:server. Do not edit.
import {
  personIdFor,
  ministryDto,
  resolvePersonAlias,
  loadMinistry,
  isParticipant,
  memberCanSeeMinistry,
  visibleLeaders,
  visibleParticipants,
  viewerStatus,
  d1All,
  DirectoryServiceError,
  getPersonPrivacyFlags,
} from './ministries-shared.js';
import './ministries.js';
import './ministry-participants.js';
import './ministry-interest.js';
async function listPublishedMinistries(
  env,
  { context, q = '', category = '', acceptingInterest = false, limit = 50, cursor = '' } = {}
) {
  const rows = await d1All(
    env,
    "SELECT * FROM directory_ministries WHERE parish_id = ?1 AND status IN ('active','paused') ORDER BY display_order ASC, display_name ASC",
    context.parishId
  );
  const query = String(q || '')
    .trim()
    .toLowerCase();
  const out = [];
  for (const row of rows) {
    const participant = personIdFor(context)
      ? await isParticipant(env, {
          parishId: context.parishId,
          ministryId: row.id,
          personId: personIdFor(context),
        })
      : false;
    if (!memberCanSeeMinistry(row, context, participant)) continue;
    if (category && row.category !== category) continue;
    if (acceptingInterest && !(row.status === 'active' && row.request_policy === 'request_interest')) continue;
    if (query.length >= 2 && !`${row.display_name} ${row.short_description || ''}`.toLowerCase().includes(query))
      continue;
    out.push(
      ministryDto(row, {
        leaderCount: (await visibleLeaders(env, context, row.id)).length,
        visibleParticipantCount: await visibleParticipants(env, context, row.id),
      })
    );
  }
  const pageLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const offset = Math.max(0, Number(String(cursor || '0').replace(/\D/g, '')) || 0);
  const page = out.slice(offset, offset + pageLimit + 1);
  return {
    items: page.slice(0, pageLimit),
    totalVisible: out.length,
    nextCursor: page.length > pageLimit ? String(offset + pageLimit) : '',
  };
}
async function getPublishedMinistry(env, { context, ministryId = '', slug = '' }) {
  const row = await loadMinistry(env, { parishId: context.parishId, ministryId, slug });
  const participant = personIdFor(context)
    ? await isParticipant(env, {
        parishId: context.parishId,
        ministryId: row.id,
        personId: personIdFor(context),
      })
    : false;
  if (!memberCanSeeMinistry(row, context, participant))
    throw new DirectoryServiceError('not_found', 'Ministry was not found.', 404);
  const [leaders, participants, status] = await Promise.all([
    visibleLeaders(env, context, row.id),
    visibleParticipants(env, context, row.id, {
      includeList: row.participant_publication_policy === 'opt_in_reviewed',
    }),
    viewerStatus(env, context, row.id),
  ]);
  return {
    ministry: ministryDto(row, {
      leaders,
      visibleParticipants: participants,
      visibleParticipantCount: participants.length,
      viewerStatus: status,
    }),
  };
}
async function publishedMinistryAffiliationsForPerson(env, { context, personId }) {
  const resolvedId = await resolvePersonAlias(env, { parishId: context.parishId, personId });
  const [participantRows, leaderRows] = await Promise.all([
    d1All(
      env,
      `SELECT m.id, m.display_name, m.slug, m.category, m.display_order, mp.participation_type,
              CASE WHEN ml.id IS NULL THEN '' ELSE ml.assignment_type END AS leadership_type
         FROM directory_ministry_participants mp
         JOIN directory_ministries m ON m.id = mp.ministry_id
         LEFT JOIN directory_ministry_leaders ml
           ON ml.parish_id = mp.parish_id AND ml.ministry_id = mp.ministry_id
          AND ml.person_id = mp.person_id AND ml.active = 1 AND ml.publication_state = 'published'
        WHERE mp.parish_id = ?1 AND mp.person_id = ?2
          AND mp.status = 'active'
          AND mp.publication_preference = 'directory' AND mp.approved_publication = 1
          AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')`,
      context.parishId,
      resolvedId
    ),
    d1All(
      env,
      `SELECT m.id, m.display_name, m.slug, m.category, m.display_order,
              '' AS participation_type, ml.assignment_type AS leadership_type
         FROM directory_ministry_leaders ml
         JOIN directory_ministries m ON m.id = ml.ministry_id
        WHERE ml.parish_id = ?1 AND ml.person_id = ?2
          AND ml.active = 1 AND ml.publication_state = 'published'
          AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')`,
      context.parishId,
      resolvedId
    ),
  ]);
  const flags = await getPersonPrivacyFlags(env, { parishId: context.parishId, personId: resolvedId });
  if (flags.isChild || flags.protectedPerson) return [];
  const affiliations = new Map(participantRows.map((row) => [row.id, row]));
  for (const leader of leaderRows) {
    const existing = affiliations.get(leader.id);
    affiliations.set(leader.id, existing ? { ...existing, leadership_type: leader.leadership_type } : leader);
  }
  const rows = [...affiliations.values()].sort(
    (a, b) =>
      Number(a.display_order || 100) - Number(b.display_order || 100) ||
      String(a.display_name || '').localeCompare(String(b.display_name || ''))
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    slug: row.slug,
    category: row.category,
    participationType: row.participation_type,
    leadershipType: row.leadership_type || '',
    profileUrl: `/myagapay/directory?view=ministry&id=${encodeURIComponent(row.id)}`,
  }));
}
async function personIdsWithPublishedMinistry(env, { context, ministryId }) {
  const rows = await d1All(
    env,
    `SELECT published.person_id
       FROM (
         SELECT mp.person_id
           FROM directory_ministry_participants mp
           JOIN directory_ministries m ON m.id = mp.ministry_id
          WHERE mp.parish_id = ?1 AND mp.ministry_id = ?2
            AND mp.status = 'active' AND mp.publication_preference = 'directory' AND mp.approved_publication = 1
            AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')
         UNION
         SELECT ml.person_id
           FROM directory_ministry_leaders ml
           JOIN directory_ministries m ON m.id = ml.ministry_id
          WHERE ml.parish_id = ?1 AND ml.ministry_id = ?2
            AND ml.active = 1 AND ml.publication_state = 'published'
            AND m.status IN ('active','paused') AND m.visibility IN ('parish_members','participants_only')
       ) published
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = published.person_id AND f.active = 1
      WHERE 1 = 1
        AND COALESCE(f.protected_person, 0) = 0 AND COALESCE(f.is_child, 0) = 0`,
    context.parishId,
    ministryId
  );
  return new Set(rows.map((row) => row.person_id));
}
export {
  getPublishedMinistry,
  listPublishedMinistries,
  personIdsWithPublishedMinistry,
  publishedMinistryAffiliationsForPerson,
};
