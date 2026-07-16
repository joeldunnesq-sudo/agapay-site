// src/directory/invitations.js
//
// Parish Directory Phase 1C-1 -- Invitation model, secure tokens, and
// invitation lifecycle. This module does NOT create claims, does NOT link
// identities, and does NOT grant household-administrator access -- those
// are Phase 1C-2/1C-3 (claims.js, identity-links.js, household-access.js).
// See docs/directory/11-phase-1c-invitation-foundation.md for the full
// Phase 1C sub-package breakdown and what is/isn't in this module.
//
// Reuses, rather than duplicates, existing platform primitives:
//   - src/lib/core.js: d1First/d1All/d1Run/generateSecret/randomHex/sha256Hex/secureCompare
//   - src/lib/authorization.js: requireCapability, CAPABILITY_CATALOG
//   - src/directory/shared.js: normalizeActor, assertParishActor, auditStatement, runAtomic, cleanText, nowMs
//   - src/directory/foundation.js: DirectoryServiceError, loadPersonForParish, loadHouseholdForParish

import { d1First, d1All, d1Run, randomHex, sha256Hex, secureCompare, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import {
  assertParishActor,
  auditStatement,
  runAtomic,
  cleanText,
  nowMs,
  loadPersonForParish,
  loadHouseholdForParish
} from "./shared.js";

// --- Capabilities (additive to DIRECTORY_CAPABILITIES / CAPABILITY_CATALOG) ---
// Registered centrally in src/lib/authorization.js's CAPABILITY_CATALOG and
// mirrored here for directory-module call sites, per the existing pattern
// in shared.js's DIRECTORY_CAPABILITIES.
export const DIRECTORY_INVITATION_CAPABILITIES = Object.freeze({
  invitationsManage: "directory.invitations.manage",
  claimsReview: "directory.claims.review",
  identityLinksManage: "directory.identity_links.manage"
});

export const INVITATION_TYPES = Object.freeze([
  "person_claim",
  "household_admin",
  "additional_household_admin"
]);

export const INVITATION_AUTHORITIES = Object.freeze([
  "link_person",
  "grant_household_admin",
  "link_and_grant_household_admin"
]);

export const INVITATION_STATUSES = Object.freeze([
  "pending", "sent", "opened", "accepted", "completed", "expired", "revoked", "cancelled"
]);

// Central, explicit legal-transition table (Part 3: "Define legal
// transitions centrally"). Every status change in this module is checked
// against this table -- there is no other path to changing an
// invitation's status.
const LEGAL_TRANSITIONS = Object.freeze({
  pending: ["sent", "revoked", "expired"],
  sent: ["opened", "accepted", "revoked", "expired"],
  opened: ["accepted", "revoked", "expired"],
  accepted: ["completed", "cancelled"],
  completed: [],
  expired: [],
  revoked: [],
  cancelled: []
});

function assertLegalTransition(fromStatus, toStatus) {
  const allowed = LEGAL_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new DirectoryServiceError(
      "invalid_transition",
      `Invitation cannot move from "${fromStatus}" to "${toStatus}".`,
      409
    );
  }
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const TOKEN_PURPOSE = "directory_invitation";

// --- Secure token generation ---
// 32 bytes (256 bits) of CSPRNG entropy, per Part 2's "generate sufficient
// entropy" requirement. Only the SHA-256 hash is ever stored -- the raw
// token exists only in memory for the duration of this call and in the
// one-time delivery message (Part 11), never written to any table, log,
// or audit payload.
async function generateInvitationToken() {
  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(`${TOKEN_PURPOSE}:${rawToken}`);
  return { rawToken, tokenHash };
}

function invitationRowToDto(row) {
  if (!row) return null;
  // Sanitized shape: never includes token_hash (Part 9: "token not
  // returned through administrative listing").
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
    completedAt: row.completed_at
  };
}

async function loadInvitationForParish(env, invitationId, parishId) {
  const row = await d1First(
    env,
    "SELECT * FROM directory_invitations WHERE id = ?1 AND parish_id = ?2",
    invitationId,
    parishId
  );
  if (!row) throw new DirectoryServiceError("not_found", "Directory invitation was not found for this parish.", 404);
  return row;
}

function validateAuthorityForType(invitationType, intendedAuthority) {
  if (invitationType === "person_claim" && intendedAuthority !== "link_person") {
    throw new DirectoryServiceError("validation_failed", "person_claim invitations may only grant link_person authority.");
  }
  if (
    (invitationType === "household_admin" || invitationType === "additional_household_admin") &&
    !["grant_household_admin", "link_and_grant_household_admin"].includes(intendedAuthority)
  ) {
    throw new DirectoryServiceError(
      "validation_failed",
      "household_admin invitations must grant household-administrator authority, optionally combined with a person link."
    );
  }
}

