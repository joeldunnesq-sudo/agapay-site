let parishFeedState = { announcements: [], unreadCount: 0 };

function feedEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function feedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function feedHeaders() {
  return window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || {};
}

function renderParishFeed() {
  const list = document.getElementById("feedList");
  const summary = document.getElementById("feedUnreadSummary");
  if (!list || !summary) return;
  const unreadCount = Math.max(0, Number(parishFeedState.unreadCount) || 0);
  summary.hidden = unreadCount === 0;
  summary.textContent = `${unreadCount} unread`;
  window.MyAgapayShell?.setFeedUnreadCount(unreadCount);

  if (!parishFeedState.announcements.length) {
    list.innerHTML = '<div class="feed-empty"><strong>No announcements yet</strong><p>Your parish’s published updates will appear here.</p></div>';
    return;
  }
  list.innerHTML = parishFeedState.announcements.map((announcement) => `
    <article class="feed-card${announcement.read ? "" : " is-unread"}${announcement.pinned ? " is-pinned" : ""}" data-feed-id="${feedEscape(announcement.id)}">
      <button class="feed-card-summary" type="button" onclick="openFeedAnnouncement('${feedEscape(announcement.id)}')" aria-expanded="false">
        ${announcement.heroImageUrl ? `<img class="feed-card-thumbnail" src="${feedEscape(announcement.heroImageUrl)}" alt="" loading="lazy" />` : ""}
        <span class="feed-card-copy">
        <span class="feed-card-flags">${announcement.pinned ? '<em>📌 Pinned</em>' : ""}${announcement.read ? "" : '<em class="feed-new">New</em>'}</span>
        <strong>${feedEscape(announcement.title)}</strong>
        <small>${feedEscape(feedDate(announcement.publishedAt))}</small>
        </span>
      </button>
      <div class="feed-card-detail" hidden>
        ${announcement.heroImageUrl ? `<img class="feed-card-hero" src="${feedEscape(announcement.heroImageUrl)}" alt="${feedEscape(announcement.title)}" />` : ""}
        <div class="feed-card-body">${announcement.bodyHtml || feedEscape(announcement.body)}</div>
      </div>
    </article>
  `).join("");
}

async function openFeedAnnouncement(announcementId) {
  const announcement = parishFeedState.announcements.find((item) => item.id === announcementId);
  const card = document.querySelector(`[data-feed-id="${CSS.escape(announcementId)}"]`);
  if (!announcement || !card) return;
  const detail = card.querySelector(".feed-card-detail");
  const button = card.querySelector(".feed-card-summary");
  const opening = detail.hidden;
  detail.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
  if (!opening || announcement.read) return;

  const response = await fetch(`/api/donor/feed/${encodeURIComponent(announcementId)}/read`, {
    method: "POST",
    headers: feedHeaders(),
  });
  if (!response.ok) return;
  announcement.read = true;
  parishFeedState.unreadCount = Math.max(0, parishFeedState.unreadCount - 1);
  renderParishFeed();
  const reopened = document.querySelector(`[data-feed-id="${CSS.escape(announcementId)}"]`);
  if (reopened) {
    reopened.querySelector(".feed-card-detail").hidden = false;
    reopened.querySelector(".feed-card-summary").setAttribute("aria-expanded", "true");
  }
}

async function loadParishFeed() {
  const status = document.getElementById("feedStatus");
  try {
    const response = await fetch("/api/donor/feed", { headers: feedHeaders(), cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load parish announcements.");
    parishFeedState = { announcements: data.announcements || [], unreadCount: Number(data.unreadCount || 0) };
    const parishName = document.getElementById("feedParishName");
    if (parishName && data.parish?.name) parishName.textContent = data.parish.name;
    status.hidden = true;
    renderParishFeed();
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load parish announcements.";
  }
}

document.addEventListener("DOMContentLoaded", loadParishFeed);
