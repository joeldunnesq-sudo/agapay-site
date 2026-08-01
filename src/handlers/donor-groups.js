import { currentUser } from "../lib/authorization.js";
import { getReadContentIds, getReadReceipts, markContentRead } from "../lib/content-reads.js";
import { sendGroupMessagePush } from "../lib/push-notifications.js";
import {
  d1All,
  d1Batch,
  d1First,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from "../lib/core.js";
import { requireDonor } from "./parish.js";

const CONTENT_TYPE = "group_message";
export const GROUP_MESSAGE_RETENTION_DAYS = 30;
const GROUP_MESSAGE_RETENTION_BATCH_SIZE = 100;
const GROUP_MESSAGE_RETENTION_MAX_BATCHES = 100;
export const GROUP_MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const GROUP_MESSAGE_VOICE_TYPES = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/ogg", "ogg"],
  ["audio/webm", "webm"],
]);
export const GROUP_MESSAGE_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};

export class GroupMessageAccessError extends Error {
  constructor(message = "You are not an active member of this ministry.", status = 403) {
    super(message);
    this.name = "GroupMessageAccessError";
    this.status = status;
  }
}

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function messageFromRow(row = {}) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    ministryId: row.ministry_id || "",
    authorPersonId: row.author_person_id || "",
    authorName: row.author_name || "Parish member",
    ministryName: row.ministry_name || "Ministry",
    body: row.body || "",
    messageType: row.message_type || "text",
    attachmentUrl: row.attachment_url || "",
    attachmentDurationSeconds: row.attachment_duration_seconds == null ? null : Number(row.attachment_duration_seconds),
    createdAt: row.created_at || "",
  };
}

function safeStorageSegment(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;
}

function groupAttachmentStorageKey({ parishId, ministryId, messageId }) {
  return ["group-messages", safeStorageSegment(parishId, "parish"), safeStorageSegment(ministryId, "ministry"), safeStorageSegment(messageId, "message")].join("/");
}

function groupAttachmentDeliveryUrl(ministryId, messageId) {
  return `/api/donor/groups/${encodeURIComponent(ministryId)}/messages/${encodeURIComponent(messageId)}/attachment`;
}

function sqliteDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("GROUP_MESSAGE_RETENTION_INVALID_DATE");
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function purgeExpiredGroupMessages(env, asOf = Date.now()) {
  if (!database(env)) return { messagesDeleted: 0, attachmentsDeleted: 0, batches: 0, complete: true };
  const cutoff = sqliteDateTime(new Date(new Date(asOf).getTime() - GROUP_MESSAGE_RETENTION_DAYS * 86400000));
  let messagesDeleted = 0;
  let attachmentsDeleted = 0;
  let batches = 0;

  while (batches < GROUP_MESSAGE_RETENTION_MAX_BATCHES) {
    const expired = await d1All(env, `
      SELECT id, parish_id, ministry_id, message_type, attachment_url
      FROM parish_group_messages
      WHERE created_at < ?
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `, cutoff, GROUP_MESSAGE_RETENTION_BATCH_SIZE);
    if (!expired.length) return { messagesDeleted, attachmentsDeleted, batches, complete: true, cutoff };

    const attachmentRows = expired.filter((row) => row.attachment_url && ["voice", "image"].includes(row.message_type));
    if (attachmentRows.length) {
      if (!env.GROUP_MESSAGE_ASSETS) throw new Error("GROUP_MESSAGE_ASSETS_REQUIRED_FOR_RETENTION");
      const keys = attachmentRows.map((row) => groupAttachmentStorageKey({
        parishId: row.parish_id,
        ministryId: row.ministry_id,
        messageId: row.id,
      }));
      await env.GROUP_MESSAGE_ASSETS.delete(keys);
      attachmentsDeleted += keys.length;
    }

    const ids = expired.map(({ id }) => id);
    const placeholders = ids.map(() => "?").join(", ");
    await d1Batch(env, [
      {
        sql: `DELETE FROM parish_content_reads WHERE content_type = ? AND content_id IN (${placeholders})`,
        params: [CONTENT_TYPE, ...ids],
      },
      {
        sql: `DELETE FROM parish_group_messages WHERE id IN (${placeholders}) AND created_at < ?`,
        params: [...ids, cutoff],
      },
    ]);
    messagesDeleted += ids.length;
    batches += 1;
    if (expired.length < GROUP_MESSAGE_RETENTION_BATCH_SIZE) {
      return { messagesDeleted, attachmentsDeleted, batches, complete: true, cutoff };
    }
  }
  return { messagesDeleted, attachmentsDeleted, batches, complete: false, cutoff };
}

