import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  isOcaJurisdiction,
  parseParishBlogFeed,
  resolveParishBlogFeed,
  validateParishBlogUrl,
} from "../src/handlers/parish-blog.js";

assert.throws(() => validateParishBlogUrl("http://example.org/feed"), /public HTTPS/);
assert.throws(() => validateParishBlogUrl("https://localhost/feed"), /public HTTPS/);
assert.throws(() => validateParishBlogUrl("https://192.168.1.10/feed"), /public HTTPS/);
assert.equal(validateParishBlogUrl("https://father.example.org/blog"), "https://father.example.org/blog");

const rss = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[A Pastoral Reflection]]></title>
  <link>https://father.example.org/reflection</link>
  <description><![CDATA[<p>Grace &amp; peace.</p><script>bad()</script>]]></description>
  <pubDate>Fri, 31 Jul 2026 12:00:00 GMT</pubDate>
</item></channel></rss>`;
const parsed = parseParishBlogFeed(rss, "https://father.example.org/feed.xml");
assert.deepEqual(parsed, [{
  title: "A Pastoral Reflection",
  url: "https://father.example.org/reflection",
  excerpt: "Grace & peace.",
  publishedAt: "2026-07-31T12:00:00.000Z",
}]);

const fetched = [];
const fetcher = async (url) => {
  fetched.push(url);
  if (url === "https://father.example.org/blog") {
    return new Response('<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>', {
      headers: { "content-type": "text/html" },
    });
  }
  return new Response(rss, { headers: { "content-type": "application/rss+xml" } });
};
const resolved = await resolveParishBlogFeed("https://father.example.org/blog", fetcher);
assert.equal(resolved.feedUrl, "https://father.example.org/feed.xml");
assert.equal(resolved.posts[0].title, "A Pastoral Reflection");
assert.deepEqual(fetched, ["https://father.example.org/blog", "https://father.example.org/feed.xml"]);

assert.equal(isOcaJurisdiction("OCA"), true);
assert.equal(isOcaJurisdiction("Orthodox Church in America · Diocese of the South"), true);
assert.equal(isOcaJurisdiction("Antiochian Orthodox Christian Archdiocese"), false);

const [migration, preferencesMigration, worker, dashboard, parishApp, landing, newsPage, newsScript, blogHandler, donorStyle] = await Promise.all([
  readFile(new URL("../migrations/0076_parish_blog_feeds.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0077_donor_news_source_subscriptions.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/dashboard.html", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/news.html", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/news.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/parish-blog.js", import.meta.url), "utf8"),
  readFile(new URL("../public/donor/style.css", import.meta.url), "utf8"),
]);
assert.match(migration, /CREATE TABLE IF NOT EXISTS parish_blog_feeds/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS donor_external_feed_subscriptions/);
assert.match(preferencesMigration, /CREATE TABLE IF NOT EXISTS donor_news_source_subscriptions/);
assert.match(preferencesMigration, /CREATE TABLE IF NOT EXISTS donor_custom_news_feeds/);
for (const sourceKey of ["parish_blog", "oca", "orthochristian", "spzh", "orthodoxtimes", "orthodoxethos"]) {
  assert.ok(preferencesMigration.includes(`'${sourceKey}'`), `news preferences must allow ${sourceKey}`);
}
const preferencesDb = new DatabaseSync(":memory:");
preferencesDb.exec(migration);
preferencesDb.exec(preferencesMigration);
assert.equal(preferencesDb.prepare("SELECT COUNT(*) AS count FROM donor_news_source_subscriptions").get().count, 0, "a new donor must start with no selected news sources");
assert.throws(() => preferencesDb.prepare("INSERT INTO donor_news_source_subscriptions (donor_id, source_key, subscribed) VALUES (?, ?, 1)").run("donor@example.test", "unapproved"), /CHECK constraint failed/, "the schema must reject unknown built-in sources");
assert.match(worker, /"\/api\/donor\/blog"[\s\S]*handleDonorBlog/);
assert.match(worker, /"\/api\/donor\/oca-news"[\s\S]*handleDonorOcaNews/);
assert.match(worker, /"\/api\/donor\/external-feeds\/"[\s\S]*handleDonorExternalFeed/);
assert.match(worker, /"\/api\/donor\/custom-news-feeds"[\s\S]*handleDonorCustomNewsFeeds/);
assert.match(dashboard, /id="parishBlogEnabled"[\s\S]*id="parishBlogSourceUrl"/);
assert.match(parishApp, /saveParishBlogSettings[\s\S]*communicationsApi\('\/blog'\)/);
assert.match(dashboard, /<span class="nav-label">Koinonia<\/span>/, "the parish navigation should use the donor-facing Koinonia name");
assert.match(dashboard, /data-koinonia-view="overview"[\s\S]*data-koinonia-view="announcements"[\s\S]*data-koinonia-view="audio"[\s\S]*data-koinonia-view="video"[\s\S]*data-koinonia-view="news"/, "Koinonia Studio should separate publishing channels");
assert.match(dashboard, /koinoniaPublishedAnnouncements[\s\S]*koinoniaPublishedAudio[\s\S]*koinoniaPublishedVideo[\s\S]*koinoniaBlogStatus/, "the studio overview should expose live channel health");
assert.match(parishApp, /function setKoinoniaStudioView[\s\S]*function renderKoinoniaOverview/);
assert.match(parishApp, /renderKoinoniaOverview\(\);[\s\S]*setKoinoniaStudioView\(koinoniaStudioView\)/, "loaded content should refresh the studio overview");
assert.match(landing, /Recent News/);
assert.match(landing, /\.slice\(0, 3\)/, "Koinonia home should show only the three newest combined articles");
assert.match(landing, /Choose your news sources[\s\S]*Nothing appears until you follow/);
assert.ok(landing.indexOf("Your Ministries") < landing.indexOf("Recent Audio"), "ministries should appear above audio and video on Koinonia home");
assert.match(newsPage, /News Feeds[\s\S]*Choose your sources[\s\S]*Follow another RSS feed/);
assert.match(newsScript, /Priest’s Blog[\s\S]*OCA News[\s\S]*OrthoChristian[\s\S]*SPZH[\s\S]*Orthodox Times[\s\S]*Orthodox Ethos/);
assert.match(newsScript, /toggleNewsSource[\s\S]*\/api\/donor\/external-feeds\//);
assert.match(newsScript, /addCustomNewsSource[\s\S]*\/api\/donor\/custom-news-feeds/);
assert.match(newsScript, /Your news feed is empty[\s\S]*will not add news without your choice/);
assert.match(donorStyle, /donor-calendar-page, \.donor-news-page[\s\S]*--k-gold:[\s\S]*\.parish-life-feed-toggle[\s\S]*background: #b88f42/, "News must inherit Koinonia theme variables and render a visible Follow button");
assert.match(blogHandler, /SPZH_FEED_URL = "https:\/\/spzh\.eu\/en\/rss"/);
assert.match(blogHandler, /ORTHODOX_TIMES_FEED_URL = "https:\/\/orthodoxtimes\.com\/feed\/"/);
assert.match(blogHandler, /ORTHODOX_ETHOS_FEED_URL = "https:\/\/www\.orthodoxethos\.com\/blog-feed\.xml"/);
assert.match(blogHandler, /if \(!subscribed\) return json\(\{ \.\.\.basePayload, posts: \[\] \}\)/, "built-in feeds must return no articles until the donor follows them");
assert.match(blogHandler, /validateParishBlogUrl\(input\.url\)[\s\S]*resolveParishBlogFeed\(sourceUrl\)/, "custom feeds must use the existing public-HTTPS validation and feed discovery");
assert.match(worker, /"\/myagapay\/news", "\/myagapay\/news\.html"/);

console.log("PASS - donor-curated news sources, custom RSS, feed sanitization, and three-article Koinonia preview");
