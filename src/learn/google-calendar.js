import { json } from "../lib/core.js";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

export function googleCalendarStatus(request, env = {}) {
  const baseUrl = publicBaseUrl(request, env);
  return json({
    ok: true,
    configured: configured(env),
    connected: false,
    provider: "google-calendar",
    scope: CALENDAR_SCOPE,
    redirectUri: `${baseUrl}/api/learn/google-calendar/callback`,
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
  const returnTo = url.searchParams.get("returnTo") || "/learn/onboarding";
  const state = encodeState({ returnTo });
  const authUrl = new URL(GOOGLE_AUTH_BASE_URL);
  authUrl.searchParams.set("client_id", env.GOOGLE_CALENDAR_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", `${baseUrl}/api/learn/google-calendar/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", CALENDAR_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return json({
    ok: true,
    configured: true,
    authUrl: authUrl.toString()
  });
}

export function googleCalendarCallback(request) {
  const url = new URL(request.url);
  let returnTo = "/learn/onboarding";
  try {
    const state = decodeState(url.searchParams.get("state"));
    returnTo = state.returnTo || returnTo;
  } catch {
    returnTo = "/learn/onboarding";
  }
  const redirectUrl = new URL(returnTo, url.origin);
  redirectUrl.searchParams.set("googleCalendar", url.searchParams.get("code") ? "connected" : "error");
  return Response.redirect(redirectUrl.toString(), 302);
}

export function googleCalendarPreview(repository, request) {
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

  return json({
    ok: true,
    connected: false,
    calendarType,
    events,
    eventCount: events.length
  });
}
