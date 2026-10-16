// Generated from src/directory/ministry-interest.ts by npm run build:server. Do not edit.
import {
  MINISTRY_PARTICIPATION_TYPES,
  MANAGE_CAPS,
  REVIEW_CAPS,
  parishIdFor,
  personIdFor,
  hasAny,
  actorFromContext,
  requireReview,
  enumValue,
  participantDto,
  requestDto,
  loadMinistry,
  loadAdultPerson,
  isParticipant,
  memberCanSeeMinistry,
  notificationStatement,
  d1All,
  d1First,
  generateSecret,
  DirectoryServiceError,
  getDirectorySettings,
  auditStatement,
  cleanText,
  nowMs,
  runAtomic,
} from './ministries-shared.js';
import './ministries.js';
import './ministry-participants.js';
import './ministry-publication.js';
async function submitMinistryInterest(
  env,
  { context, ministryId, interestType = 'participant', memberNote = '', correlationId = '' }
) {
  const requesterPersonId = personIdFor(context);
  if (!requesterPersonId)
    throw new DirectoryServiceError('unauthorized', 'A linked adult directory profile is required.', 401);
  const parishId = parishIdFor(context);
  const settings = await getDirectorySettings(env, parishId);
  if (!settings.directoryEnabled) throw new DirectoryServiceError('not_found', 'Ministry was not found.', 404);
  const ministry = await loadMinistry(env, { parishId, ministryId });
  if (ministry.status !== 'active' || ministry.request_policy !== 'request_interest')
    throw new DirectoryServiceError('requests_closed', 'This ministry is not accepting interest requests.', 409);
  if (!memberCanSeeMinistry(ministry, context, false))
    throw new DirectoryServiceError('not_found', 'Ministry was not found.', 404);
  const person = await loadAdultPerson(env, { parishId, personId: requesterPersonId });
  if (await isParticipant(env, { parishId, ministryId, personId: person.id }))
    throw new DirectoryServiceError('already_participating', 'You are already listed for this ministry.', 409);
  const type = enumValue(interestType, MINISTRY_PARTICIPATION_TYPES, 'interestType', 'participant');
  const timestamp = nowMs();
  const id = generateSecret('dir_min_interest');
  const actor = actorFromContext(context);
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_interest_requests
              (id, parish_id, ministry_id, person_id, requester_user_id, requester_person_id,
               interest_type, member_note, status, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
      params: [
        id,
        parishId,
        ministryId,
        person.id,
        context.user.id,
        person.id,
        type,
        cleanText(memberNote, { max: 500 }),
        timestamp,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.ministry.interest_submitted',
      actor,
      parishId,
      targetType: 'directory_ministry_interest_request',
      targetId: id,
      metadata: { ministryId, interestType: type },
      correlationId,
    }),
    notificationStatement({
      context,
      recipientUserId: context.user.id,
      eventType: 'directory.ministry.interest.submitted',
      targetId: id,
      safeMessage: 'Your ministry interest request was submitted.',
    }),
  ]);
  return getMinistryInterestRequest(env, { context, requestId: id });
}
async function withdrawMinistryInterest(env, { context, requestId, correlationId = '' }) {
  const parishId = parishIdFor(context);
  const row = await d1First(
    env,
    'SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2',
    requestId,
    parishId
  );
  if (!row || row.requester_user_id !== context.user.id)
    throw new DirectoryServiceError('not_found', 'Ministry interest request was not found.', 404);
  if (!['submitted', 'under_review', 'returned'].includes(row.status)) return requestDto(row);
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  await runAtomic(env, [
    {
      sql: "UPDATE directory_ministry_interest_requests SET status = 'withdrawn', withdrawn_at = ?1, updated_at = ?1, revision = revision + 1 WHERE id = ?2",
      params: [timestamp, requestId],
    },
    auditStatement({
      action: 'directory.ministry.interest_withdrawn',
      actor,
      parishId,
      targetType: 'directory_ministry_interest_request',
      targetId: requestId,
      metadata: { ministryId: row.ministry_id },
      correlationId,
    }),
  ]);
  return getMinistryInterestRequest(env, { context, requestId });
}
async function getMinistryInterestRequest(env, { context, requestId }) {
  const parishId = parishIdFor(context);
  const row = await d1First(
    env,
    `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r
       JOIN directory_ministries m ON m.id = r.ministry_id
      WHERE r.parish_id = ?1 AND r.id = ?2`,
    parishId,
    requestId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Ministry interest request was not found.', 404);
  if (row.requester_user_id !== context.user.id && !hasAny(context, REVIEW_CAPS) && !hasAny(context, MANAGE_CAPS)) {
    throw new DirectoryServiceError('not_found', 'Ministry interest request was not found.', 404);
  }
  return requestDto(row);
}
async function getMyMinistries(env, { context }) {
  const personId = personIdFor(context);
  if (!personId) return { participations: [], requests: [] };
  const parishId = parishIdFor(context);
  const participations = await d1All(
    env,
    `SELECT mp.*, p.preferred_name, m.display_name, m.slug, m.category
       FROM directory_ministry_participants mp
       JOIN directory_ministries m ON m.id = mp.ministry_id
       JOIN directory_people p ON p.id = mp.person_id
      WHERE mp.parish_id = ?1 AND mp.person_id = ?2
      ORDER BY m.display_order ASC, m.display_name ASC`,
    parishId,
    personId
  );
  const requests = await d1All(
    env,
    `SELECT r.*, m.display_name FROM directory_ministry_interest_requests r
       JOIN directory_ministries m ON m.id = r.ministry_id
      WHERE r.parish_id = ?1 AND r.person_id = ?2
      ORDER BY r.created_at DESC LIMIT 50`,
    parishId,
    personId
  );
  return {
    participations: participations.map((row) => ({
      ...participantDto(row),
      ministryName: row.display_name,
      slug: row.slug,
      category: row.category,
    })),
    requests: requests.map(requestDto),
  };
}
async function approveMinistryInterestReview(env, { context, row, reviewerNote = '', correlationId = '' }) {
  requireReview(context);
  const parishId = parishIdFor(context);
  const request = await d1First(
    env,
    "SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted','under_review','returned')",
    row.source_id,
    parishId
  );
  if (!request)
    throw new DirectoryServiceError(
      'invalid_transition',
      'Only active ministry interest requests can be approved.',
      409
    );
  if (request.requester_user_id === context.user.id)
    throw new DirectoryServiceError(
      'self_approval_denied',
      'Reviewers cannot approve their own ministry interest request.',
      403
    );
  const ministry = await loadMinistry(env, { parishId, ministryId: request.ministry_id });
  if (ministry.status !== 'active' || ministry.request_policy !== 'request_interest')
    throw new DirectoryServiceError('requests_closed', 'This ministry can no longer accept interest approval.', 409);
  const person = await loadAdultPerson(env, { parishId, personId: request.person_id });
  if (await isParticipant(env, { parishId, ministryId: request.ministry_id, personId: person.id })) {
    throw new DirectoryServiceError('duplicate_participation', 'This person is already active in the ministry.', 409);
  }
  const actor = actorFromContext(context);
  const timestamp = nowMs();
  const participantId = generateSecret('dir_min_part');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_ministry_participants
              (id, parish_id, ministry_id, person_id, source, status, participation_type,
               publication_preference, approved_publication, start_at, assigned_by_user_id,
               request_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'member_requested', 'active', ?, 'hidden', 0, ?, ?, ?, ?, ?)`,
      params: [
        participantId,
        parishId,
        request.ministry_id,
        person.id,
        request.interest_type,
        timestamp,
        context.user.id,
        request.id,
        timestamp,
        timestamp,
      ],
    },
    {
      sql: "UPDATE directory_ministry_interest_requests SET status = 'approved', reviewer_note = ?1, reviewed_by_user_id = ?2, resolved_at = ?3, updated_at = ?3, revision = revision + 1 WHERE id = ?4",
      params: [cleanText(reviewerNote, { max: 500 }), context.user.id, timestamp, request.id],
    },
    auditStatement({
      action: 'directory.ministry.interest_approved',
      actor,
      parishId,
      targetType: 'directory_ministry_interest_request',
      targetId: request.id,
      metadata: { ministryId: request.ministry_id, participantId },
      correlationId,
    }),
    auditStatement({
      action: 'directory.ministry.participant_assigned',
      actor,
      parishId,
      targetType: 'directory_ministry_participant',
      targetId: participantId,
      metadata: { source: 'member_requested', grantsCapability: false },
      correlationId,
    }),
    notificationStatement({
      context,
      recipientUserId: request.requester_user_id,
      eventType: 'directory.ministry.interest.approved',
      targetId: request.id,
      safeMessage: 'Your ministry interest request was approved.',
    }),
  ]);
  return { ok: true, participantId };
}
async function closeMinistryInterestReview(
  env,
  { context, row, decision, reviewerNote = '', reasonCode = '', correlationId = '' }
) {
  requireReview(context);
  const parishId = parishIdFor(context);
  const request = await d1First(
    env,
    "SELECT * FROM directory_ministry_interest_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted','under_review','returned')",
    row.source_id,
    parishId
  );
  if (!request)
    throw new DirectoryServiceError('invalid_transition', 'Only active ministry interest requests can be closed.', 409);
  const status = decision === 'return' ? 'returned' : decision === 'cancel' ? 'cancelled' : 'rejected';
  const timestamp = nowMs();
  const actor = actorFromContext(context);
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_ministry_interest_requests SET status = ?1, reviewer_note = ?2, reviewed_by_user_id = ?3, resolved_at = ?4, updated_at = ?4, revision = revision + 1 WHERE id = ?5',
      params: [status, cleanText(reviewerNote, { max: 500 }), context.user.id, timestamp, request.id],
    },
    auditStatement({
      action: `directory.ministry.interest_${status}`,
      actor,
      parishId,
      targetType: 'directory_ministry_interest_request',
      targetId: request.id,
      metadata: { ministryId: request.ministry_id, reasonCode },
      correlationId,
    }),
    notificationStatement({
      context,
      recipientUserId: request.requester_user_id,
      eventType: `directory.ministry.interest.${status}`,
      targetId: request.id,
      safeMessage:
        status === 'returned'
          ? 'Your ministry interest request was returned for follow-up.'
          : 'Your ministry interest request was reviewed.',
    }),
  ]);
  return { ok: true, decision };
}
export {
  approveMinistryInterestReview,
  closeMinistryInterestReview,
  getMinistryInterestRequest,
  getMyMinistries,
  submitMinistryInterest,
  withdrawMinistryInterest,
};
