import {
  getParishEmailCredentialStatus,
  resendSendingDomainFromWebsite,
  validateResendApiKey,
} from "../lib/email.js";
import {
  findRegistrationByParishId,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
  verifyParishDashboardBearer,
} from "./parish.js";

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function publicCredentialStatus(status, registration) {
  return {
    configured: Boolean(status.configured),
    configuredAt: status.configuredAt || "",
    sendingDomain: resendSendingDomainFromWebsite(registration.website),
  };
}

export async function handleParishEmailCredentials(request, env, parishId, dependencies = {}) {
  const applyRateLimit = dependencies.rateLimit || rateLimit;
  const findRegistration = dependencies.findRegistrationByParishId || findRegistrationByParishId;
  const verifyBearer = dependencies.verifyParishDashboardBearer || verifyParishDashboardBearer;
  const limited = await applyRateLimit(request, env, "parish-email-credentials", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();

  const found = await findRegistration(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  if (!(await verifyBearer(found.registration, getBearerToken(request)))) return unauthorized();

  if (request.method === "GET") {
    const status = await getParishEmailCredentialStatus(env, parishId);
    return json(publicCredentialStatus(status, found.registration));
  }

  if (request.method === "DELETE") {
    await db.prepare("DELETE FROM parish_email_credentials WHERE parish_id = ?").bind(parishId).run();
    return json(publicCredentialStatus({ configured: false, configuredAt: "" }, found.registration));
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const input = await request.json().catch(() => ({}));
  const apiKey = String(input.resendApiKey || "").trim();
  if (!apiKey || apiKey.length > 256) return json({ error: "Enter a valid Resend API key." }, { status: 422 });

  const sendingDomain = resendSendingDomainFromWebsite(found.registration.website);
  if (!sendingDomain) {
    return json({ error: "Add the parish website in Settings before connecting Resend. AGAPAY uses that website domain for parish digest email." }, { status: 422 });
  }

  const validate = dependencies.validateResendApiKey || validateResendApiKey;
  const validation = await validate(apiKey);
  if (!validation.valid) {
    return json(
      { error: validation.reason || "Resend rejected this API key." },
      { status: validation.retryable ? 503 : 422 },
    );
  }

  const configuredAt = new Date().toISOString();
  const configuredBy = String(found.registration.treasurerEmail || found.registration.priestEmail || `parish:${parishId}`)
    .trim().slice(0, 240);
  await db.prepare(`
    INSERT INTO parish_email_credentials (parish_id, resend_api_key, configured_at, configured_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(parish_id) DO UPDATE SET
      resend_api_key = excluded.resend_api_key,
      configured_at = excluded.configured_at,
      configured_by = excluded.configured_by
  `).bind(parishId, apiKey, configuredAt, configuredBy).run();

  return json({ configured: true, configuredAt, sendingDomain });
}
