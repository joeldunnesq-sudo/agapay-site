import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { sendDonorDonationReceiptEmail } from '../src/handlers/donor.js';
import { donorSummaryFromOfferings, publicDonorOffering } from '../src/handlers/parish-donor-offerings.js';
const read = (p) => readFileSync(p, 'utf8');
const js = (p) => transformSync(read(p), { loader: 'ts', target: 'es2022' }).code;
const sandbox = { accountingMoney: (c) => `$${(Number(c || 0) / 100).toFixed(2)}` };
const gift = {
  id: 'fixture',
  parishId: 'test',
  donorEmail: 'fixture@example.test',
  amountCents: 10000,
  giftAmountCents: 10000,
  chargeCents: 10330,
  coverFees: true,
  donorCoveredFeeCents: 330,
  paymentStatus: 'paid',
  frequency: 'monthly',
  createdAt: new Date().toISOString(),
  isDiagnostic: true,
};
const summary = donorSummaryFromOfferings([gift, { ...gift, id: 'refund', refundedCents: 500 }]);
assert.equal(summary.ytdCents, 20160);
assert.equal(summary.monthCents, 20160);
assert.equal(summary.stewardshipYtdCents, 20000, 'Pledge progress keeps intended gift');
assert.equal(publicDonorOffering(gift).contributionCents, 10330);
assert.equal(publicDonorOffering({ ...gift, refundedCents: 500 }).contributionCents, 9830);
let message;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), 'https://api.resend.com/emails');
  message = JSON.parse(options.body);
  return new Response(JSON.stringify({ id: 'fixture-only' }), { status: 200 });
};
try {
  await sendDonorDonationReceiptEmail({ RESEND_API_KEY: 'fake-test-key' }, gift);
  assert.match(message.html, /Total contribution, including any fee-covering addition:<\/strong> \$103.30/);
  assert.match(message.html, /generally tax-deductible/);
  await sendDonorDonationReceiptEmail(
    { RESEND_API_KEY: 'fake-test-key' },
    { ...gift, coverFees: false, chargeCents: 10000 }
  );
  assert.doesNotMatch(message.html, /generally tax-deductible/);
} finally {
  globalThis.fetch = originalFetch;
}
for (const p of [
  'public/give/form.html',
  'public/give/embed.html',
  'public/donor/give.html',
  'public/myagapay/giving/give.html',
  'public/give/parish-giving/index.html',
]) {
  assert.match(read(p), /aria-describedby="feeTaxNote"/);
  assert.match(read(p), /generally tax-deductible to the same extent as your donation/);
  assert.match(read(p), /included in your annual giving statement/);
}
const history = { money: sandbox.accountingMoney, escapeHtml: String, shortDate: String };
vm.createContext(history);
vm.runInContext(js('src/browser/donor/controllers/history.ts'), history);
assert.match(history.offeringRows([publicDonorOffering(gift)]), /<strong>\$103.30<\/strong><\/header>/);
assert.match(
  history.offeringRows([publicDonorOffering({ ...gift, refundedCents: 500 })]),
  /<strong>\$98.30<\/strong><\/header>/
);
console.log('PASS - gross donor totals, receipt and five donation fee disclosures (mocked email only)');
