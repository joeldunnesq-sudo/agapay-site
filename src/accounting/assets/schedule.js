// Generated from src/accounting/assets/schedule.ts by npm run build:server. Do not edit.
import { ValidationError } from '../errors.js';
import { validateAccountingDate } from '../validation.js';
function date(value) {
  const text = String(value || '');
  validateAccountingDate(text);
  return text;
}
function cents(value, name, positive = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw new ValidationError(`${name} must be ${positive ? 'positive ' : 'nonnegative '}whole cents.`);
  return value;
}
function monthIndex(value) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
function monthEnd(value) {
  date(value);
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7));
  return `${value.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
}
function accumulatedAt(asset, through) {
  date(through);
  if (asset.method === 'none' || through < asset.in_service_date) return 0;
  const months = Math.min(asset.life_months, Math.max(0, monthIndex(through) - monthIndex(asset.in_service_date) + 1));
  return Number((BigInt(asset.cost - asset.salvage) * BigInt(months)) / BigInt(asset.life_months));
}
function depreciationSchedule(asset) {
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
export { accumulatedAt, cents, date, depreciationSchedule, monthEnd, monthIndex };
