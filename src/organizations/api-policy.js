import { ORGANIZATION_TYPES } from './types.js';

export const ORGANIZATION_API_VERSION = 'v1';

export const ORGANIZATION_API_ACCESS_REASONS = Object.freeze({
  ALLOWED: 'allowed',
  CONTEXT_MISSING: 'organization_context_missing',
  VERSION_UNSUPPORTED: 'organization_api_version_unsupported',
  ORGANIZATION_TYPE_UNAVAILABLE: 'organization_type_unavailable',
});

const ACTIVE_ORGANIZATION_TYPES = Object.freeze([
  ORGANIZATION_TYPES.CHURCH,
  ORGANIZATION_TYPES.MONASTERY,
  ORGANIZATION_TYPES.DIOCESE,
]);

function decision(organization, version, reason) {
  return Object.freeze({
    allowed: reason === ORGANIZATION_API_ACCESS_REASONS.ALLOWED,
    organization,
    organizationId: organization?.organizationId || '',
    version,
    reason,
  });
}

export function evaluateOrganizationApiAccess(organization, version = ORGANIZATION_API_VERSION) {
  if (!organization) {
    return decision(null, version, ORGANIZATION_API_ACCESS_REASONS.CONTEXT_MISSING);
  }
  if (version !== ORGANIZATION_API_VERSION) {
    return decision(organization, version, ORGANIZATION_API_ACCESS_REASONS.VERSION_UNSUPPORTED);
  }
  if (
    organization.moduleActivation !== 'active' ||
    !organization.classificationRecognized ||
    !ACTIVE_ORGANIZATION_TYPES.includes(organization.organizationType)
  ) {
    return decision(organization, version, ORGANIZATION_API_ACCESS_REASONS.ORGANIZATION_TYPE_UNAVAILABLE);
  }
  return decision(organization, version, ORGANIZATION_API_ACCESS_REASONS.ALLOWED);
}

export function organizationApiDescriptor(organization) {
  if (!organization) return null;
  return Object.freeze({
    apiVersion: ORGANIZATION_API_VERSION,
    organization: Object.freeze({
      id: organization.organizationId,
      type: organization.organizationType,
      subtype: organization.organizationSubtype,
      displayName: organization.publicName,
      terminologyProfileId: organization.terminologyProfileId,
      moduleProfileId: organization.moduleProfileId,
    }),
    compatibility: Object.freeze({
      legacyTenantField: 'parishId',
      legacyParishId: organization.legacy.parishId,
    }),
  });
}
