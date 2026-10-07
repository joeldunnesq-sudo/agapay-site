// Generated from src/lib/stripe-fees.ts by npm run build:server. Do not edit.
import {
  checkoutFinancials as calculateCheckoutFinancials,
  estimateStripeAchFeeCents as estimateAchFee,
  estimateStripeProcessingFeeCents as estimateCardFee,
  grossUpForAchFeeCents as grossUpAch,
  grossUpForStripeProcessingFeeCents as grossUpCard,
  normalizePaymentMethod,
} from './payment-fees.js';
const MAX_DONATION_CENTS = 5e6;
function centsFromAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const cents = Math.round(numeric * 100);
  if (cents <= 0 || cents > MAX_DONATION_CENTS) return null;
  return cents;
}
function donationAmountError(amount) {
  const numeric = Number(amount);
  const cents = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  if (Number.isFinite(numeric) && numeric > 0 && cents > MAX_DONATION_CENTS) {
    return 'Amount exceeds the maximum allowed gift.';
  }
  return 'Amount must be greater than zero.';
}
function estimateStripeProcessingFeeCents(chargeCents) {
  return estimateCardFee(chargeCents);
}
function estimateStripeAchFeeCents(chargeCents) {
  return estimateAchFee(chargeCents);
}
function grossUpForStripeProcessingFeeCents(netAmountCents) {
  return grossUpCard(netAmountCents);
}
function grossUpForAchFeeCents(netAmountCents, agapayFeeCents) {
  return grossUpAch(netAmountCents, agapayFeeCents);
}
function checkoutPaymentMethod(value, recurring) {
  return normalizePaymentMethod(value, recurring);
}
function checkoutFinancials(amountCents, coverFees, recurring, paymentMethod = 'card') {
  return calculateCheckoutFinancials(amountCents, coverFees, recurring, paymentMethod);
}
import { offeringFeeBreakdown } from './offering-fee-breakdown.js';
function donorName(body) {
  return [body.firstName, body.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}
export {
  MAX_DONATION_CENTS,
  centsFromAmount,
  checkoutFinancials,
  checkoutPaymentMethod,
  donationAmountError,
  donorName,
  estimateStripeAchFeeCents,
  estimateStripeProcessingFeeCents,
  grossUpForAchFeeCents,
  grossUpForStripeProcessingFeeCents,
  offeringFeeBreakdown,
};
