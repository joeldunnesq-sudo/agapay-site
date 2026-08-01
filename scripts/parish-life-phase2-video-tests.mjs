import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import {
  addYouTubeLink,
  createStreamUpload,
  createVideoDraft,
  getDonorVideoFeed,
  markVideoWatched,
  privateStreamAssets,
  renderVideoDescription,
  resolveYouTubeVideo,
  streamIsReady,
  updateVideoPost,
} from "../src/handlers/parish-video.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
for (const migration of ["0064_parish_content_reads.sql", "0070_parish_content_read_receipts_index.sql", "0072_parish_teaching_posts.sql", "0073_parish_private_video.sql"]) {
  sqlite.exec(readFileSync(path.join(root, "migrations", migration), "utf8"));
}
const db = { prepare(sql) { return { parameters: [], bind(...parameters) { this.parameters = parameters; return this; }, async first() { return sqlite.prepare(sql).get(...this.parameters) || null; }, async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; }, async run() { const result = sqlite.prepare(sql).run(...this.parameters); return { success: true, meta: { changes: result.changes } }; } }; } };

const draft = await createVideoDraft(db, { parishId:"parish-one", createdBy:"staff@example.test", streamVideoId:"stream-one", input:{ title:"Sunday homily", description:"A **private** reflection.", pinned:true } });
assert.match(renderVideoDescription(draft.description), /<strong>private<\/strong>/);
assert.deepEqual(await getDonorVideoFeed(db, { parishId:"parish-one", donorId:"donor@example.test" }), [], "draft video must never appear to a donor");
await assert.rejects(() => updateVideoPost(db, { parishId:"parish-one", videoId:draft.id, input:{ status:"published" }, streamDetails:{ readyToStream:false, status:{state:"inprogress"} } }), /still processing/);
assert.equal(streamIsReady({ readyToStream:true, status:{state:"ready"} }), true);
await updateVideoPost(db, { parishId:"parish-one", videoId:draft.id, input:{ status:"published" }, streamDetails:{ readyToStream:true, status:{state:"ready"} } });
assert.equal((await getDonorVideoFeed(db, { parishId:"parish-two", donorId:"other@example.test" })).length, 0, "another parish must never resolve this video's direct link");
assert.equal(await markVideoWatched(db, { parishId:"parish-two", videoId:draft.id, donorId:"other@example.test" }), false, "wrong-parish watch receipt must be rejected");
assert.equal(await markVideoWatched(db, { parishId:"parish-one", videoId:draft.id, donorId:"donor@example.test" }), true);
assert.equal((await getDonorVideoFeed(db, { parishId:"parish-one", donorId:"donor@example.test" }))[0].watchCount, 1, "watch count must be computed from shared receipts");

const streamEnv = { CLOUDFLARE_ACCOUNT_ID:"account", CLOUDFLARE_STREAM_API_TOKEN:"secret", AGAPAY_APP_URL:"https://staging.agapay.test", AGAPAY_PUBLIC_URL:"https://agapay.test" };
let directUploadBody;
const streamFetch = async (url, init = {}) => {
  assert.equal(init.headers.Authorization, "Bearer secret");
  if (String(url).endsWith("/direct_upload")) { directUploadBody = JSON.parse(init.body); return Response.json({ success:true, result:{ uid:"stream-two", uploadURL:"https://upload.videodelivery.net/once" } }); }
  if (String(url).endsWith("/token")) return Response.json({ success:true, result:{ token:"signed-token" } });
  return Response.json({ success:true, result:{ uid:"stream-one", readyToStream:true, requireSignedURLs:true, status:{state:"ready"}, duration:125, playback:{hls:"https://customer-code.cloudflarestream.com/stream-one/manifest/video.m3u8"} } });
};
const upload = await createStreamUpload(streamEnv, { request:new Request("https://staging.agapay.test/api/upload"), parishId:"parish-one", createdBy:"staff@example.test" }, streamFetch);
assert.equal(upload.uploadURL, "https://upload.videodelivery.net/once");
assert.equal(directUploadBody.requireSignedURLs, true, "every creator upload must be private from creation");
assert.deepEqual(directUploadBody.allowedOrigins.sort(), ["agapay.test","staging.agapay.test"]);
const assets = await privateStreamAssets(streamEnv, "stream-one", streamFetch);
assert.match(assets.hlsUrl, /signed-token\/manifest\/video\.m3u8$/);
assert.doesNotMatch(assets.hlsUrl, /stream-one/, "playback response must never expose a default UID manifest");
await assert.rejects(() => privateStreamAssets(streamEnv, "stream-one", async (url) => String(url).endsWith("/token") ? Response.json({success:true,result:{token:"x"}}) : Response.json({success:true,result:{readyToStream:false,requireSignedURLs:true,status:{state:"inprogress"},playback:{hls:"https://customer-code.cloudflarestream.com/id/manifest/video.m3u8"}}})), /still processing/);

