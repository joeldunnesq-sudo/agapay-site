export interface LearnProductEnvironment {
  AGAPAY_ENABLED_PRODUCTS?: unknown;
}
export const LEARN_PRODUCT_SLUG = 'learn';
export const LEARN_COOP_PRODUCT_SLUG = 'learn-coop';

function parseEnabledProducts(raw: unknown) {
  const source = String(raw || 'give,learn');
  return source
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function enabledProductSlugs(env: LearnProductEnvironment = {}) {
  return parseEnabledProducts(env.AGAPAY_ENABLED_PRODUCTS);
}

export function learnProductEnabled(env: LearnProductEnvironment = {}) {
  return enabledProductSlugs(env).includes(LEARN_PRODUCT_SLUG);
}

export function learnCoOpEnabled(env: LearnProductEnvironment = {}) {
  const slugs = enabledProductSlugs(env);
  return slugs.includes(LEARN_COOP_PRODUCT_SLUG) || slugs.includes('co-op');
}

export function assertLearnEnabled(env: LearnProductEnvironment = {}) {
  return learnProductEnabled(env)
    ? null
    : Response.json({ error: 'AGAPAY Learn is not enabled for this environment.' }, { status: 404 });
}
