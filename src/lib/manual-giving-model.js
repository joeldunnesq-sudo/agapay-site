// Generated from src/lib/manual-giving-model.ts by npm run build:server. Do not edit.
const MANUAL_GIVING_SIGNAL =
  /\b(alms?|candle|candles|collection|contribution|donation|gift|giving|offering|stewardship|tithe|tithes|vigil)\b/i;
function manualAccountingGifts(rows) {
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
export { manualAccountingGifts };
