(function () {
  window.agapayTurnstileToken = "";

  function renderTurnstile(siteKey) {
    if (!window.turnstile || !siteKey) return;
    document.querySelectorAll("[data-agapay-turnstile]").forEach((target) => {
      if (target.dataset.rendered === "true") return;
      target.dataset.rendered = "true";
      window.turnstile.render(target, {
        sitekey: siteKey,
        callback: (token) => { window.agapayTurnstileToken = token || ""; },
        "expired-callback": () => { window.agapayTurnstileToken = ""; },
        "error-callback": () => { window.agapayTurnstileToken = ""; }
      });
    });
  }

  async function initAgaPaySecurity() {
    try {
      const response = await fetch("/api/security/config", { headers: { Accept: "application/json" } });
      const config = await response.json();
      if (!config.turnstileEnabled || !config.turnstileSiteKey) return;
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => renderTurnstile(config.turnstileSiteKey);
      document.head.appendChild(script);
    } catch {
      window.agapayTurnstileToken = "";
    }
  }

  window.agapaySecurityPayload = function () {
    return { turnstileToken: window.agapayTurnstileToken || "" };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAgaPaySecurity);
  } else {
    initAgaPaySecurity();
  }
})();
