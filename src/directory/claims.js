import { d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import {
  buildAcceptInvitationStatement,
  buildCompleteInvitationStatement,
  inspectDirectoryInvitationByToken,
  markDirectoryInvitationOpened
} from "./invitations.js";
import { auditStatement, cleanText, nowMs, runAtomic } from "./shared.js";

function normalizedEmail(value) {
  return cleanText(value, { max: 320 }).trim().toLowerCase();
}

export async function inspectDirectoryInvitationForRecipient(env, { token }) {
  const invitation = await inspectDirectoryInvitationByToken(env, token);
  if (!invitation) {
    throw new DirectoryServiceError("invalid_invitation", "This directory invitation is invalid or has expired.", 404);
  }
  const [person, household] = await Promise.all([
    d1First(env, "SELECT preferred_name, active FROM directory_people WHERE id = ?1", invitation.intendedPersonId),
    invitation.intendedHouseholdId
      ? d1First(env, "SELECT display_name, active FROM directory_households WHERE id = ?1 AND parish_id = ?2", invitation.intendedHouseholdId, invitation.parishId)
      : null
  ]);
  if (!person?.active || (invitation.intendedHouseholdId && !household?.active)) {
    throw new DirectoryServiceError("invalid_invitation", "This directory invitation is no longer available.", 404);
  }
  await markDirectoryInvitationOpened(env, invitation.id);
  return {
    id: invitation.id,
    parishId: invitation.parishId,
    personName: person.preferred_name,
    householdName: household?.display_name || "",
    authority: invitation.intendedAuthority,
    recipientEmail: invitation.recipientEmail || "",
    status: invitation.status === "sent" ? "opened" : invitation.status,
    expiresAt: invitation.expiresAt
  };
}

export async function acceptDirectoryInvitation(env, {
  user,
  token,
  correlationId = ""
}) {
  if (!user?.id) {
    throw new DirectoryServiceError("unauthorized", "Sign in to My AGAPAY before accepting this invitation.", 401);
  }
  const invitation = await inspectDirectoryInvitationByToken(env, token);
  if (!invitation) {
    throw new DirectoryServiceError("invalid_invitation", "This directory invitation is invalid or has expired.", 404);
  }
  if (!["sent", "opened"].includes(invitation.status)) {
    throw new DirectoryServiceError("invalid_transition", "This directory invitation is not ready to accept.", 409);
  }
  const invitedEmail = normalizedEmail(invitation.recipientEmail);
  const accountEmail = normalizedEmail(user.email);
  if (invitedEmail && invitedEmail !== accountEmail) {
    throw new DirectoryServiceError("wrong_account", "This invitation was sent to a different My AGAPAY email address.", 403);
  }

  const [person, flags, userLink, personLink, membership] = await Promise.all([
    d1First(env, "SELECT * FROM directory_people WHERE id = ?1 AND active = 1", invitation.intendedPersonId),
    d1First(
      env,
      "SELECT is_child FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2 AND active = 1 ORDER BY updated_at DESC LIMIT 1",
      invitation.parishId,
      invitation.intendedPersonId
    ),
    d1First(env, "SELECT person_id FROM directory_person_links WHERE link_type = 'platform_user' AND external_id = ?1 AND active = 1", user.id),
    d1First(env, "SELECT external_id FROM directory_person_links WHERE person_id = ?1 AND link_type = 'platform_user' AND active = 1", invitation.intendedPersonId),
    invitation.intendedHouseholdId
      ? d1First(
          env,
          "SELECT id FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2 AND active = 1",
          invitation.intendedHouseholdId,
          invitation.intendedPersonId
        )
      : null
  ]);
  if (!person) throw new DirectoryServiceError("not_found", "The invited directory person is no longer active.", 404);
  if (Number(flags?.is_child || 0) === 1) {
    throw new DirectoryServiceError("child_invitation_denied", "Children are managed through their household and cannot claim a separate account.", 403);
  }
  if (userLink && userLink.person_id !== invitation.intendedPersonId) {
    throw new DirectoryServiceError("identity_conflict", "This My AGAPAY account is already linked to a different directory person.", 409);
  }
  if (personLink && personLink.external_id !== user.id) {
    throw new DirectoryServiceError("identity_conflict", "This directory person is already linked to another My AGAPAY account.", 409);
  }
  if (invitation.intendedHouseholdId && !membership) {
    throw new DirectoryServiceError("household_conflict", "The invited person is no longer a member of this household.", 409);
  }

  const linksPerson = ["link_person", "link_and_grant_household_admin"].includes(invitation.intendedAuthority);
  const grantsHouseholdAdmin = ["grant_household_admin", "link_and_grant_household_admin"].includes(invitation.intendedAuthority);
  if (!linksPerson && !userLink) {
    throw new DirectoryServiceError("identity_conflict", "This invitation requires an existing person-account link.", 409);
  }

  const timestamp = nowMs();
  const claimId = generateSecret("dclaim");
  const actor = {
    userId: user.id,
    actorType: "platform_user",
    parishId: invitation.parishId,
    personId: invitation.intendedPersonId,
    capabilities: ["directory.self.manage"]
  };
  const statements = [
    buildAcceptInvitationStatement({ invitationId: invitation.id, currentStatus: invitation.status }),
    {
      sql: `INSERT INTO directory_claims (
              id, parish_id, invitation_id, claimant_user_id, requested_person_id,
              requested_household_id, requested_authority, claim_method, status,
              submitted_at, reviewed_at, reviewed_by_user_id, decision_reason_code,
              completed_at, correlation_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'exact_invitation', 'completed', ?, ?, ?, 'exact_invitation_email_match', ?, ?, ?, ?)`,
      params: [
        claimId,
        invitation.parishId,
        invitation.id,
        user.id,
        invitation.intendedPersonId,
        invitation.intendedHouseholdId || null,
        invitation.intendedAuthority,
        timestamp,
        timestamp,
        user.id,
        timestamp,
        correlationId || null,
        timestamp,
        timestamp
      ]
    }
  ];
  if (linksPerson && !personLink) {
    statements.push({
      sql: `INSERT INTO directory_person_links
              (id, person_id, link_type, external_id, active, source, claim_id, created_at, updated_at)
            VALUES (?, ?, 'platform_user', ?, 1, 'directory_claim', ?, ?, ?)`,
      params: [generateSecret("dir_link"), invitation.intendedPersonId, user.id, claimId, timestamp, timestamp]
    });
  }
  if (grantsHouseholdAdmin) {
    statements.push({
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)
            ON CONFLICT(household_id, person_id) DO UPDATE SET
              active = 1, end_date = NULL, updated_at = excluded.updated_at`,
      params: [generateSecret("dir_ha"), invitation.intendedHouseholdId, invitation.intendedPersonId, timestamp, timestamp]
    });
  }
  statements.push(
    buildCompleteInvitationStatement({ invitationId: invitation.id }),
    auditStatement({
      action: "directory.claim.completed",
      actor,
      parishId: invitation.parishId,
      targetType: "directory_person",
      targetId: invitation.intendedPersonId,
      householdId: invitation.intendedHouseholdId || null,
      metadata: { invitationId: invitation.id, authority: invitation.intendedAuthority },
      correlationId
    })
  );
  await runAtomic(env, statements);
  return {
    claimed: true,
    personId: invitation.intendedPersonId,
    personName: person.preferred_name,
    householdId: invitation.intendedHouseholdId || "",
    invitationId: invitation.id
  };
}
