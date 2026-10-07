import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const elements = new Map();
const get = (id) => {
  if (!elements.has(id))
    elements.set(id, {
      value: '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      closed: 0,
      close() {
        this.closed++;
      },
    });
  return elements.get(id);
};
const requests = [],
  events = [];
let mode = 'success',
  refreshes = 0;
const form = {
  fields: { amount: '12.34', entryDate: '2026-09-01', reason: 'Correction' },
  elements: {
    confirmedNotDuplicate: { checked: true },
    confirmedDeposit: { checked: true },
    confirmedLedgerUnchanged: { checked: true },
    reason: { value: 'Wrong entry' },
  },
};
const context = vm.createContext({
  document: { getElementById: get, dispatchEvent: (e) => events.push(e.type) },
  currentParish: { parishId: 'p' },
  authHeaders: () => ({ 'x-parish-session': 'synthetic' }),
  FormData: class {
    constructor(f) {
      this.f = f;
    }
    *[Symbol.iterator]() {
      yield* Object.entries(this.f.fields);
    }
  },
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  fetch: async (url, init) => {
    assert.equal(init.headers['x-parish-session'], 'synthetic');
    requests.push({ url, init });
    return {
      ok: mode === 'success',
      json: async () => (mode === 'success' ? {} : { error: 'Duplicate record', code: 'outside_gift_duplicate' }),
    };
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/giving/outside-gifts.js', import.meta.url), 'utf8'),
  context
);
context.loadOutsideGiving = async () => {
  refreshes++;
};
context.loadGivingHistory = async () => {
  refreshes++;
};
vm.runInContext("outsideGivingState.requestKey='stable-key'", context);
const event = { currentTarget: form, preventDefault() {} };
for (const amount of ['0', '-1', '1.001', '1e2', 'NaN', '90071992547409999']) {
  form.fields.amount = amount;
  const count = requests.length;
  await context.submitOutsideGift(event);
  assert.equal(requests.length, count, amount);
}
form.fields.amount = '12.34';
mode = 'duplicate';
await context.submitOutsideGift(event);
assert.equal(get('outsideDuplicateReason').hidden, false);
assert.equal(get('outsideGiftSave').disabled, false);
assert.equal(refreshes, 0);
const failed = JSON.parse(requests.at(-1).init.body);
assert.equal(failed.amountCents, 1234);
assert.equal(failed.requestKey, 'stable-key');
assert.equal(failed.confirmedNotDuplicate, true);
mode = 'success';
await context.submitOutsideGift(event);
assert.deepEqual(JSON.parse(requests.at(-1).init.body), failed);
assert.equal(refreshes, 2);
assert.deepEqual(events, ['agapay:outside-gift-saved']);
assert.equal(get('outsideGivingYear').value, '2026');
const gift = { id: 'gift/1', revision: 3, accounting: { linked: false } };
context.gift = gift;
vm.runInContext(
  'outsideGivingState.editing=gift; outsideGivingState.accountingGift=gift; outsideGivingState.voidGift=gift',
  context
);
await context.submitOutsideGift(event);
assert.match(requests.at(-1).url, /gift%2F1\/correct$/);
assert.equal(JSON.parse(requests.at(-1).init.body).revision, 3);
get('outsideGiftSave').disabled = true;
const closed = get('outsideGiftDialog').closed;
context.closeOutsideGift();
assert.equal(get('outsideGiftDialog').closed, closed);
get('outsideGiftSave').disabled = false;
context.closeOutsideGift();
assert.equal(get('outsideGiftDialog').closed, closed + 1);
await context.submitOutsideAccounting(event);
assert.match(requests.at(-1).url, /gift%2F1\/accounting$/);
let body = JSON.parse(requests.at(-1).init.body);
assert.equal(body.revision, 3);
assert.equal(body.confirmedDeposit, true);
assert.equal(body.confirmedLedgerUnchanged, true);
gift.accounting.linked = true;
await context.submitOutsideAccounting(event);
assert.match(requests.at(-1).url, /gift%2F1\/unlink$/);
mode = 'duplicate';
const accountingClosed = get('outsideAccountingDialog').closed;
await context.submitOutsideAccounting(event);
assert.equal(get('outsideAccountingDialog').closed, accountingClosed);
assert.equal(get('outsideAccountingSave').disabled, false);
assert.equal(get('outsideAccountingStatus').textContent, 'Duplicate record');
mode = 'success';
await context.submitOutsideVoid(event);
assert.match(requests.at(-1).url, /gift%2F1\/void$/);
assert.deepEqual(JSON.parse(requests.at(-1).init.body), { revision: 3, reason: 'Wrong entry' });
assert.equal(get('outsideVoidSave').disabled, false);
mode = 'duplicate';
const voidClosed = get('outsideVoidDialog').closed;
await context.submitOutsideVoid(event);
assert.equal(get('outsideVoidDialog').closed, voidClosed);
assert.equal(get('outsideVoidStatus').textContent, 'Duplicate record');
console.log(
  'PASS - outside giving mutations: amount guards, duplicate retry/request key, correction revision, busy dialog, Accounting link/unlink confirmation, void reason and failure recovery'
);
