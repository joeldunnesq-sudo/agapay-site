// Generated from src/learn/access.ts by npm run build:server. Do not edit.
const LEARN_PRODUCT_SLUG = 'learn';
const LEARN_COOP_PRODUCT_SLUG = 'learn-coop';
function parseEnabledProducts(raw) {
  const source = String(raw || 'give,learn');
  return source
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
function enabledProductSlugs(env = {}) {
  return parseEnabledProducts(env.AGAPAY_ENABLED_PRODUCTS);
}
function learnProductEnabled(env = {}) {
  return enabledProductSlugs(env).includes(LEARN_PRODUCT_SLUG);
}
function learnCoOpEnabled(env = {}) {
  const slugs = enabledProductSlugs(env);
  return slugs.includes(LEARN_COOP_PRODUCT_SLUG) || slugs.includes('co-op');
}
function assertLearnEnabled(env = {}) {
  return learnProductEnabled(env)
    ? null
    : Response.json({ error: 'AGAPAY Learn is not enabled for this environment.' }, { status: 404 });
}
export {
  LEARN_COOP_PRODUCT_SLUG,
  LEARN_PRODUCT_SLUG,
  assertLearnEnabled,
  enabledProductSlugs,
  learnCoOpEnabled,
  learnProductEnabled,
};
