import { d1 } from '../lib/storage.js';
import { json, unauthorized, getBearerToken } from '../lib/api-responses.js';
import { hasProductionStore, missingProductionStoreResponse } from '../lib/storage-policy.js';
import { normalizeEmail } from '../lib/format.js';
import { privilegedMfaRequired } from '../lib/authentication-policy.js';
import { verifyPlatformUserPassword, issuePlatformUserSession, publicPlatformUser } from '../lib/identity.js';
import { issueParishDashboardSession } from '../lib/parish-sessions.js';
import { storedField, storedObject } from '../lib/stored-values.js';
import type { RegistrationRecord } from '../organizations/types.js';
import type { createIdentityAuthorization } from '../lib/identity-authorization.js';
import {
  invitationAccepted,
  invitationCreated,
  identityRequestBody,
  type InvitationCreated,
} from './identity-invitation-contracts.js';
export type MembershipManagementGate =
  { ok: false; response: Response } | { ok: true; actorUserId: string | null; invitedByLegacyBearer: boolean };
export interface IdentityAccessDependencies {
  rateLimit(
    request: Request,
    env: Env,
    bucket: string,
    options: { limit: number; windowSeconds: number }
  ): Promise<Response | null>;
  beginMfaAuthentication(
    env: Env,
    request: Request,
    options: {
      principalType: 'platform_user';
      principalId: string;
      purpose: 'login' | 'invitation';
      metadata: Record<string, unknown>;
    }
  ): Promise<object>;
  listMembershipsForUser(env: Env, userId: string): Promise<unknown[]>;
  listMembershipsForParish(env: Env, parishId: string): Promise<unknown[]>;
  listInvitationsForParish(env: Env, parishId: string): Promise<unknown[]>;
  acceptInvitation(
    env: Env,
    options: { token: string; password: string; displayName: string; request: Request }
  ): Promise<unknown>;
  createInvitation(
    env: Env,
    options: {
      parishId: string;
      email: string;
      roleTemplate: string;
      capabilities: unknown[];
      invitedByUserId: string | null;
      invitedByLegacyBearer: boolean;
      request: Request;
    }
  ): Promise<unknown>;
  revokeInvitation(
    env: Env,
    options: { invitationId: unknown; actorUserId: string | null; request: Request }
  ): Promise<unknown>;
  findRegistrationByParishId(env: Env, id: string): Promise<{ key: string; registration: RegistrationRecord } | null>;
  saveRegistrationRecord(
    env: Env,
    key: string,
    registration: RegistrationRecord,
    previous: RegistrationRecord
  ): Promise<unknown>;
  verifyParishDashboardBearer(registration: RegistrationRecord, token: string): Promise<boolean>;
  requireCapability: ReturnType<typeof createIdentityAuthorization>['requireCapability'];
  recommendedOnboardingState(registration: RegistrationRecord, checks: unknown): unknown;
  sendParishStaffAccessInvitation(
    env: Env,
    appUrl: string,
    registration: RegistrationRecord,
    invitation: InvitationCreated & { email: string; roleTemplate: string }
  ): Promise<{ status?: unknown }>;
  sanitizeGrantableCapabilities(values: unknown[]): unknown[];
  CAPABILITY_CATALOG: unknown;
  ROLE_TEMPLATES: unknown;
}

