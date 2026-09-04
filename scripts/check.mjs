import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import { readAdminAppSource } from './lib/admin-dashboard-source.mjs';
import { readDonorAppSource } from './lib/donor-app-source.mjs';
import { readDonorHandlerSource } from './lib/donor-handler-source.mjs';
import { readLearnDashboardSource } from './lib/learn-dashboard-source.mjs';
import { readParishHandlerSource } from './lib/parish-handler-source.mjs';
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { parishSlug } from "../src/lib/format.js";
import { readWorkerCompositionSource } from "./lib/worker-composition-source.mjs";

const worker = readWorkerCompositionSource();
const hasWorkerRoute = (pathname) => worker.includes(`"${pathname}"`) || worker.includes(`'${pathname}'`);
const localServerSource = await readFile("server.mjs", "utf8");
const core = await readFile("src/lib/core.js", "utf8");
const stripeConnect = await readFile("src/lib/stripe-connect.js", "utf8");
const adminHandler = await readFile("src/handlers/admin.js", "utf8");
const donorHandler = readDonorHandlerSource();
const parishSupportTickets = await readFile("src/lib/parish-support-tickets.js", "utf8");
const parishHandler = readParishHandlerSource();
const parishCommemorationsHandler = await readFile("src/handlers/parish-commemorations.js", "utf8");
const parishGivingCatalogHandler = await readFile("src/handlers/parish-giving-catalog.js", "utf8");
const parishGivingReportsHandler = await readFile("src/handlers/parish-giving-reports.js", "utf8");
const parishSacramentsHandler = await readFile("src/handlers/parish-sacraments.js", "utf8");
const parishReconciliationHandler = await readFile("src/handlers/parish-reconciliation.js", "utf8");
const parishNotifications = await readFile("src/lib/parish-notifications.js", "utf8");
const stripeFees = await readFile("src/lib/stripe-fees.js", "utf8");
const givingCheckout = await readFile("src/payments/giving-checkout.js", "utf8");
const stripeHandler = await readFile("src/handlers/stripe.js", "utf8");
const parishInterestHandler = await readFile("src/handlers/parish-interest.js", "utf8");
const wrangler = await readFile("wrangler.toml", "utf8");
const d1Migration = await readFile("migrations/0001_production_records.sql", "utf8");
const parishFeatureRequestMigration = await readFile("migrations/0059_parish_feature_requests.sql", "utf8");
const siteChrome = await readFile("public/site-chrome.js", "utf8");
assert.ok(siteChrome.includes('class="btn-demo${activeKey === "demo" ? " active" : ""}" href="/give/request-demo"'), "canonical desktop navigation should present Request a Demo beside the primary action");
assert.ok(siteChrome.includes('class="drawer-demo" href="/give/request-demo"'), "canonical mobile navigation should present Request a Demo as an action button");
assert.ok(!siteChrome.includes('{ href: "/give/request-demo", label: "Request Demo", key: "demo" }'), "Request a Demo should not remain in the canonical text-link group");
for (const link of [
  '{ href: "/give", label: "Platform", key: "platform" }',
  '{ href: "/about", label: "About", key: "about" }',
  '{ href: "/contact", label: "Contact", key: "contact" }'
]) assert.ok(siteChrome.includes(link), `canonical static-site navigation should include ${link}`);
for (const link of [
  '{ href: "/give#pricing", label: "Pricing", key: "pricing" }',
  '{ href: "/give#security", label: "Security", key: "security" }'
]) assert.ok(!siteChrome.includes(link), `canonical static-site navigation should not include ${link}`);
assert.ok(!siteChrome.includes('{ href: "/give#why", label: "Why AGAPAY"'), "canonical primary navigation should not duplicate the Why section integrated into /give");
assert.ok(!siteChrome.includes('{ href: "/learn", label: "AGAPAY Learn", key: "learn" }') && !siteChrome.includes('{ href: "/design", label: "AGAPAY Design", key: "design" }'), "canonical primary navigation should stay focused on AGAPAY Give");
assert.ok(!/btn-donate[\s\S]{0,180}shellIcon\("giving-hand"\)/.test(siteChrome), "canonical Start for free button should not include an unrelated giving-hand icon");
assert.ok(!/drawer-join[\s\S]{0,120}shellIcon\("giving-hand"\)/.test(siteChrome), "mobile Start for free button should not include an unrelated giving-hand icon");
const backendSources = worker + core + stripeConnect + adminHandler + donorHandler + parishHandler + parishCommemorationsHandler + parishGivingCatalogHandler + parishGivingReportsHandler + parishSacramentsHandler + parishReconciliationHandler + parishNotifications + stripeFees + givingCheckout + stripeHandler + parishInterestHandler;
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
assert.ok(hasWorkerRoute("/api/admin/release-status"), "worker should route the admin release status endpoint");
assert.ok(worker.includes("handleAdminWeeklyCommemorationEmails") && hasWorkerRoute("/api/admin/commemorations/send-weekly"), "worker should expose an admin-only weekly commemoration email diagnostic endpoint");
assert.ok(worker.includes("weekly_commemoration_emails") && worker.includes("dryRun: body.dryRun !== false"), "weekly commemoration emails should be observable and dry-run by default when triggered manually");
assert.ok(worker.includes("sendWeeklyTreasurerCommerceEmails") && hasWorkerRoute("/api/admin/commerce/send-weekly-treasurer"), "worker should expose an admin-only weekly treasurer commerce email endpoint");
assert.ok(worker.includes("commerce_weekly_reports") && worker.includes("weekly_treasurer_commerce_emails"), "weekly treasurer commerce emails should be deduped and observable");
assert.ok(worker.includes('["/parish/login", "/give/login"]'), "legacy parish login should redirect to the Give login URL");
assert.ok(hasWorkerRoute("/give/login"), "worker should serve the Give login URL from the parish login shell");
assert.ok(worker.includes('url.pathname.startsWith("/give/")') && worker.includes('url.pathname = "/give/form.html"'), "worker should serve parish giving pages at /give/:parish");
assert.ok(worker.includes('url.pathname.startsWith("/giving/")'), "worker should permanently redirect legacy /giving URLs");
for (const [legacyPage, anchor] of [["features", "platform"], ["how-it-works", "how-it-works"], ["pricing", "pricing"]]) {
  assert.ok(worker.includes(`["/${legacyPage}", "/give#${anchor}"]`), `worker should redirect /${legacyPage} to the canonical Give section`);
}
assert.ok(worker.includes('["/why", "/give#why"]'), "worker should redirect /why to the dedicated Give overview anchor");
assert.ok(worker.includes('["/give.html", "/give/index.html"]') && worker.includes('url.pathname = "/give"'), "worker should canonicalize legacy Give HTML aliases without redirecting /give away from its overview");
assert.ok(backendSources.includes("checkoutFinancials("), "worker should centralize donation fee calculations");
assert.ok(!backendSources.includes("subscription_data[application_fee_percent]"), "worker should not apply an AGAPAY application fee to recurring donor gifts");
assert.ok(!backendSources.includes("payment_intent_data[application_fee_amount]"), "worker should not apply an AGAPAY application fee to one-time donor gifts");
assert.ok(backendSources.includes("AGAPAY does not collect an application fee on donations"), "worker should document that AGAPAY charges no donation platform fee");
assert.ok(backendSources.includes("Do not add any AGAPAY platform/application fee to bookstore or future commerce checkouts"), "worker should document that Parish Commerce checkout has no AGAPAY application fee");
assert.ok(worker.includes("/api/checkout-session-status"), "worker should expose checkout return reconciliation");
assert.ok(backendSources.includes("session_id={CHECKOUT_SESSION_ID}"), "Stripe success URLs should include the Checkout session id");
assert.ok(backendSources.includes("/myagapay?gift_success=1"), "authenticated donor checkouts should return to the My AGAPAY dashboard");
assert.ok(!worker.includes("const parishes = ["), "worker should not hardcode demo parishes");
assert.ok(hasWorkerRoute("/donor/verify"), "worker should route donor verification links before assets");
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
assert.ok(registerHtml.includes('id="subscriptionTier"') && registerHtml.includes("Give — $9/month") && registerHtml.includes("Give + — $79/month") && registerHtml.includes("Parish — from $149/month") && registerHtml.includes('id="parishHouseholdBand"'), "registration should require the renamed Give tiers and a household-band choice");
assert.ok(registerHtml.includes("subscriptionTier: document.getElementById('subscriptionTier').value"), "registration should submit the selected starting tier");
assert.ok(parishHandler.includes('requiredFields') && parishHandler.includes('"subscriptionTier"') && parishHandler.includes("validTierForCommunity"), "registration backend should validate the selected tier for the community type");
assert.ok(parishNotifications.includes("Getting started with AGAPAY") && parishNotifications.includes("attachments: currentGuideAttachment ? [currentGuideAttachment] : []"), "the Getting started email should attach the current parish guide");
assert.ok(!parishNotifications.match(/subject: `Welcome to AGAPAY[\s\S]{0,5000}attachments:/), "the initial Welcome email should not attach the parish guide");
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
assert.ok(hasWorkerRoute("/api/parish-interest"), "worker should route parish interest submissions");


const donorApp = readDonorAppSource();
const publicLiturgicalCalendar = await readFile("public/liturgical-calendar.js", "utf8");
const srcLiturgicalCalendar = await readFile("src/liturgical-calendar.js", "utf8");
const myAgapayShell = await readFile("public/myagapay-shell.js", "utf8");
const manifest = await readFile("public/myagapay/manifest.webmanifest", "utf8");
const adminHtml = await readFile("public/admin.html", "utf8");
const adminLoginHtml = await readFile("public/admin/login.html", "utf8");
const adminApp = readAdminAppSource();
const adminCss = await readFile("public/admin/style.css", "utf8");
const adminManifest = await readFile("public/admin/manifest.webmanifest", "utf8");
const listenManifest = await readFile("public/listen/manifest.webmanifest", "utf8");
const listenIndex = await readFile("public/listen/index.html", "utf8");
const adminPwa = await readFile("public/admin/pwa.js", "utf8");
const serviceWorker = await readFile("public/service-worker.js", "utf8");
const pwaRegister = await readFile("public/pwa-register.js", "utf8");
const pwaHomeInstall = await readFile("public/pwa-home-install.js", "utf8");
const parishDashboardCore = await readParishDashboardSource();
const parishDashboardApp = [
  parishDashboardCore,
  await readFile("public/parish/features/directory.js", "utf8"),
  await readFile("public/parish/features/library.js", "utf8"),
  await readFile("public/parish/features/sacraments.js", "utf8"),
].join("\n");
const parishLoginPage = await readFile("public/parish/login.html", "utf8");
const givingOverviewPage = await readFile("public/give/index.html", "utf8");
const rootPage = await readFile("public/index.html", "utf8");
const rootManifest = await readFile("public/manifest.webmanifest", "utf8");
const myAgapayLoginPage = await readFile("public/myagapay/login.html", "utf8");
assert.ok(myAgapaySignupPage.includes('I agree to the current <a href="/terms#arbitration"') && myAgapaySignupPage.includes('acknowledge the <a href="/privacy"'), "My AGAPAY signup should use the concise account agreement");
assert.ok(registerHtml.includes('I agree to the <a href="/terms#arbitration"') && registerHtml.includes('confirm I am authorized to act for this organization.'), "parish registration should use the concise organization agreement");
assert.ok(!registerHtml.includes('including the 30-day informal-resolution process') && !myAgapaySignupPage.includes('including the 30-day informal-resolution process'), "signup and registration should not repeat detailed dispute copy beside the checkbox");
assert.ok(manifest.includes("/images/app/apple-touch-icon-blue.png"), "PWA manifest should use the blue AGAPAY iOS home screen icon");
assert.ok(manifest.includes('"scope": "/myagapay/"') && !manifest.includes('"scope": "/"'), "My AGAPAY PWA should use an exact /myagapay/ scope without claiming /admin");
assert.ok(manifest.includes('"orientation": "portrait-primary"'), "My AGAPAY PWA should preserve the phone-first portrait orientation");
assert.ok(manifest.includes('"lang": "en-US"') && manifest.includes('"dir": "ltr"'), "My AGAPAY PWA manifest should declare its language and text direction");
for (const category of ["finance", "lifestyle", "education"]) {
  assert.ok(manifest.includes(`"${category}"`), `My AGAPAY PWA manifest should include the ${category} category`);
}
for (const shortcut of ["/myagapay", "/myagapay/calendar", "/myagapay/directory", "/myagapay/bookstore"]) {
  assert.ok(manifest.includes(`"url": "${shortcut}"`), `My AGAPAY PWA manifest should include the ${shortcut} shortcut`);
}
const parsedManifest = JSON.parse(manifest);
assert.ok(parsedManifest.shortcuts.slice(0, 3).some((shortcut) => shortcut.url === "/myagapay/bookstore"), "Bookstore should be among the first three shortcuts for launchers that cap the menu at three");
for (const shortcutIcon of ["give-v2.png", "today-v2.png", "directory-v2.png", "bookstore-v2.png"]) {
  assert.ok(manifest.includes(`/images/app/shortcuts/${shortcutIcon}`), `My AGAPAY PWA manifest should include the ${shortcutIcon} shortcut icon`);
  await access(`public/images/app/shortcuts/${shortcutIcon}`);
}
for (const screenshot of ["giving-dashboard.jpg", "koinonia-2.jpg", "parish-bookstore.jpg"]) {
  assert.ok(manifest.includes(`/images/app/screenshots/${screenshot}`), `My AGAPAY PWA manifest should include ${screenshot}`);
  await access(`public/images/app/screenshots/${screenshot}`);
}
assert.equal((manifest.match(/"form_factor": "narrow"/g) || []).length, 3, "My AGAPAY PWA screenshots should declare the narrow mobile form factor");
assert.ok(myAgapayLoginPage.includes("/myagapay/manifest.webmanifest?v=20260729c"), "My AGAPAY login should use the current manifest URL so PWA analyzers do not reuse a stale report");
assert.ok(/navigator\.serviceWorker\.register\(\s*(["'])\/service-worker\.js\1/.test(myAgapayLoginPage), "My AGAPAY login HTML should directly register the service worker for PWABuilder's source parser");
assert.ok(pwaRegister.includes("registerOrUpdate();") && !pwaRegister.includes('window.addEventListener("load"'), "PWA registration should start immediately so automated analyzers can detect the service worker");
assert.ok(rootPage.includes('/manifest.webmanifest') && rootPage.includes('/pwa-register.js'), "public homepage should expose the root manifest and register the root service worker");
assert.ok(rootManifest.includes('"name": "My AGAPAY"') && rootManifest.includes('"start_url": "/myagapay/login?source=pwa"') && rootManifest.includes('"scope": "/"'), "the homepage installer should launch My AGAPAY at its login page while retaining compatibility with existing root-scope installs");
assert.ok(pwaHomeInstall.includes('isLegacyHomepageLaunch()') && pwaHomeInstall.includes('window.location.replace("/myagapay/login?source=pwa")'), "existing homepage-installed My AGAPAY icons should be repaired to open the login page");
assert.ok(rootManifest.includes('"orientation": "portrait-primary"'), "root PWA manifest should prefer the phone-first portrait orientation");
assert.ok(givingOverviewPage.includes('/pwa-register.js') && givingOverviewPage.includes('/myagapay/manifest.webmanifest'), "Give homepage should remain installable without carrying a separate marketing-page installer");
assert.ok(/class="give-hero-actions"[\s\S]{0,500}href="#pricing"[\s\S]{0,80}>See plans and pricing<\/a>/.test(givingOverviewPage), "Give homepage hero should link directly to the consolidated pricing section");
assert.ok(!givingOverviewPage.includes("three.module.js") && !givingOverviewPage.includes("gsap@"), "the consolidated Give page should not load the retired animation runtime");
assert.ok(adminHtml.includes('/admin/manifest.webmanifest') && adminLoginHtml.includes('/admin/manifest.webmanifest'), "admin console should install with the dedicated AGAPAY Admin manifest");
assert.ok(adminHtml.includes('/images/app/agapay-admin.png') && adminLoginHtml.includes('/images/app/agapay-admin.png') && adminManifest.includes('/images/app/agapay-admin.png'), "admin PWA should use the dedicated admin app icon");
assert.ok(adminManifest.includes('"id": "/admin-pwa"') && adminManifest.includes('"name": "AGAPAY Admin"') && adminManifest.includes('"start_url": "/admin?source=admin-pwa&tab=giving"') && adminManifest.includes('"scope": "/admin"'), "admin PWA manifest should open the mobile verification queue with a distinct app identity");
assert.ok(adminHtml.includes('/admin/pwa.js') && adminPwa.includes('beforeinstallprompt') && adminPwa.includes('serviceWorker'), "admin dashboard should expose install support without caching private admin data");
assert.ok(adminApp.includes('requestedTab') && adminApp.includes('queue-mobile-summary') && adminApp.includes('mobile-review-bar'), "admin dashboard should support a mobile-first parish verification flow");
assert.ok(adminHtml.includes("weeklyCommemorationParishId") && adminApp.includes("runWeeklyCommemorationEmail") && adminApp.includes("/api/admin/commemorations/send-weekly"), "admin dashboard should expose a weekly commemoration email preview/send control");
assert.ok(adminHtml.includes("weeklyTreasurerParishId") && adminApp.includes("runWeeklyTreasurerEmail") && adminApp.includes("/api/admin/commerce/send-weekly-treasurer"), "admin dashboard should expose a weekly treasurer commerce email preview/send control");
assert.ok(adminCss.includes('admin-mobile-command') && adminCss.includes('mobile-review-bar') && adminCss.includes('product-admin-hero-giving { display: none; }'), "admin dashboard should include dedicated mobile verification layout styles");
assert.ok(serviceWorker.includes('agapay-static-v37'), "service worker cache version should advance when PWA shell caching behavior changes");
assert.ok(
  serviceWorker.includes('url.pathname === "/styles/platform-preview.css"')
    && serviceWorker.includes('url.pathname === "/styles/koinonia-preview.css"'),
  "preloaded homepage styles should bypass service-worker caching so the browser can reuse each preload",
);
assert.ok(
  serviceWorker.includes('"/myagapay/teaching.html"')
    && serviceWorker.includes('url.pathname.startsWith("/myagapay/teaching") ? caches.match("/myagapay/teaching.html")'),
  "the Koinonia podcast shell should reopen offline on Android and iOS PWAs"
);
assert.ok(serviceWorker.includes('url.pathname.startsWith("/api/") return true') || serviceWorker.includes('url.pathname.startsWith("/api/")) return true'), "service worker should bypass API responses, including private Directory JSON");
assert.ok(parishDashboardApp.includes("fetch(directoryAdminApi('/dashboard'), { headers })"), "Parish Dashboard Directory should use the parish dashboard auth headers");
assert.doesNotMatch(parishLoginPage, /terms|privacy|acceptingName|parishAgreeTerms/i, "parish login must not request legal acceptance");
assert.doesNotMatch(parishDashboardApp, /terms_acceptance_required|requireParishTermsAcceptance|parishAgreeTerms/, "parish login logic must submit credentials without a legal-acceptance branch");
assert.doesNotMatch(myAgapayLoginPage, /donorAgreeTerms|termsAccepted|Terms of Service|Privacy Policy/, "My AGAPAY login must not request or submit legal acceptance");
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
assert.ok(!myAgapayShell.includes("ensureIosBackButton") && !myAgapayShell.includes("myagapay-ios-back"), "shared shell must not overlay an extra Back button on iPhone headers");
assert.ok(myAgapayShell.includes("-webkit-touch-callout") && myAgapayShell.includes("font-size: 16px !important"), "shared shell should prevent iOS focus zoom without disabling user scaling");
assert.ok(myAgapayShell.includes("ensureCanonicalHeader") && myAgapayShell.includes("content.prepend(topbar)") && myAgapayShell.includes("myagapay-settings-chip"), "shared shell should add canonical account/settings access and a fallback topbar to My AGAPAY product headers");
assert.ok(
  myAgapayShell.includes("function isMyAgapayMainPage")
    && myAgapayShell.includes('"/myagapay/parish-life"')
    && myAgapayShell.includes('"/myagapay/giving/give"')
    && myAgapayShell.includes('"/myagapay/bookstore"')
    && myAgapayShell.includes("document.body.classList.add(\"myagapay-main-page\")")
    && myAgapayShell.includes(".donor-mobile-page .topbar")
    && myAgapayShell.includes("background: var(--myagapay-nav-background")
    && myAgapayShell.includes("linear-gradient(135deg, #061522 0%, #0a2035 62%, #101d22 100%)"),
  "shared shell should use the homepage-gradient navigation banner across My AGAPAY while retaining primary-page menu setup"
);
assert.ok(myAgapayShell.includes("myagapay-menu-trigger") && myAgapayShell.includes("myagapay-menu-icon") && myAgapayShell.includes("Open My AGAPAY menu"), "shared My AGAPAY headers should use an obvious hamburger menu trigger");
const sharedHamburgerMenu = myAgapayShell.match(/menu\.innerHTML = `([\s\S]*?)`;/)?.[1] || "";
assert.ok(!sharedHamburgerMenu.includes("/myagapay/parish-life"), "the shared My AGAPAY hamburger menu should not duplicate Koinonia navigation");
assert.ok(sharedHamburgerMenu.includes('/myagapay/learn') && sharedHamburgerMenu.includes("Best on desktop"), "the shared My AGAPAY hamburger menu should make Learn discoverable while setting a desktop expectation");
assert.ok(
  myAgapayShell.includes("Report a problem / Request a feature")
    && myAgapayShell.includes('id = "myAgapaySupportDialog"')
    && myAgapayShell.includes('fetch("/api/donor/support-tickets"'),
  "the shared My AGAPAY hamburger menu should open a working problem and feature request form"
);
assert.ok(
  hasWorkerRoute("/api/donor/support-tickets")
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
assert.ok(donorHome.includes('/myagapay/learn') && myAgapayGiveHome.includes('/myagapay/learn'), "hardcoded My AGAPAY hamburger menus should make Learn discoverable too");
const myAgapayHomeHamburger = myAgapayGiveHome.match(/<div class="donor-home-account-dropdown"[\s\S]*?<\/div>/)?.[0] || "";
assert.ok(!myAgapayHomeHamburger.includes("/myagapay/parish-life"), "the My AGAPAY dashboard hamburger should not duplicate Koinonia navigation");
assert.ok(
  ["Accounting", "Directory", "Commerce", "Koinonia", "Sacraments", "verified household member"].every((feature) => publicGivePage.includes(feature)),
  "the /give page should present every parish platform pillar and explain Koinonia's verified-household boundary"
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
  "My AGAPAY should gate Give + tiles with an upgrade paywall and a parish encouragement action"
);
assert.ok(
  donorHandler.includes('featureId: "giving-plus"')
    && hasWorkerRoute("/api/donor/giving-plus-feature-request")
    && parishDashboardApp.includes("item?.featureId === 'giving-plus'")
    && parishHandler.includes('["pledge-tracker", "giving-plus", "ministry-service"].includes(featureId)'),
  "Give + donor requests should be stored, surfaced in the parish dashboard, and dismissible"
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
assert.ok(donorApp.includes("Shop the shelves at ${bookstoreLabel} bookstore.") && donorApp.includes("AGAPAY Parish+") && donorApp.includes("Request this feature for my parish"), "Bookstore page should preserve parish-specific storefront copy, Parish+ unavailable messaging, and feature request flow");
const myAgapayBookstore = await readFile("public/myagapay/bookstore.html", "utf8");
assert.ok(
    myAgapayBookstore.includes("app-main-feature-page") &&
    myAgapayBookstore.includes("data-myagapay-app-menu-toggle") &&
    !myAgapayBookstore.includes('class="koinonia-page-heading"') &&
    !myAgapayBookstore.includes('class="bookstore-store-hero"')
    && !myAgapayBookstore.includes('class="bookstore-app-intro"')
    && myAgapayBookstore.includes('id="bookstoreCategoryFilters"')
    && myAgapayBookstore.includes('id="bookstorePopularItems"')
    && myAgapayBookstore.includes('id="bookstoreProductSearch"')
    && myAgapayBookstore.includes('id="bookstoreMobileCartBar"')
    && myAgapayBookstore.includes('id="bookstoreCartBackdrop"')
    && myAgapayBookstore.includes('id="bookstoreCartList"')
    && myAgapayBookstore.includes('id="bookstoreOrderList"'),
  "My AGAPAY Bookstore should present an app storefront while retaining discovery, cart, and order history surfaces"
);
assert.ok(donorApp.includes("function setBookstoreCatalogQuery") && donorApp.includes("function setBookstoreCatalogCategory") && donorApp.includes("function toggleBookstoreMobileCart") && donorApp.includes("bookstore-product-media") && donorApp.includes("bookstore-product-stepper"), "Bookstore catalog should support search, category filters, a mobile cart sheet, and inline product controls");
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

const learnDashboardShell = readLearnDashboardSource();
assert.ok(!learnDashboardShell.includes("Back to Give"), "Learn account menu should not include a Back to Give action");
assert.ok(learnDashboardShell.includes("myagapay-menu-trigger") && !learnDashboardShell.includes("learn-account-utility-avatar"), "Learn should replace account-holder initials with the shared hamburger menu");

const giveHtml = await readFile("public/give/form.html", "utf8");
const giveEmbedHtml = await readFile("public/give/embed.html", "utf8");
const giveEmbedCss = await readFile("public/give/embed.css", "utf8");
const giveEmbedJs = await readFile("public/give/embed.js", "utf8");
const giveEmbedLoader = await readFile("public/giving-box.js", "utf8");
assert.match(parishGivingCatalogHandler, /if \(!parish \|\| parish\.status !== "verified"\)/, "hidden onboarding parishes must return a normal 404 instead of throwing during public lookup");
assert.match(giveHtml, /DEFAULT_PROCESSING_FEE_SCHEDULES\s*=\s*\{[\s\S]*rateBasisPoints:290[\s\S]*fixedFeeCents:30/, "the giving form must retain a standard card-fee fallback when parish data is unavailable");
assert.match(giveHtml, /processingFeeSchedules:\s*\{ \.\.\.DEFAULT_PROCESSING_FEE_SCHEDULES/, "the parish response must merge over, not replace, the safe fee schedules");
assert.match(giveHtml, /showGivingPageUnavailable\(\)/, "the giving form must fail closed instead of displaying placeholder parish or fee data");
assert.match(giveHtml, /if \(!loaded\) return;/, "the giving form must stop initialization after an unavailable parish response");
assert.doesNotMatch(giveHtml, /St\. Seraphim|ROCOR|Lubbock/, "the shared giving form must not flash another parish's identity while dynamic data loads");
assert.ok(
  giveHtml.includes('gift-type-name">Tithes</span>')
    && !giveHtml.includes("Weekly Stewardship")
    && giveHtml.includes("Molieben (Paraklesis) &amp; Panikhida (Parastas)"),
  "public parish giving should label stewardship as Tithes and include Greek commemoration terminology"
);
const givePricingHtml = await readFile("public/give/index.html", "utf8");
const subscriptionCatalog = await readFile("src/lib/subscriptions.js", "utf8");
const starterPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<span class="give-plan-name">Give</span>'),
  givePricingHtml.indexOf('<span class="give-plan-name">Give +</span>')
);
const givingPlusPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<span class="give-plan-name">Give +</span>'),
  givePricingHtml.indexOf('<span class="give-plan-name">Parish</span>')
);
const parishPricingCard = givePricingHtml.slice(
  givePricingHtml.indexOf('<span class="give-plan-name">Parish</span>'),
  givePricingHtml.indexOf('<div class="give-addons"')
);
assert.ok(
  subscriptionCatalog.includes('id: "starter"')
    && subscriptionCatalog.includes("monthlyCents: 900")
    && subscriptionCatalog.includes('id: "under_50"')
    && subscriptionCatalog.includes('standardMonthlyCents: 14900')
    && subscriptionCatalog.includes('id: "300_599"')
    && subscriptionCatalog.includes('standardMonthlyCents: 20900')
    && !subscriptionCatalog.includes('AGAPAY_STRIPE_PRICE_ADDON_KOINONIA_49_MONTHLY')
    && subscriptionCatalog.includes('AGAPAY_STRIPE_PRICE_ADDON_SACRAMENTS_9_MONTHLY')
    && subscriptionCatalog.includes('AGAPAY_STRIPE_PRICE_ADDON_COMMERCE_29_MONTHLY')
    && subscriptionCatalog.includes('AGAPAY_STRIPE_PRICE_ADDON_ACCOUNTING_129_MONTHLY')
    && subscriptionCatalog.includes('label: "Give"')
    && subscriptionCatalog.includes('label: "Give +"'),
  "subscription catalog should expose Give, Give +, and household-priced Parish rates"
);
assert.ok(
  starterPricingCard.includes('<strong>$9</strong><span>/mo</span>')
    && givingPlusPricingCard.includes('<strong>$79</strong><span>/mo</span>')
    && parishPricingCard.includes('<strong>$149</strong><span>/mo</span>')
    && givePricingHtml.includes("Under 50 households</th><td>$149/mo")
    && givePricingHtml.includes("300-599 households</th><td>$209/mo")
    && !/early-adopter|first 20/i.test(givePricingHtml),
  "the consolidated Give page should show flat proposal-aligned Give, Give +, and household Parish pricing"
);
assert.ok(
  parishPricingCard.includes("Every AGAPAY pillar at one household-based rate")
    && givePricingHtml.includes("Every add-on is already included in Parish"),
  "Parish pricing should bundle Give + and every operational add-on"
);
assert.ok(
  givingPlusPricingCard.includes("Parish Directory, Bookstore, and Parish Library")
    && givingPlusPricingCard.includes("Koinonia parish community and media")
    && givePricingHtml.includes("Koinonia is included in Give +"),
  "Koinonia and Parish Library should be included in Give + and inherited by Parish"
);
assert.ok(givingPlusPricingCard.includes("Stewardship Health analytics and annual statements"), "Give + should include advanced Stewardship Health reporting");
assert.ok(givingPlusPricingCard.includes("Bookstore"), "Give + should include Bookstore");
assert.ok(
  !givePricingHtml.includes("Koinonia · $49/mo")
    && givePricingHtml.includes("Sacraments &amp; Services</span><strong>$9/mo")
    && givePricingHtml.includes("Full Commerce</span><strong>$29/mo")
    && givePricingHtml.includes("Accounting Suite</span><strong>$129/mo")
    && !givePricingHtml.includes("Bookstore</span><strong>$9/mo"),
  "Give + add-ons should match the proposal and should not resell its included Bookstore"
);
assert.ok(
  givePricingHtml.includes("guided onboarding")
    && givePricingHtml.includes("priority support")
    && givePricingHtml.includes("Full Commerce, Accounting"),
  "Parish pricing should explain its complete operational bundle"
);
assert.ok(
  starterPricingCard.includes("General Operating and unlimited designated funds")
    && starterPricingCard.includes("Candles, memorials, and commemorations")
    && starterPricingCard.includes("giver records")
    && starterPricingCard.includes("Basic pledge tracking")
    && givingPlusPricingCard.includes("Campaigns and branding"),
  "Give includes unlimited funds and basic pledges while Give + adds campaigns"
);
assert.ok(
  subscriptionCatalog.includes('id: "full_commerce"')
    && subscriptionCatalog.includes('modules: ["bookstore", "commerceSuite"]')
    && subscriptionCatalog.includes('modules: ["bookstore", "commerceSuite", "accounting", "accountingAdvancedOperations"]')
    && subscriptionCatalog.includes("bookstore: true, commerceSuite: true")
    && !givePricingHtml.includes("Koinonia · $49/mo")
    && givePricingHtml.includes("Sacraments &amp; Services</span><strong>$9/mo")
    && !givePricingHtml.includes("Bookstore</span><strong>$9/mo")
    && givePricingHtml.includes("Full Commerce</span><strong>$29/mo")
    && givePricingHtml.includes("Accounting Suite</span><strong>$129/mo")
    && givePricingHtml.includes("Bookstore is in Give +; Full Commerce adds Events, Meals"),
  "subscription metadata should include Bookstore in Give + and make Accounting Suite include Full Commerce"
);
assert.ok(
  parishDashboardApp.includes("function updateSubscriptionAddOnTotal(groupId)")
    && parishDashboardApp.includes("Estimated monthly subscription:")
    && parishDashboardApp.includes("Stripe checkout will show this same recurring total before payment."),
  "the parish dashboard should preview the exact Give + and add-on recurring total before Stripe checkout"
);
assert.ok(
  parishDashboardApp.includes("function updateStarterPaywalls()")
    && parishDashboardApp.includes("Upgrade to Give +")
    && parishDashboardApp.includes("givingFeatures?.branding"),
  "Give dashboard should preview locked Give + features with an upgrade paywall"
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
  parishHandlers.includes('Parish logo branding is available with Give +.')
    && parishHandler.includes('logoUrl: givingPlus ? registration.logoUrl || "" : ""')
    && parishDashboardApp.includes("Any logo previously uploaded is preserved"),
  "parish logo branding should be preserved but displayed and uploaded only with Give +"
);
for (const enforcement of [
  "Campaigns are available with Give +.",
  "Commemorations are available with Give +.",
  "Recurring-gift insights are available with Give +.",
  "Campaigns and festal alms are available with Give +.",
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
assert.ok(
  giveEmbedHtml.includes('id="giftStep"')
    && giveEmbedHtml.includes('id="detailsStep"')
    && giveEmbedHtml.includes('data-frequency="quarterly"')
    && giveEmbedHtml.includes('data-frequency="yearly"'),
  "the embeddable giving box should provide a compact two-step gift flow with quarterly and yearly options"
);
assert.ok(
  giveEmbedHtml.includes('id="giftStepTitle">Your gift</span>')
    && !giveEmbedHtml.includes("Choose a rhythm of generosity."),
  "the giving box should use the concise gift label without redundant promotional copy"
);
assert.ok(
  !giveEmbedHtml.includes('id="fundField"')
    && !giveEmbedHtml.includes("Direct my gift")
    && !giveEmbedLoader.includes("dataset.fund")
    && giveEmbedJs.includes("giftType: 'stewardship'")
    && giveEmbedJs.includes("fundId: ''"),
  "embedded gifts should go directly to the General Fund without a donor-facing fund selector"
);
assert.ok(
  giveEmbedCss.includes("width: min(100%, 540px)")
    && giveEmbedLoader.includes("container.dataset.maxWidth, 560")
    && giveEmbedLoader.includes("container.dataset.height, 560"),
  "the giving box should default to a compact desktop footprint"
);
assert.ok(
  giveEmbedJs.includes("source: 'embed'")
    && giveEmbedJs.includes("/api/create-checkout-session")
    && giveEmbedJs.includes("agapay:giving-box-resize")
    && giveEmbedJs.includes("/api/parishes?id="),
  "the giving box should load a verified organization through the compatible public API, use shared checkout, and resize its host iframe"
);
assert.ok(
  !giveEmbedHtml.includes("Verified on AGAPAY")
    && !giveEmbedHtml.includes("Give with purpose.")
    && !giveEmbedHtml.includes('class="giving-header"')
    && giveEmbedHtml.includes("Love how you give.")
    && !giveEmbedHtml.includes("Verified Orthodox parish")
    && giveEmbedJs.includes("organizationTypeLabel")
    && giveEmbedJs.includes("communityType"),
  "the giving box should remain organization-neutral without duplicating host-site identity or ownership claims"
);
assert.ok(
  giveEmbedCss.includes("--navy: #071a2a")
    && giveEmbedCss.includes("--gold: #c8a24a")
    && giveEmbedHtml.includes("Powered by <strong>AGAPAY</strong>"),
  "the giving box should retain AGAPAY navy, gold, and a visible but restrained platform brand"
);
assert.ok(worker.includes('/^\\/give\\/embed\\/[^/]+\\/?$/') && worker.includes('const staticGivePages = new Set(["request-demo", "embed"])'), "the Worker should serve clean /give/embed/:parish URLs");
assert.ok(localServerSource.includes('/^\\/give\\/embed\\/[^/]+\\/?$/') && localServerSource.includes('pathname = "/give/embed.html"'), "the local server should preview clean giving-box URLs");
assert.ok(
  parishDashboardApp.includes("function dedicatedGivingEmbedUrl()")
    && parishDashboardApp.includes("function copyGivingEmbedCode()")
    && parishDashboardApp.includes("givingEmbedSnippet")
    && parishDashboardApp.includes('data-agapay-giving=')
    && parishDashboardApp.includes('/giving-box.js'),
  "the organization dashboard should copy the two-line giving-box loader snippet"
);
assert.ok(
  giveEmbedLoader.includes("[data-agapay-giving]")
    && giveEmbedLoader.includes("agapay:giving-box-resize")
    && giveEmbedLoader.includes("event.origin !== record.origin")
    && giveEmbedLoader.includes("organizationId")
    && giveEmbedLoader.includes("MutationObserver"),
  "the public giving-box loader should mount dynamic embeds and resize only trusted AGAPAY frames"
);
const campaignPage = await readFile("public/give/parish-giving/app.js", "utf8");
assert.ok(campaignPage.includes("/api/campaign?"), "campaign share page should load campaign data from the Worker API");
assert.ok(campaignPage.includes('`${slug}-campaign`'), "campaign routes should resolve campaign names that already end in Campaign without breaking lookup");
assert.ok(campaignPage.includes("/api/create-checkout-session") && campaignPage.includes('giftType: "campaign"'), "campaign share page should create a direct Stripe checkout for campaign gifts");
assert.ok(campaignPage.includes('"/give/"') && campaignPage.includes('"-campaign"'), "campaign share page should build canonical nested campaign URLs");
assert.ok(hasWorkerRoute("/api/campaign"), "worker should route public campaign lookup API");
assert.ok(hasWorkerRoute("/campaign-upload") && worker.includes("handleParishCampaignUpload"), "worker should route authenticated parish campaign photo uploads");
assert.ok(worker.includes('startsWith("/give/parish-giving/")'), "worker should serve campaign share URLs instead of the generic giving form");
assert.ok(worker.includes("async function fetchCleanAsset"), "worker should keep rewritten asset routes at their canonical public URLs");
assert.ok(worker.includes("canonicalCampaignPathFromLegacy"), "worker should redirect legacy campaign URLs to canonical nested campaign routes");
assert.ok(worker.includes('/^\\/give\\/[^/]+\\/[^/]+-campaign\\/?$/'), "worker should serve canonical parish campaign routes");
assert.ok(parishDashboardApp.includes("campaignPublicUrl") && parishDashboardApp.includes("-campaign"), "parish dashboard should publish canonical nested campaign URLs");
assert.ok(
  parishDashboardApp.includes("function orderTierNavigation()")
    && parishDashboardApp.includes("tabs: ['giving', 'history', 'givers', 'reconcile', 'options', 'qr']")
    && parishDashboardApp.includes("tabs: ['campaigns', 'stewardship', 'directory', 'library', 'communications', 'bookstore']")
    && parishDashboardApp.includes("tabs: ['sacraments', 'accounting', 'text']")
    && parishDashboardApp.includes("group.appendChild(item)")
    && parishDashboardApp.includes("sidebar.appendChild(group)"),
  "parish dashboard tabs should follow the tier ladder while keeping Parish-only tools grouped"
);
assert.ok(
  parishDashboardApp.includes("nav-label-stack")
    && parishDashboardApp.includes("(stack || element).appendChild(label)")
    && parishDashboardApp.includes("syncTierRequirementNavigation('directory', 'Give +', directoryActive)"),
  "tier requirement labels should sit beneath tab names and Directory should retain a Give + upgrade path"
);
assert.ok(
  parishDashboardApp.includes("pdx-sub-plan-kicker")
    && parishDashboardApp.includes("pdx-sub-module-grid")
    && parishDashboardApp.includes("Explore upgrade options"),
  "Giving Overview should render the polished subscription plan and module-access card"
);
assert.ok(
  parishDashboardApp.includes("Included with ${includedTier}")
    && parishDashboardApp.includes("'Give +')")
    && parishDashboardApp.includes("moduleRow('Bookstore', 'bookstore', 'Parish commerce and Stripe-powered sales', 'Give +')")
    && parishDashboardApp.includes("'Parish')")
    && parishDashboardApp.indexOf("moduleRow('Stewardship Health'") < parishDashboardApp.indexOf("moduleRow('Bookstore'")
    && parishDashboardApp.indexOf("moduleRow('Bookstore'") < parishDashboardApp.indexOf("moduleRow('Parish Directory'"),
  "subscription modules should use clear add-on language and follow tier availability order"
);
assert.ok(
  parishDashboardApp.includes("syncTierRequirementNavigation('stewardship', 'Give +', stewardshipActive)")
    && parishDashboardApp.includes("sacBadge.hidden = sacramentsActive")
    && parishDashboardApp.includes("syncModuleStatusNavigation('sacraments', sacramentsActive, sacIsOn)"),
  "late dashboard badge refreshes should preserve upgrade pills below the tier and show Sacraments on/off status within the tier"
);
const parishDashboardHtml = await readFile("public/parish/dashboard.html", "utf8");
assert.ok(
  parishDashboardHtml.includes('id="parishFeatureRequestDialog"')
    && parishDashboardApp.includes("showParishFeatureRequestPopup(data.featureRequests || [])")
    && parishDashboardApp.includes("/feature-requests/${encodeURIComponent(request.featureId)}/dismiss")
    && hasWorkerRoute("/api/donor/stewardship-feature-request"),
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
assert.equal(parishDashboardApp.split("<em>${enabled ? 'On' : 'Off'}</em>").length - 1, 4, "Directory, Bookstore, Sacraments, and shared Events/Meals feature switches should use concise On/Off labels");
assert.ok(parishDashboardHtml.includes("sacramentsPriestPicker") && parishDashboardApp.includes("function selectSacramentsPriest") && parishDashboardApp.includes("sacramentPriestsText"), "parish Sacraments & Services should support multiple priests managed from Settings");
assert.ok(parishDashboardApp.includes("loadReconciliation") && parishDashboardApp.includes("exportReconciliationCsv") && parishDashboardApp.includes("saveReconciliationClose"), "parish dashboard should load, export, and close monthly reconciliations");
assert.ok(worker.includes("handleParishReconciliation") && worker.includes("/reconciliation/close"), "worker should route authenticated parish reconciliation endpoints");
assert.ok(parishDashboardApp.includes("sacramentsEnabled: enabled") && backendSources.includes("sacramentsEnabledFor(found.registration)") && /sacramentsEnabled:\s*Boolean\(body\.sacramentsEnabled \?\? current\.sacramentsEnabled \?\? false\)/.test(backendSources), "Sacraments & Services should default off and use the real donor-facing enable flag");
const sacramentPriestsMigration = await readFile("migrations/0019_sacrament_priests.sql", "utf8");
assert.ok(sacramentPriestsMigration.includes("priest_name") && sacramentPriestsMigration.includes("COALESCE(clergy_assigned"), "Sacraments & Services should migrate availability to priest-owned scheduling");
assert.ok(donorApp.includes("priestName: slot.priestName") && backendSources.includes("priestName = String(body.priestName") && backendSources.includes("isSlotStillOpen(env, { parishId, date, time, priestName })"), "donor Sacraments booking should carry the selected priest through to the scheduled request");
assert.ok(donorApp.includes("handleDonorCheckoutReturn"), "donor dashboard should confirm returned Stripe checkout sessions");
const givingOverview = await readFile("public/give/index.html", "utf8");
const giveStyles = await readFile("public/styles/give.css", "utf8");
assert.ok(givingOverview.includes("Custom-Built Orthodox Church Management Software") && givingOverview.includes("Orthodox tithing app"), "Giving overview should target Orthodox church management and tithing search intent");
assert.ok(givingOverview.includes('"SoftwareApplication"') && givingOverview.includes('"@type": "FAQPage"'), "Giving overview should include software and FAQ structured data");
assert.ok(givingOverview.includes('"@type": "WebSite"') && givingOverview.includes('"@type": "WebPage"'), "Giving overview should connect WebSite and WebPage structured data to the app");
assert.ok(givingOverview.includes("The Orthodox Giving App <em>for all of parish life.</em>") && givingOverview.includes("One system, not six"), "Giving overview should present one connected Orthodox platform");
for (const pillar of ["Giving &amp; Stewardship", "Koinonia", "Directory &amp; Households", "Sacraments &amp; Services", "Bookstore &amp; Church Commerce", "Accounting"]) {
  assert.ok(givingOverview.includes(pillar), `Giving overview should include the live ${pillar} pillar`);
}
assert.ok(givingOverview.includes("Stripe-hosted Checkout") && givingOverview.includes("parish's connected Stripe account") && givingOverview.includes("$0 AGAPAY donation fee"), "Giving overview should emphasize Stripe payment boundaries and no AGAPAY donation fee");
assert.ok(
  givingOverview.includes('<span class="give-plan-name">Give</span>')
    && givingOverview.includes('<span class="give-plan-name">Give +</span>')
    && !givingOverview.includes('<span class="give-plan-name">Starter</span>'),
  "Giving overview should use the Give and Give + platform tier names"
);
assert.ok(
  givingOverview.includes('id="how-it-works"')
    && givingOverview.includes("Parish approves moving forward")
    && givingOverview.includes("Staff completes setup")
    && givingOverview.includes("Launch to the parish")
    && givingOverview.includes("Grow without rebuilding"),
  "the consolidated How It Works section should explain the full parish launch"
);
const platformHome = await readFile("public/index.html", "utf8");
assert.ok(platformHome.includes('rel="canonical" href="https://agapay.app/"') && platformHome.includes('property="og:url" content="https://agapay.app/"'), "platform homepage should publish the site root as its canonical and social URL");
assert.ok(platformHome.includes("One platform for all of") && platformHome.includes("Orthodox parish life.") && platformHome.includes("One parish. One connected system."), "homepage should lead with the complete AGAPAY Orthodox parish platform and explain its shared system");
assert.ok(platformHome.includes("Orthodox Tithing App") && platformHome.includes("custom-built Orthodox church management software platform"), "homepage SEO should position AGAPAY as the Orthodox tithing app and custom-built parish platform");
assert.ok(platformHome.includes("giving-dashboard.jpg?v=afdbcab9659a") && platformHome.includes("data-src=\"/images/app/screenshots/parish-bookstore.jpg?v=7a0005fdc4b5\"") && platformHome.includes('width="720" height="1560"'), "homepage should use right-sized screenshots and defer inactive app rooms");
assert.ok(platformHome.includes("Koinonia") && platformHome.includes("Sacraments") && platformHome.includes("Accounting"), "platform homepage should surface community, pastoral, and financial operations");
assert.ok(platformHome.includes('src="/site-chrome.js"'), "platform homepage should render the canonical navigation that routes giving-focused visitors to /give");
assert.ok(givingOverview.includes('rel="canonical" href="https://agapay.app/give"') && givingOverview.includes("The Orthodox Giving App <em>for all of parish life.</em>"), "the consolidated Give page should publish one canonical URL and the approved Orthodox giving headline");
assert.ok(
  giveStyles.includes(".give-hero h1 em { display: block;")
    && giveStyles.includes("font: italic 500 clamp(2.45rem,5.2vw,4.5rem)/.98 var(--give-serif)")
    && giveStyles.includes(".give-hero h1 em { font-size: 2.55rem; }"),
  "the italicized Give hero headline should begin on a new line at the responsive H2 size"
);
const giveSectionNav = givingOverview.match(/<nav class="give-section-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert.match(giveSectionNav, /give-section-links">\s*<a href="#why">Why AGAPAY<\/a>/, "the Give secondary navigation should lead with Why AGAPAY");
assert.ok(givingOverview.indexOf('id="why"') < givingOverview.indexOf('id="pricing"'), "the Why AGAPAY section should appear before Plans and cost to the parish");
const canonicalChrome = await readFile("public/site-chrome.js", "utf8");
assert.ok(
  canonicalChrome.includes('{ href: "/give", label: "Platform"')
    && canonicalChrome.includes('{ href: "/about", label: "About"')
    && canonicalChrome.includes('{ href: "/contact", label: "Contact"')
    && !canonicalChrome.includes('{ href: "/give#pricing", label: "Pricing"')
    && !canonicalChrome.includes('{ href: "/give#security", label: "Security"'),
  "canonical navigation should link to Platform, About, and Contact without Pricing or Security"
);
assert.ok(canonicalChrome.includes('return hash.slice(1)') && canonicalChrome.includes('return "platform"'), "canonical navigation should recognize anchored Give destinations");
assert.ok(canonicalChrome.includes('const isHomepage = path === "/" || path === "/index.html"') && canonicalChrome.includes('${isHomepage ? "" :'), "canonical footer should hide Marketplace and Directory on the homepage");
assert.ok(canonicalChrome.includes('href="/register"') && canonicalChrome.includes("Start for free"), "canonical marketing navigation should offer the free registration CTA");
assert.ok(registerHtml.includes("free 30-day AGAPAY demo") && registerHtml.includes("No card is required"), "parish registration should explain the free demo terms");
const designPage = await readFile("public/design.html", "utf8");
assert.ok(designPage.includes("AGAPAY Design") && designPage.includes("site-chrome.js") && designPage.includes("Straightforward packages"), "AGAPAY Design should render as a canonical public product page");
assert.ok(designPage.includes("/videos/design/chariot-concepts.webm") && designPage.includes("work-video-frame"), "AGAPAY Design should show the Chariot Concepts video preview");
await assert.rejects(access("public/vision.html"), undefined, "the retired Vision page must stay unpublished");
assert.match(worker, /\["\/vision", "\/vision\/", "\/vision\.html"\][\s\S]*?url\.pathname = "\/about";[\s\S]*?Response\.redirect\(url\.toString\(\), 301\)/, "the production worker must permanently redirect every retired Vision route");
assert.match(localServerSource, /\["\/vision", "\/vision\/", "\/vision\.html"\][\s\S]*?requestUrl\.pathname = "\/about";[\s\S]*?writeHead\(301/, "the local server must mirror the retired Vision redirects");
const siteMobileNav = await readFile("public/site-mobile-nav.js", "utf8");
for (const [href, label] of [["/give#pricing", "Pricing"], ["/give#security", "Security"], ["/give#platform", "Platform"]]) {
  assert.ok(siteMobileNav.includes(`{ href: "${href}", label: "${label}" }`), `legacy mobile navigation should include ${label}`);
}
assert.ok(!siteMobileNav.includes('{ href: "/give#why", label: "Why AGAPAY" }'), "legacy mobile navigation should not duplicate the Why section integrated into /give");
const learnOverview = await readFile("public/learn/index.html", "utf8");
for (const [label, source] of [["homepage", platformHome], ["canonical chrome", canonicalChrome], ["mobile navigation", siteMobileNav], ["registration", registerHtml], ["Directory intake", directoryPage], ["Learn overview", learnOverview]]) {
  assert.ok(!source.includes('href="/vision"') && !source.includes('{ href: "/vision"'), `${label} must not link to the retired Vision page`);
}
const sitemap = await readFile("public/sitemap.xml", "utf8");
const sitemapLocations = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
assert.ok(sitemapLocations.has("https://agapay.app/"), "sitemap should include the platform homepage URL");
assert.ok(sitemapLocations.has("https://agapay.app/give"), "sitemap should list the independently addressable Give overview");
assert.ok(sitemapLocations.has("https://agapay.app/design"), "sitemap should include the canonical AGAPAY Design URL");
assert.ok(!sitemapLocations.has("https://agapay.app/vision"), "sitemap must not publish the retired Vision URL");
for (const givingPage of ["features", "how-it-works", "pricing", "security", "get-agapay", "recurring-donations", "fundraising", "event-payments", "parish-giving"]) {
  await assert.rejects(access(`public/give/${givingPage}.html`), undefined, `retired Give ${givingPage} page must be removed`);
  assert.ok(!sitemapLocations.has(`https://agapay.app/give/${givingPage}`), `sitemap should consolidate /give/${givingPage} into /give`);
}
assert.ok(!sitemapLocations.has("https://agapay.app/give/why"), "sitemap should retire the consolidated Give Why page");
assert.ok(sitemapLocations.has("https://agapay.app/give/find-parish"), "sitemap should include the canonical parish finder URL");
assert.ok(!sitemapLocations.has("https://agapay.app/give/event-payments"), "sitemap should exclude the not-yet-indexable event payments roadmap page");
assert.ok(!sitemapLocations.has("https://agapay.app/features"), "sitemap should not list the legacy root features URL");
assert.ok(!sitemapLocations.has("https://agapay.app/how-it-works"), "sitemap should not list the legacy root how-it-works URL");
assert.ok(!sitemapLocations.has("https://agapay.app/pricing"), "sitemap should not list the legacy root pricing URL");
assert.ok(!sitemapLocations.has("https://agapay.app/why"), "sitemap should not list the legacy root why URL");
assert.ok(registerHtml.includes("/security.js") && registerHtml.includes("data-agapay-turnstile"), "registration should render Turnstile when configured");
assert.ok(registerHtml.includes('data-action="turnstile-spin-v1"'), "registration Turnstile should identify the protected registration action");
assert.ok(registerHtml.includes("agapaySecurityPayload"), "registration should send Turnstile tokens when configured");
assert.ok(registerHtml.includes('name="cf-turnstile-response"'), "registration payload should fall back to Cloudflare's standard Turnstile response field");
assert.ok(donorSecurity.includes("cf-turnstile-response"), "security helper should submit the standard Turnstile response field when callback state is unavailable");

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
assert.ok(
  securityHeadersFile.includes("/give/embed.html")
    && securityHeadersFile.includes("/give/embed/*")
    && securityHeadersFile.includes("! X-Frame-Options")
    && securityHeadersFile.includes("Content-Security-Policy: frame-ancestors *")
    && securityHeadersFile.includes("X-Robots-Tag: noindex, nofollow"),
  "only the dedicated noindex giving-box asset and clean public route should opt out of the site's SAMEORIGIN frame policy"
);
assert.ok(
  securityHeadersFile.includes("/giving-box.js")
    && securityHeadersFile.includes("Access-Control-Allow-Origin: *")
    && securityHeadersFile.includes("Cross-Origin-Resource-Policy: cross-origin"),
  "the public giving-box loader should be explicitly available to external organization websites"
);

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
assert.ok(hasWorkerRoute("/api/admin/audit-log"), "worker should route GET /api/admin/audit-log");
assert.ok(worker.includes("async function handleHealth") && hasWorkerRoute("/api/health"), "worker should expose GET /api/health for launch diagnostics");
assert.ok(worker.includes("STRIPE_SECRET_KEY") && worker.includes("RESEND_API_KEY") && worker.includes("TAX_EXEMPTION_DOCS") && worker.includes("GIVING_STATEMENTS"), "health endpoint should report config presence without exposing secret values");

// Giving intelligence keeps the health overview and four giving charts
// together, with the existing reports and records below them.
const parishAppJs = await readParishDashboardSource();
const stewardshipCss = await readFile("public/styles/stewardship.css", "utf8");
const intelligenceCss = await readFile("public/styles/stewardship-intelligence.css", "utf8");
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
  "Stewardship health signals should remain above the reports"
);
assert.ok(
  /\.sw-suite-tool-grid--health\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(intelligenceCss)
    && parishDashboardHtml.includes('id="stewardshipDistributionPane"')
    && parishDashboardHtml.includes('id="stewardshipRetentionPane"')
    && parishDashboardHtml.includes('Giving intelligence'),
  "Giving intelligence should show distribution and retention in a two-column chart grid"
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
assert.ok(hasWorkerRoute("/stewardship/giving/retention") && hasWorkerRoute("/stewardship/giving/distribution"), "retention/distribution endpoints should still exist -- their data feeds the new cards, not removed");
assert.ok(hasWorkerRoute("/stewardship/giving/concentration") && hasWorkerRoute("/stewardship/giving/recurring") && hasWorkerRoute("/stewardship/giving/health-score"), "worker should route the three new stewardship giving endpoints");
assert.ok(hasWorkerRoute("/stewardship/report/monthly"), "worker should route the monthly stewardship report endpoint");
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
assert.ok(taxReadinessLib.includes("export function subscriptionCheckoutReadinessGate"), "tax-readiness.js should export the verification and billing checkout gate");
assert.ok(taxReadinessLib.includes("export function withTaxReadinessDefaults"), "tax-readiness.js should export a non-destructive defaults helper");
assert.ok(subscriptionCheckoutLib.includes("subscriptionCheckoutReadinessGate(billingRegistration)"), "subscription-checkout.js should validate inherited registration billing fields");
assert.ok(!subscriptionCheckoutLib.includes("tax_readiness_required"), "manual per-parish tax status must not block Stripe subscription checkout");
assert.ok(subscriptionCheckoutLib.includes('"subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel"'), "demo checkout should cancel at trial end when no payment method was added");
assert.ok(stripeHandler.includes("allowTrial: true"), "the authenticated admin checkout route should be authorized to create demos");
assert.ok(parishHandler.includes("introductoryTrialDays: parishIntroDemoEligible(found.registration) ? PARISH_INTRO_DEMO_DAYS : 0"), "the parish route should grant the server-controlled introductory demo only when eligible");
assert.ok(parishAppJs.includes("Start free 30-day demo") && parishAppJs.includes("No card is required"), "the parish dashboard should explain the no-card 30-day demo");
assert.ok(
  subscriptionCheckoutLib.indexOf("tier.monthlyCents === 0") < subscriptionCheckoutLib.indexOf("subscriptionCheckoutReadinessGate(billingRegistration)"),
  "the free-tier early return must come before subscription verification and billing checks"
);
assert.ok(!adminApp.includes('id="taxReadinessStatus"') && !adminApp.includes("renderTaxReadinessPanel"), "admin onboarding must not require a manual parish tax-readiness review");
assert.ok(adminApp.includes("Subscription billing address") && adminApp.includes("billingAddressLine1"), "admin subscription setup should retain an editable billing address inherited from registration");
assert.ok(subscriptionCheckoutLib.includes('"automatic_tax[enabled]": "true"'), "AGAPAY subscription checkout should rely on platform-level Stripe automatic tax");
assert.ok(!worker.includes('startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-onboarding")'), "Admin must not expose a Stripe onboarding-link route");
assert.ok(adminHandler.includes('stripeAccountId: current.stripeAccountId || ""'), "Admin saves must preserve parish-created Stripe account IDs");
assert.ok(adminHandler.includes('stripeAccountStatus: current.stripeAccountStatus || "not_started"'), "Admin saves must preserve server-confirmed Stripe status");
assert.ok(learnBillingLib.includes('params.set("billing_address_collection", "required")'), "Learn billing checkout should require billing address collection");
assert.ok(learnBillingLib.includes('params.set("automatic_tax[enabled]", "true")'), "Learn billing checkout should keep Stripe automatic tax enabled");
assert.ok(learnBillingLib.includes("billingAddressLine1: record.billingAddressLine1"), "Learn household billing record should support storing a billing address");

console.log("AGAPAY platform checks passed.");
import "./stripe-nonprofit-volume-tests.mjs";
import "./nonprofit-pricing-workflow-tests.mjs";
