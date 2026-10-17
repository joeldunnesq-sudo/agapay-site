// Generated from src/browser/listen/app-presentation.ts by npm run build:browser. Do not edit.
import { EP_COLORS, CATEGORY_RULES } from './app-catalog.js';
function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val instanceof Set ? [...val] : val));
}
function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function timeAgo(str) {
  if (!str) return '';
  const diff = (Date.now() - Number(new Date(str))) / 1e3;
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function episodeKey(ep) {
  return String(ep?.guid || ep?.url || `${ep?.show || ''}:${ep?.title || ''}`);
}
function normalizedDate(ep) {
  const time = new Date(ep?.date || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
function episodeCategories(ep) {
  const explicit = Array.isArray(ep?.categories) ? ep.categories : [];
  const haystack = [ep?.title, ep?.show, ep?.description, ...explicit].filter(Boolean).join(' ');
  const matched = Object.entries(CATEGORY_RULES)
    .filter(([, rx]) => rx.test(haystack))
    .map(([name]) => name);
  explicit.forEach((cat) => {
    const clean = String(cat).trim();
    if (clean && clean.length < 28 && !matched.includes(clean)) matched.push(clean);
  });
  return matched.length ? matched : ['General'];
}
function availableCategories(episodes) {
  const counts = /* @__PURE__ */ new Map();
  episodes.forEach((ep) => episodeCategories(ep).forEach((cat) => counts.set(cat, (counts.get(cat) || 0) + 1)));
  const preferred = ['Sermons', 'Theology', 'Prayer', 'Saints', 'Scripture', 'History', 'Family'];
  const sorted = [...counts.entries()].sort((a, b) => {
    const ai = preferred.indexOf(a[0]),
      bi = preferred.indexOf(b[0]);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    return b[1] - a[1];
  });
  return ['All', ...sorted.slice(0, 8).map(([name]) => name)];
}
function epArt(ep, size, colorIdx = 0) {
  const bg = EP_COLORS[colorIdx % EP_COLORS.length];
  const img = ep?.image
    ? `<img
        src="${esc(ep.image)}"
        alt=""
        style="
          width:${size}px;
          height:${size}px;
          object-fit:cover;
          position:absolute;
          inset:0;
          transition:transform 0.3s;
        "
        onerror="this.remove()"
      >`
    : '';
  return `
    <div
      class="art-container"
      style="
        width:${size}px;
        height:${size}px;
        flex:none;
        border-radius:${Math.round(size * 0.25)}px;
        background:${bg};
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        position:relative;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
      "
    >
      ${img}
    </div>
  `;
}
export { availableCategories, epArt, episodeCategories, episodeKey, esc, fmtTime, load, normalizedDate, save, timeAgo };
