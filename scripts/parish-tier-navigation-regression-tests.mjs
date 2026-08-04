import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, app, style] = await Promise.all([
  readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/style.css", import.meta.url), "utf8"),
]);

const parishGroupStart = dashboard.indexOf('id="nav-tier-parish"');
const settingsStart = dashboard.indexOf('id="nav-settings"');
assert.ok(parishGroupStart > dashboard.indexOf('id="nav-bookstore"'), "the Parish tier group must follow the lower subscription tiers");
assert.ok(settingsStart > parishGroupStart, "Settings must follow the Parish tier group");

const parishGroupSource = dashboard.slice(parishGroupStart, settingsStart);
const parishItems = [...parishGroupSource.matchAll(/class="sidebar-nav-item"[^>]*id="(nav-[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(parishItems, [
  "nav-sacraments",
  "nav-directory",
  "nav-communications",
  "nav-accounting",
  "nav-text",
], "Koinonia must sit directly after Directory and before Accounting");

assert.match(app, /const parishOrder = \['sacraments', 'directory', 'communications', 'accounting', 'text'\]/, "runtime ordering must place Koinonia after Directory and before Accounting");
assert.match(app, /parishOrder\.forEach[\s\S]*parishGroup\.appendChild\(item\)[\s\S]*sidebar\.appendChild\(parishGroup\)/, "runtime ordering must keep all Parish items inside the labeled group");

assert.match(dashboard, /<body class="dashboard-booting">[\s\S]*id="dashboardBootScreen"[\s\S]*<div class="app">/, "the gated dashboard must start behind a dedicated loading screen");
assert.ok(dashboard.includes('/parish/style.css?v=20260803bookstoresales1') && dashboard.includes('/parish/redesign.css?v=20260804paymentrouting1') && dashboard.includes('/parish/app.js?v=20260804paymentrouting1'), "the loading-state assets must use the current cache versions");
assert.match(style, /body\.dashboard-booting \.app \{ visibility: hidden; \}/, "the dashboard shell must stay hidden until parish entitlements are rendered");
assert.match(style, /body\.dashboard-refreshing::before/, "an in-place refresh must use a progress indicator without hiding the loaded dashboard");
assert.match(app, /const initialLoad = !currentParish/, "dashboard loading must distinguish first load from refresh");
assert.match(app, /renderDashboard\(\);\s*if \(initialLoad\) finishDashboardBoot\(\);/, "the dashboard must become visible only after the entitlement-aware render completes");
assert.match(app, /await Promise\.all\(\[\s*refreshSubscriptionStatus[\s\S]*refreshStripeStatus/, "independent status refreshes should run concurrently to reduce startup time");

console.log("PASS - Parish navigation keeps its tier order and does not flash gated features before entitlements load");
