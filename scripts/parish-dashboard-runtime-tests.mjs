import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

function createPage() {
  const elements = new Map();
  const storage = new Map();
  const document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    console,
    URL,
    URLSearchParams,
    Date,
    Map,
    Set,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    localStorage: { getItem: () => null },
    location: { search: '', hash: '', pathname: '/parish/login', replace() {} },
    navigator: {},
    setTimeout() {},
    clearTimeout() {},
    requestAnimationFrame() {},
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    scrollTo() {},
    fetch: () => {
      throw new Error('Unexpected network request during script initialization');
    },
  });
  context.window = context;
  elements.set('parishToken', { value: 'test-parish-token' });
  elements.set('parishId', { value: 'test-parish' });
  const run = (source) => vm.runInContext(source, context);
  const load = (file) => vm.runInContext(read(file), context, { filename: file });
  return { context, elements, storage, run, load };
}

// Login deliberately loads no dashboard features: shared auth must remain usable.
const login = createPage();
login.load('public/parish/app.js');
assert.equal(login.run('authHeaders().Authorization'), 'Bearer test-parish-token');
assert.equal(login.run('accountingStaffSession()'), null);
login.run("currentParish = { parishId: 'test-parish' }");
login.storage.set(
  'agapay.accountingStaff.test-parish',
  JSON.stringify({
    profile: { id: 'treasurer' },
    token: 'test-accounting-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
);
assert.equal(login.run("authHeaders()['X-AGAPAY-Accounting-Token']"), 'test-accounting-token');
assert.equal(login.run("authHeaders()['X-AGAPAY-Accounting-Profile']"), 'treasurer');

// Execute separate classic scripts in the actual HTML order to catch duplicate
// lexical declarations, registration ordering errors, and premature global reads.
const dashboard = createPage();
const scripts = [
  ...read('public/parish/dashboard.html').matchAll(
    /<script src="(\/parish\/(?:feature-registry|features\/[^"?]+|app)\.js)\?[^\"]+"><\/script>/g
  ),
].map((match) => `public${match[1]}`);
for (const file of scripts) dashboard.load(file);
for (const feature of dashboard.context.ParishFeatureRegistry.list()) {
  await dashboard.run(`loadRegisteredParishFeature('${feature.id}')`);
}
assert.equal(dashboard.run('authHeaders().Authorization'), 'Bearer test-parish-token');

// Exercise the real parent lifecycle and navigation with leaf loaders observed.
// This protects tier defaults, old links, and Events/Meals dispatch when products
// are added beneath Commerce without making network requests in the test.
const calls = [];
dashboard.context.renderCommerceOverview = () => calls.push(['overview']);
dashboard.context.loadEventsOversightPanel = (kind) => calls.push(['offering', kind]);
dashboard.context.loadBookstoreCatalogTab = (force) => calls.push(['catalog', force]);
dashboard.context.moduleIncluded = () => true;
await dashboard.run("loadRegisteredParishFeature('commerce')");
assert.equal(dashboard.run('commerceProductState'), 'overview');
assert.deepEqual(calls.splice(0), [['overview'], ['catalog', false]]);
for (const [product, kind] of [
  ['events', 'event'],
  ['meals', 'meal'],
]) {
  dashboard.run(`switchCommerceProduct('${product}')`);
  assert.equal(dashboard.run('commerceProductState'), product);
  assert.deepEqual(calls.splice(0), [['offering', kind]]);
}
dashboard.run("switchCommerceProduct('bookstore')");
await dashboard.run("ParishFeatureRegistry.get('commerce').refresh()");
assert.equal(dashboard.run('commerceProductState'), 'bookstore', 'refresh must preserve the selected product');
assert.deepEqual(calls.splice(0), [['catalog', true]]);
for (const product of ['retreats', 'camp', 'tuition']) {
  assert.match(read('public/parish/dashboard.html'), new RegExp(`disabled data-commerce-product="${product}"`));
  dashboard.run(`switchCommerceProduct('${product}')`);
  assert.equal(dashboard.run('commerceProductState'), 'overview', 'unimplemented products must remain unavailable');
}
calls.length = 0;
dashboard.elements.set('tab-bookstore', { classList: { add() {} } });
dashboard.elements.set('topbarTitle', { textContent: '' });
for (const fullSuite of [true, false]) {
  dashboard.context.moduleIncluded = (id) => id !== 'commerceSuite' || fullSuite;
  for (const alias of ['commerce', 'bookstore', 'parishplus']) {
    dashboard.run(`switchTab('${alias}')`);
    assert.equal(dashboard.run('commerceProductState'), fullSuite ? 'overview' : 'bookstore');
    assert.equal(dashboard.run('activeTab'), 'bookstore');
    assert.deepEqual(calls.splice(0), fullSuite ? [['overview'], ['catalog', false]] : [['catalog', false]]);
  }
}
dashboard.run("switchCommerceProduct('events')");
assert.equal(dashboard.run('commerceProductState'), 'bookstore', 'bookstore-only tiers cannot select Events');
assert.deepEqual(calls, []);
console.log('PASS - classic-script startup, login authentication, and Commerce product lifecycle and tier defaults');
