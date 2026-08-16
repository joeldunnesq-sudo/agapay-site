import assert from "node:assert/strict";
import { Webhook } from "svix";

import { handleResendWebhook } from "../src/handlers/resend-webhook.js";
import { sendDonorDonationReceiptEmail, sendDonorVerificationEmail } from "../src/handlers/donor.js";

const secret = `whsec_${Buffer.from("agapay-resend-webhook-test-secret-32b").toString("base64")}`;
const sentMessages = [];
const kv = new Map();
const env = {
  AGAPAY_APP_URL: "https://agapay.test",
  AGAPAY_FROM_EMAIL: "AGAPAY <onboarding@agapay.test>",
  AGAPAY_REPLY_TO_EMAIL: "support@agapay.test",
  AGAPAY_OPS_ALERT_EMAIL: "ops@agapay.test",
  RESEND_API_KEY: "re_test",
  RESEND_WEBHOOK_SECRET: secret,
  AGAPAY_REGISTRATIONS: {
    async get(key) { return kv.get(key) || null; },
    async put(key, value) { kv.set(key, value); },
  },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  assert.equal(String(url), "https://api.resend.com/emails");
  sentMessages.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: `email_${sentMessages.length}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function signedRequest(event, id = `msg_${crypto.randomUUID()}`) {
  const payload = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  return new Request("https://agapay.test/api/resend/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
    body: payload,
  });
}

try {
  const bounceEvent = {
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "email_original",
      from: "AGAPAY <onboarding@agapay.test>",
      to: ["bounced+agapay@resend.dev"],
      subject: "[TEST] Controlled bounce",
      bounce: { type: "Permanent", subType: "General", message: "Unknown user" },
    },
  };
  const deliveryId = "msg_bounce_once";
  let response = await handleResendWebhook(signedRequest(bounceEvent, deliveryId), env);
  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 1, "a signed bounce must send exactly one operations alert");
  assert.deepEqual(sentMessages[0].to, ["ops@agapay.test"]);
  assert.match(sentMessages[0].subject, /^\[AGAPAY Ops\] Resend delivery alert: Email bounced/);
  assert.match(sentMessages[0].html, /Unknown user/);

  response = await handleResendWebhook(signedRequest(bounceEvent, deliveryId), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  assert.equal(sentMessages.length, 1, "duplicate Svix deliveries must not duplicate the alert");

  const invalid = signedRequest(bounceEvent, "msg_invalid");
  const invalidHeaders = new Headers(invalid.headers);
  invalidHeaders.set("svix-signature", "v1,invalid");
  response = await handleResendWebhook(new Request(invalid.url, { method: "POST", headers: invalidHeaders, body: await invalid.text() }), env);
  assert.equal(response.status, 401, "forged webhook requests must be rejected");
  assert.equal(sentMessages.length, 1);

  response = await handleResendWebhook(signedRequest({
    ...bounceEvent,
    data: { ...bounceEvent.data, subject: "[AGAPAY Ops] Resend delivery alert: Email bounced" },
  }, "msg_loop_guard"), env);
  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 1, "a bounced alert email must not create an alert loop");

  response = await handleResendWebhook(signedRequest({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: "email_delivered", to: ["user@example.test"], subject: "Delivered" },
  }, "msg_non_alert"), env);
  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 1, "non-alert delivery events must be acknowledged without sending mail");

  const verification = await sendDonorVerificationEmail(env, {
    email: "ops@agapay.test",
    donorName: "Diagnostic",
    isDiagnostic: true,
  }, "https://agapay.test/myagapay/verify?diagnostic=1");
  assert.equal(verification.status, "sent");
  assert.match(sentMessages.at(-1).subject, /^\[TEST\]/);
  assert.match(sentMessages.at(-1).html, /No donor account was created/);

  const receipt = await sendDonorDonationReceiptEmail(env, {
    donorEmail: "ops@agapay.test",
    donorName: "Diagnostic",
    parishName: "Diagnostic parish",
    title: "Diagnostic gift",
    amountCents: 100,
    giftAmountCents: 100,
    chargeAmountCents: 100,
    parishNetCents: 97,
    totalFeeCents: 3,
    stripePaymentIntentId: "TEST-NO-CHARGE",
    isDiagnostic: true,
  });
  assert.equal(receipt.status, "sent");
  assert.match(sentMessages.at(-1).subject, /^\[TEST\]/);
  assert.match(sentMessages.at(-1).html, /No payment or donation occurred/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Resend webhook and email diagnostic tests passed.");

