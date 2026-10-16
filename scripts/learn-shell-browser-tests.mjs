import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createSeedLearnRepository } from '../src/learn/repository.js';
const repository = createSeedLearnRepository();
const helpers = ['/learn/dashboard-shell-setup-calendar.js', '/learn/dashboard-shell-planner-family.js'];
const browser = await chromium.launch({ headless: true });
try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({
      viewport: phone ? { width: 412, height: 915 } : { width: 1440, height: 1000 },
      serviceWorkers: 'block',
    });
    const requests = [],
      errors = [],
      starts = new Map();
    await context.addInitScript(() => localStorage.setItem('agapayDonorToken', 'synthetic-learn-session'));
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      requests.push({ path: url.pathname, search: url.search, method: request.method() });
      if (url.pathname === '/fixture')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><head></head><body data-learn-page="dashboard"><main id="learnRoot"></main><script src="/learn/mobile-gate.js"></script></body></html>',
        });
      if (url.pathname.startsWith('/api/')) {
        assert.equal(request.headers().authorization, 'Bearer synthetic-learn-session');
        assert.equal(request.method(), 'GET', 'Opening Learn must not write records.');
        if (url.pathname.endsWith('/billing/status')) return route.fulfill({ json: { plan: 'free', printLimit: 3 } });
        if (url.pathname.endsWith('/google-calendar/status'))
          return route.fulfill({ json: { configured: false, connected: false } });
        if (url.pathname.endsWith('/dashboard'))
          return route.fulfill({ json: { setupCompleted: true, dashboard: repository.getDashboard() } });
        return route.fulfill({ json: {} });
      }
      if (helpers.includes(url.pathname)) {
        starts.set(url.pathname, Date.now());
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      try {
        return route.fulfill({
          contentType: /\.m?js$/.test(url.pathname) ? 'text/javascript' : 'text/plain',
          body: await readFile(new URL('../public' + url.pathname, import.meta.url)),
        });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    await page.goto('https://learn.test/fixture');
    if (phone) {
      await page.getByRole('button', { name: 'Continue on this device anyway' }).waitFor();
      assert.equal(
        requests.some((r) => r.path.includes('dashboard-shell')),
        false,
        'Phone interstitial must defer all shell modules.'
      );
      await page.getByRole('button', { name: 'Continue on this device anyway' }).click();
    }
    await page.waitForFunction(
      () => document.querySelector('.learn-product-shell') || document.querySelector('#learnRoot strong')
    );
    assert.equal(
      await page.locator('.learn-product-shell').count(),
      1,
      JSON.stringify({ errors, body: await page.locator('#learnRoot').innerText() })
    );
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#learnRoot').getByText('Unable to load AGAPAY Learn').count(), 0);
    for (const helper of helpers) {
      assert.equal(requests.filter((r) => r.path === helper).length, 1, helper + ' fetched once');
      assert.equal(requests.find((r) => r.path === helper).search, '', 'Preload and import use identical URLs.');
    }
    assert.ok(
      Math.abs(starts.get(helpers[0]) - starts.get(helpers[1])) < 225,
      'Helpers begin fetching together despite synthetic latency.'
    );
    assert.equal(requests.filter((r) => r.path === '/api/learn/dashboard').length, 1);
    await context.close();
  }
  console.log(
    'PASS - Learn authenticated desktop/phone startup, phone deferral, one fetch per helper, parallel latency and read-only loading'
  );
} finally {
  await browser.close();
}
