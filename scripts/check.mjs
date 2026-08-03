import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { parishSlug } from "../src/lib/format.js";

const worker = await readFile("src/worker.js", "utf8");
const core = await readFile("src/lib/core.js", "utf8");
const stripeConnect = await readFile("src/lib/stripe-connect.js", "utf8");
const adminHandler = await readFile("src/handlers/admin.js", "utf8");
const donorHandler = await readFile("src/handlers/donor.js", "utf8");
const parishSupportTickets = await readFile("src/lib/parish-support-tickets.js", "utf8");
const parishHandler = await readFile("src/handlers/parish.js", "utf8");
const parishCommemorationsHandler = await readFile("src/handlers/parish-commemorations.js", "utf8");
const parishGivingCatalogHandler = await readFile("src/handlers/parish-giving-catalog.js", "utf8");
const parishGivingReportsHandler = await readFile("src/handlers/parish-giving-reports.js", "utf8");
const parishSacramentsHandler = await readFile("src/handlers/parish-sacraments.js", "utf8");
const parishReconciliationHandler = await readFile("src/handlers/parish-reconciliation.js", "utf8");
const parishNotifications = await readFile("src/lib/parish-notifications.js", "utf8");
const stripeFees = await readFile("src/lib/stripe-fees.js", "utf8");
const stripeHandler = await readFile("src/handlers/stripe.js", "utf8");
const parishInterestHandler = await readFile("src/handlers/parish-interest.js", "utf8");
const wrangler = await readFile("wrangler.toml", "utf8");
const d1Migration = await readFile("migrations/0001_production_records.sql", "utf8");
const parishFeatureRequestMigration = await readFile("migrations/0059_parish_feature_requests.sql", "utf8");
const siteChrome = await readFile("public/site-chrome.js", "utf8");
assert.ok(siteChrome.includes('{ href: "/why", label: "Why AGAPAY", key: "why" }'), "canonical static-site navigation should include Why AGAPAY");
assert.ok(!/btn-donate[\s\S]{0,180}shellIcon\("giving-hand"\)/.test(siteChrome), "canonical Start for free button should not include an unrelated giving-hand icon");
assert.ok(!/drawer-join[\s\S]{0,120}shellIcon\("giving-hand"\)/.test(siteChrome), "mobile Start for free button should not include an unrelated giving-hand icon");
const backendSources = worker + core + stripeConnect + adminHandler + donorHandler + parishHandler + parishCommemorationsHandler + parishGivingCatalogHandler + parishGivingReportsHandler + parishSacramentsHandler + parishReconciliationHandler + parishNotifications + stripeFees + stripeHandler + parishInterestHandler;
const parishHandlers = parishHandler + parishCommemorationsHandler + parishGivingCatalogHandler + parishGivingReportsHandler + parishSacramentsHandler + parishReconciliationHandler;
assert.equal(parishSlug("St. Fiacre Orthodox Church", "Munster"), "st-fiacre-munster", "parish usernames should include patronal name and city");
assert.equal(parishSlug("Holy Resurrection Orthodox Church", "Boston"), "holy-resurrection-boston", "parish usernames should normalize common church suffixes");
assert.ok(wrangler.includes('binding = "AGAPAY_DB"'), "wrangler should bind the production D1 database");
assert.ok(d1Migration.includes("CREATE TABLE IF NOT EXISTS registrations"), "D1 migration should create registrations table");
assert.ok(
  parishFeatureRequestMigration.includes("PRIMARY KEY (parish_id, feature_id, donor_hash)")
    && parishFeatureRequestMigration.includes("parish_feature_request_dismissals"),
  "parish feature requests should use idempotent donor-level D1 storage and persistent dismissals"
);
assert.ok(backendSources.includes("AGAPAY_DB"), "worker should prefer D1 for production records");
assert.ok(worker.includes("handleAdminMigrateKvToD1"), "worker should include an admin KV-to-D1 migration endpoint");
assert.ok(backendSources.includes("AGAPAY_REGISTRATIONS"), "worker should retain KV fallback during migration");
assert.ok(backendSources.includes("Stripe-Account"), "checkout should support routing payments to connected Stripe accounts");
assert.ok(backendSources.includes("PASSWORD_HASH_VERSION"), "worker should use versioned password records");
assert.ok(backendSources.includes("pbkdf2-sha256"), "worker should hash new passwords with PBKDF2-SHA256");
assert.ok(backendSources.includes("rateLimit(request, env"), "worker should rate-limit sensitive API routes");
assert.ok(backendSources.includes("verifyTurnstileIfConfigured"), "worker should support optional Cloudflare Turnstile checks");
assert.ok(backendSources.includes("handleSecurityConfig"), "worker should expose public security config for Turnstile-capable clients");
assert.ok(backendSources.includes('"admin-auth"'), "admin auth routes should be rate-limited before password checks");
assert.ok(backendSources.includes('"parish-auth"'), "parish dashboard login routes should be rate-limited before password checks");
assert.ok(
  backendSources.includes("const dashboardParish = await enrichParishGivingOptions(env")
    && backendSources.includes("parish: dashboardParish"),
  "parish dashboard campaigns should aggregate progress from the same paid offerings as donor and public views"
);
assert.ok(backendSources.includes('"admin-money-actions"'), "admin Stripe/billing actions should be rate-limited");
assert.ok(backendSources.includes('"parish-money-actions"'), "parish Stripe/billing actions should be rate-limited");
assert.ok(
  parishHandler.includes('form.set("flow_data[type]", "subscription_cancel")')
    && parishHandler.includes('form.set("flow_data[subscription_cancel][subscription]", subscriptionId)'),
  "parish subscription cancellation should use Stripe's hosted confirmation flow"
);
assert.ok(backendSources.includes("claimStripeEvent(env, event)") && backendSources.includes("finishStripeEvent(env, event.id"), "Stripe webhooks should claim and finish events for idempotency");
assert.ok(backendSources.includes("checkout.session.expired"), "Stripe webhooks should handle expired checkout sessions");
assert.ok(backendSources.includes("checkout.session.async_payment_succeeded"), "Stripe webhooks should handle delayed successful checkout payments");
assert.ok(backendSources.includes("checkout.session.async_payment_failed"), "Stripe webhooks should handle delayed failed checkout payments");
assert.ok(backendSources.includes("payment_intent.succeeded"), "Stripe webhooks should handle successful payment intents");
assert.ok(backendSources.includes("payment_intent.payment_failed"), "Stripe webhooks should handle failed payments");
assert.ok(backendSources.includes("payment_intent.canceled"), "Stripe webhooks should handle canceled payments");
assert.ok(backendSources.includes("charge.refunded"), "Stripe webhooks should handle refunds");
assert.ok(backendSources.includes("charge.dispute.created"), "Stripe webhooks should handle disputes");
assert.ok(backendSources.includes("charge.dispute.closed"), "Stripe webhooks should handle closed disputes");
assert.ok(backendSources.includes("account.updated"), "Stripe webhooks should sync connected account status");
assert.ok(backendSources.includes("STRIPE_WEBHOOK_SECRET_CONNECT"), "Stripe webhooks should support a separate Connect signing secret");
assert.ok(backendSources.includes("verifyStripeWebhookWithAnySecret"), "Stripe webhooks should validate against all configured Stripe signing secrets");
assert.ok(backendSources.includes("handleParishStripeRefresh"), "parishes should be able to refresh Stripe Connect status after onboarding");
assert.ok(backendSources.includes("PARISH_ID_INDEX_PREFIX"), "worker should maintain KV parish id indexes");
assert.ok(backendSources.includes("handleAdminRebuildIndexes"), "worker should expose an admin-only index rebuild endpoint");
assert.ok(backendSources.includes("handleAdminReleaseStatus"), "worker should expose an admin release status endpoint");
assert.ok(worker.includes('url.pathname === "/api/admin/release-status"'), "worker should route the admin release status endpoint");
assert.ok(worker.includes("handleAdminWeeklyCommemorationEmails") && worker.includes('url.pathname === "/api/admin/commemorations/send-weekly"'), "worker should expose an admin-only weekly commemoration email diagnostic endpoint");
assert.ok(worker.includes("weekly_commemoration_emails") && worker.includes("dryRun: body.dryRun !== false"), "weekly commemoration emails should be observable and dry-run by default when triggered manually");
assert.ok(worker.includes("sendWeeklyTreasurerCommerceEmails") && worker.includes('url.pathname === "/api/admin/commerce/send-weekly-treasurer"'), "worker should expose an admin-only weekly treasurer commerce email endpoint");
assert.ok(worker.includes("commerce_weekly_reports") && worker.includes("weekly_treasurer_commerce_emails"), "weekly treasurer commerce emails should be deduped and observable");
assert.ok(worker.includes('["/parish/login", "/give/login"]'), "legacy parish login should redirect to the Give login URL");
assert.ok(worker.includes('url.pathname === "/give/login"'), "worker should serve the Give login URL from the parish login shell");
assert.ok(worker.includes('url.pathname.startsWith("/give/")') && worker.includes('url.pathname = "/give/form.html"'), "worker should serve parish giving pages at /give/:parish");
assert.ok(worker.includes('url.pathname.startsWith("/giving/")'), "worker should permanently redirect legacy /giving URLs");
for (const givingPage of ["features", "how-it-works", "pricing", "why"]) {
  assert.ok(worker.includes(`["/${givingPage}", "/give/${givingPage}"]`), `worker should redirect /${givingPage} to /give/${givingPage}`);
}
assert.ok(backendSources.includes("checkoutFinancials("), "worker should centralize donation fee calculations");
assert.ok(!backendSources.includes("subscription_data[application_fee_percent]"), "worker should not apply an AGAPAY application fee to recurring donor gifts");
assert.ok(!backendSources.includes("payment_intent_data[application_fee_amount]"), "worker should not apply an AGAPAY application fee to one-time donor gifts");
assert.ok(backendSources.includes("AGAPAY does not collect an application fee on donations"), "worker should document that AGAPAY charges no donation platform fee");
assert.ok(backendSources.includes("Do not add any AGAPAY platform/application fee to bookstore or future commerce checkouts"), "worker should document that Parish Commerce checkout has no AGAPAY application fee");
assert.ok(worker.includes("/api/checkout-session-status"), "worker should expose checkout return reconciliation");
assert.ok(backendSources.includes("session_id={CHECKOUT_SESSION_ID}"), "Stripe success URLs should include the Checkout session id");
assert.ok(backendSources.includes("/myagapay?gift_success=1"), "authenticated donor checkouts should return to the My AGAPAY dashboard");
assert.ok(!worker.includes("const parishes = ["), "worker should not hardcode demo parishes");
assert.ok(worker.includes('url.pathname === "/donor/verify"'), "worker should route donor verification links before assets");
assert.ok(worker.includes("handleDonorVerifyPage"), "worker should handle donor verification links server-side");
await assert.rejects(access("functions/donor/verify.js"), undefined, "donor verification should not use a Pages Function adapter");
await assert.rejects(access("public/_routes.json"), undefined, "Wrangler Worker deploy should not include Pages Functions route config");
await assert.rejects(access("public/donor/verify.html"), undefined, "static donor verify HTML should not shadow the Worker route");

