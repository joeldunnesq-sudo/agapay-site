/*
 * AGAPAY Learn — mobile gate.
 *
 * Learn is a full desktop planning application (planner, gradebook, print
 * center). On small viewports we do NOT load the ~600KB dashboard bundle;
 * instead we show a lightweight panel directing the user to open Learn on a
 * larger screen, with an escape hatch to continue anyway. On desktop/tablet
 * we dynamic-import the shell exactly as before.
 */
(function () {
  "use strict";

  var SHELL = "/learn/dashboard-shell.js?v=20260706a";
  var PHONE = "(max-width: 820px)";

  function bootShell() {
    import(SHELL).catch(function (err) {
      console.error("AGAPAY Learn failed to load", err);
      var root = document.getElementById("learnRoot");
      if (root) {
        root.innerHTML =
          '<div style="max-width:34rem;margin:12vh auto;padding:0 1.25rem;text-align:center;font-family:\'EB Garamond\',Georgia,serif;color:#061522;">' +
          '<p>We could not load AGAPAY Learn. Please refresh the page.</p></div>';
      }
    });
  }

  function renderInterstitial() {
    var root = document.getElementById("learnRoot");
    if (!root) return;
    var here = window.location.href;
    document.body.setAttribute("data-learn-mobile-gate", "on");
    root.innerHTML =
      '<div style="max-width:34rem;margin:0 auto;padding:14vh 1.5rem 4rem;text-align:center;' +
      "font-family:'EB Garamond',Georgia,serif;color:#061522;\">" +
      '<div style="font-family:\'DM Sans\',system-ui,sans-serif;font-size:.72rem;letter-spacing:.18em;' +
      'text-transform:uppercase;color:#C49C50;font-weight:600;margin-bottom:1rem;">AGAPAY Learn</div>' +
      '<h1 style="font-family:\'Cormorant Garamond\',Georgia,serif;font-weight:600;font-size:2rem;' +
      'line-height:1.15;margin:0 0 1rem;">Best experienced on a larger screen</h1>' +
      '<p style="font-size:1.05rem;line-height:1.6;color:#3a4652;margin:0 0 1.75rem;">' +
      "The homeschool planner, gradebook, and print center are designed for a desktop or tablet. " +
      "Open Learn on a computer to plan your year with room to work.</p>" +
      '<div style="display:flex;align-items:center;gap:.5rem;justify-content:center;flex-wrap:wrap;' +
      'background:#F7F2E8;border:1px solid rgba(6,21,34,.1);border-radius:12px;padding:.75rem 1rem;margin:0 0 1.5rem;">' +
      '<span id="learnGateUrl" style="font-family:\'DM Sans\',system-ui,sans-serif;font-size:.85rem;' +
      'color:#061522;word-break:break-all;">' + escapeHtml(here) + "</span>" +
      '<button id="learnGateCopy" type="button" style="font-family:\'DM Sans\',system-ui,sans-serif;' +
      "font-size:.8rem;font-weight:600;border:0;border-radius:8px;padding:.45rem .85rem;cursor:pointer;" +
      'background:#061522;color:#fff;">Copy link</button></div>' +
      '<div style="display:flex;flex-direction:column;gap:.75rem;align-items:center;">' +
      '<a href="/myagapay/dashboard" style="font-family:\'DM Sans\',system-ui,sans-serif;font-weight:600;' +
      'color:#061522;text-decoration:none;border:1px solid rgba(6,21,34,.2);border-radius:999px;' +
      'padding:.6rem 1.4rem;">Back to My AGAPAY</a>' +
      '<button id="learnGateContinue" type="button" style="font-family:\'DM Sans\',system-ui,sans-serif;' +
      "font-size:.85rem;color:#6b7682;background:none;border:0;cursor:pointer;text-decoration:underline;\">" +
      "Continue on this device anyway</button></div></div>";

    var copyBtn = document.getElementById("learnGateCopy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var done = function () { copyBtn.textContent = "Copied"; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(here).then(done).catch(done);
        } else {
          done();
        }
      });
    }
    var contBtn = document.getElementById("learnGateContinue");
    if (contBtn) {
      contBtn.addEventListener("click", function () {
        document.body.removeAttribute("data-learn-mobile-gate");
        root.innerHTML = "";
        bootShell();
      });
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function start() {
    if (window.matchMedia && window.matchMedia(PHONE).matches) {
      renderInterstitial();
    } else {
      bootShell();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
