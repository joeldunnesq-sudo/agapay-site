const TEACHING_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "homilies", label: "Homilies" },
  { value: "catechism", label: "Catechism" },
  { value: "liturgical", label: "Liturgical" },
  { value: "choir", label: "Choir" },
  { value: "special_events", label: "Special Events" },
]);

let teachingState = { posts: [], unreadCount: 0, filter: "all" };
let koinoniaPodcastState = { results: [], show: null, episodes: [] };

function setAudioLibraryMode(mode = "parish") {
  const selected = mode === "podcasts" ? "podcasts" : "parish";
  document.querySelectorAll("[data-audio-library-pane]").forEach((pane) => { pane.hidden = pane.dataset.audioLibraryPane !== selected; });
  document.querySelectorAll("[data-audio-library-mode]").forEach((button) => {
    const active = button.dataset.audioLibraryMode === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function podcastText(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function parseKoinoniaPodcastFeed(xml, xmlUrl) {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("This podcast feed could not be read.");
  const title = podcastText(documentNode, "channel > title") || "Podcast";
  const image = documentNode.querySelector("channel image[href]")?.getAttribute("href") || podcastText(documentNode, "channel > image > url");
  const episodes = [...documentNode.querySelectorAll("item")].map((item) => {
    const enclosure = item.querySelector("enclosure");
    return {
      title: podcastText(item, "title") || "Untitled episode",
      show: title,
      audioUrl: enclosure?.getAttribute("url") || "",
      date: podcastText(item, "pubDate"),
      duration: podcastText(item, "duration"),
      description: podcastText(item, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280),
      image: item.querySelector("image[href]")?.getAttribute("href") || image,
      xmlUrl,
    };
  }).filter((episode) => episode.audioUrl).slice(0, 30);
  return { title, image, episodes };
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

async function searchKoinoniaPodcasts(event) {
  event.preventDefault();
  const query = document.getElementById("koinoniaPodcastQuery")?.value.trim() || "";
  const status = document.getElementById("koinoniaPodcastStatus");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (!query) return;
  if (button) button.disabled = true;
  status.textContent = "Searching the podcast directory…";
  try {
    const response = await fetch(`/api/listen/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Podcast search is temporarily unavailable.");
    koinoniaPodcastState.results = data.feeds || [];
    status.textContent = koinoniaPodcastState.results.length ? `${koinoniaPodcastState.results.length} podcasts found` : "No podcasts matched that search.";
    document.getElementById("koinoniaPodcastShow").hidden = true;
    renderKoinoniaPodcastResults();
  } catch (error) {
    status.textContent = error.message || "Podcast search is temporarily unavailable.";
  } finally {
    if (button) button.disabled = false;
  }
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
      <button type="button" class="koinonia-podcast-episode" onclick="playKoinoniaPodcastEpisode(${episodeIndex})">
        <span aria-hidden="true">▶</span><span><strong>${teachingEscape(episode.title)}</strong><small>${teachingEscape(teachingDate(episode.date))}${episode.duration ? ` · ${teachingEscape(episode.duration)}` : ""}</small></span><em>Play</em>
      </button>`).join("") || '<div class="feed-empty"><strong>No playable episodes</strong><p>This feed did not provide audio enclosures.</p></div>'}</div>`;
    status.textContent = "";
    show.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status.textContent = error.message || "This podcast feed is temporarily unavailable.";
  }
}

async function playKoinoniaPodcastEpisode(index) {
  const episode = koinoniaPodcastState.episodes[index];
  const player = document.getElementById("koinoniaPodcastPlayer");
  const audio = document.getElementById("koinoniaPodcastAudio");
  if (!episode || !player || !audio) return;
  document.getElementById("koinoniaPodcastPlayerTitle").textContent = episode.title;
  document.getElementById("koinoniaPodcastPlayerShow").textContent = episode.show || "Orthodox Podcast";
  const image = document.getElementById("koinoniaPodcastPlayerImage");
  image.src = episode.image || "/listen/images/app/icon-192.png";
  image.alt = episode.show ? `${episode.show} artwork` : "Podcast artwork";
  player.hidden = false;
  audio.src = episode.audioUrl;
  try { await audio.play(); } catch { /* Browser may require a second explicit play gesture. */ }
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: episode.title, artist: episode.show || "Orthodox Podcast", album: "Koinonia Audio Library", artwork: [{ src: image.src, sizes: "192x192" }] }); } catch { /* Metadata is optional. */ }
  }
  player.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
document.addEventListener("DOMContentLoaded", () => {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  setAudioLibraryMode(requestedMode === "podcasts" ? "podcasts" : "parish");
  void loadTeaching();
});
