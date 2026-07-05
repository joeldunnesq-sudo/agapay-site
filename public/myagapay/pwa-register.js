/*
 * Shared AGAPAY service worker registration.
 * Include on any page with: <script src="/pwa-register.js" defer></script>
 *
 * - Registers /service-worker.js with scope "/"
 * - If a registration already exists (from this script or any other),
 *   calls update() instead of registering again
 * - Never throws: registration/update failures are swallowed
 * - Idempotent per page load: safe even if included more than once
 */
(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;
  if (window.__agapaySwRegisterStarted) return;
  window.__agapaySwRegisterStarted = true;

  function registerOrUpdate() {
    navigator.serviceWorker
      .getRegistration("/")
      .then(function (existing) {
        if (existing) {
          existing.update().catch(function () {});
          return;
        }
        navigator.serviceWorker
          .register("/service-worker.js", { scope: "/" })
          .catch(function () {});
      })
      .catch(function () {});
  }

  if (document.readyState === "complete") {
    registerOrUpdate();
  } else {
    window.addEventListener("load", registerOrUpdate, { once: true });
  }
})();
