import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile("src/worker.js", "utf8");
assert.ok(worker.includes("AGAPAY_REGISTRATIONS"), "worker should use KV registrations as the parish source of truth");
assert.ok(worker.includes("Stripe-Account"), "checkout should support routing payments to connected Stripe accounts");
assert.ok(!worker.includes("const parishes = ["), "worker should not hardcode demo parishes");
assert.ok(worker.includes('url.pathname === "/donor/verify"'), "worker should route donor verification links before assets");
assert.ok(worker.includes("handleDonorVerifyPage"), "worker should handle donor verification links server-side");

const donorVerifyFunction = await readFile("functions/donor/verify.js", "utf8");
assert.ok(donorVerifyFunction.includes("../../src/worker.js"), "Pages donor verification route should delegate to the Worker");
assert.ok(donorVerifyFunction.includes("onRequest"), "Pages donor verification route should export an onRequest handler");

const registerHtml = await readFile("public/register.html", "utf8");
assert.ok(!registerHtml.includes("WEB3FORMS_KEY"), "registration should not expose Web3Forms key");
assert.ok(registerHtml.includes("/api/registrations"), "registration should post to AgaPay API");

const giveHtml = await readFile("public/give/form.html", "utf8");
assert.ok(giveHtml.includes("/api/create-checkout-session"), "giving page should post to checkout API");
assert.ok(giveHtml.includes("/api/parishes"), "giving page should load registered parishes from the Worker API");

console.log("AgaPay platform checks passed.");
