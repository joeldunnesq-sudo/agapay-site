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
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function setParishLifeBadge(element, count, label) {
  if (!element) return;
  const unread = Math.max(0, Number(count) || 0);
  element.hidden = unread === 0;
  element.textContent = unread > 99 ? "99+" : String(unread);
  element.setAttribute("aria-label", `${unread} unread ${label}`);
}

function renderParishLifeActivity(feed, groups, teaching, media) {
  const list = document.getElementById("parishLifeActivityList");
  if (!list) return;
  const announcements = (feed.announcements || []).map((item) => ({
    id: item.id,
    type: "Announcement",
    title: item.title,
    detail: item.body,
    at: item.publishedAt || item.createdAt,
    href: `/myagapay/feed#${encodeURIComponent(item.id)}`,
    read: Boolean(item.read),
  }));
  const messages = (groups.activity || []).map((item) => ({
    id: item.id,
    type: "Group",
    title: item.ministryName || "Ministry group",
    detail: item.body || (item.messageType === "voice" ? "🎤 Voice message" : item.messageType === "image" ? "📷 Photo" : "Group message"),
    at: item.createdAt,
    href: `/myagapay/groups?group=${encodeURIComponent(item.ministryId || "")}`,
    read: Boolean(item.read),
  }));
  const teachings = (teaching.posts || []).map((item) => ({
    id: item.id,
    type: "Teaching",
    title: item.title,
    detail: item.body,
    at: item.publishedAt || item.createdAt,
    href: `/myagapay/teaching#${encodeURIComponent(item.id)}`,
    read: Boolean(item.read),
  }));
  const videos = (media.videos || []).map((item) => ({
    id: item.id, type: "Media", title: item.title, detail: item.description || "Private parish video",
    at: item.publishedAt || item.createdAt, href: `/myagapay/media/watch?video=${encodeURIComponent(item.id)}`, read: Boolean(item.watched),
  }));
  const coreActivity = [...announcements, ...messages, ...teachings];
  const activity = [...coreActivity, ...videos]
    .sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0))
    .slice(0, 10);
  if (!activity.length) {
    list.innerHTML = '<div class="feed-empty"><strong>No recent activity</strong><p>Parish announcements, group messages, and teaching will appear here.</p></div>';
    return;
  }
  list.innerHTML = activity.map((item) => `
    <a class="parish-life-activity-row${item.read ? "" : " is-unread"}" href="${parishLifeEscape(item.href)}">
      <span class="parish-life-activity-tag">${parishLifeEscape(item.type)}</span>
      <span class="parish-life-activity-copy"><strong>${parishLifeEscape(item.title)}</strong><small>${parishLifeEscape(item.detail)}</small></span>
      <time datetime="${parishLifeEscape(item.at)}">${parishLifeEscape(parishLifeDate(item.at))}</time>
    </a>
  `).join("");
}

async function loadParishLife() {
  const status = document.getElementById("parishLifeStatus");
  const headers = window.MyAgapayShell?.authHeaders() || {};
  try {
    const [feedResponse, groupsResponse, teachingResponse, mediaResponse] = await Promise.all([
      fetch("/api/donor/feed", { headers, cache: "no-store" }),
      fetch("/api/donor/groups/activity", { headers, cache: "no-store" }),
      fetch("/api/donor/teaching", { headers, cache: "no-store" }),
      fetch("/api/donor/videos", { headers, cache: "no-store" }),
    ]);
    const responses = [feedResponse, groupsResponse, teachingResponse, mediaResponse];
    if (responses.some((response) => window.MyAgapayShell?.handleUnauthorized(response))) return;
    const [feed, groups, teaching, media] = await Promise.all([
      feedResponse.json().catch(() => ({})),
      groupsResponse.json().catch(() => ({})),
      teachingResponse.json().catch(() => ({})),
      mediaResponse.json().catch(() => ({})),
    ]);
    if (!feedResponse.ok) throw new Error(feed.error || "Unable to load parish announcements.");
    if (!groupsResponse.ok) throw new Error(groups.error || "Unable to load ministry activity.");
    if (!teachingResponse.ok) throw new Error(teaching.error || "Unable to load parish teaching.");
    if (!mediaResponse.ok) throw new Error(media.error || "Unable to load parish video.");

    const feedUnread = Math.max(0, Number(feed.unreadCount) || 0);
    const groupsUnread = Math.max(0, Number(groups.unreadCount) || 0);
    const teachingUnread = Math.max(0, Number(teaching.unreadCount) || 0);
    const videoUnread = (media.videos || []).filter((item) => !item.watched).length;
    const totalUnread = feedUnread + groupsUnread + teachingUnread + videoUnread;
    const parishName = feed.parish?.name || "Your parish";
    document.getElementById("parishLifeHeading").textContent = parishName;
    document.getElementById("parishLifeDescription").textContent = "Announcements, ministry conversations, teaching, and media from your church community.";
    document.getElementById("parishLifeSidebarName").textContent = parishName;
    const summary = document.getElementById("parishLifeUnreadSummary");
    summary.hidden = totalUnread === 0;
    summary.textContent = `${totalUnread} unread`;
    setParishLifeBadge(document.getElementById("parishLifeAnnouncementsUnread"), feedUnread, "announcements");
    setParishLifeBadge(document.getElementById("parishLifeGroupsUnread"), groupsUnread, "group messages");
    setParishLifeBadge(document.getElementById("parishLifeTeachingUnread"), teachingUnread, "teaching posts");
    setParishLifeBadge(document.getElementById("parishLifeVideoUnread"), videoUnread, "private videos");
    window.MyAgapayShell?.setFeedUnreadCount(feedUnread);
    window.MyAgapayShell?.setGroupsUnreadCount(groupsUnread);
    window.MyAgapayShell?.setTeachingUnreadCount(teachingUnread);
    renderParishLifeActivity(feed, groups, teaching, media);
    status.hidden = true;
  } catch (error) {
    status.hidden = false;
    status.textContent = error.message || "Unable to load Parish Life.";
  }
}

document.addEventListener("DOMContentLoaded", loadParishLife);
