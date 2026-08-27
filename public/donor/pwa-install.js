(function () {
  const DISMISS_KEY = "agapay_pwa_install_dismissed";
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIosSafari() {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    return isIos && isSafari;
  }

  function dismissed() {
    return localStorage.getItem(DISMISS_KEY) === "1";
  }

  function dismissInstallCard() {
    localStorage.setItem(DISMISS_KEY, "1");
    const card = document.getElementById("pwaInstallCard");
    if (card) card.hidden = true;
  }

  function showInstallCard(mode) {
    if (isStandalone() || dismissed()) return;
    const card = document.getElementById("pwaInstallCard");
    const androidButton = document.getElementById("pwaInstallButton");
    const iosInstructions = document.getElementById("pwaIosInstructions");
    if (!card) return;
    card.hidden = false;
    if (androidButton) androidButton.hidden = mode !== "android";
    if (iosInstructions) iosInstructions.hidden = mode !== "ios";
  }

  // Service worker registration is handled centrally by /pwa-register.js
  // to avoid duplicate registrations across pages that include this file.

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallCard("android");
  });

  window.addEventListener("appinstalled", dismissInstallCard);

  document.addEventListener("DOMContentLoaded", () => {
    const installButton = document.getElementById("pwaInstallButton");
    const dismissButton = document.getElementById("pwaInstallDismiss");

    if (installButton) {
      installButton.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        if (choice?.outcome === "accepted") dismissInstallCard();
      });
    }

    if (dismissButton) dismissButton.addEventListener("click", dismissInstallCard);
    if (isIosSafari()) showInstallCard("ios");
  });
})();
