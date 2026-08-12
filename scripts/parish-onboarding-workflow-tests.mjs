import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/worker.js";
import { issueAdminSession, issueParishDashboardSession, parishIdIndexKey } from "../src/lib/core.js";
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  TREASURER_AFFIRMATIONS,
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  onboardingMaterialVersion,
  validateTreasurerGoLiveInput,
} from "../src/lib/parish-onboarding.js";

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

  async list({ prefix = "", limit = 100, cursor } = {}) {
    const names = [...this.store.keys()].filter((name) => name.startsWith(prefix));
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + limit);
    const next = start + page.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: next >= names.length,
      cursor: next >= names.length ? undefined : String(next)
    };
  }
}

const now = new Date().toISOString();
const passedChecks = Object.fromEntries([
  "authorizedRepresentative",
  "givingConfiguration"
].map((key) => [key, { status: "passed", note: `${key} checked`, evidence: `evidence:${key}` }]));
passedChecks.importDecision = { status: "not_applicable", note: "No historical import requested." };

function readyRegistration(overrides = {}) {
  return {
    reference: "AGP-REG-ONBOARDING",
    parishId: "st-onboarding",
    parishName: "St. Onboarding Orthodox Church",
    taxLegalName: "St. Onboarding Orthodox Church",
    status: "verified",
    givingStatus: "hidden",
    reviewedBy: "Canonical Reviewer",
    verificationSource: "Official diocesan directory",
    bishopOrAuthority: "Bishop Test",
    dioceseOrDeanery: "Test Diocese",
    priestEmail: "priest@example.test",
    treasurerEmail: "treasurer@example.test",
    dashboardInviteEmailStatus: "sent",
    parishDashboardTokenTemporary: false,
    parishDashboardPasswordRecord: { version: 1 },
    stripeAccountId: "acct_onboarding",
    stripeAccountStatus: "payouts_enabled",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripeDisabledReason: "",
    stripeRequirementsDue: [],
    stripeStatusCheckedAt: now,
    subscriptionTier: "giving",
    subscriptionTierLabel: "Giving Plus",
    subscriptionStatus: "active",
    recurringGivingEnabled: true,
    funds: [{ id: "general", name: "General Operating Fund", restrictionType: "unrestricted", enabled: true }],
    campaigns: [],
    feastCampaigns: [],
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    onboardingState: "AWAITING_TREASURER_SIGNOFF",
    onboardingChecks: passedChecks,
    ...overrides
  };
}

function signoffBody(registration, snapshotVersion, overrides = {}) {
  return {
    snapshotVersion,
    signerName: "Jordan Treasurer",
    signerTitle: "Parish Treasurer",
    signerEmail: registration.treasurerEmail,
    authorityConfirmed: true,
    affirmations: Object.fromEntries(TREASURER_AFFIRMATIONS.map((key) => [key, true])),
    ...overrides
  };
}

const ready = readyRegistration();
const readyWorkflow = await buildParishOnboardingWorkflow(ready, {
  now: new Date(now).getTime(),
  appUrl: "https://agapay.test",
  receiptContact: "support@agapay.test"
});
assert.equal(readyWorkflow.enabled, true);
assert.equal(readyWorkflow.completedSteps, 12);
assert.equal(readyWorkflow.canGoLive, true);
assert.deepEqual(readyWorkflow.blockers, []);
assert.equal(readyWorkflow.summary.givingUrl, "https://agapay.test/give/st-onboarding");

const payoutsBlocked = await buildParishOnboardingWorkflow(readyRegistration({ stripePayoutsEnabled: false }), { now: Date.now() });
assert.equal(payoutsBlocked.canGoLive, false);
assert.ok(payoutsBlocked.blockers.some((item) => item.key === "stripeReady"));

const staleStripe = await buildParishOnboardingWorkflow(readyRegistration({
  stripeStatusCheckedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString()
}), { now: Date.now() });
assert.equal(staleStripe.stripe.fresh, false);
assert.equal(staleStripe.canGoLive, false);

const duplicateGeneral = await buildParishOnboardingWorkflow(readyRegistration({
  funds: [
    { id: "general", name: "General Operating Fund" },
    { id: "stewardship", name: "General Stewardship" }
  ]
}), { now: Date.now() });
assert.ok(duplicateGeneral.blockers.some((item) => item.key === "generalFund"));

