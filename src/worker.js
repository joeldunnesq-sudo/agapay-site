import { routeAdminRequest } from "./routes/admin.js";
import { routeAccountingRequest } from "./routes/accounting.js";
import { routeDirectoryRequest } from "./routes/directory.js";
import { routeDonorRequest } from "./routes/donor.js";
import { routeLearnRequest } from "./routes/learn.js";
import { routeOrganizationRequest } from "./routes/organization.js";
import { routeParishRequest } from "./routes/parish.js";
import { routePublicRequest } from "./routes/public.js";
import { dispatchRouteRegistries } from "./routes/registry.js";
import { routeStewardshipRequest } from "./routes/stewardship.js";
import {
  applyGivingEmbedHeaders,
  applyParishDashboardPassword,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  parishIdIndexKey,
  unauthorized,
  corsPreflightResponse,
} from "./lib/core.js";
import { parishLifeAvailableFor } from "./lib/parish-life-access.js";
import { runScheduledAccountingIntegrity } from "./accounting/integrity/scheduler.js";
import { sweepAccountingBackupRetention } from "./accounting/backup-retention.js";
import { handleParishPortability } from "./handlers/parish-portability.js";
import { runPortabilityJobs } from "./portability/service.js";
import { assertRestoreSafe } from "./portability/suppression.js";
import { protectFileStorage } from "./portability/storage.js";
import { protectLegacyStorage } from "./portability/legacy.js";
import { sendNonprofitThresholdAlerts } from "./lib/nonprofit-pricing.js";
import { observeScheduledTask } from "./operations/scheduled-task-observer.js";
import {
  androidAssetLinks,
  appleAppSiteAssociation,
} from "./handlers/mobile-app-associations.js";
import { materializeMemorialAnniversaries } from "./sacraments/memorial-followup.js";
import { sendDailyPastoralCareDigestEmails } from "./sacraments/pastoral-digest.js";
import {
  findRegistrationByParishId,
  saveRegistrationRecord,
} from "./handlers/parish.js";
import { invalidateOnboardingSignoffIfChanged } from "./lib/parish-onboarding.js";
import { sendWeeklyAnnouncementDigestEmails } from "./handlers/parish-communications.js";
import { purgeExpiredGroupMessages } from "./handlers/donor-groups.js";
import { sendScheduledSignupReminders } from "./handlers/koinonia-signups.js";
import { expireKoinoniaExchangeListings } from "./handlers/koinonia-exchange.js";
import { requireAdmin } from "./handlers/admin.js";
import { processExpiredTaxExemptions } from "./lib/tax-exemption.js";
import {
  agapayEmailHtml,
  sendEmail,
} from "./lib/email.js";
import { htmlEscape } from "./lib/format.js";
import { runScheduledRecurringTransactions } from "./accounting/recurring/scheduler.js";
import { enforcePrivilegedMfa } from "./handlers/mfa.js";
import { ROUTE_ACTIONS } from "./routes/worker-actions.js";
import { syncPledgeToHousehold } from "./handlers/stewardship-reports.js";
import { sendStewardshipCompExpiryReminders, sendWeeklyCommemorationEmails, sendWeeklySacramentDigestEmails, sendWeeklyTreasurerCommerceEmails } from "./operations/weekly-email-digests.js";

export { observeScheduledTask, syncPledgeToHousehold };

