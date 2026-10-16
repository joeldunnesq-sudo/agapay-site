import type { DirectoryReviewSqlRow, DirectoryReviewContext } from './admin-composition-contracts.js';

import '../lib/entitlements.js';

import { actorDto } from './admin-actor.js';

import { resolveAuthorizationContext } from '../lib/authorization.js';

import '../lib/core.js';

import '../handlers/parish.js';

import '../lib/household-verification.js';

import './foundation.js';

import { DirectoryServiceError } from './foundation.js';

import './publication.js';

import './privacy.js';

import './media.js';

import './media-transform.js';

import './duplicates.js';

import './child-publication.js';

import { closeMinistryInterestReview } from './ministries.js';

import './settings.js';

import { directoryReviewMessageStatement } from './review-correspondence.js';

import './household-share-invitations.js';

import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
import { PRIORITIES, DECISIONS } from './admin-shared.js';
import { requireAny } from './admin-context.js';
import { metadataDto, reviewDefinition, getReviewRow, getDirectoryReviewItem } from './admin-review-queue.js';
import { ensureMetadata, notificationStatement, reviewNotification } from './admin-shared.js';
import './admin-media-operations.js';
import './admin-person-records.js';
import { approveReviewItem } from './admin-review-approval.js';
import './admin-household-records.js';
import './admin-notes-duplicates.js';

