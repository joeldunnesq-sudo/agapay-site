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
    AGAPAY_ENABLED_PRODUCTS: "give,learn",
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

async function adminSession(testEnv, password = "root-admin-token-for-tests") {
  const response = await worker.fetch(request("/api/admin/session", {
    method: "POST",
    body: { password, actor: "Test Admin" }
  }), testEnv);
  assert.equal(response.status, 200);
  return json(response);
}

async function parishSession(testEnv, parishId, password) {
  const response = await worker.fetch(request(`/api/parish/dashboard/${parishId}/session`, {
    method: "POST",
    body: { password }
  }), testEnv);
  assert.equal(response.status, 200);
  return json(response);
}

async function stripeSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
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

async function postStewardshipWebhook(testEnv, event, secret = testEnv.STEWARDSHIP_STRIPE_WEBHOOK_SECRET, timestamp) {
  const payload = JSON.stringify(event);
  const signature = await stripeSignature(payload, secret, timestamp);
  return worker.fetch(new Request("https://agapay.test/webhooks/stewardship", {
    method: "POST",
    headers: { "Stripe-Signature": signature },
    body: payload
  }), testEnv);
}

async function verifiedDonorSession(testEnv, email, password = "correct-horse-battery") {
  const signup = await worker.fetch(request("/api/donor/signup", {
    method: "POST",
    body: {
      donorName: `Test ${email}`,
      email,
      password,
      parishId: "st-test"
    }
  }), testEnv);
  assert.equal(signup.status, 201);
  const donorKey = `__agapay_donor__${email}`;
  const donor = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(donorKey));
  await testEnv.AGAPAY_REGISTRATIONS.put(donorKey, JSON.stringify({
    ...donor,
    emailVerifiedAt: new Date().toISOString()
  }));

  const login = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email, password }
  }), testEnv);
  assert.equal(login.status, 200);
  const body = await json(login);
  assert.ok(body.token);
  return {
    email,
    token: body.token,
    headers: {
      Authorization: `Bearer ${body.token}`,
      "X-AGAPAY-Donor-Email": email
    }
  };
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
  const noAuth = await worker.fetch(request("/api/learn/dashboard"), testEnv);
  assert.equal(noAuth.status, 401);

  const spoofedHeaderOnly = await worker.fetch(request("/api/learn/dashboard", {
    headers: { "X-AGAPAY-Learn-Email": "victim@example.com" }
  }), testEnv);
  assert.equal(spoofedHeaderOnly.status, 401);

  const alpha = await verifiedDonorSession(testEnv, "alpha-learn@example.com");
  const beta = await verifiedDonorSession(testEnv, "beta-learn@example.com");
  const stephanie = await verifiedDonorSession(testEnv, "stephanie@dunncrew.com");

  const alphaDashboard = await worker.fetch(request("/api/learn/dashboard", {
    headers: alpha.headers
  }), testEnv);
  assert.equal(alphaDashboard.status, 200);
  assert.equal((await json(alphaDashboard)).ok, true);

  const alphaSetupPayload = {
    household: { name: "Alpha Household", parishName: "St. Alpha" },
    schoolYear: { label: "2026-2027", startDate: "2026-09-01", endDate: "2027-05-31" },
    term: { id: "term_1", label: "Term 1", startDate: "2026-09-01", endDate: "2026-12-15" },
    preferences: { evaluationModel: "narrative-only", graceModeDefault: "light" },
    children: [{ firstName: "Anna", ageYears: 8, gradeLabel: "Form I" }],
    streams: [{ title: "Morning Basket", streamType: "household", cadenceLabel: "Daily" }],
    subjects: [],
    books: [],
    formation: {},
    formationMaterials: []
  };
  const alphaSave = await worker.fetch(request("/api/learn/setup", {
    method: "POST",
    headers: alpha.headers,
    body: alphaSetupPayload
  }), testEnv);
  assert.equal(alphaSave.status, 200);
  assert.equal((await json(alphaSave)).onboarding.household.name, "Alpha Household");

  const betaRead = await worker.fetch(request("/api/learn/setup", {
    headers: {
      ...beta.headers,
      "X-AGAPAY-Learn-Email": "alpha-learn@example.com"
    }
  }), testEnv);
  assert.equal(betaRead.status, 200);
  assert.notEqual((await json(betaRead)).onboarding.household.name, "Alpha Household");

  const betaSpoofedSave = await worker.fetch(request("/api/learn/setup", {
    method: "POST",
    headers: {
      ...beta.headers,
      "X-AGAPAY-Learn-Email": "alpha-learn@example.com"
    },
    body: {
      ...alphaSetupPayload,
      household: { name: "Beta Household", parishName: "St. Beta" },
      children: [{ firstName: "Ben", ageYears: 10, gradeLabel: "Form II" }]
    }
  }), testEnv);
  assert.equal(betaSpoofedSave.status, 200);

  const alphaAfterSpoof = await worker.fetch(request("/api/learn/setup", {
    headers: alpha.headers
  }), testEnv);
  assert.equal(alphaAfterSpoof.status, 200);
  assert.equal((await json(alphaAfterSpoof)).onboarding.household.name, "Alpha Household");

  const billingHeaderOnly = await worker.fetch(request("/api/learn/billing/status", {
    headers: {
      "X-AGAPAY-Learn-Email": "alpha-learn@example.com",
      "X-AGAPAY-Learn-Plan": "family"
    }
  }), testEnv);
  assert.equal(billingHeaderOnly.status, 401);

  const freeBilling = await worker.fetch(request("/api/learn/billing/status", {
    headers: {
      ...alpha.headers,
      "X-AGAPAY-Learn-Plan": "family"
    }
  }), testEnv);
  assert.equal(freeBilling.status, 200);
  const freeBillingBody = await json(freeBilling);
  assert.equal(freeBillingBody.plan, "free");
  assert.equal(freeBillingBody.fullAccess, false);

  const hardcodedEmailBilling = await worker.fetch(request("/api/learn/billing/status", {
    headers: stephanie.headers
  }), testEnv);
  assert.equal(hardcodedEmailBilling.status, 200);
  assert.equal((await json(hardcodedEmailBilling)).plan, "free");

  testEnv.AGAPAY_LEARN_FULL_ACCESS_EMAILS = "stephanie@dunncrew.com";
  const envAllowlistBilling = await worker.fetch(request("/api/learn/billing/status", {
    headers: stephanie.headers
  }), testEnv);
  assert.equal(envAllowlistBilling.status, 200);
  assert.equal((await json(envAllowlistBilling)).plan, "family");
}

