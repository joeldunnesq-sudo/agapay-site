/**
 * AGAPAY Listen — app.js (Spruced & Expanded Layout Edition)
 * Vanilla JS SPA. No build step. ES modules only.
 * Renders into #listen-app inside public/listen.html
 */

import { AudioPlayer } from './player.js';
import { ListenDB }    from './db.js';
import { importOpml, exportOpml } from './opml.js';

// ─── Brand tokens ────────────────────────────────────────────────────────────
const GOLD   = '#C8A24A';
const NIGHT  = '#061522';
const NIGHT2 = '#0B2130';
const CREAM  = '#F6F1E8';
const MUTED  = '#A69F91';
const STONE  = '#4a4038';

const EP_COLORS = [
  'linear-gradient(135deg,#0E2838,#163850)',
  'linear-gradient(135deg,#1F0E2E,#2A1540)',
  'linear-gradient(135deg,#0E2218,#142E20)',
  'linear-gradient(135deg,#2E1E0E,#3A2810)',
  'linear-gradient(135deg,#0E1E2E,#162840)',
];

// ─── Singletons ───────────────────────────────────────────────────────────────
const db     = new ListenDB();
const player = new AudioPlayer();

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  screen:             'home',
  subs:               load('agp_subs',     []),
  episodes:           load('agp_eps',      []),
  current:            load('agp_current',  null),
  currentShow:        null, // Tracks the currently active podcast channel view
  queue:              [],
  progress:           0,
  playing:            false,
  searchQuery:        '',
  searchResults:      [],
  rssSheet:           false,
  rssUrl:             '',
  descriptionSheet:   false, // Track description modal state
  toast:              null,
  liked:              new Set(load('agp_liked', [])),
  downloads:          {},   // guid -> object URL
  
  // Platform accounts configuration profiles
  user: {
    authenticated: false,
    name: 'Guest Listener',
    initials: '--',
    status: 'Anonymous'
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val instanceof Set ? [...val] : val));
}

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

