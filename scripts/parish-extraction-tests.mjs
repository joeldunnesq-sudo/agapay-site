import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as notifications from "../src/lib/parish-notifications.js";
import * as reconciliationModule from "../src/handlers/parish-reconciliation.js";
import * as stripeConnect from "../src/lib/stripe-connect.js";
import * as stripeFees from "../src/lib/stripe-fees.js";

const stripeExports = [
  "MAX_DONATION_CENTS",
  "centsFromAmount",
  "donationAmountError",
  "estimateStripeProcessingFeeCents",
  "estimateStripeAchFeeCents",
  "grossUpForStripeProcessingFeeCents",
  "grossUpForAchFeeCents",
  "checkoutPaymentMethod",
  "checkoutFinancials",
  "offeringFeeBreakdown",
  "donorName",
];

const consolidatedStripeExports = [
  "numericCents",
  "stripeFormRequest",
  "stripeGetRequest",
  "stripeGetConnectedRequest",
  "stripeFormConnectedRequest",
  "stripeAccountStatus",
  "stripeReady",
  "normalizedCheckoutPaymentStatus",
  "checkoutPaymentIntentId",
  "stripeObjectId",
  "booleanFromStripeMetadata",
  "listYtdStripeCharges",
  "summarizeCharges",
];

const notificationExports = [
  "htmlEscape",
  "agapayEmailHtml",
  "generateDashboardToken",
  "startOfYearUnix",
  "monthLabel",
  "sendEmail",
  "loadParishOnboardingGuideAttachment",
  "sendTreasurerStripeInvite",
  "sendDashboardInvite",
  "sendParishPasswordResetEmail",
  "sendRegistrationConfirmation",
  "sendAdminRegistrationNotice",
  "publicSubscriptionTiers",
  "subscriptionReady",
];

assert.deepEqual(Object.keys(stripeFees).sort(), [...stripeExports].sort(), "stripe-fees should expose only parish-specific fee helpers");
assert.deepEqual(
  stripeExports.filter((name) => name in stripeConnect),
  [],
  "parish-specific fee helpers should not have hidden exports in stripe-connect",
);
for (const name of consolidatedStripeExports) {
  assert.ok(name in stripeConnect, `stripe-connect should remain the canonical owner of ${name}`);
}
for (const name of notificationExports) {
  assert.ok(name in notifications, `parish-notifications should export ${name}`);
}
assert.ok(!("stripeReady" in notifications), "parish-notifications should use stripe-connect as the sole stripeReady owner");

assert.equal(stripeFees.centsFromAmount("12.34"), 1234);
assert.equal(stripeFees.donationAmountError(0), "Amount must be greater than zero.");
assert.equal(stripeFees.donorName({ firstName: "Ada", lastName: "Lovelace" }), "Ada Lovelace");
assert.equal(notifications.monthLabel(6), "Jul");
assert.match(notifications.generateDashboardToken(), /^agp_tmp_[a-f0-9]{32}$/);

