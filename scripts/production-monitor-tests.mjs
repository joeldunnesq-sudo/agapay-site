import assert from 'node:assert/strict';
import { runProductionMonitor } from './lib/production-monitor.mjs';

const health = { ok: true, checks: { d1: { ok: true }, kv: { ok: true } } };
const canary = {
  ok: true,
  bindings: { d1: true, kv: true, accountingBackups: true },
  scheduler: { ok: true },
};
const calls = [];
const passingFetch = async (url, options = {}) => {
  calls.push({ url: String(url), authorization: options.headers?.authorization || '' });
  const payload = String(url).endsWith('/api/health')
    ? health
    : String(url).endsWith('/api/operations/canary')
      ? canary
      : null;
  return new Response(payload ? JSON.stringify(payload) : '<html>ok</html>', {
    status: 200,
    headers: { 'content-type': payload ? 'application/json' : 'text/html' },
  });
};
const passed = await runProductionMonitor({
  fetchImpl: passingFetch,
  baseUrl: 'https://agapay.test/',
  token: 'secret',
});
assert.equal(passed.ok, true);
assert.equal(passed.checks.length, 6);
assert.equal(passed.sampleErrorRate, 0);
assert.equal(calls.filter((call) => call.url.endsWith('/api/health')).length, 3);
assert.equal(calls.find((call) => call.url.endsWith('/api/operations/canary')).authorization, 'Bearer secret');

const failed = await runProductionMonitor({
  fetchImpl: async (url) =>
    String(url).includes('/give/') ? new Response('down', { status: 503 }) : passingFetch(url),
  baseUrl: 'https://agapay.test',
  token: 'secret',
});
assert.equal(failed.ok, false);
assert.equal(failed.failedChecks[0].name, 'public-giving');
assert.equal(failed.sampleErrorRate, 1 / 6);

console.log('PASS - production outside-in monitor contracts and failure accounting');
