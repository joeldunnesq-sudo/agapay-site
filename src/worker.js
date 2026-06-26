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
  corsJson,
  corsHeaders,
  corsPreflightResponse,
} from "./lib/core.js";

import {
  verifyParishDashboardBearer,
  findRegistrationByParishId,
  handleParishStripeRefresh,
  handleDashboardInvite,
  handleParishStripeOnboarding,
  handleParishSubscriptionCheckout,
  handleParishSubscriptionRefresh,
  handleParishSubscriptionPortal,
  handleParishCommemorations,
  handleParishPayoutDiagnostics,
  handleParishReconciliation,
  handleParishReconciliationClose,
  handleParishGivingSummary,
  handleParishGivingHistory,
  handleParishRecurringHealth,
  handleParishDashboard,
  handleParishSession,
  handleParishes,
  handleParishCampaignUpload,
  handlePublicPlatformSummary,
  handlePublicCampaign,
  handleRegistrations,
  handleCheckout,
  handleCheckoutSessionStatus,
  handleParishPasswordResetRequest,
  handleParishPasswordResetConfirm,
  requireDonor,
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
  handleAdminLearnScholarship,
  handleAdminLearnCommunity,
  handleAdminLearnSummary,
  handleAdminReleaseStatus,
  handleAdminRebuildIndexes,
  handleAdminPassword,
  handleAdminRegistrationDetail,
  requireAdmin,
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
  handleStewardshipGivingMetricsPage,
  handleStewardshipFinancials,
} from "./handlers/stewardship.js";

import {
  handleLearnBooks,
  handleLearnCommunity,
  handleLearnCommunityFlag,
  handleLearnCommunitySubmit,
  handleLearnCompletionSave,
  handleLearnCoOp,
  handleLearnDashboard,
  handleLearnFormation,
  handleLearnFamilyPlanningSave,
  handleLearnGraceModeSave,
  handleLearnPlannerBlockSave,
  handleLearnBillingCancel,
  handleLearnBillingCheckout,
  handleLearnBillingStatus,
  handleLearnGoogleCalendarCallback,
  handleLearnGoogleCalendarConnect,
  handleLearnGoogleCalendarPreview,
  handleLearnGoogleCalendarStatus,
  handleLearnGoogleCalendarSync,
  handleLearnMeta,
  handleLearnOnboarding,
  handleLearnOnboardingSave,
  handleLearnPlanner,
  handleLearnPrintCenter,
  handleLearnPrintPdf,
  handleLearnReports,
  handleLearnSaints,
  handleLearnTermClose,
} from "./learn/handlers.js";

import {
  agapayEmailHtml,
  sendEmail,
} from "./lib/email.js";

import {
  htmlEscape,
} from "./lib/format.js";

import {
  handleParishInterest,
} from "./handlers/parish-interest.js";

import {
  handleListenSearch,
  handleListenRss,
} from "./handlers/listen.js";

import {
  handleMarketplaceCatalog,
} from "./handlers/marketplace.js";

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

