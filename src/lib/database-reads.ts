// Binding availability and row types describe the existing D1 read contract.
// Generic row arguments describe query results; they do not validate stored data.
export interface DatabaseReadEnv {
  readonly AGAPAY_DB?: Env['AGAPAY_DB'] | null;
}

export function d1(env: DatabaseReadEnv): D1Database | null {
  return env.AGAPAY_DB || null;
}

export async function d1First<Row = Record<string, unknown>>(
  env: DatabaseReadEnv,
  sql: string,
  ...params: unknown[]
): Promise<Row | null> {
  const db = d1(env);
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .first<Row>();
}

export async function d1All<Row = Record<string, unknown>>(
  env: DatabaseReadEnv,
  sql: string,
  ...params: unknown[]
): Promise<Row[]> {
  const db = d1(env);
  if (!db) return [];
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<Row>();
  return result.results || [];
}
