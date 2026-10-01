import { OutsideGiftError } from '../../src/lib/outside-gift-error.js';
import {
  outsideGiftRow,
  outsideGiver,
  outsideGiftsForGiving,
  loadOutsideGiftRows,
  type OutsideGivingGift,
} from '../../src/lib/outside-gift-reads.js';
declare const env: Env;
const row = await outsideGiftRow(env.AGAPAY_DB, 'a', 'gift');
if (row) {
  const amount: number = row.amount_cents;
  const year: number | null = row.pledge_year;
  void [amount, year];
}
const gifts: OutsideGivingGift[] = await outsideGiftsForGiving(env, 'a', undefined);
const source: 'outside' = gifts[0].source;
const unverifiedNet: null = gifts[0].parishNetCents;
void [source, unverifiedNet];
const error = new OutsideGiftError('Unavailable', 413);
const status: number = error.status;
void status;
// @ts-expect-error: a row lookup can return null.
void row.amount_cents;
// @ts-expect-error: outside net amounts have not been verified.
const net: number = gifts[0].parishNetCents;
void net;
// @ts-expect-error: limits are numeric.
loadOutsideGiftRows(env.AGAPAY_DB, 'a', { limit: '500' });
// @ts-expect-error: storage binding is required for direct reads.
outsideGiftRow({}, 'a', 'gift');
// @ts-expect-error: giver references must be strings when present.
outsideGiver(env.AGAPAY_DB, 'a', 1);
// @ts-expect-error: HTTP error status must be numeric.
new OutsideGiftError('Unavailable', '413');
// @ts-expect-error: source labels remain nullable in stored legacy data.
const label: string = gifts[0].sourceLabel;
void label;
