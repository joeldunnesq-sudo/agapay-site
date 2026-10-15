// Bound each invocation as well as bypassing the shell: Windows limits Node's
// process argument string too, once the migrated source inventory grows.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) throw new Error('Expected --write or --check');
const targets = JSON.parse(readFileSync(new URL('./lib/format-targets.json', import.meta.url), 'utf8'));
const cli = fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs'));
const selectedTargets = targets[mode.slice(2)];
if (!Array.isArray(selectedTargets) || !selectedTargets.length) {
  throw new Error('Formatting requires a nonempty target list.');
}
const batches = [[]];
let argumentLength = cli.length + mode.length + 16;
for (const target of selectedTargets) {
  const length = target.length + 3;
  if (argumentLength + length > 12000 && batches.at(-1).length) {
    batches.push([]);
    argumentLength = cli.length + mode.length + 16;
  }
  batches.at(-1).push(target);
  argumentLength += length;
}
let status = 0;
for (const batch of batches) {
  if (!batch.length) continue;
  const result = spawnSync(process.execPath, [cli, mode, ...batch], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) status = result.status ?? 1;
}
process.exit(status);
