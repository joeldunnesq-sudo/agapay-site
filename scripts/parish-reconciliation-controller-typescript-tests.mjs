import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const elements = new Map();
const get = (id) => {
  if (!elements.has(id))
    elements.set(id, {
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      innerHTML: '',
      textContent: '',
      className: '',
      options: [],
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
    });
  return elements.get(id);
};
const exports = [{ disabled: false }],
  transferControls = [{ disabled: false }],
  requests = [],
  statuses = [];
const context = vm.createContext({
  document: {
    getElementById: get,
    querySelectorAll: (s) => (s === '[data-reconcile-export]' ? exports : transferControls),
  },
  currentParish: { parishId: 'p', timezone: 'Invalid/Zone' },
  authHeaders: () => ({ 'x-parish-session': 'synthetic' }),
  moneyFull: (v) => '$' + (Number(v || 0) / 100).toFixed(2),
  setStatus: (...args) => statuses.push(args),
  renderReconciliationAllocations() {},
  renderReconciliationPayouts() {},
  renderReconciliationExceptions() {},
  renderReconciliationGiftActivity() {},
  renderFundTransferWorksheet() {},
  renderReconciliationReviewHistory() {},
  collectFundTransferInstructions: () => [{ key: 'fund', action: 'retain' }],
  fetch: (url, init) => {
    assert.equal(init.headers['x-parish-session'], 'synthetic');
    return new Promise((resolve, reject) => requests.push({ url, init, resolve, reject }));
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/giving/reconciliation.js', import.meta.url), 'utf8'),
  context
);
const report = (overrides = {}) => ({
  available: true,
  parishId: 'p',
  period: { month: '2026-09', label: 'September', timezone: 'UTC' },
  generatedAt: '2026-10-01',
  complete: true,
  state: 'ready_for_bank_check',
  fingerprint: 'fp',
  summary: { depositedCents: 10000, matchedNetCents: 10000, readyForReview: true },
  ...overrides,
});
const respond = (request, data, ok = true) => request.resolve({ ok, json: async () => data });
const state = () => vm.runInContext('reconciliationData', context);
get('reconcileMonth').value = '2026-09';
context.initReconciliationMonths();
assert.equal((get('reconcileMonth').innerHTML.match(/<option/g) || []).length, 36);
assert.match(get('reconcileMonth').innerHTML, /selected/);
assert.equal(context.reconciliationMonthLabel('bad'), 'Selected month');
assert.equal(context.reconciliationDate(0), '—');
const button = { disabled: false };
let load = context.loadReconciliation(button);
assert.equal(button.disabled, true);
assert.equal(exports[0].disabled, true);
assert.match(requests.at(-1).url, /month=2026-09&detail=full/);
respond(requests.at(-1), report());
await load;
assert.equal(button.disabled, false);
assert.equal(get('reconcileWorkspace').attributes['aria-busy'], 'false');
assert.equal(get('reconcileBankAmount').value, '');
assert.equal(get('reconcileSaveButton').disabled, true);
for (const value of ['', '-1', '1.001', '1e2', '99', '90071992547409999']) {
  get('reconcileBankAmount').value = value;
  get('reconcileBankConfirmed').checked = true;
  context.updateReconciliationDifference();
  assert.equal(get('reconcileSaveButton').disabled, true, value);
}
get('reconcileBankAmount').value = '100.00';
get('reconcileBankConfirmed').checked = false;
context.updateReconciliationDifference();
assert.equal(get('reconcileSaveButton').disabled, true);
get('reconcileBankConfirmed').checked = true;
context.updateReconciliationDifference();
assert.equal(Boolean(get('reconcileSaveButton').disabled), false);
get('reconcileNotes').value = '  Checked  ';
let save = context.saveReconciliationClose(true, button);
const closeRequest = requests.at(-1);
const payload = JSON.parse(closeRequest.init.body);
assert.equal(payload.bankStatementCents, 10000);
assert.equal(payload.notes, 'Checked');
assert.equal(payload.fingerprint, 'fp');
assert.equal(payload.expectedReviewVersion, null);
assert.deepEqual(payload.transferInstructions, [{ key: 'fund', action: 'retain' }]);
const count = requests.length;
await context.saveReconciliationClose(true, button);
assert.equal(requests.length, count);
respond(closeRequest, { error: 'Synthetic conflict' }, false);
await save;
assert.equal(statuses.at(-1)[0], 'Synthetic conflict');
assert.equal(get('reconcileNotes').value, '  Checked  ');
assert.equal(Boolean(get('reconcileSaveButton').disabled), false);
save = context.saveReconciliationClose(true, button);
respond(requests.at(-1), {
  record: {
    status: 'closed',
    bankConfirmed: true,
    bankStatementCents: 10000,
    notes: 'Checked',
    reviewId: 'v1',
    updatedAt: '2026-10-01',
  },
});
await save;
assert.equal(state().state, 'reconciled');
assert.equal(get('reconcileBankAmount').disabled, true);
assert.equal(transferControls[0].disabled, true);
assert.equal(get('reconcileSaveButton').disabled, true);
get('reconcileNotes').value = '';
const before = requests.length;
await context.saveReconciliationClose(false, button);
assert.equal(requests.length, before);
assert.match(statuses.at(-1)[0], /reason for reopening/);
get('reconcileNotes').value = 'Correction';
save = context.saveReconciliationClose(false, button);
assert.equal(JSON.parse(requests.at(-1).init.body).expectedReviewVersion, 'v1');
respond(requests.at(-1), { record: { status: 'open', reviewId: 'v2', updatedAt: '2026-10-02' } });
await save;
assert.equal(state().state, 'ready_for_bank_check');
assert.equal(state().reviewHistory.length, 2);
assert.equal(get('reconcileBankAmount').value, '');
const old = context.loadReconciliation();
const oldRequest = requests.at(-1);
const latest = context.loadReconciliation();
respond(requests.at(-1), report({ fingerprint: 'new' }));
await latest;
respond(oldRequest, report({ fingerprint: 'old' }));
await old;
assert.equal(state().fingerprint, 'new');
load = context.loadReconciliation();
context.currentParish = { parishId: 'other' };
respond(requests.at(-1), report());
await load;
assert.equal(state(), null);
context.currentParish = { parishId: 'p' };
load = context.loadReconciliation();
respond(requests.at(-1), report({ parishId: 'wrong' }));
await load;
assert.match(get('reconcileStatusLine').textContent, /context did not match/);
load = context.loadReconciliation();
respond(requests.at(-1), { available: false, reason: 'Connect first' });
await load;
assert.equal(get('reconcileStatusLine').textContent, 'Connect first');
load = context.loadFundTransferWorksheet(button);
requests.at(-1).reject(Error('Offline'));
await load;
assert.equal(get('reconcileStatusLine').textContent, 'Offline');
assert.equal(button.disabled, false);
load = context.loadReconciliation();
respond(requests.at(-1), report());
await load;
get('reconcileBankAmount').value = '100';
get('reconcileBankConfirmed').checked = true;
context.updateReconciliationDifference();
save = context.saveReconciliationClose(true, button);
const staleSave = requests.at(-1);
load = context.loadReconciliation();
respond(requests.at(-1), report({ fingerprint: 'replacement' }));
await load;
respond(staleSave, { record: { status: 'closed', updatedAt: '2026-10-03' } });
await save;
assert.equal(state().fingerprint, 'replacement');
assert.equal(state().closeRecord, undefined);
context.currentParish = null;
const last = requests.length;
await context.loadReconciliation();
assert.equal(requests.length, last);
console.log(
  'PASS - reconciliation controller: month setup, bank guards, authenticated payloads, save/retry/reopen, duplicate suppression, stale loads/saves, context mismatch and failures'
);
