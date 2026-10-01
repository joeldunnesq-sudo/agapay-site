import { summarizeStoredParishGifts, type StoredParishGift } from '../../src/lib/stored-giving-summary.js';
const gifts: readonly StoredParishGift[] = [{ createdAt: new Date(), amountCents: '100', coverFees: true }];
const result = summarizeStoredParishGifts(gifts);
const currency: 'usd' = result.currency;
const total: number = result.monthly[0].amountCents;
void [currency, total];
// @ts-expect-error: timestamps must be supported Date inputs.
summarizeStoredParishGifts([{ createdAt: {} }]);
// @ts-expect-error: gifts are an array.
summarizeStoredParishGifts({ amountCents: 100 });
// @ts-expect-error: summary amounts are numeric.
const amount: string = result.ytdCents;
void amount;
// @ts-expect-error: input gifts are read-only.
gifts[0].amountCents = 1;
