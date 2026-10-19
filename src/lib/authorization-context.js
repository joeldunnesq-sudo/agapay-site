// Generated from src/lib/authorization-context.ts by npm run build:server. Do not edit.
import { d1, d1First, d1All } from './storage.js';
async function resolveAuthorizationContext(env, { userId, parishId }) {
  if (!d1(env) || !userId || !parishId) return { membership: null, capabilities: [] };
  const membership = await d1First(
    env,
    'SELECT * FROM parish_memberships WHERE user_id = ?1 AND parish_id = ?2',
    userId,
    parishId
  );
  if (!membership || membership.status !== 'active') {
    return { membership: null, capabilities: [] };
  }
  const rows = await d1All(
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
export { resolveAuthorizationContext };
