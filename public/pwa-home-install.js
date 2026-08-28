(function () {
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

  function installElements() {
    return {
      section: document.getElementById("install-app"),
      button: document.getElementById("homePwaInstallButton"),
      status: document.getElementById("homePwaInstallStatus")
    };
  }

  function highlightStep(platform) {
    document.querySelectorAll("[data-install-step]").forEach((step) => {
      step.classList.toggle("is-highlighted", step.dataset.installStep === platform);
    });
  }

  function setInstallMode(mode) {
    const { section, button, status } = installElements();
    if (!section || !button || !status) return;
    section.dataset.installMode = mode;
    button.disabled = mode === "installed";

    if (mode === "installed") {
      button.textContent = "My AGAPAY is installed";
      status.textContent = "My AGAPAY is already installed on this device.";
      highlightStep("");
      return;
    }
    if (mode === "ready") {
      button.textContent = "Install My AGAPAY";
      status.textContent = "Your browser is ready. Tap Install My AGAPAY to add it to this device.";
      highlightStep("android");
      return;
    }
    if (mode === "ios") {
      button.textContent = "Show iPhone install steps";
      status.textContent = "On iPhone or iPad, use Safari: tap Share, then Add to Home Screen.";
      highlightStep("ios");
      return;
    }
    button.textContent = "Show install steps";
    status.textContent = "Open your browser menu and choose Install app or Add to Home Screen.";
    highlightStep("android");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallMode("ready");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstallMode("installed");
  });

  document.addEventListener("DOMContentLoaded", () => {
    const { button } = installElements();
    if (!button) return;

    if (isStandalone()) setInstallMode("installed");
    else if (isIosSafari()) setInstallMode("ios");
    else if (!deferredInstallPrompt) setInstallMode("manual");

    button.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        if (choice?.outcome === "accepted") setInstallMode("installed");
        else setInstallMode(isIosSafari() ? "ios" : "manual");
        return;
      }
      setInstallMode(isIosSafari() ? "ios" : "manual");
      document.querySelector(".op-install-steps")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
})();
