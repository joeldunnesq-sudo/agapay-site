function mediaEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function mediaDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function mediaDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function youtubeVideoId(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.pathname === "/watch") return url.searchParams.get("v") || "";
    if (/^\/(?:shorts|live|embed)\//.test(url.pathname)) return url.pathname.split("/")[2] || "";
  } catch { /* Invalid stored links are skipped below. */ }
  return "";
}

function nativeCard(item, featured = false) {
  const href = `/myagapay/media/watch?video=${encodeURIComponent(item.id)}`;
  return `<a class="${featured ? "media-feature" : "media-card"}" href="${href}"><span class="media-thumbnail"><img src="${mediaEscape(item.thumbnailUrl)}" alt="" loading="${featured ? "eager" : "lazy"}" /><em>${mediaDuration(item.durationSeconds)}</em><i aria-hidden="true">▶</i></span><span class="media-card-copy">${featured ? "<small>Featured parish video</small>" : ""}<strong>${mediaEscape(item.title)}</strong><span>${mediaEscape(mediaDate(item.publishedAt))} · ${Number(item.watchCount || 0)} parishioner${Number(item.watchCount || 0) === 1 ? "" : "s"} watched</span>${featured ? `<p>${mediaEscape(item.description || "")}</p>` : ""}</span></a>`;
}

function youtubeCard(item) {
  const videoId = youtubeVideoId(item.youtubeUrl);
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return "";
  return `<button class="media-card youtube-card" type="button" data-youtube-video-id="${mediaEscape(videoId)}" data-youtube-title="${mediaEscape(item.title)}" onclick="openYouTubeMedia(this)"><span class="media-thumbnail"><img src="${mediaEscape(item.thumbnailUrl)}" alt="" loading="lazy" /><i class="youtube-play" aria-hidden="true">▶</i></span><span class="media-card-copy"><small>Watch here · YouTube</small><strong>${mediaEscape(item.title)}</strong><span>Plays inside Koinonia · Public video</span></span></button>`;
}

function openYouTubeMedia(button) {
  const videoId = String(button?.dataset.youtubeVideoId || "");
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return;
  const modal = document.getElementById("youtubePlayerModal");
  const frame = document.getElementById("youtubePlayerFrame");
  const title = document.getElementById("youtubePlayerTitle");
  if (!modal || !frame || !title) return;
  title.textContent = button.dataset.youtubeTitle || "YouTube video";
  frame.title = title.textContent;
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`;
  modal.hidden = false;
  document.body.classList.add("has-koinonia-media-modal");
  modal.querySelector(".youtube-player-close")?.focus();
}

function closeYouTubeMedia() {
  const modal = document.getElementById("youtubePlayerModal");
  const frame = document.getElementById("youtubePlayerFrame");
  if (frame) frame.src = "about:blank";
  if (modal) modal.hidden = true;
  document.body.classList.remove("has-koinonia-media-modal");
}

async function loadMedia() {
  const status = document.getElementById("mediaStatus");
  try {
    const response = await fetch("/api/donor/videos", { headers: window.MyAgapayShell?.authHeaders() || {}, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load Media.");
    document.getElementById("mediaParishName").textContent = data.parish?.name || "Your parish";
    const videos = data.videos || [];
    const youtube = data.youtube || [];
    document.getElementById("mediaSkeleton").hidden = true;
    status.hidden = true;
    if (videos.length) {
      document.getElementById("nativeMediaSection").hidden = false;
      document.getElementById("mediaFeatured").innerHTML = nativeCard(videos[0], true);
      document.getElementById("mediaGrid").innerHTML = videos.slice(1).map((item) => nativeCard(item)).join("") || '<p class="media-empty">More parish video will appear here.</p>';
    } else {
      status.hidden = false;
      status.textContent = "No private parish videos have been published yet.";
    }
    if (youtube.length) {
      document.getElementById("youtubeMediaSection").hidden = false;
      document.getElementById("youtubeMediaGrid").innerHTML = youtube.map(youtubeCard).filter(Boolean).join("");
    }
  } catch (error) {
    document.getElementById("mediaSkeleton").hidden = true;
    status.hidden = false;
    status.textContent = error.message || "Unable to load Media.";
  }
}

window.openYouTubeMedia = openYouTubeMedia;
window.closeYouTubeMedia = closeYouTubeMedia;
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeYouTubeMedia(); });
document.addEventListener("DOMContentLoaded", loadMedia);