const registerHtml = await readFile("public/register.html", "utf8");
const myAgapaySignupPage = await readFile("public/myagapay/signup.html", "utf8");
const parishOnboardingGuide = await readFile("public/docs/AGAPAY-Stripe-Setup-Guide.pdf");
const accountingSuiteGuide = await readFile("public/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf");
assert.ok(!registerHtml.includes("WEB3FORMS_KEY"), "registration should not expose Web3Forms key");
assert.ok(registerHtml.includes("/api/registrations"), "registration should post to AgaPay API");
assert.ok(registerHtml.includes("startDonorRegistration"), "registration should begin with a donor/family entry point");
assert.ok(registerHtml.includes("startOrganizationRegistration"), "registration should begin with an organization entry point");
assert.ok(registerHtml.includes("organizationDescription"), "registration should collect values-review copy when needed");
assert.ok(registerHtml.includes("requiresJurisdiction"), "registration should branch required fields by organization type");
assert.ok(registerHtml.includes("requiresWebsite"), "registration should require websites for businesses");
assert.ok(registerHtml.includes('id="subscriptionTier"') && registerHtml.includes("Starter — $9/month") && registerHtml.includes("Parish — $149/month"), "registration should require a current starting-tier choice");
assert.ok(registerHtml.includes("subscriptionTier: document.getElementById('subscriptionTier').value"), "registration should submit the selected starting tier");
assert.ok(parishHandler.includes('requiredFields') && parishHandler.includes('"subscriptionTier"') && parishHandler.includes("validTierForCommunity"), "registration backend should validate the selected tier for the community type");
assert.ok(parishNotifications.includes("loadParishOnboardingGuideAttachment") && parishNotifications.includes("currentGuideAttachment"), "new-parish email should attach the same current guide served by the dashboard");
assert.equal(parishOnboardingGuide.subarray(0, 4).toString(), "%PDF", "parish onboarding guide should be a real PDF");
assert.ok(parishOnboardingGuide.length > 10000, "parish onboarding guide should contain the complete current setup guide");
assert.equal(accountingSuiteGuide.subarray(0, 4).toString(), "%PDF", "accounting suite guide should be a real PDF");
assert.ok(accountingSuiteGuide.length > 100000, "accounting suite guide should contain the complete comprehensive guide");

const onboardingPage = await readFile("public/onboarding.html", "utf8");
assert.ok(onboardingPage.includes("Register your Orthodox parish.") && onboardingPage.includes("Register Parish"), "onboarding page should present parish registration only for now");
assert.ok(!onboardingPage.includes("organization") && !onboardingPage.includes("Organization") && !onboardingPage.includes("monastery, ministry, school, or Orthodox nonprofit"), "onboarding page should not list broader organizations yet");

const directoryPage = await readFile("public/directory.html", "utf8");
assert.ok(directoryPage.includes("AGAPAY Directory Intake"), "directory should render the intake experience");
assert.ok(directoryPage.includes("Submit a listing"), "directory should invite organizations to submit listings");
assert.ok(directoryPage.includes("parishes, monasteries, ministries, schools, businesses"), "directory should describe Orthodox organization coverage");
assert.ok(directoryPage.includes("/api/directory/intake"), "directory intake should post to the AGAPAY API");

const findChurchPage = await readFile("public/give/find-parish.html", "utf8");
assert.ok(findChurchPage.includes("Bring AGAPAY Give to your parish"), "find-parish should invite parishioners to advocate for AGAPAY Give");
assert.ok(findChurchPage.includes("/api/parish-interest"), "find-parish interest form should post to its Worker endpoint");
assert.ok(findChurchPage.includes("data-agapay-turnstile") && findChurchPage.includes("agapaySecurityPayload"), "parish interest outreach should use Turnstile when configured");
assert.ok(worker.includes('url.pathname === "/api/parish-interest"'), "worker should route parish interest submissions");


