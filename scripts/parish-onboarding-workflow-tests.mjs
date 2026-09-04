import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import { readAdminAppSource } from './lib/admin-dashboard-source.mjs';
import { readStewardshipHandlerSource } from './lib/stewardship-handler-source.mjs';
import { readParishHandlerSource } from './lib/parish-handler-source.mjs';
import { readWorkerCompositionSource } from './lib/worker-composition-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../src/worker.js';
import { issueParishDashboardSession, parishIdIndexKey } from '../src/lib/core.js';
import { sanitizePublicRegistrationInput } from '../src/lib/registration-intake.js';
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  TREASURER_AFFIRMATIONS,
  buildParishOnboardingWorkflow,
  invalidateOnboardingSignoffIfChanged,
  onboardingMaterialSnapshot,
  onboardingMaterialVersion,
  recordParishGivingSetupReview,
  requiredPersonalAccessAccepted,
  validateGeneralOperatingFund,
  validateTreasurerGoLiveInput,
} from '../src/lib/parish-onboarding.js';

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

  async list({ prefix = '', limit = 100, cursor } = {}) {
    const names = [...this.store.keys()].filter((name) => name.startsWith(prefix));
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + limit);
    const next = start + page.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: next >= names.length,
      cursor: next >= names.length ? undefined : String(next),
    };
  }
}

const now = new Date().toISOString();
const passedChecks = Object.fromEntries(
  ['authorizedRepresentative', 'givingConfiguration'].map((key) => [
    key,
    { status: 'passed', note: `${key} checked`, evidence: `evidence:${key}` },
  ])
);
passedChecks.importDecision = { status: 'not_applicable', note: 'No historical import requested.' };

function readyRegistration(overrides = {}) {
  return {
    reference: 'AGP-REG-ONBOARDING',
    parishId: 'st-onboarding',
    parishName: 'St. Onboarding Orthodox Church',
    taxLegalName: 'St. Onboarding Orthodox Church',
    status: 'verified',
    givingStatus: 'hidden',
    reviewedBy: 'Canonical Reviewer',
    verificationSource: 'Official diocesan directory',
    bishopOrAuthority: 'Bishop Test',
    dioceseOrDeanery: 'Test Diocese',
    priestEmail: 'priest@example.test',
    treasurerEmail: 'treasurer@example.test',
    onboardingAccess: {
      priest: { status: 'accepted', email: 'priest@example.test', membershipId: 'membership-priest' },
      treasurer: { status: 'accepted', email: 'treasurer@example.test', membershipId: 'membership-treasurer' },
    },
    dashboardInviteEmailStatus: 'sent',
    parishDashboardTokenTemporary: false,
    parishDashboardPasswordRecord: { version: 1 },
    stripeAccountId: 'acct_onboarding',
    stripeAccountStatus: 'payouts_enabled',
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripeDisabledReason: '',
    stripeRequirementsDue: [],
    stripeStatusCheckedAt: now,
    subscriptionTier: 'giving',
    subscriptionTierLabel: 'Give +',
    subscriptionStatus: 'active',
    recurringGivingEnabled: true,
    funds: [
      {
        id: 'general',
        code: 'general',
        name: 'General Operating Fund',
        restrictionType: 'unrestricted',
        isDefault: true,
        enabled: true,
        active: true,
        donorVisible: true,
        givingEnabled: true,
      },
    ],
    campaigns: [],
    feastCampaigns: [],
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    onboardingState: 'AWAITING_TREASURER_SIGNOFF',
    onboardingChecks: passedChecks,
    ...overrides,
  };
}

function signoffBody(registration, snapshotVersion, overrides = {}) {
  return {
    snapshotVersion,
    signerName: 'Jordan Treasurer',
    signerTitle: 'Parish Treasurer',
    signerEmail: registration.treasurerEmail,
    authorityConfirmed: true,
    affirmations: Object.fromEntries(TREASURER_AFFIRMATIONS.map((key) => [key, true])),
    ...overrides,
  };
}

