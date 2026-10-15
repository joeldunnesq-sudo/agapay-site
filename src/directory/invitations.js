// Generated from src/directory/invitations.ts by npm run build:server. Do not edit.
import { d1First, d1All, d1Run, randomHex, sha256Hex, secureCompare, generateSecret } from '../lib/core.js';
import { DirectoryServiceError } from './foundation.js';
import {
  assertParishActor,
  auditStatement,
  runAtomic,
  cleanText,
  nowMs,
  loadPersonForParish,
  loadHouseholdForParish,
} from './shared.js';
const DIRECTORY_INVITATION_CAPABILITIES = Object.freeze({
  invitationsManage: 'directory.invitations.manage',
  claimsReview: 'directory.claims.review',
  identityLinksManage: 'directory.identity_links.manage',
});
const INVITATION_TYPES = Object.freeze(['person_claim', 'household_admin', 'additional_household_admin']);
const INVITATION_AUTHORITIES = Object.freeze([
  'link_person',
  'grant_household_admin',
  'link_and_grant_household_admin',
]);
const INVITATION_STATUSES = Object.freeze([
  'pending',
  'sent',
  'opened',
  'accepted',
  'completed',
  'expired',
  'revoked',
  'cancelled',
]);
const LEGAL_TRANSITIONS = Object.freeze({
  pending: ['sent', 'revoked', 'expired'],
  sent: ['opened', 'accepted', 'revoked', 'expired'],
  opened: ['accepted', 'revoked', 'expired'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  expired: [],
  revoked: [],
  cancelled: [],
});
function assertLegalTransition(fromStatus, toStatus) {
  const allowed = LEGAL_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new DirectoryServiceError(
      'invalid_transition',
      `Invitation cannot move from "${fromStatus}" to "${toStatus}".`,
      409
    );
  }
}
const DEFAULT_TTL_MS = 1e3 * 60 * 60 * 24 * 14;
const TOKEN_PURPOSE = 'directory_invitation';
async function generateInvitationToken() {
  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(`${TOKEN_PURPOSE}:${rawToken}`);
  return { rawToken, tokenHash };
}
function invitationRowToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    invitationType: row.invitation_type,
    intendedPersonId: row.intended_person_id,
    intendedHouseholdId: row.intended_household_id,
    intendedAuthority: row.intended_authority,
    recipientEmail: row.recipient_email,
    recipientLabel: row.recipient_label,
    issuedByUserId: row.issued_by_user_id,
    status: row.status,
    requiresReview: Boolean(row.requires_review),
    resendCount: row.resend_count,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    completedAt: row.completed_at,
  };
}
async function loadInvitationForParish(env, invitationId, parishId) {
  const row = await d1First(
    env,
    'SELECT * FROM directory_invitations WHERE id = ?1 AND parish_id = ?2',
    invitationId,
    parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory invitation was not found for this parish.', 404);
  return row;
}
function validateAuthorityForType(invitationType, intendedAuthority) {
  if (invitationType === 'person_claim' && intendedAuthority !== 'link_person') {
    throw new DirectoryServiceError(
      'validation_failed',
      'person_claim invitations may only grant link_person authority.'
    );
  }
  if (
    (invitationType === 'household_admin' || invitationType === 'additional_household_admin') &&
    !['grant_household_admin', 'link_and_grant_household_admin'].includes(intendedAuthority)
  ) {
    throw new DirectoryServiceError(
      'validation_failed',
      'household_admin invitations must grant household-administrator authority, optionally combined with a person link.'
    );
  }
}
async function createDirectoryInvitation(
  env,
  {
    actor: actorInput,
    parishId: parishIdInput,
    invitationType,
    intendedPersonId,
    intendedHouseholdId = null,
    intendedAuthority,
    recipientEmail = '',
    recipientPhone = '',
    recipientLabel = '',
    ttlMs = DEFAULT_TTL_MS,
    correlationId = '',
  }
) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const type = cleanText(invitationType, { required: true, max: 60, field: 'invitationType' });
  if (!INVITATION_TYPES.includes(type)) {
    throw new DirectoryServiceError('validation_failed', 'Unsupported directory invitation type.');
  }
  const authority = cleanText(intendedAuthority, { required: true, max: 60, field: 'intendedAuthority' });
  if (!INVITATION_AUTHORITIES.includes(authority)) {
    throw new DirectoryServiceError('validation_failed', 'Unsupported invitation authority.');
  }
  validateAuthorityForType(type, authority);
  const personId = cleanText(intendedPersonId, { required: true, max: 160, field: 'intendedPersonId' });
  const person = await loadPersonForParish(env, personId, parishId);
  if (!person.active) {
    throw new DirectoryServiceError('validation_failed', 'Cannot invite a claim for an inactive directory person.');
  }
  const privacyFlags = await d1First(
    env,
    'SELECT is_child FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2 AND active = 1 ORDER BY updated_at DESC LIMIT 1',
    parishId,
    personId
  );
  if (Number(privacyFlags?.is_child || 0) === 1) {
    throw new DirectoryServiceError(
      'child_invitation_denied',
      'Children are managed through their household and cannot receive a My AGAPAY account invitation.',
      403
    );
  }
  let householdId = null;
  if (type === 'household_admin' || type === 'additional_household_admin') {
    householdId = cleanText(intendedHouseholdId, { required: true, max: 160, field: 'intendedHouseholdId' });
    const household = await loadHouseholdForParish(env, householdId, parishId);
    if (!household.active) {
      throw new DirectoryServiceError(
        'validation_failed',
        'Cannot invite a household-administrator claim for an inactive household.'
      );
    }
    const membership = await d1First(
      env,
      'SELECT id, active FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2',
      householdId,
      personId
    );
    if (!membership || !membership.active) {
      throw new DirectoryServiceError(
        'validation_failed',
        'Intended person is not an active member of the intended household.'
      );
    }
  }
  const existingActive = await d1First(
    env,
    `SELECT id FROM directory_invitations
     WHERE intended_person_id = ?1 AND invitation_type = ?2
       AND status IN ('pending', 'sent', 'opened', 'accepted')`,
    personId,
    type
  );
  if (existingActive) {
    throw new DirectoryServiceError(
      'conflict',
      'An active invitation of this type already exists for this person. Revoke it before creating a new one.',
      409
    );
  }
  const { rawToken, tokenHash } = await generateInvitationToken();
  const id = generateSecret('dinv');
  const now = nowMs();
  const expiresAt = now + Math.max(1e3 * 60 * 60, Number(ttlMs) || DEFAULT_TTL_MS);
  const insertStatement = {
    sql: `INSERT INTO directory_invitations (
            id, parish_id, invitation_type, intended_person_id, intended_household_id,
            intended_authority, recipient_email, recipient_phone, recipient_label,
            issued_by_user_id, token_hash, token_purpose, status, requires_review,
            resend_count, correlation_id, created_at, expires_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?)`,
    params: [
      id,
      parishId,
      type,
      personId,
      householdId,
      authority,
      cleanText(recipientEmail, { max: 320 }) || null,
      cleanText(recipientPhone, { max: 40 }) || null,
      cleanText(recipientLabel, { max: 160 }) || null,
      actor.userId,
      tokenHash,
      TOKEN_PURPOSE,
      correlationId || null,
      now,
      expiresAt,
      now,
    ],
  };
  const audit = auditStatement({
    action: 'directory.invitation.created',
    actor,
    parishId,
    targetType: 'directory_invitation',
    targetId: id,
    householdId,
    after: { invitationType: type, intendedAuthority: authority, intendedPersonId: personId },
    correlationId,
  });
  await runAtomic(env, [insertStatement, audit]);
  const row = await d1First(env, 'SELECT * FROM directory_invitations WHERE id = ?1', id);
  return { invitation: invitationRowToDto(row), rawToken };
}
async function markDirectoryInvitationSent(
  env,
  { actor: actorInput, parishId: parishIdInput, invitationId, correlationId = '' }
) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  if (row.status !== 'pending') {
    throw new DirectoryServiceError('invalid_transition', `Cannot send an invitation in status "${row.status}".`, 409);
  }
  assertLegalTransition('pending', 'sent');
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_invitations SET status = 'sent', last_sent_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'pending'",
      params: [timestamp, invitationId],
    },
    auditStatement({
      action: 'directory.invitation.sent',
      actor,
      parishId,
      targetType: 'directory_invitation',
      targetId: invitationId,
      householdId: row.intended_household_id,
      correlationId,
    }),
  ]);
  return invitationRowToDto(await d1First(env, 'SELECT * FROM directory_invitations WHERE id = ?1', invitationId));
}
async function resendDirectoryInvitation(
  env,
  { actor: actorInput, parishId: parishIdInput, invitationId, correlationId = '' }
) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  const nextStatus = row.status === 'pending' ? 'sent' : row.status;
  if (row.status !== 'pending') {
    assertLegalTransition('pending', 'sent');
  } else {
    assertLegalTransition(row.status, 'sent');
  }
  if (!['pending', 'sent', 'opened'].includes(row.status)) {
    throw new DirectoryServiceError(
      'invalid_transition',
      `Cannot resend an invitation in status "${row.status}".`,
      409
    );
  }
  const { rawToken, tokenHash } = await generateInvitationToken();
  const now = nowMs();
  const updateStatement = {
    sql: `UPDATE directory_invitations
          SET token_hash = ?1, status = ?2, resend_count = resend_count + 1,
              last_sent_at = ?3, updated_at = ?3
          WHERE id = ?4`,
    params: [tokenHash, nextStatus, now, invitationId],
  };
  const audit = auditStatement({
    action: 'directory.invitation.resent',
    actor,
    parishId,
    targetType: 'directory_invitation',
    targetId: invitationId,
    householdId: row.intended_household_id,
    metadata: { resendCount: row.resend_count + 1 },
    correlationId,
  });
  await runAtomic(env, [updateStatement, audit]);
  const updated = await d1First(env, 'SELECT * FROM directory_invitations WHERE id = ?1', invitationId);
  return { invitation: invitationRowToDto(updated), rawToken };
}
async function revokeDirectoryInvitation(
  env,
  { actor: actorInput, parishId: parishIdInput, invitationId, correlationId = '' }
) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  assertLegalTransition(row.status, 'revoked');
  const now = nowMs();
  const updateStatement = {
    sql: "UPDATE directory_invitations SET status = 'revoked', revoked_at = ?1, updated_at = ?1 WHERE id = ?2",
    params: [now, invitationId],
  };
  const audit = auditStatement({
    action: 'directory.invitation.revoked',
    actor,
    parishId,
    targetType: 'directory_invitation',
    targetId: invitationId,
    householdId: row.intended_household_id,
    correlationId,
  });
  await runAtomic(env, [updateStatement, audit]);
  const updated = await d1First(env, 'SELECT * FROM directory_invitations WHERE id = ?1', invitationId);
  return invitationRowToDto(updated);
}
async function expireStaleDirectoryInvitations(env, { parishId = null, correlationId = '' } = {}) {
  const now = nowMs();
  const rows = parishId
    ? await d1All(
        env,
        "SELECT id, parish_id, intended_household_id FROM directory_invitations WHERE parish_id = ?1 AND status IN ('pending','sent','opened') AND expires_at <= ?2",
        parishId,
        now
      )
    : await d1All(
        env,
        "SELECT id, parish_id, intended_household_id FROM directory_invitations WHERE status IN ('pending','sent','opened') AND expires_at <= ?1",
        now
      );
  const list = Array.isArray(rows) ? rows : rows?.results || [];
  let expiredCount = 0;
  for (const row of list) {
    const updateStatement = {
      sql: "UPDATE directory_invitations SET status = 'expired', updated_at = ?1 WHERE id = ?2 AND status IN ('pending','sent','opened')",
      params: [now, row.id],
    };
    const audit = {
      sql: `INSERT INTO audit_log (
              id, actor_user_id, actor_type, action, target_type, target_id,
              organization_id, household_id, request_id, created_at
            ) VALUES (?, ?, 'system', 'directory.invitation.expired', 'directory_invitation', ?, ?, ?, ?, datetime('now'))`,
      params: [
        generateSecret('audit'),
        'system:directory-expiry',
        row.id,
        row.parish_id,
        row.intended_household_id,
        correlationId || null,
      ],
    };
    await runAtomic(env, [updateStatement, audit]);
    expiredCount += 1;
  }
  return { expiredCount };
}
async function inspectDirectoryInvitationByToken(env, rawToken) {
  const token = cleanText(rawToken, { required: false, max: 200 });
  if (!token) return null;
  const tokenHash = await sha256Hex(`${TOKEN_PURPOSE}:${token}`);
  const row = await d1First(env, 'SELECT * FROM directory_invitations WHERE token_hash = ?1', tokenHash);
  if (!row) return null;
  const verifyHash = await sha256Hex(`${TOKEN_PURPOSE}:${token}`);
  if (!secureCompare(row.token_hash, verifyHash)) return null;
  if (['expired', 'revoked', 'completed', 'cancelled'].includes(row.status)) return null;
  if (row.expires_at <= nowMs()) return null;
  return invitationRowToDto(row);
}
async function markDirectoryInvitationOpened(env, invitationId) {
  const row = await d1First(env, 'SELECT status FROM directory_invitations WHERE id = ?1', invitationId);
  if (!row || row.status !== 'sent') return;
  assertLegalTransition(row.status, 'opened');
  await d1Run(
    env,
    "UPDATE directory_invitations SET status = 'opened', updated_at = ?1 WHERE id = ?2",
    nowMs(),
    invitationId
  );
}
function buildAcceptInvitationStatement({ invitationId, currentStatus }) {
  assertLegalTransition(currentStatus, 'accepted');
  return {
    sql: "UPDATE directory_invitations SET status = 'accepted', accepted_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = ?3",
    params: [nowMs(), invitationId, currentStatus],
  };
}
function buildCompleteInvitationStatement({ invitationId }) {
  assertLegalTransition('accepted', 'completed');
  return {
    sql: "UPDATE directory_invitations SET status = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'accepted'",
    params: [nowMs(), invitationId],
  };
}
function buildCancelAcceptedInvitationStatement({ invitationId }) {
  assertLegalTransition('accepted', 'cancelled');
  return {
    sql: "UPDATE directory_invitations SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND status = 'accepted'",
    params: [nowMs(), invitationId],
  };
}
async function listParishDirectoryInvitations(env, { actor: actorInput, parishId: parishIdInput, status = null }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const rows = status
    ? await d1All(
        env,
        'SELECT * FROM directory_invitations WHERE parish_id = ?1 AND status = ?2 ORDER BY created_at DESC',
        parishId,
        status
      )
    : await d1All(env, 'SELECT * FROM directory_invitations WHERE parish_id = ?1 ORDER BY created_at DESC', parishId);
  const list = Array.isArray(rows) ? rows : rows?.results || [];
  return list.map(invitationRowToDto);
}
async function getDirectoryInvitationById(env, { actor: actorInput, parishId: parishIdInput, invitationId }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: 'parishId' });
  assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  return invitationRowToDto(row);
}
export {
  DIRECTORY_INVITATION_CAPABILITIES,
  INVITATION_AUTHORITIES,
  LEGAL_TRANSITIONS as INVITATION_LEGAL_TRANSITIONS,
  INVITATION_STATUSES,
  INVITATION_TYPES,
  assertLegalTransition as assertInvitationTransition,
  buildAcceptInvitationStatement,
  buildCancelAcceptedInvitationStatement,
  buildCompleteInvitationStatement,
  createDirectoryInvitation,
  expireStaleDirectoryInvitations,
  getDirectoryInvitationById,
  inspectDirectoryInvitationByToken,
  listParishDirectoryInvitations,
  loadInvitationForParish,
  markDirectoryInvitationOpened,
  markDirectoryInvitationSent,
  resendDirectoryInvitation,
  revokeDirectoryInvitation,
};
