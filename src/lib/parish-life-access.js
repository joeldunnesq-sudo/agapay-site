const NON_PRODUCTION_ENVIRONMENTS = new Set(["development", "test", "staging", "preview"]);

export function parishLifeAvailableFor(env = {}) {
  const environment = String(env.AGAPAY_ENVIRONMENT || "").trim().toLowerCase();
  return NON_PRODUCTION_ENVIRONMENTS.has(environment);
}
