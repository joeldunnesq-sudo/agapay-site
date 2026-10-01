import { numericCents } from '../../src/lib/numeric-cents.js';
import { offeringFeeBreakdown, type OfferingFeeInput } from '../../src/lib/offering-fee-breakdown.js';
import { loadFundGiftActivity } from '../../src/lib/fund-reporting.js';

declare const env: Env;
const period = { startIso: '2026-07-01T00:00:00Z', endIso: '2026-08-01T00:00:00Z', label: 'July' };
const fees = offeringFeeBreakdown({ amountCents: '1000', coverFees: true });
const cents: number = numericCents('10');
void [fees, cents];
const result = await loadFundGiftActivity(env, 'parish', period);
if (result.available) {
  const label: string = result.period.label;
  const total: number = result.grossGiftCents;
  const complete: true = result.complete;
  void [label, total, complete];
} else {
  const reason: string = result.reason;
  void reason;
  // @ts-expect-error: incomplete reports expose no partial totals.
  void result.giftCount;
}
// @ts-expect-error: availability must be checked before reading totals.
void result.grossGiftCents;
// @ts-expect-error: timestamp bounds are required.
loadFundGiftActivity(env, 'parish', { month: '2026-07' });
// @ts-expect-error: parish IDs must be strings.
loadFundGiftActivity(env, null, period);
// @ts-expect-error: computed cents are numeric.
const badTotal: string = fees.totalFeeCents;
void badTotal;
declare const input: OfferingFeeInput;
// @ts-expect-error: external monetary values remain unknown until coercion.
const rawAmount: number = input.amountCents;
void rawAmount;
// @ts-expect-error: misspelled fee fields are not valid inputs.
offeringFeeBreakdown({ totalFeesCents: 100 });
