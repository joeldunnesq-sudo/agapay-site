import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  enrichLiturgicalDayWithOrthocal,
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

const donorApp = readFileSync(path.join(repoRoot, "public", "donor", "app.js"), "utf8");
assert.match(donorApp, /today\.primarySaintTitle \|\| today\.feastTitle/);
assert.match(donorApp, /stories\.find\(\(story\) => story\?\.primary\) \|\| stories\[0\]/);

console.log("PASS - Today hero, saint card, and first life use the same primary commemoration");
