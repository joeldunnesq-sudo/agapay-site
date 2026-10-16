// Generated from src/handlers/group-attachments.ts by npm run build:server. Do not edit.
import '../lib/content-reads.js';
import '../lib/push-notifications.js';
import { d1All, d1Batch, d1First, generateSecret } from '../lib/core.js';
import '../lib/entitlements.js';
import './parish.js';
import './koinonia-access.js';
import './parish-events.js';
import '../stewardship/attendance.js';
import {
  GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_MAX_BATCHES,
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  GROUP_MESSAGE_VOICE_TYPES,
  GROUP_MESSAGE_IMAGE_TYPES,
  PRIVATE_HEADERS,
  GroupMessageAccessError,
} from './donor-groups-shared.js';
import { database, requireActiveMinistryMember } from './donor-groups-shared.js';
import { postGroupMessage } from './donor-groups.js';
import './group-workspace.js';
function safeStorageSegment(value, fallback) {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || fallback
  );
}
function groupAttachmentStorageKey({ parishId, ministryId, messageId }) {
  return [
    'group-messages',
    safeStorageSegment(parishId, 'parish'),
    safeStorageSegment(ministryId, 'ministry'),
    safeStorageSegment(messageId, 'message'),
  ].join('/');
}
function groupAttachmentDeliveryUrl(ministryId, messageId) {
  return `/api/donor/groups/${encodeURIComponent(ministryId)}/messages/${encodeURIComponent(messageId)}/attachment`;
}
function sqliteDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('GROUP_MESSAGE_RETENTION_INVALID_DATE');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
async function purgeExpiredGroupMessages(env, asOf = Date.now()) {
  if (!database(env)) return { attachmentsPurged: 0, batches: 0, complete: true };
  const cutoff = sqliteDateTime(new Date(new Date(asOf).getTime() - GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS * 864e5));
  let attachmentsPurged = 0;
  let batches = 0;
  while (batches < GROUP_MESSAGE_ATTACHMENT_RETENTION_MAX_BATCHES) {
    const expired = await d1All(
      env,
      `
      SELECT id, parish_id, ministry_id, message_type, attachment_url
      FROM parish_group_messages
      WHERE created_at < ? AND attachment_url IS NOT NULL
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `,
      cutoff,
      GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE
    );
    if (!expired.length) return { attachmentsPurged, batches, complete: true, cutoff };
    if (!env.GROUP_MESSAGE_ASSETS) throw new Error('GROUP_MESSAGE_ASSETS_REQUIRED_FOR_RETENTION');
    const keys = expired.map((row) =>
      groupAttachmentStorageKey({
        parishId: row.parish_id,
        ministryId: row.ministry_id,
        messageId: row.id,
      })
    );
    await env.GROUP_MESSAGE_ASSETS.delete(keys);
    await d1Batch(
      env,
      expired.map((row) => ({
        sql: `UPDATE parish_group_messages
        SET attachment_url = NULL,
            attachment_duration_seconds = NULL,
            body = ?
        WHERE id = ? AND created_at < ? AND attachment_url IS NOT NULL`,
        params: [
          row.message_type === 'voice' ? 'Voice message (no longer available)' : 'Photo (no longer available)',
          row.id,
          cutoff,
        ],
      }))
    );
    attachmentsPurged += expired.length;
    batches += 1;
    if (expired.length < GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE) {
      return { attachmentsPurged, batches, complete: true, cutoff };
    }
  }
  return { attachmentsPurged, batches, complete: false, cutoff };
}
function validateGroupMessageAttachmentMetadata(request, messageType) {
  const normalizedType = String(messageType || '')
    .trim()
    .toLowerCase();
  const allowedTypes =
    normalizedType === 'voice'
      ? GROUP_MESSAGE_VOICE_TYPES
      : normalizedType === 'image'
        ? GROUP_MESSAGE_IMAGE_TYPES
        : null;
  if (!allowedTypes) return { error: 'Attachment type must be voice or image.', status: 422 };
  const contentType = String(request.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const ext = allowedTypes.get(contentType);
  if (!ext) {
    return {
      error:
        normalizedType === 'voice'
          ? 'Voice messages must be MP3, M4A, OGG, or WebM audio.'
          : 'Group photos must be JPG, PNG, or WebP images.',
      status: 415,
    };
  }
  const rawLength = String(
    request.headers.get('content-length') || request.headers.get('x-agapay-attachment-bytes') || ''
  ).trim();
  const contentLength = rawLength ? Number(rawLength) : 0;
  if (!rawLength) return { error: 'Attachment size is required.', status: 411 };
  if (!Number.isInteger(contentLength) || contentLength < 1) {
    return { error: 'The attachment is empty.', status: 422 };
  }
  if (contentLength > GROUP_MESSAGE_ATTACHMENT_MAX_BYTES) {
    return {
      error: `${normalizedType === 'voice' ? 'Voice messages' : 'Group photos'} must be 10MB or smaller.`,
      status: 413,
    };
  }
  let durationSeconds = null;
  if (normalizedType === 'voice') {
    durationSeconds = Number(request.headers.get('x-agapay-attachment-duration-seconds') || 0);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) {
      return { error: 'Voice message duration is required.', status: 422 };
    }
  }
  return { messageType: normalizedType, contentType, contentLength, durationSeconds, ext };
}
function limitGroupMessageAttachmentStream(source, maxBytes = GROUP_MESSAGE_ATTACHMENT_MAX_BYTES) {
  let bytesRead = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk?.byteLength ?? chunk?.length ?? 0;
      bytesRead += bytes;
      if (bytesRead > maxBytes) throw new Error('GROUP_MESSAGE_ATTACHMENT_TOO_LARGE');
      controller.enqueue(chunk);
    },
  });
  return { stream: source.pipeThrough(limiter), bytesRead: () => bytesRead };
}
async function storeGroupMessageAttachment(
  bucket,
  { parishId, key, source, contentType, contentLength, maxBytes = GROUP_MESSAGE_ATTACHMENT_MAX_BYTES }
) {
  if (!Number.isInteger(contentLength) || contentLength < 1)
    throw new Error('GROUP_MESSAGE_ATTACHMENT_LENGTH_REQUIRED');
  if (contentLength > maxBytes) throw new Error('GROUP_MESSAGE_ATTACHMENT_TOO_LARGE');
  const bounded = limitGroupMessageAttachmentStream(source, maxBytes);
  const fixed = new FixedLengthStream(contentLength);
  try {
    const [object] = await Promise.all([
      bucket.put(key, fixed.readable, {
        customMetadata: { agapayParishId: parishId },
        httpMetadata: { contentType, cacheControl: 'private, no-store' },
      }),
      bounded.stream.pipeTo(fixed.writable),
    ]);
    const size = Number(object?.size ?? bounded.bytesRead());
    if (size !== contentLength) throw new Error('GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH');
    return { object, size };
  } catch (error) {
    await bucket.delete(key).catch(() => {});
    throw error;
  }
}
function decodeAttachmentBody(request) {
  const encoded = String(request.headers.get('x-agapay-message-body-b64') || '').trim();
  if (!encoded) return '';
  if (encoded.length > 12e3 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new GroupMessageAccessError('Invalid attachment caption.', 422);
  }
  try {
    const normalized = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new GroupMessageAccessError('Invalid attachment caption.', 422);
  }
}
async function deliverMinistryImage(request, env, context, ministryId) {
  if (request.method !== 'GET') throw new GroupMessageAccessError('Method not allowed', 405);
  if (!env.GROUP_MESSAGE_ASSETS) throw new GroupMessageAccessError('Ministry image storage is not configured.', 503);
  await requireActiveMinistryMember(env, context, ministryId);
  const ministry = await d1First(
    env,
    `
    SELECT image_storage_key FROM directory_ministries
    WHERE id = ? AND parish_id = ? AND status = 'active'
  `,
    ministryId,
    context.parishId
  );
  if (!ministry?.image_storage_key) throw new GroupMessageAccessError('Ministry image was not found.', 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(ministry.image_storage_key);
  if (!object?.body) throw new GroupMessageAccessError('Ministry image was not found.', 404);
  const headers = new Headers(PRIVATE_HEADERS);
  object.writeHttpMetadata?.(headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', 'inline');
  return new Response(object.body, { headers });
}
async function postGroupMessageAttachment(request, env, context, ministryId, messageType) {
  if (!env.GROUP_MESSAGE_ASSETS) {
    throw new GroupMessageAccessError('Group message attachment storage is not configured.', 503);
  }
  await requireActiveMinistryMember(env, context, ministryId);
  const metadata = validateGroupMessageAttachmentMetadata(request, messageType);
  if (metadata.error) throw new GroupMessageAccessError(metadata.error, metadata.status);
  if (!request.body) throw new GroupMessageAccessError('The attachment is empty.', 422);
  const body = decodeAttachmentBody(request);
  const messageId = generateSecret('group_message');
  const key = groupAttachmentStorageKey({ parishId: context.parishId, ministryId, messageId });
  let stored;
  try {
    stored = await storeGroupMessageAttachment(env.GROUP_MESSAGE_ASSETS, {
      parishId: context.parishId,
      key,
      source: request.body,
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
    });
  } catch (error) {
    if (error?.message === 'GROUP_MESSAGE_ATTACHMENT_TOO_LARGE') {
      throw new GroupMessageAccessError(
        `${metadata.messageType === 'voice' ? 'Voice messages' : 'Group photos'} must be 10MB or smaller.`,
        413
      );
    }
    if (
      ['GROUP_MESSAGE_ATTACHMENT_LENGTH_REQUIRED', 'GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH'].includes(error?.message)
    ) {
      throw new GroupMessageAccessError(
        'The attachment size did not match the recorded file. Please record it again.',
        422
      );
    }
    console.error(
      'group_message_attachment_store_failed',
      JSON.stringify({
        parishId: context.parishId,
        ministryId,
        messageType: metadata.messageType,
        contentType: metadata.contentType,
        contentLength: metadata.contentLength,
        error: error?.message || String(error),
      })
    );
    throw new GroupMessageAccessError('Unable to store this attachment. Please try again.', 503);
  }
  if (!stored.size) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw new GroupMessageAccessError('The attachment is empty.', 422);
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
  if (request.method !== 'GET') throw new GroupMessageAccessError('Method not allowed', 405);
  if (!env.GROUP_MESSAGE_ASSETS)
    throw new GroupMessageAccessError('Group message attachment storage is not configured.', 503);
  await requireActiveMinistryMember(env, context, ministryId);
  const message = await d1First(
    env,
    `
    SELECT id FROM parish_group_messages
    WHERE id = ? AND parish_id = ? AND ministry_id = ?
      AND message_type IN ('voice', 'image') AND attachment_url IS NOT NULL
  `,
    messageId,
    context.parishId,
    ministryId
  );
  if (!message) throw new GroupMessageAccessError('Attachment was not found.', 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(
    groupAttachmentStorageKey({ parishId: context.parishId, ministryId, messageId })
  );
  if (!object?.body) throw new GroupMessageAccessError('Attachment was not found.', 404);
  const headers = new Headers(PRIVATE_HEADERS);
  object.writeHttpMetadata?.(headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Disposition', 'inline');
  if (Number(object.size || 0) > 0) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}
export {
  decodeAttachmentBody,
  deliverGroupMessageAttachment,
  deliverMinistryImage,
  groupAttachmentDeliveryUrl,
  groupAttachmentStorageKey,
  limitGroupMessageAttachmentStream,
  postGroupMessageAttachment,
  purgeExpiredGroupMessages,
  safeStorageSegment,
  sqliteDateTime,
  storeGroupMessageAttachment,
  validateGroupMessageAttachmentMetadata,
};