const ready = readyRegistration();
const readyWorkflow = await buildParishOnboardingWorkflow(ready, {
  now: new Date(now).getTime(),
  appUrl: 'https://agapay.test',
  receiptContact: 'support@agapay.test',
});
assert.equal(readyWorkflow.enabled, true);
assert.equal(readyWorkflow.completedSteps, 12);
assert.equal(readyWorkflow.canGoLive, true);
assert.deepEqual(readyWorkflow.blockers, []);
assert.equal(readyWorkflow.summary.givingUrl, 'https://agapay.test/give/st-onboarding');

const payoutsBlocked = await buildParishOnboardingWorkflow(readyRegistration({ stripePayoutsEnabled: false }), {
  now: Date.now(),
});
assert.equal(payoutsBlocked.canGoLive, false);
assert.ok(payoutsBlocked.blockers.some((item) => item.key === 'stripeReady'));

const reviewedWithoutImport = recordParishGivingSetupReview(
  readyRegistration({ onboardingChecks: {} }),
  'none',
  'treasurer@example.test',
  now
);
assert.equal(reviewedWithoutImport.onboardingChecks.givingConfiguration.status, 'passed');
assert.equal(reviewedWithoutImport.onboardingChecks.importDecision.status, 'not_applicable');
const reviewedWithImport = recordParishGivingSetupReview(
  readyRegistration({ onboardingChecks: {} }),
  'requested',
  'treasurer@example.test',
  now
);
assert.equal(reviewedWithImport.onboardingChecks.importDecision.status, 'passed');
assert.match(reviewedWithImport.onboardingChecks.importDecision.note, /requested help importing/);

const staleStripe = await buildParishOnboardingWorkflow(
  readyRegistration({
    stripeStatusCheckedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  }),
  { now: Date.now() }
);
assert.equal(staleStripe.stripe.fresh, false);
assert.equal(staleStripe.canGoLive, false);

const duplicateGeneral = await buildParishOnboardingWorkflow(
  readyRegistration({
    funds: [
      { id: 'general', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: true },
      { id: 'stewardship', name: 'General Stewardship', restrictionType: 'unrestricted' },
    ],
  }),
  { now: Date.now() }
);
assert.ok(duplicateGeneral.blockers.some((item) => item.key === 'generalFund'));

const invalidGeneralCases = [
  ['missing', []],
  [
    'duplicate',
    [
      { id: 'general', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: true },
      { id: 'stewardship', name: 'General Stewardship', restrictionType: 'unrestricted' },
    ],
  ],
  [
    'wrong restriction',
    [{ id: 'general', name: 'General Operating Fund', restrictionType: 'restricted', isDefault: true }],
  ],
  [
    'not default',
    [{ id: 'general', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: false }],
  ],
  [
    'not donor visible',
    [
      {
        id: 'general',
        name: 'General Operating Fund',
        restrictionType: 'unrestricted',
        isDefault: true,
        donorVisible: false,
      },
    ],
  ],
  [
    'unstable identifier',
    [{ id: 'operating', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: true }],
  ],
  [
    'missing accounting mapping',
    [{ id: 'general', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: true }],
  ],
];
for (const [label, funds] of invalidGeneralCases) {
  const registration = readyRegistration({
    funds,
    ...(label === 'missing accounting mapping' ? { subscriptionTier: 'parish' } : {}),
  });
  assert.equal(validateGeneralOperatingFund(registration).passed, false, `${label} must fail General Fund validation`);
}
assert.equal(
  validateGeneralOperatingFund(
    readyRegistration({
      subscriptionTier: 'parish',
      funds: [
        {
          id: 'general',
          name: 'General Operating Fund',
          restrictionType: 'unrestricted',
          isDefault: true,
          accountingFundId: 'fund_general',
        },
      ],
    })
  ).passed,
  true,
  'accounting-enabled parishes must map General Fund to fund_general'
);
assert.equal(
  validateGeneralOperatingFund(
    readyRegistration({
      funds: [
        {
          id: 'stewardship',
          name: 'General Stewardship',
          restrictionType: 'unrestricted',
          isDefault: true,
          enabled: true,
        },
      ],
      generalFundLegacyException: {
        approved: true,
        legacyFundIdentifier: 'stewardship',
        reason: 'Imported stable ID',
        approvedBy: 'migration-admin',
        approvedAt: now,
      },
    })
  ).passed,
  true,
  'an auditable approved legacy General Fund identifier may pass'
);
assert.equal(
  validateGeneralOperatingFund(
    readyRegistration({
      funds: [
        { id: 'general', name: 'General Operating Fund', restrictionType: 'unrestricted', isDefault: true },
        { id: 'building', name: 'Building Fund', restrictionType: 'restricted', isDefault: true },
      ],
    })
  ).passed,
  false,
  'two active default destinations must fail closed'
);

