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
  subscriptions: [], subscriptionsLoaded: false, subscriptionsPromise: null, latestEpisodes: [],
  libraryView: "latest", expanded: false, sleepTimer: null, sleepAtEnd: false,
};

function setAudioLibraryMode(mode = "parish") {
  const selected = mode === "podcasts" ? "podcasts" : "parish";
  document.querySelectorAll("[data-audio-library-pane]").forEach((pane) => { pane.hidden = pane.dataset.audioLibraryPane !== selected; });
  document.querySelectorAll("[data-audio-library-mode]").forEach((button) => {
    const active = button.dataset.audioLibraryMode === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (selected === "podcasts") {
    void loadKoinoniaPodcastSubscriptions().then(() => loadKoinoniaPodcastLatest());
    if (!koinoniaPodcastState.hasSearched) void runKoinoniaPodcastSearch("Orthodox");
  }
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
      link: podcastText(item, "link"),
      image: item.querySelector("image[href]")?.getAttribute("href") || image,
      xmlUrl,
    };
  }).filter((episode) => episode.audioUrl).slice(0, 30);
  return { title, image, episodes };
}

async function openRequestedKoinoniaPodcastEpisode() {
  const parameters = new URLSearchParams(window.location.search);
  const feedUrl = parameters.get("feed") || "";
  const episodeKey = parameters.get("episode") || "";
  if (!feedUrl || !episodeKey) return false;
  const status = document.getElementById("koinoniaPodcastLatestStatus");
  if (status) status.textContent = "Opening your selected episode…";
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(feedUrl)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("That podcast feed is unavailable right now.");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), feedUrl);
    const episode = parsed.episodes.find((item) => item.episodeKey === episodeKey);
    if (!episode) throw new Error("That episode is no longer present in the podcast feed.");
    await playKoinoniaPodcast(episode);
    return true;
  } catch (error) {
    if (status) status.textContent = error.message || "Unable to open that episode.";
    return false;
  }
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
    const fullSpeed = document.getElementById("koinoniaPodcastFullSpeed");
    if (fullSpeed) fullSpeed.value = String(koinoniaPodcastState.playbackRate);
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

