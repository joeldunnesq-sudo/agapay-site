import type { MfaVerification, MfaBody, MfaMetadata } from '../lib/mfa.js';
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
} from '../lib/core.js';
import {
  beginMfaAuthentication,
  beginMfaEnrollment,
  freshMfaAt,
  loadMfaTransaction,
  mfaStatus,
  verifyMfaAuthentication,
  verifyMfaEnrollment,
} from '../lib/mfa.js';
import { issuePlatformUserSession, markPlatformUserSessionMfaVerified, requirePlatformUser } from '../lib/identity.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { mfaErrorDetails } from '../lib/mfa-diagnostics.js';
import { findRegistrationByParishId, saveRegistrationRecord } from './parish.js';

function mfaError(error: unknown, operation: string) {
  const { reason, status, message } = mfaErrorDetails(error);
  const reference = crypto.randomUUID();
  console.warn('mfa_request_failed', { operation, reason, status, reference });
  return json({ error: message, code: 'mfa_error', reference }, { status });
}

async function bodyJson(request: Request) {
  try {
    return (await request.json()) as MfaBody;
  } catch {
    return null;
  }
}

async function finalizeMfa(env: Partial<Env>, request: Request, result: MfaVerification) {
  const { transaction, verifiedAt, recoveryCodes = [] } = result;
  const metadata = transaction.metadata || {};
  let payload: Record<string, unknown> = { ok: true, mfaVerifiedAt: verifiedAt, recoveryCodes };

  if (transaction.purpose === 'step_up' || transaction.purpose === 'manage') {
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
    action: transaction.purpose === 'step_up' ? 'mfa.step_up_succeeded' : 'mfa.authentication_succeeded',
    actorUserId: transaction.principal_id,
    actorType:
      transaction.principal_type === 'platform_admin'
        ? 'admin'
        : transaction.principal_type === 'parish_admin'
          ? 'parish'
          : 'platform_user',
    targetType: 'mfa_profile',
    targetId: `${transaction.principal_type}:${transaction.principal_id}`,
    organizationId: (transaction.principal_type === 'parish_admin'
      ? transaction.principal_id
      : metadata.parishId || null) as string | undefined,
    metadata: { purpose: transaction.purpose, recoveryCodesIssued: recoveryCodes.length },
  });

  return payload;
}

export async function handleMfaEnrollmentOptions(request: Request, env: Partial<Env>) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-enrollment-options', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const result = await beginMfaEnrollment(env, request, body.pendingToken, {
      method: body.method,
      displayName: String(body.displayName || 'AGAPAY administrator').slice(0, 160),
      credentialLabel: String(body.credentialLabel || 'Passkey').slice(0, 80),
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return mfaError(error, 'enrollment_options');
  }
}

export async function handleMfaEnrollmentVerify(request: Request, env: Partial<Env>) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'mfa-enrollment-verify', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const result = await verifyMfaEnrollment(env, request, body.pendingToken, body);
    return json(await finalizeMfa(env, request, result));
  } catch (error) {
    return mfaError(error, 'enrollment_verify');
  }
}

export async function handleMfaVerify(request: Request, env: Partial<Env>) {
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

async function rawStepUpContext(request: Request, env: Partial<Env>, principalType: string, principalId: string) {
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
    return user?.id === principalId
      ? { sessionId: user.id, mfaVerifiedAt: (user as typeof user & { mfaVerifiedAt?: string }).mfaVerifiedAt }
      : null;
  }
  return null;
}

export async function handleMfaStepUp(request: Request, env: Partial<Env>) {
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
      metadata: { sessionId: context.sessionId, actor: (context as typeof context & { actor?: string }).actor || '' },
    });
    return json({ ok: true, ...flow });
  } catch (error) {
    return mfaError(error, 'step_up');
  }
}

export async function handleMfaStatus(request: Request, env: Partial<Env>) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const body = await bodyJson(request);
  if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
  const principalType = String(body.principalType || '');
  const principalId = String(body.principalId || '');
  if (!(await rawStepUpContext(request, env, principalType, principalId))) return unauthorized();
  return json({ ok: true, status: await mfaStatus(env, principalType, principalId) });
}

export async function handleParishAuthenticatorSetup(request: Request, env: Partial<Env>) {
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

function stepUpRequired(principalType: string, principalId: string) {
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

export async function enforcePrivilegedMfa(request: Request, env: Partial<Env>, url: URL) {
  if (!privilegedMfaRequired(env)) return null;
  const path = url.pathname;
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
    const refreshSafePost = request.method === 'POST' && /\/(?:subscription-refresh|stripe-refresh)$/.test(path);
    if (((request.method !== 'GET' && !refreshSafePost) || sensitiveRead) && !freshMfaAt(session.mfaVerifiedAt)) {
      return stepUpRequired('parish_admin', parishId);
    }
  }
  return null;
}

export async function beginRequiredMfaLogin(
  env: Partial<Env>,
  request: Request,
  principalType: string,
  principalId: string,
  metadata: MfaMetadata = {},
  purpose: string = 'login'
) {
  return beginMfaAuthentication(env, request, { principalType, principalId, purpose, metadata });
}

export async function beginInvitationMfa(
  env: Partial<Env>,
  request: Request,
  userId: string,
  metadata: MfaMetadata = {}
) {
  return beginMfaAuthentication(env, request, {
    principalType: 'platform_user',
    principalId: userId,
    purpose: 'invitation',
    metadata,
  });
}
