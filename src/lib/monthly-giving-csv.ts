import { offeringFeeBreakdown, type OfferingFeeInput, type OfferingFeeBreakdown } from './offering-fee-breakdown.js';

export interface GivingExportOptions {
  month: string;
  groupBy: 'date' | 'giver';
  timezone: string;
  start: string;
  end: string;
}
export interface GivingExportOffering extends OfferingFeeInput {
  readonly paidAt?: string | number | Date | null;
  readonly createdAt?: string | number | Date | null;
  readonly firstName?: unknown;
  readonly lastName?: unknown;
  readonly donorName?: string | null;
  readonly email?: string | null;
  readonly donorEmail?: string | null;
  readonly paymentStatus?: unknown;
  readonly status?: unknown;
  readonly giftType?: unknown;
  readonly fund?: unknown;
  readonly fundId?: unknown;
  readonly campaign?: unknown;
  readonly campaignId?: unknown;
  readonly frequency?: unknown;
  readonly currency?: string | null;
  readonly source?: unknown;
  readonly sourceLabel?: unknown;
  readonly stripeBalanceTransactionId?: unknown;
  readonly refundedCents?: unknown;
  readonly refundedAt?: unknown;
  readonly stripePaymentIntentId?: unknown;
  readonly paymentIntentId?: unknown;
  readonly stripeChargeId?: unknown;
  readonly reference?: unknown;
  readonly enteredBy?: unknown;
  readonly givingKind?: unknown;
  readonly pledgeYear?: unknown;
}
export interface GivingExportRecord {
  readonly id: string;
  readonly data: string;
  readonly created_at: string;
  readonly payment_status?: unknown;
  readonly status?: unknown;
}
export interface GivingExportRow {
  offering: GivingExportOffering;
  id: string;
  status: unknown;
  timestamp: string;
  givingDate: string;
  name: string;
  email: string;
  giverKey: string;
  fees: { [K in Exclude<keyof OfferingFeeBreakdown, 'coverFees'>]: number | null };
}
export interface OnlineGivingExportRow extends GivingExportRow {
  fees: OfferingFeeBreakdown;
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function givingExportOptions(
  params: Pick<URLSearchParams, 'get'>,
  registration: { readonly timezone?: string | null } = {}
): GivingExportOptions {
  const month = params.get('month') || '';
  if (!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid giving month.');
  const groupBy = params.get('groupBy') || 'date';
  if (!['date', 'giver'].includes(groupBy)) throw new Error('Group transactions by giving date or giver.');
  let timezone = registration.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    timezone = 'UTC';
  }
  const start = Date.parse(month + '-01T00:00:00Z');
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    month,
    groupBy: groupBy as GivingExportOptions['groupBy'],
    timezone,
    start: new Date(start - 86400000).toISOString(),
    end: new Date(next.getTime() + 86400000).toISOString(),
  };
}

export function givingExportRows(
  records: readonly GivingExportRecord[],
  options: Pick<GivingExportOptions, 'timezone' | 'month' | 'groupBy'>
): OnlineGivingExportRow[] {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: options.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return records
    .map((record) => {
      // Describe stored fields while retaining the original object check and failure behavior.
      const offering = JSON.parse(record.data) as GivingExportOffering;
      if (!offering || typeof offering !== 'object') throw new Error('Invalid giving record.');
      const timestamp = offering.paidAt || offering.createdAt || record.created_at;
      const date = new Date(timestamp);
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid giving date.');
      const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
      const givingDate = `${parts.year}-${parts.month}-${parts.day}`;
      const name =
        [offering.firstName, offering.lastName].filter(Boolean).join(' ') || offering.donorName || 'Anonymous';
      const email = offering.email || offering.donorEmail || '';
      return {
        offering,
        id: record.id,
        status: offering.paymentStatus || record.payment_status || offering.status || record.status,
        timestamp: date.toISOString(),
        givingDate,
        name,
        email,
        giverKey: email.trim().toLowerCase() || name.trim().toLowerCase(),
        fees: offeringFeeBreakdown(offering),
      };
    })
    .filter((row) => row.givingDate.startsWith(options.month + '-'))
    .sort((a, b) => {
      const group =
        options.groupBy === 'giver' ? a.giverKey.localeCompare(b.giverKey) : a.givingDate.localeCompare(b.givingDate);
      return group || a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id);
    });
}

export function monthlyGivingCsv(
  rows: readonly GivingExportRow[],
  options: Pick<GivingExportOptions, 'timezone'>
): string {
  const headers = [
    'Giving date',
    'Parish timezone',
    'Paid timestamp UTC',
    'Giver',
    'Giver email',
    'Fund',
    'Fund ID',
    'Campaign',
    'Gift type',
    'Frequency',
    'Currency',
    'Gift amount',
    'Amount charged',
    'Stripe fee',
    'AGAPAY fee',
    'Total fees',
    'Net before refunds',
    'Fees covered by donor',
    'Fee basis',
    'Refunds to date',
    'Latest refund timestamp',
    'Status',
    'Transaction ID',
    'Stripe payment intent',
    'Stripe charge',
    'Stripe balance transaction',
  ];
  headers.push('Source', 'Outside reference', 'Recorded by', 'Giving purpose', 'Pledge year');
  const money = (cents: unknown) => (cents === null ? '' : (Number(cents || 0) / 100).toFixed(2));
  const data = rows.map(({ offering: o, id, status, timestamp, givingDate, name, email, fees: f }) => [
    givingDate,
    options.timezone,
    timestamp,
    name,
    email,
    ['general', 'stewardship'].includes(o.giftType as string)
      ? 'General Operating Fund'
      : o.fund || o.fundId || 'General Operating Fund',
    o.fundId || (['general', 'stewardship'].includes(o.giftType as string) ? 'general' : ''),
    o.campaign || o.campaignId || '',
    o.giftType || 'offering',
    o.frequency || 'once',
    (o.currency || 'usd').toUpperCase(),
    money(f.giftAmountCents),
    money(f.chargeCents),
    money(f.stripeFeeCents),
    money(f.agapayFeeCents),
    money(f.totalFeeCents),
    money(f.parishNetCents),
    money(f.donorCoveredFeeCents),
    o.source === 'outside'
      ? 'Outside contribution; fees and bank net not verified'
      : o.stripeBalanceTransactionId
        ? 'Stripe balance transaction'
        : 'Estimate / unverified',
    o.source === 'outside' ? '' : money(o.refundedCents),
    o.refundedAt || '',
    status,
    id,
    o.stripePaymentIntentId || o.paymentIntentId || '',
    o.stripeChargeId || '',
    o.stripeBalanceTransactionId || '',
    o.source === 'outside' ? o.sourceLabel : 'AGAPAY online',
    o.reference || '',
    o.enteredBy || '',
    o.source === 'outside' ? (o.givingKind === 'pledge' ? 'Pledge payment' : 'Other giving') : '',
    o.pledgeYear || '',
  ]);
  return '\uFEFF' + [headers, ...data].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