const donorApp = await readFile("public/donor/app.js", "utf8");
const publicLiturgicalCalendar = await readFile("public/liturgical-calendar.js", "utf8");
const srcLiturgicalCalendar = await readFile("src/liturgical-calendar.js", "utf8");
const myAgapayShell = await readFile("public/myagapay-shell.js", "utf8");
const manifest = await readFile("public/myagapay/manifest.webmanifest", "utf8");
const adminHtml = await readFile("public/admin.html", "utf8");
const adminLoginHtml = await readFile("public/admin/login.html", "utf8");
const adminApp = await readFile("public/admin/app.js", "utf8");
const adminCss = await readFile("public/admin/style.css", "utf8");
const adminManifest = await readFile("public/admin/manifest.webmanifest", "utf8");
const listenManifest = await readFile("public/listen/manifest.webmanifest", "utf8");
const listenIndex = await readFile("public/listen/index.html", "utf8");
const adminPwa = await readFile("public/admin/pwa.js", "utf8");
const serviceWorker = await readFile("public/service-worker.js", "utf8");
const pwaRegister = await readFile("public/pwa-register.js", "utf8");
const parishDashboardApp = await readFile("public/parish/app.js", "utf8");
const givingOverviewPage = await readFile("public/give/index.html", "utf8");
const rootPage = await readFile("public/index.html", "utf8");
const rootManifest = await readFile("public/manifest.webmanifest", "utf8");
const myAgapayLoginPage = await readFile("public/myagapay/login.html", "utf8");
assert.ok(myAgapaySignupPage.includes('I agree to the current <a href="/terms#arbitration"') && myAgapaySignupPage.includes('acknowledge the <a href="/privacy"'), "My AGAPAY signup should use the concise account agreement");
assert.ok(registerHtml.includes('I agree to the <a href="/terms#arbitration"') && registerHtml.includes('confirm I am authorized to act for this organization.'), "parish registration should use the concise organization agreement");
assert.ok(!registerHtml.includes('including the 30-day informal-resolution process') && !myAgapaySignupPage.includes('including the 30-day informal-resolution process'), "signup and registration should not repeat detailed dispute copy beside the checkbox");
assert.ok(manifest.includes("/images/app/apple-touch-icon-blue.png"), "PWA manifest should use the blue AGAPAY iOS home screen icon");
assert.ok(manifest.includes('"scope": "/myagapay"') && !manifest.includes('"scope": "/"'), "My AGAPAY PWA should cover /myagapay and /myagapay/learn without claiming /admin");
assert.ok(manifest.includes('"orientation": "portrait-primary"'), "My AGAPAY PWA manifest should prefer the phone-first portrait orientation");
assert.ok(manifest.includes('"lang": "en-US"') && manifest.includes('"dir": "ltr"'), "My AGAPAY PWA manifest should declare its language and text direction");
for (const category of ["finance", "lifestyle", "education"]) {
  assert.ok(manifest.includes(`"${category}"`), `My AGAPAY PWA manifest should include the ${category} category`);
}
for (const shortcut of ["/myagapay", "/myagapay/giving/calendar", "/myagapay/directory", "/myagapay/bookstore"]) {
  assert.ok(manifest.includes(`"url": "${shortcut}"`), `My AGAPAY PWA manifest should include the ${shortcut} shortcut`);
}
const parsedManifest = JSON.parse(manifest);
assert.ok(parsedManifest.shortcuts.slice(0, 3).some((shortcut) => shortcut.url === "/myagapay/bookstore"), "Bookstore should be among the first three shortcuts for launchers that cap the menu at three");
for (const shortcutIcon of ["give-v2.png", "today-v2.png", "directory-v2.png", "bookstore-v2.png"]) {
  assert.ok(manifest.includes(`/images/app/shortcuts/${shortcutIcon}`), `My AGAPAY PWA manifest should include the ${shortcutIcon} shortcut icon`);
  await access(`public/images/app/shortcuts/${shortcutIcon}`);
}
for (const screenshot of ["giving-dashboard.jpg", "today-in-the-church.jpg", "parish-bookstore.jpg"]) {
  assert.ok(manifest.includes(`/images/app/screenshots/${screenshot}`), `My AGAPAY PWA manifest should include ${screenshot}`);
  await access(`public/images/app/screenshots/${screenshot}`);
}
assert.equal((manifest.match(/"form_factor": "narrow"/g) || []).length, 3, "My AGAPAY PWA screenshots should declare the narrow mobile form factor");
assert.ok(myAgapayLoginPage.includes("/myagapay/manifest.webmanifest?v=20260729c"), "My AGAPAY login should use the current manifest URL so PWA analyzers do not reuse a stale report");
assert.ok(/navigator\.serviceWorker\.register\(\s*(["'])\/service-worker\.js\1/.test(myAgapayLoginPage), "My AGAPAY login HTML should directly register the service worker for PWABuilder's source parser");
assert.ok(pwaRegister.includes("registerOrUpdate();") && !pwaRegister.includes('window.addEventListener("load"'), "PWA registration should start immediately so automated analyzers can detect the service worker");
assert.ok(rootPage.includes('/manifest.webmanifest') && rootPage.includes('/pwa-register.js'), "public homepage should expose the root manifest and register the root service worker");
assert.ok(rootManifest.includes('"start_url": "/?source=pwa"') && rootManifest.includes('"scope": "/"'), "root PWA manifest should launch and scope the public AGAPAY app at the site root");
assert.ok(rootManifest.includes('"orientation": "portrait-primary"'), "root PWA manifest should prefer the phone-first portrait orientation");
assert.ok(givingOverviewPage.includes('/pwa-register.js') && givingOverviewPage.includes('id="heroInstallBtn"'), "Give homepage should register the service worker and route the hero Get the App button through install logic");
assert.ok(/class="hero-actions"[\s\S]{0,500}href="\/give\/pricing"[\s\S]{0,80}>View Pricing<\/a>/.test(givingOverviewPage), "Give homepage hero should link directly to pricing");
assert.ok(givingOverviewPage.includes("const isAndroid") && givingOverviewPage.includes("triggerAndroidInstall()") && givingOverviewPage.includes('scrollToInstall(isIOS ? "apple" : "android")'), "Give homepage hero install button should prompt Android users and scroll other users to app instructions");
assert.ok(adminHtml.includes('/admin/manifest.webmanifest') && adminLoginHtml.includes('/admin/manifest.webmanifest'), "admin console should install with the dedicated AGAPAY Admin manifest");
assert.ok(adminHtml.includes('/images/app/agapay-admin.png') && adminLoginHtml.includes('/images/app/agapay-admin.png') && adminManifest.includes('/images/app/agapay-admin.png'), "admin PWA should use the dedicated admin app icon");
assert.ok(adminManifest.includes('"id": "/admin-pwa"') && adminManifest.includes('"name": "AGAPAY Admin"') && adminManifest.includes('"start_url": "/admin?source=admin-pwa&tab=giving"') && adminManifest.includes('"scope": "/admin"'), "admin PWA manifest should open the mobile verification queue with a distinct app identity");
assert.ok(adminHtml.includes('/admin/pwa.js') && adminPwa.includes('beforeinstallprompt') && adminPwa.includes('serviceWorker'), "admin dashboard should expose install support without caching private admin data");
assert.ok(adminApp.includes('requestedTab') && adminApp.includes('queue-mobile-summary') && adminApp.includes('mobile-review-bar'), "admin dashboard should support a mobile-first parish verification flow");
assert.ok(adminHtml.includes("weeklyCommemorationParishId") && adminApp.includes("runWeeklyCommemorationEmail") && adminApp.includes("/api/admin/commemorations/send-weekly"), "admin dashboard should expose a weekly commemoration email preview/send control");
assert.ok(adminHtml.includes("weeklyTreasurerParishId") && adminApp.includes("runWeeklyTreasurerEmail") && adminApp.includes("/api/admin/commerce/send-weekly-treasurer"), "admin dashboard should expose a weekly treasurer commerce email preview/send control");
assert.ok(adminCss.includes('admin-mobile-command') && adminCss.includes('mobile-review-bar') && adminCss.includes('product-admin-hero-giving { display: none; }'), "admin dashboard should include dedicated mobile verification layout styles");
assert.ok(serviceWorker.includes('agapay-static-v28'), "service worker cache version should advance when PWA shell caching behavior changes");
assert.ok(serviceWorker.includes('url.pathname.startsWith("/api/") return true') || serviceWorker.includes('url.pathname.startsWith("/api/")) return true'), "service worker should bypass API responses, including private Directory JSON");
assert.ok(parishDashboardApp.includes("fetch(directoryAdminApi('/dashboard'), { headers })"), "Parish Dashboard Directory should use the parish dashboard auth headers");
assert.ok(!parishDashboardApp.includes("directoryAdminHeaders") && !parishDashboardApp.includes("handleDirectoryStaffLogin"), "Parish Dashboard Directory should not require a second My AGAPAY staff login");
assert.ok(!parishDashboardApp.includes("agapayPlatformToken") && !parishDashboardApp.includes("agapayUserToken"), "Parish Dashboard Directory should not read My AGAPAY tokens from localStorage");
assert.ok(listenManifest.includes('"scope": "/listen/"') && listenManifest.includes('"name": "AGAPAY Listen"'), "AGAPAY Listen PWA manifest should exist with its own scope and identity");
assert.ok(listenIndex.includes('/listen/manifest.webmanifest'), "AGAPAY Listen page should link its own manifest, not the root or admin one");
assert.ok(myAgapayShell.includes('id: "giving"') && myAgapayShell.includes('label: "Give"'), "shared My AGAPAY shell should define the canonical Give product tab");
assert.ok(myAgapayShell.includes('id: "commemorations"') && myAgapayShell.includes('label: "Sacraments & Services"'), "shared My AGAPAY shell should define the merged Sacraments & Services product tab");
assert.ok(myAgapayShell.includes('id: "parish-life"') && myAgapayShell.includes('communicationsEnabled ? "Koinonia" : "Today"'), "shared My AGAPAY shell should define one tier-aware parish landing product tab");
assert.ok(myAgapayShell.includes('id: "directory"') && myAgapayShell.includes('label: "Directory"'), "shared My AGAPAY shell should define Directory as a standard product tab");
assert.ok(myAgapayShell.includes('id: "learn"') && myAgapayShell.includes('label: "Learn"') && myAgapayShell.includes("visibleProducts()"), "shared My AGAPAY shell should keep Learn available in the desktop product nav");
assert.ok(myAgapayShell.includes('id: "bookstore"') && myAgapayShell.includes('label: "Bookstore"'), "shared My AGAPAY shell should define the canonical Bookstore product tab");
assert.ok(
  myAgapayShell.indexOf('id: "giving"') < myAgapayShell.indexOf('id: "parish-life"') &&
  myAgapayShell.indexOf('id: "parish-life"') < myAgapayShell.indexOf('id: "commemorations"') &&
  myAgapayShell.indexOf('id: "commemorations"') < myAgapayShell.indexOf('id: "directory"') &&
  myAgapayShell.indexOf('id: "directory"') < myAgapayShell.indexOf('id: "bookstore"') &&
  myAgapayShell.indexOf('id: "bookstore"') < myAgapayShell.indexOf('id: "learn"'),
  "shared My AGAPAY shell should order product tabs as Give, tier-aware parish landing, Prayer, Directory, Bookstore, Learn"
);
assert.ok(!myAgapayShell.includes('id: "home"'), "shared My AGAPAY shell should treat Give as the default product instead of a separate global home tab");
assert.ok(myAgapayShell.includes('pathname === "/myagapay"') && myAgapayShell.includes('return "giving"'), "shared My AGAPAY shell should make /myagapay resolve to the Give product");
assert.ok(myAgapayShell.includes('pathname.startsWith("/myagapay/directory")') && myAgapayShell.includes('return "directory"'), "shared My AGAPAY shell should make /myagapay/directory resolve to the Directory product");
assert.ok(!myAgapayShell.includes('data-myagapay-launch-gated') && !myAgapayShell.includes('release-flags'), "shared My AGAPAY shell should not gate Marketplace or Directory behind launch controls");
assert.ok(myAgapayShell.includes('parishFeature: "sacramentsEnabled"'), "shared My AGAPAY shell should gate Sacraments & Services on the parish capability");
assert.ok(myAgapayShell.includes('parishFeature: "directoryEnabled"'), "shared My AGAPAY shell should gate Directory on the parish capability");
assert.ok(worker.includes("sacramentsEnabled: true") && worker.includes("ordinary_member_access_enabled = 1"), "the full St. Fiacre demo reseed should keep Sacraments and Directory visible to donors");
assert.ok(donorHandler.includes("handleDonorMinistryServiceInterest") && worker.includes('/api/donor/ministry-service-interest'), "Koinonia should persist donor service interest through an authenticated endpoint");
assert.ok(parishDashboardApp.includes("ministry-service") && parishDashboardApp.includes("ready to serve"), "the parish dashboard should notify leaders about donor service interest");
assert.ok(myAgapayShell.includes('mobileFallbackFor: "sacramentsEnabled"') && myAgapayShell.includes('label: "History"'), "Giving History should replace unavailable Sacraments & Services in the bottom nav");
assert.ok(myAgapayShell.includes('mobileFallbackFor: "directoryEnabled"') && myAgapayShell.includes('label: "Learn"'), "Learn should replace unavailable Directory in the bottom nav");
assert.ok(myAgapayShell.includes('fetch("/api/donor/dashboard"'), "shared My AGAPAY shell should load the donor home parish capabilities");
assert.ok(siteChrome.includes("/myagapay/login?next=%2Fmyagapay%2Flearn%2Fdashboard"), "the site account menu should send AGAPAY Learn sign-ins directly to the Learn Dashboard");
assert.ok(parishDashboardApp.includes("changeDemoTier") && parishDashboardApp.includes("/api/parish/dashboard/st-fiacre/demo-tier"), "St. Fiacre dashboard should support instant demo tier switching");
assert.ok(parishDashboardApp.includes("Apply tier change") && parishDashboardApp.includes("startSubscriptionCheckout(this, \\'subscriptionTierUpgrade\\')"), "active parish subscriptions should change the selected tier without depending on Billing Portal product configuration");
assert.ok(parishDashboardApp.includes("sidebarStatusChip") && parishDashboardApp.includes("tierDisplay") && parishDashboardApp.includes("subscriptionTierLabel"), "Parish Dashboard active status should display the subscribed tier");
assert.ok(myAgapayShell.includes('data-myagapay-global-nav') && myAgapayShell.includes("normalizeProductNavs"), "shared shell should normalize mobile product navigation across dashboards");
assert.ok(myAgapayShell.includes(".unified-product-nav") && myAgapayShell.includes("Bookstore") && myAgapayShell.includes("Feast day and services"), "shared shell should normalize the desktop My AGAPAY sidebar from the same product tabs");
assert.ok(myAgapayShell.includes("isLikelyMobileBrowser") && myAgapayShell.includes("pointer: coarse"), "shared shell should use browser capability signals before choosing the mobile My AGAPAY viewport");
assert.ok(myAgapayShell.includes("ensureIosBackButton") && myAgapayShell.includes("myagapay-ios-back"), "shared shell should provide an in-app Back button for iPhone My AGAPAY screens");
assert.ok(myAgapayShell.includes("ensureCanonicalHeader") && myAgapayShell.includes("content.prepend(topbar)") && myAgapayShell.includes("myagapay-settings-chip"), "shared shell should add canonical account/settings access and a fallback topbar to My AGAPAY product headers");
assert.ok(myAgapayShell.includes("myagapay-menu-trigger") && myAgapayShell.includes("myagapay-menu-icon") && myAgapayShell.includes("Open My AGAPAY menu"), "shared My AGAPAY headers should use an obvious hamburger menu trigger");
const sharedHamburgerMenu = myAgapayShell.match(/menu\.innerHTML = `([\s\S]*?)`;/)?.[1] || "";
assert.ok(!sharedHamburgerMenu.includes("/myagapay/parish-life"), "the shared My AGAPAY hamburger menu should not duplicate Koinonia navigation");
assert.ok(
  myAgapayShell.includes("Report a problem / Request a feature")
    && myAgapayShell.includes('id = "myAgapaySupportDialog"')
    && myAgapayShell.includes('fetch("/api/donor/support-tickets"'),
  "the shared My AGAPAY hamburger menu should open a working problem and feature request form"
);
assert.ok(
  worker.includes('url.pathname === "/api/donor/support-tickets"')
    && donorHandler.includes("export async function handleDonorSupportTicket")
    && donorHandler.includes('rateLimit(request, env, "donor-support-ticket"')
    && donorHandler.includes('source: "myagapay"')
    && parishSupportTickets.includes('"feature"')
    && parishSupportTickets.includes('source === "myagapay" ? "My AGAPAY"'),
  "My AGAPAY support requests should use an authenticated, rate-limited endpoint and the shared support queue"
);
assert.ok(myAgapayShell.includes("handleUnauthorized") && myAgapayShell.includes("redirectToLogin"), "shared shell should enforce one expired-session response across My AGAPAY products");
assert.ok(donorApp.includes('nav.setAttribute("hx-boost", "false")'), "donor shell should not htmx-boost dashboard navigation");
assert.ok(donorApp.includes("function updateDonorAuthState()"), "donor shell should update guest/authenticated controls from localStorage session");
assert.ok(donorApp.includes('link.closest("[data-myagapay-global-nav]")'), "donor icon enhancement should not overwrite canonical global product icons");
const donorHome = await readFile("public/donor/index.html", "utf8");
const myAgapayGiveHome = await readFile("public/myagapay/index.html", "utf8");
const myAgapayGivePage = await readFile("public/myagapay/giving/give.html", "utf8");
const publicGivePage = await readFile("public/give/index.html", "utf8");
assert.ok(donorHome.includes("data-auth-guest"), "donor home should mark guest-only controls so signed-in donors do not see login prompts");
assert.ok(donorHome.includes("donor-phone"), "donor home should use the mobile-first app shell");
assert.ok(donorHome.includes("unified-product-nav"), "donor home should expose a desktop My AGAPAY sidebar for shared shell normalization");
assert.ok(!donorHome.includes("Back to Give"), "donor account menu should not include a Back to Give action");
assert.ok(donorHome.includes("myagapay-menu-trigger") && !donorHome.includes("donor-home-mini-avatar"), "donor home should replace account-holder initials with the shared hamburger menu");
const myAgapayHomeHamburger = myAgapayGiveHome.match(/<div class="donor-home-account-dropdown"[\s\S]*?<\/div>/)?.[0] || "";
assert.ok(!myAgapayHomeHamburger.includes("/myagapay/parish-life"), "the My AGAPAY dashboard hamburger should not duplicate Koinonia navigation");
assert.ok(
  ["Accounting", "Directory", "Commerce", "Koinonia", "Acts 2:42", "κοινωνία"].every((feature) => publicGivePage.includes(feature)),
  "the /give page should present the new parish platform features and explain Koinonia with Acts 2:42"
);
assert.ok(donorHome.includes('showing-giving-dashboard') && !donorHome.includes('my-agapay-live-grid') && !donorHome.includes('my-agapay-coming-grid'), "My AGAPAY root should open the Give dashboard directly without a product picker");
assert.ok(donorHome.includes("metricMonth"), "donor home should show month-to-date giving");
assert.ok(!donorHome.includes("Counts parish offerings (tithes) only"), "mobile Annual Pledge tracker should not include the tracking explanation copy");
assert.ok(
  donorHome.includes('id="pledgeLockedState"')
    && donorHome.includes("Encourage my parish")
    && donorApp.includes('parish?.pledgeTrackerEnabled === true')
    && donorApp.includes("/api/donor/stewardship-feature-request"),
  "My AGAPAY should gate pledge progress with a visible Stewardship request action"
);
assert.ok(donorHome.includes("summary-metrics-row") && donorHome.indexOf('class="summary-title"') < donorHome.indexOf('class="summary-metrics-row"'), "mobile Total Giving label should sit above the month/year metrics");
assert.ok(donorHome.includes("/myagapay/account"), "donor home avatar should link to My AGAPAY settings");
assert.ok(donorHome.includes("Active Funds") && donorHome.includes("desktopActiveFunds") && donorHome.includes("activeFunds"), "Give dashboard should show active parish funds on desktop and mobile");
assert.ok(donorHome.includes("Next Feast Offering"), "Give dashboard should use a giving-oriented feast card heading");
assert.ok(
  myAgapayGiveHome.includes('id="quickGiveTithes"')
    && !myAgapayGiveHome.includes('id="quickGiveOneTime"')
    && !myAgapayGiveHome.includes('id="quickGiveRecurring"')
    && myAgapayGiveHome.includes('data-giving-plus-gift="candles"')
    && myAgapayGivePage.includes("<h3>Tithes</h3>")
    && !myAgapayGivePage.includes("<h3>One-time Gift</h3>")
    && !myAgapayGivePage.includes("<h3>Recurring Gift</h3>")
    && myAgapayGivePage.includes('value="proskomedia_liturgy"')
    && myAgapayGivePage.includes('value="molieben_panikhida"')
    && myAgapayGivePage.includes("Molieben (Paraklesis) &amp; Panikhida (Parastas)"),
  "My AGAPAY should combine one-time and recurring giving under Tithes and offer both commemoration types"
);
assert.ok(
  myAgapayGivePage.includes('data-gift-frequency-mode="once"')
    && myAgapayGivePage.includes('data-gift-frequency-mode="recurring"')
    && !myAgapayGivePage.includes('<select class="form-select" id="frequency"')
    && donorApp.includes("function setDonorGiftFrequency"),
  "My AGAPAY giving should use side-by-side one-time and recurring pills while preserving recurring cadence"
);
assert.ok(
  donorApp.includes("function parishHasGivingPlus")
    && donorApp.includes("function updateGivingTierTiles")
    && donorApp.includes("function openGivingPlusPaywall")
    && donorApp.includes("/api/donor/giving-plus-feature-request"),
  "My AGAPAY should gate Giving Plus tiles with an upgrade paywall and a parish encouragement action"
);
assert.ok(
  donorHandler.includes('featureId: "giving-plus"')
    && worker.includes('url.pathname === "/api/donor/giving-plus-feature-request"')
    && parishDashboardApp.includes("item?.featureId === 'giving-plus'")
    && parishHandler.includes('["pledge-tracker", "giving-plus", "ministry-service"].includes(featureId)'),
  "Giving Plus donor requests should be stored, surfaced in the parish dashboard, and dismissible"
);
const myAgapayHistory = await readFile("public/myagapay/giving/history.html", "utf8");
assert.ok(
  !myAgapayGiveHome.includes("RecurringHomeAction")
    && myAgapayHistory.includes("historyRecurringHomeAction")
    && myAgapayHistory.includes("Manage recurring giving")
    && myAgapayHistory.indexOf("historyRecurringHomeAction") < myAgapayHistory.indexOf("Activity Timeline")
    && donorApp.includes("function renderRecurringHomeCard")
    && donorApp.includes('openDonorRecurringPortal("", button)'),
  "My AGAPAY History should show recurring-giving management immediately above the activity timeline"
);
const donorSettings = await readFile("public/donor/settings.html", "utf8");
assert.ok(donorSettings.includes("saveDonorSettings(event)"), "donor settings should save through the donor API");
const donorHistory = await readFile("public/donor/offerings.html", "utf8");
assert.ok(donorHistory.includes("Activity Timeline") && donorHistory.includes("historyProductFilters") && donorHistory.includes("agapayHistoryTimeline"), "My AGAPAY History should show a cross-product activity timeline");
assert.ok(donorApp.includes("buildHistoryActivities") && donorApp.includes("setHistoryProductFilter"), "donor app should render and filter cross-product History activity");
const donorCommemorations = await readFile("public/donor/commemorations.html", "utf8");
const myAgapaySacraments = await readFile("public/myagapay/sacraments.html", "utf8");
assert.ok(donorCommemorations.includes("/myagapay/sacraments") && myAgapaySacraments.includes("sacramentAccordion") && myAgapaySacraments.includes("servicesAccordion"), "Commemorations should redirect into the merged Sacraments & Services page");
assert.ok(donorApp.includes('id: "house_blessing", type: "house_blessing", section: "services"') && donorApp.includes('id: "counseling", type: "counseling", section: "services"'), "Blessings and Pastoral Counseling should appear under Services, not Sacraments");
assert.ok(donorApp.includes("function renderSacramentModal()") && donorApp.includes('aria-haspopup="dialog"'), "Sacraments & Services tiles should open focused modal dialogs");
const donorCalendar = await readFile("public/donor/calendar.html", "utf8");
const donorCalendarCss = await readFile("public/donor/style.css", "utf8");
assert.ok(!donorCalendar.includes("saintLifeButton") && !donorCalendar.includes("Open saint life"), "Today hero should not duplicate the dedicated Saint of the Day card action");
assert.ok(donorCalendar.includes('id="saintPreviewCard"') && donorCalendar.includes('onclick="openDonorSaintOfDay(this)"'), "Saint of the Day card should be the saint-life action");
assert.ok(donorApp.includes("Tone of the Week") && donorApp.includes('return "";') && !donorApp.includes('return "Church day"') && !donorApp.includes('return "Liturgical Day"'), "Today hero chips should omit generic liturgical fallback labels and use clear tone labels");
assert.ok(!donorApp.includes("[today.tone, today.epistleRef"), "Today hero description should not duplicate the Tone of the Week beside the Epistle reading");
assert.ok(donorApp.includes("calendarShortDateIso(pascha?.date)"), "Today Pascha metric should read the date returned by the calendar helper");
for (const source of [publicLiturgicalCalendar, srcLiturgicalCalendar]) {
  for (const feastId of ["great-lent-ends", "apostles-fast-ends", "dormition-fast-begins", "dormition-fast-ends", "nativity-fast-begins", "nativity-fast-ends"]) {
    assert.ok(source.includes(`id: "${feastId}"`), `liturgical calendar should include ${feastId}`);
  }
  assert.ok(source.includes('id: "clean-monday", name: "Clean Monday / Great Lent Begins", offset: -48, rank: "fast"'), "Clean Monday should be highlighted as a fast boundary");
}
assert.ok(donorApp.includes("parishPatronalFeastForYear") && donorApp.includes('rank: "patronal"'), "Today Feast Highlights should include the donor parish Patronal feast");
assert.ok(donorCalendar.includes('class="patronal"') && donorCalendarCss.includes(".cal-feast-rank.patronal"), "Today Feast Highlights should label Patronal feasts distinctly");
assert.ok(donorCalendarCss.includes("@media (max-width: 719px)") && donorCalendarCss.includes('aria-label="Saint of the Day"'), "Today mobile layout should lift Saint of the Day above lower cards without changing desktop columns");
const donorBookstore = await readFile("public/donor/bookstore.html", "utf8");
assert.ok(donorBookstore.includes("bookstoreHeroTitle") && donorBookstore.includes("PAY FOR YOUR ITEMS AT YOUR PARISH BOOKSTORE"), "Bookstore hero should support parish-specific payment copy");
assert.ok(donorApp.includes("Pay for your items at ${bookstoreLabel} bookstore.") && donorApp.includes("AGAPAY Parish+") && donorApp.includes("Request this feature for my parish"), "Bookstore page should preserve sentence-case parish payment copy, Parish+ unavailable messaging, and feature request flow");
const donorSecurity = await readFile("public/security.js", "utf8");
assert.ok(donorSecurity.includes("/api/security/config"), "security helper should load Turnstile config from the Worker");
assert.ok(donorSecurity.includes("agapaySecurityPayload"), "security helper should expose Turnstile payloads to public forms");
const donorSignup = await readFile("public/donor/signup.html", "utf8");
assert.ok(donorSignup.includes("/security.js") && donorSignup.includes("data-agapay-turnstile"), "donor signup should render Turnstile when configured");
const donorGive = await readFile("public/donor/give.html", "utf8");
assert.ok(donorGive.includes("/security.js") && donorGive.includes("data-agapay-turnstile"), "donor checkout should render Turnstile when configured");
const donorPages = ["bookstore", "calendar", "commemorations", "give", "index", "login", "offerings", "settings", "signup"];
for (const page of donorPages) {
  const html = await readFile(`public/donor/${page}.html`, "utf8");
  assert.ok(!html.includes('hx-boost="true"'), `donor ${page} page should use full navigation so page initializers run`);
  if (html.includes('url=/myagapay/sacraments')) {
    assert.ok(page === "commemorations", "only the legacy donor commemorations page should redirect to the merged Sacraments & Services page");
  } else {
    assert.ok(html.includes("/myagapay-shell.js"), `donor ${page} page should load the shared My AGAPAY shell`);
    assert.ok(html.includes("topbar") || myAgapayShell.includes("content.prepend(topbar)"), `donor ${page} page should have a My AGAPAY topbar`);
  }
}

const learnDashboardShell = await readFile("public/learn/dashboard-shell.js", "utf8");
assert.ok(!learnDashboardShell.includes("Back to Give"), "Learn account menu should not include a Back to Give action");
assert.ok(learnDashboardShell.includes("myagapay-menu-trigger") && !learnDashboardShell.includes("learn-account-utility-avatar"), "Learn should replace account-holder initials with the shared hamburger menu");

const giveHtml = await readFile("public/give/form.html", "utf8");
assert.ok(
  giveHtml.includes('gift-type-name">Tithes</span>')
    && !giveHtml.includes("Weekly Stewardship")
    && giveHtml.includes("Molieben (Paraklesis) &amp; Panikhida (Parastas)"),
  "public parish giving should label stewardship as Tithes and include Greek commemoration terminology"
);
const givePricingHtml = await readFile("public/give/pricing.html", "utf8");
const subscriptionCatalog = await readFile("src/lib/subscriptions.js", "utf8");
const starterPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<h2 class="tier-title">Starter</h2>'),
  givePricingHtml.indexOf('<h2 class="tier-title">Giving Plus</h2>')
);
const givingPlusPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<h2 class="tier-title">Giving Plus</h2>'),
  givePricingHtml.indexOf('<h2 class="tier-title">Stewardship</h2>')
);
const stewardshipPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<h2 class="tier-title">Stewardship</h2>'),
  givePricingHtml.indexOf('<h2 class="tier-title">Parish</h2>')
);
const parishPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<h2 class="tier-title">Parish</h2>'),
  givePricingHtml.indexOf('<h2 class="tier-title">Diocese</h2>')
);
assert.ok(
  subscriptionCatalog.includes('id: "starter"')
    && subscriptionCatalog.includes("monthlyCents: 900")
    && subscriptionCatalog.includes("monthlyCents: 14900")
    && subscriptionCatalog.includes('label: "Giving Plus"'),
  "subscription catalog should expose Starter at $9, Giving Plus, and Parish at $149"
);
assert.ok(
  givePricingHtml.includes('<h2 class="tier-title">Starter</h2>')
    && givePricingHtml.includes('<div class="tier-price">$9 <span>/ mo</span></div>')
    && givePricingHtml.includes('<h2 class="tier-title">Giving Plus</h2>')
    && givePricingHtml.includes('<div class="tier-price">$149 <span>/ mo</span></div>')
    && /<ul class="tier-features">\r?\n\s*<li><span class="ck"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"\/><\/svg><\/span>Everything in Starter, plus<\/li>/.test(givingPlusPricingCard)
    && givePricingHtml.includes("Parish logo across giving pages and church search")
    && !givePricingHtml.includes("Parish logo, public page, and church search listing")
    && ["Small mission chapel", "Parish church", "Domed Orthodox church", "Large three-domed Orthodox church", "Grand five-domed Orthodox cathedral", "Orthodox monastery complex"].every((label) => givePricingHtml.includes(`aria-label="${label}"`)),
  "Give pricing should show the $149 Parish plan with distinct, progressively ornate church, cathedral, and monastic icons"
);
assert.ok(
  !givePricingHtml.includes("Stewardship Health dashboard for parish giving trends")
    && !givePricingHtml.includes("Pledge progress, giving gaps, and follow-up visibility")
    && givePricingHtml.includes("Full Parish Commerce suite")
    && givePricingHtml.includes("Stewardship's Bookstore access"),
  "Parish pricing should inherit Stewardship without duplicating its benefits and should distinguish the full Commerce suite from Stewardship Bookstore"
);
assert.ok(
  parishPricingCard.includes("Koinonia parish feed, announcements, and ministry groups")
    && parishPricingCard.includes("Parish audio library, video, and news hub")
    && parishPricingCard.includes("Orthodox podcast discovery, subscriptions, RSS imports, and saved listening progress")
    && !stewardshipPricingCard.includes("Koinonia parish feed"),
  "Koinonia community, media, and podcast features should be included in the Parish tier"
);
assert.equal(
  givePricingHtml.match(/Enhanced giving, (?:donor, fund|fund, donor), and pledge reports/g)?.length,
  1,
  "enhanced giving reports should appear only in the Stewardship tier"
);
assert.ok(
  givePricingHtml.includes('class="tier-coming-soon"')
    && givePricingHtml.includes('class="tier-coming-soon-badge">Coming soon</span>')
    && givePricingHtml.includes("<strong>Text-to-Give</strong>")
    && !givePricingHtml.includes("<strong>Parish Accounting</strong>")
    && parishPricingCard.includes("</svg></span>Accounting Suite</li>")
    && givePricingHtml.indexOf('class="tier-coming-soon"') > givePricingHtml.indexOf("Priority email support"),
  "Parish pricing should group polished coming-soon features at the bottom of the card"
);
assert.ok(
  starterPricingCard.includes("Direct parish giving links and QR codes")
    && starterPricingCard.includes("General Operating Fund")
    && starterPricingCard.includes("One custom designated fund")
    && starterPricingCard.includes("Built-in candle giving")
    && !starterPricingCard.includes("Parish logo across giving pages and church search")
    && !starterPricingCard.includes("Unlimited custom and restricted funds")
    && givingPlusPricingCard.includes("Parish logo across giving pages and church search")
    && givingPlusPricingCard.includes("Unlimited custom and restricted funds")
    && givingPlusPricingCard.includes("</svg></span>Campaign Giving</li>")
    && givingPlusPricingCard.includes("Liturgical calendar integration")
    && !givingPlusPricingCard.includes("Liturgical calendar timing")
    && !givingPlusPricingCard.includes("Direct parish giving links and QR codes")
    && !givePricingHtml.includes("Campaigns, direct parish links, and QR codes")
    && !givePricingHtml.includes("Parish logo, public page, and church search listing")
    && !givePricingHtml.includes("</svg></span>Campaigns</li>"),
  "Starter should include its three-fund mission package and direct links while Giving Plus owns unlimited funds, parish branding, and Campaign Giving"
);
assert.equal(
  givePricingHtml.match(/Parish council and annual-meeting-ready stewardship insights/g)?.length,
  1,
  "annual-meeting-ready stewardship insights should appear exactly once"
);
assert.ok(
  stewardshipPricingCard.includes("Annual meeting packet creator")
    && !starterPricingCard.includes("Annual meeting packet creator")
    && !givingPlusPricingCard.includes("Annual meeting packet creator"),
  "the annual meeting packet creator should be listed in Stewardship, not Starter or Giving Plus"
);
assert.ok(
  givePricingHtml.indexOf("Parish council and annual-meeting-ready stewardship insights")
    < givePricingHtml.indexOf('<h2 class="tier-title">Parish</h2>'),
  "annual-meeting-ready stewardship insights should belong to the Stewardship tier"
);
assert.ok(
  subscriptionCatalog.includes("bookstore: true, commerceSuite: false")
    && subscriptionCatalog.includes("bookstore: true, commerceSuite: true"),
  "subscription metadata should separate Stewardship Bookstore from the Parish Commerce suite"
);
assert.ok(
  parishDashboardApp.includes("function updateStarterPaywalls()")
    && parishDashboardApp.includes("Upgrade to Giving Plus")
    && parishDashboardApp.includes("givingFeatures?.branding"),
  "Starter dashboard should preview locked Giving Plus features with an upgrade paywall"
);
assert.ok(
  parishDashboardApp.includes('class="btn btn-gold" href="https://dashboard.stripe.com"')
    && parishDashboardApp.includes('onclick="openSubscriptionCancellation(this)"')
    && parishDashboardApp.includes("body: JSON.stringify({ flow: 'cancel' })"),
  "parish settings should show a visible gold Stripe button and a working AGAPAY Give cancellation action"
);
assert.ok(
  parishHandler.includes("stripeChargesEnabled: Boolean(registration.stripeChargesEnabled)")
    && parishHandler.includes('stripeSubscriptionId: registration.stripeSubscriptionId || ""'),
  "the authenticated parish payload should expose the Stripe state needed for billing controls"
);
assert.ok(
  parishHandlers.includes('Parish logo branding is available with Giving Plus.')
    && parishHandler.includes('logoUrl: givingPlus ? registration.logoUrl || "" : ""')
    && parishDashboardApp.includes("Any logo previously uploaded is preserved"),
  "parish logo branding should be preserved but displayed and uploaded only with Giving Plus"
);
for (const enforcement of [
  "Campaigns are available with Giving Plus.",
  "Commemorations are available with Giving Plus.",
  "Monthly reconciliation is available with Giving Plus.",
  "Recurring-gift insights are available with Giving Plus.",
  "Campaigns and festal alms are available with Giving Plus.",
  "Starter includes one active designated fund. Upgrade to Giving Plus for additional funds."
]) {
  assert.ok(parishHandlers.includes(enforcement), `backend should enforce tier access: ${enforcement}`);
}
assert.ok(giveHtml.includes("/api/create-checkout-session"), "giving page should post to checkout API");
assert.ok(giveHtml.includes("/api/checkout-session-status"), "giving page should reconcile returned Stripe checkout sessions");
assert.ok(giveHtml.includes("/api/parishes"), "giving page should load registered parishes from the Worker API");
assert.ok(giveHtml.includes("function renderCampaigns"), "giving page should render live parish campaigns from the Worker API");
assert.ok(giveHtml.includes("applyGiftQueryParams"), "giving page should deep-link into specific gift types and campaigns");
assert.ok(giveHtml.includes("/security.js") && giveHtml.includes("data-agapay-turnstile"), "public giving checkout should render Turnstile when configured");
assert.ok(giveHtml.includes("agapaySecurityPayload"), "public giving checkout should send Turnstile tokens when configured");
assert.ok(giveHtml.includes("Processed and protected by Stripe") && giveHtml.includes("AGAPAY never holds donated funds"), "giving checkout should reassure donors that Stripe protects transactions and AGAPAY never holds donated funds");
const campaignPage = await readFile("public/give/parish-giving/app.js", "utf8");
assert.ok(campaignPage.includes("/api/campaign?"), "campaign share page should load campaign data from the Worker API");
assert.ok(campaignPage.includes('`${slug}-campaign`'), "campaign routes should resolve campaign names that already end in Campaign without breaking lookup");
assert.ok(campaignPage.includes("/api/create-checkout-session") && campaignPage.includes('giftType: "campaign"'), "campaign share page should create a direct Stripe checkout for campaign gifts");
assert.ok(campaignPage.includes('"/give/"') && campaignPage.includes('"-campaign"'), "campaign share page should build canonical nested campaign URLs");
assert.ok(worker.includes('url.pathname === "/api/campaign"'), "worker should route public campaign lookup API");
assert.ok(worker.includes('endsWith("/campaign-upload")'), "worker should route authenticated parish campaign photo uploads");
assert.ok(worker.includes('startsWith("/give/parish-giving/")'), "worker should serve campaign share URLs instead of the generic giving form");
assert.ok(worker.includes("async function fetchCleanAsset"), "worker should keep rewritten asset routes at their canonical public URLs");
assert.ok(worker.includes("canonicalCampaignPathFromLegacy"), "worker should redirect legacy campaign URLs to canonical nested campaign routes");
assert.ok(worker.includes('/^\\/give\\/[^/]+\\/[^/]+-campaign\\/?$/'), "worker should serve canonical parish campaign routes");
assert.ok(parishDashboardApp.includes("campaignPublicUrl") && parishDashboardApp.includes("-campaign"), "parish dashboard should publish canonical nested campaign URLs");
assert.ok(
  parishDashboardApp.includes("function orderTierNavigation()")
    && parishDashboardApp.includes("'stewardship', 'bookstore'")
    && parishDashboardApp.includes("const parishOrder = ['sacraments', 'directory', 'communications', 'accounting', 'text']")
    && parishDashboardApp.includes("parishGroup.appendChild(item)")
    && parishDashboardApp.includes("sidebar.appendChild(parishGroup)"),
  "parish dashboard tabs should follow the tier ladder while keeping Parish-only tools grouped"
);
assert.ok(
  parishDashboardApp.includes("nav-label-stack")
    && parishDashboardApp.includes("(stack || element).appendChild(label)")
    && parishDashboardApp.includes("syncTierRequirementNavigation('directory', 'Parish', directoryActive)"),
  "tier requirement labels should sit beneath tab names and Directory should retain a Parish-tier upgrade path"
);
assert.ok(
  parishDashboardApp.includes("pdx-sub-plan-kicker")
    && parishDashboardApp.includes("pdx-sub-module-grid")
    && parishDashboardApp.includes("Explore upgrade options"),
  "Giving Overview should render the polished subscription plan and module-access card"
);
assert.ok(
  parishDashboardApp.includes("Included with ${includedTier}")
    && parishDashboardApp.includes("'Giving Plus')")
    && parishDashboardApp.includes("'Stewardship')")
    && parishDashboardApp.includes("'Parish')")
    && parishDashboardApp.indexOf("moduleRow('Stewardship Health'") < parishDashboardApp.indexOf("moduleRow('Bookstore'")
    && parishDashboardApp.indexOf("moduleRow('Bookstore'") < parishDashboardApp.indexOf("moduleRow('Parish Directory'"),
  "subscription modules should use clear add-on language and follow tier availability order"
);
assert.ok(
  parishDashboardApp.includes("syncTierRequirementNavigation('stewardship', 'Stewardship', stewardshipActive)")
    && parishDashboardApp.includes("sacBadge.hidden = sacramentsActive")
    && parishDashboardApp.includes("syncModuleStatusNavigation('sacraments', sacramentsActive, sacIsOn)"),
  "late dashboard badge refreshes should preserve upgrade pills below the tier and show Sacraments on/off status within the tier"
);
const parishDashboardHtml = await readFile("public/parish/dashboard.html", "utf8");
assert.ok(
  parishDashboardHtml.includes('id="parishFeatureRequestDialog"')
    && parishDashboardApp.includes("showParishFeatureRequestPopup(data.featureRequests || [])")
    && parishDashboardApp.includes("/feature-requests/${encodeURIComponent(request.featureId)}/dismiss")
    && worker.includes('url.pathname === "/api/donor/stewardship-feature-request"'),
  "donor Stewardship requests should surface as dismissible parish-dashboard login popups"
);
assert.ok(
  parishDashboardHtml.includes('class="nav-module-status" id="accountingNavStatus" hidden>Off</span>')
    && parishDashboardHtml.includes('<em class="mobile-module-status" hidden>Off</em>')
    && parishDashboardApp.includes("const accountingIncluded = moduleIncluded('accounting')")
    && parishDashboardApp.includes("syncModuleStatusNavigation('accounting', accountingIncluded, accountingIncluded)"),
  "Accounting should use the standard desktop and mobile On/Off status pills when included"
);
assert.ok(
  parishDashboardHtml.includes('class="sac-paywall" id="sacramentsComingSoonBanner"')
    && parishDashboardHtml.includes("Bring pastoral requests into one organized workflow")
    && parishDashboardHtml.includes("Parishioner requests")
    && parishDashboardHtml.includes("Clergy workspace"),
  "non-Parish-tier Sacraments should show a polished feature preview and upgrade path"
);
assert.ok(parishDashboardHtml.includes('id="tab-reconcile"') && parishDashboardHtml.includes("Treasurer closeout"), "parish dashboard should include monthly reconciliation and closeout UI");
const sacramentsLiveHtml = parishDashboardHtml.slice(
  parishDashboardHtml.indexOf('id="sacramentsLiveContent"'),
  parishDashboardHtml.indexOf("<!-- ── DIRECTORY ADMIN TAB")
);
assert.ok(sacramentsLiveHtml.includes("sac-admin-shell") && !sacramentsLiveHtml.includes(">Weekly Availability<") && sacramentsLiveHtml.indexOf("Blackout Dates") < sacramentsLiveHtml.indexOf("Sacrament Rules") && sacramentsLiveHtml.indexOf("Sacrament Rules") < sacramentsLiveHtml.indexOf(">Requests<") && sacramentsLiveHtml.indexOf(">Requests<") < sacramentsLiveHtml.indexOf(">Calendar<"), "parish Sacraments & Services dashboard tabs should consolidate weekly availability into Sacrament Rules");
assert.ok(parishDashboardApp.includes("function setSacramentsDashboardTab") && parishDashboardApp.includes("function renderSacramentsCalendar") && parishDashboardApp.includes("function renderSacramentsBlackouts") && parishDashboardApp.includes("function renderSacramentsRules"), "parish Sacraments & Services dashboard should render availability, blackouts, rules, requests, and calendar views");
assert.ok(parishDashboardHtml.includes("sacramentsFeatureToggle") && parishDashboardApp.includes("function toggleSacramentsFeature") && parishDashboardApp.includes("Off for parishioners"), "parish Sacraments & Services dashboard should include a self-service on/off switch");
assert.ok(parishDashboardApp.includes("sacramentsDashboardTab = 'rules'") && parishDashboardApp.includes("renderSacramentsDisabledPanel"), "parish Sacraments & Services should default to Sacrament Rules and show an off state");
assert.equal(parishDashboardApp.split("<em>${enabled ? 'On' : 'Off'}</em>").length - 1, 3, "Directory, Bookstore, and Sacraments feature switches should use concise On/Off labels");
assert.ok(parishDashboardHtml.includes("sacramentsPriestPicker") && parishDashboardApp.includes("function selectSacramentsPriest") && parishDashboardApp.includes("sacramentPriestsText"), "parish Sacraments & Services should support multiple priests managed from Settings");
assert.ok(parishDashboardApp.includes("loadReconciliation") && parishDashboardApp.includes("exportReconciliationCsv") && parishDashboardApp.includes("saveReconciliationClose"), "parish dashboard should load, export, and close monthly reconciliations");
assert.ok(worker.includes("handleParishReconciliation") && worker.includes("/reconciliation/close"), "worker should route authenticated parish reconciliation endpoints");
assert.ok(parishDashboardApp.includes("sacramentsEnabled: enabled") && backendSources.includes("sacramentsEnabledFor(found.registration)") && backendSources.includes("sacramentsEnabled: Boolean(body.sacramentsEnabled ?? current.sacramentsEnabled ?? false)"), "Sacraments & Services should default off and use the real donor-facing enable flag");
const sacramentPriestsMigration = await readFile("migrations/0019_sacrament_priests.sql", "utf8");
assert.ok(sacramentPriestsMigration.includes("priest_name") && sacramentPriestsMigration.includes("COALESCE(clergy_assigned"), "Sacraments & Services should migrate availability to priest-owned scheduling");
assert.ok(donorApp.includes("priestName: slot.priestName") && backendSources.includes("priestName = String(body.priestName") && backendSources.includes("isSlotStillOpen(env, { parishId, date, time, priestName })"), "donor Sacraments booking should carry the selected priest through to the scheduled request");
assert.ok(donorApp.includes("handleDonorCheckoutReturn"), "donor dashboard should confirm returned Stripe checkout sessions");
const givingOverview = await readFile("public/give/index.html", "utf8");
assert.ok(givingOverview.includes("Orthodox Giving App &amp; Tithing Software") || givingOverview.includes("Orthodox Giving App & Tithing Software"), "Giving overview should target Orthodox giving and tithing search intent");
assert.ok(givingOverview.includes('"@type": "SoftwareApplication"') && givingOverview.includes('"@type": "FAQPage"'), "Giving overview should include software and FAQ structured data");
assert.ok(givingOverview.includes("Giving and parish life, connected in one Orthodox platform"), "Giving overview should describe currently available tools");
assert.ok(givingOverview.includes("Parish operations") && givingOverview.indexOf("Parish operations") < givingOverview.indexOf("giving-roadmap"), "Giving overview should list Parish operations as available now");
assert.ok(givingOverview.includes("Text-to-Give") && givingOverview.includes("Coming Soon"), "Giving overview should clearly identify remaining coming-soon products");
assert.ok(givingOverview.includes("processed and protected by Stripe") && givingOverview.includes("AGAPAY never holds donated funds") && givingOverview.includes("No Donation Middleman"), "Giving overview should emphasize Stripe protection and no donation middleman custody");
const platformHome = await readFile("public/index.html", "utf8");
assert.ok(platformHome.indexOf('href="/vision"') < platformHome.indexOf('href="/give"'), "platform homepage should lead its navigation with Vision");
assert.ok((platformHome.match(/data-flip-word/g) || []).length >= 2, "platform homepage should animate its header and hero taglines");
assert.ok(platformHome.includes('footer class="site-footer" data-shell="canonical"'), "platform homepage should use the canonical footer");
assert.ok(platformHome.includes('property="og:image" content="https://agapay.app/images/app-phone-mockup.png"') && platformHome.includes('name="twitter:image" content="https://agapay.app/images/app-phone-mockup.png"'), "platform homepage share image should use the AGAPAY phone app mockup");
assert.ok(platformHome.includes("Giving transactions are processed and protected by Stripe") && platformHome.includes("AGAPAY never holds donated funds"), "platform homepage should carry the Stripe protection and no-custody trust message");
const canonicalChrome = await readFile("public/site-chrome.js", "utf8");
assert.ok(canonicalChrome.indexOf('{ href: "/vision"') < canonicalChrome.indexOf('{ href: "/give"'), "canonical navigation should lead with Vision");
assert.ok(canonicalChrome.includes('{ href: "/design", label: "AGAPAY Design"') && canonicalChrome.includes('return "design"'), "canonical navigation should include AGAPAY Design with an active route");
assert.ok(canonicalChrome.includes('href="/register"') && canonicalChrome.includes("Start for free"), "canonical marketing navigation should offer the free registration CTA");
assert.ok(registerHtml.includes("free 30-day AGAPAY demo") && registerHtml.includes("No card is required"), "parish registration should explain the free demo terms");
const designPage = await readFile("public/design.html", "utf8");
assert.ok(designPage.includes("AGAPAY Design") && designPage.includes("site-chrome.js") && designPage.includes("Straightforward packages"), "AGAPAY Design should render as a canonical public product page");
assert.ok(designPage.includes("/videos/design/chariot-concepts.webm") && designPage.includes("work-video-frame"), "AGAPAY Design should show the Chariot Concepts video preview");
const visionPage = await readFile("public/vision.html", "utf8");
assert.ok(visionPage.includes("repeat(6,minmax(0,1fr))") && visionPage.includes("grid-column:span 3"), "Vision phases should use a balanced two-plus-three desktop grid");
const sitemap = await readFile("public/sitemap.xml", "utf8");
assert.ok(sitemap.includes("https://agapay.app/give"), "sitemap should include the canonical Give overview URL");
assert.ok(sitemap.includes("https://agapay.app/design"), "sitemap should include the canonical AGAPAY Design URL");
for (const givingPage of ["features", "how-it-works", "pricing", "why"]) {
  const html = await readFile(`public/give/${givingPage}.html`, "utf8");
  assert.ok(html.includes(`https://agapay.app/give/${givingPage}`), `Give ${givingPage} page should use its nested canonical URL`);
  assert.ok(sitemap.includes(`https://agapay.app/give/${givingPage}`), `sitemap should include /give/${givingPage}`);
}
assert.ok(sitemap.includes("https://agapay.app/give/find-parish"), "sitemap should include the canonical parish finder URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/features</loc>"), "sitemap should not list the legacy root features URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/how-it-works</loc>"), "sitemap should not list the legacy root how-it-works URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/pricing</loc>"), "sitemap should not list the legacy root pricing URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/why</loc>"), "sitemap should not list the legacy root why URL");
assert.ok(registerHtml.includes("/security.js") && registerHtml.includes("data-agapay-turnstile"), "registration should render Turnstile when configured");
assert.ok(registerHtml.includes("agapaySecurityPayload"), "registration should send Turnstile tokens when configured");

