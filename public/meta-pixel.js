(function (window, document) {
  "use strict";

  const pixelId = "1065546639329281";

  if (!window.fbq) {
    const fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  if (!window.__agapayMetaPixelInitialized) {
    window.fbq("init", pixelId);
    window.__agapayMetaPixelInitialized = true;
  }
  if (!window.__agapayMetaPageViewTracked) {
    window.fbq("track", "PageView");
    window.__agapayMetaPageViewTracked = true;
  }

  window.trackMetaEvent = function (name, data) {
    try {
      if (typeof window.fbq !== "function") return false;
      window.fbq("trackCustom", name, data || {});
      return true;
    } catch (_error) {
      return false;
    }
  };

  window.trackMetaStandardEvent = function (name, data) {
    try {
      if (typeof window.fbq !== "function") return false;
      window.fbq("track", name, data || {});
      return true;
    } catch (_error) {
      return false;
    }
  };
})(window, document);