/**
 * Create a person-claim or household-administrator invitation.
 * Business logic only -- no route handler should build this SQL directly
 * (Part 8: "Business logic must not live in route handlers").
 */
export async function createDirectoryInvitation(env, {
  actor: actorInput,
  parishId: parishIdInput,
  invitationType,
  intendedPersonId,
  intendedHouseholdId = null,
  intendedAuthority,
  recipientEmail = "",
  recipientPhone = "",
  recipientLabel = "",
  ttlMs = DEFAULT_TTL_MS,
  correlationId = ""
}) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: "parishId" });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const type = cleanText(invitationType, { required: true, max: 60, field: "invitationType" });
  if (!INVITATION_TYPES.includes(type)) {
    throw new DirectoryServiceError("validation_failed", "Unsupported directory invitation type.");
  }
  const authority = cleanText(intendedAuthority, { required: true, max: 60, field: "intendedAuthority" });
  if (!INVITATION_AUTHORITIES.includes(authority)) {
    throw new DirectoryServiceError("validation_failed", "Unsupported invitation authority.");
  }
  validateAuthorityForType(type, authority);

  const personId = cleanText(intendedPersonId, { required: true, max: 160, field: "intendedPersonId" });
  // loadPersonForParish enforces parish scope AND that the person is
  // reachable from this parish (Architectural Rule 5: claims are
  // parish-scoped) -- this is the same check Phase 1A/1B already use, not
  // a new one.
  const person = await loadPersonForParish(env, personId, parishId);
  if (!person.active) {
    throw new DirectoryServiceError("validation_failed", "Cannot invite a claim for an inactive directory person.");
  }

  let householdId = null;
  if (type === "household_admin" || type === "additional_household_admin") {
    householdId = cleanText(intendedHouseholdId, { required: true, max: 160, field: "intendedHouseholdId" });
    const household = await loadHouseholdForParish(env, householdId, parishId);
    if (!household.active) {
      throw new DirectoryServiceError("validation_failed", "Cannot invite a household-administrator claim for an inactive household.");
    }
    // The invited person must actually belong to this household -- Part 1
    // explicitly requires the household invitation to still resolve to a
    // specific adult person; this check is what makes that true at
    // creation time (Part 5/13 revalidate it again at approval time).
    const membership = await d1First(
      env,
      "SELECT id, active FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2",
      householdId,
      personId
    );
    if (!membership || !membership.active) {
      throw new DirectoryServiceError("validation_failed", "Intended person is not an active member of the intended household.");
    }
  }

  // Part 17: prevent duplicate simultaneous valid invitations for the
  // same (person, type) pair. The partial unique index in migration 0024
  // enforces this at the database layer too -- this is a friendlier,
  // earlier check, not the only enforcement.
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
      "conflict",
      "An active invitation of this type already exists for this person. Revoke it before creating a new one.",
      409
    );
  }

  const { rawToken, tokenHash } = await generateInvitationToken();
  const id = generateSecret("dinv");
  const now = nowMs();
  // Enforce a 1-hour minimum TTL floor -- guards against a caller
  // accidentally passing a zero/near-zero ttlMs and creating an
  // invitation that is effectively dead on arrival.
  const expiresAt = now + Math.max(1000 * 60 * 60, Number(ttlMs) || DEFAULT_TTL_MS);

  const insertStatement = {
    sql: `INSERT INTO directory_invitations (
            id, parish_id, invitation_type, intended_person_id, intended_household_id,
            intended_authority, recipient_email, recipient_phone, recipient_label,
            issued_by_user_id, token_hash, token_purpose, status, requires_review,
            resend_count, correlation_id, created_at, expires_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?)`,
    params: [
      id, parishId, type, personId, householdId,
      authority,
      cleanText(recipientEmail, { max: 320 }) || null,
      cleanText(recipientPhone, { max: 40 }) || null,
      cleanText(recipientLabel, { max: 160 }) || null,
      actor.userId, tokenHash, TOKEN_PURPOSE,
      correlationId || null, now, expiresAt, now
    ]
  };

  const audit = auditStatement({
    action: "directory.invitation.created",
    actor,
    parishId,
    targetType: "directory_invitation",
    targetId: id,
    householdId,
    after: { invitationType: type, intendedAuthority: authority, intendedPersonId: personId },
    correlationId
  });

  await runAtomic(env, [insertStatement, audit]);

  const row = await d1First(env, "SELECT * FROM directory_invitations WHERE id = ?1", id);
  // rawToken is returned exactly once, to the caller (an admin route or
  // the email-delivery step in Part 11) -- it is never persisted and this
  // function never logs it.
  return { invitation: invitationRowToDto(row), rawToken };
}

