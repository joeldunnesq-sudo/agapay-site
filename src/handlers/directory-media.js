import { json, rateLimit, unauthorized } from "../lib/core.js";
import { DirectoryServiceError } from "../directory/foundation.js";
import { resolveDirectorySelfServiceContext } from "../directory/self-service.js";
import {
  completeDirectoryMediaUpload,
  createDirectoryMediaUploadSession,
  getCurrentDirectoryMediaForOwner,
  removeDirectoryMedia,
  streamDirectoryMediaVariant,
  submitDirectoryMediaForReview
} from "../directory/media.js";

async function errorResponse(error) {
  if (error instanceof DirectoryServiceError) {
    return json({ ok: false, error: error.code, message: error.message }, { status: error.status || 400 });
  }
  throw error;
}

async function contextFor(request, env) {
  try {
    return await resolveDirectorySelfServiceContext(env, { request });
  } catch (error) {
    if (error instanceof DirectoryServiceError && error.status === 401) return null;
    throw error;
  }
}

async function parseJson(request) {
  return request.json().catch(() => ({}));
}

export async function handleDirectoryMedia(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const correlationId = request.headers.get("X-Request-Id") || "";
  try {
    const context = await contextFor(request, env);
    if (!context) return unauthorized();

    if (request.method === "POST" && path === "/api/directory/media/upload-session") {
      const limited = await rateLimit(request, env, "directory-media-session", { limit: 12, windowSeconds: 3600 });
      if (limited) return limited;
      const body = await parseJson(request);
      const session = await createDirectoryMediaUploadSession(env, {
        context,
        ownerType: body.ownerType,
        ownerId: body.ownerId,
        visibility: body.visibility || "private",
        correlationId
      });
      return json({ ok: true, session }, { status: 201 });
    }

    const completeMatch = path.match(/^\/api\/directory\/media\/sessions\/([^/]+)\/complete$/);
    if (request.method === "POST" && completeMatch) {
      const limited = await rateLimit(request, env, "directory-media-complete", { limit: 12, windowSeconds: 3600 });
      if (limited) return limited;
      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ ok: false, error: "invalid_upload", message: "Expected multipart/form-data with a photo file." }, { status: 400 });
      }
      const file = form.get("photo");
      if (!file || typeof file.arrayBuffer !== "function") {
        return json({ ok: false, error: "missing_photo", message: "No photo file was included." }, { status: 422 });
      }
      const crop = {
        x: form.get("cropX"),
        y: form.get("cropY"),
        width: form.get("cropWidth"),
        height: form.get("cropHeight")
      };
      const asset = await completeDirectoryMediaUpload(env, {
        context,
        sessionId: decodeURIComponent(completeMatch[1]),
        file,
        arrayBuffer: await file.arrayBuffer(),
        crop: Object.values(crop).some((value) => value !== null && value !== "") ? crop : null,
        correlationId
      });
      return json({ ok: true, asset }, { status: 201 });
    }

    if (request.method === "GET" && path === "/api/directory/media/current") {
      const ownerType = url.searchParams.get("ownerType") || "person";
      const ownerId = url.searchParams.get("ownerId") || context.currentPerson?.id || "";
      const assets = await getCurrentDirectoryMediaForOwner(env, { context, ownerType, ownerId });
      return json({ ok: true, assets });
    }

    const submitMatch = path.match(/^\/api\/directory\/media\/([^/]+)\/submit$/);
    if (request.method === "POST" && submitMatch) {
      const asset = await submitDirectoryMediaForReview(env, { context, mediaAssetId: decodeURIComponent(submitMatch[1]), correlationId });
      return json({ ok: true, asset });
    }

    const deleteMatch = path.match(/^\/api\/directory\/media\/([^/]+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const result = await removeDirectoryMedia(env, { context, mediaAssetId: decodeURIComponent(deleteMatch[1]), correlationId });
      return json({ ok: true, media: result });
    }

    const viewMatch = path.match(/^\/api\/directory\/media\/([^/]+)\/variants\/([^/]+)$/);
    if (request.method === "GET" && viewMatch) {
      return streamDirectoryMediaVariant(env, {
        context,
        mediaAssetId: decodeURIComponent(viewMatch[1]),
        variantType: decodeURIComponent(viewMatch[2])
      });
    }

    return null;
  } catch (error) {
    return errorResponse(error);
  }
}
