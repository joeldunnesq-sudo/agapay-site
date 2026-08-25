import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUpcomingDirectoryMilestones } from "../src/directory/milestones.js";

const fromDate = new Date("2026-08-25T12:00:00Z");
const milestones = buildUpcomingDirectoryMilestones({
  birthdays: [
    { id: "p1", label: "Maria", source_date: "1988-08-25" },
    { id: "p2", label: "Nicholas", source_date: "1970-08-24" }
  ],
  anniversaries: [
    { id: "h1", label: "The Dunne Family", source_date: "2006-08-26" }
  ],
  namedays: [
    { id: "n1", label: "Anna", source_date: "09-01", saint_name: "St. Anna" }
  ]
}, { fromDate, days: 30 });

assert.deepEqual(milestones.map((item) => item.type), ["birthday", "anniversary", "nameday"]);
assert.equal(milestones[0].daysAway, 0, "today's birthday should be first");
assert.equal(milestones[1].years, 20, "anniversary year count should be derived without exposing it for birthdays");
assert.equal(milestones[2].detail, "St. Anna");
assert.ok(!milestones.some((item) => item.label === "Nicholas"), "a date that already passed should roll beyond the active window");

const todayOnly = buildUpcomingDirectoryMilestones({
  birthdays: [
    { id: "today", label: "Maria", source_date: "1988-08-25" },
    { id: "tomorrow", label: "Niko", source_date: "1988-08-26" }
  ]
}, { fromDate, days: 1 });
assert.deepEqual(todayOnly.map((item) => item.label), ["Maria"], "a one-day Koinonia window should surface only today's celebrations");

const monthVolume = buildUpcomingDirectoryMilestones({
  birthdays: Array.from({ length: 31 }, (_, index) => ({
    id: `month-${index + 1}`,
    label: `Member ${index + 1}`,
    source_date: `1980-08-${String(index + 1).padStart(2, "0")}`
  }))
}, { fromDate: new Date("2026-08-01T12:00:00Z"), days: 31 });
assert.equal(monthVolume.length, 31, "the Full Calendar month range should not inherit the compact Koinonia card limit");

const leapMilestone = buildUpcomingDirectoryMilestones({
  birthdays: [{ id: "leap", label: "Photini", source_date: "1992-02-29" }]
}, { fromDate: new Date("2027-02-27T12:00:00Z"), days: 2 });
assert.equal(leapMilestone[0].date, "2027-02-28", "leap-day birthdays should remain visible in non-leap years");

const [page, script, styles, calendarPage, donorApp, directory, privacy, selfService, handler, migration] = await Promise.all([
  readFile(new URL("../public/myagapay/parish-life.html", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8"),
  readFile(new URL("../public/donor/style.css", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/giving/calendar.html", import.meta.url), "utf8"),
  readFile(new URL("../public/donor/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/directory.html", import.meta.url), "utf8"),
  readFile(new URL("../src/directory/privacy.js", import.meta.url), "utf8"),
  readFile(new URL("../src/directory/self-service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/directory-member.js", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0104_directory_parish_milestones.sql", import.meta.url), "utf8")
]);

assert.match(page, /parishCalendarEventList[\s\S]*id="parishLifeMilestonesSection"[\s\S]*id="parishLifeMilestones"/, "milestones should sit directly below the synced calendar");
assert.match(page, />Parish Celebrations<\//, "the parish-facing heading should use warm celebration language");
assert.doesNotMatch(page, />Parish Milestones<\//, "the parish-facing heading should not use milestones language");
assert.match(script, /directory\/member\/milestones\?days=1/, "the Koinonia home page should request today only");
assert.match(script, /parish-life-continue-art[\s\S]*parish-life-continue-copy[\s\S]*parish-life-continue-play/, "album art should replace the old leading play control and play should replace Resume");
assert.doesNotMatch(script, /parish-life-continue-action">Resume/, "the old text Resume action should be removed");
assert.match(styles, /parish-life-liturgical-hero \.cal-today-title \{ padding-right: 82px; \}/, "the saint title should reserve the Church-date badge area");
assert.match(calendarPage, /cal-parish-month-key[\s\S]*Celebrations/, "the Full Calendar month legend should identify celebrations");
assert.match(donorApp, /donorCalendarCelebrationRequestPath[\s\S]*directory\/member\/milestones\?from=/, "the Full Calendar should request the complete navigable celebration range");
assert.match(donorApp, /donorParishCalendarCelebrationsOn[\s\S]*cal-parish-day-markers[\s\S]*celebration/, "the month grid should mark dates with celebrations");
assert.match(donorApp, /cal-parish-celebration[\s\S]*celebrations\.map\(donorParishCalendarCelebrationHtml\)/, "selecting a calendar date should reveal its celebration details");
assert.match(directory, /id="profileForm"[\s\S]*name="dateOfBirth"[\s\S]*name="birthdayVisibility"/);
assert.match(directory, /id="householdDetailsForm"[\s\S]*name="anniversaryDate"[\s\S]*name="anniversaryVisibility"/);
assert.match(directory, /id="adultAddForm"[\s\S]*name="dateOfBirth"/);
assert.match(directory, /id="childAddForm"[\s\S]*name="dateOfBirth"/);
assert.match(privacy, /adult_birthday[\s\S]*household_anniversary/);
assert.match(selfService, /anniversary_date[\s\S]*household_anniversary/);
assert.match(handler, /\/api\/directory\/member\/milestones[\s\S]*listDirectoryMilestones/);
assert.match(handler, /fromDate: milestoneFromDate\(url\.searchParams\.get\("from"\)\)/, "the calendar endpoint should accept a validated month-range start date");
assert.match(migration, /ALTER TABLE directory_households ADD COLUMN anniversary_date TEXT/);

console.log("Koinonia directory milestone checks passed.");
