import { getReadContentIds, getReadReceipts, markContentRead } from "../lib/content-reads.js";
import { communicationsEnabledFor } from "../lib/entitlements.js";
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
import {
  findRegistrationByParishId,
  requireDonor,
  verifyParishDashboardBearer,
} from "./parish.js";
import {
  PARISH_EDITORIAL_IMAGE_MAX_BYTES,
  PARISH_EDITORIAL_IMAGE_TYPES,
} from "./parish-giving-catalog.js";

const CONTENT_TYPE = "announcement";
export const ANNOUNCEMENT_ALLOWED_TAGS = Object.freeze(["strong", "em", "a", "ul", "li", "br"]);

function escapeAnnouncementHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripAuthoredHtml(value) {
  const source = String(value ?? "");
  let output = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "<") {
      output += source[index];
      continue;
    }
    let quote = "";
    let end = index + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= source.length) output += source[index];
    else index = end;
  }
  return output;
}

function safeAnnouncementHref(value) {
  const href = String(value || "").trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsed = new URL(href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? href : "";
  } catch {
    return "";
  }
}

function renderAnnouncementInline(value) {
  const source = stripAuthoredHtml(value);
  const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let html = "";
  const renderEmphasis = (text) => escapeAnnouncementHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  for (const match of source.matchAll(linkPattern)) {
    html += renderEmphasis(source.slice(cursor, match.index));
    const href = safeAnnouncementHref(match[2]);
    if (href) {
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
      html += `<a href="${escapeAnnouncementHtml(href)}"${external}>${renderEmphasis(match[1])}</a>`;
    } else {
      html += renderEmphasis(match[0]);
    }
    cursor = Number(match.index) + match[0].length;
  }
  return html + renderEmphasis(source.slice(cursor));
}

export function renderAnnouncementBody(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let listItems = [];
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderAnnouncementInline(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    blocks.push(renderAnnouncementInline(line));
  }
  flushList();
  return blocks.join("<br>");
}

function announcementFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    title: row.title || "",
    body: row.body || "",
    bodyHtml: renderAnnouncementBody(row.body || ""),
    heroImageUrl: row.hero_image_url || "",
    status: row.status || "draft",
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function validateAnnouncementInput(input = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, "title")) {
    result.title = String(input.title || "").trim().slice(0, 180);
    if (!result.title) throw new Error("Announcement title is required.");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "body")) {
    result.body = String(input.body || "").trim().slice(0, 12000);
    if (!result.body) throw new Error("Announcement body is required.");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "pinned")) {
    result.pinned = input.pinned === true || input.pinned === 1 ? 1 : 0;
  }
  return result;
}

export async function listParishAnnouncements(db, parishId) {
  const result = await db.prepare(`
    SELECT * FROM parish_announcements
    WHERE parish_id = ?
    ORDER BY pinned DESC, updated_at DESC, created_at DESC
  `).bind(parishId).all();
  return Promise.all((result.results || []).map(async (row) => {
    const announcement = announcementFromRow(row);
    if (announcement.status !== "published") return { ...announcement, readCount: 0 };
    const receipts = await getReadReceipts(db, {
      parishId,
      contentType: CONTENT_TYPE,
      contentId: announcement.id,
    });
    return { ...announcement, readCount: receipts.length };
  }));
}

function donorDisplayName(row = {}) {
  let donor = {};
  try { donor = JSON.parse(row.donor_data || "{}"); } catch { donor = {}; }
  return String(
    donor.donorName
    || [donor.firstName, donor.lastName].filter(Boolean).join(" ")
    || donor.householdName
    || row.donor_email
    || "Parishioner"
  ).trim();
}

export async function getAnnouncementReadVisibility(db, { parishId, announcementId }) {
  const announcement = await db.prepare(`
    SELECT id, status FROM parish_announcements WHERE id = ? AND parish_id = ?
  `).bind(announcementId, parishId).first();
  if (!announcement) return null;
  if (announcement.status !== "published") return { count: 0, readers: [] };

  const receipts = await getReadReceipts(db, {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: announcementId,
  });
  if (!receipts.length) return { count: 0, readers: [] };
  const resolvedRows = [];
  for (let index = 0; index < receipts.length; index += 40) {
    const batch = receipts.slice(index, index + 40);
    const values = batch.map(() => "(?, ?)").join(", ");
    const parameters = batch.flatMap(({ donorId, readAt }) => [donorId, readAt]);
    const result = await db.prepare(`
      WITH receipt_rows(donor_email, read_at) AS (VALUES ${values})
      SELECT rr.donor_email, rr.read_at, d.data AS donor_data
      FROM receipt_rows rr
      LEFT JOIN donors d ON d.email = rr.donor_email
      ORDER BY rr.read_at ASC, rr.donor_email ASC
    `).bind(...parameters).all();
    resolvedRows.push(...(result.results || []));
  }
  const readers = resolvedRows.map((row) => ({
    donorId: row.donor_email,
    displayName: donorDisplayName(row),
    readAt: row.read_at,
  }));
  return { count: readers.length, readers };
}

