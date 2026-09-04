import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

export const donorHandlerPaths = Object.freeze([
  'src/handlers/donor.js',
  'src/handlers/donor-bookstore.js',
  'src/handlers/donor-parish-calendar.js',
  'src/handlers/donor-sacraments.js',
  'src/handlers/donor-notifications.js',
  'src/handlers/registration-admin-page.js',
]);

export function readDonorHandlerSource() {
  const source = donorHandlerPaths.map((file) => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  const normalizedStringLiterals = source.replace(/'([^'\r\n]*)'/g, '"$1"');
  return `${source}\n${normalizedStringLiterals}`;
}
