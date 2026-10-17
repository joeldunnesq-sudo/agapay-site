import type { GroupEnvironment, GroupContext, GroupRow } from './donor-groups-composition-contracts.js';

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
export const CONTENT_TYPE = 'group_message';

export const GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS = 30;
export const GROUP_MESSAGE_ATTACHMENT_RETENTION_BATCH_SIZE = 100;
export const GROUP_MESSAGE_ATTACHMENT_RETENTION_MAX_BATCHES = 100;

export const GROUP_MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const GROUP_MESSAGE_VOICE_TYPES = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/webm', 'webm'],
]);

export const GROUP_MESSAGE_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  Vary: 'Authorization, X-AGAPAY-Donor-Email',
};

export class GroupMessageAccessError extends Error {
  declare status: number;
  constructor(message = 'You are not an active member of this ministry.', status = 403) {
    super(message);
    this.name = 'GroupMessageAccessError';
    this.status = status;
  }
}
export function privateJson(payload: unknown, init: import('../lib/http-responses.js').JsonResponseInit = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}
export function database(env: GroupEnvironment) {
  return env.AGAPAY_DB || env.DB || null;
}
export function messageFromRow(row: Partial<GroupRow> = {}) {
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
export function ministryImageDeliveryUrl(ministryId: string) {
  return `/api/donor/groups/${encodeURIComponent(ministryId)}/image`;
}
export async function requireActiveMinistryMember(env: GroupEnvironment, context: GroupContext, ministryId: string) {
  if (!(await isActiveMinistryMember(env, { ...context, ministryId }))) {
    throw new GroupMessageAccessError();
  }
}
export async function requireActiveMinistryLeader(env: GroupEnvironment, context: GroupContext, ministryId: string) {
  if (!(await isActiveMinistryLeader(env, { ...context, ministryId }))) {
    throw new GroupMessageAccessError('Only active ministry leaders can view member read status.', 403);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof GroupMessageAccessError) {
    return privateJson({ error: error.message }, { status: error.status });
  }
  throw error;
}
export function scheduleGroupMessagePush(
  env: GroupEnvironment,
  ctx: Pick<ExecutionContext, 'waitUntil'> | null,
  context: GroupContext,
  ministryId: string,
  message: { id: string; messageType: string; body: string; ministryName?: string; authorName?: string }
) {
  if (!ctx?.waitUntil) return;
  const delivery = sendGroupMessagePush(env, {
    parishId: context.parishId,
    ministryId,
    ministryName: message.ministryName!,
    authorPersonId: context.personId,
    authorName: message.authorName!,
    message,
  })
    .then((summary) =>
      console.log(
        'group_push_delivery',
        JSON.stringify({ parishId: context.parishId, ministryId, messageId: message.id, ...summary })
      )
    )
    .catch((error: unknown) =>
      console.error('group_push_delivery_failed', (error as { message?: string } | undefined)?.message || String(error))
    );
  ctx.waitUntil(delivery);
}