function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function timeAgo(str) {
  if (!str) return '';
  const diff = (Date.now() - new Date(str)) / 1000;
  if (diff < 3600)   return Math.floor(diff / 60)    + 'm ago';
  if (diff < 86400)  return Math.floor(diff / 3600)  + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(str).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function epArt(ep, size, colorIdx = 0) {
  const bg = EP_COLORS[colorIdx % EP_COLORS.length];
  const img = ep?.image
    ? `<img src="${esc(ep.image)}" style="width:${size}px;height:${size}px;object-fit:cover;position:absolute;inset:0;transition:transform 0.3s" onerror="this.remove()">`
    : '';
  const mark = `<img src="/listen/images/mark.png" style="width:${Math.round(size*0.55)}px;height:${Math.round(size*0.55)}px;opacity:0.4">`;
  return `<div class="art-container" style="width:${size}px;height:${size}px;flex:none;border-radius:${Math.round(size*0.25)}px;background:${bg};box-shadow: 0 4px 12px rgba(0,0,0,0.3);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">${img}${mark}</div>`;
}

// ─── RSS / Podcast Index API ──────────────────────────────────────────────────
async function fetchFeed(xmlUrl) {
  const resp = await fetch('/api/listen/rss?url=' + encodeURIComponent(xmlUrl));
  if (!resp.ok) throw new Error('Feed fetch failed');
  const xml  = await resp.text();
  const doc  = new DOMParser().parseFromString(xml, 'application/xml');

  const channelTitle = doc.querySelector('channel > title')?.textContent?.trim() || '';
  const channelImage =
    doc.querySelector('channel image[href]')?.getAttribute('href') ||
    doc.querySelector('channel > image > url')?.textContent?.trim() || '';

  const items = [...doc.querySelectorAll('item')].slice(0, 30).map((item, i) => {
    const enclosure = item.querySelector('enclosure');
    return {
      guid:    (item.querySelector('guid')?.textContent || enclosure?.getAttribute('url') || String(i)).trim(),
      title:   item.querySelector('title')?.textContent?.trim() || 'Untitled',
      show:    channelTitle,
      xmlUrl,
      url:     enclosure?.getAttribute('url') || '',
      duration: item.querySelector('duration')?.textContent?.trim() || '',
      date:    item.querySelector('pubDate')?.textContent?.trim() || '',
      image:   item.querySelector('image[href]')?.getAttribute('href') || channelImage,
      description: (item.querySelector('description')?.textContent || '').replace(/<[^>]+>/g, '').trim().slice(0, 400),
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
    } catch (e) { console.warn('Feed error:', sub.xmlUrl, e); }
  }
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  const episodes = all.slice(0, 60);
  save('agp_eps', episodes);
  setState({ episodes });
}

async function addRssFeed(xmlUrl) {
  if (!xmlUrl?.trim()) return;
  try {
    const { title, image, items } = await fetchFeed(xmlUrl.trim());
    const sub = { title: title || xmlUrl, image, xmlUrl: xmlUrl.trim(), addedAt: Date.now() };
    const subs = [...state.subs.filter(s => s.xmlUrl !== sub.xmlUrl), sub];
    save('agp_subs', subs);
    setState({ subs, rssSheet: false, rssUrl: '' });
    showToast(`"${sub.title}" added`);
    const allEps = [...state.episodes.filter(e => e.xmlUrl !== sub.xmlUrl), ...items];
    allEps.sort((a, b) => new Date(b.date) - new Date(a.date));
    const episodes = allEps.slice(0, 60);
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
    } catch { setState({ searchResults: [] }); }
  }, 380);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
player.on('progress', ({ progress, elapsed, duration }) => {
  state.progress = progress;
  const fill    = document.getElementById('pgfill');
  const thumb   = document.getElementById('pgthumb');
  const elapsed_ = document.getElementById('pgtime');
  const remain  = document.getElementById('pgremain');
  if (fill)    fill.style.width = progress + '%';
  if (thumb)   thumb.style.left = progress + '%';
  if (elapsed_) elapsed_.textContent = fmtTime(elapsed);
  if (remain)  remain.textContent   = '-' + fmtTime(duration - elapsed);
  if (state.current) {
    db.saveProgress(state.current.guid, elapsed, duration);
  }
});

player.on('ended', () => {
  state.playing = false;
  if (state.queue.length > 0) {
    const [next, ...rest] = state.queue;
    playEpisode(next, rest);
  } else {
    setState({ playing: false });
  }
});

async function playEpisode(ep, queue = state.queue) {
  if (!ep.url) { showToast('No audio URL for this episode'); return; }
  let audioUrl = ep.url;
  try {
    const localUrl = await db.getDownload(ep.guid);
    if (localUrl) audioUrl = localUrl;
  } catch {}
  const saved = await db.getProgress(ep.guid).catch(() => null);
  const startTime = saved?.position || 0;
  player.load(audioUrl, startTime);
  player.play();
  save('agp_current', ep);
  setState({ screen: 'player', current: ep, queue, playing: true, progress: (saved?.position || 0) / (saved?.duration || 1) * 100 });
}

// ─── OPML ─────────────────────────────────────────────────────────────────────
function handleImport() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.opml,.xml' });
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text  = await file.text();
    const feeds = importOpml(text);
    if (!feeds.length) { showToast('No podcast feeds found in that file'); return; }
    let added = 0;
    for (const f of feeds) {
      if (!state.subs.find(s => s.xmlUrl === f.xmlUrl)) {
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

// ─── SVG icons ────────────────────────────────────────────────────────────────
const I = {
  home:    c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="${c}"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/></svg>`,
  disc:    c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>`,
  lib:     c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  person:  c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  play:    `<svg width="26" height="26" viewBox="0 0 24 24" fill="#061522"><polygon points="6,3 21,12 6,21"/></svg>`,
  pause:   `<svg width="26" height="26" viewBox="0 0 24 24" fill="#061522"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  
  // High-Contrast Rewind 15 Button
  back15:  `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><text x="12" y="15.5" fill="#F6F1E8" font-size="8px" font-family="'DM Sans', sans-serif" font-weight="800" text-anchor="middle" stroke="none">15</text></svg>`,
  
  // High-Contrast Fast-Forward 30 Button
  fwd30:   `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/><text x="12" y="15.5" fill="#F6F1E8" font-size="8px" font-family="'DM Sans', sans-serif" font-weight="800" text-anchor="middle" stroke="none">30</text></svg>`,
};

// ─── Popular Orthodox Podcast Data preloads ──────────────────────────────────
const DEMO_EPS = [];
const TRENDING = [
  { title: 'Lord of Spirits', author: 'Fr. Stephen De Young & Fr. Andrew Stephen Damick', url: 'https://www.ancientfaith.com/podcasts/lordofspirits/rss' },
  { title: 'The Symbolic World', author: 'Jonathan Pageau', url: 'https://feeds.buzzsprout.com/258194.rss' },
  { title: 'Orthodoxy Live', author: 'Fr. Evan Armatas', url: 'https://www.ancientfaith.com/podcasts/orthodoxylive/rss' },
  { title: 'The Areopagus', author: 'Fr. Andrew Stephen Damick & Michael Ceron', url: 'https://www.ancientfaith.com/podcasts/areopagus/rss' },
  { title: 'Search the Scriptures', author: 'Dr. Jeannie Constantinou', url: 'https://www.ancientfaith.com/podcasts/searchthescriptures/rss' }
];

function renderBottomNav() {
  const s = state.screen;
  const tab = (id, label, iconFn) => {
    const active = s === id;
    const c = active ? GOLD : STONE;
    return `<div class="tappable" data-nav="${id}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 10px;flex:1">
      ${iconFn(c)}
      <span style="font-size:9px;color:${c};font-weight:${active?'600':'500'};letter-spacing:0.04em">${label}</span>
    </div>`;
  };
  return `<div style="position:absolute;bottom:0;left:0;right:0;height:76px;background:rgba(6,21,34,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid rgba(200,162,74,0.08);display:flex;align-items:flex-start;justify-content:space-around;padding-top:12px;z-index:30">
    ${tab('home',     'Home',     I.home)}
    ${tab('discover', 'Discover', I.disc)}
    ${tab('library',  'Library',  I.lib)}
    ${tab('profile',  'Profile',  I.person)}
    <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:130px;height:5px;background:rgba(246,241,232,0.15);border-radius:3px;pointer-events:none"></div>
  </div>`;
}

function renderToast() {
  if (!state.toast) return '';
  return `<div style="position:absolute;bottom:88px;left:16px;right:16px;background:linear-gradient(135deg,#1C3A4A,#0B2130);border:1px solid rgba(200,162,74,0.3);border-radius:12px;padding:14px 18px;z-index:50;display:flex;align-items:center;gap:10px;box-shadow: 0 8px 24px rgba(0,0,0,0.4);pointer-events:none">
    <div style="width:20px;height:20px;flex:none;border-radius:50%;background:linear-gradient(135deg,#C8A24A,#A97C25);display:flex;align-items:center;justify-content:center">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#061522" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span style="font-size:0.8rem;color:#F6F1E8;font-weight:500">${esc(state.toast)}</span>
  </div>`;
}

function renderRssSheet() {
  if (!state.rssSheet) return '';
  return `
    <div id="rss-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:45"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;background:#0B2130;border-radius:24px 24px 0 0;border-top:1px solid rgba(200,162,74,0.22);z-index:46;padding:0 22px 36px">
      <div style="display:flex;justify-content:center;padding:14px 0 18px"><div style="width:40px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px"></div></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2"><path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="2"/></svg>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:500;color:#F6F1E8">Add RSS Feed</div>
      </div>
      <input id="rss-input" value="${esc(state.rssUrl)}" placeholder="https://feeds.example.com/podcast.rss" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#F6F1E8;padding:14px;margin-bottom:14px;outline:none;">
      <button id="rss-add-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#C8A24A,#A97C25);border:none;border-radius:12px;color:#061522;font-weight:600">Add Podcast Feed</button>
      <div id="rss-cancel" class="tappable" style="text-align:center;margin-top:16px;font-size:0.75rem;color:${MUTED}">Cancel</div>
    </div>`;
}

// ─── Episode Description Drawer Module ──────────────────────────────────
function renderDescriptionSheet() {
  if (!state.descriptionSheet) return '';
  const ep = state.current || { title: 'No Track Selected', show: 'AGAPAY Listen', description: 'Select an episode from your library or discover feed to begin listening.' };
  const infoText = ep.description ? ep.description : 'No summary metadata listed for this episode channel.';
  return `
    <div id="desc-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:45"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;max-height:65%;background:#0B2130;border-radius:24px 24px 0 0;border-top:1px solid rgba(200,162,74,0.22);z-index:46;padding:0 24px 40px;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:center;padding:14px 0 12px;flex-shrink:0"><div style="width:40px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px"></div></div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:500;color:#F6F1E8;margin-bottom:4px;flex-shrink:0;letter-spacing:0.01em">${esc(ep.title)}</div>
      <div style="font-size:0.65rem;color:${GOLD};font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:16px;flex-shrink:0">${esc(ep.show)}</div>
      <div style="overflow-y:auto;flex-grow:1;font-size:0.85rem;color:#F6F1E8;line-height:1.6;padding-right:4px;font-weight:400;overscroll-behavior:contain">
        ${esc(infoText)}
      </div>
      <button id="desc-close-btn" style="width:100%;margin-top:20px;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#F6F1E8;font-size:0.85rem;cursor:pointer;flex-shrink:0">Dismiss</button>
    </div>`;
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function renderHome() {
  const eps  = state.episodes.length ? state.episodes : DEMO_EPS;
  const cur  = state.current;

  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:24px;padding-bottom:88px;background:${NIGHT}">
    <div style="padding:16px 24px 12px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:0.6rem;letter-spacing:0.26em;text-transform:uppercase;color:${GOLD};font-weight:700">AGAPAY</div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:500;letter-spacing:0.04em;color:#F6F1E8;line-height:1.1">Listen</div>
      </div>
      <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      </div>
    </div>

    ${cur ? `
    <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(cur))}' style="margin:8px 20px 20px;padding:16px;background:linear-gradient(135deg,rgba(28,58,74,0.4),rgba(11,33,48,0.2));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:18px;border:1px solid rgba(200,162,74,0.18);box-shadow: 0 8px 24px rgba(0,0,0,0.2)">
      <div style="font-size:0.58rem;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px">Continue Listening</div>
      <div style="display:flex;gap:14px;align-items:center">
        ${epArt(cur, 58, 0)}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.05rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(cur.title)}</div>
          <div style="font-size:0.68rem;color:${MUTED};margin-top:3px">${esc(cur.show)}</div>
          <div style="margin-top:12px;height:2px;background:rgba(255,255,255,0.06);border-radius:2px;position:relative">
            <div style="width:${state.progress.toFixed(1)}%;height:100%;background:linear-gradient(90deg,${GOLD},#D6AF5B);border-radius:2px"></div>
          </div>
        </div>
        <div style="width:42px;height:42px;flex:none;border-radius:50%;background:linear-gradient(135deg,${GOLD},#A97C25);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(200,162,74,0.3)">
          ${state.playing ? I.pause : I.play}
        </div>
      </div>
    </div>` : ''}

    <div class="no-scrollbar" style="display:flex;gap:8px;padding:0 20px 20px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch">
      ${['All','Sermons','Theology','Prayer','Saints','Scripture'].map((c,i) =>
        `<div style="flex:none;padding:7px 16px;background:${i===0?`linear-gradient(135deg,${GOLD},#A97C25)`:'rgba(255,255,255,0.04)'};border:${i===0?'none':'1px solid rgba(255,255,255,0.07)'};border-radius:20px;font-size:0.68rem;color:${i===0?NIGHT:MUTED};font-weight:${i===0?'700':'500'}">${c}</div>`
      ).join('')}
    </div>

    <div style="padding:0 22px;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
      <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:500;color:#F6F1E8;letter-spacing:0.02em">Recent Episodes</span>
      <span style="font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};font-weight:700">See All</span>
    </div>
    <div style="padding:0 4px">
      ${eps.slice(0, 10).map((ep, i) => `
        <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(ep))}' style="display:flex;gap:14px;align-items:center;padding:12px 18px;margin:0 4px;border-radius:12px;">
          ${epArt(ep, 46, i)}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(ep.title)}</div>
            <div style="font-size:0.62rem;color:${MUTED};margin-top:4px">${esc(ep.show)}${ep.duration?' · '+esc(ep.duration):''}${ep.date?' · '+timeAgo(ep.date):''}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,162,74,0.35)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`
      ).join('')}
    </div>
    ${!state.subs.length ? `
    <div style="margin:24px 20px;padding:24px;background:rgba(200,162,74,0.03);border:1px solid rgba(200,162,74,0.12);border-radius:16px;text-align:center;box-shadow: inset 0 0 20px rgba(0,0,0,0.2)">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;color:#F6F1E8;margin-bottom:6px">Expand Your Library</div>
      <div style="font-size:0.75rem;color:${MUTED};line-height:1.5;margin-bottom:16px;padding:0 8px">Explore Discover to connect with custom Orthodox feeds or add your personal RSS link.</div>
      <div class="tappable" data-nav="discover" style="display:inline-flex;padding:9px 22px;background:linear-gradient(135deg,${GOLD},#A97C25);border-radius:8px;font-size:0.75rem;color:${NIGHT};font-weight:700;box-shadow: 0 4px 12px rgba(200,162,74,0.15)">Browse Podcasts</div>
    </div>` : ''}
  </div>`;
}

