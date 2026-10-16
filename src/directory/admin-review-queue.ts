import type {
  DirectoryReviewSqlRow,
  DirectoryReviewContext,
  RawDirectoryOperation,
} from './admin-composition-contracts.js';

import '../lib/entitlements.js';

import './admin-actor.js';

import '../lib/authorization.js';

import { d1All, d1First } from '../lib/core.js';

import '../handlers/parish.js';

import '../lib/household-verification.js';

import './foundation.js';

import { DirectoryServiceError } from './foundation.js';

import './publication.js';

import './privacy.js';

import './media.js';

import './media-transform.js';

import { getDuplicateComparison } from './duplicates.js';

import './child-publication.js';

import './ministries.js';

import './settings.js';

import { listDirectoryReviewConversation } from './review-correspondence.js';

import './household-share-invitations.js';

import { cleanText, maskValue, nowMs } from './shared.js';
import { REVIEW_TYPES } from './admin-shared.js';
import { hasAny } from './admin-context.js';
import './admin-shared.js';
import { adminMediaDto } from './admin-media-operations.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
import { listDirectoryNotes } from './admin-notes-duplicates.js';
export function rowAge(row: DirectoryReviewSqlRow) {
  const submittedAt = Number(row.submitted_at || row.created_at || 0);
  return submittedAt ? Math.max(0, Math.floor((nowMs() - submittedAt) / 86400000)) : 0;
}
export function metadataDto(row: DirectoryReviewSqlRow) {
  return {
    reviewItemId: row.review_item_id || `virtual:${row.source_type}:${row.source_id}`,
    queueStatus: row.queue_status || 'pending_review',
    priority: row.priority || 'normal',
    assignedToUserId: row.assigned_to_user_id || '',
    assignedAt: row.assigned_at ? Number(row.assigned_at) : null,
    version: `${row.source_updated_at || row.updated_at || ''}:${row.metadata_updated_at || ''}`,
  };
}
export function queueDto(row: DirectoryReviewSqlRow, context: DirectoryReviewContext) {
  const meta = metadataDto(row);
  const protectedRecord = Number(row.protected_record || 0) === 1;
  const childRelated = Number(row.child_related || 0) === 1;
  return {
    ...meta,
    parishId: row.parish_id,
    reviewType: reviewDefinition(row).reviewType,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceStatus: row.source_status,
    submittedAt: Number(row.submitted_at || 0),
    ageDays: rowAge(row),
    requesterLabel: row.requester_label || 'Directory user',
    targetLabel: row.target_label || 'Directory record',
    targetType: row.target_type || '',
    targetId: row.target_id || '',
    protectedRecord: context.permissions.canManageProtected ? protectedRecord : protectedRecord ? true : false,
    childRelated,
    conflict: row.review_type === 'household_merge_triage',
    summary: row.safe_summary || 'Directory review item',
    permittedActions: permittedActions(row.review_key, context, row),
    version: meta.version,
  };
}
export function reviewDefinition(rowOrKey: string | Pick<DirectoryReviewSqlRow, 'review_key'>) {
  const key = typeof rowOrKey === 'string' ? rowOrKey : rowOrKey.review_key;
  return REVIEW_TYPES[key] || REVIEW_TYPES.person_profile_review;
}
export function permittedActions(
  key: string,
  context: DirectoryReviewContext,
  row: Partial<DirectoryReviewSqlRow> = {}
) {
  const actor = {
    userId: context.user.id,
    parishId: context.parishId,
    capabilities: context.capabilities,
    personId: context.personId,
  };
  const definition = reviewDefinition(key);
  if (!hasAny(actor, definition.capabilities)) return [];
  const actions = definition.allowedActions.filter((action) => action !== 'priority' || context.permissions.canAssign);
  if (row.assigned_to_user_id && row.assigned_to_user_id !== context.user.id && !context.permissions.canAssign) {
    return actions.filter((action) => ['open', 'note'].includes(action));
  }
  return actions;
}
export async function reviewRows(env: Partial<Env>, parishId: string) {
  const changeRequests = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT cr.parish_id, 'change_request' AS source_type, cr.id AS source_id, cr.request_type AS review_key,
            cr.request_type AS review_type, cr.status AS source_status, cr.created_at AS submitted_at,
            cr.updated_at AS source_updated_at, cr.requester_user_id, cr.requester_person_id, cr.target_type,
            cr.target_id, cr.household_id, cr.summary AS safe_summary,
            COALESCE(rp.preferred_name, 'Directory user') AS requester_label,
            COALESCE(tp.preferred_name, th.display_name, 'Directory record') AS target_label,
            COALESCE(tf.protected_person, 0) AS protected_record, COALESCE(tf.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_change_requests cr
       LEFT JOIN directory_people rp ON rp.id = cr.requester_person_id
       LEFT JOIN directory_people tp ON cr.target_type = 'person' AND tp.id = cr.target_id
       LEFT JOIN directory_households th ON cr.target_type = 'household' AND th.id = cr.target_id
       LEFT JOIN directory_person_privacy_flags tf ON tf.parish_id = cr.parish_id AND tf.person_id = cr.target_id AND tf.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'change_request' AND rm.source_id = cr.id
      WHERE cr.parish_id = ?1 AND cr.status IN ('pending', 'approved')`,
    parishId
  );
  const publication = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT pp.parish_id, 'publication_profile' AS source_type, pp.id AS source_id,
            CASE WHEN pp.owner_type = 'person' THEN 'publication_person' ELSE 'publication_household' END AS review_key,
            CASE WHEN pp.owner_type = 'person' THEN 'publication_person' ELSE 'publication_household' END AS review_type,
            pp.status AS source_status, pp.created_at AS submitted_at, pp.updated_at AS source_updated_at,
            '' AS requester_user_id, '' AS requester_person_id, pp.owner_type AS target_type, pp.owner_id AS target_id,
            CASE WHEN pp.owner_type = 'household' THEN pp.owner_id ELSE NULL END AS household_id,
            'Publication approval requested' AS safe_summary,
            'Directory user' AS requester_label, COALESCE(p.preferred_name, h.display_name, 'Directory record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record, COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_publication_profiles pp
       LEFT JOIN directory_people p ON pp.owner_type = 'person' AND p.id = pp.owner_id
       LEFT JOIN directory_households h ON pp.owner_type = 'household' AND h.id = pp.owner_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = pp.parish_id AND f.person_id = pp.owner_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'publication_profile' AND rm.source_id = pp.id
      WHERE pp.parish_id = ?1 AND pp.active = 1 AND pp.status = 'pending_approval'`,
    parishId
  );
  const media = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT ma.parish_id, 'media_asset' AS source_type, ma.id AS source_id, 'publication_media' AS review_key,
            'publication_media' AS review_type, ma.lifecycle_status AS source_status, ma.created_at AS submitted_at,
            ma.updated_at AS source_updated_at, ma.uploaded_by_user_id AS requester_user_id, '' AS requester_person_id,
            ma.owner_type AS target_type, ma.owner_id AS target_id,
            CASE WHEN ma.owner_type = 'household' THEN ma.owner_id ELSE NULL END AS household_id,
            'Photo publication approval requested' AS safe_summary,
            'Directory user' AS requester_label, COALESCE(p.preferred_name, h.display_name, 'Directory record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record, COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_media_assets ma
       LEFT JOIN directory_people p ON ma.owner_type = 'person' AND p.id = ma.owner_id
       LEFT JOIN directory_households h ON ma.owner_type = 'household' AND h.id = ma.owner_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ma.parish_id AND f.person_id = ma.owner_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'media_asset' AND rm.source_id = ma.id
      WHERE ma.parish_id = ?1 AND ma.lifecycle_status = 'pending_approval'`,
    parishId
  ).catch(() => []);
  const duplicates = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT dc.parish_id, 'duplicate_candidate' AS source_type, dc.id AS source_id,
            CASE WHEN dc.entity_type = 'person' THEN 'duplicate_person' ELSE 'duplicate_household' END AS review_key,
            CASE WHEN dc.entity_type = 'person' THEN 'person_duplicate_review' ELSE 'household_duplicate_review' END AS review_type,
            dc.candidate_status AS source_status, dc.first_detected_at AS submitted_at,
            dc.updated_at AS source_updated_at, '' AS requester_user_id, '' AS requester_person_id,
            dc.entity_type AS target_type, dc.left_entity_id AS target_id,
            CASE WHEN dc.entity_type = 'household' THEN dc.left_entity_id ELSE NULL END AS household_id,
            CASE WHEN dc.entity_type = 'person' THEN 'Potential duplicate person records' ELSE 'Potential duplicate household records' END AS safe_summary,
            'Duplicate scanner' AS requester_label,
            CASE WHEN dc.entity_type = 'person'
              THEN COALESCE(lp.preferred_name, 'Left record') || ' / ' || COALESCE(rp.preferred_name, 'Right record')
              ELSE COALESCE(lh.display_name, 'Left household') || ' / ' || COALESCE(rh.display_name, 'Right household')
            END AS target_label,
            CASE WHEN dc.entity_type = 'person' THEN MAX(COALESCE(lf.protected_person, 0), COALESCE(rf.protected_person, 0)) ELSE 0 END AS protected_record,
            CASE WHEN dc.entity_type = 'person' THEN MAX(COALESCE(lf.is_child, 0), COALESCE(rf.is_child, 0)) ELSE 0 END AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_duplicate_candidates dc
       LEFT JOIN directory_people lp ON dc.entity_type = 'person' AND lp.id = dc.left_entity_id
       LEFT JOIN directory_people rp ON dc.entity_type = 'person' AND rp.id = dc.right_entity_id
       LEFT JOIN directory_households lh ON dc.entity_type = 'household' AND lh.id = dc.left_entity_id
       LEFT JOIN directory_households rh ON dc.entity_type = 'household' AND rh.id = dc.right_entity_id
       LEFT JOIN directory_person_privacy_flags lf ON lf.parish_id = dc.parish_id AND lf.person_id = dc.left_entity_id AND lf.active = 1
       LEFT JOIN directory_person_privacy_flags rf ON rf.parish_id = dc.parish_id AND rf.person_id = dc.right_entity_id AND rf.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'duplicate_candidate' AND rm.source_id = dc.id
      WHERE dc.parish_id = ?1 AND dc.candidate_status IN ('open', 'assigned', 'in_review', 'deferred', 'confirmed_duplicate', 'merge_planned', 'merge_ready', 'blocked')`,
    parishId
  ).catch(() => []);
  // Phase 4B: child publication requests, sourced from the dedicated
  // directory_child_publication_requests table (never directory_change_requests
  // or directory_publication_profiles -- Part 8: "do not create a separate
  // review queue," reused here by adding a fourth UNION arm, exactly the
  // established pattern for media/duplicates above).
  const childPublications = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT cpr.parish_id, 'child_publication' AS source_type, cpr.id AS source_id,
            'child_publication_review' AS review_key, 'child_publication_review' AS review_type,
            cpr.status AS source_status, cpr.submitted_at AS submitted_at,
            cpr.updated_at AS source_updated_at, cpr.requester_user_id AS requester_user_id,
            cpr.requester_person_id AS requester_person_id,
            'person' AS target_type, cpr.child_person_id AS target_id, cpr.household_id AS household_id,
            'Child publication request' AS safe_summary,
            'Household administrator' AS requester_label,
            COALESCE(p.preferred_name, 'Child record') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record,
            1 AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_child_publication_requests cpr
       LEFT JOIN directory_people p ON p.id = cpr.child_person_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = cpr.parish_id AND f.person_id = cpr.child_person_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'child_publication' AND rm.source_id = cpr.id
      WHERE cpr.parish_id = ?1 AND cpr.status IN ('submitted', 'under_review', 'returned')`,
    parishId
  ).catch(() => []);
  const ministryInterests = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT mir.parish_id, 'ministry_interest' AS source_type, mir.id AS source_id,
            'ministry_interest_review' AS review_key, 'ministry_interest_review' AS review_type,
            mir.status AS source_status, mir.submitted_at AS submitted_at,
            mir.updated_at AS source_updated_at, mir.requester_user_id AS requester_user_id,
            mir.requester_person_id AS requester_person_id,
            'person' AS target_type, mir.person_id AS target_id, NULL AS household_id,
            'Ministry interest request' AS safe_summary,
            COALESCE(rp.preferred_name, 'Directory user') AS requester_label,
            COALESCE(m.display_name, 'Ministry') AS target_label,
            COALESCE(f.protected_person, 0) AS protected_record,
            COALESCE(f.is_child, 0) AS child_related,
            rm.id AS review_item_id, rm.queue_status, rm.priority, rm.assigned_to_user_id, rm.assigned_at,
            rm.updated_at AS metadata_updated_at
       FROM directory_ministry_interest_requests mir
       JOIN directory_ministries m ON m.id = mir.ministry_id
       LEFT JOIN directory_people rp ON rp.id = mir.requester_person_id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = mir.parish_id AND f.person_id = mir.person_id AND f.active = 1
       LEFT JOIN directory_review_metadata rm ON rm.source_type = 'ministry_interest' AND rm.source_id = mir.id
      WHERE mir.parish_id = ?1 AND mir.status IN ('submitted', 'under_review', 'returned')`,
    parishId
  ).catch(() => []);
  return [...changeRequests, ...publication, ...media, ...duplicates, ...childPublications, ...ministryInterests];
}
export function applyQueueFilters(rows: DirectoryReviewSqlRow[], filters: Record<string, unknown> = {}) {
  let filtered = rows;
  if (filters.type) filtered = filtered.filter((row) => row.review_type === filters.type);
  if (filters.status)
    filtered = filtered.filter(
      (row) => (row.queue_status || 'pending_review') === filters.status || row.source_status === filters.status
    );
  if (filters.priority) filtered = filtered.filter((row) => (row.priority || 'normal') === filters.priority);
  if (filters.assignment === 'mine') filtered = filtered.filter((row) => row.assigned_to_user_id === filters.userId);
  if (filters.assignment === 'unassigned') filtered = filtered.filter((row) => !row.assigned_to_user_id);
  return filtered;
}