function ministryImageDeliveryUrl(ministryId) {
  return `/api/donor/groups/${encodeURIComponent(ministryId)}/image`;
}

export function validateGroupMessageAttachmentMetadata(request, messageType) {
  const normalizedType = String(messageType || "").trim().toLowerCase();
  const allowedTypes = normalizedType === "voice" ? GROUP_MESSAGE_VOICE_TYPES : normalizedType === "image" ? GROUP_MESSAGE_IMAGE_TYPES : null;
  if (!allowedTypes) return { error: "Attachment type must be voice or image.", status: 422 };
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = allowedTypes.get(contentType);
  if (!ext) {
    return {
      error: normalizedType === "voice"
        ? "Voice messages must be MP3, M4A, OGG, or WebM audio."
        : "Group photos must be JPG, PNG, or WebP images.",
      status: 415,
    };
  }
  // Browsers do not allow application code to set Content-Length. Keep the
  // browser-declared Blob size as a same-origin fallback so R2 always receives
  // a fixed-length stream, while still preferring the runtime's authoritative
  // Content-Length header when it is available.
  const rawLength = String(request.headers.get("content-length") || request.headers.get("x-agapay-attachment-bytes") || "").trim();
  const contentLength = rawLength ? Number(rawLength) : 0;
  if (!rawLength) return { error: "Attachment size is required.", status: 411 };
  if (!Number.isInteger(contentLength) || contentLength < 1) {
    return { error: "The attachment is empty.", status: 422 };
  }
  if (contentLength > GROUP_MESSAGE_ATTACHMENT_MAX_BYTES) {
    return { error: `${normalizedType === "voice" ? "Voice messages" : "Group photos"} must be 10MB or smaller.`, status: 413 };
  }
  let durationSeconds = null;
  if (normalizedType === "voice") {
    durationSeconds = Number(request.headers.get("x-agapay-attachment-duration-seconds") || 0);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) {
      return { error: "Voice message duration is required.", status: 422 };
    }
  }
  return { messageType: normalizedType, contentType, contentLength, durationSeconds, ext };
}

export function limitGroupMessageAttachmentStream(source, maxBytes = GROUP_MESSAGE_ATTACHMENT_MAX_BYTES) {
  let bytesRead = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk?.byteLength ?? chunk?.length ?? 0;
      bytesRead += bytes;
      if (bytesRead > maxBytes) throw new Error("GROUP_MESSAGE_ATTACHMENT_TOO_LARGE");
      controller.enqueue(chunk);
    },
  });
  return { stream: source.pipeThrough(limiter), bytesRead: () => bytesRead };
}

export async function storeGroupMessageAttachment(bucket, { key, source, contentType, contentLength, maxBytes = GROUP_MESSAGE_ATTACHMENT_MAX_BYTES }) {
  if (!Number.isInteger(contentLength) || contentLength < 1) throw new Error("GROUP_MESSAGE_ATTACHMENT_LENGTH_REQUIRED");
  if (contentLength > maxBytes) throw new Error("GROUP_MESSAGE_ATTACHMENT_TOO_LARGE");
  const bounded = limitGroupMessageAttachmentStream(source, maxBytes);
  // TransformStream output has no intrinsic length, which R2 rejects for a
  // single-part put. FixedLengthStream preserves streaming and gives R2 the
  // exact size without buffering voice notes in Worker memory.
  const fixed = new FixedLengthStream(contentLength);
  try {
    const [object] = await Promise.all([
      bucket.put(key, fixed.readable, {
        httpMetadata: { contentType, cacheControl: "private, no-store" },
      }),
      bounded.stream.pipeTo(fixed.writable),
    ]);
    const size = Number(object?.size ?? bounded.bytesRead());
    if (size !== contentLength) throw new Error("GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH");
    return { object, size };
  } catch (error) {
    await bucket.delete(key).catch(() => {});
    throw error;
  }
}

