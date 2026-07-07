import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  handleLearnBillingCheckout,
  handleLearnBillingStatus,
  handleLearnBooks,
  handleLearnCoOp,
  handleLearnCommunity,
  handleLearnDashboard,
  handleLearnFormation,
  handleLearnFamilyPlanningSave,
  handleLearnAttendanceSave,
  handleLearnGrades,
  handleLearnGradesSave,
  handleLearnGoogleCalendarCallback,
  handleLearnGoogleCalendarConnect,
  handleLearnGoogleCalendarPreview,
  handleLearnGoogleCalendarStatus,
  handleLearnHymnsProviderStatus,
  handleLearnMeta,
  handleLearnOnboarding,
  handleLearnOnboardingSave,
  handleLearnPlanner,
  handleLearnPrintCenter,
  handleLearnPrintPdf,
  handleLearnReadingsProviderStatus,
  handleLearnReports,
} from "./src/learn/handlers.js";
import { donorKey, hashSessionToken } from "./src/lib/core.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);
const localPreviewEmail = "preview@agapay.local";
const localPreviewToken = "agapay-local-preview";
const localPreviewSalt = "agapay-local-preview-salt";
const localPreviewStore = new Map();
localPreviewStore.set(donorKey(localPreviewEmail), JSON.stringify({
  email: localPreviewEmail,
  firstName: "Stephanie",
  lastName: "Preview",
  emailVerifiedAt: new Date().toISOString(),
  sessionSalt: localPreviewSalt,
  sessionTokenHash: await hashSessionToken(localPreviewToken, localPreviewSalt),
  sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}));
const localPreviewKv = {
  async get(key) { return localPreviewStore.get(String(key)) || null; },
  async put(key, value) { localPreviewStore.set(String(key), String(value)); },
  async delete(key) { localPreviewStore.delete(String(key)); },
  async list() { return { keys: [...localPreviewStore.keys()].map((name) => ({ name })), list_complete: true }; }
};
const learnEnv = {
  AGAPAY_REGISTRATIONS: localPreviewKv,
  // No Cloudflare Browser Rendering binding exists locally, so route PDF
  // generation through the pdf-lib fallback in print-documents.js instead
  // of print-engine.js's puppeteer-based renderer (see handleLearnPrintPdf).
  AGAPAY_TEST_MODE: "true",
  AGAPAY_ENABLED_PRODUCTS: process.env.AGAPAY_ENABLED_PRODUCTS || "give,learn,learn-coop",
  AGAPAY_PUBLIC_URL: process.env.AGAPAY_PUBLIC_URL,
  AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY: process.env.AGAPAY_STRIPE_PRICE_LEARN_FAMILY_MONTHLY,
  AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY: process.env.AGAPAY_STRIPE_PRICE_LEARN_FAMILY_YEARLY,
  GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  AGAPAY_LEARN_TIME_ZONE: process.env.AGAPAY_LEARN_TIME_ZONE,
  PONOMAR_HYMNS_BASE_URL: process.env.PONOMAR_HYMNS_BASE_URL,
  PONOMAR_HYMNS_ENABLED: process.env.PONOMAR_HYMNS_ENABLED,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8"
};

const immutableAssetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico"
]);

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cacheControlFor(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".html" || extension === ".xml") return "no-cache";
  if (immutableAssetExtensions.has(extension)) return "public, max-age=31536000, immutable";
  return "no-cache";
}

