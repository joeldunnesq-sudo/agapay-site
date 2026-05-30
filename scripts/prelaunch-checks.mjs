import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const workerSyntax = spawnSync(process.execPath, ["--check", "src/worker.js"], {
  encoding: "utf8"
});
assert.equal(workerSyntax.status, 0, workerSyntax.stderr || "Worker syntax check failed");

const publicRoutes = [
  "public/index.html",
  "public/giving/index.html",
  "public/marketplace.html",
  "public/directory.html",
  "public/vision.html",
  "public/register.html",
  "public/donor/login.html",
  "public/parish/login.html",
  "public/admin/login.html"
];

for (const routeFile of publicRoutes) {
  const html = await readFile(routeFile, "utf8");
  assert.ok(html.includes("AGAPAY"), `${routeFile} should include AGAPAY branding`);
}

const directoryHtml = await readFile("public/directory.html", "utf8");
assert.ok(
  directoryHtml.includes("leaflet@1.9.4"),
  "Directory page should include Leaflet assets for interactive map support"
);
assert.ok(
  directoryHtml.includes("id=\"directoryMap\""),
  "Directory page should include the live map root element"
);

const parishApp = await readFile("public/parish/app.js", "utf8");
assert.ok(parishApp.includes("addressLine1"), "Parish settings should include editable address line 1");
assert.ok(parishApp.includes("postalCode"), "Parish settings should include editable postal code");
assert.ok(parishApp.includes("country"), "Parish settings should include editable country");

const worker = await readFile("src/worker.js", "utf8");
assert.ok(worker.includes("X-AGAPAY-Admin-Token"), "Worker should accept AGAPAY admin auth header");
assert.ok(worker.includes("X-AGAPAY-Donor-Email"), "Worker should accept AGAPAY donor auth header");

if (process.env.AGAPAY_BASE_URL) {
  const baseUrl = process.env.AGAPAY_BASE_URL.replace(/\/+$/, "");
  const routes = ["/", "/giving", "/marketplace", "/directory", "/vision", "/register"];
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should return HTTP 200`);
    const body = await response.text();
    assert.ok(body.includes("AGAPAY"), `${route} should render AGAPAY branding`);
  }
  const securityConfig = await fetch(`${baseUrl}/api/security/config`);
  assert.equal(securityConfig.status, 200, "/api/security/config should return HTTP 200");
}

console.log("AGAPAY prelaunch checks passed.");
