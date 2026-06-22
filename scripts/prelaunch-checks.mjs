import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const workerSyntax = spawnSync(process.execPath, ["--check", "src/worker.js"], {
  encoding: "utf8"
});
assert.equal(workerSyntax.status, 0, workerSyntax.stderr || "Worker syntax check failed");

const publicRoutes = [
  "public/index.html",
  "public/give/index.html",
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
  directoryHtml.includes("AGAPAY Directory Intake"),
  "Directory page should render the current AGAPAY Directory intake experience"
);
assert.ok(
  directoryHtml.includes("id=\"directoryForm\""),
  "Directory page should include a directory intake form"
);
assert.ok(
  directoryHtml.includes("id=\"contactEmail\""),
  "Directory page should collect contact email addresses"
);
assert.ok(
  directoryHtml.includes("Submit a listing"),
  "Directory page should identify the Directory intake clearly"
);
assert.ok(
  directoryHtml.includes("/api/directory/intake"),
  "Directory intake should route submissions to the AGAPAY API"
);

const registerHtml = await readFile("public/register.html", "utf8");
assert.ok(registerHtml.includes("startDonorRegistration"), "Registration page should support donor/family entry");
assert.ok(registerHtml.includes("startOrganizationRegistration"), "Registration page should support organization entry");
assert.ok(registerHtml.includes("organizationDescription"), "Registration page should support values-review descriptions");

const parishApp = await readFile("public/parish/app.js", "utf8");
assert.ok(parishApp.includes("addressLine1"), "Parish settings should include editable address line 1");
assert.ok(parishApp.includes("postalCode"), "Parish settings should include editable postal code");
assert.ok(parishApp.includes("country"), "Parish settings should include editable country");

const backendFiles = [
  "src/worker.js",
  "src/lib/core.js",
  "src/handlers/admin.js",
  "src/handlers/donor.js",
  "src/handlers/parish.js",
  "src/handlers/stripe.js",
  "src/handlers/stewardship.js"
];
const backendSources = (await Promise.all(backendFiles.map((file) => readFile(file, "utf8")))).join("\n");
assert.ok(backendSources.includes("X-AGAPAY-Admin-Token"), "Backend should accept AGAPAY admin auth header");
assert.ok(backendSources.includes("X-AGAPAY-Donor-Email"), "Backend should accept AGAPAY donor auth header");
assert.ok(backendSources.includes("handleAdminReleaseStatus"), "Backend should expose a release-status report");
assert.ok(backendSources.includes("STRIPE_WEBHOOK_SECRET_CONNECT"), "Backend should support a separate Connect webhook signing secret");
assert.ok(backendSources.includes("handleParishStripeRefresh"), "Backend should let parishes refresh Stripe Connect status");
assert.ok(backendSources.includes("checkoutFinancials("), "Backend should centralize donation fee calculations");
assert.ok(backendSources.includes("subscription_data[application_fee_percent]"), "Backend should apply AGAPAY donation fees to recurring donor gifts");
assert.ok(backendSources.includes("Parish SaaS subscription billing is created in a separate flow"), "Backend should keep parish subscription billing separate from donation fees");

if (process.env.AGAPAY_BASE_URL) {
  const baseUrl = process.env.AGAPAY_BASE_URL.replace(/\/+$/, "");
  const routes = ["/", "/give", "/marketplace", "/directory", "/vision", "/onboarding", "/register"];
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
