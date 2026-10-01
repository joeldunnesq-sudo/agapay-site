export interface DonationVisibilityRecord {
  readonly stripeInvoiceId?: unknown;
  readonly stripeSubscriptionId?: unknown;
  readonly recordType?: unknown;
}

export function visibleDonationRecords<T extends DonationVisibilityRecord>(records: readonly T[] = []): T[] {
  const invoiced = new Set(
    records
      .filter((record) => record.stripeInvoiceId)
      .map((record) => record.stripeSubscriptionId)
      .filter(Boolean)
  );
  return records.filter(
    (record) => record.recordType !== 'subscription_setup' || !invoiced.has(record.stripeSubscriptionId)
  );
}
