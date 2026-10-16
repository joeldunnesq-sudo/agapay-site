import type {
  DirectoryReviewSqlRow,
  DirectoryReviewContext,
  DirectoryStatement,
} from './admin-composition-contracts.js';

import '../lib/entitlements.js';

import { actorDto } from './admin-actor.js';

import '../lib/authorization.js';

import { d1First } from '../lib/core.js';

import '../handlers/parish.js';

import '../lib/household-verification.js';

import { addHouseholdAdmin, addHouseholdMember, removeHouseholdAdmin, removeHouseholdMember } from './foundation.js';

import { DirectoryServiceError } from './foundation.js';

import { transitionPublicationProfile } from './publication.js';

import './privacy.js';

import { assertMediaAssetSecurelyTransformed } from './media.js';

import './media-transform.js';

import './duplicates.js';

import {
  checkChildEligibility,
  sanitizeChildFields,
  POLICY_REVISION as CHILD_POLICY_REVISION,
} from './child-publication.js';

import { approveMinistryInterestReview } from './ministries.js';

import { getDirectorySettings } from './settings.js';

import { directoryReviewMessageStatement } from './review-correspondence.js';

import { householdShareApprovalStatement } from './household-share-invitations.js';

import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
import './admin-shared.js';
import { requireAny } from './admin-context.js';
import './admin-review-queue.js';
import { ensureMetadata, notificationStatement } from './admin-shared.js';
import './admin-media-operations.js';
import { applyPersonPublicationPreferences, applyPersonAdminFields } from './admin-person-records.js';
import './admin-review-commands.js';
import './admin-household-records.js';
import './admin-notes-duplicates.js';
export async function approveReviewItem(
  env: Partial<Env>,
  {
    context,
    row,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
  }: {
    context: DirectoryReviewContext;
    row: DirectoryReviewSqlRow;
    reasonCode: unknown;
    reviewerNote: unknown;
    requesterNote: unknown;
    correlationId: string;
  }
) {
  if (row.source_type === 'publication_profile') {
    const profile = await d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT * FROM directory_publication_profiles WHERE id = ?1 AND parish_id = ?2',
      row.source_id,
      context.parishId
    );
    await transitionPublicationProfile(env, {
      actor: actorDto(context),
      parishId: context.parishId,
      ownerType: profile!.owner_type,
      ownerId: profile!.owner_id,
      status: 'approved',
      correlationId,
    });
    if (profile!.owner_type === 'household') {
      await runAtomic(env, [
        await householdVerificationStatement(env, {
          context,
          householdId: profile!.owner_id,
          policyVersion: 'first-publication-review-v1',
        }),
      ]);
    }
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type === 'media_asset') {
    // Phase 2B.1 Approval Hard Gate: server-side, unconditional, no
    // reviewer/staff/platform-admin override exists anywhere in this call
    // path. Throws MEDIA_SECURE_TRANSFORMATION_REQUIRED (a
    // DirectoryServiceError, propagated to the caller as a 409) if the
    // asset or any of its required variants has not completed real image
    // transformation -- see src/directory/media.js's
    // assertMediaAssetSecurelyTransformed and
    // docs/directory/25-phase-2b1-security-review.md.
    await assertMediaAssetSecurelyTransformed(env, { mediaAssetId: row.source_id, parishId: context.parishId });
    const timestamp = nowMs();
    await runAtomic(env, [
      {
        sql: `UPDATE directory_media_assignments
          SET assignment_status='replaced',replaced_at=?,updated_at=?
          WHERE parish_id=? AND assignment_status='active'
            AND (owner_type,owner_id,media_purpose)=(
              SELECT owner_type,owner_id,media_purpose FROM directory_media_assignments WHERE media_asset_id=?
            )`,
        params: [timestamp, timestamp, context.parishId, row.source_id],
      },
      {
        sql: `UPDATE directory_media_assignments
          SET assignment_status='active',updated_at=?
          WHERE parish_id=? AND media_asset_id=? AND assignment_status='candidate'`,
        params: [timestamp, context.parishId, row.source_id],
      },
      {
        sql: "UPDATE directory_media_assets SET lifecycle_status = 'approved', updated_at = ? WHERE id = ? AND parish_id = ? AND lifecycle_status = 'pending_approval'",
        params: [timestamp, row.source_id, context.parishId],
      },
    ]);
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type === 'duplicate_candidate') {
    throw new DirectoryServiceError(
      'use_duplicate_merge_flow',
      'Duplicate candidates must be confirmed, planned, and merged through the duplicate review workflow.',
      422
    );
  }
  if (row.source_type === 'child_publication') {
    return approveChildPublicationRequest(env, {
      context,
      row,
      reasonCode,
      reviewerNote,
      requesterNote,
      correlationId,
    });
  }
  if (row.source_type === 'ministry_interest') {
    await approveMinistryInterestReview(env, { context, row, reviewerNote, correlationId });
    return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
  }
  if (row.source_type !== 'change_request')
    throw new DirectoryServiceError('unsupported_review_type', 'Review source is not supported.', 422);
  const request = await d1First<DirectoryReviewSqlRow>(
    env,
    "SELECT * FROM directory_change_requests WHERE id = ?1 AND parish_id = ?2 AND status = 'pending'",
    row.source_id,
    context.parishId
  );
  if (!request) throw new DirectoryServiceError('invalid_transition', 'Only pending requests can be approved.', 409);
  const payload = JSON.parse(request.requested_payload_json || '{}');
  const additionalStatements = [];
  if (request.request_type === 'person_profile_review') {
    await applyPersonAdminFields(env, {
      context,
      personId: request.target_id,
      patch: Object.fromEntries(
        ['legalName', 'biologicalSex', 'deceased', 'active', 'notes']
          .filter((field) => field in payload)
          .map((field) => [field, payload[field]])
      ),
      allowedFields: ['legalName', 'biologicalSex', 'deceased', 'active', 'notes'],
      auditAction: 'directory.admin.person_review_correction',
      correlationId,
    });
    await applyPersonPublicationPreferences(env, {
      context,
      personId: request.target_id,
      preferences: payload.publicationPreferences,
      correlationId,
    });
    if (payload.source === 'myagapay_directory_onboarding') {
      const household = await d1First<DirectoryReviewSqlRow>(
        env,
        `
        SELECT h.id
          FROM directory_households h
          JOIN directory_household_members hm ON hm.household_id = h.id AND hm.person_id = ?1 AND hm.active = 1
          JOIN directory_household_admins ha ON ha.household_id = h.id AND ha.person_id = ?1 AND ha.active = 1
          JOIN directory_person_links link ON link.person_id = ?1 AND link.link_type = 'platform_user'
            AND link.external_id = ?2 AND link.active = 1
         WHERE h.parish_id = ?3 AND h.active = 1
         ORDER BY hm.created_at ASC
         LIMIT 1`,
        request.target_id,
        request.requester_user_id,
        context.parishId
      );
      if (household?.id)
        additionalStatements.push(
          await householdVerificationStatement(env, {
            context,
            householdId: household.id,
            policyVersion: 'first-profile-review-v1',
          })
        );
    }
  } else if (request.request_type === 'household_membership_add') {
    await addHouseholdMember(env, {
      actor: actorDto(context),
      parishId: context.parishId,
      householdId: request.household_id || request.target_id,
      personId: payload.personId,
      relationship: payload.relationship || 'other',
    });
    const share = payload.shareToLink;
    if (share?.invitationId && share?.claimantUserId) {
      return markApproved(env, {
        context,
        row,
        reasonCode,
        reviewerNote,
        requesterNote,
        correlationId,
        additionalStatements: [
          householdShareApprovalStatement({
            parishId: context.parishId,
            householdId: request.household_id || request.target_id,
            personId: payload.personId,
            invitationId: share.invitationId,
            claimantUserId: share.claimantUserId,
            timestamp: nowMs(),
          }),
        ],
      });
    }
  } else if (request.request_type === 'household_membership_remove') {
    await removeHouseholdMember(env, {
      actor: actorDto(context),
      parishId: context.parishId,
      householdId: request.household_id || request.target_id,
      personId: payload.personId,
    });
  } else if (request.request_type === 'household_admin_add') {
    await addHouseholdAdmin(env, {
      actor: actorDto(context),
      parishId: context.parishId,
      householdId: request.household_id || request.target_id,
      personId: payload.personId,
    });
  } else if (request.request_type === 'household_admin_remove') {
    await removeHouseholdAdmin(env, {
      actor: actorDto(context),
      parishId: context.parishId,
      householdId: request.household_id || request.target_id,
      personId: payload.personId,
    });
  } else {
    throw new DirectoryServiceError(
      'manual_review_required',
      'This request type can be triaged but is not auto-mutated in Phase 3A.',
      422
    );
  }
  return markApproved(env, {
    context,
    row,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
    additionalStatements,
  });
}
export async function householdVerificationStatement(
  env: Partial<Env>,
  {
    context,
    householdId,
    policyVersion,
  }: { context: DirectoryReviewContext; householdId: unknown; policyVersion: unknown }
) {
  const timestamp = nowMs();
  const settings = await getDirectorySettings(env, context.parishId);
  const intervalDays = Math.max(
    30,
    Math.min(1095, Number(settings.householdVerificationIntervalDays || settings.reconfirmationIntervalDays || 365))
  );
  return {
    sql: `INSERT INTO directory_household_verifications
            (household_id, parish_id, verification_status, verification_due_at, last_verified_at,
             verification_started_at, verified_by_user_id, verification_policy_version, created_at, updated_at)
          VALUES (?, ?, 'current', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(household_id) DO UPDATE SET
            verification_status = 'current', verification_due_at = excluded.verification_due_at,
            last_verified_at = excluded.last_verified_at, verified_by_user_id = excluded.verified_by_user_id,
            verification_policy_version = excluded.verification_policy_version, updated_at = excluded.updated_at,
            verification_version = verification_version + 1`,
    params: [
      householdId,
      context.parishId,
      timestamp + intervalDays * 86400000,
      timestamp,
      timestamp,
      context.user.id,
      policyVersion,
      timestamp,
      timestamp,
    ],
  };
}
export async function approveChildPublicationRequest(
  env: Partial<Env>,
  {
    context,
    row,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
  }: {
    context: DirectoryReviewContext;
    row: DirectoryReviewSqlRow;
    reasonCode: unknown;
    reviewerNote: unknown;
    requesterNote: unknown;
    correlationId: string;
  }
) {
  const request = await d1First<DirectoryReviewSqlRow>(
    env,
    "SELECT * FROM directory_child_publication_requests WHERE id = ?1 AND parish_id = ?2 AND status IN ('submitted', 'under_review', 'returned')",
    row.source_id,
    context.parishId
  );
  if (!request) throw new DirectoryServiceError('invalid_transition', 'Only a submitted request can be approved.', 409);

  // Child remains eligible (active, is_child, not protected, active household).
  const eligibility = await checkChildEligibility(env, {
    parishId: context.parishId,
    childPersonId: request.child_person_id,
  });
  if (!eligibility.eligible)
    throw new DirectoryServiceError('child_not_eligible', 'This child is no longer eligible for publication.', 409);

  // Requester remains an authorized household administrator of the same household.
  const requesterStillAuthorized = await d1First<DirectoryReviewSqlRow>(
    env,
    `SELECT ha.id FROM directory_household_admins ha
       JOIN directory_person_links l ON l.person_id = ha.person_id AND l.link_type = 'platform_user' AND l.active = 1
      WHERE ha.household_id = ?1 AND ha.active = 1 AND l.external_id = ?2`,
    request.household_id,
    request.requester_user_id
  );
  if (!requesterStillAuthorized)
    throw new DirectoryServiceError(
      'requester_no_longer_authorized',
      'The requesting household administrator is no longer authorized.',
      409
    );

  // Parish directory must still be enabled.
  const settings = await getDirectorySettings(env, context.parishId);
  if (!settings.directoryEnabled)
    throw new DirectoryServiceError('directory_disabled', 'The private directory is not enabled for this parish.', 409);

  // Requested fields must be exactly allowlisted -- re-sanitize and require
  // an exact match, so a corrupted or tampered row can never approve more
  // than the allowlist permits.
  const requestedFields = JSON.parse(request.requested_fields_json || '[]');
  const sanitizedFields = sanitizeChildFields(requestedFields);
  if (sanitizedFields.length !== requestedFields.length) {
    throw new DirectoryServiceError(
      'invalid_requested_fields',
      'Requested fields are no longer valid against the current allowlist.',
      409
    );
  }

  // Publication-policy revision must still be current.
  if (request.policy_revision !== CHILD_POLICY_REVISION) {
    throw new DirectoryServiceError(
      'stale_policy_revision',
      'This request was submitted under a prior publication policy and must be resubmitted.',
      409
    );
  }

  // Canonical child/household values must not have changed materially
  // since submission (Part 24: stale revision protection).
  const child = await d1First<DirectoryReviewSqlRow>(
    env,
    'SELECT updated_at FROM directory_people WHERE id = ?1',
    request.child_person_id
  );
  const household = await d1First<DirectoryReviewSqlRow>(
    env,
    'SELECT updated_at FROM directory_households WHERE id = ?1',
    request.household_id
  );
  if (request.child_revision && String(child?.updated_at || '') !== request.child_revision) {
    throw new DirectoryServiceError(
      'stale_child_revision',
      "The child's record changed since this request was submitted. Ask the household to resubmit.",
      409
    );
  }
  if (request.household_revision && String(household?.updated_at || '') !== request.household_revision) {
    throw new DirectoryServiceError(
      'stale_household_revision',
      'The household changed since this request was submitted. Ask the household to resubmit.',
      409
    );
  }

  // Photo: approved only if requested AND a currently active, approved,
  // securely-transformed photo exists for this exact child owner. If not
  // ready, the photo is silently excluded from approval (Part 11's
  // documented partial-approval policy) -- the rest of the request still
  // proceeds; the reviewer does not have to reject the whole request over
  // an unready photo.
  let approvedPhoto = false;
  if (Number(request.requested_photo)) {
    const photoRow = await d1First<DirectoryReviewSqlRow>(
      env,
      `SELECT a.id FROM directory_media_assets a
         JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
        WHERE asn.parish_id = ?1 AND asn.owner_type = 'person' AND asn.owner_id = ?2
          AND asn.assignment_status = 'active' AND a.lifecycle_status = 'approved'
          AND a.processing_status = 'securely_transformed' AND a.visibility = 'directory_members'
          AND a.publication_eligible = 1`,
      context.parishId,
      request.child_person_id
    );
    approvedPhoto = Boolean(photoRow);
  }

  const timestamp = nowMs();
  const actor = actorDto(context);
  await runAtomic(env, [
    {
      sql: `UPDATE directory_child_publication_requests
            SET status = 'approved', approved_fields_json = ?1, approved_photo = ?2,
                reviewed_by_user_id = ?3, reviewer_note = ?4, approved_at = ?5, updated_at = ?5
            WHERE id = ?6`,
      params: [
        JSON.stringify(sanitizedFields),
        approvedPhoto ? 1 : 0,
        context.user.id,
        cleanText(reviewerNote, { max: 500 }) || null,
        timestamp,
        request.id,
      ],
    },
    auditStatement({
      action: 'directory.child_publication.request_approved',
      actor,
      parishId: context.parishId,
      targetType: 'directory_child_publication_request',
      targetId: request.id,
      metadata: {
        fields: sanitizedFields,
        approvedPhoto,
        photoExcluded: Boolean(request.requested_photo) && !approvedPhoto,
      },
      correlationId,
    }),
    auditStatement({
      action: 'directory.child_publication.projection_activated',
      actor,
      parishId: context.parishId,
      targetType: 'directory_person',
      targetId: request.child_person_id,
      metadata: { requestId: request.id },
      correlationId,
    }),
  ]);
  return markApproved(env, { context, row, reasonCode, reviewerNote, requesterNote, correlationId });
}

