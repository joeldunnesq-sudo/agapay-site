(function () {
  'use strict';

  const existing = window.AGAPAYGivingBox;
  if (existing?.scan) {
    existing.scan();
    return;
  }

  const loaderScript = document.currentScript;
  const loaderOrigin = new URL(loaderScript?.src || 'https://agapay.app/giving-box.js', window.location.href).origin;
  const mountedFrames = new Map();
  const selector = '[data-agapay-giving]';

  function clean(value) {
    return String(value || '').trim();
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function givingUrl(container) {
    const organizationId = clean(container.dataset.agapayGiving || container.dataset.organization);
    if (!organizationId) return null;
    const url = new URL(`/give/embed/${encodeURIComponent(organizationId)}`, loaderOrigin);
    const amount = boundedNumber(container.dataset.amount, 0, 0, 50000);
    const frequency = clean(container.dataset.frequency).toLowerCase();
    const preview = clean(container.dataset.preview);
    if (amount >= 1) url.searchParams.set('amount', String(amount));
    if (['once', 'monthly', 'quarterly', 'yearly'].includes(frequency)) {
      url.searchParams.set('frequency', frequency);
    }
    if (preview && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      url.searchParams.set('preview', preview);
    }
    return url;
  }

  function mount(container) {
    if (!(container instanceof HTMLElement) || container.dataset.agapayMounted === 'true') return null;
    const url = givingUrl(container);
    if (!url) return null;

    const maxWidth = boundedNumber(container.dataset.maxWidth, 560, 280, 1200);
    const initialHeight = boundedNumber(container.dataset.height, 560, 420, 1800);
    const align = clean(container.dataset.align).toLowerCase();
    const frame = document.createElement('iframe');
    frame.src = url.href;
    frame.title = clean(container.dataset.title) || 'Give securely with AGAPAY';
    frame.width = '100%';
    frame.height = String(initialHeight);
    frame.loading = clean(container.dataset.loading) === 'eager' ? 'eager' : 'lazy';
    frame.allow = 'payment';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.display = 'block';
    frame.style.width = '100%';
    frame.style.height = `${initialHeight}px`;
    frame.style.border = '0';
    frame.style.borderRadius = '18px';
    frame.style.background = 'transparent';
    frame.style.transition = 'height 180ms ease';

    container.dataset.agapayMounted = 'true';
    container.style.width = '100%';
    container.style.maxWidth = `${maxWidth}px`;
    container.style.marginInline = align === 'left' ? '0 auto' : align === 'right' ? 'auto 0' : 'auto';
    container.replaceChildren(frame);
    mountedFrames.set(frame, { container, origin: url.origin });
    container.dispatchEvent(new CustomEvent('agapay:mounted', { detail: { frame, organizationId: container.dataset.agapayGiving } }));
    return frame;
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches(selector)) mount(root);
    root.querySelectorAll?.(selector).forEach(mount);
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'agapay:giving-box-resize') return;
    for (const [frame, record] of mountedFrames) {
      if (event.source !== frame.contentWindow || event.origin !== record.origin) continue;
      const height = boundedNumber(event.data.height, 560, 420, 1800);
      frame.height = String(height);
      frame.style.height = `${height}px`;
      record.container.dispatchEvent(new CustomEvent('agapay:resize', { detail: { height } }));
      break;
    }
  });

  const api = Object.freeze({ version: '1.3.0', mount, scan });
  window.AGAPAYGivingBox = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  } else {
    scan();
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node instanceof HTMLElement) scan(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
