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

const workerUtcCalendar = parseKoinoniaCalendarIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly-vigil
DTSTART;TZID=America/Chicago:20230128T170000
DTEND;TZID=America/Chicago:20230128T190000
RRULE:FREQ=WEEKLY;WKST=MO
EXDATE;TZID=America/Chicago:20260815T170000
SUMMARY:Vigil
END:VEVENT
BEGIN:VEVENT
UID:expired-great-canon
DTSTART;TZID=America/Chicago:20120227T183000
DTEND;TZID=America/Chicago:20120227T193000
RRULE:FREQ=DAILY;COUNT=4;INTERVAL=1
SUMMARY:Great Canon
END:VEVENT
END:VCALENDAR`, new Date("2026-08-08T19:00:00.000Z"));

assert.equal(workerUtcCalendar[0].title, "Vigil", "TZID recurrence times should survive the Worker's UTC runtime until their actual local start time");
assert.equal(workerUtcCalendar[0].startsAt, "2026-08-08T22:00:00.000Z", "5 PM America/Chicago should serialize as 10 PM UTC in August");
assert.equal(workerUtcCalendar.some(event => event.title === "Great Canon"), false, "COUNT-limited recurrences must not continue after their final instance");
assert.equal(workerUtcCalendar.some(event => event.startsAt === "2026-08-15T22:00:00.000Z"), false, "EXDATE should remove excluded recurring instances");

const transfigurationCalendar = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:transfiguration-liturgy
DTSTART;TZID=America/Chicago:20240819T090000
DTEND;TZID=America/Chicago:20240819T110000
RRULE:FREQ=YEARLY
SUMMARY:Liturgy for Transfiguration
END:VEVENT
END:VCALENDAR`;
const transfigurationBeforeStart = parseKoinoniaCalendarIcs(transfigurationCalendar, new Date("2026-08-19T13:00:00.000Z"));
assert.equal(transfigurationBeforeStart.length, 1, "yearly Google Calendar events should expand into the current festal year");
assert.equal(transfigurationBeforeStart[0].startsAt, "2026-08-19T14:00:00.000Z", "yearly TZID recurrences should preserve their local start time");
assert.equal(transfigurationBeforeStart[0].endsAt, "2026-08-19T16:00:00.000Z", "yearly TZID recurrences should preserve their duration");
const transfigurationInProgress = parseKoinoniaCalendarIcs(transfigurationCalendar, new Date("2026-08-19T14:10:00.000Z"));
assert.equal(transfigurationInProgress.length, 1, "an in-progress recurring service should remain visible until it ends");

const dashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
const parish = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const donorHandler = await readFile(new URL("../src/handlers/donor.js", import.meta.url), "utf8");
const life = await readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8");
const lifePage = await readFile(new URL("../public/myagapay/parish-life.html", import.meta.url), "utf8");
const donorApp = await readFile(new URL("../public/donor/app.js", import.meta.url), "utf8");
const donorCalendar = await readFile(new URL("../public/myagapay/giving/calendar.html", import.meta.url), "utf8");
const donorStyles = await readFile(new URL("../public/donor/style.css", import.meta.url), "utf8");