function setKoinoniaPodcastLibraryView(view = "latest") {
  const selected = ["latest", "subscriptions", "discover"].includes(view) ? view : "latest";
  koinoniaPodcastState.libraryView = selected;
  document.querySelectorAll("[data-podcast-library-pane]").forEach((pane) => { pane.hidden = pane.dataset.podcastLibraryPane !== selected; });
  document.querySelectorAll("[data-podcast-library-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.podcastLibraryView === selected));
  if (selected === "latest") void loadKoinoniaPodcastLatest();
  if (selected === "subscriptions") void loadKoinoniaPodcastSubscriptions().then(renderKoinoniaPodcastSubscriptions);
  if (selected === "discover" && !koinoniaPodcastState.hasSearched) void runKoinoniaPodcastSearch("Orthodox");
}

function koinoniaPodcastIsSubscribed(feedUrl) {
  return koinoniaPodcastState.subscriptions.some((item) => item.feedUrl === feedUrl);
}

function renderKoinoniaPodcastSubscriptions() {
  const target = document.getElementById("koinoniaPodcastSubscriptions");
  if (!target) return;
  if (!koinoniaPodcastState.subscriptions.length) {
    target.innerHTML = '<div class="feed-empty"><strong>No subscriptions yet</strong><p>Discover an Orthodox podcast and choose Subscribe. Its newest episodes will then appear together under Latest.</p><button type="button" onclick="setKoinoniaPodcastLibraryView(\'discover\')">Discover podcasts</button></div>';
    return;
  }
  target.innerHTML = koinoniaPodcastState.subscriptions.map((podcast, index) => `<article class="koinonia-podcast-subscription">
    <button type="button" onclick="openKoinoniaSubscribedPodcast(${index})"><span class="koinonia-podcast-cover">${podcast.artwork ? `<img src="${teachingEscape(podcast.artwork)}" alt="" loading="lazy" />` : "♪"}</span><span><strong>${teachingEscape(podcast.title)}</strong><small>${teachingEscape(podcast.author || "Subscribed podcast")}</small></span></button>
    <button type="button" class="is-remove" onclick="unsubscribeKoinoniaPodcastByIndex(${index})">Unsubscribe</button>
  </article>`).join("");
}

async function loadKoinoniaPodcastSubscriptions(force = false) {
  if (koinoniaPodcastState.subscriptionsLoaded && !force) return koinoniaPodcastState.subscriptions;
  if (koinoniaPodcastState.subscriptionsPromise && !force) return koinoniaPodcastState.subscriptionsPromise;
  const request = fetch("/api/listen/subscriptions", { headers: teachingHeaders(), cache: "no-store" }).then(async (response) => {
    if (response.status === 401) return { subscriptions: [] };
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load podcast subscriptions.");
    return data;
  }).then((data) => {
    koinoniaPodcastState.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    koinoniaPodcastState.subscriptionsLoaded = true;
    renderKoinoniaPodcastSubscriptions();
    renderKoinoniaPodcastResults();
    return koinoniaPodcastState.subscriptions;
  }).catch(() => {
    koinoniaPodcastState.subscriptionsLoaded = true;
    renderKoinoniaPodcastSubscriptions();
    return [];
  }).finally(() => { koinoniaPodcastState.subscriptionsPromise = null; });
  koinoniaPodcastState.subscriptionsPromise = request;
  return request;
}

function renderKoinoniaPodcastLatest() {
  const target = document.getElementById("koinoniaPodcastLatest");
  const status = document.getElementById("koinoniaPodcastLatestStatus");
  if (!target || !status) return;
  if (!koinoniaPodcastState.subscriptions.length) {
    status.textContent = "Subscribe to a podcast to build your latest-episode feed.";
    target.innerHTML = '<div class="feed-empty"><strong>Your newest episodes will live here</strong><p>No more checking each show separately.</p><button type="button" onclick="setKoinoniaPodcastLibraryView(\'discover\')">Find podcasts</button></div>';
    return;
  }
  status.textContent = koinoniaPodcastState.latestEpisodes.length ? `${koinoniaPodcastState.latestEpisodes.length} recent episodes from ${koinoniaPodcastState.subscriptions.length} subscription${koinoniaPodcastState.subscriptions.length === 1 ? "" : "s"}` : "No playable recent episodes were found.";
  target.innerHTML = koinoniaPodcastState.latestEpisodes.map((episode, index) => `<div class="koinonia-podcast-latest-row">
    <button type="button" onclick="playKoinoniaPodcastLatestEpisode(${index})"><span class="koinonia-podcast-cover">${episode.image ? `<img src="${teachingEscape(episode.image)}" alt="" loading="lazy" />` : "♪"}</span><span><small>${teachingEscape(episode.show)}</small><strong>${teachingEscape(episode.title)}</strong><em>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ""}</em></span><b>▶</b></button>
    <button type="button" onclick="queueKoinoniaPodcastLatestEpisode(${index})">＋ Up Next</button>
  </div>`).join("");
}

async function loadKoinoniaPodcastLatest(force = false) {
  const status = document.getElementById("koinoniaPodcastLatestStatus");
  await loadKoinoniaPodcastSubscriptions(force);
  if (!koinoniaPodcastState.subscriptions.length) { koinoniaPodcastState.latestEpisodes = []; renderKoinoniaPodcastLatest(); return []; }
  if (!force && koinoniaPodcastState.latestEpisodes.length) { renderKoinoniaPodcastLatest(); return koinoniaPodcastState.latestEpisodes; }
  if (status) status.textContent = "Checking your subscriptions for new episodes…";
  const results = await Promise.allSettled(koinoniaPodcastState.subscriptions.slice(0, 30).map(async (subscription) => {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(subscription.feedUrl)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Feed unavailable");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), subscription.feedUrl);
    return parsed.episodes.slice(0, 8).map((episode) => ({ ...episode, image: episode.image || subscription.artwork }));
  }));
  koinoniaPodcastState.latestEpisodes = results.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0)).slice(0, 60);
  renderKoinoniaPodcastLatest();
  return koinoniaPodcastState.latestEpisodes;
}

