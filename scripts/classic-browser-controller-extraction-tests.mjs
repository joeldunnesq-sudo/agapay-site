import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { adminAppScriptPaths } from './lib/admin-dashboard-source.mjs';
import { repoRoot } from './lib/browser-composed-source.mjs';
import { donorAppPagePaths, donorAppScriptPaths } from './lib/donor-app-source.mjs';

const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');
const physicalLines = (source) => source.split(/\r?\n/).length - 1;

const adminApp = read('public/admin/app.js');
const taxController = read('public/admin/controllers/tax-exemptions.js');
const donorApp = read('public/donor/app.js');
const bookstoreController = read('public/donor/controllers/bookstore.js');

const taxGlobals = [
  'closeTexDetail',
  'debouncedTexFilterChange',
  'loadTaxExemptionSummary',
  'loadTaxExemptions',
  'onTexFilterChange',
  'openTexDetail',
  'setTexStatusFilter',
  'texAddNote',
  'texApprove',
  'texOpenApproveConfirm',
  'texOpenReasonForm',
  'texOpenReconcile',
  'texRetryAll',
  'texRetryOne',
  'texSubmitReasonAction',
  'texSubmitReconcile',
  'texViewDocument',
];
const bookstoreGlobals = [
  'addBookstoreProductToCart',
  'addManualBookstoreItem',
  'changeBookstoreCartQuantity',
  'clearManualBookstoreEntry',
  'closeBookstoreParishMenu',
  'closeBookstoreScanner',
  'handleBookstoreCheckoutReturn',
  'loadDonorBookstorePage',
  'openBookstoreScanner',
  'removeBookstoreCartItem',
  'requestBookstoreFeature',
  'selectBookstoreParish',
  'setBookstoreCatalogCategory',
  'setBookstoreCatalogQuery',
  'setBookstoreMobileCartOpen',
  'submitBookstoreOrder',
  'toggleBookstoreMobileCart',
  'toggleBookstoreParishMenu',
  'toggleBookstoreScannerTorch',
];

for (const name of taxGlobals) {
  assert.match(taxController, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.doesNotMatch(adminApp, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
}
for (const name of bookstoreGlobals) {
  assert.match(bookstoreController, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.doesNotMatch(donorApp, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
}

assert.ok(physicalLines(taxController) <= 1200, 'Admin Tax Exemptions controller must stay below the source limit');
assert.ok(physicalLines(bookstoreController) <= 1200, 'Donor Bookstore controller must stay below the source limit');

const taxSandbox = {
  escapeAttr: (value) => String(value),
  escapeHtml: (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  readable: (value) => String(value).replaceAll('_', ' '),
};
vm.runInNewContext(taxController, taxSandbox, { filename: 'tax-exemptions.js' });
assert.match(taxSandbox.texNoStatewideNote('AK'), /No statewide general sales tax/);
assert.equal(taxSandbox.texNoStatewideNote('TX'), '');
assert.equal(taxSandbox.texMaskedCertificate('<masked>'), '&lt;masked&gt;');
assert.match(taxSandbox.texStatusBadge('replacement_required'), /Replacement required/);

const donorStatuses = [];
const bookstoreSandbox = {
  document: { addEventListener() {} },
  setDonorStatus: (...args) => donorStatuses.push(args),
  URLSearchParams,
  window: {
    history: { replaceState: (...args) => bookstoreSandbox.historyCalls.push(args) },
    location: { search: '?order_success=1' },
  },
  historyCalls: [],
};
vm.runInNewContext(bookstoreController, bookstoreSandbox, { filename: 'bookstore.js' });
assert.equal(bookstoreSandbox.formatCentsAsDollars(1250), '$12.50');
assert.match(bookstoreSandbox.bookstoreCategoryIcon('book'), /<svg/);
bookstoreSandbox.handleBookstoreCheckoutReturn();
assert.deepEqual(donorStatuses[0], [
  'Payment received — thank you! Your parish will let you know when your item is ready.',
  'success',
]);
assert.equal(bookstoreSandbox.historyCalls[0][1], '');
assert.equal(bookstoreSandbox.historyCalls[0][2], '/myagapay/bookstore');

function assertOrderedScripts(file, first, second) {
  const html = read(file);
  const firstIndex = html.indexOf(first);
  const secondIndex = html.indexOf(second);
  assert.ok(firstIndex >= 0, `${file} must load ${first}`);
  assert.ok(secondIndex > firstIndex, `${file} must load ${first} before ${second}`);
  return html;
}

const adminHtml = assertOrderedScripts(
  'public/admin.html',
  '/admin/controllers/tax-exemptions.js?v=20260904-controllers1',
  '/admin/app.js?v=20260904-controllers1'
);
assert.ok(adminHtml.indexOf('/admin/presentation.js') < adminHtml.indexOf('/admin/controllers/tax-exemptions.js'));
assert.doesNotMatch(read('public/admin/login.html'), /controllers\/tax-exemptions\.js/);

for (const file of ['public/donor/bookstore.html', 'public/myagapay/bookstore.html']) {
  assertOrderedScripts(
    file,
    '/donor/controllers/bookstore.js?v=20260904-controllers1',
    '/donor/app.js?v=20260904-controllers1'
  );
}
for (const file of donorAppPagePaths) {
  assert.match(
    read(file),
    /\/donor\/app\.js\?v=20260904-controllers1/,
    `${file} must invalidate the pre-extraction Donor app cache`
  );
}
assert.doesNotMatch(read('public/myagapay/account.html'), /controllers\/bookstore\.js/);
assert.doesNotMatch(read('public/donor/index.html'), /controllers\/bookstore\.js/);

assert.ok(adminAppScriptPaths().includes('public/admin/controllers/tax-exemptions.js'));
assert.ok(donorAppScriptPaths().includes('public/donor/controllers/bookstore.js'));

console.log(
  `PASS - classic controller extraction preserves ${taxGlobals.length} Tax Exemptions globals and ${bookstoreGlobals.length} Bookstore globals`
);
