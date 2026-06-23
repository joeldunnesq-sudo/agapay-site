// public/listen/sw.js
const CACHE_NAME = 'agapay-listen-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass network requests through cleanly
  event.respondWith(fetch(event.request));
});
