import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
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
  deleteParishTeachingPost,
  getDonorTeachingFeed,
  markTeachingRead,
  renderTeachingBody,
  storeTeachingAudio,
  TEACHING_ALLOWED_TAGS,
  TEACHING_CATEGORIES,
  TEACHING_AUDIO_MAX_BYTES,
  updateParishTeachingPost,
  validateExternalTeachingAudioUrl,
  validateTeachingAudioMetadata,
} from "../src/handlers/parish-teaching.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(path.join(root, "migrations", "0064_parish_content_reads.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0070_parish_content_read_receipts_index.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0065_parish_announcements.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0072_parish_teaching_posts.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0074_parish_content_categories.sql"), "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0087_parish_teaching_audio_links_and_pins.sql"), "utf8"));
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

assert.equal(validateExternalTeachingAudioUrl("https://media.example.test/homily.mp3"), "https://media.example.test/homily.mp3");
assert.throws(() => validateExternalTeachingAudioUrl("http://media.example.test/homily.mp3"), /public HTTPS/);
assert.throws(() => validateExternalTeachingAudioUrl("https://localhost/homily.mp3"), /public HTTPS/);
await updateParishTeachingPost(db, { parishId:"parish-one", teachingId:catechismDraft.id, input:{ pinned:true } });
const linkedAudio = await createParishTeachingPost(db, {
  parishId:"parish-one", createdBy:"staff@example.test",
  input:{ title:"Linked homily", body:"Listen to this recording.", category:"homilies", audioUrl:"https://media.example.test/homily.mp3", pinned:true },
});
assert.equal(linkedAudio.audioSource, "external");
assert.equal(linkedAudio.pinned, true);
assert.equal(sqlite.prepare("SELECT pinned FROM parish_teaching_posts WHERE id = ?").get(catechismDraft.id).pinned, 1, "pin intent on an unpublished draft must not displace the visible published pin");
await updateParishTeachingPost(db, { parishId:"parish-one", teachingId:linkedAudio.id, input:{ status:"published" } });
assert.equal(sqlite.prepare("SELECT pinned FROM parish_teaching_posts WHERE id = ?").get(catechismDraft.id).pinned, 0, "publishing a pre-pinned draft must replace the previous visible pin");
await updateParishTeachingPost(db, { parishId:"parish-one", teachingId:catechismDraft.id, input:{ pinned:true } });
assert.equal(sqlite.prepare("SELECT pinned FROM parish_teaching_posts WHERE id = ?").get(linkedAudio.id).pinned, 0, "pinning another recording must clear the previous parish audio pin");
donorFeed = await getDonorTeachingFeed(db, { parishId:"parish-one", donorId:"donor@example.test" });
assert.equal(donorFeed.posts[0].id, catechismDraft.id, "the pinned recording must lead the donor audio feed");

let deletedTeachingObject = "";
const uploadedAudioDraft = await createParishTeachingPost(db, {
  parishId:"parish-one", createdBy:"staff@example.test", input:{ title:"Uploaded draft", body:"A draft with hosted audio." },
});
sqlite.prepare("UPDATE parish_teaching_posts SET audio_url = ?, audio_source = 'upload' WHERE id = ?")
  .run("https://audio.agapay.test/parish-one/uploaded-draft.mp3", uploadedAudioDraft.id);
