import { getReadContentIds, getReadReceipts, markContentRead } from "../lib/content-reads.js";
import { communicationsEnabledFor } from "../lib/entitlements.js";
import { generateSecret, hasProductionStore, json, missingProductionStoreResponse, normalizeEmail, rateLimit, unauthorized } from "../lib/core.js";
import { sendTeachingPush } from "../lib/push-notifications.js";
import { renderBoundedRichText } from "../lib/rich-text.js";
import { findRegistrationByParishId, requireDonor } from "./parish.js";
import { requireCommunicationsAdmin } from "./parish-communications.js";

const CONTENT_TYPE = "teaching";
export const TEACHING_ALLOWED_TAGS = Object.freeze(["strong", "em", "a", "ul", "li", "br"]);
export const TEACHING_CATEGORIES = Object.freeze(["homilies", "catechism", "liturgical", "choir", "special_events"]);
export const TEACHING_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const TEACHING_AUDIO_TYPES = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/webm", "webm"],
]);

export function renderTeachingBody(value) {
  return renderBoundedRichText(value, TEACHING_ALLOWED_TAGS);
}

function teachingCategory(value, fallback = "homilies") {
  const category = String(value ?? fallback).trim().toLowerCase();
  if (!TEACHING_CATEGORIES.includes(category)) throw new Error("Invalid teaching category.");
  return category;
}

function teachingFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    title: row.title || "",
    body: row.body || "",
    bodyHtml: renderTeachingBody(row.body || ""),
    audioUrl: row.audio_url || "",
    category: row.category || "homilies",
    status: row.status || "draft",
    publishedAt: row.published_at || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function validateTeachingInput(input = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, "title")) {
    result.title = String(input.title || "").trim().slice(0, 180);
    if (!result.title) throw new Error("Teaching title is required.");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "body")) {
    result.body = String(input.body || "").trim().slice(0, 20000);
    if (!result.body) throw new Error("Teaching body is required.");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "category")) {
    result.category = teachingCategory(input.category);
  }
  return result;
}

