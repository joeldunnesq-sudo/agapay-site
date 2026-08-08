import { getReadContentIds, markContentRead } from "../lib/content-reads.js";
import {
  d1All,
  d1Batch,
  d1First,
  d1Run,
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
} from "../lib/core.js";
import { exchangeEnabledFor } from "../lib/entitlements.js";
import { sendExchangeMessagePush } from "../lib/push-notifications.js";
import {
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  storeGroupMessageAttachment,
  validateGroupMessageAttachmentMetadata,
} from "./donor-groups.js";
import { verifiedHouseholdAccess } from "./koinonia-access.js";
import { findRegistrationByParishId } from "./parish.js";

const CONTENT_TYPE = "exchange_message";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};
const LISTING_TYPES = new Set(["offer", "request"]);
const LISTING_CATEGORIES = new Set([
  "household_goods", "furniture", "clothing", "books",
  "children_baby", "tools", "services", "other",
]);
const MAX_LISTING_PHOTOS = 5;

export class ExchangeAccessError extends Error {
  constructor(message = "You don't have access to this listing.", status = 403) {
    super(message);
    this.name = "ExchangeAccessError";
    this.status = status;
  }
}

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function safeStorageSegment(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback;
}

function exchangePhotoStorageKey({ parishId, listingId, photoId }) {
  return ["koinonia-exchange", safeStorageSegment(parishId, "parish"), safeStorageSegment(listingId, "listing"), safeStorageSegment(photoId, "photo")].join("/");
}

function exchangePhotoDeliveryUrl(photoId) {
  return `/api/donor/koinonia/exchange/photos/${encodeURIComponent(photoId)}`;
}

function photoFromRow(row = {}) {
  return {
    id: row.id || "",
    listingId: row.listing_id || "",
    url: exchangePhotoDeliveryUrl(row.id),
    displayOrder: Number(row.display_order || 100),
    createdAt: Number(row.created_at || 0),
  };
}

