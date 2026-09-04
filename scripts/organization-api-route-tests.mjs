import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ORGANIZATION_API_ACCESS_REASONS, evaluateOrganizationApiAccess } from '../src/organizations/api-policy.js';
import { organizationContextFromRegistration } from '../src/organizations/context.js';
import { parseOrganizationApiRoute, routeOrganizationRequest } from '../src/routes/organization.js';

function responseJson(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
}

function routeContext(path, { method = 'GET', registration = null, authorized = true } = {}) {
  const request = new Request(`https://agapay.test${path}`, {
    method,
    headers: { Authorization: 'Bearer church-session' },
  });
  const calls = { lookups: [], authorizations: 0 };
  const actions = {
    findRegistrationByParishId: async (_env, organizationId) => {
      calls.lookups.push(organizationId);
      return registration ? { key: 'registration-ref', registration } : null;
    },
    getBearerToken: (incomingRequest) => incomingRequest.headers.get('Authorization')?.slice('Bearer '.length) || '',
    json: responseJson,
    unauthorized: () => responseJson({ error: 'Unauthorized' }, { status: 401 }),
    verifyParishDashboardBearer: async (foundRegistration, token) => {
      calls.authorizations += 1;
      assert.equal(foundRegistration, registration);
      assert.equal(token, 'church-session');
      return authorized;
    },
  };
  return { request, env: {}, url: new URL(request.url), actions, calls };
}

assert.equal(parseOrganizationApiRoute('/api/parish/dashboard/demo'), null);
assert.deepEqual(parseOrganizationApiRoute('/api/v1/organizations/st%20fiacre'), {
  matched: true,
  organizationId: 'st fiacre',
});
assert.equal(parseOrganizationApiRoute('/api/v1/organizations').organizationId, '');
assert.equal(parseOrganizationApiRoute('/api/v1/organizations/demo/modules').organizationId, '');
assert.equal(parseOrganizationApiRoute('/api/v1/organizations/demo%2Fother').organizationId, '');
assert.equal(parseOrganizationApiRoute('/api/v1/organizations/%E0%A4%A').organizationId, '');

const churchRegistration = {
  parishId: 'st fiacre',
  parishName: 'St. Fiacre Orthodox Church',
  communityType: 'Parish',
  contactEmail: 'private@example.test',
  stripeAccountId: 'acct_private',
  taxLegalName: 'Private Legal Name',
};
const churchContext = organizationContextFromRegistration(churchRegistration);
assert.equal(evaluateOrganizationApiAccess(churchContext).allowed, true);
assert.equal(
  evaluateOrganizationApiAccess(churchContext, 'v2').reason,
  ORGANIZATION_API_ACCESS_REASONS.VERSION_UNSUPPORTED
);

const active = routeContext('/api/v1/organizations/st%20fiacre', { registration: churchRegistration });
const activeResponse = await routeOrganizationRequest(active);
assert.equal(activeResponse.status, 200);
assert.equal(activeResponse.headers.get('Cache-Control'), 'private, no-store');
assert.deepEqual(active.calls.lookups, ['st fiacre']);
assert.equal(active.calls.authorizations, 1);
const activeBody = await activeResponse.json();
assert.deepEqual(activeBody, {
  apiVersion: 'v1',
  organization: {
    id: 'st fiacre',
    type: 'church',
    subtype: 'parish',
    displayName: 'St. Fiacre Orthodox Church',
    terminologyProfileId: 'parish',
    moduleProfileId: 'church',
  },
  compatibility: { legacyTenantField: 'parishId', legacyParishId: 'st fiacre' },
});
const serializedBody = JSON.stringify(activeBody);
for (const privateValue of ['private@example.test', 'acct_private', 'Private Legal Name', 'registration-ref']) {
  assert.ok(!serializedBody.includes(privateValue), `Organization descriptor leaked ${privateValue}`);
}

const legacy = routeContext('/api/v1/organizations/legacy', {
  registration: { parishId: 'legacy', parishName: 'Legacy Parish' },
});
assert.equal((await routeOrganizationRequest(legacy)).status, 200);

const unauthorized = routeContext('/api/v1/organizations/st%20fiacre', {
  registration: churchRegistration,
  authorized: false,
});
assert.equal((await routeOrganizationRequest(unauthorized)).status, 401);

const dormant = routeContext('/api/v1/organizations/ministry-1', {
  registration: { parishId: 'ministry-1', parishName: 'Dormant Ministry', communityType: 'Ministry' },
});
assert.equal((await routeOrganizationRequest(dormant)).status, 404);
assert.equal(dormant.calls.authorizations, 0, 'Dormant types must fail closed before legacy session authorization');

const mismatch = routeContext('/api/v1/organizations/requested-id', {
  registration: { parishId: 'different-id', parishName: 'Different Tenant' },
});
assert.equal((await routeOrganizationRequest(mismatch)).status, 404);
assert.equal(mismatch.calls.authorizations, 0);

const missing = routeContext('/api/v1/organizations/missing');
assert.equal((await routeOrganizationRequest(missing)).status, 404);

const method = routeContext('/api/v1/organizations/st%20fiacre', {
  method: 'PATCH',
  registration: churchRegistration,
});
const methodResponse = await routeOrganizationRequest(method);
assert.equal(methodResponse.status, 405);
assert.equal(methodResponse.headers.get('Allow'), 'GET');
assert.equal(method.calls.lookups.length, 0);

const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const workerActions = await readFile(new URL('../src/routes/worker-actions.js', import.meta.url), 'utf8');
const registry = worker.slice(worker.indexOf('const API_ROUTE_REGISTRIES'));
assert.ok(registry.indexOf('routeOrganizationRequest') < registry.indexOf('routePublicRequest'));
for (const dependency of [
  'findRegistrationByParishId',
  'getBearerToken',
  'unauthorized',
  'verifyParishDashboardBearer',
]) {
  assert.match(workerActions.slice(workerActions.indexOf('const ROUTE_ACTIONS')), new RegExp(`\\b${dependency},`));
}

console.log('PASS - versioned organization API route is authenticated, bounded, and dormant-type closed');