function decodeAttachmentBody(request) {
  const encoded = String(request.headers.get("x-agapay-message-body-b64") || "").trim();
  if (!encoded) return "";
  if (encoded.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new GroupMessageAccessError("Invalid attachment caption.", 422);
  }
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new GroupMessageAccessError("Invalid attachment caption.", 422);
  }
}

export async function isActiveMinistryMember(env, { parishId, ministryId, personId }) {
  if (!parishId || !ministryId || !personId) return false;
  const row = await d1First(env, `
    SELECT m.id
    FROM directory_ministries m
    WHERE m.id = ? AND m.parish_id = ? AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM directory_ministry_participants mp
          WHERE mp.parish_id = m.parish_id AND mp.ministry_id = m.id
            AND mp.person_id = ? AND mp.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM directory_ministry_leaders ml
          WHERE ml.parish_id = m.parish_id AND ml.ministry_id = m.id
            AND ml.person_id = ? AND ml.active = 1
        )
      )
  `, ministryId, parishId, personId, personId);
  return Boolean(row);
}

async function requireActiveMinistryMember(env, context, ministryId) {
  if (!await isActiveMinistryMember(env, { ...context, ministryId })) {
    throw new GroupMessageAccessError();
  }
}

export async function isActiveMinistryLeader(env, { parishId, ministryId, personId }) {
  if (!parishId || !ministryId || !personId) return false;
  const row = await d1First(env, `
    SELECT m.id
    FROM directory_ministries m
    JOIN directory_ministry_leaders ml
      ON ml.parish_id = m.parish_id AND ml.ministry_id = m.id
    WHERE m.id = ? AND m.parish_id = ? AND m.status = 'active'
      AND ml.person_id = ? AND ml.active = 1
    LIMIT 1
  `, ministryId, parishId, personId);
  return Boolean(row);
}

async function requireActiveMinistryLeader(env, context, ministryId) {
  if (!await isActiveMinistryLeader(env, { ...context, ministryId })) {
    throw new GroupMessageAccessError("Only active ministry leaders can view member read status.", 403);
  }
}

export async function listActiveMinistryGroups(env, { parishId, personId, donorId }) {
  const rows = await d1All(env, `
    SELECT m.id, m.display_name, m.slug, m.category, m.short_description, m.image_storage_key, m.image_updated_at,
           EXISTS (
             SELECT 1 FROM directory_ministry_leaders ml
             WHERE ml.parish_id = m.parish_id AND ml.ministry_id = m.id
               AND ml.person_id = ? AND ml.active = 1
           ) AS is_leader
    FROM directory_ministries m
    WHERE m.parish_id = ? AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM directory_ministry_participants mp
          WHERE mp.parish_id = m.parish_id AND mp.ministry_id = m.id
            AND mp.person_id = ? AND mp.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM directory_ministry_leaders ml
          WHERE ml.parish_id = m.parish_id AND ml.ministry_id = m.id
            AND ml.person_id = ? AND ml.active = 1
        )
      )
    ORDER BY m.display_order ASC, m.display_name ASC
  `, personId, parishId, personId, personId);

  return Promise.all(rows.map(async (row) => {
    const messageRows = await d1All(env, `
      SELECT id FROM parish_group_messages
      WHERE parish_id = ? AND ministry_id = ?
    `, parishId, row.id);
    const contentIds = messageRows.map(({ id }) => id);
    const readIds = await getReadContentIds(database(env), {
      parishId,
      contentType: CONTENT_TYPE,
      donorId,
      contentIds,
    });
    return {
      id: row.id,
      name: row.display_name || "Ministry",
      slug: row.slug || "",
      category: row.category || "other",
      description: row.short_description || "",
      hasImage: Boolean(row.image_storage_key),
      imageUrl: row.image_storage_key ? ministryImageDeliveryUrl(row.id) : "",
      imageUpdatedAt: Number(row.image_updated_at || 0),
      role: Number(row.is_leader || 0) === 1 ? "leader" : "participant",
      messageCount: contentIds.length,
      unreadCount: contentIds.length - readIds.length,
    };
  }));
}

