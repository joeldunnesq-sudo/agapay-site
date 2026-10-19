import type { RegistrationRecord } from './types.js';
import {
  organizationContextForRequest,
  organizationContextFromRegistration,
  type OrganizationContext,
} from './context.js';
import { organizationTypeEligibleForModule } from './module-profiles.js';

export const ORGANIZATION_ACCESS_REASONS = Object.freeze({
  ALLOWED: 'allowed',
  CONTEXT_MISSING: 'organization_context_missing',
  MODULE_MISSING: 'module_missing',
  ORGANIZATION_TYPE_INELIGIBLE: 'organization_type_ineligible',
  SUBSCRIPTION_NOT_ENTITLED: 'subscription_not_entitled',
});

export type OrganizationAccessReason = (typeof ORGANIZATION_ACCESS_REASONS)[keyof typeof ORGANIZATION_ACCESS_REASONS];
export interface OrganizationAccessDecision {
  readonly allowed: boolean;
  readonly organization: OrganizationContext | null;
  readonly organizationId: string;
  readonly moduleId: string;
  readonly eligible: boolean;
  readonly entitled: boolean;
  readonly reason: OrganizationAccessReason;
}
type DecisionInput = Partial<
  Pick<OrganizationAccessDecision, 'organization' | 'moduleId' | 'eligible' | 'entitled'>
> & {
  reason: OrganizationAccessReason;
};
export interface OrganizationAccessOptions {
  organizationId?: unknown;
  registrationReference?: unknown;
}
export type EntitlementEvaluator<TRecord> = (registration: TRecord, moduleId: string) => boolean;

function accessDecision({
  organization = null,
  moduleId = '',
  eligible = false,
  entitled = false,
  reason,
}: DecisionInput): OrganizationAccessDecision {
  return Object.freeze({
    allowed: reason === ORGANIZATION_ACCESS_REASONS.ALLOWED,
    organization,
    organizationId: organization?.organizationId || '',
    moduleId,
    eligible,
    entitled,
    reason,
  });
}

export function evaluateOrganizationModuleAccess<TRecord extends RegistrationRecord | null | undefined>(
  registration: TRecord,
  moduleId: unknown,
  entitlementEvaluator: EntitlementEvaluator<TRecord>,
  { organizationId = '', registrationReference = '' }: OrganizationAccessOptions = {}
): OrganizationAccessDecision {
  if (typeof entitlementEvaluator !== 'function') {
    throw new TypeError('evaluateOrganizationModuleAccess requires an explicit entitlement evaluator.');
  }

  const normalizedModuleId = String(moduleId || '').trim();
  const organization = organizationId
    ? organizationContextForRequest(registration, organizationId, { registrationReference })
    : organizationContextFromRegistration(registration, { registrationReference });

  if (!organization) {
    return accessDecision({ moduleId: normalizedModuleId, reason: ORGANIZATION_ACCESS_REASONS.CONTEXT_MISSING });
  }
  if (!normalizedModuleId) {
    return accessDecision({ organization, reason: ORGANIZATION_ACCESS_REASONS.MODULE_MISSING });
  }

  const eligible = organizationTypeEligibleForModule(organization.organizationType, normalizedModuleId);
  if (!eligible) {
    return accessDecision({
      organization,
      moduleId: normalizedModuleId,
      reason: ORGANIZATION_ACCESS_REASONS.ORGANIZATION_TYPE_INELIGIBLE,
    });
  }

  const entitled = Boolean(entitlementEvaluator(registration, normalizedModuleId));
  if (!entitled) {
    return accessDecision({
      organization,
      moduleId: normalizedModuleId,
      eligible,
      reason: ORGANIZATION_ACCESS_REASONS.SUBSCRIPTION_NOT_ENTITLED,
    });
  }

  return accessDecision({
    organization,
    moduleId: normalizedModuleId,
    eligible,
    entitled,
    reason: ORGANIZATION_ACCESS_REASONS.ALLOWED,
  });
}
