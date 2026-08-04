import { json, normalizeEmail, rateLimit } from "../lib/core.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { htmlEscape } from "../lib/format.js";
import { buildParishDirectoryPdf } from "../lib/directory-pdf.js";
import { findRegistrationByParishId } from "./parish.js";
import { decodeAndNormalizeSource } from "../directory/media-transform.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import {
  applyHouseholdDirectCorrection,
  applyPersonDirectCorrection,
  removeDirectoryPersonFromParish,
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
  assignMinistryParticipantCandidate,
  createMinistry,
  deleteMinistry,
  endMinistryLeader,
  getMinistryAdmin,
  listMinistriesAdmin,
  searchMinistryParticipantCandidates,
  removeMinistryParticipant,
  setMinistryParticipationPublication,
  setMinistryImage,
  updateMinistry
} from "../directory/ministries.js";
import { GROUP_MESSAGE_IMAGE_TYPES, storeGroupMessageAttachment } from "./donor-groups.js";
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
import { getDirectorySettings, updateDirectorySettings } from "../directory/settings.js";
import {
  createDirectoryInvitation,
  listParishDirectoryInvitations,
  markDirectoryInvitationSent,
  resendDirectoryInvitation,
  revokeDirectoryInvitation
} from "../directory/invitations.js";

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

function privateBinary(bytes, { contentType, filename }) {
  return new Response(bytes, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`
    }
  });
}

function imageContentType(value = "", fallback = "") {
  const type = String(value || "").toLowerCase();
  if (type.includes("png")) return "image/png";
  if (type.includes("jpeg") || type.includes("jpg")) return "image/jpeg";
  if (type.includes("webp")) return "image/webp";
  const path = String(fallback || "").toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "";
}

function pdfCompatibleLogo(bytes, contentType) {
  if (!bytes || contentType !== "image/webp") return { bytes, contentType };
  try {
    const decoded = decodeAndNormalizeSource({ sourceBytes: new Uint8Array(bytes), sourceMimeType: "image/webp" });
    const jpeg = decoded.image.get_bytes_jpeg(90);
    decoded.image.free?.();
    return { bytes: jpeg, contentType: "image/jpeg" };
  } catch {
    return { bytes: null, contentType: "" };
  }
}

async function loadDirectoryPdfLogo(request, env, registration = {}) {
  let bytes = null;
  let contentType = "";
  const storageKey = String(registration.logoStorageKey || "");
  if (storageKey && env.CAMPAIGN_ASSETS?.get) {
    const object = await env.CAMPAIGN_ASSETS.get(storageKey).catch(() => null);
    if (object) {
      bytes = await object.arrayBuffer().catch(() => null);
      contentType = imageContentType(object.httpMetadata?.contentType, storageKey);
    }
  }
  const logoUrl = String(registration.logoUrl || "");
  if (!bytes && /^https:\/\//i.test(logoUrl)) {
    const response = await fetch(logoUrl).catch(() => null);
    if (response?.ok) {
      bytes = await response.arrayBuffer();
      contentType = imageContentType(response.headers.get("Content-Type"), logoUrl);
    }
  }
  const compatible = pdfCompatibleLogo(bytes, contentType);
  if (compatible.bytes) return compatible;
  if (env.ASSETS?.fetch) {
    const fallback = await env.ASSETS.fetch(new Request(new URL("/mark.png", request.url))).catch(() => null);
    if (fallback?.ok) {
      bytes = await fallback.arrayBuffer();
      contentType = "image/png";
    }
  }
  return pdfCompatibleLogo(bytes, contentType);
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

function invitationUrl(request, env, rawToken) {
  const base = String(env.AGAPAY_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}/myagapay/directory?invite=${encodeURIComponent(rawToken)}`;
}

const MINISTRY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function safeMinistryStorageSegment(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;
}

function ministryImageStorageKey(parishId, ministryId) {
  return `ministry-images/${safeMinistryStorageSegment(parishId, "parish")}/${safeMinistryStorageSegment(ministryId, "ministry")}`;
}

async function purgeMinistryAssets(env, parishId, ministryId, imageStorageKey = "") {
  if (!env.GROUP_MESSAGE_ASSETS) return;
  const prefix = `group-messages/${safeMinistryStorageSegment(parishId, "parish")}/${safeMinistryStorageSegment(ministryId, "ministry")}/`;
  let cursor;
  do {
    const page = await env.GROUP_MESSAGE_ASSETS.list({ prefix, cursor });
    const keys = (page.objects || []).map(({ key }) => key);
    if (keys.length) await env.GROUP_MESSAGE_ASSETS.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (imageStorageKey) await env.GROUP_MESSAGE_ASSETS.delete(imageStorageKey);
}

async function uploadMinistryImage(request, env, context, ministryId, correlationId) {
  if (!env.GROUP_MESSAGE_ASSETS) throw new DirectoryServiceError("storage_unavailable", "Ministry image storage is not configured.", 503);
  await getMinistryAdmin(env, { context, ministryId });
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!GROUP_MESSAGE_IMAGE_TYPES.has(contentType)) throw new DirectoryServiceError("validation_failed", "Ministry images must be JPG, PNG, or WebP.", 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MINISTRY_IMAGE_MAX_BYTES) throw new DirectoryServiceError("image_too_large", "Ministry images must be 5MB or smaller.", 413);
  if (!request.body) throw new DirectoryServiceError("validation_failed", "Choose an image to upload.", 422);
  const key = ministryImageStorageKey(context.parishId, ministryId);
  let stored;
  try {
    stored = await storeGroupMessageAttachment(env.GROUP_MESSAGE_ASSETS, { key, source: request.body, contentType, maxBytes: MINISTRY_IMAGE_MAX_BYTES });
  } catch (error) {
    if (error?.message === "GROUP_MESSAGE_ATTACHMENT_TOO_LARGE") throw new DirectoryServiceError("image_too_large", "Ministry images must be 5MB or smaller.", 413);
    throw error;
  }
  if (!stored.size) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw new DirectoryServiceError("validation_failed", "The ministry image was empty.", 422);
  }
  return setMinistryImage(env, { context, ministryId, storageKey: key, contentType, correlationId });
}

