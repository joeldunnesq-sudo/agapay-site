(function () {
  'use strict';
  if (window.AGAPAYCampaignBox) { window.AGAPAYCampaignBox.scan(); return; }
  const origin = new URL(document.currentScript?.src || 'https://agapay.app/campaign-box.js').origin;
  const frames = new Map();
  const mounted = new WeakMap();
  function mount(container) {
    if (!container.dataset.parish || !container.dataset.agapayCampaign) return;
    const url = new URL('/give/campaign-embed/' + encodeURIComponent(container.dataset.parish) + '/' + encodeURIComponent(container.dataset.agapayCampaign), origin);
    for (const key of ['primary', 'accent', 'background', 'font']) {
      if (container.dataset[key]) url.searchParams.set(key, container.dataset[key]);
    }
    // Share the actual parish page, without query parameters or fragments.
    let page = new URL(window.location.href); page.search = ''; page.hash = '';
    try { const configured = new URL(container.dataset.page); if (configured.protocol === 'https:' && configured.origin === page.origin && !configured.username && !configured.password) page = configured; } catch { /* Use the current published page. */ }
    page.search = ''; page.hash = '';
    if (page.protocol === 'https:' || page.hostname === 'localhost' || page.hostname === '127.0.0.1') url.searchParams.set('page', page.href);
    if (mounted.get(container) === url.href && container.querySelector('iframe')) return;
    const frame = container.querySelector(':scope > iframe') || document.createElement('iframe');
    frame.src = url.href; frame.title = container.dataset.title || 'Parish campaign powered by AGAPAY';
    frame.loading = 'lazy'; frame.allow = 'payment'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'display:block;width:100%;height:1100px;border:0;border-radius:12px;';
    container.dataset.agapayMounted = 'true'; container.style.cssText += ';width:100%;max-width:1140px;margin-inline:auto;';
    container.replaceChildren(frame); frames.set(frame, container);
    mounted.set(container, url.href);
  }
  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('[data-agapay-campaign]')) mount(root);
    root.querySelectorAll?.('[data-agapay-campaign]').forEach(mount);
  }
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.data?.type !== 'agapay:campaign-resize') return;
    const height = Number(event.data.height);
    if (!Number.isFinite(height)) return;
    for (const [frame] of frames) {
      if (!frame.isConnected) { frames.delete(frame); continue; }
      if (event.source === frame.contentWindow) frame.style.height = Math.min(20000, Math.max(500, Math.ceil(height))) + 'px';
    }
  });
  window.AGAPAYCampaignBox = Object.freeze({ scan });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  else scan();
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') mount(record.target);
    else record.addedNodes.forEach(node => { if (node instanceof HTMLElement) scan(node); });
  })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-parish', 'data-agapay-campaign', 'data-primary', 'data-accent', 'data-background', 'data-font', 'data-page'] });
})();
