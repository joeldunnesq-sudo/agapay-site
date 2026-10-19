import { PASSWORD_HASH_VERSION, PASSWORD_HASH_ITERATIONS, pbkdf2Hex, createPasswordRecord, parsePasswordRecord, verifyPasswordRecord } from './password-records.js';
export { PASSWORD_HASH_VERSION, PASSWORD_HASH_ITERATIONS, pbkdf2Hex, createPasswordRecord, parsePasswordRecord, verifyPasswordRecord };
import { privilegedMfaRequired } from './authentication-policy.js';
export { privilegedMfaRequired };
import { hasProductionStore, missingProductionStoreResponse, d1GetSetting, d1SetSetting } from './storage-policy.js';
export { hasProductionStore, missingProductionStoreResponse, d1GetSetting, d1SetSetting };
import { parseAdminSessionStore, loadAdminSessionStore, saveAdminSessionStore, normalizeAdminActor, pruneAdminSessions, issueAdminSession, markAdminSessionMfaVerified, resolveAdminSession } from './admin-sessions.js';
export { parseAdminSessionStore, loadAdminSessionStore, saveAdminSessionStore, normalizeAdminActor, pruneAdminSessions, issueAdminSession, markAdminSessionMfaVerified, resolveAdminSession };
import { loadDonor, saveDonor, deleteDonor } from './donor-repository.js';
export { loadDonor, saveDonor, deleteDonor };
import { normalizeEmail } from './format.js';
export { normalizeEmail };
import { donorKey } from './storage-keys.js';
export { donorKey };
import { ADMIN_SESSION_TTL_MS, ADMIN_SESSION_MAX } from './admin-sessions.js';
export { ADMIN_SESSION_TTL_MS, ADMIN_SESSION_MAX };
export { DONOR_SESSION_TTL_MS } from './donor-sessions.js';
import { ADMIN_PASSWORD_KV_KEY, ADMIN_SESSION_STORE_KEY, COMMEMORATION_KEY_PREFIX, DONOR_KEY_PREFIX, DONOR_OFFERING_KEY_PREFIX, DONOR_CHECKOUT_INDEX_PREFIX, RATE_LIMIT_PREFIX, STRIPE_EVENT_PREFIX, PARISH_ID_INDEX_PREFIX, STRIPE_ACCOUNT_INDEX_PREFIX, STRIPE_SUBSCRIPTION_INDEX_PREFIX, STRIPE_PAYMENT_INTENT_INDEX_PREFIX, isSystemKvKey, parishIdIndexKey } from './storage-keys.js';
export { ADMIN_PASSWORD_KV_KEY, ADMIN_SESSION_STORE_KEY, COMMEMORATION_KEY_PREFIX, DONOR_KEY_PREFIX, DONOR_OFFERING_KEY_PREFIX, DONOR_CHECKOUT_INDEX_PREFIX, RATE_LIMIT_PREFIX, STRIPE_EVENT_PREFIX, PARISH_ID_INDEX_PREFIX, STRIPE_ACCOUNT_INDEX_PREFIX, STRIPE_SUBSCRIPTION_INDEX_PREFIX, STRIPE_PAYMENT_INTENT_INDEX_PREFIX, isSystemKvKey, parishIdIndexKey };
import { generateSecret, secureCompare, sha256Hex, hashSessionToken, randomHex } from './session-crypto.js';
export { generateSecret, secureCompare, sha256Hex, hashSessionToken, randomHex };
import { listKvKeys, d1, parseJsonRow, safeParseJsonRow, d1First, d1All, d1Run, d1Batch } from './storage.js';
export { listKvKeys, d1, parseJsonRow, safeParseJsonRow, d1First, d1All, d1Run, d1Batch };
import { PARISH_SESSION_TTL_MS, PARISH_SESSION_MAX, pruneParishDashboardSessions, issueParishDashboardSession, resolveParishDashboardSession, markParishDashboardSessionMfaVerified } from './parish-sessions.js';
export { PARISH_SESSION_TTL_MS, PARISH_SESSION_MAX, pruneParishDashboardSessions, issueParishDashboardSession, resolveParishDashboardSession, markParishDashboardSessionMfaVerified };

import { SECURITY_HEADERS, json, unauthorized, getBearerToken } from './api-responses.js';
export { SECURITY_HEADERS, json, unauthorized, getBearerToken };
// src/lib/core.js
// Shared constants and utility functions extracted from src/worker.js.




