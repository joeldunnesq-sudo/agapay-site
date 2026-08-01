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

function parishLifeTierSectionsHtml(communicationsEnabled) {
  if (!communicationsEnabled) return "";
  return `
    <section class="parish-life-home-section" aria-labelledby="pinnedAnnouncementsHeading">
      <div class="parish-life-section-head"><h2 id="pinnedAnnouncementsHeading">Pinned Announcements</h2><a href="/myagapay/feed">All Announcements</a></div>
      <div class="parish-life-announcement-list" id="parishLifePinnedAnnouncements"></div>
    </section>
    <div id="parishLifeBlogMount"></div>
    <div id="parishLifeOcaNewsMount"></div>
    <div id="parishLifeExternalFeedMount"></div>
    <section class="parish-life-home-section" aria-labelledby="recentAudioHeading">
      <div class="parish-life-section-head"><h2 id="recentAudioHeading">Recent Audio</h2><a href="/myagapay/teaching">Audio Library</a></div>
      <div class="parish-life-recording-list" id="parishLifeRecordings"></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="recentVideosHeading">
      <div class="parish-life-section-head"><h2 id="recentVideosHeading">Recent Videos</h2><a href="/myagapay/media">All Media</a></div>
      <div class="parish-life-video-grid" id="parishLifeVideos"></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="yourMinistriesHeading">
      <div class="parish-life-section-head"><h2 id="yourMinistriesHeading">Your Ministries</h2><a href="/myagapay/groups">All Groups</a></div>
      <div class="parish-life-ministry-grid" id="parishLifeMinistries"></div>
    </section>`;
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
  const videos = (media.videos || [])
    .filter((video) => !video.status || video.status === "published")
    .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0))
    .slice(0, 3);
  if (!videos.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No videos yet</strong><p>Published parish video will appear here.</p></div>';
    return;
  }
  target.innerHTML = videos.map((video) => `
    <a class="parish-life-video-card" href="/myagapay/media/watch?video=${encodeURIComponent(video.id)}">
      <span class="parish-life-video-thumb">${video.thumbnailUrl ? `<img src="${parishLifeEscape(video.thumbnailUrl)}" alt="" loading="lazy" />` : ""}<i aria-hidden="true">▶</i></span>
      <span class="parish-life-video-copy"><strong>${parishLifeEscape(video.title)}</strong><small>${parishLifeEscape(parishLifeDate(video.publishedAt || video.createdAt))}</small></span>
    </a>`).join("");
}

function renderParishBlog(blog = {}) {
  const mount = document.getElementById("parishLifeBlogMount");
  if (!mount) return;
  const posts = blog.enabled ? (blog.posts || []).slice(0, 3) : [];
  if (!posts.length) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = `
    <section class="parish-life-home-section" aria-labelledby="parishBlogHeading">
      <div class="parish-life-section-head"><h2 id="parishBlogHeading">From the Priest’s Blog</h2>${blog.sourceUrl ? `<a href="${parishLifeEscape(blog.sourceUrl)}" target="_blank" rel="noopener noreferrer">Visit Blog</a>` : ""}</div>
      <div class="parish-life-blog-list">${posts.map((post) => `
        <a class="parish-life-blog-card" href="${parishLifeEscape(post.url)}" target="_blank" rel="noopener noreferrer">
          <span><small>${parishLifeEscape(parishLifeDate(post.publishedAt))}</small><strong>${parishLifeEscape(post.title)}</strong></span>
          ${post.excerpt ? `<p>${parishLifeEscape(post.excerpt)}</p>` : ""}
          <em>Read on the blog ↗</em>
        </a>`).join("")}</div>
    </section>`;
}

function renderOcaNews(news = {}) {
  const mount = document.getElementById("parishLifeOcaNewsMount");
  if (!mount) return;
  const posts = news.enabled ? (news.posts || []).slice(0, 3) : [];
  if (!posts.length) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = `
    <section class="parish-life-home-section" aria-labelledby="ocaNewsHeading">
      <div class="parish-life-section-head"><h2 id="ocaNewsHeading">OCA News</h2><a href="https://www.oca.org/news" target="_blank" rel="noopener noreferrer">All OCA News</a></div>
      <div class="parish-life-blog-list parish-life-oca-news-list">${posts.map((post) => `
        <a class="parish-life-blog-card" href="${parishLifeEscape(post.url)}" target="_blank" rel="noopener noreferrer">
          <span><small>${parishLifeEscape(parishLifeDate(post.publishedAt))}</small><strong>${parishLifeEscape(post.title)}</strong></span>
          ${post.excerpt ? `<p>${parishLifeEscape(post.excerpt)}</p>` : ""}
          <em>Read at OCA.org ↗</em>
        </a>`).join("")}</div>
    </section>`;
}

