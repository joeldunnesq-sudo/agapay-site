'use strict';

// Local diagnostics only: never retain raw errors, messages, request bodies,
// headers, storage values, or arbitrary context supplied by callers.
(function installDiagnostics(global) {
  const messages = Object.freeze({
    'dashboard.load': 'Unable to load the dashboard. Please try again.',
    'billing.refresh': 'Unable to refresh billing status. Please try again.',
    'stripe.refresh': 'Unable to refresh Stripe status. Please try again.',
    'browser.error': 'An unexpected error occurred. Please reload and try again.',
    'browser.unhandledrejection': 'An unexpected error occurred. Please reload and try again.',
  });
  const types = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'AbortError']);
  const recent = [];

  function sourceFrames(error) {
    const scripts = new Set(
      Array.from(document.scripts, (script) => {
        const url = new URL(script.src, global.location.origin);
        return url.origin === global.location.origin ? url.pathname : '';
      })
    );
    const stack = error?.stack;
    return (typeof stack === 'string' ? stack : '')
      .slice(0, 16_384)
      .split('\n')
      .slice(1)
      .flatMap((line) => {
        // Keep source locations, not function names or the message at stack[0].
        const frame = line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/);
        if (!frame) return [];
        const url = new URL(frame[1]);
        if (url.origin !== global.location.origin || !scripts.has(url.pathname)) return [];
        return [`${url.pathname}:${frame[2]}:${frame[3]}`];
      })
      .slice(0, 12);
  }

  function report(error, operation) {
    const known = typeof operation === 'string' && Object.hasOwn(messages, operation) ? operation : 'browser.error';
    let message = messages[known];
    try {
      const rawStatus = error?.status;
      const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : null;
      const type = error?.name;
      if (known === 'dashboard.load' && (status === 401 || status === 403)) {
        message = 'Your parish session has expired or access is unavailable. Please sign in again.';
      }
      let frames = sourceFrames(error);
      const stackSource = frames.length ? 'exception' : 'report';
      if (!frames.length) frames = sourceFrames(new Error());
      const entry = Object.freeze({
        operation: known,
        type: types.has(type) ? type : 'Error',
        status,
        time: new Date().toISOString(),
        stackSource,
        frames: Object.freeze(frames),
      });
      recent.push(entry);
      if (recent.length > 20) recent.shift();
      global.console.error(`[AGAPAY diagnostic] ${JSON.stringify(entry)}`);
    } catch {
      // Reporting must not replace the original failure or prevent recovery.
    }
    return message;
  }

  global.AgapayDiagnostics = Object.freeze({ report, recent: () => recent.slice() });
  global.addEventListener('error', (event) => report(event.error, 'browser.error'));
  global.addEventListener('unhandledrejection', (event) => report(event.reason, 'browser.unhandledrejection'));
})(window);
