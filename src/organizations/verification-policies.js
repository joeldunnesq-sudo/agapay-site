import { ORGANIZATION_TYPES, classifyCommunityType, organizationClassificationForRegistration } from './types.js';

export const VERIFICATION_POLICIES = Object.freeze({
  CANONICAL_CHURCH: 'canonical_church',
  CANONICAL_MONASTERY: 'canonical_monastery',
  DIOCESAN_AUTHORITY: 'diocesan_authority',
  ORTHODOX_MINISTRY_REVIEW: 'orthodox_ministry_review',
  NONPROFIT_LEGAL_REVIEW: 'nonprofit_legal_review',
  SCHOOL_VALUES_REVIEW: 'school_values_review',
  BUSINESS_VALUES_REVIEW: 'business_values_review',
  ORTHODOX_VALUES_REVIEW: 'orthodox_values_review',
  UNSUPPORTED: 'unsupported',
});

function freezePolicy(policy) {
  const onboardingRequirements = policy.onboardingRequirements || RESERVED_ONBOARDING_REQUIREMENTS;
  return Object.freeze({
    ...policy,
    registrationRequirements: Object.freeze({ ...policy.registrationRequirements }),
    onboardingRequirements: Object.freeze({
      ...onboardingRequirements,
      evidenceFields: Object.freeze([...(onboardingRequirements.evidenceFields || [])]),
      manualChecks: Object.freeze([...(onboardingRequirements.manualChecks || [])]),
      steps: Object.freeze((onboardingRequirements.steps || []).map((step) => Object.freeze({ ...step }))),
    }),
  });
}

const NO_REQUIREMENTS = Object.freeze({
  jurisdiction: false,
  valuesReview: false,
  website: false,
  organizationDescription: false,
});

const CANONICAL_EVIDENCE_FIELDS = Object.freeze([
  'reviewedBy',
  'verificationSource',
  'bishopOrAuthority',
  'dioceseOrDeanery',
]);

export const VERIFICATION_ONBOARDING_MANUAL_CHECKS = Object.freeze(['authorizedRepresentative']);

const CANONICAL_ONBOARDING_REQUIREMENTS = Object.freeze({
  activation: 'active',
  verifiedStatus: 'verified',
  evidenceFields: CANONICAL_EVIDENCE_FIELDS,
  manualChecks: VERIFICATION_ONBOARDING_MANUAL_CHECKS,
  incompleteMessage:
    'Canonical verification is incomplete. Fill reviewer name, verification source, bishop/authority, and diocese/deanery before marking verified.',
  steps: Object.freeze([
    Object.freeze({
      key: 'canonical',
      title: 'Canonical parish confirmed',
      requirement: 'verification_evidence',
      passedDetail: 'Canonical review fields are complete.',
      blockedDetail: 'Complete canonical reviewer, source, authority, and diocese/deanery.',
      owner: 'AGAPAY',
    }),
    Object.freeze({
      key: 'representative',
      title: 'Approving priest confirmed treasurer',
      requirement: 'manual_check',
      manualCheckKey: 'authorizedRepresentative',
      blockedDetail:
        "Verify the priest from an official source, then record that leader's confirmation of the treasurer's name and email.",
      owner: 'AGAPAY',
    }),
  ]),
});

const RESERVED_ONBOARDING_REQUIREMENTS = Object.freeze({
  activation: 'reserved',
  verifiedStatus: 'verified',
  evidenceFields: Object.freeze([]),
  manualChecks: Object.freeze([]),
  incompleteMessage: 'This organization verification policy is not active.',
  steps: Object.freeze([
    Object.freeze({
      key: 'verificationPolicy',
      title: 'Organization verification policy available',
      requirement: 'policy_activation',
      blockedDetail: 'This organization type does not have an active onboarding verification policy.',
      owner: 'AGAPAY',
    }),
  ]),
});

