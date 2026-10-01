// Generated from src/lib/offering-fee-breakdown.ts by npm run build:server. Do not edit.
import { numericCents } from './numeric-cents.js';
function offeringFeeBreakdown(offering = {}) {
  const giftAmountCents = numericCents(offering.giftAmountCents ?? offering.amountCents);
  const chargeCents = numericCents(offering.chargeCents ?? offering.amountChargedCents ?? giftAmountCents);
  const stripeFeeCents = numericCents(offering.stripeFeeCents ?? offering.estimatedStripeFeeCents);
  const agapayFeeCents = numericCents(offering.agapayFeeCents);
  const totalFeeCents = numericCents(offering.totalFeeCents ?? stripeFeeCents + agapayFeeCents);
  const coverFees = Boolean(offering.coverFees);
  const donorCoveredFeeCents = coverFees
    ? numericCents(offering.donorCoveredFeeCents ?? Math.max(0, chargeCents - giftAmountCents))
    : 0;
  const parishNetCents = Math.max(
    0,
    numericCents(
      offering.parishNetCents ??
        offering.netCents ??
        (coverFees ? Math.max(0, chargeCents - totalFeeCents) : giftAmountCents - totalFeeCents)
    )
  );
  return {
    giftAmountCents,
    chargeCents,
    stripeFeeCents,
    agapayFeeCents,
    totalFeeCents,
    donorCoveredFeeCents,
    parishNetCents,
    coverFees,
  };
}
export { offeringFeeBreakdown };
