import { normalizeEmail, sha256Hex } from "./core.js";
import { accountingEnabledFor } from "./entitlements.js";
import { subscriptionReady, subscriptionTier } from "./subscriptions.js";

export const PARISH_ONBOARDING_WORKFLOW_VERSION = 1;
export const STRIPE_READINESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const ONBOARDING_MANUAL_CHECKS = Object.freeze([
  "authorizedRepresentative",
  "givingConfiguration",
  "importDecision"
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
const GENERAL_FUND_CANONICAL_ID = "general";
const GENERAL_ACCOUNTING_FUND_ID = "fund_general";

function text(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function activeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && item.enabled !== false && item.active !== false);
}

function isGeneralFundCandidate(fund = {}) {
  return [fund.id, fund.code, fund.reportCode, fund.name]
    .filter(Boolean)
    .map((value) => text(value, 160).toLowerCase())
    .some((value) => GENERAL_FUND_KEYS.has(value));
}

function approvedLegacyGeneralFundException(registration = {}, fund = {}) {
  const exception = registration.generalFundLegacyException;
  if (!exception || exception.approved !== true) return false;
  const legacyId = text(exception.legacyFundIdentifier, 160).toLowerCase();
  return Boolean(
    legacyId
    && legacyId === text(fund.id, 160).toLowerCase()
    && text(exception.reason, 500)
    && text(exception.approvedBy, 160)
    && validDate(exception.approvedAt)
  );
}

export function validateGeneralOperatingFund(registration = {}) {
  const funds = Array.isArray(registration.funds) ? registration.funds.filter(Boolean) : [];
  const activeFunds = activeItems(funds);
  const allCandidates = funds.filter(isGeneralFundCandidate);
  const candidates = activeFunds.filter(isGeneralFundCandidate);
  const errors = [];
  const warnings = [];
  const fund = candidates.length === 1 ? candidates[0] : (allCandidates.length === 1 ? allCandidates[0] : null);

  if (!candidates.length) {
    errors.push(allCandidates.length
      ? "General Operating Fund must be enabled before launch."
      : "Add one active General Operating Fund before launch.");
  } else if (candidates.length > 1) {
    errors.push(`Exactly one active General Operating Fund is required; ${candidates.length} are configured.`);
  }

  if (fund) {
    const canonicalId = text(fund.id, 160).toLowerCase();
    const legacyException = approvedLegacyGeneralFundException(registration, fund);
    if (canonicalId !== GENERAL_FUND_CANONICAL_ID && !legacyException) {
      errors.push('The General Operating Fund must use the stable identifier "general".');
    }
    if (legacyException) warnings.push(`Approved legacy identifier: ${text(fund.id, 160)}.`);

    const restrictionType = text(fund.restrictionType || fund.restriction_type, 80).toLowerCase();
    if (restrictionType !== "unrestricted") {
      errors.push("General Operating Fund is restricted. Change the restriction to Unrestricted before launch.");
    }
    if (fund.isDefault !== true) {
      errors.push("Your General Operating Fund must be marked as the default unrestricted giving fund.");
    }
    const activeDefaults = activeFunds.filter((item) => item.isDefault === true);
    if (activeDefaults.length !== 1 || activeDefaults[0] !== fund) {
      errors.push("The default giving destination is ambiguous. Keep exactly one default fund: General Operating Fund.");
    }
    if (fund.enabled === false || fund.active === false) {
      errors.push("General Operating Fund must be enabled before launch.");
    }
    if (fund.givingEnabled === false || fund.donorVisible === false || ["hidden", "private", "disabled"].includes(text(fund.visibility, 40).toLowerCase())) {
      errors.push("General Operating Fund must be available to donors before launch.");
    }
    if (accountingEnabledFor(registration) && text(fund.accountingFundId, 160) !== GENERAL_ACCOUNTING_FUND_ID) {
      errors.push("General Operating Fund must map to the unrestricted operating fund in AGAPAY Accounting.");
    }
  }

  return {
    passed: errors.length === 0,
    fund,
    errors,
    warnings
  };
}

function publicFund(item = {}) {
  return {
    id: text(item.id || item.code || item.name, 160),
    name: text(item.name || item.label, 160),
    description: text(item.description, 500),
    restrictionType: text(item.restrictionType || item.restriction_type || "unrestricted", 80),
    accountNumber: text(item.accountNumber || item.account_number, 40),
    accountingFundId: text(item.accountingFundId || item.accounting_fund_id, 160),
    isDefault: item.isDefault === true,
    donorVisible: item.givingEnabled !== false && item.donorVisible !== false && !["hidden", "private", "disabled"].includes(text(item.visibility, 40).toLowerCase()),
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

function legacySharedAccessApproved(registration = {}) {
  const exception = registration.legacySharedAccessAllowed;
  return Boolean(
    exception?.approved === true
    && text(exception.reason, 500)
    && text(exception.approvedBy, 160)
    && validDate(exception.approvedAt)
    && !registration.parishDashboardTokenTemporary
    && registration.parishDashboardPasswordRecord
  );
}

export function requiredPersonalAccessAccepted(registration = {}, options = {}) {
  const access = registration.onboardingAccess && typeof registration.onboardingAccess === "object"
    ? registration.onboardingAccess
    : {};
  const required = [
    ["priest", normalizeEmail(registration.priestEmail)],
    ["treasurer", normalizeEmail(registration.treasurerEmail)]
  ].filter(([, email]) => Boolean(email));
  if (!required.length) return false;
  const memberships = Array.isArray(options.memberships) ? options.memberships : null;
  return required.every(([role, email]) => {
    const accepted = access[role];
    if (accepted?.status !== "accepted" || normalizeEmail(accepted.email) !== email || !text(accepted.membershipId, 200)) return false;
    if (!memberships) return true;
    return memberships.some((membership) => membership?.id === accepted.membershipId
      && membership?.parishId === registration.parishId
      && membership?.status === "active");
  });
}

function accessAccepted(registration = {}, options = {}) {
  if (requiredPersonalAccessAccepted(registration, options)) return true;
  return legacySharedAccessApproved(registration);
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

export function recordParishGivingSetupReview(registration = {}, importDecision = "none", actor = "Parish dashboard", now = new Date().toISOString()) {
  const importRequested = importDecision === "requested";
  return {
    ...registration,
    onboardingChecks: normalizeOnboardingChecks({
      givingConfiguration: {
        status: "passed",
        note: "The parish reviewed and saved its donor-facing giving setup.",
        evidence: "Parish giving setup wizard"
      },
      importDecision: {
        status: importRequested ? "passed" : "not_applicable",
        note: importRequested
          ? "The parish requested help importing existing donor or pledge records."
          : "The parish chose to launch without importing donor or pledge records.",
        evidence: "Parish giving setup wizard"
      }
    }, registration.onboardingChecks, actor, now)
  };
}

export function onboardingMaterialSnapshot(registration = {}, options = {}) {
  const funds = activeItems(registration.funds);
  const generalFunds = funds.filter(isGeneralFundCandidate);
  const designatedFunds = funds.filter((fund) => !isGeneralFundCandidate(fund));
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
      payoutBankLast4: text(registration.stripePayoutBankLast4, 4),
      statusCheckedAt: text(registration.stripeStatusCheckedAt, 80)
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
      generalFundLegacyException: stableValue(registration.generalFundLegacyException || null),
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

export function recommendedOnboardingState(registration = {}, checksInput = registration.onboardingChecks, options = {}) {
  if (!registration.reference) return "RECEIVED";
  if (registration.status !== "verified") return "IDENTITY_REVIEW";
  if (registration.onboardingState === "LIVE" && registration.givingStatus === "active" && registration.treasurerSignoff?.status === "signed") return "LIVE";
  if (registration.onboardingState === "PAUSED" && registration.givingStatus === "paused") return "PAUSED";
  if (registration.onboardingState === "CONFIGURING" && registration.givingStatus === "paused") return "CONFIGURING";
  if (registration.dashboardInviteEmailStatus !== "sent") return "VERIFIED_HIDDEN";
  if (!accessAccepted(registration, options)) return "INVITED";
  if (!registration.stripeAccountId) return "CREDENTIAL_SECURED";
  const stripe = stripeReadiness(registration);
  if (!stripe.ready) return "STRIPE_PENDING";
  const checks = normalizeOnboardingChecks({}, checksInput);
  const generalFund = validateGeneralOperatingFund(registration);
  if (!subscriptionReady(registration)
    || !generalFund.passed
    || !manualPassed(checks, "givingConfiguration")
    || !manualPassed(checks, "importDecision")) return "CONFIGURING";
  return "AWAITING_TREASURER_SIGNOFF";
}

export async function buildParishOnboardingWorkflow(registration = {}, options = {}) {
  const checks = normalizeOnboardingChecks({}, registration.onboardingChecks);
  const stripe = stripeReadiness(registration, options.now ?? Date.now());
  const generalFund = validateGeneralOperatingFund(registration);
  const canonicalVerified = registration.status === "verified"
    && Boolean(text(registration.reviewedBy))
    && Boolean(text(registration.verificationSource))
    && Boolean(text(registration.bishopOrAuthority))
    && Boolean(text(registration.dioceseOrDeanery));
  const personalAccessAccepted = accessAccepted(registration, options);
  const workflowSteps = [
    step("registration", "Registration received", Boolean(registration.reference), registration.reference ? `Reference ${registration.reference}` : "Registration reference is missing."),
    step("canonical", "Canonical parish confirmed", canonicalVerified, canonicalVerified ? "Canonical review fields are complete." : "Complete canonical reviewer, source, authority, and diocese/deanery."),
    step("representative", "Approving priest confirmed treasurer", manualPassed(checks, "authorizedRepresentative"), checks.authorizedRepresentative.note || "Verify the priest from an official source, then record that leader's confirmation of the treasurer's name and email."),
    step("verifiedHidden", "Organization verified and hidden", registration.status === "verified" && registration.givingStatus === "hidden", registration.status === "verified" ? `Giving status: ${registration.givingStatus || "hidden"}.` : "Verify the organization in AGAPAY Admin."),
    step("invite", "Dashboard invite delivered", registration.dashboardInviteEmailStatus === "sent", registration.dashboardInviteEmailStatus === "sent" ? "Invite delivery is confirmed." : "Send the dashboard invite to verified recipients."),
    step("credential", "Personal dashboard access accepted", personalAccessAccepted, personalAccessAccepted ? "The required parish access invitations have been accepted." : "The priest and treasurer accept their secure email invitations and create their own passwords.", "Parish"),
    step("stripeConnected", "Stripe connected", stripe.connected, stripe.connected ? `Connected account ${registration.stripeAccountId}.` : "Create the parish connected account.", "Treasurer"),
    step("stripeReady", "Stripe charges and payouts ready", stripe.ready, stripe.ready ? "Charges, payouts, details, and requirements passed a fresh refresh." : "Refresh Stripe; charges and payouts must both be enabled with no requirements due.", "Treasurer"),
    step("subscription", "Subscription configured", subscriptionReady(registration), subscriptionReady(registration) ? `Plan ${registration.subscriptionTierLabel || registration.subscriptionTier || "selected"} is ${registration.subscriptionStatus}.` : "Activate the selected AGAPAY plan.", "Treasurer"),
    step("generalFund", "General Operating Fund configured", generalFund.passed, generalFund.passed ? generalFund.fund?.name || "General Operating Fund" : generalFund.errors[0], "Treasurer"),
    step("givingConfiguration", "Designated funds and campaigns approved", manualPassed(checks, "givingConfiguration"), checks.givingConfiguration.note || "Review the donor-facing giving catalog.", "Treasurer"),
    step("importDecision", "Donor and pledge import decided", manualPassed(checks, "importDecision"), checks.importDecision.note || "Record not applicable, deferred, or completed import evidence.", "AGAPAY")
  ];
  const materialVersion = await onboardingMaterialVersion(registration, options);
  const signedCurrentSnapshot = registration.treasurerSignoff?.status === "signed"
    && registration.treasurerSignoff?.snapshotVersion === materialVersion;
  const derivedState = recommendedOnboardingState(registration, checks, options);
  const recommendedState = derivedState === "LIVE" && !signedCurrentSnapshot ? "CONFIGURING" : derivedState;
  const state = recommendedState;
  const lifecycleComplete = state === "LIVE" || state === "PAUSED";
  const blockers = workflowSteps
    .filter((item) => !item.passed && !(lifecycleComplete && item.key === "verifiedHidden"))
    .map((item) => ({ key: item.key, title: item.title, detail: item.detail }));
  if (registration.givingStatus !== "hidden" && !lifecycleComplete) {
    blockers.push({ key: "givingHidden", title: "Giving page hidden until signoff", detail: "Set giving status to hidden before Go Live." });
  }
  const canGoLive = onboardingWorkflowEnabled(registration)
    && state !== "LIVE"
    && registration.givingStatus === "hidden"
    && blockers.length === 0;

  return {
    version: PARISH_ONBOARDING_WORKFLOW_VERSION,
    enabled: onboardingWorkflowEnabled(registration),
    state,
    recommendedState,
    steps: workflowSteps,
    completedSteps: workflowSteps.filter((item) => item.passed).length,
    totalSteps: workflowSteps.length,
    blockers,
    canGoLive,
    signedCurrentSnapshot,
    materialVersion,
    checks,
    stripe,
    parishStages: [
      {
        key: "access",
        title: "Accept access",
        detail: personalAccessAccepted ? "Your secure parish access is ready." : "Open your email invitation and create your password.",
        passed: personalAccessAccepted
      },
      {
        key: "payments",
        title: "Connect payments",
        detail: stripe.ready && subscriptionReady(registration) ? "Your plan and Stripe account are ready." : "Choose your plan and connect the parish Stripe account.",
        passed: stripe.ready && subscriptionReady(registration)
      },
      {
        key: "launch",
        title: "Review and launch",
        detail: state === "LIVE" ? "Giving is live." : canGoLive ? "Review the parish details and approve launch." : "AGAPAY is preparing your launch review.",
        passed: state === "LIVE"
      }
    ],
    signoff: registration.treasurerSignoff || null,
    summary: {
      ...onboardingMaterialSnapshot(registration, options),
      givingUrl: `${text(options.appUrl || "https://agapay.app", 500).replace(/\/+$/, "")}/give/${encodeURIComponent(text(registration.parishId, 160))}`,
      treasurerEmail: normalizeEmail(registration.treasurerEmail)
    }
  };
}

export function validateTreasurerGoLiveInput(body = {}, registration = {}, authenticatedIdentity = null) {
  const affirmations = body.affirmations && typeof body.affirmations === "object" ? body.affirmations : {};
  const missingAffirmations = TREASURER_AFFIRMATIONS.filter((key) => affirmations[key] !== true);
  const signerName = text(body.signerName, 160);
  const signerTitle = text(body.signerTitle, 160);
  const signerEmail = normalizeEmail(authenticatedIdentity?.email);
  const registeredTreasurerEmail = normalizeEmail(registration.treasurerEmail);
  const errors = [];
  if (missingAffirmations.length) errors.push("Complete all eight treasurer affirmations.");
  if (!signerName) errors.push("Enter the treasurer name.");
  if (!signerTitle || !/treasurer/i.test(signerTitle)) errors.push("Confirm a treasurer title.");
  if (!signerEmail || signerEmail !== registeredTreasurerEmail) errors.push("Please sign in with the verified treasurer account to approve launch.");
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
