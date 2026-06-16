import { calendarLabel, liturgicalFeastsForYear, nextLiturgicalFeast, orthodoxPascha } from "./liturgical-calendar.js";
import {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_MAX,
  ADMIN_SESSION_STORE_KEY,
  ADMIN_SESSION_TTL_MS,
  COMMEMORATION_KEY_PREFIX,
  DONOR_CHECKOUT_INDEX_PREFIX,
  DONOR_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX,
  PARISH_ID_INDEX_PREFIX,
  PARISH_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  RATE_LIMIT_PREFIX,
  STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_EVENT_PREFIX,
  STRIPE_EVENT_PROCESSING_RETRY_MS,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  applyDonorPassword,
  applyParishDashboardPassword,
  claimStripeEvent,
  clampListLimit,
  clientIp,
  createPasswordRecord,
  d1,
  d1All,
  d1First,
  d1GetSetting,
  d1Run,
  d1SetSetting,
  decodeListCursor,
  deleteDonor,
  donorCheckoutIndexKey,
  donorKey,
  donorOfferingKey,
  encodeListCursor,
  finishStripeEvent,
  generateSecret,
  getAdminToken,
  getBearerToken,
  hasProductionStore,
  hashPassword,
  hashSessionToken,
  handleSecurityConfig,
  isSystemKvKey,
  issueAdminSession,
  issueParishDashboardSession,
  json,
  listKvKeys,
  loadAdminSessionStore,
  loadDonor,
  missingProductionStoreResponse,
  normalizeAdminActor,
  normalizeEmail,
  parishIdIndexKey,
  parseAdminSessionStore,
  parseJsonRow,
  parsePasswordRecord,
  parseStoredStripeEvent,
  pbkdf2Hex,
  pruneAdminSessions,
  pruneParishDashboardSessions,
  publicDonor,
  randomHex,
  rateLimit,
  recordStripeEvent,
  resolveAdminSession,
  resolveParishDashboardSession,
  safeParseJsonRow,
  saveAdminSessionStore,
  saveDonor,
  sha256Hex,
  staleStripeProcessingEvent,
  stripeAccountIndexKey,
  stripeEventKey,
  stripePaymentIntentIndexKey,
  stripeSubscriptionIndexKey,
  unauthorized,
  verifyDonorPassword,
  verifyParishDashboardPassword,
  verifyPasswordRecord,
  verifyTurnstileIfConfigured,
} from "./lib/core.js";

import {
  verifyParishDashboardBearer,
  handleParishStripeRefresh,
  handleDashboardInvite,
  handleParishStripeOnboarding,
  handleParishSubscriptionCheckout,
  handleParishSubscriptionRefresh,
  handleParishSubscriptionPortal,
  handleParishCommemorations,
  handleParishPayoutDiagnostics,
  handleParishGivingSummary,
  handleParishGivingHistory,
  handleParishRecurringHealth,
  handleParishDashboard,
  handleParishSession,
  handleParishes,
  handlePublicPlatformSummary,
  handleRegistrations,
  handleCheckout,
  handleCheckoutSessionStatus,
  handleParishPasswordResetRequest,
  handleParishPasswordResetConfirm,
} from "./handlers/parish.js";

import {
  handleDonorClaimCheckout,
  handleDonorSession,
  handleDonorPasswordResetRequest,
  handleDonorPasswordResetConfirm,
  handleDonorSignup,
  handleDonorLogin,
  handleDonorVerify,
  handleDonorVerifyPage,
  handleDonorDashboard,
  handleDonorOfferings,
  handleDonorSubscriptionPortal,
  handleDonorCommemorations,
} from "./handlers/donor.js";

import {
  loadAllRegistrations,
} from "./lib/registrations.js";

import {
  publicSubscriptionTiers,
} from "./lib/subscriptions.js";

import {
  handleAdminRegistrations,
  handleAdminSession,
  handleAdminMigrateKvToD1,
  handleAdminPlatformSummary,
  handleAdminRegistrationGivingSummary,
  handleAdminReleaseStatus,
  handleAdminRebuildIndexes,
  handleAdminPassword,
  handleAdminRegistrationDetail,
} from "./handlers/admin.js";

import {
  handleSubscriptionCheckout,
  handleStripeWebhook,
  handleStripeOnboarding,
  handleStripeRefresh,
} from "./handlers/stripe.js";

import {
  handleParishStewardshipBillingPortal,
  handleParishStewardshipMeetingDetail,
  handleParishStewardshipMeetings,
  handleParishStewardshipSubscribe,
  handleParishStewardshipSummary,
  handleStewardshipHome,
  handleStewardshipSubscribe,
  handleStewardshipBilling,
  handleStewardshipBillingPortal,
  handleStewardshipMeetingList,
  handleStewardshipMeetingNew,
  handleStewardshipMeetingEdit,
  handleStewardshipMeetingPreview,
  handleStewardshipMeetingPdf,
  handleStewardshipWebhook,
} from "./handlers/stewardship.js";

import {
  handleLearnBooks,
  handleLearnCoOp,
  handleLearnDashboard,
  handleLearnFormation,
  handleLearnMeta,
  handleLearnOnboarding,
  handleLearnPlanner,
  handleLearnPrintCenter,
  handleLearnReports,
} from "./learn/handlers.js";

import {
  agapayEmailHtml,
  sendEmail,
} from "./lib/email.js";

import {
  htmlEscape,
} from "./lib/format.js";



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

