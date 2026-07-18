import { json, rateLimit } from "../lib/core.js";
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
  streamDirectoryAdminMediaVariant,
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
import {
  createParishSkill,
  exportPublishedAdultsCsv,
  exportSkillsRosterCsv,
  getDirectoryMaintenanceDashboard,
  listSkillCatalog,
  listSkillListingsAdmin,
  moderateSkillListing,
  printDirectory,
  printSkillsRoster,
  updateParishSkill,
  updateSkillsSettings
} from "../directory/skills-service.js";

async function body(request) {
  return request.json().catch(() => ({}));
}

function errorResponse(error) {
  if (error instanceof DirectoryServiceError) {
    return privateJson({ ok: false, error: error.code, message: error.message }, { status: error.status || 400 });
  }
  throw error;
}

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization"
};

function privateJson(payload, init = {}) {
  return json(payload, {
    ...init,
    headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) }
  });
}

function privateText(bodyText, { status = 200, contentType = "text/plain; charset=utf-8", filename = "" } = {}) {
  const headers = { ...PRIVATE_HEADERS, "Content-Type": contentType };
  if (filename) headers["Content-Disposition"] = `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`;
  return new Response(bodyText, { status, headers });
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
    if (!context) return privateJson({ error: "Unauthorized" }, { status: 401 });

    if (request.method === "GET" && path === "/context") return privateJson({ ok: true, context });
    if (request.method === "GET" && path === "/dashboard") return privateJson({ ok: true, dashboard: await getDirectoryAdminDashboard(env, { context }) });
    if (request.method === "GET" && path === "/maintenance") return privateJson({ ok: true, maintenance: await getDirectoryMaintenanceDashboard(env, { context }) });
    if (request.method === "GET" && path === "/queue") {
      return privateJson({ ok: true, items: await listDirectoryReviewQueue(env, { context, filters: Object.fromEntries(url.searchParams) }) });
    }
    const reviewMatch = path.match(/^\/reviews\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (reviewMatch) {
      const sourceType = decodeURIComponent(reviewMatch[1]);
      const sourceId = decodeURIComponent(reviewMatch[2]);
      const action = reviewMatch[3] || "";
      if (request.method === "GET" && !action) return privateJson({ ok: true, review: await getDirectoryReviewItem(env, { context, sourceType, sourceId }) });
      if (request.method === "POST" && action === "assign") return privateJson({ ok: true, review: await assignDirectoryReviewItem(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "unassign") return privateJson({ ok: true, review: await unassignDirectoryReviewItem(env, { context, sourceType, sourceId, correlationId }) });
      if (request.method === "POST" && action === "priority") return privateJson({ ok: true, review: await changeDirectoryReviewPriority(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "begin") return privateJson({ ok: true, review: await beginDirectoryReview(env, { context, sourceType, sourceId, correlationId }) });
      if (request.method === "POST" && action === "decision") return privateJson({ ok: true, result: await decideDirectoryReviewItem(env, { context, sourceType, sourceId, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/people") return privateJson({ ok: true, people: await listDirectoryPeopleAdmin(env, { context, query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 50 }) });
    const personMatch = path.match(/^\/people\/([^/]+)(?:\/correction)?$/);
    if (personMatch) {
      const personId = decodeURIComponent(personMatch[1]);
      if (request.method === "GET") return privateJson({ ok: true, person: await getDirectoryPersonAdmin(env, { context, personId }) });
      if (request.method === "PATCH" && path.endsWith("/correction")) return privateJson({ ok: true, person: await applyPersonDirectCorrection(env, { context, personId, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/households") return privateJson({ ok: true, households: await listDirectoryHouseholdsAdmin(env, { context, query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 50 }) });
    const householdMatch = path.match(/^\/households\/([^/]+)(?:\/correction)?$/);
    if (householdMatch) {
      const householdId = decodeURIComponent(householdMatch[1]);
      if (request.method === "GET") return privateJson({ ok: true, household: await getDirectoryHouseholdAdmin(env, { context, householdId }) });
      if (request.method === "PATCH" && path.endsWith("/correction")) return privateJson({ ok: true, household: await applyHouseholdDirectCorrection(env, { context, householdId, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/ministries") {
      return privateJson({ ok: true, ministries: await listMinistriesAdmin(env, { context, status: url.searchParams.get("status") || "", query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 100 }) });
    }
    if (request.method === "POST" && path === "/ministries") {
      return privateJson({ ok: true, ministry: await createMinistry(env, { context, data: await body(request), correlationId }) }, { status: 201 });
    }
    const ministryMatch = path.match(/^\/ministries\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (ministryMatch) {
      const ministryId = decodeURIComponent(ministryMatch[1]);
      const collection = ministryMatch[2] || "";
      const itemIdOrAction = ministryMatch[3] ? decodeURIComponent(ministryMatch[3]) : "";
      if (request.method === "GET" && !collection) return privateJson({ ok: true, ministry: await getMinistryAdmin(env, { context, ministryId }) });
      if (request.method === "PATCH" && !collection) return privateJson({ ok: true, ministry: await updateMinistry(env, { context, ministryId, patch: await body(request), correlationId }) });
      if (request.method === "POST" && collection === "leaders") {
        return privateJson({ ok: true, ministry: await assignMinistryLeader(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "participants") {
        return privateJson({ ok: true, ministry: await assignMinistryParticipant(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "leaders-end") {
        return privateJson({ ok: true, result: await endMinistryLeader(env, { context, leaderId: itemIdOrAction || ministryId, correlationId }) });
      }
      if (request.method === "POST" && collection === "participants-remove") {
        return privateJson({ ok: true, result: await removeMinistryParticipant(env, { context, participantId: itemIdOrAction || ministryId, ...await body(request), correlationId }) });
      }
      if (request.method === "POST" && collection === "participants-publication") {
        return privateJson({ ok: true, result: await setMinistryParticipationPublication(env, { context, participantId: itemIdOrAction || ministryId, ...await body(request), correlationId }) });
      }
    }
    if (request.method === "GET" && path === "/skills/catalog") {
      return privateJson({ ok: true, skills: await listSkillCatalog(env, { context }) });
    }
    if (request.method === "POST" && path === "/skills/catalog") {
      return privateJson({ ok: true, skill: await createParishSkill(env, { context, data: await body(request), correlationId }) }, { status: 201 });
    }
    const skillCatalogMatch = path.match(/^\/skills\/catalog\/([^/]+)$/);
    if (request.method === "PATCH" && skillCatalogMatch) {
      return privateJson({ ok: true, skill: await updateParishSkill(env, { context, skillId: decodeURIComponent(skillCatalogMatch[1]), patch: await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/skills/listings") {
      return privateJson({ ok: true, skills: await listSkillListingsAdmin(env, { context, status: url.searchParams.get("status") || "", category: url.searchParams.get("category") || "", q: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || "" }) });
    }
    const skillListingAction = path.match(/^\/skills\/listings\/([^/]+)\/(hide|restore|archive)$/);
    if (request.method === "POST" && skillListingAction) {
      return privateJson({ ok: true, listing: await moderateSkillListing(env, { context, listingId: decodeURIComponent(skillListingAction[1]), action: skillListingAction[2], ...await body(request), correlationId }) });
    }
    if (request.method === "PATCH" && path === "/skills/settings") {
      return privateJson({ ok: true, settings: await updateSkillsSettings(env, { context, patch: await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/exports/skills.csv") {
      const exported = await exportSkillsRosterCsv(env, { context });
      return privateText(exported.body, { contentType: exported.contentType, filename: exported.filename });
    }
    if (request.method === "GET" && path === "/exports/published-adults.csv") {
      const exported = await exportPublishedAdultsCsv(env, { context });
      return privateText(exported.body, { contentType: exported.contentType, filename: exported.filename });
    }
    if (request.method === "GET" && path === "/print/skills") return privateJson({ ok: true, print: await printSkillsRoster(env, { context }) });
    if (request.method === "GET" && path === "/print/directory") return privateJson({ ok: true, print: await printDirectory(env, { context }) });
    if (request.method === "POST" && path === "/notes") return privateJson({ ok: true, note: await createDirectoryNote(env, { context, ...await body(request), correlationId }) }, { status: 201 });
    const noteMatch = path.match(/^\/notes\/([^/]+)\/archive$/);
    if (request.method === "POST" && noteMatch) return privateJson({ ok: true, result: await archiveDirectoryNote(env, { context, noteId: decodeURIComponent(noteMatch[1]), correlationId }) });
    if (request.method === "GET" && path === "/audit") return privateJson({ ok: true, events: await listDirectoryAuditHistory(env, { context, targetType: url.searchParams.get("targetType") || "", targetId: url.searchParams.get("targetId") || "", limit: url.searchParams.get("limit") || 50 }) });
    if (request.method === "POST" && path === "/duplicates/scan") return privateJson({ ok: true, scan: await runDirectoryDuplicateScan(env, { context, ...await body(request), correlationId }) });
    if (request.method === "GET" && path === "/duplicates") return privateJson({ ok: true, candidates: await listDirectoryDuplicateCandidates(env, { context, status: url.searchParams.get("status") || "open", entityType: url.searchParams.get("entityType") || "", limit: url.searchParams.get("limit") || 50 }) });
    const duplicateMatch = path.match(/^\/duplicates\/([^/]+)(?:\/([^/]+))?$/);
    if (duplicateMatch) {
      const candidateId = decodeURIComponent(duplicateMatch[1]);
      const action = duplicateMatch[2] || "";
      if (request.method === "GET" && !action) return privateJson({ ok: true, candidate: await getDirectoryDuplicateCandidate(env, { context, candidateId }) });
      if (request.method === "POST" && action === "decision") return privateJson({ ok: true, candidate: await decideDirectoryDuplicateCandidate(env, { context, candidateId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "plan") return privateJson({ ok: true, plan: await planDirectoryDuplicateMerge(env, { context, candidateId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "merge") return privateJson({ ok: true, result: await executeDirectoryDuplicateMerge(env, { context, candidateId, ...await body(request), correlationId }) });
    }
    const childRevokeMatch = path.match(/^\/children\/([^/]+)\/revoke$/);
    if (request.method === "POST" && childRevokeMatch) {
      return privateJson({ ok: true, result: await revokeChildPublicationApproval(env, { context, requestId: decodeURIComponent(childRevokeMatch[1]), ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/media/legacy-audit") return privateJson({ ok: true, audit: await getDirectoryMediaLegacyAudit(env, { context, correlationId }) });
    const mediaVariantMatch = path.match(/^\/media\/([^/]+)\/variants\/([^/]+)$/);
    if (request.method === "GET" && mediaVariantMatch) {
      return streamDirectoryAdminMediaVariant(env, {
        context,
        mediaAssetId: decodeURIComponent(mediaVariantMatch[1]),
        variantType: decodeURIComponent(mediaVariantMatch[2])
      });
    }
    const reprocessMatch = path.match(/^\/media\/([^/]+)\/reprocess$/);
    if (request.method === "POST" && reprocessMatch) {
      const limited = await rateLimit(request, env, "directory-media-reprocess", { limit: 20, windowSeconds: 3600 });
      if (limited) return limited;
      return privateJson({ ok: true, asset: await requestDirectoryMediaReprocessing(env, { context, mediaAssetId: decodeURIComponent(reprocessMatch[1]), correlationId }) });
    }
    return null;
  } catch (error) {
    return errorResponse(error);
  }
}
