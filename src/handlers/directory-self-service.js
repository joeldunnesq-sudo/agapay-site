import { json, unauthorized } from "../lib/core.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import {
  cancelDirectoryChangeRequest,
  createDirectoryChangeRequest,
  createHouseholdAdultInvitation,
  createSelfServiceAddress,
  createSelfServiceContact,
  deleteSelfServiceContact,
  getHouseholdSelfServiceProfile,
  getSelfServiceProfile,
  resolveDirectorySelfServiceContext,
  resendHouseholdAdultInvitation,
  revokeHouseholdAdultInvitation,
  setSelfServicePrivacyPreference,
  transitionSelfServicePublication,
  updateHouseholdSelfServiceProfile,
  updateSelfServiceContact,
  updateSelfServicePersonProfile
} from "../directory/self-service.js";

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

    if (request.method === "GET" && path === "/api/directory/self/context") {
      return json({ ok: true, context });
    }
    if (request.method === "GET" && path === "/api/directory/self/profile") {
      return json({ ok: true, profile: await getSelfServiceProfile(env, { context }) });
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
    const householdMatch = path.match(/^\/api\/directory\/households\/([^/]+)\/self(?:\/(contacts|addresses|invitations))?(?:\/([^/]+)\/(resend|revoke))?$/);
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
    if (request.method === "POST" && path === "/api/directory/privacy/preferences") {
      return json({ ok: true, preference: await setSelfServicePrivacyPreference(env, { context, ...await body(request), correlationId }) });
    }
    if (request.method === "POST" && path === "/api/directory/publication/transition") {
      return json({ ok: true, publication: await transitionSelfServicePublication(env, { context, ...await body(request), correlationId }) });
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
