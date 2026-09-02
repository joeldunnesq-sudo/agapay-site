import {
  ORGANIZATION_API_VERSION,
  evaluateOrganizationApiAccess,
  organizationApiDescriptor,
} from '../organizations/api-policy.js';
import { resolveOrganizationContext } from '../organizations/context.js';

const ORGANIZATION_ROUTE_PREFIX = `/api/${ORGANIZATION_API_VERSION}/organizations`;

function notFound(actions) {
  return actions.json({ error: 'Not found' }, { status: 404 });
}

export function parseOrganizationApiRoute(pathname) {
  if (pathname !== ORGANIZATION_ROUTE_PREFIX && !pathname.startsWith(`${ORGANIZATION_ROUTE_PREFIX}/`)) return null;

  const remainder = pathname.slice(ORGANIZATION_ROUTE_PREFIX.length).replace(/^\//, '').replace(/\/$/, '');
  if (!remainder || remainder.includes('/')) {
    return Object.freeze({ matched: true, organizationId: '' });
  }

  try {
    const organizationId = decodeURIComponent(remainder).trim();
    if (!organizationId || organizationId.length > 200 || organizationId.includes('/')) {
      return Object.freeze({ matched: true, organizationId: '' });
    }
    return Object.freeze({ matched: true, organizationId });
  } catch {
    return Object.freeze({ matched: true, organizationId: '' });
  }
}

export async function routeOrganizationRequest({ request, env, url, actions }) {
  const route = parseOrganizationApiRoute(url.pathname);
  if (!route) return null;
  if (!route.organizationId) return notFound(actions);
  if (request.method !== 'GET') {
    return actions.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  const resolved = await resolveOrganizationContext(env, route.organizationId, actions.findRegistrationByParishId);
  const access = evaluateOrganizationApiAccess(resolved?.organization);
  if (!access.allowed) return notFound(actions);

  const authorized = await actions.verifyParishDashboardBearer(resolved.registration, actions.getBearerToken(request));
  if (!authorized) return actions.unauthorized();

  return actions.json(organizationApiDescriptor(access.organization), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