const beforeYouTubeReads = sqlite.prepare("SELECT COUNT(*) count FROM parish_content_reads").get().count;
await assert.rejects(() => addYouTubeLink(db, { parishId:"parish-one", addedBy:"staff@example.test", value:"https://www.youtube.com/watch?v=broken1", fetchImpl:async()=>new Response("not found",{status:404}) }), /could not resolve/);
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM parish_youtube_links").get().count, 0, "broken oEmbed links must not be stored");
const resolved = await resolveYouTubeVideo("https://youtu.be/dQw4w9WgXcQ", async()=>Response.json({provider_name:"YouTube",title:"Parish channel video",thumbnail_url:"https://i.ytimg.com/vi/test/hqdefault.jpg"}));
await addYouTubeLink(db, { parishId:"parish-one", addedBy:"staff@example.test", value:resolved.youtubeUrl, fetchImpl:async()=>Response.json({provider_name:"YouTube",title:"Parish channel video",thumbnail_url:"https://i.ytimg.com/vi/test/hqdefault.jpg"}) });
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM parish_content_reads").get().count, beforeYouTubeReads, "YouTube curation must never create read tracking");

const sources = Object.fromEntries(["src/handlers/parish-video.js","src/worker.js","public/parish/dashboard.html","public/parish/app.js","public/myagapay/parish-life.html","public/myagapay/media.html","public/myagapay/media.js","public/myagapay/watch.html","public/myagapay/watch.js","public/donor/style.css"].map(file=>[file,readFileSync(path.join(root,file),"utf8")]));
assert.match(sources["src/handlers/parish-video.js"], /requireSignedURLs:\s*true/);
assert.match(sources["src/handlers/parish-video.js"], /WHERE id = \? AND parish_id = \? AND status = 'published'/);
assert.match(sources["public/parish/app.js"], /uploadVideoDirectly\(data\.uploadUrl, file/);
assert.match(sources["public/myagapay/media.html"], /href="\/myagapay\/parish-life"[^>]*>← Back</);
assert.match(sources["public/myagapay/watch.html"], /href="\/myagapay\/parish-life"[^>]*>← Back</);
assert.match(sources["public/myagapay/watch.html"], /<video id="streamVideo" playsinline preload="metadata"><\/video>/, "custom watch page must not use Stream iframe or native controls");
assert.doesNotMatch(sources["public/myagapay/watch.html"], /<iframe|<video[^>]+controls/);
assert.match(sources["public/myagapay/watch.js"], /new Hls/);
assert.match(sources["public/myagapay/media.html"], /Public, external media[\s\S]*public on YouTube/i);
assert.match(sources["public/donor/style.css"], /--media-navy:#061522[\s\S]*--media-gold/);

const context = { waitUntil() {} };
for (const pathname of ["/api/donor/videos", `/api/donor/videos/${draft.id}/playback`, "/myagapay/media", "/myagapay/media/watch"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT:"production" }, context);
  assert.equal(production.status, 404, `${pathname} must remain staging-only`);
}
console.log("PASS - Parish Life private video, signed playback, receipt-derived watches, YouTube validation, custom HLS UI, and staging gate");