async function deliverMinistryImage(env, context, ministryId) {
  if (!env.GROUP_MESSAGE_ASSETS) throw new DirectoryServiceError("storage_unavailable", "Ministry image storage is not configured.", 503);
  const result = await getMinistryAdmin(env, { context, ministryId });
  const key = ministryImageStorageKey(context.parishId, ministryId);
  if (!result.ministry.hasImage) throw new DirectoryServiceError("not_found", "Ministry image was not found.", 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(key);
  if (!object?.body) throw new DirectoryServiceError("not_found", "Ministry image was not found.", 404);
  const headers = new Headers({ "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Robots-Tag": "noindex, nofollow" });
  object.writeHttpMetadata?.(headers);
  return new Response(object.body, { headers });
}

async function deliverDirectoryInvitation(env, { email, personName, householdName, url }) {
  const subject = householdName
    ? `Manage ${householdName} in My AGAPAY`
    : "Connect your parish directory record to My AGAPAY";
  const message = householdName
    ? `Your parish invited you to manage <strong>${htmlEscape(householdName)}</strong> as ${htmlEscape(personName)}.`
    : `Your parish invited you to connect the directory record for <strong>${htmlEscape(personName)}</strong> to your My AGAPAY account.`;
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <support@agapay.app>",
    to: [email],
    subject,
    html: agapayEmailHtml(
      env.AGAPAY_APP_URL || "https://agapay.app",
      "Your parish directory invitation",
      `<p>${message}</p><p><a href="${htmlEscape(url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0a4b78;color:#fff;text-decoration:none;font-weight:700;">Open My AGAPAY invitation</a></p><p>This secure invitation expires in 14 days and can only be used by the invited email address.</p>`
    )
  });
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
    if (request.method === "GET" && path === "/settings") {
      return privateJson({ ok: true, settings: await getDirectorySettings(env, parishId) });
    }
    if (request.method === "PATCH" && path === "/settings") {
      return privateJson({
        ok: true,
        settings: await updateDirectorySettings(env, {
          actor: context,
          parishId,
          patch: await body(request),
          correlationId
        })
      });
    }
    if (request.method === "GET" && path === "/dashboard") return privateJson({ ok: true, dashboard: await getDirectoryAdminDashboard(env, { context }) });
    if (request.method === "GET" && path === "/maintenance") return privateJson({ ok: true, maintenance: await getDirectoryMaintenanceDashboard(env, { context }) });
    if (request.method === "GET" && path === "/invitations") {
      return privateJson({ ok: true, invitations: await listParishDirectoryInvitations(env, { actor: context, parishId }) });
    }
    if (request.method === "POST" && path === "/invitations") {
      const limited = await rateLimit(request, env, "directory-admin-invitations", { limit: 20, windowSeconds: 300 });
      if (limited) return limited;
      const data = await body(request);
      const email = normalizeEmail(data.email);
      if (!email) throw new DirectoryServiceError("validation_failed", "Enter the adult's email address before sending an invitation.");
      const personRecord = await getDirectoryPersonAdmin(env, { context, personId: data.personId });
      if (personRecord.accountAccess?.linked) {
        throw new DirectoryServiceError("conflict", "This person already has a linked My AGAPAY account.", 409);
      }
      const householdId = String(data.householdId || personRecord.households?.[0]?.id || "").trim();
      const created = await createDirectoryInvitation(env, {
        actor: context,
        parishId,
        invitationType: householdId ? "household_admin" : "person_claim",
        intendedPersonId: data.personId,
        intendedHouseholdId: householdId || null,
        intendedAuthority: householdId ? "link_and_grant_household_admin" : "link_person",
        recipientEmail: email,
        recipientLabel: personRecord.person.preferredName,
        correlationId
      });
      const sent = await markDirectoryInvitationSent(env, {
        actor: context,
        parishId,
        invitationId: created.invitation.id,
        correlationId
      });
      const url = invitationUrl(request, env, created.rawToken);
      const householdName = householdId
        ? (personRecord.households || []).find((item) => item.id === householdId)?.display_name || ""
        : "";
      const delivery = await deliverDirectoryInvitation(env, {
        email,
        personName: personRecord.person.preferredName,
        householdName,
        url
      });
      return privateJson({ ok: true, invitation: sent, invitationUrl: url, delivery: delivery.status }, { status: 201 });
    }
    const invitationMatch = path.match(/^\/invitations\/([^/]+)\/(resend|revoke)$/);
    if (invitationMatch) {
      const invitationId = decodeURIComponent(invitationMatch[1]);
      const action = invitationMatch[2];
      if (request.method === "POST" && action === "revoke") {
        return privateJson({ ok: true, invitation: await revokeDirectoryInvitation(env, { actor: context, parishId, invitationId, correlationId }) });
      }
      if (request.method === "POST" && action === "resend") {
        const limited = await rateLimit(request, env, "directory-admin-invitations", { limit: 20, windowSeconds: 300 });
        if (limited) return limited;
        const resent = await resendDirectoryInvitation(env, { actor: context, parishId, invitationId, correlationId });
        const url = invitationUrl(request, env, resent.rawToken);
        const personRecord = await getDirectoryPersonAdmin(env, { context, personId: resent.invitation.intendedPersonId });
        const householdName = resent.invitation.intendedHouseholdId
          ? (personRecord.households || []).find((item) => item.id === resent.invitation.intendedHouseholdId)?.display_name || ""
          : "";
        const delivery = await deliverDirectoryInvitation(env, {
          email: resent.invitation.recipientEmail,
          personName: personRecord.person.preferredName,
          householdName,
          url
        });
        return privateJson({ ok: true, invitation: resent.invitation, invitationUrl: url, delivery: delivery.status });
      }
    }
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
    const personMatch = path.match(/^\/people\/([^/]+)(?:\/(correction|remove-from-parish))?$/);
    if (personMatch) {
      const personId = decodeURIComponent(personMatch[1]);
      const action = personMatch[2] || "";
      if (request.method === "GET" && !action) return privateJson({ ok: true, person: await getDirectoryPersonAdmin(env, { context, personId }) });
      if (request.method === "PATCH" && action === "correction") return privateJson({ ok: true, person: await applyPersonDirectCorrection(env, { context, personId, ...await body(request), correlationId }) });
      if (request.method === "POST" && action === "remove-from-parish") return privateJson({ ok: true, person: await removeDirectoryPersonFromParish(env, { context, personId, ...await body(request), correlationId }) });
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
    if (request.method === "GET" && path === "/ministry-people") {
      return privateJson({ ok: true, people: await searchMinistryParticipantCandidates(env, { context, query: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 20 }) });
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
      if (request.method === "DELETE" && !collection) {
        const result = await deleteMinistry(env, { context, ministryId, correlationId });
        await purgeMinistryAssets(env, parishId, ministryId, result.imageStorageKey);
        return privateJson({ ok: true, result });
      }
      if (request.method === "GET" && collection === "image") return deliverMinistryImage(env, context, ministryId);
      if (request.method === "POST" && collection === "image") return privateJson({ ok: true, ministry: await uploadMinistryImage(request, env, context, ministryId, correlationId) });
      if (request.method === "DELETE" && collection === "image") {
        const existing = await getMinistryAdmin(env, { context, ministryId });
        const key = ministryImageStorageKey(parishId, ministryId);
        const ministry = await setMinistryImage(env, { context, ministryId, storageKey: "", contentType: "", correlationId });
        if (existing.ministry.hasImage && env.GROUP_MESSAGE_ASSETS) await env.GROUP_MESSAGE_ASSETS.delete(key);
        return privateJson({ ok: true, ministry });
      }
      if (request.method === "POST" && collection === "leaders") {
        return privateJson({ ok: true, ministry: await assignMinistryLeader(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "participants") {
        return privateJson({ ok: true, ministry: await assignMinistryParticipantCandidate(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
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
    if (request.method === "GET" && path === "/exports/directory.pdf") {
      const directory = await printDirectory(env, { context });
      const found = await findRegistrationByParishId(env, parishId).catch(() => null);
      const registration = found?.registration || {};
      const logo = await loadDirectoryPdfLogo(request, env, registration);
      const bytes = await buildParishDirectoryPdf({
        parish: {
          parishName: registration.parishName || registration.legalName || "Parish",
          city: registration.city || "",
          state: registration.state || registration.region || ""
        },
        directory,
        logo
      });
      return privateBinary(bytes, {
        contentType: "application/pdf",
        filename: `${parishId}-parish-directory.pdf`
      });
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
