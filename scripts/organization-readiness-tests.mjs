import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ORGANIZATION_ACCESS_REASONS,
  ORGANIZATION_MODULES,
  ORGANIZATION_SUBTYPES,
  ORGANIZATION_TYPES,
  VERIFICATION_POLICIES,
  authorizeOrganization,
  bindOrganizationAuthorizationContext,
  classifyCommunityType,
  evaluateOrganizationModuleAccess,
  isOrganizationContext,
  organizationAuditFields,
  organizationAuthorizationScope,
  organizationContextForRequest,
  organizationContextFromRegistration,
  organizationTypeEligibleForModule,
  registrationRequirementsForCommunityType,
  resolveOrganizationContext,
} from '../src/organizations/index.js';
import {
  registrationRequiresJurisdiction,
  registrationRequiresValuesReview,
  registrationRequiresWebsite,
} from '../src/lib/registration-intake.js';

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test('church community types normalize without changing their product meaning', () => {
  assert.deepEqual(classifyCommunityType('Mission'), {
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.MISSION,
    normalizedCommunityType: 'mission',
    recognized: true,
  });
  assert.equal(classifyCommunityType('Parish').organizationSubtype, ORGANIZATION_SUBTYPES.PARISH);
  assert.equal(classifyCommunityType('Cathedral').organizationSubtype, ORGANIZATION_SUBTYPES.CATHEDRAL);
  assert.equal(classifyCommunityType('Monastery / Skete').organizationType, ORGANIZATION_TYPES.MONASTERY);
});

await test('registration requirements preserve existing church and coming-soon intake behavior', () => {
  for (const type of ['Mission', 'Parish', 'Cathedral', 'Monastery', 'Monastery / Skete']) {
    assert.equal(registrationRequiresJurisdiction(type), true, `${type} must require a jurisdiction`);
    assert.equal(registrationRequiresValuesReview(type), false);
  }
  for (const type of ['Ministry / Nonprofit', 'School / Academy', 'Other Orthodox Organization']) {
    assert.equal(registrationRequiresJurisdiction(type), false);
    assert.equal(registrationRequiresValuesReview(type), true, `${type} must require values review`);
    assert.equal(registrationRequiresWebsite(type), false);
  }
  assert.equal(registrationRequiresValuesReview('Business'), true);
  assert.equal(registrationRequiresWebsite('Business'), true);
  assert.equal(registrationRequiresJurisdiction(' parish '), true, 'normalization must not permit a validation bypass');
});

await test('verification requirements are policy data rather than subscription inference', () => {
  const church = registrationRequirementsForCommunityType('Parish');
  const business = registrationRequirementsForCommunityType('Business');
  const unknown = registrationRequirementsForCommunityType('Unlisted Type');
  assert.equal(church.jurisdiction, true);
  assert.equal(business.website, true);
  assert.equal(business.organizationDescription, true);
  assert.deepEqual(unknown, {
    jurisdiction: false,
    valuesReview: false,
    website: false,
    organizationDescription: false,
  });
});

await test('organization context is immutable, bounded, and backward compatible', () => {
  const registration = {
    reference: 'REG-ST-FIACRE',
    parishId: 'st-fiacre',
    parishName: 'St. Fiacre Orthodox Mission',
    communityType: 'Mission',
    taxLegalName: 'St. Fiacre Orthodox Mission',
    subscriptionTier: 'parish',
    stripeAccountId: 'acct_must_not_leak',
    parishDashboardPasswordRecord: { hash: 'must-not-leak' },
  };
  const context = organizationContextFromRegistration(registration);
  assert.equal(isOrganizationContext(context), true);
  assert.equal(context.organizationId, 'st-fiacre');
  assert.equal(context.organizationType, ORGANIZATION_TYPES.CHURCH);
  assert.equal(context.organizationSubtype, ORGANIZATION_SUBTYPES.MISSION);
  assert.equal(context.verificationPolicyId, VERIFICATION_POLICIES.CANONICAL_CHURCH);
  assert.equal(context.terminology.organization, 'mission');
  assert.equal(context.legacy.parishId, 'st-fiacre');
  assert.equal(context.taxClassification, 'unspecified', 'tax status must not be inferred from organization type');
  assert.equal('registration' in context, false);
  assert.equal('stripeAccountId' in context, false);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.legacy), true);
  assert.equal(Object.isFrozen(context.moduleProfile), true);
});

await test('request context rejects a registration returned for a different tenant', () => {
  const registration = {
    reference: 'REG-REQUEST-CONTEXT',
    parishId: 'requested-parish',
    parishName: 'Requested Parish',
    communityType: 'Parish',
  };
  const context = organizationContextForRequest(registration, 'requested-parish', {
    registrationReference: registration.reference,
  });
  assert.equal(context.organizationId, 'requested-parish');
  assert.equal(context.legacy.registrationReference, registration.reference);
  assert.equal(organizationContextForRequest(registration, 'different-parish'), null);
  assert.equal(organizationContextForRequest(registration, ''), null);
});

