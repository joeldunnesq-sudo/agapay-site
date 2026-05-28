import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const worker = await readFile("src/worker.js", "utf8");
const wrangler = await readFile("wrangler.toml", "utf8");
const d1Migration = await readFile("migrations/0001_production_records.sql", "utf8");
assert.ok(wrangler.includes('binding = "AGAPAY_DB"'), "wrangler should bind the production D1 database");
assert.ok(d1Migration.includes("CREATE TABLE IF NOT EXISTS registrations"), "D1 migration should create registrations table");
assert.ok(worker.includes("AGAPAY_DB"), "worker should prefer D1 for production records");
assert.ok(worker.includes("handleAdminMigrateKvToD1"), "worker should include an admin KV-to-D1 migration endpoint");
assert.ok(worker.includes("AGAPAY_REGISTRATIONS"), "worker should retain KV fallback during migration");
assert.ok(worker.includes("Stripe-Account"), "checkout should support routing payments to connected Stripe accounts");
assert.ok(worker.includes("PASSWORD_HASH_VERSION"), "worker should use versioned password records");
assert.ok(worker.includes("pbkdf2-sha256"), "worker should hash new passwords with PBKDF2-SHA256");
assert.ok(worker.includes("rateLimit(request, env"), "worker should rate-limit sensitive API routes");
assert.ok(worker.includes("verifyTurnstileIfConfigured"), "worker should support optional Cloudflare Turnstile checks");
assert.ok(worker.includes("handleSecurityConfig"), "worker should expose public security config for Turnstile-capable clients");
assert.ok(worker.includes('"admin-auth"'), "admin auth routes should be rate-limited before password checks");
assert.ok(worker.includes('"parish-auth"'), "parish dashboard login routes should be rate-limited before password checks");
assert.ok(worker.includes('"admin-money-actions"'), "admin Stripe/billing actions should be rate-limited");
assert.ok(worker.includes('"parish-money-actions"'), "parish Stripe/billing actions should be rate-limited");
assert.ok(worker.includes("claimStripeEvent(env, event)") && worker.includes("finishStripeEvent(env, event.id"), "Stripe webhooks should claim and finish events for idempotency");
assert.ok(worker.includes("checkout.session.expired"), "Stripe webhooks should handle expired checkout sessions");
assert.ok(worker.includes("checkout.session.async_payment_succeeded"), "Stripe webhooks should handle delayed successful checkout payments");
assert.ok(worker.includes("checkout.session.async_payment_failed"), "Stripe webhooks should handle delayed failed checkout payments");
assert.ok(worker.includes("payment_intent.succeeded"), "Stripe webhooks should handle successful payment intents");
assert.ok(worker.includes("payment_intent.payment_failed"), "Stripe webhooks should handle failed payments");
assert.ok(worker.includes("payment_intent.canceled"), "Stripe webhooks should handle canceled payments");
assert.ok(worker.includes("charge.refunded"), "Stripe webhooks should handle refunds");
assert.ok(worker.includes("charge.dispute.created"), "Stripe webhooks should handle disputes");
assert.ok(worker.includes("charge.dispute.closed"), "Stripe webhooks should handle closed disputes");
assert.ok(worker.includes("account.updated"), "Stripe webhooks should sync connected account status");
assert.ok(worker.includes("PARISH_ID_INDEX_PREFIX"), "worker should maintain KV parish id indexes");
assert.ok(worker.includes("handleAdminRebuildIndexes"), "worker should expose an admin-only index rebuild endpoint");
assert.ok(!worker.includes("const parishes = ["), "worker should not hardcode demo parishes");
assert.ok(worker.includes('url.pathname === "/donor/verify"'), "worker should route donor verification links before assets");
assert.ok(worker.includes("handleDonorVerifyPage"), "worker should handle donor verification links server-side");
await assert.rejects(access("functions/donor/verify.js"), undefined, "donor verification should not use a Pages Function adapter");
await assert.rejects(access("public/_routes.json"), undefined, "Wrangler Worker deploy should not include Pages Functions route config");
await assert.rejects(access("public/donor/verify.html"), undefined, "static donor verify HTML should not shadow the Worker route");

const registerHtml = await readFile("public/register.html", "utf8");
assert.ok(!registerHtml.includes("WEB3FORMS_KEY"), "registration should not expose Web3Forms key");
assert.ok(registerHtml.includes("/api/registrations"), "registration should post to AgaPay API");


const donorApp = await readFile("public/donor/app.js", "utf8");
assert.ok(donorApp.includes('nav.setAttribute("hx-boost", "false")'), "donor shell should not htmx-boost dashboard navigation");
assert.ok(donorApp.includes("function updateDonorAuthState()"), "donor shell should update guest/authenticated controls from localStorage session");
const donorHome = await readFile("public/donor/index.html", "utf8");
assert.ok(donorHome.includes("data-auth-guest"), "donor home should mark guest-only controls so signed-in donors do not see login prompts");
assert.ok(donorHome.includes("donor-phone"), "donor home should use the mobile-first app shell");
assert.ok(donorHome.includes("metricMonth"), "donor home should show month-to-date giving");
assert.ok(donorHome.includes("/donor/settings"), "donor home avatar should link to settings");
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
assert.ok(giveHtml.includes("/api/parishes"), "giving page should load registered parishes from the Worker API");
assert.ok(giveHtml.includes("/security.js") && giveHtml.includes("data-agapay-turnstile"), "public giving checkout should render Turnstile when configured");
assert.ok(giveHtml.includes("agapaySecurityPayload"), "public giving checkout should send Turnstile tokens when configured");
assert.ok(registerHtml.includes("/security.js") && registerHtml.includes("data-agapay-turnstile"), "registration should render Turnstile when configured");
assert.ok(registerHtml.includes("agapaySecurityPayload"), "registration should send Turnstile tokens when configured");

console.log("AgaPay platform checks passed.");
