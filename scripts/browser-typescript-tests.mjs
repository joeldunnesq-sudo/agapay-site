import { includesJavaScriptFragment } from './lib/javascript-source-contract.mjs';
import ts from 'typescript';
import path from 'node:path';
import { CURRENT_TERMS_VERSION } from '../src/lib/legal-acceptance.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import {
  browserTypeScriptEntries,
  synchronizeBrowserTypeScript,
  readClassicBrowserEntry,
} from './lib/browser-typescript.mjs';
import { repoRoot } from './lib/server-typescript.mjs';
import { appAssetUrl, contentVersion } from './lib/app-asset-versions.mjs';
import { htmlFilesUnder } from './lib/browser-composed-source.mjs';

await synchronizeBrowserTypeScript();
const sources = (await readdir(join(repoRoot, 'src/browser'), { recursive: true }))
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => `src/browser/${file}`);
assert.deepEqual(
  sources.sort(),
  browserTypeScriptEntries
    .flatMap(({ source, supportSources = [], classicSupportSources = [] }) => [
      source,
      ...supportSources,
      ...classicSupportSources,
    ])
    .sort()
);

// Runtime helpers are separately emitted and owned by exactly one migrated entry.
const runtimeOwners = new Set();
for (const entry of browserTypeScriptEntries) {
  for (const source of entry.runtimeSupportSources || []) {
    assert.equal(runtimeOwners.has(source), false, source + ' cannot have multiple runtime owners');
    runtimeOwners.add(source);
    const helper = browserTypeScriptEntries.find((candidate) => candidate.source === source);
    assert.ok(helper, source + ' must be registered as an emitted entry');
    assert.equal(helper.module, entry.module);
    assert.equal(helper.delivery, entry.module ? 'native-module' : undefined);
    if (!entry.module) assert.equal(helper.declarationsOnly, true);
    assert.notEqual(source, entry.source);
  }
}

