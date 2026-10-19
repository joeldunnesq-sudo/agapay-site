// Compile-only consumers of the real route and dispatcher; never deployed.
import {
  parseOrganizationApiRoute,
  routeOrganizationRequest,
  type OrganizationRouteActions,
  type OrganizationRouteContext,
} from '../../src/routes/organization.js';
import { dispatchRouteRegistries, type RouteRegistry } from '../../src/routes/registry.js';
import type { RegistrationRecord } from '../../src/organizations/types.js';

interface StoredRegistration extends RegistrationRecord {
  parishId: string;
  sessionHash: string | null;
}
interface RepositoryEnvironment {
  registrations: Map<string, StoredRegistration>;
}
declare const request: Request;
declare const env: RepositoryEnvironment;

const actions: OrganizationRouteActions<RepositoryEnvironment, StoredRegistration> = {
  findRegistrationByParishId: async (repository, organizationId) => ({
    key: organizationId,
    registration: repository.registrations.get(organizationId),
  }),
  getBearerToken: (incoming) => incoming.headers.get('Authorization') || '',
  verifyParishDashboardBearer: async (registration, token) => {
    const hash: string | null = registration.sessionHash;
    // @ts-expect-error Nullable storage fields still require narrowing in service callbacks.
    const assumedHash: string = registration.sessionHash;
    void assumedHash;
    return hash !== null && hash === token;
  },
  unauthorized: () => new Response(null, { status: 401 }),
  json: (body, init) => {
    if (body && 'apiVersion' in body) {
      const name: string = body.organization.displayName;
      // @ts-expect-error The response contract does not expose stored session fields.
      void body.organization.sessionHash;
      // @ts-expect-error Public descriptors remain readonly in the actual route consumer.
      body.organization.displayName = name;
    }
    return Response.json(body, init);
  },
};
const context: OrganizationRouteContext<RepositoryEnvironment, StoredRegistration> = {
  request,
  env,
  url: new URL(request.url),
  actions,
};
const registries: readonly RouteRegistry<typeof context>[] = Object.freeze([routeOrganizationRequest]);
const response: Response | null = await dispatchRouteRegistries(registries, context);
if (response) {
  const status: number = response.status;
  void status;
}
const parsed = parseOrganizationApiRoute('/api/v1/organizations/demo');
// @ts-expect-error An unrelated URL yields no organization route.
void parsed.organizationId;
if (parsed) {
  // @ts-expect-error Parsed routes are immutable.
  parsed.organizationId = 'other';
}
// @ts-expect-error The dispatcher returns null when no router handles a request.
const assumedResponse: Response = await routeOrganizationRequest(context);
// @ts-expect-error Repository callbacks must return the stored record, not a bare identifier.
const wrongLookup: typeof actions.findRegistrationByParishId = async () => ({ registration: 'demo' });
// @ts-expect-error Missing injected verification is rejected at the caller boundary.
const incomplete: OrganizationRouteActions<RepositoryEnvironment, StoredRegistration> = { json: actions.json };
// @ts-expect-error Verification must resolve to a boolean, not an object treated as truthy.
const wrongVerifier: typeof actions.verifyParishDashboardBearer = async () => ({ allowed: false });
// @ts-expect-error Token extraction is synchronous; a Promise must not reach verification.
const wrongToken: typeof actions.getBearerToken = async () => 'token';
// @ts-expect-error JSON response construction must return a Response.
const wrongJson: typeof actions.json = (body) => body;
// @ts-expect-error The lookup and caller must agree on the repository environment.
routeOrganizationRequest({ ...context, env: { otherStorage: true } });
// @ts-expect-error Typed route handlers cannot return an arbitrary payload instead of a Response.
const wrongRegistry: RouteRegistry<typeof context> = async () => ({ ok: true });
// @ts-expect-error The dispatcher enforces the registered route's required request context.
dispatchRouteRegistries(registries, { request });
void [assumedResponse, wrongLookup, incomplete, wrongVerifier, wrongToken, wrongJson, wrongRegistry];