const versionBefore = await onboardingMaterialVersion(ready);
const versionAfter = await onboardingMaterialVersion(readyRegistration({ recurringGivingEnabled: false }));
assert.notEqual(versionBefore, versionAfter, "material giving changes must change the snapshot version");

const invalidEmail = validateTreasurerGoLiveInput(
  signoffBody(ready, versionBefore, { signerEmail: "other@example.test" }),
  ready
);
assert.equal(invalidEmail.ok, false);
assert.match(invalidEmail.errors.join(" "), /verified treasurer email/i);

const signed = readyRegistration({
  givingStatus: "active",
  onboardingState: "LIVE",
  treasurerSignoff: { status: "signed", snapshotVersion: versionBefore }
});
const invalidated = await invalidateOnboardingSignoffIfChanged(signed, {
  ...signed,
  recurringGivingEnabled: false
}, { actor: "treasurer@example.test" });
assert.equal(invalidated.treasurerSignoff.status, "invalidated");
assert.equal(invalidated.onboardingState, "CONFIGURING");
assert.equal(invalidated.givingStatus, "paused");

async function routeFixture(registration = readyRegistration()) {
  const env = {
    AGAPAY_REGISTRATIONS: new MemoryKV(),
    AGAPAY_APP_URL: "https://agapay.test",
    AGAPAY_REPLY_TO_EMAIL: "support@agapay.test",
    AGAPAY_ENVIRONMENT: "test"
  };
  const session = await issueParishDashboardSession(registration);
  await env.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(session.registration));
  await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(registration.parishId), registration.reference);
  return { env, token: session.token, registration: session.registration };
}

const fixture = await routeFixture();
const fixtureWorkflow = await buildParishOnboardingWorkflow(fixture.registration, {
  appUrl: "https://agapay.test",
  receiptContact: "support@agapay.test"
});
const goLiveResponse = await worker.fetch(new Request(
  "https://agapay.test/api/parish/dashboard/st-onboarding/onboarding",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${fixture.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(signoffBody(fixture.registration, fixtureWorkflow.materialVersion))
  }
), fixture.env);
assert.equal(goLiveResponse.status, 200, JSON.stringify(await goLiveResponse.clone().json()));
const goLive = await goLiveResponse.json();
assert.equal(goLive.parish.givingStatus, "active");
assert.equal(goLive.onboarding.state, "LIVE");
assert.equal(goLive.onboarding.signoff.status, "signed");
const storedLive = JSON.parse(await fixture.env.AGAPAY_REGISTRATIONS.get(fixture.registration.reference));
assert.equal(storedLive.givingStatus, "active");
assert.equal(storedLive.treasurerSignoff.signerEmail, "treasurer@example.test");

const replayResponse = await worker.fetch(new Request(
  "https://agapay.test/api/parish/dashboard/st-onboarding/onboarding",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${fixture.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(signoffBody(storedLive, storedLive.treasurerSignoff.snapshotVersion))
  }
), fixture.env);
assert.equal(replayResponse.status, 200);
assert.equal((await replayResponse.json()).alreadyLive, true, "Go Live replay must be idempotent");

const blockedFixture = await routeFixture(readyRegistration({ stripePayoutsEnabled: false }));
const blockedWorkflow = await buildParishOnboardingWorkflow(blockedFixture.registration, {
  appUrl: "https://agapay.test",
  receiptContact: "support@agapay.test"
});
const blockedResponse = await worker.fetch(new Request(
  "https://agapay.test/api/parish/dashboard/st-onboarding/onboarding",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${blockedFixture.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(signoffBody(blockedFixture.registration, blockedWorkflow.materialVersion))
  }
), blockedFixture.env);
assert.equal(blockedResponse.status, 409);
assert.equal((await blockedResponse.json()).code, "onboarding_blocked");

