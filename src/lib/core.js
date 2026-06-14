// src/lib/core.js
// Shared constants and utility functions extracted from src/worker.js.


export const ADMIN_PASSWORD_KV_KEY = "__agapay_admin_password";
export const ADMIN_SESSION_STORE_KEY = "__agapay_admin_sessions";
export const COMMEMORATION_KEY_PREFIX = "__agapay_commemoration__";
export const DONOR_KEY_PREFIX = "__agapay_donor__";
export const DONOR_OFFERING_KEY_PREFIX = "__agapay_donor_offering__";
export const DONOR_CHECKOUT_INDEX_PREFIX = "__agapay_checkout_offering__";
export const RATE_LIMIT_PREFIX = "__agapay_rate_limit__";
export const STRIPE_EVENT_PREFIX = "__agapay_stripe_event__";
export const PARISH_ID_INDEX_PREFIX = "__agapay_index_parish_id__";
export const STRIPE_ACCOUNT_INDEX_PREFIX = "__agapay_index_stripe_account__";
export const STRIPE_SUBSCRIPTION_INDEX_PREFIX = "__agapay_index_stripe_subscription__";
export const STRIPE_PAYMENT_INTENT_INDEX_PREFIX = "__agapay_index_payment_intent__";
export const PASSWORD_HASH_VERSION = "pbkdf2-sha256";
export const PASSWORD_HASH_ITERATIONS = 100000;
export const DONOR_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
export const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
export const ADMIN_SESSION_MAX = 32;
export const PARISH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
export const PARISH_SESSION_MAX = 16;
export const STRIPE_EVENT_PROCESSING_RETRY_MS = 1000 * 60 * 10;

const subscriptionTiers = [
  {
    id: "mission",
    label: "Mission",
    monthlyCents: 4900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_MISSION_MONTHLY",
    description: "Monthly AGAPAY platform subscription for missions."
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 9900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_MONTHLY",
    description: "Monthly AGAPAY platform subscription for established parishes."
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "Negotiated transaction rate",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AGAPAY pricing for cathedrals, dioceses, and multi-parish organizations."
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "",
    description: "AGAPAY transaction pricing for Orthodox monasteries and sketes."
  }
];

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

export function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

export function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

export function isSystemKvKey(keyName) {
  const key = String(keyName || "");
  return key === ADMIN_PASSWORD_KV_KEY
    || key === ADMIN_SESSION_STORE_KEY
    || key.startsWith(COMMEMORATION_KEY_PREFIX)
    || key.startsWith(DONOR_KEY_PREFIX)
    || key.startsWith(DONOR_OFFERING_KEY_PREFIX)
    || key.startsWith(DONOR_CHECKOUT_INDEX_PREFIX)
    || key.startsWith(RATE_LIMIT_PREFIX)
    || key.startsWith(STRIPE_EVENT_PREFIX)
    || key.startsWith(PARISH_ID_INDEX_PREFIX)
    || key.startsWith(STRIPE_ACCOUNT_INDEX_PREFIX)
    || key.startsWith(STRIPE_SUBSCRIPTION_INDEX_PREFIX)
    || key.startsWith(STRIPE_PAYMENT_INTENT_INDEX_PREFIX);
}

export function getAdminToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return request.headers.get("X-AGAPAY-Admin-Token") || "";
}

export function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "unknown";
}

