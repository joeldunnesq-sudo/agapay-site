import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  secureCompare,
  unauthorized,
} from "../lib/core.js";
import { requireActiveMembership } from "../lib/authorization.js";
import { listMembershipsForParish } from "../lib/memberships.js";
import {
  PARISH_ONBOARDING_WORKFLOW_VERSION,
  TREASURER_AFFIRMATIONS,
  buildParishOnboardingWorkflow,
  onboardingWorkflowEnabled,
  validateTreasurerGoLiveInput,
} from "../lib/parish-onboarding.js";
import {
  appendAdminAudit,
  findRegistrationByParishId,
  parishDashboardPayload,
  verifyParishDashboardBearer,
} from "./parish.js";
import { refreshStripeStatusForRegistration } from "./stripe.js";
import { saveReviewedRegistration } from "../lib/registration-publication.js";

export async function handleParishOnboarding(request, env, parishId) {
  const limited = await rateLimit(request, env, "parish-onboarding", {
    limit: request.method === "POST" ? 10 : 40,
    windowSeconds: 300
  });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const memberships = await listMembershipsForParish(env, parishId);
  const workflowOptions = {
    appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    memberships
  };
  if (request.method === "GET") {
    const legacyAuthorized = await verifyParishDashboardBearer(found.registration, getBearerToken(request));
    const memberAuthorized = legacyAuthorized ? null : await requireActiveMembership(request, env, parishId);
    if (!legacyAuthorized && !memberAuthorized) return unauthorized();
    return json({ onboarding: await buildParishOnboardingWorkflow(found.registration, workflowOptions) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const dashboardAuthorized = await verifyParishDashboardBearer(found.registration, getBearerToken(request));
  if (!dashboardAuthorized) return unauthorized();
  const verifiedTreasurerEmail = normalizeEmail(found.registration.treasurerEmail);
  if (!verifiedTreasurerEmail) {
    return json({
      error: "Add the parish treasurer's email before approving launch.",
      code: "treasurer_email_missing"
    }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Enter the launch confirmations before submitting." }, { status: 400 });
  }

  if (!onboardingWorkflowEnabled(found.registration)) {
    return json({ error: "This parish has not been enrolled in the deterministic onboarding workflow." }, { status: 409 });
  }

  const persistedWorkflow = await buildParishOnboardingWorkflow(found.registration, workflowOptions);
  if (found.registration.onboardingState === "LIVE"
    && found.registration.treasurerSignoff?.status === "signed"
    && persistedWorkflow.signedCurrentSnapshot) {
    return json({ ok: true, alreadyLive: true, onboarding: persistedWorkflow });
  }
  if (!env.AGAPAY_DB?.prepare) {
    return json({ error: "Launch is temporarily unavailable. Contact AGAPAY support to enable secure publication.", code: "publication_store_required" }, { status: 503 });
  }

  const reviewChanged = async () => {
    const latest = await findRegistrationByParishId(env, parishId);
    if (!latest) return json({ error: "Parish record not found." }, { status: 404 });
    const onboarding = await buildParishOnboardingWorkflow(latest.registration, workflowOptions);
    const parish = parishDashboardPayload(parishId, latest.registration);
    parish.onboarding = onboarding;
    if (onboarding.state === "LIVE" && onboarding.signedCurrentSnapshot) {
      return json({ ok: true, alreadyLive: true, parish, onboarding });
    }
    return json({ error: "The parish setup changed while you were reviewing. Review the current details and confirm again.", code: "onboarding_snapshot_changed", parish, onboarding }, { status: 409 });
  };

  const refreshed = await refreshStripeStatusForRegistration(env, found.key, found.registration, {
    actor: verifiedTreasurerEmail,
    reason: "The mandatory Go-Live Stripe refresh changed material connected-account state.",
    preserveReviewedTimestamp: true,
    persist: false
  });
  if (!refreshed.ok) return json(refreshed.body, { status: refreshed.status });
  const currentRegistration = refreshed.registration;
  const currentWorkflow = await buildParishOnboardingWorkflow(currentRegistration, workflowOptions);
  if (!body.snapshotVersion || !secureCompare(body.snapshotVersion, currentWorkflow.materialVersion)) {
    if (!await saveReviewedRegistration(env, found.key, found.registration, currentRegistration)) return reviewChanged();
    const parish = parishDashboardPayload(parishId, currentRegistration);
    parish.onboarding = currentWorkflow;
    return json({
      error: "The onboarding configuration changed. Refresh and review the current signoff summary before going live.",
      code: "onboarding_snapshot_changed",
      parish,
      onboarding: currentWorkflow
    }, { status: 409 });
  }
  if (!currentWorkflow.canGoLive) {
    if (!await saveReviewedRegistration(env, found.key, found.registration, currentRegistration)) return reviewChanged();
    return json({
      error: "Go Live is blocked until every onboarding gate passes.",
      code: "onboarding_blocked",
      blockers: currentWorkflow.blockers,
      onboarding: currentWorkflow,
      parish: { ...parishDashboardPayload(parishId, currentRegistration), onboarding: currentWorkflow }
    }, { status: 409 });
  }

  const attestation = validateTreasurerGoLiveInput(body, currentRegistration);
  if (!attestation.ok) {
    return json({
      error: attestation.errors[0] || "Treasurer signoff is incomplete.",
      errors: attestation.errors,
      missingAffirmations: attestation.missingAffirmations
    }, { status: 422 });
  }

  const now = new Date().toISOString();
  const requestId = request.headers.get("CF-Ray") || crypto.randomUUID();
  const signedAffirmations = Object.fromEntries(TREASURER_AFFIRMATIONS.map((key) => [key, true]));
  let updated = {
    ...currentRegistration,
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    onboardingState: "LIVE",
    givingStatus: "active",
    treasurerSignoff: {
      status: "signed",
      signerName: attestation.signerName,
      signerTitle: attestation.signerTitle,
      signerEmail: attestation.signerEmail,
      verifiedTreasurerEmail: attestation.signerEmail,
      authenticationMethod: "parish_dashboard_session",
      signedAt: now,
      snapshotVersion: currentWorkflow.materialVersion,
      affirmationVersion: 1,
      reviewVersion: 2,
      affirmations: signedAffirmations,
      requestId
    },
    goLiveAt: now,
    goLiveBy: attestation.signerEmail,
    parishUpdatedAt: now
  };
  updated = appendAdminAudit(updated, "parish_go_live", `${attestation.signerName} (${attestation.signerTitle})`, {
    signerEmail: attestation.signerEmail,
    authenticationMethod: "parish_dashboard_session",
    snapshotVersion: currentWorkflow.materialVersion,
    requestId
  });
  if (!await saveReviewedRegistration(env, found.key, found.registration, updated)) return reviewChanged();

  const onboarding = await buildParishOnboardingWorkflow(updated, workflowOptions);
  const parish = parishDashboardPayload(parishId, updated);
  parish.onboarding = onboarding;
  return json({ ok: true, parish, onboarding });
}
