import {
  ORGANIZATION_API_VERSION,
  evaluateOrganizationApiAccess,
  organizationApiDescriptor,
} from '../organizations/api-policy.js';
import { resolveOrganizationContext } from '../organizations/context.js';
import type { RegistrationLookup } from '../organizations/context.js';
import type { RegistrationRecord } from '../organizations/types.js';
import type { OrganizationApiDescriptor } from '../organizations/api-policy.js';

export interface OrganizationApiRoute {
  readonly matched: true;
  readonly organizationId: string;
}

export interface OrganizationApiError {
  readonly error: 'Not found' | 'Method not allowed';
}

// Keep the repository's concrete environment and stored record types all the way
// from lookup to verification. These contracts do not validate external data.
export interface OrganizationRouteActions<TEnv, TRecord extends RegistrationRecord> {
  readonly findRegistrationByParishId: RegistrationLookup<TEnv, TRecord>;
  readonly getBearerToken: (request: Request) => string;
  readonly verifyParishDashboardBearer: (registration: TRecord, token: string) => boolean | Promise<boolean>;
  readonly unauthorized: () => Response;
  readonly json: (
    body: OrganizationApiDescriptor | OrganizationApiError | null,
    init?: Omit<import('../lib/http-responses.js').JsonResponseInit, 'headers'> & {
      headers?: Readonly<Record<string, string>>;
    }
  ) => Response;
}

export interface OrganizationRouteContext<TEnv, TRecord extends RegistrationRecord> {
  readonly request: Request;
  readonly env: TEnv;
  readonly url: URL;
  readonly actions: OrganizationRouteActions<TEnv, TRecord>;
}

const ORGANIZATION_ROUTE_PREFIX = `/api/${ORGANIZATION_API_VERSION}/organizations`;

function notFound<TEnv, TRecord extends RegistrationRecord>(
  actions: OrganizationRouteActions<TEnv, TRecord>
): Response {
  return actions.json({ error: 'Not found' }, { status: 404 });
}

export function parseOrganizationApiRoute(pathname: string): OrganizationApiRoute | null {
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
}: OrganizationRouteContext<TEnv, TRecord>): Promise<Response | null> {
  const route = parseOrganizationApiRoute(url.pathname);
  if (!route) return null;
  if (!route.organizationId) return notFound(actions);
  if (request.method !== 'GET') {
    return actions.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  const resolved = await resolveOrganizationContext(env, route.organizationId, actions.findRegistrationByParishId);
  const access = evaluateOrganizationApiAccess(resolved?.organization);
  if (!resolved || !access.allowed) return notFound(actions);

  const authorized = await actions.verifyParishDashboardBearer(resolved.registration, actions.getBearerToken(request));
  if (!authorized) return actions.unauthorized();

  return actions.json(organizationApiDescriptor(access.organization), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export type OrganizationActions<TEnv, TRecord extends RegistrationRecord> = OrganizationRouteActions<TEnv, TRecord>;
