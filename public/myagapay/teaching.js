const TEACHING_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "homilies", label: "Homilies" },
  { value: "catechism", label: "Catechism" },
  { value: "liturgical", label: "Liturgical" },
  { value: "choir", label: "Choir" },
  { value: "special_events", label: "Special Events" },
]);

let teachingState = { posts: [], unreadCount: 0, filter: "all" };
const PODCAST_SAVE_INTERVAL_MS = 15000;
const PODCAST_COMPLETE_WINDOW_SECONDS = 5;
const PODCAST_PLAYBACK_RATES = new Set([1, 1.25, 1.5, 1.75, 2]);
let koinoniaPodcastState = {
  results: [], show: null, episodes: [], hasSearched: false, requestId: 0,
  progressItems: [], progressByKey: new Map(), progressLoaded: false, progressPromise: null,
  playbackRate: 1, currentEpisode: null, queue: [], saveTimer: null, switchingEpisode: false,
};

function setAudioLibraryMode(mode = "parish") {
  const selected = mode === "podcasts" ? "podcasts" : "parish";
  document.querySelectorAll("[data-audio-library-pane]").forEach((pane) => { pane.hidden = pane.dataset.audioLibraryPane !== selected; });
  document.querySelectorAll("[data-audio-library-mode]").forEach((button) => {
    const active = button.dataset.audioLibraryMode === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (selected === "podcasts" && !koinoniaPodcastState.hasSearched) void runKoinoniaPodcastSearch("Orthodox");
}

function podcastText(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function podcastEpisodeKey(guid, audioUrl) {
  return String(guid || "").trim() || String(audioUrl || "").trim();
}

function podcastDurationSeconds(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function parseKoinoniaPodcastFeed(xml, xmlUrl) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("This podcast feed could not be read.");
  const title = podcastText(documentNode, "channel > title") || "Podcast";
  const image = documentNode.querySelector("channel image[href]")?.getAttribute("href") || podcastText(documentNode, "channel > image > url");
  const episodes = [...documentNode.querySelectorAll("item")].map((item) => {
    const enclosure = item.querySelector("enclosure");
    const audioUrl = enclosure?.getAttribute("url") || "";
    const guid = podcastText(item, "guid");
    const duration = podcastText(item, "duration");
    return {
      title: podcastText(item, "title") || "Untitled episode",
      show: title,
      guid,
      episodeKey: podcastEpisodeKey(guid, audioUrl),
      audioUrl,
      date: podcastText(item, "pubDate"),
      duration,
      durationSeconds: podcastDurationSeconds(duration),
      description: podcastText(item, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280),
      image: item.querySelector("image[href]")?.getAttribute("href") || image,
      xmlUrl,
    };
  }).filter((episode) => episode.audioUrl).slice(0, 30);
  return { title, image, episodes };
}

function podcastTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderKoinoniaContinueListening() {
  const section = document.getElementById("koinoniaContinueListening");
  const list = document.getElementById("koinoniaContinueList");
  if (!section || !list) return;
  section.hidden = !koinoniaPodcastState.progressItems.length;
  list.innerHTML = koinoniaPodcastState.progressItems.map((item, index) => {
    const duration = Number(item.durationSeconds) || 0;
    const position = Math.max(0, Number(item.positionSeconds) || 0);
    const percent = duration ? Math.min(100, Math.round((position / duration) * 100)) : 0;
    return `<button type="button" class="koinonia-continue-item" onclick="resumeKoinoniaPodcastProgress(${index})">
      <span class="koinonia-continue-play" aria-hidden="true">▶</span>
      <span><small>${teachingEscape(item.showTitle || "Orthodox Podcast")}</small><strong>${teachingEscape(item.episodeTitle || "Untitled episode")}</strong><span class="koinonia-continue-progress"><i style="width:${percent}%"></i></span><em>${podcastTime(position)}${duration ? ` of ${podcastTime(duration)}` : " listened"}</em></span>
    </button>`;
  }).join("");
}

async function loadKoinoniaPodcastProgress(force = false) {
  if (koinoniaPodcastState.progressLoaded && !force) return koinoniaPodcastState.progressItems;
  if (koinoniaPodcastState.progressPromise && !force) return koinoniaPodcastState.progressPromise;
  const request = (async () => {
    const response = await fetch("/api/listen/progress", { headers: teachingHeaders(), cache: "no-store" });
    if (response.status === 401) return [];
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load listening progress.");
    koinoniaPodcastState.progressItems = Array.isArray(data.items) ? data.items : [];
    koinoniaPodcastState.progressByKey = new Map(koinoniaPodcastState.progressItems.map((item) => [item.episodeKey, item]));
    const rate = Number(data.playbackRate);
    koinoniaPodcastState.playbackRate = PODCAST_PLAYBACK_RATES.has(rate) ? rate : 1;
    koinoniaPodcastState.progressLoaded = true;
    const speed = document.getElementById("koinoniaPodcastSpeed");
    if (speed) speed.value = String(koinoniaPodcastState.playbackRate);
    renderKoinoniaContinueListening();
    return koinoniaPodcastState.progressItems;
  })().catch(() => {
    koinoniaPodcastState.progressLoaded = true;
    renderKoinoniaContinueListening();
    return [];
  }).finally(() => { koinoniaPodcastState.progressPromise = null; });
  koinoniaPodcastState.progressPromise = request;
  return request;
}

function renderKoinoniaPodcastResults() {
  const target = document.getElementById("koinoniaPodcastResults");
  if (!target) return;
  target.innerHTML = koinoniaPodcastState.results.length ? koinoniaPodcastState.results.map((podcast, index) => `
    <button type="button" class="koinonia-podcast-result" onclick="openKoinoniaPodcast(${index})">
      <span class="koinonia-podcast-cover">${podcast.artwork ? `<img src="${teachingEscape(podcast.artwork)}" alt="" loading="lazy" />` : "♪"}</span>
      <span><strong>${teachingEscape(podcast.title || "Podcast")}</strong><small>${teachingEscape(podcast.author || podcast.category || "Podcast")}</small></span>
      <em>Episodes →</em>
    </button>`).join("") : "";
}

async function runKoinoniaPodcastSearch(query, button = null) {
  const status = document.getElementById("koinoniaPodcastStatus");
  const target = document.getElementById("koinoniaPodcastResults");
  if (!query || !status || !target) return;
  const requestId = ++koinoniaPodcastState.requestId;
  koinoniaPodcastState.hasSearched = true;
  if (button) button.disabled = true;
  status.dataset.tone = "loading";
  status.textContent = "Searching the podcast directory…";
  target.setAttribute("aria-busy", "true");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/listen/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "Podcast search is temporarily unavailable.");
    if (requestId !== koinoniaPodcastState.requestId) return;
    koinoniaPodcastState.results = data.feeds || [];
    status.dataset.tone = koinoniaPodcastState.results.length ? "success" : "empty";
    status.textContent = koinoniaPodcastState.results.length ? `${koinoniaPodcastState.results.length} podcasts found` : "No podcasts matched that search.";
    document.getElementById("koinoniaPodcastShow").hidden = true;
    renderKoinoniaPodcastResults();
  } catch (error) {
    if (requestId !== koinoniaPodcastState.requestId) return;
    koinoniaPodcastState.results = [];
    renderKoinoniaPodcastResults();
    status.dataset.tone = "error";
    status.textContent = error.name === "AbortError" ? "Podcast search took too long. Please try again." : (error.message || "Podcast search is temporarily unavailable.");
  } finally {
    window.clearTimeout(timeout);
    target.setAttribute("aria-busy", "false");
    if (button) button.disabled = false;
  }
}

async function searchKoinoniaPodcasts(event) {
  event.preventDefault();
  const query = document.getElementById("koinoniaPodcastQuery")?.value.trim() || "";
  const button = event.currentTarget.querySelector('button[type="submit"]');
  await runKoinoniaPodcastSearch(query, button);
}

async function openKoinoniaPodcast(index) {
  const podcast = koinoniaPodcastState.results[index];
  const status = document.getElementById("koinoniaPodcastStatus");
  if (!podcast?.url) return;
  status.textContent = `Loading ${podcast.title || "podcast"}…`;
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(podcast.url)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("This podcast feed is temporarily unavailable.");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), podcast.url);
    koinoniaPodcastState.show = { ...podcast, ...parsed };
    koinoniaPodcastState.episodes = parsed.episodes;
    const show = document.getElementById("koinoniaPodcastShow");
    show.hidden = false;
    show.innerHTML = `<header><span class="koinonia-podcast-cover is-large">${parsed.image || podcast.artwork ? `<img src="${teachingEscape(parsed.image || podcast.artwork)}" alt="" />` : "♪"}</span><span><small>Podcast</small><h3>${teachingEscape(parsed.title || podcast.title)}</h3><p>${parsed.episodes.length} recent episodes</p></span></header><div>${parsed.episodes.map((episode, episodeIndex) => `
      <div class="koinonia-podcast-episode-row"><button type="button" class="koinonia-podcast-episode" onclick="playKoinoniaPodcastEpisode(${episodeIndex})">
        <span aria-hidden="true">▶</span><span><strong>${teachingEscape(episode.title)}</strong><small>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ""}</small></span><em>Play</em>
      </button><button type="button" class="koinonia-podcast-queue" onclick="queueKoinoniaPodcastEpisode(${episodeIndex})" aria-label="Add ${teachingEscape(episode.title)} to Up Next">＋ Up Next</button></div>`).join("") || '<div class="feed-empty"><strong>No playable episodes</strong><p>This feed did not provide audio enclosures.</p></div>'}</div>`;
    status.textContent = "";
    show.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status.textContent = error.message || "This podcast feed is temporarily unavailable.";
  }
}

