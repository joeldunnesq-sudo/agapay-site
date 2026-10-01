export interface KvReadEnv {
  readonly AGAPAY_REGISTRATIONS?: Env['AGAPAY_REGISTRATIONS'] | null;
}
export interface KvListOptions {
  readonly prefix?: string;
  readonly limit?: number;
  readonly pageSize?: number;
}
export const DONOR_OFFERING_KEY_PREFIX = '__agapay_donor_offering__';

export async function listKvKeys(
  env: KvReadEnv,
  { prefix = '', limit = 1000, pageSize = 100 }: KvListOptions = {}
): Promise<KVNamespaceListKey<unknown>[]> {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown> = await env.AGAPAY_REGISTRATIONS.list({
      prefix,
      limit: Math.min(pageSize, Math.max(1, limit - keys.length)),
      cursor,
    });
    keys.push(...page.keys);
    cursor = page.list_complete || keys.length >= limit ? undefined : page.cursor;
  } while (cursor && keys.length < limit);
  return keys;
}
