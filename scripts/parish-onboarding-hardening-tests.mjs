import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import worker from "../src/worker.js";
import { issueAdminSession } from "../src/lib/core.js";
import { issuePlatformUserSession } from "../src/lib/identity.js";
import { acceptInvitation, createInvitation, listMembershipsForParish } from "../src/lib/memberships.js";
import { saveRegistrationRecord, loadRegistrationByReference } from "../src/handlers/parish.js";
import { refreshStripeStatusForRegistration } from "../src/handlers/stripe.js";
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  TREASURER_AFFIRMATIONS,
  buildParishOnboardingWorkflow,
  onboardingMaterialVersion
} from "../src/lib/parish-onboarding.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

class MemoryKV {
  constructor() { this.store = new Map(); }
  async get(key) { return this.store.get(key) ?? null; }
  async put(key, value) { this.store.set(key, String(value)); }
  async delete(key) { this.store.delete(key); }
  async list({ prefix = "", limit = 100, cursor } = {}) {
    const names = [...this.store.keys()].filter((key) => key.startsWith(prefix));
    const start = cursor ? Number(cursor) : 0;
    const keys = names.slice(start, start + limit).map((name) => ({ name }));
    return { keys, list_complete: start + keys.length >= names.length, cursor: String(start + keys.length) };
  }
}

function makeD1Env(environment = "test") {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
      parish_name TEXT, community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
      received_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  db.exec(readFileSync(path.join(root, "migrations", "0014_audit_log.sql"), "utf8"));
  db.exec(readFileSync(path.join(root, "migrations", "0020_platform_identity.sql"), "utf8"));
  const AGAPAY_DB = {
    prepare(sql) {
      return {
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() { return db.prepare(sql).get(...this.params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...this.params), success: true }; },
        async run() {
          const result = db.prepare(sql).run(...this.params);
          return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        }
      };
    }
  };
  return {
    env: {
      AGAPAY_DB,
      AGAPAY_REGISTRATIONS: new MemoryKV(),
      AGAPAY_ENVIRONMENT: environment,
      AGAPAY_APP_URL: "https://agapay.test",
      AGAPAY_REPLY_TO_EMAIL: "support@agapay.test",
      STRIPE_SECRET_KEY: "sk_test_hardening"
    },
    db
  };
}

const now = () => new Date().toISOString();
const passedChecks = () => ({
  authorizedRepresentative: { status: "passed", evidence: "official-source", note: "Priest confirmed treasurer." },
  givingConfiguration: { status: "passed", evidence: "reviewed", note: "Giving catalog reviewed." },
  importDecision: { status: "not_applicable", evidence: "none", note: "No import." }
});

function baseRegistration(overrides = {}) {
  const checkedAt = now();
  return {
    reference: "AGP-REG-HARDENING",
    parishId: "st-hardening",
    parishName: "St. Hardening Orthodox Church",
    taxLegalName: "St. Hardening Orthodox Church",
    communityType: "Parish",
    status: "verified",
    givingStatus: "hidden",
    reviewedBy: "Canonical Reviewer",
    verificationSource: "Official diocesan directory",
    bishopOrAuthority: "Bishop Test",
    dioceseOrDeanery: "Test Diocese",
    priestEmail: "priest@hardening.test",
    treasurerEmail: "treasurer@hardening.test",
    dashboardInviteEmailStatus: "sent",
    stripeAccountId: "acct_live_hardening",
    stripeAccountStatus: "payouts_enabled",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripeDisabledReason: "",
    stripeRequirementsDue: [],
    stripePayoutBankName: "Verified Bank",
    stripePayoutBankLast4: "4242",
    stripeStatusCheckedAt: checkedAt,
    subscriptionTier: "giving",
    subscriptionTierLabel: "Giving Plus",
    subscriptionStatus: "active",
    recurringGivingEnabled: true,
    funds: [{ id: "general", code: "general", name: "General Operating Fund", restrictionType: "unrestricted", isDefault: true, enabled: true, active: true, donorVisible: true, givingEnabled: true }],
    campaigns: [],
    feastCampaigns: [],
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    onboardingState: "AWAITING_TREASURER_SIGNOFF",
    onboardingChecks: passedChecks(),
    receivedAt: checkedAt,
    updatedAt: checkedAt,
    ...overrides
  };
}

async function acceptRole(env, parishId, email, roleTemplate) {
  const invitation = await createInvitation(env, { parishId, email, roleTemplate, invitedByLegacyBearer: true });
  assert.equal(invitation.ok, true, invitation.error);
  const accepted = await acceptInvitation(env, { token: invitation.token, password: "Hardening test password 123", displayName: roleTemplate });
  assert.equal(accepted.ok, true, accepted.error);
  const session = await issuePlatformUserSession(env, accepted.userId);
  return { ...accepted, token: session.token };
}