function waitForPodcastMetadata(audio) {
  if (audio.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { window.clearTimeout(timeout); audio.removeEventListener("loadedmetadata", finish); audio.removeEventListener("error", finish); resolve(); };
    const timeout = window.setTimeout(finish, 10000);
    audio.addEventListener("loadedmetadata", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
  });
}

async function playKoinoniaPodcast(episode) {
  const player = document.getElementById("koinoniaPodcastPlayer");
  const audio = document.getElementById("koinoniaPodcastAudio");
  if (!episode || !player || !audio) return;
  await loadKoinoniaPodcastProgress();
  if (koinoniaPodcastState.currentEpisode && koinoniaPodcastState.currentEpisode.episodeKey !== episode.episodeKey) void saveKoinoniaPodcastProgress();
  koinoniaPodcastState.switchingEpisode = true;
  audio.pause();
  koinoniaPodcastState.currentEpisode = episode;
  document.getElementById("koinoniaPodcastPlayerTitle").textContent = episode.title;
  document.getElementById("koinoniaPodcastPlayerShow").textContent = episode.show || "Orthodox Podcast";
  const image = document.getElementById("koinoniaPodcastPlayerImage");
  image.src = episode.image || "/listen/images/app/icon-192.png";
  image.alt = episode.show ? `${episode.show} artwork` : "Podcast artwork";
  player.hidden = false;
  audio.src = episode.audioUrl;
  audio.playbackRate = koinoniaPodcastState.playbackRate;
  audio.load();
  await waitForPodcastMetadata(audio);
  audio.playbackRate = koinoniaPodcastState.playbackRate;
  const saved = koinoniaPodcastState.progressByKey.get(episode.episodeKey);
  const duration = Number.isFinite(audio.duration) ? audio.duration : Number(saved?.durationSeconds || episode.durationSeconds || 0);
  const savedPosition = Number(saved?.positionSeconds) || 0;
  if (savedPosition > 0 && (!duration || savedPosition < duration - PODCAST_COMPLETE_WINDOW_SECONDS)) audio.currentTime = savedPosition;
  koinoniaPodcastState.switchingEpisode = false;
  try { await audio.play(); } catch { /* Browser may require a second explicit play gesture. */ }
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: episode.title, artist: episode.show || "Orthodox Podcast", album: "Koinonia Audio Library", artwork: [{ src: image.src, sizes: "192x192" }] }); } catch { /* Metadata is optional. */ }
  }
  updateKoinoniaPodcastPlayer();
}

