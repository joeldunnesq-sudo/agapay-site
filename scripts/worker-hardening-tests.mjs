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
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_WEBHOOK_SECRET_CONNECT: "whsec_connect_test_secret",
    STRIPE_SECRET_KEY: "sk_test_worker_hardening"
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

async function postStripeWebhook(testEnv, event, secret = testEnv.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = await stripeSignature(payload, secret);
  return worker.fetch(new Request("https://agapay.test/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": signature },
    body: payload
  }), testEnv);
}

async function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  testEnv.TURNSTILE_SECRET_KEY = "turnstile-secret";
  testEnv.TURNSTILE_SITE_KEY = "turnstile-site";
  const blocked = await worker.fetch(request("/api/donor/signup", {
    method: "POST",
    body: {
      donorName: "Blocked Member",
      email: "blocked@example.com",
      password: "correct-horse-battery",
      parishId: "st-test"
    }
  }), testEnv);
  assert.equal(blocked.status, 403);
  const blockedBody = await json(blocked);
  assert.match(blockedBody.error, /Security check/);
}

{
  const testEnv = env();
  const config = await worker.fetch(request("/api/security/config"), testEnv);
  assert.equal(config.status, 200);
  assert.equal((await json(config)).turnstileEnabled, false);

  testEnv.TURNSTILE_SECRET_KEY = "turnstile-secret";
  testEnv.TURNSTILE_SITE_KEY = "turnstile-site";
  const enabled = await worker.fetch(request("/api/security/config"), testEnv);
  assert.equal(enabled.status, 200);
  const enabledBody = await json(enabled);
  assert.equal(enabledBody.turnstileEnabled, true);
  assert.equal(enabledBody.turnstileSiteKey, "turnstile-site");
}

