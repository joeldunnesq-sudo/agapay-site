import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

export const parishCommercePaths = Object.freeze([
  'src/handlers/parish-commerce.js',
  'src/handlers/parish-bookstore-inventory.js',
  'src/handlers/parish-bookstore-handler.js',
]);

export function readParishCommerceSource() {
  const source = parishCommercePaths.map((file) => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  const normalizedStringLiterals = source.replace(/'([^'\r\n]*)'/g, '"$1"');
  return `${source}\n${normalizedStringLiterals}`;
}