function renderExternalFeed(feed = {}) {
  const mount = document.getElementById("parishLifeExternalFeedMount");
  if (!mount) return;
  if (feed.available !== true) {
    mount.innerHTML = "";
    return;
  }
  const posts = feed.subscribed ? (feed.posts || []).slice(0, 3) : [];
  mount.innerHTML = `
    <section class="parish-life-home-section parish-life-external-feed" aria-labelledby="orthoChristianHeading">
      <div class="parish-life-section-head"><h2 id="orthoChristianHeading">OrthoChristian</h2><button type="button" class="parish-life-feed-toggle${feed.subscribed ? " is-subscribed" : ""}" onclick="toggleParishExternalFeed(${feed.subscribed ? "false" : "true"}, this)">${feed.subscribed ? "Following" : "Follow feed"}</button></div>
      ${feed.subscribed ? (posts.length ? `<div class="parish-life-blog-list">${posts.map((post) => `
        <a class="parish-life-blog-card" href="${parishLifeEscape(post.url)}" target="_blank" rel="noopener noreferrer">
          <span><small>${parishLifeEscape(parishLifeDate(post.publishedAt))}</small><strong>${parishLifeEscape(post.title)}</strong></span>
          ${post.excerpt ? `<p>${parishLifeEscape(post.excerpt)}</p>` : ""}
          <em>Read at OrthoChristian ↗</em>
        </a>`).join("")}</div>` : '<div class="parish-life-empty-state"><strong>Feed temporarily unavailable</strong><p>Your subscription is saved. New posts will return here when the feed is available.</p></div>') : '<div class="parish-life-feed-invitation"><strong>Orthodox news and reflections</strong><p>Choose to receive the latest OrthoChristian posts here in Koinonia.</p></div>'}
    </section>`;
}

async function toggleParishExternalFeed(subscribed, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/donor/external-feeds/orthochristian", {
      method: "PATCH",
      headers: window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed }),
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update this feed preference.");
    const refreshed = await parishLifeFetch("/api/donor/external-feeds/orthochristian", window.MyAgapayShell?.authHeaders() || {});
    renderExternalFeed(refreshed || data);
  } catch (error) {
    const status = document.getElementById("parishLifeStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to update this feed preference."; }
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function renderMinistries(groups = {}) {
  const target = document.getElementById("parishLifeMinistries");
  if (!target) return;
  const ministries = groups.groups || [];
  if (!ministries.length) {
    target.innerHTML = '<div class="parish-life-empty-state"><strong>No active ministries</strong><p>Ministry spaces appear here when you become an active participant or leader.</p></div>';
    return;
  }
  target.innerHTML = ministries.slice(0, 6).map((group) => `
    <a class="parish-life-ministry-tile" href="/myagapay/groups?group=${encodeURIComponent(group.id)}">
      <span class="parish-life-ministry-mark" aria-hidden="true">✦</span>
      <strong>${parishLifeEscape(group.name)}</strong>
      <small>${group.unreadCount ? `${Number(group.unreadCount)} new` : group.role === "leader" ? "Leader" : "Caught up"}</small>
    </a>`).join("");
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

async function loadParishLife() {
  const status = document.getElementById("parishLifeStatus");
  const headers = window.MyAgapayShell?.authHeaders() || {};
  try {
    const dashboardResponse = await fetch("/api/donor/dashboard", { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(dashboardResponse)) return;
    const dashboard = await dashboardResponse.json().catch(() => ({}));
    if (!dashboardResponse.ok) throw new Error(dashboard.error || "Unable to load your parish.");
    const parish = dashboard.parish || null;
    const experience = window.MyAgapayShell.parishLifeExperience(parish);
    applyParishLifeExperience(experience, parish);
    if (typeof loadDonorLiturgicalDay === "function") await loadDonorLiturgicalDay(parish);
    renderParishLifeServicesFallback(parish);

    if (!experience.communicationsEnabled) {
      status.hidden = true;
      return;
    }

    const isOcaParish = /(?:^|\b)oca(?:\b|$)|orthodox church in america/i.test(String(parish?.jurisdiction || ""));
    const [feed, groups, teaching, media, blog, ocaNews, externalFeed] = await Promise.all([
      parishLifeFetch("/api/donor/feed", headers),
      parishLifeFetch("/api/donor/groups", headers),
      parishLifeFetch("/api/donor/teaching", headers),
      parishLifeFetch("/api/donor/videos", headers),
      parishLifeFetch("/api/donor/blog", headers),
      isOcaParish ? parishLifeFetch("/api/donor/oca-news", headers) : Promise.resolve({ enabled: false, posts: [] }),
      parishLifeFetch("/api/donor/external-feeds/orthochristian", headers),
    ]);
    renderPinnedAnnouncements(feed || {});
    renderRecentRecordings(teaching || {});
    renderRecentVideos(media || {});
    renderParishBlog(blog || {});
    renderOcaNews(ocaNews || {});
    renderExternalFeed(externalFeed || {});
    renderMinistries(groups || {});
    const feedUnread = Math.max(0, Number(feed?.unreadCount) || 0);
    const groupsUnread = (groups?.groups || []).reduce((sum, group) => sum + Math.max(0, Number(group.unreadCount) || 0), 0);
    const teachingUnread = Math.max(0, Number(teaching?.unreadCount) || 0);
    window.MyAgapayShell?.setFeedUnreadCount(feedUnread);
    window.MyAgapayShell?.setGroupsUnreadCount(groupsUnread);
    window.MyAgapayShell?.setTeachingUnreadCount(teachingUnread);
    status.hidden = true;
  } catch (error) {
    if (typeof loadDonorLiturgicalDay === "function") await loadDonorLiturgicalDay(null);
    status.hidden = false;
    status.textContent = error.message || "Unable to load this parish landing page.";
  }
}

window.parishLifeTierSectionsHtml = parishLifeTierSectionsHtml;
window.parishLifeNextLiturgicalEvent = parishLifeNextLiturgicalEvent;
window.parishLifeUpcomingLiturgicalEvents = parishLifeUpcomingLiturgicalEvents;
window.toggleParishExternalFeed = toggleParishExternalFeed;
document.addEventListener("DOMContentLoaded", loadParishLife);
