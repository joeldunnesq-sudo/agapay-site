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
  getDirectoryDuplicateCandidate,
  listDirectoryAuditHistory,
  listDirectoryDuplicateCandidates,
  listDirectoryHouseholdsAdmin,
  listDirectoryPeopleAdmin,
  listDirectoryReviewQueue,
  decideDirectoryDuplicateCandidate,
  executeDirectoryDuplicateMerge,
  planDirectoryDuplicateMerge,
  requestDirectoryMediaReprocessing,
  resolveDirectoryAdminContext,
  revokeChildPublicationApproval,
  runDirectoryDuplicateScan,
  unassignDirectoryReviewItem
} from "../directory/admin.js";
import {
  assignMinistryLeader,
  assignMinistryParticipant,
  createMinistry,
  endMinistryLeader,
  getMinistryAdmin,
  listMinistriesAdmin,
  removeMinistryParticipant,
  setMinistryParticipationPublication,
  updateMinistry
} from "../directory/ministries.js";

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
    if (request.method === "GET" && path === "/ministries") {
      return json({ ok: true, ministries: await listMinistriesAdmin(env, { context, status: url.searchParams.get("status") || "", query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 100 }) });
    }
    if (request.method === "POST" && path === "/ministries") {
      return json({ ok: true, ministry: await createMinistry(env, { context, data: await body(request), correlationId }) }, { status: 201 });
    }
    const ministryMatch = path.match(/^\/ministries\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (ministryMatch) {
      const ministryId = decodeURIComponent(ministryMatch[1]);
      const collection = ministryMatch[2] || "";
      const itemIdOrAction = ministryMatch[3] ? decodeURIComponent(ministryMatch[3]) : "";
      if (request.method === "GET" && !collection) return json({ ok: true, ministry: await getMinistryAdmin(env, { context, ministryId }) });
      if (request.method === "PATCH" && !collection) return json({ ok: true, ministry: await updateMinistry(env, { context, ministryId, patch: await body(request), correlationId }) });
      if (request.method === "POST" && collection === "leaders") {
        return json({ ok: true, ministry: await assignMinistryLeader(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "participants") {
        return json({ ok: true, ministry: await assignMinistryParticipant(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "leaders-end") {
        return json({ ok: true, result: await endMinistryLeader(env, { context, leaderId: itemIdOrAction || ministryId, correlationId }) });
      }
      if (request.method === "POST" && collection === "participants-remove") {
        return json({ ok: true, result: await removeMinistryParticipant(env, { context, participantId: itemIdOrAction || ministryId, ...await body(request), correlationId }) });
      }
      if (request.method === "POST" && collection === "participants-publication") {
        return json({ ok: true, result: await setMinistryParticipationPublication(env, { context, participantId: itemIdOrAction || ministryId, ...await body(request), correlationId }) });
      }
    }
    if (request.method === "POST" && path === "/notes") return json({ ok: true, note: await createDirectoryNote(env, { context, ...await body(request), correlationId }) }, { status: 201 });
    const noteMatch = path.match(/^\/notes\/([^/]+)\/archive$/);
    if (request.method === "POST" && noteMatch) return json({ ok: true, result: await archiveDirectoryNote(env, { context, noteId: decodeURIComponent(noteMatch[1]), correlationId }) });
    if (request.method === "GET" && path === "/audit") return json({ ok: true, events: await listDirectoryAuditHistory(env, { context, targetType: url.searchParams.get("targetType") || "", targetId: url.searchParams.get("targetId") || "", limit: url.searchParams.get("limit") || 50 }) });
    if (request.method === "POST" && path === "/duplicates/scan") return json({ ok: true, scan: await runDirectoryDuplicateScan(env, { context, ...await body(request), correlationId }) });
    if (request.method === "GET" && path === "/duplicates") return json({ ok: true, candidates: await listDirectoryDuplicateCandidates(env, { context, status: url.searchParams.get("status") || "open", entityType: url.searchParams.get("entityType") || "", limit: url.searchParams.get("limit") || 50 }) });
    const duplicateMatch = path.match(/^\/duplicates\/([^/]+)(?:\/([^/]+))?$/);
    if (duplicateMatch) {
      const candidateId = decodeURIComponent(duplicateMatch[1]);
      const action = duplicateMatch[2] || "";
      if (request.method === "GET" && !action) return json({ ok: true, candidate: await getDirectoryDuplicateCandidate(env, { context, candidateId }) });
      if (request.method === "POST" && action === "decision") return json({ ok: true, candidate: await decideDirectoryDuplicateCandidate(env, { context, candidateId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "plan") return json({ ok: true, plan: await planDirectoryDuplicateMerge(env, { context, candidateId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "merge") return json({ ok: true, result: await executeDirectoryDuplicateMerge(env, { context, candidateId, ...await body(request), correlationId }) });
    }
    const childRevokeMatch = path.match(/^\/children\/([^/]+)\/revoke$/);
    if (request.method === "POST" && childRevokeMatch) {
      return json({ ok: true, result: await revokeChildPublicationApproval(env, { context, requestId: decodeURIComponent(childRevokeMatch[1]), ...await body(request), correlationId }) });
    }
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
