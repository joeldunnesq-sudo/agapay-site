function parishLifeEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parishLifeDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parishLifeCategory(value, fallback) {
  const normalized = String(value || fallback || "").replaceAll("_", " ").trim();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}

const PARISH_LIFE_FAST_FEASTS = {
  "clean-monday": "pascha",
  "apostles-fast-start": "apostles-peter-paul",
  "dormition-fast-begins": "dormition",
  "nativity-fast-begins": "nativity-christ",
};

function parishLifeUpcomingLiturgicalEvents(calendar, fromDate = new Date()) {
  const api = window.AGAPAYLiturgicalCalendar;
  if (!api?.liturgicalFeastsForYear) return [];
  const year = fromDate.getFullYear();
  const today = `${year}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
  const seen = new Set();
  const events = [year, year + 1]
    .flatMap((feastYear) => api.liturgicalFeastsForYear(feastYear, calendar || "julian"))
    .filter((event) => event.date >= today)
    .filter((event) => ["great", "major"].includes(event.rank) || (event.rank === "fast" && !/ends/i.test(event.name)))
    .sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name))
    .filter((event) => {
      const key = `${event.id || event.name}|${event.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const next = events[0];
  if (!next) return [];
  const associatedFeastId = next.rank === "fast" ? PARISH_LIFE_FAST_FEASTS[next.id] : "";
  const associatedFeast = associatedFeastId
    ? events.find((event) => event.id === associatedFeastId && event.date >= next.date)
    : null;
  return associatedFeast ? [next, associatedFeast] : [next];
}

function parishLifeNextLiturgicalEvent(calendar, fromDate = new Date()) {
  return parishLifeUpcomingLiturgicalEvents(calendar, fromDate)[0] || null;
}

function renderParishLifeServicesFallback(parish, fromDate = new Date()) {
  const target = document.getElementById("parishLifeServices");
  if (!target) return;
  const calendar = parish?.liturgicalCalendar || "julian";
  const events = parishLifeUpcomingLiturgicalEvents(calendar, fromDate);
  if (!events.length) {
    target.innerHTML = '<strong>Liturgical calendar unavailable</strong><p>Open the full calendar to see upcoming feasts and fasting periods.</p>';
    return;
  }
  const calendarLabel = window.AGAPAYLiturgicalCalendar?.calendarLabel?.(calendar) || "Church calendar";
  target.innerHTML = events.map((event, index) => {
    const date = new Date(`${event.date}T12:00:00`);
    const day = date.toLocaleDateString(undefined, { day: "numeric" });
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
    const associatedWithFast = index > 0 && events[0]?.rank === "fast";
    const eventType = associatedWithFast
      ? "Feast associated with this fast"
      : event.rank === "fast" ? "Fasting period begins" : event.rank === "great" ? "Great feast" : "Major feast";
    return `
      <a class="parish-life-liturgical-fallback" href="/myagapay/calendar">
        <span class="parish-life-fallback-date"><strong>${parishLifeEscape(day)}</strong><small>${parishLifeEscape(weekday)}</small></span>
        <span class="parish-life-fallback-copy"><strong>${parishLifeEscape(event.name)}</strong><small>${parishLifeEscape(event.displayDate)} · ${parishLifeEscape(eventType)} · ${parishLifeEscape(calendarLabel)}</small></span>
        <span class="parish-life-fallback-arrow" aria-hidden="true">›</span>
      </a>`;
  }).join("");
}

function parishLifeSignupEvents(payload = {}) {
  return (payload.signups || []).map((signup) => {
    const slotDate = Number(signup.slotDate);
    if (!Number.isFinite(slotDate)) return null;
    return {
      id:`signup-${signup.entryId}`,
      title:signup.sheetTitle || "Your signup",
      location:signup.ministryName || "",
      startsAt:new Date(slotDate).toISOString(),
      timeLabel:`Signup · ${signup.label || "Committed"}`,
      personal:true,
      signup:true,
      href:`/myagapay/signups?sheet=${encodeURIComponent(signup.sheetId || "")}`,
    };
  }).filter(Boolean);
}

function parishLifePrioritizedUpcomingEvents(events = [], limit = 4) {
  const sorted = [...events].sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)));
  const signups = sorted.filter((event) => event.signup).slice(0, limit);
  const selected = [...signups, ...sorted.filter((event) => !event.signup).slice(0, Math.max(0, limit - signups.length))];
  return selected.sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)));
}

