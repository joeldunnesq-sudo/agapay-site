import { json, unauthorized } from '../lib/core.js';
import { fetchKoinoniaCalendarIcs, normalizeKoinoniaCalendarUrl } from '../lib/koinonia-calendar.js';
import { loadPublishedCommerceCalendarEvents } from './parish-events.js';
import { findRegistrationByParishId, requireDonor } from './parish.js';

function unescapeIcsText(value = '') {
  return String(value).replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function icsDateParts(value = '') {
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc = ''] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    utc: Boolean(utc),
    allDay: !raw.includes('T'),
  };
}

function icsZoneFormatter(timeZone, context) {
  const cached = context?.formatters?.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  if (context?.formatters && context.formatters.size < 16) context.formatters.set(timeZone, formatter);
  return formatter;
}

function icsZonedDate(parts, timeZone, context) {
  let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  try {
    const formatter = icsZoneFormatter(timeZone, context);
    for (let pass = 0; pass < 2; pass += 1) {
      const displayed = Object.fromEntries(
        formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
      );
      const displayedTimestamp = Date.UTC(
        Number(displayed.year),
        Number(displayed.month) - 1,
        Number(displayed.day),
        Number(displayed.hour),
        Number(displayed.minute),
        Number(displayed.second)
      );
      timestamp +=
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - displayedTimestamp;
    }
  } catch {
    return null;
  }
  return new Date(timestamp);
}

function icsDate(value = '', params = {}, context = undefined) {
  const parts = icsDateParts(value);
  if (!parts) return null;
  let date;
  if (parts.utc) {
    date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  } else if (params.tzid) {
    date = icsZonedDate(parts, params.tzid, context);
  } else {
    date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }
  return !date || Number.isNaN(date.getTime()) ? null : date;
}

function icsRule(value = '') {
  return Object.fromEntries(
    String(value)
      .split(';')
      .map((part) => part.split('='))
      .filter((pair) => pair.length === 2)
  );
}

