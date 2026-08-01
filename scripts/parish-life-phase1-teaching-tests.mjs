import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { handleListenSearch } from "../src/handlers/listen.js";
import {
  archiveParishTeachingPost,
  createParishTeachingPost,
  getDonorTeachingFeed,
  markTeachingRead,
  renderTeachingBody,
  storeTeachingAudio,
  TEACHING_ALLOWED_TAGS,
  TEACHING_CATEGORIES,
  TEACHING_AUDIO_MAX_BYTES,
  updateParishTeachingPost,
  validateTeachingAudioMetadata,
} from "../src/handlers/parish-teaching.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(path.join(root, "migrations", "0064_parish_content_reads.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0070_parish_content_read_receipts_index.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0065_parish_announcements.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0072_parish_teaching_posts.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0074_parish_content_categories.sql"), "utf8"));
const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) { this.parameters = parameters; return this; },
      async first() { return sqlite.prepare(sql).get(...this.parameters) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; },
      async run() { const result = sqlite.prepare(sql).run(...this.parameters); return { success: true, meta: { changes: result.changes } }; },
    };
  },
};

assert.deepEqual(TEACHING_ALLOWED_TAGS, ["strong", "em", "a", "ul", "li", "br"]);
assert.deepEqual(TEACHING_CATEGORIES, ["homilies", "catechism", "liturgical", "choir", "special_events"]);
const formatted = renderTeachingBody('A **strong** word, *emphasis*, and [link](https://example.test).\n- One\n- Two\n<script>alert(1)</script><img onerror="bad">');
assert.match(formatted, /<strong>strong<\/strong>/);
assert.match(formatted, /<em>emphasis<\/em>/);
assert.match(formatted, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
assert.doesNotMatch(formatted, /<script|<img|onerror/i);

const draft = await createParishTeachingPost(db, {
  parishId: "parish-one", createdBy: "staff@example.test", input: { title: "Sunday reflection", body: "Listen with the heart." },
});
assert.equal(draft.category, "homilies");
assert.equal(sqlite.prepare("SELECT category FROM parish_teaching_posts WHERE id = ?").get(draft.id).category, "homilies", "the schema must supply homilies when no teaching category is provided");
let publishedCallbacks = 0;
await updateParishTeachingPost(db, {
  parishId: "parish-one",
  teachingId: draft.id,
  input: { title: "Sunday reflection, revised" },
  onPublished: () => { publishedCallbacks += 1; },
});
assert.equal(publishedCallbacks, 0, "editing a draft without publishing must not trigger a push callback");
let donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(donorFeed.posts, [], "draft teaching must stay off the hub and donor feed");
assert.equal(donorFeed.unreadCount, 0);
const published = await updateParishTeachingPost(db, {
  parishId: "parish-one",
  teachingId: draft.id,
  input: { status: "published" },
  onPublished: () => { publishedCallbacks += 1; },
});
assert.equal(published.status, "published");
assert.equal(publishedCallbacks, 1, "the draft-to-published transition must trigger exactly one push callback");
await updateParishTeachingPost(db, {
  parishId: "parish-one",
  teachingId: draft.id,
  input: { body: "Listen with the heart, always." },
  onPublished: () => { publishedCallbacks += 1; },
});
assert.equal(publishedCallbacks, 1, "editing an already-published teaching must not trigger another push callback");
donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(donorFeed.posts.map(({ id }) => id), [draft.id]);
assert.equal(donorFeed.unreadCount, 1, "a newly published teaching must count as unread");
assert.equal(await markTeachingRead(db, { parishId: "parish-one", teachingId: draft.id, donorId: "donor@example.test" }), true);
donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.equal(donorFeed.unreadCount, 0);
assert.equal(donorFeed.posts[0].read, true);
await archiveParishTeachingPost(db, { parishId: "parish-one", teachingId: draft.id });
donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(donorFeed.posts, []);

const catechismDraft = await createParishTeachingPost(db, {
  parishId: "parish-one", createdBy: "staff@example.test", input: { title: "Creed study", body: "A parish catechism session.", category: "catechism" },
});
donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test", category: "catechism" });
assert.deepEqual(donorFeed.posts, [], "category filtering must not expose matching teaching drafts");
await updateParishTeachingPost(db, { parishId: "parish-one", teachingId: catechismDraft.id, input: { status: "published" } });
donorFeed = await getDonorTeachingFeed(db, { parishId: "parish-one", donorId: "donor@example.test", category: "catechism" });
assert.deepEqual(donorFeed.posts.map(({ id }) => id), [catechismDraft.id], "category filtering must return only matching published teaching posts");
assert.throws(() => sqlite.prepare(`
  INSERT INTO parish_teaching_posts (id, parish_id, title, body, category, created_by)
  VALUES ('invalid-category', 'parish-one', 'Invalid', 'Invalid', 'podcast', 'staff@example.test')
`).run(), /CHECK constraint failed/, "the teaching schema must reject categories outside its taxonomy");

const nearLimit = validateTeachingAudioMetadata(new Request("https://agapay.test/audio", {
  method: "POST", headers: { "Content-Type": "audio/mpeg", "Content-Length": String(TEACHING_AUDIO_MAX_BYTES) }, body: new Uint8Array([1]),
}));
assert.equal(nearLimit.error, undefined);
const aboveLimit = validateTeachingAudioMetadata(new Request("https://agapay.test/audio", {
  method: "POST", headers: { "Content-Type": "audio/mpeg", "Content-Length": String(TEACHING_AUDIO_MAX_BYTES + 1) }, body: new Uint8Array([1]),
}));
assert.equal(aboveLimit.status, 413);

function chunkedAudio(chunkCount) {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  return new ReadableStream({ pull(controller) { if (sent >= chunkCount) controller.close(); else { sent += 1; controller.enqueue(chunk); } } });
}
const storedKeys = new Set();
const deletedKeys = [];
const bucket = {
  async put(key, stream) {
    const reader = stream.getReader();
    let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; }
    storedKeys.add(key);
    return { size };
  },
  async delete(key) { storedKeys.delete(key); deletedKeys.push(key); },
};
const nearStored = await storeTeachingAudio(bucket, { key: "near.mp3", source: chunkedAudio(50), contentType: "audio/mpeg" });
assert.equal(nearStored.size, TEACHING_AUDIO_MAX_BYTES, "a realistic 50 MiB upload must stream successfully");
assert.equal(storedKeys.has("near.mp3"), true);
await assert.rejects(() => storeTeachingAudio(bucket, { key: "over.mp3", source: chunkedAudio(51), contentType: "audio/mpeg" }), /TEACHING_AUDIO_TOO_LARGE/);
assert.equal(storedKeys.has("over.mp3"), false, "an over-limit stream must not leave an R2 object");
assert.deepEqual(deletedKeys, ["over.mp3"]);