export const STRIPE_EVENT_PROCESSING_RETRY_MS = 1000 * 60 * 10;



const marketplaceBrowseCategories = [
  { id: "all", label: "All Categories", icon: "grid" },
  { id: "books-media", label: "Books & Media", icon: "book-open" },
  { id: "icons-artwork", label: "Icons & Artwork", icon: "image" },
  { id: "church-supplies", label: "Church Supplies", icon: "cross" },
  { id: "vestments-apparel", label: "Vestments & Apparel", icon: "shirt" },
  { id: "jewelry-crosses", label: "Jewelry & Crosses", icon: "jewel" },
  { id: "monastery-goods", label: "Monastery Goods", icon: "church" },
  { id: "home-gifts", label: "Home & Gifts", icon: "gift" },
  { id: "children-education", label: "Children & Education", icon: "users" },
  { id: "music-chant", label: "Music & Chant", icon: "music" },
  { id: "digital-products", label: "Digital Products", icon: "monitor" }
];

const marketplaceFeaturedFilters = [
  { id: "all", label: "All Listings", icon: "star" },
  { id: "new-arrivals", label: "New Arrivals", icon: "spark" },
  { id: "best-sellers", label: "Best Sellers", icon: "chart" },
  { id: "orthodox-makers", label: "Orthodox Makers", icon: "shield" },
  { id: "monastery-shops", label: "Monastery Shops", icon: "church" },
  { id: "on-sale", label: "On Sale", icon: "tag" }
];

const marketplaceShops = [
  {
    id: "holy-cross-monastery",
    name: "Holy Cross Monastery",
    subtitle: "Monastery Shop",
    location: "Wayne, WV",
    rating: 4.9,
    reviewCount: 230,
    badge: "Top Rated",
    imageType: "icon",
    imageUrl: "",
    category: "monastery-goods",
    tags: ["orthodox-makers", "best-sellers", "monastery-shops"]
  },
  {
    id: "mount-athos-icons",
    name: "Mount Athos Icons",
    subtitle: "Icons & Artwork",
    location: "Athos, Greece",
    rating: 4.9,
    reviewCount: 184,
    badge: "Top Rated",
    imageType: "photo",
    imageUrl: "/images/marketplace/interior-iconostasis.jpg",
    category: "icons-artwork",
    tags: ["best-sellers", "orthodox-makers"]
  },
  {
    id: "ancient-faith-publishing",
    name: "Ancient Faith Publishing",
    subtitle: "Books & Media",
    location: "West Chester, PA",
    rating: 4.8,
    reviewCount: 312,
    badge: "Top Rated",
    imageType: "photo",
    imageUrl: "/images/marketplace/mosaic-dome.jpg",
    category: "books-media",
    tags: ["best-sellers", "new-arrivals"]
  },
  {
    id: "orthodox-jewelry-co",
    name: "Orthodox Jewelry Co.",
    subtitle: "Jewelry & Crosses",
    location: "Boston, MA",
    rating: 4.8,
    reviewCount: 156,
    badge: "Top Rated",
    imageType: "photo",
    imageUrl: "/images/marketplace/enamel-lampada.jpg",
    category: "jewelry-crosses",
    tags: ["best-sellers", "new-arrivals"]
  },
  {
    id: "st-elizabeth-convent",
    name: "St. Elizabeth Convent",
    subtitle: "Candles & Goods",
    location: "Minsk, BY",
    rating: 4.7,
    reviewCount: 98,
    badge: "Orthodox Maker",
    imageType: "photo",
    imageUrl: "/images/marketplace/candle-stand.jpg",
    category: "church-supplies",
    tags: ["orthodox-makers", "new-arrivals"]
  }
];

