import type { MinistryContext, MinistrySqlRow } from './ministries-contracts.js';
import {
  MINISTRY_CATEGORIES,
  MINISTRY_STATUSES,
  MINISTRY_VISIBILITIES,
  MINISTRY_REQUEST_POLICIES,
  MINISTRY_LEADERSHIP_TYPES,
  parishIdFor,
  requireManage,
  enumValue,
  slugify,
  ministryDto,
  leaderDto,
  participantDto,
  requestDto,
  loadMinistry,
  loadAdultPerson,
  d1All,
  d1First,
  generateSecret,
  DirectoryServiceError,
  auditStatement,
  cleanText,
  nowMs,
  runAtomic,
} from './ministries-shared.js';
import './ministry-participants.js';
import './ministry-publication.js';
import './ministry-interest.js';
export {
  assignMinistryParticipant,
  searchMinistryParticipantCandidates,
  ensureParishProfileDirectoryPerson,
  assignMinistryParticipantCandidate,
  removeMinistryParticipant,
  setMinistryParticipationPublication,
} from './ministry-participants.js';
export {
  listPublishedMinistries,
  getPublishedMinistry,
  publishedMinistryAffiliationsForPerson,
  personIdsWithPublishedMinistry,
} from './ministry-publication.js';
export {
  submitMinistryInterest,
  withdrawMinistryInterest,
  getMinistryInterestRequest,
  getMyMinistries,
  approveMinistryInterestReview,
  closeMinistryInterestReview,
} from './ministry-interest.js';

