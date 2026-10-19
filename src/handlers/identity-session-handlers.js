// Generated from src/handlers/identity-session-handlers.ts by npm run build:server. Do not edit.
import { d1 } from '../lib/storage.js';
import { json, unauthorized } from '../lib/api-responses.js';
import { hasProductionStore, missingProductionStoreResponse } from '../lib/storage-policy.js';
import { requirePlatformUser, revokePlatformUserSession } from '../lib/identity.js';
function createIdentitySessionHandlers({ listMembershipsForUser }) {
  async function handleIdentitySession(request, env) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
    const user = await requirePlatformUser(request, env);
    if (!user) return unauthorized();
    const memberships = await listMembershipsForUser(env, user.id);
    return json({ user, memberships });
  }
  async function handleIdentityLogout(request, env) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
    const user = await requirePlatformUser(request, env);
    if (!user) return unauthorized();
    await revokePlatformUserSession(env, user.id);
    return json({ ok: true });
  }
  return { handleIdentitySession, handleIdentityLogout };
}
export { createIdentitySessionHandlers };