export async function createParishTeachingPost(db, { parishId, createdBy, input }) {
  const fields = validateTeachingInput(input);
  const id = generateSecret("teaching");
  await db.prepare(`
    INSERT INTO parish_teaching_posts (id, parish_id, title, body, category, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, parishId, fields.title, fields.body, fields.category, createdBy).run();
  return teachingFromRow(await db.prepare("SELECT * FROM parish_teaching_posts WHERE id = ?").bind(id).first());
}

export async function updateParishTeachingPost(db, { parishId, teachingId, input, onPublished }) {
  const current = await db.prepare(
    "SELECT * FROM parish_teaching_posts WHERE id = ? AND parish_id = ?"
  ).bind(teachingId, parishId).first();
  if (!current) return null;
  if (current.status === "archived") throw new Error("Archived teaching posts cannot be edited.");
  const fields = validateTeachingInput(input, { partial: true });
  const requestedStatus = Object.prototype.hasOwnProperty.call(input, "status")
    ? String(input.status || "").trim().toLowerCase()
    : current.status;
  if (!["draft", "published"].includes(requestedStatus)) throw new Error("Invalid teaching status.");
  if (current.status === "published" && requestedStatus === "draft") {
    throw new Error("Published teaching posts cannot return to draft.");
  }
  const publishedAt = requestedStatus === "published" ? (current.published_at || new Date().toISOString()) : null;
  const category = fields.category ?? current.category ?? "homilies";
  await db.prepare(`
    UPDATE parish_teaching_posts
    SET title = ?, body = ?, category = ?, status = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(fields.title ?? current.title, fields.body ?? current.body, category, requestedStatus, publishedAt, teachingId, parishId).run();
  const teaching = teachingFromRow(await db.prepare("SELECT * FROM parish_teaching_posts WHERE id = ?").bind(teachingId).first());
  if (current.status !== "published" && requestedStatus === "published" && typeof onPublished === "function") {
    onPublished(teaching);
  }
  return teaching;
}

export async function archiveParishTeachingPost(db, { parishId, teachingId }) {
  await db.prepare(`
    UPDATE parish_teaching_posts SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(teachingId, parishId).run();
  const row = await db.prepare(
    "SELECT * FROM parish_teaching_posts WHERE id = ? AND parish_id = ?"
  ).bind(teachingId, parishId).first();
  return row ? teachingFromRow(row) : null;
}

export async function listParishTeachingPosts(db, parishId) {
  const result = await db.prepare(`
    SELECT * FROM parish_teaching_posts WHERE parish_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).bind(parishId).all();
  return Promise.all((result.results || []).map(async (row) => {
    const post = teachingFromRow(row);
    if (post.status !== "published") return { ...post, readCount: 0 };
    const receipts = await getReadReceipts(db, { parishId, contentType: CONTENT_TYPE, contentId: post.id });
    return { ...post, readCount: receipts.length };
  }));
}

export async function getDonorTeachingFeed(db, { parishId, donorId, category = "" }) {
  const selectedCategory = category ? teachingCategory(category, "") : "";
  const result = await db.prepare(`
    SELECT * FROM parish_teaching_posts
    WHERE parish_id = ? AND status = 'published'${selectedCategory ? " AND category = ?" : ""}
    ORDER BY published_at DESC, created_at DESC
  `).bind(...(selectedCategory ? [parishId, selectedCategory] : [parishId])).all();
  const posts = (result.results || []).map(teachingFromRow);
  const contentIds = posts.map(({ id }) => id);
  const readIds = await getReadContentIds(db, { parishId, contentType: CONTENT_TYPE, donorId, contentIds });
  const readSet = new Set(readIds);
  return {
    posts: posts.map((post) => ({ ...post, read: readSet.has(post.id) })),
    unreadCount: contentIds.length - readIds.length,
  };
}

export async function markTeachingRead(db, { parishId, teachingId, donorId }) {
  const row = await db.prepare(`
    SELECT id FROM parish_teaching_posts
    WHERE id = ? AND parish_id = ? AND status = 'published'
  `).bind(teachingId, parishId).first();
  if (!row) return false;
  await markContentRead(db, { parishId, contentType: CONTENT_TYPE, contentId: teachingId, donorId });
  return true;
}

export function validateTeachingAudioMetadata(request) {
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = TEACHING_AUDIO_TYPES.get(contentType);
  if (!ext) return { error: "Teaching audio must be MP3, M4A, WAV, OGG, or WebM audio.", status: 415 };
  const rawLength = String(request.headers.get("content-length") || "").trim();
  const contentLength = rawLength ? Number(rawLength) : 0;
  if (rawLength && (!Number.isFinite(contentLength) || contentLength < 1)) {
    return { error: "Teaching audio is empty.", status: 422 };
  }
  if (contentLength > TEACHING_AUDIO_MAX_BYTES) {
    return { error: "Teaching audio must be 50MB or smaller.", status: 413 };
  }
  return { contentType, contentLength, ext };
}

export function limitTeachingAudioStream(source, maxBytes = TEACHING_AUDIO_MAX_BYTES) {
  let bytesRead = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk?.byteLength ?? chunk?.length ?? 0;
      bytesRead += bytes;
      if (bytesRead > maxBytes) throw new Error("TEACHING_AUDIO_TOO_LARGE");
      controller.enqueue(chunk);
    },
  });
  return { stream: source.pipeThrough(limiter), bytesRead: () => bytesRead };
}

