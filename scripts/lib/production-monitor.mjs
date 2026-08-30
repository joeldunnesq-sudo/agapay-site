const DEFAULT_TIMEOUT_MS = 8_000;

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
  if (!failures.length && validate && !validate(result.payload)) failures.push('response contract failed');
  return { name, ...result, maxLatencyMs, ok: failures.length === 0, failures };
}

export async function runProductionMonitor({ fetchImpl = fetch, baseUrl, token }) {
  const target = String(baseUrl).replace(/\/+$/, '');
  const healthSamples = [];
  for (let sample = 0; sample < 3; sample += 1) {
    healthSamples.push(
      evaluate(`health-${sample + 1}`, await timedFetch(fetchImpl, `${target}/api/health`), {
        maxLatencyMs: 2_500,
        validate: (payload) =>
          payload?.ok === true && payload?.checks?.d1?.ok === true && payload?.checks?.kv?.ok === true,
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
        validate: (payload) =>
          payload?.ok === true &&
          payload?.bindings?.d1 === true &&
          payload?.bindings?.kv === true &&
          payload?.bindings?.accountingBackups === true &&
          payload?.scheduler?.ok === true,
      }
    ),
  ];
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
