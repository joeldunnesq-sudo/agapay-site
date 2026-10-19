export type StorageEnvironment = Partial<Pick<Env, 'AGAPAY_DB' | 'AGAPAY_REGISTRATIONS'>>;
export interface KvListOptions {
  prefix?: string;
  limit?: number;
  pageSize?: number;
}
export interface JsonRow {
  data?: unknown;
}
export interface D1Statement {
  sql: string;
  params?: readonly unknown[];
}

export async function listKvKeys(
  env: StorageEnvironment,
  { prefix = '', limit = 1000, pageSize = 100 }: KvListOptions = {}
): Promise<KVNamespaceListKey<unknown>[]> {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.AGAPAY_REGISTRATIONS.list({
      prefix,
      limit: Math.min(pageSize, Math.max(1, limit - keys.length)),
      cursor,
    });
    keys.push(...page.keys);
    cursor = page.list_complete || keys.length >= limit ? undefined : page.cursor;
  } while (cursor && keys.length < limit);
  return keys;
}

export function d1(env: StorageEnvironment): D1Database | null {
  return env.AGAPAY_DB || null;
}

export function parseJsonRow(row: JsonRow | null | undefined): unknown {
  if (!row?.data) return null;
  // JSON.parse coerces its input to a string. Preserve that legacy coercion,
  // including errors for values which cannot be converted, without trusting JSON.
  return JSON.parse(`${row.data}`);
}

export function safeParseJsonRow(row: JsonRow | null | undefined): unknown {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}

// Query-specific row types describe the existing schema, not arbitrary JSON.
export async function d1First<TRow = Record<string, unknown>>(
  env: StorageEnvironment,
  sql: string,
  ...params: unknown[]
): Promise<TRow | null> {
  const db = d1(env);
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .first<TRow>();
}

export async function d1All<TRow = Record<string, unknown>>(
  env: StorageEnvironment,
  sql: string,
  ...params: unknown[]
): Promise<TRow[]> {
  const db = d1(env);
  if (!db) return [];
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<TRow>();
  return result.results || [];
}

export async function d1Run(env: StorageEnvironment, sql: string, ...params: unknown[]): Promise<D1Result | null> {
  const db = d1(env);
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}

// Runs multiple statements as a single atomic D1 batch (Cloudflare's D1Database#batch),
// so related local finalization writes (status flip, cache-column update, audit insert,
// etc.) either all commit or none do. Statements are { sql, params: [...] } objects, in
// the order they should execute. Stripe calls cannot participate in this — this is for
// D1-only atomicity, always performed either entirely before or entirely after any
// Stripe API call, never interleaved with one.
export async function d1Batch(
  env: StorageEnvironment,
  statements: readonly D1Statement[] | null | undefined
): Promise<D1Result[] | null> {
  const db = d1(env);
  if (!db) return null;
  if (!Array.isArray(statements) || !statements.length) return null;
  const prepared = statements.map(({ sql, params = [] }: D1Statement) => db.prepare(sql).bind(...params));
  return db.batch(prepared);
}
