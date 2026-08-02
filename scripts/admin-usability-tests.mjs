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

console.log("Admin usability tests passed.");