const POLICY_BY_TYPE = Object.freeze({
  [ORGANIZATION_TYPES.CHURCH]: freezePolicy({
    id: VERIFICATION_POLICIES.CANONICAL_CHURCH,
    activeForRegistration: true,
    registrationRequirements: { ...NO_REQUIREMENTS, jurisdiction: true },
    onboardingRequirements: CANONICAL_ONBOARDING_REQUIREMENTS,
  }),
  [ORGANIZATION_TYPES.MONASTERY]: freezePolicy({
    id: VERIFICATION_POLICIES.CANONICAL_MONASTERY,
    activeForRegistration: true,
    registrationRequirements: { ...NO_REQUIREMENTS, jurisdiction: true },
    onboardingRequirements: CANONICAL_ONBOARDING_REQUIREMENTS,
  }),
  [ORGANIZATION_TYPES.DIOCESE]: freezePolicy({
    id: VERIFICATION_POLICIES.DIOCESAN_AUTHORITY,
    activeForRegistration: false,
    registrationRequirements: { ...NO_REQUIREMENTS, jurisdiction: true },
    onboardingRequirements: CANONICAL_ONBOARDING_REQUIREMENTS,
  }),
  [ORGANIZATION_TYPES.MINISTRY]: freezePolicy({
    id: VERIFICATION_POLICIES.ORTHODOX_MINISTRY_REVIEW,
    activeForRegistration: false,
    registrationRequirements: {
      ...NO_REQUIREMENTS,
      valuesReview: true,
      organizationDescription: true,
    },
  }),
  [ORGANIZATION_TYPES.NONPROFIT]: freezePolicy({
    id: VERIFICATION_POLICIES.NONPROFIT_LEGAL_REVIEW,
    activeForRegistration: false,
    registrationRequirements: {
      ...NO_REQUIREMENTS,
      valuesReview: true,
      organizationDescription: true,
    },
  }),
  [ORGANIZATION_TYPES.SCHOOL]: freezePolicy({
    id: VERIFICATION_POLICIES.SCHOOL_VALUES_REVIEW,
    activeForRegistration: false,
    registrationRequirements: {
      ...NO_REQUIREMENTS,
      valuesReview: true,
      organizationDescription: true,
    },
  }),
  [ORGANIZATION_TYPES.BUSINESS]: freezePolicy({
    id: VERIFICATION_POLICIES.BUSINESS_VALUES_REVIEW,
    activeForRegistration: false,
    registrationRequirements: {
      ...NO_REQUIREMENTS,
      valuesReview: true,
      website: true,
      organizationDescription: true,
    },
  }),
  [ORGANIZATION_TYPES.OTHER]: freezePolicy({
    id: VERIFICATION_POLICIES.ORTHODOX_VALUES_REVIEW,
    activeForRegistration: false,
    registrationRequirements: {
      ...NO_REQUIREMENTS,
      valuesReview: true,
      organizationDescription: true,
    },
  }),
});

const UNSUPPORTED_POLICY = freezePolicy({
  id: VERIFICATION_POLICIES.UNSUPPORTED,
  activeForRegistration: false,
  registrationRequirements: NO_REQUIREMENTS,
});

export function verificationPolicyForOrganizationType(organizationType) {
  return POLICY_BY_TYPE[organizationType] || UNSUPPORTED_POLICY;
}

export function verificationPolicyForCommunityType(communityType) {
  return verificationPolicyForOrganizationType(classifyCommunityType(communityType).organizationType);
}

export function verificationPolicyForRegistration(registration = {}) {
  const classification = organizationClassificationForRegistration(registration);
  return verificationPolicyForOrganizationType(classification.organizationType);
}

export function registrationRequirementsForCommunityType(communityType) {
  return verificationPolicyForCommunityType(communityType).registrationRequirements;
}

function nonEmpty(value) {
  return Boolean(String(value || '').trim());
}

export function evaluateOnboardingVerification(registration = {}) {
  const policy = verificationPolicyForRegistration(registration);
  const requirements = policy.onboardingRequirements;
  const active = requirements.activation === 'active';
  const missingFields = requirements.evidenceFields.filter((field) => !nonEmpty(registration[field]));
  const statusVerified = registration.status === requirements.verifiedStatus;
  const passed = active && statusVerified && missingFields.length === 0;
  return Object.freeze({
    policyId: policy.id,
    activation: requirements.activation,
    active,
    passed,
    statusVerified,
    missingFields: Object.freeze(missingFields),
    incompleteMessage: requirements.incompleteMessage,
  });
}

export function verificationOnboardingSteps(registration = {}, checks = {}) {
  const policy = verificationPolicyForRegistration(registration);
  const evaluation = evaluateOnboardingVerification(registration);
  return Object.freeze(
    policy.onboardingRequirements.steps.map((definition) => {
      const manualCheck = definition.manualCheckKey ? checks[definition.manualCheckKey] : null;
      const passed =
        definition.requirement === 'verification_evidence'
          ? evaluation.passed
          : definition.requirement === 'policy_activation'
            ? evaluation.active
            : manualCheck?.status === 'passed';
      const detail =
        definition.requirement === 'manual_check'
          ? manualCheck?.note || definition.blockedDetail
          : passed
            ? definition.passedDetail || 'Required verification evidence is complete.'
            : definition.blockedDetail;
      return Object.freeze({
        key: definition.key,
        title: definition.title,
        status: passed ? 'passed' : 'blocked',
        passed,
        detail,
        owner: definition.owner,
      });
    })
  );
}
