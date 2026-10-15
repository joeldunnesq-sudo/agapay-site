// Generated from src/browser/pwa-register.ts by npm run build:browser. Do not edit.
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  if (window.__agapaySwRegisterStarted) return;
  window.__agapaySwRegisterStarted = true;
  function registerOrUpdate() {
    navigator.serviceWorker
      .getRegistration('/')
      .then(function (existing) {
        if (existing) {
          existing.update().catch(function () {});
          return;
        }
        navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(function () {});
      })
      .catch(function () {});
  }
  registerOrUpdate();
})();
