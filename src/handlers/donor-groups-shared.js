// Generated from src/handlers/donor-groups-shared.ts by npm run build:server. Do not edit.
import '../lib/content-reads.js';
import { sendGroupMessagePush } from '../lib/push-notifications.js';
import { json } from '../lib/core.js';
import '../lib/entitlements.js';
import './parish.js';
import './koinonia-access.js';
import './parish-events.js';
import '../stewardship/attendance.js';
import './group-attachments.js';
import { isActiveMinistryMember, isActiveMinistryLeader } from './donor-groups.js';
import './group-workspace.js';
const CONTENT_TYPE = 'group_message';
const GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS = 30;
const GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE = 100;
const GROUP_MESSAGE_ATTACHMENT_RETENTION_MAX_BATCHES = 100;
const GROUP_MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const GROUP_MESSAGE_VOICE_TYPES = /* @__PURE__ */ new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/webm', 'webm'],
]);
const GROUP_MESSAGE_IMAGE_TYPES = /* @__PURE__ */ new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  Vary: 'Authorization, X-AGAPAY-Donor-Email',
};
class GroupMessageAccessError extends Error {
  constructor(message = 'You are not an active member of this ministry.', status = 403) {
    super(message);
    this.name = 'GroupMessageAccessError';
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
    id: row.id || '',
    parishId: row.parish_id || '',
    ministryId: row.ministry_id || '',
    authorPersonId: row.author_person_id || '',
    authorName: row.author_name || 'Parish member',
    ministryName: row.ministry_name || 'Ministry',
    body: row.body || '',
    messageType: row.message_type || 'text',
    attachmentUrl: row.attachment_url || '',
    attachmentDurationSeconds: row.attachment_duration_seconds == null ? null : Number(row.attachment_duration_seconds),
    createdAt: row.created_at || '',
  };
}
function ministryImageDeliveryUrl(ministryId) {
  return `/api/donor/groups/${encodeURIComponent(ministryId)}/image`;
}
async function requireActiveMinistryMember(env, context, ministryId) {
  if (!(await isActiveMinistryMember(env, { ...context, ministryId }))) {
    throw new GroupMessageAccessError();
  }
}
async function requireActiveMinistryLeader(env, context, ministryId) {
  if (!(await isActiveMinistryLeader(env, { ...context, ministryId }))) {
    throw new GroupMessageAccessError('Only active ministry leaders can view member read status.', 403);
  }
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
  })
    .then((summary) =>
      console.log(
        'group_push_delivery',
        JSON.stringify({ parishId: context.parishId, ministryId, messageId: message.id, ...summary })
      )
    )
    .catch((error) => console.error('group_push_delivery_failed', error?.message || String(error)));
  ctx.waitUntil(delivery);
}
export {
  CONTENT_TYPE,
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_MAX_BATCHES,
  GROUP_MESSAGE_IMAGE_TYPES,
  GROUP_MESSAGE_VOICE_TYPES,
  GroupMessageAccessError,
  PRIVATE_HEADERS,
  database,
  errorResponse,
  messageFromRow,
  ministryImageDeliveryUrl,
  privateJson,
  requireActiveMinistryLeader,
  requireActiveMinistryMember,
  scheduleGroupMessagePush,
};