export async function listGroupMessages(env, { parishId, ministryId, personId, donorId }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const ministry = await d1First(env, `
    SELECT id, display_name, slug, category, short_description, image_storage_key, image_updated_at
    FROM directory_ministries WHERE id = ? AND parish_id = ?
  `, ministryId, parishId);
  const rows = await d1All(env, `
    SELECT gm.*, p.preferred_name AS author_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    WHERE gm.parish_id = ? AND gm.ministry_id = ?
    ORDER BY gm.created_at ASC, gm.id ASC
  `, parishId, ministryId);
  const messages = rows.map(messageFromRow);
  const contentIds = messages.map(({ id }) => id);
  const readIds = await getReadContentIds(database(env), {
    parishId,
    contentType: CONTENT_TYPE,
    donorId,
    contentIds,
  });
  const readSet = new Set(readIds);
  return {
    group: {
      id: ministry.id,
      name: ministry.display_name || "Ministry",
      slug: ministry.slug || "",
      category: ministry.category || "other",
      description: ministry.short_description || "",
      hasImage: Boolean(ministry.image_storage_key),
      imageUrl: ministry.image_storage_key ? ministryImageDeliveryUrl(ministry.id) : "",
      imageUpdatedAt: Number(ministry.image_updated_at || 0),
    },
    messages: messages.map((message) => ({ ...message, read: readSet.has(message.id), mine: message.authorPersonId === personId })),
    unreadCount: contentIds.length - readIds.length,
  };
}

