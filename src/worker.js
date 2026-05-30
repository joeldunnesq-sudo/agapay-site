const ADMIN_PASSWORD_KV_KEY = "__agapay_admin_password";
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

async function d1First(env, sql, ...params) {
  if (!d1(env)) return null;
  return d1(env).prepare(sql).bind(...params).first();
}

async function d1All(env, sql, ...params) {
  if (!d1(env)) return [];
  const result = await d1(env).prepare(sql).bind(...params).all();
  return result.results || [];
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

function publicDonor(donor) {
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

async function requireAdmin(request, env) {
  return verifyAdminPassword(env, getAdminToken(request));
}

function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
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

function checkoutFinancials(amountCents, coverFees, recurring) {
  const totalTransactionFeeCents = Math.round(amountCents * 0.05 + 30);
  if (recurring) {
    const chargeCents = coverFees
      ? grossUpForStripeProcessingFeeCents(amountCents)
      : amountCents;
    return {
      chargeCents,
      estimatedStripeFeeCents: estimateStripeProcessingFeeCents(chargeCents),
      agapayFeeCents: 0,
      totalTransactionFeeCents
    };
  }

  const chargeCents = coverFees ? amountCents + totalTransactionFeeCents : amountCents;
  const estimatedStripeFeeCents = estimateStripeProcessingFeeCents(chargeCents);
  return {
    chargeCents,
    estimatedStripeFeeCents,
    agapayFeeCents: Math.max(0, totalTransactionFeeCents - estimatedStripeFeeCents),
    totalTransactionFeeCents
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
  const token = htmlEscape(registration.parishDashboardToken || "");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `Set up Stripe giving for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "AGAPAY Stripe onboarding", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">AGAPAY is ready for <strong>${parishName}</strong> to complete Stripe onboarding so online gifts can be routed to the parish's connected Stripe account.</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#171715;"><strong>Please complete Stripe onboarding as soon as possible.</strong> Once Stripe approves and connects the account, your parish can begin receiving donations through AGAPAY.</p>
      <p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard</a></p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard credentials</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish password:</strong> ${token}</p>
      </div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">After opening the dashboard, enter the parish ID and password, then use the Stripe onboarding button in the Payments section.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">For security, Stripe onboarding links are created inside AGAPAY after the parish password is entered.</p>
    `),
    text: [
      "AGAPAY Stripe onboarding",
      "",
      `AGAPAY is ready for ${registration.parishName || "your parish"} to complete Stripe onboarding.`,
      "Please complete Stripe onboarding as soon as possible. Once Stripe approves and connects the account, your parish can begin receiving donations through AGAPAY.",
      "",
      `Open parish dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      `Parish password: ${registration.parishDashboardToken || ""}`,
      "",
      "After opening the dashboard, enter the parish ID and password, then use the Stripe onboarding button in the Payments section."
    ].join("\n")
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
      <div style="background:#0F2D1F;border-radius:12px;padding:18px 18px;margin:0 0 22px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#B8902F;font-weight:700;">Next step</p>
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
  const living = splitSubmittedNames(metadata.names_living);
  const departed = splitSubmittedNames(metadata.names_departed);
  if (!parishId || (!living.length && !departed.length)) return null;

  const entry = {
    id: sourceId || crypto.randomUUID(),
    parishId,
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
    amountCents: Number(offering.amountCents || 0),
    chargeCents: Number(offering.chargeCents || offering.amountCents || 0),
    agapayFeeCents: Number(offering.agapayFeeCents || 0),
    estimatedStripeFeeCents: Number(offering.estimatedStripeFeeCents || 0),
    coverFees: Boolean(offering.coverFees),
    status: offering.status || "checkout_created",
    paymentStatus: offering.paymentStatus || "pending",
    checkoutSessionId: offering.checkoutSessionId || "",
    checkoutUrl: offering.checkoutUrl || "",
    stripeCustomerId: offering.stripeCustomerId || "",
    stripePaymentIntentId: offering.stripePaymentIntentId || "",
    stripeSubscriptionId: offering.stripeSubscriptionId || "",
    namesLiving: offering.namesLiving || "",
    namesDeparted: offering.namesDeparted || "",
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

function donorSummaryFromOfferings(offerings, commemorations = []) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const ytd = offerings.filter((item) => new Date(item.createdAt || 0).getUTCFullYear() === year);
  const paid = ytd.filter((item) => item.paymentStatus === "paid" || item.status === "paid" || item.status === "completed");
  const recurring = offerings.filter((item) => item.frequency && item.frequency !== "once");
  const ytdCents = paid.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const monthCents = paid
    .filter((item) => {
      const created = new Date(item.createdAt || 0);
      return created.getUTCFullYear() === year && created.getUTCMonth() === month;
    })
    .reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  return {
    year,
    ytdCents,
    monthCents,
    offeringCount: ytd.length,
    paidOfferingCount: paid.length,
    recurringCount: recurring.length,
    commemorationCount: commemorations.reduce((sum, entry) => sum + (entry.living?.length || 0) + (entry.departed?.length || 0), 0),
    lastOfferingAt: offerings[0]?.createdAt || ""
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

async function verifiedRegistrationParishes(env) {
  if (d1(env)) {
    const rows = await d1All(
      env,
      "SELECT data FROM registrations WHERE status = 'verified' ORDER BY received_at DESC LIMIT 1000"
    );
    if (rows.length) {
      return rows
        .map(parseJsonRow)
        .map(parishFromRegistration)
        .filter(Boolean);
    }
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];

  const keys = await listKvKeys(env, { limit: 1000 });
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

  return verified;
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

async function handleParishes(env) {
  const dynamicParishes = await verifiedRegistrationParishes(env);

  return json({ parishes: dynamicParishes });
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
    agapayFeeCents
  } = checkoutFinancials(amountCents, Boolean(body.coverFees), recurring);
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
    cover_fees: body.coverFees ? "true" : "false",
    names_living: body.namesLiving || "",
    names_departed: body.namesDeparted || ""
  };

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customer.body.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  });

  for (const [key, value] of Object.entries(checkoutMetadata)) {
    form.set(`metadata[${key}]`, value);
    if (recurring) {
      form.set(`subscription_data[metadata][${key}]`, value);
    } else {
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }
  }

  // AGAPAY's 5% + $0.30 fee applies to one-time donations only. Recurring
  // gifts intentionally omit a Connect application fee so Stripe renewals do
  // not drift away from the published pricing model.
  if (!recurring) {
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
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || "";
  const paymentStatus = session.payment_status || offering.paymentStatus || "pending";
  let status = offering.status || "checkout_created";
  if (paymentStatus === "paid" || session.status === "complete") status = "completed";
  if (session.status === "expired") status = "expired";

  const updated = await updateDonorOfferingByCheckout(env, sessionId, {
    status,
    paymentStatus,
    stripeCustomerId: session.customer || offering.stripeCustomerId || "",
    stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
    stripeSubscriptionId: session.subscription || offering.stripeSubscriptionId || "",
    completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || ""
  });

  return json({
    ok: true,
    checkoutSessionId: sessionId,
    status: updated?.status || status,
    paymentStatus: updated?.paymentStatus || paymentStatus,
    paymentIntentId: updated?.stripePaymentIntentId || paymentIntentId || ""
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

  const offerings = await loadDonorOfferings(env, donor.email, 100);
  const commemorations = await loadDonorCommemorations(env, donor.email, 100);
  const summary = donorSummaryFromOfferings(offerings, commemorations);
  let parish = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId(env, donor.defaultParishId);
    if (found) parish = parishFromRegistration(found.registration);
  }

  return json({
    donor: publicDonor(donor),
    parish,
    summary,
    recentOfferings: offerings.slice(0, 5),
    recentCommemorations: commemorations.slice(0, 5)
  });
}

async function handleDonorOfferings(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const offerings = await loadDonorOfferings(env, donor.email, 100);
  return json({ offerings, summary: donorSummaryFromOfferings(offerings, await loadDonorCommemorations(env, donor.email, 100)) });
}

async function handleDonorCommemorations(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "GET") {
    const entries = await loadDonorCommemorations(env, donor.email, 100);
    return json({ entries });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "donor-commemorations", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = body.parishId || donor.defaultParishId;
  const living = splitSubmittedNames(body.namesLiving);
  const departed = splitSubmittedNames(body.namesDeparted);
  if (!parishId) return json({ error: "Parish is required" }, { status: 422 });
  if (!living.length && !departed.length) return json({ error: "At least one living or departed name is required" }, { status: 422 });

  const parish = await findCheckoutParish(env, parishId);
  if (!parish || parish.status !== "verified") return json({ error: "Verified parish not found" }, { status: 404 });

  const entry = await storeCommemorationEntry(env, crypto.randomUUID(), {
    parish_id: parish.id,
    parish_name: parish.name || "",
    donor_email: donor.email,
    donor_name: donor.donorName || donor.householdName || "",
    gift_type: body.giftType || "commemoration",
    frequency: "once",
    names_living: body.namesLiving || "",
    names_departed: body.namesDeparted || ""
  }, {
    parishId: parish.id,
    donorEmail: donor.email,
    donorName: donor.donorName || donor.householdName || "",
    giftType: body.giftType || "commemoration",
    amountCents: 0
  });

  await storeDonorOffering(env, {
    id: `commemoration-${entry.id}`,
    donorEmail: donor.email,
    donorName: donor.donorName || donor.householdName || "",
    parishId: parish.id,
    parishName: parish.name,
    giftType: body.giftType || "commemoration",
    title: `${parish.name} - commemoration submission`,
    amountCents: 0,
    chargeCents: 0,
    status: "queued",
    paymentStatus: "no_payment_required",
    namesLiving: body.namesLiving || "",
    namesDeparted: body.namesDeparted || "",
    createdAt: entry.createdAt
  });

  return json({ ok: true, entry }, { status: 201 });
}

async function handleAdminRegistrations(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) {
    return missingProductionStoreResponse();
  }

  if (d1(env)) {
    const rows = await d1All(env, "SELECT data FROM registrations ORDER BY received_at DESC LIMIT 1000");
    if (rows.length) {
      const registrations = rows.map((row) => {
        try {
          const registration = parseJsonRow(row);
          return {
            reference: registration.reference || "",
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
        } catch {
          return { reference: "", status: "unreadable" };
        }
      });
      return json({ registrations, cursor: null, source: "d1" });
    }
  }

  const keys = await listKvKeys(env, { limit: 1000 });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      registrations.push({
        reference: registration.reference || key.name,
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
      });
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return json({ registrations, cursor: null });
}

async function loadAllRegistrations(env) {
  if (d1(env)) {
    const rows = await d1All(env, "SELECT data FROM registrations ORDER BY received_at DESC LIMIT 1000");
    if (rows.length) return rows.map(parseJsonRow).filter(Boolean);
  }

  return loadAllKvRegistrations(env);
}

async function loadAllKvRegistrations(env) {
  if (!env.AGAPAY_REGISTRATIONS) return [];

  const keys = await listKvKeys(env, { limit: 1000 });
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

  const registrations = await loadAllRegistrations(env);
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

async function handleAdminReleaseStatus(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();

  const registrations = hasProductionStore(env) ? await loadAllRegistrations(env) : [];
  const verified = registrations.filter((registration) => registration.status === "verified");
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
      registrationCount: registrations.length,
      verifiedCount: verified.length,
      stripeReadyCount: verified.filter((registration) => stripeReady(registration)).length,
      subscriptionReadyCount: verified.filter((registration) => subscriptionReady(registration)).length
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
  } else {
    await env.AGAPAY_REGISTRATIONS.put(ADMIN_PASSWORD_KV_KEY, passwordRecord);
  }
  return json({ ok: true, updatedAt: new Date().toISOString() });
}

async function handleAdminRegistrationDetail(request, env, reference) {
  const limited = await rateLimit(
    request,
    env,
    request.method === "PATCH" ? "admin-registration-write" : "admin-auth",
    { limit: request.method === "PATCH" ? 30 : 80, windowSeconds: 300 }
  );
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
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
      reviewedBy: body.reviewedBy ?? current.reviewedBy ?? "",
      verificationSource: body.verificationSource ?? current.verificationSource ?? "",
      bishopOrAuthority: body.bishopOrAuthority ?? current.bishopOrAuthority ?? "",
      dioceseOrDeanery: body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? "",
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
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt: nextStatus === "verified"
        ? current.publicProfileCreatedAt || new Date().toISOString()
        : current.publicProfileCreatedAt
    };

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
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return createSubscriptionCheckoutForRegistration(request, env, reference, registration, body, "/admin");
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
    await storeCommemorationEntry(env, object.id, object.metadata || {}, {
      amountCents: object.amount_total || object.amount_subtotal || 0,
      donorEmail: object.metadata?.donor_email || object.customer_details?.email || object.customer_email || "",
      donorName: object.metadata?.donor_name || object.customer_details?.name || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
    await updateDonorOfferingByCheckout(env, object.id, {
      status,
      paymentStatus,
      stripeCustomerId: object.customer || "",
      stripePaymentIntentId: object.payment_intent || "",
      stripeSubscriptionId: object.subscription || "",
      completedAt: status === "completed" ? (object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()) : ""
    });
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
    await updateDonorOfferingByPaymentIntent(env, object.id, {
      status: "completed",
      paymentStatus: object.status || "succeeded",
      stripeCustomerId: object.customer || "",
      completedAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
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
    await storeCommemorationEntry(env, object.id, metadata, {
      amountCents: object.amount_paid || 0,
      donorEmail: metadata.donor_email || object.customer_email || object.customer_details?.email || "",
      donorName: metadata.donor_name || object.customer_name || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
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
        amountCents: object.amount_paid || 0,
        chargeCents: object.amount_paid || 0,
        status: "completed",
        paymentStatus: "paid",
        stripeCustomerId: object.customer || "",
        stripeSubscriptionId: object.subscription || "",
        namesLiving: metadata.names_living || "",
        namesDeparted: metadata.names_departed || "",
        createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
      });
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
  if (!(await requireAdmin(request, env))) return unauthorized();
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
  await saveRegistrationRecord(env, reference, updated, result.registration);

  return json({ ok: true, onboardingUrl: result.onboardingUrl, email, registration: updated });
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
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const registration = await loadRegistrationByReference(env, reference);
  if (!registration) return json({ error: "Registration not found" }, { status: 404 });

  const refreshed = await refreshStripeStatusForRegistration(env, reference, registration);
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });

  return json({ ok: true, registration: refreshed.registration });
}

async function handleParishStripeRefresh(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  if (!(await requireAdmin(request, env))) return unauthorized();
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
  await saveRegistrationRecord(env, reference, updated, withToken);

  return json({ ok: true, email, registration: updated });
}

async function handleParishStripeOnboarding(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
  let giftCount = 0;
  let lastGiftAt = "";

  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.paid === false) continue;

    const created = new Date((charge.created || 0) * 1000);
    if (created.getUTCFullYear() !== year) continue;

    const netCents = Math.max(0, Number(charge.amount_captured || charge.amount || 0) - Number(charge.amount_refunded || 0));
    if (!netCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    giftCount += 1;

    const giverKey = charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    if (!lastGiftAt || created.toISOString() > lastGiftAt) lastGiftAt = created.toISOString();
  }

  return {
    year,
    currency: "usd",
    ytdCents,
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
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
  if (!(await verifyParishDashboardPassword(found.registration, token))) {
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
      givingStatus: body.givingStatus || current.givingStatus || "active",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishUpdatedAt: new Date().toISOString()
    };

    if (requestedPassword) {
      updated = await applyParishDashboardPassword(updated, requestedPassword, { temporary: false });
    }

    await saveRegistrationRecord(env, found.key, updated, current);
    return json({ ok: true, parish: updated });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
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
  if (url.pathname === "/donor" || url.pathname === "/donor/") {
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
  if (url.pathname.startsWith("/give/")) {
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
  const registrations = await loadAllRegistrations(env);
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const { start, end } = weekWindow(new Date(scheduledTime || Date.now()));

  const results = [];
  for (const registration of registrations) {
    if (registration.status !== "verified" || !registration.parishId || !registration.priestEmail) continue;
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

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendWeeklyCommemorationEmails(env, event.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
      return handleStripeWebhook(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/parishes") return handleParishes(env);
    if (request.method === "GET" && url.pathname === "/api/subscription-tiers") {
      return json({ tiers: publicSubscriptionTiers() });
    }
    if (request.method === "GET" && url.pathname === "/api/marketplace/catalog") {
      return handleMarketplaceCatalog(request);
    }
    if (request.method === "GET" && url.pathname === "/api/security/config") {
      return handleSecurityConfig(env);
    }
    if (request.method === "POST" && url.pathname === "/api/registrations") return handleRegistrations(request, env);
    if (url.pathname === "/api/donor/signup") {
      return handleDonorSignup(request, env);
    }
    if (url.pathname === "/api/donor/login") {
      return handleDonorLogin(request, env);
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
    if (url.pathname === "/api/donor/dashboard") {
      return handleDonorDashboard(request, env);
    }
    if (url.pathname === "/api/donor/offerings") {
      return handleDonorOfferings(request, env);
    }
    if (url.pathname === "/api/donor/commemorations") {
      return handleDonorCommemorations(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/registrations") {
      return handleAdminRegistrations(request, env);
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
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/dashboard-invite")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/dashboard-invite", ""));
      return handleDashboardInvite(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", ""));
      return handleAdminRegistrationDetail(request, env, reference);
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

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(cleanAssetRequest(request));
  }
};
