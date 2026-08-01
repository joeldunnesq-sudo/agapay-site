import { json, rateLimit, unauthorized } from "../lib/core.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import {
  acceptDirectoryInvitation,
  inspectDirectoryInvitationForRecipient
} from "../directory/claims.js";
import {
  cancelDirectoryChangeRequest,
  createDirectoryChangeRequest,
  createHouseholdAdultInvitation,
  createSelfServiceAddress,
  createSelfServiceContact,
  deleteHouseholdMember,
  deleteHouseholdNameday,
  deleteSelfServiceContact,
  getHouseholdSelfServiceProfile,
  getSelfServiceProfile,
  listHouseholdNamedays,
  resolveDirectorySelfServiceContext,
  requestHouseholdAdultAdd,
  requestHouseholdChildAdd,
  resendHouseholdAdultInvitation,
  revokeHouseholdAdultInvitation,
  saveHouseholdNameday,
  setSelfServicePrivacyPreference,
  startSelfServiceProfile,
  transitionSelfServicePublication,
  updateHouseholdMember,
  updateHouseholdSelfServiceProfile,
  updateSelfServiceContact,
  updateSelfServicePersonProfile
} from "../directory/self-service.js";
import {
  CHILD_FIELD_CODES,
  createOrUpdateChildPublicationDraft,
  getChildPublicationStatus,
  submitChildPublicationRequest,
  withdrawChildPublicationRequest
} from "../directory/child-publication.js";
import {
  getMyMinistries,
  submitMinistryInterest,
  withdrawMinistryInterest
} from "../directory/ministries.js";
import {
  completeHouseholdVerification,
  getHouseholdVerificationStatus,
  listMySkillListings,
  pauseAllMySkillListings,
  saveMySkillListing
} from "../directory/skills-service.js";
import { listMyDirectoryReviewRequests, respondToDirectoryReviewRequest } from "../directory/review-correspondence.js";
import {
  claimHouseholdShareInvitation,
  createHouseholdShareInvitation,
  inspectHouseholdShareInvitation
} from "../directory/household-share-invitations.js";

async function body(request) {
  return request.json().catch(() => ({}));
}

function errorResponse(error) {
  if (error instanceof DirectoryServiceError) {
    return json({ ok: false, error: error.code, message: error.message }, { status: error.status || 400 });
  }
  throw error;
}

async function withContext(request, env) {
  try {
    return await resolveDirectorySelfServiceContext(env, { request });
  } catch (error) {
    if (error instanceof DirectoryServiceError && error.status === 401) return null;
    throw error;
  }
}

