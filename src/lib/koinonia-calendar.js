import { validateSafeExternalUrl } from "./safe-external-url.js";

const KOINONIA_CALENDAR_MAX_BYTES = 2_000_000;
const GOOGLE_CALENDAR_HOSTS = new Set(["calendar.google.com", "www.google.com"]);

export function normalizeKoinoniaCalendarUrl(value, base = undefined) {
  const safeUrl = validateSafeExternalUrl(value, {
    base,
    invalidMessage: "Enter a valid public calendar iCal/ICS link.",
    unsafeMessage: "The calendar must use a public HTTPS address.",
  });
  const parsed = new URL(safeUrl);
  const calendarId = parsed.searchParams.get("cid")?.trim() || "";
  const isGoogleSubscriptionLink = GOOGLE_CALENDAR_HOSTS.has(parsed.hostname.toLowerCase())
    && parsed.pathname.startsWith("/calendar/")
    && !parsed.pathname.startsWith("/calendar/ical/")
    && calendarId;

  if (!isGoogleSubscriptionLink) return safeUrl;
  if (calendarId.length > 512 || /[\u0000-\u001f\u007f]/.test(calendarId)) {
    throw new Error("Enter a valid Google Calendar link.");
  }
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

async function readCalendarText(response) {
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > KOINONIA_CALENDAR_MAX_BYTES) throw new Error("Calendar too large");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > KOINONIA_CALENDAR_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Calendar too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchKoinoniaCalendarIcs(sourceUrl, fetcher = fetch) {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(8000)
    : undefined;
  const fetchUrl = async (url, redirects = 0) => {
    const safeUrl = normalizeKoinoniaCalendarUrl(url);
    const response = await fetcher(safeUrl, { headers:{ Accept:"text/calendar" }, redirect:"manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
      if (redirects >= 3) throw new Error("The calendar redirected too many times.");
      return fetchUrl(normalizeKoinoniaCalendarUrl(response.headers.get("location"), safeUrl), redirects + 1);
    }
    if (!response.ok) throw new Error("Calendar unavailable");
    const text = await readCalendarText(response);
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("The calendar link did not return an ICS calendar.");
    return text;
  };
  return fetchUrl(sourceUrl);
}
