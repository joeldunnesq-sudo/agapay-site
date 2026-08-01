import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/worker.js";
import { parishLifeAvailableFor } from "../src/lib/parish-life-access.js";

assert.equal(parishLifeAvailableFor(), false, "an unset environment must fail closed");
assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: "production" }), false);
assert.equal(parishLifeAvailableFor({ AGAPAY_ENVIRONMENT: "production", AGAPAY_PARISH_LIFE_ENABLED: "true" }), true, "production must support an explicit Koinonia release flag");
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

const assetEnv = (environment) => ({
  AGAPAY_ENVIRONMENT: environment,
  ASSETS: { fetch: async () => new Response("<!doctype html><title>Parish Life</title>", { headers: { "Content-Type": "text/html" } }) },
});
const productionLanding = await worker.fetch(new Request("https://agapay.test/myagapay/parish-life"), assetEnv("production"), executionContext);
assert.equal(productionLanding.status, 200, "the shared Today/Koinonia landing must remain reachable in production");
for (const pathname of ["/myagapay/feed", "/myagapay/groups"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), assetEnv("production"), executionContext);
  assert.equal(production.status, 404, `${pathname} must remain unavailable in production`);
  const staging = await worker.fetch(new Request(`https://agapay.test${pathname}`), assetEnv("staging"), executionContext);
  assert.equal(staging.status, 200, `${pathname} must remain reachable on staging`);
}
const enabledProductionAssetEnv = { ...assetEnv("production"), AGAPAY_PARISH_LIFE_ENABLED: "true" };
for (const pathname of ["/myagapay/feed", "/myagapay/groups", "/myagapay/teaching", "/myagapay/media"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), enabledProductionAssetEnv, executionContext);
  assert.equal(production.status, 200, `${pathname} must be reachable when Koinonia is released in production`);
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
assert.match(hub, /class="cal-hero parish-life-liturgical-hero"/);
assert.match(hub, />Upcoming Services</);
assert.match(hub, /id="parishLifeTierSections"><\/div>/, "communications content must not be present in the initial DOM");
assert.match(hubScript, /parishLifeFetch\("\/api\/donor\/feed"/);
assert.match(hubScript, /parishLifeFetch\("\/api\/donor\/groups"/);
assert.match(hubScript, /if \(!experience\.communicationsEnabled\)[\s\S]*return;/);
assert.match(groupHandler, /export async function listGroupActivity[\s\S]*getReadContentIds[\s\S]*messages\.slice\(0, 10\)/);
assert.match(shell, /parishLifeAvailable/);
assert.match(parishDashboard, /id="nav-communications" hidden/);
assert.match(parishDashboard, /id="nav-bookstore"[\s\S]*id="nav-tier-parish"[\s\S]*id="nav-sacraments"[\s\S]*id="nav-directory"[\s\S]*id="nav-text"[\s\S]*id="nav-accounting"[\s\S]*id="nav-communications"/, "Koinonia must close the Parish-tier tools at the bottom");
assert.match(parishApp, /const parishOrder = \['sacraments', 'directory', 'accounting', 'text', 'communications'\]/, "runtime navigation ordering must keep Koinonia last in the Parish tier");
assert.match(parishApp, /communicationsNav\.hidden = !parishLifeAvailable/);
assert.match(workerSource, /parishLifeApiRoute[\s\S]*status: 404/);

console.log("PASS - Parish Life landing stays universal while communications APIs and spokes fail closed");
