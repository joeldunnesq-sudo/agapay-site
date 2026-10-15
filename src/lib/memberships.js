// Generated from src/lib/memberships.ts by npm run build:server. Do not edit.
import { d1, d1First, d1All, d1Run, generateSecret, hashSessionToken, secureCompare, normalizeEmail } from './core.js';
import { recordAuditEvent } from './audit-log.js';
import { ensurePlatformUser, setPlatformUserPassword, findPlatformUserById } from './identity.js';
import { expandRoleTemplate, sanitizeGrantableCapabilities, resolveAuthorizationContext } from './authorization.js';
const INVITATION_TTL_MS = 1e3 * 60 * 60 * 24 * 14;
function nowIso() {
  return /* @__PURE__ */ new Date().toISOString();
}
function isSubset(requested, granted) {
  const grantedSet = new Set(granted);
  return requested.every((capability) => grantedSet.has(capability));
}
async function assertNotSelfTargeting(env, { actorUserId, membershipUserId, request, action }) {
  if (!actorUserId || actorUserId !== membershipUserId) return true;
  await recordAuditEvent(env, request, {
    action: 'membership.self_escalation_denied',
    actorUserId,
    actorType: 'platform_user',
    targetType: 'parish_membership',
    metadata: { attemptedAction: action },
  });
  return false;
}
function rowToMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    parishId: row.parish_id,
    roleTemplate: row.role_template || '',
    status: row.status,
    invitedByUserId: row.invited_by_user_id || '',
    invitedAt: row.invited_at || '',
    acceptedAt: row.accepted_at || '',
    joinedAt: row.joined_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function rowToInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    parishId: row.parish_id,
    email: row.email,
    roleTemplate: row.role_template || '',
    invitedCapabilities: safeParseArray(row.invited_capabilities),
    invitedByUserId: row.invited_by_user_id || '',
    invitedByLegacyBearer: Boolean(row.invited_by_legacy_bearer),
    status: row.status,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at || '',
    acceptedByUserId: row.accepted_by_user_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function safeParseArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function getMembership(env, { userId, parishId }) {
  if (!d1(env) || !userId || !parishId) return null;
  const row = await d1First(
    env,
    'SELECT * FROM parish_memberships WHERE user_id = ?1 AND parish_id = ?2',
    userId,
    parishId
  );
  return rowToMembership(row);
}
async function listMembershipsForUser(env, userId) {
  if (!d1(env) || !userId) return [];
  const rows = await d1All(env, 'SELECT * FROM parish_memberships WHERE user_id = ?1 ORDER BY created_at ASC', userId);
  return rows.map(rowToMembership);
}
async function listMembershipsForParish(env, parishId) {
  if (!d1(env) || !parishId) return [];
  const rows = await d1All(
    env,
    `SELECT membership.*, users.email AS user_email, users.display_name AS user_display_name
       FROM parish_memberships membership
       LEFT JOIN platform_users users ON users.id = membership.user_id
      WHERE membership.parish_id = ?1
      ORDER BY membership.created_at ASC`,
    parishId
  );
  return rows.map((row) => ({
    ...rowToMembership(row),
    email: row.user_email || '',
    displayName: row.user_display_name || '',
  }));
}
async function createOrReactivateMembership(env, { userId, parishId, roleTemplate, invitedByUserId }) {
  const existing = await getMembership(env, { userId, parishId });
  const timestamp = nowIso();
  if (existing) {
    await d1Run(
      env,
      `UPDATE parish_memberships
       SET status = 'active', role_template = ?3, accepted_at = ?4,
           joined_at = COALESCE(joined_at, ?4), updated_at = ?4
       WHERE id = ?1 AND user_id = ?2`,
      existing.id,
      userId,
      roleTemplate || existing.roleTemplate || '',
      timestamp
    );
    return existing.id;
  }
  const id = generateSecret('member');
  await d1Run(
    env,
    `INSERT INTO parish_memberships
       (id, user_id, parish_id, role_template, status, invited_by_user_id, invited_at, accepted_at, joined_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?6, ?6, ?6, ?6)`,
    id,
    userId,
    parishId,
    roleTemplate || '',
    invitedByUserId || null,
    timestamp
  );
  return id;
}
async function grantCapability(env, { membershipId, capability, grantedByUserId, request = null }) {
  if (!d1(env) || !membershipId || !capability) return false;
  const target = await d1First(env, 'SELECT user_id FROM parish_memberships WHERE id = ?1', membershipId);
  if (!target) return false;
  const allowed = await assertNotSelfTargeting(env, {
    actorUserId: grantedByUserId,
    membershipUserId: target.user_id,
    request,
    action: 'grant_capability',
  });
  if (!allowed) return false;
  const id = generateSecret('cap');
  await d1Run(
    env,
    `INSERT OR IGNORE INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
    id,
    membershipId,
    capability,
    grantedByUserId || null,
    nowIso()
  );
  await recordAuditEvent(env, request, {
    action: 'membership.capability_granted',
    actorUserId: grantedByUserId || 'system',
    actorType: grantedByUserId ? 'platform_user' : 'system',
    targetType: 'parish_membership',
    targetId: membershipId,
    after: { capability },
  });
  return true;
}
async function revokeCapability(env, { membershipId, capability, revokedByUserId, request = null }) {
  if (!d1(env) || !membershipId || !capability) return false;
  const target = await d1First(env, 'SELECT user_id FROM parish_memberships WHERE id = ?1', membershipId);
  if (!target) return false;
  const allowed = await assertNotSelfTargeting(env, {
    actorUserId: revokedByUserId,
    membershipUserId: target.user_id,
    request,
    action: 'revoke_capability',
  });
  if (!allowed) return false;
  await d1Run(
    env,
    `DELETE FROM membership_capabilities WHERE membership_id = ?1 AND capability = ?2`,
    membershipId,
    capability
  );
  await recordAuditEvent(env, request, {
    action: 'membership.capability_revoked',
    actorUserId: revokedByUserId || 'system',
    actorType: revokedByUserId ? 'platform_user' : 'system',
    targetType: 'parish_membership',
    targetId: membershipId,
    before: { capability },
  });
  return true;
}
async function listCapabilitiesForMembership(env, membershipId) {
  if (!d1(env) || !membershipId) return [];
  const rows = await d1All(
    env,
    'SELECT capability FROM membership_capabilities WHERE membership_id = ?1',
    membershipId
  );
  return rows.map((row) => row.capability);
}
async function setMembershipStatus(env, { membershipId, status, actorUserId, reason = '', request = null }) {
  if (!d1(env) || !membershipId || !status) return false;
  const before = await d1First(env, 'SELECT * FROM parish_memberships WHERE id = ?1', membershipId);
  if (!before) return false;
  const allowed = await assertNotSelfTargeting(env, {
    actorUserId,
    membershipUserId: before.user_id,
    request,
    action: `status_change_to_${status}`,
  });
  if (!allowed) return false;
  await d1Run(
    env,
    `UPDATE parish_memberships SET status = ?2, updated_at = ?3 WHERE id = ?1`,
    membershipId,
    status,
    nowIso()
  );
  await recordAuditEvent(env, request, {
    action: 'membership.status_changed',
    actorUserId: actorUserId || 'system',
    actorType: actorUserId ? 'platform_user' : 'system',
    targetType: 'parish_membership',
    targetId: membershipId,
    organizationId: before.parish_id,
    reason,
    before: { status: before.status },
    after: { status },
  });
  return true;
}
async function createInvitation(
  env,
  {
    parishId,
    email,
    roleTemplate = '',
    capabilities = [],
    invitedByUserId = null,
    invitedByLegacyBearer = false,
    request = null,
  } = {}
) {
  if (!d1(env) || !parishId || !email)
    return { ok: false, code: 'invalid_input', error: 'Parish and email are required.' };
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { ok: false, code: 'invalid_input', error: 'A valid email is required.' };
  if (invitedByUserId) {
    const granter = await findPlatformUserById(env, invitedByUserId);
    if (granter && normalizeEmail(granter.email) === normalizedEmail) {
      await recordAuditEvent(env, request, {
        action: 'membership.self_escalation_denied',
        actorUserId: invitedByUserId,
        actorType: 'platform_user',
        organizationId: parishId,
        metadata: { attemptedAction: 'self_invite', email: normalizedEmail },
      });
      return { ok: false, code: 'self_invitation', error: 'You cannot invite your own email address.' };
    }
  }
  const requestedCapabilities = sanitizeGrantableCapabilities(
    Array.isArray(capabilities) && capabilities.length ? capabilities : expandRoleTemplate(roleTemplate)
  );
  if (invitedByUserId && !invitedByLegacyBearer) {
    const { membership: granterMembership, capabilities: granterCapabilities } = await resolveAuthorizationContext(
      env,
      {
        userId: invitedByUserId,
        parishId,
      }
    );
    if (!granterMembership) {
      return { ok: false, code: 'not_authorized', error: 'You do not have an active membership at this parish.' };
    }
    const mayAssignAnyCapability = granterCapabilities.includes('parish.roles.assign');
    if (!mayAssignAnyCapability && !isSubset(requestedCapabilities, granterCapabilities)) {
      await recordAuditEvent(env, request, {
        action: 'membership.capability_escalation_denied',
        actorUserId: invitedByUserId,
        actorType: 'platform_user',
        organizationId: parishId,
        metadata: {
          attemptedCapabilities: requestedCapabilities,
          granterCapabilities,
        },
      });
      return {
        ok: false,
        code: 'capability_escalation',
        error: 'You cannot grant a capability you do not hold yourself, unless you hold parish.roles.assign.',
      };
    }
  }
  const id = generateSecret('invite');
  const token = generateSecret('invitetok');
  const salt = generateSecret('invite_salt');
  const tokenHash = await hashSessionToken(token, salt);
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  await d1Run(
    env,
    `INSERT INTO membership_invitations
       (id, parish_id, email, role_template, invited_capabilities, invited_by_user_id,
        invited_by_legacy_bearer, token_hash, token_salt, status, expires_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11, ?11)`,
    id,
    parishId,
    normalizedEmail,
    roleTemplate,
    JSON.stringify(requestedCapabilities),
    invitedByUserId,
    invitedByLegacyBearer ? 1 : 0,
    tokenHash,
    salt,
    expiresAt,
    timestamp
  );
  await recordAuditEvent(env, request, {
    action: 'membership.invitation_created',
    actorUserId: invitedByUserId || (invitedByLegacyBearer ? 'legacy-parish-bearer' : 'system'),
    actorType: invitedByUserId ? 'platform_user' : invitedByLegacyBearer ? 'parish' : 'system',
    targetType: 'membership_invitation',
    targetId: id,
    organizationId: parishId,
    after: { email: normalizedEmail, roleTemplate },
  });
  return { ok: true, id, token, expiresAt };
}
async function findValidInvitationByToken(env, token) {
  if (!d1(env) || !token) return null;
  const nowMs = Date.now();
  const rows = await d1All(
    env,
    "SELECT * FROM membership_invitations WHERE status = 'pending' AND expires_at > ?1",
    new Date(nowMs).toISOString()
  );
  for (const row of rows) {
    const submitted = await hashSessionToken(token, row.token_salt || '');
    if (secureCompare(submitted, row.token_hash || '')) return row;
  }
  return null;
}
async function acceptInvitation(env, { token, password, displayName = '', request = null } = {}) {
  if (!d1(env) || !token || !password) return { ok: false, error: 'Missing token or password.' };
  const invitation = await findValidInvitationByToken(env, token);
  if (!invitation) return { ok: false, error: 'Invitation not found, expired, or already used.' };
  const user = await ensurePlatformUser(env, { email: invitation.email, displayName });
  if (!user) return { ok: false, error: 'Unable to create platform user.' };
  await setPlatformUserPassword(env, user.id, password);
  const membershipId = await createOrReactivateMembership(env, {
    userId: user.id,
    parishId: invitation.parish_id,
    roleTemplate: invitation.role_template,
    invitedByUserId: invitation.invited_by_user_id,
  });
  const capabilities = safeParseArray(invitation.invited_capabilities);
  for (const capability of capabilities) {
    await grantCapability(env, { membershipId, capability, grantedByUserId: invitation.invited_by_user_id, request });
  }
  const timestamp = nowIso();
  await d1Run(
    env,
    `UPDATE membership_invitations SET status = 'accepted', accepted_at = ?2, accepted_by_user_id = ?3, updated_at = ?2 WHERE id = ?1`,
    invitation.id,
    timestamp,
    user.id
  );
  await recordAuditEvent(env, request, {
    action: 'membership.invitation_accepted',
    actorUserId: user.id,
    actorType: 'platform_user',
    targetType: 'parish_membership',
    targetId: membershipId,
    organizationId: invitation.parish_id,
    after: { email: invitation.email, roleTemplate: invitation.role_template },
  });
  return {
    ok: true,
    userId: user.id,
    membershipId,
    parishId: invitation.parish_id,
    email: invitation.email,
    roleTemplate: invitation.role_template,
    acceptedAt: timestamp,
  };
}
async function revokeInvitation(env, { invitationId, actorUserId = null, request = null } = {}) {
  if (!d1(env) || !invitationId) return false;
  await d1Run(
    env,
    `UPDATE membership_invitations SET status = 'revoked', updated_at = ?2 WHERE id = ?1`,
    invitationId,
    nowIso()
  );
  await recordAuditEvent(env, request, {
    action: 'membership.invitation_revoked',
    actorUserId: actorUserId || 'system',
    actorType: actorUserId ? 'platform_user' : 'system',
    targetType: 'membership_invitation',
    targetId: invitationId,
  });
  return true;
}
async function listInvitationsForParish(env, parishId) {
  if (!d1(env) || !parishId) return [];
  const rows = await d1All(
    env,
    'SELECT * FROM membership_invitations WHERE parish_id = ?1 ORDER BY created_at DESC',
    parishId
  );
  return rows.map(rowToInvitation);
}
export {
  acceptInvitation,
  createInvitation,
  findPlatformUserById,
  getMembership,
  grantCapability,
  listCapabilitiesForMembership,
  listInvitationsForParish,
  listMembershipsForParish,
  listMembershipsForUser,
  revokeCapability,
  revokeInvitation,
  setMembershipStatus,
};
