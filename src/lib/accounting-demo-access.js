export const ACCOUNTING_DEMO_PARISH_ID = "st-fiacre";

const NON_PRODUCTION_ENVIRONMENTS = new Set(["development", "test", "staging", "preview"]);

function normalizedParishIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function accountingAvailableForParish(parishId, env = {}) {
  const normalized = String(parishId || "").trim().toLowerCase();
  if (normalized === ACCOUNTING_DEMO_PARISH_ID) return true;

  // Fail closed: production and an unspecified environment can never widen
  // Accounting beyond the production demo parish.
  const environment = String(env.AGAPAY_ENVIRONMENT || "").trim().toLowerCase();
  if (!NON_PRODUCTION_ENVIRONMENTS.has(environment)) return false;
  return normalizedParishIds(env.ACCOUNTING_TEST_PARISH_IDS).includes(normalized);
}
