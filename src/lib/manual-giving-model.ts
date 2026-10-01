export interface ManualGivingRow {
  readonly entry_id: string;
  readonly line_id: string;
  readonly gift_date: string;
  readonly entry_description: string | null;
  readonly source_type: string;
  readonly credit_amount: unknown;
  readonly account_name: string | null;
  readonly fund_code: string | null;
  readonly fund_name: string | null;
}
export interface ManualAccountingGift {
  id: string;
  source: 'manual_accounting';
  giftType: 'manual_accounting';
  amountCents: number;
  parishNetCents: number;
  giftAmountCents: number;
  createdAt: string;
  date: string;
  description: string;
  label: string;
  fund: string;
  fundId: string;
  donorName: string;
  donorEmail: string;
  recurring: false;
  type: 'one_time';
}

const MANUAL_GIVING_SIGNAL =
  /\b(alms?|candle|candles|collection|contribution|donation|gift|giving|offering|stewardship|tithe|tithes|vigil)\b/i;

export function manualAccountingGifts(rows: readonly ManualGivingRow[]): ManualAccountingGift[] {
  return rows
    .filter(
      (row) =>
        row.source_type === 'manual_register_contribution' ||
        MANUAL_GIVING_SIGNAL.test(`${row.account_name || ''} ${row.entry_description || ''}`)
    )
    .map((row) => ({
      id: `accounting:${row.entry_id}:${row.line_id}`,
      source: 'manual_accounting',
      giftType: 'manual_accounting',
      amountCents: Number(row.credit_amount || 0),
      parishNetCents: Number(row.credit_amount || 0),
      giftAmountCents: Number(row.credit_amount || 0),
      createdAt: row.gift_date,
      date: row.gift_date,
      description: [row.entry_description, row.account_name].filter(Boolean).join(' · '),
      label: row.account_name || '',
      fund: row.fund_name || '',
      fundId: row.fund_code || '',
      donorName: '',
      donorEmail: '',
      recurring: false,
      type: 'one_time',
    }));
}
