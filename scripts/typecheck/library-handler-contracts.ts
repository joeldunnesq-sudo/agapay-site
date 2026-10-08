import {
  handleParishLibrary,
  createParishLibraryResource,
  listParishLibraryResources,
  validateParishLibraryPdf,
} from '../../src/handlers/parish-library.js';
import {
  bindOrganizationAuthorizationContext,
  authorizeOrganization,
  organizationAuditFields,
} from '../../src/organizations/index.js';
import type { OrganizationContext } from '../../src/organizations/context.js';
declare const organization: OrganizationContext;
declare const db: D1Database;
const request = new Request('https://example.test');
void handleParishLibrary(request, {}, 'a');
void createParishLibraryResource(db, {
  parishId: 'a',
  createdBy: 'staff',
  input: { title: 'Test', resourceType: 'pdf' },
});
const bound = bindOrganizationAuthorizationContext({ user: { id: 'u' } }, organization);
const id: string | undefined = bound?.user.id;
void id;
const audit = organizationAuditFields(organization, { action: 'library.test' });
const action: string | undefined = audit?.action;
void action;
void validateParishLibraryPdf(request).then((result) => {
  if (!result.error) {
    const bytes: ArrayBuffer | undefined = result.bytes;
    void bytes;
  }
});
// @ts-expect-error Library routes require Requests.
handleParishLibrary({}, {}, 'a');
// @ts-expect-error Mutations require D1, not a nullable read binding.
createParishLibraryResource(null, { parishId: 'a', createdBy: 'staff', input: {} });
// @ts-expect-error Mutations require an actor.
createParishLibraryResource(db, { parishId: 'a', input: {} });
// @ts-expect-error Typed list filters are boolean.
listParishLibraryResources(db, 'a', { publishedOnly: 'yes' });
// @ts-expect-error PDF validation consumes a Request.
validateParishLibraryPdf(new Uint8Array());
// @ts-expect-error Auth contexts must be objects.
bindOrganizationAuthorizationContext('user', organization);
// @ts-expect-error Authorizers must return context objects or null.
authorizeOrganization(request, {}, { organization, authorize: () => true });
// @ts-expect-error Audit fields cannot be arrays.
organizationAuditFields(organization, []);
if (bound) {
  // @ts-expect-error Bound organization identities are immutable.
  bound.organizationScope.legacyParishId = 'b';
}

const collision = bindOrganizationAuthorizationContext(
  { organization: 'untrusted', organizationScope: 'untrusted' },
  organization
);
const typedIdentity: string | undefined = collision?.organization.organizationId;
const overriddenAudit = organizationAuditFields(organization, { organizationId: 123, metadata: 'untrusted' });
const actualId: string | undefined = overriddenAudit?.organizationId;
void [typedIdentity, actualId];
