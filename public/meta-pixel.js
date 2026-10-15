// Generated from src/browser/meta-pixel.ts by npm run build:browser. Do not edit.
(function (window2, document2) {
  'use strict';
  const pixelId = '1065546639329281';
  if (!window2.fbq) {
    const fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    window2.fbq = fbq;
    if (!window2._fbq) window2._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    const script = document2.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document2.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }
  if (!window2.__agapayMetaPixelInitialized) {
    window2.fbq('init', pixelId);
    window2.__agapayMetaPixelInitialized = true;
  }
  if (!window2.__agapayMetaPageViewTracked) {
    window2.fbq('track', 'PageView');
    window2.__agapayMetaPageViewTracked = true;
  }
  window2.trackMetaEvent = function (name, data) {
    try {
      if (typeof window2.fbq !== 'function') return false;
      window2.fbq('trackCustom', name, data || {});
      return true;
    } catch (_error) {
      return false;
    }
  };
  window2.trackMetaStandardEvent = function (name, data) {
    try {
      if (typeof window2.fbq !== 'function') return false;
      window2.fbq('track', name, data || {});
      return true;
    } catch (_error) {
      return false;
    }
  };
})(window, document);
