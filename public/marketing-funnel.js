(function () {
  // Carry the homepage entry point into the existing demo/registration records.
  // No cookies, visitor IDs, new tracking vendor, or form values are collected.
  const params = new URLSearchParams(window.location.search);
  const homepage = ['/', '/index.html'].includes(window.location.pathname);
  const destinations = new Set(['/give', '/give/', '/give/request-demo', '/register']);
  const referralKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'agapay_entry', 'agapay_cta'];

  function decorate(anchor) {
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin || !destinations.has(target.pathname)) return;
    for (const key of referralKeys) {
      const value = params.get(key);
      if (value && !target.searchParams.has(key)) target.searchParams.set(key, value.replace(/[\r\n]/g, ' ').slice(0, 120));
    }
    if (homepage) {
      target.searchParams.set('agapay_entry', 'homepage');
      const area = anchor.closest('header, .mobile-drawer') ? 'navigation' : anchor.closest('footer') ? 'footer' : 'content';
      target.searchParams.set('agapay_cta', anchor.dataset.funnelCta || area);
    }
    anchor.href = `${target.pathname}${target.search}${target.hash}`;
  }

  document.querySelectorAll('a[href]').forEach(decorate);
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    decorate(anchor);
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin || !destinations.has(target.pathname)) return;
    document.dispatchEvent(new CustomEvent('agapay:funnel-click', { detail: {
      page: window.location.pathname,
      destination: target.pathname + target.hash,
      entry: target.searchParams.get('agapay_entry') || '',
      cta: target.searchParams.get('agapay_cta') || ''
    } }));
  });
})();
