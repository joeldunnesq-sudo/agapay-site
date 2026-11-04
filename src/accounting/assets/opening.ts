import type { PortabilityDatabase } from '../../portability/contracts.js';
import { ValidationError } from '../errors.js';
import { cents, date, monthEnd, monthIndex } from './schedule.js';

export interface AssetOpeningInput {
  originalAcquisitionDate: string;
  throughDate: string;
  amount: number;
  creditLineId?: string;
}
export async function assetOpening(
  db: PortabilityDatabase,
  input: {
    opening?: AssetOpeningInput;
    cost: number;
    salvage: number;
    method: string;
    inServiceDate: string;
    effectiveDate?: string;
  },
  line: { id: string; fund_id: string; entry_date: string },
  accumulatedAccountId: string
) {
  const replacement = await db
    .prepare(
      `SELECT MAX(c.entry_date) cutoff FROM accounting_asset_cancellations c
 JOIN accounting_fixed_assets a ON a.id=c.asset_id WHERE a.acquisition_line_id=?`
    )
    .bind(line.id)
    .first<{ cutoff: string | null }>();
  let ledgerStart = [line.entry_date, replacement?.cutoff || ''].sort().at(-1)!;
  if (!input.opening) {
    if (input.inServiceDate < line.entry_date)
      throw new ValidationError('For an older asset, use the historical opening balance option.');
    if (input.effectiveDate) {
      const effective = date(input.effectiveDate);
      if (effective < ledgerStart)
        throw new ValidationError('Effective date precedes the source entry or a cancelled registration.');
      ledgerStart = effective;
    }
    return { opening: null, ledgerStart };
  }
  const original = date(input.opening.originalAcquisitionDate),
    through = date(input.opening.throughDate),
    amount = cents(input.opening.amount, 'Opening depreciation');
  const creditLineId = String(input.opening.creditLineId || '').trim();
  if (
    monthEnd(through) !== through ||
    original > input.inServiceDate ||
    input.inServiceDate > through ||
    amount > input.cost - input.salvage
  )
    throw new ValidationError(
      'Check the original acquisition, in-service and opening month-end dates, salvage and accumulated depreciation.'
    );
  if (input.method === 'none' && amount)
    throw new ValidationError('Nondepreciable assets cannot have opening depreciation.');
  if (amount) {
    const credit = await db
      .prepare(
        `SELECT l.account_id,l.fund_id,e.entry_date FROM accounting_journal_lines l
   JOIN accounting_journal_entries e ON e.id=l.journal_entry_id WHERE l.id=? AND l.credit_amount>0 AND e.status='posted'`
      )
      .bind(creditLineId)
      .first<{ account_id: string; fund_id: string; entry_date: string }>();
    if (!credit || credit.account_id !== accumulatedAccountId || credit.fund_id !== line.fund_id)
      throw new ValidationError(
        'Opening depreciation must link to a posted credit in the same fund and accumulated-depreciation account.'
      );
    ledgerStart = [ledgerStart, credit.entry_date].sort().at(-1)!;
  }
  if (input.effectiveDate) {
    const effective = date(input.effectiveDate);
    if (effective < ledgerStart) throw new ValidationError('Effective date precedes the opening ledger entries.');
    ledgerStart = effective;
  }
  const difference = monthIndex(ledgerStart) - monthIndex(through);
  if (difference < 0 || difference > 1)
    throw new ValidationError(
      'The opening month-end must be in the ledger-recognition month or immediately before it.'
    );
  return {
    opening: {
      originalAcquisitionDate: original,
      throughDate: through,
      amount,
      creditLineId: amount ? creditLineId : '',
    },
    ledgerStart,
  };
}
