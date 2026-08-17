import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sharedCss = await read("public/myagapay/koinonia-inner.css");
const sharedShell = await read("public/myagapay-shell.js");
const koinoniaPages = ["feed", "news", "groups", "teaching", "media", "signups", "exchange"];
const productPages = ["bookstore", "directory", "sacraments"];

for (const pageName of [...koinoniaPages, ...productPages]) {
  const html = await read(`public/myagapay/${pageName}.html`);
  assert.match(html, /\/myagapay\/koinonia-inner\.css\?v=20260817appmenu2/, `${pageName} must load the shared app-like inner-page frame`);
  assert.match(html, /\/myagapay-shell\.js\?v=20260817appmenu2/, `${pageName} must load the menu-capable My AGAPAY shell`);
  assert.match(html, /class="koinonia-mobile-appbar"/, `${pageName} must show the compact My AGAPAY mobile app bar`);
  assert.match(html, /class="koinonia-mobile-menu-toggle"[^>]*data-myagapay-app-menu-toggle/, `${pageName} must replace the bell with the My AGAPAY hamburger menu`);
  assert.doesNotMatch(html, /koinonia-mobile-notifications/, `${pageName} must not retain the announcement bell shortcut`);
}

for (const pageName of koinoniaPages) {
  const html = await read(`public/myagapay/${pageName}.html`);
  assert.match(html, /class="koinonia-page-heading(?: [^"]*)?"/, `${pageName} must retain its compact Koinonia subpage heading`);
  assert.match(html, /class="koinonia-page-back"[^>]*data-parish-life-back/, `${pageName} must prevent the shared shell from injecting a duplicate back control`);
  assert.match(html, /class="koinonia-page-back"[^>]*>[\s\S]*?Koinonia<\/a>/, `${pageName} must return to Koinonia`);
  assert.doesNotMatch(html, /koinonia-feature-hero|koinonia-screen-head/, `${pageName} must not retain an oversized or legacy feature hero`);
}

for (const pageName of productPages) {
  const html = await read(`public/myagapay/${pageName}.html`);
  assert.match(html, /<body class="[^"]*app-main-feature-page/, `${pageName} must opt into the main-feature layout`);
  assert.doesNotMatch(html, /class="koinonia-page-heading(?: [^"]*)?"/, `${pageName} must not repeat a second banner below the My AGAPAY app bar`);
}

assert.doesNotMatch(await read("public/myagapay/bookstore.html"), /class="bookstore-store-hero"/, "Bookstore must not retain its blue promotional hero");
assert.doesNotMatch(await read("public/myagapay/directory.html"), /class="directory-top cal-hero myagapay-page-hero"/, "Directory must not retain its blue promotional hero");
assert.doesNotMatch(await read("public/myagapay/sacraments.html"), /class="cal-hero myagapay-page-hero"/, "Sacraments must not retain its blue promotional hero");
const prayerPage = await read("public/myagapay/prayer-requests.html");
assert.match(prayerPage, /class="prayer-page-back"[^>]*>[\s\S]*?Koinonia<\/a>/, "Prayer Requests back label must say Koinonia");
assert.match(prayerPage, /class="koinonia-mobile-menu-toggle"[^>]*data-myagapay-app-menu-toggle/, "Prayer Requests must use the same hamburger navigation");
assert.doesNotMatch(prayerPage, /prayer-mobile-notifications/, "Prayer Requests must not retain the announcement bell shortcut");

assert.match(sharedCss, /\.koinonia-mobile-appbar \{ display:none;/, "the shared frame must keep the app bar mobile-only");
assert.match(sharedCss, /\.koinonia-page-heading \{[^}]*background:#fffdf8;/, "the shared frame must use the Prayer Requests cream heading");
assert.match(sharedCss, /grid-template-columns:minmax\(0,1fr\); align-content:start;/, "the shared frame must prevent stretched grid rows");
assert.match(sharedCss, /\.app-main-feature-page \.koinonia-inner-shell \{ padding-top:14px; \}/, "main feature content must start with breathing room after the app bar");
assert.match(sharedCss, /\.app-main-feature-page \.topbar \{ display:none !important; \}/, "main feature pages must not render a second banner below the app bar");
assert.match(sharedCss, /\.koinonia-mobile-menu-toggle/, "the shared frame must style the hamburger trigger");
assert.match(sharedShell, /function initializeMobileAppMenus\(/, "the shared shell must initialize app bar menus");
assert.match(sharedShell, /const links = visibleProducts\(\)/, "the hamburger menu must honor parish feature capabilities");
assert.match(sharedShell, /aria-controls/, "the hamburger menu must expose its controlled panel accessibly");

console.log("PASS - My AGAPAY destinations use app-like headers, capability-aware hamburger navigation, and non-redundant main feature layouts");