function renderParishLifeCalendarEvents(calendar = {}, parish) {
  const target = document.getElementById("parishLifeServices");
  const events = calendar?.events || [];
  if (!target || !events.length) { renderParishLifeServicesFallback(parish); return; }
  target.innerHTML = parishLifePrioritizedUpcomingEvents(events).map((event) => {
    const date = new Date(event.startsAt);
    const day = date.toLocaleDateString(undefined, { day:"numeric" });
    const weekday = date.toLocaleDateString(undefined, { weekday:"short" });
    const time = event.personal ? event.timeLabel : event.allDay ? "All day" : date.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
    const tag = event.href ? "a" : "article";
    const href = event.href ? ` href="${parishLifeEscape(event.href)}"` : "";
    return `<${tag} class="parish-life-liturgical-fallback parish-life-synced-event${event.signup ? " parish-life-signup-event" : ""}"${href}><span class="parish-life-fallback-date"><strong>${parishLifeEscape(day)}</strong><small>${parishLifeEscape(weekday)}</small></span><span class="parish-life-fallback-copy"><strong>${parishLifeEscape(event.title)}</strong><small>${parishLifeEscape(time)}${event.location ? ` · ${parishLifeEscape(event.location)}` : ""}</small></span><span class="parish-life-fallback-arrow" aria-hidden="true">›</span></${tag}>`;
  }).join("");
}

const PARISH_LIFE_SACRAMENT_LABELS = {
  house_blessing:"House Blessing", baptism:"Baptism", chrismation:"Chrismation", wedding:"Wedding",
  funeral:"Funeral", memorial_service:"Memorial Service", confession:"Confession", home_visit:"Home Visit",
  office_visit:"Office Visit", anointing:"Holy Unction", counseling:"Pastoral Counseling", other:"Parish Service"
};

