import { organizationClassificationForRegistration, type RegistrationRecord, type OrganizationKind } from './types.js';
import { organizationModuleProfile, type ModuleProfile } from './module-profiles.js';
import { terminologyProfileForClassification, type TerminologyProfile } from './terminology.js';
import { verificationPolicyForOrganizationType, type VerificationPolicyId } from './verification-policies.js';

export const ORGANIZATION_CONTEXT_VERSION = 1;

export interface OrganizationContext extends Readonly<OrganizationKind> {
  readonly version: typeof ORGANIZATION_CONTEXT_VERSION;
  readonly organizationId: string;
  readonly classificationRecognized: boolean;
  readonly classificationSource: 'legacy_default' | 'community_type';
  readonly publicName: string;
  readonly legalName: string;
  readonly taxClassification: string;
  readonly verificationPolicyId: VerificationPolicyId;
  readonly terminologyProfileId: string;
  readonly moduleProfileId: ModuleProfile['id'];
  readonly moduleActivation: ModuleProfile['activation'];
  readonly terminology: Readonly<TerminologyProfile>;
  readonly moduleProfile: ModuleProfile;
  readonly source: string;
  readonly legacy: Readonly<{ parishId: string; registrationReference: string }>;
}
export interface OrganizationContextOptions {
  organizationId?: unknown;
  source?: unknown;
  registrationReference?: unknown;
}
export interface RegistrationLookupResult<TRecord extends RegistrationRecord> {
  key?: unknown;
  registration?: TRecord | null;
}
export type RegistrationLookup<TEnv, TRecord extends RegistrationRecord> = (
  env: TEnv,
  organizationId: string
) =>
  RegistrationLookupResult<TRecord> | null | undefined | Promise<RegistrationLookupResult<TRecord> | null | undefined>;
export interface ResolvedOrganization<TRecord extends RegistrationRecord> {
  readonly key: string;
  readonly registration: TRecord;
  readonly organization: OrganizationContext;
}

function text(value: unknown, maxLength = 240): string {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function freezeContext(context: OrganizationContext): OrganizationContext {
  return Object.freeze({
    ...context,
    legacy: Object.freeze({ ...context.legacy }),
    moduleProfile: context.moduleProfile,
    terminology: context.terminology,
  });
}

export function organizationContextFromRegistration(
  registration: RegistrationRecord | null | undefined,
  options: OrganizationContextOptions = {}
): OrganizationContext | null {
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) return null;
  const organizationId = text(options.organizationId || registration.parishId, 200);
  if (!organizationId) return null;

  const classification = organizationClassificationForRegistration(registration);
  const publicName = text(registration.parishName || registration.organizationName || registration.legalName, 240);
  const legalName = text(
    registration.taxLegalName || registration.billingLegalName || registration.legalName || publicName,
    240
  );
  const verificationPolicy = verificationPolicyForOrganizationType(classification.organizationType);
  const terminology = terminologyProfileForClassification(classification);
  const moduleProfile = organizationModuleProfile(classification.organizationType);

  return freezeContext({
    version: ORGANIZATION_CONTEXT_VERSION,
    organizationId,
    organizationType: classification.organizationType,
    organizationSubtype: classification.organizationSubtype,
    classificationRecognized: classification.recognized,
    classificationSource: classification.legacyDefault ? 'legacy_default' : 'community_type',
    publicName,
    legalName,
    taxClassification: text(registration.taxClassification, 120) || 'unspecified',
    verificationPolicyId: verificationPolicy.id,
    terminologyProfileId: terminology.id,
    moduleProfileId: moduleProfile.id,
    moduleActivation: moduleProfile.activation,
    terminology,
    moduleProfile,
    source: text(options.source, 80) || 'registration',
    legacy: {
      parishId: text(registration.parishId || organizationId, 200),
      registrationReference: text(registration.reference || options.registrationReference, 200),
    },
  });
}

export function organizationContextForRequest(
  registration: RegistrationRecord | null | undefined,
  requestedOrganizationId: unknown,
  options: OrganizationContextOptions = {}
): OrganizationContext | null {
  const normalizedId = text(requestedOrganizationId, 200);
  const legacyParishId = text(registration?.parishId, 200);
  if (!normalizedId || !legacyParishId || normalizedId !== legacyParishId) return null;
  return organizationContextFromRegistration(registration, {
    ...options,
    organizationId: normalizedId,
  });
}

export function isOrganizationContext(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).version === ORGANIZATION_CONTEXT_VERSION &&
    typeof (value as Record<string, unknown>).organizationId === 'string' &&
    (value as Record<string, unknown>).organizationId
  );
}

export async function resolveOrganizationContext<TEnv, TRecord extends RegistrationRecord>(
  env: TEnv,
  organizationId: unknown,
  findRegistration: RegistrationLookup<TEnv, TRecord>
): Promise<ResolvedOrganization<TRecord> | null> {
  const normalizedId = text(organizationId, 200);
  if (!normalizedId) return null;
  if (typeof findRegistration !== 'function') {
    throw new TypeError('resolveOrganizationContext requires an explicit registration lookup function.');
  }
  const found = await findRegistration(env, normalizedId);
  if (!found?.registration) return null;
  const organization = organizationContextForRequest(found.registration, normalizedId, {
    registrationReference: found.key,
  });
  if (!organization) return null;
  return Object.freeze({
    key: text(found.key || found.registration.reference, 200),
    registration: found.registration,
    organization,
  });
}
