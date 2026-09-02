// AGAPAY Accounting Package 0.75C -- Platform Identity & Parish Membership routes.
//
// Login, session lookup, logout for platform users, and the invitation
// create/accept lifecycle. A named staff login may also request a parish
// dashboard session after its active membership has been verified.
//
// These routes are entirely new and additive. Nothing here modifies or is
// called by any existing route -- the legacy parish-dashboard bearer flow
// (verifyParishDashboardBearer) and every existing dashboard feature are
// completely untouched by this file.

import {
  d1,
  json,
  unauthorized,
  missingProductionStoreResponse,
  hasProductionStore,
  getBearerToken,
  issueParishDashboardSession,
  normalizeEmail,
  privilegedMfaRequired,
  rateLimit
} from "../lib/core.js";
import { beginMfaAuthentication } from "../lib/mfa.js";
import {
  requirePlatformUser,
  verifyPlatformUserPassword,
  issuePlatformUserSession,
  revokePlatformUserSession,
  publicPlatformUser,
  PLATFORM_USER_EMAIL_HEADER
} from "../lib/identity.js";
import {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitationsForParish,
  listMembershipsForUser,
  listMembershipsForParish
} from "../lib/memberships.js";
import { CAPABILITY_CATALOG, ROLE_TEMPLATES, requireCapability, requireActiveMembership, sanitizeGrantableCapabilities } from "../lib/authorization.js";
import { findRegistrationByParishId, saveRegistrationRecord, verifyParishDashboardBearer } from "./parish.js";
import { recommendedOnboardingState } from "../lib/parish-onboarding.js";

export { PLATFORM_USER_EMAIL_HEADER };

// POST /api/identity/login  { email, password }
export async function handleIdentityLogin(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "identity-login", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const parishId = String(body.parishId || "").trim();
  if (!email || !password) return json({ error: "Email and password are required." }, { status: 400 });

  const user = await verifyPlatformUserPassword(env, email, password);
  if (!user) return json({ error: "Invalid email or password." }, { status: 401 });
  const memberships = parishId ? await listMembershipsForUser(env, user.id) : [];
  const membership = parishId
    ? memberships.find((row) => row.parishId === parishId && row.status === "active")
    : null;
  if (parishId && !membership) return json({ error: "This staff account does not have active access to that parish." }, { status: 403 });

  if (privilegedMfaRequired(env)) {
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: "platform_user",
        principalId: user.id,
        purpose: "login",
        metadata: { identityEmail: email, parishId, membershipId: membership?.id || "" },
      })),
    });
  }

  const session = await issuePlatformUserSession(env, user.id);
  if (!session) return json({ error: "Unable to start a session." }, { status: 500 });
  let parishSession = null;
  if (parishId) {
    const found = await findRegistrationByParishId(env, parishId);
    if (!found) return json({ error: "Parish dashboard record not found." }, { status: 404 });
    parishSession = await issueParishDashboardSession(found.registration);
    await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
  }

  return json({
    token: session.token,
    expiresAt: session.expiresAt,
    identityEmail: email,
    user: publicPlatformUser(user),
    parishId,
    membershipId: membership?.id || "",
    parishToken: parishSession?.token || "",
    parishTokenExpiresAt: parishSession?.expiresAt || ""
  });
}

// GET /api/identity/session -- "whoami" for a platform-user session.
export async function handleIdentitySession(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const user = await requirePlatformUser(request, env);
  if (!user) return unauthorized();

  const memberships = await listMembershipsForUser(env, user.id);
  return json({ user, memberships });
}

// POST /api/identity/logout
export async function handleIdentityLogout(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const user = await requirePlatformUser(request, env);
  if (!user) return unauthorized();

  await revokePlatformUserSession(env, user.id);
  return json({ ok: true });
}

// POST /api/identity/invitations/:token/accept  { password, displayName }
export async function handleIdentityInvitationAccept(request, env, token) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "identity-invitation-accept", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

  const password = String(body.password || "");
  if (!password || password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const result = await acceptInvitation(env, {
    token,
    password,
    displayName: String(body.displayName || "").trim(),
    request
  });
  if (!result.ok) return json({ error: result.error || "Unable to accept invitation." }, { status: 400 });

  if (privilegedMfaRequired(env)) {
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: "platform_user",
        principalId: result.userId,
        purpose: "invitation",
        metadata: {
          identityEmail: result.email,
          parishId: result.parishId,
          membershipId: result.membershipId,
        },
      })),
    });
  }

  const session = await issuePlatformUserSession(env, result.userId);
  let parishSession = null;
  const found = await findRegistrationByParishId(env, result.parishId);
  if (found) {
    const currentAccess = found.registration.onboardingAccess && typeof found.registration.onboardingAccess === "object"
      ? found.registration.onboardingAccess
      : {};
    const acceptedAccess = { ...currentAccess };
    for (const key of ["priest", "treasurer"]) {
      if (normalizeEmail(acceptedAccess[key]?.email) === normalizeEmail(result.email)) {
        acceptedAccess[key] = {
          ...acceptedAccess[key],
          status: "accepted",
          acceptedAt: result.acceptedAt,
          membershipId: result.membershipId
        };
      }
    }
    let registration = {
      ...found.registration,
      onboardingAccess: acceptedAccess,
      parishUpdatedAt: result.acceptedAt
    };
    registration.onboardingState = recommendedOnboardingState(registration, registration.onboardingChecks);
    parishSession = await issueParishDashboardSession(registration);
    await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
  }
  return json({
    ok: true,
    token: session?.token || "",
    expiresAt: session?.expiresAt || "",
    identityEmail: result.email,
    parishId: result.parishId,
    membershipId: result.membershipId,
    parishToken: parishSession?.token || "",
    parishTokenExpiresAt: parishSession?.expiresAt || ""
  });
}

