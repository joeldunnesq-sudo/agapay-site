// Generated from src/handlers/koinonia-access.ts by npm run build:server. Do not edit.
import { DONOR_MEMBERSHIP_SOURCE } from '../directory/donor-membership.js';
import { currentUser } from '../lib/authorization.js';
import { d1First, d1Run, generateSecret, json, normalizeEmail, rateLimit } from '../lib/core.js';
import { communicationsEnabledFor, directoryEnabledFor } from '../lib/entitlements.js';
import { recordParishFeatureRequest } from '../lib/parish-feature-requests.js';
import { DirectoryServiceError } from '../directory/foundation.js';
import {
  directoryReviewMessageStatement,
  listDirectoryReviewConversation,
} from '../directory/review-correspondence.js';
import { resolveDirectorySelfServiceContext, startSelfServiceProfile } from '../directory/self-service.js';
import { getDirectorySettings } from '../directory/settings.js';
import { runAtomic } from '../directory/shared.js';
import {
  HOUSEHOLD_VERIFICATION_REQUIRED_CODE,
  HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE,
  householdVerificationStatus,
  isHouseholdVerificationCurrent,
} from '../lib/household-verification.js';
import { findRegistrationByParishId, requireDonor } from './parish.js';
class KoinoniaAccessError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'KoinoniaAccessError';
    this.code = code;
    this.status = status;
  }
}
function accessError(code, message, status) {
  return new KoinoniaAccessError(code, message, status);
}
async function resolveDonorHouseholdContext(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor?.email) {
    throw accessError('authentication_required', 'Sign in to access Koinonia.', 401);
  }
  const parishId = String(donor.defaultParishId || '').trim();
  if (!parishId) {
    throw accessError('home_parish_required', 'Choose your home parish to access Koinonia.', 422);
  }
  const user = await currentUser(request, env);
  if (!user?.id) {
    throw accessError('parish_profile_required', 'Your donor account is not linked to a parish member profile.', 403);
  }
  const row = await d1First(
    env,
    `
    SELECT p.id AS person_id,
           h.id AS household_id,
           verification.verification_status,
           verification.verification_due_at,
           verification.last_verified_at,
           verification.verification_policy_version
    FROM directory_person_links link
    JOIN directory_people p
      ON p.id = link.person_id
     AND p.active = 1
    JOIN directory_parish_affiliations affiliation
      ON affiliation.person_id = p.id
     AND affiliation.parish_id = ?1
     AND affiliation.active = 1
     AND affiliation.status != 'former_member'
    LEFT JOIN directory_household_members membership
      ON membership.person_id = p.id
     AND membership.active = 1
    LEFT JOIN directory_households h
      ON h.id = membership.household_id
     AND h.parish_id = ?1
     AND h.active = 1
    LEFT JOIN directory_household_verifications verification
      ON verification.household_id = h.id
     AND verification.parish_id = h.parish_id
    WHERE link.link_type = 'platform_user'
      AND link.external_id = ?2
      AND link.active = 1
    ORDER BY CASE WHEN h.id IS NULL THEN 1 ELSE 0 END,
      CASE membership.relationship
      WHEN 'head' THEN 0
      WHEN 'spouse' THEN 1
      ELSE 2
    END, membership.created_at ASC
    LIMIT 1
  `,
    parishId,
    user.id
  );
  if (!row?.person_id) {
    throw accessError('parish_profile_required', 'Your account is not linked to an active parish member.', 403);
  }
  return {
    donor,
    donorId: normalizeEmail(donor.email),
    user,
    parishId,
    personId: row.person_id,
    householdId: row.household_id || '',
    verification: row.household_id
      ? {
          verification_status: row.verification_status,
          verification_due_at: row.verification_due_at,
          last_verified_at: row.last_verified_at,
          verification_policy_version: row.verification_policy_version,
        }
      : null,
  };
}
async function requireVerifiedHousehold(request, env) {
  const context = await resolveDonorHouseholdContext(request, env);
  if (!context.householdId || !isHouseholdVerificationCurrent(context.verification)) {
    throw accessError(HOUSEHOLD_VERIFICATION_REQUIRED_CODE, HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE, 403);
  }
  return {
    ...context,
    verificationStatus: householdVerificationStatus(context.verification),
  };
}
function koinoniaAccessErrorResponse(error) {
  if (!(error instanceof KoinoniaAccessError)) return null;
  return json({ error: error.message, code: error.code }, { status: error.status });
}
async function verifiedHouseholdAccess(request, env) {
  try {
    return { context: await requireVerifiedHousehold(request, env), response: null };
  } catch (error) {
    const response = koinoniaAccessErrorResponse(error);
    if (response) return { context: null, response };
    throw error;
  }
}
async function handleKoinoniaAccess(request, env) {
  if (request.method === 'POST') return requestKoinoniaAccess(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) {
    if (access.response.status !== 403) return access.response;
    const donor = await requireDonor(request, env);
    const user = await currentUser(request, env);
    const parishId = String(donor?.defaultParishId || '').trim();
    const review = user && (await findKoinoniaReview(env, parishId, user.id));
    if (!review) return access.response;
    const returned = review.queue_status === 'returned';
    const conversation = returned
      ? await listDirectoryReviewConversation(env, { parishId, sourceType: 'change_request', sourceId: review.id })
      : [];
    const question = conversation.reverse().find((message) => message.direction === 'staff_to_member');
    return json(
      {
        ...(await access.response.json()),
        review: { status: returned ? 'returned' : review.status, question: question?.body || '' },
      },
      { status: 403 }
    );
  }
  return json({
    ok: true,
    parishId: access.context.parishId,
    householdId: access.context.householdId,
    verificationStatus: access.context.verificationStatus,
    verificationDueAt: Number(access.context.verification.verification_due_at || 0),
  });
}
async function findKoinoniaReview(env, parishId, userId) {
  return d1First(
    env,
    `
    SELECT request.id, request.status, metadata.queue_status
    FROM directory_change_requests request
    LEFT JOIN directory_review_metadata metadata ON metadata.parish_id = request.parish_id
      AND metadata.source_type = 'change_request' AND metadata.source_id = request.id
    WHERE request.parish_id = ?1 AND request.requester_user_id = ?2
      AND request.request_type = 'person_profile_review' AND request.status IN ('pending', 'denied')
      AND json_extract(request.requested_payload_json, '$.source')
        IN ('myagapay_directory_onboarding', 'myagapay_koinonia_access', '${DONOR_MEMBERSHIP_SOURCE}')
    ORDER BY request.status = 'pending' DESC, request.updated_at DESC
    LIMIT 1`,
    parishId,
    userId
  );
}
async function requestKoinoniaAccess(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.context) return json({ ok: true, action: 'already_approved' });
  if (access.response.status !== 403) return access.response;
  const donor = await requireDonor(request, env);
  const parishId = String(donor?.defaultParishId || '').trim();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found || !communicationsEnabledFor(found.registration)) {
    return json({ error: 'Koinonia is unavailable for your home parish.' }, { status: 409 });
  }
  const limited = await rateLimit(request, env, 'donor-koinonia-access', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!directoryEnabledFor(found.registration, await getDirectorySettings(env, parishId))) {
    if (request.body)
      return json(
        { error: 'Your parish Directory is currently disabled. Try again when it is enabled.' },
        { status: 409 }
      );
    await recordParishFeatureRequest(env, { parishId, featureId: 'directory', donorEmail: donor.email });
    return json({ ok: true, action: 'directory_requested' });
  }
  try {
    const context = await resolveDirectorySelfServiceContext(env, { request });
    const review = await findKoinoniaReview(env, parishId, context.user.id);
    if (request.body) {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || !('message' in body) || typeof body.message !== 'string')
        return json({ error: 'Enter a reply to your parish.' }, { status: 422 });
      if (review?.queue_status !== 'returned')
        return json(
          { error: 'Your parish is no longer waiting for a reply. Refresh to check your request.' },
          { status: 409 }
        );
      const timestamp = Date.now();
      const message = directoryReviewMessageStatement({
        parishId,
        sourceType: 'change_request',
        sourceId: review.id,
        direction: 'member_to_staff',
        body: body.message,
        userId: context.user.id,
        timestamp,
      });
      await runAtomic(env, [
        {
          sql: `INSERT INTO directory_review_correspondence
                  (id, parish_id, source_type, source_id, direction, body, created_by_user_id, created_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM directory_review_metadata WHERE parish_id = ?
                  AND source_type = 'change_request' AND source_id = ? AND queue_status = 'returned')`,
          params: [...message.params, parishId, review.id],
        },
        {
          sql: `UPDATE directory_review_metadata SET queue_status = 'pending_review', returned_at = NULL,
                  completed_at = NULL, updated_at = ? WHERE parish_id = ? AND source_type = 'change_request'
                  AND source_id = ? AND queue_status = 'returned'`,
          params: [timestamp, parishId, review.id],
        },
      ]);
      return json({ ok: true, action: 'membership_requested' });
    }
    if (review?.status === 'pending') return json({ ok: true, action: 'membership_requested' });
    if (!context.claimed) {
      const priorLink = await d1First(
        env,
        `
        SELECT 1 FROM directory_person_links WHERE link_type = 'platform_user' AND external_id = ?1`,
        context.user.id
      );
      if (priorLink) {
        return json({ error: 'Ask your parish office to reconnect your existing My AGAPAY profile.' }, { status: 409 });
      }
      try {
        await startSelfServiceProfile(env, { context, data: { parishId, profileVisibility: 'private' } });
      } catch (error) {
        const concurrentReview = await findKoinoniaReview(env, parishId, context.user.id);
        if (concurrentReview?.status !== 'pending') throw error;
      }
    } else {
      const timestamp = Date.now();
      await d1Run(
        env,
        `
        INSERT OR IGNORE INTO directory_change_requests
          (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
           request_type, status, summary, requested_payload_json, created_at, updated_at)
        SELECT ?1, ?2, ?3, ?4, 'person', ?4, 'person_profile_review', 'pending',
               'Koinonia membership access requested', '{"source":"myagapay_koinonia_access"}', ?5, ?5
        WHERE NOT EXISTS (
          SELECT 1 FROM directory_change_requests
          WHERE parish_id = ?2 AND requester_user_id = ?3 AND target_id = ?4
            AND request_type = 'person_profile_review' AND status = 'pending'
            AND json_extract(requested_payload_json, '$.source')
              IN ('myagapay_directory_onboarding', 'myagapay_koinonia_access', '${DONOR_MEMBERSHIP_SOURCE}')
        )`,
        generateSecret('dir_req'),
        parishId,
        context.user.id,
        context.currentPerson.id,
        timestamp
      );
    }
    return json({ ok: true, action: 'membership_requested' });
  } catch (error) {
    if (error instanceof DirectoryServiceError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
export {
  KoinoniaAccessError,
  handleKoinoniaAccess,
  koinoniaAccessErrorResponse,
  requireVerifiedHousehold,
  resolveDonorHouseholdContext,
  verifiedHouseholdAccess,
};
