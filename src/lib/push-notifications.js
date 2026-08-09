import { buildPushPayload } from "@block65/webcrypto-web-push";
import {
  generateSecret,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  unauthorized,
} from "./core.js";
import { requireDonor } from "../handlers/parish.js";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Vary": "Authorization, X-AGAPAY-Donor-Email",
};
const VAPID_SUBJECT = "mailto:support@agapay.app";
const EXPIRY_STATUSES = new Set([404, 410]);

function privateJson(payload, init = {}) {
  return json(payload, { ...init, headers: { ...PRIVATE_HEADERS, ...(init.headers || {}) } });
}

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function cleanBase64Url(value, name, { min = 16, max = 200 } = {}) {
  const cleaned = String(value || "").trim();
  if (cleaned.length < min || cleaned.length > max || !/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    throw new Error(`Invalid push subscription ${name}.`);
  }
  return cleaned;
}

function cleanEndpoint(value) {
  const endpoint = String(value || "").trim();
  if (!endpoint || endpoint.length > 2048) throw new Error("Invalid push subscription endpoint.");
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Invalid push subscription endpoint.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("Invalid push subscription endpoint.");
  }
  return parsed.toString();
}

export function pushConfigured(env) {
  return Boolean(String(env?.VAPID_PUBLIC_KEY || "").trim() && String(env?.VAPID_PRIVATE_KEY || "").trim());
}

export function normalizePushSubscription(input = {}) {
  const source = input.subscription && typeof input.subscription === "object" ? input.subscription : input;
  return {
    endpoint: cleanEndpoint(source.endpoint),
    p256dh: cleanBase64Url(source.keys?.p256dh ?? source.p256dh, "p256dh", { min: 40 }),
    auth: cleanBase64Url(source.keys?.auth ?? source.auth, "auth"),
  };
}

export async function savePushSubscription(env, { parishId, donorId, subscription }) {
  const normalized = normalizePushSubscription(subscription);
  await database(env).prepare(`
    INSERT INTO push_subscriptions (id, parish_id, donor_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      parish_id = excluded.parish_id,
      donor_id = excluded.donor_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      created_at = datetime('now')
  `).bind(
    generateSecret("push_subscription"),
    parishId,
    normalizeEmail(donorId),
    normalized.endpoint,
    normalized.p256dh,
    normalized.auth,
  ).run();
  return normalized;
}

export async function removePushSubscription(env, { parishId, donorId, endpoint }) {
  const normalizedEndpoint = cleanEndpoint(endpoint);
  const result = await database(env).prepare(`
    DELETE FROM push_subscriptions
    WHERE parish_id = ? AND donor_id = ? AND endpoint = ?
  `).bind(parishId, normalizeEmail(donorId), normalizedEndpoint).run();
  return Number(result?.meta?.changes || 0) > 0;
}

export async function listParishPushSubscriptions(env, parishId, { excludePersonId = "" } = {}) {
  const exclusion = excludePersonId ? `
    AND NOT EXISTS (
      SELECT 1 FROM platform_users user
      JOIN directory_person_links link
        ON link.link_type = 'platform_user' AND link.external_id = user.id AND link.active = 1
      WHERE user.email = push.donor_id AND user.status = 'active' AND link.person_id = ?
    )` : "";
  const result = await database(env).prepare(`
    SELECT push.id, push.parish_id, push.donor_id, push.endpoint, push.p256dh, push.auth
    FROM push_subscriptions push
    WHERE push.parish_id = ?${exclusion}
  `).bind(...(excludePersonId ? [parishId, excludePersonId] : [parishId])).all();
  return result.results || [];
}

export async function listGroupPushSubscriptions(env, { parishId, ministryId, authorPersonId }) {
  const result = await database(env).prepare(`
    SELECT DISTINCT ps.id, ps.parish_id, ps.donor_id, ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN platform_users u
      ON u.email = ps.donor_id AND u.status = 'active'
    JOIN directory_person_links l
      ON l.link_type = 'platform_user' AND l.external_id = u.id AND l.active = 1
    JOIN directory_people p
      ON p.id = l.person_id AND p.active = 1
    WHERE ps.parish_id = ?
      AND p.id <> ?
      AND (
        EXISTS (
          SELECT 1 FROM directory_ministry_participants mp
          WHERE mp.parish_id = ? AND mp.ministry_id = ?
            AND mp.person_id = p.id AND mp.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM directory_ministry_leaders ml
          WHERE ml.parish_id = ? AND ml.ministry_id = ?
            AND ml.person_id = p.id AND ml.active = 1
        )
      )
  `).bind(
    parishId,
    authorPersonId,
    parishId,
    ministryId,
    parishId,
    ministryId,
  ).all();
  return result.results || [];
}