const MYAGAPAY_ASSET_ROUTES = new Map([
  ["/myagapay", "/myagapay/index.html"],
  ["/myagapay/", "/myagapay/index.html"],
  ["/myagapay/dashboard", "/myagapay/index.html"],
  ["/myagapay/giving", "/myagapay/index.html"],
  ["/myagapay/giving/", "/myagapay/index.html"],
  ["/myagapay/giving/offerings", "/myagapay/giving/history.html"],
  ["/myagapay/giving/names", "/myagapay/giving/commemorations.html"],
  ["/myagapay/settings", "/myagapay/account.html"],
  ["/myagapay/market", "/marketplace"],
  ["/myagapay/marketplace", "/marketplace"],
  ["/myagapay/directory", "/myagapay/directory.html"],
  ["/myagapay/directory/", "/myagapay/directory.html"],
  ["/myagapay/join-household", "/myagapay/join-household.html"],
  ["/myagapay/bookstore", "/myagapay/bookstore.html"],
  ["/myagapay/bookstore/", "/myagapay/bookstore.html"],
  ["/myagapay/events", "/myagapay/events.html"],
  ["/myagapay/events/", "/myagapay/events.html"],
  ["/myagapay/parish-life", "/myagapay/parish-life.html"],
  ["/myagapay/parish-life/", "/myagapay/parish-life.html"],
  ["/myagapay/calendar", "/myagapay/giving/calendar.html"],
  ["/myagapay/calendar/", "/myagapay/giving/calendar.html"],
  ["/myagapay/feed", "/myagapay/feed.html"],
  ["/myagapay/feed/", "/myagapay/feed.html"],
  ["/myagapay/news", "/myagapay/news.html"],
  ["/myagapay/news/", "/myagapay/news.html"],
  ["/myagapay/groups", "/myagapay/groups.html"],
  ["/myagapay/groups/", "/myagapay/groups.html"],
  ["/myagapay/signups", "/myagapay/signups.html"],
  ["/myagapay/signups/", "/myagapay/signups.html"],
  ["/myagapay/exchange", "/myagapay/exchange.html"],
  ["/myagapay/exchange/", "/myagapay/exchange.html"],
  ["/myagapay/prayer-requests", "/myagapay/prayer-requests.html"],
  ["/myagapay/prayer-requests/", "/myagapay/prayer-requests.html"],
  ["/myagapay/teaching", "/myagapay/teaching.html"],
  ["/myagapay/teaching/", "/myagapay/teaching.html"],
  ["/myagapay/media", "/myagapay/media.html"],
  ["/myagapay/media/", "/myagapay/media.html"],
  ["/myagapay/media/watch", "/myagapay/watch.html"],
  ["/myagapay/media/watch/", "/myagapay/watch.html"],
  ["/myagapay/learn", "/learn/dashboard"],
  ["/myagapay/learn/", "/learn/dashboard"],
  ["/myagapay/learn/dashboard", "/learn/dashboard"],
  ["/myagapay/learn/planner", "/learn/planner"],
  ["/myagapay/learn/formation", "/learn/formation"],
  ["/myagapay/learn/books", "/learn/books"],
  ["/myagapay/learn/grades", "/learn/grades"],
  ["/myagapay/learn/community", "/learn/community"],
  ["/myagapay/learn/print", "/learn/print-center"],
  ["/myagapay/learn/print-center", "/learn/print-center"],
  ["/myagapay/learn/setup", "/learn/onboarding"],
  ["/myagapay/learn/onboarding", "/learn/onboarding"],
  ["/myagapay/learn/co-op", "/learn/co-op"],
  ["/learn/odyssey", "/learn/odyssey/index.html"],
  ["/learn/odyssey/", "/learn/odyssey/index.html"],
  ["/learn/odyssey/faq", "/learn/odyssey/faq.html"],
  ["/learn/odyssey/faq/", "/learn/odyssey/faq.html"],
  ["/learn/odyssey/dashboard", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/planner", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/planner/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/formation", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/formation/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/books", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/books/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/grades", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/grades/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/community", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/community/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/co-op", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/co-op/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/print", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/print/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/print-center", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/print-center/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/setup", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/setup/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/onboarding", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/onboarding/", "/learn/odyssey/dashboard/index.html"],
  ["/learn/odyssey/dashboard/login", "/learn/odyssey/dashboard/login.html"],
  ["/learn/odyssey/dashboard/login/", "/learn/odyssey/dashboard/login.html"],
  ["/learn/odyssey/dashboard/activate", "/learn/odyssey/dashboard/activate.html"],
  ["/learn/odyssey/dashboard/activate/", "/learn/odyssey/dashboard/activate.html"]
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
  ["/my-agapay/commemorations", "/myagapay/sacraments"],
  ["/my-agapay/sacraments", "/myagapay/sacraments"],
  ["/myagapay/giving/commemorations", "/myagapay/sacraments"],
  ["/myagapay/giving/commemorations/", "/myagapay/sacraments"],
  ["/myagapay/giving/commemorations.html", "/myagapay/sacraments"],
  ["/myagapay/giving/names", "/myagapay/sacraments"],
  ["/my-agapay/calendar", "/myagapay/parish-life"],
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
  ["/donor/commemorations", "/myagapay/sacraments"],
  ["/donor/sacraments", "/myagapay/sacraments"],
  ["/donor/calendar", "/myagapay/parish-life"],
  ["/myagapay/giving/calendar", "/myagapay/parish-life"],
  ["/myagapay/giving/calendar/", "/myagapay/parish-life"],
  ["/myagapay/giving/calendar.html", "/myagapay/parish-life"],
  ["/donor/bookstore", "/myagapay/bookstore"],
  ["/donor/settings", "/myagapay/account"],
  ["/parish/login", "/give/login"],
  ["/parish/login/", "/give/login"],
  ["/parish/login.html", "/give/login"],
  ["/learn/dashboard", "/myagapay/learn"],
  ["/learn/planner", "/myagapay/learn/planner"],
  ["/learn/formation", "/myagapay/learn/formation"],
  ["/learn/books", "/myagapay/learn/books"],
  ["/learn/grades", "/myagapay/learn/grades"],
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
  if (/^\/[^/]+\/bookstore\/?$/.test(url.pathname) || /^\/bookstore\/[^/]+\/?$/.test(url.pathname)) {
    url.pathname = "/bookstore/index.html";
    return new Request(url, request);
  }
  if (/^\/[^/]+\/events\/?$/.test(url.pathname) || /^\/events\/[^/]+\/?$/.test(url.pathname)) {
    url.pathname = "/events/index.html";
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
  const staticGivePages = new Set(["request-demo", "embed"]);
  const givePage = /^\/give\/embed\/[^/]+\/?$/.test(url.pathname) ? "embed" : url.pathname.match(/^\/give\/([^/]+)\/?$/)?.[1] || "";
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
  const assetRequest = cleanAssetRequest(request), response = await env.ASSETS.fetch(assetRequest);
  if (assetRequest.url === request.url || ![301, 302, 307, 308].includes(response.status)) return applyGivingEmbedHeaders(request, response);

  const location = response.headers.get("Location");
  if (!location) return applyGivingEmbedHeaders(request, response);
  const target = new URL(location, assetRequest.url);
  if (target.origin !== new URL(request.url).origin) return applyGivingEmbedHeaders(request, response);
  return applyGivingEmbedHeaders(request, await env.ASSETS.fetch(new Request(target, request)));
}

const LEGACY_GIVING_PAGE_REDIRECTS = new Map([
  ["/features", "/give#platform"],
  ["/features.html", "/give#platform"],
  ["/features/", "/give#platform"],
  ["/how-it-works", "/give#how-it-works"],
  ["/how-it-works.html", "/give#how-it-works"],
  ["/how-it-works/", "/give#how-it-works"],
  ["/pricing", "/give#pricing"],
  ["/pricing.html", "/give#pricing"],
  ["/pricing/", "/give#pricing"],
  ["/why", "/give#why"],
  ["/why.html", "/give#why"],
  ["/why/", "/give#why"]
]);

const GIVE_MARKETING_SECTION_REDIRECTS = new Map([
  ["features", "platform"],
  ["pricing", "pricing"],
  ["how-it-works", "how-it-works"],
  ["get-agapay", "parish-council"],
  ["parish-giving", "giving"],
  ["recurring-donations", "recurring-donations"],
  ["fundraising", "fundraising"],
  ["event-payments", "event-payments"],
  ["security", "security"],
  ["why", "why"]
]);

function canonicalCampaignPathFromLegacy(url) {
  const match = url.pathname.match(/^\/(?:give|giving)\/parish-giving\/([^/]+)\/?$/);
  const parishId = String(url.searchParams.get("parish") || "").trim();
  if (!match || !parishId) return "";
  const campaignSlug = decodeURIComponent(match[1]).replace(/-campaign$/, "");
  return `/give/${encodeURIComponent(parishId)}/${encodeURIComponent(campaignSlug)}-campaign`;
}


const API_ROUTE_REGISTRIES = Object.freeze([
  routeOrganizationRequest,
  routePublicRequest,
  routeAccountingRequest,
  routeDirectoryRequest,
  routeLearnRequest,
  routeDonorRequest,
  routeAdminRequest,
  routeStewardshipRequest,
  routeParishRequest,
]);

export default {
  async scheduled(event, env, ctx) {
    if (env && !env.DB && env.AGAPAY_DB) env.DB = env.AGAPAY_DB;
    await assertRestoreSafe(env);
    env = protectLegacyStorage(protectFileStorage(env));
    if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(observeScheduledTask("parish_portability_jobs", runPortabilityJobs(env), env, event));
      return;
    }
    if (event.cron === "0 14 * * *") return ctx.waitUntil(observeScheduledTask("daily_pastoral_care_digest", sendDailyPastoralCareDigestEmails(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("scheduled_accounting_recurring", runScheduledRecurringTransactions(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("nonprofit_pricing_threshold_alerts", sendNonprofitThresholdAlerts(env), env, event));
    ctx.waitUntil(observeScheduledTask("group_message_retention_sweep", purgeExpiredGroupMessages(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("koinonia_exchange_expiry_sweep", expireKoinoniaExchangeListings(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("koinonia_signup_reminders", sendScheduledSignupReminders(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("memorial_anniversary_materialization", materializeMemorialAnniversaries(env, event.scheduledTime), env, event));
    if (event.cron === "0 8 * * *") {
      ctx.waitUntil(observeScheduledTask("accounting_backup_retention_sweep", sweepAccountingBackupRetention(env, event.scheduledTime), env, event));
      return;
    }
    ctx.waitUntil(observeScheduledTask("scheduled_accounting_integrity", runScheduledAccountingIntegrity(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("weekly_commemoration_emails", sendWeeklyCommemorationEmails(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("weekly_treasurer_commerce_emails", sendWeeklyTreasurerCommerceEmails(env, event.scheduledTime), env, event));
    ctx.waitUntil(observeScheduledTask("stewardship_comp_reminders", sendStewardshipCompExpiryReminders(env), env, event));
    ctx.waitUntil(observeScheduledTask("tax_exemption_expiration_sweep", processExpiredTaxExemptions(env), env, event));
    ctx.waitUntil(observeScheduledTask("weekly_sacrament_digest", sendWeeklySacramentDigestEmails(env, event.scheduledTime), env, event));
    if (parishLifeAvailableFor(env)) {
      ctx.waitUntil(observeScheduledTask("weekly_announcement_digest", sendWeeklyAnnouncementDigestEmails(env, event.scheduledTime), env, event));
    }
  },

  async fetch(request, env, ctx) {
    if (env && !env.DB && env.AGAPAY_DB) env.DB = env.AGAPAY_DB;
    try { await assertRestoreSafe(env); }
    catch { return json({ error: "Service is paused for storage safety verification." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
    env = protectLegacyStorage(protectFileStorage(env));
    const url = new URL(request.url);

    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/.well-known/assetlinks.json") {
      return androidAssetLinks(request, env);
    }
    if (["GET", "HEAD"].includes(request.method) && (
      url.pathname === "/.well-known/apple-app-site-association" || url.pathname === "/apple-app-site-association"
    )) {
      return appleAppSiteAssociation(request, env);
    }

    const parishLifeAvailable = parishLifeAvailableFor(env);
    const parishLifeApiRoute =
      url.pathname === "/api/donor/koinonia-access"
      || url.pathname === "/api/donor/koinonia/community-tools" || url.pathname.startsWith("/api/donor/koinonia/community-tools/")
      || url.pathname === "/api/donor/koinonia/signups" || url.pathname.startsWith("/api/donor/koinonia/signups/")
      || url.pathname === "/api/donor/koinonia/exchange" || url.pathname.startsWith("/api/donor/koinonia/exchange/")
      || url.pathname === "/api/donor/koinonia/prayer-requests" || url.pathname.startsWith("/api/donor/koinonia/prayer-requests/")
      || url.pathname === "/api/donor/feed" || url.pathname.startsWith("/api/donor/feed/")
      || url.pathname === "/api/donor/groups" || url.pathname.startsWith("/api/donor/groups/")
      || url.pathname === "/api/donor/teaching" || url.pathname.startsWith("/api/donor/teaching/")
      || url.pathname === "/api/donor/videos" || url.pathname.startsWith("/api/donor/videos/")
      || url.pathname === "/api/donor/digest/subscription"
      || url.pathname === "/api/donor/digest/unsubscribe"
      || url.pathname === "/api/admin/communications/send-weekly-digest"
      || (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.includes("/bulletins"))
      || (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.includes("/communications"))
      || (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.includes("/prayer-requests"));
    if (parishLifeApiRoute && !parishLifeAvailable) {
      return json({ error: "Not found" }, { status: 404 });
    }

    const parishLifePageRoute = /^\/myagapay\/(?:feed|groups|signups|exchange|prayer-requests|teaching|media|media\/watch)(?:\.html)?\/?$/.test(url.pathname);
    if (parishLifePageRoute && !parishLifeAvailable) {
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
      });
    }

    // OPTIONS preflight for public API endpoints called cross-origin
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return corsPreflightResponse(env);
    }

    const privilegedMfaGate = await enforcePrivilegedMfa(request, env, url);
    if (privilegedMfaGate) return privilegedMfaGate;

    const portabilityRoute = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)\/portability(\/.*)?$/);
    if (portabilityRoute) return handleParishPortability(request, env, decodeURIComponent(portabilityRoute[1]), portabilityRoute[2] || "");

    if (request.method === "GET" || request.method === "HEAD") {
      if (["/give.html", "/give/index.html"].includes(url.pathname.toLowerCase())) {
        url.pathname = "/give";
        return Response.redirect(url.toString(), 301);
      }
      const consolidatedGivePage = url.pathname.toLowerCase().match(/^\/give\/([^/]+?)(?:\.html)?\/?$/)?.[1] || "";
      const consolidatedGiveSection = GIVE_MARKETING_SECTION_REDIRECTS.get(consolidatedGivePage);
      if (consolidatedGiveSection) {
        url.pathname = "/give";
        url.hash = consolidatedGiveSection;
        return Response.redirect(url.toString(), 301);
      }
      if (["/give/share", "/give/share/", "/give/share.html"].includes(url.pathname.toLowerCase())) {
        url.pathname = "/give";
        url.hash = "parish-council";
        return Response.redirect(url.toString(), 301);
      }
      if (["/vision", "/vision/", "/vision.html"].includes(url.pathname.toLowerCase())) {
        url.pathname = "/about";
        return Response.redirect(url.toString(), 301);
      }
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
        const [canonicalPathname, canonicalHash = ""] = canonicalGivingPath.split("#");
        url.pathname = canonicalPathname;
        url.hash = canonicalHash;
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

    if (request.method === "GET" && url.pathname === "/give/find-parish.html") {
      url.pathname = "/give/find-parish";
      return Response.redirect(url.toString(), 301);
    }
    const cleanGivePage = url.pathname.match(/^\/give\/(features|how-it-works|pricing|request-demo|get-agapay|why|parish-giving|recurring-donations|fundraising|event-payments)\.html$/)?.[1];
    if (request.method === "GET" && cleanGivePage) {
      url.pathname = `/give/${cleanGivePage}`;
      return Response.redirect(url.toString(), 301);
    }

    const routedApiResponse = await dispatchRouteRegistries(API_ROUTE_REGISTRIES, {
      request,
      env,
      ctx,
      url,
      actions: ROUTE_ACTIONS,
    });
    if (routedApiResponse !== null) return routedApiResponse;
    if (url.pathname === "/api/contact" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const name         = String(body.name         || "").trim().slice(0, 120);
        const email        = String(body.email        || "").trim().slice(0, 200);
        const organization = String(body.organization || "").trim().slice(0, 200);
        const topic        = String(body.topic        || "General Question").trim().slice(0, 100);
        const message      = String(body.message      || "").trim().slice(0, 4000);
        if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: "Name, email, and message are required." }, { status: 400 });
        }
        const to   = env.AGAPAY_SUPPORT_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
        const from = env.AGAPAY_FROM_EMAIL    || "AGAPAY <onboarding@agapay.app>";
        const emailResult = await sendEmail(env, {
          from,
          to,
          reply_to: email,
          subject: `AGAPAY Contact: ${topic}`,
          html: agapayEmailHtml(
            "https://agapay.app",
            `Contact: ${topic}`,
            `<p style="margin:0 0 10px;font-size:14px;color:#595959;">New message from the AGAPAY contact form.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
              <tr><td style="padding:6px 10px 6px 0;color:#595959;width:130px;vertical-align:top;"><strong>From</strong></td><td style="padding:6px 0;">${htmlEscape(name)}</td></tr>
              <tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Email</strong></td><td style="padding:6px 0;"><a href="mailto:${htmlEscape(email)}" style="color:#0A365B;">${htmlEscape(email)}</a></td></tr>
              ${organization ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Organization</strong></td><td style="padding:6px 0;">${htmlEscape(organization)}</td></tr>` : ""}
              <tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Topic</strong></td><td style="padding:6px 0;">${htmlEscape(topic)}</td></tr>
              <tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Message</strong></td><td style="padding:6px 0;white-space:pre-wrap;">${htmlEscape(message)}</td></tr>
            </table>`
          ),
          text: `AGAPAY Contact Form\n\nFrom: ${name} <${email}>\nOrganization: ${organization || "N/A"}\nTopic: ${topic}\n\nMessage:\n${message}`
        });
        if (emailResult.status === "not_configured") {
          return json({ ok: false, error: "Email is not configured on this server." }, { status: 503 });
        }
        return json({ ok: true });
      } catch (err) {
        return json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
    }
    if (url.pathname === "/api/admin/seed-demo" && request.method === "POST") {
      if (!(await requireAdmin(request, env))) return unauthorized();
      if (!hasProductionStore(env)) return missingProductionStoreResponse();

      const body = await request.json().catch(() => ({}));
      const requestedParishId = String(body.parishId || url.searchParams.get("parishId") || url.searchParams.get("parish") || "st-fiacre").trim();
      if (!requestedParishId) return json({ error: "Choose a parish dashboard to seed." }, { status: 422 });

      const foundRegistration = await findRegistrationByParishId(env, requestedParishId);
      if (!foundRegistration && requestedParishId !== "st-fiacre") {
        return json({ error: `No parish dashboard was found for "${requestedParishId}".` }, { status: 404 });
      }

      const DEMO_PARISH_ID  = foundRegistration?.registration?.parishId || requestedParishId;
      const DEMO_REFERENCE  = foundRegistration?.key || "demo-st-fiacre-2025";
      const now = new Date().toISOString();
      const demoFunds = [
        { name: "General Operating Fund", code: "general",    isDefault: true,  sortOrder: 0 },
        { name: "Candles / Vigil Lights", code: "candle",   isDefault: false, sortOrder: 1 },
        { name: "Building Fund",        code: "building",   isDefault: false, sortOrder: 2 },
        { name: "Benevolence Fund",     code: "alms",       isDefault: false, sortOrder: 3 },
        { name: "Iconography Fund",     code: "iconography",isDefault: false, sortOrder: 4 },
        { name: "Memorial / Panakhida", code: "memorial",   isDefault: false, sortOrder: 5 },
      ];
      const demoCampaigns = [
        {
          id: "roof-restoration",
          slug: "roof-restoration",
          name: "Church Roof Restoration",
          description: "Help us restore and protect our church for generations to come.",
          category: "Building",
          status: "active",
          active: true,
          goalCents: 1000000,
          raisedCents: 557500,
          coverPhotoUrl: "/images/marketplace/dome-cross.jpg",
          photos: ["/images/marketplace/dome-cross.jpg"],
          createdAt: "2025-01-01T10:00:00.000Z",
          updatedAt: now
        }
      ];
      const defaultDemoRegistration = {
        reference:              DEMO_REFERENCE,
        status:                 "verified",
        parishId:               DEMO_PARISH_ID,
        parishName:             "St. Fiacre Orthodox Church (Demo)",
        communityType:          "Parish",
        jurisdiction:           "Diocese of Chicago and Mid-America, Russian Orthodox Church Outside Russia",
        liturgicalCalendar:     "julian",
        priestName:             "Hieromonk Seraphim (Callahan)",
        priestEmail:            "fr.seraphim@stfiacre.org",
        treasurerName:          "Colleen Ryan",
        treasurerEmail:         "treasurer@stfiacre.org",
        addressLine1:           "4821 Frankford Ave",
        city:                   "Lubbock",
        state:                  "TX",
        postalCode:             "79424",
        country:                "US",
        website:                "https://stfiacre.org",
        phone:                  "(806) 555-0184",
        stripeAccountId:        "acct_demo_st_fiacre",
        stripeAccountStatus:    "charges_enabled",
        givingStatus:           "active",
        subscriptionTier:       "parish",
        subscriptionStatus:     "active",
        sacramentsEnabled:      true,
        directoryEnabled:       true,
        bookstoreEnabled:       true,
        communicationsEnabled:  true,
        signupsEnabled:         true,
        exchangeEnabled:        true,
        prayerRequestsEnabled:  true,
        dashboardInviteEmailStatus: "sent",
        adminNotificationEmailStatus: "sent",
        receivedAt:             "2024-09-22T09:00:00.000Z",
        updatedAt:              now,
        givingFunds:            demoFunds,
        campaigns:              demoCampaigns,
        feastCampaigns:         []
      };

      const baseRegistration = foundRegistration?.registration || await applyParishDashboardPassword(
        defaultDemoRegistration,
        "demo2025",
        { temporary: false }
      );
      let demoRegistration = {
        ...baseRegistration,
        reference: baseRegistration.reference || DEMO_REFERENCE,
        parishId: DEMO_PARISH_ID,
        status: baseRegistration.status === "rejected" || baseRegistration.status === "cancelled" ? "verified" : (baseRegistration.status || "verified"),
        givingStatus: "active",
        stripeAccountStatus: baseRegistration.stripeAccountStatus || "charges_enabled",
        communityType: "Parish",
        subscriptionTier: "parish",
        subscriptionTierLabel: "Parish",
        subscriptionMonthlyCents: 14900,
        subscriptionStatus: baseRegistration.subscriptionStatus || "active",
        sacramentsEnabled: true,
        directoryEnabled: true,
        bookstoreEnabled: true,
        communicationsEnabled: true,
        signupsEnabled: true,
        exchangeEnabled: true,
        prayerRequestsEnabled: true,
        givingFunds: demoFunds,
        campaigns: demoCampaigns,
        feastCampaigns: [],
        updatedAt: now,
        parishUpdatedAt: now
      };

      if (foundRegistration?.registration) {
        demoRegistration = await invalidateOnboardingSignoffIfChanged(foundRegistration.registration, demoRegistration, { actor: "demo-seed", reason: "The demo seed changed material parish or giving configuration.", receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app" });
      }

      await saveRegistrationRecord(env, DEMO_REFERENCE, demoRegistration, foundRegistration?.registration || null);
      if (env.AGAPAY_REGISTRATIONS) {
        await env.AGAPAY_REGISTRATIONS.put(DEMO_REFERENCE, JSON.stringify(demoRegistration));
        await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(DEMO_PARISH_ID), DEMO_REFERENCE);
      }

      // Seed giving funds in D1
      try {
        const fundStmts = demoRegistration.givingFunds.map(f =>
          env.AGAPAY_DB.prepare(`
            INSERT OR IGNORE INTO giving_funds (parish_id, name, code, is_default, sort_order)
            VALUES (?, ?, ?, ?, ?)
          `).bind(DEMO_PARISH_ID, f.name, f.code, f.isDefault ? 1 : 0, f.sortOrder)
        );
        await env.AGAPAY_DB.batch(fundStmts);
      } catch (e) {}

      // St. Fiacre is the full Parish-tier staging demo. Keep every donor-facing
      // module visible after a reseed while retaining the directory's safe
      // publication, child-data, and address-visibility defaults.
      try {
        const timestamp = Date.now();
        await env.AGAPAY_DB.prepare(`
          INSERT INTO directory_parish_settings (
            parish_id, directory_enabled, ordinary_member_access_enabled, created_at, updated_at
          ) VALUES (?, 1, 1, ?, ?)
          ON CONFLICT(parish_id) DO UPDATE SET
            directory_enabled = 1,
            ordinary_member_access_enabled = 1,
            updated_at = excluded.updated_at
        `).bind(DEMO_PARISH_ID, timestamp, timestamp).run();
      } catch (e) {}

      // Seed realistic donation history in D1
      const demoIdPrefix = `demo_${DEMO_PARISH_ID.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "parish"}`;
      const donations = [
        { id: "demo_don_001", email: "maria.petrov@email.com",     name: "Maria Petrov",      amount: 20000, fund: "general", date: "2024-10-06T11:15:00.000Z" },
        { id: "demo_don_002", email: "nikolai.volkov@email.com",   name: "Nikolai Volkov",    amount: 5000,  fund: "candle",      date: "2024-10-06T09:42:00.000Z" },
        { id: "demo_don_003", email: "anna.kozlov@email.com",      name: "Anna Kozlov",       amount: 50000, fund: "general", date: "2024-10-13T12:00:00.000Z" },
        { id: "demo_don_004", email: "dmitri.morozov@email.com",   name: "Dmitri Morozov",    amount: 15000, fund: "building",    date: "2024-10-13T10:30:00.000Z" },
        { id: "demo_don_005", email: "elena.sokolov@email.com",    name: "Elena Sokolov",     amount: 10000, fund: "general", date: "2024-10-20T11:00:00.000Z" },
        { id: "demo_don_006", email: "peter.novak@email.com",      name: "Peter Novak",       amount: 25000, fund: "general", date: "2024-10-20T09:15:00.000Z" },
        { id: "demo_don_007", email: "sophia.lebedev@email.com",   name: "Sophia Lebedev",    amount: 7500,  fund: "alms",        date: "2024-10-27T13:00:00.000Z" },
        { id: "demo_don_008", email: "michael.orlov@email.com",    name: "Michael Orlov",     amount: 30000, fund: "general", date: "2024-11-03T10:00:00.000Z" },
        { id: "demo_don_009", email: "natalia.popov@email.com",    name: "Natalia Popov",     amount: 10000, fund: "iconography", date: "2024-11-03T11:30:00.000Z" },
        { id: "demo_don_010", email: "ivan.fedorov@email.com",     name: "Ivan Fedorov",      amount: 20000, fund: "general", date: "2024-11-10T09:00:00.000Z" },
        { id: "demo_don_011", email: "olga.karpov@email.com",      name: "Olga Karpov",       amount: 5000,  fund: "candle",      date: "2024-11-10T10:45:00.000Z" },
        { id: "demo_don_012", email: "sergei.belov@email.com",     name: "Sergei Belov",      amount: 100000,fund: "building",    date: "2024-11-17T12:00:00.000Z" },
        { id: "demo_don_013", email: "marina.titov@email.com",     name: "Marina Titov",      amount: 15000, fund: "general", date: "2024-11-24T09:30:00.000Z" },
        { id: "demo_don_014", email: "alexei.gusev@email.com",     name: "Alexei Gusev",      amount: 20000, fund: "general", date: "2024-12-01T10:00:00.000Z" },
        { id: "demo_don_015", email: "vera.nikitin@email.com",     name: "Vera Nikitin",      amount: 10000, fund: "memorial",    date: "2024-12-08T11:00:00.000Z" },
        { id: "demo_don_016", email: "boris.fomin@email.com",      name: "Boris Fomin",       amount: 25000, fund: "general", date: "2024-12-15T09:45:00.000Z" },
        { id: "demo_don_017", email: "lyudmila.zaytsev@email.com", name: "Lyudmila Zaytsev",  amount: 5000,  fund: "candle",      date: "2024-12-22T10:30:00.000Z" },
        { id: "demo_don_018", email: "andrei.morozov@email.com",   name: "Andrei Morozov",    amount: 50000, fund: "general", date: "2024-12-29T12:00:00.000Z" },
        { id: "demo_don_019", email: "tatiana.volkov@email.com",   name: "Tatiana Volkov",    amount: 20000, fund: "general", date: "2025-01-05T10:00:00.000Z" },
        { id: "demo_don_020", email: "konstantin.smirnov@email.com",name: "Konstantin Smirnov",amount: 30000, fund: "building",   date: "2025-01-12T09:00:00.000Z" },
        { id: "demo_don_022", email: "maria.petrov@email.com",     name: "Maria Petrov",      amount: 50000,  fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicComment: "In thanksgiving for the mission and all who worship here.", date: "2026-02-01T11:15:00.000Z" },
        { id: "demo_don_023", email: "peter.novak@email.com",      name: "Peter Novak",       amount: 75000,  fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicAnonymous: true, publicComment: "Praying this roof protects the church for many years.", date: "2026-02-22T09:45:00.000Z" },
        { id: "demo_don_024", email: "anna.kozlov@email.com",      name: "Anna Kozlov",       amount: 100000, fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicComment: "For our children and the future of the parish.", date: "2026-03-15T10:30:00.000Z" },
        { id: "demo_don_025", email: "nikolai.volkov@email.com",   name: "Nikolai Volkov",    amount: 125000, fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicComment: "Glory to God for this parish and the work ahead.", date: "2026-04-05T13:00:00.000Z" },
        { id: "demo_don_026", email: "elena.sokolov@email.com",    name: "Elena Sokolov",     amount: 65000,  fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicComment: "With love for our parish home.", date: "2026-05-03T10:00:00.000Z" },
        { id: "demo_don_027", email: "dmitri.morozov@email.com",   name: "Dmitri Morozov",    amount: 80000,  fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicAnonymous: true, publicComment: "For the continued life of the parish.", date: "2026-06-07T12:30:00.000Z" },
        { id: "demo_don_028", email: "sophia.lebedev@email.com",   name: "Sophia Lebedev",    amount: 55000,  fund: "Church Roof Restoration", giftType: "campaign", campaign: "Church Roof Restoration", campaignId: "alms", publicComment: "May this church shelter generations to come.", date: "2026-07-05T09:30:00.000Z" },
      ];

      try {
        const donationStmts = donations.map(d =>
          env.AGAPAY_DB.prepare(`
            INSERT INTO donor_offerings
              (id, donor_email, parish_id, payment_intent_id, status, payment_status, created_at, updated_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              donor_email = excluded.donor_email,
              parish_id = excluded.parish_id,
              payment_intent_id = excluded.payment_intent_id,
              status = excluded.status,
              payment_status = excluded.payment_status,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              data = excluded.data
          `).bind(
            `${demoIdPrefix}_${d.id}`,
            d.email,
            DEMO_PARISH_ID,
            `pi_${demoIdPrefix}_${d.id}`,
            "completed",
            "paid",
            d.date,
            d.date,
            JSON.stringify({
              donorName:   d.name,
              donorEmail:  d.email,
              amountCents: d.amount,
              giftAmountCents: d.amount,
              parishNetCents: d.amount,
              fund:        d.fund,
              giftType:    d.giftType || d.fund,
              campaign:    d.campaign || "",
              campaignId:  d.campaignId || "",
              campaignDescription: d.campaign ? "Demo gift for the roof restoration campaign." : "",
              publicAnonymous: Boolean(d.publicAnonymous),
              publicDisplayName: d.publicAnonymous ? "Anonymous" : d.name,
              publicComment: d.publicComment || "",
              parishId:    DEMO_PARISH_ID,
              currency:    "usd",
              status:      "completed",
              paymentStatus: "paid",
              isRecurring: d.id.endsWith("3") || d.id.endsWith("6"),
              createdAt:   d.date
            })
          )
        );
        await env.AGAPAY_DB.batch(donationStmts);
      } catch (e) {}

      // Seed a few commemorations
      const comms = [
        { id: "demo_comm_001", email: "maria.petrov@email.com",   date: "2025-01-12T10:00:00.000Z",
          living: ["Maria", "Alexei", "Natasha"], departed: ["Alexander", "Vera"] },
        { id: "demo_comm_002", email: "nikolai.volkov@email.com", date: "2025-01-12T09:30:00.000Z",
          living: ["Nikolai", "Elena"], departed: ["Mikhail"] },
        { id: "demo_comm_003", email: "anna.kozlov@email.com",    date: "2025-01-12T11:00:00.000Z",
          living: ["Anna", "John", "Sophia"], departed: ["Olga", "Dmitri"] },
      ];
      try {
        const commStmts = comms.map(c =>
          env.AGAPAY_DB.prepare(`
            INSERT OR IGNORE INTO commemorations (id, parish_id, donor_email, created_at, data)
            VALUES (?, ?, ?, ?, ?)
          `).bind(`${demoIdPrefix}_${c.id}`, DEMO_PARISH_ID, c.email, c.date, JSON.stringify({
            living: c.living, departed: c.departed, createdAt: c.date
          }))
        );
        await env.AGAPAY_DB.batch(commStmts);
      } catch (e) {}

      return json({
        ok: true,
        parishId: DEMO_PARISH_ID,
        dashboardUrl: `/parish/dashboard?parish=${DEMO_PARISH_ID}`,
        giveUrl: `/give/${DEMO_PARISH_ID}`,
        createdRegistration: !foundRegistration,
        message: foundRegistration
          ? `Demo data seeded into ${demoRegistration.parishName || DEMO_PARISH_ID}.`
          : "St. Fiacre Orthodox Church (Demo) seeded. Use password 'demo2025' for the parish dashboard."
      });
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
