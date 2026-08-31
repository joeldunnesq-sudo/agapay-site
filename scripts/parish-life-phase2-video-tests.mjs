import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
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
  deleteVideoPost,
  getDonorVideoFeed,
  markVideoWatched,
  fetchLatestYouTubeChannelVideo,
  parseLatestYouTubeChannelVideo,
  privateStreamAssets,
  renderVideoDescription,
  resolveYouTubeChannel,
  resolveYouTubeVideo,
  saveYouTubeChannel,
  setYouTubeLinkPinned,
  streamIsReady,
  updateVideoPost,
} from "../src/handlers/parish-video.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
for (const migration of ["0064_parish_content_reads.sql", "0070_parish_content_read_receipts_index.sql", "0072_parish_teaching_posts.sql", "0073_parish_private_video.sql", "0085_parish_youtube_channels.sql", "0086_parish_youtube_video_pins.sql"]) {
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

const deletableDraft = await createVideoDraft(db, { parishId:"parish-one", createdBy:"staff@example.test", streamVideoId:"stream-delete", input:{ title:"Delete this draft" } });
let deletedStreamRequest = null;
await deleteVideoPost(db, streamEnv, { parishId:"parish-one", videoId:deletableDraft.id }, async (url, init) => {
  deletedStreamRequest = { url:String(url), method:init.method };
  return Response.json({ success:true, result:null });
});
assert.match(deletedStreamRequest.url, /\/stream-delete$/, "deleting a draft must target its hosted Stream asset");
assert.equal(deletedStreamRequest.method, "DELETE");
assert.equal(sqlite.prepare("SELECT id FROM parish_video_posts WHERE id = ?").get(deletableDraft.id), undefined);

const beforeYouTubeReads = sqlite.prepare("SELECT COUNT(*) count FROM parish_content_reads").get().count;
await assert.rejects(() => addYouTubeLink(db, { parishId:"parish-one", addedBy:"staff@example.test", value:"https://www.youtube.com/watch?v=broken1", fetchImpl:async()=>new Response("not found",{status:404}) }), /could not resolve/);
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM parish_youtube_links").get().count, 0, "broken oEmbed links must not be stored");
const resolved = await resolveYouTubeVideo("https://youtu.be/dQw4w9WgXcQ", async()=>Response.json({provider_name:"YouTube",title:"Parish channel video",thumbnail_url:"https://i.ytimg.com/vi/test/hqdefault.jpg"}));
const curatedYouTube = await addYouTubeLink(db, { parishId:"parish-one", addedBy:"staff@example.test", value:resolved.youtubeUrl, fetchImpl:async()=>Response.json({provider_name:"YouTube",title:"Parish channel video",thumbnail_url:"https://i.ytimg.com/vi/test/hqdefault.jpg"}) });
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM parish_content_reads").get().count, beforeYouTubeReads, "YouTube curation must never create read tracking");
assert.equal((await setYouTubeLinkPinned(db, { parishId:"parish-one", linkId:curatedYouTube.id, pinned:true })).pinned, true);
assert.equal(sqlite.prepare("SELECT pinned FROM parish_youtube_links WHERE id = ?").get(curatedYouTube.id).pinned, 1, "a parish must be able to pin a specific YouTube video");

const channelId = "UC1234567890123456789012";
const channelHtml = `<html><head><meta property="og:title" content="Saint Fiacre Orthodox Church"><meta itemprop="channelId" content="${channelId}"></head></html>`;
const resolvedChannel = await resolveYouTubeChannel("https://www.youtube.com/@saintfiacre", async (url) => {
  assert.equal(String(url), "https://www.youtube.com/@saintfiacre");
  return new Response(channelHtml, { headers:{ "content-type":"text/html" } });
});
assert.equal(resolvedChannel.channelId, channelId);
assert.equal(resolvedChannel.uploadsPlaylistId, "UU1234567890123456789012");
const savedChannel = await saveYouTubeChannel(db, { parishId:"parish-one", addedBy:"staff@example.test", value:channelId, fetchImpl:async()=>new Response(channelHtml) });
assert.equal(savedChannel.channelTitle, "Saint Fiacre Orthodox Church");
assert.equal(sqlite.prepare("SELECT channel_id FROM parish_youtube_channels WHERE parish_id = ?").get("parish-one").channel_id, channelId);

const channelFeed = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>latest12345</yt:videoId><title>Newest parish homily &amp; reflection</title><published>2026-08-01T13:15:00+00:00</published></entry><entry><yt:videoId>older123456</yt:videoId><title>Older video</title></entry></feed>`;
assert.equal(parseLatestYouTubeChannelVideo(channelFeed).title, "Newest parish homily & reflection");
let channelFeedRequests = 0;
const latestChannelVideo = await fetchLatestYouTubeChannelVideo(savedChannel, async (url, init) => {
  channelFeedRequests += 1;
  assert.match(String(url), /youtube\.com\/feeds\/videos\.xml\?channel_id=/);
  assert.equal(init.cf.cacheTtl, 900, "the public channel feed should use a short adjustable edge cache");
  return new Response(channelFeed, { headers:{ "content-type":"application/atom+xml" } });
});
assert.equal(channelFeedRequests, 1);
assert.equal(latestChannelVideo.youtubeUrl, "https://www.youtube.com/watch?v=latest12345");
assert.equal(latestChannelVideo.channelUpload, true);

const sources = Object.fromEntries(["src/handlers/parish-video.js","src/worker.js","public/parish/dashboard.html","public/parish/app.js","public/parish/style.css","public/myagapay/parish-life.html","public/myagapay/parish-life.js","public/myagapay/media.html","public/myagapay/media.js","public/myagapay/watch.html","public/myagapay/watch.js","public/donor/style.css"].map(file=>[file,file === "public/parish/app.js" ? readParishDashboardSource() : readFileSync(path.join(root,file),"utf8")]));
assert.match(sources["src/handlers/parish-video.js"], /requireSignedURLs:\s*true/);
assert.match(sources["src/handlers/parish-video.js"], /WHERE id = \? AND parish_id = \? AND status = 'published'/);
for (const functionName of ["createStreamUpload", "createVideoDraft", "privateStreamAssets", "updateVideoPost"]) {
  assert.match(sources["src/handlers/parish-video.js"], new RegExp(`export async function ${functionName}\\b`), `${functionName} must remain available while the UI is paused`);
}
assert.match(sources["src/handlers/parish-video.js"], /parts\[0\] === "upload-url"/, "the direct Stream upload route must remain callable");
assert.match(sources["public/parish/app.js"], /uploadVideoDirectly\(data\.uploadUrl, file/);
assert.match(sources["public/parish/app.js"], /KOINONIA_NATIVE_VIDEO_UPLOADS_VISIBLE\s*=\s*false/, "native upload UI must stay behind the dormant product flag");
assert.match(sources["public/parish/dashboard.html"], /data-native-video-management hidden[\s\S]*data-native-video-upload[\s\S]*createVideoUpload\(event\)/, "native Stream uploads must remain hidden while existing records can still be managed");
assert.match(sources["public/parish/app.js"], /deleteVideo[\s\S]*method:\s*'DELETE'[\s\S]*Video permanently deleted/, "native videos of every status must offer permanent deletion");
assert.match(sources["public/parish/dashboard.html"], /Choose the YouTube privacy setting intentionally[\s\S]*Public:[\s\S]*searchable[\s\S]*Unlisted:[\s\S]*anyone with the link can watch[\s\S]*does not require a login[\s\S]*Private:[\s\S]*explicitly invited Google accounts[\s\S]*every viewer needs a Google account and an individual invitation/i);
assert.match(sources["public/parish/dashboard.html"], /Announcements, Groups, and Teaching[\s\S]*verified-household gate[\s\S]*YouTube-hosted video—even Unlisted—does not carry that same guarantee[\s\S]*AGAPAY cannot control YouTube access[\s\S]*youtubeVideoUrl[\s\S]*Validate and add/i, "privacy guidance must be permanent and appear before submission controls");
assert.match(sources["public/myagapay/media.html"], /href="\/myagapay\/parish-life"[^>]*>← Back</);
assert.match(sources["public/myagapay/watch.html"], /href="\/myagapay\/parish-life"[^>]*>← Back</);
assert.match(sources["public/myagapay/parish-life.js"], />Recent Videos<[\s\S]*href="\/myagapay\/media">All Media/);
assert.match(sources["public/myagapay/parish-life.js"], /parishLifeFetch\("\/api\/donor\/videos"/);
assert.match(sources["public/myagapay/parish-life.js"], /media\.youtubeLatest[\s\S]*Pinned ·[\s\S]*Latest from YouTube/);
assert.match(sources["public/donor/style.css"], /\.parish-life-video-card:last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1 \/ -1;/, "a single or third video card must span the mobile grid instead of disappearing");
assert.doesNotMatch(sources["public/donor/style.css"], /\.parish-life-video-card:last-child:nth-child\(odd\)\s*\{\s*display:\s*none;/, "mobile Koinonia must never hide its only recent video");
assert.match(sources["public/myagapay/watch.html"], /<video id="streamVideo" playsinline preload="metadata"><\/video>/, "custom watch page must not use Stream iframe or native controls");
assert.doesNotMatch(sources["public/myagapay/watch.html"], /<iframe|<video[^>]+controls/);
assert.match(sources["public/myagapay/watch.js"], /new Hls/);
assert.match(sources["public/myagapay/media.html"], /Public parish channel[\s\S]*public YouTube media/i);
assert.match(sources["public/myagapay/media.html"], /id="youtubePlayerModal"[\s\S]*youtubePlayerFrame/);
assert.match(sources["public/myagapay/media.js"], /youtube-nocookie\.com\/embed\/[\s\S]*openYouTubeMedia/);
assert.match(sources["public/myagapay/media.js"], /openYouTubeMediaFullscreen[\s\S]*requestFullscreen[\s\S]*orientation\?\.lock\?\.\("landscape"\)/, "YouTube playback must offer native fullscreen with a landscape request");
assert.match(sources["public/myagapay/media.js"], /dialog\.requestFullscreen \|\| dialog\.webkitRequestFullscreen/, "Android fullscreen must target the same-origin player shell rather than the cross-origin YouTube iframe");
assert.match(sources["public/donor/style.css"], /@media \(orientation:portrait\)[\s\S]*is-landscape-fallback[\s\S]*rotate\(90deg\)/, "mobile browsers that reject orientation locking must receive a landscape player fallback");
assert.match(sources["public/myagapay/media.html"], /youtube-player-fullscreen[\s\S]*allowfullscreen/, "the YouTube player must expose a visible fullscreen control and grant iframe fullscreen permission");
assert.match(sources["public/myagapay/media.js"], /youtube-nocookie\.com\/embed\/videoseries\?list=/, "the connected channel must render its auto-updating uploads playlist inside Koinonia");
assert.match(sources["public/parish/dashboard.html"], /Connect your YouTube channel[\s\S]*New public videos appear automatically/);
assert.match(sources["src/handlers/parish-video.js"], /youtube-channel[\s\S]*saveYouTubeChannel/);
assert.match(sources["src/handlers/parish-video.js"], /feeds\/videos\.xml\?channel_id=[\s\S]*youtubeLatest/);
assert.match(sources["public/parish/app.js"], /toggleYouTubeVideoPin[\s\S]*\/pin/);
assert.match(sources["public/parish/dashboard.html"], /youtube-pin-option[\s\S]*Pin in Recent Videos[\s\S]*Place this video at the top of Koinonia for parishioners/);
assert.match(sources["public/parish/style.css"], /\.youtube-pin-option\s*\{[^}]*grid-template-columns:18px minmax\(0,1fr\)[^}]*gap:10px/, "the pin control must keep its checkbox directly beside its text");
assert.match(sources["public/parish/style.css"], /\.koinonia-studio\s*\{\s*font-family:var\(--sans\)/, "Koinonia body typography must inherit the dashboard's sans family");
assert.match(sources["public/parish/style.css"], /\.communications-admin-header\.koinonia-studio-hero h1[^}]*var\(--serif\)/, "Koinonia headings must use the dashboard's serif family");
assert.doesNotMatch(sources["public/parish/style.css"].slice(sources["public/parish/style.css"].indexOf(".koinonia-studio-hero"), sources["public/parish/style.css"].indexOf("@media (max-width:1120px)")), /Georgia|Inter|Arial/, "Koinonia must not hardcode typography outside the shared site tokens");
assert.match(sources["public/parish/dashboard.html"], /id="nav-communications"[\s\S]*?<svg viewBox="0 0 24 24">([\s\S]*?)<\/svg>[\s\S]*?koinonia-studio-mark[\s\S]*?<svg viewBox="0 0 24 24">\1<\/svg>/, "the Koinonia hero must reuse its sidebar navigation icon");
assert.doesNotMatch(sources["public/parish/style.css"], /\.video-admin-section\s*\{[^}]*background\s*:\s*linear-gradient/i, "the Video subpage must use the same light Koinonia surface as its siblings");
assert.doesNotMatch(sources["public/myagapay/media.js"], /target="_blank"/, "YouTube videos must play inside the Koinonia Media page");
assert.match(sources["public/donor/style.css"], /--media-navy:#061522[\s\S]*--media-gold/);
assert.match(sources["public/donor/style.css"], /Koinonia Media shares the light canvas[\s\S]*\.donor-media-page[^}]*background:#f0ede4/, "Koinonia Media must use the same light canvas as the other tabs");

const context = { waitUntil() {} };
for (const pathname of ["/api/donor/videos", `/api/donor/videos/${draft.id}/playback`, "/myagapay/media", "/myagapay/media/watch"]) {
  const production = await worker.fetch(new Request(`https://agapay.test${pathname}`), { AGAPAY_ENVIRONMENT:"production" }, context);
  assert.equal(production.status, 404, `${pathname} must remain staging-only`);
}
console.log("PASS - Parish Life private video, signed playback, receipt-derived watches, YouTube validation, custom HLS UI, and staging gate");
