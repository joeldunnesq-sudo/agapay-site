import { isOrganizationContext } from './context.js';

export function organizationAuthorizationScope(organization) {
  if (!isOrganizationContext(organization)) return null;
  const legacyParishId = String(organization.legacy?.parishId || '').trim();
  if (!legacyParishId || legacyParishId !== organization.organizationId) return null;
  return Object.freeze({
    organizationId: organization.organizationId,
    organizationType: organization.organizationType,
    organizationSubtype: organization.organizationSubtype,
    legacyParishId,
  });
}

export function bindOrganizationAuthorizationContext(authorizationContext, organization) {
  const organizationScope = organizationAuthorizationScope(organization);
  if (!authorizationContext || typeof authorizationContext !== 'object' || !organizationScope) return null;
  return Object.freeze({ ...authorizationContext, organization, organizationScope });
}

export async function authorizeOrganization(
  request,
  env,
  { organization, capability, authorize: authorizeLegacyParish } = {}
) {
  const organizationScope = organizationAuthorizationScope(organization);
  if (!organizationScope) return null;
  if (typeof authorizeLegacyParish !== 'function') {
    throw new TypeError('authorizeOrganization requires an explicit authorization function.');
  }
  const authorizationContext = await authorizeLegacyParish(request, env, {
    parishId: organizationScope.legacyParishId,
    capability,
  });
  return bindOrganizationAuthorizationContext(authorizationContext, organization);
}

export function organizationAuditFields(organization, fields = {}) {
  const organizationScope = organizationAuthorizationScope(organization);
  if (!organizationScope || !fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const metadata =
    fields.metadata && typeof fields.metadata === 'object' && !Array.isArray(fields.metadata) ? fields.metadata : {};
  return Object.freeze({
    ...fields,
    organizationId: organizationScope.organizationId,
    metadata: Object.freeze({
      ...metadata,
      organizationType: organizationScope.organizationType,
      organizationSubtype: organizationScope.organizationSubtype,
    }),
  });
}