const marketplaceProducts = [
  {
    id: "theotokos-of-tenderness-icon",
    title: "Theotokos of Tenderness Icon",
    shopName: "Mount Athos Icons",
    priceCents: 18900,
    imageUrl: "/images/marketplace/interior-iconostasis.jpg",
    category: "icons-artwork",
    tags: ["best-sellers", "orthodox-makers"]
  },
  {
    id: "the-way-of-a-pilgrim",
    title: "The Way of a Pilgrim",
    shopName: "Ancient Faith Publishing",
    priceCents: 1495,
    imageUrl: "/images/marketplace/dome-cross.jpg",
    category: "books-media",
    tags: ["best-sellers", "new-arrivals"]
  },
  {
    id: "wool-prayer-rope-100-knot",
    title: "Wool Prayer Rope 100 Knot",
    shopName: "Holy Cross Monastery",
    priceCents: 3300,
    imageUrl: "/images/marketplace/gilded-censer.jpg",
    category: "jewelry-crosses",
    tags: ["orthodox-makers", "best-sellers", "monastery-shops"]
  },
  {
    id: "beeswax-altar-candle",
    title: "Beeswax Altar Candle",
    shopName: "St. Elizabeth Convent",
    priceCents: 1200,
    imageUrl: "/images/marketplace/candle-stand.jpg",
    category: "church-supplies",
    tags: ["new-arrivals", "orthodox-makers"]
  },
  {
    id: "hand-carved-orthodox-cross",
    title: "Hand Carved Orthodox Cross",
    shopName: "Orthodox Woodworker",
    priceCents: 4500,
    imageUrl: "/images/marketplace/enamel-lampada.jpg",
    category: "home-gifts",
    tags: ["orthodox-makers", "best-sellers"]
  },
  {
    id: "akathist-prayer-book",
    title: "Akathist Prayer Book",
    shopName: "Ancient Faith Publishing",
    priceCents: 1895,
    imageUrl: "/images/marketplace/mosaic-dome.jpg",
    category: "books-media",
    tags: ["new-arrivals", "on-sale"]
  },
  {
    id: "incense-charcoal-set",
    title: "Incense + Charcoal Set",
    shopName: "Holy Cross Monastery",
    priceCents: 2200,
    imageUrl: "/images/marketplace/gilded-censer.jpg",
    category: "church-supplies",
    tags: ["monastery-shops", "best-sellers"]
  },
  {
    id: "orthodox-childrens-primer",
    title: "Orthodox Children's Primer",
    shopName: "Ancient Faith Publishing",
    priceCents: 2495,
    imageUrl: "/images/marketplace/dome-cross.jpg",
    category: "children-education",
    tags: ["new-arrivals"]
  }
];

export function marketplaceSearchText(entry = {}) {
  return [
    entry.name,
    entry.title,
    entry.subtitle,
    entry.shopName,
    entry.location,
    entry.category,
    ...(entry.tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchMarketplaceFilters(entry, { query, category, spotlight }) {
  if (category && category !== "all" && entry.category !== category) return false;
  if (spotlight && spotlight !== "all" && !(entry.tags || []).includes(spotlight)) return false;
  if (query && !marketplaceSearchText(entry).includes(query)) return false;
  return true;
}

export function buildMarketplaceCategorySummaries(products = []) {
  const counts = new Map();
  for (const product of products) {
    const key = product.category || "all";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return marketplaceBrowseCategories
    .filter((category) => category.id !== "all")
    .map((category) => ({
      ...category,
      itemCount: counts.get(category.id) || 0
    }));
}

export function handleMarketplaceCatalog(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().toLowerCase();
  const category = (url.searchParams.get("category") || "all").trim().toLowerCase();
  const spotlight = (url.searchParams.get("spotlight") || "all").trim().toLowerCase();

  const filteredShops = marketplaceShops.filter((entry) =>
    matchMarketplaceFilters(entry, { query, category, spotlight })
  );
  const filteredProducts = marketplaceProducts.filter((entry) =>
    matchMarketplaceFilters(entry, { query, category, spotlight })
  );

  const featuredShops = filteredShops.slice(0, 8);
  const curatedPicks = filteredProducts.slice(0, 12);
  const popularCategories = buildMarketplaceCategorySummaries(filteredProducts.length ? filteredProducts : marketplaceProducts);

  return json({
    query: {
      q: query,
      category,
      spotlight
    },
    browseCategories: marketplaceBrowseCategories,
    featuredFilters: marketplaceFeaturedFilters,
    featuredShops,
    popularCategories,
    curatedPicks,
    totals: {
      shops: filteredShops.length,
      products: filteredProducts.length
    }
  });
}

// Baseline security response headers, applied to every Worker-generated
// response (API JSON) via json()/corsJson() below. Static assets get the
// same set via public/_headers, which Cloudflare's asset layer applies
// independently of the Worker -- see docs/SECURITY_HEADERS.md for how the
// two mechanisms cover different response paths and why both are needed.
//
// CSP ships in Report-Only mode intentionally: this codebase has
// extensive inline <script>/style="" usage by design (no build step), so
// an enforcing CSP without nonces would break real pages. Report-Only
// has zero behavior risk -- browsers only log violations to the console,
// never block -- while still surfacing anything loading from an
// unexpected origin (the actual threat CSP defends against here).


export function applyGivingEmbedHeaders(request, response) {
  const pathname = new URL(request.url).pathname;
  if (!(pathname === "/give/embed" || pathname === "/give/embed.html" || /^\/give\/embed\/[^/]+\/?$/.test(pathname))) return response;
  const headers = new Headers(response.headers);
  headers.delete("X-Frame-Options");
  headers.set("Content-Security-Policy", "frame-ancestors *");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}



// CORS headers for public-facing API endpoints that may be called cross-origin.
// Production must opt into a specific origin; a missing production binding
// deliberately omits Access-Control-Allow-Origin rather than failing open.
// Non-production environments retain the wildcard default for local/staging use.
export function corsHeaders(env) {
  const configuredOrigin = String(env?.AGAPAY_CORS_ORIGIN || "").trim();
  const environment = String(env?.AGAPAY_ENVIRONMENT || "").trim().toLowerCase();
  const origin = configuredOrigin || (environment === "production" ? "" : "*");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AGAPAY-Donor-Email",
    "Access-Control-Max-Age": "86400"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function corsJson(body, env, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...corsHeaders(env),
      ...(init.headers || {})
    }
  });
}

export function corsPreflightResponse(env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env)
  });
}





