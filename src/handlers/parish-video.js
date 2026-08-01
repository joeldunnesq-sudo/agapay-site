import { getReadContentIds, getReadReceipts, markContentRead } from "../lib/content-reads.js";
import { communicationsEnabledFor } from "../lib/entitlements.js";
import { generateSecret, hasProductionStore, json, missingProductionStoreResponse, normalizeEmail, rateLimit } from "../lib/core.js";
import { renderBoundedRichText } from "../lib/rich-text.js";
import { findRegistrationByParishId } from "./parish.js";
import { verifiedHouseholdAccess } from "./koinonia-access.js";
import { requireCommunicationsAdmin } from "./parish-communications.js";

const CONTENT_TYPE = "video";
const STREAM_API_ROOT = "https://api.cloudflare.com/client/v4/accounts";
export const VIDEO_ALLOWED_TAGS = Object.freeze(["strong", "em", "a", "ul", "li", "br"]);
export const VIDEO_MAX_DURATION_SECONDS = 4 * 60 * 60;

export function renderVideoDescription(value) {
  return renderBoundedRichText(value, VIDEO_ALLOWED_TAGS);
}

function videoFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    title: row.title || "",
    description: row.description || "",
    descriptionHtml: renderVideoDescription(row.description || ""),
    streamVideoId: row.stream_video_id || "",
    status: row.status || "draft",
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function youtubeFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    youtubeUrl: row.youtube_url || "",
    title: row.title || "",
    thumbnailUrl: row.thumbnail_url || "",
    addedBy: row.added_by || "",
    addedAt: row.added_at || "",
    external: true,
  };
}

function validateVideoInput(input = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || Object.prototype.hasOwnProperty.call(input, "title")) {
    result.title = String(input.title || "").trim().slice(0, 180);
    if (!result.title) throw new Error("Video title is required.");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "description")) {
    result.description = String(input.description || "").trim().slice(0, 20000);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(input, "pinned")) {
    result.pinned = input.pinned ? 1 : 0;
  }
  return result;
}

function streamConfiguration(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(env.CLOUDFLARE_STREAM_API_TOKEN || "").trim();
  if (!accountId || !apiToken) throw new Error("Cloudflare Stream is not configured.");
  return { accountId, apiToken };
}

export async function callStreamApi(env, path, init = {}, fetchImpl = fetch) {
  const { accountId, apiToken } = streamConfiguration(env);
  const response = await fetchImpl(`${STREAM_API_ROOT}/${encodeURIComponent(accountId)}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.[0]?.message || `Cloudflare Stream request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status || 502;
    throw error;
  }
  return payload.result;
}

export function streamIsReady(details = {}) {
  return details.readyToStream === true && String(details.status?.state || "").toLowerCase() === "ready";
}

function allowedOrigins(request, env) {
  const hosts = new Set();
  for (const candidate of [request.url, env.AGAPAY_APP_URL, env.AGAPAY_PUBLIC_URL]) {
    try { hosts.add(new URL(candidate).hostname); } catch {}
  }
  return [...hosts].filter(Boolean);
}

export async function createStreamUpload(env, { request, parishId, createdBy, maxDurationSeconds = VIDEO_MAX_DURATION_SECONDS }, fetchImpl = fetch) {
  return callStreamApi(env, "/direct_upload", {
    method: "POST",
    body: JSON.stringify({
      maxDurationSeconds,
      expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      requireSignedURLs: true,
      allowedOrigins: allowedOrigins(request, env),
      creator: String(createdBy || parishId).slice(0, 64),
      meta: { parishId },
      thumbnailTimestampPct: 0.15,
    }),
  }, fetchImpl);
}

export async function createVideoDraft(db, { parishId, createdBy, streamVideoId, input }) {
  const fields = validateVideoInput(input);
  const id = generateSecret("video");
  await db.prepare(`
    INSERT INTO parish_video_posts (id, parish_id, title, description, stream_video_id, status, pinned, created_by)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
  `).bind(id, parishId, fields.title, fields.description, streamVideoId, fields.pinned, createdBy).run();
  return videoFromRow(await db.prepare("SELECT * FROM parish_video_posts WHERE id = ?").bind(id).first());
}

