import { ingestAccountingSourceEvent, processAccountingSourceEvent } from './service.js';

export async function recognizeGivingStripeFee(
  db,
  { actor, entitlementTier, offering, donationId, fundId, occurredAt }
) {
  const balanceTransactionId = String(offering.stripeBalanceTransactionId || '');
  if (offering.stripeFeeSource !== 'balance_transaction' || !balanceTransactionId) return null;
  const fee = Number(offering.stripeFeeCents);
  if (offering.stripeFeeCents == null || !Number.isSafeInteger(fee) || fee < 0)
    throw new Error('A confirmed non-negative Stripe fee is required.');
  const legacyId = `give:${donationId}:stripe_fee`;
  const original = await db
    .prepare("SELECT * FROM accounting_integration_source_events WHERE source_system='stripe' AND source_event_id=?")
    .bind(legacyId)
    .first();
  if (original?.status === 'posted') {
    if (Number(original.fee_amount) !== fee)
      throw new Error('Posted Stripe fee differs from the confirmed amount; reconcile the difference before retrying.');
    return processAccountingSourceEvent(db, { actor, entitlementTier, sourceEventId: original.id });
  }
  if (original && original.balance_transaction_id === balanceTransactionId && Number(original.fee_amount) === fee) {
    return processAccountingSourceEvent(db, { actor, entitlementTier, sourceEventId: original.id });
  }
  // Old releases ingested estimates before a balance transaction existed.
  // Retire that unposted source rather than overwriting its immutable facts.
  if (original) {
    await db
      .prepare(
        "UPDATE accounting_integration_source_events SET status='ignored',posting_status='ignored',ignored_reason='Superseded by confirmed Stripe balance transaction',updated_at=datetime('now') WHERE id=? AND status<>'posted'"
      )
      .bind(original.id)
      .run();
  }
  if (!fee) return null;
  const source = await ingestAccountingSourceEvent(db, {
    actor,
    entitlementTier,
    event: {
      sourceSystem: 'stripe',
      sourceType: 'stripe_fee_assessed',
      sourceEventId: original ? `${legacyId}:${balanceTransactionId}` : legacyId,
      sourceObjectId: donationId,
      eventVersion: original ? Number(original.event_version) + 1 : 1,
      originalSourceEventId: original?.id || '',
      occurredAt,
      currency: String(offering.currency || 'USD'),
      feeAmount: fee,
      donationId,
      paymentIntentId: String(offering.stripePaymentIntentId || ''),
      balanceTransactionId,
      designatedFundId: fundId,
    },
  });
  return processAccountingSourceEvent(db, { actor, entitlementTier, sourceEventId: source.id });
}
