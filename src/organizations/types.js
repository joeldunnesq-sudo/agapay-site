export const ORGANIZATION_TYPES = Object.freeze({
  CHURCH: 'church',
  MONASTERY: 'monastery',
  DIOCESE: 'diocese',
  MINISTRY: 'ministry',
  NONPROFIT: 'nonprofit',
  SCHOOL: 'school',
  BUSINESS: 'business',
  OTHER: 'other',
  UNKNOWN: 'unknown',
});

export const ORGANIZATION_SUBTYPES = Object.freeze({
  MISSION: 'mission',
  PARISH: 'parish',
  CATHEDRAL: 'cathedral',
  SKETE: 'skete',
  MINISTRY_NONPROFIT: 'ministry_nonprofit',
  ACADEMY: 'academy',
  UNSPECIFIED: 'unspecified',
});

const CLASSIFICATIONS = Object.freeze({
  mission: Object.freeze({
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.MISSION,
  }),
  parish: Object.freeze({
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.PARISH,
  }),
  church: Object.freeze({
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.PARISH,
  }),
  cathedral: Object.freeze({
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.CATHEDRAL,
  }),
  monastery: Object.freeze({
    organizationType: ORGANIZATION_TYPES.MONASTERY,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  'monastery / skete': Object.freeze({
    organizationType: ORGANIZATION_TYPES.MONASTERY,
    organizationSubtype: ORGANIZATION_SUBTYPES.SKETE,
  }),
  'monastery/skete': Object.freeze({
    organizationType: ORGANIZATION_TYPES.MONASTERY,
    organizationSubtype: ORGANIZATION_SUBTYPES.SKETE,
  }),
  skete: Object.freeze({
    organizationType: ORGANIZATION_TYPES.MONASTERY,
    organizationSubtype: ORGANIZATION_SUBTYPES.SKETE,
  }),
  diocese: Object.freeze({
    organizationType: ORGANIZATION_TYPES.DIOCESE,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  archdiocese: Object.freeze({
    organizationType: ORGANIZATION_TYPES.DIOCESE,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  metropolis: Object.freeze({
    organizationType: ORGANIZATION_TYPES.DIOCESE,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  ministry: Object.freeze({
    organizationType: ORGANIZATION_TYPES.MINISTRY,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  'ministry / nonprofit': Object.freeze({
    organizationType: ORGANIZATION_TYPES.MINISTRY,
    organizationSubtype: ORGANIZATION_SUBTYPES.MINISTRY_NONPROFIT,
  }),
  nonprofit: Object.freeze({
    organizationType: ORGANIZATION_TYPES.NONPROFIT,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  'school / academy': Object.freeze({
    organizationType: ORGANIZATION_TYPES.SCHOOL,
    organizationSubtype: ORGANIZATION_SUBTYPES.ACADEMY,
  }),
  school: Object.freeze({
    organizationType: ORGANIZATION_TYPES.SCHOOL,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  academy: Object.freeze({
    organizationType: ORGANIZATION_TYPES.SCHOOL,
    organizationSubtype: ORGANIZATION_SUBTYPES.ACADEMY,
  }),
  business: Object.freeze({
    organizationType: ORGANIZATION_TYPES.BUSINESS,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
  'other orthodox organization': Object.freeze({
    organizationType: ORGANIZATION_TYPES.OTHER,
    organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
  }),
});

export function normalizeCommunityType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function classifyCommunityType(value) {
  const normalizedCommunityType = normalizeCommunityType(value);
  const matched = CLASSIFICATIONS[normalizedCommunityType];
  if (!matched) {
    return Object.freeze({
      organizationType: ORGANIZATION_TYPES.UNKNOWN,
      organizationSubtype: ORGANIZATION_SUBTYPES.UNSPECIFIED,
      normalizedCommunityType,
      recognized: false,
    });
  }
  return Object.freeze({ ...matched, normalizedCommunityType, recognized: true });
}

export function organizationClassificationForRegistration(registration = {}) {
  const rawCommunityType = String(registration?.communityType || registration?.parishType || '').trim();
  return rawCommunityType ? classifyCommunityType(rawCommunityType) : legacyParishClassification();
}

export function legacyParishClassification() {
  return Object.freeze({
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.PARISH,
    normalizedCommunityType: '',
    recognized: true,
    legacyDefault: true,
  });
}
