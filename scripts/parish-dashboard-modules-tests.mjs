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
  commerce: new URL("public/parish/features/commerce.js", root),
  koinonia: new URL("public/parish/features/koinonia.js", root),
  onboarding: new URL("public/parish/features/onboarding.js", root),
  campaigns: new URL("public/parish/features/campaigns.js", root),
  stewardship: new URL("public/parish/features/stewardship.js", root),
  giving: new URL("public/parish/features/giving.js", root),
  notifications: new URL("src/lib/parish-notifications.js", root),
};

const [dashboard, registry, core, directory, library, sacraments, accounting, commerce, koinonia, onboarding, campaigns, stewardship, giving, notifications] = await Promise.all(
  Object.values(paths).map((path) => readFile(path, "utf8")),
);

const registryScript = '/parish/feature-registry.js?v=20260831giving1';
const coreScript = '/parish/app.js?';
assert.ok(dashboard.includes(coreScript), 'dashboard core must be loaded');
assert.ok(dashboard.includes(registryScript), 'feature registry must be loaded');
for (const feature of ["directory", "library", "sacraments", "accounting", "commerce", "koinonia", "onboarding", "campaigns", "stewardship", "giving"]) {
  const featureScript = `/parish/features/${feature}.js?`;
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
assert.doesNotMatch(core, /function (loadBookstoreCatalogTab|switchCommerceProduct|loadEventsOversightPanel)/);
assert.match(core, /loadRegisteredParishFeature\('commerce'\)/);
assert.match(commerce, /ParishFeatureRegistry\.register\('commerce'/);
assert.match(core, /function loadSettlementProfilesPanel\(/, 'Giving and Commerce share payment routing in the core');
assert.doesNotMatch(core, /function (loadCommunicationsTab|renderKoinoniaOverview)/);
assert.match(core, /loadRegisteredParishFeature\('koinonia'\)/);
assert.match(koinonia, /ParishFeatureRegistry\.register\('koinonia'/);
assert.match(core, /loadRegisteredParishFeature\('onboarding'\)/);
assert.match(onboarding, /ParishFeatureRegistry\.register\('onboarding'/);
assert.doesNotMatch(core, /function (renderSimpleParishSetupWizard|openGivingSetupWizard|saveGivingSetupWizard|submitTreasurerGoLive)\b/);
assert.doesNotMatch(core, /let givingSetup(Draft|WizardStep)\b/);
assert.doesNotMatch(onboarding, /(?:let|const|var) (currentParish|editableFunds|editableCampaigns)\b/, 'onboarding must use live shared catalogs and parish identity');
assert.match(core, /loadRegisteredParishFeature\('campaigns'\)/);
assert.match(campaigns, /ParishFeatureRegistry\.register\('campaigns'/);
assert.doesNotMatch(core, /function (renderCampaignList|openNewCampaignForm|saveCampaign|uploadCampaignPhoto|postCampaignUpdate)\b/);
assert.doesNotMatch(core, /let (editingCampaignId|campaignCoverUrl|campaignPhotos)\b/);
assert.doesNotMatch(campaigns, /(?:let|const|var) (currentParish|editableFunds|editableCampaigns)\b/, 'campaign management must not cache shared parish or catalog state');
assert.match(core, /loadRegisteredParishFeature\('stewardship'\)/);
assert.match(stewardship, /ParishFeatureRegistry\.register\('stewardship'/);
assert.doesNotMatch(core, /function (loadStewardshipPanel|loadGivingMetricsPanel|loadFinancialSnapshotsPanel|submitManualIncomeEntry|saveStewardshipMeeting|sendNudges)\b/);
assert.doesNotMatch(core, /(?:let|const|var) (stewardshipState|givingMetricsState|financialsState|nudgePreviewData)\b/);
assert.doesNotMatch(stewardship, /(?:let|const|var) (currentParish|parishSessionStorageKey)\b/, 'Stewardship must use the live shared identity and session');
const runtime = await readFile(new URL('public/parish/dashboard-runtime.js', root), 'utf8');
assert.doesNotMatch(runtime, /\bstewardshipState\b/, 'dashboard refresh must use the Stewardship registry contract');
assert.match(runtime, /get\('stewardship'\)\?\.invalidate\(\)/);
assert.match(core, /loadRegisteredParishFeature\('giving', tab\)/);
assert.match(giving, /ParishFeatureRegistry\.register\('giving'/);
assert.doesNotMatch(core, /function (loadGivingHistory|renderGivingSummary|renderGiversPanel|renderGivingOptionsEditor|loadReconciliation|renderQrCode|loadCommemorations|startGivingStatementJob)\b/);
assert.doesNotMatch(core, /(?:let|const|var) (allGifts|manualAccountingGifts|filteredGifts|reconciliationData|editingGivingOption|currentQrSvg|gsJobHistoryLoaded)\b/);
assert.match(runtime, /get\('giving'\)\?\.refresh\(\)/);
assert.doesNotMatch(runtime, /\b(loadGivingHistory|loadGivingSummary|loadRecurringHealth|loadCommemorations|renderQrCode|loadReconciliation)\b/);
for (const name of ['editableFunds', 'editableCampaigns', 'editableFeastCampaigns', 'givingCatalogBaseline', 'accountingCatalogBaseline']) {
  assert.match(core, new RegExp(`let ${name}\\b`), `${name} is shared by Giving, Onboarding, and Accounting`);
}
for (const name of ['authHeaders', 'startSubscriptionCheckout', 'startStripeOnboarding', 'givingCatalogSnapshot', 'isParishTier', 'isParishPlusActive', 'updateStewardshipBadges']) {
  assert.match(core, new RegExp(`function ${name}\\(`), `${name} must remain shared in the core`);
}

const coreStats = await stat(paths.core);
assert.ok(coreStats.size < 460_000, `dashboard core grew past its 460 KB guardrail (${coreStats.size} bytes)`);
assert.ok(core.split(/\r?\n/).length < 2_300, "dashboard core grew past its 2,300-line guardrail");

const notificationStats = await stat(paths.notifications);
assert.doesNotMatch(notifications, /onboardingPdfB64/, "the retired embedded onboarding PDF must not return");
assert.ok(notificationStats.size < 100_000, `notification module grew past its 100 KB guardrail (${notificationStats.size} bytes)`);

console.log("PASS - Parish dashboard feature boundaries and source-size guardrails");
await import('./parish-dashboard-runtime-tests.mjs');
