import {
  clampListLimit,
  d1,
  d1All,
  decodeListCursor,
  encodeListCursor,
  listKvKeys,
  safeParseJsonRow
} from "./core.js";
import { defaultSubscriptionTier } from "./subscriptions.js";

export function adminRegistrationSummary(registration = {}, fallbackReference = "") {
  registration = registration || {};
  return {
    reference: registration.reference || fallbackReference || "",
    status: registration.status || "pending",
    parishName: registration.parishName || "",
    communityType: registration.communityType || "",
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    jurisdiction: registration.jurisdiction || "",
    city: registration.city || "",
    state: registration.state || "",
    priestEmail: registration.priestEmail || "",
    treasurerEmail: registration.treasurerEmail || "",
    givingStatus: registration.givingStatus || "active",
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    dashboardInviteEmailStatus: registration.dashboardInviteEmailStatus || "",
    adminNotificationEmailStatus: registration.adminNotificationEmailStatus || "",
    receivedAt: registration.receivedAt || registration.received_at || registration.createdAt || ""
  };
}

export async function loadAllRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 10000, 25000);
  if (d1(env)) {
    const registrations = [];
    let cursor = "";
    do {
      const decoded = decodeListCursor(cursor);
      const where = [];
      const params = [];
      if (options.status) {
        where.push("status = ?");
        params.push(options.status);
      }
      if (decoded) {
        where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
        params.push(decoded.receivedAt, decoded.receivedAt, decoded.reference);
      }
      const rows = await d1All(
        env,
        `SELECT reference, received_at, data
         FROM registrations
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY received_at DESC, reference DESC
         LIMIT ?`,
        ...params,
        Math.min(250, hardLimit - registrations.length)
      );
      registrations.push(...rows.map(safeParseJsonRow).filter(Boolean));
      cursor = rows.length ? encodeListCursor(rows[rows.length - 1]) : "";
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
  const query = String(options.query || options.q || "").trim().toLowerCase();

  if (d1(env)) {
    const params = [];
    const where = [];
    if (status && status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (cursor?.receivedAt && cursor?.reference) {
      where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.priestEmail'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.treasurerEmail'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await d1All(
      env,
      `SELECT reference, received_at, data FROM registrations ${whereSql} ORDER BY received_at DESC, reference DESC LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    return {
      registrations: pageRows.map((row) => {
        const registration = safeParseJsonRow(row);
        return registration ? adminRegistrationSummary(registration, row.reference) : { reference: row.reference || "", status: "unreadable" };
      }),
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  const registrations = await loadAllKvRegistrations(env, { status, hardLimit: 10000 });
  const filtered = query
    ? registrations.filter((registration) => [
      registration.parishName,
      registration.city,
      registration.state,
      registration.jurisdiction,
      registration.priestEmail,
      registration.treasurerEmail
    ].filter(Boolean).join(" ").toLowerCase().includes(query))
    : registrations;
  filtered.sort((a, b) => String(b.receivedAt || b.createdAt || "").localeCompare(String(a.receivedAt || a.createdAt || "")));
  const startIndex = cursor?.reference
    ? Math.max(0, filtered.findIndex((registration) => registration.reference === cursor.reference) + 1)
    : 0;
  const page = filtered.slice(startIndex, startIndex + limit);
  return {
    registrations: page.map((registration) => adminRegistrationSummary(registration)),
    cursor: startIndex + limit < filtered.length ? encodeListCursor(page[page.length - 1]) : null,
    hasMore: startIndex + limit < filtered.length,
    limit,
    source: "kv"
  };
}