{
  const testEnv = env();
  let limited;
  for (let index = 0; index < 21; index += 1) {
    limited = await worker.fetch(request("/api/admin/registrations", {
      headers: { Authorization: "Bearer wrong-admin-password" }
    }), testEnv);
  }
  assert.equal(limited.status, 429);
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-PARISH-RATE",
    status: "verified",
    parishId: "st-rate-limit",
    parishName: "St. Rate Limit Orthodox Church",
    communityType: "parish",
    givingStatus: "active",
    parishDashboardToken: "real-password"
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-rate-limit", registration.reference);
  let limited;
  for (let index = 0; index < 41; index += 1) {
    limited = await worker.fetch(request("/api/parish/dashboard/st-rate-limit", {
      headers: { Authorization: "Bearer wrong-parish-password" }
    }), testEnv);
  }
  assert.equal(limited.status, 429);
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-CHECKOUT",
    status: "verified",
    parishId: "st-checkout",
    parishName: "St. Checkout Orthodox Church",
    communityType: "parish",
    jurisdiction: "OCA",
    jurisdictionLabel: "OCA",
    city: "Dallas",
    state: "TX",
    givingStatus: "active",
    stripeAccountId: "acct_connected_test",
    funds: [{ id: "general", name: "General Fund", description: "General support." }]
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-checkout", registration.reference);

  const calls = [];
  await withMockFetch(async (url, init = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("/v1/customers?")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (href.endsWith("/v1/customers")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_test");
      return new Response(JSON.stringify({ id: "cus_checkout_test" }), { status: 200 });
    }
    if (href.endsWith("/v1/checkout/sessions")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_test");
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("mode"), "payment");
      assert.equal(form.get("payment_intent_data[application_fee_amount]"), "48");
      assert.equal(form.get("metadata[parish_id]"), "st-checkout");
      assert.equal(form.get("metadata[donor_email]"), "giver@example.com");
      return new Response(JSON.stringify({
        id: "cs_checkout_test",
        url: "https://checkout.stripe.test/session"
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const checkout = await worker.fetch(request("/api/create-checkout-session", {
      method: "POST",
      body: {
        parishId: "st-checkout",
        giftType: "stewardship",
        amount: 25,
        frequency: "once",
        firstName: "Faithful",
        lastName: "Giver",
        email: "giver@example.com",
        coverFees: true
      }
    }), testEnv);
    assert.equal(checkout.status, 201);
    const checkoutBody = await json(checkout);
    assert.equal(checkoutBody.id, "cs_checkout_test");
    assert.equal(checkoutBody.url, "https://checkout.stripe.test/session");
  });

  assert.equal(calls.length, 3);
  const offeringRaw = await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_donor_offering__giver@example.com:cs_checkout_test");
  assert.ok(offeringRaw);
  const offering = JSON.parse(offeringRaw);
  assert.equal(offering.status, "checkout_created");
  assert.equal(offering.paymentStatus, "pending");
  assert.equal(offering.amountCents, 2500);
  assert.equal(offering.chargeCents, 2655);
  assert.equal(offering.agapayFeeCents, 48);
  assert.equal(offering.estimatedStripeFeeCents, 107);
  assert.equal(offering.stripeCustomerId, "cus_checkout_test");
  assert.equal(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_checkout_offering__cs_checkout_test"), "__agapay_donor_offering__giver@example.com:cs_checkout_test");
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-CHECKOUT-RECURRING",
    status: "verified",
    parishId: "st-recurring",
    parishName: "St. Recurring Orthodox Church",
    communityType: "parish",
    jurisdiction: "OCA",
    jurisdictionLabel: "OCA",
    city: "Austin",
    state: "TX",
    givingStatus: "active",
    stripeAccountId: "acct_connected_recurring",
    funds: [{ id: "general", name: "General Fund", description: "General support." }]
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-recurring", registration.reference);

  await withMockFetch(async (url, init = {}) => {
    const href = String(url);
    if (href.includes("/v1/customers?")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (href.endsWith("/v1/customers")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_recurring");
      return new Response(JSON.stringify({ id: "cus_recurring_test" }), { status: 200 });
    }
    if (href.endsWith("/v1/checkout/sessions")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_recurring");
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("mode"), "subscription");
      assert.equal(form.get("line_items[0][price_data][unit_amount]"), "2606");
      assert.equal(form.get("subscription_data[application_fee_percent]"), null);
      assert.equal(form.get("payment_intent_data[application_fee_amount]"), null);
      return new Response(JSON.stringify({
        id: "cs_recurring_test",
        url: "https://checkout.stripe.test/recurring"
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const checkout = await worker.fetch(request("/api/create-checkout-session", {
      method: "POST",
      body: {
        parishId: "st-recurring",
        giftType: "stewardship",
        amount: 25,
        frequency: "monthly",
        firstName: "Faithful",
        lastName: "Subscriber",
        email: "subscriber@example.com",
        coverFees: true
      }
    }), testEnv);
    assert.equal(checkout.status, 201);
    const checkoutBody = await json(checkout);
    assert.equal(checkoutBody.id, "cs_recurring_test");
  });

  const offeringRaw = await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_donor_offering__subscriber@example.com:cs_recurring_test");
  assert.ok(offeringRaw);
  const offering = JSON.parse(offeringRaw);
  assert.equal(offering.amountCents, 2500);
  assert.equal(offering.chargeCents, 2606);
  assert.equal(offering.agapayFeeCents, 0);
  assert.equal(offering.stripeCustomerId, "cus_recurring_test");
}

{
  const testEnv = env();
  const releaseStatus = await worker.fetch(request("/api/admin/release-status", {
    headers: { Authorization: "Bearer root-admin-token-for-tests" }
  }), testEnv);
  assert.equal(releaseStatus.status, 200);
  const body = await json(releaseStatus);
  assert.equal(body.ok, true);
  assert.equal(body.releaseStatus.storeMode, "kv");
  assert.equal(body.releaseStatus.productionStoreConfigured, true);
  assert.equal(body.releaseStatus.appUrlConfigured, true);
  assert.equal(body.releaseStatus.adminPasswordConfigured, true);
  assert.equal(body.releaseStatus.stripeConnectWebhookConfigured, true);
}

{
  const testEnv = env();
  const reference = "AGP-PARISH-REFRESH";
  await testEnv.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify({
    reference,
    status: "verified",
    parishId: "st-parish-refresh",
    parishName: "St. Parish Refresh",
    communityType: "parish",
    givingStatus: "active",
    parishDashboardToken: "refresh-password",
    stripeAccountId: "acct_parish_refresh",
    stripeAccountStatus: "onboarding",
    subscriptionStatus: "active"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-parish-refresh", reference);

  await withMockFetch(async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/v1/accounts/acct_parish_refresh")) {
      assert.equal(init.headers.Authorization, "Bearer sk_test_worker_hardening");
      return new Response(JSON.stringify({
        id: "acct_parish_refresh",
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        requirements: {
          currently_due: [],
          disabled_reason: null
        }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const response = await worker.fetch(request("/api/parish/dashboard/st-parish-refresh/stripe-refresh", {
      method: "POST",
      headers: { Authorization: "Bearer refresh-password" }
    }), testEnv);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.parish.stripeAccountStatus, "charges_enabled");
    assert.equal(body.parish.setup.stripeConnected, true);
    assert.equal(body.parish.stripeAccountId, "acct_parish_refresh");
  });
}

{
  const testEnv = env();
  const parishMissingJurisdiction = await worker.fetch(request("/api/registrations", {
    method: "POST",
    body: {
      communityType: "Parish",
      parishName: "St. Missing Jurisdiction",
      addressLine1: "123 Main St",
      city: "Dallas",
      state: "TX",
      postalCode: "75001",
      country: "US",
      priestFirst: "John",
      priestLast: "Priest",
      priestEmail: "priest@example.com",
      treasurerFirst: "Jane",
      treasurerLast: "Treasurer",
      treasurerEmail: "treasurer@example.com",
      subscriptionTier: "parish"
    }
  }), testEnv);
  assert.equal(parishMissingJurisdiction.status, 422);
  const parishBody = await json(parishMissingJurisdiction);
  assert.ok(parishBody.fields.includes("jurisdiction"));

  const businessMissingReviewFields = await worker.fetch(request("/api/registrations", {
    method: "POST",
    body: {
      communityType: "Business",
      parishName: "Orthodox Bookshop",
      addressLine1: "456 Market St",
      city: "Dallas",
      state: "TX",
      postalCode: "75001",
      country: "US",
      priestFirst: "Olivia",
      priestLast: "Owner",
      priestEmail: "owner@example.com",
      treasurerFirst: "Frank",
      treasurerLast: "Finance",
      treasurerEmail: "finance@example.com",
      subscriptionTier: "parish"
    }
  }), testEnv);
  assert.equal(businessMissingReviewFields.status, 422);
  const businessBody = await json(businessMissingReviewFields);
  assert.ok(businessBody.fields.includes("website"));
  assert.ok(businessBody.fields.includes("organizationDescription"));
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
  const reference = "AGP-CONNECT-WEBHOOK";
  await testEnv.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify({
    reference,
    status: "verified",
    parishId: "st-connect-webhook",
    parishName: "St. Connect Webhook",
    givingStatus: "active",
    stripeAccountId: "acct_connect_webhook",
    stripeAccountStatus: "onboarding"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_stripe_account__acct_connect_webhook", reference);

  const response = await postStripeWebhook(testEnv, {
    id: "evt_connect_account_updated",
    type: "account.updated",
    account: "acct_connect_webhook",
    data: {
      object: {
        id: "acct_connect_webhook",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: {
          currently_due: [],
          disabled_reason: null
        }
      }
    }
  }, testEnv.STRIPE_WEBHOOK_SECRET_CONNECT);
  assert.equal(response.status, 200);
  const updated = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(reference));
  assert.equal(updated.stripeAccountStatus, "payouts_enabled");
  assert.equal(updated.stripeChargesEnabled, true);
  assert.equal(updated.stripePayoutsEnabled, true);
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

console.log("AGAPAY Worker hardening tests passed.");
