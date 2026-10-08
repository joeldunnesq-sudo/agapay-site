// Generated from src/lib/parish-life-access.ts by npm run build:server. Do not edit.
const NON_PRODUCTION_ENVIRONMENTS = /* @__PURE__ */ new Set(['development', 'test', 'staging', 'preview']);
function parishLifeAvailableFor(env = {}) {
  const environment = String(env.AGAPAY_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  const explicitlyEnabled =
    String(env.AGAPAY_PARISH_LIFE_ENABLED || '')
      .trim()
      .toLowerCase() === 'true';
  return explicitlyEnabled || NON_PRODUCTION_ENVIRONMENTS.has(environment);
}
export { parishLifeAvailableFor };