await test('legacy records with no community type retain the parish compatibility profile', () => {
  const context = organizationContextFromRegistration({ parishId: 'legacy-parish', parishName: 'Legacy Parish' });
  assert.equal(context.organizationType, ORGANIZATION_TYPES.CHURCH);
  assert.equal(context.organizationSubtype, ORGANIZATION_SUBTYPES.PARISH);
  assert.equal(context.classificationSource, 'legacy_default');
  assert.equal(context.moduleActivation, 'active');
});

await test('a dormant ministry is recognized but cannot receive modules from a parish subscription', () => {
  const context = organizationContextFromRegistration({
    parishId: 'future-ministry-fixture',
    parishName: 'Future Orthodox Ministry',
    communityType: 'Ministry / Nonprofit',
    subscriptionTier: 'parish',
  });
  assert.equal(context.organizationType, ORGANIZATION_TYPES.MINISTRY);
  assert.equal(context.organizationSubtype, ORGANIZATION_SUBTYPES.MINISTRY_NONPROFIT);
  assert.equal(context.verificationPolicyId, VERIFICATION_POLICIES.ORTHODOX_MINISTRY_REVIEW);
  assert.equal(context.terminologyProfileId, 'organization');
  assert.equal(context.moduleActivation, 'reserved');
  assert.deepEqual(context.moduleProfile.eligibleModules, []);
  assert.equal(organizationTypeEligibleForModule(context.organizationType, ORGANIZATION_MODULES.SACRAMENTS), false);
  assert.equal(
    organizationTypeEligibleForModule(context.organizationType, ORGANIZATION_MODULES.ACCOUNTING),
    false,
    'subscription tier must not activate a dormant organization profile'
  );
});

