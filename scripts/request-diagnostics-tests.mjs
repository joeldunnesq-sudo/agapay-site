import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { withRequestDiagnostics } from '../src/lib/request-diagnostics.js';
import { logEvent } from '../src/lib/logging.js';
import { contactTestStore } from './lib/contact-test-store.mjs';

const logs = [];
const originalLog = console.log,
  originalError = console.error;
console.log = console.error = (line) => logs.push(JSON.parse(line));
const env = {
  AGAPAY_BUILD_SHA: 'test-release',
  AGAPAY_ENVIRONMENT: 'production',
  AGAPAY_CORS_ORIGIN: 'https://agapay.test',
};
try {
  const boundary = withRequestDiagnostics({
    async fetch(request) {
      await new Promise((resolve) => setTimeout(resolve, request.method === 'GET' ? 12 : 1));
      await logEvent(env, { eventType: 'local.failure', requestId: 'caller-cannot-replace-request-id' });
      if (request.method === 'POST') throw new TypeError('PRIVATE_PASSWORD query-token');
      return new Response('streamed response', {
        status: 503,
        headers: {
          'Retry-After': '30',
          'Set-Cookie': 'session=value; HttpOnly',
          'Access-Control-Expose-Headers': 'ETag',
        },
      });
    },
  });
  const [a, b] = await Promise.all([
    boundary.fetch(
      new Request('https://agapay.test/api/parish/private-email@example.test?token=secret', {
        headers: { 'X-Request-ID': 'untrusted-id' },
      }),
      env
    ),
    boundary.fetch(new Request('https://agapay.test/api/contact?token=secret', { method: 'POST' }), env),
  ]);
  const idA = a.headers.get('X-Request-ID'),
    idB = b.headers.get('X-Request-ID');
  assert.match(idA, /^[a-f0-9-]{36}$/);
  assert.notEqual(idA, idB);
  assert.equal(a.status, 503);
  assert.equal(a.headers.get('Retry-After'), '30');
  assert.equal(a.headers.get('Set-Cookie'), 'session=value; HttpOnly');
  assert.equal(a.headers.get('Access-Control-Expose-Headers'), 'ETag, X-Request-ID');
  assert.equal(await a.text(), 'streamed response');
  assert.equal(b.status, 500);
  assert.equal((await b.json()).requestId, idB);
  assert.equal(b.headers.get('Access-Control-Allow-Origin'), 'https://agapay.test');
  assert.match(b.headers.get('Cache-Control'), /no-store/);
  for (const [id, route] of [
    [idA, '/api/parish/*'],
    [idB, '/api/contact'],
  ]) {
    const events = logs.filter((x) => x.requestId === id);
    assert.equal(events.length, 2);
    assert.ok(events.every((x) => x.route === route && x.deploymentVersion === 'test-release' && x.durationMs >= 0));
  }
  assert.equal(
    logs.find((x) => x.requestId === idB && x.eventType === 'request.failed').metadata.errorClass,
    'type_error'
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /PRIVATE_PASSWORD|private-email|query-token|untrusted-id|\?token|caller-cannot/
  );

  // Exercise real Worker routes and early returns, not just the wrapper fixture.
  const { db, env: contactEnv } = contactTestStore();
  try {
    for (const [path, method, status] of [
      ['/api/contact', 'GET', 405],
      ['/api/contact', 'POST', 400],
      ['/api/contact', 'OPTIONS', 204],
      ['/api/admin/contact-leads', 'GET', 401],
    ]) {
      const r = await worker.fetch(
        new Request(`https://agapay.test${path}`, { method, ...(method === 'POST' ? { body: '{}' } : {}) }),
        contactEnv,
        {}
      );
      assert.equal(r.status, status);
      assert.ok(r.headers.get('X-Request-ID'));
    }
    const failedEnv = {
      ...contactEnv,
      AGAPAY_DB: {
        prepare() {
          throw new Error('secret database details');
        },
      },
    };
    const r = await worker.fetch(
      new Request('https://agapay.test/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', email: 'test@example.test', message: 'test' }),
      }),
      failedEnv,
      {}
    );
    assert.ok(r.status >= 500);
    assert.ok(logs.some((x) => x.requestId === r.headers.get('X-Request-ID') && x.eventType === 'request.failed'));
    assert.doesNotMatch(JSON.stringify(logs), /secret database details/);
  } finally {
    db.close();
  }
  const redirect = await worker.fetch(new Request('https://agapay.test/index.html'), {}, {});
  assert.equal(redirect.status, 301);
  assert.ok(redirect.headers.get('X-Request-ID'));
  assert.equal(redirect.headers.get('Location'), 'https://agapay.test/');
} finally {
  console.log = originalLog;
  console.error = originalError;
}
console.log(
  'PASS - real Worker request references, concurrent log isolation, safe failures, CORS, response preservation, and redirects'
);