export function createIdentityAccessHandlers({
  rateLimit,
  beginMfaAuthentication,
  listMembershipsForUser,
  listMembershipsForParish,
  listInvitationsForParish,
  acceptInvitation,
  createInvitation,
  revokeInvitation,
  findRegistrationByParishId,
  saveRegistrationRecord,
  verifyParishDashboardBearer,
  requireCapability,
  recommendedOnboardingState,
  sendParishStaffAccessInvitation,
  sanitizeGrantableCapabilities,
  CAPABILITY_CATALOG,
  ROLE_TEMPLATES,
}: IdentityAccessDependencies) {
  async function handleIdentityLogin(request: Request, env: Env) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
    const limited = await rateLimit(request, env, 'identity-login', { limit: 20, windowSeconds: 300 });
    if (limited) return limited;

    const body = await identityRequestBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const parishId = String(body.parishId || '').trim();
    if (!email || !password) return json({ error: 'Email and password are required.' }, { status: 400 });

    const user = await verifyPlatformUserPassword(env, email, password);
    if (!user) return json({ error: 'Invalid email or password.' }, { status: 401 });
    const memberships = parishId ? await listMembershipsForUser(env, user.id) : [];
    const membership = parishId
      ? memberships.find((row) => storedField(row, 'parishId') === parishId && storedField(row, 'status') === 'active')
      : null;
    if (parishId && !membership)
      return json({ error: 'This staff account does not have active access to that parish.' }, { status: 403 });

    if (privilegedMfaRequired(env)) {
      return json({
        ok: true,
        ...(await beginMfaAuthentication(env, request, {
          principalType: 'platform_user',
          principalId: user.id,
          purpose: 'login',
          metadata: { identityEmail: email, parishId, membershipId: storedField(membership, 'id') || '' },
        })),
      });
    }

    const session = await issuePlatformUserSession(env, user.id);
    if (!session) return json({ error: 'Unable to start a session.' }, { status: 500 });
    let parishSession: Awaited<ReturnType<typeof issueParishDashboardSession>> | null = null;
    if (parishId) {
      const found = await findRegistrationByParishId(env, parishId);
      if (!found) return json({ error: 'Parish dashboard record not found.' }, { status: 404 });
      parishSession = await issueParishDashboardSession(found.registration, { accessType: 'staff' });
      await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
    }

    return json({
      token: session.token,
      expiresAt: session.expiresAt,
      identityEmail: email,
      user: publicPlatformUser(user),
      parishId,
      membershipId: storedField(membership, 'id') || '',
      parishToken: parishSession?.token || '',
      parishTokenExpiresAt: parishSession?.expiresAt || '',
    });
  }

  async function handleIdentityInvitationAccept(request: Request, env: Env, token: string) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
    const limited = await rateLimit(request, env, 'identity-invitation-accept', { limit: 20, windowSeconds: 300 });
    if (limited) return limited;

    const body = await identityRequestBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

    const password = String(body.password || '');
    if (!password || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const result = invitationAccepted(
      await acceptInvitation(env, {
        token,
        password,
        displayName: String(body.displayName || '').trim(),
        request,
      })
    );
    if (!result.ok) return json({ error: result.error || 'Unable to accept invitation.' }, { status: 400 });

    if (privilegedMfaRequired(env)) {
      return json({
        ok: true,
        ...(await beginMfaAuthentication(env, request, {
          principalType: 'platform_user',
          principalId: result.userId,
          purpose: 'invitation',
          metadata: {
            identityEmail: result.email,
            parishId: result.parishId,
            membershipId: result.membershipId,
          },
        })),
      });
    }

    const session = await issuePlatformUserSession(env, result.userId);
    let parishSession: Awaited<ReturnType<typeof issueParishDashboardSession>> | null = null;
    const found = await findRegistrationByParishId(env, result.parishId);
    if (found) {
      const currentAccess =
        found.registration.onboardingAccess && typeof found.registration.onboardingAccess === 'object'
          ? found.registration.onboardingAccess
          : {};
      const acceptedAccess: Record<string, unknown> = { ...storedObject(currentAccess) };
      for (const key of ['priest', 'treasurer']) {
        if (normalizeEmail(storedField(acceptedAccess[key], 'email')) === normalizeEmail(result.email)) {
          acceptedAccess[key] = {
            ...storedObject(acceptedAccess[key]),
            status: 'accepted',
            acceptedAt: result.acceptedAt,
            membershipId: result.membershipId,
          };
        }
      }
      const registration: RegistrationRecord = {
        ...found.registration,
        onboardingAccess: acceptedAccess,
        parishUpdatedAt: result.acceptedAt,
      };
      registration.onboardingState = recommendedOnboardingState(registration, registration.onboardingChecks);
      parishSession = await issueParishDashboardSession(registration, { accessType: 'staff' });
      await saveRegistrationRecord(env, found.key, parishSession.registration, found.registration);
    }
    return json({
      ok: true,
      token: session?.token || '',
      expiresAt: session?.expiresAt || '',
      identityEmail: result.email,
      parishId: result.parishId,
      membershipId: result.membershipId,
      parishToken: parishSession?.token || '',
      parishTokenExpiresAt: parishSession?.expiresAt || '',
    });
  }

  async function requireMembershipManagementContext(
    request: Request,
    env: Env,
    parishId: string,
    capability: string
  ): Promise<MembershipManagementGate> {
    const found = await findRegistrationByParishId(env, parishId);
    if (!found) return { ok: false, response: json({ error: 'Parish dashboard record not found' }, { status: 404 }) };

    const legacyToken = getBearerToken(request);
    if (legacyToken && (await verifyParishDashboardBearer(found.registration, legacyToken))) {
      return { ok: true, actorUserId: null, invitedByLegacyBearer: true };
    }

    const ctx = await requireCapability(request, env, parishId, capability);
    if (ctx) return { ok: true, actorUserId: ctx.user.id, invitedByLegacyBearer: false };

    return { ok: false, response: unauthorized() };
  }

  async function handleMembershipInvitationCreate(request: Request, env: Env, parishId: string) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
    const limited = await rateLimit(request, env, 'parish-dashboard', { limit: 80, windowSeconds: 300 });
    if (limited) return limited;

    const gate = await requireMembershipManagementContext(request, env, parishId, 'parish.members.invite');
    if (!gate.ok) return gate.response;

    const body = await identityRequestBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

    const email = normalizeEmail(body.email);
    if (!email) return json({ error: 'A valid email is required.' }, { status: 400 });

    const roleTemplate = String(body.roleTemplate || '').trim();
    // Deny-by-default: sanitizeGrantableCapabilities is the single, centralized
    // filter (unknown + platform-only capabilities stripped) -- createInvitation
    // applies it again server-side regardless, but filtering here too means an
    // invalid capability never even reaches the escalation-bounding check below
    // as something worth comparing against.
    const explicitCapabilities = sanitizeGrantableCapabilities(
      Array.isArray(body.capabilities) ? body.capabilities : []
    );

    const existingInvitations = await listInvitationsForParish(env, parishId);
    for (const pending of existingInvitations.filter(
      (item) => storedField(item, 'status') === 'pending' && normalizeEmail(storedField(item, 'email')) === email
    )) {
      await revokeInvitation(env, { invitationId: storedField(pending, 'id'), actorUserId: gate.actorUserId, request });
    }

    const invitation = invitationCreated(
      await createInvitation(env, {
        parishId,
        email,
        roleTemplate,
        // createInvitation expands the role template into capabilities itself
        // when this is empty -- only pass an explicit list through here.
        capabilities: explicitCapabilities,
        invitedByUserId: gate.actorUserId,
        invitedByLegacyBearer: gate.invitedByLegacyBearer,
        request,
      })
    );
    if (!invitation.ok) {
      // A self-invitation or a capability-escalation attempt is a 403
      // (the caller is authenticated and otherwise permitted to invite, just
      // not to grant *this*); anything else is a plain validation failure.
      const status =
        invitation.code === 'self_invitation' ||
        invitation.code === 'capability_escalation' ||
        invitation.code === 'not_authorized'
          ? 403
          : 400;
      return json({ error: invitation.error || 'Unable to create invitation.' }, { status });
    }

    const found = await findRegistrationByParishId(env, parishId);
    const delivery = await sendParishStaffAccessInvitation(
      env,
      env.AGAPAY_APP_URL || 'https://agapay.app',
      found?.registration || { parishId },
      { ...invitation, email, roleTemplate }
    );
    return json({
      ok: true,
      invitationId: invitation.id,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      emailStatus: delivery.status || 'failed',
    });
  }

  async function handleMembershipList(request: Request, env: Env, parishId: string) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

    const gate = await requireMembershipManagementContext(request, env, parishId, 'parish.manage');
    if (!gate.ok) return gate.response;

    const [memberships, invitations] = await Promise.all([
      listMembershipsForParish(env, parishId),
      listInvitationsForParish(env, parishId),
    ]);
    return json({ memberships, invitations });
  }

  async function handleMembershipInvitationRevoke(request: Request, env: Env, parishId: string, invitationId: string) {
    if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

    const gate = await requireMembershipManagementContext(request, env, parishId, 'parish.members.remove');
    if (!gate.ok) return gate.response;

    await revokeInvitation(env, { invitationId, actorUserId: gate.actorUserId, request });
    return json({ ok: true });
  }

  async function handleIdentityCapabilityCatalog(request: Request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
    return json({ capabilities: CAPABILITY_CATALOG, roleTemplates: ROLE_TEMPLATES });
  }
  return {
    handleIdentityLogin,
    handleIdentityInvitationAccept,
    handleMembershipInvitationCreate,
    handleMembershipList,
    handleMembershipInvitationRevoke,
    handleIdentityCapabilityCatalog,
  };
}
