import assert from 'node:assert/strict';
import { testGroups } from './test-manifest.mjs';

const requiredCriticalSuites = [
  'scripts/worker-hardening-tests.mjs',
  'scripts/privileged-mfa-tests.mjs',
  'scripts/consumer-passkey-tests.mjs',
  'scripts/accounting-gateway-tests.mjs',
  'scripts/organization-authorization-adoption-tests.mjs',
  'scripts/organization-verification-policy-adoption-tests.mjs',
  'scripts/organization-api-route-tests.mjs',
  'scripts/organization-dashboard-entitlements-tests.mjs',
  'scripts/payment-classification-tests.mjs',
  'scripts/accounting-staff-access-tests.mjs',
  'scripts/accounting-ledger-tests.mjs',
  'scripts/accounting-migration-ledger-tests.mjs',
  'scripts/stripe-source-event-tests.mjs',
];

assert.deepEqual(
  testGroups.critical,
  requiredCriticalSuites,
  'Critical auth and financial runtime suites must stay explicit and ordered.'
);
for (const suite of requiredCriticalSuites) {
  assert.ok(testGroups.all.includes(suite), `${suite} must remain in the required CI test set.`);
}

console.log('PASS - critical authentication and financial runtime coverage stays in required CI');
