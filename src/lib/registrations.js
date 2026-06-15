import {
  clampListLimit,
  d1,
  d1All,
  decodeListCursor,
  encodeListCursor,
  listKvKeys,
  parseJsonRow,
  safeParseJsonRow
} from "./core.js";

export async function loadAllRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 10000, 25000);
  if (d1(env)) {
    const registrations = [];
    let cursor = null;
    do {
      const page = await loadAdminRegistrationPage(env, {
        ...options,
        cursor,
        limit: Math.min(250, hardLimit - registrations.length)
      });
      registrations.push(...page.registrations);
      cursor = page.cursor;
    } while (cursor && registrations.length < hardLimit);
    return registrations.slice(0, hardLimit);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { limit: hardLimit });
  const rows = await Promise.all(keys.map((key) => env.AGAPAY_REGISTRATIONS.get(key.name)));
  return rows
    .map(safeParseJsonRow)
    .filter(Boolean)
    .filter((registration) => !options.status || registration.status === options.status)
    .slice(0, hardLimit);
}

export async function loadAllKvRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 10000, 25000);
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { limit: hardLimit });
  const rows = await Promise.all(keys.map((key) => env.AGAPAY_REGISTRATIONS.get(key.name)));
  return rows
    .map(safeParseJsonRow)
    .filter(Boolean)
    .filter((registration) => !options.status || registration.status === options.status)
    .slice(0, hardLimit);
}

export async function loadAdminRegistrationPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const status = String(options.status || "").trim().toLowerCase();

  if (d1(env)) {
    const params = [];
    const where = [];
    if (status && status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (cursor?.createdAt && cursor?.reference) {
      where.push("(created_at < ? OR (created_at = ? AND reference < ?))");
      params.push(cursor.createdAt, cursor.createdAt, cursor.reference);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await d1All(
      env,
      `SELECT * FROM registrations ${whereSql} ORDER BY created_at DESC, reference DESC LIMIT ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    return {
      registrations: pageRows.map(parseJsonRow).filter(Boolean),
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  const registrations = await loadAllKvRegistrations(env, { status, hardLimit: 10000 });
  registrations.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const startIndex = cursor?.reference
    ? Math.max(0, registrations.findIndex((registration) => registration.reference === cursor.reference) + 1)
    : 0;
  const page = registrations.slice(startIndex, startIndex + limit);
  return {
    registrations: page,
    cursor: startIndex + limit < registrations.length ? encodeListCursor(page[page.length - 1]) : null,
    hasMore: startIndex + limit < registrations.length,
    limit,
    source: "kv"
  };
}
