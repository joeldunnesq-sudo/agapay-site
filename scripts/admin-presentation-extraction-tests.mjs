import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { adminAppScriptPaths, readAdminAppSource } from './lib/admin-dashboard-source.mjs';
import { repoRoot } from './lib/browser-composed-source.mjs';
import path from 'node:path';

const presentationPath = path.join(repoRoot, 'public/admin/presentation.js');
const presentationSource = readFileSync(presentationPath, 'utf8');
const appSource = readFileSync(path.join(repoRoot, 'public/admin/app.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(presentationSource, sandbox, { filename: presentationPath });

const extractedGlobals = [
  'computeLocalPlatformSummary',
  'escapeAttr',
  'escapeHtml',
  'field',
  'formatClock',
  'jsAttr',
  'jsString',
  'jsonForTextarea',
  'money',
  'moneyShort',
  'monthLabel',
  'readable',
  'readableStripeRequirement',
  'renderStripeRequirements',
  'shortDate',
  'subscriptionTierLabel',
  'transactionFeeLabel',
];

for (const name of extractedGlobals) {
  assert.equal(typeof sandbox[name], 'function', `${name} must retain its classic-script global`);
  assert.doesNotMatch(appSource, new RegExp(`function\\s+${name}\\s*\\(`), `${name} must stay extracted from app.js`);
}

assert.equal(
  sandbox.escapeHtml(`<script data-name="O'Brien">&</script>`),
  '&lt;script data-name=&quot;O&#39;Brien&quot;&gt;&amp;&lt;/script&gt;'
);
assert.equal(sandbox.escapeAttr('"quoted"'), '&quot;quoted&quot;');
assert.equal(sandbox.jsString("O'Brien\r\nnext"), "O\\'Brien\\nnext");
assert.equal(sandbox.jsAttr("'\n<"), '\\&#39;\\n&lt;');
assert.match(sandbox.field('<Label>', '<Value>', 'wide'), /field wide[\s\S]*&lt;Label&gt;[\s\S]*&lt;Value&gt;/);

const stripeRequirements = sandbox.renderStripeRequirements({
  stripeAccountId: 'acct_test',
  stripeDisabledReason: 'requirements.<past_due>',
  stripeRequirementsDue: ['individual.first_name', '<script>'],
});
assert.match(stripeRequirements, /Stripe needs parish action/);
assert.match(stripeRequirements, /Individual \/ First Name/);
assert.match(stripeRequirements, /&lt;Script&gt;/);
assert.doesNotMatch(stripeRequirements, /<script>/i);

assert.equal(sandbox.money(null), 'Custom');
assert.equal(sandbox.money(0), 'Free');
assert.equal(sandbox.money(2500), '$25/mo');
assert.equal(sandbox.moneyShort(125000), '$1.3K');
assert.equal(sandbox.monthLabel(11), 'Dec');
assert.equal(sandbox.readable('replacement_required'), 'replacement required');
assert.equal(sandbox.subscriptionTierLabel({ subscriptionTier: 'mission' }), 'Giving');
assert.equal(sandbox.subscriptionTierLabel({ subscriptionTier: 'diocese' }), 'Cathedral / Diocese');
assert.equal(sandbox.transactionFeeLabel({}), 'No AGAPAY donation fee (Stripe processing only)');
assert.equal(sandbox.formatClock('not-a-date'), '—');
assert.equal(sandbox.shortDate('not-a-date'), '-');
assert.match(sandbox.jsonForTextarea(['<unsafe>'], []), /&lt;unsafe&gt;/);

const year = new Date().getFullYear();
const summary = sandbox.computeLocalPlatformSummary([
  {
    receivedAt: `${year}-01-15T12:00:00Z`,
    status: 'verified',
    stripeAccountStatus: 'charges_enabled',
  },
  {
    receivedAt: `${year - 1}-01-15T12:00:00Z`,
    status: 'pending',
    stripeAccountStatus: 'not_connected',
  },
]);
assert.equal(summary.totalRegistered, 2);
assert.equal(summary.totalVerified, 1);
assert.equal(summary.connectedStripeAccounts, 1);
assert.equal(summary.monthly[0].registered, 1);
assert.equal(summary.monthly[0].verified, 1);

function assertPresentationLoadsBeforeApp(file) {
  const html = readFileSync(path.join(repoRoot, file), 'utf8');
  const presentationIndex = html.indexOf('/admin/presentation.js');
  const appIndex = html.indexOf('/admin/app.js');
  assert.ok(presentationIndex >= 0, `${file} must load the extracted presentation boundary`);
  assert.ok(appIndex > presentationIndex, `${file} must load presentation.js before app.js`);
  assert.match(html, /\/admin\/presentation\.js\?v=20260904-refactor1/);
  assert.match(html, /\/admin\/app\.js\?v=20260904-controllers1/);
}

assertPresentationLoadsBeforeApp('public/admin.html');
assertPresentationLoadsBeforeApp('public/admin/login.html');
assert.ok(adminAppScriptPaths().includes('public/admin/presentation.js'));
assert.match(readAdminAppSource(), /installAdminPresentation/);

console.log(`PASS - Admin presentation pilot preserves ${extractedGlobals.length} classic globals and lowers app.js`);
