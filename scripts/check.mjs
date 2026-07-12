import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { parishSlug } from "../src/lib/format.js";

const worker = await readFile("src/worker.js", "utf8");
const core = await readFile("src/lib/core.js", "utf8");
const stripeConnect = await readFile("src/lib/stripe-connect.js", "utf8");
const adminHandler = await readFile("src/handlers/admin.js", "utf8");
const donorHandler = await readFile("src/handlers/donor.js", "utf8");
const parishHandler = await readFile("src/handlers/parish.js", "utf8");
const stripeHandler = await readFile("src/handlers/stripe.js", "utf8");
const parishInterestHandler = await readFile("src/handlers/parish-interest.js", "utf8");
const wrangler = await readFile("wrangler.toml", "utf8");
const d1Migration = await readFile("migrations/0001_production_records.sql", "utf8");
const backendSources = worker + core + stripeConnect + adminHandler + donorHandler + parishHandler + stripeHandler + parishInterestHandler;
assert.equal(parishSlug("St. Fiacre Orthodox Church", "Munster"), "st-fiacre-munster", "parish usernames should include patronal name and city");
assert.equal(parishSlug("Holy Resurrection Orthodox Church", "Boston"), "holy-resurrection-boston", "parish usernames should normalize common church suffixes");
assert.ok(wrangler.includes('binding = "AGAPAY_DB"'), "wrangler should bind the production D1 database");
assert.ok(d1Migration.includes("CREATE TABLE IF NOT EXISTS registrations"), "D1 migration should create registrations table");
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
assert.ok(backendSources.includes('"admin-money-actions"'), "admin Stripe/billing actions should be rate-limited");
assert.ok(backendSources.includes('"parish-money-actions"'), "parish Stripe/billing actions should be rate-limited");
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
assert.ok(backendSources.includes("subscription_data[application_fee_percent]"), "worker should apply AGAPAY donation fees to recurring donor gifts");
assert.ok(backendSources.includes("Parish SaaS subscription billing is created in a separate flow"), "worker should keep parish subscription billing separate from donation fees");
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
assert.ok(!registerHtml.includes("WEB3FORMS_KEY"), "registration should not expose Web3Forms key");
assert.ok(registerHtml.includes("/api/registrations"), "registration should post to AgaPay API");
assert.ok(registerHtml.includes("startDonorRegistration"), "registration should begin with a donor/family entry point");
assert.ok(registerHtml.includes("startOrganizationRegistration"), "registration should begin with an organization entry point");
assert.ok(registerHtml.includes("organizationDescription"), "registration should collect values-review copy when needed");
assert.ok(registerHtml.includes("requiresJurisdiction"), "registration should branch required fields by organization type");
assert.ok(registerHtml.includes("requiresWebsite"), "registration should require websites for businesses");

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
const givingOverviewPage = await readFile("public/give/index.html", "utf8");
assert.ok(manifest.includes("/images/app/apple-touch-icon-blue.png"), "PWA manifest should use the blue AGAPAY iOS home screen icon");
assert.ok(manifest.includes('"scope": "/myagapay"') && !manifest.includes('"scope": "/"'), "My AGAPAY PWA should cover /myagapay and /myagapay/learn without claiming /admin");
assert.ok(givingOverviewPage.includes('/pwa-register.js') && givingOverviewPage.includes('id="heroInstallBtn"'), "Give homepage should register the service worker and route the hero Get the App button through install logic");
assert.ok(givingOverviewPage.includes("const isAndroid") && givingOverviewPage.includes("triggerAndroidInstall()") && givingOverviewPage.includes('scrollToInstall(isIOS ? "apple" : "android")'), "Give homepage hero install button should prompt Android users and scroll other users to app instructions");
assert.ok(adminHtml.includes('/admin/manifest.webmanifest') && adminLoginHtml.includes('/admin/manifest.webmanifest'), "admin console should install with the dedicated AGAPAY Admin manifest");
assert.ok(adminHtml.includes('/images/app/agapay-admin.png') && adminLoginHtml.includes('/images/app/agapay-admin.png') && adminManifest.includes('/images/app/agapay-admin.png'), "admin PWA should use the dedicated admin app icon");
assert.ok(adminManifest.includes('"id": "/admin-pwa"') && adminManifest.includes('"name": "AGAPAY Admin"') && adminManifest.includes('"start_url": "/admin?source=admin-pwa&tab=giving"') && adminManifest.includes('"scope": "/admin"'), "admin PWA manifest should open the mobile verification queue with a distinct app identity");
assert.ok(adminHtml.includes('/admin/pwa.js') && adminPwa.includes('beforeinstallprompt') && adminPwa.includes('serviceWorker'), "admin dashboard should expose install support without caching private admin data");
assert.ok(adminApp.includes('requestedTab') && adminApp.includes('queue-mobile-summary') && adminApp.includes('mobile-review-bar'), "admin dashboard should support a mobile-first parish verification flow");
assert.ok(adminHtml.includes("weeklyCommemorationParishId") && adminApp.includes("runWeeklyCommemorationEmail") && adminApp.includes("/api/admin/commemorations/send-weekly"), "admin dashboard should expose a weekly commemoration email preview/send control");
assert.ok(adminHtml.includes("weeklyTreasurerParishId") && adminApp.includes("runWeeklyTreasurerEmail") && adminApp.includes("/api/admin/commerce/send-weekly-treasurer"), "admin dashboard should expose a weekly treasurer commerce email preview/send control");
assert.ok(adminCss.includes('admin-mobile-command') && adminCss.includes('mobile-review-bar') && adminCss.includes('product-admin-hero-giving { display: none; }'), "admin dashboard should include dedicated mobile verification layout styles");
assert.ok(serviceWorker.includes('agapay-static-v23'), "service worker cache version should advance when PWA manifest identity changes");
assert.ok(listenManifest.includes('"scope": "/listen/"') && listenManifest.includes('"name": "AGAPAY Listen"'), "AGAPAY Listen PWA manifest should exist with its own scope and identity");
assert.ok(listenIndex.includes('/listen/manifest.webmanifest'), "AGAPAY Listen page should link its own manifest, not the root or admin one");
assert.ok(myAgapayShell.includes('id: "giving"') && myAgapayShell.includes('label: "Give"'), "shared My AGAPAY shell should define the canonical Give product tab");
assert.ok(myAgapayShell.includes('id: "commemorations"') && myAgapayShell.includes('label: "Sacraments & Services"'), "shared My AGAPAY shell should define the merged Sacraments & Services product tab");
assert.ok(myAgapayShell.includes('id: "today"') && myAgapayShell.includes('label: "Today"'), "shared My AGAPAY shell should define the Today product tab");
assert.ok(myAgapayShell.includes('id: "bookstore"') && myAgapayShell.includes('label: "Bookstore"'), "shared My AGAPAY shell should keep Bookstore in the product nav");
assert.ok(myAgapayShell.includes('id: "learn"') && myAgapayShell.includes('label: "Learn"'), "shared My AGAPAY shell should define the canonical Learn product tab");
assert.ok(
  myAgapayShell.indexOf('id: "giving"') < myAgapayShell.indexOf('id: "commemorations"') &&
  myAgapayShell.indexOf('id: "commemorations"') < myAgapayShell.indexOf('id: "today"') &&
  myAgapayShell.indexOf('id: "today"') < myAgapayShell.indexOf('id: "bookstore"') &&
  myAgapayShell.indexOf('id: "bookstore"') < myAgapayShell.indexOf('id: "learn"'),
  "shared My AGAPAY shell should order product tabs as Give, Prayer, Today, Bookstore, Learn"
);
assert.ok(!myAgapayShell.includes('id: "home"'), "shared My AGAPAY shell should treat Give as the default product instead of a separate global home tab");
assert.ok(myAgapayShell.includes('pathname === "/myagapay"') && myAgapayShell.includes('return "giving"'), "shared My AGAPAY shell should make /myagapay resolve to the Give product");
assert.ok(myAgapayShell.includes('data-myagapay-global-nav') && myAgapayShell.includes("normalizeProductNavs"), "shared shell should normalize mobile product navigation across dashboards");
assert.ok(myAgapayShell.includes(".unified-product-nav") && myAgapayShell.includes("Bookstore") && myAgapayShell.includes("Feast day and readings"), "shared shell should normalize the desktop My AGAPAY sidebar from the same product tabs");
assert.ok(myAgapayShell.includes("isLikelyMobileBrowser") && myAgapayShell.includes("pointer: coarse"), "shared shell should use browser capability signals before choosing the mobile My AGAPAY viewport");
assert.ok(myAgapayShell.includes("ensureIosBackButton") && myAgapayShell.includes("myagapay-ios-back"), "shared shell should provide an in-app Back button for iPhone My AGAPAY screens");
assert.ok(myAgapayShell.includes("ensureCanonicalHeader") && myAgapayShell.includes("content.prepend(topbar)") && myAgapayShell.includes("myagapay-settings-chip"), "shared shell should add canonical account/settings access and a fallback topbar to My AGAPAY product headers");
assert.ok(myAgapayShell.includes("handleUnauthorized") && myAgapayShell.includes("redirectToLogin"), "shared shell should enforce one expired-session response across My AGAPAY products");
assert.ok(donorApp.includes('nav.setAttribute("hx-boost", "false")'), "donor shell should not htmx-boost dashboard navigation");
assert.ok(donorApp.includes("function updateDonorAuthState()"), "donor shell should update guest/authenticated controls from localStorage session");
assert.ok(donorApp.includes('link.closest("[data-myagapay-global-nav]")'), "donor icon enhancement should not overwrite canonical global product icons");
const donorHome = await readFile("public/donor/index.html", "utf8");
assert.ok(donorHome.includes("data-auth-guest"), "donor home should mark guest-only controls so signed-in donors do not see login prompts");
assert.ok(donorHome.includes("donor-phone"), "donor home should use the mobile-first app shell");
assert.ok(donorHome.includes("unified-product-nav"), "donor home should expose a desktop My AGAPAY sidebar for shared shell normalization");
assert.ok(!donorHome.includes("Back to Give"), "donor account initials menu should not include a Back to Give action");
assert.ok(donorHome.includes('const isGivingView = !["#products", "#my-agapay-products"].includes(window.location.hash)'), "My AGAPAY root should open the Give dashboard by default");
assert.ok(donorHome.includes("metricMonth"), "donor home should show month-to-date giving");
assert.ok(!donorHome.includes("Counts parish offerings (tithes) only"), "mobile Annual Pledge tracker should not include the tracking explanation copy");
assert.ok(donorHome.includes("summary-metrics-row") && donorHome.indexOf('class="summary-title"') < donorHome.indexOf('class="summary-metrics-row"'), "mobile Total Giving label should sit above the month/year metrics");
assert.ok(donorHome.includes("/myagapay/account"), "donor home avatar should link to My AGAPAY settings");
assert.ok(donorHome.includes("Active Funds") && donorHome.includes("desktopActiveFunds") && donorHome.includes("activeFunds"), "Give dashboard should show active parish funds on desktop and mobile");
assert.ok(donorHome.includes("Next Feast Offering"), "Give dashboard should use a giving-oriented feast card heading");
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
assert.ok(donorApp.includes("PAY FOR YOUR ITEMS AT THE ${parishName} BOOKSTORE.") && donorApp.includes("AGAPAY Parish+") && donorApp.includes("Request this feature for my parish"), "Bookstore page should preserve Parish+ unavailable messaging and feature request flow");
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
assert.ok(!learnDashboardShell.includes("Back to Give"), "Learn account initials menu should not include a Back to Give action");

