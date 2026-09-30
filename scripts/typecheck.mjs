import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(new URL('../.wrangler/types/', import.meta.url), { recursive: true });

// Generate locally from the checked-in configuration; no deployment or remote bindings.
const commands = [
  ['node_modules/wrangler/bin/wrangler.js', 'types', '.wrangler/types/worker.d.ts'],
  ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.worker.json'],
  ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.learn.json'],
  ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.browser.json'],
];

for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: fileURLToPath(new URL('../.wrangler/logs/', import.meta.url)),
      WRANGLER_SEND_METRICS: 'false',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('PASS - strict Worker, Learn, and browser type checks (no emitted application files)');
