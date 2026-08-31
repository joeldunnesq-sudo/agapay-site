import { ValidationError } from '../errors.js';

export function fiscalCalendar(date, startMonth = 1) {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12 || !Number.isFinite(date.getTime()))
    throw new ValidationError('Choose a valid accounting date and fiscal-year start month.');
  const year = date.getUTCFullYear() - (date.getUTCMonth() + 1 < startMonth ? 1 : 0);
  const iso = (value) => value.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(year, startMonth - 1, 1));
  const end = new Date(Date.UTC(year + 1, startMonth - 1, 0));
  return {
    id: `fy_${year}`,
    name: startMonth === 1 ? String(year) : `${year}–${year + 1}`,
    start: iso(start),
    end: iso(end),
    periods: Array.from({ length: 12 }, (_, index) => {
      const first = new Date(Date.UTC(year, startMonth - 1 + index, 1));
      const last = new Date(Date.UTC(year, startMonth + index, 0));
      return {
        id: `period_${first.getUTCFullYear()}_${first.getUTCMonth() + 1}`,
        number: index + 1,
        name: first.toLocaleString('en', { month: 'long', timeZone: 'UTC' }),
        start: iso(first),
        end: iso(last),
        open: iso(date) >= iso(first) && iso(date) <= iso(last),
      };
    }),
  };
}
