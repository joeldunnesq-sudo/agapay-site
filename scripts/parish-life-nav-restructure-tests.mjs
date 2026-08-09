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

let canonicalCalendarAssetPath = "";
const canonicalCalendar = await worker.fetch(new Request("https://agapay.test/myagapay/calendar"), {
  ASSETS: {
    async fetch(request) {
      canonicalCalendarAssetPath = new URL(request.url).pathname;
      return new Response("calendar");
    }
  }
}, { waitUntil() {} });
assert.equal(canonicalCalendar.status, 200);
assert.equal(canonicalCalendarAssetPath, "/myagapay/giving/calendar.html", "the canonical full-calendar route must serve the calendar page instead of returning to Koinonia");

const [landing, landingScript, shell, donorApp, calendar, feed, groups, teaching, media, watch] = await Promise.all([
  "parish-life.html", "parish-life.js", "../myagapay-shell.js", "../donor/app.js", "giving/calendar.html", "feed.html", "groups.html", "teaching.html", "media.html", "watch.html",
].map((file) => readFile(new URL(`../public/myagapay/${file}`, import.meta.url), "utf8")));
const [parishDashboard, parishDashboardApp, parishDashboardStyles] = await Promise.all([
  "dashboard.html", "app.js", "style.css",
].map((file) => readFile(new URL(`../public/parish/${file}`, import.meta.url), "utf8")));
const donorStyles = await readFile(new URL("../public/donor/style.css", import.meta.url), "utf8");
assert.match(donorStyles, /\.parish-life-community-tools \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "Signups and Exchange should sit side-by-side on wider screens");
assert.match(donorStyles, /\.parish-life-community-tool \{[^}]*min-height:82px/, "Community Tool cards should remain compact");
assert.doesNotMatch(donorStyles, /@media \(max-width:680px\)[\s\S]{0,160}\.parish-life-community-tools \{[^}]*grid-template-columns:1fr/, "Community Tool cards should stay side-by-side on mobile");

