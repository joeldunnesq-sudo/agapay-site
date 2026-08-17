import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const shell = read("public/myagapay-shell.js");
const styles = read("public/donor/style.css");
const donorApp = read("public/donor/app.js");
const directory = read("public/myagapay/directory.html");
const teaching = read("public/myagapay/teaching.js");
const parishDashboard = read("public/parish/dashboard.html");
const parishStyles = read("public/parish/style.css");
const serviceWorker = read("public/service-worker.js");
const staticHeaders = read("public/_headers");
const householdRenderer = directory.slice(
  directory.indexOf("async function renderHouseholdDetails"),
  directory.indexOf("function relationshipLabel")
);

const protectedPages = [
  "public/myagapay/index.html",
  "public/myagapay/account.html",
  "public/myagapay/bookstore.html",
  "public/myagapay/directory.html",
  "public/myagapay/feed.html",
  "public/myagapay/groups.html",
  "public/myagapay/media.html",
  "public/myagapay/news.html",
  "public/myagapay/parish-life.html",
  "public/myagapay/prayer-requests.html",
  "public/myagapay/sacraments.html",
  "public/myagapay/teaching.html",
  "public/myagapay/watch.html",
  "public/myagapay/giving/calendar.html",
  "public/myagapay/giving/give.html",
  "public/myagapay/giving/history.html"
];

for (const file of protectedPages) {
  const html = read(file);
  const expectedStylesheetVersion = [
    "public/myagapay/bookstore.html",
    "public/myagapay/media.html",
    "public/myagapay/watch.html"
  ].includes(file)
    ? "20260803iospolish1"
    : file === "public/myagapay/teaching.html"
      ? "20260809readingscroll2"
    : file === "public/myagapay/groups.html"
      ? "20260808ministryworkspace2"
    : [
        "public/myagapay/index.html",
        "public/myagapay/giving/give.html"
    ].includes(file)
      ? "20260803storefront1"
    : file === "public/myagapay/parish-life.html"
          ? "20260817prayersvg2"
        : file === "public/myagapay/prayer-requests.html"
          ? "20260817prayermockup4"
        : file === "public/myagapay/giving/calendar.html"
          ? "20260809readingscroll2"
          : "20260802playerredesign1";
  assert.match(html, /<html[^>]*data-myagapay-hydrate/, `${file} must opt into the pre-paint hydration shield`);
  assert.match(html, new RegExp(`/donor/style\\.css\\?v=${expectedStylesheetVersion}`), `${file} must load the current atomic-paint CSS version`);
  assert.match(html, /<script src="\/myagapay-shell\.js\?v=[a-zA-Z0-9]+"><\/script>/, `${file} must install the versioned tracker before page-level scripts`);
  assert.doesNotMatch(html, /myagapay-shell\.js\?v=[a-zA-Z0-9]+" defer/, `${file} must not defer initial shell setup`);
}

assert.match(
  styles,
  /url\("\/images\/app\/icon-512\.png"\) center calc\(50% - 46px\) \/ 80px 80px no-repeat,[\s\S]*?#0B2130/,
  "the atomic loading shield must downscale the app icon against its exact navy background",
);

assert.match(parishDashboard, /dashboard-boot-card[\s\S]*?<img src="\/images\/app\/icon-512\.png"/,
  "the parish dashboard loading screen must use the high-resolution AGAPAY app icon");
assert.match(parishStyles, /\.dashboard-boot-screen \{[\s\S]*?background: #0B2130;/,
  "the parish loading screen must match the app icon's exact navy background");
assert.match(teaching, /image:"\/images\/app\/icon-512\.png"/,
  "parish audio playback must use the high-resolution regular AGAPAY app icon");

assert.match(styles, /html\[data-myagapay-hydrate\]:not\(\[data-myagapay-page-ready="true"\]\) body::after[\s\S]*Loading your My AGAPAY page/,
  "the neutral shield must exist in render-blocking CSS before scripts run");
assert.match(shell, /url\.pathname === "\/api\/donor\/dashboard"[\s\S]*pendingEntitlementRequests \+= 1[\s\S]*pendingEntitlementRequests = Math\.max\(0, pageHydration\.pendingEntitlementRequests - 1\)/,
  "the shield must hold through authoritative dashboard entitlement requests");
assert.doesNotMatch(shell, /url\.pathname\.startsWith\("\/api\/"\)|new MutationObserver/,
  "unrelated background API and DOM activity must not hold the full-page navigation shield");
assert.match(shell, /pageHydration\.pendingEntitlementRequests > 0[\s\S]*window\.setTimeout\([\s\S]*window\.requestAnimationFrame\(finishMyAgapayPageHydration\)[\s\S]*window\.requestAnimationFrame\(reveal\)[\s\S]*}, 80\)/,
  "the shell must reveal after entitlement rendering settles across two paint frames");
assert.match(shell, /dataset\.myagapayPageReady = "true"[\s\S]*finishInternalNavigationProgress\(\)/,
  "navigation progress and page reveal must finish together");
assert.match(serviceWorker, /isVersionedStaticAsset\(request, url\)[\s\S]*caches\.match\(request\)[\s\S]*if \(shouldBypassCache\(request\)\) return/,
  "the PWA must serve versioned My AGAPAY shell assets cache-first before the private-route bypass");
for (const asset of ["/donor/style.css", "/donor/app.js", "/myagapay-shell.js"]) {
  assert.match(staticHeaders, new RegExp(`${asset.replace(/[./]/g, "\\$&")}\\r?\\n  Cache-Control: public, max-age=31536000, immutable`),
    `${asset} must be immutable because every app reference carries a release version`);
}
assert.doesNotMatch(staticHeaders, /\/donor\/\*\s+Cache-Control: no-store/,
  "the shared donor JS and CSS must not inherit no-store on every navigation");

const dashboardLoader = donorApp.match(/async function loadDonorDashboardPage\(\)[\s\S]*?\n}/)?.[0] || "";
assert.doesNotMatch(dashboardLoader, /readDonorCache\("dashboard"\)|renderDonorDashboardPayload\(cached/,
  "Home must never paint cached personalized data before the current dashboard response");
assert.match(dashboardLoader, /await donorApi\("\/api\/donor\/dashboard"\)[\s\S]*renderDonorDashboardPayload\(data\)/,
  "Home must visibly commit the current live dashboard snapshot");

assert.match(directory, /let householdDetailLoaded = false;[\s\S]*let householdDetailError = "";/,
  "Directory must distinguish unknown, loaded, and failed household state");
assert.match(directory, /firstHousehold\(\) && !householdDetailLoaded[\s\S]*Loading listing status/,
  "Directory must not compute combined publication state from a profile-only partial response");
assert.match(directory, /catch \(error\) \{[\s\S]*householdDetailError = error\.message[\s\S]*householdPublicationSummary[\s\S]*<strong>Unavailable<\/strong>/,
  "Directory household failures must preserve an explicit error state");
assert.match(directory, /if \(householdDetailError\)[\s\S]*<h2>Listing status unavailable<\/h2>/,
  "Directory must render unavailable, never a false private draft, after a household failure");
assert.doesNotMatch(householdRenderer, /api\(`\/api\/directory\/households\/\$\{encodeURIComponent\(household\.id\)\}\/self`\)\.catch\(\(\) => null\)/,
  "Directory must not collapse a failed household request into valid empty data");

console.log(`PASS - ${protectedPages.length} protected My AGAPAY pages reveal an initialized shell without waiting for background APIs`);
