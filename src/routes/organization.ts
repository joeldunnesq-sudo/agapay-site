import type { RegistrationRecord } from '../organizations/types.js';
import type { RegistrationLookup } from '../organizations/context.js';
export interface OrganizationActions<TEnv, TRecord extends RegistrationRecord> {
  json(body: unknown, init?: import('../lib/http-responses.js').JsonResponseInit): Response;
  findRegistrationByParishId: RegistrationLookup<TEnv, TRecord>;
  getBearerToken(request: Request): string;
  verifyParishDashboardBearer(registration: TRecord, token: string): boolean | Promise<boolean>;
  unauthorized(): Response;
}
export interface OrganizationRouteContext<TEnv, TRecord extends RegistrationRecord> {
  request: Request;
  env: TEnv;
  url: URL;
  actions: OrganizationActions<TEnv, TRecord>;
}

import {
  ORGANIZATION_API_VERSION,
  evaluateOrganizationApiAccess,
  organizationApiDescriptor,
} from '../organizations/api-policy.js';
import { resolveOrganizationContext } from '../organizations/context.js';

const ORGANIZATION_ROUTE_PREFIX = `/api/${ORGANIZATION_API_VERSION}/organizations`;

function notFound(actions: Pick<OrganizationActions<unknown, RegistrationRecord>, 'json'>) {
  return actions.json({ error: 'Not found' }, { status: 404 });
}

export function parseOrganizationApiRoute(pathname: string) {
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

export async function routeOrganizationRequest<TEnv, TRecord extends RegistrationRecord>({
  request,
  env,
  url,
  actions,
}: OrganizationRouteContext<TEnv, TRecord>) {
  const route = parseOrganizationApiRoute(url.pathname);
  if (!route) return null;
  if (!route.organizationId) return notFound(actions);
  if (request.method !== 'GET') {
    return actions.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  const resolved = await resolveOrganizationContext(env, route.organizationId, actions.findRegistrationByParishId);
  const access = evaluateOrganizationApiAccess(resolved?.organization);
  if (!access.allowed) return notFound(actions);

  const authorized = await actions.verifyParishDashboardBearer(resolved!.registration, actions.getBearerToken(request));
  if (!authorized) return actions.unauthorized();

  return actions.json(organizationApiDescriptor(access.organization), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
