import {
  checkoutFinancials as calculateCheckoutFinancials,
  estimateStripeAchFeeCents as estimateAchFee,
  estimateStripeProcessingFeeCents as estimateCardFee,
  grossUpForAchFeeCents as grossUpAch,
  grossUpForStripeProcessingFeeCents as grossUpCard,
  normalizePaymentMethod,
} from "./payment-fees.js";

export const MAX_DONATION_CENTS = 5_000_000;

export function centsFromAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const cents = Math.round(numeric * 100);
  if (cents <= 0 || cents > MAX_DONATION_CENTS) return null;
  return cents;
}

export function donationAmountError(amount) {
  const numeric = Number(amount);
  const cents = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  if (Number.isFinite(numeric) && numeric > 0 && cents > MAX_DONATION_CENTS) {
    return "Amount exceeds the maximum allowed gift.";
  }
  return "Amount must be greater than zero.";
}

export function estimateStripeProcessingFeeCents(chargeCents) {
  return estimateCardFee(chargeCents);
}

export function estimateStripeAchFeeCents(chargeCents) {
  return estimateAchFee(chargeCents);
}

export function grossUpForStripeProcessingFeeCents(netAmountCents) {
  return grossUpCard(netAmountCents);
}

export function grossUpForAchFeeCents(netAmountCents, agapayFeeCents) {
  return grossUpAch(netAmountCents, agapayFeeCents);
}

export function checkoutPaymentMethod(value, recurring) {
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
export function checkoutFinancials(amountCents, coverFees, recurring, paymentMethod = "card") {
  return calculateCheckoutFinancials(amountCents, coverFees, recurring, paymentMethod);
}

export { offeringFeeBreakdown } from './offering-fee-breakdown.js';

export function donorName(body) {
  return [body.firstName, body.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}
