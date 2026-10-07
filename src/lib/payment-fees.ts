export type PaymentMethod = 'card' | 'ach';
// External amounts retain the existing Number coercion at the runtime boundary.
export interface PaymentFeeScheduleInput {
  readonly rateBasisPoints?: unknown;
  readonly fixedFeeCents?: unknown;
  readonly maxFeeCents?: unknown;
}
export interface PublicPaymentFeeSchedule {
  id: string;
  label: string;
  rateBasisPoints: number;
  fixedFeeCents: number;
  maxFeeCents: number | null;
}
export interface CheckoutFinancials {
  chargeCents: number;
  estimatedStripeFeeCents: number;
  agapayFeeCents: number;
  totalTransactionFeeCents: number;
  paymentMethod: PaymentMethod;
  feeScheduleId: string;
}

// Authoritative payment-fee schedules and integer-cent calculations.
// Stripe may approve account-specific pricing; these defaults represent
// AGAPAY's currently supported public card and ACH Direct Debit estimates.

export const PAYMENT_FEE_SCHEDULES = Object.freeze({
  card: Object.freeze({
    id: 'stripe_standard_card_us',
    label: 'Card',
    rateBasisPoints: 290,
    fixedFeeCents: 30,
    maxFeeCents: null,
  }),
  ach: Object.freeze({
    id: 'stripe_ach_direct_debit_us',
    label: 'ACH Direct Debit',
    rateBasisPoints: 80,
    fixedFeeCents: 0,
    maxFeeCents: 500,
  }),
});

function positiveInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export function normalizePaymentMethod(value: unknown, recurring = false): PaymentMethod {
  if (recurring) return 'card';
  const method = String(value || 'card')
    .toLowerCase()
    .trim();
  return ['ach', 'bank', 'bank_account', 'us_bank_account'].includes(method) ? 'ach' : 'card';
}

export function paymentFeeSchedule(paymentMethod: unknown = 'card', recurring = false) {
  return PAYMENT_FEE_SCHEDULES[normalizePaymentMethod(paymentMethod, recurring)];
}

export function publicPaymentFeeSchedules(): Record<PaymentMethod, PublicPaymentFeeSchedule> {
  return Object.fromEntries(
    Object.entries(PAYMENT_FEE_SCHEDULES).map(([key, schedule]) => [
      key,
      {
        id: schedule.id,
        label: schedule.label,
        rateBasisPoints: schedule.rateBasisPoints,
        fixedFeeCents: schedule.fixedFeeCents,
        maxFeeCents: schedule.maxFeeCents,
      },
    ])
  ) as Record<PaymentMethod, PublicPaymentFeeSchedule>;
}

export function estimatePaymentFeeCents(chargeCents: unknown, schedule?: PaymentFeeScheduleInput | null): number {
  const charge = positiveInteger(chargeCents);
  if (!charge) return 0;
  const rateBasisPoints = Math.max(0, positiveInteger(schedule?.rateBasisPoints));
  const fixedFeeCents = Math.max(0, positiveInteger(schedule?.fixedFeeCents));
  const percentageFee = Math.round((charge * rateBasisPoints) / 10_000);
  const uncappedFee = percentageFee + fixedFeeCents;
  const maximum = schedule?.maxFeeCents == null ? null : Math.max(0, positiveInteger(schedule.maxFeeCents));
  return maximum == null ? uncappedFee : Math.min(maximum, uncappedFee);
}

export function grossUpForPaymentFeeCents(netAmountCents: unknown, schedule?: PaymentFeeScheduleInput | null): number {
  const target = positiveInteger(netAmountCents);
  if (!target) return 0;

  const rate = Math.max(0, positiveInteger(schedule?.rateBasisPoints)) / 10_000;
  const fixed = Math.max(0, positiveInteger(schedule?.fixedFeeCents));
  const maximum = schedule?.maxFeeCents == null ? null : Math.max(0, positiveInteger(schedule.maxFeeCents));
  const uncappedCandidate = rate < 1 ? Math.ceil((target + fixed) / (1 - rate)) : target + fixed;
  const cappedCandidate = maximum == null ? uncappedCandidate : target + maximum;
  let charge = Math.max(target, Math.min(uncappedCandidate, cappedCandidate));

  while (charge - estimatePaymentFeeCents(charge, schedule) < target) charge += 1;
  while (charge > target && charge - 1 - estimatePaymentFeeCents(charge - 1, schedule) >= target) {
    charge -= 1;
  }
  return charge;
}

export function estimateStripeProcessingFeeCents(chargeCents: unknown): number {
  return estimatePaymentFeeCents(chargeCents, PAYMENT_FEE_SCHEDULES.card);
}

export function estimateStripeAchFeeCents(chargeCents: unknown): number {
  return estimatePaymentFeeCents(chargeCents, PAYMENT_FEE_SCHEDULES.ach);
}

export function grossUpForStripeProcessingFeeCents(netAmountCents: unknown): number {
  return grossUpForPaymentFeeCents(netAmountCents, PAYMENT_FEE_SCHEDULES.card);
}

export function grossUpForAchFeeCents(netAmountCents: unknown, additionalFeeCents: unknown = 0): number {
  return grossUpForPaymentFeeCents(
    positiveInteger(netAmountCents) + Math.max(0, positiveInteger(additionalFeeCents)),
    PAYMENT_FEE_SCHEDULES.ach
  );
}

export function checkoutFinancials(
  amountCents: unknown,
  coverFees: boolean,
  recurring: boolean,
  paymentMethod: unknown = 'card'
): CheckoutFinancials {
  const giftAmountCents = positiveInteger(amountCents);
  const method = normalizePaymentMethod(paymentMethod, recurring);
  const schedule = paymentFeeSchedule(method);
  const chargeCents = coverFees ? grossUpForPaymentFeeCents(giftAmountCents, schedule) : giftAmountCents;
  const estimatedStripeFeeCents = estimatePaymentFeeCents(chargeCents, schedule);
  return {
    chargeCents,
    estimatedStripeFeeCents,
    agapayFeeCents: 0,
    totalTransactionFeeCents: estimatedStripeFeeCents,
    paymentMethod: method,
    feeScheduleId: schedule.id,
  };
}
