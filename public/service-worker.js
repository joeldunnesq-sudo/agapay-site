const AGAPAY_CACHE = "agapay-static-v3";

const STATIC_ASSETS = [
  "/donor/login",
  "/donor/login.html",
  "/donor/style.css",
  "/donor/app.js",
  "/donor/pwa-install.js",
  "/styles/numbers.css",
  "/manifest.webmanifest",
  "/mark.png",
  "/favicons/favicon-32x32.png",
  "/images/app/apple-touch-icon.png",
  "/images/app/icon-192.png",
  "/images/app/icon-512.png",
  "/images/app/icon-512-maskable.png"
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
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/admin")) return true;
  if (url.pathname.startsWith("/parish")) return true;

  // Donor dashboard pages and API-backed pages are intentionally network-only.
  // The PWA only caches the unauthenticated login shell and static assets so no
  // private giving history, tokens, or authenticated responses are stored.
  if (url.pathname === "/donor" || url.pathname === "/donor/" || url.pathname === "/donor/dashboard") return true;
  if (
    url.pathname.startsWith("/donor/") &&
    !["/donor/login", "/donor/login.html", "/donor/style.css", "/donor/app.js", "/donor/pwa-install.js"].includes(url.pathname)
  ) {
    return true;
  }
  return false;
}

function isStaticShellAsset(pathname) {
  return STATIC_ASSETS.includes(pathname)
    || pathname.startsWith("/favicons/")
    || pathname.startsWith("/images/app/")
    || pathname.startsWith("/styles/")
    || pathname === "/manifest.webmanifest"
    || pathname === "/mark.png";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (shouldBypassCache(request)) return;

  if (request.mode === "navigate" && (url.pathname === "/donor/login" || url.pathname === "/donor/login.html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(AGAPAY_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/donor/login.html")))
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