export async function updateVideoPost(db, { parishId, videoId, input, streamDetails = null }) {
  const current = await db.prepare("SELECT * FROM parish_video_posts WHERE id = ? AND parish_id = ?").bind(videoId, parishId).first();
  if (!current) return null;
  if (current.status === "archived") throw new Error("Archived videos cannot be edited.");
  const fields = validateVideoInput(input, { partial: true });
  const requestedStatus = Object.prototype.hasOwnProperty.call(input, "status") ? String(input.status || "").toLowerCase() : current.status;
  if (!["draft", "published"].includes(requestedStatus)) throw new Error("Invalid video status.");
  if (current.status === "published" && requestedStatus === "draft") throw new Error("Published videos cannot return to draft.");
  if (requestedStatus === "published" && current.status !== "published" && !streamIsReady(streamDetails || {})) {
    throw new Error("This video is still processing and cannot be published yet.");
  }
  const publishedAt = requestedStatus === "published" ? (current.published_at || new Date().toISOString()) : null;
  await db.prepare(`
    UPDATE parish_video_posts SET title = ?, description = ?, pinned = ?, status = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `).bind(fields.title ?? current.title, fields.description ?? current.description, fields.pinned ?? current.pinned, requestedStatus, publishedAt, videoId, parishId).run();
  return videoFromRow(await db.prepare("SELECT * FROM parish_video_posts WHERE id = ?").bind(videoId).first());
}

export async function archiveVideoPost(db, { parishId, videoId }) {
  await db.prepare("UPDATE parish_video_posts SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND parish_id = ?").bind(videoId, parishId).run();
  const row = await db.prepare("SELECT * FROM parish_video_posts WHERE id = ? AND parish_id = ?").bind(videoId, parishId).first();
  return row ? videoFromRow(row) : null;
}

export async function listVideoPosts(db, parishId) {
  const result = await db.prepare("SELECT * FROM parish_video_posts WHERE parish_id = ? ORDER BY pinned DESC, updated_at DESC").bind(parishId).all();
  return Promise.all((result.results || []).map(async (row) => {
    const post = videoFromRow(row);
    const receipts = post.status === "published" ? await getReadReceipts(db, { parishId, contentType: CONTENT_TYPE, contentId: post.id }) : [];
    return { ...post, watchCount: receipts.length };
  }));
}

export async function getDonorVideoFeed(db, { parishId, donorId }) {
  const result = await db.prepare(`
    SELECT * FROM parish_video_posts WHERE parish_id = ? AND status = 'published'
    ORDER BY pinned DESC, published_at DESC, created_at DESC
  `).bind(parishId).all();
  const posts = (result.results || []).map(videoFromRow);
  const ids = posts.map(({ id }) => id);
  const watchedIds = await getReadContentIds(db, { parishId, contentType: CONTENT_TYPE, donorId, contentIds: ids });
  const watched = new Set(watchedIds);
  return Promise.all(posts.map(async (post) => {
    const receipts = await getReadReceipts(db, { parishId, contentType: CONTENT_TYPE, contentId: post.id });
    return { ...post, watched: watched.has(post.id), watchCount: receipts.length };
  }));
}

export async function markVideoWatched(db, { parishId, videoId, donorId }) {
  const row = await db.prepare("SELECT id FROM parish_video_posts WHERE id = ? AND parish_id = ? AND status = 'published'").bind(videoId, parishId).first();
  if (!row) return false;
  await markContentRead(db, { parishId, contentType: CONTENT_TYPE, contentId: videoId, donorId });
  return true;
}

function signedAssetUrls(details, token) {
  const playback = new URL(details.playback?.hls || "");
  const host = `${playback.protocol}//${playback.host}`;
  return {
    hlsUrl: `${host}/${token}/manifest/video.m3u8`,
    thumbnailUrl: `${host}/${token}/thumbnails/thumbnail.jpg?height=720&fit=crop`,
    durationSeconds: Math.max(0, Number(details.duration) || 0),
  };
}

