// AGAPAY Accounting Package 0.75C -- Platform Identity & Parish Membership routes.
//
// Backend-only surface: login, session lookup, logout for platform users,
// and the invitation create/accept lifecycle. No HTML/UI is added anywhere
// in this package -- per this package's explicit scope, invitations get a
// data model and a reusable backend, not a screen.
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
  normalizeEmail,
  rateLimit
} from "../lib/core.js";
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
import { findRegistrationByParishId, verifyParishDashboardBearer } from "./parish.js";

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
  if (!email || !password) return json({ error: "Email and password are required." }, { status: 400 });

  const user = await verifyPlatformUserPassword(env, email, password);
  if (!user) return json({ error: "Invalid email or password." }, { status: 401 });

  const session = await issuePlatformUserSession(env, user.id);
  if (!session) return json({ error: "Unable to start a session." }, { status: 500 });

  return json({ token: session.token, expiresAt: session.expiresAt, user: publicPlatformUser(user) });
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

  const session = await issuePlatformUserSession(env, result.userId);
  return json({
    ok: true,
    token: session?.token || "",
    expiresAt: session?.expiresAt || "",
    parishId: result.parishId,
    membershipId: result.membershipId
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
