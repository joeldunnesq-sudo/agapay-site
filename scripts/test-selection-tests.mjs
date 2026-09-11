import assert from 'node:assert/strict';
import { changedGroups } from './lib/test-selection.mjs';
import { testGroups } from './test-manifest.mjs';

const selected = (files) => new Set(changedGroups(files).flatMap((group) => testGroups[group]));
for (const file of [
  'public/donor/app.js',
  'public/myagapay-shell.js',
  'public/myagapay/parish-life.html',
  'public\\scripts\\consumer-passkeys.js',
]) {
  const tests = selected([file]);
  assert.ok(tests.has('scripts/donor-today-saint-tests.mjs'), `${file}: calendar regression`);
  assert.ok(tests.has('scripts/consumer-passkey-tests.mjs'), `${file}: session regression`);
}
assert.ok(selected(['accounting-migrations/0026_example.sql']).has('scripts/accounting-ledger-tests.mjs'));
assert.ok(selected(['accounting-migrations/manifest.json']).has('scripts/accounting-migration-import-tests.mjs'));
assert.ok(selected(['src/lib/consumer-passkeys.js']).has('scripts/consumer-passkey-tests.mjs'));
assert.ok(selected(['scripts/consumer-passkey-tests.mjs']).has('scripts/consumer-passkey-tests.mjs'));
assert.deepEqual(changedGroups(['package-lock.json']), ['all']);
assert.deepEqual(changedGroups(['public/new-feature.js']), ['all']);
assert.deepEqual(changedGroups(['docs/architecture/release-guardrails.md', 'public/new-feature.js']), ['all']);
assert.deepEqual(changedGroups([]), ['core']);
assert.deepEqual(changedGroups(['public/donor/app.js', 'public/donor/app.js']), changedGroups(['public/donor/app.js']));
assert.ok(selected(['public/parish/app.js', 'public/donor/app.js']).has('scripts/parish-dashboard-browser-tests.mjs'));
console.log(
  'PASS - changed-file selection covers consumer sessions, calendars, accounting migrations, and shared tooling'
);
