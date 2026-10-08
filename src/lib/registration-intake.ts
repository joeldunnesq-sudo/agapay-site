import type { AttributionInput } from './lead-attribution.js';
export type PublicRegistrationInput = Partial<Record<keyof typeof PUBLIC_REGISTRATION_STRING_LIMITS, string>> & {
  canonicalAgreement?: true;
  taxExemption?: Partial<Record<keyof typeof PUBLIC_TAX_EXEMPTION_STRING_LIMITS, string>> & {
    claimsExemption?: true;
    certified?: true;
  };
  attribution?: AttributionInput;
};
import { sanitizeAttribution } from './lead-attribution.js';
import { registrationRequirementsForCommunityType } from '../organizations/verification-policies.js';

export const REGISTRATION_TERMS_VERSION = '2026-08-30';
export const REGISTRATION_PRIVACY_NOTICE_VERSION = '2026-08-30';

const PUBLIC_REGISTRATION_STRING_LIMITS = Object.freeze({
  communityType: 80,
  subscriptionTier: 40,
  parishHouseholdBand: 40,
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
  acceptingName: 200,
  acceptingEmail: 320,
  acceptingRole: 200,
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

function limitedRegistrationString(value: unknown, maxLength: number) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

export function registrationAgreementEvidence(acceptedAt: string) {
  return {
    canonicalAgreement: true,
    termsAcceptedAt: acceptedAt,
    termsVersion: REGISTRATION_TERMS_VERSION,
    privacyNoticeAcknowledgedAt: acceptedAt,
    privacyNoticeVersion: REGISTRATION_PRIVACY_NOTICE_VERSION,
    agreementSource: 'church_registration',
  };
}

export function registrationRequiresJurisdiction(type: unknown) {
  return registrationRequirementsForCommunityType(type).jurisdiction;
}

export function registrationRequiresValuesReview(type: unknown) {
  return registrationRequirementsForCommunityType(type).valuesReview;
}

export function registrationRequiresWebsite(type: unknown) {
  return registrationRequirementsForCommunityType(type).website;
}

/**
 * Public registration is an untrusted intake boundary. Only fields rendered
 * by public/register.html may cross it; review state, credentials, billing
 * identifiers, entitlements, and publication data are always server-owned.
 */
export function sanitizePublicRegistrationInput(input: unknown = {}): PublicRegistrationInput {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const sanitized: PublicRegistrationInput = {};
  for (const [field, maxLength] of Object.entries(PUBLIC_REGISTRATION_STRING_LIMITS)) {
    if (Object.hasOwn(source, field))
      sanitized[field as keyof typeof PUBLIC_REGISTRATION_STRING_LIMITS] = limitedRegistrationString(
        source[field],
        maxLength
      );
  }

  if (source.canonicalAgreement === true) sanitized.canonicalAgreement = true;

  const exemption = source.taxExemption;
  if (exemption && typeof exemption === 'object' && !Array.isArray(exemption)) {
    const sanitizedExemption: NonNullable<PublicRegistrationInput['taxExemption']> = {};
    for (const [field, maxLength] of Object.entries(PUBLIC_TAX_EXEMPTION_STRING_LIMITS)) {
      if (Object.hasOwn(exemption, field)) {
        sanitizedExemption[field as keyof typeof PUBLIC_TAX_EXEMPTION_STRING_LIMITS] = limitedRegistrationString(
          (exemption as Record<string, unknown>)[field],
          maxLength
        );
      }
    }
    if (
      (exemption as Record<string, unknown>).claimsExemption === true ||
      (exemption as Record<string, unknown>).claimsExemption === 'yes'
    ) {
      sanitizedExemption.claimsExemption = true;
    }
    if ((exemption as Record<string, unknown>).certified === true) sanitizedExemption.certified = true;
    sanitized.taxExemption = sanitizedExemption;
  }

  const attribution = sanitizeAttribution(source.attribution);
  if (attribution) sanitized.attribution = attribution;
  return sanitized;
}