export async function assignDirectoryReviewItem(
  env: Partial<Env>,
  {
    context,
    sourceType,
    sourceId,
    assigneeUserId = '',
    correlationId = '',
  }: {
    context: DirectoryReviewContext;
    sourceType?: unknown;
    sourceId?: unknown;
    assigneeUserId?: unknown;
    correlationId?: string;
  }
) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  if (assigneeUserId && assigneeUserId !== context.user.id)
    requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  const cleanedAssignee = cleanText(assigneeUserId || context.user.id, {
    required: true,
    max: 180,
    field: 'assigneeUserId',
  });
  const auth = await resolveAuthorizationContext(env, { userId: cleanedAssignee, parishId: context.parishId });
  if (
    !auth.membership ||
    !reviewDefinition(row).capabilities.some((capability) => auth.capabilities.includes(capability))
  ) {
    throw new DirectoryServiceError('invalid_assignee', 'Assignee is not an eligible reviewer for this item.', 422);
  }
  if (cleanedAssignee === row.requester_user_id)
    throw new DirectoryServiceError(
      'self_assignment_denied',
      'Requester cannot be assigned to review their own request.',
      403
    );
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_review_metadata
             SET queue_status = 'assigned', assigned_to_user_id = ?, assigned_by_user_id = ?,
                 assigned_at = ?, updated_at = ?
           WHERE id = ?`,
      params: [cleanedAssignee, context.user.id, timestamp, timestamp, id],
    },
    auditStatement({
      action: 'directory.review_item.assigned',
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      after: { assigneeUserId: cleanedAssignee },
      correlationId,
    }),
  ]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function unassignDirectoryReviewItem(
  env: Partial<Env>,
  {
    context,
    sourceType,
    sourceId,
    correlationId = '',
  }: { context: DirectoryReviewContext; sourceType?: unknown; sourceId?: unknown; correlationId?: string }
) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  if (row.assigned_to_user_id !== context.user.id)
    requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_review_metadata SET queue_status = 'pending_review', assigned_to_user_id = NULL, assigned_by_user_id = NULL, assigned_at = NULL, updated_at = ? WHERE id = ?",
      params: [timestamp, id],
    },
    auditStatement({
      action: 'directory.review_item.unassigned',
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      correlationId,
    }),
  ]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function changeDirectoryReviewPriority(
  env: Partial<Env>,
  {
    context,
    sourceType,
    sourceId,
    priority,
    correlationId = '',
  }: {
    context: DirectoryReviewContext;
    sourceType?: unknown;
    sourceId?: unknown;
    priority?: unknown;
    correlationId?: string;
  }
) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.assignmentsManage]);
  const cleanedPriority = cleanText(priority, { required: true, max: 40, field: 'priority' });
  if (!PRIORITIES.has(cleanedPriority))
    throw new DirectoryServiceError('validation_failed', 'Review priority is not supported.');
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_review_metadata SET priority = ?, updated_at = ? WHERE id = ?',
      params: [cleanedPriority, timestamp, id],
    },
    auditStatement({
      action: 'directory.review_item.priority_changed',
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      after: { priority: cleanedPriority },
      correlationId,
    }),
  ]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function beginDirectoryReview(
  env: Partial<Env>,
  {
    context,
    sourceType,
    sourceId,
    correlationId = '',
  }: { context: DirectoryReviewContext; sourceType?: unknown; sourceId?: unknown; correlationId?: string }
) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id)
    throw new DirectoryServiceError('assigned_elsewhere', 'This item is assigned to another reviewer.', 409);
  if (row.queue_status === 'in_review') return getDirectoryReviewItem(env, { context, sourceType, sourceId });
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_review_metadata SET queue_status = 'in_review', review_started_at = COALESCE(review_started_at, ?), updated_at = ? WHERE id = ?",
      params: [timestamp, timestamp, id],
    },
    auditStatement({
      action: 'directory.review_item.opened',
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      correlationId,
    }),
  ]);
  return getDirectoryReviewItem(env, { context, sourceType, sourceId });
}

export async function decideDirectoryReviewItem(
  env: Partial<Env>,
  {
    context,
    sourceType,
    sourceId,
    decision,
    reasonCode = '',
    reviewerNote = '',
    requesterNote = '',
    expectedVersion = '',
    correlationId = '',
  }: {
    context: DirectoryReviewContext;
    sourceType?: unknown;
    sourceId?: unknown;
    decision?: unknown;
    reasonCode?: unknown;
    reviewerNote?: unknown;
    requesterNote?: unknown;
    expectedVersion?: unknown;
    correlationId?: string;
  }
) {
  const row = await getReviewRow(env, context, sourceType, sourceId);
  const actor = actorDto(context);
  requireAny(actor, context.parishId, reviewDefinition(row).capabilities);
  const cleanedDecision = cleanText(decision, { required: true, max: 40, field: 'decision' });
  if (!DECISIONS.has(cleanedDecision))
    throw new DirectoryServiceError('validation_failed', 'Review decision is not supported.');
  if (cleanedDecision === 'return' && !cleanText(requesterNote, { max: 1200 })) {
    throw new DirectoryServiceError(
      'validation_failed',
      'Tell the member what information is needed before returning the submission.'
    );
  }
  const currentVersion = metadataDto(row).version;
  const currentSourceVersion = String(row.source_updated_at || row.updated_at || '');
  if (
    expectedVersion &&
    expectedVersion !== currentVersion &&
    !String(expectedVersion).startsWith(`${currentSourceVersion}:`)
  ) {
    throw new DirectoryServiceError('stale_review_item', 'Review item changed. Refresh before deciding.', 409);
  }
  if (row.requester_user_id && row.requester_user_id === context.user.id && cleanedDecision === 'approve') {
    throw new DirectoryServiceError(
      'self_approval_denied',
      'Reviewers cannot approve their own directory request.',
      403
    );
  }
  if (row.target_type === 'person' && row.target_id === context.personId && cleanedDecision === 'approve') {
    throw new DirectoryServiceError('self_approval_denied', 'Reviewers cannot approve their own person record.', 403);
  }
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id)
    throw new DirectoryServiceError('assigned_elsewhere', 'This item is assigned to another reviewer.', 409);
  if (cleanedDecision === 'approve')
    return approveReviewItem(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  return closeReviewItem(env, {
    context,
    row,
    decision: cleanedDecision,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
  });
}
export async function closeReviewItem(
  env: Partial<Env>,
  {
    context,
    row,
    decision,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
  }: {
    context: DirectoryReviewContext;
    row: DirectoryReviewSqlRow;
    decision: string;
    reasonCode: unknown;
    reviewerNote: unknown;
    requesterNote: unknown;
    correlationId: string;
  }
) {
  const actor = actorDto(context);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  const sourceUpdates = [];
  if (row.source_type === 'change_request') {
    const status = decision === 'return' ? 'pending' : decision === 'cancel' ? 'cancelled' : 'denied';
    sourceUpdates.push({
      sql: "UPDATE directory_change_requests SET status = ?, decision_reason_code = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
      params: [
        status,
        cleanText(reasonCode, { max: 80 }) || null,
        context.user.id,
        timestamp,
        timestamp,
        row.source_id,
      ],
    });
  } else if (row.source_type === 'publication_profile') {
    const status = decision === 'return' ? 'draft' : 'paused';
    sourceUpdates.push({
      sql: "UPDATE directory_publication_profiles SET status = ?, approval_status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending_approval'",
      params: [status, timestamp, row.source_id],
    });
  } else if (row.source_type === 'media_asset') {
    const status = decision === 'return' ? 'ready' : 'rejected';
    sourceUpdates.push({
      sql: "UPDATE directory_media_assets SET lifecycle_status = ?, updated_at = ? WHERE id = ? AND lifecycle_status = 'pending_approval'",
      params: [status, timestamp, row.source_id],
    });
  } else if (row.source_type === 'duplicate_candidate') {
    const status = decision === 'return' ? 'deferred' : decision === 'cancel' ? 'cancelled' : 'not_duplicate';
    sourceUpdates.push({
      sql: 'UPDATE directory_duplicate_candidates SET candidate_status = ?, decision = ?, decision_reason_code = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ? WHERE id = ? AND parish_id = ?',
      params: [
        status,
        status,
        cleanText(reasonCode, { max: 80 }) || null,
        context.user.id,
        timestamp,
        timestamp,
        row.source_id,
        context.parishId,
      ],
    });
  } else if (row.source_type === 'child_publication') {
    const status = decision === 'return' ? 'returned' : decision === 'cancel' ? 'withdrawn' : 'rejected';
    sourceUpdates.push({
      sql: `UPDATE directory_child_publication_requests
            SET status = ?, reason_code = ?, reviewer_note = ?, reviewed_by_user_id = ?, updated_at = ?
            WHERE id = ? AND parish_id = ? AND status IN ('submitted', 'under_review', 'returned')`,
      params: [
        status,
        cleanText(reasonCode, { max: 80 }) || null,
        cleanText(reviewerNote, { max: 500 }) || null,
        context.user.id,
        timestamp,
        row.source_id,
        context.parishId,
      ],
    });
    sourceUpdates.push(
      auditStatement({
        action: `directory.child_publication.request_${decision === 'return' ? 'returned' : 'rejected'}`,
        actor,
        parishId: context.parishId,
        targetType: 'directory_child_publication_request',
        targetId: row.source_id,
        metadata: { reasonCode },
        correlationId,
      })
    );
  } else if (row.source_type === 'ministry_interest') {
    await closeMinistryInterestReview(env, { context, row, decision, reasonCode, reviewerNote, correlationId });
  }
  if (row.source_type === 'ministry_interest') {
    const id = await ensureMetadata(env, { actor, row });
    await runAtomic(env, [
      {
        sql: 'UPDATE directory_review_metadata SET queue_status = ?, returned_at = ?, completed_at = ?, updated_at = ? WHERE id = ?',
        params: [
          decision === 'return' ? 'returned' : decision === 'cancel' ? 'cancelled' : 'denied',
          decision === 'return' ? timestamp : null,
          decision === 'return' ? null : timestamp,
          timestamp,
          id,
        ],
      },
      auditStatement({
        action: `directory.review_item.${decision}ed`,
        actor,
        parishId: context.parishId,
        targetType: 'directory_review_item',
        targetId: id,
        metadata: { sourceType: row.source_type, sourceId: row.source_id, reasonCode },
        correlationId,
      }),
      notificationStatement({
        context,
        row,
        eventType: `directory.review.${decision}`,
        safeMessage: reviewNotification(decision),
      }),
    ]);
    return { ok: true, decision, reviewItemId: id };
  }
  await runAtomic(env, [
    ...sourceUpdates,
    ...(decision === 'return'
      ? [
          directoryReviewMessageStatement({
            parishId: context.parishId,
            sourceType: row.source_type,
            sourceId: row.source_id,
            direction: 'staff_to_member',
            body: requesterNote,
            userId: context.user.id,
            timestamp,
          }),
        ]
      : []),
    {
      sql: 'UPDATE directory_review_metadata SET queue_status = ?, returned_at = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      params: [
        decision === 'return' ? 'returned' : decision === 'cancel' ? 'cancelled' : 'denied',
        decision === 'return' ? timestamp : null,
        decision === 'return' ? null : timestamp,
        timestamp,
        id,
      ],
    },
    auditStatement({
      action: `directory.review_item.${decision}ed`,
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      metadata: {
        reasonCode,
        reviewerNote: cleanText(reviewerNote, { max: 500 }),
        requesterNote: cleanText(requesterNote, { max: 500 }),
      },
      correlationId,
    }),
    notificationStatement({
      context,
      row,
      eventType: `directory.review.${decision}`,
      safeMessage: reviewNotification(decision),
    }),
  ]);
  return { ok: true, decision, reviewItemId: id };
}