async function readyFixture(overrides = {}) {
  const { env, db } = makeD1Env();
  let registration = baseRegistration(overrides);
  const priest = await acceptRole(env, registration.parishId, registration.priestEmail, "rector");
  const treasurer = await acceptRole(env, registration.parishId, registration.treasurerEmail, "treasurer");
  registration = {
    ...registration,
    onboardingAccess: {
      priest: { status: "accepted", email: registration.priestEmail, membershipId: priest.membershipId, acceptedAt: priest.acceptedAt },
      treasurer: { status: "accepted", email: registration.treasurerEmail, membershipId: treasurer.membershipId, acceptedAt: treasurer.acceptedAt }
    }
  };
  await saveRegistrationRecord(env, registration.reference, registration);
  return { env, db, registration, priest, treasurer };
}

async function workflowOptions(fixture) {
  return {
    memberships: await listMembershipsForParish(fixture.env, fixture.registration.parishId),
    appUrl: fixture.env.AGAPAY_APP_URL,
    receiptContact: fixture.env.AGAPAY_REPLY_TO_EMAIL
  };
}

function stripeAccount(overrides = {}) {
  return {
    id: "acct_live_hardening",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { disabled_reason: null, currently_due: [] },
    external_accounts: { data: [{ object: "bank_account", bank_name: "Verified Bank", last4: "4242" }] },
    ...overrides
  };
}