async function deliverMinistryImage(request, env, context, ministryId) {
  if (request.method !== "GET") throw new GroupMessageAccessError("Method not allowed", 405);
  if (!env.GROUP_MESSAGE_ASSETS) throw new GroupMessageAccessError("Ministry image storage is not configured.", 503);
  await requireActiveMinistryMember(env, context, ministryId);
  const ministry = await d1First(env, `
    SELECT image_storage_key FROM directory_ministries
    WHERE id = ? AND parish_id = ? AND status = 'active'
  `, ministryId, context.parishId);
  if (!ministry?.image_storage_key) throw new GroupMessageAccessError("Ministry image was not found.", 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(ministry.image_storage_key);
  if (!object?.body) throw new GroupMessageAccessError("Ministry image was not found.", 404);
  const headers = new Headers(PRIVATE_HEADERS);
  object.writeHttpMetadata?.(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  return new Response(object.body, { headers });
}

export async function listGroupActivity(env, { parishId, personId, donorId }) {
  const rows = await d1All(env, `
    SELECT gm.*, p.preferred_name AS author_name, m.display_name AS ministry_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    JOIN directory_ministries m ON m.id = gm.ministry_id AND m.parish_id = gm.parish_id
    WHERE gm.parish_id = ? AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM directory_ministry_participants mp
          WHERE mp.parish_id = gm.parish_id AND mp.ministry_id = gm.ministry_id
            AND mp.person_id = ? AND mp.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM directory_ministry_leaders ml
          WHERE ml.parish_id = gm.parish_id AND ml.ministry_id = gm.ministry_id
            AND ml.person_id = ? AND ml.active = 1
        )
      )
    ORDER BY gm.created_at DESC, gm.id DESC
  `, parishId, personId, personId);
  const messages = rows.map(messageFromRow);
  const contentIds = messages.map(({ id }) => id);
  const readIds = await getReadContentIds(database(env), {
    parishId,
    contentType: CONTENT_TYPE,
    donorId,
    contentIds,
  });
  const readSet = new Set(readIds);
  return {
    activity: messages.slice(0, 10).map((message) => ({ ...message, read: readSet.has(message.id) })),
    unreadCount: contentIds.length - readIds.length,
  };
}

export async function postGroupMessage(env, {
  parishId,
  ministryId,
  personId,
  body,
  messageType = "text",
  attachmentUrl = null,
  attachmentDurationSeconds = null,
  messageId = "",
}) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const cleanedBody = String(body || "").trim().slice(0, 8000);
  const normalizedType = String(messageType || "text").trim().toLowerCase();
  if (!["text", "voice", "image"].includes(normalizedType)) throw new GroupMessageAccessError("Invalid message type.", 422);
  if (normalizedType === "text" && !cleanedBody) throw new GroupMessageAccessError("Message body is required.", 422);
  if (normalizedType !== "text" && !attachmentUrl) throw new GroupMessageAccessError("Attachment is required.", 422);
  const durationSeconds = normalizedType === "voice" ? Number(attachmentDurationSeconds || 0) : null;
  if (normalizedType === "voice" && (!Number.isInteger(durationSeconds) || durationSeconds < 1)) {
    throw new GroupMessageAccessError("Voice message duration is required.", 422);
  }
  const id = messageId || generateSecret("group_message");
  await database(env).prepare(`
    INSERT INTO parish_group_messages
      (id, parish_id, ministry_id, author_person_id, body, message_type, attachment_url, attachment_duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, parishId, ministryId, personId, cleanedBody || null, normalizedType, attachmentUrl, durationSeconds).run();
  const row = await d1First(env, `
    SELECT gm.*, p.preferred_name AS author_name, m.display_name AS ministry_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    JOIN directory_ministries m ON m.id = gm.ministry_id AND m.parish_id = gm.parish_id
    WHERE gm.id = ? AND gm.parish_id = ? AND gm.ministry_id = ?
  `, id, parishId, ministryId);
  return messageFromRow(row);
}

async function postGroupMessageAttachment(request, env, context, ministryId, messageType) {
  if (!env.GROUP_MESSAGE_ASSETS) {
    throw new GroupMessageAccessError("Group message attachment storage is not configured.", 503);
  }
  await requireActiveMinistryMember(env, context, ministryId);
  const metadata = validateGroupMessageAttachmentMetadata(request, messageType);
  if (metadata.error) throw new GroupMessageAccessError(metadata.error, metadata.status);
  if (!request.body) throw new GroupMessageAccessError("The attachment is empty.", 422);
  const body = decodeAttachmentBody(request);
  const messageId = generateSecret("group_message");
  const key = groupAttachmentStorageKey({ parishId: context.parishId, ministryId, messageId });
  let stored;
  try {
    stored = await storeGroupMessageAttachment(env.GROUP_MESSAGE_ASSETS, {
      key,
      source: request.body,
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
    });
  } catch (error) {
    if (error?.message === "GROUP_MESSAGE_ATTACHMENT_TOO_LARGE") {
      throw new GroupMessageAccessError(`${metadata.messageType === "voice" ? "Voice messages" : "Group photos"} must be 10MB or smaller.`, 413);
    }
    if (["GROUP_MESSAGE_ATTACHMENT_LENGTH_REQUIRED", "GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH"].includes(error?.message)) {
      throw new GroupMessageAccessError("The attachment size did not match the recorded file. Please record it again.", 422);
    }
    console.error("group_message_attachment_store_failed", JSON.stringify({
      parishId: context.parishId,
      ministryId,
      messageType: metadata.messageType,
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
      error: error?.message || String(error),
    }));
    throw new GroupMessageAccessError("Unable to store this attachment. Please try again.", 503);
  }
  if (!stored.size) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw new GroupMessageAccessError("The attachment is empty.", 422);
  }
  try {
    return await postGroupMessage(env, {
      ...context,
      ministryId,
      body,
      messageType: metadata.messageType,
      attachmentUrl: groupAttachmentDeliveryUrl(ministryId, messageId),
      attachmentDurationSeconds: metadata.durationSeconds,
      messageId,
    });
  } catch (error) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw error;
  }
}

async function deliverGroupMessageAttachment(request, env, context, ministryId, messageId) {
  if (request.method !== "GET") throw new GroupMessageAccessError("Method not allowed", 405);
  if (!env.GROUP_MESSAGE_ASSETS) throw new GroupMessageAccessError("Group message attachment storage is not configured.", 503);
  await requireActiveMinistryMember(env, context, ministryId);
  const message = await d1First(env, `
    SELECT id FROM parish_group_messages
    WHERE id = ? AND parish_id = ? AND ministry_id = ?
      AND message_type IN ('voice', 'image') AND attachment_url IS NOT NULL
  `, messageId, context.parishId, ministryId);
  if (!message) throw new GroupMessageAccessError("Attachment was not found.", 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(groupAttachmentStorageKey({ parishId: context.parishId, ministryId, messageId }));
  if (!object?.body) throw new GroupMessageAccessError("Attachment was not found.", 404);
  const headers = new Headers(PRIVATE_HEADERS);
  object.writeHttpMetadata?.(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  if (Number(object.size || 0) > 0) headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

export async function markGroupMessageRead(env, { parishId, ministryId, messageId, personId, donorId }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const message = await d1First(env, `
    SELECT id FROM parish_group_messages
    WHERE id = ? AND parish_id = ? AND ministry_id = ?
  `, messageId, parishId, ministryId);
  if (!message) throw new GroupMessageAccessError("Message was not found.", 404);
  await markContentRead(database(env), {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: messageId,
    donorId,
  });
}

export async function getLatestGroupMessageCatchUp(env, { parishId, ministryId, personId }) {
  await requireActiveMinistryLeader(env, { parishId, personId }, ministryId);
  const latestMessage = await d1First(env, `
    SELECT id, created_at
    FROM parish_group_messages
    WHERE parish_id = ? AND ministry_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, parishId, ministryId);
  const receipts = latestMessage ? await getReadReceipts(database(env), {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: latestMessage.id,
  }) : [];
  const readSet = new Set(receipts.map(({ donorId }) => normalizeEmail(donorId)));
  const rows = await d1All(env, `
    WITH active_members(person_id) AS (
      SELECT mp.person_id
      FROM directory_ministry_participants mp
      WHERE mp.parish_id = ? AND mp.ministry_id = ? AND mp.status = 'active'
      UNION
      SELECT ml.person_id
      FROM directory_ministry_leaders ml
      WHERE ml.parish_id = ? AND ml.ministry_id = ? AND ml.active = 1
    )
    SELECT p.id AS person_id, p.preferred_name,
      EXISTS (
        SELECT 1 FROM directory_ministry_leaders leader
        WHERE leader.parish_id = ? AND leader.ministry_id = ?
          AND leader.person_id = p.id AND leader.active = 1
      ) AS is_leader,
      COALESCE((
        SELECT pu.email
        FROM directory_person_links l
        JOIN platform_users pu ON pu.id = l.external_id AND pu.status = 'active'
        WHERE l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
        ORDER BY l.created_at ASC LIMIT 1
      ), '') AS donor_id
    FROM active_members members
    JOIN directory_people p ON p.id = members.person_id AND p.active = 1
    ORDER BY p.preferred_name ASC, p.id ASC
  `, parishId, ministryId, parishId, ministryId, parishId, ministryId);
  const members = rows.map((row) => {
    const donorId = normalizeEmail(row.donor_id || "");
    return {
      personId: row.person_id,
      displayName: row.preferred_name || "Parish member",
      role: Number(row.is_leader || 0) === 1 ? "leader" : "participant",
      accountLinked: Boolean(donorId),
      caughtUp: latestMessage ? Boolean(donorId && readSet.has(donorId)) : null,
    };
  });
  return {
    latestMessage: latestMessage ? { id: latestMessage.id, createdAt: latestMessage.created_at || "" } : null,
    memberCount: members.length,
    caughtUpCount: latestMessage ? members.filter(({ caughtUp }) => caughtUp).length : 0,
    members,
  };
}

async function resolveGroupContext(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor?.email) return null;
  const user = await currentUser(request, env);
  if (!user?.id) {
    throw new GroupMessageAccessError("Your donor account is not linked to a parish member profile.", 403);
  }
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) throw new GroupMessageAccessError("Choose your home parish to view your groups.", 422);
  const person = await d1First(env, `
    SELECT p.id
    FROM directory_person_links l
    JOIN directory_people p ON p.id = l.person_id AND p.active = 1
    WHERE l.link_type = 'platform_user' AND l.external_id = ? AND l.active = 1
    ORDER BY l.created_at ASC LIMIT 1
  `, user.id);
  if (!person?.id) throw new GroupMessageAccessError("Your account is not linked to an active parish member.", 403);
  return { parishId, personId: person.id, donorId: normalizeEmail(donor.email) };
}

