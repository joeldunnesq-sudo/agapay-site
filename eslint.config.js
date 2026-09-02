import js from '@eslint/js';
import globals from 'globals';

const handwrittenIgnores = ['node_modules/**', 'public/vendor/**', 'tmp/**', 'tmp-*/**', '.tmp-*/**', 'artifacts/**'];
const recommendedRules = js.configs.recommended.rules;

export default [
  { ignores: handwrittenIgnores },
  {
    files: ['src/**/*.js', 'public/**/*.js', 'scripts/**/*.mjs', 'server.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'constructor-super': 'error',
      'no-constant-binary-expression': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'max-lines': ['warn', { max: 1200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/routes/**/*.js', 'src/operations/**/*.js', 'src/organizations/**/*.js', 'src/payments/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
    rules: recommendedRules,
  },
  {
    files: [
      'scripts/run-tests.mjs',
      'scripts/lint.mjs',
      'scripts/lint-warning-baseline-tests.mjs',
      'scripts/parish-diagnostics-tests.mjs',
      'scripts/lib/browser-error-gate.mjs',
      'scripts/lib/parish-browser-fixture.mjs',
      'scripts/lib/lint-warning-baseline.mjs',
      'scripts/test-manifest.mjs',
      'scripts/architecture-boundaries-tests.mjs',
      'scripts/route-registry-tests.mjs',
      'scripts/accounting-migration-ledger-tests.mjs',
      'scripts/bootstrap-accounting-migration-ledger.mjs',
      'scripts/lib/accounting-migration-ledger.mjs',
      'scripts/d1-recovery-tests.mjs',
      'scripts/d1-recovery.mjs',
      'scripts/production-monitor-alert.mjs',
      'scripts/production-monitor-tests.mjs',
      'scripts/production-monitor.mjs',
      'scripts/operations-monitoring-tests.mjs',
      'scripts/organization-readiness-tests.mjs',
      'scripts/organization-authorization-adoption-tests.mjs',
      'scripts/organization-verification-policy-adoption-tests.mjs',
      'scripts/organization-api-route-tests.mjs',
      'scripts/organization-dashboard-entitlements-tests.mjs',
      'scripts/payment-classification-tests.mjs',
      'scripts/source-size-budget-tests.mjs',
      'scripts/critical-path-manifest-tests.mjs',
      'scripts/production-operations-workflow-tests.mjs',
      'scripts/lib/d1-recovery.mjs',
      'scripts/lib/production-monitor.mjs',
    ],
    languageOptions: { globals: globals.node },
    rules: recommendedRules,
  },
  {
    files: [
      'scripts/parish-dashboard-browser-tests.mjs',
      'scripts/parish-onboarding-browser-tests.mjs',
      'scripts/parish-campaign-browser-tests.mjs',
      'scripts/parish-stewardship-browser-tests.mjs',
      'scripts/parish-giving-browser-tests.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: recommendedRules,
  },
  {
    files: [
      'public/parish/dashboard-runtime.js',
      'public/parish/features/onboarding.js',
      'public/parish/features/campaigns.js',
      'public/parish/features/stewardship.js',
      'public/parish/features/stewardship/**/*.js',
      'public/parish/features/giving.js',
      'public/parish/features/giving/**/*.js',
    ],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: recommendedRules,
  },
  {
    files: ['public/parish/feature-registry.js', 'public/parish/diagnostics.js'],
    languageOptions: { globals: globals.browser },
    rules: recommendedRules,
  },
];
