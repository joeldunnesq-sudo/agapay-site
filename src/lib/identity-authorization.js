// Generated from src/lib/identity-authorization.ts by npm run build:server. Do not edit.
import { requirePlatformUser } from './identity.js';
import { resolveAuthorizationContext } from './authorization-context.js';
function createIdentityAuthorization({ recordAuditEvent }) {
  function correlationIdFor(request) {
    return request?.headers?.get?.('X-Request-Id') || '';
  }
  async function requireCapability(request, env, parishId, capability) {
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
  async function requireActiveMembership(request, env, parishId) {
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
export { createIdentityAuthorization };
