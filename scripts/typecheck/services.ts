// Compile-time contract tests; never executed or deployed.
import type { RegistrationRecord } from '../../src/organizations/types.js';
import {
  isOrganizationContext,
  organizationContextFromRegistration,
  resolveOrganizationContext,
  type OrganizationContext,
} from '../../src/organizations/context.js';
import { organizationApiDescriptor } from '../../src/organizations/api-policy.js';
import { evaluateOrganizationModuleAccess } from '../../src/organizations/module-access.js';
import { verificationOnboardingSteps } from '../../src/organizations/verification-policies.js';
import { getReadContentIds, getReadReceipts, markContentRead } from '../../src/lib/content-reads.js';

interface StoredRegistration extends RegistrationRecord {
  parishId: string;
  reviewNote: string | null;
}
declare const registration: StoredRegistration;
declare const context: OrganizationContext;
declare const untrusted: unknown;
declare const db: D1Database;

const resolved = await resolveOrganizationContext({ bucket: 'registrations' }, 'parish-one', async (env, id) => {
  const bucket: string = env.bucket;
  const parishId: string = id;
  void [bucket, parishId];
  return { key: 'REG-ONE', registration };
});
if (resolved) {
  const note: string | null = resolved.registration.reviewNote;
  const id: string = resolved.organization.organizationId;
  // @ts-expect-error Persisted nullable fields must be narrowed.
  const assumedNote: string = resolved.registration.reviewNote;
  void [note, id, assumedNote];
}
// @ts-expect-error Repository lookups may not find a matching organization.
void resolved.organization.organizationId;
// @ts-expect-error Database lookup callbacks must return a record, not an ID.
resolveOrganizationContext({}, 'parish-one', async () => ({ registration: 'parish-one' }));
// @ts-expect-error Lookups require an explicit repository callback.
resolveOrganizationContext({}, 'parish-one');

const descriptor = organizationApiDescriptor(context);
if (descriptor) {
  const publicName: string = descriptor.organization.displayName;
  // @ts-expect-error Private storage fields are not part of the public API descriptor.
  void descriptor.organization.stripeAccountId;
  // @ts-expect-error Public response fields are readonly.
  descriptor.organization.displayName = 'changed';
  void publicName;
}
// @ts-expect-error Nested context fields are immutable.
context.legacy.parishId = 'other-tenant';
// @ts-expect-error Module eligibility lists are immutable.
context.moduleProfile.eligibleModules.push('accounting');
if (isOrganizationContext(untrusted)) {
  // @ts-expect-error The existing version/ID probe does not validate a full context.
  void untrusted.legacy.parishId;
}
const absent = organizationContextFromRegistration(null);
// @ts-expect-error Invalid registrations may yield no context.
void absent.organizationId;
evaluateOrganizationModuleAccess(registration, 'library', (record, moduleId) => record.parishId === moduleId);
// @ts-expect-error An async entitlement callback would be truthy without evaluating its result.
evaluateOrganizationModuleAccess(registration, 'library', async () => false);

const steps = verificationOnboardingSteps(registration, { authorizedRepresentative: { note: null } });
// @ts-expect-error Existing stored notes are unknown until the caller narrows them.
const assumedDetail: string = steps[0].detail;
void assumedDetail;

const scope = { parishId: 'parish-one', contentType: 'teaching', contentId: 'content-one' };
const ids: string[] = await getReadContentIds(db, { ...scope, donorId: 'donor-one', contentIds: ['content-one'] });
const receipts = await getReadReceipts(db, scope);
const readAt: string = receipts[0].readAt;
// @ts-expect-error Marking a read requires the donor scope.
markContentRead(db, scope);
// @ts-expect-error SQL-bound content IDs must be strings.
getReadContentIds(db, { ...scope, donorId: 'donor-one', contentIds: [42] });
// @ts-expect-error Storage column names must not leak into the response contract.
void receipts[0].read_at;
void [ids, readAt];
