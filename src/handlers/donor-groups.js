// Generated from src/handlers/donor-groups.ts by npm run build:server. Do not edit.
import { getReadContentIds, getReadReceipts, markContentRead } from '../lib/content-reads.js';
import '../lib/push-notifications.js';
import {
  d1All,
  d1First,
  generateSecret,
  hasProductionStore,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
} from '../lib/core.js';
import { communicationsEnabledFor } from '../lib/entitlements.js';
import { findRegistrationByParishId } from './parish.js';
import { verifiedHouseholdAccess } from './koinonia-access.js';
import { createMinistryCommerceItem, listMinistryCommerceItems, patchMinistryCommerceItem } from './parish-events.js';
import '../stewardship/attendance.js';
import { CONTENT_TYPE, GroupMessageAccessError } from './donor-groups-shared.js';
import {
  privateJson,
  database,
  messageFromRow,
  ministryImageDeliveryUrl,
  requireActiveMinistryMember,
  requireActiveMinistryLeader,
  errorResponse,
  scheduleGroupMessagePush,
} from './donor-groups-shared.js';
import {
  deliverMinistryImage,
  postGroupMessageAttachment,
  deliverGroupMessageAttachment,
} from './group-attachments.js';
import {
  ministryWorkspaceOverview,
  ministryWorkspaceMembers,
  updateMinistryAvailability,
  listMinistrySchedule,
  createMinistryEvents,
  deleteMinistryEvent,
  recordMinistryAttendance,
  listMinistryResources,
  createMinistryResource,
  deleteMinistryResource,
  recordDelegatedParishHeadcount,
} from './group-workspace.js';
import {
  GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS,
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  GROUP_MESSAGE_VOICE_TYPES,
  GROUP_MESSAGE_IMAGE_TYPES,
  GroupMessageAccessError as GroupMessageAccessError2,
} from './donor-groups-shared.js';
import {
  purgeExpiredGroupMessages,
  validateGroupMessageAttachmentMetadata,
  limitGroupMessageAttachmentStream,
  storeGroupMessageAttachment,
} from './group-attachments.js';
import { recordDelegatedParishHeadcount as recordDelegatedParishHeadcount2 } from './group-workspace.js';
async function isActiveMinistryMember(env, { parishId, ministryId, personId }) {
  if (!parishId || !ministryId || !personId) return false;
  const row = await d1First(
    env,
    `
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
  `,
    ministryId,
    parishId,
    personId,
    personId
  );
  return Boolean(row);
}
async function isActiveMinistryLeader(env, { parishId, ministryId, personId }) {
  if (!parishId || !ministryId || !personId) return false;
  const row = await d1First(
    env,
    `
    SELECT m.id
    FROM directory_ministries m
    JOIN directory_ministry_leaders ml
      ON ml.parish_id = m.parish_id AND ml.ministry_id = m.id
    WHERE m.id = ? AND m.parish_id = ? AND m.status = 'active'
      AND ml.person_id = ? AND ml.active = 1
    LIMIT 1
  `,
    ministryId,
    parishId,
    personId
  );
  return Boolean(row);
}
async function listActiveMinistryGroups(env, { parishId, personId, donorId }) {
  const rows = await d1All(
    env,
    `
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
  `,
    personId,
    parishId,
    personId,
    personId
  );
  let delegatedMinistryId = null;
  try {
    const setting = await d1First(
      env,
      `
      SELECT headcount_delegate_ministry_id
      FROM parish_stewardship_settings
      WHERE parish_id = ? AND has_stewardship_suite = 1
    `,
      parishId
    );
    delegatedMinistryId = setting?.headcount_delegate_ministry_id || null;
  } catch {}
  return Promise.all(
    rows.map(async (row) => {
      const messageRows = await d1All(
        env,
        `
      SELECT id FROM parish_group_messages
      WHERE parish_id = ? AND ministry_id = ?
    `,
        parishId,
        row.id
      );
      const contentIds = messageRows.map(({ id }) => id);
      const readIds = await getReadContentIds(database(env), {
        parishId,
        contentType: CONTENT_TYPE,
        donorId,
        contentIds,
      });
      return {
        id: row.id,
        name: row.display_name || 'Ministry',
        slug: row.slug || '',
        category: row.category || 'other',
        description: row.short_description || '',
        hasImage: Boolean(row.image_storage_key),
        imageUrl: row.image_storage_key ? ministryImageDeliveryUrl(row.id) : '',
        imageUpdatedAt: Number(row.image_updated_at || 0),
        role: Number(row.is_leader || 0) === 1 ? 'leader' : 'participant',
        headcountDelegated: row.id === delegatedMinistryId,
        messageCount: contentIds.length,
        unreadCount: contentIds.length - readIds.length,
      };
    })
  );
}
async function listGroupMessages(env, { parishId, ministryId, personId, donorId }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const ministry = await d1First(
    env,
    `
    SELECT id, display_name, slug, category, short_description, image_storage_key, image_updated_at
    FROM directory_ministries WHERE id = ? AND parish_id = ?
  `,
    ministryId,
    parishId
  );
  const rows = await d1All(
    env,
    `
    SELECT gm.*, p.preferred_name AS author_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    WHERE gm.parish_id = ? AND gm.ministry_id = ?
    ORDER BY gm.created_at ASC, gm.id ASC
  `,
    parishId,
    ministryId
  );
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
      name: ministry.display_name || 'Ministry',
      slug: ministry.slug || '',
      category: ministry.category || 'other',
      description: ministry.short_description || '',
      hasImage: Boolean(ministry.image_storage_key),
      imageUrl: ministry.image_storage_key ? ministryImageDeliveryUrl(ministry.id) : '',
      imageUpdatedAt: Number(ministry.image_updated_at || 0),
    },
    messages: messages.map((message) => ({
      ...message,
      read: readSet.has(message.id),
      mine: message.authorPersonId === personId,
    })),
    unreadCount: contentIds.length - readIds.length,
  };
}
async function listGroupActivity(env, { parishId, personId, donorId }) {
  const rows = await d1All(
    env,
    `
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
  `,
    parishId,
    personId,
    personId
  );
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
async function postGroupMessage(
  env,
  {
    parishId,
    ministryId,
    personId,
    body,
    messageType = 'text',
    attachmentUrl = null,
    attachmentDurationSeconds = null,
    messageId = '',
  }
) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const cleanedBody = String(body || '')
    .trim()
    .slice(0, 8e3);
  const normalizedType = String(messageType || 'text')
    .trim()
    .toLowerCase();
  if (!['text', 'voice', 'image'].includes(normalizedType))
    throw new GroupMessageAccessError('Invalid message type.', 422);
  if (normalizedType === 'text' && !cleanedBody) throw new GroupMessageAccessError('Message body is required.', 422);
  if (normalizedType !== 'text' && !attachmentUrl) throw new GroupMessageAccessError('Attachment is required.', 422);
  const durationSeconds = normalizedType === 'voice' ? Number(attachmentDurationSeconds || 0) : null;
  if (normalizedType === 'voice' && (!Number.isInteger(durationSeconds) || durationSeconds < 1)) {
    throw new GroupMessageAccessError('Voice message duration is required.', 422);
  }
  const id = messageId || generateSecret('group_message');
  await database(env)
    .prepare(
      `
    INSERT INTO parish_group_messages
      (id, parish_id, ministry_id, author_person_id, body, message_type, attachment_url, attachment_duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(id, parishId, ministryId, personId, cleanedBody || null, normalizedType, attachmentUrl, durationSeconds)
    .run();
  const row = await d1First(
    env,
    `
    SELECT gm.*, p.preferred_name AS author_name, m.display_name AS ministry_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    JOIN directory_ministries m ON m.id = gm.ministry_id AND m.parish_id = gm.parish_id
    WHERE gm.id = ? AND gm.parish_id = ? AND gm.ministry_id = ?
  `,
    id,
    parishId,
    ministryId
  );
  return messageFromRow(row);
}
async function markGroupMessageRead(env, { parishId, ministryId, messageId, personId, donorId }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const message = await d1First(
    env,
    `
    SELECT id FROM parish_group_messages
    WHERE id = ? AND parish_id = ? AND ministry_id = ?
  `,
    messageId,
    parishId,
    ministryId
  );
  if (!message) throw new GroupMessageAccessError('Message was not found.', 404);
  await markContentRead(database(env), {
    parishId,
    contentType: CONTENT_TYPE,
    contentId: messageId,
    donorId,
  });
}
async function getLatestGroupMessageCatchUp(env, { parishId, ministryId, personId }) {
  await requireActiveMinistryLeader(env, { parishId, personId }, ministryId);
  const latestMessage = await d1First(
    env,
    `
    SELECT id, created_at
    FROM parish_group_messages
    WHERE parish_id = ? AND ministry_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `,
    parishId,
    ministryId
  );
  const receipts = latestMessage
    ? await getReadReceipts(database(env), {
        parishId,
        contentType: CONTENT_TYPE,
        contentId: latestMessage.id,
      })
    : [];
  const readSet = new Set(receipts.map(({ donorId }) => normalizeEmail(donorId)));
  const rows = await d1All(
    env,
    `
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
  `,
    parishId,
    ministryId,
    parishId,
    ministryId,
    parishId,
    ministryId
  );
  const members = rows.map((row) => {
    const donorId = normalizeEmail(row.donor_id || '');
    return {
      personId: row.person_id,
      displayName: row.preferred_name || 'Parish member',
      role: Number(row.is_leader || 0) === 1 ? 'leader' : 'participant',
      accountLinked: Boolean(donorId),
      caughtUp: latestMessage ? Boolean(donorId && readSet.has(donorId)) : null,
    };
  });
  return {
    latestMessage: latestMessage ? { id: latestMessage.id, createdAt: latestMessage.created_at || '' } : null,
    memberCount: members.length,
    caughtUpCount: latestMessage ? members.filter(({ caughtUp }) => caughtUp).length : 0,
    members,
  };
}
async function handleDonorGroups(request, env, ctx = null) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!database(env)) return missingProductionStoreResponse();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/donor\/groups\/?/, '');
  const parts = path ? path.split('/').map(decodeURIComponent) : [];
  const isActivityRequest = parts.length === 1 && parts[0] === 'activity' && request.method === 'GET';
  try {
    const access = await verifiedHouseholdAccess(request, env);
    if (access.response) return access.response;
    const context = access.context;
    const found = await findRegistrationByParishId(env, context.parishId);
    if (!communicationsEnabledFor(found?.registration))
      return privateJson(
        { error: 'Koinonia requires an active Give + or Parish plan and must be enabled by the parish.' },
        { status: 403 }
      );
    if (isActivityRequest) {
      return privateJson(await listGroupActivity(env, context));
    }
    if (!parts.length && request.method === 'GET') {
      return privateJson({ groups: await listActiveMinistryGroups(env, context) });
    }
    if (parts.length === 2 && parts[1] === 'overview' && request.method === 'GET')
      return privateJson(await ministryWorkspaceOverview(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'members' && request.method === 'GET')
      return privateJson(await ministryWorkspaceMembers(env, context, parts[0]));
    if (parts.length === 3 && parts[1] === 'members' && parts[2] === 'availability' && request.method === 'PATCH')
      return privateJson(await updateMinistryAvailability(request, env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'schedule' && request.method === 'GET')
      return privateJson(await listMinistrySchedule(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'schedule' && request.method === 'POST')
      return privateJson(await createMinistryEvents(request, env, context, parts[0]), { status: 201 });
    if (parts.length === 3 && parts[1] === 'schedule' && request.method === 'DELETE')
      return privateJson(await deleteMinistryEvent(env, context, parts[0], parts[2]));
    if (parts.length === 4 && parts[1] === 'schedule' && parts[3] === 'attendance' && request.method === 'PATCH')
      return privateJson(await recordMinistryAttendance(request, env, context, parts[0], parts[2]));
    if (parts.length === 2 && parts[1] === 'headcount' && request.method === 'PATCH')
      return privateJson(await recordDelegatedParishHeadcount(request, env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'resources' && request.method === 'GET')
      return privateJson(await listMinistryResources(env, context, parts[0]));
    if (parts.length === 2 && parts[1] === 'resources' && request.method === 'POST')
      return privateJson(await createMinistryResource(request, env, context, parts[0]), { status: 201 });
    if (parts.length === 3 && parts[1] === 'resources' && request.method === 'DELETE')
      return privateJson(await deleteMinistryResource(env, context, parts[0], parts[2]));
    if (parts.length === 2 && parts[1] === 'commerce' && request.method === 'GET') {
      await requireActiveMinistryMember(env, context, parts[0]);
      try {
        return privateJson(await listMinistryCommerceItems(env, context.parishId, parts[0]));
      } catch (error) {
        throw new GroupMessageAccessError(error.message, error.status || 400);
      }
    }
    if (parts.length === 2 && parts[1] === 'commerce' && request.method === 'POST') {
      if (
        !(await isActiveMinistryLeader(env, {
          parishId: context.parishId,
          ministryId: parts[0],
          personId: context.personId,
        }))
      )
        throw new GroupMessageAccessError('Only active ministry leaders can create priced listings.', 403);
      try {
        return privateJson(
          await createMinistryCommerceItem(request, env, context.parishId, parts[0], context.personId),
          { status: 201 }
        );
      } catch (error) {
        throw new GroupMessageAccessError(error.message, error.status || 400);
      }
    }
    if (parts.length === 3 && parts[1] === 'commerce' && request.method === 'PATCH') {
      if (
        !(await isActiveMinistryLeader(env, {
          parishId: context.parishId,
          ministryId: parts[0],
          personId: context.personId,
        }))
      )
        throw new GroupMessageAccessError('Only active ministry leaders can edit priced listings.', 403);
      try {
        return privateJson(await patchMinistryCommerceItem(request, env, context.parishId, parts[0], parts[2]));
      } catch (error) {
        throw new GroupMessageAccessError(error.message, error.status || 400);
      }
    }
    if (parts.length === 2 && parts[1] === 'messages' && request.method === 'GET') {
      return privateJson(await listGroupMessages(env, { ...context, ministryId: parts[0] }));
    }
    if (parts.length === 2 && parts[1] === 'messages' && request.method === 'POST') {
      const input = await request.json().catch(() => ({}));
      const message = await postGroupMessage(env, { ...context, ministryId: parts[0], body: input.body });
      scheduleGroupMessagePush(env, ctx, context, parts[0], message);
      return privateJson({ ok: true, message }, { status: 201 });
    }
    if (parts.length === 2 && parts[1] === 'image') {
      return deliverMinistryImage(request, env, context, parts[0]);
    }
    if (parts.length === 3 && parts[1] === 'messages' && parts[2] === 'attachment' && request.method === 'POST') {
      const limited = await rateLimit(request, env, 'group-message-attachment-upload', {
        limit: 20,
        windowSeconds: 300,
      });
      if (limited) return limited;
      const message = await postGroupMessageAttachment(request, env, context, parts[0], url.searchParams.get('type'));
      scheduleGroupMessagePush(env, ctx, context, parts[0], message);
      return privateJson({ ok: true, message }, { status: 201 });
    }
    if (parts.length === 4 && parts[1] === 'messages' && parts[3] === 'attachment') {
      return deliverGroupMessageAttachment(request, env, context, parts[0], parts[2]);
    }
    if (parts.length === 2 && parts[1] === 'caught-up' && request.method === 'GET') {
      return privateJson(await getLatestGroupMessageCatchUp(env, { ...context, ministryId: parts[0] }));
    }
    if (parts.length === 4 && parts[1] === 'messages' && parts[3] === 'read' && request.method === 'POST') {
      await markGroupMessageRead(env, { ...context, ministryId: parts[0], messageId: parts[2] });
      return privateJson({ ok: true });
    }
    return privateJson({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    if (isActivityRequest && error instanceof GroupMessageAccessError && error.status === 403) {
      return privateJson({ available: false, activity: [], unreadCount: 0 });
    }
    return errorResponse(error);
  }
}
export {
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS,
  GROUP_MESSAGE_IMAGE_TYPES,
  GROUP_MESSAGE_VOICE_TYPES,
  GroupMessageAccessError2 as GroupMessageAccessError,
  getLatestGroupMessageCatchUp,
  handleDonorGroups,
  isActiveMinistryLeader,
  isActiveMinistryMember,
  limitGroupMessageAttachmentStream,
  listActiveMinistryGroups,
  listGroupActivity,
  listGroupMessages,
  markGroupMessageRead,
  postGroupMessage,
  purgeExpiredGroupMessages,
  recordDelegatedParishHeadcount2 as recordDelegatedParishHeadcount,
  storeGroupMessageAttachment,
  validateGroupMessageAttachmentMetadata,
};
