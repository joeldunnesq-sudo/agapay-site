import { d1All } from './core.js';
import { givingContribution } from './giving-contributions.js';

const cents = (value) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
const fields = [
  'giftCount',
  'confirmedCount',
  'pendingCount',
  'grossContributionCents',
  'donorFeeContributionCents',
  'actualStripeFeeCents',
  'donorFundedStripeFeeCents',
  'parishFundedStripeFeeCents',
  'excessCoverageCents',
  'estimatedStripeFeeCents',
  'refundedCents',
];
const empty = (label) => ({ label, ...Object.fromEntries(fields.map((key) => [key, 0])) });

export function summarizeGivingFees(rows, year) {
  const monthly = Array.from({ length: 12 }, (_, index) => empty(`${year}-${String(index + 1).padStart(2, '0')}`));
  let excludedCurrencyCount = 0;
  for (const row of rows) {
    let gift;
    try {
      gift = typeof row.data === 'string' ? JSON.parse(row.data) : row.data || row;
    } catch {
      continue;
    }
    if (!gift || typeof gift !== 'object') continue;
    const date = String(gift.completedAt || row.created_at || gift.createdAt || '');
    if (!date.startsWith(`${year}-`)) continue;
    if (!['paid', 'succeeded', 'refunded', 'partially_refunded'].includes(row.payment_status || gift.paymentStatus))
      continue;
    if (String(gift.currency || 'USD').toUpperCase() !== 'USD') {
      excludedCurrencyCount++;
      continue;
    }
    const bucket = monthly[Number(date.slice(5, 7)) - 1];
    if (!bucket) continue;
    const contribution = givingContribution(gift);
    if (!contribution.grossContributionCents) continue;
    const known =
      gift.stripeFeeSource === 'balance_transaction' &&
      Boolean(gift.stripeBalanceTransactionId) &&
      gift.stripeFeeCents != null &&
      Number.isSafeInteger(Number(gift.stripeFeeCents)) &&
      Number(gift.stripeFeeCents) >= 0;
    const fee = cents(gift.stripeFeeCents ?? gift.estimatedStripeFeeCents);
    // Allocate refunds against the fee-covering addition first. This conservative
    // allocation cannot claim donor coverage that was returned to the donor.
    const retainedCoverage = Math.max(0, contribution.feeCoverageCents - contribution.refundedCents);
    bucket.giftCount++;
    bucket.grossContributionCents += contribution.grossContributionCents;
    bucket.donorFeeContributionCents += contribution.feeCoverageCents;
    bucket.refundedCents += contribution.refundedCents;
    if (known) {
      bucket.confirmedCount++;
      bucket.actualStripeFeeCents += fee;
      bucket.donorFundedStripeFeeCents += Math.min(fee, retainedCoverage);
      bucket.parishFundedStripeFeeCents += Math.max(0, fee - retainedCoverage);
      bucket.excessCoverageCents += Math.max(0, retainedCoverage - fee);
    } else {
      bucket.pendingCount++;
      bucket.estimatedStripeFeeCents += fee;
    }
  }
  const sum = (label, buckets) =>
    buckets.reduce((total, bucket) => {
      fields.forEach((key) => {
        total[key] += bucket[key];
      });
      return total;
    }, empty(label));
  return {
    year,
    currency: 'USD',
    basis: 'gift_date',
    excludedCurrencyCount,
    monthly,
    quarterly: Array.from({ length: 4 }, (_, index) =>
      sum(`Q${index + 1} ${year}`, monthly.slice(index * 3, index * 3 + 3))
    ),
    annual: sum(String(year), monthly),
  };
}

export async function readGivingFeeReport(env, parishId, year) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Choose a valid reporting year.');
  const rows = await d1All(
    env,
    `SELECT created_at, payment_status, data FROM donor_offerings
    WHERE parish_id = ? AND payment_status IN ('paid','succeeded','refunded','partially_refunded')
      AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at) >= ?
      AND COALESCE(NULLIF(json_extract(data, '$.completedAt'), ''), created_at) < ?`,
    parishId,
    `${year}-01-01`,
    `${year + 1}-01-01`
  );
  return summarizeGivingFees(rows, year);
}
