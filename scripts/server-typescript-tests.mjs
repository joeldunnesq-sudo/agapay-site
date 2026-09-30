import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import ts from 'typescript';
import {
  readServerModuleSource,
  repoRoot,
  serverTypeScriptSources,
  synchronizeServerTypeScript,
} from './lib/server-typescript.mjs';
import * as classification from '../src/organizations/types.js';
import * as terminology from '../src/organizations/terminology.js';
import * as xml from '../src/lib/xml-text.js';

await synchronizeServerTypeScript();

// New runtime TypeScript must have an explicit output contract. The existing Learn
// model-only files have a separate type-check project and are not runtime entries.
const sources = (await readdir(join(repoRoot, 'src'), { recursive: true }))
  .map((file) => file.replaceAll('\\', '/'))
  .filter(
    (file) =>
      file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.startsWith('learn/') && !file.startsWith('browser/')
  )
  .map((file) => `src/${file}`);
assert.deepEqual(sources.sort(), [...serverTypeScriptSources].sort());

assert.deepEqual(Object.keys(classification).sort(), [
  'ORGANIZATION_SUBTYPES',
  'ORGANIZATION_TYPES',
  'classifyCommunityType',
  'legacyParishClassification',
  'normalizeCommunityType',
  'organizationClassificationForRegistration',
]);
assert.deepEqual(Object.keys(terminology).sort(), ['TERMINOLOGY_PROFILES', 'terminologyProfileForClassification']);
assert.deepEqual(Object.keys(xml).sort(), ['decodeXmlEntities', 'plainTextFromMarkup', 'plainXmlAttribute']);
for (const [input, type, subtype, word] of [
  ['  MISSION  ', 'church', 'mission', 'mission'],
  ['Monastery / Skete', 'monastery', 'skete', 'monastery'],
  ['Diocese', 'diocese', 'unspecified', 'diocese'],
  ['unknown-kind', 'unknown', 'unspecified', 'organization'],
]) {
  const result = classification.classifyCommunityType(input);
  assert.equal(result.organizationType, type);
  assert.equal(result.organizationSubtype, subtype);
  assert.ok(Object.isFrozen(result));
  assert.equal(terminology.terminologyProfileForClassification(result).organization, word);
}
assert.equal(classification.organizationClassificationForRegistration(null).legacyDefault, true);
assert.equal(
  classification.organizationClassificationForRegistration({ parishType: 'Mission' }).organizationSubtype,
  'mission'
);
assert.equal(xml.decodeXmlEntities('&amp; &#65; &#x1F600; &unknown; &#xD800;'), '& A 😀 &unknown; ');
assert.equal(xml.plainTextFromMarkup('<p>Hello</p><script>secret()</script><p>World</p>'), 'Hello World');
assert.equal(xml.plainTextFromMarkup('one<br>two', { preserveLines: true }), 'one\ntwo');
assert.equal(xml.plainTextFromMarkup(null), '');
assert.equal(xml.plainXmlAttribute('&lt;tag&gt;  value', 8), 'tag valu');

// This is the same Node import graph used by local preview; no TS loader required.
const preview = await import('../server.mjs');
assert.equal(typeof preview.server.listen, 'function');
preview.server.listen(0, '127.0.0.1');
await once(preview.server, 'listening');
try {
  const response = await fetch(`http://127.0.0.1:${preview.server.address().port}/api/learn/meta`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(typeof (await response.json()), 'object');
} finally {
  await new Promise((resolve, reject) => preview.server.close((error) => (error ? reject(error) : resolve())));
}

const fixtureRoot = await mkdtemp(join(tmpdir(), 'agapay-server-typescript-'));
try {
  // Linux Wrangler declarations can import the legacy entrypoint. That must not
  // expand the migrated TS project to every unconverted JavaScript dependency.
  const workerReference = join(fixtureRoot, 'worker-reference.d.ts');
  await writeFile(
    workerReference,
    `declare namespace MigrationScopeProbe { type Worker = typeof import(${JSON.stringify(resolve(repoRoot, 'src/worker.js').replaceAll('\\', '/'))}); }\n`
  );
  const config = ts.readConfigFile(join(repoRoot, 'tsconfig.worker.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.options.strict, true);
  const program = ts.createProgram([...parsed.fileNames, workerReference], parsed.options);
  assert.deepEqual(
    program
      .getSourceFiles()
      .filter((file) => /\.jsx?$/.test(file.fileName))
      .map((file) => file.fileName),
    []
  );
  // Quality separately generates Wrangler declarations and checks diagnostics.
  // This graph check must also work in a fresh Test job without those artifacts.
  await writeFile(join(fixtureRoot, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(fixtureRoot, '.prettierrc.json'), await readFile(join(repoRoot, '.prettierrc.json')));
  for (const source of serverTypeScriptSources) {
    await mkdir(dirname(join(fixtureRoot, source)), { recursive: true });
    await writeFile(join(fixtureRoot, source), await readFile(join(repoRoot, source)));
  }
  await assert.rejects(synchronizeServerTypeScript({ root: fixtureRoot }), /Stale or missing/);
  await synchronizeServerTypeScript({ root: fixtureRoot, check: false });
  await synchronizeServerTypeScript({ root: fixtureRoot });
  const outputPath = join(fixtureRoot, 'src/lib/xml-text.js');
  const generated = await readFile(outputPath, 'utf8');
  await writeFile(outputPath, generated.replaceAll('\n', '\r\n'));
  await synchronizeServerTypeScript({ root: fixtureRoot });
  await writeFile(outputPath, `${generated}\nexport const unauthorizedEdit = true;\n`);
  await assert.rejects(synchronizeServerTypeScript({ root: fixtureRoot }), /xml-text\.js/);
  await writeFile(outputPath, generated);
  const inputPath = join(fixtureRoot, 'src/lib/xml-text.ts');
  const input = await readFile(inputPath, 'utf8');
  await writeFile(inputPath, `${input}\nexport const newSourceExport = true;\n`);
  await assert.rejects(synchronizeServerTypeScript({ root: fixtureRoot }), /xml-text\.js/);
  assert.match(await readServerModuleSource('src/lib/xml-text.js', fixtureRoot), /newSourceExport/);
  await synchronizeServerTypeScript({ root: fixtureRoot, check: false });
  const runtime = await import(pathToFileURL(outputPath).href);
  assert.equal(runtime.newSourceExport, true);
} finally {
  assert.equal(dirname(resolve(fixtureRoot)), resolve(tmpdir()), 'cleanup must stay in the temporary directory');
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log(
  'PASS - TypeScript runtime exports, Node preview imports, source coverage, and missing/stale/CRLF output gates'
);
