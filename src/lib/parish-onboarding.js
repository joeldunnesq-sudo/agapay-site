import { normalizeEmail, sha256Hex } from "./core.js";
import { subscriptionReady, subscriptionTier } from "./subscriptions.js";

export const PARISH_ONBOARDING_WORKFLOW_VERSION = 1;
export const STRIPE_READINESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const ONBOARDING_MANUAL_CHECKS = Object.freeze([
  "authorizedRepresentative",
  "givingConfiguration",
  "users",
  "importDecision",
  "testGift",
  "receipt",
  "reportingAccounting",
  "givingAssets"
]);

export const TREASURER_AFFIRMATIONS = Object.freeze([
  "stripeAccount",
  "payoutBank",
  "organizationName",
  "generalFund",
  "designatedFunds",
  "recurringGiving",
  "receiptDetails",
  "agapayPlan"
]);

const MANUAL_STATUSES = new Set(["not_started", "in_progress", "blocked", "passed", "not_applicable"]);
const GENERAL_FUND_KEYS = new Set(["general", "stewardship", "general operating fund", "general stewardship"]);

function text(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function activeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && item.enabled !== false && item.active !== false);
}

function isGeneralFund(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => text(value, 160).toLowerCase())
    .some((value) => GENERAL_FUND_KEYS.has(value));
}

function publicFund(item = {}) {
  return {
    id: text(item.id || item.code || item.name, 160),
    name: text(item.name || item.label, 160),
    description: text(item.description, 500),
    restrictionType: text(item.restrictionType || item.restriction_type || "unrestricted", 80),
    accountNumber: text(item.accountNumber || item.account_number, 40),
    status: text(item.status || (item.enabled === false || item.active === false ? "disabled" : "active"), 40)
  };
}

