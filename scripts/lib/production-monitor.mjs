const DEFAULT_TIMEOUT_MS = 8_000;
const healthOkay = (payload) =>
  payload?.ok === true && payload?.checks?.d1?.ok === true && payload?.checks?.kv?.ok === true;
const canaryOkay = (payload) =>
  payload?.ok === true &&
  payload?.bindings?.d1 === true &&
  payload?.bindings?.kv === true &&
  payload?.bindings?.accountingBackups === true &&
  payload?.scheduler?.ok === true;

async function timedFetch(fetchImpl, url, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return {
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      payload,
      bodyPreview: text.slice(0, 200),
    };
  } catch (error) {
    return {
      status: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error?.message || String(error),
    };
  }
}

function evaluate(name, result, { maxLatencyMs, validate }) {
  const failures = [];
  if (result.status !== 200) failures.push(`HTTP ${result.status || 'error'}`);
  if (result.latencyMs > maxLatencyMs) failures.push(`latency ${result.latencyMs}ms exceeds ${maxLatencyMs}ms`);
  if (result.status === 200 && validate && !validate(result.payload)) failures.push('response contract failed');
  return { name, ...result, maxLatencyMs, ok: failures.length === 0, failures };
}

export async function runProductionMonitor({
  fetchImpl = fetch,
  baseUrl,
  token,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const target = String(baseUrl).replace(/\/+$/, '');
  const healthSamples = [];
  for (let sample = 0; sample < 3; sample += 1) {
    healthSamples.push(
      evaluate(`health-${sample + 1}`, await timedFetch(fetchImpl, `${target}/api/health`), {
        maxLatencyMs: 2_500,
        validate: healthOkay,
      })
    );
  }
  const checks = [
    ...healthSamples,
    evaluate('parish-dashboard', await timedFetch(fetchImpl, `${target}/parish/dashboard`), { maxLatencyMs: 4_000 }),
    evaluate('public-giving', await timedFetch(fetchImpl, `${target}/give/st-fiacre`), { maxLatencyMs: 4_000 }),
    evaluate(
      'authenticated-canary',
      await timedFetch(fetchImpl, `${target}/api/operations/canary`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      {
        maxLatencyMs: 2_500,
        validate: canaryOkay,
      }
    ),
  ];
  // Confirm failures with fresh read-only requests before paging. Preserve
  // original evidence; repeated HTTP, contract, or latency failures still alert.
  for (const check of checks) {
    if (check.ok) continue;
    const path = check.name.startsWith('health-')
      ? '/api/health'
      : check.name === 'parish-dashboard'
        ? '/parish/dashboard'
        : check.name === 'public-giving'
          ? '/give/st-fiacre'
          : '/api/operations/canary';
    check.initialFailures = [...check.failures];
    check.confirmations = [];
    for (const delayMs of [2_000, 4_000]) {
      await sleep(delayMs);
      const result = await timedFetch(
        fetchImpl,
        `${target}${path}`,
        check.name === 'authenticated-canary' ? { headers: { authorization: `Bearer ${token}` } } : {}
      );
      const confirmation = evaluate(`${check.name}-confirmation`, result, {
        maxLatencyMs: check.maxLatencyMs,
        validate: check.name.startsWith('health-')
          ? healthOkay
          : check.name === 'authenticated-canary'
            ? canaryOkay
            : undefined,
      });
      check.confirmations.push(confirmation);
      check.ok = confirmation.ok;
      check.failures = confirmation.ok ? [] : confirmation.failures;
      if (check.ok) break;
    }
  }
  const failures = checks.filter((check) => !check.ok);
  return {
    checkedAt: new Date().toISOString(),
    baseUrl: target,
    ok: failures.length === 0,
    sampleErrorRate: failures.length / checks.length,
    checks,
    failedChecks: failures.map((check) => ({ name: check.name, failures: check.failures })),
  };
}
