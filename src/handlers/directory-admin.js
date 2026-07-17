import { json, rateLimit, unauthorized } from "../lib/core.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import {
  applyHouseholdDirectCorrection,
  applyPersonDirectCorrection,
  archiveDirectoryNote,
  assignDirectoryReviewItem,
  beginDirectoryReview,
  changeDirectoryReviewPriority,
  createDirectoryNote,
  decideDirectoryReviewItem,
  getDirectoryAdminDashboard,
  getDirectoryHouseholdAdmin,
  getDirectoryMediaLegacyAudit,
  getDirectoryPersonAdmin,
  getDirectoryReviewItem,
  listDirectoryAuditHistory,
  listDirectoryHouseholdsAdmin,
  listDirectoryPeopleAdmin,
  listDirectoryReviewQueue,
  requestDirectoryMediaReprocessing,
  resolveDirectoryAdminContext,
  unassignDirectoryReviewItem
} from "../directory/admin.js";

async function body(request) {
  return request.json().catch(() => ({}));
}

function errorResponse(error) {
  if (error instanceof DirectoryServiceError) {
    return json({ ok: false, error: error.code, message: error.message }, { status: error.status || 400 });
  }
  throw error;
}

async function adminContext(request, env, parishId) {
  try {
    return await resolveDirectoryAdminContext(env, { request, parishId });
  } catch (error) {
    if (error instanceof DirectoryServiceError && error.status === 401) return null;
    throw error;
  }
}

function reviewPath(path, parishId) {
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/directory/admin`;
  return path.startsWith(base) ? path.slice(base.length) || "/" : "";
}

export async function handleDirectoryAdmin(request, env, parishId) {
  const url = new URL(request.url);
  const path = reviewPath(url.pathname, parishId);
  if (!path) return null;
  const correlationId = request.headers.get("X-Request-Id") || "";
  try {
    const context = await adminContext(request, env, parishId);
    if (!context) return unauthorized();

    if (request.method === "GET" && path === "/context") return json({ ok: true, context });
    if (request.method === "GET" && path === "/dashboard") return json({ ok: true, dashboard: await getDirectoryAdminDashboard(env, { context }) });
    if (request.method === "GET" && path === "/queue") {
      return json({ ok: true, items: await listDirectoryReviewQueue(env, { context, filters: Object.fromEntries(url.searchParams) }) });
    }
    const reviewMatch = path.match(/^\/reviews\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (reviewMatch) {
      const sourceType = decodeURIComponent(reviewMatch[1]);
      const sourceId = decodeURIComponent(reviewMatch[2]);
      const action = reviewMatch[3] || "";
      if (request.method === "GET" && !action) return json({ ok: true, review: await getDirectoryReviewItem(env, { context, sourceType, sourceId }) });
      if (request.method === "POST" && action === "assign") return json({ ok: true, review: await assignDirectoryReviewItem(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "unassign") return json({ ok: true, review: await unassignDirectoryReviewItem(env, { context, sourceType, sourceId, correlationId }) });
      if (request.method === "POST" && action === "priority") return json({ ok: true, review: await changeDirectoryReviewPriority(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "begin") return json({ ok: true, review: await beginDirectoryReview(env, { context, sourceType, sourceId, correlationId }) });
      if (request.method === "POST" && action === "decision") return json({ ok: true, result: await decideDirectoryReviewItem(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/people") return json({ ok: true, people: await listDirectoryPeopleAdmin(env, { context, query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 50 }) });
    const personMatch = path.match(/^\/people\/([^/]+)(?:\/correction)?$/);
    if (personMatch) {
      const personId = decodeURIComponent(personMatch[1]);
      if (request.method === "GET") return json({ ok: true, person: await getDirectoryPersonAdmin(env, { context, personId }) });
      if (request.method === "PATCH" && path.endsWith("/correction")) return json({ ok: true, person: await applyPersonDirectCorrection(env, { context, personId, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/households") return json({ ok: true, households: await listDirectoryHouseholdsAdmin(env, { context, query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 50 }) });
    const householdMatch = path.match(/^\/households\/([^/]+)(?:\/correction)?$/);
    if (householdMatch) {
      const householdId = decodeURIComponent(householdMatch[1]);
      if (request.method === "GET") return json({ ok: true, household: await getDirectoryHouseholdAdmin(env, { context, householdId }) });
      if (request.method === "PATCH" && path.endsWith("/correction")) return json({ ok: true, household: await applyHouseholdDirectCorrection(env, { context, householdId, ...await body(request), correlationId }) });
    }
    if (request.method === "POST" && path === "/notes") return json({ ok: true, note: await createDirectoryNote(env, { context, ...await body(request), correlationId }) }, { status: 201 });
    const noteMatch = path.match(/^\/notes\/([^/]+)\/archive$/);
    if (request.method === "POST" && noteMatch) return json({ ok: true, result: await archiveDirectoryNote(env, { context, noteId: decodeURIComponent(noteMatch[1]), correlationId }) });
    if (request.method === "GET" && path === "/audit") return json({ ok: true, events: await listDirectoryAuditHistory(env, { context, targetType: url.searchParams.get("targetType") || "", targetId: url.searchParams.get("targetId") || "", limit: url.searchParams.get("limit") || 50 }) });
    if (request.method === "GET" && path === "/media/legacy-audit") return json({ ok: true, audit: await getDirectoryMediaLegacyAudit(env, { context, correlationId }) });
    const reprocessMatch = path.match(/^\/media\/([^/]+)\/reprocess$/);
    if (request.method === "POST" && reprocessMatch) {
      const limited = await rateLimit(request, env, "directory-media-reprocess", { limit: 20, windowSeconds: 3600 });
      if (limited) return limited;
      return json({ ok: true, asset: await requestDirectoryMediaReprocessing(env, { context, mediaAssetId: decodeURIComponent(reprocessMatch[1]), correlationId }) });
    }
    return null;
  } catch (error) {
    return errorResponse(error);
  }
}
