import { clientIp, d1, d1Run, normalizeEmail, sha256Hex } from "./core.js";

export const CURRENT_TERMS_VERSION = "2026-08-30";
export const CURRENT_TERMS_SHA256 = "e30d2a1996f56b11b75c5f9b6fc55e8048b750bc14b5fb8356d640033b76103d";
export const CURRENT_PRIVACY_NOTICE_VERSION = "2026-08-30";

export const ORGANIZATION_ACCEPTANCE_DISCLOSURE = "I confirm that I am authorized to bind the organization named above and that the information above is accurate. I agree to the Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy.";
export const ACCOUNT_ACCEPTANCE_DISCLOSURE = "I agree to the Terms of Service, including the 30-day informal-resolution process, small-claims option, and court provisions in Section 24. I acknowledge the Privacy Policy.";

function requiredText(value, label, maxLength = 5000) {
  const normalized = String(value || "").trim().slice(0, maxLength);
  if (!normalized) throw new Error(`${label} is required to preserve legal acceptance evidence.`);
  return normalized;
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
