import type { OrganizationContext } from './context.js';
import { isOrganizationContext } from './context.js';

export function organizationAuthorizationScope(organization: OrganizationContext | null | undefined) {
  if (!isOrganizationContext(organization)) return null;
  const legacyParishId = String(organization!.legacy?.parishId || '').trim();
  if (!legacyParishId || legacyParishId !== organization!.organizationId) return null;
  return Object.freeze({
    organizationId: organization!.organizationId,
    organizationType: organization!.organizationType,
    organizationSubtype: organization!.organizationSubtype,
    legacyParishId,
  });
}

export type BoundOrganizationAuthorization<T extends object> = Readonly<
  Omit<T, 'organization' | 'organizationScope'> & {
    organization: OrganizationContext;
    organizationScope: NonNullable<ReturnType<typeof organizationAuthorizationScope>>;
  }
>;

export function bindOrganizationAuthorizationContext<T extends object>(
  authorizationContext: T | null | undefined,
  organization: OrganizationContext | null | undefined
): BoundOrganizationAuthorization<T> | null {
  const organizationScope = organizationAuthorizationScope(organization);
  if (!authorizationContext || typeof authorizationContext !== 'object' || !organizationScope) return null;
  return Object.freeze({ ...authorizationContext, organization: organization!, organizationScope });
}

export async function authorizeOrganization<TEnv, TAuth extends object>(
  request: Request,
  env: TEnv,
  {
    organization,
    capability,
    authorize: authorizeLegacyParish,
  }: {
    organization?: OrganizationContext | null;
    capability?: string;
    authorize?: (
      request: Request,
      env: TEnv,
      options: { parishId: string; capability?: string }
    ) => Promise<TAuth | null | undefined> | TAuth | null | undefined;
  } = {}
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

export type OrganizationAuditFields<T extends Record<string, unknown>> = Readonly<
  Omit<T, 'organizationId' | 'metadata'> & {
    organizationId: string;
    metadata: Readonly<Record<string, unknown> & Pick<OrganizationContext, 'organizationType' | 'organizationSubtype'>>;
  }
>;

export function organizationAuditFields<T extends Record<string, unknown>>(
  organization: OrganizationContext | null | undefined,
  fields: T = {} as T
): OrganizationAuditFields<T> | null {
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
