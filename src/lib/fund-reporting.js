import { offeringFeeBreakdown } from './stripe-fees.js';

import { createFundAllocationResolver } from './fund-allocation.js';
export { createFundAllocationResolver, fundAllocation } from './fund-allocation.js';
export {
  parishReportingTimezone,
  parishCalendarDate,
  calendarMidnight,
  fundReportPeriod,
} from './fund-report-period.js';

// Period-scoped database paging, never the browser's last-500-gift cache.
// A bounded report must explicitly fail completeness instead of showing partial totals.
export async function loadFundGiftActivity(env, parishId, period, registration = {}) {
  if (!env.AGAPAY_DB) return { available: false, complete: false, reason: 'Giving database unavailable.' };
  const allocations = new Map();
  const resolveFund = createFundAllocationResolver(registration);
  let cursor = '',
    recordCount = 0,
    giftCount = 0,
    grossGiftCents = 0,
    parishNetCents = 0,
    feeCents = 0,
    estimatedFeeCount = 0,
    unallocatedCount = 0;
  for (;;) {
    const page = await env.AGAPAY_DB.prepare(
      'SELECT id, data, created_at FROM donor_offerings WHERE parish_id=?1 AND id>?2 ' +
        "AND (payment_status IN ('paid','succeeded','complete','completed','refunded','partially_refunded','disputed') OR status IN ('paid','succeeded','complete','completed','refunded','partially_refunded','disputed')) " +
        "AND julianday(COALESCE(NULLIF(json_extract(data,'$.paidAt'),''),NULLIF(json_extract(data,'$.createdAt'),''),created_at))>=julianday(?3) " +
        "AND julianday(COALESCE(NULLIF(json_extract(data,'$.paidAt'),''),NULLIF(json_extract(data,'$.createdAt'),''),created_at))<julianday(?4) ORDER BY id LIMIT 500"
    )
      .bind(parishId, cursor, period.startIso, period.endIso)
      .all();
    const rows = page.results || [];
    recordCount += rows.length;
    if (recordCount > 25000)
      return {
        available: false,
        complete: false,
        reason: 'This period exceeds the interactive reporting limit. Contact support for a complete report.',
      };
    for (const row of rows) {
      const gift = JSON.parse(row.data);
      if (!gift || (gift.parishId && gift.parishId !== parishId)) throw new Error('Invalid giving record.');
      if ((gift.currency || 'usd').toLowerCase() !== 'usd')
        return {
          available: false,
          complete: false,
          reason: 'This period contains another currency and needs a separate currency report.',
        };
      const amount = gift.giftAmountCents ?? gift.amountCents;
      const moneyFields = [
        amount,
        gift.chargeCents,
        gift.stripeFeeCents,
        gift.estimatedStripeFeeCents,
        gift.totalFeeCents,
        gift.parishNetCents,
      ];
      if (
        amount == null ||
        moneyFields.some((value) => value != null && (!Number.isSafeInteger(Number(value)) || Number(value) < 0))
      )
        return {
          available: false,
          complete: false,
          reason: 'A giving record has an invalid amount. Totals cannot be verified.',
        };
      const fee = offeringFeeBreakdown(gift);
      const allocation = resolveFund(gift) || {
        key: 'unallocated',
        label: 'Needs allocation',
        category: 'Unallocated',
        fundId: '',
      };
      const item = allocations.get(allocation.key) || {
        ...allocation,
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        transactionCount: 0,
      };
      item.grossCents += fee.giftAmountCents;
      item.feeCents += fee.totalFeeCents;
      item.netCents += fee.parishNetCents;
      item.transactionCount++;
      allocations.set(allocation.key, item);
      giftCount++;
      grossGiftCents += fee.giftAmountCents;
      parishNetCents += fee.parishNetCents;
      feeCents += fee.totalFeeCents;
      if (gift.stripeFeeSource !== 'balance_transaction') estimatedFeeCount++;
      if (allocation.key === 'unallocated') unallocatedCount++;
    }
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  return {
    available: true,
    complete: true,
    period,
    currency: 'usd',
    giftCount,
    grossGiftCents,
    parishNetCents,
    feeCents,
    estimatedFeeCount,
    unallocatedCount,
    allocations: [...allocations.values()].sort((a, b) => b.netCents - a.netCents),
    generatedAt: new Date().toISOString(),
    basis: 'gift_date_before_refunds',
    note: 'By gift paid date. Net is before refunds and disputes, not bank deposits or current fund balances. See monthly reconciliation for payout adjustments.',
  };
}