const versionBefore = await onboardingMaterialVersion(ready);
assert.equal(
  onboardingMaterialSnapshot(ready).stripe.statusCheckedAt,
  ready.stripeStatusCheckedAt,
  'the attested snapshot must include the Stripe review timestamp'
);
const versionAfter = await onboardingMaterialVersion(readyRegistration({ recurringGivingEnabled: false }));
assert.notEqual(versionBefore, versionAfter, 'material giving changes must change the snapshot version');

const browserIdentityIgnored = validateTreasurerGoLiveInput(
  signoffBody(ready, versionBefore, { signerEmail: 'other@example.test' }),
  ready,
  { email: 'other@example.test' }
);
assert.equal(browserIdentityIgnored.ok, true, 'a second personal login must not be required for the trial signoff');
assert.equal(
  browserIdentityIgnored.signerEmail,
  ready.treasurerEmail,
  'the registered treasurer email must be the audit authority'
);
const missingTreasurerEmail = validateTreasurerGoLiveInput(
  signoffBody(ready, versionBefore),
  readyRegistration({ treasurerEmail: '' })
);
assert.equal(missingTreasurerEmail.ok, false);
assert.match(missingTreasurerEmail.errors.join(' '), /verified treasurer email/i);

assert.equal(requiredPersonalAccessAccepted(ready), true);
assert.equal(requiredPersonalAccessAccepted(readyRegistration({ onboardingAccess: {} })), false);
assert.equal(
  requiredPersonalAccessAccepted(
    readyRegistration({
      onboardingAccess: {},
      legacySharedAccessAllowed: { approved: true, reason: 'migration', approvedBy: 'admin', approvedAt: now },
    })
  ),
  false,
  'legacy exception is explicit compatibility data, not personal access'
);
const legacyWorkflow = await buildParishOnboardingWorkflow(
  readyRegistration({
    onboardingAccess: {},
    legacySharedAccessAllowed: {
      approved: true,
      reason: 'Pre-membership migration',
      approvedBy: 'migration-admin',
      approvedAt: now,
    },
  }),
  { now: Date.now() }
);
assert.equal(
  legacyWorkflow.steps.find((step) => step.key === 'credential')?.passed,
  true,
  'an explicit audited legacy access exception may satisfy the compatibility gate'
);
const trialWorkflow = await buildParishOnboardingWorkflow(
  readyRegistration({
    subscriptionStatus: 'trialing',
    onboardingAccess: {},
  }),
  { now: Date.now() }
);
assert.equal(
  trialWorkflow.steps.find((step) => step.key === 'credential')?.passed,
  true,
  'one secured parish credential must be enough during the trial'
);
assert.equal(trialWorkflow.canGoLive, true, 'the trial must not require a separate treasurer account before Go Live');
const paidWithoutTreasurer = await buildParishOnboardingWorkflow(readyRegistration({ onboardingAccess: {} }), {
  now: Date.now(),
});
assert.equal(
  paidWithoutTreasurer.steps.find((step) => step.key === 'credential')?.passed,
  false,
  'a paid subscription must require individual treasurer access'
);
const sanitizedRegistration = sanitizePublicRegistrationInput({
  parishName: 'Test',
  legacySharedAccessAllowed: { approved: true, reason: 'self-created', approvedBy: 'submitter', approvedAt: now },
  generalFundLegacyException: { approved: true, legacyFundIdentifier: 'wrong' },
});
assert.equal(
  sanitizedRegistration.legacySharedAccessAllowed,
  undefined,
  'public registration cannot self-create a shared-access exception'
);
assert.equal(
  sanitizedRegistration.generalFundLegacyException,
  undefined,
  'public registration cannot self-create a legacy-fund exception'
);

