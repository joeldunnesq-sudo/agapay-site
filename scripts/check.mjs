import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listParishes } from "../lib/parishes.js";

const parishes = await listParishes();
assert.ok(parishes.length >= 1, "at least one parish should exist");
assert.ok(parishes.every((parish) => parish.id && parish.name && parish.jurisdiction), "parishes need core fields");

const registerHtml = await readFile("public/register.html", "utf8");
assert.ok(!registerHtml.includes("WEB3FORMS_KEY"), "registration should not expose Web3Forms key");
assert.ok(registerHtml.includes("/api/registrations"), "registration should post to AgaPay API");

const giveHtml = await readFile("public/give/st-seraphim-mission.html", "utf8");
assert.ok(giveHtml.includes("/api/create-checkout-session"), "giving page should post to checkout API");

console.log("AgaPay platform checks passed.");
