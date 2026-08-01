import { d1First, generateSecret, randomHex, sha256Hex } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { auditStatement, cleanText, isActiveHouseholdAdmin, runAtomic, safeJson } from "./shared.js";

const TOKEN_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN_DOMAIN = "directory_household_share:";

async function tokenDigest(token) {
  const cleaned = cleanText(token, { required: true, max: 256, field: "token" });
  return sha256Hex(`${TOKEN_DOMAIN}${cleaned}`);
}

function invitationStateError(row) {
  if (!row) return new DirectoryServiceError("invitation_not_found", "This household link is not valid.", 404);
  if (row.status === "claimed") return new DirectoryServiceError("invitation_already_claimed", "This household link has already been used.", 409);
  if (row.status === "cancelled") return new DirectoryServiceError("invitation_cancelled", "This household link was cancelled.", 410);
  return new DirectoryServiceError("invitation_expired", "This household link has expired. Ask your household member for a new link.", 410);
}

async function loadInvitationByToken(env, token) {
  const digest = await tokenDigest(token);
  const row = await d1First(
    env,
    `SELECT i.*, h.display_name AS household_name, h.active AS household_active,
            p.preferred_name AS person_name, p.active AS person_active,
            hm.relationship, hm.active AS membership_active,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person
       FROM directory_household_invitations i
       JOIN directory_households h ON h.id = i.household_id
       JOIN directory_people p ON p.id = i.person_id
       LEFT JOIN directory_household_members hm
         ON hm.household_id = i.household_id AND hm.person_id = i.person_id
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = i.parish_id AND f.person_id = i.person_id AND f.active = 1
      WHERE i.token = ?1`,
    digest
  );
  if (row?.status === "pending" && Date.parse(row.expires_at) <= Date.now()) {
    await runAtomic(env, [{
      sql: "UPDATE directory_household_invitations SET status = 'expired' WHERE id = ?1 AND status = 'pending'",
      params: [row.id]
    }]);
    row.status = "expired";
  }
  return row;
}

function assertUsable(row) {
  if (!row || row.status !== "pending") throw invitationStateError(row);
  if (!Number(row.household_active) || !Number(row.person_active) || !Number(row.membership_active)) {
    throw new DirectoryServiceError("invitation_no_longer_eligible", "This person is no longer an active member of that household.", 409);
  }
  if (Number(row.is_child) || Number(row.protected_person)) {
    throw new DirectoryServiceError("invitation_no_longer_eligible", "This household link cannot be used for this person.", 409);
  }
}