const sourceFiles = await Promise.all([
  "src/lib/rich-text.js", "src/handlers/parish-communications.js", "src/handlers/parish-teaching.js",
  "public/myagapay/parish-life.html", "public/myagapay/parish-life.js", "public/myagapay/teaching.html", "public/myagapay/teaching.js",
  "public/parish/dashboard.html", "public/parish/app.js", "src/worker.js",
].map(async (relative) => [relative, readFileSync(path.join(root, relative), "utf8")]));
const sources = Object.fromEntries(sourceFiles);
const implementationCount = [...sources["src/lib/rich-text.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length
  + [...sources["src/handlers/parish-communications.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length
  + [...sources["src/handlers/parish-teaching.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length;
assert.equal(implementationCount, 1, "stripAuthoredHtml must have exactly one implementation");
assert.match(sources["src/handlers/parish-communications.js"], /import \{ renderBoundedRichText \} from "\.\.\/lib\/rich-text\.js"/);
assert.match(sources["src/handlers/parish-teaching.js"], /import \{ renderBoundedRichText \} from "\.\.\/lib\/rich-text\.js"/);
assert.match(sources["src/handlers/parish-teaching.js"], /sendTeachingPush\(env, \{/);
assert.match(sources["src/worker.js"], /handleParishTeaching\(request, env, parishId,[\s\S]*, ctx\)/);
assert.match(sources["public/myagapay/parish-life.js"], />Recent Audio<[\s\S]*href="\/myagapay\/teaching">Audio Library/);
assert.match(sources["public/myagapay/parish-life.js"], /post\.status === "published" && Boolean\(post\.audioUrl\)/);
assert.match(sources["public/myagapay/parish-life.js"], /setTeachingUnreadCount\(teachingUnread\)/);
assert.match(sources["public/parish/dashboard.html"], /id="teachingAudio"/);
assert.match(sources["public/parish/dashboard.html"], /id="teachingCategory"[\s\S]*?value="homilies"[\s\S]*?value="special_events"/);
assert.match(sources["public/parish/app.js"], /createTeachingDraft/);
assert.match(sources["public/parish/app.js"], /category:document\.getElementById\('teachingCategory'\)\.value/);
assert.match(sources["public/myagapay/teaching.js"], /All[\s\S]*Homilies[\s\S]*Catechism[\s\S]*Liturgical[\s\S]*Choir[\s\S]*Special Events/);
assert.match(sources["public/myagapay/teaching.js"], /teachingPostsForFilter\(value\)\.length/);
assert.match(sources["public/myagapay/teaching.html"], /Parish Audio[\s\S]*Orthodox Podcasts[\s\S]*koinoniaPodcastQuery[\s\S]*koinoniaPodcastPlayer/);
assert.doesNotMatch(sources["public/myagapay/teaching.html"], /<iframe/, "the podcast hub must use Koinonia-native UI instead of embedding AGAPAY Listen");
assert.match(sources["public/myagapay/teaching.js"], /runKoinoniaPodcastSearch[\s\S]*\/api\/listen\/search/);
assert.match(sources["public/myagapay/teaching.js"], /runKoinoniaPodcastSearch\("Orthodox"\)[\s\S]*AbortController[\s\S]*data\.error/, "podcast discovery must load automatically and surface API failures");
assert.match(sources["public/myagapay/teaching.js"], /openKoinoniaPodcast[\s\S]*\/api\/listen\/rss/);
assert.match(sources["public/myagapay/teaching.js"], /playKoinoniaPodcastEpisode[\s\S]*koinoniaPodcastAudio/);
const unconfiguredPodcastSearch = await handleListenSearch(new Request("https://agapay.test/api/listen/search?q=Orthodox"), {});
assert.equal(unconfiguredPodcastSearch.status, 503, "podcast search must report missing service credentials instead of silently returning no results");

const context = { waitUntil() {} };
for (const pathname of ["/api/donor/teaching", "/api/donor/teaching/post-one/read"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT: "production" }, context);
  assert.equal(production.status, 404, `${pathname} must fail closed in production`);
  const staging = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT: "staging" }, context);
  assert.notEqual(staging.status, 404, `${pathname} must pass the staging gate`);
}
const assetEnv = { AGAPAY_ENVIRONMENT: "staging", ASSETS: { fetch: async () => new Response("teaching") } };
assert.equal((await worker.fetch(new Request("https://agapay.test/myagapay/teaching"), { AGAPAY_ENVIRONMENT: "production" }, context)).status, 404);
assert.equal((await worker.fetch(new Request("https://agapay.test/myagapay/teaching"), assetEnv, context)).status, 200);

console.log("PASS - Parish Life teaching lifecycle, shared sanitizer, streaming audio limit, hub integration, and staging gate");