async function playKoinoniaPodcastEpisode(index) {
  return playKoinoniaPodcast(koinoniaPodcastState.episodes[index]);
}

function renderKoinoniaPodcastQueue() {
  const count = document.getElementById("koinoniaPodcastQueueCount");
  if (!count) return;
  count.hidden = !koinoniaPodcastState.queue.length;
  count.textContent = `${koinoniaPodcastState.queue.length} Up Next`;
}

function queueKoinoniaPodcastEpisode(index) {
  const episode = koinoniaPodcastState.episodes[index];
  if (!episode || koinoniaPodcastState.queue.some((item) => item.episodeKey === episode.episodeKey)) return;
  koinoniaPodcastState.queue.push(episode);
  if (koinoniaPodcastState.queue.length > 5) koinoniaPodcastState.queue.shift();
  renderKoinoniaPodcastQueue();
}

async function resumeKoinoniaPodcastProgress(index) {
  const saved = koinoniaPodcastState.progressItems[index];
  const status = document.getElementById("koinoniaPodcastStatus");
  if (!saved) return;
  if (status) status.textContent = `Loading ${saved.episodeTitle || "episode"}…`;
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(saved.feedUrl)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("This podcast feed is temporarily unavailable.");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), saved.feedUrl);
    const episode = parsed.episodes.find((item) => item.episodeKey === saved.episodeKey);
    if (!episode) throw new Error("That episode is no longer available in its podcast feed.");
    if (status) status.textContent = "";
    await playKoinoniaPodcast(episode);
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to resume this episode.";
  }
}

