import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { checkLintBaseline, lintTargets } from './lib/lint-warning-baseline.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const eslint = new ESLint({
  cwd,
  overrideConfig: { rules: { 'max-lines': ['warn', { max: 1 }] } },
});
const file = 'public/admin/app.js';
const baseline = { [file]: { 'max-lines': 1 } };
const [warning] = await eslint.lintText('const first = 1;\nconst second = 2;\n', { filePath: file });
assert.equal(warning.warningCount, 1);
assert.equal(warning.errorCount, 0);
assert.deepEqual(checkLintBaseline([warning], baseline, cwd), { errorCount: 0, violations: [] });

// Moving a known warning does not create debt, but another rule or file cannot
// replace it, even when the total warning count stays unchanged.
const moved = { ...warning, messages: warning.messages.map((message) => ({ ...message, line: 500 })) };
assert.deepEqual(checkLintBaseline([moved], baseline, cwd).violations, []);
const otherFile = { ...warning, filePath: join(cwd, 'public/donor/app.js') };
const otherRule = {
  ...warning,
  messages: warning.messages.map((message) => ({ ...message, ruleId: 'no-unused-vars' })),
};
for (const result of [otherFile, otherRule]) {
  const { violations } = checkLintBaseline([result], baseline, cwd);
  assert.equal(violations.length, 2, 'reject the new warning and the now-stale baseline entry');
  assert.ok(violations.some((message) => message.includes('baseline allows 0')));
  assert.ok(violations.some((message) => message.includes('stale entry')));
}
assert.match(checkLintBaseline([warning], {}, cwd).violations[0], /baseline allows 0/);
assert.match(checkLintBaseline([], baseline, cwd).violations[0], /stale entry/);
assert.match(checkLintBaseline([warning, warning], baseline, cwd).violations[0], /2 warning\(s\), baseline allows 1/);
assert.deepEqual(checkLintBaseline([], {}, cwd), { errorCount: 0, violations: [] });

const [error] = await eslint.lintText('function legacy() {\nreturn;\nconst dead = 1;\n}\n', { filePath: file });
assert.equal(error.errorCount, 1);
assert.ok(error.messages.some((message) => message.ruleId === 'no-unreachable'));
assert.equal(checkLintBaseline([error], baseline, cwd).errorCount, 1, 'matching warnings never excuse an error');
const [fatal] = await eslint.lintText('const = ;', { filePath: file });
assert.ok(checkLintBaseline([fatal], {}, cwd).errorCount > 0, 'parse errors must fail lint too');

for (const invalid of [
  null,
  [],
  { [file]: {} },
  { [file]: { 'max-lines': 0 } },
  { [file]: { 'max-lines': 1.5 } },
  { '../outside.js': { 'max-lines': 1 } },
  { 'public/../outside.js': { 'max-lines': 1 } },
  { 'public\\admin\\app.js': { 'max-lines': 1 } },
]) {
  assert.throws(() => checkLintBaseline([], invalid, cwd));
}

// Exercise real file discovery with the production config. Newly added browser
// directories must be linted automatically; vendored code must remain excluded.
const fixtureRoot = await mkdtemp(join(tmpdir(), 'agapay-lint-'));
try {
  const files = ['src/probe.js', 'public/admin/app.js', 'public/new-feature/app.js', 'scripts/probe.mjs', 'server.mjs'];
  for (const path of [...files, 'public/vendor/probe.js']) {
    const destination = join(fixtureRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, 'function probe() { return; const dead = 1; }\n');
  }
  const fixtureLint = new ESLint({ cwd: fixtureRoot, overrideConfigFile: join(cwd, 'eslint.config.js') });
  const results = await fixtureLint.lintFiles(lintTargets);
  assert.deepEqual(
    results.map((result) => relative(fixtureRoot, result.filePath).split(sep).join('/')).sort(),
    files.sort()
  );
  assert.ok(results.every((result) => result.errorCount === 1 && result.messages[0].ruleId === 'no-unreachable'));
  assert.equal(checkLintBaseline(results, {}, fixtureRoot).errorCount, files.length);
} finally {
  const resolvedRoot = resolve(fixtureRoot);
  assert.equal(dirname(resolvedRoot), resolve(tmpdir()), 'cleanup must stay inside the temporary directory');
  await rm(resolvedRoot, { recursive: true, force: true });
}

console.log(
  'PASS - lint covers new browser files, excludes vendors, and rejects errors, new warnings, and stale baselines'
);