const signed = readyRegistration({
  givingStatus: 'active',
  onboardingState: 'LIVE',
  treasurerSignoff: { status: 'signed', snapshotVersion: versionBefore },
});
const verifiedHidden = await buildParishOnboardingWorkflow(readyRegistration({ givingStatus: 'hidden' }), {
  now: Date.now(),
});
assert.equal(verifiedHidden.steps.find((step) => step.key === 'verifiedHidden')?.passed, true);
const verifiedActivePreLive = await buildParishOnboardingWorkflow(readyRegistration({ givingStatus: 'active' }), {
  now: Date.now(),
});
assert.equal(verifiedActivePreLive.steps.find((step) => step.key === 'verifiedHidden')?.passed, false);
const verifiedPausedPreLive = await buildParishOnboardingWorkflow(readyRegistration({ givingStatus: 'paused' }), {
  now: Date.now(),
});
assert.equal(verifiedPausedPreLive.steps.find((step) => step.key === 'verifiedHidden')?.passed, false);
const liveLifecycle = await buildParishOnboardingWorkflow(signed, { now: Date.now() });
assert.equal(liveLifecycle.state, 'LIVE');
assert.equal(
  liveLifecycle.blockers.some((item) => item.key === 'verifiedHidden'),
  false,
  'LIVE must not show an impossible hidden-state blocker'
);
const pausedLifecycle = await buildParishOnboardingWorkflow(
  { ...signed, onboardingState: 'PAUSED', givingStatus: 'paused' },
  { now: Date.now() }
);
assert.equal(pausedLifecycle.state, 'PAUSED');
assert.equal(
  pausedLifecycle.blockers.some((item) => item.key === 'verifiedHidden'),
  false,
  'PAUSED must not show an impossible hidden-state blocker'
);
const invalidated = await invalidateOnboardingSignoffIfChanged(
  signed,
  {
    ...signed,
    recurringGivingEnabled: false,
  },
  { actor: 'treasurer@example.test' }
);
assert.equal(invalidated.treasurerSignoff.status, 'invalidated');
assert.equal(invalidated.onboardingState, 'CONFIGURING');
assert.equal(invalidated.givingStatus, 'paused');

const materialMutations = [
  ['legal receipt name', { taxLegalName: 'Renamed Legal Parish' }],
  ['plan', { subscriptionTier: 'starter' }],
  ['billing status', { subscriptionStatus: 'past_due' }],
  ['Stripe account', { stripeAccountId: 'acct_changed' }],
  ['Stripe readiness', { stripePayoutsEnabled: false }],
  ['payout destination', { stripePayoutBankLast4: '9999' }],
  ['General Fund default', { funds: [{ ...signed.funds[0], isDefault: false }] }],
  ['General Fund donor visibility', { funds: [{ ...signed.funds[0], donorVisible: false }] }],
  ['General Fund accounting mapping', { funds: [{ ...signed.funds[0], accountingFundId: 'wrong_fund' }] }],
  [
    'designated funds',
    {
      funds: [...signed.funds, { id: 'building', name: 'Building Fund', restrictionType: 'restricted', enabled: true }],
    },
  ],
  ['campaigns', { campaigns: [{ id: 'appeal', name: 'Appeal', enabled: true }] }],
  ['feast campaigns', { feastCampaigns: [{ id: 'pascha', name: 'Pascha', enabled: true }] }],
];
for (const [label, change] of materialMutations) {
  const result = await invalidateOnboardingSignoffIfChanged(
    signed,
    { ...signed, ...change },
    { actor: 'regression-test' }
  );
  assert.equal(result.treasurerSignoff.status, 'invalidated', `${label} mutation must invalidate the signed snapshot`);
  assert.equal(result.givingStatus, 'paused', `${label} mutation must pause a live parish`);
}