function podcastProgressPayload(completed = false) {
  const audio = document.getElementById("koinoniaPodcastAudio");
  const episode = koinoniaPodcastState.currentEpisode;
  if (!audio || !episode) return null;
  const duration = Number.isFinite(audio.duration) ? audio.duration : Number(episode.durationSeconds || 0);
  return {
    episodeKey: episode.episodeKey,
    feedUrl: episode.xmlUrl,
    showTitle: episode.show || "Orthodox Podcast",
    episodeTitle: episode.title || "Untitled episode",
    positionSeconds: completed ? Math.max(audio.currentTime, duration || 0) : audio.currentTime,
    durationSeconds: duration || null,
    playbackRate: koinoniaPodcastState.playbackRate,
    completed,
  };
}

async function saveKoinoniaPodcastProgress({ completed = false, keepalive = false } = {}) {
  const payload = podcastProgressPayload(completed);
  if (!payload || (!completed && payload.positionSeconds < 1)) return;
  const request = fetch("/api/listen/progress", {
    method: "POST", headers: teachingHeaders(), body: JSON.stringify(payload), keepalive,
  }).then(async (response) => {
    if (!response.ok) return;
    if (completed) {
      koinoniaPodcastState.progressByKey.delete(payload.episodeKey);
      koinoniaPodcastState.progressItems = koinoniaPodcastState.progressItems.filter((item) => item.episodeKey !== payload.episodeKey);
    } else {
      const item = { ...payload, updatedAt: new Date().toISOString() };
      delete item.playbackRate;
      delete item.completed;
      koinoniaPodcastState.progressByKey.set(payload.episodeKey, item);
      koinoniaPodcastState.progressItems = [item, ...koinoniaPodcastState.progressItems.filter((entry) => entry.episodeKey !== payload.episodeKey)];
    }
    renderKoinoniaContinueListening();
  }).catch(() => {});
  if (keepalive) { void request; return; }
  await request;
}

async function saveKoinoniaPodcastPlaybackRate() {
  await fetch("/api/listen/progress", {
    method: "POST",
    headers: teachingHeaders(),
    body: JSON.stringify({ playbackRate: koinoniaPodcastState.playbackRate, preferenceOnly: true }),
  }).catch(() => {});
}

function startKoinoniaPodcastSaveTimer() {
  window.clearInterval(koinoniaPodcastState.saveTimer);
  koinoniaPodcastState.saveTimer = window.setInterval(() => { void saveKoinoniaPodcastProgress(); }, PODCAST_SAVE_INTERVAL_MS);
}

function stopKoinoniaPodcastSaveTimer() {
  window.clearInterval(koinoniaPodcastState.saveTimer);
  koinoniaPodcastState.saveTimer = null;
}

function updateKoinoniaPodcastPlayer() {
  const audio = document.getElementById("koinoniaPodcastAudio");
  const progress = document.getElementById("koinoniaPodcastProgress");
  const time = document.getElementById("koinoniaPodcastTime");
  const toggle = document.getElementById("koinoniaPodcastPlayToggle");
  if (!audio || !progress || !time || !toggle) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  progress.value = duration ? String(Math.round((audio.currentTime / duration) * 1000)) : "0";
  time.textContent = `${podcastTime(audio.currentTime)} / ${podcastTime(duration)}`;
  toggle.textContent = audio.paused ? "▶" : "❚❚";
  toggle.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
}

function toggleKoinoniaPodcastPlayback() {
  const audio = document.getElementById("koinoniaPodcastAudio");
  if (!audio?.src) return;
  if (audio.paused) void audio.play(); else audio.pause();
}

