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
console.log('PASS - classic-script startup, feature lifecycles, and standalone login authentication');