export async function storeTeachingAudio(bucket, { key, source, contentType, maxBytes = TEACHING_AUDIO_MAX_BYTES }) {
  const bounded = limitTeachingAudioStream(source, maxBytes);
  try {
    const object = await bucket.put(key, bounded.stream, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return { object, size: Number(object?.size ?? bounded.bytesRead()) };
  } catch (error) {
    await bucket.delete(key).catch(() => {});
    throw error;
  }
}

function safeSegment(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;
}

export async function handleParishTeachingAudioUpload(request, env, parishId, teachingId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-teaching-audio-upload", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = env.AGAPAY_DB || env.DB;
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  if (!env.TEACHING_ASSETS || !env.TEACHING_ASSETS_URL) {
    return json({ error: "Teaching audio storage is not configured." }, { status: 503 });
  }
  const current = await db.prepare(
    "SELECT * FROM parish_teaching_posts WHERE id = ? AND parish_id = ?"
  ).bind(teachingId, parishId).first();
  if (!current) return json({ error: "Teaching post not found" }, { status: 404 });
  if (current.status === "archived") return json({ error: "Archived teaching posts cannot be edited." }, { status: 422 });
  const metadata = validateTeachingAudioMetadata(request);
  if (metadata.error) return json({ error: metadata.error }, { status: metadata.status });
  if (!request.body) return json({ error: "Teaching audio is empty." }, { status: 422 });

  const key = ["teaching", safeSegment(parishId, "parish"), safeSegment(teachingId, "post"), `${Date.now()}-${crypto.randomUUID()}.${metadata.ext}`].join("/");
  let stored;
  try {
    stored = await storeTeachingAudio(env.TEACHING_ASSETS, { key, source: request.body, contentType: metadata.contentType });
  } catch (error) {
    if (error?.message === "TEACHING_AUDIO_TOO_LARGE") {
      return json({ error: "Teaching audio must be 50MB or smaller." }, { status: 413 });
    }
    throw error;
  }
  const size = stored.size;
  if (!size) {
    await env.TEACHING_ASSETS.delete(key).catch(() => {});
    return json({ error: "Teaching audio is empty." }, { status: 422 });
  }
  const publicBase = String(env.TEACHING_ASSETS_URL).replace(/\/+$/, "");
  const audioUrl = `${publicBase}/${key}`;
  try {
    await db.prepare(`
      UPDATE parish_teaching_posts SET audio_url = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ?
    `).bind(audioUrl, teachingId, parishId).run();
  } catch (error) {
    await env.TEACHING_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  const previousUrl = String(current.audio_url || "");
  if (previousUrl.startsWith(`${publicBase}/`)) {
    await env.TEACHING_ASSETS.delete(previousUrl.slice(publicBase.length + 1)).catch(() => {});
  }
  const post = teachingFromRow(await db.prepare("SELECT * FROM parish_teaching_posts WHERE id = ?").bind(teachingId).first());
  return json({ ok: true, key, url: audioUrl, contentType: metadata.contentType, size, post });
}

export async function handleParishTeaching(request, env, parishId, subpath = "", ctx = null) {
  const normalized = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const parts = normalized ? normalized.split("/") : [];
  if (parts.length === 2 && parts[1] === "audio") {
    return handleParishTeachingAudioUpload(request, env, parishId, decodeURIComponent(parts[0]));
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = env.AGAPAY_DB || env.DB;
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  try {
    if (!parts.length && request.method === "GET") return json({ posts: await listParishTeachingPosts(db, parishId) });
    if (!parts.length && request.method === "POST") {
      const createdBy = normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) || `parish:${parishId}`;
      const post = await createParishTeachingPost(db, { parishId, createdBy, input: await request.json() });
      return json({ ok: true, post }, { status: 201 });
    }
    if (parts.length === 1 && request.method === "PATCH") {
      const post = await updateParishTeachingPost(db, {
        parishId,
        teachingId: decodeURIComponent(parts[0]),
        input: await request.json(),
        onPublished: (publishedTeaching) => {
          if (!ctx?.waitUntil) return;
          if (!communicationsEnabledFor(auth.found.registration)) return;
          const delivery = sendTeachingPush(env, {
            parishId,
            parishName: auth.found.registration.parishName || "your parish",
            teaching: publishedTeaching,
          }).then((summary) => console.log("teaching_push_delivery", JSON.stringify({ parishId, teachingId: publishedTeaching.id, ...summary })))
            .catch((error) => console.error("teaching_push_delivery_failed", error?.message || String(error)));
          ctx.waitUntil(delivery);
        },
      });
      return post ? json({ ok: true, post }) : json({ error: "Teaching post not found" }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === "readers" && request.method === "GET") {
      const teachingId = decodeURIComponent(parts[0]);
      const post = await db.prepare("SELECT status FROM parish_teaching_posts WHERE id = ? AND parish_id = ?").bind(teachingId, parishId).first();
      if (!post) return json({ error: "Teaching post not found" }, { status: 404 });
      const readers = post.status === "published" ? await getReadReceipts(db, { parishId, contentType: CONTENT_TYPE, contentId: teachingId }) : [];
      return json({ ok: true, count: readers.length, readers });
    }
    if (parts.length === 2 && parts[1] === "archive" && request.method === "POST") {
      const post = await archiveParishTeachingPost(db, { parishId, teachingId: decodeURIComponent(parts[0]) });
      return post ? json({ ok: true, post }) : json({ error: "Teaching post not found" }, { status: 404 });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || "Unable to save teaching post" }, { status: 422 });
  }
}

export async function handleDonorTeaching(request, env, teachingId = "", action = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = env.AGAPAY_DB || env.DB;
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) return json({ error: "Choose your home parish to view teaching." }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  if (!communicationsEnabledFor(found.registration)) {
    return json({ available: false, parish: { id: parishId, name: found.registration.parishName || "" }, posts: [], unreadCount: 0 });
  }
  const donorId = normalizeEmail(donor.email);
  if (!teachingId && request.method === "GET") {
    try {
      return json({
        available: true,
        parish: { id: parishId, name: found.registration.parishName || "" },
        ...(await getDonorTeachingFeed(db, {
          parishId,
          donorId,
          category: new URL(request.url).searchParams.get("category") || "",
        })),
      });
    } catch (error) {
      return json({ error: error.message }, { status: 422 });
    }
  }
  if (teachingId && action === "read" && request.method === "POST") {
    const marked = await markTeachingRead(db, { parishId, teachingId, donorId });
    return marked ? json({ ok: true }) : json({ error: "Published teaching post not found" }, { status: 404 });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
}
