import assert from 'node:assert/strict';
import * as core from '../src/lib/core.js';
import { json, corsJson, corsHeaders, corsPreflightResponse, SECURITY_HEADERS } from '../src/lib/http-responses.js';
import { withRequestDiagnostics } from '../src/lib/request-diagnostics.js';

for (const [name, value] of Object.entries({ json, corsJson, corsHeaders, corsPreflightResponse, SECURITY_HEADERS })) {
  assert.equal(core[name], value, `${name} compatibility export preserves identity`);
}
const response = json(
  { value: '<text>' },
  { status: 202, statusText: 'Accepted', headers: { 'Cache-Control': 'private', 'X-Test': 'kept' } }
);
assert.equal(response.status, 202);
assert.equal(response.statusText, 'Accepted');
assert.equal(response.headers.get('cache-control'), 'private');
assert.equal(response.headers.get('x-test'), 'kept');
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(response.headers.get('content-type'), 'application/json');
assert.deepEqual(await response.json(), { value: '<text>' });
assert.equal(json({}).headers.get('cache-control'), 'no-store');
assert.equal(
  json({}, { headers: new Headers({ 'X-Test': 'ignored' }) }).headers.get('x-test'),
  null,
  'Legacy Headers spread behavior is preserved'
);
assert.throws(() => json(1n), TypeError);
assert.throws(() => json({}, { status: 204 }), TypeError);
for (const env of [undefined, null, {}, { AGAPAY_ENVIRONMENT: 'staging' }])
  assert.equal(corsHeaders(env)['Access-Control-Allow-Origin'], '*');
assert.equal(corsHeaders({ AGAPAY_ENVIRONMENT: ' PRODUCTION ' })['Access-Control-Allow-Origin'], undefined);
assert.equal(
  corsHeaders({ AGAPAY_ENVIRONMENT: 'production', AGAPAY_CORS_ORIGIN: ' https://example.test ' })[
    'Access-Control-Allow-Origin'
  ],
  'https://example.test'
);
const cors = corsJson(
  {},
  { AGAPAY_ENVIRONMENT: 'production' },
  { headers: { 'Access-Control-Allow-Origin': 'https://override.test', 'X-Frame-Options': 'DENY' } }
);
assert.equal(cors.headers.get('access-control-allow-origin'), 'https://override.test');
assert.equal(cors.headers.get('x-frame-options'), 'DENY');
assert.equal(cors.headers.get('cache-control'), 'no-store');
const preflight = corsPreflightResponse({ AGAPAY_ENVIRONMENT: 'production' });
assert.equal(preflight.status, 204);
assert.equal(await preflight.text(), '');
assert.equal(preflight.headers.get('access-control-allow-origin'), null);
assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
assert.equal(preflight.headers.get('access-control-max-age'), '86400');
assert.equal(preflight.headers.get('cache-control'), null, 'Preserve preflight header set');

const env = { AGAPAY_BUILD_SHA: 'test' };
const ctx = {};
let forwarded;
const scheduled = () => 'scheduled';
const handler = {
  marker: 'preserved',
  scheduled,
  fetch(request, environment, context) {
    forwarded = { request, environment, context, receiver: this };
    return new Response('sync response', { headers: { 'X-Request-ID': 'caller-supplied' } });
  },
};
const wrapped = withRequestDiagnostics(handler);
const request = new Request('https://example.test/api/health');
const result = await wrapped.fetch(request, env, ctx);
assert.equal(await result.text(), 'sync response');
assert.notEqual(result.headers.get('x-request-id'), 'caller-supplied');
assert.equal(result.headers.get('access-control-expose-headers'), 'X-Request-ID');
assert.equal(wrapped.scheduled, scheduled);
assert.equal(wrapped.marker, 'preserved');
assert.deepEqual(forwarded, { request, environment: env, context: ctx, receiver: handler });
console.log(
  'PASS - HTTP compatibility exports, header precedence, CORS defaults, serialization failures, and diagnostic handler forwarding'
);