export async function handleDirectorySelfService(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const correlationId = request.headers.get("X-Request-Id") || "";
  try {
    const context = await withContext(request, env);
    if (!context) return unauthorized();

    const householdShareTokenMatch = path.match(/^\/api\/directory\/household-share\/([^/]+)(?:\/(claim))?$/);
    if (householdShareTokenMatch) {
      const limited = await rateLimit(request, env, "directory-household-share-recipient", { limit: 20, windowSeconds: 300 });
      if (limited) return limited;
      const token = decodeURIComponent(householdShareTokenMatch[1]);
      const action = householdShareTokenMatch[2] || "";
      if (request.method === "GET" && !action) {
        return json({ ok: true, invitation: await inspectHouseholdShareInvitation(env, { token }) });
      }
      if (request.method === "POST" && action === "claim") {
        return json({ ok: true, result: await claimHouseholdShareInvitation(env, { context, token, correlationId }) }, { status: 201 });
      }
    }

    const invitationMatch = path.match(/^\/api\/directory\/invitations\/([^/]+)(?:\/(accept))?$/);
    if (invitationMatch) {
      const limited = await rateLimit(request, env, "directory-invitation-recipient", { limit: 30, windowSeconds: 300 });
      if (limited) return limited;
      const token = decodeURIComponent(invitationMatch[1]);
      const action = invitationMatch[2] || "";
      if (request.method === "GET" && !action) {
        return json({ ok: true, invitation: await inspectDirectoryInvitationForRecipient(env, { token }) });
      }
      if (request.method === "POST" && action === "accept") {
        return json({
          ok: true,
          result: await acceptDirectoryInvitation(env, {
            user: context.user,
            token,
            correlationId
          })
        });
      }
    }
    if (request.method === "GET" && path === "/api/directory/self/context") {
      return json({ ok: true, context });
    }
    if (request.method === "GET" && path === "/api/directory/self/profile") {
      return json({ ok: true, profile: await getSelfServiceProfile(env, { context }) });
    }
    if (request.method === "GET" && path === "/api/directory/self/review-requests") {
      return json({ ok: true, requests: await listMyDirectoryReviewRequests(env, { context }) });
    }
    const reviewResponseMatch = path.match(/^\/api\/directory\/self\/review-requests\/([^/]+)\/([^/]+)\/respond$/);
    if (request.method === "POST" && reviewResponseMatch) {
      return json({ ok: true, result: await respondToDirectoryReviewRequest(env, {
        context,
        sourceType: decodeURIComponent(reviewResponseMatch[1]),
        sourceId: decodeURIComponent(reviewResponseMatch[2]),
        message: (await body(request)).message,
        correlationId
      }) });
    }
    if (request.method === "POST" && path === "/api/directory/self/start-profile") {
      return json({ ok: true, profile: await startSelfServiceProfile(env, { context, data: await body(request), correlationId }) }, { status: 201 });
    }
    if (request.method === "GET" && path === "/api/directory/self/ministries") {
      return json({ ok: true, ministries: await getMyMinistries(env, { context }) });
    }
    if (request.method === "GET" && path === "/api/directory/self/skills") {
      return json({ ok: true, skills: await listMySkillListings(env, { context }) });
    }
    if (request.method === "POST" && path === "/api/directory/self/skills") {
      return json({ ok: true, listing: await saveMySkillListing(env, { context, data: await body(request), correlationId }) }, { status: 201 });
    }
    const skillMatch = path.match(/^\/api\/directory\/self\/skills\/([^/]+)$/);
    if (request.method === "PATCH" && skillMatch) {
      return json({ ok: true, listing: await saveMySkillListing(env, { context, listingId: decodeURIComponent(skillMatch[1]), data: await body(request), correlationId }) });
    }
    if (request.method === "POST" && path === "/api/directory/self/skills/pause-all") {
      return json({ ok: true, skills: await pauseAllMySkillListings(env, { context, correlationId }) });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/self/ministries/") && path.endsWith("/interest")) {
      const ministryId = decodeURIComponent(path.replace("/api/directory/self/ministries/", "").replace("/interest", ""));
      return json({ ok: true, request: await submitMinistryInterest(env, { context, ministryId, ...await body(request), correlationId }) }, { status: 201 });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/self/ministry-interest/") && path.endsWith("/withdraw")) {
      const requestId = decodeURIComponent(path.replace("/api/directory/self/ministry-interest/", "").replace("/withdraw", ""));
      return json({ ok: true, request: await withdrawMinistryInterest(env, { context, requestId, correlationId }) });
    }
    if (request.method === "PATCH" && path === "/api/directory/self/profile") {
      return json({ ok: true, person: await updateSelfServicePersonProfile(env, { context, patch: await body(request), correlationId }) });
    }
    if (request.method === "POST" && path === "/api/directory/self/contacts") {
      const data = await body(request);
      return json({ ok: true, contact: await createSelfServiceContact(env, { context, ownerType: "person", ownerId: context.currentPerson?.id, data, correlationId }) }, { status: 201 });
    }
    if (path.startsWith("/api/directory/self/contacts/")) {
      const contactId = decodeURIComponent(path.replace("/api/directory/self/contacts/", ""));
      if (request.method === "PATCH") {
        return json({ ok: true, contact: await updateSelfServiceContact(env, { context, contactId, patch: await body(request), correlationId }) });
      }
      if (request.method === "DELETE") {
        return json({ ok: true, contact: await deleteSelfServiceContact(env, { context, contactId, correlationId }) });
      }
    }
    const namedayMatch = path.match(/^\/api\/directory\/households\/([^/]+)\/self\/namedays\/([^/]+)$/);
    if (request.method === "PATCH" && namedayMatch) {
      return json({
        ok: true,
        nameday: await saveHouseholdNameday(env, {
          context,
          householdId: decodeURIComponent(namedayMatch[1]),
          namedayId: decodeURIComponent(namedayMatch[2]),
          data: await body(request),
          correlationId
        })
      });
    }
    if (request.method === "DELETE" && namedayMatch) {
      return json({
        ok: true,
        nameday: await deleteHouseholdNameday(env, {
          context,
          householdId: decodeURIComponent(namedayMatch[1]),
          namedayId: decodeURIComponent(namedayMatch[2]),
          correlationId
        })
      });
    }
    const memberMatch = path.match(/^\/api\/directory\/households\/([^/]+)\/self\/members\/([^/]+)(?:\/(share-link))?$/);
    if (memberMatch) {
      const householdId = decodeURIComponent(memberMatch[1]);
      const personId = decodeURIComponent(memberMatch[2]);
      const action = memberMatch[3] || "";
      if (request.method === "POST" && action === "share-link") {
        const limited = await rateLimit(request, env, "directory-household-share-create", { limit: 10, windowSeconds: 300 });
        if (limited) return limited;
        return json({ ok: true, invitation: await createHouseholdShareInvitation(env, { context, householdId, personId, correlationId }) }, { status: 201 });
      }
      if (request.method === "PATCH" && !action) {
        return json({ ok: true, member: await updateHouseholdMember(env, { context, householdId, personId, data: await body(request), correlationId }) });
      }
      if (request.method === "DELETE" && !action) {
        return json({ ok: true, member: await deleteHouseholdMember(env, { context, householdId, personId, correlationId }) });
      }
    }
    const householdMatch = path.match(/^\/api\/directory\/households\/([^/]+)\/self(?:\/(contacts|addresses|invitations|namedays|children|adults))?(?:\/([^/]+)\/(resend|revoke))?$/);
    if (householdMatch) {
      const householdId = decodeURIComponent(householdMatch[1]);
      const collection = householdMatch[2] || "";
      const itemId = householdMatch[3] ? decodeURIComponent(householdMatch[3]) : "";
      const action = householdMatch[4] || "";
      if (request.method === "GET" && !collection) {
        return json({ ok: true, household: await getHouseholdSelfServiceProfile(env, { context, householdId }) });
      }
      if (request.method === "PATCH" && !collection) {
        return json({ ok: true, household: await updateHouseholdSelfServiceProfile(env, { context, householdId, patch: await body(request), correlationId }) });
      }
      if (request.method === "POST" && collection === "contacts") {
        return json({ ok: true, contact: await createSelfServiceContact(env, { context, ownerType: "household", ownerId: householdId, data: await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "addresses") {
        return json({ ok: true, address: await createSelfServiceAddress(env, { context, householdId, data: await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "GET" && collection === "namedays") {
        return json({ ok: true, namedays: await listHouseholdNamedays(env, { context, householdId }) });
      }
      if (request.method === "POST" && collection === "namedays" && !itemId) {
        return json({ ok: true, nameday: await saveHouseholdNameday(env, { context, householdId, data: await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "children" && !itemId) {
        return json({ ok: true, request: await requestHouseholdChildAdd(env, { context, householdId, data: await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "adults" && !itemId) {
        return json({ ok: true, request: await requestHouseholdAdultAdd(env, { context, householdId, data: await body(request), correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "invitations" && !itemId) {
        const data = await body(request);
        return json({ ok: true, invitation: await createHouseholdAdultInvitation(env, { context, householdId, personId: data.personId, email: data.email, phone: data.phone, correlationId }) }, { status: 201 });
      }
      if (request.method === "POST" && collection === "invitations" && action === "resend") {
        return json({ ok: true, invitation: await resendHouseholdAdultInvitation(env, { context, invitationId: itemId, correlationId }) });
      }
      if (request.method === "POST" && collection === "invitations" && action === "revoke") {
        return json({ ok: true, invitation: await revokeHouseholdAdultInvitation(env, { context, invitationId: itemId, correlationId }) });
      }
    }
    const householdVerificationMatch = path.match(/^\/api\/directory\/households\/([^/]+)\/verification(?:\/complete)?$/);
    if (householdVerificationMatch) {
      const householdId = decodeURIComponent(householdVerificationMatch[1]);
      if (request.method === "GET" && !path.endsWith("/complete")) {
        return json({ ok: true, verification: await getHouseholdVerificationStatus(env, { context, householdId }) });
      }
      if (request.method === "POST" && path.endsWith("/complete")) {
        return json({ ok: true, verification: await completeHouseholdVerification(env, { context, householdId, ...await body(request), correlationId }) });
      }
    }
    if (request.method === "POST" && path === "/api/directory/privacy/preferences") {
      return json({ ok: true, preference: await setSelfServicePrivacyPreference(env, { context, ...await body(request), correlationId }) });
    }
    if (request.method === "POST" && path === "/api/directory/publication/transition") {
      return json({ ok: true, publication: await transitionSelfServicePublication(env, { context, ...await body(request), correlationId }) });
    }
    if (request.method === "GET" && path === "/api/directory/children/publication/field-codes") {
      return json({ ok: true, fieldCodes: CHILD_FIELD_CODES });
    }
    if (request.method === "GET" && path.startsWith("/api/directory/children/") && path.endsWith("/publication")) {
      const childPersonId = decodeURIComponent(path.replace("/api/directory/children/", "").replace("/publication", ""));
      const householdId = url.searchParams.get("householdId") || "";
      return json({ ok: true, request: await getChildPublicationStatus(env, { context, childPersonId, householdId }) });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/children/") && path.endsWith("/publication/draft")) {
      const childPersonId = decodeURIComponent(path.replace("/api/directory/children/", "").replace("/publication/draft", ""));
      const data = await body(request);
      return json({
        ok: true,
        request: await createOrUpdateChildPublicationDraft(env, {
          context,
          childPersonId,
          householdId: data.householdId,
          requestedFields: data.requestedFields,
          requestedPhoto: Boolean(data.requestedPhoto),
          parentNote: data.parentNote || "",
          correlationId
        })
      }, { status: 201 });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/children/publication/") && path.endsWith("/submit")) {
      const requestId = decodeURIComponent(path.replace("/api/directory/children/publication/", "").replace("/submit", ""));
      const data = await body(request);
      return json({ ok: true, request: await submitChildPublicationRequest(env, {
        context,
        requestId,
        householdAdminPublish: Boolean(data.householdAdminPublish),
        correlationId
      }) });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/children/publication/") && path.endsWith("/withdraw")) {
      const requestId = decodeURIComponent(path.replace("/api/directory/children/publication/", "").replace("/withdraw", ""));
      return json({ ok: true, request: await withdrawChildPublicationRequest(env, { context, requestId, correlationId }) });
    }
    if (request.method === "POST" && path === "/api/directory/change-requests") {
      return json({ ok: true, request: await createDirectoryChangeRequest(env, { context, ...await body(request), correlationId }) }, { status: 201 });
    }
    if (request.method === "POST" && path.startsWith("/api/directory/change-requests/") && path.endsWith("/cancel")) {
      const requestId = decodeURIComponent(path.replace("/api/directory/change-requests/", "").replace("/cancel", ""));
      return json({ ok: true, request: await cancelDirectoryChangeRequest(env, { context, requestId, correlationId }) });
    }
    return null;
  } catch (error) {
    return errorResponse(error);
  }
}
