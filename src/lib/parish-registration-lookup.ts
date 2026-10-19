import type { StorageEnvironment } from './storage.js';

export type RegistrationLookupEnvironment = StorageEnvironment & {
  DB?: D1Database;
};
export interface StoredRegistrationLookup {
  key: string;
  registration: unknown;
}
export interface RegistrationLookupDependencies<TEnv extends RegistrationLookupEnvironment> {
  parishClosureState: (env: TEnv, parishId: string) => Promise<unknown>;
  d1First: (env: TEnv, sql: string, parishId: string) => Promise<{ reference: string; data?: unknown } | null>;
  parseJsonRow: (row: { reference: string; data?: unknown } | null) => unknown;
  listKvKeys: (env: TEnv, options: { limit: number }) => Promise<readonly { name: string }[]>;
  isSystemKvKey: (name: string) => boolean;
  parishIdIndexKey: (parishId: string) => string;
  parishSlug: (name: unknown, city?: unknown) => string;
}

// Legacy parsers may return arbitrary JSON. Keep it unknown until the API
// adapter establishes an object root and context normalization checks its fields.
export function createRegistrationLookup<TEnv extends RegistrationLookupEnvironment>({
  parishClosureState,
  d1First,
  parseJsonRow,
  listKvKeys,
  isSystemKvKey,
  parishIdIndexKey,
  parishSlug,
}: RegistrationLookupDependencies<TEnv>) {
  async function loadIndexedRegistration(env: TEnv, indexKey: string): Promise<StoredRegistrationLookup | null> {
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

  async function findRegistrationByParishId(env: TEnv, parishId: string): Promise<StoredRegistrationLookup | null> {
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
    const keys = await listKvKeys(env, { limit: 1000 });
    for (const key of keys) {
      if (isSystemKvKey(key.name)) continue;
      const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
      if (!raw) continue;
      try {
        const registration: unknown = JSON.parse(raw);
        // Null used to throw on property access and be caught below. Other JSON
        // primitives are boxed by JS; their named registration fields are absent.
        if (registration === null) continue;
        const fields = typeof registration === 'object' ? registration : {};
        const currentParishId =
          ('parishId' in fields && fields.parishId) ||
          parishSlug(
            'parishName' in fields ? fields.parishName : undefined,
            'city' in fields ? fields.city : undefined
          );
        if (currentParishId === parishId) {
          await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), key.name);
          return { key: key.name, registration };
        }
      } catch {
        // Ignore malformed records while searching.
      }
    }
    return null;
  }
  return { findRegistrationByParishId, loadIndexedRegistration };
}
