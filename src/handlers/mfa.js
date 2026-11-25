// Generated from src/handlers/mfa.ts by npm run build:server. Do not edit.
import {
  d1First,
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
} from '../lib/core.js';
import {
  beginAdminMfaManagement,
  beginMfaAuthentication,
  beginMfaEnrollment,
  freshMfaAt,
  mfaStatus,
  verifyMfaAuthentication,
  verifyMfaEnrollment,
} from '../lib/mfa.js';
import { issuePlatformUserSession, markPlatformUserSessionMfaVerified, requirePlatformUser } from '../lib/identity.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { mfaErrorDetails } from '../lib/mfa-diagnostics.js';
import { findRegistrationByParishId, saveRegistrationRecord } from './parish.js';
function mfaError(error, operation) {
  const { reason, status, message } = mfaErrorDetails(error);
  const reference = crypto.randomUUID();
  console.warn('mfa_request_failed', { operation, reason, status, reference });
  return json({ error: message, code: 'mfa_error', reference }, { status });
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
  const adminManagement = transaction.purpose === 'manage' && transaction.principal_type === 'platform_admin';
  if (adminManagement) {
    payload = { ok: true, status: await mfaStatus(env, 'platform_admin', 'platform') };
  } else if (transaction.purpose === 'step_up' || transaction.purpose === 'manage') {
    if (transaction.principal_type === 'platform_admin') {
      if (!(await markAdminSessionMfaVerified(env, metadata.sessionId, verifiedAt)))
        throw new Error('Admin session expired during verification.');
    } else if (transaction.principal_type === 'parish_admin') {
      const found = await findRegistrationByParishId(env, transaction.principal_id);
      if (!found) throw new Error('Parish session expired during verification.');
      const marked = markParishDashboardSessionMfaVerified(found.registration, metadata.sessionId, verifiedAt);
      if (!marked.changed) throw new Error('Parish session expired during verification.');
      await saveRegistrationRecord(env, found.key, marked.registration, found.registration);
    } else if (transaction.principal_type === 'platform_user') {
      if (!(await markPlatformUserSessionMfaVerified(env, transaction.principal_id, verifiedAt)))
        throw new Error('Staff session expired during verification.');
    }
  } else if (transaction.principal_type === 'platform_admin') {
    payload = {
      ...payload,
      ...(await issueAdminSession(env, metadata.actor || 'Admin', { mfaVerifiedAt: verifiedAt })),
    };
  } else if (transaction.principal_type === 'parish_admin') {
    const found = await findRegistrationByParishId(env, transaction.principal_id);
    if (!found) throw new Error('Parish dashboard record not found.');
    const session = await issueParishDashboardSession(found.registration, { mfaVerifiedAt: verifiedAt });
    await saveRegistrationRecord(env, found.key, session.registration, found.registration);
    payload = {
      ...payload,
      token: session.token,
      expiresAt: session.expiresAt,
      parishId: transaction.principal_id,
      parish: metadata.parish || null,
    };
  } else if (transaction.principal_type === 'platform_user') {
    const identity = await issuePlatformUserSession(env, transaction.principal_id, { mfaVerifiedAt: verifiedAt });
    payload = {
      ...payload,
      token: identity?.token || '',
      expiresAt: identity?.expiresAt || '',
      identityEmail: metadata.identityEmail || '',
    };
    if (metadata.parishId) {
      const found = await findRegistrationByParishId(env, metadata.parishId);
      if (found) {
        const parishSession = await issueParishDashboardSession(found.registration, {
          mfaVerifiedAt: verifiedAt,
          accessType: 'staff',
        });
        await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
        payload = {
          ...payload,
          parishId: metadata.parishId,
          parishToken: parishSession.token,
          parishTokenExpiresAt: parishSession.expiresAt,
          membershipId: metadata.membershipId || '',
        };
      }
    }
  }
  await recordAuditEvent(env, request, {
    action: adminManagement
      ? 'mfa.method_added'
      : transaction.purpose === 'step_up'
        ? 'mfa.step_up_succeeded'
        : 'mfa.authentication_succeeded',
    actorUserId: transaction.principal_id,
    actorType:
      transaction.principal_type === 'platform_admin'
        ? 'admin'
        : transaction.principal_type === 'parish_admin'
          ? 'parish'
          : 'platform_user',
    targetType: 'mfa_profile',
    targetId: `${transaction.principal_type}:${transaction.principal_id}`,
    organizationId:
      transaction.principal_type === 'parish_admin' ? transaction.principal_id : metadata.parishId || null,
    metadata: { purpose: transaction.purpose, recoveryCodesIssued: recoveryCodes.length },
  });
  return payload;
}
async function handleMfaEnrollmentOptions(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-enrollment-options', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const result = await beginMfaEnrollment(env, request, body.pendingToken, {
      adminSessionId: (await rawStepUpContext(request, env, 'platform_admin', 'platform'))?.sessionId,
      method: body.method,
      displayName: String(body.displayName || 'AGAPAY administrator').slice(0, 160),
      credentialLabel: String(body.credentialLabel || 'Passkey').slice(0, 80),
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return mfaError(error, 'enrollment_options');
  }
}
async function handleMfaEnrollmentVerify(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-enrollment-verify', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const result = await verifyMfaEnrollment(env, request, body.pendingToken, {
      ...body,
      adminSessionId: (await rawStepUpContext(request, env, 'platform_admin', 'platform'))?.sessionId,
    });
    return json(await finalizeMfa(env, request, result));
  } catch (error) {
    return mfaError(error, 'enrollment_verify');
  }
}
async function handleMfaVerify(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-verify', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const result = await verifyMfaAuthentication(env, request, body.pendingToken, body);
    return json(await finalizeMfa(env, request, result));
  } catch (error) {
    return mfaError(error, 'authentication_verify');
  }
}
async function rawStepUpContext(request, env, principalType, principalId) {
  const token = getBearerToken(request);
  if (!token) return null;
  if (principalType === 'platform_admin') {
    const session = await resolveAdminSession(env, token);
    return session && principalId === 'platform'
      ? { sessionId: session.id, actor: session.actor, mfaVerifiedAt: session.mfaVerifiedAt }
      : null;
  }
  if (principalType === 'parish_admin') {
    const found = await findRegistrationByParishId(env, principalId);
    if (!found) return null;
    const session = await resolveParishDashboardSession(found.registration, token);
    return session ? { sessionId: session.id, mfaVerifiedAt: session.mfaVerifiedAt } : null;
  }
  if (principalType === 'platform_user') {
    const user = await requirePlatformUser(request, env);
    return user?.id === principalId ? { sessionId: user.id, mfaVerifiedAt: user.mfaVerifiedAt } : null;
  }
  return null;
}
async function handleAdminMfaManagement(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const context = await rawStepUpContext(request, env, 'platform_admin', 'platform');
  if (!context?.sessionId) return unauthorized();
  if (!context.mfaVerifiedAt) return mfaReloginRequired();
  if (!freshMfaAt(context.mfaVerifiedAt)) return stepUpRequired('platform_admin', 'platform');
  const limited = await rateLimit(request, env, 'admin-mfa-management', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const method = (await bodyJson(request))?.method;
  if (method !== 'passkey' && method !== 'totp') return json({ error: 'Choose a sign-in method.' }, { status: 400 });
  try {
    const status = await mfaStatus(env, 'platform_admin', 'platform');
    if (!status.enrolled) return json({ error: 'Set up MFA at sign-in first.' }, { status: 409 });
    if (method === 'totp' && status.totpEnabled)
      return json({ error: 'An authenticator app is already set up.' }, { status: 409 });
    return json(await beginAdminMfaManagement(env, context.sessionId, method));
  } catch (error) {
    return mfaError(error, 'admin_management');
  }
}
async function handleMfaStepUp(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-step-up', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  const principalType = String(body.principalType || '');
  const principalId = String(body.principalId || '');
  const context = await rawStepUpContext(request, env, principalType, principalId);
  if (!context || typeof context.sessionId !== 'string') return unauthorized();
  try {
    const flow = await beginMfaAuthentication(env, request, {
      principalType,
      principalId,
      purpose: 'step_up',
      metadata: { sessionId: context.sessionId, actor: context.actor || '' },
    });
    return json({ ok: true, ...flow });
  } catch (error) {
    return mfaError(error, 'step_up');
  }
}
async function handleMfaStatus(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  const principalType = String(body.principalType || '');
  const principalId = String(body.principalId || '');
  if (!(await rawStepUpContext(request, env, principalType, principalId))) return unauthorized();
  return json({ ok: true, status: await mfaStatus(env, principalType, principalId) });
}
async function handleParishAuthenticatorSetup(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-parish-authenticator', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  const parishId = String(body?.parishId || '');
  const found = parishId && (await findRegistrationByParishId(env, parishId));
  const session = found && (await resolveParishDashboardSession(found.registration, getBearerToken(request)));
  if (!session || session.accessType !== 'primary_parish' || typeof session.id !== 'string') return unauthorized();
  if (!freshMfaAt(session.mfaVerifiedAt)) return stepUpRequired('parish_admin', parishId);
  try {
    const status = await mfaStatus(env, 'parish_admin', parishId);
    if (status.methods.includes('totp'))
      return json({ error: 'An authenticator is already configured. This action cannot replace it.' }, { status: 409 });
    const flow = await beginMfaAuthentication(env, request, {
      principalType: 'parish_admin',
      principalId: parishId,
      purpose: 'manage',
      metadata: { sessionId: session.id, enrollmentMethod: 'totp' },
    });
    return json({ ...flow, enrollmentRequired: true, methods: ['totp'] });
  } catch (error) {
    return mfaError(error, 'parish_authenticator_setup');
  }
}
function stepUpRequired(principalType, principalId) {
  return json(
    {
      error: 'Confirm your identity to continue.',
      code: 'mfa_step_up_required',
      principalType,
      principalId,
    },
    { status: 428 }
  );
}
function mfaReloginRequired() {
  return json(
    {
      error: 'Multi-factor authentication is required. Please sign in again.',
      code: 'mfa_relogin_required',
    },
    { status: 401 }
  );
}
async function enforcePrivilegedMfa(request, env, url) {
  const path = url.pathname;
  const activityPing = request.method === 'POST' && /^\/api\/parish\/dashboard\/[^/]+\/session-activity$/.test(path);
  if (!privilegedMfaRequired(env)) return activityPing ? new Response(null, { status: 204 }) : null;
  if (
    path.startsWith('/api/mfa/') ||
    path === '/api/admin/session' ||
    /\/api\/parish\/dashboard\/[^/]+\/session$/.test(path)
  )
    return null;
  const token = getBearerToken(request);
  if (!token) return null;
  if (path.startsWith('/api/admin/')) {
    const session = await resolveAdminSession(env, token);
    if (!session) return null;
    if (!session.mfaVerifiedAt) return mfaReloginRequired();
    if (request.method !== 'GET' && !freshMfaAt(session.mfaVerifiedAt))
      return stepUpRequired('platform_admin', 'platform');
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
    const suffix = path.slice(parishMatch[0].length).replace(/\/+$/, '');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    let sensitiveWrite =
      write &&
      /^\/(?:stripe-onboarding|subscription-checkout|subscription-portal|settlement-profiles|memberships)(?:\/|$)/.test(
        suffix
      );
    let requiresActiveSession =
      write && /^\/(?:onboarding|accounting-access\/(?:activation|bootstrap)|accounting\/setup)(?:\/|$)/.test(suffix);
    if (request.method === 'PATCH' && !suffix) {
      const body = await bodyJson(request.clone());
      sensitiveWrite = Boolean(String(body?.newDashboardPassword || '').trim());
      requiresActiveSession = body?.givingStatus === 'active' && found.registration.givingStatus !== 'active';
    }
    if ((sensitiveWrite || sensitiveRead) && !freshMfaAt(session.mfaVerifiedAt)) {
      return stepUpRequired('parish_admin', parishId);
    }
    const background =
      /^(?:\/accounting-access\/activation|\/(?:stripe|subscription)-refresh)$/.test(suffix) && !requiresActiveSession;
    if (!background && session.id) {
      const now = Date.now();
      const verified = Date.parse(String(session.mfaVerifiedAt));
      if (Number.isFinite(verified)) {
        const cutoff = now - 15 * 6e4;
        const activity = await d1First(
          env,
          `
          INSERT INTO parish_mfa_activity (session_id, verified_at_ms, last_activity_ms)
          VALUES (?, ?, CASE WHEN ? >= ? THEN ? ELSE ? END)
          ON CONFLICT(session_id) DO UPDATE SET
            last_activity_ms = MAX(parish_mfa_activity.last_activity_ms, ?),
            verified_at_ms = excluded.verified_at_ms
          WHERE excluded.verified_at_ms > parish_mfa_activity.verified_at_ms
            OR (excluded.verified_at_ms = parish_mfa_activity.verified_at_ms
                AND parish_mfa_activity.last_activity_ms >= ?)
          RETURNING last_activity_ms
        `,
          session.id,
          verified,
          verified,
          cutoff,
          now,
          verified,
          now,
          cutoff
        );
        if ((activity?.last_activity_ms ?? 0) >= cutoff && !activityPing) return null;
      }
    }
    if (requiresActiveSession) return stepUpRequired('parish_admin', parishId);
    if (activityPing) return new Response(null, { status: 204 });
  }
  return null;
}
async function beginRequiredMfaLogin(env, request, principalType, principalId, metadata = {}, purpose = 'login') {
  return beginMfaAuthentication(env, request, { principalType, principalId, purpose, metadata });
}
async function beginInvitationMfa(env, request, userId, metadata = {}) {
  return beginMfaAuthentication(env, request, {
    principalType: 'platform_user',
    principalId: userId,
    purpose: 'invitation',
    metadata,
  });
}
export {
  beginInvitationMfa,
  beginRequiredMfaLogin,
  enforcePrivilegedMfa,
  handleAdminMfaManagement,
  handleMfaEnrollmentOptions,
  handleMfaEnrollmentVerify,
  handleMfaStatus,
  handleMfaStepUp,
  handleMfaVerify,
  handleParishAuthenticatorSetup,
};
