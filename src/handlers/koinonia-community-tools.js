import { d1First, d1Run, hasProductionStore, json, missingProductionStoreResponse, rateLimit } from "../lib/core.js";
import { exchangeEnabledFor, signupsEnabledFor } from "../lib/entitlements.js";
import { verifiedHouseholdAccess } from "./koinonia-access.js";
import { findRegistrationByParishId } from "./parish.js";

const TOOLS = new Set(["signups", "exchange"]);
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function enabledTools(registration) {
  return {
    signups: signupsEnabledFor(registration),
    exchange: exchangeEnabledFor(registration),
  };
}

export async function getCommunityToolBadgeCounts(env, context, enabled = { signups: true, exchange: true }, asOf = Date.now()) {
  const row = await d1First(env, `
    SELECT
      (SELECT COUNT(*)
       FROM koinonia_signup_sheets sheet
       WHERE sheet.parish_id = ?1 AND sheet.status = 'open'
         AND sheet.published_at > COALESCE((
           SELECT view.last_opened_at FROM koinonia_community_tool_views view
           WHERE view.parish_id = ?1 AND view.person_id = ?2 AND view.tool = 'signups'
         ), 0)) AS signups_count,
      (SELECT COUNT(*)
       FROM koinonia_exchange_listings listing
       WHERE listing.parish_id = ?1 AND listing.status = 'active'
         AND (listing.expires_at IS NULL OR listing.expires_at > ?3)
         AND listing.created_at > COALESCE((
           SELECT view.last_opened_at FROM koinonia_community_tool_views view
           WHERE view.parish_id = ?1 AND view.person_id = ?2 AND view.tool = 'exchange'
         ), 0)) AS exchange_count
  `, context.parishId, context.personId, asOf);
  return {
    signups: enabled.signups ? Math.max(0, Number(row?.signups_count) || 0) : 0,
    exchange: enabled.exchange ? Math.max(0, Number(row?.exchange_count) || 0) : 0,
  };
}

export async function markCommunityToolOpened(env, context, tool, openedAt = Date.now()) {
  if (!TOOLS.has(tool)) throw new Error("Unknown Community Tool.");
  await d1Run(env, `
    INSERT INTO koinonia_community_tool_views (parish_id, person_id, tool, last_opened_at)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(parish_id, person_id, tool) DO UPDATE SET last_opened_at = excluded.last_opened_at
  `, context.parishId, context.personId, tool, openedAt);
  return { ok: true, tool, lastOpenedAt: openedAt };
}

export async function handleDonorKoinoniaCommunityTools(request, env) {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "koinonia-community-tools", { limit: 120, windowSeconds: 300 });
  if (limited) return limited;
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access.response;
  const found = await findRegistrationByParishId(env, access.context.parishId);
  const enabled = enabledTools(found?.registration || {});
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/donor\/koinonia\/community-tools\/?/, "");
  const parts = path ? path.split("/").map(decodeURIComponent) : [];

  if (parts.length === 1 && parts[0] === "badges" && request.method === "GET") {
    return privateJson({ ok: true, counts: await getCommunityToolBadgeCounts(env, access.context, enabled) });
  }
  if (parts.length === 2 && parts[1] === "opened" && request.method === "POST" && TOOLS.has(parts[0])) {
    if (!enabled[parts[0]]) return privateJson({ error: "This Community Tool is not available for your parish." }, { status: 403 });
    return privateJson(await markCommunityToolOpened(env, access.context, parts[0]));
  }
  return privateJson({ error: "Method not allowed" }, { status: 405 });
}
