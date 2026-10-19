import { requireCapability, requireActiveMembership, currentUser } from '../../src/lib/authorization.js';
import { handleIdentitySession, handleIdentityLogout } from '../../src/handlers/identity.js';
import { requirePlatformUser } from '../../src/lib/identity.js';
import { ROUTE_ACTIONS } from '../../src/routes/worker-actions.js';
declare const env: Env;
declare const request: Request;
const actualIdentity: typeof requirePlatformUser = currentUser;
const sessionCaller: typeof handleIdentitySession = ROUTE_ACTIONS.handleIdentitySession;
const logoutCaller: typeof handleIdentityLogout = ROUTE_ACTIONS.handleIdentityLogout;
const response: Response = await sessionCaller(request, env);
const context = await requireCapability(request, env, 'parish', 'accounting.view');
// @ts-expect-error An authenticated caller can still lack a membership or capability.
void context.user.id;
if (context) {
  const id: string = context.user.id;
  const parish: string = context.membership.parishId;
  const capabilities: string[] = context.capabilities;
  // @ts-expect-error A granted capability does not expose session hashes.
  void context.user.session_token_hash;
  void [id, parish, capabilities];
}
// @ts-expect-error Parish identifiers cannot be request objects.
requireActiveMembership(request, env, request);
// @ts-expect-error The actual route caller rejects a string in place of Request.
logoutCaller('token', env);
void [actualIdentity, response];
