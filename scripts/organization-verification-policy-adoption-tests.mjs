import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ORGANIZATION_TYPES,
  VERIFICATION_POLICIES,
  VERIFICATION_ONBOARDING_MANUAL_CHECKS,
  evaluateOnboardingVerification,
  verificationOnboardingSteps,
  verificationPolicyForRegistration,
} from '../src/organizations/index.js';

const canonicalEvidence = {
  status: 'verified',
  reviewedBy: 'Canonical Reviewer',
  verificationSource: 'Official diocesan directory',
  bishopOrAuthority: 'Bishop Test',
  dioceseOrDeanery: 'Test Diocese',
};

const churchPolicy = verificationPolicyForRegistration({ communityType: 'Parish' });
assert.equal(churchPolicy.id, VERIFICATION_POLICIES.CANONICAL_CHURCH);
assert.equal(churchPolicy.onboardingRequirements.activation, 'active');
assert.deepEqual(churchPolicy.onboardingRequirements.evidenceFields, [
  'reviewedBy',
  'verificationSource',
  'bishopOrAuthority',
  'dioceseOrDeanery',
]);
assert.deepEqual(churchPolicy.onboardingRequirements.manualChecks, ['authorizedRepresentative']);
assert.deepEqual(VERIFICATION_ONBOARDING_MANUAL_CHECKS, ['authorizedRepresentative']);
assert.equal(Object.isFrozen(churchPolicy.onboardingRequirements), true);
assert.equal(Object.isFrozen(churchPolicy.onboardingRequirements.evidenceFields), true);

const complete = evaluateOnboardingVerification({ communityType: 'Mission', ...canonicalEvidence });
assert.equal(complete.active, true);
assert.equal(complete.passed, true);
assert.deepEqual(complete.missingFields, []);

const incomplete = evaluateOnboardingVerification({
  communityType: 'Cathedral',
  ...canonicalEvidence,
  verificationSource: ' ',
  bishopOrAuthority: '',
});
assert.equal(incomplete.passed, false);
assert.deepEqual(incomplete.missingFields, ['verificationSource', 'bishopOrAuthority']);
assert.equal(
  incomplete.incompleteMessage,
  'Canonical verification is incomplete. Fill reviewer name, verification source, bishop/authority, and diocese/deanery before marking verified.'
);

const legacy = evaluateOnboardingVerification(canonicalEvidence);
assert.equal(legacy.policyId, VERIFICATION_POLICIES.CANONICAL_CHURCH);
assert.equal(legacy.passed, true, 'legacy registrations without communityType must preserve parish verification');

const checks = {
  authorizedRepresentative: {
    status: 'passed',
    note: 'The priest confirmed the treasurer.',
  },
};
const churchSteps = verificationOnboardingSteps({ communityType: 'Monastery / Skete', ...canonicalEvidence }, checks);
assert.deepEqual(
  churchSteps.map(({ key, title, status, passed, detail, owner }) => ({
    key,
    title,
    status,
    passed,
    detail,
    owner,
  })),
  [
    {
      key: 'canonical',
      title: 'Canonical parish confirmed',
      status: 'passed',
      passed: true,
      detail: 'Canonical review fields are complete.',
      owner: 'AGAPAY',
    },
    {
      key: 'representative',
      title: 'Approving priest confirmed treasurer',
      status: 'passed',
      passed: true,
      detail: 'The priest confirmed the treasurer.',
      owner: 'AGAPAY',
    },
  ],
  'active church and monastery workflows must keep the current review copy and ordering'
);

const representativeWithoutNote = verificationOnboardingSteps(
  { communityType: 'Parish', ...canonicalEvidence },
  { authorizedRepresentative: { status: 'passed' } }
)[1];
assert.equal(representativeWithoutNote.passed, true);
assert.equal(
  representativeWithoutNote.detail,
  "Verify the priest from an official source, then record that leader's confirmation of the treasurer's name and email."
);

for (const organizationType of [
  ORGANIZATION_TYPES.MINISTRY,
  ORGANIZATION_TYPES.NONPROFIT,
  ORGANIZATION_TYPES.SCHOOL,
  ORGANIZATION_TYPES.BUSINESS,
  ORGANIZATION_TYPES.OTHER,
]) {
  const labels = {
    [ORGANIZATION_TYPES.MINISTRY]: 'Ministry',
    [ORGANIZATION_TYPES.NONPROFIT]: 'Nonprofit',
    [ORGANIZATION_TYPES.SCHOOL]: 'School',
    [ORGANIZATION_TYPES.BUSINESS]: 'Business',
    [ORGANIZATION_TYPES.OTHER]: 'Other Orthodox Organization',
  };
  const evaluation = evaluateOnboardingVerification({
    communityType: labels[organizationType],
    ...canonicalEvidence,
  });
  assert.equal(evaluation.active, false, `${organizationType} must remain reserved`);
  assert.equal(evaluation.passed, false, `${organizationType} must not inherit canonical church approval`);
  const [policyStep] = verificationOnboardingSteps({
    communityType: labels[organizationType],
    ...canonicalEvidence,
  });
  assert.equal(policyStep.key, 'verificationPolicy');
  assert.equal(policyStep.passed, false);
}

const unknown = evaluateOnboardingVerification({
  communityType: 'Invented Organization Type',
  ...canonicalEvidence,
});
assert.equal(unknown.policyId, VERIFICATION_POLICIES.UNSUPPORTED);
assert.equal(unknown.active, false);
assert.equal(unknown.passed, false);

const onboardingSource = await readFile(new URL('../src/lib/parish-onboarding.js', import.meta.url), 'utf8');
assert.match(onboardingSource, /verificationOnboardingSteps\(registration, checks\)/);
assert.doesNotMatch(
  onboardingSource,
  /registration\.reviewedBy[\s\S]*registration\.verificationSource[\s\S]*registration\.bishopOrAuthority/,
  'the workflow must not reconstruct canonical policy evidence outside the policy module'
);

const adminSource = await readFile(new URL('../src/handlers/admin.js', import.meta.url), 'utf8');
assert.match(adminSource, /evaluateOnboardingVerification/);
assert.match(adminSource, /onboardingVerification\.incompleteMessage/);
assert.match(adminSource, /onboardingVerification\.missingFields/);
assert.doesNotMatch(adminSource, /missing\.push\("reviewedBy"\)/);

console.log(
  'PASS - Package 4 verification policy owns canonical evidence and onboarding steps while future policies fail closed'
);
