import type { RegistrationLookup } from '../organizations/context.js';
import type { RegistrationRecord } from '../organizations/types.js';
import type { StoredRegistrationLookup } from '../lib/parish-registration-lookup.js';

// Raw storage JSON remains unknown. Only the root object shape is established
// here; context normalization continues to check tenant identity and field values.
export function organizationRegistrationLookup<TEnv>(
  lookup: (env: TEnv, id: string) => Promise<StoredRegistrationLookup | null>
): RegistrationLookup<TEnv, RegistrationRecord> {
  return async (env, id) => {
    const found = await lookup(env, id);
    if (!found || !isRegistrationRecord(found.registration)) return null;
    return { key: found.key, registration: found.registration };
  };
}

function isRegistrationRecord(value: unknown): value is RegistrationRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