function playKoinoniaPodcastLatestEpisode(index) { return playKoinoniaPodcast(koinoniaPodcastState.latestEpisodes[index]); }
function queueKoinoniaPodcastLatestEpisode(index) { return queueKoinoniaPodcast(koinoniaPodcastState.latestEpisodes[index]); }

async function subscribeKoinoniaPodcast() {
  const show = koinoniaPodcastState.show;
  if (!show?.url) return;
  const response = await fetch("/api/listen/subscriptions", { method: "POST", headers: teachingHeaders(), body: JSON.stringify({ feedUrl: show.url, title: show.title, artwork: show.image || show.artwork, website: show.link, author: show.author }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || "Unable to subscribe to this podcast."); return; }
  koinoniaPodcastState.subscriptions = [data.subscription, ...koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== data.subscription.feedUrl)];
  koinoniaPodcastState.latestEpisodes = [];
  renderKoinoniaPodcastSubscriptions();
  renderKoinoniaPodcastShow();
  void loadKoinoniaPodcastLatest(true);
}

async function unsubscribeKoinoniaPodcast(feedUrl = "") {
  if (!feedUrl) return;
  const response = await fetch(`/api/listen/subscriptions?url=${encodeURIComponent(feedUrl)}`, { method: "DELETE", headers: teachingHeaders() });
  if (!response.ok) return;
  koinoniaPodcastState.subscriptions = koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== feedUrl);
  koinoniaPodcastState.latestEpisodes = [];
  renderKoinoniaPodcastSubscriptions();
  renderKoinoniaPodcastShow();
  void loadKoinoniaPodcastLatest(true);
}

function unsubscribeKoinoniaPodcastByIndex(index) {
  const podcast = koinoniaPodcastState.subscriptions[index];
  if (podcast) void unsubscribeKoinoniaPodcast(podcast.feedUrl);
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

async function importKoinoniaPodcastFeed(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById("koinoniaPodcastRssUrl");
  const status = document.getElementById("koinoniaPodcastRssStatus");
  const button = form.querySelector('button[type="submit"]');
  const feedUrl = input?.value.trim() || "";
  if (!feedUrl || !status || !button) return;
  button.disabled = true;
  status.dataset.tone = "loading";
  status.textContent = "Reading podcast feed…";
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(feedUrl)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("That RSS feed could not be reached.");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), feedUrl);
    if (!parsed.episodes.length) throw new Error("That feed does not contain playable podcast episodes.");
    const subscriptionResponse = await fetch("/api/listen/subscriptions", {
      method: "POST",
      headers: teachingHeaders(),
      body: JSON.stringify({ feedUrl, title: parsed.title, artwork: parsed.image }),
    });
    const data = await subscriptionResponse.json().catch(() => ({}));
    if (!subscriptionResponse.ok) throw new Error(data.error || "Unable to add this podcast.");
    koinoniaPodcastState.subscriptions = [data.subscription, ...koinoniaPodcastState.subscriptions.filter((item) => item.feedUrl !== data.subscription.feedUrl)];
    koinoniaPodcastState.subscriptionsLoaded = true;
    koinoniaPodcastState.latestEpisodes = [];
    koinoniaPodcastState.show = { ...parsed, url: feedUrl };
    koinoniaPodcastState.episodes = parsed.episodes;
    renderKoinoniaPodcastSubscriptions();
    renderKoinoniaPodcastShow();
    status.dataset.tone = "success";
    status.textContent = `${parsed.title} was added to your library.`;
    input.value = "";
    void loadKoinoniaPodcastLatest(true);
  } catch (error) {
    status.dataset.tone = "error";
    status.textContent = error.message || "Unable to import that RSS feed.";
  } finally {
    button.disabled = false;
  }
}

