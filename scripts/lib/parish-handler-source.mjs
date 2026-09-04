import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

export const parishHandlerPaths = Object.freeze([
  'src/handlers/parish.js',
  'src/handlers/parish-donor-offerings.js',
  'src/handlers/parish-giving-read-models.js',
  'src/handlers/parish-checkout.js',
  'src/handlers/parish-dashboard-handler.js',
]);

export function readParishHandlerSource() {
  const source = parishHandlerPaths.map((file) => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  const normalizedStringLiterals = source.replace(/'([^'\r\n]*)'/g, '"$1"');
  return `${source}\n${normalizedStringLiterals}`;
}