function parishLifeApprovedServiceEvents(payload = {}) {
  const today = new Date().toISOString().slice(0,10);
  return (payload.requests || []).filter(request => request.status === "scheduled" && (request.confirmedDate || request.requestedDate) >= today).map(request => {
    const date = request.confirmedDate || request.requestedDate;
    const time = request.confirmedTime || request.requestedTimeWindow || "";
    const timeMatch = String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    let hour = timeMatch ? Number(timeMatch[1]) : 12;
    if (timeMatch?.[3]?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (timeMatch?.[3]?.toUpperCase() === "AM" && hour === 12) hour = 0;
    const minute = timeMatch ? Number(timeMatch[2]) : 0;
    const startsAt = new Date(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`);
    return {
      id:`sacrament-${request.id}`,
      title:request.otherTypeLabel || PARISH_LIFE_SACRAMENT_LABELS[request.sacramentType] || "Parish Service",
      location:request.locationAddress || "",
      startsAt:Number.isNaN(startsAt.getTime()) ? `${date}T12:00:00` : startsAt.toISOString(),
      timeLabel:time || "Time to be confirmed",
      personal:true
    };
  });
}

function parishLifeTierSectionsHtml(communicationsEnabled, capabilities = {}) {
  if (!communicationsEnabled) return "";
  const communityTools = [
    capabilities.signupsEnabled ? '<a class="parish-life-community-tool" href="/myagapay/signups"><span aria-hidden="true">✓</span><strong>Signups</strong><small>Meals, cleaning, events, and volunteer needs</small><em>Open →</em></a>' : '',
    capabilities.exchangeEnabled ? '<a class="parish-life-community-tool" href="/myagapay/exchange"><span aria-hidden="true">⇄</span><strong>Exchange</strong><small>Offer or request items within your parish</small><em>Browse →</em></a>' : ''
  ].filter(Boolean).join("");
  return `
    <section class="parish-life-home-section" aria-labelledby="pinnedAnnouncementsHeading">
      <div class="parish-life-section-head"><h2 id="pinnedAnnouncementsHeading">Pinned Announcements</h2><a href="/myagapay/feed">All Announcements</a></div>
      <div class="parish-life-announcement-list" id="parishLifePinnedAnnouncements"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading announcements…</p></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="yourMinistriesHeading">
      <div class="parish-life-section-head"><h2 id="yourMinistriesHeading">Your Ministries</h2><a href="/myagapay/groups">All Groups</a></div>
      <div class="parish-life-ministry-grid" id="parishLifeMinistries"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading ministries…</p></div>
    </section>
    ${communityTools ? `<section class="parish-life-home-section" aria-labelledby="communityToolsHeading"><div class="parish-life-section-head"><h2 id="communityToolsHeading">Community Tools</h2></div><div class="parish-life-community-tools">${communityTools}</div></section>` : ""}
    <section class="parish-life-home-section parish-life-listen-section" aria-labelledby="listenHeading">
      <div class="parish-life-section-head"><h2 id="listenHeading">Listen</h2><a href="/myagapay/teaching">Open Library</a></div>
      <section class="parish-life-listen-resume" id="parishLifeContinueListeningSection" aria-labelledby="continueListeningHeading" hidden>
        <div class="parish-life-listen-subhead"><h3 id="continueListeningHeading">Continue listening</h3></div>
        <div id="parishLifeContinueListening"></div>
      </section>
      <section class="parish-life-listen-latest" aria-labelledby="latestAudioHeading">
        <div class="parish-life-listen-subhead"><h3 id="latestAudioHeading">Latest audio</h3></div>
        <div class="parish-life-recording-list" id="parishLifeListenItems"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading audio…</p></div>
      </section>
    </section>
    <section class="parish-life-home-section" aria-labelledby="recentVideosHeading">
      <div class="parish-life-section-head"><h2 id="recentVideosHeading">Recent Videos</h2><a href="/myagapay/media">All Media</a></div>
      <div class="parish-life-video-grid" id="parishLifeVideos"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading videos…</p></div>
    </section>
    <div id="parishLifeNewsMount">
      <section class="parish-life-home-section" aria-labelledby="recentNewsHeading">
        <div class="parish-life-section-head"><h2 id="recentNewsHeading">Recent News</h2><a href="/myagapay/news">All News</a></div>
        <p class="sw-tool-loading parish-life-section-loading" role="status">Loading news…</p>
      </section>
    </div>`;
}

const parishLifeListenSources = {
  parish: null,
  podcasts: null,
};

function renderPinnedAnnouncements(feed = {}) {
  const target = document.getElementById("parishLifePinnedAnnouncements");
  if (!target) return;
  const announcements = (feed.announcements || [])
    .filter((item) => item.status === "published" && item.pinned === true)
    .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0))
    .slice(0, 3);
  if (!announcements.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No pinned announcements</strong><p>Your parish’s most important published updates will appear here.</p></div>';
    return;
  }
  target.innerHTML = announcements.map((item) => `
    <a class="parish-life-announcement-card${item.read ? "" : " is-unread"}" href="/myagapay/feed#${encodeURIComponent(item.id)}">
      <span class="parish-life-card-flags"><em>Pinned</em><em>${parishLifeEscape(parishLifeCategory(item.category, "general"))}</em></span>
      <strong>${parishLifeEscape(item.title)}</strong>
      <p>${parishLifeEscape(String(item.body || "").slice(0, 280))}</p>
      <time datetime="${parishLifeEscape(item.publishedAt || item.createdAt)}">${parishLifeEscape(parishLifeDate(item.publishedAt || item.createdAt))}</time>
    </a>`).join("");
}

function renderRecentRecordings(teaching = {}) {
  const recordings = (teaching.posts || [])
    .filter((post) => post.status === "published" && Boolean(post.audioUrl))
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0))
    .slice(0, 8)
    .map((post) => ({
      kind: "parish",
      key: `parish-${post.id}`,
      title: post.title,
      source: parishLifeCategory(post.category, "homilies"),
      publishedAt: post.publishedAt || post.createdAt || "",
      pinned: Boolean(post.pinned),
      image: "",
      href: `/myagapay/teaching#${encodeURIComponent(post.id)}`,
    }));
  parishLifeListenSources.parish = recordings;
  renderParishLifeListenItems();
}

function parishLifeBalancedListenItems(parishItems = [], podcastItems = [], limit = 5) {
  const maximum = Math.max(0, Number(limit) || 0);
  if (!maximum) return [];
  const parish = [...parishItems];
  const podcasts = [...podcastItems];
  const selected = [];
  const selectedKeys = new Set();
  const add = (item) => {
    if (!item || selected.length >= maximum || selectedKeys.has(item.key)) return;
    selected.push(item);
    selectedKeys.add(item.key);
  };
  const podcastReserve = parish.length && podcasts.length ? 1 : 0;
  const parishReserve = Math.min(parish.length, 2, Math.max(0, maximum - podcastReserve));
  parish.slice(0, parishReserve).forEach(add);
  if (podcastReserve) add(podcasts[0]);
  [...parish, ...podcasts]
    .filter((item) => !selectedKeys.has(item.key))
    .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))
    .forEach(add);
  return selected.sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
}

