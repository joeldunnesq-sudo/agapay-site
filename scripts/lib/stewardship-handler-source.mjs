import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

export const stewardshipHandlerPaths = Object.freeze([
  'src/handlers/stewardship.js',
  'src/handlers/stewardship-http.js',
  'src/handlers/stewardship-presentation.js',
  'src/handlers/stewardship-packet-presentation.js',
  'src/handlers/stewardship-financials.js',
  'src/handlers/stewardship-communications.js',
]);

export function readStewardshipHandlerSource() {
  const source = stewardshipHandlerPaths.map((file) => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  const normalizedStringLiterals = source.replace(/'([^'\r\n]*)'/g, '"$1"');
  return `${source}\n${normalizedStringLiterals}`;
}