const renamedPublicParish = await invalidateOnboardingSignoffIfChanged(
  signed,
  {
    ...signed,
    parishName: 'Renamed Parish',
  },
  { actor: 'parish-dashboard' }
);
assert.equal(
  renamedPublicParish.treasurerSignoff.status,
  'signed',
  'public parish name edits must preserve the existing signoff'
);
assert.equal(renamedPublicParish.givingStatus, 'active', 'public parish name edits must not pause a live giving page');
assert.equal(renamedPublicParish.onboardingState, 'LIVE', 'public parish name edits must keep onboarding live');
assert.notEqual(
  renamedPublicParish.treasurerSignoff.snapshotVersion,
  versionBefore,
  'the preserved signoff must advance to the renamed snapshot'
);

async function routeFixture(registration = readyRegistration()) {
  const env = {
    AGAPAY_REGISTRATIONS: new MemoryKV(),
    AGAPAY_APP_URL: 'https://agapay.test',
    AGAPAY_REPLY_TO_EMAIL: 'support@agapay.test',
    AGAPAY_ENVIRONMENT: 'test',
  };
  const session = await issueParishDashboardSession(registration);
  await env.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(session.registration));
  await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey(registration.parishId), registration.reference);
  return { env, token: session.token, registration: session.registration };
}

const dashboardFixture = await routeFixture(
  readyRegistration({
    subscriptionStatus: 'trialing',
    onboardingAccess: {},
    stripeAccountId: 'acct_staging_onboarding',
    stripePayoutBankName: 'Test Bank',
    stripePayoutBankLast4: '4242',
    onboardingStripeTestFixture: {
      id: 'acct_staging_onboarding',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: null, currently_due: [] },
      external_accounts: { data: [{ object: 'bank_account', bank_name: 'Test Bank', last4: '4242' }] },
    },
  })
);
const dashboardWorkflow = await buildParishOnboardingWorkflow(dashboardFixture.registration, {
  appUrl: 'https://agapay.test',
  receiptContact: 'support@agapay.test',
});
const dashboardResponse = await worker.fetch(
  new Request('https://agapay.test/api/parish/dashboard/st-onboarding/onboarding', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dashboardFixture.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(signoffBody(dashboardFixture.registration, dashboardWorkflow.materialVersion)),
  }),
  dashboardFixture.env
);
assert.equal(
  dashboardResponse.status,
  200,
  'the authenticated parish dashboard must authorize trial Go Live without a second treasurer login'
);