// Security response headers (docs/SECURITY_HEADERS.md) -- guards against
// the exact kind of silent regression that hit Phase 1's route-map
// integrity check: assert both the Worker-side and static-asset-side
// mechanisms exist and stay in sync, not just that one of them does.
const securityHeadersFile = await readFile("public/_headers", "utf8");
const expectedHstsPolicy = "max-age=2592000; includeSubDomains";
assert.ok(core.includes("export const SECURITY_HEADERS"), "core.js should export a shared SECURITY_HEADERS constant");
assert.ok(core.includes('"X-Content-Type-Options": "nosniff"'), "SECURITY_HEADERS should set X-Content-Type-Options");
assert.ok(core.includes('"X-Frame-Options": "SAMEORIGIN"'), "SECURITY_HEADERS should set X-Frame-Options");
assert.ok(core.includes(`"Strict-Transport-Security": "${expectedHstsPolicy}"`), "SECURITY_HEADERS should set the staged HSTS policy");
assert.ok(core.includes("Content-Security-Policy-Report-Only"), "CSP should ship Report-Only, not enforcing, until violations have been reviewed (see docs/SECURITY_HEADERS.md)");
assert.ok(!core.includes('"Content-Security-Policy":'), "CSP should not be flipped to enforcing without reading docs/SECURITY_HEADERS.md first");
assert.ok(core.includes("...SECURITY_HEADERS"), "json()/corsJson() should apply SECURITY_HEADERS to Worker-generated API responses");
assert.ok(securityHeadersFile.includes("X-Content-Type-Options: nosniff"), "public/_headers should set X-Content-Type-Options for static assets");
assert.ok(securityHeadersFile.includes(`Strict-Transport-Security: ${expectedHstsPolicy}`), "public/_headers should match the staged Worker HSTS policy");
assert.ok(securityHeadersFile.includes("Content-Security-Policy-Report-Only:"), "public/_headers should ship CSP Report-Only, matching core.js");
assert.ok(securityHeadersFile.includes("camera=(self)"), "Permissions-Policy should allow same-origin camera for the bookstore barcode scanner");