assert.match(dashboard, /data-koinonia-view="ministries"/);
assert.match(app, /Invite a My AGAPAY parishioner/);
assert.match(app, /ministry-people\?q=/);
assert.match(app, /Search by name or email/);
assert.doesNotMatch(dashboard, /Preview Koinonia/);
assert.match(app, /\/ministries\/' \+ encodeURIComponent\(ministryId\) \+ '\/participants'/);
assert.match(app, /participationType:'member', publish:true/, "parish dashboard ministry assignments should publish the private Directory badge");
assert.match(app, /Directory badge shown/);
assert.match(app, /setKoinoniaMinistryDirectoryBadge/);
assert.match(app, /participants-publication/);
assert.match(app, /approvedPublication:visible/);
assert.match(app, /Their ministry badge is now visible in the private parish directory/);
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
assert.match(life, /const calendarPromise = Promise\.all/);
assert.match(life, /await Promise\.all\(\[liturgicalDayPromise, calendarPromise, feedPromise, groupsPromise/);
assert.doesNotMatch(life, /const \[parishCalendar, sacramentRequests, signupCommitments\] = await Promise\.all/, "calendar sync must not block announcements, groups, or other Koinonia content");
assert.match(life, /request\.status === "scheduled"/);
assert.match(life, /\/api\/donor\/sacraments/);
assert.match(lifePage, /href="\/myagapay\/calendar">Full Calendar/);
assert.match(lifePage, />This Week in the Church<[\s\S]*data-calendar-default-view="week"/, "the Koinonia landing should own the week calendar");
assert.match(donorHandler, /normalizeKoinoniaCalendarUrl\(sourceUrl\)/);
assert.match(donorHandler, /loadPublishedCommerceCalendarEvents/);
assert.match(donorHandler, /\.\.\.parseKoinoniaCalendarIcs\(text\), \.\.\.commerceEvents/);
assert.match(donorHandler, /connected:false, internal:true, events:commerceEvents/);
assert.match(donorHandler, /connected:true, internal:true, subscriptionUrl, events:commerceEvents, unavailable:true/);
assert.match(donorHandler, /\.slice\(0, 180\)/);
assert.match(donorApp, /function donorApprovedSacramentEvents/);
assert.match(donorApp, /function renderDonorParishCalendar/);
assert.match(donorApp, /calendarAvailable = connected \|\| events\.length > 0/);
assert.match(donorApp, /event\.commerceKind === "meal"/);
assert.match(donorApp, /href="\$\{escapeHtml\(href\)\}"/);
assert.match(donorApp, /calendarDefaultView === "month" \? "month" : "week"/);
assert.match(donorApp, /hasSubscriptionControls[\s\S]*Events published by your parish for the selected week/, "the embedded week calendar should not advertise controls that only exist on the full page");
assert.match(donorApp, /function setDonorParishCalendarView/);
assert.match(donorApp, /function changeDonorParishCalendarPeriod/);
assert.match(donorApp, /function donorParishCalendarPlatform\(\)[\s\S]*?\/android\/i/);
assert.match(donorApp, /isAndroid \? \(googleUrl \|\| subscriptionUrl\) : subscriptionUrl\.replace\(\/\^https:\/i, "webcal:"\)/, "Android must use a supported HTTPS or Google Calendar URL instead of the unsupported webcal protocol");
assert.match(donorApp, /subscribeButton\.target = isAndroid \? "_blank" : ""/, "the Android flow should leave the installed app to complete calendar subscription");
assert.match(donorApp, /googleButton\.hidden = isAndroid \|\| !googleUrl/, "Android should not show a duplicate Google Calendar action");
assert.match(donorApp, /\/api\/donor\/parish-calendar/);
assert.match(donorCalendar, /Your Upcoming Services/);
assert.match(donorCalendar, /id="parishCalendarSubscribeButton"/);
assert.match(donorCalendar, /data-calendar-subscribe-label/);
assert.match(donorCalendar, /id="parishCalendarGoogleButton"/);
assert.match(donorCalendar, /id="parishCalendarCopyButton"/);
assert.match(donorCalendar, /data-calendar-default-view="month"/, "the full calendar should open in month view");
assert.doesNotMatch(donorCalendar, /id="parishCalendarWeekView"|id="parishCalendarMonthView"/, "the full calendar should remain month-only");
assert.match(donorCalendar, /id="calendarUpcomingFeast"/, "the full calendar should show the next feast before the annual timeline");
assert.match(donorCalendar, /<details class="cal-festal-year" id="calendarFestalYear">/, "the full festal year should be collapsed behind an accessible disclosure");
assert.match(donorApp, /const upcomingFeast = \[\.\.\.highlighted, \.\.\.highlightsForYear\(year \+ 1\)\]/, "the upcoming feast should roll into the next civil year when necessary");
assert.match(donorApp, /View the full \$\{year\} festal year/, "the feast disclosure should identify the full festal year");
assert.doesNotMatch(donorCalendar, /id="saintPreviewCard"|id="donorSaintModal"/, "the full calendar must not show the Saint of the Day card or modal");
assert.doesNotMatch(donorCalendar, /class="cal-metrics"|id="nextFeastDate"|id="paschaDate"|id="calendarShortName"/, "the full calendar must not show the Next Feast, Pascha, or Calendar summary cards");
assert.match(donorCalendar, /class="cal-hero calendar-liturgical-hero"/);
assert.match(donorCalendar, /id="todayCivilDateEyebrow"/);
assert.match(donorStyles, /\.donor-calendar-page \.calendar-liturgical-hero \.cal-today-row \{ display: block; \}/, "the full calendar hero should use the same single text column as Koinonia");
assert.match(donorStyles, /\.donor-calendar-page \.calendar-liturgical-hero \.cal-date-badge \{[\s\S]*?position: absolute;[\s\S]*?top: 0;[\s\S]*?right: 0;/, "the full calendar church date should use the compact top-right cutout");
assert.match(donorStyles, /\.donor-calendar-page \.calendar-liturgical-hero \.cal-today-title \{ font-size: 27px;/, "the full calendar saint title should stay compact even on long commemorations");

console.log("PASS - Koinonia ministries management, full parish calendar, and public ICS subscription are wired end to end");
