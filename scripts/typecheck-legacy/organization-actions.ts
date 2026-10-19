// Check the actual production providers and action registry, not parallel mocks.
import { ROUTE_ACTIONS } from '../../src/routes/worker-actions.js';
import { ORGANIZATION_ACTIONS } from '../../src/routes/organization-entry.js';
import {
  findRegistrationByParishId,
  verifyParishDashboardBearer,
} from '../../src/handlers/parish-organization-providers.js';
import { json, unauthorized, getBearerToken } from '../../src/lib/core.js';
import { routeOrganizationRequest, type OrganizationRouteActions } from '../../src/routes/organization.js';
import type { RegistrationRecord } from '../../src/organizations/types.js';

const actions = {
  findRegistrationByParishId,
  verifyParishDashboardBearer,
  json,
  unauthorized,
  getBearerToken,
};
const productionActions: OrganizationRouteActions<Env, RegistrationRecord> = ORGANIZATION_ACTIONS;
const actualRawLookup: typeof findRegistrationByParishId = ROUTE_ACTIONS.findRegistrationByParishId;
// @ts-expect-error Raw legacy JSON cannot bypass the organization record adapter.
const unadapted: OrganizationRouteActions<Env, RegistrationRecord> = ROUTE_ACTIONS;
declare const request: Request;
declare const env: Env;
const response: Response | null = await routeOrganizationRequest({
  request,
  env,
  url: new URL(request.url),
  actions: productionActions,
});
const found = await actions.findRegistrationByParishId(env, 'demo');
const normalized = await productionActions.findRegistrationByParishId(env, 'demo');
if (normalized?.registration) {
  // @ts-expect-error Establishing an object root does not validate individual stored fields.
  const privateSession: string = normalized.registration.parishDashboardToken;
  void privateSession;
}
// @ts-expect-error A real repository lookup can miss the registration.
void found.registration;
if (found) {
  // @ts-expect-error Raw storage JSON is unknown, including its root object shape.
  const token: string = found.registration.parishDashboardToken;
  void token;
}
// @ts-expect-error The production verifier returns an asynchronous result.
const immediateDecision: boolean = actions.verifyParishDashboardBearer({}, 'token');
// @ts-expect-error The actual token provider takes a Request, not an authorization string.
actions.getBearerToken('Bearer token');
// @ts-expect-error Verification takes a token string, not an unresolved extraction Promise.
actions.verifyParishDashboardBearer({}, Promise.resolve('token'));
// @ts-expect-error The actual storage provider requires real configured binding types.
actions.findRegistrationByParishId({ AGAPAY_REGISTRATIONS: 'not-a-kv-binding' }, 'demo');
void [response, immediateDecision, actualRawLookup, unadapted];