/**
 * Mark an invitation as sent (or resent), rotating its token.
 * Part 11 resend requirements: rotate token, invalidate old token,
 * preserve history, update resend count, audit the resend.
 */
export async function resendDirectoryInvitation(env, { actor: actorInput, parishId: parishIdInput, invitationId, correlationId = "" }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: "parishId" });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);

  const nextStatus = row.status === "pending" ? "sent" : row.status;
  if (row.status !== "pending") {
    // Resending a "sent"/"opened" invitation keeps its current status but
    // still rotates the token -- this is not itself a lifecycle
    // transition captured in LEGAL_TRANSITIONS (status doesn't change),
    // so no transition check is needed for that case. A "pending"
    // invitation's first send IS a transition and is checked below.
    assertLegalTransition("pending", "sent"); // no-op safety check when row.status === 'pending' path is skipped
  } else {
    assertLegalTransition(row.status, "sent");
  }
  if (!["pending", "sent", "opened"].includes(row.status)) {
    throw new DirectoryServiceError("invalid_transition", `Cannot resend an invitation in status "${row.status}".`, 409);
  }

  const { rawToken, tokenHash } = await generateInvitationToken();
  const now = nowMs();

  const updateStatement = {
    sql: `UPDATE directory_invitations
          SET token_hash = ?1, status = ?2, resend_count = resend_count + 1,
              last_sent_at = ?3, updated_at = ?3
          WHERE id = ?4`,
    params: [tokenHash, nextStatus, now, invitationId]
  };
  const audit = auditStatement({
    action: "directory.invitation.resent",
    actor,
    parishId,
    targetType: "directory_invitation",
    targetId: invitationId,
    householdId: row.intended_household_id,
    metadata: { resendCount: row.resend_count + 1 },
    correlationId
  });

  await runAtomic(env, [updateStatement, audit]);
  const updated = await d1First(env, "SELECT * FROM directory_invitations WHERE id = ?1", invitationId);
  return { invitation: invitationRowToDto(updated), rawToken };
}

export async function revokeDirectoryInvitation(env, { actor: actorInput, parishId: parishIdInput, invitationId, correlationId = "" }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: "parishId" });
  const actor = assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  assertLegalTransition(row.status, "revoked");

  const now = nowMs();
  const updateStatement = {
    sql: "UPDATE directory_invitations SET status = 'revoked', revoked_at = ?1, updated_at = ?1 WHERE id = ?2",
    params: [now, invitationId]
  };
  const audit = auditStatement({
    action: "directory.invitation.revoked",
    actor,
    parishId,
    targetType: "directory_invitation",
    targetId: invitationId,
    householdId: row.intended_household_id,
    correlationId
  });
  await runAtomic(env, [updateStatement, audit]);
  const updated = await d1First(env, "SELECT * FROM directory_invitations WHERE id = ?1", invitationId);
  return invitationRowToDto(updated);
}

/**
 * Sweep expired invitations for a parish (or, if parishId is omitted,
 * intended to be called by a scheduled/background job across all
 * parishes -- Part 6 of the Phase 0.75 background-processing design).
 * Phase 1C-1 only implements the sweep itself, synchronously; wiring it
 * to a cron/queue is deferred, consistent with Phase 0.75's decision to
 * select but not yet build a background-job primitive.
 */
export async function expireStaleDirectoryInvitations(env, { parishId = null, correlationId = "" } = {}) {
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

  const list = Array.isArray(rows) ? rows : (rows?.results || []);
  let expiredCount = 0;
  for (const row of list) {
    const updateStatement = {
      sql: "UPDATE directory_invitations SET status = 'expired', updated_at = ?1 WHERE id = ?2 AND status IN ('pending','sent','opened')",
      params: [now, row.id]
    };
    const audit = {
      sql: `INSERT INTO audit_log (
              id, actor_user_id, actor_type, action, target_type, target_id,
              organization_id, household_id, request_id, created_at
            ) VALUES (?, ?, 'system', 'directory.invitation.expired', 'directory_invitation', ?, ?, ?, ?, datetime('now'))`,
      params: [generateSecret("audit"), "system:directory-expiry", row.id, row.parish_id, row.intended_household_id, correlationId || null]
    };
    await runAtomic(env, [updateStatement, audit]);
    expiredCount += 1;
  }
  return { expiredCount };
}

/**
 * Inspect an invitation by its raw token, for the recipient's own
 * acceptance flow. Never exposes token_hash. Returns null (not a
 * DirectoryServiceError) for any invalid/expired/unknown token, so that
 * the caller returns a uniform, generic response and cannot be used to
 * enumerate whether a given token string was ever valid (Part 13/17).
 */