await deleteParishTeachingPost(db, {
  TEACHING_ASSETS_URL:"https://audio.agapay.test",
  TEACHING_ASSETS:{ async delete(key) { deletedTeachingObject = key; } },
}, { parishId:"parish-one", teachingId:uploadedAudioDraft.id });
assert.equal(deletedTeachingObject, "parish-one/uploaded-draft.mp3", "deleting an uploaded draft must remove its R2 object");
assert.equal(sqlite.prepare("SELECT id FROM parish_teaching_posts WHERE id = ?").get(uploadedAudioDraft.id), undefined);
let externalDeleteCalled = false;
await deleteParishTeachingPost(db, {
  TEACHING_ASSETS_URL:"https://audio.agapay.test",
  TEACHING_ASSETS:{ async delete() { externalDeleteCalled = true; } },
}, { parishId:"parish-one", teachingId:linkedAudio.id });
assert.equal(externalDeleteCalled, false, "deleting linked audio must not attempt to delete an external asset");
assert.equal(sqlite.prepare("SELECT id FROM parish_teaching_posts WHERE id = ?").get(linkedAudio.id), undefined);

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
const fixedSource = chunkedAudio(10);
let receivedFixedSource = null;
const fixedStored = await storeTeachingAudio({
  async put(_key, source) { receivedFixedSource = source; return { size:10 * 1024 * 1024 }; },
  async delete() {},
}, { key:"fixed.mp3", source:fixedSource, contentType:"audio/mpeg", contentLength:10 * 1024 * 1024 });
assert.equal(receivedFixedSource, fixedSource, "a browser upload with Content-Length must preserve the request's fixed-length stream for R2");
assert.equal(fixedStored.size, 10 * 1024 * 1024);

