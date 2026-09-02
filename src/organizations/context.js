import { organizationClassificationForRegistration } from './types.js';
import { organizationModuleProfile } from './module-profiles.js';
import { terminologyProfileForClassification } from './terminology.js';
import { verificationPolicyForOrganizationType } from './verification-policies.js';

export const ORGANIZATION_CONTEXT_VERSION = 1;

function text(value, maxLength = 240) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function freezeContext(context) {
  return Object.freeze({
    ...context,
    legacy: Object.freeze({ ...context.legacy }),
    moduleProfile: context.moduleProfile,
    terminology: context.terminology,
  });
}

export function organizationContextFromRegistration(registration, options = {}) {
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

export function organizationContextForRequest(registration, requestedOrganizationId, options = {}) {
  const normalizedId = text(requestedOrganizationId, 200);
  const legacyParishId = text(registration?.parishId, 200);
  if (!normalizedId || !legacyParishId || normalizedId !== legacyParishId) return null;
  return organizationContextFromRegistration(registration, {
    ...options,
    organizationId: normalizedId,
  });
}

export function isOrganizationContext(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.version === ORGANIZATION_CONTEXT_VERSION &&
    typeof value.organizationId === 'string' &&
    value.organizationId
  );
}

export async function resolveOrganizationContext(env, organizationId, findRegistration) {
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
