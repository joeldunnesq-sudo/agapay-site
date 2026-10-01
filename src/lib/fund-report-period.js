// Generated from src/lib/fund-report-period.ts by npm run build:server. Do not edit.
function parishReportingTimezone(registration = {}) {
  const timezone = registration.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}
function parishCalendarDate(value, timezone) {
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
function calendarOffset(date, days) {
  const value = /* @__PURE__ */ new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function calendarMidnight(date, timezone) {
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
function fundReportPeriod({ month, week = false, timezone = 'UTC', now = /* @__PURE__ */ new Date() } = {}) {
  const today = parishCalendarDate(now, timezone);
  let startDate, endDate, label;
  if (week) {
    const weekday = /* @__PURE__ */ new Date(today + 'T12:00:00Z').getUTCDay();
    endDate = calendarOffset(today, -((weekday + 6) % 7));
    startDate = calendarOffset(endDate, -7);
    label = startDate + ' – ' + calendarOffset(endDate, -1);
  } else {
    month ||= calendarOffset(today.slice(0, 7) + '-01', -1).slice(0, 7);
    if (!/^(?:20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid reconciliation month.');
    startDate = month + '-01';
    const next = /* @__PURE__ */ new Date(startDate + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
    label = /* @__PURE__ */ new Date(startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const startIso = calendarMidnight(startDate, timezone);
  const endIso = calendarMidnight(endDate, timezone);
  return {
    month: week ? null : month,
    label,
    timezone,
    startDate,
    endDate,
    startIso,
    endIso,
    startUnix: Date.parse(startIso) / 1e3,
    endUnix: Date.parse(endIso) / 1e3,
    inProgress: endDate > today,
  };
}
export { calendarMidnight, fundReportPeriod, parishCalendarDate, parishReportingTimezone };