function renderPlayer() {
  const ep  = state.current || { title: 'No Track Selected', show: 'AGAPAY Listen', description: 'Select an episode from your library or discover feed to begin listening.' };
  const pct = state.progress.toFixed(1) + '%';
  const liked = state.liked.has(ep.guid);

  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#0a1d2e 0%,#061522 55%,#030a12 100%);overflow-y:auto;display:flex;flex-direction:column;padding-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 24px 8px">
      <div class="back-btn tappable" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:0.6rem;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD};font-weight:700">Now Playing</div>
      <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </div>
    </div>

    <div style="display:flex;justify-content:center;padding:12px 0 24px">
      <div style="width:280px;height:280px;border-radius:20px;background:${EP_COLORS[0]};border:2px solid rgba(200,162,74,0.3);display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;overflow:hidden;box-shadow: 0 20px 48px rgba(0,0,0,0.55), 0 0 40px rgba(200,162,74,0.06)">
        <div style="position:absolute;inset:-6px;border-radius:20px;border:1px solid rgba(200,162,74,0.08)"></div>
        ${ep.image ? `<img src="${esc(ep.image)}" style="width:280px;height:280px;border-radius:20px;object-fit:cover;position:absolute;inset:0" onerror="this.remove()">` : ''}
        <img src="/mark.png" style="width:130px;height:130px;opacity:0.6;position:relative;z-index:1">
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

    <div style="display:flex;align-items:center;justify-content:space-between;padding:0px 32px 32px">
      <div class="like-btn tappable" style="width:46px;height:46px;display:flex;align-items:center;justify-content:center">
        <svg width="25" height="25" viewBox="0 0 24 24" fill="${liked?GOLD:'none'}" stroke="${liked?GOLD:MUTED}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </div>
      <div class="skip-back tappable" style="width:52px;height:52px;display:flex;align-items:center;justify-content:center">${I.back15}</div>
      
      <div class="play-pause tappable" style="width:74px;height:74px;border-radius:50%;background:linear-gradient(135deg,${GOLD},#A97C25);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(200,162,74,0.45)">
        ${state.playing ? I.pause : I.play}
      </div>
      
      <div class="skip-fwd tappable" style="width:52px;height:52px;display:flex;align-items:center;justify-content:center">${I.fwd30}</div>
      <div class="tappable" data-nav="library" style="width:46px;height:46px;display:flex;align-items:center;justify-content:center">
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </div>
    </div>

    <div style="display:flex; justify-content:center; align-items:center; gap:16px; padding:12px 20px; border:1px solid rgba(255,255,255,0.04); border-radius:30px; background:rgba(0,0,0,0.15); width:fit-content; margin:auto; margin-top:auto;">
      ${[
        ['sleep-btn-dummy', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', 'Sleep', MUTED],
        ['speed-btn-dummy', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2" stroke-linecap="round"><polygon points="5,4 15,12 5,20"/><polygon points="12,4 22,12 12,20"/></svg>', '1.0×', MUTED],
        ['open-desc-btn', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', 'Details', GOLD],
        ['share-btn', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>', 'Share', MUTED]
      ].map(([idOrSvg, svgOrLabel, labelOrColor, optionalColor]) => {
        const isCustom = typeof optionalColor !== 'undefined' || idOrSvg === 'open-desc-btn';
        const targetId = isCustom ? idOrSvg : '';
        const visualSvg = isCustom ? svgOrLabel : idOrSvg;
        const textLabel = isCustom ? labelOrColor : svgOrLabel;
        const textColor = isCustom ? optionalColor : MUTED;
        
        return `
          <div ${targetId ? `id="${targetId}"` : ''} class="tappable" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:20px;border:1px solid rgba(255,255,255,0.02)">
            ${visualSvg}<span style="font-size:0.68rem;color:${textColor};font-weight:600">${textLabel}</span>
          </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderDiscover() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:24px;padding-bottom:88px;background:${NIGHT}">
    <div style="padding:16px 24px 14px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:500;letter-spacing:0.04em;color:#F6F1E8">Discover</div>
      <div class="open-rss tappable" style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(200,162,74,0.06);border:1px solid rgba(200,162,74,0.22);border-radius:20px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:0.6rem;color:${GOLD};font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Add RSS</span>
      </div>
    </div>

    <div style="padding:0 20px 16px">
      <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:0 16px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.5" style="flex:none"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
        <input id="search-input" value="${esc(state.searchQuery)}" placeholder="Search podcasts worldwide…" style="flex:1;background:transparent;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:0.85rem;color:#F6F1E8;padding:14px 0">
      </div>
    </div>

    ${state.searchQuery ? `
    <div style="padding:0 20px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:12px">Results</div>
      ${state.searchResults.length ? state.searchResults.map((f,i) => `
        <div style="display:flex;gap:14px;align-items:center;padding:12px 6px;border-bottom:1px solid rgba(255,255,255,0.04)">
          ${epArt({image: f.artwork || f.image}, 46, i)}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.title)}</div>
            <div style="font-size:0.62rem;color:${MUTED};margin-top:3px">${esc(f.author||'')}</div>
          </div>
          <div class="follow-btn tappable" data-url="${esc(f.url)}" data-title="${esc(f.title)}"
            style="padding:6px 12px;background:${state.subs.find(s=>s.xmlUrl===f.url)?'rgba(200,162,74,0.08)':'rgba(255,255,255,0.04)'};border:1px solid ${state.subs.find(s=>s.xmlUrl===f.url)?'rgba(200,162,74,0.2)':'rgba(255,255,255,0.08)'};border-radius:12px;font-size:0.58rem;color:${state.subs.find(s=>s.xmlUrl===f.url)?GOLD:MUTED};font-weight:700;white-space:nowrap;letter-spacing:0.02em">
            ${state.subs.find(s=>s.xmlUrl===f.url) ? 'Following' : '+ Follow'}
          </div>
        </div>`
      ).join('') : `<div style="padding:32px;text-align:center;color:${MUTED};font-size:0.85rem;font-style:italic">Searching…</div>`}
    </div>` : `
    <div style="padding:0 20px;margin-bottom:16px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:12px;padding-left:4px">Popular Orthodox Podcasts</div>
      <div style="background:rgba(255,255,255,0.01);border-radius:16px;border:1px solid rgba(255,255,255,0.04);overflow:hidden;box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
        ${TRENDING.map((t,i) => `
          <div style="display:flex;gap:14px;align-items:center;padding:12px 16px;${i<TRENDING.length-1?'border-bottom:1px solid rgba(255,255,255,0.04)':''}">
            <span style="font-size:0.8rem;color:${i<2?GOLD:STONE};font-weight:700;width:16px;text-align:center;font-family:'Cormorant Garamond',serif">${i+1}</span>
            ${epArt({image:''}, 42, i)}
            <div style="flex:1;min-width:0">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.95rem;color:#F6F1E8;line-height:1.2">${esc(t.title)}</div>
              <div style="font-size:0.58rem;color:${MUTED};margin-top:2px">${esc(t.author)}</div>
            </div>
            <div class="follow-btn tappable" data-url="${esc(t.url)}" data-title="${esc(t.title)}"
              style="padding:5px 12px;background:${state.subs.find(s=>s.xmlUrl===t.url)?'rgba(200,162,74,0.08)':'rgba(255,255,255,0.04)'};border:1px solid ${state.subs.find(s=>s.xmlUrl===t.url)?'rgba(200,162,74,0.18)' : 'rgba(255,255,255,0.08)'};border-radius:12px;font-size:0.58rem;color:${state.subs.find(s=>s.xmlUrl===t.url)?GOLD:MUTED};font-weight:700">
              ${state.subs.find(s=>s.xmlUrl===t.url)?'Following':'+ Follow'}
            </div>
          </div>`
        ).join('')}
      </div>
    </div>`}
  </div>`;
}

function renderLibrary() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:24px;padding-bottom:88px;background:${NIGHT}">
    <div style="padding:16px 24px 18px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:500;color:#F6F1E8">Library</div>

     <div style="padding:0 20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-left:4px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          <span style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700">Subscriptions</span>
        </div>
        <div style="background:rgba(255,255,255,0.01);border-radius:16px;border:1px solid rgba(255,255,255,0.04);overflow:hidden;box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
          ${state.subs.length ? state.subs.map((sub,i) => `
            <div style="display:flex;gap:14px;align-items:center;padding:12px 16px;${i<state.subs.length-1?'border-bottom:1px solid rgba(255,255,255,0.04)':''}">
              <div class="show-row-tap tappable" data-show='${esc(JSON.stringify(sub))}' style="display:flex;flex:1;gap:14px;align-items:center;min-width:0;">
                ${epArt(sub, 42, i)}
                <div style="flex:1;min-width:0">
                  <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.95rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(sub.title)}</div>
                  <div style="font-size:0.58rem;color:${MUTED};margin-top:3px;font-family:monospace;opacity:0.85">${(sub.xmlUrl||'').replace(/^https?:\/\//,'').split('/')[0]}</div>
                </div>
              </div>
              <div class="unfollow-btn tappable" data-url="${esc(sub.xmlUrl)}" data-title="${esc(sub.title)}"
                style="padding:6px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;font-size:0.56rem;color:${MUTED};font-weight:600;white-space:nowrap;letter-spacing:0.02em">
                Unfollow
              </div>
            </div>`
          ).join('') : `<div style="padding:24px 16px;text-align:center;font-size:0.8rem;color:${MUTED};font-style:italic">No active subscriptions — tap Discover to begin</div>`}
        </div>
    </div>
  </div>`;
}

function renderShowDetail() {
  const show = state.currentShow;
  if (!show) return `<div style="padding:40px; text-align:center; color:${MUTED}">Show context missing.</div>`;

  // Filter global feeds array down to matching target show RSS references exclusively
  const showEps = state.episodes.filter(ep => ep.xmlUrl === show.xmlUrl);

  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:24px;padding-bottom:88px;background:${NIGHT}">
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
      
      ${showEps.length ? showEps.map((ep, i) => `
        <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(ep))}' style="display:flex;gap:14px;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.02)">
          ${epArt(ep, 42, i)}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.95rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">${esc(ep.title)}</div>
            <div style="font-size:0.58rem;color:${MUTED};margin-top:4px">${ep.duration ? esc(ep.duration) : 'Audio Track'}${ep.date ? ' · ' + timeAgo(ep.date) : ''}</div>
          </div>
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(200,162,74,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="${GOLD}"><polygon points="6,3 21,12 6,21"/></svg>
          </div>
        </div>
      `).join('') : `<div style="padding:40px 20px;text-align:center;font-size:0.8rem;color:${MUTED};font-style:italic">No episodes cached yet. Feeds will populate during synchronization.</div>`}
    </div>
  </div>`;
}

function renderProfile() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:24px;padding-bottom:88px;background:${NIGHT}">
    <div style="padding:16px 24px 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:500;color:#F6F1E8">Profile</div>
      
    <div style="display:flex;flex-direction:column;align-items:center;padding:4px 22px 24px">
      <div style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#1C3A4A,#0B2130);border:2px solid rgba(200,162,74,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:12px;box-shadow: 0 8px 24px rgba(0,0,0,0.3)">
        <span style="font-size:1.6rem;color:${GOLD};font-weight:500;font-family:'Cormorant Garamond',Georgia,serif;letter-spacing:0.05em">${esc(state.user.initials)}</span>
      </div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;color:#F6F1E8;margin-bottom:3px;letter-spacing:0.02em">${esc(state.user.name)}</div>
      <div style="font-size:0.6rem;color:${GOLD};font-weight:700;letter-spacing:0.16em;text-transform:uppercase">${esc(state.user.status)}</div>
    </div>

    <div style="display:flex;margin:0 20px 24px;background:rgba(255,255,255,0.02);border-radius:16px;border:1px solid rgba(255,255,255,0.04);overflow:hidden;box-shadow: 0 4px 16px rgba(0,0,0,0.15)">
      ${[
        [String(state.subs.length), 'Following'],
        [String(state.episodes.length), 'Cached Tracks'],
        ['0h', 'Listened']
      ].map(([v,l],i) => `
        <div style="flex:1;padding:14px 10px;text-align:center;${i<2?'border-right:1px solid rgba(255,255,255,0.04)':''}">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45rem;font-weight:500;color:${GOLD}">${v}</div>
          <div style="font-size:0.58rem;color:${MUTED};margin-top:2px;font-weight:500;letter-spacing:0.02em">${l}</div>
        </div>`
      ).join('')}
    </div>

    <div style="padding:0 20px;margin-bottom:16px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:4px">Library Transfer</div>
      <div style="display:flex;gap:10px">
        ${[
          ['import-opml', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', 'Import', 'OPML'],
          ['export-opml', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>', 'Export', 'OPML'],
          ['sync-pcasts', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>', 'Sync', 'Pocket Casts'],
        ].map(([id, svg, label, sub]) => `
          <div ${id ? `id="${id}"` : ''} class="tappable action-card" style="flex:1;padding:16px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow: 0 4px 12px rgba(0,0,0,0.1);transition: all 0.2s">
            <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,rgba(200,162,74,0.14),rgba(200,162,74,0.04));border:1px solid rgba(200,162,74,0.2);display:flex;align-items:center;justify-content:center">${svg}</div>
            <div style="text-align:center">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.9rem;font-weight:500;color:#F6F1E8;line-height:1.2">${label}</div>
              <div style="font-size:0.56rem;color:${MUTED};margin-top:2px;font-weight:500">${sub}</div>
            </div>
          </div>`
        ).join('')}
      </div>
    </div>

    <div style="padding:0 20px;margin-bottom:24px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:4px">Preferences</div>
      <div style="background:rgba(255,255,255,0.01);border-radius:16px;border:1px solid rgba(255,255,255,0.04);overflow:hidden;box-shadow: 0 4px 16px rgba(0,0,0,0.15)">
        ${[['Liturgical Calendar Alerts', true], ['Auto-download on Wi-Fi', false]].map(([l, on]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:0.85rem;color:#F6F1E8;font-weight:500">${l}</span>
            <div style="width:34px;height:18px;border-radius:10px;background:${on ? GOLD : 'rgba(255,255,255,0.08)'};position:relative;transition: background 0.2s">
              <div style="position:absolute;${on ? 'right' : 'left'}:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow: 0 1px 4px rgba(0,0,0,0.3)"></div>
            </div>
          </div>`
        ).join('')}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px">
          <span style="font-size:0.85rem;color:#F6F1E8;font-weight:500">Playback Speed</span>
          <span style="font-size:0.8rem;color:${GOLD};font-weight:700;font-family:monospace">1.0×</span>
        </div>
      </div>
    </div>
  </div>`;
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

// ─── Main render ──────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('listen-app');
  if (!root) return;

  let screen;
  switch (state.screen) {
    case 'player':   screen = renderPlayer();   break;
    case 'discover': screen = renderDiscover(); break;
    case 'library':  screen = renderLibrary();  break;
    case 'profile':  screen = renderProfile();  break;
    case 'show':     screen = renderShowDetail(); break; // Integrated Show Detail routing route
    default:         screen = renderHome();
  }

  // Build inner interface layout
  root.innerHTML = `
    <div class="agp-screen-enter">${screen}</div>
    ${renderMiniPlayer()}
    ${(state.screen !== 'player' && state.screen !== 'show') ? renderBottomNav() : ''}
    ${renderToast()}
    ${renderRssSheet()}
    ${renderDescriptionSheet()}
  `;

  bindEvents();
}

// ─── Event binding ────────────────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => setState({ screen: el.dataset.nav }));
  });

  document.querySelectorAll('.ep-tap').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.follow-btn') || e.target.closest('.unfollow-btn')) return;
      try { playEpisode(JSON.parse(el.dataset.ep)); } catch {}
    });
  });

  document.querySelector('.back-btn')?.addEventListener('click', () => setState({ screen: 'home' }));

  document.getElementById('mini-player-open')?.addEventListener('click', (e) => {
    if (e.target.closest('.mini-play-pause')) return;
    setState({ screen: 'player' });
  });

  document.querySelector('.mini-play-pause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.playing) { player.pause(); setState({ playing: false }); }
    else { player.play(); setState({ playing: true }); }
  });


  document.querySelector('.play-pause')?.addEventListener('click', () => {
    if (state.playing) { player.pause(); setState({ playing: false }); }
    else               { player.play();  setState({ playing: true });  }
  });

  document.querySelector('.skip-back')?.addEventListener('click', () => player.skipBack(15));
  document.querySelector('.skip-fwd')?.addEventListener('click',  () => player.skipForward(30));

  document.getElementById('seekbar')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.seek((e.clientX - r.left) / r.width);
  });

  document.querySelector('.like-btn')?.addEventListener('click', () => {
    if (!state.current) return;
    const liked = new Set(state.liked);
    liked.has(state.current.guid) ? liked.delete(state.current.guid) : liked.add(state.current.guid);
    setState({ liked });
    save('agp_liked', liked);
  });

  document.querySelector('.open-rss')?.addEventListener('click', () => setState({ rssSheet: true }));
  document.getElementById('rss-backdrop')?.addEventListener('click', () => setState({ rssSheet: false }));
  document.getElementById('rss-cancel')?.addEventListener('click',   () => setState({ rssSheet: false }));
  document.getElementById('rss-add-btn')?.addEventListener('click', () => {
    const val = document.getElementById('rss-input')?.value || '';
    addRssFeed(val);
  });

  document.getElementById('login-redirect-btn')?.addEventListener('click', () => {
    window.location.href = '/account/login?redirect=' + encodeURIComponent(window.location.href);
  });

  // Description Drawer Bindings
  document.getElementById('open-desc-btn')?.addEventListener('click', () => setState({ descriptionSheet: true }));
  document.getElementById('desc-backdrop')?.addEventListener('click', () => setState({ descriptionSheet: false }));
  document.getElementById('desc-close-btn')?.addEventListener('click', () => setState({ descriptionSheet: false }));

  // Search Input Handler Fix
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    doSearch(e.target.value);
  });

  // Follow Button Triggers
  document.querySelectorAll('.follow-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url   = btn.dataset.url;
      const title = btn.dataset.title || url;
      if (!url || state.subs.find(s => s.xmlUrl === url)) return;
      state.subs.push({ title, xmlUrl: url, image: '', addedAt: Date.now() });
      save('agp_subs', state.subs);
      showToast(`"${title}" added`);
      render();
      try {
        const { title: t, image } = await fetchFeed(url);
        const sub = state.subs.find(s => s.xmlUrl === url);
        if (sub) { sub.title = t || title; sub.image = image || ''; save('agp_subs', state.subs); }
        refreshAllFeeds();
      } catch {}
    });
  });

  // Native Web Share Trigger
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    const ep = state.current;
    if (!ep) return;
  
    const shareData = {
      title: ep.title,
      text: `Listening to "${ep.title}" on AGAPAY Listen:`,
      url: ep.url || window.location.href
    };
  
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failure:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast('Episode link copied to clipboard!');
      } catch {
        showToast('Unable to share track link.');
      }
    }
  });

  // Wired: Click event mapping from Library cards directly into dynamic show views
  document.querySelectorAll('.show-row-tap').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.unfollow-btn')) return; // Avoid bubble collisons with clear unfollow sweeps
      try {
        const showData = JSON.parse(el.dataset.show);
        setState({ screen: 'show', currentShow: showData });
      } catch (err) { console.error('Show detail state routing error:', err); }
    });
  });

  // Return navigation from deep channel catalog feeds back to Library tab matrix
  document.querySelector('.show-back-btn')?.addEventListener('click', () => {
    setState({ screen: 'library', currentShow: null });
  });

  // Unfollow Click Handler
  document.querySelectorAll('.unfollow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      e.preventDefault();
      const url = btn.dataset.url;
      const title = btn.dataset.title;
      if (!url) return;

      const updatedSubs = state.subs.filter(s => s.xmlUrl !== url);
      const updatedEps = state.episodes.filter(ep => ep.xmlUrl !== url);

      save('agp_subs', updatedSubs);
      save('agp_eps', updatedEps);
      
      // If unfollowing from within a detail page, pop back safely to library grid
      const exitingShowView = state.screen === 'show' && state.currentShow?.xmlUrl === url;

      setState({ 
        subs: updatedSubs,
        episodes: updatedEps,
        screen: exitingShowView ? 'library' : state.screen,
        currentShow: exitingShowView ? null : state.currentShow
      });

      showToast(`Unfollowed "${title}"`);
    });
  });
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
          status: userData.memberStatus
        };
        render(); // Re-render once user details load successfully
      }
    }
  } catch (err) {
    console.warn('Global account sync currently unavailable:', err);
  }
}

// ─── Boot Sequence ─────────────────────────────────────────────────────────────
mountPremiumTheme();
render();
checkGlobalAuthSession(); // Silently reconciles login states across sub-apps
if (state.subs.length) refreshAllFeeds();
