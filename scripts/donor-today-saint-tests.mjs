import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  enrichLiturgicalDayWithOrthocal,
  orthocalReadingAppointments,
  orthocalSaintStories
} from "../src/learn/readings-source.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const orthocalDay = {
  summary_title: "Great Prince Vladimir, Equal-to-the-Apostles, Enlightener of the Lands of Rus",
  saints: ["Holy Martyrs Cyricus and His Mother Julitta (304)"],
  stories: [
    {
      title: "Holy Equal-to-the-Apostles Great Prince Vladimir (in holy baptism Basil), enlightener of the Russian Land (1051)",
      story: "<p>The life of Prince Vladimir.</p>"
    },
    {
      title: "Holy Martyrs Cyricus and His Mother Julitta (304)",
      story: "<p>The lives of Cyricus and Julitta.</p>"
    }
  ]
};

const stories = orthocalSaintStories(orthocalDay);
assert.equal(stories[0].primary, true);
assert.equal(stories[0].name, orthocalDay.summary_title);
assert.match(stories[0].storyText, /Prince Vladimir/);

const enriched = await enrichLiturgicalDayWithOrthocal(
  { feastTitle: "", saints: [], saintStories: [] },
  {
    calendarType: "julian",
    civilDate: "2026-07-28",
    fetcher: async () => ({ ok: true, json: async () => orthocalDay })
  }
);
assert.equal(enriched.feastTitle, orthocalDay.summary_title);
assert.equal(enriched.primarySaintTitle, orthocalDay.summary_title);
assert.equal(enriched.saintStories[0].name, enriched.feastTitle);

const tikhonDay = {
  summary_title: "Leavetaking of Transfiguration",
  saints: ["St Tikhon of Zadonsk (1783)"],
  readings: [
    { source: "epistle", display: "2 Corinthians 9:12-10:7", description: "" },
    { source: "epistle", display: "Hebrews 7:26-8:2", description: "St Tikhon" },
    { source: "gospel", display: "Mark 3:19-27", description: "" },
    { source: "gospel", display: "Matthew 5:14-19", description: "St Tikhon" }
  ]
};
const appointments = orthocalReadingAppointments(tikhonDay);
assert.deepEqual(appointments.map(({ type, ref, appointment }) => ({ type, ref, appointment })), [
  { type: "epistle", ref: "2 Corinthians 9:12-10:7", appointment: "" },
  { type: "epistle", ref: "Hebrews 7:26-8:2", appointment: "St Tikhon" },
  { type: "gospel", ref: "Mark 3:19-27", appointment: "" },
  { type: "gospel", ref: "Matthew 5:14-19", appointment: "St Tikhon" }
]);

const tikhonEnriched = await enrichLiturgicalDayWithOrthocal(
  { feastTitle: "", saints: [], saintStories: [] },
  {
    calendarType: "julian",
    civilDate: "2026-08-26",
    fetcher: async () => ({ ok: true, json: async () => tikhonDay })
  }
);
assert.equal(tikhonEnriched.epistleRef, "2 Corinthians 9:12-10:7", "the compatibility field retains the readings of the day");
assert.equal(tikhonEnriched.gospelRef, "Mark 3:19-27", "the compatibility field retains the readings of the day");
assert.equal(tikhonEnriched.readingAppointments.length, 4, "all ordinary and saint appointments must be retained");
assert.equal(tikhonEnriched.feastTitle, "Leavetaking of Transfiguration", "the Apodosis remains a separate liturgical observance");
assert.equal(tikhonEnriched.primarySaintTitle, "St Tikhon of Zadonsk (1783)", "the saint remains the Today hero title");

const donorApp = readFileSync(path.join(repoRoot, "public", "donor", "app.js"), "utf8");
const parishLife = readFileSync(path.join(repoRoot, "public", "myagapay", "parish-life.html"), "utf8");
assert.match(donorApp, /today\.primarySaintTitle \|\| today\.feastTitle/);
assert.match(donorApp, /stories\.find\(\(story\) => story\?\.primary\) \|\| stories\[0\]/);
assert.match(donorApp, /if \(groups\.size > 1\) rows\.push\(\{[\s\S]*\? `Feast — \$\{observanceTitle\}`/,
  "the Today hero must label feast and saint reading groups only when multiple appointments need distinction");
assert.match(donorApp, /\["epistle", "gospel"\]/,
  "each appointment must order the Gospel after the Epistle");
assert.doesNotMatch(donorApp, /when this service is celebrated|The parish Typikon determines which appointed readings are proclaimed|Liturgical observance:/,
  "the Today hero must keep the grouped reading presentation concise");
assert.match(donorApp, /feastNote\.replaceChildren[\s\S]*line\.className = reading\.className/,
  "each daily reading must render as its own hero line");
assert.match(parishLife, /\/donor\/app\.js\?v=20260831liturgical1/,
  "the Koinonia page must invalidate cached donor-app bundles when liturgical rendering changes");

console.log("PASS - Today hero, saint card, and first life use the same primary commemoration");
