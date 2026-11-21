import assert from 'node:assert/strict';
import { mock } from 'node:test';
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
  sleep: async () => {},
  fetchImpl: async (url) =>
    String(url).includes('/give/') ? new Response('down', { status: 503 }) : passingFetch(url),
  baseUrl: 'https://agapay.test',
  token: 'secret',
});
assert.equal(failed.ok, false);
assert.equal(failed.failedChecks[0].name, 'public-giving');
assert.equal(failed.sampleErrorRate, 1 / 6);

let clock = 0;
const timing = mock.method(performance, 'now', () => clock);
try {
  for (const scenario of ['brief-latency', 'persistent-latency', 'brief-503', 'persistent-unhealthy']) {
    let healthCalls = 0;
    const delays = [];
    const evidence = await runProductionMonitor({
      baseUrl: 'https://agapay.test',
      token: 'secret',
      sleep: async (ms) => delays.push(ms),
      fetchImpl: async (url, options) => {
        if (!String(url).endsWith('/api/health')) return passingFetch(url, options);
        healthCalls++;
        if (scenario === 'brief-503' && healthCalls === 1) return new Response('busy', { status: 503 });
        if (scenario === 'persistent-unhealthy') return Response.json({ ok: false });
        if (scenario === 'persistent-latency' || (scenario === 'brief-latency' && healthCalls === 1)) clock += 2594;
        return Response.json(health);
      },
    });
    const persistent = scenario.startsWith('persistent');
    assert.equal(evidence.ok, !persistent, scenario);
    assert.equal(evidence.checks[0].confirmations.length, persistent ? 2 : 1);
    assert.ok(evidence.checks[0].initialFailures.length);
    assert.equal(evidence.checks[0].latencyMs, scenario.includes('latency') ? 2594 : 0, 'original sample is preserved');
    assert.deepEqual(delays.slice(0, persistent ? 2 : 1), persistent ? [2000, 4000] : [2000]);
  }
} finally {
  timing.mock.restore();
}

console.log('PASS - production outside-in monitor contracts and failure accounting');
