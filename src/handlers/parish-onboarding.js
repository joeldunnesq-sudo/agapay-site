import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  secureCompare,
  unauthorized,
} from "../lib/core.js";
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
  saveRegistrationRecord,
  verifyParishDashboardBearer,
} from "./parish.js";

export async function handleParishOnboarding(request, env, parishId) {
  const limited = await rateLimit(request, env, "parish-onboarding", {
    limit: request.method === "POST" ? 10 : 40,
    windowSeconds: 300
  });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();

  const workflowOptions = {
    appUrl: env.AGAPAY_APP_URL || new URL(request.url).origin,
    receiptContact: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app"
  };
  const currentWorkflow = await buildParishOnboardingWorkflow(found.registration, workflowOptions);
  if (request.method === "GET") return json({ onboarding: currentWorkflow });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!onboardingWorkflowEnabled(found.registration)) {
    return json({ error: "This parish has not been enrolled in the deterministic onboarding workflow." }, { status: 409 });
  }
  if (found.registration.onboardingState === "LIVE"
    && found.registration.treasurerSignoff?.status === "signed"
    && found.registration.treasurerSignoff?.snapshotVersion === currentWorkflow.materialVersion) {
    return json({ ok: true, alreadyLive: true, onboarding: currentWorkflow });
  }
  if (!body.snapshotVersion || !secureCompare(body.snapshotVersion, currentWorkflow.materialVersion)) {
    return json({
      error: "The onboarding configuration changed. Refresh and review the current signoff summary before going live.",
      code: "onboarding_snapshot_changed"
    }, { status: 409 });
  }
  if (!currentWorkflow.canGoLive) {
    return json({
      error: "Go Live is blocked until every onboarding gate passes.",
      code: "onboarding_blocked",
      blockers: currentWorkflow.blockers
    }, { status: 409 });
  }

  const attestation = validateTreasurerGoLiveInput(body, found.registration);
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
    ...found.registration,
    onboardingWorkflowVersion: PARISH_ONBOARDING_WORKFLOW_VERSION,
    onboardingState: "LIVE",
    givingStatus: "active",
    treasurerSignoff: {
      status: "signed",
      signerName: attestation.signerName,
      signerTitle: attestation.signerTitle,
      signerEmail: attestation.signerEmail,
      signedAt: now,
      snapshotVersion: currentWorkflow.materialVersion,
      affirmationVersion: 1,
      affirmations: signedAffirmations,
      requestId
    },
    goLiveAt: now,
    goLiveBy: attestation.signerEmail,
    parishUpdatedAt: now
  };
  updated = appendAdminAudit(updated, "parish_go_live", `${attestation.signerName} (${attestation.signerTitle})`, {
    signerEmail: attestation.signerEmail,
    snapshotVersion: currentWorkflow.materialVersion,
    requestId
  });
  await saveRegistrationRecord(env, found.key, updated, found.registration);

  const onboarding = await buildParishOnboardingWorkflow(updated, workflowOptions);
  const parish = parishDashboardPayload(parishId, updated);
  parish.onboarding = onboarding;
  return json({ ok: true, parish, onboarding });
}
