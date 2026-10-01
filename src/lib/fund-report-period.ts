export interface FundReportPeriod {
  month: string | null;
  label: string;
  timezone: string;
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  startUnix: number;
  endUnix: number;
  inProgress: boolean;
}
export interface FundReportPeriodOptions {
  month?: string | null;
  week?: boolean;
  timezone?: string;
  now?: Date;
}

export function parishReportingTimezone(registration: { readonly timezone?: string | null } = {}): string {
  const timezone = registration.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function parishCalendarDate(value: string | number | Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(value))
      .map(({ type, value: part }) => [type, part])
  );
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function calendarOffset(date: string, days: number): string {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarMidnight(date: string, timezone: string): string {
  const target = Date.parse(date + 'T00:00:00Z');
  let value = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const delta = target - local;
    value += delta;
    if (!delta) break;
  }
  return new Date(value).toISOString();
}

export function fundReportPeriod({
  month,
  week = false,
  timezone = 'UTC',
  now = new Date(),
}: FundReportPeriodOptions = {}): FundReportPeriod {
  const today = parishCalendarDate(now, timezone);
  let startDate, endDate, label;
  if (week) {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    endDate = calendarOffset(today, -((weekday + 6) % 7));
    startDate = calendarOffset(endDate, -7);
    label = startDate + ' – ' + calendarOffset(endDate, -1);
  } else {
    month ||= calendarOffset(today.slice(0, 7) + '-01', -1).slice(0, 7);
    if (!/^(?:20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid reconciliation month.');
    startDate = month + '-01';
    const next = new Date(startDate + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
    label = new Date(startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const startIso = calendarMidnight(startDate, timezone);
  const endIso = calendarMidnight(endDate, timezone);
  return {
    month: week ? null : month!,
    label,
    timezone,
    startDate,
    endDate,
    startIso,
    endIso,
    startUnix: Date.parse(startIso) / 1000,
    endUnix: Date.parse(endIso) / 1000,
    inProgress: endDate > today,
  };
}
