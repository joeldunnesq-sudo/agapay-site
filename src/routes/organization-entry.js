// @ts-check
import { ROUTE_ACTIONS } from './worker-actions.js';
import { organizationRegistrationLookup } from './organization-action-contracts.js';
import { routeOrganizationRequest as routeTypedOrganizationRequest } from './organization.js';

/** @satisfies {import('./organization.js').OrganizationRouteActions<Env, import('../organizations/types.js').RegistrationRecord>} */
export const ORGANIZATION_ACTIONS = Object.freeze({
  findRegistrationByParishId: organizationRegistrationLookup(ROUTE_ACTIONS.findRegistrationByParishId),
  verifyParishDashboardBearer: ROUTE_ACTIONS.verifyParishDashboardBearer,
  getBearerToken: ROUTE_ACTIONS.getBearerToken,
  json: ROUTE_ACTIONS.json,
  unauthorized: ROUTE_ACTIONS.unauthorized,
});

/** @param {Omit<import('./organization.js').OrganizationRouteContext<Env, import('../organizations/types.js').RegistrationRecord>, 'actions'>} context */
export async function routeOrganizationRequest(context) {
  return routeTypedOrganizationRequest({ ...context, actions: ORGANIZATION_ACTIONS });
}