const originalFetch = globalThis.fetch;
let emailRequest;
globalThis.fetch = async (url, init) => {
  emailRequest = { url, init };
  return new Response(JSON.stringify({ id: "email_test" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  const result = await notifications.sendDashboardInvite(
    { RESEND_API_KEY: "test-key" },
    "https://example.test",
    {
      parishId: "parish-1",
      parishName: "St. Test Parish",
      priestEmail: "pastor@example.test",
    },
  );
  assert.equal(result.status, "sent");
  assert.equal(emailRequest.url, "https://api.resend.com/emails");
  const email = JSON.parse(emailRequest.init.body);
  assert.deepEqual(email.to, ["pastor@example.test"]);
  assert.match(email.subject, /St\. Test Parish/);
  assert.match(email.html, /https:\/\/example\.test/);
} finally {
  globalThis.fetch = originalFetch;
}

const parish = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const reconciliation = await readFile(new URL("../src/handlers/parish-reconciliation.js", import.meta.url), "utf8");
const stripe = await readFile(new URL("../src/handlers/stripe.js", import.meta.url), "utf8");
const donor = await readFile(new URL("../src/handlers/donor.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../src/handlers/admin.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

function importedNames(source, modulePath) {
  const imports = [...source.matchAll(/import\s*{([\s\S]*?)}\s*from "([^"]+)";/g)];
  const match = imports.find((entry) => entry[2] === modulePath);
  assert.ok(match, `expected an import from ${modulePath}`);
  return new Set(match[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean));
}

function assertImports(source, modulePath, names) {
  const imported = importedNames(source, modulePath);
  for (const name of names) {
    assert.ok(imported.has(name), `${modulePath} should supply ${name}`);
  }
}

assert.ok(parish.split(/\r?\n/).length <= 4950, "parish.js should retain the roughly 790-line reconciliation extraction");
assert.doesNotMatch(parish, /export (?:async )?function (?:donorName|sendDashboardInvite)\b/);
assert.doesNotMatch(
  parish,
  /export (?:async )?function (?:normalizedCheckoutPaymentStatus|checkoutPaymentIntentId|stripeObjectId|booleanFromStripeMetadata|listYtdStripeCharges)\b/,
);
assert.match(
  parish,
  /export function summarizeCharges\(charges\)/,
  "parish summarizeCharges should remain until its drift from the canonical monthly output is resolved explicitly",
);
assert.doesNotMatch(reconciliation, /function summarizeCharges\b/, "reconciliation extraction must not absorb giving-summary reporting");
assertImports(parish, "../lib/stripe-connect.js", [
  "booleanFromStripeMetadata",
  "checkoutPaymentIntentId",
  "listYtdStripeCharges",
  "normalizedCheckoutPaymentStatus",
  "numericCents",
  "stripeAccountStatus",
  "stripeFormConnectedRequest",
  "stripeFormRequest",
  "stripeGetConnectedRequest",
  "stripeGetRequest",
  "stripeObjectId",
  "stripeReady",
]);
assertImports(stripe, "../lib/stripe-connect.js", [
  "numericCents",
  "stripeAccountStatus",
  "stripeFormRequest",
  "stripeGetRequest",
  "stripeObjectId",
]);
assertImports(donor, "../lib/stripe-connect.js", [
  "normalizedCheckoutPaymentStatus",
  "stripeAccountStatus",
  "stripeFormConnectedRequest",
  "stripeGetConnectedRequest",
]);
assertImports(admin, "../lib/stripe-connect.js", [
  "listYtdStripeCharges",
  "stripeAccountStatus",
  "stripeFormRequest",
  "stripeReady",
  "summarizeCharges",
]);

const reconciliationPublicFunctions = [
  "listRecentStripePayouts",
  "listStripeBalanceTransactionsForPayout",
  "reconciliationPeriod",
  "listStripePayoutsForPeriod",
  "listRecentStripeBalanceTransactions",
  "handleParishPayoutDiagnostics",
  "handleParishReconciliation",
  "handleParishReconciliationClose",
];
const reconciliationPrivateFunctions = [
  "paymentIntentFromStripeSource",
  "reconciliationAllocation",
  "signedFeeParts",
  "reconciliationCloseRecord",
  "saveReconciliationCloseRecord",
  "paymentIntentForReconciliationTransaction",
];
for (const name of reconciliationPublicFunctions) {
  assert.equal(typeof reconciliationModule[name], "function", `parish-reconciliation should export ${name}`);
}
for (const name of reconciliationPrivateFunctions) {
  assert.match(reconciliation, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `parish-reconciliation should retain private helper ${name}`);
  assert.doesNotMatch(reconciliation, new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`), `${name} should remain private`);
}
for (const name of [...reconciliationPublicFunctions, ...reconciliationPrivateFunctions]) {
  assert.doesNotMatch(parish, new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`), `parish.js should no longer define ${name}`);
}

assertImports(reconciliation, "./parish.js", [
  "findRegistrationByParishId",
  "verifyParishDashboardBearer",
  "loadDonorOfferingByPaymentIntent",
  "loadParishPaidOfferings",
  "giftDisplayName",
]);
assertImports(reconciliation, "../lib/core.js", [
  "d1",
  "hasProductionStore",
  "missingProductionStoreResponse",
  "rateLimit",
  "getBearerToken",
  "unauthorized",
  "json",
  "d1GetSetting",
  "d1SetSetting",
]);
assertImports(reconciliation, "../lib/entitlements.js", ["givingFeatureAccess"]);
assertImports(reconciliation, "../lib/stripe-connect.js", ["stripeObjectId", "stripeGetConnectedRequest"]);
assertImports(worker, "./handlers/parish-reconciliation.js", [
  "handleParishPayoutDiagnostics",
  "handleParishReconciliation",
  "handleParishReconciliationClose",
]);
for (const name of [
  "handleParishPayoutDiagnostics",
  "handleParishReconciliation",
  "handleParishReconciliationClose",
]) {
  assert.ok(!importedNames(worker, "./handlers/parish.js").has(name), `worker should not import ${name} from parish.js`);
}

assert.deepEqual(
  reconciliationModule.reconciliationPeriod("2026-02", new Date("2026-07-30T00:00:00Z")),
  {
    month: "2026-02",
    year: 2026,
    monthNumber: 2,
    label: "February 2026",
    startIso: "2026-02-01T00:00:00.000Z",
    endIso: "2026-03-01T00:00:00.000Z",
    startUnix: 1769904000,
    endUnix: 1772323200,
  },
);
assert.match(stripe, /from "\.\.\/lib\/parish-notifications\.js"/);
assert.match(donor, /from "\.\.\/lib\/stripe-fees\.js"/);
assert.match(admin, /from "\.\.\/lib\/parish-notifications\.js"/);

console.log("Parish extraction tests passed.");
