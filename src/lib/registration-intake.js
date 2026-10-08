// Generated from src/lib/registration-intake.ts by npm run build:server. Do not edit.
import { sanitizeAttribution } from './lead-attribution.js';
import { registrationRequirementsForCommunityType } from '../organizations/verification-policies.js';
const REGISTRATION_TERMS_VERSION = '2026-08-30';
const REGISTRATION_PRIVACY_NOTICE_VERSION = '2026-08-30';
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
  organizationDescription: 4e3,
  priestFirst: 120,
  priestLast: 120,
  priestEmail: 320,
  priestPhone: 50,
  treasurerFirst: 120,
  treasurerLast: 120,
  treasurerEmail: 320,
  notes: 4e3,
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
  multistateExplanation: 2e3,
});
function limitedRegistrationString(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}
function registrationAgreementEvidence(acceptedAt) {
  return {
    canonicalAgreement: true,
    termsAcceptedAt: acceptedAt,
    termsVersion: REGISTRATION_TERMS_VERSION,
    privacyNoticeAcknowledgedAt: acceptedAt,
    privacyNoticeVersion: REGISTRATION_PRIVACY_NOTICE_VERSION,
    agreementSource: 'church_registration',
  };
}
function registrationRequiresJurisdiction(type) {
  return registrationRequirementsForCommunityType(type).jurisdiction;
}
function registrationRequiresValuesReview(type) {
  return registrationRequirementsForCommunityType(type).valuesReview;
}
function registrationRequiresWebsite(type) {
  return registrationRequirementsForCommunityType(type).website;
}
function sanitizePublicRegistrationInput(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sanitized = {};
  for (const [field, maxLength] of Object.entries(PUBLIC_REGISTRATION_STRING_LIMITS)) {
    if (Object.hasOwn(source, field)) sanitized[field] = limitedRegistrationString(source[field], maxLength);
  }
  if (source.canonicalAgreement === true) sanitized.canonicalAgreement = true;
  const exemption = source.taxExemption;
  if (exemption && typeof exemption === 'object' && !Array.isArray(exemption)) {
    const sanitizedExemption = {};
    for (const [field, maxLength] of Object.entries(PUBLIC_TAX_EXEMPTION_STRING_LIMITS)) {
      if (Object.hasOwn(exemption, field)) {
        sanitizedExemption[field] = limitedRegistrationString(exemption[field], maxLength);
      }
    }
    if (exemption.claimsExemption === true || exemption.claimsExemption === 'yes') {
      sanitizedExemption.claimsExemption = true;
    }
    if (exemption.certified === true) sanitizedExemption.certified = true;
    sanitized.taxExemption = sanitizedExemption;
  }
  const attribution = sanitizeAttribution(source.attribution);
  if (attribution) sanitized.attribution = attribution;
  return sanitized;
}
export {
  REGISTRATION_PRIVACY_NOTICE_VERSION,
  REGISTRATION_TERMS_VERSION,
  registrationAgreementEvidence,
  registrationRequiresJurisdiction,
  registrationRequiresValuesReview,
  registrationRequiresWebsite,
  sanitizePublicRegistrationInput,
};
