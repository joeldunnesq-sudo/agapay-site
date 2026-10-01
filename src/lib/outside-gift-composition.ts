import { OutsideGiftError } from './outside-gift-error.js';

export interface ManualGiftInput {
  readonly id: string;
  readonly amountCents: unknown;
}
export interface LinkedOutsideGiftInput {
  readonly amountCents: number;
  readonly accounting?: {
    readonly linked: boolean;
    readonly entryId: string;
    readonly lineId: string;
  } | null;
}
export type RemainingManualGift<T extends ManualGiftInput> = Omit<
  T,
  'amountCents' | 'giftAmountCents' | 'parishNetCents'
> & {
  amountCents: number;
  giftAmountCents: number;
  parishNetCents: number;
};

export function subtractLinkedOutsideGifts<T extends ManualGiftInput>(
  manualGifts: readonly T[],
  outsideGifts: readonly LinkedOutsideGiftInput[]
): RemainingManualGift<T>[] {
  const allocated = new Map<string, number>();
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
