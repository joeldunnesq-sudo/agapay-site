// Generated from src/routes/organization-entry.ts by npm run build:server. Do not edit.
import { ROUTE_ACTIONS } from './worker-actions.js';
import { organizationRegistrationLookup } from './organization-action-contracts.js';
import { routeOrganizationRequest as routeTypedOrganizationRequest } from './organization.js';
const ORGANIZATION_ACTIONS = Object.freeze({
  findRegistrationByParishId: organizationRegistrationLookup(ROUTE_ACTIONS.findRegistrationByParishId),
  verifyParishDashboardBearer: ROUTE_ACTIONS.verifyParishDashboardBearer,
  getBearerToken: ROUTE_ACTIONS.getBearerToken,
  json: ROUTE_ACTIONS.json,
  unauthorized: ROUTE_ACTIONS.unauthorized,
});
async function routeOrganizationRequest(context) {
  return routeTypedOrganizationRequest({ ...context, actions: ORGANIZATION_ACTIONS });
}
export { ORGANIZATION_ACTIONS, routeOrganizationRequest };
