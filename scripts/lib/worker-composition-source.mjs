import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE_FILES = [
  'worker-actions.js',
  'public.js',
  'accounting.js',
  'directory.js',
  'learn.js',
  'donor.js',
  'admin.js',
  'stewardship.js',
  'parish.js',
];

const EXTRACTED_WORKER_FILES = [
  'handlers/platform-actions.js',
  'handlers/public-entry.js',
  'handlers/stewardship-giving.js',
  'handlers/stewardship-reports.js',
  'operations/weekly-email-digests.js',
];

export function readWorkerCompositionSource(repoRoot = process.cwd()) {
  const worker = readFileSync(path.join(repoRoot, 'src', 'worker.js'), 'utf8');
  const routes = ROUTE_FILES.map((file) => readFileSync(path.join(repoRoot, 'src', 'routes', file), 'utf8')).join('\n');
  const extractedWorkerDomains = EXTRACTED_WORKER_FILES.map((file) =>
    readFileSync(path.join(repoRoot, 'src', file), 'utf8')
  ).join('\n');
  // Source-level tests should not depend on whether Prettier chose single or
  // double quotes for real route literals. Include a quote-normalized view of
  // those same registries; no matcher or handler is synthesized here.
  const normalizedRouteLiterals = routes.replace(/'((?:\/|GET |POST |PUT |PATCH |DELETE )[^'\r\n]*)'/g, '"$1"');
  return `${worker}\n${routes}\n${normalizedRouteLiterals}\n${extractedWorkerDomains}`;
}