export async function listDirectoryReviewQueue(
  env: Partial<Env>,
  { context, filters = {} }: { context: DirectoryReviewContext; filters?: Record<string, unknown> }
) {
  const rows = await reviewRows(env, context.parishId);
  const visible = rows.filter((row) => permittedActions(row.review_key, context, row).length);
  return applyQueueFilters(visible, { ...filters, userId: context.user.id })
    .sort((a, b) => Number(a.submitted_at || 0) - Number(b.submitted_at || 0))
    .map((row) => queueDto(row, context));
}

export async function getDirectoryAdminDashboard(env: Partial<Env>, { context }: { context: DirectoryReviewContext }) {
  const queue = await listDirectoryReviewQueue(env, { context });
  const peopleWithoutClaim = await d1First<DirectoryReviewSqlRow>(
    env,
    `SELECT COUNT(DISTINCT p.id) AS count
       FROM directory_people p
       LEFT JOIN directory_person_links l ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
      WHERE p.created_by_parish_id = ?1 AND p.active = 1 AND l.id IS NULL`,
    context.parishId
  );
  const householdsWithoutAdmins = await d1First<DirectoryReviewSqlRow>(
    env,
    `SELECT COUNT(*) AS count
       FROM directory_households h
      WHERE h.parish_id = ?1 AND h.active = 1
        AND NOT EXISTS (SELECT 1 FROM directory_household_admins ha WHERE ha.household_id = h.id AND ha.active = 1)`,
    context.parishId
  );
  return {
    context,
    metrics: {
      totalPending: queue.length,
      unassigned: queue.filter((item) => !item.assignedToUserId).length,
      assignedToMe: queue.filter((item) => item.assignedToUserId === context.user.id).length,
      publicationRequests: queue.filter((item) => item.reviewType.startsWith('publication')).length,
      membershipRequests: queue.filter(
        (item) => item.reviewType.startsWith('membership') || item.reviewType.startsWith('household')
      ).length,
      protectedRecordRequests: queue.filter((item) => item.protectedRecord).length,
      oldestPendingAgeDays: queue.reduce((max, item) => Math.max(max, item.ageDays), 0),
      peopleWithoutClaimedProfiles: Number(peopleWithoutClaim?.count || 0),
      householdsWithoutAdministrators: Number(householdsWithoutAdmins?.count || 0),
    },
    highPriority: queue.filter((item) => ['urgent', 'elevated'].includes(item.priority)).slice(0, 8),
  };
}
export async function getReviewRow(
  env: Partial<Env>,
  context: DirectoryReviewContext,
  sourceType: unknown,
  sourceId: unknown
) {
  const rows = await reviewRows(env, context.parishId);
  const row = rows.find((item) => item.source_type === sourceType && item.source_id === sourceId);
  if (!row) throw new DirectoryServiceError('not_found', 'Directory review item was not found.', 404);
  if (!permittedActions(row.review_key, context, row).length)
    throw new DirectoryServiceError('forbidden', 'Directory reviewer lacks access to this item.', 403);
  return row;
}

