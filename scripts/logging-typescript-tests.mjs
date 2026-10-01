import assert from 'node:assert/strict';
import { requestContext, safeErrorClass, safeRequestRoute } from '../src/lib/request-context.js';
import { sanitize, sanitizedErrorMessage, logEvent } from '../src/lib/logging.js';

let getterCalls = 0;
const source = { safe: 'kept', password: 'private', nested: { api_key: 'private', count: 2 } };
Object.defineProperty(source, 'accessor', {
  enumerable: true,
  get() {
    getterCalls++;
    throw new Error('private');
  },
});
source.self = source;
const sanitized = sanitize(source);
assert.equal(Object.getPrototypeOf(sanitized), null);
assert.equal(sanitized.password, '[redacted]');
assert.equal(sanitized.nested.api_key, '[redacted]');
assert.equal(sanitized.accessor, '[accessor]');
assert.equal(sanitized.self, '[circular]');
assert.equal(getterCalls, 0);
assert.deepEqual(sanitize([NaN, Infinity, 1n, undefined, Symbol('private')]), [null, null, '1', null, '[unsupported]']);
assert.equal(sanitize('x'.repeat(1100)).length, 1000);
assert.equal(sanitize('kept', 5), '[truncated]');
assert.equal(Object.keys(sanitize(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, i])))).length, 50);
assert.equal(
  sanitize(
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('private');
        },
      }
    )
  ),
  '[unavailable]'
);
const shared = { value: 'reused' };
assert.equal(sanitize({ one: shared, two: shared }).two.value, 'reused', 'Repeated siblings are not cycles');
assert.equal(sanitizedErrorMessage(new Error('x'.repeat(501))), 'x'.repeat(500) + '…');
assert.equal(sanitizedErrorMessage('message'), 'message');
assert.equal(sanitizedErrorMessage(null), 'Unknown error');
for (const [name, expected] of [
  ['TimeoutError', 'timeout'],
  ['AbortError', 'timeout'],
  ['SyntaxError', 'invalid_data'],
  ['TypeError', 'type_error'],
  ['RangeError', 'range_error'],
  ['PrivateError', 'unexpected_error'],
]) {
  assert.equal(safeErrorClass({ name }), expected);
}
assert.equal(
  safeErrorClass({
    get name() {
      throw new Error('private');
    },
  }),
  'unexpected_error'
);
for (const [path, expected] of [
  ['/api/parish/private-id?token=private', '/api/parish/*'],
  ['/api/contact', '/api/contact'],
  ['/api/contact/private', '/api/*'],
  ['/api/unknown/private', '/api/*'],
  ['/private?token=private', '/assets/*'],
]) {
  assert.equal(safeRequestRoute(new Request('https://example.test' + path)), expected);
}

const originalLog = console.log;
const originalError = console.error;
const output = [];
console.log = (line) => output.push({ sink: 'log', line: JSON.parse(line) });
console.error = (line) => output.push({ sink: 'error', line: JSON.parse(line) });
try {
  const context = {
    requestId: 'outer',
    route: '/api/parish/*',
    method: 'POST',
    startedAt: Date.now(),
    deploymentVersion: 'release',
  };
  await requestContext.run(context, async () => {
    await requestContext.run({ ...context, requestId: 'inner' }, async () => {
      await Promise.resolve();
      await logEvent({}, { eventType: 'nested', severity: 'warn', requestId: 'ignored', metadata: source });
    });
    assert.equal(requestContext.getStore().requestId, 'outer');
    await logEvent({}, { eventType: 'outer' });
  });
  assert.equal(requestContext.getStore(), undefined);
  assert.equal(output[0].line.requestId, 'inner');
  assert.equal(output[0].line.deploymentVersion, 'release');
  assert.equal(output[0].sink, 'error');
  assert.equal(output[1].line.requestId, 'outer');
  assert.equal(output[1].sink, 'log');
  assert.doesNotMatch(JSON.stringify(output), /private|ignored/);
  await logEvent(
    {},
    { metadata: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, '界'.repeat(1000)])) }
  );
  assert.equal(output.at(-1).line.metadata, '[truncated: log size limit]');
  assert.ok(Buffer.byteLength(JSON.stringify(output.at(-1).line)) <= 16000);
  const hostile = {
    get eventType() {
      throw new Error('private');
    },
  };
  assert.equal((await logEvent({}, hostile)).eventType, 'logging.failed');
  console.log = console.error = () => {
    throw new Error('sink unavailable');
  };
  assert.equal((await logEvent({}, { eventType: 'ordinary' })).eventType, 'logging.failed');
} finally {
  console.log = originalLog;
  console.error = originalError;
}
console.log(
  'PASS - typed logging preserves redaction, bounded metadata, request scope, route privacy, sinks, and failure fallback'
);
