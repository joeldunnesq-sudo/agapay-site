import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as notifications from "../src/lib/parish-notifications.js";
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
  "numericCents",
  "offeringFeeBreakdown",
  "donorName",
  "stripeFormRequest",
  "stripeGetRequest",
  "stripeGetConnectedRequest",
  "stripeFormConnectedRequest",
  "stripeAccountStatus",
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
  "stripeReady",
  "subscriptionReady",
];

for (const name of stripeExports) {
  assert.ok(name in stripeFees, `stripe-fees should export ${name}`);
}
for (const name of notificationExports) {
  assert.ok(name in notifications, `parish-notifications should export ${name}`);
}

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
const stripe = await readFile(new URL("../src/handlers/stripe.js", import.meta.url), "utf8");
const donor = await readFile(new URL("../src/handlers/donor.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../src/handlers/admin.js", import.meta.url), "utf8");

assert.ok(parish.split(/\r?\n/).length <= 5750, "parish.js should retain the extraction size reduction");
assert.doesNotMatch(parish, /export (?:async )?function (?:donorName|sendDashboardInvite)\b/);
assert.match(stripe, /from "\.\.\/lib\/stripe-fees\.js"/);
assert.match(stripe, /from "\.\.\/lib\/parish-notifications\.js"/);
assert.match(donor, /from "\.\.\/lib\/stripe-fees\.js"/);
assert.match(admin, /from "\.\.\/lib\/parish-notifications\.js"/);

console.log("Parish extraction tests passed.");
