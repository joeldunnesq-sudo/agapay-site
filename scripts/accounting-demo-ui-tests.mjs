import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const holder = { innerHTML: '', scrollIntoView() {} };
const calls = [];
const session = { id: 'demo', status: 'in_progress', difference: 0, version: 1 };
const context = vm.createContext({
  console,
  URLSearchParams,
  accountingBankPreview: null,
  accountingData: { tier: 'mission', banking: null },
  document: { getElementById: () => holder, querySelector: () => holder },
  accountingApi: (path) => path,
  authHeaders: () => ({}),
  renderAccountingPane() {},
  escapeHtml: String,
  escapeAttr: String,
  accountingDate: String,
  accountingMoney: (n) => String(n),
  accountingEmpty: (_, message) => message,
  fetch: async (path, options = {}) => {
    calls.push({ path, options });
    let payload = {};
    if (path === '/bank/accounts') payload = { accounts: [{ id: 'bank', name: 'Demo' }] };
    if (path === '/bank/reconciliations')
      payload = { sessions: [{ ...session }, { id: 'voided', status: 'voided', difference: 0 }] };
    if (path === '/bank/reconciliations/demo') payload = { reconciliation: { ...session, difference: 2700 } };
    if (path.endsWith('/suggestions'))
      payload = {
        suggestions: [
          {
            bankTransactionId: 'bank-tx',
            journalLineId: 'line',
            journalEntryId: 'entry',
            amount: 2700,
            reasons: ['Exact amount'],
          },
        ],
      };
    if (path.endsWith('/matches')) payload = { reconciliation: { difference: 0 } };
    return { ok: true, json: async () => payload };
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/accounting/banking.js', import.meta.url), 'utf8'),
  context
);
await context.loadAccountingPhaseE();
assert.equal(context.accountingData.banking.sessions[0].difference, 2700, 'Recalculate the stale stored zero');
context.renderAccountingBankStatements(holder);
assert.match(holder.innerHTML, /Review matches/);
assert.doesNotMatch(holder.innerHTML, /completeAccountingReconciliation/);
assert.match(holder.innerHTML, /Open reconciliations<\/span><strong>1/);
await context.showAccountingMatchSuggestions('demo');
assert.match(holder.innerHTML, /Confirm match/);
await context.confirmAccountingSuggestedMatch('demo', 0, { disabled: false });
const mutation = calls.find((c) => c.path.endsWith('/matches'));
assert.equal(mutation.options.method, 'POST');
assert.deepEqual(JSON.parse(mutation.options.body), { bankTransactionIds: ['bank-tx'], journalLineIds: ['line'] });
context.fetch = async () => ({ ok: false, json: async () => ({ message: 'Access denied' }) });
await context.showAccountingMatchSuggestions('demo');
assert.match(holder.innerHTML, /Access denied/);
assert.doesNotMatch(holder.innerHTML, /Confirm match/);

const reports = vm.createContext({
  accountingData: { setup: {} },
  Date,
  FormData: class {
    constructor(form) {
      return Object.entries(form.values)[Symbol.iterator]();
    }
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/accounting/reports.js', import.meta.url), 'utf8'),
  reports
);
let loaded = false;
reports.loadAccountingDepthReport = async () => {
  loaded = true;
};
reports.accountingReportView = 'cashFlows';
await reports.applyAccountingReportDates({
  preventDefault() {},
  currentTarget: { values: { start: '2026-07-01', end: '2026-07-31' } },
});
assert.equal(loaded, true);
assert.equal(reports.accountingReportPeriod().start, '2026-07-01');
console.log('PASS - live reconciliation totals, matching UI, voided-session controls, access errors, and report dates');
