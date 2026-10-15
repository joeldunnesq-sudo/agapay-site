import type { DashboardRegistration } from '../handlers/parish-dashboard-handler.js';
export type SacramentCalendarEnvironment = Partial<Env> & {
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  AGAPAY_PUBLIC_URL?: string;
};
interface OAuthState {
  parishId: string;
  priestEmail: string;
  expiresAt: number;
}
interface CalendarConnection {
  scope?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  calendarId: string;
  calendarName?: string;
  events?: Record<string, string>;
  connectedAt?: string;
  lastSyncedAt?: string;
  lastError?: string;
}
interface GoogleResponse {
  id: string;
  summary?: string;
  error?: { message?: string };
  error_description?: string;
}
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error_description?: string;
}
export interface SacramentCalendarRequest {
  id: string;
  parish_id: string;
  clergy_assigned: string | null;
  status: string;
  confirmed_date: string | null;
  confirmed_time: string | null;
  other_type_label?: string | null;
  sacrament_type: string;
  participant_names: string | null;
  donor_email: string;
  phone?: string | null;
  location_address?: string | null;
  notes?: string | null;
}
type Priest = ReturnType<typeof normalizeSacramentPriests>[number];
import { hasModuleAccess } from '../lib/entitlements.js';
import {
  findRegistrationByParishId,
  getBearerToken,
  json,
  normalizeSacramentPriests,
  unauthorized,
  verifyParishDashboardBearer,
} from '../handlers/parish.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const KV_PREFIX = '__agapay_sacraments_google_calendar:';
const devConnections = new Map<string, CalendarConnection>();

const normalizeEmail = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();
const keyFor = (parishId: string, email: unknown) => `${KV_PREFIX}${parishId}:${normalizeEmail(email)}`;
const bytesToBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
const stringToBase64Url = (value: string) => bytesToBase64Url(new TextEncoder().encode(value));
const base64UrlToString = (value: unknown) => {
  const padded = `${String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')}${'==='.slice((String(value || '').length + 3) % 4)}`;
  return decodeURIComponent(
    Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  );
};

function configured(env: SacramentCalendarEnvironment) {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET!);
}

function baseUrl(request: Request, env: SacramentCalendarEnvironment) {
  const url = new URL(request.url);
  return env.AGAPAY_PUBLIC_URL || env.AGAPAY_APP_URL || `${url.protocol}//${url.host}`;
}

