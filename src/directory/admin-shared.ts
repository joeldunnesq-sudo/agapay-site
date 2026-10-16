import type {
  DirectoryReviewSqlRow,
  DirectoryReviewDefinition,
  DirectoryReviewActor,
  DirectoryReviewContext,
} from './admin-composition-contracts.js';

import '../lib/entitlements.js';

import './admin-actor.js';

import '../lib/authorization.js';

import { d1First, generateSecret } from '../lib/core.js';

import '../handlers/parish.js';

import '../lib/household-verification.js';

import './foundation.js';

import './foundation.js';

import './publication.js';

import './privacy.js';

import './media.js';

import './media-transform.js';

import './duplicates.js';

import './child-publication.js';

import './ministries.js';

import './settings.js';

import './review-correspondence.js';

import './household-share-invitations.js';

import { auditStatement, DIRECTORY_CAPABILITIES, nowMs, runAtomic, safeJson } from './shared.js';
import './admin-context.js';
import './admin-review-queue.js';
import './admin-media-operations.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
import './admin-notes-duplicates.js';
export const PRIORITIES = new Set(['normal', 'elevated', 'urgent']);
export const DECISIONS = new Set(['approve', 'deny', 'return', 'cancel']);
export const NOTE_CATEGORIES = new Set([
  'general',
  'verification',
  'household',
  'contact',
  'publication',
  'identity',
  'protected',
  'follow_up',
]);
export const BIOLOGICAL_SEXES = new Set(['unknown', 'female', 'male']);

