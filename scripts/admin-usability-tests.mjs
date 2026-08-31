import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app] = await Promise.all([
  readFile("public/admin.html", "utf8"),
  readFile("public/admin/style.css", "utf8"),
  readFile("public/admin/app.js", "utf8"),
]);

assert.match(html, /<nav class="sidebar-nav" aria-label="Admin workspace">/);
assert.match(html, /sidebar-nav-group-label">Your work/);
assert.match(html, /sidebar-nav-group-label">Reviews/);
assert.match(html, /class="sidebar-toolbox"/);
assert.match(html, /<summary><span>More tools<\/span><small>Products &amp; system<\/small><\/summary>/);
assert.match(html, /sidebar-nav-group-label">Products/);
assert.match(html, /sidebar-nav-group-label">System/);
assert.doesNotMatch(html, /<div class="sidebar-nav-item/, "desktop navigation must use keyboard-accessible buttons");
assert.match(html, /id="navOnboardingCount"/);
assert.match(html, /id="topbarDescription"/);
assert.match(html, /class="topbar-account-menu"/);
assert.match(html, /class="admin-focus-hero"/);
assert.match(html, /class="admin-summary-strip"/);
assert.match(html, /id="adminStartHereTitle">Next parish actions/);
assert.match(html, /id="nextActionQueue"/);
assert.match(html, /Answer support/);
assert.match(html, /class="admin-health-overview"/);
assert.match(html, /class="admin-secondary-workspace"/);
assert.match(html, /Insights &amp; system detail/);
assert.match(html, /id="mobileMoreMenu" hidden/);

const mobilePrimaryButtons = html.match(/class="mobile-tab-link/g) || [];
assert.equal(mobilePrimaryButtons.length, 5, "mobile navigation must stay focused on five primary actions");
assert.match(css, /\.mobile-more-menu:not\(\[hidden\]\) \{ display: grid; \}/);
assert.match(css, /\.admin-today-grid/);
assert.match(css, /\.admin-secondary-workspace/);
assert.match(css, /\.admin-focus-score-ring/);
assert.match(app, /function toggleMobileMore\(force\)/);
assert.match(app, /overview: 'Today'/);
assert.match(app, /giving: 'Parish Onboarding'/);
assert.match(app, /giving: 'Complete the next required action for one parish at a time\.'/);
assert.doesNotMatch(html, /bulkAction\('stripe'\)|Create Stripe links/, "Admin must not expose bulk Stripe onboarding links");
assert.doesNotMatch(app, /id="taxReadinessStatus"|renderTaxReadinessPanel/, "parish onboarding must not expose a manual per-parish tax approval gate");
assert.match(app, /Subscription billing address/, "billing address belongs with subscription setup");
assert.match(app, /platform-level automatic tax configuration/, "admin UI must explain that Stripe handles AGAPAY subscription tax centrally");
assert.match(app, /onboarding-record-summary-grid/, "registration support data must open with a compact operational summary");
assert.match(app, /Technical details &amp; review evidence/, "secondary registration metadata must live in a labeled disclosure");
assert.match(app, /Giving snapshot &amp; optional parish tools/, "giving totals and optional tools must not dominate the registration record");
assert.match(app, /id="registrationGivingSummary"/, "the condensed record must preserve the giving summary loader target");
assert.match(css, /\.onboarding-record-summary-grid \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(css, /\.onboarding-record-technical-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(app, /class="onboarding-stripe-observer"/, "Admin must present Stripe as observed server state");
assert.match(app, /The parish connects Stripe from its own dashboard/, "Admin must direct Stripe setup to the parish dashboard");
assert.doesNotMatch(app, /Create onboarding link|function startStripeOnboarding\(reference/, "Admin must not create a second Stripe onboarding link");
assert.doesNotMatch(app, /id="stripeAccountStatus"|id="stripeAccountId"/, "Admin must not expose editable Stripe connection state");
assert.match(app, /function deploymentCheckOk\(check, legacyValue\)/, "deployment health must normalize current structured checks and legacy values");
assert.match(app, /deploymentCheckOk\(checks\.d1, checks\.database === 'ok'\)/, "deployment health must read the current D1 check shape");
assert.match(app, /location\.hostname === 'agapay\.app' \? 'production'/, "production diagnostics must not show an unknown environment when the health endpoint omits the label");
assert.match(app, /function bindRegistrationAutosave\(reference\)/, "onboarding fields must bind to record-level autosave");
assert.match(app, /registrationAutosaveTimer = setTimeout\(\(\) => runRegistrationAutosave\(reference\), 900\)/, "autosave must debounce field edits");
assert.match(app, /sendDashboardInvite: false/, "autosave must never send a parish dashboard invitation");
assert.match(app, /includeReviewerNotes: false/, "autosave must not append partially typed reviewer notes");
assert.match(app, /new Set\(\['autoDashboardInvite', 'reviewerNotes', 'parishDashboardToken'\]\)/, "external-action and append-only fields must be excluded from autosave triggers");
assert.match(app, /loadRegistrations\(\{ silent: true, preserveSelection: true \}\)/, "manual saves must preserve the open church record");
assert.doesNotMatch(app, /renderQueueNext\(finalRegistration\);\s*await loadRegistrations\(\);/, "saving must not collapse the selected church back to the queue");
assert.match(
  app,
  /const action = nextActionPriority\(item\);\s*return action && action\.priority < 99;/,
  "admin metrics must tolerate registrations that have no remaining next action"
);

console.log("Admin usability tests passed.");
