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
    learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M4 5.5V22"/><path d="M8 6h8"/><path d="M8 10h7"/></svg>',
    market: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 13H7z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>'
  };

  const products = [
    { id: "home", href: "/myagapay", label: "My AGAPAY", icon: icons.home },
    { id: "giving", href: "/myagapay/giving", label: "Give", icon: icons.give },
    { id: "learn", href: "/myagapay/learn", label: "Learn", icon: icons.learn },
    { id: "market", href: "/marketplace", label: "Market", icon: icons.market },
    { id: "account", href: "/myagapay/account", label: "Account", icon: icons.account }
  ];

  function activeProduct(pathname = window.location.pathname) {
    if (pathname.startsWith("/myagapay/learn")) return "learn";
    if (pathname.startsWith("/myagapay/giving")) return "giving";
    if (pathname.startsWith("/myagapay/account")) return "account";
    if (pathname.startsWith("/marketplace")) return "market";
    return "home";
  }

  function productNav(active = activeProduct(), className = "my-agapay-tabbar") {
    return `<nav class="${className}" data-myagapay-global-nav aria-label="My AGAPAY navigation">${products.map((item) => {
      const current = item.id === active;
      return `<a class="${current ? (className === "learn-product-tabbar" ? "is-active" : "active") : ""}" href="${item.href}"${current ? ' aria-current="page"' : ""}>${item.icon}<span>${item.label}</span></a>`;
    }).join("")}</nav>`;
  }

  function normalizeProductNavs(root = document) {
    const active = activeProduct();
    root.querySelectorAll(".my-agapay-tabbar, .mobile-tabbar, .learn-product-tabbar").forEach((nav) => {
      const className = nav.classList.contains("learn-product-tabbar") ? "learn-product-tabbar" : "my-agapay-tabbar";
      const holder = document.createElement("div");
      holder.innerHTML = productNav(active, className);
      nav.replaceWith(holder.firstElementChild);
    });
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
    authHeaders,
    clearSession,
    handleUnauthorized,
    icons,
    isProtectedPath,
    normalizeProductNavs,
    productNav,
    redirectToLogin,
    session
  };

  document.addEventListener("DOMContentLoaded", () => {
    normalizeProductNavs();
    if (isProtectedPath()) {
      const current = session();
      if (!current.email || !current.token) redirectToLogin("sign-in-required");
    }
  });
})();
