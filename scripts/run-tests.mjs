import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { testGroups } from './test-manifest.mjs';
import { changedGroups } from './lib/test-selection.mjs';
import { ciGroupNames, partitionCiTests } from './lib/ci-test-groups.mjs';

function changedFiles() {
  try {
    const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
    return `${tracked}\n${untracked}`
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean)
      .filter((file, index, files) => files.indexOf(file) === index);
  } catch {
    return [];
  }
}

function resolveSelection(names) {
  const selectedNames = names.length ? names : ['all'];
  const expandedNames = selectedNames.flatMap((name) => (name === 'changed' ? changedGroups(changedFiles()) : [name]));
  const unknown = expandedNames.filter((name) => !testGroups[name]);
  if (unknown.length) {
    console.error(`Unknown test tag: ${unknown.join(', ')}`);
    console.error(`Available tags: changed, ${Object.keys(testGroups).join(', ')}`);
    process.exit(2);
  }
  return [...new Set(expandedNames.flatMap((name) => testGroups[name]))];
}

function run(spec, index, total) {
  const nodeCheck = spec.startsWith('node-check:');
  const parts = nodeCheck ? ['--check', spec.slice('node-check:'.length)] : spec.split(/\s+/);
  console.log(`\n[${index + 1}/${total}] node ${parts.join(' ')}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, parts, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  console.log(`Completed in ${((performance.now() - started) / 1000).toFixed(1)}s (exit ${result.status ?? 1})`);
  return result.status ?? 1;
}

const args = process.argv.slice(2);
let tests;
if (args[0] === '--ci-group') {
  if (args.length !== 2 || !ciGroupNames.includes(args[1])) {
    console.error(`Usage: node scripts/run-tests.mjs --ci-group <${ciGroupNames.join('|')}>`);
    process.exit(2);
  }
  tests = partitionCiTests()[args[1]];
} else {
  tests = resolveSelection(args);
}
console.log(`Running ${tests.length} test command(s).`);
for (let index = 0; index < tests.length; index += 1) {
  const status = run(tests[index], index, tests.length);
  if (status !== 0) process.exit(status);
}
console.log(`\nPASS - ${tests.length} test command(s) completed`);
