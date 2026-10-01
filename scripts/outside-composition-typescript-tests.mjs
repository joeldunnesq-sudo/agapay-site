import assert from 'node:assert/strict';
import { subtractLinkedOutsideGifts as subtract } from '../src/lib/outside-gift-composition.js';
import { subtractLinkedOutsideGifts as legacy, OutsideGiftError } from '../src/lib/outside-gifts.js';
assert.equal(subtract, legacy);
const linked = (amountCents, entryId = 'e', lineId = 'l') => ({
  amountCents,
  accounting: { linked: true, entryId, lineId },
});
const manual = Object.freeze([
  Object.freeze({
    id: 'accounting:e:l',
    amountCents: '1000',
    giftAmountCents: null,
    parishNetCents: null,
    label: 'General',
  }),
  Object.freeze({ id: 'accounting:e:other', amountCents: 400, label: 'Other' }),
  Object.freeze({ id: 'accounting:other:l', amountCents: 500, label: 'Separate entry' }),
]);
const outside = Object.freeze(
  [
    linked(200),
    linked(300),
    linked(400, 'e', 'other'),
    linked(100, 'other'),
    { amountCents: 99999 },
    { amountCents: 99999, accounting: null },
    { amountCents: 99999, accounting: { linked: false, entryId: 'e', lineId: 'l' } },
  ].map(Object.freeze)
);
const before = structuredClone({ manual, outside });
const result = subtract(manual, outside);
assert.deepEqual(result, [
  { ...manual[0], amountCents: 500, giftAmountCents: 500, parishNetCents: 500 },
  { ...manual[2], amountCents: 400, giftAmountCents: 400, parishNetCents: 400 },
]);
assert.equal(result.reduce((sum, gift) => sum + gift.amountCents, 0) + 1000, 1900);
assert.deepEqual({ manual, outside }, before);
assert.notEqual(result[0], manual[0]);
assert.throws(
  () => subtract(manual, [linked(1001)]),
  (e) => e instanceof OutsideGiftError && e.status === 409 && e.code === 'outside_gift_invalid'
);
assert.deepEqual(
  subtract(
    [
      { id: 'a', amountCents: 0 },
      { id: 'b', amountCents: null },
      { id: 'c', amountCents: undefined },
      { id: 'd', amountCents: 'invalid' },
    ],
    []
  ),
  []
);
assert.throws(() => subtract([{ id: 'a', amountCents: -1 }], []), OutsideGiftError);
assert.equal(subtract([{ id: 'a', amountCents: true }], [linked(500)])[0].amountCents, 1);
assert.deepEqual(subtract([], outside), []);
console.log(
  'PASS - outside gift composition conserves amounts, isolates links, preserves metadata and rejects over-allocation'
);
