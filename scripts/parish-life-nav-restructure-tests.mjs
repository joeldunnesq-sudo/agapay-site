import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import worker from "../src/worker.js";
import { parishLifeExperienceFor } from "../src/lib/parish-life-experience.js";

for (const subscriptionTier of ["parish", "diocese"]) {
  assert.deepEqual(parishLifeExperienceFor({ subscriptionTier }), { communicationsEnabled: true, label: "Koinonia" });
}
for (const subscriptionTier of ["starter", "giving", "mission", "stewardship", "monastery_free"]) {
  assert.deepEqual(parishLifeExperienceFor({ subscriptionTier }), { communicationsEnabled: false, label: "Today" });
}
assert.deepEqual(
  parishLifeExperienceFor({ subscriptionTier: "parish", communicationsEnabled: false }),
  { communicationsEnabled: false, label: "Today" },
  "the parish setting must use the same entitlement decision as the communications API"
);

const legacy = await worker.fetch(new Request("https://agapay.test/myagapay/giving/calendar?from=bookmark"), {}, { waitUntil() {} });
assert.equal(legacy.status, 301);
assert.equal(legacy.headers.get("location"), "https://agapay.test/myagapay/parish-life?from=bookmark");

const [landing, landingScript, shell, calendar, feed, groups, teaching, media, watch] = await Promise.all([
  "parish-life.html", "parish-life.js", "../myagapay-shell.js", "giving/calendar.html", "feed.html", "groups.html", "teaching.html", "media.html", "watch.html",
].map((file) => readFile(new URL(`../public/myagapay/${file}`, import.meta.url), "utf8")));

assert.match(landing, /class="cal-hero parish-life-liturgical-hero"/);
assert.match(landing, /class="cal-date-badge"/);
assert.match(landing, /id="todayFeastNote"/);
assert.match(landing, /id="todayChips"/);
assert.match(landing, />Make a festal offering</);
assert.match(landing, /id="saintPreviewCard"/);
assert.match(landing, /id="donorSaintModal"[\s\S]*Orthocal\.info/);
assert.match(landing, />Upcoming Services<[\s\S]*Parish service calendar not yet configured/);
assert.match(landing, /href="\/myagapay\/calendar">Full Calendar</);
assert.doesNotMatch(landing, />Community</, "the product must not be renamed Community in the rendered landing");

const sandbox = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(landingScript, sandbox);
const lowerTierMarkup = sandbox.window.parishLifeTierSectionsHtml(false);
assert.equal(lowerTierMarkup, "", "lower tiers must receive no communications section DOM");
assert.doesNotMatch(lowerTierMarkup, /Announcements|Recordings|Ministries/);
const parishTierMarkup = sandbox.window.parishLifeTierSectionsHtml(true);
assert.match(parishTierMarkup, /Pinned Announcements/);
assert.match(parishTierMarkup, /Recent Recordings/);
assert.match(parishTierMarkup, /Your Ministries/);
assert.match(landingScript, /item\.status === "published" && item\.pinned === true/);
assert.match(landingScript, /post\.status === "published" && Boolean\(post\.audioUrl\)/);
assert.match(landingScript, /if \(!experience\.communicationsEnabled\)[\s\S]*return;[\s\S]*parishLifeFetch\("\/api\/donor\/feed"/);

for (const [name, source] of Object.entries({ calendar, feed, groups, teaching, media, watch })) {
  assert.match(source, /href="\/myagapay\/parish-life"/, `${name} must return directly to the shared landing`);
}
assert.match(shell, /function ensureParishLifeBackLink[\s\S]*feed\|groups\|teaching\|media/);
assert.match(shell, /link\.href = "\/myagapay\/parish-life"/);

console.log("PASS - tier-aware Today/Koinonia landing, structural gating, redirects, and subpage back navigation");
