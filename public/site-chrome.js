(function () {
  const path = (window.location.pathname || "/").toLowerCase();
  const hash = (window.location.hash || "").toLowerCase();
  const isHomepage = path === "/" || path === "/index.html";
  if (/^\/(?:admin|parish|donor|myagapay)(?:\/|$)/.test(path)) return;

  void import('/attribution.js').catch(() => {});

  const PRIMARY_LINKS = [
    { href: "/give", label: "Platform", key: "platform" },
    { href: "/about", label: "About", key: "about" },
    { href: "/contact", label: "Contact", key: "contact" }
  ];

  const SIGN_IN_LINKS = [
    { href: "/myagapay/login", label: "My AGAPAY" },
    { href: "/give/login", label: "Parish Dashboard" },
    { href: "/myagapay/login?next=%2Fmyagapay%2Flearn%2Fdashboard", label: "AGAPAY Learn" }
  ];

  // Official AGAPAY profiles shared by the public-site footer.
  const SOCIAL_ACCOUNTS = [
    { platform: "facebook", href: "https://www.facebook.com/profile.php?id=61590403694587" },
    { platform: "instagram", href: "https://www.instagram.com/agapayapp/" },
    { platform: "youtube", href: "https://www.youtube.com/@agapayapp" },
    { platform: "x", href: "https://x.com/AGAPAYapp" }
  ];
  const SOCIAL_PLATFORMS = {
    facebook: { label: "Facebook", icon: '<path d="M14 21v-8h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5A25 25 0 0 0 15 1c-3 0-5 1.8-5 5v3H7v4h3v8z" />' },
    instagram: { label: "Instagram", icon: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2"/>' },
    linkedin: { label: "LinkedIn", icon: '<path d="M4 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM2 9h4v12H2zm7 0h4v1.7c.6-1 1.7-2 3.7-2 4 0 4.3 2.6 4.3 6V21h-4v-5.6c0-1.6 0-3.4-2-3.4s-2 1.7-2 3.3V21H9z"/>' },
    youtube: { label: "YouTube", icon: '<path fill-rule="evenodd" d="M21.6 6.2C21.3 5 20.4 4.2 19.2 4 17.5 3.7 12 3.7 12 3.7S6.5 3.7 4.8 4C3.6 4.2 2.7 5 2.4 6.2 2 8 2 12 2 12s0 4 .4 5.8c.3 1.2 1.2 2 2.4 2.2 1.7.3 7.2.3 7.2.3s5.5 0 7.2-.3c1.2-.2 2.1-1 2.4-2.2C22 16 22 12 22 12s0-4-.4-5.8zM10 8.5l6 3.5-6 3.5z"/>' },
    x: { label: "X", icon: '<path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.5L.8 2h6.5l4.5 6.7zM17.9 20h1.7L6.3 4H4.5z"/>' }
  };

  function buildSocialLinks() {
    const links = SOCIAL_ACCOUNTS.map(({ platform, href }) => {
      const account = SOCIAL_PLATFORMS[platform];
      if (!account || !href || !href.startsWith("https://")) return "";
      const safeHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" aria-label="AGAPAY on ${account.label} (opens in a new tab)" title="AGAPAY on ${account.label}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${account.icon}</svg></a>`;
    }).join("");
    return links ? `<nav class="footer-social" aria-label="Follow AGAPAY">${links}</nav>` : "";
  }

  function activeKeyFromPath() {
    if (path === "/" || path === "/index.html") return "";
    if (path === "/give" || path === "/give/") {
      if (["#pricing", "#security", "#platform"].includes(hash)) return hash.slice(1);
      return "platform";
    }
    if (path === "/give/request-demo" || path.endsWith("/give/request-demo.html")) return "demo";
    if (path === "/contact" || path.endsWith("/contact.html")) return "contact";
    if (path === "/about" || path.endsWith("/about.html")) return "about";
    if (path === "/learn" || path === "/learn/" || path.startsWith("/learn/")) return "learn";
    if (path === "/design" || path.endsWith("/design.html")) return "design";
    if (path === "/marketplace" || path.endsWith("/marketplace.html")) return "marketplace";
    if (path === "/directory" || path.endsWith("/directory.html")) return "directory";
    return "";
  }

  function firstExistingHeader() {
    return document.querySelector("header.site-header, header[data-site-header], nav.site-header, body > nav");
  }

  function firstExistingFooter() {
    const footer = document.querySelector("footer.site-footer, footer[data-site-footer], body > footer");
    if (footer) return footer;
    return null;
  }

  function navLink(item, activeKey) {
    const active = item.key === activeKey ? "active" : "";
    const current = item.key === activeKey ? ' aria-current="page"' : "";
    return `<a class="${active}" href="${item.href}"${current}>${item.label}</a>`;
  }

  function shellIcon(id) {
    return `<svg aria-hidden="true"><use href="/images/icons/agapay-icons.svg#${id}"></use></svg>`;
  }

  function buildHeader(activeKey) {
    return `
      <header class="site-header" data-shell="canonical">
        <nav class="nav" aria-label="Primary navigation">
          <a class="brand" href="/" aria-label="AGAPAY home">
            <span class="brand-mark"><img src="/mark.png" alt="" /></span>
            <span class="brand-name">
              <strong>AGAPAY</strong>
              <span class="brand-tagline" aria-label="Love how you give, serve, and live">Love how you <span class="flip-word" data-flip-word aria-hidden="true">GIVE</span></span>
            </span>
          </a>

          <div class="nav-links">
            ${PRIMARY_LINKS.map((item) => navLink(item, activeKey)).join("")}
          </div>

          <div class="nav-actions">
            <a class="btn-demo${activeKey === "demo" ? " active" : ""}" href="/give/request-demo"${activeKey === "demo" ? ' aria-current="page"' : ""}>
              Request a Demo
            </a>
            <a class="btn-donate" href="/register">
              Start for free
            </a>

            <div class="signin-wrap">
              <button class="nav-avatar" id="signinBtn" type="button" aria-label="Sign in" aria-expanded="false">
                ${shellIcon("user")}
              </button>
              <div class="signin-menu" id="signinMenu" role="menu">
                ${SIGN_IN_LINKS.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
              </div>
            </div>
          </div>

          <button class="mobile-menu-btn" id="mobileMenuBtn" type="button" aria-label="Open navigation" aria-expanded="false">
            ${shellIcon("menu")}
          </button>
        </nav>
      </header>

      <div class="drawer-backdrop" data-shell="canonical" id="drawerBackdrop"></div>
      <aside class="mobile-drawer" data-shell="canonical" id="mobileDrawer" aria-label="Mobile navigation">
        <div class="drawer-head">
          <strong class="drawer-title">AGAPAY</strong>
          <button class="drawer-close" id="drawerCloseBtn" type="button" aria-label="Close menu">
            ${shellIcon("close")}
          </button>
        </div>
        <div class="drawer-scroll">
          <nav class="drawer-links" aria-label="Drawer navigation">
            ${PRIMARY_LINKS.map((item) => navLink(item, activeKey)).join("")}
          </nav>
          <div class="drawer-actions">
            <a class="drawer-demo" href="/give/request-demo">Request a Demo</a>
            <a class="drawer-join" href="/register">Start for free</a>
          </div>
          <div class="drawer-divider"></div>
          <nav class="drawer-links" aria-label="Sign in options">
            ${SIGN_IN_LINKS.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
          </nav>
        </div>
      </aside>
    `;
  }

  function buildFooter() {
    return `
      <footer class="site-footer" data-shell="canonical">
        <div class="footer-inner">
          <div class="footer-grid">
            <div class="footer-brand">
              <div class="footer-lockup">
                <img src="/mark.png" alt="" />
                <span class="fl-name">
                  <strong>AGAPAY</strong>
                </span>
              </div>
              ${buildSocialLinks()}
            </div>
            <nav class="footer-col" aria-label="Platform">
              <h4>Platform</h4>
              <a href="/">AGAPAY Platform</a>
              <a href="/give">AGAPAY Give</a>
              <a href="/learn">AGAPAY Learn</a>
              <a href="/design">AGAPAY Design</a>
              ${isHomepage ? "" : '<a href="/marketplace">Marketplace</a><a href="/directory">Directory</a>'}
              <a href="/register">Start for free</a>
            </nav>
            <nav class="footer-col" aria-label="AGAPAY Give">
              <h4>Give</h4>
              <a href="/give">Overview</a>
              <a href="/give#platform">Platform</a>
              <a href="/give#pricing">Pricing</a>
              <a href="/give#security">Security</a>
              <a href="/give#how-it-works">How It Works</a>
              <a href="/give#parish-council">Parish Council</a>
              <a href="/give#why">Why AGAPAY Give</a>
            </nav>
            <nav class="footer-col" aria-label="AGAPAY Learn">
              <h4>Learn</h4>
              <a href="/learn">Overview</a>
              <a href="/learn/pricing">Pricing</a>
            </nav>
            <nav class="footer-col" aria-label="Company">
              <h4>Company</h4>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
            <nav class="footer-col" aria-label="Account">
              <h4>Account</h4>
              <a href="/myagapay/login">My AGAPAY</a>
              <a href="/give/login">Parish Dashboard</a>
            </nav>
            <nav class="footer-col" aria-label="Legal">
              <h4>Legal</h4>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
            </nav>
          </div>
          <div class="footer-bottom">
            <span>&copy; 2026 AGAPAY. All rights reserved.</span>
            <span>Built for Orthodox communities.</span>
          </div>
        </div>
      </footer>
    `;
  }

  function bindInteractions() {
    const body = document.body;
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const drawerBackdrop = document.getElementById("drawerBackdrop");
    const drawerCloseBtn = document.getElementById("drawerCloseBtn");
    const signinBtn = document.getElementById("signinBtn");
    const signinMenu = document.getElementById("signinMenu");

    function setDrawer(open) {
      body.classList.toggle("drawer-open", open);
      if (mobileMenuBtn) mobileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setDrawer(!body.classList.contains("drawer-open"));
    }, true);
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", function () { setDrawer(false); });
    if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", function () { setDrawer(false); });

    document.querySelectorAll("#mobileDrawer a").forEach(function (anchor) {
      anchor.addEventListener("click", function () { setDrawer(false); });
    });

    if (signinBtn && signinMenu) {
      signinBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        const open = signinMenu.classList.toggle("open");
        signinBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });

      document.addEventListener("click", function () {
        signinMenu.classList.remove("open");
        signinBtn.setAttribute("aria-expanded", "false");
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setDrawer(false);
        if (signinMenu) signinMenu.classList.remove("open");
        if (signinBtn) signinBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initFlipTaglines() {
    const words = ["GIVE", "SERVE", "LIVE"];
    const nodes = Array.from(document.querySelectorAll("[data-flip-word]"));
    if (!nodes.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let index = 0;
    window.setInterval(() => {
      index = (index + 1) % words.length;
      nodes.forEach((node) => {
        node.classList.add("is-flipping");
        window.setTimeout(() => {
          node.textContent = words[index];
          node.classList.remove("is-flipping");
        }, 190);
      });
    }, 1800);
  }

  function initPageReveal(activeKey) {
    if (!["why", "vision", "features", "pricing", "how", "security", "about"].includes(activeKey)) return;

    const selectors = [
      ".hero-copy",
      ".hero-art",
      ".feat-hero > *",
      ".pricing-hero > *",
      ".values .value",
      ".phase-card",
      ".eco-statement",
      ".eco-trust-item",
      ".mission-copy",
      ".mission-photo",
      ".cta-shell",
      ".section",
      ".comparison",
      ".stat-card",
      ".feature-card",
      ".tier-card",
      ".fee-banner",
      ".lower-grid > *",
      ".faq-section",
      ".closing-cta",
      ".belief-card",
      ".story-card",
      ".need-card",
      ".vision-card",
      ".founder-card"
    ];

    const targets = Array.from(document.querySelectorAll(selectors.join(",")))
      .filter((element) => !element.closest(".site-header, .site-footer, .mobile-drawer"))
      .filter((element, index, list) => list.indexOf(element) === index);

    if (!targets.length) return;

    targets.forEach((element, index) => {
      if (!element.classList.contains("reveal")) {
        element.classList.add("agp-reveal");
        if (index % 4) element.classList.add(`agp-reveal-delay-${index % 4}`);
      }
    });

    const revealTargets = targets.filter((element) => element.classList.contains("agp-reveal"));
    if (!revealTargets.length) return;

    if (!("IntersectionObserver" in window)) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    revealTargets.forEach((element) => observer.observe(element));
  }

  function removeLegacyMobileChrome() {
    document.querySelectorAll(".site-mobile-drawer-backdrop, .site-mobile-drawer, .mobile-nav-drawer").forEach(function (node) {
      node.remove();
    });

    document.querySelectorAll(".drawer-backdrop, .mobile-drawer").forEach(function (node) {
      if (node.id === "drawerBackdrop" || node.id === "mobileDrawer") return;
      node.remove();
    });
  }

  function restoreInitialAnchorAfterChrome() {
    const initialHash = window.location.hash;
    if (!initialHash || initialHash.length < 2) return;
    let anchorId = initialHash.slice(1);
    try { anchorId = decodeURIComponent(anchorId); } catch {}
    const target = document.getElementById(anchorId);
    if (!target) return;
    const align = function () {
      if (window.location.hash === initialHash) target.scrollIntoView({ block: "start" });
    };
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(align);
    });
    if (document.fonts?.ready) document.fonts.ready.then(align).catch(function () {});
  }

  function initSiteChrome() {
    if (document.body && document.body.dataset.noSiteChrome === "true") return;

    removeLegacyMobileChrome();

    const activeKey = activeKeyFromPath();
    const headerHtml = buildHeader(activeKey);
    const footerHtml = buildFooter();
    const oldHeader = firstExistingHeader();
    const oldFooter = firstExistingFooter();

    if (oldHeader) {
      oldHeader.insertAdjacentHTML("beforebegin", headerHtml);
      oldHeader.remove();
    } else {
      document.body.insertAdjacentHTML("afterbegin", headerHtml);
    }

    if (oldFooter) {
      oldFooter.insertAdjacentHTML("beforebegin", footerHtml);
      oldFooter.remove();
    } else {
      document.body.insertAdjacentHTML("beforeend", footerHtml);
    }

    document.body.classList.add("agp-shell-ready");
    initPageReveal(activeKey);
    initFlipTaglines();
    bindInteractions();
    restoreInitialAnchorAfterChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteChrome, { once: true });
  } else {
    initSiteChrome();
  }
})();
