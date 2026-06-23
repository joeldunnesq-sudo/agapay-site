/**
 * AGAPAY Listen — app.js
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
  screen:        'home',
  subs:          load('agp_subs',     []),
  episodes:      load('agp_eps',      []),
  current:       load('agp_current',  null),
  queue:         [],
  progress:      0,
  playing:       false,
  searchQuery:   '',
  searchResults: [],
  rssSheet:      false,
  rssUrl:        '',
  toast:         null,
  liked:         new Set(load('agp_liked', [])),
  downloads:     {},   // guid -> object URL
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
    ? `<img src="${esc(ep.image)}" style="width:${size}px;height:${size}px;object-fit:cover;position:absolute;inset:0" onerror="this.remove()">`
    : '';
  const mark = `<img src="/mark.png" style="width:${Math.round(size*0.55)}px;height:${Math.round(size*0.55)}px;opacity:0.65">`;
  return `<div style="width:${size}px;height:${size}px;flex:none;border-radius:${Math.round(size*0.22)}px;background:${bg};border:1px solid rgba(200,162,74,0.2);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">${img}${mark}</div>`;
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
      description: (item.querySelector('description')?.textContent || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
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

function handleExport() {
  const xml  = exportOpml(state.subs);
  const blob = new Blob([xml], { type: 'text/x-opml' });
  const a    = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'agapay-listen.opml',
  });
  a.click();
  showToast('Library exported as OPML');
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
const I = {
  home:    c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="${c}"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/></svg>`,
  disc:    c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>`,
  lib:     c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  person:  c => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  play:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="#061522"><polygon points="6,3 21,12 6,21"/></svg>`,
  pause:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="#061522"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  back15:  `<svg width="28" height="28" viewBox="0 0 24 24" fill="#F6F1E8"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="19" x2="5" y2="5" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round"/></svg>`,
  fwd30:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="#F6F1E8"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round"/></svg>`,
};

// ─── Demo / Trending data ─────────────────────────────────────────────────────
const DEMO_EPS = [
  { guid:'podvig-94',   title:'The Jesus Prayer in Daily Life',  show:'The Podvig',       duration:'54:32',  date: new Date(Date.now()-86400000*5).toISOString(),  url:'', image:'' },
  { guid:'arena-67',    title:'Passions & the Inner Warfare',    show:'The Arena',         duration:'1:02:14',date: new Date(Date.now()-86400000*8).toISOString(),  url:'', image:'' },
  { guid:'simple-128',  title:'On Theosis',                      show:'Simple Path to God',duration:'48:07',  date: new Date(Date.now()-86400000*11).toISOString(), url:'', image:'' },
  { guid:'spirits-156', title:'Angelic Hierarchy',               show:'Lord of Spirits',  duration:'1:08:22',date: new Date(Date.now()-86400000*13).toISOString(), url:'', image:'' },
  { guid:'symbolic-203',title:'Sacred Geometry',                 show:'Symbolic World',   duration:'57:44',  date: new Date(Date.now()-86400000*15).toISOString(), url:'', image:'' },
];

const TRENDING = [
  { title:'Lord of Spirits',          author:'Fr. Damick & Fr. De Young', url:'https://www.ancientfaith.com/podcasts/lordofspirits/rss' },
  { title:'Symbolic World',           author:'Jonathan Pageau',            url:'https://feeds.buzzsprout.com/258194.rss' },
  { title:'Ancient Faith Radio',      author:'Ancient Faith Ministries',   url:'https://www.ancientfaith.com/podcasts/afr/rss' },
  { title:'The Patristics Project',   author:'Fr. Stephen De Young',       url:'' },
  { title:'Orthodox Ethos',           author:'Hieromonk Alexios',          url:'' },
];

// ─── Render helpers ───────────────────────────────────────────────────────────
function renderStatusBar() {
  return ''; // Cleanly eliminated mock device elements
}

function renderBottomNav() {
  const s = state.screen;
  const tab = (id, label, iconFn) => {
    const active = s === id;
    const c = active ? GOLD : STONE;
    return `<div class="tappable" data-nav="${id}" style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:2px 10px;flex:1">
      ${iconFn(c)}
      <span style="font-size:9px;color:${c};font-weight:${active?'600':'500'};letter-spacing:0.04em">${label}</span>
    </div>`;
  };
  return `<div style="position:absolute;bottom:0;left:0;right:0;height:76px;background:rgba(6,21,34,0.97);border-top:1px solid rgba(200,162,74,0.12);display:flex;align-items:flex-start;justify-content:space-around;padding-top:12px;z-index:30">
    ${tab('home',     'Home',     I.home)}
    ${tab('discover', 'Discover', I.disc)}
    ${tab('library',  'Library',  I.lib)}
    ${tab('profile',  'Profile',  I.person)}
    <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:130px;height:5px;background:rgba(246,241,232,0.22);border-radius:3px;pointer-events:none"></div>
  </div>`;
}

function renderToast() {
  if (!state.toast) return '';
  return `<div style="position:absolute;bottom:88px;left:16px;right:16px;background:linear-gradient(135deg,#1C3A4A,#0B2130);border:1px solid rgba(200,162,74,0.3);border-radius:12px;padding:12px 16px;z-index:50;display:flex;align-items:center;gap:10px;pointer-events:none">
    <div style="width:22px;height:22px;flex:none;border-radius:50%;background:linear-gradient(135deg,#C8A24A,#A97C25);display:flex;align-items:center;justify-content:center">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#061522" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span style="font-size:0.78rem;color:#F6F1E8;font-weight:500">${esc(state.toast)}</span>
  </div>`;
}

function renderRssSheet() {
  if (!state.rssSheet) return '';
  return `
    <div id="rss-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:45"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;background:#0B2130;border-radius:24px 24px 0 0;border-top:1px solid rgba(200,162,74,0.22);z-index:46;padding:0 22px 36px">
      <div style="display:flex;justify-content:center;padding:14px 0 18px">
        <div style="width:40px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px"></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="2"/></svg>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;font-weight:500;color:#F6F1E8">Add RSS Feed</div>
      </div>
      <div style="font-size:0.68rem;color:${MUTED};margin-bottom:18px">Paste any podcast RSS feed URL to add it to your library.</div>
      <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:0 14px;margin-bottom:14px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" style="flex:none"><path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="2"/></svg>
        <input id="rss-input" value="${esc(state.rssUrl)}" placeholder="https://feeds.example.com/podcast.rss"
          style="flex:1;background:transparent;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:0.8rem;color:#F6F1E8;padding:14px 0">
      </div>
      <button id="rss-add-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#C8A24A,#A97C25);border:none;border-radius:12px;cursor:pointer;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.05rem;font-style:italic;color:#061522;font-weight:500;letter-spacing:0.03em">Add Podcast Feed</button>
      <div id="rss-cancel" class="tappable" style="text-align:center;margin-top:14px;font-size:0.72rem;color:${MUTED};padding:6px">Cancel</div>
    </div>`;
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function renderHome() {
  const eps  = state.episodes.length ? state.episodes : DEMO_EPS;
  const cur  = state.current;

  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:20px;padding-bottom:76px;background:${NIGHT}">
    <div style="padding:16px 22px 8px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:0.58rem;letter-spacing:0.24em;text-transform:uppercase;color:${GOLD};font-weight:700">AGAPAY</div>
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:500;letter-spacing:0.06em;color:#F6F1E8;line-height:1.05">Listen</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
    </div>

    ${cur ? `
    <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(cur))}' style="margin:8px 18px 14px;padding:16px;background:linear-gradient(135deg,rgba(28,58,74,0.9),rgba(11,33,48,0.7));border-radius:16px;border:1px solid rgba(200,162,74,0.22)">
      <div style="font-size:0.57rem;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:11px">Continue Listening</div>
      <div style="display:flex;gap:12px;align-items:center">
        ${epArt(cur, 56, 0)}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cur.title)}</div>
          <div style="font-size:0.64rem;color:${MUTED};margin-top:2px">${esc(cur.show)}</div>
          <div style="margin-top:9px;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
            <div style="width:${state.progress.toFixed(1)}%;height:100%;background:linear-gradient(90deg,${GOLD},#D6AF5B);border-radius:2px"></div>
          </div>
        </div>
        <div style="width:40px;height:40px;flex:none;border-radius:50%;background:linear-gradient(135deg,${GOLD},#A97C25);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(200,162,74,0.4)">
          ${state.playing ? I.pause : I.play}
        </div>
      </div>
    </div>` : ''}

    <div style="display:flex;gap:8px;padding:0 18px 14px;overflow-x:auto;white-space:nowrap">
      ${['All','Sermons','Theology','Prayer','Saints','Scripture'].map((c,i) =>
        `<div style="flex:none;padding:6px 15px;background:${i===0?`linear-gradient(135deg,${GOLD},#A97C25)`:'rgba(255,255,255,0.05)'};border:${i===0?'none':'1px solid rgba(255,255,255,0.09)'};border-radius:20px;font-size:0.62rem;color:${i===0?NIGHT:MUTED};font-weight:${i===0?'700':'400'}">${c}</div>`
      ).join('')}
    </div>

    <div style="padding:0 18px;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
      <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.18rem;font-weight:500;color:#F6F1E8;letter-spacing:0.04em">Recent Episodes</span>
      <span style="font-size:0.58rem;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};font-weight:600">See All</span>
    </div>
    ${eps.slice(0, 10).map((ep, i) => `
      <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(ep))}' style="display:flex;gap:12px;align-items:center;padding:10px 18px;border-top:1px solid rgba(166,159,145,0.08)">
        ${epArt(ep, 44, i)}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.92rem;font-weight:500;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ep.title)}</div>
          <div style="font-size:0.6rem;color:${MUTED};margin-top:2px">${esc(ep.show)}${ep.duration?' · '+esc(ep.duration):''}${ep.date?' · '+timeAgo(ep.date):''}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,162,74,0.45)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
    ).join('')}
    ${!state.subs.length ? `
    <div style="margin:20px 18px;padding:20px;background:rgba(200,162,74,0.07);border:1px solid rgba(200,162,74,0.18);border-radius:14px;text-align:center">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;color:#F6F1E8;margin-bottom:6px">No subscriptions yet</div>
      <div style="font-size:0.72rem;color:${MUTED};line-height:1.5;margin-bottom:14px">Go to Discover to search for Orthodox podcasts or add an RSS feed.</div>
      <div class="tappable" data-nav="discover" style="display:inline-flex;padding:8px 18px;background:linear-gradient(135deg,${GOLD},#A97C25);border-radius:8px;font-size:0.72rem;color:${NIGHT};font-weight:600">Browse Podcasts</div>
    </div>` : ''}
  </div>`;
}

function renderPlayer() {
  const ep  = state.current || DEMO_EPS[0];
  const pct = state.progress.toFixed(1) + '%';
  const liked = state.liked.has(ep.guid);

  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,${NIGHT} 0%,#081A28 40%,${NIGHT} 100%);overflow-y:auto;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:24px 24px 12px">
      <div class="back-btn tappable" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:0.58rem;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-weight:700">Now Playing</div>
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </div>
    </div>

    <div style="display:flex;justify-content:center;padding:8px 0 28px">
      <div style="width:220px;height:220px;border-radius:16px;background:${EP_COLORS[0]};border:2px solid rgba(200,162,74,0.35);display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;overflow:hidden;animation:glow-pulse 4s ease-in-out infinite">
        <div style="position:absolute;inset:-8px;border-radius:16px;border:1px solid rgba(200,162,74,0.14)"></div>
        <div style="position:absolute;inset:-18px;border-radius:16px;border:1px solid rgba(200,162,74,0.07)"></div>
        ${ep.image ? `<img src="${esc(ep.image)}" style="width:220px;height:220px;border-radius:16px;object-fit:cover;position:absolute;inset:0" onerror="this.remove()">` : ''}
        <img src="/mark.png" style="width:100px;height:100px;opacity:0.8">
      </div>
    </div>

    <div style="padding:0 28px;text-align:center;margin-bottom:22px">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:500;color:#F6F1E8;line-height:1.3;margin-bottom:6px">${esc(ep.title)}</div>
      <div style="font-size:0.68rem;color:${GOLD};font-weight:600;letter-spacing:0.06em">${esc(ep.show)}</div>
    </div>

    <div style="padding:0 28px;margin-bottom:6px">
      <div id="seekbar" class="tappable" style="height:28px;display:flex;align-items:center;position:relative">
        <div style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;position:relative;overflow:hidden">
          <div id="pgfill" style="position:absolute;left:0;top:0;height:100%;width:${pct};background:linear-gradient(90deg,${GOLD},#D6AF5B);border-radius:2px;transition:width 0.3s linear"></div>
        </div>
        <div id="pgthumb" style="position:absolute;left:${pct};top:50%;transform:translate(-50%,-50%);width:13px;height:13px;border-radius:50%;background:#D6AF5B;box-shadow:0 2px 8px rgba(200,162,74,0.6)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px">
        <span id="pgtime" style="font-size:0.62rem;color:${MUTED}">${fmtTime(player.elapsed)}</span>
        <span id="pgremain" style="font-size:0.62rem;color:${MUTED}">-${fmtTime(player.duration - player.elapsed)}</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 36px 16px">
      <div class="like-btn tappable" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${liked?GOLD:'none'}" stroke="${liked?GOLD:MUTED}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </div>
      <div class="skip-back tappable" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${I.back15}</div>
      <div class="play-pause tappable" style="width:66px;height:66px;border-radius:50%;background:linear-gradient(135deg,${GOLD},#A97C25);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(200,162,74,0.45)">
        ${state.playing ? I.pause : I.play}
      </div>
      <div class="skip-fwd tappable" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${I.fwd30}</div>
      <div class="tappable" data-nav="library" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </div>
    </div>

    ${state.queue.length > 0 ? `
    <div style="margin:8px 18px 0;padding:14px;background:rgba(255,255,255,0.04);border-radius:14px;border:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:0.56rem;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:10px">Up Next</div>
      <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(state.queue[0]))}' style="display:flex;gap:10px;align-items:center">
        ${epArt(state.queue[0], 36, 1)}
        <div style="flex:1;min-width:0">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.85rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(state.queue[0].title)}</div>
          <div style="font-size:0.58rem;color:${MUTED};margin-top:1px">${esc(state.queue[0].show)}</div>
        </div>
      </div>
    </div>` : ''}

    <div style="display:flex;justify-content:center;gap:28px;padding:16px 18px 28px;margin-top:auto">
      ${[
        ['<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>', 'Sleep'],
        ['<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2" stroke-linecap="round"><polygon points="5,4 15,12 5,20"/><polygon points="12,4 22,12 12,20"/></svg>', '1×'],
        ['<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A69F91" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>', 'Share'],
      ].map(([svg, label]) => `
        <div class="tappable" style="display:flex;align-items:center;gap:6px">${svg}<span style="font-size:0.6rem;color:${MUTED}">${label}</span></div>
      `).join('')}
    </div>
  </div>`;
}

function renderDiscover() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:20px;padding-bottom:76px;background:${NIGHT}">
    <div style="padding:16px 22px 12px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.55rem;font-weight:500;letter-spacing:0.06em;color:#F6F1E8">Discover</div>
      <div class="open-rss tappable" style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:linear-gradient(135deg,rgba(200,162,74,0.15),rgba(200,162,74,0.07));border:1px solid rgba(200,162,74,0.28);border-radius:20px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:0.6rem;color:${GOLD};font-weight:700;letter-spacing:0.1em">RSS Feed</span>
      </div>
    </div>

    <div style="padding:0 18px 14px">
      <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:0 14px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" style="flex:none"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
        <input id="search-input" value="${esc(state.searchQuery)}" placeholder="Search podcasts worldwide…"
          style="flex:1;background:transparent;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:0.82rem;color:#F6F1E8;padding:12px 0">
        ${state.searchQuery ? `<div id="clear-search" class="tappable" style="padding:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>` : ''}
      </div>
    </div>

    ${state.searchQuery ? `
    <div style="padding:0 18px">
      <div style="font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};font-weight:600;margin-bottom:10px">Results for "${esc(state.searchQuery)}"</div>
      ${state.searchResults.length ? state.searchResults.slice(0,10).map((f,i) => `
        <div style="display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          ${epArt({image: f.artwork || f.image}, 46, i)}
          <div style="flex:1;min-width:0">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.92rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.title)}</div>
            <div style="font-size:0.58rem;color:${MUTED};margin-top:1px">${esc(f.author||'')}</div>
          </div>
          <div class="follow-btn tappable" data-url="${esc(f.url)}" data-title="${esc(f.title)}"
            style="padding:5px 10px;background:${state.subs.find(s=>s.xmlUrl===f.url)?'rgba(200,162,74,0.12)':'rgba(255,255,255,0.06)'};border:1px solid ${state.subs.find(s=>s.xmlUrl===f.url)?'rgba(200,162,74,0.25)':'rgba(255,255,255,0.1)'};border-radius:12px;font-size:0.56rem;color:${state.subs.find(s=>s.xmlUrl===f.url)?GOLD:MUTED};font-weight:600;white-space:nowrap">
            ${state.subs.find(s=>s.xmlUrl===f.url) ? 'Following' : '+ Follow'}
          </div>
        </div>`
      ).join('') : `<div style="padding:20px;text-align:center;color:${MUTED};font-size:0.82rem">Searching…</div>`}
    </div>` : `
    <div style="padding:0 18px;margin-bottom:16px">
      <div style="font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};font-weight:600;margin-bottom:10px">Trending Orthodox</div>
      <div style="background:rgba(255,255,255,0.03);border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden">
        ${TRENDING.map((t,i) => `
          <div style="display:flex;gap:12px;align-items:center;padding:11px 14px;${i<TRENDING.length-1?'border-bottom:1px solid rgba(255,255,255,0.05)':''}">
            <span style="font-size:0.75rem;color:${i<2?GOLD:MUTED};font-weight:700;width:16px;text-align:center">${i+1}</span>
            ${epArt({image:''}, 42, i)}
            <div style="flex:1;min-width:0">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.9rem;color:#F6F1E8">${esc(t.title)}</div>
              <div style="font-size:0.56rem;color:${MUTED}">${esc(t.author)}</div>
            </div>
            ${t.url ? `<div class="follow-btn tappable" data-url="${esc(t.url)}" data-title="${esc(t.title)}"
              style="padding:4px 10px;background:${state.subs.find(s=>s.xmlUrl===t.url)?'rgba(200,162,74,0.12)':'rgba(255,255,255,0.06)'};border:1px solid ${state.subs.find(s=>s.xmlUrl===t.url)?'rgba(200,162,74,0.25)':'rgba(255,255,255,0.1)'};border-radius:12px;font-size:0.56rem;color:${state.subs.find(s=>s.xmlUrl===t.url)?GOLD:MUTED};font-weight:600">
              ${state.subs.find(s=>s.xmlUrl===t.url)?'Following':'+ Follow'}
            </div>` : `<div style="padding:4px 10px;font-size:0.56rem;color:rgba(166,159,145,0.4)">Soon</div>`}
          </div>`
        ).join('')}
      </div>
    </div>`}
  </div>`;
}

function renderLibrary() {
  const eps = state.episodes.length ? state.episodes : DEMO_EPS;
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:20px;padding-bottom:76px;background:${NIGHT}">
    <div style="padding:16px 22px 18px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.55rem;font-weight:500;letter-spacing:0.06em;color:#F6F1E8">Library</div>

    <div style="padding:0 18px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        <span style="font-size:0.62rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700">Subscriptions</span>
      </div>
      <div style="background:rgba(255,255,255,0.03);border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden">
        ${state.subs.length ? state.subs.map((sub,i) => `
          <div style="display:flex;gap:12px;align-items:center;padding:12px 14px;${i<state.subs.length-1?'border-bottom:1px solid rgba(255,255,255,0.05)':''}">
            ${epArt(sub, 42, i)}
            <div style="flex:1;min-width:0">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.9rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub.title)}</div>
              <div style="font-size:0.56rem;color:${MUTED};margin-top:1px">${(sub.xmlUrl||'').replace(/^https?:\/\//,'').split('/')[0]}</div>
            </div>
          </div>`
        ).join('') : `<div style="padding:16px 14px;text-align:center;font-size:0.78rem;color:${MUTED}">No subscriptions yet — go to Discover</div>`}
      </div>
    </div>

    <div style="padding:0 18px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          <span style="font-size:0.62rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700">Queue</span>
        </div>
        <span style="font-size:0.58rem;color:${MUTED}">${eps.length} episodes</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${eps.slice(0,6).map((ep,i) => `
          <div class="ep-tap tappable" data-ep='${esc(JSON.stringify(ep))}' style="display:flex;gap:10px;align-items:center;padding:11px 12px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:0.72rem;color:${i===0?GOLD:MUTED};font-weight:700;width:16px;text-align:center">${i+1}</div>
            ${epArt(ep, 36, i)}
            <div style="flex:1;min-width:0">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.85rem;color:#F6F1E8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ep.title)}</div>
              <div style="font-size:0.55rem;color:${MUTED}">${esc(ep.show)}${ep.duration?' · '+esc(ep.duration):''}</div>
            </div>
          </div>`
        ).join('')}
      </div>
    </div>
  </div>`;
}

function renderProfile() {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-top:20px;padding-bottom:76px;background:${NIGHT}">
    <div style="padding:16px 22px 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.55rem;font-weight:500;letter-spacing:0.06em;color:#F6F1E8">Profile</div>

    <div style="display:flex;flex-direction:column;align-items:center;padding:0 22px 24px">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#1C3A4A,#0B2130);border:2px solid rgba(200,162,74,0.35);display:flex;align-items:center;justify-content:center;margin-bottom:12px">
        <span style="font-size:1.5rem;color:${GOLD};font-weight:600;font-family:'Cormorant Garamond',Georgia,serif">JD</span>
      </div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.25rem;font-weight:500;color:#F6F1E8;margin-bottom:3px">Joel Dunn</div>
      <div style="font-size:0.6rem;color:${GOLD};font-weight:600;letter-spacing:0.14em;text-transform:uppercase">AGAPAY Member</div>
    </div>

    <div style="display:flex;margin:0 18px 20px;background:rgba(255,255,255,0.03);border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden">
      ${[['5','Following'],[String(state.subs.length),'Podcasts'],['0h','Listened']].map(([v,l],i) => `
        <div style="flex:1;padding:14px 10px;text-align:center;${i<2?'border-right:1px solid rgba(255,255,255,0.06)':''}">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.4rem;font-weight:500;color:${GOLD}">${v}</div>
          <div style="font-size:0.56rem;color:${MUTED};margin-top:2px">${l}</div>
        </div>`
      ).join('')}
    </div>

    <div style="padding:0 18px;margin-bottom:14px">
      <div style="font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:10px">Library Transfer</div>
      <div style="display:flex;gap:10px">
        ${[
          ['import-opml','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>','Import','OPML'],
          ['export-opml','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>','Export','OPML'],
          ['','<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>','Sync','Pocket Casts'],
        ].map(([id, svg, label, sub]) => `
          <div ${id?`id="${id}"`:''}class="tappable" style="flex:1;padding:14px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(200,162,74,0.18),rgba(200,162,74,0.06));border:1px solid rgba(200,162,74,0.25);display:flex;align-items:center;justify-content:center">${svg}</div>
            <div style="text-align:center">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.85rem;color:#F6F1E8">${label}</div>
              <div style="font-size:0.54rem;color:${MUTED};margin-top:1px">${sub}</div>
            </div>
          </div>`
        ).join('')}
      </div>
    </div>

    <div style="padding:0 18px;margin-bottom:24px">
      <div style="font-size:0.58rem;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:10px">Preferences</div>
      <div style="background:rgba(255,255,255,0.03);border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden">
        ${[['Liturgical Calendar Alerts',true],['Auto-download on Wi-Fi',true]].map(([l,on]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,0.05)">
            <span style="font-size:0.82rem;color:#F6F1E8">${l}</span>
            <div style="width:36px;height:20px;border-radius:10px;background:${on?GOLD:'rgba(255,255,255,0.1)'};position:relative">
              <div style="position:absolute;${on?'right':'left'}:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff"></div>
            </div>
          </div>`
        ).join('')}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px">
          <span style="font-size:0.82rem;color:#F6F1E8">Playback Speed</span>
          <span style="font-size:0.78rem;color:${GOLD};font-weight:600">1×</span>
        </div>
      </div>
    </div>
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
    default:         screen = renderHome();
  }

  // Build inner markup cleanly without mock phone components
  root.innerHTML = `
    ${screen}
    ${state.screen !== 'player' ? renderBottomNav() : ''}
    ${renderToast()}
    ${renderRssSheet()}
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
      if (e.target.closest('.follow-btn')) return;
      try { playEpisode(JSON.parse(el.dataset.ep)); } catch {}
    });
  });

  document.querySelector('.back-btn')?.addEventListener('click', () => setState({ screen: 'home' }));

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
  document.getElementById('rss-input')?.addEventListener('input', (e) => { state.rssUrl = e.target.value; });
  document.getElementById('rss-add-btn')?.addEventListener('click', () => {
    const val = document.getElementById('rss-input')?.value || '';
    addRssFeed(val);
  });

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    doSearch(e.target.value);
    render();
    document.getElementById('search-input')?.focus();
  });
  document.getElementById('clear-search')?.addEventListener('click', () => setState({ searchQuery: '', searchResults: [] }));

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

  document.getElementById('import-opml')?.addEventListener('click', handleImport);
  document.getElementById('export-opml')?.addEventListener('click', handleExport);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
render();
if (state.subs.length) refreshAllFeeds();
