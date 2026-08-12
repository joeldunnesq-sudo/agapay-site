import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {
  REGISTRATION_PRIVACY_NOTICE_VERSION,
  REGISTRATION_TERMS_VERSION,
  sanitizePublicRegistrationInput,
} from "../src/lib/registration-intake.js";

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
    const keys = [...this.store.keys()]
      .filter((name) => name.startsWith(prefix))
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

function testEnv() {
  return {
    AGAPAY_REGISTRATIONS: new MemoryKV(),
    AGAPAY_APP_URL: "https://agapay.test",
    AGAPAY_ENVIRONMENT: "test",
  };
}

function registrationBody(overrides = {}) {
  return {
    communityType: "Parish",
    subscriptionTier: "giving",
    parishName: "St. Boundary Orthodox Church",
    jurisdiction: "Orthodox Church in America",
    addressLine1: "100 Test Avenue",
    addressLine2: "Parish Office",
    city: "Boundary",
    state: "TX",
    postalCode: "78000",
    priestFirst: "Alexis",
    priestEmail: "priest@example.test",
    priestPhone: "210-555-0100",
    treasurerFirst: "Jordan",
    treasurerEmail: "treasurer@example.test",
    acceptingName: "Jordan Test",
    acceptingEmail: "jordan@example.test",
    acceptingRole: "Treasurer",
    canonicalAgreement: true,
    ...overrides,
  };
}

function request(body) {
  return new Request("https://agapay.test/api/registrations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.77",
    },
    body: JSON.stringify(body),
  });
}

const sanitized = sanitizePublicRegistrationInput(registrationBody({
  status: "verified",
  canonicalVerification: "verified",
  parishDashboardToken: "attacker-chosen",
  stripeAccountId: "acct_attacker",
  billingLegalName: "Attacker Billing Entity",
  billingAddressLine1: "999 Attacker Street",
  funds: [{ id: "attacker-fund" }],
  turnstileToken: "transient-security-token",
}));
assert.equal(sanitized.parishName, "St. Boundary Orthodox Church");
assert.equal(sanitized.canonicalAgreement, true);
for (const protectedField of [
  "status",
  "canonicalVerification",
  "parishDashboardToken",
  "stripeAccountId",
  "billingLegalName",
  "billingAddressLine1",
  "funds",
  "turnstileToken",
]) {
  assert.equal(Object.hasOwn(sanitized, protectedField), false, `${protectedField} must remain server-owned`);
}

const missingAgreementEnv = testEnv();
const missingAgreement = await worker.fetch(request(registrationBody({ canonicalAgreement: false })), missingAgreementEnv);
assert.equal(missingAgreement.status, 422);
assert.match((await missingAgreement.json()).error, /agreement/i);
assert.equal([...missingAgreementEnv.AGAPAY_REGISTRATIONS.store.keys()].some((key) => key.startsWith("AGP-REG-")), false);

const routeEnv = testEnv();
const response = await worker.fetch(request(registrationBody({
  status: "verified",
  canonicalVerification: "verified",
  reviewedAt: "2020-01-01T00:00:00.000Z",
  subscriptionStatus: "active",
  subscriptionMonthlyCents: 0,
  stripeAccountId: "acct_attacker",
  stripeSubscriptionId: "sub_attacker",
  billingLegalName: "Attacker Billing Entity",
  billingAddressLine1: "999 Attacker Street",
  parishDashboardToken: "attacker-chosen",
  parishId: "attacker-parish-id",
  parishUsername: "attacker-user",
  campaigns: [{ id: "attacker-campaign" }],
  funds: [{ id: "attacker-fund" }],
  turnstileToken: "transient-security-token",
})), routeEnv);
assert.equal(response.status, 201);

const registrationKey = [...routeEnv.AGAPAY_REGISTRATIONS.store.keys()]
  .find((key) => key.startsWith("AGP-REG-"));
assert.ok(registrationKey, "registration must be persisted under a server-generated reference");
const stored = JSON.parse(await routeEnv.AGAPAY_REGISTRATIONS.get(registrationKey));
assert.equal(stored.reference, registrationKey);
assert.equal(stored.status, "pending");
assert.equal(stored.canonicalVerification, "pending_review");
assert.equal(stored.subscriptionStatus, "not_started");
assert.equal(stored.billingLegalName, "St. Boundary Orthodox Church");
assert.equal(stored.billingAddressLine1, "100 Test Avenue");
assert.equal(stored.billingAddressLine2, "Parish Office");
assert.equal(stored.billingCity, "Boundary");
assert.equal(stored.billingState, "TX");
assert.equal(stored.billingPostalCode, "78000");
assert.equal(stored.billingCountry, "US");
assert.notEqual(stored.parishDashboardToken, "attacker-chosen");
assert.notEqual(stored.parishId, "attacker-parish-id");
assert.equal(stored.canonicalAgreement, true);
assert.equal(stored.termsVersion, REGISTRATION_TERMS_VERSION);
assert.equal(stored.privacyNoticeVersion, REGISTRATION_PRIVACY_NOTICE_VERSION);
assert.equal(stored.termsAcceptedAt, stored.receivedAt);
assert.equal(stored.privacyNoticeAcknowledgedAt, stored.receivedAt);
assert.equal(stored.agreementSource, "church_registration");
const legalAcceptanceKey = [...routeEnv.AGAPAY_REGISTRATIONS.store.keys()]
  .find((key) => key.startsWith("legal_acceptance:"));
assert.ok(legalAcceptanceKey, "registration must preserve a separate legal acceptance record");
const legalAcceptance = JSON.parse(await routeEnv.AGAPAY_REGISTRATIONS.get(legalAcceptanceKey));
assert.equal(legalAcceptance.organizationId, stored.parishId);
assert.equal(legalAcceptance.actorName, "Jordan Test");
assert.equal(legalAcceptance.actorEmail, "jordan@example.test");
assert.equal(legalAcceptance.actorRole, "Treasurer");
assert.equal(legalAcceptance.acceptanceSource, "church_registration");
assert.equal(legalAcceptance.transactionReference, stored.reference);
assert.equal(legalAcceptance.ipAddress, "203.0.113.77");
assert.match(legalAcceptance.termsSha256, /^[a-f0-9]{64}$/);
for (const protectedField of [
  "reviewedAt",
  "stripeAccountId",
  "stripeSubscriptionId",
  "campaigns",
  "turnstileToken",
]) {
  assert.equal(Object.hasOwn(stored, protectedField), false, `${protectedField} must not be accepted from public input`);
}
assert.equal(stored.funds?.some((fund) => fund.id === "attacker-fund"), false, "server-generated funds must replace public input");

const monasteryWithoutJurisdiction = await worker.fetch(request(registrationBody({
  communityType: "Monastery",
  subscriptionTier: "monastery_free",
  jurisdiction: "",
  parishName: "Test Monastery",
})), testEnv());
assert.equal(monasteryWithoutJurisdiction.status, 422);
assert.deepEqual((await monasteryWithoutJurisdiction.json()).fields, ["jurisdiction"]);

console.log("Public registration boundary tests passed.");
