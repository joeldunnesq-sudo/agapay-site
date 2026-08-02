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
  const dialog = document.querySelector(".youtube-player-dialog");
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    try { exitFullscreen?.call(document); } catch { /* Closing the modal remains authoritative. */ }
  }
  dialog?.classList.remove("is-browser-fullscreen", "is-landscape-fallback");
  if (frame) frame.src = "about:blank";
  if (modal) modal.hidden = true;
  document.body.classList.remove("has-koinonia-media-modal");
}

async function openYouTubeMediaFullscreen() {
  const dialog = document.querySelector(".youtube-player-dialog");
  if (!dialog) return;
  // Fullscreen the same-origin player shell, not the cross-origin YouTube
  // iframe. Android browsers are much more consistent about granting this.
  dialog.classList.add("is-browser-fullscreen", "is-landscape-fallback");
  const requestFullscreen = dialog.requestFullscreen || dialog.webkitRequestFullscreen;
  if (requestFullscreen) {
    try {
      await requestFullscreen.call(dialog, { navigationUI:"hide" });
      await screen.orientation?.lock?.("landscape").catch(() => {});
      return;
    } catch { /* Keep the edge-to-edge landscape fallback below. */ }
  }
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
    const youtubeChannel = data.youtubeChannel || null;
    const youtubeLatest = data.youtubeLatest || null;
    document.getElementById("mediaSkeleton").hidden = true;
    status.hidden = true;
    if (videos.length) {
      document.getElementById("nativeMediaSection").hidden = false;
      document.getElementById("mediaFeatured").innerHTML = nativeCard(videos[0], true);
      document.getElementById("mediaGrid").innerHTML = videos.slice(1).map((item) => nativeCard(item)).join("") || '<p class="media-empty">More parish video will appear here.</p>';
    } else if (!youtube.length && !youtubeChannel) {
      status.hidden = false;
      status.textContent = "No private parish videos have been published yet.";
    }
    if (youtube.length || youtubeChannel) {
      document.getElementById("youtubeMediaSection").hidden = false;
      document.getElementById("youtubeMediaGrid").innerHTML = youtube.map(youtubeCard).filter(Boolean).join("");
      const playlistId = String(youtubeChannel?.uploadsPlaylistId || "");
      if (/^UU[A-Za-z0-9_-]{20,40}$/.test(playlistId)) {
        const embed = document.getElementById("youtubeChannelEmbed");
        const frame = document.getElementById("youtubeChannelFrame");
        embed.hidden = false;
        frame.title = `${youtubeChannel.channelTitle || "Parish"} YouTube videos`;
        frame.src = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&rel=0&playsinline=1`;
        document.getElementById("youtubeMediaHeading").textContent = youtubeChannel.channelTitle || "From our parish on YouTube";
      }
    }
    const requestedYouTubeId = new URLSearchParams(window.location.search).get("youtube") || "";
    if (/^[A-Za-z0-9_-]{6,20}$/.test(requestedYouTubeId)) {
      const requested = [youtubeLatest, ...youtube].find((item) => youtubeVideoId(item?.youtubeUrl) === requestedYouTubeId);
      if (requested) openYouTubeMedia({ dataset: { youtubeVideoId: requestedYouTubeId, youtubeTitle: requested.title || "YouTube video" } });
    }
  } catch (error) {
    document.getElementById("mediaSkeleton").hidden = true;
    status.hidden = false;
    status.textContent = error.message || "Unable to load Media.";
  }
}

window.openYouTubeMedia = openYouTubeMedia;
window.openYouTubeMediaFullscreen = openYouTubeMediaFullscreen;
window.closeYouTubeMedia = closeYouTubeMedia;
function handleYouTubeFullscreenChange() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  screen.orientation?.unlock?.();
  document.querySelector(".youtube-player-dialog")?.classList.remove("is-browser-fullscreen", "is-landscape-fallback");
}
document.addEventListener("fullscreenchange", handleYouTubeFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleYouTubeFullscreenChange);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const dialog = document.querySelector(".youtube-player-dialog");
  if (dialog?.classList.contains("is-browser-fullscreen")) {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) exitFullscreen?.call(document);
    dialog.classList.remove("is-browser-fullscreen", "is-landscape-fallback");
  }
  else closeYouTubeMedia();
});
document.addEventListener("DOMContentLoaded", loadMedia);
