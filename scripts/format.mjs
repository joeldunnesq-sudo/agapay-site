// Pass targets directly to Node to avoid the Windows shell command-length limit.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) throw new Error('Expected --write or --check');
const targets = JSON.parse(readFileSync(new URL('./lib/format-targets.json', import.meta.url), 'utf8'));
const cli = fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs'));
const result = spawnSync(process.execPath, [cli, mode, ...targets[mode.slice(2)]], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
