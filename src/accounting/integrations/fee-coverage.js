import { ingestAccountingSourceEvent, processAccountingSourceEvent } from './service.js';
import { givingContribution } from '../../lib/giving-contributions.js';
import { d1All } from '../../lib/core.js';

export async function recognizeGivingFeeCoverage(db, { actor, entitlementTier, offering, originalEventId }) {
  const original = await db
    .prepare('SELECT * FROM accounting_integration_source_events WHERE id=?')
    .bind(originalEventId)
    .first();
  if (!original || original.source_type !== 'donation_succeeded' || original.source_system !== 'agapay_give')
    return null;
  const contribution = givingContribution(offering);
  const coverage = Math.max(0, contribution.grossContributionCents - Number(original.gross_amount));
  if (!coverage) return null;
  if (coverage > contribution.feeCoverageCents)
    throw new Error('Contribution principal needs review before fee coverage can be recognized.');
  const donationId = original.donation_id || original.source_object_id;
  const source = await ingestAccountingSourceEvent(db, {
    actor,
    entitlementTier,
    event: {
      sourceSystem: 'agapay_give',
      sourceType: 'donation_succeeded',
      sourceEventId: `give:${donationId}:fee-coverage`,
      sourceObjectId: original.source_object_id,
      eventVersion: Number(original.event_version) + 1,
      originalSourceEventId: original.id,
      donationId,
      paymentIntentId: original.payment_intent_id || '',
      occurredAt: original.occurred_at,
      currency: original.currency,
      grossAmount: coverage,
      feeCoverageAmount: coverage,
      donationType: 'fee_coverage',
      campaignId: original.campaign_id || '',
      revenueStreamId: original.revenue_stream_id || '',
      settlementProfileId: original.settlement_profile_id || '',
      designatedFundId: original.designated_fund_id || '',
      donorRestricted: Boolean(original.donor_restricted),
    },
  });
  return processAccountingSourceEvent(db, { actor, entitlementTier, sourceEventId: source.id });
}

// Bounded, parish-scoped historical repair. Preview is read-only; application
// recognizes only missing additions and respects the ledger's review/closed-period rules.
export async function givingFeeCoverageBackfill(
  env,
  db,
  { actor, entitlementTier, parishId, year, afterId = '', apply = false, expectedAdditions = [] }
) {
  if (!actor?.capabilities?.includes('accounting.integrations.backfill'))
    throw new Error('Fee coverage backfill permission is required.');
  if (apply && !actor.capabilities.includes('accounting.integrations.post'))
    throw new Error('Accounting posting permission is required.');
  if (apply && (!Array.isArray(expectedAdditions) || expectedAdditions.length > 100))
    throw new Error('Review a bounded batch before applying it.');
  year = Number(year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Choose a valid year.');
  const rows = await d1All(
    env,
    `SELECT id, data FROM donor_offerings WHERE parish_id=?
    AND payment_status IN ('paid','succeeded','partially_refunded','refunded') AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at)>=? AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at)<? AND id>?
    ORDER BY id LIMIT 100`,
    parishId,
    `${year}-01-01`,
    `${year + 1}-01-01`,
    String(afterId)
  );
  const additions = [];
  for (const row of rows) {
    let offering;
    try {
      offering = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (!givingContribution(offering).feeCoverageCents) continue;
    const original = await db
      .prepare(
        "SELECT id,gross_amount FROM accounting_integration_source_events WHERE source_system='agapay_give' AND source_event_id=?"
      )
      .bind(`give:${row.id}:succeeded`)
      .first();
    if (!original) continue;
    const amountCents = Math.max(
      0,
      givingContribution(offering).grossContributionCents - Number(original.gross_amount)
    );
    if (!amountCents) continue;
    const existing = await db
      .prepare(
        "SELECT id,status FROM accounting_integration_source_events WHERE source_system='agapay_give' AND source_event_id=?"
      )
      .bind(`give:${row.id}:fee-coverage`)
      .first();
    if (existing?.status === 'posted') continue;
    if (apply) {
      const expected = expectedAdditions.find((item) => item.offeringId === row.id);
      if (!expected) continue;
      if (expected.amountCents !== amountCents)
        throw new Error('A contribution changed after preview. Refresh the preview before continuing.');
    }
    const result = apply
      ? await recognizeGivingFeeCoverage(db, { actor, entitlementTier, offering, originalEventId: original.id })
      : null;
    additions.push({ offeringId: row.id, amountCents, status: result?.status || existing?.status || 'not_recorded' });
  }
  return {
    dryRun: !apply,
    year,
    scanned: rows.length,
    nextCursor: rows.length === 100 ? rows.at(-1).id : null,
    additions,
    totalCents: additions.reduce((sum, item) => sum + item.amountCents, 0),
  };
}
