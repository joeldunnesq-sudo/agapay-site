import type { ListenEpisode } from './app-contracts.js';
import { EP_COLORS, CATEGORY_RULES } from './app-catalog.js';
export function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) as string) ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val instanceof Set ? [...val] : val));
}
export function fmtTime(s: number | string | undefined) {
  if (!s || !isFinite(s as number)) return '0:00';
  const m = Math.floor((s as number) / 60);
  return m + ':' + String(Math.floor((s as number) % 60)).padStart(2, '0');
}
export function timeAgo(str: string | number | undefined) {
  if (!str) return '';
  const diff = (Date.now() - Number(new Date(str))) / 1000;
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function esc(str: unknown) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
export function episodeKey(ep: Partial<ListenEpisode> | null | undefined) {
  return String(ep?.guid || ep?.url || `${ep?.show || ''}:${ep?.title || ''}`);
}
export function normalizedDate(ep: ListenEpisode | null | undefined) {
  const time = new Date(ep?.date || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
export function episodeCategories(ep: ListenEpisode) {
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
export function availableCategories(episodes: ListenEpisode[]) {
  const counts = new Map();
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
export function epArt(ep: Partial<ListenEpisode>, size: number, colorIdx: number = 0) {
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
