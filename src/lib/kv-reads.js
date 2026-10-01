// Generated from src/lib/kv-reads.ts by npm run build:server. Do not edit.
const DONOR_OFFERING_KEY_PREFIX = '__agapay_donor_offering__';
async function listKvKeys(env, { prefix = '', limit = 1e3, pageSize = 100 } = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = [];
  let cursor;
  do {
    const page = await env.AGAPAY_REGISTRATIONS.list({
      prefix,
      limit: Math.min(pageSize, Math.max(1, limit - keys.length)),
      cursor,
    });
    keys.push(...page.keys);
    cursor = page.list_complete || keys.length >= limit ? void 0 : page.cursor;
  } while (cursor && keys.length < limit);
  return keys;
}
export { DONOR_OFFERING_KEY_PREFIX, listKvKeys };
