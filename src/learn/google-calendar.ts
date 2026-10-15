type CalendarEnv = Partial<Env> & {
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  AGAPAY_LEARN_TIME_ZONE?: string;
  TZ?: string;
};
interface CalendarConnection {
  accountEmail?: string;
  householdId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  calendarId?: string;
  calendarName?: string;
  calendarTimeZone?: string;
  calendarCreatedAt?: string;
  connectedAt?: string;
  updatedAt?: string;
}
interface GooglePayload {
  id?: string;
  summary?: string;
  timeZone?: string;
  items?: { id?: string }[];
  error_description?: string;
  error?: string | { message?: string };
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}
interface FamilyCalendarEvent {
  date?: string;
  title?: string;
  startTime?: string;
  recurrence?: string;
  eventType?: string;
  location?: string;
  notes?: string;
}
export interface CalendarPreviewEvent {
  type: string;
  title: string;
  date: string;
  allDay: boolean;
  durationMinutes?: number;
  description?: string;
  startTime?: string;
}
interface LessonRow {
  title: string;
  minutes?: number[];
  subtitle?: string;
  detail?: string;
  child?: { firstName?: string; name?: string };
}
export interface CalendarRepository {
  seed?: {
    setupSnapshot?: { preferences?: { calendarType?: string }; household?: { liturgicalCalendarType?: string } };
    household?: { liturgicalCalendarType?: string };
  };
  getPlanner(input: { calendarType: string; view: string }): {
    week: {
      dates?: string[];
      householdRows?: LessonRow[];
      childRows?: LessonRow[];
      liturgicalDays: {
        feastRank: string;
        feastTitle: string;
        civilDate: string;
        fastingRule: string;
        saints: string[];
      }[];
    };
    familyPlanning?: {
      meals?: { date: string; breakfast?: string; lunch?: string; dinner?: string }[];
      events?: FamilyCalendarEvent[];
    };
  };
}
import { json, unauthorized } from '../lib/core.js';
import { learnSetupIdentity } from './setup-persistence.js';

const GOOGLE_AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GOOGLE_CONNECTION_KV_PREFIX = '__agapay_learn_google_calendar:';
const devConnections = new Map<string, CalendarConnection>();

function encodeState(value: { returnTo: string; householdId: string }) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeState(value: string | null) {
  const padded = `${String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')}${'==='.slice((String(value || '').length + 3) % 4)}`;
  return JSON.parse(atob(padded)) as { returnTo?: string; householdId?: string };
}

function publicBaseUrl(request: Request, env: CalendarEnv = {}) {
  const url = new URL(request.url);
  return env.AGAPAY_PUBLIC_URL || `${url.protocol}//${url.host}`;
}

function configured(env: CalendarEnv = {}) {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

function connectionKey(householdId: string) {
  return `${GOOGLE_CONNECTION_KV_PREFIX}${householdId}`;
}

function parseJson(value: string | CalendarConnection | null) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as CalendarConnection;
  } catch {
    return null;
  }
}

async function loadConnection(env: CalendarEnv = {}, householdId: string = '') {
  if (!householdId) return null;
  if (!env.AGAPAY_REGISTRATIONS) return devConnections.get(householdId) || null;
  return parseJson(await env.AGAPAY_REGISTRATIONS.get(connectionKey(householdId)));
}

async function saveConnection(env: CalendarEnv = {}, householdId: string = '', connection: CalendarConnection = {}) {
  if (!householdId) return;
  const stored = {
    ...connection,
    householdId,
    updatedAt: new Date().toISOString(),
  };
  if (!env.AGAPAY_REGISTRATIONS) {
    devConnections.set(householdId, stored);
    return;
  }
  await env.AGAPAY_REGISTRATIONS.put(connectionKey(householdId), JSON.stringify(stored));
}

function googleRedirect(request: Request, returnTo: string, status: string, message: string | null = '') {
  const url = new URL(request.url);
  const redirectUrl = new URL(returnTo || '/myagapay/learn/setup', url.origin);
  redirectUrl.searchParams.set('googleCalendar', status);
  if (message) redirectUrl.searchParams.set('message', message);
  return Response.redirect(redirectUrl.toString(), 302);
}

