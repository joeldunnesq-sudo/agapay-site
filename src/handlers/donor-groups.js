import { currentUser } from "../lib/authorization.js";
import { getReadContentIds, markContentRead } from "../lib/content-reads.js";
import { sendGroupMessagePush } from "../lib/push-notifications.js";
import {
  d1All,
  d1First,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  unauthorized,
} from "../lib/core.js";
import { requireDonor } from "./parish.js";

const CONTENT_TYPE = "group_message";
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
    createdAt: row.created_at || "",
  };
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

export async function listActiveMinistryGroups(env, { parishId, personId, donorId }) {
  const rows = await d1All(env, `
    SELECT m.id, m.display_name, m.slug, m.category, m.short_description,
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
      role: Number(row.is_leader || 0) === 1 ? "leader" : "participant",
      messageCount: contentIds.length,
      unreadCount: contentIds.length - readIds.length,
    };
  }));
}

export async function listGroupMessages(env, { parishId, ministryId, personId, donorId }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const ministry = await d1First(env, `
    SELECT id, display_name, slug, category, short_description
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
    },
    messages: messages.map((message) => ({ ...message, read: readSet.has(message.id) })),
    unreadCount: contentIds.length - readIds.length,
  };
}

export async function postGroupMessage(env, { parishId, ministryId, personId, body }) {
  await requireActiveMinistryMember(env, { parishId, personId }, ministryId);
  const cleanedBody = String(body || "").trim().slice(0, 8000);
  if (!cleanedBody) throw new GroupMessageAccessError("Message body is required.", 422);
  const id = generateSecret("group_message");
  await database(env).prepare(`
    INSERT INTO parish_group_messages (id, parish_id, ministry_id, author_person_id, body)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, parishId, ministryId, personId, cleanedBody).run();
  const row = await d1First(env, `
    SELECT gm.*, p.preferred_name AS author_name, m.display_name AS ministry_name
    FROM parish_group_messages gm
    JOIN directory_people p ON p.id = gm.author_person_id
    JOIN directory_ministries m ON m.id = gm.ministry_id AND m.parish_id = gm.parish_id
    WHERE gm.id = ? AND gm.parish_id = ? AND gm.ministry_id = ?
  `, id, parishId, ministryId);
  return messageFromRow(row);
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

async function resolveGroupContext(request, env) {
  const [donor, user] = await Promise.all([requireDonor(request, env), currentUser(request, env)]);
  if (!donor?.email || !user?.id) return null;
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

export async function handleDonorGroups(request, env, ctx = null) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!database(env)) return missingProductionStoreResponse();
  try {
    const context = await resolveGroupContext(request, env);
    if (!context) return unauthorized();
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/donor\/groups\/?/, "");
    const parts = path ? path.split("/").map(decodeURIComponent) : [];

    if (!parts.length && request.method === "GET") {
      return privateJson({ groups: await listActiveMinistryGroups(env, context) });
    }
    if (parts.length === 2 && parts[1] === "messages" && request.method === "GET") {
      return privateJson(await listGroupMessages(env, { ...context, ministryId: parts[0] }));
    }
    if (parts.length === 2 && parts[1] === "messages" && request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      const message = await postGroupMessage(env, { ...context, ministryId: parts[0], body: input.body });
      if (ctx?.waitUntil) {
        const delivery = sendGroupMessagePush(env, {
          parishId: context.parishId,
          ministryId: parts[0],
          ministryName: message.ministryName,
          authorPersonId: context.personId,
          authorName: message.authorName,
          message,
        }).then((summary) => console.log("group_push_delivery", JSON.stringify({ parishId: context.parishId, ministryId: parts[0], messageId: message.id, ...summary })))
          .catch((error) => console.error("group_push_delivery_failed", error?.message || String(error)));
        ctx.waitUntil(delivery);
      }
      return privateJson({ ok: true, message }, { status: 201 });
    }
    if (parts.length === 4 && parts[1] === "messages" && parts[3] === "read" && request.method === "POST") {
      await markGroupMessageRead(env, { ...context, ministryId: parts[0], messageId: parts[2] });
      return privateJson({ ok: true });
    }
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
