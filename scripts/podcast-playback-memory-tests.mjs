import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleListenProgress } from "../src/handlers/listen.js";

class PodcastProgressDb {
  constructor() {
    this.progress = new Map();
    this.preferences = new Map();
    this.clock = 0;
  }

  prepare(sql) {
    const db = this;
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async run() {
        const normalized = sql.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("INSERT INTO donor_podcast_preferences")) {
          db.preferences.set(this.params[0], Number(this.params[1]));
          return { success: true };
        }
        if (normalized.startsWith("DELETE FROM donor_podcast_progress")) {
          db.progress.delete(`${this.params[0]}|${this.params[1]}`);
          return { success: true };
        }
        if (normalized.startsWith("INSERT INTO donor_podcast_progress")) {
          const [donorId, episodeKey, feedUrl, showTitle, episodeTitle, positionSeconds, durationSeconds] = this.params;
          db.clock += 1;
          db.progress.set(`${donorId}|${episodeKey}`, {
            donor_id: donorId, episode_key: episodeKey, feed_url: feedUrl,
            show_title: showTitle, episode_title: episodeTitle,
            position_seconds: positionSeconds, duration_seconds: durationSeconds,
            updated_at: `2026-08-01T00:00:${String(db.clock).padStart(2, "0")}Z`,
          });
          return { success: true };
        }
        throw new Error(`Unexpected run: ${normalized}`);
      },
      async all() {
        const donorId = this.params[0];
        return {
          results: [...db.progress.values()]
            .filter((row) => row.donor_id === donorId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        };
      },
      async first() {
        return db.preferences.has(this.params[0]) ? { playback_rate: db.preferences.get(this.params[0]) } : null;
      },
    };
  }
}

const db = new PodcastProgressDb();
const env = { AGAPAY_DB: db };
const dependencies = {
  requireDonor: async (request) => ({ email: request.headers.get("X-Test-Donor") }),
};

function request(method, donor, body) {
  return new Request("https://agapay.app/api/listen/progress", {
    method,
    headers: { "X-Test-Donor": donor, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const episode = {
  episodeKey: "stable-rss-guid-42",
  feedUrl: "https://example.org/podcast.xml",
  showTitle: "Orthodox Talks",
  episodeTitle: "Prayer and Attention",
  positionSeconds: 615,
  durationSeconds: 1800,
  playbackRate: 1.5,
};

let response = await handleListenProgress(request("POST", "one@example.org", episode), env, dependencies);
assert.equal(response.status, 200);
response = await handleListenProgress(request("GET", "one@example.org"), env, dependencies);
let payload = await response.json();
assert.equal(payload.items[0].episodeKey, episode.episodeKey, "saved progress must be returned on the next playback lookup");
assert.equal(payload.items[0].positionSeconds, 615, "resume must receive the saved position");
assert.equal(payload.playbackRate, 1.5, "playback speed must persist across episodes");

await handleListenProgress(request("POST", "one@example.org", { playbackRate: 1.75, preferenceOnly: true }), env, dependencies);
response = await handleListenProgress(request("GET", "one@example.org"), env, dependencies);
payload = await response.json();
assert.equal(payload.playbackRate, 1.75, "a speed change at 0:00 must persist without requiring progress");
assert.equal(payload.items.length, 1, "a speed-only save must not create a Continue Listening entry");

await handleListenProgress(request("POST", "two@example.org", { ...episode, positionSeconds: 90, playbackRate: 2 }), env, dependencies);
response = await handleListenProgress(request("GET", "two@example.org"), env, dependencies);
payload = await response.json();
assert.equal(payload.items[0].positionSeconds, 90);
assert.equal(payload.playbackRate, 2);
response = await handleListenProgress(request("GET", "one@example.org"), env, dependencies);
payload = await response.json();
assert.equal(payload.items[0].positionSeconds, 615, "one donor must never receive another donor's position");
assert.equal(payload.playbackRate, 1.75, "one donor must never receive another donor's speed");

await handleListenProgress(request("POST", "one@example.org", { ...episode, positionSeconds: 1797 }), env, dependencies);
response = await handleListenProgress(request("GET", "one@example.org"), env, dependencies);
payload = await response.json();
assert.deepEqual(payload.items, [], "near-complete episodes must leave Continue Listening");
assert.equal(payload.playbackRate, 1.5, "the episode save's selected speed remains after completion");
response = await handleListenProgress(request("GET", "two@example.org"), env, dependencies);
payload = await response.json();
assert.equal(payload.items.length, 1, "completing an episode for one donor must not remove another donor's progress");

const [migration, worker, teaching, teachingHtml] = await Promise.all([
  readFile(new URL("../migrations/0078_donor_podcast_progress.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/teaching.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/teaching.html", import.meta.url), "utf8"),
]);

assert.match(migration, /PRIMARY KEY \(donor_id, episode_key\)/);
assert.match(migration, /idx_donor_podcast_progress_recent[\s\S]*donor_id, updated_at DESC/);
assert.match(worker, /url\.pathname === "\/api\/listen\/progress"[\s\S]*handleListenProgress/);
assert.match(teaching, /function podcastEpisodeKey\(guid, audioUrl\)[\s\S]*trim\(\) \|\| String\(audioUrl/,
  "RSS guid must be preferred with audio URL only as fallback");
const episodeKeyFunction = teaching.match(/function podcastEpisodeKey\(guid, audioUrl\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(episodeKeyFunction, "episode key helper must remain testable");
const resolveEpisodeKey = Function(`${episodeKeyFunction}; return podcastEpisodeKey;`)();
assert.equal(resolveEpisodeKey("rss-guid", "https://cdn.example.org/old.mp3"), "rss-guid");
assert.equal(resolveEpisodeKey("", "https://cdn.example.org/fallback.mp3"), "https://cdn.example.org/fallback.mp3");
assert.match(teaching, /const savedPosition[\s\S]*audio\.currentTime = savedPosition/,
  "saved progress must be applied automatically before playback");
assert.match(teaching, /PODCAST_SAVE_INTERVAL_MS = 15000/);
assert.match(teaching, /addEventListener\("pause"[\s\S]*saveKoinoniaPodcastProgress/);
assert.match(teaching, /addEventListener\("seeked"[\s\S]*saveKoinoniaPodcastProgress/);
assert.match(teaching, /visibilitychange[\s\S]*keepalive: true/);
assert.match(teaching, /pagehide[\s\S]*koinoniaPodcastState\.queue = \[\]/);
assert.match(teaching, /beforeunload[\s\S]*koinoniaPodcastState\.queue = \[\]/);
assert.doesNotMatch(teaching, /localStorage|sessionStorage|indexedDB/, "Up Next must remain memory-only");
assert.match(teachingHtml, /id="koinoniaContinueListening"[\s\S]*Continue Listening/);
assert.match(teachingHtml, /id="koinoniaPodcastSpeed"[\s\S]*1\.25x[\s\S]*2x/);
assert.match(teachingHtml, /skipKoinoniaPodcast\(-15\)[\s\S]*skipKoinoniaPodcast\(30\)/);

console.log("PASS - podcast playback memory is private, resumable, completion-aware, and session-scoped where required");
