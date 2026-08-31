import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  dashboard: new URL("public/parish/dashboard.html", root),
  registry: new URL("public/parish/feature-registry.js", root),
  core: new URL("public/parish/app.js", root),
  directory: new URL("public/parish/features/directory.js", root),
  library: new URL("public/parish/features/library.js", root),
  sacraments: new URL("public/parish/features/sacraments.js", root),
  accounting: new URL("public/parish/features/accounting.js", root),
  notifications: new URL("src/lib/parish-notifications.js", root),
};

const [dashboard, registry, core, directory, library, sacraments, accounting, notifications] = await Promise.all(
  Object.values(paths).map((path) => readFile(path, "utf8")),
);

const registryScript = '/parish/feature-registry.js?v=20260830features1';
const coreScript = '/parish/app.js?v=20260830features1';
assert.ok(dashboard.includes(registryScript), 'feature registry must be loaded');
for (const feature of ["directory", "library", "sacraments"]) {
  const featureScript = `/parish/features/${feature}.js?v=20260830features1`;
  assert.ok(dashboard.includes(featureScript), `${feature} feature script must be loaded`);
  assert.ok(dashboard.indexOf(registryScript) < dashboard.indexOf(featureScript), `registry must load before ${feature}`);
  assert.ok(dashboard.indexOf(featureScript) < dashboard.indexOf(coreScript), `${feature} must load before the dashboard core`);
}

assert.doesNotMatch(core, /function loadDirectoryAdminTab/, "Directory implementation must stay out of the dashboard core");
assert.doesNotMatch(core, /function loadParishLibraryAdmin/, "Library implementation must stay out of the dashboard core");
assert.doesNotMatch(core, /let sacramentsState/, "Sacraments implementation must stay out of the dashboard core");
assert.match(registry, /ParishFeatureRegistry/);
assert.match(core, /loadRegisteredParishFeature\('sacraments'\)/);
assert.match(core, /loadRegisteredParishFeature\('directory'\)/);
assert.match(core, /loadRegisteredParishFeature\('library'\)/);
assert.match(directory, /ParishFeatureRegistry\.register\('directory'/);
assert.match(library, /ParishFeatureRegistry\.register\('library'/);
assert.match(sacraments, /ParishFeatureRegistry\.register\('sacraments'/);
assert.doesNotMatch(core, /function loadAccountingTab/);
assert.match(core, /loadRegisteredParishFeature\('accounting'\)/);
assert.match(accounting, /ParishFeatureRegistry\.register\('accounting'/);
assert.match(core, /function accountingStaffSession\(/, 'shared authentication must work without feature scripts');

const coreStats = await stat(paths.core);
assert.ok(coreStats.size < 950_000, `dashboard core grew past its 950 KB guardrail (${coreStats.size} bytes)`);
assert.ok(core.split(/\r?\n/).length < 12_000, "dashboard core grew past its 12,000-line guardrail");

const notificationStats = await stat(paths.notifications);
assert.doesNotMatch(notifications, /onboardingPdfB64/, "the retired embedded onboarding PDF must not return");
assert.ok(notificationStats.size < 100_000, `notification module grew past its 100 KB guardrail (${notificationStats.size} bytes)`);

console.log("PASS - Parish dashboard feature boundaries and source-size guardrails");
await import('./parish-dashboard-runtime-tests.mjs');
