import { d1, d1First, d1All } from './storage.js';
import type { IdentityEnvironment } from './identity.js';
interface MembershipRow {
  id: string;
  user_id: string;
  parish_id: string;
  role_template: string | null;
  status: string;
}
export interface ActiveMembership {
  id: string;
  userId: string;
  parishId: string;
  roleTemplate: string;
  status: string;
}
export interface AuthorizationContext {
  membership: ActiveMembership | null;
  capabilities: string[];
}
export async function resolveAuthorizationContext(
  env: IdentityEnvironment,
  { userId, parishId }: { userId: string; parishId: string }
): Promise<AuthorizationContext> {
  if (!d1(env) || !userId || !parishId) return { membership: null, capabilities: [] };

  const membership = await d1First<MembershipRow>(
    env,
    'SELECT * FROM parish_memberships WHERE user_id = ?1 AND parish_id = ?2',
    userId,
    parishId
  );

  if (!membership || membership.status !== 'active') {
    return { membership: null, capabilities: [] };
  }

  const rows = await d1All<{ capability: string }>(
    env,
    'SELECT capability FROM membership_capabilities WHERE membership_id = ?1',
    membership.id
  );

  return {
    membership: {
      id: membership.id,
      userId: membership.user_id,
      parishId: membership.parish_id,
      roleTemplate: membership.role_template || '',
      status: membership.status,
    },
    capabilities: rows.map((row) => row.capability),
  };
}
