import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { htmlFilesUnder, repoRoot } from './lib/browser-composed-source.mjs';

const source = readFileSync(new URL('../public/donor/session.js', import.meta.url), 'utf8');
const values = new Map();
const storage = {
  get length() {
    return values.size;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  getItem(key) {
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};
function loadSession() {
  const window = {};
  vm.runInNewContext(source, { window, localStorage: storage });
  return window.AGAPAYDonorSession;
}
const api = loadSession();
api.saveSession({ token: 'first-token', donor: { email: 'first@example.test', donorName: 'First' } });
values.set('agapay.parishCapabilities.v1', 'old-capabilities');
values.set('agapay.learn.plan', 'old-plan');
values.set('agapay.navigationTransition.v1', 'old-navigation');
values.set('agapayDonorCache:first@example.test:dashboard', 'private-response');
values.set('unrelated-setting', 'keep');
values.set('agapayDonorShellVersion', 'keep-version');
assert.equal(loadSession().session().token, 'first-token', 'page reload keeps a valid session');
assert.equal(api.authHeaders().Authorization, 'Bearer first-token');
assert.equal(api.authHeaders({ 'Content-Type': 'application/json' })['Content-Type'], 'application/json');
api.saveSession({ token: 'second-token', donor: { email: 'second@example.test' } });
for (const key of [
  'agapay.parishCapabilities.v1',
  'agapay.learn.plan',
  'agapay.navigationTransition.v1',
  'agapayDonorCache:first@example.test:dashboard',
]) {
  assert.equal(values.has(key), false, `${key} must not survive an account switch`);
}
assert.equal(api.session().email, 'second@example.test');
assert.equal(api.profile().donorName, undefined, 'old profile fields must not merge into another account');
assert.equal(api.session().token, 'second-token');
assert.equal(values.get('unrelated-setting'), 'keep');
assert.equal(values.get('agapayDonorShellVersion'), 'keep-version');

// The legacy Donor logout bridge and the shell use the same implementation.
const donor = readFileSync(new URL('../public/donor/app.js', import.meta.url), 'utf8');
const clearBridge = donor.slice(
  donor.indexOf('function clearDonorSession'),
  donor.indexOf('function closeDonorAccountMenus')
);
const window = { AGAPAYDonorSession: api, location: {} };
let updates = 0;
const sandbox = {
  window,
  updateDonorAuthState: () => {
    updates += 1;
  },
};
vm.runInNewContext(clearBridge, sandbox);
sandbox.logoutDonor();
assert.equal(api.session().token, '');
assert.equal(api.session().email, '');
assert.equal(Object.keys(api.profile()).length, 0);
assert.equal(window.location.href, '/myagapay/login');
assert.equal(updates, 1);
api.saveSession({ token: 'email-token' }, 'email-login@example.test');
assert.equal(api.session().email, 'email-login@example.test', 'email recovery uses the same session store');
values.set('agapayDonorProfile', 'invalid JSON');
assert.equal(Object.keys(api.profile()).length, 0, 'malformed profile cache is recoverable');
api.clearSession();
assert.equal(api.authHeaders().Authorization, undefined);
api.saveSession({ token: 'old-account-token', donor: { email: 'old@example.test' } });
api.saveSession({ donor: { donorName: 'New signup' } }, 'new@example.test');
assert.equal(api.session().token, '', 'an unverified signup must not retain another account token');
assert.equal(api.session().email, 'new@example.test');
api.saveSession({ token: 'verified-token', donor: { email: 'new@example.test' } });
api.setProfile({ email: 'updated@example.test', donorName: 'Updated account' });
assert.equal(api.session().email, 'updated@example.test');
assert.equal(api.session().token, 'verified-token', 'a successful account-settings response preserves its session');

for (const file of htmlFilesUnder('public')) {
  const html = readFileSync(path.join(repoRoot, file), 'utf8');
  const consumer = html.search(/<script\b[^>]*src="\/(?:myagapay-shell|donor\/app|scripts\/consumer-passkeys)\.js/);
  if (consumer < 0) continue;
  const session = html.search(/<script src="\/donor\/session\.js\?v=[a-f0-9]{16}"><\/script>/);
  assert.ok(session >= 0 && session < consumer, `${file} must load the session owner synchronously before consumers`);
  assert.equal((html.match(/src="\/donor\/session\.js/g) || []).length, 1);
}
console.log(
  'PASS - shared sessions preserve reloads, clear account state consistently, and load before every consumer'
);
