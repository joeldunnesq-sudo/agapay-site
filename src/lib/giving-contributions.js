// A donor's voluntary fee-covering addition is part of the contribution.
// Processor expense is a separate parish expense, never a reduction of the gift.
const cents = (value) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

// Trusted SQL expression for gross contribution revenue in financial reports.
// Pledge progress can continue tracking the intended gift separately.
export const GIVING_GROSS_CENTS_SQL = `COALESCE(json_extract(data, '$.chargeCents'), json_extract(data, '$.amountChargedCents'),
  COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)
  + CASE WHEN json_extract(data, '$.coverFees') = 1 THEN COALESCE(json_extract(data, '$.donorCoveredFeeCents'), 0) ELSE 0 END)`;

export function givingContribution(offering = {}) {
  const intendedGiftCents = cents(offering.giftAmountCents ?? offering.amountCents);
  const hasCharge = offering.chargeCents != null || offering.amountChargedCents != null;
  const grossContributionCents = hasCharge
    ? cents(offering.chargeCents ?? offering.amountChargedCents)
    : intendedGiftCents + (offering.coverFees === true ? cents(offering.donorCoveredFeeCents) : 0);
  const feeCoverageCents = Math.max(0, grossContributionCents - intendedGiftCents);
  const refundedCents = Math.min(
    grossContributionCents,
    Math.max(cents(offering.refundedCents), cents(offering.stripeRefundedCents))
  );
  return {
    intendedGiftCents,
    grossContributionCents,
    feeCoverageCents,
    refundedCents,
    contributionCents: grossContributionCents - refundedCents,
  };
}
