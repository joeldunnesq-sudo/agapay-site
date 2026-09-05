import assert from 'node:assert/strict';
import { sendEmail } from '../src/lib/email.js';

const originalFetch = globalThis.fetch,
  originalSetTimeout = globalThis.setTimeout,
  originalError = console.error;
const logs = [],
  delays = [],
  requests = [];
const env = { RESEND_API_KEY: 'test-only-key' };
const message = { to: ['test@example.test'], subject: 'Test' };
console.error = (line) => logs.push(JSON.parse(line));
// Retain real abort behavior, accelerating deadlines so CI never waits 10s per case.
globalThis.setTimeout = (fn, ms, ...args) => {
  delays.push(ms);
  return originalSetTimeout(fn, Math.min(ms, 10), ...args);
};
try {
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener('abort', () => reject(new DOMException('sensitive timeout message', 'AbortError')), {
        once: true,
      })
    );
  };
  for (const override of [undefined, 0, -1, NaN, Infinity, 'unbounded', 50, 999999]) {
    const result = await sendEmail(env, message, override === undefined ? {} : { timeoutMs: override });
    assert.equal(result.status, 'error');
    assert.equal(result.errorCode, 'timeout');
    assert.match(result.detail, /unconfirmed/);
  }
  assert.deepEqual(delays, [10000, 10000, 10000, 10000, 10000, 10000, 50, 30000]);
  assert.equal(requests.length, 8, 'timeouts must not trigger blind automatic resends');
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    return {
      ok: true,
      status: 200,
      text: () =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('body stalled')), { once: true })
        ),
    };
  };
  assert.equal((await sendEmail(env, message)).errorCode, 'timeout', 'deadline must include provider body reading');
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    return new Response('{"id":"provider-id"}');
  };
  assert.equal((await sendEmail(env, message, { idempotencyKey: 'stable-key' })).status, 'sent');
  assert.equal(requests.at(-1).headers['Idempotency-Key'], 'stable-key');
  const successfulSignal = requests.at(-1).signal;
  await new Promise((resolve) => originalSetTimeout(resolve, 20));
  assert.equal(successfulSignal.aborted, false, 'completed sends must clear their deadline timer');
  globalThis.fetch = async () => {
    throw new Error('private-network-details');
  };
  assert.equal((await sendEmail(env, message)).errorCode, 'network_error');
  globalThis.fetch = async () => new Response('{"message":"private-provider-details"}', { status: 429 });
  const rejected = await sendEmail(env, message);
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.httpStatus, 429);
  assert.equal(rejected.errorCode, 'provider_rejected');
  assert.equal((await sendEmail({}, message)).status, 'not_configured');
  assert.doesNotMatch(
    JSON.stringify(logs),
    /test@example|test-only-key|private-network|private-provider|sensitive timeout|stable-key/
  );
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  console.error = originalError;
}
console.log(
  'PASS - default and overridden email deadlines, body-read timeout, timer cleanup, safe failure classification and idempotency'
);