function skipKoinoniaPodcast(seconds) {
  const audio = document.getElementById("koinoniaPodcastAudio");
  if (!audio?.src) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER;
  audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + Number(seconds || 0)));
}

function bindKoinoniaPodcastPlayer() {
  const audio = document.getElementById("koinoniaPodcastAudio");
  const progress = document.getElementById("koinoniaPodcastProgress");
  const speed = document.getElementById("koinoniaPodcastSpeed");
  if (!audio || !progress || !speed) return;
  audio.addEventListener("play", () => { startKoinoniaPodcastSaveTimer(); updateKoinoniaPodcastPlayer(); });
  audio.addEventListener("pause", () => {
    stopKoinoniaPodcastSaveTimer(); updateKoinoniaPodcastPlayer();
    if (!koinoniaPodcastState.switchingEpisode && !audio.ended) void saveKoinoniaPodcastProgress();
  });
  audio.addEventListener("timeupdate", updateKoinoniaPodcastPlayer);
  audio.addEventListener("loadedmetadata", updateKoinoniaPodcastPlayer);
  audio.addEventListener("seeked", () => { updateKoinoniaPodcastPlayer(); void saveKoinoniaPodcastProgress(); });
  audio.addEventListener("ended", async () => {
    stopKoinoniaPodcastSaveTimer();
    await saveKoinoniaPodcastProgress({ completed: true });
    const next = koinoniaPodcastState.queue.shift();
    renderKoinoniaPodcastQueue();
    if (next) await playKoinoniaPodcast(next);
  });
  progress.addEventListener("change", () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  });
  speed.addEventListener("change", () => {
    const rate = Number(speed.value);
    if (!PODCAST_PLAYBACK_RATES.has(rate)) return;
    koinoniaPodcastState.playbackRate = rate;
    audio.playbackRate = rate;
    void saveKoinoniaPodcastPlaybackRate();
    void saveKoinoniaPodcastProgress();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void saveKoinoniaPodcastProgress({ keepalive: true });
  });
  window.addEventListener("pagehide", () => {
    void saveKoinoniaPodcastProgress({ keepalive: true });
    koinoniaPodcastState.queue = [];
  });
  window.addEventListener("beforeunload", () => {
    void saveKoinoniaPodcastProgress({ keepalive: true });
    koinoniaPodcastState.queue = [];
  });
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => void audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("seekbackward", (details) => skipKoinoniaPodcast(-(details.seekOffset || 15)));
      navigator.mediaSession.setActionHandler("seekforward", (details) => skipKoinoniaPodcast(details.seekOffset || 30));
    } catch { /* Some browsers expose Media Session without every action handler. */ }
  }
}

function teachingEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function teachingDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function teachingHeaders() {
  return window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || {};
}

function teachingPostsForFilter(filter) {
  if (filter === "all") return teachingState.posts;
  return teachingState.posts.filter((post) => (post.category || "homilies") === filter);
}

function renderTeachingCategoryFilters() {
  const filters = document.getElementById("teachingCategoryFilters");
  if (!filters) return;
  filters.innerHTML = TEACHING_FILTERS.map(({ value, label }) => {
    const active = teachingState.filter === value;
    return `<button type="button" class="${active ? "is-active" : ""}" aria-pressed="${active}" onclick="setTeachingCategoryFilter('${value}')"><span>${teachingEscape(label)}</span><strong>${teachingPostsForFilter(value).length}</strong></button>`;
  }).join("");
}

function setTeachingCategoryFilter(filter) {
  if (!TEACHING_FILTERS.some(({ value }) => value === filter)) return;
  teachingState.filter = filter;
  renderTeaching();
}