const [
  parishUi,
  parishStyles,
  parishRedesign,
  adminUi,
  adminStyles,
  stripeHandler,
  subscriptionCheckout,
  parishHandler,
  parishOnboardingHandler,
  workerSource,
  stewardshipHandler,
] = await Promise.all([
  readParishDashboardSource(),
  readFile(new URL('../public/parish/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/parish/redesign.css', import.meta.url), 'utf8'),
  readAdminAppSource(),
  readFile(new URL('../public/admin/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/handlers/stripe.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/subscription-checkout.js', import.meta.url), 'utf8'),
  Promise.resolve(readParishHandlerSource()),
  readFile(new URL('../src/handlers/parish-onboarding.js', import.meta.url), 'utf8'),
  Promise.resolve(readWorkerCompositionSource()),
  Promise.resolve(readStewardshipHandlerSource()),
]);
for (const key of TREASURER_AFFIRMATIONS) {
  assert.match(parishUi, new RegExp(`${key}:`), `parish UI must render the ${key} affirmation`);
}
assert.match(parishUi, /submitTreasurerGoLive/, 'parish UI must submit the locked treasurer signoff snapshot');
// Session and JSON headers are asserted on real requests in parish-onboarding-browser-tests.mjs.
assert.match(
  parishUi,
  /No separate treasurer login is required/,
  'the signoff must explain the one-credential trial model'
);
assert.match(
  parishUi,
  /data\.code === 'onboarding_snapshot_changed'[\s\S]*currentParish\.onboarding = data\.onboarding[\s\S]*renderDashboard\(\)/,
  'a snapshot conflict must replace the stale signoff with the refreshed server summary'
);
assert.match(
  parishUi,
  /Review it, check the confirmations again, and click Go Live/,
  'the refreshed signoff must tell the parish exactly what to do next'
);
assert.match(parishUi, /Paid account security/, 'a live paid parish must receive a clear treasurer-access prompt');
assert.match(
  stripeHandler,
  /becamePaid[\s\S]*sendDashboardInvite/,
  'the trial-to-paid webhook transition must initiate the treasurer account invitation'
);
assert.doesNotMatch(
  parishUi,
  /personal treasurer invitation before launching giving/,
  'Go Live must not require a second treasurer login'
);
assert.match(
  parishOnboardingHandler,
  /verifyParishDashboardBearer\(found\.registration, getBearerToken\(request\)\)/,
  'the server must authenticate Go Live with the parish dashboard session'
);
assert.doesNotMatch(
  parishOnboardingHandler,
  /requireCapability\(request, env, parishId, "parish\.giving\.go_live"\)/,
  'trial Go Live must not require a treasurer membership capability'
);
assert.doesNotMatch(
  parishUi,
  /signerEmail:\s*document\.getElementById\('goLiveSignerEmail'\)/,
  'the browser email field must not be submitted as signer authority'
);
// The browser dashboard suite verifies both completed-launch and paid-access rendering.
assert.match(
  parishUi,
  /isOnboardingLive \? ' is-live' : ''/,
  'the sidebar status must receive an explicit live-state class'
);
assert.match(
  parishStyles,
  /input\[type="checkbox"\][^}]*width: 16px[^}]*padding: 0/,
  'treasurer checkboxes must not inherit full-width text-input sizing'
);
assert.match(
  parishRedesign,
  /sidebar-status-chip\.is-live::before[^}]*#7FCFA0/,
  'the sidebar status light must turn green after Go Live'
);
assert.match(adminUi, /Prepare parish test/, 'admin UI must expose one simple non-production parish setup control');
assert.match(adminUi, /renderOnboardingCommandHeader/, 'admin UI must lead with the onboarding command header');
assert.match(adminUi, /Do this now/, 'admin UI must make the next required action explicit');
assert.match(adminUi, /The parish sees only three steps/, 'admin UI must explain the simplified parish experience');
assert.match(adminStyles, /onboarding-phase-nav/, 'admin UI must expose navigable SOP phases');
assert.match(adminUi, /onboardingCurrentPhase/, 'admin UI must derive one working phase from the first server blocker');
assert.match(adminUi, /Open this step/, 'admin UI must provide one direct route to the required work');
assert.match(
  adminUi,
  /Record priest confirmation of the treasurer/,
  'admin UI must translate the authority gate into the actual verification action'
);
assert.match(
  adminUi,
  /Verify parish and approving priest/,
  'admin identity phase must focus public-source verification on the parish and priest'
);
assert.match(
  adminUi,
  /Do not search for a public treasurer listing/,
  'admin UI must not imply that a treasurer needs a public directory listing'
);
assert.match(
  adminUi,
  /Official parish \/ priest source/,
  'admin UI must identify where authoritative verification belongs'
);
assert.match(
  adminUi,
  /Priest confirms treasurer access/,
  "admin UI must record the verified leader's confirmation of the treasurer"
);
assert.match(
  adminUi,
  /renderOnboardingManualChecks\(onboardingChecks, \['authorizedRepresentative'\]\)/,
  'authority evidence must live in the identity phase'
);
assert.match(
  adminUi,
  /renderOnboardingManualChecks\(onboardingChecks, \['givingConfiguration', 'importDecision'\]\)/,
  'giving and import evidence must live in the configuration phase'
);
assert.match(
  adminStyles,
  /onboarding-phase-card:not\(\.is-current\)[^{]*\{[^}]*padding/,
  'non-current onboarding phases must collapse to compact rows'
);
assert.match(parishUi, /10-minute parish setup/, 'the parish UI must present the setup-time target');
assert.match(parishUi, /Three steps to start giving/, 'the parish UI must present three simple stages');
assert.match(
  parishUi,
  /Where donations go[\s\S]*Parish identity and receipts[\s\S]*Giving choices[\s\S]*AGAPAY plan/,
  'the final parish review must group launch details into four understandable sections'
);
assert.match(
  parishUi,
  /all eight confirmations/,
  'the final approval must explain that every required acknowledgement is retained'
);
assert.match(
  parishUi,
  /openGivingSetupWizard\(\)/,
  'Review giving setup must open the guided modal instead of navigating to a dashboard tab'
);
assert.match(
  parishUi,
  /givingSetupTierDetails/,
  'the giving setup modal must derive its choices from the selected AGAPAY tier'
);
assert.match(
  parishUi,
  /Step 1 of 3[\s\S]*Step 2 of 3[\s\S]*Step 3 of 3/,
  'the giving setup modal must keep a short three-screen sequence'
);
assert.match(parishUi, /givingSetupReviewed:\s*true/, 'saving the giving setup wizard must record the parish review');
assert.match(
  parishUi,
  /importDecision:[\s\S]*requested/,
  'the giving setup wizard must record the parish import decision'
);
assert.doesNotMatch(
  parishUi.match(/async function saveGivingSetupWizard[\s\S]*?async function submitTreasurerGoLive/)?.[0] || '',
  /payload\(\)/,
  'the setup wizard must send a focused payload instead of unrelated dashboard fields'
);
assert.match(
  parishHandler,
  /body\.givingSetupReviewed === true[\s\S]*recordParishGivingSetupReview/,
  'the parish save must complete the giving review gate'
);
assert.match(
  parishHandler,
  /accountingCatalogChanged\s*=\s*catalogChanged\s*&&\s*\(await accountingCatalogRequiredForParish\(env, parishId, current\)\)/,
  'parishes awaiting their first books must be able to save giving setup, while existing books still require synchronization'
);
assert.match(
  parishStyles,
  /\.giving-setup-modal\s*\{[^}]*position:\s*fixed/,
  'the giving setup wizard must render as a modal pop-out'
);
assert.match(
  parishUi,
  /if \(tab === 'funds'\) tab = 'options'/,
  'legacy Funds navigation targets must resolve to the real Funds & Alms tab'
);
assert.match(
  parishUi,
  /if \(!panel\) \{[\s\S]*current page was left open/,
  'unknown dashboard targets must fail safely without blanking the current panel'
);
assert.match(parishUi, /acceptParishAccessInvitation/, 'the parish UI must accept a personal access link');
assert.match(
  adminUi,
  /Send one parish dashboard credential/,
  'admin UI must present one shared credential during the trial'
);
assert.match(
  adminUi,
  /paid subscription requires the treasurer/,
  'admin UI must defer individual treasurer access until the paid phase'
);
assert.match(
  stripeHandler,
  /invalidateAndSaveMaterialRegistration/,
  'Stripe material writes must pass through signoff invalidation'
);
assert.match(
  subscriptionCheckout,
  /persistSubscriptionMaterialChange/,
  'subscription checkout writes must pass through signoff invalidation'
);
assert.match(parishHandler, /The parish subscription tier changed/, 'parish-side plan changes must invalidate signoff');
assert.match(
  parishHandler,
  /Stripe subscription status changed/,
  'parish-side Stripe subscription refresh must invalidate signoff'
);
assert.match(
  workerSource,
  /Stewardship activation changed the giving-fund catalog/,
  'Stewardship fund provisioning must invalidate signoff'
);
assert.match(
  workerSource,
  /The demo seed changed material parish or giving configuration/,
  'demo record material rewrites must invalidate signoff'
);
assert.match(
  stewardshipHandler,
  /Stewardship activation changed the giving-fund catalog/,
  'Stewardship webhook fund provisioning must invalidate signoff'
);

const onboardingSop = await readFile(new URL('../docs/parish-onboarding-go-live-sop.md', import.meta.url), 'utf8');
assert.match(
  onboardingSop,
  /Admin save path forces a newly verified parish to remain `hidden`/,
  'the SOP must describe the enforced verified-hidden safeguard'
);
assert.doesNotMatch(
  onboardingSop,
  /can default a newly verified parish to an active giving status/,
  'the SOP must not retain the stale active-by-default warning'
);

console.log('Parish onboarding workflow tests passed.');
