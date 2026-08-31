import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, app, directoryFeature, libraryFeature, sacramentsFeature, style, stewardshipCss] = await Promise.all([
  readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8"),
  readParishDashboardSource(),
  readFile(new URL("../public/parish/features/directory.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/features/library.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/features/sacraments.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/style.css", import.meta.url), "utf8"),
  readFile(new URL("../public/styles/stewardship.css", import.meta.url), "utf8"),
]);
const parishRuntime = [app, directoryFeature, libraryFeature, sacramentsFeature].join("\n");

const parishGroupStart = dashboard.indexOf('id="nav-tier-parish"');
const settingsStart = dashboard.indexOf('id="nav-settings"');
assert.ok(parishGroupStart > dashboard.indexOf('id="nav-bookstore"'), "the Parish tier group must follow the lower subscription tiers");
assert.ok(settingsStart > parishGroupStart, "Settings must follow the Parish tier group");

const parishGroupSource = dashboard.slice(parishGroupStart, settingsStart);
const parishItems = [...parishGroupSource.matchAll(/class="sidebar-nav-item"[^>]*id="(nav-[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(parishItems, [
  "nav-sacraments",
  "nav-directory",
  "nav-library",
  "nav-communications",
  "nav-accounting",
  "nav-text",
], "Parish Library and Koinonia must remain grouped between Directory and Accounting");

assert.match(app, /const parishOrder = \['sacraments', 'directory', 'library', 'communications', 'accounting', 'text'\]/, "runtime ordering must place Parish Library before Koinonia and Accounting");
assert.match(app, /parishOrder\.forEach[\s\S]*parishGroup\.appendChild\(item\)[\s\S]*sidebar\.appendChild\(parishGroup\)/, "runtime ordering must keep all Parish items inside the labeled group");

assert.match(dashboard, /<body class="dashboard-booting">[\s\S]*id="dashboardBootScreen"[\s\S]*<div class="app">/, "the gated dashboard must start behind a dedicated loading screen");
const featureAssetVersions = [
  '/parish/feature-registry.js',
  '/parish/features/directory.js',
  '/parish/features/library.js',
  '/parish/features/sacraments.js',
  '/parish/app.js',
].map((asset) => dashboard.match(new RegExp(`${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=([^"']+)`))?.[1]);
assert.ok(
  dashboard.includes('/parish/style.css?v=20260817centralemail1')
    && dashboard.includes('/parish/redesign.css?v=20260829fullscreen1')
    && dashboard.includes('/parish/library.css?v=20260829fullscreen1')
    && dashboard.includes('/styles/stewardship.css?v=20260829fullscreen1')
    && featureAssetVersions.every((version) => version && version === featureAssetVersions[0]),
  "the loading-state assets must use current, synchronized cache versions"
);
for (const feature of ["directory", "library", "sacraments"]) {
  assert.ok(
    dashboard.indexOf(`/parish/features/${feature}.js?v=`) < dashboard.indexOf('/parish/app.js?v='),
    `${feature} must load before the dashboard core`
  );
}
assert.ok(
  app.includes("content?.classList.toggle('standalone-tab-active', panel?.parentElement === content)")
    && /\.content\.standalone-tab-active > \.detail-wrap\s*\{\s*display:\s*none;\s*\}/.test(stewardshipCss),
  "direct-child Parish tier panels must remove the empty standard tab spacer before their hero"
);
assert.ok(
  stewardshipCss.includes('#tab-directory.parish-tier-panel.active')
    && stewardshipCss.includes('#tab-library.parish-tier-panel.active')
    && stewardshipCss.includes('#tab-library .parish-library-admin'),
  "Directory and Parish Library must use the shared full-width feature-page frame"
);
assert.match(style, /body\.dashboard-booting \.app \{ visibility: hidden; \}/, "the dashboard shell must stay hidden until parish entitlements are rendered");
assert.match(style, /body\.dashboard-refreshing::before/, "an in-place refresh must use a progress indicator without hiding the loaded dashboard");
// First-load/refresh distinction and reveal ordering are exercised against the
// real DOM in parish-dashboard-browser-tests.mjs, including failed-render retry.
assert.match(parishRuntime, /await Promise\.all\(\[\s*refreshSubscriptionStatus[\s\S]*refreshStripeStatus[\s\S]*refreshParishLibraryNavigationStatus/, "independent status refreshes should run concurrently to reduce startup time");

console.log("PASS - Parish navigation keeps its tier order and does not flash gated features before entitlements load");
