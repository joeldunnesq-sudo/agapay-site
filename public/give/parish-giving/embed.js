(function () {
  'use strict';
  if (!/^\/give\/campaign-embed\/[^/]+\/[^/]+\/?$/.test(location.pathname)) return;
  const params = new URLSearchParams(location.search);
  let shareUrl = '';
  try {
    const url = new URL(params.get('page'));
    if (url.protocol === 'https:' && !url.username && !url.password) {
      url.search = ''; url.hash = ''; shareUrl = url.href;
    }
  } catch { /* A preview without a parish URL uses the public campaign link. */ }
  window.AGAPAYCampaignEmbed = Object.freeze({ shareUrl });
  document.documentElement.classList.add('campaign-embedded');
  const root = document.documentElement.style;
  function contrast(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#000000' : '#ffffff';
  }
  for (const key of ['primary', 'accent', 'background']) {
    const color = params.get(key);
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) continue;
    root.setProperty('--embed-' + key, color);
    root.setProperty('--embed-' + key + '-text', contrast(color));
  }
  if (params.get('font') === 'sans') root.setProperty('--campaign-serif', '"Mulish", system-ui, sans-serif');
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('campaignCanonicalUrl')?.remove();
    const banner = document.createElement('div');
    banner.className = 'agapay-campaign-brand';
    banner.innerHTML = '<a href="https://agapay.app/give" target="_blank" rel="noopener"><img src="/mark.png" alt=""><span><strong>AGAPAY</strong><small>Parish campaigns &amp; secure giving</small></span></a><span>Powered by AGAPAY</span>';
    document.body.prepend(banner);
    const note = document.createElement('p'); note.className = 'agapay-campaign-checkout-brand';
    note.textContent = 'Powered by AGAPAY · Secure Stripe checkout opens in a new tab. Your parish page stays open.';
    document.getElementById('campaignCheckoutForm')?.prepend(note);
    let lastHeight = 0;
    const notify = () => requestAnimationFrame(() => {
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height === lastHeight || parent === window) return;
      lastHeight = height;
      parent.postMessage({ type: 'agapay:campaign-resize', height }, '*');
    });
    new ResizeObserver(notify).observe(document.body);
    notify();
  });
})();
