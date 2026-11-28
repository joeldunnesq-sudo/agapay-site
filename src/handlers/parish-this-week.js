// Generated from src/handlers/parish-this-week.ts by npm run build:server. Do not edit.
import { requireActiveMembership } from '../lib/authorization.js';
import {
  d1All,
  getBearerToken,
  json,
  missingProductionStoreResponse,
  rateLimit,
  resolveParishDashboardSession,
  unauthorized,
} from '../lib/core.js';
import { communicationsEnabledFor, hasModuleAccess, signupsEnabledFor } from '../lib/entitlements.js';
import { fetchKoinoniaCalendarIcs } from '../lib/koinonia-calendar.js';
import { parishLifeAvailableFor } from '../lib/parish-life-access.js';
import { zonedTimeToUtc } from '../lib/sacrament-availability.js';
import { parseKoinoniaCalendarIcs } from './donor-parish-calendar.js';
import { loadPublishedCommerceCalendarEvents } from './parish-events.js';
import { validTimeZone } from './parish-events-shared.js';
import { findRegistrationByParishId } from './parish.js';
const DAY_MS = 864e5;
const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } };
function dateOnly(time) {
  return new Date(time).toISOString().slice(0, 10);
}
function weekDates(timeZone, requested, now) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  });
  const localDay = (value) => {
    const parts = Object.fromEntries(formatter.formatToParts(value).map(({ type, value: value2 }) => [type, value2]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const today = localDay(now);
  const todayUtc = /* @__PURE__ */ new Date(`${today}T00:00:00Z`);
  const currentWeek = dateOnly(todayUtc.getTime() - ((todayUtc.getUTCDay() + 6) % 7) * DAY_MS);
  const weekStart = requested || currentWeek;
  const monday = Date.parse(`${weekStart}T00:00:00Z`);
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(weekStart) ||
    !Number.isFinite(monday) ||
    dateOnly(monday) !== weekStart ||
    new Date(monday).getUTCDay() !== 1
  )
    return null;
  const nextMonday = monday + 7 * DAY_MS;
  const start = zonedTimeToUtc(weekStart, '00:00', timeZone);
  const through = zonedTimeToUtc(dateOnly(nextMonday), '00:00', timeZone);
  return {
    weekStart,
    weekEnd: dateOnly(monday + 6 * DAY_MS),
    today,
    start: start.getTime(),
    through: through.getTime(),
    // DATE-only ICS events use UTC midnight. Also include parish-local boundaries for timed events.
    calendarStart: new Date(Math.min(monday, start.getTime())),
    calendarEnd: new Date(Math.max(nextMonday, through.getTime()) - 1),
    localDay,
  };
}
async function loadCalendar(sourceUrl, from, through) {
  if (!sourceUrl) return { state: 'not_connected', events: [] };
  try {
    const text = await fetchKoinoniaCalendarIcs(sourceUrl);
    return { state: 'connected', events: parseKoinoniaCalendarIcs(text, from, through) };
  } catch {
    return { state: 'unavailable', events: [] };
  }
}
async function handleParishThisWeek(request, env, parishId) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { ...PRIVATE, status: 405 });
  if (!env.AGAPAY_DB) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'parish-this-week', { limit: 40, windowSeconds: 300 });
  if (limited) return limited;
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return unauthorized();
  const { registration } = found;
  const session = await resolveParishDashboardSession(registration, token);
  const primaryAccess = session?.accessType === 'primary_parish' || session?.accessType === '';
  const identity = primaryAccess ? null : await requireActiveMembership(request, env, parishId);
  if (!primaryAccess && !identity) return unauthorized();
  if (!parishLifeAvailableFor(env) || !hasModuleAccess(registration, 'communications')) {
    return json({ error: 'This Week requires access to Parish Life.' }, { ...PRIVATE, status: 403 });
  }
  const timeZone = validTimeZone(registration.timezone);
  const dates = weekDates(timeZone, new URL(request.url).searchParams.get('week') || '', /* @__PURE__ */ new Date());
  if (!dates) return json({ error: 'Choose a Monday in YYYY-MM-DD format.' }, { ...PRIVATE, status: 422 });
  const canCoordinate =
    primaryAccess ||
    Boolean(
      identity?.capabilities.some((capability) =>
        ['parish.manage', 'directory.manage', 'communications.manage'].includes(capability)
      )
    );
  const ministryEnabled = canCoordinate && communicationsEnabledFor(registration);
  const signupsEnabled = ministryEnabled && signupsEnabledFor(registration);
  const from = dates.start;
  const until = dates.through;
  const [calendar, registrations, ministry, slots] = await Promise.all([
    loadCalendar(registration.koinoniaCalendarUrl, dates.calendarStart, dates.calendarEnd),
    loadPublishedCommerceCalendarEvents(env, parishId, registration, {
      from: dates.weekStart,
      through: dates.weekEnd,
    }),
    ministryEnabled
      ? d1All(
          env,
          `SELECT e.id,e.title,e.location,e.starts_at,e.ministry_id,m.display_name AS ministry_name
           FROM koinonia_ministry_events e JOIN directory_ministries m
             ON m.id=e.ministry_id AND m.parish_id=e.parish_id AND m.status='active'
           WHERE e.parish_id=?1 AND e.starts_at>=?2 AND e.starts_at<?3
           ORDER BY e.starts_at,e.id`,
          parishId,
          from,
          until
        )
      : [],
    signupsEnabled
      ? d1All(
          env,
          `SELECT s.id,s.sheet_id,m.display_name AS ministry_name,h.title,h.status AS sheet_status,s.label,s.slot_date,s.needed_count,
            (SELECT COUNT(*) FROM koinonia_signup_entries e
              WHERE e.slot_id=s.id AND e.parish_id=s.parish_id AND e.status='confirmed') AS confirmed,
            (SELECT COUNT(*) FROM koinonia_signup_coverage_requests c
              JOIN koinonia_signup_entries e ON e.id=c.entry_id AND e.parish_id=c.parish_id
              WHERE e.slot_id=s.id AND e.parish_id=s.parish_id AND e.status='confirmed' AND c.status='open') AS coverage
           FROM koinonia_signup_sheets h JOIN koinonia_signup_slots s ON s.sheet_id=h.id AND s.parish_id=h.parish_id
           JOIN directory_ministries m ON m.id=h.ministry_id AND m.parish_id=h.parish_id AND m.status='active'
           WHERE h.parish_id=?1 AND h.status IN ('open','closed') AND s.slot_date>=?2 AND s.slot_date<?3
           ORDER BY s.slot_date,s.display_order,s.id`,
          parishId,
          from,
          until
        )
      : [],
  ]);
  const inWeek = (day) => day >= dates.weekStart && day <= dates.weekEnd;
  const publicEvents = [...calendar.events, ...registrations].flatMap((event) => {
    const instant = Date.parse(event.startsAt);
    if (!Number.isFinite(instant)) return [];
    const day = event.allDay ? event.startsAt.slice(0, 10) : dates.localDay(instant);
    if (!inWeek(day)) return [];
    const href = 'href' in event && typeof event.href === 'string' ? event.href : void 0;
    return [
      {
        id: event.id + ':' + event.startsAt,
        title: event.title,
        location: event.location,
        startsAt: event.startsAt,
        day,
        allDay: event.allDay,
        kind: href ? 'registration' : 'calendar',
        ...(href ? { href } : {}),
      },
    ];
  });
  const events = [
    ...publicEvents,
    ...ministry.map((e) => ({
      id: e.id,
      title: e.title,
      location: e.location || '',
      startsAt: new Date(e.starts_at).toISOString(),
      day: dates.localDay(e.starts_at),
      allDay: false,
      kind: 'ministry',
      ministry: e.ministry_name,
      href: `/myagapay/groups?group=${encodeURIComponent(e.ministry_id)}`,
    })),
  ];
  events.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(b.allDay) - Number(a.allDay) ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt)
  );
  const serving = slots.map((s) => ({
    id: s.id,
    title: s.title,
    label: s.label,
    ministry: s.ministry_name,
    day: dates.localDay(s.slot_date),
    startsAt: new Date(s.slot_date).toISOString(),
    needed: s.needed_count,
    confirmed: s.confirmed,
    open: s.sheet_status === 'open' ? Math.max(0, s.needed_count - s.confirmed) : 0,
    coverage: s.coverage,
    href: `/myagapay/signups?sheet=${encodeURIComponent(s.sheet_id)}`,
  }));
  return json(
    {
      weekStart: dates.weekStart,
      weekEnd: dates.weekEnd,
      today: dates.today,
      timeZone,
      calendarState: calendar.state,
      ministryEnabled,
      signupsEnabled,
      events,
      serving,
    },
    PRIVATE
  );
}
export { handleParishThisWeek };
