import assert from "node:assert/strict";
import worker from "../src/worker.js";

class MemoryKV {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async put(key, value) {
    this.store.set(key, String(value));
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = "", limit = 100 } = {}) {
    const keys = Array.from(this.store.keys())
      .filter((name) => name.startsWith(prefix))
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

function env() {
  return {
    AGAPAY_REGISTRATIONS: new MemoryKV(),
    AGAPAY_ADMIN_TOKEN: "root-admin-token-for-tests",
    AGAPAY_APP_URL: "https://agapay.test",
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret"
  };
}

function request(path, { method = "GET", body, headers = {} } = {}) {
  return new Request(`https://agapay.test${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function json(response) {
  return response.json();
}

async function stripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

async function postStripeWebhook(testEnv, event) {
  const payload = JSON.stringify(event);
  const signature = await stripeSignature(payload, testEnv.STRIPE_WEBHOOK_SECRET);
  return worker.fetch(new Request("https://agapay.test/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": signature },
    body: payload
  }), testEnv);
}

{
  const testEnv = env();
  const signup = await worker.fetch(request("/api/donor/signup", {
    method: "POST",
    body: {
      donorName: "Faithful Member",
      email: "faithful@example.com",
      password: "correct-horse-battery",
      parishId: "st-test"
    }
  }), testEnv);
  assert.equal(signup.status, 201);
  const donorRaw = await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_donor__faithful@example.com");
  const donor = JSON.parse(donorRaw);
  assert.equal(donor.passwordRecord.version, "pbkdf2-sha256");
  assert.equal(donor.passwordHash, "");

  const blockedLogin = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email: "faithful@example.com", password: "correct-horse-battery" }
  }), testEnv);
  assert.equal(blockedLogin.status, 403);

  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_donor__faithful@example.com", JSON.stringify({
    ...donor,
    emailVerifiedAt: new Date().toISOString()
  }));
  const login = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email: "faithful@example.com", password: "correct-horse-battery" }
  }), testEnv);
  assert.equal(login.status, 200);
  const loginBody = await json(login);
  assert.ok(loginBody.token);

  const sessionDonor = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_donor__faithful@example.com"));
  assert.ok(sessionDonor.sessionExpiresAt);
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_donor__faithful@example.com", JSON.stringify({
    ...sessionDonor,
    sessionExpiresAt: "2000-01-01T00:00:00.000Z"
  }));
  const expired = await worker.fetch(request("/api/donor/dashboard", {
    headers: {
      Authorization: `Bearer ${loginBody.token}`,
      "X-AgaPay-Donor-Email": "faithful@example.com"
    }
  }), testEnv);
  assert.equal(expired.status, 401);
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-REG-TEST",
    status: "verified",
    parishId: "st-test",
    parishName: "St. Test Orthodox Church",
    communityType: "parish",
    givingStatus: "active",
    parishDashboardToken: "temporary-password"
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));

  const passwordUpdate = await worker.fetch(request("/api/admin/password", {
    method: "PATCH",
    headers: { Authorization: "Bearer root-admin-token-for-tests" },
    body: {
      newAdminPassword: "new-secure-admin-password",
      confirmAdminPassword: "new-secure-admin-password"
    }
  }), testEnv);
  assert.equal(passwordUpdate.status, 200);
  const adminPassword = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_admin_password"));
  assert.equal(adminPassword.version, "pbkdf2-sha256");

  const rebuild = await worker.fetch(request("/api/admin/rebuild-indexes", {
    method: "POST",
    headers: { Authorization: "Bearer new-secure-admin-password" }
  }), testEnv);
  assert.equal(rebuild.status, 200);
  assert.equal(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_index_parish_id__st-test"), "AGP-REG-TEST");

  const parish = await worker.fetch(request("/api/parish/dashboard/st-test", {
    headers: { Authorization: "Bearer temporary-password" }
  }), testEnv);
  assert.equal(parish.status, 200);
}

{
  const testEnv = env();
  let limited;
  for (let index = 0; index < 11; index += 1) {
    limited = await worker.fetch(request("/api/donor/login", {
      method: "POST",
      body: { email: "missing@example.com", password: "wrong-password" }
    }), testEnv);
  }
  assert.equal(limited.status, 429);
}

{
  const testEnv = env();
  const event = {
    id: "evt_test_idempotent",
    type: "checkout.session.expired",
    data: {
      object: {
        id: "cs_test_expired",
        mode: "payment",
        payment_status: "unpaid",
        expires_at: Math.floor(Date.now() / 1000)
      }
    }
  };
  const first = await postStripeWebhook(testEnv, event);
  assert.equal(first.status, 200);
  const second = await postStripeWebhook(testEnv, event);
  assert.equal(second.status, 200);
  const secondBody = await json(second);
  assert.equal(secondBody.duplicate, true);
}

{
  const testEnv = env();
  const offeringKey = "__agapay_donor_offering__faithful@example.com:off_pi";
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "off_pi",
    donorEmail: "faithful@example.com",
    parishId: "st-test",
    status: "checkout_created",
    paymentStatus: "pending",
    stripePaymentIntentId: "pi_test_succeeded"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_payment_intent__pi_test_succeeded", offeringKey);

  const response = await postStripeWebhook(testEnv, {
    id: "evt_payment_intent_succeeded",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_succeeded",
        status: "succeeded",
        customer: "cus_test",
        created: Math.floor(Date.now() / 1000)
      }
    }
  });
  assert.equal(response.status, 200);
  const updated = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(updated.status, "completed");
  assert.equal(updated.paymentStatus, "succeeded");
  assert.equal(updated.stripeCustomerId, "cus_test");
}

{
  const testEnv = env();
  const offeringKey = "__agapay_donor_offering__faithful@example.com:off_async";
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "off_async",
    donorEmail: "faithful@example.com",
    parishId: "st-test",
    status: "checkout_created",
    paymentStatus: "pending",
    checkoutSessionId: "cs_async_failed"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_checkout_offering__cs_async_failed", offeringKey);

  const response = await postStripeWebhook(testEnv, {
    id: "evt_checkout_async_failed",
    type: "checkout.session.async_payment_failed",
    data: {
      object: {
        id: "cs_async_failed",
        payment_status: "unpaid",
        payment_intent: "pi_async_failed",
        customer: "cus_test"
      }
    }
  });
  assert.equal(response.status, 200);
  const updated = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(updated.status, "failed");
  assert.equal(updated.paymentStatus, "unpaid");
  assert.equal(updated.stripePaymentIntentId, "pi_async_failed");
}

console.log("AgaPay Worker hardening tests passed.");