function listingFromRow(row = {}, photos = []) {
  return {
    id: row.id || "",
    parishId: row.parish_id || "",
    postedByPersonId: row.posted_by_person_id || "",
    posterName: row.poster_name || "Parish member",
    listingType: row.listing_type || "offer",
    category: row.category || "other",
    title: row.title || "",
    description: row.description || "",
    priceCents: row.price_cents == null ? null : Number(row.price_cents),
    status: row.status || "active",
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    mine: Boolean(row.mine),
    photos,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function threadFromRow(row = {}) {
  return {
    id: row.id || "",
    listingId: row.listing_id || "",
    listingTitle: row.listing_title || "",
    requesterPersonId: row.requester_person_id || "",
    requesterName: row.requester_name || "Parish member",
    posterPersonId: row.posted_by_person_id || "",
    status: row.status || "open",
    listingStatus: row.listing_status || "active",
    mine: Boolean(row.mine),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function messageFromRow(row = {}) {
  return {
    id: row.id || "",
    threadId: row.thread_id || "",
    senderPersonId: row.sender_person_id || "",
    senderName: row.sender_name || "Parish member",
    body: row.body || "",
    messageType: row.message_type || "text",
    attachmentUrl: row.attachment_url || "",
    mine: Boolean(row.mine),
    read: Boolean(row.read),
    createdAt: Number(row.created_at || 0),
  };
}

async function featureContext(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access;
  const found = await findRegistrationByParishId(env, access.context.parishId);
  if (!found?.registration || !exchangeEnabledFor(found.registration)) {
    return {
      context: null,
      response: privateJson({ error: "Koinonia Exchange is not available for this parish." }, { status: 403 }),
    };
  }
  return access;
}

async function photosForListings(env, listingIds) {
  if (!listingIds.length) return new Map();
  const rows = await d1All(env, `
    SELECT photo.* FROM koinonia_exchange_photos photo
    WHERE photo.listing_id IN (${listingIds.map((_, index) => `?${index + 1}`).join(", ")})
    ORDER BY photo.display_order ASC, photo.created_at ASC
  `, ...listingIds);
  const byListing = new Map();
  rows.forEach((row) => byListing.set(row.listing_id, [...(byListing.get(row.listing_id) || []), photoFromRow(row)]));
  return byListing;
}

async function listListings(request, env, context) {
  const url = new URL(request.url);
  const listingType = LISTING_TYPES.has(url.searchParams.get("type")) ? url.searchParams.get("type") : null;
  const category = LISTING_CATEGORIES.has(url.searchParams.get("category")) ? url.searchParams.get("category") : null;
  const mine = url.searchParams.get("mine") === "1";
  const conditions = ["listing.parish_id = ?1"];
  const params = [context.parishId];
  if (mine) {
    conditions.push(`listing.posted_by_person_id = ?${params.length + 1}`);
    params.push(context.personId);
  } else {
    conditions.push("listing.status = 'active'");
    conditions.push("(listing.expires_at IS NULL OR listing.expires_at > ?2)");
    params.push(Date.now());
  }
  if (listingType) { conditions.push(`listing.listing_type = ?${params.length + 1}`); params.push(listingType); }
  if (category) { conditions.push(`listing.category = ?${params.length + 1}`); params.push(category); }
  const rows = await d1All(env, `
    SELECT listing.*, person.preferred_name AS poster_name,
      CASE WHEN listing.posted_by_person_id = ?${params.length + 1} THEN 1 ELSE 0 END AS mine
    FROM koinonia_exchange_listings listing
    LEFT JOIN directory_people person ON person.id = listing.posted_by_person_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY CASE listing.status WHEN 'active' THEN 0 ELSE 1 END, listing.created_at DESC
    LIMIT 100
  `, ...params, context.personId);
  const photos = await photosForListings(env, rows.map(({ id }) => id));
  return rows.map((row) => listingFromRow(row, photos.get(row.id) || []));
}

async function createListing(request, env, context) {
  const body = await request.json().catch(() => ({}));
  const listingType = body.listingType;
  const title = String(body.title || "").trim().slice(0, 180);
  const category = LISTING_CATEGORIES.has(body.category) ? body.category : "other";
  const description = String(body.description || "").trim().slice(0, 2000);
  const priceCents = body.priceCents == null || body.priceCents === "" ? null : Number(body.priceCents);
  const expiresAt = body.expiresAt == null || body.expiresAt === "" ? null : Number(body.expiresAt);
  if (!LISTING_TYPES.has(listingType) || !title) throw new ExchangeAccessError("Listing type and title are required.", 422);
  if (priceCents != null && (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000000)) {
    throw new ExchangeAccessError("Price must be a valid non-negative amount.", 422);
  }
  if (expiresAt != null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
    throw new ExchangeAccessError("Expiration must be in the future.", 422);
  }
  const now = Date.now();
  const id = generateSecret("koinonia_listing");
  await d1Run(env, `
    INSERT INTO koinonia_exchange_listings
      (id, parish_id, household_id, posted_by_person_id, listing_type, category, title,
       description, price_cents, status, expires_at, created_at, updated_at, revision)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', ?10, ?11, ?11, 1)
  `, id, context.parishId, context.householdId || null, context.personId, listingType,
    category, title, description, priceCents, expiresAt, now);
  return { ok: true, listingId: id };
}

export async function completeExchangeListing(env, context, listingId) {
  const listing = await d1First(env, `
    SELECT * FROM koinonia_exchange_listings WHERE id = ?1 AND parish_id = ?2
  `, listingId, context.parishId);
  if (!listing) throw new ExchangeAccessError("Listing not found.", 404);
  if (listing.posted_by_person_id !== context.personId) throw new ExchangeAccessError("Only the poster can mark this listing completed.", 403);
  if (listing.status === "completed") return { ok: true, listingId, status: "completed", threadsClosed: 0 };
  if (listing.status !== "active") throw new ExchangeAccessError("This listing is no longer active.", 409);
  const now = Date.now();
  const openThreads = await d1All(env, `
    SELECT id FROM koinonia_exchange_threads WHERE listing_id = ?1 AND parish_id = ?2 AND status = 'open'
  `, listingId, context.parishId);
  await d1Batch(env, [
    {
      sql: `UPDATE koinonia_exchange_listings
        SET status = 'completed', completed_at = ?1, updated_at = ?1, revision = revision + 1
        WHERE id = ?2 AND parish_id = ?3 AND status = 'active'`,
      params: [now, listingId, context.parishId],
    },
    ...openThreads.map((thread) => ({
      sql: `UPDATE koinonia_exchange_threads
        SET status = 'closed', closed_at = ?1, closed_reason = 'listing_completed',
            updated_at = ?1, revision = revision + 1
        WHERE id = ?2 AND parish_id = ?3 AND status = 'open'`,
      params: [now, thread.id, context.parishId],
    })),
  ]);
  return { ok: true, listingId, status: "completed", threadsClosed: openThreads.length };
}

async function startThread(env, context, listingId) {
  const listing = await d1First(env, `
    SELECT * FROM koinonia_exchange_listings WHERE id = ?1 AND parish_id = ?2
  `, listingId, context.parishId);
  if (!listing) throw new ExchangeAccessError("Listing not found.", 404);
  if (listing.status !== "active" || (listing.expires_at != null && Number(listing.expires_at) <= Date.now())) {
    throw new ExchangeAccessError("This listing is no longer active.", 409);
  }
  if (listing.posted_by_person_id === context.personId) throw new ExchangeAccessError("You can't message your own listing.", 422);
  const existing = await d1First(env, `
    SELECT id FROM koinonia_exchange_threads WHERE listing_id = ?1 AND requester_person_id = ?2
  `, listingId, context.personId);
  if (existing) return { ok: true, threadId: existing.id };
  const now = Date.now();
  const id = generateSecret("koinonia_thread");
  try {
    await d1Run(env, `
      INSERT INTO koinonia_exchange_threads
        (id, listing_id, parish_id, requester_person_id, status, created_at, updated_at, revision)
      VALUES (?1, ?2, ?3, ?4, 'open', ?5, ?5, 1)
    `, id, listingId, context.parishId, context.personId, now);
  } catch {
    const raced = await d1First(env, `
      SELECT id FROM koinonia_exchange_threads WHERE listing_id = ?1 AND requester_person_id = ?2
    `, listingId, context.personId);
    if (raced) return { ok: true, threadId: raced.id };
    throw new ExchangeAccessError("Unable to start this conversation.", 409);
  }
  return { ok: true, threadId: id };
}

async function listThreadsForListing(env, context, listingId) {
  const listing = await d1First(env, `
    SELECT posted_by_person_id FROM koinonia_exchange_listings WHERE id = ?1 AND parish_id = ?2
  `, listingId, context.parishId);
  if (!listing) throw new ExchangeAccessError("Listing not found.", 404);
  if (listing.posted_by_person_id !== context.personId) throw new ExchangeAccessError("Only the poster can view all conversations on this listing.", 403);
  const rows = await d1All(env, `
    SELECT thread.*, listing.title AS listing_title, listing.status AS listing_status,
      listing.posted_by_person_id, person.preferred_name AS requester_name
    FROM koinonia_exchange_threads thread
    JOIN koinonia_exchange_listings listing ON listing.id = thread.listing_id
    LEFT JOIN directory_people person ON person.id = thread.requester_person_id
    WHERE thread.listing_id = ?1 AND thread.parish_id = ?2
    ORDER BY thread.updated_at DESC
  `, listingId, context.parishId);
  return rows.map(threadFromRow);
}

async function requireThreadParticipant(env, context, threadId) {
  const thread = await d1First(env, `
    SELECT thread.*, listing.posted_by_person_id, listing.title AS listing_title,
      listing.status AS listing_status, requester.preferred_name AS requester_name
    FROM koinonia_exchange_threads thread
    JOIN koinonia_exchange_listings listing ON listing.id = thread.listing_id
    LEFT JOIN directory_people requester ON requester.id = thread.requester_person_id
    WHERE thread.id = ?1 AND thread.parish_id = ?2
  `, threadId, context.parishId);
  if (!thread) throw new ExchangeAccessError("Conversation not found.", 404);
  if (thread.requester_person_id !== context.personId && thread.posted_by_person_id !== context.personId) throw new ExchangeAccessError();
  return thread;
}

async function getThreadMessages(env, context, threadId) {
  const thread = await requireThreadParticipant(env, context, threadId);
  const rows = await d1All(env, `
    SELECT message.*, person.preferred_name AS sender_name
    FROM koinonia_exchange_messages message
    LEFT JOIN directory_people person ON person.id = message.sender_person_id
    WHERE message.thread_id = ?1 AND message.parish_id = ?2
    ORDER BY message.created_at ASC, message.id ASC
    LIMIT 500
  `, threadId, context.parishId);
  const readIds = await getReadContentIds(database(env), {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    donorId: context.donorId,
    contentIds: rows.map(({ id }) => id),
  });
  const readSet = new Set(readIds);
  return {
    thread: threadFromRow({ ...thread, mine: thread.requester_person_id === context.personId }),
    messages: rows.map((row) => messageFromRow({ ...row, mine: row.sender_person_id === context.personId, read: readSet.has(row.id) })),
  };
}

async function sendMessage(request, env, ctx, context, threadId) {
  const thread = await requireThreadParticipant(env, context, threadId);
  if (thread.status !== "open" || thread.listing_status !== "active") throw new ExchangeAccessError("This conversation is closed.", 409);
  const body = await request.json().catch(() => ({}));
  const messageBody = String(body.body || "").trim().slice(0, 2000);
  if (!messageBody) throw new ExchangeAccessError("Message body is required.", 422);
  const now = Date.now();
  const id = generateSecret("koinonia_msg");
  await d1Batch(env, [
    {
      sql: `INSERT INTO koinonia_exchange_messages
        (id, thread_id, parish_id, sender_person_id, body, message_type, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'text', ?6)`,
      params: [id, threadId, context.parishId, context.personId, messageBody, now],
    },
    {
      sql: `UPDATE koinonia_exchange_threads SET updated_at = ?1, revision = revision + 1
        WHERE id = ?2 AND parish_id = ?3`,
      params: [now, threadId, context.parishId],
    },
  ]);
  const sender = await d1First(env, "SELECT preferred_name FROM directory_people WHERE id = ?1", context.personId);
  const recipientPersonId = thread.requester_person_id === context.personId ? thread.posted_by_person_id : thread.requester_person_id;
  if (ctx?.waitUntil) {
    ctx.waitUntil(sendExchangeMessagePush(env, {
      parishId: context.parishId,
      recipientPersonId,
      senderName: sender?.preferred_name || "A parish member",
      listingId: thread.listing_id,
      listingTitle: thread.listing_title,
      threadId,
      message: { id, body: messageBody },
    }).then((summary) => console.log("exchange_push_delivery", JSON.stringify({ parishId: context.parishId, threadId, messageId: id, ...summary })))
      .catch((error) => console.error("exchange_push_delivery_failed", error?.message || String(error))));
  }
  return { ok: true, messageId: id };
}

async function markMessageRead(env, context, threadId, messageId) {
  await requireThreadParticipant(env, context, threadId);
  const message = await d1First(env, `
    SELECT id FROM koinonia_exchange_messages WHERE id = ?1 AND thread_id = ?2 AND parish_id = ?3
  `, messageId, threadId, context.parishId);
  if (!message) throw new ExchangeAccessError("Message not found.", 404);
  await markContentRead(database(env), {
    parishId: context.parishId,
    contentType: CONTENT_TYPE,
    contentId: messageId,
    donorId: context.donorId,
  });
  return { ok: true };
}

async function uploadListingPhoto(request, env, context, listingId) {
  if (!env.GROUP_MESSAGE_ASSETS) throw new ExchangeAccessError("Exchange photo storage is not configured.", 503);
  const listing = await d1First(env, `
    SELECT posted_by_person_id, status FROM koinonia_exchange_listings WHERE id = ?1 AND parish_id = ?2
  `, listingId, context.parishId);
  if (!listing) throw new ExchangeAccessError("Listing not found.", 404);
  if (listing.posted_by_person_id !== context.personId) throw new ExchangeAccessError("Only the poster can add listing photos.", 403);
  if (listing.status !== "active") throw new ExchangeAccessError("Photos can only be added to active listings.", 409);
  const count = await d1First(env, "SELECT COUNT(*) AS n FROM koinonia_exchange_photos WHERE listing_id = ?1", listingId);
  if (Number(count?.n || 0) >= MAX_LISTING_PHOTOS) throw new ExchangeAccessError(`Listings can include up to ${MAX_LISTING_PHOTOS} photos.`, 409);
  const metadata = validateGroupMessageAttachmentMetadata(request, "image");
  if (metadata.error) throw new ExchangeAccessError(metadata.error.replace("Group photos", "Listing photos"), metadata.status);
  if (!request.body) throw new ExchangeAccessError("The photo is empty.", 422);
  const photoId = generateSecret("koinonia_photo");
  const key = exchangePhotoStorageKey({ parishId: context.parishId, listingId, photoId });
  let stored;
  try {
    stored = await storeGroupMessageAttachment(env.GROUP_MESSAGE_ASSETS, {
      key,
      source: request.body,
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
      maxBytes: GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
    });
  } catch (error) {
    if (error?.message === "GROUP_MESSAGE_ATTACHMENT_TOO_LARGE") throw new ExchangeAccessError("Listing photos must be 10MB or smaller.", 413);
    if (["GROUP_MESSAGE_ATTACHMENT_LENGTH_REQUIRED", "GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH"].includes(error?.message)) {
      throw new ExchangeAccessError("The photo size did not match the uploaded file.", 422);
    }
    console.error("exchange_photo_store_failed", JSON.stringify({ parishId: context.parishId, listingId, error: error?.message || String(error) }));
    throw new ExchangeAccessError("Unable to store this photo. Please try again.", 503);
  }
  if (!stored.size) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw new ExchangeAccessError("The photo is empty.", 422);
  }
  const now = Date.now();
  try {
    await d1Run(env, `
      INSERT INTO koinonia_exchange_photos (id, listing_id, storage_key, display_order, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `, photoId, listingId, key, (Number(count?.n || 0) + 1) * 100, now);
  } catch (error) {
    await env.GROUP_MESSAGE_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  return { ok: true, photo: photoFromRow({ id: photoId, listing_id: listingId, display_order: (Number(count?.n || 0) + 1) * 100, created_at: now }) };
}

async function deliverListingPhoto(env, context, photoId) {
  if (!env.GROUP_MESSAGE_ASSETS) throw new ExchangeAccessError("Exchange photo storage is not configured.", 503);
  const photo = await d1First(env, `
    SELECT photo.storage_key
    FROM koinonia_exchange_photos photo
    JOIN koinonia_exchange_listings listing ON listing.id = photo.listing_id
    WHERE photo.id = ?1 AND listing.parish_id = ?2
  `, photoId, context.parishId);
  if (!photo?.storage_key) throw new ExchangeAccessError("Photo not found.", 404);
  const object = await env.GROUP_MESSAGE_ASSETS.get(photo.storage_key);
  if (!object?.body) throw new ExchangeAccessError("Photo not found.", 404);
  const headers = new Headers(PRIVATE_HEADERS);
  object.writeHttpMetadata?.(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  if (Number(object.size || 0) > 0) headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

export async function expireKoinoniaExchangeListings(env, asOf = Date.now()) {
  if (!database(env)) return { expired: 0 };
  const result = await d1Run(env, `
    UPDATE koinonia_exchange_listings
    SET status = 'expired', updated_at = ?1, revision = revision + 1
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?1
  `, Number(asOf));
  return { expired: Number(result?.meta?.changes || 0), asOf: Number(asOf) };
}

function errorResponse(error) {
  if (error instanceof ExchangeAccessError) return privateJson({ error: error.message }, { status: error.status });
  throw error;
}

export async function handleDonorKoinoniaExchange(request, env, ctx = null) {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "koinonia-exchange", { limit: 100, windowSeconds: 300 });
  if (limited) return limited;
  try {
    const access = await featureContext(request, env);
    if (access.response) return access.response;
    const context = access.context;
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/donor\/koinonia\/exchange\/?/, "");
    const parts = path ? path.split("/").map(decodeURIComponent) : [];

    if (parts.length === 1 && parts[0] === "listings" && request.method === "GET") return privateJson({ ok: true, listings: await listListings(request, env, context) });
    if (parts.length === 1 && parts[0] === "listings" && request.method === "POST") return privateJson(await createListing(request, env, context), { status: 201 });
    if (parts.length === 3 && parts[0] === "listings" && parts[2] === "complete" && request.method === "POST") return privateJson(await completeExchangeListing(env, context, parts[1]));
    if (parts.length === 3 && parts[0] === "listings" && parts[2] === "threads" && request.method === "POST") return privateJson(await startThread(env, context, parts[1]), { status: 201 });
    if (parts.length === 3 && parts[0] === "listings" && parts[2] === "threads" && request.method === "GET") return privateJson({ ok: true, threads: await listThreadsForListing(env, context, parts[1]) });
    if (parts.length === 3 && parts[0] === "listings" && parts[2] === "photos" && request.method === "POST") return privateJson(await uploadListingPhoto(request, env, context, parts[1]), { status: 201 });
    if (parts.length === 2 && parts[0] === "photos" && request.method === "GET") return deliverListingPhoto(env, context, parts[1]);
    if (parts.length === 3 && parts[0] === "threads" && parts[2] === "messages" && request.method === "GET") return privateJson({ ok: true, ...(await getThreadMessages(env, context, parts[1])) });
    if (parts.length === 3 && parts[0] === "threads" && parts[2] === "messages" && request.method === "POST") return privateJson(await sendMessage(request, env, ctx, context, parts[1]), { status: 201 });
    if (parts.length === 5 && parts[0] === "threads" && parts[2] === "messages" && parts[4] === "read" && request.method === "POST") return privateJson(await markMessageRead(env, context, parts[1], parts[3]));
    return privateJson({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
}
