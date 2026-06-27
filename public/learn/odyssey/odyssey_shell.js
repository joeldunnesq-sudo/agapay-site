/**
 * odyssey-shell.js
 * Auth guard and shell utilities for the /learn/odyssey/* portal.
 * Mirrors the session key format of myagapay-shell.js so the same
 * localStorage tokens work across both contexts.
 */
(function () {
  "use strict";

  const EMAIL_KEY      = "agapayDonorEmail";
  const TOKEN_KEY      = "agapayDonorToken";
  const LEARN_PLAN_KEY = "agapay.learn.plan";
  const LOGIN_URL      = "/learn/odyssey/dashboard/login";

  function session() {
    return {
      email: localStorage.getItem(EMAIL_KEY) || "",
      token: localStorage.getItem(TOKEN_KEY) || ""
    };
  }

  function authHeaders(extra = {}) {
    const s = session();
    const headers = { Accept: "application/json", ...extra };
    if (s.token) headers.Authorization = "Bearer " + s.token;
    if (s.email) headers["X-AGAPAY-Donor-Email"] = s.email;
    return headers;
  }

  function clearSession() {
    [EMAIL_KEY, TOKEN_KEY, LEARN_PLAN_KEY].forEach((k) => localStorage.removeItem(k));
  }

  function redirectToLogin(reason) {
    const next  = window.location.pathname + (window.location.search || "");
    const url   = new URL(LOGIN_URL, window.location.origin);
    url.searchParams.set("next", next);
    if (reason) url.searchParams.set("reason", reason);
    clearSession();
    window.location.replace(url.toString());
  }

  function handleUnauthorized(response) {
    if (response?.status !== 401) return false;
    redirectToLogin("session-expired");
    return true;
  }

  // Expose the same surface as MyAgapayShell so dashboard-shell.js works unchanged
  window.MyAgapayShell = {
    authHeaders,
    clearSession,
    handleUnauthorized,
    redirectToLogin,
    session,
    // TEFA portal: no multi-product nav, no account switcher
    productNav: () => "",
    normalizeProductNavs: () => {},
    activeProduct: () => "learn",
    isProtectedPath: () => true,
    icons: {}
  };

  // Guard: require session + learn plan on the main dashboard page
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.learnPage;
    if (!page || page === "login" || page === "activate") return;

    const s = session();
    if (!s.email || !s.token) {
      redirectToLogin("sign-in-required");
      return;
    }

    // Check plan in memory; do a background refresh to catch lapses
    const cachedPlan = localStorage.getItem(LEARN_PLAN_KEY);
    if (cachedPlan !== "family") {
      // No cached plan — verify with billing API before rendering
      fetch("/api/learn/billing/status", { headers: authHeaders() })
        .then((r) => {
          if (r.status === 401) { redirectToLogin("session-expired"); return null; }
          return r.json().catch(() => null);
        })
        .then((data) => {
          if (!data) return;
          if (data.plan === "family") {
            localStorage.setItem(LEARN_PLAN_KEY, "family");
            // Plan now confirmed — page will load normally on next render cycle
          } else {
            // No active Learn subscription
            window.location.replace("/learn/odyssey/dashboard/activate");
          }
        })
        .catch(() => {
          // Network error — allow through; the API will 401 on individual calls
        });
    }
  });
})();