export const REVIEW_TYPES: Readonly<Record<string, DirectoryReviewDefinition>> = Object.freeze({
  person_profile_review: {
    reviewType: 'person_canonical_correction',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.correctionsReview,
      DIRECTORY_CAPABILITIES.requestsReview,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  household_membership_add: {
    reviewType: 'membership_add_adult',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.membershipsReview,
      DIRECTORY_CAPABILITIES.householdsManage,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  household_membership_remove: {
    reviewType: 'membership_remove',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.membershipsReview,
      DIRECTORY_CAPABILITIES.householdsManage,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  household_relationship_change: {
    reviewType: 'household_relationship_change',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.membershipsReview,
      DIRECTORY_CAPABILITIES.householdsManage,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  household_move_request: {
    reviewType: 'membership_move',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.membershipsReview,
      DIRECTORY_CAPABILITIES.householdsManage,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  household_merge_review: {
    reviewType: 'household_merge_triage',
    sourceSystem: 'directory_change_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.requestsReview,
      DIRECTORY_CAPABILITIES.householdsManage,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
  publication_person: {
    reviewType: 'publication_person',
    sourceSystem: 'directory_publication_profiles',
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'priority', 'note'],
  },
  publication_household: {
    reviewType: 'publication_household',
    sourceSystem: 'directory_publication_profiles',
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'priority', 'note'],
  },
  publication_media: {
    reviewType: 'publication_media',
    sourceSystem: 'directory_media_assets',
    capabilities: [DIRECTORY_CAPABILITIES.publicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'priority', 'note'],
  },
  duplicate_person: {
    reviewType: 'person_duplicate_review',
    sourceSystem: 'directory_duplicate_candidates',
    capabilities: [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'deny', 'return', 'priority', 'note'],
  },
  duplicate_household: {
    reviewType: 'household_duplicate_review',
    sourceSystem: 'directory_duplicate_candidates',
    capabilities: [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'deny', 'return', 'priority', 'note'],
  },
  // Phase 4B: deliberately requires childPublicationReview specifically --
  // NOT publicationReview. A reviewer authorized for ordinary adult/
  // household publication is not automatically authorized here (Part 9).
  child_publication_review: {
    reviewType: 'child_publication_review',
    sourceSystem: 'directory_child_publication_requests',
    capabilities: [DIRECTORY_CAPABILITIES.childPublicationReview, DIRECTORY_CAPABILITIES.manage],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'priority', 'note'],
  },
  ministry_interest_review: {
    reviewType: 'ministry_interest_review',
    sourceSystem: 'directory_ministry_interest_requests',
    capabilities: [
      DIRECTORY_CAPABILITIES.ministryInterestReview,
      DIRECTORY_CAPABILITIES.requestsReview,
      DIRECTORY_CAPABILITIES.manage,
    ],
    allowedActions: ['assign', 'unassign', 'begin', 'approve', 'deny', 'return', 'cancel', 'priority', 'note'],
  },
});
export const PARISH_DASHBOARD_DIRECTORY_CAPABILITIES = Object.freeze([
  DIRECTORY_CAPABILITIES.manage,
  DIRECTORY_CAPABILITIES.peopleManage,
  DIRECTORY_CAPABILITIES.householdsManage,
  DIRECTORY_CAPABILITIES.requestsReview,
  DIRECTORY_CAPABILITIES.membershipsReview,
  DIRECTORY_CAPABILITIES.householdAdminsReview,
  DIRECTORY_CAPABILITIES.correctionsReview,
  DIRECTORY_CAPABILITIES.protectedManage,
  DIRECTORY_CAPABILITIES.duplicatesReview,
  DIRECTORY_CAPABILITIES.duplicatesMerge,
  DIRECTORY_CAPABILITIES.notesView,
  DIRECTORY_CAPABILITIES.notesManage,
  DIRECTORY_CAPABILITIES.assignmentsManage,
  DIRECTORY_CAPABILITIES.publicationReview,
  DIRECTORY_CAPABILITIES.childPublicationReview,
  DIRECTORY_CAPABILITIES.ministriesManage,
  DIRECTORY_CAPABILITIES.ministryInterestReview,
  DIRECTORY_CAPABILITIES.skillsView,
  DIRECTORY_CAPABILITIES.skillsManage,
  DIRECTORY_CAPABILITIES.skillsCatalogManage,
  DIRECTORY_CAPABILITIES.settingsManage,
  DIRECTORY_CAPABILITIES.privateContactView,
  DIRECTORY_CAPABILITIES.auditView,
  DIRECTORY_CAPABILITIES.mediaReprocess,
  'directory.invitations.manage',
]);
export async function ensureMetadata(
  env: Partial<Env>,
  {
    actor,
    row,
  }: {
    actor: DirectoryReviewActor;
    row: Pick<DirectoryReviewSqlRow, 'parish_id' | 'source_type' | 'source_id'> & Partial<DirectoryReviewSqlRow>;
  }
) {
  if (row.review_item_id) return row.review_item_id;
  const timestamp = nowMs();
  const id = generateSecret('dir_review');
  await runAtomic(env, [
    {
      sql: `INSERT OR IGNORE INTO directory_review_metadata
            (id, parish_id, source_type, source_id, queue_status, priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending_review', 'normal', ?, ?)`,
      params: [id, row.parish_id, row.source_type, row.source_id, timestamp, timestamp],
    },
    auditStatement({
      action: 'directory.review_item.created',
      actor,
      parishId: row.parish_id,
      targetType: 'directory_review_item',
      targetId: id,
      metadata: { sourceType: row.source_type, sourceId: row.source_id },
    }),
  ]);
  const saved = await d1First<DirectoryReviewSqlRow>(
    env,
    'SELECT id FROM directory_review_metadata WHERE source_type = ?1 AND source_id = ?2',
    row.source_type,
    row.source_id
  );
  return saved!.id;
}
export function notificationStatement({
  context,
  row,
  eventType,
  safeMessage,
}: {
  context: DirectoryReviewContext;
  row: DirectoryReviewSqlRow;
  eventType: unknown;
  safeMessage: unknown;
}) {
  return {
    sql: `INSERT INTO directory_notification_events
            (id, parish_id, recipient_user_id, actor_user_id, event_type, target_type, target_id, household_id, safe_message, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      generateSecret('dir_note'),
      context.parishId,
      row.requester_user_id || null,
      context.user.id,
      eventType,
      `directory_${row.target_type || 'review'}`,
      row.target_id || row.source_id,
      row.household_id || null,
      safeMessage,
      safeJson({ sourceType: row.source_type, sourceId: row.source_id }),
      nowMs(),
    ],
  };
}
export function reviewNotification(decision: string) {
  if (decision === 'return') return 'Your directory request was returned for correction.';
  if (decision === 'cancel') return 'Your directory request was cancelled by parish staff.';
  return 'Your directory request was reviewed and denied.';
}
