(function () {
  const path = (window.location.pathname || "/").toLowerCase();

  const PRIMARY_LINKS = [
    { href: "/vision", label: "Vision", key: "vision" },
    { href: "/features", label: "Features", key: "features" },
    { href: "/how-it-works", label: "How it Works", key: "how-it-works" },
    { href: "/pricing", label: "Pricing", key: "pricing" },
    { href: "/about", label: "About", key: "about" }
  ];

  const SIGN_IN_LINKS = [
    { href: "/donor/login", label: "Donor Login" },
    { href: "/parish/login", label: "Parish Login" },
    { href: "/admin/login", label: "Admin Login" }
  ];

  function activeKeyFromPath() {
    if (path === "/vision" || path.endsWith("/vision.html")) return "vision";
    if (path === "/features" || path.endsWith("/features.html")) return "features";
    if (path === "/how-it-works" || path.endsWith("/how-it-works.html")) return "how-it-works";
    if (path === "/pricing" || path.endsWith("/pricing.html")) return "pricing";
    if (path === "/about" || path.endsWith("/about.html")) return "about";
    return "";
  }

  function firstExistingHeader() {
    let node = document.querySelector("header.site-header, header[data-site-header], nav.site-header");
    if (node) return node;

    node = document.querySelector("body > nav");
    if (node) return node;

    return null;
  }

  function firstExistingFooter() {
    let node = document.querySelector("footer.site-footer, footer[data-site-footer]");
    if (node) return node;

    const all = document.querySelectorAll("body > footer");
    if (all.length) return all[all.length - 1];

    return null;
  }

  function buildHeader(activeKey) {
    const linkMarkup = PRIMARY_LINKS.map((item) => {
      const current = item.key === activeKey ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${current}>${item.label}</a>`;
    }).join("");

    const signInItems = SIGN_IN_LINKS.map((item) =>
      `<a href="${item.href}">${item.label}</a>`
    ).join("");

    return `
      <header class="agp-site-header" data-agp-site-header>
        <div class="agp-nav-wrap">
          <a class="agp-brand" href="/" aria-label="AGAPAY home">
            <span class="agp-brand-mark"><img src="/mark.png" alt="AGAPAY mark" /></span>
            <span class="agp-brand-wordmark">
              <strong>AGAPAY</strong>
              <span>Love how you give</span>
            </span>
          </a>

          <nav class="agp-desktop-links" aria-label="Primary">
            ${linkMarkup}
          </nav>

          <div class="agp-actions">
            <a class="agp-give-btn" href="/donor/login">Give</a>
            <div class="agp-signin" data-agp-signin>
              <button class="nav-avatar" type="button" aria-label="Sign in" aria-haspopup="true" aria-expanded="false">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="4"></circle>
                  <path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6"></path>
                </svg>
              </button>
              <div class="agp-signin-menu" role="menu">
                ${signInItems}
              </div>
            </div>
            <button class="agp-mobile-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-agp-mobile-toggle>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="4" y1="7" x2="20" y2="7"></line>
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="4" y1="17" x2="20" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="agp-mobile-menu" data-agp-mobile-menu>
          ${linkMarkup}
          <details class="agp-mobile-signin">
            <summary>Sign in &#9662;</summary>
            <div class="agp-mobile-signin-links">
              ${signInItems}
            </div>
          </details>
        </div>
      </header>
    `;
  }

  function buildFooter() {
    return `
      <footer class="agp-site-footer" data-agp-site-footer>
        <div class="agp-footer-wrap">
          <div class="agp-footer-grid">
            <div class="agp-footer-brand">
              <a class="agp-brand" href="/" aria-label="AGAPAY home">
                <span class="agp-brand-mark"><img src="/mark.png" alt="AGAPAY mark" /></span>
                <span class="agp-brand-wordmark">
                  <strong>AGAPAY</strong>
                  <span>Love how you give</span>
                </span>
              </a>
              <p class="agp-footer-tagline">Love how you give.</p>
            </div>

            <div class="agp-footer-col">
              <h4>Platform</h4>
              <a href="/features">Features</a>
              <a href="/how-it-works">How it Works</a>
              <a href="/pricing">Pricing</a>
            </div>

            <div class="agp-footer-col">
              <h4>Company</h4>
              <a href="/about">About</a>
              <a href="/why">Why AGAPAY</a>
              <a href="/vision">Vision</a>
              <a href="/contact">Contact</a>
            </div>

            <div class="agp-footer-col">
              <h4>Account</h4>
              <a href="/donor/login">Donor Login</a>
              <a href="/parish/login">Parish Login</a>
              <a href="/admin/login">Admin Login</a>
            </div>

            <div class="agp-footer-col">
              <h4>Legal</h4>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
            </div>
          </div>

          <div class="agp-footer-bottom">
            <span>&copy; 2026 AGAPAY. All rights reserved.</span>
            <span>Built for Orthodox communities.</span>
          </div>
        </div>
      </footer>
    `;
  }

  function bindInteractions() {
    const signIn = document.querySelector("[data-agp-signin]");
    if (signIn) {
      const btn = signIn.querySelector(".nav-avatar");
      if (btn) {
        btn.addEventListener("click", function () {
          const open = signIn.classList.toggle("open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      }
      document.addEventListener("click", function (event) {
        if (!signIn.contains(event.target)) {
          signIn.classList.remove("open");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    }

    const menuToggle = document.querySelector("[data-agp-mobile-toggle]");
    const mobileMenu = document.querySelector("[data-agp-mobile-menu]");
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener("click", function () {
        const open = mobileMenu.classList.toggle("open");
        menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.body && document.body.dataset.noSiteChrome === "true") return;

    const activeKey = activeKeyFromPath();
    const headerHtml = buildHeader(activeKey);
    const footerHtml = buildFooter();

    const oldHeader = firstExistingHeader();
    if (oldHeader) {
      oldHeader.insertAdjacentHTML("beforebegin", headerHtml);
      oldHeader.remove();
    } else {
      document.body.insertAdjacentHTML("afterbegin", headerHtml);
    }

    const oldFooter = firstExistingFooter();
    if (oldFooter) {
      oldFooter.insertAdjacentHTML("beforebegin", footerHtml);
      oldFooter.remove();
    } else {
      document.body.insertAdjacentHTML("beforeend", footerHtml);
    }

    document.body.classList.add("agp-shell-ready");
    bindInteractions();
  });
})();
