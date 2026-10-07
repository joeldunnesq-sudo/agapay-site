import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const panes = new Map(
  [
    'reconcileAllocationsPane',
    'reconcileGiftActivityPane',
    'reconcilePayoutsPane',
    'reconcileExceptionsPane',
    'reconcileReviewHistory',
  ].map((id) => [id, { innerHTML: '' }])
);
const statuses = [],
  downloads = [],
  printouts = [];
let blocked = false;
const context = vm.createContext({
  document: { getElementById: (id) => panes.get(id) || null },
  Blob,
  Date,
  escapeHtml: (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;'),
  moneyFull: (v) => '$' + (Number(v || 0) / 100).toFixed(2),
  statusLabel: (v) => v,
  reconciliationDate: (v) => 'date:' + v,
  reconciliationMonthLabel: (v) => v,
  fundReportColor: () => '#123456',
  setStatus: (...args) => statuses.push(args),
  downloadBlob: (name, blob) => downloads.push({ name, blob }),
  currentParish: { parishId: 'test', parishName: 'Parish <safe>' },
  reconciliationData: null,
  collectFundTransferInstructions: () => [
    { key: 'fund', action: 'transfer', destination: 'Savings <safe>', completed: true, reference: 'REF <safe>' },
  ],
  window: {
    open: () => {
      if (blocked) return null;
      const popup = { opener: 'parent', document: { write: (html) => printouts.push({ popup, html }), close() {} } };
      return popup;
    },
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/giving/reconciliation-reports.js', import.meta.url), 'utf8'),
  context
);
context.exportReconciliationCsv();
context.printFundTransferWorksheet();
context.printReconciliationReport();
assert.equal(downloads.length, 0);
assert.equal(printouts.length, 0);
assert.equal(statuses.length, 3);
context.renderReconciliationAllocations([]);
context.renderReconciliationPayouts([], []);
context.renderReconciliationExceptions([]);
context.renderReconciliationReviewHistory([]);
context.renderReconciliationGiftActivity({});
assert.match(panes.get('reconcileAllocationsPane').innerHTML, /No verified/);
assert.match(panes.get('reconcileExceptionsPane').innerHTML, /bank check is still required/);
const data = {
  available: true,
  complete: false,
  state: 'draft',
  period: { month: '2026-09', timezone: 'UTC' },
  generatedAt: '2026-10-01T12:00:00Z',
  fingerprint: 'snapshot',
  summary: { depositedCents: 10000, matchedNetCents: 9500 },
  allocations: [
    {
      key: 'fund',
      label: 'Fund <safe>',
      catalogSource: 'historical_gift',
      netCents: 9500,
      grossCents: 10000,
      feeCents: 500,
      transactionCount: 1,
    },
  ],
  transactions: [
    {
      id: 'tx',
      payoutId: 'p',
      allocationKey: 'fund',
      donorName: '=FORMULA()',
      created: 10,
      grossCents: -500,
      feeCents: 0,
      netCents: -500,
      matched: false,
    },
  ],
  payouts: [{ id: 'p', matchingComplete: false, amountCents: 10000 }],
  exceptions: [{ severity: 'critical', message: 'Review <safe>', amountCents: 500 }],
  transferWorksheet: {
    available: true,
    depositedCents: 10000,
    unallocatedCents: 500,
    lines: [{ key: 'fund', label: 'Fund <safe>', netCents: 9500 }],
  },
};
context.reconciliationData = data;
context.renderReconciliationAllocations(data.allocations);
assert.match(panes.get('reconcileAllocationsPane').innerHTML, /Fund &lt;safe>/);
assert.match(panes.get('reconcileAllocationsPane').innerHTML, /Saved gift designation/);
context.renderReconciliationPayouts(data.payouts, data.transactions);
assert.match(panes.get('reconcilePayoutsPane').innerHTML, /Not verified/);
for (const [difference, matched, label, chip] of [
  [0, false, '1 to review', 'attention'],
  [50, true, 'Composition delta', 'partial'],
  [101, true, 'Composition delta', 'attention'],
  [0, true, 'Items matched', 'matched'],
]) {
  context.renderReconciliationPayouts(
    [{ id: 'p', matchingComplete: true, differenceCents: difference }],
    [{ payoutId: 'p', matched }]
  );
  const html = panes.get('reconcilePayoutsPane').innerHTML;
  assert.ok(html.includes(label));
  assert.ok(html.includes('status-chip ' + chip));
}
context.renderReconciliationExceptions(data.exceptions);
assert.match(panes.get('reconcileExceptionsPane').innerHTML, /Review &lt;safe>/);
context.renderReconciliationGiftActivity({ available: true, complete: true, estimatedFeeCount: 1, giftCount: 2 });
assert.match(panes.get('reconcileGiftActivityPane').innerHTML, /includes estimated fees/);
context.renderReconciliationReviewHistory([
  {
    status: 'closed',
    updatedAt: '2026-10-01',
    bankConfirmed: true,
    bankStatementCents: 10000,
    notes: '<safe>',
    reviewId: 'v1',
  },
]);
assert.match(panes.get('reconcileReviewHistory').innerHTML, /Reconciled review/);
assert.match(panes.get('reconcileReviewHistory').innerHTML, /&lt;safe>/);
assert.equal(context.csvCell(-5), '"-5"');
assert.equal(context.csvCell(' -5'), '"\' -5"');
assert.equal(context.csvCell('a"b'), '"a""b"');
context.exportFundReconciliation('transactions');
let csv = await downloads.at(-1).blob.text();
assert.match(csv, /"'-?=FORMULA\(\)"/);
assert.match(csv, /"-5"/);
assert.match(csv, /Draft - incomplete or unresolved/);
context.exportReconciliationCsv();
assert.match(await downloads.at(-1).blob.text(), /Unallocated \/ needs review/);
context.printFundTransferWorksheet();
let printed = printouts.at(-1);
assert.equal(printed.popup.opener, null);
assert.match(printed.html, /Hold \$5.00 for review/);
assert.match(printed.html, /Savings &lt;safe>/);
assert.match(printed.html, /DRAFT — NOT BANK-VERIFIED/);
context.printReconciliationReport();
assert.match(printouts.at(-1).html, /Not verified for this report revision/);
data.state = 'reconciled';
data.closeRecord = { bankStatementCents: 10000, closedAt: '2026-10-01', notes: 'Saved <safe>' };
context.printReconciliationReport();
assert.match(printouts.at(-1).html, /RECONCILED — BANK CHECK SAVED/);
assert.match(printouts.at(-1).html, /Saved &lt;safe>/);
blocked = true;
const count = printouts.length;
context.printReconciliationReport();
context.printFundTransferWorksheet();
assert.equal(printouts.length, count);
assert.match(statuses.at(-1)[0], /Allow pop-ups/);
console.log(
  'PASS - reconciliation reports: empty states, payout review thresholds, escaping, numeric refunds, CSV formula protection, draft/reconciled printing and popup denial'
);
