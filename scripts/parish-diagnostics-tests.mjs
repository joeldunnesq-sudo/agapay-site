import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const output = [];
const context = vm.createContext({
  URL,
  Date,
  location: { origin: 'https://dashboard.test' },
  document: { scripts: [{ src: 'https://dashboard.test/parish/app.js?v=known' }] },
  console: { error: (line) => output.push(line) },
  addEventListener: (name, handler) => {
    listeners[name] = handler;
  },
});
context.window = context;
vm.runInContext(readFileSync(new URL('../public/parish/diagnostics.js', import.meta.url), 'utf8'), context);
const diagnostics = context.AgapayDiagnostics;
const sensitive = 'donor@example.test Bearer secret-token {"bankAccount":"secret-bank"}';
const error = {
  name: 'TypeError',
  message: sensitive,
  body: sensitive,
  headers: sensitive,
  cause: new Error(sensitive),
  stack: `TypeError: ${sensitive}\n    at ${sensitive} (https://dashboard.test/parish/app.js?token=secret-token#secret-bank:42:7)\n    at https://dashboard.test/api/donor@example.test.js:12:3\n    at https://external.test/parish/app.js:1:2`,
};
assert.equal(diagnostics.report(error, 'dashboard.load'), 'Unable to load the dashboard. Please try again.');
let entries = JSON.parse(JSON.stringify(diagnostics.recent()));
assert.deepEqual(entries[0].frames, ['/parish/app.js:42:7']);
assert.equal(entries[0].type, 'TypeError');
assert.equal(entries[0].operation, 'dashboard.load');
assert.equal(entries[0].status, null);
for (const status of [401, 403]) {
  assert.match(diagnostics.report({ ...error, status }, 'dashboard.load'), /Please sign in again/);
}
diagnostics.report({ ...error, name: sensitive, status: sensitive }, sensitive);
let latest = diagnostics.recent().at(-1);
assert.equal(latest.type, 'Error');
assert.equal(latest.operation, 'browser.error');
assert.equal(latest.status, null);
listeners.error({ error });
listeners.unhandledrejection({ reason: error });
assert.equal(diagnostics.recent().at(-1).operation, 'browser.unhandledrejection');
for (const value of [
  null,
  sensitive,
  {
    get stack() {
      throw new Error(sensitive);
    },
  },
]) {
  assert.doesNotThrow(() =>
    diagnostics.report(value, {
      toString() {
        throw new Error(sensitive);
      },
    })
  );
}
for (let index = 0; index < 25; index++) diagnostics.report(error, 'stripe.refresh');
assert.equal(diagnostics.recent().length, 20, 'keep only bounded in-memory diagnostics');
latest = diagnostics.recent()[0];
assert.ok(Object.isFrozen(latest) && Object.isFrozen(latest.frames));
diagnostics.recent().pop();
assert.equal(diagnostics.recent().length, 20);
const serialized = JSON.stringify({ output, entries: diagnostics.recent() });
for (const secret of ['donor@example.test', 'secret-token', 'secret-bank', 'bankAccount', 'external.test']) {
  assert.ok(!serialized.includes(secret), `diagnostics leaked ${secret}`);
}
context.console.error = () => {
  throw new Error('Console unavailable');
};
assert.doesNotThrow(() => diagnostics.report(error, 'dashboard.load'));
console.log(
  'PASS - diagnostics preserve source frames and safe context without raw messages, URLs, bodies, or credentials'
);
