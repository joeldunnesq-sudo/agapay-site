(function () {
  "use strict";

  function authHeaders() {
    return window.MyAgapayShell?.authHeaders({ "Content-Type": "application/json" }) || {};
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  // Ported from /donor/pwa-install.js so iPadOS desktop-class user agents
  // receive the same install guidance as iPhone and iPad user agents.
  function isIosDevice() {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function base64UrlBytes(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const raw = atob(`${value.replaceAll("-", "+").replaceAll("_", "/")}${padding}`);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  async function pushApi(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: authHeaders(),
      cache: "no-store",
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update notification settings.");
    return data;
  }

  function setStatus(card, message, tone = "") {
    const status = card.querySelector("[data-push-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function renderButtons(card, subscription) {
    const enable = card.querySelector("[data-push-enable]");
    const disable = card.querySelector("[data-push-disable]");
    if (enable) enable.hidden = Boolean(subscription);
    if (disable) disable.hidden = !subscription;
  }

  async function currentRegistration() {
    const existing = await navigator.serviceWorker.getRegistration("/");
    return existing || navigator.serviceWorker.ready;
  }

  async function initializeCard(card) {
    const enable = card.querySelector("[data-push-enable]");
    const disable = card.querySelector("[data-push-disable]");
    const guidance = card.querySelector("[data-push-ios-guidance]");

    if (isIosDevice() && !isStandalone()) {
      if (guidance) guidance.hidden = false;
      if (enable) enable.hidden = true;
      if (disable) disable.hidden = true;
      setStatus(card, "Install My AGAPAY before enabling notifications on this device.", "guidance");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      if (enable) enable.hidden = true;
      setStatus(card, "Push notifications are not supported by this browser.", "muted");
      return;
    }

    let config;
    let registration;
    try {
      [config, registration] = await Promise.all([
        pushApi("/api/donor/push/config"),
        currentRegistration(),
      ]);
      if (!config) return;
      if (!config.configured || !config.publicKey) throw new Error("Push notifications are temporarily unavailable.");
      card.dataset.vapidPublicKey = config.publicKey;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushApi("/api/donor/push/subscribe", {
          method: "POST",
          body: JSON.stringify(subscription.toJSON()),
        });
      }
      renderButtons(card, subscription);
      if (subscription) {
        setStatus(card, "Notifications are enabled on this device.", "success");
      } else if (Notification.permission === "denied") {
        if (enable) enable.disabled = true;
        setStatus(card, "Notifications are blocked in your browser settings.", "muted");
      } else {
        setStatus(card, "Notifications stay off until you choose to enable them.");
      }
    } catch (error) {
      if (enable) enable.disabled = true;
      setStatus(card, error.message || "Push notifications are temporarily unavailable.", "error");
      return;
    }

    enable?.addEventListener("click", async () => {
      enable.disabled = true;
      setStatus(card, "Waiting for your permission…");
      try {
        // This permission request is deliberately inside the user click.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error(permission === "denied"
          ? "Notifications were blocked. You can change this in browser settings."
          : "Notification permission was not granted.");
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlBytes(card.dataset.vapidPublicKey),
        });
        await pushApi("/api/donor/push/subscribe", {
          method: "POST",
          body: JSON.stringify(subscription.toJSON()),
        });
        renderButtons(card, subscription);
        setStatus(card, "Notifications are enabled on this device.", "success");
      } catch (error) {
        setStatus(card, error.message || "Unable to enable notifications.", "error");
      } finally {
        enable.disabled = false;
      }
    });

    disable?.addEventListener("click", async () => {
      disable.disabled = true;
      setStatus(card, "Turning notifications off…");
      try {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await pushApi("/api/donor/push/unsubscribe", {
            method: "POST",
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
        renderButtons(card, null);
        setStatus(card, "Notifications are off on this device.");
      } catch (error) {
        setStatus(card, error.message || "Unable to disable notifications.", "error");
      } finally {
        disable.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-push-notifications]").forEach(card => void initializeCard(card));
  });
})();
