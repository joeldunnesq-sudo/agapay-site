// Explicit test-only binding; production always uses the deployed Durable Object.
// Scope only Date.now: these sequential request tests must not cross a real
// rate-limit window. Always restore the clock, including on assertion failures.
export async function withFixedRateLimitClock(run, now = Date.now()) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
}

export function memoryRateLimiter() {
  const counters = new Map();
  return {
    idFromName: (name) => name,
    get: (key) => ({
      async fetch(_url, options) {
        const { limit } = JSON.parse(options.body);
        const attempts = Math.min((counters.get(key) || 0) + 1, limit + 1);
        counters.set(key, attempts);
        return Response.json({ attempts });
      },
    }),
  };
}
