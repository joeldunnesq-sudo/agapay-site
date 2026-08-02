export const REGISTRATION_TERMS_VERSION = "2026-08-01";
export const REGISTRATION_PRIVACY_NOTICE_VERSION = "2026-08-01";

const PUBLIC_REGISTRATION_STRING_LIMITS = Object.freeze({
  communityType: 80,
  subscriptionTier: 40,
  promo: 100,
  parishName: 200,
  jurisdiction: 200,
  addressLine1: 240,
  addressLine2: 240,
  city: 120,
  state: 80,
  postalCode: 24,
  website: 2048,
  liturgicalCalendar: 40,
  organizationDescription: 4000,
  priestFirst: 120,
  priestLast: 120,
  priestEmail: 320,
  priestPhone: 50,
  treasurerFirst: 120,
  treasurerLast: 120,
  treasurerEmail: 320,
  notes: 4000,
});

const PUBLIC_TAX_EXEMPTION_STRING_LIMITS = Object.freeze({
  jurisdiction: 40,
  exemptionType: 120,
  certificateNumber: 160,
  effectiveDate: 32,
  expirationDate: 32,
  authorizedRepresentativeName: 200,
  authorizedRepresentativeTitle: 200,
  multistateExplanation: 2000,
});

function limitedRegistrationString(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function registrationAgreementEvidence(acceptedAt) {
  return {
    canonicalAgreement: true,
    termsAcceptedAt: acceptedAt,
    termsVersion: REGISTRATION_TERMS_VERSION,
    privacyNoticeAcknowledgedAt: acceptedAt,
    privacyNoticeVersion: REGISTRATION_PRIVACY_NOTICE_VERSION,
    agreementSource: "church_registration",
  };
}

export function registrationRequiresJurisdiction(type) {
  return ["Mission", "Parish", "Cathedral", "Monastery", "Monastery / Skete"].includes(String(type || ""));
}

export function registrationRequiresValuesReview(type) {
  return ["Business", "Ministry / Nonprofit", "School / Academy", "Other Orthodox Organization"].includes(String(type || ""));
}

export function registrationRequiresWebsite(type) {
  return String(type || "") === "Business";
}

/**
 * Public registration is an untrusted intake boundary. Only fields rendered
 * by public/register.html may cross it; review state, credentials, billing
 * identifiers, entitlements, and publication data are always server-owned.
 */
export function sanitizePublicRegistrationInput(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const sanitized = {};
  for (const [field, maxLength] of Object.entries(PUBLIC_REGISTRATION_STRING_LIMITS)) {
    if (Object.hasOwn(source, field)) sanitized[field] = limitedRegistrationString(source[field], maxLength);
  }

  if (source.canonicalAgreement === true) sanitized.canonicalAgreement = true;

  const exemption = source.taxExemption;
  if (exemption && typeof exemption === "object" && !Array.isArray(exemption)) {
    const sanitizedExemption = {};
    for (const [field, maxLength] of Object.entries(PUBLIC_TAX_EXEMPTION_STRING_LIMITS)) {
      if (Object.hasOwn(exemption, field)) {
        sanitizedExemption[field] = limitedRegistrationString(exemption[field], maxLength);
      }
    }
    if (exemption.claimsExemption === true || exemption.claimsExemption === "yes") {
      sanitizedExemption.claimsExemption = true;
    }
    if (exemption.certified === true) sanitizedExemption.certified = true;
    sanitized.taxExemption = sanitizedExemption;
  }

  return sanitized;
}
