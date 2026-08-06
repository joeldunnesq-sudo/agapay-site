import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseKoinoniaCalendarIcs } from "../src/handlers/donor.js";
import { fetchKoinoniaCalendarIcs, normalizeKoinoniaCalendarUrl } from "../src/lib/koinonia-calendar.js";
import { validateParishBlogUrl } from "../src/handlers/parish-blog.js";
import { validateSafeExternalUrl } from "../src/lib/safe-external-url.js";

const validIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:non-google-calendar
DTSTART:20260802T090000
SUMMARY:Parish Feast
END:VEVENT
END:VCALENDAR`;

const googleShareUrl = "https://calendar.google.com/calendar/u/0/r?cid=l157ukqb5alh2mvfccdosnkvdo@group.calendar.google.com&pli=1";
const googleIcsUrl = "https://calendar.google.com/calendar/ical/l157ukqb5alh2mvfccdosnkvdo%40group.calendar.google.com/public/basic.ics";
assert.equal(normalizeKoinoniaCalendarUrl(googleShareUrl), googleIcsUrl, "Google Calendar subscription pages should normalize to their public ICS feed");

let googleRequest;
assert.equal(await fetchKoinoniaCalendarIcs(googleShareUrl, async (url, options) => {
  googleRequest = { url, options };
  return new Response(validIcs, { headers: { "content-type": "text/calendar" } });
}), validIcs);
assert.equal(googleRequest.url, googleIcsUrl, "calendar fetches should use the normalized Google ICS URL");

let nonGoogleRequest;
assert.equal(await fetchKoinoniaCalendarIcs("https://calendar.parish.example/events", async (url, options) => {
  nonGoogleRequest = { url, options };
  return new Response(validIcs, { headers: { "content-type": "text/calendar" } });
}), validIcs, "a non-Google public HTTPS ICS feed should be accepted without an .ics extension");
assert.equal(nonGoogleRequest.url, "https://calendar.parish.example/events");
assert.equal(nonGoogleRequest.options.redirect, "manual", "calendar redirects must never be followed automatically");

for (const unsafeUrl of [
  "https://10.0.0.1/calendar",
  "https://172.16.0.1/calendar",
  "https://192.168.1.10/calendar",
  "https://169.254.169.254/latest/meta-data",
  "https://calendar.internal/feed",
  "https://[::1]/feed",
  "https://user:password@calendar.parish.example/feed",
]) {
  assert.throws(() => validateSafeExternalUrl(unsafeUrl), /public HTTPS/);
  assert.throws(() => validateParishBlogUrl(unsafeUrl), /public HTTPS/);
  await assert.rejects(() => fetchKoinoniaCalendarIcs(unsafeUrl, async () => {
    throw new Error("unsafe calendar URLs must be rejected before fetch");
  }), /public HTTPS/);
}

await assert.rejects(() => fetchKoinoniaCalendarIcs("https://calendar.parish.example/feed", async () => new Response(null, {
  status: 302,
  headers: { location: "https://169.254.169.254/latest/meta-data" },
})), /public HTTPS/, "a redirect to an unsafe destination must be rejected");

await assert.rejects(() => fetchKoinoniaCalendarIcs("https://calendar.parish.example/not-a-calendar.ics", async () => new Response("<html>Not a calendar</html>")), /did not return an ICS calendar/, "an .ics suffix must not substitute for response-content validation");

const recurring = parseKoinoniaCalendarIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:liturgy-weekly
DTSTART:20260802T090000
DTEND:20260802T103000
RRULE:FREQ=WEEKLY;BYDAY=SU
SUMMARY:Divine Liturgy
LOCATION:Saint Fiacre Church
END:VEVENT
BEGIN:VEVENT
UID:vespers
DTSTART:20260801T170000
SUMMARY:Great Vespers
END:VEVENT
END:VCALENDAR`, new Date("2026-08-01T12:00:00"));

assert.equal(recurring[0].title, "Great Vespers");
assert.equal(recurring[1].title, "Divine Liturgy");
assert.equal(recurring[1].location, "Saint Fiacre Church");
assert.ok(recurring.filter(event => event.title === "Divine Liturgy").length > 4, "weekly calendar events should expand into upcoming instances");

const dashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
const parish = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const life = await readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8");
const donorApp = await readFile(new URL("../public/donor/app.js", import.meta.url), "utf8");
const donorCalendar = await readFile(new URL("../public/myagapay/giving/calendar.html", import.meta.url), "utf8");

assert.match(dashboard, /data-koinonia-view="ministries"/);
assert.match(app, /Invite a My AGAPAY parishioner/);
assert.match(app, /ministry-people\?q=/);
assert.match(app, /Search by name or email/);
assert.doesNotMatch(dashboard, /Preview Koinonia/);
assert.match(app, /\/ministries\/' \+ encodeURIComponent\(ministryId\) \+ '\/participants'/);
assert.match(app, /reviews\/ministry_interest/);
assert.match(app, /toggleKoinoniaMinistryEditor/);
assert.match(app, /updateKoinoniaMinistry\(event/);
assert.match(app, /method:'PATCH'[\s\S]*Unable to update this ministry/);
assert.match(app, />Subtitle<textarea name="shortDescription"/);
assert.match(app, />Full description<textarea name="detailedDescription"/);
assert.match(app, />Group photo</);
assert.match(parish, /normalizeKoinoniaCalendarUrl\(value/);
assert.match(parish, /await fetchKoinoniaCalendarIcs\(normalizedKoinoniaCalendarUrl\)/);
assert.doesNotMatch(parish, /host !== "calendar\.google\.com"/);
assert.match(dashboard, /Google Calendar, Squarespace, Wix, and most calendar platforms/);
assert.match(dashboard, /Public calendar \(iCal\/ICS\) link/);
assert.match(life, /\/api\/donor\/parish-calendar/);
assert.match(life, /request\.status === "scheduled"/);
assert.match(life, /\/api\/donor\/sacraments/);
assert.match(donorApp, /function donorApprovedSacramentEvents/);
assert.match(donorCalendar, /Your Upcoming Services/);

console.log("PASS - Koinonia ministries management and universal public ICS calendar sync are wired end to end");