export async function listPersonPushSubscriptions(env, { parishId, personId }) {
  const result = await database(env).prepare(`
    SELECT DISTINCT ps.id, ps.parish_id, ps.donor_id, ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN platform_users user
      ON user.email = ps.donor_id AND user.status = 'active'
    JOIN directory_person_links link
      ON link.link_type = 'platform_user' AND link.external_id = user.id AND link.active = 1
    WHERE ps.parish_id = ? AND link.person_id = ?
  `).bind(parishId, personId).all();
  return result.results || [];
}

export async function sendWebPush(env, subscription, notification, {
  fetchImpl = fetch,
  buildPayload = buildPushPayload,
} = {}) {
  if (!pushConfigured(env)) return { status: 503, configured: false };
  const request = await buildPayload(
    {
      data: JSON.stringify(notification),
      options: { ttl: 60 * 60 * 24, urgency: "normal" },
    },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    {
      subject: VAPID_SUBJECT,
      publicKey: String(env.VAPID_PUBLIC_KEY).trim(),
      privateKey: String(env.VAPID_PRIVATE_KEY).trim(),
    },
  );
  const response = await fetchImpl(subscription.endpoint, { ...request, redirect: "manual" });
  return { status: response.status, configured: true };
}

async function deleteExpiredSubscription(env, endpoint) {
  await database(env).prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

export async function deliverPushNotifications(env, subscriptions, notification, dependencies = {}) {
  const summary = { attempted: subscriptions.length, sent: 0, expired: 0, failed: 0 };
  for (let offset = 0; offset < subscriptions.length; offset += 20) {
    const batch = subscriptions.slice(offset, offset + 20);
    await Promise.all(batch.map(async (subscription) => {
      try {
        const result = await sendWebPush(env, subscription, notification, dependencies);
        if (result.status >= 200 && result.status < 300) {
          summary.sent += 1;
          return;
        }
        if (EXPIRY_STATUSES.has(result.status)) {
          await deleteExpiredSubscription(env, subscription.endpoint);
          summary.expired += 1;
          return;
        }
        summary.failed += 1;
      } catch (error) {
        summary.failed += 1;
        console.error("push_delivery_failed", error?.message || String(error));
      }
    }));
  }
  return summary;
}

function notificationExcerpt(value, max = 160) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_>`~\[\]()!-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function sendAnnouncementPush(env, { parishId, parishName, announcement }, dependencies = {}) {
  const subscriptions = await listParishPushSubscriptions(env, parishId);
  return deliverPushNotifications(env, subscriptions, {
    title: `New from ${String(parishName || "your parish").trim()}`,
    body: notificationExcerpt(announcement.title || announcement.body) || "A new parish announcement is ready.",
    url: "/myagapay/feed",
    tag: `announcement-${announcement.id}`,
  }, dependencies);
}

export async function sendTeachingPush(env, { parishId, parishName, teaching }, dependencies = {}) {
  const subscriptions = await listParishPushSubscriptions(env, parishId);
  return deliverPushNotifications(env, subscriptions, {
    title: `New teaching from ${String(parishName || "your parish").trim()}`,
    body: notificationExcerpt(teaching.title || teaching.body) || "New teaching is available.",
    url: "/myagapay/teaching",
    tag: `teaching-${teaching.id}`,
  }, dependencies);
}

export async function sendGroupMessagePush(env, {
  parishId,
  ministryId,
  ministryName,
  authorPersonId,
  authorName,
  message,
}, dependencies = {}) {
  const subscriptions = await listGroupPushSubscriptions(env, { parishId, ministryId, authorPersonId });
  const excerpt = groupMessagePushExcerpt(message);
  return deliverPushNotifications(env, subscriptions, {
    title: `New message in ${String(ministryName || "your group").trim()}`,
    body: `${String(authorName || "A parish member").trim()}: ${excerpt}`,
    url: `/myagapay/groups?group=${encodeURIComponent(ministryId)}`,
    tag: `group-${ministryId}`,
  }, dependencies);
}

export function groupMessagePushExcerpt(message = {}) {
  return notificationExcerpt(message.body)
    || (message.messageType === "voice" ? "🎤 Voice message" : message.messageType === "image" ? "📷 Photo" : "New message");
}

export async function sendSignupPublishedPush(env, {
  parishId,
  publishedByPersonId,
  sheetId,
  sheetTitle,
  ministryName,
}, dependencies = {}) {
  const subscriptions = await listParishPushSubscriptions(env, parishId, { excludePersonId: publishedByPersonId });
  return deliverPushNotifications(env, subscriptions, {
    title: `New signup${ministryName ? ` · ${String(ministryName).trim()}` : ""}`,
    body: String(sheetTitle || "A new parish signup is ready.").trim(),
    url: `/myagapay/signups?sheet=${encodeURIComponent(sheetId)}`,
    tag: `signup-published-${sheetId}`,
  }, dependencies);
}

export async function sendExchangeListingPush(env, {
  parishId,
  publishedByPersonId,
  listingId,
  listingTitle,
  listingType,
}, dependencies = {}) {
  const subscriptions = await listParishPushSubscriptions(env, parishId, { excludePersonId: publishedByPersonId });
  const action = listingType === "request" ? "requested" : "offered";
  return deliverPushNotifications(env, subscriptions, {
    title: `New Exchange ${listingType === "request" ? "request" : "offer"}`,
    body: `${String(listingTitle || "A parish item").trim()} was ${action}.`,
    url: `/myagapay/exchange?listing=${encodeURIComponent(listingId)}`,
    tag: `exchange-listing-${listingId}`,
  }, dependencies);
}

export async function sendSignupReminderPush(env, {
  parishId,
  personId,
  sheetId,
  sheetTitle,
  slotLabel,
  slotDate,
  ministryName,
  reminderLabel = "",
}, dependencies = {}) {
  const subscriptions = await listPersonPushSubscriptions(env, { parishId, personId });
  const when = slotDate == null
    ? ""
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(slotDate));
  const detail = [String(slotLabel || "Your signup").trim(), when].filter(Boolean).join(" · ");
  return deliverPushNotifications(env, subscriptions, {
    title: `${reminderLabel ? String(reminderLabel).trim() : "Signup confirmed"}${ministryName ? ` · ${String(ministryName).trim()}` : ""}`,
    body: `${String(sheetTitle || "Parish signup").trim()}: ${detail}`,
    url: `/myagapay/signups?sheet=${encodeURIComponent(sheetId)}`,
    tag: `signup-${sheetId}-${personId}`,
  }, dependencies);
}

export async function sendExchangeMessagePush(env, {
  parishId,
  recipientPersonId,
  senderName,
  listingId,
  listingTitle,
  threadId,
  message,
}, dependencies = {}) {
  const subscriptions = await listPersonPushSubscriptions(env, { parishId, personId: recipientPersonId });
  return deliverPushNotifications(env, subscriptions, {
    title: `New Exchange message from ${String(senderName || "a parish member").trim()}`,
    body: `${String(listingTitle || "Exchange listing").trim()}: ${notificationExcerpt(message?.body) || "New message"}`,
    url: `/myagapay/exchange?listing=${encodeURIComponent(listingId)}&thread=${encodeURIComponent(threadId)}`,
    tag: `exchange-thread-${threadId}`,
  }, dependencies);
}

export async function handleDonorPush(request, env, action = "") {
  if (!hasProductionStore(env) || !database(env)) return missingProductionStoreResponse();
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) return privateJson({ error: "Choose your home parish before enabling notifications." }, { status: 422 });
  const donorId = normalizeEmail(donor.email);

  if (action === "config" && request.method === "GET") {
    return privateJson({
      configured: pushConfigured(env),
      publicKey: pushConfigured(env) ? String(env.VAPID_PUBLIC_KEY).trim() : "",
    });
  }

  if (action === "subscribe" && request.method === "POST") {
    if (!pushConfigured(env)) return privateJson({ error: "Push notifications are not configured." }, { status: 503 });
    try {
      const subscription = await savePushSubscription(env, {
        parishId,
        donorId,
        subscription: await request.json().catch(() => ({})),
      });
      return privateJson({ ok: true, endpoint: subscription.endpoint }, { status: 201 });
    } catch (error) {
      return privateJson({ error: error.message || "Invalid push subscription." }, { status: 422 });
    }
  }

  if (action === "unsubscribe" && request.method === "POST") {
    try {
      const input = await request.json().catch(() => ({}));
      const removed = await removePushSubscription(env, { parishId, donorId, endpoint: input.endpoint });
      return privateJson({ ok: true, removed });
    } catch (error) {
      return privateJson({ error: error.message || "Invalid push subscription." }, { status: 422 });
    }
  }

  return privateJson({ error: "Method not allowed" }, { status: 405 });
}