await test('module access requires both organization eligibility and subscription entitlement', () => {
  const churchRegistration = {
    parishId: 'church-access-fixture',
    parishName: 'Church Access Fixture',
    communityType: 'Parish',
  };
  const allowed = evaluateOrganizationModuleAccess(churchRegistration, ORGANIZATION_MODULES.LIBRARY, () => true, {
    organizationId: churchRegistration.parishId,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, ORGANIZATION_ACCESS_REASONS.ALLOWED);
  assert.equal(allowed.eligible, true);
  assert.equal(allowed.entitled, true);

  const notEntitled = evaluateOrganizationModuleAccess(churchRegistration, ORGANIZATION_MODULES.LIBRARY, () => false);
  assert.equal(notEntitled.allowed, false);
  assert.equal(notEntitled.reason, ORGANIZATION_ACCESS_REASONS.SUBSCRIPTION_NOT_ENTITLED);

  const dormant = evaluateOrganizationModuleAccess(
    {
      parishId: 'future-ministry-access-fixture',
      parishName: 'Future Ministry Access Fixture',
      communityType: 'Ministry / Nonprofit',
    },
    ORGANIZATION_MODULES.LIBRARY,
    () => {
      throw new Error('an ineligible organization must not reach subscription evaluation');
    }
  );
  assert.equal(dormant.allowed, false);
  assert.equal(dormant.reason, ORGANIZATION_ACCESS_REASONS.ORGANIZATION_TYPE_INELIGIBLE);
  assert.equal(dormant.entitled, false);

  const monastery = evaluateOrganizationModuleAccess(
    { parishId: 'monastery-access-fixture', parishName: 'Monastery Fixture', communityType: 'Monastery' },
    ORGANIZATION_MODULES.LIBRARY,
    () => true
  );
  assert.equal(monastery.allowed, true, 'active monastery subscriptions keep their existing module behavior');

  const mismatch = evaluateOrganizationModuleAccess(churchRegistration, ORGANIZATION_MODULES.LIBRARY, () => true, {
    organizationId: 'different-parish',
  });
  assert.equal(mismatch.reason, ORGANIZATION_ACCESS_REASONS.CONTEXT_MISSING);
});

await test('authorization and audit adapters preserve the legacy parish contract behind organization context', async () => {
  const organization = organizationContextFromRegistration({
    parishId: 'adapter-parish',
    parishName: 'Adapter Parish',
    communityType: 'Parish',
  });
  const scope = organizationAuthorizationScope(organization);
  assert.deepEqual(scope, {
    organizationId: 'adapter-parish',
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.PARISH,
    legacyParishId: 'adapter-parish',
  });

  const bound = bindOrganizationAuthorizationContext({ membership: { id: 'membership-1' } }, organization);
  assert.equal(bound.organization, organization);
  assert.deepEqual(bound.organizationScope, scope);
  assert.equal(Object.isFrozen(bound), true);

  let authorizationArguments = null;
  const authorized = await authorizeOrganization(
    new Request('https://agapay.test/library'),
    {},
    {
      organization,
      capability: 'library.manage',
      authorize: async (_request, _env, args) => {
        authorizationArguments = args;
        return { membership: { id: 'membership-1' }, capabilities: ['library.manage'] };
      },
    }
  );
  assert.deepEqual(authorizationArguments, { parishId: 'adapter-parish', capability: 'library.manage' });
  assert.equal(authorized.organization.organizationId, 'adapter-parish');
  assert.equal(await authorizeOrganization(null, {}, { organization, authorize: async () => null }), null);
  await assert.rejects(
    () => authorizeOrganization(null, {}, { organization, capability: 'library.manage' }),
    /explicit authorization function/
  );

  const auditFields = organizationAuditFields(organization, {
    action: 'library.resource_created',
    organizationId: 'client-supplied-id',
    metadata: { source: 'test', organizationType: 'client-supplied-type' },
  });
  assert.equal(auditFields.organizationId, 'adapter-parish');
  assert.deepEqual(auditFields.metadata, {
    source: 'test',
    organizationType: ORGANIZATION_TYPES.CHURCH,
    organizationSubtype: ORGANIZATION_SUBTYPES.PARISH,
  });
  assert.equal(Object.isFrozen(auditFields), true);
  assert.equal(Object.isFrozen(auditFields.metadata), true);
});

await test('unknown explicit classifications fail closed instead of becoming legacy parishes', () => {
  const context = organizationContextFromRegistration({
    parishId: 'unknown-fixture',
    parishName: 'Unknown Fixture',
    communityType: 'Unexpected Organization Type',
  });
  assert.equal(context.organizationType, ORGANIZATION_TYPES.UNKNOWN);
  assert.equal(context.classificationRecognized, false);
  assert.equal(context.verificationPolicyId, VERIFICATION_POLICIES.UNSUPPORTED);
  assert.equal(context.moduleActivation, 'reserved');
  assert.deepEqual(context.moduleProfile.eligibleModules, []);
});

await test('resolver uses an injected repository lookup and rejects tenant mismatches', async () => {
  const lookup = async (_env, organizationId) => ({
    key: 'REG-LOOKUP',
    registration: { parishId: organizationId, parishName: 'Lookup Parish', communityType: 'Parish' },
  });
  const resolved = await resolveOrganizationContext({}, 'lookup-parish', lookup);
  assert.equal(resolved.organization.organizationId, 'lookup-parish');
  assert.equal(resolved.key, 'REG-LOOKUP');
  assert.equal(Object.isFrozen(resolved), true);

  const mismatch = await resolveOrganizationContext({}, 'requested-parish', async () => ({
    key: 'REG-WRONG',
    registration: { parishId: 'different-parish', parishName: 'Different Parish', communityType: 'Parish' },
  }));
  assert.equal(mismatch, null);
  assert.equal(await resolveOrganizationContext({}, 'missing', async () => null), null);
  await assert.rejects(() => resolveOrganizationContext({}, 'lookup-parish'), /explicit registration lookup/);
});

await test('organization boundary stays independent from handlers, bindings, and entitlements', async () => {
  const files = [
    'access.js',
    'context.js',
    'module-access.js',
    'module-profiles.js',
    'terminology.js',
    'types.js',
    'verification-policies.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../src/organizations/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\.\/handlers\//, `${file} must not import a handler`);
    assert.doesNotMatch(source, /AGAPAY_DB|AGAPAY_REGISTRATIONS/, `${file} must not reach bindings directly`);
    assert.doesNotMatch(source, /from ['"].*subscriptions\.js/, `${file} must not infer type from subscriptions`);
    assert.doesNotMatch(source, /from ['"].*entitlements\.js/, `${file} must not grant entitlements`);
  }
});

await test('the authenticated Parish Library is the first organization-context production adapter', async () => {
  const handler = await readFile(new URL('../src/handlers/parish-library.js', import.meta.url), 'utf8');
  assert.match(handler, /evaluateOrganizationModuleAccess/);
  assert.match(handler, /bindOrganizationAuthorizationContext/);
  assert.match(handler, /organizationScope\.legacyParishId/);
  assert.match(handler, /organizationAuditFields/);
  assert.match(handler, /library\.resource_created/);
});

await test('architecture guide records the fail-closed compatibility contract', async () => {
  const guide = await readFile(new URL('../docs/architecture/organization-readiness.md', import.meta.url), 'utf8');
  assert.match(guide, /Do not perform a global `parish` to `organization` rename/);
  assert.match(guide, /Do not duplicate the registration source of truth/);
  assert.match(guide, /Unknown or dormant organization types fail closed/);
});

if (process.exitCode) {
  console.error(`\n${passed} organization-readiness assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. organization-readiness-tests.mjs OK.`);
