import { clientIp, d1, d1First, d1Run, normalizeEmail, sha256Hex } from "./core.js";

export const CURRENT_TERMS_VERSION = "2026-08-02";
export const CURRENT_TERMS_SHA256 = "11cd64ddb5ad936eb971b313ca8c22237790d3e2febc2bde41954111cdb65c20";
export const CURRENT_PRIVACY_NOTICE_VERSION = "2026-08-02";

export const ORGANIZATION_ACCEPTANCE_DISCLOSURE = "I confirm that I am authorized to bind the organization named above and that the information above is accurate. I agree to the Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy.";
export const PARISH_REACCEPTANCE_DISCLOSURE = "I agree to the current Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy and confirm I am authorized to act for this organization.";
export const ACCOUNT_ACCEPTANCE_DISCLOSURE = "I agree to the Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy.";
export const ACCOUNT_REACCEPTANCE_DISCLOSURE = "I agree to the current Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy.";

function requiredText(value, label, maxLength = 5000) {
  const normalized = String(value || "").trim().slice(0, maxLength);
  if (!normalized) throw new Error(`${label} is required to preserve legal acceptance evidence.`);
  return normalized;
}

export async function hasCurrentLegalAcceptance(env, { subjectUserId = "", organizationId = "" } = {}) {
  const normalizedUserId = normalizeEmail(subjectUserId);
  const normalizedOrganizationId = String(organizationId || "").trim();
  if (d1(env)) {
    const row = normalizedOrganizationId
      ? await d1First(env, "SELECT id FROM legal_acceptances WHERE organization_id = ?1 AND terms_version = ?2 LIMIT 1", normalizedOrganizationId, CURRENT_TERMS_VERSION)
      : await d1First(env, "SELECT id FROM legal_acceptances WHERE subject_user_id = ?1 AND terms_version = ?2 LIMIT 1", normalizedUserId, CURRENT_TERMS_VERSION);
    return Boolean(row?.id);
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const list = await env.AGAPAY_REGISTRATIONS.list({ prefix: "legal_acceptance:", limit: 1000 });
    for (const key of list.keys || []) {
      const stored = await env.AGAPAY_REGISTRATIONS.get(key.name, "json");
      const record = typeof stored === "string" ? JSON.parse(stored) : stored;
      if (record?.termsVersion !== CURRENT_TERMS_VERSION) continue;
      if (normalizedOrganizationId && record.organizationId === normalizedOrganizationId) return true;
      if (!normalizedOrganizationId && normalizeEmail(record?.subjectUserId) === normalizedUserId) return true;
    }
  }
  return false;
}

export async function recordLegalAcceptance(env, request, input = {}) {
  const acceptedAt = new Date().toISOString();
  const actorEmail = normalizeEmail(requiredText(input.actorEmail, "Actor email", 320));
  const transactionReference = requiredText(input.transactionReference, "Transaction reference", 500);
  const acceptanceSource = requiredText(input.acceptanceSource, "Acceptance source", 120);
  const id = `legal_${await sha256Hex(`${CURRENT_TERMS_VERSION}|${acceptanceSource}|${transactionReference}|${actorEmail}`)}`;
  const record = {
    id,
    actorType: requiredText(input.actorType, "Actor type", 80),
    subjectUserId: String(input.subjectUserId || "").trim().slice(0, 320),
    organizationId: String(input.organizationId || "").trim().slice(0, 200),
    actorName: requiredText(input.actorName, "Actor name", 200),
    actorEmail,
    actorRole: requiredText(input.actorRole, "Actor role", 200),
    acceptedAt,
    termsVersion: CURRENT_TERMS_VERSION,
    termsSha256: CURRENT_TERMS_SHA256,
    disclosureText: requiredText(input.disclosureText, "Acceptance disclosure"),
    acceptanceSource,
    transactionReference,
    ipAddress: String(clientIp(request) || "").slice(0, 128),
    userAgent: String(request.headers.get("user-agent") || "").slice(0, 1000),
    disputeResolutionMode: "courts_no_mandatory_arbitration",
    createdAt: acceptedAt,
  };

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT OR IGNORE INTO legal_acceptances (
        id, actor_type, subject_user_id, organization_id, actor_name, actor_email,
        actor_role, accepted_at, terms_version, terms_sha256, disclosure_text,
        acceptance_source, transaction_reference, ip_address, user_agent,
        dispute_resolution_mode, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
      record.id, record.actorType, record.subjectUserId || null, record.organizationId || null,
      record.actorName, record.actorEmail, record.actorRole, record.acceptedAt,
      record.termsVersion, record.termsSha256, record.disclosureText,
      record.acceptanceSource, record.transactionReference, record.ipAddress || null,
      record.userAgent || null, record.disputeResolutionMode, record.createdAt,
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    const key = `legal_acceptance:${record.id}`;
    const existing = await env.AGAPAY_REGISTRATIONS.get(key);
    if (!existing) await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(record));
  } else {
    throw new Error("A legal acceptance store is required.");
  }

  return record;
}

export function recordOrganizationRegistrationAcceptance(env, request, { body, parishId, reference }) {
  return recordLegalAcceptance(env, request, {
    actorType: "organization_representative",
    subjectUserId: body.acceptingEmail,
    organizationId: parishId,
    actorName: body.acceptingName,
    actorEmail: body.acceptingEmail,
    actorRole: body.acceptingRole,
    disclosureText: ORGANIZATION_ACCEPTANCE_DISCLOSURE,
    acceptanceSource: "church_registration",
    transactionReference: reference,
  });
}

export async function ensureParishCurrentTermsAcceptance(env, request, parishId, body = {}) {
  if (await hasCurrentLegalAcceptance(env, { organizationId: parishId })) return null;
  const acceptingName = String(body.acceptingName || "").trim();
  const acceptingEmail = normalizeEmail(body.acceptingEmail);
  const acceptingRole = String(body.acceptingRole || "").trim();
  if (body.termsAccepted !== true || !acceptingName || !acceptingEmail || !acceptingRole) {
    return {
      error: "Affirmative acceptance of the current Terms is required.",
      code: "terms_acceptance_required",
      termsVersion: CURRENT_TERMS_VERSION,
    };
  }
  await recordLegalAcceptance(env, request, {
    actorType: "organization_representative",
    subjectUserId: acceptingEmail,
    organizationId: parishId,
    actorName: acceptingName,
    actorEmail: acceptingEmail,
    actorRole: acceptingRole,
    disclosureText: PARISH_REACCEPTANCE_DISCLOSURE,
    acceptanceSource: "parish_login_reacceptance",
    transactionReference: `parish-login:${parishId}:${CURRENT_TERMS_VERSION}`,
  });
  return null;
}
