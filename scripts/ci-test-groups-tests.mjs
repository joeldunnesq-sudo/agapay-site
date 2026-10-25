import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { testGroups } from './test-manifest.mjs';
import { ciGroupNames, partitionCiTests } from './lib/ci-test-groups.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const groups = partitionCiTests();
const combined = Object.values(groups).flat();
assert.deepEqual([...combined].sort(), [...testGroups.all].sort(), 'CI must run every full-suite command exactly once');
assert.equal(new Set(combined).size, combined.length, 'CI partitions must not overlap');
for (const name of ciGroupNames) assert.ok(groups[name].length, `${name} must contain tests`);
assert.deepEqual(partitionCiTests(['scripts/new-feature-tests.mjs']).other, ['scripts/new-feature-tests.mjs']);

const timing = JSON.parse(read('config/ci-test-durations.json'));
assert.ok(Number.isFinite(timing.defaultSeconds) && timing.defaultSeconds > 0);
for (const seconds of Object.values(timing.durationSeconds)) assert.ok(Number.isFinite(seconds) && seconds > 0);
for (const [name, tests] of Object.entries(groups)) {
  const expectedOrder = testGroups.all.filter((test) => tests.includes(test));
  assert.deepEqual(tests, expectedOrder, `${name} must retain manifest order`);
  const seconds = tests.reduce((sum, test) => sum + (timing.durationSeconds[test] ?? timing.defaultSeconds), 0);
  if (name.startsWith('browser-')) assert.ok(seconds <= 65, `${name} exceeds the 65-second execution budget`);
  if (name.startsWith('core-')) assert.ok(seconds <= 80, `${name} exceeds the 80-second execution budget`);
}
assert.ok(
  [...groups['core-1'], ...groups['core-2']].includes('scripts/browser-typescript-tests.mjs'),
  'Source-only TypeScript checks should not consume the Chromium jobs'
);

// Heavy tests in the same modulo position should still spread over all runners.
const sample = Array.from({ length: 16 }, (_, index) => `scripts/example-${index}-browser-tests.mjs`);
const costs = Object.fromEntries(sample.map((test, index) => [test, index % 4 === 0 ? 9 - index / 4 : 1]));
const balanced = partitionCiTests(sample, costs);
for (const name of ciGroupNames.filter((name) => name.startsWith('browser-'))) {
  assert.ok(balanced[name].reduce((sum, test) => sum + costs[test], 0) <= 11, 'Heavy commands must be balanced');
}
assert.deepEqual(
  partitionCiTests(sample, costs),
  balanced,
  'Every runner must compute the same deterministic assignment'
);
assert.equal(Object.values(partitionCiTests([...sample, 'scripts/new-browser-tests.mjs'], costs)).flat().length, 17);

// Catch new Playwright consumers that do not follow the browser filename convention.
for (const spec of testGroups.all) {
  if (spec.startsWith('node-check:') || spec.endsWith(' --static-only')) continue;
  const source = read(spec.split(/\s+/)[0]);
  if (/from ['"]playwright['"]|import\(['"]playwright['"]\)/.test(source)) {
    assert.ok(
      ciGroupNames.filter((name) => name.startsWith('browser-')).some((name) => groups[name].includes(spec)),
      `${spec} requires a Chromium job`
    );
  }
}

const workflow = read('.github/workflows/test-suite.yml');
assert.match(workflow, /workflow_call:/);
const matrix = workflow.match(/group:\s*\[([^\]]+)\]/);
const matrixNames = matrix
  ? matrix[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  : [...workflow.matchAll(/^\s{10}- ([\w-]+)$/gm)].map((match) => match[1]);
assert.ok(matrixNames.length, 'The reusable workflow must declare the group matrix');
assert.deepEqual(matrixNames, ciGroupNames);
assert.match(workflow, /fail-fast: false/);
assert.match(workflow, /run: npm run precheck/);
assert.match(workflow, /run: node scripts\/ci-test-groups-tests\.mjs/);
assert.match(
  workflow,
  /if: startsWith\(matrix\.group, 'browser-'\)\s+run: npx playwright install chromium --with-deps/
);
assert.match(workflow, /run: node scripts\/run-tests\.mjs --ci-group \$\{\{ matrix\.group \}\}/);
assert.doesNotMatch(workflow, /secrets:|continue-on-error:|max-parallel:/);

const qualityWorkflow = read('.github/workflows/quality-suite.yml');
const qualityCommands = [...qualityWorkflow.matchAll(/^\s+command: (.+)$/gm)].flatMap((match) =>
  match[1].split(' && ')
);
const requiredQualityCommands = JSON.parse(read('package.json')).scripts.quality.split(' && ');
assert.deepEqual(
  qualityCommands.sort(),
  requiredQualityCommands.sort(),
  'Parallel quality must preserve every npm run quality command exactly once'
);
assert.match(qualityWorkflow, /fail-fast: false/);
assert.doesNotMatch(qualityWorkflow, /secrets:|continue-on-error:/);

for (const path of ['.github/workflows/deploy.yml', '.github/workflows/deploy-staging.yml']) {
  const caller = read(path);
  assert.match(caller, /test-suites:\s+name: Parallel tests\s+uses: \.\/\.github\/workflows\/test-suite\.yml/);
  assert.match(caller, /test:\s+name: Test\s+needs: test-suites\s+if: always\(\)/);
  assert.match(caller, /TEST_RESULT: \$\{\{ needs\.test-suites\.result \}\}/);
  assert.ok(
    caller.includes('run: test "$TEST_RESULT" = success'),
    'Failed, skipped, or cancelled jobs must fail the Test gate'
  );
  assert.match(caller, /needs: \[quality, test\]/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/quality-suite\.yml/);
  assert.match(caller, /quality:\s+name: Quality\s+needs: quality-checks\s+if: always\(\)/);
  assert.ok(caller.includes('run: test "$QUALITY_RESULT" = success'));
}

for (const args of [['--ci-group'], ['--ci-group', 'unknown'], ['--ci-group', 'core', 'all']]) {
  const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 2, `Invalid selection must fail: ${args.join(' ')}`);
}
console.log(
  `PASS - ${combined.length} commands partitioned exactly once: ${ciGroupNames.map((name) => `${name}=${groups[name].length}`).join(', ')}`
);
