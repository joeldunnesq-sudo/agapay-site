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

function renderParishLifeCalendarEvents(calendar = {}, parish) {
  const target = document.getElementById("parishLifeServices");
  const events = calendar?.events || [];
  if (!target || !events.length) { renderParishLifeServicesFallback(parish); return; }
  target.innerHTML = events.slice(0, 4).map((event) => {
    const date = new Date(event.startsAt);
    const day = date.toLocaleDateString(undefined, { day:"numeric" });
    const weekday = date.toLocaleDateString(undefined, { weekday:"short" });
    const time = event.personal ? event.timeLabel : event.allDay ? "All day" : date.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
    return `<article class="parish-life-liturgical-fallback parish-life-synced-event"><span class="parish-life-fallback-date"><strong>${parishLifeEscape(day)}</strong><small>${parishLifeEscape(weekday)}</small></span><span class="parish-life-fallback-copy"><strong>${parishLifeEscape(event.title)}</strong><small>${parishLifeEscape(time)}${event.location ? ` · ${parishLifeEscape(event.location)}` : ""}</small></span><span class="parish-life-fallback-arrow" aria-hidden="true">›</span></article>`;
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

function parishLifeTierSectionsHtml(communicationsEnabled) {
  if (!communicationsEnabled) return "";
  return `
    <section class="parish-life-home-section" aria-labelledby="pinnedAnnouncementsHeading">
      <div class="parish-life-section-head"><h2 id="pinnedAnnouncementsHeading">Pinned Announcements</h2><a href="/myagapay/feed">All Announcements</a></div>
      <div class="parish-life-announcement-list" id="parishLifePinnedAnnouncements"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading announcements…</p></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="yourMinistriesHeading">
      <div class="parish-life-section-head"><h2 id="yourMinistriesHeading">Your Ministries</h2><a href="/myagapay/groups">All Groups</a></div>
      <div class="parish-life-ministry-grid" id="parishLifeMinistries"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading ministries…</p></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="recentAudioHeading">
      <div class="parish-life-section-head"><h2 id="recentAudioHeading">Recent Audio</h2><a href="/myagapay/teaching">Audio Library</a></div>
      <div class="parish-life-recording-list" id="parishLifeRecordings"><p class="sw-tool-loading parish-life-section-loading" role="status">Loading recordings…</p></div>
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
  const target = document.getElementById("parishLifeRecordings");
  if (!target) return;
  const recordings = (teaching.posts || [])
    .filter((post) => post.status === "published" && Boolean(post.audioUrl))
    .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0))
    .slice(0, 4);
  if (!recordings.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No recordings yet</strong><p>Published parish audio will appear here.</p></div>';
    return;
  }
  target.innerHTML = recordings.map((post) => `
    <a class="parish-life-recording-row" href="/myagapay/teaching#${encodeURIComponent(post.id)}">
      <span class="parish-life-audio-icon" aria-hidden="true">▶</span>
      <span><strong>${parishLifeEscape(post.title)}</strong><small>${parishLifeEscape(parishLifeCategory(post.category, "homilies"))} · ${parishLifeEscape(parishLifeDate(post.publishedAt || post.createdAt))}</small></span>
      <em>${post.read ? "Listen" : "New"}</em>
    </a>`).join("");
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
      <span class="parish-life-ministry-mark" aria-hidden="true">✦</span>
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
  document.getElementById("parishLifeTierSections").innerHTML = parishLifeTierSectionsHtml(experience.communicationsEnabled);
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
    const [parishCalendar, sacramentRequests] = await Promise.all([
      parishLifeFetch("/api/donor/parish-calendar", headers),
      parishLifeFetch("/api/donor/sacraments", headers)
    ]);
    const personalServices = parishLifeApprovedServiceEvents(sacramentRequests || {});
    const parishEvents = parishCalendar?.events || [];
    renderParishLifeCalendarEvents({ events:[...personalServices, ...parishEvents].sort((a,b) => String(a.startsAt).localeCompare(String(b.startsAt))) }, parish);

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
    await Promise.all([feedPromise, groupsPromise, teachingPromise, mediaPromise, newsPromise]);
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
window.requestParishServiceInterest = requestParishServiceInterest;
document.addEventListener("DOMContentLoaded", loadParishLife);
