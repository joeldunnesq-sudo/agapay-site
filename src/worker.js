import { calendarLabel, liturgicalFeastsForYear, nextLiturgicalFeast, orthodoxPascha } from "./liturgical-calendar.js";

const ADMIN_PASSWORD_KV_KEY = "__agapay_admin_password";
const ADMIN_SESSION_STORE_KEY = "__agapay_admin_sessions";
const COMMEMORATION_KEY_PREFIX = "__agapay_commemoration__";
const DONOR_KEY_PREFIX = "__agapay_donor__";
const DONOR_OFFERING_KEY_PREFIX = "__agapay_donor_offering__";
const DONOR_CHECKOUT_INDEX_PREFIX = "__agapay_checkout_offering__";
const RATE_LIMIT_PREFIX = "__agapay_rate_limit__";
const STRIPE_EVENT_PREFIX = "__agapay_stripe_event__";
const PARISH_ID_INDEX_PREFIX = "__agapay_index_parish_id__";
const STRIPE_ACCOUNT_INDEX_PREFIX = "__agapay_index_stripe_account__";
const STRIPE_SUBSCRIPTION_INDEX_PREFIX = "__agapay_index_stripe_subscription__";
const STRIPE_PAYMENT_INTENT_INDEX_PREFIX = "__agapay_index_payment_intent__";
const PASSWORD_HASH_VERSION = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 100000;
const DONOR_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ADMIN_SESSION_MAX = 32;
const PARISH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const PARISH_SESSION_MAX = 16;
const STRIPE_EVENT_PROCESSING_RETRY_MS = 1000 * 60 * 10;

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

function marketplaceSearchText(entry = {}) {
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

function matchMarketplaceFilters(entry, { query, category, spotlight }) {
  if (category && category !== "all" && entry.category !== category) return false;
  if (spotlight && spotlight !== "all" && !(entry.tags || []).includes(spotlight)) return false;
  if (query && !marketplaceSearchText(entry).includes(query)) return false;
  return true;
}

function buildMarketplaceCategorySummaries(products = []) {
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

function handleMarketplaceCatalog(request) {
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

function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

function isSystemKvKey(keyName) {
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

function getAdminToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return request.headers.get("X-AGAPAY-Admin-Token") || "";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "unknown";
}

async function rateLimit(request, env, bucket, { limit = 10, windowSeconds = 60 } = {}) {
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

async function verifyTurnstileIfConfigured(request, env, token) {
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

function handleSecurityConfig(env) {
  return json({
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function donorKey(email) {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}

function donorOfferingKey(email, id) {
  return `${DONOR_OFFERING_KEY_PREFIX}${normalizeEmail(email)}:${id}`;
}

function donorCheckoutIndexKey(checkoutSessionId) {
  return `${DONOR_CHECKOUT_INDEX_PREFIX}${checkoutSessionId}`;
}

function parishIdIndexKey(parishId) {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
}

function stripeAccountIndexKey(stripeAccountId) {
  return `${STRIPE_ACCOUNT_INDEX_PREFIX}${stripeAccountId}`;
}

function stripeSubscriptionIndexKey(subscriptionId) {
  return `${STRIPE_SUBSCRIPTION_INDEX_PREFIX}${subscriptionId}`;
}

function stripePaymentIntentIndexKey(paymentIntentId) {
  return `${STRIPE_PAYMENT_INTENT_INDEX_PREFIX}${paymentIntentId}`;
}

function stripeEventKey(eventId) {
  return `${STRIPE_EVENT_PREFIX}${eventId}`;
}

async function listKvKeys(env, { prefix = "", limit = 1000, pageSize = 100 } = {}) {
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

function hasProductionStore(env) {
  return Boolean(env.AGAPAY_DB || env.AGAPAY_REGISTRATIONS);
}

function missingProductionStoreResponse() {
  return json({ error: "AGAPAY production data store is not configured" }, { status: 500 });
}

function d1(env) {
  return env.AGAPAY_DB || null;
}

function parseJsonRow(row) {
  if (!row?.data) return null;
  return JSON.parse(row.data);
}

function safeParseJsonRow(row) {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}

async function d1First(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env).prepare(sql).bind(...params).first();
}

async function d1All(env, sql, ...params) {
  if (!d1(env)) return [];
  const result = await d1(env).prepare(sql).bind(...params).all();
  return result.results || [];
}

function clampListLimit(value, defaultLimit = 50, maxLimit = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}

function encodeListCursor(row = {}) {
  const payload = {
    receivedAt: row.received_at || row.receivedAt || "",
    reference: row.reference || ""
  };
  if (!payload.receivedAt || !payload.reference) return "";
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeListCursor(cursor) {
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

async function d1Run(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env).prepare(sql).bind(...params).run();
}

async function d1GetSetting(env, key) {
  const row = await d1First(env, "SELECT value FROM app_settings WHERE key = ?1", key);
  return row?.value || "";
}

async function d1SetSetting(env, key, value) {
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

function parseStoredStripeEvent(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return { status: "processed", receivedAt: raw };
}

function staleStripeProcessingEvent(receivedAt, nowMs = Date.now()) {
  const receivedMs = Date.parse(receivedAt || "");
  return Number.isFinite(receivedMs) && nowMs - receivedMs > STRIPE_EVENT_PROCESSING_RETRY_MS;
}

async function claimStripeEvent(env, event = {}) {
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

async function finishStripeEvent(env, eventId, status = "processed", errorMessage = "") {
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

async function recordStripeEvent(env, eventId) {
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

function generateSecret(prefix = "agp") {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return toHex(digest);
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hex(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
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

async function createPasswordRecord(password) {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS)
  };
}

function parsePasswordRecord(value) {
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

async function verifyPasswordRecord(password, record) {
  const parsed = parsePasswordRecord(record);
  if (!parsed || parsed.version !== PASSWORD_HASH_VERSION || !parsed.salt || !parsed.hash) return false;
  const submitted = await pbkdf2Hex(password, parsed.salt, Number(parsed.iterations || PASSWORD_HASH_ITERATIONS));
  return secureCompare(submitted, parsed.hash);
}

async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

async function hashSessionToken(token, salt) {
  return sha256Hex(`session:${salt}:${token}`);
}

function parseAdminSessionStore(value) {
  if (!value) return { version: 1, sessions: [] };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return { version: 1, sessions };
  } catch {
    return { version: 1, sessions: [] };
  }
}

async function loadAdminSessionStore(env) {
  if (d1(env)) {
    return parseAdminSessionStore(await d1GetSetting(env, ADMIN_SESSION_STORE_KEY));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    return parseAdminSessionStore(await env.AGAPAY_REGISTRATIONS.get(ADMIN_SESSION_STORE_KEY));
  }
  return { version: 1, sessions: [] };
}

async function saveAdminSessionStore(env, store) {
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

function normalizeAdminActor(actor) {
  const cleaned = String(actor || "").trim();
  if (!cleaned) return "Admin";
  return cleaned.slice(0, 80);
}

function pruneAdminSessions(sessions, nowMs = Date.now()) {
  return sessions.filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

async function issueAdminSession(env, actor = "Admin") {
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

async function resolveAdminSession(env, token) {
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

function publicDonor(donor) {
  return {
    email: donor.email || "",
    donorName: donor.donorName || "",
    householdName: donor.householdName || donor.donorName || "",
    contactPhone: donor.contactPhone || "",
    defaultParishId: donor.defaultParishId || "",
    addressLine1: donor.addressLine1 || "",
    addressLine2: donor.addressLine2 || "",
    city: donor.city || "",
    state: donor.state || "",
    postalCode: donor.postalCode || "",
    country: donor.country || "",
    pledgeAmountCents: donor.pledgeAmountCents || 0,
    pledgeYear: donor.pledgeYear || "",
    emailVerifiedAt: donor.emailVerifiedAt || "",
    createdAt: donor.createdAt || "",
    updatedAt: donor.updatedAt || "",
    lastLoginAt: donor.lastLoginAt || ""
  };
}

async function loadDonor(env, email) {
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

async function saveDonor(env, donor) {
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

async function deleteDonor(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (d1(env)) await d1Run(env, "DELETE FROM donors WHERE email = ?1", normalized);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.delete(donorKey(normalized));
}

async function verifyDonorPassword(donor, password) {
  if (donor?.passwordRecord && await verifyPasswordRecord(password, donor.passwordRecord)) return true;
  if (!donor?.passwordHash) return false;
  const submittedHash = await hashPassword(password, donor.passwordSalt || "");
  return secureCompare(submittedHash, donor.passwordHash || "");
}

async function applyDonorPassword(donor, password) {
  return {
    ...donor,
    passwordRecord: await createPasswordRecord(password),
    passwordSalt: "",
    passwordHash: "",
    passwordUpdatedAt: new Date().toISOString()
  };
}

async function verifyParishDashboardPassword(registration, password) {
  if (!registration || !password) return false;
  if (registration.parishDashboardPasswordRecord && await verifyPasswordRecord(password, registration.parishDashboardPasswordRecord)) return true;
  return Boolean(registration.parishDashboardToken && secureCompare(password, registration.parishDashboardToken));
}

async function applyParishDashboardPassword(registration, password, { temporary = false, keepLegacyToken = false } = {}) {
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

function pruneParishDashboardSessions(sessions, nowMs = Date.now()) {
  return (Array.isArray(sessions) ? sessions : []).filter((entry) => {
    const expiresAtMs = Date.parse(entry?.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

async function issueParishDashboardSession(registration) {
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

async function resolveParishDashboardSession(registration, token) {
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

async function verifyParishDashboardBearer(registration, token) {
  return Boolean(await resolveParishDashboardSession(registration, token));
}

async function migrateDonorEmailReferences(env, oldEmail, newEmail) {
  const oldNormalized = normalizeEmail(oldEmail);
  const newNormalized = normalizeEmail(newEmail);
  if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) return;

  if (d1(env)) {
    const offerings = await loadDonorOfferings(env, oldNormalized, 1000);
    for (const offering of offerings) {
      await storeDonorOffering(env, {
        ...offering,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      });
    }

    const commemorations = await loadDonorCommemorations(env, oldNormalized, 1000);
    for (const entry of commemorations) {
      await saveCommemorationEntry(env, {
        ...entry,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      });
    }
    return;
  }

  if (!env.AGAPAY_REGISTRATIONS) return;

  const offeringKeys = await listKvKeys(env, { prefix: donorOfferingKey(oldNormalized, ""), limit: 1000 });
  for (const key of offeringKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = {
        ...JSON.parse(raw),
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      };
      const newKey = donorOfferingKey(newNormalized, offering.id || key.name.split(":").pop());
      await env.AGAPAY_REGISTRATIONS.put(newKey, JSON.stringify(offering));
      if (offering.checkoutSessionId) await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(offering.checkoutSessionId), newKey);
      await env.AGAPAY_REGISTRATIONS.delete(key.name);
    } catch {
      // Ignore malformed donor offering records during email migration.
    }
  }

  const commemorationKeys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: 1000 });
  for (const key of commemorationKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) !== oldNormalized) continue;
      await env.AGAPAY_REGISTRATIONS.put(key.name, JSON.stringify({
        ...entry,
        donorEmail: newNormalized,
        updatedAt: new Date().toISOString()
      }));
    } catch {
      // Ignore malformed commemoration records during email migration.
    }
  }
}

async function requireDonor(request, env) {
  if (!hasProductionStore(env)) return null;
  const email = normalizeEmail(request.headers.get("X-AGAPAY-Donor-Email"));
  const token = getBearerToken(request);
  if (!email || !token) return null;
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return null;
  if (!donor || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  if (donor.sessionExpiresAt && new Date(donor.sessionExpiresAt).getTime() < Date.now()) return null;
  const submittedHash = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submittedHash, donor.sessionTokenHash)) return null;
  return donor;
}

async function verifyAdminPassword(env, submitted) {
  if (!submitted) return false;
  const storedPassword = d1(env)
    ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
    : env.AGAPAY_REGISTRATIONS
      ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
      : "";
  const fallbackPassword = !storedPassword && d1(env) && env.AGAPAY_REGISTRATIONS
    ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
    : "";
  const passwordToCheck = storedPassword || fallbackPassword;
  if (passwordToCheck && await verifyPasswordRecord(submitted, passwordToCheck)) return true;
  if (passwordToCheck && !parsePasswordRecord(passwordToCheck) && secureCompare(submitted, passwordToCheck)) return true;
  return Boolean(env.AGAPAY_ADMIN_TOKEN && secureCompare(submitted, env.AGAPAY_ADMIN_TOKEN));
}

async function requireAdminContext(request, env) {
  const submitted = getAdminToken(request);
  if (!submitted) return null;

  const session = await resolveAdminSession(env, submitted);
  if (!session) return null;
  return {
    actor: session.actor || "Admin",
    authType: "session",
    expiresAt: session.expiresAt || ""
  };
}

async function requireAdmin(request, env) {
  return Boolean(await requireAdminContext(request, env));
}

async function handleAdminSession(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const password = String(body.password || "").trim();
  if (!(await verifyAdminPassword(env, password))) return unauthorized();

  const actor = normalizeAdminActor(body.actor || "Admin");
  const session = await issueAdminSession(env, actor);
  return json({
    ok: true,
    token: session.token,
    actor: session.actor,
    expiresAt: session.expiresAt
  });
}

function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

function appendAdminAudit(registration, action, actor, details = {}) {
  const current = Array.isArray(registration?.adminAuditLog) ? registration.adminAuditLog : [];
  const entry = {
    id: generateSecret("audit"),
    action: String(action || "unknown"),
    actor: normalizeAdminActor(actor || "Admin"),
    at: new Date().toISOString(),
    details: details && typeof details === "object" ? details : {}
  };
  return {
    ...registration,
    adminAuditLog: [...current, entry].slice(-300)
  };
}

function statusTimelineWithNext(currentStatus, nextStatus, existingTimeline) {
  const timeline = Array.isArray(existingTimeline) ? [...existingTimeline] : [];
  const normalizedNext = String(nextStatus || currentStatus || "");
  if (!normalizedNext) return timeline;
  const latest = timeline[timeline.length - 1];
  if (latest?.status === normalizedNext) return timeline;
  timeline.push({
    status: normalizedNext,
    at: new Date().toISOString()
  });
  return timeline;
}

function centsFromAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function estimateStripeProcessingFeeCents(chargeCents) {
  if (!Number.isFinite(chargeCents) || chargeCents <= 0) return 0;
  return Math.max(0, Math.round(chargeCents * 0.029 + 30));
}

function estimateStripeAchFeeCents(chargeCents) {
  if (!Number.isFinite(chargeCents) || chargeCents <= 0) return 0;
  return Math.max(0, Math.round(chargeCents * 0.026 + 30));
}

function grossUpForStripeProcessingFeeCents(netAmountCents) {
  if (!Number.isFinite(netAmountCents) || netAmountCents <= 0) return 0;
  let chargeCents = Math.max(
    netAmountCents,
    Math.ceil((netAmountCents + 30) / (1 - 0.029))
  );
  while (chargeCents - estimateStripeProcessingFeeCents(chargeCents) < netAmountCents) chargeCents += 1;
  while (
    chargeCents > netAmountCents
    && (chargeCents - 1) - estimateStripeProcessingFeeCents(chargeCents - 1) >= netAmountCents
  ) {
    chargeCents -= 1;
  }
  return chargeCents;
}

function grossUpForAchFeeCents(netAmountCents, agapayFeeCents) {
  if (!Number.isFinite(netAmountCents) || netAmountCents <= 0) return 0;
  const targetAfterStripe = netAmountCents + Math.max(0, Number(agapayFeeCents) || 0);
  let chargeCents = Math.max(targetAfterStripe, Math.ceil((targetAfterStripe + 30) / (1 - 0.026)));
  while (chargeCents - estimateStripeAchFeeCents(chargeCents) < targetAfterStripe) chargeCents += 1;
  while (
    chargeCents > targetAfterStripe
    && (chargeCents - 1) - estimateStripeAchFeeCents(chargeCents - 1) >= targetAfterStripe
  ) {
    chargeCents -= 1;
  }
  return chargeCents;
}

function checkoutPaymentMethod(value, recurring) {
  const method = String(value || "card").toLowerCase().trim();
  if (recurring) return "card";
  if (["ach", "bank", "bank_account", "us_bank_account"].includes(method)) return "ach";
  return "card";
}

function checkoutFinancials(amountCents, coverFees, recurring, paymentMethod = "card") {
  const method = checkoutPaymentMethod(paymentMethod, recurring);
  const totalTransactionFeeCents = Math.round(amountCents * 0.05 + 30);
  if (recurring) {
    const chargeCents = coverFees
      ? amountCents + totalTransactionFeeCents
      : amountCents;
    const estimatedStripeFeeCents = estimateStripeProcessingFeeCents(chargeCents);
    return {
      chargeCents,
      estimatedStripeFeeCents,
      agapayFeeCents: Math.max(0, totalTransactionFeeCents - estimatedStripeFeeCents),
      totalTransactionFeeCents,
      paymentMethod: method
    };
  }

  if (method === "ach") {
    const chargeCents = coverFees ? amountCents + totalTransactionFeeCents : amountCents;
    const estimatedStripeFeeCents = estimateStripeAchFeeCents(chargeCents);
    const agapayFeeCents = Math.max(0, totalTransactionFeeCents - estimatedStripeFeeCents);
    return {
      chargeCents,
      estimatedStripeFeeCents,
      agapayFeeCents,
      totalTransactionFeeCents,
      paymentMethod: method
    };
  }

  const chargeCents = coverFees ? amountCents + totalTransactionFeeCents : amountCents;
  const estimatedStripeFeeCents = estimateStripeProcessingFeeCents(chargeCents);
  return {
    chargeCents,
    estimatedStripeFeeCents,
    agapayFeeCents: Math.max(0, totalTransactionFeeCents - estimatedStripeFeeCents),
    totalTransactionFeeCents,
    paymentMethod: method
  };
}

function numericCents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function offeringFeeBreakdown(offering = {}) {
  const giftAmountCents = numericCents(offering.giftAmountCents ?? offering.amountCents);
  const chargeCents = numericCents(offering.chargeCents ?? offering.amountChargedCents ?? giftAmountCents);
  const stripeFeeCents = numericCents(offering.stripeFeeCents ?? offering.estimatedStripeFeeCents);
  const agapayFeeCents = numericCents(offering.agapayFeeCents);
  const totalFeeCents = numericCents(offering.totalFeeCents ?? stripeFeeCents + agapayFeeCents);
  const coverFees = Boolean(offering.coverFees);
  const donorCoveredFeeCents = coverFees
    ? numericCents(offering.donorCoveredFeeCents ?? Math.max(0, chargeCents - giftAmountCents))
    : 0;
  const parishNetCents = Math.max(
    0,
    numericCents(
      offering.parishNetCents
      ?? offering.netCents
      ?? (coverFees ? Math.max(0, chargeCents - totalFeeCents) : giftAmountCents - totalFeeCents)
    )
  );
  return {
    giftAmountCents,
    chargeCents,
    stripeFeeCents,
    agapayFeeCents,
    totalFeeCents,
    donorCoveredFeeCents,
    parishNetCents,
    coverFees
  };
}

function donorName(body) {
  return [body.firstName, body.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

async function stripeFormRequest(env, path, form, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeGetRequest(env, path) {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeGetConnectedRequest(env, path, stripeAccountId) {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Account": stripeAccountId
    }
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeFormConnectedRequest(env, path, form, stripeAccountId, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (stripeAccountId) headers["Stripe-Account"] = stripeAccountId;

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: form
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

function stripeAccountStatus(account) {
  if (account.payouts_enabled) return "payouts_enabled";
  if (account.charges_enabled) return "charges_enabled";
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.details_submitted) return "onboarding";
  return "invited";
}

function subscriptionTier(id) {
  return subscriptionTiers.find((tier) => tier.id === id) || null;
}

function defaultSubscriptionTier(registration) {
  const type = normalizeCommunityType(registration.communityType);
  if (type === "monastery") return "monastery_free";
  if (type === "mission") return "mission";
  return "parish";
}

function subscriptionStatusLabel(status) {
  const labels = {
    not_started: "Not started",
    checkout_created: "Checkout created",
    active: "Active",
    past_due: "Past due",
    cancelled: "Cancelled",
    free_forever: "Free forever"
  };
  return labels[status] || status || "Not started";
}

function subscriptionTierSummary(tier) {
  if (!tier) return "";
  if (tier.monthlyCents === null) return `${tier.label} - custom / negotiated`;
  if (tier.monthlyCents === 0) return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || "standard transaction fees apply"}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo + ${tier.transactionRateLabel || "standard transaction fees"}`;
}

function absoluteWebsiteUrl(value) {
  const website = String(value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function agapayEmailHtml(appUrl, title, bodyHtml) {
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const markUrl = htmlEscape(`${baseUrl}/mark.png`);

  return `
    <div style="margin:0;padding:0;background:#F4F0E6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:660px;margin:0 auto;padding:28px 14px;">
        <div style="background:#FFFFFF;border:1px solid rgba(201,162,91,0.34);border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(6,21,34,0.14);">
          <div style="background:linear-gradient(120deg,#041427 0%,#07284A 58%,#0A365B 100%);padding:28px 30px;border-bottom:3px solid #C9A25B;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:64px;vertical-align:middle;">
                  <div style="width:56px;height:56px;display:grid;place-items:center;border:1px solid rgba(200,162,74,0.55);border-radius:50%;background:rgba(6,21,34,0.34);">
                    <img src="${markUrl}" alt="AGAPAY" width="50" height="50" style="display:block;width:50px;height:50px;object-fit:contain;" />
                  </div>
                </td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:500;color:#F7F1E3;letter-spacing:0.04em;">AGAPAY</div>
                  <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#D7B06A;font-weight:700;padding-top:7px;">Love how you give</div>
                </td>
              </tr>
            </table>
          </div>

          <div style="padding:34px 30px 30px;background:#FFFFFF;">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B58A3F;font-weight:700;margin-bottom:12px;">AGAPAY platform update</div>
            <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:500;color:#061522;">${htmlEscape(title)}</h1>
            ${bodyHtml}
            <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#171715;">In Christ,<br /><strong>AGAPAY Team</strong></p>
          </div>

          <div style="background:#F4F0E6;padding:18px 30px;border-top:1px solid rgba(201,162,91,0.28);">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#595959;">AGAPAY helps canonical Orthodox parishes, missions, monasteries, ministries, schools, and faithful families flourish through values-aligned financial technology. If you need help, reply to this email.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateDashboardToken() {
  return `agp_tmp_${crypto.randomUUID().replace(/-/g, "")}`;
}

function startOfYearUnix(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
}

function monthLabel(index) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

async function sendEmail(env, message) {
  if (!env.RESEND_API_KEY) return { status: "not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: "failed",
        detail: body.message || body.error || "Email provider rejected the message"
      };
    }

    return { status: "sent", id: body.id || "" };
  } catch (err) {
    return {
      status: "failed",
      detail: err.message || "Email request failed"
    };
  }
}

async function sendTreasurerStripeInvite(env, appUrl, registration) {
  const to = registration.treasurerEmail || registration.priestEmail || "";
  if (!to) return { status: "missing_recipient" };

  const parishId = registration.parishId || slugify(registration.parishName);
  const dashboardUrl = `${appUrl}/parish/login?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  // Onboarding guide PDF — base64 encoded inline
  const onboardingPdfB64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUiAvRjMgNiAwIFIgL0Y0IDcgMCBSIC9GNSA4IDAgUiAvRjYgMTEgMCBSIAogIC9GNyAxMiAwIFIgL0Y4IDE2IDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvWmFwZkRpbmdiYXRzIC9OYW1lIC9GMiAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0JpdHNQZXJDb21wb25lbnQgOCAvQ29sb3JTcGFjZSAvRGV2aWNlUkdCIC9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvSGVpZ2h0IDE0NSAvTGVuZ3RoIDYyMDM2IC9TTWFzayA1IDAgUiAKICAvU3VidHlwZSAvSW1hZ2UgL1R5cGUgL1hPYmplY3QgL1dpZHRoIDQxNQo+PgpzdHJlYW0KR2IiLGsjQyczSmc7ZiFAbC9oViZbbktSTiI7MiFSOFFBV0YtbG5GIi5NYF40PCJvb1k7KFNadUhacmIkRz9vPy5MaykzQiNVMi4lLV4ta15oL0UlN2NiMm1VJjxuUm9RTFQ2bUgiKi9iZ2lDXi9yO1lybWtJbCRrQktuZjhmWUI0TUFjMFVLWks3XzQpb3F1aEwlYks7VD4yRCsjckFDdScuS2FSJ0BIQipBM3QhZVQ2UGs2V0phLzIzQDVBWDNOOFJzcVFQSERyOkYiYzFQSGcsaGM3JkRrKzdCRjB0PjNccD8uNWZoSE9MO1kpJ25HIy5HSClAVzszMzdMWC9oXEFkQUFLQS5KJ0BXNzdBL0kmWyRoIzxCSUszSmIlMHQ+M1xwNG5TRGdnWTVcXyg+bCM1QGheaig1I2ciRERBWyIrbGE5UG0/SFBwKFZvRStuWyEtbi1AUSM2LWM8X3UlXyhLP0IjTnFnZ1BKLFc5SSZaLic1K3RlYGhIYVkkSzBKXmhiR2NfQFc3N0FtNUdTaF1YUG5UPyNhVztlZ0JCY0UnKElINCZuMHBBa1FXUXFmQl1US1xKNS9NbnB0TFttKm9gbl9QMUJHL1luYj5BTHNsaSJndCIrIlBXXURpSTJ0aVk5MlFfMiRiQkkxMSFKXEdfalVJV2A4LltqKSpkNUNLJT9cLz5tMmdNKUBHSFRVOVYiXyddQ3JGOWYpYEBtKmxndFdiJUlRQ3FXNDEsWlE+OmI1L1ssXjs/aklGc1JMWUlZNG5QMiR1cmJRU1NpLV9RYTlRdUl1ci51VSVbbSwmK0VMT2wpKDVqc2AwdEAxZWorUE9sMHQ+M15OdWckY3JOUlJPW29pUUIsNmtWQUcrPE9vKU07NkZjO19hP3A7YDFMOjl0ZW1AV0E3aCMuSGc/UzhrIjppImg1LCdmITVzWXAyMGkoNWtDb1MxOyU+Vy8wUV1gbFtpQWpOMiJKL24wKlJCRSdRW084XmZsTiheUUModTM/Im8iMF02SVxEMnVFTWV1VFk2VUMrNVBxJiQiTG06M05kcm9cWlBfSixZVz5fMT9GWlFDMT83Y0A+Kz04aTo/S2ZOQiI1ZnJsKUJYWmdqVmI1YG82VkEuPGdxI041NyhNW28zbm9cR19ISTw1SXRSSidLSmpAQEo2cGMrMWYwbCojcSIiaCw8V0ltS1NSXD1MaVZTcj8pOEFTMVlmX3NPcDdoJyonNHMkYEd0QztvK1NvJ3BMZ29ddE9lWlpwZFdpOl9NUzFKWTduZ2dbS0s7ZlZYZkZXLlBPMV5GSmspSV1LIzxKSWErPzk8a1gkOXFKWUhRVG9TLkc3IUVyU0UsbVpCNk9kOiZpcmZVZ2JaXSw+Y2lYWUoxSmovWFEqT29CTmkoK2tmXVYxRDtzLmpUISZkKV5SRnNuYWw6U2MxMSxSV2NZNltKKClAbkRMRzBKa15dL1ZhWFE3TWxPaF9DTkU7MTVMImhHJmhUcWVbY2I8YUk0a0tMZ2BUYF8lSVFjRD5VI2kzWTYsWzhqUG1jPyNlLmFxRHBZQ2tQQWNob2YpbS5kcmVdb1hwMSxJJD5mUC9hWU0sb0BOblsmcVkxMzBaVjNkMGFpMW5hX0trUCNvUkM9cTUmJTMuPzhhS1dLbk8jWD87WVtMZkJvSUs0XzRoI0woNTxWcFJVdUkhY1RRaVE/M0BOOUBiO29fK1A0NCpvSnBXXDlhaGRmcycmPmwwaUMrbCNPTUY0WmYjJz9RJ3NQJScsZ3JTXDlDSjEqQldMcyI5IVtcZyttRkVXJCIlPCJEdCdsXyxSMnInUWxqMW0hcWAjZFYydCcyN2Zna1lqUmNaSUhoNVMoXj9QcVNWLC9AbkcuKDEmLjVjbjVsSz4kWGgvZidOaUQ0W3FlblBzQDVDQTlQMEtyKWE6LFw1ND5HQE8oUDQ6SSZjPzlcSXFKQnQtUCNfZXJwUCYrU14hZ25vZzNlTTlxQldJczAhMyxLNGQmP2NiOlJFI3ErImVkVkxdXG9MU2Q6UEZfLiRAW0ZIIjBca1clYShxNl5JbUNCbjkzZG1RcWg4TGo+MnIkTWZRQy8lK2krYFZkRXNjPXVSdVIpRCkoISxEZykvS2ZxNCwqLFVHc1ZPTVA3RSxyNkBIXCVJNiQhNWVkPzVIaD9UcFNSOlNSY14tc1ldR19FLWc5N2ZOYGxpZmFrTDRbajA5UilFYjZTbytuKHQyKEo2aTxfKFxbLDVjSGAxMlQ6SFpJKG45bCgvXCMzKUpUWmo2JGNHJ1glWCYnTlZMbDAyaSErYHAvOC0yMzlDc1dGJVc1YT1OWDA9JzxaRF5xSj1DTyhNNjVdSl91LXJNI2UtU0ttU2EzSDhvM3EubTFUXSthT1V0T0pmP2JIUENqZyNCLU8xaU5LQldsZVRAN3FaaW1yWERVJUIhaFBTJm9JQ0lFO0o2SDVcV0osLjs3KnBrdEZoU2BQNFVKVlUwYWRwMlQwcmcpXjdAQ0FyNVw7JHM4PmZCOTUsLWNFLDBZMnJBMjpXa0E+JE5gIzQ9NT05Qmk2KmBLSSY0cFJ0dDtAI3NtKS5zZz1TNVtxTGtNVUU+InE4Y0RlamcjLyNfPlpAJCZGYmVIUiQxaCtVIyk9SW4zUm1iWio5XVYkMDtQX1xuQ0dpP2M3dSReNztZODJAN0EiLj1FVF1DZGZBMmxOdFRecT9DKk4xKCtNJUVKYjUvYCc2ajB1Oy0xaWEjNTUvdGE+L1QnLkwmaTBLJXFjKGpHPjppPTpeKi5fPmNPbSljNi4oSzNXampyLk1bSC9dYVddX0dCODZjJS45PFcmSmotUGRfZiVwJlwzbG5TcEJvUWRuPVcsOlEzZjg4UyExcVVpXnRNRj4nTSFDZzRQVU0qT0ZCT3NQWnIqVCZvX1c/XC5kKHNbVy1fIXJHQGEnLFsqdENSLmhbZ3JAX2lZMHQ8YltEUDVJOykkVSkwTVwhXCpLYFc+Ry0rT2syMzJdRWFfMThyW1kuXldNLUVXIj4yMyUuaG89ZzZUJj5FOWwmcWNEZy1LUDZoUSRiJyhoRHI5XEcwT0tBTDZmYEEyaE1qbjhfVjRjJlBgXWc4cTwtXzZNKiEpOC5LODlaVDw2czI1ajEqVHFNN0Y+Y2EsZDBkLVA3MXBASXQyYVUzZHEkJVRsUj1PMmlYYFglbFxAJiFmMXU5ZURdK1UqQSFUVmlLZ18tKzIsbDFUdGZBP04lRilZby9PRFVNJT5LWzhSZ1xgXjxxLypvIWpjbVRgMi5WWm1bR1RCODgmKHQwbmk7T2RvIWM+NlZeJlxJVlxaZUFqc0ljYG5vNDMuOUxrVGVnck8hPEU5aDA9Py43SWFJQjUoK1twS1pUPG9OWEA2KmljQk8sRiVjOis3NzBfdHNMPCJfUzpaWWhPXEwxLT41MCwuWDUwYGk/I04wM25rRVxHMGxEYm5vSjhZRjtKRUVlSWdNajdAUTZFclVTS2NUY1I4bTdYWSliWGhzalo+KzgiW0NiQUFUdE0mYkldUDEoQ2E+ZiFIamZHKm87LTZlcSUtai4lLV9jX1xVbSRqYVtvXGoqZk1SbkAxKjdaLD9cYCYwK291PlNVQVokciJGMjg7XWo5QFpgMCdHajZJISskcFc4TjJcYlk2Pjh0KDldI3RwdTNKKlUrSDxhWyZZYSdgUTdpVyZvW08tVFRCa0tgUCgvLHBoOEkuKDtLMGs9RDIwc1NUUmdVUy1EcSFUYmxKXjw3QVdGK3NENz9KO2JLKG5FYS1gWWMyTkYwVWonTEtyOG4yZ1UpZkZTIVhnSF4pLmtYaitZVypMaE5vWGVya2xcNGA4Xi5wJD1obGtVQElTJTBKO1tpJmFeXWFpM0BSOSYuY3A/NjckNyU1ZmozKGg+V1ZmMyYiZTE9bl87Pi5FRTUnLlVJUyJTYChZYldqOElZYSFlNiJfKmRqVXBiLDFHW1MncUEyUixFMXBXZzs1QGNdQWAtckomLWlVcHNQXV8/ayowJDAtUFNCJC1Ucjk+SiRGSmFibVQpYFQxXjFtc2lrTChtaF81OVtQRW5FbFJxVzFTV0ZaUltqWlRVUCM5TmtuZj9DUl4scUJEWlRcRFQ9M2U/ZE1yRWhPTid1XCQvJHVlaCFRQiRzVz1kJUlTLT1UXmZIdCIxTT1mcitPSyZBLTJANWk/bCM9RUNcInFVVlJkV0BWYT0yWF5HP15lVFNGTTU8N05HJmQqcUgjYl1qSl81XFBCRllUVG9BIkJ0QGM3LnNzZiVIVUAlZSwzLlYtayZFLmFWdUNCT101USQqVUZyOFNQXz8rR1o4MU4kcmF1ISNzQGxIZmUrcTI8cTFsY0AsTiFTKm1lN3FUUldmYzVxJkBQYVcmTTolMl5VXEgmZCMoZ2UmWFZSY21wZk5xMTFMciFtM0JXNk1sOXIjP0U9cTUuZGxJTCRsZm5JKkVpWSIoNzAmQiNEajFOKiYudEtfMk5VbmxBZltuXS1wKmdKLipDVGA7b2pvbSFEUTZdVFkhcmRoRTIuZGVMamxKLjhpc2VeJUJMUzxsIlhoIUJbYWtMPkg8JT1AcFk1XUlCQDxcXSxIMSo9bzUxWWhsSjtnU05BVUBwRiJnU2kwSG5QYXBoKTM+RlFFPUNxK0peWjssPWZYMSxKSURZZmxRLyVAR2dYO2oraEclQkY4cStzay9WVColJysoUGIxZ0x1QV8wNmZAWHE5JTg4YDJROC9VQWZpLE5rdCpeXnMxISJHI0dPVlg6aVlBNSUkcTVeNFhCaTNnYE43TVxvUUtAJENwQ0tjcTluUS49O0c/by5jR11dU0MqKUE8QjktIW5iKD9TTGEyTV5TLkVAZUNIcC9KcDltSSkhRDVxWE1CRWlSUF9zWk1uWjxiQ0lARWpBXSNLVm1KOWE4TDovREhrXjZTPmshcVRPQVFTSCxfJWwlMjcnTGwoSk07NzY4SGdmZ2BURTxDISZMdTtmRS0wTl8tWTsxQSFrZ1ZTdGApZiw4UFZrTi9LYS1LcF0yYyNzNS1VQG1hM1tNRDtFakImXVRicURpT1ElIj0nXkRxLSU7ZFA2LmZETlhKMVNDRzYpUiJwcCxMLzpEZXNRPDFFJ24wcm9haz1mSDM4JjY/J0Q9a08xQiw7T2ZjVj4+ZD83ZFxsQ2guVGsyRGZbTFA2ZVgwczcmZl51WW4qOlUuTFYxMmddKSYkZSFERzpOZVxjalQ5SF9fY2hCMC5EbDxIUVNBVkp0ZXE/JGAidTFxVHRSTzpBRzZxYmVrXVRGI0xOXGZSOC8hMElOcmkwR2hyNkdQTkgkMCNdXW8oYU9RZjxcOlteMlgia18mOCxsWEBCanVpaF1Xcz9qXXVgRSRbbDQxZFonaSEyYlxWWEtFVlxRSDFLPGhYP3RzPiNwKkhMR24mcC9IZlZtZGpRRm4kLmtNPzhVaUx1KShCTyZvaypILSRfI2tOPj4wZ1FrRzczTShSPT5yXmZJM0djTTNUazVTRUhDM0VXPG44RlVTITdWUWY8WXFoY2k6Pi9lYlU0XCooOmdPXkI4Sm4pZEFvL2dLLUVlPElib1kvKjkoOzQ7PzhQbXUkU0o2IjMiKlFqNFxXLz5FNy1GLG5faVVzbVd0Wm8maFxeKkdLR3Rsci5LPzVuOm02LjxGXGw0SUtOOHI6TjI2ayxgR0M3R1c3VlZBTVUqWWQoWjklckRAKkBKUXFHP2QwKEdjRj0tNVMhSzxeI1NLJFUrXGRsMyJPaVBCUzY2cjNRaWBxQSlFNzYhV0M1RUUvOiddTEtORFouTmEqbUpxZEdtcVczQjRQOy9ock9JT2ZXTlQ6SzAkYVIodCdPMkIjYlQhKTRsdWlGMCokWkE1bUhVNGxSMDBLJTdRVXNNRGAiQiVtJEs/KWQ4UUBRLzNgNFlyWiUzMy1Ha1REUVshSj8icTc9KC8mXVJwWzVdPV4kS2o6S2YjMGJsbiFqOmttPVclUVhNIkpJUWNOSV5LOj1LZTlnL1QvX0suPCYoUl1baTgoR1AoMERiRVwlJlhrZHMmO0NcTVQzLWNUZiojR1lBITktLFJZQEcmVUd0I0RFbypVIl5LXWlOTiE4Z205b2BUNlcsZGZJNiVZLS1CZU0tPThWMGxaKWRwdUdyRUU5cClwV1Q2a0d1MHFPaigwIyNINzwyNG1WYVZjQUs2OGpTQ1JnJW4kLjZSNlErZ0gkaTpIKzBDNGhiNiZpXysuV0oyanEsPVlSbDg6JlQoam5cIiwsYiRFVSE+dVlQSz9YUSRnJEVGazd1amBGRiFWMEtCJGVjKiIzZlk0SmksOWljKWxcQzJrbCdyUTdpMC06RjEnMF08XSMlITY2Nyl0XElPRThVXj0xcGBrLGAwaltaXiYrTFlUNzVuUFttMFksajQ6dVhxcEY1XDUvJDcvVmxzOjIzNEVbITlFPGtxTSwmOFAjQTk5T1MraUBmU24oYFRHSSZWVFFibzhzbkpmVCdFJzY5Qj1bN3QhJW1bcCFHLVlHXExVdUxBUyZcNzg0T00lbUdRYkppTnE1ZTNYLiNaOVJuKFJTZmJiWzEhP0BiMmorPS5UIlB1VFMlU2hjMSVROVhXVVxnWzNybVhSbyskRiVRUWVxWkhfPFlQdSNLPV9GRSZcODlsNG9iKlM0YGpyXytja1Y4TClSWi1naydLJGVQYUZcLTEncjdXQ2ohInRqI2BQaywtXixgYDdfMyFUc1JaTE8mRl9JckZhTyY+bllpPEJSQTFHVyllSzU8TGUxV0JFSjtrK1AoKWlYQU0pLipeXC9RN09KX1dVXFVcN0kjOmZqcHRSLSw7WiRkdW90M1BNQVFoX3JbYUQmJmZrVzReYUNNI1MnVDojL08+RHJNWXNNcEBJSEMiPzNBJlhsM2tPOyE5bCgyQWdQL1BDZCJsXj5uMVpOKHVNQ0hDWWVubUw3KnNucVBOYFJQMTVeZFFqS2A3cVYoWytvRkAxMmpHIkJYSU1eLlNNMkxiJ1FYdCwsWS1mN14/KUJMayJiMywrN1RSPFBTLk8pTDBEYlsvcm5KI0hBJTkuKl9lLXMuP24sZnM2T11SMnJML3VuMCtvY1E7R3NDKjlhakdJMzFWWkEyRlhjQiI0N3M6bmdJJloyUSFyM0hzP1hJOlshYTUuRHJZS240MnBuXFhATTtXbipLIVs1TzBSLSNDaW06aHVBQCdbQiZYQzc/S0ljT3RTWEdKL0w5UmxJYG1xZ1pXXSJlKmdxayVfM29CYmNSNTRvOSQ+bjktcGcsZ0MoPSZ1YEBYTGJkQVUlXEE1RHI4MixXTCRwLzReak0valo/VDMuMlc1LV9wdHRZY2s4cHRrbWE1X09XMVM4JjgsWjdHX01halliM19ecFpfXnNbTjVER0FBKy5sIi4pMHJgO3AoJUpRcDpFcT1eckxBaDpjY20mWCxYU1UvNmFZSiVQa20/XW5YbSchQCZxIkxvblEsUWBcXTFVM1U2dS1TUHMnYHNeIiE7STpvX3VHSiYoRUdjKjwqXmQoIiZTa1Y9L2Y9RzVhJ2Q0TTJnNUs2RUUhTVpIYGBARlwiSEs4S2NMKT0lL2dwV0g8ZW03XHFSN0tebThwcmktPFwlJj0zbyhgWWtnYSQuXUdXUSJiJFYmLD0qJCRFPEdJbU5iJTYqPkJqIl4iWzI6JCtpWHRIXlBAPU07NVFDWVdcWChxQnA8MFVENzxBa2lOWnUsUFFKLGYjLjBpTUEqKGhhNFomT3NRSC5aaVQ+cFBZMF5daGM7Rkd1byEyNlhzXDU/I2A8ZG1LM146bGcpXlklclUnRUAvVyQyLUhzJDM8QDdEbzhfNV0sWzJYIUtbV2lTakRVY2JRImhrI2okQDw7TEptIUQnPiJCJzQuY0VNK1FPLTpOR2R1LXFPXE1pOU43TGombmxSbWcoSFosKUIxQyY4Ljs8KD5ub0siKz1FYUxuci9gPHUxPHArZUBPZ2NnLEYtTDUrcyFEY0lZMjs8KlVrWXRxX0xiY1hZN0BkVD5ATHRIUGgsdClkNlokQWVcJyErPUMiYmddKFhsNG90QEwiODtnNE5Eb2Rvczc+J1g2aFFxYGhVOGFmPV1TQGFOIjZnX3BsVCswaG5kMnRxbTxackNIaSg3KGYqYi1NT09mSy4+UDVWYyg9Z1NWWDtvaHM4MktXWjhwT24iSW9eU0skNyFbbjswb0VfbkopbGskV2ljLEtAQ2VwLTZeYyVScSEvJjNZOUpcdE5SKixFTDtbZV1nXT0lWSxkbSokaT4lIiIqcEtndSdyPkdRVkBZcnU6RmhKUklEZkQvT2E/Yi5GXD5sNDZrRGJlRVgvIzl1T0A2MnBMKGlSVGFqZmBGKnMqdERKdDZJSklVLjBYYyNIYkI3N10nQixaQVE+I0NLPS0ldU1QbltjaUYpbTthXHVMZiRsbkdqUko+Qlg1SEkkR1RALkM5TiQqST8lcFY1LFdaQiI6Q2E+KU9gI0lLTFwhLjUjJlkvKV0+Z2QuOlNka2NqRTREbmNTSTdYPVtcYHVcaG5TcE1hKGNrLydXSGBVX048OWBhYi9aXzk1LGlebW1NLElKJE8tL3JHMjFeUEk+cUxeU11zZDxHYionRCZsbExjLmZfakZRcm9rZzxIWFM6K2tCMF9lcS43NlNpV2ovY3FAT3FPM3JqOiEodSpHTVo9cztkRV4uOyxwdC0nITU9MGFDQStPLUpUV0dyMm9eXGA4SzMhXEAhSF4iYEE6azRoUkRLSmk4Jk4tRUVlQGY9bG4hRSI5NjxKL0lJbUo2LDRiITpMKXBrX0NCSjZVQ01qWjcuQEFRWj4nblBHbVVHZ2g8T0ckWm0sMmZzMmBcbENJUCdQSUlbKGxDcTgnLztfInVQaksoMzRWRkQ9UyFHamkzJClyaGQ1MylHNnAsaW5rP0I7KkJLOzRgcUNTKDlCSTxPI04zUTItJFApdTIlLV1dXDJ0WkBzKXUnbiknKicrOEgyQDBtUDVXcT1qWCRjIzxeIVtVQChmVWIkWEYndWcmT0FMJ29Xc1E4OjA7IippRllEayRiJj9QR2MrZ2FiSV81clU4VSNcbSY3a0IvUHRjb0VjcCYmKzoraFBiRzhdSW89JyghUTgpaHAvVV9YUHVhLEw3QTkkcVovbHBgJ0I8cUkybTdiUiJrWzohVk83Z15XMCYkamUtTEsyJUYpTmQpIls7W1k1QGpkYGw8YXJNVFlaWD9EalcyS0FdJFUzUUVHWDJRbkFJIjFLVTpRbEgvVTJqOU1ZWk4sMSVFSF1TP2NVQWNfUSdJWDRxIVVRaDUkb3JtLmBrNyknXVo6KTojPz9fYyNXP1tRLFZrOExPVC9GclA/KCZiKiItREg0bXE0UExHKSRCVlZncmViN0hmLEkzRjEnWHVbX1grOEgxRG48Mjk+LkxpPFxAQThEYztkcyEkLzNZSD9zXSFOKTIrRFA5TU49YUEpTHI9ND9AcVg0cE9FMzxoKCVUaFQyaFZtSzBdRTI6VTcvOCYqb2hBXSthXjBVYXBINDVlUkEuNGtqKVNVP21KYiw9LzleXzkwXVw8OmtsVVNyLDJEOzJoKU5gUFEoXk1pOCJGKTwyaW5aIjk6bFlucGBxUzRlX0lmTl48aSdYRCI6JzxNYyROTFZAL09RPnNHT083MC4oRSxabixsLnU/blVXY1U/Ii1SKXQyKy1UPj5hbk5POiFNVUIsLiY0c09XOEBRTFhRbydqLGdPKFUhV0w4OTdxbSkkZi9OJVtlRS5oWEU9Jl83NSsvaFIpM2giNDFLLE4vakVYKD5hLCNTJTg+Ly1gRzwic1VkWCYwLUE7XDpDVEE1X0ZgdUdJaF0uQ0BFKG9QMy01bEI0JCxYaHU+aFpYWSRUVVg4STp1ZiMkaicvS1ZhcGVncHM+OiVxOGVQX2FESkssXVluR0RiNClwXGJXaSMjJUgpMmY4RiVVazA/RV5vMDxlLjYrXDw4I1xDTSIvTC5GMU40IUBTTVZgWF5dZDJjMUc/QFxmQTtbamtlWVRaZkdyJyNCUWhlJS9jZ1Vlby9qSXEtOUhGR3AoJ0NqQUhMSzFqQnVBX0UhZzpMNUwvUSlxUHEoajJGXFlOQ1Q9RWMhTHBFdV1aK0slbCJlaXRLTmxXKzsuQnBFPW5yMipoREBvYCE0XkIkJ2VNJT9cQEFvSWldZlhjPGBlWWZGUj1pQUxZXyk+aSdecmVaXUllMiIpViJncyphSUtRYD9mPFYnWiJmMyMoMlxHUEAnLCRmS2FVZk88dSYmOHNkMTM2UCFvKlxKMmo2XSFeYVFbUEtCcG9NJUpZIl1BRDVRQ0QqMyRVTihNKVA0QHBgTSdIOV9obzEvYTZyWT1uTis3MFVPbUxoTSt0WDAibEIsSmA6P0s5aktuSVk0QGswP0JxbUplTyppOissJEBtODk2SHNFNGJUQVM4c2ROOXNFWTlOIz1rQVAndD1ILyQjX0pjYjs2VGpbbFwnNVJFcF0zOnMpRCw/JnRhKFw9U0pmR05EdEwwSWNAQSlSVmQjWCMpRTsqcnJpaD4uWUFqOypvMTpbZlRrYGlAXWRpPE5KLUtOQ0pFamQobT5lZjRnRys3WT9gR0BcQFNOJk0wOzcmWVJfIzlQQWdsN09bI1ZZPkZ1P2k5SnBNbClLWDlNYVxmSkhuTkleM2o8LCxHdFclPkpgWHExJm9oMWYmNHBYSUxuakFALyMyVlVjL14kQG9XNWI4P1gyU11rS0tFOyQ2Y09RSWQibj1DNlNSRU90K0BWMHBDJm1bVlpASV4qSF88UihOc2c+W19pWC9gMExRSkIzO1BMQk1MLkA6WGFSbSUnKixpYTkhaTxDPWNxM1BJQ1tJNkBsRCQsVFtsJ0dha18uWW5aYDdta2oqX0o7JHFQRUQ1IlhrMSpCPj5hRWc3XnBMX28oLmpvSVtQUy1uX1hUW1dDP2FpRkFCIzlBQ0w6NkgrWXAwPiQ7SCc9SWlNOik1bS9NUzk7dWFDW0QxKG1Gc3VwMFNiUzknV0chbD4hQmJsNDpXK2k/dThrQ3IhMCxEYSs9XzRZbVhzVD81M21taDZcKlA4JD1IMCJibWlEL0pbVkJSKmxQbld0MVpVRjhUMjZULzEpZmlUVm8kOkNOL2FvRXI8b2NMSmJvQEp0RTIyQHBmbkBFZWwyQmdNakE+Kjc7Ik1QUlZJcSRcNGFIMGZtPypxcjtrLC1EOyolWU1lPEdDTGZGXzApTCM6YD1HOmJYKHFkIjddLm05LT1hYVtXUSFbYnVsTVQoNDRTPUAsdWgobTNmczRTJS4iQUpHRlsqS0YwIm1dV1hpPmRYOEE3YiNZJE8iX20lVUVrMW9vTU9TJjMhVGdNI1VDVWVuIU90dSMrZEtcRUtUKDo0InM7IVYtLmE8XitTOHJlZllUcEVfLSxKTlxGdTM/NDpeISYlQGpQMkxZMW8ocykoIWovZD1Obzg/L11PJkYvUT1nVGlBcDgnUlo0QVA4TC5aPGswOy8tUldhQ2olLjo8PkVCNU9cWFsoaUI+KFskOEI2V05tO2ZKY1QlYCJAJShcaTpLR0djQDEqJGFAQzE5czRpS286WVtobGlYKCNnWltIL1A5UkJjP05qLkE+aSM8bzlYQmUhSUxOTFwuIVQtPmU9WllRajRETWcwX0o+VHUlbDpwPk9TWk9TOjtbMyFVUDBrSyJxOi9vWkc7U0tcMS1AKlorby84UzZpXWs5N3MqVyxLLUUvbWpZQGdIMS1CcClCLWRLLywtcE1yUGJXY1JDVi5UKmxbSUgvIzdgbzktQUhlR0pbPUBVR21xbkYma09hSm1aNFJPY20jdWc0UEBpLl1SRXNGWFxMUk5BPFheXFk4QCs2PldmPSJ0aWU+cj5IVGg3cyVYJFpBV14iO1BGV1AsJEQrYXJTSHQqLlpmJFFQZGQ9TlB1VzNeKE9cLztESz8lRzBGYi0sSkc+b1NRZiYqL2k+KU9ZP1Q+PHRvWTtFTF1NSywlXD4jZG1UbC9KcnJIIy1QMCUhKitIKkBKUj4yWCFVVSxRV1NPby4lIVElQjxvR1FUZi9wVyplW1p0JFFyPyFeUTRwLVg3LjokTSd0Umw1UkgsMG9OWmNARFRdX3VqJSQnXnE5KjRvaSpBblxwaCplbEc5a01Fc0xWPSdSSiNuZ3Ita1ROcjVlSmhCJDhENURoQDlgcytiK1ZIUU0uYVBkJmIoX1EuRFY7SXRValB0VVUkLzM9KWRlJFJZSkVjPCRaKUorS09GcDZDWFBgQGY/blA5L1koLzRCYEwpKkVaV05sQiI2V0pKZS1JXichOC4zWDAmSUFXOD1sTF1BQDFramVOJj4iXTRZJytwP29NN2YxIkdSNjp0Oz1WRUVaXjJxWCIoTFItIUxIbGQ0bDx1YlYwW0xYQy9mOi1IOFpnKGJdXFYsaWhQcHN1MjdQWlc6cU5JOEUmMDshTz9oMSRpRmNnOmNtQWQvREg2b0dDKyNqcGhMa0VXcT9fXkg6ZGRvaipoYF9ZOmsvdC9CalhBKmtwIjRRSm06UVRxJTAnWFgydUFeK1g1JnA0PDI5YEJxZGhJa0wqPUpOX2RyXj0+O1UzL11hLVlSV0owY1t1XDtrXHEuPXJnI0oza2tIQ0M/a2EhXydYQkA4Zm5bMC9BbEthTis0ZWE+c0VaLUhfNjEhIVZsNCZNZjsuQScwKGdCSlJWU3VlbjMkak5hSV5eKTdDQ3NAQ11GZVkxXys1LkVBRUorIzFDK2RSMVg9XSdZPlsqc2U8RzdYOTs/VjIvUDY9WmUzcV5tQDpfOVtMa1I/LVlvTkBJazRkTydlXm86dG1yJmw6Tl1CcU0sP2I/R1VuaztqbSNMMFhtNFFEPWwtJFQ8KihUTipON19CJWpKXUYzUGtSV0EvNmpHMTtyYzVAVGJsZXMzOlNOXWJwdD0lP1dVVDM/O3BCVE8kNGgjKCJMUmgxckY7VFNTNkVYbl8/Xz86Y14+MVRPXktVLFhaZ2hsRjohJ2Y1S1BkbCU4NHFHKmUyTk4xITZzIl5VKytNNixeIW9WdU1Ja242PzE0LGxpWWh1WGEoWVllZDdcKmokL3EiYSokblxyTDhOSE5VMVVYQUE5cnE6T0k0QU9hZyZqaU5eNEteXV9abTpcS0hFaidmSHJRTWwoO3RiVjhnSFlCVGxZZD4jOVVabm5XTSY7bnFQbGhxSW5QcClxSSNoKVFcVHBjXUx0cywiWTBWXzt1dHJUW2NJYD1na3VVWkUxRUxJbVteLzBSciV1R0AzTlVTSEhvTGQ8RlhwL0U4LykmLSlsWCU6MF0+MGNvTjo/Z1dNVW84IlZEUl5ATTttUFJlQlxULGFhQVgzLmVbMiU1V0JQTVNdYmNDLCtjMzhmbCZFNCFDTCUsNiVGOiRQW2NzXTl0ITU5YlFLSERsJiZYMWxXU1JvWWFaY2JyalglUSlPXWlXaFFKK01MSjg9PilMIU9Ccz5BbSEvUzFsOUBIOjdDMFFsLnUqa3FnLy5iX1ZQQmcpMGA6dGFkPDUwJllQU0tIJl02Mj9haGNLW2kjLElcL0NfRV1FVDkyMz9LaS47MCJiRGpWQEZoWkg7JkY8X01KI2kiL2lfOl9qb1cnI0BRJGYqVUJ0b2xjTVpOZUInSGRkaFcrNCFdIlk5LFYnaG1nL2NrSktQNFk3RVErXSkkMjhaL0JrX05tJUVNYFxgKGZyKD5Oa0NmRC4zYD5zR0F0XzZjcz1ObUdDTjkmW1dbcWxJR1VqST1LP15MZEUuSlVLUzchYiRabFBYJC9VJXEoUGNYNUgjcDVRVDsyJGYkP0RWS25XaGsjJkZDVWdIYVdSdW1tOyU6aiFsbDQwOTNLIUQ4OjZgXF0lTFx1Si4pM21AWDBjUCgpKz0oR2gkSFkzXSRVJihTTT9lPWtoRF1ULjFrS2ZLbz5BJGVXcVNAbFdiRlJ0cXA+V2pHOkRsZUZqZVkqUCVpJCtaTFAiVForMWlXYjs7OlE9ZVBoNSFMJF9aSjFhV3NHJFttYCcwUU8uSS4oRzJmJS0tVFVCXzkuJ01rLFsudHFOOC8zNERSL2d1RTk1KVtWaWhUKnA3V0ozaDFVcUNHUlYpVUNkVW50Y3BkNzg2bi9wKXVWU1g1Tm8lTi9lRFQ6W0JTbGQ5WmVXTE8vVCM5KCpTWnFKQShFMjFGM2h0NlU4VmQ9XSJfdCNiQ1soKlZqKy5PUz5bcUlUWkYzWU0/Mj9GZV5hWE8mL2VfcFY/XEpZayQzcEpXJ0glMmN0XDo/YV9qW0c5Qm9jcSxYPGNHKz8vJEgnLHFmS2AlKWJGNzJGaWpePEFqby9EaE9IUDFtc3NGQVIuNkI8bStUNU9zOE1tXzc5K1dYXzFRc2dcKF4yQjVpaW9KTzlqUGstcHRiJ0tzKzxIREQkSk9tJVdBaXFHSmA7QyFBOFJidTY5Q14yPDJXblJIU0haSWFUP1tkZDEiQSZDVWpkVF5ZKGJPUnFrJSU6dWxbJ3IjSDk1YTx1RDg9Q0MiUUQqOV9CaFxQRjkjLCsqPW88JV1WO3EmXl0vMCtJcGNKUEZQI002RFpRW0RSUCEyNTJXSShkPygiSDBRdT8+V3FqcjRfRG5eJ0s4LjJwa2BYNEBpJWNgW2dING8mJUJANi9YREtbMDM6ITUsQiFIKU02bmR1IVxDO2dBNVFlTUsrT29DOzdMX1U3aFtmQzpPVGZoJiQ2aTZFa1hhako2SCdLb11SRXUzTCtBc3NQMitSN01FLHFCbFM4SmRKUCUnXyRCOE84WFlbPGFPRFNHSjI8Uy0kO0U1V0w/byZpY21SUSFELGRdb0wiUVphNjI8NFs2VlFUPSlIa0tpUyxwbU9MMFhkWEQwYy1uJiEpJjxTVTNEa0s/ITpQUFU9YC01NSNoQkVoI2JoKTxpITRtTkQ4QGV0R2xxNVJER2UubFMvME1RPlJKUVhTTj5rZSoiJkghL0tlTDhRbG5PZjZjKiIrNU1sOzBpc2Y/ZUpXU1EhU04/QiVPdHRCZmVIWyZZQzI8KlA+XV9KVSVQdSpsYkUkOyQlXmBdRjNFYG1NZ2xlVXRhVSlFISFvUURoK2ZIXTJnZWxbImUnTG50bl9wQWZFQFVJOCMqQklYR3VOb09mJ2V0Pz1ZJlM5XDpMIXIoQlY2JWFlKypnRUdmZ0hlPSIicSkkKzg4KS9fRD1PT1Zga3BfMUlRYU8lY0BLLSZLYzVWUWRkSC5QMWlJLlExTiRgP1taWlQzJ3MkYms/I1xNZFZvPj8wTylZbDtuVmhQUitMPi9XXkc3WVZeXiF1YEdXcFFyZFdAJTYqWmF0NDxnbC1sKzMpUGQrSlA6I2BLaD91XlFcNWgpMllCb3RAUGJnakUnaWZjJ3FFUXE9W1RFSkVjLGNjZEUlMkxIREFscDJcYF5iJmdcOEFbY0ZeUzdKLlolNnFlXW5FRTAyKSpcV3JGTC1WcDpzQT5kZCtpM2EmXkUmP0BXUUBSXyNqJFYwPSEsZUc8WGg1YSxjOjMhRmdoWXNIOXBNIkBDQ2NfMTJdVlUpaHRHb1pjVWtBNC41JTZOTnAoMjdlQEInWUlKKGpOXlYwTHMtKTBjUy49LiMtNisuSWo3SXJKNThCVGZuZ21oN2xnX3U1NGRaWFMxQTBbcFlmPWxrbjNkInFzTG5XVChEVmY9YlgoRi5rLVFqQStHMmgkbDhQUz1GNXM0QU82MzI9YGk2O2hPOU5vYF0xQ0BCZHEmVjdyZiRYYTNsP1c4RFFYO3BsZltQYWBCMiRJW0MxYUFaQXAmTGpOZmMrTiRwQVVeXDViSktcOSlRND5yUmVWRyIuUEcnMDhuJy4hT2U0TTBJYzonRFNHPSRFJlArL19ALGMzbi5EaVFMMypVT0FzXVUqXEoiQnFUPExWL2lVVUBcInVVUSMpM2lFUXNKPyNbcWZvSE5XbGphVDVYYGVkZzN1Ll40PSZSWVdVOS5OTEsjRz5iJDhyRmwyVT5dQ2gyMjtrKnQ4Lk82QmpaP0JNckZgZyxBNzcwR1stWXE9WG1hQXVTRS0oVk8uO1prNFVZYCpPcSsiLkgtLj4vQUQmLDxvMkBeOidHIVZIKmY3JFdUOmZDOnVHLFZcPnAsaGBJQE8sK2JCIWFPWU4wWFFAISZxRixhVllZViMpQT5ZQUpEJyM6RjY1RipWPTZiPXFcWyszNXMxQy1sSD5lLjY1LEQyZ2VTVmM2PFk0ZmghZyJDXE5uQEQ+O14xVD1IcCFVXi5zYVNUaDE5ZyVPSSJMP2U+bXJWUT5NUnNbZDQkTy5pOWFoYWgjIT8zKl1uSExzRkJlRU0wRWNBKFxYMCZJXzxqXVhPZDhHYWhLYVFhSTM4JFVPaD4kVzExXFU3bzxEZSYiZC5gTz1qXSlcK1xfWTV0TSRUPmM4I1xEW19DR0ksPlVVRW0qK0IkXiJHNyk8QjlcQy5uW0dURWk5VDMxKExNPkNhQz9hR0ZSQFFXajNLVmE8Q1tRWCpqMkgjXkBVMk9eZSkkITdxPytXYShyKzFqZWI5PCFqRGx0JTUmPiciPktiIVVgYC5KUWQyMjdGNF4sIUk7LVMwZVUnbzReXC1GZ0VaYlRzaVNfWmgyZjZJM2s/YFoqbFdyRD00X2ZxRlBxQWVANExOKnVBTUc3NW9bQmRjXllfJCxFJi5STjReOyE4cFNhODdBbEo7WUg0O25HLFRROEdRVmYzZi88Zy9KYV5wXGY/S20mLmJzQ0lGSHBLQHJeZDg8RUY8SSxTMTNiZWlRWkI8TC1ZR0RvOmEtbmYzXFFqYkZsJkRIOjdeME86aypCQiJsWGZvVCJrJ1M0cUIxYDI9SF5GUyQyJD9HQEtPXTtuQ2ssZVtiRzIzZSMyWV9hZzdEY1BWcVBFNmRDPCRgQXFDWUoxdUwtLkdWRFM7aTY3PUZKa0c/XFpgP0ZzRk1Ob2QhajMxUDlWYzdZXUs1IiJeNGMnamlGZWcpSjxsMkhUbVBdViY7RTQxYTJZUlctXy1PJSJRbE5RSGVEPi9sSk1xOGAzdDkoS1JjW0dySDU8MUFmODI8WDg8cWIhWDJcZ21LWVZMJSpOS28kOUBmaVUvZiFTPnAxV008PzwlKE86OilBcCVSNjozYkYsXypxOzNMLyxwZU1aR2dRKTNTUi0uP0pORyo5RyFBR2RkQCI8SGt0RSYzZTtpPic5a0UmXD8oQGopai1rTWhGYFJoY3EhXmAjOmI6ZyNvVVE6VVYkQzcwJG5ZKThCNTEhW1UrTSU0QFlVNzpscy4oZUtNbFYxRihhX08vNVhMc1F0XllbYFdYWkJFJ1hmbVlzcEExOFtqRmBMWyheRiwyI0JbQldJTUxYTz5tY2BbUSU0SnJLI288IWZoSVJbPl5MVS1nJj5ZWkgiRC07U2NlKEE3VS0oOEYzbnMlXiswPWdKW1hDXiFQIkxra0NUUVosciJSOThMKG5JSXI0dUdLKzIwdGhOMXFJLHJmUk8yRzxJQzxGL3MwJChrPSpbQVRnMm9ZZF5VM3MhNEJiXzsodFJMdTMvOWVISU5BZiQpTTMzX21jKDYyPzZcLzInVSVtSTtdNWZOYFY2V0d1UTxMKHRjS2Y6VGszYHVdVEY5ZDlOOXQrKFsxYlFRMyFAUjJtRiFCb1oyXm1ONyFtbG5NRjVtUkhCLGo9UzglO15vN2ozRGBKZkAhSCtYX28uJyhpOTY2SFU4PFY8PSRqR3E+SFZBSDVORTVZIy0wJjxvcFQyVUg3TyopXll0Ly1vOTInbSx1Wi1qMktvZGFEQmhjUG0xTCpdJT9LaWVyUiZwISZsWnEzaj1XKDEwIj5CSjQyVzNVMG0vTj5VPSRyVUIyUUFyUSIzQWpDPVttNSk+Tj1nKzRCb0JvJVdYcmEzWmFtZFs6SCxGUjZCbU9aRy1LM00xQzc3TjUhNCJWNEJlRWEoUFpuTzljckw+Jz1BPEg0Mmd0XyppNlFBSy5gU09ScSpmU2JxUC4jIyMlYWs3VTpuUWBeXlghaGRqU29QTiQxRmpxR0V1TikxO0c5b2o8LVJrLEIvNVIsR2FwNC9TMGcuYTgyX3JxKSs5TE9ZK0xXdURUJHM1VWU6VipHbW9CYTVIJTwoKU1yT28yJyxFJ21qcj8lUl8nSlhmaGtwWT86PG9sW1pCTkhJLDlEIzhQRmAkbl50JFgxcShVckBVRTFVSlIpaiojPiI5aUhYPGNkOUwtKVxcKlEhS0RgVk8nYmxaLDAkQF5BInE0Rytpck8yVEhzYDZUN2BKTGRKTHFxbXNWb2VYLVRAQScjRjBjRDNXdFBmTiJ0UVBuaWNkcFMlR2BaMyxHdG10JCpKLHJuKk8lb0VyW1MuPUsjPT9MRkpnYVlQRVlnSklNRTc5Y3JMTmszMFRZKjYvMzFURjZtVFdbcT0qOmFAIzJvNFNWc0VHOERQRT1hXUJMYi1LMyxmSUo2I0wtQkcxTyZdViomRyIyM0YpSlBWXnRCMzBCP1hYaWohZms7PEY2b2hxNVRtT1BKPkJmTTpCbyg9dTdhJVFsY2I5I2cybEFyU0pQMUQ4XEE5UEZFbW9kRCklX1MjKUFtU2RjIzFvcDg4M0FGKys8aVM3QztGPXMjbiRwNWsyOiRHKWo6RVNBUydGbUc7TFNWQ2BtLXBlbztWNmBeJGE/TVtJTENeLzVkRVVeX3RxIycwa2wlVS5hR21CQldTM2FkZ2ZxOWRLRjFOKFoqWG1EcmJwSi5NI3E5UVM4JjJnO0BQRi1NbylvZV0+UT1yTSQtPXIjZy4yQXIyZGBlTk9XbzIiMDFEXFw0U2VRa2M8a1BQM1RHakxZSjcxPWpccmI3UykvNU9XNj5LYVNNNTUrQl5XQU8yYlk9IW0tNHMqJWFEXCdDbF8ja2NebTRsa0Z1KV1RZDZcWmk4VlU2JzBFQCUzYkA1UEghNDthLERvXyEhbjA4SD0/ISRhNFk3cTM7T1lobzstUWskbEEkYyJkTXBVRjRyclBjLWZTVWNBM0ZfLFNbW091SyhyMkNEQz9BcylQYkA0LW4tMzpQWD5qaWhaKTZXSGNkZy06Ukw0PydzbCkhYHJmQS9RPVFsVWhscm9kaj9VKVxVQEotRWhOSF4kWUlYb0otR2NmMFBIRWcrQ0NONGVlM25xUTZFKFA0MnRicyEwMTVjQVghcDlnOnFRUEhZSWFKbkRuc1UtbVkyKD0mOHFAQlAia0VgJ0FbP2VMQERhLEY+RmViRGhnVElANDtZTUw3KSc2a0xySFlWO0A1JDNcRFRNYXJuMmdSV1trVGlXRkJob0g2cz81MllGMWonPUxlOT4xNXJxL1hyPW1pLnUrVVF0TDBRKjdwdVdoXWJbKjg2PikhTCIyXTVeYDA7W0tnXE1kRnIqZ0w4TFsmRF0qSUkiZzUmZHBbNVpeZTNrZiolUnF0Sy5hXSJjKGpGYypLQ3UjNENIQGdrKU9NIydpLSNBU1RiZ2gpa05QUEVETUQhZHM3a1otOlZQVzpcVGBQMSpTQEwqcS9pWi1FRGIvQUhnXnROZU1nTlpoImtYN2M3dE5cUjY+VCdfZVVVdC1bTkEsT1g/TlFIJl1MTzVVdUQ2MzZLOj8pJkEvUDVPRldJLTJZaDg5K0VsMDInL2lLbT9MYSE4VWZwMzJaUmBePl11KXMkQ0smNT5MIyZoYy5FdE48I1U8SWl0Vj9cX0A6Q2lTYiVJVi1lMjEwJyZaRmtINEEiSGtRVG1CO3RFLGFjYDp1cFUtWWRfRihsKUtURU1JPXFnRGpDMz1ZP3BWKUBtbDoucUBZSj8jS2daQzZvUGsyZjYpImlAWzYmJXVTJG4jSilqXSc4ZWJqK2RqLFFwOVQxYVpYNkE6cEJNRkVNSWdiRE9ia0NcOk5tIzdodTBaL2lnXSxJNWFzNUFuJy9YT1ZxciNOMU4wakZrTk1KaiI7YkhlQisyQks+KkcyLS1pUEhNVGotW203ZFxta204TGJFJyhMV0xtcDJcNEcmS0JAITV1IW1LPCtYNU1mPEIyX1o5IUY7KCwkYGRyM3RmV0ZWb11EIk1mYik2YWVac1lIKUw+c2s7YE48ISgpRmYhOnEvZ0lmYFNOc0g8bjVdYnIra10/KSFjPW1AJGBeIz05QFQmIilgZTxHXipcbExOU14mTE1LKzdlNiNwUj1WQGhmcWcuaUxOOSEqW1M7YlE6XTNxS1xNKzFYZUFuXFErPjxMM2MiPiwwOSE2KjtsM11QJmcqNTEjdEw+Z1lhODN0cnA4biNNSCRoOE9Abk0sPF85cVVIWD8nNjtbYzFCakheQTU3QUcoLyZCN3M+PixKY0E+U0h1Olsjak1XJlttIm0pMlgiR24sXilhQVtmc0NSZkYzWnAlYENWMTlLNTopIjhTRC8+KkgyKl8qSiMvXDhtMypEOER0PE5NSzRlIlAuPjJdRmdcVjc8RTBiRllKOWxLWmtac2tONzlJRENwTlI4ciNxNCc4ZG0xMSJGb2EnSmdMYF0oQipFJDMtTyZKRGNdJj9PLVFCciIncCFvYzY8Z0lDNVM1P2ZzZjtaaGc/I1EuJ0JgLWhwPkwmYlI2KTleZ2UhQCRlYjZLX1taM04tbl0wTTdTWSlbZyQ0a2IzKVQmaS5uNltlci8oIjhkWUBUOihvLjAyTyQxKTpnUllyX0drSSVBKFInWjNeZzdbSGVqWzJQaTIuQF9DZDojVW5DWDhjMDpbKW4mX1RGUl85RS5oTTg/OFprP1ZVXCE8RTZZKVsrNmdWWFM0UHJfdCRYUTZJSlduV0BpNVlCRktRJSluanQkXF4jNjpDViMqIzhHSVMwbShQMShKSHFVR1BbIXNmMXRfRW0tOS1cY0tbOS43L0duOSM7Mk5sZXRjXmxiSERlMzYvVEoxW3BIXlhtZFA6VFwvIlUqVCRyXDFGOGdGbVZLUTAnWG51c1ZxXyJEZnAiR2cmQSdgOSxFb3JIZkRuUFNWT1RicEFKWTRMZjwvUDNLXUdlVj88ODxnaztMLHFmSzR1QV0lIltcSldsUklGSFhJXktRLWJGbnAsTUFTTzpcP18ob1xBKlhcJE41UlwsKS5dcSFPJWo3QTVXKS9cXmEsbVEiYEJrY2c7JXJDKDBHTEZeN1VyNFdBMElQbmVHaz9jVEg1JzByZkFDWlBhRktgVXJRbl5AUTB1M1ZMKVdHNy0rWURwLXM0QkJsS00hWCs2WDQoOUJfNWpVZCw9Z2dhakxVaD41STMjQD4zVT9YKktuLVlqVCs3UVtPI1RTJi9pUzRaXnRrNl4oJFpFcXBFUzslQ0owSGhxTTY5VSJxOSZMVnQwVUVWMjM+YCxVIXM7N00pUChuUTxRPywrTCs0bSlraWFhal5ZPTFvQHVvQTlfVGR1ZWhbZHRKcGVfMk5STkY7JGtgMmQ3bGA4M0UubmVpPz9bVkI0WWNBT2tGKmJfTlFeR2pKZydiQllsTEgkR0QjQVA2QjVXSGJcISg0SmonM1FEJG10YzBiZyg5Ik5xbiJ1TmVZUStlXjlmcjU1SHQ2QHFWOW5gZEQkMmFAJyJWNVIiWHVHc0svdGU5IUlnIiZEJWVBKzAqbDZpK1ZiQF1ZbVRQXGxmNjorLjAmZnNwcFEyMFUtWTRSaTpbUSI9TlJHNDQ5TkRWUzI9LURBUnVIcEUwXExMZlUqZTRHQWBNOyIjcUJhWT4pIy1CZEhrRyspJXFTJzVDVHImNm1eOS5mXENPVlc8ZC5QYG8pXV9VXCwsYCZFbD5KLkldNWxwNV5jK3BtSj0oUDVyNiJJPGIiX0E8KiJQIV4mITkwUmRqU1JicCcydVQtcyxMJihDPEQuXDxFPltwJElyIUNbL3UmKFhJTClUdC02QDUoNyU3ITlnXSxGKl1MLGdAOkloNGA/azxGM1hzIlFeakMqbUpPVy0nNy5rPz5JYFxoOyUlJTJSc2UvWlUsZFdTKUMvJyIncSRqOWxjKHFKWStKaVZJcUhPKWUlMU1bJjZValFnYyhncnBcXVoxaGZTXEgkTzdJX0E5NDQpZTpJX0wpb2Y5KkxRayonOW1eJUVDTEVZVTBJWyZoODBOM2deXlpNSS9WQTY0UkA7YUhOOkg7bUpebFs2MEtDL1U1TjZBNidCaDdoLEpOb29MKERtU1BmKDQnUWQmIT4rQlJRbiZnQFhZVlJYYEM3MFMyPmEiJUQwMDBmQSVqbkplWHMzJzxWVEVRNG5kJWZLW0FMITtGSlklSmFSVyZfWydfRmYySiJcJjYxXkNsLjdmPCpyNzpUV0pRRU4xX3AjcDIvXDBSK1BrRUhCWEVbIl1wT3Q3WzshLF9kaSdIRldWSkEoNVVASTFNRFduRCE0cyFgbkUuLj5ZXEo6VGliW29UQzstNFheTmtiNFFLcFJYbUhwZ1gtMFBAbjdmVTAwOUkhbkwlP1YiW11TWysxLjVvUjZKOTNgb0pWSTpHdV1JSiokYWhbTE5SU2VZbTduTiZrXCFFW3VqOTs9P1plTVpJUzJMYihpOmJqck89IT42SCtFYTRIYCMzVz5tK3UpUT1nUCUkXmRGL0g3TEw/UFw+LFk9Z143cCpcRTklKEA3M0svW2pCIS1LJ1A6KXBrR3AqU3BMQm1FMTVbS09ETXNfKERaRT5yOCFPXDlmXyRpVGtGLHVAY1AnMEZvMjEwQHBNZXRrcWMqdU8ncik+byZlcmk2YnI5LnJJUSgpbWhWLFYnNV1PJkBFXz9sY2UiJjIiPipFQTUnLD5iPk8tJjdyODc4IWpYJU8yR2o3a2BQS11Cb0src0VsakhUW0RFJ3BDQUhfUzJSNi1yKDkjJWA9bC8xKCk+bz1eamFbYyFHUitbZUBISlNbNXBhcjBfUSttW0FdQlltbyNaRExBOFlqL0MlOlRoNlJqbC9qLWhfRmlQYE04LyhLZT5RZWxbayQmaz9cazhIJDdnOig3ZmckWD9JI2hwVV1bRmQ3XlopcFZuXWZnaS1EZ1MkMisoZ1xfKEZZM1dqcGdBXV5La147IVYrY0B1QTEyZ0A6KWVTaTVGJj5nNy84PismX2Q3aDtjNkghJl1eYUBuY2VeSS1uW3JxZyo/I0RWNm9RWCRyW3IpZjFGP11IJmVdKypmTlMlUzVDZVVuWUpiMGlUXE4pWzAqXWpPJW0xZXJUMS1BVW9eXDlZP28qcmtJaCRBOmVCZ1tLcy82P2RSbDtUXE1PVj4taEA3SGNlX2JiYGtGSVl1R2tdW3BsYUQzNGhNKlYjSUpEcSQpZzZWPUMmOkQtSGpSUEBYa21EYD9iSEVTW05CdCIwLkdYP0Q6VkM9Um1LO3M3YGtTVD1sUSFCP0ctSnVhVVczbFBzYUA0aS5nak81TWdhci08XkZbckxzKU9wMkBBTClhNDxhQSJtMC0mdDBdJm9RO0Bma25AcWNnN186Sl5paDRcQChhaDFXYEhTP0ReRCp0Ni1mVVJTVlpnWC4kYSxuQUM3N1dAcEJLRSY0M28yKW4oMSxcJEdrZDpJImE/bzFlXFQ/MnI0SFlNUyUvYzI0LE9IW2spLW4jdWNeP2dCVWRxZHI/RGBJVl0mLkA7YkJRLVZZbyorMD9XZWdYKiVCbihLZyMiVXQrVztfRFs1REhIJGw1USk2PWczLyllSTFob2lsLzw0bU81OCdyOlA4XF50LCY4cUJFNmI4KixGUlUlTyJeb0EyKSYyZSo6Yyp0RHRLcyRndDpnailcQD8sUDYzMlpOQl5eTWhjM0gyVWYrcnFaKV1wSFJGL1lCPSY1PjYhXjxvcS1bMWFudDFyaHB0aXEiVyNXZ1Ewbk5ma0siNkZodVwoQFpIKmlXV2dLO0wlKUcpQSlmR0tzY09wTipfUCUzZ19qRm5XJFQnKUc9TU9RO0lFRDU9YiJHQ0JdQzE9SlBBUW1aLVxtU2xkPzJCMEsnSWlLMzZjRjYiNU43RWw9KVckKV9lQ21oXzhILCdbL1RCRFJzWE9FOllKXEtTJFlNWllEKj1BVyhTSjhBRXBibiFhNCFAbE4yUEVwZWw4SypITjlRWC9KSG9pOUkxcDw7aW5tOV91Um4qNkJzL0ElcS5TSToxU1w6MkJvPW9HTG9nJko/LDdJdC1hU29SXUoyMDZAVFxOJz9LPV4+c1ddKVZHaW9zbzUlSkQ1IytdQms5J1twTSg3ZGEzVGskRzEhSiJjaztZNClscyhuX2ZGTz5Waz8sZVsqaS5TaFlFZCEzYjsrcW4hSHMsI1pfJj44cElNZy5fZW1rVnFQRCRePFM4THFgPFUjKG8tL2pjPFRVZEBaJlxIaWdnT2guZF5SOkQ1XnFHYDFuJFtAX2xQQV9ZK2A1SUtZPEItMkJYYW5tLS9xWC1rR14mLCZOPSRISzliL14qJXB0NkhiNU9uTTlPJDM6IlFNISxDI086UylVOXRhKXJUYkpvZUktZVAsSlpraVhbMVJGMU1BXihXYlsvNyEmbV5YLj42b1pLXWNda1Y2MkVoWFhPSzhbITBqIVluSk0kMEImUD0mPj1lS25jVk9zUFxiQjhQKmUtM2pjYXBLMEFuXC9OZ1gxS01yNmt0JlxSNzgnVThXTVQpQy5YVG1DVXNUIkZNWHEjaVg/S0o+RkFFPVclcWJxaCNVSEs7PmRUNzVhbUIzcitKV0wqJHVtKCMyIUhLcSpCZEVoUE5wPDhDb3BWNj1mNT0nOGlNVycpMG1GcDZDYTpKYHFUVlZtU2ZOdSdmPEwrXEBYUDxPRy03O1FMUm0oS0xJPzFJWXAsMldKIlxWcWo0YVI7O0IhWzZvQEBaRFVvSklRXGtXLicsXEc+Sy0ocCJmX0FLVipsLWA7K1BaPlQ5YyluJ1JyR1ApJUs0bzM1VTA+PWAsYm5KOmdJSiFOOj89KlRrYlArNnBtJVs/PnF0UUBONExmXFBrYzhBY25JR2s/V2xrbDdxczxuYVsoP1ljQTpkPVVkJk5dJGtcR04mO11mbGk4Si9jSjtmLWMwQE51MGNOZj4iMCskPFkmJ0Faa3M/aSchSE80Y1pRa2laSzsjMCw/OVZ1Qyw1PHJFZmwjLklnJ0QkaVsrUVRlT1VdcGJSUGNqJjhyI1c3RC1HOCpCN0ghYScyOjcidUxVZiFbSXJQdElRLz1udS46S2dUYmpHJzU3Y0tZJyFsQyE5X25mcUlhZ2xWJGo+TCdpcDo+YFRcXGgxU11tKXBhTVI1VmVCZk1WSFMwQmJCLUFHM3JdcSc0NEY5SEk3aEYpbT1lRjNeMTRrSCpGQCs3UihPOzdCZGpIOWNwKVEiSD8rU2JEaEE7aGZJOkteZWMyI1g8KjZhMW8/O19pZTRXZC9rTF1WcFxIWl80VCZQK088bTxSbygwSWZQNCNuOXRPLUllcEE5L10xJyJlQVRtSk9FJyJCNkcsMGFMNUhWWCdER0JfImFkQVVWaVtxXChAJixMajBBNChLcHFdSW1FIlRJMGkyZW8pa1RWVTtmLVEzOC1vJ1JHPV9RKUgxKEZoN2ZBLnRDKWYhTz1wLD0lT21iQGQvVWU8JigvMiEvYk1bU2FyLV9xT2lRZig0J0B1WWo8Ol4oTjljVS9TTCtMVFVTXHNjTklgbVFyN2dNZE04I2JCMCImNUpWMjk/QWpkclBMO19QXlpoO109a11fJ1xCZUxIVSVLLG84VDR1RHInc05bW2slRjQmR1kxP2YxKiZFND9AQjV0X0FBZyxlJmQyO0QobFM9SCZIbllXR1dYUEs4dVhVaEYtREtWamIlI0E9ZzYjXCh0XEg2VU0mTzk8VlJsa2lWWSZEXkJuW2JgYGRYQkhUb1YuKldkOio2XDFgdG8mX1g2NUYqaWNAbXFmcUtVMkUxJjlBXklbZypZJ0tnMFg8LkhAQUZJSCJKNiY6aTVNQDsqXjomTiFIOkNER0kyMSFQcEE7LmZsW1o0PChILS9Ial9JKC9jc1E6N2QlVzs8WltmY1ExZUI4Mj9mPjIrTUlkLi5xbVsrSTVNO1gqQlYiVkZQW2shQjwsKnVFY00wbGdNbSgoJW5OYiFNNykzaipZNF4tT2IkZFJRZXQvIVM4Tj8sKFNCOzpQWFhwM2YvSF9tbkYvZFwyWm42VTYzSW9hbD1obyhydTZtRjRRZEshWiRvcGQpQG0mPjUyW0Q0WGVRbF1AVEFYP0wxXTw/UkdeP0hMSStnZz5SOXUuMDhKJEkiQ0pVdTpZLkZIaCFqZ1JEcW0sQWdxblQuJS9LImYqT1RaOWM/akJcXDM8PiVLOjRwOERlU2csbl1VJyUwUjYoJllobEAtXGQmJyk5WzFjPkswZFBONigqIkQ5Tzk+V2ZOSUlkLHJERTlpVj5rM1lGSlg0czNgVyc5SDlNaVBAOkRaNUM6aDJHPkI0LFFjYldJISk3UltGMC9TLnJQZmQvb1pEJz9ubzZ1ZDtGaSVHQDFxQG9ZMj49XTtfc0VoPU86ODg7QHFkKy1rWDpmYGlFY1VUcSlQdWEyI3NPKUspMlZQTUtKcSpJbiF0PTE3Sk5GbWQ8WVg9Y1dTYWU4JFkrRnRwcUwlMzBISGtPW09qL2UwJS85XD03OzZQLS5lbFBwUUkiL1hJTEA5P0NJMmJPWDQqYG9BTUJcZFNpS3NXRCJuXDBHJldNR2lrXEA/ODddITxiTD9iZT1JMFU5YF4lKGYnbTAkdUlIMVs9PUUzRFk7MXRwI2w2WnEiIzJTNjNqT3FmTUFRXj84RFdcOkQqWFp0VUZyT1xWcWEsVCtZNURaY08jTW01QVxZW2VWPWlyPihxR0c0NStQPVY4PSk/XHNISkwwcjRHIXE0Iy0nWHMkLWZmXT9GTlpmWVtFaDwyT1dCLyZ0YVJGUjpuMT5iJWJuRUhdJVJsKl0xZm9kcm8mNzBBSy9tcDNoRyMhSicrSGRESDdeTFhANitfQEtDSjZacFs/JkRCXj5TVDpjNipPK1ovUXQsKlBKZClFNE0yRnNUQk1SVTRwXSVZaFgiUToiNC5EQlFhWSFkbzAhaGpPPTVtcDtObzgvNVdkTmVLQVtsPGhMN1lrcWExIXFWamMsOE1kQ1BjOlNwXmRITC4iK1c6JyFMRzdjL0w9LUpbTWdNKWE1aENGK1ZURyRoT0wrbT9fXmxUVTZYUVVgIVBDQ2FGSEhMTHE7REg9dSIhSlU9c0s6QGMwW2siK1labVBpaCFNZVgsNWJSO1VpU1tEKytBMj5lJVc3KT08JXNkSkF0Wi5vaD9eJFQuY0psYkxtYD9rR2pRR0MtXV0rLWsiY05hRjBcXHI9JXBoYm8la2hPSFpzIUhERXEoZ1hyRjhpUjVdK15PLFU7MHEuKU4jUCF0NVVyN2tqYjo1L0dAKVIlNTYuVmwkcWFSSC9GTzJ1VGVqbilcY0wxU0ohTD9iNmlIZ0hWKShcWzdCQldSclZycW4+OGk8UU1mRk1tPDUjUy89TE9cPFpcSkVZPFc7RU0tZVZGTzwrQUMsLXFeYzFiL2trVGJjJj1hUXUlPXJPNVpuVDkpN1UpWGpeLz0lOVIhXyEjTz80V0A5UCtZK1ZMa0xvY1dwTSMycF04MEhEOSheRWZwTitFJVZVTV9TcTNnTiY+JS5QdWovQCtqJVJZWyx1USZiRXEpQTpmQ18uO2dHPThAVzFkXGovMShPKlhcR0dyL1FhSkpYMzdkMVQzXXJZcXNRaSw9YFdxYmw2cV9KI2ZXUk1GSitVPTc+Jj1vYlVwMnA5P0JjUj9lZ2ouJz4iIVRULiFxSjl1PFVDOmpZWE9gMlZgTyQ8TWU3QztGJXJ1QCFLPThxPCJZRU0pPD91cGtKRj5ATUg3QDMqUVwyQlZaIyE+KkpnMDdwI2hxLj5gZC9ZOSVSKDZ1KjBJVnBIaTYzJEE0LSVAPz1aYWFFOFJvYyJobisoayNoNmJJbEgxWCNtWCtfOyhYJ2syOEFkNlQ0UF1yNVQtJyFjSS50R14qc2YuVnAoTlowY2xTRkBhbDNNdUFPQT5NLF9tNUFNNWJLSigvT2RjXXQyR2xiZ2s6VjU8cEJFaEstIV5XLzZfSW1rOCFybWpcaHVpLV4nQDFYUyJ0NEE2IUM5OiInQWFWUkdLMEVqLTYlXyhINl1lQCVuPigoZzlELV9GNDoiZVsiSFs/NUMkJStQTypKPGw6PUViYjlSYyVlVD1IamRyTCtLS0hNVHBwPUpJYXFJKE4kN1RYUFg4JV1DNFxgKkpAaEBbOkgycEBfdWYqZzZpL2oqc1FVODUlbEpuMFBIZWQ3XnJAYVB0M2dTMlcxJkFhOm5cWT5WTSdEaktRSXRpLkBBJkhoQWxUPiosIzMpPiIuSl5DTSUuImJaYXFdWGk0JUglWihQWWlPJl9KJUc/Oj9CPGtyNS80bExNIiFlL0wpc01ea043JWddJm5eYU1WIyZRP0FcOkxgSyRLNU8kQHBZTiNDWSQhMWZrXFpyRjVqV0pTY09COCdeKnBUZEJSb01vaV0/J1ZSXUVyaihZSFZgNHJBYXJfRjFJT0NzXm0zTVlHRy06WC1uT2NHamUxYlpjZDIoLlhgbGIqT0FSZWYzU2dIQFRVTiQoLmMrLDQvZXBPQkpeYFEsbnBDKU5qZmdJUFUtSWEtMVwtPnNbK15lbmltQ3ElUE5jVjFBZGpicEVqNz1eMDNlK3JOa006PDA+I3EqRUUzVjleYm1ZMU1mXEEnYz1jOmkzLGtpPjBLX1QyP19XZi9CalwlYks9NV5RZmAyZW8kRG1GMHBAXl5lJ0YzSUY6KCFZUzpoO05zWGlKRCtBMj9pSjVeUzIpWnRyQEMvUlEmZ1pGWmQoVGZjTFs7SCRZOm9DQV9ZUCJyazIxZ2U5QVNPLjRDNGdNOiI6KFRRUiZEU0hXLGhRc1g1SGtMb1tPUEhZaGNUUWs+SF4pLVFeY3NMPW9xWShETV1GMmBLaUUvO0ZFRU5uK2t1c3JwJSxvWC5PYmdkRTAxbjYuZCRXKik+MlI2SCtjLSJNNy8qXjdjMmZHcm49LG9cLUEoXytSRHAqcjxUWmNbaWJtcVhqbDFDPUZqcV4+ci1oJ0FUcylpKVgsaW5wZk9VSWVpKWxCIlE1XUVfYjJkRGBVZzVYRDI7LV8kUWlhU1drZGklXSRsaDplLWhbTzItYTxvdUdhaVImSGloZTBFO1FZa2QmQmM1QWJMZ2g4SCZFPVpkbTxtYk9xMV9bdVRUWTNvSkg1OzcrJWBhdHRQNGFtLjFrIiFEXWJUJ0RGYmFdQjw3ZTl1ayNHQm5oODs9NUMnZDosNG5IK1JSI0w7Xl9fOz4oZTR1ZmNXJi1IOSwuSllwTm4wT3RlWCwral5dU2JNR0VSRTVhNi11MzQjaFtoZVhHQiRKQElYZyFIOTlaT0dkLlowcCdxXkI/KSdBMy5HJSpjL3NFPDVXL1lJazBHcGU7KGU2OCJNdHNeRlBiR2tkcihbcTs7XSNXLi1zbjJoIlskLTAwUW1TZztJRWdjUlxqNTEsRXQ2OltKLEJQND9FcEw7WCNjK15OcE01Ozt1I2xfZXBNJUwnTHJvTylEbmFLKDNzSyRmOlVeVTNwMVYzZSYuJVxIR2lJJlxULUw6I2wtQjgnWyhKJ1FPVXJQQVY1KHVaOTowbCRDKGFvLVBfIkUrSzlMJixvdTUnP20qZjNDJF8vTDoqTkdFLlBWKHRORT9fSiopc1M8Qi8qTFNpbypHbikuRlY1Ol9mMFdDZWU2ZG9Lby9TLEprS0ZNTl4kQDJqSCQ5TDRkNDAnM2ZrUSxITj43UV5DZldkXyNUPy9OYnE6JnE5WENtK0xoOzxqViNfbm9PTVVQXTNoKjBRZmVbaHJtZHJJRnE6LiZnS1RBWUk0Vy5VYThBcGJyN09AM2wxUllRXFNJTC90YHA+NVpmLzFqPF5qTCcsMWhzVDxLZD9MVlJNR0E4PW0mViJePjkoWVZyQiVDRGo/WkIxQlxFb1xnI29YS0hbaWJUQ08rSF1ga3RmM0ldMi8ubCYvKS0qYCpGWWBmKkxRWiddREAtMC51QyZvdCZxLChXYy5pSCZ0TyNSOEQnR2U3RFM5YT07YipHZ1tkX2dVazwybG9jMCU0QGptVVQmSy0iaF5MRj9jRUw6TFhtNnNTMWhrKyFkTzBealFVVEBYJS8sQERTYSMwInNqQFVcSG1SZ0YxcG46YkxPN2QlLjE3NUJaX1hVXj4ycGg8SVhgP0w3N0Q1TEU9JUlOP0xSTyxzdTctTk8mJ2RZaGZaaCwkUWdNJ1NBMT1kO0YvKU9xYDk3UDFyWFFiOFRZXV5fMitta3BIVk8tOTlqKCs/YFU2RDJEZytFLVZKIlc4JiZHV2RMOiVtWlFFQDouXHAtI3BdalcvLVRtIlAjNzM1O0tOM3BncDFAYDAmIWtOci8nVEQtJFYjcDYlZXA9T19BMjtCRjEyZl9uQyRpOUlBWy9kbkZyOWNNL3EtTyMsNTVjYkVGWjtyLGZGWWU3UGprTy4/KD8zOjEiKmFnKl9IT0hbUzV1ZGM4b1V1bXRacDEvMzNZODdITWNDJVpFOF85SiU6cF1vJ29QXnFgUEFEO2YlMiJGIjFOYUs6dWdocistM25oL2diOCpLKDQqNF9QT1llW0llKVI4Y0tgWTZOLS8nKV9NPiNNdXBGRVtwLSYrVTdTRz5pL005QCZnJ2hlYkFEdTwtQSNJS2htW0NkMUZvWVhwISxTbGNDYElxOCUsTTBjUTxkR21ib1s2XjM0JHE3bihxN0AqakRuZC81aWpeWig5bUBnRGIpOCteaSc9YSZiQDJiaVZwXW9zV0RaVmtpczRNUGZQXG1yZkhqbVJcKV5BUSEtKko5QFE/JSZLbzVEdGBTXVglIVhyZGhnSEdqMy9RJE9cMzddTSF1Q11EQ2YoJFYwaD1QIXFDNC4saF44cVJ1W25oITssViJOL0dESVZkbSVyX0cyOnFTXVwtZGs7W1YkM1coLGkpMjxeaERBOlZfbFxSbERSPSltL0lPUj5KIzhPYC0rMENdVSdoNChALHFfQVVMRl84aUZZMjVYZjpxKEMyJD9JPi0sailOVkUzYTlHa2hUXGNwQDVuNlFAQz9HNVJCaWdTVCUoPlhrVkJxbicrIl40Ik8xbT0rWFxfJmxIIUNpSz5TM1NCUTpyT1NRW1dtViVrRlRIZWdEczlvJ2ZAaktGYmY3U0orW0E3OEg9JXFoKUdpOC05J3RMLExDTWxvVzBhMVBEOmFwUyxuVTRxcyp1NyVGTUsoSUNvN0EvPyglKUgvRT9JLSE4cUJvV2dsPyE4ZTlmMlJyckkkVi4wQy5xLyQ9aV4nJC0+Xls3L0JvMy4mXG1lKi45a0BtOS47NWBycjpQMmYjQlM5REg6QTtxRk1OUFQtPUdlLypRVTQ8KE1SJkgxOFZKXSFhVSpdZl5lRmRbbSp1TUVJUC0iOitoXWdxciEmQy40QyFnOWM3TTQ4ZEQtSEFrSUlATkFoZitwcUZFIzVYVERhTmlhOHRwP0EvXkc8J3BYZTEnVG9vTT9CQ1ZPOi5RQF9yK0ZuPiVCTS5aM1knXVlMZjxEUmNzV1x1TkVFKGUwKCFsZGpgb0ROIzZHUGBZKXAuRGI2IVlYJ0wxVGYqbkAkOSM0XyQ2cG9wNjYlVSlkPkVubyk3LD8yOD9LNlhmZ0I1I1p0LzhdITRRKlBrOW50UzMkIWNcMGFAIlRgZCFfOVhjb2FlLUdvaDdbX1MoPmdoUkVGOXQ1Rm84T1tjKUgwKClPcmEwQVJxNVNkQ10qS2IqOjtCUlk9XDJSRUtGTDZuX01IIV9PdVhAW0E+IV4jVjhORGNmUT8mWzdoISFYZmtiX1pbWE1ebD8qcGFFcGY7Vj1LOShVOUtwckkzMm4/Oio9PElnVztbPj1XbU9sO1c7bTFXZiJbckRNLjFDcWZaVkByJEA9S0RiXjIuITFmQyM3InA7OFslYlQhLj1AbHE6RXJxTiQvP2I1RjtaJU0rcjBcTjlGO09IVTc0aGctX2pkNGJLZHRpOUpaNiReWF9GPCdOa2dWVV8mbFgsa29tLT1tR25ZcTFGaXEkUW8jU0k4ajgqbERqX3BjPG1gZmYrbnFONU5eQDlxJVFnVUpobF5XJDZSbGdKMzgkOUlAaVZFRyE7azxMIzgzZFE9YDRcKyVxb249U2RxO3RFJGFBZ2VkQFMsPVAqXTdwPXU6OmtZUGEyJUxoUEQqUlV1NWpAdEA7VURNRTIsYChbV08hQSxbMGpRLHNzJUU/PVlNZ0ZAKVE0Y1A0S1VXOFYtTVciLVZYX2wmRTIsJGRbMUgiOlg1L0E7WUo5W2kwPUw8dGxvaS45WW9uKTZDJz80VD0rWW1QV2tDK2Yoc21oMm5VdWlOXyw9VjM9QVEhQGxHPVRpcG5AOUxkZjk3LmhrYT1hXSs9Nk1HS0VmM19uc0hHXmk1cmBMKUIsO09DIlNSOl5TMXRDODVwVSZ0Ql8/SWIwSldyOmU3Q0w+JiptXG0+MitBbVRYLChyTFM7SktDPytVTSNoMCFNXydyYjU6ams7NiVhYFw8TSpSL3Q5bytuOGtlJD0mRHRDcGknX2NGbGNoR15aZClkQT5eZyNNOi1VISMxK21aSjVMUzkqJ0gtcGFmKSFUOEAzWVs+ZTU8LEJ1T1o4L1ZwYFo5UWdKO2NnW1VAKCFuNypvRWhuVUUmMmVDV10nM1AwInEsODRpUjprOShyQUFeLT5fRnBXRFQyVU9lPmBGNC4hNiQpKW9YMUY6RXQ5TE1bMExrLDdnY1IhXF5LXSZFOW4+O1ouQk9iTz5bJjJpQDA+P3E7JSoxRjZLOltidGtENSJpbFQ9VlshLGMyIl85OlMlNUpZT2YvKzxiLFJ0SGgybToxMTExMz40T0dRXy9CY2hxViZlZGsiImAtP29QKUFSciIxZD4oSS9sQUA3RSFwayE0WkhaJCliUlBJJ19HWFdOLWIqYXMvXi1QZTE6L2xEO01xOW1vYjkrJ14pODxgaCs9OEBTaG11WWVbVyNIbmhhUko0dWg7K11GUjBOJi5KVFQmPzlDKm5vUXIyTFk3MDc6alRXS0NyZGpqYGZVa1JjJSUwJlIlTXFLPVlsWl88bUsnJT5HcTZeQXRhOyFKPGJNU0gqUDotcG5EVFswXGMoTitTTTMxRFJOST4xXSwvKVlgVG5vRDgxczFWS1s5MltvSzlyVCElMWtLYVQha0tGY2dfNkRdaSk2VCpzJDxGOkFvVm9HTV1fKC1gLnFZP0VTZWRRREUrLWQ+TzAiYENudFlmMiVNVTpMbUZcTlNHUC8+OisyPkkpYikjSnUpQTMrRjs8TU9TXFQ3OEkucV8iZHBaND5ARlxdW3FYRXRjXFEnVnNGZi1AMiteQT5vZixOIWBUPHFsJE5XYG5qbzIjPDE6QiY4IjReXys4M0A0cyckMUBOUV9CXEBQaGVZLEI5RW1UPVUtKU9VSVV0ZjNxTGwjWFZvSCs+STYicFkoK3VDYnVvK1EocTVnUHFrbjBTQ2xfLmIxPiRLcUtrMyhfNjdlQjtKQDdrN3FrbzV0a209YExlcz9qPGlDNEVNNjkmO2Jxb0xVcykhLSg2aXU/JkFlI2lGK20+UWY9azU3Wkg5MXAkOzFrWj1tTjxqLFx0ZUhKcGxCI09JOVEqdENGO2UnYXEyPWE0SmJQMHEyalduQEc3LmBrNzNfO0hobkgrZ2VsW15yMCtaRjQzL0wvI1NiVD1zdCFPNlNkdHMkcEBpQnQqaUlGNzhgUk5CMzRmTkAicjdMZ0RBbTgvMEg+RGtgWTMzZ2FlcClbbHIiXzEydElmWUtHKjtgO2EwMl1LZW9IZ2A5Nmg+ZEsyRjc1JiEyS25GTFMkTihUSC1TNCwxYEcxMVwiKGU/Xj85cGpxW09ea2ZUR107YU06V0MiVF5VcWNvdVpyVSRxQ1NiYkZaSShkZ2xUTmBFLjtzNnRYTzVDRUtwOkhsQWBqOmFNdCFBUT5YIVVWSU0+bFw8Wzo9KydoSjdgPC0jMGFtSEJPVUVhSixAWy9yVSxyQnJUXFsrJitHL2RncEJ0YFI7cGlvWGwzbCQsYG8iZy9tZUNIczdwUklvQ2gmLF5PPnEwRmI+SSNxUWRwMF8lQkArWGF0YTpodTYzQV5hSXE9bUkxOHEvUi5jPTQ3QGExSUpyaD9zNWlGWUEtPXUlKDplKikmI3FGYS0rYTg5QU8nSlBJKW1XXGQyIk5qUHFiaVlXPl85MUFyaVQ/MGJjKytQQTZrcF1YV0YyY00sJ0pFclZnWF5fbnBXO1BHTlpqLS1QUVcnT0NwOGNpN3UwR3NvSC9HOjQ/PVtqai5LU1UhNU9aXmk0RG5Qbz4rMjdbTmo3aEksbnIoaV4zSFZHSjIkOiFmO0FQOzA5PStpXlJBZWJrS0w/clwtI1xTJzlfJywuZmRfOipxU1MoS2FvOCVXXltVYkBtc2s+VWEiVG06SUo+dVZfbyYqQyYyaXEoPSc+UDBcLFMlaUpfaExxJWpoK1FsUG5YNEgocnBqL1Q9JlxAS14lRTBZOUBzTlUlVkBZXVMlPSgiO0dYcHRVR1otZ3Q8TUlWTzs2TEwuNW5vJWRPNCVdbzYzZ3NraFU0bmwqIkdQXSxBR3IoM2xgXjUtMGdGTHN0JWRXcmNfZz9RRSoqWDc6TjlZLCxwcUFXW2xzOklOPFdsITkzVUhvcHFYPDwnck90R0RnMDYmPEJAR1tYWV4nMCk6KW4vVGxKWDU4ayJhXGREOUtkW0tpKDU3Wy1lSWtSUT5kYDo7NmljLl06cktQOi9DPTNHPEolRUU+J19OVGI9aydUZDAvaE8tbGJTOSJtWkojJmZmT0k2aWtfUFliUkwpXS8+LjUqKFVZKkUmLzVVRWM/NnBOUU4vbVw6aEErK2dBXzwjSDZka01kZi8iZ1htXnAwVywjUj87I2kqZUM7Ui1YaHIjK0VtViJsUF0obzNlWDtFPS1nLyIiLWlsbyVCcTVJLmY7O3I7WklwbzlWKVNVKTcnUlZqIWprJDxGOGxQTEUyZmMqclVHOjVQb1tPLDdDSERyQVJlJFpDT2FuUVlJM29eOFdMNVFBJnNlMkBePUFtdXNpVG9lYC42WClpNDg7RlZdO0RPVnElImRNPURsVjM0aG0pNDZJSVQ9ImAsRUVmY006KkxQTD5IW08hbDwuTlJgXmZWTTdwNDlOJVtXSVpRVjRCJDoxa0xPU2prLyYxcjpiRV1JbUwrRXViVTY+OEwvZzJaUEVvPEdGIyskLi1oLjM5dGhWcitNXiUocidEbmwic1MkMEwlbWI+QUFcZCdoVz1aS1pGVFpfLFVnU0QnaUtMNTxwWy1DXytOWmBTVjZsaT5aXV5yc3BkK2FVR3JUJmc1U2k1Vm5Qbms1YCEkRlQ6VGkjTS5aa20lQW80bytoPihoc1NgJmlNcWFFPEVhPWM9MC1AUExJL1JfZFNhKnI9a0xKK2AqPW4qYEFYKEVxRzshLWJkaiVaI15SLW5VPyskODRmOFY+dExJWDA6SFlQVkJudDlNNz5tRipANilqYkgodG9ZV1VvclFYTXRJSkJqTXJHa2ZaQTREZT5YSFxGRCw6PGMjbDohLC5TRihKT2s5b0tfNVNBV2dKUWQ/MlI6N3FyVkMvUTNyb0c0Y0gwPSM4aGcrXDhJPFhNOEM6OTsyJzZCaUMlTC5qXHJTZEA3RFo+TE4jMElENSMlUCk7X189UzdDQS51I3JvYztZL05Yayc7QV87OVFxRGU4UilkYzlWS3VuUGh1V2g5RmQkUis6VD8oKThGPE8zKyRJMllIIUBzZlppdGlvXl49ZkFkTkshMk5AcktlamBnakdpR2M4MkFTUTs6bCwzLGgoMiVIUDtnW0VhQyI7JiNvJ1huPUcwbT51IissZHNETzxQXVY3XE0mbEJBTUNlYFBccUVUR2YiVkg8TGdMXDxCKzNPdSM6RFQ7NWItK0QuJFg5XVhNQU9ETDYmNWMuNllPKHJjPVwiaiRqakxsVVlKWj8+am9GMT1Ea0xrJys6Qk90Z2lWV149JzJZIW5rRicqaiEoJF9tXlgkajJlc290TCgoRFJqNEE1LG8nVS00XkBMXDI1USg+PCRTMEBVI25sVCEmQVtlPydIQGlJN11GOTJmZG1ALylHI1UmLiZbNl4nVFM5PEtqY2VLYjJkY11JaGchI0NOJGltNmhsRiRyRm1yRSstW0Q9IyNXNkFBQDRHaiddT0ctI2FCQ2tPdCJlRERCVT1WW3IxTEEwR09WK0RncUtPRHI1Zj9JSGBMcEEkUTheIkVXIi0+YCs2Uzc6Mz8jXmgjMVokQGpKSWA1bltZbmZSbCstWGM3Z25CcSw/cjhHaV5JZTlBNVw7XldrJVlkbDtXdEE8P15rLzwuNWRtTkxGTCdUUjBQOVpFRG5RKHBWXVltJ2JKMFVbQ2FqKGI5Zi8+KjBPV01tWjdjQHReLiNTSCdoSUgnKmdKdGdgQHE4XFQzbTFOcTg3Xl1uV2U9VERrIjNtZmg9YURpSl09XjU4QDZjQFxtSlI6UVwncDBbRjQwIjVuQEtPbExBb3FuXCZbSWVNVmcrJF1lY1RCMkUpIihWQmhxREpJUVIiLiZFKWI7c0VmclpQYzZePkVMZDRMSGYsKmFQYTBjVWojOS9BLj40RWdZaU8kQSdlWlZTblNIJV86cCleWC5wYCheckdxNUVFQjlZdD90UnFVWFo0WFtjYCpHZm0vXGNoJDtPQ2dPbXBIPEgvbl1MbjBmNFEzbyFTN2loXWdCIzxrOmFFWko2Vy8wYCtbOCoqJTgtViY9Jk9qPGBaaiQmZG42Kj1oITtfMD5JOyhsWDZXPyMySzRRbkdQakNaKTsiRWJVK0lDRG1mUTJEcjFJKF9pOyYjLiheOS8+ZFpwaDkicEIzKF5AS3VlIWNjVG1pPVFtSEsiTXFvO0BodFNlUEJjVmZHVGVISi02bHFxJG1DLXQqPlA6cUdjOlpXaGM/SUE1YylnVyNLP1duaF1kPERoNj9ycio1IXFXLWBANkxONGlyciZdUXA/RTc1PVBAKWxHXkBAJmplS2xJcSExVDotKnI9PygkQFg2bEBBL09lZS1GcSQ2PWdcNkZNWkExODxzLHBGU0Q7RGU9LWs0Lm9kU0ImYnU4ZiYqYT5JVFNWQEZALGYvOE10P3BXaHJLMTMtKlpFVTd1XF07byFZYy1yNzlDcD5DSFZHRjNBPEJhTVY4Rmk9PnVbK2VZRlcxYmBzRkdHSU5PX3RJYSkhUGIhTGdtRCVbKShGJyxfNUJiMmZGLT9YWiZLQGl0cS90YEw2Lj5pLTtgcj9GOFxxKWklPURMMytDZDYqUTxwTnEubCJkV1NoVjV1UmZyO1RwQzRXWEcsckhOMyRPNTVrRGMwRTplTmIlcFAzVlxjTCJsQWxbMyE8cU44LCdwWFpQSE4yJTQ+X14/LS1hPDM5IyhGOmRkQV85WTw7RkdQckNyLGpMI05UczhCUnU0U0xLbkRrMCQ9ZU8kKCFCak03PDhBdSE6Wm5RMnAmciY8Sl0naFwlalA6PjJxWVxNaWhLZVNHOkkiYTlmYlwhSFdUalldJVcrOUJnclAjX2Q0YmUvSnI9Tm5POj5ePnJUOSh1aHR1YnVbbSdmVFBRMVJMYS5JV3BvVjw2ciEoaiVpIjlsMGMyXSg3SE9vSjtNLjktI0NzMG4+RCM5IiFjLks4dEdbbSdgZmExcUlmX2pGIy9jUE06WUE+SWpTZUpMKXRkXVhzZDs9dG5CK1ROLklITihuMHJxUEM+SS8iIk1oXUk3QmppLzxmSTVzX11gQFBqLidNS1VhLCFFT2tPPDxqdShdN0hpW1pYNz1eZSRMblAvUm9NIiRNXE9tX15FdXJRIjVCXmZlPk1gVE9HO29BNTVoNDBvPTw6bjQtRGR1MjtfTTQ2b0pbYSxiZGVxQVtuPTVgY1BTMFEwQUBObCoqXFNNNE5AKlg4dWFucjlVcEA8XzNKLGY+dT5Ba1RJRyFiX1NQLVI/YXFnYExVOER0XW1VRHAnUnBxYSZuYDwocjRabllbZCs7YCktW19EPVBsUTpRU25YRkkzblxIUnA/Yig/Xlx1bSlrQmQmLidEKz1GIktATz41ckg3JCY7ZDcjcVVJQil0I3Q0aTNocjY1aWtvJjZnXSc2cmJQN0hzdF5NZGNGXjktRygvRiVGbTZkc0diZGcmc1Q7L2FtWU9rSm4uOVxIZ2lkKG1mXlw7JTltajMsUzRSP2NVQHE2QC5KM2V1Ozo/OSEmXVNGTGxpIlkiWl9CVissMFpVYEFlRVc9OCNnU1pQczxxM2JaQHRDWEhzLko1Wm87N1Q2PD5xPmhVQDQ7ZGVuZippP1FOXyMsMFs0L0BpckMyZyJ0aS5jZzcnSkBVJl9sRD1cOCo9THJxQFozZlAxckxuVFhqIT5gIVpvOktOQ1dVaUchJm1OL1RJVFpcLixqWWw6MDVhQjhAYDtHKWAlTTQ4LytxKERoL2oiNUtiUWIkR2VFNFMlbjcxKE9sMi9JdC1TOWNpM15mbFlqSyxfKy5uN3JWIT9QP2kvY1ZobkpwQyV0Rix0UDxdJUhIY1BOXC5najlJOSNTbF5OJyddbFJBbzxDIWA5KjNEWFBYVmNpPG8lMFloJUQlaSFYTURuUG8+RGglTlBtcENTKXBNW19Dbks3Zi49MjArXGxMYzUvKVZwP0VuUy9CQTQoRjRYI2ZFI2U7NWFzUmBqb29ZIztEVS5qQi0tTFtmLSsmalohNTBiJ1dUbHM1Yj5QclRbU3Q0b1g2ajltYW88Y15jYjhJYWFOYU5LXjdeMy4xP0deXFtYI1Q3JFZWWjRHZ3NySEBYbEEoLCY3VGsuPDJLYGlNY0RbZmpOYm4yaUFTaylIR3ErJSQmcllOPXVuKzZTV2gpayoocU5dWl5wWFp0VnJxaz0ocVcnSHJvPXIkO2cvQzYzamtbdSdfWmBHNDI4PFEyZUlKKTxjcjJVN1JKdDZCbiVTZiM3a19SSHFGQDArcnBSVyNyUUIsbHBYW0I3R2pVLDppSCExR14vNToyZkN1U0VnN1U1O1knVSNWVERkdT9eXFFdVG4lXEo5a0FQa0pnJiVDaCFPKHNAbnFULmZyOE1xaEkvOzxZaEtcQ0BKJWJXMChGb2BNX2M9NGxhS006bUEtOiopRTRbSVJkJD1dYj1lTzx0bHQlLGNxIiVRbklmJVVPXltwRVIrK08uMVFYNS4+S0QwaXQ+NT90Yj9AQ3VdcG5COmo/WWpQSiNQTCUhNSZkaStbOV5IXUhUNHMpPl8pQWBFVU1UTTM7Qjd1SUpGWzRdYEZbUnE6L1BRSUpvRlQ1J1srKD0ncENTU2JNJTppOFwxV29cLSxoVCNpRlxCJi9TazZJJFxvLXJpN2s1VyhEOWo/ODkqJWohaDRlO09BJ2RwS2ZcYWQ8JiNgayo+Km8/ZyZNLDNlZ180IS9xSmIxZSIlcFRuM2tyblA3XlInSEZpO0ApRSdjYTpHKmgiNERTUiZMKyhDLGVeQjkwOylacT9mWF9STVUvcnBxZ29NVFkpczpCaSs/altecms+KUhTTy5bcyRYJzRZKkclZ1YpaDdRRG9pR0lGWCRTWChHR2pbclpUKTtMOyYoZEpbOkk5Y0hxRG9oZUlhJEA1JXBaNlMraU5CTUxbYmksdFJybG4uaEs2K0xRKSNpJGlOZDlbLj5UVDIwQVk3OzQrJy8tO0Q7Ml5GNkI/Tm9TQ1dpImVrQCllVj1gITpsczttTGQ8ZW9hZ2NHPkpxVDFnIzFpNyVOXVFyQXRNNTBySzxZaTclPzw2XFJwJzxlLFcnJEEtYC1PZFlPVTgwcTdaTlUvS1FoIjY6K3RwVD03bVlDQEtfMyM4a0ZbXG1scnFZaFo+YjhCMEFbIy5TRUNFNVJzMnIpLCk8OzZZOyc/TkwmUyMjSikyRWNGYzBKamMvOlMlXiMiV01OITY2P2tlTXIxYy0vaj4lZUJkO2BlMTcxOFw/SEQ/Y1IlZGQ8dTIna151WUJOWiNpL2hDYi0xMlk0K0s0Y2ZCSGdMVClZITtzVDpWWkRmOkhcTjxxYkVbOUlJUStYbytqNG0rJjI5Zyk1ZiJnTlFRY0xNPThrSyIhZilkJ0BpO1M6LDVgRjldSV5SVk1YJExoYC1FKUI8IztlJCwtZW06LTFiRF5tODtdLT81LW04dURIT0c1WG5EUERTYW5OQW1rK2h0InAzKC5tbEowOy4uL2AzaD9WWE9iYSg5OldgVi8oXz1JNGM/TiEyMDomKy9Eczk7I0dEPSc7SFZOaGYlUFVyPWhzTFMjUD9ZTi4uJ29fN0JGMj5ZR2RDLFMyY2RRYzI4NW1zL1g5TyhMMlhTVz5SSi4pMlVyIUpFMlcxUlxhQUIpbltpKGZjRmNLayRncjdBNkksUidHOmQ5OVkkZHBjUi8/OilMUSlNVWAjMGZvcCc+dEEoY0JRY2ZkUj9xbVhoW0Q+J1dzKicjIVhrKF1YLlFbTk9jY11MOm1bXVNjLkRGKl9jRXNKO2pmdE1jSTxIVEFOJitDKDRfclhkTyYqUzpMcWknOUFlUSVuMDdMY0E0KXB1P21LXEYsRmlSbWlxTW9MdHJiOi5gKVsuN0lyYUkvMkNWcmdHN1duWWZsV2hiPThtUiFRYWtSXilSMVMsXjlxY0hvQGxjPnBoOyxELmhsSlhtdE1ScmNlW25Lc15UdSYzdFw6KkQrKXI2cCEiLSIhLktwbkZacGRSOidLOHJOXkc9bT9FcnRPOFxkQUozYU1yWSxFK2s0anRCW19bIT9RWy5WcGFGXyUmJj5edV4raiIpZDImJWciVUUkdCg5aVgzQF0hLVxnP2BFTDlKWz5fPjBPQSQzJShWbUUjVSRROzYxM1dXQEtVNF5iJV9lNCFDWys3byFJOm5RY0BaYyozJ00vcTE/dVMnTFA5XEQ3OzxwaFNsaXAkOzw3aVRCQStcJjtncWAkWi9nWFg5MDdfbGBOUFssXkFKRTIqRW09MT5KXWUlLTZMOkhVV1VocD5qWGhlNiFlQF9yQkxnXjxXUEtcSkgmOWIuQ05tR0AuKSMmZ1Mub19KVCtTSVVAV15lRnIvKFdxbT01Lj88bE8pZCtDXyVBUThVTyxFSkhbOzBebHRwbWplUGR0L1hEYVFcPDhQKy4+bkBSZiVdbTBNYE1AamlibHFUWE9pVWUiQ10nOipKVU4sO3FsK2RYKkhRPmdmRidkPENtXDclPjpQVkcuLjEvOGtrNElrM0ojal5MUyReaENZY1gwQUhjT2xKL209YUgsbnA1I1BPK0kxO1omSV09aUpUbVxrR005YTA6ZDZMISlYLDA7ZWgkKjxAUSo+KVciVjwldV4iQl1qWmAxJTVxKVNNUHUyRDZJUmZjTVguO2UnRlkkanAiLDd0S3RFZ3FHJ0tqOUFMMVlETW1lYy5jZ3IzdGE6UUlBWCd0XUInJVpIPXVuWlcyVVwsN25tJzVkV0xvPzJdcCkmLWtKJiI9Wl9TUDlUaTJscGU0QDxPWVk0LykqKShvXTJoZVAsMTFAYSsiV0A2Kkc+Jk1maTwxWWlbc2NBXjt1ZF9PazlvPSlTX1U1aWBrQDcnckA/WTQnQlZSYyNAYEgtLDcxVy8rTT9kX2VONm1oN1IlLDFDTElfYj0nXTsoU0QvNEVDaV5KLkJZbk0tUTBNXFsqRENJVzc1WFBgXGFnbjtjdT50NkhjMiduRHA2Y0s9J3AnN086KnBJdG1OQ3MoSUQsNGVyIW9pSio3MypIJV5lQ0k8ZSUzbnReK2dmcVdpI1hnKlE9USxvJ2w3WFs2VDAvZlVGJT5RVGdZNUo/U2JCa2RqKiowQUlzWk9nZSwqYjRaWHJGXzs8OjVEN3FKckRDV0QqVltubEpNXCVxO0JFV2JgMG87QWFdNUhLJmZiTic4LGs6V2hzWnRhXFdjbnApU08hPW0xJGxgSTVGTzo5JlkvUEhPKm5ySl5gamVSaFQzPjxpbHM7STo3cVwuU2dYKEg1cUxMJF8+XjVQbG5pW3FccE1GaFFdbU4vLU1OSGg9I106MUElJ19Raz82ZEIyVUJDXixLUTc2OTghJWxVZG4yZitWUi5RTkU6W1UxJGBnOy9dS01oSFtAaFVaLSlkYCc/aC9RXFhuKnVhLFYkY1c5am1qaGkyNk9DKSNOanNRJUFpQmExOkZAZEprTUY2ODxeZlBjUWcuUTM9T2hJQSEkbShUbC03RVtEc2daNEEzMiRBNW03T1FwZi5dRVIqTWA0LVtRVCdsXWgpbVpAVD5gTmBRZ0M7KTRgXlNUNVlrRzI8RiozJXBXc19xZTY8QmNiRkM5OlspWi9xU3JEcjwkQUZvKS8wZjZVaURubyo1OFVObDFqJT91QDcoLlRebT0tLW9INzI9JXBXP1RAImkvQ05PKyYmJ11LdDhETk9kRS1xVEE1Oy9dN0c/MlFkI0lgSWlCPCotVik9WXJiIzNHLUBpL1w6NDREKV1ORnVvXWhgOGNZVnNRSWFPUEE2UnIkODxFMSdhQGc4TFhoZ1lJOE1YIT1BXE8tYTpOJSxxK2g+LF4+R245OC9PVjpZNjR0L19KXjErcFdnUiFsIWxkIy4rJklyVnFITC5lOzdySz5pQCo/VlNHO1NhQ2U/algwb0NlSE9lIWIiWjkwSSU+YzhdQ1hrbEloYDsiSHJfK25xcVE6VDZQKykqbTl1UzlePiQ9Zis3OCwiNzNKRFZbIm8hSD9Lc1MzSW5TKD5pdS88RkBPWkldW24tZzRpbEEnQDU6SWJKL1k3WURlU19qbnVoXlpXZj1oQjdJTCkvXnJWL1NaNWckQysuI1BwWGpfV1I3RHMxWnRkYzRCbEpxPWVMSytNNUBjKzo+JWJQR0RaVCpwcVROJEZHIl50Pmc5QklSUz05YmtyZig0WHEwcjUyNCcxKEFiYkMsTiRJcWFBZ21FKFhQKj0sLkE3WVRqVHJnN2oudVVtXkMxWGtqRVJuajZka1dNIl03LG02SF9LY2tjKVlvOEtjalU/cE0+PnFqOFRrUDdiUEpia1JRWWkoS0wvLTh0PVdmYnUtOWQ6TyxUKC0tclFEQFU8XGlUJSRUNU4yVFxQUG5PN0g9TkFzNC9IWyRaa09jRHNoPDktZCgmXmVZbCZBXkFxXDsxVTtDRTBaLWphZnAxP2E6W0BuNSooXUBXJTMwVzhbPnIzNmUkU05hU0omPDhfWlY3QiRLY0xKZnFgcVJlIj0hKGF1Z1gqVzxgXCY8cGdYTWVdP11OW2ckRlA8Qz81OmNCLS9sTUBScmJtIjgjNG9taSMmO2BEJFUsIz86Q2k7QnVOZkchRSdAL2duOjlDW1UpMl1GOzdlVlwwPWNqREo0Tl0oP2JDaGkyNDhhOFhfODFFMlE3UjVFSFlhYmpKKCZgV3JbdGZrck1tRERmU05OZytjITQjOk83X2FlVl9QVURIMFY7ZUxVJW8sbU82S0wiIzlpPXIsJVJsVG8lWzcqUTtEJVYjTk8tQGwhNGRaZ1kiPjgiJGZaJXFbU0JaU0hzVTEhYT5eKW5tZyhsPiIxTmxPUUN0IlJXNyxDWy9xPGkmRShmTiZUJTVjKz5cOV8mU185PEhsTTkkO3E6L11xRk1kakdFO1NOdEY0M0tCUzw2b1ZUL250RE9vc0NwakE2QmlARmpJaT00cFpScHEiIiE3PmcpS1xgTVY2PDdPQSY9Mj9jZnBQZTxJWU5uWTolZ20tRmhyak0qZEkjdSoyPXEyZDdqV1hVKSo8IlREMD1eLkMzZF5rXi9LYzVtXzZBU2hQZGE3Qi9bc1E+TT85bTE4L0RZPE5oUik9SypdZjokPDhDXjdhR0ZYZlxeYlYxVC1BJzc5UVw9LUB0Xm5HOFNNNzlQV3JMYiowVEk2TyxmQilGczsnOzpYMTkkNCQtLiZUSXBNPGFgdUUkTG1gS0hoOmw7aCxmaFlOPDEqIUhHXFJXbCVRU0Aua3UsLUpwcGZdTnBlUXA9RSdMRlsiLjgjW11OY0RPVEkkMklwXEgwQWxRZ0lMVTJPRlA8P14jRXMuRy5kPjhlIV8sQShbTmMrSC8uUFs4NipZZ1lvTiRyNi5RV2Q5XEZvN2VNMGMuLFMvaG8vMFRmRGxkRmxyLTNLOFltOChUXTckI3FuNG0zXjY/TkYxdD8yPFc1VnEzcTprNF5ZMlNxVkMrcklhXzxhLCduMDQydWE/JGglRl1kSEBGPVtcbGZdWG9SI0VpSDp0QnAyOSI/UD4hYklSKS5gVWxncUY1OFVjZVxbaG9fcD0rT1skXjonakFJI0wtXTIjcmRpXi4tNDwqI19ZNDFTK0NyTzIoWkIyPEdzaDwjclpUUlZgNk1FYigvNS1gcD9rZkZrYigkPyMtPT5DRUw0I1tKOHNzJlZtaidbI0Y2TT1zVS8rRm8lPy1YLV42RnBDXEJqUCFeYmBqJy9FNihmQiFobCk/MUJSWVIvR109anU2SFtgY0omKl1SMWtPUVhhXTRcOUwzY3NWVkw6YyRFaG03TGc0XjIqdVkmMFtgRlxrTHFaIUhuSUchRy1yWi8xIiJwPUwnRFdUO0R1L3JGOj9GJFI4SiVOaF1jbEFXT1VcPUNnVEBbLTVDZ3RsQjFyQHVdO0p0WWRCN0xhNWByZl9NTD1gYUo/LkZgSl8tZ1Y0Wl0pRmxAYEVRZS4scCQuW0A0Y0xiRiwqVTZEKFdfcipab11La1AuWk5jWmlASjZURkw9NlVPa19UaWgsRmZMUVJdJGZBPUBUbjZHVV9sSm4wK1VQJmA3Kjhvc10sZ1FEX3MjIi4yY0s1M3FwImYwTmFHaydxWEVqYSdGPEVfJVFCKDJjN1txO01OLSReSj8iR29aOFEiNyhuJmFecUBdV2U6KUoqPiVGPCFwQVF0Wk0+cDU7M1ouSDFFRzFjUkVdOy9WZjZWZ2U1a2RuU041cjs/dTNvdEgnRUpfVHUxUSlhUCloPkxrJWskQGRdJy06TExuYldUSnQhUEpqSzsuMz8uTk45KW9vX1hoS18vXVg1QEp1X0A8KDNlS3JScSxHJVc+QSlcPSljXCVoTDQyOmM/bUNPRF1QNjY8Xkw+KnJLLEBWN1RQZ2BROz02R04zaClSS2kyaS1EUyJmckcpZGtYcUNLS3RiMCM1TmVBJWczI0JbY0ddQF1DWUZIQ3RbdU9yOlYxM1oxL00pMDNeRiNbXFpuXEc+LV0nV2NlP2FPYUVCKTM0LEZtOVpzbCRBT1RKL0hhLnA/OCgvSXQicUBdV1hHXlBDPG1JJ21cNDxNU0ZpQlQmajFGSzYpY1JYRkgldHNObWI5R1thSGReYUdJP21DNUElc2kwYUJWXWdxQG4tcU1wRDI+TyRQLU1ZS01dPz9JTEllKWRJXkRUV1xeSlNkQDJjRChPJmNvPnFQa2ZwWVpCTGRTT0suJXNqK09bcik/ZDQiayhyK3M5IkZdKVE4amssLD4yISlTR3VBb0o8VCk7TSFUOTddTyQsYlNDNkc1OiQjIUFGOmJrPVciPGgiPVRTXl9vcGgza0hCSHI5Tz1bPnREUlI8Jzc7ZGdPNjFBaC0pYEQkJkRLWj9QQ2JSQTpKOEdJUVovKTF1UEZPdXA4NSYpb0kpJFg3dWRDXkE6QWJbJWMtZUxGYz5iLWBYJTMvRSMsR1VoYUJMY141UjIwMCpUdFUhRktTR1osM0FlJFVkMWlxamAzdGFbJFw/cnFiYkU/UzJHdGxBI0BTIjBuTDIlWyY3I0pAMHVTWyEwZUE6QipeQ2Y+T01cUWZLW2FsOjooTSVUP1pXK2dOLFpxWTZpUSIxXy1yT1FcNWs0LCkyNXQzOEU9SD0vISg8LCpbO1BXWCtzI0I9PmwuT1A5ZV4lI3RdXldzLllFVVVpMENjJydFIUs0bixLJ19VXiE1KD1bblsjVG0qMjItQztnXDIsMFo1b3QsdFA8Il10IUxRVFUtOjdUISREZz9RWjVnSE8jWTBAQkkyZWxzMUxTV1pVakpjbTtQVWpcUl1JWW5MaSsxbkNHXzBJZm9UK2ptX2NHZGR0YWgmU0o6MW4mQ0MnIVFdMnUlQFMmLlYmNyoxK0pqN1E4YllCYkRCakJGdWhDLnBuR0M5QHFgVDI1aHI8cExwQS8wXShlKEgiLWMqJCwvPCJyO3QkWFBMP0E7VnFlXUVJIXMhLGMkUV8yU29oRTZGQStxNDJKZ3JKRVw8SEdgP2BFTVU9V2EvSmhVX2c0Z0I8UCtdN2VeZmwhZ0Q4PCw9PlA5b1xDLlpmRyQrZS5cZztKPChcRmBSYF9MQkJnSE44XENlckMpL1gpTXNYWGoldSlnW2pQU2lfMkNSYDdjSkkyaEtuTEEiSjZvXmUoW09CXjxtZXUoOixZVUpFOUUuWDliJ2QpSEM7X0M7Lkg5bjdQRU9cSTBkUC1AKkJOTEVySzdaMFczQlgjbGFPamUvN0FYXDwlSzBTI2YiKC4+V0huIitmSmBCJ2RWLixYJFc9Ok9WLnNzOlh1SCtVTSZuLiFrVi5nKzQ5RDErQ11wbkVuPk1KKlY5ci4uJ3FQUzhUaSIxZjFtLWZlRSEmbCsmY2I9VClodHNZNkl0K11jQklMay90UFFUIlVSWlM6aVZub2k+R3FQIjE8XUFMX0dNXFBISVpHJ2ZTUUlNXiNISCElU0xyYVB1VkVka21WUEliKz5HQnUiPS0rdUlOPiM+USQ9KlY5XFghVkVUbiovLiQoZ3AySk0jXT9AZTxKKTYhJFhzN01GUlpQMVxBYSQjYkZVPS1mV0dRLyVCM2VnOGYjNVBcLmhYIU9uZk4sMUQ9MSlLbj0+Jlw5VzFNInBdZmZmZWhwLzU6LWJpNidQY082KExMcS5nUk1WcVM5Lk4qO0M/K2NMKDd1IWgrV2VjcE1uRVhDJGFQXFApImZOYU1TVSxpNGY6KXRZRFNfW1dhcmRjOkJHJD50JkdvRlE+IyFZLipCKjVOJ2pdV10zXjloKV1PWGh0Vjk1LzdVS0wxSE9IImw0QUFtWShqODVsVXV1JXU4bWY8ZUQ/I0NvPEYhRk42OE9jRjohbW1GRGNOXk4nLURfcC0tcTI7P0BcYGdTdE5lcCMxSGYnLFkuJ3RzbDI6aTlbLCFuaGdKOEZZYjZTakwnJGQtZiNgcVo6clUpdS08KidVTT5bMzouayo8dU1nU1UxQ01aW0ZBaSxXOlk1Vik4KitebSJoKjxwQl1HN1YhJFVCMURWcTMqYUlPKVVHWnVNZ3RHS29hJlUwdWw7RGcpTic4MklOTERvQD5FOkolaiJVL0lqXCMrPWxpP0tyMEZoNHNtMUxkPlhRbmcjXFpFRG5HMzdlRTBaKVBnRS9QcjklV1wtaC5aQzNLIlo4USVDL3BsZWRIVV0xRTRfaCFjc29jOEgvO2Q0K3NAPUIxQ2M+SCsqXG07TEdoZkJnbDJQSUZHJD03YGhrdCc7W1pjUjVXa0Q6NSxPPDY9L3JeJ1YxVjRvITxGRT9aYE9mMjFpcTFoMmo8SzYpQklETUswWSEwQHEqKW0pUi1nRjhkJjE/MW9qSCo3VkNrI2glIW1VIjZzYnBbSjIzInJqXG5XN1kwXC5fakAqa1VeS0MqOV0uVVAhPCpAcyZaX0AnZFJNXChtWGk0YDVSTDxoNSlFYT9kSFI7KCRyKktEQ2dnTC8sSiRNV2tVcm88TSdZdVJGcDBdUVQlOm40WDJULENPUVRgNS41XHJxVVRrYE8hZzI4bXFwQDohJj1nLiFaXzVuIitQW3VqLjJHVnFKLVotOk1QaGIrTSw2LmUvKiwtRSNkakBgYGcpQS47JW5rQ1ctXyhrblFMSzElQEZfWFhLUFd1NS9VQnBAZC1pTUpySFJMaiVCVzlYLEg3PD1RT1g2JyUsaig5WzEtUjcxLTRaNkstWThCPStYK15IaW9fUk9tMUUhIlRUZj0iNG02YDdwOUhoKDdGXmRHXFtMSnNbUF5eNyc8UFVVcDoxKnBoImpRLCoqT19fJlViRm91VkkyUiNiOUtwJydobWNwWytbdHMpUVlWK0hAJCUjJDo7JiE8QTpmZ2RSQml0MkByY3FLZTEhIXMtJ1dYbWkkc1BaL2QoaVBVMV9hW0g1UCExQGlTLC4xbWQpQFpdbE0zMDtMYyxhUlElIU45aDRUKEw3RlZVLEFLMGdQX0U7XW9yaz5JJE1tU1UiXjFNTSE5Nz9uTkdNJWpdLFR1Y19VVEpZNztpPmdkTGZzRVczZFlIPjpPdSJKJGBrNSE4V2I0XjJTXjtfZyMsMCxtJE51OGVjamlVTW5IKzhyZFlFPCtzTWNXJ1suY1EqK2dXWWBCMyNaI1cpaUtJLlAwQk9tZ0JuaUBsYm9xYkV1U2YyZ3MsbzI8RExMNmVpJ0BdIyVmLCtbMSI2bW1AOiFkL2JxUDJvRGdxc1Q3UVtpOzwrIUslcV91XyhaKCNgLT9zIlNESiIycSxkLipraj5YO1BSaiY1ZkRGa2QxRjlbSyYkVS8/TTk7XS1gXj83NjJWTCczSWxVNixcI1pONVI/LHEtQUI3Py8sY1hsaUQmXCZZNlI8VzNgLnIyKVNCQWRCXDo3TzxXbj48UUxtKy01TXRGWVxfWmMwVy4xRlRuMVZvTk1KOjAwWEo5Q1s5PUNbRDFEWmkmNF5ndC1HSyxsPXJgdSpcamxPPUcxYFFxRTMyMDlCOmZpLFE3Z3E/a1xQQEM/bk4sPjFvRixeTSxjRig2QFIxQGVGJiVhRm8nJU1nVzRuRHBgdHNHK0YmIkc9XlNHYEEqOzh0OD43SmVvXWdXJ2grJ0FwRy4jTSlsdFZyM0VNLCI4N05DN2FAQ1k5OmUxQ0BwRE9CNmsnQkhlSSdkXlAuMzBaQS1kcF04Jzk2SWE1Il5fRGNWIV1HS2g5R0A7W0ROTlI2PDQ0QG1sVUsiLyp1bXI0WUQ1KC9DWk1ocFxJPicxSXEpPyRIbGJEKjg4L1BuJmM3NmEtQEJhXVg9U2ldMm1HO106bylKVk09ZmFyJ0lUNEU4VS9SalRCKmgvaC4vR0Y2KXRVWzxdc0xTIU08O1g2TlJJOl9oKz4nN2osYykhcmxpUGxmMGxNXnMoKz1xI2YtZiVENVJcRDpocy4nalBaKjxCLF0qa0wrJEIzbi51LUkuJEhcPkEkTjE7cnBRbDNrU0Jvb3RiVVNVQW9RIWo9THQsO2ZXLCtcZjxpZ1UhKDA8ZUhyNHApPEJvamc3SDohZlRyZDdxYERrKUMoXCZMPE1SaiFtMUwuXSc/LDo0OWVcIjhFaDoqLCk1VD1OaGEqTztzUi0/SnNFNSFGQEdCWHFMbWJlNlZMVj5uSEQxPzlHO0MvXVk9JVJuSDk6SVViMlgmI2dqaG1nJys1XiJ1I1RsbWMyW1lXXkBVdVNFJlVdNF5PL2tUaTNtJjYjVS9VSGRjQjhrb0lPSS01ZVowNidyN0dGW2dVMCZvSGBcaXJKVStQPmFzSyI6MFhKY1tyalYsJTFTZ2xASU1zQE9bSEtDRlUkVzdmZmkrVU4pNSwwXGcwRWpdUURSZyckS084TzsxLi1oWzZWWGo3XDIlXWE7LilJNjdQZG5lQC8iUUlyWDAmNCZhPz0wQEVrVVVuaFVLTnIiXmZyKSFkPSRzWF8uXnJCTmNtL2g0cS4kKj5pXGskMCRxOi8wVy9VTUtXI2h0bzBUb1BbX10uXDw8VG1kZWtZOG5OMzskKnBnYXRERVhaXmJwYEJgWSFFKUAqIjErNGkhcnQ5bDU/cUxPY21ALmMvNyZEZDdJXUdRRTZDXi8uPXRiUV5eWWFDP1s7RWMuJWcxbm5CUkVkLm89Y1gsa0FXIUVuO24yRlFfP3EkUmFNbGpuYSVIRk46Ml80V1ZFWUhCbzxMbSl1OkA/ZUA7VGY4PzhNTWxDU1tqL1JBNi5pL190V3RQIy9hXmIwOjJEOl0sQSk2TUFAdSdpLCpfciQ7O1ByN25fQVU4QUBTQTVWV01tTkdVI2xJQ14nU1xJKXFpcmQ4YT1QOWg0XV1pIihZMTE8U0lDWEUvWFQjKlV0Rms6IURoVV0oTGJkbTFFQEchZmpHT09CVSppIjUiaSsxcjRFbD0yQz1QUjhZRDlaSDBrKE4ja2gqREoxVmojalw2Jk5DVUBTSmhWbVpdVEt1c0UhJDFJNGROWmwyQkhcc2tqI25LJHJiUT0/Sk1uVWgzSlpJR1s4aGBWM1xna1UzYyFLZy5fU1xhSkFCQk5ZMkBcJmJLPF0uImFGJVBLOC4jaDRVNFlNKEMiRy5TPSo5bFxnM1FQSTYkaW9lI0c4bmBgaV01dUJKXW9MNUksTlY4VzZbJyYqYjRwZG08LUYkRnBcai5fYVRqaVpgU08kUiRjQVE1OyE5UGNCRFdsOEpjdD5yIWJkc10tK2dXVyRBbGVkZEtgYnUrPXI+c184aUdJP1luYFdcIj81XyJLSmNzUVhhbkE8WTY7SkVbMCFdcFZOWD0nXXFtO3VrZTordSM/UEJmO2tMMik4OiFrNSJ1ZjZmYF1qUmAlQUlkak47JGw+IU4xSDNUUkFvNTUyLHMwZV9nWF1LJmMwPUtsLzEjXEM5JSovMyRnVTclOmhLJ2hxJUhYMCVyOE0ldGNLN15pNWkuXm9EWHEnWkVqSnI8SigyVFo6JVhlXSQoWEs1JEg+Sik3K0dZc1s7XHQ5XGlVYGVNVGlKK0MxNSM7WGwsSHA3MVNmSDtGWTM2SSUzY0ZZUVNeWz43KTtkS1QlaUNuNVg4J1JPKXM6I19ULSNhPShmdFpqcy4kTXBdYUZvJlRQRVcpUUxUJG8lYStDKyIzVFteWmhrY3VoUltGb0tPLlooRyknSyJXakghLEkwJUtbNmImJUdHOVEyXGQ7R1JnTlNZZjROPFxpNTZXdEBSOmk6YTAnK08jZygwMSIzMFFyQFxuYHAiZjlzWyEqLDdEPzRAQUBQRF4tajEuVkpcPixsViI4RzxmIlgmTSZASk4qMmchcFRNWkoiVVtoPSFDc2BbJlxAVSUxV007bWxfP0VVNSwoV2NMRSlHRjpKT0A3ZE86VklyVTciPlJbbV9RVUoyaVdeQXVBUV5vTGBubzxFa1NRSGtVMUgzLFBvcTFYajRcYzhCNjZGdDJuYWVZSiFSNEwtaFM3bFFRQEQ8bjZdKi5OS0o0RE1hXD0rSHFGOzFZJXBxNyV0RCRCbXE7K0FnZG5EMG5lMSVdOjJSJDUlbHM3NS8iO0gtcCMxM0dsYV1kcSsqL284TCRrL1ErZV5LUWYrIlRjN3NxaUFmTm1BaU5ySmduWlUjbCEqTDk9YywlWitxPWkwJ1MsPTYqVk80cjVdMDpqaztgLC8pLXJObEdYOW4ybC1fPjlZaXFuQkFGPippUk09XCdRby5Ub14oKVQpMlAmSCRuQmMzSiUxQGZmTWpANyQpO2wkIl9jZz0iX25oSGM+azhIQHFrLSYvZjEkYiRTYTMiMnBZYyNGKlxoTTghTXAsNFxjYFAyaygqMGpHKEpkM2RNPD9CLFsnLk8xTFZqI1gwUV9EUlslYi1ZXltiXjArQmsoa2ROISwsTzw4Z0lVKVNNNzVbdXVVVDQ/JVBkMyc5W0lXWCZiPGA5NixpNCZmS3I+aiU1RFNnbE1XJDxXL1luWVpHSGZHczNbPD5DakBSJS9YO1M5bV9zIjNDOXRecWU1MiFyaENJVy9DM09sQkEzLjRXdWIvKEwhXUIpSnByL3RiP2EqK3FOKmAqX1NxOlQ4aGhtbVhLbWUlZ1YvMC5ucylLSWYrMjw7LCo9T1FOVGdgXUE5X3BmT2ZFV1BVRCQ+Lmk4Mm8sdCZgJlleODJfW25yXUN1ZnRRKS5ZJFJvV01WSGJwNHBJJlloNyRrLDA2N2k2KGhCSWNRZidCUmNeKWozJz8mYWIwP1ohUjkpXVcrJS9AN1w2XyQvQHNXa2ZNSDhKQCNJPmFcM0U5ImEqNEEuWVRtISdUdSxvL2R1XU9pO2BycVZ1ZWBsYDhQQUk+Z2ltKiUibWloI2g1N3I3dDdhY0ZQTGlOVi8paFo8VCNvZCJTI2R0XHRtYDlfV2w6UlZpQEhaM2ElaD4na2lvPWsyckZpLktXKFssVkUiUihNTzxsW1AuYkUsQm9UbCNhLy5GUy81P0UsOT5MJEdoYSM4XD9PcFghZEU5Zj1eMEhFNFthIWE9UFVodEZVOGIrUC9cYTEmanFgMl5lVFJVQHFzLD5LUW5KMzRJP2xqQmdBaFRuRTwnXFxAMzlxZWh1JzprLSUvc0xYRlpaUjxYW2IoNEA0dDIvPW9dOD0xUSUyJ0tsXls0dFxyKTNUZzBlYUtLTzUlWywuQENEOmBQNmRUcUdkKChjMUo8PkE5XT9OcDtwaV1iVzQwQFhmJD91KnAsOj4iUV1dMzRcPlNndCs7Z0w+RTAhNy02V1ouU01rZWJjVUk+aWliWGM/MUIsR19HUVIhY2kzP1hRa1c+KEJEJigrSCdGWTJrQ2cuWmYrSSNIbjtgMl1tSzJpVmJVODhwP2xEVlEsXEBYPl9kQCdTVm0pS2JGUFQzWV0+cFApTSFPP2JdQEdGbi8xYzRgV2NvMG1jay1ALDBVK2tjIyhmJjdzLzhvOFUiNGtPJV43N0dgPWMjWlJNZ2pBazZnNGBKOypTTlZuZERWMUxCMlgodHE6Vk9MTFxJTD5mNFhQWTNfXjM+Uz5bKltkbGtrWj02J1IzKDwkY2RDTCcwKldoWlwsbUdgbEMnIzJtQWRMc09wJ1xfUm80PF8pbF5fcm5RMCVULkI8QiRmWkhdWDchK1U4bHQ8OmpeUkArMVZPK2kjI1olKkFMOTAzNk43Y1FLVTZQI11jYSspV01hVC4tY0VwbURZKVlzK0NRTGU7KlMxX0xJXUFzQSJ0Xm8xc2o/UDlKXy1GLG80QmxWK0ZnV15RYW4+c11tTjdmSWMlJCslPGlQSjA5VlVdR28sLHFaNl89Sk5ZKjBSIlMyRVNwIlcsQS9mYlFlUUxHdDkhTzgvc0R0Nm1hTmgvS2JRMFFdMjxlK2BaOixkTVRyLGUnLykjWnNdRUdgYGwwJWMtNFBFaSVTJXEoNTknRVYlSS9QWUBJcEVKSko0aFBgaDUhOGYvcT1TN2oqK04iJFZEWUY1KllTQ2ZaOSFcKTl1SjpfO0ZuMC0rJTdoKXNRS2FfVGo1IWs+OmIvZHU0PzY4LF9YVispUCwmT1NyQWAuYTQoZXQ2byxfYVtORTJNL1s7QEguTTBHImwwJzhXKSMkNzs3YEAkNDJuMktPVU1FMklXK0ZLOjw3aDNqTURfUFw1IiR1UDotUy8qLz5FWnBALWQmcjdOTj4zPSVNX2RZZyJkPE47ODdsIjkwalg6RVRmUyQ+KUcvWGI0dUw2OCc0K15xPUQwIyY3KzVsWmVTY2E6KWZATjsxLG9hZ0ozIzVzXyQpQFQjUE1hYDc0RUoxM2g6MSVaSFt0S2FiRkJzTilqckJKSTM8WT9BZUYpLGZhdSooaGtbVEtJNWRoJlMvNCQkWzVmZydgPHBUPUhPYmMwMWRsN1VmZSdWSHNSI1Y+JC1lbThZMEYqYlRiRk03M1k9P0BeVCZtJk4vNm5KMVVJJidDVz83PzYmIU0lJSNtKlwuLCNDJ1olWi49V0QnIU4jWktUYU5VQUhQYCRSdGIyRlIhS0NEIUExMiM3dG5JYF09NClhJTpSJEkkNFQvSVI0NDtEQVQwSlNJcy80TTFTaSRhTnQvPCVLaF82bkQ1Z1FbQHVrL09eRVRAZGlOcyRzU2VtNjhCJTYpQiY2JW88PEs5MSYxUm8jZHV0IzBPWmFoJmhyMStdZ0xtWyFTQCJEZVNgb2BqWnIrMnJtVFBrNT5uQ1QrKlwnXmw8Rk8kKGMlLzQvLiVkPUZpU19CJ25qdTZjVGAxbHMmJWpxdSIlSjRKbGg7aUpFMmhGMm4kUXA8L2phWkpPXGRQYSJXSURqbW4/PzxwRG4qXSdKYGg8UUZBKUFjVTMrYEM8ImFJXTRvTyZIYDQ0Ulo7Zlt1WVdkLjVkX3FBJCIvJjNGMDtXamNwc09CNTMpdF9SYG9cUFRWZ1ghTl0tZiNzYnUzPFZNLHBfRTNLRzZJLVlLSUdwSydHR1hkbSdgWCI/NWJSdU1yMF5JZlEvbjRZVWQnSzQlJVAzWEg0PScyP1EzVzo9QCZgMjMlXCZjKzgvPkBgcTZvXGZ1M2pEKDJSLihmJEw8W0BFXlgpZD5IVlpXLVlZO2AiP2I2NGF1Q3BCcWxUWCNRMUJjWkBTKyEhc1ZAT2loWFc6OkU4LClFY1hzI24lcFc1TEBHRXM3MiNETixBWDNhJSVdQG9FKGBpQEYpLFhBVWNxTClyPkptcEtedWRrLiNoMVdXcGlIODgyYSFbP2lsOScmP1tAc2U6MTs7ajI8KnBgSGA0LUtMP1pQNlk9YiEzZV8iO0M3NkotYDo+LFUrJWpOLiMrUGVbQVdoKHNDZjIkW29fOyxvN2NiWkM0U2JTLm89JD9BMTovdCsmNWpDM1wiTUgjLiJTTFcjdGRmdEViZSQ4RjhxRU9ub1RnZE9kSXVRYFg/blNrUSkmcWxVRWNIUnM3LGI3Ujo5PTYxc0klVC5tJGBeclVpQWlELWNmPidiLGxYRGFsQilPXEV0N1RQJ0BjQUs9Yicsb1JPZWA8IiwlK2FLNUxYMEEpO3NDWlonIilsUVlTa247I0NIW2pYNCVKdDkybDxoJz9MaC0yYD5tMmkvTU5NQ3FbTiFfZWxPS1s0ciJhayNnPnAubGBsZjhKSiVjIlkjZ3NFaTlHQnFtT2BrKEczcVNUWGUlQVI9WmsxXGs3IWFWRy0yMkMzMW9lJjxgXzcsLSVnSUUzbDhCOE11SnQyNSZwY2MibXQ3L2VkaGVnMVpAJGs4MS9pQXJYQ2I1ZmAvTSZNJzFYWCI5SCdnKmZmQVFBZiFlJU1MKkRrO1ZAN0RFJ2IiX1Q4XWRxdFgyMG1aJ2IwN3M3SydwbmlNaD42anNlO081akZBbDM9OCUkVDsram1ZPWBlZDJGXlZpMiEhQT5gJ2UxK1NgL0ViUmhLV0ZNcj8yY21HcmVrTVlzVytGXEVNOjczPEMyK1NGSHBFUzJLKDAyKEQtVytkWXMiWkpeIlQySz1CazptNDYjIiVJKktwcF9kKms8akZ0XjBGQDlwaExfQ04tOnREXFVZYkkiclxmSD9gKVU4TCRVY1RBTERsR0FHT0dPPC9vRFQ6PyNncEAnKzZwamxdPFNNJGFWRj0/KjxqRkFfTSZGTD0sdV1RYGJfL0NJR2E7cjRqLHNxSUpjVFpPJ1hjP0daOV9oVERWNWQ7NHRMJWpRdGEzOWw4Rjc1LTAwMV9xZio0YTdrYk9MMVRnVjQxVGlQSk9dX0NmP0g8PCNcKShhPiFaYVJYJSNAXFRgZjduI2MhJj1aXzxhbTIrVGUxY3Vcc3ExcyRFLW0rdVxpSCQ2WUhTKWdpM21TalVkMSYoRXIpXUVDQVJfZjVrUWlQOjAwOUAuKE5JVWBZaywnOkgiOXFqczElNU8lKWljLGQxIk9XMFNWRjRmSyFeT1pkSGcvaEFQWUxxbEtZMlVCVEhFYkdsI2dxYHQob2RkK190Yik5YidvXTdVPD4mOkYyQjQkJnJxXXJSb04zMVluaVpvYVE1O2dITkNmbTdrJ1QiS0VxSy1zXC4pVmNoRkEnSXNRN140LyltbFJjR09VRjYnVEErYlRkZThHS0QwdGQzYzNII2s1Ql5MW0k3KEUtMSJqP29QZWI7Ny8zS09rWVFpT0hiKFMjVSs7NXRmOCo3NiNlJ0ZXQ2djVFMsZV1kJnUiTi8pN1g1cnIzR01ea2lxODBTK2p1Ty9FQW9WOkdMaEROJUs/WmxiX08tWFxWcDlFSXJUKjclJiUiS0dAYGFcNkRTQzpmajFbVGZlNVUiM1khPiMlR20vcXUuJEZvKUNjY3VhcTxUISRURl1MPywjXzFZY19KYyxSZVA9MmZna2VGYW9PNVZZdUBgVWoyUio6LD5WWlFeTEgiIzsvck0lVihDJl86OWcycSl1JmEqSnMhQkRxJStvJ0hhY1txbkRvYSw0L1l0L1gmM3NVR207NFhSU0NbcFQzQWQ4Z0NoN1sjJnBuJ1pBI1lfSHMxVDRgSWZQbDA6ZVBabUBhXFo1Ll4qYzlDbmFmWkxsJ3U7ZXJ0TiwqYmMuMWAxKkkoV2RqXWVPKEEwMnMnJU9bdUc6akJCR1FpOicoJS9PUmYxWiU5TGxXXGJHIyVjQF1TUDFKbW1FVls3RnQtbSdsKUE8Qk5rQGk5SG8jT1RWWyR0akQ4Ki1VWVZRSEwoRzRga1xfVUs5TjA0Wk1RV0EkYEAlXSgiWEwuNUE7SjlmRCNrTT1abWVvanFSW15jaUwiTyk3KyhCMUhzJUJPcktTQ1ByZzhgTmImQlE5OUQ+NmRzLTVUW0txXlJtZWJjUTdIQUJUbV9qVzhOVXAkQjwzV2skNjRBRGckSWFTZjNeYldpZU5TdDMuSDdsS2hEWnJTRFgvI19acnIsaDduNnUpUyNISl5TYjZxMEpPMjtmdGsxalBfczVBK2xVQFtndHRRdCReMiRhUyZhWVpxQDJSbztONFJIJ0dGPCsmPExhVyJ1VVkyRiRMdCxoT2xyNiJSJls2cThjYlk9KU9JYGwzZG9JJ1wzWVguMU0jSFRUIipXYVknNC9fai1PRENZIk1NWj8wJlslWCkmZGVhWU5HWDFBTmRiMTVPYTdXImFNWFpAU2hLRUYrMWJCaXBRPnJYTlQ8RC0zYFcsOk1DSmJyTUVtJERMJypmdEkzcDRYYWc8cyUxNDAjLVRVbmsnQ2VrJVNjYkEwJjROLEtAbl1SLms4U2RLcWlUKXQrK0FYdFU2UDolQzpBWilXNz8hUXU3cFEjLEtyRkBFX3FeKDkjR1UsalsiMHNVaE9EKkZLM10+K1dgRjc4MlVRWiZLTkFlXSQnVWdSR2JVYCdCLiFBaytgPXBRX2kxV3MpR2FFSGd0VkZONmk0YF47bDheNVlTXXJDX1lWNUtDIVw6L19LVj5LI0lNWmxEYCU2MHA7RTJDc1pII2pwU0ViM2t1NGM7XCU2a09TRUpYSUtjaSs5O2xtISVqQE9wQCZuYktiOEtFQEcwJG9TV0c1JFYrNmZccCRhM1w+JSxgRkBlWl1UPlRnUWZRMi00MWVYVl5aWD4ydF5lJDprKC9EWVU/UmNeYC02a0RsTjcvS10pZzpWO0drTCUnajJaPCouPzpdWkMhPVZbSyUkPDJuIiZpQT5bQkwzQ2hYWj5UcmdSKFFHRmdZRW44bS9STm5eayprZiIicERrSms6ISlkKDo5SkU6M0g5JCdvOGRjS1xwJj5UTT8oSUk3UmpcZk4uaXNlP2ViVldVTUcnbD8wNjdON2Mla2xQSyZSUjUoLWwlOkcsQ2trLyxwMUZubV8zM0pSOGZuPiIlWSsxXSpvZzVPRTlCKldOXC1tJ2lUJ1dWRkkkKkJlPWtxcElBMD9GUXIpRkJLaj5sKkJUMiQ4VU1WZTJjMFdVdVZbakxMMnQqa25xI2tgQjguRVdGbEM8bDBbQmVrK3RpY1J1cVxDIWslVE5LWThESUIjJWEoNyhLJFlOPF9uUUNePCNWNT9ZVmJwZCRJQSVcR2wzNT0/c3A6ZVojL2hSLmdSbUMxVCk4WEhVQmUodWY5WiVDRVkudCJuUjt1LCFqLTtIPC1fMXVyJy49Sl86KGZSPkJNNFwzUEpDWHRgU2pNJm8+KCJBazguS1RJKktyUkEjSGN0W1M3OUxnIV1jaWFVKyM4PidBNiM3M1JNYzhdakYsN2JXTCJOaFFERFQvYT1JbEVNJz0iWyhRZSFzWmM/YmpgUXJvb2ptcGk5JFRyVnFSdEAnNFhiVyI5c285VWhCWSMxIlMlWmgwJGIjOjtLNlopZ09ZMSpjNmw9U2lHUExoaT5HNEtzb3UtSGFkbVFCRlwqSylOPGVgaVNJXj9mdUFBOkVWMVs/RzNkRVBKLEFyK0w3OmJUIjVNNjZVKiReV2tyJU5FPUVAa1lBVG9aKGxJVEJeSGFKcmM7PDAicWpVJlhAaD9WVVtDMGZkRnBnXitfLEM8KTJMM2ZjTFYsRl83Py8pZV9TMkdMZUAyTj84V21AcylrI1JhOy5rOSlVSFVocURlTGFSbkhoU3AtM1AnRU8/ZyNDVGdEM0tocFdnZ3BJYkREXkNpcV5ROV0qcSk0LWlUWSojUzVyV29DOUY2QHRCPC45XW5cLSIjXDo0czVrY2N0NjErUyppWkVOV0lmbWVQRmxTSmgnci5nIjJqIyREOi8xcGU0OjdUdDdxW3BQMF1mVklaQDRXRj51Rj9SI3UnbTI+bERXT15KSjJSIk9iOC11OGlDPl82X1twa2xKQ25qT1AjWSk+UUxLRENSSEgySU9bKUc6LGwiOEFeZ1RAXyNpcGI3NTd1dG5XXjM7VlUyUF5waV0mXyRJZlRKI0lgSSRgMEcnTiE4NS9mS246I2RYYypWVXRKXS9SLFxJOmdVZHA+M1MoLE8lYkxpWGZSKm0qKSJuKl43O2U8KmBIWylcYFcpUCFyZ19kVW5pYSNnO0NtQ151OGI5RzBNSS5BU0llYiJqMXVCJWkwLChsOSxSbTI1ZkM2VkVsZ2BdLjBMJCwrQihPMk9OJGFmIlF0cmtkMkNEMm1XbzlfV2U/UkdrNkNUcW1XLkkhRmN1TzAibTBaVmplJEJkMU9BOyQqPWgmblIqakNWUD05ZEN0ViMzNmhsLiknS0FnYFw7RyNsYGdpQDoqKlouKVxPbUZOM2U4SC8jb2JFRHUuO0Q2LWwwbTNIdDBeTihXOFE+Py1PS19NKCFfY0hZV08mXT9ANSw2RDZxUmkpQjBtOXM3LWwwRTtAO205LE5eYClvX0RgbXA0X09WV01TNGs4RjBsNVtxbGVNOkJHTzAkYUg+T0dRU24xYklNQzonPjAtJFZdYDQ5SFtCKy04L2RCa2NwQjpySWBQJjEnS3AuN0owXkxrTmxFPC8tMkUoX1JLQXI3JUREISk5YjUnOyZCS15pJlNjQzBXMk8jbUlgNClJQzFQQHMlNl09MVdEZyVATUNCUl91Ly0pai1qbFVbLkMib25ocVtrSjtEMStudSVKKiNKRjkuL2xvWUBLcmFQI2RkY0E3LTZBZ1FXYHE6Ryc+JUh1JHBQM2ZYZS5DXVpebEtPYzFPMmdZO0BaOmpyO1hpdDpWJStyRjcnQzJzVlo2ZyYxSEx1YidCQ0IlRSQhU3IjTCddS2ZtKiw1IWNlVURPZGRkIztOPjNTVztdJHNDRzEpJSdKKCE3ZmNWNkwvVltlcUs6RGo5XmJAOGJpQyJkNz0waFRSKT8hMmguaTxpWkhZIzxOQE10U1RwcGQ8KlpTOCFJKVxHN1xdZjpyJVY5JGgjWD5ELyk0JEJuP25pNVJiM0UnJkM8bThNSD49IUJlRyFVJWJpSUFpaiY9P2F1TldraENwRTZCSUhmbGdGVWVRcSpScUxVbktfVXRTZ2dSSDVYLipxVVYoRCFdNVx1Ki9CY1dsIlRcTk9IMmJxQDk2MTFOY15EJnViY2hxTkdQZl4mZGRpTFcmcUFXcG5RWFZ0MVsxXEU4Pm1UO1BkZnQ9MzFpZGBUJ0ZzUzdaOyw1QmAyb25vaStfbXFrJSNTW2JDTWtXVUAxKFI2ajciaTcwPD1qVEhMcl1TPWJlIVlSUlticGRMOTs0Xz5ISVQjIiFvXihtbixUKyVpRlcxTideTHBZX3FrUzMoTFNda0hOL0JGZ2tTVFtkIipCT2VbbDowWzVLQnAzPjgqKl9zW1RnXS0iXGtCdCw2YC8zX0sqZF9VQGJSM14rLlFVMmk1K1lYNz03LnAlRi9OITdEWVI8SHRXJyIla1FNR0Y9YC5vQVZ0OlJEPGI5LDUnIjxyZmkmblkucUpkO2EmYmhHckYhLD0qOW0zOURuQ0lBb0FnS1BHKU8xcykoOHUlRCQrbTo8ZjgzR2xuUDpyZFZPQmY/QkUhVjtYIjJQJyUvcmdqczNNclRGTFlgRFsmak83V1pldVZALDtHTGhCPjUra3BTPEonWz1rOitwRSRnJ3JoYGoqO3A5akkodCgmVjJJcWskTDckOzpTckQ5Mj9hNy0tYVokL1ZLXCM5SEA6NFBEPkhxZ1laOCNtNUVdOV9YPjJjQ0ZrVlQ3ZC42WUNQTUtsS0NYK0QxNjEzS2szNnNJOj5dQ0poIWw4bzJuKmEiUCVgKzExcFp0T01tTWljQjJtNVJpXG5WYiRlYFRAJ005MSYlKy1zTkVWOnM7QjskJy0pQCNtQzRGQ25zWzFhUj8ncXBAK3JsWEprLmg+QFQrNig3YlpcYFhiOVJycmovWWJ0Ml10IWpSXTtPM29xUTdsam9Mb0s3a0YiJnIscjkuby9cWkM9aU02Lk4uUEdnRyhqZSQzSm0lQV9ASFZpb3JRMGBzL2BTP3FRLUwnaCcuIy0oMFA9KG9WcERjQ11RXihfJmNsbCFSS0pubHIlbzlYNCYkdT1ML01cPTNfNyloOEdJYGYnN1A3RXJUYCh0K1ljUXFuYEM4NWppTz45KiUpMEY0ZGJkZ09sdGRqPkBzI2MlLFBQLWFTTUBAVUYwLCpFY2FUWTUlVUg7VURRUDwtJlNCKDRmL1Nsaz9OTE1tSitcMSxAcjJJJXFbI1NMXEgpUWlLXWFpOWUuZlkvLj9FOUg4OWMiWkI9TktyTFEyMW1HLEVBMCNmJF4jMkVxbidlL1xUMTZVJSY8ZDIsVCxvZXBOaTVXYXBgZmpSa2Q2QTJ0VFVCPk88PVtcJTsxS1RCNjRDYG1qZGVSY2EiK3RrWTYiPTE9SXBtRCtMbElxRGEqWDVCNzh1RGNsPEFtXWY9ZltcWS0jTFY0NmEkb0pzVHIiZU9KNyUsJjFqV01cNWckWDtUIzRNNTh1WUZhRlxIP3E3NCkxVlA1VTc8PmBDXEYhbDl1SGZBYWxhL0NZRk9GRCwlK1kxVj1yajBuVEAiYVo+QTokMz9yXWJSRjBBWFhKaWVrcCc+RGBFczY2RChbW1E1anE7RG1tWVZSWStRSktETlkmdThENzdsbzs5OVJEQiw/aDRmO2NZKDY1LkE2bEI8cCRFTHFFP1g3JC1MLEFAQkBWSm0rTCliOyxTTURINmJVWWNGaWNeZC50XllRY1w9P19RWCVCTUA+JF5ibXVVKTk5LWY8I25gak4xc1xbblVxNVA8Iy4vVllnV1ktZiNOWVVlTSQsWEdjc2dycF05czhPTipOJ1VJI3AuNVhnU1JCLCdsPzkjOkxvViNGKExjJ25KNWdDcnBuLChXMWBAJixnL29ZQCsqIW0uYTYxQ1tpOUw3PE9CKWY2PWB0cD1AL1pkMUJrYWxdQmIvNmlgLkMhLSVMLGtmaWgyRHQ3cSdtOGMhSSYuNV8nQ15JIkQ4TEljaWU4NyUhdWwxXSk5QDZObk41XSw/UmchbSUtazhrQF1hUDItbV8pZ15DJEgvdCxhVEBEbF4pS0EjU3VDIl1xMm4/XzpabVRTOjFBZ1EtXFRNXVpAOEc2JDpCIUU4dEYyWjkhLWJPXElDIiVUPSI9QV4lYWVGJ0MyWF1IVnJJbz0lWGRgSjJnWD5zdTZtJGVhcVBBT24vZmxRLEguVkQoRzp0QSZkMnBgR0A4WUxrKFlkTkRtQGY+TUtOMDQ1M0F0KE1WJmM1IVIzWXJlMTMqbFNRcDtFLVlkK1UpVWBXXSdtZUw/IyYnYy9CQUUhI25hIVU5MjBuYVtbVWV0cUgqaFw0Q1NNZE9AZ10qJmxqcmA4M0w6PSJBTiVeYWpBbWJ0LzNObjh0UWZmNT4qaCojamZkL3VpNz8lcUgvQF5cNl9ySUk0XU9Ucl46Rzg0dFZBcDdjVz9kWzlqbTYjb21gPCxnVDo2OkVYVnFjQ25FX15HOiJrMTUoLnRLKFppbjUiJTJkNEFqZUBTLWAyV0YtRy4iYWcjaFpIbCcoM14uTzxHWFJuMkEqc1RMamRSQXJwazQiUlwlblRiS2Y3aShcaC4iS2wqNm9AWCI3NWUzOmMxKihYVixtI0QrYmNsQUFzNkgiUW0rXjghKUU4MTlHaDA2M0lJZjddQigmalBnV2dfZFhnaXIjUEEtUGtSViVOQ3FuaFRPQjZPaShXMFZgRCNwaSM2OFo8RUcoM241QVpAUSRAY0QkTztBRlAlKlVaT2U2W2hSYmQuNj5eTyEqPTRxSFBDPFNRJUUwRDkvbDY3RURbKShqbkJXTGZHMltGPnVCOklZOjZzWTZwa3I6XUtfIkI1cyxGJFU2NmxTJlxtKCM7akZ0RWdbb0BLYGNXcjJiRFYyMmdPJWhhRydtIyxXMWJoZXAhLV5ALTVMMD5aO3JXSjNIKm91MSo6WFRoaSctOyMqakpeNCFzVmFaIk1NK14vVV1ZY3AiR1xJMForSVthX24lVT9fQD9jMmNsMzsoYUwlJTxwcy9qcGh1QDVPQVJ1ZzUicj9CUTBhNT9LYy41V1olUDhPZCVRJVF1XUs0Y2pSQF07VnVFXTw8QCdAPCRuLC1Lb0NbN2ZoSylmb1hdNFtGbHFuJmNBWz4xS0ckNk1tVVhWLkFEcU5vYFtTZUdSaT5fSVshKSZicl1bQkZaM25cUjdQU2A7YCxsPS8lQEdLMFJJVChzal9cTCIjYVJtIyxVS0BSW1psS1BZMjIrdGIvcmxtTE8tJ1w+XWhLTm4hbkxlRCM5QlAyNm82a044Wiw6QnFSaipGYWdzXV9IZXNoXlVYIUJkbj9qNz9oc0tZb2FhOXNsLCo3ZT5JSC0iPVxIPUBaZ2dkLTErJT5yUjxHSjhTbEIjT01ZOWAtKz5TLCo4X3BfJXIhU1JnSUg4VjhDRFYvIzRnWEpOUS8sTmZGXi4qZ2wsUWpAPmViMlBIWGdWQkJoR2tII1hYVihrc21XaDVDW0dAay4rMzAqKUZpPTtBY2wvJjJGck5qT3AzREVwNWpcWk9iOVBnIjhSQktGSCJvN2BraidoRFQ7aDFGSkxEW3MhUkIyUkg4WUhnIyM7aFIxJGkiaUgmXUQsNmEqNSxsQD9qLSxMPlQ2OWkpYlVKYlNUSzZtKUpTIzZfW1RqTDE3Z2IlQEppMCI1ZlYsLmhTbEYuLTdlcGpHZVBQWF5tYiFccGg3TW4uTlwsVkdia3NjN1ApMDU6KlVVJShaVDg2N11QaDwnXktrLVJCbSdmQC1lVW5bSl1UajRHcHVAJygvT10+X210K0E0YXBoZVVtPCgkLCYlVVlFNlszNnFUQWRkMDpcRV0xOztKXlVMY25GVidtMWs/dTU5UjRrUDVgXi83WT9USUN0ZSouPEpUWzU/KnVjTUokRVBlclAiRCZxLThrUWBJbzRgVU0lXi88PTRCK1JPYEIjRGYxaGZAb01dZ2tpIzNkR1BoaldjOiJoX2xSX1dMNl5GJ3BYcysqJ0RVPnBtRUVFbiFWY2pgYGEzN0twIiReZjdNQlsxMU5eWmhydUBBOjdZUzpVU2NPM0FlakxoKFFQbWZGRD4iPkUlZCc5WEdpVWZGKFBaPCczUXApLnQycWlicWw5XDRhKSMvam4hXCRdWDZla19xVTZDZko2b1AlNlIxXDxoISoyQjxhV2BBMy9bRyNeNVZGcTdHVyptS2lnXFtUZVZKV3JtMz1ecEpqTlRgb3JgWykzRDBUIUNITF0zIltoZSdCKmQiUUNsKFIsSDBNXVwsV001UjgxVEpVR240Nmh0NWJVWj10WzFSJytGQT9TV0NkJ210QmEyRzw+PTNkO2hJSmRMOV4sNiNlWDtLQUFMUm09JXBaVEdZMUJ1b147X25vYlNfX1tVXUhUbyhIMkU5XlgrcEFqVmtzcmE/Ll8jYGpiMUY+JlYzO1I+N14rKDFrJi1VQklrUkFdbkAiQGdwcihjJXMsXUQndHU6aV0+P2ZrPl1OSC5UXHAwb1VyQjxeSiNrVm9oYFttNV0hSC1MQGRnUGU3Vy0kMSdhZDokXGNYOTtBZ1ZRI1FBQCpdNCpMN0NvVDpUKSc/VlNkMWc6cidnKWhiOCdGWjciPFtITzBmWCxZYjFbIUJWPVpmJHExOWBhKy8tUUhGaGs4LGtXbD0tW1MyYDR1V1JJblsyPitzOygxPFYiOTNHWlFFTikkPCl1OSxZRCRTWUEzN0E7Mi5naUdMQlhyLyw+Ik9hQCtrMDJLOWtOVDdoSlFmRUxobzJnR0pRKEoyQlVkOkZvVjpFXUBPSVhoX29FTVZGPj8jUlglMW9hV04jZUBjXko6PFxpcGY7UiVBWWNbc29mVS8+KDJZNFxRXkk6VW1lNGQxJ0hoUyshW2xzNitEbiRtZipyaUxnRV4rZjBDQSpwVE1wO2g0MkAtOydfPGYnR1tDW0lNVHBGazQxXC9EWitSOD08RiRjbkRcNCJOTV1GckRJVGh0WiEnTm9uYHM8WkBJR1dAI2BYREJYY0dXOz0/UGBLKSNaP2ZPJ2I9dVlUS0YlYEVqJW0pNVhMM1dsbjRoInMjSGRUVzZfckpmIlNqLCEyXVNuLSJYRTVEOjk9XyUxT0w+dENPKWZHWE05QS86QzhvYGcuI3MhakgsNy4lZEk8ZCFUKTgsQzFbai1aN1VRV086PG5zLFA6Li1GQzhIYEdbblY+QWJgKU1EOGdWY0ViJkBQS0M5U0tsVWdPQzpNZz5kSm1WW0M2byVLdEc0am1GamI4Q0hjNDVjcz1oKidrZnFrbD4yPTRxKyJCUmojJmRALk1SXGJ1O2xbS2Q6IVxVPW4xTjlSanE3IU5CQyxyKF9pYkthWWglI2NdKCdQcW0yVFVPWSsrMVY6R005V0ZnV2wmOlZFUkJYT2I7WkxiRWJhNCpQOHRJI2MyUF00PFApPWsyT1NQOFQ4YlIjJHI3YTxjVGNEWG1gIyY9UTA2ZyxKZypYJVdmPUgtIWxtb2o/cDh1NFg5VUMwUjUpL29iQTxSIWlqc1NNY0BMQnFTcSVSPCkmKTw6cTQzUF9KTU8uMTwqcWxJcmt0NG1Scj1lK0ZtRlkoZ0xrP1ZkQypsYVBfcVhuKHNmIzwvNS5tZy9EQD4wIllLVmBBPzhdL1hzLyxqV2MzIl5dImZtY0JdVHQyOCEiOlFecEpcN2VeXGc4aElvVCkjQypeIjxHYDYtWltpMEMlMVgiJ103XlhUUE85Ik5uWWVWZkJXXicrQVJuMElSTyhdJm4iNGBFaGtaMCNCNkxaVGtTNThtOkVPVD1OXltIWGVAbmYnTSZnWFEycT90TjtZUj03R01mUiYiIk1nKls9UU51Pi1BcDVGRiVUaz5vUDAhXCgjVVAjZm9jK0VkMjduWSNXYE9Xa2Mpa1RIKlRpRTsyaz8ocydedERIXzUiJiRkaldlI2ZAS1UqYmYoSXVTOG8tSlchcGNlcihIQTBCJjJfOUNScGMwWDRLaTo+RlxWK15aa1BfbGJtRC5KW1dOcEpWKlhWYVNpU01BPnEwXTonOlgsaC4zL1d1J08uMENvMUsrXXI8OHJBa1xdLCx0alQhaTpXWU5zZnJDVzNoODRxKihxYUdDJTZEJyVObk0sVFZhaChga2ZPUDJnLmQnRk8kRDtTMVUmOzxmOVJLYCEiTlpvLkItbzBENCpULENycCNydWEhQVRpckUjKydrVXNYakwrdXRmZS41QCZ0WW8+SS4vMUc3NTY3SnU7SEknTWswaFBqW2RfUWRnZ3NQb2RSQ1ArJGpcJy1pOU9mUGpBU2QrPEx1RW1lVVJqVilKKV1zIl0jWV4qJCghVjVQSHEtYGB0LUw3My0+JiFPSVtTOE0vcFBfPV5OWDFWLURDNXE/QVBtU2JpLExcTzVZPzYhMSJJSmwyMG1HWV9ZK210JzouWU1EOVg3XWxAXSpETWtBPUJvLkokRkY3JEx1TiduMDA2QTc/aSpbanFNRm5qSGVYLVlQREx1aWlrL0VRQWhYZ1kyXUNJSmhFN28yWyZlLFhGO1FcQUYqXmI6Uj0tUXRjXyRlU3JRJ1loSDdybCk2Ok4uQDojZ1djWE1gOD5tRitUKWxIOCoyQ086V3NELlQsN18lLnFQZzpgRzllV2t1WG1bZVhlZCdBZGRdNFdoMSFMR1NHYW0xKlkpWkBkZ0tiS3EqOWQiXD5QMElnUD43Q1A4XWViLyVXay5wJ2woUF0uMUNzQixWYldkRDI+OTVbJUVPTEwrSkwjRiU2L3JaITAqRydKLW1MR2BuQERMOy5FIzFKUCFqOC11KTtVLUZsb21vPWh1UUonPk9WaFBaNkNucXRpQShRWm1nR2wkWVdYNk5CTl4iMW5hSiV0X2AydTtlOUdPOV1sRldqUywsTnA/Kl9QMVo2WkM7SHJwUklIdU4la0NuWy1VJm1cbzdLLjZnbm0rcnBpVmEyMj8rLzFiMEU3US1NKz1hPzZlO21YS1xpRWxWclMubHRoSFxnWShDUzZVTj5GbVMuOEc1bSQvWyIzZ1wnNmRFa1s2LE1ALGQhXmZkXzBpWHBxcVo8P1stMkU6bFRhO2JFUDZZXk1FZkVWKEJjYydwSGJtPWhUdGElWWlgPDxBVFxiWV41V0E9K3BualNJJi8mNygjdCRwZEAkXitXRydyXDAsVyVVOmsnPU5QMjxUNDFsbjo+VVsrPSg5Wz4naWFbKzQxanU5JG4hY0ZeZXEyKkQ7UVgnaTAzJWguVFJmYTVdLm8nMzJrZWw+ZTskSz5OTkRwSjdfVmovKjUwYEovc25UJ0MkaTtNXjohW3BHT048KmIwbi11cCk/Zi9IL25GYWs0VSplYyZyVFQ/KzhxWVFdSUJiMnI2PzdmQEk+W1k4T3JvYmtWLy5baVRkLGg1YT8uRW9YSSlfWlJXOjJbaG5OYzB1b25dSFZeKyMxVDpWYlhsNHQ+Pj1pYlF1IVZNcS5lNz5tLmdhTWJZRiRCTXQ1YTNnXy5dS0UrbWs5TioyRmlERiJcNltkPzpjP1sxZWVOTE1rNFRzLFBsPUNvc2hOMCZmViM3WVpSTzVkMHQoQThnKFtlXUE2NUNgOmsqW2ZkKG4vWzNVL19EOzNnaTFtQ15FJV5nVUs6SiwoQnJRbltdc0NLNEVgMEYrSUwmaERzKlRLKytKZGo2ZTtrOkdpPypXcFQ3YCtYSzNtTDxjaDZOUlA3Uk0+Mm1lU1tANyQ8YjtVRXJvdSw5L3FHaiwsL11HIjg6LFdgZFNsRDVdPnRQcyRVQTZeZkFNZ082YWBsRmcvaWNJQltaNDxdQFhkcHNvJDxAXFshQlJOUUJZRVA3MidYST0rIlc3bFNuaDklaWF0PzM9ZzovKHQyRCQ8JXJ1dGJVbj1NclNeIS9IQEcsRklaa0duKk1VTDhGaywkUFtMSSIpcXJdPUc1QnE8clVRZVxONF8nY3EwJkl0MFdbPklab1g0XV1GUlNaVmNoWW5YKXJDUFwwMFFjYi4+YWFRXSciOjxPKU1mK3BKM0M/QGIxXWRtXzkrLk4rP1htKkhuLCtfXFEwPSlmNlNNNEpGOzM/KkM/b2s+XDptVGNcVVhObUcyPFxVJV0nMXE/QjNAcThEMTpTVzs8WmZmVVRxV24tP0lzaCI5UTFJS1IsIXAkMU9QS1E8L2xQOylaMixoVElKRTBzZi8/QGdwNjFaYkJQdTgmXUtrMExpYmExdXJRKVEzWHUoZz0vYyZKQidQPyY/clJvJjsqLWg+KUIzLzwnSl5fLj5bPktuIlpzYjNsQz1DPWEzUiIuKTdkRionN210UkJeS1UwKmNeb0lGZDpKb2s4N0lWPjFlZUs8IlYiSlpZMkErNz9bTTZocXE3ZV9pKiFhbkJScT9RUVgiLEJoNlYiZkhXcnU6IV9KKEQrRy9ddExeTD8mX1dFOkdOLlgyNjNQPWIkP2lHMC5lJGlAIUlyRVRLM09QQnUmZjdsKGpyOjVxWjdgN2NbSUQtM0NOb19sN0Q9QlxHUzAsKl1dO18jLj9WInRbMSFFXWVXQDI7cUhwJT05VSV1OHFkLE5vWypKJT9BbztwZytrXDAzUz8kUEtDNm11cy1WXjRVbDI4Tm5TakNnNV1pJVkiMGssZ0c0Uj1lOzZZYFMySlYyMHM8VSU+dTBhZ0UzLy9DbS1EbzktTVZfZGVWQ1tvVkdGUj5mUj8jTXQkZ25uWUhXbSNUZWcnP05Ncy1cajIqcFpSK15UPiQwSzF1bTVHQVY4JFxHYlE4WClELHRHPUtKJzg1OjNEImpbVkNwaGJfNDBCU2BCJWBwbWNCZXRXKGE8PzE0ME8xQUxwMXFALj5lNy1va243K1M/ajo/KWJQQF5FTkBlUTs9QTJJY25YXzlIPE9xRnRbc3JHamtZN08qYlVIYjU3OXU4L1U7MUNNYj1uZWhYRlBAU2hAOTdIW11ET2JgV0tSYUk9LUsmV1pZV20sbilmPWsyc2pJREw6PEJPI084V0FUZiw7WzpgPVUqZUdEKD10JUwoMjkubixzLlpcLFhvSVY4KXVkM18xVCgrWVlHPD9PUWVQKTtsSTwxYVdRc2FeSEY8XihYZ2FmW3JvP2YqcCQ0KkZqVlY8M0E7ckgvLV9tVlNmWWoiTVJYJ2lPN1BVVTxkaTdbYC40c1V0Z1FWbShqVlAnX0clQzJzbGBcNWEyNGxhOmhYTVZtPjNwWS41PzhmWG5cP2EuY0I/LFs8LUNaLmI3XkVySF5XYlRcKXRibGEkK24yXjtWbVtNTm9zJjlIXFE5W3FhYkkrKV5yUV9kQDtvQ0RyP1E/PDpRSkdIVCIqck5gMFJGam5EUltdXD9ZcVRYTkZbPF1ZQ1hxbnI2JTdxbT00b2BVL15EdHUiZm8/TGhwLSFeIjpXRG5tZSRASUhnNzt1SEZVK2lrXzBFSztJUWpDLTBydV4rbWIiPlhUbCcqWmh0LGJgPHQwQCNSPl9rOUhwM0NFMyVyNztnVS0lbiphZW5yJVIlKVtgVlxmbDMqKT1vKG9ddGdGMnRTI0opMFltTT4qVXFJK3NdOmtXMVtIaitbbFgnUXJCTl08RCQ+ZjxhcVxITEouNC5yTEJwM2dfIWJwNVplam1dL0tINExYcmUpLzhsamdbbkNVPW1Sc1dBI1A+YEE/OjVMUkZFRFJqQ0g8PFxKcGkxZzp1c2loPSc3NUMjLVkjZjVAUVoxIzpDPyltO0dHcWoyWE5yYkJLNW4lTmIray9uK3FGSlgrWVBIUy1DbzdvSmltIS5dTS43NFBBMXQlUSs9dFZHPT1mIU9mXSZQJkJJcWVUPSskS0pKWUhJYztIZ11fXWRZYiZfMC5IMkdoNSFyb1RHam50YV5vQnIxJTJtT0Q+cy9kWC88TCY8R0wuPVptOkhebWJmPzVPZCdrYSRbW2sxYkZeZ25CbmldayFiSG4zTWxIWm5KSylTXmFVayFrPT5SYT9lKzIlUkN1P0hAX2FIOG05NGxEXUFENkRMVGRiW25ZRT8jTj1iWnNoMThHWTJTR0omclImJClGRl0sU01bPTZATnExVzpRPXJcSjE9JGwvbE1sNDhmYihLJEtcVTo/MlxUckpebzpvK1tsRVRIWU9CRjloSGZNTzJJclgqMjBMNTs7XkxzP1txUE44PjopMFdyVjBsOG5AdGFQKSJeJzJiIk45Mz8vTCVCS1A8LTBOLnM7RnNSdCFsK0lvOTxpVGhjazozUHVzJWJuOVVkXi9cPiQsbnBwNiciIkJhXGwjVy1VYl0sOlwrR2x0Ml1nViNpc1FDREk8aiJzP0AxdDgzJCE+RWFWQC9QOlFnQUBTUFFpLT1gWUpkW1FYP1sjN3BjQ24mRThbPlA2KmJbaUYvOmxDWFxiMzNoTUhrO0xOcEQyKS1AYWFEMDMnaC9YcVcvVSdET10sP1pCXzlkUD5FNC1FcnFNJTdUNyNdWDojZj1eMkV0ZSpTYjtuNVYpUVg7TkJIZ2tZRXNaX2tpX2lQL08tUTxgZTFtKCpuWVZVWHEwc1ZwQGEtKmMwZUw1KnFLXlRiR3MmQiRAU15FZT1YJk9aO05GIyRRK04iclQ5K2JhLj9GVGtALW0tJ1dETWFxWlNoX3ElJ29QcnF1NzkydVtuT1FhSkRYLGdAZD5QaUlHOFBVWlU0WU1BZDNNMjFmbl1QZGBTZkRiVF1oJDhERGxJXmwtXj4tTCFWMmEpTF0zLmtPVWgnXypDUTYuZWw7KUtMSm0lTjYlbUtRXkk/LEVLcHBqcy9CLFsnX2oyK2IvREk1RWVwdGolVWcmOlA1RGElRDY3MFJcOlJubU85VzkiTCNmYDlEalUzNWY3XDpKSTchWDNHQi0oLz43ak8+LUZJMzFWV0JEXVwhUVY+Nkc/ZS1YNjhbKSxRS0NWVWVfYWNZOEhMWnVtPSslUSptR0FIMV5OXSM6NDFEQkZaaDpvRSphXGx1XWFxakpec1t0blRlISssLCc+KFtBVTBpWjM3cS9aaitWVl8qSVZuYVtdPkpWP0BANHE0ZU0xRnJWJU5JcjpZc2glbEk3dGBsJWQ4ZHFBI3BdN280QDYsLTpjOigsbVwwZGBlKy88Zltab0xnLUEzTy8+KzU5RzoyZC5aNSdeOjRqZjlWOSVDa0M7czRuKiRmRnJua0hVaGdLKmM6QDtNXFJkL0M1PWhUMzNjW2pvdUlebyg0SlknSEczMS5ndDlbOSoyPF5dcFkuYSVcVVZRIW9DXGM5RFNycDkoWURMMTVSLSxfVUZAXGd0UDoqMyNfZVo5RClXajZaYWJXa08sbz8zXVYrKmREQl9xUzM0SS9pbi00N0Qic3JxXjdLPk5xZlZKcWttUDlvQy0oOipmVSw8KnA+PVdYT3RrbiUtazJSZzx0c2dfdG5kOjVOUFsiUTosLTN0Ukp1LmI8UCEtJ3VuYTEsPSx1Wi1sdS1wI2pOc1FvOzFwWm8hPFRMPDtsMEFKZUYmW0U5JGYjRSNxMlE7XUFpalsubDgmK3M5LVBQR1MmMXFKJUY8aW1BP2s8SERpcVhXSE5aInFkbF1qZ2Voa3UvckU5OzFZSjozWC9bUFo0MVA8QURrY09LJyYsMGdHMjA7VlsuNm1XNjpXQFhIMmlyK2BvYEN0ZTVFPSpoODxjTDwpYWlzNWsxOiNqWSElKi8nWyNJYjFDYnV0bUBMYWw5IWslYWxnOl1LZSJkNzZDVnBXc2BSW3NZWGFkMV0kQTM1Il9aW3BIZ1pDXUhMRFxcTVZeTl8oc1ZUNmZxYWxdLGdoR0BMPSNeRHBBUVZpVTowXVBZb2FiQm8qTlVNPSkpS0JqYkdFQ3NNMypDJi1uMSRJdUo8RDJQcD9ldERGWHQ+RyZeVVJ0KSouNCpZUktMRlwzYydAQ1g3X3VqOiR0QzteM24rZFNTUHUiWy9PdW5naiIpNFJRcC9Sbig/VT5OdWBPYHJoW01pK0laSmlqSTQiRzcnOFUhRj5JMVM4XTJQb2pFTyxQWik7S29aMDBkbE81SkVPKDE6QFg8b207WWghTWxPbmpEa2FIaUVfQ1FgRV81SzpjPjtybEg/UiFIMldKYGpnLiU5Zm1DWk5cOm1HM1A+PUFeRSkwUUJfc0k2aERXUjwobD9LYylKa1ZdXSJNRDMhMFtlclAyPil1XWAsZDpqKlAtWmtPZ0RvLEJYSzE5Tm1NZWolITBGZ1wvOCI1IS84Rz9iYSttZFdsRyhwczsoMCFmLkdmQVpDOFRGUCVlSTs7IzpSaTEnTys+WlVTLiVJYCFDZzNgOVBJYkNIMDNERTVoL281NWxxMU45ZS5aL1BEQjowWCRaclw8YHFXTnJkNTF0RzM9J24pYmFvN3EkaEtuTDlYMlpVbl9eLTEyLidOZG9fKE1zbm1VZlI8YzZcLDNyOylfUys1Y1ZBVGpKa3RJRiJoJ0osL1okLnFdOk0+KiRlKiNqOlJ0cE1HS3E6a3NWI1dCbEY3ZmtiJnFyRkttbWdRcDZ0YCkhVCVKLGNZJFQsaDBcaW8jNjc1UEUvNzQ0Y1pFcFUjXW5CUkkpWE5kJSglUSdPM3QsSl91Ni5QISZRNEZSN2QyckZUNGxVKyNhXVUkU0FGaD1BWionWVNcRTY+MHRsOUhIRltxImchU1tcITZDXGJoXVUyLFcoYz1HSS87UWBDP1hvdWk8RFNHJzpTN0AnQm5fSl1qb1Q8WDFlZk5ebXM3LSR1Km5tbWBxNTgsXlYwNVNQVVA+aDonazFmU1UyVTRyOUpgPVNVSTkkMlU7WmQ4W3JbOGE8SCthNVFhOlhTZTtsRFtVaERmY0RIPSNmYnE3S09CP3NkO0Y3LyRjRDolaSc2I0ZFPG9VRWc7NG1YbVJLLEFKdUJoL1I5W0lUXk1OTEtbakh0Z00uSFFCayUuIyNXdD1VOWAjOTFJZmZrTlZYWURAPVdXV1UsPUlrWkIuP2QiQE49PCQsVEopWGw7PkBMb1ZlMGYqNV9Iaz91TGg2MzJwZmFiJVg5ImoiQWNuZEY4SDFrZzQnLkBhJFsjNDY1YXJsZUFCR0k9VWM0SE5fZ2ktRTdmRkRDb04uX2dpJCgicGgvaGBcLC8lLGdwJV1SJVRhVTgjQzpLcCJUQVBHcE4qRjoyRDJHNkopUDY8bVVSYVQ4YmNjQUBpK24rMF9qKkFBM1RXRFYwTWdDbFwxMFU5M28sWGlsYWlwY0BqKVJGbmZhYzJePygwbThDKmZibzFPPi1QNz48VmZbMUglc1JFYVtsUDhBOWtUPjskXS8rXkVSazN0L05sXl0kVG0xO0s7JSZZRkgyc24sNk40UHFxUS8zKUUwWmcyOzIoPiNvTjBNTzklXi9xaT4sYi5fU1NTWFlNV08lUVgwUTFaVltiQ2A0bWBIYUBZR0UpRnQnLDEoYWc+aiRzJSQ1b28zIlBcTWhJV25Gb3EtN0hbTF07bTg/Jj1mTjIqI0hATUNhKXI7QExGRk4zPj5CMzFoUWdPJDtwb1xrZiE+c1xfKnNyW0FUT1JQNDA5QDlELFolXj9ENWhuNy9KVC9cWUghKF1KJUAmUzY1LGU8UTMyQDA6dFRvQmlXaGhVQkRFdW1CZmNSWEJIZztjL2IkSWZpOyRPWTZVOGhlO0Y/Z2JAKyYxWlBpWzhLPSddPDgoVU1oalIjOTcxNlgvUWJARWMzTiIvaTglQDBAYzdRYDJ1Mi0kZ0FqUEhdZDk3JC9IOGpjUGgxOFIjTFZxP18ybj9sLHViNmJhcixPSyknNUdAaW1VR0loSVpHcGxpXG4zQGJOYDBxLnFJcFRpYComam1na3Fpc1U2cmwrOkp1MktNNmtjIl03cHJxUV1PTnJxTTsuJUJkZjA8Q0llakEjMDE9JSkuMFtHMFBeQGtLOm5OLWtmRSVaQURzIi1ScGxMZE88azxPPy01Ymg6LTVPVDErPS5QQ2Q7VE9JR0FpT0xIQ3BmUF8mdStgN2VGQVUjNzkvK08+dCdAJz5ZaCova0JAOnJlQzBTQUZHJ010L2lpbFEpQk9EdDI4VDFacjMpMzVsZTUmYTpHSDdKXyNYVk5xSVBFKjJbJF4ldSFZVDs5JHIqXyUtcF03UTJHWWM+Q3FtLm8qWDpFT2BXXU42TU5HLDgwL1duUC4sRUpQKSNmUiszWSM6OF9qLkZHQDlAbmVfK15YQTwhR043K1JwVk1KMTFUJkUkMWJzSlM9dHFiZUUvKCJDb3VLNDg+ZHMqLUwwTUcxMCZ1IWcxI0hTdWkvN2A0YnBHJmluVF1wQVBVLCJTZUpeRVI4ZydBSkNJbnUkQEMzOUQvcmBmTjopWFU7Jm9wSUw7XmdVZk5UJG8pIW1LJkVFWG90SlIkWSdFR2NwXksmZz5RTS0uQl4nQCJxYSYyViFxciJLLiU2aDFRW1JwLT5QPmo4KFRmLzltJyohZichMmxnQS5SWV51cSFqJ2IpXEpmOHBfI1duLiZANiJZN0A/QW9UUmVZUlBmaGtXclZvL1leYSlcMkM2WGlnQjBMM0ZJP0kjSTEvJUAzclFDcGVeQUU/dSUyOzZUUmRqWyZuOiQwVzkpTzEmbCZkVzwpOiY5VEJmQDJLIV9Dck04LV9oRDxLUkQ0TEo/R0kqMEtfaDwrVUs+JjssUlBHOHVPNCcmLDkna11tdTptPEFBTnFNIVAxNDBnPEtYVmsxMm8qR1QrKTZUblJVPz0hPXRQWWByc0ZUbzFxaVFJIldESGZsV0VnTE1nZU4+aHA0LFxdZDt1cFxbWUNhTWI6QEhBPkk2Il4iQCEqTEkoa1MlZC88IlJyTVY8XztXRSVcIWZXS2ZaJkRZZio4UGpfWVRja2ljcmJiakthXCVFT1xoaSxMN1tdSz8jQFIjMmlhYGNzOmI8OW9cYTZdRjo6ZiomKGRAIT5GTkEnIUxYQVExUDFZQihZVzQ6QktvYkBILkNtMmQqRmNzJVZbNkcjOStFXz9hJTdhRS1ocixaSDB1QU9eb1V1KWR1LUY6VVhsYkwrWD9oRGU9QldUOVpnMiZeK1IsIzUpKU5lTS1tIyNfJFE7IklGTCRNKEtpa2hBMiphSTMyck0uNlhGWUAiTChXJ0RbIk8kTk5oTWs5LDcmUyFcZmE2ckYqTyUvb01eL1MrPVs/OHVEaU5hbF8pVFdzJUVROj5qYE1hKEVWIkU3TkJPcydWUE9ZXyYmK1FYR006SUREbFVVV05SMURNSCZASCpVUW9lVmNkQ2tWaW4qMyI8ZCVWLVBZNCoiSjNrXVhqQE1GOitkPDMqQFs/TSpcbz9wWV1kY0szZHQoNC9mYldlYjcyXT9GQkAjOSgyOEYpMDpTMWNaU1JQKTxCXlRELVouWU8qbU9mJlV0JSk2UXRbUVJRMGYtOUlLOnRXb00lXCNSPUlfPURGPkMxVWMuWEdaOCNkSWpnXSQmRzkjTGRgNGUtOy41Q2ZYTTwxJmVFYD1EQTVSQDgwJHI9KzEoQkhuTTtvUUpmSFM+TzZwVlhNXTYsKVJVNTU5QEIxc0w5OTpBZ0pnIldBTlVvMnEjS009JiUkNShYXiVcJShSUSYvKzs7bGE4NyYpakctREI4NjksKlM7JVZ1YFRAWzIoYmMuNydjdChuI09ORjtbMVFrKFExajY+ZlBAImoqVGkjQE1pbS5BREhoLTQ/XUBAIUcwdUVpQnVvWzhNdG1cYGdpWW5jQnFTUFRYOFQ4anBqKFZvJVtWT21NZUAsJiFFWUNrQmc3InNrKkhjZFkrdVVQPTNITj4uN1dFWmRkMl1QMl9QbzBdTjElXTlLSGVrNkRxODkwI0pTalEwYjVfSVNILSFxRVM4TFRdLTghI3JNYSgyTiEqKDRaYlQ2JkFyLTB0MWcoYF42dVdvLzJiQz9lXWgoWFAiWVZabF5HIiorbS5YIT4/TFpqS3FCNlM1Rjg9cVs/OjwlPGFoS0BGRjEvdFE1YV9WJUUrU088O3NsIk9qWF8uXVtCZDhmN0U3JjJBPDUla1RVLTU+NltWaWwqPzMzRDMyTkxVWyFKOFExKVlUMjApVnBDaHNEOWVaRldSSyMnXDM7TGRESTJpNygjdUBCTE1ENzk0SltdNj1xVSpoPFBNbzRIQW5MNSxMLmR1SEYlTWNyQy5pXTR1Qkg9b20/P1VmSmhfbGZJY2pVJEltMzc5ckhuY1grUjBHazpUamxBKTdyY18oamYkaWhCXjRkZWBcRDJtPTpNKUEnaiZtXElWMTdYXV8pYDk0KUtEUDhzWUNwUzVGTCpkdDpqP1gvXVIyMEkxUyJNX01lbE5TVW1wVCUyKWhLSCI1K15bSUpkRm1dO28vNUFVcSs8ME06c29INTduOE5HVTA5MVozNTNebjFSbVBIOjYxZy1VajQvaStjSGcyNF4xMzItcUdsamkhODosNl8vTldNQ09HITBTL15CXFgoY3FZNCJOKiVKJCElalVRYGVdN2gwW2JzVWEkTHAxa1FjIj5PXCNYNCE2MG5ScVgsJ1xLVTguQzc5bjApZ1tFYTpBNHIvKjohRTVBX0B0YmdxKVxJUVA0Q2xxSWZ0X1loWkZoUk5qVHFlSmloP1YsPWpvI05VbjJkUFYoNWVPIjRsNWI8L1Q9VDxESTwmJyQiazk4ZVJlXCNwTjVVIlsmZHJcRlU3am1EcCovWTEiVkYhamByUElZSm5tZHBBRzlRU2BQaSxCIzRwUkNaMlEoLmZuVm9SYi5CKVAkXD48IjlpLCRRUXQoNEEvbz5ZWCREZjlKcDc5cG1WcjswcVQ7LTxESF8hTiNPTlUuSWs/NSRPXG5mZCFJTmVjQmJuU0JzM1psKW5BJ1pNSVstXmVTWDBJJHBVWyJpLV07LVMtOTlpQj9bQGQlTXAnSUtxPSQiRy9WYmdJOiJDZVsnNCI9XHVrUC09VzEzOkRIdT9DYEtEKyljIWxgOmxpWiErLDNzZnRhQicnK09FSy9vJGU3YEhuQ1o2RTk5dFQ0UylvblIzUyFPL29ScSZAWDwqVXBSUFlzIiJXWl0vTyp0PlJVSSpQKU5AdG9zJyV1PVxTWDgvRXFWZm9OUU1RbEUtajU+biotbChuVmouY1pjbWtiSjtXKlttUDxKQ2FXJ3ItRUJuaF5cakY2L3Q3QC4/bzpGaD1MYUFJbGJMRW1WSkovIl90JUFVQSpfUz9XJS9OJDdfLlNbQzdROiEmSClqU21dYWYhWEVrbjxkPDdCXColI0crNVxfTVVNT1c2K1NIMl5hJnE1LWFHV1RgPzppaDomKUIqPGtYTU9BQC1OSmtbcGdga2M/JFNSM2ckKy9EXlokLSZCIShTMFE1SzM1OFlnZ0lkLltgInEnUD9fUWZQbmk8NE4lLyxfK0dNaXImP2V0cjc9PjxbTzsnLksnLUUiTkM1My5RSztDI29MUTp1MiNUWCZ0J11yZF8kTmZTTkY6WDkhNm9DTVxUPlx1SCpsTlZmNTJgbEgnLltvN1QuIjFAO14kMW4mX25UKTFrZzdpOmsnP2wsPjdgIjssXzE8YiJTPD4mQT1NSVJjJSY0MU1ST2oicWRJMjd0dU90IUIobTRvUEJeR1gjXHNvJFIsdC5UbiwrIWlFIWo4YjtmMFo+TC5XJ04oXD9MNCU2c2xFLithdCFLLkBdMV0yITlsSEQ4VD8rc2poZ3JvUTZMJ2lRYWZDLklSV2BjQT9lVls1LGtbQk5RSj5sUERlMWVgPiJsUCwjNVpiZHBaVTpyNzc7ZkJjKG1tKT1kXl1gJDpTMl5dbkRuO24vNis2bjZTPTtmWDtUcy0oZ2otdSZKWS9XPTFJNCU+UzsiPyI6PTJsIkBfRGUwWUNtcSZBOUdERWphIVI/JXMlRFdxRDFHJ20zVzUuMl4jTDhHIlZxTG5BOTJVKGFkTlZPXyNwMXBBJG8yZHE7X2ZpKTNHMWEpOTU/NzRbJDowYUw7OihwbiRNMW5ZQD1kaGdfVlVUVi1WdFA5X1JdKT1SL2ZOXlVnYGZdMS06ZGNgMUFIOypIblJadT1ZXzorYEo+YGNkRFUzaV5iJSUlOEtKXWhLYmg0P09zP1w6X3ArcVk/YCtOUlRVaVpgNDJUXl04YVkhYjdibltaO1U3XDc6RkguXUs3W0RWTUAyQnEjWW0+cjpRVCl0YlMpLmJFXzAiNiJZPGFhJkBmUDhUYSQ8cCNRcFAjVzJdPTdbPzcsWTNuWXE/aihzZjNKRVFdJE90azYvRSRPZnVvcW9dOiNlPl5BajlBNlw0UT47QkxRUC4pJittZjNsQFJfRkFnSmVVT2lKNzpjQ2xIV1ozWS9jLVlmMixsRVRHbzc1YmgvO1suRHVpQ1h1VkNyQ1toSExzVTNPSEpTKmhtMWZaOFI5XDpCST9GTV1BUV5TOTI0LG4pYltDPlJSZzFKYUVNXEJERSk0NV9NZjVoakdnSzVoQzFhSWw1JW90OFtAcCJBdWVcQGd1b11LMkopImNaX2Y9RzNHJjNmaVJzUFVWTWw4cXFzclJcRExHJWBsPDVvIWJCXiEkcGwzIWNzLm5BaThHQ2I9cFcvU3VFdS8sKmpqZ14iP2RUXTFlJUpSQyVeLnIzKTY8bC5OTEJuWCtwW3RkN09fdE8xIyxxdVoxXTNUJTMvOSU3alFtMDM0SU1ZUGZfbTNNN0Rbayh0Tls6VkA5cU8uZjpoIioscWJ1cXBgJExBSi5LNiJrQS8uWHRHaDU4V1kvLz5HVk5xaEorbClNREA0VUVoam4/K244K1IuU3BZLVgsJTViUChqZyVKaV1ZTGpeR0o3KD4wOk8uODVHW0pdJzNyVkpZZz9WNUVtLFVVZCJjJ0pGUGM0JjRQSyY2YF1aPUM6IyRMcGhzIixFbmo+bG83WCgtbCUiOCZtLyNeV1VRUmc1YVBCRGVhaGIlVDsvY1EzZEotMTdwQiVCSm0xJmQiQC1AZ0FIXj1ANSRrYElVcTttbSw8L05IZDNmYHJsXGRxRC9rXSg0IzNKYGlqNDI7WkNaPlU4Xl1jXWQ4YDM1RiQ0NDo+ckUrcEooW3F0X1EtPj5wKzpZKmoiP05CK2RbKT1SImomY2ByK11yJCtaTHBrNW5DRChFQ1lLc0I9Q0NiSkc/UyNHUnFdT1FDbWU/VVMvQCIjUWU2W2ZRQFFUXmdyWFNuRWp1YTNkVE88WVgsJ1ApXWE3MS5Mai4sKyZpIyUvYEpvSFxEY0tYPGwkWm5LV0BHZC1hdFI1VSNnakskdTpPLyZWcWJEP1UsWi1EYVtnWSIwWU5DV1hWXGdeWjpSKjNPPlM5PT5LMyJXdSMmX2oyLFQ3PWE5VFNvOU0jIVxTMCtHM0w6N05UOD9vTypaMCUjXW9qQ1ZMPCNkL2Q0VEIhPlo5MylBLlUvVUFvc1pPYjtkcUs4MklhRCVyTzVdTHRaWT4zQVU1JTktbiE5Zys8R2hKVmg/M1lmQSdQRVI2WTErXms/bTNxMCkiaEVMMSM1dDsydTNGbV9hVk1fJU85TUNrUmpfZSVKNVxhaG4wdFFLJShFKV9ZVC4lMlgpXFRUY0g4Y0xUNmoqJ1EsTyRuTiJjKnFUcSteOFxqR0JYdG9aY01TQmpvREhPKjY7ST8wSk1cRk89L1ZZRl11TWcybUVmZUJLNUhhQmJWNlZGPCFcLGBwPz4mMVZocy8hNFAlVFhGODZaOUNESGFMPT43WjRwSjZfLWl1M29GKyJELztLSiE6YlgqSWJPVlYpMUVKRC1oZTonRVs8PCQyX3JSY0wyPTxfQ2BOJXNuSkA1UignWWxgSShEaWonUVRZQUolVVRQKUsuTGNxKGRzcyZkRmdUbV9yZiZxOzU1OSlXQS5hOkonaXIoOEpjVi9SYydpNjxHRCJlLHM3WDtjbTMtcVw5cjdrJyJCV0pbM0N0VDZIXikwOl5tRTcrRnJEZUVPZEJkQEczcGtMSVIiJlFdQG0mO01KXjdbSVNzJlMndWNtZ3E0NyYrVy9GX2RjalYiZ1VbRSdBZyNqNFkiXEM5cSI9OFQzTiJyS2VUNW05X1BoJ0RhSihwVDZPZ2Q3R3A8NSpGYzMyJjBfMGcwJFtOcV9WKFBUYjxPK1szPWMtVCYiZiE3WSJVbTY1JEwlSkAsYyMnKlBhUStha0QoTSgtXSk6PUs8JXBrM15hcWVKOG1Va0RXOz8naDgjIkYsMmZBUjUtU0VBJVEmZV1kSzdjYS44WSh0LlhEcjJMVCpsZjBxO0Nzbj1VOjJIJlRnMjJsR21jImY1ImVmMV5YRjxvRiVuLVhOM19hPGlQIy90SC4/YUosOkFcWC9JLk4sZFtMPXU3dDZkWClwYkZDcCxnNFcxMmArTks5Yi45JXJNUVNkXUZXXmoxM2E5SCcuLSM/XXA3biFsMDNgKllMUHVjLitvXV4sRWklWCciak0/TDMpLzxLVisyUitcP2ZgaSVXSDBUWyV1b15APk9KNj1qcF0sK3IxbUkmXms9YFE7WU85U2xcXzw4ZkhJRCEwXS9oYitsbDstOWMhZHMvU1U9aWYjRk0wI01Jci4pWlcmNl5WOXJkWTBeYnBebXUjaDBmWCx0XEVNQyRRbGEzUSVvKTRYYTNwaklhT0VfT0lTV01iOEBQNDduLk9aSyUkTSY5VmhEISptdHFiKm9YTHFrJTs0WEdPZkApSVEzRE9xaiozUFZaJWBTKXBIWSZGcyFxJ2FQP1BIOz9fUGU7RTxoaDRuYFhASyM6P19mZzgtMFlwJ21ZdSNJPlxAazM4RUpFRkNaNDtySXFLUnIhaiZwI19RT1ZwKFE6LyFJQVU9aERMMUk2Ij5VQShGYmdjPDU7K1kyTG9BLD5QTUUmdW9xRCYjVjZEXWNeRUBEaE9XZSdXbUonNGwvTGM5Py9ccVs1Llo8ciUtLkJOJ2JldVpVUE9qLl1SQlQ1TihGcE11YGwsVUJfWUcjX2tBNUlEWDVSXW06Sm0sQHV0XCJVb1EoLD5hQlonWydJVGlWVSwnLlZkZzBEM2VqSSszPCNGT05CbyhcUjdlciwoJUlHcVUyM2FAJW9bXShyOzJWUmw5NDA4UjhaVVRzSi5wXEVWQ0FJNzJZJjZ1WHI9ai8zbnRhMF01IipCJydvbC11Q2RYLkQtdS1lIiIjYi85OHJDIWVrSTxZUT1iZk5rVUotS0dEMDlpRFNkKD5PLjpaJSw9RkdtIyVCKUQvbCJYPWUrSSlWSiNQZzojLSc7X3RtcC1gV0ckUDRLISEsN2NHRVJ0b0MtLzplYGhhXk5iZi9qIWQ9N1UvTFxOOXI/LURfXEUvVVdIcm5sQWQnYmRtUCRqY29bTT1XU11PYFRlP19HX051TUsqNjc4ai0hYGkpaSJmNSNGXSNaMmBBOG4jInFzNjIhXU5ZMFpYM3FyQ0ExdSxoXiQoJCMnQnQpYkQsSkImIUllSktQclFgSypfYkdfb0xqPUAlZ2QxKkY1M2BEKls7KSckQVUtKmNyITRKa1JLO01Pa1MiKFMjM3MpSyheYnA3VVE+VlpqNFheT0BYI3B0NWNfUSczXmNsaj48VDNQMWBkWDUpcjpBdXVdQyssTD47ZWp1JDUvY1w4IjZrOTY1ayFBVCkwQlZkISRpXnRzXC1UXmBuV0Q2ZT5fSlthb19hWSQ3RilsYkZLM1tRcjszVU4zVkU8MFJeXlxnQCRHWj1nLWk9OTk9MC9JU25vPW9NUGRyQl8vSzo1ZEJlU0lYKFs3SkhTcXFnMGVyKi1vVHVIcTsvPGtjOFxycz4xNFd0LFg0ZEc1cTpGM19NX2JqciluMExcPFRMU3BlZ2QobFNnMlcsJzleYUNVLkxGblVTPmRlLkxBbj04ZjZIPzNxTUZBNms+XmkqUCgxM0BeJ1JrSC5sPDJZMyxTRTtbYCl1XFw8LmQ6TUthWSw3JEY5TT1lWUJaZzJSWFxmVTVCQlYkcVZOLy1HayVwRmEwYFsqXmk/Vi8ucDBZJzQ4KVs2JG1abE1ZL3FsI2JyMiN0W2ZiamZhMmopMXU8NkJRKy9fPGlmJEtcUC9ePCg+MT5TPEJFWVBcL3FXWkdHI0pRRlVDQjQ1Vis4S1NwNGUiMzIib1xgM0xAZ10oQmhJVlpbOkUxNyxRXy9KNmtpXSgiMXE+LEA/TD1qJnJnVk44NmAxN1dlMSMrKmw+anJbbE5dPjwhJypOMilWT102NE1yP1FLais/MShFUHVrIlw1Ny0rKFpOYGpPYy8wVjEjbWxDXmlAOzRZNSNgaUctOlIiP2JYS3VTIVwzM0RyPFY3MyowQChcOiRgWWBHaDw2RVBaU08zOHVvIUkidVpWblZzUSk3bUVYR0tZZls8O3R0N2hHJkdbR0UvV1pqYThhOzxpPjA8X0wwR1c2QV0vUEdpPjA8X05mLFolXEFgRUZpPjBJJikpOW9VXEFgRUZqLl9KTEREQnBVXEFgR2I3TFphQ0REQnIrXDByU1Y+N0B0WERLL3BHRVNiWlg9M2hmSjtAPk1CTkU+OU5adWFYXWdpK2M1PipTMzE7dDUjLGluajJ1SSpXVC0yb1QnNWpEaixacCRbVWhSSE5jIWoyKyMqRVZxSkxzJzlVQEw0Jm1QYlVuUVIlKEEzRiYyQj0rcCtNOkRgR2dhbyg8NnFHXis2XmFaTzp1O3BcQlBRK1RHb2cvVltJPFtsQWlARU07PWE1QSMjcCVXTzVZQF5zQWgjN11AKVM2JStmbUIjaUtfc09PUXFcRT0+JShAJ2tFVnFNIywvYGY7b0JmNWlgR2dhbyg8NnFKLTkwZXBAPTknMy9WW0lMRUxbZSFncUZmYWM0LkgoREk0Sj9ndUEpZjcxP1hCRERCcitcMHJTVj43QHRYREsvcEcmXTYyVD43QHUjMCQ5Ii8oO2hfWT45IkdqYCxMWG4oO2hfYU1fXGJPYEdnYW8oPDhpXTEjLTZKYEdnYXFVNVxcdT5RNCFaJUg1bGlmTkolRCpVXV4mSEVrVW5IaXBYcm83YnJwU2M5J21WWzNtTzM5J18hbmMmVj81KDU2fj5lbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwKL0JpdHNQZXJDb21wb25lbnQgOCAvQ29sb3JTcGFjZSAvRGV2aWNlR3JheSAvRGVjb2RlIFsgMCAxIF0gL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9IZWlnaHQgMTQ1IC9MZW5ndGggNTIgCiAgL1N1YnR5cGUgL0ltYWdlIC9UeXBlIC9YT2JqZWN0IC9XaWR0aCA0MTUKPj4Kc3RyZWFtCkdiIjA7MGBfN1MhNWJFLldGbEtEVEUicmx6enp6enp6enp6enp6ISEhIVklLnFbc1Z1fj5lbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKPDwKL0Jhc2VGb250IC9UaW1lcy1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMyAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0Jhc2VGb250IC9UaW1lcy1JdGFsaWMgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0Y0IC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKOCAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GNSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjkgMCBvYmoKPDwKL0NvbnRlbnRzIDIzIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgMjIgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0gL1hPYmplY3QgPDwKL0Zvcm1Yb2IuYTI3ZTIwNmMxMjE5N2M3NzkwYWVlYzYxOThiNjFhMDggNCAwIFIKPj4KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjEwIDAgb2JqCjw8Ci9CaXRzUGVyQ29tcG9uZW50IDggL0NvbG9yU3BhY2UgL0RldmljZVJHQiAvRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0hlaWdodCAxNDUgL0xlbmd0aCA2MjAzNiAvU01hc2sgNSAwIFIgCiAgL1N1YnR5cGUgL0ltYWdlIC9UeXBlIC9YT2JqZWN0IC9XaWR0aCA0MTUKPj4Kc3RyZWFtCkdiIixrI0MnM0pnO2YhQGwvaFYmW25LUk4iOzIhUjhRQVdGLWxuRiIuTWBeNDwib29ZOyhTWnVIWnJiJEc/bz8uTGspM0IjVTIuJS1eLWteaC9FJTdjYjJtVSY8blJvUUxUNm1IIiovYmdpQ14vcjtZcm1rSWwka0JLbmY4ZllCNE1BYzBVS1pLN180KW9xdWhMJWJLO1Q+MkQrI3JBQ3UnLkthUidASEIqQTN0IWVUNlBrNldKYS8yM0A1QVgzTjhSc3FRUEhEcjpGImMxUEhnLGhjNyZEays3QkYwdD4zXHA/LjVmaEhPTDtZKSduRyMuR0gpQFc7MzM3TFgvaFxBZEFBS0EuSidAVzc3QS9JJlskaCM8QklLM0piJTB0PjNccDRuU0RnZ1k1XF8oPmwjNUBoXmooNSNnIkREQVsiK2xhOVBtP0hQcChWb0UrblshLW4tQFEjNi1jPF91JV8oSz9CI05xZ2dQSixXOUkmWi4nNSt0ZWBoSGFZJEswSl5oYkdjX0BXNzdBbTVHU2hdWFBuVD8jYVc7ZWdCQmNFJyhJSDQmbjBwQWtRV1FxZkJdVEtcSjUvTW5wdExbbSpvYG5fUDFCRy9ZbmI+QUxzbGkiZ3QiKyJQV11EaUkydGlZOTJRXzIkYkJJMTEhSlxHX2pVSVdgOC5baikqZDVDSyU/XC8+bTJnTSlAR0hUVTlWIl8nXUNyRjlmKWBAbSpsZ3RXYiVJUUNxVzQxLFpRPjpiNS9bLF47P2pJRnNSTFlJWTRuUDIkdXJiUVNTaS1fUWE5UXVJdXIudVUlW20sJitFTE9sKSg1anNgMHRAMWVqK1BPbDB0PjNeTnVnJGNyTlJST1tvaVFCLDZrVkFHKzxPbylNOzZGYztfYT9wO2AxTDo5dGVtQFdBN2gjLkhnP1M4ayI6aSJoNSwnZiE1c1lwMjBpKDVrQ29TMTslPlcvMFFdYGxbaUFqTjIiSi9uMCpSQkUnUVtPOF5mbE4oXlFDKHUzPyJvIjBdNklcRDJ1RU1ldVRZNlVDKzVQcSYkIkxtOjNOZHJvXFpQX0osWVc+XzE/RlpRQzE/N2NAPis9OGk6P0tmTkIiNWZybClCWFpnalZiNWBvNlZBLjxncSNONTcoTVtvM25vXEdfSEk8NUl0UkonS0pqQEBKNnBjKzFmMGwqI3EiImgsPFdJbUtTUlw9TGlWU3I/KThBUzFZZl9zT3A3aCcqJzRzJGBHdEM7bytTbydwTGdvXXRPZVpacGRXaTpfTVMxSlk3bmdnW0tLO2ZWWGZGVy5QTzFeRkprKUldSyM8SklhKz85PGtYJDlxSllIUVRvUy5HNyFFclNFLG1aQjZPZDomaXJmVWdiWl0sPmNpWFlKMUpqL1hRKk9vQk5pKCtrZl1WMUQ7cy5qVCEmZCleUkZzbmFsOlNjMTEsUldjWTZbSigpQG5ETEcwSmteXS9WYVhRN01sT2hfQ05FOzE1TCJoRyZoVHFlW2NiPGFJNGtLTGdgVGBfJUlRY0Q+VSNpM1k2LFs4alBtYz8jZS5hcURwWUNrUEFjaG9mKW0uZHJlXW9YcDEsSSQ+ZlAvYVlNLG9ATm5bJnFZMTMwWlYzZDBhaTFuYV9La1Ajb1JDPXE1JiUzLj84YUtXS25PI1g/O1lbTGZCb0lLNF80aCNMKDU8VnBSVXVJIWNUUWlRPzNATjlAYjtvXytQNDQqb0pwV1w5YWhkZnMnJj5sMGlDK2wjT01GNFpmIyc/USdzUCUnLGdyU1w5Q0oxKkJXTHMiOSFbXGcrbUZFVyQiJTwiRHQnbF8sUjJyJ1FsajFtIXFgI2RWMnQnMjdmZ2tZalJjWklIaDVTKF4/UHFTViwvQG5HLigxJi41Y241bEs+JFhoL2YnTmlENFtxZW5Qc0A1Q0E5UDBLcilhOixcNTQ+R0BPKFA0OkkmYz85XElxSkJ0LVAjX2VycFAmK1NeIWdub2czZU05cUJXSXMwITMsSzRkJj9jYjpSRSNxKyJlZFZMXVxvTFNkOlBGXy4kQFtGSCIwXGtXJWEocTZeSW1DQm45M2RtUXFoOExqPjJyJE1mUUMvJStpK2BWZEVzYz11UnVSKUQpKCEsRGcpL0tmcTQsKixVR3NWT01QN0UscjZASFwlSTYkITVlZD81SGg/VHBTUjpTUmNeLXNZXUdfRS1nOTdmTmBsaWZha0w0W2owOVIpRWI2U28rbih0MihKNmk8XyhcWyw1Y0hgMTJUOkhaSShuOWwoL1wjMylKVFpqNiRjRydYJVgmJ05WTGwwMmkhK2BwLzgtMjM5Q3NXRiVXNWE9TlgwPSc8WkRecUo9Q08oTTY1XUpfdS1yTSNlLVNLbVNhM0g4bzNxLm0xVF0rYU9VdE9KZj9iSFBDamcjQi1PMWlOS0JXbGVUQDdxWmltclhEVSVCIWhQUyZvSUNJRTtKNkg1XFdKLC47Nypwa3RGaFNgUDRVSlZVMGFkcDJUMHJnKV43QENBcjVcOyRzOD5mQjk1LC1jRSwwWTJyQTI6V2tBPiROYCM0PTU9OUJpNipgS0kmNHBSdHQ7QCNzbSkuc2c9UzVbcUxrTVVFPiJxOGNEZWpnIy8jXz5aQCQmRmJlSFIkMWgrVSMpPUluM1JtYloqOV1WJDA7UF9cbkNHaT9jN3UkXjc7WTgyQDdBIi49RVRdQ2RmQTJsTnRUXnE/QypOMSgrTSVFSmI1L2AnNmowdTstMWlhIzU1L3RhPi9UJy5MJmkwSyVxYyhqRz46aT06XiouXz5jT20pYzYuKEszV2pqci5NW0gvXWFXXV9HQjg2YyUuOTxXJkpqLVBkX2YlcCZcM2xuU3BCb1Fkbj1XLDpRM2Y4OFMhMXFVaV50TUY+J00hQ2c0UFVNKk9GQk9zUFpyKlQmb19XP1wuZChzW1ctXyFyR0BhJyxbKnRDUi5oW2dyQF9pWTB0PGJbRFA1STspJFUpME1cIVwqS2BXPkctK09rMjMyXUVhXzE4cltZLl5XTS1FVyI+MjMlLmhvPWc2VCY+RTlsJnFjRGctS1A2aFEkYicoaERyOVxHME9LQUw2ZmBBMmhNam44X1Y0YyZQYF1nOHE8LV82TSohKTguSzg5WlQ8NnMyNWoxKlRxTTdGPmNhLGQwZC1QNzFwQEl0MmFVM2RxJCVUbFI9TzJpWGBYJWxcQCYhZjF1OWVEXStVKkEhVFZpS2dfLSsyLGwxVHRmQT9OJUYpWW8vT0RVTSU+S1s4UmdcYF48cS8qbyFqY21UYDIuVlptW0dUQjg4Jih0MG5pO09kbyFjPjZWXiZcSVZcWmVBanNJY2BubzQzLjlMa1RlZ3JPITxFOWgwPT8uN0lhSUI1KCtbcEtaVDxvTlhANippY0JPLEYlYzorNzcwX3RzTDwiX1M6WlloT1xMMS0+NTAsLlg1MGBpPyNOMDNua0VcRzBsRGJub0o4WUY7SkVFZUlnTWo3QFE2RXJVU0tjVGNSOG03WFkpYlhoc2paPis4IltDYkFBVHRNJmJJXVAxKENhPmYhSGpmRypvOy02ZXElLWouJS1fY19cVW0kamFbb1xqKmZNUm5AMSo3Wiw/XGAmMCtvdT5TVUFaJHIiRjI4O11qOUBaYDAnR2o2SSErJHBXOE4yXGJZNj44dCg5XSN0cHUzSipVK0g8YVsmWWEnYFE3aVcmb1tPLVRUQmtLYFAoLyxwaDhJLig7SzBrPUQyMHNTVFJnVVMtRHEhVGJsSl48N0FXRitzRDc/SjtiSyhuRWEtYFljMk5GMFVqJ0xLcjhuMmdVKWZGUyFYZ0heKS5rWGorWVcqTGhOb1hlcmtsXDRgOF4ucCQ9aGxrVUBJUyUwSjtbaSZhXl1haTNAUjkmLmNwPzY3JDclNWZqMyhoPldWZjMmImUxPW5fOz4uRUU1Jy5VSVMiU2AoWWJXajhJWWEhZTYiXypkalVwYiwxR1tTJ3FBMlIsRTFwV2c7NUBjXUFgLXJKJi1pVXBzUF1fP2sqMCQwLVBTQiQtVHI5PkokRkphYm1UKWBUMV4xbXNpa0wobWhfNTlbUEVuRWxScVcxU1dGWlJbalpUVVAjOU5rbmY/Q1JeLHFCRFpUXERUPTNlP2RNckVoT04ndVwkLyR1ZWghUUIkc1c9ZCVJUy09VF5mSHQiMU09ZnIrT0smQS0yQDVpP2wjPUVDXCJxVVZSZFdAVmE9MlheRz9eZVRTRk01PDdORyZkKnFII2JdakpfNVxQQkZZVFRvQSJCdEBjNy5zc2YlSFVAJWUsMy5WLWsmRS5hVnVDQk9dNVEkKlVGcjhTUF8/K0daODFOJHJhdSEjc0BsSGZlK3EyPHExbGNALE4hUyptZTdxVFJXZmM1cSZAUGFXJk06JTJeVVxIJmQjKGdlJlhWUmNtcGZOcTExTHIhbTNCVzZNbDlyIz9FPXE1LmRsSUwkbGZuSSpFaVkiKDcwJkIjRGoxTiomLnRLXzJOVW5sQWZbbl0tcCpnSi4qQ1RgO29qb20hRFE2XVRZIXJkaEUyLmRlTGpsSi44aXNlXiVCTFM8bCJYaCFCW2FrTD5IPCU9QHBZNV1JQkA8XF0sSDEqPW81MVlobEo7Z1NOQVVAcEYiZ1NpMEhuUGFwaCkzPkZRRT1DcStKXlo7LD1mWDEsSklEWWZsUS8lQEdnWDtqK2hHJUJGOHErc2svVlQqJScrKFBiMWdMdUFfMDZmQFhxOSU4OGAyUTgvVUFmaSxOa3QqXl5zMSEiRyNHT1ZYOmlZQTUlJHE1XjRYQmkzZ2BON01cb1FLQCRDcENLY3E5blEuPTtHP28uY0ddXVNDKilBPEI5LSFuYig/U0xhMk1eUy5FQGVDSHAvSnA5bUkpIUQ1cVhNQkVpUlBfc1pNblo8YkNJQEVqQV0jS1ZtSjlhOEw6L0RIa142Uz5rIXFUT0FRU0gsXyVsJTI3J0xsKEpNOzc2OEhnZmdgVEU8QyEmTHU7ZkUtME5fLVk7MUEha2dWU3RgKWYsOFBWa04vS2EtS3BdMmMjczUtVUBtYTNbTUQ7RWpCJl1UYnFEaU9RJSI9J15EcS0lO2RQNi5mRE5YSjFTQ0c2KVIicHAsTC86RGVzUTwxRSduMHJvYWs9ZkgzOCY2PydEPWtPMUIsO09mY1Y+PmQ/N2RcbENoLlRrMkRmW0xQNmVYMHM3JmZedVluKjpVLkxWMTJnXSkmJGUhREc6TmVcY2pUOUhfX2NoQjAuRGw8SFFTQVZKdGVxPyRgInUxcVR0Uk86QUc2cWJla11URiNMTlxmUjgvITBJTnJpMEdocjZHUE5IJDAjXV1vKGFPUWY8XDpbXjJYImtfJjgsbFhAQmp1aWhdV3M/al11YEUkW2w0MWRaJ2khMmJcVlhLRVZcUUgxSzxoWD90cz4jcCpITEduJnAvSGZWbWRqUUZuJC5rTT84VWlMdSkoQk8mb2sqSC0kXyNrTj4+MGdRa0c3M00oUj0+cl5mSTNHY00zVGs1U0VIQzNFVzxuOEZVUyE3VlFmPFlxaGNpOj4vZWJVNFwqKDpnT15COEpuKWRBby9nSy1FZTxJYm9ZLyo5KDs0Oz84UG11JFNKNiIzIipRajRcVy8+RTctRixuX2lVc21XdFpvJmhcXipHS0d0bHIuSz81bjptNi48RlxsNElLTjhyOk4yNmssYEdDN0dXN1ZWQU1VKllkKFo5JXJEQCpASlFxRz9kMChHY0Y9LTVTIUs8XiNTSyRVK1xkbDMiT2lQQlM2NnIzUWlgcUEpRTc2IVdDNUVFLzonXUxLTkRaLk5hKm1KcWRHbXFXM0I0UDsvaHJPSU9mV05UOkswJGFSKHQnTzJCI2JUISk0bHVpRjAqJFpBNW1IVTRsUjAwSyU3UVVzTURgIkIlbSRLPylkOFFAUS8zYDRZclolMzMtR2tURFFbIUo/InE3PSgvJl1ScFs1XT1eJEtqOktmIzBibG4hajprbT1XJVFYTSJKSVFjTkleSzo9S2U5Zy9UL19LLjwmKFJdW2k4KEdQKDBEYkVcJSZYa2RzJjtDXE1UMy1jVGYqI0dZQSE5LSxSWUBHJlVHdCNERW8qVSJeS11pTk4hOGdtOW9gVDZXLGRmSTYlWS0tQmVNLT04VjBsWilkcHVHckVFOXApcFdUNmtHdTBxT2ooMCMjSDc8MjRtVmFWY0FLNjhqU0NSZyVuJC42UjZRK2dIJGk6SCswQzRoYjYmaV8rLldKMmpxLD1ZUmw4OiZUKGpuXCIsLGIkRVUhPnVZUEs/WFEkZyRFRms3dWpgRkYhVjBLQiRlYyoiM2ZZNEppLDlpYylsXEMya2wnclE3aTAtOkYxJzBdPF0jJSE2NjcpdFxJT0U4VV49MXBgayxgMGpbWl4mK0xZVDc1blBbbTBZLGo0OnVYcXBGNVw1LyQ3L1ZsczoyMzRFWyE5RTxrcU0sJjhQI0E5OU9TK2lAZlNuKGBUR0kmVlRRYm84c25KZlQnRSc2OUI9Wzd0ISVtW3AhRy1ZR1xMVXVMQVMmXDc4NE9NJW1HUWJKaU5xNWUzWC4jWjlSbihSU2ZiYlsxIT9AYjJqKz0uVCJQdVRTJVNoYzElUTlYV1VcZ1szcm1YUm8rJEYlUVFlcVpIXzxZUHUjSz1fRkUmXDg5bDRvYipTNGBqcl8rY2tWOEwpUlotZ2snSyRlUGFGXC0xJ3I3V0NqISJ0aiNgUGssLV4sYGA3XzMhVHNSWkxPJkZfSXJGYU8mPm5ZaTxCUkExR1cpZUs1PExlMVdCRUo7aytQKClpWEFNKS4qXlwvUTdPSl9XVVxVXDdJIzpmanB0Ui0sO1okZHVvdDNQTUFRaF9yW2FEJiZma1c0XmFDTSNTJ1Q6Iy9PPkRyTVlzTXBASUhDIj8zQSZYbDNrTzshOWwoMkFnUC9QQ2QibF4+bjFaTih1TUNIQ1llbm1MNypzbnFQTmBSUDE1XmRRaktgN3FWKFsrb0ZAMTJqRyJCWElNXi5TTTJMYidRWHQsLFktZjdePylCTGsiYjMsKzdUUjxQUy5PKUwwRGJbL3JuSiNIQSU5LipfZS1zLj9uLGZzNk9dUjJyTC91bjArb2NRO0dzQyo5YWpHSTMxVlpBMkZYY0IiNDdzOm5nSSZaMlEhcjNIcz9YSTpbIWE1LkRyWUtuNDJwblxYQE07V24qSyFbNU8wUi0jQ2ltOmh1QUAnW0ImWEM3P0tJY090U1hHSi9MOVJsSWBtcWdaV10iZSpncWslXzNvQmJjUjU0bzkkPm45LXBnLGdDKD0mdWBAWExiZEFVJVxBNURyODIsV0wkcC80XmpNL2paP1QzLjJXNS1fcHR0WWNrOHB0a21hNV9PVzFTOCY4LFo3R19NYWpZYjNfXnBaX15zW041REdBQSsubCIuKTByYDtwKCVKUXA6RXE9XnJMQWg6Y2NtJlgsWFNVLzZhWUolUGttP11uWG0nIUAmcSJMb25RLFFgXF0xVTNVNnUtU1BzJ2BzXiIhO0k6b191R0omKEVHYyo8Kl5kKCImU2tWPS9mPUc1YSdkNE0yZzVLNkVFIU1aSGBgQEZcIkhLOEtjTCk9JS9ncFdIPGVtN1xxUjdLXm04cHJpLTxcJSY9M28oYFlrZ2EkLl1HV1EiYiRWJiw9KiQkRTxHSW1OYiU2Kj5CaiJeIlsyOiQraVh0SF5QQD1NOzVRQ1lXXFgocUJwPDBVRDc8QWtpTlp1LFBRSixmIy4waU1BKihoYTRaJk9zUUguWmlUPnBQWTBeXWhjO0ZHdW8hMjZYc1w1PyNgPGRtSzNeOmxnKV5ZJXJVJ0VAL1ckMi1IcyQzPEA3RG84XzVdLFsyWCFLW1dpU2pEVWNiUSJoayNqJEA8O0xKbSFEJz4iQic0LmNFTStRTy06TkdkdS1xT1xNaTlON0xqJm5sUm1nKEhaLClCMUMmOC47PCg+bm9LIis9RWFMbnIvYDx1MTxwK2VAT2djZyxGLUw1K3MhRGNJWTI7PCpVa1l0cV9MYmNYWTdAZFQ+QEx0SFBoLHQpZDZaJEFlXCchKz1DImJnXShYbDRvdEBMIjg7ZzRORG9kb3M3PidYNmhRcWBoVThhZj1dU0BhTiI2Z19wbFQrMGhuZDJ0cW08WnJDSGkoNyhmKmItTU9PZksuPlA1VmMoPWdTVlg7b2hzODJLV1o4cE9uIklvXlNLJDchW247MG9FX25KKWxrJFdpYyxLQENlcC02XmMlUnEhLyYzWTlKXHROUiosRUw7W2VdZ109JVksZG0qJGk+JSIiKnBLZ3Uncj5HUVZAWXJ1OkZoSlJJRGZEL09hP2IuRlw+bDQ2a0RiZUVYLyM5dU9ANjJwTChpUlRhamZgRipzKnRESnQ2SUpJVS4wWGMjSGJCNzddJ0IsWkFRPiNDSz0tJXVNUG5bY2lGKW07YVx1TGYkbG5HalJKPkJYNUhJJEdUQC5DOU4kKkk/JXBWNSxXWkIiOkNhPilPYCNJS0xcIS41IyZZLyldPmdkLjpTZGtjakU0RG5jU0k3WD1bXGB1XGhuU3BNYShjay8nV0hgVV9OPDlgYWIvWl85NSxpXm1tTSxJSiRPLS9yRzIxXlBJPnFMXlNdc2Q8R2IqJ0QmbGxMYy5mX2pGUXJva2c8SFhTOitrQjBfZXEuNzZTaVdqL2NxQE9xTzNyajohKHUqR01aPXM7ZEVeLjsscHQtJyE1PTBhQ0ErTy1KVFdHcjJvXlxgOEszIVxAIUheImBBOms0aFJES0ppOCZOLUVFZUBmPWxuIUUiOTY8Si9JSW1KNiw0YiE6TClwa19DQko2VUNNalo3LkBBUVo+J25QR21VR2doPE9HJFptLDJmczJgXGxDSVAnUElJWyhsQ3E4Jy87XyJ1UGpLKDM0VkZEPVMhR2ppMyQpcmhkNTMpRzZwLGluaz9COypCSzs0YHFDUyg5Qkk8TyNOM1EyLSRQKXUyJS1dXVwydFpAcyl1J24pJyonKzhIMkAwbVA1V3E9algkYyM8XiFbVUAoZlViJFhGJ3VnJk9BTCdvV3NRODowOyIqaUZZRGskYiY/UEdjK2dhYklfNXJVOFUjXG0mN2tCL1B0Y29FY3AmJis6K2hQYkc4XUlvPScoIVE4KWhwL1VfWFB1YSxMN0E5JHFaL2xwYCdCPHFJMm03YlIia1s6IVZPN2deVzAmJGplLUxLMiVGKU5kKSJbO1tZNUBqZGBsPGFyTVRZWlg/RGpXMktBXSRVM1FFR1gyUW5BSSIxS1U6UWxIL1UyajlNWVpOLDElRUhdUz9jVUFjX1EnSVg0cSFVUWg1JG9ybS5gazcpJ11aOik6Iz8/X2MjVz9bUSxWazhMT1QvRnJQPygmYioiLURING1xNFBMRykkQlZWZ3JlYjdIZixJM0YxJ1h1W19YKzhIMURuPDI5Pi5MaTxcQEE4RGM7ZHMhJC8zWUg/c10hTikyK0RQOU1OPWFBKUxyPTQ/QHFYNHBPRTM8aCglVGhUMmhWbUswXUUyOlU3LzgmKm9oQV0rYV4wVWFwSDQ1ZVJBLjRrailTVT9tSmIsPS85Xl85MF1cPDprbFVTciwyRDsyaClOYFBRKF5NaTgiRik8MmluWiI5OmxZbnBgcVM0ZV9JZk5ePGknWEQiOic8TWMkTkxWQC9PUT5zR09PNzAuKEUsWm4sbC51P25VV2NVPyItUil0MistVD4+YW5OTzohTVVCLC4mNHNPVzhAUUxYUW8naixnTyhVIVdMODk3cW0pJGYvTiVbZUUuaFhFPSZfNzUrL2hSKTNoIjQxSyxOL2pFWCg+YSwjUyU4Pi8tYEc8InNVZFgmMC1BO1w6Q1RBNV9GYHVHSWhdLkNARShvUDMtNWxCNCQsWGh1PmhaWFkkVFVYOEk6dWYjJGonL0tWYXBlZ3BzPjolcThlUF9hREpLLF1ZbkdEYjQpcFxiV2kjIyVIKTJmOEYlVWswP0VebzA8ZS42K1w8OCNcQ00iL0wuRjFONCFAU01WYFheXWQyYzFHP0BcZkE7W2prZVlUWmZHcicjQlFoZSUvY2dVZW8vaklxLTlIRkdwKCdDakFITEsxakJ1QV9FIWc6TDVML1EpcVBxKGoyRlxZTkNUPUVjIUxwRXVdWitLJWwiZWl0S05sVys7LkJwRT1ucjIqaERAb2AhNF5CJCdlTSU/XEBBb0lpXWZYYzxgZVlmRlI9aUFMWV8pPmknXnJlWl1JZTIiKVYiZ3MqYUlLUWA/ZjxWJ1oiZjMjKDJcR1BAJywkZkthVWZPPHUmJjhzZDEzNlAhbypcSjJqNl0hXmFRW1BLQnBvTSVKWSJdQUQ1UUNEKjMkVU4oTSlQNEBwYE0nSDlfaG8xL2E2clk9bk4rNzBVT21MaE0rdFgwImxCLEpgOj9LOWpLbklZNEBrMD9CcW1KZU8qaTorLCRAbTg5NkhzRTRiVEFTOHNkTjlzRVk5TiM9a0FQJ3Q9SC8kI19KY2I7NlRqW2xcJzVSRXBdMzpzKUQsPyZ0YShcPVNKZkdORHRMMEljQEEpUlZkI1gjKUU7KnJyaWg+LllBajsqbzE6W2ZUa2BpQF1kaTxOSi1LTkNKRWpkKG0+ZWY0Z0crN1k/YEdAXEBTTiZNMDs3JllSXyM5UEFnbDdPWyNWWT5GdT9pOUpwTWwpS1g5TWFcZkpIbk5JXjNqPCwsR3RXJT5KYFhxMSZvaDFmJjRwWElMbmpBQC8jMlZVYy9eJEBvVzViOD9YMlNda0tLRTskNmNPUUlkIm49QzZTUkVPdCtAVjBwQyZtW1ZaQEleKkhfPFIoTnNnPltfaVgvYDBMUUpCMztQTEJNTC5AOlhhUm0lJyosaWE5IWk8Qz1jcTNQSUNbSTZAbEQkLFRbbCdHYWtfLlluWmA3bWtqKl9KOyRxUEVENSJYazEqQj4+YUVnN15wTF9vKC5qb0lbUFMtbl9YVFtXQz9haUZBQiM5QUNMOjZIK1lwMD4kO0gnPUlpTTopNW0vTVM5O3VhQ1tEMShtRnN1cDBTYlM5J1dHIWw+IUJibDQ6VytpP3U4a0NyITAsRGErPV80WW1Yc1Q/NTNtbWg2XCpQOCQ9SDAiYm1pRC9KW1ZCUipsUG5XdDFaVUY4VDI2VC8xKWZpVFZvJDpDTi9hb0VyPG9jTEpib0BKdEUyMkBwZm5ARWVsMkJnTWpBPio3OyJNUFJWSXEkXDRhSDBmbT8qcXI7aywtRDsqJVlNZTxHQ0xmRl8wKUwjOmA9RzpiWChxZCI3XS5tOS09YWFbV1EhW2J1bE1UKDQ0Uz1ALHVoKG0zZnM0UyUuIkFKR0ZbKktGMCJtXVdYaT5kWDhBN2IjWSRPIl9tJVVFazFvb01PUyYzIVRnTSNVQ1VlbiFPdHUjK2RLXEVLVCg6NCJzOyFWLS5hPF4rUzhyZWZZVHBFXy0sSk5cRnUzPzQ6XiEmJUBqUDJMWTFvKHMpKCFqL2Q9Tm84Py9dTyZGL1E9Z1RpQXA4J1JaNEFQOEwuWjxrMDsvLVJXYUNqJS46PD5FQjVPXFhbKGlCPihbJDhCNldObTtmSmNUJWAiQCUoXGk6S0dHY0AxKiRhQEMxOXM0aUtvOllbaGxpWCgjZ1pbSC9QOVJCYz9Oai5BPmkjPG85WEJlIUlMTkxcLiFULT5lPVpZUWo0RE1nMF9KPlR1JWw6cD5PU1pPUzo7WzMhVVAwa0sicTovb1pHO1NLXDEtQCpaK28vOFM2aV1rOTdzKlcsSy1FL21qWUBnSDEtQnApQi1kSy8sLXBNclBiV2NSQ1YuVCpsW0lILyM3YG85LUFIZUdKWz1AVUdtcW5GJmtPYUptWjRST2NtI3VnNFBAaS5dUkVzRlhcTFJOQTxYXlxZOEArNj5XZj0idGllPnI+SFRoN3MlWCRaQVdeIjtQRldQLCREK2FyU0h0Ki5aZiRRUGRkPU5QdVczXihPXC87REs/JUcwRmItLEpHPm9TUWYmKi9pPilPWT9UPjx0b1k7RUxdTUssJVw+I2RtVGwvSnJySCMtUDAlISorSCpASlI+MlghVVUsUVdTT28uJSFRJUI8b0dRVGYvcFcqZVtadCRRcj8hXlE0cC1YNy46JE0ndFJsNVJILDBvTlpjQERUXV91aiUkJ15xOSo0b2kqQW5ccGgqZWxHOWtNRXNMVj0nUkojbmdyLWtUTnI1ZUpoQiQ4RDVEaEA5YHMrYitWSFFNLmFQZCZiKF9RLkRWO0l0VWpQdFVVJC8zPSlkZSRSWUpFYzwkWilKK0tPRnA2Q1hQYEBmP25QOS9ZKC80QmBMKSpFWldObEIiNldKSmUtSV4nITguM1gwJklBVzg9bExdQUAxa2plTiY+Il00WScrcD9vTTdmMSJHUjY6dDs9VkVFWl4ycVgiKExSLSFMSGxkNGw8dWJWMFtMWEMvZjotSDhaZyhiXVxWLGloUHBzdTI3UFpXOnFOSThFJjA7IU8/aDEkaUZjZzpjbUFkL0RINm9HQysjanBoTGtFV3E/X15IOmRkb2oqaGBfWTprL3QvQmpYQSprcCI0UUptOlFUcSUwJ1hYMnVBXitYNSZwNDwyOWBCcWRoSWtMKj1KTl9kcl49PjtVMy9dYS1ZUldKMGNbdVw7a1xxLj1yZyNKM2trSENDP2thIV8nWEJAOGZuWzAvQWxLYU4rNGVhPnNFWi1IXzYxISFWbDQmTWY7LkEnMChnQkpSVlN1ZW4zJGpOYUleXik3Q0NzQENdRmVZMV8rNS5FQUVKKyMxQytkUjFYPV0nWT5bKnNlPEc3WDk7P1YyL1A2PVplM3FebUA6XzlbTGtSPy1Zb05ASWs0ZE8nZV5vOnRtciZsOk5dQnFNLD9iP0dVbms7am0jTDBYbTRRRD1sLSRUPCooVE4qTjdfQiVqSl1GM1BrUldBLzZqRzE7cmM1QFRibGVzMzpTTl1icHQ9JT9XVVQzPztwQlRPJDRoIygiTFJoMXJGO1RTUzZFWG5fP18/OmNePjFUT15LVSxYWmdobEY6ISdmNUtQZGwlODRxRyplMk5OMSE2cyJeVSsrTTYsXiFvVnVNSWtuNj8xNCxsaVlodVhhKFlZZWQ3XCpqJC9xImEqJG5cckw4TkhOVTFVWEFBOXJxOk9JNEFPYWcmamlOXjRLXl1fWm06XEtIRWonZkhyUU1sKDt0YlY4Z0hZQlRsWWQ+IzlVWm5uV00mO25xUGxocUluUHApcUkjaClRXFRwY11MdHMsIlkwVl87dXRyVFtjSWA9Z2t1VVpFMUVMSW1bXi8wUnIldUdAM05VU0hIb0xkPEZYcC9FOC8pJi0pbFglOjBdPjBjb046P2dXTVVvOCJWRFJeQE07bVBSZUJcVCxhYUFYMy5lWzIlNVdCUE1TXWJjQywrYzM4ZmwmRTQhQ0wlLDYlRjokUFtjc105dCE1OWJRS0hEbCYmWDFsV1NSb1lhWmNicmpYJVEpT11pV2hRSitNTEo4PT4pTCFPQnM+QW0hL1MxbDlASDo3QzBRbC51KmtxZy8uYl9WUEJnKTBgOnRhZDw1MCZZUFNLSCZdNjI/YWhjS1tpIyxJXC9DX0VdRVQ5MjM/S2kuOzAiYkRqVkBGaFpIOyZGPF9NSiNpIi9pXzpfam9XJyNAUSRmKlVCdG9sY01aTmVCJ0hkZGhXKzQhXSJZOSxWJ2htZy9ja0pLUDRZN0VRK10pJDI4Wi9Ca19ObSVFTWBcYChmcig+TmtDZkQuM2A+c0dBdF82Y3M9Tm1HQ045JltXW3FsSUdVakk9Sz9eTGRFLkpVS1M3IWIkWmxQWCQvVSVxKFBjWDVII3A1UVQ7MiRmJD9EVktuV2hrIyZGQ1VnSGFXUnVtbTslOmohbGw0MDkzSyFEODo2YFxdJUxcdUouKTNtQFgwY1AoKSs9KEdoJEhZM10kVSYoU00/ZT1raERdVC4xa0tmS28+QSRlV3FTQGxXYkZSdHFwPldqRzpEbGVGamVZKlAlaSQrWkxQIlRaKzFpV2I7OzpRPWVQaDUhTCRfWkoxYVdzRyRbbWAnMFFPLkkuKEcyZiUtLVRVQl85LidNayxbLnRxTjgvMzREUi9ndUU5NSlbVmloVCpwN1dKM2gxVXFDR1JWKVVDZFVudGNwZDc4Nm4vcCl1VlNYNU5vJU4vZURUOltCU2xkOVplV0xPL1QjOSgqU1pxSkEoRTIxRjNodDZVOFZkPV0iX3QjYkNbKCpWaisuT1M+W3FJVFpGM1lNPzI/RmVeYVhPJi9lX3BWP1xKWWskM3BKVydIJTJjdFw6P2FfaltHOUJvY3EsWDxjRys/LyRIJyxxZktgJSliRjcyRmlqXjxBam8vRGhPSFAxbXNzRkFSLjZCPG0rVDVPczhNbV83OStXWF8xUXNnXCheMkI1aWlvSk85alBrLXB0YidLcys8SEREJEpPbSVXQWlxR0pgO0MhQThSYnU2OUNeMjwyV25SSFNIWklhVD9bZGQxIkEmQ1VqZFReWShiT1JxayUlOnVsWydyI0g5NWE8dUQ4PUNDIlFEKjlfQmhcUEY5IywrKj1vPCVdVjtxJl5dLzArSXBjSlBGUCNNNkRaUVtEUlAhMjUyV0koZD8oIkgwUXU/PldxanI0X0RuXidLOC4ycGtgWDRAaSVjYFtnSDRvJiVCQDYvWERLWzAzOiE1LEIhSClNNm5kdSFcQztnQTVRZU1LK09vQzs3TF9VN2hbZkM6T1RmaCYkNmk2RWtYYWpKNkgnS29dUkV1M0wrQXNzUDIrUjdNRSxxQmxTOEpkSlAlJ18kQjhPOFhZWzxhT0RTR0oyPFMtJDtFNVdMP28maWNtUlEhRCxkXW9MIlFaYTYyPDRbNlZRVD0pSGtLaVMscG1PTDBYZFhEMGMtbiYhKSY8U1UzRGtLPyE6UFBVPWAtNTUjaEJFaCNiaCk8aSE0bU5EOEBldEdscTVSREdlLmxTLzBNUT5SSlFYU04+a2UqIiZIIS9LZUw4UWxuT2Y2YyoiKzVNbDswaXNmP2VKV1NRIVNOP0IlT3R0QmZlSFsmWUMyPCpQPl1fSlUlUHUqbGJFJDskJV5gXUYzRWBtTWdsZVV0YVUpRSEhb1FEaCtmSF0yZ2VsWyJlJ0xudG5fcEFmRUBVSTgjKkJJWEd1Tm9PZidldD89WSZTOVw6TCFyKEJWNiVhZSsqZ0VHZmdIZT0iInEpJCs4OCkvX0Q9T09WYGtwXzFJUWFPJWNASy0mS2M1VlFkZEguUDFpSS5RMU4kYD9bWlpUMydzJGJrPyNcTWRWbz4/ME8pWWw7blZoUFIrTD4vV15HN1lWXl4hdWBHV3BRcmRXQCU2KlphdDQ8Z2wtbCszKVBkK0pQOiNgS2g/dV5RXDVoKTJZQm90QFBiZ2pFJ2lmYydxRVFxPVtURUpFYyxjY2RFJTJMSERBbHAyXGBeYiZnXDhBW2NGXlM3Si5aJTZxZV1uRUUwMikqXFdyRkwtVnA6c0E+ZGQraTNhJl5FJj9AV1FAUl8jaiRWMD0hLGVHPFhoNWEsYzozIUZnaFlzSDlwTSJAQ0NjXzEyXVZVKWh0R29aY1VrQTQuNSU2Tk5wKDI3ZUBCJ1lJSihqTl5WMExzLSkwY1MuPS4jLTYrLklqN0lySjU4QlRmbmdtaDdsZ191NTRkWlhTMUEwW3BZZj1sa24zZCJxc0xuV1QoRFZmPWJYKEYuay1RakErRzJoJGw4UFM9RjVzNEFPNjMyPWBpNjtoTzlOb2BdMUNAQmRxJlY3cmYkWGEzbD9XOERRWDtwbGZbUGFgQjIkSVtDMWFBWkFwJkxqTmZjK04kcEFVXlw1YkpLXDkpUTQ+clJlVkciLlBHJzA4bicuIU9lNE0wSWM6J0RTRz0kRSZQKy9fQCxjM24uRGlRTDMqVU9Bc11VKlxKIkJxVDxMVi9pVVVAXCJ1VVEjKTNpRVFzSj8jW3Fmb0hOV2xqYVQ1WGBlZGczdS5eND0mUllXVTkuTkxLI0c+YiQ4ckZsMlU+XUNoMjI7ayp0OC5PNkJqWj9CTXJGYGcsQTc3MEdbLVlxPVhtYUF1U0UtKFZPLjtaazRVWWAqT3ErIi5ILS4+L0FEJiw8bzJAXjonRyFWSCpmNyRXVDpmQzp1RyxWXD5wLGhgSUBPLCtiQiFhT1lOMFhRQCEmcUYsYVZZWVYjKUE+WUFKRCcjOkY2NUYqVj02Yj1xXFsrMzVzMUMtbEg+ZS42NSxEMmdlU1ZjNjxZNGZoIWciQ1xObkBEPjteMVQ9SHAhVV4uc2FTVGgxOWclT0kiTD9lPm1yVlE+TVJzW2Q0JE8uaTlhaGFoIyE/MypdbkhMc0ZCZUVNMEVjQShcWDAmSV88al1YT2Q4R2FoS2FRYUkzOCRVT2g+JFcxMVxVN288RGUmImQuYE89al0pXCtcX1k1dE0kVD5jOCNcRFtfQ0dJLD5VVUVtKitCJF4iRzcpPEI5XEMubltHVEVpOVQzMShMTT5DYUM/YUdGUkBRV2ozS1ZhPENbUVgqajJII15AVTJPXmUpJCE3cT8rV2EocisxamViOTwhakRsdCU1Jj4nIj5LYiFVYGAuSlFkMjI3RjReLCFJOy1TMGVVJ280XlwtRmdFWmJUc2lTX1poMmY2STNrP2BaKmxXckQ9NF9mcUZQcUFlQDRMTip1QU1HNzVvW0JkY15ZXyQsRSYuUk40XjshOHBTYTg3QWxKO1lINDtuRyxUUThHUVZmM2YvPGcvSmFecFxmP0ttJi5ic0NJRkhwS0ByXmQ4PEVGPEksUzEzYmVpUVpCPEwtWUdEbzphLW5mM1xRamJGbCZESDo3XjBPOmsqQkIibFhmb1QiaydTNHFCMWAyPUheRlMkMiQ/R0BLT107bkNrLGVbYkcyM2UjMllfYWc3RGNQVnFQRTZkQzwkYEFxQ1lKMXVMLS5HVkRTO2k2Nz1GSmtHP1xaYD9Gc0ZNTm9kIWozMVA5VmM3WV1LNSIiXjRjJ2ppRmVnKUo8bDJIVG1QXVYmO0U0MWEyWVJXLV8tTyUiUWxOUUhlRD4vbEpNcThgM3Q5KEtSY1tHckg1PDFBZjgyPFg4PHFiIVgyXGdtS1lWTCUqTktvJDlAZmlVL2YhUz5wMVdNPD88JShPOjopQXAlUjY6M2JGLF8qcTszTC8scGVNWkdnUSkzU1ItLj9KTkcqOUchQUdkZEAiPEhrdEUmM2U7aT4nOWtFJlw/KEBqKWota01oRmBSaGNxIV5gIzpiOmcjb1VROlVWJEM3MCRuWSk4QjUxIVtVK00lNEBZVTc6bHMuKGVLTWxWMUYoYV9PLzVYTHNRdF5ZW2BXWFpCRSdYZm1Zc3BBMThbakZgTFsoXkYsMiNCW0JXSU1MWE8+bWNgW1ElNEpySyNvPCFmaElSWz5eTFUtZyY+WVpIIkQtO1NjZShBN1UtKDhGM25zJV4rMD1nSltYQ14hUCJMa2tDVFFaLHIiUjk4TChuSUlyNHVHSysyMHRoTjFxSSxyZlJPMkc8SUM8Ri9zMCQoaz0qW0FUZzJvWWReVTNzITRCYl87KHRSTHUzLzllSElOQWYkKU0zM19tYyg2Mj82XC8yJ1UlbUk7XTVmTmBWNldHdVE8TCh0Y0tmOlRrM2B1XVRGOWQ5Tjl0KyhbMWJRUTMhQFIybUYhQm9aMl5tTjchbWxuTUY1bVJIQixqPVM4JTtebzdqM0RgSmZAIUgrWF9vLicoaTk2NkhVODxWPD0kakdxPkhWQUg1TkU1WSMtMCY8b3BUMlVIN08qKV5ZdC8tbzkyJ20sdVotajJLb2RhREJoY1BtMUwqXSU/S2llclImcCEmbFpxM2o9VygxMCI+Qko0MlczVTBtL04+VT0kclVCMlFBclEiM0FqQz1bbTUpPk49Zys0Qm9CbyVXWHJhM1phbWRbOkgsRlI2Qm1PWkctSzNNMUM3N041ITQiVjRCZUVhKFBabk85Y3JMPic9QTxINDJndF8qaTZRQUsuYFNPUnEqZlNicVAuIyMjJWFrN1U6blFgXl5YIWhkalNvUE4kMUZqcUdFdU4pMTtHOW9qPC1SayxCLzVSLEdhcDQvUzBnLmE4Ml9ycSkrOUxPWStMV3VEVCRzNVVlOlYqR21vQmE1SCU8KClNck9vMicsRSdtanI/JVJfJ0pYZmhrcFk/OjxvbFtaQk5ISSw5RCM4UEZgJG5edCRYMXEoVXJAVUUxVUpSKWoqIz4iOWlIWDxjZDlMLSlcXCpRIUtEYFZPJ2JsWiwwJEBeQSJxNEcraXJPMlRIc2A2VDdgSkxkSkxxcW1zVm9lWC1UQEEnI0YwY0QzV3RQZk4idFFQbmljZHBTJUdgWjMsR3RtdCQqSixybipPJW9FcltTLj1LIz0/TEZKZ2FZUEVZZ0pJTUU3OWNyTE5rMzBUWSo2LzMxVEY2bVRXW3E9KjphQCMybzRTVnNFRzhEUEU9YV1CTGItSzMsZklKNiNMLUJHMU8mXVYqJkciMjNGKUpQVl50QjMwQj9YWGlqIWZrOzxGNm9ocTVUbU9QSj5CZk06Qm8oPXU3YSVRbGNiOSNnMmxBclNKUDFEOFxBOVBGRW1vZEQpJV9TIylBbVNkYyMxb3A4ODNBRisrPGlTN0M7Rj1zI24kcDVrMjokRylqOkVTQVMnRm1HO0xTVkNgbS1wZW87VjZgXiRhP01bSUxDXi81ZEVVXl90cSMnMGtsJVUuYUdtQkJXUzNhZGdmcTlkS0YxTihaKlhtRHJicEouTSNxOVFTOCYyZztAUEYtTW8pb2VdPlE9ck0kLT1yI2cuMkFyMmRgZU5PV28yIjAxRFxcNFNlUWtjPGtQUDNUR2pMWUo3MT1qXHJiN1MpLzVPVzY+S2FTTTU1K0JeV0FPMmJZPSFtLTRzKiVhRFwnQ2xfI2tjXm00bGtGdSldUWQ2XFppOFZVNicwRUAlM2JANVBIITQ7YSxEb18hIW4wOEg9PyEkYTRZN3EzO09ZaG87LVFrJGxBJGMiZE1wVUY0cnJQYy1mU1VjQTNGXyxTW1tPdUsocjJDREM/QXMpUGJANC1uLTM6UFg+amloWik2V0hjZGctOlJMND8nc2wpIWByZkEvUT1RbFVobHJvZGo/VSlcVUBKLUVoTkheJFlJWG9KLUdjZjBQSEVnK0NDTjRlZTNucVE2RShQNDJ0YnMhMDE1Y0FYIXA5ZzpxUVBIWUlhSm5EbnNVLW1ZMig9JjhxQEJQImtFYCdBWz9lTEBEYSxGPkZlYkRoZ1RJQDQ7WU1MNyknNmtMckhZVjtANSQzXERUTWFybjJnUldba1RpV0ZCaG9INnM/NTJZRjFqJz1MZTk+MTVycS9Ycj1taS51K1VRdEwwUSo3cHVXaF1iWyo4Nj4pIUwiMl01XmAwO1tLZ1xNZEZyKmdMOExbJkRdKklJImc1JmRwWzVaXmUza2YqJVJxdEsuYV0iYyhqRmMqS0N1IzRDSEBnaylPTSMnaS0jQVNUYmdoKWtOUFBFRE1EIWRzN2taLTpWUFc6XFRgUDEqU0BMKnEvaVotRURiL0FIZ150TmVNZ05aaCJrWDdjN3ROXFI2PlQnX2VVVXQtW05BLE9YP05RSCZdTE81VXVENjM2Szo/KSZBL1A1T0ZXSS0yWWg4OStFbDAyJy9pS20/TGEhOFVmcDMyWlJgXj5ddSlzJENLJjU+TCMmaGMuRXROPCNVPElpdFY/XF9AOkNpU2IlSVYtZTIxMCcmWkZrSDRBIkhrUVRtQjt0RSxhY2A6dXBVLVlkX0YobClLVEVNST1xZ0RqQzM9WT9wVilAbWw6LnFAWUo/I0tnWkM2b1BrMmY2KSJpQFs2JiV1UyRuI0opal0nOGViaitkaixRcDlUMWFaWDZBOnBCTUZFTUlnYkRPYmtDXDpObSM3aHUwWi9pZ10sSTVhczVBbicvWE9WcXIjTjFOMGpGa05NSmoiO2JIZUIrMkJLPipHMi0taVBITVRqLVttN2RcbWttOExiRScoTFdMbXAyXDRHJktCQCE1dSFtSzwrWDVNZjxCMl9aOSFGOygsJGBkcjN0ZldGVm9dRCJNZmIpNmFlWnNZSClMPnNrO2BOPCEoKUZmITpxL2dJZmBTTnNIPG41XWJyK2tdPykhYz1tQCRgXiM9OUBUJiIpYGU8R14qXGxMTlNeJkxNSys3ZTYjcFI9VkBoZnFnLmlMTjkhKltTO2JROl0zcUtcTSsxWGVBblxRKz48TDNjIj4sMDkhNio7bDNdUCZnKjUxI3RMPmdZYTgzdHJwOG4jTUgkaDhPQG5NLDxfOXFVSFg/JzY7W2MxQmpIXkE1N0FHKC8mQjdzPj4sSmNBPlNIdTpbI2pNVyZbbSJtKTJYIkduLF4pYUFbZnNDUmZGM1pwJWBDVjE5SzU6KSI4U0QvPipIMipfKkojL1w4bTMqRDhEdDxOTUs0ZSJQLj4yXUZnXFY3PEUwYkZZSjlsS1prWnNrTjc5SURDcE5SOHIjcTQnOGRtMTEiRm9hJ0pnTGBdKEIqRSQzLU8mSkRjXSY/Ty1RQnIiJ3Ahb2M2PGdJQzVTNT9mc2Y7WmhnPyNRLidCYC1ocD5MJmJSNik5XmdlIUAkZWI2S19bWjNOLW5dME03U1kpW2ckNGtiMylUJmkubjZbZXIvKCI4ZFlAVDooby4wMk8kMSk6Z1JZcl9Ha0klQShSJ1ozXmc3W0hlalsyUGkyLkBfQ2Q6I1VuQ1g4YzA6WyluJl9URlJfOUUuaE04Pzhaaz9WVVwhPEU2WSlbKzZnVlhTNFByX3QkWFE2SUpXbldAaTVZQkZLUSUpbmp0JFxeIzY6Q1YjKiM4R0lTMG0oUDEoSkhxVUdQWyFzZjF0X0VtLTktXGNLWzkuNy9HbjkjOzJObGV0Y15sYkhEZTM2L1RKMVtwSF5YbWRQOlRcLyJVKlQkclwxRjhnRm1WS1EwJ1hudXNWcV8iRGZwIkdnJkEnYDksRW9ySGZEblBTVk9UYnBBSlk0TGY8L1AzS11HZVY/PDg8Z2s7TCxxZks0dUFdJSJbXEpXbFJJRkhYSV5LUS1iRm5wLE1BU086XD9fKG9cQSpYXCRONVJcLCkuXXEhTyVqN0E1VykvXF5hLG1RImBCa2NnOyVyQygwR0xGXjdVcjRXQTBJUG5lR2s/Y1RINScwcmZBQ1pQYUZLYFVyUW5eQFEwdTNWTClXRzctK1lEcC1zNEJCbEtNIVgrNlg0KDlCXzVqVWQsPWdnYWpMVWg+NUkzI0A+M1U/WCpLbi1ZalQrN1FbTyNUUyYvaVM0Wl50azZeKCRaRXFwRVM7JUNKMEhocU02OVUicTkmTFZ0MFVFVjIzPmAsVSFzOzdNKVAoblE8UT8sK0wrNG0pa2lhYWpeWT0xb0B1b0E5X1RkdWVoW2R0SnBlXzJOUk5GOyRrYDJkN2xgODNFLm5laT8/W1ZCNFljQU9rRipiX05RXkdqSmcnYkJZbExIJEdEI0FQNkI1V0hiXCEoNEpqJzNRRCRtdGMwYmcoOSJOcW4idU5lWVErZV45ZnI1NUh0NkBxVjluYGREJDJhQCciVjVSIlh1R3NLL3RlOSFJZyImRCVlQSswKmw2aStWYkBdWW1UUFxsZjY6Ky4wJmZzcHBRMjBVLVk0Umk6W1EiPU5SRzQ0OU5EVlMyPS1EQVJ1SHBFMFxMTGZVKmU0R0FgTTsiI3FCYVk+KSMtQmRIa0crKSVxUyc1Q1RyJjZtXjkuZlxDT1ZXPGQuUGBvKV1fVVwsLGAmRWw+Si5JXTVscDVeYytwbUo9KFA1cjYiSTxiIl9BPCoiUCFeJiE5MFJkalNSYnAnMnVULXMsTCYoQzxELlw8RT5bcCRJciFDWy91JihYSUwpVHQtNkA1KDclNyE5Z10sRipdTCxnQDpJaDRgP2s8RjNYcyJRXmpDKm1KT1ctJzcuaz8+SWBcaDslJSUyUnNlL1pVLGRXUylDLyciJ3EkajlsYyhxSlkrSmlWSXFITyllJTFNWyY2VWpRZ2MoZ3JwXF1aMWhmU1xIJE83SV9BOTQ0KWU6SV9MKW9mOSpMUWsqJzltXiVFQ0xFWVUwSVsmaDgwTjNnXl5aTUkvVkE2NFJAO2FITjpIO21KXmxbNjBLQy9VNU42QTYnQmg3aCxKTm9vTChEbVNQZig0J1FkJiE+K0JSUW4mZ0BYWVZSWGBDNzBTMj5hIiVEMDAwZkElam5KZVhzMyc8VlRFUTRuZCVmS1tBTCE7RkpZJUphUlcmX1snX0ZmMkoiXCY2MV5DbC43Zjwqcjc6VFdKUUVOMV9wI3AyL1wwUitQa0VIQlhFWyJdcE90N1s7ISxfZGknSEZXVkpBKDVVQEkxTURXbkQhNHMhYG5FLi4+WVxKOlRpYltvVEM7LTRYXk5rYjRRS3BSWG1IcGdYLTBQQG43ZlUwMDlJIW5MJT9WIltdU1srMS41b1I2SjkzYG9KVkk6R3VdSUoqJGFoW0xOUlNlWW03bk4ma1whRVt1ajk7PT9aZU1aSVMyTGIoaTpianJPPSE+NkgrRWE0SGAjM1c+bSt1KVE9Z1AlJF5kRi9IN0xMP1BcPixZPWdeN3AqXEU5JShANzNLL1tqQiEtSydQOilwa0dwKlNwTEJtRTE1W0tPRE1zXyhEWkU+cjghT1w5Zl8kaVRrRix1QGNQJzBGbzIxMEBwTWV0a3FjKnVPJ3IpPm8mZXJpNmJyOS5ySVEoKW1oVixWJzVdTyZARV8/bGNlIiYyIj4qRUE1Jyw+Yj5PLSY3cjg3OCFqWCVPMkdqN2tgUEtdQm9LK3NFbGpIVFtERSdwQ0FIX1MyUjYtcig5IyVgPWwvMSgpPm89XmphW2MhR1IrW2VASEpTWzVwYXIwX1ErbVtBXUJZbW8jWkRMQThZai9DJTpUaDZSamwvai1oX0ZpUGBNOC8oS2U+UWVsW2skJms/XGs4SCQ3ZzooN2ZnJFg/SSNocFVdW0ZkN15aKXBWbl1mZ2ktRGdTJDIrKGdcXyhGWTNXanBnQV1eS2teOyFWK2NAdUExMmdAOillU2k1RiY+ZzcvOD4rJl9kN2g7YzZIISZdXmFAbmNlXkktbltycWcqPyNEVjZvUVgkcltyKWYxRj9dSCZlXSsqZk5TJVM1Q2VVbllKYjBpVFxOKVswKl1qTyVtMWVyVDEtQVVvXlw5WT9vKnJrSWgkQTplQmdbS3MvNj9kUmw7VFxNT1Y+LWhAN0hjZV9iYmBrRklZdUdrXVtwbGFEMzRoTSpWI0lKRHEkKWc2Vj1DJjpELUhqUlBAWGttRGA/YkhFU1tOQnQiMC5HWD9EOlZDPVJtSztzN2BrU1Q9bFEhQj9HLUp1YVVXM2xQc2FANGkuZ2pPNU1nYXItPF5GW3JMcylPcDJAQUwpYTQ8YUEibTAtJnQwXSZvUTtAZmtuQHFjZzdfOkpeaWg0XEAoYWgxV2BIUz9EXkQqdDYtZlVSU1ZaZ1guJGEsbkFDNzdXQHBCS0UmNDNvMiluKDEsXCRHa2Q6SSJhP28xZVxUPzJyNEhZTVMlL2MyNCxPSFtrKS1uI3VjXj9nQlVkcWRyP0RgSVZdJi5AO2JCUS1WWW8qKzA/V2VnWColQm4oS2cjIlV0K1c7X0RbNURISCRsNVEpNj1nMy8pZUkxaG9pbC88NG1PNTgncjpQOFxedCwmOHFCRTZiOCosRlJVJU8iXm9BMikmMmUqOmMqdER0S3MkZ3Q6Z2opXEA/LFA2MzJaTkJeXk1oYzNIMlVmK3JxWildcEhSRi9ZQj0mNT42IV48b3EtWzFhbnQxcmhwdGlxIlcjV2dRMG5OZmtLIjZGaHVcKEBaSCppV1dnSztMJSlHKUEpZkdLc2NPcE4qX1AlM2dfakZuVyRUJylHPU1PUTtJRUQ1PWIiR0NCXUMxPUpQQVFtWi1cbVNsZD8yQjBLJ0lpSzM2Y0Y2IjVON0VsPSlXJClfZUNtaF84SCwnWy9UQkRSc1hPRTpZSlxLUyRZTVpZRCo9QVcoU0o4QUVwYm4hYTQhQGxOMlBFcGVsOEsqSE45UVgvSkhvaTlJMXA8O2lubTlfdVJuKjZCcy9BJXEuU0k6MVNcOjJCbz1vR0xvZyZKPyw3SXQtYVNvUl1KMjA2QFRcTic/Sz1ePnNXXSlWR2lvc281JUpENSMrXUJrOSdbcE0oN2RhM1RrJEcxIUoiY2s7WTQpbHMobl9mRk8+Vms/LGVbKmkuU2hZRWQhM2I7K3FuIUhzLCNaXyY+OHBJTWcuX2Vta1ZxUEQkXjxTOExxYDxVIyhvLS9qYzxUVWRAWiZcSGlnZ09oLmReUjpENV5xR2AxbiRbQF9sUEFfWStgNUlLWTxCLTJCWGFubS0vcVgta0deJiwmTj0kSEs5Yi9eKiVwdDZIYjVPbk05TyQzOiJRTSEsQyNPOlMpVTl0YSlyVGJKb2VJLWVQLEpaa2lYWzFSRjFNQV4oV2JbLzchJm1eWC4+Nm9aS11jXWtWNjJFaFhYT0s4WyEwaiFZbkpNJDBCJlA9Jj49ZUtuY1ZPc1BcYkI4UCplLTNqY2FwSzBBblwvTmdYMUtNcjZrdCZcUjc4J1U4V01UKUMuWFRtQ1VzVCJGTVhxI2lYP0tKPkZBRT1XJXFicWgjVUhLOz5kVDc1YW1CM3IrSldMKiR1bSgjMiFIS3EqQmRFaFBOcDw4Q29wVjY9ZjU9JzhpTVcnKTBtRnA2Q2E6SmBxVFZWbVNmTnUnZjxMK1xAWFA8T0ctNztRTFJtKEtMST8xSVlwLDJXSiJcVnFqNGFSOztCIVs2b0BAWkRVb0pJUVxrVy4nLFxHPkstKHAiZl9BS1YqbC1gOytQWj5UOWMpbidSckdQKSVLNG8zNVUwPj1gLGJuSjpnSUohTjo/PSpUa2JQKzZwbSVbPz5xdFFATjRMZlxQa2M4QWNuSUdrP1dsa2w3cXM8bmFbKD9ZY0E6ZD1VZCZOXSRrXEdOJjtdZmxpOEovY0o7Zi1jMEBOdTBjTmY+IjArJDxZJidBWmtzP2knIUhPNGNaUWtpWks7IzAsPzlWdUMsNTxyRWZsIy5JZydEJGlbK1FUZU9VXXBiUlBjaiY4ciNXN0QtRzgqQjdIIWEnMjo3InVMVWYhW0lyUHRJUS89bnUuOktnVGJqRyc1N2NLWSchbEMhOV9uZnFJYWdsViRqPkwnaXA6PmBUXFxoMVNdbSlwYU1SNVZlQmZNVkhTMEJiQi1BRzNyXXEnNDRGOUhJN2hGKW09ZUYzXjE0a0gqRkArN1IoTzs3QmRqSDljcClRIkg/K1NiRGhBO2hmSTpLXmVjMiNYPCo2YTFvPztfaWU0V2Qva0xdVnBcSFpfNFQmUCtPPG08Um8oMElmUDQjbjl0Ty1JZXBBOS9dMSciZUFUbUpPRSciQjZHLDBhTDVIVlgnREdCXyJhZEFVVmlbcVwoQCYsTGowQTQoS3BxXUltRSJUSTBpMmVvKWtUVlU7Zi1RMzgtbydSRz1fUSlIMShGaDdmQS50QylmIU89cCw9JU9tYkBkL1VlPCYoLzIhL2JNW1Nhci1fcU9pUWYoNCdAdVlqPDpeKE45Y1UvU0wrTFRVU1xzY05JYG1RcjdnTWRNOCNiQjAiJjVKVjI5P0FqZHJQTDtfUF5aaDtdPWtdXydcQmVMSFUlSyxvOFQ0dURyJ3NOW1trJUY0JkdZMT9mMSomRTQ/QEI1dF9BQWcsZSZkMjtEKGxTPUgmSG5ZV0dXWFBLOHVYVWhGLURLVmpiJSNBPWc2I1wodFxINlVNJk85PFZSbGtpVlkmRF5CbltiYGBkWEJIVG9WLipXZDoqNlwxYHRvJl9YNjVGKmljQG1xZnFLVTJFMSY5QV5JW2cqWSdLZzBYPC5IQEFGSUgiSjYmOmk1TUA7Kl46Jk4hSDpDREdJMjEhUHBBOy5mbFtaNDwoSC0vSGpfSSgvY3NROjdkJVc7PFpbZmNRMWVCODI/Zj4yK01JZC4ucW1bK0k1TTtYKkJWIlZGUFtrIUI8LCp1RWNNMGxnTW0oKCVuTmIhTTcpM2oqWTReLU9iJGRSUWV0LyFTOE4/LChTQjs6UFhYcDNmL0hfbW5GL2RcMlpuNlU2M0lvYWw9aG8ocnU2bUY0UWRLIVokb3BkKUBtJj41MltENFhlUWxdQFRBWD9MMV08P1JHXj9ITEkrZ2c+Ujl1LjA4SiRJIkNKVXU6WS5GSGghamdSRHFtLEFncW5ULiUvSyJmKk9UWjljP2pCXFwzPD4lSzo0cDhEZVNnLG5dVSclMFI2KCZZaGxALVxkJicpOVsxYz5LMGRQTjYoKiJEOU85PldmTklJZCxyREU5aVY+azNZRkpYNHMzYFcnOUg5TWlQQDpEWjVDOmgyRz5CNCxRY2JXSSEpN1JbRjAvUy5yUGZkL29aRCc/bm82dWQ7RmklR0AxcUBvWTI+PV07X3NFaD1POjg4O0BxZCsta1g6ZmBpRWNVVHEpUHVhMiNzTylLKTJWUE1LSnEqSW4hdD0xN0pORm1kPFlYPWNXU2FlOCRZK0Z0cHFMJTMwSEhrT1tPai9lMCUvOVw9Nzs2UC0uZWxQcFFJIi9YSUxAOT9DSTJiT1g0KmBvQU1CXGRTaUtzV0QiblwwRyZXTUdpa1xAPzg3XSE8Ykw/YmU9STBVOWBeJShmJ20wJHVJSDFbPT1FM0RZOzF0cCNsNlpxIiMyUzYzak9xZk1BUV4/OERXXDpEKlhadFVGck9cVnFhLFQrWTVEWmNPI01tNUFcWVtlVj1pcj4ocUdHNDUrUD1WOD0pP1xzSEpMMHI0RyFxNCMtJ1hzJC1mZl0/Rk5aZllbRWg8Mk9XQi8mdGFSRlI6bjE+YiVibkVIXSVSbCpdMWZvZHJvJjcwQUsvbXAzaEcjIUonK0hkREg3XkxYQDYrX0BLQ0o2WnBbPyZEQl4+U1Q6YzYqTytaL1F0LCpQSmQpRTRNMkZzVEJNUlU0cF0lWWhYIlE6IjQuREJRYVkhZG8wIWhqTz01bXA7Tm84LzVXZE5lS0FbbDxoTDdZa3FhMSFxVmpjLDhNZENQYzpTcF5kSEwuIitXOichTEc3Yy9MPS1KW01nTSlhNWhDRitWVEckaE9MK20/X15sVFU2WFFVYCFQQ0NhRkhITExxO0RIPXUiIUpVPXNLOkBjMFtrIitZWm1QaWghTWVYLDViUjtVaVNbRCsrQTI+ZSVXNyk9PCVzZEpBdFoub2g/XiRULmNKbGJMbWA/a0dqUUdDLV1dKy1rImNOYUYwXFxyPSVwaGJvJWtoT0hacyFIREVxKGdYckY4aVI1XSteTyxVOzBxLilOI1AhdDVVcjdramI6NS9HQClSJTU2LlZsJHFhUkgvRk8ydVRlam4pXGNMMVNKIUw/YjZpSGdIVikoXFs3QkJXUnJWcnFuPjhpPFFNZkZNbTw1I1MvPUxPXDxaXEpFWTxXO0VNLWVWRk88K0FDLC1xXmMxYi9ra1RiYyY9YVF1JT1yTzVablQ5KTdVKVhqXi89JTlSIV8hI08/NFdAOVArWStWTGtMb2NXcE0jMnBdODBIRDkoXkVmcE4rRSVWVU1fU3EzZ04mPiUuUHVqL0AraiVSWVssdVEmYkVxKUE6ZkNfLjtnRz04QFcxZFxqLzEoTypYXEdHci9RYUpKWDM3ZDFUM11yWXFzUWksPWBXcWJsNnFfSiNmV1JNRkorVT03PiY9b2JVcDJwOT9CY1I/ZWdqLic+IiFUVC4hcUo5dTxVQzpqWVhPYDJWYE8kPE1lN0M7RiVydUAhSz04cTwiWUVNKTw/dXBrSkY+QE1IN0AzKlFcMkJWWiMhPipKZzA3cCNocS4+YGQvWTklUig2dSowSVZwSGk2MyRBNC0lQD89WmFhRThSb2MiaG4rKGsjaDZiSWxIMVgjbVgrXzsoWCdrMjhBZDZUNFBdcjVULSchY0kudEdeKnNmLlZwKE5aMGNsU0ZAYWwzTXVBT0E+TSxfbTVBTTViS0ooL09kY110MkdsYmdrOlY1PHBCRWhLLSFeVy82X0ltazghcm1qXGh1aS1eJ0AxWFMidDRBNiFDOToiJ0FhVlJHSzBFai02JV8oSDZdZUAlbj4oKGc5RC1fRjQ6ImVbIkhbPzVDJCUrUE8qSjxsOj1FYmI5UmMlZVQ9SGpkckwrS0tITVRwcD1KSWFxSShOJDdUWFBYOCVdQzRcYCpKQGhAWzpIMnBAX3VmKmc2aS9qKnNRVTg1JWxKbjBQSGVkN15yQGFQdDNnUzJXMSZBYTpuXFk+Vk0nRGpLUUl0aS5AQSZIaEFsVD4qLCMzKT4iLkpeQ00lLiJiWmFxXVhpNCVIJVooUFlpTyZfSiVHPzo/QjxrcjUvNGxMTSIhZS9MKXNNXmtONyVnXSZuXmFNViMmUT9BXDpMYEskSzVPJEBwWU4jQ1kkITFma1xackY1aldKU2NPQjgnXipwVGRCUm9Nb2ldPydWUl1FcmooWUhWYDRyQWFyX0YxSU9Dc15tM01ZR0ctOlgtbk9jR2plMWJaY2QyKC5YYGxiKk9BUmVmM1NnSEBUVU4kKC5jKyw0L2VwT0JKXmBRLG5wQylOamZnSVBVLUlhLTFcLT5zWyteZW5pbUNxJVBOY1YxQWRqYnBFajc9XjAzZStyTmtNOjwwPiNxKkVFM1Y5XmJtWTFNZlxBJ2M9YzppMyxraT4wS19UMj9fV2YvQmpcJWJLPTVeUWZgMmVvJERtRjBwQF5eZSdGM0lGOighWVM6aDtOc1hpSkQrQTI/aUo1XlMyKVp0ckBDL1JRJmdaRlpkKFRmY0xbO0gkWTpvQ0FfWVAicmsyMWdlOUFTTy40QzRnTToiOihUUVImRFNIVyxoUXNYNUhrTG9bT1BIWWhjVFFrPkheKS1RXmNzTD1vcVkoRE1dRjJgS2lFLztGRUVObitrdXNycCUsb1guT2JnZEUwMW42LmQkVyopPjJSNkgrYy0iTTcvKl43YzJmR3JuPSxvXC1BKF8rUkRwKnI8VFpjW2libXFYamwxQz1GanFePnItaCdBVHMpaSlYLGlucGZPVUllaSlsQiJRNV1FX2IyZERgVWc1WEQyOy1fJFFpYVNXa2RpJV0kbGg6ZS1oW08yLWE8b3VHYWlSJkhpaGUwRTtRWWtkJkJjNUFiTGdoOEgmRT1aZG08bWJPcTFfW3VUVFkzb0pINTs3KyVgYXR0UDRhbS4xayIhRF1iVCdERmJhXUI8N2U5dWsjR0JuaDg7PTVDJ2Q6LDRuSCtSUiNMO15fXzs+KGU0dWZjVyYtSDksLkpZcE5uME90ZVgsK2peXVNiTUdFUkU1YTYtdTM0I2hbaGVYR0IkSkBJWGchSDk5Wk9HZC5aMHAncV5CPyknQTMuRyUqYy9zRTw1Vy9ZSWswR3BlOyhlNjgiTXRzXkZQYkdrZHIoW3E7O10jVy4tc24yaCJbJC0wMFFtU2c7SUVnY1JcajUxLEV0NjpbSixCUDQ/RXBMO1gjYyteTnBNNTs7dSNsX2VwTSVMJ0xyb08pRG5hSygzc0skZjpVXlUzcDFWM2UmLiVcSEdpSSZcVC1MOiNsLUI4J1soSidRT1VyUEFWNSh1Wjk6MGwkQyhhby1QXyJFK0s5TCYsb3U1Jz9tKmYzQyRfL0w6Kk5HRS5QVih0TkU/X0oqKXNTPEIvKkxTaW8qR24pLkZWNTpfZjBXQ2VlNmRvS28vUyxKa0tGTU5eJEAyakgkOUw0ZDQwJzNma1EsSE4+N1FeQ2ZXZF8jVD8vTmJxOiZxOVhDbStMaDs8alYjX25vT01VUF0zaCowUWZlW2hybWRySUZxOi4mZ0tUQVlJNFcuVWE4QXBicjdPQDNsMVJZUVxTSUwvdGBwPjVaZi8xajxeakwnLDFoc1Q8S2Q/TFZSTUdBOD1tJlYiXj45KFlWckIlQ0RqP1pCMUJcRW9cZyNvWEtIW2liVENPK0hdYGt0ZjNJXTIvLmwmLyktKmAqRllgZipMUVonXURALTAudUMmb3QmcSwoV2MuaUgmdE8jUjhEJ0dlN0RTOWE9O2IqR2dbZF9nVWs8MmxvYzAlNEBqbVVUJkstImheTEY/Y0VMOkxYbTZzUzFoayshZE8wXmpRVVRAWCUvLEBEU2EjMCJzakBVXEhtUmdGMXBuOmJMTzdkJS4xNzVCWl9YVV4+MnBoPElYYD9MNzdENUxFPSVJTj9MUk8sc3U3LU5PJidkWWhmWmgsJFFnTSdTQTE9ZDtGLylPcWA5N1AxclhRYjhUWV1eXzIrbWtwSFZPLTk5aigrP2BVNkQyRGcrRS1WSiJXOCYmR1dkTDolbVpRRUA6LlxwLSNwXWpXLy1UbSJQIzczNTtLTjNwZ3AxQGAwJiFrTnIvJ1RELSRWI3A2JWVwPU9fQTI7QkYxMmZfbkMkaTlJQVsvZG5GcjljTS9xLU8jLDU1Y2JFRlo7cixmRlllN1Bqa08uPyg/MzoxIiphZypfSE9IW1M1dWRjOG9VdW10WnAxLzMzWTg3SE1jQyVaRThfOUolOnBdbydvUF5xYFBBRDtmJTIiRiIxTmFLOnVnaHIrLTNuaC9nYjgqSyg0KjRfUE9ZZVtJZSlSOGNLYFk2Ti0vJylfTT4jTXVwRkVbcC0mK1U3U0c+aS9NOUAmZydoZWJBRHU8LUEjSUtobVtDZDFGb1lYcCEsU2xjQ2BJcTglLE0wY1E8ZEdtYm9bNl4zNCRxN24ocTdAKmpEbmQvNWlqXlooOW1AZ0RiKTgrXmknPWEmYkAyYmlWcF1vc1dEWlZraXM0TVBmUFxtcmZIam1SXCleQVEhLSpKOUBRPyUmS281RHRgU11YJSFYcmRoZ0hHajMvUSRPXDM3XU0hdUNdRENmKCRWMGg9UCFxQzQuLGheOHFSdVtuaCE7LFYiTi9HRElWZG0lcl9HMjpxU11cLWRrO1tWJDNXKCxpKTI8XmhEQTpWX2xcUmxEUj0pbS9JT1I+SiM4T2AtKzBDXVUnaDQoQCxxX0FVTEZfOGlGWTI1WGY6cShDMiQ/ST4tLGopTlZFM2E5R2toVFxjcEA1bjZRQEM/RzVSQmlnU1QlKD5Ya1ZCcW4nKyJeNCJPMW09K1hcXyZsSCFDaUs+UzNTQlE6ck9TUVtXbVYla0ZUSGVnRHM5bydmQGpLRmJmN1NKK1tBNzhIPSVxaClHaTgtOSd0TCxMQ01sb1cwYTFQRDphcFMsblU0cXMqdTclRk1LKElDbzdBLz8oJSlIL0U/SS0hOHFCb1dnbD8hOGU5ZjJScnJJJFYuMEMucS8kPWleJyQtPl5bNy9CbzMuJlxtZSouOWtAbTkuOzVgcnI6UDJmI0JTOURIOkE7cUZNTlBULT1HZS8qUVU0PChNUiZIMThWSl0hYVUqXWZeZUZkW20qdU1FSVAtIjoraF1ncXIhJkMuNEMhZzljN000OGRELUhBa0lJQE5BaGYrcHFGRSM1WFREYU5pYTh0cD9BL15HPCdwWGUxJ1Rvb00/QkNWTzouUUBfcitGbj4lQk0uWjNZJ11ZTGY8RFJjc1dcdU5FRShlMCghbGRqYG9ETiM2R1BgWSlwLkRiNiFZWCdMMVRmKm5AJDkjNF8kNnBvcDY2JVUpZD5Fbm8pNyw/Mjg/SzZYZmdCNSNadC84XSE0USpQazludFMzJCFjXDBhQCJUYGQhXzlYY29hZS1Hb2g3W19TKD5naFJFRjl0NUZvOE9bYylIMCgpT3JhMEFScTVTZENdKktiKjo7QlJZPVwyUkVLRkw2bl9NSCFfT3VYQFtBPiFeI1Y4TkRjZlE/Jls3aCEhWGZrYl9aW1hNXmw/KnBhRXBmO1Y9SzkoVTlLcHJJMzJuPzoqPTxJZ1c7Wz49V21PbDtXO20xV2YiW3JETS4xQ3FmWlZAciRAPUtEYl4yLiExZkMjNyJwOzhbJWJUIS49QGxxOkVycU4kLz9iNUY7WiVNK3IwXE45RjtPSFU3NGhnLV9qZDRiS2R0aTlKWjYkXlhfRjwnTmtnVlVfJmxYLGtvbS09bUduWXExRmlxJFFvI1NJOGo4KmxEal9wYzxtYGZmK25xTjVOXkA5cSVRZ1VKaGxeVyQ2UmxnSjM4JDlJQGlWRUchO2s8TCM4M2RRPWA0XCslcW9uPVNkcTt0RSRhQWdlZEBTLD1QKl03cD11OjprWVBhMiVMaFBEKlJVdTVqQHRAO1VETUUyLGAoW1dPIUEsWzBqUSxzcyVFPz1ZTWdGQClRNGNQNEtVVzhWLU1XIi1WWF9sJkUyLCRkWzFIIjpYNS9BO1lKOVtpMD1MPHRsb2kuOVlvbik2Qyc/NFQ9K1ltUFdrQytmKHNtaDJuVXVpTl8sPVYzPUFRIUBsRz1UaXBuQDlMZGY5Ny5oa2E9YV0rPTZNR0tFZjNfbnNIR15pNXJgTClCLDtPQyJTUjpeUzF0Qzg1cFUmdEJfP0liMEpXcjplN0NMPiYqbVxtPjIrQW1UWCwockxTO0pLQz8rVU0jaDAhTV8ncmI1OmprOzYlYWBcPE0qUi90OW8rbjhrZSQ9JkR0Q3BpJ19jRmxjaEdeWmQpZEE+XmcjTTotVSEjMSttWko1TFM5KidILXBhZikhVDhAM1lbPmU1PCxCdU9aOC9WcGBaOVFnSjtjZ1tVQCghbjcqb0VoblVFJjJlQ1ddJzNQMCJxLDg0aVI6azkockFBXi0+X0ZwV0RUMlVPZT5gRjQuITYkKSlvWDFGOkV0OUxNWzBMayw3Z2NSIVxeS10mRTluPjtaLkJPYk8+WyYyaUAwPj9xOyUqMUY2SzpbYnRrRDUiaWxUPVZbISxjMiJfOTpTJTVKWU9mLys8YixSdEhoMm06MTExMTM+NE9HUV8vQmNocVYmZWRrIiJgLT9vUClBUnIiMWQ+KEkvbEFAN0UhcGshNFpIWiQpYlJQSSdfR1hXTi1iKmFzL14tUGUxOi9sRDtNcTltb2I5KydeKTg8YGgrPThAU2htdVllW1cjSG5oYVJKNHVoOytdRlIwTiYuSlRUJj85Qypub1FyMkxZNzA3OmpUV0tDcmRqamBmVWtSYyUlMCZSJU1xSz1ZbFpfPG1LJyU+R3E2XkF0YTshSjxiTVNIKlA6LXBuRFRbMFxjKE4rU00zMURSTkk+MV0sLylZYFRub0Q4MXMxVktbOTJbb0s5clQhJTFrS2FUIWtLRmNnXzZEXWkpNlQqcyQ8RjpBb1ZvR01dXygtYC5xWT9FU2VkUURFKy1kPk8wImBDbnRZZjIlTVU6TG1GXE5TR1AvPjorMj5JKWIpI0p1KUEzK0Y7PE1PU1xUNzhJLnFfImRwWjQ+QEZcXVtxWEV0Y1xRJ1ZzRmYtQDIrXkE+b2YsTiFgVDxxbCROV2Buam8yIzwxOkImOCI0Xl8rODNANHMnJDFATlFfQlxAUGhlWSxCOUVtVD1VLSlPVUlVdGYzcUxsI1hWb0grPkk2InBZKCt1Q2J1bytRKHE1Z1Bxa24wU0NsXy5iMT4kS3FLazMoXzY3ZUI7SkA3azdxa281dGttPWBMZXM/ajxpQzRFTTY5JjticW9MVXMpIS0oNml1PyZBZSNpRittPlFmPWs1N1pIOTFwJDsxa1o9bU48aixcdGVISnBsQiNPSTlRKnRDRjtlJ2FxMj1hNEpiUDBxMmpXbkBHNy5gazczXztIaG5IK2dlbFtecjArWkY0My9MLyNTYlQ9c3QhTzZTZHRzJHBAaUJ0KmlJRjc4YFJOQjM0Zk5AInI3TGdEQW04LzBIPkRrYFkzM2dhZXApW2xyIl8xMnRJZllLRyo7YDthMDJdS2VvSGdgOTZoPmRLMkY3NSYhMktuRkxTJE4oVEgtUzQsMWBHMTFcIihlP14/OXBqcVtPXmtmVEddO2FNOldDIlReVXFjb3VaclUkcUNTYmJGWkkoZGdsVE5gRS47czZ0WE81Q0VLcDpIbEFgajphTXQhQVE+WCFVVklNPmxcPFs6PSsnaEo3YDwtIzBhbUhCT1VFYUosQFsvclUsckJyVFxbKyYrRy9kZ3BCdGBSO3Bpb1hsM2wkLGBvImcvbWVDSHM3cFJJb0NoJixeTz5xMEZiPkkjcVFkcDBfJUJAK1hhdGE6aHU2M0FeYUlxPW1JMThxL1IuYz00N0BhMUlKcmg/czVpRllBLT11JSg6ZSopJiNxRmEtK2E4OUFPJ0pQSSltV1xkMiJOalBxYmlZVz5fOTFBcmlUPzBiYysrUEE2a3BdWFdGMmNNLCdKRXJWZ1heX25wVztQR05aai0tUFFXJ09DcDhjaTd1MEdzb0gvRzo0Pz1bamouS1NVITVPWl5pNERuUG8+KzI3W05qN2hJLG5yKGleM0hWR0oyJDohZjtBUDswOT0raV5SQWVia0tMP3JcLSNcUyc5XycsLmZkXzoqcVNTKEthbzglV15bVWJAbXNrPlVhIlRtOklKPnVWX28mKkMmMmlxKD0nPlAwXCxTJWlKX2hMcSVqaCtRbFBuWDRIKHJwai9UPSZcQEteJUUwWTlAc05VJVZAWV1TJT0oIjtHWHB0VUdaLWd0PE1JVk87NkxMLjVubyVkTzQlXW82M2dza2hVNG5sKiJHUF0sQUdyKDNsYF41LTBnRkxzdCVkV3JjX2c/UUUqKlg3Ok45WSwscHFBV1tsczpJTjxXbCE5M1VIb3BxWDw8J3JPdEdEZzA2JjxCQEdbWFleJzApOiluL1RsSlg1OGsiYVxkRDlLZFtLaSg1N1stZUlrUlE+ZGA6OzZpYy5dOnJLUDovQz0zRzxKJUVFPidfTlRiPWsnVGQwL2hPLWxiUzkibVpKIyZmZk9JNmlrX1BZYlJMKV0vPi41KihVWSpFJi81VUVjPzZwTlFOL21cOmhBKytnQV88I0g2ZGtNZGYvImdYbV5wMFcsI1I/OyNpKmVDO1ItWGhyIytFbVYibFBdKG8zZVg7RT0tZy8iIi1pbG8lQnE1SS5mOztyO1pJcG85VilTVSk3J1JWaiFqayQ8RjhsUExFMmZjKnJVRzo1UG9bTyw3Q0hEckFSZSRaQ09hblFZSTNvXjhXTDVRQSZzZTJAXj1BbXVzaVRvZWAuNlgpaTQ4O0ZWXTtET1ZxJSJkTT1EbFYzNGhtKTQ2SUlUPSJgLEVFZmNNOipMUEw+SFtPIWw8Lk5SYF5mVk03cDQ5TiVbV0laUVY0QiQ6MWtMT1Nqay8mMXI6YkVdSW1MK0V1YlU2PjhML2cyWlBFbzxHRiMrJC4taC4zOXRoVnIrTV4lKHInRG5sInNTJDBMJW1iPkFBXGQnaFc9WktaRlRaXyxVZ1NEJ2lLTDU8cFstQ18rTlpgU1Y2bGk+Wl1ecnNwZCthVUdyVCZnNVNpNVZuUG5rNWAhJEZUOlRpI00uWmttJUFvNG8raD4oaHNTYCZpTXFhRTxFYT1jPTAtQFBMSS9SX2RTYSpyPWtMSitgKj1uKmBBWChFcUc7IS1iZGolWiNeUi1uVT8rJDg0ZjhWPnRMSVgwOkhZUFZCbnQ5TTc+bUYqQDYpamJIKHRvWVdVb3JRWE10SUpCak1yR2tmWkE0RGU+WEhcRkQsOjxjI2w6ISwuU0YoSk9rOW9LXzVTQVdnSlFkPzJSOjdxclZDL1Ezcm9HNGNIMD0jOGhnK1w4STxYTThDOjk7Mic2QmlDJUwualxyU2RAN0RaPkxOIzBJRDUjJVApO19fPVM3Q0EudSNyb2M7WS9OWGsnO0FfOzlRcURlOFIpZGM5Vkt1blBodVdoOUZkJFIrOlQ/KCk4RjxPMyskSTJZSCFAc2ZaaXRpb15ePWZBZE5LITJOQHJLZWpgZ2pHaUdjODJBU1E7OmwsMyxoKDIlSFA7Z1tFYUMiOyYjbydYbj1HMG0+dSIrLGRzRE88UF1WN1xNJmxCQU1DZWBQXHFFVEdmIlZIPExnTFw8QiszT3UjOkRUOzViLStELiRYOV1YTUFPREw2JjVjLjZZTyhyYz1cImokampMbFVZSlo/PmpvRjE9RGtMaycrOkJPdGdpVldePScyWSFua0YnKmohKCRfbV5YJGoyZXNvdEwoKERSajRBNSxvJ1UtNF5ATFwyNVEoPjwkUzBAVSNubFQhJkFbZT8nSEBpSTddRjkyZmRtQC8pRyNVJi4mWzZeJ1RTOTxLamNlS2IyZGNdSWhnISNDTiRpbTZobEYkckZtckUrLVtEPSMjVzZBQUA0R2onXU9HLSNhQkNrT3QiZUREQlU9VltyMUxBMEdPVitEZ3FLT0RyNWY/SUhgTHBBJFE4XiJFVyItPmArNlM3OjM/I15oIzFaJEBqSklgNW5bWW5mUmwrLVhjN2duQnEsP3I4R2leSWU5QTVcO15XayVZZGw7V3RBPD9eay88LjVkbU5MRkwnVFIwUDlaRURuUShwVl1ZbSdiSjBVW0NhaihiOWYvPiowT1dNbVo3Y0B0Xi4jU0gnaElIJypnSnRnYEBxOFxUM20xTnE4N15dbldlPVREayIzbWZoPWFEaUpdPV41OEA2Y0BcbUpSOlFcJ3AwW0Y0MCI1bkBLT2xMQW9xblwmW0llTVZnKyRdZWNUQjJFKSIoVkJocURKSVFSIi4mRSliO3NFZnJaUGM2Xj5FTGQ0TEhmLCphUGEwY1VqIzkvQS4+NEVnWWlPJEEnZVpWU25TSCVfOnApXlgucGAoXnJHcTVFRUI5WXQ/dFJxVVhaNFhbY2AqR2ZtL1xjaCQ7T0NnT21wSDxIL25dTG4wZjRRM28hUzdpaF1nQiM8azphRVpKNlcvMGArWzgqKiU4LVYmPSZPajxgWmokJmRuNio9aCE7XzA+STsobFg2Vz8jMks0UW5HUGpDWik7IkViVStJQ0RtZlEyRHIxSShfaTsmIy4oXjkvPmRacGg5InBCMyheQEt1ZSFjY1RtaT1RbUhLIk1xbztAaHRTZVBCY1ZmR1RlSEotNmxxcSRtQy10Kj5QOnFHYzpaV2hjP0lBNWMpZ1cjSz9XbmhdZDxEaDY/cnIqNSFxVy1gQDZMTjRpcnImXVFwP0U3NT1QQClsR15AQCZqZUtsSXEhMVQ6LSpyPT8oJEBYNmxAQS9PZWUtRnEkNj1nXDZGTVpBMTg8cyxwRlNEO0RlPS1rNC5vZFNCJmJ1OGYmKmE+SVRTVkBGQCxmLzhNdD9wV2hySzEzLSpaRVU3dVxdO28hWWMtcjc5Q3A+Q0hWR0YzQTxCYU1WOEZpPT51WytlWUZXMWJgc0ZHR0lOT190SWEpIVBiIUxnbUQlWykoRicsXzVCYjJmRi0/WFomS0BpdHEvdGBMNi4+aS07YHI/RjhccSlpJT1ETDMrQ2Q2KlE8cE5xLmwiZFdTaFY1dVJmcjtUcEM0V1hHLHJITjMkTzU1a0RjMEU6ZU5iJXBQM1ZcY0wibEFsWzMhPHFOOCwncFhaUEhOMiU0Pl9ePy0tYTwzOSMoRjpkZEFfOVk8O0ZHUHJDcixqTCNOVHM4QlJ1NFNMS25EazAkPWVPJCghQmpNNzw4QXUhOlpuUTJwJnImPEpdJ2hcJWpQOj4ycVlcTWloS2VTRzpJImE5ZmJcIUhXVGpZXSVXKzlCZ3JQI19kNGJlL0pyPU5uTzo+Xj5yVDkodWh0dWJ1W20nZlRQUTFSTGEuSVdwb1Y8NnIhKGolaSI5bDBjMl0oN0hPb0o7TS45LSNDczBuPkQjOSIhYy5LOHRHW20nYGZhMXFJZl9qRiMvY1BNOllBPklqU2VKTCl0ZF1Yc2Q7PXRuQitUTi5JSE4objBycVBDPkkvIiJNaF1JN0JqaS88Zkk1c19dYEBQai4nTUtVYSwhRU9rTzw8anUoXTdIaVtaWDc9XmUkTG5QL1JvTSIkTVxPbV9eRXVyUSI1Ql5mZT5NYFRPRztvQTU1aDQwbz08Om40LURkdTI7X000Nm9KW2EsYmRlcUFbbj01YGNQUzBRMEFATmwqKlxTTTROQCpYOHVhbnI5VXBAPF8zSixmPnU+QWtUSUchYl9TUC1SP2FxZ2BMVThEdF1tVURwJ1JwcWEmbmA8KHI0Wm5ZW2QrO2ApLVtfRD1QbFE6UVNuWEZJM25cSFJwP2IoP15cdW0pa0JkJi4nRCs9RiJLQE8+NXJINyQmO2Q3I3FVSUIpdCN0NGkzaHI2NWlrbyY2Z10nNnJiUDdIc3ReTWRjRl45LUcoL0YlRm02ZHNHYmRnJnNUOy9hbVlPa0puLjlcSGdpZChtZl5cOyU5bWozLFM0Uj9jVUBxNkAuSjNldTs6PzkhJl1TRkxsaSJZIlpfQlYrLDBaVWBBZUVXPTgjZ1NaUHM8cTNiWkB0Q1hIcy5KNVpvOzdUNjw+cT5oVUA0O2RlbmYqaT9RTl8jLDBbNC9AaXJDMmcidGkuY2c3J0pAVSZfbEQ9XDgqPUxycUBaM2ZQMXJMblRYaiE+YCFabzpLTkNXVWlHISZtTi9USVRaXC4sallsOjA1YUI4QGA7RylgJU00OC8rcShEaC9qIjVLYlFiJEdlRTRTJW43MShPbDIvSXQtUzljaTNeZmxZakssXysubjdyViE/UD9pL2NWaG5KcEMldEYsdFA8XSVISGNQTlwuZ2o5STkjU2xeTicnXWxSQW88QyFgOSozRFhQWFZjaTxvJTBZaCVEJWkhWE1EblBvPkRoJU5QbXBDUylwTVtfQ25LN2YuPTIwK1xsTGM1LylWcD9FblMvQkE0KEY0WCNmRSNlOzVhc1Jgam9vWSM7RFUuakItLUxbZi0rJmpaITUwYidXVGxzNWI+UHJUW1N0NG9YNmo5bWFvPGNeY2I4SWFhTmFOS143XjMuMT9HXlxbWCNUNyRWVlo0R2dzckhAWGxBKCwmN1RrLjwyS2BpTWNEW2ZqTmJuMmlBU2spSEdxKyUkJnJZTj11bis2U1doKWsqKHFOXVpecFhadFZycWs9KHFXJ0hybz1yJDtnL0M2M2prW3UnX1pgRzQyODxRMmVJSik8Y3IyVTdSSnQ2Qm4lU2YjN2tfUkhxRkAwK3JwUlcjclFCLGxwWFtCN0dqVSw6aUghMUdeLzU6MmZDdVNFZzdVNTtZJ1UjVlREZHU/XlxRXVRuJVxKOWtBUGtKZyYlQ2ghTyhzQG5xVC5mcjhNcWhJLzs8WWhLXENASiViVzAoRm9gTV9jPTRsYUtNOm1BLToqKUU0W0lSZCQ9XWI9ZU88dGx0JSxjcSIlUW5JZiVVT15bcEVSKytPLjFRWDUuPktEMGl0PjU/dGI/QEN1XXBuQjpqP1lqUEojUEwlITUmZGkrWzleSF1IVDRzKT5fKUFgRVVNVE0zO0I3dUlKRls0XWBGW1JxOi9QUUlKb0ZUNSdbKyg9J3BDU1NiTSU6aThcMVdvXC0saFQjaUZcQiYvU2s2SSRcby1yaTdrNVcoRDlqPzg5KiVqIWg0ZTtPQSdkcEtmXGFkPCYjYGsqPipvP2cmTSwzZWdfNCEvcUpiMWUiJXBUbjNrcm5QN15SJ0hGaTtAKUUnY2E6RypoIjREU1ImTCsoQyxlXkI5MDspWnE/ZlhfUk1VL3JwcWdvTVRZKXM6QmkrP2pbXnJrPilIU08uW3MkWCc0WSpHJWdWKWg3UURvaUdJRlgkU1goR0dqW3JaVCk7TDsmKGRKWzpJOWNIcURvaGVJYSRANSVwWjZTK2lOQk1MW2JpLHRScmxuLmhLNitMUSkjaSRpTmQ5Wy4+VFQyMEFZNzs0KycvLTtEOzJeRjZCP05vU0NXaSJla0ApZVY9YCE6bHM7bUxkPGVvYWdjRz5KcVQxZyMxaTclTl1RckF0TTUwcks8WWk3JT88NlxScCc8ZSxXJyRBLWAtT2RZT1U4MHE3Wk5VL0tRaCI2Oit0cFQ9N21ZQ0BLXzMjOGtGW1xtbHJxWWhaPmI4QjBBWyMuU0VDRTVSczJyKSwpPDs2WTsnP05MJlMjI0opMkVjRmMwSmpjLzpTJV4jIldNTiE2Nj9rZU1yMWMtL2o+JWVCZDtgZTE3MThcP0hEP2NSJWRkPHUyJ2tedVlCTlojaS9oQ2ItMTJZNCtLNGNmQkhnTFQpWSE7c1Q6VlpEZjpIXE48cWJFWzlJSVErWG8rajRtKyYyOWcpNWYiZ05RUWNMTT04a0siIWYpZCdAaTtTOiw1YEY5XUleUlZNWCRMaGAtRSlCPCM7ZSQsLWVtOi0xYkRebTg7XS0/NS1tOHVESE9HNVhuRFBEU2FuTkFtaytodCJwMygubWxKMDsuLi9gM2g/VlhPYmEoOTpXYFYvKF89STRjP04hMjA6JisvRHM5OyNHRD0nO0hWTmhmJVBVcj1oc0xTI1A/WU4uLidvXzdCRjI+WUdkQyxTMmNkUWMyODVtcy9YOU8oTDJYU1c+UkouKTJVciFKRTJXMVJcYUFCKW5baShmY0ZjS2skZ3I3QTZJLFInRzpkOTlZJGRwY1IvPzopTFEpTVVgIzBmb3AnPnRBKGNCUWNmZFI/cW1YaFtEPidXcyonIyFYayhdWC5RW05PY2NdTDptW11TYy5ERipfY0VzSjtqZnRNY0k8SFRBTiYrQyg0X3JYZE8mKlM6THFpJzlBZVElbjA3TGNBNClwdT9tS1xGLEZpUm1pcU1vTHRyYjouYClbLjdJcmFJLzJDVnJnRzdXbllmbFdoYj04bVIhUWFrUl4pUjFTLF45cWNIb0BsYz5waDssRC5obEpYbXRNUnJjZVtuS3NeVHUmM3RcOipEKylyNnAhIi0iIS5LcG5GWnBkUjonSzhyTl5HPW0/RXJ0TzhcZEFKM2FNclksRStrNGp0QltfWyE/UVsuVnBhRl8lJiY+XnVeK2oiKWQyJiVnIlVFJHQoOWlYM0BdIS1cZz9gRUw5Sls+Xz4wT0EkMyUoVm1FI1UkUTs2MTNXV0BLVTReYiVfZTQhQ1srN28hSTpuUWNAWmMqMydNL3ExP3VTJ0xQOVxENzs8cGhTbGlwJDs8N2lUQkErXCY7Z3FgJFovZ1hYOTA3X2xgTlBbLF5BSkUyKkVtPTE+Sl1lJS02TDpIVVdVaHA+alhoZTYhZUBfckJMZ148V1BLXEpIJjliLkNObUdALikjJmdTLm9fSlQrU0lVQFdeZUZyLyhXcW09NS4/PGxPKWQrQ18lQVE4VU8sRUpIWzswXmx0cG1qZVBkdC9YRGFRXDw4UCsuPm5AUmYlXW0wTWBNQGppYmxxVFhPaVVlIkNdJzoqSlVOLDtxbCtkWCpIUT5nZkYnZDxDbVw3JT46UFZHLi4xLzhrazRJazNKI2peTFMkXmhDWWNYMEFIY09sSi9tPWFILG5wNSNQTytJMTtaJkldPWlKVG1ca0dNOWEwOmQ2TCEpWCwwO2VoJCo8QFEqPilXIlY8JXVeIkJdalpgMSU1cSlTTVB1MkQ2SVJmY01YLjtlJ0ZZJGpwIiw3dEt0RWdxRydLajlBTDFZRE1tZWMuY2dyM3RhOlFJQVgndF1CJyVaSD11blpXMlVcLDdubSc1ZFdMbz8yXXApJi1rSiYiPVpfU1A5VGkybHBlNEA8T1lZNC8pKikob10yaGVQLDExQGErIldANipHPiZNZmk8MVlpW3NjQV47dWRfT2s5bz0pU19VNWlga0A3J3JAP1k0J0JWUmMjQGBILSw3MVcvK00/ZF9lTjZtaDdSJSwxQ0xJX2I9J107KFNELzRFQ2leSi5CWW5NLVEwTVxbKkRDSVc3NVhQYFxhZ247Y3U+dDZIYzInbkRwNmNLPSdwJzdPOipwSXRtTkNzKElELDRlciFvaUoqNzMqSCVeZUNJPGUlM250XitnZnFXaSNYZypRPVEsbydsN1hbNlQwL2ZVRiU+UVRnWTVKP1NiQmtkaioqMEFJc1pPZ2UsKmI0WlhyRl87PDo1RDdxSnJEQ1dEKlZbbmxKTVwlcTtCRVdiYDBvO0FhXTVISyZmYk4nOCxrOldoc1p0YVxXY25wKVNPIT1tMSRsYEk1Rk86OSZZL1BITypuckpeYGplUmhUMz48aWxzO0k6N3FcLlNnWChINXFMTCRfPl41UGxuaVtxXHBNRmhRXW1OLy1NTkhoPSNdOjFBJSdfUWs/NmRCMlVCQ14sS1E3Njk4ISVsVWRuMmYrVlIuUU5FOltVMSRgZzsvXUtNaEhbQGhVWi0pZGAnP2gvUVxYbip1YSxWJGNXOWptamhpMjZPQykjTmpzUSVBaUJhMTpGQGRKa01GNjg8XmZQY1FnLlEzPU9oSUEhJG0oVGwtN0VbRHNnWjRBMzIkQTVtN09RcGYuXUVSKk1gNC1bUVQnbF1oKW1aQFQ+YE5gUWdDOyk0YF5TVDVZa0cyPEYqMyVwV3NfcWU2PEJjYkZDOTpbKVovcVNyRHI8JEFGbykvMGY2VWlEbm8qNThVTmwxaiU/dUA3KC5UXm09LS1vSDcyPSVwVz9UQCJpL0NOTysmJiddS3Q4RE5PZEUtcVRBNTsvXTdHPzJRZCNJYElpQjwqLVYpPVlyYiMzRy1AaS9cOjQ0RCldTkZ1b11oYDhjWVZzUUlhT1BBNlJyJDg8RTEnYUBnOExYaGdZSThNWCE9QVxPLWE6TiUscStoPixePkduOTgvT1Y6WTY0dC9fSl4xK3BXZ1IhbCFsZCMuKyZJclZxSEwuZTs3cks+aUAqP1ZTRztTYUNlP2pYMG9DZUhPZSFiIlo5MEklPmM4XUNYa2xJaGA7IkhyXytucXFROlQ2UCspKm05dVM5Xj4kPWYrNzgsIjczSkRWWyJvIUg/S3NTM0luUyg+aXUvPEZAT1pJXVtuLWc0aWxBJ0A1OkliSi9ZN1lEZVNfam51aF5aV2Y9aEI3SUwpL15yVi9TWjVnJEMrLiNQcFhqX1dSN0RzMVp0ZGM0QmxKcT1lTEsrTTVAYys6PiViUEdEWlQqcHFUTiRGRyJedD5nOUJJUlM9OWJrcmYoNFhxMHI1MjQnMShBYmJDLE4kSXFhQWdtRShYUCo9LC5BN1lUalRyZzdqLnVVbV5DMVhrakVSbmo2ZGtXTSJdNyxtNkhfS2NrYylZbzhLY2pVP3BNPj5xajhUa1A3YlBKYmtSUVlpKEtMLy04dD1XZmJ1LTlkOk8sVCgtLXJRREBVPFxpVCUkVDVOMlRcUFBuTzdIPU5BczQvSFskWmtPY0RzaDw5LWQoJl5lWWwmQV5BcVw7MVU7Q0UwWi1qYWZwMT9hOltAbjUqKF1AVyUzMFc4Wz5yMzZlJFNOYVNKJjw4X1pWN0IkS2NMSmZxYHFSZSI9IShhdWdYKlc8YFwmPHBnWE1lXT9dTltnJEZQPEM/NTpjQi0vbE1AUnJibSI4IzRvbWkjJjtgRCRVLCM/OkNpO0J1TmZHIUUnQC9nbjo5Q1tVKTJdRjs3ZVZcMD1jakRKNE5dKD9iQ2hpMjQ4YThYXzgxRTJRN1I1RUhZYWJqSigmYFdyW3Rma3JNbUREZlNOTmcrYyE0IzpPN19hZVZfUFVESDBWO2VMVSVvLG1PNktMIiM5aT1yLCVSbFRvJVs3KlE7RCVWI05PLUBsITRkWmdZIj44IiRmWiVxW1NCWlNIc1UxIWE+XilubWcobD4iMU5sT1FDdCJSVzcsQ1svcTxpJkUoZk4mVCU1Yys+XDlfJlNfOTxIbE05JDtxOi9dcUZNZGpHRTtTTnRGNDNLQlM8Nm9WVC9udERPb3NDcGpBNkJpQEZqSWk9NHBaUnBxIiIhNz5nKUtcYE1WNjw3T0EmPTI/Y2ZwUGU8SVlOblk6JWdtLUZocmpNKmRJI3UqMj1xMmQ3aldYVSkqPCJURDA9Xi5DM2Rea14vS2M1bV82QVNoUGRhN0IvW3NRPk0/OW0xOC9EWTxOaFIpPUsqXWY6JDw4Q143YUdGWGZcXmJWMVQtQSc3OVFcPS1AdF5uRzhTTTc5UFdyTGIqMFRJNk8sZkIpRnM7Jzs6WDE5JDQkLS4mVElwTTxhYHVFJExtYEtIaDpsO2gsZmhZTjwxKiFIR1xSV2wlUVNALmt1LC1KcHBmXU5wZVFwPUUnTEZbIi44I1tdTmNET1RJJDJJcFxIMEFsUWdJTFUyT0ZQPD9eI0VzLkcuZD44ZSFfLEEoW05jK0gvLlBbODYqWWdZb04kcjYuUVdkOVxGbzdlTTBjLixTL2hvLzBUZkRsZEZsci0zSzhZbTgoVF03JCNxbjRtM142P05GMXQ/MjxXNVZxM3E6azReWTJTcVZDK3JJYV88YSwnbjA0MnVhPyRoJUZdZEhARj1bXGxmXVhvUiNFaUg6dEJwMjkiP1A+IWJJUikuYFVsZ3FGNThVY2VcW2hvX3A9K09bJF46J2pBSSNMLV0yI3JkaV4uLTQ8KiNfWTQxUytDck8yKFpCMjxHc2g8I3JaVFJWYDZNRWIoLzUtYHA/a2ZGa2IoJD8jLT0+Q0VMNCNbSjhzcyZWbWonWyNGNk09c1UvK0ZvJT8tWC1eNkZwQ1xCalAhXmJgaicvRTYoZkIhaGwpPzFCUllSL0ddPWp1NkhbYGNKJipdUjFrT1FYYV00XDlMM2NzVlZMOmMkRWhtN0xnNF4yKnVZJjBbYEZca0xxWiFIbklHIUctclovMSIicD1MJ0RXVDtEdS9yRjo/RiRSOEolTmhdY2xBV09VXD1DZ1RAWy01Q2d0bEIxckB1XTtKdFlkQjdMYTVgcmZfTUw9YGFKPy5GYEpfLWdWNFpdKUZsQGBFUWUuLHAkLltANGNMYkYsKlU2RChXX3IqWm9dS2tQLlpOY1ppQEo2VEZMPTZVT2tfVGloLEZmTFFSXSRmQT1AVG42R1VfbEpuMCtVUCZgNyo4b3NdLGdRRF9zIyIuMmNLNTNxcCJmME5hR2sncVhFamEnRjxFXyVRQigyYzdbcTtNTi0kXko/IkdvWjhRIjcobiZhXnFAXVdlOilKKj4lRjwhcEFRdFpNPnA1OzNaLkgxRUcxY1JFXTsvVmY2VmdlNWtkblNONXI7P3Uzb3RIJ0VKX1R1MVEpYVApaD5MayVrJEBkXSctOkxMbmJXVEp0IVBKaks7LjM/Lk5OOSlvb19YaEtfL11YNUBKdV9APCgzZUtyUnEsRyVXPkEpXD0pY1wlaEw0MjpjP21DT0RdUDY2PF5MPipySyxAVjdUUGdgUTs9NkdOM2gpUktpMmktRFMiZnJHKWRrWHFDS0t0YjAjNU5lQSVnMyNCW2NHXUBdQ1lGSEN0W3VPcjpWMTNaMS9NKTAzXkYjW1xablxHPi1dJ1djZT9hT2FFQikzNCxGbTlac2wkQU9USi9IYS5wPzgoL0l0InFAXVdYR15QQzxtSSdtXDQ8TVNGaUJUJmoxRks2KWNSWEZIJXRzTm1iOUdbYUhkXmFHST9tQzVBJXNpMGFCVl1ncUBuLXFNcEQyPk8kUC1NWUtNXT8/SUxJZSlkSV5EVFdcXkpTZEAyY0QoTyZjbz5xUGtmcFlaQkxkU09LLiVzaitPW3IpP2Q0ImsocitzOSJGXSlROGprLCw+MiEpU0d1QW9KPFQpO00hVDk3XU8kLGJTQzZHNTokIyFBRjpiaz1XIjxoIj1UU15fb3BoM2tIQkhyOU89Wz50RFJSPCc3O2RnTzYxQWgtKWBEJCZES1o/UENiUkE6SjhHSVFaLykxdVBGT3VwODUmKW9JKSRYN3VkQ15BOkFiWyVjLWVMRmM+Yi1gWCUzL0UjLEdVaGFCTGNeNVIyMDAqVHRVIUZLU0daLDNBZSRVZDFpcWpgM3RhWyRcP3JxYmJFP1MyR3RsQSNAUyIwbkwyJVsmNyNKQDB1U1shMGVBOkIqXkNmPk9NXFFmS1thbDo6KE0lVD9aVytnTixacVk2aVEiMV8tck9RXDVrNCwpMjV0MzhFPUg9LyEoPCwqWztQV1grcyNCPT5sLk9QOWVeJSN0XV5Xcy5ZRVVVaTBDYycnRSFLNG4sSydfVV4hNSg9W25bI1RtKjIyLUM7Z1wyLDBaNW90LHRQPCJddCFMUVRVLTo3VCEkRGc/UVo1Z0hPI1kwQEJJMmVsczFMU1daVWpKY207UFVqXFJdSVluTGkrMW5DR18wSWZvVCtqbV9jR2RkdGFoJlNKOjFuJkNDJyFRXTJ1JUBTJi5WJjcqMStKajdROGJZQmJEQmpCRnVoQy5wbkdDOUBxYFQyNWhyPHBMcEEvMF0oZShIIi1jKiQsLzwicjt0JFhQTD9BO1ZxZV1FSSFzISxjJFFfMlNvaEU2RkErcTQySmdySkVcPEhHYD9gRU1VPVdhL0poVV9nNGdCPFArXTdlXmZsIWdEODwsPT5QOW9cQy5aZkckK2UuXGc7SjwoXEZgUmBfTEJCZ0hOOFxDZXJDKS9YKU1zWFhqJXUpZ1tqUFNpXzJDUmA3Y0pJMmhLbkxBIko2b15lKFtPQl48bWV1KDosWVVKRTlFLlg5YidkKUhDO19DOy5IOW43UEVPXEkwZFAtQCpCTkxFcks3WjBXM0JYI2xhT2plLzdBWFw8JUswUyNmIiguPldIbiIrZkpgQidkVi4sWCRXPTpPVi5zczpYdUgrVU0mbi4ha1YuZys0OUQxK0NdcG5Fbj5NSipWOXIuLidxUFM4VGkiMWYxbS1mZUUhJmwrJmNiPVQpaHRzWTZJdCtdY0JJTGsvdFBRVCJVUlpTOmlWbm9pPkdxUCIxPF1BTF9HTVxQSElaRydmU1FJTV4jSEghJVNMcmFQdVZFZGttVlBJYis+R0J1Ij0tK3VJTj4jPlEkPSpWOVxYIVZFVG4qLy4kKGdwMkpNI10/QGU8Sik2ISRYczdNRlJaUDFcQWEkI2JGVT0tZldHUS8lQjNlZzhmIzVQXC5oWCFPbmZOLDFEPTEpS249PiZcOVcxTSJwXWZmZmVocC81Oi1iaTYnUGNPNihMTHEuZ1JNVnFTOS5OKjtDPytjTCg3dSFoK1dlY3BNbkVYQyRhUFxQKSJmTmFNU1UsaTRmOil0WURTX1tXYXJkYzpCRyQ+dCZHb0ZRPiMhWS4qQio1TidqXVddM145aCldT1hodFY5NS83VUtMMUhPSCJsNEFBbVkoajg1bFV1dSV1OG1mPGVEPyNDbzxGIUZONjhPY0Y6IW1tRkRjTl5OJy1EX3AtLXEyOz9AXGBnU3ROZXAjMUhmJyxZLid0c2wyOmk5WywhbmhnSjhGWWI2U2pMJyRkLWYjYHFaOnJVKXUtPConVU0+WzM6LmsqPHVNZ1NVMUNNWltGQWksVzpZNVYpOCorXm0iaCo8cEJdRzdWISRVQjFEVnEzKmFJTylVR1p1TWd0R0tvYSZVMHVsO0RnKU4nODJJTkxEb0A+RTpKJWoiVS9JalwjKz1saT9LcjBGaDRzbTFMZD5YUW5nI1xaRURuRzM3ZUUwWilQZ0UvUHI5JVdcLWguWkMzSyJaOFElQy9wbGVkSFVdMUU0X2ghY3NvYzhILztkNCtzQD1CMUNjPkgrKlxtO0xHaGZCZ2wyUElGRyQ9N2Boa3QnO1taY1I1V2tEOjUsTzw2PS9yXidWMVY0byE8RkU/WmBPZjIxaXExaDJqPEs2KUJJRE1LMFkhMEBxKiltKVItZ0Y4ZCYxPzFvakgqN1ZDayNoJSFtVSI2c2JwW0oyMyJyalxuVzdZMFwuX2pAKmtVXktDKjldLlVQITwqQHMmWl9AJ2RSTVwobVhpNGA1Ukw8aDUpRWE/ZEhSOygkcipLRENnZ0wvLEokTVdrVXJvPE0nWXVSRnAwXVFUJTpuNFgyVCxDT1FUYDUuNVxycVVUa2BPIWcyOG1xcEA6ISY9Zy4hWl81biIrUFt1ai4yR1ZxSi1aLTpNUGhiK00sNi5lLyosLUUjZGpAYGBnKUEuOyVua0NXLV8oa25RTEsxJUBGX1hYS1BXdTUvVUJwQGQtaU1KckhSTGolQlc5WCxINzw9UU9YNiclLGooOVsxLVI3MS00WjZLLVk4Qj0rWCteSGlvX1JPbTFFISJUVGY9IjRtNmA3cDlIaCg3Rl5kR1xbTEpzW1BeXjcnPFBVVXA6MSpwaCJqUSwqKk9fXyZVYkZvdVZJMlIjYjlLcCcnaG1jcFsrW3RzKVFZVitIQCQlIyQ6OyYhPEE6ZmdkUkJpdDJAcmNxS2UxISFzLSdXWG1pJHNQWi9kKGlQVTFfYVtINVAhMUBpUywuMW1kKUBaXWxNMzA7TGMsYVJRJSFOOWg0VChMN0ZWVSxBSzBnUF9FO11vcms+SSRNbVNVIl4xTU0hOTc/bk5HTSVqXSxUdWNfVVRKWTc7aT5nZExmc0VXM2RZSD46T3UiSiRgazUhOFdiNF4yU147X2cjLDAsbSROdThlY2ppVU1uSCs4cmRZRTwrc01jVydbLmNRKitnV1lgQjMjWiNXKWlLSS5QMEJPbWdCbmlAbGJvcWJFdVNmMmdzLG8yPERMTDZlaSdAXSMlZiwrWzEiNm1tQDohZC9icVAyb0RncXNUN1FbaTs8KyFLJXFfdV8oWigjYC0/cyJTREoiMnEsZC4qa2o+WDtQUmomNWZERmtkMUY5W0smJFUvP005O10tYF4/NzYyVkwnM0lsVTYsXCNaTjVSPyxxLUFCNz8vLGNYbGlEJlwmWTZSPFczYC5yMilTQkFkQlw6N088V24+PFFMbSstNU10RllcX1pjMFcuMUZUbjFWb05NSjowMFhKOUNbOT1DW0QxRFppJjReZ3QtR0ssbD1yYHUqXGpsTz1HMWBRcUUzMjA5QjpmaSxRN2dxP2tcUEBDP25OLD4xb0YsXk0sY0YoNkBSMUBlRiYlYUZvJyVNZ1c0bkRwYHRzRytGJiJHPV5TR2BBKjs4dDg+N0plb11nVydoKydBcEcuI00pbHRWcjNFTSwiODdOQzdhQENZOTplMUNAcERPQjZrJ0JIZUknZF5QLjMwWkEtZHBdOCc5NklhNSJeX0RjViFdR0toOUdAO1tETk5SNjw0NEBtbFVLIi8qdW1yNFlENSgvQ1pNaHBcST4nMUlxKT8kSGxiRCo4OC9QbiZjNzZhLUBCYV1YPVNpXTJtRztdOm8pSlZNPWZhcidJVDRFOFUvUmpUQipoL2guL0dGNil0VVs8XXNMUyFNPDtYNk5SSTpfaCs+JzdqLGMpIXJsaVBsZjBsTV5zKCs9cSNmLWYlRDVSXEQ6aHMuJ2pQWio8QixdKmtMKyRCM24udS1JLiRIXD5BJE4xO3JwUWwza1NCb290YlVTVUFvUSFqPUx0LDtmVywrXGY8aWdVISgwPGVIcjRwKTxCb2pnN0g6IWZUcmQ3cWBEaylDKFwmTDxNUmohbTFMLl0nPyw6NDllXCI4RWg6KiwpNVQ9TmhhKk87c1ItP0pzRTUhRkBHQlhxTG1iZTZWTFY+bkhEMT85RztDL11ZPSVSbkg5OklVYjJYJiNnamhtZycrNV4idSNUbG1jMltZV15AVXVTRSZVXTReTy9rVGkzbSY2I1UvVUhkY0I4a29JT0ktNWVaMDYncjdHRltnVTAmb0hgXGlySlUrUD5hc0siOjBYSmNbcmpWLCUxU2dsQElNc0BPW0hLQ0ZVJFc3ZmZpK1VOKTUsMFxnMEVqXVFEUmcnJEtPOE87MS4taFs2VlhqN1wyJV1hOy4pSTY3UGRuZUAvIlFJclgwJjQmYT89MEBFa1VVbmhVS05yIl5mcikhZD0kc1hfLl5yQk5jbS9oNHEuJCo+aVxrJDAkcTovMFcvVU1LVyNodG8wVG9QW19dLlw8PFRtZGVrWThuTjM7JCpwZ2F0REVYWl5icGBCYFkhRSlAKiIxKzRpIXJ0OWw1P3FMT2NtQC5jLzcmRGQ3SV1HUUU2Q14vLj10YlFeXllhQz9bO0VjLiVnMW5uQlJFZC5vPWNYLGtBVyFFbjtuMkZRXz9xJFJhTWxqbmElSEZOOjJfNFdWRVlIQm88TG0pdTpAP2VAO1RmOD84TU1sQ1Nbai9SQTYuaS9fdFd0UCMvYV5iMDoyRDpdLEEpNk1BQHUnaSwqX3IkOztQcjduX0FVOEFAU0E1VldNbU5HVSNsSUNeJ1NcSSlxaXJkOGE9UDloNF1daSIoWTExPFNJQ1hFL1hUIypVdEZrOiFEaFVdKExiZG0xRUBHIWZqR09PQlUqaSI1ImkrMXI0RWw9MkM9UFI4WUQ5WkgwayhOI2toKkRKMVZqI2pcNiZOQ1VAU0poVm1aXVRLdXNFISQxSTRkTlpsMkJIXHNraiNuSyRyYlE9P0pNblVoM0paSUdbOGhgVjNcZ2tVM2MhS2cuX1NcYUpBQkJOWTJAXCZiSzxdLiJhRiVQSzguI2g0VTRZTShDIkcuUz0qOWxcZzNRUEk2JGlvZSNHOG5gYGldNXVCSl1vTDVJLE5WOFc2WycmKmI0cGRtPC1GJEZwXGouX2FUamlaYFNPJFIkY0FRNTshOVBjQkRXbDhKY3Q+ciFiZHNdLStnV1ckQWxlZGRLYGJ1Kz1yPnNfOGlHST9ZbmBXXCI/NV8iS0pjc1FYYW5BPFk2O0pFWzAhXXBWTlg9J11xbTt1a2U6K3UjP1BCZjtrTDIpODohazUidWY2ZmBdalJgJUFJZGpOOyRsPiFOMUgzVFJBbzU1MixzMGVfZ1hdSyZjMD1LbC8xI1xDOSUqLzMkZ1U3JTpoSydocSVIWDAlcjhNJXRjSzdeaTVpLl5vRFhxJ1pFakpyPEooMlRaOiVYZV0kKFhLNSRIPkopNytHWXNbO1x0OVxpVWBlTVRpSitDMTUjO1hsLEhwNzFTZkg7RlkzNkklM2NGWVFTXls+Nyk7ZEtUJWlDbjVYOCdSTylzOiNfVC0jYT0oZnRaanMuJE1wXWFGbyZUUEVXKVFMVCRvJWErQysiM1RbXlpoa2N1aFJbRm9LTy5aKEcpJ0siV2pIISxJMCVLWzZiJiVHRzlRMlxkO0dSZ05TWWY0TjxcaTU2V3RAUjppOmEwJytPI2coMDEiMzBRckBcbmBwImY5c1shKiw3RD80QEFAUEReLWoxLlZKXD4sbFYiOEc8ZiJYJk0mQEpOKjJnIXBUTVpKIlVbaD0hQ3NgWyZcQFUlMVdNO21sXz9FVTUsKFdjTEUpR0Y6Sk9AN2RPOlZJclU3Ij5SW21fUVVKMmlXXkF1QVFeb0xgbm88RWtTUUhrVTFIMyxQb3ExWGo0XGM4QjY2RnQybmFlWUohUjRMLWhTN2xRUUBEPG42XSouTktKNERNYVw9K0hxRjsxWSVwcTcldEQkQm1xOytBZ2RuRDBuZTElXToyUiQ1JWxzNzUvIjtILXAjMTNHbGFdZHErKi9vOEwkay9RK2VeS1FmKyJUYzdzcWlBZk5tQWlOckpnblpVI2whKkw5PWMsJVorcT1pMCdTLD02KlZPNHI1XTA6ams7YCwvKS1yTmxHWDluMmwtXz45WWlxbkJBRj4qaVJNPVwnUW8uVG9eKClUKTJQJkgkbkJjM0olMUBmZk1qQDckKTtsJCJfY2c9Il9uaEhjPms4SEBxay0mL2YxJGIkU2EzIjJwWWMjRipcaE04IU1wLDRcY2BQMmsoKjBqRyhKZDNkTTw/QixbJy5PMUxWaiNYMFFfRFJbJWItWV5bYl4wK0JrKGtkTiEsLE88OGdJVSlTTTc1W3V1VVQ0PyVQZDMnOVtJV1gmYjxgOTYsaTQmZktyPmolNURTZ2xNVyQ8Vy9ZbllaR0hmR3MzWzw+Q2pAUiUvWDtTOW1fcyIzQzl0XnFlNTIhcmhDSVcvQzNPbEJBMy40V3ViLyhMIV1CKUpwci90Yj9hKitxTipgKl9TcTpUOGhobW1YS21lJWdWLzAubnMpS0lmKzI8OywqPU9RTlRnYF1BOV9wZk9mRVdQVUQkPi5pODJvLHQmYCZZXjgyX1tucl1DdWZ0USkuWSRSb1dNVkhicDRwSSZZaDckaywwNjdpNihoQkljUWYnQlJjXilqMyc/JmFiMD9aIVI5KV1XKyUvQDdcNl8kL0BzV2tmTUg4SkAjST5hXDNFOSJhKjRBLllUbSEnVHUsby9kdV1PaTtgcnFWdWVgbGA4UEFJPmdpbSolIm1paCNoNTdyN3Q3YWNGUExpTlYvKWhaPFQjb2QiUyNkdFx0bWA5X1dsOlJWaUBIWjNhJWg+J2tpbz1rMnJGaS5LVyhbLFZFIlIoTU88bFtQLmJFLEJvVGwjYS8uRlMvNT9FLDk+TCRHaGEjOFw/T3BYIWRFOWY9XjBIRTRbYSFhPVBVaHRGVThiK1AvXGExJmpxYDJeZVRSVUBxcyw+S1FuSjM0ST9sakJnQWhUbkU8J1xcQDM5cWVodSc6ay0lL3NMWEZaWlI8WFtiKDRANHQyLz1vXTg9MVElMidLbF5bNHRccikzVGcwZWFLS081JVssLkBDRDpgUDZkVHFHZCgoYzFKPD5BOV0/TnA7cGldYlc0MEBYZiQ/dSpwLDo+IlFdXTM0XD5TZ3QrO2dMPkUwITctNldaLlNNa2ViY1VJPmlpYlhjPzFCLEdfR1FSIWNpMz9YUWtXPihCRCYoK0gnRlkya0NnLlpmK0kjSG47YDJdbUsyaVZiVTg4cD9sRFZRLFxAWD5fZEAnU1ZtKUtiRlBUM1ldPnBQKU0hTz9iXUBHRm4vMWM0YFdjbzBtY2stQCwwVStrYyMoZiY3cy84bzhVIjRrTyVeNzdHYD1jI1pSTWdqQWs2ZzRgSjsqU05WbmREVjFMQjJYKHRxOlZPTExcSUw+ZjRYUFkzX14zPlM+WypbZGxra1o9NidSMyg8JGNkQ0wnMCpXaFpcLG1HYGxDJyMybUFkTHNPcCdcX1JvNDxfKWxeX3JuUTAlVC5CPEIkZlpIXVg3IStVOGx0PDpqXlJAKzFWTytpIyNaJSpBTDkwMzZON2NRS1U2UCNdY2ErKVdNYVQuLWNFcG1EWSlZcytDUUxlOypTMV9MSV1Bc0EidF5vMXNqP1A5Sl8tRixvNEJsVitGZ1deUWFuPnNdbU43ZkljJSQrJTxpUEowOVZVXUdvLCxxWjZfPUpOWSowUiJTMkVTcCJXLEEvZmJRZVFMR3Q5IU84L3NEdDZtYU5oL0tiUTBRXTI8ZStgWjosZE1UcixlJy8pI1pzXUVHYGBsMCVjLTRQRWklUyVxKDU5J0VWJUkvUFlASXBFSkpKNGhQYGg1IThmL3E9UzdqKitOIiRWRFlGNSpZU0NmWjkhXCk5dUo6XztGbjAtKyU3aClzUUthX1RqNSFrPjpiL2R1ND82OCxfWFYrKVAsJk9TckFgLmE0KGV0Nm8sX2FbTkUyTS9bO0BILk0wRyJsMCc4VykjJDc7N2BAJDQybjJLT1VNRTJJVytGSzo8N2gzak1EX1BcNSIkdVA6LVMvKi8+RVpwQC1kJnI3Tk4+Mz0lTV9kWWciZDxOOzg3bCI5MGpYOkVUZlMkPilHL1hiNHVMNjgnNCtecT1EMCMmNys1bFplU2NhOilmQE47MSxvYWdKMyM1c18kKUBUI1BNYWA3NEVKMTNoOjElWkhbdEthYkZCc04panJCSkkzPFk/QWVGKSxmYXUqKGhrW1RLSTVkaCZTLzQkJFs1ZmcnYDxwVD1IT2JjMDFkbDdVZmUnVkhzUiNWPiQtZW04WTBGKmJUYkZNNzNZPT9AXlQmbSZOLzZuSjFVSSYnQ1c/Nz82JiFNJSUjbSpcLiwjQydaJVouPVdEJyFOI1pLVGFOVUFIUGAkUnRiMkZSIUtDRCFBMTIjN3RuSWBdPTQpYSU6UiRJJDRUL0lSNDQ7REFUMEpTSXMvNE0xU2kkYU50LzwlS2hfNm5ENWdRW0B1ay9PXkVUQGRpTnMkc1NlbTY4QiU2KUImNiVvPDxLOTEmMVJvI2R1dCMwT1phaCZocjErXWdMbVshU0AiRGVTYG9galpyKzJybVRQazU+bkNUKypcJ15sPEZPJChjJS80Ly4lZD1GaVNfQiduanU2Y1RgMWxzJiVqcXUiJUo0SmxoO2lKRTJoRjJuJFFwPC9qYVpKT1xkUGEiV0lEam1uPz88cERuKl0nSmBoPFFGQSlBY1UzK2BDPCJhSV00b08mSGA0NFJaO2ZbdVlXZC41ZF9xQSQiLyYzRjA7V2pjcHNPQjUzKXRfUmBvXFBUVmdYIU5dLWYjc2J1MzxWTSxwX0UzS0c2SS1ZS0lHcEsnR0dYZG0nYFgiPzViUnVNcjBeSWZRL240WVVkJ0s0JSVQM1hIND0nMj9RM1c6PUAmYDIzJVwmYys4Lz5AYHE2b1xmdTNqRCgyUi4oZiRMPFtARV5YKWQ+SFZaVy1ZWTtgIj9iNjRhdUNwQnFsVFgjUTFCY1pAUyshIXNWQE9paFhXOjpFOCwpRWNYcyNuJXBXNUxAR0VzNzIjRE4sQVgzYSUlXUBvRShgaUBGKSxYQVVjcUwpcj5KbXBLXnVkay4jaDFXV3BpSDg4MmEhWz9pbDknJj9bQHNlOjE7O2oyPCpwYEhgNC1LTD9aUDZZPWIhM2VfIjtDNzZKLWA6PixVKyVqTi4jK1BlW0FXaChzQ2YyJFtvXzssbzdjYlpDNFNiUy5vPSQ/QTE6L3QrJjVqQzNcIk1IIy4iU0xXI3RkZnRFYmUkOEY4cUVPbm9UZ2RPZEl1UWBYP25Ta1EpJnFsVUVjSFJzNyxiN1I6OT02MXNJJVQubSRgXnJVaUFpRC1jZj4nYixsWERhbEIpT1xFdDdUUCdAY0FLPWInLG9ST2VgPCIsJSthSzVMWDBBKTtzQ1paJyIpbFFZU2tuOyNDSFtqWDQlSnQ5Mmw8aCc/TGgtMmA+bTJpL01OTUNxW04hX2VsT0tbNHIiYWsjZz5wLmxgbGY4SkolYyJZI2dzRWk5R0JxbU9gayhHM3FTVFhlJUFSPVprMVxrNyFhVkctMjJDMzFvZSY8YF83LC0lZ0lFM2w4QjhNdUp0MjUmcGNjIm10Ny9lZGhlZzFaQCRrODEvaUFyWENiNWZgL00mTScxWFgiOUgnZypmZkFRQWYhZSVNTCpEaztWQDdERSdiIl9UOF1kcXRYMjBtWidiMDdzN0sncG5pTWg+NmpzZTtPNWpGQWwzPTglJFQ7K2ptWT1gZWQyRl5WaTIhIUE+YCdlMStTYC9FYlJoS1dGTXI/MmNtR3Jla01Zc1crRlxFTTo3MzxDMitTRkhwRVMySygwMihELVcrZFlzIlpKXiJUMks9Qms6bTQ2IyIlSSpLcHBfZCprPGpGdF4wRkA5cGhMX0NOLTp0RFxVWWJJInJcZkg/YClVOEwkVWNUQUxEbEdBR09HTzwvb0RUOj8jZ3BAJys2cGpsXTxTTSRhVkY9Pyo8akZBX00mRkw9LHVdUWBiXy9DSUdhO3I0aixzcUlKY1RaTydYYz9HWjlfaFREVjVkOzR0TCVqUXRhMzlsOEY3NS0wMDFfcWYqNGE3a2JPTDFUZ1Y0MVRpUEpPXV9DZj9IPDwjXCkoYT4hWmFSWCUjQFxUYGY3biNjISY9Wl88YW0yK1RlMWN1XHNxMXMkRS1tK3VcaUgkNllIUylnaTNtU2pVZDEmKEVyKV1FQ0FSX2Y1a1FpUDowMDlALihOSVVgWWssJzpIIjlxanMxJTVPJSlpYyxkMSJPVzBTVkY0ZkshXk9aZEhnL2hBUFlMcWxLWTJVQlRIRWJHbCNncWB0KG9kZCtfdGIpOWInb103VTw+JjpGMkI0JCZycV1yUm9OMzFZbmlab2FRNTtnSE5DZm03aydUIktFcUstc1wuKVZjaEZBJ0lzUTdeNC8pbWxSY0dPVUY2J1RBK2JUZGU4R0tEMHRkM2MzSCNrNUJeTFtJNyhFLTEiaj9vUGViOzcvM0tPa1lRaU9IYihTI1UrOzV0ZjgqNzYjZSdGV0NnY1RTLGVdZCZ1Ik4vKTdYNXJyM0dNXmtpcTgwUytqdU8vRUFvVjpHTGhETiVLP1psYl9PLVhcVnA5RUlyVCo3JSYlIktHQGBhXDZEU0M6ZmoxW1RmZTVVIjNZIT4jJUdtL3F1LiRGbylDY2N1YXE8VCEkVEZdTD8sI18xWWNfSmMsUmVQPTJmZ2tlRmFvTzVWWXVAYFVqMlIqOiw+VlpRXkxIIiM7L3JNJVYoQyZfOjlnMnEpdSZhKkpzIUJEcSUrbydIYWNbcW5Eb2EsNC9ZdC9YJjNzVUdtOzRYUlNDW3BUM0FkOGdDaDdbIyZwbidaQSNZX0hzMVQ0YElmUGwwOmVQWm1AYVxaNS5eKmM5Q25hZlpMbCd1O2VydE4sKmJjLjFgMSpJKFdkal1lTyhBMDJzJyVPW3VHOmpCQkdRaTonKCUvT1JmMVolOUxsV1xiRyMlY0BdU1AxSm1tRVZbN0Z0LW0nbClBPEJOa0BpOUhvI09UVlskdGpEOCotVVlWUUhMKEc0YGtcX1VLOU4wNFpNUVdBJGBAJV0oIlhMLjVBO0o5ZkQja009Wm1lb2pxUlteY2lMIk8pNysoQjFIcyVCT3JLU0NQcmc4YE5iJkJROTlEPjZkcy01VFtLcV5SbWViY1E3SEFCVG1falc4TlVwJEI8M1drJDY0QURnJElhU2YzXmJXaWVOU3QzLkg3bEtoRFpyU0RYLyNfWnJyLGg3bjZ1KVMjSEpeU2I2cTBKTzI7ZnRrMWpQX3M1QStsVUBbZ3R0UXQkXjIkYVMmYVlacUAyUm87TjRSSCdHRjwrJjxMYVcidVVZMkYkTHQsaE9scjYiUiZbNnE4Y2JZPSlPSWBsM2RvSSdcM1lYLjFNI0hUVCIqV2FZJzQvX2otT0RDWSJNTVo/MCZbJVgpJmRlYVlOR1gxQU5kYjE1T2E3VyJhTVhaQFNoS0VGKzFiQmlwUT5yWE5UPEQtM2BXLDpNQ0pick1FbSRETCcqZnRJM3A0WGFnPHMlMTQwIy1UVW5rJ0NlayVTY2JBMCY0TixLQG5dUi5rOFNkS3FpVCl0KytBWHRVNlA6JUM6QVopVzc/IVF1N3BRIyxLckZARV9xXig5I0dVLGpbIjBzVWhPRCpGSzNdPitXYEY3ODJVUVomS05BZV0kJ1VnUkdiVWAnQi4hQWsrYD1wUV9pMVdzKUdhRUhndFZGTjZpNGBeO2w4XjVZU11yQ19ZVjVLQyFcOi9fS1Y+SyNJTVpsRGAlNjBwO0UyQ3NaSCNqcFNFYjNrdTRjO1wlNmtPU0VKWElLY2krOTtsbSElakBPcEAmbmJLYjhLRUBHMCRvU1dHNSRWKzZmXHAkYTNcPiUsYEZAZVpdVD5UZ1FmUTItNDFlWFZeWlg+MnReZSQ6aygvRFlVP1JjXmAtNmtEbE43L0tdKWc6VjtHa0wlJ2oyWjwqLj86XVpDIT1WW0slJDwybiImaUE+W0JMM0NoWFo+VHJnUihRR0ZnWUVuOG0vUk5uXmsqa2YiInBEa0prOiEpZCg6OUpFOjNIOSQnbzhkY0tccCY+VE0/KElJN1JqXGZOLmlzZT9lYlZXVU1HJ2w/MDY3TjdjJWtsUEsmUlI1KC1sJTpHLENray8scDFGbm1fMzNKUjhmbj4iJVkrMV0qb2c1T0U5QipXTlwtbSdpVCdXVkZJJCpCZT1rcXBJQTA/RlFyKUZCS2o+bCpCVDIkOFVNVmUyYzBXVXVWW2pMTDJ0KmtucSNrYEI4LkVXRmxDPGwwW0Jlayt0aWNSdXFcQyFrJVROS1k4RElCIyVhKDcoSyRZTjxfblFDXjwjVjU/WVZicGQkSUElXEdsMzU9P3NwOmVaIy9oUi5nUm1DMVQpOFhIVUJlKHVmOVolQ0VZLnQiblI7dSwhai07SDwtXzF1cicuPUpfOihmUj5CTTRcM1BKQ1h0YFNqTSZvPigiQWs4LktUSSpLclJBI0hjdFtTNzlMZyFdY2lhVSsjOD4nQTYjNzNSTWM4XWpGLDdiV0wiTmhRRERUL2E9SWxFTSc9IlsoUWUhc1pjP2JqYFFyb29qbXBpOSRUclZxUnRAJzRYYlciOXNvOVVoQlkjMSJTJVpoMCRiIzo7SzZaKWdPWTEqYzZsPVNpR1BMaGk+RzRLc291LUhhZG1RQkZcKkspTjxlYGlTSV4/ZnVBQTpFVjFbP0czZEVQSixBcitMNzpiVCI1TTY2VSokXldrciVORT1FQGtZQVRvWihsSVRCXkhhSnJjOzwwInFqVSZYQGg/VlVbQzBmZEZwZ14rXyxDPCkyTDNmY0xWLEZfNz8vKWVfUzJHTGVAMk4/OFdtQHMpayNSYTsuazkpVUhVaHFEZUxhUm5IaFNwLTNQJ0VPP2cjQ1RnRDNLaHBXZ2dwSWJERF5DaXFeUTldKnEpNC1pVFkqI1M1cldvQzlGNkB0QjwuOV1uXC0iI1w6NHM1a2NjdDYxK1MqaVpFTldJZm1lUEZsU0poJ3IuZyIyaiMkRDovMXBlNDo3VHQ3cVtwUDBdZlZJWkA0V0Y+dUY/UiN1J20yPmxEV09eSkoyUiJPYjgtdThpQz5fNl9bcGtsSkNuak9QI1kpPlFMS0RDUkhIMklPWylHOixsIjhBXmdUQF8jaXBiNzU3dXRuV14zO1ZVMlBecGldJl8kSWZUSiNJYEkkYDBHJ04hODUvZktuOiNkWGMqVlV0Sl0vUixcSTpnVWRwPjNTKCxPJWJMaVhmUiptKikibipeNztlPCpgSFspXGBXKVAhcmdfZFVuaWEjZztDbUNedThiOUcwTUkuQVNJZWIiajF1QiVpMCwobDksUm0yNWZDNlZFbGdgXS4wTCQsK0IoTzJPTiRhZiJRdHJrZDJDRDJtV285X1dlP1JHazZDVHFtVy5JIUZjdU8wIm0wWlZqZSRCZDFPQTskKj1oJm5SKmpDVlA9OWRDdFYjMzZobC4pJ0tBZ2BcO0cjbGBnaUA6KipaLilcT21GTjNlOEgvI29iRUR1LjtENi1sMG0zSHQwXk4oVzhRPj8tT0tfTSghX2NIWVdPJl0/QDUsNkQ2cVJpKUIwbTlzNy1sMEU7QDttOSxOXmApb19EYG1wNF9PVldNUzRrOEYwbDVbcWxlTTpCR08wJGFIPk9HUVNuMWJJTUM6Jz4wLSRWXWA0OUhbQistOC9kQmtjcEI6cklgUCYxJ0twLjdKMF5Ma05sRTwvLTJFKF9SS0FyNyVERCEpOWI1JzsmQkteaSZTY0MwVzJPI21JYDQpSUMxUEBzJTZdPTFXRGclQE1DQlJfdS8tKWotamxVWy5DIm9uaHFba0o7RDErbnUlSiojSkY5Li9sb1lAS3JhUCNkZGNBNy02QWdRV2BxOkcnPiVIdSRwUDNmWGUuQ11aXmxLT2MxTzJnWTtAWjpqcjtYaXQ6ViUrckY3J0Myc1ZaNmcmMUhMdWInQkNCJUUkIVNyI0wnXUtmbSosNSFjZVVET2RkZCM7Tj4zU1c7XSRzQ0cxKSUnSighN2ZjVjZML1ZbZXFLOkRqOV5iQDhiaUMiZDc9MGhUUik/ITJoLmk8aVpIWSM8TkBNdFNUcHBkPCpaUzghSSlcRzdcXWY6ciVWOSRoI1g+RC8pNCRCbj9uaTVSYjNFJyZDPG04TUg+PSFCZUchVSViaUlBaWomPT9hdU5Xa2hDcEU2QklIZmxnRlVlUXEqUnFMVW5LX1V0U2dnUkg1WC4qcVVWKEQhXTVcdSovQmNXbCJUXE5PSDJicUA5NjExTmNeRCZ1YmNocU5HUGZeJmRkaUxXJnFBV3BuUVhWdDFbMVxFOD5tVDtQZGZ0PTMxaWRgVCdGc1M3WjssNUJgMm9ub2krX21xayUjU1tiQ01rV1VAMShSNmo3Imk3MDw9alRITHJdUz1iZSFZUlJbYnBkTDk7NF8+SElUIyIhb14obW4sVCslaUZXMU4nXkxwWV9xa1MzKExTXWtITi9CRmdrU1RbZCIqQk9lW2w6MFs1S0JwMz44Kipfc1tUZ10tIlxrQnQsNmAvM19LKmRfVUBiUjNeKy5RVTJpNStZWDc9Ny5wJUYvTiE3RFlSPEh0VyciJWtRTUdGPWAub0FWdDpSRDxiOSw1JyI8cmZpJm5ZLnFKZDthJmJoR3JGISw9KjltMzlEbkNJQW9BZ0tQRylPMXMpKDh1JUQkK206PGY4M0dsblA6cmRWT0JmP0JFIVY7WCIyUCclL3JnanMzTXJURkxZYERbJmpPN1daZXVWQCw7R0xoQj41K2twUzxKJ1s9azorcEUkZydyaGBqKjtwOWpJKHQoJlYySXFrJEw3JDs6U3JEOTI/YTctLWFaJC9WS1wjOUhAOjRQRD5IcWdZWjgjbTVFXTlfWD4yY0NGa1ZUN2QuNllDUE1LbEtDWCtEMTYxM0trMzZzSTo+XUNKaCFsOG8ybiphIlAlYCsxMXBadE9NbU1pY0IybTVSaVxuVmIkZWBUQCdNOTEmJSstc05FVjpzO0I7JCctKUAjbUM0RkNuc1sxYVI/J3FwQCtybFhKay5oPkBUKzYoN2JaXGBYYjlScnJqL1lidDJddCFqUl07TzNvcVE3bGpvTG9LN2tGIiZyLHI5Lm8vXFpDPWlNNi5OLlBHZ0coamUkM0ptJUFfQEhWaW9yUTBgcy9gUz9xUS1MJ2gnLiMtKDBQPShvVnBEY0NdUV4oXyZjbGwhUktKbmxyJW85WDQmJHU9TC9NXD0zXzcpaDhHSWBmJzdQN0VyVGAodCtZY1FxbmBDODVqaU8+OSolKTBGNGRiZGdPbHRkaj5AcyNjJSxQUC1hU01AQFVGMCwqRWNhVFk1JVVIO1VEUVA8LSZTQig0Zi9TbGs/TkxNbUorXDEsQHIySSVxWyNTTFxIKVFpS11haTllLmZZLy4/RTlIODljIlpCPU5LckxRMjFtRyxFQTAjZiReIzJFcW4nZS9cVDE2VSUmPGQyLFQsb2VwTmk1V2FwYGZqUmtkNkEydFRVQj5PPD1bXCU7MUtUQjY0Q2BtamRlUmNhIit0a1k2Ij0xPUlwbUQrTGxJcURhKlg1Qjc4dURjbDxBbV1mPWZbXFktI0xWNDZhJG9Kc1RyImVPSjclLCYxaldNXDVnJFg7VCM0TTU4dVlGYUZcSD9xNzQpMVZQNVU3PD5gQ1xGIWw5dUhmQWFsYS9DWUZPRkQsJStZMVY9cmowblRAImFaPkE6JDM/cl1iUkYwQVhYSmlla3AnPkRgRXM2NkQoW1tRNWpxO0RtbVlWUlkrUUpLRE5ZJnU4RDc3bG87OTlSREIsP2g0ZjtjWSg2NS5BNmxCPHAkRUxxRT9YNyQtTCxBQEJAVkptK0wpYjssU01ESDZiVVljRmljXmQudF5ZUWNcPT9fUVglQk1APiReYm11VSk5OS1mPCNuYGpOMXNcW25VcTVQPCMuL1ZZZ1dZLWYjTllVZU0kLFhHY3NncnBdOXM4T04qTidVSSNwLjVYZ1NSQiwnbD85IzpMb1YjRihMYyduSjVnQ3JwbiwoVzFgQCYsZy9vWUArKiFtLmE2MUNbaTlMNzxPQilmNj1gdHA9QC9aZDFCa2FsXUJiLzZpYC5DIS0lTCxrZmloMkR0N3EnbThjIUkmLjVfJ0NeSSJEOExJY2llODclIXVsMV0pOUA2Tm5ONV0sP1JnIW0lLWs4a0BdYVAyLW1fKWdeQyRIL3QsYVRARGxeKUtBI1N1QyJdcTJuP186Wm1UUzoxQWdRLVxUTV1aQDhHNiQ6QiFFOHRGMlo5IS1iT1xJQyIlVD0iPUFeJWFlRidDMlhdSFZySW89JVhkYEoyZ1g+c3U2bSRlYXFQQU9uL2ZsUSxILlZEKEc6dEEmZDJwYEdAOFlMayhZZE5EbUBmPk1LTjA0NTNBdChNViZjNSFSM1lyZTEzKmxTUXA7RS1ZZCtVKVVgV10nbWVMPyMmJ2MvQkFFISNuYSFVOTIwbmFbW1VldHFIKmhcNENTTWRPQGddKiZsanJgODNMOj0iQU4lXmFqQW1idC8zTm44dFFmZjU+KmgqI2pmZC91aTc/JXFIL0BeXDZfcklJNF1PVHJeOkc4NHRWQXA3Y1c/ZFs5am02I29tYDwsZ1Q6NjpFWFZxY0NuRV9eRzoiazE1KC50SyhaaW41IiUyZDRBamVAUy1gMldGLUcuImFnI2haSGwnKDNeLk88R1hSbjJBKnNUTGpkUkFycGs0IlJcJW5UYktmN2koXGguIktsKjZvQFgiNzVlMzpjMSooWFYsbSNEK2JjbEFBczZIIlFtK144ISlFODE5R2gwNjNJSWY3XUIoJmpQZ1dnX2RYZ2lyI1BBLVBrUlYlTkNxbmhUT0I2T2koVzBWYEQjcGkjNjhaPEVHKDNuNUFaQFEkQGNEJE87QUZQJSpVWk9lNltoUmJkLjY+Xk8hKj00cUhQQzxTUSVFMEQ5L2w2N0VEWykoam5CV0xmRzJbRj51QjpJWTo2c1k2cGtyOl1LXyJCNXMsRiRVNjZsUyZcbSgjO2pGdEVnW29AS2BjV3IyYkRWMjJnTyVoYUcnbSMsVzFiaGVwIS1eQC01TDA+WjtyV0ozSCpvdTEqOlhUaGknLTsjKmpKXjQhc1ZhWiJNTSteL1VdWWNwIkdcSTBaK0lbYV9uJVU/X0A/YzJjbDM7KGFMJSU8cHMvanBodUA1T0FSdWc1InI/QlEwYTU/S2MuNVdaJVA4T2QlUSVRdV1LNGNqUkBdO1Z1RV08PEAnQDwkbiwtS29DWzdmaEspZm9YXTRbRmxxbiZjQVs+MUtHJDZNbVVYVi5BRHFOb2BbU2VHUmk+X0lbISkmYnJdW0JGWjNuXFI3UFNgO2AsbD0vJUBHSzBSSVQoc2pfXEwiI2FSbSMsVUtAUltabEtQWTIyK3RiL3JsbUxPLSdcPl1oS05uIW5MZUQjOUJQMjZvNmtOOFosOkJxUmoqRmFnc11fSGVzaF5VWCFCZG4/ajc/aHNLWW9hYTlzbCwqN2U+SUgtIj1cSD1AWmdnZC0xKyU+clI8R0o4U2xCI09NWTlgLSs+UywqOF9wXyVyIVNSZ0lIOFY4Q0RWLyM0Z1hKTlEvLE5mRl4uKmdsLFFqQD5lYjJQSFhnVkJCaEdrSCNYWFYoa3NtV2g1Q1tHQGsuKzMwKilGaT07QWNsLyYyRnJOak9wM0RFcDVqXFpPYjlQZyI4UkJLRkgibzdga2onaERUO2gxRkpMRFtzIVJCMlJIOFlIZyMjO2hSMSRpImlIJl1ELDZhKjUsbEA/ai0sTD5UNjlpKWJVSmJTVEs2bSlKUyM2X1tUakwxN2diJUBKaTAiNWZWLC5oU2xGLi03ZXBqR2VQUFhebWIhXHBoN01uLk5cLFZHYmtzYzdQKTA1OipVVSUoWlQ4NjddUGg8J15Lay1SQm0nZkAtZVVuW0pdVGo0R3B1QCcoL09dPl9tdCtBNGFwaGVVbTwoJCwmJVVZRTZbMzZxVEFkZDA6XEVdMTs7Sl5VTGNuRlYnbTFrP3U1OVI0a1A1YF4vN1k/VElDdGUqLjxKVFs1Pyp1Y01KJEVQZXJQIkQmcS04a1FgSW80YFVNJV4vPD00QitST2BCI0RmMWhmQG9NXWdraSMzZEdQaGpXYzoiaF9sUl9XTDZeRidwWHMrKidEVT5wbUVFRW4hVmNqYGBhMzdLcCIkXmY3TUJbMTFOXlpocnVAQTo3WVM6VVNjTzNBZWpMaChRUG1mRkQ+Ij5FJWQnOVhHaVVmRihQWjwnM1FwKS50MnFpYnFsOVw0YSkjL2puIVwkXVg2ZWtfcVU2Q2ZKNm9QJTZSMVw8aCEqMkI8YVdgQTMvW0cjXjVWRnE3R1cqbUtpZ1xbVGVWSldybTM9XnBKak5UYG9yYFspM0QwVCFDSExdMyJbaGUnQipkIlFDbChSLEgwTV1cLFdNNVI4MVRKVUduNDZodDViVVo9dFsxUicrRkE/U1dDZCdtdEJhMkc8Pj0zZDtoSUpkTDleLDYjZVg7S0FBTFJtPSVwWlRHWTFCdW9eO19ub2JTX19bVV1IVG8oSDJFOV5YK3BBalZrc3JhPy5fI2BqYjFGPiZWMztSPjdeKygxayYtVUJJa1JBXW5AIkBncHIoYyVzLF1EJ3R1OmldPj9maz5dTkguVFxwMG9VckI8Xkoja1ZvaGBbbTVdIUgtTEBkZ1BlN1ctJDEnYWQ6JFxjWDk7QWdWUSNRQUAqXTQqTDdDb1Q6VCknP1ZTZDFnOnInZyloYjgnRlo3IjxbSE8wZlgsWWIxWyFCVj1aZiRxMTlgYSsvLVFIRmhrOCxrV2w9LVtTMmA0dVdSSW5bMj4rczsoMTxWIjkzR1pRRU4pJDwpdTksWUQkU1lBMzdBOzIuZ2lHTEJYci8sPiJPYUArazAySzlrTlQ3aEpRZkVMaG8yZ0dKUShKMkJVZDpGb1Y6RV1AT0lYaF9vRU1WRj4/I1JYJTFvYVdOI2VAY15KOjxcaXBmO1IlQVljW3NvZlUvPigyWTRcUV5JOlVtZTRkMSdIaFMrIVtsczYrRG4kbWYqcmlMZ0VeK2YwQ0EqcFRNcDtoNDJALTsnXzxmJ0dbQ1tJTVRwRms0MVwvRForUjg9PEYkY25EXDQiTk1dRnJESVRodFohJ05vbmBzPFpASUdXQCNgWERCWGNHVzs9P1BgSykjWj9mTydiPXVZVEtGJWBFaiVtKTVYTDNXbG40aCJzI0hkVFc2X3JKZiJTaiwhMl1Tbi0iWEU1RDo5PV8lMU9MPnRDTylmR1hNOUEvOkM4b2BnLiNzIWpILDcuJWRJPGQhVCk4LEMxW2otWjdVUVdPOjxucyxQOi4tRkM4SGBHW25WPkFiYClNRDhnVmNFYiZAUEtDOVNLbFVnT0M6TWc+ZEptVltDNm8lS3RHNGptRmpiOENIYzQ1Y3M9aCona2Zxa2w+Mj00cSsiQlJqIyZkQC5NUlxidTtsW0tkOiFcVT1uMU45UmpxNyFOQkMscihfaWJLYVloJSNjXSgnUHFtMlRVT1krKzFWOkdNOVdGZ1dsJjpWRVJCWE9iO1pMYkViYTQqUDh0SSNjMlBdNDxQKT1rMk9TUDhUOGJSIyRyN2E8Y1RjRFhtYCMmPVEwNmcsSmcqWCVXZj1ILSFsbW9qP3A4dTRYOVVDMFI1KS9vYkE8UiFpanNTTWNATEJxU3ElUjwpJik8OnE0M1BfSk1PLjE8KnFsSXJrdDRtUnI9ZStGbUZZKGdMaz9WZEMqbGFQX3FYbihzZiM8LzUubWcvREA+MCJZS1ZgQT84XS9Ycy8saldjMyJeXSJmbWNCXVR0MjghIjpRXnBKXDdlXlxnOGhJb1QpI0MqXiI8R2A2LVpbaTBDJTFYIiddN15YVFBPOSJOblllVmZCV14nK0FSbjBJUk8oXSZuIjRgRWhrWjAjQjZMWlRrUzU4bTpFT1Q9Tl5bSFhlQG5mJ00mZ1hRMnE/dE47WVI9N0dNZlImIiJNZypbPVFOdT4tQXA1RkYlVGs+b1AwIVwoI1VQI2ZvYytFZDI3blkjV2BPV2tjKWtUSCpUaUU7Mms/KHMnXnRESF81IiYkZGpXZSNmQEtVKmJmKEl1UzhvLUpXIXBjZXIoSEEwQiYyXzlDUnBjMFg0S2k6PkZcViteWmtQX2xibUQuSltXTnBKVipYVmFTaVNNQT5xMF06JzpYLGguMy9XdSdPLjBDbzFLK11yPDhyQWtcXSwsdGpUIWk6V1lOc2ZyQ1czaDg0cSoocWFHQyU2RCclTm5NLFRWYWgoYGtmT1AyZy5kJ0ZPJEQ7UzFVJjs8ZjlSS2AhIk5aby5CLW8wRDQqVCxDcnAjcnVhIUFUaXJFIysna1VzWGpMK3V0ZmUuNUAmdFlvPkkuLzFHNzU2N0p1O0hJJ01rMGhQaltkX1FkZ2dzUG9kUkNQKyRqXCctaTlPZlBqQVNkKzxMdUVtZVVSalYpSildcyJdI1leKiQoIVY1UEhxLWBgdC1MNzMtPiYhT0lbUzhNL3BQXz1eTlgxVi1EQzVxP0FQbVNiaSxMXE81WT82ITEiSUpsMjBtR1lfWSttdCc6LllNRDlYN11sQF0qRE1rQT1Cby5KJEZGNyRMdU4nbjAwNkE3P2kqW2pxTUZuakhlWC1ZUERMdWlpay9FUUFoWGdZMl1DSUpoRTdvMlsmZSxYRjtRXEFGKl5iOlI9LVF0Y18kZVNyUSdZaEg3cmwpNjpOLkA6I2dXY1hNYDg+bUYrVClsSDgqMkNPOldzRC5ULDdfJS5xUGc6YEc5ZVdrdVhtW2VYZWQnQWRkXTRXaDEhTEdTR2FtMSpZKVpAZGdLYktxKjlkIlw+UDBJZ1A+N0NQOF1lYi8lV2sucCdsKFBdLjFDc0IsVmJXZEQyPjk1WyVFT0xMK0pMI0YlNi9yWiEwKkcnSi1tTEdgbkBETDsuRSMxSlAhajgtdSk7VS1GbG9tbz1odVFKJz5PVmhQWjZDbnF0aUEoUVptZ0dsJFlXWDZOQk5eIjFuYUoldF9gMnU7ZTlHTzldbEZXalMsLE5wPypfUDFaNlpDO0hycFJJSHVOJWtDblstVSZtXG83Sy42Z25tK3JwaVZhMjI/Ky8xYjBFN1EtTSs9YT82ZTttWEtcaUVsVnJTLmx0aEhcZ1koQ1M2VU4+Rm1TLjhHNW0kL1siM2dcJzZkRWtbNixNQCxkIV5mZF8waVhwcXFaPD9bLTJFOmxUYTtiRVA2WV5NRWZFVihCY2MncEhibT1oVHRhJVlpYDw8QVRcYlleNVdBPStwbmpTSSYvJjcoI3QkcGRAJF4rV0cnclwwLFclVTprJz1OUDI8VDQxbG46PlVbKz0oOVs+J2lhWys0MWp1OSRuIWNGXmVxMipEO1FYJ2kwMyVoLlRSZmE1XS5vJzMya2VsPmU7JEs+Tk5EcEo3X1ZqLyo1MGBKL3NuVCdDJGk7TV46IVtwR09OPCpiMG4tdXApP2YvSC9uRmFrNFUqZWMmclRUPys4cVlRXUlCYjJyNj83ZkBJPltZOE9yb2JrVi8uW2lUZCxoNWE/LkVvWEkpX1pSVzoyW2huTmMwdW9uXUhWXisjMVQ6VmJYbDR0Pj49aWJRdSFWTXEuZTc+bS5nYU1iWUYkQk10NWEzZ18uXUtFK21rOU4qMkZpREYiXDZbZD86Yz9bMWVlTkxNazRUcyxQbD1Db3NoTjAmZlYjN1laUk81ZDB0KEE4ZyhbZV1BNjVDYDprKltmZChuL1szVS9fRDszZ2kxbUNeRSVeZ1VLOkosKEJyUW5bXXNDSzRFYDBGK0lMJmhEcypUSysrSmRqNmU7azpHaT8qV3BUN2ArWEszbUw8Y2g2TlJQN1JNPjJtZVNbQDckPGI7VUVyb3UsOS9xR2osLC9dRyI4OixXYGRTbEQ1XT50UHMkVUE2XmZBTWdPNmFgbEZnL2ljSUJbWjQ8XUBYZHBzbyQ8QFxbIUJSTlFCWUVQNzInWEk9KyJXN2xTbmg5JWlhdD8zPWc6Lyh0MkQkPCVydXRiVW49TXJTXiEvSEBHLEZJWmtHbipNVUw4RmssJFBbTEkiKXFyXT1HNUJxPHJVUWVcTjRfJ2NxMCZJdDBXWz5JWm9YNF1dRlJTWlZjaFluWClyQ1BcMDBRY2IuPmFhUV0nIjo8TylNZitwSjNDP0BiMV1kbV85Ky5OKz9YbSpIbiwrX1xRMD0pZjZTTTRKRjszPypDP29rPlw6bVRjXFVYTm1HMjxcVSVdJzFxP0IzQHE4RDE6U1c7PFpmZlVUcVduLT9Jc2giOVExSUtSLCFwJDFPUEtRPC9sUDspWjIsaFRJSkUwc2YvP0BncDYxWmJCUHU4Jl1LazBMaWJhMXVyUSlRM1h1KGc9L2MmSkInUD8mP3JSbyY7Ki1oPilCMy88J0peXy4+Wz5LbiJac2IzbEM9Qz1hM1IiLik3ZEYqJzdtdFJCXktVMCpjXm9JRmQ6Sm9rODdJVj4xZWVLPCJWIkpaWTJBKzc/W002aHFxN2VfaSohYW5CUnE/UVFYIixCaDZWImZIV3J1OiFfSihEK0cvXXRMXkw/Jl9XRTpHTi5YMjYzUD1iJD9pRzAuZSRpQCFJckVUSzNPUEJ1JmY3bChqcjo1cVo3YDdjW0lELTNDTm9fbDdEPUJcR1MwLCpdXTtfIy4/ViJ0WzEhRV1lV0AyO3FIcCU9OVUldThxZCxOb1sqSiU/QW87cGcra1wwM1M/JFBLQzZtdXMtVl40VWwyOE5uU2pDZzVdaSVZIjBrLGdHNFI9ZTs2WWBTMkpWMjBzPFUlPnUwYWdFMy8vQ20tRG85LU1WX2RlVkNbb1ZHRlI+ZlI/I010JGdubllIV20jVGVnJz9OTXMtXGoyKnBaUiteVD4kMEsxdW01R0FWOCRcR2JROFgpRCx0Rz1LSic4NTozRCJqW1ZDcGhiXzQwQlNgQiVgcG1jQmV0VyhhPD8xNDBPMUFMcDFxQC4+ZTctb2tuNytTP2o6PyliUEBeRU5AZVE7PUEySWNuWF85SDxPcUZ0W3NyR2prWTdPKmJVSGI1Nzl1OC9VOzFDTWI9bmVoWEZQQFNoQDk3SFtdRE9iYFdLUmFJPS1LJldaWVdtLG4pZj1rMnNqSURMOjxCTyNPOFdBVGYsO1s6YD1VKmVHRCg9dCVMKDI5Lm4scy5aXCxYb0lWOCl1ZDNfMVQoK1lZRzw/T1FlUCk7bEk8MWFXUXNhXkhGPF4oWGdhZltybz9mKnAkNCpGalZWPDNBO3JILy1fbVZTZllqIk1SWCdpTzdQVVU8ZGk3W2AuNHNVdGdRVm0oalZQJ19HJUMyc2xgXDVhMjRsYTpoWE1WbT4zcFkuNT84ZlhuXD9hLmNCPyxbPC1DWi5iN15FckheV2JUXCl0YmxhJCtuMl47Vm1bTU5vcyY5SFxROVtxYWJJKyleclFfZEA7b0NEcj9RPzw6UUpHSFQiKnJOYDBSRmpuRFJbXVw/WXFUWE5GWzxdWUNYcW5yNiU3cW09NG9gVS9eRHR1ImZvP0xocC0hXiI6V0RubWUkQElIZzc7dUhGVStpa18wRUs7SVFqQy0wcnVeK21iIj5YVGwnKlpodCxiYDx0MEAjUj5fazlIcDNDRTMlcjc7Z1UtJW4qYWVuciVSJSlbYFZcZmwzKik9byhvXXRnRjJ0UyNKKTBZbU0+KlVxSStzXTprVzFbSGorW2xYJ1FyQk5dPEQkPmY8YXFcSExKLjQuckxCcDNnXyFicDVaZWptXS9LSDRMWHJlKS84bGpnW25DVT1tUnNXQSNQPmBBPzo1TFJGRURSakNIPDxcSnBpMWc6dXNpaD0nNzVDIy1ZI2Y1QFFaMSM6Qz8pbTtHR3FqMlhOcmJCSzVuJU5iK2svbitxRkpYK1lQSFMtQ283b0ppbSEuXU0uNzRQQTF0JVErPXRWRz09ZiFPZl0mUCZCSXFlVD0rJEtKSllISWM7SGddX11kWWImXzAuSDJHaDUhcm9UR2pudGFeb0JyMSUybU9EPnMvZFgvPEwmPEdMLj1abTpIXm1iZj81T2Qna2EkW1trMWJGXmduQm5pXWshYkhuM01sSFpuSkspU15hVWshaz0+UmE/ZSsyJVJDdT9IQF9hSDhtOTRsRF1BRDZETFRkYltuWUU/I049YlpzaDE4R1kyU0dKJnJSJiQpRkZdLFNNWz02QE5xMVc6UT1yXEoxPSRsL2xNbDQ4ZmIoSyRLXFU6PzJcVHJKXm86bytbbEVUSFlPQkY5aEhmTU8ySXJYKjIwTDU7O15Mcz9bcVBOOD46KTBXclYwbDhuQHRhUCkiXicyYiJOOTM/L0wlQktQPC0wTi5zO0ZzUnQhbCtJbzk8aVRoY2s6M1B1cyVibjlVZF4vXD4kLG5wcDYnIiJCYVxsI1ctVWJdLDpcK0dsdDJdZ1YjaXNRQ0RJPGoicz9AMXQ4MyQhPkVhVkAvUDpRZ0FAU1BRaS09YFlKZFtRWD9bIzdwY0NuJkU4Wz5QNipiW2lGLzpsQ1hcYjMzaE1IaztMTnBEMiktQGFhRDAzJ2gvWHFXL1UnRE9dLD9aQl85ZFA+RTQtRXJxTSU3VDcjXVg6I2Y9XjJFdGUqU2I7bjVWKVFYO05CSGdrWUVzWl9raV9pUC9PLVE8YGUxbSgqbllWVVhxMHNWcEBhLSpjMGVMNSpxS15UYkdzJkIkQFNeRWU9WCZPWjtORiMkUStOInJUOStiYS4/RlRrQC1tLSdXRE1hcVpTaF9xJSdvUHJxdTc5MnVbbk9RYUpEWCxnQGQ+UGlJRzhQVVpVNFlNQWQzTTIxZm5dUGRgU2ZEYlRdaCQ4RERsSV5sLV4+LUwhVjJhKUxdMy5rT1VoJ18qQ1E2LmVsOylLTEptJU42JW1LUV5JPyxFS3BwanMvQixbJ19qMitiL0RJNUVlcHRqJVVnJjpQNURhJUQ2NzBSXDpSbm1POVc5IkwjZmA5RGpVMzVmN1w6Skk3IVgzR0ItKC8+N2pPPi1GSTMxVldCRF1cIVFWPjZHP2UtWDY4WyksUUtDVlVlX2FjWThITFp1bT0rJVEqbUdBSDFeTl0jOjQxREJGWmg6b0UqYVxsdV1hcWpKXnNbdG5UZSErLCwnPihbQVUwaVozN3EvWmorVlZfKklWbmFbXT5KVj9AQDRxNGVNMUZyViVOSXI6WXNoJWxJN3RgbCVkOGRxQSNwXTdvNEA2LC06YzooLG1cMGRgZSsvPGZbWm9MZy1BM08vPis1OUc6MmQuWjUnXjo0amY5VjklQ2tDO3M0biokZkZybmtIVWhnSypjOkA7TVxSZC9DNT1oVDMzY1tqb3VJXm8oNEpZJ0hHMzEuZ3Q5WzkqMjxeXXBZLmElXFVWUSFvQ1xjOURTcnA5KFlETDE1Ui0sX1VGQFxndFA6KjMjX2VaOUQpV2o2WmFiV2tPLG8/M11WKypkREJfcVMzNEkvaW4tNDdEInNycV43Sz5OcWZWSnFrbVA5b0MtKDoqZlUsPCpwPj1XWE90a24lLWsyUmc8dHNnX3RuZDo1TlBbIlE6LC0zdFJKdS5iPFAhLSd1bmExLD0sdVotbHUtcCNqTnNRbzsxcFpvITxUTDw7bDBBSmVGJltFOSRmI0UjcTJRO11BaWpbLmw4JitzOS1QUEdTJjFxSiVGPGltQT9rPEhEaXFYV0hOWiJxZGxdamdlaGt1L3JFOTsxWUo6M1gvW1BaNDFQPEFEa2NPSycmLDBnRzIwO1ZbLjZtVzY6V0BYSDJpcitgb2BDdGU1RT0qaDg8Y0w8KWFpczVrMTojalkhJSovJ1sjSWIxQ2J1dG1ATGFsOSFrJWFsZzpdS2UiZDc2Q1ZwV3NgUltzWVhhZDFdJEEzNSJfWltwSGdaQ11ITERcXE1WXk5fKHNWVDZmcWFsXSxnaEdATD0jXkRwQVFWaVU6MF1QWW9hYkJvKk5VTT0pKUtCamJHRUNzTTMqQyYtbjEkSXVKPEQyUHA/ZXRERlh0PkcmXlVSdCkqLjQqWVJLTEZcM2MnQENYN191ajokdEM7XjNuK2RTU1B1IlsvT3VuZ2oiKTRSUXAvUm4oP1U+TnVgT2ByaFtNaStJWkppakk0Ikc3JzhVIUY+STFTOF0yUG9qRU8sUFopO0tvWjAwZGxPNUpFTygxOkBYPG9tO1loIU1sT25qRGthSGlFX0NRYEVfNUs6Yz47cmxIP1IhSDJXSmBqZy4lOWZtQ1pOXDptRzNQPj1BXkUpMFFCX3NJNmhEV1I8KGw/S2MpSmtWXV0iTUQzITBbZXJQMj4pdV1gLGQ6aipQLVprT2dEbyxCWEsxOU5tTWVqJSEwRmdcLzgiNSEvOEc/YmErbWRXbEcocHM7KDAhZi5HZkFaQzhURlAlZUk7OyM6UmkxJ08rPlpVUy4lSWAhQ2czYDlQSWJDSDAzREU1aC9vNTVscTFOOWUuWi9QREI6MFgkWnJcPGBxV05yZDUxdEczPSduKWJhbzdxJGhLbkw5WDJaVW5fXi0xMi4nTmRvXyhNc25tVWZSPGM2XCwzcjspX1MrNWNWQVRqSmt0SUYiaCdKLC9aJC5xXTpNPiokZSojajpSdHBNR0txOmtzViNXQmxGN2ZrYiZxckZLbW1nUXA2dGApIVQlSixjWSRULGgwXGlvIzY3NVBFLzc0NGNaRXBVI11uQlJJKVhOZCUoJVEnTzN0LEpfdTYuUCEmUTRGUjdkMnJGVDRsVSsjYV1VJFNBRmg9QVoqJ1lTXEU2PjB0bDlISEZbcSJnIVNbXCE2Q1xiaF1VMixXKGM9R0kvO1FgQz9Yb3VpPERTRyc6UzdAJ0JuX0pdam9UPFgxZWZOXm1zNy0kdSpubW1gcTU4LF5WMDVTUFVQPmg6J2sxZlNVMlU0cjlKYD1TVUk5JDJVO1pkOFtyWzhhPEgrYTVRYTpYU2U7bERbVWhEZmNESD0jZmJxN0tPQj9zZDtGNy8kY0Q6JWknNiNGRTxvVUVnOzRtWG1SSyxBSnVCaC9SOVtJVF5NTkxLW2pIdGdNLkhRQmslLiMjV3Q9VTlgIzkxSWZma05WWFlEQD1XV1dVLD1Ja1pCLj9kIkBOPTwkLFRKKVhsOz5ATG9WZTBmKjVfSGs/dUxoNjMycGZhYiVYOSJqIkFjbmRGOEgxa2c0Jy5AYSRbIzQ2NWFybGVBQkdJPVVjNEhOX2dpLUU3ZkZEQ29OLl9naSQoInBoL2hgXCwvJSxncCVdUiVUYVU4I0M6S3AiVEFQR3BOKkY6MkQyRzZKKVA2PG1VUmFUOGJjY0FAaStuKzBfaipBQTNUV0RWME1nQ2xcMTBVOTNvLFhpbGFpcGNAailSRm5mYWMyXj8oMG04QypmYm8xTz4tUDc+PFZmWzFIJXNSRWFbbFA4QTlrVD47JF0vK15FUmszdC9ObF5dJFRtMTtLOyUmWUZIMnNuLDZONFBxcVEvMylFMFpnMjsyKD4jb04wTU85JV4vcWk+LGIuX1NTU1hZTVdPJVFYMFExWlZbYkNgNG1gSGFAWUdFKUZ0JywxKGFnPmokcyUkNW9vMyJQXE1oSVduRm9xLTdIW0xdO204PyY9Zk4yKiNIQE1DYSlyO0BMRkZOMz4+QjMxaFFnTyQ7cG9ca2YhPnNcXypzcltBVE9SUDQwOUA5RCxaJV4/RDVobjcvSlQvXFlIIShdSiVAJlM2NSxlPFEzMkAwOnRUb0JpV2hoVUJERXVtQmZjUlhCSGc7Yy9iJElmaTskT1k2VThoZTtGP2diQCsmMVpQaVs4Sz0nXTw4KFVNaGpSIzk3MTZYL1FiQEVjM04iL2k4JUAwQGM3UWAydTItJGdBalBIXWQ5NyQvSDhqY1BoMThSI0xWcT9fMm4/bCx1YjZiYXIsT0spJzVHQGltVUdJaElaR3BsaVxuM0BiTmAwcS5xSXBUaWAqJmptZ2txaXNVNnJsKzpKdTJLTTZrYyJdN3BycVFdT05ycU07LiVCZGYwPENJZWpBIzAxPSUpLjBbRzBQXkBrSzpuTi1rZkUlWkFEcyItUnBsTGRPPGs8Tz8tNWJoOi01T1QxKz0uUENkO1RPSUdBaU9MSENwZlBfJnUrYDdlRkFVIzc5LytPPnQnQCc+WWgqL2tCQDpyZUMwU0FGRydNdC9paWxRKUJPRHQyOFQxWnIzKTM1bGU1JmE6R0g3Sl8jWFZOcUlQRSoyWyReJXUhWVQ7OSRyKl8lLXBdN1EyR1ljPkNxbS5vKlg6RU9gV11ONk1ORyw4MC9XblAuLEVKUCkjZlIrM1kjOjhfai5GR0A5QG5lXyteWEE8IUdONytScFZNSjExVCZFJDFic0pTPXRxYmVFLygiQ291SzQ4PmRzKi1MME1HMTAmdSFnMSNIU3VpLzdgNGJwRyZpblRdcEFQVSwiU2VKXkVSOGcnQUpDSW51JEBDMzlEL3JgZk46KVhVOyZvcElMO15nVWZOVCRvKSFtSyZFRVhvdEpSJFknRUdjcF5LJmc+UU0tLkJeJ0AicWEmMlYhcXIiSy4lNmgxUVtScC0+UD5qOChUZi85bScqIWYnITJsZ0EuUlledXEhaidiKVxKZjhwXyNXbi4mQDYiWTdAP0FvVFJlWVJQZmhrV3JWby9ZXmEpXDJDNlhpZ0IwTDNGST9JI0kxLyVAM3JRQ3BlXkFFP3UlMjs2VFJkalsmbjokMFc5KU8xJmwmZFc8KTomOVRCZkAySyFfQ3JNOC1faEQ8S1JENExKP0dJKjBLX2g8K1VLPiY7LFJQRzh1TzQnJiw5J2tdbXU6bTxBQU5xTSFQMTQwZzxLWFZrMTJvKkdUKyk2VG5SVT89IT10UFlgcnNGVG8xcWlRSSJXREhmbFdFZ0xNZ2VOPmhwNCxcXWQ7dXBcW1lDYU1iOkBIQT5JNiJeIkAhKkxJKGtTJWQvPCJSck1WPF87V0UlXCFmV0tmWiZEWWYqOFBqX1lUY2tpY3JiYmpLYVwlRU9caGksTDdbXUs/I0BSIzJpYWBjczpiPDlvXGE2XUY6OmYqJihkQCE+Rk5BJyFMWEFRMVAxWUIoWVc0OkJLb2JASC5DbTJkKkZjcyVWWzZHIzkrRV8/YSU3YUUtaHIsWkgwdUFPXm9VdSlkdS1GOlVYbGJMK1g/aERlPUJXVDlaZzImXitSLCM1KSlOZU0tbSMjXyRROyJJRkwkTShLaWtoQTIqYUkzMnJNLjZYRllAIkwoVydEWyJPJE5OaE1rOSw3JlMhXGZhNnJGKk8lL29NXi9TKz1bPzh1RGlOYWxfKVRXcyVFUTo+amBNYShFViJFN05CT3MnVlBPWV8mJitRWEdNOklERGxVVVdOUjFETUgmQEgqVVFvZVZjZENrVmluKjMiPGQlVi1QWTQqIkoza11YakBNRjorZDwzKkBbP00qXG8/cFldZGNLM2R0KDQvZmJXZWI3Ml0/RkJAIzkoMjhGKTA6UzFjWlNSUCk8Ql5URC1aLllPKm1PZiZVdCUpNlF0W1FSUTBmLTlJSzp0V29NJVwjUj1JXz1ERj5DMVVjLlhHWjgjZElqZ10kJkc5I0xkYDRlLTsuNUNmWE08MSZlRWA9REE1UkA4MCRyPSsxKEJIbk07b1FKZkhTPk82cFZYTV02LClSVTU1OUBCMXNMOTk6QWdKZyJXQU5VbzJxI0tNPSYlJDUoWF4lXCUoUlEmLys7O2xhODcmKWpHLURCODY5LCpTOyVWdWBUQFsyKGJjLjcnY3QobiNPTkY7WzFRayhRMWo2PmZQQCJqKlRpI0BNaW0uQURIaC00P11AQCFHMHVFaUJ1b1s4TXRtXGBnaVluY0JxU1BUWDhUOGpwaihWbyVbVk9tTWVALCYhRVlDa0JnNyJzaypIY2RZK3VVUD0zSE4+LjdXRVpkZDJdUDJfUG8wXU4xJV05S0hlazZEcTg5MCNKU2pRMGI1X0lTSC0hcUVTOExUXS04ISNyTWEoMk4hKig0WmJUNiZBci0wdDFnKGBeNnVXby8yYkM/ZV1oKFhQIllWWmxeRyIqK20uWCE+P0xaaktxQjZTNUY4PXFbPzo8JTxhaEtARkYxL3RRNWFfViVFK1NPPDtzbCJPalhfLl1bQmQ4ZjdFNyYyQTw1JWtUVS01PjZbVmlsKj8zM0QzMk5MVVshSjhRMSlZVDIwKVZwQ2hzRDllWkZXUksjJ1wzO0xkREkyaTcoI3VAQkxNRDc5NEpbXTY9cVUqaDxQTW80SEFuTDUsTC5kdUhGJU1jckMuaV00dUJIPW9tPz9VZkpoX2xmSWNqVSRJbTM3OXJIbmNYK1IwR2s6VGpsQSk3cmNfKGpmJGloQl40ZGVgXEQybT06TSlBJ2ombVxJVjE3WF1fKWA5NClLRFA4c1lDcFM1RkwqZHQ6aj9YL11SMjBJMVMiTV9NZWxOU1VtcFQlMiloS0giNSteW0lKZEZtXTtvLzVBVXErPDBNOnNvSDU3bjhOR1UwOTFaMzUzXm4xUm1QSDo2MWctVWo0L2krY0hnMjReMTMyLXFHbGppITg6LDZfL05XTUNPRyEwUy9eQlxYKGNxWTQiTiolSiQhJWpVUWBlXTdoMFtic1VhJExwMWtRYyI+T1wjWDQhNjBuUnFYLCdcS1U4LkM3OW4wKWdbRWE6QTRyLyo6IUU1QV9AdGJncSlcSVFQNENscUlmdF9ZaFpGaFJOalRxZUppaD9WLD1qbyNOVW4yZFBWKDVlTyI0bDViPC9UPVQ8REk8JickIms5OGVSZVwjcE41VSJbJmRyXEZVN2ptRHAqL1kxIlZGIWpgclBJWUpubWRwQUc5UVNgUGksQiM0cFJDWjJRKC5mblZvUmIuQilQJFw+PCI5aSwkUVF0KDRBL28+WVgkRGY5SnA3OXBtVnI7MHFUOy08REhfIU4jT05VLklrPzUkT1xuZmQhSU5lY0JiblNCczNabCluQSdaTUlbLV5lU1gwSSRwVVsiaS1dOy1TLTk5aUI/W0BkJU1wJ0lLcT0kIkcvVmJnSToiQ2VbJzQiPVx1a1AtPVcxMzpESHU/Q2BLRCspYyFsYDpsaVohKywzc2Z0YUInJytPRUsvbyRlN2BIbkNaNkU5OXRUNFMpb25SM1MhTy9vUnEmQFg8KlVwUlBZcyIiV1pdL08qdD5SVUkqUClOQHRvcycldT1cU1g4L0VxVmZvTlFNUWxFLWo1Pm4qLWwoblZqLmNaY21rYko7VypbbVA8SkNhVydyLUVCbmheXGpGNi90N0AuP286Rmg9TGFBSWxiTEVtVkpKLyJfdCVBVUEqX1M/VyUvTiQ3Xy5TW0M3UTohJkgpalNtXWFmIVhFa248ZDw3QlwqJSNHKzVcX01VTU9XNitTSDJeYSZxNS1hR1dUYD86aWg6JilCKjxrWE1PQUAtTkprW3BnYGtjPyRTUjNnJCsvRF5aJC0mQiEoUzBRNUszNThZZ2dJZC5bYCJxJ1A/X1FmUG5pPDROJS8sXytHTWlyJj9ldHI3PT48W087Jy5LJy1FIk5DNTMuUUs7QyNvTFE6dTIjVFgmdCddcmRfJE5mU05GOlg5ITZvQ01cVD5cdUgqbE5WZjUyYGxIJy5bbzdULiIxQDteJDFuJl9uVCkxa2c3aTprJz9sLD43YCI7LF8xPGIiUzw+JkE9TUlSYyUmNDFNUk9qInFkSTI3dHVPdCFCKG00b1BCXkdYI1xzbyRSLHQuVG4sKyFpRSFqOGI7ZjBaPkwuVydOKFw/TDQlNnNsRS4rYXQhSy5AXTFdMiE5bEhEOFQ/K3NqaGdyb1E2TCdpUWFmQy5JUldgY0E/ZVZbNSxrW0JOUUo+bFBEZTFlYD4ibFAsIzVaYmRwWlU6cjc3O2ZCYyhtbSk9ZF5dYCQ6UzJeXW5EbjtuLzYrNm42Uz07Zlg7VHMtKGdqLXUmSlkvVz0xSTQlPlM7Ij8iOj0ybCJAX0RlMFlDbXEmQTlHREVqYSFSPyVzJURXcUQxRydtM1c1LjJeI0w4RyJWcUxuQTkyVShhZE5WT18jcDFwQSRvMmRxO19maSkzRzFhKTk1Pzc0WyQ6MGFMOzoocG4kTTFuWUA9ZGhnX1ZVVFYtVnRQOV9SXSk9Ui9mTl5VZ2BmXTEtOmRjYDFBSDsqSG5SWnU9WV86K2BKPmBjZERVM2leYiUlJThLSl1oS2JoND9Pcz9cOl9wK3FZP2ArTlJUVWlaYDQyVF5dOGFZIWI3Ym5bWjtVN1w3OkZILl1LN1tEVk1AMkJxI1ltPnI6UVQpdGJTKS5iRV8wIjYiWTxhYSZAZlA4VGEkPHAjUXBQI1cyXT03Wz83LFkzbllxP2ooc2YzSkVRXSRPdGs2L0UkT2Z1b3FvXTojZT5eQWo5QTZcNFE+O0JMUVAuKSYrbWYzbEBSX0ZBZ0plVU9pSjc6Y0NsSFdaM1kvYy1ZZjIsbEVUR283NWJoLztbLkR1aUNYdVZDckNbaEhMc1UzT0hKUypobTFmWjhSOVw6Qkk/Rk1dQVFeUzkyNCxuKWJbQz5SUmcxSmFFTVxCREUpNDVfTWY1aGpHZ0s1aEMxYUlsNSVvdDhbQHAiQXVlXEBndW9dSzJKKSJjWl9mPUczRyYzZmlSc1BVVk1sOHFxc3JSXERMRyVgbDw1byFiQl4hJHBsMyFjcy5uQWk4R0NiPXBXL1N1RXUvLCpqamdeIj9kVF0xZSVKUkMlXi5yMyk2PGwuTkxCblgrcFt0ZDdPX3RPMSMscXVaMV0zVCUzLzklN2pRbTAzNElNWVBmX20zTTdEW2sodE5bOlZAOXFPLmY6aCIqLHFidXFwYCRMQUouSzYia0EvLlh0R2g1OFdZLy8+R1ZOcWhKK2wpTURANFVFaGpuPytuOCtSLlNwWS1YLCU1YlAoamclSmldWUxqXkdKNyg+MDpPLjg1R1tKXSczclZKWWc/VjVFbSxVVWQiYydKRlBjNCY0UEsmNmBdWj1DOiMkTHBocyIsRW5qPmxvN1goLWwlIjgmbS8jXldVUVJnNWFQQkRlYWhiJVQ7L2NRM2RKLTE3cEIlQkptMSZkIkAtQGdBSF49QDUka2BJVXE7bW0sPC9OSGQzZmBybFxkcUQva10oNCMzSmBpajQyO1pDWj5VOF5dY11kOGAzNUYkNDQ6PnJFK3BKKFtxdF9RLT4+cCs6WSpqIj9OQitkWyk9UiJqJmNgcitdciQrWkxwazVuQ0QoRUNZS3NCPUNDYkpHP1MjR1JxXU9RQ21lP1VTL0AiI1FlNltmUUBRVF5nclhTbkVqdWEzZFRPPFlYLCdQKV1hNzEuTGouLCsmaSMlL2BKb0hcRGNLWDxsJFpuS1dAR2QtYXRSNVUjZ2pLJHU6Ty8mVnFiRD9VLFotRGFbZ1kiMFlOQ1dYVlxnXlo6UiozTz5TOT0+SzMiV3UjJl9qMixUNz1hOVRTbzlNIyFcUzArRzNMOjdOVDg/b08qWjAlI11vakNWTDwjZC9kNFRCIT5aOTMpQS5VL1VBb3NaT2I7ZHFLODJJYUQlck81XUx0Wlk+M0FVNSU5LW4hOWcrPEdoSlZoPzNZZkEnUEVSNlkxK15rP20zcTApImhFTDEjNXQ7MnUzRm1fYVZNXyVPOU1Da1JqX2UlSjVcYWhuMHRRSyUoRSlfWVQuJTJYKVxUVGNIOGNMVDZqKidRLE8kbk4iYypxVHErXjhcakdCWHRvWmNNU0Jqb0RITyo2O0k/MEpNXEZPPS9WWUZddU1nMm1FZmVCSzVIYUJiVjZWRjwhXCxgcD8+JjFWaHMvITRQJVRYRjg2WjlDREhhTD0+N1o0cEo2Xy1pdTNvRisiRC87S0ohOmJYKkliT1ZWKTFFSkQtaGU6J0VbPDwkMl9yUmNMMj08X0NgTiVzbkpANVIoJ1lsYEkoRGlqJ1FUWUFKJVVUUClLLkxjcShkc3MmZEZnVG1fcmYmcTs1NTkpV0EuYTpKJ2lyKDhKY1YvUmMnaTY8R0QiZSxzN1g7Y20zLXFcOXI3ayciQldKWzNDdFQ2SF4pMDpebUU3K0ZyRGVFT2RCZEBHM3BrTElSIiZRXUBtJjtNSl43W0lTcyZTJ3VjbWdxNDcmK1cvRl9kY2pWImdVW0UnQWcjajRZIlxDOXEiPThUM04icktlVDVtOV9QaCdEYUoocFQ2T2dkN0dwPDUqRmMzMiYwXzBnMCRbTnFfVihQVGI8TytbMz1jLVQmImYhN1kiVW02NSRMJUpALGMjJypQYVErYWtEKE0oLV0pOj1LPCVwazNeYXFlSjhtVWtEVzs/J2g4IyJGLDJmQVI1LVNFQSVRJmVdZEs3Y2EuOFkodC5YRHIyTFQqbGYwcTtDc249VToySCZUZzIybEdtYyJmNSJlZjFeWEY8b0Ylbi1YTjNfYTxpUCMvdEguP2FKLDpBXFgvSS5OLGRbTD11N3Q2ZFgpcGJGQ3AsZzRXMTJgK05LOWIuOSVyTVFTZF1GV15qMTNhOUgnLi0jP11wN24hbDAzYCpZTFB1Yy4rb11eLEVpJVgnImpNP0wzKS88S1YrMlIrXD9mYGklV0gwVFsldW9eQD5PSjY9anBdLCtyMW1JJl5rPWBRO1lPOVNsXF88OGZISUQhMF0vaGIrbGw7LTljIWRzL1NVPWlmI0ZNMCNNSXIuKVpXJjZeVjlyZFkwXmJwXm11I2gwZlgsdFxFTUMkUWxhM1Elbyk0WGEzcGpJYU9FX09JU1dNYjhAUDQ3bi5PWkslJE0mOVZoRCEqbXRxYipvWExxayU7NFhHT2ZAKUlRM0RPcWoqM1BWWiVgUylwSFkmRnMhcSdhUD9QSDs/X1BlO0U8aGg0bmBYQEsjOj9fZmc4LTBZcCdtWXUjST5cQGszOEVKRUZDWjQ7cklxS1JyIWomcCNfUU9WcChROi8hSUFVPWhETDFJNiI+VUEoRmJnYzw1OytZMkxvQSw+UE1FJnVvcUQmI1Y2RF1jXkVARGhPV2UnV21KJzRsL0xjOT8vXHFbNS5aPHIlLS5CTidiZXVaVVBPai5dUkJUNU4oRnBNdWBsLFVCX1lHI19rQTVJRFg1Ul1tOkptLEB1dFwiVW9RKCw+YUJaJ1snSVRpVlUsJy5WZGcwRDNlakkrMzwjRk9OQm8oXFI3ZXIsKCVJR3FVMjNhQCVvW10ocjsyVlJsOTQwOFI4WlVUc0oucFxFVkNBSTcyWSY2dVhyPWovM250YTBdNSIqQicnb2wtdUNkWC5ELXUtZSIiI2IvOThyQyFla0k8WVE9YmZOa1VKLUtHRDA5aURTZCg+Ty46WiUsPUZHbSMlQilEL2wiWD1lK0kpVkojUGc6Iy0nO190bXAtYFdHJFA0SyEhLDdjR0VSdG9DLS86ZWBoYV5OYmYvaiFkPTdVL0xcTjlyPy1EX1xFL1VXSHJubEFkJ2JkbVAkamNvW009V1NdT2BUZT9fR19OdU1LKjY3OGotIWBpKWkiZjUjRl0jWjJgQThuIyJxczYyIV1OWTBaWDNxckNBMXUsaF4kKCQjJ0J0KWJELEpCJiFJZUpLUHJRYEsqX2JHX29Maj1AJWdkMSpGNTNgRCpbOyknJEFVLSpjciE0SmtSSztNT2tTIihTIzNzKUsoXmJwN1VRPlZaajRYXk9AWCNwdDVjX1EnM15jbGo+PFQzUDFgZFg1KXI6QXV1XUMrLEw+O2VqdSQ1L2NcOCI2azk2NWshQVQpMEJWZCEkaV50c1wtVF5gbldENmU+X0pbYW9fYVkkN0YpbGJGSzNbUXI7M1VOM1ZFPDBSXl5cZ0AkR1o9Zy1pPTk5PTAvSVNubz1vTVBkckJfL0s6NWRCZVNJWChbN0pIU3FxZzBlciotb1R1SHE7LzxrYzhccnM+MTRXdCxYNGRHNXE6RjNfTV9ianIpbjBMXDxUTFNwZWdkKGxTZzJXLCc5XmFDVS5MRm5VUz5kZS5MQW49OGY2SD8zcU1GQTZrPl5pKlAoMTNAXidSa0gubDwyWTMsU0U7W2ApdVxcPC5kOk1LYVksNyRGOU09ZVlCWmcyUlhcZlU1QkJWJHFWTi8tR2slcEZhMGBbKl5pP1YvLnAwWSc0OClbNiRtWmxNWS9xbCNicjIjdFtmYmpmYTJqKTF1PDZCUSsvXzxpZiRLXFAvXjwoPjE+UzxCRVlQXC9xV1pHRyNKUUZVQ0I0NVYrOEtTcDRlIjMyIm9cYDNMQGddKEJoSVZaWzpFMTcsUV8vSjZraV0oIjFxPixAP0w9aiZyZ1ZOODZgMTdXZTEjKypsPmpyW2xOXT48IScqTjIpVk9dNjRNcj9RS2orPzEoRVB1ayJcNTctKyhaTmBqT2MvMFYxI21sQ15pQDs0WTUjYGlHLTpSIj9iWEt1UyFcMzNEcjxWNzMqMEAoXDokYFlgR2g8NkVQWlNPMzh1byFJInVaVm5Wc1EpN21FWEdLWWZbPDt0dDdoRyZHW0dFL1daamE4YTs8aT4wPF9MMEdXNkFdL1BHaT4wPF9OZixaJVxBYEVGaT4wSSYpKTlvVVxBYEVGai5fSkxEREJwVVxBYEdiN0xaYUNEREJyK1wwclNWPjdAdFhESy9wR0VTYlpYPTNoZko7QD5NQk5FPjlOWnVhWF1naStjNT4qUzMxO3Q1IyxpbmoydUkqV1QtMm9UJzVqRGosWnAkW1VoUkhOYyFqMisjKkVWcUpMcyc5VUBMNCZtUGJVblFSJShBM0YmMkI9K3ArTTpEYEdnYW8oPDZxR14rNl5hWk86dTtwXEJQUStUR29nL1ZbSTxbbEFpQEVNOz1hNUEjI3AlV081WUBec0FoIzddQClTNiUrZm1CI2lLX3NPT1FxXEU9PiUoQCdrRVZxTSMsL2BmO29CZjVpYEdnYW8oPDZxSi05MGVwQD05JzMvVltJTEVMW2UhZ3FGZmFjNC5IKERJNEo/Z3VBKWY3MT9YQkREQnIrXDByU1Y+N0B0WERLL3BHJl02MlQ+N0B1IzAkOSIvKDtoX1k+OSJHamAsTFhuKDtoX2FNX1xiT2BHZ2FvKDw4aV0xIy02SmBHZ2FxVTVcXHU+UTQhWiVINWxpZk5KJUQqVV1eJkhFa1VuSGlwWHJvN2JycFNjOSdtVlszbU8zOSdfIW5jJlY/NSg1Nn4+ZW5kc3RyZWFtCmVuZG9iagoxMSAwIG9iago8PAovQmFzZUZvbnQgL0NvdXJpZXIgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0Y2IC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMTIgMCBvYmoKPDwKL0Jhc2VGb250IC9TeW1ib2wgL05hbWUgL0Y3IC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMTMgMCBvYmoKPDwKL0NvbnRlbnRzIDI0IDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgMjIgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0gL1hPYmplY3QgPDwKL0Zvcm1Yb2IuMWRhNTljNjgxZTdjMWJiNmM5MDRjMWQzYzNjMmYyN2UgMTAgMCBSCj4+Cj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iagoxNCAwIG9iago8PAovQ29udGVudHMgMjUgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCAyMiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXSAvWE9iamVjdCA8PAovRm9ybVhvYi4xZGE1OWM2ODFlN2MxYmI2YzkwNGMxZDNjM2MyZjI3ZSAxMCAwIFIKPj4KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjE1IDAgb2JqCjw8Ci9Db250ZW50cyAyNiAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDIyIDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdIC9YT2JqZWN0IDw8Ci9Gb3JtWG9iLjFkYTU5YzY4MWU3YzFiYjZjOTA0YzFkM2MzYzJmMjdlIDEwIDAgUgo+Pgo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKMTYgMCBvYmoKPDwKL0Jhc2VGb250IC9Db3VyaWVyLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0Y4IC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMTcgMCBvYmoKPDwKL0NvbnRlbnRzIDI3IDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgMjIgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0gL1hPYmplY3QgPDwKL0Zvcm1Yb2IuMWRhNTljNjgxZTdjMWJiNmM5MDRjMWQzYzNjMmYyN2UgMTAgMCBSCj4+Cj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iagoxOCAwIG9iago8PAovQ29udGVudHMgMjggMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCAyMiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXSAvWE9iamVjdCA8PAovRm9ybVhvYi4xZGE1OWM2ODFlN2MxYmI2YzkwNGMxZDNjM2MyZjI3ZSAxMCAwIFIKPj4KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjE5IDAgb2JqCjw8Ci9Db250ZW50cyAyOSAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDIyIDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdIC9YT2JqZWN0IDw8Ci9Gb3JtWG9iLjFkYTU5YzY4MWU3YzFiYjZjOTA0YzFkM2MzYzJmMjdlIDEwIDAgUgo+Pgo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKMjAgMCBvYmoKPDwKL1BhZ2VNb2RlIC9Vc2VOb25lIC9QYWdlcyAyMiAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjIxIDAgb2JqCjw8Ci9BdXRob3IgKEFHQVBBWSkgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDYwNjIyMDk0NyswMCcwMCcpIC9DcmVhdG9yIChcKHVuc3BlY2lmaWVkXCkpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDYwNjIyMDk0NyswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0IChQYXJpc2ggT25ib2FyZGluZyBcMjA0IFN0cmlwZSBDb25uZWN0KSAvVGl0bGUgKEFHQVBBWSBTdHJpcGUgQ29ubmVjdCBTZXR1cCBHdWlkZSkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iagoyMiAwIG9iago8PAovQ291bnQgNyAvS2lkcyBbIDkgMCBSIDEzIDAgUiAxNCAwIFIgMTUgMCBSIDE3IDAgUiAxOCAwIFIgMTkgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iagoyMyAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxODkxCj4+CnN0cmVhbQpHYXUwQz9XNV09JjpgJChmWEZNI2BPMDVaW2JpXE85JS40QUtsbGBEX2kqTSZZdEptOj5DZ2dlcmA2SmgoZGQiM1FOQEkzWF1FM21lYyRsUWlcLjpGaXNhamohcS8+ZCs7Py9EK08iN0ozSlopKmksN0pfZUZSQVdOWjZ1cCIsRC1gI0UkSkNZTGtpaiJWSEdUX1lidSxCLS1SRTRAVVFNJ1NoP3JjUTUkI2MlZ3RUQUkoV2BALFB1K0tFI1pIUCkuJCspM1RBbEJcQlxXR21XKClQZ0dNUiZjX2NqNiw4byFuYlE8ImU8ZEZnaSl0XG1MR1IrUkA8Oj1jNj1hZF1qN0FBXV5dNjMnakduMEYoY1lyNjdiZkFOYDxoU0YqZV41TEhdbT8tcVghdTJJZmtsVjBBSj5kJi4+YFVPLGQ+RSEsYTFxISJ1aElXa1oiOk80V1ZvX3Q0Tm4kXz01YXE/XDcsK3RbcGVuZTEpYkddPWZEakxuIU5dSlxEazc1cUw6MG9jc24/JiwuXTRlW3NmSzkrL1ZLWSU5SERGS0FfJytXbEs8KDZNQVJRPyQpUC5FYiZQWEllVyJIYjQxTiZjYTMuNDt0QWlDKVlMPkdzYVdbbyRwdWB1WDpdZFUoZU1uQDxyW2lxcChJXXNtR1RwOmJDLGI4U2diOjlgR0w4L20uZW0wRWloLmYtKksvO11hSC8xc1YuMGAzXTspSUl1R2JEWUUoZEZIQTZpWEYsSE5ERTxNOCY2UTRsNW0rYkBuU0IoOHBwQElSckpPKmdyUD5QUWJYUWViPkVmYSskSytcJl1mZWckWEFfbD1tYnFxSV8tRzYkUSxJLFhqX1h1ZjMva2xjSlRrcjhMOVtiTW4raVNgKi5xMz8pL3RXKyZuaVQ9RHBWJW5JUS5WQVR1czlmKFNsLlhrcCMzLXFrUnFBKVxWclxIQVYvRHBoZjZrcC9obj1LS3U+S0VuY3AvYEJSLyRXbV1EUDY+dSpXOl8+OCZhVCdxPDRaL2xkRm1hLGtXPiRwQmMzXD8zYFMxckhqNFNtRGdTV0FLOD0kRmM4Q2ovPihaTzArI1MzWWw5bzwsKmIoOEw8JWNUPWRvQHNKSFpQN2pRWUEnXE9qNWg9RWhUZjhrKmFAbDsqJEMmLGNoPWZiSF83JkRJai1BKCgwXmpjJU1EKzdnLURzUFosZT9CdGkwKEZQPTNzWHFRJlVtalVAZz9bLkdWXnBsMGFmS01gUiQ3PHRWQURoRVslLDg/al5FMUJXLTQuVEtIRFtWdColNV5CQEAka2tnWkRvZF9HKi1VOT5XKlw3dVxgJXM4RmpEXyJaI2pKIjMuS2BUY1dEW0RrISxUM0k+MVwydTBEb0skIj9fS1VEcTdnWm9aU29tKi5KPUdMY3IuT1VeYydzXzFeRlY8bDVYdC9XbCs/SkxcWF5jLi9FJkVpL18tVUk/cCdYYDo/UT1CLl4tTmZCMl9yVG5jLE1hK19ma3E3PU8hO0lbXFU1IUw3SWVZMTElP1tRZHVsXU1iW1hISk0sUCcsZlxyUEtnVz9DP3UxJFQsKldAYGU4PkZTUWhLL0NmWHJSXk9vT1xFcXVrMTQ6Y0k5VkhQJDsvJ2tQKix0XV1bZEs/TXRoTDI5aEFXXldoT1tqK2dZLUZkXTpUQz5BUitCMW9IXjVsUyhPJDd0NkMlJ1gzcGxraFs+XzFdbFwoa2xwTG0hV1I3TllMZUNVRl5BPCM6Pyg1c2A/PyplWkFNdHQiXG1PRmhZOzlbQmNdNT0uLENcMjxsJWs+Vzg+bG4zMyVIMz47LTpyXixjXTxXRTlRRERHPVgzPj0tcCJMLUguMlM2W2R1NXEyLz10TD1lImoibHNqKShnVU9XJiFIISNfZz9yRWpcJUIvV105S184UGRTK0JbJjExdEMhWDtTWWxkNlAjZ190RkhaJiMyVipGL0NxR09SQyFTXmNEZ2VRYlM+SWV1X2xGOEVnRmwwZk4oI2hGSVBSUzxjaDpcaGk4UXRqSElRUFc9NCRCW3VlQChPOVhuTFQ8WF9KclBLQDhXVzpcVEpoSlZRRCxEbnUsQF9sI11EM1BXSzBDZDM6WD5BJ0lJJVpnKUlMUUQtI0tpdCtAPUE+USopZzlbc1RAYG8sPS1MTV85Jy9pK0QkTDQnaVtFImlkQFIvZCxLXyVscDNZdD8mW0BKO0pga1EtU3VXI2UjWzRWOyphcjRCWGFpMyktPDJQUCRubXRwR2VYWFwjWUNPN0dlSzFcJnVFYTEkJzNHZGdxSVtWaFdUKDFdY0E4UExYKzk0amg1Z0dtSChNYFlxdEU/Ri5nRjxTU1tUZUItWCYrLEA7KWY0ZyU8YXJSSzRGZXAzZURyKylcKE5BKCxUYXIyXjFATmlAZGZOT3NuajUrPylvU2c4SlUvUzgqWFtbc0s6P0NOKD8rKSM5QSRLQkJXYjBxSTRISiNyQjZNc2lwKmxTXDtgamU9VjNDQUpTQGkmY0BJUEIrWkRdUH4+ZW5kc3RyZWFtCmVuZG9iagoyNCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAyNzc2Cj4+CnN0cmVhbQpHYiFrdT8jU0s9J24sOEtcPCM/NDlbPHMhKzhhSzRTTic9VStQcio5MkxvLkpNTlg+dFVkQHQmaC1dJXExRTs6WC5FUi5LJFBfRSlgU2tjIm4oYCFRM0ZiZW1zMSVtTDxeYV5aZC5uRCgwJ0huOjRSYEhhcSswc2xdXk1HYUtMKk9DbnJsPkQsZlVNNC8+Lj1XUSk4bmE6L040NmM+ISFZazsrOUg4Qj5FdSRCZmNob21hLGlVa0l0RDBcOExHIjNDWjk2ZXIySU9ZRUFbb19YIV09N2pqYD4xbjB0PjEuJTcudUFZcVIxLjpQbjtySltLLTZJblU5R20ycjJRYnVzL1BMNzUjIyU/S2Veb0tOOE5IRj1pLGNMOkx0ay8wYltEWkRfKDk4Y09dRipfSl0jck4nZTNBPEhqYWNZU3JsVWwwTyIqaE8uMWc5WzJSUVUraT0yJ2hwbSRGZzk2Vlo3PSRbQ1sjb3NEViJILztiWmVUa2lPRE9yOzooKidmJyxlVSYiZW1kczRcdGQrRSE4T2MzW0FRakA8bkgqIi1bSE5rWz1KT3NFYztEX15qP0o7JkJwRS8sZjd0KlIwSlhHZkAwQlZNQXFGSzRQPnIycmM8OExWaDRZPWY6ZEIxNEAuJVI6JW9bLUlkQ0tJamBRY25adGdcUG10Ilg8U21pbFkjO0lPMVI6QjJZMUljZHQxLkI1YFo9OTZaSGhXR1dPJlsvKV5lMCFOIXM4QlphIjxCWEFJPU4sNEpbPTAiS08kXF8rJSFdUyxTcHEpZVAzMTYtLEw/XFhhazJ0ZjU6KURXYThkUFxcakBOci1pLGRuQFVIQjpSMjw7S0MhSkAmMFdGRVFdNjZnQEtfJ1FoQCM/WC5ocDBOOkgmIzczYzVUK2cxXC1bVzdXXFhTb0c9I1doc28uNEs/PTpLIyRAQWZUaGshZVViQzhxVk1rMGJmLCVmWDZbPCVHM1BBWG5gSCFxQis7O1InUU5HSS06bSFESlNEKFBqQ2dEU28/KSYodUAmTXRQUVMkSklDLjIua1lRS3JeRk9vUzNBU0c7NDdAI1JqNS1La144bzdGal90QStrJl1WKEclZj9IZSlxNSQkRlRAc0ZFJCtHdF5pJSlFJ1xocVo7Vj1rJ0xEc1p0b0tIP3JcMCZ1OCc+JjdWPWY6IjxtQ0NfZitTRU9JaFUjYz9UbmQqZjZwU2xiaV1hOUlVZzJbM2c4UDFERVlELzolRyp0cVtESiRtSyVgWGdjMCJHcCVaU1orYl5cOkhnVzZPS3JJIm4vYlNeUTo4XDUjLztccFRlPm5QZnMuSGk8LFYlRWpLXFx0N3UzdFBKOyo4WytZciRwKF1BREpebCFUbURnM1Y6bFRwOlgxaUtzOnEhJUsybHJkbWpPJ0deLGhwQ2xXMFpxREZsXS0sJ1EnbShnUCc0L2IuKG1CSD8vN3QidWc0UCJwLTJgTWsqZTYsZVtCaS1lLyVTMCM1bklYcSY4TnJHWD8tTGY6WixyRSU7dE1vYUZbVVY6Z2Y9bz1QTzJESGdJZ3BxPmFoZF5BKk07IV9xVmw6aHVJOl1pPkFrRmUzUV9nQlFaJUBKKypLR0JOI10oMnQ2RCJBa29oIWduNEhSMTgsWHBkXjNYXT9EbSpYWXJaKSg6I2dpSUAkOFkhOlZNakIoNWNbcDpCO05IJzpgWjtjKUtwJWNOSCtkSEYkUTVGb0w3UkwsY1JTZyVVKlBJJ3AtQlshbmZuZywnPT80WyE5OUlkVmopSFRRR1VGanAtTWZpa2A7amc3S04+LjwzSCdrTjwxIkYyYkdXXy9dcEZqaylAKCQtVSZXI3I+TyYsMlBdYHJoT0JxP1NkbnAma3VyZ0NZQUpDN1dANkg1Vl1iTjN1KT9taU1pITtlayRuREFzN04vUCNiUG5YaHRZbzY6LTRvakVaQE5pW2tIWERsSUkrNm9ScUVrNTsrSTRePlpRTSRORTk4QCFYLUFeMGNhOzhnVy1cY1JkWWElTyM6RnBLK1dZQTduTSoqKVs6JnBYZjdJXERhQ0JwMmM2LDVrXlUrKTxXQz8kckQyWnUiViQuaURHWmdVQEBBVFk4NFY6UTBUP15VMCJsdThFKmtwRUwkZWMraHA4MjUmQSpGU0EiaHNWbVZia0VeQmVFZSZJPS9IKipNJW5fSTQoK3FZMXFFanNjY2NKbTlMS0ZecC0lKVA4Ri5hbSM5JkdIQ3RlTkAtK0FNby1nN0hJZ3E3Lk5eNSNwT2lMakcmci4mZSw3VVB1TSNpYz9sI1VZXz5vNXE3ZEdrLz44Tzo4MDEuNlduLE80JEY4aytHP0tQS1U8YS5vPTNaUy9UYkEyIy5zL0wtNT9GQEZoTy8nZjxtTVJiJ2FmOVxTUFJiJS0rTyNZIj1LX1tKNFVpRV9MTEQocj9ZUnBiTGglLCY6dWR1PFQ6WFdadWFUJ0BgSVs+KjxlZG9DOW5zKWl0Z0JwISwwazkhWWExLmElLjdRcjlYIVVwJVdsJWtOUlNXPz4kKyVpKjNMLm5HaSloM09sZmZJM2JGYzVrVWZRPSRSMSx0VzZtWGxAPVM0TGUtL2RwVitSM2pYW0dnclRQUlxWPmA4ZF9VUyVHOU5OR2FISHEwPi47W3AsTE5GQjdeTiNdZCc1QDFJMigmJGtidUZdNz9MOmxQSScyK3NXZUcoLElcLzhMSitEQ1lgKV5hPUhlYmosNyV1K3NqU10pYi9jZWtCJDlNRipmKC83bU5mZDlHaGUyZC9AVTBnMVEvJ0IhJj09OVcrU1NtbitUPisoJVMqVVpCUGhZQFVab1VedFNcOzheYDhCQ0NFZCJpNzdAL3ExViQxLVFHUCo+bEk7ciZwYDo6QWpLLiJNcjJUaUY6Sj5SZTVKUjtpbEcuPT08LEYqXktXUXFvXilPcU5FcVElPCxLUUkmdGNcXD9PV09yJFNpSVFOPEcnblJvaGhkWVhaPllgXUZKLHU8ayouTyduP01JVCUzJ2RRSVtlU2xQc0ctWGM6ZG5ASiVaPDhIXSwoZktxZEwoXnJSNEBSQ2RjJlNyZSlfVj9AOz1Jaio/MkEraGswVGEoRmsjckEtRGM5ZztGOjRIaHVKNkRpRjBYU0okYVw4Y2RBN0pQJDRtVmJwOj0kM15zPDpKYlQpNGsjJXI3JTxdNm1tL14+YURGSV1HWkRqXlJwYWwkT1dBLDlvblllLmNPJ2ZgWCVQOUhBRUxJMlglRGZIQ211Y19cKDJlQElJQSwsKjI1NjwjP2g3S1FxMiQ+TXNeTFIzWCMhbk5bbUg2VjI/OVtwZmBzMW5UXlU1WTRTUjBmaEphKmVgQGdTKUc0M0luXy5fUGVdXGBiKFxkZDAvPilBJXFTKCNtVyhsXycvUiJWLzU8PjJfISZVYVdjJFZnJDVjQVI5VFBIMigmT0AjRVs6QjxYcEJoP1EzWjQvYik6WCRhZiRIJkZcaUQ7Y1wuWC1TXz5bUjByYiV0Ylw3ND9paWVVcUA/VUtOSWs4ImVeWjhWL0pGKG9SazNrOSM0YWNsJio/UTtWXCsnNCNvKCwoWjIlRk5YbS1GWjxxOkc2OFVPK1pjc2xZXGJVcm07aTNEUSFNODxZIzEyXFU1Wkg0X3FDZUVKMWBCU2kzJlZVb1VMRVNaW2pVQlxHTGFYKlBSc2pTXW1uWlZgJX4+ZW5kc3RyZWFtCmVuZG9iagoyNSAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAyNjI2Cj4+CnN0cmVhbQpHYiE7ZD5CZWdbJnE5I0lRb3VoUW9zUDtyJyZdbGZGaERtXDJRW3VtSGE1WUU/UlE4ZWZeUFZzUFouPi5tdFZpLmZvZzBEbTdWTDQ2I1sjRiUtQUxWSzdKQEklSjRSOSc+OiFjWCxETFtPSldCbSI7PFY/OlprW0ZNb1csKixeckU8JzlTb2BHaUk8a2VENUEvPGZgcj1BMEgpWSg+akdeJXNcayRgO0M7WTorWT5nTnRZPGA6YiloL2FYPShHSktQXlkyKkFlIyYkaFMqaGZwXUhZRzUhNGshPyZCJC1eTylgV01oQEQjdGJAQHBGaFM2UjlPK11ONW5kPTkjMWhaIWEubj1WN1FfOVQhNDlNaTVkcTc1M20uMD5eL0Y4R1pFUklJTD9UKClMM0BVSCI3TjZzNEBpUEpBKkgtRjguZURkWmlmN1tWbionMiU4O1ZEWG88TDk9Y1EzYnQzUygnQDpsWVs1X0hGWkdmZ1YhMmVTclYjKEo7PShXTkxYQSlzPElRMExEW0EzQTUybG09I29DRGUvNGMlTUdQPDNvOk4uYmwvcW45M1skM3AiPyU2XEFUPE5FdSM/IT0zVEFKWDFxJk5jJj8uZ21xWkMvK0cyX1VYPlVBb3NNKXMnJFMuX2ZLaEM/OWMtWkR1ViMydVdWOixmNXEmOyVULjA/PHI2WWJXMENFaEVzQSMmRD9CVClKRjphUWVlbF5rTyVfW1tZL29uUjVbOFxnMjo5dFE1KEpRQ1NNYUo5NENOaydfIkFENG8/IigtaFhCKT5HKm11ai9JNDpIPygsW2lyVWpXQ2RXLksxQStqci4/IipgZFAoU2g7WFtvTUA4XyFYNDFSbXIsNUFpa1lfWSFSLXRoWm9dXTFFanFpLjtWKWhVO2NOVS1ZNFdAdW9vaCdiRU0tcEtKY0o4SCZiWjtSWHNlPzFrb0k8MF5XcU0/UWI9Xk0vLTZlT0BTL1MyQ1NXU2ducis/YlEoOEUsRkIyc0cmalxaKEZBISRMI1hZS0QsP0cpTicsYm0taEhaRHBtSmM2VCxPO0lOdDdINDckZS1iJFZ0JVBjXUhiX1JbbzgudUpJISpVJ1xBP1xCMFs2N3EzcSQvLG9bJUVHOUkxbnU7VmZCJUdXRGddZl4wNUtYZjpMWyc3aURmYlY2bnE+QSwtQGtxJSFJdW0udTsoNkcnXG1Ca1hKSltWW1xeOjJOODJtSi1kU1ZuQUc4LTIiOiQ+SFRIQVpNPDRYI0ExRjNWUyNwQi8hXCwzXVA2KU5ESGM1M1BIKTlcWnUxVygpWUdoaTE+dTk+KlRaVS1hJC9pOSkwVCUrbl0iRXJPLl8iajNvVl1mUVVrQD5BUytEYkFMZDY/blpbJ2FmT0xmbD5FbzFUTHFGIXIzRDc0W0FFKzhnNSoxMidwYUZwbVUjUiNSLTUhazZXcl1hOSlNXzdPS2xqPV5AMU5WRnF1QiVqImsuXFlmREJXLi09RyJGcFdNWyVlJG5kMWREYnFXSWRuTmlPYjAvIWViLyVXcS4wJ2FmL0lmIjNeJyxLQWcnTm5FXVVETS1XQFVkXVxeYWFgdXEmK1FsVD0+Qy9XVjlBYCJgJkdBWV03M01eR1ZEVWkqTWxyRGpfPkk1LSheN2sjWktiJic/RkxmImFwInJcVGs+ZT80PGoudSpSLVgzRkhAMXV0Qks6YCxLOmZoSlg4TzVoQ2xxY2ZNMlNhaGtQXkxnLmJIJzFhOj8/WGZuMFBRXikoUmRHcDJjZmgqI3R1Z2s8alI1JSoicVlGYEY+Mm8qIUhnQTlIalhsJ2xFSSw/UG1tQ1s2Q2cjaWdNPy1zaSJEUWY5LlE9b2dBI0YnZEhdTExRZkBpUEdpJ1heWEYkPCVwdVlTIlM0VWZAN15oWDZvM08xRUtvZzQsLDFHKVZWKjZDUm1LckZfV0NHNSMoRFg3SmU9NlprbSxmWDNUKjkoUDorcykxW29DZlI0NEQvKiRlRmwoaUJtKDFTZF10MTohXXNiKUpcXmdBSWwkRTw1ZSRrImA6ISM+aFc6aEE8ZkI3J0RcYVQ6YzVPOlEyNmxbO0MkLFZhK1ZNWEtSUDojbGdfYEspI1A4QXBYRT1qJUEtPjlkdWcoVDQ2VEZRaDdNZGhqUC5EUjEubkxcMFgvQkROcU1JYkA6Rlc1KG07MGQ9TXAjOCVyaFtIRDJYOmsnalhRRVVXVGQnL3FSXF8nW0tea3ExZ2BDdTlVY2tsPCNgLidDIlxQLk0hUVkwcD9UNnBBI2ZPaEkkUC9JXiRPJy1gckxSaj8xLERQXUpQQlcxWyowckIiI0dhXkpxXmhRb2ZLI2syNFFDaU0/YUpmcEo6I15fNj0vai9CKT4+O29BJyFiJUk2J08zaDohInNVPWlEU29HWTRUajFVVyZNWDdmbzAxKWQ/SUlrNTVHVTk3dUhRVV8iajpBR0NwVWVac08rQ1FIQ24/VkciLVU3SiZLT2Y4IVRrZT5nKEMlY3Eicy01ayFDMzw1KT5OMlc5Wj49VSFJJGlUSS9cYUc+JDQnS1xwLzJgZ0pvLWsiZFMvZkxoMWkuNy9uVUtJZ0tHdWBTSkpnQ1smckZMPT1wZGlHMyNuWFY0KmIwQm5lO0tRV0MvPW0wXlBQSztCcSJwIyFebTNwKSllaEsoW1tfKDNZP2w3N1BadUJlLnRsbWVcRGdXWU5cT2g4MFRXME4jPzJRO04sUT89SzQ+U10nb2xfNyZSTD5DMHFjNDJSVkQtNic1TWlOSkFDWUgrQEVCbygpKyFDZ0phYixSTDtPRWtcbls6bFRKP3BgdDBpNlQiZkRjQ0dJI24qbEhaOVQjQGtlLDNhbDYoaHVkLE9zJVBtXzFAP3F0YzU/ZTJNYVEhWElyRS1RQzczJ2gvLSdDNCpiQVwjWWVUIyJQIWZSNWkvVHItZ04pPmEndCxKQVIjcms1PE1jSkcuYnJJIkcwLj1Ka0FyZCIoUScmNmA4ImoiSFhaNkElJ2lvdSJkKjc5N1xDI1BhXUA7SHRUQVRvIlMxK2tOSXBKc0crMzUscVo8RVheSDBmWjtUYV5pSylpQmI6Qz9AK1tlLk49b1lcJycwXW1TVl0nQ2ZDSyhBSEE2Olk7PTInOVlDcjdTL1YzZ15zaXJvJTFXR2YnZWtzQjJMSCohM2M+aCVKRUNsO2tpcGlTZ2ctWztcM0ZBQ2ZiRjlIQVBtV1lTOj9VJCIxbUE8L00wKjJxa18iXTFvMFg/MS5EWkJxLykuU29RNjlfWSlwTmsyMzxwWzBMNGxFcFhnY1koZSJbUmRTSXAlWT84XllPOEAkR3JgIS9AX2ZFX0o1VD8pLzAkPGw3clplXnVgUGVBbXJNMkBBVERcKFBWK0VTTVgvaVQ+My5VKCY3O1s/OVpdWnVuXiFuSzlyazlqRDdBOlApNyZZYShNIjcuYl0qNElQcWcmQUtxUG04JkstVDs9UmQtJHJiQFZQI2pTXVZFTnRxLX4+ZW5kc3RyZWFtCmVuZG9iagoyNiAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAyOTE5Cj4+CnN0cmVhbQpHYXRtPT5CZWdbJnE5I0lSIW1YZkg+Sjw5R2pXdGtCcCplTy1acCprRyZyW04ta19dcTprWl1EKlZKJVEjQ21VPk9xa1QvUllpM24lIlMwOSlwQ3RtSDIqR2doZVokWl9fJlFMX2hgPEQ+bkhVNVQ1Sy5VZj0wJTxhJVxsYm5qN0AxNU9hZ1E6XSxOJmVPdWVxZG1IZmQmbCxqMWBIUkAuRT1xXG4+VkFRNk9OVz1WMUNUPEdEQzUvODBLdEFCXzBnOGo0VWsyWUdVczBjckVJO09rW0MhZ1tkMFNkZEthUz1NLVJrWmlMO0ZXK1ZJbE9JT20vdV5rblNKRGNGRkxUOjNBQzpQMG8jQGpbdDBjMCZOJEdeZFlRT2JvI01HVTJORGpvIkRSVGZsWjVtbGgkO09AT1dLXWsvSlQjLSg3QF1xQ19iLmNeVnJwPlVuJjBWWztaYnMmTFdaJyJaTjxMKGQzcUI0TzE2WjlSXFFTN1JyR0ltYkAuZmhzIlxRblczJ1FCNmctMkJXVD5uOHQvJlgzUzo1bixIKVs8RDohaTtPQmguWElAaG45VUl1KCZIMkhMXENZLileIUhtOVFvR3RiT2QuO2RTM21dYyYtdExqc21NKVUwODJjRUxgJDpBXChJQkRTIkwwNFknWyRsQ1YjVEU9TV8rRkV0WSddP0pHV3IyXTUvLlBwTzRULzBTbT0tUDtdXCtFPkxZI01SPGQmUm5pZityKU5jcEg6J3FLSSxRLnI5KFgjJzZRJCt0ai1gP3QrbmA2Nkt1KzRVLUhBYlJxKldeTz9NRC9KMTBHUi5MaHAmNTJZNmsvOy9xS240Tz5WTkQocGJlXiRKcyN1QUxvTHArOjFDPUtxQ1EuPD9cc1tXLlYkOmpvMTI6PmlkIlpgRWMxRGVwXjJLakdLby1PMUlJLDU0Y3A0KF1XaU4rc2RUKVU0WSVpMTRualVENV1UVVRDJ0YqVipsX1BxXE5ORj9YRTlsXy5nPTswbl4jUFZBZUIiXW5MIidZQkMqUi41NzdBWSpucSNNOl46VDBXJzEqXVRBMikiNlIsT0d0bi1oLF0zIi0jUzFJTzw2MWtHRCI0bjhPI2tNPUJNV2kkQjoyWiFAKVMyUlhNRlpqTVFlJ2dXXDA1OixhZEI3LmhQYmdRR1JeTCxKXVYnRW9ITyc0Sm5IVE91YnQ6LFVkKEEocCV1cF5VZD5vLz5cYiltUVo7OHNgL2Y3V1xtMTEwMzMuLG82bEwhLUhlT05mYzklSV0sKXNGWkY8X0BZajI1PWUoU0VDQGRmXkMxW1gqYW9CaDg5P2w7PHBxKj5BO0JnOyIsaENIPE1RXkFZZ1BlJFxgO3BsP0RyX0wqI0VnLjljUUcqbUthWmhbOXNHXzddcktsJkU0MkhMc0pyYTAlb1MyWC5RaCVJI1goSGlNO0QjZltoIVQtazNdciskV3E/bVQuanJlPmdxUSlEZ0ctMWJDOy9Gb0RjVDxaO09JUkFSJ0dbZiE0SDZQLTklJDEzJE9jOSNdNFBHPiZqOE80XzM1WE1vRSxXcikzYSpwb1gyamMjMlElRTNDdVRLNXBWOHNcaSQuKGs2JFMnUEsobidtL044PD1SdWIqTVJmMVRhJEY0QzBHJ2g6Tl1xJDEpcDowRGpIWHMqOTMwTFY/MTQscSFiPiMpUzc2Omo7N3EsZFhXKT4zYVYuTmMqbEFhNmliVipZMTNhMVEtRHJrMHNlT0AiUFRvUTxxPzAwJVJPYHRNYlllZ1JnXTNXaEJqJS9uRz9GUiRPZ3FYXXBCNTUsRzxBJkBlOy8tL1MqaEY2a3JYQC42RCJ1ZVk/V1clTmVyc1NCKjs2Uzo8bj43c0RKXTVOYiU0YVNRKilGVDA2JFxfRUdHRCFpW2dNS2BbPlpzL2M1REAqPHMhP0lSMEkvQ01bcFhrO0BGPFkqSCMrPFBTZCFZazkoMCdNTFdKY08/Il4lU1hUXC9zcFAqMDZFYy5XXCJ1VEZybGEoSVhAPGRvJ14wKi9FJj87UTlhVWpYdSFLKVc7VDBMPys2RUtxWDAlXG0mbCJIaUEvcGw/RFtEbWsqLVosOjc4K2MrRSoldUwhIXFpPGc5YDcuYXJybTomIyozZCQ9XWVlckA6QHBGZylUU0hQNyhCKlFxOiMtXVpAazV0QFc2Zjs7Zkombi86YjcvOC5sOnVKKG9HQCMxVz4zKD1OQz5ccS9ndUsuLSstIyFLZm04V0xzISk9JlpQIWhwOzhzSVcmSyRZU3MzIT5XcVNDVCxNQ1MjQ3RdM09bWyhXW0xfWzkjTltBL15mRztJdGhUTzVOOysiIl5MS2AwQTVKRWs7PigraG07KFwsP0JvSyZQIlotVl5SPVBqPiIjTjRYcT5OQkVNZlxASyZFaSVqW1pdO2spYnFAMjwzKi9abW0pMF5Xc2luYyhNUFZkIXBOcy0nWUdmRGEsUiIxbmsuSnMvIlFYOkpKRFFoWSkqXGVxUihXaChQXzAnRCcyX1ZuRiw8NC4xaFxhN25EU3AwRlo4QytDNSI8cy08Nzs0RS1wI2tkW0pvNzZpODcnNWdVcydrMzZ0Wj1vXCVDT04kXzc5SzgkUUloZDpELFdqYDUiSiM5azFfNSIpVDRHNi1KTT4wa0NwdTY4JjFvaTFsXCM6U1NoSlM6J11DQlNyUl42KlNhJy9fIT5nMWMkT19DK0AjYGJJSF1oWmlbRiVENGtDKEhxaE0nTmY/NmsyUCg4YT5LcDhGQT5dYVBmMjJObGk0Z1VTPVBSVkBgVUc4YFcyK0dAYFBFNiJuLD1YPC0hLF1kaFV0VGQoZCRMWykyVHNTOjsoKS9tcjtaWjkmcUNoQVFURDZRcE0jWSpsUz84O10rK19NNG5dN0lvYTx0V2xXZThpZkJvZ2IkNi9saSpyOk0nZmpKISs+JyFmLilzaF5eRDxbU0BRN0BvK2BAUUpGcjVFcEktRHBeK1ImZ2g/U3VzO3FdcWlzXG9NU0giS2VBNmolcXBcTXBON2QrVzBGZTMyIUE6ZzYjMTAxWWBhJFM2UkVsTjFzP0g6RD1wZSQpcS9WdUZGJk43YD5kcmI8aC09Z2tvakJKV3I6SXJMaVQjTi5ALnJhcGtpImMnU0A3I251UnQ2ZV5vOT81MmVYWmcoQ29eTTRuXzZLJGQnaCcqc2svY1NQXVNEcXFcRmJbQ1FscGkwaiVQQSo/bVYuPD0mSilVNjliVyZdWS8mWFArQiwjNz9aMFhHW2ZTbGQ4MTByU2ZXVzByN2cnb1BtWFQtN1dMdEglUGVoPjhIW1Q8TlhYVCVqZlpDSGBtTypcKE8kVUc1UW5pTHQ9RjQ4OGIpZEs1KDAoZiskWVtONTlcc15FRzthQFd1T05sOlxtSFAkMmc0JkNoO0wtdXRDXUxsLGpyQTI0ZldBX14haylKKmReQUpaTGBIaC1cNWpBSUVGaiQkPkwlbSg+M19WTT0wVk84ODpdMVshRFxAZmdgXiQxJT5QKUhRPSo0X2RfUzEzbFwtX09xJEZfNT9ZI2JTLWY0WV9lc2dwSTdnJikoZFtcM2I/bFlXbDBdKDhGVCMqRDpzKktzbiRWK0c4Lkc4OE9gOmRGdDBpZykoR2E8JlFpNHFrZj8jblBeWlgmbVUvWF8+P0hGQEUmKzIzZDw9ZVs7KEdEQklLX2E4X3BUcTIwZkIjWDZWND5eKT5TPFsvYk8mXlBTOlMmQGBWRXVpJVgvb09bS0w4YnNfZ3ExalAqdCtGXEpHcylsdSYtRl1zc1BnXSwrdHI1YzlfQiRPZ0BER0VZYDxycCtdMVBgSVNXcFgtdEhsW0syN19RWGkjMnFIJGklSkdeIVg0IVNJVC1XTHErMmArJ1VBfj5lbmRzdHJlYW0KZW5kb2JqCjI3IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDI1NDEKPj4Kc3RyZWFtCkdiITtlPyNTSy0mcTBNWFImOj0pT1hRcVBsRCkvU2hEVClyLzpwVGJHXycvOTA9NC4lZztwIWkrJWNHIkdEOz51LWFmSzI/NUk5WmU8M0BiUlEzS08zNVtMam5MbF01YVRDRDwjWW0jaTBGcFdPQCh0Wz1rU2NYRiMoSSlQMzpLOW8hJTdKbyliNS5sP2U6J1IyQ1FmPSEhZTRfI0dtJTo6QlNaMVxGPHNIZ14lZ1gzL2w9WW1lJ0QkQXE5Pm5tdFslT1IxRSVYX3NsczEvcktoQV0sV2QzVCU4TjBwLGRNY19gYUcnTENSckxwUGZLKGlOXjpLNU47SHE1YFosSShWM2xMWHNYXVBWMjE8WEBPYigoQS5nL21sUis3RiN1QTQ1KEZoRHJLP2pXSVlnKkVTb2NmMW4wLW1UJkE0IVgtVG51dVlZYSlVLUgzLT11N05tRk4jYnFQM24qO2A1LlFHbUdUb3A+XjxTXTRiWkg2IWUiSlwxaW9bQV4pNyxVKklwVl9CMD48LFYpW1UrLF5gLycwUy06M0E+MyVRN3FUPEVoL15CJTZoNkFkRUxca3JVb1g4V0BUczNRVUcrOnMpXXI7Qj1HYXFgXlMxOTlQVjtiWFBMZSNcbztOJzZlQmpAaDJmYilza1lmLnBFUVk1YnRGaGkzYGQiY2FzdFliKnFobjZWSjwvQmtXLW0yUj1WUmsxYU9aQFxST1QnS0AqSls3QSo9KGVoO0AmaENVbTk8Vj03XXJsPD9xcVAoa1hIQzE4P29BMSFhSj1HZVtHW2c/aXFHZnEhI3BVZFVNVmhLUTJBIUYncGEkLUEwQU9EQlIvVV02VmwsPnInM1ZvIVo7WzpYRFdYcydTIVghO3NrNTRvPSZHWVdrYilISy5zLzdeY2c3OyZxQDdXIT9FJTNEOSpCYjRlVHBVTVo7YShjS2laZWZeNWhPaSJNQk1JWzNIa2JhJFZtI2VlR2RCV1hNVD5yIT9JSVw2YCFzJm5ASEY5R2FBMT4+S2InJjYkNyQjMmNlVVczM0QyUFxdTC4hWVsxN0sjJzk2U045ak9yUyJuJFk5NUArWmRGR2p0cW47PEUoIkwtWy5LVV5NS11fSkJIZ0tcT1pzL28yPl1ZXFgnQFxRWGZrUE1Jby8iTSkpdD9IOTIiX1NqOGJPWE9tcy5CPVNyZzglWCxnblFAKkJyOTxnPTpyaDdNdDwqMiNpP3JDNi5ZTHIiaVVzZTBoMiRbQEddXyNmUStpY0VOc21qWyliWG08QUZiKytVRFAnNyUuVDhtJ0NcXSsxJlA+N0Y0KDtPXEY0XkFtRjVMYjouYjc6LDFsSXMnNlAicVk/MkFoc082V2hxcV9xSWxiLCRKJ0M/SW9tJXNbaSpdMyNWQUlFXGVJKFRQV1hvNWBeVCxoaUpyKWhLblI3SHRpcllYZmItVSpkW0E9SURmT20vU19UbSxQRkRTZ0tcXS0lOVNJJ0JfIix1MEpGZ2JaP1NpUSs+PTJkNTpUTGtPYjdDN1EqO0J0R1w+c2xAQW9dSUlHYEtSRSQ/YikncUs4QmpBS3NnPzojcVdCNGdSMmE7KEE8MnRfPTFdMFZ1YCVfamFxU19eITNvb0xUa1pRYlpvU04taystYDFCW09bYzhvWmo+IyooLTBCXywjJWZybzJCYDZBNz5CLSo4SmxubVM9YUxDP1dfZlA5aUZbcTUpSGgvdTJUWEQnU2BRbEFYbC1vci9wMTs9X1xMO3NsQ1knaVZqQ2dfInE5UFxRamVmK0pdUj1FP1c8TjZxZ2tdLWVDYydlR2RGPDldTFBsK0pqTG4xYF42TSlLI0MzQS9LJDAlbyMyMDpsSCMnIVBzY0s+OzNwZkk6JXBFWygjTF9qQFdqLmQ+VVZ1Q2M4IkFYIUVucnRPSFxJOTEycEFHPWJIN0ExJ3A2NTNFV2lVRypvaWlCOWpNbT0lK1QzKF87KzFFbTBhS0gkI3IqWk8tbGFbWiQ6QDBkR1c2MGVyViQ6ckttIzVeKF5GcDQhWmEvK11UWFAnIj40PGtQKF5cOFFBbEJMQThOKkhlQFEkRC1DW0o+aWosTk82ZChlZ0liZ1M6K1ozZlFZUG5uNSoqWkhqPTtxWG8vNGRvIWBcNTEwZT10cEZTaG0+WCZ0NlE+UG87aGJFVVAlYnRPLT1bUTVaST1pNi9PQj0/PzAzQjAlUlhzazZMLlJTPWVzXUlRNVJGSGJQJDlNS1FMRWhLMERQIl5dZDRCXSVZJVJsRDVvIjFUSzo1O0dlbURjNScuZy1eTS9jLEZnSmhfTlZWR0JnImokSEQya3RTTElPc2FGNktjJUVydEElLCJtaUw9KFtOOzJIPW8iLj9cSilRZjcvcmsta2xRKzdER01nbC9DYl1tTz4rQm9kQlxjZ2NaOT9qajM7VnNOS1dcKlcyM3E4Tmc9cWhHITFqWllWI1liMWJvYT1NRTY9Jm1kIWc9R1w3aFVJc0JFUC9VI0o2cSFDT0RjVT9fZEJKajRYUGRVR3BWXydCZ04zRCQsciNVLS9WdGQ/cTZSNF44XltGSlRvWiI9cWhmNCw0bHArRjhlW1ApSEc3P1kyTXM9JiNBQSo5UU8/ZnFRZT07UTFmdSlzKjVZbVQ5MGJHTlMiK0NwNEJkaj03SGZeKU9MbyVub1tUSGEiLllYSzxGQWthbXRzbDldZGdNY3FTP2lNdFI5P0RiXktDKFlnakdYTXI0YlNNWlRwcTY/bEtTNVJZc3EoUDwtV3F1SVJlZGlmRGQjU1JXUClGNCtlZkw2QilfJEpmSHBQbmZabmRvc2djL2pZVychXW9jcylhVipDLmhaPGtSXlNhMW4vbW00dT8tT25EU1sqVlZHc2ghZmgoUWlrLThXRnInLS5aLEk9NUtRbi9RJGJ1TDlObSYhUygmXTYpRl5WM1ApI0tIMjZCLz9wQ28xMD81QUk1a2VMS2UjPy4xOlRka1ktWiwwQmxkMSxMJCdnXWdEYlY0MXBBIz5qZWcmTDNXX1pJUmhnWz4iMis+aW1vUU8/S3UuODs4QCc4Z1hISnUiZkRMPS9DYj1nJDhULSJaOTgkO21hRHJlVUdNPFdMJU9eciZoTVYyL2ZOLCgtVEJMQU00X3MsOGVPQTY6MSQxJ0RKQ3MhRWZcNzRtJUBYKGpdL185TExFbyMxcjZTTVVeU2VAKWJhSilRXHReTVovbCVWYFQzbXEpL2ddbjhoR1YuZD1NXWpoVSspXDgvJmQ8TmFRN2k3Q0hNWV0ncEokT0tRQnJUajUxWDEkOVddZDFHQ1YvbVFkLldNKW1bKnFtImtoQlYhTSw/TGs3VCgzL2FfZFFAO05saEtEbmxYailuTi1LPi5GZlZBKFR+PmVuZHN0cmVhbQplbmRvYmoKMjggMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTI4Ngo+PgpzdHJlYW0KR2IhO2I5bG8mSSZBQEMybSpXcEtAMC5QUG5sQF1TPyRBPmk+XGc1KE4lWV9LOF1bIUgkQG07YT9mKSNZYVxsU0w0aWlDXEB0RE1bZ1VIVyc4MFBlW21EJGdLaTBQPU8/VyFJKUFkYjdcOFJfPFM+Zz1ccjlMcD0pUjBYcChSTyhDXy9VZiZyXEUwT1JRT0AlRCRPMEFEaXIrTlVOK10zbFAydURSSlBbRWZbYVNnLXE/OlQ9U00wVCFkaElVb2JIUFBINjQzZ0Q+WWRscDpWMCc/RSI1KF5FMCU0MThOOUZoZy1gWjEoUEpdI2M+Y0kyJlBeUVNYREBnQEYkX0NCJ3JCIU5RNmkqSjc5TG1NOExuLTxPdEUnTm5CayMhLTpBOVlNJVAuX0VrdTlTNFllNW8lOHAsYF1PM0I1LjphOztTYENFWk8+KEoubG9tRDhmJ3BNYVhZJ18ybGQyY21caGZWIyNJRGAxSGlNPXBSN0lWRC9ERyJxPEQqZDFEX2FuRyw7LCpQVV4xWlcxbHB1RWsoJzwuSzJPbTJNTmFPc1dedUAkcHIqZlosbCVmVmo9Z1NLPUs4QFNeZjM+Uz03RTJbPk5JP2AvY2QiMWBXZzFXZW5SUyVIRy9dS2wrNDtmNVBNcTo6cyZvTCk5bW5HY0VHa1pFNmQwZGg9aW5UOnRfRD0iM2BebmFiPyJebGtmSCQ2P3A+RmYjLEE5UWhwR1FnbkU7QjBJVyViNyVVKTg6aCVmay5BXGVHS0AqQDhEMFxxVTJEN1UvYGNANyluNUpEUjpKVEAsb3VucFxISDM6XWhtUz0hSi9oQDFoLDhTPlRhUD5uT2UpdT1KSGEyQyZvT0FKZCtTSU1vcigwbUhIPUZvYzBbZmk2YEBjWXM2J0YxJkUhOj01bjNLYTdLcVc4RnVVYiolVjM3LCxpayErQUQkamsqP21ZKiYvYz5mVXNYdCY6QSpSLzphcjBvSmpRcWBEIS5ISFthXFdrOnAqYyU3WXMuVClaamxYJionVl5ZZC9CZD1WdTVsPG5iJ0cpc3RgVGUvWS4ta1IjWW9sNmc4KHBWcnBVOSpDOFVXJkxyIilZNF1aMyk+azZuUV9QISptU2BLZmU5NCI2L3JzP1trVl85MEhUISJWVVo0R05haDIpOFsxS3AjSlFcJkc2NmNbIW41SEw8aFYnXEJrIWpcY0MobmZnVEh0KWpIOGpuK1djP11waE1xNSRMcmNFbl8tK0ZVOj80cGhRUTowTzVmNSFlVGtIWjtbUy5ecTYtWnFGO29TYGdvIjtrP0tHOE4tV0o5c0tqXD4iVFlLXltJTFEiaEs1KXErM1pKVjYnZm1HJz5hMyZlbD0ybHMiP1VIdD1XI2MrR2JfPUZacz1XZCYib0xtVmc8MC1sSGw1JWZwMi0vcnE2R1RwXG5GLlVWS2d1Iy9MK05HXUEtZF4lZjNgQlNnXjMvMkFuPEZXRiUzODooa3IkW2QyJ3E5c15bbHBpZiVvTXM5YW5jcHU0OXJwcltdSGl1az9NO3NtcV46XjBbbDdeY0M0VCVMaWU1YWlDbTpwNkhnZWhQYFx0TDE8KWtzR2ooLzkiO3NWLnVwRypZRW9lQjE6UCtOPFA5aj8xU1YkQCJcQ1pXZjJaQktCLE1abDU6UUViQzpvaGEjcDcyZzlTW1NGQlgvcGcpU01xcVNFOWA+MywkN2BAfj5lbmRzdHJlYW0KZW5kb2JqCjI5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDIxODkKPj4Kc3RyZWFtCkdiISNcZ04pJSwmOk4vM2xyMXNIYCYnKEwwNWt0UWdJXl5GbHJdWjQxTzRPQjg3Rm9KJDpuPyNeVjEnZVVhNF1aU01tJSQ0VkFvQ0x1IV1pQil0Z09wZVU6JFoyZiw0TDZEdVBQZWhTT2VHIj4tP2J1UF9vUjVmPkpLTCRUXVwiI0dOcHFuX2AhOEZFJ209aFBLPk8iLDxcU3FebmQrOS1gU2NqYSRRTTpPYyFUJ2MnWy4nVjhfNjFjSHFvK1ohXSg3Vy8xKjFgaTU9WnQnPHBhLC9fWUtTUGYjKUEnbypqLktfcz0nSS41ZUteKXFAXSwxKis0YVtOMEZKIUxiL1ZHYj8oJjVhL2hGPj0vY1IucHReSCw6NFFBWUZdN2psZz07ImcpaXNaWCpjM15kO1A9NlJHMzomPVY4MUshailvYTk1NzRVKEcwYUteZiwoREpQZHAncUNPWFRvcD0zPFNdNGJaSDYjOyFsZVNVcjo4XFA2cE5sU1JIUyFzL1M+Ri1Yai50Uk4tTC5kLCIpXWg3akVaU21NW2VaKTNBa0QuPF0kPlVDPGVrcUIqKkRMTDBUWSFZTWVvVD9jTio+ZjN1IT1aKSEvYE1BX1pjJipDUyhQXVlUU0I3VTRIWkhbYEM/QCJsYj9tNCRPIUVfbF5naHRSRysrVSZHMGNcUl9OJnRWazdLSl1hbXA+c0NPISZLSCdzdEpfOl1nUVgjIW1YMEoycy1vaWtKUCtQMW9xVyMjWExPcEpyLS5KQnRwTGU2QF4iYy9hJ18iLyJvcG5WY3JGRWlbK0htMFw6KDsuQyYrKChSZnI4WyxxU0BxJ01xdSxnOW08Ryo3L2VHXzsvW00iMkRDbVhqX0BuKGYrNXBaOkwxV3FYMXM+aVJsJmNoVC5jPjBtcE8xSCZqKzYqaicxWExWSyRsOWtDUEAhYHBmb15yNC1zZVVfZSIiKC11dFJmaGZgc2dgIjlgaUQ8Lmo2KzhJWDdCUDxXaDslXUg3T21RcUM4JSxkRStjSFAlLnFZdUVSJ2hRKmNkcUpYPU4nU147VkVZYEckSkVfW1ctOzRIQD5XLVdiLC1UVyIhbE0oLDNsJGgiW0Y/K0huanU7dC9vNC91dTlMWHJvNmJDNCsyJ2BYKUczQFA4bCwoKFw4S2lXRnFTJClMPVlaNzBPZUMwPEtcIVRYVnVdRUpJM3Jbb24oWFFFUGJUTCkpPDhHczVgQTw+SDxqODszO0YnOnI2QTV1ISJAJDREZjJDaT0/O1JnQ3RlOjxkSmBBRiZBKVFPRjhIRU0nVyJpJWpAPlYlMUVZRnEyRl4jNF4mJVk+QUAhc1twPFd1RjRGJnQmaU48MDlkaTBXQSQyXDdna0kyZFtlSklWV3VSRiRRI2pUVERNSDxFbyV0QjdwTnFASCQvR19yQSVGQmY2TmxFJitCQS0oTUQhSzRKdVhsb2tOKlZUJ19URi5WPEJhdClbIS8rOHM2L1hFXUI8W0FORVxMX0A2S1ctUj8ySmQtOT1JKi5VRmwtZ3IoMV42WnJUS0ApcD51SXM3XUlSXz0lLUg8J0pZW3QtIUpFNEQ+OkJjKTYwcG8mZkZYcTlxRWtHYGExNG9pRV8nWCo0IShsI0trJ3Q9NWBTYGZUN2Y3amYyNTRKbiU1TTA8YmIubkk6OT9MRWRZIztyOWZNM1NoZTdbREtkM1MoPWYvOl5mLSIkOEFqbzdWXz00VWVUZUUrbFMmT2xJLytkO0ttcXIwZyRwWlpKJFE5UjRiY0hjTm1fKnEhMi44NEwpME5xUyU7ZDNLbFlSU0dgYEA2I0dgUlRbW3BDQztgbyFmLF5PX2MyUVRCZmAxT3NCXSZQVFBESiFuNU4sUl9HczZ0bGs/JDgiRkhIJSctY2tvKTB0Pl9jSVc0IiFyUlosNy1PJEQ9W15YRExbdWdyQE4tWEZEX1YoU14vRVJuUHAvLSREJ2RLO2AlR1F0SShzQHBHM1ludCspOCw2MSpPbC07ci8zQTgjTyFNU11AKzNPNVpTaHEwNGdsTlNEciNnNGpVIkoxPlxQX2pvdTpFJDlaXWg2LlImIWAxIUZnJ1cwS148X01sZlVmXEh0Nm4xWjQiYzBtO2BxZ1JlYHNnaUBHWW5VYVZSIWxNTSUuIUQuTD9XUjVrN0I4M1pgSzQ3LC88aEBRLmllbERxTk0sOFBbWGhqL0MjQG9ebi9dKFtlRzxUVyYyTUxKRjVWOyhmNEFrO1ctTTddIXUmM19SPyY7JE41WDQrRykiI1clbV9iRXIpJ0FcKDgtSSJqbFw5bDIpbyJBMV8qS0k+VzYoL0VGW0VnUiVpNydZdGkiR1k0UFF0LSpgRDxpc3BcakQrTi5LOSssSFt0V00uQnQpb2MvJUZhY3IhZGFwTS9BSGZxLjxMVl5TSGFXIXBEQ05JLDhWaFNYPl05Vzg9Pz5Tc21CZDw5cl10XUZwcD9INUc5UGpMWV1gJjhuIy1pTClwUjdpb1BePDtON1g9KWokSCZHcC5mOnJrYmZlT1Y8WmRmSj1HOC1ZNFB0XCc5cGYiZFA1MlM1WTAxRThodCJdRkUsZzNxVzpAWF1rTmd0XWUwXCk5LEk6MkxaXUhdV208Kk51YXFoPFhZMzs9ZV51YU0sZ2dOOiRsJV1qNF9VWGc/OSFbXjNcKTJcT2MoYm5EIiM2JFZXLUg9SmxOX1NCZTAhSlg6YVVZYGVrZ0hGbjhZaHFKXihcPUlnMVE0UD4rciVzMUAlQmh1RE9UR1FhQEUkOFg6KD90NyslQVpnXzxmISYxUT0hako0RmQoQSktOHU2R0tnQVZdWlZAI1BoT1QkOkQsRWIsSktTQTNgJXFNNCssQy4/ZD9dO3I4PS8zIzRvMUlSZyMjMEtsR3FYdEUzQCI/KzU3WVJjMn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMzAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAxNjggMDAwMDAgbiAKMDAwMDAwMDI3NSAwMDAwMCBuIAowMDAwMDAwMzU4IDAwMDAwIG4gCjAwMDAwNjI1OTkgMDAwMDAgbiAKMDAwMDA2Mjg1NyAwMDAwMCBuIAowMDAwMDYyOTY1IDAwMDAwIG4gCjAwMDAwNjMwNzUgMDAwMDAgbiAKMDAwMDA2MzE4NyAwMDAwMCBuIAowMDAwMDYzNDQ1IDAwMDAwIG4gCjAwMDAxMjU2ODcgMDAwMDAgbiAKMDAwMDEyNTc5MyAwMDAwMCBuIAowMDAwMTI1ODcxIDAwMDAwIG4gCjAwMDAxMjYxMzEgMDAwMDAgbiAKMDAwMDEyNjM5MSAwMDAwMCBuIAowMDAwMTI2NjUxIDAwMDAwIG4gCjAwMDAxMjY3NjIgMDAwMDAgbiAKMDAwMDEyNzAyMiAwMDAwMCBuIAowMDAwMTI3MjgyIDAwMDAwIG4gCjAwMDAxMjc1NDIgMDAwMDAgbiAKMDAwMDEyNzYxMiAwMDAwMCBuIAowMDAwMTI3OTI4IDAwMDAwIG4gCjAwMDAxMjgwMzAgMDAwMDAgbiAKMDAwMDEzMDAxMyAwMDAwMCBuIAowMDAwMTMyODgxIDAwMDAwIG4gCjAwMDAxMzU1OTkgMDAwMDAgbiAKMDAwMDEzODYxMCAwMDAwMCBuIAowMDAwMTQxMjQzIDAwMDAwIG4gCjAwMDAxNDI2MjEgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MGE0NTU1NGM4NDhiNTFjOTBmNTA0ZmQyNjA5YjNjOTA+PDBhNDU1NTRjODQ4YjUxYzkwZjUwNGZkMjYwOWIzYzkwPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyAyMSAwIFIKL1Jvb3QgMjAgMCBSCi9TaXplIDMwCj4+CnN0YXJ0eHJlZgoxNDQ5MDIKJSVFT0YK";

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `Getting started with AGAPAY — ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Getting started with AGAPAY", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> has been verified for AGAPAY. You are now ready to activate your subscription and connect your parish Stripe account so that your donors can begin giving online.</p>
      <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">What to do next</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#F6F1E8;">We have attached a step-by-step setup guide to this email. It walks you through choosing your tier, activating billing, and connecting Stripe — the whole process takes about 15–20 minutes.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(246,241,232,0.72);">Open the dashboard using the button below, then follow the First-Time Setup Wizard.</p>
      </div>
      <p style="margin:0 0 28px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 24px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard →</a></p>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">Your dashboard address is <a href="${safeDashboardUrl}" style="color:#0A365B;text-decoration:underline;">${safeDashboardUrl}</a>. Use the Parish ID and password from your first email to log in.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">The attached guide includes a post-launch checklist and troubleshooting tips. Please keep it handy.</p>
    `),
    text: [
      "Getting started with AGAPAY",
      "",
      `Glory to Jesus Christ! ${registration.parishName || "Your parish"} has been verified for AGAPAY.`,
      "",
      "We have attached a step-by-step setup guide to this email. It walks you through choosing your tier, activating billing, and connecting Stripe. The process takes about 15-20 minutes.",
      "",
      `Open your parish dashboard: ${dashboardUrl}`,
      "",
      "Use the Parish ID and password from your first email to log in, then follow the First-Time Setup Wizard.",
      "",
      "The attached guide includes a post-launch checklist and troubleshooting tips. Please keep it handy."
    ].join("\n"),
    attachments: [
      {
        filename: "AGAPAY-Stripe-Setup-Guide.pdf",
        content: onboardingPdfB64
      }
    ]
  });
}

async function sendDashboardInvite(env, appUrl, registration) {
  const recipients = Array.from(new Set([
    registration.priestEmail,
    registration.treasurerEmail
  ].filter(Boolean)));
  if (!recipients.length) return { status: "missing_recipient" };

  const parishId = registration.parishId || slugify(registration.parishName);
  const dashboardUrl = `${appUrl}/parish/login?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const token = htmlEscape(registration.parishDashboardToken || "");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  const email = await sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `AGAPAY dashboard access for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Your AGAPAY parish dashboard", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> has been verified for AGAPAY. You can now access the parish dashboard to manage your giving page, funds, campaigns, billing, and Stripe onboarding.</p>
      <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:18px 18px;margin:0 0 22px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">Next step</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#F6F1E8;"><strong>Please choose your AGAPAY tier and complete billing first.</strong> Once billing is active, the dashboard will guide you into Stripe onboarding so your parish can receive donations.</p>
      </div>
      <p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard</a></p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard credentials</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Dashboard:</strong> <a href="${safeDashboardUrl}" style="color:#0A365B;text-decoration:underline;">${safeDashboardUrl}</a></p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Temporary password:</strong> ${token}</p>
      </div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">After opening the dashboard, enter the parish ID and temporary password. The setup card will walk you through billing first, then Stripe onboarding.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">This temporary password gives access to your AGAPAY parish dashboard. Please keep it private.</p>
    `),
    text: [
      "Your AGAPAY parish dashboard",
      "",
      `${registration.parishName || "Your parish"} has been verified for AGAPAY.`,
      "Please choose your AGAPAY tier and complete billing first. Once billing is active, the dashboard will guide you into Stripe onboarding so your parish can receive donations.",
      "",
      `Dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      `Temporary password: ${registration.parishDashboardToken || ""}`,
      "",
      "After opening the dashboard, enter the parish ID and temporary password. The setup card will walk you through billing first, then Stripe onboarding.",
      "",
      "This temporary password gives access to your AGAPAY parish dashboard. Please keep it private."
    ].join("\n")
  });

  return { ...email, recipients };
}

async function sendParishPasswordResetEmail(env, appUrl, registration, resetUrl, recipients) {
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const parishId = htmlEscape(registration.parishId || slugify(registration.parishName));
  const safeResetUrl = htmlEscape(resetUrl);

  return sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `Reset AGAPAY parish dashboard password for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Reset parish dashboard password", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">A password reset was requested for <strong>${parishName}</strong>.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${parishId}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Reset link:</strong> <a href="${safeResetUrl}" style="color:#0A365B;text-decoration:underline;">${safeResetUrl}</a></p>
      </div>
      <p style="margin:0 0 24px;"><a href="${safeResetUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset parish password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `),
    text: [
      "Reset parish dashboard password",
      "",
      `Parish: ${registration.parishName || ""}`,
      `Parish ID: ${registration.parishId || slugify(registration.parishName)}`,
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "If you did not request this, ignore this email. The link expires in 1 hour."
    ].join("\n")
  });
}

async function sendAdminRegistrationNotice(env, appUrl, registration) {
  const to = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  if (!to) return { status: "missing_recipient" };

  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = registration.priestEmail || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const adminUrl = `${appUrl}/admin`;
  const parishName = htmlEscape(registration.parishName || "New parish registration");
  const tier = subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration));
  const location = [registration.city, registration.state].filter(Boolean).join(", ");
  const address = [registration.addressLine1, registration.addressLine2, [registration.city, registration.state, registration.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const jurisdictionRow = registration.jurisdiction
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Jurisdiction:</strong> ${htmlEscape(registration.jurisdiction || "")}</p>`
    : "";
  const websiteRow = registration.website
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Website:</strong> ${htmlEscape(registration.website || "")}</p>`
    : "";
  const descriptionRow = registration.organizationDescription
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Description:</strong> ${htmlEscape(registration.organizationDescription || "")}</p>`
    : "";

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `New AGAPAY registration: ${registration.parishName || registration.reference}`,
    html: agapayEmailHtml(appUrl, "New organization registration", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new organization has submitted the AGAPAY registration form and is ready for review.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Registration summary</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Reference:</strong> ${htmlEscape(registration.reference)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Community:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Type:</strong> ${htmlEscape(registration.communityType || "")}</p>
        ${jurisdictionRow}
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Location:</strong> ${htmlEscape(location)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Address:</strong> ${htmlEscape(address)}</p>
        ${websiteRow}
        ${descriptionRow}
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Subscription tier:</strong> ${htmlEscape(subscriptionTierSummary(tier))}</p>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#171715;"><strong>Primary contact:</strong> ${htmlEscape(`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim())} - ${htmlEscape(registration.priestEmail || "")}</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#171715;"><strong>Finance contact:</strong> ${htmlEscape(`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim())} - ${htmlEscape(registration.treasurerEmail || "")}</p>
      <p style="margin:0;"><a href="${htmlEscape(adminUrl)}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open admin dashboard</a></p>
    `),
    text: [
      "New AGAPAY registration",
      "",
      `Reference: ${registration.reference}`,
      `Community: ${registration.parishName || ""}`,
      `Type: ${registration.communityType || ""}`,
      registration.jurisdiction ? `Jurisdiction: ${registration.jurisdiction || ""}` : "",
      `Location: ${location}`,
      `Address: ${address}`,
      registration.website ? `Website: ${registration.website || ""}` : "",
      registration.organizationDescription ? `Description: ${registration.organizationDescription || ""}` : "",
      `Subscription tier: ${subscriptionTierSummary(tier)}`,
      "",
      `Primary contact: ${`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim()} - ${registration.priestEmail || ""}`,
      `Finance contact: ${`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim()} - ${registration.treasurerEmail || ""}`,
      "",
      `Open admin dashboard: ${adminUrl}`
    ].join("\n")
  });
}

function publicSubscriptionTiers() {
  return subscriptionTiers.map(({ stripePriceEnv, ...tier }) => tier);
}

function stripeReady(registration) {
  return ["charges_enabled", "payouts_enabled"].includes(registration.stripeAccountStatus);
}

function subscriptionReady(registration) {
  return ["active", "free_forever"].includes(registration.subscriptionStatus);
}

function weekWindow(date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

function splitSubmittedNames(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function commemorationKey(parishId, sourceId) {
  return `${COMMEMORATION_KEY_PREFIX}${parishId}:${sourceId}`;
}

async function loadCommemorationEntries(env, parishId, startDate, endDate) {
  if (!parishId) return [];

  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT data FROM commemorations
       WHERE parish_id = ?1 AND created_at >= ?2 AND created_at <= ?3
       ORDER BY created_at DESC
       LIMIT 1000`,
      parishId,
      startDate ? startDate.toISOString() : "0000-01-01T00:00:00.000Z",
      endDate ? endDate.toISOString() : "9999-12-31T23:59:59.999Z"
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = commemorationKey(parishId, "");
  const keys = await listKvKeys(env, { prefix, limit: 1000 });
  const entries = [];

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      const created = new Date(entry.createdAt || 0);
      if (startDate && created < startDate) continue;
      if (endDate && created > endDate) continue;
      entries.push(entry);
    } catch {
      // Ignore malformed queue entries rather than blocking the dashboard.
    }
  }

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return entries;
}

async function storeCommemorationEntry(env, sourceId, metadata = {}, fallback = {}) {
  if (!hasProductionStore(env)) return null;
  const parishId = metadata.parish_id || fallback.parishId || "";
  const living = splitSubmittedNames(metadata.names_living || fallback.namesLiving || "");
  const departed = splitSubmittedNames(metadata.names_departed || fallback.namesDeparted || "");
  if (!parishId || (!living.length && !departed.length)) return null;

  const entry = {
    id: sourceId || crypto.randomUUID(),
    parishId,
    parishName: metadata.parish_name || fallback.parishName || "",
    sourceId: sourceId || "",
    giftType: metadata.gift_type || fallback.giftType || "commemoration",
    frequency: metadata.frequency || fallback.frequency || "once",
    donorEmail: normalizeEmail(fallback.donorEmail || metadata.donor_email || ""),
    donorName: fallback.donorName || metadata.donor_name || "",
    amountCents: Number(fallback.amountCents || 0),
    living,
    departed,
    createdAt: fallback.createdAt || new Date().toISOString()
  };

  return saveCommemorationEntry(env, entry);
}

function commemorationSourceIdFromOffering(offering = {}) {
  return offering.checkoutSessionId
    || offering.stripePaymentIntentId
    || offering.id
    || crypto.randomUUID();
}

async function ensureCommemorationEntryFromOffering(env, offering = {}, overrides = {}) {
  const giftType = String(overrides.giftType || offering.giftType || "").toLowerCase();
  if (giftType !== "commemoration") return null;

  return storeCommemorationEntry(
    env,
    commemorationSourceIdFromOffering({ ...offering, ...overrides }),
    {
      parish_id: overrides.parishId || offering.parishId || "",
      parish_name: overrides.parishName || offering.parishName || "",
      donor_email: overrides.donorEmail || offering.donorEmail || "",
      donor_name: overrides.donorName || offering.donorName || "",
      gift_type: giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      names_living: overrides.namesLiving || offering.namesLiving || "",
      names_departed: overrides.namesDeparted || offering.namesDeparted || ""
    },
    {
      parishId: overrides.parishId || offering.parishId || "",
      parishName: overrides.parishName || offering.parishName || "",
      donorEmail: overrides.donorEmail || offering.donorEmail || "",
      donorName: overrides.donorName || offering.donorName || "",
      giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      amountCents: Number(overrides.amountCents ?? offering.amountCents ?? 0),
      namesLiving: overrides.namesLiving || offering.namesLiving || "",
      namesDeparted: overrides.namesDeparted || offering.namesDeparted || "",
      createdAt: overrides.createdAt || offering.createdAt || new Date().toISOString()
    }
  );
}

async function saveCommemorationEntry(env, entry) {
  if (!hasProductionStore(env) || !entry?.parishId || !entry?.id) return null;
  const record = {
    ...entry,
    donorEmail: normalizeEmail(entry.donorEmail || ""),
    createdAt: entry.createdAt || new Date().toISOString()
  };

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO commemorations (id, parish_id, source_id, donor_email, created_at, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         parish_id = excluded.parish_id,
         source_id = excluded.source_id,
         donor_email = excluded.donor_email,
         created_at = excluded.created_at,
         data = excluded.data`,
      `${record.parishId}:${record.id}`,
      record.parishId,
      record.sourceId || record.id,
      record.donorEmail,
      record.createdAt,
      JSON.stringify(record)
    );
  } else {
    await env.AGAPAY_REGISTRATIONS.put(commemorationKey(record.parishId, record.id), JSON.stringify(record));
  }
  return record;
}

async function storeDonorOffering(env, offering) {
  if (!hasProductionStore(env) || !offering?.donorEmail) return null;
  const email = normalizeEmail(offering.donorEmail);
  const id = offering.id || crypto.randomUUID();
  const fees = offeringFeeBreakdown(offering);
  const record = {
    id,
    donorEmail: email,
    donorName: offering.donorName || "",
    parishId: offering.parishId || "",
    parishName: offering.parishName || "",
    giftType: offering.giftType || "stewardship",
    title: offering.title || "AGAPAY offering",
    fund: offering.fund || "",
    campaign: offering.campaign || "",
    feastDescription: offering.feastDescription || "",
    inMemoriam: offering.inMemoriam || "",
    frequency: offering.frequency || "once",
    paymentMethod: offering.paymentMethod || "",
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    parishNetCents: fees.parishNetCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    status: offering.status || "checkout_created",
    paymentStatus: offering.paymentStatus || "pending",
    checkoutSessionId: offering.checkoutSessionId || "",
    checkoutUrl: offering.checkoutUrl || "",
    stripeCustomerId: offering.stripeCustomerId || "",
    stripePaymentIntentId: offering.stripePaymentIntentId || "",
    stripeSubscriptionId: offering.stripeSubscriptionId || "",
    stripeChargeId: offering.stripeChargeId || "",
    stripeBalanceTransactionId: offering.stripeBalanceTransactionId || "",
    stripeFeeSource: offering.stripeFeeSource || "",
    namesLiving: offering.namesLiving || "",
    namesDeparted: offering.namesDeparted || "",
    emailReceiptStatus: offering.emailReceiptStatus || "",
    emailReceiptId: offering.emailReceiptId || "",
    emailReceiptDetail: offering.emailReceiptDetail || "",
    emailReceiptSentAt: offering.emailReceiptSentAt || "",
    completedAt: offering.completedAt || "",
    feeReconciledAt: offering.feeReconciledAt || "",
    createdAt: offering.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO donor_offerings (
        id, donor_email, parish_id, checkout_session_id, payment_intent_id,
        stripe_subscription_id, status, payment_status, created_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET
         donor_email = excluded.donor_email,
         parish_id = excluded.parish_id,
         checkout_session_id = excluded.checkout_session_id,
         payment_intent_id = excluded.payment_intent_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         status = excluded.status,
         payment_status = excluded.payment_status,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      record.id,
      record.donorEmail,
      record.parishId,
      record.checkoutSessionId,
      record.stripePaymentIntentId,
      record.stripeSubscriptionId,
      record.status,
      record.paymentStatus,
      record.createdAt,
      record.updatedAt,
      JSON.stringify(record)
    );
  } else {
    const key = donorOfferingKey(email, id);
    await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(record));
    if (record.checkoutSessionId) {
      await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(record.checkoutSessionId), key);
    }
    if (record.stripePaymentIntentId) {
      await env.AGAPAY_REGISTRATIONS.put(stripePaymentIntentIndexKey(record.stripePaymentIntentId), key);
    }
  }
  return record;
}

async function updateDonorOfferingByCheckout(env, checkoutSessionId, updates = {}) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  const current = await loadDonorOfferingByCheckout(env, checkoutSessionId);
  if (!current) return null;
  if (d1(env)) return storeDonorOffering(env, { ...current, ...updates });

  const key = await env.AGAPAY_REGISTRATIONS.get(donorCheckoutIndexKey(checkoutSessionId));
  if (!key) return null;
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(updated));
  if (updated.stripePaymentIntentId) {
    await env.AGAPAY_REGISTRATIONS.put(stripePaymentIntentIndexKey(updated.stripePaymentIntentId), key);
  }
  return updated;
}

async function loadDonorOfferingByCheckout(env, checkoutSessionId) {
  if (!hasProductionStore(env) || !checkoutSessionId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE checkout_session_id = ?1 LIMIT 1", checkoutSessionId);
    return parseJsonRow(row);
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(donorCheckoutIndexKey(checkoutSessionId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function updateDonorOfferingByPaymentIntent(env, paymentIntentId, updates = {}) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE payment_intent_id = ?1 LIMIT 1", paymentIntentId);
    const current = parseJsonRow(row);
    if (!current) return null;
    return storeDonorOffering(env, { ...current, ...updates });
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(stripePaymentIntentIndexKey(paymentIntentId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  if (!raw) return null;
  const current = JSON.parse(raw);
  const updated = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(updated));
  return updated;
}

async function loadDonorOfferingByPaymentIntent(env, paymentIntentId) {
  if (!hasProductionStore(env) || !paymentIntentId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM donor_offerings WHERE payment_intent_id = ?1 LIMIT 1", paymentIntentId);
    return parseJsonRow(row);
  }

  const key = await env.AGAPAY_REGISTRATIONS.get(stripePaymentIntentIndexKey(paymentIntentId));
  if (!key) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function loadDonorOfferings(env, email, limit = 100) {
  if (d1(env)) {
    const rows = await d1All(
      env,
      "SELECT data FROM donor_offerings WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2",
      normalizeEmail(email),
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = donorOfferingKey(email, "");
  const keys = await listKvKeys(env, { prefix, limit });
  const offerings = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      offerings.push(JSON.parse(raw));
    } catch {
      // Ignore malformed donor offering records.
    }
  }
  return offerings.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function loadDonorCommemorations(env, email, limit = 100) {
  const normalized = normalizeEmail(email);
  if (d1(env)) {
    const rows = await d1All(
      env,
      "SELECT data FROM commemorations WHERE donor_email = ?1 ORDER BY created_at DESC LIMIT ?2",
      normalized,
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: Math.max(limit, 1000) });
  const entries = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) === normalized) entries.push(entry);
    } catch {
      // Ignore malformed commemoration records.
    }
  }
  return entries.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function paidOfferingStatus(offering = {}) {
  const status = String(offering.status || "").toLowerCase();
  const paymentStatus = String(offering.paymentStatus || "").toLowerCase();
  return status === "paid"
    || status === "completed"
    || paymentStatus === "paid"
    || paymentStatus === "succeeded";
}

function normalizedCheckoutPaymentStatus(session = {}, fallback = "pending") {
  if (session.payment_status === "paid" || session.status === "complete") return "paid";
  if (session.status === "expired") return session.payment_status || "unpaid";
  return session.payment_status || fallback || "pending";
}

function checkoutPaymentIntentId(session = {}) {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || "";
}

function stripeObjectId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id || "";
}

function stripeObjectMetadata(...objects) {
  return objects.reduce((metadata, object) => ({
    ...metadata,
    ...(object?.metadata || {})
  }), {});
}

function booleanFromStripeMetadata(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

async function stripePaymentIntentFinancialUpdates(env, paymentIntentId, parishId, fallback = {}) {
  if (!paymentIntentId || !parishId) return {};
  const parish = await findCheckoutParish(env, parishId);
  if (!parish?.stripeAccountId) return {};

  const paymentIntent = await stripeGetConnectedRequest(
    env,
    `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
    parish.stripeAccountId
  );
  if (!paymentIntent.ok) return {};

  const intent = paymentIntent.body || {};
  let charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const chargeId = stripeObjectId(intent.latest_charge);
  if (!charge && chargeId) {
    const chargeResult = await stripeGetConnectedRequest(
      env,
      `/v1/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
      parish.stripeAccountId
    );
    if (chargeResult.ok) charge = chargeResult.body || null;
  }

  const metadata = stripeObjectMetadata(fallback, intent, charge);
  const balanceTransaction = typeof charge?.balance_transaction === "object" ? charge.balance_transaction : null;
  const giftAmountCents = numericCents(metadata.amount_cents)
    || numericCents(fallback.giftAmountCents ?? fallback.amountCents)
    || numericCents(intent.amount_received || intent.amount);
  const chargeCents = numericCents(charge?.amount || intent.amount_received || intent.amount || fallback.chargeCents || giftAmountCents);
  const agapayFeeCents = numericCents(charge?.application_fee_amount ?? metadata.agapay_fee_cents ?? fallback.agapayFeeCents);
  const balanceFeeCents = numericCents(balanceTransaction?.fee);
  const stripeFeeCents = balanceFeeCents
    ? Math.max(0, balanceFeeCents - agapayFeeCents)
    : numericCents(fallback.stripeFeeCents ?? fallback.estimatedStripeFeeCents);
  const totalFeeCents = numericCents(balanceFeeCents || stripeFeeCents + agapayFeeCents);
  const coverFees = booleanFromStripeMetadata(metadata.cover_fees, fallback.coverFees);
  const donorCoveredFeeCents = coverFees ? Math.max(0, chargeCents - giftAmountCents) : 0;
  const balanceNetCents = numericCents(balanceTransaction?.net);
  const parishNetCents = balanceNetCents || Math.max(0, chargeCents - totalFeeCents);
  const paymentMethod = charge?.payment_method_details?.type || fallback.paymentMethod || "";

  return {
    amountCents: giftAmountCents,
    giftAmountCents,
    chargeCents,
    stripeFeeCents,
    estimatedStripeFeeCents: stripeFeeCents,
    agapayFeeCents,
    totalFeeCents,
    donorCoveredFeeCents,
    parishNetCents,
    coverFees,
    paymentMethod,
    stripeChargeId: charge?.id || fallback.stripeChargeId || "",
    stripeBalanceTransactionId: balanceTransaction?.id || fallback.stripeBalanceTransactionId || "",
    stripeFeeSource: balanceTransaction ? "balance_transaction" : "estimated",
    feeReconciledAt: new Date().toISOString()
  };
}

async function refreshDonorOfferingFromStripeCheckout(env, offering = {}) {
  if (!offering.checkoutSessionId || paidOfferingStatus(offering)) return offering;

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) return offering;

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(offering.checkoutSessionId)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) return offering;

  const session = stripe.body || {};
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || "checkout_created";
  if (paymentStatus === "paid" || session.status === "complete") status = "completed";
  if (session.status === "expired") status = "expired";
  const paymentIntentId = checkoutPaymentIntentId(session) || offering.stripePaymentIntentId || "";
  const feeUpdates = status === "completed" || paymentStatus === "paid"
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
    : {};

  const updated = await updateDonorOfferingByCheckout(env, offering.checkoutSessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || "",
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || "",
    completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
    ...feeUpdates
  });

  if (status === "completed" || paymentStatus === "paid") {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created ? new Date(session.created * 1000).toISOString() : offering.createdAt || new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updated || offering);
  }

  return updated || offering;
}

async function reconcilePendingDonorOfferings(env, offerings = [], limit = 8) {
  const reconciled = [];
  let checked = 0;

  for (const offering of offerings) {
    if (
      checked < limit
      && offering.checkoutSessionId
      && !paidOfferingStatus(offering)
      && !["failed", "expired", "cancelled", "refunded"].includes(String(offering.paymentStatus || offering.status || "").toLowerCase())
    ) {
      checked += 1;
      reconciled.push(await refreshDonorOfferingFromStripeCheckout(env, offering));
    } else {
      reconciled.push(offering);
    }
  }

  return reconciled.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function paidCommemorationOfferingWithNames(offering = {}) {
  const giftType = String(offering.giftType || "").toLowerCase();
  if (giftType !== "commemoration") return false;
  if (!paidOfferingStatus(offering)) return false;
  return Boolean(splitSubmittedNames(offering.namesLiving).length || splitSubmittedNames(offering.namesDeparted).length);
}

async function repairMissingDonorCommemorationsFromOfferings(env, email, offerings = []) {
  const paidCommemorations = offerings.filter(paidCommemorationOfferingWithNames);
  if (!paidCommemorations.length) return [];

  const existing = await loadDonorCommemorations(env, email, Math.max(1000, paidCommemorations.length + 100));
  const existingSources = new Set(existing.map((entry) => entry.sourceId || entry.id).filter(Boolean));
  const repaired = [];

  for (const offering of paidCommemorations) {
    const sourceId = commemorationSourceIdFromOffering(offering);
    if (existingSources.has(sourceId)) continue;
    const entry = await ensureCommemorationEntryFromOffering(env, offering, {
      id: sourceId,
      checkoutSessionId: offering.checkoutSessionId || "",
      parishId: offering.parishId || "",
      parishName: offering.parishName || "",
      donorEmail: offering.donorEmail || email || "",
      donorName: offering.donorName || "",
      giftType: "commemoration",
      frequency: offering.frequency || "once",
      amountCents: offering.amountCents || 0,
      namesLiving: offering.namesLiving || "",
      namesDeparted: offering.namesDeparted || "",
      createdAt: offering.completedAt || offering.createdAt || new Date().toISOString()
    });
    if (entry) {
      existingSources.add(entry.sourceId || entry.id);
      repaired.push(entry);
    }
  }

  return repaired;
}

async function loadReconciledDonorCommemorations(env, email, offerings = null, limit = 100) {
  const donorOfferings = offerings || await loadDonorOfferings(env, email, Math.max(limit, 100));
  await repairMissingDonorCommemorationsFromOfferings(env, email, donorOfferings);
  return loadDonorCommemorations(env, email, limit);
}

function donorSummaryFromOfferings(offerings, commemorations = []) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const ytd = offerings.filter((item) => new Date(item.createdAt || 0).getUTCFullYear() === year);
  const paid = ytd.filter(paidOfferingStatus);
  const recurring = offerings.filter((item) => item.frequency && item.frequency !== "once");
  const ytdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetYtdCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  const feeSavingsCents = paid.reduce((sum, item) => sum + offeringFeeBreakdown(item).donorCoveredFeeCents, 0);
  const feeCoveredCount = paid.filter((item) => offeringFeeBreakdown(item).coverFees).length;
  const monthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).giftAmountCents, 0);
  const parishNetMonthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + offeringFeeBreakdown(item).parishNetCents, 0);
  return {
    year,
    ytdCents,
    monthCents,
    parishNetYtdCents,
    parishNetMonthCents,
    feeSavingsCents,
    feeCoveragePercent: paid.length ? Math.round((feeCoveredCount / paid.length) * 100) : 0,
    offeringCount: ytd.length,
    paidOfferingCount: paid.length,
    recurringCount: recurring.length,
    commemorationCount: commemorations.reduce((sum, entry) => sum + (entry.living?.length || 0) + (entry.departed?.length || 0), 0),
    lastOfferingAt: offerings[0]?.createdAt || ""
  };
}

function publicDonorOffering(offering = {}) {
  const fees = offeringFeeBreakdown(offering);
  return {
    ...offering,
    amountCents: fees.giftAmountCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees
  };
}


function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeJurisdiction(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("rocor") || normalized.includes("russian orthodox church outside russia")) return "rocor";
  if (normalized.includes("orthodox church in america") || normalized === "oca") return "oca";
  if (normalized.includes("antiochian")) return "antiochian";
  if (normalized.includes("greek") || normalized.includes("goa")) return "goa";
  if (normalized.includes("serbian")) return "serbian";
  if (normalized.includes("romanian")) return "romanian";
  if (normalized.includes("bulgarian")) return "bulgarian";
  if (normalized.includes("ukrainian")) return "ukrainian";
  return slugify(value || "other");
}

function communitySketchImage(type) {
  if (type === "monastery") return "/images/giving/monastery-square.png";
  if (type === "mission") return "/images/giving/mission-church-square.png";
  return "/images/giving/parish-church-square.png";
}

function communitySketchAlt(type) {
  if (type === "monastery") return "Orthodox monastery sketch";
  if (type === "mission") return "Orthodox mission church sketch";
  return "Orthodox parish church sketch";
}

function parishFromRegistration(registration) {
  if (!registration) return null;
  const id = registration.parishId || slugify(registration.parishName);
  if (!id || registration.status !== "verified") return null;
  if (registration.givingStatus && registration.givingStatus !== "active") return null;
  const type = normalizeCommunityType(registration.communityType);

  return {
    id,
    name: registration.parishName,
    type,
    jurisdiction: normalizeJurisdiction(registration.jurisdiction || "other"),
    jurisdictionLabel: registration.jurisdiction || "Other canonical jurisdiction",
    city: registration.city || "",
    state: registration.state || "",
    status: "verified",
    givingStatus: registration.givingStatus || "active",
    source: "registration",
    imageUrl: registration.imageUrl || registration.photoUrl || communitySketchImage(type),
    imageAlt: registration.imageAlt || communitySketchAlt(type),
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    candlesEnabled: registration.candlesEnabled ?? true,
    commemorationsEnabled: registration.commemorationsEnabled ?? true,
    funds: Array.isArray(registration.funds) && registration.funds.length ? registration.funds : [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ],
    campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
}

function normalizeCommunityType(value) {
  const normalized = String(value || "parish").toLowerCase();
  if (normalized.includes("monastery") || normalized.includes("skete")) return "monastery";
  if (normalized.includes("mission")) return "mission";
  return "parish";
}

async function saveRegistrationRecord(env, reference, registration, previous = null) {
  if (!reference) return registration;
  const parishId = registration.parishId || slugify(registration.parishName);
  const previousParishId = previous ? previous.parishId || slugify(previous.parishName) : "";

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO registrations (
        reference, parish_id, status, parish_name, community_type,
        stripe_account_id, stripe_subscription_id, received_at, updated_at, data
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(reference) DO UPDATE SET
         parish_id = excluded.parish_id,
         status = excluded.status,
         parish_name = excluded.parish_name,
         community_type = excluded.community_type,
         stripe_account_id = excluded.stripe_account_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         received_at = excluded.received_at,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      reference,
      parishId,
      registration.status || "pending",
      registration.parishName || "",
      registration.communityType || "",
      registration.stripeAccountId || "",
      registration.stripeSubscriptionId || "",
      registration.receivedAt || "",
      registration.reviewedAt || registration.parishUpdatedAt || registration.subscriptionUpdatedAt || new Date().toISOString(),
      JSON.stringify(registration)
    );
    return registration;
  }

  if (hasProductionStore(env)) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
    if (parishId) await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), reference);
    if (previousParishId && previousParishId !== parishId) await env.AGAPAY_REGISTRATIONS.delete(parishIdIndexKey(previousParishId));

    if (registration.stripeAccountId) await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(registration.stripeAccountId), reference);
    if (previous?.stripeAccountId && previous.stripeAccountId !== registration.stripeAccountId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeAccountIndexKey(previous.stripeAccountId));
    }

    if (registration.stripeSubscriptionId) await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(registration.stripeSubscriptionId), reference);
    if (previous?.stripeSubscriptionId && previous.stripeSubscriptionId !== registration.stripeSubscriptionId) {
      await env.AGAPAY_REGISTRATIONS.delete(stripeSubscriptionIndexKey(previous.stripeSubscriptionId));
    }
  }

  return registration;
}

async function loadIndexedRegistration(env, indexKey) {
  if (!env.AGAPAY_REGISTRATIONS || !indexKey) return null;
  const reference = await env.AGAPAY_REGISTRATIONS.get(indexKey);
  if (!reference) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  try {
    return { key: reference, registration: JSON.parse(raw) };
  } catch {
    return null;
  }
}

async function loadRegistrationByReference(env, reference) {
  if (!reference) return null;

  if (d1(env)) {
    const row = await d1First(env, "SELECT data FROM registrations WHERE reference = ?1", reference);
    const registration = parseJsonRow(row);
    if (registration) return registration;
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  const registration = JSON.parse(raw);
  if (d1(env)) await saveRegistrationRecord(env, reference, registration);
  return registration;
}

async function loadVerifiedRegistrationParishPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const query = String(options.query || options.q || "").trim().toLowerCase();
  const type = String(options.type || "").trim().toLowerCase();
  const jurisdiction = String(options.jurisdiction || "").trim().toLowerCase();

  if (d1(env)) {
    const where = ["status = 'verified'"];
    const params = [];

    if (cursor) {
      where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }
    if (type) {
      where.push("LOWER(COALESCE(json_extract(data, '$.communityType'), '')) LIKE ?");
      params.push(`%${type}%`);
    }
    if (jurisdiction) {
      where.push("LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?");
      params.push(`%${jurisdiction}%`);
    }

    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       WHERE ${where.join(" AND ")}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const parishes = pageRows
      .map(safeParseJsonRow)
      .map(parishFromRegistration)
      .filter(Boolean);
    return {
      parishes,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { parishes: [], cursor: null, hasMore: false, limit, source: "none" };

  const keys = await listKvKeys(env, { limit });
  const verified = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const parish = parishFromRegistration(JSON.parse(raw));
      if (parish) verified.push(parish);
    } catch {
      // Ignore malformed registration records in the public parish directory.
    }
  }

  return { parishes: verified, cursor: null, hasMore: false, limit, source: "kv" };
}

async function verifiedRegistrationParishes(env, options = {}) {
  const page = await loadVerifiedRegistrationParishPage(env, options);
  return page.parishes;
}

async function findRegistrationByParishId(env, parishId) {
  if (d1(env)) {
    const row = await d1First(env, "SELECT reference, data FROM registrations WHERE parish_id = ?1 LIMIT 1", parishId);
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, parishIdIndexKey(parishId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      const currentParishId = registration.parishId || slugify(registration.parishName);
      if (currentParishId === parishId) {
        await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(parishId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records while searching.
    }
  }

  return null;
}

async function findRegistrationByStripeSubscriptionId(env, subscriptionId) {
  if (!subscriptionId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT reference, data FROM registrations WHERE stripe_subscription_id = ?1 LIMIT 1", subscriptionId);
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeSubscriptionIndexKey(subscriptionId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeSubscriptionId === subscriptionId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeSubscriptionIndexKey(subscriptionId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

async function findRegistrationByStripeAccountId(env, stripeAccountId) {
  if (!stripeAccountId) return null;
  if (d1(env)) {
    const row = await d1First(env, "SELECT reference, data FROM registrations WHERE stripe_account_id = ?1 LIMIT 1", stripeAccountId);
    const registration = parseJsonRow(row);
    if (registration) return { key: row.reference, registration };
  }

  if (!env.AGAPAY_REGISTRATIONS) return null;
  const indexed = await loadIndexedRegistration(env, stripeAccountIndexKey(stripeAccountId));
  if (indexed) return indexed;

  const keys = await listKvKeys(env, { limit: 1000 });
  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeAccountId === stripeAccountId) {
        await env.AGAPAY_REGISTRATIONS.put(stripeAccountIndexKey(stripeAccountId), key.name);
        return { key: key.name, registration };
      }
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

async function findCheckoutParish(env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;

  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;

  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || ""
  };
}

async function findOrCreateDonorCustomer(env, parish, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const name = donorName(body);
  const stripeAccountId = parish.stripeAccountId || "";

  const customerPath = `/v1/customers?email=${encodeURIComponent(email)}&limit=1`;
  const lookup = stripeAccountId
    ? await stripeGetConnectedRequest(env, customerPath, stripeAccountId)
    : await stripeGetRequest(env, customerPath);

  if (!lookup.ok) return lookup;

  const existing = Array.isArray(lookup.body.data)
    ? lookup.body.data.find((customer) => !customer.deleted)
    : null;
  if (existing?.id) return { ok: true, body: existing };

  const customerForm = new URLSearchParams({
    email,
    name,
    "metadata[agapay_parish_id]": parish.id,
    "metadata[agapay_parish_name]": parish.name || "",
    "metadata[agapay_donor_first_name]": body.firstName || "",
    "metadata[agapay_donor_last_name]": body.lastName || ""
  });

  return stripeFormConnectedRequest(env, "/v1/customers", customerForm, stripeAccountId);
}

function paidOffering(offering) {
  return paidOfferingStatus(offering);
}

function giftDisplayName(offering = {}) {
  const pieces = [offering.firstName, offering.lastName].filter(Boolean);
  return pieces.join(" ").trim() || offering.donorName || "";
}

function publicParishGiftFromOffering(offering = {}) {
  const living = Array.isArray(offering.living)
    ? offering.living
    : String(offering.namesLiving || "").split(/\n+/).map((name) => name.trim()).filter(Boolean);
  const departed = Array.isArray(offering.departed)
    ? offering.departed
    : String(offering.namesDeparted || "").split(/\n+/).map((name) => name.trim()).filter(Boolean);
  const fees = offeringFeeBreakdown(offering);
  return {
    id: offering.id || offering.checkoutSessionId || offering.paymentIntentId || "",
    date: offering.createdAt || offering.paidAt || offering.updatedAt || "",
    createdAt: offering.createdAt || offering.paidAt || offering.updatedAt || "",
    amountCents: fees.parishNetCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    donorName: giftDisplayName(offering),
    donorEmail: offering.email || offering.donorEmail || "",
    fund: offering.fund || offering.fundId || (offering.giftType === "stewardship" ? "General Operating Fund" : ""),
    fundId: offering.fundId || offering.fund || "",
    campaign: offering.campaign || offering.campaignId || "",
    campaignId: offering.campaignId || offering.campaign || "",
    description: offering.description || offering.campaignDescription || offering.inMemoriam || "",
    giftType: offering.giftType || "offering",
    frequency: offering.frequency || "once",
    recurring: Boolean(offering.frequency && offering.frequency !== "once"),
    type: offering.frequency && offering.frequency !== "once" ? "recurring" : "one_time",
    commemorationNames: [...living, ...departed]
  };
}

async function loadParishPaidOfferings(env, parishId, limit = 500) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT data
       FROM donor_offerings
       WHERE parish_id = ?1
         AND (payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'completed'))
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean).filter(paidOffering).map(publicParishGiftFromOffering);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const gifts = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if ((offering.parishId || offering.parish_id) === parishId && paidOffering(offering)) {
        gifts.push(publicParishGiftFromOffering(offering));
      }
    } catch {}
  }
  return gifts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

function recurringOfferingStatus(offering = {}) {
  const status = String(offering.status || "").toLowerCase();
  const paymentStatus = String(offering.paymentStatus || "").toLowerCase();
  if (["failed", "payment_failed", "past_due"].includes(status) || ["failed", "past_due"].includes(paymentStatus)) return "failed";
  if (["cancelled", "canceled"].includes(status) || ["cancelled", "canceled"].includes(paymentStatus)) return "cancelled";
  if (paidOfferingStatus(offering)) return "active";
  return "pending";
}

function recurringHealthGroupKey(offering = {}) {
  return offering.stripeSubscriptionId
    || offering.stripe_subscription_id
    || [
      normalizeEmail(offering.donorEmail || offering.email || ""),
      offering.frequency || "recurring",
      offering.amountCents || "",
      offering.giftType || "",
      offering.fund || "",
      offering.campaign || ""
    ].join("|");
}

function recurringExpectedDays(frequency = "") {
  const normalized = String(frequency || "").toLowerCase();
  if (normalized === "weekly") return 10;
  if (normalized === "biweekly") return 24;
  if (normalized === "quarterly") return 110;
  if (normalized === "yearly" || normalized === "annual") return 400;
  return 45;
}

async function loadParishRecurringOfferings(env, parishId, limit = 1000) {
  if (!parishId) return [];
  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT data
       FROM donor_offerings
       WHERE parish_id = ?1
         AND (
           COALESCE(stripe_subscription_id, '') != ''
           OR COALESCE(json_extract(data, '$.frequency'), 'once') != 'once'
         )
       ORDER BY created_at DESC
       LIMIT ?2`,
      parishId,
      limit
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: Math.min(limit, 5000) });
  const offerings = [];
  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (
        (offering.parishId || offering.parish_id) === parishId
        && (offering.stripeSubscriptionId || (offering.frequency && offering.frequency !== "once"))
      ) {
        offerings.push(offering);
      }
    } catch {}
  }
  return offerings.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit);
}

function summarizeParishRecurringHealth(records = []) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const groups = new Map();

  for (const offering of records) {
    const key = recurringHealthGroupKey(offering);
    if (!key) continue;
    const status = recurringOfferingStatus(offering);
    const dateValue = offering.completedAt || offering.failedAt || offering.updatedAt || offering.createdAt || "";
    const timestamp = dateValue ? new Date(dateValue) : null;
    const group = groups.get(key) || {
      key,
      donorName: giftDisplayName(offering) || offering.donorName || "Anonymous donor",
      donorEmail: offering.donorEmail || offering.email || "",
      amountCents: Number(offering.amountCents || 0),
      frequency: offering.frequency || "recurring",
      giftType: offering.giftType || "recurring",
      fund: offering.fund || offering.campaign || offering.title || "",
      stripeSubscriptionId: offering.stripeSubscriptionId || "",
      lastPaidAt: "",
      lastFailureAt: "",
      failureMessage: ""
    };

    if (!group.stripeSubscriptionId && offering.stripeSubscriptionId) group.stripeSubscriptionId = offering.stripeSubscriptionId;
    if (!group.donorEmail && offering.donorEmail) group.donorEmail = offering.donorEmail;
    if (!group.fund && (offering.fund || offering.campaign || offering.title)) group.fund = offering.fund || offering.campaign || offering.title;
    if (!group.amountCents && offering.amountCents) group.amountCents = Number(offering.amountCents || 0);

    if (status === "active" && timestamp && (!group.lastPaidAt || timestamp > new Date(group.lastPaidAt))) {
      group.lastPaidAt = timestamp.toISOString();
      group.amountCents = Number(offering.amountCents || group.amountCents || 0);
    }
    if ((status === "failed" || status === "cancelled") && timestamp && (!group.lastFailureAt || timestamp > new Date(group.lastFailureAt))) {
      group.lastFailureAt = timestamp.toISOString();
      group.failureMessage = offering.failureMessage || (status === "cancelled" ? "Recurring gift cancelled." : "Recurring payment failed.");
    }

    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).map((group) => {
    const paidAt = group.lastPaidAt ? new Date(group.lastPaidAt) : null;
    const failureAt = group.lastFailureAt ? new Date(group.lastFailureAt) : null;
    const expectedDays = recurringExpectedDays(group.frequency);
    const daysSincePaid = paidAt ? Math.floor((now.getTime() - paidAt.getTime()) / 86400000) : null;
    const recoveredAfterFailure = Boolean(paidAt && failureAt && paidAt > failureAt);
    const failedThisMonth = Boolean(failureAt && failureAt >= monthStart && !recoveredAfterFailure);
    const lapsed = Boolean(!failedThisMonth && (!paidAt || daysSincePaid > expectedDays));
    return {
      ...group,
      status: failedThisMonth ? "failed" : lapsed ? "lapsed" : "active",
      daysSincePaid,
      expectedDays
    };
  });

  rows.sort((a, b) => {
    const order = { failed: 0, lapsed: 1, active: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      || String(b.lastFailureAt || b.lastPaidAt || "").localeCompare(String(a.lastFailureAt || a.lastPaidAt || ""));
  });

  return {
    activeCount: rows.filter((row) => row.status === "active").length,
    failedThisMonthCount: rows.filter((row) => row.status === "failed").length,
    lapsedCount: rows.filter((row) => row.status === "lapsed").length,
    monthlyRecurringCents: rows
      .filter((row) => row.status === "active")
      .reduce((sum, row) => sum + Number(row.amountCents || 0), 0),
    generatedAt: now.toISOString(),
    rows
  };
}

function normalizedOptionKeys(option = {}) {
  return [option.id, option.feastId, option.name, option.campaignName, option.title]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
}

function campaignRaisedTotals(campaign, gifts) {
  const keys = new Set(normalizedOptionKeys(campaign));
  let raisedCents = 0;
  let giftCount = 0;
  gifts.forEach((gift) => {
    const giftKeys = normalizedOptionKeys({
      id: gift.campaignId,
      name: gift.campaign,
      campaignName: gift.description,
      title: gift.giftType === "campaign" ? gift.fund : ""
    });
    if (gift.giftType === "campaign" && giftKeys.some((key) => keys.has(key))) {
      raisedCents += Number(gift.amountCents || 0);
      giftCount += 1;
    }
  });
  return { raisedCents, giftCount };
}

async function enrichParishGivingOptions(env, parish) {
  if (!parish?.id) return parish;
  const gifts = await loadParishPaidOfferings(env, parish.id, 1000);
  const enrichCampaign = (campaign) => {
    const totals = campaignRaisedTotals(campaign, gifts);
    return {
      ...campaign,
      name: campaign.name || campaign.campaignName || "Parish Alms Campaign",
      goalCents: Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0),
      raisedCents: totals.raisedCents,
      giftCount: totals.giftCount
    };
  };
  return {
    ...parish,
    campaigns: (parish.campaigns || []).map(enrichCampaign),
    feastCampaigns: (parish.feastCampaigns || []).map(enrichCampaign)
  };
}

async function handleParishes(request, env) {
  const url = new URL(request.url);
  const page = await loadVerifiedRegistrationParishPage(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    q: url.searchParams.get("q") || url.searchParams.get("search"),
    type: url.searchParams.get("type"),
    jurisdiction: url.searchParams.get("jurisdiction")
  });
  const enrichedParishes = await Promise.all(page.parishes.map((parish) => enrichParishGivingOptions(env, parish)));

  return json({
    parishes: enrichedParishes,
    cursor: page.cursor,
    hasMore: page.hasMore,
    limit: page.limit,
    source: page.source
  });
}

async function loadPaidDonorOfferingPlatformTotals(env) {
  if (d1(env)) {
    const row = await d1First(
      env,
      `SELECT
         COUNT(*) AS gift_count,
         COALESCE(SUM(CAST(json_extract(data, '$.amountCents') AS INTEGER)), 0) AS total_given_cents
       FROM donor_offerings
       WHERE payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'completed')`
    );
    return {
      giftCount: Number(row?.gift_count || 0),
      totalGivenCents: Number(row?.total_given_cents || 0)
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { giftCount: 0, totalGivenCents: 0 };
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: 5000 });
  let giftCount = 0;
  let totalGivenCents = 0;

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (paidOfferingStatus(offering)) {
        giftCount += 1;
        totalGivenCents += Number(offering.amountCents || 0);
      }
    } catch {
      // Ignore malformed donation records in public aggregate totals.
    }
  }

  return { giftCount, totalGivenCents };
}

async function handlePublicPlatformSummary(env) {
  if (!hasProductionStore(env)) {
    return json({
      summary: {
        organizationsSupported: 0,
        activeCampaigns: 0,
        totalGivenCents: 0,
        giftCount: 0,
        dataSource: "not_configured",
        generatedAt: new Date().toISOString()
      }
    });
  }

  const verifiedRegistrations = await loadAllRegistrations(env, { status: "verified" });
  const parishes = verifiedRegistrations.map(parishFromRegistration).filter(Boolean);
  const donationTotals = await loadPaidDonorOfferingPlatformTotals(env);
  const activeCampaigns = parishes.reduce((total, parish) => {
    const campaigns = Array.isArray(parish.campaigns) ? parish.campaigns : [];
    return total + campaigns.filter((campaign) => campaign && campaign.active !== false && campaign.hidden !== true).length;
  }, 0);

  return json({
    summary: {
      organizationsSupported: parishes.length,
      activeCampaigns,
      totalGivenCents: donationTotals.totalGivenCents,
      giftCount: donationTotals.giftCount,
      dataSource: d1(env) ? "d1" : "kv",
      generatedAt: new Date().toISOString()
    }
  });
}

function registrationRequiresJurisdiction(type) {
  return ["Mission", "Parish", "Cathedral", "Monastery / Skete"].includes(String(type || ""));
}

function registrationRequiresValuesReview(type) {
  return ["Business", "Ministry / Nonprofit", "School / Academy", "Other Orthodox Organization"].includes(String(type || ""));
}

function registrationRequiresWebsite(type) {
  return String(type || "") === "Business";
}

async function handleRegistrations(request, env) {
  const limited = await rateLimit(request, env, "registrations", { limit: 6, windowSeconds: 600 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const requiredFields = [
    "communityType",
    "parishName",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "priestFirst",
    "priestEmail",
    "priestPhone",
    "treasurerFirst",
    "treasurerEmail"
  ];

  if (registrationRequiresJurisdiction(body.communityType)) requiredFields.push("jurisdiction");
  if (registrationRequiresWebsite(body.communityType)) requiredFields.push("website");
  if (registrationRequiresValuesReview(body.communityType)) requiredFields.push("organizationDescription");

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@")) {
    return json({ error: "A valid primary contact and finance contact email are required" }, { status: 422 });
  }

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`;
  const subscriptionTierId = body.subscriptionTier || defaultSubscriptionTier(body);
  const tier = subscriptionTier(subscriptionTierId) || subscriptionTier(defaultSubscriptionTier(body));
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body,
    subscriptionTier: tier?.id || "parish",
    subscriptionStatus: tier?.monthlyCents === 0 ? "free_forever" : "not_started",
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || ""
  };

  if (env.AGAPAY_REGISTRATIONS) {
    await saveRegistrationRecord(env, reference, registration);
    const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
    const notice = await sendAdminRegistrationNotice(env, appUrl, registration);
    await saveRegistrationRecord(env, reference, {
      ...registration,
      adminNotificationEmailStatus: notice.status,
      adminNotificationEmailId: notice.id || "",
      adminNotificationEmailDetail: notice.detail || "",
      adminNotificationEmailSentAt: notice.status === "sent" ? new Date().toISOString() : ""
    }, registration);
  }

  return json(
    {
      ok: true,
      reference,
      mode: hasProductionStore(env) ? "stored" : "demo",
      message: "Registration received. AGAPAY will review the organization before activation."
    },
    { status: 201 }
  );
}

async function handleCheckout(request, env) {
  const limited = await rateLimit(request, env, "checkout", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const missing = requireFields(body, ["parishId", "giftType", "amount", "firstName", "email"]);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return json({ error: "Amount must be greater than zero" }, { status: 422 });

  const parish = await findCheckoutParish(env, body.parishId);
  if (!parish || parish.status !== "verified") return json({ error: "Verified parish not found" }, { status: 404 });

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      mode: "demo",
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions."
    });
  }

  if (!parish.stripeAccountId) {
    return json(
      { error: "Parish Stripe account is not connected yet", detail: "This parish needs to complete Stripe onboarding before it can receive donations." },
      { status: 422 }
    );
  }

  const recurring = body.frequency && body.frequency !== "once";
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const normalizedDonorEmail = normalizeEmail(body.email);
  const donor = await requireDonor(request, env);
  const donorDashboardReturn = Boolean(donor?.email && normalizeEmail(donor.email) === normalizedDonorEmail);
  const successUrl = donorDashboardReturn
    ? `${appUrl}/donor?gift_success=1&session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = donorDashboardReturn
    ? `${appUrl}/donor/give?checkout_canceled=1`
    : `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&canceled=1`;
  const {
    chargeCents,
    estimatedStripeFeeCents,
    agapayFeeCents,
    totalTransactionFeeCents,
    paymentMethod
  } = checkoutFinancials(amountCents, Boolean(body.coverFees), recurring, body.paymentMethod);
  const giftLabel = String(body.giftType).replace(/-/g, " ");
  const normalizedDonorName = donorName(body);
  const customer = await findOrCreateDonorCustomer(env, parish, body);
  if (!customer.ok) {
    return json(
      { error: "Stripe customer setup failed", detail: customer.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const checkoutMetadata = {
    parish_id: parish.id,
    parish_name: parish.name || "",
    stripe_customer_id: customer.body.id || "",
    donor_email: normalizedDonorEmail,
    donor_name: normalizedDonorName,
    donor_first_name: body.firstName || "",
    donor_last_name: body.lastName || "",
    gift_type: body.giftType,
    fund: body.fund || "",
    feast_description: body.feastDescription || "",
    in_memoriam: body.inMemoriam || "",
    campaign: body.campaign || "",
    campaign_description: body.campaignDescription || "",
    frequency: body.frequency || "once",
    amount_cents: String(amountCents),
    charge_cents: String(chargeCents),
    agapay_fee_cents: String(agapayFeeCents),
    estimated_stripe_fee_cents: String(estimatedStripeFeeCents),
    total_fee_cents: String(totalTransactionFeeCents),
    payment_method: paymentMethod,
    cover_fees: body.coverFees ? "true" : "false",
    names_living: body.namesLiving || "",
    names_departed: body.namesDeparted || ""
  };

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customer.body.id,
    billing_address_collection: "required",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  });

  form.set("payment_method_types[0]", paymentMethod === "ach" ? "us_bank_account" : "card");

  for (const [key, value] of Object.entries(checkoutMetadata)) {
    form.set(`metadata[${key}]`, value);
    if (recurring) {
      form.set(`subscription_data[metadata][${key}]`, value);
    } else {
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }
  }

  // AGAPAY's 5% + $0.30 fee applies to donations, including recurring
  // donations. Parish SaaS subscription billing is created in a separate flow
  // and does not use this donation application-fee logic.
  if (recurring && agapayFeeCents > 0 && chargeCents > 0) {
    form.set("subscription_data[application_fee_percent]", ((agapayFeeCents / chargeCents) * 100).toFixed(4));
  } else if (!recurring) {
    form.set("payment_intent_data[application_fee_amount]", String(agapayFeeCents));
  }

  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", body.frequency === "weekly" || body.frequency === "biweekly" ? "week" : "month");
    if (body.frequency === "biweekly") form.set("line_items[0][price_data][recurring][interval_count]", "2");
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (parish.stripeAccountId) headers["Stripe-Account"] = parish.stripeAccountId;

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: form
  });
  const stripeBody = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return json(
      { error: "Stripe checkout session failed", detail: stripeBody.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  await storeDonorOffering(env, {
    id: stripeBody.id,
    donorEmail: normalizedDonorEmail,
    donorName: normalizedDonorName,
    parishId: parish.id,
    parishName: parish.name,
    giftType: body.giftType,
    title: `${parish.name} - ${giftLabel}`,
    fund: body.fund || "",
    campaign: body.campaign || "",
    feastDescription: body.feastDescription || "",
    inMemoriam: body.inMemoriam || "",
    frequency: body.frequency || "once",
    amountCents,
    chargeCents,
    agapayFeeCents,
    estimatedStripeFeeCents,
    paymentMethod,
    coverFees: Boolean(body.coverFees),
    status: "checkout_created",
    paymentStatus: "pending",
    checkoutSessionId: stripeBody.id,
    checkoutUrl: stripeBody.url || "",
    stripeCustomerId: customer.body.id || "",
    namesLiving: body.namesLiving || "",
    namesDeparted: body.namesDeparted || ""
  });

  return json({ id: stripeBody.id, url: stripeBody.url }, { status: 201 });
}

async function handleCheckoutSessionStatus(request, env) {
  const limited = await rateLimit(request, env, "checkout-status", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;

  const url = new URL(request.url);
  let sessionId = url.searchParams.get("session_id") || "";
  if (!sessionId && request.method === "POST") {
    try {
      const body = await request.json();
      sessionId = body.sessionId || body.session_id || "";
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  sessionId = String(sessionId || "").trim();
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json({ error: "Missing checkout session id" }, { status: 422 });
  }

  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) {
    return json({ error: "Checkout session is not tracked by AGAPAY" }, { status: 404 });
  }

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: "Parish Stripe account is not connected yet" }, { status: 422 });
  }

  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (!stripe.ok) {
    return json(
      { error: "Unable to verify checkout session", detail: stripe.body.error?.message || "Stripe rejected the lookup" },
      { status: 502 }
    );
  }

  const session = stripe.body || {};
  const paymentIntentId = checkoutPaymentIntentId(session);
  const paymentStatus = normalizedCheckoutPaymentStatus(session, offering.paymentStatus);
  let status = offering.status || "checkout_created";
  if (paymentStatus === "paid" || session.status === "complete") status = "completed";
  if (session.status === "expired") status = "expired";
  const feeUpdates = status === "completed" || paymentStatus === "paid"
    ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
    : {};

  const updated = await updateDonorOfferingByCheckout(env, sessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || "",
    stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || "",
    completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
    ...feeUpdates
  });
  if (status === "completed" || paymentStatus === "paid") {
    await ensureCommemorationEntryFromOffering(env, updated || offering, {
      createdAt: session.created ? new Date(session.created * 1000).toISOString() : offering.createdAt || new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updated || {});
  }

  return json({
    ok: true,
    checkoutSessionId: sessionId,
    status: updated?.status || status,
    paymentStatus: updated?.paymentStatus || paymentStatus,
    paymentIntentId: updated?.stripePaymentIntentId || paymentIntentId || ""
  });
}

async function handleDonorClaimCheckout(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-claim-checkout", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = String(body.sessionId || body.session_id || "").trim();
  const password = String(body.password || "");
  if (!sessionId.startsWith("cs_")) return json({ error: "A valid checkout session is required" }, { status: 422 });
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });

  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) return json({ error: "Checkout session is not tracked by AGAPAY" }, { status: 404 });

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: "Parish Stripe account is not connected yet" }, { status: 422 });
  }

  let verifiedSession = null;
  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (stripe.ok) {
    verifiedSession = stripe.body || {};
    const paymentIntentId = checkoutPaymentIntentId(verifiedSession);
    const paymentStatus = normalizedCheckoutPaymentStatus(verifiedSession, offering.paymentStatus);
    let status = offering.status || "checkout_created";
    if (paymentStatus === "paid" || verifiedSession.status === "complete") status = "completed";
    if (verifiedSession.status === "expired") status = "expired";
    const feeUpdates = status === "completed" || paymentStatus === "paid"
      ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
      : {};
    await updateDonorOfferingByCheckout(env, sessionId, {
      status,
      paymentStatus,
      stripeCustomerId: verifiedSession.customer || offering.stripeCustomerId || "",
      stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
      stripeSubscriptionId: verifiedSession.subscription || offering.stripeSubscriptionId || "",
      completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
      ...feeUpdates
    });
  }

  const refreshed = await loadDonorOfferingByCheckout(env, sessionId) || offering;
  const isPaid = refreshed.status === "completed" || refreshed.paymentStatus === "paid" || refreshed.paymentStatus === "succeeded";
  if (!isPaid) {
    return json({ error: "Payment is still processing. Please wait and try again in a moment." }, { status: 409 });
  }

  const donorEmail = normalizeEmail(
    refreshed.donorEmail
      || verifiedSession?.customer_details?.email
      || verifiedSession?.customer_email
      || ""
  );
  if (!donorEmail) return json({ error: "A donor email is required before creating an account." }, { status: 422 });

  const existing = await loadDonor(env, donorEmail);
  if (existing?.emailVerifiedAt) {
    return json({
      error: "A donor account already exists for this email. Please log in from the donor sign-in page.",
      code: "account_exists"
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const donorNameValue = String(
    body.donorName
    || body.householdName
    || refreshed.donorName
    || existing?.donorName
    || donorEmail.split("@")[0]
  ).trim();

  const donorBase = {
    ...(existing || {}),
    email: donorEmail,
    donorName: donorNameValue,
    householdName: donorNameValue,
    defaultParishId: refreshed.parishId || existing?.defaultParishId || "",
    emailVerifiedAt: now,
    emailVerificationSalt: "",
    emailVerificationTokenHash: "",
    emailVerificationSentAt: "",
    emailVerificationExpiresAt: "",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const donor = await applyDonorPassword(donorBase, password);
  const session = await issueDonorSession(env, donor);

  return json({
    ok: true,
    token: session.token,
    donor: publicDonor(session.donor),
    checkoutSessionId: sessionId,
    status: refreshed.status || "completed",
    paymentStatus: refreshed.paymentStatus || "paid"
  });
}

async function handleDonorSession(request, env) {
  return handleDonorLogin(request, env);
}

async function issueDonorSession(env, donor) {
  const token = generateSecret("agp_donor");
  const sessionSalt = generateSecret("session");
  const updated = {
    ...donor,
    sessionSalt,
    sessionTokenHash: await hashSessionToken(token, sessionSalt),
    sessionExpiresAt: new Date(Date.now() + DONOR_SESSION_TTL_MS).toISOString(),
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveDonor(env, updated);
  return { token, donor: updated };
}

async function sendDonorVerificationEmail(env, donor, verificationUrl) {
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const safeUrl = htmlEscape(verificationUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || "friend");

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: "Verify your AGAPAY donor account",
    html: agapayEmailHtml(appUrl, "Verify your donor account", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Hello ${name}, please verify your email address to finish setting up your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Verify email address</a></p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;">After verification, you can sign in to your donor dashboard to view offering history, submit commemorations, and give through AGAPAY.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not create this AGAPAY account, you can ignore this email.</p>
    `)
  });
}

async function sendDonorPasswordResetEmail(env, donor, resetUrl) {
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const safeUrl = htmlEscape(resetUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || "friend");

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: "Reset your AGAPAY donor password",
    html: agapayEmailHtml(appUrl, "Reset your donor password", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${name}.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Use this secure link to choose a new password for your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset donor password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `),
    text: [
      "Reset your AGAPAY donor password",
      "",
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "If you did not request this, ignore this email. The link expires in 1 hour."
    ].join("\n")
  });
}

async function handleDonorPasswordResetRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-password-reset-request", { limit: 6, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "Email is required" }, { status: 422 });

  const generic = { ok: true, message: "If a verified donor account exists for that email, a reset link has been sent." };
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return json(generic);

  const resetToken = generateSecret("donor_reset");
  const resetSalt = generateSecret("donor_reset_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, "")}/donor/login?reset=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...donor,
    passwordResetSalt: resetSalt,
    passwordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    passwordResetSentAt: new Date().toISOString(),
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  };

  const emailResult = await sendDonorPasswordResetEmail(env, updated, resetUrl);
  updated.passwordResetEmailStatus = emailResult.status || "";
  updated.passwordResetEmailDetail = emailResult.detail || "";
  await saveDonor(env, updated);

  return json({
    ...generic,
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    resetUrl: emailResult.status === "not_configured" ? resetUrl : undefined
  });
}

async function handleDonorPasswordResetConfirm(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-password-reset-confirm", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const token = String(body.token || "");
  const newPassword = String(body.newPassword || body.password || "").trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || "").trim();
  if (!email || !token) return json({ error: "Email and reset token are required" }, { status: 422 });
  if (newPassword.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: "Passwords do not match" }, { status: 422 });

  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return unauthorized();
  if (!donor.passwordResetSalt || !donor.passwordResetTokenHash) {
    return json({ error: "Reset link is missing or expired. Please request a new link." }, { status: 410 });
  }
  if (donor.passwordResetExpiresAt && new Date(donor.passwordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: "Reset link expired. Please request a new link." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.passwordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.passwordResetTokenHash)) return unauthorized();

  const reset = await applyDonorPassword({
    ...donor,
    passwordResetSalt: "",
    passwordResetTokenHash: "",
    passwordResetSentAt: "",
    passwordResetExpiresAt: "",
    passwordResetEmailStatus: "",
    passwordResetEmailDetail: "",
    sessionSalt: "",
    sessionTokenHash: "",
    sessionExpiresAt: "",
    updatedAt: new Date().toISOString()
  }, newPassword);
  await saveDonor(env, reset);
  return json({ ok: true, updatedAt: reset.passwordUpdatedAt || new Date().toISOString() });
}

function formatUsdFromCents(centsValue) {
  return (Number(centsValue || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

function offeringLabel(offering = {}) {
  if (offering.title) return String(offering.title);
  const giftType = String(offering.giftType || "offering").replace(/-/g, " ");
  const parishName = offering.parishName || "your parish";
  return `${parishName} - ${giftType}`;
}

async function sendDonorDonationReceiptEmail(env, offering = {}) {
  const donorEmail = normalizeEmail(offering.donorEmail);
  if (!donorEmail) return { status: "missing_recipient" };
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const donorName = htmlEscape(offering.donorName || "friend");
  const lineItem = htmlEscape(offeringLabel(offering));
  const parishName = htmlEscape(offering.parishName || "Orthodox parish");
  const fees = offeringFeeBreakdown(offering);
  const amount = formatUsdFromCents(fees.giftAmountCents);
  const chargeAmount = formatUsdFromCents(fees.chargeCents);
  const parishReceived = formatUsdFromCents(fees.parishNetCents);
  const totalFees = formatUsdFromCents(fees.totalFeeCents);
  const donorCovered = formatUsdFromCents(fees.donorCoveredFeeCents);
  const stripeReference = htmlEscape(offering.stripePaymentIntentId || offering.checkoutSessionId || offering.id || "");
  const donatedAt = htmlEscape(new Date(offering.completedAt || offering.createdAt || Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
  const dashboardUrl = htmlEscape(`${String(appUrl).replace(/\/+$/, "")}/donor`);
  const feeDetail = fees.coverFees
    ? `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Fees covered by you:</strong> ${htmlEscape(donorCovered)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Processing and AGAPAY fees deducted:</strong> ${htmlEscape(totalFees)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`;
  const coverFeesNote = fees.coverFees ? "" : `
      <p style="margin:0 0 18px;padding:13px 15px;border-left:3px solid #C9A25B;background:#FFF8EA;font-size:14px;line-height:1.65;color:#171715;">
        Next time, you can choose to cover the processing fees so ${parishName} receives the full intended gift.
      </p>`;
  return sendEmail(env, {
    from,
    to: [donorEmail],
    reply_to: replyTo,
    subject: `AGAPAY receipt - ${amount} to ${offering.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Donation receipt", `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${donorName}.</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Your gift has been received successfully through AGAPAY.</p>
      <div style="margin:0 0 20px;padding:16px 18px;border:1px solid rgba(201,162,91,0.34);border-radius:12px;background:#FDF9F0;">
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Your gift:</strong> ${htmlEscape(amount)}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Amount charged:</strong> ${htmlEscape(chargeAmount)}</p>
        ${feeDetail}
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Offering:</strong> ${lineItem}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Date:</strong> ${donatedAt}</p>
        ${stripeReference ? `<p style="margin:0;font-size:12px;color:#6F6A60;"><strong>Stripe reference:</strong> ${stripeReference}</p>` : ""}
      </div>
      ${coverFeesNote}
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#171715;">You can view this gift in your donor dashboard and keep track of your offering history there.</p>
      <p style="margin:0;"><a href="${dashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:12px 18px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-style:italic;font-weight:600;">Open donor dashboard</a></p>
    `)
  });
}

async function sendDonationReceiptIfNeeded(env, offering = {}) {
  if (!offering) return offering;
  if (offering.emailReceiptSentAt) return offering;
  const paidLike = offering.status === "completed" || offering.paymentStatus === "paid" || offering.paymentStatus === "succeeded";
  if (!paidLike) return offering;

  let current = offering;
  if (offering.checkoutSessionId) {
    const byCheckout = await loadDonorOfferingByCheckout(env, offering.checkoutSessionId);
    if (byCheckout) current = byCheckout;
  } else if (offering.stripePaymentIntentId) {
    const byIntent = await loadDonorOfferingByPaymentIntent(env, offering.stripePaymentIntentId);
    if (byIntent) current = byIntent;
  }
  if (current.emailReceiptSentAt) return current;

  const email = await sendDonorDonationReceiptEmail(env, current);
  const updates = {
    emailReceiptStatus: email.status || "unknown",
    emailReceiptId: email.id || "",
    emailReceiptDetail: email.detail || "",
    emailReceiptSentAt: email.status === "sent" ? new Date().toISOString() : ""
  };
  return storeDonorOffering(env, { ...current, ...updates });
}

async function handleDonorSignup(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-signup", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const donorNameValue = String(body.donorName || [body.firstName, body.lastName].filter(Boolean).join(" ") || "").trim();
  if (!email || !email.includes("@") || !password || !donorNameValue) {
    return json({ error: "Name, email, and password are required" }, { status: 422 });
  }
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });

  const now = new Date().toISOString();
  const existing = await loadDonor(env, email);
  if (existing?.emailVerifiedAt) {
    return json({ error: "A donor account already exists for this email. Please log in." }, { status: 409 });
  }
  if (existing?.passwordRecord || existing?.passwordHash) {
    if (!(await verifyDonorPassword(existing, password))) {
      return json({ error: "A donor account already exists for this email. Please log in or use the original password to resend verification." }, { status: 409 });
    }
  }

  const verificationToken = generateSecret("verify");
  const verificationSalt = generateSecret("verify_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const verificationUrl = `${String(appUrl).replace(/\/+$/, "")}/donor/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}`;
  const donor = await applyDonorPassword({
    ...(existing || {}),
    email,
    donorName: donorNameValue,
    householdName: body.householdName || donorNameValue,
    defaultParishId: body.parishId || body.defaultParishId || existing?.defaultParishId || "",
    addressLine1: body.addressLine1 || existing?.addressLine1 || "",
    addressLine2: body.addressLine2 || existing?.addressLine2 || "",
    city: body.city || existing?.city || "",
    state: body.state || existing?.state || "",
    postalCode: body.postalCode || existing?.postalCode || "",
    country: body.country || existing?.country || "",
    emailVerifiedAt: "",
    emailVerificationSalt: verificationSalt,
    emailVerificationTokenHash: await sha256Hex(`${verificationSalt}:${verificationToken}`),
    emailVerificationSentAt: now,
    emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, password);

  const emailResult = await sendDonorVerificationEmail(env, donor, verificationUrl);
  donor.emailVerificationStatus = emailResult.status || "";
  donor.emailVerificationDetail = emailResult.detail || "";
  await saveDonor(env, donor);

  return json({
    ok: true,
    donor: publicDonor(donor),
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    verificationUrl: emailResult.status === "not_configured" ? verificationUrl : undefined
  }, { status: 201 });
}

async function handleDonorLogin(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-login", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required" }, { status: 422 });
  const donor = await loadDonor(env, email);
  if (!donor) return unauthorized();
  if (!(await verifyDonorPassword(donor, password))) return unauthorized();
  if (!donor.emailVerifiedAt) {
    return json({ error: "Please verify your email before logging in.", code: "email_unverified" }, { status: 403 });
  }

  const migrated = donor.passwordRecord ? donor : await applyDonorPassword(donor, password);
  const session = await issueDonorSession(env, migrated);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}

async function handleDonorVerify(request, env) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-verify", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let email = "";
  let token = "";
  const url = new URL(request.url);
  if (request.method === "GET") {
    email = normalizeEmail(url.searchParams.get("email"));
    token = String(url.searchParams.get("token") || "");
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
    email = normalizeEmail(body.email);
    token = String(body.token || "");
  }

  if (!email || !token) return json({ error: "Verification email and token are required" }, { status: 422 });
  const donor = await loadDonor(env, email);
  if (!donor) return unauthorized();

  const hasVerificationToken = donor.emailVerificationSalt && donor.emailVerificationTokenHash;
  if (!hasVerificationToken) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json({ error: "Verification token is missing or expired. Please sign up again to resend verification." }, { status: 410 });
  }
  if (donor.emailVerificationExpiresAt && new Date(donor.emailVerificationExpiresAt).getTime() < Date.now()) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json({ error: "Verification link expired. Please sign up again to resend verification." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.emailVerificationSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.emailVerificationTokenHash)) return unauthorized();
  if (donor.emailVerifiedAt) {
    const session = await issueDonorSession(env, donor);
    return json({ ok: true, alreadyVerified: true, token: session.token, donor: publicDonor(session.donor) });
  }

  const verified = {
    ...donor,
    emailVerifiedAt: new Date().toISOString(),
    emailVerificationSalt: "",
    emailVerificationTokenHash: "",
    emailVerificationExpiresAt: "",
    updatedAt: new Date().toISOString()
  };
  const session = await issueDonorSession(env, verified);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function donorVerifyHtml({ title, message, status = "info", script = "", refreshUrl = "" }, init = {}) {
  const statusClass = status === "success" ? "success" : status === "error" ? "error" : "";
  const refresh = refreshUrl ? `<meta http-equiv="refresh" content="2; url=${htmlEscape(refreshUrl)}" />` : "";
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${refresh}
  <title>${htmlEscape(title)} | AGAPAY</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/donor/style.css" />
</head>
<body>
  <div class="app">
    <main class="content" style="min-height:100vh;">
      <div class="page">
        <section class="hero">
          <div class="hero-grid">
            <div>
              <div class="eyebrow">Email verification</div>
              <h1>${htmlEscape(title)}</h1>
              <p>${htmlEscape(message)}</p>
              <div class="notice ${statusClass}" style="margin-top:1rem;">${htmlEscape(message)}</div>
              <p class="form-help" style="margin-top:1rem;"><a href="/donor/login">Go to donor login</a></p>
            </div>
            <div class="hero-mark"><img src="/mark.png" alt="" /></div>
          </div>
        </section>
      </div>
    </main>
  </div>
  ${script}
</body>
</html>`, {
    ...init,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

async function handleDonorVerifyPage(request, env) {
  if (request.method !== "GET") {
    return donorVerifyHtml(
      {
        title: "Verification link unavailable",
        message: "Open your donor verification link in a browser to confirm your email.",
        status: "error"
      },
      { status: 405 }
    );
  }

  const verification = await handleDonorVerify(request, env);
  const data = await verification.json().catch(() => ({}));

  if (!verification.ok) {
    return donorVerifyHtml(
      {
        title: "We could not verify your email",
        message: data.error || data.detail || "This verification link is invalid or expired. Please sign up again to request a new link.",
        status: "error"
      },
      { status: verification.status }
    );
  }

  if (!data.token) {
    return donorVerifyHtml(
      {
        title: "Email already verified",
        message: "Your email is already verified. Please log in to open your donor dashboard.",
        status: "success",
        refreshUrl: "/donor/login"
      },
      { status: 200 }
    );
  }

  const session = {
    email: data.donor?.email || new URL(request.url).searchParams.get("email") || "",
    token: data.token,
    donor: data.donor || {}
  };
  const script = `<script>
(() => {
  const session = ${jsonForScript(session)};
  try {
    if (session.email) localStorage.setItem("agapayDonorEmail", session.email);
    if (session.token) localStorage.setItem("agapayDonorToken", session.token);
    if (session.donor) localStorage.setItem("agapayDonorProfile", JSON.stringify(session.donor));
  } catch (err) {}
  window.location.replace("/donor");
})();
</script>`;

  return donorVerifyHtml(
    {
      title: "Email verified",
      message: data.alreadyVerified ? "Your email was already verified. Opening your donor dashboard." : "Your email is verified. Opening your donor dashboard.",
      status: "success",
      script,
      refreshUrl: "/donor"
    },
    { status: 200 }
  );
}

async function handleDonorDashboard(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "PATCH") {
    const limited = await rateLimit(request, env, "donor-settings", { limit: 20, windowSeconds: 300 });
    if (limited) return limited;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    let updated = {
      ...donor,
      donorName: body.donorName ?? donor.donorName,
      householdName: body.householdName ?? donor.householdName,
      contactPhone: body.contactPhone ?? body.phone ?? donor.contactPhone ?? "",
      defaultParishId: body.defaultParishId ?? body.parishId ?? donor.defaultParishId,
      addressLine1: body.addressLine1 ?? donor.addressLine1 ?? "",
      addressLine2: body.addressLine2 ?? donor.addressLine2 ?? "",
      city: body.city ?? donor.city ?? "",
      state: body.state ?? donor.state ?? "",
      postalCode: body.postalCode ?? donor.postalCode ?? "",
      country: body.country ?? donor.country ?? "",
      pledgeAmountCents: body.pledgeAmountCents != null ? Number(body.pledgeAmountCents) : (donor.pledgeAmountCents || 0),
      pledgeYear: body.pledgeYear != null ? String(body.pledgeYear) : (donor.pledgeYear || ""),
      updatedAt: new Date().toISOString()
    };

    const requestedEmail = normalizeEmail(body.email || donor.email);
    const emailChanged = requestedEmail && requestedEmail !== normalizeEmail(donor.email);
    if (emailChanged) {
      const currentPassword = String(body.currentPassword || "");
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      const existing = await loadDonor(env, requestedEmail);
      if (existing) return json({ error: "That email address is already connected to a donor account" }, { status: 409 });
      updated = {
        ...updated,
        email: requestedEmail,
        emailVerifiedAt: new Date().toISOString(),
        emailChangedAt: new Date().toISOString()
      };
    }

    if (body.newPassword) {
      const currentPassword = String(body.currentPassword || "");
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      if (String(body.newPassword).length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });
      updated = await applyDonorPassword(updated, body.newPassword);
    }

    if (emailChanged) {
      await migrateDonorEmailReferences(env, donor.email, requestedEmail);
      await deleteDonor(env, donor.email);
    }
    await saveDonor(env, updated);
    return json({ ok: true, donor: publicDonor(updated) });
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const publicOfferings = offerings.map(publicDonorOffering);
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  const summary = donorSummaryFromOfferings(offerings, commemorations);
  let parish = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId(env, donor.defaultParishId);
    if (found) parish = parishFromRegistration(found.registration);
    if (parish) parish = await enrichParishGivingOptions(env, parish);
  }

  return json({
    donor: publicDonor(donor),
    parish,
    summary,
    recentOfferings: publicOfferings.slice(0, 5),
    recentCommemorations: commemorations.slice(0, 5)
  });
}

async function handleDonorOfferings(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({ offerings: offerings.map(publicDonorOffering), summary: donorSummaryFromOfferings(offerings, commemorations) });
}

async function handleDonorSubscriptionPortal(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "donor-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const requestedParishId = String(body.parishId || donor.defaultParishId || "").trim();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const recurringOfferings = offerings
    .filter((offering) => offering.stripeCustomerId && offering.parishId && offering.frequency && offering.frequency !== "once")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const selectedOffering = recurringOfferings.find((offering) => requestedParishId && offering.parishId === requestedParishId)
    || recurringOfferings[0];

  if (!selectedOffering) {
    return json(
      { error: "No recurring gifts found", detail: "Create a recurring gift before opening subscription management." },
      { status: 422 }
    );
  }

  const found = await findRegistrationByParishId(env, selectedOffering.parishId);
  const stripeAccountId = found?.registration?.stripeAccountId || "";
  if (!stripeAccountId) {
    return json(
      { error: "Parish Stripe account unavailable", detail: "This parish is not currently connected for Stripe subscription management." },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: selectedOffering.stripeCustomerId,
    return_url: `${String(appUrl).replace(/\/+$/, "")}/donor/offerings`
  });

  const session = await stripeFormConnectedRequest(env, "/v1/billing_portal/sessions", form, stripeAccountId);
  if (!session.ok) {
    return json(
      { error: "Stripe billing portal failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    ok: true,
    portalUrl: session.body.url,
    parishId: selectedOffering.parishId,
    parishName: selectedOffering.parishName || found?.registration?.parishName || ""
  });
}

async function handleDonorCommemorations(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "GET") {
    const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
    const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
    return json({ entries });
  }

  return json(
    { error: "Commemoration submissions now require checkout", detail: "Use /api/create-checkout-session with giftType=commemoration so names are attached to a paid offering." },
    { status: 405 }
  );
}

function adminRegistrationSummary(registration = {}, fallbackReference = "") {
  registration = registration || {};
  return {
    reference: registration.reference || fallbackReference || "",
    status: registration.status || "pending",
    parishName: registration.parishName || "",
    communityType: registration.communityType || "",
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    jurisdiction: registration.jurisdiction || "",
    city: registration.city || "",
    state: registration.state || "",
    priestEmail: registration.priestEmail || "",
    treasurerEmail: registration.treasurerEmail || "",
    givingStatus: registration.givingStatus || "active",
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    dashboardInviteEmailStatus: registration.dashboardInviteEmailStatus || "",
    adminNotificationEmailStatus: registration.adminNotificationEmailStatus || "",
    receivedAt: registration.receivedAt || ""
  };
}

async function loadAdminRegistrationPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const status = String(options.status || "").trim().toLowerCase();
  const query = String(options.query || options.q || "").trim().toLowerCase();

  if (d1(env)) {
    const where = [];
    const params = [];
    if (status && status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (cursor) {
      where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.priestEmail'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.treasurerEmail'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like, like, like);
    }
    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const registrations = pageRows.map((row) => {
      try {
        return adminRegistrationSummary(safeParseJsonRow(row), row.reference);
      } catch {
        return { reference: row.reference || "", status: "unreadable" };
      }
    });
    return {
      registrations,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  const keys = await listKvKeys(env, { limit });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (status && status !== "all" && registration.status !== status) continue;
      if (query) {
        const haystack = [
          registration.parishName,
          registration.city,
          registration.state,
          registration.jurisdiction,
          registration.priestEmail,
          registration.treasurerEmail
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      registrations.push(adminRegistrationSummary(registration, key.name));
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return { registrations, cursor: null, hasMore: false, limit, source: "kv" };
}

async function handleAdminRegistrations(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) {
    return missingProductionStoreResponse();
  }

  const url = new URL(request.url);
  const page = await loadAdminRegistrationPage(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    status: url.searchParams.get("status"),
    q: url.searchParams.get("q") || url.searchParams.get("search")
  });
  return json(page);
}

async function loadAllRegistrations(env, options = {}) {
  const hardLimit = clampListLimit(options.hardLimit, 10000, 25000);
  if (d1(env)) {
    const registrations = [];
    let cursor = "";
    do {
      const decoded = decodeListCursor(cursor);
      const where = [];
      const params = [];
      if (options.status) {
        where.push("status = ?");
        params.push(options.status);
      }
      if (decoded) {
        where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
        params.push(decoded.receivedAt, decoded.receivedAt, decoded.reference);
      }
      const rows = await d1All(
        env,
        `SELECT reference, received_at, data
         FROM registrations
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY received_at DESC, reference DESC
         LIMIT ?`,
        ...params,
        501
      );
      const pageRows = rows.slice(0, 500);
      registrations.push(...pageRows.map(safeParseJsonRow).filter(Boolean));
      if (registrations.length >= hardLimit) return registrations.slice(0, hardLimit);
      cursor = rows.length > 500 ? encodeListCursor(pageRows[pageRows.length - 1]) : "";
    } while (cursor);
    return registrations;
  }

  return loadAllKvRegistrations(env, { hardLimit });
}

async function loadAllKvRegistrations(env, options = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return [];

  const keys = await listKvKeys(env, { limit: options.hardLimit || 10000 });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      registrations.push(JSON.parse(raw));
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  return registrations;
}

async function handleAdminMigrateKvToD1(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-maintenance", { limit: 3, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!d1(env)) return json({ error: "AGAPAY_DB D1 binding is not configured" }, { status: 500 });
  if (!env.AGAPAY_REGISTRATIONS) return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });

  const keys = await listKvKeys(env, { limit: 5000 });
  const migrated = {
    registrations: 0,
    donors: 0,
    offerings: 0,
    commemorations: 0,
    settings: 0,
    stripeEvents: 0,
    skipped: 0
  };

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) {
      migrated.skipped += 1;
      continue;
    }

    try {
      if (key.name === ADMIN_PASSWORD_KV_KEY) {
        await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, raw);
        migrated.settings += 1;
      } else if (key.name.startsWith(DONOR_KEY_PREFIX)) {
        await saveDonor(env, JSON.parse(raw));
        migrated.donors += 1;
      } else if (key.name.startsWith(DONOR_OFFERING_KEY_PREFIX)) {
        await storeDonorOffering(env, JSON.parse(raw));
        migrated.offerings += 1;
      } else if (key.name.startsWith(COMMEMORATION_KEY_PREFIX)) {
        await saveCommemorationEntry(env, JSON.parse(raw));
        migrated.commemorations += 1;
      } else if (key.name.startsWith(STRIPE_EVENT_PREFIX)) {
        await recordStripeEvent(env, key.name.slice(STRIPE_EVENT_PREFIX.length));
        migrated.stripeEvents += 1;
      } else if (isSystemKvKey(key.name)) {
        migrated.skipped += 1;
      } else {
        const registration = JSON.parse(raw);
        await saveRegistrationRecord(env, registration.reference || key.name, registration);
        migrated.registrations += 1;
      }
    } catch {
      migrated.skipped += 1;
    }
  }

  return json({ ok: true, migrated, migratedAt: new Date().toISOString() });
}

async function handleAdminPlatformSummary(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    registered: 0,
    verified: 0,
    ytdDonationsCents: 0,
    giftCount: 0
  }));

  let totalRegistered = 0;
  let totalVerified = 0;
  let connectedStripeAccounts = 0;
  const connected = [];

  if (d1(env)) {
    const totals = await d1First(
      env,
      `SELECT
         COUNT(*) AS total_registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS total_verified,
         SUM(CASE WHEN COALESCE(stripe_account_id, '') != '' THEN 1 ELSE 0 END) AS connected_stripe_accounts
       FROM registrations`
    );
    totalRegistered = Number(totals?.total_registered || 0);
    totalVerified = Number(totals?.total_verified || 0);
    connectedStripeAccounts = Number(totals?.connected_stripe_accounts || 0);

    const monthRows = await d1All(
      env,
      `SELECT
         CAST(strftime('%m', received_at) AS INTEGER) AS month,
         COUNT(*) AS registered,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified
       FROM registrations
       WHERE received_at >= ?1 AND received_at < ?2
       GROUP BY month`,
      `${year}-01-01T00:00:00.000Z`,
      `${year + 1}-01-01T00:00:00.000Z`
    );
    for (const row of monthRows) {
      const target = monthly[Number(row.month || 0) - 1];
      if (!target) continue;
      target.registered = Number(row.registered || 0);
      target.verified = Number(row.verified || 0);
    }

    const connectedRows = await d1All(
      env,
      `SELECT data FROM registrations
       WHERE COALESCE(stripe_account_id, '') != ''
       ORDER BY received_at DESC, reference DESC
       LIMIT 2000`
    );
    connected.push(...connectedRows.map(safeParseJsonRow).filter(Boolean));
  } else {
    const registrations = await loadAllRegistrations(env);
    for (const registration of registrations) {
      totalRegistered += 1;
      if (registration.status === "verified") totalVerified += 1;
      if (registration.stripeAccountId) {
        connectedStripeAccounts += 1;
        connected.push(registration);
      }

      const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
      if (received && !Number.isNaN(received.getTime()) && received.getUTCFullYear() === year) {
        monthly[received.getUTCMonth()].registered += 1;
        if (registration.status === "verified") monthly[received.getUTCMonth()].verified += 1;
      }
    }
  }

  let donationDataSource = "not_configured";
  let donationError = "";

  if (env.STRIPE_SECRET_KEY && connected.length) {
    donationDataSource = "stripe";
    for (const registration of connected) {
      const result = await listYtdStripeCharges(env, registration.stripeAccountId);
      if (!result.ok) {
        donationDataSource = "partial";
        donationError = result.body?.error?.message || "Stripe giving summary failed for at least one parish.";
        continue;
      }

      const summary = summarizeCharges(result.body.data || []);
      for (const month of summary.monthly) {
        const target = monthly[month.month - 1];
        target.ytdDonationsCents += month.amountCents || 0;
        target.giftCount += month.giftCount || 0;
      }
    }
  } else if (!connected.length) {
    donationDataSource = "not_connected";
  }

  const ytdDonationsCents = monthly.reduce((sum, item) => sum + item.ytdDonationsCents, 0);
  const giftCount = monthly.reduce((sum, item) => sum + item.giftCount, 0);

  return json({
    summary: {
      year,
      generatedAt: now.toISOString(),
      totalRegistered,
      totalVerified,
      connectedStripeAccounts,
      ytdDonationsCents,
      giftCount,
      donationDataSource,
      donationError,
      monthly
    }
  });
}

async function handleAdminRegistrationGivingSummary(request, env, reference) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (!registration.stripeAccountId) {
    return json({
      summary: {
        dataSource: "not_connected",
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: "",
        monthly: []
      }
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      summary: {
        dataSource: "not_configured",
        year: new Date().getUTCFullYear(),
        ytdCents: 0,
        giftCount: 0,
        lastGiftAt: "",
        monthly: []
      }
    });
  }

  const result = await listYtdStripeCharges(env, registration.stripeAccountId);
  if (!result.ok) {
    return json(
      { error: "Unable to load Stripe giving summary", detail: result.body?.error?.message || "Stripe request failed" },
      { status: 502 }
    );
  }

  const summary = summarizeCharges(result.body?.data || []);
  return json({
    summary: {
      ...summary,
      dataSource: "stripe",
      stripeAccountId: registration.stripeAccountId
    }
  });
}

async function handleAdminReleaseStatus(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();

  let registrationCount = 0;
  let verifiedCount = 0;
  let stripeReadyCount = 0;
  let subscriptionReadyCount = 0;
  if (hasProductionStore(env) && d1(env)) {
    const row = await d1First(
      env,
      `SELECT
         COUNT(*) AS registration_count,
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.stripeAccountStatus') IN ('charges_enabled', 'payouts_enabled') THEN 1 ELSE 0 END) AS stripe_ready_count,
         SUM(CASE WHEN status = 'verified' AND json_extract(data, '$.subscriptionStatus') IN ('active', 'free_forever') THEN 1 ELSE 0 END) AS subscription_ready_count
       FROM registrations`
    );
    registrationCount = Number(row?.registration_count || 0);
    verifiedCount = Number(row?.verified_count || 0);
    stripeReadyCount = Number(row?.stripe_ready_count || 0);
    subscriptionReadyCount = Number(row?.subscription_ready_count || 0);
  } else if (hasProductionStore(env)) {
    const registrations = await loadAllRegistrations(env);
    const verified = registrations.filter((registration) => registration.status === "verified");
    registrationCount = registrations.length;
    verifiedCount = verified.length;
    stripeReadyCount = verified.filter((registration) => stripeReady(registration)).length;
    subscriptionReadyCount = verified.filter((registration) => subscriptionReady(registration)).length;
  }
  const storedAdminPassword = d1(env)
    ? await d1GetSetting(env, ADMIN_PASSWORD_KV_KEY)
    : env.AGAPAY_REGISTRATIONS
      ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
      : "";

  return json({
    ok: true,
    releaseStatus: {
      checkedAt: new Date().toISOString(),
      storeMode: d1(env) ? "d1" : (env.AGAPAY_REGISTRATIONS ? "kv" : "none"),
      productionStoreConfigured: hasProductionStore(env),
      d1Configured: Boolean(d1(env)),
      kvConfigured: Boolean(env.AGAPAY_REGISTRATIONS),
      stripeSecretConfigured: Boolean(env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      stripeConnectWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET_CONNECT),
      resendConfigured: Boolean(env.RESEND_API_KEY),
      appUrlConfigured: Boolean(env.AGAPAY_APP_URL),
      turnstileConfigured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      adminPasswordConfigured: Boolean(storedAdminPassword || env.AGAPAY_ADMIN_TOKEN),
      registrationCount,
      verifiedCount,
      stripeReadyCount,
      subscriptionReadyCount
    }
  });
}

async function handleAdminRebuildIndexes(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-maintenance", { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registrations = await loadAllRegistrations(env);
  let indexed = 0;
  for (const registration of registrations) {
    if (!registration.reference || registration.status === "unreadable") continue;
    await saveRegistrationRecord(env, registration.reference, registration, registration);
    indexed += 1;
  }

  return json({ ok: true, indexed, rebuiltAt: new Date().toISOString() });
}

async function handleAdminPassword(request, env) {
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-password", { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newPassword = String(body.newAdminPassword || "").trim();
  const confirmPassword = String(body.confirmAdminPassword || "").trim();
  if (newPassword.length < 12) {
    return json({ error: "Admin password must be at least 12 characters." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return json({ error: "Admin passwords do not match." }, { status: 400 });
  }
  if (newPassword === env.AGAPAY_ADMIN_TOKEN) {
    return json({ error: "Choose a password different from the Cloudflare root secret." }, { status: 400 });
  }

  const passwordRecord = JSON.stringify(await createPasswordRecord(newPassword));
  if (d1(env)) {
    await d1SetSetting(env, ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await d1SetSetting(env, ADMIN_SESSION_STORE_KEY, JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() }));
  } else {
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_PASSWORD_KV_KEY, passwordRecord);
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_SESSION_STORE_KEY, JSON.stringify({ sessions: [], updatedAt: new Date().toISOString() }));
  }
  return json({ ok: true, updatedAt: new Date().toISOString(), sessionsInvalidated: true });
}

async function handleAdminRegistrationDetail(request, env, reference) {
  const limited = await rateLimit(
    request,
    env,
    request.method === "PATCH" ? "admin-registration-write" : "admin-auth",
    { limit: request.method === "PATCH" ? 30 : 80, windowSeconds: 300 }
  );
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === "GET") {
    const registration = await loadRegistrationByReference(env, reference);
    if (!registration) return json({ error: "Registration not found" }, { status: 404 });
    return json({ registration });
  }

  if (request.method === "PATCH") {
    const current = await loadRegistrationByReference(env, reference);
    if (!current) return json({ error: "Registration not found" }, { status: 404 });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const nextStatus = body.status || current.status;
    const reviewedByNext = body.reviewedBy ?? current.reviewedBy ?? "";
    const verificationSourceNext = body.verificationSource ?? current.verificationSource ?? "";
    const bishopOrAuthorityNext = body.bishopOrAuthority ?? current.bishopOrAuthority ?? "";
    const dioceseOrDeaneryNext = body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? "";
    if (nextStatus === "verified") {
      const missing = [];
      if (!String(reviewedByNext || "").trim()) missing.push("reviewedBy");
      if (!String(verificationSourceNext || "").trim()) missing.push("verificationSource");
      if (!String(bishopOrAuthorityNext || "").trim()) missing.push("bishopOrAuthority");
      if (!String(dioceseOrDeaneryNext || "").trim()) missing.push("dioceseOrDeanery");
      if (missing.length) {
        return json(
          {
            error: "Canonical verification is incomplete. Fill reviewer name, verification source, bishop/authority, and diocese/deanery before marking verified.",
            missing
          },
          { status: 422 }
        );
      }
    }

    const parishId = nextStatus === "verified"
      ? current.parishId || slugify(current.parishName)
      : current.parishId;
    const requestedDashboardToken = body.parishDashboardToken !== undefined
      ? String(body.parishDashboardToken || "").trim()
      : String(current.parishDashboardToken || "").trim();
    const parishDashboardToken = nextStatus === "verified" && !requestedDashboardToken
      ? generateDashboardToken()
      : requestedDashboardToken;
    const nextSubscriptionTierId = body.subscriptionTier || current.subscriptionTier || defaultSubscriptionTier(current);
    const nextTier = subscriptionTier(nextSubscriptionTierId) || subscriptionTier(defaultSubscriptionTier(current));
    const nextSubscriptionStatus = nextTier?.monthlyCents === 0
      ? "free_forever"
      : body.subscriptionStatus || current.subscriptionStatus || "not_started";
    let updated = {
      ...current,
      status: nextStatus,
      parishId,
      givingStatus: body.givingStatus || current.givingStatus || (nextStatus === "verified" ? "active" : "hidden"),
      stripeAccountStatus: body.stripeAccountStatus || current.stripeAccountStatus || "not_started",
      stripeAccountId: body.stripeAccountId ?? current.stripeAccountId ?? "",
      reviewedBy: reviewedByNext,
      verificationSource: verificationSourceNext,
      bishopOrAuthority: bishopOrAuthorityNext,
      dioceseOrDeanery: dioceseOrDeaneryNext,
      platformFee: body.platformFee ?? current.platformFee ?? "",
      liturgicalCalendar: body.liturgicalCalendar ?? current.liturgicalCalendar ?? "julian",
      subscriptionTier: nextTier?.id || nextSubscriptionTierId,
      subscriptionTierLabel: nextTier?.label || current.subscriptionTierLabel || "",
      subscriptionMonthlyCents: nextTier?.monthlyCents ?? current.subscriptionMonthlyCents ?? null,
      subscriptionStatus: nextSubscriptionStatus,
      stripeCustomerId: body.stripeCustomerId ?? current.stripeCustomerId ?? "",
      stripeSubscriptionId: body.stripeSubscriptionId ?? current.stripeSubscriptionId ?? "",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishDashboardToken,
      parishDashboardTokenTemporary: Boolean(parishDashboardToken),
      parishDashboardTokenCreatedAt: parishDashboardToken && parishDashboardToken !== current.parishDashboardToken
        ? new Date().toISOString()
        : current.parishDashboardTokenCreatedAt,
      reviewerNotes: body.reviewerNotes ?? current.reviewerNotes ?? "",
      statusTimeline: statusTimelineWithNext(current.status, nextStatus, current.statusTimeline),
      stripeStatusHistory: statusTimelineWithNext(
        current.stripeAccountStatus || "not_started",
        body.stripeAccountStatus || current.stripeAccountStatus || "not_started",
        current.stripeStatusHistory
      ),
      subscriptionStatusHistory: statusTimelineWithNext(
        current.subscriptionStatus || "not_started",
        nextSubscriptionStatus,
        current.subscriptionStatusHistory
      ),
      lastWorkflowEventAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt: nextStatus === "verified"
        ? current.publicProfileCreatedAt || new Date().toISOString()
        : current.publicProfileCreatedAt
    };

    const reviewerNote = String(body.reviewerNotes || "").trim();
    if (reviewerNote) {
      const nextHistory = Array.isArray(current.notesHistory) ? [...current.notesHistory] : [];
      nextHistory.push({
        author: normalizeAdminActor(reviewedByNext || adminContext.actor),
        text: reviewerNote,
        createdAt: new Date().toISOString()
      });
      updated.notesHistory = nextHistory.slice(-200);
    }

    if (nextStatus !== current.status) {
      updated = appendAdminAudit(updated, "status_changed", adminContext.actor, {
        from: current.status || "pending",
        to: nextStatus
      });
    }
    if ((body.subscriptionStatus || current.subscriptionStatus || "not_started") !== (current.subscriptionStatus || "not_started")) {
      updated = appendAdminAudit(updated, "subscription_status_changed", adminContext.actor, {
        from: current.subscriptionStatus || "not_started",
        to: body.subscriptionStatus || current.subscriptionStatus || "not_started"
      });
    }
    if ((body.stripeAccountStatus || current.stripeAccountStatus || "not_started") !== (current.stripeAccountStatus || "not_started")) {
      updated = appendAdminAudit(updated, "stripe_status_changed", adminContext.actor, {
        from: current.stripeAccountStatus || "not_started",
        to: body.stripeAccountStatus || current.stripeAccountStatus || "not_started"
      });
    }
    if (reviewerNote) {
      updated = appendAdminAudit(updated, "review_note_added", reviewedByNext || adminContext.actor, {
        notePreview: reviewerNote.slice(0, 160)
      });
    }

    let dashboardInvite = null;
    if (body.sendDashboardInvite && nextStatus === "verified") {
      const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
      dashboardInvite = await sendDashboardInvite(env, appUrl, updated);
      updated = {
        ...updated,
        dashboardInviteEmailStatus: dashboardInvite.status,
        dashboardInviteEmailId: dashboardInvite.id || "",
        dashboardInviteEmailDetail: dashboardInvite.detail || "",
        dashboardInviteEmailRecipients: dashboardInvite.recipients || [],
        dashboardInviteEmailSentAt: dashboardInvite.status === "sent"
          ? new Date().toISOString()
          : updated.dashboardInviteEmailSentAt
      };
      updated = appendAdminAudit(updated, "dashboard_invite_requested", adminContext.actor, {
        emailStatus: dashboardInvite.status || "unknown",
        recipients: dashboardInvite.recipients || []
      });
    }

    await saveRegistrationRecord(env, reference, updated, current);
    return json({ ok: true, registration: updated, dashboardInvite });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function createSubscriptionCheckoutForRegistration(request, env, reference, registration, body = {}, returnPath = "/admin") {
  const tierId = body.subscriptionTier || registration.subscriptionTier || defaultSubscriptionTier(registration);
  const tier = subscriptionTier(tierId);
  if (!tier) return json({ error: "Unknown subscription tier" }, { status: 422 });

  if (tier.monthlyCents === 0) {
    const updated = {
      ...registration,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionMonthlyCents: 0,
      subscriptionStatus: "free_forever",
      subscriptionUpdatedAt: new Date().toISOString()
    };
    await saveRegistrationRecord(env, reference, updated, registration);
    return json({ ok: true, subscription: updated.subscriptionStatus, registration: updated });
  }

  if (tier.monthlyCents === null && !env[tier.stripePriceEnv]) {
    return json({ error: "This tier needs a Stripe Price ID or a custom billing setup before checkout can be created" }, { status: 422 });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeCustomerId = registration.stripeCustomerId || "";
  if (!stripeCustomerId) {
    const customerForm = new URLSearchParams({
      email: registration.treasurerEmail || registration.priestEmail || "",
      name: registration.parishName || "AGAPAY parish",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
      "metadata[agapay_subscription_tier]": tier.id
    });
    const customer = await stripeFormRequest(env, "/v1/customers", customerForm);
    if (!customer.ok) {
      return json(
        { error: "Stripe customer creation failed", detail: customer.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeCustomerId = customer.body.id;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const checkoutForm = new URLSearchParams({
    mode: "subscription",
    customer: stripeCustomerId,
    success_url: `${appUrl}${returnPath}${returnSeparator}subscription_return=${encodeURIComponent(reference)}`,
    cancel_url: `${appUrl}${returnPath}${returnSeparator}subscription_cancel=${encodeURIComponent(reference)}`,
    client_reference_id: reference,
    "metadata[agapay_reference]": reference,
    "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "metadata[agapay_subscription_tier]": tier.id,
    "subscription_data[metadata][agapay_reference]": reference,
    "subscription_data[metadata][agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "subscription_data[metadata][agapay_subscription_tier]": tier.id,
    "line_items[0][quantity]": "1"
  });

  const configuredPriceId = tier.stripePriceEnv ? env[tier.stripePriceEnv] : "";
  if (configuredPriceId) {
    checkoutForm.set("line_items[0][price]", configuredPriceId);
  } else {
    checkoutForm.set("line_items[0][price_data][currency]", "usd");
    checkoutForm.set("line_items[0][price_data][unit_amount]", String(tier.monthlyCents));
    checkoutForm.set("line_items[0][price_data][recurring][interval]", "month");
    checkoutForm.set("line_items[0][price_data][product_data][name]", `AGAPAY ${tier.label} Subscription`);
    checkoutForm.set("line_items[0][price_data][product_data][description]", tier.description);
  }

  const session = await stripeFormRequest(env, "/v1/checkout/sessions", checkoutForm);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription checkout failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: "checkout_created",
    stripeCustomerId,
    stripeSubscriptionCheckoutSessionId: session.body.id || "",
    stripeSubscriptionCheckoutCreatedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return json({ ok: true, checkoutUrl: session.body.url, registration: updated }, { status: 201 });
}

async function handleSubscriptionCheckout(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const response = await createSubscriptionCheckoutForRegistration(request, env, reference, registration, body, "/admin");
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!response.ok || !payload?.registration) return response;

  const audited = appendAdminAudit(payload.registration, "subscription_checkout_created", adminContext.actor, {
    subscriptionTier: payload.registration.subscriptionTier || "",
    subscriptionStatus: payload.registration.subscriptionStatus || "",
    checkoutSessionId: payload.registration.stripeSubscriptionCheckoutSessionId || ""
  });
  await saveRegistrationRecord(env, reference, audited, payload.registration);
  payload.registration = audited;
  return json(payload, { status: response.status });
}

function parseStripeSignature(header) {
  const values = {};
  for (const part of String(header || "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value) values[key.trim()] = value.trim();
  }
  return values;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyStripeWebhook(payload, signatureHeader, secret) {
  if (!secret) return false;
  const signature = parseStripeSignature(signatureHeader);
  if (!signature.t || !signature.v1) return false;

  const timestamp = Number(signature.t);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${signature.t}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  return secureCompare(toHex(digest), signature.v1);
}

function stripeWebhookSecrets(env) {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_CONNECT]
    .filter((secret, index, secrets) => secret && secrets.indexOf(secret) === index);
}

async function verifyStripeWebhookWithAnySecret(payload, signatureHeader, secrets) {
  for (const secret of secrets) {
    if (await verifyStripeWebhook(payload, signatureHeader, secret)) return true;
  }
  return false;
}

function subscriptionStatusFromStripe(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  if (status === "paused") return "paused";
  return status || "not_started";
}

async function updateSubscriptionRecord(env, reference, updates) {
  if (!hasProductionStore(env) || !reference) return null;
  const current = await loadRegistrationByReference(env, reference);
  if (!current) return null;
  const updated = {
    ...current,
    ...updates,
    subscriptionUpdatedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, current);
  return updated;
}

async function handleStripeWebhook(request, env) {
  const secrets = stripeWebhookSecrets(env);
  if (!secrets.length) {
    return json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const verified = await verifyStripeWebhookWithAnySecret(payload, request.headers.get("Stripe-Signature"), secrets);
  if (!verified) return json({ error: "Invalid Stripe signature" }, { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const claim = await claimStripeEvent(env, event);
  if (!claim.claimed) {
    return json({ received: true, duplicate: true, status: claim.status || "processed" });
  }

  try {
    await processStripeWebhookEvent(env, event);
    await finishStripeEvent(env, event.id, "processed");
    return json({ received: true });
  } catch (error) {
    await finishStripeEvent(env, event.id, "failed", error?.message || String(error));
    return json(
      { error: "Webhook processing failed", detail: error?.message || "Unknown webhook error" },
      { status: 500 }
    );
  }
}

async function processStripeWebhookEvent(env, event) {
  const object = event.data?.object || {};
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const paymentStatus = object.payment_status || "paid";
    const status = paymentStatus === "paid" || object.mode === "subscription" ? "completed" : "pending";
    const existingOffering = object.id ? await loadDonorOfferingByCheckout(env, object.id) : null;
    const paymentIntentId = checkoutPaymentIntentId(object);
    const feeUpdates = status === "completed" && paymentIntentId
      ? await stripePaymentIntentFinancialUpdates(
        env,
        paymentIntentId,
        object.metadata?.parish_id || existingOffering?.parishId || "",
        existingOffering || object.metadata || {}
      )
      : {};
    const updatedOffering = await updateDonorOfferingByCheckout(env, object.id, {
      status,
      paymentStatus,
      stripeCustomerId: object.customer || "",
      stripePaymentIntentId: paymentIntentId || "",
      stripeSubscriptionId: object.subscription || "",
      completedAt: status === "completed" ? (object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()) : "",
      ...feeUpdates
    });
    if (status === "completed" || paymentStatus === "paid") {
      await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
        checkoutSessionId: object.id,
        id: object.id,
        parishId: object.metadata?.parish_id || updatedOffering?.parishId || "",
        parishName: object.metadata?.parish_name || updatedOffering?.parishName || "",
        donorEmail: object.metadata?.donor_email || object.customer_details?.email || object.customer_email || updatedOffering?.donorEmail || "",
        donorName: object.metadata?.donor_name || object.customer_details?.name || updatedOffering?.donorName || "",
        giftType: object.metadata?.gift_type || updatedOffering?.giftType || "",
        frequency: object.metadata?.frequency || updatedOffering?.frequency || "once",
        amountCents: numericCents(object.metadata?.amount_cents) || updatedOffering?.amountCents || object.amount_subtotal || object.amount_total || 0,
        namesLiving: object.metadata?.names_living || updatedOffering?.namesLiving || "",
        namesDeparted: object.metadata?.names_departed || updatedOffering?.namesDeparted || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
      await sendDonationReceiptIfNeeded(env, updatedOffering || {});

      // Backfill donor address from Stripe billing details if not yet stored
      const donorEmailForAddr = object.metadata?.donor_email || object.customer_details?.email || "";
      const stripeAddr = object.customer_details?.address;
      if (donorEmailForAddr && stripeAddr?.line1) {
        const donorForAddr = await loadDonor(env, donorEmailForAddr);
        if (donorForAddr && !donorForAddr.addressLine1) {
          await saveDonor(env, {
            ...donorForAddr,
            addressLine1: stripeAddr.line1 || "",
            addressLine2: stripeAddr.line2 || "",
            city: stripeAddr.city || "",
            state: stripeAddr.state || "",
            postalCode: stripeAddr.postal_code || "",
            country: stripeAddr.country || "",
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: "failed",
      paymentStatus: object.payment_status || "failed",
      stripeCustomerId: object.customer || "",
      stripePaymentIntentId: object.payment_intent || "",
      failureMessage: object.last_payment_error?.message || "",
      failedAt: new Date().toISOString()
    });
  }

  if (event.type === "checkout.session.expired") {
    await updateDonorOfferingByCheckout(env, object.id, {
      status: "expired",
      paymentStatus: object.payment_status || "unpaid",
      expiredAt: object.expires_at ? new Date(object.expires_at * 1000).toISOString() : new Date().toISOString()
    });
    if (object.mode === "subscription") {
      const reference = object.metadata?.agapay_reference || object.client_reference_id || "";
      if (reference) {
        await updateSubscriptionRecord(env, reference, {
          subscriptionStatus: "not_started",
          stripeSubscriptionCheckoutSessionId: object.id || "",
          stripeSubscriptionCheckoutSessionStatus: "expired"
        });
      }
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const existingOffering = await loadDonorOfferingByPaymentIntent(env, object.id);
    const feeUpdates = await stripePaymentIntentFinancialUpdates(
      env,
      object.id,
      object.metadata?.parish_id || existingOffering?.parishId || "",
      existingOffering || object.metadata || {}
    );
    const updatedOffering = await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "completed",
      paymentStatus: "paid",
      stripeCustomerId: object.customer || "",
      completedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
      ...feeUpdates
    });
    await ensureCommemorationEntryFromOffering(env, updatedOffering || {}, {
      id: updatedOffering?.checkoutSessionId || updatedOffering?.stripePaymentIntentId || object.id,
      stripePaymentIntentId: object.id,
      parishId: updatedOffering?.parishId || object.metadata?.parish_id || "",
      parishName: updatedOffering?.parishName || object.metadata?.parish_name || "",
      donorEmail: updatedOffering?.donorEmail || object.metadata?.donor_email || "",
      donorName: updatedOffering?.donorName || object.metadata?.donor_name || "",
      giftType: updatedOffering?.giftType || object.metadata?.gift_type || "",
      frequency: updatedOffering?.frequency || object.metadata?.frequency || "once",
      amountCents: updatedOffering?.amountCents || object.amount_received || object.amount || 0,
      namesLiving: updatedOffering?.namesLiving || object.metadata?.names_living || "",
      namesDeparted: updatedOffering?.namesDeparted || object.metadata?.names_departed || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
    await sendDonationReceiptIfNeeded(env, updatedOffering || {});
  }

  if (event.type === "payment_intent.payment_failed") {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "failed",
      paymentStatus: "failed",
      failureMessage: object.last_payment_error?.message || "",
      failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "payment_intent.canceled") {
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "cancelled",
      paymentStatus: "cancelled",
      cancelledAt: object.canceled_at ? new Date(object.canceled_at * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "charge.refunded") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: object.amount_refunded >= object.amount ? "refunded" : "partially_refunded",
      paymentStatus: object.amount_refunded >= object.amount ? "refunded" : "partially_refunded",
      refundedCents: object.amount_refunded || 0,
      refundedAt: new Date().toISOString()
    });
  }

  if (event.type === "charge.dispute.created") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: "disputed",
      paymentStatus: "disputed",
      stripeDisputeId: object.id || "",
      disputedCents: object.amount || 0,
      disputeReason: object.reason || "",
      disputedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "charge.dispute.closed") {
    await updateDonorOfferingByPaymentIntent(env, object.payment_intent, {
      status: object.status === "won" ? "completed" : "dispute_closed",
      paymentStatus: object.status === "won" ? "paid" : "dispute_closed",
      stripeDisputeId: object.id || "",
      disputeStatus: object.status || "",
      disputeClosedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const metadata = object.subscription_details?.metadata || object.lines?.data?.[0]?.metadata || object.metadata || {};
    if (metadata.donor_email) {
      const paymentIntentId = stripeObjectId(object.payment_intent);
      const giftAmountCents = numericCents(metadata.amount_cents) || numericCents(object.amount_paid);
      const feeUpdates = paymentIntentId
        ? await stripePaymentIntentFinancialUpdates(
          env,
          paymentIntentId,
          metadata.parish_id || "",
          {
            amountCents: giftAmountCents,
            giftAmountCents,
            chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
            stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
            agapayFeeCents: numericCents(metadata.agapay_fee_cents),
            totalFeeCents: numericCents(metadata.total_fee_cents),
            coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
            paymentMethod: metadata.payment_method || ""
          }
        )
        : {};
      const storedOffering = await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || "",
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        giftType: metadata.gift_type || "recurring",
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, " ") : "Recurring AGAPAY offering",
        frequency: metadata.frequency || "recurring",
        amountCents: giftAmountCents,
        giftAmountCents,
        chargeCents: numericCents(metadata.charge_cents) || numericCents(object.amount_paid),
        stripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        estimatedStripeFeeCents: numericCents(metadata.estimated_stripe_fee_cents),
        agapayFeeCents: numericCents(metadata.agapay_fee_cents),
        totalFeeCents: numericCents(metadata.total_fee_cents),
        coverFees: booleanFromStripeMetadata(metadata.cover_fees, false),
        paymentMethod: metadata.payment_method || "",
        status: "completed",
        paymentStatus: "paid",
        stripeCustomerId: object.customer || "",
        stripePaymentIntentId: paymentIntentId,
        stripeSubscriptionId: object.subscription || "",
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        ...feeUpdates
      });
      await ensureCommemorationEntryFromOffering(env, storedOffering || {}, {
        id: object.id,
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        donorEmail: metadata.donor_email || object.customer_email || object.customer_details?.email || "",
        donorName: metadata.donor_name || object.customer_name || "",
        giftType: metadata.gift_type || "recurring",
        frequency: metadata.frequency || "recurring",
        amountCents: giftAmountCents,
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
      await sendDonationReceiptIfNeeded(env, storedOffering || {});
    }
  }

  if (event.type === "checkout.session.completed" && object.mode === "subscription") {
    const reference = object.metadata?.agapay_reference || object.client_reference_id || "";
    await updateSubscriptionRecord(env, reference, {
      subscriptionStatus: "active",
      stripeCustomerId: object.customer || "",
      stripeSubscriptionId: object.subscription || "",
      stripeSubscriptionCheckoutSessionId: object.id || "",
      subscriptionActivatedAt: new Date().toISOString()
    });
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
    || event.type === "customer.subscription.paused"
    || event.type === "customer.subscription.resumed"
  ) {
    const reference = object.metadata?.agapay_reference || "";
    const status = event.type === "customer.subscription.deleted"
      ? "cancelled"
      : event.type === "customer.subscription.paused"
        ? "paused"
        : event.type === "customer.subscription.resumed"
          ? "active"
      : subscriptionStatusFromStripe(object.status);
    if (reference) {
      await updateSubscriptionRecord(env, reference, {
        subscriptionStatus: status,
        stripeSubscriptionId: object.id || "",
        stripeCustomerId: object.customer || ""
      });
    } else {
      const found = await findRegistrationByStripeSubscriptionId(env, object.id);
      if (found) {
        await updateSubscriptionRecord(env, found.key, {
          subscriptionStatus: status,
          stripeSubscriptionId: object.id || "",
          stripeCustomerId: object.customer || ""
        });
      }
    }
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    const subscriptionId = object.subscription || "";
    const metadata = object.subscription_details?.metadata || object.lines?.data?.[0]?.metadata || object.metadata || {};
    if (metadata.donor_email) {
      await storeDonorOffering(env, {
        id: object.id,
        donorEmail: metadata.donor_email,
        donorName: metadata.donor_name || object.customer_name || "",
        parishId: metadata.parish_id || "",
        parishName: metadata.parish_name || "",
        giftType: metadata.gift_type || "recurring",
        title: metadata.gift_type ? String(metadata.gift_type).replace(/-/g, " ") : "Recurring AGAPAY offering",
        frequency: metadata.frequency || "recurring",
        amountCents: object.amount_due || object.amount_remaining || object.total || 0,
        chargeCents: object.amount_due || object.amount_remaining || object.total || 0,
        status: "failed",
        paymentStatus: "failed",
        stripeCustomerId: object.customer || "",
        stripePaymentIntentId: object.payment_intent || "",
        stripeSubscriptionId: subscriptionId,
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        failureMessage: object.last_finalization_error?.message || "Recurring payment failed.",
        failedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
    }
    const found = await findRegistrationByStripeSubscriptionId(env, subscriptionId);
    if (found) {
      await updateSubscriptionRecord(env, found.key, {
        subscriptionStatus: "past_due",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: object.customer || found.registration.stripeCustomerId || "",
        subscriptionPaymentIssueAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString(),
        subscriptionPaymentIssueType: event.type
      });
    }
  }

  if (event.type === "account.updated") {
    const found = await findRegistrationByStripeAccountId(env, object.id);
    if (found) {
      await saveRegistrationRecord(env, found.key, {
        ...found.registration,
        stripeAccountStatus: stripeAccountStatus(object),
        stripeChargesEnabled: Boolean(object.charges_enabled),
        stripePayoutsEnabled: Boolean(object.payouts_enabled),
        stripeDetailsSubmitted: Boolean(object.details_submitted),
        stripeDisabledReason: object.requirements?.disabled_reason || "",
        stripeRequirementsDue: object.requirements?.currently_due || [],
        stripeStatusCheckedAt: new Date().toISOString()
      }, found.registration);
    }
  }
}

async function createStripeOnboardingSession(request, env, reference, registration, returnPath = "/admin") {
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeAccountId = registration.stripeAccountId || "";
  let stripeAccount = null;

  if (!stripeAccountId) {
    const accountForm = new URLSearchParams({
      type: "standard",
      country: "US",
      email: registration.treasurerEmail || registration.priestEmail || "",
      business_type: "non_profit",
      "business_profile[name]": registration.parishName || "AGAPAY Parish",
      "business_profile[product_description]": "Online tithes, stewardship, and charitable donations for an Orthodox Christian parish.",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName)
    });
    const website = absoluteWebsiteUrl(registration.website);
    if (website) accountForm.set("business_profile[url]", website);

    const created = await stripeFormRequest(env, "/v1/accounts", accountForm);
    if (!created.ok) {
      return json(
        { error: "Stripe connected account creation failed", detail: created.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }

    stripeAccount = created.body;
    stripeAccountId = stripeAccount.id;
  } else {
    const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(stripeAccountId)}`);
    if (!retrieved.ok) {
      return json(
        { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeAccount = retrieved.body;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const linkForm = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: `${appUrl}${returnPath}${returnSeparator}stripe_refresh=${encodeURIComponent(reference)}`,
    return_url: `${appUrl}${returnPath}${returnSeparator}stripe_return=${encodeURIComponent(reference)}`,
    type: "account_onboarding"
  });
  const link = await stripeFormRequest(env, "/v1/account_links", linkForm);
  if (!link.ok) {
    return json(
      { error: "Stripe onboarding link failed", detail: link.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    parishDashboardToken: registration.parishDashboardToken || crypto.randomUUID(),
    stripeAccountId,
    stripeAccountStatus: stripeAccountStatus(stripeAccount),
    stripeChargesEnabled: Boolean(stripeAccount.charges_enabled),
    stripePayoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    stripeDetailsSubmitted: Boolean(stripeAccount.details_submitted),
    stripeDisabledReason: stripeAccount.requirements?.disabled_reason || "",
    stripeRequirementsDue: stripeAccount.requirements?.currently_due || [],
    stripeOnboardingLinkCreatedAt: new Date().toISOString(),
    reviewedAt: registration.reviewedAt || new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return { onboardingUrl: link.body.url, registration: updated };
}

async function handleStripeOnboarding(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before starting Stripe onboarding" }, { status: 422 });
  }

  const result = await createStripeOnboardingSession(request, env, reference, registration);
  if (result instanceof Response) return result;

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendTreasurerStripeInvite(env, appUrl, result.registration);
  const updated = {
    ...result.registration,
    stripeOnboardingEmailStatus: email.status,
    stripeOnboardingEmailId: email.id || "",
    stripeOnboardingEmailDetail: email.detail || "",
    stripeOnboardingEmailSentAt: email.status === "sent" ? new Date().toISOString() : result.registration.stripeOnboardingEmailSentAt
  };
  const audited = appendAdminAudit(updated, "stripe_onboarding_link_created", adminContext.actor, {
    stripeAccountId: updated.stripeAccountId || "",
    emailStatus: email.status || "unknown"
  });
  await saveRegistrationRecord(env, reference, audited, result.registration);

  return json({ ok: true, onboardingUrl: result.onboardingUrl, email, registration: audited });
}

async function refreshStripeStatusForRegistration(env, reference, registration) {
  if (!registration.stripeAccountId) {
    return {
      ok: false,
      status: 422,
      body: { error: "This registration does not have a Stripe connected account yet" }
    };
  }

  const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(registration.stripeAccountId)}`);
  if (!retrieved.ok) {
    return {
      ok: false,
      status: 502,
      body: { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" }
    };
  }

  const account = retrieved.body;
  const updated = {
    ...registration,
    stripeAccountStatus: stripeAccountStatus(account),
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeDisabledReason: account.requirements?.disabled_reason || "",
    stripeRequirementsDue: account.requirements?.currently_due || [],
    stripeStatusCheckedAt: new Date().toISOString()
  };
  await saveRegistrationRecord(env, reference, updated, registration);

  return { ok: true, registration: updated, account };
}

async function handleStripeRefresh(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-money-actions", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  const refreshed = await refreshStripeStatusForRegistration(env, reference, registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });
  let updated = refreshed.registration;
  if ((registration.stripeAccountStatus || "not_started") !== (refreshed.registration.stripeAccountStatus || "not_started")) {
    updated = appendAdminAudit(refreshed.registration, "stripe_status_refreshed", adminContext.actor, {
      from: registration.stripeAccountStatus || "not_started",
      to: refreshed.registration.stripeAccountStatus || "not_started"
    });
    await saveRegistrationRecord(env, reference, updated, refreshed.registration);
  }

  return json({ ok: true, registration: updated });
}

async function handleParishStripeRefresh(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const refreshed = await refreshStripeStatusForRegistration(env, found.key, found.registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });

  return json({ ok: true, parish: parishDashboardPayload(parishId, refreshed.registration), registration: refreshed.registration });
}

async function handleDashboardInvite(request, env, reference) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "admin-email-actions", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before sending a dashboard invite" }, { status: 422 });
  }

  const parishDashboardToken = registration.parishDashboardToken || generateDashboardToken();
  const withToken = {
    ...registration,
    parishId: registration.parishId || slugify(registration.parishName),
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString()
  };

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendDashboardInvite(env, appUrl, withToken);
  const updated = {
    ...withToken,
    dashboardInviteEmailStatus: email.status,
    dashboardInviteEmailId: email.id || "",
    dashboardInviteEmailDetail: email.detail || "",
    dashboardInviteEmailRecipients: email.recipients || [],
    dashboardInviteEmailSentAt: email.status === "sent" ? new Date().toISOString() : withToken.dashboardInviteEmailSentAt
  };
  const audited = appendAdminAudit(updated, "dashboard_invite_requested", adminContext.actor, {
    emailStatus: email.status || "unknown",
    recipients: email.recipients || []
  });
  await saveRegistrationRecord(env, reference, audited, withToken);

  return json({ ok: true, email, registration: audited });
}

async function handleParishStripeOnboarding(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for giving yet" }, { status: 422 });
  }

  const result = await createStripeOnboardingSession(
    request,
    env,
    found.key,
    found.registration,
    `/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  );
  if (result instanceof Response) return result;

  return json({ ok: true, onboardingUrl: result.onboardingUrl, parish: result.registration });
}

async function handleParishSubscriptionCheckout(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for billing setup yet" }, { status: 422 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return createSubscriptionCheckoutForRegistration(
    request,
    env,
    found.key,
    found.registration,
    body,
    `/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  );
}

async function handleParishSubscriptionRefresh(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const registration = found.registration;
  const sessionId = registration.stripeSubscriptionCheckoutSessionId || "";
  if (!sessionId) {
    return json({
      ok: true,
      subscriptionStatus: registration.subscriptionStatus || "not_started",
      stripeSubscriptionId: registration.stripeSubscriptionId || "",
      stripeCustomerId: registration.stripeCustomerId || ""
    });
  }

  const session = await stripeGetRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription lookup failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const stripeSession = session.body || {};
  const now = new Date().toISOString();
  const updates = {
    stripeCustomerId: stripeSession.customer || registration.stripeCustomerId || "",
    stripeSubscriptionCheckoutSessionStatus: stripeSession.status || registration.stripeSubscriptionCheckoutSessionStatus || "",
    stripeSubscriptionCheckoutPaymentStatus: stripeSession.payment_status || registration.stripeSubscriptionCheckoutPaymentStatus || "",
    subscriptionLastCheckedAt: now
  };

  if (
    stripeSession.mode === "subscription" &&
    stripeSession.subscription &&
    (stripeSession.status === "complete" || stripeSession.payment_status === "paid")
  ) {
    updates.subscriptionStatus = "active";
    updates.stripeSubscriptionId = stripeSession.subscription;
    updates.subscriptionActivatedAt = registration.subscriptionActivatedAt || now;
  }

  const updated = {
    ...registration,
    ...updates
  };
  await saveRegistrationRecord(env, found.key, updated, registration);

  return json({
    ok: true,
    subscriptionStatus: updated.subscriptionStatus || "not_started",
    stripeSubscriptionId: updated.stripeSubscriptionId || "",
    stripeCustomerId: updated.stripeCustomerId || "",
    stripeSubscriptionCheckoutSessionStatus: updated.stripeSubscriptionCheckoutSessionStatus || "",
    stripeSubscriptionCheckoutPaymentStatus: updated.stripeSubscriptionCheckoutPaymentStatus || ""
  });
}

async function handleParishSubscriptionPortal(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const customerId = found.registration.stripeCustomerId || "";
  if (!customerId) {
    return json(
      { error: "No billing customer found", detail: "Complete AGAPAY billing checkout before opening subscription management." },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: customerId,
    return_url: `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  });
  const session = await stripeFormRequest(env, "/v1/billing_portal/sessions", form);
  if (!session.ok) {
    return json(
      { error: "Stripe billing portal failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({ ok: true, portalUrl: session.body.url });
}

async function handleParishCommemorations(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const { start, end } = weekWindow();
  const entries = await loadCommemorationEntries(env, parishId, start, end);
  return json({
    week: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    entries
  });
}

async function listYtdStripeCharges(env, stripeAccountId) {
  const charges = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: "100",
      "created[gte]": String(startOfYearUnix())
    });
    params.append("expand[]", "data.balance_transaction");
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/charges?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    charges.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: charges } };
}

async function listRecentStripePayouts(env, stripeAccountId, limit = 10) {
  const payouts = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - payouts.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/payouts?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    payouts.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || payouts.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: payouts.slice(0, limit) } };
}

async function listStripeBalanceTransactionsForPayout(env, stripeAccountId, payoutId, limit = 100) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      payout: payoutId,
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

async function listRecentStripeBalanceTransactions(env, stripeAccountId, limit = 25) {
  const transactions = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, limit - transactions.length)))
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/balance_transactions?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    transactions.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || transactions.length >= limit || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: transactions.slice(0, limit) } };
}

async function handleParishPayoutDiagnostics(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (!found.registration.stripeAccountId) {
    return json({
      parishId,
      available: false,
      reason: "Stripe is not connected for this parish."
    });
  }

  const stripeAccountId = found.registration.stripeAccountId;
  const payoutsResult = await listRecentStripePayouts(env, stripeAccountId, 5);
  if (!payoutsResult.ok) {
    return json({
      parishId,
      stripeAccountId,
      available: false,
      payoutsRequest: {
        ok: false,
        status: payoutsResult.status,
        error: payoutsResult.body?.error?.message || "Unknown Stripe error"
      }
    }, { status: 502 });
  }

  const payouts = payoutsResult.body.data || [];
  const diagnostics = {
    parishId,
    stripeAccountId,
    payoutsRequest: {
      ok: true,
      count: payouts.length
    },
    payouts: payouts.map((payout) => ({
      id: payout.id,
      status: payout.status,
      amount: payout.amount,
      arrivalDate: payout.arrival_date || 0,
      created: payout.created || 0,
      currency: payout.currency || "usd"
    })),
    balanceTransactionsRequest: null,
    samplePayoutTransactions: [],
    matchedOfferings: [],
    traceability: {
      chargeLinkedTransactionCount: 0,
      paymentIntentLinkedOfferingCount: 0,
      notes: []
    }
  };

  if (!payouts.length) {
    diagnostics.traceability.notes.push("Stripe returned no payouts for this connected account yet.");

    const recentBalanceResult = await listRecentStripeBalanceTransactions(env, stripeAccountId, 25);
    if (!recentBalanceResult.ok) {
      diagnostics.balanceTransactionsRequest = {
        ok: false,
        status: recentBalanceResult.status,
        error: recentBalanceResult.body?.error?.message || "Unknown Stripe error"
      };
      diagnostics.traceability.notes.push("Recent balance transactions could not be listed, so charge traceability remains unverified.");
      return json(diagnostics);
    }

    diagnostics.balanceTransactionsRequest = {
      ok: true,
      mode: "recent",
      count: recentBalanceResult.body.data?.length || 0
    };

    const recentTransactions = recentBalanceResult.body.data || [];
    const chargeIds = new Set();
    const paymentIntentIds = new Set();
    const matchedOfferings = [];

    for (const transaction of recentTransactions) {
      const sourceId = typeof transaction.source === "string"
        ? transaction.source
        : transaction.source?.id || "";
      if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
      if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
    }

    for (const chargeId of chargeIds) {
      const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
      if (!chargeResult.ok) continue;
      const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
        ? chargeResult.body.payment_intent
        : chargeResult.body.payment_intent?.id || "";
      if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
    }

    for (const paymentIntentId of paymentIntentIds) {
      const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
      if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
    }

    diagnostics.samplePayoutTransactions = recentTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      fee: transaction.fee,
      net: transaction.net,
      source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
      reportingCategory: transaction.reporting_category || "",
      availableOn: transaction.available_on || 0,
      created: transaction.created || 0
    }));
    diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
      id: offering.id,
      donorName: offering.donorName || "",
      donorEmail: offering.donorEmail || "",
      amountCents: offering.amountCents || 0,
      chargeCents: offering.chargeCents || offering.amountCents || 0,
      agapayFeeCents: offering.agapayFeeCents || 0,
      estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
      giftType: offering.giftType || "",
      fund: offering.fund || "",
      campaign: offering.campaign || "",
      paymentIntentId: offering.stripePaymentIntentId || "",
      checkoutSessionId: offering.checkoutSessionId || ""
    }));
    diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
    diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
    if (chargeIds.size) diagnostics.traceability.notes.push("Recent balance transactions include charge ids in `source`.");
    if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
    if (matchedOfferings.length) diagnostics.traceability.notes.push("Recent balance transactions can be matched back to AGAPAY donor_offerings records.");
    return json(diagnostics);
  }

  const samplePayout = payouts[0];
  const balanceResult = await listStripeBalanceTransactionsForPayout(env, stripeAccountId, samplePayout.id, 100);
  if (!balanceResult.ok) {
    diagnostics.balanceTransactionsRequest = {
      ok: false,
      payoutId: samplePayout.id,
      status: balanceResult.status,
      error: balanceResult.body?.error?.message || "Unknown Stripe error"
    };
    return json(diagnostics, { status: 502 });
  }

  diagnostics.balanceTransactionsRequest = {
    ok: true,
    payoutId: samplePayout.id,
    count: balanceResult.body.data?.length || 0
  };

  const transactions = balanceResult.body.data || [];
  const chargeIds = new Set();
  const paymentIntentIds = new Set();
  const matchedOfferings = [];

  for (const transaction of transactions) {
    const sourceId = typeof transaction.source === "string"
      ? transaction.source
      : transaction.source?.id || "";
    if (sourceId.startsWith("ch_")) chargeIds.add(sourceId);
    if (sourceId.startsWith("pi_")) paymentIntentIds.add(sourceId);
  }

  for (const chargeId of chargeIds) {
    const chargeResult = await stripeGetConnectedRequest(env, `/v1/charges/${encodeURIComponent(chargeId)}`, stripeAccountId);
    if (!chargeResult.ok) continue;
    const paymentIntentId = typeof chargeResult.body.payment_intent === "string"
      ? chargeResult.body.payment_intent
      : chargeResult.body.payment_intent?.id || "";
    if (paymentIntentId) paymentIntentIds.add(paymentIntentId);
  }

  for (const paymentIntentId of paymentIntentIds) {
    const offering = await loadDonorOfferingByPaymentIntent(env, paymentIntentId);
    if (offering && !matchedOfferings.some((item) => item.id === offering.id)) matchedOfferings.push(offering);
  }

  diagnostics.samplePayoutTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    fee: transaction.fee,
    net: transaction.net,
    source: typeof transaction.source === "string" ? transaction.source : transaction.source?.id || "",
    reportingCategory: transaction.reporting_category || "",
    availableOn: transaction.available_on || 0,
    created: transaction.created || 0
  }));
  diagnostics.matchedOfferings = matchedOfferings.map((offering) => ({
    id: offering.id,
    donorName: offering.donorName || "",
    donorEmail: offering.donorEmail || "",
    amountCents: offering.amountCents || 0,
    chargeCents: offering.chargeCents || offering.amountCents || 0,
    agapayFeeCents: offering.agapayFeeCents || 0,
    estimatedStripeFeeCents: offering.estimatedStripeFeeCents || 0,
    giftType: offering.giftType || "",
    fund: offering.fund || "",
    campaign: offering.campaign || "",
    paymentIntentId: offering.stripePaymentIntentId || "",
    checkoutSessionId: offering.checkoutSessionId || ""
  }));
  diagnostics.traceability.chargeLinkedTransactionCount = chargeIds.size;
  diagnostics.traceability.paymentIntentLinkedOfferingCount = matchedOfferings.length;
  if (chargeIds.size) diagnostics.traceability.notes.push("Sample payout balance transactions include charge ids in `source`.");
  if (paymentIntentIds.size) diagnostics.traceability.notes.push("Charge lookups yielded payment intent ids that can be compared against AGAPAY donor_offerings.");
  if (matchedOfferings.length) {
    diagnostics.traceability.notes.push("At least some payout line items can be matched back to AGAPAY donor_offerings records.");
  } else {
    diagnostics.traceability.notes.push("No AGAPAY donor_offerings records matched the sampled payout transaction sources yet.");
  }

  return json(diagnostics);
}

function summarizeCharges(charges) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0
  }));
  const givers = new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = "";

  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.paid === false) continue;

    const created = new Date((charge.created || 0) * 1000);
    if (created.getUTCFullYear() !== year) continue;

    const chargeCents = numericCents(charge.amount_captured || charge.amount);
    const refundedCents = numericCents(charge.amount_refunded);
    const metadataGiftCents = numericCents(charge.metadata?.amount_cents);
    const coverFees = String(charge.metadata?.cover_fees || "").toLowerCase() === "true";
    const paymentMethod = charge.metadata?.payment_method || "";
    const balanceTransaction = typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    const agapayFeeCents = numericCents(charge.application_fee_amount || charge.metadata?.agapay_fee_cents);
    const balanceFeeCents = balanceTransaction ? numericCents(balanceTransaction.fee) : 0;
    const stripeFeeCents = balanceTransaction
      ? Math.max(0, balanceFeeCents - agapayFeeCents)
      : paymentMethod === "ach"
        ? estimateStripeAchFeeCents(chargeCents)
        : estimateStripeProcessingFeeCents(chargeCents);
    const totalFeeCents = Math.max(0, stripeFeeCents + agapayFeeCents);
    const giftCents = metadataGiftCents || Math.max(0, chargeCents - (coverFees ? totalFeeCents : 0));
    const netCents = balanceTransaction
      ? Math.max(0, numericCents(balanceTransaction.net) - refundedCents)
      : Math.max(0, chargeCents - refundedCents - totalFeeCents);
    if (!netCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += giftCents;
    if (coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += Math.max(0, chargeCents - giftCents);
    } else {
      feesAbsorbedCents += totalFeeCents;
    }
    giftCount += 1;

    const giverKey = charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    if (!lastGiftAt || created.toISOString() > lastGiftAt) lastGiftAt = created.toISOString();
  }

  return {
    year,
    currency: "usd",
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly
  };
}

async function handleParishGivingSummary(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const emptySummary = {
    ...summarizeCharges([]),
    generatedAt: new Date().toISOString()
  };

  if (!found.registration.stripeAccountId) {
    return json({
      summary: {
        ...emptySummary,
        dataSource: "not_connected",
        note: "Stripe is not connected yet."
      }
    });
  }

  const result = await listYtdStripeCharges(env, found.registration.stripeAccountId);
  if (!result.ok) {
    return json(
      { error: "Stripe giving summary failed", detail: result.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    summary: {
      ...summarizeCharges(result.body.data || []),
      dataSource: "stripe",
      generatedAt: new Date().toISOString(),
      note: result.body.data?.length >= 500 ? "Showing the first 500 Stripe charges for this year." : ""
    }
  });
}

async function handleParishGivingHistory(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const gifts = await loadParishPaidOfferings(env, parishId, 500);
  return json({
    gifts,
    generatedAt: new Date().toISOString()
  });
}

async function handleParishRecurringHealth(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  const records = await loadParishRecurringOfferings(env, parishId, 1000);
  return json({
    health: summarizeParishRecurringHealth(records)
  });
}

function parishDashboardPayload(parishId, registration) {
  return {
    parishId,
    parishName: registration.parishName,
    communityType: registration.communityType,
    jurisdiction: registration.jurisdiction,
    addressLine1: registration.addressLine1 || "",
    addressLine2: registration.addressLine2 || "",
    city: registration.city,
    state: registration.state,
    postalCode: registration.postalCode || "",
    country: registration.country || "US",
    website: registration.website,
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    patronalFeast: registration.patronalFeast || "",
    givingStatus: registration.givingStatus || "active",
    stripeAccountId: registration.stripeAccountId || "",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionTierLabel: registration.subscriptionTierLabel || subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration))?.label || "",
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    subscriptionMonthlyCents: registration.subscriptionMonthlyCents ?? subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration))?.monthlyCents ?? null,
    parishDashboardTokenTemporary: Boolean(registration.parishDashboardTokenTemporary),
    priestEmail: registration.priestEmail || "",
    treasurerEmail: registration.treasurerEmail || "",
    setup: {
      contactInfoVerified: true,
      stripeConnected: stripeReady(registration),
      billingActive: subscriptionReady(registration),
      temporaryPassword: Boolean(registration.parishDashboardTokenTemporary)
    },
    subscriptionTiers: publicSubscriptionTiers(),
    platformFee: registration.platformFee || "",
    recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
    candlesEnabled: registration.candlesEnabled ?? true,
    commemorationsEnabled: registration.commemorationsEnabled ?? true,
    funds: Array.isArray(registration.funds) ? registration.funds : [],
    campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : [],
    ein: registration.ein || ""
  };
}

async function handleParishDashboard(request, env, parishId) {
  const limited = await rateLimit(
    request,
    env,
    request.method === "PATCH" ? "parish-dashboard-write" : "parish-auth",
    { limit: request.method === "PATCH" ? 20 : 40, windowSeconds: 300 }
  );
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (request.method === "GET") {
    const { registration } = found;
    return json({
      parish: parishDashboardPayload(parishId, registration)
    });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const current = found.registration;
    const requestedPassword = body.newDashboardPassword !== undefined
      ? String(body.newDashboardPassword || "").trim()
      : "";
    if (requestedPassword && requestedPassword.length < 8) {
      return json({ error: "Dashboard password must be at least 8 characters." }, { status: 400 });
    }

    let updated = {
      ...current,
      parishName: String(body.parishName ?? current.parishName ?? "").trim() || current.parishName || "",
      addressLine1: String(body.addressLine1 ?? current.addressLine1 ?? "").trim(),
      addressLine2: String(body.addressLine2 ?? current.addressLine2 ?? "").trim(),
      city: String(body.city ?? current.city ?? "").trim(),
      state: String(body.state ?? current.state ?? "").trim(),
      postalCode: String(body.postalCode ?? current.postalCode ?? "").trim(),
      country: String(body.country ?? current.country ?? "US").trim() || "US",
      website: body.website ?? current.website ?? "",
      liturgicalCalendar: body.liturgicalCalendar || current.liturgicalCalendar || "julian",
      patronalFeast: String(body.patronalFeast ?? current.patronalFeast ?? "").trim(),
      givingStatus: body.givingStatus || current.givingStatus || "active",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      ein: String(body.ein ?? current.ein ?? "").trim().replace(/[^0-9-]/g, ""),
      parishUpdatedAt: new Date().toISOString()
    };

    let nextSession = null;
    if (requestedPassword) {
      updated = await applyParishDashboardPassword(updated, requestedPassword, { temporary: false });
      updated = {
        ...updated,
        parishDashboardSessions: []
      };
      nextSession = await issueParishDashboardSession(updated);
      updated = nextSession.registration;
    }

    await saveRegistrationRecord(env, found.key, updated, current);
    return json({
      ok: true,
      parish: updated,
      token: nextSession?.token || "",
      expiresAt: nextSession?.expiresAt || ""
    });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleParishSession(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const password = String(body.password || "").trim();
  if (!(await verifyParishDashboardPassword(found.registration, password))) {
    return unauthorized();
  }

  const session = await issueParishDashboardSession(found.registration);
  await saveRegistrationRecord(env, found.key, session.registration, found.registration);

  return json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    parish: parishDashboardPayload(parishId, session.registration)
  });
}

async function handleParishPasswordResetRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-password-reset-request", { limit: 6, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = String(body.parishId || "").trim();
  const email = normalizeEmail(body.email);
  if (!parishId || !email) return json({ error: "Parish ID and email are required" }, { status: 422 });

  const generic = { ok: true, message: "If that parish and contact email match our records, a reset link has been sent." };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json(generic);

  const registration = found.registration;
  const contactEmails = Array.from(new Set([
    normalizeEmail(registration.priestEmail),
    normalizeEmail(registration.treasurerEmail)
  ].filter(Boolean)));
  if (!contactEmails.includes(email)) return json(generic);

  const resetToken = generateSecret("parish_reset");
  const resetSalt = generateSecret("parish_reset_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, "")}/parish/login?reset=1&parish=${encodeURIComponent(registration.parishId || parishId)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...registration,
    parishPasswordResetSalt: resetSalt,
    parishPasswordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    parishPasswordResetSentAt: new Date().toISOString(),
    parishPasswordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    parishUpdatedAt: new Date().toISOString()
  };

  const emailResult = await sendParishPasswordResetEmail(env, appUrl, updated, resetUrl, contactEmails);
  updated.parishPasswordResetEmailStatus = emailResult.status || "";
  updated.parishPasswordResetEmailDetail = emailResult.detail || "";
  await saveRegistrationRecord(env, found.key, updated, registration);

  return json({
    ...generic,
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    resetUrl: emailResult.status === "not_configured" ? resetUrl : undefined
  });
}

async function handleParishPasswordResetConfirm(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-password-reset-confirm", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = String(body.parishId || "").trim();
  const token = String(body.token || "");
  const newPassword = String(body.newPassword || body.password || "").trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || "").trim();
  if (!parishId || !token) return json({ error: "Parish ID and reset token are required" }, { status: 422 });
  if (newPassword.length < 8) return json({ error: "Dashboard password must be at least 8 characters." }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: "Dashboard passwords do not match." }, { status: 422 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return unauthorized();
  const current = found.registration;
  if (!current.parishPasswordResetSalt || !current.parishPasswordResetTokenHash) {
    return json({ error: "Reset link is missing or expired. Please request a new link." }, { status: 410 });
  }
  if (current.parishPasswordResetExpiresAt && new Date(current.parishPasswordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: "Reset link expired. Please request a new link." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${current.parishPasswordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, current.parishPasswordResetTokenHash)) return unauthorized();

  let updated = await applyParishDashboardPassword({
    ...current,
    parishPasswordResetSalt: "",
    parishPasswordResetTokenHash: "",
    parishPasswordResetSentAt: "",
    parishPasswordResetExpiresAt: "",
    parishPasswordResetEmailStatus: "",
    parishPasswordResetEmailDetail: "",
    parishDashboardSessions: [],
    parishUpdatedAt: new Date().toISOString()
  }, newPassword, { temporary: false });
  updated = {
    ...updated,
    parishDashboardSessions: []
  };
  await saveRegistrationRecord(env, found.key, updated, current);

  return json({ ok: true, updatedAt: updated.parishDashboardTokenUpdatedAt || new Date().toISOString() });
}

function handleLiturgicalCalendar(request) {
  const url = new URL(request.url);
  const year = Math.max(1900, Math.min(2199, Number(url.searchParams.get("year")) || new Date().getFullYear()));
  const calendar = String(url.searchParams.get("calendar") || "julian").toLowerCase().includes("gregorian") ? "gregorian" : "julian";
  const nextFrom = url.searchParams.get("from");
  const fromDate = nextFrom && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom)
    ? new Date(`${nextFrom}T00:00:00`)
    : new Date();

  return json({
    ok: true,
    year,
    calendar,
    label: calendarLabel(calendar),
    pascha: orthodoxPascha(year),
    feasts: liturgicalFeastsForYear(year, calendar),
    nextFeast: nextLiturgicalFeast(calendar, fromDate)
  });
}

function cleanAssetRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/") return request;
  if (url.pathname === "/admin") {
    url.pathname = "/admin.html";
    return new Request(url, request);
  }
  if (url.pathname === "/parish/dashboard") {
    url.pathname = "/parish/dashboard.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give" || url.pathname === "/give/" || url.pathname === "/giving" || url.pathname === "/giving/") {
    url.pathname = "/give/index.html";
    return new Request(url, request);
  }
  if (url.pathname === "/donor" || url.pathname === "/donor/") {
    url.pathname = "/donor/index.html";
    return new Request(url, request);
  }
  if (url.pathname === "/donor/dashboard") {
    url.pathname = "/donor/index.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/donor/") && !url.pathname.includes(".")) {
    url.pathname = `${url.pathname}.html`;
    return new Request(url, request);
  }
  if (url.pathname === "/give/form") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/parish-giving") {
    url.pathname = "/give/parish-giving.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/give/parish-giving/") && url.pathname.split("/").filter(Boolean).length >= 3) {
    url.pathname = "/give/parish-giving/index.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/parish-giving") {
    url.pathname = "/give/parish-giving.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/recurring-donations") {
    url.pathname = "/give/recurring-donations.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/recurring-donations") {
    url.pathname = "/give/recurring-donations.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/fundraising") {
    url.pathname = "/give/fundraising.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/fundraising") {
    url.pathname = "/give/fundraising.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/event-payments") {
    url.pathname = "/give/event-payments.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/event-payments") {
    url.pathname = "/give/event-payments.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/find_parish") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/parish-list") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/st-seraphim-mission") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/give/") && !url.pathname.includes(".")) {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (!url.pathname.includes(".")) {
    url.pathname = `${url.pathname}.html`;
    return new Request(url, request);
  }
  return request;
}

function formatCommemorationNames(entries, field) {
  const names = entries.flatMap((entry) => Array.isArray(entry[field]) ? entry[field] : []);
  if (!names.length) return "<p style=\"margin:0;color:#6F6A60;\">No names submitted.</p>";
  return `<ul style="margin:0 0 0 18px;padding:0;color:#171715;line-height:1.7;">${names.map((name) => `<li>${htmlEscape(name)}</li>`).join("")}</ul>`;
}

async function sendWeeklyCommemorationEmails(env, scheduledTime) {
  const registrations = await loadAllRegistrations(env, { status: "verified" });
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const { start, end } = weekWindow(new Date(scheduledTime || Date.now()));

  const results = [];
  for (const registration of registrations) {
    if (!registration.parishId || !registration.priestEmail) continue;
    const entries = await loadCommemorationEntries(env, registration.parishId, start, end);
    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
      to: [registration.priestEmail],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
      subject: `Weekly AGAPAY commemorations for ${registration.parishName || "your parish"}`,
      html: agapayEmailHtml(appUrl, "Weekly Commemoration List", `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Here is this week's AGAPAY commemoration list for <strong>${htmlEscape(registration.parishName || "your parish")}</strong>.</p>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Living</p>
          ${formatCommemorationNames(entries, "living")}
        </div>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Departed</p>
          ${formatCommemorationNames(entries, "departed")}
        </div>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6F6A60;">This message is sent every Saturday morning, even when no names were submitted.</p>
      `),
      text: `Weekly AGAPAY commemorations for ${registration.parishName || "your parish"}\n\nLiving:\n${entries.flatMap((entry) => entry.living || []).join("\n") || "No names submitted."}\n\nDeparted:\n${entries.flatMap((entry) => entry.departed || []).join("\n") || "No names submitted."}`
    });
    results.push({ parishId: registration.parishId, status: email.status });
  }

  return results;
}


// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN FEATURE
// ═══════════════════════════════════════════════════════════════════════════

function isSocialCrawler(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  return ["facebookexternalhit","facebot","twitterbot","twitter.com","whatsapp",
    "slackbot","slack-imgproxy","linkedinbot","telegrambot","discordbot",
    "applebot","googlebot","bingbot","embedly","pinterest"].some(b => ua.includes(b));
}


function campaignBotHtml(campaign, parish, canonicalUrl) {
  const title  = `${campaign.name} — ${parish.name}`;
  const raised = (Number(campaign.raisedCents || 0) / 100).toLocaleString("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 });
  const goal   = campaign.goalCents ? (Number(campaign.goalCents) / 100).toLocaleString("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }) : null;
  const desc   = (campaign.description || `Support ${parish.name} through AGAPAY.`).substring(0, 240).replace(/"/g, "&quot;").replace(/\n/g, " ");
  const img    = campaign.coverPhotoUrl || parish.imageUrl || "https://agapay.app/images/og-default.png";
  const progress = goal ? `${raised} raised of ${goal} goal` : `${raised} raised`;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<title>${title} | AGAPAY</title>
<meta name="description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="AGAPAY"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${progress} · ${desc}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${canonicalUrl}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${progress} · ${desc}"/>
<meta name="twitter:image" content="${img}"/>
<meta http-equiv="refresh" content="0; url=${canonicalUrl}"/>
</head><body><p><a href="${canonicalUrl}">${title}</a> — ${progress}</p></body></html>`;
}

async function handleCampaignPage(request, env, url) {
  const parts    = url.pathname.split("/").filter(Boolean);
  const slug     = parts[2];
  const parishId = url.searchParams.get("parish") || "";
  if (slug && parishId && isSocialCrawler(request)) {
    try {
      const registration = await findRegistrationByParishId(env, parishId);
      if (registration) {
        const parish   = parishDashboardPayload(registration);
        const allCamps = [...(registration.campaigns || []), ...(registration.feastCampaigns || [])];
        const campaign = allCamps.find(c => (c.slug || slugify(c.name)) === slug);
        if (campaign) {
          const gifts   = await loadParishPaidOfferings(env, parishId, 500);
          const totals  = campaignRaisedTotals(campaign, gifts);
          const enriched = { ...campaign, ...totals };
          const canonicalUrl = `${new URL(request.url).origin}/give/parish-giving/${encodeURIComponent(slug)}?parish=${encodeURIComponent(parishId)}`;
          return new Response(campaignBotHtml(enriched, parish, canonicalUrl), {
            headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" }
          });
        }
      }
    } catch (_) { /* fall through */ }
  }
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/give/parish-giving/index.html";
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

async function handleCampaignApi(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const parishId = url.searchParams.get("parish") || "";
  const slug     = url.searchParams.get("slug") || url.searchParams.get("c") || "";
  if (!parishId || !slug) return json({ error: "parish and slug are required" }, { status: 400 });
  const registration = await findRegistrationByParishId(env, parishId);
  if (!registration) return json({ error: "Parish not found" }, { status: 404 });
  const allCamps = [...(registration.campaigns || []), ...(registration.feastCampaigns || [])];
  const campaign = allCamps.find(c => (c.slug || slugify(c.name)) === slug);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const gifts   = await loadParishPaidOfferings(env, parishId, 1000);
  const totals  = campaignRaisedTotals(campaign, gifts);
  const enriched = { ...campaign, ...totals };
  const parish = parishDashboardPayload(registration);
  return json({
    campaign: enriched,
    parish: { id: parish.parishId, parishId: parish.parishId, name: parish.name, imageUrl: parish.imageUrl, city: parish.city, state: parish.state }
  });
}

async function handleCampaignUpload(request, env, url) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const pathParts  = url.pathname.split("/").filter(Boolean);
  const parishId   = pathParts[3];
  const campaignId = url.searchParams.get("campaign") || "general";
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found" }, { status: 404 });
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!token || token !== found.parishDashboardToken) return unauthorized();
  if (!env.CAMPAIGN_ASSETS) return json({ error: "Image storage not configured — please enable R2 in Cloudflare dashboard" }, { status: 503 });
  const contentType = request.headers.get("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return json({ error: "Only image uploads accepted" }, { status: 400 });
  const ext  = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const key  = `campaigns/${parishId}/${campaignId}/${crypto.randomUUID()}.${ext}`;
  const body = await request.arrayBuffer();
  if (body.byteLength > 10 * 1024 * 1024) return json({ error: "Image must be under 10 MB" }, { status: 413 });
  await env.CAMPAIGN_ASSETS.put(key, body, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000" } });
  const baseUrl  = env.CAMPAIGN_ASSETS_URL || "https://pub-agapay-campaign-assets.r2.dev";
  const photoUrl = `${baseUrl.replace(/\/+$/, "")}/${key}`;
  return json({ ok: true, url: photoUrl, key });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendWeeklyCommemorationEmails(env, event.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/index.html") {
      url.pathname = "/";
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === "GET" && (url.pathname === "/give" || url.pathname === "/give/" || url.pathname === "/give.html" || url.pathname === "/giving/index.html")) {
      url.pathname = "/giving";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" && (url.pathname === "/give/parish-giving" || url.pathname === "/give/parish-giving.html" || url.pathname === "/giving/parish-giving.html")) {
      url.pathname = "/giving/parish-giving";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" && (url.pathname === "/give/recurring-donations" || url.pathname === "/give/recurring-donations.html" || url.pathname === "/giving/recurring-donations.html")) {
      url.pathname = "/giving/recurring-donations";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" && (url.pathname === "/give/fundraising" || url.pathname === "/give/fundraising.html" || url.pathname === "/giving/fundraising.html")) {
      url.pathname = "/giving/fundraising";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" && (url.pathname === "/give/event-payments" || url.pathname === "/give/event-payments.html" || url.pathname === "/giving/event-payments.html")) {
      url.pathname = "/giving/event-payments";
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
      return handleStripeWebhook(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/parishes") return handleParishes(request, env);
    if (request.method === "GET" && url.pathname === "/api/platform/summary") return handlePublicPlatformSummary(env);
    if (request.method === "GET" && url.pathname === "/api/subscription-tiers") {
      return json({ tiers: publicSubscriptionTiers() });
    }
    if (request.method === "GET" && url.pathname === "/api/marketplace/catalog") {
      return handleMarketplaceCatalog(request);
    }
    if (request.method === "GET" && url.pathname === "/api/security/config") {
      return handleSecurityConfig(env);
    }
    if (request.method === "GET" && url.pathname === "/api/liturgical-calendar") {
      return handleLiturgicalCalendar(request);
    }
    if (request.method === "POST" && url.pathname === "/api/registrations") return handleRegistrations(request, env);
    if (url.pathname === "/api/donor/signup") {
      return handleDonorSignup(request, env);
    }
    if (url.pathname === "/api/donor/login") {
      return handleDonorLogin(request, env);
    }
    if (url.pathname === "/api/donor/password-reset-request") {
      return handleDonorPasswordResetRequest(request, env);
    }
    if (url.pathname === "/api/donor/password-reset-confirm") {
      return handleDonorPasswordResetConfirm(request, env);
    }
    if (url.pathname === "/api/donor/verify") {
      return handleDonorVerify(request, env);
    }
    if (url.pathname === "/donor/verify" || url.pathname === "/donor/verify/") {
      return handleDonorVerifyPage(request, env);
    }
    if (url.pathname === "/api/donor/session") {
      return handleDonorSession(request, env);
    }
    if (url.pathname === "/api/donor/claim-checkout") {
      return handleDonorClaimCheckout(request, env);
    }
    if (url.pathname === "/api/donor/dashboard") {
      return handleDonorDashboard(request, env);
    }
    if (url.pathname === "/api/donor/offerings") {
      return handleDonorOfferings(request, env);
    }
    if (url.pathname === "/api/donor/subscription-portal") {
      return handleDonorSubscriptionPortal(request, env);
    }
    if (url.pathname === "/api/donor/commemorations") {
      return handleDonorCommemorations(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/registrations") {
      return handleAdminRegistrations(request, env);
    }
    if (url.pathname === "/api/admin/session") {
      return handleAdminSession(request, env);
    }
      if (request.method === "GET" && url.pathname === "/api/admin/platform-summary") {
        return handleAdminPlatformSummary(request, env);
      }
      if (request.method === "GET" && url.pathname === "/api/admin/release-status") {
        return handleAdminReleaseStatus(request, env);
      }
      if (url.pathname === "/api/admin/rebuild-indexes") {
        return handleAdminRebuildIndexes(request, env);
      }
    if (url.pathname === "/api/admin/migrate-kv-to-d1") {
      return handleAdminMigrateKvToD1(request, env);
    }
    if (url.pathname === "/api/admin/password") {
      return handleAdminPassword(request, env);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/subscription-checkout")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/subscription-checkout", ""));
      return handleSubscriptionCheckout(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-onboarding")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-onboarding", ""));
      return handleStripeOnboarding(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-refresh")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-refresh", ""));
      return handleStripeRefresh(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/giving-summary")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/giving-summary", ""));
      return handleAdminRegistrationGivingSummary(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/dashboard-invite")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/dashboard-invite", ""));
      return handleDashboardInvite(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", ""));
      return handleAdminRegistrationDetail(request, env, reference);
    }
    if (url.pathname === "/api/parish/password-reset-request") {
      return handleParishPasswordResetRequest(request, env);
    }
    if (url.pathname === "/api/parish/password-reset-confirm") {
      return handleParishPasswordResetConfirm(request, env);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/session")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/session", ""));
      return handleParishSession(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stripe-onboarding")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stripe-onboarding", ""));
      return handleParishStripeOnboarding(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stripe-refresh")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stripe-refresh", ""));
      return handleParishStripeRefresh(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/subscription-checkout")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/subscription-checkout", ""));
      return handleParishSubscriptionCheckout(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/subscription-refresh")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/subscription-refresh", ""));
      return handleParishSubscriptionRefresh(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/subscription-portal")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/subscription-portal", ""));
      return handleParishSubscriptionPortal(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/commemorations")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/commemorations", ""));
      return handleParishCommemorations(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/giving-summary")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/giving-summary", ""));
      return handleParishGivingSummary(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/giving-history")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/giving-history", ""));
      return handleParishGivingHistory(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/recurring-health")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/recurring-health", ""));
      return handleParishRecurringHealth(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/payout-diagnostics")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/payout-diagnostics", ""));
      return handleParishPayoutDiagnostics(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", ""));
      return handleParishDashboard(request, env, parishId);
    }
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") {
      return handleCheckout(request, env);
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/checkout-session-status") {
      return handleCheckoutSessionStatus(request, env);
    }

    // Campaign page — social-crawler bot detection + static shell for humans
    if (url.pathname.startsWith("/give/parish-giving/") && url.pathname.split("/").filter(Boolean).length >= 3) {
      return handleCampaignPage(request, env, url);
    }

    // Campaign public API
    if (url.pathname === "/api/campaign") {
      return handleCampaignApi(request, env, url);
    }

    // Campaign photo upload (parish-authenticated)
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/campaign-upload")) {
      return handleCampaignUpload(request, env, url);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(cleanAssetRequest(request));
  }
};