export async function createParishAnnouncement(db, { parishId, createdBy, input }) {
  const fields = validateAnnouncementInput(input);
  const id = generateSecret("announcement");
  await db.prepare(`
    INSERT INTO parish_announcements
      (id, parish_id, title, body, status, pinned, created_by)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `).bind(id, parishId, fields.title, fields.body, fields.pinned, createdBy).run();
  return announcementFromRow(await db.prepare("SELECT * FROM parish_announcements WHERE id = ?").bind(id).first());
}

export async function updateParishAnnouncement(db, { parishId, announcementId, input }) {
  const current = await db.prepare(
    "SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?"
  ).bind(announcementId, parishId).first();
  if (!current) return null;
  if (current.status === "archived") throw new Error("Archived announcements cannot be edited.");

  const fields = validateAnnouncementInput(input, { partial: true });
  const requestedStatus = Object.prototype.hasOwnProperty.call(input, "status")
    ? String(input.status || "").trim().toLowerCase()
    : current.status;
  if (!["draft", "published"].includes(requestedStatus)) throw new Error("Invalid announcement status.");
  if (current.status === "published" && requestedStatus === "draft") {
    throw new Error("Published announcements cannot return to draft.");
  }

  const title = fields.title ?? current.title;
  const body = fields.body ?? current.body;
  const pinned = fields.pinned ?? current.pinned;
  const publishedAt = requestedStatus === "published"
    ? (current.published_at || new Date().toISOString())
    : null;
  await db.prepare(`
    UPDATE parish_announcements
    SET title = ?, body = ?, pinned = ?, status = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(title, body, pinned, requestedStatus, publishedAt, announcementId, parishId).run();
  return announcementFromRow(await db.prepare("SELECT * FROM parish_announcements WHERE id = ?").bind(announcementId).first());
}

export async function archiveParishAnnouncement(db, { parishId, announcementId }) {
  await db.prepare(`
    UPDATE parish_announcements
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(announcementId, parishId).run();
  const row = await db.prepare(
    "SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?"
  ).bind(announcementId, parishId).first();
  return row ? announcementFromRow(row) : null;
}

export async function getDonorAnnouncementFeed(db, { parishId, donorId }) {
  const result = await db.prepare(`
    SELECT * FROM parish_announcements
    WHERE parish_id = ? AND status = 'published'
    ORDER BY pinned DESC, published_at DESC, created_at DESC
  `).bind(parishId).all();
  const announcements = (result.results || []).map(announcementFromRow);
  const contentIds = announcements.map(({ id }) => id);
  const readIds = await getReadContentIds(db, {
    parishId,
    contentType: CONTENT_TYPE,
    donorId,
    contentIds,
  });
  const readSet = new Set(readIds);
  return {
    announcements: announcements.map((announcement) => ({
      ...announcement,
      read: readSet.has(announcement.id),
    })),
    unreadCount: contentIds.length - readIds.length,
  };
}

export async function markAnnouncementRead(db, { parishId, announcementId, donorId }) {
  const row = await db.prepare(`
    SELECT id FROM parish_announcements
    WHERE id = ? AND parish_id = ? AND status = 'published'
  `).bind(announcementId, parishId).first();
  if (!row) return false;
  await markContentRead(db, {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: announcementId,
    donorId,
  });
  return true;
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

export async function validateAnnouncementHeroImage(request) {
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = PARISH_EDITORIAL_IMAGE_TYPES.get(contentType);
  if (!ext) return { error: "Announcement images must be JPG, PNG, or WebP images.", status: 415 };
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > PARISH_EDITORIAL_IMAGE_MAX_BYTES) {
    return { error: "Announcement image must be 10MB or smaller.", status: 413 };
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return { error: "Announcement image is empty.", status: 422 };
  if (bytes.byteLength > PARISH_EDITORIAL_IMAGE_MAX_BYTES) {
    return { error: "Announcement image must be 10MB or smaller.", status: 413 };
  }
  return { bytes, contentType, ext };
}

export async function handleParishAnnouncementHeroUpload(request, env, parishId, announcementId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-communications-upload", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  if (!env.ANNOUNCEMENT_ASSETS || !env.ANNOUNCEMENT_ASSETS_URL) {
    return json({ error: "Announcement image storage is not configured." }, { status: 503 });
  }
  const current = await db.prepare(
    "SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?"
  ).bind(announcementId, parishId).first();
  if (!current) return json({ error: "Announcement not found" }, { status: 404 });
  if (current.status === "archived") return json({ error: "Archived announcements cannot be edited." }, { status: 422 });

  const upload = await validateAnnouncementHeroImage(request);
  if (upload.error) return json({ error: upload.error }, { status: upload.status });
  const safeSegment = (value, fallback) => String(value || fallback).toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;
  const key = [
    "announcements",
    safeSegment(parishId, "parish"),
    safeSegment(announcementId, "announcement"),
    `${Date.now()}-${crypto.randomUUID()}.${upload.ext}`,
  ].join("/");
  await env.ANNOUNCEMENT_ASSETS.put(key, upload.bytes, {
    httpMetadata: {
      contentType: upload.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  const publicBase = String(env.ANNOUNCEMENT_ASSETS_URL).replace(/\/+$/, "");
  const heroImageUrl = `${publicBase}/${key}`;
  try {
    await db.prepare(`
      UPDATE parish_announcements SET hero_image_url = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ?
    `).bind(heroImageUrl, announcementId, parishId).run();
  } catch (error) {
    await env.ANNOUNCEMENT_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  const previousUrl = String(current.hero_image_url || "");
  if (previousUrl.startsWith(`${publicBase}/`)) {
    await env.ANNOUNCEMENT_ASSETS.delete(previousUrl.slice(publicBase.length + 1)).catch(() => {});
  }
  const announcement = announcementFromRow(await db.prepare(
    "SELECT * FROM parish_announcements WHERE id = ? AND parish_id = ?"
  ).bind(announcementId, parishId).first());
  return json({ ok: true, key, url: heroImageUrl, contentType: upload.contentType, size: upload.bytes.byteLength, announcement });
}

async function requireCommunicationsAdmin(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Parish not found" }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { error: unauthorized() };
  }
  if (!communicationsEnabledFor(found.registration)) {
    return { error: json({ error: "Communications requires the Parish tier." }, { status: 403 }) };
  }
  return { found };
}

export async function handleParishCommunications(request, env, parishId, subpath = "") {
  const normalizedSubpath = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const parts = normalizedSubpath ? normalizedSubpath.split("/") : [];
  if (parts.length === 2 && parts[1] === "hero-image") {
    return handleParishAnnouncementHeroUpload(request, env, parishId, decodeURIComponent(parts[0]));
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;

  try {
    if (!parts.length && request.method === "GET") {
      return json({ announcements: await listParishAnnouncements(db, parishId) });
    }
    if (!parts.length && request.method === "POST") {
      const input = await request.json();
      const createdBy = normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail)
        || `parish:${parishId}`;
      const announcement = await createParishAnnouncement(db, { parishId, createdBy, input });
      return json({ ok: true, announcement }, { status: 201 });
    }
    if (parts.length === 1 && request.method === "PATCH") {
      const announcement = await updateParishAnnouncement(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
        input: await request.json(),
      });
      return announcement
        ? json({ ok: true, announcement })
        : json({ error: "Announcement not found" }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === "readers" && request.method === "GET") {
      const visibility = await getAnnouncementReadVisibility(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
      });
      return visibility
        ? json({ ok: true, ...visibility })
        : json({ error: "Announcement not found" }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === "archive" && request.method === "POST") {
      const announcement = await archiveParishAnnouncement(db, {
        parishId,
        announcementId: decodeURIComponent(parts[0]),
      });
      return announcement
        ? json({ ok: true, announcement })
        : json({ error: "Announcement not found" }, { status: 404 });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || "Unable to save announcement" }, { status: 422 });
  }
}

export async function handleDonorFeed(request, env, announcementId = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) return json({ error: "Choose your home parish to view its feed." }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  if (!communicationsEnabledFor(found.registration)) {
    return json({ available: false, parish: { id: parishId, name: found.registration.parishName || "" }, announcements: [], unreadCount: 0 });
  }

  const donorId = normalizeEmail(donor.email);
  if (!announcementId && request.method === "GET") {
    const feed = await getDonorAnnouncementFeed(db, { parishId, donorId });
    return json({
      available: true,
      parish: { id: parishId, name: found.registration.parishName || "" },
      ...feed,
    });
  }
  if (announcementId && request.method === "POST") {
    const marked = await markAnnouncementRead(db, { parishId, announcementId, donorId });
    return marked
      ? json({ ok: true })
      : json({ error: "Published announcement not found" }, { status: 404 });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
}