const sourceFiles = await Promise.all([
  "src/lib/rich-text.js", "src/handlers/parish-communications.js", "src/handlers/parish-teaching.js",
  "public/myagapay/parish-life.html", "public/myagapay/parish-life.js", "public/myagapay/teaching.html", "public/myagapay/teaching.js",
  "public/parish/dashboard.html", "public/parish/app.js", "src/worker.js", "src/routes/parish.js",
].map(async (relative) => [relative, relative === "public/parish/app.js" ? readParishDashboardSource() : readFileSync(path.join(root, relative), "utf8")]));
const sources = Object.fromEntries(sourceFiles);
const implementationCount = [...sources["src/lib/rich-text.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length
  + [...sources["src/handlers/parish-communications.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length
  + [...sources["src/handlers/parish-teaching.js"].matchAll(/function\s+stripAuthoredHtml\s*\(/g)].length;
assert.equal(implementationCount, 1, "stripAuthoredHtml must have exactly one implementation");
assert.match(sources["src/handlers/parish-communications.js"], /import \{ renderBoundedRichText \} from "\.\.\/lib\/rich-text\.js"/);
assert.match(sources["src/handlers/parish-teaching.js"], /import \{ renderBoundedRichText \} from "\.\.\/lib\/rich-text\.js"/);
assert.match(sources["src/handlers/parish-teaching.js"], /sendTeachingPush\(env, \{/);
assert.match(sources["src/handlers/parish-teaching.js"], /contentLength: metadata\.contentLength[\s\S]*teaching_audio_storage_failed/, "R2 uploads must preserve known-length request streams and return an actionable storage error");
assert.match(sources["src/routes/parish.js"], /handleParishTeaching\(request, env, parishId,[\s\S]*, ctx\)/);
assert.match(sources["public/myagapay/parish-life.js"], />Listen<[\s\S]*href="\/myagapay\/teaching">Open Library/);
assert.match(sources["public/myagapay/parish-life.js"], /post\.status === "published" && Boolean\(post\.audioUrl\)/);
assert.match(sources["public/myagapay/parish-life.js"], /parishLifeFetch\("\/api\/donor\/teaching"[\s\S]*\.then\(\(teaching\)[\s\S]*renderRecentRecordings[\s\S]*setTeachingUnreadCount\(Math\.max\(0, Number\(teaching\?\.unreadCount\) \|\| 0\)\)/, "the teaching request must fill the unified Listen section and update unread state independently");
assert.match(sources["public/parish/dashboard.html"], /id="teachingAudio"/);
assert.match(sources["public/parish/dashboard.html"], /id="teachingAudioUrl"[\s\S]*id="teachingPinned"[\s\S]*Pin when published/);
assert.match(sources["public/parish/dashboard.html"], /id="teachingCategory"[\s\S]*?value="homilies"[\s\S]*?value="special_events"/);
assert.match(sources["public/parish/app.js"], /createTeachingDraft/);
assert.match(sources["public/parish/app.js"], /category:document\.getElementById\('teachingCategory'\)\.value/);
assert.match(sources["public/parish/app.js"], /audioUrl[\s\S]*toggleTeachingPin/);
assert.match(sources["public/parish/app.js"], /Will pin when published[\s\S]*Publish pinned audio/, "the parish dashboard must distinguish draft pin intent from a visible published pin");
assert.match(sources["public/parish/app.js"], /chooseTeachingAudioUpload[\s\S]*Replace audio file[\s\S]*uploadTeachingAudio/, "a saved draft must offer a direct retry after an upload failure");
assert.match(sources["public/parish/app.js"], /Add audio link[\s\S]*setTeachingAudioLink[\s\S]*audioUrl:audioUrl\.trim\(\)[\s\S]*Parishioners can now play this post in My AGAPAY/, "a text-only post must be repairable with a direct audio link from the parish library");
assert.match(sources["public/parish/app.js"], /deleteTeachingPost[\s\S]*method:'DELETE'[\s\S]*Teaching post permanently deleted/, "audio posts of every status must offer permanent deletion");
assert.match(sources["public/myagapay/parish-life.js"], /Boolean\(right\.pinned\)[\s\S]*Pinned ·/);
assert.match(sources["public/myagapay/parish-life.js"], /Continue listening[\s\S]*Latest audio/, "unfinished podcast listening must appear above the combined latest-audio list on the Koinonia landing page");
assert.match(sources["public/myagapay/parish-life.js"], /function parishLifeBalancedListenItems[\s\S]*podcastReserve[\s\S]*parishReserve[\s\S]*Math\.min\(parish\.length, 2/, "the combined list must reserve space for parish audio without excluding subscribed podcasts");
assert.match(sources["public/myagapay/parish-life.js"], /Parish audio ·[\s\S]*Podcast ·/, "combined-list rows must identify parish and podcast sources");
assert.match(sources["public/myagapay/parish-life.js"], /loadParishLifeContinueListening[\s\S]*\/api\/listen\/progress[\s\S]*data\.items\[0\][\s\S]*renderParishLifeContinueListening/, "the landing page must surface only the account's most recently active podcast episode");
assert.match(sources["public/myagapay/parish-life.js"], /Latest audio[\s\S]*\/api\/listen\/subscriptions[\s\S]*Promise\.allSettled[\s\S]*slice\(0, 5\)/, "the unified list may draw from the five most recent subscribed podcast episodes");
assert.match(sources["public/myagapay/parish-life.js"], /mode=podcasts&feed=\$\{encodeURIComponent\(episode\.feedUrl\)\}&episode=\$\{encodeURIComponent\(episode\.episodeKey\)\}/, "landing-page podcast episodes must deep-link to the selected playable episode");
assert.match(sources["public/myagapay/parish-life.js"], /item\.image \? `<img src="\$\{parishLifeEscape\(item\.image\)\}"[^`]*` : "▶"/, "podcast items in the combined list must show feed artwork and reserve the generic play icon as a fallback");
assert.match(sources["public/myagapay/teaching.js"], /post\.pinned[\s\S]*Linked audio/);
assert.match(sources["public/myagapay/teaching.js"], /playParishTeachingAudio[\s\S]*playKoinoniaPodcast\(\{[\s\S]*trackProgress:false/, "parish recordings must launch the shared Koinonia mini and full-screen player");
assert.match(sources["public/myagapay/teaching.js"], /post\.audioUrl \? "playParishTeachingAudio" : "openTeachingPost"[\s\S]*Play in Koinonia/, "a donor post with stored audio must expose the shared player rather than render as text-only");
assert.match(sources["public/myagapay/teaching.js"], /artist: "AGAPAY Audio"[\s\S]*album: episode\.show \|\| "Koinonia Audio Library"/, "Bluetooth media metadata must identify every Koinonia source as AGAPAY Audio");
assert.match(sources["public/myagapay/teaching.js"], /openRequestedKoinoniaPodcastEpisode[\s\S]*parameters\.get\("feed"\)[\s\S]*parameters\.get\("episode"\)[\s\S]*playKoinoniaPodcast\(episode\)/, "podcast landing links must open the selected episode in the shared player");
assert.doesNotMatch(sources["public/myagapay/teaching.js"], /<audio controls preload="metadata"/, "parish recordings must not fall back to a bare browser audio control");
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
