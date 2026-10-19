// Generated from src/lib/storage.ts by npm run build:server. Do not edit.
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
function d1(env) {
  return env.AGAPAY_DB || null;
}
function parseJsonRow(row) {
  if (!row?.data) return null;
  return JSON.parse(`${row.data}`);
}
function safeParseJsonRow(row) {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
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
async function d1Run(env, sql, ...params) {
  const db = d1(env);
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}
async function d1Batch(env, statements) {
  const db = d1(env);
  if (!db) return null;
  if (!Array.isArray(statements) || !statements.length) return null;
  const prepared = statements.map(({ sql, params = [] }) => db.prepare(sql).bind(...params));
  return db.batch(prepared);
}
export { d1, d1All, d1Batch, d1First, d1Run, listKvKeys, parseJsonRow, safeParseJsonRow };
