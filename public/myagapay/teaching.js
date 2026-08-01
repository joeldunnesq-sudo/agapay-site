const TEACHING_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "homilies", label: "Homilies" },
  { value: "catechism", label: "Catechism" },
  { value: "liturgical", label: "Liturgical" },
  { value: "choir", label: "Choir" },
  { value: "special_events", label: "Special Events" },
]);

let teachingState = { posts: [], unreadCount: 0, filter: "all" };

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
    list.innerHTML = '<div class="feed-empty"><strong>No teaching posts yet</strong><p>Your parish’s published reflections and recordings will appear here.</p></div>';
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

document.addEventListener("DOMContentLoaded", loadTeaching);