const giveHtml = await readFile("public/give/form.html", "utf8");
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
const parishDashboardApp = await readFile("public/parish/app.js", "utf8");
assert.ok(parishDashboardApp.includes("campaignPublicUrl") && parishDashboardApp.includes("-campaign"), "parish dashboard should publish canonical nested campaign URLs");
const parishDashboardHtml = await readFile("public/parish/dashboard.html", "utf8");
assert.ok(parishDashboardHtml.includes('id="tab-reconcile"') && parishDashboardHtml.includes("Treasurer closeout"), "parish dashboard should include monthly reconciliation and closeout UI");
assert.ok(parishDashboardHtml.includes("sac-admin-shell") && parishDashboardHtml.indexOf("Weekly Availability") < parishDashboardHtml.indexOf("Blackout Dates") && parishDashboardHtml.indexOf("Blackout Dates") < parishDashboardHtml.indexOf("Sacrament Rules") && parishDashboardHtml.indexOf("Sacrament Rules") < parishDashboardHtml.indexOf(">Requests<") && parishDashboardHtml.indexOf(">Requests<") < parishDashboardHtml.indexOf(">Calendar<"), "parish Sacraments & Services dashboard tabs should match the uploaded template order");
assert.ok(parishDashboardApp.includes("function setSacramentsDashboardTab") && parishDashboardApp.includes("function renderSacramentsCalendar") && parishDashboardApp.includes("function renderSacramentsBlackouts") && parishDashboardApp.includes("function renderSacramentsRules"), "parish Sacraments & Services dashboard should render availability, blackouts, rules, requests, and calendar views");
assert.ok(parishDashboardHtml.includes("sacramentsFeatureToggle") && parishDashboardApp.includes("function toggleSacramentsFeature") && parishDashboardApp.includes("Off for parishioners"), "parish Sacraments & Services dashboard should include a self-service on/off switch");
assert.ok(parishDashboardApp.includes("sacramentsDashboardTab = 'availability'") && parishDashboardApp.includes("renderSacramentsDisabledPanel"), "parish Sacraments & Services should default to weekly availability and show an off state");
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
assert.ok(givingOverview.includes("Orthodox giving and tithing tools ready for parish life"), "Giving overview should describe currently available tools");
assert.ok(givingOverview.includes("AGAPAY Parish +") && givingOverview.indexOf("AGAPAY Parish +") < givingOverview.indexOf("giving-roadmap"), "Giving overview should list AGAPAY Parish + as available now");
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
assert.ok(core.includes("export const SECURITY_HEADERS"), "core.js should export a shared SECURITY_HEADERS constant");
assert.ok(core.includes('"X-Content-Type-Options": "nosniff"'), "SECURITY_HEADERS should set X-Content-Type-Options");
assert.ok(core.includes('"X-Frame-Options": "SAMEORIGIN"'), "SECURITY_HEADERS should set X-Frame-Options");
assert.ok(core.includes("Strict-Transport-Security"), "SECURITY_HEADERS should set HSTS");
assert.ok(core.includes("Content-Security-Policy-Report-Only"), "CSP should ship Report-Only, not enforcing, until violations have been reviewed (see docs/SECURITY_HEADERS.md)");
assert.ok(!core.includes('"Content-Security-Policy":'), "CSP should not be flipped to enforcing without reading docs/SECURITY_HEADERS.md first");
assert.ok(core.includes("...SECURITY_HEADERS"), "json()/corsJson() should apply SECURITY_HEADERS to Worker-generated API responses");
assert.ok(securityHeadersFile.includes("X-Content-Type-Options: nosniff"), "public/_headers should set X-Content-Type-Options for static assets");
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
assert.ok(parishDashboardHtml.includes('id="stewardshipHealthScorePane"'), "Stewardship Health tab should include a Health Score card");
assert.ok(parishDashboardHtml.includes('id="stewardshipConcentrationPane"'), "Stewardship Health tab should include a Donor Concentration Risk card");
assert.ok(parishDashboardHtml.includes('id="stewardshipRecurringPane"'), "Stewardship Health tab should include a Recurring Giving Health card");
assert.ok(parishDashboardHtml.includes("openStewardshipMonthlyReport()"), "Stewardship Health tab should have a Generate Monthly Stewardship Report button");
assert.ok(parishAppJs.includes("function loadStewardshipHealthScorePanel"), "app.js should define loadStewardshipHealthScorePanel");
assert.ok(parishAppJs.includes("function loadDonorConcentrationPanel"), "app.js should define loadDonorConcentrationPanel");
assert.ok(parishAppJs.includes("function loadRecurringGivingPanel"), "app.js should define loadRecurringGivingPanel");
assert.ok(parishAppJs.includes("stewardshipApi('/giving/health-score") && parishAppJs.includes("stewardshipApi('/giving/concentration") && parishAppJs.includes("stewardshipApi('/giving/recurring"), "Stewardship Health tab should call the new health-score/concentration/recurring endpoints");
assert.ok(worker.includes('endsWith("/stewardship/giving/retention")') && worker.includes('endsWith("/stewardship/giving/distribution")'), "retention/distribution endpoints should still exist -- their data feeds the new cards, not removed");
assert.ok(worker.includes('endsWith("/stewardship/giving/concentration")') && worker.includes('endsWith("/stewardship/giving/recurring")') && worker.includes('endsWith("/stewardship/giving/health-score")'), "worker should route the three new stewardship giving endpoints");
assert.ok(worker.includes('endsWith("/stewardship/report/monthly")'), "worker should route the monthly stewardship report endpoint");
assert.ok(!parishDashboardHtml.includes('id="swGivingFullLink"'), "standalone Full metrics report link should be retired -- combined into the Monthly Stewardship Report instead");
assert.ok(worker.includes("handleStewardshipGivingFunds(withYear(\"funds\")"), "monthly report should include the Giving by Fund breakdown that used to be exclusive to the standalone report");
assert.ok(parishDashboardHtml.includes('id="stewardshipManualIncomePane"'), "Stewardship Health tab should include an Other Income card for manual entry");
assert.ok(parishAppJs.includes("function loadManualIncomePanel") && parishAppJs.includes("function submitManualIncomeEntry") && parishAppJs.includes("function deleteManualIncomeEntry"), "app.js should define the manual income entry functions");
assert.ok(worker.includes("manual_income_entries"), "worker should reference the manual_income_entries table");
assert.ok(worker.includes("manualIncomeTotalCents"), "manual income should fold into the giving summary totals used by Budget Pace and Stewardship Health");

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
