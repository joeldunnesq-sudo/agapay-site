const NON_PRODUCTION_ENVIRONMENTS = new Set(["development", "test", "staging", "preview"]);

export function parishLifeAvailableFor(env = {}) {
  const environment = String(env.AGAPAY_ENVIRONMENT || "").trim().toLowerCase();
  const explicitlyEnabled = String(env.AGAPAY_PARISH_LIFE_ENABLED || "").trim().toLowerCase() === "true";
  return explicitlyEnabled || NON_PRODUCTION_ENVIRONMENTS.has(environment);
}