export async function setMinistryImage(
  env: Partial<Env>,
  {
    context,
    ministryId,
    storageKey,
    contentType,
    correlationId = '',
  }: { context: MinistryContext; ministryId: unknown; storageKey: string; contentType: string; correlationId?: string }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_ministries
               SET image_storage_key = ?, image_content_type = ?, image_updated_at = ?,
                   updated_by_user_id = ?, updated_at = ?, revision = revision + 1
             WHERE id = ? AND parish_id = ?`,
      params: [
        storageKey || null,
        contentType || null,
        storageKey ? timestamp : null,
        actor.userId,
        timestamp,
        ministryId,
        parishId,
      ],
    },
    auditStatement({
      action: storageKey ? 'directory.ministry.image_updated' : 'directory.ministry.image_removed',
      actor,
      parishId,
      targetType: 'directory_ministry',
      targetId: ministryId as string,
      metadata: { hadImage: Boolean(row.image_storage_key) },
      correlationId,
    }),
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function deleteMinistry(
  env: Partial<Env>,
  { context, ministryId, correlationId = '' }: { context: MinistryContext; ministryId: unknown; correlationId?: string }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  const messages = await d1All<MinistrySqlRow>(
    env,
    'SELECT id FROM parish_group_messages WHERE parish_id = ?1 AND ministry_id = ?2',
    parishId,
    ministryId
  );
  const requests = await d1All<MinistrySqlRow>(
    env,
    'SELECT id FROM directory_ministry_interest_requests WHERE parish_id = ?1 AND ministry_id = ?2',
    parishId,
    ministryId
  );
  const statements = [
    {
      sql: "DELETE FROM directory_review_metadata WHERE parish_id = ?1 AND source_type = 'ministry_interest' AND source_id IN (SELECT id FROM directory_ministry_interest_requests WHERE parish_id = ?1 AND ministry_id = ?2)",
      params: [parishId, ministryId],
    },
    {
      sql: "DELETE FROM parish_content_reads WHERE parish_id = ?1 AND content_type = 'group_message' AND content_id IN (SELECT id FROM parish_group_messages WHERE parish_id = ?1 AND ministry_id = ?2)",
      params: [parishId, ministryId],
    },
    {
      sql: 'DELETE FROM parish_group_messages WHERE parish_id = ?1 AND ministry_id = ?2',
      params: [parishId, ministryId],
    },
    { sql: 'DELETE FROM directory_ministries WHERE parish_id = ?1 AND id = ?2', params: [parishId, ministryId] },
    auditStatement({
      action: 'directory.ministry.deleted',
      actor,
      parishId,
      targetType: 'directory_ministry',
      targetId: ministryId as string,
      before: ministryDto(row),
      metadata: { messageCount: messages.length, requestCount: requests.length },
      correlationId,
    }),
  ];
  await runAtomic(env, statements);
  return { ok: true, ministryId, imageStorageKey: row.image_storage_key || '', messageCount: messages.length };
}

export async function createMinistry(
  env: Partial<Env>,
  {
    context,
    data = {},
    correlationId = '',
  }: { context: MinistryContext; data?: Record<string, unknown>; correlationId?: string }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const name = cleanText(data.displayName || data.canonicalName, { required: true, max: 160, field: 'displayName' });
  const canonicalName = cleanText(data.canonicalName || name, { required: true, max: 160, field: 'canonicalName' });
  const slug = slugify(data.slug || name);
  const category = enumValue(data.category, MINISTRY_CATEGORIES, 'category', 'other');
  const status = enumValue(data.status, MINISTRY_STATUSES, 'status', 'draft');
  const visibility = enumValue(data.visibility, MINISTRY_VISIBILITIES, 'visibility', 'parish_members');
  const requestPolicy = enumValue(data.requestPolicy, MINISTRY_REQUEST_POLICIES, 'requestPolicy', 'closed');
  const timestamp = nowMs();
  const id = generateSecret('dir_ministry');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministries
              (id, parish_id, canonical_name, display_name, slug, short_description, detailed_description,
               category, status, visibility, request_policy, participant_publication_policy,
               leader_publication_policy, child_participation_policy, display_order,
               created_by_user_id, updated_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'excluded', ?, ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        canonicalName,
        name,
        slug,
        cleanText(data.shortDescription, { max: 300 }),
        cleanText(data.detailedDescription, { max: 1200 }),
        category,
        status,
        visibility,
        requestPolicy,
        enumValue(
          data.participantPublicationPolicy,
          ['hidden', 'opt_in_reviewed', 'leaders_only'],
          'participantPublicationPolicy',
          'opt_in_reviewed'
        ),
        enumValue(data.leaderPublicationPolicy, ['hidden', 'reviewed'], 'leaderPublicationPolicy', 'reviewed'),
        Number(data.displayOrder || 100),
        actor.userId,
        actor.userId,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.ministry.created',
      actor,
      parishId,
      targetType: 'directory_ministry',
      targetId: id,
      after: { name, status, visibility, requestPolicy },
      correlationId,
    }),
  ]);
  return getMinistryAdmin(env, { context, ministryId: id });
}

export async function updateMinistry(
  env: Partial<Env>,
  {
    context,
    ministryId,
    patch = {},
    correlationId = '',
  }: { context: MinistryContext; ministryId: unknown; patch?: Record<string, unknown>; correlationId?: string }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  if (patch.expectedVersion && patch.expectedVersion !== ministryDto(row)!.version)
    throw new DirectoryServiceError('stale_record', 'Ministry changed. Refresh before updating.', 409);
  const next = {
    canonicalName: cleanText(patch.canonicalName ?? row.canonical_name, {
      required: true,
      max: 160,
      field: 'canonicalName',
    }),
    displayName: cleanText(patch.displayName ?? row.display_name, { required: true, max: 160, field: 'displayName' }),
    slug: patch.slug ? slugify(patch.slug) : row.slug,
    shortDescription: cleanText(patch.shortDescription ?? row.short_description, { max: 300 }),
    detailedDescription: cleanText(patch.detailedDescription ?? row.detailed_description, { max: 1200 }),
    category: enumValue(patch.category ?? row.category, MINISTRY_CATEGORIES, 'category'),
    status: enumValue(patch.status ?? row.status, MINISTRY_STATUSES, 'status'),
    visibility: enumValue(patch.visibility ?? row.visibility, MINISTRY_VISIBILITIES, 'visibility'),
    requestPolicy: enumValue(patch.requestPolicy ?? row.request_policy, MINISTRY_REQUEST_POLICIES, 'requestPolicy'),
    participantPublicationPolicy: enumValue(
      patch.participantPublicationPolicy ?? row.participant_publication_policy,
      ['hidden', 'opt_in_reviewed', 'leaders_only'],
      'participantPublicationPolicy'
    ),
    leaderPublicationPolicy: enumValue(
      patch.leaderPublicationPolicy ?? row.leader_publication_policy,
      ['hidden', 'reviewed'],
      'leaderPublicationPolicy'
    ),
    displayOrder: Number(patch.displayOrder ?? row.display_order ?? 100),
  };
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_ministries
               SET canonical_name = ?, display_name = ?, slug = ?, short_description = ?, detailed_description = ?,
                   category = ?, status = ?, visibility = ?, request_policy = ?, participant_publication_policy = ?,
                   leader_publication_policy = ?, display_order = ?, updated_by_user_id = ?, updated_at = ?,
                   archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, ?) ELSE archived_at END,
                   revision = revision + 1
             WHERE id = ? AND parish_id = ?`,
      params: [
        next.canonicalName,
        next.displayName,
        next.slug,
        next.shortDescription,
        next.detailedDescription,
        next.category,
        next.status,
        next.visibility,
        next.requestPolicy,
        next.participantPublicationPolicy,
        next.leaderPublicationPolicy,
        next.displayOrder,
        actor.userId,
        timestamp,
        next.status,
        timestamp,
        ministryId,
        parishId,
      ],
    },
    auditStatement({
      action: 'directory.ministry.updated',
      actor,
      parishId,
      targetType: 'directory_ministry',
      targetId: ministryId as string,
      before: ministryDto(row),
      after: next,
      correlationId,
    }),
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function listMinistriesAdmin(
  env: Partial<Env>,
  {
    context,
    status = '',
    query = '',
    limit = 100,
  }: { context: MinistryContext; status?: string; query?: string; limit?: unknown } = {} as { context: MinistryContext }
) {
  requireManage(context);
  const parishId = parishIdFor(context);
  const rows = await d1All<MinistrySqlRow>(
    env,
    'SELECT * FROM directory_ministries WHERE parish_id = ?1 ORDER BY display_order ASC, display_name ASC LIMIT ?2',
    parishId,
    Math.min(Number(limit) || 100, 200)
  );
  const q = String(query || '')
    .trim()
    .toLowerCase();
  return rows
    .filter((row) => !status || row.status === status)
    .filter((row) => !q || `${row.display_name} ${row.short_description || ''}`.toLowerCase().includes(q))
    .map((row) => ministryDto(row));
}

