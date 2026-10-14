import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const script = await readFile(new URL('../public/myagapay/push-notifications.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const markup =
  '<section data-push-notifications><div class="push-notification-actions" aria-busy="true"><button data-push-enable hidden>Enable notifications</button><button data-push-disable hidden>Disable notifications</button></div><p data-push-status></p><p data-push-ios-guidance hidden>Install the app</p></section>';
const errors = [];
try {
  async function setup(options = {}) {
    const page = await browser.newPage({ viewport: { width: 393, height: 873 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(markup);
    await page.evaluate((options) => {
      const state = (window.pushTest = {
        requests: [],
        permissions: 0,
        subscribes: [],
        unsubscribes: 0,
        unauthorized: 0,
        existing: Boolean(options.existing),
        fail: '',
        options,
      });
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: options.ios ? 'iPhone' : 'Android' });
      Object.defineProperty(navigator, 'platform', { configurable: true, value: options.ipad ? 'MacIntel' : 'Linux' });
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: options.ipad ? 5 : 1 });
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: Boolean(options.standalone) });
      const subscription = {
        endpoint: 'https://push.example.test/device',
        toJSON: () => ({ endpoint: 'https://push.example.test/device', keys: { p256dh: 'fixture', auth: 'fixture' } }),
        unsubscribe: async () => {
          state.unsubscribes++;
          state.existing = false;
          return true;
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () => (state.existing ? subscription : null),
          subscribe: async (request) => {
            state.subscribes.push({ visible: request.userVisibleOnly, key: Array.from(request.applicationServerKey) });
            state.existing = true;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: async () => (options.readyFallback ? undefined : registration),
          ready: Promise.resolve(registration),
        },
      });
      Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: {
          permission: options.denied ? 'denied' : 'default',
          requestPermission: async () => {
            state.permissions++;
            return options.permission || 'granted';
          },
        },
      });
      if (options.unsupported) delete window.PushManager;
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer synthetic' }),
        handleUnauthorized: (response) => {
          if (response.status !== 401) return false;
          state.unauthorized++;
          return true;
        },
      };
      window.fetch = async (path, request) => {
        state.requests.push({
          path,
          method: request.method || 'GET',
          headers: request.headers,
          cache: request.cache,
          body: request.body ? JSON.parse(request.body) : null,
        });
        if (options.unauthorized) return new Response('{}', { status: 401 });
        if (state.fail && path.endsWith(state.fail))
          return new Response(JSON.stringify({ error: 'Please retry push' }), { status: 503 });
        return new Response(
          JSON.stringify(
            path.endsWith('/config') ? { configured: !options.unconfigured, publicKey: 'AQID-_8' } : { ok: true }
          ),
          { status: 200 }
        );
      };
    }, options);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    if (options.unauthorized) await page.waitForFunction(() => window.pushTest.unauthorized === 1);
    else await page.waitForFunction(() => document.querySelector('[data-push-status]').textContent !== '');
    return page;
  }
  for (const options of [
    { ios: true },
    { ipad: true },
    { unsupported: true },
    { unconfigured: true },
    { denied: true },
    { unauthorized: true },
    { existing: true },
    { ios: true, standalone: true },
    { readyFallback: true },
  ]) {
    const page = await setup(options);
    const state = await page.evaluate(() => ({
      permissions: window.pushTest.permissions,
      requests: window.pushTest.requests,
      unauthorized: window.pushTest.unauthorized,
    }));
    assert.equal(state.permissions, 0, 'Initialization must never prompt for permission');
    const status = await page.locator('[data-push-status]').textContent();
    if ((options.ios && !options.standalone) || options.ipad) {
      assert.match(status, /Install My AGAPAY/);
      assert.equal(state.requests.length, 0);
      assert.equal(await page.locator('[data-push-ios-guidance]').isVisible(), true);
    } else if (options.unsupported) {
      assert.match(status, /not supported/);
      assert.equal(state.requests.length, 0);
    } else if (options.unconfigured) assert.match(status, /temporarily unavailable/);
    else if (options.denied) {
      assert.match(status, /blocked/);
      assert.equal(await page.locator('[data-push-enable]').isDisabled(), true);
    } else if (options.unauthorized) {
      assert.equal(state.unauthorized, 1);
      assert.equal(await page.locator('[data-push-enable]').isHidden(), true);
    } else if (options.existing) {
      assert.match(status, /enabled/);
      assert.equal(state.requests.at(-1).path, '/api/donor/push/subscribe');
      assert.equal(await page.locator('[data-push-disable]').isVisible(), true);
    } else assert.match(status, /stay off/);
    await page.close();
  }
  const page = await setup();
  await page.locator('[data-push-enable]').click();
  await page.waitForFunction(() => document.querySelector('[data-push-disable]').hidden === false);
  assert.deepEqual(await page.evaluate(() => window.pushTest.subscribes), [
    { visible: true, key: [1, 2, 3, 251, 255] },
  ]);
  assert.equal(await page.evaluate(() => window.pushTest.permissions), 1);
  await page.evaluate(() => {
    window.pushTest.fail = '/unsubscribe';
  });
  await page.locator('[data-push-disable]').click();
  await page.waitForFunction(() => document.querySelector('[data-push-status]').textContent === 'Please retry push');
  assert.equal(
    await page.evaluate(() => window.pushTest.unsubscribes),
    0,
    'Failed server removal must not unsubscribe the browser'
  );
  assert.equal(await page.locator('[data-push-disable]').isDisabled(), false);
  await page.evaluate(() => {
    window.pushTest.fail = '';
  });
  await page.locator('[data-push-disable]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-push-status]').textContent === 'Notifications are off on this device.'
  );
  assert.equal(await page.evaluate(() => window.pushTest.unsubscribes), 1);
  assert.ok(
    await page.evaluate(() =>
      window.pushTest.requests.every(
        (request) => request.headers.Authorization === 'Bearer synthetic' && request.cache === 'no-store'
      )
    )
  );
  await page.close();
  for (const permission of ['denied', 'default']) {
    const page = await setup({ permission });
    await page.locator('[data-push-enable]').click();
    await page.waitForFunction(() => document.querySelector('[data-push-status]').dataset.tone === 'error');
    assert.equal(await page.evaluate(() => window.pushTest.subscribes.length), 0);
    assert.equal(await page.locator('[data-push-enable]').isDisabled(), false);
    await page.close();
  }
  const failed = await setup();
  await failed.evaluate(() => {
    window.pushTest.fail = '/subscribe';
  });
  await failed.locator('[data-push-enable]').click();
  await failed.waitForFunction(() => document.querySelector('[data-push-status]').textContent === 'Please retry push');
  assert.equal(await failed.locator('[data-push-enable]').isDisabled(), false);
  await failed.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - push explicit opt-in, iOS/iPad install guidance, existing subscription sync, readiness fallback, unavailable/expired sessions, VAPID bytes, permission rejection and enable/disable failure handling'
  );
} finally {
  await browser.close();
}