async function handleWaitlist(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "waitlist", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const product = String(body.product || "").trim().toLowerCase();
  const productLabels = {
    marketplace: "AGAPAY Marketplace",
    directory: "AGAPAY Directory"
  };
  if (!productLabels[product]) return json({ error: "Choose a valid waitlist." }, { status: 400 });

  const email = normalizeEmail(body.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date().toISOString();
  const entry = {
    product,
    productLabel: productLabels[product],
    email,
    source: String(body.source || "myagapay").slice(0, 80),
    createdAt: now,
    updatedAt: now,
    userAgent: request.headers.get("user-agent") || "",
    referer: request.headers.get("referer") || ""
  };
  const key = `waitlist:${product}:${await sha256Hex(email)}`;
  const value = JSON.stringify(entry);

  if (d1(env)) {
    await d1SetSetting(env, key, value);
  } else {
    await env.AGAPAY_REGISTRATIONS.put(key, value);
  }

  const notifyTo = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const emailResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [notifyTo],
    reply_to: email,
    subject: `${productLabels[product]} waitlist signup`,
    html: agapayEmailHtml(appUrl, `${productLabels[product]} waitlist`, `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new person joined the <strong>${htmlEscape(productLabels[product])}</strong> waitlist.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 18px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Email:</strong> ${htmlEscape(email)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Source:</strong> ${htmlEscape(entry.source)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Time:</strong> ${htmlEscape(now)}</p>
      </div>
    `),
    text: `${productLabels[product]} waitlist signup\n\nEmail: ${email}\nSource: ${entry.source}\nTime: ${now}`
  });

  return json({
    ok: true,
    product,
    productLabel: productLabels[product],
    emailSent: emailResult.status === "sent"
  });
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
  if (url.pathname === "/learn" || url.pathname === "/learn/") {
    url.pathname = "/learn/index.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/learn/") && !url.pathname.includes(".")) {
    url.pathname = `${url.pathname}.html`;
    return new Request(url, request);
  }
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
  if (url.pathname === "/myagapay" || url.pathname === "/myagapay/" || url.pathname === "/myagapay/dashboard") {
    url.pathname = "/donor/index.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/myagapay/") && !url.pathname.includes(".")) {
    url.pathname = url.pathname.replace(/^\/myagapay/, "/donor") + ".html";
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
  if (url.pathname === "/giving/features") {
    url.pathname = "/features.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/how-it-works") {
    url.pathname = "/how-it-works.html";
    return new Request(url, request);
  }
  if (url.pathname === "/giving/pricing") {
    url.pathname = "/pricing.html";
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
    if (url.pathname === "/api/waitlist") {
      return handleWaitlist(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/security/config") {
      return handleSecurityConfig(env);
    }
    if (request.method === "GET" && url.pathname === "/api/liturgical-calendar") {
      return handleLiturgicalCalendar(request);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/meta") {
      return handleLearnMeta(env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/dashboard") {
      return handleLearnDashboard(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/planner") {
      return handleLearnPlanner(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/print-center") {
      return handleLearnPrintCenter(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/formation") {
      return handleLearnFormation(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/books") {
      return handleLearnBooks(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/reports") {
      return handleLearnReports(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/co-op") {
      return handleLearnCoOp(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/onboarding") {
      return handleLearnOnboarding(request, env);
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
    if (url.pathname === "/donor/verify" || url.pathname === "/donor/verify/" || url.pathname === "/myagapay/verify" || url.pathname === "/myagapay/verify/") {
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
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship", ""));
      return handleParishStewardshipSummary(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/subscribe")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/subscribe", ""));
      return handleParishStewardshipSubscribe(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/billing-portal")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/billing-portal", ""));
      return handleParishStewardshipBillingPortal(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/meetings")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/meetings", ""));
      return handleParishStewardshipMeetings(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.includes("/stewardship/meetings/")) {
      const parts = url.pathname.replace("/api/parish/dashboard/", "").split("/stewardship/meetings/");
      const parishId = decodeURIComponent(parts[0] || "");
      const meetingId = decodeURIComponent(parts[1] || "");
      return handleParishStewardshipMeetingDetail(request, env, parishId, meetingId);
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

    // ── Stewardship module routes ─────────────────────────────────────────
    if (url.pathname === "/parish/stewardship") return handleStewardshipHome(request, env);
    if (request.method === "POST" && url.pathname === "/parish/stewardship/subscribe") return handleStewardshipSubscribe(request, env);
    if (url.pathname === "/parish/stewardship/billing") return handleStewardshipBilling(request, env);
    if (request.method === "POST" && url.pathname === "/parish/stewardship/billing-portal") return handleStewardshipBillingPortal(request, env);
    if (url.pathname === "/parish/stewardship/annual-meetings") return handleStewardshipMeetingList(request, env);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/parish/stewardship/annual-meetings/new") return handleStewardshipMeetingNew(request, env);
    if (request.method === "POST" && url.pathname === "/webhooks/stewardship") return handleStewardshipWebhook(request, env);
    if (url.pathname.startsWith("/parish/stewardship/annual-meetings/")) {
      const swPath = url.pathname.replace("/parish/stewardship/annual-meetings/", "");
      const [swId, swAction] = swPath.split("/");
      if (swId) {
        if (swAction === "preview") return handleStewardshipMeetingPreview(request, env, swId);
        if (swAction === "pdf") return handleStewardshipMeetingPdf(request, env, swId);
        return handleStewardshipMeetingEdit(request, env, swId);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    // Redirect bare .html URLs to their canonical extensionless form (e.g. /features.html → /features).
    // This prevents Google from indexing both variants and resolves GSC "Alternate page with proper canonical tag".
    if (
      request.method === "GET" &&
      url.pathname.endsWith(".html") &&
      url.pathname !== "/index.html"
    ) {
      const canonical = url.pathname.slice(0, -5);
      url.pathname = canonical;
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(cleanAssetRequest(request));
  }
};
