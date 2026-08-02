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
  "public/myagapay/sacraments.html",
  "public/myagapay/teaching.html",
  "public/myagapay/watch.html",
  "public/myagapay/giving/calendar.html",
  "public/myagapay/giving/give.html",
  "public/myagapay/giving/history.html"
];

for (const file of protectedPages) {
  const html = read(file);
  const expectedStylesheetVersion = file === "public/myagapay/groups.html"
    ? "20260802groupscss1"
    : "20260802playerredesign1";
  assert.match(html, /<html[^>]*data-myagapay-hydrate/, `${file} must opt into the pre-paint hydration shield`);
  assert.match(html, new RegExp(`/donor/style\\.css\\?v=${expectedStylesheetVersion}`), `${file} must load the current atomic-paint CSS version`);
  assert.match(html, /<script src="\/myagapay-shell\.js\?v=20260801atomicpaint1"><\/script>/, `${file} must install the tracker before page-level scripts`);
  assert.doesNotMatch(html, /myagapay-shell\.js\?v=20260801atomicpaint1" defer/, `${file} must not defer initial request tracking`);
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
assert.match(shell, /window\.fetch = async \(\.\.\.args\)[\s\S]*pendingRequests \+= 1[\s\S]*pendingRequests = Math\.max\(0, pageHydration\.pendingRequests - 1\)/,
  "the shell must hold the first paint across every initial API request");
assert.match(shell, /pageHydration\.settleTimer = window\.setTimeout\([\s\S]*}, 180\)/,
  "the shield must wait for a quiet window after network completion");
assert.match(shell, /new MutationObserver[\s\S]*noteMyAgapayHydrationActivity\(\)[\s\S]*scheduleMyAgapayPageHydrationFinish\(\)/,
  "DOM activity must restart the page reveal quiet window");
assert.match(shell, /dataset\.myagapayPageReady = "true"[\s\S]*finishInternalNavigationProgress\(\)/,
  "navigation progress and page reveal must finish together");

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

console.log(`PASS - ${protectedPages.length} protected My AGAPAY pages reveal only after atomic initial hydration`);
