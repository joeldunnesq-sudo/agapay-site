import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as notifications from "../src/lib/parish-notifications.js";
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
const parishSacraments = await readFile(new URL("../src/handlers/parish-sacraments.js", import.meta.url), "utf8");
const parishCommerce = await readFile(new URL("../src/handlers/parish-commerce.js", import.meta.url), "utf8");
const parishReconciliation = await readFile(new URL("../src/handlers/parish-reconciliation.js", import.meta.url), "utf8");
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

assert.ok(parish.split(/\r?\n/).length <= 5750, "parish.js should retain the extraction size reduction");
assert.ok(parish.split(/\r?\n/).length <= 5300, "parish.js should retain the sacraments extraction size reduction");
assert.ok(parish.split(/\r?\n/).length <= 4620, "parish.js should retain the commerce extraction size reduction");
assert.ok(parish.split(/\r?\n/).length <= 3830, "parish.js should retain the reconciliation extraction size reduction");
const sacramentPublicFunctions = [
  "handleAdminSetSacramentsEnabled",
  "sacramentTypeLabel",
  "handleParishSacraments",
  "handleParishSacramentUpdate",
  "handleParishSacramentAvailability",
  "handleParishAvailabilityRuleCreate",
  "handleParishAvailabilityRuleDelete",
  "handleParishAvailabilityBlackoutCreate",
  "handleParishAvailabilityBlackoutDelete",
  "handleParishCommemorations",
];
const sacramentPrivateHelpers = [
  "attachSacramentDetailsForParish",
  "attachSacramentDetailsForParishBatch",
  "notifyDonorOfSacramentStatusChange",
  "parishSacramentRequestRow",
  "isValidTimezone",
  "requireSacramentsParishContext",
  "publicBaptismDetails",
  "publicWeddingDetails",
];
for (const name of [...sacramentPublicFunctions, ...sacramentPrivateHelpers]) {
  assert.doesNotMatch(parish, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `${name} should move out of parish.js`);
  assert.match(parishSacraments, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `${name} should live in parish-sacraments.js`);
}
assertImports(parishSacraments, "./parish.js", [
  "d1All",
  "d1First",
  "d1Run",
  "findRegistrationByParishId",
  "generateSecret",
  "getBearerToken",
  "hasParishPlusAccess",
  "hasProductionStore",
  "json",
  "loadCommemorationEntries",
  "missingProductionStoreResponse",
  "normalizeSacramentPriests",
  "rateLimit",
  "requireAdmin",
  "sacramentsEnabledFor",
  "saveRegistrationRecord",
  "unauthorized",
  "verifyParishDashboardBearer",
  "weekWindow",
]);
assert.doesNotMatch(
  parishSacraments,
  /(?:async\s+)?function\s+normalizeSacramentPriests\b/,
  "parish-sacraments should import normalizeSacramentPriests instead of redefining it",
);
assertImports(worker, "./handlers/parish-sacraments.js", sacramentPublicFunctions);
const parishWorkerImports = importedNames(worker, "./handlers/parish.js");
for (const name of sacramentPublicFunctions) {
  assert.ok(!parishWorkerImports.has(name), `worker should no longer import ${name} from parish.js`);
}
const commercePublicFunctions = [
  "handleParishBookstore",
  "handleParishSettlementProfiles",
  "completeCommerceOrderFromStripe",
  "refundCommerceOrderFromStripe",
  "disputeCommerceOrderFromStripe",
];
for (const name of commercePublicFunctions) {
  assert.doesNotMatch(parish, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `${name} should move out of parish.js`);
  assert.match(parishCommerce, new RegExp(`export\\s+async\\s+function\\s+${name}\\b`), `${name} should live in parish-commerce.js`);
}
for (const name of ["handleParishBookstore", "handleParishSettlementProfiles"]) {
  assert.ok(!parishWorkerImports.has(name), `worker should no longer import ${name} from parish.js`);
}
assertImports(parishCommerce, "./parish.js", [
  "bookstoreEnabledFor",
  "centsFromBody",
  "d1All",
  "d1First",
  "d1Run",
  "findRegistrationByParishId",
  "generateSecret",
  "getBearerToken",
  "hasParishPlusAccess",
  "hasProductionStore",
  "json",
  "missingProductionStoreResponse",
  "normalizeBookstoreBody",
  "parishDashboardPayload",
  "rateLimit",
  "recordAuditEvent",
  "stripePaymentIntentFinancialUpdates",
  "unauthorized",
  "verifyParishDashboardBearer",
]);
assert.doesNotMatch(
  parishCommerce,
  /(?:async\s+)?function\s+(?:stripePaymentIntentFinancialUpdates|parishDashboardPayload)\b/,
  "parish-commerce should import shared parish helpers instead of redefining them",
);
assert.match(
  parish,
  /stripeDisputed:\s*charge\?\.disputed === true/,
  "payment-intent financial updates must expose Stripe's current dispute state",
);
assert.match(
  parishCommerce,
  /const refundedCents = Number\(fees\.stripeRefundedCents[\s\S]*?const paymentStatus = fees\.stripeDisputed[\s\S]*?"disputed"/,
  "commerce completion must preserve dispute/refund state even when lifecycle webhooks race",
);
assertImports(parishCommerce, "../lib/settlement-profiles.js", [
  "SETTLEMENT_PROFILE_TYPES",
  "assignModuleProfile",
  "createSettlementProfile",
  "ensureDefaultCommerceProfile",
  "ensureDefaultGivingProfile",
  "listSettlementProfiles",
  "renameSettlementProfile",
  "setDefaultCommerceProfile",
  "setDefaultGivingProfile",
  "setProfileActive",
  "settlementProfileToJson",
]);
assertImports(parishCommerce, "../lib/stripe-connect.js", [
  "checkoutPaymentIntentId",
  "numericCents",
  "stripeObjectId",
]);
assertImports(worker, "./handlers/parish-commerce.js", [
  "handleParishBookstore",
  "handleParishSettlementProfiles",
]);
assertImports(stripe, "./parish-commerce.js", [
  "completeCommerceOrderFromStripe",
  "disputeCommerceOrderFromStripe",
  "refundCommerceOrderFromStripe",
]);
const stripeParishImports = importedNames(stripe, "./parish.js");
for (const name of ["completeCommerceOrderFromStripe", "disputeCommerceOrderFromStripe", "refundCommerceOrderFromStripe"]) {
  assert.ok(!stripeParishImports.has(name), `stripe should no longer import ${name} from parish.js`);
}
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
const reconciliationPrivateHelpers = [
  "paymentIntentFromStripeSource",
  "reconciliationAllocation",
  "signedFeeParts",
  "reconciliationCloseRecord",
  "saveReconciliationCloseRecord",
  "paymentIntentForReconciliationTransaction",
];
for (const name of [...reconciliationPublicFunctions, ...reconciliationPrivateHelpers]) {
  assert.doesNotMatch(parish, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `${name} should move out of parish.js`);
  assert.match(parishReconciliation, new RegExp(`(?:async\\s+)?function\\s+${name}\\b`), `${name} should live in parish-reconciliation.js`);
}
for (const name of reconciliationPublicFunctions) {
  assert.match(
    parishReconciliation,
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
    `${name} should be exported by parish-reconciliation.js`,
  );
}
assertImports(parishReconciliation, "./parish.js", [
  "findRegistrationByParishId",
  "getBearerToken",
  "giftDisplayName",
  "givingFeatureAccess",
  "hasProductionStore",
  "json",
  "loadDonorOfferingByPaymentIntent",
  "loadParishPaidOfferings",
  "missingProductionStoreResponse",
  "rateLimit",
  "unauthorized",
  "verifyParishDashboardBearer",
]);
assertImports(parishReconciliation, "../lib/core.js", [
  "d1",
  "d1GetSetting",
  "d1SetSetting",
]);
assertImports(parishReconciliation, "../lib/stripe-connect.js", [
  "stripeGetConnectedRequest",
  "stripeObjectId",
]);
assert.doesNotMatch(
  parishReconciliation,
  /(?:async\s+)?function\s+(?:d1|d1GetSetting|d1SetSetting|stripeGetConnectedRequest|stripeObjectId)\b/,
  "parish-reconciliation should import canonical storage and Stripe helpers instead of redefining them",
);
assertImports(worker, "./handlers/parish-reconciliation.js", [
  "handleParishPayoutDiagnostics",
  "handleParishReconciliation",
  "handleParishReconciliationClose",
]);
for (const name of ["handleParishPayoutDiagnostics", "handleParishReconciliation", "handleParishReconciliationClose"]) {
  assert.ok(!parishWorkerImports.has(name), `worker should no longer import ${name} from parish.js`);
}
assert.match(parish, /export function summarizeCharges\b/, "summarizeCharges should remain in parish.js");
assert.doesNotMatch(parishReconciliation, /function\s+summarizeCharges\b/, "parish-reconciliation should not absorb summarizeCharges");
assert.match(donor, /export async function handleParishBookstoreReadiness\b/, "donor bookstore readiness must remain self-contained");
assert.doesNotMatch(donor, /from "\.\/parish-commerce\.js"/, "donor bookstore readiness must not depend on the parish commerce handler");
assert.match(
  donor,
  /stripeFormConnectedRequest\(env,\s*"\/v1\/checkout\/sessions",\s*form,\s*resolved\.registration\.stripeAccountId\)/,
  "bookstore Checkout should remain a direct charge scoped by the connected-account header",
);
assert.doesNotMatch(
  donor,
  /payment_intent_data\[on_behalf_of\]/,
  "direct bookstore charges must not also set on_behalf_of to the same connected account",
);
assert.match(
  donor,
  /"automatic_tax\[enabled\]":\s*"true"[\s\S]*?"customer_update\[address\]":\s*"auto"/,
  "bookstore Checkout must collect and save the customer address required by Stripe automatic tax",
);
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
assert.match(stripe, /from "\.\.\/lib\/parish-notifications\.js"/);
assert.match(donor, /from "\.\.\/lib\/stripe-fees\.js"/);
assert.match(admin, /from "\.\.\/lib\/parish-notifications\.js"/);
assert.match(
  parish,
  /async function createStripeOnboardingSession\([^)]*\)\s*{[\s\S]*?import\("\.\/stripe\.js"\)[\s\S]*?stripeModule\.createStripeOnboardingSession\(/,
  "parish Stripe onboarding should delegate to the extracted Stripe handler instead of calling an undefined helper",
);

console.log("Parish extraction tests passed.");