export function getAdminToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return request.headers.get("X-AGAPAY-Admin-Token") || "";
}



export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "unknown";
}

async function rateLimitCounter(env, key, { limit = 10, windowSeconds = 60 } = {}) {
  let next;
  try {
    if (!env.AGAPAY_RATE_LIMITER) throw new Error('Rate limiter binding unavailable');
    const response = await env.AGAPAY_RATE_LIMITER.get(env.AGAPAY_RATE_LIMITER.idFromName(key)).fetch('https://rate-limit.internal/', {
      method: 'POST',
      body: JSON.stringify({ limit, expiresAt: Date.now() + windowSeconds * 2000 }),
    });
    if (!response.ok) throw new Error('Rate limiter request failed');
    next = (await response.json()).attempts;
    if (!Number.isInteger(next) || next < 1) throw new Error('Invalid rate limiter response');
  } catch {
    // A missing or failed security dependency must never silently disable limits.
    console.error(JSON.stringify({ eventType: 'rate_limit.unavailable', severity: 'error' }));
    return json({ error: 'Request protection is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Retry-After': '30' } });
  }
  if (next <= limit) return null;
  return json(
    {
      error: "Too many attempts. Please wait a moment and try again.",
      retryAfterSeconds: windowSeconds
    },
    {
      status: 429,
      headers: { "Retry-After": String(windowSeconds) }
    }
  );
}