function renderParishLifeListenItems() {
  const target = document.getElementById("parishLifeListenItems");
  if (!target) return;
  const parishItems = parishLifeListenSources.parish || [];
  const podcastItems = parishLifeListenSources.podcasts || [];
  const items = parishLifeBalancedListenItems(parishItems, podcastItems, 5);
  if (!items.length && (parishLifeListenSources.parish === null || parishLifeListenSources.podcasts === null)) {
    target.innerHTML = '<p class="sw-tool-loading parish-life-section-loading" role="status">Loading audio…</p>';
    return;
  }
  if (!items.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No audio yet</strong><p>New parish recordings and episodes from your podcast subscriptions will appear here.</p></div>';
    return;
  }
  target.innerHTML = items.map((item) => {
    const isPodcast = item.kind === "podcast";
    const label = isPodcast
      ? `Podcast · ${item.source}`
      : `${item.pinned ? "Pinned · " : ""}Parish audio · ${item.source}`;
    return `<a class="parish-life-recording-row" href="${parishLifeEscape(item.href)}">
      <span class="parish-life-audio-icon${item.image ? " is-podcast-artwork" : ""}" aria-hidden="true">${item.image ? `<img src="${parishLifeEscape(item.image)}" alt="" loading="lazy" />` : "▶"}</span>
      <span><strong>${parishLifeEscape(item.title)}</strong><small>${parishLifeEscape(label)} · ${parishLifeEscape(parishLifeDate(item.publishedAt))}</small></span>
      <em>${isPodcast ? "Listen" : "Play"}</em>
    </a>`;
  }).join("");
}

function renderRecentVideos(media = {}) {
  const target = document.getElementById("parishLifeVideos");
  if (!target) return;
  const nativeVideos = (media.videos || []).filter((video) => !video.status || video.status === "published");
  const curatedYouTube = (media.youtube || []).map((video) => ({ ...video, youtubeVideo: true }));
  const latestYouTube = media.youtubeLatest ? { ...media.youtubeLatest, youtubeVideo: true } : null;
  const byDate = (left, right) => new Date(right.publishedAt || right.createdAt || right.addedAt || 0) - new Date(left.publishedAt || left.createdAt || left.addedAt || 0);
  const pinned = [...nativeVideos, ...curatedYouTube].filter((video) => video.pinned).sort(byDate);
  const remainder = [...nativeVideos, ...curatedYouTube].filter((video) => !video.pinned).sort(byDate);
  const videos = [...pinned, ...(latestYouTube ? [latestYouTube] : []), ...remainder]
    .filter((video, index, all) => all.findIndex((candidate) => (candidate.youtubeUrl || candidate.id) === (video.youtubeUrl || video.id)) === index)
    .slice(0, 3);
  if (!videos.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No videos yet</strong><p>Published parish video will appear here.</p></div>';
    return;
  }
  target.innerHTML = videos.map((video) => {
    const youtubeId = video.youtubeVideo ? String(video.youtubeUrl || "").match(/[?&]v=([A-Za-z0-9_-]{6,20})/)?.[1] || "" : "";
    const hrefAttribute = youtubeId
      ? `href="/myagapay/media?youtube=${encodeURIComponent(youtubeId)}"`
      : `href="/myagapay/media/watch?video=${encodeURIComponent(video.id)}"`;
    const label = video.pinned ? "Pinned · " : (video.channelUpload ? "Latest from YouTube · " : (video.youtubeVideo ? "YouTube · " : ""));
    return `
    <a class="parish-life-video-card" ${hrefAttribute}>
      <span class="parish-life-video-thumb">${video.thumbnailUrl ? `<img src="${parishLifeEscape(video.thumbnailUrl)}" alt="" loading="lazy" />` : ""}<i aria-hidden="true">▶</i></span>
      <span class="parish-life-video-copy"><strong>${parishLifeEscape(video.title)}</strong><small>${parishLifeEscape(label + parishLifeDate(video.publishedAt || video.createdAt || video.addedAt))}</small></span>
    </a>`;
  }).join("");
}

