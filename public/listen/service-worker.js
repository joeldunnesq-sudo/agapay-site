// Generated from src/browser/listen/service-worker.ts by npm run build:browser. Do not edit.
const CACHE_NAME = 'agapay-listen-v2';
const ASSETS_TO_CACHE = [
  '/listen/',
  '/index.html',
  '/listen/app.js',
  '/listen/player.js',
  '/listen/db.js',
  '/listen/opml.js',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME && key.startsWith('agapay-listen-')) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/listen/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request);
      })
    );
  }
});
