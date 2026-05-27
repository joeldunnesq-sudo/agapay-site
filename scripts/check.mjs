import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const worker = await readFile("src/worker.js", "utf8");
assert.ok(worker.includes("AGAPAY_REGISTRATIONS"), "worker should use KV registrations as the parish source of truth");
assert.ok(worker.includes("Stripe-Account"), "checkout should support routing payments to connected Stripe accounts");
assert.ok(!worker.includes("const parishes = ["), "worker should not hardcode demo parishes");
assert.ok(worker.includes('url.pathname === "/donor/verify"'), "worker should route donor verification links before assets");
assert.ok(worker.includes("handleDonorVerifyPage"), "worker should handle donor verification links server-side");

const donorVerifyFunction = await readFile("functions/donor/verify.js", "utf8");
assert.ok(donorVerifyFunction.includes("../../src/worker.js"), "Pages donor verification route should delegate to the Worker");
assert.ok(donorVerifyFunction.includes("onRequest"), "Pages donor verification route should export an onRequest handler");

const routesJson = await readFile("public/_routes.json", "utf8");
assert.ok(routesJson.includes('"/donor/verify"'), "Pages routes should invoke the donor verification function");
await assert.rejects(access("public/donor/verify.html"), undefined, "static donor verify HTML should not shadow the Pages Function");

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
