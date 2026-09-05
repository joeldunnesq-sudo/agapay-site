// Explicit test-only binding; production always uses the deployed Durable Object.
export function memoryRateLimiter() {
  const counters = new Map();
  return {
    idFromName: (name) => name,
    get: (key) => ({ async fetch(_url, options) {
      const { limit } = JSON.parse(options.body);
      const attempts = Math.min((counters.get(key) || 0) + 1, limit + 1);
      counters.set(key, attempts);
      return Response.json({ attempts });
    } }),
  };
}
