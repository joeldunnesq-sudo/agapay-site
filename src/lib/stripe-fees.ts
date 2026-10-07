export interface DonorNameInput {
  firstName?: unknown;
  lastName?: unknown;
}

import {
  checkoutFinancials as calculateCheckoutFinancials,
  estimateStripeAchFeeCents as estimateAchFee,
  estimateStripeProcessingFeeCents as estimateCardFee,
  grossUpForAchFeeCents as grossUpAch,
  grossUpForStripeProcessingFeeCents as grossUpCard,
  normalizePaymentMethod,
} from './payment-fees.js';

export const MAX_DONATION_CENTS = 5_000_000;

export function centsFromAmount(amount: unknown): number | null {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const cents = Math.round(numeric * 100);
  if (cents <= 0 || cents > MAX_DONATION_CENTS) return null;
  return cents;
}

export function donationAmountError(amount: unknown): string {
  const numeric = Number(amount);
  const cents = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  if (Number.isFinite(numeric) && numeric > 0 && cents > MAX_DONATION_CENTS) {
    return 'Amount exceeds the maximum allowed gift.';
  }
  return 'Amount must be greater than zero.';
}

export function estimateStripeProcessingFeeCents(chargeCents: unknown): number {
  return estimateCardFee(chargeCents);
}

export function estimateStripeAchFeeCents(chargeCents: unknown): number {
  return estimateAchFee(chargeCents);
}

export function grossUpForStripeProcessingFeeCents(netAmountCents: unknown): number {
  return grossUpCard(netAmountCents);
}

export function grossUpForAchFeeCents(netAmountCents: unknown, agapayFeeCents: unknown): number {
  return grossUpAch(netAmountCents, agapayFeeCents);
}

export function checkoutPaymentMethod(value: unknown, recurring: boolean) {
  return normalizePaymentMethod(value, recurring);
}

// AGAPAY no longer collects a donation platform fee (formerly a blended
// 5% + $0.30 total, of which roughly 2.1% was AGAPAY's share on top of
// Stripe's own processing cost). agapayFeeCents is always 0 below; the
// "cover fees" gross-up now targets only Stripe's real processing cost, so
// a donor who elects to cover fees causes the parish to receive the full
// intended gift after Stripe's cut -- nothing is added on AGAPAY's behalf.
// AGAPAY's revenue is the parish subscription plan (src/lib/subscriptions.js),
// not a percentage of donations.
export function checkoutFinancials(
  amountCents: unknown,
  coverFees: boolean,
  recurring: boolean,
  paymentMethod: unknown = 'card'
) {
  return calculateCheckoutFinancials(amountCents, coverFees, recurring, paymentMethod);
}

export { offeringFeeBreakdown } from './offering-fee-breakdown.js';

export function donorName(body: DonorNameInput): string {
  return [body.firstName, body.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}
