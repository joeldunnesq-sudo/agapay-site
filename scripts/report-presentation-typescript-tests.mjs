import assert from 'node:assert/strict';
import { givingFeeReportHtml, appendGivingFeeReport } from '../src/stewardship/giving-fee-presentation.js';
import { summarizeGivingFees } from '../src/lib/giving-fee-report.js';
import { ledgerCostTable } from '../src/stewardship/ledger-cost-presentation.js';
import { ledgerCostTable as legacyLedgerCostTable } from '../src/stewardship/platform-costs.js';
import { councilReportPeriod, accountingCouncilReport } from '../src/stewardship/council-reports.js';

assert.equal(legacyLedgerCostTable, ledgerCostTable, 'legacy consumers retain the same renderer');
const seenAmounts = [];
const ledger = ledgerCostTable(
  {
    expenseLines: [
      { accountNumber: '5840', amount: '101' },
      { accountNumber: '5840', amount: -1 },
      { accountNumber: 5840, amount: 99900 },
      { accountNumber: 'custom', amount: 99900 },
    ],
  },
  {
    expenseLines: [
      { accountNumber: '5850', amount: '250' },
      { accountNumber: '5860', amount: null },
    ],
  },
  (amount) => {
    seenAmounts.push(amount);
    return amount.toFixed(2);
  }
);
assert.deepEqual(
  seenAmounts,
  [1, 0, 0, 2.5, 0, 0],
  'strict account matching, coercion, and cents conversion are preserved'
);
assert.match(ledger, /Included in total expenses above/);
assert.doesNotThrow(() => ledgerCostTable({}, { expenseLines: null }, String));
const failure = new Error('formatter failed');
assert.throws(
  () =>
    ledgerCostTable({}, {}, () => {
      throw failure;
    }),
  (error) => error === failure
);

const report = summarizeGivingFees([], 2026);
Object.assign(report.annual, {
  actualStripeFeeCents: 12345,
  confirmedCount: 2,
  donorFundedStripeFeeCents: 10000,
  parishFundedStripeFeeCents: 2345,
  pendingCount: 3,
  estimatedStripeFeeCents: 400,
  refundedCents: 500,
});
report.quarterly[0].label = '<quarter & "quoted">';
report.monthly[0].label = '<month>';
const feeHtml = givingFeeReportHtml(report);
assert.match(feeHtml, /\$123\.45/);
assert.match(feeHtml, /\$100\.00/);
assert.match(feeHtml, /\$23\.45/);
assert.match(feeHtml, /3 gifts await reconciliation \(\$4\.00/);
assert.match(feeHtml, /Recorded refunds: \$5\.00/);
assert.match(feeHtml, /&lt;quarter &amp; &quot;quoted&quot;&gt;/);
assert.ok(feeHtml.indexOf('&lt;quarter') < feeHtml.indexOf('&lt;month'), 'quarter rows precede month rows');
assert.equal((feeHtml.match(/<tr>/g) || []).length, 17);
for (const absent of [null, undefined, {}, { annual: null }]) assert.equal(givingFeeReportHtml(absent), '');

const input = new Response('<body><main>Original</main></body>', {
  status: 202,
  headers: { 'Content-Type': 'text/html', 'X-Test': 'preserved' },
});
const appended = await appendGivingFeeReport(input, report);
assert.equal(appended.status, 202);
assert.equal(appended.headers.get('x-test'), 'preserved');
assert.equal(appended.headers.get('content-type'), 'text/html');
assert.equal(await appended.text(), `<body><main>Original${feeHtml}</main></body>`);
assert.equal(input.bodyUsed, true);
assert.equal(
  await (await appendGivingFeeReport(new Response('<body>Original</body>'), report)).text(),
  `<body>Original${feeHtml}</body>`
);
assert.equal(await (await appendGivingFeeReport(new Response('No closing tag'), report)).text(), 'No closing tag');
assert.equal(await (await appendGivingFeeReport(new Response('<main></main>'), null)).text(), '<main></main>');
const consumed = new Response('used');
await consumed.text();
await assert.rejects(appendGivingFeeReport(consumed, report), TypeError);

const fixedNow = new Date('2026-09-30T23:59:59Z');
const select = (query) => councilReportPeriod(new URL(`https://example.test/?${query}`), fixedNow);
assert.deepEqual(select('month=2024-02'), {
  year: 2024,
  requestedMonth: '2024-02',
  monthStart: '2024-02-01',
  monthEnd: '2024-02-29',
  nextMonthStart: '2024-03-01',
  monthLabel: 'February 2024',
});
assert.equal(select('month=2100-02').monthEnd, '2100-02-28');
assert.equal(select('month=2026-12').nextMonthStart, '2027-01-01');
assert.equal(select('').requestedMonth, '2026-09');
assert.equal(select('year=2025').requestedMonth, '2025-09');
for (const query of [
  'month=2026-13',
  'month=1999-12',
  'month=2101-01',
  'year=2025&month=2026-01',
  'year=no',
  'month=2026-1',
])
  assert.equal(select(query), null, query);
const snapshot = {
  totalIncomeCents: 100099,
  totalExpenseCents: 10025,
  netCents: 90074,
  expenseLines: [{ accountNumber: '5840', amount: 10025 }],
  restrictedFunds: [
    {
      fundName: '<Building & fund>',
      beginningBalanceCents: 2000,
      totalReceivedCents: 500,
      totalDisbursedCents: 175,
      endingBalanceCents: 2325,
    },
    {
      fundName: 'Inactive zero fund',
      beginningBalanceCents: 0,
      totalReceivedCents: 0,
      totalDisbursedCents: 0,
      endingBalanceCents: 0,
    },
    {
      fundName: 'Negative balance',
      beginningBalanceCents: 0,
      totalReceivedCents: 0,
      totalDisbursedCents: 100,
      endingBalanceCents: -100,
    },
  ],
};
const before = structuredClone(snapshot);
const response = accountingCouncilReport('<Parish & name>', select('month=2024-02'), snapshot, {
  ...snapshot,
  totalIncomeCents: 200099,
});
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'text/html;charset=utf-8');
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(response.headers.get('content-disposition'), 'inline; filename="financial-report-2024-02.html"');
const html = await response.text();
for (const expected of [
  '&lt;Parish &amp; name&gt;',
  '&lt;Building &amp; fund&gt;',
  '$1,000.99',
  '$2,000.99',
  '$100.25',
  '$900.74',
  '$23.25',
  '-$1.00',
  'Negative balance',
  '2024-02-29',
])
  assert.ok(html.includes(expected), expected);
assert.ok(!html.includes('Inactive zero fund'));
assert.deepEqual(snapshot, before, 'rendering does not mutate financial data');
const emptyHtml = await accountingCouncilReport(
  'Parish',
  select(''),
  { ...snapshot, restrictedFunds: [] },
  snapshot
).text();
assert.match(emptyHtml, /No restricted fund balances or activity for this month/);
console.log('PASS - report presentation contracts, escaping, amounts, dates, compatibility, and response behavior');