async function signState(env: SacramentCalendarEnvironment, payload: OAuthState) {
  const body = stringToBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.GOOGLE_CALENDAR_CLIENT_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `sac.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function readState(env: SacramentCalendarEnvironment, value: unknown) {
  const [prefix, body, signature] = String(value || '').split('.');
  if (prefix !== 'sac' || !body || !signature) throw new Error('Invalid OAuth state.');
  const expected = await signState(env, JSON.parse(base64UrlToString(body)));
  if (expected !== `sac.${body}.${signature}`) throw new Error('Invalid OAuth state.');
  const payload = JSON.parse(base64UrlToString(body)) as OAuthState;
  if (Number(payload.expiresAt || 0) < Date.now()) throw new Error('OAuth state expired.');
  return payload;
}

async function loadConnection(env: SacramentCalendarEnvironment, parishId: string, email: unknown) {
  const key = keyFor(parishId, email);
  if (!env.AGAPAY_REGISTRATIONS) return devConnections.get(key) || null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(key);
  try {
    return raw ? (JSON.parse(raw) as CalendarConnection) : null;
  } catch {
    return null;
  }
}

async function saveConnection(
  env: SacramentCalendarEnvironment,
  parishId: string,
  email: unknown,
  connection: CalendarConnection
) {
  const key = keyFor(parishId, email);
  const value = { ...connection, parishId, priestEmail: normalizeEmail(email), updatedAt: new Date().toISOString() };
  if (!env.AGAPAY_REGISTRATIONS) {
    devConnections.set(key, value);
    return;
  }
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify(value));
}

async function deleteConnection(env: SacramentCalendarEnvironment, parishId: string, email: unknown) {
  const key = keyFor(parishId, email);
  if (!env.AGAPAY_REGISTRATIONS) {
    devConnections.delete(key);
    return;
  }
  await env.AGAPAY_REGISTRATIONS.delete(key);
}

async function googleRequest(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = (await response.json().catch(() => ({}))) as GoogleResponse;
  if (!response.ok) {
    const error = new Error(data.error?.message || data.error_description || 'Google Calendar request failed.');
    (error as Error & { status: number }).status = response.status;
    throw error;
  }
  return data;
}

async function refreshAccessToken(
  env: SacramentCalendarEnvironment,
  parishId: string,
  email: unknown,
  connection: CalendarConnection | null
) {
  if (connection?.accessToken && Number(connection.expiresAt || 0) > Date.now() + 90_000) return connection;
  if (!connection?.refreshToken) throw new Error('Reconnect Google Calendar for this priest.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: connection.refreshToken,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok)
    throw new Error(data.error_description || 'Google Calendar connection expired. Reconnect this priest.');
  const updated = {
    ...connection,
    accessToken: (data as GoogleResponse & TokenResponse).access_token,
    expiresAt:
      Date.now() + Math.max(60, Number((data as GoogleResponse & TokenResponse).expires_in || 3600) - 60) * 1000,
  };
  await saveConnection(env, parishId, email, updated);
  return updated;
}

async function requireParish(request: Request, env: SacramentCalendarEnvironment, parishId: string) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found?.registration) return { response: json({ error: 'Parish not found.' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request))))
    return { response: unauthorized() };
  if (!hasModuleAccess(found.registration, 'sacraments'))
    return {
      response: json(
        { error: 'Sacraments calendar connections require the Sacraments add-on or Parish.' },
        { status: 403 }
      ),
    };
  return { registration: found.registration };
}

function configuredPriest(registration: DashboardRegistration, email: unknown) {
  return normalizeSacramentPriests(registration).find(
    (priest) => normalizeEmail(priest.email) === normalizeEmail(email)
  );
}

export async function handleSacramentsGoogleStatus(
  request: Request,
  env: SacramentCalendarEnvironment,
  parishId: string
) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const ctx = await requireParish(request, env, parishId);
  if (ctx.response) return ctx.response;
  const priests = normalizeSacramentPriests(ctx.registration);
  const connections = await Promise.all(
    priests.map(async (priest) => {
      const connection = priest.email ? await loadConnection(env, parishId, priest.email) : null;
      return {
        name: priest.name,
        email: priest.email || '',
        connected: Boolean(connection?.refreshToken && connection?.calendarId),
        calendarName: connection?.calendarName || '',
        connectedAt: connection?.connectedAt || null,
        lastSyncedAt: connection?.lastSyncedAt || null,
        lastError: connection?.lastError || '',
      };
    })
  );
  return json({ ok: true, configured: configured(env), connections });
}

export async function handleSacramentsGoogleConnect(
  request: Request,
  env: SacramentCalendarEnvironment,
  parishId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!configured(env)) return json({ error: 'Google Calendar sync is not configured.' }, { status: 503 });
  const ctx = await requireParish(request, env, parishId);
  if (ctx.response) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as { priestEmail?: unknown };
  const priest = configuredPriest(ctx.registration, body.priestEmail);
  if (!priest?.email)
    return json(
      { error: 'Add an email address for this priest in Settings before connecting Google Calendar.' },
      { status: 422 }
    );
  // Reuse AGAPAY Learn's already-registered Google OAuth callback URI. The
  // signed `sac.` state prefix lets the Worker dispatch the callback safely.
  const callback = `${baseUrl(request, env)}/api/learn/google-calendar/callback`;
  const state = await signState(env, {
    parishId,
    priestEmail: normalizeEmail(priest.email),
    expiresAt: Date.now() + 10 * 60_000,
  });
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', env.GOOGLE_CALENDAR_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', callback);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', CALENDAR_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  return json({ ok: true, authUrl: authUrl.toString() });
}

export async function handleSacramentsGoogleCallback(request: Request, env: SacramentCalendarEnvironment) {
  const url = new URL(request.url);
  const redirect = (status: string, message: string | null = '') => {
    const target = new URL('/parish/dashboard', baseUrl(request, env));
    target.searchParams.set('googleCalendar', status);
    if (message) target.searchParams.set('message', message.slice(0, 160));
    return Response.redirect(target.toString(), 302);
  };
  if (!configured(env)) return redirect('error', 'Google Calendar is not configured.');
  try {
    const state = await readState(env, url.searchParams.get('state'));
    if (url.searchParams.get('error')) return redirect('error', url.searchParams.get('error'));
    const found = await findRegistrationByParishId(env, state.parishId);
    const priest = found?.registration ? configuredPriest(found.registration, state.priestEmail) : null;
    if (!priest) throw new Error('That priest is no longer configured for this parish.');
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code') || '',
        client_id: env.GOOGLE_CALENDAR_CLIENT_ID!,
        client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
        redirect_uri: `${baseUrl(request, env)}/api/learn/google-calendar/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !tokens.access_token)
      throw new Error(tokens.error_description || 'Google authorization failed.');
    const previous = await loadConnection(env, state.parishId, priest.email);
    const timeZone = found!.registration.timezone || 'America/Chicago';
    const calendar = await googleRequest(tokens.access_token, '/calendars', {
      method: 'POST',
      body: JSON.stringify({
        summary: `AGAPAY Sacraments — ${priest.name}`,
        description: `Sacraments and pastoral services assigned to ${priest.name} through AGAPAY.`,
        timeZone,
      }),
    });
    await saveConnection(env, state.parishId, priest.email, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previous?.refreshToken || '',
      expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000,
      scope: tokens.scope || CALENDAR_SCOPE,
      calendarId: calendar.id,
      calendarName: calendar.summary || `AGAPAY Sacraments — ${priest.name}`,
      events: previous?.events || {},
      connectedAt: new Date().toISOString(),
    });
    return redirect('connected');
  } catch (error) {
    return redirect('error', (error as Error).message || 'Google Calendar connection failed.');
  }
}

