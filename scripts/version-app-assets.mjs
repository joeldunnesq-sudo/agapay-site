import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appAssets, appAssetUrl, versionAppAssetReferences } from './lib/app-asset-versions.mjs';
import { htmlFilesUnder, repoRoot } from './lib/browser-composed-source.mjs';

const check = process.argv.includes('--check');
const urls = new Map(appAssets.map((asset) => [asset, appAssetUrl(asset)]));
const changed = [];
for (const file of htmlFilesUnder('public')) {
  const filename = path.join(repoRoot, file);
  const html = readFileSync(filename, 'utf8');
  const next = versionAppAssetReferences(html, urls);
  if (next === html) continue;
  changed.push(file);
  if (!check) writeFileSync(filename, next);
}
if (check && changed.length) {
  console.error(
    `Stale app asset references in ${changed.length} page(s). Run npm run assets:version.\n${changed.join('\n')}`
  );
  process.exitCode = 1;
} else
  console.log(
    `PASS - shared app asset versions ${check ? 'verified' : `synchronized (${changed.length} pages updated)`}`
  );
