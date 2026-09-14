import assert from 'node:assert/strict';
import { rateLimit, rateLimitByKey } from '../src/lib/core.js';
import { memoryRateLimiter, withFixedRateLimitClock } from './lib/memory-rate-limiter.mjs';

const originalNow = Date.now;
await assert.rejects(
  withFixedRateLimitClock(async () => {
    assert.equal(Date.now(), 59999);
    throw new Error('test failure');
  }, 59999),
  /test failure/
);
assert.equal(Date.now, originalNow, 'Failed tests restore the original clock');

for (const byAccount of [false, true]) {
  const env = { AGAPAY_RATE_LIMITER: memoryRateLimiter() };
  const req = new Request('https://agapay.test', { headers: { 'CF-Connecting-IP': '198.51.100.1' } });
  const attempt = () =>
    byAccount
      ? rateLimitByKey(req, env, 'clock-test', 'member@example.test', { limit: 2, windowSeconds: 60 })
      : rateLimit(req, env, 'clock-test', { limit: 2, windowSeconds: 60 });
  await withFixedRateLimitClock(async () => {
    assert.equal(await attempt(), null);
    assert.equal(await attempt(), null);
    assert.equal((await attempt()).status, 429);
    assert.equal((await attempt()).headers.get('Retry-After'), '60');
  }, 59999);
  await withFixedRateLimitClock(async () => {
    assert.equal(await attempt(), null, 'A new window resets the limit');
  }, 60000);
}
assert.equal(Date.now, originalNow);
console.log(
  'PASS - deterministic clocks enforce account/IP limits, reset at window boundaries, and restore after failure'
);
