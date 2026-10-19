// Generated from src/lib/database-reads.ts by npm run build:server. Do not edit.
function d1(env) {
  return env.AGAPAY_DB || null;
}
async function d1First(env, sql, ...params) {
  const db = d1(env);
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .first();
}
async function d1All(env, sql, ...params) {
  const db = d1(env);
  if (!db) return [];
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return result.results || [];
}
export { d1, d1All, d1First };
