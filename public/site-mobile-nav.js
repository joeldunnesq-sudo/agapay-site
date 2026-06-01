(function () {
  const path = window.location.pathname;
  if (/^\/(?:admin|parish|donor)(?:\/|$)/.test(path)) return;

  const links = [
    { href: "/vision", label: "Vision" },
    { href: "/give", label: "Giving" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/directory", label: "Directory" },
    { href: "/how-it-works", label: "Resources" },
    { href: "/about", label: "About" }
  ];

  const nav =
    document.querySelector(".site-header .nav") ||
    document.querySelector(".site-header .wrap.nav") ||
    document.querySelector("nav .nav-inner") ||
    document.querySelector("header nav") ||
    document.querySelector("nav");

  if (!nav) return;

  let toggle = document.querySelector(".mobile-menu-btn, .menu-toggle, .mobile-menu-button, .site-mobile-menu-btn");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.className = "site-mobile-menu-btn";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
    nav.appendChild(toggle);
  }

  let backdrop = document.querySelector(".site-mobile-drawer-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "site-mobile-drawer-backdrop";
    document.body.appendChild(backdrop);
  }

  let drawer = document.getElementById("mobileDrawer") || document.querySelector(".mobile-nav-drawer, .mobile-drawer");
  if (!drawer) {
    drawer = document.createElement("aside");
    drawer.id = "mobileDrawer";
    drawer.className = "site-mobile-drawer";
    drawer.setAttribute("aria-label", "Mobile navigation");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML =
      '<div class="drawer-head"><strong class="drawer-title">Menu</strong><button class="drawer-close" type="button" aria-label="Close menu">x</button></div>' +
      '<div class="drawer-scroll"><nav class="drawer-links" aria-label="Mobile navigation">' +
      links.map(linkHtml).join("") +
      '</nav><a class="drawer-join" href="/register">Join AGAPAY</a></div>';
    document.body.appendChild(drawer);
  } else {
    drawer.classList.add("site-mobile-drawer");
    drawer.setAttribute("aria-label", drawer.getAttribute("aria-label") || "Mobile navigation");
    drawer.setAttribute("aria-hidden", "true");
    if (!drawer.querySelector(".drawer-head")) {
      drawer.insertAdjacentHTML("afterbegin", '<div class="drawer-head"><strong class="drawer-title">Menu</strong><button class="drawer-close" type="button" aria-label="Close menu">x</button></div>');
    }
    if (!drawer.querySelector(".drawer-scroll")) {
      const children = Array.from(drawer.children).filter(child => !child.classList.contains("drawer-head"));
      const scroll = document.createElement("div");
      scroll.className = "drawer-scroll";
      children.forEach(child => scroll.appendChild(child));
      drawer.appendChild(scroll);
    }
    drawer.querySelectorAll("a").forEach(anchor => {
      if (isActive(anchor.getAttribute("href"))) anchor.classList.add("active");
    });
  }

  const closeButton = drawer.querySelector(".drawer-close");

  function linkHtml(item) {
    return '<a href="' + item.href + '" class="' + (isActive(item.href) ? "active" : "") + '">' + item.label + "</a>";
  }

  function isActive(href) {
    if (!href) return false;
    if (href === "/") return path === "/";
    return path === href || path.startsWith(href + "/");
  }

  function openDrawer() {
    document.body.classList.add("drawer-open");
    drawer.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    drawer.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
  }

  window.toggleMenu = function () {
    if (drawer.classList.contains("active") || document.body.classList.contains("drawer-open")) closeDrawer();
    else openDrawer();
  };

  if (!toggle.hasAttribute("onclick")) {
    toggle.addEventListener("click", event => {
      event.preventDefault();
      window.toggleMenu();
    });
  }
  backdrop.addEventListener("click", closeDrawer);
  if (closeButton) closeButton.addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach(anchor => anchor.addEventListener("click", closeDrawer));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDrawer();
  });
})();
