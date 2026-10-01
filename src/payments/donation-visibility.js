// Generated from src/payments/donation-visibility.ts by npm run build:server. Do not edit.
function visibleDonationRecords(records = []) {
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
export { visibleDonationRecords };
