(function () {
  let deferredInstallPrompt = null;

  function adminInstallButtons() {
    return Array.from(document.querySelectorAll(".admin-install-btn"));
  }

  function showInstallButtons() {
    adminInstallButtons().forEach((button) => {
      button.classList.remove("hidden");
      button.addEventListener("click", promptInstall, { once: false });
    });
  }

  async function promptInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    adminInstallButtons().forEach((button) => button.classList.add("hidden"));
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    adminInstallButtons().forEach((button) => button.classList.add("hidden"));
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }
})();
