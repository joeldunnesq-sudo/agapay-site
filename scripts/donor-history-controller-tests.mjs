import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { donorAppPagePaths, donorAppScriptPaths } from './lib/donor-app-source.mjs';

const controllerFile = new URL('../public/donor/controllers/history.js', import.meta.url);
const app = readFileSync(new URL('../public/donor/app.js', import.meta.url), 'utf8');
const source = readFileSync(controllerFile, 'utf8');
const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '' });
  return nodes.get(id);
};
let signedIn = true;
let failPortal = false;
const requests = [];
const popup = {
  location: {},
  closed: false,
  close() {
    this.closed = true;
  },
};
const sandbox = {
  window: { location: {}, open: () => popup },
  document: { getElementById: node, querySelectorAll: () => [] },
  localStorage: { getItem: () => null },
  money: (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`,
  shortDate: (date) => date,
  escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  setText: (id, value) => {
    node(id).textContent = value;
  },
  setDonorStatus() {},
  donorSession: () => (signedIn ? { email: 'member@example.test', token: 'test' } : {}),
  donorApi: async (path, options) => {
    requests.push({ path, ...options });
    if (failPortal) throw new Error('Portal unavailable');
    return { portalUrl: 'https://billing.example.test/session' };
  },
};
vm.runInNewContext(source, sandbox);
for (const status of ['unpaid', 'pending', 'failed', 'canceled', 'cancelled', 'expired']) {
  assert.equal(sandbox.donorOfferingIsComplete({ paymentStatus: status.toUpperCase() }), false);
}
assert.equal(sandbox.donorOfferingIsComplete({ status: 'paid' }), true);
const gifts = [
  {
    parishId: 'a',
    stripeCustomerId: 'cus-a',
    fund: 'Support <special>',
    amountCents: 2500,
    frequency: 'monthly',
    paymentStatus: 'paid',
    createdAt: '2026-08-10T12:00:00Z',
  },
  {
    parishId: 'a',
    stripeCustomerId: 'cus-a',
    amountCents: 10000,
    frequency: 'monthly',
    paymentStatus: 'pending',
    createdAt: '2026-08-09T12:00:00Z',
  },
  {
    parishId: 'b',
    stripeCustomerId: 'cus-b',
    amountCents: 500,
    frequency: 'annual',
    status: 'paid',
    createdAt: '2026-08-08T12:00:00Z',
  },
  { parishId: 'c', amountCents: 100, frequency: 'once', status: 'failed', createdAt: '2026-08-07T12:00:00Z' },
];
const receipts = sandbox.offeringRows(gifts);
assert.match(receipts, /<strong>\$30\.00<\/strong><\/header>/, 'Receipt total excludes pending and failed gifts');
assert.match(receipts, /Support &lt;special&gt;/);
assert.equal((receipts.match(/class="giving-receipt-month"/g) || []).length, 1);
assert.deepEqual(
  Array.from(sandbox.recurringManagementItems(gifts), (item) => item.parishId),
  ['a', 'b']
);
const button = { disabled: false };
await sandbox.openDonorRecurringPortal('a', button);
assert.equal(requests[0].path, '/api/donor/subscription-portal');
assert.equal(requests[0].method, 'POST');
assert.deepEqual(JSON.parse(requests[0].body), { parishId: 'a' });
assert.equal(popup.location.href, 'https://billing.example.test/session');
assert.equal(button.disabled, false);
failPortal = true;
await sandbox.openDonorRecurringPortal('a', button);
assert.equal(popup.closed, true);
assert.equal(button.disabled, false);
signedIn = false;
await sandbox.openDonorRecurringPortal('a', button);
await sandbox.loadDonorOfferingsPage();
assert.equal(requests.length, 2, 'Signed-out history and management do not request private APIs');
assert.equal(sandbox.window.location.href, '/myagapay/login');
assert.equal(node('offeringsStatus').textContent, 'Sign in');
assert.match(node('offeringList').innerHTML, /Sign in/);

{
  assert.ok(source.split(/\r?\n/).length <= 1200);
  assert.doesNotMatch(app, /function offeringRows\(/);
  assert.ok(donorAppScriptPaths().includes('public/donor/controllers/history.js'));
  for (const page of donorAppPagePaths) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.ok(html.indexOf('/donor/controllers/history.js?v=') >= 0, page);
    assert.ok(html.indexOf('/donor/controllers/history.js?v=') < html.indexOf('/donor/app.js?v='), page);
  }
}
console.log('PASS - history preserves completed receipt totals, escaping, recurring portal behavior, and guest access');
