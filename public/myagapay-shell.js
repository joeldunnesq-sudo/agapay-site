(function () {
  "use strict";

  const storageKeys = {
    email: "agapayDonorEmail",
    token: "agapayDonorToken",
    profile: "agapayDonorProfile",
    learnPlan: "agapay.learn.plan"
  };

  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    give: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13V7.5a1.5 1.5 0 0 1 3 0V13"/><path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M13 13V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M16 14V10a1.5 1.5 0 0 1 3 0v5c0 4-2.6 6-6.3 6H12a7 7 0 0 1-7-7v-1.5a1.5 1.5 0 0 1 2 0V13"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
    bookstore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/></svg>',
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><circle cx="12" cy="15.5" r="1.7"/></svg>',
    commemorations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"/><path d="M5 7h14"/><path d="M7 12h10"/><path d="M9 22h6"/></svg>',
    learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>',
    market: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>'
  };

  let releaseFlags = {
    marketplaceDirectoryLive: false
  };

  function products() {
    const items = [
      { id: "giving", href: "/myagapay", label: "Give", short: "Giving dashboard", icon: icons.give },
      { id: "commemorations", href: "/myagapay/giving/commemorations", label: "Prayer", short: "Names and candles", icon: icons.commemorations },
      { id: "today", href: "/myagapay/giving/calendar", label: "Today", short: "Feast day and readings", icon: icons.today },
      { id: "bookstore", href: "/myagapay/bookstore", label: "Bookstore", short: "Books and parish goods", icon: icons.bookstore },
      { id: "learn", href: "/myagapay/learn", label: "Learn", short: "Homeschool dashboard", icon: icons.learn }
    ];
    return items;
  }

  function activeProduct(pathname = window.location.pathname) {
    if (pathname.startsWith("/myagapay/learn")) return "learn";
    if (pathname === "/myagapay" || pathname === "/myagapay/" || pathname === "/myagapay/dashboard") return "giving";
    if (pathname.startsWith("/myagapay/bookstore")) return "bookstore";
    if (pathname.startsWith("/myagapay/giving/commemorations") || pathname.startsWith("/myagapay/giving/names")) return "commemorations";
    if (pathname.startsWith("/myagapay/giving/calendar")) return "today";
    if (pathname.startsWith("/myagapay/giving/history") || pathname.startsWith("/myagapay/giving/offerings")) return "account";
    if (pathname.startsWith("/myagapay/giving")) return "giving";
    if (pathname.startsWith("/myagapay/sacraments")) return "giving";
    if (pathname.startsWith("/myagapay/account")) return "account";
    if (pathname.startsWith("/marketplace")) return "market";
    return "home";
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
      .donor-mobile-page .topbar .myagapay-settings-chip {
        color: #061522;
        background: rgba(255, 255, 255, 0.72);
      }
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
        else window.location.href = "/myagapay";
      });
      document.body.appendChild(button);
    }
    document.body.classList.toggle("has-myagapay-ios-back", shouldShowIosBackButton());
  }

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
    if (actions.querySelector(".myagapay-settings-chip")) return;
    const link = document.createElement("a");
    link.className = "myagapay-settings-chip";
    link.href = "/myagapay/account";
    link.setAttribute("aria-label", "Open My AGAPAY account settings");
    link.innerHTML = `${icons.account}<span>Account</span>`;
    actions.appendChild(link);
  }

  function productNav(active = activeProduct(), className = "my-agapay-tabbar") {
    const navProducts = products();
    const isLearnNav = className === "learn-product-tabbar";
    const isDesktopSideNav = className.includes("unified-product-nav");
    const navAttrs = isDesktopSideNav ? ' hx-boost="false"' : "";
    const productLinks = navProducts.map((item) => {
      const current = item.id === active;
      const activeClass = current ? (isLearnNav ? "is-active" : "active") : "";
      const label = isDesktopSideNav ? `<span><strong>${item.label}</strong><small>${item.short}</small></span>` : `<span>${item.label}</span>`;
      return `<a class="${activeClass}" href="${item.href}"${current ? ' aria-current="page"' : ""}>${item.icon}${label}</a>`;
    }).join("");
    const accountLink = isDesktopSideNav
      ? `<span class="unified-nav-divider" aria-hidden="true"></span><a class="${active === "account" ? "active" : ""}" href="/myagapay/account"${active === "account" ? ' aria-current="page"' : ""}>${icons.account}<span><strong>Account</strong><small>Profile and settings</small></span></a>`
      : "";
    return `<nav class="${className}" data-myagapay-global-nav aria-label="My AGAPAY navigation"${navAttrs}>${productLinks}${accountLink}</nav>`;
  }

  function normalizeProductNavs(root = document) {
    const active = activeProduct();
    root.querySelectorAll(".my-agapay-tabbar, .mobile-tabbar, .learn-product-tabbar, .unified-product-nav").forEach((nav) => {
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

  function applyMyAgapayReleaseFlags(flags = {}) {
    releaseFlags = {
      marketplaceDirectoryLive: flags.marketplaceDirectoryLive === true
    };
    document.documentElement.toggleAttribute("data-myagapay-marketplace-directory-live", releaseFlags.marketplaceDirectoryLive);
    document.querySelectorAll("[data-myagapay-launch-gated]").forEach((el) => {
      el.hidden = !releaseFlags.marketplaceDirectoryLive;
    });
    normalizeProductNavs();
  }

  async function refreshMyAgapayReleaseFlags() {
    try {
      const response = await fetch("/api/myagapay/release-flags", { headers: { Accept: "application/json" } });
      const result = await response.json().catch(() => ({}));
      if (response.ok) applyMyAgapayReleaseFlags(result.flags || {});
    } catch {
      applyMyAgapayReleaseFlags(releaseFlags);
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
    applyMyAgapayReleaseFlags,
    authHeaders,
    clearSession,
    handleUnauthorized,
    icons,
    isProtectedPath,
    normalizeProductNavs,
    productNav,
    redirectToLogin,
    refreshMyAgapayReleaseFlags,
    session,
    viewport: currentViewport
  };

  const DESKTOP_BREAKPOINT = "(min-width: 901px)";
  let viewportQuery = null;

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
    normalizeProductNavs();
    ensureIosBackButton();
    ensureCanonicalHeader();
    refreshMyAgapayReleaseFlags();
    initViewportAwareness();
    if (isProtectedPath()) {
      const current = session();
      if (!current.email || !current.token) redirectToLogin("sign-in-required");
    }
  });

  window.addEventListener("resize", ensureIosBackButton);
  window.addEventListener("pageshow", ensureIosBackButton);
})();
