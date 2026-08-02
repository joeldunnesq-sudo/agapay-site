(function () {
  "use strict";

  // Protected My AGAPAY documents opt into an atomic first paint with the
  // data-myagapay-hydrate attribute on <html>. The shell is loaded
  // synchronously there so this tracker exists before page-level inline code.
  const pageHydration = {
    active: document.documentElement.hasAttribute("data-myagapay-hydrate"),
    domReady: false,
    pendingRequests: 0,
    settleTimer: 0,
    observer: null
  };
  const nativeFetch = window.fetch.bind(window);

  function isInitialMyAgapayApiRequest(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      const url = new URL(raw || "", window.location.href);
      return url.origin === window.location.origin && url.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }

  function finishMyAgapayPageHydration() {
    if (!pageHydration.active) return;
    pageHydration.active = false;
    if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
    pageHydration.observer?.disconnect();
    window.fetch = nativeFetch;
    document.documentElement.dataset.myagapayPageReady = "true";
    document.body?.removeAttribute("aria-busy");
    finishInternalNavigationProgress();
    window.dispatchEvent(new CustomEvent("myagapay:page-ready"));
  }

  function scheduleMyAgapayPageHydrationFinish() {
    if (!pageHydration.active || !pageHydration.domReady || pageHydration.pendingRequests > 0) return;
    if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
    // Covers response.json(), synchronous rendering, and immediately chained
    // requests without exposing any of those intermediate answers.
    pageHydration.settleTimer = window.setTimeout(() => {
      if (pageHydration.pendingRequests === 0) finishMyAgapayPageHydration();
    }, 180);
  }

  function noteMyAgapayHydrationActivity() {
    if (!pageHydration.active) return;
    if (pageHydration.settleTimer) window.clearTimeout(pageHydration.settleTimer);
    pageHydration.settleTimer = 0;
  }

  if (pageHydration.active) {
    document.documentElement.dataset.myagapayPageReady = "false";
    window.fetch = async (...args) => {
      const tracked = pageHydration.active && isInitialMyAgapayApiRequest(args[0]);
      if (tracked) {
        noteMyAgapayHydrationActivity();
        pageHydration.pendingRequests += 1;
      }
      try {
        return await nativeFetch(...args);
      } finally {
        if (tracked) {
          pageHydration.pendingRequests = Math.max(0, pageHydration.pendingRequests - 1);
          scheduleMyAgapayPageHydrationFinish();
        }
      }
    };
  }

  const storageKeys = {
    email: "agapayDonorEmail",
    token: "agapayDonorToken",
    profile: "agapayDonorProfile",
    learnPlan: "agapay.learn.plan",
    // UX cache only: this makes the shared navigation render consistently
    // across full-page loads. It must never be used as an authorization or
    // content-access decision; the Worker remains the security boundary.
    parishCapabilities: "agapay.parishCapabilities.v1",
    navigationTransition: "agapay.navigationTransition.v1"
  };
  const PARISH_CAPABILITIES_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const NAVIGATION_TRANSITION_MAX_AGE_MS = 15 * 1000;

  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    give: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/><path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
    bookstore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    parishLife: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><circle cx="5.5" cy="9" r="2.2"/><circle cx="18.5" cy="9" r="2.2"/><path d="M6.5 20c.4-4 2.4-6 5.5-6s5.1 2 5.5 6"/><path d="M1.5 20c.3-3 1.8-4.7 4-4.7 1 0 1.8.3 2.5.8"/><path d="M16 16.1c.7-.5 1.5-.8 2.5-.8 2.2 0 3.7 1.7 4 4.7"/></svg>',
    feed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
    groups: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-4 2.8-6 5.5-6s5 2 5.5 6"/><path d="M14 15c3.5.2 5.8 1.9 6.5 5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/></svg>',
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><circle cx="12" cy="15.5" r="1.7"/></svg>',
    commemorations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"/><path d="M5 7h14"/><path d="M7 12h10"/><path d="M9 22h6"/></svg>',
    sacraments: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.2 8.4-7 10-3.8-1.6-7-5-7-10V6l7-3z"/></svg>',
    learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>',
    market: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>',
    directory: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h5"/><circle cx="17" cy="13" r="1"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
    menu: '<span class="myagapay-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>'
  };

  function parishLifeExperience(source = parishCapabilities) {
    const resolved = source !== parishCapabilities || capabilitiesLoaded;
    const communicationsEnabled = Boolean(source?.communicationsEnabled);
    return {
      communicationsEnabled,
      label: resolved ? String(source?.parishLifeLabel || (communicationsEnabled ? "Koinonia" : "Today")) : "Loading…",
      short: resolved ? (communicationsEnabled ? "Parish news and ministries" : "Feast day and services") : "Loading parish features"
    };
  }

  function products() {
    const parishLife = parishLifeExperience();
    const items = [
      { id: "giving", href: "/myagapay/dashboard", label: "Give", mobileLabel: "Home", short: "Giving dashboard", icon: icons.home },
      { id: "parish-life", href: "/myagapay/parish-life", label: parishLife.label, short: parishLife.short, icon: icons.parishLife, deferUntilCapabilitiesLoaded: true },
      { id: "commemorations", href: "/myagapay/sacraments", label: "Sacraments & Services", short: "Requests and prayer", icon: icons.sacraments, parishFeature: "sacramentsEnabled" },
      { id: "history", href: "/myagapay/giving/history", label: "History", short: "Giving history", icon: icons.history, mobileFallbackFor: "sacramentsEnabled", desktopHidden: true },
      { id: "directory", href: "/myagapay/directory", label: "Directory", short: "Parish member directory", icon: icons.directory, parishFeature: "directoryEnabled" },
      { id: "bookstore", href: "/myagapay/bookstore", label: "Bookstore", short: "Books and parish goods", icon: icons.bookstore, parishFeature: "bookstoreEnabled" },
      { id: "settings", href: "/myagapay/account", label: "Settings", short: "Account settings", icon: icons.account, mobileFallbackFor: "bookstoreEnabled", desktopHidden: true },
      { id: "learn", href: "/myagapay/learn", label: "Learn", short: "Homeschool dashboard", icon: icons.learn, mobileFallbackFor: "directoryEnabled" }
    ];
    return items;
  }

  let parishCapabilities = {
    sacramentsEnabled: false,
    directoryEnabled: false,
    bookstoreEnabled: false,
    communicationsEnabled: false,
    parishLifeAvailable: false
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
    const featureOrFallback = (featureId, fallbackId) => {
      const feature = byId.get(featureId);
      return parishCapabilities[feature?.parishFeature] === true || active === featureId
        ? feature
        : byId.get(fallbackId);
    };
    return [
      byId.get("giving"),
      featureOrFallback("bookstore", "settings"),
      byId.get("parish-life"),
      featureOrFallback("directory", "learn"),
      featureOrFallback("commemorations", "history"),
    ].filter(Boolean);
  }

  function activeProduct(pathname = window.location.pathname) {
    if (pathname.startsWith("/myagapay/learn")) return "learn";
    if (pathname === "/myagapay" || pathname === "/myagapay/" || pathname === "/myagapay/dashboard") return "giving";
    if (pathname.startsWith("/myagapay/bookstore")) return "bookstore";
    if (pathname.startsWith("/myagapay/parish-life") || pathname.startsWith("/myagapay/feed") || pathname.startsWith("/myagapay/news") || pathname.startsWith("/myagapay/groups") || pathname.startsWith("/myagapay/teaching") || pathname.startsWith("/myagapay/media") || pathname.startsWith("/myagapay/calendar")) return "parish-life";
    if (pathname.startsWith("/myagapay/sacraments") || pathname.startsWith("/myagapay/giving/commemorations") || pathname.startsWith("/myagapay/giving/names")) return "commemorations";
    if (pathname.startsWith("/myagapay/directory")) return "directory";
    if (pathname.startsWith("/myagapay/giving/history") || pathname.startsWith("/myagapay/giving/offerings")) return "history";
    if (pathname.startsWith("/myagapay/giving")) return "giving";
    if (pathname.startsWith("/myagapay/account")) return "account";
    if (pathname.startsWith("/marketplace")) return "market";
    return "home";
  }

  function ensureParishLifeBackLink(pathname = window.location.pathname) {
    const isSubpage = /^\/myagapay\/(?:feed|news|groups|teaching|media(?:\/watch)?|calendar)(?:\.html)?\/?$/.test(pathname);
    if (!isSubpage || document.querySelector("[data-parish-life-back]")) return;
    const page = document.querySelector(".page");
    if (!page) return;
    const link = document.createElement("a");
    link.className = "parish-life-back-link koinonia-page-back";
    link.href = "/myagapay/parish-life";
    link.setAttribute("data-parish-life-back", "");
    link.setAttribute("aria-label", "Back to Koinonia");
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Back to Koinonia</span>';
    page.prepend(link);
  }

  function isAppleTouchDevice() {
    const ua = window.navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandaloneDisplay() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function injectBackButtonStyles() {
    if (document.getElementById("myAgapayIosBackStyles")) return;
    const style = document.createElement("style");
    style.id = "myAgapayIosBackStyles";
    style.textContent = `
      .myagapay-ios-back {
        position: fixed;
        top: calc(10px + env(safe-area-inset-top));
        left: calc(10px + env(safe-area-inset-left));
        z-index: 120;
        display: none;
        align-items: center;
        gap: 0.35rem;
        min-height: 36px;
        border: 1px solid rgba(201, 162, 91, 0.35);
        border-radius: 999px;
        padding: 0 0.78rem;
        background: rgba(255, 252, 246, 0.94);
        color: #061522;
        box-shadow: 0 10px 28px rgba(6, 21, 34, 0.18);
        backdrop-filter: blur(16px);
        font: 800 0.78rem/1 "DM Sans", system-ui, sans-serif;
      }
      .myagapay-ios-back svg {
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      body.has-myagapay-ios-back .myagapay-ios-back {
        display: inline-flex;
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
      .donor-mobile-page .topbar .myagapay-menu-trigger {
        background: rgba(255, 255, 255, 0.78);
        color: #061522;
      }
      .donor-mobile-page .topbar .myagapay-settings-chip {
        color: #061522;
        background: rgba(255, 255, 255, 0.72);
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
      @media (min-width: 761px) {
        body.has-myagapay-ios-back .myagapay-ios-back { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function shouldShowIosBackButton(pathname = window.location.pathname) {
    if (!isAppleTouchDevice()) return false;
    if (!pathname.startsWith("/myagapay")) return false;
    if (["/myagapay", "/myagapay/"].includes(pathname)) return false;
    if (pathname.startsWith("/myagapay/login") || pathname.startsWith("/myagapay/signup")) return false;
    return isStandaloneDisplay() || window.innerWidth <= 760;
  }

  function ensureIosBackButton() {
    injectBackButtonStyles();
    let button = document.getElementById("myAgapayIosBack");
    if (!button) {
      button = document.createElement("button");
      button.id = "myAgapayIosBack";
      button.className = "myagapay-ios-back";
      button.type = "button";
      button.setAttribute("aria-label", "Go back");
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>Back</span>';
      button.addEventListener("click", () => {
        if (window.history.length > 1) window.history.back();
        else window.location.href = "/myagapay/dashboard";
      });
      document.body.appendChild(button);
    }
    document.body.classList.toggle("has-myagapay-ios-back", shouldShowIosBackButton());
  }

  // The dashboard home pages (myagapay/index.html, donor/index.html) have a
  // rich, hardcoded account dropdown (History / Account Settings / Log out).
  // Every other My AGAPAY page previously only
  // got a bare "Account" link here, so the canonical menu visibly changed
  // depending on which page you landed on (e.g. clicking a Quick Give tile
  // from the dashboard home). Inject the SAME dropdown -- same markup,
  // ids, and data-attributes the existing event delegation in donor/app.js
  // already handles (data-donor-account-menu/-toggle/-logout, #donorHomeTopbarName,
  // .donor-home-account-dropdown) -- everywhere else too, just with a
  // trigger styled for the light .topbar background instead of the dark
  // home hero.
  function ensureCanonicalHeader() {
    if (!document.body.classList.contains("donor-mobile-page")) return;
    if (document.querySelector(".donor-home-account-menu") || document.querySelector(".learn-account-utility")) return;
    const content = document.querySelector(".content, main");
    if (!content) return;
    let topbar = content.querySelector(".topbar");
    if (!topbar) {
      topbar = document.createElement("div");
      topbar.className = "topbar";
      const title = document.createElement("div");
      title.className = "topbar-title";
      const active = products().find((item) => item.id === activeProduct());
      title.textContent = active?.label || "My AGAPAY";
      topbar.appendChild(title);
      content.prepend(topbar);
    }
    let actions = topbar.querySelector(".topbar-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "topbar-actions";
      topbar.appendChild(actions);
    }
    if (actions.querySelector("[data-donor-account-menu]") || actions.querySelector(".myagapay-settings-chip")) return;

    const menu = document.createElement("div");
    menu.className = "donor-home-account-menu";
    menu.setAttribute("data-donor-account-menu", "");
    menu.setAttribute("data-auth-required", "");
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

    const guestLink = document.createElement("a");
    guestLink.className = "myagapay-settings-chip";
    guestLink.href = "/myagapay/login";
    guestLink.setAttribute("data-auth-guest", "");
    guestLink.textContent = "Login";
    actions.appendChild(guestLink);
  }

  function closeAccountMenus() {
    document.querySelectorAll("[data-donor-account-toggle], [data-learn-account-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    document.querySelectorAll(".donor-home-account-dropdown, .learn-account-dropdown").forEach((panel) => { panel.hidden = true; });
  }

  function openSupportDialog() {
    closeAccountMenus();
    const dialog = document.getElementById("myAgapaySupportDialog");
    if (!dialog) return;
    const status = dialog.querySelector("[data-myagapay-support-status]");
    if (status) { status.textContent = ""; status.className = "myagapay-support-status"; }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("select")?.focus();
  }

  function closeSupportDialog() {
    const dialog = document.getElementById("myAgapaySupportDialog");
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  async function submitSupportRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("[data-myagapay-support-status]");
    const button = form.querySelector("[data-myagapay-support-send]");
    const fields = Object.fromEntries(new FormData(form));
    const message = String(fields.message || "").trim();
    if (message.length < 8) {
      status.textContent = "Please include a little more detail so we can help.";
      status.className = "myagapay-support-status is-error";
      return;
    }
    button.disabled = true;
    status.textContent = "Sending your request…";
    status.className = "myagapay-support-status";
    try {
      const response = await fetch("/api/donor/support-tickets", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, message, page: activeProduct(), path: `${window.location.pathname}${window.location.search}` })
      });
      if (handleUnauthorized(response)) return;
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to send your request.");
      status.textContent = fields.type === "feature" ? "Your feature request was sent. Thank you for helping improve AGAPAY." : "Your report was sent to the AGAPAY team.";
      status.className = "myagapay-support-status is-success";
      form.reset();
      window.setTimeout(closeSupportDialog, 1200);
    } catch (error) {
      status.textContent = error.message || "Unable to send your request.";
      status.className = "myagapay-support-status is-error";
    } finally {
      button.disabled = false;
    }
  }

  function ensureSupportFeedback() {
    injectBackButtonStyles();
    document.querySelectorAll(".donor-home-account-dropdown, .learn-account-dropdown").forEach((dropdown) => {
      if (dropdown.querySelector("[data-myagapay-support-open]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.setAttribute("data-myagapay-support-open", "");
      button.textContent = "Report a problem / Request a feature";
      button.addEventListener("click", openSupportDialog);
      const logout = dropdown.querySelector("[data-donor-logout], [data-learn-logout]");
      dropdown.insertBefore(button, logout || null);
    });
    if (document.getElementById("myAgapaySupportDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "myAgapaySupportDialog";
    dialog.className = "myagapay-support-dialog";
    dialog.setAttribute("aria-labelledby", "myAgapaySupportTitle");
    dialog.innerHTML = `
      <form class="myagapay-support-form">
        <div class="myagapay-support-head"><div><div class="myagapay-support-kicker">AGAPAY Support</div><h2 id="myAgapaySupportTitle">Help us improve My AGAPAY</h2><p>Report something that is not working or tell us what would make the app better.</p></div><button class="myagapay-support-close" type="button" data-myagapay-support-close aria-label="Close support form">Close</button></div>
        <label>What would you like to do?<select name="type"><option value="issue">Report a problem</option><option value="feature">Request a feature</option><option value="help">Get help using My AGAPAY</option><option value="question">Ask a question</option></select></label>
        <label>Subject<input name="subject" maxlength="160" required placeholder="Briefly describe your request" /></label>
        <label>Details<textarea name="message" maxlength="2400" required placeholder="Tell us what happened, what you expected, or how the feature would help."></textarea></label>
        <p class="myagapay-support-status" data-myagapay-support-status role="status" aria-live="polite"></p>
        <div class="myagapay-support-actions"><button class="myagapay-support-cancel" type="button" data-myagapay-support-close>Cancel</button><button class="myagapay-support-send" type="submit" data-myagapay-support-send>Send to AGAPAY</button></div>
      </form>`;
    dialog.querySelector("form").addEventListener("submit", submitSupportRequest);
    dialog.querySelectorAll("[data-myagapay-support-close]").forEach((button) => button.addEventListener("click", closeSupportDialog));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeSupportDialog(); });
    document.body.appendChild(dialog);
  }

  function productNav(active = activeProduct(), className = "my-agapay-tabbar") {
    const isLearnNav = className === "learn-product-tabbar";
    const isDesktopSideNav = className.includes("unified-product-nav");
    // Every bottom tabbar variant is a fixed 5-column grid -- drop
    // mobileTabHidden items there so a 6th product
    // never wraps onto an ugly second row. The full list still appears in
    // the desktop sidebar, which has room.
    const navProducts = isDesktopSideNav ? visibleProducts() : mobileProducts();
    const navAttrs = isDesktopSideNav
      ? ' hx-boost="false"'
      : ` style="grid-template-columns:repeat(${Math.max(navProducts.length, 1)},minmax(0,1fr))"`;
    const productLinks = navProducts.map((item) => {
      const current = item.id === active || (item.id === "settings" && active === "account");
      const activeClass = current ? (isLearnNav ? "is-active" : "active") : "";
      if (item.deferUntilCapabilitiesLoaded && !capabilitiesLoaded) {
        const loadingLabel = isDesktopSideNav
          ? `<span><strong>Loading…</strong><small>Loading parish features</small></span>`
          : "<span>Loading…</span>";
        return `<span class="sw-tool-loading myagapay-nav-loading" data-parish-life-loading aria-busy="true">${item.icon}${loadingLabel}</span>`;
      }
      const unreadCount = item.id === "parish-life" ? feedUnreadCount + groupsUnreadCount + teachingUnreadCount : 0;
      const badge = unreadCount > 0
        ? `<em class="unified-nav-badge" data-${item.id}-unread-count aria-label="${unreadCount} unread">${unreadCount > 99 ? "99+" : unreadCount}</em>`
        : "";
      const label = isDesktopSideNav ? `<span><strong>${item.label}</strong><small>${item.short}</small></span>${badge}` : `<span>${item.mobileLabel || item.label}</span>${badge}`;
      return `<a class="${activeClass}" href="${item.href}"${current ? ' aria-current="page"' : ""}>${item.icon}${label}</a>`;
    }).join("");
    const accountLink = isDesktopSideNav
      ? `<span class="unified-nav-divider" aria-hidden="true"></span><a class="${active === "account" ? "active" : ""}" href="/myagapay/account"${active === "account" ? ' aria-current="page"' : ""}>${icons.account}<span><strong>Account</strong><small>Profile and settings</small></span></a>`
      : "";
    return `<nav class="${className}" data-myagapay-global-nav aria-label="My AGAPAY navigation"${navAttrs}>${productLinks}${accountLink}</nav>`;
  }

  function normalizeProductNavs(root = document) {
    const active = activeProduct();
    root.querySelectorAll(".my-agapay-tabbar:not([data-static-nav]), .mobile-tabbar, .learn-product-tabbar, .unified-product-nav").forEach((nav) => {
      const className = nav.classList.contains("learn-product-tabbar")
        ? "learn-product-tabbar"
        : nav.classList.contains("unified-product-nav")
          ? "nav unified-product-nav"
          : "my-agapay-tabbar";
      const holder = document.createElement("div");
      holder.innerHTML = productNav(active, className);
      nav.replaceWith(holder.firstElementChild);
    });
  }

  function normalizeParishCapabilities(parish = null) {
    return {
      sacramentsEnabled: Boolean(parish?.sacramentsEnabled),
      directoryEnabled: Boolean(parish?.directoryEnabled),
      bookstoreEnabled: Boolean(parish?.bookstoreEnabled),
      communicationsEnabled: Boolean(parish?.communicationsEnabled),
      parishLifeLabel: String(parish?.parishLifeLabel || ""),
      parishLifeAvailable: Boolean(parish?.parishLifeAvailable)
    };
  }

  function readCachedParishCapabilities() {
    const current = session();
    if (!current.email || !current.token) return null;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKeys.parishCapabilities) || "null");
      const cachedAt = Number(cached?.cachedAt || 0);
      if (!cached?.parish || cached.email !== current.email || !cachedAt || Date.now() - cachedAt > PARISH_CAPABILITIES_CACHE_MAX_AGE_MS) {
        return null;
      }
      return normalizeParishCapabilities(cached.parish);
    } catch {
      return null;
    }
  }

  function cacheParishCapabilities(parish) {
    const current = session();
    if (!current.email || !current.token) return;
    try {
      localStorage.setItem(storageKeys.parishCapabilities, JSON.stringify({
        email: current.email,
        cachedAt: Date.now(),
        parish: normalizeParishCapabilities(parish)
      }));
    } catch {
      // Navigation still resolves from the network when storage is unavailable.
    }
  }

  function setParishCapabilities(parish = null, { persist = false, authoritative = true } = {}) {
    parishCapabilities = normalizeParishCapabilities(parish);
    if (persist) cacheParishCapabilities(parishCapabilities);
    capabilitiesLoaded = true;
    const parishLife = parishLifeExperience(parishCapabilities);
    document.documentElement.dataset.parishCapabilitiesLoaded = "true";
    document.documentElement.dataset.parishLifeExperience = parishLife.communicationsEnabled ? "koinonia" : "today";
    normalizeProductNavs();
    document.querySelectorAll("[data-parish-life-link], [data-parish-life-section]").forEach((element) => {
      element.hidden = false;
      element.classList?.remove("sw-tool-loading");
      element.removeAttribute?.("aria-busy");
      element.removeAttribute?.("aria-disabled");
    });
    document.querySelectorAll("[data-parish-life-label]").forEach((element) => {
      element.textContent = parishLife.label;
      element.classList?.remove("sw-tool-loading");
    });
    if (authoritative && activeProduct() === "directory" && !parishCapabilities.directoryEnabled) {
      window.location.replace("/myagapay/dashboard");
      return;
    }
    window.dispatchEvent(new CustomEvent("myagapay:parish-capabilities", {
      detail: { ...parishCapabilities, source: authoritative ? "network" : "cache" }
    }));
  }

  function deferParishLifeIdentity() {
    if (capabilitiesLoaded) return;
    document.documentElement.dataset.parishCapabilitiesLoaded = "false";
    document.querySelectorAll("[data-parish-life-link], [data-parish-life-section]").forEach((element) => {
      element.hidden = false;
      element.classList?.add("sw-tool-loading");
      element.setAttribute?.("aria-busy", "true");
      element.setAttribute?.("aria-disabled", "true");
    });
    document.querySelectorAll("[data-parish-life-label]").forEach((element) => {
      element.textContent = "Loading…";
      element.classList?.add("sw-tool-loading");
    });
  }

  async function loadParishCapabilities() {
    const current = session();
    if (!current.email || !current.token) {
      setParishCapabilities(null);
      return;
    }
    try {
      const response = await fetch("/api/donor/dashboard", {
        headers: authHeaders(),
        cache: "no-store"
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) throw new Error("Unable to load parish features");
      const payload = await response.json();
      setParishCapabilities(payload.parish || null, { persist: true, authoritative: true });
      if (parishCapabilities.parishLifeAvailable && !window.location.pathname.startsWith("/myagapay/parish-life")) {
        await Promise.all([
          parishCapabilities.communicationsEnabled ? loadFeedUnreadCount() : Promise.resolve(setFeedUnreadCount(0)),
          loadGroupsUnreadCount(),
          parishCapabilities.communicationsEnabled ? loadTeachingUnreadCount() : Promise.resolve(setTeachingUnreadCount(0)),
        ]);
      }
    } catch {
      // Keep a fresh cached display if one was available. On a true cold start,
      // retain the honest loading state instead of guessing Today or Koinonia.
      if (!capabilitiesLoaded) deferParishLifeIdentity();
    }
  }

  function setFeedUnreadCount(count) {
    feedUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
  }

  function setGroupsUnreadCount(count) {
    groupsUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
  }

  function setTeachingUnreadCount(count) {
    teachingUnreadCount = Math.max(0, Number(count) || 0);
    syncParishLifeUnreadSummary();
    normalizeProductNavs();
  }

  function syncParishLifeUnreadSummary() {
    const total = feedUnreadCount + groupsUnreadCount + teachingUnreadCount;
    document.querySelectorAll("[data-parish-life-unread]").forEach((badge) => {
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.setAttribute("aria-label", `${total} unread across Parish Life`);
    });
  }

  async function loadFeedUnreadCount() {
    try {
      const response = await fetch("/api/donor/feed", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setFeedUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  async function loadGroupsUnreadCount() {
    try {
      const response = await fetch("/api/donor/groups/activity", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setGroupsUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  async function loadTeachingUnreadCount() {
    try {
      const response = await fetch("/api/donor/teaching", { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setTeachingUnreadCount(payload.unreadCount);
    } catch {
      // The navigation remains usable when the count cannot be refreshed.
    }
  }

  function session() {
    return {
      email: localStorage.getItem(storageKeys.email) || "",
      token: localStorage.getItem(storageKeys.token) || ""
    };
  }

  function authHeaders(extra = {}) {
    const current = session();
    const headers = { Accept: "application/json", ...extra };
    if (current.token) headers.Authorization = `Bearer ${current.token}`;
    if (current.email) headers["X-AGAPAY-Donor-Email"] = current.email;
    return headers;
  }

  function clearSession() {
    Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
  }

  // This marker only continues the parish dashboard's cosmetic progress pattern
  // across real browser navigations. It does not intercept links or create a router.
  function markInternalNavigation(destination) {
    try {
      localStorage.setItem(storageKeys.navigationTransition, JSON.stringify({
        fromPath: window.location.pathname,
        destinationPath: destination.pathname,
        startedAt: Date.now()
      }));
    } catch {
      // Navigation must proceed normally when storage is unavailable.
    }
    document.body?.style?.setProperty("--myagapay-navigation-delay", "0ms");
    document.body?.classList.add("myagapay-navigating");
  }

  function isMyAgapayPath(pathname) {
    return pathname === "/myagapay" || pathname.startsWith("/myagapay/");
  }

  function consumeInternalNavigation() {
    let marker = null;
    try {
      marker = JSON.parse(localStorage.getItem(storageKeys.navigationTransition) || "null");
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

  function beginInternalNavigationProgress(marker) {
    if (!marker) return;
    const elapsed = Math.max(0, Date.now() - Number(marker.startedAt));
    document.body?.style?.setProperty("--myagapay-navigation-delay", `-${elapsed}ms`);
    document.body?.classList.add("myagapay-navigating");
  }

  function finishInternalNavigationProgress() {
    if (!internalNavigationMarker) return;
    const finish = () => document.body?.classList.remove("myagapay-navigating");
    if (window.requestAnimationFrame) window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    else finish();
  }

  function handleInternalNavigationClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.("a[href]");
    if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
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

  function syncAuthVisibility(root = document) {
    const current = session();
    const signedIn = Boolean(current.email && current.token);
    root.querySelectorAll("[data-auth-required]").forEach((el) => {
      el.hidden = !signedIn;
    });
    root.querySelectorAll("[data-auth-guest]").forEach((el) => {
      el.hidden = signedIn;
    });
    const name = root.querySelector("#donorHomeTopbarName");
    if (name && signedIn) {
      name.textContent = current.email.split("@")[0] || "Account";
    }
  }

  function isProtectedPath(pathname = window.location.pathname) {
    if (!pathname.startsWith("/myagapay")) return false;
    return !["/myagapay/login", "/myagapay/signup", "/myagapay/password-reset"].some((path) => pathname.startsWith(path));
  }

  function redirectToLogin(reason = "session-expired") {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    clearSession();
    const loginUrl = new URL("/myagapay/login", window.location.origin);
    loginUrl.searchParams.set("next", next);
    if (reason) loginUrl.searchParams.set("reason", reason);
    window.location.replace(loginUrl.toString());
  }

  function handleUnauthorized(response) {
    if (response?.status !== 401 || !isProtectedPath()) return false;
    redirectToLogin("session-expired");
    return true;
  }

  window.MyAgapayShell = {
    activeProduct,
    authHeaders,
    clearSession,
    handleUnauthorized,
    ensureParishLifeBackLink,
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
    viewport: currentViewport
  };

  const DESKTOP_BREAKPOINT = "(min-width: 901px)";
  let viewportQuery = null;

  const internalNavigationMarker = consumeInternalNavigation();
  beginInternalNavigationProgress(internalNavigationMarker);

  const cachedParishCapabilities = isProtectedPath() ? readCachedParishCapabilities() : null;
  if (cachedParishCapabilities) {
    setParishCapabilities(cachedParishCapabilities, { persist: false, authoritative: false });
  }

  function isLikelyMobileBrowser() {
    const ua = window.navigator.userAgent || "";
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return mobileUa || isAppleTouchDevice() || coarsePointer;
  }

  function currentViewport() {
    return (viewportQuery && viewportQuery.matches) || !isLikelyMobileBrowser() ? "desktop" : "mobile";
  }

  function applyViewportFlag() {
    const next = currentViewport();
    if (document.documentElement.dataset.viewport === next) return;
    document.documentElement.dataset.viewport = next;
    window.dispatchEvent(new CustomEvent("myagapay:viewport-change", { detail: { viewport: next } }));
  }

  function initViewportAwareness() {
    if (!window.matchMedia) {
      document.documentElement.dataset.viewport = "desktop";
      return;
    }
    viewportQuery = window.matchMedia(DESKTOP_BREAKPOINT);
    applyViewportFlag();
    const listener = () => applyViewportFlag();
    if (viewportQuery.addEventListener) viewportQuery.addEventListener("change", listener);
    else if (viewportQuery.addListener) viewportQuery.addListener(listener);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (pageHydration.active) {
      document.body?.setAttribute("aria-busy", "true");
      pageHydration.observer = new MutationObserver(() => {
        noteMyAgapayHydrationActivity();
        scheduleMyAgapayPageHydrationFinish();
      });
      pageHydration.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }
    deferParishLifeIdentity();
    normalizeProductNavs();
    ensureParishLifeBackLink();
    ensureIosBackButton();
    ensureCanonicalHeader();
    ensureSupportFeedback();
    deferParishLifeIdentity();
    syncAuthVisibility();
    initViewportAwareness();
    document.addEventListener("click", handleInternalNavigationClick);
    if (isProtectedPath()) {
      const current = session();
      if (!current.email || !current.token) redirectToLogin("sign-in-required");
      else loadParishCapabilities();
    }
    pageHydration.domReady = true;
    if (pageHydration.active) scheduleMyAgapayPageHydrationFinish();
    else finishInternalNavigationProgress();
  });

  window.addEventListener("resize", ensureIosBackButton);
  window.addEventListener("pageshow", ensureIosBackButton);
  window.addEventListener("storage", () => syncAuthVisibility());
})();