// Phase 6: audit log foundation
const auditLogLib = await readFile("src/lib/audit-log.js", "utf8");
const auditLogMigration = await readFile("migrations/0014_audit_log.sql", "utf8");
assert.ok(auditLogMigration.includes("CREATE TABLE IF NOT EXISTS audit_log"), "migration 0014 should create the audit_log table");
assert.ok(auditLogLib.includes("export async function recordAuditEvent"), "audit-log.js should export recordAuditEvent");
assert.ok(auditLogLib.includes("export async function listAuditEvents"), "audit-log.js should export listAuditEvents");
assert.ok(!auditLogLib.includes("DELETE FROM audit_log") && !auditLogLib.includes("UPDATE audit_log"), "audit_log must stay append-only -- no UPDATE/DELETE path");
assert.ok(backendSources.includes("recordAuditEvent(env, request, {") && backendSources.includes('action: "admin.index_rebuild"'), "index rebuild should record an audit event");
assert.ok(backendSources.includes('action: "registration.status_changed"'), "registration status changes should record an audit event");
assert.ok(backendSources.includes("handleAdminAuditLog"), "worker should expose an admin audit-log viewer endpoint");
assert.ok(worker.includes('url.pathname === "/api/admin/audit-log"'), "worker should route GET /api/admin/audit-log");
assert.ok(worker.includes("async function handleHealth") && worker.includes('url.pathname === "/api/health"'), "worker should expose GET /api/health for launch diagnostics");
assert.ok(worker.includes("STRIPE_SECRET_KEY") && worker.includes("RESEND_API_KEY") && worker.includes("TAX_EXEMPTION_DOCS") && worker.includes("GIVING_STATEMENTS"), "health endpoint should report config presence without exposing secret values");