{
  const testEnv = env();
  const signup = await worker.fetch(request("/api/donor/signup", {
    method: "POST",
    body: {
      donorName: "Reset Member",
      email: "reset-member@example.com",
      password: "original-password",
      parishId: "st-test"
    }
  }), testEnv);
  assert.equal(signup.status, 201);
  const donorKey = "__agapay_donor__reset-member@example.com";
  const donor = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(donorKey));
  await testEnv.AGAPAY_REGISTRATIONS.put(donorKey, JSON.stringify({
    ...donor,
    emailVerifiedAt: new Date().toISOString()
  }));

  const login = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email: "reset-member@example.com", password: "original-password" }
  }), testEnv);
  assert.equal(login.status, 200);
  const loginBody = await json(login);
  assert.ok(loginBody.token);

  const resetRequest = await worker.fetch(request("/api/donor/password-reset-request", {
    method: "POST",
    body: { email: "reset-member@example.com" }
  }), testEnv);
  assert.equal(resetRequest.status, 200);
  const resetBody = await json(resetRequest);
  assert.match(resetBody.resetUrl, /\/myagapay\/login\?reset=1/);
  const resetToken = new URL(resetBody.resetUrl).searchParams.get("token");
  assert.ok(resetToken);

  const confirm = await worker.fetch(request("/api/donor/password-reset-confirm", {
    method: "POST",
    body: {
      email: "reset-member@example.com",
      token: resetToken,
      newPassword: "new-secure-password",
      confirmPassword: "new-secure-password"
    }
  }), testEnv);
  assert.equal(confirm.status, 200);

  const oldSession = await worker.fetch(request("/api/donor/dashboard", {
    headers: {
      Authorization: `Bearer ${loginBody.token}`,
      "X-AgaPay-Donor-Email": "reset-member@example.com"
    }
  }), testEnv);
  assert.equal(oldSession.status, 401);

  const oldPassword = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email: "reset-member@example.com", password: "original-password" }
  }), testEnv);
  assert.equal(oldPassword.status, 401);

  const newPassword = await worker.fetch(request("/api/donor/login", {
    method: "POST",
    body: { email: "reset-member@example.com", password: "new-secure-password" }
  }), testEnv);
  assert.equal(newPassword.status, 200);
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

  const bootstrapSession = await adminSession(testEnv);

  const passwordUpdate = await worker.fetch(request("/api/admin/password", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${bootstrapSession.token}` },
    body: {
      newAdminPassword: "new-secure-admin-password",
      confirmAdminPassword: "new-secure-admin-password"
    }
  }), testEnv);
  assert.equal(passwordUpdate.status, 200);
  const adminPassword = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_admin_password"));
  assert.equal(adminPassword.version, "pbkdf2-sha256");

  const invalidatedBootstrapSession = await worker.fetch(request("/api/admin/rebuild-indexes", {
    method: "POST",
    headers: { Authorization: `Bearer ${bootstrapSession.token}` }
  }), testEnv);
  assert.equal(invalidatedBootstrapSession.status, 401);

  const rotatedSession = await adminSession(testEnv, "new-secure-admin-password");

  const rebuild = await worker.fetch(request("/api/admin/rebuild-indexes", {
    method: "POST",
    headers: { Authorization: `Bearer ${rotatedSession.token}` }
  }), testEnv);
  assert.equal(rebuild.status, 200);
  assert.equal(await testEnv.AGAPAY_REGISTRATIONS.get("__agapay_index_parish_id__st-test"), "AGP-REG-TEST");

  const parishLogin = await parishSession(testEnv, "st-test", "temporary-password");

  const parish = await worker.fetch(request("/api/parish/dashboard/st-test", {
    headers: { Authorization: `Bearer ${parishLogin.token}` }
  }), testEnv);
  assert.equal(parish.status, 200);
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-REG-RESET",
    status: "verified",
    parishId: "st-reset",
    parishName: "St. Reset Orthodox Church",
    communityType: "parish",
    givingStatus: "active",
    priestEmail: "priest@st-reset.test",
    treasurerEmail: "treasurer@st-reset.test",
    parishDashboardToken: "original-parish-password"
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));

  const wrongContact = await worker.fetch(request("/api/parish/password-reset-request", {
    method: "POST",
    body: { parishId: "st-reset", email: "stranger@example.com" }
  }), testEnv);
  assert.equal(wrongContact.status, 200);
  assert.equal((await json(wrongContact)).resetUrl, undefined);
  let stored = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(registration.reference));
  assert.equal(stored.parishPasswordResetTokenHash, undefined);

  const session = await parishSession(testEnv, "st-reset", "original-parish-password");
  const resetRequest = await worker.fetch(request("/api/parish/password-reset-request", {
    method: "POST",
    body: { parishId: "st-reset", email: "treasurer@st-reset.test" }
  }), testEnv);
  assert.equal(resetRequest.status, 200);
  const resetBody = await json(resetRequest);
  assert.match(resetBody.resetUrl, /\/parish\/login\?reset=1/);
  const resetToken = new URL(resetBody.resetUrl).searchParams.get("token");
  assert.ok(resetToken);

  const confirm = await worker.fetch(request("/api/parish/password-reset-confirm", {
    method: "POST",
    body: {
      parishId: "st-reset",
      token: resetToken,
      newPassword: "new-parish-password",
      confirmPassword: "new-parish-password"
    }
  }), testEnv);
  assert.equal(confirm.status, 200);
  stored = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(registration.reference));
  assert.equal(stored.parishPasswordResetTokenHash, "");
  assert.deepEqual(stored.parishDashboardSessions, []);

  const oldBearer = await worker.fetch(request("/api/parish/dashboard/st-reset", {
    headers: { Authorization: `Bearer ${session.token}` }
  }), testEnv);
  assert.equal(oldBearer.status, 401);

  const oldPassword = await worker.fetch(request("/api/parish/dashboard/st-reset/session", {
    method: "POST",
    body: { password: "original-parish-password" }
  }), testEnv);
  assert.equal(oldPassword.status, 401);

  const newPassword = await parishSession(testEnv, "st-reset", "new-parish-password");
  assert.ok(newPassword.token);
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
      assert.equal(form.get("success_url"), "https://agapay.test/give/form?parish=st-checkout&success=1&session_id={CHECKOUT_SESSION_ID}");
      assert.equal(form.get("cancel_url"), "https://agapay.test/give/form?parish=st-checkout&canceled=1");
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
    reference: "AGP-CHECKOUT-RECONCILE",
    status: "verified",
    parishId: "st-reconcile",
    parishName: "St. Reconcile Orthodox Church",
    communityType: "parish",
    jurisdiction: "OCA",
    jurisdictionLabel: "OCA",
    city: "Plano",
    state: "TX",
    givingStatus: "active",
    stripeAccountId: "acct_connected_reconcile"
  };
  const offeringKey = "__agapay_donor_offering__giver@example.com:cs_reconcile";
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-reconcile", registration.reference);
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "cs_reconcile",
    donorEmail: "giver@example.com",
    donorName: "Faithful Giver",
    parishId: "st-reconcile",
    parishName: "St. Reconcile Orthodox Church",
    status: "checkout_created",
    paymentStatus: "pending",
    checkoutSessionId: "cs_reconcile",
    createdAt: new Date().toISOString()
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_checkout_offering__cs_reconcile", offeringKey);

  await withMockFetch(async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/v1/checkout/sessions/cs_reconcile")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_reconcile");
      return new Response(JSON.stringify({
        id: "cs_reconcile",
        status: "complete",
        payment_status: "paid",
        customer: "cus_reconcile",
        payment_intent: "pi_reconcile"
      }), { status: 200 });
    }
    if (href.endsWith("/v1/payment_intents/pi_reconcile?expand[]=latest_charge.balance_transaction")) {
      assert.equal(init.headers["Stripe-Account"], "acct_connected_reconcile");
      return new Response(JSON.stringify({
        id: "pi_reconcile",
        amount_received: 2655,
        latest_charge: {
          id: "ch_reconcile",
          amount: 2655,
          application_fee_amount: 48,
          payment_method_details: { type: "card" },
          balance_transaction: {
            id: "txn_reconcile",
            fee: 107,
            net: 2608
          }
        },
        metadata: {
          amount_cents: "2500",
          cover_fees: "true"
        }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const response = await worker.fetch(request("/api/checkout-session-status?session_id=cs_reconcile"), testEnv);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, "completed");
    assert.equal(body.paymentStatus, "paid");
    assert.equal(body.paymentIntentId, "pi_reconcile");
  });

  const offering = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(offering.status, "completed");
  assert.equal(offering.paymentStatus, "paid");
  assert.equal(offering.stripeCustomerId, "cus_reconcile");
  assert.equal(offering.stripePaymentIntentId, "pi_reconcile");
  assert.equal(offering.stripeFeeSource, "balance_transaction");
  assert.equal(offering.paymentMethod, "card");
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
      assert.equal(form.get("line_items[0][price_data][unit_amount]"), "2655");
      assert.equal(form.get("subscription_data[application_fee_percent]"), "1.8079");
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
  assert.equal(offering.chargeCents, 2655);
  assert.equal(offering.agapayFeeCents, 48);
  assert.equal(offering.estimatedStripeFeeCents, 107);
  assert.equal(offering.stripeCustomerId, "cus_recurring_test");
}

{
  const testEnv = env();
  const session = await adminSession(testEnv);
  const releaseStatus = await worker.fetch(request("/api/admin/release-status", {
    headers: { Authorization: `Bearer ${session.token}` }
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
  const session = await parishSession(testEnv, "st-parish-refresh", "refresh-password");

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
      headers: { Authorization: `Bearer ${session.token}` }
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
  assert.equal(updated.paymentStatus, "paid");
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

{
  const testEnv = env();
  const offeringKey = "__agapay_donor_offering__faithful@example.com:off_refund";
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "off_refund",
    donorEmail: "faithful@example.com",
    parishId: "st-test",
    status: "completed",
    paymentStatus: "paid",
    amountCents: 5000,
    chargeCents: 5150,
    stripePaymentIntentId: "pi_test_refund"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_payment_intent__pi_test_refund", offeringKey);

  const partial = await postStripeWebhook(testEnv, {
    id: "evt_charge_partially_refunded",
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_test_partial_refund",
        payment_intent: "pi_test_refund",
        amount: 5150,
        amount_refunded: 1500
      }
    }
  });
  assert.equal(partial.status, 200);
  const partiallyRefunded = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(partiallyRefunded.status, "partially_refunded");
  assert.equal(partiallyRefunded.paymentStatus, "partially_refunded");
  assert.equal(partiallyRefunded.refundedCents, 1500);
  assert.ok(partiallyRefunded.refundedAt);

  const full = await postStripeWebhook(testEnv, {
    id: "evt_charge_fully_refunded",
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_test_full_refund",
        payment_intent: "pi_test_refund",
        amount: 5150,
        amount_refunded: 5150
      }
    }
  });
  assert.equal(full.status, 200);
  const fullyRefunded = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(fullyRefunded.status, "refunded");
  assert.equal(fullyRefunded.paymentStatus, "refunded");
  assert.equal(fullyRefunded.refundedCents, 5150);
}

{
  const testEnv = env();
  const offeringKey = "__agapay_donor_offering__faithful@example.com:off_dispute";
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "off_dispute",
    donorEmail: "faithful@example.com",
    parishId: "st-test",
    status: "completed",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_test_dispute"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_payment_intent__pi_test_dispute", offeringKey);

  const opened = await postStripeWebhook(testEnv, {
    id: "evt_charge_dispute_created",
    type: "charge.dispute.created",
    data: {
      object: {
        id: "dp_test_created",
        payment_intent: "pi_test_dispute",
        amount: 5150,
        reason: "fraudulent",
        status: "needs_response",
        created: 1760000000
      }
    }
  });
  assert.equal(opened.status, 200);
  const disputed = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(disputed.status, "disputed");
  assert.equal(disputed.paymentStatus, "disputed");
  assert.equal(disputed.disputedCents, 5150);
  assert.equal(disputed.disputeReason, "fraudulent");
  assert.ok(disputed.disputedAt);

  const lost = await postStripeWebhook(testEnv, {
    id: "evt_charge_dispute_closed_lost",
    type: "charge.dispute.closed",
    data: {
      object: {
        id: "dp_test_closed_lost",
        payment_intent: "pi_test_dispute",
        amount: 5150,
        status: "lost",
        created: 1760003600
      }
    }
  });
  assert.equal(lost.status, 200);
  const disputeLost = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(disputeLost.status, "dispute_closed");
  assert.equal(disputeLost.paymentStatus, "dispute_closed");
  assert.equal(disputeLost.disputeStatus, "lost");
  assert.ok(disputeLost.disputeClosedAt);
}

{
  const testEnv = env();
  const offeringKey = "__agapay_donor_offering__faithful@example.com:off_dispute_won";
  await testEnv.AGAPAY_REGISTRATIONS.put(offeringKey, JSON.stringify({
    id: "off_dispute_won",
    donorEmail: "faithful@example.com",
    parishId: "st-test",
    status: "disputed",
    paymentStatus: "disputed",
    stripePaymentIntentId: "pi_test_dispute_won"
  }));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_payment_intent__pi_test_dispute_won", offeringKey);

  const won = await postStripeWebhook(testEnv, {
    id: "evt_charge_dispute_closed_won",
    type: "charge.dispute.closed",
    data: {
      object: {
        id: "dp_test_closed_won",
        payment_intent: "pi_test_dispute_won",
        amount: 5150,
        status: "won",
        created: 1760007200
      }
    }
  });
  assert.equal(won.status, 200);
  const disputeWon = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(offeringKey));
  assert.equal(disputeWon.status, "completed");
  assert.equal(disputeWon.paymentStatus, "paid");
  assert.equal(disputeWon.disputeStatus, "won");
}

{
  const testEnv = env();
  const registration = {
    reference: "AGP-STEWARDSHIP-WEBHOOK",
    status: "verified",
    parishId: "st-stewardship-webhook",
    parishName: "St. Stewardship Orthodox Church",
    stewardshipStatus: "no_subscription"
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put("__agapay_index_parish_id__st-stewardship-webhook", registration.reference);

  const event = {
    id: "evt_stewardship_unsigned",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_stewardship_unsigned",
        status: "active",
        customer: "cus_stewardship",
        metadata: { parish_id: "st-stewardship-webhook" }
      }
    }
  };

  const missingSecret = await worker.fetch(new Request("https://agapay.test/webhooks/stewardship", {
    method: "POST",
    body: JSON.stringify(event)
  }), testEnv);
  assert.equal(missingSecret.status, 500);
  const afterMissingSecret = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(registration.reference));
  assert.equal(afterMissingSecret.stewardshipStatus, "no_subscription");

  testEnv.STEWARDSHIP_STRIPE_WEBHOOK_SECRET = "whsec_stewardship_test";
  const stale = await postStewardshipWebhook(
    testEnv,
    { ...event, id: "evt_stewardship_stale" },
    testEnv.STEWARDSHIP_STRIPE_WEBHOOK_SECRET,
    Math.floor(Date.now() / 1000) - 301
  );
  assert.equal(stale.status, 400);
  const afterStale = JSON.parse(await testEnv.AGAPAY_REGISTRATIONS.get(registration.reference));
  assert.equal(afterStale.stewardshipStatus, "no_subscription");
}

console.log("AGAPAY Worker hardening tests passed.");
