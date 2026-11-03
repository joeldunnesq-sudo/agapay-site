import { ValidationError } from '../errors.js';
import { validateAccountingDate } from '../validation.js';

export interface Asset {
  id: string;
  tag: string;
  name: string;
  acquisition_line_id: string;
  acquisition_date: string;
  in_service_date: string;
  cost: number;
  salvage: number;
  life_months: number;
  method: string;
  cost_account_id: string;
  accumulated_account_id: string | null;
  expense_account_id: string | null;
  fund_id: string;
  location: string;
  serial_number: string;
  insurance_value: number;
  notes: string;
  status: string;
  disposal_date: string | null;
  version: number;
  request_hash: string;
}
export function date(value: unknown) {
  const text = String(value || '');
  validateAccountingDate(text);
  return text;
}
export function cents(value: unknown, name: string, positive = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw new ValidationError(`${name} must be ${positive ? 'positive ' : 'nonnegative '}whole cents.`);
  return value;
}
export function monthIndex(value: string) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
export function monthEnd(value: string) {
  date(value);
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7));
  return `${value.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
}
// Full in-service month, cumulative integer allocation; no floating-point drift.
export function accumulatedAt(asset: Asset, through: string) {
  date(through);
  if (asset.method === 'none' || through < asset.in_service_date) return 0;
  const months = Math.min(asset.life_months, Math.max(0, monthIndex(through) - monthIndex(asset.in_service_date) + 1));
  return Number((BigInt(asset.cost - asset.salvage) * BigInt(months)) / BigInt(asset.life_months));
}
export function depreciationSchedule(asset: Asset) {
  const start = monthIndex(asset.in_service_date);
  let prior = 0;
  const months = asset.disposal_date
    ? Math.min(asset.life_months, monthIndex(asset.disposal_date) - start + 1)
    : asset.life_months;
  return Array.from({ length: asset.method === 'none' ? 0 : months }, (_, i) => {
    const index = start + i;
    const throughDate = monthEnd(
      `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`
    );
    const accumulated = accumulatedAt(asset, throughDate),
      amount = accumulated - prior;
    prior = accumulated;
    return { throughDate, amount, accumulated, netBookValue: asset.cost - accumulated };
  });
}