async function handleApi(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  function learnRequest() {
    const headers = new Headers(req.headers);
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${localPreviewToken}`);
    if (!headers.has("x-agapay-donor-email")) headers.set("x-agapay-donor-email", localPreviewEmail);
    return new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: "half"
    });
  }
  async function sendResponse(response) {
    response = await response;
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  if (pathname === "/api/security/config") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({
      turnstileEnabled: Boolean(process.env.TURNSTILE_SITE_KEY),
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ""
    }));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/meta") {
    await sendResponse(handleLearnMeta(learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/dashboard") {
    await sendResponse(handleLearnDashboard(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/planner") {
    await sendResponse(handleLearnPlanner(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/print-center") {
    await sendResponse(handleLearnPrintCenter(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && pathname.startsWith("/api/learn/print/")) {
    await sendResponse(handleLearnPrintPdf(learnRequest(), learnEnv, decodeURIComponent(pathname.slice("/api/learn/print/".length))));
    return true;
  }
  if (req.method === "POST" && pathname === "/api/learn/print") {
    await sendResponse(handleLearnPrintPdf(learnRequest(), learnEnv, ""));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/formation") {
    await sendResponse(handleLearnFormation(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/books") {
    await sendResponse(handleLearnBooks(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/grades") {
    await sendResponse(handleLearnGrades(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && pathname === "/api/learn/grades") {
    await sendResponse(handleLearnGradesSave(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && pathname === "/api/learn/attendance") {
    await sendResponse(handleLearnAttendanceSave(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/reports") {
    await sendResponse(handleLearnReports(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/co-op") {
    await sendResponse(handleLearnCoOp(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/community") {
    await sendResponse(handleLearnCommunity(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && ["/api/learn/onboarding", "/api/learn/setup"].includes(pathname)) {
    await sendResponse(handleLearnOnboarding(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && ["/api/learn/onboarding", "/api/learn/setup"].includes(pathname)) {
    await sendResponse(await handleLearnOnboardingSave(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && pathname === "/api/learn/family-planning") {
    await sendResponse(handleLearnFamilyPlanningSave(learnRequest(), learnEnv));
    return true;
  }
  if (pathname === "/api/learn/google-calendar/status") {
    await sendResponse(handleLearnGoogleCalendarStatus(learnRequest(), learnEnv));
    return true;
  }
  if (pathname === "/api/learn/google-calendar/connect") {
    await sendResponse(handleLearnGoogleCalendarConnect(learnRequest(), learnEnv));
    return true;
  }
  if (pathname === "/api/learn/google-calendar/callback") {
    await sendResponse(handleLearnGoogleCalendarCallback(learnRequest(), learnEnv));
    return true;
  }
  if (pathname === "/api/learn/google-calendar/preview") {
    await sendResponse(handleLearnGoogleCalendarPreview(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/billing/status") {
    await sendResponse(handleLearnBillingStatus(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/readings/status") {
    await sendResponse(handleLearnReadingsProviderStatus(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/learn/hymns/status") {
    await sendResponse(handleLearnHymnsProviderStatus(learnRequest(), learnEnv));
    return true;
  }
  if (req.method === "POST" && pathname === "/api/learn/billing/checkout") {
    await sendResponse(await handleLearnBillingCheckout(learnRequest(), learnEnv));
    return true;
  }
  const name = pathname.replace(/^\/api\//, "");
  const modulePath = path.join(root, "api", `${name}.js`);
  if (!(await pathExists(modulePath))) return false;
  const mod = await import(pathToFileURL(modulePath).href);
  await mod.default(req, res);
  return true;
}

async function resolveStaticPath(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/learn" || pathname === "/learn/") pathname = "/learn/index.html";
  if (pathname === "/learn/odyssey/dashboard/login" || pathname === "/learn/odyssey/dashboard/login/") pathname = "/learn/odyssey/dashboard/login.html";
  else if (pathname === "/learn/odyssey/dashboard/activate" || pathname === "/learn/odyssey/dashboard/activate/") pathname = "/learn/odyssey/dashboard/activate.html";
  else if (pathname === "/learn/odyssey/faq" || pathname === "/learn/odyssey/faq/") pathname = "/learn/odyssey/faq.html";
  else if (pathname === "/learn/odyssey" || pathname === "/learn/odyssey/") pathname = "/learn/odyssey/index.html";
  else if (pathname.startsWith("/learn/odyssey/dashboard") && !path.extname(pathname)) pathname = "/learn/odyssey/dashboard/index.html";
  if (pathname.startsWith("/learn/") && !path.extname(pathname)) pathname = `${pathname}.html`;
  if (pathname === "/myagapay/learn" || pathname === "/myagapay/learn/") pathname = "/learn/dashboard.html";
  if (pathname === "/myagapay/learn/setup" || pathname === "/myagapay/learn/setup/") pathname = "/learn/onboarding.html";
  if (pathname === "/myagapay/learn/onboarding" || pathname === "/myagapay/learn/onboarding/") pathname = "/learn/onboarding.html";
  if (pathname.startsWith("/myagapay/learn/") && !path.extname(pathname)) pathname = pathname.replace(/^\/myagapay/, "") + ".html";
  if (
    pathname === "/my-agapay" ||
    pathname === "/my-agapay/" ||
    pathname === "/my-agapay/dashboard" ||
    pathname === "/myagapay" ||
    pathname === "/myagapay/" ||
    pathname === "/myagapay/dashboard" ||
    pathname === "/myagapay/giving" ||
    pathname === "/myagapay/giving/"
  ) pathname = "/myagapay/index.html";
  if (pathname === "/myagapay/giving/offerings") pathname = "/myagapay/giving/history.html";
  if (pathname === "/myagapay/giving/names") pathname = "/myagapay/giving/commemorations.html";
  if (pathname === "/myagapay/settings") pathname = "/myagapay/account.html";
  if (pathname.startsWith("/my-agapay/") && !path.extname(pathname)) pathname = pathname.replace(/^\/my-agapay/, "/myagapay") + ".html";
  if (pathname.startsWith("/myagapay/") && !path.extname(pathname)) pathname = `${pathname}.html`;
  if (pathname === "/donor" || pathname === "/donor/") pathname = "/donor/index.html";
  if (pathname === "/donor/dashboard") pathname = "/donor/index.html";
  if (pathname === "/give" || pathname === "/give/") {
    pathname = "/give/index.html";
  } else if (pathname === "/give/login" || pathname === "/give/login/") {
    pathname = "/parish/login.html";
  } else if (pathname === "/give/find-parish") {
    pathname = "/give/find-parish.html";
  } else if (/^\/give\/[^/]+\/[^/]+-campaign\/?$/.test(pathname)) {
    pathname = "/give/parish-giving/index.html";
  } else if (["/give/features", "/give/how-it-works", "/give/pricing", "/give/why", "/give/parish-giving", "/give/recurring-donations", "/give/fundraising", "/give/event-payments"].includes(pathname)) {
    pathname = `${pathname}.html`;
  } else if (/^\/give\/[^/]+\/?$/.test(pathname)) {
    pathname = "/give/form.html";
  }
  if (!path.extname(pathname)) pathname = `${pathname}.html`;
  return path.normalize(path.join(publicDir, pathname));
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/") && await handleApi(req, res)) return;

    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" || req.method === "HEAD") {
      if (requestUrl.pathname === "/giving" || requestUrl.pathname === "/giving/" || requestUrl.pathname.startsWith("/giving/")) {
        requestUrl.pathname = requestUrl.pathname.replace(/^\/giving/, "/give");
        res.writeHead(301, { Location: requestUrl.toString() });
        res.end();
        return;
      }
      if (["/give/find-church", "/give/find-church.html", "/give/find_parish", "/give/parish-list"].includes(requestUrl.pathname)) {
        requestUrl.pathname = "/give/find-parish";
        res.writeHead(301, { Location: requestUrl.toString() });
        res.end();
        return;
      }
      const legacyParishId = String(requestUrl.searchParams.get("parish") || "").trim();
      if (["/give/form", "/give/form.html"].includes(requestUrl.pathname) && legacyParishId) {
        requestUrl.pathname = `/give/${encodeURIComponent(legacyParishId)}`;
        requestUrl.searchParams.delete("parish");
        res.writeHead(301, { Location: requestUrl.toString() });
        res.end();
        return;
      }
      const legacyCampaign = requestUrl.pathname.match(/^\/(?:give|giving)\/parish-giving\/([^/]+)\/?$/);
      const parishId = String(requestUrl.searchParams.get("parish") || "").trim();
      if (legacyCampaign && parishId) {
        const campaignSlug = decodeURIComponent(legacyCampaign[1]).replace(/-campaign$/, "");
        requestUrl.pathname = `/give/${encodeURIComponent(parishId)}/${encodeURIComponent(campaignSlug)}-campaign`;
        requestUrl.searchParams.delete("parish");
        res.writeHead(301, { Location: requestUrl.toString() });
        res.end();
        return;
      }
    }
    const legacyGivingRedirects = new Map([
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
    if (req.method === "GET" || req.method === "HEAD") {
      const canonicalGivingPath = legacyGivingRedirects.get(requestUrl.pathname.toLowerCase());
      if (canonicalGivingPath) {
        requestUrl.pathname = canonicalGivingPath;
        res.writeHead(301, { Location: requestUrl.toString() });
        res.end();
        return;
      }
    }
    if (
      req.method === "GET" &&
      ["/myagapay/login", "/myagapay/login/", "/donor/login", "/donor/login/", "/donor/login.html"].includes(requestUrl.pathname)
    ) {
      requestUrl.pathname = "/my-agapay/login";
      res.writeHead(301, { Location: requestUrl.toString() });
      res.end();
      return;
    }

    const { pathname } = requestUrl;
    const filePath = await resolveStaticPath(pathname);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Unable to read file");
    });
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": cacheControlFor(filePath)
    });
    stream.pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

export { port };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, () => {
    console.log(`AgaPay dev server running at http://localhost:${port}`);
  });
}
