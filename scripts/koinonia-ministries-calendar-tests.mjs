import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseKoinoniaCalendarIcs } from "../src/handlers/donor.js";

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
assert.ok(recurring.filter(event => event.title === "Divine Liturgy").length > 4, "weekly Google Calendar events should expand into upcoming instances");

const dashboard = await readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/parish/app.js", import.meta.url), "utf8");
const parish = await readFile(new URL("../src/handlers/parish.js", import.meta.url), "utf8");
const life = await readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8");

assert.match(dashboard, /data-koinonia-view="ministries"/);
assert.match(app, /Invite a My AGAPAY parishioner/);
assert.doesNotMatch(dashboard, /Preview Koinonia/);
assert.match(app, /\/ministries\/' \+ encodeURIComponent\(ministryId\) \+ '\/participants'/);
assert.match(app, /reviews\/ministry_interest/);
assert.match(parish, /Paste a public Google Calendar iCal link ending in \.ics\./);
assert.match(life, /\/api\/donor\/parish-calendar/);

console.log("PASS - Koinonia ministries management and Google Calendar sync are wired end to end");
