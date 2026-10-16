// Generated from src/directory/admin-notes-duplicates.ts by npm run build:server. Do not edit.
import '../lib/entitlements.js';
import { actorDto } from './admin-actor.js';
import '../lib/authorization.js';
import { d1All, d1First, generateSecret } from '../lib/core.js';
import '../handlers/parish.js';
import '../lib/household-verification.js';
import './foundation.js';
import { DirectoryServiceError } from './foundation.js';
import './publication.js';
import './privacy.js';
import './media.js';
import './media-transform.js';
import {
  decideDuplicateCandidate,
  executeDuplicateMerge,
  generateDuplicateCandidates,
  getDuplicateComparison,
  listDuplicateCandidates,
  planDuplicateMerge,
} from './duplicates.js';
import './child-publication.js';
import './ministries.js';
import './settings.js';
import './review-correspondence.js';
import './household-share-invitations.js';
import { auditStatement, cleanText, nowMs, runAtomic } from './shared.js';
import { NOTE_CATEGORIES } from './admin-shared.js';
import './admin-context.js';
import './admin-review-queue.js';
import { ensureMetadata } from './admin-shared.js';
import './admin-media-operations.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
async function listDirectoryNotes(env, { context, targetType, targetId }) {
  if (!context.permissions.canViewNotes)
    throw new DirectoryServiceError('forbidden', 'Directory note access requires note-view capability.', 403);
  const rows = await d1All(
    env,
    `SELECT * FROM directory_internal_notes
      WHERE parish_id = ?1 AND target_type = ?2 AND target_id = ?3 AND archived_at IS NULL
        AND (visibility_class != 'protected' OR ?4 = 1)
      ORDER BY created_at DESC`,
    context.parishId,
    cleanText(targetType, { required: true, max: 40, field: 'targetType' }),
    cleanText(targetId, { required: true, max: 180, field: 'targetId' }),
    context.permissions.canManageProtected ? 1 : 0
  );
  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    category: row.category,
    visibilityClass: row.visibility_class,
    body: row.body,
    createdByUserId: row.created_by_user_id,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));
}
async function createDirectoryNote(
  env,
  { context, targetType, targetId, category = 'general', body, visibilityClass = 'staff', correlationId = '' }
) {
  if (!context.permissions.canManageNotes)
    throw new DirectoryServiceError('forbidden', 'Directory note changes require note-management capability.', 403);
  const cleanedCategory = cleanText(category, { required: true, max: 40, field: 'category' });
  if (!NOTE_CATEGORIES.has(cleanedCategory))
    throw new DirectoryServiceError('validation_failed', 'Directory note category is not supported.');
  const cleanedVisibility = cleanText(visibilityClass, { required: true, max: 40, field: 'visibilityClass' });
  if (cleanedVisibility === 'protected' && !context.permissions.canManageProtected)
    throw new DirectoryServiceError('forbidden', 'Protected notes require protected-record authority.', 403);
  const timestamp = nowMs();
  const id = generateSecret('dir_note');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_internal_notes (id, parish_id, target_type, target_id, category, visibility_class, body, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        context.parishId,
        targetType,
        targetId,
        cleanedCategory,
        cleanedVisibility,
        cleanText(body, { required: true, max: 2e3, field: 'body' }),
        context.user.id,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.internal_note.created',
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: `directory_${targetType}`,
      targetId,
      metadata: { category: cleanedCategory, visibilityClass: cleanedVisibility },
      correlationId,
    }),
  ]);
  return (await listDirectoryNotes(env, { context, targetType, targetId })).find((note) => note.id === id);
}
async function archiveDirectoryNote(env, { context, noteId, correlationId = '' }) {
  if (!context.permissions.canManageNotes)
    throw new DirectoryServiceError('forbidden', 'Directory note changes require note-management capability.', 403);
  const row = await d1First(
    env,
    'SELECT * FROM directory_internal_notes WHERE id = ?1 AND parish_id = ?2',
    cleanText(noteId, { required: true, max: 180, field: 'noteId' }),
    context.parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory note was not found.', 404);
  if (row.visibility_class === 'protected' && !context.permissions.canManageProtected)
    throw new DirectoryServiceError('forbidden', 'Protected notes require protected-record authority.', 403);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_internal_notes SET archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?',
      params: [timestamp, context.user.id, timestamp, row.id],
    },
    auditStatement({
      action: 'directory.internal_note.archived',
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: `directory_${row.target_type}`,
      targetId: row.target_id,
      correlationId,
    }),
  ]);
  return { ok: true };
}
async function listDirectoryAuditHistory(env, { context, targetType = '', targetId = '', limit = 50 }) {
  if (!context.permissions.canViewAudit)
    throw new DirectoryServiceError('forbidden', 'Directory audit access requires audit-view capability.', 403);
  const params = [context.parishId];
  let where = "organization_id = ?1 AND action LIKE 'directory.%'";
  if (targetType) {
    params.push(cleanText(targetType, { max: 80 }));
    where += ` AND target_type = ?${params.length}`;
  }
  if (targetId) {
    params.push(cleanText(targetId, { max: 180 }));
    where += ` AND target_id = ?${params.length}`;
  }
  params.push(Math.min(Number(limit) || 50, 100));
  const rows = await d1All(
    env,
    `SELECT id, actor_user_id, action, target_type, target_id, request_id, created_at FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ?${params.length}`,
    ...params
  );
  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id || '',
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    requestId: row.request_id || '',
    createdAt: row.created_at,
  }));
}
async function runDirectoryDuplicateScan(env, { context, entityType = 'all', correlationId = '' }) {
  return generateDuplicateCandidates(env, {
    context,
    entityType,
    correlationId,
  });
}
async function listDirectoryDuplicateCandidates(env, { context, status = 'open', entityType = '', limit = 50 }) {
  return listDuplicateCandidates(env, {
    context,
    status,
    entityType,
    limit,
  });
}
async function getDirectoryDuplicateCandidate(env, { context, candidateId }) {
  return getDuplicateComparison(env, {
    context,
    candidateId,
  });
}
async function decideDirectoryDuplicateCandidate(
  env,
  { context, candidateId, decision, reasonCode = '', expectedVersion = '', correlationId = '' }
) {
  const candidate = await decideDuplicateCandidate(env, {
    context,
    candidateId,
    decision,
    reasonCode,
    expectedVersion,
    correlationId,
  });
  const sourceRow = {
    parish_id: context.parishId,
    source_type: 'duplicate_candidate',
    source_id: candidate.id,
    review_key: candidate.entityType === 'person' ? 'duplicate_person' : 'duplicate_household',
    review_type: candidate.entityType === 'person' ? 'person_duplicate_review' : 'household_duplicate_review',
  };
  if (['not_duplicate', 'deferred'].includes(candidate.status)) {
    const reviewId = await ensureMetadata(env, { actor: actorDto(context), row: sourceRow });
    await runAtomic(env, [
      {
        sql: 'UPDATE directory_review_metadata SET queue_status = ?, updated_at = ? WHERE id = ?',
        params: [candidate.status === 'deferred' ? 'returned' : 'completed', nowMs(), reviewId],
      },
    ]);
  }
  return candidate;
}
async function planDirectoryDuplicateMerge(
  env,
  { context, candidateId, survivorId, expectedVersion = '', correlationId = '' }
) {
  return planDuplicateMerge(env, {
    context,
    candidateId,
    survivorId,
    expectedVersion,
    correlationId,
  });
}
async function executeDirectoryDuplicateMerge(env, { context, candidateId, expectedVersion = '', correlationId = '' }) {
  const result = await executeDuplicateMerge(env, {
    context,
    candidateId,
    expectedVersion,
    correlationId,
  });
  const row = await d1First(
    env,
    'SELECT entity_type FROM directory_duplicate_candidates WHERE id = ?1 AND parish_id = ?2',
    candidateId,
    context.parishId
  );
  const reviewId = await ensureMetadata(env, {
    actor: actorDto(context),
    row: {
      parish_id: context.parishId,
      source_type: 'duplicate_candidate',
      source_id: candidateId,
      review_key: row?.entity_type === 'household' ? 'duplicate_household' : 'duplicate_person',
      review_type: row?.entity_type === 'household' ? 'household_duplicate_review' : 'person_duplicate_review',
    },
  });
  await runAtomic(env, [
    {
      sql: "UPDATE directory_review_metadata SET queue_status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      params: [nowMs(), nowMs(), reviewId],
    },
  ]);
  return result;
}
export {
  archiveDirectoryNote,
  createDirectoryNote,
  decideDirectoryDuplicateCandidate,
  executeDirectoryDuplicateMerge,
  getDirectoryDuplicateCandidate,
  listDirectoryAuditHistory,
  listDirectoryDuplicateCandidates,
  listDirectoryNotes,
  planDirectoryDuplicateMerge,
  runDirectoryDuplicateScan,
};
