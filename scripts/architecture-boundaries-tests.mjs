import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const routeNames = ['public', 'accounting', 'directory', 'learn', 'donor', 'admin', 'stewardship', 'parish'];

const [dashboard, registry, worker, architectureGuide] = await Promise.all([
  read('public/parish/dashboard.html'),
  read('public/parish/feature-registry.js'),
  read('src/worker.js'),
  read('docs/architecture/feature-boundaries.md'),
]);

assert.match(registry, /function register\(id, definition\)/);
assert.match(registry, /typeof definition\.load !== 'function'/);
assert.match(architectureGuide, /New feature code should not be added directly/);
assert.ok(dashboard.length < 160_000, 'dashboard.html exceeded its shell size ceiling');

const app = await read('public/parish/app.js');
for (const pagePath of ['public/parish/dashboard.html', 'public/parish/login.html']) {
  const page = await read(pagePath);
  const diagnostics = page.indexOf('/parish/diagnostics.js');
  const lifecycle = page.indexOf('/parish/dashboard-runtime.js');
  const core = page.indexOf('/parish/app.js');
  assert.ok(
    diagnostics >= 0 && lifecycle > diagnostics && core > lifecycle,
    `${pagePath} must load diagnostics and lifecycle before core`
  );
}
assert.ok(app.split(/\r?\n/).length < 2_300, 'app.js grew past its legacy-shell ceiling; move feature code out');
assert.ok(worker.split(/\r?\n/).length < 4_000, 'worker.js grew past its composition-root ceiling; move routes out');

const featureFiles = (await readdir(new URL('public/parish/features/', root), { recursive: true }))
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => file.endsWith('.js'));
for (const file of featureFiles) {
  const source = await read(`public/parish/features/${file}`);
  const id = file.split('/')[0].replace(/\.js$/, '');
  const isEntry = !file.includes('/');
  const registrations = source.match(/ParishFeatureRegistry\.register\(/g) || [];
  assert.equal(registrations.length, isEntry ? 1 : 0, `${file} must register only at its feature entry`);
  if (isEntry) assert.match(source, new RegExp(`ParishFeatureRegistry\\.register\\('${id}'`));
  else assert.ok(source.split(/\r?\n/).length - 1 <= 1_200, `${file} exceeded the supporting-file ceiling`);
  assert.ok(
    (await stat(new URL(`public/parish/features/${file}`, root))).size < 250_000,
    `${file} exceeded the feature size ceiling`
  );
}

const registryIndex = dashboard.indexOf('/parish/feature-registry.js');
const appIndex = dashboard.indexOf('/parish/app.js');
assert.ok(registryIndex >= 0 && appIndex > registryIndex, 'feature registry must load before app.js');
for (const file of featureFiles) {
  const featureIndex = dashboard.indexOf(`/parish/features/${file}`);
  assert.equal(dashboard.split(`/parish/features/${file}?`).length - 1, 1, `${file} must load exactly once`);
  assert.ok(
    featureIndex > registryIndex && featureIndex < appIndex,
    `${file} must load between the registry and app.js`
  );
  if (file.includes('/')) {
    const entryIndex = dashboard.indexOf(`/parish/features/${file.split('/')[0]}.js`);
    assert.ok(featureIndex < entryIndex, `${file} must load before its feature entry`);
  }
}

assert.match(worker, /dispatchRouteRegistries\(API_ROUTE_REGISTRIES/);
let previousIndex = -1;
for (const routeName of routeNames) {
  const importName = `route${routeName[0].toUpperCase()}${routeName.slice(1)}Request`;
  const routeIndex = worker.indexOf(importName, worker.indexOf('const API_ROUTE_REGISTRIES'));
  assert.ok(routeIndex > previousIndex, `${routeName} router must be present in explicit precedence order`);
  previousIndex = routeIndex;
  const routeSource = await read(`src/routes/${routeName}.js`);
  assert.match(routeSource, new RegExp(`export async function ${importName}`));
  assert.ok(routeSource.split(/\r?\n/).length < 1_200, `${routeName} router exceeded 1,200 lines`);
}

await import(new URL('src/worker.js', root));
console.log('PASS - frontend feature and Worker route boundaries');