export async function handleSacramentsGoogleDisconnect(
  request: Request,
  env: SacramentCalendarEnvironment,
  parishId: string
) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const ctx = await requireParish(request, env, parishId);
  if (ctx.response) return ctx.response;
  const body = (await request.json().catch(() => ({}))) as { priestEmail?: unknown };
  const priest = configuredPriest(ctx.registration, body.priestEmail);
  if (!priest?.email) return json({ error: 'Priest not found.' }, { status: 404 });
  await deleteConnection(env, parishId, priest.email);
  return json({ ok: true });
}

function parseTime(value: unknown) {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) match = raw.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return { hour: 9, minute: 0 };
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = String(match[3] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
}

function eventBody(row: SacramentCalendarRequest, registration: DashboardRegistration) {
  const { hour, minute } = parseTime(row.confirmed_time);
  const date = row.confirmed_date;
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const end = new Date(start.getTime() + 60 * 60_000);
  const local = (value: Date) =>
    `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}T${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}:00`;
  const type = String(row.other_type_label || row.sacrament_type || 'Pastoral service').replace(/_/g, ' ');
  return {
    summary: `${type.replace(/\b\w/g, (char) => char.toUpperCase())} — ${row.participant_names || row.donor_email}`,
    description: [
      `AGAPAY Sacraments request`,
      `Parishioner: ${row.participant_names || row.donor_email}`,
      row.phone ? `Phone: ${row.phone}` : '',
      `Email: ${row.donor_email}`,
      row.location_address ? `Location: ${row.location_address}` : '',
      row.notes ? `Request notes: ${row.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    location: row.location_address || '',
    start: { dateTime: local(start), timeZone: registration.timezone || 'America/Chicago' },
    end: { dateTime: local(end), timeZone: registration.timezone || 'America/Chicago' },
    extendedProperties: { private: { agapaySource: 'sacraments', agapayRequestId: row.id } },
  };
}

async function removeEvent(
  env: SacramentCalendarEnvironment,
  registration: DashboardRegistration,
  priest: Priest,
  requestId: string
) {
  let connection = await loadConnection(env, (registration.parishId || registration.id) as string, priest.email);
  if (!connection?.refreshToken || !connection?.calendarId || !connection.events?.[requestId])
    return { status: 'not_connected' };
  connection = await refreshAccessToken(
    env,
    (registration.parishId || registration.id) as string,
    priest.email,
    connection
  );
  const eventId = connection.events![requestId];
  try {
    await googleRequest(
      connection.accessToken,
      `/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    if (![404, 410].includes((error as Error & { status: number }).status)) throw error;
  }
  const events = { ...(connection.events || {}) };
  delete events[requestId];
  await saveConnection(env, (registration.parishId || registration.id) as string, priest.email, {
    ...connection,
    events,
    lastSyncedAt: new Date().toISOString(),
    lastError: '',
  });
  return { status: 'removed' };
}

async function upsertEvent(
  env: SacramentCalendarEnvironment,
  registration: DashboardRegistration,
  priest: Priest,
  row: SacramentCalendarRequest
) {
  const parishId = (registration.parishId || registration.id) as string;
  let connection = await loadConnection(env, parishId, priest.email);
  if (!connection?.refreshToken || !connection?.calendarId) return { status: 'not_connected' };
  connection = await refreshAccessToken(env, parishId, priest.email, connection);
  const existingId = connection.events?.[row.id];
  const path = `/calendars/${encodeURIComponent(connection.calendarId)}/events${existingId ? `/${encodeURIComponent(existingId)}` : ''}`;
  const event = await googleRequest(connection.accessToken, path, {
    method: existingId ? 'PATCH' : 'POST',
    body: JSON.stringify(eventBody(row, registration)),
  });
  await saveConnection(env, parishId, priest.email, {
    ...connection,
    events: { ...(connection.events || {}), [row.id]: event.id },
    lastSyncedAt: new Date().toISOString(),
    lastError: '',
  });
  return { status: existingId ? 'updated' : 'created', calendarName: connection.calendarName };
}

export async function syncSacramentRequestToGoogleCalendar(
  env: SacramentCalendarEnvironment,
  registration: DashboardRegistration,
  row: SacramentCalendarRequest,
  previousRow: SacramentCalendarRequest | null = null
) {
  const priests = normalizeSacramentPriests(registration);
  const previousPriest = priests.find((priest) => priest.name === previousRow?.clergy_assigned && priest.email);
  const nextPriest = priests.find((priest) => priest.name === row?.clergy_assigned && priest.email);
  const parishRegistration = { ...registration, parishId: row.parish_id };
  try {
    if (previousPriest && (!nextPriest || nextPriest.email !== previousPriest.email || row.status !== 'scheduled')) {
      await removeEvent(env, parishRegistration, previousPriest, row.id);
    }
    if (row.status === 'scheduled' && row.confirmed_date && nextPriest)
      return await upsertEvent(env, parishRegistration, nextPriest, row);
    return { status: nextPriest ? 'not_scheduled' : 'priest_not_connected' };
  } catch (error) {
    if (nextPriest) {
      const connection = await loadConnection(env, row.parish_id, nextPriest.email);
      if (connection)
        await saveConnection(env, row.parish_id, nextPriest.email, {
          ...connection,
          lastError: (error as Error).message || 'Sync failed',
        }).catch(() => {});
    }
    return { status: 'error', error: (error as Error).message || 'Google Calendar sync failed.' };
  }
}
