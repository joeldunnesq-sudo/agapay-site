const AGAPAY_CACHE = "agapay-static-v34";

const STATIC_ASSETS = [
  "/myagapay/login",
  "/donor/login.html",
  "/donor/style.css",
  "/donor/app.js",
  "/donor/pwa-install.js",
  "/scripts/consumer-passkeys.js",
  "/styles/numbers.css",
  "/styles/consumer-passkeys.css",
  "/myagapay/manifest.webmanifest",
  "/mark.png",
  "/pwa-register.js",
  "/myagapay/login.html",
  "/myagapay/index.html",
  "/myagapay/teaching",
  "/myagapay/teaching.html",
  "/myagapay/teaching.js",
  "/favicons/favicon-32x32.png",
  "/images/app/apple-touch-icon-blue.png",
  "/images/app/icon-192.png",
  "/images/app/icon-512.png",
  "/images/app/icon-512-maskable.png",
  "/images/app/shortcuts/give.png",
  "/images/app/shortcuts/today.png",
  "/images/app/shortcuts/directory.png",
  "/images/app/shortcuts/bookstore.png",
  "/images/app/shortcuts/give-v2.png",
  "/images/app/shortcuts/today-v2.png",
  "/images/app/shortcuts/directory-v2.png",
  "/images/app/shortcuts/bookstore-v2.png",
  "/images/app/listen-icon-192.png",
  "/listen.html",
  "/listen/app.js",
  "/listen/player.js",
  "/listen/db.js",
  "/listen/opml.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(AGAPAY_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== AGAPAY_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function shouldBypassCache(request) {
  const url = new URL(request.url);
  const isOfflinePodcastShell = url.pathname === "/myagapay/teaching" || url.pathname === "/myagapay/teaching.html";
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/admin")) return true;
  if (url.pathname.startsWith("/parish")) return true;
  if (url.pathname.startsWith("/myagapay") && url.pathname !== "/myagapay/login" && !isOfflinePodcastShell) return true;

  // Donor dashboard pages and API-backed pages are intentionally network-only.
  // The PWA only caches the unauthenticated login shell and static assets so no
  // private giving history, tokens, or authenticated responses are stored.
  if (url.pathname === "/donor" || url.pathname === "/donor/" || url.pathname === "/donor/dashboard") return true;
  if (
    url.pathname.startsWith("/donor/") &&
    !["/myagapay/login", "/donor/login", "/donor/login.html", "/donor/style.css", "/donor/app.js", "/donor/pwa-install.js"].includes(url.pathname)
  ) {
    return true;
  }
  return false;
}

function isStaticShellAsset(pathname) {
  return STATIC_ASSETS.includes(pathname)
    || pathname.startsWith("/listen/")
    || pathname.startsWith("/favicons/")
    || pathname.startsWith("/images/app/")
    || pathname.startsWith("/styles/")
    || pathname === "/myagapay/manifest.webmanifest"
    || pathname === "/mark.png";
}

function isVersionedStaticAsset(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.searchParams.has("v")) return false;
  return url.pathname === "/donor/style.css"
    || url.pathname === "/donor/app.js"
    || url.pathname === "/scripts/consumer-passkeys.js"
    || url.pathname === "/myagapay-shell.js"
    || url.pathname === "/liturgical-calendar.js"
    || url.pathname.startsWith("/myagapay/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Versioned app assets are immutable by URL. Serve them cache-first so every
  // full-page My AGAPAY navigation reuses the shared 500+ KB shell instantly.
  if (isVersionedStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(AGAPAY_CACHE).then((cache) => cache.put(request, clone));
        return response;
      }))
    );
    return;
  }

  if (shouldBypassCache(request)) return;

  if (request.mode === "navigate" && (url.pathname === "/myagapay/login" || url.pathname === "/donor/login" || url.pathname === "/donor/login.html" || url.pathname === "/listen" || url.pathname === "/listen.html" || url.pathname === "/myagapay/teaching" || url.pathname === "/myagapay/teaching.html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(AGAPAY_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || (url.pathname.startsWith("/myagapay/teaching") ? caches.match("/myagapay/teaching.html") : caches.match("/donor/login.html"))))
    );
    return;
  }

  if (isStaticShellAsset(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(AGAPAY_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener("push", (event) => {
  let notification = {};
  try {
    notification = event.data ? event.data.json() : {};
  } catch {
    notification = { body: event.data ? event.data.text() : "" };
  }
  const title = String(notification.title || "My AGAPAY");
  event.waitUntil(self.registration.showNotification(title, {
    body: String(notification.body || "You have a new parish update."),
    icon: "/images/app/icon-192.png",
    badge: "/favicons/favicon-32x32.png",
    tag: String(notification.tag || "myagapay-update"),
    data: { url: String(notification.url || "/myagapay/") },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl;
  try {
    targetUrl = new URL(event.notification.data?.url || "/myagapay/", self.location.origin);
    if (targetUrl.origin !== self.location.origin || !targetUrl.pathname.startsWith("/myagapay")) {
      targetUrl = new URL("/myagapay/", self.location.origin);
    }
  } catch {
    targetUrl = new URL("/myagapay/", self.location.origin);
  }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find(client => new URL(client.url).origin === targetUrl.origin);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(targetUrl.href);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl.href);
  }));
});
