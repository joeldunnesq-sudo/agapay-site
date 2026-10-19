import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

export function readCoreSource() {
  const source = [
    'src/lib/core.js',
    'src/lib/password-records.ts',
    'src/lib/authentication-policy.ts',
    'src/lib/api-responses.ts',
    'src/lib/storage.ts',
    'src/lib/storage-keys.ts',
    'src/lib/session-crypto.ts',
    'src/lib/parish-sessions.ts',
    'src/lib/storage-policy.ts',
    'src/lib/admin-sessions.ts',
    'src/lib/donor-repository.ts',
    'src/lib/donor-sessions.ts',
    'src/lib/stored-values.ts',
    'src/lib/format.ts',
  ]
    .map((file) => readFileSync(resolve(repoRoot, file), 'utf8'))
    .join('\n');
  return `${source}\n${source.replace(/'([^'\r\n]*)'/g, '"$1"')}`;
}
