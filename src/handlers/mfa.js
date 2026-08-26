import {
  getBearerToken,
  issueAdminSession,
  issueParishDashboardSession,
  json,
  markAdminSessionMfaVerified,
  markParishDashboardSessionMfaVerified,
  privilegedMfaRequired,
  rateLimit,
  resolveAdminSession,
  resolveParishDashboardSession,
  unauthorized,
} from "../lib/core.js";
import {
  beginMfaAuthentication,
  beginMfaEnrollment,
  freshMfaAt,
  loadMfaTransaction,
  mfaStatus,
  verifyMfaAuthentication,
  verifyMfaEnrollment,
} from "../lib/mfa.js";
import {
  issuePlatformUserSession,
  markPlatformUserSessionMfaVerified,
  requirePlatformUser,
} from "../lib/identity.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import { findRegistrationByParishId, saveRegistrationRecord } from "./parish.js";

function mfaError(error, status = 400) {
  return json({ error: String(error?.message || error || "MFA request failed."), code: "mfa_error" }, { status });
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function finalizeMfa(env, request, result) {
  const { transaction, verifiedAt, recoveryCodes = [] } = result;
  const metadata = transaction.metadata || {};
  let payload = { ok: true, mfaVerifiedAt: verifiedAt, recoveryCodes };

  if (transaction.purpose === "step_up") {
    if (transaction.principal_type === "platform_admin") {
      if (!(await markAdminSessionMfaVerified(env, metadata.sessionId, verifiedAt))) throw new Error("Admin session expired during verification.");
    } else if (transaction.principal_type === "parish_admin") {
      const found = await findRegistrationByParishId(env, transaction.principal_id);
      if (!found) throw new Error("Parish session expired during verification.");
      const marked = markParishDashboardSessionMfaVerified(found.registration, metadata.sessionId, verifiedAt);
      if (!marked.changed) throw new Error("Parish session expired during verification.");
      await saveRegistrationRecord(env, found.key, marked.registration, found.registration);
    } else if (transaction.principal_type === "platform_user") {
      if (!(await markPlatformUserSessionMfaVerified(env, transaction.principal_id, verifiedAt))) throw new Error("Staff session expired during verification.");
    }
  } else if (transaction.principal_type === "platform_admin") {
    payload = {
      ...payload,
      ...(await issueAdminSession(env, metadata.actor || "Admin", { mfaVerifiedAt: verifiedAt })),
    };
  } else if (transaction.principal_type === "parish_admin") {
    const found = await findRegistrationByParishId(env, transaction.principal_id);
    if (!found) throw new Error("Parish dashboard record not found.");
    const session = await issueParishDashboardSession(found.registration, { mfaVerifiedAt: verifiedAt });
    await saveRegistrationRecord(env, found.key, session.registration, found.registration);
    payload = {
      ...payload,
      token: session.token,
      expiresAt: session.expiresAt,
      parishId: transaction.principal_id,
      parish: metadata.parish || null,
    };
  } else if (transaction.principal_type === "platform_user") {
    const identity = await issuePlatformUserSession(env, transaction.principal_id, { mfaVerifiedAt: verifiedAt });
    payload = { ...payload, token: identity?.token || "", expiresAt: identity?.expiresAt || "", identityEmail: metadata.identityEmail || "" };
    if (metadata.parishId) {
      const found = await findRegistrationByParishId(env, metadata.parishId);
      if (found) {
        const parishSession = await issueParishDashboardSession(found.registration, { mfaVerifiedAt: verifiedAt });
        await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
        payload = {
          ...payload,
          parishId: metadata.parishId,
          parishToken: parishSession.token,
          parishTokenExpiresAt: parishSession.expiresAt,
          membershipId: metadata.membershipId || "",
        };
      }
    }
  }

  await recordAuditEvent(env, request, {
    action: transaction.purpose === "step_up" ? "mfa.step_up_succeeded" : "mfa.authentication_succeeded",
    actorUserId: transaction.principal_id,
    actorType: transaction.principal_type === "platform_admin" ? "admin" : transaction.principal_type === "parish_admin" ? "parish" : "platform_user",
    targetType: "mfa_profile",
    targetId: `${transaction.principal_type}:${transaction.principal_id}`,
    organizationId: transaction.principal_type === "parish_admin" ? transaction.principal_id : metadata.parishId || null,
    metadata: { purpose: transaction.purpose, recoveryCodesIssued: recoveryCodes.length },
  });

  return payload;
}

export async function handleMfaEnrollmentOptions(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "mfa-enrollment-options", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  try {
    const result = await beginMfaEnrollment(env, request, body.pendingToken, {
      method: body.method,
      displayName: String(body.displayName || "AGAPAY administrator").slice(0, 160),
      credentialLabel: String(body.credentialLabel || "Passkey").slice(0, 80),
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return mfaError(error);
  }
}

export async function handleMfaEnrollmentVerify(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "mfa-enrollment-verify", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  try {
    const result = await verifyMfaEnrollment(env, request, body.pendingToken, body);
    return json(await finalizeMfa(env, request, result));
  } catch (error) {
    return mfaError(error);
  }
}

export async function handleMfaVerify(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "mfa-verify", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  try {
    const result = await verifyMfaAuthentication(env, request, body.pendingToken, body);
    return json(await finalizeMfa(env, request, result));
  } catch (error) {
    return mfaError(error);
  }
}

async function rawStepUpContext(request, env, principalType, principalId) {
  const token = getBearerToken(request);
  if (!token) return null;
  if (principalType === "platform_admin") {
    const session = await resolveAdminSession(env, token);
    return session && principalId === "platform" ? { sessionId: session.id, actor: session.actor, mfaVerifiedAt: session.mfaVerifiedAt } : null;
  }
  if (principalType === "parish_admin") {
    const found = await findRegistrationByParishId(env, principalId);
    if (!found) return null;
    const session = await resolveParishDashboardSession(found.registration, token);
    return session ? { sessionId: session.id, mfaVerifiedAt: session.mfaVerifiedAt } : null;
  }
  if (principalType === "platform_user") {
    const user = await requirePlatformUser(request, env);
    return user?.id === principalId ? { sessionId: user.id, mfaVerifiedAt: user.mfaVerifiedAt } : null;
  }
  return null;
}

export async function handleMfaStepUp(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "mfa-step-up", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  const principalType = String(body.principalType || "");
  const principalId = String(body.principalId || "");
  const context = await rawStepUpContext(request, env, principalType, principalId);
  if (!context) return unauthorized();
  try {
    const flow = await beginMfaAuthentication(env, request, {
      principalType,
      principalId,
      purpose: "step_up",
      metadata: { sessionId: context.sessionId, actor: context.actor || "" },
    });
    return json({ ok: true, ...flow });
  } catch (error) {
    return mfaError(error);
  }
}

export async function handleMfaStatus(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  const principalType = String(body.principalType || "");
  const principalId = String(body.principalId || "");
  if (!(await rawStepUpContext(request, env, principalType, principalId))) return unauthorized();
  return json({ ok: true, status: await mfaStatus(env, principalType, principalId) });
}

function stepUpRequired(principalType, principalId) {
  return json({
    error: "Confirm your identity to continue.",
    code: "mfa_step_up_required",
    principalType,
    principalId,
  }, { status: 428 });
}

function mfaReloginRequired() {
  return json({
    error: "Multi-factor authentication is required. Please sign in again.",
    code: "mfa_relogin_required",
  }, { status: 401 });
}

export async function enforcePrivilegedMfa(request, env, url) {
  if (!privilegedMfaRequired(env)) return null;
  const path = url.pathname;
  if (path.startsWith("/api/mfa/") || path === "/api/admin/session" || /\/api\/parish\/dashboard\/[^/]+\/session$/.test(path)) return null;
  const token = getBearerToken(request);
  if (!token) return null;

  if (path.startsWith("/api/admin/")) {
    const session = await resolveAdminSession(env, token);
    if (!session) return null;
    if (!session.mfaVerifiedAt) return mfaReloginRequired();
    if (request.method !== "GET" && !freshMfaAt(session.mfaVerifiedAt)) return stepUpRequired("platform_admin", "platform");
    return null;
  }

  const parishMatch = path.match(/^\/api\/parish\/dashboard\/([^/]+)/);
  if (parishMatch) {
    const parishId = decodeURIComponent(parishMatch[1]);
    const found = await findRegistrationByParishId(env, parishId);
    if (!found) return null;
    const session = await resolveParishDashboardSession(found.registration, token);
    if (!session) return null;
    if (!session.mfaVerifiedAt) return mfaReloginRequired();
    const sensitiveRead = /\/(?:tax-exemption|nonprofit-pricing)\/document|\/giving-statements\//.test(path);
    if ((request.method !== "GET" || sensitiveRead) && !freshMfaAt(session.mfaVerifiedAt)) {
      return stepUpRequired("parish_admin", parishId);
    }
  }
  return null;
}

export async function beginRequiredMfaLogin(env, request, principalType, principalId, metadata = {}, purpose = "login") {
  return beginMfaAuthentication(env, request, { principalType, principalId, purpose, metadata });
}

export async function beginInvitationMfa(env, request, userId, metadata = {}) {
  return beginMfaAuthentication(env, request, {
    principalType: "platform_user",
    principalId: userId,
    purpose: "invitation",
    metadata,
  });
}
