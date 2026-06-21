import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const worker = await readFile("src/worker.js", "utf8");
const core = await readFile("src/lib/core.js", "utf8");
const stripeConnect = await readFile("src/lib/stripe-connect.js", "utf8");
const adminHandler = await readFile("src/handlers/admin.js", "utf8");
const donorHandler = await readFile("src/handlers/donor.js", "utf8");
const parishHandler = await readFile("src/handlers/parish.js", "utf8");
const stripeHandler = await readFile("src/handlers/stripe.js", "utf8");
const wrangler = await readFile("wrangler.toml", "utf8");
const d1Migration = await readFile("migrations/0001_production_records.sql", "utf8");
const backendSources = worker + core + stripeConnect + adminHandler + donorHandler + parishHandler + stripeHandler;
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
assert.ok(worker.includes('["/parish/login", "/giving/login"]'), "legacy parish login should redirect to the Giving login URL");
assert.ok(worker.includes('url.pathname === "/giving/login"'), "worker should serve the Giving login URL from the parish login shell");
assert.ok(worker.includes('LEGACY_GIVING_PAGE_REDIRECTS'), "worker should redirect legacy Giving marketing URLs to the Giving subtree");
for (const givingPage of ["features", "how-it-works", "pricing", "why"]) {
  assert.ok(worker.includes(`["/${givingPage}", "/giving/${givingPage}"]`), `worker should redirect /${givingPage} to /giving/${givingPage}`);
}
assert.ok(backendSources.includes("checkoutFinancials("), "worker should centralize donation fee calculations");
assert.ok(backendSources.includes("subscription_data[application_fee_percent]"), "worker should apply AGAPAY donation fees to recurring donor gifts");
assert.ok(backendSources.includes("Parish SaaS subscription billing is created in a separate flow"), "worker should keep parish subscription billing separate from donation fees");
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

const directoryPage = await readFile("public/directory.html", "utf8");
assert.ok(directoryPage.includes("AGAPAY Directory Intake"), "directory should render the intake experience");
assert.ok(directoryPage.includes("Submit a listing"), "directory should invite organizations to submit listings");
assert.ok(directoryPage.includes("parishes, monasteries, ministries, schools, businesses"), "directory should describe Orthodox organization coverage");
assert.ok(directoryPage.includes("/api/directory/intake"), "directory intake should post to the AGAPAY API");


const donorApp = await readFile("public/donor/app.js", "utf8");
assert.ok(donorApp.includes('nav.setAttribute("hx-boost", "false")'), "donor shell should not htmx-boost dashboard navigation");
assert.ok(donorApp.includes("function updateDonorAuthState()"), "donor shell should update guest/authenticated controls from localStorage session");
const donorHome = await readFile("public/donor/index.html", "utf8");
assert.ok(donorHome.includes("data-auth-guest"), "donor home should mark guest-only controls so signed-in donors do not see login prompts");
assert.ok(donorHome.includes("donor-phone"), "donor home should use the mobile-first app shell");
assert.ok(donorHome.includes("metricMonth"), "donor home should show month-to-date giving");
assert.ok(donorHome.includes("/myagapay/account"), "donor home avatar should link to My AGAPAY settings");
const donorSettings = await readFile("public/donor/settings.html", "utf8");
assert.ok(donorSettings.includes("saveDonorSettings(event)"), "donor settings should save through the donor API");
const donorSecurity = await readFile("public/security.js", "utf8");
assert.ok(donorSecurity.includes("/api/security/config"), "security helper should load Turnstile config from the Worker");
assert.ok(donorSecurity.includes("agapaySecurityPayload"), "security helper should expose Turnstile payloads to public forms");
const donorSignup = await readFile("public/donor/signup.html", "utf8");
assert.ok(donorSignup.includes("/security.js") && donorSignup.includes("data-agapay-turnstile"), "donor signup should render Turnstile when configured");
const donorGive = await readFile("public/donor/give.html", "utf8");
assert.ok(donorGive.includes("/security.js") && donorGive.includes("data-agapay-turnstile"), "donor checkout should render Turnstile when configured");
const donorPages = ["calendar", "commemorations", "give", "index", "login", "offerings", "settings", "signup"];
for (const page of donorPages) {
  const html = await readFile(`public/donor/${page}.html`, "utf8");
  assert.ok(!html.includes('hx-boost="true"'), `donor ${page} page should use full navigation so page initializers run`);
}