function errorResponse(error) {
  if (error instanceof GroupMessageAccessError) {
    return privateJson({ error: error.message }, { status: error.status });
  }
  throw error;
}

function scheduleGroupMessagePush(env, ctx, context, ministryId, message) {
  if (!ctx?.waitUntil) return;
  const delivery = sendGroupMessagePush(env, {
    parishId: context.parishId,
    ministryId,
    ministryName: message.ministryName,
    authorPersonId: context.personId,
    authorName: message.authorName,
    message,
  }).then((summary) => console.log("group_push_delivery", JSON.stringify({ parishId: context.parishId, ministryId, messageId: message.id, ...summary })))
    .catch((error) => console.error("group_push_delivery_failed", error?.message || String(error)));
  ctx.waitUntil(delivery);
}

export async function handleDonorGroups(request, env, ctx = null) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!database(env)) return missingProductionStoreResponse();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/donor\/groups\/?/, "");
  const parts = path ? path.split("/").map(decodeURIComponent) : [];
  const isActivityRequest = parts.length === 1 && parts[0] === "activity" && request.method === "GET";
  try {
    const context = await resolveGroupContext(request, env);
    if (!context) return unauthorized();

    if (isActivityRequest) {
      return privateJson(await listGroupActivity(env, context));
    }

    if (!parts.length && request.method === "GET") {
      return privateJson({ groups: await listActiveMinistryGroups(env, context) });
    }
    if (parts.length === 2 && parts[1] === "messages" && request.method === "GET") {
      return privateJson(await listGroupMessages(env, { ...context, ministryId: parts[0] }));
    }
    if (parts.length === 2 && parts[1] === "messages" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      const message = await postGroupMessage(env, { ...context, ministryId: parts[0], body: input.body });
      scheduleGroupMessagePush(env, ctx, context, parts[0], message);
      return privateJson({ ok: true, message }, { status: 201 });
    }
    if (parts.length === 2 && parts[1] === "image") {
      return deliverMinistryImage(request, env, context, parts[0]);
    }
    if (parts.length === 3 && parts[1] === "messages" && parts[2] === "attachment" && request.method === "POST") {
      const limited = await rateLimit(request, env, "group-message-attachment-upload", { limit: 20, windowSeconds: 300 });
      if (limited) return limited;
      const message = await postGroupMessageAttachment(request, env, context, parts[0], url.searchParams.get("type"));
      scheduleGroupMessagePush(env, ctx, context, parts[0], message);
      return privateJson({ ok: true, message }, { status: 201 });
    }
    if (parts.length === 4 && parts[1] === "messages" && parts[3] === "attachment") {
      return deliverGroupMessageAttachment(request, env, context, parts[0], parts[2]);
    }
    if (parts.length === 2 && parts[1] === "caught-up" && request.method === "GET") {
      return privateJson(await getLatestGroupMessageCatchUp(env, { ...context, ministryId: parts[0] }));
    }
    if (parts.length === 4 && parts[1] === "messages" && parts[3] === "read" && request.method === "POST") {
      await markGroupMessageRead(env, { ...context, ministryId: parts[0], messageId: parts[2] });
      return privateJson({ ok: true });
    }
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (isActivityRequest && error instanceof GroupMessageAccessError && error.status === 403) {
      return privateJson({ available: false, activity: [], unreadCount: 0 });
    }
    return errorResponse(error);
  }
}
