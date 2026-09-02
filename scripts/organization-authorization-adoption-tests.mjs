import assert from 'node:assert/strict';
import { accountingContext } from '../src/handlers/accounting-ledger.js';
import { ORGANIZATION_TYPES } from '../src/organizations/index.js';

const request = new Request('https://agapay.test/api/parish/dashboard/package-two/accounting/journals');
const registration = {
  reference: 'REG-PACKAGE-TWO',
  parishId: 'package-two',
  parishName: 'Package Two Parish',
  communityType: 'Parish',
  subscriptionTier: 'parish',
};
const readyAccounting = (selectedRegistration) => ({
  registration: selectedRegistration,
  entity: { id: 'entity-package-two', entityStatus: 'ready', activationStatus: 'active' },
  registry: { provisioningStatus: 'ready', healthStatus: 'healthy' },
  db: { fixture: 'organization-scoped-accounting-database' },
});

let authorizationArguments = null;
let resolvedTenant = null;
const platformContext = await accountingContext(request, {}, registration.parishId, 'accounting.view', {
  findRegistrationByParishId: async () => ({ key: registration.reference, registration }),
  authorize: async (_request, _env, args) => {
    authorizationArguments = args;
    return {
      user: { id: 'platform-user-package-two' },
      membership: { parishId: args.parishId },
      capabilities: [args.capability],
    };
  },
  requireAccountingStaffProfile: async () => {
    throw new Error('staff fallback must not run after platform authorization succeeds');
  },
  resolveAccountingDatabaseForRegistration: async (_env, parishId, selectedRegistration) => {
    resolvedTenant = parishId;
    return readyAccounting(selectedRegistration);
  },
});
assert.deepEqual(authorizationArguments, { parishId: registration.parishId, capability: 'accounting.view' });
assert.equal(resolvedTenant, registration.parishId);
assert.equal(platformContext.organization.organizationType, ORGANIZATION_TYPES.CHURCH);
assert.equal(platformContext.organizationScope.organizationId, registration.parishId);
assert.equal(platformContext.organizationScope.legacyParishId, registration.parishId);
assert.equal(platformContext.actor.id, 'platform-user-package-two');
assert.equal(platformContext.actor.type, 'platform_user');

let staffTenant = null;
const staffContext = await accountingContext(request, {}, registration.parishId, 'accounting.view', {
  findRegistrationByParishId: async () => ({ key: registration.reference, registration }),
  authorize: async () => null,
  requireAccountingStaffProfile: async (_request, _env, parishId, capability) => {
    staffTenant = parishId;
    return {
      user: { id: 'accounting-staff-package-two' },
      membership: { parishId },
      capabilities: [capability],
      actorType: 'accounting_staff_profile',
    };
  },
  resolveAccountingDatabaseForRegistration: async (_env, _parishId, selectedRegistration) =>
    readyAccounting(selectedRegistration),
});
assert.equal(staffTenant, registration.parishId);
assert.equal(staffContext.organizationScope.organizationId, registration.parishId);
assert.equal(staffContext.actor.type, 'accounting_staff_profile');

let dormantDatabaseResolved = false;
const dormantRegistration = {
  ...registration,
  reference: 'REG-DORMANT-MINISTRY',
  parishId: 'dormant-ministry-package-two',
  parishName: 'Dormant Ministry Package Two',
  communityType: 'Ministry / Nonprofit',
};
const dormantContext = await accountingContext(request, {}, dormantRegistration.parishId, 'accounting.view', {
  findRegistrationByParishId: async () => ({ key: dormantRegistration.reference, registration: dormantRegistration }),
  authorize: async (_request, _env, args) => ({
    user: { id: 'future-ministry-user' },
    membership: { parishId: args.parishId },
    capabilities: [args.capability],
  }),
  requireAccountingStaffProfile: async () => null,
  resolveAccountingDatabaseForRegistration: async () => {
    dormantDatabaseResolved = true;
    return readyAccounting(dormantRegistration);
  },
});
assert.equal(dormantContext.error.status, 403);
assert.equal(dormantDatabaseResolved, false, 'a dormant organization must not resolve or open an accounting database');

let mismatchAuthorizationAttempted = false;
const mismatched = await accountingContext(request, {}, registration.parishId, 'accounting.view', {
  findRegistrationByParishId: async () => ({
    key: 'REG-DIFFERENT-TENANT',
    registration: { ...registration, parishId: 'different-tenant' },
  }),
  authorize: async () => {
    mismatchAuthorizationAttempted = true;
    return null;
  },
});
assert.equal(mismatched, null);
assert.equal(mismatchAuthorizationAttempted, false, 'tenant mismatch must fail before any authorization grant is used');

console.log(
  'PASS - Package 2 Accounting authorization carries verified organization context, preserves staff fallback, and denies dormant or mismatched tenants'
);