async function handleDirectoryIntake(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "directory-intake", { limit: 6, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (String(body.website || "").trim() && !String(body.website || "").startsWith("http") && String(body.website || "").includes("://")) {
    return json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  const kind = String(body.kind || "business").trim().toLowerCase();
  const allowedKinds = new Set(["business", "church", "ministry", "school", "monastery", "nonprofit", "other"]);
  if (!allowedKinds.has(kind)) return json({ error: "Choose a valid listing type." }, { status: 400 });

  const name = String(body.name || "").trim().slice(0, 160);
  const contactName = String(body.contactName || "").trim().slice(0, 120);
  const contactEmail = normalizeEmail(body.contactEmail);
  if (!name) return json({ error: "Enter the organization name." }, { status: 400 });
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return json({ error: "Enter a valid contact email." }, { status: 400 });
  }
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const now = new Date().toISOString();
  const website = String(body.website || "").trim().slice(0, 240);
  const normalizedWebsite = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  const entry = {
    id: `dir_${await sha256Hex(`${kind}:${name}:${contactEmail}:${now}`)}`,
    status: "submitted",
    kind,
    name,
    contactName,
    contactEmail,
    phone: String(body.phone || "").trim().slice(0, 80),
    address1: String(body.address1 || "").trim().slice(0, 180),
    address2: String(body.address2 || "").trim().slice(0, 120),
    city: String(body.city || "").trim().slice(0, 100),
    state: String(body.state || "").trim().slice(0, 80),
    postalCode: String(body.postalCode || "").trim().slice(0, 30),
    country: String(body.country || "United States").trim().slice(0, 80),
    website: normalizedWebsite,
    jurisdiction: String(body.jurisdiction || "").trim().slice(0, 140),
    category: String(body.category || "").trim().slice(0, 120),
    description: String(body.description || "").trim().slice(0, 1400),
    services: String(body.services || "").trim().slice(0, 800),
    source: String(body.source || "directory-page").slice(0, 80),
    createdAt: now,
    updatedAt: now,
    userAgent: request.headers.get("user-agent") || "",
    referer: request.headers.get("referer") || ""
  };

  const key = `directory:intake:${entry.id}`;
  const value = JSON.stringify(entry);
  if (d1(env)) {
    await d1SetSetting(env, key, value);
  } else {
    await env.AGAPAY_REGISTRATIONS.put(key, value);
  }

  const location = [entry.address1, entry.address2, entry.city, entry.state, entry.postalCode, entry.country].filter(Boolean).join(", ");
  const notifyTo = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const emailResult = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [notifyTo],
    reply_to: contactEmail,
    subject: `AGAPAY Directory submission: ${name}`,
    html: agapayEmailHtml(appUrl, "New Directory Submission", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new organization submitted information for the AGAPAY Directory.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px;margin:0 0 18px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Name:</strong> ${htmlEscape(entry.name)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Type:</strong> ${htmlEscape(entry.kind)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Category:</strong> ${htmlEscape(entry.category || "Not provided")}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Contact:</strong> ${htmlEscape(entry.contactName || "Not provided")} - ${htmlEscape(entry.contactEmail)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Phone:</strong> ${htmlEscape(entry.phone || "Not provided")}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Address:</strong> ${htmlEscape(location || "Not provided")}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Website:</strong> ${htmlEscape(entry.website || "Not provided")}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Submitted:</strong> ${htmlEscape(now)}</p>
      </div>
      ${entry.description ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;"><strong>Description:</strong><br>${htmlEscape(entry.description)}</p>` : ""}
      ${entry.services ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#171715;"><strong>Helpful notes / services:</strong><br>${htmlEscape(entry.services)}</p>` : ""}
    `),
    text: `AGAPAY Directory submission\n\nName: ${entry.name}\nType: ${entry.kind}\nCategory: ${entry.category}\nContact: ${entry.contactName} <${entry.contactEmail}>\nPhone: ${entry.phone}\nAddress: ${location}\nWebsite: ${entry.website}\nDescription: ${entry.description}\nNotes: ${entry.services}\nSubmitted: ${now}`
  });

  return json({
    ok: true,
    id: entry.id,
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

const MYAGAPAY_ASSET_ROUTES = new Map([
  ["/myagapay", "/donor/"],
  ["/myagapay/", "/donor/"],
  ["/myagapay/dashboard", "/donor/"],
  ["/myagapay/login", "/donor/login"],
  ["/myagapay/signup", "/donor/signup"],
  ["/myagapay/account", "/donor/settings"],
  ["/myagapay/settings", "/donor/settings"],
  ["/myagapay/giving", "/donor/"],
  ["/myagapay/giving/", "/donor/"],
  ["/myagapay/giving/give", "/donor/give"],
  ["/myagapay/giving/history", "/donor/offerings"],
  ["/myagapay/giving/offerings", "/donor/offerings"],
  ["/myagapay/giving/commemorations", "/donor/commemorations"],
  ["/myagapay/giving/names", "/donor/commemorations"],
  ["/myagapay/giving/calendar", "/donor/calendar"],
  ["/myagapay/market", "/marketplace"],
  ["/myagapay/marketplace", "/marketplace"],
  ["/myagapay/directory", "/directory"],
  ["/myagapay/learn", "/learn/dashboard"],
  ["/myagapay/learn/", "/learn/dashboard"],
  ["/myagapay/learn/dashboard", "/learn/dashboard"],
  ["/myagapay/learn/planner", "/learn/planner"],
  ["/myagapay/learn/formation", "/learn/formation"],
  ["/myagapay/learn/books", "/learn/books"],
  ["/myagapay/learn/community", "/learn/community"],
  ["/myagapay/learn/print", "/learn/print-center"],
  ["/myagapay/learn/print-center", "/learn/print-center"],
  ["/myagapay/learn/setup", "/learn/onboarding"],
  ["/myagapay/learn/onboarding", "/learn/onboarding"],
  ["/myagapay/learn/co-op", "/learn/co-op"]
]);

const DASHBOARD_LEGACY_REDIRECTS = new Map([
  ["/my-agapay", "/myagapay"],
  ["/my-agapay/", "/myagapay"],
  ["/my-agapay/dashboard", "/myagapay"],
  ["/my-agapay/login", "/myagapay/login"],
  ["/my-agapay/login/", "/myagapay/login"],
  ["/my-agapay/signup", "/myagapay/signup"],
  ["/my-agapay/verify", "/myagapay/verify"],
  ["/my-agapay/give", "/myagapay/giving/give"],
  ["/my-agapay/offerings", "/myagapay/giving/history"],
  ["/my-agapay/commemorations", "/myagapay/giving/commemorations"],
  ["/my-agapay/calendar", "/myagapay/giving/calendar"],
  ["/my-agapay/settings", "/myagapay/account"],
  ["/donor", "/myagapay"],
  ["/donor/", "/myagapay"],
  ["/donor/dashboard", "/myagapay"],
  ["/donor/login", "/myagapay/login"],
  ["/donor/login/", "/myagapay/login"],
  ["/donor/login.html", "/myagapay/login"],
  ["/donor/signup", "/myagapay/signup"],
  ["/donor/give", "/myagapay/giving/give"],
  ["/donor/offerings", "/myagapay/giving/history"],
  ["/donor/commemorations", "/myagapay/giving/commemorations"],
  ["/donor/calendar", "/myagapay/giving/calendar"],
  ["/donor/settings", "/myagapay/account"],
  ["/parish/login", "/give/login"],
  ["/parish/login/", "/give/login"],
  ["/parish/login.html", "/give/login"],
  ["/learn/dashboard", "/myagapay/learn"],
  ["/learn/planner", "/myagapay/learn/planner"],
  ["/learn/formation", "/myagapay/learn/formation"],
  ["/learn/books", "/myagapay/learn/books"],
  ["/learn/community", "/myagapay/learn/community"],
  ["/learn/reports", "/myagapay/learn/print"],
  ["/myagapay/learn/reports", "/myagapay/learn/print"],
  ["/learn/print-center", "/myagapay/learn/print"],
  ["/learn/onboarding", "/myagapay/learn/setup"],
  ["/learn/co-op", "/myagapay/learn/co-op"]
]);

function canonicalDashboardPath(pathname) {
  return DASHBOARD_LEGACY_REDIRECTS.get(pathname) || "";
}

function cleanAssetRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/") return request;
  if (url.pathname === '/listen' || url.pathname === '/listen/') {
    url.pathname = '/listen.html';
    return new Request(url, request);
  }
  if (url.pathname === "/learn") {
    url.pathname = "/learn/";
    return new Request(url, request);
  }
  const myAgapayAsset = MYAGAPAY_ASSET_ROUTES.get(url.pathname);
  if (myAgapayAsset) {
    url.pathname = myAgapayAsset;
    return new Request(url, request);
  }
  if (url.pathname === "/give" || url.pathname === "/give/") {
    url.pathname = "/give/index.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/form") {
    url.pathname = "/give/form";
    return new Request(url, request);
  }
  if (url.pathname === "/give/login" || url.pathname === "/give/login/") {
    url.pathname = "/parish/login.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/find-parish") {
    url.pathname = "/give/find-parish.html";
    return new Request(url, request);
  }
  if (/^\/give\/[^/]+\/[^/]+-campaign\/?$/.test(url.pathname)) {
    url.pathname = "/give/parish-giving/index.html";
    return new Request(url, request);
  }
   if (url.pathname.startsWith("/give/parish-giving/") && !url.pathname.includes(".")) {
    url.pathname = "/give/parish-giving/index.html";
    return new Request(url, request);
  }
  const staticGivePages = new Set(["features", "how-it-works", "pricing", "why", "parish-giving", "recurring-donations", "fundraising", "event-payments"]);
  const givePage = url.pathname.match(/^\/give\/([^/]+)\/?$/)?.[1] || "";
  if (staticGivePages.has(givePage)) {
    url.pathname = `/give/${givePage}.html`;
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

async function fetchCleanAsset(request, env) {
  const assetRequest = cleanAssetRequest(request);
  const response = await env.ASSETS.fetch(assetRequest);
  if (assetRequest.url === request.url || ![301, 302, 307, 308].includes(response.status)) return response;

  const location = response.headers.get("Location");
  if (!location) return response;
  const target = new URL(location, assetRequest.url);
  if (target.origin !== new URL(request.url).origin) return response;
  return env.ASSETS.fetch(new Request(target, request));
}

const LEGACY_GIVING_PAGE_REDIRECTS = new Map([
  ["/features", "/give/features"],
  ["/features.html", "/give/features"],
  ["/features/", "/give/features"],
  ["/how-it-works", "/give/how-it-works"],
  ["/how-it-works.html", "/give/how-it-works"],
  ["/how-it-works/", "/give/how-it-works"],
  ["/pricing", "/give/pricing"],
  ["/pricing.html", "/give/pricing"],
  ["/pricing/", "/give/pricing"],
  ["/why", "/give/why"],
  ["/why.html", "/give/why"],
  ["/why/", "/give/why"]
]);

function canonicalCampaignPathFromLegacy(url) {
  const match = url.pathname.match(/^\/(?:give|giving)\/parish-giving\/([^/]+)\/?$/);
  const parishId = String(url.searchParams.get("parish") || "").trim();
  if (!match || !parishId) return "";
  const campaignSlug = decodeURIComponent(match[1]).replace(/-campaign$/, "");
  return `/give/${encodeURIComponent(parishId)}/${encodeURIComponent(campaignSlug)}-campaign`;
}

function formatCommemorationNames(entries, field) {
  const names = entries.flatMap((entry) => Array.isArray(entry[field]) ? entry[field] : []);
  if (!names.length) return "<p style=\"margin:0;color:#6F6A60;\">No names submitted.</p>";
  return `<ul style=\"margin:0 0 0 18px;padding:0;color:#171715;line-height:1.7;\">${names.map((name) => `<li>${htmlEscape(name)}</li>`).join("")}</ul>`;
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

// Stamp CORS headers onto an existing Response object (for handlers that
// return their own Response rather than calling json() directly).
function addCorsHeaders(response, env) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(env);
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEWARDSHIP GIVING SUITE — inline handlers
// These power the real-time pledge tracking add-on in the Parish dashboard.
// Reads from: household_pledges, giving_funds, donor_offerings, donors (D1).
// Feature-gated by parish_stewardship_settings.has_stewardship_suite = 1.
// ═══════════════════════════════════════════════════════════════════════════

async function verifyParishDashboard(request, env, parishId) {
  const token = getBearerToken(request);
  if (!parishId || !token) return false;
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return false;
  return verifyParishDashboardBearer(found.registration, token);
}

async function requireStewardshipFeature(env, parishId) {
  const row = await env.AGAPAY_DB.prepare(
    `SELECT has_stewardship_suite FROM parish_stewardship_settings WHERE parish_id = ?`
  ).bind(parishId).first();
  if (!row || !row.has_stewardship_suite) {
    return json({ error: "Stewardship Suite not activated for this parish." }, { status: 403 });
  }
  return null; // null = access granted
}

// ── GET /api/admin/recent-activity ────────────────────────────────────────────
// Returns a merged, chronological feed of recent donors and stewardship
// activations for the admin overview tab. Limit 20 events.
async function handleAdminRecentActivity(request, env) {
  const limited = await rateLimit(request, env, "admin-auth", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!await requireAdmin(request, env)) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const events = [];

  // Recent donor signups
  try {
    const donors = await d1All(env,
      `SELECT email, default_parish_id, created_at FROM donors
       ORDER BY created_at DESC LIMIT 20`
    );
    for (const d of (donors || [])) {
      events.push({
        type: 'donor_signup',
        label: 'New donor',
        detail: d.email,
        sub: d.default_parish_id || null,
        time: d.created_at,
      });
    }
  } catch {}

  // Recent stewardship activations
  try {
    const activations = await d1All(env,
      `SELECT parish_id, updated_at FROM parish_stewardship_settings
       WHERE has_stewardship_suite = 1
       ORDER BY updated_at DESC LIMIT 10`
    );
    for (const a of (activations || [])) {
      events.push({
        type: 'stewardship_activated',
        label: 'Stewardship Suite activated',
        detail: a.parish_id,
        sub: null,
        time: a.updated_at,
      });
    }
  } catch {}

  // Sort merged feed newest-first, cap at 20
  events.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  return json({ ok: true, events: events.slice(0, 20) });
}


async function seedStewardshipFunds(env, parishId) {
  const defaults = [
    { name: "General Stewardship",    code: "stewardship", is_default: 1, sort_order: 0 },
    { name: "Candles / Vigil Lights", code: "candle",      is_default: 0, sort_order: 1 },
    { name: "Building Fund",          code: "building",    is_default: 0, sort_order: 2 },
    { name: "Poor Box / Alms",        code: "alms",        is_default: 0, sort_order: 3 },
    { name: "Campaign / Appeal",      code: "campaign",    is_default: 0, sort_order: 4 },
    { name: "Iconography Fund",       code: "iconography", is_default: 0, sort_order: 5 },
    { name: "Memorial / Panakhida",   code: "memorial",    is_default: 0, sort_order: 6 },
  ];
  const stmts = defaults.map(f =>
    env.AGAPAY_DB.prepare(
      `INSERT OR IGNORE INTO giving_funds (parish_id, name, code, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(parishId, f.name, f.code, f.is_default, f.sort_order)
  );
  await env.AGAPAY_DB.batch(stmts);
}

// POST /api/parish/dashboard/:parishId/stewardship/giving/activate
async function handleStewardshipGivingActivate(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { stripeSubscriptionItemId } = body;

  await env.AGAPAY_DB.prepare(`
    INSERT INTO parish_stewardship_settings (parish_id, has_stewardship_suite, stripe_subscription_item_id)
    VALUES (?, 1, ?)
    ON CONFLICT(parish_id) DO UPDATE SET
      has_stewardship_suite = 1,
      stripe_subscription_item_id = excluded.stripe_subscription_item_id,
      updated_at = datetime('now')
  `).bind(parishId, stripeSubscriptionItemId || null).run();

  await seedStewardshipFunds(env, parishId);
  return json({ ok: true });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/summary
// Pledge vs actual, run rate, household/donor counts, fulfillment rate.
async function handleStewardshipGivingSummary(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url  = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const today     = new Date();
  const dayOfYear = Math.max(1, Math.ceil((today - new Date(`${year}-01-01`)) / 86400000));
  const daysInYear = (year % 4 === 0) ? 366 : 365;

  const [pledgeRow, actualRow, priorRow] = await Promise.all([
    env.AGAPAY_DB.prepare(`
      SELECT COUNT(*) AS pledging_donors, SUM(target_amount_cents) AS total_pledged_cents
      FROM household_pledges WHERE parish_id = ? AND fiscal_year = ?
    `).bind(parishId, year).first(),

    env.AGAPAY_DB.prepare(`
      SELECT
        COUNT(DISTINCT donor_email) AS active_donors,
        SUM(json_extract(data, '$.giftAmountCents')) AS total_actual_cents
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid', 'succeeded')
        AND created_at BETWEEN ? AND ?
    `).bind(parishId, yearStart, yearEnd).first(),

    env.AGAPAY_DB.prepare(`
      SELECT SUM(json_extract(data, '$.giftAmountCents')) AS total_prior_cents
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid', 'succeeded')
        AND created_at BETWEEN ? AND ?
    `).bind(parishId, `${year - 1}-01-01`, `${year - 1}-12-31`).first(),
  ]);

  const totalPledged = pledgeRow?.total_pledged_cents || 0;
  const totalActual  = actualRow?.total_actual_cents  || 0;
  const runRate      = Math.round((totalActual / dayOfYear) * daysInYear);
  const fulfillment  = totalPledged > 0 ? Math.round((totalActual / totalPledged) * 100) : null;
  const avgPerDonor  = (actualRow?.active_donors || 0) > 0
    ? Math.round(totalActual / actualRow.active_donors) : 0;

  return json({
    fiscal_year:             year,
    pledging_donors:         pledgeRow?.pledging_donors      || 0,
    active_donors:           actualRow?.active_donors        || 0,
    total_pledged_cents:     totalPledged,
    total_actual_cents:      totalActual,
    prior_year_actual_cents: priorRow?.total_prior_cents     || 0,
    run_rate_cents:          runRate,
    fulfillment_rate_pct:    fulfillment,
    avg_per_donor_cents:     avgPerDonor,
    day_of_year:             dayOfYear,
    days_in_year:            daysInYear,
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/funds
// Giving totals broken down by fund (matches giftType in donor_offerings.data).
async function handleStewardshipGivingFunds(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url  = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(`
    SELECT
      gf.name                                                             AS fund_name,
      gf.code                                                             AS fund_code,
      COUNT(o.id)                                                         AS transaction_count,
      COALESCE(SUM(json_extract(o.data, '$.giftAmountCents')), 0)        AS total_cents
    FROM giving_funds gf
    LEFT JOIN donor_offerings o
           ON json_extract(o.data, '$.giftType') = gf.code
          AND o.parish_id = ?
          AND o.payment_status = 'paid'
          AND o.created_at BETWEEN ? AND ?
    WHERE gf.parish_id = ?
    GROUP BY gf.id, gf.name, gf.code
    ORDER BY gf.sort_order
  `).bind(parishId, `${year}-01-01`, `${year}-12-31`, parishId).all();

  const totalCents = rows.results.reduce((s, r) => s + (r.total_cents || 0), 0);

  return json({
    fiscal_year: year,
    total_cents: totalCents,
    funds: rows.results.map(r => ({
      fund_name:         r.fund_name,
      fund_code:         r.fund_code,
      transaction_count: r.transaction_count || 0,
      total_cents:       r.total_cents || 0,
      pct_of_total:      totalCents > 0
        ? Math.round(((r.total_cents || 0) / totalCents) * 100) : 0,
    })),
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/distribution
// Anonymized donor giving tier histogram (no individual identities exposed).
async function handleStewardshipGivingDistribution(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url  = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);

  const rows = await env.AGAPAY_DB.prepare(`
    SELECT
      donor_email,
      SUM(json_extract(data, '$.giftAmountCents')) AS donor_total_cents
    FROM donor_offerings
    WHERE parish_id = ? AND payment_status = 'paid'
      AND created_at BETWEEN ? AND ?
    GROUP BY donor_email
  `).bind(parishId, `${year}-01-01`, `${year}-12-31`).all();

  const TIERS = [
    { label: "$0–$500",        min: 0,       max: 49999   },
    { label: "$500–$2,000",    min: 50000,   max: 199999  },
    { label: "$2,000–$5,000",  min: 200000,  max: 499999  },
    { label: "$5,000–$10,000", min: 500000,  max: 999999  },
    { label: "$10,000+",       min: 1000000, max: Infinity },
  ];

  const tiers = TIERS.map(t => ({ ...t, count: 0 }));
  for (const row of rows.results) {
    const amt  = row.donor_total_cents || 0;
    const tier = tiers.find(t => amt >= t.min && amt <= t.max);
    if (tier) tier.count++;
  }

  return json({
    fiscal_year:   year,
    total_donors:  rows.results.length,
    tiers: tiers.map(({ label, count }) => ({ label, count })),
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/giving/retention
// Current vs prior year donor comparison.
async function handleStewardshipGivingRetention(request, env, parishId) {
  const auth = await verifyParishDashboard(request, env, parishId);
  if (!auth) return unauthorized();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const url  = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || new Date().getFullYear(), 10);

  const [curRows, priorRows] = await Promise.all([
    env.AGAPAY_DB.prepare(`
      SELECT DISTINCT donor_email FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid'
        AND created_at BETWEEN ? AND ?
    `).bind(parishId, `${year}-01-01`, `${year}-12-31`).all(),

    env.AGAPAY_DB.prepare(`
      SELECT DISTINCT donor_email FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid'
        AND created_at BETWEEN ? AND ?
    `).bind(parishId, `${year - 1}-01-01`, `${year - 1}-12-31`).all(),
  ]);

  const cur   = new Set(curRows.results.map(r => r.donor_email));
  const prior = new Set(priorRows.results.map(r => r.donor_email));

  const retained  = [...prior].filter(e => cur.has(e)).length;
  const lapsed    = [...prior].filter(e => !cur.has(e)).length;
  const newDonors = [...cur].filter(e => !prior.has(e)).length;
  const retention = prior.size > 0 ? Math.round((retained / prior.size) * 100) : null;

  return json({
    fiscal_year:        year,
    prior_year:         year - 1,
    prior_donors:       prior.size,
    current_donors:     cur.size,
    retained,
    lapsed,
    new_donors:         newDonors,
    retention_rate_pct: retention,
  });
}

// ── PLEDGE SYNC HELPER ───────────────────────────────────────────────────────
// Call this from handleDonorDashboard (in handlers/donor.js) whenever a donor
// saves their pledge amount. Pass the donor's email, their default_parish_id,
// and the new pledgeAmountCents value.
//
// Usage (in handlers/donor.js, after writing pledgeAmountCents to donor row):
//
//   if (donorRow.default_parish_id) {
//     await syncPledgeToHousehold(env, donorEmail, donorRow.default_parish_id, pledgeAmountCents);
//   }
//
export async function syncPledgeToHousehold(env, donorEmail, parishId, pledgeAmountCents) {
  if (!parishId || !parishId.trim()) return;
  const year = new Date().getFullYear();
  await env.AGAPAY_DB.prepare(`
    INSERT INTO household_pledges (donor_email, parish_id, fiscal_year, target_amount_cents)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(donor_email, fiscal_year) DO UPDATE SET
      target_amount_cents = excluded.target_amount_cents,
      parish_id           = excluded.parish_id,
      updated_at          = datetime('now')
  `).bind(donorEmail, parishId, year, pledgeAmountCents).run();
}

export default {
  async scheduled(event, env, ctx) {
    if (env && !env.DB && env.AGAPAY_DB) env.DB = env.AGAPAY_DB;
    ctx.waitUntil(sendWeeklyCommemorationEmails(env, event.scheduledTime));
  },

  async fetch(request, env) {
    if (env && !env.DB && env.AGAPAY_DB) env.DB = env.AGAPAY_DB;
    const url = new URL(request.url);

    // OPTIONS preflight for public API endpoints called cross-origin
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return corsPreflightResponse(env);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/giving" || url.pathname === "/giving/" || url.pathname.startsWith("/giving/")) {
        url.pathname = url.pathname.replace(/^\/giving/, "/give");
        return Response.redirect(url.toString(), 301);
      }
      if (["/give/find-church", "/give/find-church.html", "/give/find_parish", "/give/parish-list"].includes(url.pathname)) {
        url.pathname = "/give/find-parish";
        return Response.redirect(url.toString(), 301);
      }
      const legacyParishId = String(url.searchParams.get("parish") || "").trim();
      if ((url.pathname === "/give/form" || url.pathname === "/give/form.html") && legacyParishId) {
        url.pathname = `/give/${encodeURIComponent(legacyParishId)}`;
        url.searchParams.delete("parish");
        return Response.redirect(url.toString(), 301);
      }
      const canonicalCampaignPath = canonicalCampaignPathFromLegacy(url);
      if (canonicalCampaignPath) {
        url.pathname = canonicalCampaignPath;
        url.searchParams.delete("parish");
        return Response.redirect(url.toString(), 301);
      }
      const canonicalGivingPath = LEGACY_GIVING_PAGE_REDIRECTS.get(url.pathname.toLowerCase());
      if (canonicalGivingPath) {
        url.pathname = canonicalGivingPath;
        return Response.redirect(url.toString(), 301);
      }
    }

    if (request.method === "GET" && url.pathname === "/index.html") {
      url.pathname = "/";
      return Response.redirect(url.toString(), 301);
    }

    const canonicalDashboard = (request.method === "GET" || request.method === "HEAD") ? canonicalDashboardPath(url.pathname) : "";
    if (canonicalDashboard) {
      url.pathname = canonicalDashboard;
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === "GET" && (url.pathname === "/give.html" || url.pathname === "/give/index.html")) {
      url.pathname = "/give";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "GET" && url.pathname === "/give/find-parish.html") {
      url.pathname = "/give/find-parish";
      return Response.redirect(url.toString(), 301);
    }
    const cleanGivePage = url.pathname.match(/^\/give\/(features|how-it-works|pricing|why|parish-giving|recurring-donations|fundraising|event-payments)\.html$/)?.[1];
    if (request.method === "GET" && cleanGivePage) {
      url.pathname = `/give/${cleanGivePage}`;
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
      return handleStripeWebhook(request, env);
    }

    // ─── Listen profile SSO — resolves the signed-in donor using the standard
    //     Bearer token + X-AGAPAY-Donor-Email header sent by the donor dashboard.
    if (request.method === "GET" && url.pathname === "/api/listen/profile") {
      try {
        const donor = await requireDonor(request, env);
        if (donor) {
          const name = donor.donorName || donor.householdName || "AGAPAY Member";
          const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "--";
          return json({ authenticated: true, name, initials, memberStatus: "AGAPAY Member" });
        }
      } catch (err) {
        console.warn("Listen profile SSO error:", err);
      }
      return json({ authenticated: false, name: "Guest Listener", initials: "--", memberStatus: "Anonymous" });
    }

    if (request.method === "GET" && url.pathname === "/api/listen/search") return handleListenSearch(request, env);
    if (request.method === "GET" && url.pathname === "/api/listen/rss")    return handleListenRss(request, env);
    if (request.method === "GET" && url.pathname === "/api/parishes") { const r = await handleParishes(request, env); return addCorsHeaders(r, env); }
    if (request.method === "GET" && url.pathname === "/api/campaign") { const r = await handlePublicCampaign(request, env); return addCorsHeaders(r, env); }
    if (request.method === "GET" && url.pathname === "/api/platform/summary") { const r = await handlePublicPlatformSummary(env); return addCorsHeaders(r, env); }
    if (request.method === "GET" && url.pathname === "/api/subscription-tiers") {
      return corsJson({ tiers: publicSubscriptionTiers() }, env);
    }
    if (request.method === "GET" && url.pathname === "/api/marketplace/catalog") {
      const r = await handleMarketplaceCatalog(request); return addCorsHeaders(r, env);
    }
    if (url.pathname === "/api/waitlist") {
      return handleWaitlist(request, env);
    }
    if (url.pathname === "/api/directory/intake") {
      return handleDirectoryIntake(request, env);
    }
    if (url.pathname === "/api/parish-interest") {
      return handleParishInterest(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/security/config") {
      return handleSecurityConfig(env);
    }
    if (request.method === "GET" && url.pathname === "/api/liturgical-calendar") {
      const r = await handleLiturgicalCalendar(request); return addCorsHeaders(r, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/meta") {
      return handleLearnMeta(env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/dashboard") {
      return handleLearnDashboard(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/completion") {
      return handleLearnCompletionSave(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/planner") {
      return handleLearnPlanner(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/print-center") {
      return handleLearnPrintCenter(request, env);
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/learn/print/")) {
      return handleLearnPrintPdf(request, env, decodeURIComponent(url.pathname.slice("/api/learn/print/".length)));
    }
    if (request.method === "POST" && url.pathname === "/api/learn/print") {
      return handleLearnPrintPdf(request, env, "");
    }
    if (request.method === "GET" && url.pathname === "/api/learn/formation") {
      return handleLearnFormation(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/saints") {
      return handleLearnSaints(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/books") {
      return handleLearnBooks(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/community") {
      return handleLearnCommunity(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/community/resources") {
      return handleLearnCommunitySubmit(request, env);
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/learn/community/resources/") && url.pathname.endsWith("/flag")) {
      const resourceId = decodeURIComponent(url.pathname.slice("/api/learn/community/resources/".length, -"/flag".length));
      return handleLearnCommunityFlag(request, env, resourceId);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/reports") {
      return handleLearnReports(request, env);
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/learn/terms/") && url.pathname.endsWith("/close")) {
      const termId = decodeURIComponent(url.pathname.slice("/api/learn/terms/".length, -"/close".length));
      return handleLearnTermClose(request, env, termId);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/co-op") {
      return handleLearnCoOp(request, env);
    }
    if (request.method === "GET" && (url.pathname === "/api/learn/onboarding" || url.pathname === "/api/learn/setup")) {
      return handleLearnOnboarding(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/learn/billing/status") {
      return handleLearnBillingStatus(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/billing/checkout") {
      return handleLearnBillingCheckout(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/billing/cancel") {
      return handleLearnBillingCancel(request, env);
    }
    if (url.pathname === "/api/learn/google-calendar/status") {
      return handleLearnGoogleCalendarStatus(request, env);
    }
    if (url.pathname === "/api/learn/google-calendar/connect") {
      return handleLearnGoogleCalendarConnect(request, env);
    }
    if (url.pathname === "/api/learn/google-calendar/callback") {
      return handleLearnGoogleCalendarCallback(request, env);
    }
    if (url.pathname === "/api/learn/google-calendar/preview") {
      return handleLearnGoogleCalendarPreview(request, env);
    }
    if (url.pathname === "/api/learn/google-calendar/sync") {
      return handleLearnGoogleCalendarSync(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/grace-mode") {
      return handleLearnGraceModeSave(request, env);
    }
    if (request.method === "POST" && (url.pathname === "/api/learn/onboarding" || url.pathname === "/api/learn/setup")) {
      return handleLearnOnboardingSave(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/family-planning") {
      return handleLearnFamilyPlanningSave(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/learn/planner") {
      return handleLearnPlannerBlockSave(request, env);
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
    if (
      url.pathname === "/donor/verify" ||
      url.pathname === "/donor/verify/" ||
      url.pathname === "/my-agapay/verify" ||
      url.pathname === "/my-agapay/verify/" ||
      url.pathname === "/myagapay/verify" ||
      url.pathname === "/myagapay/verify/"
    ) {
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
    if (request.method === "GET" && url.pathname === "/api/admin/recent-activity") {
      return handleAdminRecentActivity(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/release-status") {
      return handleAdminReleaseStatus(request, env);
    }
    if (url.pathname === "/api/admin/rebuild-indexes") {
      return handleAdminRebuildIndexes(request, env);
    }
    if (url.pathname === "/api/admin/migrate-kv-to-d1") {
      // One-time migration tool — gated by env flag to prevent accidental re-runs.
      // Set AGAPAY_ENABLE_KV_MIGRATION=true in Cloudflare dashboard only when needed.
      if (env.AGAPAY_ENABLE_KV_MIGRATION !== "true") {
        return json({ error: "Migration endpoint is disabled. Set AGAPAY_ENABLE_KV_MIGRATION=true to enable." }, { status: 403 });
      }
      return handleAdminMigrateKvToD1(request, env);
    }
    if (url.pathname === "/api/admin/password") {
      return handleAdminPassword(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/learn/summary") {
      return handleAdminLearnSummary(request, env);
    }
    if (url.pathname === "/api/admin/learn/scholarships") {
      return handleAdminLearnScholarship(request, env);
    }
    if (url.pathname === "/api/admin/learn/community") {
      return handleAdminLearnCommunity(request, env);
    }
    if (url.pathname.startsWith("/api/admin/learn/community/")) {
      return handleAdminLearnCommunity(request, env, decodeURIComponent(url.pathname.slice("/api/admin/learn/community/".length)));
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
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/reconciliation/close")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/reconciliation/close", ""));
      return handleParishReconciliationClose(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/reconciliation")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/reconciliation", ""));
      return handleParishReconciliation(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/campaign-upload")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/campaign-upload", ""));
      return handleParishCampaignUpload(request, env, parishId);
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
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") {
      return handleCheckout(request, env);
    }
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/checkout-session-status") {
      return handleCheckoutSessionStatus(request, env);
    }

    // ── Stewardship module routes ─────────────────────────────────────────
    if (url.pathname === "/parish/stewardship") return handleStewardshipHome(request, env);
    if (url.pathname === "/parish/stewardship/giving") return handleStewardshipGivingMetricsPage(request, env);
    if (request.method === "POST" && url.pathname === "/parish/stewardship/subscribe") return handleStewardshipSubscribe(request, env);
    if (url.pathname === "/parish/stewardship/billing") return handleStewardshipBilling(request, env);
    if (request.method === "POST" && url.pathname === "/parish/stewardship/billing-portal") return handleStewardshipBillingPortal(request, env);
    if (url.pathname === "/parish/stewardship/annual-meetings") return handleStewardshipMeetingList(request, env);
    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/parish/stewardship/annual-meetings/new") return handleStewardshipMeetingNew(request, env);
    if (request.method === "POST" && url.pathname === "/webhooks/stewardship") return handleStewardshipWebhook(request, env);
    if (request.method === "POST" && url.pathname === "/api/parish/stewardship/webhook") return handleStewardshipWebhook(request, env);
    if (url.pathname.startsWith("/parish/stewardship/annual-meetings/")) {
      const swPath = url.pathname.replace("/parish/stewardship/annual-meetings/", "");
      const [swId, swAction] = swPath.split("/");
      if (swId) {
        if (swAction === "preview") return handleStewardshipMeetingPreview(request, env, swId);
        if (swAction === "pdf") return handleStewardshipMeetingPdf(request, env, swId);
        return handleStewardshipMeetingEdit(request, env, swId);
      }
    }

    // ── Stewardship Giving API ────────────────────────────────────────────
    // Real-time pledge tracking and metrics for the Parish Stewardship Suite.
    // All routes gated by has_stewardship_suite feature flag in D1.
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/giving/summary")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/giving/summary", ""));
      return handleStewardshipGivingSummary(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/giving/funds")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/giving/funds", ""));
      return handleStewardshipGivingFunds(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/giving/distribution")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/giving/distribution", ""));
      return handleStewardshipGivingDistribution(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/giving/retention")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/giving/retention", ""));
      return handleStewardshipGivingRetention(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/giving/activate")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/giving/activate", ""));
      return handleStewardshipGivingActivate(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stewardship/financials")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stewardship/financials", ""));
      return handleStewardshipFinancials(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", ""));
      return handleParishDashboard(request, env, parishId);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (
      request.method === "GET" &&
      url.pathname.endsWith(".html") &&
      url.pathname !== "/index.html"
    ) {
      const canonical = url.pathname.slice(0, -5);
      url.pathname = canonical;
      return Response.redirect(url.toString(), 301);
    }

    return fetchCleanAsset(request, env);
  }
};