const ICS_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icsNaiveDate(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

function icsDateInEventZone(date, event, context) {
  if (event.dtstartParams?.tzid) {
    try {
      const formatter = icsZoneFormatter(event.dtstartParams.tzid, context);
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
    } catch {
      return null;
    }
  }
  return event.dtstartParams?.utc
    ? { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
    : { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function icsRecurrenceDate(cursor, event, context) {
  const parts = {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    hour: cursor.getUTCHours(),
    minute: cursor.getUTCMinutes(),
    second: cursor.getUTCSeconds(),
  };
  if (event.dtstartParams?.tzid) return icsZonedDate(parts, event.dtstartParams.tzid, context);
  if (event.dtstartParams?.utc) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  }
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function icsCountLatestPossible(startCursor, frequency, interval, count) {
  const latest = new Date(startCursor);
  const span = Math.max(0, count - 1) * interval;
  if (frequency === 'DAILY') latest.setUTCDate(latest.getUTCDate() + span);
  if (frequency === 'WEEKLY') latest.setUTCDate(latest.getUTCDate() + span * 7 + 6);
  if (frequency === 'MONTHLY') latest.setUTCMonth(latest.getUTCMonth() + span);
  if (frequency === 'YEARLY') latest.setUTCFullYear(latest.getUTCFullYear() + span);
  return latest;
}

const ICS_TIMEZONE_MARGIN_MS = 36 * 60 * 60 * 1000;

function icsBlockMayOverlap(block, now, horizon) {
  const recurrence = block.match(/(?:^|\r?\n)RRULE:([^\r\n]+)/)?.[1] || '';
  if (recurrence) return /(?:^|;)FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;|$)/.test(recurrence);
  const startValue = block.match(/(?:^|\r?\n)DTSTART[^:]*:([^\r\n]+)/)?.[1] || '';
  const startParts = icsDateParts(startValue);
  if (!startParts) return true;
  const endValue = block.match(/(?:^|\r?\n)DTEND[^:]*:([^\r\n]+)/)?.[1] || '';
  const endParts = icsDateParts(endValue);
  const approximateStart = icsNaiveDate(startParts).getTime();
  const approximateEnd = endParts ? icsNaiveDate(endParts).getTime() : approximateStart;
  return (
    approximateStart <= horizon.getTime() + ICS_TIMEZONE_MARGIN_MS &&
    approximateEnd >= now.getTime() - ICS_TIMEZONE_MARGIN_MS
  );
}

function expandIcsEvent(event, now, horizon, context) {
  const startParts = icsDateParts(event.dtstart);
  if (!startParts) return [];
  const rule = event.rrule ? icsRule(event.rrule) : null;
  if (rule && (!rule.FREQ || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.FREQ))) return [];
  const startCursor = icsNaiveDate(startParts);
  if (!rule) {
    const endParts = icsDateParts(event.dtend);
    const approximateEnd = endParts ? icsNaiveDate(endParts) : startCursor;
    if (
      startCursor.getTime() > horizon.getTime() + ICS_TIMEZONE_MARGIN_MS ||
      approximateEnd.getTime() < now.getTime() - ICS_TIMEZONE_MARGIN_MS
    )
      return [];
    const start = icsDate(event.dtstart, event.dtstartParams, context);
    if (!start) return [];
    const end = icsDate(event.dtend, event.dtendParams || event.dtstartParams, context);
    const duration = end ? Math.max(0, end.getTime() - start.getTime()) : 0;
    return start <= horizon && (end || start) >= now ? [{ start, end, duration }] : [];
  }
  const frequency = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const count = Math.max(0, Number.parseInt(rule.COUNT || '0', 10) || 0);
  if (count) {
    const latestPossible = icsCountLatestPossible(startCursor, frequency, interval, count);
    if (latestPossible.getTime() < now.getTime() - ICS_TIMEZONE_MARGIN_MS) return [];
  }
  const start = icsDate(event.dtstart, event.dtstartParams, context);
  if (!start) return [];
  const end = icsDate(event.dtend, event.dtendParams || event.dtstartParams, context);
  const duration = end ? Math.max(0, end.getTime() - start.getTime()) : 0;
  const until = icsDate(rule.UNTIL, event.dtstartParams, context) || horizon;
  const results = [];
  const byDays = new Set(
    String(rule.BYDAY || ICS_WEEKDAYS[startCursor.getUTCDay()])
      .split(',')
      .map((day) => day.slice(-2))
  );
  const byMonths = new Set(
    String(rule.BYMONTH || startParts.month)
      .split(',')
      .map(Number)
      .filter((month) => month >= 1 && month <= 12)
  );
  const byMonthDays = String(rule.BYMONTHDAY || startParts.day)
    .split(',')
    .map(Number)
    .filter((day) => day >= -31 && day <= 31 && day !== 0);
  const excluded = new Set(
    (event.exdates || [])
      .flatMap((entry) =>
        String(entry.value || '')
          .split(',')
          .map((value) => icsDate(value, { ...event.dtstartParams, ...entry.params }, context)?.getTime())
      )
      .filter(Number.isFinite)
  );
  let cursor = new Date(startCursor);
  if (!count) {
    const recurrenceSearchStart = duration ? new Date(now.getTime() - duration) : now;
    const zonedToday = icsDateInEventZone(recurrenceSearchStart, event, context);
    if (zonedToday) {
      const todayCursor = new Date(
        Date.UTC(
          zonedToday.year,
          zonedToday.month - 1,
          zonedToday.day,
          startParts.hour,
          startParts.minute,
          startParts.second
        )
      );
      if (todayCursor > cursor) cursor = todayCursor;
    }
  }
  let occurrencesSeen = 0;
  for (let guard = 0; guard < 5000 && results.length < 30; guard += 1) {
    const instanceStart = icsRecurrenceDate(cursor, event, context);
    if (!instanceStart || instanceStart > horizon || instanceStart > until) break;
    const dayDelta = Math.floor((cursor - startCursor) / 86400000);
    const weekDelta = Math.floor(dayDelta / 7);
    const monthDelta =
      (cursor.getUTCFullYear() - startCursor.getUTCFullYear()) * 12 + cursor.getUTCMonth() - startCursor.getUTCMonth();
    const yearDelta = cursor.getUTCFullYear() - startCursor.getUTCFullYear();
    const daysInCursorMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    const matchesYearlyMonthDay = byMonthDays.some((day) =>
      day > 0 ? cursor.getUTCDate() === day : cursor.getUTCDate() === daysInCursorMonth + day + 1
    );
    const matches =
      cursor >= startCursor &&
      ((frequency === 'DAILY' && dayDelta % interval === 0) ||
        (frequency === 'WEEKLY' && weekDelta % interval === 0 && byDays.has(ICS_WEEKDAYS[cursor.getUTCDay()])) ||
        (frequency === 'MONTHLY' && monthDelta % interval === 0 && cursor.getUTCDate() === startCursor.getUTCDate()) ||
        (frequency === 'YEARLY' &&
          yearDelta % interval === 0 &&
          byMonths.has(cursor.getUTCMonth() + 1) &&
          matchesYearlyMonthDay));
    if (matches) {
      occurrencesSeen += 1;
      const instanceEnd = duration ? new Date(instanceStart.getTime() + duration) : null;
      if ((instanceEnd || instanceStart) >= now && !excluded.has(instanceStart.getTime())) {
        results.push({ start: instanceStart, end: instanceEnd, duration });
      }
      if (count && occurrencesSeen >= count) break;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return results;
}

export function parseKoinoniaCalendarIcs(text, fromDate = new Date()) {
  const unfolded = String(text || '').replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const now = new Date(fromDate);
  const horizon = new Date(now.getTime() + 180 * 86400000);
  const context = { formatters: new Map() };
  return blocks
    .flatMap((block) => {
      if (!icsBlockMayOverlap(block, now, horizon)) return [];
      const event = {};
      block.split(/\r?\n/).forEach((line) => {
        const separator = line.indexOf(':');
        if (separator < 0) return;
        const [rawKey, ...rawParams] = line.slice(0, separator).split(';');
        const key = rawKey.toLowerCase();
        const params = Object.fromEntries(
          rawParams.map((param) => {
            const equals = param.indexOf('=');
            return equals < 0
              ? [param.toLowerCase(), '']
              : [param.slice(0, equals).toLowerCase(), param.slice(equals + 1).replace(/^"|"$/g, '')];
          })
        );
        const value = line.slice(separator + 1);
        if (key === 'exdate') {
          (event.exdates ||= []).push({ value, params });
        } else if (['summary', 'location', 'description', 'dtstart', 'dtend', 'rrule', 'uid', 'status'].includes(key)) {
          event[key] = value;
          event[`${key}Params`] = { ...params, utc: value.endsWith('Z') };
        }
      });
      if (String(event.status || '').toUpperCase() === 'CANCELLED') return [];
      return expandIcsEvent(event, now, horizon, context).map((instance) => ({
        id: String(event.uid || `${event.summary || 'event'}-${instance.start.toISOString()}`).slice(0, 240),
        title: unescapeIcsText(event.summary) || 'Parish event',
        location: unescapeIcsText(event.location),
        description: unescapeIcsText(event.description).slice(0, 500),
        startsAt: instance.start.toISOString(),
        endsAt: instance.end?.toISOString() || '',
        allDay: !String(event.dtstart || '').includes('T'),
      }));
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 180);
}

export async function handleDonorParishCalendar(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!donor.defaultParishId) return json({ connected: false, events: [] });
  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  const commerceEvents = await loadPublishedCommerceCalendarEvents(
    env,
    donor.defaultParishId,
    found?.registration || {}
  );
  const sourceUrl = String(found?.registration?.koinoniaCalendarUrl || '').trim();
  if (!sourceUrl) {
    return json(
      { connected: false, internal: true, events: commerceEvents },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  }
  let subscriptionUrl;
  try {
    subscriptionUrl = normalizeKoinoniaCalendarUrl(sourceUrl);
  } catch {
    return json(
      { connected: true, internal: true, events: commerceEvents, unavailable: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  try {
    const text = await fetchKoinoniaCalendarIcs(subscriptionUrl);
    const events = [...parseKoinoniaCalendarIcs(text), ...commerceEvents]
      .sort((left, right) => String(left.startsAt || '').localeCompare(String(right.startsAt || '')))
      .slice(0, 240);
    return json(
      { connected: true, internal: true, subscriptionUrl, events, syncedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  } catch {
    return json(
      { connected: true, internal: true, subscriptionUrl, events: commerceEvents, unavailable: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
