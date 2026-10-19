import {
  invitationAccepted,
  invitationCreated,
  identityRequestBody,
} from '../../src/handlers/identity-invitation-contracts.js';
import {
  createIdentityAccessHandlers,
  type IdentityAccessDependencies,
} from '../../src/handlers/identity-access-handlers.js';
declare const raw: unknown;
declare const request: Request;
declare const env: Env;
declare const dependencies: IdentityAccessDependencies;
const result = invitationAccepted(raw);
// @ts-expect-error Failed acceptance has no identity eligible for session issuance.
void result.userId;
if (result.ok) {
  const id: string = result.userId;
  void id;
}
const created = invitationCreated(raw);
// @ts-expect-error A failed invitation cannot be emailed as a valid token.
void created.token;
const body = await identityRequestBody(request);
// @ts-expect-error Request JSON may fail or have an invalid root.
void body.email;
if (body) {
  // @ts-expect-error Establishing the root does not validate individual fields.
  const email: string = body.email;
  void email;
}
const handlers = createIdentityAccessHandlers(dependencies);
const response: Response = await handlers.handleIdentityLogin(request, env);
// @ts-expect-error Invitations require a string token.
handlers.handleIdentityInvitationAccept(request, env, request);
// @ts-expect-error Limiting is asynchronous and must return a nullable Response.
const invalidLimiter: IdentityAccessDependencies['rateLimit'] = () => false;
// @ts-expect-error Bearer verification must be asynchronous and boolean.
const invalidVerifier: IdentityAccessDependencies['verifyParishDashboardBearer'] = () => true;
void [response, invalidLimiter, invalidVerifier];
