import { requirePlatformUser, type IdentityEnvironment } from './identity.js';
import { resolveAuthorizationContext } from './authorization-context.js';
interface DenialAudit {
  action: string;
  actorUserId: string;
  actorType: string;
  targetType: string;
  targetId: string;
  organizationId: string;
  requestId: string;
  metadata: { capabilityRequested: string; resource: string; decision: string };
}
export interface IdentityAuthorizationDependencies {
  recordAuditEvent(env: IdentityEnvironment, request: Request, fields: DenialAudit): Promise<unknown>;
}
export function createIdentityAuthorization({ recordAuditEvent }: IdentityAuthorizationDependencies) {
  function correlationIdFor(request: Request) {
    return request?.headers?.get?.('X-Request-Id') || '';
  }
  async function requireCapability(request: Request, env: IdentityEnvironment, parishId: string, capability: string) {
    const user = await requirePlatformUser(request, env);
    if (!user) return null;

    const { membership, capabilities } = await resolveAuthorizationContext(env, {
      userId: user.id,
      parishId,
    });

    if (!membership) return null;

    if (!capabilities.includes(capability)) {
      await recordAuditEvent(env, request, {
        action: 'authorization.capability_denied',
        actorUserId: user.id,
        actorType: 'platform_user',
        targetType: 'parish_membership',
        targetId: membership.id,
        organizationId: parishId,
        requestId: correlationIdFor(request),
        metadata: {
          capabilityRequested: capability,
          resource: request?.url || '',
          decision: 'denied',
        },
      });
      return null;
    }

    return { user, membership, capabilities };
  }
  async function requireActiveMembership(request: Request, env: IdentityEnvironment, parishId: string) {
    const user = await requirePlatformUser(request, env);
    if (!user) return null;

    const { membership, capabilities } = await resolveAuthorizationContext(env, {
      userId: user.id,
      parishId,
    });
    if (!membership) return null;

    return { user, membership, capabilities };
  }
  return { requireCapability, requireActiveMembership };
}
