(function () {
  const path = (window.location.pathname || "/").toLowerCase();
  if (/^\/(?:admin|parish|donor)(?:\/|$)/.test(path)) return;

  const PRIMARY_LINKS = [
    { href: "/giving", label: "AGAPAY Giving", key: "give" },
    { href: "/learn/pricing", label: "AGAPAY Learn", key: "learn" },
    { href: "/marketplace", label: "Marketplace", key: "marketplace" },
    { href: "/directory", label: "Directory", key: "directory" },
    { href: "/about", label: "About", key: "about" }
  ];

  const SIGN_IN_LINKS = [
    { href: "/donor/login", label: "Stewardship Dashboard" },
    { href: "/parish/login", label: "Organization Dashboard" }
  ];

  function activeKeyFromPath() {
    if (path === "/why" || path.endsWith("/why.html")) return "why";
    if (path === "/vision" || path.endsWith("/vision.html")) return "vision";
    if (path === "/features" || path.endsWith("/features.html")) return "give";
    if (path === "/pricing" || path.endsWith("/pricing.html")) return "pricing";
    if (path === "/how-it-works" || path.endsWith("/how-it-works.html")) return "how";
    if (path === "/about" || path.endsWith("/about.html") || path === "/contact" || path.endsWith("/contact.html")) return "about";
    if (path === "/giving" || path.endsWith("/giving/index.html") || path.startsWith("/giving/") || path === "/give" || path.endsWith("/give/index.html") || path.startsWith("/give/")) return "give";
    if (path === "/learn" || path === "/learn/" || path.startsWith("/learn/")) return "learn";
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
              <span>Love how you give</span>
            </span>
          </a>

          <div class="nav-links">
            ${PRIMARY_LINKS.map((item) => navLink(item, activeKey)).join("")}
          </div>

          <div class="nav-actions">
            <a class="btn-donate ${activeKey === "give" ? "active" : ""}" href="/register">
              ${shellIcon("heart-give")}
              Get Started
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
          <a class="drawer-join" href="/register">
            ${shellIcon("heart-give")}
            Get Started
          </a>
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
                  <span class="fl-tag">Love how you give</span>
                </span>
              </div>
            </div>
            <nav class="footer-col" aria-label="Platform">
              <h4>Platform</h4>
              <a href="/giving">AGAPAY Giving</a>
              <a href="/learn/pricing">AGAPAY Learn</a>
              <a href="/marketplace">Marketplace</a>
              <a href="/directory">Directory</a>
            </nav>
            <nav class="footer-col" aria-label="AGAPAY Giving">
              <h4>Giving</h4>
              <a href="/features">Features</a>
              <a href="/how-it-works">How It Works</a>
              <a href="/pricing">Pricing</a>
              <a href="/register">Register</a>
            </nav>
            <nav class="footer-col" aria-label="Company">
              <h4>Company</h4>
              <a href="/about">About</a>
              <a href="/why">Why AGAPAY</a>
              <a href="/vision">Vision</a>
              <a href="/contact">Contact</a>
            </nav>
            <nav class="footer-col" aria-label="Account">
              <h4>Account</h4>
              <a href="/donor/login">Stewardship Dashboard</a>
              <a href="/parish/login">Organization Dashboard</a>
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

  function initPageReveal(activeKey) {
    if (!["why", "vision", "features", "pricing", "how", "about"].includes(activeKey)) return;

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
    bindInteractions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteChrome, { once: true });
  } else {
    initSiteChrome();
  }
})();
