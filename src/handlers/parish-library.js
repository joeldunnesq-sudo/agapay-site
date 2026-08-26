import {
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from "../lib/core.js";
import { hasParishPlusAccess } from "../lib/entitlements.js";
import { getParishLibrarySettings, setParishLibraryEnabled } from "../lib/parish-library.js";
import { validateSafeExternalUrl } from "../lib/safe-external-url.js";
import {
  findRegistrationByParishId,
  requireDonor,
  verifyParishDashboardBearer,
} from "./parish.js";

export const PARISH_LIBRARY_CATEGORIES = Object.freeze([
  "prayer_worship",
  "faith_formation",
  "newcomers",
  "ministries",
  "forms_policies",
  "pastoral_letters",
  "parish_life",
]);
export const PARISH_LIBRARY_PDF_MAX_BYTES = 20 * 1024 * 1024;

const database = (env) => env.AGAPAY_DB || env.DB || null;
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function categoryValue(value, fallback = "parish_life") {
  const category = String(value ?? fallback).trim().toLowerCase();
  if (!PARISH_LIBRARY_CATEGORIES.includes(category)) throw new Error("Choose a valid library category.");
  return category;
}

function nullableDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid expiration date.");
  return parsed.toISOString();
}

function resourceFromRow(row = {}) {
  const type = row.resource_type || "link";
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    title: row.title || "",
    description: row.description || "",
    category: row.category || "parish_life",
    resourceType: type,
    url: type === "link" ? row.external_url || "" : "",
    fileName: row.file_name || "",
    fileSize: Number(row.file_size || 0),
    fileReady: type === "pdf" && Boolean(row.object_key),
    status: row.status || "draft",
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at || "",
    expiresAt: row.expires_at || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function validateResourceInput(input = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || owns(input, "title")) {
    result.title = String(input.title || "").trim().slice(0, 180);
    if (!result.title) throw new Error("Resource title is required.");
  }
  if (!partial || owns(input, "description")) {
    result.description = String(input.description || "").trim().slice(0, 1200);
  }
  if (!partial || owns(input, "category")) result.category = categoryValue(input.category);
  if (!partial || owns(input, "resourceType")) {
    result.resourceType = String(input.resourceType || "").trim().toLowerCase();
    if (!["link", "pdf"].includes(result.resourceType)) throw new Error("Choose a PDF or an external link.");
  }
  if (!partial || owns(input, "url")) {
    const raw = String(input.url || "").trim();
    result.url = raw ? validateSafeExternalUrl(raw, {
      invalidMessage: "Enter a valid article link.",
      unsafeMessage: "Article links must use a public HTTPS address.",
    }).slice(0, 2000) : "";
  }
  if (!partial || owns(input, "pinned")) result.pinned = input.pinned ? 1 : 0;
  if (!partial || owns(input, "expiresAt")) result.expiresAt = nullableDate(input.expiresAt);
  return result;
}

