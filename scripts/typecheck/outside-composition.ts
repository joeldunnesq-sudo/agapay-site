import { subtractLinkedOutsideGifts } from '../../src/lib/outside-gift-composition.js';
import type { OutsideGivingGift } from '../../src/lib/outside-gift-reads.js';
declare const outside: readonly OutsideGivingGift[];
const result = subtractLinkedOutsideGifts(
  [{ id: 'a', amountCents: '100', label: 'Gift', parishNetCents: null }],
  outside
);
const amount: number = result[0].amountCents;
const net: number = result[0].parishNetCents;
const label: string = result[0].label;
void [amount, net, label];
// @ts-expect-error: manual gift IDs must be strings.
subtractLinkedOutsideGifts([{ id: 1, amountCents: 1 }], outside);
// @ts-expect-error: linked gift amounts are numeric reader outputs.
subtractLinkedOutsideGifts([], [{ amountCents: '100' }]);
// @ts-expect-error: link identifiers must be strings.
subtractLinkedOutsideGifts([], [{ amountCents: 100, accounting: { linked: true, entryId: 1, lineId: 'l' } }]);
// @ts-expect-error: monetary replacements cannot remain null.
const nullable: null = result[0].parishNetCents;
void nullable;
