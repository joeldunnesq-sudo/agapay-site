import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { testGroups } from './test-manifest.mjs';

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

function changedGroups(files) {
  if (!files.length) return ['core'];
  if (files.some((file) => /^(package|eslint)|scripts\/(?:run-tests|test-manifest)/.test(file))) return ['all'];
  const groups = new Set();
  for (const file of files) {
    if (/^(src\/accounting|src\/handlers\/accounting|migrations\/.*accounting)/.test(file)) groups.add('accounting');
    if (/directory/i.test(file)) groups.add('directory');
    if (/sacrament/i.test(file)) groups.add('sacraments');
    if (/^(public\/parish|src\/routes\/parish|src\/routes\/stewardship)/.test(file)) groups.add('parish-ui');
    if (/^docs\/architecture\//.test(file)) groups.add('core');
    if (/^(src\/worker|src\/routes|src\/handlers|src\/lib|migrations)/.test(file)) groups.add('core');
  }
  return groups.size ? [...groups] : ['core'];
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
  const result = spawnSync(process.execPath, parts, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const tests = resolveSelection(process.argv.slice(2));
console.log(`Running ${tests.length} test command(s).`);
for (let index = 0; index < tests.length; index += 1) {
  const status = run(tests[index], index, tests.length);
  if (status !== 0) process.exit(status);
}
console.log(`\nPASS - ${tests.length} test command(s) completed`);
