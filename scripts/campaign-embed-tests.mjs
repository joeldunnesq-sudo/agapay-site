import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { applyGivingEmbedHeaders } from '../src/lib/core.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';

const env = { AGAPAY_TEST_MODE: '1', AGAPAY_RATE_LIMITER: memoryRateLimiter(), ASSETS: { async fetch(request) {
  assert.equal(new URL(request.url).pathname, '/give/parish-giving/index.html');
  return new Response('campaign', { headers: { 'Content-Type': 'text/html', 'X-Frame-Options': 'SAMEORIGIN' } });
} } };
const request = new Request('https://agapay.test/give/campaign-embed/test/roof');
const response = await worker.fetch(request, env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('X-Frame-Options'), null);
assert.equal(response.headers.get('Content-Security-Policy'), 'frame-ancestors *');
assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, indexifembedded');
assert.equal(response.headers.get('Cache-Control'), 'no-store');
for (const path of ['/parish/dashboard', '/give/test/roof-campaign', '/give/parish-giving/index.html', '/give/campaign-embed/test']) {
  const output = applyGivingEmbedHeaders(new Request('https://agapay.test' + path), new Response('private', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }));
  assert.equal(output.headers.get('X-Frame-Options'), 'SAMEORIGIN', path + ' remains protected');
}
console.log('PASS - campaign embed routes, framing isolation, private caching, and search indexing policy');