// Stewardship tab redesign -- renamed "Stewardship Health", with a
// composite Health Score card (absorbing retention), a Donor Concentration
// Risk card (reusing the distribution endpoint's aggregation), a new
// Recurring Giving Health card, and a Monthly Stewardship Report button.
const parishAppJs = await readFile("public/parish/app.js", "utf8");
const stewardshipCss = await readFile("public/styles/stewardship.css", "utf8");
assert.ok(parishDashboardHtml.includes('id="stewardshipHealthScorePane"'), "Stewardship Health tab should include a Health Score card");
assert.ok(parishDashboardHtml.includes('points="3.8 12 7.2 12 9.2 8.3 12.3 15.8 14.5 12 20.2 12"'), "Stewardship Health card should use the heartbeat icon");
assert.ok(parishDashboardHtml.includes('id="stewardshipConcentrationPane"'), "Stewardship Health tab should include a Donor Concentration Risk card");
assert.ok(parishDashboardHtml.includes('id="stewardshipRecurringPane"'), "Stewardship Health tab should include a Recurring Giving Health card");
const stewardshipHealthGridStart = parishDashboardHtml.indexOf('class="sw-suite-tool-grid sw-suite-tool-grid--health"');
const stewardshipReportsStart = parishDashboardHtml.indexOf('<!-- Stewardship Reports');
assert.ok(
  stewardshipHealthGridStart >= 0
    && parishDashboardHtml.indexOf('id="stewardshipHealthScorePane"', stewardshipHealthGridStart) < stewardshipReportsStart
    && parishDashboardHtml.indexOf('id="stewardshipConcentrationPane"', stewardshipHealthGridStart) < stewardshipReportsStart
    && parishDashboardHtml.indexOf('id="stewardshipRecurringPane"', stewardshipHealthGridStart) < stewardshipReportsStart,
  "the three Stewardship health signals should share the top three-column grid"
);
assert.ok(
  /\.sw-suite-tool-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(stewardshipCss)
    && stewardshipCss.includes(".sw-suite-tool-grid--health .sw-health-score-copy"),
  "the Stewardship health grid should use three desktop columns with compact score content"
);
assert.ok(
  parishDashboardHtml.includes("sw-tool-meeting-packets-featured")
    && parishDashboardHtml.includes("Annual planning workspace")
    && stewardshipCss.includes(".sw-tool-meeting-packets-featured"),
  "Annual Meeting Packets should have a prominent, labeled staff-workspace treatment"
);
assert.ok(parishDashboardHtml.includes("openStewardshipMonthlyReport()"), "Stewardship Health tab should have a Generate Monthly Stewardship Report button");
assert.ok(parishDashboardHtml.includes("sw-report-card-header") && !parishDashboardHtml.includes("sw-report-button-stack"), "Stewardship report actions should live in their respective cards, not the hero");
assert.ok(!/onclick="loadStewardshipPanel\(true\)" title="Refresh"/.test(parishDashboardHtml), "Stewardship Health hero should not include a refresh button");
assert.ok(parishAppJs.includes("function loadStewardshipHealthScorePanel"), "app.js should define loadStewardshipHealthScorePanel");
assert.ok(parishAppJs.includes("function loadDonorConcentrationPanel"), "app.js should define loadDonorConcentrationPanel");
assert.ok(parishAppJs.includes("function loadRecurringGivingPanel"), "app.js should define loadRecurringGivingPanel");
assert.ok(parishAppJs.includes("stewardshipApi('/giving/health-score") && parishAppJs.includes("stewardshipApi('/giving/concentration") && parishAppJs.includes("stewardshipApi('/giving/recurring"), "Stewardship Health tab should call the new health-score/concentration/recurring endpoints");
assert.ok(worker.includes('endsWith("/stewardship/giving/retention")') && worker.includes('endsWith("/stewardship/giving/distribution")'), "retention/distribution endpoints should still exist -- their data feeds the new cards, not removed");
assert.ok(worker.includes('endsWith("/stewardship/giving/concentration")') && worker.includes('endsWith("/stewardship/giving/recurring")') && worker.includes('endsWith("/stewardship/giving/health-score")'), "worker should route the three new stewardship giving endpoints");
assert.ok(worker.includes('endsWith("/stewardship/report/monthly")'), "worker should route the monthly stewardship report endpoint");
assert.ok(!parishDashboardHtml.includes('id="swGivingFullLink"'), "standalone Full metrics report link should be retired -- combined into the Monthly Stewardship Report instead");
assert.ok(worker.includes("handleStewardshipGivingFunds(withYear(\"funds\")"), "monthly report should include the Giving by Fund breakdown that used to be exclusive to the standalone report");
assert.ok(parishDashboardHtml.includes('id="stewardshipManualIncomePane"') && parishDashboardHtml.includes("Record outside-AGAPAY giving"), "Financial Snapshots should include compact outside-AGAPAY contribution intake");
assert.ok(parishAppJs.includes("function loadManualIncomePanel") && parishAppJs.includes("function submitManualIncomeEntry") && parishAppJs.includes("function deleteManualIncomeEntry"), "app.js should define the manual income entry functions");
assert.ok(worker.includes("manual_income_entries"), "worker should reference the manual_income_entries table");
assert.ok(worker.includes("manualIncomeTotalCents") && worker.includes("contribution_eligible = 1"), "only contribution-qualified outside giving should fold into Budget Pace and Stewardship Health");