export async function getDirectoryReviewItem(
  env: Partial<Env>,
  { context, sourceType, sourceId }: { context: DirectoryReviewContext; sourceType?: unknown; sourceId?: unknown }
) {
  const row = await getReviewRow(
    env,
    context,
    cleanText(sourceType, { required: true, max: 80, field: 'sourceType' }),
    cleanText(sourceId, { required: true, max: 180, field: 'sourceId' })
  );
  const notes = context.permissions.canViewNotes
    ? await listDirectoryNotes(env, {
        context,
        targetType: 'review_item',
        targetId: row.review_item_id || `virtual:${row.source_type}:${row.source_id}`,
      })
    : [];
  let payload: Record<string, unknown> = {};
  let media = null;
  if (row.source_type === 'change_request') {
    const request = await d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT requested_payload_json FROM directory_change_requests WHERE id = ?1',
      row.source_id
    );
    payload = JSON.parse(request?.requested_payload_json || '{}') as Record<string, unknown>;
  } else if (row.source_type === 'duplicate_candidate') {
    return {
      item: queueDto(row, context),
      comparison: await (getDuplicateComparison as RawDirectoryOperation<typeof getDuplicateComparison>)(env, {
        context,
        candidateId: row.source_id,
      }),
      notes,
    };
  } else if (row.source_type === 'media_asset') {
    const asset = await d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2',
      row.source_id,
      context.parishId
    );
    media = adminMediaDto(asset, asset?.owner_type === 'household' ? 'household_card' : 'avatar_medium');
    payload = media
      ? {
          photo: media,
          ownerType: media.ownerType,
          visibility: media.visibility,
          publicationEligible: media.publicationEligible,
        }
      : {};
  }
  return {
    item: queueDto(row, context),
    current: row.source_type === 'media_asset' ? null : await currentSnapshot(env, row, context),
    proposed: sanitizePayload(payload, context),
    media,
    notes,
    conversation: await listDirectoryReviewConversation(env, {
      parishId: context.parishId,
      sourceType: row.source_type,
      sourceId: row.source_id,
    }),
  };
}
export async function currentSnapshot(env: Partial<Env>, row: DirectoryReviewSqlRow, context: DirectoryReviewContext) {
  if (row.target_type === 'person') {
    const person = await d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT * FROM directory_people WHERE id = ?1',
      row.target_id
    );
    if (!person) return null;
    return {
      id: person.id,
      preferredName: person.preferred_name,
      legalName: context.permissions.canManagePeople ? person.legal_name || '' : maskValue(person.legal_name),
      active: Number(person.active || 0) === 1,
      version: person.updated_at,
    };
  }
  if (row.target_type === 'household') {
    const household = await d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT * FROM directory_households WHERE id = ?1',
      row.target_id
    );
    if (!household) return null;
    return {
      id: household.id,
      displayName: household.display_name,
      active: Number(household.active || 0) === 1,
      version: household.updated_at,
    };
  }
  if (row.source_type === 'duplicate_candidate') {
    return (getDuplicateComparison as RawDirectoryOperation<typeof getDuplicateComparison>)(env, {
      context,
      candidateId: row.source_id,
    });
  }
  return null;
}
export function sanitizePayload(payload: Record<string, unknown> | null, context: DirectoryReviewContext) {
  if (!payload || typeof payload !== 'object') return {};
  const copy = { ...payload };
  if (!context.permissions.canManagePeople && 'legalName' in copy) copy.legalName = maskValue(copy.legalName);
  if (!context.permissions.canManageProtected) delete copy.protectedReason;
  return copy;
}
