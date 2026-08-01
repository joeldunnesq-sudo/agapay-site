import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/worker.js";
import { parishLifeAvailableFor } from "../src/lib/parish-life-access.js";

assert.equal(parishLifeAvailableFor(), false, "an unset environment must fail closed");
assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: "production" }), false);
for (const environment of ["development", "test", "staging", "preview", " STAGING "]) {
  assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: environment }), true, `${environment} should enable Parish Life`);
}

const gatedApiPaths = [
  "/api/donor/feed",
  "/api/donor/feed/announcement-one/read",
  "/api/donor/groups",
  "/api/donor/groups/activity",
  "/api/donor/groups/ministry-one/messages",
  "/api/donor/digest/subscription",
  "/api/donor/digest/unsubscribe",
  "/api/admin/communications/send-weekly-digest",
  "/api/parish/dashboard/parish-one/communications",
  "/api/parish/dashboard/parish-one/communications/announcement-one/readers",
];
const executionContext = { waitUntil() {} };
for (const environment of [undefined, "production"]) {
  for (const pathname of gatedApiPaths) {
    const response = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT: environment }, executionContext);
    assert.equal(response.status, 404, `${pathname} must be unavailable in ${environment || "an unset environment"}`);
    assert.deepEqual(await response.json(), { error: "Not found" });
  }
}

for (const pathname of ["/api/donor/feed", "/api/donor/groups", "/api/donor/groups/activity"]) {
  const response = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT: "staging" }, executionContext);
  assert.notEqual(response.status, 404, `${pathname} must pass the environment gate on staging`);
}

const assetEnv = {
  AGAPAY_ENVIRONMENT: "staging",
  ASSETS: { fetch: async () => new Response("<!doctype html><title>Parish Life</title>", { headers: { "Content-Type": "text/html" } }) },
};
for (const pathname of ["/myagapay/parish-life", "/myagapay/feed", "/myagapay/groups"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT: "production" }, executionContext);
  assert.equal(production.status, 404, `${pathname} must not render on production`);
  const staging = await worker.fetch(new Request(`https://agapay.test${pathname}`), assetEnv, executionContext);
  assert.equal(staging.status, 200, `${pathname} must remain reachable on staging`);
}

const [hub, hubScript, shell, parishDashboard, parishApp, groupHandler, workerSource] = await Promise.all([
  readFile(new URL("../public/myagapay/parish-life.html", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/donor-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../src/worker.js", import.meta.url), "utf8"),
]);
assert.match(hub, /class="feed-hero"/);
assert.equal((hub.match(/class="mobile-product-card live"/g) || []).length, 3, "Announcements, Groups, and Teaching should be live cards");
assert.equal((hub.match(/class="mobile-product-card coming-soon"/g) || []).length, 1, "Media should remain a placeholder");
assert.match(hub, />Teaching</);
assert.match(hub, />Media</);
assert.match(hubScript, /fetch\("\/api\/donor\/feed"/);
assert.match(hubScript, /fetch\("\/api\/donor\/groups\/activity"/);
assert.match(hubScript, /\[\.\.\.announcements, \.\.\.messages, \.\.\.teachings\][\s\S]*\.sort/);
assert.match(groupHandler, /export async function listGroupActivity[\s\S]*getReadContentIds[\s\S]*messages\.slice\(0, 10\)/);
assert.match(shell, /parishLifeAvailable/);
assert.match(parishDashboard, /id="nav-communications" hidden/);
assert.match(parishApp, /communicationsNav\.hidden = !parishLifeAvailable/);
assert.match(workerSource, /parishLifeApiRoute[\s\S]*status: 404/);

console.log("PASS - Parish Life hub and fail-closed staging gate cover pages, APIs, and both navigation surfaces");