const stagingFixture = await routeFixture(readyRegistration({
  status: "pending",
  givingStatus: "hidden",
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
  onboardingState: "IDENTITY_REVIEW",
  onboardingChecks: {}
}));
const stagingAdmin = await issueAdminSession(stagingFixture.env, "Workflow Tester");
const prepareResponse = await worker.fetch(new Request(
  "https://agapay.test/api/admin/registrations/AGP-REG-ONBOARDING/onboarding-test",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${stagingAdmin.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare_ready" })
  }
), stagingFixture.env);
assert.equal(prepareResponse.status, 200, JSON.stringify(await prepareResponse.clone().json()));
const prepared = await prepareResponse.json();
assert.ok(prepared.stagingPassword, "staging prepare must return a one-time parish login password");
assert.equal(prepared.registration.onboardingWorkflow.completedSteps, 12);
assert.equal(prepared.registration.onboardingWorkflow.canGoLive, true);
assert.match(prepared.registration.stripeAccountId, /^acct_staging_/);

const stagingLoginResponse = await worker.fetch(new Request(
  "https://agapay.test/api/parish/dashboard/st-onboarding/session",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: prepared.stagingPassword })
  }
), stagingFixture.env);
assert.equal(stagingLoginResponse.status, 200, "the staging password must allow the parish-facing signoff exercise");

const productionEnv = { ...stagingFixture.env, AGAPAY_ENVIRONMENT: "production" };
const productionTestControlResponse = await worker.fetch(new Request(
  "https://agapay.test/api/admin/registrations/AGP-REG-ONBOARDING/onboarding-test",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${stagingAdmin.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare_ready" })
  }
), productionEnv);
assert.equal(productionTestControlResponse.status, 403, "production must refuse staging simulation controls");

const [parishUi, parishStyles, parishRedesign, adminUi, adminStyles] = await Promise.all([
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/style.css", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/redesign.css", import.meta.url), "utf8"),
  readFile(new URL("../public/admin/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/admin/style.css", import.meta.url), "utf8")
]);
for (const key of TREASURER_AFFIRMATIONS) {
  assert.match(parishUi, new RegExp(`${key}:`), `parish UI must render the ${key} affirmation`);
}
assert.match(parishUi, /submitTreasurerGoLive/, "parish UI must submit the locked treasurer signoff snapshot");
assert.match(parishUi, /onboarding\.state==='LIVE'\)\{pane\.innerHTML='';return;/, "the parish launch checklist must disappear after Go Live");
assert.match(parishUi, /isOnboardingLive \? ' is-live' : ''/, "the sidebar status must receive an explicit live-state class");
assert.match(parishStyles, /input\[type="checkbox"\][^}]*width: 16px[^}]*padding: 0/, "treasurer checkboxes must not inherit full-width text-input sizing");
assert.match(parishRedesign, /sidebar-status-chip\.is-live::before[^}]*#7FCFA0/, "the sidebar status light must turn green after Go Live");
assert.match(adminUi, /Prepare parish test/, "admin UI must expose one simple non-production parish setup control");
assert.match(adminUi, /renderOnboardingCommandHeader/, "admin UI must lead with the onboarding command header");
assert.match(adminUi, /Do this now/, "admin UI must make the next required action explicit");
assert.match(adminUi, /The parish sees only three steps/, "admin UI must explain the simplified parish experience");
assert.match(adminStyles, /onboarding-phase-nav/, "admin UI must expose navigable SOP phases");
assert.match(adminUi, /onboardingCurrentPhase/, "admin UI must derive one working phase from the first server blocker");
assert.match(adminUi, /Open this step/, "admin UI must provide one direct route to the required work");
assert.match(adminUi, /Confirm authorized representative/, "admin UI must translate server states into direct operator actions");
assert.match(adminUi, /renderOnboardingManualChecks\(onboardingChecks, \['authorizedRepresentative'\]\)/, "authority evidence must live in the identity phase");
assert.match(adminUi, /renderOnboardingManualChecks\(onboardingChecks, \['givingConfiguration', 'importDecision'\]\)/, "giving and import evidence must live in the configuration phase");
assert.match(adminStyles, /onboarding-phase-card:not\(\.is-current\)[^{]*\{[^}]*padding/, "non-current onboarding phases must collapse to compact rows");
assert.match(parishUi, /10-minute parish setup/, "the parish UI must present the setup-time target");
assert.match(parishUi, /Three steps to start giving/, "the parish UI must present three simple stages");
assert.match(parishUi, /acceptParishAccessInvitation/, "the parish UI must accept a personal access link");
assert.match(adminUi, /Send personal invitations/, "admin UI must send personal access links instead of shared temporary credentials");

console.log("Parish onboarding workflow tests passed.");