export async function rateLimit(request, env, bucket, { limit = 10, windowSeconds = 60 } = {}) {
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const ipHash = await sha256Hex(clientIp(request));
  const key = `${RATE_LIMIT_PREFIX}${bucket}:ip:${ipHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}

export async function rateLimitByKey(request, env, bucket, identifier, { limit = 10, windowSeconds = 60 } = {}) {
  const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
  if (!normalizedIdentifier) return null;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const identifierHash = await sha256Hex(normalizedIdentifier);
  const key = `${RATE_LIMIT_PREFIX}${bucket}:key:${identifierHash}:${windowId}`;
  return rateLimitCounter(env, key, { limit, windowSeconds });
}

export async function verifyTurnstileIfConfigured(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return null;
  if (!token) return json({ error: "Security check is required. Please refresh and try again." }, { status: 403 });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: clientIp(request)
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!result.success) return json({ error: "Security check failed. Please refresh and try again." }, { status: 403 });
  return null;
}

export function handleSecurityConfig(env) {
  return json({
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
  });
}





export function donorOfferingKey(email, id) {
  return `${DONOR_OFFERING_KEY_PREFIX}${normalizeEmail(email)}:${id}`;
}

export function donorCheckoutIndexKey(checkoutSessionId) {
  return `${DONOR_CHECKOUT_INDEX_PREFIX}${checkoutSessionId}`;
}



export function stripeAccountIndexKey(stripeAccountId) {
  return `${STRIPE_ACCOUNT_INDEX_PREFIX}${stripeAccountId}`;
}

export function stripeSubscriptionIndexKey(subscriptionId) {
  return `${STRIPE_SUBSCRIPTION_INDEX_PREFIX}${subscriptionId}`;
}

export function stripePaymentIntentIndexKey(paymentIntentId) {
  return `${STRIPE_PAYMENT_INTENT_INDEX_PREFIX}${paymentIntentId}`;
}

export function stripeEventKey(eventId) {
  return `${STRIPE_EVENT_PREFIX}${eventId}`;
}

















export function clampListLimit(value, defaultLimit = 50, maxLimit = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}

export function encodeListCursor(row = {}) {
  const payload = {
    receivedAt: row.received_at || row.receivedAt || "",
    reference: row.reference || ""
  };
  if (!payload.receivedAt || !payload.reference) return "";
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeListCursor(cursor) {
  if (!cursor) return null;
  try {
    const normalized = String(cursor).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (!payload?.receivedAt || !payload?.reference) return null;
    return payload;
  } catch {
    return null;
  }
}










export function parseStoredStripeEvent(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return { status: "processed", receivedAt: raw };
}

export function staleStripeProcessingEvent(receivedAt, nowMs = Date.now()) {
  const receivedMs = Date.parse(receivedAt || "");
  return Number.isFinite(receivedMs) && nowMs - receivedMs > STRIPE_EVENT_PROCESSING_RETRY_MS;
}

export async function claimStripeEvent(env, event = {}) {
  const eventId = event.id || "";
  if (!eventId) return { claimed: true };
  const now = new Date().toISOString();
  if (d1(env)) {
    try {
      const result = await d1Run(
        env,
        `INSERT INTO stripe_events (id, event_type, status, received_at)
         VALUES (?1, ?2, 'processing', ?3)
         ON CONFLICT(id) DO NOTHING`,
        eventId,
        event.type || "",
        now
      );
      if ((result?.meta?.changes || 0) > 0) return { claimed: true };
      const row = await d1First(env, "SELECT status, received_at FROM stripe_events WHERE id = ?1", eventId);
      if (row?.status === "failed" || (row?.status === "processing" && staleStripeProcessingEvent(row.received_at))) {
        await d1Run(
          env,
          `UPDATE stripe_events
           SET event_type = ?2, status = 'processing', received_at = ?3, processed_at = NULL, error_message = ''
           WHERE id = ?1`,
          eventId,
          event.type || "",
          now
        );
        return { claimed: true, retryingFailed: row?.status === "failed", retryingStale: row?.status === "processing" };
      }
      return { claimed: false, duplicate: true, status: row?.status || "processed" };
    } catch (error) {
      const row = await d1First(env, "SELECT id FROM stripe_events WHERE id = ?1", eventId);
      if (row) return { claimed: false, duplicate: true, status: "processed", legacy: true };
      await d1Run(env, "INSERT INTO stripe_events (id, received_at) VALUES (?1, ?2)", eventId, now);
      return { claimed: true, legacy: true };
    }
  }

  if (env.AGAPAY_REGISTRATIONS) {
    const key = stripeEventKey(eventId);
    const existing = parseStoredStripeEvent(await env.AGAPAY_REGISTRATIONS.get(key));
    if (existing && existing.status !== "failed" && !(existing.status === "processing" && staleStripeProcessingEvent(existing.receivedAt))) {
      return { claimed: false, duplicate: true, status: existing.status || "processed" };
    }
    await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify({
      id: eventId,
      eventType: event.type || "",
      status: "processing",
      receivedAt: now,
      processedAt: "",
      errorMessage: ""
    }), {
      expirationTtl: 60 * 60 * 24 * 90
    });
    return {
      claimed: true,
      retryingFailed: existing?.status === "failed",
      retryingStale: existing?.status === "processing"
    };
  }
  return { claimed: true };
}

export async function finishStripeEvent(env, eventId, status = "processed", errorMessage = "") {
  if (!eventId) return;
  const now = new Date().toISOString();
  if (d1(env)) {
    try {
      await d1Run(
        env,
        `UPDATE stripe_events
         SET status = ?2, processed_at = ?3, error_message = ?4
         WHERE id = ?1`,
        eventId,
        status,
        status === "processed" ? now : "",
        String(errorMessage || "").slice(0, 1000)
      );
      return;
    } catch {
      if (status === "failed") {
        await d1Run(env, "DELETE FROM stripe_events WHERE id = ?1", eventId);
      }
      return;
    }
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(stripeEventKey(eventId), JSON.stringify({
      id: eventId,
      status,
      receivedAt: now,
      processedAt: status === "processed" ? now : "",
      errorMessage: String(errorMessage || "").slice(0, 1000)
    }), {
      expirationTtl: 60 * 60 * 24 * 90
    });
  }
}

export async function recordStripeEvent(env, eventId) {
  if (!eventId) return;
  const now = new Date().toISOString();
  if (d1(env)) {
    try {
      await d1Run(
        env,
        `INSERT INTO stripe_events (id, event_type, status, received_at, processed_at, error_message)
         VALUES (?1, '', 'processed', ?2, ?2, '')
         ON CONFLICT(id) DO UPDATE SET status = 'processed', processed_at = excluded.processed_at, error_message = ''`,
        eventId,
        now
      );
    } catch {
      await d1Run(
        env,
        `INSERT INTO stripe_events (id, received_at)
         VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET received_at = excluded.received_at`,
        eventId,
        now
      );
    }
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(stripeEventKey(eventId), JSON.stringify({
      id: eventId,
      status: "processed",
      receivedAt: now,
      processedAt: now,
      errorMessage: ""
    }), {
      expirationTtl: 60 * 60 * 24 * 90
    });
  }
}



















export async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}



















export function publicDonor(donor) {
  return {
    email: donor.email || "",
    donorName: donor.donorName || "",
    householdName: donor.householdName || donor.donorName || "",
    contactPhone: donor.contactPhone || "",
    defaultParishId: donor.defaultParishId || "",
    pledgeAmountCents: Number(donor.pledgeAmountCents || 0),
    pledgeCadence: donor.pledgeCadence === "monthly" ? "monthly" : "annual",
    pledgeYear: donor.pledgeYear || "",
    addressLine1: donor.addressLine1 || "",
    addressLine2: donor.addressLine2 || "",
    city: donor.city || "",
    state: donor.state || "",
    postalCode: donor.postalCode || "",
    country: donor.country || "",
    emailVerifiedAt: donor.emailVerifiedAt || "",
    createdAt: donor.createdAt || "",
    updatedAt: donor.updatedAt || "",
    lastLoginAt: donor.lastLoginAt || ""
  };
}







export async function verifyDonorPassword(donor, password) {
  if (donor?.passwordRecord && await verifyPasswordRecord(password, donor.passwordRecord)) return true;
  if (!donor?.passwordHash) return false;
  const submittedHash = await hashPassword(password, donor.passwordSalt || "");
  return secureCompare(submittedHash, donor.passwordHash || "");
}

export async function applyDonorPassword(donor, password) {
  return {
    ...donor,
    passwordRecord: await createPasswordRecord(password),
    passwordSalt: "",
    passwordHash: "",
    passwordUpdatedAt: new Date().toISOString()
  };
}

export async function verifyParishDashboardPassword(registration, password) {
  if (!registration || !password) return false;
  if (registration.parishDashboardPasswordRecord && await verifyPasswordRecord(password, registration.parishDashboardPasswordRecord)) return true;
  return Boolean(registration.parishDashboardToken && secureCompare(password, registration.parishDashboardToken));
}

export async function applyParishDashboardPassword(registration, password, { temporary = false, keepLegacyToken = false } = {}) {
  if (!password) return registration;
  return {
    ...registration,
    parishDashboardPasswordRecord: await createPasswordRecord(password),
    parishDashboardToken: keepLegacyToken ? password : "",
    parishDashboardTokenTemporary: Boolean(temporary),
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString(),
    parishDashboardTokenUpdatedAt: new Date().toISOString()
  };
}









// ─── AGAPAY Parish + access ─────────────────────────────────────────────────
// Moved here (rather than living only in handlers/stewardship.js) so that
// parish.js and donor.js — which gate the Sacraments & Services feature on
// an active AGAPAY Parish + subscription — can check access without
// creating a circular import (stewardship.js already imports from parish.js).

const STEWARDSHIP_ACTIVE_STATES = new Set(["active", "trialing"]);

// A comp grant is active if it was actually granted and hasn't passed its
// expiresAt. Entirely separate from the Stripe subscription fields — a
// comped parish has no Stripe customer/subscription at all.
export function hasActiveStewardshipComp(registration) {
  const comp = registration?.stewardshipComp;
  if (!comp?.active) return false;
  if (!comp.expiresAt) return true;
  return new Date(comp.expiresAt).getTime() > Date.now();
}

export function stewardshipStatus(registration) {
  if (hasActiveStewardshipComp(registration)) return "comped";
  return registration?.stewardshipStatus || "no_subscription";
}

export function hasStewardshipAccess(registration) {
  if (hasActiveStewardshipComp(registration)) return true;
  return STEWARDSHIP_ACTIVE_STATES.has(stewardshipStatus(registration));
}