// Shared gate for the parish-membership management routes below: allows
// EITHER the legacy shared parish-dashboard bearer token (the bootstrapping
// path -- a parish's existing dashboard access can invite its first
// platform users) OR an active membership holding the specific
// parish-administration capability the route requires (`parish.members.
// invite`, `parish.members.remove`, or `parish.manage` -- never a role-name
// check). This is identity/membership plumbing, not an accounting route,
// so the legacy bearer is explicitly permitted here per docs/accounting/02d
// ("Yes, temporarily, for existing non-accounting parish-dashboard
// features") -- it is never permitted for any future accounting-domain
// route, which must use requireCapability exclusively (Package 0.75D
// "Route Hardening").
async function requireMembershipManagementContext(request, env, parishId, capability) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { ok: false, response: json({ error: "Parish dashboard record not found" }, { status: 404 }) };

  const legacyToken = getBearerToken(request);
  if (legacyToken && await verifyParishDashboardBearer(found.registration, legacyToken)) {
    return { ok: true, actorUserId: null, invitedByLegacyBearer: true };
  }

  const ctx = await requireCapability(request, env, parishId, capability);
  if (ctx) return { ok: true, actorUserId: ctx.user.id, invitedByLegacyBearer: false };

  return { ok: false, response: unauthorized() };
}

// POST /api/parish/dashboard/:parishId/memberships/invitations
// { email, roleTemplate, capabilities? }
export async function handleMembershipInvitationCreate(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;

  const gate = await requireMembershipManagementContext(request, env, parishId, "parish.members.invite");
  if (!gate.ok) return gate.response;

  let body = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, { status: 400 }); }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "A valid email is required." }, { status: 400 });

  const roleTemplate = String(body.roleTemplate || "").trim();
  // Deny-by-default: sanitizeGrantableCapabilities is the single, centralized
  // filter (unknown + platform-only capabilities stripped) -- createInvitation
  // applies it again server-side regardless, but filtering here too means an
  // invalid capability never even reaches the escalation-bounding check below
  // as something worth comparing against.
  const explicitCapabilities = sanitizeGrantableCapabilities(Array.isArray(body.capabilities) ? body.capabilities : []);

  const invitation = await createInvitation(env, {
    parishId,
    email,
    roleTemplate,
    // createInvitation expands the role template into capabilities itself
    // when this is empty -- only pass an explicit list through here.
    capabilities: explicitCapabilities,
    invitedByUserId: gate.actorUserId,
    invitedByLegacyBearer: gate.invitedByLegacyBearer,
    request
  });
  if (!invitation.ok) {
    // A self-invitation or a capability-escalation attempt is a 403
    // (the caller is authenticated and otherwise permitted to invite, just
    // not to grant *this*); anything else is a plain validation failure.
    const status = (invitation.code === "self_invitation" || invitation.code === "capability_escalation" || invitation.code === "not_authorized")
      ? 403
      : 400;
    return json({ error: invitation.error || "Unable to create invitation." }, { status });
  }

  // The invitation token is returned directly rather than emailed, since
  // this package builds the backend framework only -- delivery (email) and
  // any accept-invitation UI are explicitly out of scope here.
  return json({ ok: true, invitationId: invitation.id, token: invitation.token, expiresAt: invitation.expiresAt });
}

// GET /api/parish/dashboard/:parishId/memberships
export async function handleMembershipList(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const gate = await requireMembershipManagementContext(request, env, parishId, "parish.manage");
  if (!gate.ok) return gate.response;

  const [memberships, invitations] = await Promise.all([
    listMembershipsForParish(env, parishId),
    listInvitationsForParish(env, parishId)
  ]);
  return json({ memberships, invitations });
}

// DELETE /api/parish/dashboard/:parishId/memberships/invitations/:invitationId
export async function handleMembershipInvitationRevoke(request, env, parishId, invitationId) {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const gate = await requireMembershipManagementContext(request, env, parishId, "parish.members.remove");
  if (!gate.ok) return gate.response;

  await revokeInvitation(env, { invitationId, actorUserId: gate.actorUserId, request });
  return json({ ok: true });
}

// GET /api/identity/capabilities -- static catalog, useful for any future
// UI to populate a role/capability picker without hardcoding the list.
export async function handleIdentityCapabilityCatalog(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return json({ capabilities: CAPABILITY_CATALOG, roleTemplates: ROLE_TEMPLATES });
}

export { requireActiveMembership };