export async function rateLimit(request, env, bucket, { limit = 10, windowSeconds = 60 } = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const ipHash = await sha256Hex(clientIp(request));
  const key = `${RATE_LIMIT_PREFIX}${bucket}:${ipHash}:${windowId}`;
  const current = Number(await env.AGAPAY_REGISTRATIONS.get(key)) || 0;
  const next = current + 1;
  await env.AGAPAY_REGISTRATIONS.put(key, String(next), {
    expirationTtl: Math.max(windowSeconds * 2, 60)
  });
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

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function donorKey(email) {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}

export function donorOfferingKey(email, id) {
  return `${DONOR_OFFERING_KEY_PREFIX}${normalizeEmail(email)}:${id}`;
}

export function donorCheckoutIndexKey(checkoutSessionId) {
  return `${DONOR_CHECKOUT_INDEX_PREFIX}${checkoutSessionId}`;
}

export function parishIdIndexKey(parishId) {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
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

export async function listKvKeys(env, { prefix = "", limit = 1000, pageSize = 100 } = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = [];
  let cursor;
  do {
    const page = await env.AGAPAY_REGISTRATIONS.list({
      prefix,
      limit: Math.min(pageSize, Math.max(1, limit - keys.length)),
      cursor
    });
    keys.push(...page.keys);
    cursor = page.list_complete || keys.length >= limit ? undefined : page.cursor;
  } while (cursor && keys.length < limit);
  return keys;
}

export function hasProductionStore(env) {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}

export function missingProductionStoreResponse() {
  return json({ error: "AGAPAY production data store is not configured" }, { status: 500 });
}

export function d1(env) {
  return env.AGAPAY_DB || null;
}

export function parseJsonRow(row) {
  if (!row?.data) return null;
  return JSON.parse(row.data);
}

export function safeParseJsonRow(row) {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}

export async function d1First(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env).prepare(sql).bind(...params).first();
}

export async function d1All(env, sql, ...params) {
  if (!d1(env)) return [];
  const result = await d1(env).prepare(sql).bind(...params).all();
  return result.results || [];
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

export async function d1Run(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env).prepare(sql).bind(...params).run();
}

export async function d1GetSetting(env, key) {
  const row = await d1First(env, "SELECT value FROM app_settings WHERE key = ?1", key);
  return row?.value || "";
}

export async function d1SetSetting(env, key, value) {
  await d1Run(
    env,
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString()
  );
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

export function generateSecret(prefix = "agp") {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return toHex(digest);
}

export function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function pbkdf2Hex(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(String(salt || "")),
      iterations
    },
    keyMaterial,
    256
  );
  return toHex(derived);
}

export async function createPasswordRecord(password) {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS)
  };
}

export function parsePasswordRecord(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function verifyPasswordRecord(password, record) {
  const parsed = parsePasswordRecord(record);
  if (!parsed || parsed.version !== PASSWORD_HASH_VERSION || !parsed.salt || !parsed.hash) return false;
  const submitted = await pbkdf2Hex(password, parsed.salt, Number(parsed.iterations || PASSWORD_HASH_ITERATIONS));
  return secureCompare(submitted, parsed.hash);
}

export async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

export async function hashSessionToken(token, salt) {
  return sha256Hex(`session:${salt}:${token}`);
}

export function parseAdminSessionStore(value) {
  if (!value) return { version: 1, sessions: [] };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: [] };
  }
}

export async function loadAdminSessionStore(env) {
  if (d1(env)) {
    return parseAdminSessionStore(await d1GetSetting(env, ADMIN_SESSION_STORE_KEY));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    return parseAdminSessionStore(await env.AGAPAY_REGISTRATIONS.get(ADMIN_SESSION_STORE_KEY));
  }
  return { version: 1, sessions: [] };
}

export async function saveAdminSessionStore(env, store) {
  const payload = JSON.stringify({
    version: 1,
    sessions: Array.isArray(store?.sessions) ? store.sessions : []
  });
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_SESSION_STORE_KEY, payload);
    return;
  }
  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_SESSION_STORE_KEY, payload);
  }
}

export function normalizeAdminActor(actor) {
  const cleaned = String(actor || "").trim();
  if (!cleaned) return "Admin";
  return cleaned.slice(0, 80);
}

export function pruneAdminSessions(sessions, nowMs = Date.now()) {
  return sessions.filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export async function issueAdminSession(env, actor = "Admin") {
  const nowMs = Date.now();
  const token = generateSecret("agp_admin");
  const sessionSalt = generateSecret("admin_salt");
  const tokenHash = await hashSessionToken(token, sessionSalt);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + ADMIN_SESSION_TTL_MS).toISOString();
  const store = await loadAdminSessionStore(env);
  const sessions = pruneAdminSessions(store.sessions, nowMs);
  sessions.push({
    id: generateSecret("adminsess"),
    actor: normalizeAdminActor(actor),
    tokenHash,
    sessionSalt,
    createdAt,
    expiresAt
  });
  sessions.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  while (sessions.length > ADMIN_SESSION_MAX) sessions.shift();
  await saveAdminSessionStore(env, { version: 1, sessions });
  return { token, actor: normalizeAdminActor(actor), createdAt, expiresAt };
}

