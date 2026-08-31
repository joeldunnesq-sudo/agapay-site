import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { checkLintBaseline, lintTargets } from './lib/lint-warning-baseline.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
let cache = false;
for (const argument of process.argv.slice(2)) {
  if (argument === '--cache') cache = true;
  else if (argument === '--no-cache') cache = false;
  else throw new Error(`Unsupported lint argument: ${argument}. Use --cache or --no-cache.`);
}

const baseline = JSON.parse(await readFile(new URL('../config/lint-warning-baseline.json', import.meta.url), 'utf8'));
const eslint = new ESLint({ cwd, cache });
const results = await eslint.lintFiles(lintTargets);
const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results);
if (output) console.log(output);

const { errorCount, violations } = checkLintBaseline(results, baseline, cwd);
for (const violation of violations) console.error(violation);
if (errorCount || violations.length) {
  process.exitCode = 1;
} else {
  console.log(`PASS - ${results.length} files linted; all warnings match the explicit file/rule baseline.`);
}
