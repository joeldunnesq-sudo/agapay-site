// Generated from src/lib/parish-registration-lookup.ts by npm run build:server. Do not edit.
function createRegistrationLookup({
  parishClosureState,
  d1First,
  parseJsonRow,
  listKvKeys,
  isSystemKvKey,
  parishIdIndexKey,
  parishSlug,
}) {
  async function loadIndexedRegistration(env, indexKey) {
    if (!env.AGAPAY_REGISTRATIONS || !indexKey) return null;
    const reference = await env.AGAPAY_REGISTRATIONS.get(indexKey);
    if (!reference) return null;
    const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
    if (!raw) return null;
    try {
      return { key: reference, registration: JSON.parse(raw) };
    } catch {
      return null;
    }
  }
  async function findRegistrationByParishId(env, parishId) {
    if (await parishClosureState(env, parishId)) return null;
    if (env.AGAPAY_DB || env.DB || null) {
      const row = await d1First(
        env,
        `SELECT reference, data FROM registrations
       WHERE parish_id = ?1
       ORDER BY COALESCE(json_extract(data, '$.updatedAt'), updated_at, received_at) DESC, updated_at DESC, reference DESC
       LIMIT 1`,
        parishId
      );
      const registration = parseJsonRow(row);
      if (registration && row) return { key: row.reference, registration };
    }
    if (!env.AGAPAY_REGISTRATIONS) return null;
    const indexed = await loadIndexedRegistration(env, parishIdIndexKey(parishId));
    if (indexed) return indexed;
    const keys = await listKvKeys(env, { limit: 1e3 });
    for (const key of keys) {
      if (isSystemKvKey(key.name)) continue;
      const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
      if (!raw) continue;
      try {
        const registration = JSON.parse(raw);
        if (registration === null) continue;
        const fields = typeof registration === 'object' ? registration : {};
        const currentParishId =
          ('parishId' in fields && fields.parishId) ||
          parishSlug('parishName' in fields ? fields.parishName : void 0, 'city' in fields ? fields.city : void 0);
        if (currentParishId === parishId) {
          await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), key.name);
          return { key: key.name, registration };
        }
      } catch {}
    }
    return null;
  }
  return { findRegistrationByParishId, loadIndexedRegistration };
}
export { createRegistrationLookup };
