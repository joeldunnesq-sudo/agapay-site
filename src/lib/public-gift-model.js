// Generated from src/lib/public-gift-model.ts by npm run build:server. Do not edit.
import { offeringFeeBreakdown } from './offering-fee-breakdown.js';
function giftDisplayName(offering = {}) {
  const pieces = [offering.firstName, offering.lastName].filter(Boolean);
  return pieces.join(' ').trim() || offering.donorName || '';
}
function publicParishGiftFromOffering(offering = {}) {
  const living = Array.isArray(offering.living)
    ? offering.living
    : String(offering.namesLiving || '')
        .split(/\n+/)
        .map((name) => name.trim())
        .filter(Boolean);
  const departed = Array.isArray(offering.departed)
    ? offering.departed
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
    type: offering.frequency && offering.frequency !== 'once' ? 'recurring' : 'one_time',
    commemorationNames: [...living, ...departed],
    commemorationKind: offering.commemorationKind || '',
  };
}
export { giftDisplayName, publicParishGiftFromOffering };