function parishLifePodcastText(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function parishLifePodcastEpisodes(xml, feedUrl, fallbackArtwork = "") {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("Podcast feed could not be read.");
  const show = parishLifePodcastText(documentNode, "channel > title") || "Podcast";
  const showArtwork = documentNode.querySelector("channel image[href]")?.getAttribute("href") || parishLifePodcastText(documentNode, "channel > image > url") || fallbackArtwork;
  return [...documentNode.querySelectorAll("item")].map((item) => {
    const audioUrl = item.querySelector("enclosure")?.getAttribute("url") || "";
    const guid = parishLifePodcastText(item, "guid");
    return {
      title: parishLifePodcastText(item, "title") || "Untitled episode",
      show,
      date: parishLifePodcastText(item, "pubDate"),
      episodeKey: guid || audioUrl,
      audioUrl,
      image: item.querySelector("image[href]")?.getAttribute("href") || showArtwork,
      feedUrl,
    };
  }).filter((episode) => episode.audioUrl).slice(0, 8);
}

function renderRecentPodcastEpisodes(subscriptions = [], episodes = []) {
  parishLifeListenSources.podcasts = subscriptions.length ? episodes.map((episode) => {
    const href = `/myagapay/teaching?mode=podcasts&feed=${encodeURIComponent(episode.feedUrl)}&episode=${encodeURIComponent(episode.episodeKey)}`;
    return {
      kind: "podcast",
      key: `podcast-${episode.feedUrl}-${episode.episodeKey}`,
      title: episode.title,
      source: episode.show,
      publishedAt: episode.date,
      pinned: false,
      image: episode.image,
      href,
    };
  }) : [];
  renderParishLifeListenItems();
}

function parishLifePodcastTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderParishLifeContinueListening(item = null) {
  const section = document.getElementById("parishLifeContinueListeningSection");
  const target = document.getElementById("parishLifeContinueListening");
  if (!section || !target) return;
  section.hidden = !item;
  if (!item) { target.innerHTML = ""; return; }
  const duration = Math.max(0, Number(item.durationSeconds) || 0);
  const position = Math.max(0, Number(item.positionSeconds) || 0);
  const percent = duration ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const href = `/myagapay/teaching?mode=podcasts&feed=${encodeURIComponent(item.feedUrl)}&episode=${encodeURIComponent(item.episodeKey)}`;
  target.innerHTML = `<a class="parish-life-continue-card" href="${href}">
    <span class="parish-life-continue-play" aria-hidden="true">▶</span>
    <span class="parish-life-continue-copy">
      <small>Podcast · ${parishLifeEscape(item.showTitle || "Orthodox Podcast")}</small>
      <strong>${parishLifeEscape(item.episodeTitle || "Untitled episode")}</strong>
      <span class="parish-life-continue-progress" aria-hidden="true"><i style="width:${percent}%"></i></span>
      <em>${parishLifeEscape(parishLifePodcastTime(position))}${duration ? ` of ${parishLifeEscape(parishLifePodcastTime(duration))}` : " listened"}</em>
    </span>
    <span class="parish-life-continue-action">Resume</span>
  </a>`;
}

async function loadParishLifeContinueListening(headers) {
  try {
    const response = await fetch("/api/listen/progress", { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load podcast progress.");
    const activeEpisode = Array.isArray(data.items) ? data.items[0] : null;
    renderParishLifeContinueListening(activeEpisode || null);
  } catch {
    // Listening progress must not block the rest of the Koinonia landing page.
    renderParishLifeContinueListening(null);
  }
}

async function loadRecentPodcastEpisodes(headers) {
  const target = document.getElementById("parishLifeListenItems");
  if (!target) return;
  try {
    const response = await fetch("/api/listen/subscriptions", { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load podcast subscriptions.");
    const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    if (!subscriptions.length) { renderRecentPodcastEpisodes([], []); return; }
    const results = await Promise.allSettled(subscriptions.slice(0, 12).map(async (subscription) => {
      const feedResponse = await fetch(`/api/listen/rss?url=${encodeURIComponent(subscription.feedUrl)}`, { cache: "no-store" });
      if (!feedResponse.ok) throw new Error("Feed unavailable");
      return parishLifePodcastEpisodes(await feedResponse.text(), subscription.feedUrl, subscription.artwork);
    }));
    const episodes = results
      .flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .sort((left, right) => (new Date(right.date).getTime() || 0) - (new Date(left.date).getTime() || 0))
      .slice(0, 5);
    renderRecentPodcastEpisodes(subscriptions, episodes);
  } catch {
    // Podcast availability must not block the rest of the Koinonia landing page.
    parishLifeListenSources.podcasts = [];
    renderParishLifeListenItems();
  }
}

function renderRecentNews(sources = []) {
  const mount = document.getElementById("parishLifeNewsMount");
  if (!mount) return;
  const articles = sources.flatMap((source) => source?.subscribed
    ? (source.posts || []).map((post) => ({ ...post, source: source.sourceLabel || "News" }))
    : []).sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0)).slice(0, 3);
  if (!articles.length) {
    mount.innerHTML = `
      <section class="parish-life-home-section" aria-labelledby="recentNewsHeading">
        <div class="parish-life-section-head"><h2 id="recentNewsHeading">Recent News</h2><a href="/myagapay/news">All News</a></div>
        <a class="parish-life-news-invitation" href="/myagapay/news">
          <span class="parish-life-news-invitation-mark" aria-hidden="true">↗</span>
          <span><strong>Choose your news sources</strong><small>Nothing appears until you follow the sources you want.</small></span>
          <em>Choose sources</em>
        </a>
      </section>`;
    return;
  }
  mount.innerHTML = `
    <section class="parish-life-home-section" aria-labelledby="recentNewsHeading">
      <div class="parish-life-section-head"><h2 id="recentNewsHeading">Recent News</h2><a href="/myagapay/news">All News</a></div>
      <div class="parish-life-blog-list">${articles.map((post) => `
        <a class="parish-life-blog-card" href="${parishLifeEscape(post.url)}" target="_blank" rel="noopener noreferrer">
          <span><small>${parishLifeEscape(post.source)} · ${parishLifeEscape(parishLifeDate(post.publishedAt))}</small><strong>${parishLifeEscape(post.title)}</strong></span>
          ${post.excerpt ? `<p>${parishLifeEscape(post.excerpt)}</p>` : ""}
          <em>Read article ↗</em>
        </a>`).join("")}</div>
    </section>`;
}

function renderMinistries(groups = {}) {
  const target = document.getElementById("parishLifeMinistries");
  if (!target) return;
  const ministries = groups.groups || [];
  if (!ministries.length) {
    target.innerHTML = `
      <button type="button" class="parish-life-get-involved-card" onclick="requestParishServiceInterest(this)">
        <span class="parish-life-get-involved-mark" aria-hidden="true">✦</span>
        <span><strong>Get involved</strong><small>Tell your parish you’re ready to serve. Interest is counted privately.</small></span>
        <em>Let them know</em>
      </button>`;
    return;
  }
  target.innerHTML = ministries.slice(0, 6).map((group) => `
    <a class="parish-life-ministry-tile" href="/myagapay/groups?group=${encodeURIComponent(group.id)}">
      <span class="parish-life-ministry-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><circle cx="5.5" cy="9" r="2.2"/><circle cx="18.5" cy="9" r="2.2"/><path d="M6.5 20c.4-4 2.4-6 5.5-6s5.1 2 5.5 6"/><path d="M1.5 20c.3-3 1.8-4.7 4-4.7 1 0 1.8.3 2.5.8"/><path d="M16 16.1c.7-.5 1.5-.8 2.5-.8 2.2 0 3.7 1.7 4 4.7"/></svg></span>
      <strong>${parishLifeEscape(group.name)}</strong>
      <small>${group.unreadCount ? `${Number(group.unreadCount)} new` : group.role === "leader" ? "Leader" : "Caught up"}</small>
    </a>`).join("");
}

async function requestParishServiceInterest(button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/donor/ministry-service-interest", {
      method: "POST",
      headers: window.MyAgapayShell?.authHeaders() || {},
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to notify your parish.");
    if (button?.isConnected) {
      button.classList.add("is-sent");
      button.innerHTML = '<span class="parish-life-get-involved-mark" aria-hidden="true">✓</span><span><strong>Interest sent</strong><small>Your parish dashboard has been notified that you want to serve.</small></span><em>Thank you</em>';
    }
  } catch (error) {
    const status = document.getElementById("parishLifeStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to notify your parish."; }
    if (button?.isConnected) button.disabled = false;
  }
}

async function parishLifeFetch(path, headers) {
  const response = await fetch(path, { headers, cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const payload = await response.json().catch(() => ({}));
  return response.ok ? payload : { error: payload.error || "Unavailable" };
}

function applyParishLifeExperience(experience, parish) {
  document.title = `${experience.label} | My AGAPAY`;
  document.documentElement.dataset.parishLifeExperience = experience.communicationsEnabled ? "koinonia" : "today";
  document.querySelectorAll("[data-parish-life-label]").forEach((element) => { element.textContent = experience.label; });
  document.getElementById("parishLifeSidebarName").textContent = parish?.name || "Your church calendar";
  const sidebarCommunications = document.getElementById("parishLifeSidebarCommunications");
  if (sidebarCommunications) sidebarCommunications.hidden = !experience.communicationsEnabled;
  document.getElementById("parishLifeTierSections").innerHTML = parishLifeTierSectionsHtml(experience.communicationsEnabled, parish || {});
}

function initializeParishLifeStructure() {
  const shell = window.MyAgapayShell;
  if (!shell?.capabilitiesLoaded?.()) {
    document.getElementById("parishLifeTierSections").innerHTML = '<p class="sw-tool-loading parish-life-structure-loading" data-parish-life-structure-loading role="status">Loading parish sections…</p>';
    return null;
  }
  const cachedExperience = shell.parishLifeExperience();
  applyParishLifeExperience(cachedExperience, null);
  return cachedExperience;
}

async function loadParishLife() {
  const status = document.getElementById("parishLifeStatus");
  const headers = window.MyAgapayShell?.authHeaders() || {};
  // The cached capability decides display structure only. Fresh dashboard and
  // Koinonia access requests below remain authoritative for data and access.
  initializeParishLifeStructure();
  try {
    const dashboardResponse = await fetch("/api/donor/dashboard", { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(dashboardResponse)) return;
    const dashboard = await dashboardResponse.json().catch(() => ({}));
    if (!dashboardResponse.ok) throw new Error(dashboard.error || "Unable to load your parish.");
    const parish = dashboard.parish || null;
    const experience = window.MyAgapayShell.parishLifeExperience(parish);
    applyParishLifeExperience(experience, parish);
    if (experience.communicationsEnabled) {
      const accessResponse = await fetch("/api/donor/koinonia-access", { headers, cache: "no-store" });
      if (window.MyAgapayShell?.handleUnauthorized(accessResponse)) return;
      const access = await accessResponse.json().catch(() => ({}));
      if (!accessResponse.ok) {
        if (accessResponse.status === 403 && access.code === "household_verification_required") {
          document.querySelectorAll(".parish-life-page-shell > :not(#parishLifeStatus)").forEach((element) => { element.hidden = true; });
          status.dataset.state = "household-verification-required";
          status.hidden = false;
          status.textContent = access.error;
          return;
        }
        throw new Error(access.error || "Unable to confirm Koinonia access.");
      }
    }
    if (typeof loadDonorLiturgicalDay === "function") await loadDonorLiturgicalDay(parish);
    const [parishCalendar, sacramentRequests, signupCommitments] = await Promise.all([
      parishLifeFetch("/api/donor/parish-calendar", headers),
      parishLifeFetch("/api/donor/sacraments", headers),
      experience.communicationsEnabled && parish?.signupsEnabled
        ? parishLifeFetch("/api/donor/koinonia/signups/upcoming", headers)
        : Promise.resolve({ signups:[] })
    ]);
    const personalServices = parishLifeApprovedServiceEvents(sacramentRequests || {});
    const signupEvents = parishLifeSignupEvents(signupCommitments || {});
    const parishEvents = parishCalendar?.events || [];
    renderParishLifeCalendarEvents({ events:[...signupEvents, ...personalServices, ...parishEvents] }, parish);

    if (!experience.communicationsEnabled) {
      status.hidden = true;
      return;
    }

    const feedPromise = parishLifeFetch("/api/donor/feed", headers).then((feed) => {
      renderPinnedAnnouncements(feed || {});
      window.MyAgapayShell?.setFeedUnreadCount(Math.max(0, Number(feed?.unreadCount) || 0));
    });
    const groupsPromise = parishLifeFetch("/api/donor/groups", headers).then((groups) => {
      renderMinistries(groups || {});
      const unread = (groups?.groups || []).reduce((sum, group) => sum + Math.max(0, Number(group.unreadCount) || 0), 0);
      window.MyAgapayShell?.setGroupsUnreadCount(unread);
    });
    const teachingPromise = parishLifeFetch("/api/donor/teaching", headers).then((teaching) => {
      renderRecentRecordings(teaching || {});
      window.MyAgapayShell?.setTeachingUnreadCount(Math.max(0, Number(teaching?.unreadCount) || 0));
    });
    const podcastProgressPromise = loadParishLifeContinueListening(headers);
    const podcastsPromise = loadRecentPodcastEpisodes(headers);
    const mediaPromise = parishLifeFetch("/api/donor/videos", headers).then((media) => renderRecentVideos(media || {}));
    const newsPromise = Promise.all([
      parishLifeFetch("/api/donor/custom-news-feeds", headers),
      parishLifeFetch("/api/donor/external-feeds/parish_blog", headers),
      parishLifeFetch("/api/donor/external-feeds/oca", headers),
      parishLifeFetch("/api/donor/external-feeds/orthochristian", headers),
      parishLifeFetch("/api/donor/external-feeds/spzh", headers),
      parishLifeFetch("/api/donor/external-feeds/orthodoxtimes", headers),
      parishLifeFetch("/api/donor/external-feeds/orthodoxethos", headers),
    ]).then(([customNews, ...newsSources]) => {
      renderRecentNews([...newsSources.filter(Boolean), ...(customNews?.feeds || [])]);
    });
    await Promise.all([feedPromise, groupsPromise, teachingPromise, podcastProgressPromise, podcastsPromise, mediaPromise, newsPromise]);
    status.hidden = true;
  } catch (error) {
    if (typeof loadDonorLiturgicalDay === "function") await loadDonorLiturgicalDay(null);
    status.hidden = false;
    status.textContent = error.message || "Unable to load this parish landing page.";
  }
}

window.parishLifeTierSectionsHtml = parishLifeTierSectionsHtml;
window.initializeParishLifeStructure = initializeParishLifeStructure;
window.parishLifeNextLiturgicalEvent = parishLifeNextLiturgicalEvent;
window.parishLifeUpcomingLiturgicalEvents = parishLifeUpcomingLiturgicalEvents;
window.parishLifeBalancedListenItems = parishLifeBalancedListenItems;
window.requestParishServiceInterest = requestParishServiceInterest;
document.addEventListener("DOMContentLoaded", loadParishLife);
