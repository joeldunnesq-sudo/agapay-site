// Generated from src/lib/database-reads.ts by npm run build:server. Do not edit.
function d1(env) {
  return env.AGAPAY_DB || null;
}
async function d1First(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env)
    .prepare(sql)
    .bind(...params)
    .first();
}
async function d1All(env, sql, ...params) {
  if (!d1(env)) return [];
  const result = await d1(env)
    .prepare(sql)
    .bind(...params)
    .all();
  return result.results || [];
}
export { d1, d1All, d1First };