function publicCampaign(item = {}) {
  return {
    ...publicFund(item),
    goalCents: Number(item.goalCents || 0),
    destinationFundId: text(item.destinationFundId, 160)
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function step(key, title, passed, detail, owner = "AGAPAY") {
  return {
    key,
    title,
    status: passed ? "passed" : "blocked",
    passed: Boolean(passed),
    detail,
    owner
  };
}

function manualPassed(checks, key) {
  const status = checks[key]?.status || "not_started";
  return status === "passed" || (key === "importDecision" && status === "not_applicable");
}

function validDate(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function stripeReadiness(registration = {}, now = Date.now()) {
  const checkedAt = validDate(registration.stripeStatusCheckedAt);
  const fresh = checkedAt > 0 && now - checkedAt <= STRIPE_READINESS_MAX_AGE_MS;
  const requirements = Array.isArray(registration.stripeRequirementsDue) ? registration.stripeRequirementsDue : [];
  return {
    connected: Boolean(text(registration.stripeAccountId, 255)),
    chargesEnabled: registration.stripeChargesEnabled === true,
    payoutsEnabled: registration.stripePayoutsEnabled === true,
    detailsSubmitted: registration.stripeDetailsSubmitted === true,
    noDisabledReason: !text(registration.stripeDisabledReason, 500),
    noRequirementsDue: requirements.length === 0,
    checkedAt: registration.stripeStatusCheckedAt || "",
    fresh,
    ready: Boolean(
      text(registration.stripeAccountId, 255)
      && registration.stripeChargesEnabled === true
      && registration.stripePayoutsEnabled === true
      && registration.stripeDetailsSubmitted === true
      && !text(registration.stripeDisabledReason, 500)
      && requirements.length === 0
      && fresh
    )
  };
}

export function onboardingWorkflowEnabled(registration = {}) {
  return Number(registration.onboardingWorkflowVersion || 0) >= PARISH_ONBOARDING_WORKFLOW_VERSION;
}

export function normalizeOnboardingChecks(input = {}, current = {}, actor = "AGAPAY Admin", now = new Date().toISOString()) {
  const existing = current && typeof current === "object" ? current : {};
  const submitted = input && typeof input === "object" ? input : {};
  const normalized = {};

  for (const key of ONBOARDING_MANUAL_CHECKS) {
    const prior = existing[key] && typeof existing[key] === "object" ? existing[key] : {};
    const next = submitted[key] && typeof submitted[key] === "object" ? submitted[key] : null;
    const requestedStatus = text(next?.status || prior.status || "not_started", 40).toLowerCase();
    const status = MANUAL_STATUSES.has(requestedStatus) ? requestedStatus : "not_started";
    const allowedStatus = status === "not_applicable" && key !== "importDecision" ? "not_started" : status;
    const note = text(next?.note ?? prior.note, 1200);
    const evidence = text(next?.evidence ?? prior.evidence, 1000);
    const changed = Boolean(next) && (allowedStatus !== prior.status || note !== text(prior.note, 1200) || evidence !== text(prior.evidence, 1000));
    normalized[key] = {
      status: allowedStatus,
      note,
      evidence,
      updatedAt: changed ? now : prior.updatedAt || "",
      updatedBy: changed ? text(actor, 160) : prior.updatedBy || ""
    };
  }

  return normalized;
}

export function onboardingMaterialSnapshot(registration = {}, options = {}) {
  const funds = activeItems(registration.funds);
  const generalFunds = funds.filter(isGeneralFund);
  const designatedFunds = funds.filter((fund) => !isGeneralFund(fund));
  const plan = subscriptionTier(registration);
  return stableValue({
    workflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    organization: {
      parishId: text(registration.parishId, 160),
      publicName: text(registration.parishName, 240),
      legalReceiptName: text(registration.taxLegalName || registration.billingLegalName || registration.parishName, 240)
    },
    stripe: {
      accountId: text(registration.stripeAccountId, 255),
      chargesEnabled: registration.stripeChargesEnabled === true,
      payoutsEnabled: registration.stripePayoutsEnabled === true,
      detailsSubmitted: registration.stripeDetailsSubmitted === true,
      disabledReason: text(registration.stripeDisabledReason, 500),
      requirementsDue: (Array.isArray(registration.stripeRequirementsDue) ? registration.stripeRequirementsDue : []).map((item) => text(item, 160)).sort(),
      payoutBankName: text(registration.stripePayoutBankName, 160),
      payoutBankLast4: text(registration.stripePayoutBankLast4, 4)
    },
    plan: {
      id: text(registration.subscriptionTier || plan?.id, 80),
      label: text(registration.subscriptionTierLabel || plan?.label, 160),
      monthlyCents: plan?.monthlyCents ?? registration.subscriptionMonthlyCents ?? null,
      status: text(registration.subscriptionStatus, 80)
    },
    giving: {
      recurringGivingEnabled: registration.recurringGivingEnabled !== false,
      generalFunds: generalFunds.map(publicFund),
      designatedFunds: designatedFunds.map(publicFund),
      campaigns: activeItems(registration.campaigns).map(publicCampaign),
      feastCampaigns: activeItems(registration.feastCampaigns).map(publicCampaign)
    },
    receipt: {
      legalName: text(registration.taxLegalName || registration.billingLegalName || registration.parishName, 240),
      contact: text(options.receiptContact || registration.receiptContact || "support@agapay.app", 255)
    }
  });
}

export async function onboardingMaterialVersion(registration = {}, options = {}) {
  return sha256Hex(JSON.stringify(onboardingMaterialSnapshot(registration, options)));
}

export function recommendedOnboardingState(registration = {}, checksInput = registration.onboardingChecks) {
  if (!registration.reference) return "RECEIVED";
  if (registration.status !== "verified") return "IDENTITY_REVIEW";
  if (registration.givingStatus === "active" && registration.treasurerSignoff?.status === "signed") return "LIVE";
  if (registration.dashboardInviteEmailStatus !== "sent") return "VERIFIED_HIDDEN";
  if (registration.parishDashboardTokenTemporary || !registration.parishDashboardPasswordRecord) return "INVITED";
  if (!registration.stripeAccountId) return "CREDENTIAL_SECURED";
  const stripe = stripeReadiness(registration);
  if (!stripe.ready) return "STRIPE_PENDING";
  const checks = normalizeOnboardingChecks({}, checksInput);
  const generalCount = activeItems(registration.funds).filter(isGeneralFund).length;
  if (!subscriptionReady(registration)
    || generalCount !== 1
    || !manualPassed(checks, "givingConfiguration")
    || !manualPassed(checks, "users")
    || !manualPassed(checks, "importDecision")) return "CONFIGURING";
  if (!manualPassed(checks, "testGift")
    || !manualPassed(checks, "receipt")
    || !manualPassed(checks, "reportingAccounting")
    || !manualPassed(checks, "givingAssets")) return "VALIDATING";
  return "AWAITING_TREASURER_SIGNOFF";
}

export async function buildParishOnboardingWorkflow(registration = {}, options = {}) {
  const checks = normalizeOnboardingChecks({}, registration.onboardingChecks);
  const stripe = stripeReadiness(registration, options.now ?? Date.now());
  const activeFunds = activeItems(registration.funds);
  const generalFunds = activeFunds.filter(isGeneralFund);
  const canonicalVerified = registration.status === "verified"
    && Boolean(text(registration.reviewedBy))
    && Boolean(text(registration.verificationSource))
    && Boolean(text(registration.bishopOrAuthority))
    && Boolean(text(registration.dioceseOrDeanery));
  const credentialSecured = !registration.parishDashboardTokenTemporary && Boolean(registration.parishDashboardPasswordRecord);
  const userContactsPresent = Boolean(normalizeEmail(registration.priestEmail)) && Boolean(normalizeEmail(registration.treasurerEmail));
  const workflowSteps = [
    step("registration", "Registration received", Boolean(registration.reference), registration.reference ? `Reference ${registration.reference}` : "Registration reference is missing."),
    step("canonical", "Canonical parish confirmed", canonicalVerified, canonicalVerified ? "Canonical review fields are complete." : "Complete canonical reviewer, source, authority, and diocese/deanery."),
    step("representative", "Authorized representative confirmed", manualPassed(checks, "authorizedRepresentative"), checks.authorizedRepresentative.note || "Record independent authority verification."),
    step("verifiedHidden", "Organization verified and hidden", registration.status === "verified" && ["hidden", "paused", "active"].includes(registration.givingStatus), registration.status === "verified" ? `Giving status: ${registration.givingStatus || "hidden"}.` : "Verify the organization in AGAPAY Admin."),
    step("invite", "Dashboard invite delivered", registration.dashboardInviteEmailStatus === "sent", registration.dashboardInviteEmailStatus === "sent" ? "Invite delivery is confirmed." : "Send the dashboard invite to verified recipients."),
    step("credential", "Temporary credential changed", credentialSecured, credentialSecured ? "Permanent dashboard credential is active." : "The parish must replace the temporary credential.", "Parish"),
    step("stripeConnected", "Stripe connected", stripe.connected, stripe.connected ? `Connected account ${registration.stripeAccountId}.` : "Create the parish connected account.", "Treasurer"),
    step("stripeReady", "Stripe charges and payouts ready", stripe.ready, stripe.ready ? "Charges, payouts, details, and requirements passed a fresh refresh." : "Refresh Stripe; charges and payouts must both be enabled with no requirements due.", "Treasurer"),
    step("subscription", "Subscription configured", subscriptionReady(registration), subscriptionReady(registration) ? `Plan ${registration.subscriptionTierLabel || registration.subscriptionTier || "selected"} is ${registration.subscriptionStatus}.` : "Activate the selected AGAPAY plan.", "Treasurer"),
    step("generalFund", "General Operating Fund configured", generalFunds.length === 1, generalFunds.length === 1 ? generalFunds[0].name || "General Operating Fund" : `Expected one active General Operating Fund; found ${generalFunds.length}.`, "Treasurer"),
    step("givingConfiguration", "Designated funds and campaigns approved", manualPassed(checks, "givingConfiguration"), checks.givingConfiguration.note || "Review the donor-facing giving catalog.", "Treasurer"),
    step("users", "Priest and treasurer access confirmed", userContactsPresent && manualPassed(checks, "users"), !userContactsPresent ? "Verified priest and treasurer emails are required." : checks.users.note || "Confirm both users can access the parish."),
    step("importDecision", "Donor and pledge import decided", manualPassed(checks, "importDecision"), checks.importDecision.note || "Record not applicable, deferred, or completed import evidence.", "Treasurer"),
    step("testGift", "Controlled test gift passed", manualPassed(checks, "testGift"), checks.testGift.note || "Record the production test-gift identifier."),
    step("receipt", "Receipt verified", manualPassed(checks, "receipt"), checks.receipt.note || "Verify delivery and donor-facing details.", "Treasurer"),
    step("reportingAccounting", "Reporting and accounting verified", manualPassed(checks, "reportingAccounting"), checks.reportingAccounting.note || "Reconcile the gift to Stripe and accounting."),
    step("givingAssets", "Giving URL and QR verified", manualPassed(checks, "givingAssets"), checks.givingAssets.note || "Scan the canonical giving QR and verify the URL.")
  ];
  const materialVersion = await onboardingMaterialVersion(registration, options);
  const signedCurrentSnapshot = registration.treasurerSignoff?.status === "signed"
    && registration.treasurerSignoff?.snapshotVersion === materialVersion;
  const blockers = workflowSteps.filter((item) => !item.passed).map((item) => ({ key: item.key, title: item.title, detail: item.detail }));
  if (registration.givingStatus !== "hidden" && registration.onboardingState !== "LIVE") {
    blockers.push({ key: "givingHidden", title: "Giving page hidden until signoff", detail: "Set giving status to hidden before Go Live." });
  }
  const state = registration.onboardingState || recommendedOnboardingState(registration, checks);
  const canGoLive = onboardingWorkflowEnabled(registration)
    && state !== "LIVE"
    && registration.givingStatus === "hidden"
    && blockers.length === 0;

  return {
    version: PARISH_ONBOARDING_WORKFLOW_VERSION,
    enabled: onboardingWorkflowEnabled(registration),
    state,
    recommendedState: recommendedOnboardingState(registration, checks),
    steps: workflowSteps,
    completedSteps: workflowSteps.filter((item) => item.passed).length,
    totalSteps: workflowSteps.length,
    blockers,
    canGoLive,
    signedCurrentSnapshot,
    materialVersion,
    checks,
    stripe,
    signoff: registration.treasurerSignoff || null,
    summary: {
      ...onboardingMaterialSnapshot(registration, options),
      givingUrl: `${text(options.appUrl || "https://agapay.app", 500).replace(/\/+$/, "")}/give/${encodeURIComponent(text(registration.parishId, 160))}`,
      treasurerEmail: normalizeEmail(registration.treasurerEmail)
    }
  };
}

export function validateTreasurerGoLiveInput(body = {}, registration = {}) {
  const affirmations = body.affirmations && typeof body.affirmations === "object" ? body.affirmations : {};
  const missingAffirmations = TREASURER_AFFIRMATIONS.filter((key) => affirmations[key] !== true);
  const signerName = text(body.signerName, 160);
  const signerTitle = text(body.signerTitle, 160);
  const signerEmail = normalizeEmail(body.signerEmail);
  const registeredTreasurerEmail = normalizeEmail(registration.treasurerEmail);
  const errors = [];
  if (missingAffirmations.length) errors.push("Complete all eight treasurer affirmations.");
  if (!signerName) errors.push("Enter the treasurer name.");
  if (!signerTitle || !/treasurer/i.test(signerTitle)) errors.push("Confirm a treasurer title.");
  if (!signerEmail || signerEmail !== registeredTreasurerEmail) errors.push("Use the verified treasurer email on this parish record.");
  if (body.authorityConfirmed !== true) errors.push("Confirm authority to act for the parish.");
  return { ok: errors.length === 0, errors, missingAffirmations, signerName, signerTitle, signerEmail, affirmations };
}

export async function invalidateOnboardingSignoffIfChanged(previous = {}, next = {}, options = {}) {
  if (!onboardingWorkflowEnabled(previous) || previous.treasurerSignoff?.status !== "signed") return next;
  const [previousVersion, nextVersion] = await Promise.all([
    onboardingMaterialVersion(previous, options),
    onboardingMaterialVersion(next, options)
  ]);
  if (previousVersion === nextVersion) return next;
  const now = new Date().toISOString();
  return {
    ...next,
    givingStatus: previous.onboardingState === "LIVE" ? "paused" : "hidden",
    onboardingState: "CONFIGURING",
    treasurerSignoff: {
      ...previous.treasurerSignoff,
      status: "invalidated",
      invalidatedAt: now,
      invalidatedReason: text(options.reason || "Material onboarding configuration changed.", 500),
      invalidatedBy: text(options.actor || "system", 160)
    }
  };
}