function platformRequest(fixture, body, identity = fixture.treasurer) {
  return new Request(`https://agapay.test/api/parish/dashboard/${fixture.registration.parishId}/onboarding`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "X-AGAPAY-User-Email": identity.email,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function signoffBody(snapshotVersion, overrides = {}) {
  return {
    snapshotVersion,
    signerName: "Jordan Treasurer",
    signerTitle: "Parish Treasurer",
    signerEmail: "browser-controlled@example.test",
    authorityConfirmed: true,
    affirmations: Object.fromEntries(TREASURER_AFFIRMATIONS.map((key) => [key, true])),
    ...overrides
  };
}

const originalFetch = globalThis.fetch;
let stripeCalls = 0;
let nextStripeResponse = stripeAccount();
let stripeFailure = false;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.stripe.com/")) {
    stripeCalls++;
    return new Response(JSON.stringify(stripeFailure ? { error: { message: "Stripe unavailable" } } : nextStripeResponse), {
      status: stripeFailure ? 503 : 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return originalFetch(input, init);
};

try {
  {
    const fixture = await readyFixture();
    const workflow = await buildParishOnboardingWorkflow(fixture.registration, await workflowOptions(fixture));

    const noIdentity = await worker.fetch(new Request(`https://agapay.test/api/parish/dashboard/${fixture.registration.parishId}/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signoffBody(workflow.materialVersion))
    }), fixture.env);
    assert.equal(noIdentity.status, 401, "Go Live must require an authenticated platform identity");

    const priestResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...fixture.priest, email: fixture.registration.priestEmail }), fixture.env);
    assert.equal(priestResponse.status, 401, "a priest without the launch capability must not approve Go Live");

    const other = await acceptRole(fixture.env, "another-parish", "other-treasurer@hardening.test", "treasurer");
    const otherResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...other, email: "other-treasurer@hardening.test" }), fixture.env);
    assert.equal(otherResponse.status, 401, "a treasurer membership for another parish must not authorize this parish");

    const intruder = await acceptRole(fixture.env, fixture.registration.parishId, "intruder@hardening.test", "treasurer");
    const mismatchResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...intruder, email: "intruder@hardening.test" }), fixture.env);
    assert.equal(mismatchResponse.status, 403, "the authenticated email must exactly match the registration treasurer");

    const volunteer = await acceptRole(fixture.env, fixture.registration.parishId, "volunteer@hardening.test", "volunteer");
    const volunteerResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...volunteer, email: "volunteer@hardening.test" }), fixture.env);
    assert.equal(volunteerResponse.status, 401, "an ordinary parish member must not approve Go Live");

    fixture.db.prepare("UPDATE parish_memberships SET status = 'revoked' WHERE id = ?").run(fixture.treasurer.membershipId);
    const revokedResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(revokedResponse.status, 401, "a recorded but revoked treasurer membership must fail closed");
  }

  {
    const fixture = await readyFixture();
    const workflow = await buildParishOnboardingWorkflow(fixture.registration, await workflowOptions(fixture));
    const beforeCalls = stripeCalls;
    nextStripeResponse = stripeAccount();
    const response = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(stripeCalls, beforeCalls + 1, "Go Live must freshly retrieve the connected account from Stripe");
    const result = await response.json();
    assert.equal(result.onboarding.state, "LIVE");
    const stored = await loadRegistrationByReference(fixture.env, fixture.registration.reference);
    assert.equal(stored.treasurerSignoff.signerEmail, fixture.registration.treasurerEmail, "browser signerEmail must be ignored");
    assert.equal(stored.treasurerSignoff.platformUserId, fixture.treasurer.userId);
    assert.equal(stored.treasurerSignoff.membershipId, fixture.treasurer.membershipId);
    assert.ok(stored.stripeLastConfirmedAt, "fresh Stripe confirmation time must be persisted");
    const replayCalls = stripeCalls;
    const replay = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).alreadyLive, true, "Go Live replay must remain idempotent");
    assert.equal(stripeCalls, replayCalls, "an already-complete idempotent replay must not start another publication transaction");
  }

  {
    const fixture = await readyFixture();
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    nextStripeResponse = stripeAccount({ external_accounts: { data: [{ object: "bank_account", bank_name: "New Verified Bank", last4: "7777" }] } });
    const response = await worker.fetch(platformRequest(fixture, signoffBody(snapshot)), fixture.env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "onboarding_snapshot_changed");
    const stored = await loadRegistrationByReference(fixture.env, fixture.registration.reference);
    assert.equal(stored.stripePayoutBankLast4, "7777", "latest Stripe payout destination must be persisted before refusing the stale snapshot");
    assert.notEqual(stored.givingStatus, "active");
  }

  {
    const fixture = await readyFixture({ stripeChargesEnabled: false, stripeAccountStatus: "restricted" });
    nextStripeResponse = stripeAccount({ charges_enabled: false });
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(platformRequest(fixture, signoffBody(snapshot, { stripeChargesEnabled: true, stripePayoutsEnabled: true })), fixture.env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "onboarding_blocked", "disabled charges must fail closed after refresh");
  }

  for (const [label, registrationOverrides, accountOverrides] of [
    ["disabled payouts", { stripePayoutsEnabled: false, stripeAccountStatus: "charges_enabled" }, { payouts_enabled: false }],
    ["new currently-due requirement", { stripeRequirementsDue: ["individual.verification.document"], stripeAccountStatus: "restricted" }, { requirements: { disabled_reason: null, currently_due: ["individual.verification.document"] } }]
  ]) {
    const fixture = await readyFixture(registrationOverrides);
    nextStripeResponse = stripeAccount(accountOverrides);
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(platformRequest(fixture, signoffBody(snapshot)), fixture.env);
    assert.equal(response.status, 409, label);
    assert.equal((await response.json()).code, "onboarding_blocked", `${label} must block launch`);
  }

  {
    const fixture = await readyFixture({ stripeStatusCheckedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() });
    nextStripeResponse = stripeAccount();
    const staleSnapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(platformRequest(fixture, signoffBody(staleSnapshot)), fixture.env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "onboarding_snapshot_changed", "stale cached readiness must be replaced by a new reviewed timestamp");
  }

  {
    const fixture = await readyFixture();
    stripeFailure = true;
    const response = await worker.fetch(platformRequest(fixture, signoffBody(await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture)))), fixture.env);
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.code, "stripe_refresh_failed");
    assert.equal(payload.retryable, true);
    stripeFailure = false;
  }

  {
    const { env } = makeD1Env("test");
    const registration = baseRegistration({
      status: "pending",
      reviewedBy: "",
      verificationSource: "",
      bishopOrAuthority: "",
      dioceseOrDeanery: "",
      dashboardInviteEmailStatus: "",
      stripeAccountId: "",
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeStatusCheckedAt: "",
      subscriptionStatus: "not_started",
      onboardingAccess: {}
    });
    await saveRegistrationRecord(env, registration.reference, registration);
    const admin = await issueAdminSession(env, "Hardening Admin");
    const prepare = await worker.fetch(new Request(`https://agapay.test/api/admin/registrations/${registration.reference}/onboarding-test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare_ready" })
    }), env);
    assert.equal(prepare.status, 200, JSON.stringify(await prepare.clone().json()));
    const prepared = await prepare.json();
    assert.ok(prepared.stagingIdentityToken);
    assert.equal(prepared.stagingIdentityEmail, registration.treasurerEmail);
    assert.equal(prepared.registration.onboardingWorkflow.canGoLive, true);
    const stagingLaunch = await worker.fetch(new Request(`https://agapay.test/api/parish/dashboard/${registration.parishId}/onboarding`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prepared.stagingIdentityToken}`,
        "X-AGAPAY-User-Email": prepared.stagingIdentityEmail,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(signoffBody(prepared.registration.onboardingWorkflow.materialVersion))
    }), env);
    assert.equal(stagingLaunch.status, 200, JSON.stringify(await stagingLaunch.clone().json()));

    const productionControl = await worker.fetch(new Request(`https://agapay.test/api/admin/registrations/${registration.reference}/onboarding-test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare_ready" })
    }), { ...env, AGAPAY_ENVIRONMENT: "production" });
    assert.equal(productionControl.status, 403, "production must refuse the staging fixture control");

    const storedPrepared = await loadRegistrationByReference(env, registration.reference);
    const callsBeforeProductionRefresh = stripeCalls;
    nextStripeResponse = { ...storedPrepared.onboardingStripeTestFixture, charges_enabled: false };
    const productionRefresh = await refreshStripeStatusForRegistration(
      { ...env, AGAPAY_ENVIRONMENT: "production" },
      registration.reference,
      storedPrepared
    );
    assert.equal(productionRefresh.ok, true);
    assert.equal(productionRefresh.simulated, false, "production must ignore a persisted staging fixture");
    assert.equal(stripeCalls, callsBeforeProductionRefresh + 1, "production must call Stripe even when a staging-shaped fixture exists");
    assert.equal(productionRefresh.registration.stripeChargesEnabled, false);
  }

  console.log("Parish onboarding hardening tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
