const ANNOUNCEMENT_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "pinned", label: "Pinned" },
  { value: "services", label: "Services" },
  { value: "events", label: "Events" },
  { value: "youth", label: "Youth" },
  { value: "outreach", label: "Outreach" },
  { value: "education", label: "Education" },
  { value: "general", label: "General" },
]);

let parishFeedState = { announcements: [], unreadCount: 0, filter: "all" };

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

function announcementsForFilter(filter) {
  if (filter === "all") return parishFeedState.announcements;
  if (filter === "pinned") return parishFeedState.announcements.filter((announcement) => announcement.pinned);
  return parishFeedState.announcements.filter((announcement) => (announcement.category || "general") === filter);
}

function renderFeedCategoryFilters() {
  const filters = document.getElementById("feedCategoryFilters");
  if (!filters) return;
  filters.innerHTML = ANNOUNCEMENT_FILTERS.map(({ value, label }) => {
    const active = parishFeedState.filter === value;
    return `<button type="button" class="${active ? "is-active" : ""}" aria-pressed="${active}" onclick="setFeedCategoryFilter('${value}')"><span>${feedEscape(label)}</span><strong>${announcementsForFilter(value).length}</strong></button>`;
  }).join("");
}

function setFeedCategoryFilter(filter) {
  if (!ANNOUNCEMENT_FILTERS.some(({ value }) => value === filter)) return;
  parishFeedState.filter = filter;
  renderParishFeed();
}

function setDigestPreferenceUi(subscribed, message = "") {
  const toggle = document.getElementById("feedDigestToggle");
  const label = document.getElementById("feedDigestToggleLabel");
  const status = document.getElementById("feedDigestStatus");
  if (!toggle || !label || !status) return;
  toggle.checked = Boolean(subscribed);
  toggle.disabled = false;
  label.textContent = subscribed ? "Digest on" : "Digest off";
  status.textContent = message;
}

async function loadDigestPreference() {
  const toggle = document.getElementById("feedDigestToggle");
  if (!toggle) return;
  try {
    const response = await fetch("/api/donor/digest/subscription", { headers: feedHeaders(), cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load your digest preference.");
    setDigestPreferenceUi(data.subscribed);
  } catch (error) {
    toggle.disabled = true;
    document.getElementById("feedDigestToggleLabel").textContent = "Preference unavailable";
    document.getElementById("feedDigestStatus").textContent = error.message || "Unable to load your digest preference.";
  }
}

async function updateDigestPreference() {
  const toggle = document.getElementById("feedDigestToggle");
  const requested = toggle.checked;
  toggle.disabled = true;
  document.getElementById("feedDigestStatus").textContent = "Saving...";
  try {
    const response = await fetch("/api/donor/digest/subscription", {
      method: "POST",
      headers: feedHeaders(),
      body: JSON.stringify({ subscribed: requested }),
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update your digest preference.");
    setDigestPreferenceUi(data.subscribed, data.subscribed
      ? "You’ll receive a digest only when your parish publishes something new."
      : "You won’t receive parish announcement digests.");
  } catch (error) {
    setDigestPreferenceUi(!requested, error.message || "Unable to update your digest preference.");
  }
}

function renderParishFeed() {
  const list = document.getElementById("feedList");
  const summary = document.getElementById("feedUnreadSummary");
  if (!list || !summary) return;
  const unreadCount = Math.max(0, Number(parishFeedState.unreadCount) || 0);
  summary.hidden = unreadCount === 0;
  summary.textContent = `${unreadCount} unread`;
  window.MyAgapayShell?.setFeedUnreadCount(unreadCount);
  renderFeedCategoryFilters();

  if (!parishFeedState.announcements.length) {
    list.innerHTML = '<div class="feed-empty"><strong>No announcements yet</strong><p>Your parish’s published updates will appear here.</p></div>';
    return;
  }
  const visibleAnnouncements = announcementsForFilter(parishFeedState.filter);
  if (!visibleAnnouncements.length) {
    const selected = ANNOUNCEMENT_FILTERS.find(({ value }) => value === parishFeedState.filter)?.label || "selected";
    list.innerHTML = `<div class="feed-empty"><strong>No ${feedEscape(selected.toLowerCase())} announcements</strong><p>Published announcements in this category will appear here.</p></div>`;
    return;
  }
  list.innerHTML = visibleAnnouncements.map((announcement) => `
    <article class="feed-card${announcement.read ? "" : " is-unread"}${announcement.pinned ? " is-pinned" : ""}" data-feed-id="${feedEscape(announcement.id)}">
      <button class="feed-card-summary" type="button" onclick="openFeedAnnouncement('${feedEscape(announcement.id)}')" aria-expanded="false">
        ${announcement.heroImageUrl ? `<img class="feed-card-thumbnail" src="${feedEscape(announcement.heroImageUrl)}" alt="" loading="lazy" />` : ""}
        <span class="feed-card-copy">
        <span class="feed-card-flags"><em>${feedEscape(ANNOUNCEMENT_FILTERS.find(({ value }) => value === (announcement.category || "general"))?.label || "General")}</em>${announcement.pinned ? '<em>📌 Pinned</em>' : ""}${announcement.read ? "" : '<em class="feed-new">New</em>'}</span>
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
    parishFeedState = { announcements: data.announcements || [], unreadCount: Number(data.unreadCount || 0), filter: parishFeedState.filter || "all" };
    const parishName = document.getElementById("feedParishName");
    if (parishName && data.parish?.name) parishName.textContent = data.parish.name;
    status.hidden = true;
    renderParishFeed();
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load parish announcements.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("feedDigestToggle")?.addEventListener("change", updateDigestPreference);
  void Promise.all([loadParishFeed(), loadDigestPreference()]);
});
