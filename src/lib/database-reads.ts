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
  if (!d1(env)) return null;
  return d1(env)!
    .prepare(sql)
    .bind(...params)
    .first<Row>();
}

export async function d1All<Row = Record<string, unknown>>(
  env: DatabaseReadEnv,
  sql: string,
  ...params: unknown[]
): Promise<Row[]> {
  if (!d1(env)) return [];
  const result = await d1(env)!
    .prepare(sql)
    .bind(...params)
    .all<Row>();
  return result.results || [];
}
