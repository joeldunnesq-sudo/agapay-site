// Generated from src/lib/outside-gift-composition.ts by npm run build:server. Do not edit.
import { OutsideGiftError } from './outside-gift-error.js';
function subtractLinkedOutsideGifts(manualGifts, outsideGifts) {
  const allocated = /* @__PURE__ */ new Map();
  for (const gift of outsideGifts)
    if (gift.accounting?.linked) {
      const key = 'accounting:' + gift.accounting.entryId + ':' + gift.accounting.lineId;
      allocated.set(key, (allocated.get(key) || 0) + gift.amountCents);
    }
  return manualGifts
    .map((gift) => {
      const remaining = Number(gift.amountCents) - (allocated.get(gift.id) || 0);
      if (remaining < 0)
        throw new OutsideGiftError('An Accounting contribution link needs review before totals can be shown.', 409);
      return { ...gift, amountCents: remaining, giftAmountCents: remaining, parishNetCents: remaining };
    })
    .filter((gift) => gift.amountCents > 0);
}
export { subtractLinkedOutsideGifts };
