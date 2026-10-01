import { offeringFeeBreakdown, type OfferingFeeInput } from './offering-fee-breakdown.js';

export interface PublicGiftInput extends OfferingFeeInput {
  readonly firstName?: unknown;
  readonly lastName?: unknown;
  readonly donorName?: unknown;
  readonly id?: unknown;
  readonly checkoutSessionId?: unknown;
  readonly paymentIntentId?: unknown;
  readonly email?: unknown;
  readonly donorEmail?: unknown;
  readonly giftType?: unknown;
  readonly fund?: unknown;
  readonly fundId?: unknown;
  readonly campaign?: unknown;
  readonly campaignId?: unknown;
  readonly description?: unknown;
  readonly campaignDescription?: unknown;
  readonly inMemoriam?: unknown;
  readonly frequency?: unknown;
  readonly commemorationKind?: unknown;
  readonly living?: unknown;
  readonly departed?: unknown;
  readonly namesLiving?: unknown;
  readonly namesDeparted?: unknown;
  readonly createdAt?: string | number | Date | null;
  readonly paidAt?: string | number | Date | null;
  readonly updatedAt?: string | number | Date | null;
}
export type PublicParishGift = ReturnType<typeof publicParishGiftFromOffering>;

export function giftDisplayName(offering: PublicGiftInput = {}): unknown {
  const pieces = [offering.firstName, offering.lastName].filter(Boolean);
  return pieces.join(' ').trim() || offering.donorName || '';
}

export function publicParishGiftFromOffering(offering: PublicGiftInput = {}) {
  const living = Array.isArray(offering.living)
    ? (offering.living as readonly unknown[])
    : String(offering.namesLiving || '')
        .split(/\n+/)
        .map((name) => name.trim())
        .filter(Boolean);
  const departed = Array.isArray(offering.departed)
    ? (offering.departed as readonly unknown[])
    : String(offering.namesDeparted || '')
        .split(/\n+/)
        .map((name) => name.trim())
        .filter(Boolean);
  const fees = offeringFeeBreakdown(offering);
  return {
    id: offering.id || offering.checkoutSessionId || offering.paymentIntentId || '',
    date: offering.createdAt || offering.paidAt || offering.updatedAt || '',
    createdAt: offering.createdAt || offering.paidAt || offering.updatedAt || '',
    amountCents: fees.parishNetCents,
    giftAmountCents: fees.giftAmountCents,
    chargeCents: fees.chargeCents,
    parishNetCents: fees.parishNetCents,
    stripeFeeCents: fees.stripeFeeCents,
    estimatedStripeFeeCents: fees.stripeFeeCents,
    agapayFeeCents: fees.agapayFeeCents,
    totalFeeCents: fees.totalFeeCents,
    donorCoveredFeeCents: fees.donorCoveredFeeCents,
    coverFees: fees.coverFees,
    donorName: giftDisplayName(offering),
    donorEmail: offering.email || offering.donorEmail || '',
    fund: ['stewardship', 'general'].includes(String(offering.giftType || '').toLowerCase())
      ? 'General Operating Fund'
      : offering.fund || offering.fundId || '',
    fundId: ['stewardship', 'general'].includes(String(offering.giftType || '').toLowerCase())
      ? 'general'
      : offering.fundId || offering.fund || '',
    campaign: offering.campaign || offering.campaignId || '',
    campaignId: offering.campaignId || offering.campaign || '',
    description: offering.description || offering.campaignDescription || offering.inMemoriam || '',
    giftType: offering.giftType || 'offering',
    frequency: offering.frequency || 'once',
    recurring: Boolean(offering.frequency && offering.frequency !== 'once'),
    type: offering.frequency && offering.frequency !== 'once' ? ('recurring' as const) : ('one_time' as const),
    commemorationNames: [...living, ...departed],
    commemorationKind: offering.commemorationKind || '',
  };
}
