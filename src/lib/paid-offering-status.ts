export interface PaidOfferingStatusInput {
  readonly recordType?: unknown;
  readonly status?: unknown;
  readonly paymentStatus?: unknown;
}

export function paidOfferingStatus(offering: PaidOfferingStatusInput = {}): boolean {
  if (offering.recordType === 'subscription_setup') return false;
  const status = String(offering.status || '').toLowerCase();
  const paymentStatus = String(offering.paymentStatus || '').toLowerCase();
  return (
    status === 'paid' ||
    status === 'complete' ||
    status === 'completed' ||
    paymentStatus === 'paid' ||
    paymentStatus === 'succeeded'
  );
}