function renderKoinoniaPodcastShow() {
  const podcast = koinoniaPodcastState.show;
  const show = document.getElementById("koinoniaPodcastShow");
  if (!show || !podcast) return;
  const subscribed = koinoniaPodcastIsSubscribed(podcast.url);
  show.hidden = false;
  show.innerHTML = `<header><span class="koinonia-podcast-cover is-large">${podcast.image || podcast.artwork ? `<img src="${teachingEscape(podcast.image || podcast.artwork)}" alt="" />` : "♪"}</span><span><small>Podcast</small><h3>${teachingEscape(podcast.title)}</h3><p>${podcast.episodes.length} recent episodes</p></span><button type="button" class="koinonia-podcast-subscribe${subscribed ? " is-subscribed" : ""}" onclick="${subscribed ? `unsubscribeKoinoniaPodcastByFeed()` : `subscribeKoinoniaPodcast()`}">${subscribed ? "✓ Subscribed" : "+ Subscribe"}</button></header><div>${podcast.episodes.map((episode, episodeIndex) => `
    <div class="koinonia-podcast-episode-row"><button type="button" class="koinonia-podcast-episode" onclick="playKoinoniaPodcastEpisode(${episodeIndex})">
      <span aria-hidden="true">▶</span><span><strong>${teachingEscape(episode.title)}</strong><small>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ""}</small></span><em>Play</em>
    </button><button type="button" class="koinonia-podcast-queue" onclick="queueKoinoniaPodcastEpisode(${episodeIndex})" aria-label="Add ${teachingEscape(episode.title)} to Up Next">＋ Up Next</button></div>`).join("") || '<div class="feed-empty"><strong>No playable episodes</strong><p>This feed did not provide audio enclosures.</p></div>'}</div>`;
}

function unsubscribeKoinoniaPodcastByFeed() {
  if (koinoniaPodcastState.show?.url) void unsubscribeKoinoniaPodcast(koinoniaPodcastState.show.url);
}

