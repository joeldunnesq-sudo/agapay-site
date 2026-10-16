// Generated from src/browser/listen/app-panels.ts by npm run build:browser. Do not edit.
import { I, STONE } from './app-catalog.js';
import { GOLD, NIGHT, MUTED } from './app-catalog.js';
import { esc } from './app-presentation.js';
function renderToastPanel(state) {
  if (!state.toast) return '';
  return `<div style="position:absolute;bottom:calc(88px + var(--agp-safe-bottom));left:16px;right:16px;background:linear-gradient(135deg,#1C3A4A,#0B2130);border:1px solid rgba(200,162,74,0.3);border-radius:12px;padding:14px 18px;z-index:50;display:flex;align-items:center;gap:10px;box-shadow: 0 8px 24px rgba(0,0,0,0.4);pointer-events:none">
    <div style="width:20px;height:20px;flex:none;border-radius:50%;background:linear-gradient(135deg,#C8A24A,#A97C25);display:flex;align-items:center;justify-content:center">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#061522" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span style="font-size:0.8rem;color:#F6F1E8;font-weight:500">${esc(state.toast)}</span>
  </div>`;
}
function renderRssSheetPanel(state) {
  if (!state.rssSheet) return '';
  return `
    <div id="rss-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:45"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;background:#0B2130;border-radius:24px 24px 0 0;border-top:1px solid rgba(200,162,74,0.22);z-index:46;padding:0 22px calc(36px + var(--agp-safe-bottom))">
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
function renderDescriptionSheetPanel(state) {
  if (!state.descriptionSheet) return '';
  const ep = state.current || {
    title: 'No Track Selected',
    show: 'AGAPAY Listen',
    description: 'Select an episode from your library or discover feed to begin listening.',
  };
  const infoText = ep.description ? ep.description : 'No summary metadata listed for this episode channel.';
  return `
    <div id="desc-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:45"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;max-height:65%;background:#0B2130;border-radius:24px 24px 0 0;border-top:1px solid rgba(200,162,74,0.22);z-index:46;padding:0 24px calc(40px + var(--agp-safe-bottom));display:flex;flex-direction:column">
      <div style="display:flex;justify-content:center;padding:14px 0 12px;flex-shrink:0"><div style="width:40px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px"></div></div>
      <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:500;color:#F6F1E8;margin-bottom:4px;flex-shrink:0;letter-spacing:0.01em">${esc(ep.title)}</div>
      <div style="font-size:0.65rem;color:${GOLD};font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:16px;flex-shrink:0">${esc(ep.show)}</div>
      <div style="overflow-y:auto;flex-grow:1;font-size:0.85rem;color:#F6F1E8;line-height:1.6;padding-right:4px;font-weight:400;overscroll-behavior:contain">
        ${esc(infoText)}
      </div>
      <button id="desc-close-btn" style="width:100%;margin-top:20px;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#F6F1E8;font-size:0.85rem;cursor:pointer;flex-shrink:0">Dismiss</button>
    </div>`;
}
function renderProfilePanel(state) {
  return `<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-top:calc(12px + var(--agp-safe-top));padding-bottom:calc(94px + var(--agp-safe-bottom));background:${NIGHT};box-sizing:border-box">
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
        ['0h', 'Listened'],
      ]
        .map(
          ([v, l], i) => `
        <div style="flex:1;padding:14px 10px;text-align:center;${i < 2 ? 'border-right:1px solid rgba(255,255,255,0.04)' : ''}">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45rem;font-weight:500;color:${GOLD}">${v}</div>
          <div style="font-size:0.58rem;color:${MUTED};margin-top:2px;font-weight:500;letter-spacing:0.02em">${l}</div>
        </div>`
        )
        .join('')}
    </div>

    <div style="padding:0 20px;margin-bottom:16px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:4px">Library Transfer</div>
      <div style="display:flex;gap:10px">
        ${[
          [
            'import-opml',
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            'Import',
            'OPML',
          ],
          [
            'export-opml',
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
            'Export',
            'OPML',
          ],
          [
            'sync-pcasts',
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8A24A" stroke-width="2.2" stroke-linecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
            'Sync',
            'Pocket Casts',
          ],
        ]
          .map(
            ([id, svg, label, sub]) => `
          <div ${id ? `id="${id}"` : ''} class="tappable action-card" style="flex:1;padding:16px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow: 0 4px 12px rgba(0,0,0,0.1);transition: all 0.2s">
            <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,rgba(200,162,74,0.14),rgba(200,162,74,0.04));border:1px solid rgba(200,162,74,0.2);display:flex;align-items:center;justify-content:center">${svg}</div>
            <div style="text-align:center">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.9rem;font-weight:500;color:#F6F1E8;line-height:1.2">${label}</div>
              <div style="font-size:0.56rem;color:${MUTED};margin-top:2px;font-weight:500">${sub}</div>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>

    <div style="padding:0 20px;margin-bottom:24px">
      <div style="font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-bottom:12px;padding-left:4px">Preferences</div>
      <div style="background:rgba(255,255,255,0.01);border-radius:16px;border:1px solid rgba(255,255,255,0.04);overflow:hidden;box-shadow: 0 4px 16px rgba(0,0,0,0.15)">
        ${[
          ['Liturgical Calendar Alerts', true],
          ['Auto-download on Wi-Fi', false],
        ]
          .map(
            ([l, on]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:0.85rem;color:#F6F1E8;font-weight:500">${l}</span>
            <div style="width:34px;height:18px;border-radius:10px;background:${on ? GOLD : 'rgba(255,255,255,0.08)'};position:relative;transition: background 0.2s">
              <div style="position:absolute;${on ? 'right' : 'left'}:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow: 0 1px 4px rgba(0,0,0,0.3)"></div>
            </div>
          </div>`
          )
          .join('')}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px">
          <span style="font-size:0.85rem;color:#F6F1E8;font-weight:500">Playback Speed</span>
          <span style="font-size:0.8rem;color:${GOLD};font-weight:700;font-family:monospace">1.0×</span>
        </div>
      </div>
    </div>
  </div>`;
}
function renderBottomNavPanel(state) {
  const s = state.screen;
  const tab = (id, label, iconFn) => {
    const active = s === id;
    const c = active ? GOLD : STONE;
    return `<div class="tappable" data-nav="${id}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 10px;flex:1">
      ${iconFn(c)}
      <span style="font-size:9px;color:${c};font-weight:${active ? '600' : '500'};letter-spacing:0.04em">${label}</span>
    </div>`;
  };
  return `<div style="position:absolute;bottom:0;left:0;right:0;min-height:calc(76px + var(--agp-safe-bottom));height:auto;background:rgba(6,21,34,0.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid rgba(200,162,74,0.10);display:flex;align-items:flex-start;justify-content:space-around;padding-top:12px;padding-bottom:var(--agp-safe-bottom);box-sizing:border-box;z-index:30;box-shadow:0 12px 0 #061522">
    ${tab('home', 'Home', I.home)}
    ${tab('discover', 'Discover', I.disc)}
    ${tab('library', 'Library', I.lib)}
    ${tab('profile', 'Profile', I.person)}
  </div>`;
}
export { renderBottomNavPanel, renderDescriptionSheetPanel, renderProfilePanel, renderRssSheetPanel, renderToastPanel };
