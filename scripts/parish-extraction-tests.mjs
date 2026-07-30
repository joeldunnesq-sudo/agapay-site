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

console.log("Parish extraction tests passed.");