async function loadKoinoniaPodcastShow(podcast) {
  const status = document.getElementById("koinoniaPodcastStatus");
  if (!podcast?.url) return;
  status.textContent = `Loading ${podcast.title || "podcast"}…`;
  try {
    const response = await fetch(`/api/listen/rss?url=${encodeURIComponent(podcast.url)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("This podcast feed is temporarily unavailable.");
    const parsed = parseKoinoniaPodcastFeed(await response.text(), podcast.url);
    koinoniaPodcastState.show = { ...podcast, ...parsed, url: podcast.url };
    koinoniaPodcastState.episodes = parsed.episodes;
    renderKoinoniaPodcastShow();
    status.textContent = "";
    document.getElementById("koinoniaPodcastShow")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status.textContent = error.message || "This podcast feed is temporarily unavailable.";
  }
}

async function openKoinoniaPodcast(index) { return loadKoinoniaPodcastShow(koinoniaPodcastState.results[index]); }

async function openKoinoniaSubscribedPodcast(index) {
  const podcast = koinoniaPodcastState.subscriptions[index];
  if (!podcast) return;
  setKoinoniaPodcastLibraryView("discover");
  return loadKoinoniaPodcastShow({ ...podcast, url: podcast.feedUrl, link: podcast.website });
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
  document.getElementById("koinoniaPodcastPlayerDescription").textContent = episode.description || "Listen now, save your place automatically, or add another episode to Up Next.";
  document.getElementById("koinoniaPodcastDetailsTitle").textContent = episode.title;
  document.getElementById("koinoniaPodcastFullTitle").textContent = episode.title;
  document.getElementById("koinoniaPodcastFullShow").textContent = episode.show || "Orthodox Podcast";
  const image = document.getElementById("koinoniaPodcastPlayerImage");
  image.src = episode.image || "/listen/images/app/icon-192.png";
  image.alt = episode.show ? `${episode.show} artwork` : "Podcast artwork";
  const fullImage = document.getElementById("koinoniaPodcastFullImage");
  fullImage.src = image.src;
  fullImage.alt = image.alt;
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
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: episode.title, artist: "AGAPAY Audio", album: episode.show || "Koinonia Audio Library", artwork: [{ src: image.src, sizes: "192x192" }] }); } catch { /* Metadata is optional. */ }
  }
  updateKoinoniaPodcastPlayer();
}

async function playKoinoniaPodcastEpisode(index) {
  return playKoinoniaPodcast(koinoniaPodcastState.episodes[index]);
}

function renderKoinoniaPodcastQueue() {
  const count = document.getElementById("koinoniaPodcastQueueCount");
  const list = document.getElementById("koinoniaPodcastQueueList");
  if (count) {
    count.hidden = !koinoniaPodcastState.queue.length;
    count.textContent = `${koinoniaPodcastState.queue.length} Up Next`;
  }
  if (list) list.innerHTML = koinoniaPodcastState.queue.length ? koinoniaPodcastState.queue.map((episode, index) => `<div><button type="button" onclick="playQueuedKoinoniaPodcast(${index})"><small>${teachingEscape(episode.show || "Podcast")}</small><strong>${teachingEscape(episode.title)}</strong></button><button type="button" onclick="removeQueuedKoinoniaPodcast(${index})" aria-label="Remove from Up Next">×</button></div>`).join("") : "<span>Your queue is empty.</span>";
}

function queueKoinoniaPodcast(episode) {
  if (!episode || koinoniaPodcastState.queue.some((item) => item.episodeKey === episode.episodeKey)) return;
  koinoniaPodcastState.queue.push(episode);
  if (koinoniaPodcastState.queue.length > 25) koinoniaPodcastState.queue.shift();
  renderKoinoniaPodcastQueue();
}

function queueKoinoniaPodcastEpisode(index) { return queueKoinoniaPodcast(koinoniaPodcastState.episodes[index]); }
function removeQueuedKoinoniaPodcast(index) { koinoniaPodcastState.queue.splice(index, 1); renderKoinoniaPodcastQueue(); }
function clearKoinoniaPodcastQueue() { koinoniaPodcastState.queue = []; renderKoinoniaPodcastQueue(); }
function playQueuedKoinoniaPodcast(index) {
  const episode = koinoniaPodcastState.queue.splice(index, 1)[0];
  renderKoinoniaPodcastQueue();
  if (episode) void playKoinoniaPodcast(episode);
}

function toggleKoinoniaPodcastPlayerExpanded(force) {
  const player = document.getElementById("koinoniaPodcastPlayer");
  if (!player || player.hidden) return;
  const expanded = typeof force === "boolean" ? force : !player.classList.contains("is-expanded");
  player.classList.toggle("is-expanded", expanded);
  document.body.classList.toggle("podcast-player-expanded", expanded);
  player.querySelector(".koinonia-podcast-full-player")?.setAttribute("aria-hidden", String(!expanded));
  koinoniaPodcastState.expanded = expanded;
  const button = document.getElementById("koinoniaPodcastExpand");
  if (button) button.setAttribute("aria-label", expanded ? "Close expanded player" : "Open expanded player");
  if (!expanded) {
    toggleKoinoniaPodcastDetails(false);
    toggleKoinoniaPodcastQueue(false);
  }
}

function toggleKoinoniaPodcastDetails(force) {
  const drawer = document.getElementById("koinoniaPodcastDetailsDrawer");
  const queue = document.getElementById("koinoniaPodcastQueueDrawer");
  if (!drawer) return;
  const open = typeof force === "boolean" ? force : drawer.hidden;
  drawer.hidden = !open;
  if (open && queue) queue.hidden = true;
}

function toggleKoinoniaPodcastQueue(force) {
  const drawer = document.getElementById("koinoniaPodcastQueueDrawer");
  const details = document.getElementById("koinoniaPodcastDetailsDrawer");
  if (!drawer) return;
  const open = typeof force === "boolean" ? force : drawer.hidden;
  drawer.hidden = !open;
  if (open && details) details.hidden = true;
}

function setKoinoniaPodcastSleepTimer(value) {
  window.clearTimeout(koinoniaPodcastState.sleepTimer);
  koinoniaPodcastState.sleepTimer = null;
  koinoniaPodcastState.sleepAtEnd = value === "end";
  const minutes = Number(value);
  if (Number.isFinite(minutes) && minutes > 0) {
    koinoniaPodcastState.sleepTimer = window.setTimeout(() => {
      document.getElementById("koinoniaPodcastAudio")?.pause();
      koinoniaPodcastState.sleepTimer = null;
      const select = document.getElementById("koinoniaPodcastSleepTimer");
      if (select) select.value = "0";
    }, minutes * 60 * 1000);
  }
}

async function shareKoinoniaPodcastEpisode() {
  const episode = koinoniaPodcastState.currentEpisode;
  if (!episode) return;
  const button = document.getElementById("koinoniaPodcastShare");
  const data = { title: episode.title, text: `${episode.title} — ${episode.show || "Orthodox Podcast"}`, url: episode.link || episode.audioUrl };
  if (navigator.share) {
    await navigator.share(data).catch(() => {});
    return;
  }
  const copied = await navigator.clipboard?.writeText(data.url).then(() => true).catch(() => false);
  if (copied && button) {
    button.textContent = "Link copied";
    window.setTimeout(() => { button.innerHTML = '<span aria-hidden="true">↗</span> Share episode'; }, 1600);
  }
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
  if (!audio || !episode || episode.trackProgress === false) return null;
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
  const fullToggle = document.getElementById("koinoniaPodcastFullPlayToggle");
  const fullProgress = document.getElementById("koinoniaPodcastFullProgress");
  if (!audio || !progress || !time || !toggle) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const progressValue = duration ? String(Math.round((audio.currentTime / duration) * 1000)) : "0";
  progress.value = progressValue;
  if (fullProgress) fullProgress.value = progressValue;
  time.textContent = `${podcastTime(audio.currentTime)} / ${podcastTime(duration)}`;
  toggle.textContent = audio.paused ? "▶" : "❚❚";
  toggle.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  if (fullToggle) {
    fullToggle.textContent = audio.paused ? "▶" : "❚❚";
    fullToggle.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  }
  const elapsed = document.getElementById("koinoniaPodcastElapsed");
  const remaining = document.getElementById("koinoniaPodcastRemaining");
  if (elapsed) elapsed.textContent = podcastTime(audio.currentTime);
  if (remaining) remaining.textContent = `-${podcastTime(Math.max(0, duration - audio.currentTime))}`;
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
  const fullProgress = document.getElementById("koinoniaPodcastFullProgress");
  const fullSpeed = document.getElementById("koinoniaPodcastFullSpeed");
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
    if (koinoniaPodcastState.sleepAtEnd) {
      koinoniaPodcastState.sleepAtEnd = false;
      const sleep = document.getElementById("koinoniaPodcastSleepTimer");
      if (sleep) sleep.value = "0";
      return;
    }
    const next = koinoniaPodcastState.queue.shift();
    renderKoinoniaPodcastQueue();
    if (next) await playKoinoniaPodcast(next);
  });
  progress.addEventListener("change", () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  });
  fullProgress?.addEventListener("change", () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(fullProgress.value) / 1000) * audio.duration;
  });
  const changePlaybackRate = (event) => {
    const rate = Number(event.currentTarget.value);
    if (!PODCAST_PLAYBACK_RATES.has(rate)) return;
    koinoniaPodcastState.playbackRate = rate;
    audio.playbackRate = rate;
    speed.value = String(rate);
    if (fullSpeed) fullSpeed.value = String(rate);
    void saveKoinoniaPodcastPlaybackRate();
    void saveKoinoniaPodcastProgress();
  };
  speed.addEventListener("change", changePlaybackRate);
  fullSpeed?.addEventListener("change", changePlaybackRate);
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && koinoniaPodcastState.expanded) toggleKoinoniaPodcastPlayerExpanded(false);
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
      <button class="feed-card-summary" type="button" onclick="${post.audioUrl ? "playParishTeachingAudio" : "openTeachingPost"}('${teachingEscape(post.id)}')" aria-expanded="false"${post.audioUrl ? ` aria-label="Play ${teachingEscape(post.title)} in the Koinonia player"` : ""}>
        <span class="teaching-card-icon" aria-hidden="true">${post.audioUrl ? "▶" : "✦"}</span>
        <span class="feed-card-copy"><span class="feed-card-flags">${post.pinned ? '<em class="feed-pinned">Pinned</em>' : ''}<em>${teachingEscape(TEACHING_FILTERS.find(({ value }) => value === (post.category || "homilies"))?.label || "Homilies")}</em>${post.audioUrl ? `<em>${post.audioSource === "external" ? "Linked audio" : "Audio"}</em>` : "<em>Reflection</em>"}${post.read ? "" : '<em class="feed-new">New</em>'}</span><strong>${teachingEscape(post.title)}</strong><small>${post.audioUrl ? "Play in Koinonia · " : ""}${teachingEscape(teachingDate(post.publishedAt))}</small></span>
      </button>
      <div class="feed-card-detail teaching-card-detail" hidden>
        <div class="feed-card-body">${post.bodyHtml || teachingEscape(post.body)}</div>
      </div>
    </article>
  `).join("");
}

async function playParishTeachingAudio(teachingId) {
  const post = teachingState.posts.find((item) => item.id === teachingId);
  if (!post?.audioUrl) return;
  const parishName = document.getElementById("teachingParishName")?.textContent?.trim() || "Your parish";
  await playKoinoniaPodcast({
    title:post.title,
    show:parishName,
    episodeKey:`parish-audio:${post.id}`,
    audioUrl:post.audioUrl,
    description:post.body || "A recording shared by your parish.",
    link:post.audioUrl,
    image:"/images/app/icon-512.png",
    trackProgress:false,
  });
  if (post.read) return;
  const response = await fetch(`/api/donor/teaching/${encodeURIComponent(teachingId)}/read`, { method:"POST", headers:teachingHeaders() });
  if (!response.ok) return;
  post.read = true;
  teachingState.unreadCount = Math.max(0, teachingState.unreadCount - 1);
  renderTeaching();
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
    const targetPost = teachingState.posts.find(({ id }) => id === targetId);
    if (targetPost) void (targetPost.audioUrl ? playParishTeachingAudio(targetId) : openTeachingPost(targetId));
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load parish teaching.";
  }
}