export async function createHouseholdShareInvitation(env, { context, householdId, personId, correlationId = "" }) {
  const managed = context.manageableHouseholds?.find((household) => household.id === householdId);
  if (!managed || !context.currentPerson?.id) {
    throw new DirectoryServiceError("forbidden", "You cannot create links for this household.", 403);
  }
  if (!await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson.id })) {
    throw new DirectoryServiceError("forbidden", "Only an active household administrator can share household links.", 403);
  }
  if (personId === context.currentPerson.id) {
    throw new DirectoryServiceError("validation_failed", "Your account is already connected to you.", 422);
  }
  const member = await d1First(
    env,
    `SELECT p.preferred_name, hm.relationship,
            COALESCE(f.is_child, 0) AS is_child,
            COALESCE(f.protected_person, 0) AS protected_person,
            EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.active = 1) AS account_linked
       FROM directory_household_members hm
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = ?3 AND f.person_id = p.id AND f.active = 1
      WHERE hm.household_id = ?1 AND hm.person_id = ?2 AND hm.active = 1`,
    householdId,
    personId,
    managed.parishId
  );
  if (!member) throw new DirectoryServiceError("not_found", "That household member was not found.", 404);
  if (Number(member.is_child) || Number(member.protected_person)) {
    throw new DirectoryServiceError("forbidden", "Household share links are available only for unprotected adults.", 403);
  }
  if (Number(member.account_linked)) {
    throw new DirectoryServiceError("already_connected", "That household member already has a connected account.", 409);
  }

  const id = generateSecret("dir_household_inv");
  const rawToken = randomHex(32);
  const digest = await tokenDigest(rawToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  const actor = { userId: context.user.id, personId: context.currentPerson.id, parishId: managed.parishId };
  await runAtomic(env, [
    {
      sql: `UPDATE directory_household_invitations
               SET status = 'cancelled'
             WHERE household_id = ?1 AND person_id = ?2 AND status = 'pending'`,
      params: [householdId, personId]
    },
    {
      sql: `INSERT INTO directory_household_invitations
              (id, parish_id, household_id, person_id, token, created_by_user_id,
               status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      params: [id, managed.parishId, householdId, personId, digest, context.user.id, createdAt, expiresAt]
    },
    auditStatement({
      action: "directory.household_share.created",
      actor,
      parishId: managed.parishId,
      targetType: "directory_household_invitation",
      targetId: id,
      householdId,
      after: { personId, expiresAt },
      correlationId
    })
  ]);
  return {
    id,
    personId,
    personName: member.preferred_name,
    expiresAt,
    sharePath: `/myagapay/join-household?token=${encodeURIComponent(rawToken)}`
  };
}

export async function inspectHouseholdShareInvitation(env, { token }) {
  const row = await loadInvitationByToken(env, token);
  assertUsable(row);
  return {
    id: row.id,
    personName: row.person_name,
    householdName: row.household_name,
    expiresAt: row.expires_at,
    status: row.status
  };
}

export async function claimHouseholdShareInvitation(env, { context, token, correlationId = "" }) {
  if (!context.user?.id) throw new DirectoryServiceError("unauthorized", "Sign in before using this household link.", 401);
  const row = await loadInvitationByToken(env, token);
  assertUsable(row);

  const existingTargetLink = await d1First(
    env,
    "SELECT external_id FROM directory_person_links WHERE person_id = ?1 AND link_type = 'platform_user' AND active = 1 LIMIT 1",
    row.person_id
  );
  if (existingTargetLink?.external_id === context.user.id) {
    throw new DirectoryServiceError("already_connected", "Your account is already connected to this household member.", 409);
  }
  if (existingTargetLink) {
    throw new DirectoryServiceError("person_already_connected", "This household member is already connected to another account. Parish staff can help resolve it.", 409);
  }

  const claimantLink = await d1First(
    env,
    `SELECT l.person_id,
            EXISTS(
              SELECT 1 FROM directory_household_members hm
               WHERE hm.person_id = l.person_id AND hm.active = 1 AND hm.household_id <> ?2
            ) AS different_household
       FROM directory_person_links l
      WHERE l.link_type = 'platform_user' AND l.external_id = ?1 AND l.active = 1
      LIMIT 1`,
    context.user.id,
    row.household_id
  );
  const hasConflict = Boolean(claimantLink && (claimantLink.person_id !== row.person_id || Number(claimantLink.different_household)));
  const conflictMessage = hasConflict
    ? "CONFLICT: claiming account is already connected to a different directory person or household; staff must resolve identity before approval."
    : "";
  const summary = hasConflict
    ? `${conflictMessage} Review account link for ${row.person_name} in ${row.household_name}.`
    : `Review account link for ${row.person_name} in ${row.household_name}; submitted from a household share link.`;
  const requestId = generateSecret("dir_req");
  const timestamp = Date.now();
  const payload = {
    personId: row.person_id,
    relationship: row.relationship || "other",
    shareToLink: {
      invitationId: row.id,
      claimantUserId: context.user.id,
      existingHouseholdConflict: hasConflict,
      conflictMessage
    }
  };
  const actor = { userId: context.user.id, personId: context.currentPerson?.id || null, parishId: row.parish_id };
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            SELECT ?, ?, i.created_by_user_id, creator.person_id, 'household', i.household_id,
                   i.household_id, 'household_membership_add', 'pending', ?, ?, ?, ?
              FROM directory_household_invitations i
              JOIN directory_person_links creator
                ON creator.link_type = 'platform_user'
               AND creator.external_id = i.created_by_user_id
               AND creator.active = 1
             WHERE i.id = ? AND i.status = 'pending' AND i.expires_at > datetime('now')`,
      params: [requestId, row.parish_id, summary.slice(0, 240), safeJson(payload) || "{}", timestamp, timestamp, row.id]
    },
    {
      sql: `UPDATE directory_household_invitations
               SET status = 'claimed', claimed_by_user_id = ?1, claimed_at = ?2
             WHERE id = ?3 AND status = 'pending' AND expires_at > datetime('now')`,
      params: [context.user.id, new Date().toISOString(), row.id]
    },
    auditStatement({
      action: "directory.household_share.claimed_for_review",
      actor,
      parishId: row.parish_id,
      targetType: "directory_household_invitation",
      targetId: row.id,
      householdId: row.household_id,
      after: { requestId, personId: row.person_id, existingHouseholdConflict: hasConflict },
      correlationId
    })
  ]);
  const createdRequest = await d1First(env, "SELECT id FROM directory_change_requests WHERE id = ?1", requestId);
  if (!createdRequest) {
    throw new DirectoryServiceError("invitation_already_claimed", "This household link has already been used.", 409);
  }
  return {
    requestId,
    status: "pending_review",
    conflictFlagged: hasConflict,
    message: "Your request was submitted for parish review. Your account is not connected unless parish staff approves it."
  };
}