export async function createParishLibraryResource(db, { parishId, createdBy, input }) {
  const fields = validateResourceInput(input);
  if (fields.resourceType === "link" && !fields.url) throw new Error("Article link is required.");
  if (fields.resourceType === "pdf" && fields.url) throw new Error("PDF resources use an uploaded file, not an external URL.");
  const id = generateSecret("library");
  await db.prepare(`
    INSERT INTO parish_library_resources
      (id, parish_id, title, description, category, resource_type, external_url, pinned, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, parishId, fields.title, fields.description, fields.category, fields.resourceType,
    fields.resourceType === "link" ? fields.url : null, fields.pinned, fields.expiresAt, createdBy,
  ).run();
  return resourceFromRow(await db.prepare("SELECT * FROM parish_library_resources WHERE id = ?").bind(id).first());
}

export async function updateParishLibraryResource(db, { parishId, resourceId, input }) {
  const current = await db.prepare("SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?")
    .bind(resourceId, parishId).first();
  if (!current) return null;
  if (current.status === "archived") throw new Error("Archived resources cannot be edited.");
  const fields = validateResourceInput(input, { partial: true });
  const resourceType = fields.resourceType ?? current.resource_type;
  if (resourceType !== current.resource_type) throw new Error("Create a new resource to change its type.");
  const externalUrl = resourceType === "link" ? (fields.url ?? current.external_url) : null;
  if (resourceType === "link" && !externalUrl) throw new Error("Article link is required.");
  const requestedStatus = owns(input, "status") ? String(input.status || "").trim().toLowerCase() : current.status;
  if (!["draft", "published"].includes(requestedStatus)) throw new Error("Choose draft or published status.");
  if (requestedStatus === "published" && resourceType === "pdf" && !current.object_key) {
    throw new Error("Upload the PDF before publishing this resource.");
  }
  const publishedAt = requestedStatus === "published" ? (current.published_at || new Date().toISOString()) : null;
  await db.prepare(`
    UPDATE parish_library_resources
    SET title = ?, description = ?, category = ?, external_url = ?, pinned = ?, status = ?,
        published_at = ?, expires_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(
    fields.title ?? current.title,
    fields.description ?? current.description,
    fields.category ?? current.category,
    externalUrl,
    fields.pinned ?? Number(current.pinned || 0),
    requestedStatus,
    publishedAt,
    fields.expiresAt !== undefined ? fields.expiresAt : current.expires_at,
    resourceId,
    parishId,
  ).run();
  return resourceFromRow(await db.prepare("SELECT * FROM parish_library_resources WHERE id = ?").bind(resourceId).first());
}

export async function listParishLibraryResources(db, parishId, { publishedOnly = false } = {}) {
  const result = await db.prepare(`
    SELECT * FROM parish_library_resources
    WHERE parish_id = ?${publishedOnly ? " AND status = 'published' AND (expires_at IS NULL OR expires_at > datetime('now'))" : ""}
    ORDER BY pinned DESC, COALESCE(published_at, updated_at) DESC, created_at DESC
  `).bind(parishId).all();
  return (result.results || []).map(resourceFromRow);
}

export async function archiveParishLibraryResource(db, { parishId, resourceId }) {
  await db.prepare(`
    UPDATE parish_library_resources SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(resourceId, parishId).run();
  const row = await db.prepare("SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?")
    .bind(resourceId, parishId).first();
  return row ? resourceFromRow(row) : null;
}

export async function deleteParishLibraryResource(db, bucket, { parishId, resourceId }) {
  const current = await db.prepare("SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?")
    .bind(resourceId, parishId).first();
  if (!current) return null;
  if (current.object_key && bucket) await bucket.delete(current.object_key).catch(() => {});
  await db.prepare("DELETE FROM parish_library_resources WHERE id = ? AND parish_id = ?")
    .bind(resourceId, parishId).run();
  return resourceFromRow(current);
}

export async function validateParishLibraryPdf(request) {
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/pdf") return { error: "Choose a PDF document.", status: 415 };
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > PARISH_LIBRARY_PDF_MAX_BYTES) return { error: "PDFs must be 20MB or smaller.", status: 413 };
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return { error: "The PDF is empty.", status: 422 };
  if (bytes.byteLength > PARISH_LIBRARY_PDF_MAX_BYTES) return { error: "PDFs must be 20MB or smaller.", status: 413 };
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") return { error: "The uploaded file is not a valid PDF.", status: 415 };
  return { bytes, contentType, size: bytes.byteLength };
}

function safeFileName(value) {
  const clean = String(value || "parish-resource.pdf").replace(/[\r\n"\\/]+/g, "-").trim().slice(0, 180);
  return /\.pdf$/i.test(clean) ? clean : `${clean || "parish-resource"}.pdf`;
}

async function requireLibraryAdmin(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Parish not found" }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return { error: unauthorized() };
  if (!hasParishPlusAccess(found.registration)) {
    return { error: json({ error: "Parish Library requires the Parish tier." }, { status: 403 }) };
  }
  return { found };
}

async function uploadParishLibraryPdf(request, env, parishId, resourceId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-library-pdf-upload", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  const db = database(env);
  const auth = await requireLibraryAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  if (!env.PARISH_LIBRARY_ASSETS) return json({ error: "Parish Library file storage is not configured." }, { status: 503 });
  const current = await db.prepare("SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?")
    .bind(resourceId, parishId).first();
  if (!current) return json({ error: "Resource not found" }, { status: 404 });
  if (current.resource_type !== "pdf") return json({ error: "This resource is an external link." }, { status: 422 });
  if (current.status === "archived") return json({ error: "Archived resources cannot be edited." }, { status: 422 });
  const upload = await validateParishLibraryPdf(request);
  if (upload.error) return json({ error: upload.error }, { status: upload.status });
  const fileName = safeFileName(request.headers.get("x-agapay-file-name") || `${current.title}.pdf`);
  const key = `parish-library/${encodeURIComponent(parishId)}/${encodeURIComponent(resourceId)}/${Date.now()}-${crypto.randomUUID()}.pdf`;
  await env.PARISH_LIBRARY_ASSETS.put(key, upload.bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
  });
  try {
    await db.prepare(`
      UPDATE parish_library_resources
      SET object_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ?
    `).bind(key, fileName, upload.size, resourceId, parishId).run();
  } catch (error) {
    await env.PARISH_LIBRARY_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  if (current.object_key) await env.PARISH_LIBRARY_ASSETS.delete(current.object_key).catch(() => {});
  const resource = resourceFromRow(await db.prepare("SELECT * FROM parish_library_resources WHERE id = ?").bind(resourceId).first());
  return json({ ok: true, resource });
}

export async function handleParishLibrary(request, env, parishId, subpath = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const parts = String(subpath || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 2 && parts[1] === "file") return uploadParishLibraryPdf(request, env, parishId, decodeURIComponent(parts[0]));
  const auth = await requireLibraryAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  const createdBy = normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) || `parish:${parishId}`;
  try {
    if (!parts.length && request.method === "GET") {
      return json({ settings: await getParishLibrarySettings(db, parishId), resources: await listParishLibraryResources(db, parishId) });
    }
    if (!parts.length && request.method === "POST") {
      const resource = await createParishLibraryResource(db, { parishId, createdBy, input: await request.json() });
      return json({ ok: true, resource }, { status: 201 });
    }
    if (parts.length === 1 && parts[0] === "settings" && request.method === "PATCH") {
      const input = await request.json();
      return json({ ok: true, settings: await setParishLibraryEnabled(db, { parishId, enabled: Boolean(input.enabled), updatedBy: createdBy }) });
    }
    if (parts.length === 1 && request.method === "PATCH") {
      const resource = await updateParishLibraryResource(db, { parishId, resourceId: decodeURIComponent(parts[0]), input: await request.json() });
      return resource ? json({ ok: true, resource }) : json({ error: "Resource not found" }, { status: 404 });
    }
    if (parts.length === 1 && request.method === "DELETE") {
      const resource = await deleteParishLibraryResource(db, env.PARISH_LIBRARY_ASSETS, { parishId, resourceId: decodeURIComponent(parts[0]) });
      return resource ? json({ ok: true, resource }) : json({ error: "Resource not found" }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === "archive" && request.method === "POST") {
      const resource = await archiveParishLibraryResource(db, { parishId, resourceId: decodeURIComponent(parts[0]) });
      return resource ? json({ ok: true, resource }) : json({ error: "Resource not found" }, { status: 404 });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || "Unable to update the Parish Library." }, { status: 422 });
  }
}

export async function handleDonorParishLibrary(request, env, subpath = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) return json({ error: "Choose a parish before opening its library." }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  const settings = await getParishLibrarySettings(db, parishId);
  if (!settings.enabled || !hasParishPlusAccess(found.registration)) {
    return json({ available: false, parish: { id: parishId, name: found.registration.parishName || "" }, resources: [] });
  }
  const parts = String(subpath || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (!parts.length && request.method === "GET") {
    return json({
      available: true,
      parish: { id: parishId, name: found.registration.parishName || "" },
      resources: await listParishLibraryResources(db, parishId, { publishedOnly: true }),
    });
  }
  if (parts.length === 2 && parts[1] === "file" && request.method === "GET") {
    const row = await db.prepare(`
      SELECT object_key, file_name FROM parish_library_resources
      WHERE id = ? AND parish_id = ? AND resource_type = 'pdf' AND status = 'published'
        AND object_key IS NOT NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).bind(decodeURIComponent(parts[0]), parishId).first();
    if (!row) return json({ error: "Published PDF not found" }, { status: 404 });
    if (!env.PARISH_LIBRARY_ASSETS) return json({ error: "Parish Library file storage is not configured." }, { status: 503 });
    const object = await env.PARISH_LIBRARY_ASSETS.get(row.object_key);
    if (!object) return json({ error: "PDF file not found" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFileName(row.file_name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
}
