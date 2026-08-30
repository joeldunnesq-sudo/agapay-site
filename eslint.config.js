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
    files: ['src/routes/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
    rules: recommendedRules,
  },
  {
    files: [
      'scripts/run-tests.mjs',
      'scripts/test-manifest.mjs',
      'scripts/architecture-boundaries-tests.mjs',
      'scripts/route-registry-tests.mjs',
      'scripts/accounting-migration-ledger-tests.mjs',
      'scripts/bootstrap-accounting-migration-ledger.mjs',
      'scripts/lib/accounting-migration-ledger.mjs',
    ],
    languageOptions: { globals: globals.node },
    rules: recommendedRules,
  },
  {
    files: ['public/parish/feature-registry.js'],
    languageOptions: { globals: globals.browser },
    rules: recommendedRules,
  },
];
