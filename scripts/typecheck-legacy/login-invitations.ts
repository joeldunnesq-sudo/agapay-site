import * as facade from '../../src/handlers/identity.js';
import * as providers from '../../src/handlers/identity-access-providers.js';
import { ROUTE_ACTIONS } from '../../src/routes/worker-actions.js';
declare const request: Request;
declare const env: Env;
const login: typeof providers.handleIdentityLogin = ROUTE_ACTIONS.handleIdentityLogin;
const accept: typeof providers.handleIdentityInvitationAccept = ROUTE_ACTIONS.handleIdentityInvitationAccept;
const create: typeof providers.handleMembershipInvitationCreate = ROUTE_ACTIONS.handleMembershipInvitationCreate;
const revoke: typeof providers.handleMembershipInvitationRevoke = facade.handleMembershipInvitationRevoke;
const response: Response = await login(request, env);
// @ts-expect-error The actual invitation route rejects a numeric token.
accept(request, env, 42);
// @ts-expect-error The actual create route requires a parish identifier.
create(request, env);
// @ts-expect-error The actual revoke route requires an invitation identifier.
revoke(request, env, 'parish');
void response;