assert.match(landing, /class="cal-hero parish-life-liturgical-hero"/);
assert.match(landing, /class="cal-date-badge"/);
assert.match(landing, /id="todayCivilDateEyebrow"/);
assert.match(landing, /id="todayFeastNote"/);
assert.match(landing, /id="todayChips"/);
assert.match(landing, />Make a festal offering</);
assert.doesNotMatch(landing, /class="cal-hero parish-life-saint-card"/, "the Koinonia landing should not duplicate Saint of the Day in a second card");
assert.match(donorApp, /class=\"cal-saint-chip\" id=\"saintPreviewCard\"[\s\S]*?commemorated today\">\$\{saintCount\} saint[\s\S]*?<b aria-hidden=\"true\">→<\/b>/, "the saints-count pill should open the saint modal and show a directional arrow without nesting another chip inside it");
assert.match(landing, /id="donorSaintModal"[\s\S]*Orthocal\.info/);
assert.match(landing, />Upcoming Events<[\s\S]*Loading the next liturgical observance/);
assert.match(landing, /href="\/myagapay\/calendar">Full Calendar</);
assert.ok(landing.indexOf('id="parishLifeInboxMount"') < landing.indexOf(">Upcoming Events<"), "the actionable announcements card should sit directly below the hero and before Upcoming Events");
assert.doesNotMatch(landing, />Community</, "the product must not be renamed Community in the rendered landing");
assert.match(
  donorStyles,
  /\.donor-parish-life-page \.topbar-title\[data-parish-life-label\] \{[\s\S]*?font-family: var\(--serif\);/,
  "the Koinonia landing header should use the same Cormorant serif family as the My AGAPAY home header"
);
assert.match(donorStyles, /\.donor-parish-life-page \.parish-life-liturgical-hero \.cal-today-row \{ display: block; \}/, "the Koinonia hero should use one text column");
assert.match(donorStyles, /\.donor-parish-life-page \.parish-life-liturgical-hero \.cal-date-badge \{[\s\S]*?position: absolute;[\s\S]*?top: 0;[\s\S]*?right: 0;/, "the church date should sit in a compact top-right cutout");

const sandbox = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(landingScript, sandbox);
const fixtureEvents = [
  { name: "Minor commemoration", date: "2026-08-02", rank: "season" },
  { id: "dormition-fast-ends", name: "Dormition Fast Ends", date: "2026-08-14", rank: "fast" },
  { id: "transfiguration", name: "Transfiguration", date: "2026-08-06", rank: "great" },
  { id: "dormition-fast-begins", name: "Dormition Fast Begins", date: "2026-08-01", rank: "fast" },
  { id: "dormition", name: "Dormition of the Theotokos", date: "2026-08-15", rank: "great" },
];
sandbox.window.AGAPAYLiturgicalCalendar = { liturgicalFeastsForYear: () => fixtureEvents };
assert.equal(
  sandbox.window.parishLifeNextLiturgicalEvent("julian", new Date(2026, 7, 1)).name,
  "Dormition Fast Begins",
  "the landing should fall back to the next major feast or beginning of a fasting period"
);
assert.deepEqual(
  Array.from(sandbox.window.parishLifeUpcomingLiturgicalEvents("julian", new Date(2026, 7, 1)), (event) => event.id),
  ["dormition-fast-begins", "dormition"],
  "a fasting-period fallback should also surface the feast associated with that fast"
);
const balancedListening = Array.from(sandbox.window.parishLifeBalancedListenItems(
  [
    { key:"parish-1", kind:"parish", publishedAt:"2026-08-01" },
    { key:"parish-2", kind:"parish", publishedAt:"2026-07-20" },
    { key:"parish-3", kind:"parish", publishedAt:"2026-07-10" },
  ],
  [
    { key:"podcast-1", kind:"podcast", publishedAt:"2026-08-05" },
    { key:"podcast-2", kind:"podcast", publishedAt:"2026-08-04" },
    { key:"podcast-3", kind:"podcast", publishedAt:"2026-08-03" },
    { key:"podcast-4", kind:"podcast", publishedAt:"2026-08-02" },
  ],
  5
));
assert.equal(balancedListening.length, 5, "the combined listening preview should stay compact");
assert.ok(balancedListening.filter((item) => item.kind === "parish").length >= 2, "frequent podcasts must not crowd parish audio out of the combined preview");
assert.ok(balancedListening.some((item) => item.kind === "podcast"), "the combined preview should include a subscribed podcast when one is available");
assert.match(landingScript, /Feast associated with this fast/);
const lowerTierMarkup = sandbox.window.parishLifeTierSectionsHtml(false);
assert.equal(lowerTierMarkup, "", "lower tiers must receive no communications section DOM");
assert.doesNotMatch(lowerTierMarkup, /Announcements|Recordings|Ministries/);
const parishTierMarkup = sandbox.window.parishLifeTierSectionsHtml(true, { signupsEnabled:true, exchangeEnabled:true });
const parishInboxMarkup = sandbox.window.parishLifeInboxShellHtml(true);
assert.match(parishInboxMarkup, /Community Inbox/);
assert.match(parishInboxMarkup, /Needs You/);
assert.equal(sandbox.window.parishLifeInboxShellHtml(false), "");
assert.match(parishTierMarkup, /id="listenHeading">Listen</);
assert.match(parishTierMarkup, /Continue listening/);
assert.match(parishTierMarkup, /Latest audio/);
assert.match(parishTierMarkup, /Recent Videos/);
assert.match(parishTierMarkup, /Your Ministries/);
for (const loadingLabel of ["ministries", "audio", "videos", "news"]) {
  assert.match(parishTierMarkup, new RegExp(`class="sw-tool-loading parish-life-section-loading"[^>]*>Loading ${loadingLabel}…<`), `the ${loadingLabel} section needs its own honest loading state`);
}
assert.match(parishTierMarkup, /id="parishLifeContinueListeningSection"[\s\S]*hidden[\s\S]*id="parishLifeListenItems"/, "Continue listening must be conditional and appear above the combined latest-audio list");
assert.equal((parishTierMarkup.match(/parish-life-section-loading/g) || []).length, 4, "each fresh-content section must own one loading placeholder");
assert.ok(parishTierMarkup.indexOf("Your Ministries") < parishTierMarkup.indexOf('id="listenHeading"'), "ministries should appear before the unified listening section and video");
assert.ok(parishTierMarkup.indexOf("Your Ministries") < parishTierMarkup.indexOf("Community Tools"), "community tools should follow Your Ministries");
assert.ok(parishTierMarkup.indexOf("Community Tools") < parishTierMarkup.indexOf('id="listenHeading"'), "community tools should appear above the media sections");
assert.ok(parishTierMarkup.indexOf("Your Ministries") < parishTierMarkup.indexOf("parishLifeNewsMount"), "the combined news preview should follow parish-specific ministries");
assert.match(landingScript, /Get involved/);
assert.match(landingScript, /\/api\/donor\/ministry-service-interest/);
assert.match(landingScript, /item\.status === "published" && item\.pinned === true && !item\.read/);
assert.match(landingScript, /item\.kind === "coverage" \? "I can cover" : "Claim spot"/);
assert.match(landingScript, /signups\/coverage\/\$\{encodeURIComponent\(id\)\}\/accept/);
assert.doesNotMatch(parishTierMarkup, /Pinned Announcements/);
assert.match(donorStyles, /\.parish-life-blog-list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Recent News should use a compact 2-by-2 grid");
assert.match(landingScript, /post\.status === "published" && Boolean\(post\.audioUrl\)/);
assert.match(landingScript, /parishLifeFetch\("\/api\/donor\/videos"/);
assert.match(landingScript, /href="\/myagapay\/media\/watch\?video=/);
assert.match(landingScript, /if \(!experience\.communicationsEnabled\)[\s\S]*return;[\s\S]*parishLifeFetch\("\/api\/donor\/feed"/);
assert.match(landingScript, /fetch\(path, \{ headers, cache: "no-store" \}\)/, "landing content requests must remain uncached");
assert.match(landingScript, /initializeParishLifeStructure\(\);[\s\S]*fetch\("\/api\/donor\/dashboard"/, "cached structure must render before the landing dashboard request resolves");
assert.match(landingScript, /parishLifeFetch\("\/api\/donor\/feed"[\s\S]*renderCommunityInbox/, "actionable announcements and signup actions should replace the Community Inbox placeholder");
assert.match(landingScript, /parishLifeFetch\("\/api\/donor\/groups"[\s\S]*\.then\(\(groups\)[\s\S]*renderMinistries/, "ministries should replace their own placeholder when their request resolves");
assert.match(landingScript, /parishLifeFetch\("\/api\/donor\/teaching"[\s\S]*\.then\(\(teaching\)[\s\S]*renderRecentRecordings/, "recordings should replace their own placeholder when their request resolves");

const tierMount = { innerHTML: "" };
const inboxMount = { innerHTML: "" };
const sidebarName = { textContent: "" };
const sidebarCommunications = { hidden: true };
const tierLabel = { textContent: "Today" };
sandbox.document.title = "Today | My AGAPAY";
sandbox.document.documentElement = { dataset: {} };
sandbox.document.getElementById = (id) => ({
  parishLifeTierSections: tierMount,
  parishLifeInboxMount: inboxMount,
  parishLifeSidebarName: sidebarName,
  parishLifeSidebarCommunications: sidebarCommunications,
})[id] || null;
sandbox.document.querySelectorAll = (selector) => selector === "[data-parish-life-label]" ? [tierLabel] : [];
sandbox.window.MyAgapayShell = {
  capabilitiesLoaded: () => true,
  parishLifeExperience: () => ({ communicationsEnabled: true, label: "Koinonia" })
};
const cachedTierExperience = sandbox.window.initializeParishLifeStructure();
assert.equal(cachedTierExperience.communicationsEnabled, true);
assert.match(inboxMount.innerHTML, /Needs You[\s\S]*Loading your Community Inbox…/, "a cached Koinonia decision must synchronously render the Community Inbox shell before any fetch");
assert.equal(tierLabel.textContent, "Koinonia");

sandbox.window.MyAgapayShell.parishLifeExperience = () => ({ communicationsEnabled: false, label: "Today" });
sandbox.window.initializeParishLifeStructure();
assert.equal(tierMount.innerHTML, "", "a cached lower-tier decision must never render Koinonia section shells");
assert.equal(inboxMount.innerHTML, "", "a cached lower-tier decision must never render the Community Inbox shell");

sandbox.window.MyAgapayShell.capabilitiesLoaded = () => false;
sandbox.window.initializeParishLifeStructure();
assert.match(tierMount.innerHTML, /data-parish-life-structure-loading[\s\S]*Loading parish sections…/);
assert.equal(inboxMount.innerHTML, "", "an unresolved tier must not guess whether the Community Inbox is available");
assert.doesNotMatch(tierMount.innerHTML, /Pinned Announcements|Your Ministries|Recent Audio/, "an unresolved tier must show loading without guessing the page structure");

for (const [name, source] of Object.entries({ calendar, feed, groups, teaching, media, watch })) {
  assert.match(source, /href="\/myagapay\/parish-life"/, `${name} must return directly to the shared landing`);
}
assert.match(shell, /function ensureParishLifeBackLink[\s\S]*feed\|news\|groups\|teaching\|media/);
assert.match(shell, /link\.href = "\/myagapay\/parish-life"/);
assert.match(shell, /className = "parish-life-back-link koinonia-page-back"[\s\S]*page\.prepend\(link\)/, "each Koinonia subpage must put its back arrow at the top-left of page content");
assert.match(donorApp, /churchCalendarDate\(date, calendar\)[\s\S]*todayCivilDateEyebrow[\s\S]*churchParts\.dayNum[\s\S]*churchParts\.monthYear/, "the eyebrow must show the civil date while the badge uses the parish calendar date");

assert.doesNotMatch(parishDashboard, /class="koinonia-quick-publish"/, "At a glance should no longer duplicate announcement, audio, and video actions");
assert.match(parishDashboard, /koinonia-overview-welcome[\s\S]*koinonia-calendar-connect is-compact[\s\S]*id="koinoniaCalendarUrl"/, "At a glance should contain the calendar connection card");
for (const view of ["announcements", "audio", "video", "news"]) {
  assert.match(parishDashboard, new RegExp(`class="koinonia-metric-card"[^>]+openKoinoniaComposer\\('${view}'\\)`), `the ${view} metric card should initiate its composer`);
}
assert.match(parishDashboardApp, /view === 'news'[\s\S]*\? 'parishBlogSourceUrl'/, "the priest blog action should focus the RSS input");
assert.match(parishDashboardStyles, /\.koinonia-metric-card:hover[\s\S]*\.koinonia-metric-card:focus-visible/, "the clickable action cards should expose hover and keyboard focus feedback");

console.log("PASS - tier-aware Today/Koinonia landing, structural gating, redirects, and subpage back navigation");