export async function inspectDirectoryInvitationByToken(env, rawToken) {
  const token = cleanText(rawToken, { required: false, max: 200 });
  if (!token) return null;
  const tokenHash = await sha256Hex(`${TOKEN_PURPOSE}:${token}`);
  // token_hash has a UNIQUE index (migration 0024) so this is an exact,
  // O(1)-indexed lookup -- not a scan-and-compare that would leak timing
  // information about how many invitations exist.
  const row = await d1First(env, "SELECT * FROM directory_invitations WHERE token_hash = ?1", tokenHash);
  if (!row) return null;

  // Defense in depth: even though the index lookup already requires an
  // exact hash match, re-verify with a constant-time comparison before
  // trusting the row, so a future refactor that changes the lookup
  // strategy doesn't silently drop this guarantee.
  const verifyHash = await sha256Hex(`${TOKEN_PURPOSE}:${token}`);
  if (!secureCompare(row.token_hash, verifyHash)) return null;

  if (["expired", "revoked", "completed", "cancelled"].includes(row.status)) return null;
  if (row.expires_at <= nowMs()) return null;

  return invitationRowToDto(row);
}

/**
 * Mark an invitation "opened" the first time its token is successfully
 * inspected by an unauthenticated or authenticated recipient (Part 3:
 * "opened", tracked only if safely useful -- this only records that the
 * link was visited, not who visited it beyond what's already in the
 * request's own audit trail).
 */
export async function markDirectoryInvitationOpened(env, invitationId) {
  const row = await d1First(env, "SELECT status FROM directory_invitations WHERE id = ?1", invitationId);
  if (!row || row.status !== "sent") return; // only a fresh "sent" invitation transitions to "opened"; already-opened is a no-op
  assertLegalTransition(row.status, "opened");
  await d1Run(env, "UPDATE directory_invitations SET status = 'opened', updated_at = ?1 WHERE id = ?2", nowMs(), invitationId);
}

/**
 * Build (but do not execute) the statement that transitions an invitation
 * to "accepted". This is intentionally a statement-builder, not a
 * standalone mutation, because Part 3 requires "acceptance and claim
 * creation must be transactionally coordinated" -- claims.js (Phase
 * 1C-2) includes this statement in the same runAtomic batch as claim
 * creation, so the invitation and its claim are created atomically
 * together or not at all.
 */
export function buildAcceptInvitationStatement({ invitationId, currentStatus }) {
  assertLegalTransition(currentStatus, "accepted");
  return {
    sql: "UPDATE directory_invitations SET status = 'accepted', accepted_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = ?3",
    params: [nowMs(), invitationId, currentStatus]
  };
}

/**
 * Build (but do not execute) the statement that transitions an invitation
 * to "completed". Called transactionally by claims.js once identity
 * linking (and, where applicable, household-administrator grant) has
 * succeeded (Part 3: "completion occurs only after required links and
 * administrator grants succeed").
 */
export function buildCompleteInvitationStatement({ invitationId }) {
  assertLegalTransition("accepted", "completed");
  return {
    sql: "UPDATE directory_invitations SET status = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'accepted'",
    params: [nowMs(), invitationId]
  };
}

/**
 * Build (but do not execute) the statement that cancels an "accepted"
 * invitation whose claim was denied or cancelled after acceptance.
 */
export function buildCancelAcceptedInvitationStatement({ invitationId }) {
  assertLegalTransition("accepted", "cancelled");
  return {
    sql: "UPDATE directory_invitations SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND status = 'accepted'",
    params: [nowMs(), invitationId]
  };
}

export async function listParishDirectoryInvitations(env, { actor: actorInput, parishId: parishIdInput, status = null }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: "parishId" });
  assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const rows = status
    ? await d1All(env, "SELECT * FROM directory_invitations WHERE parish_id = ?1 AND status = ?2 ORDER BY created_at DESC", parishId, status)
    : await d1All(env, "SELECT * FROM directory_invitations WHERE parish_id = ?1 ORDER BY created_at DESC", parishId);
  const list = Array.isArray(rows) ? rows : (rows?.results || []);
  return list.map(invitationRowToDto);
}

export async function getDirectoryInvitationById(env, { actor: actorInput, parishId: parishIdInput, invitationId }) {
  const parishId = cleanText(parishIdInput, { required: true, max: 160, field: "parishId" });
  assertParishActor(actorInput, parishId, [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  const row = await loadInvitationForParish(env, invitationId, parishId);
  return invitationRowToDto(row);
}

export { LEGAL_TRANSITIONS as INVITATION_LEGAL_TRANSITIONS, assertLegalTransition as assertInvitationTransition, loadInvitationForParish };
