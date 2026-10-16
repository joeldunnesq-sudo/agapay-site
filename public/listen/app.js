// Generated from src/browser/listen/app.ts by npm run build:browser. Do not edit.
import { renderBottomNavPanel } from './app-panels.js';
import {
  renderProfilePanel,
  renderToastPanel,
  renderRssSheetPanel,
  renderDescriptionSheetPanel,
} from './app-panels.js';
import { GOLD, NIGHT, MUTED } from './app-catalog.js';
import { EP_COLORS, I, CURATED_PODCASTS } from './app-catalog.js';
import {
  load,
  save,
  fmtTime,
  timeAgo,
  esc,
  episodeKey,
  normalizedDate,
  episodeCategories,
  availableCategories,
  epArt,
} from './app-presentation.js';
import { bindListenEvents } from './app-events.js';
import { AudioPlayer } from './player.js';
import { ListenDB } from './db.js';
import { importOpml } from './opml.js';
const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
document.documentElement.classList.toggle('agp-ios', IS_IOS);
document.documentElement.classList.toggle('agp-standalone', IS_STANDALONE);
const db = new ListenDB();
const player = new AudioPlayer();
const state = {
  screen: 'home',
  subs: load('agp_subs', []),
  episodes: load('agp_eps', []),
  current: load('agp_current', null),
  currentShow: null,
  // Tracks the currently active podcast channel view
  queue: load('agp_queue', []),
  progress: 0,
  playing: false,
  searchQuery: '',
  searchResults: [],
  rssSheet: false,
  rssUrl: '',
  descriptionSheet: false,
  // Track description modal state
  queueSheet: false,
  speedSheet: false,
  sleepSheet: false,
  activeCategory: load('agp_category', 'All'),
  playbackSpeed: Number(load('agp_speed', 1)) || 1,
  history: load('agp_history', []),
  downloaded: new Set(load('agp_downloaded', [])),
  downloadProgress: {},
  sleepEndsAt: null,
  sleepLabel: '',
  toast: null,
  liked: new Set(load('agp_liked', [])),
  likedEpisodes: load('agp_liked_eps', []),
  downloads: {},
  // guid -> object URL
  // Platform accounts configuration profiles
  user: {
    authenticated: false,
    name: 'Guest Listener',
    initials: '--',
    status: 'Anonymous',
  },
};
function setState(updates) {
  Object.assign(state, updates);
  render();
}
let _toastTimer;
function showToast(msg, ms = 2800) {
  clearTimeout(_toastTimer);
  setState({ toast: msg });
  _toastTimer = setTimeout(() => setState({ toast: null }), ms);
}
function persistQueue(queue = state.queue) {
  state.queue = queue;
  save('agp_queue', queue);
}
function addToQueue(ep, next = false) {
  const key = episodeKey(ep);
  const cleaned = state.queue.filter((item) => episodeKey(item) !== key);
  const queue = next ? [ep, ...cleaned] : [...cleaned, ep];
  persistQueue(queue);
  showToast(next ? 'Playing next' : 'Added to queue');
  render();
}
function isLiked(ep) {
  return state.liked.has(episodeKey(ep));
}
function toggleLikeEpisode(ep) {
  if (!ep) return;
  const key = episodeKey(ep);
  const liked = new Set(state.liked);
  let likedEpisodes = [...state.likedEpisodes];
  if (liked.has(key)) {
    liked.delete(key);
    likedEpisodes = likedEpisodes.filter((item) => episodeKey(item) !== key);
    showToast('Removed from Likes');
  } else {
    liked.add(key);
    likedEpisodes = [{ ...ep, likedAt: Date.now() }, ...likedEpisodes.filter((item) => episodeKey(item) !== key)];
    showToast('Saved to Likes');
  }
  state.liked = liked;
  state.likedEpisodes = likedEpisodes.slice(0, 500);
  save('agp_liked', liked);
  save('agp_liked_eps', state.likedEpisodes);
  render();
}
function playQueuedEpisode(index) {
  const selected = state.queue[index];
  if (!selected) return;
  const remaining = state.queue.slice(index + 1);
  persistQueue(remaining);
  playEpisode(selected, remaining);
}
function addHistory(ep, position = 0, duration = 0, completed = false) {
  if (!ep) return;
  const key = episodeKey(ep);
  const entry = { ...ep, lastPlayedAt: Date.now(), position, duration, completed };
  state.history = [entry, ...state.history.filter((item) => episodeKey(item) !== key)].slice(0, 100);
  save('agp_history', state.history);
}
function setPlaybackSpeed(rate) {
  const safe = Math.min(3, Math.max(0.5, Number(rate) || 1));
  state.playbackSpeed = safe;
  save('agp_speed', safe);
  try {
    if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(safe);
    else if (player.audio) player.audio.playbackRate = safe;
    else if ('playbackRate' in player) player.playbackRate = safe;
  } catch (error) {
    console.warn('Playback speed could not be changed:', error);
  }
  updateMediaSessionPosition(player.elapsed || 0, player.duration || 0, safe);
}
let sleepTimerId = null;
function clearSleepTimer(showMessage = true) {
  clearTimeout(sleepTimerId);
  sleepTimerId = null;
  state.sleepEndsAt = null;
  state.sleepLabel = '';
  if (showMessage) showToast('Sleep timer cancelled');
  render();
}
function setSleepTimer(minutes) {
  clearTimeout(sleepTimerId);
  const ms = Number(minutes) * 60 * 1e3;
  state.sleepEndsAt = Date.now() + ms;
  state.sleepLabel = `${minutes} min`;
  sleepTimerId = setTimeout(() => {
    player.pause();
    state.playing = false;
    state.sleepEndsAt = null;
    state.sleepLabel = '';
    updateMediaSessionPlaybackState(false);
    showToast('Sleep timer ended');
  }, ms);
  showToast(`Sleep timer set for ${minutes} minutes`);
  render();
}
function setSleepAtEpisodeEnd() {
  clearTimeout(sleepTimerId);
  state.sleepEndsAt = -1;
  state.sleepLabel = 'End of episode';
  showToast('Playback will stop at the end of this episode');
  render();
}
const DOWNLOAD_CACHE = 'agapay-listen-audio-v1';
async function downloadEpisode(ep) {
  if (!ep?.url) return showToast('No downloadable audio URL');
  const key = episodeKey(ep);
  state.downloadProgress[key] = 1;
  render();
  try {
    const response = await fetch(ep.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cache = await caches.open(DOWNLOAD_CACHE);
    await cache.put(ep.url, response.clone());
    state.downloaded.add(key);
    save('agp_downloaded', state.downloaded);
    showToast('Episode downloaded');
  } catch (error) {
    console.error('Download failed:', error);
    showToast('Download failed');
  } finally {
    delete state.downloadProgress[key];
    render();
  }
}
async function removeDownload(ep) {
  if (!ep?.url) return;
  const cache = await caches.open(DOWNLOAD_CACHE);
  await cache.delete(ep.url);
  state.downloaded.delete(episodeKey(ep));
  save('agp_downloaded', state.downloaded);
  showToast('Download removed');
  render();
}
async function cachedAudioUrl(ep) {
  if (!ep?.url || !('caches' in window)) return null;
  try {
    const cache = await caches.open(DOWNLOAD_CACHE);
    const response = await cache.match(ep.url);
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
async function fetchFeed(xmlUrl) {
  const resp = await fetch('/api/listen/rss?url=' + encodeURIComponent(xmlUrl));
  if (!resp.ok) throw new Error('Feed fetch failed');
  const xml = await resp.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const channelTitle = doc.querySelector('channel > title')?.textContent?.trim() || '';
  const channelImage =
    doc.querySelector('channel image[href]')?.getAttribute('href') ||
    doc.querySelector('channel > image > url')?.textContent?.trim() ||
    '';
  const channelCategories = [...doc.querySelectorAll('channel > category')]
    .map((n) => n.textContent?.trim())
    .filter(Boolean);
  const items = [...doc.querySelectorAll('item')].slice(0, 50).map((item, i) => {
    const enclosure = item.querySelector('enclosure');
    return {
      guid: (item.querySelector('guid')?.textContent || enclosure?.getAttribute('url') || String(i)).trim(),
      title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
      show: channelTitle,
      xmlUrl,
      url: enclosure?.getAttribute('url') || '',
      duration: item.querySelector('duration')?.textContent?.trim() || '',
      date: item.querySelector('pubDate')?.textContent?.trim() || '',
      image: item.querySelector('image[href]')?.getAttribute('href') || channelImage,
      description: (item.querySelector('description')?.textContent || '')
        .replace(/[<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200),
      categories: [
        .../* @__PURE__ */ new Set([
          ...channelCategories,
          ...[...item.querySelectorAll('category')].map((n) => n.textContent?.trim()).filter(Boolean),
        ]),
      ],
    };
  });
  return { title: channelTitle, image: channelImage, items };
}
async function refreshAllFeeds() {
  if (!state.subs.length) return;
  const all = [];
  for (const sub of state.subs) {
    try {
      const { items } = await fetchFeed(sub.xmlUrl);
      all.push(...items);
    } catch (e) {
      console.warn('Feed error:', sub.xmlUrl, e);
    }
  }
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  const episodes = all.slice(0, 300);
  save('agp_eps', episodes);
  setState({ episodes });
}
async function addRssFeed(xmlUrl) {
  if (!xmlUrl?.trim()) return;
  try {
    const { title, image, items } = await fetchFeed(xmlUrl.trim());
    const sub = { title: title || xmlUrl, image, xmlUrl: xmlUrl.trim(), addedAt: Date.now() };
    const subs = [...state.subs.filter((s) => s.xmlUrl !== sub.xmlUrl), sub];
    save('agp_subs', subs);
    setState({ subs, rssSheet: false, rssUrl: '' });
    showToast(`"${sub.title}" added`);
    const allEps = [...state.episodes.filter((e) => e.xmlUrl !== sub.xmlUrl), ...items];
    allEps.sort((a, b) => new Date(b.date) - new Date(a.date));
    const episodes = allEps.slice(0, 300);
    save('agp_eps', episodes);
    setState({ episodes });
  } catch {
    showToast('Could not load that feed — check the URL');
  }
}
let _searchTimer;
async function doSearch(q) {
  if (!q.trim()) return setState({ searchResults: [] });
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    try {
      const resp = await fetch('/api/listen/search?q=' + encodeURIComponent(q));
      const data = await resp.json();
      setState({ searchResults: data.feeds || [] });
    } catch {
      setState({ searchResults: [] });
    }
  }, 380);
}
function updateMediaSessionMetadata(ep) {
  if (!('mediaSession' in navigator) || !ep) return;
  const artwork = [];
  if (ep.image) {
    artwork.push(
      { src: ep.image, sizes: '96x96', type: 'image/png' },
      { src: ep.image, sizes: '192x192', type: 'image/png' },
      { src: ep.image, sizes: '512x512', type: 'image/png' }
    );
  } else {
    artwork.push(
      { src: '/listen/images/app/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/listen/images/app/icon-512.png', sizes: '512x512', type: 'image/png' }
    );
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title || 'Untitled Episode',
      artist: ep.show || 'Orthodox Podcast',
      album: 'AGAPAY Listen',
      artwork,
    });
  } catch (error) {
    console.warn('Media Session metadata could not be set:', error);
  }
}
function updateMediaSessionPlaybackState(isPlaying) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  } catch {}
}
function updateMediaSessionPosition(elapsed, duration, playbackRate = 1) {
  if (!('mediaSession' in navigator)) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
      position: Math.min(Math.max(Number(elapsed) || 0, 0), duration),
    });
  } catch {}
}
function installMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const setHandler = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {}
  };
  setHandler('play', async () => {
    try {
      const result = player.play();
      if (result && typeof result.then === 'function') await result;
      setState({ playing: true });
      updateMediaSessionPlaybackState(true);
    } catch (error) {
      console.error('Bluetooth/media play action failed:', error);
    }
  });
  setHandler('pause', () => {
    player.pause();
    setState({ playing: false });
    updateMediaSessionPlaybackState(false);
  });
  setHandler('seekbackward', (details) => {
    player.skipBack(details.seekOffset || 15);
  });
  setHandler('seekforward', (details) => {
    player.skipForward(details.seekOffset || 30);
  });
  setHandler('seekto', (details) => {
    if (!Number.isFinite(details.seekTime) || !Number.isFinite(player.duration) || player.duration <= 0) return;
    player.seek(details.seekTime / player.duration);
  });
  setHandler('previoustrack', () => player.skipBack(15));
  setHandler('nexttrack', () => {
    if (!state.queue.length) return;
    const [next, ...rest] = state.queue;
    playEpisode(next, rest);
  });
  setHandler('stop', () => {
    player.pause();
    setState({ playing: false });
    updateMediaSessionPlaybackState(false);
  });
}
installMediaSessionHandlers();
if (!state.likedEpisodes.length && state.liked.size) {
  state.likedEpisodes = state.episodes.filter((ep) => state.liked.has(episodeKey(ep)));
  save('agp_liked_eps', state.likedEpisodes);
}
player.on('progress', ({ progress, elapsed, duration }) => {
  state.progress = progress;
  const fill = document.getElementById('pgfill');
  const thumb = document.getElementById('pgthumb');
  const elapsed_ = document.getElementById('pgtime');
  const remain = document.getElementById('pgremain');
  if (fill) fill.style.width = progress + '%';
  if (thumb) thumb.style.left = progress + '%';
  if (elapsed_) elapsed_.textContent = fmtTime(elapsed);
  if (remain) remain.textContent = '-' + fmtTime(duration - elapsed);
  if (state.current) {
    db.saveProgress(state.current.guid, elapsed, duration);
    if (Math.floor(elapsed) % 15 === 0)
      addHistory(state.current, elapsed, duration, duration > 0 && elapsed / duration >= 0.95);
  }
  updateMediaSessionPosition(elapsed, duration, player.playbackRate || 1);
});
player.on('ended', () => {
  state.playing = false;
  if (state.current) addHistory(state.current, player.duration || 0, player.duration || 0, true);
  updateMediaSessionPlaybackState(false);
  if (state.sleepEndsAt === -1) {
    state.sleepEndsAt = null;
    state.sleepLabel = '';
    return setState({ playing: false });
  }
  if (state.queue.length > 0) {
    const [next, ...rest] = state.queue;
    persistQueue(rest);
    playEpisode(next, rest);
  } else {
    setState({ playing: false });
  }
});
async function playEpisode(ep, queue = state.queue) {
  if (!ep.url) {
    showToast('No audio URL for this episode');
    return;
  }
  let audioUrl = ep.url;
  try {
    const localUrl = await db.getDownload(ep.guid);
    if (localUrl) audioUrl = localUrl;
  } catch {}
  const cachedUrl = await cachedAudioUrl(ep);
  if (cachedUrl) audioUrl = cachedUrl;
  const saved = await db.getProgress(ep.guid).catch(() => null);
  const startTime = saved?.position || 0;
  try {
    player.load(audioUrl, startTime);
    setPlaybackSpeed(state.playbackSpeed);
    updateMediaSessionMetadata(ep);
    const playResult = player.play();
    if (playResult && typeof playResult.then === 'function') await playResult;
    save('agp_current', ep);
    addHistory(ep, startTime, saved?.duration || 0, false);
    updateMediaSessionPlaybackState(true);
    setState({
      screen: 'player',
      current: ep,
      queue,
      playing: true,
      progress: ((saved?.position || 0) / (saved?.duration || 1)) * 100,
    });
  } catch (error) {
    console.error('Audio player could not start:', error, { episode: ep, audioUrl });
    setState({ playing: false });
    showToast('Playback failed — the audio source may be unavailable');
    throw error;
  }
}
function handleImport() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.opml,.xml' });
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const feeds = importOpml(text);
    if (!feeds.length) {
      showToast('No podcast feeds found in that file');
      return;
    }
    let added = 0;
    for (const f of feeds) {
      if (!state.subs.find((s) => s.xmlUrl === f.xmlUrl)) {
        state.subs.push({ title: f.title, xmlUrl: f.xmlUrl, image: '', addedAt: Date.now() });
        added++;
      }
    }
    save('agp_subs', state.subs);
    showToast(`${added} podcast${added !== 1 ? 's' : ''} imported`);
    render();
    refreshAllFeeds();
  };
  input.click();
}
let curatedCatalogHydrated = false;
let curatedCatalogLoading = false;
async function hydrateCuratedCatalog() {
  if (curatedCatalogHydrated || curatedCatalogLoading) return;
  curatedCatalogLoading = true;
  await Promise.allSettled(
    CURATED_PODCASTS.map(async (podcast) => {
      try {
        const feed = await fetchFeed(podcast.url);
        podcast.title = feed.title || podcast.title;
        podcast.image = feed.image || podcast.image;
      } catch (error) {
        console.warn('Curated podcast metadata unavailable:', podcast.url, error);
      }
    })
  );
  curatedCatalogHydrated = true;
  curatedCatalogLoading = false;
  if (state.screen === 'discover') render();
}
function renderCuratedPodcastCard(podcast, index = 0) {
  const following = state.subs.some((sub) => sub.xmlUrl === podcast.url);
  return `<article style="width:164px;flex:none;scroll-snap-align:start;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));border:1px solid rgba(255,255,255,.065);border-radius:19px;padding:11px;box-shadow:0 10px 26px rgba(0,0,0,.2)">
    ${epArt({ image: podcast.image }, 142, index)}
    <div style="padding:10px 2px 2px">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;font-weight:650;color:#F6F1E8;line-height:1.12;min-height:2.24em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(podcast.title)}</div>
      <div style="font-size:.58rem;color:${GOLD};font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(podcast.category)}</div>
      <div style="font-size:.62rem;color:${MUTED};line-height:1.4;margin-top:6px;height:2.8em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(podcast.description)}</div>
      <button class="follow-btn tappable" data-url="${esc(podcast.url)}" data-title="${esc(podcast.title)}" style="width:100%;margin-top:11px;padding:8px 10px;background:${following ? 'rgba(200,162,74,.11)' : 'linear-gradient(135deg,rgba(200,162,74,.98),rgba(169,124,37,.98))'};border:1px solid ${following ? 'rgba(200,162,74,.25)' : 'transparent'};border-radius:10px;color:${following ? GOLD : NIGHT};font-size:.62rem;font-weight:800;letter-spacing:.03em">
        ${following ? 'Following' : '+ Follow'}
      </button>
    </div>
  </article>`;
}
function renderBottomNav() {
  return renderBottomNavPanel(state);
}
function renderToast() {
  return renderToastPanel(state);
}
function renderRssSheet() {
  return renderRssSheetPanel(state);
}
function renderDescriptionSheet() {
  return renderDescriptionSheetPanel(state);
}
function renderEpisodeRow(ep, i = 0) {
  const key = episodeKey(ep);
  const downloaded = state.downloaded.has(key);
  const downloading = state.downloadProgress[key];
  const history = state.history.find((item) => episodeKey(item) === key);
  const status = history?.completed ? 'Played' : history?.position > 0 ? 'In progress' : '';
  const liked = isLiked(ep);
  const encoded = encodeURIComponent(JSON.stringify(ep));
  return `<div class="episode-row" style="display:flex;gap:8px;align-items:center;padding:13px 14px;margin:0 4px;border-radius:14px;border-bottom:1px solid rgba(255,255,255,.025)">
    <div class="ep-tap tappable" data-ep="${encoded}" style="display:flex;gap:13px;align-items:center;flex:1;min-width:0">
      ${epArt(ep, 48, i)}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;font-weight:600;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(ep.title)}</div>
        <div style="font-size:.62rem;color:${MUTED};margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ep.show)}${ep.duration ? ' · ' + esc(ep.duration) : ''}${ep.date ? ' · ' + timeAgo(ep.date) : ''}${status ? ' · ' + status : ''}</div>
      </div>
    </div>
    <button class="ep-like-btn tappable" data-ep="${encoded}" aria-label="${liked ? 'Unlike' : 'Like episode'}" style="border:0;background:transparent;padding:8px;display:flex;color:${liked ? GOLD : MUTED}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${liked ? GOLD : 'none'}" stroke="${liked ? GOLD : MUTED}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    </button>
    <button class="ep-play-next-btn tappable" data-ep="${encoded}" aria-label="Play next" style="border:0;background:transparent;color:${MUTED};padding:8px;font-size:.78rem;font-weight:800">NEXT</button>
    <button class="ep-queue-btn tappable" data-ep="${encoded}" aria-label="Add to queue" style="border:0;background:transparent;color:${MUTED};padding:8px;font-size:1rem">＋</button>
    <button class="ep-download-btn tappable" data-ep="${encoded}" aria-label="${downloaded ? 'Remove download' : 'Download episode'}" style="border:0;background:transparent;color:${downloaded ? GOLD : MUTED};padding:8px;font-size:.72rem">${downloading ? '…' : downloaded ? '✓' : '↓'}</button>
  </div>`;
}
function renderHome() {
  const allEpisodes = [...state.episodes].sort((a, b) => normalizedDate(b) - normalizedDate(a));
  const categories = availableCategories(allEpisodes);
  if (!categories.includes(state.activeCategory)) state.activeCategory = 'All';
  const eps =
    state.activeCategory === 'All'
      ? allEpisodes
      : allEpisodes.filter((ep) => episodeCategories(ep).includes(state.activeCategory));
  const cur = state.current;
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:${cur ? 'calc(166px + var(--agp-safe-bottom))' : 'calc(94px + var(--agp-safe-bottom))'};background:${NIGHT};box-sizing:border-box">
    <div style="padding:16px 24px 12px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px">
        <img
          src="/mark.png"
          alt="AGAPAY"
          style="width:42px;height:42px;object-fit:contain;display:block;flex:none"
          onerror="this.style.display='none'"
        >

        <div>
          <div style="font-size:0.6rem;letter-spacing:0.26em;text-transform:uppercase;color:${GOLD};font-weight:700">
            AGAPAY
          </div>
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:500;letter-spacing:0.04em;color:#F6F1E8;line-height:1.1">
            Listen
          </div>
        </div>
      </div>

      <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
      </div>
    </div>

    ${
      cur
        ? `<div class="ep-tap tappable" data-ep="${encodeURIComponent(JSON.stringify(cur))}" style="margin:8px 20px 22px;padding:16px;background:linear-gradient(135deg,rgba(28,58,74,.55),rgba(11,33,48,.3));backdrop-filter:blur(10px);border-radius:20px;border:1px solid rgba(200,162,74,.2);box-shadow:0 14px 34px rgba(0,0,0,.25)">
      <div style="font-size:.58rem;letter-spacing:.22em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px">Continue Listening</div>
      <div style="display:flex;gap:14px;align-items:center">${epArt(cur, 60, 0)}<div style="flex:1;min-width:0"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.08rem;font-weight:600;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cur.title)}</div><div style="font-size:.68rem;color:${MUTED};margin-top:3px">${esc(cur.show)}</div><div style="margin-top:12px;height:3px;background:rgba(255,255,255,.07);border-radius:3px"><div style="width:${state.progress.toFixed(1)}%;height:100%;background:linear-gradient(90deg,${GOLD},#E5C06A);border-radius:3px"></div></div></div></div>
    </div>`
        : ''
    }

    ${
      state.subs.length
        ? `<section style="margin-bottom:22px"><div style="padding:0 22px;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:13px"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:600;color:#F6F1E8">Following</span><span data-nav="library" class="tappable" style="font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};font-weight:700">Your Library</span></div>
      <div class="no-scrollbar" style="display:flex;gap:14px;padding:0 20px 4px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch">${state.subs.map((sub, i) => `<div class="show-row-tap tappable" data-show="${encodeURIComponent(JSON.stringify(sub))}" style="width:112px;flex:none;scroll-snap-align:start">${epArt(sub, 112, i)}<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:.88rem;font-weight:600;color:#F6F1E8;margin-top:9px;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(sub.title)}</div></div>`).join('')}</div></section>`
        : ''
    }

    <div class="no-scrollbar" style="display:flex;gap:8px;padding:0 20px 22px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch">${categories
      .map((cat) => {
        const active = cat === state.activeCategory;
        return `<button class="category-chip tappable" data-category="${esc(cat)}" style="flex:none;padding:8px 16px;background:${active ? `linear-gradient(135deg,${GOLD},#A97C25)` : 'rgba(255,255,255,.04)'};border:${active ? '1px solid transparent' : '1px solid rgba(255,255,255,.07)'};border-radius:22px;font-size:.68rem;color:${active ? NIGHT : MUTED};font-weight:${active ? '800' : '600'}">${esc(cat)}</button>`;
      })
      .join('')}</div>

    <div style="padding:0 22px;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:600;color:#F6F1E8">${state.activeCategory === 'All' ? 'Newest Episodes' : esc(state.activeCategory)}</span><span style="font-size:.58rem;color:${MUTED}">${eps.length} episode${eps.length === 1 ? '' : 's'}</span></div>
    <div style="padding:0 4px">${eps.length ? eps.map((ep, i) => renderEpisodeRow(ep, i)).join('') : `<div style="margin:8px 20px;padding:28px;text-align:center;border:1px solid rgba(255,255,255,.05);border-radius:18px;color:${MUTED};font-size:.78rem">No followed-podcast episodes match this category yet.</div>`}</div>
    ${!state.subs.length ? `<div style="margin:24px 20px;padding:26px;background:rgba(200,162,74,.035);border:1px solid rgba(200,162,74,.14);border-radius:18px;text-align:center"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.25rem;color:#F6F1E8;margin-bottom:7px">Build Your Listening Library</div><div style="font-size:.75rem;color:${MUTED};line-height:1.55;margin-bottom:17px">Follow Orthodox podcasts and their newest episodes will appear here automatically.</div><div class="tappable" data-nav="discover" style="display:inline-flex;padding:10px 22px;background:linear-gradient(135deg,${GOLD},#A97C25);border-radius:10px;font-size:.75rem;color:${NIGHT};font-weight:800">Discover Podcasts</div></div>` : ''}
  </div>`;
}
function renderPlayer() {
  const ep = state.current || {
    title: 'No Track Selected',
    show: 'AGAPAY Listen',
    description: 'Select an episode from your library or discover feed to begin listening.',
  };
  const pct = state.progress.toFixed(1) + '%';
  const liked = isLiked(ep);
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#0a1d2e 0%,#061522 55%,#030a12 100%);overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;padding-top:var(--agp-safe-top);padding-bottom:calc(20px + var(--agp-safe-bottom));box-sizing:border-box">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 24px 8px">
      <div class="back-btn tappable" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:0.6rem;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD};font-weight:700">Now Playing</div>
      <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </div>
    </div>

    <div style="display:flex;justify-content:center;padding:8px 0 18px">
      <div class="agp-player-artwork" style="width:min(72vw,280px);height:min(72vw,280px);aspect-ratio:1;border-radius:20px;background:${EP_COLORS[0]};border:2px solid rgba(200,162,74,0.3);display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;overflow:hidden;box-shadow:0 20px 48px rgba(0,0,0,0.55),0 0 40px rgba(200,162,74,0.06)">
        <div style="position:absolute;inset:-6px;border-radius:20px;border:1px solid rgba(200,162,74,0.08)"></div>
        ${ep.image ? `<img src="${esc(ep.image)}" alt="" style="width:100%;height:100%;border-radius:20px;object-fit:cover;position:absolute;inset:0" onerror="this.remove()">` : ''}
      </div>
    </div>

    <div style="padding:0 32px;text-align:center;margin-bottom:28px;margin-top:8px">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45rem;font-weight:500;color:#F6F1E8;line-height:1.25;margin-bottom:8px">${esc(ep.title)}</div>
      <div style="font-size:0.7rem;color:${GOLD};font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${esc(ep.show)}</div>
    </div>

    <div style="padding:0 32px;margin-bottom:18px;margin-top:auto">
      <div id="seekbar" class="tappable" style="height:24px;display:flex;align-items:center;position:relative">
        <div style="width:100%;height:3.5px;background:rgba(255,255,255,0.08);border-radius:4px;position:relative">
          <div id="pgfill" style="position:absolute;left:0;top:0;height:100%;width:${pct};background:linear-gradient(90deg,${GOLD},#E5C06A);border-radius:4px"></div>
        </div>
        <div id="pgthumb" style="position:absolute;left:${pct};top:50%;transform:translate(-50%,-50%);width:11px;height:11px;border-radius:50%;background:#FFF;box-shadow:0 0 10px rgba(200,162,74,0.8)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:2px;padding:0 2px">
        <span id="pgtime" style="font-size:0.65rem;color:${MUTED};font-family:monospace">${fmtTime(player.elapsed)}</span>
        <span id="pgremain" style="font-size:0.65rem;color:${MUTED};font-family:monospace">-${fmtTime(player.duration - player.elapsed)}</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 22px 24px">
      <div class="like-btn tappable" style="width:46px;height:46px;display:flex;align-items:center;justify-content:center">
        <svg width="25" height="25" viewBox="0 0 24 24" fill="${liked ? GOLD : 'none'}" stroke="${liked ? GOLD : MUTED}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </div>
      <div class="skip-back tappable" style="width:52px;height:52px;display:flex;align-items:center;justify-content:center">${I.back15}</div>
      
      <div class="play-pause tappable" style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,${GOLD},#A97C25);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(200,162,74,0.45)">
        ${state.playing ? I.pause : I.play}
      </div>
      
      <div class="skip-fwd tappable" style="width:52px;height:52px;display:flex;align-items:center;justify-content:center">${I.fwd30}</div>
      <div id="open-queue-btn" class="tappable" style="width:46px;height:46px;display:flex;align-items:center;justify-content:center">
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </div>
    </div>

    <div class="agp-player-tools" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:center;gap:6px;padding:10px 8px;border:1px solid rgba(255,255,255,0.04);border-radius:24px;background:rgba(0,0,0,0.15);width:calc(100% - 32px);max-width:390px;box-sizing:border-box;margin:auto;margin-top:auto;">
      ${[
        [
          'sleep-btn',
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
          state.sleepLabel || 'Sleep',
          state.sleepLabel ? GOLD : MUTED,
        ],
        [
          'speed-btn',
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2" stroke-linecap="round"><polygon points="5,4 15,12 5,20"/><polygon points="12,4 22,12 12,20"/></svg>',
          `${state.playbackSpeed.toFixed(2).replace(/0$/, '')}×`,
          MUTED,
        ],
        [
          'open-desc-btn',
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
          'Details',
          GOLD,
        ],
        [
          'share-btn',
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
          'Share',
          MUTED,
        ],
      ]
        .map(([idOrSvg, svgOrLabel, labelOrColor, optionalColor]) => {
          const isCustom = typeof optionalColor !== 'undefined' || idOrSvg === 'open-desc-btn';
          const targetId = isCustom ? idOrSvg : '';
          const visualSvg = isCustom ? svgOrLabel : idOrSvg;
          const textLabel = isCustom ? labelOrColor : svgOrLabel;
          const textColor = isCustom ? optionalColor : MUTED;
          return `
          <div ${targetId ? `id="${targetId}"` : ''} class="tappable" style="display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;padding:7px 5px;background:rgba(255,255,255,0.02);border-radius:20px;border:1px solid rgba(255,255,255,0.02)">
            ${visualSvg}<span style="font-size:0.68rem;color:${textColor};font-weight:600">${textLabel}</span>
          </div>`;
        })
        .join('')}
    </div>
  </div>`;
}
function renderDiscover() {
  if (!curatedCatalogHydrated && !curatedCatalogLoading) queueMicrotask(hydrateCuratedCatalog);
  const groups = [...new Set(CURATED_PODCASTS.map((podcast) => podcast.category))];
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:${state.current ? 'calc(166px + var(--agp-safe-bottom))' : 'calc(94px + var(--agp-safe-bottom))'};background:${NIGHT};box-sizing:border-box">
    <div style="padding:16px 24px 14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.72rem;font-weight:600;letter-spacing:.03em;color:#F6F1E8">Discover</div>
        <div style="font-size:.66rem;color:${MUTED};margin-top:3px">Curated Orthodox voices, teaching, and stories</div>
      </div>
      <div class="open-rss tappable" style="display:flex;align-items:center;gap:6px;padding:7px 13px;background:rgba(200,162,74,.07);border:1px solid rgba(200,162,74,.22);border-radius:20px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:.58rem;color:${GOLD};font-weight:800;letter-spacing:.08em;text-transform:uppercase">Add RSS</span>
      </div>
    </div>

    <div style="padding:0 20px 18px">
      <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);border-radius:15px;padding:0 16px;box-shadow:0 8px 22px rgba(0,0,0,.14)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.5" style="flex:none"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
        <input id="search-input" value="${esc(state.searchQuery)}" placeholder="Search podcasts worldwide…" style="flex:1;background:transparent;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:.84rem;color:#F6F1E8;padding:14px 0">
      </div>
    </div>

    ${
      state.searchQuery
        ? `
      <section style="padding:0 20px 24px">
        <div style="font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:12px">Search Results</div>
        ${
          state.searchResults.length
            ? state.searchResults
                .map((feed, index) => {
                  const feedUrl = feed.url || feed.xmlUrl || '';
                  const following = state.subs.some((sub) => sub.xmlUrl === feedUrl);
                  return `<div style="display:flex;gap:14px;align-items:center;padding:12px 6px;border-bottom:1px solid rgba(255,255,255,.04)">
            ${epArt({ image: feed.artwork || feed.image }, 48, index)}
            <div style="flex:1;min-width:0">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;font-weight:600;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(feed.title)}</div>
              <div style="font-size:.62rem;color:${MUTED};margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(feed.author || 'Podcast')}</div>
            </div>
            <button class="follow-btn tappable" data-url="${esc(feedUrl)}" data-title="${esc(feed.title)}" style="padding:7px 12px;background:${following ? 'rgba(200,162,74,.09)' : 'rgba(255,255,255,.045)'};border:1px solid ${following ? 'rgba(200,162,74,.23)' : 'rgba(255,255,255,.09)'};border-radius:12px;font-size:.58rem;color:${following ? GOLD : MUTED};font-weight:800;white-space:nowrap">
              ${following ? 'Following' : '+ Follow'}
            </button>
          </div>`;
                })
                .join('')
            : `<div style="padding:34px 20px;text-align:center;color:${MUTED};font-size:.8rem">Searching the podcast directory…</div>`
        }
      </section>
    `
        : `
      <section style="margin-bottom:25px">
        <div style="padding:0 22px;margin-bottom:13px">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:650;color:#F6F1E8">Featured Orthodox Podcasts</div>
          <div style="font-size:.63rem;color:${MUTED};margin-top:3px">Real feeds selected for breadth, quality, and active publication</div>
        </div>
        <div class="no-scrollbar" style="display:flex;gap:13px;padding:0 20px 5px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch">
          ${CURATED_PODCASTS.filter((podcast) => podcast.category === 'Featured')
            .map((podcast, index) => renderCuratedPodcastCard(podcast, index))
            .join('')}
        </div>
      </section>

      ${groups
        .filter((group) => group !== 'Featured')
        .map(
          (group, groupIndex) => `
        <section style="margin-bottom:25px">
          <div style="padding:0 22px;margin-bottom:12px;display:flex;align-items:baseline;justify-content:space-between">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.25rem;font-weight:620;color:#F6F1E8">${esc(group)}</div>
            <div style="font-size:.58rem;color:${MUTED}">${CURATED_PODCASTS.filter((podcast) => podcast.category === group).length} shows</div>
          </div>
          <div class="no-scrollbar" style="display:flex;gap:13px;padding:0 20px 5px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch">
            ${CURATED_PODCASTS.filter((podcast) => podcast.category === group)
              .map((podcast, index) => renderCuratedPodcastCard(podcast, index + groupIndex * 3))
              .join('')}
          </div>
        </section>
      `
        )
        .join('')}
    `
    }
  </div>`;
}
function renderLibrary() {
  const downloadedEpisodes = state.episodes.filter((ep) => state.downloaded.has(episodeKey(ep)));
  const recentHistory = state.history.slice(0, 12);
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:${state.current ? 'calc(166px + var(--agp-safe-bottom))' : 'calc(94px + var(--agp-safe-bottom))'};background:${NIGHT};box-sizing:border-box">
    <div style="padding:16px 24px 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.7rem;font-weight:600;color:#F6F1E8">Library</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:0 20px 22px">
      <button data-nav="queue" class="tappable" style="border:1px solid rgba(200,162,74,.15);background:linear-gradient(135deg,rgba(200,162,74,.09),rgba(255,255,255,.02));border-radius:17px;padding:16px;text-align:left"><div style="font-size:.57rem;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};font-weight:800">Up Next</div><div style="font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:#F6F1E8;margin-top:5px">${state.queue.length}</div><div style="font-size:.62rem;color:${MUTED}">Queued episodes</div></button>
      <button data-nav="likes" class="tappable" style="border:1px solid rgba(200,162,74,.15);background:linear-gradient(135deg,rgba(200,162,74,.09),rgba(255,255,255,.02));border-radius:17px;padding:16px;text-align:left"><div style="font-size:.57rem;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};font-weight:800">Favorites</div><div style="font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:#F6F1E8;margin-top:5px">${state.likedEpisodes.length}</div><div style="font-size:.62rem;color:${MUTED}">Liked episodes</div></button>
    </div>

    <section style="padding:0 20px;margin-bottom:24px">
      <div style="font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:4px">Subscriptions</div>
      <div style="background:rgba(255,255,255,.01);border-radius:17px;border:1px solid rgba(255,255,255,.05);overflow:hidden;box-shadow:0 5px 22px rgba(0,0,0,.2)">
        ${state.subs.length ? state.subs.map((sub, i) => `<div style="display:flex;gap:14px;align-items:center;padding:12px 16px;${i < state.subs.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.04)' : ''}"><div class="show-row-tap tappable" data-show="${encodeURIComponent(JSON.stringify(sub))}" style="display:flex;flex:1;gap:14px;align-items:center;min-width:0">${epArt(sub, 44, i)}<div style="flex:1;min-width:0"><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:.98rem;font-weight:600;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub.title)}</div><div style="font-size:.58rem;color:${MUTED};margin-top:3px">${(sub.xmlUrl || '').replace(/^https?:\/\//, '').split('/')[0]}</div></div></div><button class="unfollow-btn tappable" data-url="${esc(sub.xmlUrl)}" data-title="${esc(sub.title)}" style="padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;font-size:.56rem;color:${MUTED};font-weight:600">Unfollow</button></div>`).join('') : `<div style="padding:25px 16px;text-align:center;font-size:.8rem;color:${MUTED}">No subscriptions yet.</div>`}
      </div>
    </section>

    <section style="padding:0 4px;margin-bottom:24px"><div style="padding:0 22px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-family:'Cormorant Garamond',serif;font-size:1.28rem;font-weight:600;color:#F6F1E8">Downloads</span><span style="font-size:.6rem;color:${MUTED}">${downloadedEpisodes.length}</span></div>${downloadedEpisodes.length ? downloadedEpisodes.map((ep, i) => renderEpisodeRow(ep, i)).join('') : `<div style="margin:0 20px;padding:22px;text-align:center;border:1px solid rgba(255,255,255,.05);border-radius:16px;color:${MUTED};font-size:.75rem">Downloaded episodes will appear here for offline listening.</div>`}</section>

    <section style="padding:0 4px;margin-bottom:24px"><div style="padding:0 22px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-family:'Cormorant Garamond',serif;font-size:1.28rem;font-weight:600;color:#F6F1E8">Listening History</span><button id="history-clear" style="border:0;background:transparent;color:${MUTED};font-size:.6rem">Clear</button></div>${recentHistory.length ? recentHistory.map((ep, i) => renderEpisodeRow(ep, i)).join('') : `<div style="margin:0 20px;padding:22px;text-align:center;border:1px solid rgba(255,255,255,.05);border-radius:16px;color:${MUTED};font-size:.75rem">Episodes you play will appear here.</div>`}</section>
  </div>`;
}
function renderShowDetail() {
  const show = state.currentShow;
  if (!show) return `<div style="padding:40px; text-align:center; color:${MUTED}">Show context missing.</div>`;
  const showEps = state.episodes.filter((ep) => ep.xmlUrl === show.xmlUrl);
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:calc(94px + var(--agp-safe-bottom));background:${NIGHT};box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:14px;padding:16px 20px 20px;">
      <div class="show-back-btn tappable" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Podcast Details</div>
    </div>

    <div style="display:flex;gap:20px;padding:0 24px 24px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.04)">
      ${epArt(show, 84, 0)}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.4rem;font-weight:500;color:#F6F1E8;line-height:1.2;margin-bottom:6px">${esc(show.title)}</div>
        <div class="unfollow-btn tappable" data-url="${esc(show.xmlUrl)}" data-title="${esc(show.title)}"
          style="display:inline-block;padding:6px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:0.65rem;color:${MUTED};font-weight:600;letter-spacing:0.02em">
          Unfollow Podcast
        </div>
      </div>
    </div>

    <div style="padding:20px 4px 0">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:20px">Episodes (${showEps.length})</div>
      
      ${
        showEps.length
          ? showEps
              .map(
                (ep, i) => `
        <div class="ep-tap tappable" data-ep="${encodeURIComponent(JSON.stringify(ep))}" style="display:flex;gap:14px;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.02)">
          ${epArt(ep, 42, i)}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.95rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(ep.title)}</div>
            <div style="font-size:0.58rem;color:${MUTED};margin-top:4px">${ep.duration ? esc(ep.duration) : 'Audio Track'}${ep.date ? ' · ' + timeAgo(ep.date) : ''}</div>
          </div>
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(200,162,74,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="${GOLD}"><polygon points="6,3 21,12 6,21"/></svg>
          </div>
        </div>
      `
              )
              .join('')
          : `<div style="padding:40px 20px;text-align:center;font-size:0.8rem;color:${MUTED};font-style:italic">No episodes cached yet. Feeds will populate during synchronization.</div>`
      }
    </div>
  </div>`;
}
function renderQueuePage() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:${state.current ? 'calc(104px + var(--agp-safe-bottom))' : 'calc(32px + var(--agp-safe-bottom))'};background:${NIGHT};box-sizing:border-box">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 18px">
      <div style="display:flex;align-items:center;gap:13px">
        <button class="library-back-btn tappable" style="width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:600;color:#F6F1E8">Up Next</div><div style="font-size:.62rem;color:${MUTED};margin-top:2px">Plays continuously in this order</div></div>
      </div>
      ${state.queue.length ? `<button id="queue-page-clear" style="border:0;background:transparent;color:${GOLD};font-size:.64rem;font-weight:700">Clear</button>` : ''}
    </div>

    ${
      state.current
        ? `<section style="margin:0 20px 20px;padding:15px;border-radius:18px;background:linear-gradient(135deg,rgba(28,58,74,.52),rgba(11,33,48,.28));border:1px solid rgba(200,162,74,.18)">
      <div style="font-size:.56rem;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};font-weight:800;margin-bottom:11px">Now Playing</div>
      <div class="tappable" data-nav="player" style="display:flex;align-items:center;gap:13px">${epArt(state.current, 54, 0)}<div style="min-width:0"><div style="font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600;color:#F6F1E8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(state.current.title)}</div><div style="font-size:.62rem;color:${MUTED};margin-top:3px">${esc(state.current.show)}</div></div></div>
    </section>`
        : ''
    }

    <section style="padding:0 4px">
      <div style="padding:0 20px 10px;display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:.58rem;letter-spacing:.15em;text-transform:uppercase;color:${GOLD};font-weight:800">Queued Episodes</span><span style="font-size:.62rem;color:${MUTED}">${state.queue.length}</span></div>
      ${
        state.queue.length
          ? state.queue
              .map(
                (
                  ep,
                  i
                ) => `<div class="queue-page-item" style="display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid rgba(255,255,255,.035)">
        <div style="width:22px;text-align:center;color:${i === 0 ? GOLD : MUTED};font-family:'Cormorant Garamond',serif;font-size:1rem">${i + 1}</div>
        ${epArt(ep, 48, i)}
        <button class="queue-page-play tappable" data-index="${i}" style="flex:1;min-width:0;text-align:left;border:0;background:transparent;padding:0"><div style="font-family:'Cormorant Garamond',serif;font-size:.98rem;font-weight:600;color:#F6F1E8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ep.title)}</div><div style="font-size:.61rem;color:${MUTED};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ep.show)}</div></button>
        <button class="queue-move-up" data-index="${i}" aria-label="Move up" style="border:0;background:transparent;color:${MUTED};padding:7px">↑</button>
        <button class="queue-move-down" data-index="${i}" aria-label="Move down" style="border:0;background:transparent;color:${MUTED};padding:7px">↓</button>
        <button class="queue-page-remove" data-index="${i}" aria-label="Remove" style="border:0;background:transparent;color:${MUTED};padding:7px;font-size:1.1rem">×</button>
      </div>`
              )
              .join('')
          : `<div style="margin:4px 20px;padding:34px 24px;border-radius:18px;border:1px solid rgba(255,255,255,.05);text-align:center"><div style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:#F6F1E8;margin-bottom:7px">Your queue is empty</div><div style="font-size:.75rem;line-height:1.5;color:${MUTED}">Tap “NEXT” or “+” beside an episode to build a continuous listening queue.</div></div>`
      }
    </section>
  </div>`;
}
function renderLikesPage() {
  const likedEpisodes = [...state.likedEpisodes].sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:${state.current ? 'calc(104px + var(--agp-safe-bottom))' : 'calc(32px + var(--agp-safe-bottom))'};background:${NIGHT};box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:13px;padding:16px 20px 18px">
      <button class="library-back-btn tappable" style="width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div><div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:600;color:#F6F1E8">Liked Episodes</div><div style="font-size:.62rem;color:${MUTED};margin-top:2px">Your saved listening collection</div></div>
    </div>
    <div style="padding:0 4px">${likedEpisodes.length ? likedEpisodes.map((ep, i) => renderEpisodeRow(ep, i)).join('') : `<div style="margin:4px 20px;padding:34px 24px;border-radius:18px;border:1px solid rgba(255,255,255,.05);text-align:center"><div style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:#F6F1E8;margin-bottom:7px">No liked episodes yet</div><div style="font-size:.75rem;line-height:1.5;color:${MUTED}">Tap the heart beside any episode or in the player to save it here.</div></div>`}</div>
  </div>`;
}
function renderProfile() {
  return renderProfilePanel(state);
}
function mountPremiumTheme() {
  if (document.querySelector('link[data-agp-listen-premium]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/listen/listen-premium.css';
  link.dataset.agpListenPremium = 'true';
  document.head.appendChild(link);
}
function renderMiniPlayer() {
  if (!state.current || state.screen === 'player' || state.screen === 'show') return '';
  const ep = state.current;
  return `<div class="agp-mini-player tappable" id="mini-player-open" role="button" tabindex="0" aria-label="Open now playing">
    ${epArt(ep, 46, 0)}
    <div class="agp-mini-player__copy">
      <div class="agp-mini-player__title">${esc(ep.title)}</div>
      <div class="agp-mini-player__show">${esc(ep.show || 'AGAPAY Listen')}</div>
      <div class="agp-mini-player__progress"><span style="width:${Math.max(0, Math.min(100, state.progress)).toFixed(1)}%"></span></div>
    </div>
    <button class="agp-mini-player__button mini-play-pause tappable" type="button" aria-label="${state.playing ? 'Pause' : 'Play'}">
      ${state.playing ? I.pause : I.play}
    </button>
  </div>`;
}
function renderUtilitySheets() {
  const backdrop = (id) =>
    `<div id="${id}" style="position:absolute;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(5px);z-index:55"></div>`;
  if (state.queueSheet)
    return `${backdrop('utility-backdrop')}<div style="position:absolute;left:0;right:0;bottom:0;max-height:72%;overflow-y:auto;background:#0B2130;border-radius:26px 26px 0 0;border-top:1px solid rgba(200,162,74,.24);z-index:56;padding:16px 20px 34px"><div style="width:42px;height:4px;background:rgba(255,255,255,.18);border-radius:4px;margin:0 auto 18px"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div style="font-family:'Cormorant Garamond',serif;font-size:1.45rem;color:#F6F1E8">Up Next</div><button id="queue-clear" style="border:0;background:transparent;color:${MUTED};font-size:.7rem">Clear</button></div>${state.queue.length ? state.queue.map((ep, i) => `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04)">${epArt(ep, 42, i)}<div class="queue-play tappable" data-ep="${encodeURIComponent(JSON.stringify(ep))}" style="flex:1;min-width:0"><div style="font-size:.82rem;color:#F6F1E8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ep.title)}</div><div style="font-size:.58rem;color:${MUTED};margin-top:3px">${esc(ep.show)}</div></div><button class="queue-remove" data-key="${esc(episodeKey(ep))}" style="border:0;background:transparent;color:${MUTED};font-size:1.1rem">×</button></div>`).join('') : `<div style="padding:30px 10px;text-align:center;color:${MUTED};font-size:.8rem">Your queue is empty.</div>`}</div>`;
  if (state.speedSheet)
    return `${backdrop('utility-backdrop')}<div style="position:absolute;left:0;right:0;bottom:0;background:#0B2130;border-radius:26px 26px 0 0;border-top:1px solid rgba(200,162,74,.24);z-index:56;padding:16px 22px 36px"><div style="width:42px;height:4px;background:rgba(255,255,255,.18);border-radius:4px;margin:0 auto 18px"></div><div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#F6F1E8;margin-bottom:15px">Playback Speed</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">${[0.75, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2].map((rate) => `<button class="speed-option" data-rate="${rate}" style="padding:12px;border-radius:12px;border:1px solid ${rate === state.playbackSpeed ? 'rgba(200,162,74,.6)' : 'rgba(255,255,255,.07)'};background:${rate === state.playbackSpeed ? 'rgba(200,162,74,.13)' : 'rgba(255,255,255,.03)'};color:${rate === state.playbackSpeed ? GOLD : '#F6F1E8'};font-weight:700">${rate}×</button>`).join('')}</div></div>`;
  if (state.sleepSheet)
    return `${backdrop('utility-backdrop')}<div style="position:absolute;left:0;right:0;bottom:0;background:#0B2130;border-radius:26px 26px 0 0;border-top:1px solid rgba(200,162,74,.24);z-index:56;padding:16px 22px 36px"><div style="width:42px;height:4px;background:rgba(255,255,255,.18);border-radius:4px;margin:0 auto 18px"></div><div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#F6F1E8;margin-bottom:15px">Sleep Timer</div>${[10, 15, 30, 45, 60].map((m) => `<button class="sleep-option" data-minutes="${m}" style="display:block;width:100%;padding:13px 4px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.04);background:transparent;color:#F6F1E8">${m} minutes</button>`).join('')}<button id="sleep-end-episode" style="display:block;width:100%;padding:13px 4px;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.04);background:transparent;color:#F6F1E8">End of episode</button>${state.sleepLabel ? `<button id="sleep-cancel" style="display:block;width:100%;padding:14px 4px;text-align:left;border:0;background:transparent;color:${GOLD}">Cancel current timer (${esc(state.sleepLabel)})</button>` : ''}</div>`;
  return '';
}
function render() {
  const root = document.getElementById('listen-app');
  if (!root) return;
  let screen;
  switch (state.screen) {
    case 'player':
      screen = renderPlayer();
      break;
    case 'discover':
      screen = renderDiscover();
      break;
    case 'library':
      screen = renderLibrary();
      break;
    case 'queue':
      screen = renderQueuePage();
      break;
    case 'likes':
      screen = renderLikesPage();
      break;
    case 'profile':
      screen = renderProfile();
      break;
    case 'show':
      screen = renderShowDetail();
      break;
    // Integrated Show Detail routing route
    default:
      screen = renderHome();
  }
  root.innerHTML = `
    <div class="agp-screen-enter">${screen}</div>
    ${!['player', 'show', 'queue', 'likes'].includes(state.screen) ? renderBottomNav() : ''}
    ${renderToast()}
    ${renderRssSheet()}
    ${renderDescriptionSheet()}
    ${renderUtilitySheets()}
  `;
  bindEvents();
}
function bindEvents() {
  return bindListenEvents(listenEventDependencies);
}
async function checkGlobalAuthSession() {
  try {
    const resp = await fetch('/api/listen/profile');
    if (resp.ok) {
      const userData = await resp.json();
      if (userData.authenticated) {
        state.user = {
          authenticated: true,
          name: userData.name,
          initials: userData.initials,
          status: userData.memberStatus,
        };
        render();
      }
    }
  } catch (err) {
    console.warn('Global account sync currently unavailable:', err);
  }
}
const listenEventDependencies = {
  setState,
  state,
  save,
  render,
  showToast,
  refreshAllFeeds,
  addToQueue,
  toggleLikeEpisode,
  episodeKey,
  removeDownload,
  downloadEpisode,
  playEpisode,
  player,
  updateMediaSessionPlaybackState,
  addRssFeed,
  setPlaybackSpeed,
  setSleepTimer,
  setSleepAtEpisodeEnd,
  clearSleepTimer,
  persistQueue,
  playQueuedEpisode,
  doSearch,
  fetchFeed,
};
mountPremiumTheme();
render();
checkGlobalAuthSession();
if (state.subs.length) refreshAllFeeds();
