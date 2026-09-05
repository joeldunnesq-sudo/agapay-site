import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { rateLimit, rateLimitByKey } from '../src/lib/core.js';

const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: `${readFileSync('src/operations/rate-limiter.js', 'utf8')}
export default { fetch() { return new Response('test'); } };`,
  compatibilityDate: '2026-05-25', durableObjects: { AGAPAY_RATE_LIMITER: { className: 'RateLimiter', useSQLite: true } }, cf: false, host: '127.0.0.1', port: 0 }));
try {
  const namespace = await runtime.getDurableObjectNamespace('AGAPAY_RATE_LIMITER');
  const env = { AGAPAY_RATE_LIMITER: namespace };
  const request = new Request('https://agapay.test', { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
  const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(request, env, 'concurrent', { limit: 1, windowSeconds: 300 })));
  assert.equal(results.filter((response) => response === null).length, 1);
  assert.equal(results.filter((response) => response?.status === 429).length, 19);
  assert.equal(await rateLimit(request, env, 'other-bucket', { limit: 1 }), null);
  assert.equal(await rateLimitByKey(request, env, 'account', ' TEST@example.com ', { limit: 1 }), null);
  assert.equal((await rateLimitByKey(request, env, 'account', 'test@example.com', { limit: 1 })).status, 429);
  assert.equal((await rateLimit(request, {}, 'unconfigured')).status, 503);
  assert.equal((await rateLimit(request, { AGAPAY_RATE_LIMITER: { idFromName() { throw new Error('down'); } } }, 'down')).status, 503);
  console.log('PASS - real Durable Object concurrent counters, key normalization, bucket isolation, and fail-closed behavior');
} finally { await runtime.dispose(); }
