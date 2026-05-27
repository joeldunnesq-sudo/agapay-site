import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const worker = await readFile("src/worker.js", "utf8");
assert.ok(worker.includes("AGAPAY_REGISTRATIONS"), "worker should use KV registrations as the parish source of truth");
assert.ok(worker.includes("Stripe-Account"), "checkout should support routing payments to connected Stripe accounts");
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
const donorPages = ["calendar", "commemorations", "give", "index", "login", "offerings", "signup"];
for (const page of donorPages) {
  const html = await readFile(`public/donor/${page}.html`, "utf8");
  assert.ok(!html.includes('hx-boost="true"'), `donor ${page} page should use full navigation so page initializers run`);
}

const giveHtml = await readFile("public/give/form.html", "utf8");
assert.ok(giveHtml.includes("/api/create-checkout-session"), "giving page should post to checkout API");
assert.ok(giveHtml.includes("/api/parishes"), "giving page should load registered parishes from the Worker API");

console.log("AgaPay platform checks passed.");