// Tax readiness gate -- parish canonical verification vs. AGAPAY billing/tax
// readiness are separate (src/lib/tax-readiness.js). Functional coverage
// (the actual gate logic, and the real createSubscriptionCheckoutForRegistration
// end-to-end paths) lives in scripts/tax-readiness-tests.mjs -- these are
// just the source-presence / wiring checks that belong alongside the rest
// of this file's static assertions.
const taxReadinessLib = await readFile("src/lib/tax-readiness.js", "utf8");
const subscriptionCheckoutLib = await readFile("src/lib/subscription-checkout.js", "utf8");
const learnBillingLib = await readFile("src/learn/billing.js", "utf8");
assert.ok(taxReadinessLib.includes("export function taxReadinessCheckoutGate"), "tax-readiness.js should export the checkout gate");
assert.ok(taxReadinessLib.includes("export function withTaxReadinessDefaults"), "tax-readiness.js should export a non-destructive defaults helper");
assert.ok(subscriptionCheckoutLib.includes("taxReadinessCheckoutGate(registration)"), "subscription-checkout.js should call the tax readiness gate");
assert.ok(subscriptionCheckoutLib.includes('"subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel"'), "demo checkout should cancel at trial end when no payment method was added");
assert.ok(stripeHandler.includes("allowTrial: true"), "the authenticated admin checkout route should be authorized to create demos");
assert.ok(parishHandler.includes("introductoryTrialDays: parishIntroDemoEligible(found.registration) ? PARISH_INTRO_DEMO_DAYS : 0"), "the parish route should grant the server-controlled introductory demo only when eligible");
assert.ok(parishAppJs.includes("Start free 30-day demo") && parishAppJs.includes("No card is required"), "the parish dashboard should explain the no-card 30-day demo");
assert.ok(
  subscriptionCheckoutLib.indexOf("tier.monthlyCents === 0") < subscriptionCheckoutLib.indexOf("taxReadinessCheckoutGate(registration)"),
  "the free-tier early return must come BEFORE the tax readiness gate, so free/non-billable tiers bypass it entirely"
);
assert.ok(adminHandler.includes("taxReadinessStatus: nextTaxReadinessStatus"), "admin registration PATCH should support updating tax readiness");
assert.ok(adminHandler.includes('action: "registration.tax_readiness_changed"'), "tax readiness status changes should record an audit event");
assert.ok(adminApp.includes("renderTaxReadinessPanel"), "admin app.js should render a tax readiness panel on the registration detail view");
assert.ok(adminApp.includes("taxReadinessStatus") && adminApp.includes("billingAddressLine1"), "admin app.js should let admins edit tax readiness status and billing address");
assert.ok(learnBillingLib.includes('params.set("billing_address_collection", "required")'), "Learn billing checkout should require billing address collection");
assert.ok(learnBillingLib.includes('params.set("automatic_tax[enabled]", "true")'), "Learn billing checkout should keep Stripe automatic tax enabled");
assert.ok(learnBillingLib.includes("billingAddressLine1: record.billingAddressLine1"), "Learn household billing record should support storing a billing address");

console.log("AGAPAY platform checks passed.");
import "./stripe-nonprofit-volume-tests.mjs";
import "./nonprofit-pricing-workflow-tests.mjs";
