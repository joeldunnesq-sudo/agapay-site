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

function parishLifeTierSectionsHtml(communicationsEnabled) {
  if (!communicationsEnabled) return "";
  return `
    <section class="parish-life-home-section" aria-labelledby="pinnedAnnouncementsHeading">
      <div class="parish-life-section-head"><h2 id="pinnedAnnouncementsHeading">Pinned Announcements</h2><a href="/myagapay/feed">All Announcements</a></div>
      <div class="parish-life-announcement-list" id="parishLifePinnedAnnouncements"></div>
    </section>
    <section class="parish-life-home-section" aria-labelledby="recentRecordingsHeading">
      <div class="parish-life-section-head"><h2 id="recentRecordingsHeading">Recent Recordings</h2><a href="/myagapay/teaching">Audio Library</a></div>
      <div class="parish-life-recording-list" id="parishLifeRecordings"></div>
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

    if (!experience.communicationsEnabled) {
      status.hidden = true;
      return;
    }

    const [feed, groups, teaching] = await Promise.all([
      parishLifeFetch("/api/donor/feed", headers),
      parishLifeFetch("/api/donor/groups", headers),
      parishLifeFetch("/api/donor/teaching", headers),
    ]);
    renderPinnedAnnouncements(feed || {});
    renderRecentRecordings(teaching || {});
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
document.addEventListener("DOMContentLoaded", loadParishLife);
