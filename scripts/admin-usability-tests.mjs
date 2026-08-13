import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile("public/admin.html", "utf8"),
  readFile("public/admin/style.css", "utf8"),
  readFile("public/admin/app.js", "utf8"),
]);

assert.match(html, /<nav class="sidebar-nav" aria-label="Admin workspace">/);
assert.match(html, /sidebar-nav-group-label">Today/);
assert.match(html, /sidebar-nav-group-label">Products/);
assert.match(html, /sidebar-nav-group-label">Work queues/);
assert.match(html, /sidebar-nav-group-label">Operations/);
assert.match(html, /sidebar-nav-group-label">System/);
assert.doesNotMatch(html, /<div class="sidebar-nav-item/, "desktop navigation must use keyboard-accessible buttons");
assert.match(html, /id="navOnboardingCount"/);
assert.match(html, /id="topbarDescription"/);
assert.match(html, /id="adminStartHereTitle">Start here/);
assert.match(html, /Review new parishes/);
assert.match(html, /Answer support/);
assert.match(html, /Confirm platform health/);
assert.match(html, /id="mobileMoreMenu" hidden/);

const mobilePrimaryButtons = html.match(/class="mobile-tab-link/g) || [];
assert.equal(mobilePrimaryButtons.length, 5, "mobile navigation must stay focused on five primary actions");
assert.match(css, /\.mobile-more-menu:not\(\[hidden\]\) \{ display: grid; \}/);
assert.match(css, /\.admin-workflow-grid/);
assert.match(app, /function toggleMobileMore\(force\)/);
assert.match(app, /giving: 'Parish Onboarding'/);
assert.match(app, /giving: 'Verify, invite, connect Stripe, and confirm billing\.'/);
assert.doesNotMatch(app, /id="taxReadinessStatus"|renderTaxReadinessPanel/, "parish onboarding must not expose a manual per-parish tax approval gate");
assert.match(app, /Subscription billing address/, "billing address belongs with subscription setup");
assert.match(app, /platform-level automatic tax configuration/, "admin UI must explain that Stripe handles AGAPAY subscription tax centrally");
assert.match(app, /onboarding-record-summary-grid/, "registration support data must open with a compact operational summary");
assert.match(app, /Technical details &amp; review evidence/, "secondary registration metadata must live in a labeled disclosure");
assert.match(app, /Giving snapshot &amp; optional parish tools/, "giving totals and optional tools must not dominate the registration record");
assert.match(app, /id="registrationGivingSummary"/, "the condensed record must preserve the giving summary loader target");
assert.match(css, /\.onboarding-record-summary-grid \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(css, /\.onboarding-record-technical-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(
  app,
  /const action = nextActionPriority\(item\);\s*return action && action\.priority < 99;/,
  "admin metrics must tolerate registrations that have no remaining next action"
);

console.log("Admin usability tests passed.");
