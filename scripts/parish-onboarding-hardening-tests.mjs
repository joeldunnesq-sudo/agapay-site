import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import worker from "../src/worker.js";
import { issueAdminSession, issueParishDashboardSession } from "../src/lib/core.js";
import { issuePlatformUserSession } from "../src/lib/identity.js";
import { acceptInvitation, createInvitation, listMembershipsForParish } from "../src/lib/memberships.js";
import { saveRegistrationRecord, loadRegistrationByReference } from "../src/handlers/parish.js";
import { refreshStripeStatusForRegistration } from "../src/handlers/stripe.js";
import { sendDashboardInvite } from "../src/lib/parish-notifications.js";
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
    parishDashboardTokenTemporary: false,
    parishDashboardPasswordRecord: { version: 1 },
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
    subscriptionTierLabel: "Give +",
    subscriptionStatus: "trialing",
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
  const dashboardSession = await issueParishDashboardSession(registration);
  registration = dashboardSession.registration;
  await saveRegistrationRecord(env, registration.reference, registration);
  return { env, db, registration, priest, treasurer, dashboardToken: dashboardSession.token };
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

function dashboardRequest(fixture, body) {
  return new Request(`https://agapay.test/api/parish/dashboard/${fixture.registration.parishId}/onboarding`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fixture.dashboardToken}`,
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
    const { env } = makeD1Env();
    const trialInvite = await sendDashboardInvite(env, env.AGAPAY_APP_URL, baseRegistration({ subscriptionStatus: "trialing" }));
    assert.equal(trialInvite.access, undefined, "the trial invite must not create personal priest or treasurer credentials");
    const paidInvite = await sendDashboardInvite(env, env.AGAPAY_APP_URL, baseRegistration({ subscriptionStatus: "active" }));
    assert.equal(paidInvite.access?.treasurer?.status, "invited", "the paid phase must create the treasurer's individual invitation");
    assert.equal(paidInvite.access?.priest, undefined, "the paid phase must not require a second priest account");
  }

  {
    const { env } = makeD1Env();
    const registration = baseRegistration();
    await saveRegistrationRecord(env, registration.reference, registration);
    const admin = await issueAdminSession(env, "Stale Admin");
    const response = await worker.fetch(new Request(`https://agapay.test/api/admin/registrations/${registration.reference}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "verified",
        stripeAccountId: "",
        stripeAccountStatus: "not_started"
      })
    }), env);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const stored = await loadRegistrationByReference(env, registration.reference);
    assert.equal(stored.stripeAccountId, registration.stripeAccountId, "a stale Admin form must not erase a parish-created Stripe account ID");
    assert.equal(stored.stripeAccountStatus, registration.stripeAccountStatus, "a stale Admin form must not downgrade server-confirmed Stripe status");
  }

  {
    const { env } = makeD1Env();
    const registration = baseRegistration({
      stripeAccountId: "",
      stripeAccountStatus: "not_started",
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeStatusCheckedAt: "",
      stripeOnboardingLinkCreatedAt: now()
    });
    await saveRegistrationRecord(env, registration.reference, registration);
    const recoveredAccount = stripeAccount({
      metadata: {
        agapay_reference: registration.reference,
        agapay_parish_id: registration.parishId
      }
    });
    nextStripeResponse = { object: "list", data: [recoveredAccount], has_more: false };
    const refreshed = await refreshStripeStatusForRegistration(env, registration.reference, registration);
    assert.equal(refreshed.ok, true);
    assert.equal(refreshed.recovered, true, "refresh must report when it rediscovered an existing Stripe account");
    assert.equal(refreshed.registration.stripeAccountId, recoveredAccount.id);
    assert.equal(refreshed.registration.stripeChargesEnabled, true);
    assert.equal(refreshed.registration.stripePayoutsEnabled, true);
    nextStripeResponse = stripeAccount();
  }

  {
    const fixture = await readyFixture();
    const workflow = await buildParishOnboardingWorkflow(fixture.registration, await workflowOptions(fixture));

    const noIdentity = await worker.fetch(new Request(`https://agapay.test/api/parish/dashboard/${fixture.registration.parishId}/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signoffBody(workflow.materialVersion))
    }), fixture.env);
    assert.equal(noIdentity.status, 401, "Go Live must require an authenticated parish dashboard session");

    const priestResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...fixture.priest, email: fixture.registration.priestEmail }), fixture.env);
    assert.equal(priestResponse.status, 401, "a personal identity token is not a parish dashboard session");

    const other = await acceptRole(fixture.env, "another-parish", "other-treasurer@hardening.test", "treasurer");
    const otherResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...other, email: "other-treasurer@hardening.test" }), fixture.env);
    assert.equal(otherResponse.status, 401, "a membership for another parish must not authorize this parish dashboard");

    const intruder = await acceptRole(fixture.env, fixture.registration.parishId, "intruder@hardening.test", "treasurer");
    const mismatchResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...intruder, email: "intruder@hardening.test" }), fixture.env);
    assert.equal(mismatchResponse.status, 401, "a personal member token must not replace the parish dashboard session");

    const volunteer = await acceptRole(fixture.env, fixture.registration.parishId, "volunteer@hardening.test", "volunteer");
    const volunteerResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion), { ...volunteer, email: "volunteer@hardening.test" }), fixture.env);
    assert.equal(volunteerResponse.status, 401, "an ordinary parish member token must not authorize the parish dashboard");

    fixture.db.prepare("UPDATE parish_memberships SET status = 'revoked' WHERE id = ?").run(fixture.treasurer.membershipId);
    const revokedResponse = await worker.fetch(platformRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(revokedResponse.status, 401, "a revoked member token must not authorize the parish dashboard");
  }

  {
    const fixture = await readyFixture();
    const workflow = await buildParishOnboardingWorkflow(fixture.registration, await workflowOptions(fixture));
    const beforeCalls = stripeCalls;
    nextStripeResponse = stripeAccount();
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(stripeCalls, beforeCalls + 1, "Go Live must freshly retrieve the connected account from Stripe");
    const result = await response.json();
    assert.equal(result.onboarding.state, "LIVE");
    const stored = await loadRegistrationByReference(fixture.env, fixture.registration.reference);
    assert.equal(stored.treasurerSignoff.signerEmail, fixture.registration.treasurerEmail, "browser signerEmail must be ignored");
    assert.equal(stored.treasurerSignoff.authenticationMethod, "parish_dashboard_session");
    assert.equal(stored.treasurerSignoff.platformUserId, undefined);
    assert.equal(stored.treasurerSignoff.membershipId, undefined);
    assert.ok(stored.stripeLastConfirmedAt, "fresh Stripe confirmation time must be persisted");
    const replayCalls = stripeCalls;
    const replay = await worker.fetch(dashboardRequest(fixture, signoffBody(workflow.materialVersion)), fixture.env);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).alreadyLive, true, "Go Live replay must remain idempotent");
    assert.equal(stripeCalls, replayCalls, "an already-complete idempotent replay must not start another publication transaction");
  }

  {
    const fixture = await readyFixture();
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    nextStripeResponse = stripeAccount({ external_accounts: { data: [{ object: "bank_account", bank_name: "New Verified Bank", last4: "7777" }] } });
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(snapshot)), fixture.env);
    assert.equal(response.status, 409);
    const changedPayload = await response.json();
    assert.equal(changedPayload.code, "onboarding_snapshot_changed");
    assert.ok(changedPayload.onboarding?.materialVersion, "the conflict must return the refreshed signoff summary");
    assert.equal(changedPayload.parish?.onboarding?.materialVersion, changedPayload.onboarding.materialVersion);
    const stored = await loadRegistrationByReference(fixture.env, fixture.registration.reference);
    assert.equal(stored.stripePayoutBankLast4, "7777", "latest Stripe payout destination must be persisted before refusing the stale snapshot");
    assert.notEqual(stored.givingStatus, "active");
    const reviewedRetry = await worker.fetch(dashboardRequest(fixture, signoffBody(changedPayload.onboarding.materialVersion)), fixture.env);
    assert.equal(reviewedRetry.status, 200, "the refreshed summary must be launchable after one new review");
  }

  {
    const fixture = await readyFixture({ stripeChargesEnabled: false, stripeAccountStatus: "restricted" });
    nextStripeResponse = stripeAccount({ charges_enabled: false });
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(snapshot, { stripeChargesEnabled: true, stripePayoutsEnabled: true })), fixture.env);
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
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(snapshot)), fixture.env);
    assert.equal(response.status, 409, label);
    assert.equal((await response.json()).code, "onboarding_blocked", `${label} must block launch`);
  }

  {
    const reviewedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const fixture = await readyFixture({ stripeStatusCheckedAt: reviewedAt });
    nextStripeResponse = stripeAccount();
    const snapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(snapshot)), fixture.env);
    assert.equal(response.status, 200, "an unchanged, still-current Stripe review must not create a timestamp-only snapshot conflict");
    const stored = await loadRegistrationByReference(fixture.env, fixture.registration.reference);
    assert.equal(stored.stripeStatusCheckedAt, reviewedAt, "the reviewed snapshot timestamp must remain stable when Stripe details are unchanged");
    assert.ok(stored.stripeLastConfirmedAt, "the mandatory fresh Stripe confirmation must still be audited");
  }

  {
    const fixture = await readyFixture({ stripeStatusCheckedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() });
    nextStripeResponse = stripeAccount();
    const staleSnapshot = await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture));
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(staleSnapshot)), fixture.env);
    assert.equal(response.status, 409);
    const stalePayload = await response.json();
    assert.equal(stalePayload.code, "onboarding_snapshot_changed", "stale cached readiness must be replaced by a new reviewed timestamp");
    assert.ok(stalePayload.onboarding?.materialVersion, "an expired review must return the refreshed summary instead of trapping the browser");
    const reviewedRetry = await worker.fetch(dashboardRequest(fixture, signoffBody(stalePayload.onboarding.materialVersion)), fixture.env);
    assert.equal(reviewedRetry.status, 200, "the expired Stripe review must need only one refreshed confirmation");
  }

  {
    const fixture = await readyFixture();
    stripeFailure = true;
    const response = await worker.fetch(dashboardRequest(fixture, signoffBody(await onboardingMaterialVersion(fixture.registration, await workflowOptions(fixture)))), fixture.env);
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
    assert.equal(prepared.stagingIdentityToken, undefined, "the trial fixture must create only one parish credential");
    assert.equal(prepared.stagingIdentityEmail, undefined, "the trial fixture must not create a separate treasurer login");
    assert.equal(prepared.registration.subscriptionStatus, "trialing");
    assert.equal(prepared.registration.onboardingWorkflow.canGoLive, true);
    const preparedStored = await loadRegistrationByReference(env, registration.reference);
    const preparedDashboardSession = await issueParishDashboardSession(preparedStored);
    await saveRegistrationRecord(env, registration.reference, preparedDashboardSession.registration, preparedStored);
    const stagingLaunch = await worker.fetch(new Request(`https://agapay.test/api/parish/dashboard/${registration.parishId}/onboarding`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${preparedDashboardSession.token}`,
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
