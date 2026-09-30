import type { OrganizationContext } from './context.js';
import type { OrganizationType } from './types.js';
import { ORGANIZATION_TYPES } from './types.js';

export const ORGANIZATION_API_VERSION = 'v1';

export const ORGANIZATION_API_ACCESS_REASONS = Object.freeze({
  ALLOWED: 'allowed',
  CONTEXT_MISSING: 'organization_context_missing',
  VERSION_UNSUPPORTED: 'organization_api_version_unsupported',
  ORGANIZATION_TYPE_UNAVAILABLE: 'organization_type_unavailable',
});

const ACTIVE_ORGANIZATION_TYPES: readonly OrganizationType[] = Object.freeze([
  ORGANIZATION_TYPES.CHURCH,
  ORGANIZATION_TYPES.MONASTERY,
  ORGANIZATION_TYPES.DIOCESE,
]);

export type OrganizationApiAccessReason =
  (typeof ORGANIZATION_API_ACCESS_REASONS)[keyof typeof ORGANIZATION_API_ACCESS_REASONS];
export interface OrganizationApiAccessDecision {
  readonly allowed: boolean;
  readonly organization: OrganizationContext | null;
  readonly organizationId: string;
  readonly version: string;
  readonly reason: OrganizationApiAccessReason;
}
export interface OrganizationApiDescriptor {
  readonly apiVersion: typeof ORGANIZATION_API_VERSION;
  readonly organization: Readonly<{
    id: string;
    type: OrganizationContext['organizationType'];
    subtype: OrganizationContext['organizationSubtype'];
    displayName: string;
    terminologyProfileId: string;
    moduleProfileId: OrganizationContext['moduleProfileId'];
  }>;
  readonly compatibility: Readonly<{ legacyTenantField: 'parishId'; legacyParishId: string }>;
}

function decision(
  organization: OrganizationContext | null,
  version: string,
  reason: OrganizationApiAccessReason
): OrganizationApiAccessDecision {
  return Object.freeze({
    allowed: reason === ORGANIZATION_API_ACCESS_REASONS.ALLOWED,
    organization,
    organizationId: organization?.organizationId || '',
    version,
    reason,
  });
}

export function evaluateOrganizationApiAccess(
  organization: OrganizationContext | null | undefined,
  version: string = ORGANIZATION_API_VERSION
): OrganizationApiAccessDecision {
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

export function organizationApiDescriptor(
  organization: OrganizationContext | null | undefined
): OrganizationApiDescriptor | null {
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
