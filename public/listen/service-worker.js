/**
 * AGAPAY Listen — Scoped Service Worker
 * Manages caching and offline audio streaming for the Listen app environment.
 */

const CACHE_NAME = 'agapay-listen-v1';
const ASSETS_TO_CACHE = [
  '/listen/',
  '/index.html', 
  '/listen/app.js',
  '/listen/player.js',
  '/listen/db.js',
  '/listen/opml.js'
];

// 1. Install Event — Establish isolated cache records
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event — Clean up older Listen versions without touching the root PWA
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('agapay-listen-')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event — Intercept traffic only inside the /listen/ boundary
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept requests belonging to the listen subfolder scope
  if (url.pathname.startsWith('/listen/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request);
      })
    );
  }
});
