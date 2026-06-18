import { json } from "../lib/core.js";
import { learnSetupIdentity } from "./setup-persistence.js";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CONNECTION_KV_PREFIX = "__agapay_learn_google_calendar:";
const devConnections = new Map();

function encodeState(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeState(value) {
  const padded = `${String(value || "").replace(/-/g, "+").replace(/_/g, "/")}${"===".slice((String(value || "").length + 3) % 4)}`;
  return JSON.parse(atob(padded));
}

function publicBaseUrl(request, env = {}) {
  const url = new URL(request.url);
  return env.AGAPAY_PUBLIC_URL || `${url.protocol}//${url.host}`;
}

function configured(env = {}) {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

function connectionKey(householdId) {
  return `${GOOGLE_CONNECTION_KV_PREFIX}${householdId}`;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadConnection(env = {}, householdId = "") {
  if (!householdId) return null;
  if (!env.AGAPAY_REGISTRATIONS) return devConnections.get(householdId) || null;
  return parseJson(await env.AGAPAY_REGISTRATIONS.get(connectionKey(householdId)));
}

async function saveConnection(env = {}, householdId = "", connection = {}) {
  if (!householdId) return;
  const stored = {
    ...connection,
    householdId,
    updatedAt: new Date().toISOString()
  };
  if (!env.AGAPAY_REGISTRATIONS) {
    devConnections.set(householdId, stored);
    return;
  }
  await env.AGAPAY_REGISTRATIONS.put(connectionKey(householdId), JSON.stringify(stored));
}

function googleRedirect(request, returnTo, status, message = "") {
  const url = new URL(request.url);
  const redirectUrl = new URL(returnTo || "/learn/onboarding", url.origin);
  redirectUrl.searchParams.set("googleCalendar", status);
  if (message) redirectUrl.searchParams.set("message", message);
  return Response.redirect(redirectUrl.toString(), 302);
}

async function exchangeAuthorizationCode(request, env, code) {
  const baseUrl = publicBaseUrl(request, env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      redirect_uri: `${baseUrl}/api/learn/google-calendar/callback`,
      grant_type: "authorization_code"
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google OAuth token exchange failed.");
  }
  return payload;
}

async function refreshAccessToken(env, householdId, connection) {
  if (!connection?.refreshToken) return connection;
  if (connection.accessToken && Number(connection.expiresAt || 0) > Date.now() + 90_000) return connection;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: connection.refreshToken,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google Calendar connection expired. Please reconnect Google Calendar.");
  }

  const updated = {
    ...connection,
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
    scope: payload.scope || connection.scope || CALENDAR_SCOPE
  };
  await saveConnection(env, householdId, updated);
  return updated;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

function previewEvents(repository, request) {
  const url = new URL(request.url);
  const calendarType = url.searchParams.get("calendar") || "julian";
  const planner = repository.getPlanner({ calendarType, view: "week" });
  const events = [
    ...planner.week.liturgicalDays
      .filter((day) => day.feastRank !== "Daily Rhythm")
      .map((day) => ({
        type: "feast",
        title: day.feastTitle,
        date: day.civilDate,
        allDay: true,
        description: `${day.fastingRule} - ${day.saints.join(", ")}`
      })),
    ...planner.week.householdRows.slice(0, 4).map((row, index) => ({
      type: "lesson",
      title: row.title,
      date: planner.week.dates[index] || planner.week.dates[0],
      allDay: false,
      durationMinutes: row.minutes[index] || 20,
      description: row.subtitle
    }))
  ];
  return { calendarType, events };
}

function googleEventFromPreview(event, index, env = {}) {
  const timeZone = env.AGAPAY_LEARN_TIME_ZONE || env.TZ || "America/Chicago";
  const syncKey = `agapay-learn-${slug(event.type)}-${event.date}-${slug(event.title)}-${index}`;
  const base = {
    summary: `AGAPAY Learn: ${event.title}`,
    description: [
      event.description || "",
      "",
      "Created by AGAPAY Learn.",
      `Sync key: ${syncKey}`
    ].join("\n").trim(),
    extendedProperties: {
      private: {
        agapaySyncKey: syncKey,
        agapaySource: "learn"
      }
    }
  };

  if (event.allDay) {
    return {
      syncKey,
      body: {
        ...base,
        start: { date: event.date },
        end: { date: addDays(event.date, 1) }
      }
    };
  }

  const startHour = 9 + Math.min(index, 6);
  const start = `${event.date}T${String(startHour).padStart(2, "0")}:00:00`;
  const endDate = new Date(`${event.date}T${String(startHour).padStart(2, "0")}:00:00`);
  endDate.setMinutes(endDate.getMinutes() + Math.max(15, Number(event.durationMinutes || 30)));
  const end = `${event.date}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;

  return {
    syncKey,
    body: {
      ...base,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone }
    }
  };
}

async function googleCalendarRequest(accessToken, path, init = {}) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error_description || payload.error || "Google Calendar request failed.");
  }
  return payload;
}

async function upsertGoogleEvent(accessToken, event, index, env) {
  const { syncKey, body } = googleEventFromPreview(event, index, env);
  const listParams = new URLSearchParams({
    privateExtendedProperty: `agapaySyncKey=${syncKey}`,
    maxResults: "1",
    singleEvents: "true"
  });
  const existing = await googleCalendarRequest(accessToken, `/calendars/primary/events?${listParams.toString()}`);
  const existingEvent = existing.items?.[0];
  if (existingEvent?.id) {
    const updated = await googleCalendarRequest(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(existingEvent.id)}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
    return { id: updated.id, title: event.title, status: "updated" };
  }

  const inserted = await googleCalendarRequest(
    accessToken,
    "/calendars/primary/events",
    { method: "POST", body: JSON.stringify(body) }
  );
  return { id: inserted.id, title: event.title, status: "created" };
}

export async function googleCalendarStatus(request, env = {}) {
  const baseUrl = publicBaseUrl(request, env);
  const identity = learnSetupIdentity(request);
  const connection = await loadConnection(env, identity.householdId);
  return json({
    ok: true,
    configured: configured(env),
    connected: Boolean(connection?.refreshToken),
    provider: "google-calendar",
    scope: CALENDAR_SCOPE,
    redirectUri: `${baseUrl}/api/learn/google-calendar/callback`,
    connectedAt: connection?.connectedAt || null,
    accountEmail: connection?.accountEmail || "",
    message: configured(env)
      ? "Google Calendar OAuth is configured. Families can connect a calendar."
      : "Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to enable Google Calendar sync."
  });
}

export function googleCalendarConnect(request, env = {}) {
  if (!configured(env)) {
    return json({
      ok: false,
      configured: false,
      error: "Google Calendar sync is not configured yet.",
      requiredEnv: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "AGAPAY_PUBLIC_URL"],
      setup: "Create an OAuth client in Google Cloud, add the callback URL, then set these environment variables."
    }, { status: 503 });
  }

  const url = new URL(request.url);
  const baseUrl = publicBaseUrl(request, env);
  const identity = learnSetupIdentity(request);
  const returnTo = url.searchParams.get("returnTo") || "/learn/onboarding";
  const state = encodeState({ returnTo, householdId: identity.householdId });
  const authUrl = new URL(GOOGLE_AUTH_BASE_URL);
  authUrl.searchParams.set("client_id", env.GOOGLE_CALENDAR_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", `${baseUrl}/api/learn/google-calendar/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", CALENDAR_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  if (url.searchParams.get("format") !== "json") {
    return Response.redirect(authUrl.toString(), 302);
  }

  return json({
    ok: true,
    configured: true,
    authUrl: authUrl.toString()
  });
}

export async function googleCalendarCallback(request, env = {}) {
  const url = new URL(request.url);
  let returnTo = "/learn/onboarding";
  let householdId = "";
  try {
    const state = decodeState(url.searchParams.get("state"));
    returnTo = state.returnTo || returnTo;
    householdId = state.householdId || "";
  } catch {
    returnTo = "/learn/onboarding";
  }
  if (!configured(env)) return googleRedirect(request, returnTo, "error", "not-configured");
  if (url.searchParams.get("error")) return googleRedirect(request, returnTo, "error", url.searchParams.get("error"));
  const code = url.searchParams.get("code");
  if (!code || !householdId) return googleRedirect(request, returnTo, "error", "missing-code");

  try {
    const previous = await loadConnection(env, householdId);
    const tokens = await exchangeAuthorizationCode(request, env, code);
    await saveConnection(env, householdId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previous?.refreshToken || "",
      expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000,
      scope: tokens.scope || CALENDAR_SCOPE,
      tokenType: tokens.token_type || "Bearer",
      connectedAt: previous?.connectedAt || new Date().toISOString()
    });
    return googleRedirect(request, returnTo, "connected");
  } catch (error) {
    return googleRedirect(request, returnTo, "error", error.message || "token-exchange-failed");
  }
}

export function googleCalendarPreview(repository, request) {
  const { calendarType, events } = previewEvents(repository, request);

  return json({
    ok: true,
    connected: false,
    calendarType,
    events,
    eventCount: events.length
  });
}

export async function googleCalendarSync(repository, request, env = {}) {
  if (!configured(env)) {
    return json({ ok: false, error: "Google Calendar sync is not configured yet." }, { status: 503 });
  }

  const identity = learnSetupIdentity(request);
  let connection = await loadConnection(env, identity.householdId);
  if (!connection?.refreshToken) {
    return json({
      ok: false,
      connected: false,
      error: "Connect Google Calendar before syncing events.",
      connectUrl: `/api/learn/google-calendar/connect?returnTo=${encodeURIComponent(new URL(request.url).searchParams.get("returnTo") || "/learn/onboarding")}`
    }, { status: 409 });
  }

  connection = await refreshAccessToken(env, identity.householdId, connection);
  const { calendarType, events } = previewEvents(repository, request);
  const results = [];
  for (const [index, event] of events.entries()) {
    results.push(await upsertGoogleEvent(connection.accessToken, event, index, env));
  }

  return json({
    ok: true,
    connected: true,
    calendarType,
    syncedCount: results.length,
    createdCount: results.filter((event) => event.status === "created").length,
    updatedCount: results.filter((event) => event.status === "updated").length,
    results
  });
}
