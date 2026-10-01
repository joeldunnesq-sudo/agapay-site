import { d1All } from './database-reads.js';
import type { DatabaseReadEnv } from './database-reads.js';
import type { GivingContributionInput } from './giving-contributions.js';
import { givingContribution } from './giving-contributions.js';

const cents = (value: unknown): number =>
  Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
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
] as const;
export type GivingFeeBucket = { label: string } & Record<(typeof fields)[number], number>;
export interface GivingFeeReport {
  year: number;
  currency: 'USD';
  basis: 'gift_date';
  excludedCurrencyCount: number;
  monthly: GivingFeeBucket[];
  quarterly: GivingFeeBucket[];
  annual: GivingFeeBucket;
}
export interface GivingFeeGift extends GivingContributionInput {
  readonly completedAt?: unknown;
  readonly createdAt?: unknown;
  readonly paymentStatus?: unknown;
  readonly currency?: unknown;
  readonly stripeFeeSource?: unknown;
  readonly stripeBalanceTransactionId?: unknown;
  readonly stripeFeeCents?: unknown;
  readonly estimatedStripeFeeCents?: unknown;
}
export interface GivingFeeRow extends GivingFeeGift {
  readonly data?: unknown;
  readonly created_at?: unknown;
  readonly payment_status?: unknown;
}
// Every numeric field is initialized from the same closed field list used by sum.
const empty = (label: string): GivingFeeBucket =>
  ({ label, ...Object.fromEntries(fields.map((key) => [key, 0])) }) as GivingFeeBucket;

export function summarizeGivingFees(rows: readonly GivingFeeRow[], year: number): GivingFeeReport {
  const monthly = Array.from({ length: 12 }, (_, index) => empty(`${year}-${String(index + 1).padStart(2, '0')}`));
  let excludedCurrencyCount = 0;
  for (const row of rows) {
    let gift: GivingFeeGift;
    try {
      // Preserve the existing object check and coercions; this is not schema validation.
      gift = (typeof row.data === 'string' ? JSON.parse(row.data) : row.data || row) as GivingFeeGift;
    } catch {
      continue;
    }
    if (!gift || typeof gift !== 'object') continue;
    const date = String(gift.completedAt || row.created_at || gift.createdAt || '');
    if (!date.startsWith(`${year}-`)) continue;
    if (
      !['paid', 'succeeded', 'refunded', 'partially_refunded'].includes(
        (row.payment_status || gift.paymentStatus) as string
      )
    )
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
  const sum = (label: string, buckets: readonly GivingFeeBucket[]): GivingFeeBucket =>
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

export async function readGivingFeeReport(
  env: DatabaseReadEnv,
  parishId: string,
  year: number
): Promise<GivingFeeReport> {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Choose a valid reporting year.');
  const rows = await d1All<GivingFeeRow>(
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
