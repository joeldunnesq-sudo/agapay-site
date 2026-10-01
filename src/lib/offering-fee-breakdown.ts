import { numericCents } from './numeric-cents.js';

export interface OfferingFeeInput {
  readonly giftAmountCents?: unknown;
  readonly amountCents?: unknown;
  readonly chargeCents?: unknown;
  readonly amountChargedCents?: unknown;
  readonly stripeFeeCents?: unknown;
  readonly estimatedStripeFeeCents?: unknown;
  readonly agapayFeeCents?: unknown;
  readonly totalFeeCents?: unknown;
  readonly donorCoveredFeeCents?: unknown;
  readonly parishNetCents?: unknown;
  readonly netCents?: unknown;
  readonly coverFees?: unknown;
}
export interface OfferingFeeBreakdown {
  giftAmountCents: number;
  chargeCents: number;
  stripeFeeCents: number;
  agapayFeeCents: number;
  totalFeeCents: number;
  donorCoveredFeeCents: number;
  parishNetCents: number;
  coverFees: boolean;
}

export function offeringFeeBreakdown(offering: OfferingFeeInput = {}): OfferingFeeBreakdown {
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