// Native module and Worker URLs retain their existing runtime import/registration paths.
const runtimeReferences = new Map();
for (const file of (await readdir(join(repoRoot, 'public'), { recursive: true })).filter(
  (p) => p.endsWith('.js') && !p.replaceAll('\\', '/').startsWith('vendor/')
)) {
  const filename = 'public/' + file.replaceAll('\\', '/');
  const source = await readFile(join(repoRoot, filename), 'utf8');
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isStringLiteral(node)) {
      const value = node.text.split(/[?#]/)[0];
      if (value.endsWith('.js') && (value.startsWith('/') || value.startsWith('./') || value.startsWith('../'))) {
        const target = value.startsWith('/')
          ? 'public' + value
          : path.posix.normalize(path.posix.join(path.posix.dirname(filename), value));
        if (!runtimeReferences.has(target)) runtimeReferences.set(target, new Set());
        runtimeReferences.get(target).add(filename);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}
for (const { output, externalEmbed, delivery, module: nativeModule } of browserTypeScriptEntries) {
  if (delivery) {
    const code = await readFile(join(repoRoot, output), 'utf8');
    if (delivery === 'unreferenced-classic' || delivery === 'unreferenced-worker') {
      assert.equal(
        output,
        delivery === 'unreferenced-classic' ? 'public/site-mobile-nav.js' : 'public/listen/service-worker.js',
        'Only these two pre-existing standalone scripts have no runtime consumer'
      );
      if (delivery === 'unreferenced-worker') assert.ok(includesJavaScriptFragment(code, 'self.addEventListener'));
      assert.equal(nativeModule, undefined);
      new vm.Script(code, { filename: output });
      continue;
    }
    assert.ok(
      (runtimeReferences.get(output)?.size || 0) > 0,
      output + ' must retain a runtime import or Worker registration consumer'
    );
    if (delivery === 'native-module') {
      assert.equal(nativeModule, true);
      assert.throws(() => new vm.Script(code), /import|export/, output + ' must retain native module syntax');
    } else {
      assert.equal(delivery, 'worker');
      assert.equal(nativeModule, undefined);
      assert.ok(
        [
          'public/service-worker.js',
          'public/listen/service-worker.js',
          'public/parish/directory-import-file-worker.js',
        ].includes(output)
      );
      new vm.Script(code, { filename: output });
      assert.match(code, /self\.(?:addEventListener|onmessage)/);
    }
    continue;
  }
  const asset = output.slice('public'.length);
  if (externalEmbed) {
    // Published third-party snippets keep the stable URL and their existing revalidation policy.
    assert.ok(
      ['public/campaign-box.js', 'public/giving-box.js'].includes(output),
      'Only published external widgets use the stable URL contract'
    );
    if (output === 'public/giving-box.js') {
      const consumer = await readFile(join(repoRoot, 'public/parish/features/giving/sharing.js'), 'utf8');
      assert.ok(consumer.includes('/giving-box.js'));
      const headers = (await readFile(join(repoRoot, 'public/_headers'), 'utf8')).replaceAll('\r\n', '\n');
      assert.ok(
        headers.includes(
          '/giving-box.js\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=3600, must-revalidate'
        )
      );
      continue;
    }
    const consumer = await readFile(join(repoRoot, 'public/parish/features/campaigns/website-embed.js'), 'utf8');
    assert.ok(consumer.replaceAll('\\/', '/').includes('/campaign-box.js" async></script>'));
    const headers = (await readFile(join(repoRoot, 'public/_headers'), 'utf8')).replaceAll('\r\n', '\n');
    assert.ok(
      headers.includes(
        '/campaign-box.js\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: public, max-age=3600, must-revalidate'
      )
    );
    continue;
  }
  const url = appAssetUrl(asset);
  let consumers = 0;
  for (const page of htmlFilesUnder('public')) {
    const html = await readFile(join(repoRoot, page), 'utf8');
    const tag = html.match(new RegExp(`<script\\b[^>]*src=["']${asset.replaceAll('.', '\\.')}[^"']*["'][^>]*>`));
    if (!tag) continue;
    consumers += 1;
    if (!nativeModule) {
      const current = browserTypeScriptEntries.find((candidate) => candidate.output === output);
      for (const helperSource of current.runtimeSupportSources || []) {
        const helper = browserTypeScriptEntries.find((candidate) => candidate.source === helperSource);
        const helperUrl = appAssetUrl(helper.output.slice('public'.length));
        assert.ok(
          html.indexOf(helperUrl) >= 0 && html.indexOf(helperUrl) < html.indexOf(tag[0]),
          'classic support must load before its owner'
        );
        const helperTag = html.slice(
          html.lastIndexOf('<script', html.indexOf(helperUrl)),
          html.indexOf('>', html.indexOf(helperUrl)) + 1
        );
        assert.equal(
          /\bdefer\b/.test(helperTag),
          /\bdefer\b/.test(tag[0]),
          'classic owner and support retain matching execution order'
        );
      }
      const owner = browserTypeScriptEntries.find((candidate) =>
        candidate.runtimeSupportSources?.includes(current.source)
      );
      if (owner)
        assert.ok(
          html.includes(appAssetUrl(owner.output.slice('public'.length))),
          'classic support cannot load without its page owner'
        );
    }
    if (page === 'public/terms.html') {
      assert.equal(
        html,
        await readFile(join(repoRoot, 'docs/legal/terms/terms-' + CURRENT_TERMS_VERSION + '.html'), 'utf8'),
        'Published Terms must remain byte-identical to their preserved snapshot'
      );
      assert.equal(asset, '/site-chrome.js', 'Only the original chrome script uses the immutable Terms page exception');
    } else assert.ok(tag[0].includes(url), `${page} must use the generated content version`);

    assert.ok(tag, `${page} must load ${asset} as a script`);
    if (nativeModule) {
      assert.match(tag[0], /type=["']module["']/i);
      assert.doesNotMatch(tag[0], /\basync\b/i);
    } else assert.doesNotMatch(tag[0], /type=["']module["']|\basync\b/i);
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
  for (const source of browserTypeScriptEntries.flatMap((entry) => [
    entry.source,
    ...(entry.supportSources || []),
    ...(entry.classicSupportSources || []),
  ])) {
    await mkdir(dirname(join(fixtureRoot, source)), { recursive: true });
    await writeFile(join(fixtureRoot, source), await readFile(join(repoRoot, source)));
  }
  await assert.rejects(synchronizeBrowserTypeScript({ root: fixtureRoot }), /Stale or missing/);
  await synchronizeBrowserTypeScript({ root: fixtureRoot, check: false });
  await synchronizeBrowserTypeScript({ root: fixtureRoot });
  const entry = browserTypeScriptEntries.find(({ output }) => output === 'public/donor/bookstore-presentation.js');
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
  await writeFile(sourcePath, source);
  const declarationEntry = browserTypeScriptEntries.find((entry) => entry.declarationsOnly);
  const declarationPath = join(fixtureRoot, declarationEntry.source),
    declarationSource = await readFile(declarationPath, 'utf8');
  await writeFile(declarationPath, declarationSource + '\nconst unexpectedStartup=true;\n');
  await assert.rejects(
    synchronizeBrowserTypeScript({ root: fixtureRoot, check: false }),
    /Classic runtime support must contain only function declarations/
  );
  await writeFile(declarationPath, declarationSource);
  const privateEntry = browserTypeScriptEntries.find((entry) => entry.supportSources?.length);
  assert.equal(
    new Set(privateEntry.supportSources).size,
    privateEntry.supportSources.length,
    'private support ownership is unique'
  );
  const privatePath = join(fixtureRoot, privateEntry.source),
    privateSource = await readFile(privatePath, 'utf8');
  await writeFile(join(fixtureRoot, 'unexpected-private.ts'), 'globalThis.unexpected=true;');
  await writeFile(privatePath, "import '../../unexpected-private.ts';\n" + privateSource);
  await assert.rejects(
    synchronizeBrowserTypeScript({ root: fixtureRoot, check: false }),
    /Unregistered private browser dependency/,
    'private bundles cannot absorb undeclared runtime dependencies'
  );
  await writeFile(privatePath, privateSource);
  await writeFile(join(fixtureRoot, 'classic-directive.ts'), "'use strict';\nfunction strictEntry(){ return this; }");
  await writeFile(join(fixtureRoot, 'classic-helper.ts'), 'function strictHelper(){ return this; }');
  const strictClassic = vm.createContext({});
  vm.runInContext(
    readClassicBrowserEntry(
      { source: 'classic-directive.ts', classicSupportSources: ['classic-helper.ts'] },
      fixtureRoot
    ),
    strictClassic
  );
  assert.equal(
    vm.runInContext('strictEntry()', strictClassic),
    undefined,
    'classic entry retains its strict directive'
  );
  assert.equal(
    vm.runInContext('strictHelper()', strictClassic),
    undefined,
    'composed helpers share the original strict directive'
  );
  const classicEntry = browserTypeScriptEntries.find((entry) => entry.classicSupportSources?.length);
  const classicPath = join(fixtureRoot, classicEntry.classicSupportSources[0]),
    classicSource = await readFile(classicPath, 'utf8');
  await writeFile(classicPath, classicSource + '\nconst movedInitialization=true;\n');
  await assert.rejects(
    synchronizeBrowserTypeScript({ root: fixtureRoot, check: false }),
    /Classic support must contain only function declarations/
  );
  await writeFile(classicPath, classicSource);
} finally {
  assert.equal(dirname(resolve(fixtureRoot)), resolve(tmpdir()));
  await rm(fixtureRoot, { recursive: true, force: true });
}
console.log(
  'PASS - browser source coverage, classic globals, page versions, missing/stale/CRLF artifacts and module rejection'
);
