import { shellProducts } from './myagapay/shell-products.js';
import { icons } from './myagapay/shell-icons.js';
(function () {
  'use strict';

  // Protected My AGAPAY documents opt into an atomic first paint with the
  // data-myagapay-hydrate attribute on <html>. The shell is loaded
  // synchronously there so this tracker exists before page-level inline code.
  const pageHydration = {
    active: document.documentElement.hasAttribute('data-myagapay-hydrate'),
    domReady: false,
    pendingEntitlementRequests: 0,
    settleTimer: 0,
    revealFrame: 0,
  };
  const nativeFetch = window.fetch.bind(window);

  function isEntitlementHydrationRequest(input: RequestInfo | URL) {
    try {
      const raw = typeof input === 'string' ? input : (input as Request | undefined)?.url;
      const url = new URL(raw || '', window.location.href);
      return url.origin === window.location.origin && url.pathname === '/api/donor/dashboard';
    } catch {
      return false;
    }
  }

  function finishMyAgapayPageHydration() {
    if (!pageHydration.active) return;
    pageHydration.active = false;
    if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
    if (pageHydration.revealFrame) window.cancelAnimationFrame?.(pageHydration.revealFrame);
    window.fetch = nativeFetch;
    document.documentElement.dataset.myagapayPageReady = 'true';
    document.body?.removeAttribute('aria-busy');
    finishInternalNavigationProgress();
    window.dispatchEvent(new CustomEvent('myagapay:page-ready'));
  }

  function scheduleMyAgapayPageHydrationFinish() {
    if (!pageHydration.active || !pageHydration.domReady || pageHydration.pendingEntitlementRequests > 0) return;
    if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
    // The entitlement response controls which gates and products are visible.
    // Give its synchronous render a brief quiet window, then reveal across two
    // frames. Unrelated feed, count, and page-data requests continue behind the
    // initialized shell and never hold the full-screen shield.
    pageHydration.settleTimer = window.setTimeout(() => {
      if (pageHydration.pendingEntitlementRequests > 0) return;
      const reveal = () => {
        pageHydration.revealFrame = window.requestAnimationFrame
          ? window.requestAnimationFrame(finishMyAgapayPageHydration)
          : 0;
        if (!window.requestAnimationFrame) finishMyAgapayPageHydration();
      };
      pageHydration.revealFrame = window.requestAnimationFrame ? window.requestAnimationFrame(reveal) : 0;
      if (!window.requestAnimationFrame) reveal();
    }, 80);
  }

  if (pageHydration.active) {
    document.documentElement.dataset.myagapayPageReady = 'false';
    window.fetch = async (...args) => {
      const tracked = pageHydration.active && isEntitlementHydrationRequest(args[0]);
      if (tracked) {
        if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
        pageHydration.pendingEntitlementRequests += 1;
      }
      try {
        return await nativeFetch(...args);
      } finally {
        if (tracked) {
          pageHydration.pendingEntitlementRequests = Math.max(0, pageHydration.pendingEntitlementRequests - 1);
          scheduleMyAgapayPageHydrationFinish();
        }
      }
    };
  }

  // UX cache only: capabilities make navigation consistent across pages. They
  // must never be used as an authorization or content-access decision;
  // the Worker remains the security boundary.
  const storageKeys = window.AGAPAYDonorSession.storageKeys;
  const PARISH_CAPABILITIES_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const NAVIGATION_TRANSITION_MAX_AGE_MS = 15 * 1000;

  function parishLifeExperience(source: ShellParishCapabilities | null = parishCapabilities) {
    const resolved = source !== parishCapabilities || capabilitiesLoaded;
    const communicationsEnabled = Boolean(source?.communicationsEnabled);
    return {
      communicationsEnabled,
      label: resolved ? String(source?.parishLifeLabel || (communicationsEnabled ? 'Koinonia' : 'Today')) : 'Loading…',
      short: resolved
        ? communicationsEnabled
          ? 'Parish news and ministries'
          : 'Feast day and services'
        : 'Loading parish features',
    };
  }

  function products() {
    return shellProducts(parishLifeExperience());
  }

  let parishCapabilities: ShellParishCapabilities = {
    sacramentsEnabled: false,
    libraryEnabled: false,
    directoryEnabled: false,
    bookstoreEnabled: false,
    communicationsEnabled: false,
    signupsEnabled: false,
    exchangeEnabled: false,
    prayerRequestsEnabled: false,
    parishLifeAvailable: false,
  };
  let capabilitiesLoaded = false;

  let feedUnreadCount = 0;
  let groupsUnreadCount = 0;
  let teachingUnreadCount = 0;

  function visibleProducts() {
    return products().filter((item) => {
      if (item.desktopHidden) return false;
      return !item.parishFeature || parishCapabilities[item.parishFeature] === true || item.id === activeProduct();
    });
  }

  function mobileProducts() {
    const byId = new Map(products().map((item) => [item.id, item]));
    const active = activeProduct();
    const featureOrFallback = (featureId: string, fallbackId: string) => {
      const feature = byId.get(featureId);
      return parishCapabilities[feature?.parishFeature as keyof ShellParishCapabilities] === true ||
        active === featureId
        ? feature
        : byId.get(fallbackId);
    };
    const libraryOrHistory = featureOrFallback('library', 'history');
    return [
      byId.get('giving'),
      featureOrFallback('bookstore', 'settings'),
      byId.get('parish-life'),
      libraryOrHistory,
      byId.get('commemorations'),
    ].filter(Boolean) as ShellProduct[];
  }

  function hamburgerProducts() {
    // The hamburger shows every enabled product, independent of the five-slot
    // bottom bar. This keeps Library reachable when Sacraments owns its slot.
    return visibleProducts();
  }

  function activeProduct(pathname = window.location.pathname) {
    if (pathname.startsWith('/myagapay/learn')) return 'learn';
    if (pathname === '/myagapay' || pathname === '/myagapay/' || pathname === '/myagapay/dashboard') return 'giving';
    if (pathname.startsWith('/myagapay/bookstore')) return 'bookstore';
    if (
      pathname.startsWith('/myagapay/parish-life') ||
      pathname.startsWith('/myagapay/feed') ||
      pathname.startsWith('/myagapay/news') ||
      pathname.startsWith('/myagapay/groups') ||
      pathname.startsWith('/myagapay/signups') ||
      pathname.startsWith('/myagapay/exchange') ||
      pathname.startsWith('/myagapay/prayer-requests') ||
      pathname.startsWith('/myagapay/teaching') ||
      pathname.startsWith('/myagapay/media') ||
      pathname.startsWith('/myagapay/calendar')
    )
      return 'parish-life';
    if (
      pathname.startsWith('/myagapay/sacraments') ||
      pathname.startsWith('/myagapay/giving/commemorations') ||
      pathname.startsWith('/myagapay/giving/names')
    )
      return 'commemorations';
    if (pathname.startsWith('/myagapay/library')) return 'library';
    if (pathname.startsWith('/myagapay/directory')) return 'directory';
    if (pathname.startsWith('/myagapay/giving/history') || pathname.startsWith('/myagapay/giving/offerings'))
      return 'history';
    if (pathname.startsWith('/myagapay/giving')) return 'giving';
    if (pathname.startsWith('/myagapay/account')) return 'account';
    if (pathname.startsWith('/marketplace')) return 'market';
    return 'home';
  }

  function ensureParishLifeBackLink(pathname = window.location.pathname) {
    const isSubpage =
      /^\/myagapay\/(?:feed|news|groups|teaching|media(?:\/watch)?|signups|exchange|prayer-requests|calendar)(?:\.html)?\/?$/.test(
        pathname
      );
    if (!isSubpage || document.querySelector<HTMLElement>('[data-parish-life-back]')) return;
    const page = document.querySelector<HTMLElement>('.page');
    if (!page) return;
    const link = document.createElement('a');
    link.className = 'parish-life-back-link koinonia-page-back';
    link.href = '/myagapay/parish-life';
    link.setAttribute('data-parish-life-back', '');
    link.setAttribute('aria-label', 'Back to Koinonia');
    link.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Back to Koinonia</span>';
    page.prepend(link);
  }

  function isAppleTouchDevice() {
    const ua = window.navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function injectBackButtonStyles() {
    if (document.getElementById('myAgapayIosBackStyles')) return;
    const style = document.createElement('style');
    style.id = 'myAgapayIosBackStyles';
    style.textContent = `
      @supports (-webkit-touch-callout: none) {
        @media (max-width: 900px) {
          input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
          textarea,
          select { font-size: 16px !important; }
        }
      }
      .myagapay-settings-chip {
        -webkit-appearance: none;
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: 34px;
        border: 1px solid rgba(201, 162, 91, 0.34);
        border-radius: 999px;
        padding: 0 0.8rem;
        background: rgba(255, 252, 246, 0.12);
        color: currentColor;
        font: 800 0.78rem/1 "DM Sans", system-ui, sans-serif;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
      }
      .myagapay-settings-chip svg {
        width: 0.95rem;
        height: 0.95rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .myagapay-menu-trigger {
        -webkit-appearance: none;
        appearance: none;
        display: inline-grid;
        width: 46px;
        min-width: 46px;
        height: 46px;
        min-height: 46px;
        place-items: center;
        border: 1px solid rgba(201, 162, 91, 0.52);
        border-radius: 12px;
        padding: 0;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(6, 21, 34, 0.12);
      }
      .myagapay-menu-icon {
        display: grid;
        width: 21px;
        gap: 4px;
      }
      .myagapay-menu-icon > span {
        display: block;
        width: 100%;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
      }
      .donor-mobile-page .topbar {
        border-bottom-color: rgba(201, 162, 91, 0.38);
        background: var(--myagapay-nav-background,
          radial-gradient(circle at 84% 0%, rgba(201, 162, 91, 0.2), transparent 22rem),
          linear-gradient(135deg, #061522 0%, #0a2035 62%, #101d22 100%));
        box-shadow: 0 10px 28px rgba(6, 21, 34, 0.16);
        color: #fffdf8;
      }
      .donor-mobile-page .topbar-title {
        color: #fffdf8;
      }
      .donor-mobile-page .topbar .myagapay-menu-trigger,
      .donor-mobile-page .topbar .myagapay-settings-chip {
        border-color: rgba(201, 162, 91, 0.42);
        background: rgba(255, 255, 255, 0.08);
        color: #fffdf8;
      }
      .donor-mobile-page .topbar .status-pill {
        border-color: rgba(201, 162, 91, 0.34);
        background: rgba(255, 255, 255, 0.08);
        color: #fffdf8;
      }
      @media (max-width: 900px) {
        .donor-mobile-page .topbar {
          position: sticky;
          top: 0;
          z-index: 80;
          display: flex;
          width: 100%;
          min-height: 58px;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 0.65rem;
          border-bottom: 1px solid rgba(201, 162, 91, 0.38);
          padding: calc(0.42rem + env(safe-area-inset-top)) 0.85rem 0.42rem;
          background: var(--myagapay-nav-background,
            radial-gradient(circle at 84% 0%, rgba(201, 162, 91, 0.2), transparent 22rem),
            linear-gradient(135deg, #061522 0%, #0a2035 62%, #101d22 100%));
          box-shadow: 0 10px 28px rgba(6, 21, 34, 0.16);
          backdrop-filter: blur(16px);
        }
        .donor-mobile-page .topbar-title {
          min-width: 0;
          overflow: hidden;
          font-size: 1.15rem;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .donor-mobile-page .topbar-actions {
          margin-left: auto;
          flex: 0 0 auto;
          flex-direction: row;
          flex-wrap: nowrap;
        }
        .donor-mobile-page .myagapay-menu-trigger {
          width: 42px;
          min-width: 42px;
          height: 42px;
          min-height: 42px;
          border-radius: 11px;
          box-shadow: none;
        }
      }
      .myagapay-support-dialog {
        width: min(560px, calc(100% - 28px));
        max-height: min(760px, calc(100dvh - 28px));
        border: 0;
        border-radius: 18px;
        padding: 0;
        background: #fffdf8;
        color: #182028;
        box-shadow: 0 26px 80px rgba(6, 21, 34, 0.34);
      }
      .myagapay-support-dialog::backdrop { background: rgba(6, 21, 34, 0.62); backdrop-filter: blur(3px); }
      .myagapay-support-form { display: grid; gap: 15px; padding: 24px; font-family: "DM Sans", system-ui, sans-serif; }
      .myagapay-support-head { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
      .myagapay-support-kicker { color: #8a651f; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.11em; text-transform: uppercase; }
      .myagapay-support-head h2 { margin: 4px 0 5px; color: #061522; font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.75rem; line-height: 1.05; }
      .myagapay-support-head p { margin: 0; color: #657081; font-size: 0.82rem; line-height: 1.5; }
      .myagapay-support-close { border: 1px solid #ded8cb; border-radius: 999px; padding: 8px 12px; background: #fff; color: #52606c; font: 800 0.75rem/1 "DM Sans", system-ui, sans-serif; cursor: pointer; }
      .myagapay-support-form label { display: grid; gap: 6px; color: #243746; font-size: 0.8rem; font-weight: 800; }
      .myagapay-support-form input, .myagapay-support-form select, .myagapay-support-form textarea { width: 100%; border: 1px solid #d8d4ca; border-radius: 10px; padding: 11px 12px; background: #fff; color: #182028; font: 500 1rem/1.4 "DM Sans", system-ui, sans-serif; }
      .myagapay-support-form textarea { min-height: 145px; resize: vertical; }
      .myagapay-support-status { min-height: 1.3em; margin: 0; color: #657081; font-size: 0.8rem; line-height: 1.4; }
      .myagapay-support-status.is-error { color: #8b2f26; }
      .myagapay-support-status.is-success { color: #23613d; font-weight: 800; }
      .myagapay-support-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .myagapay-support-actions button { min-height: 42px; border-radius: 9px; padding: 0 16px; font: 800 0.8rem/1 "DM Sans", system-ui, sans-serif; cursor: pointer; }
      .myagapay-support-cancel { border: 1px solid #d8d4ca; background: #fff; color: #52606c; }
      .myagapay-support-send { border: 1px solid #b88a3d; background: linear-gradient(155deg, #d8b66a, #c8a24a); color: #241a04; }
      .myagapay-support-send:disabled { cursor: wait; opacity: 0.62; }
    `;
    document.head.appendChild(style);
  }

  // The dashboard home pages (myagapay/index.html, donor/index.html) have a
  // rich, hardcoded account dropdown (History / Account Settings / Log out).
  // Every other My AGAPAY page previously only
  // got a bare "Account" link here, so the canonical menu visibly changed
  // depending on which page you landed on (e.g. clicking a Quick Give tile
  // from the dashboard home). Inject the SAME dropdown -- same markup,
  // ids, and data-attributes the existing event delegation in donor/app.js
  // already handles (data-donor-account-menu/-toggle/-logout, #donorHomeTopbarName,
  // .donor-home-account-dropdown) -- on primary product destinations too,
  // with a trigger styled for the light .topbar background instead of the
  // dark home hero. Koinonia spokes intentionally retain their local header.
  function isMyAgapayMainPage(pathname = window.location.pathname) {
    const normalized = pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/myagapay';
    return new Set([
      '/myagapay',
      '/myagapay/index',
      '/myagapay/dashboard',
      '/myagapay/giving/give',
      '/myagapay/parish-life',
      '/myagapay/sacraments',
      '/myagapay/directory',
      '/myagapay/bookstore',
    ]).has(normalized);
  }

  function ensureCanonicalHeader() {
    if (!document.body.classList.contains('donor-mobile-page')) return;
    if (!isMyAgapayMainPage()) return;
    document.body.classList.add('myagapay-main-page');
    if (
      document.querySelector<HTMLElement>('.donor-home-account-menu') ||
      document.querySelector<HTMLElement>('.learn-account-utility')
    )
      return;
    const content = document.querySelector<HTMLElement>('.content, main');
    if (!content) return;
    let topbar = content.querySelector<HTMLElement>('.topbar');
    if (!topbar) {
      topbar = document.createElement('div');
      topbar.className = 'topbar';
      const title = document.createElement('div');
      title.className = 'topbar-title';
      const active = products().find((item) => item.id === activeProduct());
      title.textContent = active?.label || 'My AGAPAY';
      topbar.appendChild(title);
      content.prepend(topbar);
    }
    let actions = topbar.querySelector<HTMLElement>('.topbar-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      topbar.appendChild(actions);
    }
    if (
      actions.querySelector<HTMLElement>('[data-donor-account-menu]') ||
      actions.querySelector<HTMLElement>('.myagapay-settings-chip')
    )
      return;

    const menu = document.createElement('div');
    menu.className = 'donor-home-account-menu';
    menu.setAttribute('data-donor-account-menu', '');
    menu.setAttribute('data-auth-required', '');
    menu.hidden = true;
    menu.innerHTML = `
      <button class="myagapay-settings-chip myagapay-menu-trigger" type="button" data-donor-account-toggle aria-haspopup="true" aria-expanded="false" aria-label="Open My AGAPAY menu">
        ${icons.menu}
      </button>
      <div class="donor-home-account-dropdown" role="menu" hidden>
        <a href="/myagapay/giving/history" role="menuitem">History</a>
        <a href="/myagapay/account" role="menuitem">Account Settings</a>
        <button type="button" data-donor-logout role="menuitem">Log out</button>
      </div>`;
    actions.appendChild(menu);

    const guestLink = document.createElement('a');
    guestLink.className = 'myagapay-settings-chip';
    guestLink.href = '/myagapay/login';
    guestLink.setAttribute('data-auth-guest', '');
    guestLink.textContent = 'Login';
    actions.appendChild(guestLink);
  }

  function closeAccountMenus() {
    document
      .querySelectorAll<HTMLElement>('[data-donor-account-toggle], [data-learn-account-toggle]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll<HTMLElement>('.donor-home-account-dropdown, .learn-account-dropdown').forEach((panel) => {
      panel.hidden = true;
    });
  }

  function openSupportDialog() {
    closeAccountMenus();
    const dialog = document.getElementById('myAgapaySupportDialog') as HTMLDialogElement | null;
    if (!dialog) return;
    const status = dialog.querySelector<HTMLElement>('[data-myagapay-support-status]');
    if (status) {
      status.textContent = '';
      status.className = 'myagapay-support-status';
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('select')?.focus();
  }

  function closeSupportDialog() {
    const dialog = document.getElementById('myAgapaySupportDialog') as HTMLDialogElement | null;
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
  }

  async function submitSupportRequest(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const status = form.querySelector<HTMLElement>('[data-myagapay-support-status]')!;
    const button = form.querySelector<HTMLButtonElement>('[data-myagapay-support-send]')!;
    const fields = Object.fromEntries(new FormData(form));
    const message = String(fields.message || '').trim();
    if (message.length < 8) {
      status.textContent = 'Please include a little more detail so we can help.';
      status.className = 'myagapay-support-status is-error';
      return;
    }
    button.disabled = true;
    status.textContent = 'Sending your request…';
    status.className = 'myagapay-support-status';
    try {
      const response = await fetch('/api/donor/support-tickets', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          message,
          page: activeProduct(),
          path: `${window.location.pathname}${window.location.search}`,
        }),
      });
      if (handleUnauthorized(response)) return;
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send your request.');
      status.textContent =
        fields.type === 'feature'
          ? 'Your feature request was sent. Thank you for helping improve AGAPAY.'
          : 'Your report was sent to the AGAPAY team.';
      status.className = 'myagapay-support-status is-success';
      form.reset();
      window.setTimeout(closeSupportDialog, 1200);
    } catch (error) {
      status.textContent = (error as Error).message || 'Unable to send your request.';
      status.className = 'myagapay-support-status is-error';
    } finally {
      button.disabled = false;
    }
  }

  function ensureSupportFeedback() {
    injectBackButtonStyles();
    document
      .querySelectorAll<HTMLElement>('.donor-home-account-dropdown, .learn-account-dropdown')
      .forEach((dropdown) => {
        if (dropdown.querySelector<HTMLElement>('[data-myagapay-support-open]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.setAttribute('data-myagapay-support-open', '');
        button.textContent = 'Report a problem / Request a feature';
        button.addEventListener('click', openSupportDialog);
        const logout = dropdown.querySelector<HTMLElement>('[data-donor-logout], [data-learn-logout]');
        dropdown.insertBefore(button, logout || null);
      });
    if (document.getElementById('myAgapaySupportDialog') as HTMLDialogElement | null) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'myAgapaySupportDialog';
    dialog.className = 'myagapay-support-dialog';
    dialog.setAttribute('aria-labelledby', 'myAgapaySupportTitle');
    dialog.innerHTML = `
      <form class="myagapay-support-form">
        <div class="myagapay-support-head"><div><div class="myagapay-support-kicker">AGAPAY Support</div><h2 id="myAgapaySupportTitle">Help us improve My AGAPAY</h2><p>Report something that is not working or tell us what would make the app better.</p></div><button class="myagapay-support-close" type="button" data-myagapay-support-close aria-label="Close support form">Close</button></div>
        <label>What would you like to do?<select name="type"><option value="issue">Report a problem</option><option value="feature">Request a feature</option><option value="help">Get help using My AGAPAY</option><option value="question">Ask a question</option></select></label>
        <label>Subject<input name="subject" maxlength="160" required placeholder="Briefly describe your request" /></label>
        <label>Details<textarea name="message" maxlength="2400" required placeholder="Tell us what happened, what you expected, or how the feature would help."></textarea></label>
        <p class="myagapay-support-status" data-myagapay-support-status role="status" aria-live="polite"></p>
        <div class="myagapay-support-actions"><button class="myagapay-support-cancel" type="button" data-myagapay-support-close>Cancel</button><button class="myagapay-support-send" type="submit" data-myagapay-support-send>Send to AGAPAY</button></div>
      </form>`;
    dialog.querySelector<HTMLElement>('form')!.addEventListener('submit', submitSupportRequest);
    dialog
      .querySelectorAll<HTMLElement>('[data-myagapay-support-close]')
      .forEach((button) => button.addEventListener('click', closeSupportDialog));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeSupportDialog();
    });
    document.body.appendChild(dialog);
  }

  function productNav(active = activeProduct(), className = 'my-agapay-tabbar') {
    const isLearnNav = className === 'learn-product-tabbar';
    const isDesktopSideNav = className.includes('unified-product-nav');
    // Every bottom tabbar variant is a fixed 5-column grid -- drop
    // mobileTabHidden items there so a 6th product
    // never wraps onto an ugly second row. The full list still appears in
    // the desktop sidebar, which has room.
    const navProducts = isDesktopSideNav ? visibleProducts() : mobileProducts();
    const navAttrs = isDesktopSideNav
      ? ' hx-boost="false"'
      : ` style="grid-template-columns:repeat(${Math.max(navProducts.length, 1)},minmax(0,1fr))"`;
    const productLinks = navProducts
      .map((item) => {
        const current = item.id === active || (item.id === 'settings' && active === 'account');
        const activeClass = current ? (isLearnNav ? 'is-active' : 'active') : '';
        if (item.deferUntilCapabilitiesLoaded && !capabilitiesLoaded) {
          const loadingLabel = isDesktopSideNav
            ? `<span><strong>Loading…</strong><small>Loading parish features</small></span>`
            : '<span>Loading…</span>';
          return `<span class="sw-tool-loading myagapay-nav-loading" data-parish-life-loading aria-busy="true">${item.icon}${loadingLabel}</span>`;
        }
        const unreadCount = item.id === 'parish-life' ? feedUnreadCount + groupsUnreadCount + teachingUnreadCount : 0;
        const badge =
          unreadCount > 0
            ? `<em class="unified-nav-badge" data-${item.id}-unread-count aria-label="${unreadCount} unread">${unreadCount > 99 ? '99+' : unreadCount}</em>`
            : '';
        const label = isDesktopSideNav
          ? `<span><strong>${item.label}</strong><small>${item.short}</small></span>${badge}`
          : `<span>${item.mobileLabel || item.label}</span>${badge}`;
        return `<a class="${activeClass}" href="${item.href}"${current ? ' aria-current="page"' : ''}>${item.icon}${label}</a>`;
      })
      .join('');
    const accountLink = isDesktopSideNav
      ? `<span class="unified-nav-divider" aria-hidden="true"></span><a class="${active === 'account' ? 'active' : ''}" href="/myagapay/account"${active === 'account' ? ' aria-current="page"' : ''}>${icons.account}<span><strong>Account</strong><small>Profile and settings</small></span></a>`
      : '';
    return `<nav class="${className}" data-myagapay-global-nav aria-label="My AGAPAY navigation"${navAttrs}>${productLinks}${accountLink}</nav>`;
  }

  function normalizeProductNavs(root: Document | HTMLElement = document) {
    const active = activeProduct();
    root
      .querySelectorAll<HTMLElement>(
        '.my-agapay-tabbar:not([data-static-nav]), .mobile-tabbar, .learn-product-tabbar, .unified-product-nav'
      )
      .forEach((nav) => {
        const className = nav.classList.contains('learn-product-tabbar')
          ? 'learn-product-tabbar'
          : nav.classList.contains('unified-product-nav')
            ? 'nav unified-product-nav'
            : 'my-agapay-tabbar';
        const holder = document.createElement('div');
        holder.innerHTML = productNav(active, className);
        nav.replaceWith(holder.firstElementChild!);
      });
  }

  function mobileAppMenuLinks() {
    const active = activeProduct();
    const links = hamburgerProducts()
      .filter((item) => !item.deferUntilCapabilitiesLoaded || capabilitiesLoaded)
      .map((item) => {
        const current = item.id === active;
        return `<a href="${item.href}"${current ? ' aria-current="page"' : ''}>${item.icon}<span>${item.label}</span></a>`;
      })
      .join('');
    const sharedExtras = document.body.classList.contains('app-shared-header-page')
      ? `<a href="/myagapay/giving/calendar">${icons.history}<span>Calendar</span></a><button type="button" data-app-support>Report a problem / Request a feature</button><button type="button" data-app-log-out>Log out</button>`
      : '';
    return `${links}<span class="koinonia-mobile-menu-divider" aria-hidden="true"></span><a href="/myagapay/giving/history">${icons.history}<span>Giving History</span></a><a href="/myagapay/account"${active === 'account' ? ' aria-current="page"' : ''}>${icons.account}<span>Account Settings</span></a>${sharedExtras}`;
  }

  function closeMobileAppMenus(except: HTMLElement | null = null) {
    document.querySelectorAll<HTMLElement>('[data-myagapay-app-menu]').forEach((menu) => {
      if (menu === except) return;
      menu.hidden = true;
      const button = document.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`);
      button?.setAttribute('aria-expanded', 'false');
    });
  }

  function normalizeMobileAppMenus(root: Document | HTMLElement = document) {
    root.querySelectorAll<HTMLElement>('[data-myagapay-app-menu]').forEach((menu) => {
      menu.innerHTML = mobileAppMenuLinks();
    });
  }

  function initializeMobileAppMenus(root: Document | HTMLElement = document) {
    root.querySelectorAll<HTMLElement>('[data-myagapay-app-menu-toggle]').forEach((button, index) => {
      const appbar = button.closest('.koinonia-mobile-appbar, .prayer-mobile-appbar, .library-mobile-appbar');
      if (!appbar) return;
      let menu = appbar.nextElementSibling as HTMLElement | null;
      if (!menu?.matches?.('[data-myagapay-app-menu]')) {
        menu = document.createElement('nav');
        menu.className = 'koinonia-mobile-menu';
        menu.setAttribute('data-myagapay-app-menu', '');
        menu.setAttribute('aria-label', 'My AGAPAY menu');
        menu.hidden = true;
        appbar.insertAdjacentElement('afterend', menu);
      }
      menu.id ||= `myAgapayAppMenu${index + 1}`;
      button.setAttribute('aria-controls', menu.id);
      button.setAttribute('aria-expanded', 'false');
      if (button.dataset.myagapayMenuBound === 'true') return;
      button.dataset.myagapayMenuBound = 'true';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const opening = menu.hidden;
        closeMobileAppMenus(opening ? menu : null);
        menu.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });
    });
    normalizeMobileAppMenus(root);
  }

  function normalizeParishCapabilities(parish: ShellParishCapabilities | null = null) {
    return {
      sacramentsEnabled: Boolean(parish?.sacramentsEnabled),
      libraryEnabled: Boolean(parish?.libraryEnabled),
      directoryEnabled: Boolean(parish?.directoryEnabled),
      bookstoreEnabled: Boolean(parish?.bookstoreEnabled),
      communicationsEnabled: Boolean(parish?.communicationsEnabled),
      signupsEnabled: Boolean(parish?.signupsEnabled),
      exchangeEnabled: Boolean(parish?.exchangeEnabled),
      prayerRequestsEnabled: Boolean(parish?.prayerRequestsEnabled),
      parishLifeLabel: String(parish?.parishLifeLabel || ''),
      parishLifeAvailable: Boolean(parish?.parishLifeAvailable),
    };
  }

  function readCachedParishCapabilities() {
    const current = session();
    if (!current.email || !current.token) return null;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKeys.parishCapabilities) || 'null');
      const cachedAt = Number(cached?.cachedAt || 0);
      if (
        !cached?.parish ||
        cached.email !== current.email ||
        !cachedAt ||
        Date.now() - cachedAt > PARISH_CAPABILITIES_CACHE_MAX_AGE_MS
      ) {
        return null;
      }
      return normalizeParishCapabilities(cached.parish);
    } catch {
      return null;
    }
  }

  function cacheParishCapabilities(parish: ShellParishCapabilities | null) {
    const current = session();
    if (!current.email || !current.token) return;
    try {
      localStorage.setItem(
        storageKeys.parishCapabilities,
        JSON.stringify({
          email: current.email,
          cachedAt: Date.now(),
          parish: normalizeParishCapabilities(parish),
        })
      );
    } catch {
      // Navigation still resolves from the network when storage is unavailable.
    }
  }

  function setParishCapabilities(
    parish: ShellParishCapabilities | null = null,
    { persist = false, authoritative = true }: { persist?: boolean; authoritative?: boolean } = {}
  ) {
    parishCapabilities = normalizeParishCapabilities(parish);
    if (persist) cacheParishCapabilities(parishCapabilities);
    capabilitiesLoaded = true;
    const parishLife = parishLifeExperience(parishCapabilities);
    document.documentElement.dataset.parishCapabilitiesLoaded = 'true';
    document.documentElement.dataset.parishLifeExperience = parishLife.communicationsEnabled ? 'koinonia' : 'today';
    normalizeProductNavs();
    normalizeMobileAppMenus();
    document.querySelectorAll<HTMLElement>('[data-parish-life-link], [data-parish-life-section]').forEach((element) => {
      element.hidden = false;
      element.classList?.remove('sw-tool-loading');
      element.removeAttribute?.('aria-busy');
      element.removeAttribute?.('aria-disabled');
    });
    document.querySelectorAll<HTMLElement>('[data-parish-life-label]').forEach((element) => {
      element.textContent = parishLife.label;
      element.classList?.remove('sw-tool-loading');
    });
    if (authoritative && activeProduct() === 'directory' && !parishCapabilities.directoryEnabled) {
      window.location.replace('/myagapay/dashboard');
      return;
    }
    if (
      authoritative &&
      window.location.pathname.startsWith('/myagapay/signups') &&
      !parishCapabilities.signupsEnabled
    ) {
      window.location.replace('/myagapay/parish-life');
      return;
    }
    if (
      authoritative &&
      window.location.pathname.startsWith('/myagapay/exchange') &&
      !parishCapabilities.exchangeEnabled
    ) {
      window.location.replace('/myagapay/parish-life');
      return;
    }
    if (authoritative && activeProduct() === 'library' && !parishCapabilities.libraryEnabled) {
      window.location.replace('/myagapay/dashboard');
      return;
    }
    if (
      authoritative &&
      window.location.pathname.startsWith('/myagapay/prayer-requests') &&
      !parishCapabilities.prayerRequestsEnabled
    ) {
      window.location.replace('/myagapay/parish-life');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('myagapay:parish-capabilities', {
        detail: { ...parishCapabilities, source: authoritative ? 'network' : 'cache' },
      })
    );
  }

  function deferParishLifeIdentity() {
    if (capabilitiesLoaded) return;
    document.documentElement.dataset.parishCapabilitiesLoaded = 'false';
    document.querySelectorAll<HTMLElement>('[data-parish-life-link], [data-parish-life-section]').forEach((element) => {
      element.hidden = false;
      element.classList?.add('sw-tool-loading');
      element.setAttribute?.('aria-busy', 'true');
      element.setAttribute?.('aria-disabled', 'true');
    });
    document.querySelectorAll<HTMLElement>('[data-parish-life-label]').forEach((element) => {
      element.textContent = 'Loading…';
      element.classList?.add('sw-tool-loading');
    });
  }

  async function loadParishCapabilities() {
    const current = session();
    if (!current.email || !current.token) {
      setParishCapabilities(null);
      return;
    }
    try {
      const response = await fetch('/api/donor/dashboard?view=context', {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw new Error('Unable to load parish features');
      const payload = await response.json();
      window.dispatchEvent(new CustomEvent('myagapay:parish-context', { detail: payload.parish || null }));
      setParishCapabilities(payload.parish || null, { persist: true, authoritative: true });
      if (parishCapabilities.parishLifeAvailable && !window.location.pathname.startsWith('/myagapay/parish-life')) {
        await Promise.all([
          parishCapabilities.communicationsEnabled ? loadFeedUnreadCount() : Promise.resolve(setFeedUnreadCount(0)),
          loadGroupsUnreadCount(),
          parishCapabilities.communicationsEnabled
            ? loadTeachingUnreadCount()
            : Promise.resolve(setTeachingUnreadCount(0)),
        ]);
      }
    } catch {
      // Keep a fresh cached display if one was available. On a true cold start,
      // retain the honest loading state instead of guessing Today or Koinonia.
      if (!capabilitiesLoaded) deferParishLifeIdentity();
    }
  }

  function setFeedUnreadCount(count: unknown) {
    feedUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
    normalizeMobileAppMenus();
  }

  function setGroupsUnreadCount(count: unknown) {
    groupsUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
  }

  function setTeachingUnreadCount(count: unknown) {
    teachingUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
  }

  function syncParishLifeUnreadSummary() {
    const total = feedUnreadCount + groupsUnreadCount + teachingUnreadCount;
    document.querySelectorAll<HTMLElement>('[data-parish-life-unread]').forEach((badge) => {
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.setAttribute('aria-label', `${total} unread across Parish Life`);
    });
  }

  async function loadFeedUnreadCount() {
    try {
      const response = await fetch('/api/donor/feed', { headers: authHeaders(), cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setFeedUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  async function loadGroupsUnreadCount() {
    try {
      const response = await fetch('/api/donor/groups/activity', { headers: authHeaders(), cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setGroupsUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  async function loadTeachingUnreadCount() {
    try {
      const response = await fetch('/api/donor/teaching', { headers: authHeaders(), cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      setTeachingUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  function session() {
    return window.AGAPAYDonorSession.session();
  }

  function authHeaders(extra: Record<string, string> = {}) {
    return window.AGAPAYDonorSession.authHeaders(extra);
  }

  function clearSession() {
    window.AGAPAYDonorSession.clearSession();
  }

  // This marker only continues the parish dashboard's cosmetic progress pattern
  // across real browser navigations. It does not intercept links or create a router.
  function markInternalNavigation(destination: URL) {
    try {
      localStorage.setItem(
        storageKeys.navigationTransition,
        JSON.stringify({
          fromPath: window.location.pathname,
          destinationPath: destination.pathname,
          startedAt: Date.now(),
        })
      );
    } catch {
      // Navigation must proceed normally when storage is unavailable.
    }
    document.body?.style?.setProperty('--myagapay-navigation-delay', '0ms');
    document.body?.classList.add('myagapay-navigating');
  }

  function isMyAgapayPath(pathname: string) {
    return pathname === '/myagapay' || pathname.startsWith('/myagapay/');
  }

  function consumeInternalNavigation() {
    let marker = null;
    try {
      marker = JSON.parse(localStorage.getItem(storageKeys.navigationTransition) || 'null');
      localStorage.removeItem(storageKeys.navigationTransition);
    } catch {
      return null;
    }
    if (!marker?.startedAt || Date.now() - marker.startedAt > NAVIGATION_TRANSITION_MAX_AGE_MS) return null;
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin || !isMyAgapayPath(referrer.pathname)) return null;
      if (marker.fromPath !== referrer.pathname || marker.destinationPath !== window.location.pathname) return null;
      return marker;
    } catch {
      return null;
    }
  }

  function beginInternalNavigationProgress(marker: ShellNavigationMarker | null) {
    if (!marker) return;
    const elapsed = Math.max(0, Date.now() - Number(marker.startedAt));
    document.body?.style?.setProperty('--myagapay-navigation-delay', `-${elapsed}ms`);
    document.body?.classList.add('myagapay-navigating');
  }

  function finishInternalNavigationProgress() {
    if (!internalNavigationMarker) return;
    const finish = () => document.body?.classList.remove('myagapay-navigating');
    if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    else finish();
  }

  function handleInternalNavigationClick(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    let destination;
    try {
      destination = new URL(link.href, window.location.href);
    } catch {
      return;
    }
    if (destination.origin !== window.location.origin || !isMyAgapayPath(destination.pathname)) return;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    markInternalNavigation(destination);
    // Deliberately do not preventDefault: this remains an ordinary full-page navigation.
  }

  function syncAuthVisibility(root: Document | HTMLElement = document) {
    const current = session();
    const signedIn = Boolean(current.email && current.token);
    root.querySelectorAll<HTMLElement>('[data-auth-required]').forEach((el) => {
      el.hidden = !signedIn;
    });
    root.querySelectorAll<HTMLElement>('[data-auth-guest]').forEach((el) => {
      el.hidden = signedIn;
    });
    const name = root.querySelector<HTMLElement>('#donorHomeTopbarName');
    if (name && signedIn) {
      name.textContent = current.email.split('@')[0] || 'Account';
    }
  }

  function isProtectedPath(pathname = window.location.pathname) {
    if (!pathname.startsWith('/myagapay')) return false;
    return !['/myagapay/login', '/myagapay/signup', '/myagapay/password-reset'].some((path) =>
      pathname.startsWith(path)
    );
  }

  let redirectingToLogin = false;
  function redirectToLogin(reason = 'session-expired') {
    // Several parallel requests can return 401 together. Start only one
    // navigation so a second response cannot abort the login page load.
    if (redirectingToLogin) return;
    redirectingToLogin = true;
    const next = `${window.location.pathname}${window.location.search || ''}`;
    clearSession();
    const loginUrl = new URL('/myagapay/login', window.location.origin);
    loginUrl.searchParams.set('next', next);
    if (reason) loginUrl.searchParams.set('reason', reason);
    window.location.replace(loginUrl.toString());
  }

  function handleUnauthorized(response: Response | null | undefined) {
    if (response?.status !== 401 || !isProtectedPath()) return false;
    redirectToLogin('session-expired');
    return true;
  }

  window.MyAgapayShell = {
    activeProduct,
    initializeMobileAppMenus,
    openSupportDialog,
    authHeaders,
    clearSession,
    handleUnauthorized,
    ensureParishLifeBackLink,
    isMyAgapayMainPage,
    icons,
    isProtectedPath,
    normalizeProductNavs,
    parishLifeExperience,
    productNav,
    setParishCapabilities,
    setFeedUnreadCount,
    setGroupsUnreadCount,
    setTeachingUnreadCount,
    redirectToLogin,
    session,
    syncAuthVisibility,
    finishPageHydration: finishMyAgapayPageHydration,
    capabilitiesLoaded: () => capabilitiesLoaded,
    viewport: currentViewport,
  };

  // Backgrounding the app does not end the authenticated session. The normal
  // missing-session and API 401 checks below still require sign-in when needed.

  const DESKTOP_BREAKPOINT = '(min-width: 901px)';
  let viewportQuery: MediaQueryList | null = null;

  const internalNavigationMarker = consumeInternalNavigation();
  beginInternalNavigationProgress(internalNavigationMarker);

  const cachedParishCapabilities = isProtectedPath() ? readCachedParishCapabilities() : null;
  if (cachedParishCapabilities) {
    setParishCapabilities(cachedParishCapabilities, { persist: false, authoritative: false });
  }

  function isLikelyMobileBrowser() {
    const ua = window.navigator.userAgent || '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return mobileUa || isAppleTouchDevice() || coarsePointer;
  }

  function currentViewport() {
    return (viewportQuery && viewportQuery.matches) || !isLikelyMobileBrowser() ? 'desktop' : 'mobile';
  }

  function applyViewportFlag() {
    const next = currentViewport();
    if (document.documentElement.dataset.viewport === next) return;
    document.documentElement.dataset.viewport = next;
    window.dispatchEvent(new CustomEvent('myagapay:viewport-change', { detail: { viewport: next } }));
  }

  function initViewportAwareness() {
    if (!window.matchMedia) {
      document.documentElement.dataset.viewport = 'desktop';
      return;
    }
    viewportQuery = window.matchMedia(DESKTOP_BREAKPOINT);
    applyViewportFlag();
    const listener = () => applyViewportFlag();
    if (viewportQuery.addEventListener) viewportQuery.addEventListener('change', listener);
    else if (viewportQuery.addListener) viewportQuery.addListener(listener);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (pageHydration.active) {
      document.body?.setAttribute('aria-busy', 'true');
    }
    deferParishLifeIdentity();
    normalizeProductNavs();
    initializeMobileAppMenus();
    ensureParishLifeBackLink();
    ensureCanonicalHeader();
    ensureSupportFeedback();
    deferParishLifeIdentity();
    syncAuthVisibility();
    initViewportAwareness();
    document.addEventListener('click', (event) => {
      handleInternalNavigationClick(event);
      if (!(event.target as Element).closest('[data-myagapay-app-menu], [data-myagapay-app-menu-toggle]'))
        closeMobileAppMenus();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileAppMenus();
    });
    if (isProtectedPath()) {
      const current = session();
      if (!current.email || !current.token) redirectToLogin('sign-in-required');
      else loadParishCapabilities();
    }
    pageHydration.domReady = true;
    if (pageHydration.active) scheduleMyAgapayPageHydrationFinish();
    else finishInternalNavigationProgress();
  });

  window.addEventListener('storage', () => syncAuthVisibility());
})();
