import { json, rateLimit, unauthorized } from "../lib/core.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import {
  getMemberDirectoryHome,
  getMemberDirectoryHousehold,
  getMemberDirectoryPerson,
  listMemberDirectoryHouseholds,
  listMemberDirectoryPeople,
  resolveMemberDirectoryContext,
  searchMemberDirectory,
  streamMemberDirectoryMediaVariant
} from "../directory/member-directory.js";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, max-age=60",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, Cookie, X-AGAPAY-User-Email"
};

function privateJson(payload, init = {}) {
  return json(payload, {
    ...init,
    headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) }
  });
}

function errorResponse(error) {
  if (error instanceof DirectoryServiceError) {
    return json({ ok: false, error: error.code, message: error.message }, {
      status: error.status || 400,
      headers: PRIVATE_HEADERS
    });
  }
  throw error;
}

async function contextFor(request, env, parishId = "") {
  try {
    return await resolveMemberDirectoryContext(env, { request, parishId });
  } catch (error) {
    if (error instanceof DirectoryServiceError && error.status === 401) return null;
    throw error;
  }
}

function requestParish(url) {
  return url.searchParams.get("parishId") || url.searchParams.get("parish") || "";
}

function listArgs(url) {
  return {
    q: url.searchParams.get("q") || "",
    letter: url.searchParams.get("letter") || "",
    sort: url.searchParams.get("sort") || "az",
    limit: url.searchParams.get("limit") || "",
    cursor: url.searchParams.get("cursor") || ""
  };
}

export async function handleDirectoryMember(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/directory/member")) return null;

  try {
    const context = await contextFor(request, env, requestParish(url));
    if (!context) return unauthorized();

    if (request.method === "GET" && path === "/api/directory/member") {
      return privateJson({ ok: true, directory: await getMemberDirectoryHome(env, { context }) });
    }

    if (request.method === "GET" && path === "/api/directory/member/people") {
      return privateJson({ ok: true, people: await listMemberDirectoryPeople(env, { context, ...listArgs(url) }) });
    }

    if (request.method === "GET" && path === "/api/directory/member/households") {
      return privateJson({ ok: true, households: await listMemberDirectoryHouseholds(env, { context, ...listArgs(url) }) });
    }

    if (request.method === "GET" && path === "/api/directory/member/search") {
      const limited = await rateLimit(request, env, `directory-member-search:${context.parishId}:${context.user.id}`, { limit: 30, windowSeconds: 60 });
      if (limited) return limited;
      return privateJson({ ok: true, results: await searchMemberDirectory(env, { context, q: url.searchParams.get("q") || "", type: url.searchParams.get("type") || "all", limit: url.searchParams.get("limit") || "", cursor: url.searchParams.get("cursor") || "" }) });
    }

    const personMatch = path.match(/^\/api\/directory\/member\/people\/([^/]+)$/);
    if (request.method === "GET" && personMatch) {
      return privateJson({ ok: true, profile: await getMemberDirectoryPerson(env, { context, personId: decodeURIComponent(personMatch[1]) }) });
    }

    const householdMatch = path.match(/^\/api\/directory\/member\/households\/([^/]+)$/);
    if (request.method === "GET" && householdMatch) {
      return privateJson({ ok: true, profile: await getMemberDirectoryHousehold(env, { context, householdId: decodeURIComponent(householdMatch[1]) }) });
    }

    const mediaMatch = path.match(/^\/api\/directory\/member\/media\/([^/]+)\/variants\/([^/]+)$/);
    if (request.method === "GET" && mediaMatch) {
      return streamMemberDirectoryMediaVariant(env, {
        context,
        mediaAssetId: decodeURIComponent(mediaMatch[1]),
        variantType: decodeURIComponent(mediaMatch[2])
      });
    }

    return null;
  } catch (error) {
    return errorResponse(error);
  }
}
