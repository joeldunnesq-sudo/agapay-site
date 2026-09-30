import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { browserTypeScriptEntries, synchronizeBrowserTypeScript } from './lib/browser-typescript.mjs';
import { repoRoot } from './lib/server-typescript.mjs';
import { appAssetUrl, contentVersion } from './lib/app-asset-versions.mjs';
import { htmlFilesUnder } from './lib/browser-composed-source.mjs';

await synchronizeBrowserTypeScript();
const sources = (await readdir(join(repoRoot, 'src/browser'), { recursive: true }))
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => `src/browser/${file}`);
assert.deepEqual(sources.sort(), browserTypeScriptEntries.map(({ source }) => source).sort());
for (const { output } of browserTypeScriptEntries) {
  const asset = output.slice('public'.length);
  const url = appAssetUrl(asset);
  let consumers = 0;
  for (const page of htmlFilesUnder('public')) {
    const html = await readFile(join(repoRoot, page), 'utf8');
    if (!html.includes(asset)) continue;
    consumers += 1;
    assert.ok(html.includes(url), `${page} must use the generated content version`);
    const tag = html.match(new RegExp(`<script\\b[^>]*src=["']${asset.replaceAll('.', '\\.')}[^"']*["'][^>]*>`));
    assert.ok(tag, `${page} must load ${asset} as a script`);
    assert.doesNotMatch(tag[0], /type=["']module["']|\basync\b/i);
  }
  assert.ok(consumers > 0);
}

// A second classic script must see the lexical constants as well as window functions.
const sandbox = vm.createContext({});
vm.runInContext(await readFile(join(repoRoot, 'public/donor/bookstore-presentation.js'), 'utf8'), sandbox);
assert.equal(vm.runInContext('BOOKSTORE_CATEGORY_LABELS.prayer_rope', sandbox), 'Prayer Rope');
assert.equal(vm.runInContext('BOOKSTORE_STATUS_LABELS.completed', sandbox), 'Paid');
assert.equal(sandbox.BOOKSTORE_CATEGORY_LABELS, undefined, 'const must remain lexical, not a window property');
for (const [value, expected] of [
  [null, '$0.00'],
  ['', '$0.00'],
  ['1250', '$12.50'],
  [-100, '$-1.00'],
  ['invalid', '$NaN'],
]) {
  assert.equal(sandbox.formatCentsAsDollars(value), expected);
}

const fixtureRoot = await mkdtemp(join(tmpdir(), 'agapay-browser-typescript-'));
try {
  await writeFile(join(fixtureRoot, '.prettierrc.json'), await readFile(join(repoRoot, '.prettierrc.json')));
  for (const { source } of browserTypeScriptEntries) {
    await mkdir(dirname(join(fixtureRoot, source)), { recursive: true });
    await writeFile(join(fixtureRoot, source), await readFile(join(repoRoot, source)));
  }
  await assert.rejects(synchronizeBrowserTypeScript({ root: fixtureRoot }), /Stale or missing/);
  await synchronizeBrowserTypeScript({ root: fixtureRoot, check: false });
  await synchronizeBrowserTypeScript({ root: fixtureRoot });
  const entry = browserTypeScriptEntries[1];
  const outputPath = join(fixtureRoot, entry.output);
  const generated = await readFile(outputPath, 'utf8');
  await writeFile(outputPath, generated.replaceAll('\n', '\r\n'));
  await synchronizeBrowserTypeScript({ root: fixtureRoot });
  await writeFile(outputPath, `${generated}\nvar unexpected = true;\n`);
  await assert.rejects(synchronizeBrowserTypeScript({ root: fixtureRoot }), /bookstore-presentation/);
  await writeFile(outputPath, generated);
  const sourcePath = join(fixtureRoot, entry.source);
  const source = await readFile(sourcePath, 'utf8');
  await writeFile(sourcePath, source.replace('Awaiting payment', 'Fixture changed label'));
  await assert.rejects(synchronizeBrowserTypeScript({ root: fixtureRoot }), /bookstore-presentation/);
  await synchronizeBrowserTypeScript({ root: fixtureRoot, check: false });
  assert.notEqual(contentVersion(await readFile(outputPath, 'utf8')), contentVersion(generated));
  await writeFile(sourcePath, `${source}\nexport const accidentalModule = true;\n`);
  await assert.rejects(synchronizeBrowserTypeScript({ root: fixtureRoot, check: false }), /export/);
} finally {
  assert.equal(dirname(resolve(fixtureRoot)), resolve(tmpdir()));
  await rm(fixtureRoot, { recursive: true, force: true });
}
console.log(
  'PASS - browser source coverage, classic globals, page versions, missing/stale/CRLF artifacts and module rejection'
);