export async function resolveAdminSession(env, token) {
  if (!token) return null;
  const nowMs = Date.now();
  const store = await loadAdminSessionStore(env);
  const active = pruneAdminSessions(store.sessions, nowMs);
  if (active.length !== store.sessions.length) {
    await saveAdminSessionStore(env, { version: 1, sessions: active });
  }

  for (const session of active) {
    const submitted = await hashSessionToken(token, session.sessionSalt || "");
    if (secureCompare(submitted, session.tokenHash || "")) {
      return {
        id: session.id || "",
        actor: normalizeAdminActor(session.actor || "Admin"),
        expiresAt: session.expiresAt
      };
    }
  }
  return null;
}

export function publicDonor(donor) {
  return {
    email: donor.email || "",
    donorName: donor.donorName || "",
    householdName: donor.householdName || donor.donorName || "",
    contactPhone: donor.contactPhone || "",
    defaultParishId: donor.defaultParishId || "",
    emailVerifiedAt: donor.emailVerifiedAt || "",
    createdAt: donor.createdAt || "",
    updatedAt: donor.updatedAt || "",
    lastLoginAt: donor.lastLoginAt || ""
  };
}

export async function loadDonor(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donors WHERE email = ?1", normalized);
    const donor = parseJsonRow(row);
    if (donor) return donor;
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(donorKey(normalized));
  if (!raw) return null;
  const donor = JSON.parse(raw);
  if (d1(env)) await saveDonor(env, donor);
  return donor;
}

export async function saveDonor(env, donor) {
  const email = normalizeEmail(donor.email);
  const record = { ...donor, email };
  const data = JSON.stringify(record);

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO donors (email, default_parish_id, email_verified_at, created_at, updated_at, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET
         default_parish_id = excluded.default_parish_id,
         email_verified_at = excluded.email_verified_at,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      email,
      record.defaultParishId || "",
      record.emailVerifiedAt || "",
      record.createdAt || "",
      record.updatedAt || new Date().toISOString(),
      data
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(donorKey(email), data);
  }

  return donor;
}

export async function deleteDonor(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (d1(env)) await d1Run(env, "DELETE FROM donors WHERE email = ?1", normalized);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.delete(donorKey(normalized));
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

export function pruneParishDashboardSessions(sessions, nowMs = Date.now()) {
  return (Array.isArray(sessions) ? sessions : []).filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export async function issueParishDashboardSession(registration) {
  const nowMs = Date.now();
  const token = generateSecret("agp_parish");
  const sessionSalt = generateSecret("parish_salt");
  const tokenHash = await hashSessionToken(token, sessionSalt);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + PARISH_SESSION_TTL_MS).toISOString();
  const sessions = pruneParishDashboardSessions(registration?.parishDashboardSessions, nowMs);
  sessions.push({
    id: generateSecret("parishsess"),
    tokenHash,
    sessionSalt,
    createdAt,
    expiresAt
  });
  sessions.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  while (sessions.length > PARISH_SESSION_MAX) sessions.shift();

  return {
    token,
    createdAt,
    expiresAt,
    registration: {
      ...registration,
      parishDashboardSessions: sessions
    }
  };
}

export async function resolveParishDashboardSession(registration, token) {
  if (!registration || !token) return null;
  const active = pruneParishDashboardSessions(registration.parishDashboardSessions);
  for (const session of active) {
    const submitted = await hashSessionToken(token, session.sessionSalt || "");
    if (secureCompare(submitted, session.tokenHash || "")) {
      return {
        id: session.id || "",
        expiresAt: session.expiresAt || ""
      };
    }
  }
  return null;
}
