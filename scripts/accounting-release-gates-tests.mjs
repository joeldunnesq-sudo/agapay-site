import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accountingAvailableForParish } from "../src/lib/accounting-demo-access.js";
import { ACCOUNTING_HANDLER_FILES, enumerateAccountingRoutes } from "./lib/accounting-release-gates.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [serviceWorker, parishApp, gate1, gate2, gate3, bootstrap, helpers, smoke, deploy, workflow, signoff, packageJson] = await Promise.all([
  read("public/service-worker.js"),
  read("public/parish/app.js"),
  read("scripts/accounting-release-gate-1-check-print.mjs"),
  read("scripts/accounting-release-gate-2-sw-lifecycle.mjs"),
  read("scripts/accounting-release-gate-3-cross-tenant.mjs"),
  read("scripts/accounting-release-gate-bootstrap-users.mjs"),
  read("scripts/lib/accounting-release-gates.mjs"),
  read("scripts/accounting-smoke-live.mjs"),
  read(".github/workflows/deploy.yml"),
  read(".github/workflows/accounting-release-gates.yml"),
  read("docs/accounting/accounting-release-gates-signoff.md"),
  read("package.json")
]);

assert.match(serviceWorker, /pathname\.startsWith\(["']\/api\/["']\).*return true/s);
assert.match(serviceWorker, /pathname\.startsWith\(["']\/parish["']\).*return true/s);
assert.match(gate2, /context\.setOffline\(true\)/);
assert.match(gate2, /registration\.update\(\)/);
assert.match(parishApp, /addEventListener\('offline'/);
assert.match(parishApp, /serviceWorker\?\.addEventListener\('controllerchange'/);
assert.match(parishApp, /open Accounting form was preserved/);
assert.match(packageJson, /accounting-release-gate-2-sw-lifecycle\.mjs --static-only/);
console.log("PASS - authenticated parish/API caching remains prohibited and gate 2 is permanent");

assert.equal(accountingAvailableForParish("st-fiacre"), true);
assert.equal(accountingAvailableForParish("release-gate-b", { AGAPAY_ENVIRONMENT:"staging", ACCOUNTING_TEST_PARISH_IDS:"release-gate-b" }), true);
assert.equal(accountingAvailableForParish("st-tester-san-antonio", { AGAPAY_ENVIRONMENT:"staging", ACCOUNTING_TEST_PARISH_IDS:"st-tester-san-antonio" }), true);
assert.equal(accountingAvailableForParish("release-gate-b", { AGAPAY_ENVIRONMENT:"production", ACCOUNTING_TEST_PARISH_IDS:"release-gate-b" }), false);
assert.equal(accountingAvailableForParish("release-gate-b", { ACCOUNTING_TEST_PARISH_IDS:"release-gate-b" }), false);
console.log("PASS - a second test parish is possible only in an explicit non-production environment");

const inventory = await enumerateAccountingRoutes();
assert.equal(inventory.coverage.length, ACCOUNTING_HANDLER_FILES.length);
assert.ok(inventory.coverage.every((item) => item.routes > 0));
assert.ok(inventory.routes.length >= 85, `Expected at least 85 routes; found ${inventory.routes.length}.`);
for (const family of ["ledger","setup-reports","payables-budgets","reconciliation-commerce","close","adjustments","governance","attachments","migration"]) {
  assert.ok(inventory.coverage.some((item) => item.handler.includes(family)), `Missing ${family} handler coverage.`);
}
assert.match(gate3, /runCrossTenantMatrix/);
assert.match(gate3, /platform-a-to-b/);
assert.match(gate3, /staff-b-to-a/);
assert.match(helpers, /\/api\/identity\/login/);
assert.match(helpers, /["']X-AGAPAY-User-Email["']/);
assert.doesNotMatch(helpers, /\/myagapay\/login|agapayDonorToken/);
assert.match(helpers, /sidebarParishName/);
assert.match(helpers, /accountingPane\[data-loaded=["']true["']\]/);
console.log(`PASS - gate 3 inventories ${inventory.routes.length} routes across ${inventory.coverage.length} handler files`);

for (const style of ["top_check_two_stubs","bottom_check_two_stubs","check_only"]) assert.match(gate1, new RegExp(style));
assert.match(gate1, /popup\.pdf/);
assert.match(gate1, /REPRINT\\s\*·\\s\*ORIGINAL CHECK/);
assert.match(gate1, /Void/);
assert.match(gate1, /Save vendor/);
assert.match(gate1, /Save draft bill/);
assert.match(gate1, /data-accounting-view=["']payables["']/);
assert.match(gate1, /ACCOUNTING_GATE_PARISH_B_ID/);
assert.doesNotMatch(gate1, /ACCOUNTING_GATE_PARISH_A_ID/);
console.log("PASS - gate 1 drives the real UI and preserves layout, reprint, and void evidence");

assert.match(deploy, /accounting-smoke-live\.mjs/);
assert.match(deploy, /post-deploy-accounting-smoke/);
assert.match(workflow, /accounting-release-gate-1-check-print\.mjs/);
assert.match(workflow, /accounting-release-gate-2-sw-lifecycle\.mjs/);
assert.match(workflow, /accounting-release-gate-3-cross-tenant\.mjs/);
assert.match(workflow, /accounting-release-gate-bootstrap-users\.mjs/);
assert.ok(
  workflow.indexOf("accounting-release-gate-bootstrap-users.mjs") < workflow.indexOf("accounting-release-gate-3-cross-tenant.mjs"),
  "Dedicated platform users must be bootstrapped before the cross-tenant gate."
);
assert.match(bootstrap, /hostname\.toLowerCase\(\)\.includes\(["']staging["']\)/);
assert.match(bootstrap, /memberships\/invitations/);
assert.match(bootstrap, /identity\/invitations/);
assert.match(bootstrap, /["']X-AGAPAY-User-Email["']/);
assert.match(bootstrap, /membership\.status === ["']active["']/);
assert.match(workflow, /upload-artifact@v4/);
assert.match(smoke, /ACCOUNTING_READ_SMOKE_PATHS|readAccountingSections/);
assert.match(signoff, /Physical check-stock verification/);
assert.match(signoff, /not complete/i);
console.log("PASS - evidence workflow, post-deploy smoke, and human sign-off record are wired");

console.log("accounting-release-gates-tests.mjs OK");