// Parish-staff revocation (Part 18/19). Immediately narrows effective
// visibility to hidden -- approval history is preserved (status becomes
// 'revoked', the row is never deleted), satisfying "do not automatically
// delete publication history."
export async function revokeChildPublicationApproval(
  env: Partial<Env>,
  {
    context,
    requestId,
    reasonCode = '',
    correlationId = '',
  }: { context: DirectoryReviewContext; requestId?: unknown; reasonCode?: unknown; correlationId?: string }
) {
  const actor = actorDto(context);
  requireAny(actor, context.parishId, [DIRECTORY_CAPABILITIES.childPublicationReview, DIRECTORY_CAPABILITIES.manage]);
  const row = await d1First<DirectoryReviewSqlRow>(
    env,
    "SELECT * FROM directory_child_publication_requests WHERE id = ?1 AND parish_id = ?2 AND status = 'approved'",
    requestId,
    context.parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Approved child publication request was not found.', 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_child_publication_requests SET status = 'revoked', revoked_at = ?1, reason_code = ?2, reviewed_by_user_id = ?3, updated_at = ?1 WHERE id = ?4",
      params: [timestamp, cleanText(reasonCode, { max: 80 }) || null, context.user.id, row.id],
    },
    auditStatement({
      action: 'directory.child_publication.approval_revoked',
      actor,
      parishId: context.parishId,
      targetType: 'directory_child_publication_request',
      targetId: row.id,
      metadata: { reasonCode, childPersonId: row.child_person_id },
      correlationId,
    }),
    auditStatement({
      action: 'directory.child_publication.projection_deactivated',
      actor,
      parishId: context.parishId,
      targetType: 'directory_person',
      targetId: row.child_person_id,
      metadata: { reason: 'revoked' },
      correlationId,
    }),
  ]);
  return { ok: true, id: row.id };
}
export async function markApproved(
  env: Partial<Env>,
  {
    context,
    row,
    reasonCode,
    reviewerNote,
    requesterNote,
    correlationId,
    additionalStatements = [],
  }: {
    context: DirectoryReviewContext;
    row: DirectoryReviewSqlRow;
    reasonCode: unknown;
    reviewerNote: unknown;
    requesterNote: unknown;
    correlationId: string;
    additionalStatements?: DirectoryStatement[];
  }
) {
  const actor = actorDto(context);
  const id = await ensureMetadata(env, { actor, row });
  const timestamp = nowMs();
  const sourceUpdate =
    row.source_type === 'change_request'
      ? {
          sql: "UPDATE directory_change_requests SET status = 'completed', decision_reason_code = ?, reviewed_by_user_id = ?, reviewed_at = ?, completed_at = ?, updated_at = ? WHERE id = ?",
          params: [
            cleanText(reasonCode, { max: 80 }) || null,
            context.user.id,
            timestamp,
            timestamp,
            timestamp,
            row.source_id,
          ],
        }
      : null;
  await runAtomic(env, [
    ...additionalStatements,
    ...(sourceUpdate ? [sourceUpdate] : []),
    ...(cleanText(requesterNote, { max: 1200 })
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
      sql: "UPDATE directory_review_metadata SET queue_status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      params: [timestamp, timestamp, id],
    },
    auditStatement({
      action: 'directory.review_item.approved',
      actor,
      parishId: context.parishId,
      targetType: 'directory_review_item',
      targetId: id,
      metadata: {
        sourceType: row.source_type,
        sourceId: row.source_id,
        reasonCode,
        reviewerNote: cleanText(reviewerNote, { max: 500 }),
        requesterNote: cleanText(requesterNote, { max: 500 }),
      },
      correlationId,
    }),
    notificationStatement({
      context,
      row,
      eventType: 'directory.review.approved',
      safeMessage: 'Your directory request was approved.',
    }),
  ]);
  return { ok: true, decision: 'approve', reviewItemId: id };
}