window.setAudioLibraryMode = setAudioLibraryMode;
window.playParishTeachingAudio = playParishTeachingAudio;
window.searchKoinoniaPodcasts = searchKoinoniaPodcasts;
window.importKoinoniaPodcastFeed = importKoinoniaPodcastFeed;
window.openKoinoniaPodcast = openKoinoniaPodcast;
window.playKoinoniaPodcastEpisode = playKoinoniaPodcastEpisode;
window.queueKoinoniaPodcastEpisode = queueKoinoniaPodcastEpisode;
window.queueKoinoniaPodcastLatestEpisode = queueKoinoniaPodcastLatestEpisode;
window.playKoinoniaPodcastLatestEpisode = playKoinoniaPodcastLatestEpisode;
window.openKoinoniaSubscribedPodcast = openKoinoniaSubscribedPodcast;
window.setKoinoniaPodcastLibraryView = setKoinoniaPodcastLibraryView;
window.loadKoinoniaPodcastLatest = loadKoinoniaPodcastLatest;
window.subscribeKoinoniaPodcast = subscribeKoinoniaPodcast;
window.unsubscribeKoinoniaPodcastByIndex = unsubscribeKoinoniaPodcastByIndex;
window.unsubscribeKoinoniaPodcastByFeed = unsubscribeKoinoniaPodcastByFeed;
window.resumeKoinoniaPodcastProgress = resumeKoinoniaPodcastProgress;
window.toggleKoinoniaPodcastPlayback = toggleKoinoniaPodcastPlayback;
window.skipKoinoniaPodcast = skipKoinoniaPodcast;
window.toggleKoinoniaPodcastPlayerExpanded = toggleKoinoniaPodcastPlayerExpanded;
window.toggleKoinoniaPodcastDetails = toggleKoinoniaPodcastDetails;
window.toggleKoinoniaPodcastQueue = toggleKoinoniaPodcastQueue;
window.setKoinoniaPodcastSleepTimer = setKoinoniaPodcastSleepTimer;
window.shareKoinoniaPodcastEpisode = shareKoinoniaPodcastEpisode;
window.clearKoinoniaPodcastQueue = clearKoinoniaPodcastQueue;
window.removeQueuedKoinoniaPodcast = removeQueuedKoinoniaPodcast;
window.playQueuedKoinoniaPodcast = playQueuedKoinoniaPodcast;
document.addEventListener("DOMContentLoaded", () => {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  bindKoinoniaPodcastPlayer();
  void loadKoinoniaPodcastProgress();
  setKoinoniaPodcastLibraryView("latest");
  setAudioLibraryMode(requestedMode === "podcasts" ? "podcasts" : "parish");
  if (requestedMode === "podcasts") void openRequestedKoinoniaPodcastEpisode();
  void loadTeaching();
});