function renderTeaching() {
  const list = document.getElementById("teachingList");
  const summary = document.getElementById("teachingUnreadSummary");
  const unread = Math.max(0, Number(teachingState.unreadCount) || 0);
  summary.hidden = unread === 0;
  summary.textContent = `${unread} unread`;
  window.MyAgapayShell?.setTeachingUnreadCount(unread);
  renderTeachingCategoryFilters();
  if (!teachingState.posts.length) {
    list.innerHTML = '<div class="feed-empty"><strong>No recordings yet</strong><p>Your parish’s published audio and reflections will appear here.</p></div>';
    return;
  }
  const visiblePosts = teachingPostsForFilter(teachingState.filter);
  if (!visiblePosts.length) {
    const selected = TEACHING_FILTERS.find(({ value }) => value === teachingState.filter)?.label || "selected";
    list.innerHTML = `<div class="feed-empty"><strong>No ${teachingEscape(selected.toLowerCase())} posts</strong><p>Published teaching in this category will appear here.</p></div>`;
    return;
  }
  list.innerHTML = visiblePosts.map((post) => `
    <article class="feed-card teaching-card${post.read ? "" : " is-unread"}" id="${teachingEscape(post.id)}" data-teaching-id="${teachingEscape(post.id)}">
      <button class="feed-card-summary" type="button" onclick="openTeachingPost('${teachingEscape(post.id)}')" aria-expanded="false">
        <span class="teaching-card-icon" aria-hidden="true">${post.audioUrl ? "▶" : "✦"}</span>
        <span class="feed-card-copy"><span class="feed-card-flags"><em>${teachingEscape(TEACHING_FILTERS.find(({ value }) => value === (post.category || "homilies"))?.label || "Homilies")}</em>${post.audioUrl ? "<em>Audio</em>" : "<em>Reflection</em>"}${post.read ? "" : '<em class="feed-new">New</em>'}</span><strong>${teachingEscape(post.title)}</strong><small>${teachingEscape(teachingDate(post.publishedAt))}</small></span>
      </button>
      <div class="feed-card-detail teaching-card-detail" hidden>
        ${post.audioUrl ? `<audio controls preload="metadata" src="${teachingEscape(post.audioUrl)}">Your browser does not support audio playback.</audio>` : ""}
        <div class="feed-card-body">${post.bodyHtml || teachingEscape(post.body)}</div>
      </div>
    </article>
  `).join("");
}

async function openTeachingPost(teachingId) {
  const post = teachingState.posts.find((item) => item.id === teachingId);
  const card = document.querySelector(`[data-teaching-id="${CSS.escape(teachingId)}"]`);
  if (!post || !card) return;
  const detail = card.querySelector(".feed-card-detail");
  const button = card.querySelector(".feed-card-summary");
  const opening = detail.hidden;
  detail.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
  if (!opening || post.read) return;
  const response = await fetch(`/api/donor/teaching/${encodeURIComponent(teachingId)}/read`, { method: "POST", headers: teachingHeaders() });
  if (!response.ok) return;
  post.read = true;
  teachingState.unreadCount = Math.max(0, teachingState.unreadCount - 1);
  renderTeaching();
  const reopened = document.querySelector(`[data-teaching-id="${CSS.escape(teachingId)}"]`);
  if (reopened) {
    reopened.querySelector(".feed-card-detail").hidden = false;
    reopened.querySelector(".feed-card-summary").setAttribute("aria-expanded", "true");
  }
}

async function loadTeaching() {
  const status = document.getElementById("teachingStatus");
  try {
    const response = await fetch("/api/donor/teaching", { headers: teachingHeaders(), cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load parish teaching.");
    teachingState = { posts: data.posts || [], unreadCount: Number(data.unreadCount || 0), filter: teachingState.filter || "all" };
    if (data.parish?.name) document.getElementById("teachingParishName").textContent = data.parish.name;
    status.hidden = true;
    renderTeaching();
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (targetId && teachingState.posts.some(({ id }) => id === targetId)) void openTeachingPost(targetId);
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load parish teaching.";
  }
}

window.setAudioLibraryMode = setAudioLibraryMode;
window.searchKoinoniaPodcasts = searchKoinoniaPodcasts;
window.openKoinoniaPodcast = openKoinoniaPodcast;
window.playKoinoniaPodcastEpisode = playKoinoniaPodcastEpisode;
window.queueKoinoniaPodcastEpisode = queueKoinoniaPodcastEpisode;
window.resumeKoinoniaPodcastProgress = resumeKoinoniaPodcastProgress;
window.toggleKoinoniaPodcastPlayback = toggleKoinoniaPodcastPlayback;
window.skipKoinoniaPodcast = skipKoinoniaPodcast;
document.addEventListener("DOMContentLoaded", () => {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  bindKoinoniaPodcastPlayer();
  void loadKoinoniaPodcastProgress();
  setAudioLibraryMode(requestedMode === "podcasts" ? "podcasts" : "parish");
  void loadTeaching();
});