export async function getMinistryAdmin(
  env: Partial<Env>,
  { context, ministryId }: { context: MinistryContext; ministryId: unknown }
) {
  requireManage(context);
  const parishId = parishIdFor(context);
  const row = await loadMinistry(env, { parishId, ministryId });
  const [leaders, participants, requests] = await Promise.all([
    d1All<MinistrySqlRow>(
      env,
      `SELECT ml.*, p.preferred_name FROM directory_ministry_leaders ml JOIN directory_people p ON p.id = ml.person_id WHERE ml.parish_id = ?1 AND ml.ministry_id = ?2 AND ml.active = 1 ORDER BY p.preferred_name`,
      parishId,
      ministryId
    ),
    d1All<MinistrySqlRow>(
      env,
      `SELECT mp.*, p.preferred_name FROM directory_ministry_participants mp JOIN directory_people p ON p.id = mp.person_id WHERE mp.parish_id = ?1 AND mp.ministry_id = ?2 AND mp.status IN ('active','paused') ORDER BY p.preferred_name`,
      parishId,
      ministryId
    ),
    d1All<MinistrySqlRow>(
      env,
      `SELECT r.*, m.display_name, p.preferred_name FROM directory_ministry_interest_requests r JOIN directory_ministries m ON m.id = r.ministry_id LEFT JOIN directory_people p ON p.id = r.person_id WHERE r.parish_id = ?1 AND r.ministry_id = ?2 ORDER BY r.created_at DESC LIMIT 25`,
      parishId,
      ministryId
    ),
  ]);
  return {
    ministry: ministryDto(row)!,
    leaders: leaders.map(leaderDto),
    participants: participants.map(participantDto),
    requests: requests.map(requestDto),
  };
}

export async function assignMinistryLeader(
  env: Partial<Env>,
  {
    context,
    ministryId,
    personId,
    assignmentType = 'leader',
    publish = false,
    correlationId = '',
  }: {
    context: MinistryContext;
    ministryId: unknown;
    personId?: unknown;
    assignmentType?: string;
    publish?: boolean;
    correlationId?: string;
  }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  await loadMinistry(env, { parishId, ministryId });
  const person = await loadAdultPerson(env, { parishId, personId });
  const type = enumValue(assignmentType, MINISTRY_LEADERSHIP_TYPES, 'assignmentType', 'leader');
  const timestamp = nowMs();
  const id = generateSecret('dir_min_leader');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_leaders
              (id, parish_id, ministry_id, person_id, assignment_type, publication_state,
               active, effective_at, assigned_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        ministryId,
        person.id,
        type,
        publish ? 'published' : 'hidden',
        timestamp,
        actor.userId,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.ministry.leader_assigned',
      actor,
      parishId,
      targetType: 'directory_ministry_leader',
      targetId: id,
      metadata: { ministryId, personId: person.id, assignmentType: type, displayOnly: true },
      correlationId,
    }),
  ]);
  return getMinistryAdmin(env, { context, ministryId });
}

export async function endMinistryLeader(
  env: Partial<Env>,
  { context, leaderId, correlationId = '' }: { context: MinistryContext; leaderId: unknown; correlationId?: string }
) {
  const actor = requireManage(context);
  const parishId = parishIdFor(context);
  const row = await d1First<MinistrySqlRow>(
    env,
    'SELECT * FROM directory_ministry_leaders WHERE id = ?1 AND parish_id = ?2 AND active = 1',
    leaderId,
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry leader assignment was not found.', 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_ministry_leaders SET active = 0, ended_at = ?1, updated_at = ?1, revision = revision + 1 WHERE id = ?2',
      params: [timestamp, leaderId],
    },
    auditStatement({
      action: 'directory.ministry.leader_ended',
      actor,
      parishId,
      targetType: 'directory_ministry_leader',
      targetId: leaderId as string,
      metadata: { ministryId: row.ministry_id, personId: row.person_id },
      correlationId,
    }),
  ]);
  return { ok: true, ministryId: row.ministry_id };
}
export {
  MINISTRY_CATEGORIES,
  MINISTRY_STATUSES,
  MINISTRY_VISIBILITIES,
  MINISTRY_REQUEST_POLICIES,
  MINISTRY_LEADERSHIP_TYPES,
  MINISTRY_PARTICIPATION_TYPES,
} from './ministries-shared.js';