export async function privateStreamAssets(env, streamVideoId, fetchImpl = fetch) {
  const [details, tokenResult] = await Promise.all([
    callStreamApi(env, `/${encodeURIComponent(streamVideoId)}`, {}, fetchImpl),
    callStreamApi(env, `/${encodeURIComponent(streamVideoId)}/token`, { method: "POST", body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60 }) }, fetchImpl),
  ]);
  if (!streamIsReady(details)) throw new Error("This video is still processing.");
  if (!details.requireSignedURLs) throw new Error("This video is not configured for private playback.");
  return { ...signedAssetUrls(details, tokenResult.token), streamState: details.status?.state || "" };
}

export function normalizeYouTubeUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { throw new Error("Enter a valid YouTube video URL."); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  else if (["youtube.com", "m.youtube.com"].includes(host)) {
    if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
    else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/live/")) videoId = parsed.pathname.split("/")[2] || "";
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) throw new Error("Enter a direct YouTube video URL.");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function resolveYouTubeVideo(value, fetchImpl = fetch) {
  const youtubeUrl = normalizeYouTubeUrl(value);
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", youtubeUrl);
  endpoint.searchParams.set("format", "json");
  const response = await fetchImpl(endpoint.toString(), { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.provider_name !== "YouTube" || !payload.title || !payload.thumbnail_url) {
    throw new Error("YouTube could not resolve that embeddable video.");
  }
  return { youtubeUrl, title: String(payload.title).slice(0, 240), thumbnailUrl: String(payload.thumbnail_url).slice(0, 1000) };
}

export async function addYouTubeLink(db, { parishId, addedBy, value, fetchImpl = fetch }) {
  const resolved = await resolveYouTubeVideo(value, fetchImpl);
  const id = generateSecret("youtube");
  await db.prepare(`INSERT INTO parish_youtube_links (id, parish_id, youtube_url, title, thumbnail_url, added_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, parishId, resolved.youtubeUrl, resolved.title, resolved.thumbnailUrl, addedBy).run();
  return youtubeFromRow(await db.prepare("SELECT * FROM parish_youtube_links WHERE id = ?").bind(id).first());
}

export async function listYouTubeLinks(db, parishId) {
  const result = await db.prepare("SELECT * FROM parish_youtube_links WHERE parish_id = ? ORDER BY added_at DESC").bind(parishId).all();
  return (result.results || []).map(youtubeFromRow);
}

async function donorVideoContext(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return { error: access.response };
  const { donor, donorId, parishId } = access.context;
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Your selected parish could not be found." }, { status: 404 }) };
  if (!communicationsEnabledFor(found.registration)) return { disabled: true, parishId, found, donor };
  return { parishId, found, donor, donorId };
}

export async function handleDonorVideo(request, env, videoId = "", action = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = env.AGAPAY_DB || env.DB;
  const context = await donorVideoContext(request, env);
  if (context.error) return context.error;
  const parish = { id: context.parishId, name: context.found.registration.parishName || "" };
  if (context.disabled) return json({ available: false, parish, videos: [], youtube: [] });
  try {
    if (!videoId && request.method === "GET") {
      const [posts, youtube] = await Promise.all([getDonorVideoFeed(db, context), listYouTubeLinks(db, context.parishId)]);
      const videos = (await Promise.all(posts.map(async (post) => {
        try { return { ...post, ...(await privateStreamAssets(env, post.streamVideoId)) }; } catch { return null; }
      }))).filter(Boolean).map(({ hlsUrl, ...post }) => post);
      return json({ available: true, parish, videos, youtube });
    }
    const post = await db.prepare("SELECT * FROM parish_video_posts WHERE id = ? AND parish_id = ? AND status = 'published'").bind(videoId, context.parishId).first();
    if (!post) return json({ error: "Published video not found" }, { status: 404 });
    if (action === "playback" && request.method === "GET") {
      return json({ ok: true, video: { ...videoFromRow(post), ...(await privateStreamAssets(env, post.stream_video_id)) } });
    }
    if (action === "watch" && request.method === "POST") {
      await markVideoWatched(db, { parishId: context.parishId, videoId, donorId: context.donorId });
      const receipts = await getReadReceipts(db, { parishId: context.parishId, contentType: CONTENT_TYPE, contentId: videoId });
      return json({ ok: true, watchCount: receipts.length });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || "Unable to load parish video." }, { status: error.status || 502 });
  }
}

export async function handleParishVideo(request, env, parishId, subpath = "") {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = request.method === "POST" ? await rateLimit(request, env, "parish-video-write", { limit: 20, windowSeconds: 300 }) : null;
  if (limited) return limited;
  const db = env.AGAPAY_DB || env.DB;
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  const createdBy = normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) || `parish:${parishId}`;
  const parts = String(subpath || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  try {
    if (!parts.length && request.method === "GET") {
      const posts = await listVideoPosts(db, parishId);
      const videos = await Promise.all(posts.map(async (post) => {
        try {
          const details = await callStreamApi(env, `/${encodeURIComponent(post.streamVideoId)}`);
          return { ...post, streamState: details.status?.state || "pending", readyToStream: streamIsReady(details), durationSeconds: Number(details.duration) || 0 };
        } catch (error) { return { ...post, streamState: "unavailable", readyToStream: false, streamError: error.message }; }
      }));
      return json({ videos, youtube: await listYouTubeLinks(db, parishId) });
    }
    if (parts[0] === "upload-url" && parts.length === 1 && request.method === "POST") {
      const input = await request.json();
      const upload = await createStreamUpload(env, { request, parishId, createdBy });
      const post = await createVideoDraft(db, { parishId, createdBy, streamVideoId: upload.uid, input });
      return json({ ok: true, post, uploadUrl: upload.uploadURL }, { status: 201 });
    }
    if (parts[0] === "youtube" && parts.length === 1 && request.method === "POST") {
      const input = await request.json();
      return json({ ok: true, link: await addYouTubeLink(db, { parishId, addedBy: createdBy, value: input.youtubeUrl }) }, { status: 201 });
    }
    if (parts[0] === "youtube" && parts.length === 2 && request.method === "DELETE") {
      await db.prepare("DELETE FROM parish_youtube_links WHERE id = ? AND parish_id = ?").bind(decodeURIComponent(parts[1]), parishId).run();
      return json({ ok: true });
    }
    if (parts.length === 1 && request.method === "PATCH") {
      const id = decodeURIComponent(parts[0]);
      const current = await db.prepare("SELECT * FROM parish_video_posts WHERE id = ? AND parish_id = ?").bind(id, parishId).first();
      if (!current) return json({ error: "Video not found" }, { status: 404 });
      const input = await request.json();
      const details = input.status === "published" ? await callStreamApi(env, `/${encodeURIComponent(current.stream_video_id)}`) : null;
      return json({ ok: true, post: await updateVideoPost(db, { parishId, videoId: id, input, streamDetails: details }) });
    }
    if (parts.length === 2 && parts[1] === "status" && request.method === "GET") {
      const post = await db.prepare("SELECT * FROM parish_video_posts WHERE id = ? AND parish_id = ?").bind(decodeURIComponent(parts[0]), parishId).first();
      if (!post) return json({ error: "Video not found" }, { status: 404 });
      const details = await callStreamApi(env, `/${encodeURIComponent(post.stream_video_id)}`);
      return json({ ok: true, readyToStream: streamIsReady(details), streamState: details.status?.state || "pending", pctComplete: details.status?.pctComplete || "", durationSeconds: Number(details.duration) || 0 });
    }
    if (parts.length === 2 && parts[1] === "archive" && request.method === "POST") {
      const post = await archiveVideoPost(db, { parishId, videoId: decodeURIComponent(parts[0]) });
      return post ? json({ ok: true, post }) : json({ error: "Video not found" }, { status: 404 });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || "Unable to manage parish video." }, { status: error.status === 401 || error.status === 403 ? 502 : (error.status || 422) });
  }
}