const giveHtml = await readFile("public/give/form.html", "utf8");
assert.ok(giveHtml.includes("/api/create-checkout-session"), "giving page should post to checkout API");
assert.ok(giveHtml.includes("/api/checkout-session-status"), "giving page should reconcile returned Stripe checkout sessions");
assert.ok(giveHtml.includes("/api/parishes"), "giving page should load registered parishes from the Worker API");
assert.ok(giveHtml.includes("function renderCampaigns"), "giving page should render live parish campaigns from the Worker API");
assert.ok(giveHtml.includes("applyGiftQueryParams"), "giving page should deep-link into specific gift types and campaigns");
assert.ok(giveHtml.includes("/security.js") && giveHtml.includes("data-agapay-turnstile"), "public giving checkout should render Turnstile when configured");
assert.ok(giveHtml.includes("agapaySecurityPayload"), "public giving checkout should send Turnstile tokens when configured");
const campaignPage = await readFile("public/give/parish-giving/app.js", "utf8");
assert.ok(campaignPage.includes("/api/campaign?"), "campaign share page should load campaign data from the Worker API");
assert.ok(campaignPage.includes("/api/create-checkout-session") && campaignPage.includes('giftType: "campaign"'), "campaign share page should create a direct Stripe checkout for campaign gifts");
assert.ok(worker.includes('url.pathname === "/api/campaign"'), "worker should route public campaign lookup API");
assert.ok(worker.includes('endsWith("/campaign-upload")'), "worker should route authenticated parish campaign photo uploads");
assert.ok(worker.includes('startsWith("/give/parish-giving/")'), "worker should serve campaign share URLs instead of the generic giving form");
assert.ok(donorApp.includes("handleDonorCheckoutReturn"), "donor dashboard should confirm returned Stripe checkout sessions");
const givingOverview = await readFile("public/give/index.html", "utf8");
assert.ok(givingOverview.includes("Orthodox Giving App &amp; Tithing Software") || givingOverview.includes("Orthodox Giving App & Tithing Software"), "Giving overview should target Orthodox giving and tithing search intent");
assert.ok(givingOverview.includes('"@type": "SoftwareApplication"') && givingOverview.includes('"@type": "FAQPage"'), "Giving overview should include software and FAQ structured data");
assert.ok(givingOverview.includes("Orthodox giving and tithing tools ready for parish life"), "Giving overview should describe currently available tools");
assert.ok(givingOverview.includes("Text-to-Give") && givingOverview.includes("AGAPAY Stewardship") && givingOverview.includes("Coming Soon"), "Giving overview should clearly identify coming-soon products");
const sitemap = await readFile("public/sitemap.xml", "utf8");
assert.ok(sitemap.includes("https://agapay.app/giving"), "sitemap should include the canonical Giving overview URL");
for (const givingPage of ["features", "how-it-works", "pricing", "why"]) {
  const html = await readFile(`public/giving/${givingPage}.html`, "utf8");
  assert.ok(html.includes(`https://agapay.app/giving/${givingPage}`), `Giving ${givingPage} page should use its nested canonical URL`);
  assert.ok(sitemap.includes(`https://agapay.app/giving/${givingPage}`), `sitemap should include /giving/${givingPage}`);
}
assert.ok(!sitemap.includes("<loc>https://agapay.app/features</loc>"), "sitemap should not list the legacy root features URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/how-it-works</loc>"), "sitemap should not list the legacy root how-it-works URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/pricing</loc>"), "sitemap should not list the legacy root pricing URL");
assert.ok(!sitemap.includes("<loc>https://agapay.app/why</loc>"), "sitemap should not list the legacy root why URL");
assert.ok(registerHtml.includes("/security.js") && registerHtml.includes("data-agapay-turnstile"), "registration should render Turnstile when configured");
assert.ok(registerHtml.includes("agapaySecurityPayload"), "registration should send Turnstile tokens when configured");

console.log("AGAPAY platform checks passed.");