async function exchangeAuthorizationCode(request: Request, env: CalendarEnv, code: string) {
  const baseUrl = publicBaseUrl(request, env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID as string,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET as string,
      redirect_uri: `${baseUrl}/api/learn/google-calendar/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as GooglePayload;
  if (!response.ok) {
    throw new Error(payload.error_description || (payload.error as string) || 'Google OAuth token exchange failed.');
  }
  return payload;
}

async function refreshAccessToken(env: CalendarEnv, householdId: string, connection: CalendarConnection) {
  if (!connection?.refreshToken) return connection;
  if (connection.accessToken && Number(connection.expiresAt || 0) > Date.now() + 90_000) return connection;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: connection.refreshToken,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID as string,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET as string,
      grant_type: 'refresh_token',
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as GooglePayload;
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        (payload.error as string) ||
        'Google Calendar connection expired. Please reconnect Google Calendar.'
    );
  }

  const updated = {
    ...connection,
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
    scope: payload.scope || connection.scope || CALENDAR_SCOPE,
  };
  await saveConnection(env, householdId, updated);
  return updated;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDateParts(value: string = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function eventRecurrence(value: string | undefined = '') {
  const raw = String(value || '').toLowerCase();
  return ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(raw) ? raw : 'none';
}

function recurringEventOccursOnDate(event: FamilyCalendarEvent = {}, date: string = '') {
  if (!event.date || !date || date < event.date) return false;
  const recurrence = eventRecurrence(event.recurrence);
  if (recurrence === 'none') return event.date === date;
  const start = new Date(`${event.date}T00:00:00.000Z`);
  const target = new Date(`${date}T00:00:00.000Z`);
  const diffDays = Math.round(((target as Date & number) - (start as Date & number)) / 86400000);
  if (diffDays < 0) return false;
  if (recurrence === 'weekly') return diffDays % 7 === 0;
  if (recurrence === 'biweekly') return diffDays % 14 === 0;
  const startParts = isoDateParts(event.date);
  const targetParts = isoDateParts(date);
  if (!startParts || !targetParts || startParts.day !== targetParts.day) return false;
  const monthDiff = (targetParts.year - startParts.year) * 12 + (targetParts.month - startParts.month);
  if (recurrence === 'monthly') return monthDiff >= 0;
  if (recurrence === 'quarterly') return monthDiff >= 0 && monthDiff % 3 === 0;
  return recurrence === 'yearly' && startParts.month === targetParts.month;
}

function slug(value: unknown) {
  return (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  );
}

function previewEvents(repository: CalendarRepository, request: Request, extraEvents: CalendarPreviewEvent[] = []) {
  const url = new URL(request.url);
  const calendarType =
    url.searchParams.get('calendar') ||
    repository?.seed?.setupSnapshot?.preferences?.calendarType ||
    repository?.seed?.setupSnapshot?.household?.liturgicalCalendarType ||
    repository?.seed?.household?.liturgicalCalendarType ||
    'julian';
  const planner = repository.getPlanner({ calendarType, view: 'week' });
  const weekDates = planner.week?.dates || [];
  const familyPlanning = planner.familyPlanning || {};
  const lessonEvents: CalendarPreviewEvent[] = [];
  const lessonRows = [
    ...(planner.week?.householdRows || []).map((row) => ({ ...row, rowType: 'Household' })),
    ...(planner.week?.childRows || []).map((row) => ({
      ...row,
      rowType: row.child?.firstName || row.child?.name || 'Form',
    })),
  ];
  lessonRows.forEach((row) => {
    weekDates.forEach((date, index) => {
      const minutes = Number(row.minutes?.[index] || 0);
      if (minutes > 0)
        lessonEvents.push({
          type: 'lesson',
          title: row.title,
          date,
          allDay: false,
          durationMinutes: minutes,
          description: [row.rowType, row.subtitle || row.detail || ''].filter(Boolean).join(' - '),
        });
    });
  });
  const mealEvents = (familyPlanning.meals || [])
    .filter((meal) => weekDates.includes(meal.date))
    .map((meal) => ({
      type: 'meal',
      title: 'Meal Plan',
      date: meal.date,
      allDay: true,
      description: [
        meal.breakfast ? `Breakfast: ${meal.breakfast}` : '',
        meal.lunch ? `Lunch: ${meal.lunch}` : '',
        meal.dinner ? `Dinner: ${meal.dinner}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }));
  const familyEvents = weekDates.flatMap((date) =>
    (familyPlanning.events || [])
      .filter((event) => recurringEventOccursOnDate(event, date))
      .map((event) => ({
        type: 'family-event',
        title: event.title || 'Family Event',
        date,
        startTime: event.startTime || '',
        allDay: !event.startTime,
        durationMinutes: 60,
        description: [
          event.eventType,
          event.location,
          event.notes,
          eventRecurrence(event.recurrence) !== 'none' ? `Repeats: ${event.recurrence}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      }))
  );
  const events = [
    ...planner.week.liturgicalDays
      .filter((day) => day.feastRank !== 'Daily Rhythm')
      .map((day) => ({
        type: 'feast',
        title: day.feastTitle,
        date: day.civilDate,
        allDay: true,
        description: `${day.fastingRule} - ${day.saints.join(', ')}`,
      })),
    ...lessonEvents,
    ...mealEvents,
    ...familyEvents,
    ...extraEvents,
  ];
  return { calendarType, events };
}

function googleEventFromPreview(event: CalendarPreviewEvent, index: number, env: CalendarEnv = {}) {
  const timeZone = env.AGAPAY_LEARN_TIME_ZONE || env.TZ || 'America/Chicago';
  const syncKey = `agapay-learn-${slug(event.type)}-${event.date}-${slug(event.title)}-${index}`;
  const base = {
    summary: `AGAPAY Learn: ${event.title}`,
    description: [event.description || '', '', 'Created by AGAPAY Learn.', `Sync key: ${syncKey}`].join('\n').trim(),
    extendedProperties: {
      private: {
        agapaySyncKey: syncKey,
        agapaySource: 'learn',
      },
    },
  };

  if (event.allDay) {
    return {
      syncKey,
      body: {
        ...base,
        start: { date: event.date },
        end: { date: addDays(event.date, 1) },
      },
    };
  }

  const timeMatch = String(event.startTime || '').match(/^(\d{2}):(\d{2})$/);
  const startHour = timeMatch ? Number(timeMatch[1]) : 9 + Math.min(index % 7, 6);
  const startMinute = timeMatch ? Number(timeMatch[2]) : 0;
  const start = `${event.date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`;
  const endDate = new Date(
    `${event.date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`
  );
  endDate.setMinutes(endDate.getMinutes() + Math.max(15, Number(event.durationMinutes || 30)));
  const end = `${event.date}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;

  return {
    syncKey,
    body: {
      ...base,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
    },
  };
}

async function googleCalendarRequest(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as GooglePayload;
  if (!response.ok) {
    const error: Error & { status?: number; payload?: GooglePayload } = new Error(
      (payload.error as { message?: string })?.message ||
        payload.error_description ||
        (payload.error as string) ||
        'Google Calendar request failed.'
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function createAgapayCalendar(accessToken: string, env: CalendarEnv = {}) {
  const timeZone = env.AGAPAY_LEARN_TIME_ZONE || env.TZ || 'America/Chicago';
  const calendar = await googleCalendarRequest(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: 'AGAPAY Learn',
      description:
        'Homeschool lessons, Orthodox feast days, and household learning events synchronized by AGAPAY Learn.',
      timeZone,
    }),
  });

  if (!calendar?.id) {
    throw new Error('Google did not return an AGAPAY Learn calendar ID.');
  }

  return {
    calendarId: calendar.id,
    calendarName: calendar.summary || 'AGAPAY Learn',
    calendarTimeZone: calendar.timeZone || timeZone,
  };
}

async function ensureAgapayCalendar(env: CalendarEnv, householdId: string, connection: CalendarConnection) {
  if (!connection?.accessToken) {
    throw new Error('Google Calendar is not connected. Please reconnect Google Calendar.');
  }

  if (connection.calendarId) {
    try {
      const calendar = await googleCalendarRequest(
        connection.accessToken,
        `/calendars/${encodeURIComponent(connection.calendarId)}`
      );
      return {
        ...connection,
        calendarName: calendar.summary || connection.calendarName || 'AGAPAY Learn',
        calendarTimeZone: calendar.timeZone || connection.calendarTimeZone || '',
      };
    } catch (error) {
      if ((error as { status?: number })?.status !== 404 && (error as { status?: number })?.status !== 410) throw error;
    }
  }

  const calendarDetails = await createAgapayCalendar(connection.accessToken, env);
  const updated = {
    ...connection,
    ...calendarDetails,
    calendarCreatedAt: new Date().toISOString(),
  };
  await saveConnection(env, householdId, updated);
  return updated;
}

async function upsertGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarPreviewEvent,
  index: number,
  env: CalendarEnv
) {
  const { syncKey, body } = googleEventFromPreview(event, index, env);
  const encodedCalendarId = encodeURIComponent(calendarId);
  const listParams = new URLSearchParams({
    privateExtendedProperty: `agapaySyncKey=${syncKey}`,
    maxResults: '1',
    singleEvents: 'true',
  });
  const existing = await googleCalendarRequest(
    accessToken,
    `/calendars/${encodedCalendarId}/events?${listParams.toString()}`
  );
  const existingEvent = existing.items?.[0];
  if (existingEvent?.id) {
    const updated = await googleCalendarRequest(
      accessToken,
      `/calendars/${encodedCalendarId}/events/${encodeURIComponent(existingEvent.id)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
    return { id: updated.id, title: event.title, status: 'updated' };
  }

  const inserted = await googleCalendarRequest(accessToken, `/calendars/${encodedCalendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { id: inserted.id, title: event.title, status: 'created' };
}

export async function googleCalendarStatus(request: Request, env: CalendarEnv = {}) {
  const baseUrl = publicBaseUrl(request, env);
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  const connection = await loadConnection(env, identity.householdId);
  return json({
    ok: true,
    configured: configured(env),
    connected: Boolean(connection?.refreshToken && connection?.calendarId),
    reconnectRequired: Boolean(connection?.refreshToken && !connection?.calendarId),
    provider: 'google-calendar',
    scope: CALENDAR_SCOPE,
    calendarId: connection?.calendarId || '',
    calendarName: connection?.calendarName || 'AGAPAY Learn',
    redirectUri: `${baseUrl}/api/learn/google-calendar/callback`,
    connectedAt: connection?.connectedAt || null,
    accountEmail: connection?.accountEmail || '',
    message: configured(env)
      ? 'Google Calendar OAuth is configured. Families can connect a calendar.'
      : 'Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to enable Google Calendar sync.',
  });
}

export async function googleCalendarConnect(request: Request, env: CalendarEnv = {}) {
  if (!configured(env)) {
    return json(
      {
        ok: false,
        configured: false,
        error: 'Google Calendar sync is not configured yet.',
        requiredEnv: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'AGAPAY_PUBLIC_URL'],
        setup: 'Create an OAuth client in Google Cloud, add the callback URL, then set these environment variables.',
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const baseUrl = publicBaseUrl(request, env);
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  const returnTo = url.searchParams.get('returnTo') || '/myagapay/learn/setup';
  const state = encodeState({ returnTo, householdId: identity.householdId });
  const authUrl = new URL(GOOGLE_AUTH_BASE_URL);
  authUrl.searchParams.set('client_id', env.GOOGLE_CALENDAR_CLIENT_ID as string);
  authUrl.searchParams.set('redirect_uri', `${baseUrl}/api/learn/google-calendar/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', CALENDAR_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  if (url.searchParams.get('format') !== 'json') {
    return Response.redirect(authUrl.toString(), 302);
  }

  return json({
    ok: true,
    configured: true,
    authUrl: authUrl.toString(),
  });
}

export async function googleCalendarCallback(request: Request, env: CalendarEnv = {}) {
  const url = new URL(request.url);
  let returnTo = '/myagapay/learn/setup';
  let householdId = '';
  try {
    const state = decodeState(url.searchParams.get('state'));
    returnTo = state.returnTo || returnTo;
    householdId = state.householdId || '';
  } catch {
    returnTo = '/myagapay/learn/setup';
  }
  if (!configured(env)) return googleRedirect(request, returnTo, 'error', 'not-configured');
  if (url.searchParams.get('error')) return googleRedirect(request, returnTo, 'error', url.searchParams.get('error'));
  const code = url.searchParams.get('code');
  if (!code || !householdId) return googleRedirect(request, returnTo, 'error', 'missing-code');

  try {
    const previous = await loadConnection(env, householdId);
    const tokens = await exchangeAuthorizationCode(request, env, code);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error('Google did not return an access token.');

    let calendarDetails: Pick<CalendarConnection, 'calendarId' | 'calendarName' | 'calendarTimeZone'> = {};
    if (previous?.calendarId) {
      try {
        const calendar = await googleCalendarRequest(
          accessToken,
          `/calendars/${encodeURIComponent(previous.calendarId)}`
        );
        calendarDetails = {
          calendarId: previous.calendarId,
          calendarName: calendar.summary || previous.calendarName || 'AGAPAY Learn',
          calendarTimeZone: calendar.timeZone || previous.calendarTimeZone || '',
        };
      } catch (error) {
        if (
          (error as { status?: number })?.status !== 404 &&
          (error as { status?: number })?.status !== 410 &&
          (error as { status?: number })?.status !== 403
        )
          throw error;
      }
    }

    if (!calendarDetails.calendarId) {
      calendarDetails = await createAgapayCalendar(accessToken, env);
    }

    await saveConnection(env, householdId, {
      accessToken,
      refreshToken: tokens.refresh_token || previous?.refreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000,
      scope: tokens.scope || CALENDAR_SCOPE,
      tokenType: tokens.token_type || 'Bearer',
      ...calendarDetails,
      calendarCreatedAt: previous?.calendarCreatedAt || new Date().toISOString(),
      connectedAt: previous?.connectedAt || new Date().toISOString(),
    });
    return googleRedirect(request, returnTo, 'connected');
  } catch (error) {
    return googleRedirect(request, returnTo, 'error', (error as Error).message || 'token-exchange-failed');
  }
}

export function googleCalendarPreview(repository: CalendarRepository, request: Request) {
  const { calendarType, events } = previewEvents(repository, request);

  return json({
    ok: true,
    connected: false,
    calendarType,
    events,
    eventCount: events.length,
  });
}

export async function googleCalendarSync(repository: CalendarRepository, request: Request, env: CalendarEnv = {}) {
  if (!configured(env)) {
    return json({ ok: false, error: 'Google Calendar sync is not configured yet.' }, { status: 503 });
  }

  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  let connection = await loadConnection(env, identity.householdId);
  if (!connection?.refreshToken) {
    return json(
      {
        ok: false,
        connected: false,
        error: 'Connect Google Calendar before syncing events.',
        connectUrl: `/api/learn/google-calendar/connect?returnTo=${encodeURIComponent(new URL(request.url).searchParams.get('returnTo') || '/myagapay/learn/setup')}`,
      },
      { status: 409 }
    );
  }

  connection = await refreshAccessToken(env, identity.householdId, connection);
  connection = await ensureAgapayCalendar(env, identity.householdId, connection);
  const body = (await request.json().catch(() => ({}))) as { extraEvents?: CalendarPreviewEvent[] };
  const extraEvents = Array.isArray(body?.extraEvents) ? body.extraEvents : [];
  const { calendarType, events } = previewEvents(repository, request, extraEvents);
  const results = [];
  for (const [index, event] of events.entries()) {
    results.push(
      await upsertGoogleEvent(connection.accessToken as string, connection.calendarId as string, event, index, env)
    );
  }

  return json({
    ok: true,
    connected: true,
    calendarType,
    calendarId: connection.calendarId,
    calendarName: connection.calendarName || 'AGAPAY Learn',
    syncedCount: results.length,
    createdCount: results.filter((event) => event.status === 'created').length,
    updatedCount: results.filter((event) => event.status === 'updated').length,
    results,
  });
}
